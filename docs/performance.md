# Performance Best Practices

> **🔄 Refactoring in Progress**: This document covers performance practices for both the current Node.js + SwiftUI implementation and the target Go + Bun + Tauri architecture. Performance targets will improve significantly with the new architecture.

TunnelForge prioritizes performance across all platforms to ensure responsive terminal sessions and minimal resource usage.

## Core Performance Principles

### 1. Profile Before Optimizing
- Measure actual performance bottlenecks
- Use platform-specific profiling tools
- Focus optimization efforts on critical paths
- Avoid premature optimization

### 2. Optimize Critical Paths
- Terminal rendering and input handling
- WebSocket message processing
- Session creation and teardown
- File system operations

### 3. Resource Management
- Minimize memory allocations
- Reuse buffers where possible
- Clean up resources promptly
- Monitor resource usage in production

## Platform-Specific Optimization

### macOS Performance

#### Swift Concurrency
```swift
// Use structured concurrency for parallel operations
await withTaskGroup(of: Void.self) { group in
    for session in sessions {
        group.addTask {
            await session.refresh()
        }
    }
}
```

#### Memory Management
- Use `weak` references to prevent retain cycles
- Leverage value types (structs) where appropriate
- Profile with Instruments for memory leaks
- Use `autoreleasepool` for batch operations

#### UI Performance
```swift
// Debounce rapid UI updates
@Observable
class ServerManager {
    private var updateTask: Task<Void, Never>?
    
    func scheduleUpdate() {
        updateTask?.cancel()
        updateTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(100))
            await performUpdate()
        }
    }
}
```

### Web Performance

#### Bundle Optimization
```json
// vite.config.ts
{
  "build": {
    "rollupOptions": {
      "output": {
        "manualChunks": {
          "terminal": ["xterm", "xterm-addon-*"],
          "vendor": ["lit", "express"]
        }
      }
    },
    "minify": "terser",
    "terserOptions": {
      "compress": {
        "drop_console": true,
        "drop_debugger": true
      }
    }
  }
}
```

#### Lazy Loading
```typescript
// Dynamic imports for code splitting
const TerminalComponent = lazy(() => 
  import('./components/vibe-terminal')
);

// Route-based code splitting
const routes = [
  {
    path: '/dashboard',
    component: () => import('./views/dashboard')
  }
];
```

#### WebSocket Optimization
```typescript
// Buffer multiple messages before sending
class MessageBuffer {
  private buffer: Message[] = [];
  private flushTimer?: NodeJS.Timeout;
  
  add(message: Message) {
    this.buffer.push(message);
    this.scheduleFlush();
  }
  
  private scheduleFlush() {
    if (this.flushTimer) return;
    
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = undefined;
    }, 16); // ~60fps
  }
  
  private flush() {
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer.splice(0);
    this.sendBatch(batch);
  }
}
```

### Terminal Rendering

#### XTerm.js Optimization
```typescript
// Configure XTerm for optimal performance
const terminal = new Terminal({
  fastScrollModifier: 'shift',
  scrollback: 10000, // Limit scrollback
  rendererType: 'canvas', // Use canvas renderer
  fontFamily: 'monospace',
  fontSize: 14,
  letterSpacing: 0,
  lineHeight: 1,
  minimumContrastRatio: 4.5
});

// Use write batching
let writeBuffer = '';
let writeTimer: number;

function scheduleWrite(data: string) {
  writeBuffer += data;
  
  if (!writeTimer) {
    writeTimer = requestAnimationFrame(() => {
      terminal.write(writeBuffer);
      writeBuffer = '';
      writeTimer = 0;
    });
  }
}
```

#### Virtual Scrolling
- Render only visible terminal lines
- Recycle DOM elements for scrolling
- Use intersection observer for visibility

## Caching Strategies

### API Response Caching
```typescript
// In-memory cache with TTL
class CacheManager {
  private cache = new Map<string, CacheEntry>();
  
  set(key: string, value: any, ttl = 60000) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
}
```

### Static Asset Caching
```typescript
// Service worker for offline caching
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('v1').then((cache) => {
      return cache.addAll([
        '/index.html',
        '/styles.css',
        '/bundle.js',
        '/terminal-worker.js'
      ]);
    })
  );
});
```

### Session State Caching
- Cache session metadata locally
- Lazy-load full session details
- Implement optimistic updates
- Use IndexedDB for large data

## Database Optimization

### Query Optimization
```typescript
// Batch database operations
async function batchInsert(sessions: Session[]) {
  const query = `
    INSERT INTO sessions (id, name, created_at)
    VALUES ${sessions.map(() => '(?, ?, ?)').join(', ')}
  `;
  
  const values = sessions.flatMap(s => 
    [s.id, s.name, s.createdAt]
  );
  
  await db.run(query, values);
}
```

### Connection Pooling
```typescript
// Reuse database connections
const pool = createPool({
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});
```

## Network Optimization

### Request Batching
```typescript
// Combine multiple API calls
class RequestBatcher {
  private pending = new Map<string, Promise<any>>();
  
  async fetch(url: string): Promise<any> {
    if (this.pending.has(url)) {
      return this.pending.get(url);
    }
    
    const promise = fetch(url)
      .then(res => res.json())
      .finally(() => this.pending.delete(url));
    
    this.pending.set(url, promise);
    return promise;
  }
}
```

### Compression
```typescript
// Enable gzip compression
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

## Memory Management

### Prevent Memory Leaks
```typescript
// Clean up event listeners
class Component {
  private listeners: Array<() => void> = [];
  
  addEventListener(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    this.listeners.push(() => 
      target.removeEventListener(event, handler)
    );
  }
  
  cleanup() {
    this.listeners.forEach(remove => remove());
    this.listeners = [];
  }
}
```

### Buffer Management
```typescript
// Reuse buffers for terminal data
class BufferPool {
  private pool: Uint8Array[] = [];
  private size = 4096;
  
  acquire(): Uint8Array {
    return this.pool.pop() || new Uint8Array(this.size);
  }
  
  release(buffer: Uint8Array) {
    if (buffer.length === this.size) {
      buffer.fill(0); // Clear sensitive data
      this.pool.push(buffer);
    }
  }
}
```

## Monitoring & Metrics

### Performance Monitoring
```typescript
// Track key metrics
class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  
  measure(name: string, fn: () => void) {
    const start = performance.now();
    fn();
    const duration = performance.now() - start;
    
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name)!.push(duration);
    
    // Log slow operations
    if (duration > 100) {
      console.warn(`Slow operation: ${name} took ${duration}ms`);
    }
  }
  
  getStats(name: string) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}
```

### Core Web Vitals
```typescript
// Monitor Core Web Vitals
import { getCLS, getFID, getLCP } from 'web-vitals';

getCLS(console.log);  // Cumulative Layout Shift
getFID(console.log);  // First Input Delay
getLCP(console.log);  // Largest Contentful Paint
```

## Performance Budgets

### Bundle Size Limits
- Main bundle: < 200KB (gzipped)
- Vendor bundle: < 300KB (gzipped)
- Total initial load: < 500KB
- Code splitting for routes > 50KB

### Runtime Performance
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Terminal input latency: < 50ms
- WebSocket round-trip: < 100ms

### Resource Usage
- Memory usage: < 100MB baseline
- CPU usage: < 5% idle
- Network bandwidth: < 1MB/min active session

## Testing Performance

### Load Testing
```bash
# Use Apache Bench for API testing
ab -n 1000 -c 10 http://localhost:4020/api/sessions

# Use Artillery for complex scenarios
artillery quick --count 50 --num 10 http://localhost:4020
```

### Profiling Tools

#### macOS
- Instruments (Time Profiler, Allocations)
- Xcode Memory Graph Debugger
- Energy Impact monitoring

#### Web
- Chrome DevTools Performance tab
- Lighthouse CI for automated testing
- WebPageTest for real-world testing

### Continuous Monitoring
```yaml
# GitHub Actions performance check
- name: Run Lighthouse
  uses: treosh/lighthouse-ci-action@v9
  with:
    urls: |
      http://localhost:4020
    budgetPath: ./lighthouse-budget.json
    uploadArtifacts: true
```

## Best Practices Checklist

- [ ] Profile before optimizing
- [ ] Use appropriate data structures
- [ ] Implement caching where beneficial
- [ ] Minimize bundle sizes
- [ ] Lazy load non-critical resources
- [ ] Batch network requests
- [ ] Debounce rapid updates
- [ ] Clean up resources properly
- [ ] Monitor performance metrics
- [ ] Set and enforce performance budgets
- [ ] Regular performance testing
- [ ] Document performance requirements
