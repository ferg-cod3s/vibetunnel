#!/bin/bash

# TunnelForge Cloudflare Tunnel Setup Script
# Creates a new tunnel for tunnelforge.jferguson.info

echo "🌩️ Setting up Cloudflare Tunnel for TunnelForge..."

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared not found. Installing..."
    if command -v brew &> /dev/null; then
        brew install cloudflared
    else
        echo "Please install Homebrew first, then run: brew install cloudflared"
        exit 1
    fi
fi

# Configuration
TUNNEL_NAME="tunnelforge"
DOMAIN="tunnelforge.jferguson.info"
LOCAL_URL="http://localhost:4021"

echo "📋 Configuration:"
echo "  Tunnel Name: $TUNNEL_NAME"
echo "  Domain: $DOMAIN"
echo "  Local URL: $LOCAL_URL"
echo ""

# Step 1: Login to Cloudflare (if not already logged in)
echo "🔐 Step 1: Authenticating with Cloudflare..."
cloudflared tunnel login

# Step 2: Create the tunnel
echo "🚇 Step 2: Creating tunnel '$TUNNEL_NAME'..."
cloudflared tunnel create $TUNNEL_NAME

# Step 3: Create tunnel configuration
echo "⚙️ Step 3: Creating tunnel configuration..."
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_NAME
credentials-file: /Users/$USER/.cloudflared/\$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print \$1}').json
loglevel: warn

ingress:
  - hostname: $DOMAIN
    service: $LOCAL_URL
    originRequest:
      noHappyEyeballs: true
      disableChunkedEncoding: false
  - service: http_status:404
EOF

echo "📝 Created configuration at ~/.cloudflared/config.yml"

# Step 4: Create DNS record
echo "🌐 Step 4: Creating DNS record..."
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')
cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN

# Step 5: Test configuration
echo "🧪 Step 5: Testing configuration..."
cloudflared tunnel ingress validate

echo ""
echo "✅ Cloudflare Tunnel Setup Complete!"
echo ""
echo "🚀 Next Steps:"
echo "1. Start TunnelForge Mac app"
echo "2. Run the tunnel: cloudflared tunnel run $TUNNEL_NAME"
echo "3. Access TunnelForge at: https://$DOMAIN"
echo ""
echo "📋 Useful Commands:"
echo "  Start tunnel:  cloudflared tunnel run $TUNNEL_NAME"
echo "  Stop tunnel:   Ctrl+C"
echo "  Check status:  cloudflared tunnel list"
echo "  View logs:     cloudflared tunnel logs $TUNNEL_NAME"
echo ""
echo "🔒 Security Note:"
echo "The tunnel is now accessible globally. Consider enabling authentication"
echo "in TunnelForge settings for additional security."