#!/bin/bash

# VibeTunnel Development Environment Startup Script
# This script starts both the Go backend server and Bun frontend proxy

set -e

echo "🚀 Starting VibeTunnel Development Environment"
echo ""

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down development environment..."
    if [ ! -z "$GO_PID" ]; then
        echo "   Stopping Go server (PID: $GO_PID)"
        kill $GO_PID 2>/dev/null || true
    fi
    if [ ! -z "$BUN_PID" ]; then
        echo "   Stopping Bun server (PID: $BUN_PID)"
        kill $BUN_PID 2>/dev/null || true
    fi
    echo "✅ Development environment stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Change to development directory
cd "$(dirname "$0")"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.20 or later."
    exit 1
fi

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install Bun: https://bun.sh"
    exit 1
fi

echo "📦 Installing dependencies and building CLI..."

# Install Go dependencies and build CLI
echo "   Installing Go dependencies and building CLI..."
cd go-server && go mod tidy && make build && cd ..

# Install Bun dependencies
echo "   Installing Bun dependencies..."
cd bun-web && bun install && cd ..

echo ""
echo "🏗️  Starting servers..."

# Start Go server in background
echo "   Starting Go backend server on port 4021..."
cd go-server
go run cmd/server/main.go &
GO_PID=$!
cd ..

# Wait a moment for Go server to start
sleep 2

# Start Bun server in background
echo "   Starting Bun frontend proxy on port 3000..."
cd bun-web
bun run dev &
BUN_PID=$!
cd ..

# Wait a moment for servers to start
sleep 3

echo ""
echo "✅ VibeTunnel Development Environment is running!"
echo ""
echo "🌐 Frontend (Bun):     http://localhost:3000"
echo "🔧 Backend (Go):       http://localhost:4021"
echo "🖥️  CLI Tool:           go-server/bin/vibetunnel"
echo ""
echo "📡 API Endpoints:"
echo "   Health Check:       http://localhost:3000/api/health"
echo "   Sessions:           http://localhost:3000/api/sessions"
echo "   Server-Sent Events: http://localhost:3000/api/events"
echo "   WebSocket:          ws://localhost:3000/ws?sessionId={id}"
echo ""
echo "🔧 CLI Commands:"
echo "   ./go-server/bin/vibetunnel status    - Check server status"  
echo "   ./go-server/bin/vibetunnel help      - Show CLI help"
echo "   ./go-server/bin/vibetunnel version   - Show version"
echo ""
echo "📢 Real-time Events:"
echo "   Connect to SSE:     curl -N http://localhost:3000/api/events"
echo "   Test Event:         curl -X POST http://localhost:3000/api/events/test -H 'Content-Type: application/json' -d '{\"message\":\"Hello SSE!\"}'"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for processes to complete
wait