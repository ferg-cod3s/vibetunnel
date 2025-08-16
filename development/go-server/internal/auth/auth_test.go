package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJWTAuth_GenerateToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin", "user"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	
	// Token should have 3 parts (header.payload.signature)
	parts := strings.Split(token, ".")
	assert.Len(t, parts, 3)
}

func TestJWTAuth_ValidateToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser", 
		Roles:    []string{"admin"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	// Valid token should validate successfully
	parsedClaims, err := auth.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, claims.UserID, parsedClaims.UserID)
	assert.Equal(t, claims.Username, parsedClaims.Username)
	assert.Equal(t, claims.Roles, parsedClaims.Roles)
}

func TestJWTAuth_ValidateToken_Invalid(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	// Invalid token should fail validation
	_, err := auth.ValidateToken("invalid.token.here")
	assert.Error(t, err)
	
	// Empty token should fail validation
	_, err = auth.ValidateToken("")
	assert.Error(t, err)
}

func TestJWTAuth_ValidateToken_Expired(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123", 
		Username: "testuser",
		Roles:    []string{"user"},
	}
	
	// Generate token with very short expiration
	token, err := auth.GenerateToken(claims, time.Millisecond)
	require.NoError(t, err)
	
	// Wait for token to expire
	time.Sleep(10 * time.Millisecond)
	
	// Expired token should fail validation
	_, err = auth.ValidateToken(token)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expired")
}

func TestJWTAuth_ValidateToken_WrongSecret(t *testing.T) {
	auth1 := NewJWTAuth("secret1")
	auth2 := NewJWTAuth("secret2")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"},
	}
	
	// Generate token with first auth
	token, err := auth1.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	// Validate with different secret should fail
	_, err = auth2.ValidateToken(token)
	assert.Error(t, err)
}

func TestJWTMiddleware_ValidToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	// Create test handler
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract claims from context
		userClaims := GetUserFromContext(r.Context())
		require.NotNil(t, userClaims)
		assert.Equal(t, claims.UserID, userClaims.UserID)
		w.WriteHeader(http.StatusOK)
	})
	
	// Wrap with JWT middleware
	middleware := auth.JWTMiddleware()
	handler := middleware(testHandler)
	
	// Create request with valid token
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestJWTMiddleware_MissingToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	middleware := auth.JWTMiddleware()
	handler := middleware(testHandler)
	
	// Request without token
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "missing authorization header")
}

func TestJWTMiddleware_InvalidToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	middleware := auth.JWTMiddleware()
	handler := middleware(testHandler)
	
	// Request with invalid token
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "invalid token")
}

func TestJWTMiddleware_MalformedAuthHeader(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	middleware := auth.JWTMiddleware()
	handler := middleware(testHandler)
	
	testCases := []string{
		"InvalidFormat",
		"Basic dGVzdA==",  // Wrong auth type
		"Bearer",          // Missing token
		"Bearer  ",        // Empty token
	}
	
	for _, authHeader := range testCases {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", authHeader)
		w := httptest.NewRecorder()
		
		handler.ServeHTTP(w, req)
		
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	}
}

func TestPasswordAuth_HashPassword(t *testing.T) {
	auth := NewPasswordAuth()
	
	password := "testpassword123"
	hash, err := auth.HashPassword(password)
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, password, hash)
	
	// Hash should be different each time (due to salt)
	hash2, err := auth.HashPassword(password)
	require.NoError(t, err)
	assert.NotEqual(t, hash, hash2)
}

func TestPasswordAuth_CheckPassword(t *testing.T) {
	auth := NewPasswordAuth()
	
	password := "testpassword123"
	hash, err := auth.HashPassword(password)
	require.NoError(t, err)
	
	// Correct password should match
	isValid := auth.CheckPassword(password, hash)
	assert.True(t, isValid)
	
	// Wrong password should not match
	isValid = auth.CheckPassword("wrongpassword", hash)
	assert.False(t, isValid)
	
	// Empty password should not match
	isValid = auth.CheckPassword("", hash)
	assert.False(t, isValid)
}

func TestPasswordAuth_CheckPassword_InvalidHash(t *testing.T) {
	auth := NewPasswordAuth()
	
	// Invalid hash should not panic
	isValid := auth.CheckPassword("password", "invalid-hash")
	assert.False(t, isValid)
	
	// Empty hash should not match
	isValid = auth.CheckPassword("password", "")
	assert.False(t, isValid)
}

func TestUserClaims_HasRole(t *testing.T) {
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin", "user", "moderator"},
	}
	
	// Should have existing roles
	assert.True(t, claims.HasRole("admin"))
	assert.True(t, claims.HasRole("user"))
	assert.True(t, claims.HasRole("moderator"))
	
	// Should not have non-existing roles
	assert.False(t, claims.HasRole("superuser"))
	assert.False(t, claims.HasRole("guest"))
	assert.False(t, claims.HasRole(""))
}

func TestUserClaims_HasAnyRole(t *testing.T) {
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user", "moderator"},
	}
	
	// Should match if any role exists
	assert.True(t, claims.HasAnyRole([]string{"admin", "user"}))
	assert.True(t, claims.HasAnyRole([]string{"moderator", "superuser"}))
	
	// Should not match if no roles exist
	assert.False(t, claims.HasAnyRole([]string{"admin", "superuser"}))
	assert.False(t, claims.HasAnyRole([]string{}))
}

func TestRequireRole_ValidRole(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin", "user"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	// Chain middleware
	jwtMiddleware := auth.JWTMiddleware()
	roleMiddleware := RequireRole("admin")
	handler := jwtMiddleware(roleMiddleware(testHandler))
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRequireRole_InvalidRole(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"}, // No admin role
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	// Chain middleware
	jwtMiddleware := auth.JWTMiddleware()
	roleMiddleware := RequireRole("admin")
	handler := jwtMiddleware(roleMiddleware(testHandler))
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRequireAnyRole_ValidRole(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"moderator", "user"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	
	// Chain middleware
	jwtMiddleware := auth.JWTMiddleware()
	roleMiddleware := RequireAnyRole([]string{"admin", "moderator"})
	handler := jwtMiddleware(roleMiddleware(testHandler))
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRequireAnyRole_NoValidRole(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"}, // Only user role
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	// Chain middleware
	jwtMiddleware := auth.JWTMiddleware()
	roleMiddleware := RequireAnyRole([]string{"admin", "moderator"})
	handler := jwtMiddleware(roleMiddleware(testHandler))
	
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetUserFromContext_NoUser(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	user := GetUserFromContext(req.Context())
	assert.Nil(t, user)
}

func TestRefreshToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	originalClaims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin"},
	}
	
	// Generate original token with short expiration
	originalToken, err := auth.GenerateToken(originalClaims, time.Minute)
	require.NoError(t, err)
	
	// Refresh the token
	newToken, err := auth.RefreshToken(originalToken, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, newToken)
	assert.NotEqual(t, originalToken, newToken)
	
	// Validate new token
	newClaims, err := auth.ValidateToken(newToken)
	require.NoError(t, err)
	assert.Equal(t, originalClaims.UserID, newClaims.UserID)
	assert.Equal(t, originalClaims.Username, newClaims.Username)
	assert.Equal(t, originalClaims.Roles, newClaims.Roles)
}

func TestRefreshToken_InvalidToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	// Try to refresh invalid token
	_, err := auth.RefreshToken("invalid-token", time.Hour)
	assert.Error(t, err)
}

func TestJWTAuth_ValidateToken_UnexpectedSigningMethod(t *testing.T) {
	// Test token with different signing method (RS256 instead of HS256)
	auth := NewJWTAuth("test-secret")
	
	// Create a valid JWT token with RS256 signing method
	// Header: {"alg":"RS256","typ":"JWT"}
	// Payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
	// This is a properly formatted JWT but with RS256 algorithm
	invalidToken := "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.NHVaYe26MbtOYhSKkoKYdFVomg4i8ZJd8_-RU8VNbftc4TSMb4bXP3l3YlNWACwyXPGffz5aXHc6lty1Y2t4SWRqGteragsVdZufDn5BlnJl9pdR_kdVFUsra2rWKEofkZeIC4yWytE58sMIihvo9H1ScmmVwBcQP6XETqYd0aSHp1gOa9RdUPDvoXQ5oqygTqVtxaDr6wUFKrKItgBMzWIdNZ6y7O9E0DhEPTbE9rfBo6KTFsHAZnMg4k68CDp2woYIaXbmYTWcvbzIuHO7_37GT79XdIwkm95QJ7hYC9RiwrV7mesbY4PAahERJawntho0my942XheVLmGwLMBkQ"
	
	_, err := auth.ValidateToken(invalidToken)
	assert.Error(t, err)
	// Since this is a real RS256 token, it should fail with signing method error
	assert.Contains(t, err.Error(), "unexpected signing method")
}

func TestPasswordAuth_HashPassword_EmptyPassword(t *testing.T) {
	auth := NewPasswordAuth()
	
	// Empty password should return error
	_, err := auth.HashPassword("")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "password cannot be empty")
}

func TestRefreshToken_ExpiredToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"},
	}
	
	// Generate token with very short expiration
	expiredToken, err := auth.GenerateToken(claims, time.Millisecond)
	require.NoError(t, err)
	
	// Wait for token to expire
	time.Sleep(10 * time.Millisecond)
	
	// Should still be able to refresh expired token
	newToken, err := auth.RefreshToken(expiredToken, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, newToken)
	
	// New token should be valid
	newClaims, err := auth.ValidateToken(newToken)
	require.NoError(t, err)
	assert.Equal(t, claims.UserID, newClaims.UserID)
}

func TestRefreshToken_WrongSigningMethod(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	// Token with wrong signing method should fail refresh
	invalidToken := "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWV9.invalid"
	
	_, err := auth.RefreshToken(invalidToken, time.Hour)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unexpected signing method")
}

func TestRequireRole_NoUserInContext(t *testing.T) {
	// Test RequireRole when no user is in context (without JWT middleware)
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	roleMiddleware := RequireRole("admin")
	handler := roleMiddleware(testHandler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusForbidden, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "authentication required")
}

func TestRequireAnyRole_NoUserInContext(t *testing.T) {
	// Test RequireAnyRole when no user is in context (without JWT middleware)
	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("Handler should not be called")
	})
	
	roleMiddleware := RequireAnyRole([]string{"admin", "moderator"})
	handler := roleMiddleware(testHandler)
	
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	
	handler.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusForbidden, w.Code)
	
	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Contains(t, response["error"], "authentication required")
}

func TestJWTAuth_ValidateToken_MalformedToken(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	testCases := []string{
		"not.a.jwt",                    // Invalid format
		"header.payload",               // Missing signature
		"header.payload.signature.extra", // Too many parts
		"header..signature",            // Empty payload
		".payload.signature",           // Empty header
		"header.payload.",              // Empty signature
	}
	
	for _, token := range testCases {
		_, err := auth.ValidateToken(token)
		assert.Error(t, err, "Token should be invalid: %s", token)
	}
}

func TestUserClaims_HasRole_EdgeCases(t *testing.T) {
	// Test with nil roles
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    nil,
	}
	
	assert.False(t, claims.HasRole("admin"))
	assert.False(t, claims.HasAnyRole([]string{"admin", "user"}))
	
	// Test with empty roles slice
	claims.Roles = []string{}
	assert.False(t, claims.HasRole("admin"))
	assert.False(t, claims.HasAnyRole([]string{"admin", "user"}))
}

func TestJWTAuth_TokenWithCustomClaims(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	// Test token generation and validation with custom issuer, audience
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"admin"},
	}
	
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	// Validate and check custom claims
	validatedClaims, err := auth.ValidateToken(token)
	require.NoError(t, err)
	
	assert.Equal(t, "vibetunnel-go-server", validatedClaims.Issuer)
	assert.Equal(t, claims.UserID, validatedClaims.Subject)
	assert.NotNil(t, validatedClaims.IssuedAt)
	assert.NotNil(t, validatedClaims.ExpiresAt)
	assert.NotNil(t, validatedClaims.NotBefore)
}

func TestJWTAuth_GenerateToken_ZeroDuration(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"},
	}
	
	// Generate token with zero duration (should be immediately expired)
	token, err := auth.GenerateToken(claims, 0)
	require.NoError(t, err)
	assert.NotEmpty(t, token)
	
	// Token should be immediately expired
	_, err = auth.ValidateToken(token)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "expired")
}

func TestRefreshToken_InvalidClaims(t *testing.T) {
	auth := NewJWTAuth("test-secret")
	
	claims := UserClaims{
		UserID:   "user123",
		Username: "testuser",
		Roles:    []string{"user"},
	}
	
	// Generate valid token
	token, err := auth.GenerateToken(claims, time.Hour)
	require.NoError(t, err)
	
	// Try to refresh - this should work normally
	newToken, err := auth.RefreshToken(token, time.Hour)
	require.NoError(t, err)
	assert.NotEmpty(t, newToken)
	
	// Validate the refreshed token
	_, err = auth.ValidateToken(newToken)
	assert.NoError(t, err)
}

func TestJWTAuth_TokenSigningAndValidationFlow(t *testing.T) {
	// Test comprehensive flow: generate -> validate -> refresh -> validate
	auth := NewJWTAuth("comprehensive-test-secret")
	
	originalClaims := UserClaims{
		UserID:   "test-user-456",
		Username: "comprehensive-user",
		Roles:    []string{"admin", "user", "tester"},
	}
	
	// 1. Generate token
	token1, err := auth.GenerateToken(originalClaims, time.Hour*2)
	require.NoError(t, err)
	assert.NotEmpty(t, token1)
	
	// 2. Validate token
	validatedClaims, err := auth.ValidateToken(token1)
	require.NoError(t, err)
	assert.Equal(t, originalClaims.UserID, validatedClaims.UserID)
	assert.Equal(t, originalClaims.Username, validatedClaims.Username)
	assert.Equal(t, originalClaims.Roles, validatedClaims.Roles)
	
	// 3. Refresh token
	token2, err := auth.RefreshToken(token1, time.Hour*3)
	require.NoError(t, err)
	assert.NotEmpty(t, token2)
	assert.NotEqual(t, token1, token2)
	
	// 4. Validate refreshed token
	refreshedClaims, err := auth.ValidateToken(token2)
	require.NoError(t, err)
	assert.Equal(t, originalClaims.UserID, refreshedClaims.UserID)
	assert.Equal(t, originalClaims.Username, refreshedClaims.Username)
	assert.Equal(t, originalClaims.Roles, refreshedClaims.Roles)
	
	// 5. Test role-based functionality
	assert.True(t, refreshedClaims.HasRole("admin"))
	assert.True(t, refreshedClaims.HasRole("tester"))
	assert.False(t, refreshedClaims.HasRole("superuser"))
	assert.True(t, refreshedClaims.HasAnyRole([]string{"moderator", "admin"}))
	assert.False(t, refreshedClaims.HasAnyRole([]string{"guest", "visitor"}))
}
