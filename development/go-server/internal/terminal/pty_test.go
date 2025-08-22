package terminal

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

func TestPTYManager_CreateSession(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		Command: "echo 'hello world'",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	require.NotNil(t, session)

	// Verify session properties
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "Test Session", session.Title)
	assert.Equal(t, "echo 'hello world'", session.Command)
	assert.Equal(t, 80, session.Cols)
	assert.Equal(t, 24, session.Rows)
	assert.True(t, session.Active)
	assert.NotNil(t, session.PTY)
	assert.NotNil(t, session.Cmd)

	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestPTYManager_CreateSessionWithDefaults(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		// No command - should default to shell
		// No title - should generate one
		// No cols/rows - should use defaults
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)
	require.NotNil(t, session)

	// Verify defaults
	assert.NotEmpty(t, session.ID)
	assert.Contains(t, session.Title, "Terminal")
	assert.Equal(t, 80, session.Cols)
	assert.Equal(t, 24, session.Rows)
	assert.True(t, session.Active)

	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestPTYManager_GetSession(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		Command: "echo 'test'",
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)

	// Test getting existing session
	ptySession := manager.GetSession(session.ID)
	require.NotNil(t, ptySession)
	assert.Equal(t, session.ID, ptySession.ID)

	// Test getting non-existent session
	nonExistent := manager.GetSession("non-existent-id")
	assert.Nil(t, nonExistent)

	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestPTYManager_ListSessions(t *testing.T) {
	manager := NewPTYManager()

	// Initially empty
	sessions := manager.ListSessions()
	assert.Empty(t, sessions)

	// Create a few sessions
	req := &types.SessionCreateRequest{
		Command: "echo 'test'",
	}

	session1, err := manager.CreateSession(req)
	require.NoError(t, err)

	session2, err := manager.CreateSession(req)
	require.NoError(t, err)

	// List should now contain both
	sessions = manager.ListSessions()
	assert.Len(t, sessions, 2)

	// Verify session IDs are present
	ids := make(map[string]bool)
	for _, s := range sessions {
		ids[s.ID] = true
	}
	assert.True(t, ids[session1.ID])
	assert.True(t, ids[session2.ID])

	// Clean up
	err = manager.CloseSession(session1.ID)
	assert.NoError(t, err)
	err = manager.CloseSession(session2.ID)
	assert.NoError(t, err)
}

func TestPTYManager_CloseSession(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		Command: "sleep 10", // Long-running command
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)

	// Verify session exists and is active
	ptySession := manager.GetSession(session.ID)
	require.NotNil(t, ptySession)
	assert.True(t, ptySession.Active)

	// Close the session
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)

	// Give it a moment to clean up
	time.Sleep(100 * time.Millisecond)

	// Session should no longer be active
	ptySession = manager.GetSession(session.ID)
	if ptySession != nil {
		assert.False(t, ptySession.Active)
	}

	// Closing again should return error
	err = manager.CloseSession(session.ID)
	assert.Error(t, err)
}

func TestPTYManager_Count(t *testing.T) {
	manager := NewPTYManager()

	// Initially zero
	assert.Equal(t, 0, manager.Count())

	req := &types.SessionCreateRequest{
		Command: "echo 'test'",
	}

	// Create sessions
	session1, err := manager.CreateSession(req)
	require.NoError(t, err)
	assert.Equal(t, 1, manager.Count())

	session2, err := manager.CreateSession(req)
	require.NoError(t, err)
	assert.Equal(t, 2, manager.Count())

	// Close one
	err = manager.CloseSession(session1.ID)
	assert.NoError(t, err)
	assert.Equal(t, 1, manager.Count())

	// Close the other
	err = manager.CloseSession(session2.ID)
	assert.NoError(t, err)
	assert.Equal(t, 0, manager.Count())
}

func TestPTYSession_WriteInput(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		Command: "cat", // Echo input back
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)

	ptySession := manager.GetSession(session.ID)
	require.NotNil(t, ptySession)

	// Write some input
	testInput := []byte("hello\n")
	err = ptySession.WriteInput(testInput)
	assert.NoError(t, err)

	// Give it time to process
	time.Sleep(100 * time.Millisecond)

	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}

func TestPTYSession_Resize(t *testing.T) {
	manager := NewPTYManager()

	req := &types.SessionCreateRequest{
		Command: "sleep 5",
		Cols:    80,
		Rows:    24,
	}

	session, err := manager.CreateSession(req)
	require.NoError(t, err)

	ptySession := manager.GetSession(session.ID)
	require.NotNil(t, ptySession)

	// Resize the terminal
	err = ptySession.Resize(100, 30)
	assert.NoError(t, err)

	// Verify new dimensions
	assert.Equal(t, 100, ptySession.Cols)
	assert.Equal(t, 30, ptySession.Rows)

	// Clean up
	err = manager.CloseSession(session.ID)
	assert.NoError(t, err)
}
