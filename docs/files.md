<!-- Generated: 2025-06-21 00:00:00 UTC -->

# TunnelForge Files Catalog

## Overview

TunnelForge is a cross-platform terminal sharing application organized into distinct platform modules: macOS native app, iOS companion app, and a TypeScript web server. The codebase follows a clear separation of concerns with platform-specific implementations sharing common protocols and interfaces.

The project structure emphasizes modularity with separate build systems for each platform - Xcode projects for Apple platforms and Node.js/TypeScript tooling for the web server. Configuration is managed through xcconfig files, Package.swift manifests, and package.json files.

## Core Source Files

### macOS Application (mac/)

**Main Entry Points**
- `TunnelForge/TunnelForgeApp.swift` - macOS app entry point with lifecycle management
- `TunnelForge/Core/Protocols/TunnelForgeServer.swift` - Server protocol definition
- `TunnelForge/Core/Services/ServerManager.swift` - Central server orchestration

**Core Services**
- `TunnelForge/Core/Services/BunServer.swift` - Bun runtime server implementation
- `TunnelForge/Core/Services/BaseProcessServer.swift` - Base server process management
- `TunnelForge/Core/Services/TTYForwardManager.swift` - Terminal forwarding coordinator
- `TunnelForge/Core/Services/TerminalManager.swift` - Terminal app integration
- `TunnelForge/Core/Services/SessionMonitor.swift` - Session lifecycle tracking
- `TunnelForge/Core/Services/NgrokService.swift` - Tunnel service integration
- `TunnelForge/Core/Services/WindowTracker.swift` - Window state management

**Security & Permissions**
- `TunnelForge/Core/Services/DashboardKeychain.swift` - Secure credential storage
- `TunnelForge/Core/Services/AccessibilityPermissionManager.swift` - Accessibility permissions
- `TunnelForge/Core/Services/ScreenRecordingPermissionManager.swift` - Screen recording permissions
- `TunnelForge/Core/Services/AppleScriptPermissionManager.swift` - AppleScript permissions

**UI Components**
- `TunnelForge/Presentation/Views/MenuBarView.swift` - Menu bar interface
- `TunnelForge/Presentation/Views/WelcomeView.swift` - Onboarding flow
- `TunnelForge/Presentation/Views/SettingsView.swift` - Settings window
- `TunnelForge/Presentation/Views/SessionDetailView.swift` - Session detail view

### iOS Application (ios/)

**Main Entry Points**
- `TunnelForge/App/TunnelForgeApp.swift` - iOS app entry point
- `TunnelForge/App/ContentView.swift` - Root content view

**Services**
- `TunnelForge/Services/APIClient.swift` - HTTP API client
- `TunnelForge/Services/BufferWebSocketClient.swift` - WebSocket terminal client
- `TunnelForge/Services/SessionService.swift` - Session management
- `TunnelForge/Services/NetworkMonitor.swift` - Network connectivity

**Terminal Views**
- `TunnelForge/Views/Terminal/TerminalView.swift` - Main terminal view
- `TunnelForge/Views/Terminal/TerminalHostingView.swift` - SwiftTerm hosting
- `TunnelForge/Views/Terminal/TerminalToolbar.swift` - Terminal controls
- `TunnelForge/Views/Terminal/CastPlayerView.swift` - Recording playback

**Data Models**
- `TunnelForge/Models/Session.swift` - Terminal session model
- `TunnelForge/Models/TerminalData.swift` - Terminal buffer data
- `TunnelForge/Models/ServerConfig.swift` - Server configuration

### Web Server (web/)

**Server Entry Points**
- `src/index.ts` - Main server entry
- `src/server/server.ts` - Express server setup
- `src/server/app.ts` - Application configuration

**Terminal Management**
- `src/server/pty/pty-manager.ts` - PTY process management
- `src/server/pty/session-manager.ts` - Session lifecycle
- `src/server/services/terminal-manager.ts` - Terminal service layer
- `src/server/services/buffer-aggregator.ts` - Terminal buffer aggregation

**API Routes**
- `src/server/routes/sessions.ts` - Session API endpoints
- `src/server/routes/remotes.ts` - Remote connection endpoints

**Client Application**
- `src/client/app-entry.ts` - Web client entry
- `src/client/app.ts` - Main application logic
- `src/client/components/terminal.ts` - Web terminal component
- `src/client/components/vibe-terminal-buffer.ts` - Buffer terminal component
- `src/client/services/buffer-subscription-service.ts` - WebSocket subscriptions

## Platform Implementation

### macOS Platform Files
- `apple/Local.xcconfig` - Local build configuration
- `mac/TunnelForge/Shared.xcconfig` - Shared build settings
- `mac/TunnelForge/version.xcconfig` - Version configuration
- `mac/TunnelForge.entitlements` - App entitlements
- `mac/TunnelForge-Info.plist` - App metadata

### iOS Platform Files
- `ios/Package.swift` - Swift package manifest
- `ios/project.yml` - XcodeGen configuration
- `ios/TunnelForge/Resources/Info.plist` - iOS app metadata

### Web Platform Files
- `web/package.json` - Node.js dependencies
- `web/tsconfig.json` - TypeScript configuration
- `web/vite.config.ts` - Vite build configuration
- `web/tailwind.config.js` - Tailwind CSS configuration

## Build System

### macOS Build Scripts
- `mac/scripts/build.sh` - Main build script
- `mac/scripts/build-bun-executable.sh` - Bun server build
- `mac/scripts/copy-bun-executable.sh` - Resource copying
- `mac/scripts/codesign-app.sh` - Code signing
- `mac/scripts/notarize-app.sh` - App notarization
- `mac/scripts/create-dmg.sh` - DMG creation
- `mac/scripts/release.sh` - Release automation

### Web Build Scripts
- `web/scripts/clean.js` - Build cleanup
- `web/scripts/copy-assets.js` - Asset management
- `web/scripts/ensure-dirs.js` - Directory setup
- `web/build-native.js` - Native binary builder

### Configuration Files
- `mac/TunnelForge.xcodeproj/project.pbxproj` - Xcode project
- `ios/TunnelForge.xcodeproj/project.pbxproj` - iOS Xcode project
- `web/eslint.config.js` - ESLint configuration
- `web/vitest.config.ts` - Test configuration

## Configuration

### App Configuration
- `mac/TunnelForge/Core/Models/AppConstants.swift` - App constants
- `mac/TunnelForge/Core/Models/UpdateChannel.swift` - Update channels
- `ios/TunnelForge/Models/ServerConfig.swift` - Server settings

### Assets & Resources
- `assets/AppIcon.icon/` - App icon assets
- `mac/TunnelForge/Assets.xcassets/` - macOS asset catalog
- `ios/TunnelForge/Resources/Assets.xcassets/` - iOS asset catalog
- `web/public/` - Web static assets

### Documentation
- `docs/API.md` - API documentation
- `docs/ARCHITECTURE.md` - Architecture overview
- `documentation/` - Documentation website (Astro)
- `mac/Documentation/BunServerSupport.md` - Bun server documentation
- `web/src/server/pty/README.md` - PTY implementation notes

## Reference

### File Organization Patterns
- Platform code separated by directory: `mac/`, `ios/`, `web/`
- Swift code follows MVC-like pattern: Models, Views, Services
- TypeScript organized by client/server with feature-based subdirectories
- Build scripts consolidated in platform-specific `scripts/` directories

### Naming Conventions
- Swift files: PascalCase matching class/struct names
- TypeScript files: kebab-case for modules, PascalCase for classes
- Configuration files: lowercase with appropriate extensions
- Scripts: kebab-case shell scripts

### Key Dependencies
- macOS: SwiftUI, Sparkle (updates), Bun runtime
- iOS: SwiftUI, SwiftTerm, WebSocket client
- Web: Express, xterm.js, WebSocket, Vite bundler