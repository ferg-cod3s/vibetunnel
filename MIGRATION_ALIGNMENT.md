# TunnelForge Migration Alignment Plan

## Current Misalignments & Resolution Plan

### 1. ✅ Multiple Server Implementations
**Issue**: Both Go (`server/`) and Node.js (`web/`) servers exist simultaneously

**Resolution**:
- [ ] Primary: Go server (`server/`) on port 4021 for production
- [ ] Secondary: Keep Node.js (`web/`) ONLY for npm package distribution
- [ ] Update all documentation to clarify this distinction
- [ ] Add deprecation notices to Node.js server

### 2. ✅ CLI Command Naming (vt vs tf)
**Issue**: Documentation mentions both `vt` (legacy) and `tf` (new) commands

**Resolution**:
- [ ] Create `tf` symlink pointing to main binary
- [ ] Keep `vt` as backwards-compatible alias
- [ ] Update all documentation to use `tf` in examples
- [ ] Add migration notice when `vt` is used

### 3. ✅ Port Configuration
**Issue**: Different components use different ports (4020, 4021, 3000)

**Resolution**:
- Port 4021: Go server (primary)
- Port 4020: Legacy Node.js server (deprecated)
- Port 3000: Development server (Bun)
- [ ] Standardize on 4021 for production
- [ ] Update all configurations

### 4. ✅ Build Artifacts Organization
**Issue**: Multiple server binaries cluttering `server/` directory

**Resolution**:
- [ ] Move all binaries to `server/bin/`
- [ ] Clean up root of `server/` directory
- [ ] Update .gitignore to exclude binaries
- [ ] Create clear build scripts

### 5. ✅ Architecture Documentation
**Issue**: Mixed references to old and new architectures

**Resolution**:
- [ ] Create clear separation: ARCHITECTURE.md (new) vs ARCHITECTURE_LEGACY.md (old)
- [ ] Update all cross-references
- [ ] Add migration timeline to documentation

## Implementation Steps

### Phase 1: CLI Standardization (Immediate)
1. Create `tf` command symlink
2. Update vt wrapper to show deprecation notice
3. Update all documentation examples

### Phase 2: Server Consolidation (This Week)
1. Clearly mark Node.js server as npm-only
2. Set Go server as default for all new deployments
3. Update desktop app to use Go server exclusively

### Phase 3: Port Standardization (This Week)
1. Update all configs to use port 4021
2. Add port migration guide for existing users
3. Update documentation

### Phase 4: Clean Build Structure (This Week)
1. Organize build artifacts
2. Create standardized build scripts
3. Update CI/CD pipelines

### Phase 5: Documentation Update (Next Week)
1. Separate legacy and modern architecture docs
2. Create migration guide for users
3. Update all README files

## Success Criteria
- [ ] Single primary server (Go) clearly identified
- [ ] `tf` command available and documented
- [ ] Consistent port usage (4021)
- [ ] Clean directory structure
- [ ] Clear documentation separation

## Timeline
- Week 1: CLI and Server consolidation
- Week 2: Port standardization and build cleanup
- Week 3: Documentation updates
- Week 4: Testing and validation

---
Last Updated: January 2025
Status: In Progress
