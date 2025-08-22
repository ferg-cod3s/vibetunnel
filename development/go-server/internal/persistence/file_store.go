package persistence

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// FileStore implements SessionStore using JSON files
type FileStore struct {
	baseDir string
}

// NewFileStore creates a new file-based session store
func NewFileStore(baseDir string) (*FileStore, error) {
	// Create base directory if it doesn't exist
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create sessions directory: %w", err)
	}

	return &FileStore{
		baseDir: baseDir,
	}, nil
}

// SaveSession persists session metadata to a JSON file
func (fs *FileStore) SaveSession(session *types.Session) error {
	if session == nil {
		return fmt.Errorf("session cannot be nil")
	}

	// Convert to persistent data format
	data := PersistentSessionData{
		ID:        session.ID,
		Title:     session.Title,
		Command:   session.Command,
		Cwd:       session.Cwd,
		Cols:      session.Cols,
		Rows:      session.Rows,
		CreatedAt: session.CreatedAt.Format(time.RFC3339),
		UpdatedAt: session.UpdatedAt.Format(time.RFC3339),
		Active:    session.Active,
	}

	// Marshal to JSON
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal session data: %w", err)
	}

	// Write to file
	filePath := filepath.Join(fs.baseDir, fmt.Sprintf("%s.json", session.ID))
	if err := os.WriteFile(filePath, jsonData, 0644); err != nil {
		return fmt.Errorf("failed to write session file: %w", err)
	}

	return nil
}

// LoadSession retrieves session metadata from a JSON file
func (fs *FileStore) LoadSession(id string) (*types.Session, error) {
	filePath := filepath.Join(fs.baseDir, fmt.Sprintf("%s.json", id))

	// Read file
	jsonData, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // Session not found
		}
		return nil, fmt.Errorf("failed to read session file: %w", err)
	}

	// Unmarshal JSON
	var data PersistentSessionData
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	// Parse timestamps
	createdAt, err := time.Parse(time.RFC3339, data.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse createdAt: %w", err)
	}

	updatedAt, err := time.Parse(time.RFC3339, data.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to parse updatedAt: %w", err)
	}

	// Convert to Session struct
	session := &types.Session{
		ID:        data.ID,
		Title:     data.Title,
		Command:   data.Command,
		Cwd:       data.Cwd,
		Cols:      data.Cols,
		Rows:      data.Rows,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
		Active:    data.Active,
		PTY:       nil,                        // Will be set when session is restored
		Cmd:       nil,                        // Will be set when session is restored
		Clients:   make([]*types.WSClient, 0), // Empty initially
	}

	return session, nil
}

// LoadAllSessions retrieves all persisted sessions
func (fs *FileStore) LoadAllSessions() ([]*types.Session, error) {
	// Read directory contents
	entries, err := os.ReadDir(fs.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*types.Session{}, nil // No sessions yet
		}
		return nil, fmt.Errorf("failed to read sessions directory: %w", err)
	}

	var sessions []*types.Session

	// Load each session file
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".json" {
			// Extract session ID from filename
			sessionID := entry.Name()[:len(entry.Name())-5] // Remove .json extension

			session, err := fs.LoadSession(sessionID)
			if err != nil {
				// Log error but continue with other sessions
				fmt.Printf("Warning: failed to load session %s: %v\n", sessionID, err)
				continue
			}

			if session != nil {
				sessions = append(sessions, session)
			}
		}
	}

	return sessions, nil
}

// DeleteSession removes session from persistent storage
func (fs *FileStore) DeleteSession(id string) error {
	filePath := filepath.Join(fs.baseDir, fmt.Sprintf("%s.json", id))

	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			return nil // Already deleted
		}
		return fmt.Errorf("failed to delete session file: %w", err)
	}

	return nil
}

// ClearAll removes all sessions from storage
func (fs *FileStore) ClearAll() error {
	// Read directory contents
	entries, err := os.ReadDir(fs.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // Directory doesn't exist, nothing to clear
		}
		return fmt.Errorf("failed to read sessions directory: %w", err)
	}

	// Delete each session file
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".json" {
			filePath := filepath.Join(fs.baseDir, entry.Name())
			if err := os.Remove(filePath); err != nil {
				fmt.Printf("Warning: failed to delete session file %s: %v\n", filePath, err)
			}
		}
	}

	return nil
}

// Close releases any resources used by the store
func (fs *FileStore) Close() error {
	// File store doesn't need explicit closing
	return nil
}