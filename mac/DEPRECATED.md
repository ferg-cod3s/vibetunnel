# ⚠️ DEPRECATED: Mac App

This native Swift Mac app has been **deprecated** in favor of the unified cross-platform Tauri application.

## 🔄 Migration Path

**Use the new Tauri app instead:**
- **Location**: `/desktop` directory
- **Platforms**: macOS, Linux, Windows (single codebase)
- **Technology**: Tauri v2 + Bun + TunnelForge web interface
- **Bundle Size**: ~10-15MB (vs 100MB+ for this Swift app)
- **Performance**: Superior performance and lower memory usage

## ✨ Advantages of Tauri App

| Feature | Swift Mac App | Tauri App |
|---------|---------------|-----------|
| **Platforms** | macOS only | macOS, Linux, Windows |
| **Bundle Size** | ~100MB+ | ~10-15MB |
| **Memory Usage** | ~200MB+ | ~50MB |
| **Build Complexity** | High (Node.js/Bun conflicts) | Simple (unified) |
| **Maintenance** | Mac-specific codebase | Shared codebase |
| **Performance** | Good | Excellent |
| **Web Interface** | Embedded WebView | Native Tauri WebView |
| **Server Backend** | Complex build pipeline | Direct Bun integration |

## 🚀 Quick Start with Tauri App

```bash
# Navigate to desktop directory
cd ../desktop

# Install dependencies
bun install

# Run in development
bun run dev

# Build for all platforms
bun run build:all
```

## 📦 Installation

### Development
```bash
cd desktop
bun run setup
bun run dev
```

### Production
Download from releases:
- **macOS**: `TunnelForge-[version].dmg`
- **Linux**: `TunnelForge-[version].AppImage` / `.deb` / `.rpm`
- **Windows**: `TunnelForge-[version]-setup.exe` / `.msi`

## 🔧 Migration for Contributors

If you were working on the Mac app:

1. **Switch to Tauri development**:
   ```bash
   cd ../desktop
   bun run setup:all
   ```

2. **Cross-platform development**:
   - Single Rust codebase for all platforms
   - Tauri v2 provides native system integration
   - Bun server handles web interface efficiently

3. **Build for Mac specifically**:
   ```bash
   bun run build:macos
   ```

## 🏗️ Features Migrated to Tauri

- ✅ **System Tray Integration**
- ✅ **Native Notifications**  
- ✅ **Auto-start on Boot**
- ✅ **Server Management**
- ✅ **Cross-platform Installers**
- ✅ **Auto-updates**
- ✅ **Web Interface Integration**
- ✅ **Bun Server Support**

## 🐛 Issues & Support

**For Mac-specific issues**: Please use the Tauri app instead.

**For cross-platform support**: See `/desktop/README.md`

## 📅 Timeline

- **December 2024**: Mac app deprecated
- **January 2025**: Mac app removed from releases
- **February 2025**: Mac directory removed from codebase

## 🔗 Quick Links

- **New Tauri App**: [`/desktop`](../desktop/)
- **Documentation**: [`/desktop/README.md`](../desktop/README.md)
- **Cross-platform CI/CD**: [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml)
- **Migration Guide**: [`/docs/migration-to-tauri.md`](../docs/migration-to-tauri.md)

---

**Thank you for your understanding!** The Tauri app provides a better experience for everyone with consistent behavior across all platforms.
