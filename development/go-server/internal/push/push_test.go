package push

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVAPIDKeyManager(t *testing.T) {
	t.Run("Generate VAPID Keys", func(t *testing.T) {
		// Create temporary directory for keys
		tempDir, err := os.MkdirTemp("", "vapid_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		manager := NewVAPIDKeyManager(tempDir)

		// Generate keys
		keys, err := manager.GenerateKeys()
		require.NoError(t, err)
		assert.NotEmpty(t, keys.PublicKey)
		assert.NotEmpty(t, keys.PrivateKey)

		// Validate keys
		err = manager.ValidateKeys(keys)
		assert.NoError(t, err)
	})

	t.Run("Save and Load VAPID Keys", func(t *testing.T) {
		// Create temporary directory for keys
		tempDir, err := os.MkdirTemp("", "vapid_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		manager := NewVAPIDKeyManager(tempDir)

		// Generate and save keys
		originalKeys, err := manager.GenerateKeys()
		require.NoError(t, err)

		err = manager.SaveKeys(originalKeys)
		require.NoError(t, err)

		// Load keys
		loadedKeys, err := manager.LoadKeys()
		require.NoError(t, err)

		assert.Equal(t, originalKeys.PublicKey, loadedKeys.PublicKey)
		assert.Equal(t, originalKeys.PrivateKey, loadedKeys.PrivateKey)
	})

	t.Run("Get or Generate Keys", func(t *testing.T) {
		// Create temporary directory for keys
		tempDir, err := os.MkdirTemp("", "vapid_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		manager := NewVAPIDKeyManager(tempDir)

		// First call should generate new keys
		keys1, err := manager.GetOrGenerateKeys()
		require.NoError(t, err)

		// Second call should load the same keys
		keys2, err := manager.GetOrGenerateKeys()
		require.NoError(t, err)

		assert.Equal(t, keys1.PublicKey, keys2.PublicKey)
		assert.Equal(t, keys1.PrivateKey, keys2.PrivateKey)
	})
}

func TestSubscriptionStore(t *testing.T) {
	t.Run("Create and Get Subscription", func(t *testing.T) {
		store := NewInMemorySubscriptionStore()

		subscription := &PushSubscription{
			UserID:   "user123",
			Endpoint: "https://fcm.googleapis.com/fcm/send/test",
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
			Options: PushSubscriptionOptions{
				UserVisibleOnly: true,
				Preferences:     DefaultNotificationPreferences(),
			},
			Active: true,
		}

		// Create subscription
		err := store.Create(subscription)
		require.NoError(t, err)
		assert.NotEmpty(t, subscription.ID)
		assert.False(t, subscription.Created.IsZero())

		// Get subscription
		retrieved, err := store.Get(subscription.ID)
		require.NoError(t, err)
		assert.Equal(t, subscription.UserID, retrieved.UserID)
		assert.Equal(t, subscription.Endpoint, retrieved.Endpoint)
	})

	t.Run("Get Subscriptions by User ID", func(t *testing.T) {
		store := NewInMemorySubscriptionStore()

		// Create multiple subscriptions for the same user
		for i := 0; i < 3; i++ {
			subscription := &PushSubscription{
				UserID:   "user123",
				Endpoint: fmt.Sprintf("https://fcm.googleapis.com/fcm/send/test%d", i),
				Keys: PushSubscriptionKeys{
					P256dh: "test-p256dh",
					Auth:   "test-auth",
				},
				Active: true,
			}
			err := store.Create(subscription)
			require.NoError(t, err)
		}

		// Get subscriptions for user
		subscriptions, err := store.GetByUserID("user123")
		require.NoError(t, err)
		assert.Len(t, subscriptions, 3)
	})

	t.Run("Delete Subscription", func(t *testing.T) {
		store := NewInMemorySubscriptionStore()

		subscription := &PushSubscription{
			UserID:   "user123",
			Endpoint: "https://fcm.googleapis.com/fcm/send/test",
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
			Active: true,
		}

		err := store.Create(subscription)
		require.NoError(t, err)

		// Delete subscription
		err = store.Delete(subscription.ID)
		require.NoError(t, err)

		// Verify it's gone
		_, err = store.Get(subscription.ID)
		assert.Error(t, err)
	})

	t.Run("Get Active Subscriptions", func(t *testing.T) {
		store := NewInMemorySubscriptionStore()

		// Create active subscription
		activeSubscription := &PushSubscription{
			UserID:   "user123",
			Endpoint: "https://fcm.googleapis.com/fcm/send/active",
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
			Active: true,
		}
		err := store.Create(activeSubscription)
		require.NoError(t, err)

		// Create inactive subscription
		inactiveSubscription := &PushSubscription{
			UserID:   "user123",
			Endpoint: "https://fcm.googleapis.com/fcm/send/inactive",
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
			Active: false,
		}
		err = store.Create(inactiveSubscription)
		require.NoError(t, err)

		// Get active subscriptions
		activeSubscriptions, err := store.GetActive()
		require.NoError(t, err)
		assert.Len(t, activeSubscriptions, 1)
		assert.Equal(t, activeSubscription.Endpoint, activeSubscriptions[0].Endpoint)
	})

	t.Run("Subscription Stats", func(t *testing.T) {
		store := NewInMemorySubscriptionStore()

		// Create subscriptions for different users
		users := []string{"user1", "user2", "user3"}
		for _, userID := range users {
			for i := 0; i < 2; i++ {
				subscription := &PushSubscription{
					UserID:   userID,
					Endpoint: fmt.Sprintf("https://fcm.googleapis.com/fcm/send/%s-%d", userID, i),
					Keys: PushSubscriptionKeys{
						P256dh: "test-p256dh",
						Auth:   "test-auth",
					},
					Active: i == 0, // First subscription is active, second is inactive
				}
				err := store.Create(subscription)
				require.NoError(t, err)
			}
		}

		stats, err := store.GetStats()
		require.NoError(t, err)

		assert.Equal(t, 6, stats.Total)            // 3 users × 2 subscriptions
		assert.Equal(t, 3, stats.Active)           // 3 active subscriptions
		assert.Equal(t, 3, stats.Inactive)         // 3 inactive subscriptions
		assert.Equal(t, 3, stats.UniqueUsers)      // 3 unique users
		assert.Equal(t, 2.0, stats.AveragePerUser) // 6 / 3 = 2
	})
}

func TestPushService(t *testing.T) {
	t.Run("Create Push Service", func(t *testing.T) {
		// Create temporary directory for keys
		tempDir, err := os.MkdirTemp("", "push_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		// Generate VAPID keys
		keyManager := NewVAPIDKeyManager(tempDir)
		keys, err := keyManager.GenerateKeys()
		require.NoError(t, err)

		// Create subscription store
		store := NewInMemorySubscriptionStore()

		// Create push service
		service, err := NewPushService(keys, store, nil)
		require.NoError(t, err)
		assert.NotNil(t, service)

		err = service.Start()
		assert.NoError(t, err)
	})

	t.Run("Create Notification from Server Event", func(t *testing.T) {
		// Create push service
		tempDir, err := os.MkdirTemp("", "push_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		keyManager := NewVAPIDKeyManager(tempDir)
		keys, err := keyManager.GenerateKeys()
		require.NoError(t, err)

		store := NewInMemorySubscriptionStore()
		service, err := NewPushService(keys, store, nil)
		require.NoError(t, err)

		// Test session start event
		sessionID := "session123"
		sessionName := "Test Session"
		event := types.NewServerEvent(types.EventSessionStart)
		event.SessionID = &sessionID
		event.SessionName = &sessionName

		payload := service.createNotificationFromEvent(event)
		require.NotNil(t, payload)
		assert.Equal(t, "Terminal Session Started", payload.Title)
		assert.Contains(t, payload.Body, "Test Session")

		// Test git branch switch event
		branch := "feature/test"
		gitEvent := types.NewServerEvent(types.EventGitBranchSwitch)
		gitEvent.Branch = &branch

		gitPayload := service.createNotificationFromEvent(gitEvent)
		require.NotNil(t, gitPayload)
		assert.Equal(t, "Git Branch Changed", gitPayload.Title)
		assert.Contains(t, gitPayload.Body, "feature/test")
	})

	t.Run("Filter Subscriptions by Preferences", func(t *testing.T) {
		tempDir, err := os.MkdirTemp("", "push_test_*")
		require.NoError(t, err)
		defer os.RemoveAll(tempDir)

		keyManager := NewVAPIDKeyManager(tempDir)
		keys, err := keyManager.GenerateKeys()
		require.NoError(t, err)

		store := NewInMemorySubscriptionStore()
		service, err := NewPushService(keys, store, nil)
		require.NoError(t, err)

		// Create subscriptions with different preferences
		sessionSubscription := &PushSubscription{
			UserID:   "user1",
			Endpoint: "https://fcm.googleapis.com/fcm/send/session",
			Keys:     PushSubscriptionKeys{P256dh: "test", Auth: "test"},
			Options: PushSubscriptionOptions{
				Preferences: NotificationPreferences{
					SessionEvents: true,
					GitEvents:     false,
				},
			},
			Active: true,
		}

		gitSubscription := &PushSubscription{
			UserID:   "user2",
			Endpoint: "https://fcm.googleapis.com/fcm/send/git",
			Keys:     PushSubscriptionKeys{P256dh: "test", Auth: "test"},
			Options: PushSubscriptionOptions{
				Preferences: NotificationPreferences{
					SessionEvents: false,
					GitEvents:     true,
				},
			},
			Active: true,
		}

		subscriptions := []*PushSubscription{sessionSubscription, gitSubscription}

		// Filter for session events
		sessionFiltered := service.filterSubscriptionsByPreferences(subscriptions, types.EventSessionStart)
		assert.Len(t, sessionFiltered, 1)
		assert.Equal(t, "user1", sessionFiltered[0].UserID)

		// Filter for git events
		gitFiltered := service.filterSubscriptionsByPreferences(subscriptions, types.EventGitBranchSwitch)
		assert.Len(t, gitFiltered, 1)
		assert.Equal(t, "user2", gitFiltered[0].UserID)
	})
}

func TestPushHandlers(t *testing.T) {
	// Setup test environment
	tempDir, err := os.MkdirTemp("", "push_handler_test_*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	keyManager := NewVAPIDKeyManager(tempDir)
	keys, err := keyManager.GenerateKeys()
	require.NoError(t, err)

	store := NewInMemorySubscriptionStore()
	service, err := NewPushService(keys, store, nil)
	require.NoError(t, err)

	handler := NewPushHandler(service, keyManager, store)

	t.Run("Get VAPID Public Key", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/push/vapid-key", nil)
		w := httptest.NewRecorder()

		handler.handleGetVAPIDPublicKey(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.NewDecoder(w.Body).Decode(&response)
		require.NoError(t, err)

		assert.Contains(t, response, "publicKey")
		assert.NotEmpty(t, response["publicKey"])
		assert.IsType(t, "", response["publicKey"])
	})

	t.Run("Subscribe Without Authentication", func(t *testing.T) {
		subscriptionData := map[string]interface{}{
			"endpoint": "https://fcm.googleapis.com/fcm/send/test",
			"keys": map[string]string{
				"p256dh": "test-p256dh",
				"auth":   "test-auth",
			},
		}

		body, _ := json.Marshal(subscriptionData)
		req := httptest.NewRequest("POST", "/api/push/subscribe", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handler.handleSubscribe(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestNotificationPayload(t *testing.T) {
	t.Run("Create Notification Payload", func(t *testing.T) {
		payload := &NotificationPayload{
			Title:     "Test Notification",
			Body:      "This is a test notification",
			Icon:      "/icons/test.png",
			Tag:       "test-tag",
			Timestamp: time.Now().Unix(),
			Data: map[string]interface{}{
				"sessionId": "test-session",
				"type":      "test",
			},
		}

		// Marshal to JSON to verify structure
		jsonData, err := json.Marshal(payload)
		require.NoError(t, err)

		var parsed map[string]interface{}
		err = json.Unmarshal(jsonData, &parsed)
		require.NoError(t, err)

		assert.Equal(t, "Test Notification", parsed["title"])
		assert.Equal(t, "This is a test notification", parsed["body"])
		assert.Equal(t, "/icons/test.png", parsed["icon"])
	})
}

func TestSubscriptionRequest(t *testing.T) {
	t.Run("Valid Subscription Request", func(t *testing.T) {
		req := &SubscriptionRequest{
			Endpoint: "https://fcm.googleapis.com/fcm/send/test",
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
			Options: PushSubscriptionOptions{
				UserVisibleOnly: true,
				Preferences:     DefaultNotificationPreferences(),
			},
		}

		err := req.Validate()
		assert.NoError(t, err)

		subscription := req.ToSubscription("user123")
		assert.Equal(t, "user123", subscription.UserID)
		assert.Equal(t, req.Endpoint, subscription.Endpoint)
		assert.True(t, subscription.Active)
	})

	t.Run("Invalid Subscription Request", func(t *testing.T) {
		req := &SubscriptionRequest{
			Endpoint: "", // Missing endpoint
			Keys: PushSubscriptionKeys{
				P256dh: "test-p256dh",
				Auth:   "test-auth",
			},
		}

		err := req.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "endpoint is required")
	})
}

func TestDefaultNotificationPreferences(t *testing.T) {
	prefs := DefaultNotificationPreferences()

	assert.True(t, prefs.SessionEvents)
	assert.True(t, prefs.GitEvents)
	assert.False(t, prefs.SystemEvents) // Should be less noisy by default
	assert.True(t, prefs.CommandFinished)
	assert.True(t, prefs.ErrorAlerts)
}
