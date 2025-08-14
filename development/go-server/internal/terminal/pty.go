package terminal

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/google/uuid"

	"github.com/ferg-cod3s/vibetunnel/go-server/internal/security"
	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

// PTYManager manages terminal PTY sessions
type PTYManager struct {
	sessions map[string]*PTYSession
	mu       sync.RWMutex
}

// PTYSession represents a single PTY session
type PTYSession struct {
	ID        string
	PTY       *os.File
	Cmd       *exec.Cmd
	Title     string
	Command   string
	Cwd       string
	Cols      int
	Rows      int
	CreatedAt time.Time
	UpdatedAt time.Time
	Active    bool
	clients   map[string]*types.WSClient
	clientsMu sync.RWMutex
	outputCh  chan []byte
	inputCh   chan []byte
	done      chan struct{}
	mu        sync.RWMutex

	// Reference to optimized session for delegation (if created from optimized manager)
	optimizedSession *OptimizedPTYSession
}

// NewPTYManager creates a new PTY manager
func NewPTYManager() *PTYManager {
	return &PTYManager{
		sessions: make(map[string]*PTYSession),
	}
}

// CreateSession creates a new PTY session
func (m *PTYManager) CreateSession(req *types.SessionCreateRequest) (*types.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Generate unique session ID
	sessionID := uuid.New().String()

	// Set defaults
	command := req.Command
	if command == "" {
		// Default to user's shell
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/zsh" // fallback for macOS
		}
		command = shell
	}

	cwd := req.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd() // fallback to current directory
	}

	cols := req.Cols
	if cols == 0 {
		cols = 80
	}

	rows := req.Rows
	if rows == 0 {
		rows = 24
	}

	title := req.Title
	if title == "" {
		title = fmt.Sprintf("Terminal %s", sessionID[:8])
	}

	// Sanitize inputs for security
	title, titleValid := security.SanitizeTitleAndValidate(title)
	if !titleValid {
		return nil, fmt.Errorf("invalid characters in title")
	}

	// Create command - use the detected shell or fallback to zsh
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh" // fallback for macOS
	}

	var cmd *exec.Cmd
	// Debug logging
	log.Printf("DEBUG: PTY creation - command=%q, shell=%q", command, shell)

	// If command is a shell path or shell name, run shell directly; otherwise use shell -c
	if command == shell || command == "/bin/zsh" || command == "/bin/bash" || command == "/usr/bin/zsh" || command == "zsh" || command == "bash" {
		// Run shell directly without -c, use full shell path
		log.Printf("DEBUG: Running shell directly: %q", shell)
		cmd = exec.Command(shell)
	} else {
		// Run command through shell
		log.Printf("DEBUG: Running command through shell: %q -c %q", shell, command)
		cmd = exec.Command(shell, "-c", command)
	}
	cmd.Dir = cwd

	// Set environment variables
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("TERM=xterm-256color"),
		fmt.Sprintf("COLUMNS=%d", cols),
		fmt.Sprintf("LINES=%d", rows),
	)

	// Start PTY
	ptyFile, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start PTY: %w", err)
	}

	now := time.Now()
	session := &PTYSession{
		ID:        sessionID,
		PTY:       ptyFile,
		Cmd:       cmd,
		Title:     title,
		Command:   command,
		Cwd:       cwd,
		Cols:      cols,
		Rows:      rows,
		CreatedAt: now,
		UpdatedAt: now,
		Active:    true,
		clients:   make(map[string]*types.WSClient),
		outputCh:  make(chan []byte, 1000), // Buffered channel for output
		inputCh:   make(chan []byte, 100),  // Buffered channel for input
		done:      make(chan struct{}),
	}

	// Start goroutines to handle I/O
	go session.handleOutput()
	go session.handleInput()
	go session.monitorProcess()
	go session.broadcastOutput()

	m.sessions[sessionID] = session

	// Convert to API session type
	apiSession := &types.Session{
		ID:        sessionID,
		Title:     title,
		Command:   command,
		Cwd:       cwd,
		Cols:      cols,
		Rows:      rows,
		CreatedAt: now,
		UpdatedAt: now,
		Active:    true,
		PTY:       ptyFile,
		Cmd:       cmd,
		Clients:   make([]*types.WSClient, 0),
	}

	log.Printf("Created PTY session %s: %s", sessionID[:8], command)
	return apiSession, nil
}

// GetSession retrieves a session by ID
func (m *PTYManager) GetSession(sessionID string) *PTYSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionID]
}

// ListSessions returns all active sessions
func (m *PTYManager) ListSessions() []*PTYSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*PTYSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	return sessions
}

// CloseSession closes a session by ID
func (m *PTYManager) CloseSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	err := session.close()
	if err == nil {
		// Remove from manager's map
		delete(m.sessions, sessionID)
	}
	return err
}

// CloseAll closes all sessions
func (m *PTYManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, session := range m.sessions {
		session.close()
	}
	m.sessions = make(map[string]*PTYSession)
}

// Count returns the number of active sessions
func (m *PTYManager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// handleOutput reads from PTY and broadcasts to all connected clients
func (s *PTYSession) handleOutput() {
	defer close(s.outputCh)

	reader := bufio.NewReader(s.PTY)
	buffer := make([]byte, 4096)

	for {
		select {
		case <-s.done:
			return
		default:
			n, err := reader.Read(buffer)
			if err != nil {
				if err != io.EOF {
					log.Printf("Error reading from PTY %s: %v", s.ID[:8], err)
				}
				return
			}

			if n > 0 {
				// Copy the data before sending to channel
				data := make([]byte, n)
				copy(data, buffer[:n])

				select {
				case s.outputCh <- data:
					func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()
				default:
					// Channel is full, skip this data to prevent blocking
					log.Printf("Output channel full for session %s, dropping data", s.ID[:8])
				}
			}
		}
	}
}

// handleInput processes input from WebSocket clients and writes to PTY
func (s *PTYSession) handleInput() {
	for {
		select {
		case <-s.done:
			return
		case data := <-s.inputCh:
			if len(data) > 0 {
				_, err := s.PTY.Write(data)
				if err != nil {
					log.Printf("Error writing to PTY %s: %v", s.ID[:8], err)
					return
				}
				func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()
			}
		}
	}
}

// monitorProcess monitors the underlying process and cleans up when it exits
func (s *PTYSession) monitorProcess() {
	// Wait for process to exit
	err := s.Cmd.Wait()

	s.mu.Lock()
	s.Active = false
	s.mu.Unlock()

	if err != nil {
		log.Printf("PTY session %s exited with error: %v", s.ID[:8], err)
	} else {
		log.Printf("PTY session %s exited normally", s.ID[:8])
	}

	// Signal cleanup (check if already closed)
	select {
	case <-s.done:
		// Already closed
	default:
		close(s.done)
	}
}

// WriteInput writes input data to the PTY
func (s *PTYSession) WriteInput(data []byte) error {
	select {
	case s.inputCh <- data:
		return nil
	default:
		return fmt.Errorf("input channel full")
	}
}

// AddClient adds a WebSocket client to this session
func (s *PTYSession) AddClient(client *types.WSClient) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	s.clients[client.ID] = client
	log.Printf("Added client %s to session %s", client.ID[:8], s.ID[:8])
}

// RemoveClient removes a WebSocket client from this session
func (s *PTYSession) RemoveClient(clientID string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	delete(s.clients, clientID)
	log.Printf("Removed client %s from session %s", clientID[:8], s.ID[:8])
}

// GetClients returns all connected clients
func (s *PTYSession) GetClients() []*types.WSClient {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	clients := make([]*types.WSClient, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client)
	}
	return clients
}

// BroadcastOutput broadcasts output data to all connected clients
func (s *PTYSession) BroadcastOutput(data []byte) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	for _, client := range s.clients {
		select {
		case client.Send <- data:
		default:
			// Client's send channel is full, skip
			log.Printf("Client %s send channel full, skipping output", client.ID[:8])
		}
	}
}

// broadcastOutput continuously reads from output channel and broadcasts to clients
func (s *PTYSession) broadcastOutput() {
	for {
		select {
		case <-s.done:
			return
		case data, ok := <-s.outputCh:
			if !ok {
				// Output channel closed
				return
			}
			// Broadcast to all connected clients
			s.BroadcastOutput(data)
		}
	}
}

// Resize resizes the PTY
func (s *PTYSession) Resize(cols, rows int) error {
	// If this PTYSession was created from an optimized session, delegate to it
	if s.optimizedSession != nil {
		err := s.optimizedSession.Resize(cols, rows)
		if err == nil {
			// Update our own fields to reflect the change
			s.mu.Lock()
			s.Cols = cols
			s.Rows = rows
			func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()
			s.mu.Unlock()
		}
		return err
	}

	// Original resize logic for non-optimized sessions
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.Active {
		return fmt.Errorf("session is not active")
	}

	err := pty.Setsize(s.PTY, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	s.Cols = cols
	s.Rows = rows
	func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()

	log.Printf("Resized session %s to %dx%d", s.ID[:8], cols, rows)
	return nil
}

// close closes the PTY session
func (s *PTYSession) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.Active {
		return nil // Already closed
	}

	s.Active = false

	// Close PTY file
	if s.PTY != nil {
		s.PTY.Close()
	}

	// Kill process if still running
	if s.Cmd != nil && s.Cmd.Process != nil {
		s.Cmd.Process.Kill()
	}

	// Signal goroutines to stop
	select {
	case <-s.done:
		// Already closed
	default:
		close(s.done)
	}

	// Disconnect all clients
	s.clientsMu.Lock()
	for _, client := range s.clients {
		close(client.Done)
	}
	s.clients = make(map[string]*types.WSClient)
	s.clientsMu.Unlock()

	log.Printf("Closed PTY session %s", s.ID[:8])
	return nil
}
