#!/bin/bash
set -e

echo "Testing TunnelForge npm package beta 15"
echo "======================================"

# Change to web directory
cd "$(dirname "$0")"

# Build the Docker image
echo "Building Docker image..."
docker build -f Dockerfile.test-beta15 -t tunnelforge-beta15-test .

# Run the test
echo -e "\nRunning beta 15 package test..."
docker run --rm tunnelforge-beta15-test

echo -e "\nBeta 15 package test complete!"