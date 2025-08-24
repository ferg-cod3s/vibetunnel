<!-- Generated: 2025-08-23 -->
# Build System

> **🔄 Refactoring in Progress**: This document describes the **TARGET BUILD SYSTEM** being implemented. The current implementation uses Xcode + npm/pnpm, but this document shows the planned Go + Bun + Tauri build system.

TunnelForge uses modern build systems for each component: Go for the high-performance server backend, Bun for the web interface, and Tauri v2 for cross-platform desktop applications. The build system supports both development and release builds with automated packaging for multiple platforms.

The architecture consists of independent components that can be built separately: a Go server backend providing terminal APIs, a pure Bun web interface for browser access, and Tauri v2 desktop applications for native system integration. Release builds create installers for macOS, Windows, and Linux.

## Modern Build Workflows

### Go Server Backend Build (development/go-server)

**Development Mode** - Run with hot reload:
```bash
cd development/go-server
go mod tidy
go run cmd/server/main.go
# Or with air for hot reload:
air
```

**Production Build** - Optimized binary:
```bash
cd development/go-server
go build -ldflags="-s -w" -o tunnelforge-server cmd/server/main.go
```

**Cross-Platform Builds**:
```bash
# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o tunnelforge-server-darwin-amd64 cmd/server/main.go

# macOS (Apple Silicon)  
GOOS=darwin GOARCH=arm64 go build -o tunnelforge-server-darwin-arm64 cmd/server/main.go

# Windows
GOOS=windows GOARCH=amd64 go build -o tunnelforge-server-windows-amd64.exe cmd/server/main.go

# Linux
GOOS=linux GOARCH=amd64 go build -o tunnelforge-server-linux-amd64 cmd/server/main.go
```

### Bun Web Interface Build (development/bun-web)

**Development Mode** - Hot reload web server:
```bash
cd development/bun-web
bun install
bun run dev
```

**Production Build** - Optimized static assets:
```bash
cd development/bun-web
bun run build
bun run start
```

### Tauri v2 Desktop Applications

**Development Build** - Hot reload desktop app:
```bash
# Prerequisites: Install Rust and Tauri CLI
cargo install tauri-cli

# Development mode
cargo tauri dev
```

**Release Build** - Platform-specific installers:
```bash
# Build for current platform
cargo tauri build

# Cross-platform builds
cargo tauri build --target x86_64-pc-windows-msvc    # Windows
cargo tauri build --target x86_64-apple-darwin       # macOS Intel
cargo tauri build --target aarch64-apple-darwin      # macOS Apple Silicon  
cargo tauri build --target x86_64-unknown-linux-gnu  # Linux
```

### Legacy iOS Application Build

**Generate Xcode Project** - From project.yml:
```bash
cd ios
xcodegen generate
```

**Build via Xcode** - Open `ios/TunnelForge.xcodeproj` and build

**Key File**: `ios/project.yml` - XcodeGen configuration (lines 1-92)

### Modern Release Workflow

**Complete Release Workflow**:

1. **Go Server Release**:
```bash
cd server
# Run tests
go test ./...
# Build for all platforms  
make build-all
```

2. **Bun Web Interface Release**:
```bash
cd web
# Build production assets
bun run build
# Test production build
bun run start
```

3. **Tauri Desktop Apps Release**:
```bash
# Build installers for all platforms
cargo tauri build --target x86_64-pc-windows-msvc
cargo tauri build --target x86_64-apple-darwin  
cargo tauri build --target aarch64-apple-darwin
cargo tauri build --target x86_64-unknown-linux-gnu
```

**Automated CI/CD**:
- GitHub Actions can build all components
- Cross-platform builds via GitHub's hosted runners
- Automated testing for Go server and web interface

## Platform Setup

### Tauri v2 Desktop Requirements

**System Requirements**:
- Rust 1.70+ with cargo
- Bun runtime (for web frontend assets and server)
- Platform-specific build tools

**macOS Requirements**:
- Xcode command line tools: `xcode-select --install`
- macOS 10.15+ for development, 11.0+ for Apple Silicon
- Valid Developer ID certificate for distribution

**Windows Requirements**:
- Microsoft Visual Studio C++ Build Tools
- Windows 10+ (version 1903+)
- Code signing certificate for distribution

**Linux Requirements**:
- GCC or Clang compiler
- GTK 3.0+ development libraries: `sudo apt install libgtk-3-dev`
- WebKit2GTK development libraries: `sudo apt install libwebkit2gtk-4.0-dev`
- App packaging tools: `sudo apt install libappindicator3-dev`

### Legacy macOS Requirements

**Development Tools**:
- Xcode 16.0+ with command line tools
- Bun runtime (replaces Node.js entirely)
- xcbeautify (optional, for cleaner output)

**Release Requirements**:
- Valid Apple Developer certificate
- App Store Connect API keys for notarization
- Sparkle EdDSA keys in `mac/private/`

**Configuration Files**:
- `apple/Local.xcconfig` - Local development settings
- `mac/TunnelForge/version.xcconfig` - Version numbers
- `mac/Shared.xcconfig` - Shared build settings

### Web Frontend Requirements

**Tools**:
- Bun runtime (replaces Node.js entirely)
- Bun package manager (replaces npm)

**Native Modules**:
- `@homebridge/node-pty-prebuilt-multiarch` - Terminal emulation
- Platform-specific binaries in `web/native/`:
  - `pty.node` - Native PTY module
  - `spawn-helper` - Process spawning helper
  - `tunnelforge` - Bun executable

### iOS Requirements

**Tools**:
- Xcode 16.0+
- XcodeGen (install via Homebrew)
- iOS 18.0+ deployment target

**Dependencies**:
- SwiftTerm package via SPM

## Reference

### Build Targets

**macOS Xcode Workspace** (`mac/TunnelForge.xcworkspace`):
- TunnelForge scheme - Main application
- Debug configuration - Development builds
- Release configuration - Distribution builds

**Web Build Scripts** (`web/package.json`):
- `dev` - Development server with watchers
- `build` - Production TypeScript compilation
- `bundle` - Client-side asset bundling
- `typecheck` - TypeScript validation
- `lint` - ESLint code quality checks

### Build Scripts

**Core Build Scripts** (`mac/scripts/`):
- `build.sh` - Main build orchestrator
- `build-bun-executable.sh` - Bun compilation (lines 31-92)
- `copy-bun-executable.sh` - Bundle integration
- `codesign-app.sh` - Code signing
- `notarize-app.sh` - Apple notarization
- `create-dmg.sh` - DMG packaging
- `generate-appcast.sh` - Sparkle updates

**Helper Scripts**:
- `preflight-check.sh` - Pre-build validation
- `version.sh` - Version management
- `clean.sh` - Build cleanup
- `verify-app.sh` - Post-build verification

### Troubleshooting

**Common Issues**:

1. **Bun build fails** - Check `web/build-native.js` patches (lines 11-79)
2. **Code signing errors** - Verify `apple/Local.xcconfig` settings
3. **Notarization fails** - Check API keys in environment
4. **Version mismatch** - Update `mac/TunnelForge/version.xcconfig`

**Build Artifacts**:
- macOS app: `mac/build/Build/Products/Release/TunnelForge.app`
- Web bundles: `web/public/bundle/`
- Native executables: `web/native/`
- iOS app: `ios/build/`

**Clean Build**:
```bash
cd mac && ./scripts/clean.sh
cd ../development/bun-web && bun run clean
```