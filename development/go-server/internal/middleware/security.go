package middleware

import (
	"compress/gzip"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RateLimiter implements token bucket rate limiting per IP
type RateLimiter struct {
	limit   int           // requests per window
	window  time.Duration // time window
	buckets map[string]*bucket
	mu      sync.RWMutex
	cleanup time.Duration // cleanup interval for expired buckets
}

type bucket struct {
	tokens   int
	lastSeen time.Time
	mu       sync.Mutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		limit:   limit,
		window:  window,
		buckets: make(map[string]*bucket),
		cleanup: window * 2, // Cleanup expired buckets after 2 windows
	}

	// Start cleanup goroutine
	go rl.cleanupExpiredBuckets()

	return rl
}

// Middleware returns the rate limiting middleware
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		if !rl.allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			if err := json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "rate limit exceeded",
				"success": false,
			}); err != nil {
				log.Printf("Failed to encode rate limit response: %v", err)
			}
			return
		}

		next.ServeHTTP(w, r)
	})
}

// allow checks if a request from the given IP is allowed
func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.RLock()
	b, exists := rl.buckets[ip]
	rl.mu.RUnlock()

	if !exists {
		// Create new bucket
		rl.mu.Lock()
		// Double-check after acquiring write lock
		if b, exists = rl.buckets[ip]; !exists {
			b = &bucket{
				tokens:   rl.limit - 1, // Use one token immediately
				lastSeen: time.Now(),
			}
			rl.buckets[ip] = b
		}
		rl.mu.Unlock()

		if !exists {
			return true // First request is allowed
		}
	}

	// Check bucket with proper refilling
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(b.lastSeen)

	// Refill tokens if enough time has passed
	if elapsed >= rl.window {
		b.tokens = rl.limit - 1 // Reset and use one token
		b.lastSeen = now
		return true
	}

	// Use a token if available
	if b.tokens > 0 {
		b.tokens--
		return true
	}

	return false
}

// cleanupExpiredBuckets removes old buckets to prevent memory leaks
func (rl *RateLimiter) cleanupExpiredBuckets() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			cutoff := time.Now().Add(-rl.cleanup)
			for ip, bucket := range rl.buckets {
				bucket.mu.Lock()
				if bucket.lastSeen.Before(cutoff) {
					delete(rl.buckets, ip)
				}
				bucket.mu.Unlock()
			}
			rl.mu.Unlock()
		}
	}
}

// SecurityHeaders adds security headers to responses
func SecurityHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Prevent MIME sniffing
			w.Header().Set("X-Content-Type-Options", "nosniff")

			// Prevent clickjacking
			w.Header().Set("X-Frame-Options", "DENY")

			// XSS protection (though deprecated, still used by older browsers)
			w.Header().Set("X-XSS-Protection", "1; mode=block")

			// Referrer policy
			w.Header().Set("Referrer-Policy", "no-referrer")

			// HSTS (only set for HTTPS)
			if r.TLS != nil {
				w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}

			// Content Security Policy
			csp := "default-src 'self'; " +
				"script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
				"style-src 'self' 'unsafe-inline'; " +
				"img-src 'self' data: https:; " +
				"font-src 'self'; " +
				"connect-src 'self' ws: wss:; " +
				"frame-ancestors 'none'"
			w.Header().Set("Content-Security-Policy", csp)

			// Cross-Origin policies
			w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
			w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")

			next.ServeHTTP(w, r)
		})
	}
}

// CORSConfig holds CORS configuration
type CORSConfig struct {
	AllowedOrigins []string
	AllowedMethods []string
	AllowedHeaders []string
	MaxAge         int
}

// CORS handles Cross-Origin Resource Sharing
type CORS struct {
	config CORSConfig
}

// NewCORS creates a new CORS middleware
func NewCORS(config CORSConfig) *CORS {
	return &CORS{config: config}
}

// Middleware returns the CORS middleware
func (c *CORS) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Check if origin is allowed
		if c.isOriginAllowed(origin) {
			if len(c.config.AllowedOrigins) == 1 && c.config.AllowedOrigins[0] == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}

			w.Header().Set("Access-Control-Allow-Methods", strings.Join(c.config.AllowedMethods, ", "))
			w.Header().Set("Access-Control-Allow-Headers", strings.Join(c.config.AllowedHeaders, ", "))

			if c.config.MaxAge > 0 {
				w.Header().Set("Access-Control-Max-Age", strconv.Itoa(c.config.MaxAge))
			}
		}

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			if c.isOriginAllowed(origin) {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// isOriginAllowed checks if an origin is in the allowed list
func (c *CORS) isOriginAllowed(origin string) bool {
	if len(c.config.AllowedOrigins) == 0 {
		return false
	}

	for _, allowed := range c.config.AllowedOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}

	return false
}

// CSRFConfig holds CSRF configuration
type CSRFConfig struct {
	Secret    string
	TokenName string
}

// CSRF implements CSRF protection using double-submit cookie pattern
type CSRF struct {
	secret    []byte
	tokenName string
}

// NewCSRF creates a new CSRF protection middleware
func NewCSRF(config CSRFConfig) *CSRF {
	return &CSRF{
		secret:    []byte(config.Secret),
		tokenName: config.TokenName,
	}
}

// GenerateToken generates a CSRF token
func (c *CSRF) GenerateToken() string {
	// Generate random bytes
	randomBytes := make([]byte, 32)
	rand.Read(randomBytes)

	// Create HMAC
	h := hmac.New(sha256.New, c.secret)
	h.Write(randomBytes)
	signature := h.Sum(nil)

	// Combine random bytes and signature, then base64 encode
	token := append(randomBytes, signature...)
	return base64.URLEncoding.EncodeToString(token)
}

// ValidateToken validates a CSRF token
func (c *CSRF) ValidateToken(token string) bool {
	if token == "" {
		return false
	}

	// Decode token
	data, err := base64.URLEncoding.DecodeString(token)
	if err != nil || len(data) != 64 { // 32 random + 32 signature
		return false
	}

	// Split random bytes and signature
	randomBytes := data[:32]
	signature := data[32:]

	// Verify HMAC
	h := hmac.New(sha256.New, c.secret)
	h.Write(randomBytes)
	expectedSignature := h.Sum(nil)

	return hmac.Equal(signature, expectedSignature)
}

// Middleware returns the CSRF protection middleware
func (c *CSRF) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip CSRF protection for safe methods
		if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// Get token from header
		token := r.Header.Get("X-CSRF-Token")
		if token == "" {
			// Try to get from form data
			token = r.FormValue(c.tokenName)
		}

		// Validate token
		if !c.ValidateToken(token) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			if err := json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "invalid CSRF token",
				"success": false,
			}); err != nil {
				log.Printf("Failed to encode CSRF error response: %v", err)
			}
			return
		}

		next.ServeHTTP(w, r)
	})
}

// IPWhitelist implements IP address whitelisting
type IPWhitelist struct {
	allowedNets []*net.IPNet
	allowedIPs  []net.IP
}

// NewIPWhitelist creates a new IP whitelist middleware
func NewIPWhitelist(allowedCIDRs []string) *IPWhitelist {
	whitelist := &IPWhitelist{}

	for _, cidr := range allowedCIDRs {
		if strings.Contains(cidr, "/") {
			// CIDR notation
			_, network, err := net.ParseCIDR(cidr)
			if err != nil {
				log.Printf("Invalid CIDR: %s", cidr)
				continue
			}
			whitelist.allowedNets = append(whitelist.allowedNets, network)
		} else {
			// Single IP
			ip := net.ParseIP(cidr)
			if ip == nil {
				log.Printf("Invalid IP: %s", cidr)
				continue
			}
			whitelist.allowedIPs = append(whitelist.allowedIPs, ip)
		}
	}

	return whitelist
}

// Middleware returns the IP whitelist middleware
func (ip *IPWhitelist) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientIP := getClientIP(r)

		if !ip.isAllowed(clientIP) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			if err := json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "IP address not allowed",
				"success": false,
			}); err != nil {
				log.Printf("Failed to encode IP whitelist error response: %v", err)
			}
			return
		}

		next.ServeHTTP(w, r)
	})
}

// isAllowed checks if an IP is in the whitelist
func (ip *IPWhitelist) isAllowed(clientIPStr string) bool {
	clientIP := net.ParseIP(clientIPStr)
	if clientIP == nil {
		return false
	}

	// Check exact IP matches
	for _, allowedIP := range ip.allowedIPs {
		if allowedIP.Equal(clientIP) {
			return true
		}
	}

	// Check network ranges
	for _, network := range ip.allowedNets {
		if network.Contains(clientIP) {
			return true
		}
	}

	return false
}

// RequestLogger logs HTTP requests
func RequestLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			// Wrap response writer to capture status code
			wrapped := &responseWriter{ResponseWriter: w, statusCode: 200}

			// Process request
			next.ServeHTTP(wrapped, r)

			// Log request details
			duration := time.Since(start)
			log.Printf("%s %s %s %d %v %s",
				getClientIP(r),
				r.Method,
				r.RequestURI,
				wrapped.statusCode,
				duration,
				r.UserAgent())
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Compression adds gzip compression to responses
func Compression() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check if client accepts gzip
			if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
				next.ServeHTTP(w, r)
				return
			}

			// Set compression headers
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Vary", "Accept-Encoding")

			// Create gzip writer
			gz := gzip.NewWriter(w)
			defer func() {
				if err := gz.Close(); err != nil {
					log.Printf("Failed to close gzip writer: %v", err)
				}
			}()

			// Wrap response writer
			gzw := &gzipResponseWriter{ResponseWriter: w, Writer: gz}
			next.ServeHTTP(gzw, r)
		})
	}
}

// gzipResponseWriter wraps http.ResponseWriter with gzip compression
type gzipResponseWriter struct {
	http.ResponseWriter
	io.Writer
}

func (grw *gzipResponseWriter) Write(data []byte) (int, error) {
	return grw.Writer.Write(data)
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Try X-Forwarded-For header first (for proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP in the chain
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}

	// Try X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}

	return ip
}
