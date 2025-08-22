package tmux

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"

	"github.com/gorilla/mux"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// TmuxSession represents a tmux session
type TmuxSession struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Windows int    `json:"windows"`
	Created string `json:"created"`
	Active  bool   `json:"active"`
}

// TmuxWindow represents a tmux window
type TmuxWindow struct {
	Index  int    `json:"index"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
	Panes  int    `json:"panes"`
}

// TmuxPane represents a tmux pane
type TmuxPane struct {
	Index   int    `json:"index"`
	Title   string `json:"title"`
	Active  bool   `json:"active"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Command string `json:"command"`
	PID     int    `json:"pid"`
}

// AttachRequest represents a request to attach to tmux
type AttachRequest struct {
	SessionName string `json:"sessionName"`
	WindowIndex *int   `json:"windowIndex,omitempty"`
	PaneIndex   *int   `json:"paneIndex,omitempty"`
	Cols        *int   `json:"cols,omitempty"`
	Rows        *int   `json:"rows,omitempty"`
	WorkingDir  string `json:"workingDir,omitempty"`
	TitleMode   string `json:"titleMode,omitempty"`
}

// CreateSessionRequest represents a request to create a tmux session
type CreateSessionRequest struct {
	Name    string `json:"name"`
	Command string `json:"command,omitempty"`
}

// SendCommandRequest represents a request to send command to tmux pane
type SendCommandRequest struct {
	Command     string `json:"command"`
	WindowIndex *int   `json:"windowIndex,omitempty"`
	PaneIndex   *int   `json:"paneIndex,omitempty"`
}

// TmuxService handles tmux operations
type TmuxService struct {
	sessionManager *session.Manager
	mu             sync.RWMutex
}

// NewTmuxService creates a new tmux service
func NewTmuxService(sessionManager *session.Manager) *TmuxService {
	return &TmuxService{
		sessionManager: sessionManager,
	}
}

// RegisterRoutes registers tmux-related routes
func (ts *TmuxService) RegisterRoutes(router *mux.Router) {
	tmuxRouter := router.PathPrefix("/api/tmux").Subrouter()

	// Availability check
	tmuxRouter.HandleFunc("/available", ts.handleAvailable).Methods("GET")

	// Session management
	tmuxRouter.HandleFunc("/sessions", ts.handleListSessions).Methods("GET")
	tmuxRouter.HandleFunc("/sessions", ts.handleCreateSession).Methods("POST")
	tmuxRouter.HandleFunc("/sessions/{sessionName}/windows", ts.handleListWindows).Methods("GET")
	tmuxRouter.HandleFunc("/sessions/{sessionName}/panes", ts.handleListPanes).Methods("GET")
	tmuxRouter.HandleFunc("/sessions/{sessionName}/send", ts.handleSendCommand).Methods("POST")
	tmuxRouter.HandleFunc("/sessions/{sessionName}", ts.handleKillSession).Methods("DELETE")

	// Attach to tmux
	tmuxRouter.HandleFunc("/attach", ts.handleAttach).Methods("POST")
}

// IsAvailable checks if tmux is available on the system
func (ts *TmuxService) IsAvailable() bool {
	_, err := exec.LookPath("tmux")
	return err == nil
}

// handleAvailable handles the availability check endpoint
func (ts *TmuxService) handleAvailable(w http.ResponseWriter, r *http.Request) {
	available := ts.IsAvailable()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"available": available})
}

// ListSessions lists all tmux sessions
func (ts *TmuxService) ListSessions() ([]TmuxSession, error) {
	if !ts.IsAvailable() {
		return nil, fmt.Errorf("tmux is not available")
	}

	cmd := exec.Command("tmux", "list-sessions", "-F", "#{session_id}|#{session_name}|#{session_windows}|#{session_created}|#{session_attached}")
	output, err := cmd.Output()
	if err != nil {
		// If no sessions exist, tmux returns exit code 1
		if exitError, ok := err.(*exec.ExitError); ok && exitError.ExitCode() == 1 {
			return []TmuxSession{}, nil
		}
		return nil, fmt.Errorf("failed to list tmux sessions: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	sessions := make([]TmuxSession, 0, len(lines))

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 5 {
			continue
		}

		windows, _ := strconv.Atoi(parts[2])
		active := parts[4] == "1"

		sessions = append(sessions, TmuxSession{
			ID:      parts[0],
			Name:    parts[1],
			Windows: windows,
			Created: parts[3],
			Active:  active,
		})
	}

	return sessions, nil
}

// handleListSessions handles the list sessions endpoint
func (ts *TmuxService) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := ts.ListSessions()
	if err != nil {
		log.Printf("Failed to list tmux sessions: %v", err)
		http.Error(w, "Failed to list tmux sessions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]TmuxSession{"sessions": sessions})
}

// ListWindows lists windows in a tmux session
func (ts *TmuxService) ListWindows(sessionName string) ([]TmuxWindow, error) {
	if !ts.IsAvailable() {
		return nil, fmt.Errorf("tmux is not available")
	}

	cmd := exec.Command("tmux", "list-windows", "-t", sessionName, "-F", "#{window_index}|#{window_name}|#{window_active}|#{window_panes}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list tmux windows: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	windows := make([]TmuxWindow, 0, len(lines))

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 4 {
			continue
		}

		index, _ := strconv.Atoi(parts[0])
		active := parts[2] == "1"
		panes, _ := strconv.Atoi(parts[3])

		windows = append(windows, TmuxWindow{
			Index:  index,
			Name:   parts[1],
			Active: active,
			Panes:  panes,
		})
	}

	return windows, nil
}

// handleListWindows handles the list windows endpoint
func (ts *TmuxService) handleListWindows(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionName := vars["sessionName"]

	windows, err := ts.ListWindows(sessionName)
	if err != nil {
		log.Printf("Failed to list tmux windows: %v", err)
		http.Error(w, "Failed to list tmux windows", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]TmuxWindow{"windows": windows})
}

// ListPanes lists panes in a tmux session or window
func (ts *TmuxService) ListPanes(sessionName string, windowIndex *int) ([]TmuxPane, error) {
	if !ts.IsAvailable() {
		return nil, fmt.Errorf("tmux is not available")
	}

	target := sessionName
	if windowIndex != nil {
		target = fmt.Sprintf("%s:%d", sessionName, *windowIndex)
	}

	cmd := exec.Command("tmux", "list-panes", "-t", target, "-F", "#{pane_index}|#{pane_title}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_current_command}|#{pane_pid}")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to list tmux panes: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	panes := make([]TmuxPane, 0, len(lines))

	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) < 7 {
			continue
		}

		index, _ := strconv.Atoi(parts[0])
		active := parts[2] == "1"
		width, _ := strconv.Atoi(parts[3])
		height, _ := strconv.Atoi(parts[4])
		pid, _ := strconv.Atoi(parts[6])

		panes = append(panes, TmuxPane{
			Index:   index,
			Title:   parts[1],
			Active:  active,
			Width:   width,
			Height:  height,
			Command: parts[5],
			PID:     pid,
		})
	}

	return panes, nil
}

// handleListPanes handles the list panes endpoint
func (ts *TmuxService) handleListPanes(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionName := vars["sessionName"]

	var windowIndex *int
	if windowStr := r.URL.Query().Get("window"); windowStr != "" {
		if idx, err := strconv.Atoi(windowStr); err == nil {
			windowIndex = &idx
		}
	}

	panes, err := ts.ListPanes(sessionName, windowIndex)
	if err != nil {
		log.Printf("Failed to list tmux panes: %v", err)
		http.Error(w, "Failed to list tmux panes", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]TmuxPane{"panes": panes})
}

// CreateSession creates a new tmux session
func (ts *TmuxService) CreateSession(name, command string) error {
	if !ts.IsAvailable() {
		return fmt.Errorf("tmux is not available")
	}

	args := []string{"new-session", "-d", "-s", name}
	if command != "" {
		args = append(args, command)
	}

	cmd := exec.Command("tmux", args...)
	return cmd.Run()
}

// handleCreateSession handles the create session endpoint
func (ts *TmuxService) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Session name is required", http.StatusBadRequest)
		return
	}

	if err := ts.CreateSession(req.Name, req.Command); err != nil {
		log.Printf("Failed to create tmux session: %v", err)
		http.Error(w, "Failed to create tmux session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"name":    req.Name,
	})
}

// AttachToTmux attaches to a tmux session and returns a TunnelForge session ID
func (ts *TmuxService) AttachToTmux(sessionName string, windowIndex, paneIndex *int, options *types.SessionCreateRequest) (string, error) {
	if !ts.IsAvailable() {
		return "", fmt.Errorf("tmux is not available")
	}

	// Build tmux attach command
	target := sessionName
	if windowIndex != nil && paneIndex != nil {
		target = fmt.Sprintf("%s:%d.%d", sessionName, *windowIndex, *paneIndex)
	} else if windowIndex != nil {
		target = fmt.Sprintf("%s:%d", sessionName, *windowIndex)
	}

	// Create terminal session that attaches to tmux
	createOptions := &types.SessionCreateRequest{
		Command: "tmux attach-session -t " + target,
		Cwd:     "/",
	}

	if options != nil {
		if options.Cols != 0 {
			createOptions.Cols = options.Cols
		}
		if options.Rows != 0 {
			createOptions.Rows = options.Rows
		}
		if options.Cwd != "" {
			createOptions.Cwd = options.Cwd
		}
		if options.Title != "" {
			createOptions.Title = options.Title
		}
	}

	// Create the session
	session, err := ts.sessionManager.Create(createOptions)
	if err != nil {
		return "", fmt.Errorf("failed to create tmux attachment session: %w", err)
	}

	return session.ID, nil
}

// handleAttach handles the attach endpoint
func (ts *TmuxService) handleAttach(w http.ResponseWriter, r *http.Request) {
	var req AttachRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.SessionName == "" {
		http.Error(w, "Session name is required", http.StatusBadRequest)
		return
	}

	options := &types.SessionCreateRequest{}
	if req.Cols != nil {
		options.Cols = *req.Cols
	}
	if req.Rows != nil {
		options.Rows = *req.Rows
	}
	if req.WorkingDir != "" {
		options.Cwd = req.WorkingDir
	}
	if req.TitleMode != "" {
		options.Title = req.TitleMode // Using title field for title mode
	}

	sessionID, err := ts.AttachToTmux(req.SessionName, req.WindowIndex, req.PaneIndex, options)
	if err != nil {
		log.Printf("Failed to attach to tmux session: %v", err)
		http.Error(w, "Failed to attach to tmux session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"sessionId": sessionID,
		"target": map[string]interface{}{
			"session": req.SessionName,
			"window":  req.WindowIndex,
			"pane":    req.PaneIndex,
		},
	})
}

// SendToPane sends a command to a tmux pane
func (ts *TmuxService) SendToPane(sessionName, command string, windowIndex, paneIndex *int) error {
	if !ts.IsAvailable() {
		return fmt.Errorf("tmux is not available")
	}

	target := sessionName
	if windowIndex != nil && paneIndex != nil {
		target = fmt.Sprintf("%s:%d.%d", sessionName, *windowIndex, *paneIndex)
	} else if windowIndex != nil {
		target = fmt.Sprintf("%s:%d", sessionName, *windowIndex)
	}

	cmd := exec.Command("tmux", "send-keys", "-t", target, command, "Enter")
	return cmd.Run()
}

// handleSendCommand handles the send command endpoint
func (ts *TmuxService) handleSendCommand(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionName := vars["sessionName"]

	var req SendCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Command == "" {
		http.Error(w, "Command is required", http.StatusBadRequest)
		return
	}

	if err := ts.SendToPane(sessionName, req.Command, req.WindowIndex, req.PaneIndex); err != nil {
		log.Printf("Failed to send command to tmux pane: %v", err)
		http.Error(w, "Failed to send command to tmux pane", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// KillSession kills a tmux session
func (ts *TmuxService) KillSession(sessionName string) error {
	if !ts.IsAvailable() {
		return fmt.Errorf("tmux is not available")
	}

	cmd := exec.Command("tmux", "kill-session", "-t", sessionName)
	return cmd.Run()
}

// handleKillSession handles the kill session endpoint
func (ts *TmuxService) handleKillSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionName := vars["sessionName"]

	if err := ts.KillSession(sessionName); err != nil {
		log.Printf("Failed to kill tmux session: %v", err)
		http.Error(w, "Failed to kill tmux session", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
