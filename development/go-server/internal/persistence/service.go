package persistence

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// Service handles session persistence operations
type Service struct {
	store           SessionStore
	autoSaveEnabled bool
	saveInterval    time.Duration
	stopChan        chan struct{}
	wg              sync.WaitGroup
	mu              sync.RWMutex
}

// NewService creates a new persistence service
func NewService(store SessionStore, autoSaveEnabled bool, saveInterval time.Duration) *Service {
	return &Service{
		store:           store,
		autoSaveEnabled: autoSaveEnabled,
		saveInterval:    saveInterval,
		stopChan:        make(chan struct{}),
	}
}

// Start begins the persistence service (starts auto-save if enabled)
func (s *Service) Start() {
	if s.autoSaveEnabled {
		s.wg.Add(1)
		go s.autoSaveLoop()
		log.Printf("📁 Session persistence started with auto-save interval: %v", s.saveInterval)
	} else {
		log.Printf("📁 Session persistence started (auto-save disabled)")
	}
}

// Stop gracefully shuts down the persistence service
func (s *Service) Stop() {
	close(s.stopChan)
	s.wg.Wait()

	if err := s.store.Close(); err != nil {
		log.Printf("Warning: failed to close session store: %v", err)
	}

	log.Printf("📁 Session persistence stopped")
}

// SaveSession persists a session to storage
func (s *Service) SaveSession(session *types.Session) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.store.SaveSession(session); err != nil {
		return fmt.Errorf("failed to save session %s: %w", session.ID, err)
	}

	return nil
}

// LoadSession retrieves a session from storage
func (s *Service) LoadSession(id string) (*types.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	session, err := s.store.LoadSession(id)
	if err != nil {
		return nil, fmt.Errorf("failed to load session %s: %w", id, err)
	}

	return session, nil
}

// LoadAllSessions retrieves all persisted sessions
func (s *Service) LoadAllSessions() ([]*types.Session, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions, err := s.store.LoadAllSessions()
	if err != nil {
		return nil, fmt.Errorf("failed to load all sessions: %w", err)
	}

	return sessions, nil
}

// DeleteSession removes a session from storage
func (s *Service) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.store.DeleteSession(id); err != nil {
		return fmt.Errorf("failed to delete session %s: %w", id, err)
	}

	return nil
}

// ClearAll removes all sessions from storage
func (s *Service) ClearAll() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.store.ClearAll(); err != nil {
		return fmt.Errorf("failed to clear all sessions: %w", err)
	}

	return nil
}

// RestoreSessions loads and restores all persisted sessions
func (s *Service) RestoreSessions() ([]*types.Session, error) {
	sessions, err := s.LoadAllSessions()
	if err != nil {
		return nil, err
	}

	if len(sessions) > 0 {
		log.Printf("📁 Restored %d persisted sessions", len(sessions))
	}

	return sessions, nil
}

// autoSaveLoop runs the periodic auto-save functionality
func (s *Service) autoSaveLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.saveInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Auto-save is handled by the session manager calling SaveSession
			// This loop exists for future enhancements like cleanup of old sessions
		case <-s.stopChan:
			return
		}
	}
}

// GetStats returns persistence statistics
func (s *Service) GetStats() map[string]interface{} {
	sessions, err := s.LoadAllSessions()
	if err != nil {
		return map[string]interface{}{
			"error":          err.Error(),
			"autoSaveEnabled": s.autoSaveEnabled,
			"saveInterval":   s.saveInterval.String(),
		}
	}

	activeSessions := 0
	for _, session := range sessions {
		if session.Active {
			activeSessions++
		}
	}

	return map[string]interface{}{
		"totalSessions":   len(sessions),
		"activeSessions":  activeSessions,
		"autoSaveEnabled": s.autoSaveEnabled,
		"saveInterval":    s.saveInterval.String(),
	}
}