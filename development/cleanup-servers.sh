#!/bin/bash

# TunnelForge Server Cleanup Script
echo "🧹 Cleaning up TunnelForge development servers..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to kill processes by pattern
kill_processes() {
    local pattern="$1"
    local description="$2"
    
    local pids=$(ps aux | grep -E "$pattern" | grep -v grep | awk '{print $2}')
    
    if [ -n "$pids" ]; then
        print_status "Killing $description processes: $pids"
        echo "$pids" | xargs -r kill -TERM
        sleep 2
        
        # Force kill if still running
        local remaining_pids=$(ps aux | grep -E "$pattern" | grep -v grep | awk '{print $2}')
        if [ -n "$remaining_pids" ]; then
            print_status "Force killing remaining $description processes: $remaining_pids"
            echo "$remaining_pids" | xargs -r kill -KILL
        fi
        
        print_success "$description processes cleaned up"
    else
        print_success "No $description processes found"
    fi
}

# Kill Go and Bun development servers (but NOT the Node.js server on port 3000)
kill_processes "go run cmd/server/main.go" "Go server"
kill_processes "bun run.*dev" "Bun development server"
kill_processes "bun.*server.ts" "Bun web server"
kill_processes "tunnelforge-server" "Go server binary"

# Wait a moment for cleanup
sleep 1

# Check for any remaining processes (excluding Node.js server on port 3000)
print_status "Checking for remaining TunnelForge development processes..."
remaining=$(ps aux | grep -E "(go run cmd/server|bun.*server)" | grep -v grep | grep -v cleanup-servers.sh)

if [ -n "$remaining" ]; then
    print_error "Some development processes are still running:"
    echo "$remaining"
    echo ""
    print_status "You may need to manually kill these processes"
else
    print_success "All TunnelForge development servers have been cleaned up!"
fi

# Show current port usage for common development ports
print_status "Current port usage:"
for port in 3000 3001 4020 4021 4022 4023 4024; do
    if lsof -i :$port >/dev/null 2>&1; then
        process=$(lsof -i :$port | tail -1 | awk '{print $1,$2}')
        if [ "$port" = "3000" ]; then
            echo "Port $port: $process (Node.js server - keeping running)"
        else
            echo "Port $port: $process"
        fi
    fi
done

echo ""
print_success "Development server cleanup completed!"
print_status "Node.js TunnelForge server on port 3000 was preserved"