# TunnelForge Documentation

This directory contains the TunnelForge documentation site built with [Astro](https://astro.build) and [Svelte](https://svelte.dev).

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) (recommended) or Node.js 18+
- Git

### Development
```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## 🏗️ Architecture

- **Framework**: Astro for static site generation
- **Components**: Svelte for interactive elements
- **Styling**: CSS with CSS custom properties
- **Package Manager**: Bun for fast dependency management
- **Build Tool**: Vite (via Astro)

## 📁 Structure

```
src/
├── components/          # Svelte components
├── layouts/            # Astro layout components
├── pages/              # Documentation pages
└── styles/             # Global styles
```

## 🎨 Features

- **Responsive Design**: Mobile-first approach
- **Interactive Search**: Svelte-powered search functionality
- **Dark Mode Ready**: CSS custom properties for theming
- **Accessibility**: WCAG 2.2 AA compliant
- **Fast Builds**: Bun-powered dependency management

## 🚀 Deployment

The documentation is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the main branch.

## 📚 Available Pages

- **Home**: Overview and quick start
- **Installation**: Setup instructions for all platforms
- **Getting Started**: First steps with TunnelForge
- **API Reference**: Complete API documentation
- **Architecture**: Technical architecture guide
- **Development**: Development setup and guidelines
- **Testing**: Testing strategies and tools
- **Security**: Security considerations and best practices
- **Contributing**: How to contribute to TunnelForge
- **Release Guide**: Release process and automation
- **Product Requirements**: Product specifications and roadmap
- **Setup GitHub Pages**: Deployment guide

## 🔧 Customization

### Adding New Pages
1. Create a new `.astro` file in `src/pages/`
2. Import and use the `Layout` component
3. Add navigation links in `src/layouts/Layout.astro`

### Styling
- Global styles are in `src/layouts/Layout.astro`
- Component-specific styles use scoped CSS
- CSS custom properties for consistent theming

### Components
- Svelte components in `src/components/`
- Use `client:load` directive for interactive components
- Follow Astro's component islands architecture

## 📖 Learn More

- [Astro Documentation](https://docs.astro.build)
- [Svelte Documentation](https://svelte.dev/docs)
- [Bun Documentation](https://bun.sh/docs)
