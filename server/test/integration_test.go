package test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/server"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// Frontend Integration Test Suite
// Tests the complete integration between Go server and frontend expectations

func TestFrontendIntegration(t *testing.T) {
	// Create test server with default config
	srv, err := server.New(&server.Config{
		Port: "0", // Use random port for testing
	})
	require.NoError(t, err)

	testServer := httptest.NewServer(srv.Handler())
	defer testServer.Close()

	// Extract host for WebSocket connections
	wsURL := "ws" + strings.TrimPrefix(testServer.URL, "http")

	t.Run("Frontend_API_Compatibility", func(t *testing.T) {
		testFrontendAPICompatibility(t, testServer.URL)
	})

	t.Run("Frontend_WebSocket_Integration", func(t *testing.T) {
		testFrontendWebSocketIntegration(t, wsURL)
	})

	t.Run("Frontend_Session_Lifecycle", func(t *testing.T) {
		testFrontendSessionLifecycle(t, testServer.URL, wsURL)
	})

	t.Run("Frontend_Authentication_Integration", func(t *testing.T) {
		testFrontendAuthenticationIntegration(t, testServer.URL)
	})

	t.Run("Frontend_Error_Handling", func(t *testing.T) {
		testFrontendErrorHandling(t, testServer.URL)
	})
}

func testFrontendAPICompatibility(t *testing.T, baseURL string) {
	t.Run("Health_Check_Endpoint", func(t *testing.T) {
		// Frontend expects /health endpoint to return JSON status
		resp, err := http.Get(baseURL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		assert.Equal(t, "application/json", resp.Header.Get("Content-Type"))

		var health map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&health)
		require.NoError(t, err)

		// Frontend expects these fields
		assert.Contains(t, health, "status")
		assert.Equal(t, "ok", health["status"])
		assert.Contains(t, health, "sessions")
	})

	t.Run("CORS_Headers", func(t *testing.T) {
		// Frontend needs CORS headers for cross-origin requests
		client := &http.Client{}
		req, _ := http.NewRequest("OPTIONS", baseURL+"/api/sessions", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Content-Type")

		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Check CORS headers that frontend expects
		assert.Equal(t, "*", resp.Header.Get("Access-Control-Allow-Origin"))
		assert.Contains(t, resp.Header.Get("Access-Control-Allow-Methods"), "POST")
		assert.Contains(t, resp.Header.Get("Access-Control-Allow-Headers"), "Content-Type")
	})

	t.Run("Session_API_Endpoints", func(t *testing.T) {
		// Test session creation endpoint format that frontend expects
		sessionData := map[string]interface{}{
			"shell": "/bin/bash",
			"cwd":   "/tmp",
		}
		jsonData, err := json.Marshal(sessionData)
		require.NoError(t, err)

		resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusCreated, resp.StatusCode)

		var result types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)

		// Frontend expects these session fields
		assert.NotEmpty(t, result.ID)
		assert.NotEmpty(t, result.Command)
		assert.NotEmpty(t, result.CreatedAt)
		assert.True(t, result.Active)

		// Test session listing endpoint
		resp, err = http.Get(baseURL + "/api/sessions")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var sessionsResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&sessionsResp)
		require.NoError(t, err)
		assert.Contains(t, sessionsResp, "sessions")
		assert.Contains(t, sessionsResp, "count")
	})
}

func testFrontendWebSocketIntegration(t *testing.T, wsURL string) {
	t.Run("WebSocket_Connection_Protocol", func(t *testing.T) {
		// First create a session
		sessionData := map[string]interface{}{
			"shell": "/bin/bash",
		}
		jsonData, err := json.Marshal(sessionData)
		require.NoError(t, err)

		httpURL := strings.Replace(wsURL, "ws://", "http://", 1)
		resp, err := http.Post(httpURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		// Connect to WebSocket with session ID (frontend pattern)
		wsURL := wsURL + "/ws?sessionId=" + session.ID

		dialer := websocket.Dialer{
			HandshakeTimeout: 5 * time.Second,
		}

		conn, _, err := dialer.Dial(wsURL, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Test initial connection message (frontend expects this)
		messageType, message, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.Equal(t, websocket.TextMessage, messageType)

		// Should receive some initial shell output
		assert.NotEmpty(t, string(message)) // Any initial terminal output
	})

	t.Run("WebSocket_Message_Format", func(t *testing.T) {
		// Create session and connect
		sessionData := map[string]interface{}{"shell": "/bin/bash"}
		jsonData, err := json.Marshal(sessionData)
		require.NoError(t, err)
		httpURL := strings.Replace(wsURL, "ws://", "http://", 1)

		resp, err := http.Post(httpURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		// Connect WebSocket
		conn, _, err := (&websocket.Dialer{}).Dial(wsURL+"/ws?sessionId="+session.ID, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Skip initial messages
		for i := 0; i < 3; i++ {
			conn.ReadMessage()
		}

		// Test input message format (frontend sends this)
		inputMsg := map[string]interface{}{
			"type": "input",
			"data": "echo 'test'\n",
		}
		msgBytes, err := json.Marshal(inputMsg)
		require.NoError(t, err)
		err = conn.WriteMessage(websocket.TextMessage, msgBytes)
		require.NoError(t, err)

		// Should receive echo output (may take a moment)
		var foundEcho bool
		for i := 0; i < 5; i++ {
			messageType, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			if messageType == websocket.TextMessage && len(message) > 0 {
				if strings.Contains(string(message), "test") {
					foundEcho = true
					break
				}
			}
		}
		assert.True(t, foundEcho, "Should receive echo output containing 'test'")
	})

	t.Run("WebSocket_Ping_Pong", func(t *testing.T) {
		// Create session and connect
		sessionData := map[string]interface{}{"shell": "/bin/bash"}
		jsonData, err := json.Marshal(sessionData)
		require.NoError(t, err)
		httpURL := strings.Replace(wsURL, "ws://", "http://", 1)

		resp, err := http.Post(httpURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		// Connect WebSocket
		conn, _, err := (&websocket.Dialer{}).Dial(wsURL+"/ws?sessionId="+session.ID, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Send ping message (frontend keepalive)
		pingMsg := map[string]interface{}{
			"type": "ping",
		}
		msgBytes, err := json.Marshal(pingMsg)
		require.NoError(t, err)
		err = conn.WriteMessage(websocket.TextMessage, msgBytes)
		require.NoError(t, err)

		// Should handle ping gracefully (no error)
		time.Sleep(100 * time.Millisecond)
	})
}

func testFrontendSessionLifecycle(t *testing.T, baseURL, wsURL string) {
	t.Run("Complete_Session_Workflow", func(t *testing.T) {
		// 1. Frontend creates session
		sessionData := map[string]interface{}{
			"shell": "/bin/bash",
			"cwd":   "/tmp",
		}
		jsonData, err := json.Marshal(sessionData)
		require.NoError(t, err)

		resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		// 2. Frontend connects WebSocket
		conn, _, err := (&websocket.Dialer{}).Dial(wsURL+"/ws?sessionId="+session.ID, nil)
		require.NoError(t, err)
		defer conn.Close()

		// 3. Frontend interacts with terminal
		inputMsg := map[string]interface{}{
			"type": "input",
			"data": "pwd\n",
		}
		msgBytes, err := json.Marshal(inputMsg)
		require.NoError(t, err)
		err = conn.WriteMessage(websocket.TextMessage, msgBytes)
		require.NoError(t, err)

		// Should receive output
		messageType, message, err := conn.ReadMessage()
		require.NoError(t, err)
		assert.Equal(t, websocket.TextMessage, messageType)
		assert.NotEmpty(t, string(message))

		// 4. Frontend gets session info
		resp, err = http.Get(baseURL + "/api/sessions/" + session.ID)
		require.NoError(t, err)
		defer resp.Body.Close()

		var retrievedSession types.SessionResponse
		err = json.NewDecoder(resp.Body).Decode(&retrievedSession)
		require.NoError(t, err)
		assert.Equal(t, session.ID, retrievedSession.ID)
		assert.True(t, retrievedSession.Active)

		// 5. Frontend closes session
		req, _ := http.NewRequest("DELETE", baseURL+"/api/sessions/"+session.ID, nil)
		client := &http.Client{}
		resp, err = client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusOK, resp.StatusCode)
	})
}

func testFrontendAuthenticationIntegration(t *testing.T, baseURL string) {
	t.Run("JWT_Token_Flow", func(t *testing.T) {
		// Test JWT authentication flow that frontend would use
		// This test will be skipped until authentication is fully integrated
		t.Skip("Authentication integration not yet required - will implement in Priority 2")

		// Future implementation:
		// 1. Frontend gets JWT token
		// 2. Frontend includes token in requests
		// 3. Server validates token
		// 4. Protected endpoints work with valid token
	})

	t.Run("CSRF_Protection", func(t *testing.T) {
		// Test CSRF protection that frontend needs to handle
		t.Skip("CSRF testing will be implemented in Priority 1.3 Security Testing")

		// Future implementation:
		// 1. Frontend gets CSRF token
		// 2. Frontend includes token in state-changing requests
		// 3. Server validates CSRF token
	})
}

func testFrontendErrorHandling(t *testing.T, baseURL string) {
	t.Run("API_Error_Responses", func(t *testing.T) {
		// Test error response format that frontend expects

		// Test 404 for non-existent session
		resp, err := http.Get(baseURL + "/api/sessions/nonexistent")
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusNotFound, resp.StatusCode)

		var errorResp map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&errorResp)
		require.NoError(t, err)

		// Frontend expects error field
		assert.Contains(t, errorResp, "error")
	})

	t.Run("WebSocket_Error_Handling", func(t *testing.T) {
		// Test WebSocket connection to non-existent session
		wsURL := strings.Replace(baseURL, "http://", "ws://", 1)

		_, _, err := websocket.DefaultDialer.Dial(wsURL+"/ws?sessionId=nonexistent", nil)
		// Should fail to connect or close connection immediately
		assert.Error(t, err)
	})

	t.Run("Invalid_JSON_Handling", func(t *testing.T) {
		// Test how server handles invalid JSON from frontend
		invalidJSON := bytes.NewBuffer([]byte(`{"invalid": json`))

		resp, err := http.Post(baseURL+"/api/sessions", "application/json", invalidJSON)
		require.NoError(t, err)
		defer resp.Body.Close()

		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}

// Helper functions for integration testing

func createTestSession(t *testing.T, baseURL string) types.SessionResponse {
	sessionData := map[string]interface{}{
		"shell": "/bin/bash",
	}
	jsonData, err := json.Marshal(sessionData)
	require.NoError(t, err)

	resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
	require.NoError(t, err)
	defer resp.Body.Close()

	var session types.SessionResponse
	err = json.NewDecoder(resp.Body).Decode(&session)
	require.NoError(t, err)

	return session
}

func connectWebSocket(t *testing.T, wsURL, sessionID string) *websocket.Conn {
	conn, _, err := websocket.DefaultDialer.Dial(wsURL+"/ws?sessionId="+sessionID, nil)
	require.NoError(t, err)
	return conn
}

func sendWebSocketMessage(t *testing.T, conn *websocket.Conn, msgType string, data interface{}) {
	msg := map[string]interface{}{
		"type": msgType,
		"data": data,
	}
	msgBytes, err := json.Marshal(msg)
	require.NoError(t, err)
	err = conn.WriteMessage(websocket.TextMessage, msgBytes)
	require.NoError(t, err)
}

func readWebSocketMessage(t *testing.T, conn *websocket.Conn) (int, []byte, error) {
	// Set read deadline to prevent hanging
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	return conn.ReadMessage()
}

// Test data structures that match frontend expectations

type FrontendSession struct {
	ID        string    `json:"id"`
	Shell     string    `json:"shell"`
	CWD       string    `json:"cwd"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

type FrontendWebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type FrontendErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}
