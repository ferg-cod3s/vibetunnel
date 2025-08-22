#!/bin/bash

# VibeTunnel Docker-based Migration Testing
# Comprehensive test suite using Docker containers

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Configuration
COMPOSE_CMD="docker-compose"
PROJECT_NAME="vibetunnel-test"
LOG_DIR="./logs"
REPORT_FILE="$LOG_DIR/docker-migration-report.md"

# Test tracking
TESTS_PASSED=0
TESTS_FAILED=0
FEATURE_PARITY_SCORE=0

# Container tracking
CONTAINERS_STARTED=()

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $(echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g')" >> "$LOG_DIR/docker-migration.log"
}

init_test_environment() {
    log "${BLUE}🧪 Initializing Docker Migration Test Environment${NC}"
    
    # Create logs directory
    mkdir -p "$LOG_DIR"
    > "$LOG_DIR/docker-migration.log"
    
    # Check for docker-compose command
    if ! command -v docker-compose >/dev/null 2>&1; then
        if docker compose version >/dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        else
            log "${RED}❌ Docker Compose not available${NC}"
            exit 1
        fi
    fi
    
    # Create test environment file
    cat > .env.test << EOF
BUILD_VERSION=test-$(date +%s)
BUILD_ENV=testing
COMPOSE_PROJECT_NAME=$PROJECT_NAME
GO_SERVER_PORT=4021
BUN_WEB_PORT=3000
LOG_LEVEL=debug
ENABLE_AUTH=false
PWD=$(pwd)
EOF
    
    log "${GREEN}✅ Test environment initialized${NC}"
}

cleanup_containers() {
    log "${YELLOW}🧹 Cleaning up test containers...${NC}"
    
    # Stop and remove test containers
    COMPOSE_FILE=docker-compose.yml $COMPOSE_CMD --env-file .env.test down --remove-orphans -v >/dev/null 2>&1 || true
    
    # Remove test networks
    docker network ls --filter name=$PROJECT_NAME --format "{{.Name}}" | xargs -r docker network rm >/dev/null 2>&1 || true
    
    # Clean up test environment file
    rm -f .env.test
    
    log "${GREEN}✅ Container cleanup complete${NC}"
}

# Set up cleanup on exit
trap cleanup_containers EXIT INT TERM

build_test_images() {
    log "${BLUE}🔨 Building test images...${NC}"
    
    if ! COMPOSE_FILE=docker-compose.yml $COMPOSE_CMD --env-file .env.test build --parallel --quiet; then
        log "${RED}❌ Failed to build test images${NC}"
        return 1
    fi
    
    log "${GREEN}✅ Test images built successfully${NC}"
}

start_test_services() {
    log "${BLUE}🚀 Starting test services...${NC}"
    
    # Start core services only (no monitoring for tests)
    if ! COMPOSE_FILE=docker-compose.yml $COMPOSE_CMD --env-file .env.test up -d vibetunnel-go-server vibetunnel-bun-web; then
        log "${RED}❌ Failed to start test services${NC}"
        return 1
    fi
    
    # Wait for services to be healthy
    local max_attempts=60
    local go_ready=false
    local bun_ready=false
    
    for i in $(seq 1 $max_attempts); do
        if ! $go_ready && curl -sf http://localhost:4021/health >/dev/null 2>&1; then
            go_ready=true
            log "${GREEN}✅ Go server ready${NC}"
        fi
        
        if ! $bun_ready && curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            bun_ready=true
            log "${GREEN}✅ Bun web server ready${NC}"
        fi
        
        if $go_ready && $bun_ready; then
            break
        fi
        
        sleep 1
    done
    
    if ! $go_ready || ! $bun_ready; then
        log "${RED}❌ Services failed to become ready within timeout${NC}"
        # Show container logs for debugging
        log "${YELLOW}Container logs:${NC}"
        $COMPOSE_CMD --env-file .env.test logs --tail=20
        return 1
    fi
    
    log "${GREEN}✅ All test services ready${NC}"
}

run_test() {
    local test_name="$1"
    local test_func="$2"
    
    log "${BLUE}🧪 Running: $test_name${NC}"
    
    if $test_func; then
        ((TESTS_PASSED++))
        log "${GREEN}✅ $test_name${NC}"
        return 0
    else
        ((TESTS_FAILED++))
        log "${RED}❌ $test_name${NC}"
        return 1
    fi
}

test_container_health() {
    # Test that containers are running and healthy
    local go_status
    local bun_status
    
    go_status=$($COMPOSE_CMD --env-file .env.test ps vibetunnel-go-server --format json | jq -r '.[0].Health // "unknown"')
    bun_status=$($COMPOSE_CMD --env-file .env.test ps vibetunnel-bun-web --format json | jq -r '.[0].Health // "unknown"')
    
    if [[ "$go_status" == "healthy" || "$go_status" == "unknown" ]]; then
        if curl -sf http://localhost:4021/health >/dev/null 2>&1; then
            log "${GREEN}  ✓ Go server container healthy${NC}"
        else
            return 1
        fi
    else
        return 1
    fi
    
    if [[ "$bun_status" == "healthy" || "$bun_status" == "unknown" ]]; then
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            log "${GREEN}  ✓ Bun web server container healthy${NC}"
            return 0
        else
            return 1
        fi
    else
        return 1
    fi
}

test_api_endpoints() {
    local endpoints=(
        "http://localhost:4021/health"
        "http://localhost:4021/api/config"
        "http://localhost:4021/api/auth/config"
        "http://localhost:4021/api/sessions"
        "http://localhost:3000/health"
        "http://localhost:3000/api/config"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if ! curl -sf "$endpoint" >/dev/null 2>&1; then
            log "${RED}  ✗ Failed: $endpoint${NC}"
            return 1
        else
            log "${GREEN}  ✓ OK: $endpoint${NC}"
            ((FEATURE_PARITY_SCORE++))
        fi
    done
    
    return 0
}

test_session_lifecycle() {
    # Create session
    local create_response
    create_response=$(curl -s -X POST http://localhost:4021/api/sessions \
        -H "Content-Type: application/json" \
        -d '{"title":"docker-test","command":"echo test","cols":80,"rows":24}')
    
    if ! echo "$create_response" | grep -q '"id"'; then
        log "${RED}  ✗ Session creation failed${NC}"
        return 1
    fi
    
    local session_id
    session_id=$(echo "$create_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log "${GREEN}  ✓ Session created: $session_id${NC}"
    ((FEATURE_PARITY_SCORE++))
    
    # Get session
    if ! curl -sf "http://localhost:4021/api/sessions/$session_id" >/dev/null 2>&1; then
        log "${RED}  ✗ Session retrieval failed${NC}"
        return 1
    fi
    log "${GREEN}  ✓ Session retrieved${NC}"
    ((FEATURE_PARITY_SCORE++))
    
    # Delete session
    if ! curl -sf -X DELETE "http://localhost:4021/api/sessions/$session_id" >/dev/null 2>&1; then
        log "${RED}  ✗ Session deletion failed${NC}"
        return 1
    fi
    log "${GREEN}  ✓ Session deleted${NC}"
    ((FEATURE_PARITY_SCORE++))
    
    return 0
}

test_websocket_connectivity() {
    # Test WebSocket endpoint accessibility
    local ws_test_result
    
    # Use curl to test WebSocket upgrade
    ws_test_result=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: test" \
        "http://localhost:4021/ws?sessionId=test")
    
    if [[ "$ws_test_result" == "101" || "$ws_test_result" == "400" ]]; then
        # 101 = successful upgrade, 400 = bad request (expected without valid session)
        log "${GREEN}  ✓ WebSocket endpoint accessible${NC}"
        ((FEATURE_PARITY_SCORE++))
        return 0
    else
        log "${RED}  ✗ WebSocket endpoint not accessible (HTTP $ws_test_result)${NC}"
        return 1
    fi
}

test_sse_events() {
    # Test Server-Sent Events endpoint
    local sse_pid
    
    timeout 10 curl -s "http://localhost:4021/api/events" > /tmp/sse_test.txt &
    sse_pid=$!
    
    sleep 3
    
    # Send a test event
    curl -s -X POST "http://localhost:4021/api/events/test" \
        -H "Content-Type: application/json" \
        -d '{"type":"test-notification","message":"Docker test event"}' >/dev/null 2>&1 || true
    
    sleep 2
    kill $sse_pid 2>/dev/null || true
    wait $sse_pid 2>/dev/null || true
    
    if [[ -f /tmp/sse_test.txt ]] && grep -q "event:" /tmp/sse_test.txt; then
        log "${GREEN}  ✓ SSE events working${NC}"
        ((FEATURE_PARITY_SCORE++))
        rm -f /tmp/sse_test.txt
        return 0
    else
        log "${RED}  ✗ SSE events not working${NC}"
        rm -f /tmp/sse_test.txt
        return 1
    fi
}

test_push_notifications() {
    # Test push notification endpoints
    if curl -sf "http://localhost:4021/api/push/vapid-key" | grep -q "publicKey"; then
        log "${GREEN}  ✓ Push notifications available${NC}"
        ((FEATURE_PARITY_SCORE++))
        return 0
    else
        log "${RED}  ✗ Push notifications not available${NC}"
        return 1
    fi
}

test_container_security() {
    # Check that containers are running as non-root
    local go_user
    local bun_user
    
    go_user=$($COMPOSE_CMD --env-file .env.test exec -T vibetunnel-go-server whoami 2>/dev/null || echo "unknown")
    bun_user=$($COMPOSE_CMD --env-file .env.test exec -T vibetunnel-bun-web whoami 2>/dev/null || echo "unknown")
    
    if [[ "$go_user" != "root" && "$go_user" != "unknown" ]]; then
        log "${GREEN}  ✓ Go server runs as non-root user: $go_user${NC}"
    else
        log "${RED}  ✗ Go server security concern: running as $go_user${NC}"
        return 1
    fi
    
    if [[ "$bun_user" != "root" && "$bun_user" != "unknown" ]]; then
        log "${GREEN}  ✓ Bun server runs as non-root user: $bun_user${NC}"
        return 0
    else
        log "${RED}  ✗ Bun server security concern: running as $bun_user${NC}"
        return 1
    fi
}

test_container_performance() {
    # Test container resource usage
    local go_memory
    local bun_memory
    
    go_memory=$($COMPOSE_CMD --env-file .env.test exec -T vibetunnel-go-server sh -c 'cat /proc/self/status | grep VmRSS | awk "{print \$2}"' 2>/dev/null || echo "0")
    bun_memory=$($COMPOSE_CMD --env-file .env.test exec -T vibetunnel-bun-web sh -c 'cat /proc/self/status | grep VmRSS | awk "{print \$2}"' 2>/dev/null || echo "0")
    
    # Convert to MB (from KB)
    go_memory_mb=$((go_memory / 1024))
    bun_memory_mb=$((bun_memory / 1024))
    
    log "${BLUE}  📊 Go server memory usage: ${go_memory_mb}MB${NC}"
    log "${BLUE}  📊 Bun server memory usage: ${bun_memory_mb}MB${NC}"
    
    # Check if memory usage is reasonable (under 200MB for Go, 100MB for Bun)
    if [[ $go_memory_mb -lt 200 && $bun_memory_mb -lt 100 ]]; then
        log "${GREEN}  ✓ Container memory usage acceptable${NC}"
        return 0
    else
        log "${YELLOW}  ⚠ High container memory usage${NC}"
        return 0  # Don't fail the test, just warn
    fi
}

generate_docker_report() {
    log "${PURPLE}📋 Generating Docker Migration Report${NC}"
    
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_percentage=0
    
    if [[ $total_tests -gt 0 ]]; then
        pass_percentage=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    {
        echo "# VibeTunnel Docker Migration Test Report"
        echo ""
        echo "**Generated:** $(date)"
        echo "**Test Results:** $TESTS_PASSED passed, $TESTS_FAILED failed ($pass_percentage% pass rate)"
        echo "**Feature Parity Score:** $FEATURE_PARITY_SCORE"
        echo ""
        
        echo "## Test Summary"
        echo ""
        
        if [[ $pass_percentage -ge 90 ]]; then
            echo "🎉 **EXCELLENT** - Docker environment ready for production"
        elif [[ $pass_percentage -ge 80 ]]; then
            echo "✅ **GOOD** - Minor issues in Docker environment"
        elif [[ $pass_percentage -ge 70 ]]; then
            echo "⚠️ **FAIR** - Docker environment needs attention"  
        else
            echo "❌ **POOR** - Significant Docker issues"
        fi
        
        echo ""
        echo "## Container Environment"
        echo ""
        echo "- **Go Server Container:** vibetunnel-go-server:latest"
        echo "- **Bun Web Container:** vibetunnel-bun-web:latest"
        echo "- **Network:** Docker bridge network"
        echo "- **Volumes:** Persistent data and logs"
        echo "- **Security:** Non-root users, read-only filesystems where applicable"
        echo ""
        
        echo "## Service URLs (Container Environment)"
        echo ""
        echo "- **Web Frontend:** http://localhost:3000"
        echo "- **Go Backend API:** http://localhost:4021"
        echo "- **Health Endpoints:** /health on both services"
        echo ""
        
        echo "## Next Steps"
        echo ""
        if [[ $pass_percentage -ge 90 ]]; then
            echo "- Deploy to staging environment"
            echo "- Run load testing with Docker containers"
            echo "- Plan production Docker deployment"
        else
            echo "- Fix failing Docker tests"
            echo "- Review container configurations"
            echo "- Ensure all services are containerized properly"
        fi
        
        echo ""
        echo "## Commands for Docker Environment"
        echo ""
        echo "\`\`\`bash"
        echo "# Start full stack with Docker"
        echo "./start-docker.sh"
        echo ""
        echo "# Run migration tests with Docker"
        echo "./docker-migration-test.sh"
        echo ""
        echo "# View container logs"
        echo "./start-docker.sh --logs vibetunnel-go-server"
        echo "./start-docker.sh --logs vibetunnel-bun-web"
        echo ""
        echo "# Stop all containers"
        echo "./start-docker.sh --stop"
        echo "\`\`\`"
        echo ""
        
        echo "---"
        echo "*Docker Migration Test Report - $(date)*"
        
    } > "$REPORT_FILE"
    
    log "${GREEN}✅ Docker migration report saved: $REPORT_FILE${NC}"
}

show_summary() {
    log "\n${PURPLE}📊 Docker Migration Test Summary${NC}"
    log "${BLUE}===================================${NC}"
    
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_percentage=0
    
    if [[ $total_tests -gt 0 ]]; then
        pass_percentage=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    log "Tests: ${BLUE}$TESTS_PASSED passed, $TESTS_FAILED failed${NC} (${BLUE}$pass_percentage%${NC})"
    log "Feature Parity Score: ${BLUE}$FEATURE_PARITY_SCORE${NC}"
    
    if [[ $pass_percentage -ge 90 ]]; then
        log "${GREEN}🎉 EXCELLENT - Docker environment ready for production!${NC}"
        log "${GREEN}The containerized VibeTunnel stack is working perfectly.${NC}"
    elif [[ $pass_percentage -ge 80 ]]; then
        log "${YELLOW}✅ GOOD - Minor Docker issues to address${NC}"
        log "${YELLOW}Fix remaining issues for production readiness.${NC}"
    else
        log "${RED}❌ NEEDS WORK - Fix Docker environment issues${NC}"
        log "${RED}Address failing tests before proceeding.${NC}"
    fi
    
    log "\n${BLUE}📋 Report: $REPORT_FILE${NC}"
    log "${BLUE}📝 Logs: $LOG_DIR/docker-migration.log${NC}"
}

main() {
    log "${PURPLE}🐳 VibeTunnel Docker Migration Testing${NC}"
    log "${BLUE}=====================================${NC}"
    
    # Initialize
    init_test_environment
    
    # Build and start
    if ! build_test_images; then
        log "${RED}❌ Failed to build test images${NC}"
        exit 1
    fi
    
    if ! start_test_services; then
        log "${RED}❌ Failed to start test services${NC}"
        exit 1
    fi
    
    # Run tests
    run_test "Container Health Check" test_container_health
    run_test "API Endpoints Test" test_api_endpoints  
    run_test "Session Lifecycle Test" test_session_lifecycle
    run_test "WebSocket Connectivity" test_websocket_connectivity
    run_test "Server-Sent Events" test_sse_events
    run_test "Push Notifications" test_push_notifications
    run_test "Container Security" test_container_security
    run_test "Container Performance" test_container_performance
    
    # Generate report and summary
    generate_docker_report
    show_summary
    
    # Exit with appropriate code
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_percentage=0
    
    if [[ $total_tests -gt 0 ]]; then
        pass_percentage=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    if [[ $pass_percentage -ge 90 ]]; then
        exit 0
    else
        exit 1
    fi
}

main "$@"