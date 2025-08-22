package persistence

import (
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// SessionStore defines the interface for session persistence
type SessionStore interface {
	// SaveSession persists session metadata to storage
	SaveSession(session *types.Session) error

	// LoadSession retrieves session metadata from storage
	LoadSession(id string) (*types.Session, error)

	// LoadAllSessions retrieves all persisted sessions
	LoadAllSessions() ([]*types.Session, error)

	// DeleteSession removes session from persistent storage
	DeleteSession(id string) error

	// ClearAll removes all sessions from storage
	ClearAll() error

	// Close releases any resources used by the store
	Close() error
}

// PersistentSessionData represents the data that gets persisted for a session
type PersistentSessionData struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Command   string `json:"command"`
	Cwd       string `json:"cwd"`
	Cols      int    `json:"cols"`
	Rows      int    `json:"rows"`
	CreatedAt string `json:"createdAt"` // RFC3339 format
	UpdatedAt string `json:"updatedAt"` // RFC3339 format
	Active    bool   `json:"active"`
}