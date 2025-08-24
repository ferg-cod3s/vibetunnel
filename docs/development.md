<!-- Generated: 2025-01-27 11:30:00 UTC -->
# TunnelForge Development Guide

## Overview

> **🔄 Refactoring in Progress**: TunnelForge is currently being refactored from the legacy Node.js + SwiftUI architecture to a modern Go + Bun + Tauri architecture. This guide covers both current and target development practices.

### Current Architecture (Legacy - Being Replaced)
TunnelForge currently follows modern Swift 6 and TypeScript development practices with a focus on async/await patterns, protocol-oriented design, and reactive UI architectures. The codebase is organized into three main components: macOS app (Swift/SwiftUI), iOS app (Swift/SwiftUI), and web dashboard (TypeScript/Lit).

### Target Architecture (In Development)
The refactored version will use Go for the backend server, Bun for the web interface, and Tauri v2 for cross-platform desktop applications. This will provide better performance, smaller bundle sizes, and cross-platform support.

Key architectural principles:
- **Protocol-oriented design** for flexibility and testability
- **Async/await** throughout for clean asynchronous code
- **Observable pattern** for reactive state management
- **Dependency injection** via environment values in SwiftUI
- **Go backend** for high-performance terminal management
- **Bun runtime** for fast TypeScript execution
- **Tauri v2** for cross-platform desktop apps

## Code Style

### Swift Conventions

**Modern Swift 6 patterns** - From `mac/TunnelForge/Core/Services/ServerManager.swift`:
```swift
@MainActor
@Observable
class ServerManager {
    @MainActor static let shared = ServerManager()
    
    // Legacy: Node.js server type
    private(set) var serverType: ServerType = .nodejs
    // Future: Will support Go server type
    // private(set) var serverType: ServerType = .go
    
    private(set) var isSwitchingServer = false
    
    var port: String {
        // Legacy: Port 4020 for Node.js
        get { UserDefaults.standard.string(forKey: "serverPort") ?? "4020" }
        // Future: Port 4021 for Go server
        // get { UserDefaults.standard.string(forKey: "serverPort") ?? "4021" }
        set { UserDefaults.standard.set(newValue, forKey: "serverPort") }
    }
}
```

**Error handling** - From `mac/TunnelForge/Core/Protocols/TunnelForgeServer.swift`:
```swift
enum ServerError: LocalizedError {
    case binaryNotFound(String)
    case startupFailed(String)
    case portInUse(Int)
    case invalidConfiguration(String)
    
    var errorDescription: String? {
        switch self {
        case .binaryNotFound(let binary):
            return "Server binary not found: \(binary)"
        case .startupFailed(let reason):
            return "Server failed to start: \(reason)"
        }
    }
}
```

**SwiftUI view patterns** - From `mac/TunnelForge/Presentation/Views/Settings/GeneralSettingsView.swift`:
```swift
struct GeneralSettingsView: View {
    @AppStorage("autostart")
    private var autostart = false
    
    @State private var isCheckingForUpdates = false
    
    private let startupManager = StartupManager()
    
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Toggle("Launch at Login", isOn: launchAtLoginBinding)
                        Text("Automatically start TunnelForge when you log in.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
```

### TypeScript Conventions

**Class-based services** - From `web/src/server/services/buffer-aggregator.ts`:
```typescript
interface BufferAggregatorConfig {
  terminalManager: TerminalManager;
  remoteRegistry: RemoteRegistry | null;
  isHQMode: boolean;
}

export class BufferAggregator {
  private config: BufferAggregatorConfig;
  private remoteConnections: Map<string, RemoteWebSocketConnection> = new Map();
  
  constructor(config: BufferAggregatorConfig) {
    this.config = config;
  }
  
  async handleClientConnection(ws: WebSocket): Promise<void> {
    console.log(chalk.blue('[BufferAggregator] New client connected'));
    // ...
  }
}
```

**Lit components** - From `web/src/client/components/vibe-terminal-buffer.ts`:
```typescript
@customElement('vibe-terminal-buffer')
export class VibeTerminalBuffer extends LitElement {
  // Disable shadow DOM for Tailwind compatibility
  createRenderRoot() {
    return this as unknown as HTMLElement;
  }
  
  @property({ type: String }) sessionId = '';
  @state() private buffer: BufferSnapshot | null = null;
  @state() private error: string | null = null;
}
```

### Go Conventions (Target Architecture)

**Go server patterns** - From `development/go-server/internal/server/server.go`:
```go
// Target: Go server with Gorilla Mux routing
type Server struct {
    router *mux.Router
    server *http.Server
    config *Config
}

func NewServer(config *Config) *Server {
    router := mux.NewRouter()
    
    // Add middleware
    router.Use(middleware.CORS)
    router.Use(middleware.Auth)
    router.Use(middleware.RateLimit)
    
    return &Server{
        router: router,
        config: config,
    }
}
```

**Bun web server patterns** - From `development/bun-web/src/server.ts`:
```typescript
// Target: Bun server with API proxy to Go backend
const server = Bun.serve({
  port: 3001,
  fetch(req) {
    const url = new URL(req.url);
    
    // Proxy API requests to Go server
    if (url.pathname.startsWith('/api/')) {
      return proxyToGoServer(req);
    }
    
    // Serve static files
    return serveStaticFiles(req);
  }
});
```

## Common Patterns

### Service Architecture

**Protocol-based services** - Services define protocols for testability:
```swift
// mac/TunnelForge/Core/Protocols/TunnelForgeServer.swift
@MainActor
protocol TunnelForgeServer: AnyObject {
    var isRunning: Bool { get }
    var port: String { get set }
    var logStream: AsyncStream<ServerLogEntry> { get }
    
    func start() async throws
    func stop() async
    func checkHealth() async -> Bool
}
```

**Singleton managers** - Core services use thread-safe singletons:
```swift
// mac/TunnelForge/Core/Services/ServerManager.swift:14
@MainActor static let shared = ServerManager()

// ios/TunnelForge/Services/APIClient.swift:93
static let shared = APIClient()
```

### Async/Await Patterns

**Swift async operations** - From `ios/TunnelForge/Services/APIClient.swift`:
```swift
func getSessions() async throws -> [Session] {
    guard let url = makeURL(path: "/api/sessions") else {
        throw APIError.invalidURL
    }
    
    let (data, response) = try await session.data(from: url)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw APIError.invalidResponse
    }
    
    if httpResponse.statusCode != 200 {
        throw APIError.serverError(httpResponse.statusCode, nil)
    }
    
    return try decoder.decode([Session].self, from: data)
}
```

**TypeScript async patterns** - From `web/src/server/services/buffer-aggregator.ts`:
```typescript
async handleClientMessage(
  clientWs: WebSocket,
  data: { type: string; sessionId?: string }
): Promise<void> {
  const subscriptions = this.clientSubscriptions.get(clientWs);
  if (!subscriptions) return;
  
  if (data.type === 'subscribe' && data.sessionId) {
    // Handle subscription
  }
}
```

**Go async patterns** - From `development/go-server/internal/websocket/handler.go`:
```go
// Target: Go WebSocket handler with goroutines
func (h *Handler) handleWebSocket(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("WebSocket upgrade failed: %v", err)
        return
    }
    defer conn.Close()
    
    // Handle WebSocket in goroutine
    go h.handleConnection(conn)
}

func (h *Handler) handleConnection(conn *websocket.Conn) {
    for {
        messageType, message, err := conn.ReadMessage()
        if err != nil {
            break
        }
        
        // Process message
        h.processMessage(conn, messageType, message)
    }
}
```

### Error Handling

**Swift error enums** - Comprehensive error types with localized descriptions:
```swift
// ios/TunnelForge/Services/APIClient.swift:4-70
enum APIError: LocalizedError {
    case invalidURL
    case serverError(Int, String?)
    case networkError(Error)
    
    var errorDescription: String? {
        switch self {
        case .serverError(let code, let message):
            if let message { return message }
            switch code {
            case 400: return "Bad request"
            case 401: return "Unauthorized"
            default: return "Server error: \(code)"
            }
        }
    }
}
```

**TypeScript error handling** - Structured error responses:
```typescript
// web/src/server/middleware/auth.ts
try {
  // Operation
} catch (error) {
  console.error('[Auth] Error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'Unknown error'
  });
}
```

### State Management

**SwiftUI Observable** - From `mac/TunnelForge/Core/Services/ServerManager.swift`:
```swift
@Observable
class ServerManager {
    private(set) var isRunning = false
    private(set) var isRestarting = false
    private(set) var lastError: Error?
}
```

**AppStorage for persistence**:
```swift
// mac/TunnelForge/Presentation/Views/Settings/GeneralSettingsView.swift:5
@AppStorage("autostart") private var autostart = false
@AppStorage("updateChannel") private var updateChannelRaw = UpdateChannel.stable.rawValue
```

### UI Patterns

**SwiftUI form layouts** - From `mac/TunnelForge/Presentation/Views/Settings/GeneralSettingsView.swift`:
```swift
Form {
    Section {
        VStack(alignment: .leading, spacing: 4) {
            Toggle("Launch at Login", isOn: launchAtLoginBinding)
            Text("Description")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    } header: {
        Text("Application")
            .font(.headline)
    }
}
.formStyle(.grouped)
```

**Lit reactive properties**:
```typescript
// web/src/client/components/vibe-terminal-buffer.ts:22-24
@property({ type: String }) sessionId = '';
@state() private buffer: BufferSnapshot | null = null;
@state() private error: string | null = null;
```

## Workflows

### Adding a New Service

1. **Define the protocol** in `mac/TunnelForge/Core/Protocols/`:
```swift
@MainActor
protocol MyServiceProtocol {
    func performAction() async throws
}
```

2. **Implement the service** in `mac/TunnelForge/Core/Services/`:
```swift
@MainActor
class MyService: MyServiceProtocol {
    static let shared = MyService()
    
    func performAction() async throws {
        // Implementation
    }
}
```

3. **Add to environment** if needed in `mac/TunnelForge/Core/Extensions/EnvironmentValues+Services.swift`

### Creating UI Components

**SwiftUI views** follow this pattern:
```swift
struct MyView: View {
    @Environment(\.myService) private var service
    @State private var isLoading = false
    
    var body: some View {
        // View implementation
    }
}
```

**Lit components** use decorators:
```typescript
@customElement('my-component')
export class MyComponent extends LitElement {
    @property({ type: String }) value = '';
    
    render() {
        return html`<div>${this.value}</div>`;
    }
}
```

### Testing Patterns

**Swift unit tests** - From `mac/TunnelForgeTests/ServerManagerTests.swift`:
```swift
@MainActor
final class ServerManagerTests: XCTestCase {
    override func setUp() async throws {
        await super.setUp()
        // Setup
    }
    
    func testServerStart() async throws {
        let manager = ServerManager.shared
        await manager.start()
        XCTAssertTrue(manager.isRunning)
    }
}
```

**TypeScript tests** use Vitest:
```typescript
// web/src/test/setup.ts
import { describe, it, expect } from 'vitest';

describe('BufferAggregator', () => {
  it('should handle client connections', async () => {
    // Test implementation
  });
});
```

## Reference

### File Organization

**Swift packages**:
- `mac/TunnelForge/Core/` - Core business logic, protocols, services
- `mac/TunnelForge/Presentation/` - SwiftUI views and view models
- `mac/TunnelForge/Utilities/` - Helper classes and extensions
- `ios/TunnelForge/Services/` - iOS-specific services
- `ios/TunnelForge/Views/` - iOS UI components

**TypeScript modules**:
- `web/src/client/` - Frontend components and utilities
- `web/src/server/` - Backend services and routes
- `web/src/server/pty/` - Terminal handling
- `web/src/test/` - Test files and utilities

### Naming Conventions

**Swift**:
- Services: `*Manager`, `*Service` (e.g., `ServerManager`, `APIClient`)
- Protocols: `*Protocol`, `*able` (e.g., `TunnelForgeServer`, `HTTPClientProtocol`)
- Views: `*View` (e.g., `GeneralSettingsView`, `TerminalView`)
- Errors: `*Error` enum (e.g., `ServerError`, `APIError`)

**TypeScript**:
- Services: `*Service`, `*Manager` (e.g., `BufferAggregator`, `TerminalManager`)
- Components: `vibe-*` custom elements (e.g., `vibe-terminal-buffer`)
- Types: PascalCase interfaces (e.g., `BufferSnapshot`, `ServerConfig`)

### Common Issues

**Port conflicts** - Handled in `mac/TunnelForge/Core/Utilities/PortConflictResolver.swift`
**Permission management** - See `mac/TunnelForge/Core/Services/*PermissionManager.swift`
**WebSocket reconnection** - Implemented in `ios/TunnelForge/Services/BufferWebSocketClient.swift`
**Terminal resizing** - Handled in both Swift and TypeScript terminal components

### TunnelForge CLI Wrapper (vt)

The `tf` command is a bash wrapper script that allows users to run commands through TunnelForge's terminal forwarding. It's installed at `/usr/local/bin/vt` when the Mac app is built.

**Source location**: `mac/TunnelForge/vt`

**Usage**:
```bash
# Run a command through TunnelForge
vt ls -la

# Run an aliased command (e.g., if 'claude' is an alias)
tf claude --version

# Launch interactive shell
vt --shell
vt -i

# Run command without shell wrapping (bypass alias resolution)
vt --no-shell-wrap command
vt -S command
```

**How it works**:
1. Locates the TunnelForge.app bundle (checks standard locations and uses Spotlight if needed)
2. Finds the `tunnelforge` binary within the app bundle's Resources
3. Determines if the command is a binary or alias/function
4. For binaries: executes directly through `tunnelforge fwd`
5. For aliases/functions: wraps in appropriate shell (`zsh -i -c` or `bash -c`) for proper resolution

## Migration Development Workflow

### Current Development State

**🔄 Refactoring in Progress**: The codebase is being migrated from Node.js + SwiftUI to Go + Bun + Tauri architecture.

**Legacy Components** (Still Active):
- `mac/TunnelForge/` - SwiftUI macOS app
- `web/src/server/` - Node.js server
- `ios/TunnelForge/` - SwiftUI iOS app

**Target Components** (In Development):
- `development/go-server/` - Go backend server
- `development/bun-web/` - Bun web interface
- `development/tauri-app/` - Tauri desktop apps

### Development Workflow

**Phase 1: Go Server Development** ✅ (In Progress)
```bash
# Work on Go server
cd development/go-server
go run cmd/server/main.go

# Test Go server endpoints
curl http://localhost:4021/health
```

**Phase 2: Bun Web Server** 🔄 (Next)
```bash
# Work on Bun web server
cd development/bun-web
bun run dev

# Test Bun server
curl http://localhost:3001/health
```

**Phase 3: Tauri Desktop Apps** 📋 (Planned)
```bash
# Work on Tauri apps
cd development/tauri-app
cargo tauri dev
```

### Testing During Migration

**Legacy Testing**:
```bash
# Test current Node.js implementation
cd web
pnpm test

# Test current SwiftUI app
cd mac
xcodebuild test -workspace TunnelForge.xcworkspace -scheme TunnelForge
```

**Target Testing**:
```bash
# Test Go server
cd development/go-server
go test ./...

# Test Bun web server
cd development/bun-web
bun test
```

### Code Organization During Migration

**Current Structure**:
```
tunnelforge/
├── mac/                    # SwiftUI macOS app (legacy)
├── web/                    # Node.js server (legacy)
├── ios/                    # SwiftUI iOS app (legacy)
└── development/            # New architecture (in development)
    ├── go-server/          # Go backend
    ├── bun-web/            # Bun web interface
    └── tauri-app/          # Tauri desktop apps
```

**Future Structure** (After Migration):
```
tunnelforge/
├── go-server/              # Go backend server
├── bun-web/                # Bun web interface
├── tauri-app/              # Tauri desktop apps
└── legacy/                 # Old code (for reference)
    ├── mac/
    ├── web/
    └── ios/
```

### Development Guidelines

**During Migration**:
1. **Legacy Code**: Fix critical bugs only, avoid new features
2. **Target Code**: Implement new features and improvements
3. **Documentation**: Keep both architectures documented
4. **Testing**: Maintain test coverage for both implementations

**After Migration**:
1. **Remove Legacy**: Delete old Node.js and SwiftUI code
2. **Update Tooling**: Migrate CI/CD to new architecture
3. **Clean Documentation**: Remove legacy references
4. **Performance Testing**: Validate Go + Bun + Tauri improvements

### Common Migration Tasks

**Port Changes**:
- Legacy: Port 4020 (Node.js)
- Target: Port 4021 (Go) + 3001 (Bun)

**Server Types**:
- Legacy: `ServerType.nodejs`
- Target: `ServerType.go`

**Build Systems**:
- Legacy: Xcode + npm/pnpm
- Target: Go + Bun + Cargo (Tauri)

**Distribution**:
- Legacy: macOS DMG only
- Target: Cross-platform packages (macOS, Windows, Linux)