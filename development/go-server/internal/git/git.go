package git

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/ferg-cod3s/vibetunnel/go-server/pkg/types"
	"github.com/gorilla/mux"
)

// EventBroadcaster interface for broadcasting events
type EventBroadcaster interface {
	Broadcast(event *types.ServerEvent)
}

// RepositoryStatus represents the current state of a Git repository
type RepositoryStatus struct {
	RepoPath       string    `json:"repoPath"`
	CurrentBranch  string    `json:"currentBranch"`
	IsClean        bool      `json:"isClean"`
	StagedFiles    []string  `json:"stagedFiles"`
	UnstagedFiles  []string  `json:"unstagedFiles"`
	UntrackedFiles []string  `json:"untrackedFiles"`
	LastCommit     string    `json:"lastCommit,omitempty"`
	LastCommitTime time.Time `json:"lastCommitTime,omitempty"`
}

// Branch represents a Git branch
type Branch struct {
	Name       string `json:"name"`
	IsCurrent  bool   `json:"isCurrent"`
	LastCommit string `json:"lastCommit,omitempty"`
}

// Repository represents a discovered Git repository
type Repository struct {
	Path        string    `json:"path"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	LastUpdate  time.Time `json:"lastUpdate"`
}

// BranchListResponse represents the response for listing branches
type BranchListResponse struct {
	Branches []Branch `json:"branches"`
	Count    int      `json:"count"`
}

// GitService provides secure Git operations
type GitService struct {
	basePath         string           // Base path for security restrictions
	followMode       *FollowMode      // Git follow mode manager
	eventBroadcaster EventBroadcaster // Interface for broadcasting events
}

// NewGitService creates a new Git service with security restrictions
func NewGitService(basePath string, eventBroadcaster EventBroadcaster) *GitService {
	service := &GitService{
		basePath:         basePath,
		eventBroadcaster: eventBroadcaster,
	}
	service.followMode = NewFollowMode(service)
	return service
}

// validatePath ensures the path is safe and within allowed bounds
func (g *GitService) validatePath(requestedPath string) (string, error) {
	if requestedPath == "" {
		return "", fmt.Errorf("empty path")
	}

	// Clean path to prevent traversal
	cleanPath := filepath.Clean(requestedPath)

	// Convert to absolute path
	var absPath string
	var err error

	if filepath.IsAbs(cleanPath) {
		absPath = cleanPath
	} else {
		absPath = filepath.Join(g.basePath, cleanPath)
	}

	absPath, err = filepath.Abs(absPath)
	if err != nil {
		return "", fmt.Errorf("invalid path: %v", err)
	}

	// Ensure path is within base path bounds
	absBasePath, err := filepath.Abs(g.basePath)
	if err != nil {
		return "", fmt.Errorf("invalid base path")
	}

	if !strings.HasPrefix(absPath, absBasePath) {
		return "", fmt.Errorf("access denied: path outside allowed directory")
	}

	return absPath, nil
}

// validateBranchName validates Git branch names to prevent command injection
func (g *GitService) validateBranchName(branchName string) error {
	if branchName == "" {
		return fmt.Errorf("empty branch name")
	}

	// Trim whitespace
	branchName = strings.TrimSpace(branchName)
	if branchName == "" {
		return fmt.Errorf("invalid branch name: whitespace only")
	}

	// Check length (Git has practical limits)
	if len(branchName) > 255 {
		return fmt.Errorf("branch name too long (max 255 characters)")
	}

	// Validate characters - only allow safe characters for branch names
	// Allow: alphanumeric, hyphens, underscores, forward slashes, dots
	validBranchName := regexp.MustCompile(`^[a-zA-Z0-9._/-]+$`)
	if !validBranchName.MatchString(branchName) {
		return fmt.Errorf("invalid branch name: contains unsafe characters")
	}

	// Prevent command injection characters
	dangerousChars := []string{";", "&", "|", "`", "$", "(", ")", "<", ">", "\\", "\"", "'", " "}
	for _, char := range dangerousChars {
		if strings.Contains(branchName, char) {
			return fmt.Errorf("invalid branch name: contains dangerous character '%s'", char)
		}
	}

	// Git-specific validations
	if strings.HasPrefix(branchName, "-") {
		return fmt.Errorf("invalid branch name: cannot start with dash")
	}

	if strings.Contains(branchName, "..") {
		return fmt.Errorf("invalid branch name: cannot contain '..'")
	}

	return nil
}

// runGitCommand safely executes git commands with input validation
func (g *GitService) runGitCommand(repoPath string, args ...string) ([]byte, error) {
	// Validate repository path
	validatedPath, err := g.validatePath(repoPath)
	if err != nil {
		return nil, fmt.Errorf("invalid repository path: %v", err)
	}

	// Validate arguments - prevent command injection
	for _, arg := range args {
		if strings.Contains(arg, ";") || strings.Contains(arg, "&") ||
			strings.Contains(arg, "|") || strings.Contains(arg, "`") {
			return nil, fmt.Errorf("invalid git command argument: %s", arg)
		}
	}

	// Construct command
	cmd := exec.Command("git", args...)
	cmd.Dir = validatedPath

	// Set secure environment
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"HOME=" + os.Getenv("HOME"),
		"GIT_TERMINAL_PROMPT=0", // Disable interactive prompts
	}

	// Execute command
	output, err := cmd.CombinedOutput()
	if err != nil {
		return output, fmt.Errorf("git command failed: %v (output: %s)", err, string(output))
	}

	return output, nil
}

// GetRepositoryStatus returns the current status of a Git repository
func (g *GitService) GetRepositoryStatus(repoPath string) (*RepositoryStatus, error) {
	validatedPath, err := g.validatePath(repoPath)
	if err != nil {
		return nil, err
	}

	// Check if it's a git repository
	if _, err := os.Stat(filepath.Join(validatedPath, ".git")); os.IsNotExist(err) {
		return nil, fmt.Errorf("not a git repository: %s", validatedPath)
	}

	status := &RepositoryStatus{
		RepoPath: validatedPath,
	}

	// Get current branch
	output, err := g.runGitCommand(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("failed to get current branch: %v", err)
	}
	status.CurrentBranch = strings.TrimSpace(string(output))

	// Get status information
	output, err = g.runGitCommand(repoPath, "status", "--porcelain")
	if err != nil {
		return nil, fmt.Errorf("failed to get repository status: %v", err)
	}

	statusLines := strings.Split(strings.TrimSpace(string(output)), "\n")
	status.IsClean = len(statusLines) == 1 && statusLines[0] == ""

	if !status.IsClean {
		for _, line := range statusLines {
			if line == "" {
				continue
			}

			if len(line) < 3 {
				continue
			}

			statusCode := line[:2]
			fileName := line[3:]

			switch statusCode[0] {
			case 'A', 'M', 'D', 'R', 'C':
				status.StagedFiles = append(status.StagedFiles, fileName)
			}

			switch statusCode[1] {
			case 'M', 'D':
				status.UnstagedFiles = append(status.UnstagedFiles, fileName)
			}

			if statusCode == "??" {
				status.UntrackedFiles = append(status.UntrackedFiles, fileName)
			}
		}
	}

	// Get last commit info
	output, err = g.runGitCommand(repoPath, "log", "-1", "--pretty=format:%H|%s|%ct")
	if err == nil {
		parts := strings.Split(strings.TrimSpace(string(output)), "|")
		if len(parts) >= 3 {
			status.LastCommit = parts[0]
			// Parse timestamp
			if timestamp := parts[2]; timestamp != "" {
				if t, err := time.Parse("1136214245", timestamp); err == nil {
					status.LastCommitTime = t
				}
			}
		}
	}

	return status, nil
}

// ListBranches returns all branches in the repository
func (g *GitService) ListBranches() ([]Branch, error) {
	// Get all branches
	output, err := g.runGitCommand(".", "branch", "-a")
	if err != nil {
		return nil, fmt.Errorf("failed to list branches: %v", err)
	}

	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	var branches []Branch

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		branch := Branch{}

		// Check if current branch (marked with *)
		if strings.HasPrefix(line, "* ") {
			branch.IsCurrent = true
			branch.Name = strings.TrimSpace(line[2:])
		} else {
			branch.IsCurrent = false
			branch.Name = strings.TrimSpace(line)
		}

		// Skip remote tracking branches for simplicity
		if strings.HasPrefix(branch.Name, "remotes/") {
			continue
		}

		branches = append(branches, branch)
	}

	return branches, nil
}

// CheckoutBranch switches to the specified branch
func (g *GitService) CheckoutBranch(branchName string) error {
	if err := g.validateBranchName(branchName); err != nil {
		return err
	}

	_, err := g.runGitCommand(".", "checkout", branchName)
	if err != nil {
		return fmt.Errorf("failed to checkout branch '%s': %v", branchName, err)
	}

	return nil
}

// CreateBranch creates a new branch
func (g *GitService) CreateBranch(branchName string) error {
	if err := g.validateBranchName(branchName); err != nil {
		return err
	}

	_, err := g.runGitCommand(".", "checkout", "-b", branchName)
	if err != nil {
		return fmt.Errorf("failed to create branch '%s': %v", branchName, err)
	}

	return nil
}

// DiscoverRepositories finds Git repositories within the allowed path
func (g *GitService) DiscoverRepositories(searchPath string) ([]Repository, error) {
	validatedPath, err := g.validatePath(searchPath)
	if err != nil {
		return nil, err
	}

	var repositories []Repository

	err = filepath.Walk(validatedPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // Skip inaccessible paths
		}

		// Check if this directory contains .git
		if info.IsDir() && info.Name() == ".git" {
			repoPath := filepath.Dir(path)

			// Ensure repo is within bounds
			if _, err := g.validatePath(repoPath); err != nil {
				return nil // Skip repositories outside allowed path
			}

			repo := Repository{
				Path:       repoPath,
				Name:       filepath.Base(repoPath),
				LastUpdate: info.ModTime(),
			}

			repositories = append(repositories, repo)
			return filepath.SkipDir // Don't traverse into .git directory
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to discover repositories: %v", err)
	}

	return repositories, nil
}

// API Handlers

// handleGetStatus handles GET /api/git/status
func (g *GitService) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("path")
	if repoPath == "" {
		repoPath = "."
	}

	status, err := g.GetRepositoryStatus(repoPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get repository status: %v", err), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleListBranches handles GET /api/git/branches
func (g *GitService) handleListBranches(w http.ResponseWriter, r *http.Request) {
	branches, err := g.ListBranches()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list branches: %v", err), http.StatusBadRequest)
		return
	}

	response := BranchListResponse{
		Branches: branches,
		Count:    len(branches),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleCheckoutBranch handles POST /api/git/checkout
func (g *GitService) handleCheckoutBranch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Branch string `json:"branch"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if err := g.CheckoutBranch(req.Branch); err != nil {
		http.Error(w, fmt.Sprintf("Failed to checkout branch: %v", err), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// handleDiscoverRepositories handles GET /api/repositories
func (g *GitService) handleDiscoverRepositories(w http.ResponseWriter, r *http.Request) {
	searchPath := r.URL.Query().Get("path")
	if searchPath == "" {
		searchPath = "."
	}

	repositories, err := g.DiscoverRepositories(searchPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to discover repositories: %v", err), http.StatusBadRequest)
		return
	}

	response := map[string]interface{}{
		"repositories": repositories,
		"count":        len(repositories),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// RegisterRoutes registers Git API routes
func (g *GitService) RegisterRoutes(router *mux.Router) {
	// Git API routes
	gitRouter := router.PathPrefix("/api/git").Subrouter()

	gitRouter.HandleFunc("/status", g.handleGetStatus).Methods("GET")
	gitRouter.HandleFunc("/branches", g.handleListBranches).Methods("GET")
	gitRouter.HandleFunc("/checkout", g.handleCheckoutBranch).Methods("POST")
	gitRouter.HandleFunc("/event", g.handleGitEvent).Methods("POST")
	gitRouter.HandleFunc("/follow", g.handleGetFollowStatus).Methods("GET")

	// Worktree API routes
	worktreeRouter := router.PathPrefix("/api/worktrees").Subrouter()
	worktreeRouter.HandleFunc("", g.handleListWorktrees).Methods("GET")
	worktreeRouter.HandleFunc("/follow", g.handleFollowMode).Methods("POST")

	// Repository discovery
	router.HandleFunc("/api/repositories", g.handleDiscoverRepositories).Methods("GET")
}

// isGitRepository checks if the given path is a Git repository
func (g *GitService) isGitRepository(path string) bool {
	gitDir := filepath.Join(path, ".git")
	if stat, err := os.Stat(gitDir); err == nil {
		return stat.IsDir()
	}
	return false
}

// handleListWorktrees lists all worktrees for a repository
func (g *GitService) handleListWorktrees(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("path")
	if repoPath == "" {
		http.Error(w, "Missing path parameter", http.StatusBadRequest)
		return
	}

	// Validate and resolve path
	validatedPath, err := g.validatePath(repoPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}

	// Get worktrees
	worktrees, err := g.followMode.getWorktrees(validatedPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get worktrees: %v", err), http.StatusInternalServerError)
		return
	}

	// Get follow status
	followStatus, err := g.followMode.GetFollowStatus(validatedPath)
	if err != nil {
		followStatus = &FollowStatus{Enabled: false}
	}

	response := map[string]interface{}{
		"worktrees":    worktrees,
		"followStatus": followStatus,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleFollowMode enables/disables follow mode
func (g *GitService) handleFollowMode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RepoPath string `json:"repoPath"`
		Branch   string `json:"branch,omitempty"`
		Enable   bool   `json:"enable"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if req.RepoPath == "" {
		http.Error(w, "Missing repoPath", http.StatusBadRequest)
		return
	}

	// Validate and resolve path
	validatedPath, err := g.validatePath(req.RepoPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}

	if req.Enable {
		if req.Branch == "" {
			http.Error(w, "Missing branch for follow mode", http.StatusBadRequest)
			return
		}

		err = g.followMode.EnableFollowMode(validatedPath, req.Branch)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to enable follow mode: %v", err), http.StatusInternalServerError)
			return
		}

		// Broadcast follow enabled event
		if g.eventBroadcaster != nil {
			event := types.NewServerEvent(types.EventGitFollowEnabled).
				WithMessage(fmt.Sprintf("Git follow mode enabled for branch %s", req.Branch))
			event.Branch = &req.Branch
			event.RepoPath = &validatedPath
			g.eventBroadcaster.Broadcast(event)
		}
	} else {
		err = g.followMode.DisableFollowMode(validatedPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to disable follow mode: %v", err), http.StatusInternalServerError)
			return
		}

		// Broadcast follow disabled event
		if g.eventBroadcaster != nil {
			event := types.NewServerEvent(types.EventGitFollowDisabled).
				WithMessage("Git follow mode disabled")
			event.RepoPath = &validatedPath
			g.eventBroadcaster.Broadcast(event)
		}
	}

	// Return updated status
	status, err := g.followMode.GetFollowStatus(validatedPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get follow status: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleGetFollowStatus gets the current follow mode status
func (g *GitService) handleGetFollowStatus(w http.ResponseWriter, r *http.Request) {
	repoPath := r.URL.Query().Get("path")
	if repoPath == "" {
		http.Error(w, "Missing path parameter", http.StatusBadRequest)
		return
	}

	// Validate and resolve path
	validatedPath, err := g.validatePath(repoPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}

	// Get follow status
	status, err := g.followMode.GetFollowStatus(validatedPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get follow status: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// handleGitEvent processes Git events from hooks
func (g *GitService) handleGitEvent(w http.ResponseWriter, r *http.Request) {
	var event struct {
		Type     string `json:"type"`
		Branch   string `json:"branch,omitempty"`
		RepoPath string `json:"repoPath"`
	}

	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if event.Type == "" || event.RepoPath == "" {
		http.Error(w, "Missing required fields: type and repoPath", http.StatusBadRequest)
		return
	}

	// Validate and resolve path
	validatedPath, err := g.validatePath(event.RepoPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}

	// Create GitEvent and process it
	gitEvent := &types.GitEvent{
		Type:      event.Type,
		Branch:    event.Branch,
		RepoPath:  validatedPath,
		Timestamp: time.Now(),
	}

	err = g.followMode.ProcessGitEvent(gitEvent)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to process git event: %v", err), http.StatusInternalServerError)
		return
	}

	// Broadcast Git event via SSE
	if g.eventBroadcaster != nil {
		var serverEvent *types.ServerEvent
		switch gitEvent.Type {
		case "post-checkout":
			serverEvent = types.NewServerEvent(types.EventGitBranchSwitch).
				WithMessage(fmt.Sprintf("Branch switched to %s", gitEvent.Branch))
		case "post-commit":
			serverEvent = types.NewServerEvent(types.EventGitWorktreeSync).
				WithMessage(fmt.Sprintf("New commit on branch %s", gitEvent.Branch))
		default:
			serverEvent = types.NewServerEvent(types.EventGitWorktreeSync).
				WithMessage(fmt.Sprintf("Git event: %s", gitEvent.Type))
		}

		serverEvent.Branch = &gitEvent.Branch
		serverEvent.RepoPath = &gitEvent.RepoPath
		g.eventBroadcaster.Broadcast(serverEvent)
	}

	response := map[string]string{
		"status":  "success",
		"message": "Git event processed",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
