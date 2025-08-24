package static

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed public/*
var staticFiles embed.FS

// GetStaticFileSystem returns the embedded static file system
func GetStaticFileSystem() (http.FileSystem, error) {
	// Get the public subdirectory from the embedded files
	publicFS, err := fs.Sub(staticFiles, "public")
	if err != nil {
		return nil, err
	}
	return http.FS(publicFS), nil
}

// GetStaticHandler returns an HTTP handler for static files
func GetStaticHandler() (http.Handler, error) {
	fileSystem, err := GetStaticFileSystem()
	if err != nil {
		return nil, err
	}
	
	// Get the embedded public FS directly for special handling
	publicFS, err := fs.Sub(staticFiles, "public")
	if err != nil {
		return nil, err
	}
	
	// Create custom handler
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Handle root path specially
		if r.URL.Path == "/" {
			// Open index.html directly from embedded FS
			file, err := publicFS.Open("index.html")
			if err == nil {
				defer file.Close()
				
				// Get file info for headers
				stat, err := file.Stat()
				if err == nil {
					// Set content type
					w.Header().Set("Content-Type", "text/html; charset=utf-8")
					// Serve the file
					http.ServeContent(w, r, "index.html", stat.ModTime(), file.(io.ReadSeeker))
					return
				}
			}
		}
		
		// For all other paths, use the regular file server
		// But strip any trailing slashes to avoid directory listing redirects
		path := strings.TrimSuffix(r.URL.Path, "/")
		if path != r.URL.Path {
			r.URL.Path = path
		}
		
		http.FileServer(fileSystem).ServeHTTP(w, r)
	}), nil
}
