#!/bin/bash

# TunnelForge Unified Startup Script
# Starts both Go backend server and Bun frontend proxy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
GO_SERVER_PORT=${GO_SERVER_PORT:-4021}
BUN_WEB_PORT=${BUN_WEB_PORT:-3000}
GO_SERVER_DIR="./go-server"
BUN_WEB_DIR="./bun-web"
LOG_DIR="./logs"
NO_AUTH="false"

# Process tracking
GO_SERVER_PID=""
BUN_WEB_PID=""

# Create logs directory
mkdir -p "$LOG_DIR"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down TunnelForge services...${NC}"
    
    if [[ -n "$GO_SERVER_PID" ]] && kill -0 "$GO_SERVER_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping Go server (PID: $GO_SERVER_PID)...${NC}"
        kill "$GO_SERVER_PID" || true
        wait "$GO_SERVER_PID" 2>/dev/null || true
    fi
    
    if [[ -n "$BUN_WEB_PID" ]] && kill -0 "$BUN_WEB_PID" 2>/dev/null; then
        echo -e "${BLUE}Stopping Bun web server (PID: $BUN_WEB_PID)...${NC}"
        kill "$BUN_WEB_PID" || true
        wait "$BUN_WEB_PID" 2>/dev/null || true
    fi
    
    # Clean up any remaining processes
    pkill -f "tunnelforge-server" 2>/dev/null || true
    pkill -f "go run.*server" 2>/dev/null || true
    pkill -f "bun run dev" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Set up signal handlers
trap cleanup EXIT INT TERM

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

check_dependencies() {
    log "${BLUE}🔍 Checking dependencies...${NC}"
    
    # Check for Go
    if ! command -v go >/dev/null 2>&1; then
        log "${RED}❌ Go is not installed. Please install Go 1.21 or later.${NC}"
        exit 1
    fi
    
    local go_version
    go_version=$(go version | cut -d ' ' -f3 | cut -c3-)
    log "${GREEN}✓ Go version: $go_version${NC}"
    
    # Check for Bun
    if ! command -v bun >/dev/null 2>&1; then
        log "${RED}❌ Bun is not installed. Please install Bun from https://bun.sh${NC}"
        exit 1
    fi
    
    local bun_version
    bun_version=$(bun --version)
    log "${GREEN}✓ Bun version: $bun_version${NC}"
    
    # Check for required directories
    if [[ ! -d "$GO_SERVER_DIR" ]]; then
        log "${RED}❌ Go server directory not found: $GO_SERVER_DIR${NC}"
        exit 1
    fi
    
    if [[ ! -d "$BUN_WEB_DIR" ]]; then
        log "${RED}❌ Bun web directory not found: $BUN_WEB_DIR${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ All dependencies satisfied${NC}"
}

build_go_server() {
    log "${BLUE}🔨 Building Go server...${NC}"
    
    cd "$GO_SERVER_DIR"
    
    # Install dependencies
    if ! go mod tidy; then
        log "${RED}❌ Failed to tidy Go modules${NC}"
        exit 1
    fi
    
    # Build server
    if ! go build -o tunnelforge-server cmd/server/main.go; then
        log "${RED}❌ Failed to build Go server${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ Go server built successfully${NC}"
    cd - >/dev/null
}

setup_bun_web() {
    log "${BLUE}📦 Setting up Bun web server...${NC}"
    
    cd "$BUN_WEB_DIR"
    
    # Install dependencies
    if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
        log "${BLUE}Installing Bun dependencies...${NC}"
        if ! bun install; then
            log "${RED}❌ Failed to install Bun dependencies${NC}"
            exit 1
        fi
    fi
    
    log "${GREEN}✅ Bun web server setup complete${NC}"
    cd - >/dev/null
}

start_go_server() {
    log "${BLUE}🚀 Starting Go server on port $GO_SERVER_PORT (network accessible)...${NC}"
    
    cd "$GO_SERVER_DIR"
    
    # Start Go server in background with network access enabled
    # Remove ALLOW_LOCAL_BYPASS to require authentication for network connections
    local server_args=""
    if [[ "$NO_AUTH" == "true" ]]; then
        server_args="--no-auth"
        log "${YELLOW}⚠️  Starting Go server with authentication disabled${NC}"
    fi
    HOST=0.0.0.0 PORT="$GO_SERVER_PORT" ENABLE_RATE_LIMIT=false ./tunnelforge-server $server_args > "../$LOG_DIR/go-server.log" 2>&1 &
    GO_SERVER_PID=$!
    
    cd - >/dev/null
    
    # Wait for server to be ready
    local max_attempts=30
    for i in $(seq 1 $max_attempts); do
        if curl -s -f "http://localhost:$GO_SERVER_PORT/health" >/dev/null 2>&1; then
            log "${GREEN}✅ Go server ready at http://localhost:$GO_SERVER_PORT${NC}"
            return 0
        fi
        sleep 1
    done
    
    log "${RED}❌ Go server failed to start${NC}"
    return 1
}

start_bun_web() {
    log "${BLUE}🌐 Starting Bun web server on port $BUN_WEB_PORT (network accessible)...${NC}"
    
    cd "$BUN_WEB_DIR"
    
    # Get local IP for display purposes
    local local_ip=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
    
    # Start Bun web server in background with network access
    HOST=0.0.0.0 PORT="$BUN_WEB_PORT" GO_SERVER_URL="http://localhost:$GO_SERVER_PORT" bun run src/bun-server.ts > "../$LOG_DIR/bun-web.log" 2>&1 &
    BUN_WEB_PID=$!
    
    cd - >/dev/null
    
    # Wait for web server to be ready
    local max_attempts=30
    for i in $(seq 1 $max_attempts); do
        if curl -s -f "http://localhost:$BUN_WEB_PORT/" >/dev/null 2>&1; then
            log "${GREEN}✅ Bun web server ready at http://localhost:$BUN_WEB_PORT${NC}"
            return 0
        fi
        sleep 1
    done
    
    log "${RED}❌ Bun web server failed to start${NC}"
    return 1
}

show_status() {
    log "\n${PURPLE}📊 TunnelForge Status:${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Get local IP for network access info
    local local_ip=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -1 | awk '{print $2}')
    
    # Go server status
    if [[ -n "$GO_SERVER_PID" ]] && kill -0 "$GO_SERVER_PID" 2>/dev/null; then
        log "${GREEN}✅ Go Backend Server: Running (PID: $GO_SERVER_PID)${NC}"
        log "   📍 Local: http://localhost:$GO_SERVER_PORT"
        if [[ -n "$local_ip" ]]; then
            log "   🌐 Network: http://$local_ip:$GO_SERVER_PORT"
        fi
        log "   🏥 Health: http://localhost:$GO_SERVER_PORT/health"
        log "   📡 API: http://localhost:$GO_SERVER_PORT/api/"
        log "   🔌 WebSocket: ws://localhost:$GO_SERVER_PORT/ws"
    else
        log "${RED}❌ Go Backend Server: Not running${NC}"
    fi
    
    echo
    
    # Bun web server status
    if [[ -n "$BUN_WEB_PID" ]] && kill -0 "$BUN_WEB_PID" 2>/dev/null; then
        log "${GREEN}✅ Bun Web Frontend: Running (PID: $BUN_WEB_PID)${NC}"
        log "   📍 Local: http://localhost:$BUN_WEB_PORT"
        if [[ -n "$local_ip" ]]; then
            log "   🌐 Network: http://$local_ip:$BUN_WEB_PORT"
        fi
        log "   📁 Static Files: Served by Bun"
        log "   🔄 API Proxy: → http://localhost:$GO_SERVER_PORT"
    else
        log "${RED}❌ Bun Web Frontend: Not running${NC}"
    fi
    
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ -n "$GO_SERVER_PID" ]] && kill -0 "$GO_SERVER_PID" 2>/dev/null && [[ -n "$BUN_WEB_PID" ]] && kill -0 "$BUN_WEB_PID" 2>/dev/null; then
        log "${GREEN}🎉 TunnelForge is running successfully!${NC}"
        log "${BLUE}👉 Local access: http://localhost:$BUN_WEB_PORT${NC}"
        if [[ -n "$local_ip" ]]; then
            log "${YELLOW}🌐 Network access: http://$local_ip:$BUN_WEB_PORT (requires authentication)${NC}"
        fi
    else
        log "${RED}⚠️  Some services failed to start${NC}"
    fi
    
    log "\n${YELLOW}📋 Logs:${NC}"
    log "   Go Server: $LOG_DIR/go-server.log"
    log "   Bun Web: $LOG_DIR/bun-web.log"
}

show_help() {
    cat << EOF
${BLUE}TunnelForge Unified Startup Script${NC}

${YELLOW}Usage:${NC}
  $0 [options]

${YELLOW}Options:${NC}
  -p, --go-port PORT     Set Go server port (default: 4021)
  -w, --web-port PORT    Set Bun web server port (default: 3000)
  --docker               Use Docker containers (recommended for production)
  --native               Use native binaries (default for development)
  -h, --help             Show this help message
  --dev                  Enable development mode (verbose logging)
  --production           Enable production mode (optimized)
  --no-auth              Disable authentication (for testing)

${YELLOW}Environment Variables:${NC}
  GO_SERVER_PORT         Go server port (default: 4021)
  BUN_WEB_PORT          Bun web server port (default: 3000)
  
${YELLOW}Examples:${NC}
  $0                     Start with native binaries (development)
  $0 --docker            Start with Docker containers (recommended)
  $0 -p 8080 -w 3001     Start native with custom ports
  $0 --docker --dev      Start Docker in development mode

${YELLOW}Recommended Startup Methods:${NC}
  🐳 Docker (Production): ./start-docker.sh
  🔧 Native (Development): $0 --native  
  🧪 Testing: ./validate-migration.sh

${YELLOW}Services:${NC}
  • Go Backend Server    High-performance terminal server
  • Bun Web Frontend     Static files + API proxy
  • Docker Stack         Full containerized environment

${YELLOW}Controls:${NC}
  Ctrl+C                 Graceful shutdown of all services

EOF
}

wait_for_interrupt() {
    log "\n${YELLOW}🎮 TunnelForge is running. Press Ctrl+C to stop all services.${NC}"
    log "${BLUE}💡 You can also run 'pkill -f tunnelforge' to stop services manually.${NC}\n"
    
    # Wait for interrupt
    while true; do
        if [[ -n "$GO_SERVER_PID" ]] && ! kill -0 "$GO_SERVER_PID" 2>/dev/null; then
            log "${RED}❌ Go server process died unexpectedly${NC}"
            break
        fi
        
        if [[ -n "$BUN_WEB_PID" ]] && ! kill -0 "$BUN_WEB_PID" 2>/dev/null; then
            log "${RED}❌ Bun web server process died unexpectedly${NC}"
            break
        fi
        
        sleep 5
    done
}

# Execution mode
USE_DOCKER="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--go-port)
            GO_SERVER_PORT="$2"
            shift 2
            ;;
        -w|--web-port)
            BUN_WEB_PORT="$2"
            shift 2
            ;;
        --docker)
            USE_DOCKER="true"
            shift
            ;;
        --native)
            USE_DOCKER="false"
            shift
            ;;
        --dev)
            export DEBUG=1
            shift
            ;;
        --production)
            export NODE_ENV=production
            shift
            ;;
        --no-auth)
            NO_AUTH="true"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    log "${PURPLE}🎯 Starting TunnelForge Migration Environment${NC}"
    log "${BLUE}═══════════════════════════════════════════════${NC}"
    
    # Check if Docker mode was requested
    if [[ "$USE_DOCKER" == "true" ]]; then
        log "${BLUE}🐳 Using Docker containers...${NC}"
        
        # Check if Docker startup script exists
        if [[ -x "./start-docker.sh" ]]; then
            log "${BLUE}Delegating to Docker startup script...${NC}"
            
            # Build Docker arguments
            local docker_args=()
            
            if [[ "${DEBUG:-}" == "1" ]]; then
                docker_args+=("--profile" "development")
            elif [[ "${NODE_ENV:-}" == "production" ]]; then
                docker_args+=("--profile" "production")
            fi
            
            # Execute Docker startup
            exec ./start-docker.sh "${docker_args[@]}"
        else
            log "${RED}❌ Docker startup script not found: ./start-docker.sh${NC}"
            exit 1
        fi
    fi
    
    # Native mode (default)
    log "${BLUE}🔧 Using native binaries...${NC}"
    
    # Check all dependencies first
    check_dependencies
    
    # Build and setup
    build_go_server
    setup_bun_web
    
    # Start services
    if ! start_go_server; then
        log "${RED}Failed to start Go server${NC}"
        exit 1
    fi
    
    if ! start_bun_web; then
        log "${RED}Failed to start Bun web server${NC}"
        exit 1
    fi
    
    # Show status
    show_status
    
    # Wait for user interrupt
    wait_for_interrupt
}

# Run main function
main "$@"