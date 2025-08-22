package websocket

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ferg-cod3s/tunnelforge/go-server/internal/session"
	"github.com/ferg-cod3s/tunnelforge/go-server/pkg/types"
)

func TestWebSocket_OriginDisallowed(t *testing.T) {
	sm := session.NewManager()
	h := NewHandler(sm)
	h.SetAllowedOrigins([]string{"http://allowed.com"})

	// Create a test session
	s, err := sm.Create(&types.SessionCreateRequest{Command: "sleep 1", Title: "t"})
	require.NoError(t, err)

	ts := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "?sessionId=" + s.ID
	headers := http.Header{}
	headers.Set("Origin", "http://evil.com")

	_, _, err = websocket.DefaultDialer.Dial(wsURL, headers)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bad handshake")
}

func TestWebSocket_OriginAllowed(t *testing.T) {
	sm := session.NewManager()
	h := NewHandler(sm)
	h.SetAllowedOrigins([]string{"http://allowed.com"})

	// Create a test session
	s, err := sm.Create(&types.SessionCreateRequest{Command: "sleep 1", Title: "t"})
	require.NoError(t, err)

	ts := httptest.NewServer(http.HandlerFunc(h.HandleWebSocket))
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "?sessionId=" + s.ID
	headers := http.Header{}
	headers.Set("Origin", "http://allowed.com")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	require.NoError(t, err)
	assert.NotNil(t, conn)
	conn.Close()
}
