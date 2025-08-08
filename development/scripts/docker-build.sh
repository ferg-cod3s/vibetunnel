#!/bin/bash

# VibeTunnel Docker Build Script
# Builds and optionally runs the VibeTunnel Docker stack

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BUILD_VERSION="1.0.0"
BUILD_ENV="development"
SENTRY_DSN=""
DOCKER_COMPOSE_FILE="docker-compose.yml"
RUN_AFTER_BUILD=false
CLEAN_BUILD=false

# Help function
show_help() {
    echo "VibeTunnel Docker Build Script"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -v, --version VERSION     Set build version (default: 1.0.0)"
    echo "  -e, --env ENVIRONMENT     Set build environment (default: development)"  
    echo "  -s, --sentry-dsn DSN      Set Sentry DSN for monitoring"
    echo "  -r, --run                 Run stack after building"
    echo "  -c, --clean               Clean build (remove existing images)"
    echo "  -f, --file FILE          Docker compose file (default: docker-compose.yml)"
    echo "  -h, --help               Show this help message"
    echo
    echo "Examples:"
    echo "  $0 --version 1.2.0 --env production --sentry-dsn https://your-dsn --run"
    echo "  $0 --clean --run"
    echo "  $0 --help"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            BUILD_VERSION="$2"
            shift 2
            ;;
        -e|--env)
            BUILD_ENV="$2"
            shift 2
            ;;
        -s|--sentry-dsn)
            SENTRY_DSN="$2"
            shift 2
            ;;
        -r|--run)
            RUN_AFTER_BUILD=true
            shift
            ;;
        -c|--clean)
            CLEAN_BUILD=true
            shift
            ;;
        -f|--file)
            DOCKER_COMPOSE_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if docker-compose file exists
if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    echo -e "${RED}❌ Docker compose file '$DOCKER_COMPOSE_FILE' not found.${NC}"
    exit 1
fi

echo -e "${BLUE}🐳 VibeTunnel Docker Build${NC}"
echo -e "${BLUE}========================${NC}"
echo "Build Version: $BUILD_VERSION"
echo "Environment: $BUILD_ENV"
echo "Sentry DSN: ${SENTRY_DSN:-(not set)}"
echo "Docker Compose File: $DOCKER_COMPOSE_FILE"
echo "Clean Build: $CLEAN_BUILD"
echo "Run After Build: $RUN_AFTER_BUILD"
echo

# Export environment variables for docker-compose
export BUILD_VERSION
export BUILD_ENV
export SENTRY_DSN

# Clean build if requested
if [[ "$CLEAN_BUILD" == "true" ]]; then
    echo -e "${YELLOW}🧹 Cleaning existing images...${NC}"
    
    # Stop running containers
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --remove-orphans || true
    
    # Remove images
    docker-compose -f "$DOCKER_COMPOSE_FILE" down --rmi all --volumes || true
    
    # Prune build cache (optional - comment if you want to keep cache)
    # docker system prune -f --all
    
    echo -e "${GREEN}✅ Clean completed${NC}"
fi

# Build the images
echo -e "${YELLOW}🔨 Building Docker images...${NC}"

if docker-compose -f "$DOCKER_COMPOSE_FILE" build --parallel; then
    echo -e "${GREEN}✅ Build completed successfully${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Show built images
echo -e "${BLUE}📦 Built images:${NC}"
docker images | grep -E "(vibetunnel|otel|jaeger|prometheus)" || echo "No VibeTunnel images found"

# Run if requested
if [[ "$RUN_AFTER_BUILD" == "true" ]]; then
    echo -e "${YELLOW}🚀 Starting VibeTunnel stack...${NC}"
    
    if docker-compose -f "$DOCKER_COMPOSE_FILE" up -d; then
        echo -e "${GREEN}✅ VibeTunnel stack started successfully${NC}"
        echo
        echo -e "${BLUE}🌐 Service URLs:${NC}"
        echo "  • VibeTunnel Go Server:  http://localhost:4021"
        echo "  • VibeTunnel Web Server: http://localhost:3000"
        echo "  • Jaeger UI:             http://localhost:16686"
        echo "  • Prometheus:            http://localhost:9090"
        echo
        echo -e "${BLUE}📊 Health checks:${NC}"
        echo "  curl http://localhost:4021/health"
        echo "  curl http://localhost:3000/health"
        echo
        echo -e "${BLUE}📝 View logs:${NC}"
        echo "  docker-compose -f $DOCKER_COMPOSE_FILE logs -f"
        echo
        echo -e "${BLUE}🛑 Stop stack:${NC}"
        echo "  docker-compose -f $DOCKER_COMPOSE_FILE down"
        
    else
        echo -e "${RED}❌ Failed to start VibeTunnel stack${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}🎉 Docker build script completed!${NC}"