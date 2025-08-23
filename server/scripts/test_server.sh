#!/bin/bash

# Test script for TunnelForge Go server basic functionality
# This script starts the server and runs some basic API tests

echo "🚀 Starting TunnelForge Go Server Tests..."

# Start the server in the background
echo "Starting server on port 4021..."
cd "$(dirname "$0")/.."
go run cmd/server/main.go &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "http://localhost:4021/health")
if [[ $HEALTH_RESPONSE == *"\"status\":\"ok\""* ]]; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed: $HEALTH_RESPONSE"
fi

# Test session creation
echo "Testing session creation..."
SESSION_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"shell": "/bin/bash", "title": "Test Session"}' \
    "http://localhost:4021/api/sessions")

if [[ $SESSION_RESPONSE == *"\"id\":"* ]]; then
    echo "✅ Session creation passed"
    SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "   Created session: $SESSION_ID"
    
    # Test session listing
    echo "Testing session listing..."
    LIST_RESPONSE=$(curl -s "http://localhost:4021/api/sessions")
    if [[ $LIST_RESPONSE == *"\"count\":1"* ]]; then
        echo "✅ Session listing passed"
    else
        echo "❌ Session listing failed: $LIST_RESPONSE"
    fi
    
    # Test session retrieval
    echo "Testing session retrieval..."
    GET_RESPONSE=$(curl -s "http://localhost:4021/api/sessions/$SESSION_ID")
    if [[ $GET_RESPONSE == *"\"id\":\"$SESSION_ID\""* ]]; then
        echo "✅ Session retrieval passed"
    else
        echo "❌ Session retrieval failed: $GET_RESPONSE"
    fi
    
    # Test session deletion
    echo "Testing session deletion..."
    DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:4021/api/sessions/$SESSION_ID")
    if [[ $DELETE_RESPONSE == "200" ]]; then
        echo "✅ Session deletion passed"
    else
        echo "❌ Session deletion failed: HTTP $DELETE_RESPONSE"
    fi
else
    echo "❌ Session creation failed: $SESSION_RESPONSE"
fi

# Test CORS headers
echo "Testing CORS headers..."
CORS_RESPONSE=$(curl -s -I -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type" \
    "http://localhost:4021/api/sessions")

if [[ $CORS_RESPONSE == *"Access-Control-Allow-Origin: *"* ]] && [[ $CORS_RESPONSE == *"Access-Control-Allow-Headers"*"Content-Type"* ]]; then
    echo "✅ CORS headers passed"
else
    echo "❌ CORS headers failed"
    echo "   Response headers: $CORS_RESPONSE"
fi

# Clean up
echo "Shutting down server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo "🎉 Server test completed!"
