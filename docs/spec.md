# TunnelForge Technical Specification (formerly VibeTunnel)

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Flows](#data-flows)
4. [Core Components](#core-components)
5. [Server Implementation](#server-implementation)
6. [Web Frontend](#web-frontend)
7. [iOS Application](#ios-application)
8. [Security Model](#security-model)
9. [Session Management](#session-management)
10. [CLI Integration](#cli-integration)
11. [API Specifications](#api-specifications)
12. [Binary Buffer Protocol](#binary-buffer-protocol)
13. [User Interface](#user-interface)
14. [Configuration System](#configuration-system)
15. [Build and Release](#build-and-release)
16. [Testing Strategy](#testing-strategy)
17. [Performance Requirements](#performance-requirements)
18. [Error Handling](#error-handling)
19. [Update System](#update-system)
20. [Platform Integration](#platform-integration)
21. [Data Formats](#data-formats)

## Executive Summary

### Project Overview

TunnelForge is a modern cross-platform terminal multiplexer that provides browser-based and native desktop access to terminal sessions. The project targets developers and engineers who need high-performance terminal sharing and remote monitoring capabilities, with special support for AI agents like Claude Code.

### Key Features

- **High-Performance Go Server**: <1ms response time, 1000+ concurrent connections
- **Cross-Platform Desktop Apps**: Native applications for macOS, Windows, and Linux via Tauri v2
- **Pure Bun Web Interface**: Fast web server with API proxy capabilities  
- **Zero-Configuration Access**: Launch terminals with simple commands
- **Real-Time Streaming**: WebSocket-based terminal I/O with optimal performance
- **Enterprise Security**: JWT authentication, bcrypt hashing, CSRF protection, rate limiting
- **Session Recording**: Full asciinema format recording support
- **Modern Web Frontend**: TypeScript/LitElement components with xterm.js rendering

### Technical Stack

- **Go Server Backend**: Go 1.23+ with Gorilla Mux, WebSocket, creack/pty
- **Bun Web Interface**: Pure Bun runtime with TypeScript
- **Tauri v2 Desktop Apps**: Rust backend + web frontend for cross-platform native apps
- **Web Frontend**: TypeScript, LitElement, xterm.js, Tailwind CSS
- **Legacy iOS App**: Swift 6.0, SwiftUI, iOS 17.0+ (to be updated)
- **Terminal Emulation**: xterm.js with custom buffer optimization
- **Build System**: Xcode, Swift Package Manager, npm/Bun
- **Distribution**: Signed/notarized DMG with Sparkle updates

## System Architecture

### Modern High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Tauri v2 Desktop Applications                 │
│               (macOS, Windows, Linux)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ System Tray │  │ Process      │  │ Native System    │  │
│  │ UI (Web)    │──│ Manager      │──│ Integration      │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │             Go Server Subprocess                     │  │
│  │  ┌──────────────────────────────────────────────┐   │  │
│  │  │ High-performance Go binary with PTY mgmt     │   │  │
│  │  │ JWT auth, WebSocket, creack/pty (Port 4021)  │   │  │
│  │  └──────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               │
                        ┌──────┴──────┐
                        │ HTTP/WS API │
                        └──────┬──────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│                    Client Access Methods                     │
├─────────────────────────────────────────────────────────────┤
│  Bun Web Interface              Legacy iOS App             │
│  ┌──────────────┐              ┌──────────────┐           │
│  │ Static Files │              │ WebSocket    │           │
│  │ API Proxy    │              │ Client       │           │
│  │ (Port 3000)  │              │ (iOS 17.0+)  │           │
│  └──────────────┘              └──────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                    Web Browsers                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ TypeScript/LitElement Frontend + xterm.js           │  │
│  │ Modern component architecture, responsive design    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Modern Component Interaction Flow

1. **Desktop App Launch**: Tauri v2 app starts Go server subprocess
2. **Terminal Access**: User opens web interface or uses desktop app
3. **Authentication**: JWT-based authentication with bcrypt password hashing
4. **Session Creation**: HTTP POST to Go server creates new terminal session
5. **PTY Allocation**: Go server allocates pseudo-terminal via creack/pty
6. **WebSocket Connection**: Client establishes WebSocket for real-time I/O
7. **Terminal Streaming**: Bidirectional terminal I/O over WebSocket
8. **Recording**: Session data recorded in asciinema format
9. **Session Cleanup**: Resources freed on terminal exit

### Design Principles

- **Single Server Implementation**: Go server backend with Bun web interface handles everything
- **Protocol-Oriented Swift**: Clean interfaces between macOS components
- **Binary Optimization**: Custom buffer protocol for efficient terminal streaming
- **Thread Safety**: Go goroutines and Bun runtime for concurrent safety
- **Minimal Dependencies**: Only essential third-party libraries
- **User Privacy**: No telemetry or user tracking

## Data Flows

### Terminal Session Lifecycle
1. User launches the `vt` command or selects **New Session** from the UI.
2. `ServerManager` verifies that the Bun server is running and starts it if needed.
3. A `POST /api/sessions` request triggers `TerminalManager.createTerminal()` on the server.
4. `PtyManager.spawn()` allocates a new PTY process and stores session metadata.
5. The server responds with the session ID and WebSocket URL.
6. Clients connect to `/api/sessions/:id/ws` and begin streaming using the binary buffer protocol.
7. Terminal output and input are recorded in asciinema format when recording is enabled.
8. On process exit, resources are cleaned up and the client is notified.

### Terminal I/O Flow
1. Keyboard input from the browser or iOS app is sent as JSON messages over the WebSocket.
2. `BufferAggregator` forwards the input to the PTY process.
3. PTY output is captured, aggregated and sent back as binary snapshots or text deltas.
4. The client updates its terminal display accordingly.

### Server Lifecycle Flow
1. Starting the macOS app or running `vt` launches `ServerManager`.
2. `BunServer` spawns the Bun-based HTTP/WebSocket server process.
3. Health checks hit `/api/health` to verify the server is alive.
4. On stop or crash, `ServerManager` gracefully shuts down or restarts the process.

### Remote Access Flow
1. When network mode is enabled, the server binds to `0.0.0.0` for remote access.
2. `NgrokService` or Tailscale can expose a secure public URL.
3. Remote clients reach the server through the tunnel and communicate over HTTPS.

### Authentication Flow
1. Clients request the dashboard or a session endpoint.
2. Basic Auth middleware checks credentials stored via `DashboardKeychain`.
3. Local bypass or token-based headers are honored if configured.
4. Successful authentication allows API and WebSocket communication.

## Core Components

### ServerManager

**Location**: `mac/TunnelForge/Core/Services/ServerManager.swift`

**Responsibilities**:
- Manages Bun server process lifecycle (start/stop/restart)
- Handles server configuration (port, bind address)
- Provides log streaming from server process
- Coordinates with other services (Ngrok, SessionMonitor)
- Manages server health checks

**Key Methods**:
```swift
func start() async
func stop() async  
func restart() async
func clearAuthCache() async
```

**State Management**:
- Uses `@Observable` for SwiftUI integration
- `@MainActor` ensures UI thread safety
- Publishes server state changes
- Maintains server configuration in UserDefaults

### BunServer

**Location**: `mac/TunnelForge/Core/Services/BunServer.swift`

**Responsibilities**:
- Spawns and manages the Bun executable process
- Handles process I/O streaming
- Monitors process health and auto-restarts
- Passes configuration via command-line arguments

**Key Features**:
- Embedded tunnelforge binary built with Bun
- Native PTY support via node-pty module
- Automatic crash recovery
- Log streaming to ServerManager

### SessionMonitor

**Location**: `mac/TunnelForge/Core/Services/SessionMonitor.swift`

**Responsibilities**:
- Polls server for active sessions
- Tracks session lifecycle
- Provides session counts for UI
- Handles session cleanup

**Key Features**:
- Real-time session tracking via polling
- Session metadata caching
- Automatic cleanup detection
- Performance monitoring

### TerminalManager

**Location**: `mac/TunnelForge/Core/Services/TerminalManager.swift`

**Responsibilities**:
- Integrates with macOS terminal applications
- Handles terminal app selection (Terminal.app, iTerm2, etc.)
- Manages AppleScript execution for terminal launching
- Provides terminal detection utilities

### NgrokService

**Location**: `mac/TunnelForge/Core/Services/NgrokService.swift`

**Responsibilities**:
- Manages ngrok tunnel lifecycle
- Provides secure public URLs
- Handles authentication token storage
- Monitors tunnel status

**Configuration**:
- API key management via Keychain
- Custom domain support
- Region selection
- Basic auth integration

## Server Implementation

### Go Server Backend

**Location**: `server/` directory

**Architecture**:
The server is built as a standalone Go binary that provides:
- High-performance Go server with Gorilla Mux routing
- Native PTY support using creack/pty
- WebSocket communication with Gorilla WebSocket
- JWT authentication with bcrypt password hashing
- Security middleware (CORS, rate limiting, CSRF protection)
- Single compiled binary with no dependencies

**Key Components**:
- `cmd/server/main.go` - HTTP server entry point with graceful shutdown
- `internal/server/server.go` - HTTP server setup with Gorilla Mux
- `internal/session/manager.go` - Thread-safe session management
- `internal/terminal/pty.go` - PTY process management using creack/pty
- `internal/websocket/handler.go` - WebSocket communication
- `internal/auth/jwt.go` - JWT authentication and password handling
- `internal/middleware/` - Security middleware and authentication

**Server Features**:
- High-performance Go runtime with goroutines
- Low-latency terminal I/O (<1ms response time)
- Native PTY handling with proper signal forwarding using creack/pty
- Thread-safe session management with UUID-based IDs
- WebSocket communication with ping/pong keepalive
- Graceful shutdown with SIGTERM handling
- Comprehensive security middleware

**Build Process**:
```bash
# Build standalone executable
cd server && go build -o vibetunnel-server cmd/server/main.go
# Creates ~15MB Go binary with no dependencies
```

## Web Frontend

### Technology Stack

**Location**: `web/src/client/` directory

**Core Technologies**:
- TypeScript for type safety
- Lit Web Components for modern component architecture
- Tailwind CSS for styling
- xterm.js for terminal rendering
- Custom WebSocket client for binary buffer protocol

### Component Architecture

```
web/src/client/
├── components/
│   ├── app-header.ts        - Application header
│   ├── session-list.ts      - Active session listing
│   ├── session-card.ts      - Individual session display
│   ├── session-view.ts      - Terminal container
│   ├── terminal.ts          - xterm.js wrapper
│   └── vibe-terminal-buffer.ts - Binary buffer handler
├── services/
│   └── buffer-subscription-service.ts - WebSocket management
├── utils/
│   ├── terminal-renderer.ts - Terminal rendering utilities
│   ├── terminal-preferences.ts - User preferences
│   └── url-highlighter.ts   - URL detection in terminal
└── styles.css               - Tailwind configuration
```

### Key Features

**Dashboard**:
- Real-time session listing with 3-second polling
- One-click terminal creation
- Session metadata display (command, duration, status)
- Responsive grid layout

**Terminal Interface**:
- Full ANSI color support via xterm.js
- Binary buffer protocol for efficient updates
- Copy/paste functionality
- Responsive terminal sizing
- URL highlighting and click support
- Mobile-friendly touch interactions

**Performance Optimizations**:
- Binary message format with 0xBF magic byte
- Delta compression for incremental updates
- Efficient buffer aggregation
- WebSocket reconnection logic
- Lazy loading of terminal sessions

## iOS Application

### Overview

**Location**: `ios/TunnelForge/` directory

**Purpose**: Native iOS companion app for mobile terminal access

### Architecture

**Key Components**:
- `TunnelForgeApp.swift` - Main app entry and lifecycle
- `BufferWebSocketClient.swift` - WebSocket client with binary protocol
- `TerminalView.swift` - Native terminal rendering
- `TerminalHostingView.swift` - UIKit bridge for terminal display
- `SessionService.swift` - Session management API client

### Features

- Native SwiftUI interface
- Server connection management
- Terminal rendering with gesture support
- Session listing and management
- Recording export functionality
- Advanced keyboard support

### Binary Buffer Protocol Support

The iOS app implements the same binary buffer protocol as the web client:
- Handles 0xBF magic byte messages
- Processes buffer snapshots and deltas
- Maintains terminal state synchronization
- Optimized for mobile bandwidth

## Security Model

### Authentication

**Authentication Modes**:
- System user password authentication (default)
- Optional SSH key authentication (`--enable-ssh-keys`)
- No authentication mode (`--no-auth`)
- Local bypass authentication (`--allow-local-bypass`)

**Local Bypass Security**:
- Allows localhost connections to bypass authentication
- Optional token authentication via `--local-auth-token`
- Implements anti-spoofing checks (IP, headers, hostname)
- See `web/SECURITY.md` for detailed security implications

**Implementation**:
- Main auth middleware: `web/src/server/middleware/auth.ts`
- Local bypass logic: `web/src/server/middleware/auth.ts:24-87`
- Security checks: `web/src/server/middleware/auth.ts:25-48`

### Network Security

**Access Control**:
- Localhost-only mode by default (127.0.0.1)
- Network mode binds to 0.0.0.0
- CORS configuration for web access
- No built-in TLS (use reverse proxy or tunnels)

**Secure Tunneling**:
- Tailscale integration for VPN access
- Ngrok support for secure public URLs
- Both provide TLS encryption
- Authentication handled by tunnel providers

### System Security

**macOS App Privileges**:
- Hardened runtime with specific entitlements
- Allows unsigned executable memory (for Bun)
- Allows DYLD environment variables
- Code signed with Developer ID
- Notarized for Gatekeeper approval

**Data Protection**:
- No persistent storage of terminal content
- Session recordings stored temporarily
- Passwords in Keychain with access control
- No telemetry or analytics

## Session Management

### Session Lifecycle

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Created │ --> │ Active  │ --> │ Exited  │ --> │ Cleaned │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

### Session Model

**TypeScript Definition** (`web/src/server/pty/types.ts`):
```typescript
export interface Session {
  id: string;
  pid: number;
  command: string;
  args: string[];
  cwd: string;
  startTime: number;
  status: 'running' | 'exited';
  exitCode?: number;
  cols: number;
  rows: number;
  recordingPath?: string;
}
```

### Session Operations

**Creation**:
1. Generate unique session ID (UUID)
2. Spawn PTY process with command
3. Initialize asciinema recording
4. Register with SessionManager
5. Return session details to client

**Monitoring**:
- Process exit detection
- Automatic status updates
- Resource usage tracking
- Idle timeout handling (optional)

**Termination**:
- SIGTERM to process group
- PTY cleanup
- Recording finalization
- WebSocket closure notification
- Memory cleanup

## CLI Integration

### tf Command (vt remains as legacy alias)

**Installation**:
The `tf` command is preferred; `vt` remains a legacy alias. The wrapper script automatically prepends 'fwd' to commands when using the Bun server.

**Script Location**: `/usr/local/bin/vt`
```bash
#!/bin/bash
# TunnelForge CLI wrapper for Bun server
exec /usr/local/bin/tunnelforge fwd "$@"
```

### tunnelforge Binary

**Location**: Embedded in app bundle, copied to `/usr/local/bin/tunnelforge`

**Commands**:
- `tunnelforge serve` - Start server (used internally)
- `tunnelforge fwd [command]` - Forward terminal session
- `tunnelforge version` - Show version information

### CLI Features

**Command Parsing**:
- Automatic 'fwd' prepending for vt wrapper
- Shell detection and setup
- Working directory preservation
- Environment variable handling
- Special Claude shortcuts (`--claude`, `--claude-yolo`)

**Session Creation Flow**:
1. Parse command-line arguments
2. Ensure server is running
3. Create session via API
4. Open browser to session URL
5. Return session information

## API Specifications

### RESTful API

**Base URL**: `http://localhost:4020` (default)

**Authentication**: Optional HTTP Basic Auth

#### Core Endpoints

**GET /api/health**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

**GET /api/sessions**
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "command": "zsh",
      "args": [],
      "cwd": "/Users/username",
      "startTime": 1704060000000,
      "status": "running",
      "cols": 80,
      "rows": 24
    }
  ]
}
```

**POST /api/sessions**
```json
// Request
{
  "command": "/bin/zsh",
  "args": ["-l"],
  "cwd": "/Users/username",
  "env": {},
  "cols": 80,
  "rows": 24,
  "recordingEnabled": true
}

// Response
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "pid": 12345,
  "webUrl": "/sessions/550e8400-e29b-41d4-a716-446655440000",
  "wsUrl": "/api/sessions/550e8400-e29b-41d4-a716-446655440000/ws"
}
```

**DELETE /api/sessions/:id**
```json
{
  "success": true
}
```

**GET /api/sessions/:id/snapshot**
Returns current terminal buffer state for initial render

**POST /api/sessions/:id/input**
Send keyboard input to terminal

**POST /api/sessions/:id/resize**
```json
{
  "cols": 120,
  "rows": 40
}
```

### WebSocket Protocol

**Endpoint**: `/api/sessions/:id/ws`

**Binary Buffer Protocol**: Messages use custom format for efficiency

## Binary Buffer Protocol

### Overview

The binary buffer protocol optimizes terminal data transmission by sending full buffer snapshots and incremental updates.

### Message Format

**Binary Message (TypedArray)**:
- First byte: 0xBF (magic byte)
- Remaining bytes: Terminal buffer data or commands

**Text Message (JSON)**:
- Input commands
- Resize events
- Control messages

### Protocol Flow

1. **Initial Connection**: 
   - Client connects to WebSocket
   - Server sends binary buffer snapshot
   
2. **Incremental Updates**:
   - Server aggregates terminal output
   - Sends deltas as text messages
   - Periodically sends full binary snapshots

3. **Client Input**:
   - Sent as JSON text messages
   - Contains 'input' type and data

### Implementation Details

**Server** (`web/src/server/services/buffer-aggregator.ts`):
- Maintains terminal buffer state
- Aggregates small updates
- Sends snapshots every 5 seconds or on major changes

**Web Client** (`web/src/client/components/vibe-terminal-buffer.ts`):
- Handles binary buffer messages
- Applies incremental updates
- Manages terminal state

**iOS Client** (`ios/TunnelForge/Services/BufferWebSocketClient.swift`):
- Same protocol implementation
- Optimized for mobile performance

## User Interface

### Menu Bar Application

**Components**:
- Status icon indicating server state
- Quick access menu
- Session count display
- Settings access
- About/Help options

**State Indicators**:
- Gray: Server stopped
- Green: Server running
- Red: Error state
- Animated: Starting/stopping

### Settings Window

**General Tab**:
- Server port configuration
- Launch at login toggle
- Show in Dock option
- Update channel selection

**Dashboard Tab**:
- Access mode (localhost/network)
- Password protection toggle
- Authentication settings
- Dashboard URL display

**Advanced Tab**:
- Cleanup on startup
- CLI tools installation
- Server console access
- Debug logging

**Debug Tab** (hidden by default):
- Server type display (Bun only)
- Console log viewer
- Diagnostic information

## Configuration System

### User Defaults

**Storage**: `UserDefaults.standard`

**Key Settings**:
```swift
serverPort: String = "4020"
dashboardAccessMode: String = "localhost"
dashboardPasswordEnabled: Bool = false
launchAtLogin: Bool = false
showDockIcon: Bool = false
cleanupOnStartup: Bool = true
```

### Keychain Integration

**DashboardKeychain Service**:
- Stores dashboard password securely
- Uses kSecClassInternetPassword
- Server and port-specific storage
- Handles password updates/deletion

### Configuration Flow

1. **App Launch**: Load settings from UserDefaults
2. **Server Start**: Pass configuration via CLI arguments
3. **Runtime Changes**: Update server without restart where possible
4. **Password Changes**: Clear server auth cache

## Build and Release

### Build System

**Requirements**:
- Xcode 16.0+
- macOS 14.0+ SDK
- Go 1.23+ and Bun runtime

**Build Process**:
```bash
# Complete build
cd mac && ./scripts/build.sh --configuration Release --sign

# Development build
cd mac && ./scripts/build.sh --configuration Debug
```

**Build Phases**:
1. Build Bun executable from web sources
2. Compile Swift application
3. Copy resources (Bun binary, web assets)
4. Code sign application
5. Create DMG for distribution

### Code Signing

**Entitlements** (`mac/TunnelForge/TunnelForge.entitlements`):
```xml
<key>com.apple.security.cs.allow-jit</key>
<true/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<true/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key>
<true/>
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
```

### Distribution

**Release Process**:
1. Build and sign application
2. Create notarized DMG
3. Generate Sparkle appcast
4. Upload to GitHub releases
5. Update appcast XML

**Package Contents**:
- ARM64-only binary (Apple Silicon required)
- Embedded Bun server executable
- Web assets and resources
- Sparkle update framework

## Testing Strategy

### macOS Tests

**Framework**: Swift Testing (Swift 6)

**Test Organization**:
```
mac/TunnelForgeTests/
├── ServerManagerTests.swift
├── SessionMonitorTests.swift
├── TerminalManagerTests.swift
├── DashboardKeychainTests.swift
├── CLIInstallerTests.swift
├── NetworkUtilityTests.swift
└── Utilities/
    ├── TestTags.swift
    ├── TestFixtures.swift
    └── MockHTTPClient.swift
```

**Test Tags**:
- `.critical` - Core functionality
- `.networking` - Network operations
- `.concurrency` - Async operations
- `.security` - Security features

### Go Server Tests

**Framework**: Go testing package

**Test Structure**:
```
server/
├── internal/
│   ├── auth/auth_test.go
│   ├── session/manager_test.go
│   ├── terminal/pty_test.go
│   └── websocket/handler_test.go
└── test/
    ├── integration_test.go
    └── security_test.go
```

**Coverage Requirements**:
- 80% line coverage
- 80% function coverage
- 80% branch coverage

## Performance Requirements

### Latency Targets

**Terminal I/O**:
- Keystroke to display: < 50ms
- Binary buffer update: < 100ms
- WebSocket ping/pong: < 10ms

**API Response Times**:
- Session list: < 50ms
- Session creation: < 200ms
- Health check: < 10ms

### Resource Usage

**Memory**:
- macOS app idle: < 50MB
- Bun server idle: < 100MB
- Per session: < 10MB
- Buffer cache: 64KB per session

**CPU**:
- Idle: < 1%
- Active session: < 5%
- Multiple sessions: Linear scaling

### Scalability

**Concurrent Sessions**:
- Target: 50 simultaneous sessions
- Tested: 100+ sessions
- Graceful degradation
- Buffer pooling for efficiency

## Error Handling

### Error Categories

**User Errors**:
- Port already in use
- Invalid configuration
- Authentication failures
- Permission denied

**System Errors**:
- Server crash/restart
- PTY allocation failures
- Process spawn errors
- WebSocket disconnections

### Error Recovery

**Server Crashes**:
- Automatic restart by ServerManager
- Session state preserved in memory
- Client reconnection supported
- Graceful degradation

**Client Disconnections**:
- WebSocket auto-reconnect
- Exponential backoff
- Session state preserved
- Buffer replay on reconnect

## Update System

### Sparkle Integration

**Configuration**:
- Update check interval: 24 hours
- Automatic download in background
- User prompt for installation
- Delta updates supported

**Update Channels**:
- Stable: Production releases
- Pre-release: Beta testing

### Update Process

1. Check appcast.xml for updates
2. Download update package
3. Verify EdDSA signature
4. Prompt user for installation
5. Install and restart application

## Platform Integration

### macOS Integration

**System Features**:
- Launch at login via SMAppService
- Menu bar and Dock modes
- Notification Center support
- Keyboard shortcuts
- AppleScript support

### Terminal Integration

**Supported Terminals**:
- Terminal.app (default)
- iTerm2
- Warp
- Alacritty
- Hyper
- kitty

**Detection Method**:
- Check bundle identifiers
- Verify app existence
- User preference storage

## Data Formats

### Asciinema Recording

**Format**: Asciinema v2

**Header**:
```json
{
  "version": 2,
  "width": 80,
  "height": 24,
  "timestamp": 1704060000,
  "command": "/bin/zsh",
  "title": "TunnelForge Session"
}
```

**Events**: Newline-delimited JSON
```
[0.123456, "o", "terminal output"]
[0.234567, "i", "keyboard input"]
```

### Session Storage

Sessions are ephemeral and exist only in server memory. Recordings are stored temporarily in the system temp directory and cleaned up after 24 hours or on server restart with cleanup enabled.

## Conclusion

VibeTunnel achieves its goal of simple, secure terminal access through a carefully architected system combining cross-platform desktop applications with modern server technologies. The high-performance Go server backend with Bun web interface provides excellent performance while maintaining simplicity.

The binary buffer protocol ensures efficient terminal streaming, while the clean architectural boundaries enable independent evolution of components. With careful attention to macOS platform conventions and user expectations, TunnelForge delivers a professional-grade solution for terminal access needs.
This specification serves as the authoritative reference for understanding, maintaining, and extending the TunnelForge project.
