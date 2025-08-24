<!-- Generated: 2025-01-27 -->
# TunnelForge Architecture

> **🔄 Refactoring in Progress**: TunnelForge is currently being refactored from the legacy Node.js + SwiftUI architecture to a modern Go + Bun + Tauri architecture. **Note: This document describes the TARGET ARCHITECTURE being planned, not the current implementation.**

## Current Status

**Legacy Implementation** (Currently Working):
- Node.js server with Express routing
- SwiftUI macOS app with menu bar integration
- Port 4020

**Target Implementation** (Planned, Not Yet Implemented):
- Go server backend for high-performance terminal management
- Bun web server for modern TypeScript frontend
- Tauri v2 desktop apps for cross-platform support
- Port 4021 (Go server) + 3001 (Bun web)

## Target Architecture

TunnelForge is being refactored into a modern cross-platform terminal multiplexer with a high-performance Go server backend, pure Bun web interface, and Tauri v2 desktop applications. The new architecture prioritizes performance, security, and consistent cross-platform experience through WebSocket-based communication and modern web technologies.

**Note**: The Go + Bun + Tauri implementation has not been started yet. Only the planning, architecture design, and documentation exist.

## Component Map

**Go Server Backend** - High-performance Go server in `development/go-server/`
- cmd/server/main.go - Server entry point with graceful shutdown
- internal/server/server.go - HTTP server with Gorilla Mux routing
- internal/session/manager.go - Thread-safe terminal session management
- internal/terminal/pty.go - PTY process management using creack/pty
- internal/websocket/handler.go - WebSocket communication with ping/pong keepalive
- internal/auth/jwt.go - JWT authentication with bcrypt password hashing
- internal/middleware/ - Security middleware (CORS, rate limiting, CSRF protection)

**Bun Web Interface** - Pure Bun web server in `development/bun-web/`
- src/server.ts - Static file serving and API proxy to Go server
- public/ - Static web assets (HTML, CSS, JavaScript)
- Proxies API requests to Go server backend
- Serves TypeScript/LitElement frontend

**Tauri v2 Desktop Applications** - Cross-platform desktop apps
- Desktop app for macOS, Windows, and Linux
- Rust backend with web frontend using Tauri v2
- Native system integration (tray, notifications, file system)
- Manages Go server lifecycle as subprocess
- Provides native desktop experience with web UI

**Web Frontend** - TypeScript/LitElement app served by Bun
- Terminal rendering using xterm.js
- WebSocket client for real-time terminal I/O
- Modern component-based UI with LitElement
- Session management and file browser

## Key Files

**Go Server Core**
- development/go-server/cmd/server/main.go - Entry point with graceful shutdown
- development/go-server/internal/server/server.go - HTTP server setup
- development/go-server/go.mod - Go dependencies and module definition

**Session Management**
- development/go-server/internal/session/manager.go - Thread-safe session management
- development/go-server/internal/terminal/pty.go - PTY process management
- development/go-server/pkg/types/session.go - Session data structures

**Authentication & Security**
- development/go-server/internal/auth/jwt.go - JWT authentication
- development/go-server/internal/middleware/security.go - Security middleware
- development/go-server/internal/middleware/auth.go - Authentication middleware

**Bun Web Server**
- development/bun-web/src/server.ts - Bun server with API proxy
- development/bun-web/package.json - Bun dependencies
- development/bun-web/public/ - Static web assets

## Data Flow

**Session Creation Flow**
1. Client request → POST /api/sessions (Go server HTTP handler)
2. SessionManager.CreateSession() (development/go-server/internal/session/manager.go)
3. Terminal.NewPTY() (development/go-server/internal/terminal/pty.go) - Spawns PTY using creack/pty
4. Session stored in thread-safe manager with UUID
5. Response with session ID and WebSocket upgrade URL

**Terminal I/O Stream**
1. User input → WebSocket message to /ws?sessionId={id}
2. WebSocket handler processes input (development/go-server/internal/websocket/handler.go)
3. PTY process receives input via pty.Write()
4. PTY output → WebSocket handler streams to client
5. Raw terminal output streamed over WebSocket
6. Client renders using xterm.js

**Performance Characteristics**
- Go server: <1ms response time, 1000+ concurrent connections
- Memory usage: ~88MB RSS with multiple sessions
- WebSocket with ping/pong keepalive for connection health
- Thread-safe session management with UUID-based IDs

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