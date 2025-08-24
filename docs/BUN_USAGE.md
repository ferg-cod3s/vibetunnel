# Bun Usage Guidelines for TunnelForge

> **🔄 Refactoring in Progress**: Bun usage is planned for the target Go + Bun + Tauri architecture. The current implementation uses Node.js + npm/pnpm. This document describes how Bun will be used in the refactored version.

## Overview

TunnelForge will use **Bun** as its primary JavaScript runtime and package manager in the refactored architecture. Bun provides significant performance improvements over Node.js and npm, with faster startup times, built-in TypeScript support, and native bundling capabilities.

## ⚠️ IMPORTANT: Bun is Planned for Future

**Current Implementation**: Uses Node.js + npm/pnpm  
**Target Implementation**: Will use Bun for web interface and TypeScript execution

## Installation

### macOS
```bash
curl -fsSL https://bun.sh/install | bash
```

### Linux
```bash
curl -fsSL https://bun.sh/install | bash
```

### Windows (via WSL)
```bash
curl -fsSL https://bun.sh/install | bash
```

## Common Commands

### Package Management

```bash
# Install dependencies
bun install

# Add a dependency
bun add <package>

# Add a dev dependency
bun add -d <package>

# Remove a dependency
bun remove <package>

# Update dependencies
bun update
```

### Running Scripts

```bash
# Run a script from package.json
bun run <script-name>

# Run a JavaScript/TypeScript file directly
bun run file.ts

# Run with watch mode
bun --watch run file.ts
```

### Testing

```bash
# Run tests
bun test

# Run tests with watch mode
bun test --watch

# Run specific test file
bun test path/to/test.ts
```

### Building

```bash
# Build for production
bun run build

# Bundle a file
bun build ./src/index.ts --outdir ./dist

# Bundle with minification
bun build ./src/index.ts --outdir ./dist --minify
```

## Project-Specific Usage

### Web Terminal Components
```bash
cd server/internal/static
bun install          # Install terminal dependencies
bun run dev         # Start development server
bun run build       # Build for production
bun test            # Run terminal tests
```

### Go Server Static Assets
```bash
cd server/internal/static
bun install         # Install dependencies
bun run build       # Build static assets
```

### Frontend Development
```bash
cd web
bun install         # Install web dependencies
bun run dev         # Start dev server
bun run build       # Build for production
```

## Performance Benefits

Bun provides several advantages over npm/Node.js:

1. **Speed**: 4x faster package installation
2. **Native TypeScript**: No transpilation needed
3. **Built-in bundler**: No need for webpack/rollup
4. **SQLite built-in**: Native database support
5. **WebSocket support**: Native WS implementation
6. **Hot reload**: Faster development iteration

## Configuration Files

### package.json
Always use Bun-compatible scripts:
```json
{
  "scripts": {
    "dev": "bun run vite",
    "build": "bun run vite build",
    "test": "bun test",
    "lint": "bun run eslint ."
  }
}
```

### bunfig.toml
Create a `bunfig.toml` for project-wide Bun configuration:
```toml
[install]
# Use exact versions
exact = true

[install.scopes]
"@tunnelforge" = { token = "$GITHUB_TOKEN" }

[test]
# Test configuration
preload = ["./test/setup.ts"]
```

## Migration from npm

If you encounter any npm-specific files or commands:

### Replace npm commands:
- `npm install` → `bun install`
- `npm run <script>` → `bun run <script>`
- `npm test` → `bun test`
- `npx <command>` → `bunx <command>`

### Convert lock files:
- Delete `package-lock.json`
- Delete `yarn.lock` 
- Delete `pnpm-lock.yaml`
- Run `bun install` to generate `bun.lockb`

### Update CI/CD:
Replace npm commands in GitHub Actions, Docker files, and deployment scripts.

## Common Issues and Solutions

### Issue: Module not found
**Solution**: Run `bun install` to ensure all dependencies are installed.

### Issue: TypeScript errors
**Solution**: Bun handles TypeScript natively, no need for ts-node or tsx.

### Issue: Build fails
**Solution**: Clear cache with `bun pm cache rm` and reinstall.

### Issue: Different behavior from npm
**Solution**: Check [Bun compatibility](https://bun.sh/docs/runtime/nodejs-compatibility) for Node.js API differences.

## Best Practices

1. **Always commit bun.lockb**: This ensures consistent dependencies across environments
2. **Use workspace**: Leverage Bun workspaces for monorepo management
3. **Native APIs**: Use Bun's native APIs when available (Bun.serve, Bun.file, etc.)
4. **Performance**: Take advantage of Bun's speed for development workflows
5. **Testing**: Use Bun's built-in test runner for faster test execution

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [Bun GitHub](https://github.com/oven-sh/bun)
- [Bun Discord](https://discord.gg/bun)
- [Migration Guide](https://bun.sh/docs/cli/install#migrating-from-npm-yarn-or-pnpm)

## Enforcement

To ensure Bun usage across the team:

1. Add pre-commit hooks to check for npm/yarn/pnpm usage
2. Configure IDE to use Bun by default
3. Add CI checks to fail builds using wrong package manager
4. Document Bun requirement in README.md

Remember: **Bun is not just a faster npm - it's a complete JavaScript runtime** designed for modern development workflows.
