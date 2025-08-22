# TunnelForge Linux Deployment Options

TunnelForge can be deployed on Linux using several approaches for easy installation and distribution.

## Option 1: Electron Desktop App (Recommended)

Create a native Linux desktop app that matches the Mac experience.

### Benefits:
- Native desktop integration (system tray, notifications)
- Easy installation (.deb, .rpm, .AppImage packages)
- Same UI/UX as Mac app
- Auto-updates support
- Cross-platform codebase sharing

### Implementation:
```bash
# Create electron app structure
mkdir linux/electron-app
cd linux/electron-app

# Install Electron
npm init -y
npm install electron electron-builder

# Create main process file
# - Starts Go server
# - Creates tray icon
# - Opens web interface
# - Handles app lifecycle
```

### Package Formats:
- **.AppImage** - Universal Linux package (works everywhere)
- **.deb** - Ubuntu/Debian package
- **.rpm** - Red Hat/SUSE package
- **.tar.xz** - Generic archive
- **Snap** - Ubuntu Store distribution
- **Flatpak** - Cross-distro app store

## Option 2: Tauri Desktop App (Rust + Web)

Lighter alternative to Electron with better performance.

### Benefits:
- Smaller binary size (~10MB vs ~100MB)
- Better performance (Rust backend)
- Lower memory usage
- Native system integration

### Implementation:
```bash
# Install Tauri CLI
cargo install tauri-cli

# Create Tauri app
cargo tauri init

# Configure to bundle Go server
# Web frontend runs in system webview
```

## Option 3: Systemd Service + Desktop Entry

Traditional Linux service approach with desktop integration.

### Benefits:
- Native Linux integration
- Systemd management
- Standard package manager installation
- Minimal resource usage

### Implementation:
```bash
# Package structure
/usr/bin/tunnelforge-server          # Go server binary
/usr/bin/tunnelforge-desktop         # Desktop launcher script
/usr/share/applications/tunnelforge.desktop  # Desktop entry
/etc/systemd/system/tunnelforge.service     # Service definition
/opt/tunnelforge/web/                # Web assets
```

## Option 4: Docker with Desktop Integration

Containerized deployment with desktop launcher.

### Benefits:
- Consistent environment across distributions
- Easy installation and updates
- Isolation from system dependencies
- Works on any Docker-capable Linux

### Implementation:
```bash
# Docker container with:
# - Go server
# - Bun web server
# - Desktop launcher script

# Desktop entry launches:
# docker run -p 3001:3001 tunnelforge/app
# xdg-open http://localhost:3001
```

## Recommended Approach: Electron + Multiple Packages

Create an Electron app that can be packaged for all major Linux distributions:

### 1. Electron Main Process Features:
- **System Tray**: TunnelForge icon in system tray
- **Auto-start**: Optionally start with system
- **Notifications**: Desktop notifications for sessions
- **Server Management**: Start/stop Go server automatically
- **Menu Integration**: Right-click menu with common actions

### 2. Distribution Strategy:
```bash
# Build all package formats
electron-builder --linux deb rpm AppImage tar.xz

# Results:
dist/tunnelforge_1.0.0_amd64.deb       # Ubuntu/Debian
dist/tunnelforge-1.0.0.x86_64.rpm      # RedHat/SUSE
dist/TunnelForge-1.0.0.AppImage         # Universal
dist/tunnelforge-1.0.0.tar.xz          # Generic archive
```

### 3. Installation Examples:
```bash
# Ubuntu/Debian
sudo dpkg -i tunnelforge_1.0.0_amd64.deb

# RedHat/Fedora
sudo rpm -i tunnelforge-1.0.0.x86_64.rpm

# Universal (any Linux)
chmod +x TunnelForge-1.0.0.AppImage
./TunnelForge-1.0.0.AppImage

# Or just double-click in file manager
```

## Cross-Platform Architecture

The beauty is that most of the codebase can be shared:

```
TunnelForge/
├── core/                    # Shared
│   ├── go-server/          # Same Go server for all platforms
│   ├── bun-web/            # Same web frontend
│   └── shared-logic/       # Common business logic
├── mac/                    # SwiftUI Mac app
├── linux/                 # Electron Linux app
│   ├── electron/           # Electron main process
│   ├── packaging/          # Package configurations
│   └── desktop-integration/ # Linux-specific features
└── windows/                # Future Windows support
    └── electron/           # Same Electron base
```

### Shared Components (90% of codebase):
- Go server (terminal management, API)
- Web frontend (React/Lit components)
- Business logic and protocols
- Terminal rendering and interaction

### Platform-Specific (10% of codebase):
- **Mac**: SwiftUI wrapper, macOS integration
- **Linux**: Electron wrapper, Linux desktop integration  
- **Windows**: Electron wrapper, Windows integration

## Getting Started with Linux Version

1. **Start with Electron**: Fastest path to Linux desktop app
2. **Reuse existing web frontend**: No need to rebuild UI
3. **Bundle Go server**: Include in Electron app resources
4. **Add system tray**: For background operation
5. **Package for distributions**: .deb, .rpm, .AppImage

This approach gives you:
- ✅ Easy installation on any Linux distribution
- ✅ Native desktop experience
- ✅ Same functionality as Mac app
- ✅ Minimal development effort (reuse existing code)
- ✅ Professional distribution and auto-updates

Would you like me to create a proof-of-concept Electron Linux app?