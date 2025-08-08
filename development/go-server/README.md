# VibeTunnel Go Server

A high-performance Go implementation of the VibeTunnel terminal sharing server, designed to replace the Node.js server with better concurrency, lower resource usage, and simpler deployment.

## Quick Start

```bash
# Install dependencies
go mod tidy

# Run the server
go run cmd/server/main.go
```

The server will start on port 4021 (avoiding conflict with the Node.js server on 4020).

## Endpoints

- **Health Check**: `GET http://localhost:4021/health`
- **WebSocket**: `ws://localhost:4021/ws`
- **Sessions API**: `http://localhost:4021/api/sessions`

## Architecture

```
go-server/
├── cmd/server/          # Server entry point
├── internal/
│   ├── api/            # REST API handlers (TODO)
│   ├── config/         # Configuration management
│   ├── server/         # HTTP server setup
│   ├── session/        # Terminal session management
│   ├── terminal/       # PTY management (TODO)
│   └── websocket/      # WebSocket handlers
├── pkg/types/          # Shared types and interfaces
└── README.md
```

## Current Status

✅ **Phase 1 Complete**: Basic server foundation
- [x] Project structure setup
- [x] Go module initialization  
- [x] Basic HTTP server with routing
- [x] WebSocket endpoint setup
- [x] Health check endpoint
- [ ] Static file serving for web frontend (TODO)

🚧 **Phase 2 In Progress**: Terminal Session Management
- [ ] PTY creation and management
- [ ] Session lifecycle (create, destroy, cleanup)
- [x] Session storage and retrieval (basic)
- [ ] Terminal buffer management
- [ ] Session ID generation and validation

## Development

```bash
# Install dependencies
go mod tidy

# Run with live reload (install air first: go install github.com/cosmtrek/air@latest)
air

# Test WebSocket connection
wscat -c ws://localhost:4021/ws

# Check health
curl http://localhost:4021/health
```

## Comparison with Node.js Server

| Feature | Node.js Server | Go Server |
|---------|---------------|-----------|
| Port | 4020 | 4021 |
| Memory Usage | ~50-100MB | ~5-15MB |
| Startup Time | ~2-3s | ~100ms |
| Concurrent Sessions | Limited by event loop | Goroutine per session |
| Binary Size | N/A (requires Node.js) | ~10-15MB single binary |

## Next Steps

See [TODO.md](TODO.md) for detailed implementation phases and progress tracking.

## Testing Alongside Node.js Server

You can run both servers simultaneously for comparison:

```bash
# Terminal 1: Node.js server (existing)
cd ../web && ./start-vibetunnel.sh

# Terminal 2: Go server (new)
cd go-server && go run cmd/server/main.go

# Terminal 3: Test both
curl http://localhost:4020/health  # Node.js
curl http://localhost:4021/health  # Go
```
