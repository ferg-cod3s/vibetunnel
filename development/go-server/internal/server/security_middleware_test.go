package server

import (
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSecurityHeadersAndGzipMiddleware(t *testing.T) {
	srv, err := New(&Config{Port: "0"})
	require.NoError(t, err)

	// Ensure routes and middleware are initialized
	srv.setupRoutes()

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// 1) Security headers present on /health
	resp, err := http.Get(ts.URL + "/health")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
	assert.Equal(t, "DENY", resp.Header.Get("X-Frame-Options"))
	assert.NotEmpty(t, resp.Header.Get("Content-Security-Policy"))
	assert.Equal(t, "same-origin", resp.Header.Get("Cross-Origin-Opener-Policy"))
	assert.Equal(t, "require-corp", resp.Header.Get("Cross-Origin-Embedder-Policy"))

	// 2) Gzip compression when requested
	req, _ := http.NewRequest("GET", ts.URL+"/health", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	resp2, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp2.Body.Close()

	assert.Equal(t, "gzip", resp2.Header.Get("Content-Encoding"))

	// Attempt to decode gzip and ensure JSON parses
	gzr, err := gzip.NewReader(resp2.Body)
	require.NoError(t, err)
	defer gzr.Close()
	b, err := io.ReadAll(gzr)
	require.NoError(t, err)
	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal(b, &payload))
	assert.Equal(t, "ok", payload["status"])
}

func TestHealthUptimeIncreases(t *testing.T) {
	srv, err := New(&Config{Port: "0"})
	require.NoError(t, err)
	srv.setupRoutes()

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// First request
	resp1, err := http.Get(ts.URL + "/health")
	require.NoError(t, err)
	defer resp1.Body.Close()
	var p1 map[string]interface{}
	require.NoError(t, json.NewDecoder(resp1.Body).Decode(&p1))
	uptime1, _ := p1["uptime"].(string)
	assert.NotEmpty(t, uptime1)
	assert.NotEqual(t, "0s", uptime1)

	// Wait and check increases
	time.Sleep(50 * time.Millisecond)

	resp2, err := http.Get(ts.URL + "/health")
	require.NoError(t, err)
	defer resp2.Body.Close()
	var p2 map[string]interface{}
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&p2))
	uptime2, _ := p2["uptime"].(string)
	assert.NotEmpty(t, uptime2)
	assert.NotEqual(t, uptime1, uptime2)
}
