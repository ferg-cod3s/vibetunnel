package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

func TestWebSocketHandler_MissingSessionID(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Try to connect without sessionId parameter
	_, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.Error(t, err)
	// WebSocket upgrade fails when server returns HTTP error, so we get "bad handshake"
	assert.Contains(t, err.Error(), "bad handshake")
}

func TestWebSocketHandler_NonExistentSession(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL and add sessionId parameter
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=non-existent"

	// Try to connect with non-existent session
	_, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.Error(t, err)
	// WebSocket upgrade fails when server returns HTTP error, so we get "bad handshake"
	assert.Contains(t, err.Error(), "bad handshake")
}

func TestWebSocketHandler_ValidConnection(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create a test session first
	req := &types.SessionCreateRequest{
		Command: "echo 'test'",
		Title:   "Test Session",
	}
	session, err := sessionManager.Create(req)
	require.NoError(t, err)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL and add sessionId parameter
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=" + session.ID

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	// Connection should be successful
	assert.NotNil(t, conn)

	// Close the session
	err = sessionManager.Close(session.ID)
	assert.NoError(t, err)
}

func TestWebSocketHandler_InputHandling(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create a test session
	req := &types.SessionCreateRequest{
		Command: "cat", // Echo input back
		Title:   "Test Session",
	}
	session, err := sessionManager.Create(req)
	require.NoError(t, err)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=" + session.ID

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	// Send raw input
	testInput := "hello\n"
	err = conn.WriteMessage(websocket.TextMessage, []byte(testInput))
	assert.NoError(t, err)

	// Give it time to process
	time.Sleep(100 * time.Millisecond)

	// Clean up
	err = sessionManager.Close(session.ID)
	assert.NoError(t, err)
}

func TestWebSocketHandler_ResizeHandling(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create a test session
	req := &types.SessionCreateRequest{
		Command: "sleep 5",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	session, err := sessionManager.Create(req)
	require.NoError(t, err)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=" + session.ID

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	defer conn.Close()

	// Send resize message
	resizeMsg := `{"type": "resize", "data": "{\"cols\": 100, \"rows\": 30}"}`
	err = conn.WriteMessage(websocket.TextMessage, []byte(resizeMsg))
	assert.NoError(t, err)

	// Give it time to process
	time.Sleep(100 * time.Millisecond)

	// Verify the session was resized
	ptySession := sessionManager.GetPTYSession(session.ID)
	require.NotNil(t, ptySession)
	assert.Equal(t, 100, ptySession.Cols)
	assert.Equal(t, 30, ptySession.Rows)

	// Clean up
	err = sessionManager.Close(session.ID)
	assert.NoError(t, err)
}

func TestWebSocketHandler_ClientCleanup(t *testing.T) {
	sessionManager := session.NewManager()
	handler := NewHandler(sessionManager)

	// Create a test session
	req := &types.SessionCreateRequest{
		Command: "sleep 10",
		Title:   "Test Session",
	}
	session, err := sessionManager.Create(req)
	require.NoError(t, err)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(handler.HandleWebSocket))
	defer server.Close()

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=" + session.ID

	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	// Get the PTY session and verify client was added
	ptySession := sessionManager.GetPTYSession(session.ID)
	require.NotNil(t, ptySession)

	// Give it time for the client to be registered
	time.Sleep(50 * time.Millisecond)

	// Verify client was added (should have 1 client)
	clients := ptySession.GetClients()
	assert.Len(t, clients, 1)

	// Close the WebSocket connection
	conn.Close()

	// Poll for client cleanup (WebSocket cleanup is asynchronous)
	// Give it up to 2 seconds for cleanup to complete
	for i := 0; i < 20; i++ {
		time.Sleep(100 * time.Millisecond)
		clients = ptySession.GetClients()
		if len(clients) == 0 {
			break
		}
	}

	// Verify client was removed
	assert.Len(t, clients, 0)

	// Clean up
	err = sessionManager.Close(session.ID)
	assert.NoError(t, err)
}
