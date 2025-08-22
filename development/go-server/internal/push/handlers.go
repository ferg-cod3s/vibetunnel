package push

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/middleware"
	"github.com/gorilla/mux"
)

// PushHandler provides HTTP handlers for push notification management
type PushHandler struct {
	pushService       *PushService
	vapidKeyManager   *VAPIDKeyManager
	subscriptionStore SubscriptionStore
}

// NewPushHandler creates a new push notification handler
func NewPushHandler(pushService *PushService, vapidKeyManager *VAPIDKeyManager, subscriptionStore SubscriptionStore) *PushHandler {
	return &PushHandler{
		pushService:       pushService,
		vapidKeyManager:   vapidKeyManager,
		subscriptionStore: subscriptionStore,
	}
}

// RegisterRoutes registers push notification API routes
func (h *PushHandler) RegisterRoutes(router *mux.Router) {
	// Push notification routes
	pushRouter := router.PathPrefix("/api/push").Subrouter()

	// Public endpoints
	pushRouter.HandleFunc("/vapid-public-key", h.handleGetVAPIDPublicKey).Methods("GET")

	// Protected endpoints (require authentication)
	pushRouter.HandleFunc("/subscribe", h.handleSubscribe).Methods("POST")
	pushRouter.HandleFunc("/unsubscribe", h.handleUnsubscribe).Methods("POST")
	pushRouter.HandleFunc("/subscriptions", h.handleGetSubscriptions).Methods("GET")
	pushRouter.HandleFunc("/subscriptions/{id}", h.handleUpdateSubscription).Methods("PUT")
	pushRouter.HandleFunc("/subscriptions/{id}", h.handleDeleteSubscription).Methods("DELETE")

	// Admin endpoints
	pushRouter.HandleFunc("/test", h.handleTestNotification).Methods("POST")
	pushRouter.HandleFunc("/stats", h.handleGetStats).Methods("GET")
	pushRouter.HandleFunc("/status", h.handleGetStatus).Methods("GET")
	pushRouter.HandleFunc("/broadcast", h.handleBroadcast).Methods("POST")
	pushRouter.HandleFunc("/test-notification", h.handleTestNotificationAlt).Methods("POST")
}

// handleGetVAPIDPublicKey returns the VAPID public key for frontend use
func (h *PushHandler) handleGetVAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	// This endpoint needs to be public so the frontend can get the key

	keys, err := h.vapidKeyManager.GetOrGenerateKeys()
	if err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to get VAPID keys: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"publicKey": keys.PublicKey,
		"generated": time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleSubscribe creates or updates a push subscription
func (h *PushHandler) handleSubscribe(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Parse subscription request
	var req SubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Validate request
	if err := req.Validate(); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Invalid subscription: %v", err), http.StatusBadRequest)
		return
	}

	// Convert to subscription
	subscription := req.ToSubscription(userCtx.UserID)

	// Check if subscription already exists for this endpoint
	existing, _ := h.subscriptionStore.GetByUserID(userCtx.UserID)
	for _, sub := range existing {
		if sub.Endpoint == subscription.Endpoint {
			// Update existing subscription
			sub.Keys = subscription.Keys
			sub.Options = subscription.Options
			sub.Active = true

			if err := h.subscriptionStore.Update(sub); err != nil {
				h.writeJSONError(w, fmt.Sprintf("Failed to update subscription: %v", err), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success":      true,
				"message":      "Subscription updated",
				"subscription": sub,
			})
			return
		}
	}

	// Create new subscription
	if err := h.subscriptionStore.Create(subscription); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to create subscription: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"message":      "Subscription created",
		"subscription": subscription,
	})
}

// handleUnsubscribe removes a push subscription
func (h *PushHandler) handleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	var req struct {
		Endpoint string `json:"endpoint"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if req.Endpoint == "" {
		h.writeJSONError(w, "Endpoint is required", http.StatusBadRequest)
		return
	}

	// Find and delete the subscription
	subscriptions, err := h.subscriptionStore.GetByUserID(userCtx.UserID)
	if err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to get subscriptions: %v", err), http.StatusInternalServerError)
		return
	}

	for _, sub := range subscriptions {
		if sub.Endpoint == req.Endpoint {
			if err := h.subscriptionStore.Delete(sub.ID); err != nil {
				h.writeJSONError(w, fmt.Sprintf("Failed to delete subscription: %v", err), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"message": "Subscription removed",
			})
			return
		}
	}

	h.writeJSONError(w, "Subscription not found", http.StatusNotFound)
}

// handleGetSubscriptions returns all subscriptions for the authenticated user
func (h *PushHandler) handleGetSubscriptions(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	subscriptions, err := h.subscriptionStore.GetByUserID(userCtx.UserID)
	if err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to get subscriptions: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"subscriptions": subscriptions,
		"count":         len(subscriptions),
	})
}

// handleUpdateSubscription updates a push subscription (mainly preferences)
func (h *PushHandler) handleUpdateSubscription(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	subscriptionID := vars["id"]

	// Get the subscription
	subscription, err := h.subscriptionStore.Get(subscriptionID)
	if err != nil {
		h.writeJSONError(w, "Subscription not found", http.StatusNotFound)
		return
	}

	// Verify ownership
	if subscription.UserID != userCtx.UserID {
		h.writeJSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	// Parse update request
	var req struct {
		Preferences *NotificationPreferences `json:"preferences,omitempty"`
		Active      *bool                    `json:"active,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Update fields if provided
	if req.Preferences != nil {
		subscription.Options.Preferences = *req.Preferences
	}
	if req.Active != nil {
		subscription.Active = *req.Active
	}

	// Save changes
	if err := h.subscriptionStore.Update(subscription); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to update subscription: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"message":      "Subscription updated",
		"subscription": subscription,
	})
}

// handleDeleteSubscription removes a specific subscription
func (h *PushHandler) handleDeleteSubscription(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	subscriptionID := vars["id"]

	// Get the subscription to verify ownership
	subscription, err := h.subscriptionStore.Get(subscriptionID)
	if err != nil {
		h.writeJSONError(w, "Subscription not found", http.StatusNotFound)
		return
	}

	// Verify ownership
	if subscription.UserID != userCtx.UserID {
		h.writeJSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	// Delete the subscription
	if err := h.subscriptionStore.Delete(subscriptionID); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to delete subscription: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Subscription deleted",
	})
}

// handleTestNotification sends a test notification to the user's subscriptions
func (h *PushHandler) handleTestNotification(w http.ResponseWriter, r *http.Request) {
	// Get user from context
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		h.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Create test notification
	payload := &NotificationPayload{
		Title: "TunnelForge Test Notification",
		Body:  "This is a test notification from your TunnelForge server.",
		Icon:  "/icons/vibetunnel.png",
		Tag:   "test-notification",
		Data: map[string]interface{}{
			"type":      "test",
			"timestamp": time.Now().Unix(),
		},
	}

	// Send to user's subscriptions
	if err := h.pushService.SendNotificationToUser(r.Context(), userCtx.UserID, payload); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to send test notification: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test notification sent",
	})
}

// handleGetStats returns push notification statistics
func (h *PushHandler) handleGetStats(w http.ResponseWriter, r *http.Request) {
	// Get push service stats
	pushStats := h.pushService.GetStats()

	// Get subscription stats
	subscriptionStats, err := h.getSubscriptionStats()
	if err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to get subscription stats: %v", err), http.StatusInternalServerError)
		return
	}

	stats := map[string]interface{}{
		"push":          pushStats,
		"subscriptions": subscriptionStats,
		"timestamp":     time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// handleBroadcast sends a broadcast notification to all users
func (h *PushHandler) handleBroadcast(w http.ResponseWriter, r *http.Request) {
	// This is an admin-only endpoint - in a real implementation you'd check admin role

	var req struct {
		Title string                 `json:"title"`
		Body  string                 `json:"body"`
		Icon  string                 `json:"icon,omitempty"`
		Tag   string                 `json:"tag,omitempty"`
		Data  map[string]interface{} `json:"data,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if req.Title == "" || req.Body == "" {
		h.writeJSONError(w, "Title and body are required", http.StatusBadRequest)
		return
	}

	payload := &NotificationPayload{
		Title: req.Title,
		Body:  req.Body,
		Icon:  req.Icon,
		Tag:   req.Tag,
		Data:  req.Data,
	}

	if err := h.pushService.BroadcastNotification(r.Context(), payload); err != nil {
		h.writeJSONError(w, fmt.Sprintf("Failed to broadcast notification: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Broadcast notification sent",
	})
}

// handleGetStatus returns push notification service status
func (h *PushHandler) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	// Get VAPID key status
	keys, err := h.vapidKeyManager.GetOrGenerateKeys()
	hasKeys := err == nil && keys != nil

	// Get subscription count
	all, err := h.subscriptionStore.GetAll()
	subscriptionCount := 0
	if err == nil {
		subscriptionCount = len(all)
	}

	// Get active subscription count
	active, err := h.subscriptionStore.GetActive()
	activeCount := 0
	if err == nil {
		activeCount = len(active)
	}

	status := map[string]interface{}{
		"enabled":             true,
		"vapidKeysReady":      hasKeys,
		"subscriptions":       subscriptionCount,
		"activeSubscriptions": activeCount,
		"serviceUp":           true,
		"timestamp":           time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleTestNotificationAlt is an alternative test notification endpoint
func (h *PushHandler) handleTestNotificationAlt(w http.ResponseWriter, r *http.Request) {
	// This is just an alias for the main test endpoint
	h.handleTestNotification(w, r)
}

// getSubscriptionStats returns subscription statistics
func (h *PushHandler) getSubscriptionStats() (interface{}, error) {
	// Try to get stats if the store supports it
	if statsProvider, ok := h.subscriptionStore.(*InMemorySubscriptionStore); ok {
		return statsProvider.GetStats()
	}

	// Fallback to basic stats
	all, err := h.subscriptionStore.GetAll()
	if err != nil {
		return nil, err
	}

	active, err := h.subscriptionStore.GetActive()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"total":    len(all),
		"active":   len(active),
		"inactive": len(all) - len(active),
	}, nil
}

// writeJSONError writes a JSON error response
func (h *PushHandler) writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
