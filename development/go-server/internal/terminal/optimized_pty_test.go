package terminal

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

func TestOptimizedPTYManager_CreateSession(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "echo 'hello world'",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	require.NotNil(t, session)
	
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "Test Session", session.Title)
	assert.Equal(t, "echo 'hello world'", session.Command)
	assert.Equal(t, 80, session.Cols)
	assert.Equal(t, 24, session.Rows)
	assert.True(t, session.Active)
	assert.Nil(t, session.PTY) // PTY should be nil until lazy initialization
	assert.Nil(t, session.Cmd) // Cmd should be nil until lazy initialization
	
	// Verify session is stored in manager
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	assert.Equal(t, session.ID, optimizedSession.ID)
	
	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYManager_CreateSessionWithDefaults(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	// Test with minimal request (should use defaults)
	req := &types.SessionCreateRequest{}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	require.NotNil(t, session)
	
	assert.NotEmpty(t, session.ID)
	assert.NotEmpty(t, session.Title)
	assert.Equal(t, "/usr/bin/zsh", session.Command) // Default command
	assert.Equal(t, 80, session.Cols) // Default cols
	assert.Equal(t, 24, session.Rows) // Default rows
	assert.True(t, session.Active)
	
	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYManager_LazyInitialization(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "cat", // Long-running command for testing
		Title:   "Lazy Init Test",
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Initially should not be initialized
	assert.Equal(t, int32(0), optimizedSession.initialized)
	assert.Nil(t, optimizedSession.pty)
	assert.Nil(t, optimizedSession.cmd)
	
	// Create a mock WebSocket client
	client := &types.WSClient{
		ID:        "test-client-123",
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
	}
	
	// Adding client should trigger lazy initialization
	err = optimizedSession.AddClient(client, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	// Now should be initialized
	assert.Equal(t, int32(1), optimizedSession.initialized)
	assert.NotNil(t, optimizedSession.pty)
	assert.NotNil(t, optimizedSession.cmd)
	assert.NotNil(t, optimizedSession.outputCh)
	assert.NotNil(t, optimizedSession.inputCh)
	
	// Verify client was added
	clients := optimizedSession.GetClients()
	assert.Len(t, clients, 1)
	assert.Equal(t, client.ID, clients[0].ID)
	
	// Clean up
	close(client.Done)
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYManager_ToPTYSession(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "sleep 2",
		Title:   "Conversion Test",
		Cols:    100,
		Rows:    30,
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Convert to PTYSession
	ptySession := optimizedSession.ToPTYSession()
	require.NotNil(t, ptySession)
	
	// Verify conversion
	assert.Equal(t, optimizedSession.ID, ptySession.ID)
	assert.Equal(t, optimizedSession.Title, ptySession.Title)
	assert.Equal(t, optimizedSession.Command, ptySession.Command)
	assert.Equal(t, optimizedSession.Cols, ptySession.Cols)
	assert.Equal(t, optimizedSession.Rows, ptySession.Rows)
	assert.Equal(t, optimizedSession.Active, ptySession.Active)
	
	// Verify optimized session reference is set
	assert.Equal(t, optimizedSession, ptySession.optimizedSession)
	
	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYSession_WriteInput(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "cat", // Echo back input
		Title:   "Input Test",
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Writing input before initialization should fail
	err = optimizedSession.WriteInput([]byte("test\n"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "session not initialized")
	
	// Initialize by adding a client
	client := &types.WSClient{
		ID:        "test-client-input",
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
	}
	
	err = optimizedSession.AddClient(client, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	// Now writing input should work
	err = optimizedSession.WriteInput([]byte("hello\n"))
	assert.NoError(t, err)
	
	// Clean up
	close(client.Done)
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYSession_Resize(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "sleep 5",
		Title:   "Resize Test",
		Cols:    80,
		Rows:    24,
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Resize before initialization should fail
	err = optimizedSession.Resize(100, 30)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "session not initialized")
	
	// Initialize by adding a client
	client := &types.WSClient{
		ID:        "test-client-resize",
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
	}
	
	err = optimizedSession.AddClient(client, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	// Now resize should work
	err = optimizedSession.Resize(100, 30)
	assert.NoError(t, err)
	
	// Verify dimensions were updated
	assert.Equal(t, 100, optimizedSession.Cols)
	assert.Equal(t, 30, optimizedSession.Rows)
	
	// Clean up
	close(client.Done)
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYSession_ResizeViaPTYSession(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "sleep 5",
		Title:   "PTY Resize Test",
		Cols:    80,
		Rows:    24,
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Initialize session
	client := &types.WSClient{
		ID:        "test-client-pty-resize",
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
	}
	
	err = optimizedSession.AddClient(client, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	// Get PTYSession and test resize delegation
	ptySession := optimizedSession.ToPTYSession()
	require.NotNil(t, ptySession)
	
	// Resize via PTYSession should delegate to optimized session
	err = ptySession.Resize(120, 35)
	assert.NoError(t, err)
	
	// Verify both sessions reflect the change
	assert.Equal(t, 120, optimizedSession.Cols)
	assert.Equal(t, 35, optimizedSession.Rows)
	assert.Equal(t, 120, ptySession.Cols)
	assert.Equal(t, 35, ptySession.Rows)
	
	// Clean up
	close(client.Done)
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYManager_ListSessions(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	// Create multiple sessions
	req1 := &types.SessionCreateRequest{Command: "echo 'test1'", Title: "Test 1"}
	req2 := &types.SessionCreateRequest{Command: "echo 'test2'", Title: "Test 2"}
	
	session1, err := manager.CreateSession(req1)
	require.NoError(t, err)
	
	session2, err := manager.CreateSession(req2)
	require.NoError(t, err)
	
	// List sessions
	sessions := manager.ListSessions()
	assert.Len(t, sessions, 2)
	
	// Verify session IDs
	sessionIDs := []string{sessions[0].ID, sessions[1].ID}
	assert.Contains(t, sessionIDs, session1.ID)
	assert.Contains(t, sessionIDs, session2.ID)
	
	// Clean up
	err = manager.CloseSession(session1.ID)
	assert.NoError(t, err)
	err = manager.CloseSession(session2.ID)
	assert.NoError(t, err)
	
	// Verify cleanup
	assert.Equal(t, 0, manager.Count())
}

func TestOptimizedPTYManager_CloseAll(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	// Create multiple sessions
	req1 := &types.SessionCreateRequest{Command: "sleep 10"}
	req2 := &types.SessionCreateRequest{Command: "sleep 10"}
	
	_, err := manager.CreateSession(req1)
	require.NoError(t, err)
	
	_, err = manager.CreateSession(req2)
	require.NoError(t, err)
	
	assert.Equal(t, 2, manager.Count())
	
	// Close all sessions
	manager.CloseAll()
	
	// Verify all sessions are closed
	assert.Equal(t, 0, manager.Count())
	assert.Len(t, manager.ListSessions(), 0)
}

func TestOptimizedPTYSession_ClientManagement(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	req := &types.SessionCreateRequest{
		Command: "cat",
		Title:   "Client Management Test",
	}
	
	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	
	optimizedSession := manager.GetSession(session.ID)
	require.NotNil(t, optimizedSession)
	
	// Create clients
	client1 := &types.WSClient{
		ID:        "client-1",
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
	}
	
	client2 := &types.WSClient{
		ID:        "client-2", 
		SessionID: session.ID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
	}
	
	// Add clients
	err = optimizedSession.AddClient(client1, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	err = optimizedSession.AddClient(client2, manager.GetEnvTemplate())
	require.NoError(t, err)
	
	// Verify clients
	clients := optimizedSession.GetClients()
	assert.Len(t, clients, 2)
	
	clientIDs := []string{clients[0].ID, clients[1].ID}
	assert.Contains(t, clientIDs, "client-1")
	assert.Contains(t, clientIDs, "client-2")
	
	// Remove one client
	optimizedSession.RemoveClient("client-1")
	
	clients = optimizedSession.GetClients()
	assert.Len(t, clients, 1)
	assert.Equal(t, "client-2", clients[0].ID)
	
	// Clean up
	close(client1.Done)
	close(client2.Done)
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestOptimizedPTYManager_Performance(t *testing.T) {
	manager := NewOptimizedPTYManager()
	
	// Measure time to create sessions (should be very fast due to lazy init)
	start := time.Now()
	
	var sessions []*types.Session
	for i := 0; i < 10; i++ {
		req := &types.SessionCreateRequest{
			Command: "echo 'performance test'",
			Title:   "Perf Test",
		}
		
		session, err := manager.CreateSession(req)
		require.NoError(t, err)
		sessions = append(sessions, session)
	}
	
	duration := time.Since(start)
	
	// Creating 10 sessions should be very fast (under 10ms)
	assert.Less(t, duration, 10*time.Millisecond, "Session creation should be very fast with lazy initialization")
	
	// Clean up all sessions
	for _, session := range sessions {
		err := manager.CloseSession(session.ID)
		assert.NoError(t, err)
	}
}
