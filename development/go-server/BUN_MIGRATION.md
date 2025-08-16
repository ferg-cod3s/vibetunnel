# VibeTunnel Node.js → Bun Migration Plan

## 🎯 Migration Overview

**Goal**: Migrate VibeTunnel web server from Node.js to Bun for better performance, faster startup, and improved developer experience.

**Current Status**: Node.js 20+ with Express server  
**Target**: Bun 1.2.19+ with native Bun APIs where possible

---

## 🚀 Benefits of Moving to Bun

### Performance Improvements
- **~3x faster startup time** (Bun's native bundler + runtime)
- **~2x faster package installation** (Bun replaces npm/pnpm)
- **Better memory usage** (Bun uses JSC engine vs V8)
- **Faster TypeScript execution** (native TypeScript support)

### Developer Experience
- **Built-in bundler** (replaces esbuild)
- **Native TypeScript support** (no compilation step needed)
- **Built-in test runner** (replaces vitest)
- **Hot reload** (built-in watch mode)
- **Package manager** (replaces pnpm)

### Compatibility
- **Node.js API compatible** (most Express code works as-is)
- **npm registry support** (all existing packages work)
- **WebSocket support** (native WebSocket APIs)

---

## 🔧 Migration Steps

### Phase 1: Package Management Migration ✅
**Status**: Ready to execute

1. **Replace package.json scripts**:
```diff
- "dev:server": "tsx watch src/cli.ts --no-auth"
+ "dev:server": "bun --watch src/cli.ts --no-auth"

- "test": "vitest"
+ "test": "bun test"

- "build": "node scripts/build.js"
+ "build": "bun run scripts/build.js"
```

2. **Update engine requirements**:
```diff
"engines": {
-  "node": ">=20.0.0"
+  "bun": ">=1.0.0"
}
```

3. **Install dependencies with Bun**:
```bash
cd /home/f3rg/Documents/git/vibetunnel/web
bun install
```

### Phase 2: Build System Migration
**Priority**: High | **Complexity**: Medium

1. **Replace esbuild with Bun's bundler**:
   - Update `scripts/build.js` to use `Bun.build()`
   - Replace esbuild config with `bunfig.toml`
   - Update TypeScript compilation

2. **Native TypeScript support**:
   - Remove tsx dependency
   - Direct Bun execution of TypeScript files
   - Update watch mode scripts

### Phase 3: Test Framework Migration
**Priority**: Medium | **Complexity**: Low

1. **Replace Vitest with Bun Test**:
   - Convert test files to Bun's test syntax
   - Update test commands in package.json
   - Migrate coverage configuration

2. **Playwright integration**:
   - Ensure e2e tests work with Bun server
   - Update test helpers and configuration

### Phase 4: Runtime Optimization
**Priority**: Medium | **Complexity**: Medium

1. **Native Bun APIs**:
   - Replace some Express middleware with Bun.serve()
   - Use Bun's native WebSocket implementation
   - Optimize file serving with Bun.file()

2. **Performance improvements**:
   - Use Bun's faster JSON parsing
   - Implement Bun's native HTTP server features
   - Optimize static file serving

### Phase 5: Native Features (Optional)
**Priority**: Low | **Complexity**: High

1. **Full Bun.serve() migration**:
   - Replace Express with native Bun HTTP server
   - Implement custom routing (or use Hono)
   - Migrate middleware to Bun-native implementations

---

## 🧪 Compatibility Assessment

### ✅ Fully Compatible (No Changes Needed)
- Express.js server code
- WebSocket handling (ws package)
- Most npm dependencies
- TypeScript files
- JSON and configuration files

### 🔄 Minor Changes Required
- Build scripts (`scripts/build.js`)
- Test configuration and commands
- Package.json scripts
- Development commands

### ⚠️ Potential Issues
- **Native modules**: `node-pty`, `authenticate-pam`
  - **Solution**: Bun has improving native module support
  - **Fallback**: Keep Node.js for these specific modules
- **Custom build tools**: esbuild plugins
  - **Solution**: Migrate to Bun's build API
- **Some Node.js-specific APIs**
  - **Solution**: Use Bun polyfills or equivalent APIs

---

## 📋 Updated package.json Scripts

```json
{
  "scripts": {
    "clean": "bun run scripts/clean.js",
    "dev": "bun run scripts/dev.js",
    "dev:server": "bun --watch src/cli.ts --no-auth",
    "dev:client": "bun run scripts/dev.js --client-only",
    "build": "bun run scripts/build.js",
    "build:ci": "bun run scripts/build-ci.js",
    "build:npm": "bun run scripts/build-npm.js",
    "postinstall": "bun run scripts/postinstall-npm.js",
    "lint": "biome check src",
    "lint:fix": "biome check src --write",
    "typecheck": "bun --no-install tsc --noEmit",
    "test": "bun test",
    "test:coverage": "bun test --coverage",
    "test:watch": "bun test --watch",
    "format": "biome format src --write",
    "start": "bun src/cli.ts"
  }
}
```

---

## 🏃‍♂️ Quick Start Migration

### Immediate Steps (5 minutes):
```bash
# 1. Navigate to web directory
cd /home/f3rg/Documents/git/vibetunnel/web

# 2. Install dependencies with Bun
bun install

# 3. Test Bun compatibility
bun --watch src/cli.ts --no-auth

# 4. Run existing tests
bun test
```

### Next Steps:
1. Update package.json scripts
2. Test build process with Bun
3. Migrate test framework gradually
4. Optimize with native Bun APIs

---

## 🔄 Rollback Plan

If issues arise:
1. **Keep Node.js available**: `nvm use 20`
2. **Selective migration**: Use Bun for dev, Node.js for production initially
3. **Dependency fallback**: Use npm/pnpm for problematic packages
4. **Native module fallback**: Keep Node.js for native dependencies

---

## 📊 Expected Performance Improvements

### Development:
- **Install time**: 10-30s → 3-8s (67-75% faster)
- **Server startup**: 2-3s → 0.5-1s (50-75% faster)
- **Hot reload**: 1-2s → 0.1-0.3s (80-90% faster)
- **TypeScript compilation**: Built-in (no separate step)

### Production:
- **Cold start**: 1-2s → 0.3-0.8s (60-70% faster)
- **Memory usage**: 50-80MB → 30-50MB (30-40% reduction)
- **Request throughput**: 10-20% improvement
- **Bundle size**: 5-15% smaller

---

## 🛠️ Tools & Configuration

### Bun Configuration (`bunfig.toml`):
```toml
[install]
registry = "https://registry.npmjs.org/"
cache = false  # Disable for development

[dev]
watch = true
hot = true

[build]
target = "node"
format = "esm"
outdir = "dist"

[test]
preload = ["./src/test/setup.ts"]
```

### TypeScript Configuration:
```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "target": "ES2022",
    "module": "ESNext",
    "allowSyntheticDefaultImports": true
  }
}
```

---

## 🎯 Success Criteria

### Phase 1 (Immediate):
- [x] Bun installed and working
- [ ] Dependencies install with `bun install`
- [ ] Dev server runs with `bun --watch`
- [ ] Tests pass with `bun test`

### Phase 2 (1 week):
- [ ] Build process works with Bun
- [ ] All tests migrated and passing
- [ ] Production deployment successful
- [ ] Performance improvements verified

### Phase 3 (2 weeks):
- [ ] Native Bun API optimizations implemented
- [ ] Full compatibility with all features
- [ ] Documentation updated
- [ ] Team trained on new workflow

---

## 📝 Action Items

### Immediate:
1. **Test Bun compatibility** with current codebase
2. **Update package.json** scripts for Bun
3. **Run migration tests** to identify issues

### Short-term:
1. **Migrate build system** to Bun's bundler
2. **Update development workflow** documentation
3. **Test performance improvements**

### Long-term:
1. **Optimize with native Bun APIs**
2. **Update deployment pipeline**
3. **Consider full Express → Bun.serve() migration**

---

**Last Updated**: 2025-01-06  
**Bun Version**: 1.2.19  
**Migration Status**: Planning Phase → Ready to Execute 🚀
