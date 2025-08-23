package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestJWT_GenerateToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	token, err := jwt.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	if token == "" {
		t.Error("expected non-empty token")
	}

	// Verify token has 3 parts
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Errorf("expected 3 parts in JWT token, got %d", len(parts))
	}
}

func TestJWT_ValidateToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	// Generate a token
	token, err := jwt.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Validate the token
	claims, err := jwt.ValidateToken(token)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if claims.UserID != "user123" {
		t.Errorf("expected UserID 'user123', got '%s'", claims.UserID)
	}
	if claims.Username != "testuser" {
		t.Errorf("expected Username 'testuser', got '%s'", claims.Username)
	}
	if claims.Role != "admin" {
		t.Errorf("expected Role 'admin', got '%s'", claims.Role)
	}
	if claims.Issuer != "test-issuer" {
		t.Errorf("expected Issuer 'test-issuer', got '%s'", claims.Issuer)
	}
	if claims.Audience != "test-audience" {
		t.Errorf("expected Audience 'test-audience', got '%s'", claims.Audience)
	}
}

func TestJWT_ValidateToken_InvalidFormat(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	tests := []struct {
		name  string
		token string
	}{
		{"empty", ""},
		{"invalid format", "invalid.token"},
		{"too many parts", "header.payload.signature.extra"},
		{"missing parts", "header.payload"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := jwt.ValidateToken(tt.token)
			if err == nil {
				t.Error("expected error for invalid token format")
			}
		})
	}
}

func TestJWT_ValidateToken_InvalidSignature(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	// Generate valid token
	token, err := jwt.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Corrupt the signature
	parts := strings.Split(token, ".")
	parts[2] = "invalid-signature"
	corruptedToken := strings.Join(parts, ".")

	_, err = jwt.ValidateToken(corruptedToken)
	if err == nil {
		t.Error("expected error for invalid signature")
	}
	if !strings.Contains(err.Error(), "invalid token signature") {
		t.Errorf("expected signature error, got: %v", err)
	}
}

func TestJWT_ValidateToken_ExpiredToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: -time.Hour, // Negative duration = immediately expired
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	token, err := jwt.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Token should be immediately expired
	_, err = jwt.ValidateToken(token)
	if err == nil {
		t.Error("expected error for expired token")
		return
	}
	if !strings.Contains(err.Error(), "token expired") {
		t.Errorf("expected expiration error, got: %v", err)
	}
}

func TestJWT_ValidateToken_InvalidIssuerAudience(t *testing.T) {
	jwt1 := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "issuer1",
		Audience:      "audience1",
	})

	jwt2 := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "issuer2",
		Audience:      "audience2",
	})

	token, err := jwt1.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Try to validate with different issuer/audience
	_, err = jwt2.ValidateToken(token)
	if err == nil {
		t.Error("expected error for invalid issuer/audience")
	}
}

func TestJWT_Middleware_ValidToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	token, err := jwt.GenerateToken("user123", "testuser", "admin")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	handler := jwt.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userCtx := GetUserFromContext(r.Context())
		if userCtx == nil {
			t.Error("expected user context")
			return
		}

		if userCtx.UserID != "user123" {
			t.Errorf("expected UserID 'user123', got '%s'", userCtx.UserID)
		}
		if userCtx.Username != "testuser" {
			t.Errorf("expected Username 'testuser', got '%s'", userCtx.Username)
		}
		if userCtx.Role != "admin" {
			t.Errorf("expected Role 'admin', got '%s'", userCtx.Role)
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
	}
}

func TestJWT_Middleware_MissingToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	handler := jwt.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called without token")
	}))

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if response["success"] != false {
		t.Error("expected success to be false")
	}
	if response["error"] != "missing authorization header" {
		t.Errorf("unexpected error message: %v", response["error"])
	}
}

func TestJWT_Middleware_InvalidAuthFormat(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	handler := jwt.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with invalid auth format")
	}))

	tests := []struct {
		name   string
		header string
	}{
		{"no bearer prefix", "token123"},
		{"empty bearer", "Bearer "},
		{"wrong prefix", "Basic token123"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("Authorization", tt.header)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
			}
		})
	}
}

func TestJWT_Middleware_InvalidToken(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	handler := jwt.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with invalid token")
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if !strings.Contains(response["error"].(string), "invalid token") {
		t.Errorf("expected invalid token error, got: %v", response["error"])
	}
}

func TestJWT_RequireRole(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	adminToken, _ := jwt.GenerateToken("admin123", "admin", "admin")
	userToken, _ := jwt.GenerateToken("user123", "user", "user")

	handler := jwt.Middleware(jwt.RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	t.Run("admin role allowed", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
	})

	t.Run("user role denied", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer "+userToken)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Errorf("expected status %d, got %d", http.StatusForbidden, w.Code)
		}

		var response map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &response)
		if !strings.Contains(response["error"].(string), "required role: admin") {
			t.Errorf("unexpected error message: %v", response["error"])
		}
	})
}

func TestJWT_RequireAnyRole(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	adminToken, _ := jwt.GenerateToken("admin123", "admin", "admin")
	moderatorToken, _ := jwt.GenerateToken("mod123", "mod", "moderator")
	userToken, _ := jwt.GenerateToken("user123", "user", "user")

	handler := jwt.Middleware(jwt.RequireAnyRole("admin", "moderator")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	tests := []struct {
		name       string
		token      string
		wantStatus int
	}{
		{"admin allowed", adminToken, http.StatusOK},
		{"moderator allowed", moderatorToken, http.StatusOK},
		{"user denied", userToken, http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("Authorization", "Bearer "+tt.token)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d", tt.wantStatus, w.Code)
			}
		})
	}
}

func TestJWT_OptionalAuth(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	token, _ := jwt.GenerateToken("user123", "testuser", "user")

	handler := jwt.OptionalAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userCtx := GetUserFromContext(r.Context())
		if userCtx != nil {
			w.Header().Set("X-User-ID", userCtx.UserID)
		}
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("with valid token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
		if userID := w.Header().Get("X-User-ID"); userID != "user123" {
			t.Errorf("expected User-ID header 'user123', got '%s'", userID)
		}
	})

	t.Run("without token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
		if userID := w.Header().Get("X-User-ID"); userID != "" {
			t.Errorf("expected no User-ID header, got '%s'", userID)
		}
	})

	t.Run("with invalid token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer invalid-token")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status %d, got %d", http.StatusOK, w.Code)
		}
		if userID := w.Header().Get("X-User-ID"); userID != "" {
			t.Errorf("expected no User-ID header for invalid token, got '%s'", userID)
		}
	})
}

func TestGetUserFromContext(t *testing.T) {
	userCtx := &UserContext{
		UserID:   "user123",
		Username: "testuser",
		Role:     "admin",
	}

	ctx := context.WithValue(context.Background(), UserContextKey, userCtx)

	retrievedCtx := GetUserFromContext(ctx)
	if retrievedCtx == nil {
		t.Fatal("expected user context, got nil")
	}

	if retrievedCtx.UserID != "user123" {
		t.Errorf("expected UserID 'user123', got '%s'", retrievedCtx.UserID)
	}
	if retrievedCtx.Username != "testuser" {
		t.Errorf("expected Username 'testuser', got '%s'", retrievedCtx.Username)
	}
	if retrievedCtx.Role != "admin" {
		t.Errorf("expected Role 'admin', got '%s'", retrievedCtx.Role)
	}
}

func TestGetUserFromContext_NoUser(t *testing.T) {
	ctx := context.Background()
	userCtx := GetUserFromContext(ctx)
	if userCtx != nil {
		t.Errorf("expected nil user context, got %+v", userCtx)
	}
}

func TestJWT_RequireRole_NoUserContext(t *testing.T) {
	jwt := NewJWT(JWTConfig{
		SecretKey:     []byte("test-secret-key"),
		TokenDuration: time.Hour,
		Issuer:        "test-issuer",
		Audience:      "test-audience",
	})

	// Test role middleware without auth middleware
	handler := jwt.RequireRole("admin")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called without user context")
	}))

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, w.Code)
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "user context not found" {
		t.Errorf("expected context error, got: %v", response["error"])
	}
}
