package terminal

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/creack/pty"
	"github.com/google/uuid"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/security"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// SSEBroadcaster interface for broadcasting to SSE streams
type SSEBroadcaster interface {
	BroadcastToSSEStreams(sessionID string, data []byte)
}

// OptimizedPTYManager manages terminal PTY sessions with performance optimizations
type OptimizedPTYManager struct {
	sessions      map[string]*OptimizedPTYSession
	mu            sync.RWMutex
	envTemplate   []string // Pre-computed environment template
	sseBroadcaster SSEBroadcaster // For broadcasting to SSE streams
}

// OptimizedPTYSession represents a single PTY session with lazy initialization
type OptimizedPTYSession struct {
	ID        string
	Title     string
	Command   string
	Cwd       string
	Cols      int
	Rows      int
	CreatedAt time.Time
	UpdatedAt time.Time
	Active    bool

	// Lazy-initialized PTY resources
	pty       *os.File
	cmd       *exec.Cmd
	clients   map[string]*types.WSClient
	clientsMu sync.RWMutex
	outputCh  chan []byte
	inputCh   chan []byte
	done      chan struct{}
	mu        sync.RWMutex

	// Initialization state
	initialized int32 // atomic flag for lazy init
	initMu      sync.Mutex
	initErr     error
	
	// Reference to manager for SSE broadcasting
	manager *OptimizedPTYManager
}

// NewOptimizedPTYManager creates a new optimized PTY manager
func NewOptimizedPTYManager() *OptimizedPTYManager {
	// Pre-compute environment template to avoid repeated work
	baseEnv := os.Environ()
	envTemplate := make([]string, len(baseEnv), len(baseEnv)+10) // Extra capacity for PTY vars
	copy(envTemplate, baseEnv)

	return &OptimizedPTYManager{
		sessions:      make(map[string]*OptimizedPTYSession),
		envTemplate:   envTemplate,
		sseBroadcaster: nil, // Will be set later
	}
}

// SetSSEBroadcaster sets the SSE broadcaster for sending output to SSE streams
func (m *OptimizedPTYManager) SetSSEBroadcaster(broadcaster SSEBroadcaster) {
	m.sseBroadcaster = broadcaster
}

// CreateSession creates a new PTY session with lazy initialization
func (m *OptimizedPTYManager) CreateSession(req *types.SessionCreateRequest) (*types.Session, error) {
	// Generate session metadata quickly without PTY creation
	sessionID := uuid.New().String()
	now := time.Now()

	// Set defaults without expensive operations
	command := req.Command
	if command == "" {
		// Use system shell or fallback to zsh on macOS
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/zsh" // fallback for macOS
		}
		command = shell
	}

	cwd := req.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd() // This is fast, just a syscall
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

	// Create session object WITHOUT initializing PTY
	session := &OptimizedPTYSession{
		ID:        sessionID,
		Title:     title,
		Command:   command,
		Cwd:       cwd,
		Cols:      cols,
		Rows:      rows,
		CreatedAt: now,
		UpdatedAt: now,
		Active:    true,
		clients:   make(map[string]*types.WSClient),
		// PTY resources will be initialized lazily
		initialized: 0,
		manager:     m, // Set manager reference for SSE broadcasting
	}

	// Store session quickly with minimal locking
	m.mu.Lock()
	m.sessions[sessionID] = session
	m.mu.Unlock()

	// Return API session immediately
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
		PTY:       nil, // Will be set during lazy init
		Cmd:       nil, // Will be set during lazy init
		Clients:   make([]*types.WSClient, 0),
	}

	log.Printf("Created session %s: %s (lazy init)", sessionID[:8], command)
	return apiSession, nil
}

// ensureInitialized performs lazy PTY initialization when first client connects
func (s *OptimizedPTYSession) ensureInitialized(envTemplate []string) error {
	// Fast path: already initialized
	if atomic.LoadInt32(&s.initialized) == 1 {
		return s.initErr
	}

	// Slow path: initialize PTY
	s.initMu.Lock()
	defer s.initMu.Unlock()

	// Double-check after acquiring lock
	if atomic.LoadInt32(&s.initialized) == 1 {
		return s.initErr
	}

	// Perform PTY initialization
	s.initErr = s.initializePTY(envTemplate)

	// Mark as initialized (even if failed)
	atomic.StoreInt32(&s.initialized, 1)

	return s.initErr
}

// initializePTY performs the actual PTY setup
func (s *OptimizedPTYSession) initializePTY(envTemplate []string) error {
	// Create command with optimized environment handling
	command := s.Command
	if command == "" {
		// Use system shell or fallback to zsh on macOS
		shell := os.Getenv("SHELL")
		if shell == "" {
			shell = "/bin/zsh" // fallback for macOS
		}
		command = shell
	}

	// Determine how to execute the command
	shell := os.Getenv("SHELL")
	if shell == "" {
		// Try to find zsh using which command first, fallback to /bin/sh
		if whichCmd := exec.Command("which", "zsh"); whichCmd != nil {
			if output, err := whichCmd.Output(); err == nil {
				shell = strings.TrimSpace(string(output))
				log.Printf("DEBUG: Found zsh via which: %q", shell)
			} else {
				log.Printf("DEBUG: which zsh failed: %v", err)
				shell = "/bin/sh" // More portable fallback
			}
		} else {
			shell = "/bin/sh" // More portable fallback
		}
	}

	var cmd *exec.Cmd
	// Debug logging
	log.Printf("DEBUG: Optimized PTY creation - command=%q, shell=%q", command, shell)

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
	cmd.Dir = s.Cwd

	// Use pre-computed environment template + PTY-specific vars
	cmd.Env = make([]string, len(envTemplate), len(envTemplate)+3)
	copy(cmd.Env, envTemplate)
	cmd.Env = append(cmd.Env,
		"TERM=xterm-256color",
		fmt.Sprintf("COLUMNS=%d", s.Cols),
		fmt.Sprintf("LINES=%d", s.Rows),
	)

	// Start PTY (this is the expensive operation)
	ptyFile, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(s.Rows),
		Cols: uint16(s.Cols),
	})
	if err != nil {
		return fmt.Errorf("failed to start PTY: %w", err)
	}

	// Initialize session resources
	s.pty = ptyFile
	s.cmd = cmd
	s.outputCh = make(chan []byte, 1000)
	s.inputCh = make(chan []byte, 100)
	s.done = make(chan struct{})

	// Start goroutines for I/O handling
	go s.handleOutput()
	go s.handleInput()
	go s.monitorProcess()
	go s.broadcastOutput()

	log.Printf("Initialized PTY for session %s: %s", s.ID[:8], command)
	return nil
}

// AddClient adds a client and triggers lazy initialization if needed
func (s *OptimizedPTYSession) AddClient(client *types.WSClient, envTemplate []string) error {
	// Ensure PTY is initialized before adding client
	if err := s.ensureInitialized(envTemplate); err != nil {
		return fmt.Errorf("failed to initialize PTY: %w", err)
	}

	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	s.clients[client.ID] = client

	log.Printf("Added client %s to session %s", client.ID[:8], s.ID[:8])
	return nil
}

// GetSession retrieves a session by ID
func (m *OptimizedPTYManager) GetSession(sessionID string) *OptimizedPTYSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionID]
}

// Convert to original PTYSession interface for compatibility
func (s *OptimizedPTYSession) ToPTYSession() *PTYSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Create a PTYSession that delegates to the optimized session
	ptySession := &PTYSession{
		ID:        s.ID,
		PTY:       s.pty,
		Cmd:       s.cmd,
		Title:     s.Title,
		Command:   s.Command,
		Cwd:       s.Cwd,
		Cols:      s.Cols,
		Rows:      s.Rows,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
		Active:    s.Active,
		clients:   s.clients,
		outputCh:  s.outputCh,
		inputCh:   s.inputCh,
		done:      s.done,
	}

	// Store reference to optimized session for delegation
	ptySession.optimizedSession = s

	return ptySession
}

// Implement the same I/O methods as original PTYSession
func (s *OptimizedPTYSession) handleOutput() {
	if s.outputCh == nil || s.pty == nil {
		return
	}
	defer close(s.outputCh)

	reader := bufio.NewReader(s.pty)
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
				data := make([]byte, n)
				copy(data, buffer[:n])

				select {
				case s.outputCh <- data:
					func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()
				default:
					log.Printf("Output channel full for session %s, dropping data", s.ID[:8])
				}
			}
		}
	}
}

func (s *OptimizedPTYSession) handleInput() {
	if s.inputCh == nil || s.pty == nil {
		return
	}

	for {
		select {
		case <-s.done:
			return
		case data := <-s.inputCh:
			if len(data) > 0 {
				_, err := s.pty.Write(data)
				if err != nil {
					log.Printf("Error writing to PTY %s: %v", s.ID[:8], err)
					return
				}
				func() { s.mu.Lock(); s.UpdatedAt = time.Now(); s.mu.Unlock() }()
			}
		}
	}
}

func (s *OptimizedPTYSession) monitorProcess() {
	if s.cmd == nil {
		return
	}

	err := s.cmd.Wait()

	s.mu.Lock()
	s.Active = false
	s.mu.Unlock()

	if err != nil {
		log.Printf("PTY session %s exited with error: %v", s.ID[:8], err)
	} else {
		log.Printf("PTY session %s exited normally", s.ID[:8])
	}

	select {
	case <-s.done:
		// Already closed
	default:
		close(s.done)
	}
}

func (s *OptimizedPTYSession) broadcastOutput() {
	if s.outputCh == nil {
		return
	}

	for {
		select {
		case <-s.done:
			return
		case data, ok := <-s.outputCh:
			if !ok {
				return
			}
			s.BroadcastOutput(data)
		}
	}
}

// BroadcastOutput broadcasts output data to all connected clients and SSE streams
func (s *OptimizedPTYSession) BroadcastOutput(data []byte) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	// Broadcast to WebSocket clients
	for _, client := range s.clients {
		select {
		case client.Send <- data:
		default:
			log.Printf("Client %s send channel full, skipping output", client.ID[:8])
		}
	}
	
	// Broadcast to SSE streams via the manager
	if s.manager != nil && s.manager.sseBroadcaster != nil {
		s.manager.sseBroadcaster.BroadcastToSSEStreams(s.ID, data)
	}
}

// RemoveClient removes a WebSocket client from this session
func (s *OptimizedPTYSession) RemoveClient(clientID string) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()
	delete(s.clients, clientID)
	log.Printf("Removed client %s from session %s", clientID[:8], s.ID[:8])
}

// WriteInput writes input data to the PTY
func (s *OptimizedPTYSession) WriteInput(data []byte) error {
	// Only accept input if PTY is initialized
	if atomic.LoadInt32(&s.initialized) == 0 {
		return fmt.Errorf("session not initialized")
	}

	if s.inputCh == nil {
		return fmt.Errorf("input channel not available")
	}

	select {
	case s.inputCh <- data:
		return nil
	default:
		return fmt.Errorf("input channel full")
	}
}

// Resize resizes the PTY
func (s *OptimizedPTYSession) Resize(cols, rows int) error {
	// Only resize if PTY is initialized
	if atomic.LoadInt32(&s.initialized) == 0 {
		return fmt.Errorf("session not initialized")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.Active {
		return fmt.Errorf("session is not active")
	}

	if s.pty == nil {
		return fmt.Errorf("PTY not available")
	}

	err := pty.Setsize(s.pty, &pty.Winsize{
		Rows: uint16(rows),
		Cols: uint16(cols),
	})
	if err != nil {
		return fmt.Errorf("failed to resize PTY: %w", err)
	}

	s.Cols = cols
	s.Rows = rows
	s.UpdatedAt = time.Now()

	log.Printf("Resized session %s to %dx%d", s.ID[:8], cols, rows)
	return nil
}

// GetClients returns all connected clients
func (s *OptimizedPTYSession) GetClients() []*types.WSClient {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	clients := make([]*types.WSClient, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client)
	}
	return clients
}

// List other required methods for interface compatibility...
func (m *OptimizedPTYManager) ListSessions() []*OptimizedPTYSession {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*OptimizedPTYSession, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	return sessions
}

func (m *OptimizedPTYManager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

func (m *OptimizedPTYManager) CloseSession(sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	session, exists := m.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	err := session.close()
	if err == nil {
		delete(m.sessions, sessionID)
	}
	return err
}

func (s *OptimizedPTYSession) close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.Active {
		return nil
	}

	s.Active = false

	if s.pty != nil {
		s.pty.Close()
	}

	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}

	if s.done != nil {
		select {
		case <-s.done:
		default:
			close(s.done)
		}
	}

	s.clientsMu.Lock()
	for _, client := range s.clients {
		// Only close if not already closed
		select {
		case <-client.Done:
			// Already closed
		default:
			close(client.Done)
		}
	}
	s.clients = make(map[string]*types.WSClient)
	s.clientsMu.Unlock()

	log.Printf("Closed PTY session %s", s.ID[:8])
	return nil
}

func (m *OptimizedPTYManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, session := range m.sessions {
		session.close()
	}
	m.sessions = make(map[string]*OptimizedPTYSession)
}

// GetEnvTemplate returns the pre-computed environment template
func (m *OptimizedPTYManager) GetEnvTemplate() []string {
	return m.envTemplate
}
