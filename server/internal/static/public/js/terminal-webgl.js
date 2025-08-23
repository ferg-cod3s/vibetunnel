// Enhanced Terminal with WebGL Acceleration
import { Terminal } from 'xterm';
import { WebglAddon } from 'xterm-addon-webgl';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';

/**
 * EnhancedTerminal - High-performance terminal with GPU acceleration
 * Provides 2-5x performance improvement over standard Canvas rendering
 */
export class EnhancedTerminal {
    constructor(container, options = {}) {
        this.container = container;
        this.terminal = null;
        this.webglAddon = null;
        this.canvasAddon = null;
        this.fitAddon = null;
        this.searchAddon = null;
        this.performanceMonitor = new PerformanceMonitor();
        
        // Default options optimized for performance
        this.options = {
            theme: {
                background: '#0a0b0d',
                foreground: '#e0e0e0',
                cursor: '#00ff00',
                cursorAccent: '#000000',
                selection: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#ff5555',
                green: '#50fa7b',
                yellow: '#f1fa8c',
                blue: '#bd93f9',
                magenta: '#ff79c6',
                cyan: '#8be9fd',
                white: '#bfbfbf',
                brightBlack: '#4d4d4d',
                brightRed: '#ff6e67',
                brightGreen: '#5af78e',
                brightYellow: '#f4f99d',
                brightBlue: '#caa9fa',
                brightMagenta: '#ff92d0',
                brightCyan: '#9aedfe',
                brightWhite: '#e6e6e6'
            },
            fontFamily: "'Hack Nerd Font Mono', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
            fontSize: 14,
            fontWeight: 'normal',
            fontWeightBold: 'bold',
            lineHeight: 1.2,
            letterSpacing: 0,
            cursorBlink: true,
            cursorStyle: 'block',
            scrollback: 10000,
            tabStopWidth: 8,
            bellStyle: 'none',
            macOptionIsMeta: true,
            macOptionClickForcesSelection: true,
            rightClickSelectsWord: true,
            rendererType: 'webgl', // Try WebGL first
            allowTransparency: false,
            windowsMode: false,
            wordSeparator: ' ()[]{}\\',"`',
            ...options
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Create terminal instance
            this.terminal = new Terminal(this.options);
            
            // Initialize addons
            this.fitAddon = new FitAddon();
            this.terminal.loadAddon(this.fitAddon);
            
            this.searchAddon = new SearchAddon();
            this.terminal.loadAddon(this.searchAddon);
            
            // Load WebLinks addon for clickable URLs
            this.terminal.loadAddon(new WebLinksAddon());
            
            // Open terminal in container
            this.terminal.open(this.container);
            
            // Try to initialize WebGL renderer
            if (await this.initWebGL()) {
                console.log('✅ WebGL renderer initialized successfully');
            } else {
                // Fallback to Canvas renderer
                console.log('⚠️ WebGL not available, falling back to Canvas renderer');
                await this.initCanvas();
            }
            
            // Fit terminal to container
            this.fit();
            
            // Setup resize observer
            this.setupResizeObserver();
            
            // Start performance monitoring
            this.performanceMonitor.start(this);
            
        } catch (error) {
            console.error('Failed to initialize terminal:', error);
            throw error;
        }
    }
    
    async initWebGL() {
        try {
            // Check for WebGL support
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            
            if (!gl) {
                return false;
            }
            
            // Initialize WebGL addon
            this.webglAddon = new WebglAddon();
            
            // Load addon
            this.terminal.loadAddon(this.webglAddon);
            
            // Wait for WebGL context to be ready
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify WebGL is working
            return this.webglAddon.isTextureAtlasReady?.() !== false;
            
        } catch (error) {
            console.warn('WebGL initialization failed:', error);
            return false;
        }
    }
    
    async initCanvas() {
        try {
            this.canvasAddon = new CanvasAddon();
            this.terminal.loadAddon(this.canvasAddon);
            return true;
        } catch (error) {
            console.error('Canvas initialization failed:', error);
            return false;
        }
    }
    
    setupResizeObserver() {
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => {
                this.fit();
            });
            resizeObserver.observe(this.container);
            
            // Store for cleanup
            this._resizeObserver = resizeObserver;
        } else {
            // Fallback to window resize event
            window.addEventListener('resize', () => this.fit());
        }
    }
    
    fit() {
        if (this.fitAddon) {
            try {
                this.fitAddon.fit();
            } catch (error) {
                console.warn('Failed to fit terminal:', error);
            }
        }
    }
    
    write(data) {
        if (this.terminal) {
            this.terminal.write(data);
        }
    }
    
    writeln(data) {
        if (this.terminal) {
            this.terminal.writeln(data);
        }
    }
    
    clear() {
        if (this.terminal) {
            this.terminal.clear();
        }
    }
    
    focus() {
        if (this.terminal) {
            this.terminal.focus();
        }
    }
    
    dispose() {
        // Clean up performance monitor
        this.performanceMonitor.stop();
        
        // Clean up resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
        
        // Dispose addons
        if (this.webglAddon) {
            this.webglAddon.dispose();
        }
        if (this.canvasAddon) {
            this.canvasAddon.dispose();
        }
        
        // Dispose terminal
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
    
    // Get terminal dimensions
    get rows() {
        return this.terminal?.rows || 24;
    }
    
    get cols() {
        return this.terminal?.cols || 80;
    }
    
    // Event handlers
    onData(callback) {
        return this.terminal?.onData(callback);
    }
    
    onResize(callback) {
        return this.terminal?.onResize(callback);
    }
    
    onTitleChange(callback) {
        return this.terminal?.onTitleChange(callback);
    }
}

/**
 * Performance Monitor for tracking terminal rendering performance
 */
class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.isRunning = false;
        this.stats = {
            fps: 0,
            avgRenderTime: 0,
            peakMemory: 0,
            droppedFrames: 0
        };
    }
    
    start(terminal) {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.terminal = terminal;
        this.measure();
    }
    
    measure() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        const delta = now - this.lastTime;
        
        this.frameCount++;
        
        if (delta >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / delta);
            this.stats.fps = this.fps;
            
            // Log performance stats in development
            if (process.env.NODE_ENV === 'development') {
                console.log(`Terminal FPS: ${this.fps}`);
            }
            
            this.frameCount = 0;
            this.lastTime = now;
        }
        
        requestAnimationFrame(() => this.measure());
    }
    
    stop() {
        this.isRunning = false;
    }
    
    getStats() {
        return { ...this.stats };
    }
}

// Export for use in other modules
export default EnhancedTerminal;
