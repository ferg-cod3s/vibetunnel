package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"

	"github.com/ferg-cod3s/vibetunnel/go-server/internal/middleware"

	"github.com/ferg-cod3s/vibetunnel/go-server/internal/auth"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/buffer"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/config"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/events"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/filesystem"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/git"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/session"
	"github.com/ferg-cod3s/vibetunnel/go-server/internal/websocket"
	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
)

type Config struct {
	Port string
}

type Server struct {
	config         *config.Config
	httpServer     *http.Server
	sessionManager *session.Manager
	wsHandler      *websocket.Handler
	bufferAggregator *buffer.BufferAggregator
	jwtAuth        *auth.JWTAuth
	passwordAuth   *auth.PasswordAuth
	fileSystem     *filesystem.FileSystemService
	gitService     *git.GitService
	eventBroadcaster *events.EventBroadcaster
	startTime      time.Time
	mu             sync.RWMutex
}

func New(cfg *Config) (*Server, error) {
	// Load full configuration
	fullConfig := config.LoadConfig()
	if cfg.Port != "" {
		fullConfig.Port = cfg.Port
	}

	// Create session manager
	sessionManager := session.NewManager()

	// Create WebSocket handler
	wsHandler := websocket.NewHandler(sessionManager)
	wsHandler.SetAllowedOrigins(fullConfig.AllowedOrigins)

	// Create filesystem service with safe base path
	basePath := fullConfig.FileSystemBasePath
	if basePath == "" {
		basePath = "/" // Default to root, but this should be configured securely
	}
	fileSystemService := filesystem.NewFileSystemService(basePath)

	// Create git service with safe base path
	gitBasePath := fullConfig.GitBasePath
	if gitBasePath == "" {
		gitBasePath = "/" // Default to root, but this should be configured securely
	}
	gitService := git.NewGitService(gitBasePath)

	// Initialize authentication services
	jwtAuth := auth.NewJWTAuth("vibetunnel-jwt-secret-change-in-production")
	passwordAuth := auth.NewPasswordAuth()

	// Initialize event broadcaster
	eventBroadcaster := events.NewEventBroadcaster()

	// Initialize buffer aggregator
	bufferAggregator := buffer.NewBufferAggregator()

	s := &Server{
		config:         fullConfig,
		sessionManager: sessionManager,
		wsHandler:      wsHandler,
		bufferAggregator: bufferAggregator,
		fileSystem:     fileSystemService,
		gitService:     gitService,
		jwtAuth:        jwtAuth,
		passwordAuth:   passwordAuth,
		eventBroadcaster: eventBroadcaster,
		startTime:      time.Now(),
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
	
	// Create a simple auth middleware using our auth JWT
	authMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

	// Always protect current-user endpoint (it returns user info)
	protectedAuth := auth.NewRoute().Subrouter()
	protectedAuth.Use(authMiddleware)
	protectedAuth.HandleFunc("/current-user", s.handleCurrentUser).Methods("GET")

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
	sessionRouter.HandleFunc("/sessions/{id}/input", s.handleSessionInput).Methods("POST")
	sessionRouter.HandleFunc("/sessions/{id}/stream", s.handleSessionStream).Methods("GET")

	// Filesystem routes
	s.fileSystem.RegisterRoutes(r)

	// Git routes
	s.gitService.RegisterRoutes(r)

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
	handler = c.Handler(handler)
	
	// Apply compression
	handler = middleware.Compression()(handler)
	
	// Apply security headers
	handler = middleware.SecurityHeaders()(handler)
	
	// Apply rate limiting if enabled
	if s.config.EnableRateLimit {
		rateLimiter := middleware.NewRateLimiter(s.config.RateLimitPerMin, time.Minute)
		handler = rateLimiter.Middleware(handler)
	}
	
	// Apply request logging if enabled
	if s.config.EnableRequestLog {
		handler = middleware.RequestLogger()(handler)
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
	
	// Broadcast server start event
	startEvent := types.NewServerEvent(types.EventConnected).
		WithMessage("VibeTunnel Go server started")
	s.eventBroadcaster.Broadcast(startEvent)
	
	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	// Broadcast server shutdown event
	shutdownEvent := types.NewServerEvent(types.EventServerShutdown).
		WithMessage("VibeTunnel Go server shutting down")
	s.eventBroadcaster.Broadcast(shutdownEvent)
	
	// Stop buffer aggregator
	s.bufferAggregator.Stop()
	
	// Stop event broadcaster
	s.eventBroadcaster.Stop()
	
	// Close all sessions
	s.sessionManager.CloseAll()

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
		responses = append(responses, &types.SessionResponse{
			ID:        session.ID,
			Title:     session.Title,
			Command:   session.Command,
			Cwd:       session.Cwd,
			Cols:      session.Cols,
			Rows:      session.Rows,
			CreatedAt: session.CreatedAt,
			UpdatedAt: session.UpdatedAt,
			Active:    session.Active,
			Clients:   len(session.Clients),
		})
	}

	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"sessions": responses,
		"count":    len(responses),
	}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
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
	s.eventBroadcaster.Broadcast(startEvent)

	// Return session response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	response := &types.SessionResponse{
		ID:        session.ID,
		Title:     session.Title,
		Command:   session.Command,
		Cwd:       session.Cwd,
		Cols:      session.Cols,
		Rows:      session.Rows,
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
		Active:    session.Active,
		Clients:   len(session.Clients),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode session response: %v", err)
	}
}

// writeJSONError writes a JSON error response
func (s *Server) writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
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

	response := &types.SessionResponse{
		ID:        session.ID,
		Title:     session.Title,
		Command:   session.Command,
		Cwd:       session.Cwd,
		Cols:      session.Cols,
		Rows:      session.Rows,
		CreatedAt: session.CreatedAt,
		UpdatedAt: session.UpdatedAt,
		Active:    session.Active,
		Clients:   len(session.Clients),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode session response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
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
		s.eventBroadcaster.Broadcast(exitEvent)
	}

	w.WriteHeader(http.StatusOK)
}

// handleServerConfig returns general server configuration
func (s *Server) handleServerConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	config := map[string]interface{}{
		"serverName":    s.config.ServerName,
		"version":       "1.0.0",
		"authRequired":  s.config.AuthRequired,
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
	}
}

// handleServerStatus returns server status (similar to health but with more info)
func (s *Server) handleServerStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	status := map[string]interface{}{
		"status":       "running",
		"healthy":      true,
		"sessions":     s.sessionManager.Count(),
		"uptime":       time.Since(s.startTime).String(),
		"uptimeMs":     time.Since(s.startTime).Milliseconds(),
		"serverName":   s.config.ServerName,
		"version":      "1.0.0",
		"timestamp":    time.Now().Unix(),
	}

	if err := json.NewEncoder(w).Encode(status); err != nil {
		log.Printf("Failed to encode server status response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

// handleAuthConfig returns authentication configuration for the frontend
func (s *Server) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	config := map[string]interface{}{
		"authRequired": s.config.AuthRequired,
		"authMethods":  []string{"password"}, // Currently only password auth is implemented
		"sshKeyAuth":   false,                // TODO: implement SSH key auth
		"passwordAuth": true,                 // Password auth is implemented
		"serverName":   s.config.ServerName,
		"version":      "1.0.0", // TODO: get from build info
	}

	if err := json.NewEncoder(w).Encode(config); err != nil {
		log.Printf("Failed to encode auth config response: %v", err)
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
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
			fmt.Fprintf(w, "data: %s\n\n", string(data))
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
	expectedPassword := "vibetunnel-dev-password" // Should come from config
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
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"token":   token,
		"user": map[string]string{
			"id":       "user-1",
			"username": username,
			"role":     "user",
		},
	})
}

// handleCurrentUser returns current authenticated user info
func (s *Server) handleCurrentUser(w http.ResponseWriter, r *http.Request) {
	// Extract user from context (set by JWT middleware)
	userCtx := middleware.GetUserFromContext(r.Context())
	if userCtx == nil {
		s.writeJSONError(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"user": map[string]string{
			"id":       userCtx.UserID,
			"username": userCtx.Username,
			"role":     userCtx.Role,
		},
	})
}

// setupEventHooks configures event broadcasting hooks for session lifecycle events
func (s *Server) setupEventHooks() {
	// Note: This is a placeholder for session lifecycle event hooks
	// The session manager would need to be extended to emit events
	// when sessions are created, closed, or when commands finish
	
	// TODO: Modify session manager to emit events that we can hook into here
	// For now, events will be manually triggered in the session handlers
	log.Println("📡 Event hooks configured (manual triggering for now)")
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
	s.eventBroadcaster.Broadcast(event)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test event broadcasted",
		"clients": s.eventBroadcaster.GetClientCount(),
	})
}
