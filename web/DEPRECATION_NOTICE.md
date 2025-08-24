# ⚠️ DEPRECATION NOTICE

## This Node.js Server is Being Phased Out

### Current Status: NPM PACKAGE ONLY

This Node.js/TypeScript server implementation is **deprecated** and maintained only for:
- npm package distribution (`npm install -g tunnelforge`)
- Legacy installations that haven't migrated yet
- Backwards compatibility during the transition period

### ✅ New Primary Server

The Go server in `../server/` is now the primary implementation:
- **Location**: `../server/`
- **Port**: 4021 (new standard)
- **Performance**: 10x faster, 5x less memory
- **Features**: All features plus enhanced security

### Migration Guide

#### For Users
```bash
# Old (deprecated)
vt command  # Uses Node.js server on port 4020

# New (recommended)
tf command  # Uses Go server on port 4021
```

#### For Developers
- **DO NOT** add new features to this Node.js server
- **DO NOT** use this for new deployments
- **DO** implement all new features in the Go server
- **DO** direct users to migrate to the Go version

### Timeline
- **Q1 2025**: Deprecation notices added ✅
- **Q2 2025**: Feature freeze on Node.js server
- **Q3 2025**: Security updates only
- **Q4 2025**: End of life, npm package points to Go binary

### Why the Change?
- **Performance**: Go server is 10x faster
- **Memory**: Uses 80% less memory
- **Security**: Better authentication and rate limiting
- **Maintenance**: Single codebase to maintain
- **Cross-platform**: Better support via Tauri

### Need Help?
- Migration guide: [docs/MIGRATION.md](../docs/MIGRATION.md)
- Discord: [https://discord.gg/tunnelforge](https://discord.gg/tunnelforge)
- Issues: [GitHub Issues](https://github.com/ferg-cod3s/tunnelforge/issues)

---
Last Updated: January 2025
