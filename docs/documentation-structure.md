# Documentation Structure

## Overview

TunnelForge uses a dual documentation system to serve different audiences and purposes:

1. **Project Documentation** (`docs/`) - For developers and contributors
2. **Documentation Website** (`documentation/`) - For users and end-users

## Project Documentation (`docs/`)

### Purpose
- Technical specifications and architecture
- Development guides and contributing guidelines
- API documentation and implementation details
- Internal processes and workflows
- Platform-specific development notes

### Structure
```
docs/
├── INDEX.md                    # Main documentation index
├── ARCHITECTURE.md            # System architecture overview
├── API.md                     # API specifications
├── spec.md                    # Technical specifications
├── CONTRIBUTING.md            # Contributing guidelines
├── development.md             # Development setup
├── build-system.md            # Build system documentation
├── testing.md                 # Testing strategy and guides
├── security.md                # Security documentation
├── authentication.md          # Authentication system
├── push-notification.md       # Push notification implementation
├── keyboard-shortcuts.md      # Keyboard shortcuts reference
├── logging-style-guide.md     # Logging conventions
├── files.md                   # File organization catalog
├── project-overview.md        # High-level project overview
├── PRD.md                     # Product Requirements Document
├── RELEASE.md                 # Release process documentation
├── ROADMAP.md                 # Development roadmap
├── claude.md                  # Claude AI assistant guidelines
├── gemini.md                  # Gemini AI assistant guidelines
├── custom-node.md             # Custom Node.js build docs
├── npm-release.md             # NPM release process
├── BUN_USAGE.md               # Bun runtime usage
├── ios-spec.md                # iOS app specifications
├── terminal-rendering-upgrade.md # Terminal rendering improvements
├── cjk-ime-input.md          # CJK input method support
├── changelog-management.md    # Changelog maintenance
├── code-organization.md       # Code organization principles
├── deployment.md              # Deployment guides
├── development-tools.md       # Development tooling
├── files.md                   # File structure documentation
├── git-hooks.md               # Git hooks configuration
├── git-worktree-follow-mode.md # Git worktree workflows
├── hq.md                      # High-quality development practices
├── openapi.md                 # OpenAPI specifications
├── performance.md             # Performance optimization
├── push-impl.md               # Push implementation details
├── repoprompt.md              # Repository prompt guidelines
├── TESTING_EXTERNAL_DEVICES.md # External device testing
└── org-migrate.md             # Organization migration guide
```

## Documentation Website (`documentation/`)

### Purpose
- User-facing documentation and guides
- Interactive tutorials and examples
- API reference for end-users
- Getting started guides
- Feature documentation

### Note on Mintlify
The `documentation/docs.json` file contains the Mintlify configuration from the previous documentation system. This is kept for reference but is no longer actively used since we've migrated to Astro.

### Structure
```
documentation/
├── README.md                  # Documentation site overview
├── package.json              # Astro project configuration
├── astro.config.mjs         # Astro configuration
├── tsconfig.json            # TypeScript configuration
├── .gitignore               # Git ignore rules
├── src/                     # Source files
│   ├── pages/               # Documentation pages
│   ├── components/          # Reusable components
│   └── layouts/             # Page layouts
├── public/                  # Static assets
├── dist/                    # Built site (generated)
├── .astro/                  # Astro cache
├── node_modules/            # Dependencies
├── .vscode/                 # VS Code configuration
└── docs.json                # Mintlify configuration (legacy)
```

## When to Use Each

### Use `docs/` for:
- Technical specifications
- Development setup guides
- Contributing guidelines
- Internal processes
- Architecture documentation
- API implementation details
- Platform-specific notes

### Use `documentation/` for:
- User guides and tutorials
- Feature documentation
- Getting started guides
- Interactive examples
- End-user API reference
- Visual documentation

## Maintenance

### Project Documentation
- Update when code changes
- Keep technical details current
- Maintain cross-references
- Regular review and cleanup

### Documentation Website
- Update when features change
- Ensure user examples work
- Test interactive elements
- Maintain visual consistency

## Cross-References

- Use relative paths when linking between docs
- Reference the appropriate documentation type
- Keep links updated when files move
- Use the INDEX.md as the main navigation hub

## Adding New Documentation

1. **Determine the audience**: Developers → `docs/`, Users → `documentation/`
2. **Choose the right location**: Follow existing organization patterns
3. **Update INDEX.md**: Add new documentation to the appropriate section
4. **Cross-reference**: Link to related documentation
5. **Maintain**: Keep documentation current with code changes
