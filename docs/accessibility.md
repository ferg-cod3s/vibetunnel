# Accessibility Guidelines

TunnelForge is committed to making terminal access available to all users, following WCAG 2.2 AA standards and platform-specific accessibility guidelines.

## Core Accessibility Principles

### 1. Perceivable
Information and UI components must be presentable to users in ways they can perceive.
- Provide text alternatives for non-text content
- Ensure sufficient color contrast
- Make content adaptable to different presentations
- Make it easier for users to see and hear content

### 2. Operable
User interface components and navigation must be operable.
- Make all functionality available from keyboard
- Give users enough time to read and use content
- Don't design content that causes seizures
- Help users navigate and find content

### 3. Understandable
Information and UI operation must be understandable.
- Make text readable and understandable
- Make pages appear and operate predictably
- Help users avoid and correct mistakes

### 4. Robust
Content must be robust enough for interpretation by assistive technologies.
- Maximize compatibility with assistive technologies
- Ensure content remains accessible as technologies advance

## WCAG 2.2 AA Compliance

### Color & Contrast Requirements

#### Text Contrast
```css
/* Minimum contrast ratios */
:root {
  /* Normal text (< 18pt or < 14pt bold) */
  --min-contrast-normal: 4.5:1;
  
  /* Large text (≥ 18pt or ≥ 14pt bold) */
  --min-contrast-large: 3:1;
  
  /* UI components and graphics */
  --min-contrast-ui: 3:1;
}

/* Example implementation */
.terminal-text {
  color: hsl(0, 0%, 20%);        /* Foreground */
  background: hsl(0, 0%, 100%);  /* Background */
  /* Contrast ratio: 12.6:1 ✓ */
}

.terminal-text-dimmed {
  color: hsl(0, 0%, 45%);        /* Dimmed text */
  background: hsl(0, 0%, 100%);  /* Background */
  /* Contrast ratio: 4.6:1 ✓ */
}
```

#### Color Independence
```typescript
// Never rely solely on color to convey information
// BAD: Only using red for errors
<span style="color: red;">Error</span>

// GOOD: Use color plus icon/text
<span style="color: red;">
  <Icon name="error" aria-label="Error" />
  Error: Invalid session
</span>
```

### Keyboard Navigation

#### Full Keyboard Access
```typescript
// All interactive elements must be keyboard accessible
@customElement('session-card')
export class SessionCard extends LitElement {
  render() {
    return html`
      <div
        class="session-card"
        tabindex="0"
        role="button"
        @click=${this.handleClick}
        @keydown=${this.handleKeydown}
        aria-label="Session: ${this.sessionName}"
      >
        ${this.sessionName}
      </div>
    `;
  }
  
  handleKeydown(e: KeyboardEvent) {
    // Activate on Enter or Space
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.handleClick();
    }
  }
}
```

#### Focus Management
```css
/* Visible focus indicators */
:focus-visible {
  outline: 2px solid hsl(210, 100%, 50%);
  outline-offset: 2px;
}

/* Never remove focus indicators without replacement */
button:focus {
  /* BAD: outline: none; */
  
  /* GOOD: Custom focus style */
  outline: none;
  box-shadow: 0 0 0 3px hsla(210, 100%, 50%, 0.5);
}
```

#### Skip Links
```html
<!-- Provide skip navigation links -->
<body>
  <a href="#main-content" class="skip-link">
    Skip to main content
  </a>
  <nav><!-- Navigation --></nav>
  <main id="main-content">
    <!-- Main content -->
  </main>
</body>

<style>
.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  position: absolute;
  left: 6px;
  top: 7px;
  z-index: 999999;
  padding: 8px 16px;
  background: white;
  border: 2px solid black;
}
</style>
```

### Screen Reader Support

#### Semantic HTML
```html
<!-- Use semantic elements -->
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/dashboard">Dashboard</a></li>
    <li><a href="/sessions">Sessions</a></li>
  </ul>
</nav>

<main>
  <h1>Active Sessions</h1>
  <section aria-labelledby="session-list-heading">
    <h2 id="session-list-heading">Session List</h2>
    <!-- Content -->
  </section>
</main>
```

#### ARIA Labels and Descriptions
```typescript
// Provide meaningful labels for interactive elements
render() {
  return html`
    <button
      aria-label="Create new terminal session"
      aria-describedby="create-help"
    >
      <Icon name="plus" aria-hidden="true" />
      New Session
    </button>
    <span id="create-help" class="sr-only">
      Opens a new terminal session in the current directory
    </span>
  `;
}
```

#### Live Regions
```html
<!-- Announce dynamic updates -->
<div 
  aria-live="polite" 
  aria-atomic="true"
  class="status-message"
>
  Session created successfully
</div>

<!-- Terminal output announcements -->
<div
  role="log"
  aria-live="polite"
  aria-label="Terminal output"
>
  <!-- Terminal content -->
</div>
```

### Form Accessibility

#### Label Association
```html
<!-- Every input needs a label -->
<label for="session-name">
  Session Name
  <span aria-label="required">*</span>
</label>
<input
  id="session-name"
  type="text"
  required
  aria-describedby="session-name-error"
/>
<span id="session-name-error" role="alert">
  Session name is required
</span>
```

#### Error Handling
```typescript
// Accessible form validation
class AccessibleForm {
  validateField(field: HTMLInputElement) {
    const errorId = `${field.id}-error`;
    const errorElement = document.getElementById(errorId);
    
    if (!field.validity.valid) {
      // Add error state
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', errorId);
      
      // Update error message
      if (errorElement) {
        errorElement.textContent = this.getErrorMessage(field);
        errorElement.setAttribute('role', 'alert');
      }
      
      // Announce to screen readers
      this.announceError(field.name, this.getErrorMessage(field));
    } else {
      // Remove error state
      field.removeAttribute('aria-invalid');
      if (errorElement) {
        errorElement.textContent = '';
      }
    }
  }
  
  announceError(fieldName: string, message: string) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = `${fieldName}: ${message}`;
    
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
  }
}
```

## Platform-Specific Guidelines

### macOS Accessibility

#### VoiceOver Support
```swift
// SwiftUI accessibility modifiers
struct SessionView: View {
    @State private var session: Session
    
    var body: some View {
        VStack {
            Text(session.name)
                .accessibilityLabel("Session: \(session.name)")
                .accessibilityHint("Double tap to open session")
                .accessibilityAddTraits(.isButton)
            
            Text(session.status)
                .accessibilityLabel("Status: \(session.status)")
                .accessibilityAddTraits(.updatesFrequently)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAction {
            openSession()
        }
    }
}
```

#### Keyboard Navigation
```swift
// Enable full keyboard navigation
class TerminalViewController: NSViewController {
    override func keyDown(with event: NSEvent) {
        switch event.keyCode {
        case 36: // Enter
            performDefaultAction()
        case 49: // Space
            toggleSelection()
        case 48: // Tab
            moveToNextElement()
        default:
            super.keyDown(with: event)
        }
    }
    
    override var acceptsFirstResponder: Bool {
        return true
    }
}
```

### iOS Accessibility

#### VoiceOver Gestures
```swift
// Support VoiceOver gestures
class AccessibleTerminalView: UIView {
    override func accessibilityActivate() -> Bool {
        // Handle double-tap
        openTerminal()
        return true
    }
    
    override func accessibilityScroll(_ direction: UIAccessibilityScrollDirection) -> Bool {
        // Handle three-finger swipe
        switch direction {
        case .up:
            scrollUp()
        case .down:
            scrollDown()
        default:
            break
        }
        return true
    }
    
    override func accessibilityPerformEscape() -> Bool {
        // Handle two-finger Z gesture
        dismiss()
        return true
    }
}
```

#### Dynamic Type
```swift
// Support Dynamic Type
struct TerminalText: View {
    @Environment(\.sizeCategory) var sizeCategory
    
    var body: some View {
        Text("Terminal Output")
            .font(.system(.body, design: .monospaced))
            .minimumScaleFactor(0.5)
            .dynamicTypeSize(...DynamicTypeSize.accessibility3)
    }
}
```

### Web Accessibility

#### Terminal Accessibility
```typescript
// Make terminal output accessible
class AccessibleTerminal {
  private terminal: Terminal;
  private announcer: HTMLDivElement;
  
  constructor() {
    this.setupAnnouncer();
    this.configureTerminal();
  }
  
  private setupAnnouncer() {
    this.announcer = document.createElement('div');
    this.announcer.setAttribute('aria-live', 'polite');
    this.announcer.setAttribute('aria-atomic', 'false');
    this.announcer.className = 'sr-only';
    document.body.appendChild(this.announcer);
  }
  
  private configureTerminal() {
    this.terminal = new Terminal({
      screenReaderMode: true,
      minimumContrastRatio: 4.5
    });
    
    // Announce new output
    this.terminal.onData((data) => {
      this.announceOutput(data);
    });
  }
  
  private announceOutput(text: string) {
    // Debounce announcements
    clearTimeout(this.announceTimeout);
    this.announceTimeout = setTimeout(() => {
      this.announcer.textContent = text;
    }, 100);
  }
}
```

#### Responsive Design
```css
/* Ensure touch targets meet minimum size */
.interactive-element {
  min-width: 44px;
  min-height: 44px;
  padding: 12px;
}

/* Responsive font sizing */
html {
  font-size: 16px; /* Base size */
}

@media (max-width: 768px) {
  html {
    font-size: 18px; /* Larger on mobile */
  }
}

/* Support user preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@media (prefers-contrast: high) {
  :root {
    --text-color: hsl(0, 0%, 0%);
    --bg-color: hsl(0, 0%, 100%);
    --border-width: 2px;
  }
}
```

## Testing Accessibility

### Automated Testing

#### axe-core Integration
```typescript
// Jest/Vitest test
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('terminal component is accessible', async () => {
  const { container } = render(<Terminal />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### Playwright Accessibility Testing
```typescript
// Playwright test
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test('page is accessible', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true
    }
  });
});
```

### Manual Testing

#### Screen Reader Testing
1. **macOS**: Test with VoiceOver (Cmd+F5)
2. **iOS**: Test with VoiceOver (Settings > Accessibility)
3. **Windows**: Test with NVDA or JAWS
4. **Android**: Test with TalkBack

#### Keyboard Navigation Testing
- Tab through all interactive elements
- Verify focus indicators are visible
- Test keyboard shortcuts
- Ensure no keyboard traps
- Verify skip links work

#### Color Contrast Testing
- Use browser DevTools contrast checker
- Test with color blindness simulators
- Verify information isn't conveyed by color alone
- Check focus indicators meet contrast requirements

### Accessibility Checklist

- [ ] **Perceivable**
  - [ ] Images have alt text
  - [ ] Videos have captions
  - [ ] Color contrast meets WCAG AA (4.5:1)
  - [ ] Text can be resized to 200%
  - [ ] Content reflows at 320px width

- [ ] **Operable**
  - [ ] All functionality keyboard accessible
  - [ ] No keyboard traps
  - [ ] Skip links provided
  - [ ] Touch targets ≥ 44x44px
  - [ ] No flashing content

- [ ] **Understandable**
  - [ ] Language declared
  - [ ] Labels describe purpose
  - [ ] Errors clearly identified
  - [ ] Instructions provided
  - [ ] Consistent navigation

- [ ] **Robust**
  - [ ] Valid HTML
  - [ ] ARIA used correctly
  - [ ] Works with assistive technology
  - [ ] Progressive enhancement
  - [ ] Graceful degradation

## Resources

### Documentation
- [WCAG 2.2 Guidelines](https://www.w3.org/WAI/WCAG22/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Apple Accessibility](https://developer.apple.com/accessibility/)
- [WebAIM Resources](https://webaim.org/resources/)

### Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [Pa11y](https://pa11y.org/)
- [Contrast Checker](https://www.webcontrastchecker.com/)

### Testing Services
- [AccessiBe](https://accessibe.com/)
- [AudioEye](https://www.audioeye.com/)
- [UserWay](https://userway.org/)
