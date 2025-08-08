package buffer

import (
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestBufferAggregator_NewBufferAggregator(t *testing.T) {
	ba := NewBufferAggregator()
	
	if ba == nil {
		t.Fatal("NewBufferAggregator returned nil")
	}
	
	if ba.clients == nil {
		t.Error("clients map not initialized")
	}
	
	if ba.subscriptions == nil {
		t.Error("subscriptions map not initialized")
	}
	
	if ba.register == nil {
		t.Error("register channel not initialized")
	}
	
	if ba.unregister == nil {
		t.Error("unregister channel not initialized")
	}
	
	if ba.broadcast == nil {
		t.Error("broadcast channel not initialized")
	}
}

func TestBufferAggregator_WebSocketUpgrade(t *testing.T) {
	ba := NewBufferAggregator()
	
	// Start the aggregator in background
	go ba.Start()
	defer ba.Stop()
	
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	// Convert http:// to ws://
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	
	// Connect to WebSocket
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()
	
	// Should receive welcome message
	var welcome MessageType
	err = conn.ReadJSON(&welcome)
	if err != nil {
		t.Fatalf("Failed to read welcome message: %v", err)
	}
	
	if welcome.Type != "connected" {
		t.Errorf("Expected type 'connected', got %s", welcome.Type)
	}
	
	if welcome.Version != "1.0" {
		t.Errorf("Expected version '1.0', got %s", welcome.Version)
	}
}

func TestBufferAggregator_Subscribe(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()
	
	// Read welcome message
	var welcome MessageType
	conn.ReadJSON(&welcome)
	
	// Send subscription message
	subscribe := MessageType{
		Type:      "subscribe",
		SessionID: "test-session-123",
	}
	
	err = conn.WriteJSON(subscribe)
	if err != nil {
		t.Fatalf("Failed to send subscribe message: %v", err)
	}
	
	// Should receive subscription confirmation
	var response MessageType
	err = conn.ReadJSON(&response)
	if err != nil {
		t.Fatalf("Failed to read subscription response: %v", err)
	}
	
	if response.Type != "subscribed" {
		t.Errorf("Expected type 'subscribed', got %s", response.Type)
	}
	
	if response.SessionID != "test-session-123" {
		t.Errorf("Expected sessionId 'test-session-123', got %s", response.SessionID)
	}
}

func TestBufferAggregator_Unsubscribe(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()
	
	// Read welcome message
	var welcome MessageType
	conn.ReadJSON(&welcome)
	
	// Subscribe first
	subscribe := MessageType{
		Type:      "subscribe",
		SessionID: "test-session-123",
	}
	conn.WriteJSON(subscribe)
	
	// Read subscription confirmation
	var subscribed MessageType
	conn.ReadJSON(&subscribed)
	
	// Now unsubscribe
	unsubscribe := MessageType{
		Type:      "unsubscribe",
		SessionID: "test-session-123",
	}
	
	err = conn.WriteJSON(unsubscribe)
	if err != nil {
		t.Fatalf("Failed to send unsubscribe message: %v", err)
	}
	
	// Verify client was unsubscribed (check internal state)
	time.Sleep(100 * time.Millisecond) // Allow processing time
	
	ba.mu.RLock()
	sessionClients := ba.subscriptions["test-session-123"]
	ba.mu.RUnlock()
	
	if sessionClients != nil && len(sessionClients) > 0 {
		t.Error("Client should have been unsubscribed from session")
	}
}

func TestBufferAggregator_PingPong(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()
	
	// Read welcome message
	var welcome MessageType
	conn.ReadJSON(&welcome)
	
	// Send ping
	ping := MessageType{Type: "ping"}
	err = conn.WriteJSON(ping)
	if err != nil {
		t.Fatalf("Failed to send ping: %v", err)
	}
	
	// Should receive pong
	var pong MessageType
	err = conn.ReadJSON(&pong)
	if err != nil {
		t.Fatalf("Failed to read pong: %v", err)
	}
	
	if pong.Type != "pong" {
		t.Errorf("Expected type 'pong', got %s", pong.Type)
	}
}

func TestBufferAggregator_BroadcastBuffer(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()
	
	// Set binary message type
	conn.SetReadLimit(1024 * 1024)
	
	// Read welcome message
	var welcome MessageType
	conn.ReadJSON(&welcome)
	
	// Subscribe to session
	subscribe := MessageType{
		Type:      "subscribe",
		SessionID: "test-session-broadcast",
	}
	conn.WriteJSON(subscribe)
	
	// Read subscription confirmation
	var subscribed MessageType
	conn.ReadJSON(&subscribed)
	
	// Create test snapshot
	snapshot := TerminalSnapshot{
		Cols:      80,
		Rows:      24,
		ViewportY: 0,
		CursorX:   5,
		CursorY:   2,
		Cells: [][]BufferCell{
			{
				{Char: "H", FgColor: 7, BgColor: 0},
				{Char: "e", FgColor: 7, BgColor: 0},
				{Char: "l", FgColor: 7, BgColor: 0},
				{Char: "l", FgColor: 7, BgColor: 0},
				{Char: "o", FgColor: 7, BgColor: 0},
			},
		},
	}
	
	// Broadcast buffer update
	go func() {
		time.Sleep(50 * time.Millisecond) // Give time for subscription
		ba.BroadcastBuffer("test-session-broadcast", snapshot)
	}()
	
	// Read binary message
	messageType, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read broadcast message: %v", err)
	}
	
	if messageType != websocket.BinaryMessage {
		t.Errorf("Expected binary message, got type %d", messageType)
	}
	
	// Verify binary protocol format
	if len(data) < 5 {
		t.Fatal("Message too short")
	}
	
	// Check magic byte
	if data[0] != BufferMagicByte {
		t.Errorf("Expected magic byte 0x%02X, got 0x%02X", BufferMagicByte, data[0])
	}
	
	// Check session ID length
	sessionIDLength := binary.LittleEndian.Uint32(data[1:5])
	expectedSessionID := "test-session-broadcast"
	if sessionIDLength != uint32(len(expectedSessionID)) {
		t.Errorf("Expected session ID length %d, got %d", len(expectedSessionID), sessionIDLength)
	}
	
	// Check session ID
	if len(data) < 5+int(sessionIDLength) {
		t.Fatal("Message too short for session ID")
	}
	
	sessionID := string(data[5 : 5+sessionIDLength])
	if sessionID != expectedSessionID {
		t.Errorf("Expected session ID '%s', got '%s'", expectedSessionID, sessionID)
	}
	
	// Decode buffer data (JSON for now)
	bufferData := data[5+sessionIDLength:]
	var decodedSnapshot TerminalSnapshot
	err = json.Unmarshal(bufferData, &decodedSnapshot)
	if err != nil {
		t.Fatalf("Failed to decode buffer data: %v", err)
	}
	
	// Verify snapshot data
	if decodedSnapshot.Cols != snapshot.Cols {
		t.Errorf("Expected cols %d, got %d", snapshot.Cols, decodedSnapshot.Cols)
	}
	
	if decodedSnapshot.Rows != snapshot.Rows {
		t.Errorf("Expected rows %d, got %d", snapshot.Rows, decodedSnapshot.Rows)
	}
	
	if decodedSnapshot.CursorX != snapshot.CursorX {
		t.Errorf("Expected cursorX %d, got %d", snapshot.CursorX, decodedSnapshot.CursorX)
	}
	
	if decodedSnapshot.CursorY != snapshot.CursorY {
		t.Errorf("Expected cursorY %d, got %d", snapshot.CursorY, decodedSnapshot.CursorY)
	}
}

func TestBufferAggregator_MultipleClients(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	
	// Connect first client
	conn1, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect client 1: %v", err)
	}
	defer conn1.Close()
	
	// Connect second client
	conn2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect client 2: %v", err)
	}
	defer conn2.Close()
	
	// Read welcome messages
	var welcome1, welcome2 MessageType
	conn1.ReadJSON(&welcome1)
	conn2.ReadJSON(&welcome2)
	
	// Both clients subscribe to same session
	sessionID := "test-session-multi"
	subscribe := MessageType{
		Type:      "subscribe",
		SessionID: sessionID,
	}
	
	conn1.WriteJSON(subscribe)
	conn2.WriteJSON(subscribe)
	
	// Read subscription confirmations
	var sub1, sub2 MessageType
	conn1.ReadJSON(&sub1)
	conn2.ReadJSON(&sub2)
	
	// Broadcast buffer update
	snapshot := TerminalSnapshot{
		Cols:    80,
		Rows:    24,
		CursorX: 10,
		CursorY: 5,
	}
	
	go func() {
		time.Sleep(50 * time.Millisecond)
		ba.BroadcastBuffer(sessionID, snapshot)
	}()
	
	// Both clients should receive the update
	conn1.SetReadLimit(1024 * 1024)
	conn2.SetReadLimit(1024 * 1024)
	
	_, data1, err1 := conn1.ReadMessage()
	_, data2, err2 := conn2.ReadMessage()
	
	if err1 != nil {
		t.Errorf("Client 1 failed to read message: %v", err1)
	}
	
	if err2 != nil {
		t.Errorf("Client 2 failed to read message: %v", err2)
	}
	
	// Verify both received same data
	if len(data1) != len(data2) {
		t.Error("Clients received different message lengths")
	}
	
	for i := range data1 {
		if data1[i] != data2[i] {
			t.Error("Clients received different message data")
			break
		}
	}
}

func TestBufferAggregator_ClientDisconnection(t *testing.T) {
	ba := NewBufferAggregator()
	go ba.Start()
	defer ba.Stop()
	
	server := httptest.NewServer(http.HandlerFunc(ba.HandleWebSocket))
	defer server.Close()
	
	wsURL := strings.Replace(server.URL, "http://", "ws://", 1)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	
	// Read welcome message
	var welcome MessageType
	conn.ReadJSON(&welcome)
	
	// Subscribe to session
	subscribe := MessageType{
		Type:      "subscribe",
		SessionID: "test-session-disconnect",
	}
	conn.WriteJSON(subscribe)
	
	// Read subscription confirmation
	var subscribed MessageType
	conn.ReadJSON(&subscribed)
	
	// Verify client is registered
	ba.mu.RLock()
	clientCount := len(ba.clients)
	sessionClients := ba.subscriptions["test-session-disconnect"]
	ba.mu.RUnlock()
	
	if clientCount != 1 {
		t.Errorf("Expected 1 client, got %d", clientCount)
	}
	
	if sessionClients == nil || len(sessionClients) != 1 {
		t.Error("Client not properly subscribed to session")
	}
	
	// Disconnect client
	conn.Close()
	
	// Give time for cleanup
	time.Sleep(100 * time.Millisecond)
	
	// Verify client is unregistered
	ba.mu.RLock()
	clientCountAfter := len(ba.clients)
	sessionClientsAfter := ba.subscriptions["test-session-disconnect"]
	ba.mu.RUnlock()
	
	if clientCountAfter != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", clientCountAfter)
	}
	
	if sessionClientsAfter != nil && len(sessionClientsAfter) > 0 {
		t.Error("Client subscription not cleaned up after disconnect")
	}
}