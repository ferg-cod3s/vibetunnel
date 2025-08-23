package persistence

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

func TestFileStore(t *testing.T) {
	// Create temporary directory for tests
	tempDir, err := os.MkdirTemp("", "tunnelforge_sessions_test")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	store, err := NewFileStore(tempDir)
	require.NoError(t, err)

	// Test session
	testSession := &types.Session{
		ID:        "test-session-123",
		Title:     "Test Session",
		Command:   "bash",
		Cwd:       "/tmp",
		Cols:      80,
		Rows:      24,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Active:    true,
	}

	t.Run("SaveSession", func(t *testing.T) {
		err := store.SaveSession(testSession)
		assert.NoError(t, err)

		// Verify file exists
		filePath := filepath.Join(tempDir, "test-session-123.json")
		_, err = os.Stat(filePath)
		assert.NoError(t, err)
	})

	t.Run("LoadSession", func(t *testing.T) {
		loadedSession, err := store.LoadSession("test-session-123")
		require.NoError(t, err)
		require.NotNil(t, loadedSession)

		assert.Equal(t, testSession.ID, loadedSession.ID)
		assert.Equal(t, testSession.Title, loadedSession.Title)
		assert.Equal(t, testSession.Command, loadedSession.Command)
		assert.Equal(t, testSession.Cwd, loadedSession.Cwd)
		assert.Equal(t, testSession.Cols, loadedSession.Cols)
		assert.Equal(t, testSession.Rows, loadedSession.Rows)
		assert.Equal(t, testSession.Active, loadedSession.Active)

		// Timestamps should be approximately equal (within 1 second)
		assert.WithinDuration(t, testSession.CreatedAt, loadedSession.CreatedAt, time.Second)
		assert.WithinDuration(t, testSession.UpdatedAt, loadedSession.UpdatedAt, time.Second)

		// Runtime fields should be reset
		assert.Nil(t, loadedSession.PTY)
		assert.Nil(t, loadedSession.Cmd)
		assert.NotNil(t, loadedSession.Clients)
		assert.Len(t, loadedSession.Clients, 0)
	})

	t.Run("LoadNonExistentSession", func(t *testing.T) {
		session, err := store.LoadSession("non-existent")
		assert.NoError(t, err)
		assert.Nil(t, session)
	})

	t.Run("LoadAllSessions", func(t *testing.T) {
		// Add another session
		testSession2 := &types.Session{
			ID:        "test-session-456",
			Title:     "Test Session 2",
			Command:   "zsh",
			Cwd:       "/home",
			Cols:      120,
			Rows:      30,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
			Active:    false,
		}
		err := store.SaveSession(testSession2)
		require.NoError(t, err)

		sessions, err := store.LoadAllSessions()
		require.NoError(t, err)
		assert.Len(t, sessions, 2)

		// Check that both sessions are present
		sessionIDs := make(map[string]bool)
		for _, session := range sessions {
			sessionIDs[session.ID] = true
		}
		assert.True(t, sessionIDs["test-session-123"])
		assert.True(t, sessionIDs["test-session-456"])
	})

	t.Run("DeleteSession", func(t *testing.T) {
		err := store.DeleteSession("test-session-123")
		assert.NoError(t, err)

		// Verify file is deleted
		filePath := filepath.Join(tempDir, "test-session-123.json")
		_, err = os.Stat(filePath)
		assert.True(t, os.IsNotExist(err))

		// Verify session cannot be loaded
		session, err := store.LoadSession("test-session-123")
		assert.NoError(t, err)
		assert.Nil(t, session)
	})

	t.Run("ClearAll", func(t *testing.T) {
		err := store.ClearAll()
		assert.NoError(t, err)

		sessions, err := store.LoadAllSessions()
		assert.NoError(t, err)
		assert.Len(t, sessions, 0)
	})

	t.Run("SaveNilSession", func(t *testing.T) {
		err := store.SaveSession(nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "session cannot be nil")
	})

	t.Run("Close", func(t *testing.T) {
		err := store.Close()
		assert.NoError(t, err)
	})
}

func TestFileStoreWithInvalidDirectory(t *testing.T) {
	// Try to create store in a location where we can't create directories
	store, err := NewFileStore("/root/impossible/directory/sessions")
	assert.Error(t, err)
	assert.Nil(t, store)
}