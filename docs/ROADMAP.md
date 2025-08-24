# TunnelForge Technical Roadmap

> **🔄 Refactoring in Progress**: This roadmap reflects the current refactoring plans from Node.js + SwiftUI to Go + Bun + Tauri architecture. **Note: Implementation has not started yet - only planning and documentation exist.**

## Overview

This document outlines the technical roadmap for TunnelForge, detailing planned features, architectural improvements, and platform expansions for 2025 and beyond.

## Current State (Q1 2025)

### ✅ Completed
- Core terminal forwarding with `vt` command
- Web-based terminal viewer with xterm.js
- macOS menu bar application
- Basic authentication methods
- Local network access
- Session management (create, view, kill)
- npm package for Linux/headless systems
- Git follow mode for worktrees
- Dynamic terminal titles

### 🚧 In Progress
- **Migration Planning**: Complete ✅
- **Architecture Design**: Complete ✅
- **Documentation**: Complete ✅
- **Migration Testing Strategy**: Complete ✅

### ❌ Not Started
- **Go Server Implementation**: 0% complete
- **Bun Runtime Integration**: 0% complete
- **Tauri v2 Desktop App Development**: 0% complete
- **Performance Optimizations**: 0% complete

## Q2 2025: Implementation Start

### Backend Migration
**Goal**: Begin actual implementation of Go + Bun architecture

- [ ] **Go Server Development Start**
  - Create `development/go-server/` directory structure
  - Initialize Go module and dependencies
  - Implement basic HTTP server with health endpoint
  - Add basic session management
  - Implement WebSocket support

- [ ] **Bun Runtime Implementation Start**
  - Create `development/bun-web/` directory structure
  - Initialize Bun project with dependencies
  - Implement basic web server with static file serving
  - Add API proxy functionality to Go server

### Tauri Desktop App
**Goal**: Begin Tauri v2 app development

- [ ] **Project Setup**
  - Create Tauri v2 project structure
  - Set up Rust backend with basic functionality
  - Implement minimal web frontend integration
  - Test basic app functionality

### Performance Targets
- [ ] Basic Go server running on port 4021
- [ ] Basic Bun web server running on port 3001
- [ ] Basic Tauri app launching successfully
- [ ] Simple terminal session creation and management
