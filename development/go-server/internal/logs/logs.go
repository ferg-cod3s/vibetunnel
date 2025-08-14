package logs

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// LogLevel represents valid log levels
type LogLevel string

const (
	LogLevelLog   LogLevel = "log"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
	LogLevelDebug LogLevel = "debug"
)

// ClientLogRequest represents a client-side log request
type ClientLogRequest struct {
	Level  LogLevel `json:"level"`
	Module string   `json:"module"`
	Args   []string `json:"args"`
}

// LogService handles client-side logging functionality
type LogService struct {
	// Future: could add file logging, structured logging, etc.
}

// NewLogService creates a new log service
func NewLogService() *LogService {
	return &LogService{}
}

// RegisterRoutes registers log-related routes
func (ls *LogService) RegisterRoutes(router *mux.Router) {
	// Client-side logging endpoint
	router.HandleFunc("/api/logs/client", ls.handleClientLog).Methods("POST")

	// Server log streaming endpoint (for future use)
	router.HandleFunc("/api/logs/server", ls.handleServerLogs).Methods("GET")

	// Log file download endpoint (for debugging)
	router.HandleFunc("/api/logs/download", ls.handleLogDownload).Methods("GET")

	// Additional log management endpoints
	router.HandleFunc("/api/logs/info", ls.handleLogInfo).Methods("GET")
	router.HandleFunc("/api/logs/raw", ls.handleRawLogs).Methods("GET")
	router.HandleFunc("/api/logs/clear", ls.handleClearLogs).Methods("POST")
}

// handleClientLog processes client-side log messages
func (ls *LogService) handleClientLog(w http.ResponseWriter, r *http.Request) {
	var req ClientLogRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate input
	if req.Level == "" || req.Module == "" || len(req.Args) == 0 {
		http.Error(w, "Invalid log request. Required: level, module, args[]", http.StatusBadRequest)
		return
	}

	// Validate log level
	validLevels := map[LogLevel]bool{
		LogLevelLog:   true,
		LogLevelWarn:  true,
		LogLevelError: true,
		LogLevelDebug: true,
	}

	if !validLevels[req.Level] {
		http.Error(w, "Invalid log level", http.StatusBadRequest)
		return
	}

	// Sanitize module name
	req.Module = strings.TrimSpace(req.Module)
	if len(req.Module) > 50 {
		req.Module = req.Module[:50]
	}

	// Format and log the client message
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	message := strings.Join(req.Args, " ")

	// Use appropriate log level
	prefix := fmt.Sprintf("[CLIENT:%s] [%s] %s:", timestamp, strings.ToUpper(string(req.Level)), req.Module)

	switch req.Level {
	case LogLevelError:
		log.Printf("%s ERROR: %s", prefix, message)
	case LogLevelWarn:
		log.Printf("%s WARN: %s", prefix, message)
	case LogLevelDebug:
		log.Printf("%s DEBUG: %s", prefix, message)
	default:
		log.Printf("%s %s", prefix, message)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "logged"})
}

// handleServerLogs streams server log files (future enhancement)
func (ls *LogService) handleServerLogs(w http.ResponseWriter, r *http.Request) {
	// For now, return not implemented
	http.Error(w, "Server log streaming not yet implemented", http.StatusNotImplemented)
}

// handleLogDownload allows downloading log files for debugging
func (ls *LogService) handleLogDownload(w http.ResponseWriter, r *http.Request) {
	// For security, only allow downloading from specific log directories
	logDir := "/tmp/vibetunnel-logs" // Configure this appropriately

	// Check if log directory exists
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		http.Error(w, "No logs available", http.StatusNotFound)
		return
	}

	// List log files
	files, err := filepath.Glob(filepath.Join(logDir, "*.log"))
	if err != nil {
		http.Error(w, "Failed to list log files", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logDirectory":   logDir,
		"availableFiles": files,
		"note":           "Use query parameter ?file=filename.log to download specific file",
	})
}

// handleLogInfo provides metadata about available logs
func (ls *LogService) handleLogInfo(w http.ResponseWriter, r *http.Request) {
	logDir := "/tmp/vibetunnel-logs"

	info := map[string]interface{}{
		"logDirectory": logDir,
		"available":    true,
		"description":  "VibeTunnel log management",
	}

	// Check if log directory exists and get file info
	if stat, err := os.Stat(logDir); err == nil {
		info["directoryExists"] = true
		info["lastModified"] = stat.ModTime()

		// Count log files
		if files, err := filepath.Glob(filepath.Join(logDir, "*.log")); err == nil {
			info["fileCount"] = len(files)
		}
	} else {
		info["directoryExists"] = false
		info["fileCount"] = 0
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleRawLogs provides raw log content
func (ls *LogService) handleRawLogs(w http.ResponseWriter, r *http.Request) {
	logDir := "/tmp/vibetunnel-logs"
	filename := r.URL.Query().Get("file")

	if filename == "" {
		// Return list of available files if no specific file requested
		files, err := filepath.Glob(filepath.Join(logDir, "*.log"))
		if err != nil {
			http.Error(w, "Failed to list log files", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"availableFiles": files,
			"usage":          "Add ?file=filename.log to get raw content",
		})
		return
	}

	// Validate filename for security
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(logDir, filename)
	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Log file not found", http.StatusNotFound)
		} else {
			http.Error(w, "Failed to read log file", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Write(content)
}

// handleClearLogs clears or rotates log files
func (ls *LogService) handleClearLogs(w http.ResponseWriter, r *http.Request) {
	logDir := "/tmp/vibetunnel-logs"

	// Check if log directory exists
	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "No logs to clear",
			"cleared": 0,
		})
		return
	}

	// Find and remove log files
	files, err := filepath.Glob(filepath.Join(logDir, "*.log"))
	if err != nil {
		http.Error(w, "Failed to list log files", http.StatusInternalServerError)
		return
	}

	clearedCount := 0
	for _, file := range files {
		if err := os.Remove(file); err != nil {
			log.Printf("Failed to remove log file %s: %v", file, err)
		} else {
			clearedCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": fmt.Sprintf("Cleared %d log files", clearedCount),
		"cleared": clearedCount,
	})
}
