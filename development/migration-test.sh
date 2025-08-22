#!/bin/bash

# VibeTunnel Migration Testing Script
# Tests feature parity between Node.js and Go servers

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GO_SERVER_PORT=4021
NODE_SERVER_PORT=4020
BUN_WEB_PORT=3000
TEST_TIMEOUT=30
LOG_FILE="/tmp/vibetunnel-migration-test.log"

# Test Results
TESTS_PASSED=0
TESTS_FAILED=0
FEATURE_PARITY_SCORE=0

# Server PIDs for cleanup
GO_SERVER_PID=""
NODE_SERVER_PID=""
BUN_WEB_PID=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up servers...${NC}"
    
    if [[ -n "$GO_SERVER_PID" ]] && kill -0 "$GO_SERVER_PID" 2>/dev/null; then
        kill "$GO_SERVER_PID" || true
        echo "Stopped Go server (PID: $GO_SERVER_PID)"
    fi
    
    if [[ -n "$NODE_SERVER_PID" ]] && kill -0 "$NODE_SERVER_PID" 2>/dev/null; then
        kill "$NODE_SERVER_PID" || true
        echo "Stopped Node.js server (PID: $NODE_SERVER_PID)"
    fi
    
    if [[ -n "$BUN_WEB_PID" ]] && kill -0 "$BUN_WEB_PID" 2>/dev/null; then
        kill "$BUN_WEB_PID" || true
        echo "Stopped Bun web server (PID: $BUN_WEB_PID)"
    fi
    
    # Kill any remaining processes
    pkill -f "vibetunnel-server" || true
    pkill -f "go run.*server" || true
    pkill -f "pnpm run dev" || true
    pkill -f "bun run dev" || true
    
    wait 2>/dev/null || true
}

# Set up trap for cleanup
trap cleanup EXIT INT TERM

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
    echo -e "$1"
}

test_passed() {
    ((TESTS_PASSED++))
    log "${GREEN}✓ $1${NC}"
}

test_failed() {
    ((TESTS_FAILED++))
    log "${RED}✗ $1${NC}"
}

wait_for_server() {
    local port=$1
    local server_name=$2
    local max_attempts=30
    
    log "${BLUE}Waiting for $server_name on port $port...${NC}"
    
    for i in $(seq 1 $max_attempts); do
        if curl -s -f "http://localhost:$port/health" >/dev/null 2>&1; then
            log "${GREEN}$server_name is ready on port $port${NC}"
            return 0
        fi
        sleep 1
    done
    
    log "${RED}$server_name failed to start on port $port${NC}"
    return 1
}

start_go_server() {
    log "${BLUE}Starting Go server...${NC}"
    cd go-server
    
    # Build the server first
    if ! go build -o vibetunnel-server cmd/server/main.go; then
        log "${RED}Failed to build Go server${NC}"
        return 1
    fi
    
    # Start the server in background
    ./vibetunnel-server --port="$GO_SERVER_PORT" >> "$LOG_FILE" 2>&1 &
    GO_SERVER_PID=$!
    
    cd ..
    wait_for_server "$GO_SERVER_PORT" "Go server"
}

start_node_server() {
    log "${BLUE}Starting Node.js server...${NC}"
    cd ../web
    
    # Check if pnpm is available and dependencies are installed
    if ! command -v pnpm >/dev/null 2>&1; then
        log "${RED}pnpm not found. Please install pnpm first.${NC}"
        return 1
    fi
    
    # Install dependencies if needed
    if [[ ! -d node_modules ]]; then
        log "${BLUE}Installing Node.js dependencies...${NC}"
        pnpm install
    fi
    
    # Start Node.js server
    PORT="$NODE_SERVER_PORT" pnpm start >> "$LOG_FILE" 2>&1 &
    NODE_SERVER_PID=$!
    
    cd ../Development
    wait_for_server "$NODE_SERVER_PORT" "Node.js server"
}

start_bun_web() {
    log "${BLUE}Starting Bun web server...${NC}"
    cd bun-web
    
    # Check if bun is available
    if ! command -v bun >/dev/null 2>&1; then
        log "${RED}Bun not found. Please install Bun first.${NC}"
        return 1
    fi
    
    # Install dependencies if needed
    if [[ ! -d node_modules ]]; then
        log "${BLUE}Installing Bun dependencies...${NC}"
        bun install
    fi
    
    # Start Bun web server
    PORT="$BUN_WEB_PORT" GO_SERVER_URL="http://localhost:$GO_SERVER_PORT" bun run dev >> "$LOG_FILE" 2>&1 &
    BUN_WEB_PID=$!
    
    cd ..
    wait_for_server "$BUN_WEB_PORT" "Bun web server"
}

test_health_endpoints() {
    log "\n${BLUE}=== Testing Health Endpoints ===${NC}"
    
    # Test Go server health
    if curl -s -f "http://localhost:$GO_SERVER_PORT/health" | grep -q "\"status\":\"ok\""; then
        test_passed "Go server health endpoint"
    else
        test_failed "Go server health endpoint"
    fi
    
    # Test Node.js server health (if running)
    if [[ -n "$NODE_SERVER_PID" ]] && kill -0 "$NODE_SERVER_PID" 2>/dev/null; then
        if curl -s -f "http://localhost:$NODE_SERVER_PORT/health" | grep -q "status"; then
            test_passed "Node.js server health endpoint"
        else
            test_failed "Node.js server health endpoint"
        fi
    fi
    
    # Test Bun web proxy health
    if curl -s -f "http://localhost:$BUN_WEB_PORT/api/health" | grep -q "\"status\":\"ok\""; then
        test_passed "Bun web proxy health endpoint"
    else
        test_failed "Bun web proxy health endpoint"
    fi
}

test_api_endpoints() {
    log "\n${BLUE}=== Testing API Endpoints ===${NC}"
    
    # Test server config endpoint
    if curl -s -f "http://localhost:$GO_SERVER_PORT/api/config" | grep -q "serverName"; then
        test_passed "Go server config endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Go server config endpoint"
    fi
    
    # Test auth config endpoint
    if curl -s -f "http://localhost:$GO_SERVER_PORT/api/auth/config" | grep -q "authRequired"; then
        test_passed "Go server auth config endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Go server auth config endpoint"
    fi
    
    # Test sessions endpoint
    if curl -s -f "http://localhost:$GO_SERVER_PORT/api/sessions" | grep -q "sessions"; then
        test_passed "Go server sessions endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Go server sessions endpoint"
    fi
    
    # Test events endpoint (SSE)
    if timeout 5 curl -s "http://localhost:$GO_SERVER_PORT/api/events" | head -n 1 | grep -q "event:"; then
        test_passed "Go server SSE events endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Go server SSE events endpoint"
    fi
}

test_push_notifications() {
    log "\n${BLUE}=== Testing Push Notifications ===${NC}"
    
    # Test VAPID key endpoint
    if curl -s -f "http://localhost:$GO_SERVER_PORT/api/push/vapid-key" | grep -q "publicKey"; then
        test_passed "Push notification VAPID key endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Push notification VAPID key endpoint"
    fi
}

test_filesystem_api() {
    log "\n${BLUE}=== Testing Filesystem API ===${NC}"
    
    # Test filesystem ls endpoint
    if curl -s -f "http://localhost:$GO_SERVER_PORT/api/filesystem/ls?path=/tmp" | grep -q "files"; then
        test_passed "Filesystem ls endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Filesystem ls endpoint"
    fi
}

test_git_api() {
    log "\n${BLUE}=== Testing Git API ===${NC}"
    
    # Test git status endpoint (if in a git repo)
    if curl -s "http://localhost:$GO_SERVER_PORT/api/git/status?path=." | grep -q -E "(branch|clean|modified)"; then
        test_passed "Git status endpoint"
        ((FEATURE_PARITY_SCORE++))
    else
        log "${YELLOW}⚠ Git status endpoint (may not be in git repo)${NC}"
    fi
}

test_websocket_connections() {
    log "\n${BLUE}=== Testing WebSocket Connections ===${NC}"
    
    # Create a test session first
    SESSION_RESPONSE=$(curl -s -X POST "http://localhost:$GO_SERVER_PORT/api/sessions" \
        -H "Content-Type: application/json" \
        -d '{"title":"migration-test","command":"echo test","cols":80,"rows":24}')
    
    if echo "$SESSION_RESPONSE" | grep -q "\"id\""; then
        SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        test_passed "Session creation for WebSocket test"
        
        # Test WebSocket endpoint availability (we can't easily test actual WebSocket in bash)
        if nc -z localhost "$GO_SERVER_PORT"; then
            test_passed "WebSocket port accessibility"
            ((FEATURE_PARITY_SCORE++))
        else
            test_failed "WebSocket port accessibility"
        fi
        
        # Clean up test session
        curl -s -X DELETE "http://localhost:$GO_SERVER_PORT/api/sessions/$SESSION_ID" >/dev/null 2>&1 || true
    else
        test_failed "Session creation for WebSocket test"
    fi
}

test_security_features() {
    log "\n${BLUE}=== Testing Security Features ===${NC}"
    
    # Test CORS headers
    CORS_RESPONSE=$(curl -s -I "http://localhost:$GO_SERVER_PORT/api/config")
    if echo "$CORS_RESPONSE" | grep -qi "access-control-allow-origin"; then
        test_passed "CORS headers present"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "CORS headers present"
    fi
    
    # Test security headers
    if echo "$CORS_RESPONSE" | grep -qi "content-security-policy"; then
        test_passed "Security headers present"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Security headers present"
    fi
}

test_authentication() {
    log "\n${BLUE}=== Testing Authentication ===${NC}"
    
    # Test login endpoint (should require password)
    LOGIN_RESPONSE=$(curl -s -w "%{http_code}" -X POST "http://localhost:$GO_SERVER_PORT/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"password":"wrong-password"}')
    
    if echo "$LOGIN_RESPONSE" | grep -q "401"; then
        test_passed "Authentication requires valid credentials"
        ((FEATURE_PARITY_SCORE++))
    else
        test_failed "Authentication requires valid credentials"
    fi
}

compare_response_times() {
    log "\n${BLUE}=== Comparing Response Times ===${NC}"
    
    # Measure Go server response time
    GO_TIME=$(curl -s -w "%{time_total}" -o /dev/null "http://localhost:$GO_SERVER_PORT/api/config")
    log "Go server response time: ${GO_TIME}s"
    
    # Compare with Node.js server if running
    if [[ -n "$NODE_SERVER_PID" ]] && kill -0 "$NODE_SERVER_PID" 2>/dev/null; then
        NODE_TIME=$(curl -s -w "%{time_total}" -o /dev/null "http://localhost:$NODE_SERVER_PORT/api/config" 2>/dev/null || echo "N/A")
        log "Node.js server response time: ${NODE_TIME}s"
        
        if [[ "$NODE_TIME" != "N/A" ]] && (( $(echo "$GO_TIME <= $NODE_TIME" | bc -l) )); then
            test_passed "Go server performance equal or better than Node.js"
            ((FEATURE_PARITY_SCORE++))
        else
            test_failed "Go server performance vs Node.js"
        fi
    fi
}

generate_report() {
    log "\n${BLUE}=== Migration Test Report ===${NC}"
    
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_rate=0
    
    if [[ $total_tests -gt 0 ]]; then
        pass_rate=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    log "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    log "Tests Failed: ${RED}$TESTS_FAILED${NC}"
    log "Pass Rate: ${BLUE}${pass_rate}%${NC}"
    log "Feature Parity Score: ${YELLOW}${FEATURE_PARITY_SCORE}/15${NC}"
    
    if [[ $FEATURE_PARITY_SCORE -ge 12 ]]; then
        log "${GREEN}🎉 EXCELLENT: Go server has excellent feature parity! Ready for production migration.${NC}"
    elif [[ $FEATURE_PARITY_SCORE -ge 10 ]]; then
        log "${YELLOW}⚠️  GOOD: Go server has good feature parity. Minor issues to address.${NC}"
    elif [[ $FEATURE_PARITY_SCORE -ge 7 ]]; then
        log "${YELLOW}⚠️  FAIR: Go server has fair feature parity. Several issues to address.${NC}"
    else
        log "${RED}❌ POOR: Go server needs significant work before migration.${NC}"
    fi
    
    # Save detailed report
    {
        echo "# VibeTunnel Migration Test Report"
        echo "Generated: $(date)"
        echo ""
        echo "## Summary"
        echo "- Tests Passed: $TESTS_PASSED"
        echo "- Tests Failed: $TESTS_FAILED"
        echo "- Pass Rate: ${pass_rate}%"
        echo "- Feature Parity Score: ${FEATURE_PARITY_SCORE}/15"
        echo ""
        echo "## Server Status"
        echo "- Go Server: http://localhost:$GO_SERVER_PORT"
        echo "- Node.js Server: http://localhost:$NODE_SERVER_PORT"
        echo "- Bun Web Server: http://localhost:$BUN_WEB_PORT"
        echo ""
        echo "## Logs"
        echo "See: $LOG_FILE"
    } > "/tmp/vibetunnel-migration-report.md"
    
    log "\n${BLUE}Report saved to: /tmp/vibetunnel-migration-report.md${NC}"
    log "${BLUE}Logs saved to: $LOG_FILE${NC}"
}

main() {
    log "${BLUE}🚀 Starting VibeTunnel Migration Testing${NC}"
    log "${BLUE}=======================================${NC}\n"
    
    # Initialize log file
    echo "VibeTunnel Migration Test Log - $(date)" > "$LOG_FILE"
    
    # Start servers
    if ! start_go_server; then
        log "${RED}Failed to start Go server. Exiting.${NC}"
        exit 1
    fi
    
    # Optionally start Node.js server for comparison (if available)
    if [[ -d "../web" ]]; then
        log "${BLUE}Attempting to start Node.js server for comparison...${NC}"
        start_node_server || log "${YELLOW}Node.js server not available for comparison${NC}"
    fi
    
    # Start Bun web server
    if ! start_bun_web; then
        log "${YELLOW}Warning: Bun web server failed to start${NC}"
    fi
    
    # Give servers a moment to fully initialize
    sleep 3
    
    # Run tests
    test_health_endpoints
    test_api_endpoints
    test_push_notifications
    test_filesystem_api
    test_git_api
    test_websocket_connections
    test_security_features
    test_authentication
    compare_response_times
    
    # Generate final report
    generate_report
    
    # Exit with appropriate code
    if [[ $FEATURE_PARITY_SCORE -ge 10 ]]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi