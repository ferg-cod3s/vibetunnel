package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/server"
)

// TestTunnelForgeFrontendCompatibility tests compatibility with the TunnelForge frontend
func TestTunnelForgeFrontendCompatibility(t *testing.T) {
	// Create test server
	cfg := &server.Config{Port: "0"} // Use random port
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("Frontend_API_Compatibility", func(t *testing.T) {
		t.Run("Health_Endpoint_Format", func(t *testing.T) {
			resp, err := http.Get(baseURL + "/health")
			require.NoError(t, err)
			defer resp.Body.Close()

			// Should return 200 OK
			assert.Equal(t, http.StatusOK, resp.StatusCode)

			// Should have JSON content type
			assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")

			// Should have expected JSON structure
			var health map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&health)
			require.NoError(t, err)

			// Frontend expects these fields
			assert.Contains(t, health, "status")
			assert.Contains(t, health, "sessions")
			assert.Equal(t, "ok", health["status"])
		})

		t.Run("Session_API_Response_Format", func(t *testing.T) {
			// Test session creation format
			sessionPayload := map[string]interface{}{
				"command": "echo test",
				"title":   "Frontend Test Session",
				"cols":    80,
				"rows":    24,
			}
			jsonPayload, _ := json.Marshal(sessionPayload)

			resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonPayload))
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusCreated, resp.StatusCode)

			var session map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&session)
			require.NoError(t, err)

			// Frontend expects these session fields
			requiredFields := []string{"id", "title", "command", "cols", "rows", "createdAt", "active"}
			for _, field := range requiredFields {
				assert.Contains(t, session, field, "Missing required field: %s", field)
			}

			// Test session listing format
			resp, err = http.Get(baseURL + "/api/sessions")
			require.NoError(t, err)
			defer resp.Body.Close()

			var sessionList map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&sessionList)
			require.NoError(t, err)

			// Frontend expects sessions array and count
			assert.Contains(t, sessionList, "sessions")
			assert.Contains(t, sessionList, "count")
		})

		t.Run("CORS_Headers_For_Frontend", func(t *testing.T) {
			req, err := http.NewRequest("OPTIONS", baseURL+"/api/sessions", nil)
			require.NoError(t, err)
			req.Header.Set("Origin", "http://localhost:3000")
			req.Header.Set("Access-Control-Request-Method", "POST")

			client := &http.Client{}
			resp, err := client.Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			// Should allow CORS for frontend
			assert.Equal(t, "*", resp.Header.Get("Access-Control-Allow-Origin"))
			assert.Contains(t, resp.Header.Get("Access-Control-Allow-Methods"), "POST")
		})

		t.Run("File_System_API_Compatibility", func(t *testing.T) {
			// Test directory listing format
			resp, err := http.Get(baseURL + "/api/filesystem/ls?path=.")
			require.NoError(t, err)
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var fsResponse map[string]interface{}
				err = json.NewDecoder(resp.Body).Decode(&fsResponse)
				require.NoError(t, err)

				// Frontend expects this structure
				assert.Contains(t, fsResponse, "path")
				assert.Contains(t, fsResponse, "files")
				assert.Contains(t, fsResponse, "directories")
			}
		})

		t.Run("Git_API_Compatibility", func(t *testing.T) {
			// Test git status format
			resp, err := http.Get(baseURL + "/api/git/status?path=.")
			require.NoError(t, err)
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				var gitResponse map[string]interface{}
				err = json.NewDecoder(resp.Body).Decode(&gitResponse)
				require.NoError(t, err)

				// Frontend expects this git status structure
				expectedFields := []string{"repoPath", "currentBranch", "isClean"}
				for _, field := range expectedFields {
					assert.Contains(t, gitResponse, field, "Missing git field: %s", field)
				}
			}
		})
	})

	t.Run("WebSocket_Frontend_Compatibility", func(t *testing.T) {
		// Create a session for WebSocket testing
		sessionPayload := map[string]interface{}{
			"command": "echo websocket_test",
			"title":   "WebSocket Test",
		}
		jsonPayload, _ := json.Marshal(sessionPayload)

		resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonPayload))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		sessionID := session["id"].(string)

		t.Run("WebSocket_Connection_Format", func(t *testing.T) {
			// Test WebSocket URL format that frontend uses
			wsURL := strings.Replace(httpServer.URL, "http://", "ws://", 1) + "/ws?sessionId=" + sessionID

			dialer := websocket.DefaultDialer
			conn, _, err := dialer.Dial(wsURL, nil)
			require.NoError(t, err)
			defer conn.Close()

			// Should connect successfully
			assert.NotNil(t, conn)
		})

		t.Run("WebSocket_Message_Protocol", func(t *testing.T) {
			wsURL := strings.Replace(httpServer.URL, "http://", "ws://", 1) + "/ws?sessionId=" + sessionID

			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			require.NoError(t, err)
			defer conn.Close()

			// Test input message format that frontend sends
			inputMsg := map[string]interface{}{
				"type": "input",
				"data": "test command\r",
			}
			err = conn.WriteJSON(inputMsg)
			require.NoError(t, err)

			// Test resize message format
			resizeMsg := map[string]interface{}{
				"type": "resize",
				"cols": 120,
				"rows": 30,
			}
			err = conn.WriteJSON(resizeMsg)
			require.NoError(t, err)

			// Test ping message format
			pingMsg := map[string]interface{}{
				"type": "ping",
			}
			err = conn.WriteJSON(pingMsg)
			require.NoError(t, err)

			// Should receive terminal output
			conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			_, message, err := conn.ReadMessage()
			if err == nil {
				// Should receive some output
				assert.NotEmpty(t, message)
			}
		})
	})

	t.Run("Authentication_API_Compatibility", func(t *testing.T) {
		t.Run("Auth_Config_Endpoint", func(t *testing.T) {
			resp, err := http.Get(baseURL + "/api/auth/config")
			require.NoError(t, err)
			defer resp.Body.Close()

			var authConfig map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&authConfig)
			require.NoError(t, err)

			// Frontend expects these auth config fields
			expectedFields := []string{"authRequired", "authMethods", "passwordAuth"}
			for _, field := range expectedFields {
				assert.Contains(t, authConfig, field, "Missing auth config field: %s", field)
			}
		})

		t.Run("Current_User_Endpoint", func(t *testing.T) {
			resp, err := http.Get(baseURL + "/api/auth/current-user")
			require.NoError(t, err)
			defer resp.Body.Close()

			// Should return 401 when not authenticated (expected behavior)
			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		})
	})

	t.Run("Error_Response_Format", func(t *testing.T) {
		t.Run("404_Not_Found_Format", func(t *testing.T) {
			resp, err := http.Get(baseURL + "/api/sessions/nonexistent")
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusNotFound, resp.StatusCode)

			// Should have JSON error response
			if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
				var errorResponse map[string]interface{}
				err = json.NewDecoder(resp.Body).Decode(&errorResponse)
				require.NoError(t, err)
				assert.Contains(t, errorResponse, "error")
			}
		})

		t.Run("400_Bad_Request_Format", func(t *testing.T) {
			// Send invalid JSON
			resp, err := http.Post(baseURL+"/api/sessions", "application/json", strings.NewReader("invalid json"))
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		})
	})
}

// TestFrontendSecurityCompatibility tests security features expected by frontend
func TestFrontendSecurityCompatibility(t *testing.T) {
	cfg := &server.Config{Port: "0"}
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("Security_Headers", func(t *testing.T) {
		// Test CORS with preflight request
		req, err := http.NewRequest("OPTIONS", baseURL+"/api/sessions", nil)
		require.NoError(t, err)
		req.Header.Set("Origin", "http://localhost:3000")
		req.Header.Set("Access-Control-Request-Method", "GET")

		client := &http.Client{}
		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Should have CORS headers for preflight
		headers := resp.Header
		assert.NotEmpty(t, headers.Get("Access-Control-Allow-Origin"))

		// Test regular request has JSON content type
		resp2, err := http.Get(baseURL + "/health")
		require.NoError(t, err)
		defer resp2.Body.Close()

		// Should have content type
		assert.Contains(t, resp2.Header.Get("Content-Type"), "application/json")
	})

	t.Run("Input_Validation_Security", func(t *testing.T) {
		// Test path traversal protection in filesystem API
		resp, err := http.Get(baseURL + "/api/filesystem/ls?path=../../../etc/passwd")
		require.NoError(t, err)
		defer resp.Body.Close()

		// Should reject malicious paths
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)

		// Test command injection protection in git API
		checkoutPayload := map[string]string{
			"branch": "; rm -rf /",
		}
		jsonPayload, _ := json.Marshal(checkoutPayload)

		resp, err = http.Post(baseURL+"/api/git/checkout", "application/json", bytes.NewBuffer(jsonPayload))
		require.NoError(t, err)
		defer resp.Body.Close()

		// Should reject malicious branch names
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}

// TestFrontendPerformanceCompatibility tests performance characteristics expected by frontend
func TestFrontendPerformanceCompatibility(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	cfg := &server.Config{Port: "0"}
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("API_Response_Times", func(t *testing.T) {
		// Test that API endpoints respond quickly (frontend expects <100ms)
		endpoints := []string{
			"/health",
			"/api/sessions",
			"/api/auth/config",
		}

		for _, endpoint := range endpoints {
			t.Run("endpoint_"+endpoint, func(t *testing.T) {
				start := time.Now()
				resp, err := http.Get(baseURL + endpoint)
				duration := time.Since(start)

				require.NoError(t, err)
				resp.Body.Close()

				// Should respond within 100ms for good UX
				assert.Less(t, duration, 100*time.Millisecond,
					"Endpoint %s took %v, expected <100ms", endpoint, duration)
			})
		}
	})

	t.Run("Concurrent_Session_Creation", func(t *testing.T) {
		// Test handling multiple session creations (frontend might do this)
		const numConcurrent = 10

		sessionPayload := map[string]interface{}{
			"command": "echo test",
			"title":   "Concurrent Test",
		}
		jsonPayload, _ := json.Marshal(sessionPayload)

		start := time.Now()

		// Create concurrent requests
		results := make(chan error, numConcurrent)
		for i := 0; i < numConcurrent; i++ {
			go func() {
				resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonPayload))
				if err != nil {
					results <- err
					return
				}
				resp.Body.Close()

				if resp.StatusCode != http.StatusCreated {
					results <- fmt.Errorf("unexpected status: %d", resp.StatusCode)
					return
				}

				results <- nil
			}()
		}

		// Wait for all requests
		for i := 0; i < numConcurrent; i++ {
			err := <-results
			assert.NoError(t, err)
		}

		duration := time.Since(start)
		t.Logf("Created %d sessions concurrently in %v", numConcurrent, duration)

		// Should handle concurrent requests reasonably fast
		assert.Less(t, duration, 2*time.Second)
	})
}

// TestFrontendFileOperationsCompatibility tests file operations that frontend uses
func TestFrontendFileOperationsCompatibility(t *testing.T) {
	cfg := &server.Config{Port: "0"}
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("File_Upload_Format", func(t *testing.T) {
		// Test multipart file upload format that frontend uses
		var b bytes.Buffer
		w := multipart.NewWriter(&b)

		// Add a test file
		fw, err := w.CreateFormFile("files", "test.txt")
		require.NoError(t, err)
		fw.Write([]byte("test file content"))

		// Add target path
		w.WriteField("path", ".")
		w.Close()

		req, err := http.NewRequest("POST", baseURL+"/api/filesystem/upload", &b)
		require.NoError(t, err)
		req.Header.Set("Content-Type", w.FormDataContentType())

		client := &http.Client{}
		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()

		// Should accept multipart uploads
		if resp.StatusCode == http.StatusOK {
			var uploadResponse map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&uploadResponse)
			require.NoError(t, err)

			assert.Contains(t, uploadResponse, "success")
			assert.True(t, uploadResponse["success"].(bool))
		}
	})

	t.Run("Directory_Creation_Format", func(t *testing.T) {
		// Test directory creation format
		dirPayload := map[string]string{
			"path": "test_frontend_dir",
		}
		jsonPayload, _ := json.Marshal(dirPayload)

		resp, err := http.Post(baseURL+"/api/filesystem/mkdir", "application/json", bytes.NewBuffer(jsonPayload))
		require.NoError(t, err)
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			var dirResponse map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&dirResponse)
			require.NoError(t, err)

			assert.Contains(t, dirResponse, "success")
			assert.True(t, dirResponse["success"].(bool))
		}
	})
}
