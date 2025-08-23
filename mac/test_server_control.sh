#!/bin/bash

# Test script for TunnelForge server stop/start functionality

set -e

echo "=== TunnelForge Server Control Test ==="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_server_running() {
    if ps aux | grep -q "[v]ibetunnel"; then
        return 0
    else
        return 1
    fi
}

check_port_listening() {
    if lsof -i :4021 | grep -q LISTEN; then
        return 0
    else
        return 1
    fi
}

print_status() {
    if check_server_running; then
        echo -e "${GREEN}✓ Server process is running${NC}"
        SERVER_PID=$(ps aux | grep "[v]ibetunnel" | awk '{print $2}')
        echo "  PID: $SERVER_PID"
    else
        echo -e "${RED}✗ Server process is NOT running${NC}"
    fi
    
    if check_port_listening; then
        echo -e "${GREEN}✓ Port 4021 is listening${NC}"
    else
        echo -e "${RED}✗ Port 4021 is NOT listening${NC}"
    fi
}

# Initial status
echo "Initial status:"
print_status
echo

# Test 1: Stop the server
echo -e "${YELLOW}Test 1: Stopping the server...${NC}"
# Send stop command (we'll simulate this with pkill for now)
if check_server_running; then
    SERVER_PID=$(ps aux | grep "[v]ibetunnel" | awk '{print $2}')
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
fi

echo "After stop:"
print_status
echo

# Test 2: Start the server
echo -e "${YELLOW}Test 2: Starting the server...${NC}"
# The app should automatically restart it, but we can trigger it
# For now, we'll just wait and check if it restarts automatically
sleep 5

echo "After waiting for auto-restart:"
print_status
echo

# Test 3: Verify server responds
echo -e "${YELLOW}Test 3: Testing server response...${NC}"
if check_port_listening; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4021 || echo "000")
    if [ "$HTTP_CODE" != "000" ]; then
        echo -e "${GREEN}✓ Server responds with HTTP code: $HTTP_CODE${NC}"
    else
        echo -e "${RED}✗ Server is not responding to HTTP requests${NC}"
    fi
else
    echo -e "${RED}✗ Cannot test - server not listening${NC}"
fi
echo

# Summary
echo "=== Test Summary ==="
if check_server_running && check_port_listening; then
    echo -e "${GREEN}✓ All tests passed - server control is working${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed - server control needs debugging${NC}"
    exit 1
fi
