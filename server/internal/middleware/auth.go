package middleware

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// JWTConfig holds JWT authentication configuration
type JWTConfig struct {
	SecretKey     []byte
	TokenDuration time.Duration
	Issuer        string
	Audience      string
}

// JWT implements JWT authentication middleware
type JWT struct {
	config JWTConfig
}

// Claims represents JWT token claims
type Claims struct {
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	Issuer    string `json:"iss"`
	Audience  string `json:"aud"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
}

// UserContext holds authenticated user information
type UserContext struct {
	UserID   string
	Username string
	Role     string
}

// contextKey is a type for context keys to avoid collisions
type contextKey string

const (
	// UserContextKey is the key for storing user context
	UserContextKey contextKey = "user"
)

// NewJWT creates a new JWT authentication middleware
func NewJWT(config JWTConfig) *JWT {
	return &JWT{config: config}
}

// GenerateToken creates a new JWT token for a user
func (j *JWT) GenerateToken(userID, username, role string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Username:  username,
		Role:      role,
		Issuer:    j.config.Issuer,
		Audience:  j.config.Audience,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(j.config.TokenDuration).Unix(),
	}

	// Create header
	header := map[string]interface{}{
		"alg": "HS256",
		"typ": "JWT",
	}

	// Encode header
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("failed to marshal header: %w", err)
	}
	headerEncoded := base64.RawURLEncoding.EncodeToString(headerBytes)

	// Encode payload
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("failed to marshal claims: %w", err)
	}
	payloadEncoded := base64.RawURLEncoding.EncodeToString(payloadBytes)

	// Create signature
	message := headerEncoded + "." + payloadEncoded
	signature := j.sign(message)
	signatureEncoded := base64.RawURLEncoding.EncodeToString(signature)

	// Combine parts
	token := headerEncoded + "." + payloadEncoded + "." + signatureEncoded
	return token, nil
}

// ValidateToken validates a JWT token and returns the claims
func (j *JWT) ValidateToken(tokenString string) (*Claims, error) {
	// Split token into parts
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid token format")
	}

	headerEncoded, payloadEncoded, signatureEncoded := parts[0], parts[1], parts[2]

	// Verify signature
	message := headerEncoded + "." + payloadEncoded
	expectedSignature := j.sign(message)
	expectedSignatureEncoded := base64.RawURLEncoding.EncodeToString(expectedSignature)

	if signatureEncoded != expectedSignatureEncoded {
		return nil, fmt.Errorf("invalid token signature")
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadEncoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}

	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, fmt.Errorf("failed to unmarshal claims: %w", err)
	}

	// Validate claims
	now := time.Now().Unix()
	if claims.ExpiresAt < now {
		return nil, fmt.Errorf("token expired")
	}

	if claims.Issuer != j.config.Issuer {
		return nil, fmt.Errorf("invalid issuer")
	}

	if claims.Audience != j.config.Audience {
		return nil, fmt.Errorf("invalid audience")
	}

	return &claims, nil
}

// Middleware returns the JWT authentication middleware
func (j *JWT) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			j.unauthorizedResponse(w, "missing authorization header")
			return
		}

		// Check for Bearer prefix
		const bearerPrefix = "Bearer "
		if !strings.HasPrefix(authHeader, bearerPrefix) {
			j.unauthorizedResponse(w, "invalid authorization header format")
			return
		}

		// Extract token
		token := strings.TrimPrefix(authHeader, bearerPrefix)
		if token == "" {
			j.unauthorizedResponse(w, "missing token")
			return
		}

		// Validate token
		claims, err := j.ValidateToken(token)
		if err != nil {
			j.unauthorizedResponse(w, fmt.Sprintf("invalid token: %v", err))
			return
		}

		// Add user context to request
		userCtx := &UserContext{
			UserID:   claims.UserID,
			Username: claims.Username,
			Role:     claims.Role,
		}

		ctx := context.WithValue(r.Context(), UserContextKey, userCtx)
		r = r.WithContext(ctx)

		next.ServeHTTP(w, r)
	})
}

// RequireRole creates middleware that requires a specific role
func (j *JWT) RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userCtx := GetUserFromContext(r.Context())
			if userCtx == nil {
				j.forbiddenResponse(w, "user context not found")
				return
			}

			if userCtx.Role != role {
				j.forbiddenResponse(w, fmt.Sprintf("required role: %s, got: %s", role, userCtx.Role))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireAnyRole creates middleware that requires any of the specified roles
func (j *JWT) RequireAnyRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userCtx := GetUserFromContext(r.Context())
			if userCtx == nil {
				j.forbiddenResponse(w, "user context not found")
				return
			}

			hasRole := false
			for _, role := range roles {
				if userCtx.Role == role {
					hasRole = true
					break
				}
			}

			if !hasRole {
				j.forbiddenResponse(w, fmt.Sprintf("required one of roles: %v, got: %s", roles, userCtx.Role))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// sign creates an HMAC-SHA256 signature for the message
func (j *JWT) sign(message string) []byte {
	h := hmac.New(sha256.New, j.config.SecretKey)
	h.Write([]byte(message))
	return h.Sum(nil)
}

// unauthorizedResponse sends a 401 Unauthorized response
func (j *JWT) unauthorizedResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"success": false,
	})
}

// forbiddenResponse sends a 403 Forbidden response
func (j *JWT) forbiddenResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"success": false,
	})
}

// GetUserFromContext extracts user context from request context
func GetUserFromContext(ctx context.Context) *UserContext {
	if userCtx, ok := ctx.Value(UserContextKey).(*UserContext); ok {
		return userCtx
	}
	return nil
}

// OptionalAuth provides optional JWT authentication
// If token is present and valid, user context is added
// If token is missing or invalid, request continues without authentication
func (j *JWT) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			const bearerPrefix = "Bearer "
			if strings.HasPrefix(authHeader, bearerPrefix) {
				token := strings.TrimPrefix(authHeader, bearerPrefix)
				if token != "" {
					// Try to validate token
					claims, err := j.ValidateToken(token)
					if err == nil {
						// Add user context to request
						userCtx := &UserContext{
							UserID:   claims.UserID,
							Username: claims.Username,
							Role:     claims.Role,
						}
						ctx := context.WithValue(r.Context(), UserContextKey, userCtx)
						r = r.WithContext(ctx)
					}
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}
