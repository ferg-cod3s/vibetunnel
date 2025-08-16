package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/ferg-cod3s/vibetunnel/go-server/internal/session"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/terminal"
	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

// buildUpgrader builds a websocket.Upgrader with origin checks against allowedOrigins.
func (h *Handler) buildUpgrader() websocket.Upgrader {
	return websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			// If wildcard, allow all
			if len(h.allowedOrigins) == 0 || (len(h.allowedOrigins) == 1 && h.allowedOrigins[0] == "*") {
				return true
			}
			origin := r.Header.Get("Origin")
			for _, allowed := range h.allowedOrigins {
				if allowed == origin {
					return true
				}
			}
			return false
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}
}

type Handler struct {
	sessionManager *session.Manager
	clients        map[string]*Client
	clientsMu      sync.RWMutex
	allowedOrigins []string
}

// SetAllowedOrigins configures allowed Origin values for WS upgrade.
func (h *Handler) SetAllowedOrigins(origins []string) {
	h.allowedOrigins = origins
}

type Client struct {
	ID        string
	Conn      *websocket.Conn
	SessionID string
	Send      chan []byte
	Done      chan struct{}
	LastPing  time.Time
}

func NewHandler(sessionManager *session.Manager) *Handler {
	return &Handler{
		sessionManager: sessionManager,
		clients:        make(map[string]*Client),
		allowedOrigins: []string{"*"},
	}
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get session ID from query parameters
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		http.Error(w, "Missing sessionId parameter", http.StatusBadRequest)
		return
	}

	// Verify session exists before upgrading WebSocket
	if h.sessionManager.Get(sessionID) == nil {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}

	// Upgrade to WebSocket with origin checks
	upgrader := h.buildUpgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Create client
	clientID := uuid.New().String()
	client := &Client{
		ID:        clientID,
		Conn:      conn,
		SessionID: sessionID,
		Send:      make(chan []byte, 256),
		Done:      make(chan struct{}),
		LastPing:  time.Now(),
	}

	// Register client
	h.clientsMu.Lock()
	h.clients[clientID] = client
	h.clientsMu.Unlock()

	// Add client to session (triggers lazy initialization for optimized sessions)
	wsClient := &types.WSClient{
		ID:        clientID,
		Conn:      conn,
		SessionID: sessionID,
		Send:      client.Send,
		Done:      client.Done,
		LastPing:  time.Now(),
	}

	if err := h.sessionManager.AddClientToSession(sessionID, wsClient); err != nil {
		log.Printf("Failed to add client to session %s: %v", sessionID[:8], err)
		conn.Close()
		h.clientsMu.Lock()
		delete(h.clients, clientID)
		h.clientsMu.Unlock()
		return
	}

	// Get the PTY session for I/O handling (after initialization)
	ptySession := h.sessionManager.GetPTYSession(sessionID)
	if ptySession == nil {
		log.Printf("PTY session %s not found after client addition", sessionID[:8])
		conn.Close()
		h.clientsMu.Lock()
		delete(h.clients, clientID)
		h.clientsMu.Unlock()
		return
	}

	log.Printf("WebSocket client %s connected to session %s", clientID[:8], sessionID[:8])

	// Start goroutines for this client
	go h.handleClientOutput(client, ptySession)
	go h.handleClientInput(client, ptySession)
	go h.pingClient(client)

	// Wait for client to disconnect
	<-client.Done

	// Clean up
	h.cleanupClient(client, ptySession)
}

// handleClientOutput streams terminal output to WebSocket client
func (h *Handler) handleClientOutput(client *Client, ptySession *terminal.PTYSession) {
	defer func() {
		select {
		case <-client.Done:
			// Already closed
		default:
			close(client.Done)
		}
	}()

	// Set up ping/pong handler
	client.Conn.SetPongHandler(func(string) error {
		client.LastPing = time.Now()
		return nil
	})

	// Set read deadline for ping/pong
	client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	for {
		select {
		case <-client.Done:
			return
		case data := <-client.Send:
			if err := client.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("WebSocket write error for client %s: %v", client.ID[:8], err)
				return
			}
		case <-time.After(30 * time.Second):
			// Send ping
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error for client %s: %v", client.ID[:8], err)
				return
			}
		}
	}
}

// handleClientInput handles input from WebSocket client to terminal
func (h *Handler) handleClientInput(client *Client, ptySession *terminal.PTYSession) {
	defer func() {
		select {
		case <-client.Done:
			// Already closed
		default:
			close(client.Done)
		}
	}()

	for {
		select {
		case <-client.Done:
			return
		default:
			_, message, err := client.Conn.ReadMessage()
			if err != nil {
				if !websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket read error for client %s: %v", client.ID[:8], err)
				}
				return
			}

			// Parse message
			var inputMsg types.InputMessage
			if err := json.Unmarshal(message, &inputMsg); err != nil {
				// If it's not JSON, treat as raw input
				if err := ptySession.WriteInput(message); err != nil {
					log.Printf("Failed to write input to PTY: %v", err)
				}
				continue
			}

			// Handle different message types
			switch inputMsg.Type {
			case "input":
				if err := ptySession.WriteInput([]byte(inputMsg.Data)); err != nil {
					log.Printf("Failed to write input to PTY: %v", err)
				}
			case "resize":
				// Handle resize request
				var resizeReq types.ResizeRequest
				if err := json.Unmarshal([]byte(inputMsg.Data), &resizeReq); err != nil {
					log.Printf("Invalid resize request: %v", err)
					continue
				}
				if err := ptySession.Resize(resizeReq.Cols, resizeReq.Rows); err != nil {
					log.Printf("Failed to resize PTY: %v", err)
				}
			case "ping":
				// Handle ping from client
				client.LastPing = time.Now()
			default:
				log.Printf("Unknown message type: %s", inputMsg.Type)
			}
		}
	}
}

// pingClient sends periodic pings to keep connection alive
func (h *Handler) pingClient(client *Client) {
	defer func() {
		select {
		case <-client.Done:
			// Already closed
		default:
			close(client.Done)
		}
	}()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-client.Done:
			return
		case <-ticker.C:
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Failed to ping client %s: %v", client.ID[:8], err)
				return
			}

			// Check if client is still responsive
			if time.Since(client.LastPing) > 2*time.Minute {
				log.Printf("Client %s timed out", client.ID[:8])
				return
			}
		}
	}
}

// cleanupClient removes client from session and manager
func (h *Handler) cleanupClient(client *Client, ptySession *terminal.PTYSession) {
	// Remove from session
	ptySession.RemoveClient(client.ID)

	// Remove from manager
	h.clientsMu.Lock()
	delete(h.clients, client.ID)
	h.clientsMu.Unlock()

	// Close connection
	client.Conn.Close()

	log.Printf("WebSocket client %s disconnected from session %s", client.ID[:8], client.SessionID[:8])
}
