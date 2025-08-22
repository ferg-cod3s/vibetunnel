package git

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

// FollowMode manages Git repository follow mode functionality
type FollowMode struct {
	gitService *GitService
}

// FollowStatus represents the current follow mode status
type FollowStatus struct {
	Enabled        bool   `json:"enabled"`
	Branch         string `json:"branch,omitempty"`
	WorktreePath   string `json:"worktreePath,omitempty"`
	HooksInstalled bool   `json:"hooksInstalled"`
	CanEnable      bool   `json:"canEnable"`
	DisabledReason string `json:"disabledReason,omitempty"`
}

// Worktree represents a Git worktree
type Worktree struct {
	Path                  string `json:"path"`
	Branch                string `json:"branch"`
	HEAD                  string `json:"head"`
	Detached              bool   `json:"detached"`
	CommitsAhead          int    `json:"commitsAhead,omitempty"`
	HasUncommittedChanges bool   `json:"hasUncommittedChanges,omitempty"`
}

// NewFollowMode creates a new follow mode manager
func NewFollowMode(gitService *GitService) *FollowMode {
	return &FollowMode{
		gitService: gitService,
	}
}

// GetFollowStatus returns the current follow mode status for a repository
func (fm *FollowMode) GetFollowStatus(repoPath string) (*FollowStatus, error) {
	status := &FollowStatus{}

	// Validate that this is a git repository
	if !fm.gitService.isGitRepository(repoPath) {
		return status, fmt.Errorf("not a git repository: %s", repoPath)
	}

	// Check if follow mode is enabled
	followWorktreePath, err := fm.getFollowWorktreePath(repoPath)
	if err == nil && followWorktreePath != "" {
		status.Enabled = true
		status.WorktreePath = followWorktreePath

		// Get the branch for this worktree
		branch, err := fm.getWorktreeBranch(followWorktreePath)
		if err == nil {
			status.Branch = branch
		}

		// Check if hooks are installed
		status.HooksInstalled, _ = fm.areHooksInstalled(repoPath)
	} else {
		status.Enabled = false
	}

	// Check if follow mode can be enabled (has worktrees)
	worktrees, err := fm.getWorktrees(repoPath)
	if err == nil && len(worktrees) > 1 { // More than just main worktree
		status.CanEnable = true
	} else {
		status.CanEnable = false
		status.DisabledReason = "No worktrees available to follow"
	}

	return status, nil
}

// EnableFollowMode enables follow mode for a specific branch/worktree
func (fm *FollowMode) EnableFollowMode(repoPath, branch string) error {
	// Validate repository
	if !fm.gitService.isGitRepository(repoPath) {
		return fmt.Errorf("not a git repository: %s", repoPath)
	}

	// Find the worktree for this branch
	worktrees, err := fm.getWorktrees(repoPath)
	if err != nil {
		return fmt.Errorf("failed to get worktrees: %w", err)
	}

	var targetWorktree *Worktree
	for _, wt := range worktrees {
		cleanBranch := strings.TrimPrefix(wt.Branch, "refs/heads/")
		if cleanBranch == branch {
			targetWorktree = &wt
			break
		}
	}

	if targetWorktree == nil {
		return fmt.Errorf("no worktree found for branch: %s", branch)
	}

	// Set the follow worktree configuration
	err = fm.setFollowWorktreePath(repoPath, targetWorktree.Path)
	if err != nil {
		return fmt.Errorf("failed to set follow configuration: %w", err)
	}

	// Install Git hooks
	err = fm.installGitHooks(repoPath)
	if err != nil {
		return fmt.Errorf("failed to install Git hooks: %w", err)
	}

	// Switch main repository to the followed branch immediately
	err = fm.switchToBranch(repoPath, branch)
	if err != nil {
		// Log warning but don't fail - follow mode is still enabled
		fmt.Printf("Warning: failed to switch to branch %s: %v\n", branch, err)
	}

	return nil
}

// DisableFollowMode disables follow mode and cleans up hooks
func (fm *FollowMode) DisableFollowMode(repoPath string) error {
	// Validate repository
	if !fm.gitService.isGitRepository(repoPath) {
		return fmt.Errorf("not a git repository: %s", repoPath)
	}

	// Unset the follow worktree configuration
	err := fm.unsetFollowWorktreePath(repoPath)
	if err != nil {
		return fmt.Errorf("failed to unset follow configuration: %w", err)
	}

	// Uninstall Git hooks
	err = fm.uninstallGitHooks(repoPath)
	if err != nil {
		return fmt.Errorf("failed to uninstall Git hooks: %w", err)
	}

	return nil
}

// ProcessGitEvent processes a Git event and performs necessary synchronization
func (fm *FollowMode) ProcessGitEvent(event *types.GitEvent) error {
	// Validate the event
	if event.RepoPath == "" {
		return fmt.Errorf("invalid git event: missing repo path")
	}

	// Check if follow mode is enabled for this repository
	status, err := fm.GetFollowStatus(event.RepoPath)
	if err != nil {
		return fmt.Errorf("failed to get follow status: %w", err)
	}

	if !status.Enabled {
		// Follow mode not enabled, nothing to do
		return nil
	}

	// Process different event types
	switch event.Type {
	case "post-checkout", "post-commit":
		// Handle branch changes and commits
		return fm.handleBranchChange(event.RepoPath, status.WorktreePath, status.Branch)
	case "post-merge":
		// Handle merge events
		return fm.handleMergeEvent(event.RepoPath, status.WorktreePath)
	default:
		// Unknown event type, log and continue
		fmt.Printf("Unknown git event type: %s\n", event.Type)
		return nil
	}
}

// getFollowWorktreePath gets the followed worktree path from git config
func (fm *FollowMode) getFollowWorktreePath(repoPath string) (string, error) {
	cmd := exec.Command("git", "config", "vibetunnel.followWorktree")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// setFollowWorktreePath sets the followed worktree path in git config
func (fm *FollowMode) setFollowWorktreePath(repoPath, worktreePath string) error {
	cmd := exec.Command("git", "config", "--local", "vibetunnel.followWorktree", worktreePath)
	cmd.Dir = repoPath
	return cmd.Run()
}

// unsetFollowWorktreePath removes the followed worktree path from git config
func (fm *FollowMode) unsetFollowWorktreePath(repoPath string) error {
	cmd := exec.Command("git", "config", "--local", "--unset", "vibetunnel.followWorktree")
	cmd.Dir = repoPath
	return cmd.Run()
}

// getWorktreeBranch gets the current branch for a worktree
func (fm *FollowMode) getWorktreeBranch(worktreePath string) (string, error) {
	cmd := exec.Command("git", "branch", "--show-current")
	cmd.Dir = worktreePath
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// getWorktrees gets all worktrees for a repository
func (fm *FollowMode) getWorktrees(repoPath string) ([]Worktree, error) {
	cmd := exec.Command("git", "worktree", "list", "--porcelain")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	return fm.parseWorktreePorcelain(string(output)), nil
}

// parseWorktreePorcelain parses the output of `git worktree list --porcelain`
func (fm *FollowMode) parseWorktreePorcelain(output string) []Worktree {
	var worktrees []Worktree
	lines := strings.Split(strings.TrimSpace(output), "\n")

	var current *Worktree
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if current != nil {
				worktrees = append(worktrees, *current)
				current = nil
			}
			continue
		}

		if strings.HasPrefix(line, "worktree ") {
			if current != nil {
				worktrees = append(worktrees, *current)
			}
			current = &Worktree{
				Path: strings.TrimPrefix(line, "worktree "),
			}
		} else if current != nil {
			if strings.HasPrefix(line, "HEAD ") {
				current.HEAD = strings.TrimPrefix(line, "HEAD ")
			} else if strings.HasPrefix(line, "branch ") {
				current.Branch = strings.TrimPrefix(line, "branch ")
			} else if line == "detached" {
				current.Detached = true
			}
		}
	}

	// Add the last worktree if exists
	if current != nil {
		worktrees = append(worktrees, *current)
	}

	return worktrees
}

// switchToBranch switches the repository to a specific branch
func (fm *FollowMode) switchToBranch(repoPath, branch string) error {
	// Check if main repo has uncommitted changes
	hasChanges, err := fm.hasUncommittedChanges(repoPath)
	if err != nil {
		return fmt.Errorf("failed to check for uncommitted changes: %w", err)
	}

	if hasChanges {
		return fmt.Errorf("repository has uncommitted changes, cannot switch branches")
	}

	// Switch to the branch
	cmd := exec.Command("git", "checkout", branch)
	cmd.Dir = repoPath
	return cmd.Run()
}

// hasUncommittedChanges checks if a repository has uncommitted changes
func (fm *FollowMode) hasUncommittedChanges(repoPath string) (bool, error) {
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(output)) != "", nil
}

// areHooksInstalled checks if TunnelForge Git hooks are installed
func (fm *FollowMode) areHooksInstalled(repoPath string) (bool, error) {
	// Check for post-checkout hook
	hookPath := filepath.Join(repoPath, ".git", "hooks", "post-checkout")
	if _, err := os.Stat(hookPath); os.IsNotExist(err) {
		return false, nil
	}

	// Read the hook content to verify it's our hook
	content, err := os.ReadFile(hookPath)
	if err != nil {
		return false, err
	}

	// Look for TunnelForge signature in hook
	return strings.Contains(string(content), "TunnelForge"), nil
}

// installGitHooks installs TunnelForge Git hooks for follow mode
func (fm *FollowMode) installGitHooks(repoPath string) error {
	hooksDir := filepath.Join(repoPath, ".git", "hooks")

	// Ensure hooks directory exists
	err := os.MkdirAll(hooksDir, 0755)
	if err != nil {
		return fmt.Errorf("failed to create hooks directory: %w", err)
	}

	// Install post-checkout hook
	postCheckoutHook := filepath.Join(hooksDir, "post-checkout")
	hookContent := `#!/bin/bash
# TunnelForge Git Hook - Post Checkout
# This hook notifies TunnelForge of branch changes for follow mode

# Get the current branch
current_branch=$(git branch --show-current)

# Notify TunnelForge server of the branch change
if command -v vibetunnel >/dev/null 2>&1; then
    vibetunnel git-event --type="post-checkout" --branch="$current_branch" --repo="$(pwd)" &
fi
`

	err = os.WriteFile(postCheckoutHook, []byte(hookContent), 0755)
	if err != nil {
		return fmt.Errorf("failed to write post-checkout hook: %w", err)
	}

	// Install post-commit hook
	postCommitHook := filepath.Join(hooksDir, "post-commit")
	commitHookContent := `#!/bin/bash
# TunnelForge Git Hook - Post Commit
# This hook notifies TunnelForge of commits for follow mode

# Get the current branch
current_branch=$(git branch --show-current)

# Notify TunnelForge server of the commit
if command -v vibetunnel >/dev/null 2>&1; then
    vibetunnel git-event --type="post-commit" --branch="$current_branch" --repo="$(pwd)" &
fi
`

	err = os.WriteFile(postCommitHook, []byte(commitHookContent), 0755)
	if err != nil {
		return fmt.Errorf("failed to write post-commit hook: %w", err)
	}

	return nil
}

// uninstallGitHooks removes TunnelForge Git hooks
func (fm *FollowMode) uninstallGitHooks(repoPath string) error {
	hooksDir := filepath.Join(repoPath, ".git", "hooks")

	// List of hooks to remove
	hooks := []string{"post-checkout", "post-commit"}

	for _, hook := range hooks {
		hookPath := filepath.Join(hooksDir, hook)

		// Check if the hook exists and is ours
		if content, err := os.ReadFile(hookPath); err == nil {
			if strings.Contains(string(content), "TunnelForge") {
				// It's our hook, safe to remove
				os.Remove(hookPath)
			}
		}
	}

	return nil
}

// handleBranchChange handles branch change events from worktrees
func (fm *FollowMode) handleBranchChange(mainRepoPath, worktreePath, expectedBranch string) error {
	// Get the current branch in the worktree
	currentBranch, err := fm.getWorktreeBranch(worktreePath)
	if err != nil {
		return fmt.Errorf("failed to get worktree branch: %w", err)
	}

	// If the branch changed from what we're following, update main repo
	if currentBranch != expectedBranch {
		err = fm.switchToBranch(mainRepoPath, currentBranch)
		if err != nil {
			// If switching failed due to uncommitted changes, disable follow mode
			if strings.Contains(err.Error(), "uncommitted changes") {
				fm.DisableFollowMode(mainRepoPath)
				return fmt.Errorf("follow mode disabled due to uncommitted changes in main repository")
			}
			return fmt.Errorf("failed to sync main repository to branch %s: %w", currentBranch, err)
		}

		// Update the follow configuration to the new branch
		worktrees, err := fm.getWorktrees(mainRepoPath)
		if err == nil {
			for _, wt := range worktrees {
				if wt.Path == worktreePath {
					fm.setFollowWorktreePath(mainRepoPath, wt.Path)
					break
				}
			}
		}
	}

	return nil
}

// handleMergeEvent handles merge events from worktrees
func (fm *FollowMode) handleMergeEvent(mainRepoPath, worktreePath string) error {
	// For merge events, we might want to pull the latest changes to main repo
	// This is optional and depends on the desired behavior

	// Check if main repo is clean
	hasChanges, err := fm.hasUncommittedChanges(mainRepoPath)
	if err != nil {
		return err
	}

	if !hasChanges {
		// Pull latest changes if main repo is clean
		cmd := exec.Command("git", "pull")
		cmd.Dir = mainRepoPath
		cmd.Run() // Ignore errors - this is best effort
	}

	return nil
}
