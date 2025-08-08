package filesystem

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"syscall"
	"strconv"
	"sort"

	"github.com/gorilla/mux"
)

// FileInfo represents file metadata
type FileInfo struct {
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	Type         string    `json:"type"` // "file" or "directory"
	Size         int64     `json:"size"`
	Mode         string    `json:"mode"`
	ModTime      time.Time `json:"modTime"`
	IsHidden     bool      `json:"isHidden"`
	Permissions  string    `json:"permissions"`
	Owner        string    `json:"owner,omitempty"`
	Group        string    `json:"group,omitempty"`
	IsSymlink    bool      `json:"isSymlink"`
	SymlinkTarget string   `json:"symlinkTarget,omitempty"`
}

// ListRequest represents directory listing request parameters
type ListRequest struct {
	Path      string `json:"path"`
	ShowHidden bool   `json:"showHidden"`
	SortBy    string `json:"sortBy"` // "name", "size", "modTime"
	SortDesc  bool   `json:"sortDesc"`
}

// ListResponse represents directory listing response
type ListResponse struct {
	Path        string     `json:"path"`
	Files       []FileInfo `json:"files"`
	Directories []FileInfo `json:"directories"`
	Parent      string     `json:"parent,omitempty"`
	Error       string     `json:"error,omitempty"`
}

// FileSystemService handles file system operations
type FileSystemService struct {
	basePath string // Base path for security (prevent directory traversal)
}

// NewFileSystemService creates a new file system service
func NewFileSystemService(basePath string) *FileSystemService {
	if basePath == "" {
		basePath = "/"
	}
	return &FileSystemService{
		basePath: basePath,
	}
}

// validatePath ensures the requested path is within allowed bounds
func (fs *FileSystemService) validatePath(requestedPath string) (string, error) {
	// Clean the path to prevent directory traversal
	cleanPath := filepath.Clean(requestedPath)
	
	// Convert relative path to absolute
	if !filepath.IsAbs(cleanPath) {
		cleanPath = filepath.Join(fs.basePath, cleanPath)
	}
	
	// Resolve symlinks and get absolute path
	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		return "", fmt.Errorf("invalid path: %v", err)
	}
	
	// Ensure the path is within the base path (security check)
	absBasePath, err := filepath.Abs(fs.basePath)
	if err != nil {
		return "", fmt.Errorf("invalid base path: %v", err)
	}
	
	if !strings.HasPrefix(absPath, absBasePath) {
		return "", fmt.Errorf("access denied: path outside allowed directory")
	}
	
	return absPath, nil
}

// getFileInfo extracts metadata from os.FileInfo
func (fs *FileSystemService) getFileInfo(path string, info os.FileInfo) FileInfo {
	fileType := "file"
	if info.IsDir() {
		fileType = "directory"
	}
	
	permissions := info.Mode().Perm().String()
	isHidden := strings.HasPrefix(info.Name(), ".")
	
	fileInfo := FileInfo{
		Name:        info.Name(),
		Path:        path,
		Type:        fileType,
		Size:        info.Size(),
		Mode:        info.Mode().String(),
		ModTime:     info.ModTime(),
		IsHidden:    isHidden,
		Permissions: permissions,
		IsSymlink:   info.Mode()&os.ModeSymlink != 0,
	}
	
	// Get symlink target if it's a symlink
	if fileInfo.IsSymlink {
		if target, err := os.Readlink(path); err == nil {
			fileInfo.SymlinkTarget = target
		}
	}
	
	// Try to get owner/group information (Unix-specific)
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		fileInfo.Owner = strconv.Itoa(int(stat.Uid))
		fileInfo.Group = strconv.Itoa(int(stat.Gid))
	}
	
	return fileInfo
}

// sortFiles sorts files according to the specified criteria
func (fs *FileSystemService) sortFiles(files []FileInfo, sortBy string, sortDesc bool) {
	sort.Slice(files, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "size":
			less = files[i].Size < files[j].Size
		case "modTime":
			less = files[i].ModTime.Before(files[j].ModTime)
		default: // "name"
			less = strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
		}
		
		if sortDesc {
			return !less
		}
		return less
	})
}

// ListDirectory handles GET /api/filesystem/ls
func (fs *FileSystemService) ListDirectory(w http.ResponseWriter, r *http.Request) {
	var req ListRequest
	
	// Parse query parameters
	req.Path = r.URL.Query().Get("path")
	if req.Path == "" {
		req.Path = "."
	}
	req.ShowHidden = r.URL.Query().Get("showHidden") == "true"
	req.SortBy = r.URL.Query().Get("sortBy")
	if req.SortBy == "" {
		req.SortBy = "name"
	}
	req.SortDesc = r.URL.Query().Get("sortDesc") == "true"
	
	// Validate and resolve path
	fullPath, err := fs.validatePath(req.Path)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check if path exists and is accessible
	if _, err := os.Stat(fullPath); err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "Path not found", http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("Access denied: %v", err), http.StatusForbidden)
		}
		return
	}
	
	// Read directory contents
	entries, err := os.ReadDir(fullPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read directory: %v", err), http.StatusInternalServerError)
		return
	}
	
	var files []FileInfo
	var directories []FileInfo
	
	for _, entry := range entries {
		// Skip hidden files if not requested
		if !req.ShowHidden && strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		
		entryPath := filepath.Join(fullPath, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue // Skip files we can't read
		}
		
		fileInfo := fs.getFileInfo(entryPath, info)
		
		if info.IsDir() {
			directories = append(directories, fileInfo)
		} else {
			files = append(files, fileInfo)
		}
	}
	
	// Sort files and directories
	fs.sortFiles(files, req.SortBy, req.SortDesc)
	fs.sortFiles(directories, req.SortBy, req.SortDesc)
	
	// Determine parent directory
	var parent string
	if fullPath != fs.basePath {
		parent = filepath.Dir(req.Path)
		if parent == "." {
			parent = ""
		}
	}
	
	response := ListResponse{
		Path:        req.Path,
		Files:       files,
		Directories: directories,
		Parent:      parent,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DownloadFile handles GET /api/filesystem/download/{path}
func (fs *FileSystemService) DownloadFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	requestedPath := vars["path"]
	
	if requestedPath == "" {
		http.Error(w, "Path parameter is required", http.StatusBadRequest)
		return
	}
	
	// Validate and resolve path
	fullPath, err := fs.validatePath(requestedPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check if file exists
	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("Access denied: %v", err), http.StatusForbidden)
		}
		return
	}
	
	// Ensure it's a file, not a directory
	if info.IsDir() {
		http.Error(w, "Cannot download directory", http.StatusBadRequest)
		return
	}
	
	// Open file
	file, err := os.Open(fullPath)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to open file: %v", err), http.StatusInternalServerError)
		return
	}
	defer file.Close()
	
	// Set headers for file download
	filename := filepath.Base(fullPath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	
	// Stream file to response
	_, err = io.Copy(w, file)
	if err != nil {
		// Can't change headers after writing starts, so just log the error
		fmt.Printf("Error streaming file: %v\n", err)
	}
}

// UploadFile handles POST /api/filesystem/upload
func (fs *FileSystemService) UploadFile(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (32MB max memory)
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to parse multipart form: %v", err), http.StatusBadRequest)
		return
	}
	
	// Get target directory
	targetDir := r.FormValue("path")
	if targetDir == "" {
		targetDir = "."
	}
	
	// Validate target directory
	fullTargetDir, err := fs.validatePath(targetDir)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid target directory: %v", err), http.StatusBadRequest)
		return
	}
	
	// Ensure target directory exists and is a directory
	info, err := os.Stat(fullTargetDir)
	if err != nil {
		http.Error(w, "Target directory not found", http.StatusNotFound)
		return
	}
	if !info.IsDir() {
		http.Error(w, "Target path is not a directory", http.StatusBadRequest)
		return
	}
	
	// Get uploaded files
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		http.Error(w, "No files uploaded", http.StatusBadRequest)
		return
	}
	
	uploadedFiles := make([]string, 0, len(files))
	
	for _, fileHeader := range files {
		// Open uploaded file
		file, err := fileHeader.Open()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to open uploaded file: %v", err), http.StatusInternalServerError)
			return
		}
		defer file.Close()
		
		// Create target file path
		targetPath := filepath.Join(fullTargetDir, fileHeader.Filename)
		
		// Create target file
		targetFile, err := os.Create(targetPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create target file: %v", err), http.StatusInternalServerError)
			return
		}
		defer targetFile.Close()
		
		// Copy uploaded file to target
		_, err = io.Copy(targetFile, file)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to save file: %v", err), http.StatusInternalServerError)
			return
		}
		
		uploadedFiles = append(uploadedFiles, fileHeader.Filename)
	}
	
	response := map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Uploaded %d file(s)", len(uploadedFiles)),
		"files":   uploadedFiles,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateDirectory handles POST /api/filesystem/mkdir
func (fs *FileSystemService) CreateDirectory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
		Mode string `json:"mode,omitempty"` // Optional: directory permissions (e.g., "0755")
	}
	
	// Parse JSON request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	
	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}
	
	// Validate and resolve path
	fullPath, err := fs.validatePath(req.Path)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}
	
	// Parse permissions
	mode := os.FileMode(0755) // Default permissions
	if req.Mode != "" {
		if parsedMode, err := strconv.ParseUint(req.Mode, 8, 32); err == nil {
			mode = os.FileMode(parsedMode)
		}
	}
	
	// Create directory
	err = os.MkdirAll(fullPath, mode)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create directory: %v", err), http.StatusInternalServerError)
		return
	}
	
	response := map[string]interface{}{
		"success": true,
		"message": "Directory created successfully",
		"path":    req.Path,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeletePath handles DELETE /api/filesystem/rm
func (fs *FileSystemService) DeletePath(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path      string `json:"path"`
		Recursive bool   `json:"recursive,omitempty"` // For directories
		Force     bool   `json:"force,omitempty"`     // Ignore some errors
	}
	
	// Parse JSON request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	
	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}
	
	// Validate and resolve path
	fullPath, err := fs.validatePath(req.Path)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid path: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check if path exists
	info, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			if req.Force {
				// Ignore if path doesn't exist and force is true
				response := map[string]interface{}{
					"success": true,
					"message": "Path already deleted or does not exist",
					"path":    req.Path,
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(response)
				return
			}
			http.Error(w, "Path not found", http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("Access denied: %v", err), http.StatusForbidden)
		}
		return
	}
	
	// Delete the path
	if info.IsDir() {
		if req.Recursive {
			err = os.RemoveAll(fullPath)
		} else {
			err = os.Remove(fullPath) // Will fail if directory is not empty
		}
	} else {
		err = os.Remove(fullPath)
	}
	
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete: %v", err), http.StatusInternalServerError)
		return
	}
	
	response := map[string]interface{}{
		"success": true,
		"message": "Path deleted successfully",
		"path":    req.Path,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// RegisterRoutes registers filesystem routes with the provided router
func (fs *FileSystemService) RegisterRoutes(router *mux.Router) {
	// Create filesystem subrouter
	fsRouter := router.PathPrefix("/api/filesystem").Subrouter()
	
	// Register endpoints
	fsRouter.HandleFunc("/ls", fs.ListDirectory).Methods("GET")
	fsRouter.HandleFunc("/download/{path:.*}", fs.DownloadFile).Methods("GET")
	fsRouter.HandleFunc("/upload", fs.UploadFile).Methods("POST")
	fsRouter.HandleFunc("/mkdir", fs.CreateDirectory).Methods("POST")
	fsRouter.HandleFunc("/rm", fs.DeletePath).Methods("DELETE")
}