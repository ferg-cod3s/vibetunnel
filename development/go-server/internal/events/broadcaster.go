package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

// Client represents a connected SSE client
type Client struct {
	ID       string
	Channel  chan *types.ServerEvent
	Writer   http.ResponseWriter
	Request  *http.Request
	Flusher  http.Flusher
	LastSeen time.Time
}

// NewClient creates a new SSE client
func NewClient(id string, w http.ResponseWriter, r *http.Request) (*Client, error) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return nil, fmt.Errorf("response writer does not support flushing")
	}

	return &Client{
		ID:       id,
		Channel:  make(chan *types.ServerEvent, 100), // Buffer up to 100 events
		Writer:   w,
		Request:  r,
		Flusher:  flusher,
		LastSeen: time.Now(),
	}, nil
}

// EventBroadcaster manages Server-Sent Events broadcasting to multiple clients
type EventBroadcaster struct {
	clients       map[string]*Client
	eventChannel  chan *types.ServerEvent
	register      chan *Client
	unregister    chan *Client
	mu            sync.RWMutex
	ctx           context.Context
	cancel        context.CancelFunc
	heartbeatTick time.Duration
	clientTimeout time.Duration
}

// NewEventBroadcaster creates a new event broadcaster
func NewEventBroadcaster() *EventBroadcaster {
	ctx, cancel := context.WithCancel(context.Background())

	return &EventBroadcaster{
		clients:       make(map[string]*Client),
		eventChannel:  make(chan *types.ServerEvent, 1000), // Large buffer for events
		register:      make(chan *Client),
		unregister:    make(chan *Client),
		ctx:           ctx,
		cancel:        cancel,
		heartbeatTick: 30 * time.Second,
		clientTimeout: 2 * time.Minute,
	}
}

// Start begins the broadcaster's event loop
func (eb *EventBroadcaster) Start() {
	go eb.eventLoop()
	go eb.heartbeatLoop()
	log.Println("📡 Event broadcaster started")
}

// Stop shuts down the broadcaster
func (eb *EventBroadcaster) Stop() {
	eb.cancel()

	// Close all client connections
	eb.mu.Lock()
	for _, client := range eb.clients {
		close(client.Channel)
	}
	eb.clients = make(map[string]*Client)
	eb.mu.Unlock()

	log.Println("📡 Event broadcaster stopped")
}

// Broadcast sends an event to all connected clients
func (eb *EventBroadcaster) Broadcast(event *types.ServerEvent) {
	select {
	case eb.eventChannel <- event:
		log.Printf("📢 Broadcasting event: %s", event.Type)
	default:
		log.Printf("⚠️  Event channel full, dropping event: %s", event.Type)
	}
}

// RegisterClient adds a new SSE client
func (eb *EventBroadcaster) RegisterClient(client *Client) {
	select {
	case eb.register <- client:
	case <-eb.ctx.Done():
		log.Printf("⚠️  Cannot register client %s: broadcaster is shutting down", client.ID)
	}
}

// UnregisterClient removes an SSE client
func (eb *EventBroadcaster) UnregisterClient(client *Client) {
	select {
	case eb.unregister <- client:
	case <-eb.ctx.Done():
		// Broadcaster is shutting down, client will be cleaned up
	}
}

// GetClientCount returns the number of connected clients
func (eb *EventBroadcaster) GetClientCount() int {
	eb.mu.RLock()
	defer eb.mu.RUnlock()
	return len(eb.clients)
}

// eventLoop handles the main event broadcasting logic
func (eb *EventBroadcaster) eventLoop() {
	defer log.Println("📡 Event broadcaster loop stopped")

	for {
		select {
		case <-eb.ctx.Done():
			return

		case client := <-eb.register:
			eb.mu.Lock()
			eb.clients[client.ID] = client
			eb.mu.Unlock()

			log.Printf("📡 Client connected: %s (total: %d)", client.ID, len(eb.clients))

			// Send welcome event
			welcomeEvent := types.NewServerEvent(types.EventConnected)
			go eb.sendEventToClient(client, welcomeEvent)

		case client := <-eb.unregister:
			eb.mu.Lock()
			if _, exists := eb.clients[client.ID]; exists {
				delete(eb.clients, client.ID)
				close(client.Channel)
			}
			eb.mu.Unlock()

			log.Printf("📡 Client disconnected: %s (total: %d)", client.ID, len(eb.clients))

		case event := <-eb.eventChannel:
			// Broadcast to all clients
			eb.mu.RLock()
			clientCount := len(eb.clients)
			eb.mu.RUnlock()

			if clientCount > 0 {
				eb.mu.RLock()
				for _, client := range eb.clients {
					go eb.sendEventToClient(client, event)
				}
				eb.mu.RUnlock()

				log.Printf("📢 Event broadcasted to %d clients: %s", clientCount, event.Type)
			}
		}
	}
}

// heartbeatLoop sends periodic heartbeat events to keep connections alive
func (eb *EventBroadcaster) heartbeatLoop() {
	ticker := time.NewTicker(eb.heartbeatTick)
	defer ticker.Stop()

	for {
		select {
		case <-eb.ctx.Done():
			return
		case <-ticker.C:
			eb.sendHeartbeat()
			eb.cleanupStaleClients()
		}
	}
}

// sendHeartbeat sends a heartbeat to all clients
func (eb *EventBroadcaster) sendHeartbeat() {
	eb.mu.RLock()
	defer eb.mu.RUnlock()

	for _, client := range eb.clients {
		go func(c *Client) {
			// Send SSE comment as heartbeat (doesn't trigger client events)
			if err := eb.writeSSEComment(c, "heartbeat"); err != nil {
				log.Printf("⚠️  Failed to send heartbeat to client %s: %v", c.ID, err)
				eb.UnregisterClient(c)
			}
		}(client)
	}
}

// cleanupStaleClients removes clients that haven't been seen recently
func (eb *EventBroadcaster) cleanupStaleClients() {
	cutoff := time.Now().Add(-eb.clientTimeout)

	eb.mu.Lock()
	defer eb.mu.Unlock()

	for id, client := range eb.clients {
		if client.LastSeen.Before(cutoff) {
			log.Printf("⚠️  Removing stale client: %s", id)
			delete(eb.clients, id)
			close(client.Channel)
		}
	}
}

// sendEventToClient sends an event to a specific client
func (eb *EventBroadcaster) sendEventToClient(client *Client, event *types.ServerEvent) {
	select {
	case client.Channel <- event:
		// Event queued successfully
	default:
		log.Printf("⚠️  Client %s event channel full, dropping event: %s", client.ID, event.Type)
		// Don't unregister immediately - client might catch up
	}
}

// writeSSEEvent writes an SSE event to a client
func (eb *EventBroadcaster) writeSSEEvent(client *Client, event *types.ServerEvent, eventID int) error {
	// Marshal event data
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %v", err)
	}

	// Write SSE formatted event
	sseMessage := fmt.Sprintf("id: %d\nevent: %s\ndata: %s\n\n", eventID, event.Type, string(data))

	if _, err := client.Writer.Write([]byte(sseMessage)); err != nil {
		return fmt.Errorf("failed to write SSE event: %v", err)
	}

	client.Flusher.Flush()
	client.LastSeen = time.Now()

	return nil
}

// writeSSEComment writes an SSE comment to a client
func (eb *EventBroadcaster) writeSSEComment(client *Client, comment string) error {
	sseComment := fmt.Sprintf(":%s\n\n", comment)

	if _, err := client.Writer.Write([]byte(sseComment)); err != nil {
		return fmt.Errorf("failed to write SSE comment: %v", err)
	}

	client.Flusher.Flush()
	client.LastSeen = time.Now()

	return nil
}

// HandleSSE handles Server-Sent Events HTTP connections
func (eb *EventBroadcaster) HandleSSE(w http.ResponseWriter, r *http.Request) {
	// Generate client ID
	clientID := fmt.Sprintf("client-%d", time.Now().UnixNano())

	// Create client
	client, err := NewClient(clientID, w, r)
	if err != nil {
		http.Error(w, "Server-Sent Events not supported", http.StatusInternalServerError)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no") // Disable proxy buffering

	// Register client
	eb.RegisterClient(client)

	// Handle client lifecycle
	defer func() {
		eb.UnregisterClient(client)
		log.Printf("📡 SSE connection closed for client: %s", client.ID)
	}()

	// Event loop for this client
	eventID := 0
	for {
		select {
		case <-r.Context().Done():
			// Client disconnected
			return

		case event, ok := <-client.Channel:
			if !ok {
				// Channel closed, client being removed
				return
			}

			// Send event to client
			eventID++
			if err := eb.writeSSEEvent(client, event, eventID); err != nil {
				log.Printf("⚠️  Failed to send event to client %s: %v", client.ID, err)
				return
			}
		}
	}
}
