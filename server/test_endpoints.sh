#!/bin/bash

# Test script to verify the new Go server endpoints

SERVER_URL="http://localhost:4025"

echo "Testing Go server endpoints..."

# Test /api/fs/browse (should behave like /api/filesystem/ls)
echo "1. Testing /api/fs/browse"
curl -s "${SERVER_URL}/api/fs/browse?path=." | head -c 200
echo -e "\n"

# Test /api/fs/completions
echo "2. Testing /api/fs/completions"  
curl -s "${SERVER_URL}/api/fs/completions?path=/tmp" | head -c 200
echo -e "\n"

# Test improved /api/repositories/discover
echo "3. Testing /api/repositories/discover"
curl -s "${SERVER_URL}/api/repositories/discover?path=~" | head -c 200
echo -e "\n"

echo "Endpoint tests complete!"