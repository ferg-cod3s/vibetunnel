<!-- Generated: 2025-01-27 17:45:00 UTC -->
# TunnelForge Project Overview

> **🔄 Refactoring in Progress**: TunnelForge is currently being refactored from the legacy Node.js + SwiftUI architecture to a modern Go + Bun + Tauri architecture. This document describes the **TARGET IMPLEMENTATION** being developed.

## Current Status

**Legacy Implementation** (Being Replaced):
- Node.js server with Express routing
- SwiftUI macOS app with menu bar integration
- Port 4020

**Target Implementation** (In Development):
- Go server backend for high-performance terminal management
- Bun web server for modern TypeScript frontend
- Tauri v2 desktop apps for cross-platform support
- Port 4021 (Go server) + 3001 (Bun web)

## Target Architecture

TunnelForge will turn any browser into a terminal for your computer, enabling remote access to command-line tools and AI agents from any device. Built for developers who need to monitor long-running processes, check on AI coding assistants, or share terminal sessions without complex SSH setups.

The project will provide cross-platform desktop applications that run a local Go HTTP server with WebSocket support for real-time terminal streaming. Users will access their terminals through a responsive web interface at `http://localhost:3001`, with the Go server running on port 4021 for terminal management.

## Key Files

**Main Entry Points**
- `development/go-server/cmd/server/main.go` - Go server entry point
- `development/bun-web/src/server.ts` - Bun web server entry point
- `development/tauri-app/src-tauri/` - Tauri desktop app backend
- `development/tauri-app/src/` - Tauri desktop app frontend

**Core Configuration**
- `development/go-server/go.mod` - Go dependencies and module definition
- `development/bun-web/package.json` - Bun dependencies and build scripts
- `development/tauri-app/tauri.conf.json` - Tauri configuration

## Technology Stack

**Go Server Backend** - High-performance Go server
- HTTP server: `development/go-server/internal/server/server.go`
- Terminal management: `development/go-server/internal/terminal/pty.go`
- Session management: `development/go-server/internal/session/manager.go`
- PTY integration: `creack/pty` for native terminal process creation

**Bun Web Server** - Modern TypeScript-based web interface
- HTTP/WebSocket server: `development/bun-web/src/server.ts`
- API proxy to Go server backend
- Static file serving with caching
- Native SSE implementation

**Tauri Desktop Applications** - Cross-platform desktop apps
- Rust backend with web frontend using Tauri v2
- Native system integration (tray, notifications, file system)
- Cross-platform support (macOS, Windows, Linux)
- Manages Go server lifecycle as subprocess

**Web Frontend** - Modern TypeScript/Lit web components  
- Terminal rendering: `development/bun-web/src/client/components/terminal-viewer.ts`
- WebSocket client: `development/bun-web/src/client/lib/websocket-client.ts`
- UI styling: Tailwind CSS
- Build system: Bun bundler

## Platform Support

**Desktop Requirements**
- **macOS**: macOS 14.0+ (Sonoma or later)
- **Windows**: Windows 10+ (64-bit)
- **Linux**: Ubuntu 20.04+, Debian 11+, or equivalent
- **Build Tools**: Go 1.21+, Bun 1.0+, Rust 1.70+

**Server Platforms**
- **Go Server**: Any platform supported by Go (macOS, Linux, Windows)
- **Bun Web Server**: Any platform supported by Bun (macOS, Linux, Windows)
- **Headless Support**: Perfect for VPS/cloud deployments

**Browser Support**
- Modern browsers with WebSocket support
- Mobile-responsive design for phones/tablets
- Terminal rendering via canvas/WebGL

**Key Platform Files**
- Go server: `development/go-server/`
- Bun web server: `development/bun-web/`
- Tauri desktop apps: `development/tauri-app/`
- Cross-platform distribution via Tauri