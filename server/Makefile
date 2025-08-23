# TunnelForge Go Server Makefile

.PHONY: build test clean install dev help

# Build configuration
BINARY_NAME=tunnelforge
BINARY_PATH=bin/$(BINARY_NAME)
CLI_ENTRY=cmd/vibetunnel/main.go
SERVER_ENTRY=cmd/server/main.go

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Build flags
BUILD_FLAGS=-ldflags="-X main.Version=$(shell git describe --tags --always --dirty 2>/dev/null || echo 'dev')"

# Default target
all: build

# Build the CLI binary
build:
	@echo "Building TunnelForge CLI..."
	@mkdir -p bin
	$(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_PATH) $(CLI_ENTRY)
	@echo "Built $(BINARY_PATH)"

# Build the server-only binary (for development)
build-server:
	@echo "Building TunnelForge Server..."
	@mkdir -p bin
	$(GOBUILD) $(BUILD_FLAGS) -o bin/tunnelforge-server $(SERVER_ENTRY)
	@echo "Built bin/tunnelforge-server"

# Run tests
test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	$(GOTEST) -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	$(GOCLEAN)
	rm -rf bin/
	rm -f coverage.out coverage.html

# Install dependencies
deps:
	@echo "Installing dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

# Install the binary to system PATH
install: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	sudo cp $(BINARY_PATH) /usr/local/bin/$(BINARY_NAME)
	@echo "Installed successfully. You can now use 'tunnelforge' from anywhere."

# Development server (hot reload with air if available)
dev:
	@if command -v air > /dev/null 2>&1; then \
		echo "Starting development server with air..."; \
		air; \
	else \
		echo "Air not found. Starting server directly..."; \
		$(GOCMD) run $(SERVER_ENTRY); \
	fi

# Quick development server without air
dev-simple:
	@echo "Starting development server..."
	$(GOCMD) run $(SERVER_ENTRY)

# Run the CLI directly (for development)
run-cli:
	@echo "Running CLI directly..."
	$(GOCMD) run $(CLI_ENTRY) $(ARGS)

# Build and run CLI
run: build
	./$(BINARY_PATH) $(ARGS)

# Format code
fmt:
	@echo "Formatting code..."
	$(GOCMD) fmt ./...

# Lint code (requires golangci-lint)
lint:
	@if command -v golangci-lint > /dev/null 2>&1; then \
		echo "Running linter..."; \
		golangci-lint run; \
	else \
		echo "golangci-lint not found. Skipping lint."; \
	fi

# Create release build
release: clean
	@echo "Building release binaries..."
	@mkdir -p bin/release
	# Linux AMD64
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(BUILD_FLAGS) -o bin/release/$(BINARY_NAME)-linux-amd64 $(CLI_ENTRY)
	# macOS AMD64
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(BUILD_FLAGS) -o bin/release/$(BINARY_NAME)-darwin-amd64 $(CLI_ENTRY)
	# macOS ARM64
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(BUILD_FLAGS) -o bin/release/$(BINARY_NAME)-darwin-arm64 $(CLI_ENTRY)
	@echo "Release binaries created in bin/release/"

# Show help
help:
	@echo "TunnelForge Go Server - Available Make Targets:"
	@echo ""
	@echo "  build          - Build the CLI binary"
	@echo "  build-server   - Build server-only binary"  
	@echo "  test           - Run all tests"
	@echo "  test-coverage  - Run tests with coverage report"
	@echo "  clean          - Clean build artifacts"
	@echo "  deps           - Install/update dependencies"
	@echo "  install        - Install binary to system PATH"
	@echo "  dev            - Start development server (with air if available)"
	@echo "  dev-simple     - Start development server (direct go run)"
	@echo "  run-cli        - Run CLI directly (ARGS=command line args)"
	@echo "  run            - Build and run CLI (ARGS=command line args)"
	@echo "  fmt            - Format code"
	@echo "  lint           - Run linter (requires golangci-lint)"
	@echo "  release        - Build release binaries for multiple platforms"
	@echo "  help           - Show this help"
	@echo ""
	@echo "Examples:"
	@echo "  make build"
	@echo "  make run ARGS='--help'"
	@echo "  make run-cli ARGS='status'"
	@echo "  make dev"