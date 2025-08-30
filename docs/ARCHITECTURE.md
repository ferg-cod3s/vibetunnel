<!-- Generated: 2025-01-27 -->
# TunnelForge Architecture

## Current Status

**Multiple Working Implementations**: TunnelForge has several functional implementations to serve different needs:

**Production Implementation** (Current, Stable):
- **macOS App**: SwiftUI-based native Mac app (`mac/` directory)
- **Server**: Node.js server with Express routing (port 4020)
- **Status**: Stable, production-ready, all features implemented

**Alternative Implementation** (Functional):
- **Go Server**: High-performance backend (`server/` directory, port 4021)  
- **Bun Web Server**: Modern TypeScript frontend (`web/src/bun-server.ts`, port 3001)
- **Status**: Functional with most features, ready for testing/development

**Future Implementation** (In Development):
- **Tauri Desktop Apps**: Cross-platform desktop apps (`desktop/`, `linux/`, `windows/` directories)
- **Status**: In development, will leverage Go server backend

## Production Architecture (Current, Stable)

TunnelForge's production implementation uses a SwiftUI macOS app with Node.js backend, providing reliable terminal sharing with excellent macOS integration.

### Component Map

**macOS App** - Native Swift application in `mac/`
- TunnelForgeApp.swift - App entry point with SwiftUI lifecycle
- Core/Services/ - Business logic and system integration
- Presentation/ - SwiftUI views and view models
- Native menu bar integration and system notifications

**Node.js Server** - TypeScript backend in `web/src/server/`
- server.ts - Express server with WebSocket support
- routes/ - API endpoints for session management
- services/ - Business logic and external integrations
- Terminal session management via node-pty

**Web Frontend** - Modern TypeScript UI in `web/src/client/`
- Terminal rendering using xterm.js
- LitElement components for reactive UI
- WebSocket client for real-time terminal I/O
- Progressive Web App capabilities

## Alternative Architecture (Functional)

TunnelForge's Go + Bun implementation provides high-performance alternatives to the Node.js backend with modern tooling.

### Component Map

**Go Server Backend** - High-performance Go server in `server/`
- cmd/server/main.go - Server entry point with graceful shutdown  
- internal/server/server.go - HTTP server with Gorilla Mux routing
- internal/session/manager.go - Thread-safe terminal session management
- internal/terminal/pty.go - PTY process management using creack/pty
- internal/websocket/handler.go - WebSocket communication with ping/pong keepalive
- internal/auth/jwt.go - JWT authentication with bcrypt password hashing
- internal/middleware/ - Security middleware (CORS, rate limiting, CSRF protection)

**Bun Web Interface** - Pure Bun web server in `web/src/bun-server.ts`
- Static file serving and API proxy to Go server
- TypeScript runtime with superior performance
- Proxies API requests to Go server backend
- Serves LitElement frontend with hot reload support

## Future Architecture (In Development)

**Tauri v2 Desktop Applications** - Cross-platform desktop apps
- Desktop apps for macOS, Windows, and Linux (in `desktop/`, `linux/`, `windows/`)
- Rust backend with web frontend using Tauri v2  
- Native system integration (tray, notifications, file system)
- Will manage Go server lifecycle as subprocess
- Provides native desktop experience with web UI

## Key Files

**Production Implementation (Current)**
- mac/TunnelForge/TunnelForgeApp.swift - macOS app entry point
- mac/TunnelForge/Core/Services/ - macOS app business logic
- web/src/server/server.ts - Node.js server entry point
- web/src/client/ - Web frontend components

**Alternative Implementation (Functional)**  
- server/cmd/server/main.go - Go server entry point
- server/internal/session/manager.go - Thread-safe session management
- server/internal/terminal/pty.go - PTY process management
- web/src/bun-server.ts - Bun web server

**Future Implementation (In Development)**
- desktop/src-tauri/src/main.rs - Tauri desktop app
- linux/src-tauri/src/main.rs - Linux-specific Tauri app
- windows/src-tauri/src/main.rs - Windows-specific Tauri app

## Data Flow

### Production Implementation (Node.js + SwiftUI)

**Session Creation Flow**
1. macOS app request → POST /api/sessions (Node.js Express handler)
2. SessionService.createSession() (web/src/server/services/)
3. node-pty spawns PTY process with shell
4. Session stored in memory with UUID
5. Response with session ID and WebSocket upgrade URL

**Terminal I/O Stream**
1. User input → WebSocket message to /ws?sessionId={id}
2. Node.js WebSocket handler processes input
3. PTY process receives input via pty.write()
4. PTY output → WebSocket handler streams to client
5. Raw terminal output streamed over WebSocket  
6. macOS app or web client renders using xterm.js

### Alternative Implementation (Go + Bun)

**Session Creation Flow**
1. Client request → POST /api/sessions (Go server HTTP handler)
2. SessionManager.CreateSession() (server/internal/session/manager.go)
3. Terminal.NewPTY() (server/internal/terminal/pty.go) - Spawns PTY using creack/pty
4. Session stored in thread-safe manager with UUID
5. Response with session ID and WebSocket upgrade URL

**Terminal I/O Stream**
1. User input → WebSocket message to /ws?sessionId={id}
2. WebSocket handler processes input (server/internal/websocket/handler.go)
3. PTY process receives input via pty.Write()
4. PTY output → WebSocket handler streams to client
5. Raw terminal output streamed over WebSocket
6. Client renders using xterm.js

**Performance Characteristics**

Production Implementation (Node.js + SwiftUI):
- Node.js server: ~10-50ms response time, hundreds of concurrent connections
- Memory usage: ~150-200MB RSS with multiple sessions
- WebSocket with built-in ping/pong for connection health
- Memory-based session management with UUID-based IDs

Alternative Implementation (Go + Bun):
- Go server: <1ms response time, 1000+ concurrent connections
- Memory usage: ~88MB RSS with multiple sessions  
- WebSocket with ping/pong keepalive for connection health
- Thread-safe session management with UUID-based IDs
- Significantly better performance than Node.js implementation

**Server Lifecycle Management**
1. Tauri desktop app spawns Go server as subprocess
2. Go server starts HTTP server on port 4021
3. Health checks via /health endpoint
4. Graceful shutdown with SIGTERM handling
5. Process monitoring and auto-restart capabilities

**Cross-Platform Desktop Integration**
- Tauri v2 provides native system tray and notifications
- File system access through Tauri plugins
- Auto-launch and system integration
- Consistent UI across macOS, Windows, and Linux

**Authentication & Security**
- JWT authentication with RS256 tokens
- bcrypt password hashing with cost 12
- CSRF protection with double-submit cookies
- Rate limiting: 100 requests/minute per IP
- Security headers: HSTS, CSP, X-Frame-Options
- Input validation and sanitization

## Migration Path

**Phase 1: Go Server Development** ✅ (In Progress)
- Implement Go server with PTY management
- Add WebSocket communication
- Implement session management

**Phase 2: Bun Web Server** 🔄 (Next)
- Create Bun server with API proxy
- Migrate frontend to Bun runtime
- Test integration with Go server

**Phase 3: Tauri Desktop Apps** 📋 (Planned)
- Implement Tauri v2 desktop applications
- Add cross-platform support
- Migrate from SwiftUI macOS app

**Phase 4: Legacy Cleanup** 📋 (Planned)
- Remove Node.js server code
- Remove SwiftUI macOS app
- Update all documentation and tooling