# Development Tools

> **🔄 Refactoring in Progress**: This document covers development tools for both the current Node.js + SwiftUI implementation and the target Go + Bun + Tauri architecture. Tool requirements will change as the refactoring progresses.

## Overview

Comprehensive guide for setting up and configuring development tools for TunnelForge across all platforms.

## Prerequisites

### System Requirements
- **macOS**: 13.0+ (Ventura or later) for Mac development
- **Node.js**: 18.0+ LTS or 20.0+ current
- **pnpm**: 8.0+ (preferred package manager)
- **Xcode**: 15.0+ for macOS/iOS development
- **Git**: 2.30+ for version control

### Installation Commands
```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# Install pnpm
npm install -g pnpm

# Install Xcode (macOS)
# Download from Mac App Store or developer.apple.com

# Verify installations
node --version
pnpm --version
git --version
xcodebuild -version
```

## JavaScript/TypeScript Setup

### Package Manager Configuration

#### pnpm Configuration
```bash
# Install pnpm globally
npm install -g pnpm

# Configure pnpm
pnpm config set store-dir ~/.pnpm-store
pnpm config set strict-peer-dependencies false
pnpm config set auto-install-peers true
```

#### Project Setup
```json
// package.json
{
  "packageManager": "pnpm@8.15.0",
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

### ESLint Configuration

#### Installation
```bash
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
pnpm add -D eslint-plugin-import eslint-plugin-jsx-a11y eslint-plugin-react
pnpm add -D eslint-config-prettier eslint-plugin-prettier
```

#### Configuration (.eslintrc.json)
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    },
    "project": "./tsconfig.json"
  },
  "plugins": [
    "@typescript-eslint",
    "import",
    "jsx-a11y",
    "prettier"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:jsx-a11y/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "error",
    "prefer-const": "error",
    "no-var": "error",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { 
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
      "newlines-between": "always",
      "alphabetize": { "order": "asc" }
    }],
    "jsx-a11y/anchor-is-valid": "error",
    "prettier/prettier": "error"
  },
  "settings": {
    "import/resolver": {
      "typescript": {}
    }
  }
}
```

### Prettier Configuration

#### Installation
```bash
pnpm add -D prettier
```

#### Configuration (.prettierrc.json)
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "quoteProps": "as-needed",
  "jsxSingleQuote": false,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "printWidth": 80,
        "proseWrap": "always"
      }
    }
  ]
}
```

#### Ignore File (.prettierignore)
```
node_modules
dist
build
coverage
.next
.cache
public
*.min.js
*.min.css
```

### EditorConfig

#### Configuration (.editorconfig)
```ini
# EditorConfig is awesome: https://EditorConfig.org

# Top-most EditorConfig file
root = true

# Universal settings
[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

# Markdown files
[*.md]
trim_trailing_whitespace = false
max_line_length = 80

# TypeScript/JavaScript
[*.{ts,tsx,js,jsx,mjs,cjs}]
indent_size = 2
max_line_length = 100

# JSON files
[*.json]
indent_size = 2

# YAML files
[*.{yml,yaml}]
indent_size = 2

# Swift files
[*.swift]
indent_size = 4

# Shell scripts
[*.{sh,bash}]
indent_size = 2

# Makefiles
[Makefile]
indent_style = tab

# Python files
[*.py]
indent_size = 4
max_line_length = 88
```

### TypeScript Configuration

#### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "jsx": "react-jsx",
    
    "outDir": "./dist",
    "rootDir": "./src",
    "removeComments": true,
    "noEmit": true,
    
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    
    "types": ["node", "vite/client"],
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@services/*": ["./src/services/*"],
      "@utils/*": ["./src/utils/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "build", "coverage"]
}
```

### Accessibility Linting

#### Installation
```bash
pnpm add -D eslint-plugin-jsx-a11y
```

#### Additional Rules
```json
{
  "rules": {
    "jsx-a11y/alt-text": "error",
    "jsx-a11y/anchor-has-content": "error",
    "jsx-a11y/aria-props": "error",
    "jsx-a11y/aria-proptypes": "error",
    "jsx-a11y/aria-role": "error",
    "jsx-a11y/aria-unsupported-elements": "error",
    "jsx-a11y/click-events-have-key-events": "error",
    "jsx-a11y/heading-has-content": "error",
    "jsx-a11y/html-has-lang": "error",
    "jsx-a11y/img-redundant-alt": "error",
    "jsx-a11y/interactive-supports-focus": "error",
    "jsx-a11y/label-has-associated-control": "error",
    "jsx-a11y/media-has-caption": "error",
    "jsx-a11y/mouse-events-have-key-events": "error",
    "jsx-a11y/no-access-key": "error",
    "jsx-a11y/no-autofocus": "error",
    "jsx-a11y/no-distracting-elements": "error",
    "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
    "jsx-a11y/no-noninteractive-element-interactions": "error",
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
    "jsx-a11y/no-redundant-roles": "error",
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error",
    "jsx-a11y/scope": "error",
    "jsx-a11y/tabindex-no-positive": "error"
  }
}
```

## Swift/macOS Setup

### SwiftFormat

#### Installation
```bash
# Via Homebrew
brew install swiftformat

# Via Swift Package Manager
git clone https://github.com/nicklockwood/SwiftFormat
cd SwiftFormat
swift build -c release
cp .build/release/swiftformat /usr/local/bin/
```

#### Configuration (.swiftformat)
```
# File options
--exclude Pods,Generated,DerivedData

# Format options
--allman false
--indent 4
--indentcase false
--trimwhitespace always
--voidtype tuple
--nospaceoperators ..<,...
--stripunusedargs closure-only
--wraparguments before-first
--wrapparameters before-first
--wrapcollections before-first
--maxwidth 120

# Rules
--enable blankLinesAroundMark
--enable consecutiveSpaces
--enable duplicateImports
--enable elseOnSameLine
--enable emptyBraces
--enable indent
--enable leadingDelimiters
--enable linebreaks
--enable numberFormatting
--enable redundantBreak
--enable redundantExtensionACL
--enable redundantFileprivate
--enable redundantGet
--enable redundantInit
--enable redundantLet
--enable redundantLetError
--enable redundantNilInit
--enable redundantObjc
--enable redundantParens
--enable redundantPattern
--enable redundantRawValues
--enable redundantReturn
--enable redundantSelf
--enable redundantType
--enable redundantVoidReturnType
--enable semicolons
--enable sortedImports
--enable spaceAroundBraces
--enable spaceAroundBrackets
--enable spaceAroundComments
--enable spaceAroundGenerics
--enable spaceAroundOperators
--enable spaceAroundParens
--enable spaceInsideBraces
--enable spaceInsideBrackets
--enable spaceInsideComments
--enable spaceInsideGenerics
--enable spaceInsideParens
--enable todos
--enable trailingClosures
--enable trailingCommas
--enable trailingSpace
--enable typeSugar
--enable void
--enable wrapArguments
--enable wrapAttributes

# Disabled rules
--disable andOperator
--disable wrapMultilineStatementBraces
```

### SwiftLint

#### Installation
```bash
# Via Homebrew
brew install swiftlint

# Via CocoaPods
pod 'SwiftLint'
```

#### Configuration (.swiftlint.yml)
```yaml
included:
  - mac/TunnelForge
  - ios/TunnelForge

excluded:
  - Pods
  - DerivedData
  - .build
  - Generated

analyzer_rules:
  - unused_import
  - unused_declaration

opt_in_rules:
  - array_init
  - attributes
  - closure_end_indentation
  - closure_spacing
  - collection_alignment
  - contains_over_filter_count
  - contains_over_filter_is_empty
  - contains_over_first_not_nil
  - contains_over_range_nil_comparison
  - discouraged_object_literal
  - empty_collection_literal
  - empty_count
  - empty_string
  - enum_case_associated_values_count
  - explicit_init
  - extension_access_modifier
  - fallthrough
  - fatal_error_message
  - file_header
  - first_where
  - flatmap_over_map_reduce
  - identical_operands
  - joined_default_parameter
  - last_where
  - legacy_multiple
  - legacy_random
  - literal_expression_end_indentation
  - lower_acl_than_parent
  - modifier_order
  - nimble_operator
  - nslocalizedstring_key
  - number_separator
  - object_literal
  - operator_usage_whitespace
  - overridden_super_call
  - pattern_matching_keywords
  - prefer_self_type_over_type_of_self
  - private_action
  - private_outlet
  - prohibited_interface_builder
  - prohibited_super_call
  - quick_discouraged_call
  - quick_discouraged_focused_test
  - quick_discouraged_pending_test
  - reduce_into
  - redundant_nil_coalescing
  - redundant_type_annotation
  - single_test_class
  - sorted_first_last
  - static_operator
  - strong_iboutlet
  - test_case_accessibility
  - toggle_bool
  - unavailable_function
  - unneeded_parentheses_in_closure_argument
  - unowned_variable_capture
  - untyped_error_in_catch
  - vertical_parameter_alignment_on_call
  - vertical_whitespace_closing_braces
  - vertical_whitespace_opening_braces
  - xct_specific_matcher
  - yoda_condition

disabled_rules:
  - trailing_whitespace
  - line_length
  - file_length
  - type_body_length
  - function_body_length

line_length:
  warning: 120
  error: 200
  ignores_comments: true
  ignores_urls: true

file_length:
  warning: 500
  error: 1000

type_body_length:
  warning: 300
  error: 500

function_body_length:
  warning: 50
  error: 100

identifier_name:
  min_length:
    warning: 2
  max_length:
    warning: 40
    error: 50
  excluded:
    - id
    - URL
    - url
    - i
    - x
    - y
    - z

type_name:
  min_length: 3
  max_length:
    warning: 40
    error: 50

custom_rules:
  no_print:
    name: "No Print Statements"
    regex: '^\s*print\('
    message: "Use proper logging instead of print statements"
    severity: warning
  
  no_force_unwrap:
    name: "Avoid Force Unwrapping"
    regex: '([^!])\!\s*[^=]'
    message: "Force unwrapping should be avoided"
    severity: warning
```

## Git Hooks

### Pre-commit Hook

#### Installation
```bash
pnpm add -D husky lint-staged
pnpm dlx husky install
pnpm dlx husky add .husky/pre-commit "pnpm dlx lint-staged"
```

#### Configuration (package.json)
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,yml,yaml}": [
      "prettier --write"
    ],
    "*.swift": [
      "swiftformat --swiftversion 5.9",
      "swiftlint --fix --quiet"
    ]
  }
}
```

### Commit Message Linting

#### Installation
```bash
pnpm add -D @commitlint/cli @commitlint/config-conventional
```

#### Configuration (commitlint.config.js)
```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',     // New feature
      'fix',      // Bug fix
      'docs',     // Documentation
      'style',    // Formatting
      'refactor', // Code restructuring
      'perf',     // Performance improvements
      'test',     // Tests
      'build',    // Build system
      'ci',       // CI/CD
      'chore',    // Maintenance
      'revert'    // Revert commits
    ]],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case']],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100]
  }
};
```

## IDE Configuration

### VS Code

#### Extensions
```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-tslint-plugin",
    "streetsidesoftware.code-spell-checker",
    "editorconfig.editorconfig",
    "eamodio.gitlens",
    "christian-kohler.path-intellisense",
    "formulahendry.auto-rename-tag",
    "naumovs.color-highlight",
    "bradlc.vscode-tailwindcss",
    "deque-systems.vscode-axe-linter",
    "sswg.swift-lang",
    "vknabel.vscode-swiftformat",
    "vknabel.vscode-swiftlint"
  ]
}
```

#### Settings
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[swift]": {
    "editor.defaultFormatter": "vknabel.vscode-swiftformat"
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "typescript.tsdk": "node_modules/typescript/lib",
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/coverage": true
  }
}
```

### Xcode

#### Build Phases
1. Add SwiftFormat build phase:
   - Select project in navigator
   - Select target
   - Go to Build Phases
   - Add New Run Script Phase
   ```bash
   if which swiftformat >/dev/null; then
     swiftformat "$SRCROOT"
   else
     echo "warning: SwiftFormat not installed"
   fi
   ```

2. Add SwiftLint build phase:
   ```bash
   if which swiftlint >/dev/null; then
     swiftlint
   else
     echo "warning: SwiftLint not installed"
   fi
   ```

## Continuous Integration

### GitHub Actions

#### Linting Workflow
```yaml
# .github/workflows/lint.yml
name: Lint

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main, develop]

jobs:
  lint-js:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run format:check

  lint-swift:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install SwiftFormat
        run: brew install swiftformat
      - name: Install SwiftLint
        run: brew install swiftlint
      - name: Run SwiftFormat
        run: swiftformat --lint .
      - name: Run SwiftLint
        run: swiftlint
```

## Package Scripts

### Standard Scripts (package.json)
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
    "lint:fix": "eslint . --ext .js,.jsx,.ts,.tsx --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "check": "run-p lint typecheck format:check",
    "check:fix": "run-s lint:fix format",
    "prepare": "husky install"
  }
}
```

## Troubleshooting

### Common Issues

#### ESLint Not Working
```bash
# Clear ESLint cache
rm -rf node_modules/.cache/eslint-loader
pnpm run lint --debug
```

#### Prettier Conflicts
```bash
# Check for conflicts
pnpm dlx prettier-eslint-cli --list-different "src/**/*.{js,jsx,ts,tsx}"

# Auto-fix conflicts
pnpm dlx prettier-eslint --write "src/**/*.{js,jsx,ts,tsx}"
```

#### TypeScript Errors
```bash
# Rebuild TypeScript project
rm -rf tsconfig.tsbuildinfo
pnpm run typecheck
```

#### SwiftFormat Issues
```bash
# Update SwiftFormat
brew upgrade swiftformat

# Check version
swiftformat --version
```

## Best Practices

1. **Run checks before committing** - Use pre-commit hooks
2. **Keep tools updated** - Regular dependency updates
3. **Use consistent configurations** - Share configs across projects
4. **Document tool decisions** - Explain why tools were chosen
5. **Automate everything** - CI/CD integration for all checks
6. **Fast feedback loops** - Quick linting and formatting
7. **Progressive enhancement** - Start with basics, add rules gradually
8. **Team agreement** - Get consensus on tool configurations
