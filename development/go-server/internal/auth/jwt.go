package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// UserClaims represents the JWT claims for a user
type UserClaims struct {
	UserID   string   `json:"user_id"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

// HasRole checks if the user has a specific role
func (uc *UserClaims) HasRole(role string) bool {
	for _, r := range uc.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// HasAnyRole checks if the user has any of the specified roles
func (uc *UserClaims) HasAnyRole(roles []string) bool {
	for _, role := range roles {
		if uc.HasRole(role) {
			return true
		}
	}
	return false
}

// JWTAuth handles JWT token generation and validation
type JWTAuth struct {
	secret []byte
}

// NewJWTAuth creates a new JWT authentication handler
func NewJWTAuth(secret string) *JWTAuth {
	return &JWTAuth{
		secret: []byte(secret),
	}
}

// GenerateToken generates a JWT token for the given claims
func (j *JWTAuth) GenerateToken(userClaims UserClaims, duration time.Duration) (string, error) {
	now := time.Now()
	claims := UserClaims{
		UserID:   userClaims.UserID,
		Username: userClaims.Username,
		Roles:    userClaims.Roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "vibetunnel-go-server",
			Subject:   userClaims.UserID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secret)
}

// ValidateToken validates a JWT token and returns the claims
func (j *JWTAuth) ValidateToken(tokenString string) (*UserClaims, error) {
	if tokenString == "" {
		return nil, fmt.Errorf("token is empty")
	}

	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	if claims, ok := token.Claims.(*UserClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token claims")
}

// RefreshToken generates a new token from an existing (possibly expired) token
func (j *JWTAuth) RefreshToken(tokenString string, newDuration time.Duration) (string, error) {
	// Parse the token without validating expiration
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return j.secret, nil
	}, jwt.WithoutClaimsValidation())

	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	if claims, ok := token.Claims.(*UserClaims); ok {
		// Generate new token with the same user claims but new expiration
		newClaims := UserClaims{
			UserID:   claims.UserID,
			Username: claims.Username,
			Roles:    claims.Roles,
		}
		return j.GenerateToken(newClaims, newDuration)
	}

	return "", fmt.Errorf("invalid token claims")
}

// JWTMiddleware returns a middleware that validates JWT tokens
func (j *JWTAuth) JWTMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get the Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				j.writeUnauthorizedResponse(w, "missing authorization header")
				return
			}

			// Check if it's a Bearer token
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				j.writeUnauthorizedResponse(w, "invalid authorization header format")
				return
			}

			tokenString := strings.TrimSpace(parts[1])
			if tokenString == "" {
				j.writeUnauthorizedResponse(w, "missing token")
				return
			}

			// Validate the token
			claims, err := j.ValidateToken(tokenString)
			if err != nil {
				j.writeUnauthorizedResponse(w, "invalid token")
				return
			}

			// Add user claims to the request context
			ctx := context.WithValue(r.Context(), userContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// writeUnauthorizedResponse writes a JSON error response
func (j *JWTAuth) writeUnauthorizedResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"success": false,
	})
}

// Context key for user claims
type contextKey string

const userContextKey contextKey = "user"

// GetUserFromContext extracts user claims from the request context
func GetUserFromContext(ctx context.Context) *UserClaims {
	if user, ok := ctx.Value(userContextKey).(*UserClaims); ok {
		return user
	}
	return nil
}

// RequireRole returns a middleware that requires a specific role
func RequireRole(requiredRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				writeForbiddenResponse(w, "authentication required")
				return
			}

			if !user.HasRole(requiredRole) {
				writeForbiddenResponse(w, fmt.Sprintf("role '%s' required", requiredRole))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireAnyRole returns a middleware that requires any of the specified roles
func RequireAnyRole(requiredRoles []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := GetUserFromContext(r.Context())
			if user == nil {
				writeForbiddenResponse(w, "authentication required")
				return
			}

			if !user.HasAnyRole(requiredRoles) {
				writeForbiddenResponse(w, fmt.Sprintf("one of roles %v required", requiredRoles))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// writeForbiddenResponse writes a JSON forbidden response
func writeForbiddenResponse(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   message,
		"success": false,
	})
}

// PasswordAuth handles password hashing and validation
type PasswordAuth struct {
	cost int
}

// NewPasswordAuth creates a new password authentication handler
func NewPasswordAuth() *PasswordAuth {
	return &PasswordAuth{
		cost: bcrypt.DefaultCost, // Use bcrypt default cost (10)
	}
}

// HashPassword hashes a password using bcrypt
func (p *PasswordAuth) HashPassword(password string) (string, error) {
	if password == "" {
		return "", fmt.Errorf("password cannot be empty")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), p.cost)
	if err != nil {
		return "", fmt.Errorf("failed to hash password: %w", err)
	}

	return string(hash), nil
}

// CheckPassword verifies a password against a hash
func (p *PasswordAuth) CheckPassword(password, hash string) bool {
	if password == "" || hash == "" {
		return false
	}

	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
