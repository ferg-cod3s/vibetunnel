# TunnelForge Windows Desktop App

TunnelForge Windows is a lightweight, native desktop application that brings the power of terminal sharing to Windows desktops. Built with Tauri (Rust + system webview), it provides exceptional performance with minimal resource usage, system tray integration, and professional Windows installers.

## Features

- ⚡ **Ultra-lightweight**: ~10MB installer (vs 100MB+ Electron alternatives)
- 🚀 **High Performance**: Rust backend with native system webview
- 🖥️ **Native Windows Experience**: System tray integration with context menus
- 🔔 **Windows Notifications**: Native toast notifications for session events
- 📦 **Professional Installers**: MSI and NSIS installers with proper integration
- 🔄 **Auto-updates**: Seamless updates through built-in updater
- 🎛️ **Server Management**: Built-in Go server with lifecycle management
- 🌐 **Same Web Interface**: Identical functionality to Mac and web versions
- 💾 **Low Memory Usage**: ~50MB RAM (vs 200MB+ Electron apps)
- 🔒 **Windows Integration**: Registry settings, startup integration, Windows Service support

## Installation

### MSI Installer (Recommended)
```powershell
# Download and run the MSI installer
TunnelForge-1.0.0-x64.msi
```

### NSIS Installer
```powershell
# Download and run the NSIS installer
TunnelForge-1.0.0-x64-setup.exe
```

### Chocolatey (Coming Soon)
```powershell
choco install tunnelforge
```

### Winget (Coming Soon)
```powershell
winget install TunnelForge.TunnelForge
```

## Development

### Prerequisites
- Rust 1.70+ (install via [rustup.rs](https://rustup.rs/))
- Node.js 18+ (for Tauri CLI)
- Go 1.21+ (for server development)
- Visual Studio Build Tools or Visual Studio Community
- Windows 10/11 (development and target platform)

### Setup
```powershell
# Clone the repository
git clone https://github.com/ferg-cod3s/tunnelforge.git
cd tunnelforge/windows

# Install Tauri CLI and dependencies
npm run setup

# Run in development mode
npm run dev
```

### Building

#### Build for current platform
```powershell
npm run build
```

#### Debug build (faster compilation)
```powershell
npm run build:debug
```

#### Build specific installer formats
```powershell
npm run build:msi   # Windows Installer (MSI)
npm run build:nsis  # NSIS Setup Executable
npm run build:exe   # Portable Executable
```

#### Cross-compilation
```powershell
# Install target (if building on different architecture)
rustup target add x86_64-pc-windows-msvc
rustup target add aarch64-pc-windows-msvc

# Build for specific architecture
cargo tauri build --target x86_64-pc-windows-msvc
cargo tauri build --target aarch64-pc-windows-msvc
```

## Architecture

### Components
- **Tauri Backend** (`src-tauri/src/main.rs`): Rust application lifecycle, server management, system tray
- **Web Interface**: Identical to Mac app - served by embedded Go server  
- **Go Server**: Bundled binary for terminal session management
- **WebView2**: Microsoft Edge WebView2 for rendering (automatically installed)

### File Structure
```
windows/
├── src-tauri/
│   ├── src/
│   │   └── main.rs           # Rust application backend
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Tauri configuration
│   └── build.rs              # Build script
├── target/                   # Rust build output
├── package.json              # Node.js dependencies and scripts
└── README.md
```

### Why Tauri over Electron?

| Feature | Tauri | Electron |
|---------|-------|----------|
| **Bundle Size** | ~10-15MB | ~100-150MB |
| **Memory Usage** | ~50MB | ~200MB+ |
| **Performance** | Native Rust | Node.js overhead |
| **Security** | Sandboxed by default | Requires configuration |
| **Updates** | Native updater | Custom implementation |
| **Web Engine** | WebView2 (Edge) | Bundled Chromium |

## Windows Integration

### System Tray
- Right-click for context menu with:
  - Open TunnelForge
  - New Terminal Session
  - View Sessions
  - Server status and URL
  - Settings and About
  - Exit

### Startup Integration
TunnelForge can optionally start automatically when Windows boots:
1. Open TunnelForge
2. Go to Settings
3. Enable "Start with Windows"

### Windows Service (Optional)
For enterprise environments, TunnelForge can run as a Windows Service:
```powershell
# Install as service (run as administrator)
sc create TunnelForge binPath="C:\Program Files\TunnelForge\tunnelforge-windows.exe --service"
sc start TunnelForge
```

### Registry Settings
TunnelForge stores settings in the Windows Registry:
- **User Settings**: `HKEY_CURRENT_USER\SOFTWARE\TunnelForge`
- **Startup Entry**: `HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`

## Configuration

### Settings Locations
- **User Data**: `%APPDATA%\TunnelForge\`
- **Logs**: `%APPDATA%\TunnelForge\logs\`
- **Server Data**: `%APPDATA%\TunnelForge\server\`

### Environment Variables
- `TUNNELFORGE_PORT`: Override default server port (4021)
- `TUNNELFORGE_HOST`: Override server host (127.0.0.1)
- `TUNNELFORGE_LOG_LEVEL`: Set log level (debug, info, warn, error)

## Security

### Windows Defender
TunnelForge is code-signed and should not trigger Windows Defender warnings. If you encounter issues:

1. **SmartScreen Warning**: Click "More info" → "Run anyway"
2. **Defender Quarantine**: Add TunnelForge to exclusions
3. **Enterprise Policies**: Contact your IT administrator

### Firewall Configuration
Windows Firewall may prompt for network access:
- **Private Networks**: Allow (recommended for home/office use)
- **Public Networks**: Block or allow based on your security requirements

## Troubleshooting

### Common Issues

#### WebView2 not installed
```powershell
# Download and install WebView2 Runtime
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
winget install Microsoft.EdgeWebView2Runtime
```

#### Server fails to start
```powershell
# Check if port is available
netstat -an | findstr ":4021"

# Try different port
set TUNNELFORGE_PORT=4022
tunnelforge-windows.exe
```

#### System tray not showing
Check Windows taskbar settings:
1. Right-click taskbar → "Taskbar settings"
2. Scroll to "Notification area"
3. Click "Turn system icons on or off"
4. Ensure "TunnelForge" is enabled

### Logs
View application logs:
```powershell
# Application logs
type "%APPDATA%\TunnelForge\logs\tunnelforge.log"

# Windows Event Log
eventvwr.msc
# Navigate to: Windows Logs > Application
# Filter by source: TunnelForge
```

### Debug Mode
Run with debug output:
```powershell
set RUST_LOG=debug
tunnelforge-windows.exe
```

### Performance Monitoring
Monitor resource usage:
```powershell
# Task Manager
taskmgr.exe

# Resource Monitor  
resmon.exe

# Performance Toolkit
perfmon.exe
```

## Enterprise Deployment

### Group Policy
Create Group Policy Objects (GPO) for enterprise deployment:
- **Installation**: Deploy MSI via Software Installation
- **Settings**: Configure via Registry preferences
- **Security**: Control firewall and network access

### Silent Installation
```powershell
# MSI silent install
msiexec /i TunnelForge-1.0.0-x64.msi /quiet /norestart

# NSIS silent install
TunnelForge-1.0.0-x64-setup.exe /S
```

### System Requirements
- **OS**: Windows 10 version 1903+ or Windows 11
- **Architecture**: x64 or ARM64
- **WebView2**: Automatically installed if missing
- **RAM**: 100MB minimum, 200MB recommended
- **Storage**: 50MB for application, 100MB for data

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test on multiple Windows versions
5. Submit a pull request

### Testing Environments
We test on:
- Windows 10 (1903, 21H2)
- Windows 11 (22H2, 23H2)
- Windows Server 2019/2022

## Support

- 📖 **Documentation**: [tunnelforge.dev/docs](https://tunnelforge.dev/docs)
- 🐛 **Issues**: [GitHub Issues](https://github.com/ferg-cod3s/tunnelforge/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ferg-cod3s/tunnelforge/discussions)
- 📧 **Email**: support@tunnelforge.dev

## License

MIT License - see [LICENSE](../LICENSE) for details.