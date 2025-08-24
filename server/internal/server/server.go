package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/middleware"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/auth"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/buffer"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/config"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/control"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/events"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/filesystem"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/git"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/logs"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/persistence"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/push"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/static"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/tmux"
	"github.com/ferg-cod3s/tunnelforge/go-server/internal/websocket"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

type Config struct {
	Port string
}

type Server struct {
	config             *config.Config
	httpServer         *http.Server
	sessionManager     *session.Manager
	wsHandler          *websocket.Handler
	bufferAggregator   *buffer.BufferAggregator
	jwtAuth            *auth.JWTAuth
	passwordAuth       *auth.PasswordAuth
	fileSystem         *filesystem.FileSystemService
	gitService         *git.GitService
	logService         *logs.LogService
	controlService     *control.ControlService
	tmuxService        *tmux.TmuxService
	eventBroadcaster   *events.EventBroadcaster
	pushService        *push.PushService
	pushHandler        *push.PushHandler
	persistenceService *persistence.Service
	startTime          time.Time
	mu                 sync.RWMutex
}

func New(cfg *Config) (*Server, error) {
	// Load full configuration
	fullConfig := config.LoadConfig()
	if cfg.Port != "" {
		fullConfig.Port = cfg.Port
	}

	// Initialize persistence service if enabled
	var persistenceService *persistence.Service
	var sessionManager *session.Manager

	if fullConfig.EnablePersistence {
		// Create file store for session persistence
		fileStore, err := persistence.NewFileStore(fullConfig.PersistenceDir)
		if err != nil {
			log.Printf("Warning: Failed to initialize session persistence: %v", err)
			sessionManager = session.NewManager()
		} else {
			// Create persistence service with auto-save
			persistenceService = persistence.NewService(fileStore, true, fullConfig.PersistenceInterval)
			persistenceService.Start()

			// Create session manager with persistence
			sessionManager = session.NewManagerWithPersistence(persistenceService)

			// Restore persisted sessions on startup
			if err := sessionManager.RestorePersistedSessions(); err != nil {
				log.Printf("Warning: Failed to restore persisted sessions: %v", err)
			}
		}
	} else {
		// Create session manager without persistence
		sessionManager = session.NewManager()
	}

	// Create WebSocket handler
	wsHandler := websocket.NewHandler(sessionManager)
	wsHandler.SetAllowedOrigins(fullConfig.AllowedOrigins)

	// Create filesystem service with safe base path
	basePath := fullConfig.FileSystemBasePath
	if basePath == "" {
		basePath = "/" // Default to root, but this should be configured securely
	}
	fileSystemService := filesystem.NewFileSystemService(basePath)

	// Initialize authentication services
	jwtAuth := auth.NewJWTAuth("tunnelforge-jwt-secret-change-in-production")
	passwordAuth := auth.NewPasswordAuth()

	// Initialize event broadcaster
	eventBroadcaster := events.NewEventBroadcaster()

	// Create git service with safe base path
	gitBasePath := fullConfig.GitBasePath
	if gitBasePath == "" {
		gitBasePath = "/" // Default to root, but this should be configured securely
	}
	gitService := git.NewGitService(gitBasePath, eventBroadcaster)

	// Initialize buffer aggregator
	bufferAggregator := buffer.NewBufferAggregator()

	// Initialize log service
	logService := logs.NewLogService()

	// Initialize control service
	controlService := control.NewControlService()

	// Initialize tmux service
	tmuxService := tmux.NewTmuxService(sessionManager)

	// Initialize push notification system
	vapidKeyManager := push.NewVAPIDKeyManager(fullConfig.VAPIDKeyPath)
	vapidKeys, err := vapidKeyManager.GetOrGenerateKeys()
	if err != nil {
		log.Printf("Warning: Failed to initialize VAPID keys: %v", err)
		vapidKeys = nil
	}

	subscriptionStore := push.NewInMemorySubscriptionStore()
	var pushService *push.PushService
	var pushHandler *push.PushHandler

	if vapidKeys != nil {
		pushService, err = push.NewPushService(vapidKeys, subscriptionStore, nil)
		if err != nil {
			log.Printf("Warning: Failed to create push service: %v", err)
		} else {
			pushHandler = push.NewPushHandler(pushService, vapidKeyManager, subscriptionStore)
		}
	}

	s := &Server{
		config:             fullConfig,
		sessionManager:     sessionManager,
		wsHandler:          wsHandler,
		bufferAggregator:   bufferAggregator,
		fileSystem:         fileSystemService,
		gitService:         gitService,
		logService:         logService,
		controlService:     controlService,
		tmuxService:        tmuxService,
		jwtAuth:            jwtAuth,
		passwordAuth:       passwordAuth,
		eventBroadcaster:   eventBroadcaster,
		pushService:        pushService,
		pushHandler:        pushHandler,
		persistenceService: persistenceService,
		startTime:          time.Now(),
	}

	// Set up event broadcasting hooks
	s.setupEventHooks()

	// Setup HTTP server
	s.setupRoutes()

	return s, nil
}

func (s *Server) setupRoutes() {
	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", s.handleHealth).Methods("GET")

	// WebSocket endpoint
	r.HandleFunc("/ws", s.wsHandler.HandleWebSocket)

	// Buffer WebSocket endpoint for real-time terminal streaming
	r.HandleFunc("/buffers", s.bufferAggregator.HandleWebSocket)

	// API routes - unprotected base
	api := r.PathPrefix("/api").Subrouter()

	// General server endpoints for frontend compatibility
	api.HandleFunc("/config", s.handleServerConfig).Methods("GET")
	api.HandleFunc("/server/status", s.handleServerStatus).Methods("GET")

	// Server-Sent Events endpoint for real-time events
	api.HandleFunc("/events", s.eventBroadcaster.HandleSSE).Methods("GET")

	// Test endpoint to trigger events (for development/testing)
	api.HandleFunc("/events/test", s.handleTestEvent).Methods("POST")

	// Auth routes (should be accessible without authentication)
	auth := api.PathPrefix("/auth").Subrouter()
	auth.HandleFunc("/config", s.handleAuthConfig).Methods("GET")
	auth.HandleFunc("/login", s.handleLogin).Methods("POST")
	auth.HandleFunc("/password", s.handlePasswordAuth).Methods("POST")

	// Create authentication middleware that supports both JWT and local bypass
	authMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check for local bypass header first (for Mac app compatibility)
			if s.config.AllowLocalBypass {
				localHeader := r.Header.Get("X-TunnelForge-Local")
				if localHeader != "" {
					// Check if the request is from localhost
					clientIP := getClientIP(r)
					if isLocalhost(clientIP) {
						// Create a local user context for bypass authentication
						userCtx := &middleware.UserContext{
							UserID:   "local-user",
							Username: "system",
							Role:     "admin", // Local bypass gets admin privileges
						}
						ctx := context.WithValue(r.Context(), middleware.UserContextKey, userCtx)
						r = r.WithContext(ctx)
						next.ServeHTTP(w, r)
						return
					}
				}
			}

			// Fall back to standard JWT authentication
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				s.writeJSONError(w, "missing authorization header", http.StatusUnauthorized)
				return
			}

			const bearerPrefix = "Bearer "
			if !strings.HasPrefix(authHeader, bearerPrefix) {
				s.writeJSONError(w, "invalid authorization header format", http.StatusUnauthorized)
				return
			}

			token := strings.TrimPrefix(authHeader, bearerPrefix)
			userClaims, err := s.jwtAuth.ValidateToken(token)
			if err != nil {
				s.writeJSONError(w, fmt.Sprintf("invalid token: %v", err), http.StatusUnauthorized)
				return
			}

			// Add user context to request (similar to middleware.UserContext)
			userCtx := &middleware.UserContext{
				UserID:   userClaims.UserID,
				Username: userClaims.Username,
				Role:     strings.Join(userClaims.Roles, ","), // Join roles for compatibility
			}

			ctx := context.WithValue(r.Context(), middleware.UserContextKey, userCtx)
			r = r.WithContext(ctx)

			next.ServeHTTP(w, r)
		})
	}

	// Conditionally protect current-user endpoint based on auth requirement
	if s.config.AuthRequired {
		protectedAuth := auth.NewRoute().Subrouter()
		protectedAuth.Use(authMiddleware)
		protectedAuth.HandleFunc("/current-user", s.handleCurrentUser).Methods("GET")
	} else {
		// When auth is not required, provide current-user endpoint without protection
		auth.HandleFunc("/current-user", s.handleCurrentUser).Methods("GET")
	}

	// Session routes (protected if auth is required)
	sessionRouter := api
	if s.config.AuthRequired {
		protectedAPI := api.NewRoute().Subrouter()
		protectedAPI.Use(authMiddleware)
		sessionRouter = protectedAPI
	}
	sessionRouter.HandleFunc("/sessions", s.handleListSessions).Methods("GET")
	sessionRouter.HandleFunc("/sessions", s.handleCreateSession).Methods("POST")
	sessionRouter.HandleFunc("/sessions/{id}", s.handleGetSession).Methods("GET")
	sessionRouter.HandleFunc("/sessions/{id}", s.handleDeleteSession).Methods("DELETE")
	sessionRouter.HandleFunc("/sessions/{id}/resize", s.handleResizeSession).Methods("POST")
	sessionRouter.HandleFunc("/sessions/{id}/reset-size", s.handleResetSessionSize).Methods("POST")
	sessionRouter.HandleFunc("/sessions/{id}/input", s.handleSessionInput).Methods("POST")
	sessionRouter.HandleFunc("/sessions/{id}/stream", s.handleSessionStream).Methods("GET")
	sessionRouter.HandleFunc("/cleanup-exited", s.handleCleanupExited).Methods("POST")

	// Filesystem routes
	s.fileSystem.RegisterRoutes(r)

	// Git routes
	s.gitService.RegisterRoutes(r)

	// Log routes
	s.logService.RegisterRoutes(r)

	// Control routes
	s.controlService.RegisterRoutes(r)

	// Tmux routes
	s.tmuxService.RegisterRoutes(r)

	// Repository discovery routes (for frontend file browser)
	sessionRouter.HandleFunc("/repositories/discover", s.handleRepositoryDiscover).Methods("GET")

	// Push notification routes
	if s.pushHandler != nil {
		s.pushHandler.RegisterRoutes(r)
	}

	// Control stream route (for frontend compatibility)
	sessionRouter.HandleFunc("/control/stream", s.handleControlStream).Methods("GET")

	// Static file serving (serve embedded frontend files)
	staticHandler, err := static.GetStaticHandler()
	if err != nil {
		log.Printf("Warning: Could not set up static file serving: %v", err)
	} else {
		// Serve static files at root, but only if not an API route
		r.PathPrefix("/").Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// If it's an API route, WebSocket, or health check, don't serve static files
			if strings.HasPrefix(r.URL.Path, "/api/") || 
			   strings.HasPrefix(r.URL.Path, "/ws") || 
			   strings.HasPrefix(r.URL.Path, "/buffers") || 
			   strings.HasPrefix(r.URL.Path, "/health") {
				http.NotFound(w, r)
				return
			}
			
			// The static handler now handles the root path internally
			staticHandler.ServeHTTP(w, r)
		}))
	}

	// CORS middleware
	c := cors.New(cors.Options{
		AllowedOrigins:   s.config.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"},
		AllowCredentials: true,
	})

	// Build middleware chain: Apply security middleware in order
	var handler http.Handler = r

	// Apply CORS first (innermost)
	corsHandler := c.Handler(handler)

	// Apply compression and security headers, but skip for WebSocket and SSE routes
	handler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// Skip compression and security headers for WebSocket and SSE endpoints
		if req.URL.Path == "/ws" || 
		   req.URL.Path == "/buffers" || 
		   req.URL.Path == "/api/events" ||
		   req.URL.Path == "/api/control/stream" ||
		   strings.Contains(req.URL.Path, "/stream") {
			// SSE and WebSocket endpoints need direct access to the connection
			corsHandler.ServeHTTP(w, req)
			return
		}

		// Apply compression and security headers for non-streaming routes
		compressionHandler := middleware.Compression()(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			securityHandler := middleware.SecurityHeaders()(corsHandler)
			securityHandler.ServeHTTP(w, req)
		}))
		compressionHandler.ServeHTTP(w, req)
	})

	// Apply rate limiting if enabled, but skip for WebSocket and SSE endpoints
	if s.config.EnableRateLimit {
		rateLimiter := middleware.NewRateLimiter(s.config.RateLimitPerMin, time.Minute)
		prevHandler := handler // Capture current handler before redefining
		handler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			// Skip rate limiting for WebSocket and SSE endpoints to avoid hijacking interference
			if req.URL.Path == "/ws" || 
			   req.URL.Path == "/buffers" ||
			   req.URL.Path == "/api/events" ||
			   req.URL.Path == "/api/control/stream" ||
			   strings.Contains(req.URL.Path, "/stream") {
				prevHandler.ServeHTTP(w, req)
				return
			}
			// Apply rate limiting for non-streaming routes
			rateLimiter.Middleware(prevHandler).ServeHTTP(w, req)
		})
	}

	// Apply request logging if enabled, but skip for WebSocket and SSE endpoints
	if s.config.EnableRequestLog {
		prevHandler := handler // Capture current handler before redefining
		handler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			// Skip request logging for WebSocket and SSE endpoints to avoid hijacking interference
			if req.URL.Path == "/ws" || 
			   req.URL.Path == "/buffers" ||
			   req.URL.Path == "/api/events" ||
			   req.URL.Path == "/api/control/stream" ||
			   strings.Contains(req.URL.Path, "/stream") {
				prevHandler.ServeHTTP(w, req)
				return
			}
			// Apply request logging for non-streaming routes
			middleware.RequestLogger()(prevHandler).ServeHTTP(w, req)
		})
	}

	// Apply CSRF protection if enabled (for state-changing operations)
	if s.config.EnableCSRF {
		csrf := middleware.NewCSRF(middleware.CSRFConfig{
			Secret:    s.config.CSRFSecret,
			TokenName: "csrf_token",
		})
		handler = csrf.Middleware(handler)
	}

	// Apply IP whitelist if enabled (outermost - first check)
	if s.config.EnableIPWhitelist {
		ipWhitelist := middleware.NewIPWhitelist(s.config.AllowedIPs)
		handler = ipWhitelist.Middleware(handler)
	}

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf("%s:%s", s.config.Host, s.config.Port),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	s.mu.Lock()
	s.mu.Unlock()
}

// Handler returns the HTTP handler for the server
func (s *Server) Handler() http.Handler {
	return s.httpServer.Handler
}

func (s *Server) Start() error {
	// Start event broadcaster
	s.eventBroadcaster.Start()

	// Start buffer aggregator
	go s.bufferAggregator.Start()

	// Start push notification service
	if s.pushService != nil {
		if err := s.pushService.Start(); err != nil {
			log.Printf("Failed to start push service: %v", err)
		}
	}

	// Broadcast server start event
	startEvent := types.NewServerEvent(types.EventConnected).
		WithMessage("TunnelForge Go server started")
	s.broadcastEvent(startEvent)

	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	// Broadcast server shutdown event
	shutdownEvent := types.NewServerEvent(types.EventServerShutdown).
		WithMessage("TunnelForge Go server shutting down")
	s.broadcastEvent(shutdownEvent)

	// Stop buffer aggregator
	s.bufferAggregator.Stop()

	// Stop push notification service
	if s.pushService != nil {
		if err := s.pushService.Stop(); err != nil {
			log.Printf("Failed to stop push service: %v", err)
		}
	}

	// Stop event broadcaster
	s.eventBroadcaster.Stop()

	// Close all sessions
	s.sessionManager.CloseAll()

	// Stop persistence service
	if s.persistenceService != nil {
		s.persistenceService.Stop()
	}

	// Shutdown HTTP server
	return s.httpServer.Shutdown(ctx)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"status":"ok","sessions":%d,"uptime":"%s"}`,
		s.sessionManager.Count(), time.Since(s.startTime).String())
}

// API handlers for Phase 4 implementation
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions := s.sessionManager.List()
	w.Header().Set("Content-Type", "application/json")

	// Convert to response format
	responses := make([]*types.SessionResponse, 0, len(sessions))
	for _, session := range sessions {
		status := "exited"
		if session.Active {
			status = "running"
		}
		responses = append(responses, &types.SessionResponse{
			ID:        session.ID,
			Title:     session.Title,
			Command:   session.Command,
			Cwd:       session.Cwd,
			Cols:      session.Cols,
			Rows:      session.Rows,
			CreatedAt: session.CreatedAt,
			UpdatedAt: session.UpdatedAt,
			Status:    status,
			Active:    session.Active,
			Clients:   len(session.Clients),
		})
	}

	// Return sessions array directly to match frontend expectations
	if err := json.NewEncoder(w).Encode(responses); err != nil {
		log.Printf("Failed to encode sessions response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

func (s *Server) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req types.SessionCreateRequest

	// Parse request body
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Return error for invalid JSON
		s.writeJSONError(w, "Invalid JSON in request body", http.StatusBadRequest)
		return
	}

	// Create session
	session, err := s.sessionManager.Create(&req)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create session: %v", err), http.StatusInternalServerError)
		return
	}

	// Broadcast session start event
	startEvent := types.NewServerEvent(types.EventSessionStart).
		WithSessionID(session.ID).
		WithSessionName(session.Title).
		WithCommand(session.Command)
	s.broadcastEvent(startEvent)

	// Return session response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	status := "exited"
	if session.Active {
		status = "running"
	}
	response := &types.SessionResponse{
		ID:        session.ID,
		Title:     session.Title,
		Command:   session.Command,
		Cwd:       session.Cwd,
		Cols:      session.Cols,
		Rows:      session.Rows,
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
		Status:    status,
		Active:    session.Active,
		Clients:   len(session.Clients),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode session response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// writeJSONError writes a JSON error response
func (s *Server) writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(map[string]string{"error": message}); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}

func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session := s.sessionManager.Get(sessionID)
	if session == nil {
		s.writeJSONError(w, "Session not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	status := "exited"
	if session.Active {
		status = "running"
	}
	response := &types.SessionResponse{
		ID:        session.ID,
		Title:     session.Title,
		Command:   session.Command,
		Cwd:       session.Cwd,
		Cols:      session.Cols,
		Rows:      session.Rows,
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
		Status:    status,
		Active:    session.Active,
		Clients:   len(session.Clients),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode session response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

func (s *Server) handleDeleteSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	// Get session info before closing for event broadcasting
	session := s.sessionManager.Get(sessionID)

	if err := s.sessionManager.Close(sessionID); err != nil {
		log.Printf("Failed to close session %s: %v", sessionID, err)
		s.writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast session exit event
	if session != nil {
		exitEvent := types.NewServerEvent(types.EventSessionExit).
			WithSessionID(session.ID).
			WithSessionName(session.Title).
			WithCommand(session.Command)
		s.broadcastEvent(exitEvent)
	}

	w.WriteHeader(http.StatusOK)
}

// handleServerConfig returns general server configuration
func (s *Server) handleServerConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	config := map[string]interface{}{
		"serverName":   s.config.ServerName,
		"version":      "1.0.0",
		"authRequired": s.config.AuthRequired,
		"features": map[string]bool{
			"auth":       true,
			"filesystem": true,
			"git":        true,
			"websocket":  true,
			"sse":        true, // ✅ SSE events implemented
		},
		"limits": map[string]interface{}{
			"maxSessions":    s.config.MaxSessions,
			"sessionTimeout": s.config.SessionTimeout,
		},
	}

	if err := json.NewEncoder(w).Encode(config); err != nil {
		log.Printf("Failed to encode server config response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// handleServerStatus returns server status (similar to health but with more info)
func (s *Server) handleServerStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	status := map[string]interface{}{
		"status":     "running",
		"healthy":    true,
		"sessions":   s.sessionManager.Count(),
		"uptime":     time.Since(s.startTime).String(),
		"uptimeMs":   time.Since(s.startTime).Milliseconds(),
		"serverName": s.config.ServerName,
		"version":    "1.0.0",
		"timestamp":  time.Now().Unix(),
	}

	if err := json.NewEncoder(w).Encode(status); err != nil {
		log.Printf("Failed to encode server status response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// handleAuthConfig returns authentication configuration for the frontend
func (s *Server) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Frontend expects the Option A format
	authRequired := s.config.AuthRequired
	passwordAuth := true // Supported today
	sshKeyAuth := false  // Not yet implemented

	methods := make([]string, 0, 2)
	if passwordAuth {
		methods = append(methods, "password")
	}
	if sshKeyAuth {
		methods = append(methods, "ssh-key")
	}

	resp := map[string]interface{}{
		"authRequired": authRequired,
		"authMethods":  methods,
		"passwordAuth": passwordAuth,
		"sshKeyAuth":   sshKeyAuth,
	}

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("Failed to encode auth config response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// handleResizeSession resizes a terminal session
func (s *Server) handleResizeSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	var req types.ResizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSONError(w, "Invalid resize request", http.StatusBadRequest)
		return
	}

	// Validate dimensions
	if req.Cols <= 0 || req.Rows <= 0 {
		s.writeJSONError(w, "Invalid terminal dimensions", http.StatusBadRequest)
		return
	}

	if err := s.sessionManager.Resize(sessionID, req.Cols, req.Rows); err != nil {
		log.Printf("Failed to resize session %s: %v", sessionID, err)
		s.writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleSessionInput sends input to a terminal session
func (s *Server) handleSessionInput(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	var req types.InputMessage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSONError(w, "Invalid input request", http.StatusBadRequest)
		return
	}

	if err := s.sessionManager.WriteInput(sessionID, req.Data); err != nil {
		log.Printf("Failed to write input to session %s: %v", sessionID, err)
		s.writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleSessionStream provides Server-Sent Events stream for session output
func (s *Server) handleSessionStream(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session := s.sessionManager.Get(sessionID)
	if session == nil {
		s.writeJSONError(w, "Session not found", http.StatusNotFound)
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		s.writeJSONError(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Create a channel to receive output from the session
	outputChan := make(chan []byte, 100)
	defer close(outputChan)

	// Register this stream with the session manager
	if err := s.sessionManager.AddSSEStream(sessionID, outputChan); err != nil {
		s.writeJSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer s.sessionManager.RemoveSSEStream(sessionID, outputChan)

	// Stream output until client disconnects
	for {
		select {
		case data, ok := <-outputChan:
			if !ok {
				return
			}

			// Send SSE event
			if _, err := fmt.Fprintf(w, "data: %s\n\n", string(data)); err != nil {
				log.Printf("Failed to write SSE data: %v", err)
				return
			}
			flusher.Flush()

		case <-r.Context().Done():
			return
		}
	}
}

// handleLogin handles user authentication and returns JWT token
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var loginReq struct {
		Password string `json:"password"`
		Username string `json:"username,omitempty"` // Optional for future use
	}

	if err := json.NewDecoder(r.Body).Decode(&loginReq); err != nil {
		s.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if loginReq.Password == "" {
		s.writeJSONError(w, "Password is required", http.StatusBadRequest)
		return
	}

	// For now, use a simple password check (should be configurable in production)
	expectedPassword := "tunnelforge-dev-password" // Should come from config
	if loginReq.Password != expectedPassword {
		s.writeJSONError(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Generate JWT token
	username := loginReq.Username
	if username == "" {
		username = "user"
	}

	userClaims := auth.UserClaims{
		UserID:   "user-1",
		Username: username,
		Roles:    []string{"user"},
	}

	token, err := s.jwtAuth.GenerateToken(userClaims, time.Hour*24)
	if err != nil {
		log.Printf("Failed to generate token: %v", err)
		s.writeJSONError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"token":   token,
		"user": map[string]string{
			"id":       "user-1",
			"username": username,
			"role":     "user",
		},
	}); err != nil {
		log.Printf("Failed to encode login response: %v", err)
	}
}

// handlePasswordAuth handles password authentication (alternative endpoint)
func (s *Server) handlePasswordAuth(w http.ResponseWriter, r *http.Request) {
	// If auth is not required, just return success
	if !s.config.AuthRequired {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Authentication not required",
			"token":   "guest-token",
			"user": map[string]string{
				"id":       "guest",
				"username": "guest",
				"role":     "admin",
			},
		}); err != nil {
			log.Printf("Failed to encode password auth response: %v", err)
		}
		return
	}

	// If auth is required, delegate to handleLogin
	s.handleLogin(w, r)
}

// handleCurrentUser returns current authenticated user info
func (s *Server) handleCurrentUser(w http.ResponseWriter, r *http.Request) {
	log.Printf("🔍 handleCurrentUser called - Method: %s, URL: %s", r.Method, r.URL.String())
	log.Printf("🔍 Auth required: %v", s.config.AuthRequired)
	log.Printf("🔍 Request headers: %v", r.Header)

	// Extract user from context (set by JWT middleware)
	userCtx := middleware.GetUserFromContext(r.Context())
	log.Printf("🔍 User context from JWT middleware: %+v", userCtx)

	// If no user context and auth is not required, return the system user
	if userCtx == nil && !s.config.AuthRequired {
		log.Printf("🔍 No user context and auth not required - getting system user")

		// Get current system user
		username := os.Getenv("USER")
		log.Printf("🔍 USER env var: %q", username)
		if username == "" {
			username = os.Getenv("USERNAME")
			log.Printf("🔍 USERNAME env var: %q", username)
		}
		if username == "" {
			username = "unknown"
			log.Printf("🔍 Fallback to 'unknown' username")
		}

		response := map[string]interface{}{
			"success": true,
			"userId":  username, // Frontend expects this field
			"user": map[string]string{
				"id":       username,
				"username": username,
				"role":     "admin", // Grant full access when auth is disabled
			},
		}

		log.Printf("🔍 Sending response: %+v", response)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("❌ Error encoding response: %v", err)
		}
		return
	}

	// If no user context and auth is required, return error
	if userCtx == nil {
		log.Printf("🔍 No user context and auth is required - returning unauthorized")
		s.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	log.Printf("🔍 Using JWT user context")
	response := map[string]interface{}{
		"success": true,
		"userId":  userCtx.Username, // Frontend expects this field
		"user": map[string]string{
			"id":       userCtx.UserID,
			"username": userCtx.Username,
			"role":     userCtx.Role,
		},
	}

	log.Printf("🔍 Sending authenticated response: %+v", response)
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("❌ Error encoding authenticated response: %v", err)
	}
}

// setupEventHooks configures event broadcasting hooks for session lifecycle events
func (s *Server) setupEventHooks() {
	// Set up push notification integration with event broadcasting
	// We'll intercept the broadcast calls and also send push notifications
	log.Println("📡 Event hooks configured with push notification integration")
}

// broadcastEvent broadcasts an event to both SSE and push notification systems
func (s *Server) broadcastEvent(event *types.ServerEvent) {
	// First, broadcast via SSE
	s.eventBroadcaster.Broadcast(event)

	// Then, send push notifications if push service is available
	if s.pushService != nil {
		ctx := context.Background()
		if err := s.pushService.ProcessServerEvent(ctx, event); err != nil {
			log.Printf("Failed to process push notification for event %s: %v", event.Type, err)
		}
	}
}

// handleTestEvent handles test event broadcasting (for development/testing)
func (s *Server) handleTestEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type    string `json:"type"`
		Message string `json:"message"`
		Title   string `json:"title,omitempty"`
		Body    string `json:"body,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeJSONError(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	// Create test event
	var event *types.ServerEvent
	switch req.Type {
	case "test-notification":
		event = types.NewServerEvent(types.EventTestNotification).
			WithMessage(req.Message).
			WithTestNotification(req.Title, req.Body)
	default:
		// Generic test event
		event = types.NewServerEvent(types.EventTestNotification).
			WithMessage(req.Message)
	}

	// Broadcast the event
	s.broadcastEvent(event)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test event broadcasted",
		"clients": s.eventBroadcaster.GetClientCount(),
	}); err != nil {
		log.Printf("Failed to encode test event response: %v", err)
	}
}

// handleRepositoryDiscover handles repository discovery for frontend file browser
func (s *Server) handleRepositoryDiscover(w http.ResponseWriter, r *http.Request) {
	// Get path parameter from query string
	queryPath := r.URL.Query().Get("path")
	if queryPath == "" {
		queryPath = "~"
	}

	// Expand ~ to home directory
	if strings.HasPrefix(queryPath, "~") {
		homeDir := os.Getenv("HOME")
		if homeDir != "" {
			queryPath = strings.Replace(queryPath, "~", homeDir, 1)
		}
	}

	// Resolve the path
	fullPath, err := filepath.Abs(queryPath)
	if err != nil {
		log.Printf("Failed to resolve path %s: %v", queryPath, err)
		s.writeJSONError(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}

	// Check if path exists and is accessible
	if _, err := os.Stat(fullPath); err != nil {
		if os.IsNotExist(err) {
			s.writeJSONError(w, "Path not found", http.StatusNotFound)
		} else {
			s.writeJSONError(w, fmt.Sprintf("Access denied: %v", err), http.StatusForbidden)
		}
		return
	}

	// Read directory contents
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		log.Printf("Failed to read directory %s: %v", fullPath, err)
		s.writeJSONError(w, fmt.Sprintf("Failed to read directory: %v", err), http.StatusInternalServerError)
		return
	}

	var repositories []map[string]interface{}
	var directories []map[string]interface{}

	for _, entry := range entries {
		// Skip hidden files/directories unless specifically requested
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		entryPath := filepath.Join(fullPath, entry.Name())
		relativePath := filepath.Join(queryPath, entry.Name())

		if entry.IsDir() {
			directoryInfo := map[string]interface{}{
				"name": entry.Name(),
				"path": relativePath,
			}
			directories = append(directories, directoryInfo)

			// Check if it's a Git repository
			gitPath := filepath.Join(entryPath, ".git")
			if _, err := os.Stat(gitPath); err == nil {
				repositoryInfo := map[string]interface{}{
					"name":         entry.Name(),
					"path":         relativePath,
					"type":         "directory",
					"isRepository": true,
				}
				repositories = append(repositories, repositoryInfo)
			}
		}
	}

	// Sort by name
	sort.Slice(repositories, func(i, j int) bool {
		return repositories[i]["name"].(string) < repositories[j]["name"].(string)
	})
	sort.Slice(directories, func(i, j int) bool {
		return directories[i]["name"].(string) < directories[j]["name"].(string)
	})

	response := map[string]interface{}{
		"path":         queryPath,
		"fullPath":     fullPath,
		"repositories": repositories,
		"directories":  directories,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode repository discovery response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// handleCleanupExited removes all exited sessions
func (s *Server) handleCleanupExited(w http.ResponseWriter, r *http.Request) {
	sessions := s.sessionManager.List()
	var removedCount int

	for _, session := range sessions {
		// Check if the session's process has exited
		if !session.Active || (session.Cmd != nil && session.Cmd.ProcessState != nil) {
			if err := s.sessionManager.Close(session.ID); err != nil {
				log.Printf("Failed to cleanup exited session %s: %v", session.ID, err)
			} else {
				removedCount++
			}
		}
	}

	response := map[string]interface{}{
		"message": fmt.Sprintf("Cleaned up %d exited sessions", removedCount),
		"count":   removedCount,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode cleanup response: %v", err)
	}
}

// handleResetSessionSize resets terminal size to default dimensions
func (s *Server) handleResetSessionSize(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session := s.sessionManager.Get(sessionID)
	if session == nil {
		s.writeJSONError(w, "Session not found", http.StatusNotFound)
		return
	}

	// Reset to default terminal size (80x24)
	defaultCols, defaultRows := 80, 24

	if err := s.sessionManager.Resize(sessionID, defaultCols, defaultRows); err != nil {
		s.writeJSONError(w, fmt.Sprintf("Failed to reset session size: %v", err), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"message": "Session size reset to default",
		"cols":    defaultCols,
		"rows":    defaultRows,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode reset size response: %v", err)
	}
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

// isLocalhost checks if the IP is a localhost address
func isLocalhost(ip string) bool {
	if ip == "" {
		return false
	}

	// Parse the IP
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return false
	}

	// Check for localhost IPs
	return parsedIP.IsLoopback() || 
		   ip == "127.0.0.1" || 
		   ip == "::1" || 
		   ip == "localhost"
}

// handleControlStream provides a Server-Sent Events stream for control events
func (s *Server) handleControlStream(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		s.writeJSONError(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Send initial connection message
	w.Write([]byte(":ok\n\n"))
	flusher.Flush()

	log.Printf("Control event stream connected")

	// Send periodic heartbeat to keep connection alive
	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	// Keep connection alive until client disconnects
	for {
		select {
		case <-heartbeatTicker.C:
			w.Write([]byte(":heartbeat\n\n"))
			flusher.Flush()
		case <-r.Context().Done():
			log.Printf("Control event stream disconnected")
			return
		}
	}
}
