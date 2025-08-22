# TunnelForge Linux Desktop App

TunnelForge Linux is a lightweight, native desktop application that brings the power of terminal sharing to Linux desktops. Built with Tauri (Rust + system webview), it provides exceptional performance with minimal resource usage, system tray integration, and professional packaging.

## Features

- ⚡ **Ultra-lightweight**: ~10MB binary (vs 100MB+ Electron alternatives)
- 🚀 **High Performance**: Rust backend with native system webview
- 🖥️ **Native Desktop Experience**: System tray integration with context menus
- 🔔 **Desktop Notifications**: Get notified about session events
- 📦 **Easy Installation**: Multiple package formats (.AppImage, .deb, .rpm)
- 🔄 **Auto-updates**: Seamless updates through built-in updater
- 🎛️ **Server Management**: Built-in Go server with lifecycle management
- 🌐 **Same Web Interface**: Identical functionality to Mac and web versions
- 💾 **Low Memory Usage**: ~50MB RAM (vs 200MB+ Electron apps)

## Installation

### AppImage (Universal Linux)
```bash
# Download and run
chmod +x TunnelForge-*.AppImage
./TunnelForge-*.AppImage
```

### Ubuntu/Debian (.deb)
```bash
sudo dpkg -i tunnelforge_*_amd64.deb
sudo apt-get install -f  # Fix dependencies if needed
```

### Red Hat/Fedora (.rpm)
```bash
sudo rpm -i tunnelforge-*.x86_64.rpm
# or
sudo dnf install tunnelforge-*.x86_64.rpm
```

### Arch Linux
```bash
# Install from AUR (coming soon)
yay -S tunnelforge
```

## Development

### Prerequisites
- Rust 1.70+ (install via [rustup.rs](https://rustup.rs/))
- Node.js 18+ (for Tauri CLI)
- Go 1.21+ (for server development)
- System dependencies:
  ```bash
  # Ubuntu/Debian
  sudo apt install libwebkit2gtk-4.0-dev libgtk-3-dev libayatana-appindicator3-dev
  
  # Fedora
  sudo dnf install webkit2gtk4.0-devel gtk3-devel libappindicator-gtk3-devel
  
  # Arch Linux
  sudo pacman -S webkit2gtk gtk3 libappindicator-gtk3
  ```

### Setup
```bash
# Clone the repository
git clone https://github.com/ferg-cod3s/tunnelforge.git
cd tunnelforge/linux

# Install Tauri CLI and dependencies
npm run setup

# Run in development mode
npm run dev
```

### Building

#### Build for current platform
```bash
npm run build
```

#### Debug build (faster compilation)
```bash
npm run build:debug
```

#### Build specific formats
```bash
npm run build:appimage  # Universal AppImage
npm run build:deb       # Ubuntu/Debian package
npm run build:rpm       # Red Hat/Fedora package
```

#### Cross-compilation (with Rust targets)
```bash
# Install target
rustup target add x86_64-unknown-linux-gnu
rustup target add aarch64-unknown-linux-gnu

# Build for specific architecture
cargo tauri build --target x86_64-unknown-linux-gnu
cargo tauri build --target aarch64-unknown-linux-gnu
```

## Architecture

### Components
- **Tauri Backend** (`src-tauri/src/main.rs`): Rust application lifecycle, server management, system tray
- **Web Interface**: Identical to Mac app - served by embedded Go server  
- **Go Server**: Bundled binary for terminal session management
- **System Webview**: Native WebKit for rendering (no Chromium bundled)

### File Structure
```
linux/
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
| **Web Engine** | System WebKit | Bundled Chromium |

## System Integration

### System Tray
- Click to toggle main window
- Right-click for context menu with:
  - Open TunnelForge
  - New Terminal Session
  - View Sessions
  - Server status and URL
  - Settings and About
  - Quit

### Auto-start (Optional)
TunnelForge can optionally start automatically when you log in:
1. Open TunnelForge
2. Go to Settings
3. Enable "Start on Login"

### File Associations
TunnelForge registers itself for:
- `.vtunnel` session files
- `tunnelforge://` URL scheme

## Configuration

### Settings Location
- **User Data**: `~/.config/tunnelforge/`
- **Logs**: `~/.config/tunnelforge/logs/`
- **Server Data**: `~/.config/tunnelforge/server/`

### Environment Variables
- `TUNNELFORGE_PORT`: Override default server port (4021)
- `TUNNELFORGE_HOST`: Override server host (127.0.0.1)
- `TUNNELFORGE_LOG_LEVEL`: Set log level (debug, info, warn, error)

## Package Details

### Dependencies
The Linux packages include all necessary dependencies. Optional recommendations:
- **git**: For repository integration features
- **openssh-client**: For SSH session support

### Desktop Integration
- Application menu entry in "Development" category
- MIME type associations for session files
- Desktop notifications support
- System tray integration

### Security
- AppArmor/SELinux profiles included
- Sandboxed execution where supported
- No elevated privileges required

## Troubleshooting

### Common Issues

#### AppImage won't run
```bash
# Make sure it's executable
chmod +x TunnelForge-*.AppImage

# Check for missing FUSE
sudo apt install fuse  # Ubuntu/Debian
sudo dnf install fuse  # Fedora
```

#### Server fails to start
```bash
# Check if port is available
sudo netstat -tlnp | grep 4021

# Try different port
TUNNELFORGE_PORT=4022 tunnelforge
```

#### System tray not showing
Some desktop environments require additional packages:
```bash
# GNOME
sudo apt install gnome-shell-extension-appindicator

# KDE
sudo apt install plasma-workspace-wayland
```

### Logs
View application logs:
```bash
# Application logs
tail -f ~/.config/tunnelforge/logs/tunnelforge.log

# Server logs
journalctl --user -f -u tunnelforge
```

### Debug Mode
Run with debug output:
```bash
ELECTRON_ENABLE_LOGGING=1 NODE_ENV=development tunnelforge
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test on multiple Linux distributions
5. Submit a pull request

### Testing Distributions
We test on:
- Ubuntu 20.04+ (LTS)
- Debian 11+
- Fedora 35+
- Arch Linux (latest)
- openSUSE Leap 15.4+

## Support

- 📖 **Documentation**: [tunnelforge.dev/docs](https://tunnelforge.dev/docs)
- 🐛 **Issues**: [GitHub Issues](https://github.com/ferg-cod3s/tunnelforge/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/ferg-cod3s/tunnelforge/discussions)
- 📧 **Email**: support@tunnelforge.dev

## License

MIT License - see [LICENSE](../LICENSE) for details.