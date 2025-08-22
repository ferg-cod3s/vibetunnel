#!/bin/bash

# TunnelForge Tunnel Starter
# Starts both TunnelForge and Cloudflare tunnel

echo "🔥 Starting TunnelForge with Cloudflare Tunnel..."

# Check if TunnelForge is running
if ! pgrep -f "TunnelForge" > /dev/null; then
    echo "🚀 Starting TunnelForge Mac app..."
    open "/Applications/TunnelForge.app" 2>/dev/null || \
    open "/Users/$USER/Library/Developer/Xcode/DerivedData/VibeTunnel-*/Build/Products/Debug/VibeTunnel.app" 2>/dev/null || \
    echo "⚠️  Please start TunnelForge manually"
    
    # Wait for TunnelForge to start
    echo "⏳ Waiting for TunnelForge to start..."
    sleep 5
fi

# Check if TunnelForge server is responding
echo "🔍 Checking TunnelForge server..."
for i in {1..10}; do
    if curl -s http://localhost:4021/health > /dev/null 2>&1; then
        echo "✅ TunnelForge server is running"
        break
    else
        echo "⏳ Waiting for TunnelForge server... ($i/10)"
        sleep 2
    fi
done

# Start Cloudflare tunnel
echo "🌩️ Starting Cloudflare tunnel..."
if cloudflared tunnel list | grep -q "tunnelforge"; then
    echo "🚇 Running tunnel 'tunnelforge'..."
    cloudflared tunnel run tunnelforge
else
    echo "❌ Tunnel 'tunnelforge' not found. Please run setup-cloudflare-tunnel.sh first"
    exit 1
fi