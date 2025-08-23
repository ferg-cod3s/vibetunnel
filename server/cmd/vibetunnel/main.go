package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/server"
)

const (
	Version     = "1.0.0-dev"
	DefaultPort = "4021"
)

func main() {
	if len(os.Args) < 2 {
		// No command provided - start the server
		startServer()
		return
	}

	command := os.Args[1]
	switch command {
	case "version", "--version", "-v":
		printVersion()
	case "help", "--help", "-h":
		printHelp()
	case "fwd":
		handleForwardCommand()
	case "status":
		handleStatusCommand()
	case "follow":
		handleFollowCommand()
	case "unfollow":
		handleUnfollowCommand()
	case "git-event":
		handleGitEventCommand()
	case "systemd":
		handleSystemdCommand()
	default:
		fmt.Printf("Unknown command: %s\n\n", command)
		printHelp()
		os.Exit(1)
	}
}

// printVersion displays the version information
func printVersion() {
	fmt.Printf("TunnelForge Server v%s\n", Version)
}

// printHelp displays the help information
func printHelp() {
	fmt.Printf("TunnelForge Server v%s\n", Version)
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  tunnelforge [options]                    Start TunnelForge server")
	fmt.Println("  tunnelforge fwd <session-id> <command>   Forward command to session")
	fmt.Println("  tunnelforge status                       Show server status")
	fmt.Println("  tunnelforge follow [branch]              Enable Git follow mode")
	fmt.Println("  tunnelforge unfollow                     Disable Git follow mode")
	fmt.Println("  tunnelforge git-event                    Notify server of Git event")
	fmt.Println("  tunnelforge systemd [action]             Manage systemd service (Linux)")
	fmt.Println("  tunnelforge version                      Show version")
	fmt.Println("  tunnelforge help                         Show this help")
	fmt.Println()
	fmt.Println("Systemd Service Actions:")
	fmt.Println("  install   - Install TunnelForge as systemd service (default)")
	fmt.Println("  uninstall - Remove TunnelForge systemd service")
	fmt.Println("  status    - Check systemd service status")
	fmt.Println()
	fmt.Println("Environment Variables:")
	fmt.Println("  PORT                 - Server port (default: 4021)")
	fmt.Println("  HOST                 - Server host (default: localhost)")
	fmt.Println("  AUTH_REQUIRED        - Require authentication (default: false)")
	fmt.Println("  ENABLE_RATE_LIMIT    - Enable rate limiting (default: true)")
	fmt.Println("  RATE_LIMIT_PER_MIN   - Requests per minute per IP (default: 100)")
	fmt.Println()
	fmt.Println("Examples:")
	fmt.Println("  tunnelforge")
	fmt.Println("  tunnelforge fwd abc123 \"ls -la\"")
	fmt.Println("  AUTH_REQUIRED=true tunnelforge")
	fmt.Println("  tunnelforge systemd install")
}

// startServer starts the TunnelForge server
func startServer() {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// Create server instance
	srv, err := server.New(&server.Config{
		Port: port,
	})
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Start server in goroutine
	go func() {
		log.Printf("TunnelForge Go server starting on port %s", port)
		log.Printf("WebSocket endpoint: ws://localhost:%s/ws", port)
		log.Printf("Health check: http://localhost:%s/health", port)
		log.Printf("API endpoints: http://localhost:%s/api", port)

		if err := srv.Start(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Create context with timeout for graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

// handleForwardCommand forwards a command to a terminal session
func handleForwardCommand() {
	if len(os.Args) < 4 {
		fmt.Println("Error: fwd command requires session ID and command")
		fmt.Println("Usage: tunnelforge fwd <session-id> <command>")
		os.Exit(1)
	}

	sessionID := os.Args[2]
	command := strings.Join(os.Args[3:], " ")

	// Send command to session via API
	err := sendCommandToSession(sessionID, command)
	if err != nil {
		fmt.Printf("Error forwarding command: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Command sent to session %s: %s\n", sessionID, command)
}

// handleStatusCommand shows server status
func handleStatusCommand() {
	status, err := getServerStatus()
	if err != nil {
		fmt.Printf("Error getting server status: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("TunnelForge Server Status:")
	fmt.Printf("  Status: %s\n", status["status"])
	if healthy, ok := status["healthy"].(bool); ok && healthy {
		fmt.Printf("  Healthy: Yes\n")
	} else {
		fmt.Printf("  Healthy: No\n")
	}

	if sessions, ok := status["sessions"].(float64); ok {
		fmt.Printf("  Active Sessions: %.0f\n", sessions)
	}

	if uptime, ok := status["uptime"].(string); ok {
		fmt.Printf("  Uptime: %s\n", uptime)
	}

	if serverName, ok := status["serverName"].(string); ok {
		fmt.Printf("  Server Name: %s\n", serverName)
	}

	if version, ok := status["version"].(string); ok {
		fmt.Printf("  Version: %s\n", version)
	}
}

// handleFollowCommand enables Git follow mode
func handleFollowCommand() {
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error: Failed to get current directory: %v\n", err)
		os.Exit(1)
	}

	// Determine branch to follow
	var branch string
	if len(os.Args) > 2 {
		branch = os.Args[2]
	} else {
		// No branch specified, get current branch
		branch, err = getCurrentBranch(cwd)
		if err != nil {
			fmt.Printf("Error: Failed to get current branch: %v\n", err)
			os.Exit(1)
		}
	}

	// Send request to enable follow mode
	err = sendFollowRequest(cwd, branch, true)
	if err != nil {
		fmt.Printf("Error: Failed to enable follow mode: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ Follow mode enabled for branch: %s\n", branch)
	fmt.Printf("📍 Repository: %s\n", cwd)
	fmt.Println("🔄 Main repository will now sync with this worktree's branch changes")
}

// handleUnfollowCommand disables Git follow mode
func handleUnfollowCommand() {
	// Get current working directory
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error: Failed to get current directory: %v\n", err)
		os.Exit(1)
	}

	// Send request to disable follow mode
	err = sendFollowRequest(cwd, "", false)
	if err != nil {
		fmt.Printf("Error: Failed to disable follow mode: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Follow mode disabled")
	fmt.Printf("📍 Repository: %s\n", cwd)
	fmt.Println("🔄 Git hooks removed and automatic sync stopped")
}

// handleGitEventCommand notifies server of Git events
func handleGitEventCommand() {
	// Parse command line arguments for git event
	var eventType, branch, repoPath string

	for i := 2; i < len(os.Args); i++ {
		arg := os.Args[i]
		if strings.HasPrefix(arg, "--type=") {
			eventType = strings.TrimPrefix(arg, "--type=")
		} else if strings.HasPrefix(arg, "--branch=") {
			branch = strings.TrimPrefix(arg, "--branch=")
		} else if strings.HasPrefix(arg, "--repo=") {
			repoPath = strings.TrimPrefix(arg, "--repo=")
		}
	}

	// Validate required arguments
	if eventType == "" || repoPath == "" {
		fmt.Println("Error: Missing required arguments")
		fmt.Println("Usage: tunnelforge git-event --type=<event-type> --repo=<repo-path> [--branch=<branch>]")
		os.Exit(1)
	}

	// Send git event to server
	err := sendGitEvent(eventType, branch, repoPath)
	if err != nil {
		fmt.Printf("Error: Failed to send git event: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("📡 Git event sent: %s\n", eventType)
}

// handleSystemdCommand manages systemd service
func handleSystemdCommand() {
	action := "install"
	if len(os.Args) > 2 {
		action = os.Args[2]
	}

	switch action {
	case "install":
		fmt.Println("Installing TunnelForge as systemd service...")
		fmt.Println("Feature planned for future implementation")
		// TODO: Implement systemd service installation
	case "uninstall":
		fmt.Println("Uninstalling TunnelForge systemd service...")
		fmt.Println("Feature planned for future implementation")
		// TODO: Implement systemd service removal
	case "status":
		fmt.Println("Checking TunnelForge systemd service status...")
		fmt.Println("Feature planned for future implementation")
		// TODO: Implement systemd service status check
	default:
		fmt.Printf("Unknown systemd action: %s\n", action)
		fmt.Println("Available actions: install, uninstall, status")
		os.Exit(1)
	}
}

// sendCommandToSession sends a command to a terminal session via API
func sendCommandToSession(sessionID, command string) error {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// Prepare the input payload
	payload := map[string]string{
		"data": command + "\n", // Add newline to execute command
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal command: %v", err)
	}

	// Send HTTP POST request to session input endpoint
	url := fmt.Sprintf("http://localhost:%s/api/sessions/%s/input", port, sessionID)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return fmt.Errorf("failed to send command to server: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// getServerStatus retrieves server status via API
func getServerStatus() (map[string]interface{}, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = DefaultPort
	}

	// Send HTTP GET request to server status endpoint
	url := fmt.Sprintf("http://localhost:%s/api/server/status", port)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to server: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
	}

	var status map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, fmt.Errorf("failed to decode server response: %v", err)
	}

	return status, nil
}

// getCurrentBranch gets the current git branch
func getCurrentBranch(repoPath string) (string, error) {
	cmd := exec.Command("git", "branch", "--show-current")
	cmd.Dir = repoPath
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// sendFollowRequest sends a request to enable/disable follow mode
func sendFollowRequest(repoPath, branch string, enable bool) error {
	payload := map[string]interface{}{
		"repoPath": repoPath,
		"enable":   enable,
	}
	if enable && branch != "" {
		payload["branch"] = branch
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Try to send to local server
	resp, err := http.Post("http://localhost:4021/api/worktrees/follow", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to connect to TunnelForge server (is it running?): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// sendGitEvent sends a git event to the server
func sendGitEvent(eventType, branch, repoPath string) error {
	payload := map[string]interface{}{
		"type":     eventType,
		"repoPath": repoPath,
	}
	if branch != "" {
		payload["branch"] = branch
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Try to send to local server
	resp, err := http.Post("http://localhost:4021/api/git/event", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to connect to TunnelForge server (is it running?): %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
