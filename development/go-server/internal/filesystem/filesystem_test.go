package filesystem

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
)

func setupTestEnvironment(t *testing.T) (string, *FileSystemService, func()) {
	// Create temporary directory for testing
	tempDir, err := os.MkdirTemp("", "vibetunnel_fs_test_*")
	if err != nil {
		t.Fatal("Failed to create temp directory:", err)
	}

	// Create test directory structure
	testDirs := []string{
		"subdir1",
		"subdir2",
		".hidden_dir",
	}

	for _, dir := range testDirs {
		err := os.Mkdir(filepath.Join(tempDir, dir), 0755)
		if err != nil {
			t.Fatal("Failed to create test directory:", err)
		}
	}

	// Create test files
	testFiles := map[string]string{
		"file1.txt":          "Hello World",
		"file2.json":         `{"test": true}`,
		".hidden_file":       "secret",
		"subdir1/nested.txt": "nested content",
	}

	for filePath, content := range testFiles {
		fullPath := filepath.Join(tempDir, filePath)
		err := os.WriteFile(fullPath, []byte(content), 0644)
		if err != nil {
			t.Fatal("Failed to create test file:", err)
		}
	}

	// Create filesystem service
	fs := NewFileSystemService(tempDir)

	// Cleanup function
	cleanup := func() {
		os.RemoveAll(tempDir)
	}

	return tempDir, fs, cleanup
}

func TestFileSystemService_ListDirectory(t *testing.T) {
	_, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name        string
		path        string
		showHidden  bool
		expectCode  int
		expectDirs  int
		expectFiles int
	}{
		{
			name:        "List root directory",
			path:        "",
			showHidden:  false,
			expectCode:  200,
			expectDirs:  2, // subdir1, subdir2 (not .hidden_dir)
			expectFiles: 2, // file1.txt, file2.json (not .hidden_file)
		},
		{
			name:        "List root directory with hidden",
			path:        "",
			showHidden:  true,
			expectCode:  200,
			expectDirs:  3, // subdir1, subdir2, .hidden_dir
			expectFiles: 3, // file1.txt, file2.json, .hidden_file
		},
		{
			name:        "List subdirectory",
			path:        "subdir1",
			showHidden:  false,
			expectCode:  200,
			expectDirs:  0,
			expectFiles: 1, // nested.txt
		},
		{
			name:       "List non-existent directory",
			path:       "nonexistent",
			expectCode: 404,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "/api/filesystem/ls", nil)
			if err != nil {
				t.Fatal(err)
			}

			// Add query parameters
			q := req.URL.Query()
			if tt.path != "" {
				q.Add("path", tt.path)
			}
			if tt.showHidden {
				q.Add("showHidden", "true")
			}
			req.URL.RawQuery = q.Encode()

			rr := httptest.NewRecorder()
			fs.ListDirectory(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("Expected status code %d, got %d", tt.expectCode, rr.Code)
			}

			if tt.expectCode == 200 {
				var response ListResponse
				err := json.Unmarshal(rr.Body.Bytes(), &response)
				if err != nil {
					t.Fatal("Failed to parse JSON response:", err)
				}

				if len(response.Directories) != tt.expectDirs {
					t.Errorf("Expected %d directories, got %d", tt.expectDirs, len(response.Directories))
				}

				if len(response.Files) != tt.expectFiles {
					t.Errorf("Expected %d files, got %d", tt.expectFiles, len(response.Files))
				}
			}
		})
	}
}

func TestFileSystemService_DownloadFile(t *testing.T) {
	_, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name          string
		path          string
		expectCode    int
		expectContent string
	}{
		{
			name:          "Download existing file",
			path:          "file1.txt",
			expectCode:    200,
			expectContent: "Hello World",
		},
		{
			name:       "Download non-existent file",
			path:       "nonexistent.txt",
			expectCode: 404,
		},
		{
			name:       "Download directory (should fail)",
			path:       "subdir1",
			expectCode: 400,
		},
	}

	router := mux.NewRouter()
	fs.RegisterRoutes(router)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := fmt.Sprintf("/api/filesystem/download/%s", tt.path)
			req, err := http.NewRequest("GET", url, nil)
			if err != nil {
				t.Fatal(err)
			}

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("Expected status code %d, got %d", tt.expectCode, rr.Code)
			}

			if tt.expectCode == 200 && tt.expectContent != "" {
				body := rr.Body.String()
				if body != tt.expectContent {
					t.Errorf("Expected content %q, got %q", tt.expectContent, body)
				}

				// Check headers
				contentDisposition := rr.Header().Get("Content-Disposition")
				if !strings.Contains(contentDisposition, "attachment") {
					t.Error("Expected Content-Disposition header with attachment")
				}
			}
		})
	}
}

func TestFileSystemService_CreateDirectory(t *testing.T) {
	tempDir, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name        string
		path        string
		expectCode  int
		shouldExist bool
	}{
		{
			name:        "Create new directory",
			path:        "new_directory",
			expectCode:  200,
			shouldExist: true,
		},
		{
			name:        "Create nested directory",
			path:        "nested/deep/directory",
			expectCode:  200,
			shouldExist: true,
		},
		{
			name:        "Create existing directory",
			path:        "subdir1",
			expectCode:  200, // MkdirAll doesn't fail if directory exists
			shouldExist: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requestBody := map[string]string{
				"path": tt.path,
			}
			jsonBody, _ := json.Marshal(requestBody)

			req, err := http.NewRequest("POST", "/api/filesystem/mkdir", bytes.NewBuffer(jsonBody))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			fs.CreateDirectory(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("Expected status code %d, got %d", tt.expectCode, rr.Code)
				t.Errorf("Response body: %s", rr.Body.String())
			}

			if tt.shouldExist {
				fullPath := filepath.Join(tempDir, tt.path)
				if _, err := os.Stat(fullPath); os.IsNotExist(err) {
					t.Errorf("Directory %s should exist but doesn't", fullPath)
				}
			}

			if tt.expectCode == 200 {
				var response map[string]interface{}
				err := json.Unmarshal(rr.Body.Bytes(), &response)
				if err != nil {
					t.Fatal("Failed to parse JSON response:", err)
				}

				if success, ok := response["success"].(bool); !ok || !success {
					t.Error("Expected success: true in response")
				}
			}
		})
	}
}

func TestFileSystemService_DeletePath(t *testing.T) {
	tempDir, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name         string
		path         string
		recursive    bool
		force        bool
		expectCode   int
		shouldDelete bool
	}{
		{
			name:         "Delete existing file",
			path:         "file1.txt",
			expectCode:   200,
			shouldDelete: true,
		},
		{
			name:       "Delete non-existent file",
			path:       "nonexistent.txt",
			expectCode: 404,
		},
		{
			name:       "Delete non-existent file with force",
			path:       "nonexistent.txt",
			force:      true,
			expectCode: 200,
		},
		{
			name:       "Delete non-empty directory without recursive",
			path:       "subdir1",
			expectCode: 500, // Will fail because directory is not empty
		},
		{
			name:         "Delete non-empty directory with recursive",
			path:         "subdir2",
			recursive:    true,
			expectCode:   200,
			shouldDelete: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requestBody := map[string]interface{}{
				"path": tt.path,
			}
			if tt.recursive {
				requestBody["recursive"] = true
			}
			if tt.force {
				requestBody["force"] = true
			}
			jsonBody, _ := json.Marshal(requestBody)

			req, err := http.NewRequest("DELETE", "/api/filesystem/rm", bytes.NewBuffer(jsonBody))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()
			fs.DeletePath(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("Expected status code %d, got %d", tt.expectCode, rr.Code)
				t.Errorf("Response body: %s", rr.Body.String())
			}

			if tt.shouldDelete {
				fullPath := filepath.Join(tempDir, tt.path)
				if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
					t.Errorf("Path %s should be deleted but still exists", fullPath)
				}
			}

			if tt.expectCode == 200 {
				var response map[string]interface{}
				err := json.Unmarshal(rr.Body.Bytes(), &response)
				if err != nil {
					t.Fatal("Failed to parse JSON response:", err)
				}

				if success, ok := response["success"].(bool); !ok || !success {
					t.Error("Expected success: true in response")
				}
			}
		})
	}
}

func TestFileSystemService_UploadFile(t *testing.T) {
	tempDir, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name       string
		targetPath string
		files      map[string]string // filename -> content
		expectCode int
	}{
		{
			name:       "Upload single file",
			targetPath: "",
			files: map[string]string{
				"upload1.txt": "uploaded content 1",
			},
			expectCode: 200,
		},
		{
			name:       "Upload multiple files",
			targetPath: "subdir1",
			files: map[string]string{
				"upload2.txt": "uploaded content 2",
				"upload3.txt": "uploaded content 3",
			},
			expectCode: 200,
		},
		{
			name:       "Upload to non-existent directory",
			targetPath: "nonexistent",
			files: map[string]string{
				"upload4.txt": "uploaded content 4",
			},
			expectCode: 404,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var b bytes.Buffer
			w := multipart.NewWriter(&b)

			// Add target path
			if tt.targetPath != "" {
				w.WriteField("path", tt.targetPath)
			}

			// Add files
			for filename, content := range tt.files {
				fw, err := w.CreateFormFile("files", filename)
				if err != nil {
					t.Fatal(err)
				}
				fw.Write([]byte(content))
			}
			w.Close()

			req, err := http.NewRequest("POST", "/api/filesystem/upload", &b)
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", w.FormDataContentType())

			rr := httptest.NewRecorder()
			fs.UploadFile(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("Expected status code %d, got %d", tt.expectCode, rr.Code)
				t.Errorf("Response body: %s", rr.Body.String())
			}

			if tt.expectCode == 200 {
				// Verify files were created
				targetDir := tt.targetPath
				if targetDir == "" {
					targetDir = "."
				}

				for filename, expectedContent := range tt.files {
					fullPath := filepath.Join(tempDir, targetDir, filename)
					content, err := os.ReadFile(fullPath)
					if err != nil {
						t.Errorf("Failed to read uploaded file %s: %v", fullPath, err)
						continue
					}

					if string(content) != expectedContent {
						t.Errorf("File %s content mismatch. Expected %q, got %q", filename, expectedContent, string(content))
					}
				}

				// Verify response
				var response map[string]interface{}
				err := json.Unmarshal(rr.Body.Bytes(), &response)
				if err != nil {
					t.Fatal("Failed to parse JSON response:", err)
				}

				if success, ok := response["success"].(bool); !ok || !success {
					t.Error("Expected success: true in response")
				}
			}
		})
	}
}

func TestFileSystemService_PathValidation(t *testing.T) {
	tempDir, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	tests := []struct {
		name        string
		path        string
		shouldError bool
	}{
		{
			name:        "Valid relative path",
			path:        "subdir1",
			shouldError: false,
		},
		{
			name:        "Valid absolute path within base",
			path:        filepath.Join(tempDir, "subdir1"),
			shouldError: false,
		},
		{
			name:        "Directory traversal attempt",
			path:        "../../etc/passwd",
			shouldError: true,
		},
		{
			name:        "Absolute path outside base",
			path:        "/etc/passwd",
			shouldError: true,
		},
		{
			name:        "Current directory",
			path:        ".",
			shouldError: false,
		},
		{
			name:        "Parent directory",
			path:        "..",
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := fs.validatePath(tt.path)

			if tt.shouldError && err == nil {
				t.Errorf("Expected error for path %s, but got none", tt.path)
			}

			if !tt.shouldError && err != nil {
				t.Errorf("Expected no error for path %s, but got: %v", tt.path, err)
			}
		})
	}
}

func TestFileSystemService_SortingAndFiltering(t *testing.T) {
	tempDir, fs, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// Create files with different sizes and modification times
	testFiles := []struct {
		name    string
		content string
		delay   bool // Add delay to get different mod times
	}{
		{"zzz.txt", "small", false},
		{"aaa.txt", "this is a longer file content", true},
		{"mmm.txt", "medium content", true},
	}

	for _, tf := range testFiles {
		if tf.delay {
			// Small delay to ensure different modification times
			time.Sleep(time.Millisecond * 10)
		}
		filePath := filepath.Join(tempDir, tf.name)
		err := os.WriteFile(filePath, []byte(tf.content), 0644)
		if err != nil {
			t.Fatal("Failed to create test file:", err)
		}
	}

	tests := []struct {
		name      string
		sortBy    string
		sortDesc  bool
		firstFile string // Expected first file in sorted results
	}{
		{
			name:      "Sort by name ascending",
			sortBy:    "name",
			sortDesc:  false,
			firstFile: "aaa.txt",
		},
		{
			name:      "Sort by name descending",
			sortBy:    "name",
			sortDesc:  true,
			firstFile: "zzz.txt",
		},
		{
			name:      "Sort by size ascending",
			sortBy:    "size",
			sortDesc:  false,
			firstFile: "zzz.txt", // smallest file
		},
		{
			name:      "Sort by size descending",
			sortBy:    "size",
			sortDesc:  true,
			firstFile: "aaa.txt", // largest file
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "/api/filesystem/ls", nil)
			if err != nil {
				t.Fatal(err)
			}

			q := req.URL.Query()
			q.Add("sortBy", tt.sortBy)
			if tt.sortDesc {
				q.Add("sortDesc", "true")
			}
			req.URL.RawQuery = q.Encode()

			rr := httptest.NewRecorder()
			fs.ListDirectory(rr, req)

			if rr.Code != 200 {
				t.Errorf("Expected status code 200, got %d", rr.Code)
				return
			}

			var response ListResponse
			err = json.Unmarshal(rr.Body.Bytes(), &response)
			if err != nil {
				t.Fatal("Failed to parse JSON response:", err)
			}

			if len(response.Files) == 0 {
				t.Error("Expected files in response")
				return
			}

			actualFirst := response.Files[0].Name
			if actualFirst != tt.firstFile {
				t.Errorf("Expected first file to be %s, got %s", tt.firstFile, actualFirst)
			}
		})
	}
}
