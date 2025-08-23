package logs

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
)

func TestLogService_HandleClientLog(t *testing.T) {
	logService := NewLogService()
	router := mux.NewRouter()
	logService.RegisterRoutes(router)

	tests := []struct {
		name           string
		body           interface{}
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "valid log request",
			body: ClientLogRequest{
				Level:  LogLevelLog,
				Module: "test-module",
				Args:   []string{"test message", "with", "multiple", "args"},
			},
			expectedStatus: http.StatusOK,
			expectedBody:   `"status":"logged"`,
		},
		{
			name: "valid error log",
			body: ClientLogRequest{
				Level:  LogLevelError,
				Module: "error-module",
				Args:   []string{"error occurred"},
			},
			expectedStatus: http.StatusOK,
			expectedBody:   `"status":"logged"`,
		},
		{
			name: "valid debug log",
			body: ClientLogRequest{
				Level:  LogLevelDebug,
				Module: "debug-module",
				Args:   []string{"debug info"},
			},
			expectedStatus: http.StatusOK,
			expectedBody:   `"status":"logged"`,
		},
		{
			name: "missing level",
			body: map[string]interface{}{
				"module": "test",
				"args":   []string{"test"},
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid log request",
		},
		{
			name: "missing module",
			body: map[string]interface{}{
				"level": "log",
				"args":  []string{"test"},
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid log request",
		},
		{
			name: "missing args",
			body: map[string]interface{}{
				"level":  "log",
				"module": "test",
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid log request",
		},
		{
			name: "empty args array",
			body: ClientLogRequest{
				Level:  LogLevelLog,
				Module: "test",
				Args:   []string{},
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid log request",
		},
		{
			name: "invalid log level",
			body: ClientLogRequest{
				Level:  "invalid",
				Module: "test",
				Args:   []string{"test"},
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Invalid log level",
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

			req := httptest.NewRequest("POST", "/api/logs/client", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, rr.Code)
			}

			responseBody := rr.Body.String()
			if !strings.Contains(responseBody, tt.expectedBody) {
				t.Errorf("Expected response to contain %q, got %q", tt.expectedBody, responseBody)
			}
		})
	}
}

func TestLogService_HandleServerLogs(t *testing.T) {
	logService := NewLogService()
	router := mux.NewRouter()
	logService.RegisterRoutes(router)

	req := httptest.NewRequest("GET", "/api/logs/server", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// Should return not implemented for now
	if rr.Code != http.StatusNotImplemented {
		t.Errorf("Expected status %d, got %d", http.StatusNotImplemented, rr.Code)
	}
}

func TestLogService_HandleLogDownload(t *testing.T) {
	logService := NewLogService()
	router := mux.NewRouter()
	logService.RegisterRoutes(router)

	req := httptest.NewRequest("GET", "/api/logs/download", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// Should return 404 since log directory doesn't exist by default
	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
	}
}

func TestLogLevel_Validation(t *testing.T) {
	validLevels := []LogLevel{LogLevelLog, LogLevelWarn, LogLevelError, LogLevelDebug}

	for _, level := range validLevels {
		if string(level) == "" {
			t.Errorf("Log level %v should not be empty", level)
		}
	}

	// Test that we have the expected levels
	expectedLevels := map[LogLevel]bool{
		"log":   true,
		"warn":  true,
		"error": true,
		"debug": true,
	}

	for _, level := range validLevels {
		if !expectedLevels[level] {
			t.Errorf("Unexpected log level: %v", level)
		}
	}
}
