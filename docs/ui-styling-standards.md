# UI/Styling Standards

Comprehensive styling guidelines for TunnelForge, ensuring consistent, accessible, and maintainable user interfaces across all platforms.

## Core Principles

### 1. Use REM for Sizing and Spacing
REM units ensure consistent scaling with user preferences and better accessibility.

```css
/* Base font size on root element */
html {
  font-size: 16px; /* 1rem = 16px */
}

/* Use REM for all sizing */
:root {
  /* Spacing scale */
  --spacing-xs: 0.25rem;  /* 4px */
  --spacing-sm: 0.5rem;   /* 8px */
  --spacing-md: 1rem;     /* 16px */
  --spacing-lg: 1.5rem;   /* 24px */
  --spacing-xl: 2rem;     /* 32px */
  --spacing-2xl: 3rem;    /* 48px */
  --spacing-3xl: 4rem;    /* 64px */
  
  /* Font sizes */
  --font-xs: 0.75rem;     /* 12px */
  --font-sm: 0.875rem;    /* 14px */
  --font-md: 1rem;        /* 16px */
  --font-lg: 1.125rem;    /* 18px */
  --font-xl: 1.25rem;     /* 20px */
  --font-2xl: 1.5rem;     /* 24px */
  --font-3xl: 1.875rem;   /* 30px */
  --font-4xl: 2.25rem;    /* 36px */
  
  /* Line heights */
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.75;
  
  /* Border radius */
  --radius-sm: 0.125rem;  /* 2px */
  --radius-md: 0.25rem;   /* 4px */
  --radius-lg: 0.5rem;    /* 8px */
  --radius-xl: 1rem;      /* 16px */
  --radius-full: 9999px;  /* Full circle */
}

/* Exception: Use pixels for borders and hairlines */
.divider {
  border: 1px solid var(--border-color);
}
```

### 2. Use HSLA for Colors
HSLA provides better control over color properties and makes theme variations easier.

```css
:root {
  /* Primary colors */
  --primary-h: 210;        /* Hue */
  --primary-s: 100%;       /* Saturation */
  --primary-l: 50%;        /* Lightness */
  --primary: hsla(var(--primary-h), var(--primary-s), var(--primary-l), 1);
  --primary-light: hsla(var(--primary-h), var(--primary-s), 60%, 1);
  --primary-dark: hsla(var(--primary-h), var(--primary-s), 40%, 1);
  --primary-alpha-20: hsla(var(--primary-h), var(--primary-s), var(--primary-l), 0.2);
  
  /* Neutral colors */
  --gray-50: hsla(0, 0%, 98%, 1);
  --gray-100: hsla(0, 0%, 96%, 1);
  --gray-200: hsla(0, 0%, 90%, 1);
  --gray-300: hsla(0, 0%, 80%, 1);
  --gray-400: hsla(0, 0%, 65%, 1);
  --gray-500: hsla(0, 0%, 50%, 1);
  --gray-600: hsla(0, 0%, 35%, 1);
  --gray-700: hsla(0, 0%, 25%, 1);
  --gray-800: hsla(0, 0%, 15%, 1);
  --gray-900: hsla(0, 0%, 5%, 1);
  
  /* Semantic colors */
  --success: hsla(142, 71%, 45%, 1);
  --warning: hsla(38, 92%, 50%, 1);
  --error: hsla(0, 72%, 51%, 1);
  --info: hsla(199, 89%, 48%, 1);
  
  /* Text colors */
  --text-primary: hsla(0, 0%, 13%, 1);
  --text-secondary: hsla(0, 0%, 45%, 1);
  --text-disabled: hsla(0, 0%, 65%, 1);
  --text-inverse: hsla(0, 0%, 100%, 1);
  
  /* Background colors */
  --bg-primary: hsla(0, 0%, 100%, 1);
  --bg-secondary: hsla(0, 0%, 98%, 1);
  --bg-tertiary: hsla(0, 0%, 96%, 1);
  --bg-inverse: hsla(0, 0%, 13%, 1);
  
  /* Border colors */
  --border-light: hsla(0, 0%, 90%, 1);
  --border-default: hsla(0, 0%, 80%, 1);
  --border-dark: hsla(0, 0%, 65%, 1);
}

/* Dark theme */
[data-theme="dark"] {
  --text-primary: hsla(0, 0%, 95%, 1);
  --text-secondary: hsla(0, 0%, 70%, 1);
  --bg-primary: hsla(0, 0%, 8%, 1);
  --bg-secondary: hsla(0, 0%, 12%, 1);
  --border-default: hsla(0, 0%, 25%, 1);
}
```

### 3. Responsive Design
Mobile-first approach with consistent breakpoints.

```css
/* Breakpoints */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Mobile-first media queries */
@media (min-width: 640px) {
  /* sm: Small devices */
}

@media (min-width: 768px) {
  /* md: Medium devices */
}

@media (min-width: 1024px) {
  /* lg: Large devices */
}

@media (min-width: 1280px) {
  /* xl: Extra large devices */
}

/* Container widths */
.container {
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

@media (min-width: 640px) {
  .container { max-width: 640px; }
}

@media (min-width: 768px) {
  .container { max-width: 768px; }
}

@media (min-width: 1024px) {
  .container { max-width: 1024px; }
}

@media (min-width: 1280px) {
  .container { max-width: 1280px; }
}
```

## Component Styling

### Buttons
```css
.btn {
  /* Sizing */
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-md);
  line-height: var(--line-height-normal);
  border-radius: var(--radius-md);
  
  /* Colors */
  background: var(--primary);
  color: var(--text-inverse);
  border: 1px solid transparent;
  
  /* Interaction */
  cursor: pointer;
  transition: all 0.2s ease;
  
  /* Accessibility */
  min-height: 2.75rem; /* 44px touch target */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.btn:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
  box-shadow: 0 0.25rem 0.5rem hsla(0, 0%, 0%, 0.1);
}

.btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Button variants */
.btn--secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-default);
}

.btn--ghost {
  background: transparent;
  color: var(--primary);
}

/* Button sizes */
.btn--sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-sm);
  min-height: 2rem;
}

.btn--lg {
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: var(--font-lg);
  min-height: 3rem;
}
```

### Forms
```css
.form-group {
  margin-bottom: var(--spacing-lg);
}

.form-label {
  display: block;
  margin-bottom: var(--spacing-xs);
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--text-primary);
}

.form-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-md);
  line-height: var(--line-height-normal);
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-alpha-20);
}

.form-input:disabled {
  background: var(--bg-tertiary);
  color: var(--text-disabled);
  cursor: not-allowed;
}

.form-input[aria-invalid="true"] {
  border-color: var(--error);
}

.form-error {
  margin-top: var(--spacing-xs);
  font-size: var(--font-sm);
  color: var(--error);
}

.form-hint {
  margin-top: var(--spacing-xs);
  font-size: var(--font-sm);
  color: var(--text-secondary);
}
```

### Cards
```css
.card {
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  box-shadow: 0 1px 3px hsla(0, 0%, 0%, 0.1);
  transition: all 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 6px hsla(0, 0%, 0%, 0.1);
  transform: translateY(-2px);
}

.card__header {
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border-light);
}

.card__title {
  font-size: var(--font-xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.card__body {
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.card__footer {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}
```

## Terminal Styling

### Terminal Container
```css
.terminal-container {
  background: hsla(0, 0%, 5%, 1);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: var(--font-sm);
  line-height: var(--line-height-normal);
  overflow: auto;
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid hsla(0, 0%, 20%, 1);
}

.terminal-controls {
  display: flex;
  gap: var(--spacing-xs);
}

.terminal-control {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: var(--radius-full);
  background: hsla(0, 0%, 50%, 1);
}

.terminal-control--close {
  background: hsla(0, 100%, 50%, 1);
}

.terminal-control--minimize {
  background: hsla(60, 100%, 50%, 1);
}

.terminal-control--maximize {
  background: hsla(120, 100%, 35%, 1);
}

.terminal-content {
  color: hsla(0, 0%, 90%, 1);
  white-space: pre-wrap;
  word-break: break-all;
}

/* Terminal colors */
.terminal-black { color: hsla(0, 0%, 0%, 1); }
.terminal-red { color: hsla(0, 100%, 50%, 1); }
.terminal-green { color: hsla(120, 100%, 35%, 1); }
.terminal-yellow { color: hsla(60, 100%, 50%, 1); }
.terminal-blue { color: hsla(210, 100%, 50%, 1); }
.terminal-magenta { color: hsla(300, 100%, 50%, 1); }
.terminal-cyan { color: hsla(180, 100%, 40%, 1); }
.terminal-white { color: hsla(0, 0%, 90%, 1); }

/* Bright variants */
.terminal-bright-black { color: hsla(0, 0%, 50%, 1); }
.terminal-bright-red { color: hsla(0, 100%, 60%, 1); }
.terminal-bright-green { color: hsla(120, 100%, 45%, 1); }
.terminal-bright-yellow { color: hsla(60, 100%, 60%, 1); }
.terminal-bright-blue { color: hsla(210, 100%, 60%, 1); }
.terminal-bright-magenta { color: hsla(300, 100%, 60%, 1); }
.terminal-bright-cyan { color: hsla(180, 100%, 50%, 1); }
.terminal-bright-white { color: hsla(0, 0%, 100%, 1); }
```

## Animation & Transitions

### Performance-Optimized Animations
```css
/* Use transform and opacity for smooth animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Standard transitions */
.transition-all {
  transition: all 0.2s ease;
}

.transition-colors {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.transition-transform {
  transition: transform 0.2s ease;
}

.transition-opacity {
  transition: opacity 0.2s ease;
}
```

## Typography

### Font Stack
```css
:root {
  /* System fonts for better performance */
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
               'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 
               'Segoe UI Emoji', 'Segoe UI Symbol';
  
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', 
               Consolas, 'Courier New', monospace;
  
  --font-serif: Georgia, Cambria, 'Times New Roman', Times, serif;
}

/* Typography scale */
.text-xs { font-size: var(--font-xs); }
.text-sm { font-size: var(--font-sm); }
.text-md { font-size: var(--font-md); }
.text-lg { font-size: var(--font-lg); }
.text-xl { font-size: var(--font-xl); }
.text-2xl { font-size: var(--font-2xl); }
.text-3xl { font-size: var(--font-3xl); }
.text-4xl { font-size: var(--font-4xl); }

/* Font weights */
.font-light { font-weight: 300; }
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }

/* Line heights */
.leading-tight { line-height: var(--line-height-tight); }
.leading-normal { line-height: var(--line-height-normal); }
.leading-relaxed { line-height: var(--line-height-relaxed); }

/* Text alignment */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-justify { text-align: justify; }
```

## Layout Utilities

### Flexbox
```css
.flex { display: flex; }
.inline-flex { display: inline-flex; }

/* Direction */
.flex-row { flex-direction: row; }
.flex-col { flex-direction: column; }
.flex-row-reverse { flex-direction: row-reverse; }
.flex-col-reverse { flex-direction: column-reverse; }

/* Alignment */
.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.items-stretch { align-items: stretch; }

.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.justify-around { justify-content: space-around; }
.justify-evenly { justify-content: space-evenly; }

/* Wrap */
.flex-wrap { flex-wrap: wrap; }
.flex-nowrap { flex-wrap: nowrap; }

/* Grow/Shrink */
.flex-1 { flex: 1 1 0%; }
.flex-auto { flex: 1 1 auto; }
.flex-none { flex: none; }

/* Gap */
.gap-xs { gap: var(--spacing-xs); }
.gap-sm { gap: var(--spacing-sm); }
.gap-md { gap: var(--spacing-md); }
.gap-lg { gap: var(--spacing-lg); }
.gap-xl { gap: var(--spacing-xl); }
```

### Grid
```css
.grid { display: grid; }

/* Columns */
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.grid-cols-12 { grid-template-columns: repeat(12, minmax(0, 1fr)); }

/* Gap */
.grid-gap-xs { gap: var(--spacing-xs); }
.grid-gap-sm { gap: var(--spacing-sm); }
.grid-gap-md { gap: var(--spacing-md); }
.grid-gap-lg { gap: var(--spacing-lg); }
.grid-gap-xl { gap: var(--spacing-xl); }

/* Responsive grid */
@media (min-width: 768px) {
  .md\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .md\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .md\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .lg\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .lg\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
```

## Best Practices

### CSS Architecture
1. **Use CSS Custom Properties** for theming and consistency
2. **Follow BEM naming** for component classes
3. **Keep specificity low** - prefer classes over IDs
4. **Group related properties** in logical order
5. **Use CSS modules or scoped styles** when possible

### Performance
1. **Minimize reflows** - batch DOM changes
2. **Use transform/opacity** for animations
3. **Avoid expensive selectors** (descendant, attribute)
4. **Lazy load non-critical CSS**
5. **Minify and compress** CSS in production

### Accessibility
1. **Always provide focus styles**
2. **Ensure color contrast** meets WCAG AA
3. **Use relative units** for better scaling
4. **Support prefers-reduced-motion**
5. **Test with keyboard navigation**

### Maintenance
1. **Document design tokens**
2. **Create component library**
3. **Use consistent naming**
4. **Keep styles DRY**
5. **Regular audits** for unused styles
