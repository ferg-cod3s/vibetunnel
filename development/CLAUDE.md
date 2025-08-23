# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a development workspace for two high-performance implementations of the TunnelForge terminal sharing server:

1. **Go Server** (`go-server/`) - Complete production-ready implementation with authentication, security middleware, and comprehensive testing
2. **Bun Web Server** (`bun-web/`) - Modern TypeScript-based web interface using Bun runtime

Both servers are designed to replace the Node.js implementation in the main TunnelForge project with better performance and resource efficiency.

## Commands

### Go Server Development (`go-server/`)

```bash
# Install dependencies
go mod tidy

# Run server (port 4021)
go run cmd/server/main.go

# Run with live reload (install air first: go install github.com/cosmtrek/air@latest)
air

# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test ./internal/session -v

# Run benchmarks
cd benchmarks && ./run_benchmarks.sh

# Build binary
go build -o tunnelforge-server cmd/server/main.go
```

### Bun Web Server Development (`bun-web/`)

```bash
# Install dependencies
bun install

# Run development server (hot reload)
bun run dev

# Build for production
bun run build

# Start production server
bun run start
```

## Architecture Overview

### Go Server Architecture

The Go server follows a clean, modular architecture:

```
go-server/
├── cmd/server/          # Entry point with graceful shutdown
├── internal/
│   ├── auth/           # JWT and password authentication
│   ├── config/         # Configuration management
│   ├── middleware/     # Security, auth, CORS middleware
│   ├── server/         # HTTP server with routing (Gorilla Mux)
│   ├── session/        # Terminal session lifecycle management
│   ├── terminal/       # PTY creation and I/O handling (creack/pty)
│   └── websocket/      # WebSocket communication (Gorilla WebSocket)
├── pkg/types/          # Shared types and data structures
├── benchmarks/         # Performance testing suite
└── test/              # Integration tests
```

#### Key Components

- **Session Manager** (`internal/session/manager.go`): Thread-safe session lifecycle management with UUID-based session IDs
- **PTY Handler** (`internal/terminal/`): Terminal process creation using `creack/pty` with optimized I/O handling
- **WebSocket Handler** (`internal/websocket/handler.go`): Bidirectional terminal streaming with ping/pong keepalive
- **Authentication** (`internal/auth/`): JWT tokens and password-based authentication with bcrypt
- **Security Middleware** (`internal/middleware/`): CSRF protection, rate limiting, security headers

#### Communication Protocol

1. **Session Creation**: `POST /api/sessions` creates new terminal with PTY
2. **WebSocket Connection**: `GET /ws?sessionId={id}` for bidirectional terminal I/O
3. **Input Handling**: JSON messages over WebSocket (`{"type": "input", "data": "command"}`)
4. **Output Streaming**: Raw terminal output streamed over WebSocket
5. **Session Management**: `GET /api/sessions`, `DELETE /api/sessions/{id}`

### Bun Web Server Architecture

Simple proxy server that forwards API requests to Go server backend while serving static files:

- **Static File Serving**: Serves frontend assets from `public/` directory
- **API Proxy**: Forwards `/api/*` requests to Go server (configurable URL)
- **Client-side Routing**: Falls back to `index.html` for SPA routing

### Testing Strategy

#### Go Server Tests
- **Unit Tests**: 22 comprehensive tests across all modules (>90% coverage)
- **Integration Tests**: End-to-end WebSocket and HTTP API testing
- **Performance Tests**: Concurrent connection testing, response time benchmarks
- **Security Tests**: Authentication flows, CSRF protection, input validation

#### Test Execution
```bash
# Run all tests with verbose output
go test -v ./...

# Run tests with race detection
go test -race ./...

# Generate coverage report
go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out
```

## Performance Characteristics

### Go Server Performance (Benchmarked)

- **HTTP API**: <1ms average response time for all endpoints
- **WebSocket**: Supports 1000+ concurrent connections
- **Memory Usage**: ~88MB RSS with multiple active sessions
- **Startup Time**: <100ms cold start
- **Binary Size**: ~15MB single executable

### Ports Configuration

- **Go Server**: Port 4021 (production-ready)
- **Bun Web Server**: Port 3000 (configurable via PORT env var)
- **Go Server Backend**: Port 8080 (configurable via GO_SERVER_URL env var)

## Development Workflow

### Running Both Servers Together

```bash
# Terminal 1: Start Go server
cd go-server && go run cmd/server/main.go

# Terminal 2: Start Bun web interface
cd bun-web && bun run dev

# Terminal 3: Test endpoints
curl http://localhost:4021/health  # Go server health check
curl http://localhost:3000/api/sessions  # Proxied through Bun to Go server
```

### Testing Against Live Servers

1. **Go Server Direct**: `ws://localhost:4021/ws?sessionId={id}`
2. **Through Bun Proxy**: Access Go server via Bun's API proxy
3. **Health Checks**: Both servers provide `/health` endpoints

## Security Implementation

The Go server includes comprehensive security features:

- **JWT Authentication**: RS256 tokens with configurable expiry
- **Password Hashing**: bcrypt with cost 12
- **CSRF Protection**: Double-submit cookie pattern
- **Rate Limiting**: 100 requests/minute per IP
- **Security Headers**: HSTS, CSP, X-Frame-Options
- **Input Validation**: All API inputs sanitized and validated
- **CORS**: Configurable origins and methods

## Key Files

- **Go Server Entry**: `go-server/cmd/server/main.go`
- **HTTP Server Setup**: `go-server/internal/server/server.go`
- **Session Management**: `go-server/internal/session/manager.go`
- **WebSocket Handler**: `go-server/internal/websocket/handler.go`
- **Terminal PTY**: `go-server/internal/terminal/pty.go`
- **Bun Server**: `bun-web/src/server.ts`
- **Project Roadmap**: `TODO.md`

## Dependencies

### Go Dependencies
- `gorilla/mux`: HTTP routing
- `gorilla/websocket`: WebSocket communication
- `creack/pty`: Terminal PTY management
- `golang-jwt/jwt/v5`: JWT authentication
- `google/uuid`: Session ID generation
- `rs/cors`: CORS handling

### Bun Dependencies
- `bun`: Runtime and package manager
- `@types/node`: TypeScript definitions

## Task Management

**Official TODO List**: All development tasks, priorities, and roadmap are tracked in `TODO.md`. This file contains:
- Completed phases (1-5: Core functionality, authentication, security)
- Current priorities and next steps
- Detailed implementation plans for upcoming features
- Performance benchmarks and success metrics

Refer to `TODO.md` for the complete development roadmap and current task priorities.

## Current Status

- ✅ **Go Server**: Production-ready with full feature parity, authentication, and security
- ✅ **Performance Testing**: Exceeds targets (A+ grade)
- ✅ **Test Coverage**: 22 tests with >90% coverage
- 🚧 **Bun Integration**: Basic proxy functionality complete
- 🔜 **File System API**: Next major feature development
- 🔜 **Git Integration**: Repository management endpoints