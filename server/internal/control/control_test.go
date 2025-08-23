package control

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
)

func TestControlService_HandleSendEvent(t *testing.T) {
	cs := NewControlService()
	router := mux.NewRouter()
	cs.RegisterRoutes(router)

	tests := []struct {
		name           string
		body           interface{}
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "valid event",
			body: ControlEvent{
				Category: "git",
				Action:   "branch-change",
				Data:     map[string]string{"branch": "main"},
			},
			expectedStatus: http.StatusOK,
			expectedBody:   `"status":"event sent"`,
		},
		{
			name: "missing category",
			body: ControlEvent{
				Action: "test-action",
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Missing category or action",
		},
		{
			name: "missing action",
			body: ControlEvent{
				Category: "test-category",
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Missing category or action",
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

			req := httptest.NewRequest("POST", "/api/control/event", bytes.NewReader(body))
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

func TestControlService_HandleControlStream(t *testing.T) {
	cs := NewControlService()
	router := mux.NewRouter()
	cs.RegisterRoutes(router)

	req := httptest.NewRequest("GET", "/api/control/stream", nil)

	// Create a context with timeout to avoid hanging
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()

	// Run the handler in a goroutine
	done := make(chan bool)
	go func() {
		router.ServeHTTP(rr, req)
		done <- true
	}()

	// Wait for context to cancel (simulating client disconnect) before assertions
	select {
	case <-done:
		// Handler finished
	case <-time.After(3 * time.Second):
		t.Fatal("Handler did not finish within timeout")
	}

	// After handler completes, it's safe to read headers/body
	expectedHeaders := map[string]string{
		"Content-Type":      "text/event-stream",
		"Cache-Control":     "no-cache",
		"Connection":        "keep-alive",
		"X-Accel-Buffering": "no",
	}
	for header, expectedValue := range expectedHeaders {
		if rr.Header().Get(header) != expectedValue {
			t.Errorf("Expected header %s: %s, got: %s", header, expectedValue, rr.Header().Get(header))
		}
	}
	body := rr.Body.String()
	if !strings.Contains(body, ":ok") {
		t.Errorf("Expected response to contain ':ok', got: %q", body)
	}
}

func TestControlService_BroadcastEvent(t *testing.T) {
	cs := NewControlService()

	// Test that BroadcastEvent doesn't block
	event := ControlEvent{
		Category: "test",
		Action:   "broadcast",
		Data:     "test data",
	}

	// This should not block even with no clients
	cs.BroadcastEvent(event)

	// Wait a bit for the event to be processed by the broadcaster goroutine
	time.Sleep(10 * time.Millisecond)

	// The test passes if BroadcastEvent didn't block
	// In a real scenario, the event would be sent to connected clients
	// Since there are no clients, it will just be processed and discarded
}

func TestControlService_GetClientCount(t *testing.T) {
	cs := NewControlService()

	// Initially should have no clients
	if count := cs.GetClientCount(); count != 0 {
		t.Errorf("Expected 0 clients, got %d", count)
	}

	// Add a mock client
	client := &Client{
		id:       "test-client",
		done:     make(chan bool),
		lastSeen: time.Now(),
	}

	cs.clientsMux.Lock()
	cs.clients["test-client"] = client
	cs.clientsMux.Unlock()

	if count := cs.GetClientCount(); count != 1 {
		t.Errorf("Expected 1 client, got %d", count)
	}

	// Remove the client
	cs.clientsMux.Lock()
	delete(cs.clients, "test-client")
	cs.clientsMux.Unlock()

	if count := cs.GetClientCount(); count != 0 {
		t.Errorf("Expected 0 clients after removal, got %d", count)
	}
}

func TestControlEvent_JSON(t *testing.T) {
	event := ControlEvent{
		Category: "git",
		Action:   "push",
		Data: map[string]interface{}{
			"branch":  "main",
			"commits": 5,
		},
	}

	// Test JSON marshaling
	jsonData, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("Failed to marshal event: %v", err)
	}

	// Test JSON unmarshaling
	var unmarshaledEvent ControlEvent
	if err := json.Unmarshal(jsonData, &unmarshaledEvent); err != nil {
		t.Fatalf("Failed to unmarshal event: %v", err)
	}

	if unmarshaledEvent.Category != event.Category {
		t.Errorf("Expected category %s, got %s", event.Category, unmarshaledEvent.Category)
	}

	if unmarshaledEvent.Action != event.Action {
		t.Errorf("Expected action %s, got %s", event.Action, unmarshaledEvent.Action)
	}
}

func TestControlService_ClientLifecycle(t *testing.T) {
	cs := NewControlService()

	// Test client creation and cleanup
	client := &Client{
		id:       "lifecycle-test",
		done:     make(chan bool),
		lastSeen: time.Now().Add(-10 * time.Minute), // Stale client
	}

	cs.clientsMux.Lock()
	cs.clients["lifecycle-test"] = client
	cs.clientsMux.Unlock()

	// Verify client exists
	if cs.GetClientCount() != 1 {
		t.Error("Expected client to be registered")
	}

	// Mark client as done
	close(client.done)

	// Trigger cleanup manually (in real scenario this runs in goroutine)
	cs.clientsMux.Lock()
	for clientID, client := range cs.clients {
		select {
		case <-client.done:
			delete(cs.clients, clientID)
		default:
		}
	}
	cs.clientsMux.Unlock()

	// Verify client was cleaned up
	if cs.GetClientCount() != 0 {
		t.Error("Expected stale client to be cleaned up")
	}
}
