package integration

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/persistence"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// TestSessionPersistenceIntegration tests end-to-end session persistence
func TestSessionPersistenceIntegration(t *testing.T) {
	// Create temporary directory for persistence
	tempDir, err := os.MkdirTemp("", "tunnelforge_persistence_integration_test")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create file store
	fileStore, err := persistence.NewFileStore(tempDir)
	require.NoError(t, err)

	// Create persistence service (disable auto-save for controlled testing)
	persistenceService := persistence.NewService(fileStore, false, time.Minute)
	persistenceService.Start()
	defer persistenceService.Stop()

	// Create session manager with persistence
	sessionManager := session.NewManagerWithPersistence(persistenceService)

	// Create a test session
	req := &types.SessionCreateRequest{
		Command: "bash",
		Title:   "Integration Test Session",
		Cwd:     "/tmp",
		Cols:    80,
		Rows:    24,
	}

	t.Run("create_and_persist_session", func(t *testing.T) {
		createdSession, err := sessionManager.Create(req)
		require.NoError(t, err)
		require.NotNil(t, createdSession)

		// Verify session was created
		assert.NotEmpty(t, createdSession.ID)
		assert.Equal(t, "Integration Test Session", createdSession.Title)
		assert.Equal(t, "bash", createdSession.Command)
		assert.Equal(t, "/tmp", createdSession.Cwd)
		assert.Equal(t, 80, createdSession.Cols)
		assert.Equal(t, 24, createdSession.Rows)
		assert.True(t, createdSession.Active)

		// Verify session can be retrieved
		retrievedSession := sessionManager.Get(createdSession.ID)
		require.NotNil(t, retrievedSession)
		assert.Equal(t, createdSession.ID, retrievedSession.ID)

		// Verify session was persisted
		persistedSession, err := persistenceService.LoadSession(createdSession.ID)
		require.NoError(t, err)
		require.NotNil(t, persistedSession)
		assert.Equal(t, createdSession.ID, persistedSession.ID)
		assert.Equal(t, "Integration Test Session", persistedSession.Title)
	})

	t.Run("restore_persisted_sessions", func(t *testing.T) {
		// Create a new session manager (simulating server restart)
		newSessionManager := session.NewManagerWithPersistence(persistenceService)

		// Restore persisted sessions
		err := newSessionManager.RestorePersistedSessions()
		require.NoError(t, err)

		// Verify persisted sessions are available in storage
		sessions, err := persistenceService.LoadAllSessions()
		require.NoError(t, err)
		assert.Len(t, sessions, 1)

		persistedSession := sessions[0]
		assert.Equal(t, "Integration Test Session", persistedSession.Title)
		assert.Equal(t, "bash", persistedSession.Command)
		// Note: persistedSession.Active is true in storage, but RestorePersistedSessions() 
		// marks sessions as inactive in memory only (they remain active in persistent storage)
	})

	t.Run("delete_and_cleanup", func(t *testing.T) {
		// Get all sessions for deletion
		sessions, err := persistenceService.LoadAllSessions()
		require.NoError(t, err)

		// Delete each session
		for _, sess := range sessions {
			err := sessionManager.Close(sess.ID)
			require.NoError(t, err)

			// Verify session was removed from persistence
			deletedSession, err := persistenceService.LoadSession(sess.ID)
			require.NoError(t, err)
			assert.Nil(t, deletedSession)
		}

		// Verify no sessions remain
		remainingSessions, err := persistenceService.LoadAllSessions()
		require.NoError(t, err)
		assert.Len(t, remainingSessions, 0)
	})
}

// TestPersistenceServiceStats tests the statistics functionality
func TestPersistenceServiceStats(t *testing.T) {
	// Create temporary directory
	tempDir, err := os.MkdirTemp("", "tunnelforge_persistence_stats_test")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create file store and service
	fileStore, err := persistence.NewFileStore(tempDir)
	require.NoError(t, err)

	persistenceService := persistence.NewService(fileStore, true, 10*time.Second)
	persistenceService.Start()
	defer persistenceService.Stop()

	// Create session manager
	sessionManager := session.NewManagerWithPersistence(persistenceService)

	// Create test sessions
	for i := 0; i < 3; i++ {
		req := &types.SessionCreateRequest{
			Command: "echo 'test'",
			Title:   fmt.Sprintf("Test Session %d", i+1),
			Cols:    80,
			Rows:    24,
		}

		_, err := sessionManager.Create(req)
		require.NoError(t, err)
	}

	// Get statistics
	stats := persistenceService.GetStats()

	// Verify stats
	assert.Equal(t, 3, stats["totalSessions"])
	assert.Equal(t, 3, stats["activeSessions"]) // All should be active initially
	assert.Equal(t, true, stats["autoSaveEnabled"])
	assert.Equal(t, "10s", stats["saveInterval"])
}