#!/bin/bash

# TunnelForge Go Server - Quick Start Script

set -e

echo "🚀 TunnelForge Go Server - Quick Start"
echo "======================================"

# Build the server
echo "📦 Building server..."
go build -o tunnelforge-server cmd/server/main.go

# Check if Node.js server is running on 4020
if curl -s --connect-timeout 1 http://localhost:4020/health > /dev/null 2>&1; then
    echo "✅ Node.js server detected on port 4020"
else
    echo "ℹ️  No Node.js server detected on port 4020"
fi

echo "🌐 Starting Go server on port 4021..."
echo ""
echo "Endpoints:"
echo "  Health:    http://localhost:4021/health"
echo "  WebSocket: ws://localhost:4021/ws"
echo "  Sessions:  http://localhost:4021/api/sessions"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
exec ./tunnelforge-server
