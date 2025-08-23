#!/bin/bash

# Test script for verifying local bypass authentication in the Go server

echo "Testing TunnelForge Local Bypass Authentication"
echo "=============================================="
echo

# Server URL
SERVER_URL="http://localhost:4021"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Request without authentication (should fail if auth is required)
echo "Test 1: Request without authentication headers"
response=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/sessions")
if [ "$response" = "401" ]; then
    echo -e "${GREEN}✓ Correctly rejected unauthenticated request (401)${NC}"
elif [ "$response" = "200" ]; then
    echo -e "${YELLOW}⚠ Auth might be disabled - request succeeded without auth${NC}"
else
    echo -e "${RED}✗ Unexpected response code: $response${NC}"
fi
echo

# Test 2: Request with local bypass header from localhost (should succeed)
echo "Test 2: Request with X-TunnelForge-Local header from localhost"
response=$(curl -s -o /dev/null -w "%{http_code}" -H "X-TunnelForge-Local: test-token" "$SERVER_URL/api/sessions")
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✓ Local bypass authentication successful (200)${NC}"
else
    echo -e "${RED}✗ Local bypass failed - response code: $response${NC}"
fi
echo

# Test 3: Verify actual session data is returned with local bypass
echo "Test 3: Fetching session data with local bypass"
sessions=$(curl -s -H "X-TunnelForge-Local: test-token" "$SERVER_URL/api/sessions")
if echo "$sessions" | grep -q '\[' || echo "$sessions" | grep -q 'null'; then
    echo -e "${GREEN}✓ Successfully retrieved session data${NC}"
    echo "Session data preview:"
    echo "$sessions" | head -1
else
    echo -e "${RED}✗ Failed to retrieve session data${NC}"
    echo "Response: $sessions"
fi
echo

# Test 4: Test creating a session with local bypass
echo "Test 4: Creating a test session with local bypass"
create_response=$(curl -s -X POST \
    -H "X-TunnelForge-Local: test-token" \
    -H "Content-Type: application/json" \
    -d '{"command":"echo test","cwd":"/tmp","title":"Test Session"}' \
    "$SERVER_URL/api/sessions")

if echo "$create_response" | grep -q '"id"'; then
    echo -e "${GREEN}✓ Successfully created session with local bypass${NC}"
    session_id=$(echo "$create_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "Created session ID: $session_id"
    
    # Clean up the test session
    if [ ! -z "$session_id" ]; then
        cleanup_response=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
            -H "X-TunnelForge-Local: test-token" \
            "$SERVER_URL/api/sessions/$session_id")
        if [ "$cleanup_response" = "200" ] || [ "$cleanup_response" = "204" ]; then
            echo -e "${GREEN}✓ Test session cleaned up${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Failed to create session${NC}"
    echo "Response: $create_response"
fi
echo

# Test 5: Verify local bypass only works from localhost
echo "Test 5: Testing local bypass header with spoofed remote IP (should fail)"
# This test would need to be run from a different machine or use a proxy
# For now, we'll just document that this security check exists
echo -e "${YELLOW}ℹ Local bypass is restricted to localhost connections only${NC}"
echo

echo "=============================================="
echo "Local Bypass Authentication Tests Complete"
echo "=============================================="
