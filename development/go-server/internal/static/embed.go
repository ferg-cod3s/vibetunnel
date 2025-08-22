package static

import (
	"embed"
	"io/fs"
	"net/http"
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
	return http.FileServer(fileSystem), nil
}