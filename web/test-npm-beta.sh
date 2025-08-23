#!/bin/bash
set -e

echo "Testing TunnelForge with latest npm via Docker"
echo "============================================="

# Change to web directory
cd "$(dirname "$0")"

# Build the Docker image
echo "Building Docker image with latest npm..."
docker build -t tunnelforge-npm-latest .

# Show npm and node versions
echo -e "\nNPM and Node versions in container:"
docker run --rm tunnelforge-npm-latest sh -c "echo 'Node:' && node --version && echo 'NPM:' && npm --version && echo 'PNPM:' && pnpm --version"

# Run tests
echo -e "\nRunning unit tests..."
docker run --rm tunnelforge-npm-latest pnpm run test:ci

# Run typecheck
echo -e "\nRunning type checks..."
docker run --rm tunnelforge-npm-latest pnpm run typecheck

# Run lint
echo -e "\nRunning linters..."
docker run --rm tunnelforge-npm-latest pnpm run lint

echo -e "\nAll tests passed with latest npm!"