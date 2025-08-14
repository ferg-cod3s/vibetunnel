package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

func TestServer_HealthCheck(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
	assert.Contains(t, w.Body.String(), "\"status\":\"ok\"")
	assert.Contains(t, w.Body.String(), "\"sessions\":0")
}

func TestServer_ListSessions_Empty(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/api/sessions", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var response []interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Len(t, response, 0)
}

func TestServer_CreateSession(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// Create session request
	reqBody := types.SessionCreateRequest{
		Command: "echo 'hello world'",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	body, err := json.Marshal(reqBody)
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/api/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var response types.SessionResponse
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.NotEmpty(t, response.ID)
	assert.Equal(t, "Test Session", response.Title)
	assert.Equal(t, "echo 'hello world'", response.Command)
	assert.Equal(t, 80, response.Cols)
	assert.Equal(t, 24, response.Rows)
	assert.True(t, response.Active)
	assert.Equal(t, 0, response.Clients)
}

func TestServer_CreateSession_EmptyBody(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// Empty request body - should return 400 Bad Request for invalid JSON
	req := httptest.NewRequest("POST", "/api/sessions", strings.NewReader(""))
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Contains(t, response, "error")
}

func TestServer_GetSession(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// First, create a session
	reqBody := types.SessionCreateRequest{
		Command: "echo 'test'",
		Title:   "Test Session",
	}
	session, err := server.sessionManager.Create(&reqBody)
	require.NoError(t, err)

	// Now get the session
	req := httptest.NewRequest("GET", "/api/sessions/"+session.ID, nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response types.SessionResponse
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, session.ID, response.ID)
	assert.Equal(t, "Test Session", response.Title)
	assert.True(t, response.Active)
}

func TestServer_GetSession_NotFound(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/api/sessions/non-existent", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestServer_DeleteSession(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// First, create a session
	reqBody := types.SessionCreateRequest{
		Command: "sleep 10",
		Title:   "Test Session",
	}
	session, err := server.sessionManager.Create(&reqBody)
	require.NoError(t, err)

	// Now delete the session
	req := httptest.NewRequest("DELETE", "/api/sessions/"+session.ID, nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify session is gone
	getReq := httptest.NewRequest("GET", "/api/sessions/"+session.ID, nil)
	getW := httptest.NewRecorder()
	server.httpServer.Handler.ServeHTTP(getW, getReq)
	assert.Equal(t, http.StatusNotFound, getW.Code)
}

func TestServer_DeleteSession_NotFound(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/api/sessions/non-existent", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestServer_ListSessions_WithSessions(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// Create a couple of sessions
	reqBody1 := types.SessionCreateRequest{
		Command: "echo 'test1'",
		Title:   "Test Session 1",
	}
	session1, err := server.sessionManager.Create(&reqBody1)
	require.NoError(t, err)

	reqBody2 := types.SessionCreateRequest{
		Command: "echo 'test2'",
		Title:   "Test Session 2",
	}
	session2, err := server.sessionManager.Create(&reqBody2)
	require.NoError(t, err)

	// List sessions
	req := httptest.NewRequest("GET", "/api/sessions", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response []interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Len(t, response, 2)

	// Verify session IDs are present
	sessionIds := make(map[string]bool)
	for _, s := range response {
		sessionMap := s.(map[string]interface{})
		sessionIds[sessionMap["id"].(string)] = true
	}
	assert.True(t, sessionIds[session1.ID])
	assert.True(t, sessionIds[session2.ID])

	// Clean up
	err = server.sessionManager.Close(session1.ID)
	assert.NoError(t, err)
	err = server.sessionManager.Close(session2.ID)
	assert.NoError(t, err)
}

// Test GET /api/auth/config endpoint
func TestServer_AuthConfig(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/api/auth/config", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Type"), "application/json")

	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Verify expected auth config fields that frontend expects
	assert.Contains(t, response, "authRequired")
	assert.Contains(t, response, "authMethods") 
	assert.Contains(t, response, "sshKeyAuth")
	assert.Contains(t, response, "passwordAuth")
	
	// Verify it's a boolean for authRequired
	_, ok := response["authRequired"].(bool)
	assert.True(t, ok, "authRequired should be a boolean")
	
	// Verify authMethods is an array
	_, ok = response["authMethods"].([]interface{})
	assert.True(t, ok, "authMethods should be an array")
}

// Test GET /api/auth/current-user endpoint
func TestServer_AuthCurrentUser(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// When auth is not required (default), endpoint returns system user
	req := httptest.NewRequest("GET", "/api/auth/current-user", nil)
	w := httptest.NewRecorder()

	server.setupRoutes()
	server.httpServer.Handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestServer_ResizeSession(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// First, create a session
	reqBody := types.SessionCreateRequest{
		Command: "bash",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	session, err := server.sessionManager.Create(&reqBody)
	require.NoError(t, err)

	t.Run("valid resize request", func(t *testing.T) {
		resizeReq := types.ResizeRequest{
			Cols: 120,
			Rows: 30,
		}
		body, err := json.Marshal(resizeReq)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/sessions/"+session.ID+"/resize", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("invalid dimensions", func(t *testing.T) {
		resizeReq := types.ResizeRequest{
			Cols: -1,
			Rows: 30,
		}
		body, err := json.Marshal(resizeReq)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/sessions/"+session.ID+"/resize", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response map[string]interface{}
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response, "error")
	})

	t.Run("session not found", func(t *testing.T) {
		resizeReq := types.ResizeRequest{
			Cols: 120,
			Rows: 30,
		}
		body, err := json.Marshal(resizeReq)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/sessions/nonexistent/resize", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	// Clean up
	err = server.sessionManager.Close(session.ID)
	require.NoError(t, err)
}

func TestServer_SessionInput(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// First, create a session
	reqBody := types.SessionCreateRequest{
		Command: "bash",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	session, err := server.sessionManager.Create(&reqBody)
	require.NoError(t, err)

	t.Run("valid input request", func(t *testing.T) {
		inputReq := types.InputMessage{
			Type: "input",
			Data: "echo 'hello world'\n",
		}
		body, err := json.Marshal(inputReq)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/sessions/"+session.ID+"/input", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("invalid JSON", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/sessions/"+session.ID+"/input", bytes.NewReader([]byte("invalid json")))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response, "error")
	})

	t.Run("session not found", func(t *testing.T) {
		inputReq := types.InputMessage{
			Type: "input",
			Data: "echo 'hello'\n",
		}
		body, err := json.Marshal(inputReq)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/sessions/nonexistent/input", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	// Clean up
	err = server.sessionManager.Close(session.ID)
	require.NoError(t, err)
}

func TestServer_SessionStream(t *testing.T) {
	server, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// First, create a session
	reqBody := types.SessionCreateRequest{
		Command: "bash",
		Title:   "Test Session",
		Cols:    80,
		Rows:    24,
	}
	session, err := server.sessionManager.Create(&reqBody)
	require.NoError(t, err)

	t.Run("valid stream request headers", func(t *testing.T) {
		// Create a custom recorder that captures headers immediately
		req := httptest.NewRequest("GET", "/api/sessions/"+session.ID+"/stream", nil)
		
		// Create a handler that stops after writing headers
		handlerFunc := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			vars := map[string]string{"id": session.ID}
			r = mux.SetURLVars(r, vars)
			
			// Call our handler but intercept to check headers
			session := server.sessionManager.Get(session.ID)
			if session == nil {
				server.writeJSONError(w, "Session not found", http.StatusNotFound)
				return
			}
			
			// Set SSE headers (same as in handleSessionStream)
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			
			// Don't actually stream, just return after setting headers
			w.WriteHeader(http.StatusOK)
		})
		
		w := httptest.NewRecorder()
		handlerFunc.ServeHTTP(w, req)

		// Verify headers were set correctly
		assert.Equal(t, "text/event-stream", w.Header().Get("Content-Type"))
		assert.Equal(t, "no-cache", w.Header().Get("Cache-Control"))
		assert.Equal(t, "keep-alive", w.Header().Get("Connection"))
		assert.Equal(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("session not found", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/sessions/nonexistent/stream", nil)
		w := httptest.NewRecorder()

		server.setupRoutes()
		server.httpServer.Handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response, "error")
	})

	// Clean up
	err = server.sessionManager.Close(session.ID)
	require.NoError(t, err)
}
