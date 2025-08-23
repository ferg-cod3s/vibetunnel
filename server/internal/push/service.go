package push

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// NotificationPayload represents the data sent in a push notification
type NotificationPayload struct {
	Title   string                 `json:"title"`
	Body    string                 `json:"body"`
	Icon    string                 `json:"icon,omitempty"`
	Badge   string                 `json:"badge,omitempty"`
	Image   string                 `json:"image,omitempty"`
	Tag     string                 `json:"tag,omitempty"`
	Data    map[string]interface{} `json:"data,omitempty"`
	Actions []NotificationAction   `json:"actions,omitempty"`

	// Options for notification behavior
	RequireInteraction bool  `json:"requireInteraction,omitempty"`
	Silent             bool  `json:"silent,omitempty"`
	Renotify           bool  `json:"renotify,omitempty"`
	Timestamp          int64 `json:"timestamp,omitempty"`
	Vibrate            []int `json:"vibrate,omitempty"`
}

// NotificationAction represents an action button on a notification
type NotificationAction struct {
	Action string `json:"action"`
	Title  string `json:"title"`
	Icon   string `json:"icon,omitempty"`
}

// PushService handles Web Push notifications
type PushService struct {
	vapidKeys         *VAPIDKeys
	subscriptionStore SubscriptionStore
	subject           string // Email or URL for VAPID subject

	// Statistics
	stats      PushServiceStats
	statsMutex sync.RWMutex
}

// PushServiceStats tracks notification sending statistics
type PushServiceStats struct {
	TotalSent      int64      `json:"totalSent"`
	TotalFailed    int64      `json:"totalFailed"`
	TotalRetries   int64      `json:"totalRetries"`
	LastSent       *time.Time `json:"lastSent,omitempty"`
	LastError      *time.Time `json:"lastError,omitempty"`
	ActiveDelivery int64      `json:"activeDelivery"`
}

// PushServiceConfig contains configuration for the push service
type PushServiceConfig struct {
	Subject       string        // VAPID subject (email or URL)
	TTL           int           // Time to live for notifications (seconds)
	Urgency       string        // Urgency: very-low, low, normal, high
	RetryCount    int           // Number of retries for failed deliveries
	RetryInterval time.Duration // Time between retries
	BatchSize     int           // Maximum notifications per batch
	Workers       int           // Number of worker goroutines
}

// DefaultPushServiceConfig returns sensible defaults
func DefaultPushServiceConfig() *PushServiceConfig {
	return &PushServiceConfig{
		Subject:       "mailto:admin@tunnelforge.com", // Should be configurable
		TTL:           86400,                         // 24 hours
		Urgency:       "normal",
		RetryCount:    3,
		RetryInterval: 5 * time.Second,
		BatchSize:     100,
		Workers:       5,
	}
}

// NewPushService creates a new push notification service
func NewPushService(vapidKeys *VAPIDKeys, subscriptionStore SubscriptionStore, config *PushServiceConfig) (*PushService, error) {
	if config == nil {
		config = DefaultPushServiceConfig()
	}

	// Validate VAPID keys
	if vapidKeys.PublicKey == "" || vapidKeys.PrivateKey == "" {
		return nil, fmt.Errorf("VAPID keys are required")
	}

	service := &PushService{
		vapidKeys:         vapidKeys,
		subscriptionStore: subscriptionStore,
		subject:           config.Subject,
	}

	return service, nil
}

// Start initializes the push service
func (ps *PushService) Start() error {
	log.Println("🚀 Push notification service starting...")
	log.Printf("📱 Push service ready with VAPID subject: %s", ps.subject)
	return nil
}

// Stop gracefully shuts down the push service
func (ps *PushService) Stop() error {
	log.Println("📱 Push notification service stopping...")
	return nil
}

// SendNotification sends a push notification to a specific subscription
func (ps *PushService) SendNotification(ctx context.Context, subscriptionID string, payload *NotificationPayload) error {
	// Get the subscription
	subscription, err := ps.subscriptionStore.Get(subscriptionID)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	if !subscription.Active {
		return fmt.Errorf("subscription is inactive: %s", subscriptionID)
	}

	return ps.sendToSubscription(ctx, subscription, payload)
}

// SendNotificationToUser sends a push notification to all active subscriptions for a user
func (ps *PushService) SendNotificationToUser(ctx context.Context, userID string, payload *NotificationPayload) error {
	subscriptions, err := ps.subscriptionStore.GetByUserID(userID)
	if err != nil {
		return fmt.Errorf("failed to get user subscriptions: %w", err)
	}

	if len(subscriptions) == 0 {
		return fmt.Errorf("no subscriptions found for user: %s", userID)
	}

	var errors []string
	successCount := 0

	for _, subscription := range subscriptions {
		if !subscription.Active {
			continue
		}

		if err := ps.sendToSubscription(ctx, subscription, payload); err != nil {
			errors = append(errors, fmt.Sprintf("subscription %s: %v", subscription.ID, err))
		} else {
			successCount++
		}
	}

	if len(errors) > 0 && successCount == 0 {
		return fmt.Errorf("all notifications failed: %s", strings.Join(errors, "; "))
	}

	if len(errors) > 0 {
		log.Printf("⚠️ Partial delivery failure for user %s: %s", userID, strings.Join(errors, "; "))
	}

	return nil
}

// BroadcastNotification sends a push notification to all active subscriptions
func (ps *PushService) BroadcastNotification(ctx context.Context, payload *NotificationPayload) error {
	subscriptions, err := ps.subscriptionStore.GetActive()
	if err != nil {
		return fmt.Errorf("failed to get active subscriptions: %w", err)
	}

	if len(subscriptions) == 0 {
		log.Println("📱 No active subscriptions for broadcast")
		return nil
	}

	log.Printf("📡 Broadcasting notification to %d subscriptions", len(subscriptions))

	var wg sync.WaitGroup
	errorChan := make(chan error, len(subscriptions))

	// Send notifications concurrently with a semaphore to limit concurrency
	semaphore := make(chan struct{}, 10) // Limit to 10 concurrent sends

	for _, subscription := range subscriptions {
		wg.Add(1)
		go func(sub *PushSubscription) {
			defer wg.Done()
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			if err := ps.sendToSubscription(ctx, sub, payload); err != nil {
				errorChan <- fmt.Errorf("subscription %s: %w", sub.ID, err)
			}
		}(subscription)
	}

	wg.Wait()
	close(errorChan)

	// Collect errors
	var errors []string
	for err := range errorChan {
		errors = append(errors, err.Error())
	}

	if len(errors) > 0 {
		log.Printf("⚠️ Broadcast had %d failures: %s", len(errors), strings.Join(errors, "; "))
	}

	log.Printf("✅ Broadcast completed: %d total, %d failures", len(subscriptions), len(errors))
	return nil
}

// sendToSubscription sends a notification to a specific subscription
func (ps *PushService) sendToSubscription(ctx context.Context, subscription *PushSubscription, payload *NotificationPayload) error {
	ps.updateStats(func(stats *PushServiceStats) {
		stats.ActiveDelivery++
	})
	defer ps.updateStats(func(stats *PushServiceStats) {
		stats.ActiveDelivery--
	})

	// Set timestamp if not provided
	if payload.Timestamp == 0 {
		payload.Timestamp = time.Now().Unix()
	}

	// Marshal payload to JSON
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		ps.recordError()
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create webpush subscription
	webpushSub := &webpush.Subscription{
		Endpoint: subscription.Endpoint,
		Keys: webpush.Keys{
			P256dh: subscription.Keys.P256dh,
			Auth:   subscription.Keys.Auth,
		},
	}

	// Set VAPID options
	options := &webpush.Options{
		VAPIDPublicKey:  ps.vapidKeys.PublicKey,
		VAPIDPrivateKey: ps.vapidKeys.PrivateKey,
		Subscriber:      ps.subject,
		TTL:             86400,
	}

	// Send the notification with retries
	var lastError error
	for attempt := 0; attempt <= 3; attempt++ { // 1 initial attempt + 3 retries
		resp, err := webpush.SendNotificationWithContext(ctx, payloadBytes, webpushSub, options)
		if err == nil {
			// Success - update subscription usage
			ps.subscriptionStore.MarkAsUsed(subscription.ID)
			ps.recordSuccess()

			if resp != nil {
				resp.Body.Close()
			}
			return nil
		}

		lastError = err

		// Check if this is a permanent failure
		if ps.isPermanentError(err) {
			log.Printf("🚫 Permanent failure for subscription %s: %v", subscription.ID, err)

			// Deactivate the subscription
			subscription.Active = false
			ps.subscriptionStore.Update(subscription)

			ps.recordError()
			return fmt.Errorf("permanent failure: %w", err)
		}

		// Temporary error - retry if we have attempts left
		if attempt < 3 {
			ps.updateStats(func(stats *PushServiceStats) {
				stats.TotalRetries++
			})

			log.Printf("🔄 Retry %d for subscription %s: %v", attempt+1, subscription.ID, err)

			// Exponential backoff
			backoff := time.Duration(attempt+1) * 2 * time.Second
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
				// Continue to next attempt
			}
		}
	}

	ps.recordError()
	return fmt.Errorf("failed after retries: %w", lastError)
}

// isPermanentError determines if an error is permanent and should not be retried
func (ps *PushService) isPermanentError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()

	// HTTP 410 Gone - subscription is no longer valid
	if strings.Contains(errStr, "410") {
		return true
	}

	// HTTP 400 Bad Request - malformed request
	if strings.Contains(errStr, "400") {
		return true
	}

	// HTTP 413 Payload Too Large - message is too big
	if strings.Contains(errStr, "413") {
		return true
	}

	// Other 4xx errors are generally permanent
	if strings.Contains(errStr, "4") && (strings.Contains(errStr, "40") || strings.Contains(errStr, "41") || strings.Contains(errStr, "42")) {
		return true
	}

	return false
}

// ProcessServerEvent processes a TunnelForge server event and sends appropriate notifications
func (ps *PushService) ProcessServerEvent(ctx context.Context, event *types.ServerEvent) error {
	// Skip if we don't have active subscriptions
	subscriptions, err := ps.subscriptionStore.GetActive()
	if err != nil {
		return fmt.Errorf("failed to get active subscriptions: %w", err)
	}

	if len(subscriptions) == 0 {
		return nil // No one to notify
	}

	// Create notification payload based on event type
	payload := ps.createNotificationFromEvent(event)
	if payload == nil {
		return nil // Event type doesn't require notification
	}

	// Filter subscriptions based on preferences
	targetSubscriptions := ps.filterSubscriptionsByPreferences(subscriptions, event.Type)
	if len(targetSubscriptions) == 0 {
		return nil // No one wants this notification type
	}

	// Send notifications to filtered subscriptions
	var errors []string
	for _, subscription := range targetSubscriptions {
		if err := ps.sendToSubscription(ctx, subscription, payload); err != nil {
			errors = append(errors, fmt.Sprintf("subscription %s: %v", subscription.ID, err))
		}
	}

	if len(errors) > 0 {
		log.Printf("⚠️ Event notification had %d failures: %s", len(errors), strings.Join(errors, "; "))
	}

	return nil
}

// createNotificationFromEvent converts a server event to a notification payload
func (ps *PushService) createNotificationFromEvent(event *types.ServerEvent) *NotificationPayload {
	switch event.Type {
	case types.EventSessionStart:
		return &NotificationPayload{
			Title: "Terminal Session Started",
			Body:  fmt.Sprintf("New session: %s", ps.getSessionName(event)),
			Tag:   "session-start",
			Icon:  "/icons/terminal.png",
			Data: map[string]interface{}{
				"type":      string(event.Type),
				"sessionId": event.SessionID,
				"timestamp": event.Timestamp,
			},
		}

	case types.EventSessionExit:
		return &NotificationPayload{
			Title: "Terminal Session Ended",
			Body:  fmt.Sprintf("Session completed: %s", ps.getSessionName(event)),
			Tag:   "session-exit",
			Icon:  "/icons/terminal.png",
			Data: map[string]interface{}{
				"type":      string(event.Type),
				"sessionId": event.SessionID,
				"timestamp": event.Timestamp,
			},
		}

	case types.EventGitBranchSwitch:
		return &NotificationPayload{
			Title: "Git Branch Changed",
			Body:  fmt.Sprintf("Switched to branch: %s", ps.getBranchName(event)),
			Tag:   "git-branch-switch",
			Icon:  "/icons/git.png",
			Data: map[string]interface{}{
				"type":      string(event.Type),
				"branch":    event.Branch,
				"repoPath":  event.RepoPath,
				"timestamp": event.Timestamp,
			},
		}

	case types.EventCommandFinished:
		return &NotificationPayload{
			Title:              "Command Completed",
			Body:               fmt.Sprintf("Command finished in session: %s", ps.getSessionName(event)),
			Tag:                "command-finished",
			Icon:               "/icons/terminal.png",
			RequireInteraction: true,
			Data: map[string]interface{}{
				"type":      string(event.Type),
				"sessionId": event.SessionID,
				"command":   event.Command,
				"exitCode":  event.ExitCode,
				"duration":  event.Duration,
				"timestamp": event.Timestamp,
			},
		}

	case types.EventServerShutdown:
		return &NotificationPayload{
			Title:              "TunnelForge Server Shutdown",
			Body:               "The TunnelForge server is shutting down",
			Tag:                "server-shutdown",
			Icon:               "/icons/warning.png",
			RequireInteraction: true,
			Data: map[string]interface{}{
				"type":      string(event.Type),
				"timestamp": event.Timestamp,
			},
		}

	default:
		// Don't send notifications for other event types
		return nil
	}
}

// filterSubscriptionsByPreferences filters subscriptions based on notification preferences
func (ps *PushService) filterSubscriptionsByPreferences(subscriptions []*PushSubscription, eventType types.ServerEventType) []*PushSubscription {
	var filtered []*PushSubscription

	for _, sub := range subscriptions {
		prefs := sub.Options.Preferences

		switch eventType {
		case types.EventSessionStart, types.EventSessionExit:
			if prefs.SessionEvents {
				filtered = append(filtered, sub)
			}
		case types.EventGitBranchSwitch, types.EventGitFollowEnabled, types.EventGitFollowDisabled, types.EventGitWorktreeSync:
			if prefs.GitEvents {
				filtered = append(filtered, sub)
			}
		case types.EventServerShutdown, types.EventHeartbeat:
			if prefs.SystemEvents {
				filtered = append(filtered, sub)
			}
		case types.EventCommandFinished:
			if prefs.CommandFinished {
				filtered = append(filtered, sub)
			}
		case types.EventCommandError:
			if prefs.ErrorAlerts {
				filtered = append(filtered, sub)
			}
		default:
			// Include all subscriptions for unknown event types
			filtered = append(filtered, sub)
		}
	}

	return filtered
}

// Helper functions to extract information from events
func (ps *PushService) getSessionName(event *types.ServerEvent) string {
	if event.SessionName != nil {
		return *event.SessionName
	}
	if event.SessionID != nil {
		return *event.SessionID
	}
	return "Unknown Session"
}

func (ps *PushService) getBranchName(event *types.ServerEvent) string {
	if event.Branch != nil {
		return *event.Branch
	}
	return "Unknown Branch"
}

// Statistics methods
func (ps *PushService) recordSuccess() {
	ps.updateStats(func(stats *PushServiceStats) {
		stats.TotalSent++
		now := time.Now()
		stats.LastSent = &now
	})
}

func (ps *PushService) recordError() {
	ps.updateStats(func(stats *PushServiceStats) {
		stats.TotalFailed++
		now := time.Now()
		stats.LastError = &now
	})
}

func (ps *PushService) updateStats(updater func(*PushServiceStats)) {
	ps.statsMutex.Lock()
	defer ps.statsMutex.Unlock()
	updater(&ps.stats)
}

// GetStats returns current push service statistics
func (ps *PushService) GetStats() PushServiceStats {
	ps.statsMutex.RLock()
	defer ps.statsMutex.RUnlock()

	// Create a copy to avoid data races
	stats := ps.stats
	return stats
}
