package session

import (
	"fmt"
	"sync"

	"github.com/ferg-cod3s/vibetunnel/go-server/internal/terminal"
	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

type Manager struct {
	ptyManager    *terminal.PTYManager
	optPtyManager *terminal.OptimizedPTYManager
	useOptimized  bool
	sseStreams    map[string][]chan []byte
	sseStreamsMu  sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		ptyManager:    terminal.NewPTYManager(),
		optPtyManager: terminal.NewOptimizedPTYManager(),
		useOptimized:  true, // Enable optimizations by default
		sseStreams:    make(map[string][]chan []byte),
	}
}

func (m *Manager) Create(req *types.SessionCreateRequest) (*types.Session, error) {
	if m.useOptimized {
		// Use optimized manager for fast session creation
		return m.optPtyManager.CreateSession(req)
	}
	// Fallback to original manager
	return m.ptyManager.CreateSession(req)
}

func (m *Manager) Get(id string) *types.Session {
	if m.useOptimized {
		optSession := m.optPtyManager.GetSession(id)
		if optSession == nil {
			return nil
		}
		// Convert OptimizedPTYSession to types.Session
		return &types.Session{
			ID:        optSession.ID,
			Title:     optSession.Title,
			Command:   optSession.Command,
			Cwd:       optSession.Cwd,
			Cols:      optSession.Cols,
			Rows:      optSession.Rows,
			CreatedAt: optSession.CreatedAt,
			UpdatedAt: optSession.UpdatedAt,
			Active:    optSession.Active,
			PTY:       nil,                        // Set during lazy init
			Cmd:       nil,                        // Set during lazy init
			Clients:   make([]*types.WSClient, 0), // Will be populated when initialized
		}
	}

	// Fallback to original manager
	ptySession := m.ptyManager.GetSession(id)
	if ptySession == nil {
		return nil
	}

	// Convert PTYSession to types.Session
	return &types.Session{
		ID:        ptySession.ID,
		Title:     ptySession.Title,
		Command:   ptySession.Command,
		Cwd:       ptySession.Cwd,
		Cols:      ptySession.Cols,
		Rows:      ptySession.Rows,
		CreatedAt: ptySession.CreatedAt,
		UpdatedAt: ptySession.UpdatedAt,
		Active:    ptySession.Active,
		PTY:       ptySession.PTY,
		Cmd:       ptySession.Cmd,
		Clients:   ptySession.GetClients(),
	}
}

func (m *Manager) List() []*types.Session {
	if m.useOptimized {
		// List optimized sessions
		optSessions := m.optPtyManager.ListSessions()
		sessions := make([]*types.Session, 0, len(optSessions))

		for _, optSession := range optSessions {
			sessions = append(sessions, &types.Session{
				ID:        optSession.ID,
				Title:     optSession.Title,
				Command:   optSession.Command,
				Cwd:       optSession.Cwd,
				Cols:      optSession.Cols,
				Rows:      optSession.Rows,
				CreatedAt: optSession.CreatedAt,
				UpdatedAt: optSession.UpdatedAt,
				Active:    optSession.Active,
				PTY:       nil,                        // Set during lazy init
				Cmd:       nil,                        // Set during lazy init
				Clients:   make([]*types.WSClient, 0), // Will be populated when initialized
			})
		}

		return sessions
	}

	// Fallback to original manager
	ptySessions := m.ptyManager.ListSessions()
	sessions := make([]*types.Session, 0, len(ptySessions))

	for _, ptySession := range ptySessions {
		sessions = append(sessions, &types.Session{
			ID:        ptySession.ID,
			Title:     ptySession.Title,
			Command:   ptySession.Command,
			Cwd:       ptySession.Cwd,
			Cols:      ptySession.Cols,
			Rows:      ptySession.Rows,
			CreatedAt: ptySession.CreatedAt,
			UpdatedAt: ptySession.UpdatedAt,
			Active:    ptySession.Active,
			PTY:       ptySession.PTY,
			Cmd:       ptySession.Cmd,
			Clients:   ptySession.GetClients(),
		})
	}

	return sessions
}

func (m *Manager) Close(id string) error {
	if m.useOptimized {
		return m.optPtyManager.CloseSession(id)
	}
	return m.ptyManager.CloseSession(id)
}

func (m *Manager) CloseAll() {
	if m.useOptimized {
		m.optPtyManager.CloseAll()
	} else {
		m.ptyManager.CloseAll()
	}
}

func (m *Manager) Count() int {
	if m.useOptimized {
		return m.optPtyManager.Count()
	}
	return m.ptyManager.Count()
}

// AddClientToSession adds a WebSocket client to a session, triggering lazy initialization if needed
func (m *Manager) AddClientToSession(sessionID string, client *types.WSClient) error {
	if m.useOptimized {
		// For optimized sessions, trigger lazy initialization on first client
		optSession := m.optPtyManager.GetSession(sessionID)
		if optSession == nil {
			return fmt.Errorf("session not found: %s", sessionID)
		}

		// This will trigger lazy initialization if needed
		return optSession.AddClient(client, m.optPtyManager.GetEnvTemplate())
	}

	// Fallback to original manager
	ptySession := m.ptyManager.GetSession(sessionID)
	if ptySession == nil {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	ptySession.AddClient(client)
	return nil
}

// GetPTYSession returns the underlying PTY session for WebSocket handling
func (m *Manager) GetPTYSession(id string) *terminal.PTYSession {
	if m.useOptimized {
		// For optimized sessions, we need to convert or initialize
		optSession := m.optPtyManager.GetSession(id)
		if optSession == nil {
			return nil
		}
		// Convert optimized session to regular PTY session
		return optSession.ToPTYSession()
	}
	return m.ptyManager.GetSession(id)
}

// Resize resizes a terminal session
func (m *Manager) Resize(sessionID string, cols, rows int) error {
	if m.useOptimized {
		optSession := m.optPtyManager.GetSession(sessionID)
		if optSession == nil {
			return fmt.Errorf("session not found: %s", sessionID)
		}

		// Ensure session is initialized by adding and immediately removing a dummy client
		dummyClient := &types.WSClient{ID: "dummy-client-12345678", SessionID: sessionID}
		if err := optSession.AddClient(dummyClient, m.optPtyManager.GetEnvTemplate()); err != nil {
			return fmt.Errorf("failed to initialize session: %v", err)
		}
		// Remove the dummy client immediately
		optSession.RemoveClient("dummy-client-12345678")

		return optSession.Resize(cols, rows)
	}

	ptySession := m.ptyManager.GetSession(sessionID)
	if ptySession == nil {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	return ptySession.Resize(cols, rows)
}

// WriteInput writes input to a terminal session
func (m *Manager) WriteInput(sessionID string, input string) error {
	if m.useOptimized {
		optSession := m.optPtyManager.GetSession(sessionID)
		if optSession == nil {
			return fmt.Errorf("session not found: %s", sessionID)
		}

		// Ensure session is initialized by adding and immediately removing a dummy client
		dummyClient := &types.WSClient{ID: "dummy-client-12345678", SessionID: sessionID}
		if err := optSession.AddClient(dummyClient, m.optPtyManager.GetEnvTemplate()); err != nil {
			return fmt.Errorf("failed to initialize session: %v", err)
		}
		// Remove the dummy client immediately
		optSession.RemoveClient("dummy-client-12345678")

		return optSession.WriteInput([]byte(input))
	}

	ptySession := m.ptyManager.GetSession(sessionID)
	if ptySession == nil {
		return fmt.Errorf("session not found: %s", sessionID)
	}
	return ptySession.WriteInput([]byte(input))
}

// AddSSEStream adds a Server-Sent Events stream for a session
func (m *Manager) AddSSEStream(sessionID string, stream chan []byte) error {
	m.sseStreamsMu.Lock()
	defer m.sseStreamsMu.Unlock()

	if m.sseStreams[sessionID] == nil {
		m.sseStreams[sessionID] = make([]chan []byte, 0)
	}
	m.sseStreams[sessionID] = append(m.sseStreams[sessionID], stream)
	return nil
}

// RemoveSSEStream removes a Server-Sent Events stream for a session
func (m *Manager) RemoveSSEStream(sessionID string, stream chan []byte) {
	m.sseStreamsMu.Lock()
	defer m.sseStreamsMu.Unlock()

	streams := m.sseStreams[sessionID]
	for i, s := range streams {
		if s == stream {
			m.sseStreams[sessionID] = append(streams[:i], streams[i+1:]...)
			break
		}
	}

	if len(m.sseStreams[sessionID]) == 0 {
		delete(m.sseStreams, sessionID)
	}
}

// BroadcastToSSEStreams broadcasts data to all SSE streams for a session
func (m *Manager) BroadcastToSSEStreams(sessionID string, data []byte) {
	m.sseStreamsMu.RLock()
	defer m.sseStreamsMu.RUnlock()

	streams := m.sseStreams[sessionID]
	for _, stream := range streams {
		select {
		case stream <- data:
		default:
			// Drop message if channel is full
		}
	}
}
