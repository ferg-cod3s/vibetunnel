#!/bin/bash

# TunnelForge Docker-based Startup Script
# Uses Docker Compose for consistent, production-like environment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
PROJECT_NAME="tunnelforge"
LOG_DIR="./logs"

# Parse command line arguments
PROFILE="development"
MONITORING_ENABLED="false"
BUILD_FRESH="false"
DETACHED="false"

show_help() {
    cat << EOF
${BLUE}TunnelForge Docker Startup Script${NC}

${YELLOW}Usage:${NC}
  $0 [options]

${YELLOW}Options:${NC}
  -p, --profile PROFILE    Set environment profile (development|production) [default: development]
  -m, --monitoring         Enable monitoring stack (Prometheus, Jaeger, etc.)
  -b, --build              Force rebuild of all containers
  -d, --detached           Run in background (detached mode)
  -h, --help               Show this help message
  --no-cache               Build without using cache
  --logs SERVICE           Show logs for specific service
  --stop                   Stop all services
  --restart SERVICE        Restart specific service
  --shell SERVICE          Open shell in running service

${YELLOW}Examples:${NC}
  $0                       Start with development profile
  $0 -p production -m      Start production with monitoring
  $0 -b                    Rebuild and start
  $0 --logs tunnelforge-go-server  Show Go server logs
  $0 --stop                Stop all services

${YELLOW}Services:${NC}
  • tunnelforge-go-server   Go backend server (port 4021)
  • tunnelforge-bun-web     Bun web frontend (port 3000)
  • otel-collector         OpenTelemetry collector (port 4317/4318)
  • jaeger                 Jaeger tracing UI (port 16686)
  • prometheus             Prometheus metrics (port 9090)

EOF
}

log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

check_docker() {
    log "${BLUE}🐳 Checking Docker environment...${NC}"
    
    if ! command -v docker >/dev/null 2>&1; then
        log "${RED}❌ Docker is not installed${NC}"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log "${RED}❌ Docker daemon is not running${NC}"
        exit 1
    fi
    
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        log "${RED}❌ Docker Compose is not available${NC}"
        exit 1
    fi
    
    local compose_cmd="docker-compose"
    if ! command -v docker-compose >/dev/null 2>&1; then
        compose_cmd="docker compose"
    fi
    
    log "${GREEN}✅ Docker environment ready${NC}"
    
    # Export for use in other functions
    export COMPOSE_CMD="$compose_cmd"
}

create_env_file() {
    log "${BLUE}📝 Creating environment configuration...${NC}"
    
    cat > .env << EOF
# TunnelForge Docker Environment Configuration
# Generated: $(date)

# Build configuration
BUILD_VERSION=1.0.0
BUILD_ENV=$PROFILE
COMPOSE_PROJECT_NAME=$PROJECT_NAME

# Service ports
GO_SERVER_PORT=4021
BUN_WEB_PORT=3000

# Service URLs
GO_SERVER_URL=http://tunnelforge-go-server:4021

# Security configuration
ENABLE_AUTH=false
ENABLE_RATE_LIMIT=true
RATE_LIMIT_PER_MIN=100

# Monitoring (set your own values)
SENTRY_DSN=${SENTRY_DSN:-}
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317

# Logging
LOG_LEVEL=info
ENABLE_REQUEST_LOG=true

# Data paths
FILESYSTEM_BASE_PATH=/app/data
GIT_BASE_PATH=/app/data

# Development overrides
PWD=$(pwd)
EOF
    
    log "${GREEN}✅ Environment configuration created (.env)${NC}"
}

build_services() {
    log "${BLUE}🔨 Building Docker images...${NC}"
    
    local build_args="--parallel"
    
    if [[ "$BUILD_FRESH" == "true" ]]; then
        build_args="$build_args --no-cache --force-rm"
        log "${YELLOW}Building with fresh cache...${NC}"
    fi
    
    if ! $COMPOSE_CMD build $build_args; then
        log "${RED}❌ Failed to build Docker images${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ Docker images built successfully${NC}"
}

start_services() {
    log "${BLUE}🚀 Starting TunnelForge services...${NC}"
    
    # Prepare services list
    local services="tunnelforge-go-server tunnelforge-bun-web"
    
    if [[ "$MONITORING_ENABLED" == "true" ]]; then
        services="$services otel-collector jaeger prometheus"
        log "${BLUE}📊 Including monitoring stack${NC}"
    fi
    
    local up_args="--remove-orphans"
    
    if [[ "$DETACHED" == "true" ]]; then
        up_args="$up_args -d"
        log "${BLUE}Running in detached mode...${NC}"
    fi
    
    if ! $COMPOSE_CMD up $up_args $services; then
        log "${RED}❌ Failed to start services${NC}"
        exit 1
    fi
    
    if [[ "$DETACHED" == "true" ]]; then
        log "${GREEN}✅ Services started in background${NC}"
        show_status
    fi
}

show_status() {
    log "\n${PURPLE}📊 TunnelForge Docker Status:${NC}"
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Show container status
    $COMPOSE_CMD ps --format table
    
    echo
    log "${BLUE}🌐 Service URLs:${NC}"
    log "   • TunnelForge Web Frontend: ${GREEN}http://localhost:3000${NC}"
    log "   • Go Backend API: ${GREEN}http://localhost:4021${NC}"
    log "   • Health Check: ${GREEN}http://localhost:4021/health${NC}"
    
    if [[ "$MONITORING_ENABLED" == "true" ]]; then
        log "   • Jaeger Tracing: ${GREEN}http://localhost:16686${NC}"
        log "   • Prometheus Metrics: ${GREEN}http://localhost:9090${NC}"
    fi
    
    log "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Health check
    sleep 5  # Give services a moment to start
    
    if curl -sf http://localhost:4021/health >/dev/null 2>&1; then
        log "${GREEN}✅ Go Backend: Healthy${NC}"
    else
        log "${RED}❌ Go Backend: Not responding${NC}"
    fi
    
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        log "${GREEN}✅ Bun Frontend: Healthy${NC}"
    else
        log "${RED}❌ Bun Frontend: Not responding${NC}"
    fi
}

show_logs() {
    local service=$1
    log "${BLUE}📋 Showing logs for $service...${NC}"
    
    if [[ "$service" == "all" ]]; then
        $COMPOSE_CMD logs -f
    else
        $COMPOSE_CMD logs -f "$service"
    fi
}

stop_services() {
    log "${YELLOW}🛑 Stopping TunnelForge services...${NC}"
    
    if ! $COMPOSE_CMD down --remove-orphans; then
        log "${RED}❌ Failed to stop services cleanly${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ All services stopped${NC}"
}

restart_service() {
    local service=$1
    log "${BLUE}🔄 Restarting $service...${NC}"
    
    if ! $COMPOSE_CMD restart "$service"; then
        log "${RED}❌ Failed to restart $service${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ $service restarted${NC}"
}

open_shell() {
    local service=$1
    log "${BLUE}🐚 Opening shell in $service...${NC}"
    
    if ! $COMPOSE_CMD exec "$service" /bin/bash; then
        log "${RED}❌ Failed to open shell in $service${NC}"
        exit 1
    fi
}

cleanup() {
    log "\n${YELLOW}🧹 Cleaning up Docker resources...${NC}"
    
    # Stop services
    $COMPOSE_CMD down --remove-orphans >/dev/null 2>&1 || true
    
    # Optionally remove volumes (uncomment if needed)
    # $COMPOSE_CMD down --volumes --remove-orphans >/dev/null 2>&1 || true
    
    # Remove orphaned containers
    docker container prune -f >/dev/null 2>&1 || true
    
    log "${GREEN}✅ Cleanup complete${NC}"
}

# Set up signal handlers for graceful shutdown
trap cleanup EXIT INT TERM

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -m|--monitoring)
            MONITORING_ENABLED="true"
            shift
            ;;
        -b|--build)
            BUILD_FRESH="true"
            shift
            ;;
        -d|--detached)
            DETACHED="true"
            shift
            ;;
        --no-cache)
            BUILD_FRESH="true"
            shift
            ;;
        --logs)
            LOGS_SERVICE="${2:-all}"
            show_logs "$LOGS_SERVICE"
            exit 0
            ;;
        --stop)
            stop_services
            exit 0
            ;;
        --restart)
            if [[ -z "${2:-}" ]]; then
                log "${RED}❌ --restart requires a service name${NC}"
                exit 1
            fi
            restart_service "$2"
            exit 0
            ;;
        --shell)
            if [[ -z "${2:-}" ]]; then
                log "${RED}❌ --shell requires a service name${NC}"
                exit 1
            fi
            open_shell "$2"
            exit 0
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
    log "${PURPLE}🎯 Starting TunnelForge with Docker${NC}"
    log "${BLUE}Profile: $PROFILE${NC}"
    log "${BLUE}Monitoring: $MONITORING_ENABLED${NC}"
    log "${BLUE}═══════════════════════════════════════════════${NC}"
    
    # Check Docker environment
    check_docker
    
    # Create environment configuration
    create_env_file
    
    # Build if requested or if images don't exist
    if [[ "$BUILD_FRESH" == "true" ]] || ! docker images | grep -q "tunnelforge"; then
        build_services
    fi
    
    # Start services
    start_services
    
    # If not detached, show status and wait
    if [[ "$DETACHED" != "true" ]]; then
        show_status
        
        log "\n${YELLOW}🎮 TunnelForge is running. Press Ctrl+C to stop all services.${NC}"
        log "${BLUE}💡 Use '$0 --logs SERVICE' to view specific service logs${NC}\n"
        
        # Wait for interrupt
        wait
    fi
}

# Run main function
main "$@"