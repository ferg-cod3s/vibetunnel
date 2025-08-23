# TunnelForge TODO

## Current Sprint: Go Server Migration and TunnelForge Rebrand

### In Progress
- [ ] **Add local bypass authentication to Go server for Mac app compatibility**
  - Implement `X-TunnelForge-Local` header support in Go server
  - Add configuration for local bypass mode
  - Test with Mac app's current authentication flow

### Critical Path (Week 1)
- [ ] **Implement session persistence across server restarts**
  - Add session state persistence to Go server
  - Implement session recovery on startup
  - Handle client reconnection to persisted sessions

- [ ] **Add missing push notification endpoints to Go server**
  - Port `/api/test-notification` endpoint
  - Implement VAPID support and configuration
  - Test push notifications with Mac/iOS apps

### High Priority (Week 2)
- [ ] **Update Mac app to use Go server by default**
  - Change default `useExternalGoServer` setting to true
  - Update embedded server configuration
  - Test server switching functionality

- [ ] **Test iPhone app with Go server integration**
  - Verify authentication flow with Go server
  - Test all API endpoints used by iOS app
  - Validate session management and WebSocket connections

### Medium Priority (Week 3)
- [ ] **Implement priority 1 performance optimizations**
  - Request debouncing and caching in Mac app
  - WebSocket message batching
  - SwiftUI view optimization with LazyVStack
  - Connection pooling in server manager

- [ ] **Complete end-to-end testing**
  - Full regression testing with Go server
  - Cross-platform testing (Mac/iOS/Web)
  - Performance benchmarking vs Node.js server
  - Load testing with multiple concurrent sessions

## Completed ✅
- [x] **Rebrand app from TunnelForge to TunnelForge**
  - [x] Update app bundle identifiers (Mac/iOS: `dev.tunnelforge.*`)
  - [x] Update app display names and info plists
  - [x] Update Swift constants and configuration files
  - [x] Update logging subsystems and keychain services
  - [x] Update URL schemes and domain references
- [x] Comprehensive migration analysis (Node.js → Go server)
- [x] Mac/iPhone app integration analysis
- [x] Feature parity gap identification (98% complete)
- [x] Performance optimization analysis
- [x] Update CLAUDE.md to reference TODO.md tracking

## Future Enhancements
- [ ] Implement delta sync protocol for reduced network traffic
- [ ] Add virtualization for large session lists
- [ ] Binary protocol for terminal data
- [ ] Advanced monitoring and profiling
- [ ] Enterprise-grade security features

## Migration Status
- **Overall Progress**: 98% feature parity achieved
- **Critical Gaps**: 3 items (authentication, persistence, push notifications)
- **Timeline**: 3-4 weeks to production-ready release
- **Risk Level**: Low (comprehensive testing framework in place)

---
*Last updated: 2025-01-20*