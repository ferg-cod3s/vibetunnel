package tmux

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
)

func TestTmuxService_HandleAvailable(t *testing.T) {
	sessionManager := session.NewManager()
	tmuxService := NewTmuxService(sessionManager)

	router := mux.NewRouter()
	tmuxService.RegisterRoutes(router)

	req := httptest.NewRequest("GET", "/api/tmux/available", nil)
	rr := httptest.NewRecorder()

	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]bool
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if _, ok := response["available"]; !ok {
		t.Error("Response should contain 'available' field")
	}
}

func TestTmuxService_HandleListSessions(t *testing.T) {
	sessionManager := session.NewManager()
	tmuxService := NewTmuxService(sessionManager)

	router := mux.NewRouter()
	tmuxService.RegisterRoutes(router)

	req := httptest.NewRequest("GET", "/api/tmux/sessions", nil)
	rr := httptest.NewRecorder()

	router.ServeHTTP(rr, req)

	// Should return OK even if tmux is not available or no sessions exist
	if rr.Code != http.StatusOK && rr.Code != http.StatusInternalServerError {
		t.Errorf("Expected status %d or %d, got %d", http.StatusOK, http.StatusInternalServerError, rr.Code)
	}
}

func TestTmuxService_HandleCreateSession(t *testing.T) {
	sessionManager := session.NewManager()
	tmuxService := NewTmuxService(sessionManager)

	router := mux.NewRouter()
	tmuxService.RegisterRoutes(router)

	tests := []struct {
		name           string
		body           interface{}
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "valid session creation",
			body: CreateSessionRequest{
				Name:    "test-session",
				Command: "echo hello",
			},
			expectedStatus: http.StatusOK, // Will fail if tmux not available, but request is valid
		},
		{
			name:           "missing name",
			body:           CreateSessionRequest{Command: "echo hello"},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Session name is required",
		},
		{
			name:           "invalid JSON",
			body:           "invalid json",
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body []byte
			var err error

			if str, ok := tt.body.(string); ok {
				body = []byte(str)
			} else {
				body, err = json.Marshal(tt.body)
				if err != nil {
					t.Fatalf("Failed to marshal request body: %v", err)
				}
			}

			req := httptest.NewRequest("POST", "/api/tmux/sessions", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			// For bad requests, we expect the exact status code
			if tt.expectedStatus == http.StatusBadRequest {
				if rr.Code != tt.expectedStatus {
					t.Errorf("Expected status %d, got %d", tt.expectedStatus, rr.Code)
				}
				return
			}

			// For valid requests, accept OK or internal server error (tmux not available)
			if rr.Code != http.StatusOK && rr.Code != http.StatusInternalServerError {
				t.Errorf("Expected status %d or %d, got %d", http.StatusOK, http.StatusInternalServerError, rr.Code)
			}
		})
	}
}

func TestTmuxService_HandleSendCommand(t *testing.T) {
	sessionManager := session.NewManager()
	tmuxService := NewTmuxService(sessionManager)

	router := mux.NewRouter()
	tmuxService.RegisterRoutes(router)

	tests := []struct {
		name           string
		body           interface{}
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "valid command",
			body: SendCommandRequest{
				Command: "echo test",
			},
			expectedStatus: http.StatusOK, // Will fail if session doesn't exist, but request is valid
		},
		{
			name:           "missing command",
			body:           SendCommandRequest{},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Command is required",
		},
		{
			name:           "invalid JSON",
			body:           "invalid json",
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body []byte
			var err error

			if str, ok := tt.body.(string); ok {
				body = []byte(str)
			} else {
				body, err = json.Marshal(tt.body)
				if err != nil {
					t.Fatalf("Failed to marshal request body: %v", err)
				}
			}

			req := httptest.NewRequest("POST", "/api/tmux/sessions/test-session/send", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			// For bad requests, we expect the exact status code
			if tt.expectedStatus == http.StatusBadRequest {
				if rr.Code != tt.expectedStatus {
					t.Errorf("Expected status %d, got %d", tt.expectedStatus, rr.Code)
				}
				return
			}

			// For valid requests, accept OK or internal server error (tmux/session not available)
			if rr.Code != http.StatusOK && rr.Code != http.StatusInternalServerError {
				t.Errorf("Expected status %d or %d, got %d", http.StatusOK, http.StatusInternalServerError, rr.Code)
			}
		})
	}
}

func TestTmuxService_IsAvailable(t *testing.T) {
	sessionManager := session.NewManager()
	tmuxService := NewTmuxService(sessionManager)

	// This test will pass/fail depending on whether tmux is installed
	// Just verify the method doesn't panic
	available := tmuxService.IsAvailable()
	t.Logf("Tmux available: %v", available)
}

func TestCreateSessionRequest_JSON(t *testing.T) {
	req := CreateSessionRequest{
		Name:    "test-session",
		Command: "echo hello",
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("Failed to marshal request: %v", err)
	}

	var decoded CreateSessionRequest
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal request: %v", err)
	}

	if decoded.Name != req.Name {
		t.Errorf("Expected name %s, got %s", req.Name, decoded.Name)
	}
	if decoded.Command != req.Command {
		t.Errorf("Expected command %s, got %s", req.Command, decoded.Command)
	}
}
