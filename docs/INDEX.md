# TunnelForge Documentation Index

This index provides a comprehensive overview of all documentation in the TunnelForge project, organized by category and purpose.

## 📚 Main Documentation

### Getting Started
- [**README.md**](../README.md) - Project overview, quick start guide, and basic usage
- [**PRD.md**](PRD.md) - Product Requirements Document with vision, features, and roadmap
- [**CONTRIBUTING.md**](CONTRIBUTING.md) - Contributing guidelines and development workflow
- [**Documentation Structure**](documentation-structure.md) - How documentation is organized and maintained
- [**Documentation Updates**](DOCUMENTATION_UPDATES.md) - Summary of recent documentation changes

### Architecture & Design
- [**ARCHITECTURE.md**](ARCHITECTURE.md) - System architecture, component relationships, data flow
- [**architecture-mario.md**](architecture-mario.md) - Alternative architecture documentation
- [**spec.md**](spec.md) - Core technical specifications and protocols
- [**API.md**](API.md) - Complete REST and WebSocket API documentation
- [**ios-spec.md**](ios-spec.md) - iOS companion app specification

### Development Guides
- [**development.md**](development.md) - Development setup, code style, patterns
- [**build-system.md**](build-system.md) - Build system overview and usage
- [**deployment.md**](deployment.md) - Deployment and distribution guide
- [**RELEASE.md**](RELEASE.md) - Comprehensive release process documentation

### Feature Documentation
- [**authentication.md**](authentication.md) - Authentication system and security
- [**push-notification.md**](push-notification.md) - Push notification implementation
- [**security.md**](security.md) - Security configuration and best practices
- [**keyboard-shortcuts.md**](keyboard-shortcuts.md) - Keyboard shortcut reference

### Testing
- [**testing.md**](testing.md) - Testing strategy and test suite documentation
- [**TESTING_EXTERNAL_DEVICES.md**](TESTING_EXTERNAL_DEVICES.md) - Testing on external devices (iPad, etc.)

### Tools & Utilities
- [**claude.md**](claude.md) - Claude CLI usage guide
- [**gemini.md**](gemini.md) - Gemini CLI for large codebase analysis
- [**custom-node.md**](custom-node.md) - Custom Node.js build documentation

### Reference
- [**project-overview.md**](project-overview.md) - High-level project overview
- [**files.md**](files.md) - File catalog and organization
- [**logging-style-guide.md**](logging-style-guide.md) - Logging conventions and style guide
- [**CHANGELOG.md**](../CHANGELOG.md) - Project changelog

## 🌐 Documentation Website

The TunnelForge documentation website is built with Astro and located in the `../documentation/` folder:

- [**Documentation Site**](../documentation/) - Interactive documentation website
- [**Documentation README**](../documentation/README.md) - Documentation site development guide

## 🍎 Platform-Specific Documentation

### macOS (`mac/`)
- [**mac/README.md**](../mac/README.md) - macOS app overview and quick start
- [**mac/docs/code-signing.md**](../mac/docs/code-signing.md) - Comprehensive code signing guide
- [**mac/docs/BuildArchitectures.md**](../mac/docs/BuildArchitectures.md) - Build architecture details
- [**mac/docs/BuildRequirements.md**](../mac/docs/BuildRequirements.md) - Build requirements
- [**mac/docs/sparkle-keys.md**](../mac/docs/sparkle-keys.md) - Sparkle update framework keys
- [**mac/docs/sparkle-stats-store.md**](../mac/docs/sparkle-stats-store.md) - Update statistics

### iOS (`ios/`)
- [**ios/README.md**](../ios/README.md) - iOS app overview
- [**ios/CLAUDE.md**](../ios/CLAUDE.md) - iOS development guidelines for Claude

### Web (`web/`)
- [**web/README.md**](../web/README.md) - Web server and frontend overview
- [**web/docs/spec.md**](../web/docs/spec.md) - Web server implementation specification
- [**web/docs/performance.md**](../web/docs/performance.md) - Performance optimization guide
- [**web/docs/playwright-testing.md**](../web/docs/playwright-testing.md) - Playwright E2E testing
- [**web/docs/socket-protocol.md**](../web/docs/socket-protocol.md) - WebSocket protocol documentation
- [**web/docs/terminal-titles.md**](../web/docs/terminal-titles.md) - Terminal title management
- [**web/docs/TF_INSTALLATION.md**](../web/docs/TF_INSTALLATION.md) - VT command installation
- [**web/docs/npm.md**](../web/docs/npm.md) - NPM package documentation

### Apple Shared (`apple/`)
- [**apple/docs/modern-swift.md**](../apple/docs/modern-swift.md) - Modern Swift patterns
- [**apple/docs/swift-concurrency.md**](../apple/docs/swift-concurrency.md) - Swift concurrency guide
- [**apple/docs/swift-testing-playbook.md**](../apple/docs/swift-testing-playbook.md) - Swift testing best practices
- [**apple/docs/swiftui.md**](../apple/docs/swiftui.md) - SwiftUI guidelines
- [**apple/docs/logging-private-fix.md**](../apple/docs/logging-private-fix.md) - Logging configuration

## 🤖 AI Assistant Guidelines

### CLAUDE.md Files
These files provide specific instructions for Claude AI when working with different parts of the codebase:

- [**CLAUDE.md**](../CLAUDE.md) - Main project guidelines for Claude
- [**web/CLAUDE.md**](../web/CLAUDE.md) - Web development specific instructions
- [**mac/CLAUDE.md**](../mac/CLAUDE.md) - macOS development guidelines
- [**ios/CLAUDE.md**](../ios/CLAUDE.md) - iOS development guidelines

### GEMINI.md
- [**GEMINI.md**](../GEMINI.md) - Instructions for Gemini AI assistant

## 📋 Documentation Standards

When adding new documentation:

1. **Location**: Place documentation in the most relevant directory
   - General project docs in `/docs`
   - Documentation website files in `/documentation`
   - Platform-specific docs in their respective directories
   - Keep related documentation together

2. **Documentation Website**: For user-facing documentation, add content to the Astro site in `/documentation/src/`

3. **Project Documentation**: For developer and technical documentation, add files to `/docs/`

4. **Cross-references**: Use relative paths when linking between documentation files