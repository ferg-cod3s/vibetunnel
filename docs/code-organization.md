# Code Organization

TunnelForge follows a modular, platform-specific architecture with clear separation of concerns across macOS, iOS, and web components.

## Project Structure

```
tunnelforge/
├── mac/                    # macOS application
│   ├── TunnelForge/        # Main app code
│   │   ├── Core/          # Business logic & services
│   │   │   ├── Services/  # Server management, terminal handling
│   │   │   ├── Protocols/ # Protocol definitions for testability
│   │   │   ├── Models/    # Data models and domain objects
│   │   │   └── Utils/     # Utility functions and helpers
│   │   ├── Presentation/  # UI layer
│   │   │   ├── Views/     # SwiftUI views
│   │   │   ├── Components/# Reusable UI components
│   │   │   └── Modifiers/ # SwiftUI view modifiers
│   │   └── Resources/     # Assets, localization, Info.plist
│   ├── TunnelForgeTests/   # Swift Testing framework tests
│   └── scripts/           # Build and deployment scripts
│
├── ios/                   # iOS companion app
│   ├── TunnelForge/       # Main app code
│   │   ├── Services/     # API client, data services
│   │   ├── Models/       # Session, server models
│   │   ├── Views/        # SwiftUI views
│   │   └── Utils/        # iOS-specific utilities
│   └── TunnelForgeTests/  # iOS test suite
│
├── web/                   # Web dashboard & server
│   ├── src/
│   │   ├── client/       # Frontend application
│   │   │   ├── app.ts    # Main entry point
│   │   │   ├── components/ # Lit web components
│   │   │   ├── services/ # API & WebSocket clients
│   │   │   └── styles/   # CSS and styling
│   │   ├── server/       # Node.js/Bun server
│   │   │   ├── server.ts # Express server setup
│   │   │   ├── routes/   # API route handlers
│   │   │   ├── services/ # Terminal management, auth
│   │   │   ├── middleware/ # Auth, logging, error handling
│   │   │   └── utils/    # Server utilities
│   │   └── test/         # Test suites
│   │       ├── unit/     # Unit tests
│   │       └── e2e/      # End-to-end tests
│   ├── tests/            # Playwright E2E tests
│   └── scripts/          # Development & build scripts
│
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md   # System architecture
│   ├── spec.md          # API specifications
│   └── *.md             # Feature documentation
│
├── scripts/             # Cross-platform scripts
│   ├── vtlog.sh        # Unified log viewer
│   └── release.sh      # Release automation
│
└── development/        # Development tools
    └── bun-web/       # Bun-specific web server
```

## Architecture Principles

### 1. Protocol-Oriented Design (Swift)
- Define protocols for all major services
- Enables dependency injection and testing
- Allows for multiple implementations

```swift
@MainActor
protocol TunnelForgeServer: AnyObject {
    var isRunning: Bool { get }
    func start() async throws
    func stop() async
}
```

### 2. Observable Pattern (Swift)
- Use `@Observable` for reactive state management
- Automatic UI updates with SwiftUI
- Clean separation of view and business logic

```swift
@MainActor
@Observable
class ServerManager {
    private(set) var isRunning = false
    private(set) var currentPort = "4020"
}
```

### 3. Component-Based Architecture (Web)
- Lit web components for encapsulation
- Clear component interfaces with properties
- Reactive state management with decorators

```typescript
@customElement('vibe-terminal')
export class VibeTerminal extends LitElement {
    @property({ type: String }) sessionId = '';
    @state() private connected = false;
}
```

### 4. Service Layer Pattern
- Centralized business logic in services
- Singleton pattern for shared state
- Async/await for clean asynchronous code

## Module Organization

### Core Modules

#### Server Management (`ServerManager`)
- **Location**: `mac/TunnelForge/Core/Services/ServerManager.swift`
- **Purpose**: Manages server lifecycle and configuration
- **Dependencies**: TunnelForgeServer protocol implementations

#### Terminal Management (`TerminalManager`)
- **Location**: `web/src/server/services/terminal-manager.ts`
- **Purpose**: Handles terminal session creation and management
- **Dependencies**: node-pty, WebSocket services

#### Authentication (`AuthService`)
- **Location**: `web/src/server/services/auth-service.ts`
- **Purpose**: User authentication and authorization
- **Dependencies**: System auth, SSH keys, local bypass

#### Session Monitoring (`SessionService`)
- **Location**: `mac/TunnelForge/Core/Services/SessionService.swift`
- **Purpose**: Tracks active terminal sessions
- **Dependencies**: API client, WebSocket connections

### UI Components

#### macOS Views
- **Settings Views**: Configuration UI
- **Dashboard View**: Session management
- **Menu Bar**: Quick access controls

#### Web Components
- **vibe-terminal**: Terminal display component
- **session-card**: Session overview card
- **server-status**: Server health indicator

## Dependency Management

### Swift Package Manager (macOS/iOS)
```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.0.0"),
    .package(url: "https://github.com/nicklockwood/SwiftFormat", from: "0.54.0")
]
```

### pnpm (Web)
```json
// package.json
{
  "dependencies": {
    "lit": "^3.0.0",
    "xterm": "^5.0.0",
    "express": "^4.18.0"
  }
}
```

## File Naming Conventions

### Swift Files
- **Views**: `*View.swift` (e.g., `GeneralSettingsView.swift`)
- **Services**: `*Manager.swift` or `*Service.swift`
- **Models**: Singular nouns (e.g., `Session.swift`)
- **Protocols**: Descriptive names (e.g., `TunnelForgeServer.swift`)
- **Tests**: `*Tests.swift` (e.g., `ServerManagerTests.swift`)

### TypeScript Files
- **Components**: `vibe-*.ts` for web components
- **Services**: `*-service.ts` or `*-manager.ts`
- **Routes**: `*.routes.ts`
- **Tests**: `*.test.ts` or `*.spec.ts`
- **Utilities**: `*-utils.ts`

## Import Organization

### Swift
```swift
// System imports first
import Foundation
import SwiftUI

// Third-party imports
import Sparkle

// Local imports
import TunnelForgeCore
```

### TypeScript
```typescript
// Node/system imports
import { readFile } from 'fs/promises';
import { join } from 'path';

// Third-party imports
import express from 'express';
import { LitElement, html } from 'lit';

// Local imports
import { TerminalManager } from './services/terminal-manager';
import type { Session } from './types';
```

## Design Patterns

### Singleton Pattern
Used for shared services that need single instance:
- `ServerManager.shared` (Swift)
- `APIClient.shared` (Swift)
- Global terminal manager instance (TypeScript)

### Observer Pattern
For reactive state updates:
- `@Observable` classes in Swift
- `@state` decorators in Lit components
- AsyncStream for log streaming

### Factory Pattern
For creating configured instances:
- Server type selection (Bun vs Node)
- Terminal session creation
- Authentication strategy selection

### Middleware Pattern
For request processing pipeline:
- Express middleware chain
- Authentication middleware
- Logging middleware
- Error handling middleware

## Best Practices

### Code Organization
- Keep files small and focused (< 300 lines preferred)
- One class/component per file
- Group related functionality in directories
- Use clear, descriptive names

### Separation of Concerns
- Business logic in services/managers
- UI logic in views/components
- Data models separate from business logic
- Protocols/interfaces for abstraction

### Dependency Injection
- Pass dependencies through constructors
- Use environment values in SwiftUI
- Configure services at app startup
- Mock dependencies in tests

### Error Handling
- Define specific error types
- Provide descriptive error messages
- Handle errors at appropriate levels
- Log errors for debugging

### Documentation
- Document public APIs
- Include usage examples
- Explain complex algorithms
- Keep README files current
