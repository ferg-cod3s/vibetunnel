package types

import (
	"os/exec"
	"time"

	"github.com/gorilla/websocket"
)

// Session represents a terminal session
type Session struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Command   string    `json:"command"`
	Cwd       string    `json:"cwd"`
	Cols      int       `json:"cols"`
	Rows      int       `json:"rows"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	Active    bool      `json:"active"`
	
	// Internal fields (not serialized)
	PTY     interface{}  `json:"-"` // Will be *os.File from pty.Start()
	Cmd     *exec.Cmd    `json:"-"`
	Clients []*WSClient  `json:"-"`
}

// WSClient represents a WebSocket client connected to a session
type WSClient struct {
	ID         string
	Conn       *websocket.Conn
	SessionID  string
	LastPing   time.Time
	Send       chan []byte
	Done       chan struct{}
}

// SessionCreateRequest represents a request to create a new session
type SessionCreateRequest struct {
	Command string `json:"command,omitempty"`
	Cwd     string `json:"cwd,omitempty"`
	Title   string `json:"title,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
}

// SessionResponse represents a session in API responses
type SessionResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Command   string    `json:"command"`
	Cwd       string    `json:"cwd"`
	Cols      int       `json:"cols"`
	Rows      int       `json:"rows"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	Active    bool      `json:"active"`
	Clients   int       `json:"clients"`
}

// ResizeRequest represents a terminal resize request
type ResizeRequest struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

// InputMessage represents input from WebSocket client
type InputMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
}

// OutputMessage represents output to WebSocket client
type OutputMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}
