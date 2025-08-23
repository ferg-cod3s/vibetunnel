# TunnelForge Go Server - Current Architecture

## Overview
The current TunnelForge Go server follows a modular, layered architecture with direct component coupling and synchronous event broadcasting.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Web Frontend     │  macOS App      │  CLI Tools        │  External Clients        │
│  (JavaScript)     │  (Swift)        │  (tunnelforge)     │  (curl, etc.)            │
└─────────────┬─────────────┬─────────────────┬─────────────────────┬─────────────────┘
              │             │                 │                     │
         ┌────▼─────┐  ┌────▼─────┐     ┌────▼─────┐         ┌────▼─────┐
         │WebSocket │  │WebSocket │     │HTTP API  │         │HTTP API  │
         │/ws       │  │/buffers  │     │/api/*    │         │/health   │
         └────┬─────┘  └────┬─────┘     └────┬─────┘         └────┬─────┘
              │             │                │                    │
┌─────────────▼─────────────▼────────────────▼────────────────────▼─────────────────────┐
│                              HTTP SERVER (Gorilla Mux)                               │
│                                   Port 4021                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                               MIDDLEWARE STACK                                       │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │
│ │IP Whitelist │→│   CSRF      │→│Rate Limiter │→│Request Log  │→│Security Hdrs│     │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     │
│                                        │                                            │
│                               ┌────────▼────────┐                                   │
│                               │  CORS Handler   │                                   │
│                               └────────┬────────┘                                   │
├────────────────────────────────────────▼────────────────────────────────────────────┤
│                                SERVICE LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Session    │    │  WebSocket   │    │    Buffer    │    │     Auth     │      │
│  │   Manager    │    │   Handler    │    │ Aggregator   │    │   Services   │      │
│  │              │    │              │    │              │    │              │      │
│  │ • Create     │    │ • Connect    │    │ • Binary     │    │ • JWT Auth   │      │
│  │ • List       │    │ • Input/Out  │    │ • Magic 0xBF │    │ • Password   │      │
│  │ • Delete     │    │ • Ping/Pong  │    │ • Subscribe  │    │ • Middleware │      │
│  │ • Resize     │    │ • Origin     │    │ • Stream     │    │ • User Ctx   │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────────────┘      │
│         │                   │                   │                                  │
│         ▼                   ▼                   ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        TERMINAL LAYER                                       │  │
│  │ ┌──────────────┐                           ┌──────────────┐                 │  │
│  │ │   PTY        │  ◄──────────────────────► │   Process    │                 │  │
│  │ │   Manager    │                           │   Spawner    │                 │  │
│  │ │              │                           │              │                 │  │
│  │ │ • creack/pty │                           │ • /bin/bash  │                 │  │
│  │ │ • I/O Stream │                           │ • Working Dir│                 │  │
│  │ │ • Resize     │                           │ • Env Vars   │                 │  │
│  │ └──────────────┘                           └──────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                             FILESYSTEM & GIT LAYER                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ FileSystem   │    │     Git      │    │ Git Follow   │    │    Events    │      │
│  │   Service    │    │   Service    │    │    Mode      │    │ Broadcaster  │      │
│  │              │    │              │    │              │    │              │      │
│  │ • List/Download │  │ • Status     │    │ • Worktrees  │    │ • SSE Stream │      │
│  │ • Upload       │  │ • Branches   │    │ • Hooks      │    │ • Session    │      │
│  │ • Create/Delete│  │ • Checkout   │    │ • Sync       │    │ • Git Events │      │
│  │ • Path Security│  │ • Security   │    │ • Config     │    │ • Heartbeat  │      │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│                             │                   │                   │              │
│                             ▼                   ▼                   ▼              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                          DIRECT COUPLING & BROADCASTING                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│    SessionManager ────► EventBroadcaster ────► SSE Clients (/api/events)           │
│    GitService ────────► EventBroadcaster ────► Web Frontend                        │
│    Server Events ─────► EventBroadcaster ────► macOS App                           │
│                                                                                     │
│    • session-start, session-exit, session-resize                                   │
│    • git-follow-enabled, git-branch-switch, git-worktree-sync                      │
│    • connected, heartbeat, server-shutdown, test-notification                      │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Current Data Flow

### 1. **Session Management Flow**
```
CLI/Web Request → HTTP Server → Session Manager → PTY Creation → Process Spawn
                                      ↓
                               Event Broadcast → SSE Clients
```

### 2. **Git Integration Flow**
```
Git Hook → CLI Command → HTTP API → Git Service → Follow Mode → Branch Sync
                                           ↓
                                   Event Broadcast → SSE Clients
```

### 3. **Real-time Communication Flow**
```
WebSocket Client → WebSocket Handler → Session Manager → PTY I/O
Buffer Client → Buffer Aggregator → Binary Protocol → Terminal Stream
```

## Current Architecture Strengths

1. **Modular Design**: Clear separation of concerns with internal packages
2. **Security First**: Comprehensive middleware stack with multiple layers
3. **Performance**: Optimized PTY handling and binary buffer streaming  
4. **Comprehensive**: Full feature parity with session management, Git integration
5. **Type Safety**: Strong typing with Go interfaces and structured events
6. **Testing**: Extensive test coverage with mocks and security hardening tests

## Current Architecture Limitations

1. **Direct Coupling**: Components directly reference each other
2. **Synchronous Broadcasting**: Events are processed synchronously
3. **Single Point of Failure**: EventBroadcaster is a bottleneck
4. **Limited Scalability**: Cannot easily distribute across multiple instances
5. **No Event Persistence**: Events are lost if clients disconnect
6. **Monolithic**: All services run in single process

## Key Components

### Core Services
- **SessionManager**: Terminal session lifecycle management
- **GitService**: Git operations with security validation
- **EventBroadcaster**: Server-Sent Events for real-time notifications
- **BufferAggregator**: Binary terminal streaming via WebSocket

### Security & Middleware
- **JWT Authentication**: Token-based auth with role-based access
- **Security Middleware**: CSRF, rate limiting, headers, IP whitelist
- **Input Validation**: Command injection and path traversal prevention
- **Path Security**: Base path restrictions for filesystem/git operations

### Terminal Management
- **PTY Manager**: Terminal process creation using creack/pty
- **WebSocket Handler**: Real-time terminal I/O with ping/pong keepalive
- **Process Spawner**: Secure command execution with environment isolation

## Configuration

- **Port**: 4021 (configurable via PORT env var)
- **Authentication**: Optional (AUTH_REQUIRED=true)
- **Security**: Rate limiting, CORS, security headers all configurable
- **Base Paths**: Filesystem and Git operations restricted to configured paths

## Current Feature Completeness

- ✅ **Core Terminal**: Session management, PTY, WebSocket, Buffer streaming
- ✅ **Authentication**: JWT, password auth, middleware integration  
- ✅ **Security**: Comprehensive hardening with 8+ security measures
- ✅ **Git Integration**: Follow mode, hooks, event processing, SSE broadcasting
- ✅ **Real-time Events**: SSE with 10+ event types for system notifications
- ✅ **API Compatibility**: Full REST API matching Node.js implementation
- 🔄 **Push Notifications**: Next priority - VAPID keys and Web Push service
- 🔄 **Session Persistence**: Recovery mechanisms for server restarts