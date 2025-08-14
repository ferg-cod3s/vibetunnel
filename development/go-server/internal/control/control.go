package control

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// ControlEvent represents a control event that can be sent over SSE
type ControlEvent struct {
	Category string      `json:"category"`
	Action   string      `json:"action"`
	Data     interface{} `json:"data,omitempty"`
}

// ControlService handles control event streaming
type ControlService struct {
	clients    map[string]*Client
	clientsMux sync.RWMutex
	events     chan ControlEvent
}

// Client represents a connected SSE client
type Client struct {
	id       string
	writer   http.ResponseWriter
	flusher  http.Flusher
	done     chan bool
	lastSeen time.Time
}

// NewControlService creates a new control service
func NewControlService() *ControlService {
	cs := &ControlService{
		clients: make(map[string]*Client),
		events:  make(chan ControlEvent, 100), // Buffered channel
	}

	// Start the event broadcaster goroutine
	go cs.broadcastEvents()

	// Start cleanup goroutine for stale clients
	go cs.cleanupStaleClients()

	return cs
}

// RegisterRoutes registers control-related routes
func (cs *ControlService) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/api/control/stream", cs.handleControlStream).Methods("GET")
	router.HandleFunc("/api/control/event", cs.handleSendEvent).Methods("POST") // For testing
}

// BroadcastEvent sends an event to all connected clients
func (cs *ControlService) BroadcastEvent(event ControlEvent) {
	select {
	case cs.events <- event:
		log.Printf("Broadcasted control event: %s/%s", event.Category, event.Action)
	default:
		log.Printf("Warning: Control event channel full, dropping event: %s/%s", event.Category, event.Action)
	}
}

// broadcastEvents runs in a goroutine to broadcast events to all clients
func (cs *ControlService) broadcastEvents() {
	for event := range cs.events {
		cs.clientsMux.RLock()
		for clientID, client := range cs.clients {
			select {
			case <-client.done:
				// Client is done, skip
				continue
			default:
				if err := cs.sendEventToClient(client, event); err != nil {
					log.Printf("Failed to send event to client %s: %v", clientID, err)
					// Mark client for cleanup
					close(client.done)
				} else {
					client.lastSeen = time.Now()
				}
			}
		}
		cs.clientsMux.RUnlock()
	}
}

// sendEventToClient sends a single event to a specific client
func (cs *ControlService) sendEventToClient(client *Client, event ControlEvent) error {
	eventData, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	_, err = fmt.Fprintf(client.writer, "data: %s\n\n", eventData)
	if err != nil {
		return fmt.Errorf("failed to write event: %w", err)
	}

	client.flusher.Flush()
	return nil
}

// cleanupStaleClients removes clients that haven't been seen recently
func (cs *ControlService) cleanupStaleClients() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cs.clientsMux.Lock()
		for clientID, client := range cs.clients {
			select {
			case <-client.done:
				// Client is done, remove it
				delete(cs.clients, clientID)
				log.Printf("Removed disconnected control client: %s", clientID)
			default:
				// Check if client is stale (no activity for 5 minutes)
				if time.Since(client.lastSeen) > 5*time.Minute {
					close(client.done)
					delete(cs.clients, clientID)
					log.Printf("Removed stale control client: %s", clientID)
				}
			}
		}
		cs.clientsMux.Unlock()
	}
}

// handleControlStream handles the SSE stream for control events
func (cs *ControlService) handleControlStream(w http.ResponseWriter, r *http.Request) {
	// Check if response writer supports flushing
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // Disable Nginx buffering

	// Send initial connection message
	fmt.Fprint(w, ":ok\n\n")
	flusher.Flush()

	// Create client
	clientID := fmt.Sprintf("client_%d", time.Now().UnixNano())
	client := &Client{
		id:       clientID,
		writer:   w,
		flusher:  flusher,
		done:     make(chan bool),
		lastSeen: time.Now(),
	}

	// Register client
	cs.clientsMux.Lock()
	cs.clients[clientID] = client
	cs.clientsMux.Unlock()

	log.Printf("Control event stream connected: %s", clientID)

	// Send heartbeat messages
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	// Handle client lifecycle
	defer func() {
		cs.clientsMux.Lock()
		delete(cs.clients, clientID)
		cs.clientsMux.Unlock()
		close(client.done)
		log.Printf("Control event stream disconnected: %s", clientID)
	}()

	// Event loop
	for {
		select {
		case <-r.Context().Done():
			// Client disconnected
			return
		case <-client.done:
			// Client marked for cleanup
			return
		case <-heartbeatTicker.C:
			// Send heartbeat
			if _, err := fmt.Fprint(w, ":heartbeat\n\n"); err != nil {
				log.Printf("Failed to send heartbeat to client %s: %v", clientID, err)
				return
			}
			flusher.Flush()
			client.lastSeen = time.Now()
		}
	}
}

// handleSendEvent handles manual event sending (for testing)
func (cs *ControlService) handleSendEvent(w http.ResponseWriter, r *http.Request) {
	var event ControlEvent

	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate event
	if event.Category == "" || event.Action == "" {
		http.Error(w, "Missing category or action", http.StatusBadRequest)
		return
	}

	// Broadcast the event
	cs.BroadcastEvent(event)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "event sent"})
}

// GetClientCount returns the number of connected clients
func (cs *ControlService) GetClientCount() int {
	cs.clientsMux.RLock()
	defer cs.clientsMux.RUnlock()
	return len(cs.clients)
}
