package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// HTTP Test configuration
type HTTPConfig struct {
	ServerURL      string
	MaxConcurrent  int
	TotalRequests  int
	RequestsPerSec int
}

// HTTP Test statistics
type HTTPStats struct {
	TotalRequests     int64
	SuccessfulReqs    int64
	FailedReqs        int64
	TotalResponseTime int64 // nanoseconds
	MinResponseTime   int64 // nanoseconds
	MaxResponseTime   int64 // nanoseconds
	StatusCodes       map[int]int64
	mutex             sync.Mutex
}

// Session create request
type CreateSessionReq struct {
	Command string `json:"command,omitempty"`
	Title   string `json:"title,omitempty"`
	Cols    int    `json:"cols,omitempty"`
	Rows    int    `json:"rows,omitempty"`
}

func main() {
	// Parse command line flags
	var (
		serverURL      = flag.String("url", "http://localhost:4021", "Server URL")
		maxConcurrent  = flag.Int("concurrent", 50, "Maximum concurrent requests")
		totalRequests  = flag.Int("requests", 1000, "Total number of requests")
		requestsPerSec = flag.Int("rps", 100, "Requests per second")
	)
	flag.Parse()

	config := HTTPConfig{
		ServerURL:      *serverURL,
		MaxConcurrent:  *maxConcurrent,
		TotalRequests:  *totalRequests,
		RequestsPerSec: *requestsPerSec,
	}

	fmt.Printf("🚀 HTTP API Load Test Configuration:\n")
	fmt.Printf("   Server URL: %s\n", config.ServerURL)
	fmt.Printf("   Total Requests: %d\n", config.TotalRequests)
	fmt.Printf("   Max Concurrent: %d\n", config.MaxConcurrent)
	fmt.Printf("   Target RPS: %d\n", config.RequestsPerSec)
	fmt.Printf("\n")

	// Run different endpoint tests
	fmt.Printf("📋 Testing different endpoints...\n\n")

	// Test 1: Session creation (POST)
	fmt.Printf("🔧 Test 1: Session Creation (POST /api/sessions)\n")
	sessionStats := runSessionCreateTest(config)
	printHTTPResults("Session Creation", sessionStats, config)

	// Test 2: Session listing (GET)
	fmt.Printf("\n🔍 Test 2: Session Listing (GET /api/sessions)\n")
	listStats := runSessionListTest(config)
	printHTTPResults("Session Listing", listStats, config)

	// Test 3: Health check (GET)
	fmt.Printf("\n❤️ Test 3: Health Check (GET /api/health)\n")
	healthStats := runHealthCheckTest(config)
	printHTTPResults("Health Check", healthStats, config)
}

func runSessionCreateTest(config HTTPConfig) *HTTPStats {
	stats := &HTTPStats{
		StatusCodes:     make(map[int]int64),
		MinResponseTime: int64(^uint64(0) >> 1), // Max int64
	}

	// Prepare request body
	reqBody := CreateSessionReq{
		Command: "bash",
		Title:   "Load Test Session",
		Cols:    80,
		Rows:    24,
	}
	jsonBody, _ := json.Marshal(reqBody)

	return runHTTPTest(config, "POST", "/api/sessions", bytes.NewReader(jsonBody), stats)
}

func runSessionListTest(config HTTPConfig) *HTTPStats {
	stats := &HTTPStats{
		StatusCodes:     make(map[int]int64),
		MinResponseTime: int64(^uint64(0) >> 1), // Max int64
	}

	return runHTTPTest(config, "GET", "/api/sessions", nil, stats)
}

func runHealthCheckTest(config HTTPConfig) *HTTPStats {
	stats := &HTTPStats{
		StatusCodes:     make(map[int]int64),
		MinResponseTime: int64(^uint64(0) >> 1), // Max int64
	}

	return runHTTPTest(config, "GET", "/api/health", nil, stats)
}

func runHTTPTest(config HTTPConfig, method, endpoint string, body io.Reader, stats *HTTPStats) *HTTPStats {
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, config.MaxConcurrent)

	// Calculate request interval for rate limiting
	interval := time.Second / time.Duration(config.RequestsPerSec)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	startTime := time.Now()

	// Send requests
	for i := 0; i < config.TotalRequests; i++ {
		<-ticker.C              // Rate limiting
		semaphore <- struct{}{} // Concurrency limiting

		wg.Add(1)
		go func(reqNum int) {
			defer wg.Done()
			defer func() { <-semaphore }()

			makeHTTPRequest(config.ServerURL, method, endpoint, body, stats)
		}(i)
	}

	wg.Wait()

	duration := time.Since(startTime)
	actualRPS := float64(config.TotalRequests) / duration.Seconds()

	fmt.Printf("   ⏱️  Completed %d requests in %v (%.1f RPS)\n",
		config.TotalRequests, duration, actualRPS)

	return stats
}

func makeHTTPRequest(serverURL, method, endpoint string, body io.Reader, stats *HTTPStats) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Reset body reader for each request
	var reqBody io.Reader
	if body != nil {
		// For simplicity, we'll recreate the body each time
		// In a real test, you'd want to handle this more efficiently
func makeHTTPRequest(serverURL, method, endpoint string, bodyFactory func() io.Reader, stats *HTTPStats) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Create a fresh body reader for each request
	var reqBody io.Reader
	if bodyFactory != nil {
		reqBody = bodyFactory()
	}

	url := serverURL + endpoint
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		atomic.AddInt64(&stats.FailedReqs, 1)
		return
	}

	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	start := time.Now()
	resp, err := client.Do(req)
	responseTime := time.Since(start).Nanoseconds()

	atomic.AddInt64(&stats.TotalRequests, 1)
	atomic.AddInt64(&stats.TotalResponseTime, responseTime)

	if err != nil {
		atomic.AddInt64(&stats.FailedReqs, 1)
		return
	}
	defer resp.Body.Close()

	// Read response body to ensure complete request
	io.ReadAll(resp.Body)

	atomic.AddInt64(&stats.SuccessfulReqs, 1)

	// Update status code count
	stats.mutex.Lock()
	stats.StatusCodes[resp.StatusCode]++
	stats.mutex.Unlock()

	// Update min/max response times
	for {
		currentMin := atomic.LoadInt64(&stats.MinResponseTime)
		if responseTime >= currentMin || atomic.CompareAndSwapInt64(&stats.MinResponseTime, currentMin, responseTime) {
			break
		}
	}

	for {
		currentMax := atomic.LoadInt64(&stats.MaxResponseTime)
		if responseTime <= currentMax || atomic.CompareAndSwapInt64(&stats.MaxResponseTime, currentMax, responseTime) {
			break
		}
	}
}

func printHTTPResults(testName string, stats *HTTPStats, config HTTPConfig) {
	fmt.Printf("   📊 %s Results:\n", testName)

	totalReqs := atomic.LoadInt64(&stats.TotalRequests)
	successReqs := atomic.LoadInt64(&stats.SuccessfulReqs)
	failedReqs := atomic.LoadInt64(&stats.FailedReqs)

	fmt.Printf("      Total Requests: %d\n", totalReqs)
	fmt.Printf("      ✅ Successful: %d (%.2f%%)\n",
		successReqs, float64(successReqs)/float64(totalReqs)*100)
	fmt.Printf("      ❌ Failed: %d (%.2f%%)\n",
		failedReqs, float64(failedReqs)/float64(totalReqs)*100)

	// Response time stats
	if successReqs > 0 {
		avgResponseTime := atomic.LoadInt64(&stats.TotalResponseTime) / successReqs
		minResponseTime := atomic.LoadInt64(&stats.MinResponseTime)
		maxResponseTime := atomic.LoadInt64(&stats.MaxResponseTime)

		fmt.Printf("      📏 Response Times:\n")
		fmt.Printf("         Average: %v\n", time.Duration(avgResponseTime))
		fmt.Printf("         Min: %v\n", time.Duration(minResponseTime))
		fmt.Printf("         Max: %v\n", time.Duration(maxResponseTime))

		// Performance targets
		if avgResponseTime < int64(50*time.Millisecond) {
			fmt.Printf("      🎯 ✅ Target <50ms average: ACHIEVED\n")
		} else {
			fmt.Printf("      🎯 ❌ Target <50ms average: MISSED\n")
		}

		if maxResponseTime < int64(200*time.Millisecond) {
			fmt.Printf("      🎯 ✅ Target <200ms max: ACHIEVED\n")
		} else {
			fmt.Printf("      🎯 ❌ Target <200ms max: MISSED\n")
		}
	}

	// Status code breakdown
	fmt.Printf("      📋 Status Codes:\n")
	stats.mutex.Lock()
	for code, count := range stats.StatusCodes {
		fmt.Printf("         %d: %d requests\n", code, count)
	}
	stats.mutex.Unlock()
}
