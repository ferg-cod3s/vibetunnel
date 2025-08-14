package buffer

import (
	"encoding/binary"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// TerminalSnapshot represents a terminal buffer state
type TerminalSnapshot struct {
	Cols      int            `json:"cols"`
	Rows      int            `json:"rows"`
	ViewportY int            `json:"viewportY"`
	CursorX   int            `json:"cursorX"`
	CursorY   int            `json:"cursorY"`
	Cells     [][]BufferCell `json:"cells"`
}

// BufferCell represents a single terminal cell
type BufferCell struct {
	Char      string `json:"char"`
	FgColor   int    `json:"fgColor"`
	BgColor   int    `json:"bgColor"`
	Bold      bool   `json:"bold"`
	Italic    bool   `json:"italic"`
	Underline bool   `json:"underline"`
	Strikeout bool   `json:"strikeout"`
	Inverse   bool   `json:"inverse"`
	Dim       bool   `json:"dim"`
	Blink     bool   `json:"blink"`
}

// WebSocket message types
type MessageType struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId,omitempty"`
	Version   string `json:"version,omitempty"`
	Message   string `json:"message,omitempty"`
}

// BufferUpdateHandler function type for buffer subscriptions
type BufferUpdateHandler func(sessionID string, snapshot TerminalSnapshot)

// Client represents a connected WebSocket client
type Client struct {
	ws            *websocket.Conn
	subscriptions map[string]bool
	send          chan []byte
	done          chan struct{}
	mu            sync.RWMutex
}

// BufferAggregator manages WebSocket connections and buffer streaming
type BufferAggregator struct {
	clients       map[*Client]bool
	subscriptions map[string]map[*Client]bool // sessionID -> clients
	register      chan *Client
	unregister    chan *Client
	broadcast     chan BufferMessage
	mu            sync.RWMutex
	upgrader      websocket.Upgrader
	running       bool
	stopChan      chan struct{}
}

// AggregatorState is a read-only snapshot of aggregator internals
type AggregatorState struct {
	ClientCount        int
	SubscriptionsCount map[string]int
}

// StateSnapshot returns a thread-safe snapshot for tests/metrics
func (ba *BufferAggregator) StateSnapshot() AggregatorState {
	ba.mu.RLock()
	defer ba.mu.RUnlock()
	state := AggregatorState{
		ClientCount:        len(ba.clients),
		SubscriptionsCount: make(map[string]int, len(ba.subscriptions)),
	}
	for sid, clients := range ba.subscriptions {
		state.SubscriptionsCount[sid] = len(clients)
	}
	return state
}

// BufferMessage represents a buffer update message
type BufferMessage struct {
	SessionID string
	Buffer    []byte
}

const (
	// Magic byte for binary buffer messages
	BufferMagicByte = 0xBF

	// WebSocket configuration
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512KB max message size
)

// NewBufferAggregator creates a new buffer aggregator
func NewBufferAggregator() *BufferAggregator {
	return &BufferAggregator{
		clients:       make(map[*Client]bool),
		subscriptions: make(map[string]map[*Client]bool),
		register:      make(chan *Client, 256),
		unregister:    make(chan *Client, 256),
		broadcast:     make(chan BufferMessage, 256),
		stopChan:      make(chan struct{}),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow connections from any origin in development
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// Start runs the buffer aggregator event loop
func (ba *BufferAggregator) Start() {
	ba.mu.Lock()
	if ba.running {
		ba.mu.Unlock()
		return
	}
	ba.running = true
	ba.mu.Unlock()

	for {
		select {
		case client := <-ba.register:
			ba.registerClient(client)

		case client := <-ba.unregister:
			ba.unregisterClient(client)

		case message := <-ba.broadcast:
			ba.broadcastMessage(message)

		case <-ba.stopChan:
			ba.mu.Lock()
			ba.running = false
			ba.mu.Unlock()
			return
		}
	}
}

// HandleWebSocket upgrades HTTP connection to WebSocket for buffer streaming
func (ba *BufferAggregator) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := ba.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		ws:            conn,
		subscriptions: make(map[string]bool),
		send:          make(chan []byte, 256),
		done:          make(chan struct{}),
	}

	ba.register <- client

	// Start client goroutines AFTER registration to avoid race with test reads
	go ba.clientWritePump(client)
	go ba.clientReadPump(client)
}

// registerClient adds a new client to the aggregator
func (ba *BufferAggregator) registerClient(client *Client) {
	ba.mu.Lock()
	defer ba.mu.Unlock()

	ba.clients[client] = true
	log.Printf("Buffer client connected (total: %d)", len(ba.clients))

	// Send welcome message
	welcome := MessageType{
		Type:    "connected",
		Version: "1.0",
	}
	if data, err := json.Marshal(welcome); err == nil {
		select {
		case client.send <- data:
		default:
			close(client.send)
		}
	}
}

// unregisterClient removes a client from the aggregator
func (ba *BufferAggregator) unregisterClient(client *Client) {
	ba.mu.Lock()
	defer ba.mu.Unlock()

	if _, ok := ba.clients[client]; ok {
		// Remove client from all subscriptions
		client.mu.RLock()
		for sessionID := range client.subscriptions {
			if clients, exists := ba.subscriptions[sessionID]; exists {
				delete(clients, client)
				if len(clients) == 0 {
					delete(ba.subscriptions, sessionID)
				}
			}
		}
		client.mu.RUnlock()

		delete(ba.clients, client)
		close(client.send)
		client.ws.Close()

		log.Printf("Buffer client disconnected (total: %d)", len(ba.clients))
	}
}

// broadcastMessage sends buffer updates to subscribed clients
func (ba *BufferAggregator) broadcastMessage(message BufferMessage) {
	ba.mu.RLock()
	orig := ba.subscriptions[message.SessionID]
	// Snapshot clients under lock to avoid concurrent map iteration
	var clients []*Client
	for c := range orig {
		clients = append(clients, c)
	}
	ba.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.send <- message.Buffer:
		default:
			// Client send channel is full, remove it via control channel
			go func(c *Client) { ba.unregister <- c }(client)
		}
	}
}

// clientReadPump handles incoming messages from client
func (ba *BufferAggregator) clientReadPump(client *Client) {
	defer func() {
		ba.unregister <- client
		client.ws.Close()
	}()

	client.ws.SetReadLimit(maxMessageSize)
	client.ws.SetReadDeadline(time.Now().Add(pongWait))
	client.ws.SetPongHandler(func(string) error {
		client.ws.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := client.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg MessageType
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Invalid message format: %v", err)
			continue
		}

		ba.handleClientMessage(client, msg)
	}
}

// clientWritePump handles outgoing messages to client
func (ba *BufferAggregator) clientWritePump(client *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.ws.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			client.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				client.ws.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Determine message type based on content
			var messageType int
			if len(message) > 0 && message[0] == BufferMagicByte {
				messageType = websocket.BinaryMessage
			} else {
				messageType = websocket.TextMessage
			}

			// Send message
			if err := client.ws.WriteMessage(messageType, message); err != nil {
				log.Printf("Write error: %v", err)
				return
			}

		case <-ticker.C:
			client.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-client.done:
			return
		}
	}
}

// handleClientMessage processes messages from clients
func (ba *BufferAggregator) handleClientMessage(client *Client, msg MessageType) {
	switch msg.Type {
	case "subscribe":
		if msg.SessionID != "" {
			ba.subscribeClient(client, msg.SessionID)
		}

	case "unsubscribe":
		if msg.SessionID != "" {
			ba.unsubscribeClient(client, msg.SessionID)
		}

	case "ping":
		// Respond with pong
		pong := MessageType{Type: "pong"}
		if data, err := json.Marshal(pong); err == nil {
			select {
			case client.send <- data:
			default:
				// Client send channel is full
			}
		}
	}
}

// subscribeClient subscribes a client to session updates
func (ba *BufferAggregator) subscribeClient(client *Client, sessionID string) {
	ba.mu.Lock()
	defer ba.mu.Unlock()

	// Add client to session subscriptions
	if _, exists := ba.subscriptions[sessionID]; !exists {
		ba.subscriptions[sessionID] = make(map[*Client]bool)
	}
	ba.subscriptions[sessionID][client] = true

	// Add subscription to client
	client.mu.Lock()
	client.subscriptions[sessionID] = true
	client.mu.Unlock()

	log.Printf("Client subscribed to session %s", sessionID)

	// Send confirmation
	response := MessageType{
		Type:      "subscribed",
		SessionID: sessionID,
	}
	if data, err := json.Marshal(response); err == nil {
		select {
		case client.send <- data:
		default:
			// Client send channel is full
		}
	}

	// TODO: Send initial buffer snapshot
	// This would need integration with the terminal manager
}

// unsubscribeClient unsubscribes a client from session updates
func (ba *BufferAggregator) unsubscribeClient(client *Client, sessionID string) {
	ba.mu.Lock()
	defer ba.mu.Unlock()

	// Remove client from session subscriptions
	if clients, exists := ba.subscriptions[sessionID]; exists {
		delete(clients, client)
		if len(clients) == 0 {
			delete(ba.subscriptions, sessionID)
		}
	}

	// Remove subscription from client
	client.mu.Lock()
	delete(client.subscriptions, sessionID)
	client.mu.Unlock()

	log.Printf("Client unsubscribed from session %s", sessionID)
}

// BroadcastBuffer sends buffer updates to subscribed clients
func (ba *BufferAggregator) BroadcastBuffer(sessionID string, snapshot TerminalSnapshot) {
	// Encode snapshot to binary format
	buffer := ba.encodeSnapshot(snapshot)

	// Create binary message with protocol format
	sessionIDBytes := []byte(sessionID)
	totalLength := 1 + 4 + len(sessionIDBytes) + len(buffer)
	fullBuffer := make([]byte, totalLength)

	offset := 0
	// Magic byte
	fullBuffer[offset] = BufferMagicByte
	offset += 1

	// Session ID length (little-endian)
	binary.LittleEndian.PutUint32(fullBuffer[offset:], uint32(len(sessionIDBytes)))
	offset += 4

	// Session ID
	copy(fullBuffer[offset:], sessionIDBytes)
	offset += len(sessionIDBytes)

	// Buffer data
	copy(fullBuffer[offset:], buffer)

	// Broadcast to subscribed clients
	message := BufferMessage{
		SessionID: sessionID,
		Buffer:    fullBuffer,
	}

	select {
	case ba.broadcast <- message:
	default:
		log.Printf("Broadcast channel full, dropping buffer update for session %s", sessionID)
	}
}

// encodeSnapshot converts terminal snapshot to binary format
func (ba *BufferAggregator) encodeSnapshot(snapshot TerminalSnapshot) []byte {
	// Simple JSON encoding for now - could be optimized to binary format
	data, err := json.Marshal(snapshot)
	if err != nil {
		log.Printf("Failed to encode snapshot: %v", err)
		return []byte{}
	}
	return data
}

// Stop shuts down the buffer aggregator
func (ba *BufferAggregator) Stop() {
	ba.mu.Lock()
	defer ba.mu.Unlock()

	if !ba.running {
		return
	}

	// Signal stop
	close(ba.stopChan)

	// Close all client connections
	for client := range ba.clients {
		close(client.done)
		client.ws.Close()
	}

	// Clear all data
	ba.clients = make(map[*Client]bool)
	ba.subscriptions = make(map[string]map[*Client]bool)

	log.Println("Buffer aggregator stopped")
}
