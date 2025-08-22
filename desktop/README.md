# TunnelForge Desktop Apps

Cross-platform desktop applications for TunnelForge built with Tauri. This unified codebase builds native apps for **Windows**, **Linux**, and **macOS** with exceptional performance and minimal resource usage.

## Features

- ⚡ **Ultra-lightweight**: ~10-15MB binaries (vs 100MB+ Electron alternatives)
- 🚀 **High Performance**: Rust backend with native system webview
- 🖥️ **Native Desktop Experience**: System tray, notifications, platform integration
- 📦 **Professional Installers**: MSI, NSIS, DEB, RPM, AppImage, DMG
- 🔄 **Auto-updates**: Built-in update system
- 🎛️ **Server Management**: Embedded Go server with lifecycle management
- 🌐 **Same Web Interface**: Identical to Mac app and web versions
- 💾 **Low Memory Usage**: ~50MB RAM usage
- 🔒 **Secure**: Sandboxed by default with minimal permissions

## Platform Support

| Platform | Status | Package Formats | Notes |
|----------|--------|----------------|-------|
| **Linux** | ✅ Production Ready | AppImage, DEB, RPM | GTK 3.0+, WebKit2GTK 4.0+ |
| **Windows** | ✅ Production Ready | MSI, NSIS Setup | Windows 10+, WebView2 |
| **macOS** | 🚧 Available | DMG, APP | Native Mac app preferred |

## Quick Start

### Prerequisites
- **Rust 1.70+** (install via [rustup.rs](https://rustup.rs/))
- **Node.js 18+** (for Tauri CLI)
- **Go 1.21+** (for server development)

### Platform-Specific Dependencies

#### Linux (Ubuntu/Debian)
```bash
sudo apt install libwebkit2gtk-4.0-dev libgtk-3-dev libayatana-appindicator3-dev
```

#### Linux (Fedora)
```bash
sudo dnf install webkit2gtk4.0-devel gtk3-devel libappindicator-gtk3-devel
```

#### Linux (Arch)
```bash
sudo pacman -S webkit2gtk gtk3 libappindicator-gtk3
```

#### Windows
- Visual Studio Build Tools or Visual Studio Community
- WebView2 Runtime (automatically installed)

### Development Setup

```bash
# Clone repository
git clone https://github.com/ferg-cod3s/tunnelforge.git
cd tunnelforge/desktop

# Install dependencies and Tauri CLI
npm run setup

# For cross-compilation support
npm run setup:all

# Run in development mode
npm run dev
```

## Building

### Current Platform
```bash
npm run build
```

### Specific Platforms
```bash
npm run build:windows   # Windows (MSI + NSIS)
npm run build:linux     # Linux (DEB + RPM + AppImage)
npm run build:macos     # macOS (DMG + APP)
```

### All Platforms
```bash
npm run build:all
```

### Debug Builds (Faster)
```bash
npm run build:debug
```

## Architecture

### Unified Codebase Structure
```
desktop/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # Main application logic
│   │   ├── windows_platform.rs  # Windows-specific features
│   │   ├── linux_platform.rs    # Linux-specific features
│   │   └── macos_platform.rs    # macOS-specific features
│   ├── Cargo.toml               # Rust dependencies
│   ├── tauri.conf.json          # Cross-platform configuration
│   └── build.rs                 # Build script
├── package.json                 # Scripts and Node dependencies
└── README.md
```

### Platform Abstraction

The app uses a trait-based system for platform-specific functionality:

```rust
trait PlatformIntegration {
    fn register_startup_entry(&self, enable: bool) -> Result<(), Box<dyn std::error::Error>>;
    fn show_notification(&self, title: &str, message: &str);
    fn setup_platform_specific(&self) -> Result<(), Box<dyn std::error::Error>>;
    fn get_platform_name(&self) -> &'static str;
}
```

**Shared Code (95%)**:
- Server management and lifecycle
- System tray functionality
- Settings management
- Core application logic
- Web interface integration

**Platform-Specific (5%)**:
- **Windows**: Registry integration, Windows Services, MSI installers
- **Linux**: Desktop files, systemd services, package managers
- **macOS**: Launch agents, dock integration, notification center

## Installation

### Linux

#### AppImage (Universal)
```bash
# Download and run
chmod +x TunnelForge-*.AppImage
./TunnelForge-*.AppImage
```

#### Ubuntu/Debian
```bash
sudo dpkg -i tunnelforge_*_amd64.deb
sudo apt-get install -f  # Fix dependencies if needed
```

#### Red Hat/Fedora
```bash
sudo rpm -i tunnelforge-*.x86_64.rpm
# or
sudo dnf install tunnelforge-*.x86_64.rpm
```

### Windows

#### MSI Installer (Recommended)
```powershell
# Run the MSI installer
TunnelForge-*.msi
```

#### NSIS Setup
```powershell
# Run the setup executable
TunnelForge-*-setup.exe
```

#### Silent Installation
```powershell
# MSI silent install
msiexec /i TunnelForge-*.msi /quiet /norestart

# NSIS silent install
TunnelForge-*-setup.exe /S
```

## Configuration

### Settings Location
- **Linux**: `~/.config/tunnelforge/`
- **Windows**: `%APPDATA%\TunnelForge\`
- **macOS**: `~/Library/Application Support/TunnelForge/`

### Environment Variables
- `TUNNELFORGE_PORT`: Override server port (default: 4021)
- `TUNNELFORGE_HOST`: Override server host (default: 127.0.0.1)
- `TUNNELFORGE_LOG_LEVEL`: Set log level (debug, info, warn, error)

## System Integration

### System Tray
All platforms support system tray integration:
- **Left Click**: Toggle main window
- **Right Click**: Context menu with:
  - Open TunnelForge
  - New Terminal Session
  - Server status and URL
  - Settings and About
  - Quit/Exit

### Auto-Start
- **Linux**: Creates `~/.config/autostart/tunnelforge.desktop`
- **Windows**: Registry entry in `HKEY_CURRENT_USER\...\Run`
- **macOS**: Launch agent plist (if implemented)

### Notifications
- **Linux**: Uses `notify-send` or `zenity`
- **Windows**: Native toast notifications
- **macOS**: Native notification center

## Performance Comparison

| Metric | TunnelForge (Tauri) | Typical Electron App |
|--------|-------------------|---------------------|
| **Bundle Size** | ~10-15MB | ~100-150MB |
| **Memory Usage** | ~50MB | ~200MB+ |
| **Startup Time** | ~500ms | ~2-3s |
| **CPU Usage** | ~1-2% | ~5-10% |
| **Disk Usage** | ~30MB | ~150MB+ |

## Cross-Platform Build Pipeline

The project includes GitHub Actions for automated building:

```yaml
# .github/workflows/desktop-release.yml
- Builds Go server for all platforms
- Creates Linux packages (AppImage, DEB, RPM)
- Creates Windows installers (MSI, NSIS)
- Generates release with all artifacts
```

### Manual Cross-Compilation

```bash
# Install Rust targets
rustup target add x86_64-pc-windows-msvc
rustup target add x86_64-unknown-linux-gnu
rustup target add aarch64-pc-windows-msvc
rustup target add aarch64-unknown-linux-gnu

# Build for specific targets
cargo tauri build --target x86_64-pc-windows-msvc
cargo tauri build --target x86_64-unknown-linux-gnu
```

## Troubleshooting

### Common Issues

#### Linux: WebKit2GTK not found
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.0-dev

# Fedora
sudo dnf install webkit2gtk4.0-devel
```

#### Windows: WebView2 not installed
```powershell
# Install WebView2 Runtime
winget install Microsoft.EdgeWebView2Runtime
```

#### Build fails with permission errors
```bash
# Make sure Rust and Node.js are properly installed
rustc --version
node --version
npm --version

# Clear cache and rebuild
npm run clean
npm install
npm run build
```

### Debug Mode
```bash
# Run with debug logging
RUST_LOG=debug npm run dev

# Build debug version (faster compilation)
npm run build:debug
```

### Logs Location
- **Linux**: `~/.config/tunnelforge/logs/`
- **Windows**: `%APPDATA%\TunnelForge\logs\`
- **macOS**: `~/Library/Logs/TunnelForge/`

## Development

### Adding Platform-Specific Features

1. **Shared functionality**: Add to `main.rs`
2. **Platform-specific**: Add to respective platform modules
3. **Configuration**: Update `tauri.conf.json` if needed
4. **Build targets**: Test on all supported platforms

### Testing

```bash
# Run on current platform
npm run dev

# Test specific build
npm run build:debug
./src-tauri/target/debug/tunnelforge

# Cross-platform testing
npm run build:all
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Test on multiple platforms
4. Submit a pull request

### Platform Testing Requirements
- **Linux**: Test on Ubuntu LTS, Fedora, and Arch
- **Windows**: Test on Windows 10 and Windows 11
- **macOS**: Test on latest macOS version (if implementing)

## Support

- 📖 **Documentation**: [tunnelforge.dev/docs](https://tunnelforge.dev/docs)
- 🐛 **Issues**: [GitHub Issues](https://github.com/ferg-cod3s/tunnelforge/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ferg-cod3s/tunnelforge/discussions)
- 📧 **Email**: support@tunnelforge.dev

## License

MIT License - see [LICENSE](../LICENSE) for details.