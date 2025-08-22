# TunnelForge macOS App

This directory contains the macOS version of TunnelForge.

## Quick Start

### Building
```bash
# Using Xcode
xcodebuild -workspace TunnelForge.xcworkspace -scheme TunnelForge build

# Using build script
./scripts/build.sh
```

### Running Tests
```bash
xcodebuild -workspace TunnelForge.xcworkspace -scheme TunnelForge test
```

### Creating Release
```bash
./scripts/build.sh --configuration Release --sign
./scripts/create-dmg.sh build/Build/Products/Release/TunnelForge.app
```

## Project Structure

```
mac/
├── TunnelForge/           # Source code
│   ├── Core/            # Core services and models
│   ├── Presentation/    # Views and UI components
│   └── Utilities/       # Helper utilities
├── TunnelForgeTests/     # Unit tests
├── scripts/             # Build and release scripts
├── docs/                # macOS-specific documentation
└── private/             # Signing keys (not in git)
```

## Scripts

- `build.sh` - Build the app with optional signing
- `create-dmg.sh` - Create a DMG for distribution
- `release.sh` - Full release process
- `monitor-ci.sh` - Monitor CI build status
- `sign-and-notarize.sh` - Code signing and notarization

## Documentation

See `docs/` for macOS-specific documentation:
- Code signing setup
- Release process
- Sparkle update framework
- Development signing

## CI/CD

The app is built automatically on GitHub Actions:
- On every push to main
- On pull requests
- For releases (tagged with v*)

See `.github/workflows/swift.yml` for the build configuration.