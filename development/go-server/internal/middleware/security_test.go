package middleware

import (
	"bytes"
	"compress/gzip"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Mock handler for testing
func mockHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func TestRateLimiter_AllowedRequests(t *testing.T) {
	// Create rate limiter: 5 requests per second
	limiter := NewRateLimiter(5, time.Second)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	rateLimitedHandler := limiter.Middleware(handler)
	
	// Should allow 5 requests
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		w := httptest.NewRecorder()
		
		rateLimitedHandler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
	}
}

func TestRateLimiter_ExceedsLimit(t *testing.T) {
	// Create rate limiter: 2 requests per second
	limiter := NewRateLimiter(2, time.Second)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	rateLimitedHandler := limiter.Middleware(handler)
	
	// First 2 requests should pass
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		w := httptest.NewRecorder()
		
		rateLimitedHandler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
	}
	
	// 3rd request should be rate limited
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	w := httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected status %d, got %d", http.StatusTooManyRequests, w.Code)
	}
}

func TestRateLimiter_DifferentIPs(t *testing.T) {
	// Create rate limiter: 1 request per second
	limiter := NewRateLimiter(1, time.Second)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	rateLimitedHandler := limiter.Middleware(handler)
	
	// Request from IP 1
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "192.168.1.1:12345"
	w1 := httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w1.Code)
	}
	
	// Request from IP 2 should still work (different IP)
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.2:12346"
	w2 := httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w2.Code)
	}
	
	// Another request from IP 1 should be rate limited
	req3 := httptest.NewRequest("GET", "/test", nil)
	req3.RemoteAddr = "192.168.1.1:12347"
	w3 := httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w3, req3)
	if w3.Code != http.StatusTooManyRequests {
		t.Errorf("expected status %d, got %d", http.StatusTooManyRequests, w3.Code)
	}
}

func TestRateLimiter_WindowReset(t *testing.T) {
	// Create rate limiter: 1 request per 100ms
	limiter := NewRateLimiter(1, 100*time.Millisecond)
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	rateLimitedHandler := limiter.Middleware(handler)
	
	// First request should pass
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	w := httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}
	
	// Second request should be rate limited
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	w = httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected status %d, got %d", http.StatusTooManyRequests, w.Code)
	}
	
	// Wait for window to reset
	time.Sleep(150 * time.Millisecond)
	
	// Request should now pass
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	w = httptest.NewRecorder()
	
	rateLimitedHandler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}
}

func TestRateLimiterConcurrency(t *testing.T) {
	limiter := NewRateLimiter(10, time.Minute)
	handler := limiter.Middleware(http.HandlerFunc(mockHandler))

	var wg sync.WaitGroup
	successCount := 0
	mu := sync.Mutex{}

	// Run 20 concurrent requests from the same IP
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = "192.168.1.1:8080"
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			mu.Lock()
			if w.Code == http.StatusOK {
				successCount++
			}
			mu.Unlock()
		}()
	}

	wg.Wait()

	// Should allow exactly 10 requests
	if successCount != 10 {
		t.Errorf("expected 10 successful requests, got %d", successCount)
	}
}

func TestSecurityHeaders_AllHeaders(t *testing.T) {
	headers := SecurityHeaders()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	secureHandler := headers(handler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	
	secureHandler.ServeHTTP(w, req)
	
	// Check all security headers are set
	if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("X-Content-Type-Options: expected 'nosniff', got '%s'", got)
	}
	if got := w.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Errorf("X-Frame-Options: expected 'DENY', got '%s'", got)
	}
	if got := w.Header().Get("X-XSS-Protection"); got != "1; mode=block" {
		t.Errorf("X-XSS-Protection: expected '1; mode=block', got '%s'", got)
	}
	if got := w.Header().Get("Referrer-Policy"); got != "no-referrer" {
		t.Errorf("Referrer-Policy: expected 'no-referrer', got '%s'", got)
	}
	if csp := w.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'self'") {
		t.Errorf("Content-Security-Policy should contain 'default-src 'self'', got '%s'", csp)
	}
	if got := w.Header().Get("Cross-Origin-Embedder-Policy"); got != "require-corp" {
		t.Errorf("Cross-Origin-Embedder-Policy: expected 'require-corp', got '%s'", got)
	}
	if got := w.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Errorf("Cross-Origin-Opener-Policy: expected 'same-origin', got '%s'", got)
	}
}

func TestSecurityHeadersHTTPS(t *testing.T) {
	handler := SecurityHeaders()(http.HandlerFunc(mockHandler))

	req := httptest.NewRequest("GET", "/", nil)
	req.TLS = &tls.ConnectionState{} // Simulate HTTPS
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	hsts := w.Header().Get("Strict-Transport-Security")
	if hsts != "max-age=31536000; includeSubDomains" {
		t.Errorf("HSTS header = %q, want %q", hsts, "max-age=31536000; includeSubDomains")
	}
}

func TestCORSMiddleware_AllowedOrigin(t *testing.T) {
	cors := NewCORS(CORSConfig{
		AllowedOrigins: []string{"https://example.com", "https://app.example.com"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
		MaxAge:         3600,
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	corsHandler := cors.Middleware(handler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://example.com")
	w := httptest.NewRecorder()
	
	corsHandler.ServeHTTP(w, req)
	
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Errorf("Access-Control-Allow-Origin: expected 'https://example.com', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, PUT, DELETE" {
		t.Errorf("Access-Control-Allow-Methods: expected 'GET, POST, PUT, DELETE', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Authorization" {
		t.Errorf("Access-Control-Allow-Headers: expected 'Content-Type, Authorization', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Max-Age"); got != "3600" {
		t.Errorf("Access-Control-Max-Age: expected '3600', got '%s'", got)
	}
}

func TestCORSMiddleware_DisallowedOrigin(t *testing.T) {
	cors := NewCORS(CORSConfig{
		AllowedOrigins: []string{"https://example.com"},
		AllowedMethods: []string{"GET", "POST"},
		AllowedHeaders: []string{"Content-Type"},
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	corsHandler := cors.Middleware(handler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://malicious.com")
	w := httptest.NewRecorder()
	
	corsHandler.ServeHTTP(w, req)
	
	// Should not set CORS headers for disallowed origin
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin should be empty for disallowed origin, got '%s'", got)
	}
}

func TestCORSMiddleware_PreflightRequest(t *testing.T) {
	cors := NewCORS(CORSConfig{
		AllowedOrigins: []string{"https://example.com"},
		AllowedMethods: []string{"GET", "POST", "PUT"},
		AllowedHeaders: []string{"Content-Type", "Authorization"},
		MaxAge:         7200,
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called for preflight request")
	})
	
	corsHandler := cors.Middleware(handler)
	
	// Preflight request
	req := httptest.NewRequest("OPTIONS", "/test", nil)
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Access-Control-Request-Method", "PUT")
	req.Header.Set("Access-Control-Request-Headers", "Content-Type,Authorization")
	w := httptest.NewRecorder()
	
	corsHandler.ServeHTTP(w, req)
	
	if w.Code != http.StatusNoContent {
		t.Errorf("expected status %d, got %d", http.StatusNoContent, w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Errorf("Access-Control-Allow-Origin: expected 'https://example.com', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, PUT" {
		t.Errorf("Access-Control-Allow-Methods: expected 'GET, POST, PUT', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Authorization" {
		t.Errorf("Access-Control-Allow-Headers: expected 'Content-Type, Authorization', got '%s'", got)
	}
	if got := w.Header().Get("Access-Control-Max-Age"); got != "7200" {
		t.Errorf("Access-Control-Max-Age: expected '7200', got '%s'", got)
	}
}

func TestCORSMiddleware_WildcardOrigin(t *testing.T) {
	cors := NewCORS(CORSConfig{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST"},
		AllowedHeaders: []string{"Content-Type"},
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	corsHandler := cors.Middleware(handler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://any-origin.com")
	w := httptest.NewRecorder()
	
	corsHandler.ServeHTTP(w, req)
	
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin: expected '*', got '%s'", got)
	}
}

func TestCSRFProtection_ValidToken(t *testing.T) {
	csrf := NewCSRF(CSRFConfig{
		Secret:    "test-secret-key",
		TokenName: "csrf_token",
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	csrfHandler := csrf.Middleware(handler)
	
	// Generate a valid token first
	token := csrf.GenerateToken()
	
	req := httptest.NewRequest("POST", "/test", nil)
	req.Header.Set("X-CSRF-Token", token)
	w := httptest.NewRecorder()
	
	csrfHandler.ServeHTTP(w, req)
	
	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}
}

func TestCSRFProtection_InvalidToken(t *testing.T) {
	csrf := NewCSRF(CSRFConfig{
		Secret:    "test-secret-key",
		TokenName: "csrf_token",
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called with invalid CSRF token")
	})
	
	csrfHandler := csrf.Middleware(handler)
	
	req := httptest.NewRequest("POST", "/test", nil)
	req.Header.Set("X-CSRF-Token", "invalid-token")
	w := httptest.NewRecorder()
	
	csrfHandler.ServeHTTP(w, req)
	
	if w.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, w.Code)
	}
}

func TestCSRFProtection_SkipSafeMethods(t *testing.T) {
	csrf := NewCSRF(CSRFConfig{
		Secret:    "test-secret-key",
		TokenName: "csrf_token",
	})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	csrfHandler := csrf.Middleware(handler)
	
	// Safe methods (GET, HEAD, OPTIONS) should not require CSRF token
	safeMethods := []string{"GET", "HEAD", "OPTIONS"}
	
	for _, method := range safeMethods {
		req := httptest.NewRequest(method, "/test", nil)
		w := httptest.NewRecorder()
		
		csrfHandler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("Safe method %s should not require CSRF token: expected %d, got %d", method, http.StatusOK, w.Code)
		}
	}
}

func TestCSRFTokenGeneration(t *testing.T) {
	config := CSRFConfig{
		Secret:    "test-secret-key",
		TokenName: "csrf_token",
	}
	csrf := NewCSRF(config)

	// Generate multiple tokens
	tokens := make(map[string]bool)
	for i := 0; i < 10; i++ {
		token := csrf.GenerateToken()
		if tokens[token] {
			t.Errorf("generated duplicate token: %s", token)
		}
		tokens[token] = true

		// Validate the token
		if !csrf.ValidateToken(token) {
			t.Errorf("generated token should be valid: %s", token)
		}
	}
}

func TestIPWhitelist_AllowedIP(t *testing.T) {
	whitelist := NewIPWhitelist([]string{"192.168.1.0/24", "10.0.0.1"})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	whitelistHandler := whitelist.Middleware(handler)
	
	// Test subnet match
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.100:12345"
	w := httptest.NewRecorder()
	
	whitelistHandler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("subnet IP should be allowed: expected %d, got %d", http.StatusOK, w.Code)
	}
	
	// Test exact IP match
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	w = httptest.NewRecorder()
	
	whitelistHandler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("exact IP should be allowed: expected %d, got %d", http.StatusOK, w.Code)
	}
}

func TestIPWhitelist_BlockedIP(t *testing.T) {
	whitelist := NewIPWhitelist([]string{"192.168.1.0/24"})
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called for blocked IP")
	})
	
	whitelistHandler := whitelist.Middleware(handler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "172.16.0.1:12345" // Not in whitelist
	w := httptest.NewRecorder()
	
	whitelistHandler.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("blocked IP should return 403: expected %d, got %d", http.StatusForbidden, w.Code)
	}
}

func TestIPWhitelistWithHeaders(t *testing.T) {
	whitelist := NewIPWhitelist([]string{"192.168.1.1"})
	handler := whitelist.Middleware(http.HandlerFunc(mockHandler))

	tests := []struct {
		name     string
		header   string
		value    string
		wantCode int
	}{
		{
			name:     "X-Forwarded-For allowed",
			header:   "X-Forwarded-For",
			value:    "192.168.1.1, 10.0.0.1",
			wantCode: http.StatusOK,
		},
		{
			name:     "X-Real-IP allowed",
			header:   "X-Real-IP",
			value:    "192.168.1.1",
			wantCode: http.StatusOK,
		},
		{
			name:     "X-Forwarded-For blocked",
			header:   "X-Forwarded-For",
			value:    "192.168.1.2, 10.0.0.1",
			wantCode: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set(tt.header, tt.value)
			req.RemoteAddr = "10.0.0.1:8080" // Different IP in RemoteAddr
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantCode {
				t.Errorf("status code = %d, want %d", w.Code, tt.wantCode)
			}
		})
	}
}

func TestRequestLogger_LogsRequests(t *testing.T) {
	logger := RequestLogger()
	
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("test response"))
	})
	
	loggedHandler := logger(handler)
	
	req := httptest.NewRequest("GET", "/test?param=value", nil)
	req.Header.Set("User-Agent", "test-agent")
	req.RemoteAddr = "192.168.1.1:12345"
	w := httptest.NewRecorder()
	
	loggedHandler.ServeHTTP(w, req)
	
	// Should complete without error
	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}
	if w.Body.String() != "test response" {
		t.Errorf("expected 'test response', got '%s'", w.Body.String())
	}
}

func TestRequestLoggerCapture(t *testing.T) {
	// Create a buffer to capture log output
	var logBuffer bytes.Buffer
	
	// Create a custom handler that writes to our buffer
	logHandler := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			wrapped := &testResponseWriter{ResponseWriter: w, statusCode: 200}
			next.ServeHTTP(wrapped, r)
			duration := time.Since(start)
			
			// Write to buffer instead of using log package
			logBuffer.WriteString(fmt.Sprintf("%s %s %s %d %v %s\n",
				getClientIP(r), r.Method, r.RequestURI,
				wrapped.statusCode, duration, r.UserAgent()))
		})
	}
	
	handler := logHandler(http.HandlerFunc(mockHandler))

	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:8080"
	req.Header.Set("User-Agent", "test-agent")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	logOutput := logBuffer.String()
	expectedParts := []string{"192.168.1.1", "GET", "/test", "200", "test-agent"}
	
	for _, part := range expectedParts {
		if !strings.Contains(logOutput, part) {
			t.Errorf("log output should contain %q, got: %s", part, logOutput)
		}
	}
}

func TestCompression(t *testing.T) {
	handler := Compression()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("This is a longer response that should be compressed when gzip is supported"))
	}))

	t.Run("with gzip support", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Accept-Encoding", "gzip, deflate")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Content-Encoding") != "gzip" {
			t.Errorf("expected gzip encoding")
		}

		if w.Header().Get("Vary") != "Accept-Encoding" {
			t.Errorf("expected Vary header")
		}

		// Decompress and verify content
		reader, err := gzip.NewReader(w.Body)
		if err != nil {
			t.Fatalf("failed to create gzip reader: %v", err)
		}
		defer reader.Close()

		decompressed, err := io.ReadAll(reader)
		if err != nil {
			t.Fatalf("failed to decompress: %v", err)
		}

		expected := "This is a longer response that should be compressed when gzip is supported"
		if string(decompressed) != expected {
			t.Errorf("decompressed content = %q, want %q", string(decompressed), expected)
		}
	})

	t.Run("without gzip support", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		// Don't set Accept-Encoding header
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Content-Encoding") != "" {
			t.Errorf("should not set Content-Encoding without gzip support")
		}

		expected := "This is a longer response that should be compressed when gzip is supported"
		if w.Body.String() != expected {
			t.Errorf("response body = %q, want %q", w.Body.String(), expected)
		}
	})
}

func TestGetClientIP(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		headers    map[string]string
		want       string
	}{
		{
			name:       "RemoteAddr only",
			remoteAddr: "192.168.1.1:8080",
			want:       "192.168.1.1",
		},
		{
			name:       "X-Forwarded-For single",
			remoteAddr: "10.0.0.1:8080",
			headers:    map[string]string{"X-Forwarded-For": "192.168.1.1"},
			want:       "192.168.1.1",
		},
		{
			name:       "X-Forwarded-For multiple",
			remoteAddr: "10.0.0.1:8080",
			headers:    map[string]string{"X-Forwarded-For": "192.168.1.1, 10.0.0.2, 10.0.0.3"},
			want:       "192.168.1.1",
		},
		{
			name:       "X-Real-IP",
			remoteAddr: "10.0.0.1:8080",
			headers:    map[string]string{"X-Real-IP": "192.168.1.1"},
			want:       "192.168.1.1",
		},
		{
			name:       "X-Forwarded-For takes precedence",
			remoteAddr: "10.0.0.1:8080",
			headers: map[string]string{
				"X-Forwarded-For": "192.168.1.1",
				"X-Real-IP":       "192.168.1.2",
			},
			want: "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tt.remoteAddr
			
			for header, value := range tt.headers {
				req.Header.Set(header, value)
			}

			got := getClientIP(req)
			if got != tt.want {
				t.Errorf("getClientIP() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestMiddlewareChaining(t *testing.T) {
	// Test that middlewares can be chained together
	limiter := NewRateLimiter(10, time.Minute)
	cors := NewCORS(CORSConfig{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST"},
		AllowedHeaders: []string{"Content-Type"},
	})

	handler := SecurityHeaders()(
		limiter.Middleware(
			cors.Middleware(
				Compression()(
					http.HandlerFunc(mockHandler),
				),
			),
		),
	)

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Accept-Encoding", "gzip")
	req.RemoteAddr = "192.168.1.1:8080"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("chained middlewares should succeed, got status %d", w.Code)
	}

	// Check that all middlewares applied their effects
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("security headers not applied")
	}
	if w.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Errorf("CORS not applied")
	}
	if w.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("compression not applied")
	}
}

// testResponseWriter wraps http.ResponseWriter to capture status code for testing
type testResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *testResponseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
