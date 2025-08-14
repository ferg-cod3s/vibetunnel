package push

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// PushSubscription represents a Web Push subscription
type PushSubscription struct {
	ID       string                  `json:"id"`
	UserID   string                  `json:"userId"`
	Endpoint string                  `json:"endpoint"`
	Keys     PushSubscriptionKeys    `json:"keys"`
	Options  PushSubscriptionOptions `json:"options"`
	Created  time.Time               `json:"created"`
	LastUsed *time.Time              `json:"lastUsed,omitempty"`
	Active   bool                    `json:"active"`
}

// PushSubscriptionKeys contains the encryption keys for the subscription
type PushSubscriptionKeys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

// PushSubscriptionOptions contains subscription preferences
type PushSubscriptionOptions struct {
	ApplicationServerKey string                  `json:"applicationServerKey"`
	UserVisibleOnly      bool                    `json:"userVisibleOnly"`
	Preferences          NotificationPreferences `json:"preferences"`
}

// NotificationPreferences defines what types of notifications a user wants
type NotificationPreferences struct {
	SessionEvents   bool `json:"sessionEvents"`   // Terminal session start/stop
	GitEvents       bool `json:"gitEvents"`       // Git branch changes, commits
	SystemEvents    bool `json:"systemEvents"`    // Server status, alerts
	CommandFinished bool `json:"commandFinished"` // Long-running command completion
	ErrorAlerts     bool `json:"errorAlerts"`     // System errors and failures
}

// DefaultNotificationPreferences returns sensible defaults
func DefaultNotificationPreferences() NotificationPreferences {
	return NotificationPreferences{
		SessionEvents:   true,
		GitEvents:       true,
		SystemEvents:    false, // Less noisy by default
		CommandFinished: true,
		ErrorAlerts:     true,
	}
}

// SubscriptionStore manages push subscriptions
type SubscriptionStore interface {
	Create(subscription *PushSubscription) error
	Get(id string) (*PushSubscription, error)
	GetByUserID(userID string) ([]*PushSubscription, error)
	GetAll() ([]*PushSubscription, error)
	Update(subscription *PushSubscription) error
	Delete(id string) error
	DeleteByEndpoint(endpoint string) error
	MarkAsUsed(id string) error
	GetActive() ([]*PushSubscription, error)
	Cleanup(olderThan time.Duration) (int, error)
}

// InMemorySubscriptionStore is an in-memory implementation of SubscriptionStore
type InMemorySubscriptionStore struct {
	subscriptions map[string]*PushSubscription
	userIndex     map[string][]string // userID -> subscription IDs
	endpointIndex map[string]string   // endpoint -> subscription ID
	mu            sync.RWMutex
}

// NewInMemorySubscriptionStore creates a new in-memory subscription store
func NewInMemorySubscriptionStore() *InMemorySubscriptionStore {
	return &InMemorySubscriptionStore{
		subscriptions: make(map[string]*PushSubscription),
		userIndex:     make(map[string][]string),
		endpointIndex: make(map[string]string),
	}
}

// Create adds a new push subscription
func (s *InMemorySubscriptionStore) Create(subscription *PushSubscription) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Generate ID if not provided
	if subscription.ID == "" {
		subscription.ID = uuid.New().String()
	}

	// Set creation time
	if subscription.Created.IsZero() {
		subscription.Created = time.Now()
	}

	// Set default preferences if not provided
	if subscription.Options.Preferences == (NotificationPreferences{}) {
		subscription.Options.Preferences = DefaultNotificationPreferences()
	}

	// Validate required fields
	if subscription.UserID == "" {
		return fmt.Errorf("user ID is required")
	}
	if subscription.Endpoint == "" {
		return fmt.Errorf("endpoint is required")
	}
	if subscription.Keys.P256dh == "" || subscription.Keys.Auth == "" {
		return fmt.Errorf("encryption keys are required")
	}

	// Check if endpoint already exists
	if existingID, exists := s.endpointIndex[subscription.Endpoint]; exists {
		return fmt.Errorf("subscription with endpoint already exists: %s", existingID)
	}

	// Store subscription
	s.subscriptions[subscription.ID] = subscription

	// Update indices
	s.userIndex[subscription.UserID] = append(s.userIndex[subscription.UserID], subscription.ID)
	s.endpointIndex[subscription.Endpoint] = subscription.ID

	return nil
}

// Get retrieves a subscription by ID
func (s *InMemorySubscriptionStore) Get(id string) (*PushSubscription, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subscription, exists := s.subscriptions[id]
	if !exists {
		return nil, fmt.Errorf("subscription not found: %s", id)
	}

	// Return a copy to prevent external modifications
	return s.copySubscription(subscription), nil
}

// GetByUserID retrieves all subscriptions for a user
func (s *InMemorySubscriptionStore) GetByUserID(userID string) ([]*PushSubscription, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subscriptionIDs, exists := s.userIndex[userID]
	if !exists {
		return []*PushSubscription{}, nil
	}

	subscriptions := make([]*PushSubscription, 0, len(subscriptionIDs))
	for _, id := range subscriptionIDs {
		if subscription, exists := s.subscriptions[id]; exists {
			subscriptions = append(subscriptions, s.copySubscription(subscription))
		}
	}

	return subscriptions, nil
}

// GetAll retrieves all subscriptions
func (s *InMemorySubscriptionStore) GetAll() ([]*PushSubscription, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subscriptions := make([]*PushSubscription, 0, len(s.subscriptions))
	for _, subscription := range s.subscriptions {
		subscriptions = append(subscriptions, s.copySubscription(subscription))
	}

	return subscriptions, nil
}

// Update modifies an existing subscription
func (s *InMemorySubscriptionStore) Update(subscription *PushSubscription) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.subscriptions[subscription.ID]
	if !exists {
		return fmt.Errorf("subscription not found: %s", subscription.ID)
	}

	// If endpoint changed, update the endpoint index
	if existing.Endpoint != subscription.Endpoint {
		delete(s.endpointIndex, existing.Endpoint)
		s.endpointIndex[subscription.Endpoint] = subscription.ID
	}

	// Update the subscription
	s.subscriptions[subscription.ID] = subscription

	return nil
}

// Delete removes a subscription by ID
func (s *InMemorySubscriptionStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	subscription, exists := s.subscriptions[id]
	if !exists {
		return fmt.Errorf("subscription not found: %s", id)
	}

	// Remove from subscriptions
	delete(s.subscriptions, id)

	// Remove from endpoint index
	delete(s.endpointIndex, subscription.Endpoint)

	// Remove from user index
	userSubs := s.userIndex[subscription.UserID]
	for i, subID := range userSubs {
		if subID == id {
			s.userIndex[subscription.UserID] = append(userSubs[:i], userSubs[i+1:]...)
			break
		}
	}

	// Clean up empty user index entry
	if len(s.userIndex[subscription.UserID]) == 0 {
		delete(s.userIndex, subscription.UserID)
	}

	return nil
}

// DeleteByEndpoint removes a subscription by endpoint
func (s *InMemorySubscriptionStore) DeleteByEndpoint(endpoint string) error {
	s.mu.RLock()
	subscriptionID, exists := s.endpointIndex[endpoint]
	s.mu.RUnlock()

	if !exists {
		return fmt.Errorf("subscription not found for endpoint: %s", endpoint)
	}

	return s.Delete(subscriptionID)
}

// MarkAsUsed updates the last used timestamp
func (s *InMemorySubscriptionStore) MarkAsUsed(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	subscription, exists := s.subscriptions[id]
	if !exists {
		return fmt.Errorf("subscription not found: %s", id)
	}

	now := time.Now()
	subscription.LastUsed = &now

	return nil
}

// GetActive returns all active subscriptions
func (s *InMemorySubscriptionStore) GetActive() ([]*PushSubscription, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var activeSubscriptions []*PushSubscription
	for _, subscription := range s.subscriptions {
		if subscription.Active {
			activeSubscriptions = append(activeSubscriptions, s.copySubscription(subscription))
		}
	}

	return activeSubscriptions, nil
}

// Cleanup removes old, unused subscriptions
func (s *InMemorySubscriptionStore) Cleanup(olderThan time.Duration) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-olderThan)
	var toDelete []string

	for id, subscription := range s.subscriptions {
		// Delete if never used and old enough
		if subscription.LastUsed == nil && subscription.Created.Before(cutoff) {
			toDelete = append(toDelete, id)
			continue
		}

		// Delete if last used before cutoff
		if subscription.LastUsed != nil && subscription.LastUsed.Before(cutoff) {
			toDelete = append(toDelete, id)
		}
	}

	// Delete the old subscriptions
	for _, id := range toDelete {
		s.deleteWithoutLock(id)
	}

	return len(toDelete), nil
}

// copySubscription creates a deep copy of a subscription
func (s *InMemorySubscriptionStore) copySubscription(sub *PushSubscription) *PushSubscription {
	copy := *sub
	if sub.LastUsed != nil {
		lastUsed := *sub.LastUsed
		copy.LastUsed = &lastUsed
	}
	return &copy
}

// deleteWithoutLock removes a subscription without acquiring the lock
func (s *InMemorySubscriptionStore) deleteWithoutLock(id string) {
	subscription, exists := s.subscriptions[id]
	if !exists {
		return
	}

	// Remove from subscriptions
	delete(s.subscriptions, id)

	// Remove from endpoint index
	delete(s.endpointIndex, subscription.Endpoint)

	// Remove from user index
	userSubs := s.userIndex[subscription.UserID]
	for i, subID := range userSubs {
		if subID == id {
			s.userIndex[subscription.UserID] = append(userSubs[:i], userSubs[i+1:]...)
			break
		}
	}

	// Clean up empty user index entry
	if len(s.userIndex[subscription.UserID]) == 0 {
		delete(s.userIndex, subscription.UserID)
	}
}

// SubscriptionRequest represents a request to create/update a push subscription
type SubscriptionRequest struct {
	Endpoint string                  `json:"endpoint"`
	Keys     PushSubscriptionKeys    `json:"keys"`
	Options  PushSubscriptionOptions `json:"options"`
}

// ToSubscription converts a SubscriptionRequest to a PushSubscription
func (sr *SubscriptionRequest) ToSubscription(userID string) *PushSubscription {
	return &PushSubscription{
		UserID:   userID,
		Endpoint: sr.Endpoint,
		Keys:     sr.Keys,
		Options:  sr.Options,
		Created:  time.Now(),
		Active:   true,
	}
}

// Validate checks if the subscription request is valid
func (sr *SubscriptionRequest) Validate() error {
	if sr.Endpoint == "" {
		return fmt.Errorf("endpoint is required")
	}
	if sr.Keys.P256dh == "" {
		return fmt.Errorf("p256dh key is required")
	}
	if sr.Keys.Auth == "" {
		return fmt.Errorf("auth key is required")
	}
	return nil
}

// SubscriptionStats provides statistics about subscriptions
type SubscriptionStats struct {
	Total          int     `json:"total"`
	Active         int     `json:"active"`
	Inactive       int     `json:"inactive"`
	UniqueUsers    int     `json:"uniqueUsers"`
	AveragePerUser float64 `json:"averagePerUser"`
}

// GetStats returns statistics about the subscriptions
func (s *InMemorySubscriptionStore) GetStats() (*SubscriptionStats, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := &SubscriptionStats{
		Total:       len(s.subscriptions),
		UniqueUsers: len(s.userIndex),
	}

	for _, subscription := range s.subscriptions {
		if subscription.Active {
			stats.Active++
		} else {
			stats.Inactive++
		}
	}

	if stats.UniqueUsers > 0 {
		stats.AveragePerUser = float64(stats.Total) / float64(stats.UniqueUsers)
	}

	return stats, nil
}
