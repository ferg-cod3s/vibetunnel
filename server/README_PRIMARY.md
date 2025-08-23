# TunnelForge Go Server (PRIMARY)

## 🎯 Status: PRIMARY PRODUCTION SERVER

This is the **primary production server** for TunnelForge, written in Go for high performance and reliability.

## Architecture Role

- **Primary Server**: This Go implementation is the main backend for all TunnelForge deployments
- **Port**: 4021 (production standard)
- **Performance**: <1ms response time, 1000+ concurrent connections
- **Memory**: ~88MB RSS with multiple active sessions

## Key Features

- ✅ High-performance terminal session management
- ✅ WebSocket-based real-time I/O streaming
- ✅ JWT authentication with bcrypt
- ✅ Rate limiting and CSRF protection
- ✅ Thread-safe session management
- ✅ Graceful shutdown handling

## Building

```bash
# Build for current platform
make build

# Build for all platforms
make build-all

# Build and install locally
make install
```

## Running

```bash
# Run with default settings (port 4021)
./bin/tunnelforge-server

# Run with custom port
./bin/tunnelforge-server --port 8080

# Run with authentication required
./bin/tunnelforge-server --auth-required

# Development mode with hot reload
air
```

## API Endpoints

- `POST /api/sessions` - Create new terminal session
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `DELETE /api/sessions/:id` - Terminate session
- `GET /ws?sessionId={id}` - WebSocket connection for terminal I/O
- `GET /health` - Health check endpoint

## Directory Structure

```
server/
├── cmd/server/          # Entry point
├── internal/
│   ├── auth/           # Authentication (JWT, bcrypt)
│   ├── config/         # Configuration management
│   ├── middleware/     # Security middleware
│   ├── server/         # HTTP server (Gorilla Mux)
│   ├── session/        # Session management
│   ├── terminal/       # PTY handling (creack/pty)
│   └── websocket/      # WebSocket handling
├── pkg/types/          # Shared types
├── bin/                # Compiled binaries (git-ignored)
└── benchmarks/         # Performance tests
```

## Integration Points

### Desktop App (Tauri)
The Tauri desktop app spawns this server as a subprocess and manages its lifecycle.

### Web Frontend
The TypeScript/LitElement frontend connects via WebSocket for terminal I/O.

### Migration from Node.js
This server replaces the legacy Node.js implementation in `web/`. The Node.js version is kept only for npm package distribution.

## Performance Benchmarks

```
HTTP Endpoints:
- Session Creation: 0.8ms avg
- Session List: 0.3ms avg
- Health Check: 0.1ms avg

WebSocket:
- Message Latency: <1ms
- Concurrent Connections: 1000+
- Memory per Session: ~8MB
```

## Development

```bash
# Install dependencies
go mod tidy

# Run tests
go test ./...

# Run with coverage
go test -cover ./...

# Run benchmarks
cd benchmarks && ./run_benchmarks.sh
```

## Migration Note

**This Go server is the future of TunnelForge**. The Node.js server in `../web/` is being phased out and should only be used for npm package distribution to support legacy installations.

All new features should be implemented here, not in the Node.js server.
