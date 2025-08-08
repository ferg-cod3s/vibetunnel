package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Test configuration
type Config struct {
	ServerURL      string
	MaxConnections int
	Duration       time.Duration
	RampUpTime     time.Duration
}

// Test statistics
type Stats struct {
	ConnectionsCreated  int64
	ConnectionsFailed   int64
	MessagesReceived    int64
	MessagesSent        int64
	ErrorsEncountered   int64
	TotalResponseTime   int64 // nanoseconds
	MaxResponseTime     int64 // nanoseconds
}

// Session creation request
type SessionCreateRequest struct {
	Command string `json:"command,omitempty"`
	Title   string `json:"title,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
}

// Session response
type SessionResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Command   string    `json:"command"`
	CreatedAt time.Time `json:"createdAt"`
}

func main() {
	// Parse command line flags
	var (
		serverURL      = flag.String("url", "http://localhost:4021", "Server URL")
		maxConnections = flag.Int("connections", 100, "Maximum concurrent connections")
		duration       = flag.Duration("duration", 30*time.Second, "Test duration")
		rampUpTime     = flag.Duration("rampup", 10*time.Second, "Ramp-up time")
	)
	flag.Parse()

	config := Config{
		ServerURL:      *serverURL,
		MaxConnections: *maxConnections,
		Duration:       *duration,
		RampUpTime:     *rampUpTime,
	}

	fmt.Printf("🚀 WebSocket Load Test Configuration:\n")
	fmt.Printf("   Server URL: %s\n", config.ServerURL)
	fmt.Printf("   Max Connections: %d\n", config.MaxConnections)
	fmt.Printf("   Duration: %v\n", config.Duration)
	fmt.Printf("   Ramp-up Time: %v\n", config.RampUpTime)
	fmt.Printf("\n")

	// Run the load test
	stats := runLoadTest(config)

	// Print results
	printResults(stats, config)
}

func runLoadTest(config Config) *Stats {
	stats := &Stats{}
	var wg sync.WaitGroup

	// Calculate connection spawn interval
	spawnInterval := config.RampUpTime / time.Duration(config.MaxConnections)

	fmt.Printf("⏱️  Starting load test (spawning connection every %v)...\n", spawnInterval)
	startTime := time.Now()

	// Spawn connections gradually
	for i := 0; i < config.MaxConnections; i++ {
		wg.Add(1)
		go func(connID int) {
			defer wg.Done()
			runWebSocketConnection(connID, config, stats, startTime)
		}(i)

		// Wait before spawning next connection
		if i < config.MaxConnections-1 {
			time.Sleep(spawnInterval)
		}
	}

	// Wait for all connections to finish
	wg.Wait()
	return stats
}

func runWebSocketConnection(connID int, config Config, stats *Stats, testStartTime time.Time) {
	// First, create a session via REST API
	sessionID, err := createSession(config.ServerURL)
	if err != nil {
		atomic.AddInt64(&stats.ConnectionsFailed, 1)
		log.Printf("Connection %d: Failed to create session: %v", connID, err)
		return
	}

	// Connect to WebSocket
	wsURL := fmt.Sprintf("ws://localhost:4021/ws?sessionId=%s", sessionID)
	u, err := url.Parse(wsURL)
	if err != nil {
		atomic.AddInt64(&stats.ConnectionsFailed, 1)
		log.Printf("Connection %d: Invalid WebSocket URL: %v", connID, err)
		return
	}

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		atomic.AddInt64(&stats.ConnectionsFailed, 1)
		log.Printf("Connection %d: Failed to connect: %v", connID, err)
		return
	}
	defer conn.Close()

	atomic.AddInt64(&stats.ConnectionsCreated, 1)

	// Calculate remaining test time
	elapsed := time.Since(testStartTime)
	remainingTime := config.Duration - elapsed
	if remainingTime <= 0 {
		return
	}

	// Set up message handling
	done := make(chan struct{})

	// Read messages
	go func() {
		defer close(done)
		for {
			messageStart := time.Now()
			_, _, err := conn.ReadMessage()
			if err != nil {
				if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					atomic.AddInt64(&stats.ErrorsEncountered, 1)
				}
				return
			}
			
			// Record response time
			respTime := time.Since(messageStart).Nanoseconds()
			atomic.AddInt64(&stats.MessagesReceived, 1)
			atomic.AddInt64(&stats.TotalResponseTime, respTime)
			
			// Update max response time
			for {
				currentMax := atomic.LoadInt64(&stats.MaxResponseTime)
				if respTime <= currentMax || atomic.CompareAndSwapInt64(&stats.MaxResponseTime, currentMax, respTime) {
					break
				}
			}
		}
	}()

	// Send periodic messages
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	timeout := time.After(remainingTime)

	for {
		select {
		case <-done:
			return
		case <-timeout:
			return
		case <-ticker.C:
			// Send a simple input message
			message := "echo 'load test message'\n"
			err := conn.WriteMessage(websocket.TextMessage, []byte(message))
			if err != nil {
				atomic.AddInt64(&stats.ErrorsEncountered, 1)
				return
			}
			atomic.AddInt64(&stats.MessagesSent, 1)
		}
	}
}

func createSession(serverURL string) (string, error) {
	// Create actual session via API
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Prepare session creation request
	reqBody := SessionCreateRequest{
		Command: "bash",
		Title:   "Load Test Session",
		Cols:    80,
		Rows:    24,
	}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %v", err)
	}

	// Make POST request to create session
	resp, err := client.Post(serverURL+"/api/sessions", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create session: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("session creation failed with status %d: %s", resp.StatusCode, body)
	}

	// Parse response
	var sessionResp SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&sessionResp); err != nil {
		return "", fmt.Errorf("failed to decode session response: %v", err)
	}

	return sessionResp.ID, nil
}

func printResults(stats *Stats, config Config) {
	fmt.Printf("\n📊 Load Test Results:\n")
	fmt.Printf("════════════════════════════════════════\n")
	fmt.Printf("Configuration:\n")
	fmt.Printf("  Target Connections: %d\n", config.MaxConnections)
	fmt.Printf("  Test Duration: %v\n", config.Duration)
	fmt.Printf("\n")
	fmt.Printf("Connection Stats:\n")
	fmt.Printf("  ✅ Successful Connections: %d\n", atomic.LoadInt64(&stats.ConnectionsCreated))
	fmt.Printf("  ❌ Failed Connections: %d\n", atomic.LoadInt64(&stats.ConnectionsFailed))
	fmt.Printf("  📊 Success Rate: %.2f%%\n", 
		float64(atomic.LoadInt64(&stats.ConnectionsCreated))/float64(config.MaxConnections)*100)
	fmt.Printf("\n")
	fmt.Printf("Message Stats:\n")
	fmt.Printf("  📤 Messages Sent: %d\n", atomic.LoadInt64(&stats.MessagesSent))
	fmt.Printf("  📥 Messages Received: %d\n", atomic.LoadInt64(&stats.MessagesReceived))
	fmt.Printf("  ⚠️  Errors: %d\n", atomic.LoadInt64(&stats.ErrorsEncountered))

	// Response time stats
	totalMessages := atomic.LoadInt64(&stats.MessagesReceived)
	if totalMessages > 0 {
		avgResponseTime := atomic.LoadInt64(&stats.TotalResponseTime) / totalMessages
		maxResponseTime := atomic.LoadInt64(&stats.MaxResponseTime)
		
		fmt.Printf("\n")
		fmt.Printf("Performance Stats:\n")
		fmt.Printf("  📏 Average Response Time: %v\n", time.Duration(avgResponseTime))
		fmt.Printf("  🔝 Max Response Time: %v\n", time.Duration(maxResponseTime))
		
		// Performance evaluation
		if avgResponseTime < int64(10*time.Millisecond) {
			fmt.Printf("  🎯 ✅ Target <10ms average response time: ACHIEVED\n")
		} else {
			fmt.Printf("  🎯 ❌ Target <10ms average response time: MISSED\n")
		}
	}

	// Connection evaluation
	successfulConnections := atomic.LoadInt64(&stats.ConnectionsCreated)
	if successfulConnections >= int64(config.MaxConnections) {
		fmt.Printf("  🔗 ✅ Target %d concurrent connections: ACHIEVED\n", config.MaxConnections)
	} else {
		fmt.Printf("  🔗 ❌ Target %d concurrent connections: MISSED (got %d)\n", 
			config.MaxConnections, successfulConnections)
	}

	fmt.Printf("\n")
}
