package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds server configuration
type Config struct {
	Port               string
	Host               string
	AllowedOrigins     []string
	MaxSessions        int
	SessionTimeout     int // in minutes
	EnableAuth         bool
	AuthRequired       bool   // Whether auth is required for API access
	ServerName         string // Server name for display
	StaticDir          string
	FileSystemBasePath string // Base path for filesystem operations
	GitBasePath        string // Base path for git operations
	VAPIDKeyPath       string // Path to store VAPID keys for push notifications

	// Security middleware configuration
	EnableRateLimit   bool
	RateLimitPerMin   int // Requests per minute per IP
	EnableCSRF        bool
	CSRFSecret        string
	EnableIPWhitelist bool
	AllowedIPs        []string // CIDR notation allowed
	EnableRequestLog  bool
}

// LoadConfig loads configuration from environment variables with defaults
func LoadConfig() *Config {
	cfg := &Config{
		Port:               getEnv("PORT", "4021"),
		Host:               getEnv("HOST", "localhost"),
		AllowedOrigins:     []string{"*"}, // For development - should be restricted in production
		MaxSessions:        getEnvInt("MAX_SESSIONS", 50),
		SessionTimeout:     getEnvInt("SESSION_TIMEOUT", 1440), // 24 hours
		EnableAuth:         getEnvBool("ENABLE_AUTH", false),
		AuthRequired:       getEnvBool("AUTH_REQUIRED", false), // Whether auth is required for API access
		ServerName:         getEnv("SERVER_NAME", "VibeTunnel Go Server"),
		StaticDir:          getEnv("STATIC_DIR", "../web/public"),                           // Relative to web frontend
		FileSystemBasePath: getEnv("FILESYSTEM_BASE_PATH", os.Getenv("HOME")),               // Default to user's home directory
		GitBasePath:        getEnv("GIT_BASE_PATH", os.Getenv("HOME")),                      // Default to user's home directory
		VAPIDKeyPath:       getEnv("VAPID_KEY_PATH", os.Getenv("HOME")+"/.vibetunnel/keys"), // Default to user's config directory

		// Security middleware defaults
		EnableRateLimit:   getEnvBool("ENABLE_RATE_LIMIT", true),
		RateLimitPerMin:   getEnvInt("RATE_LIMIT_PER_MIN", 100),
		EnableCSRF:        getEnvBool("ENABLE_CSRF", false), // Disabled by default for development
		CSRFSecret:        getEnv("CSRF_SECRET", "vibetunnel-csrf-secret-change-in-production"),
		EnableIPWhitelist: getEnvBool("ENABLE_IP_WHITELIST", false),                             // Disabled by default
		AllowedIPs:        getEnvStringSlice("ALLOWED_IPS", []string{"127.0.0.1/8", "::1/128"}), // Localhost by default
		EnableRequestLog:  getEnvBool("ENABLE_REQUEST_LOG", true),
	}

	return cfg
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getEnvStringSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return strings.Split(value, ",")
	}
	return defaultValue
}
