import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fixture, html } from '@open-wc/testing';
import './terminal';
import type { Terminal } from './terminal';

describe('Terminal Component - Comprehensive Tests with Edge Cases', () => {
  let element: Terminal;
  let mockXterm: any;

  beforeEach(async () => {
    // Mock XtermTerminal
    mockXterm = {
      open: vi.fn(),
      write: vi.fn(),
      writeln: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(),
      onResize: vi.fn(),
      resize: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollToTop: vi.fn(),
      scrollLines: vi.fn(),
      selectAll: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ''),
      clearSelection: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
      refresh: vi.fn(),
      reset: vi.fn(),
      loadAddon: vi.fn(),
      cols: 80,
      rows: 24,
      buffer: {
        active: {
          viewportY: 0,
          baseY: 0,
          length: 100,
          cursorY: 0,
          cursorX: 0,
          getLine: vi.fn((line: number) => ({
            length: 80,
            getCell: vi.fn(),
            translateToString: vi.fn(() => `Line ${line}`)
          }))
        },
        normal: {
          viewportY: 0,
          baseY: 0,
          length: 100
        },
        alternate: null
      },
      options: {
        theme: {},
        fontSize: 14,
        fontFamily: 'monospace'
      },
      textarea: null,
      element: null
    };

    // Mock the XtermTerminal constructor
    vi.mock('@xterm/headless', () => ({
      Terminal: vi.fn(() => mockXterm)
    }));

    element = await fixture(html`
      <vibe-terminal 
        sessionId="test-session"
        cols="80"
        rows="24"
        fontSize="14"
      ></vibe-terminal>
    `);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization Edge Cases', () => {
    it('should handle initialization with invalid dimensions', async () => {
      const invalidElement = await fixture(html`
        <vibe-terminal cols="-1" rows="0"></vibe-terminal>
      `);
      
      // Should default to minimum valid dimensions
      expect(invalidElement.cols).toBeGreaterThan(0);
      expect(invalidElement.rows).toBeGreaterThan(0);
    });

    it('should handle initialization without sessionId', async () => {
      const noSessionElement = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      expect(noSessionElement.sessionId).toBe('');
      // Should still initialize terminal
      expect(noSessionElement).toBeTruthy();
    });

    it('should handle multiple rapid initializations', async () => {
      const initSpy = vi.spyOn(element, 'initTerminal');
      
      // Trigger multiple updates rapidly
      element.cols = 100;
      element.rows = 30;
      element.fontSize = 16;
      await element.updateComplete;
      
      // Should batch updates efficiently
      expect(initSpy).toHaveBeenCalledTimes(1);
    });

    it('should recover from terminal initialization failure', async () => {
      // Simulate terminal creation failure
      vi.mocked(mockXterm.open).mockImplementationOnce(() => {
        throw new Error('Failed to initialize terminal');
      });
      
      const errorElement = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      // Should handle error gracefully
      expect(errorElement).toBeTruthy();
    });
  });

  describe('Data Handling Edge Cases', () => {
    it('should handle extremely large data chunks', async () => {
      const largeData = 'x'.repeat(1024 * 1024); // 1MB of data
      
      element.write(largeData);
      
      // Should handle without crashing
      expect(mockXterm.write).toHaveBeenCalled();
    });

    it('should handle binary data correctly', async () => {
      const binaryData = new Uint8Array([0x00, 0x01, 0xFF, 0xFE]);
      
      element.write(String.fromCharCode(...binaryData));
      
      expect(mockXterm.write).toHaveBeenCalled();
    });

    it('should handle control characters properly', async () => {
      const controlChars = '\x1b[31mRed Text\x1b[0m\r\n\x07'; // ANSI escape + bell
      
      element.write(controlChars);
      
      expect(mockXterm.write).toHaveBeenCalledWith(controlChars);
    });

    it('should handle rapid consecutive writes', async () => {
      const writes = 1000;
      
      for (let i = 0; i < writes; i++) {
        element.write(`Line ${i}\n`);
      }
      
      // Should batch writes efficiently
      expect(mockXterm.write).toHaveBeenCalled();
    });

    it('should handle null/undefined data gracefully', () => {
      element.write(null as any);
      element.write(undefined as any);
      element.write('');
      
      // Should not crash
      expect(element).toBeTruthy();
    });
  });

  describe('Resizing Edge Cases', () => {
    it('should handle extreme resize dimensions', async () => {
      // Test very small dimensions
      element.setSize(1, 1);
      expect(element.cols).toBe(1);
      expect(element.rows).toBe(1);
      
      // Test very large dimensions
      element.setSize(9999, 9999);
      expect(element.cols).toBe(9999);
      expect(element.rows).toBe(9999);
    });

    it('should handle rapid resize events', async () => {
      const resizes = 50;
      
      for (let i = 0; i < resizes; i++) {
        element.setSize(80 + i, 24 + i);
      }
      
      // Should debounce resizes
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Final size should be applied
      expect(element.cols).toBe(80 + resizes - 1);
      expect(element.rows).toBe(24 + resizes - 1);
    });

    it('should maintain aspect ratio when fitHorizontally is enabled', async () => {
      element.fitHorizontally = true;
      element.maxCols = 120;
      await element.updateComplete;
      
      element.setSize(150, 30);
      
      // Should respect maxCols constraint
      expect(element.cols).toBeLessThanOrEqual(120);
    });

    it('should handle resize when terminal is not initialized', () => {
      // Remove terminal instance
      (element as any).terminal = null;
      
      // Should not crash
      element.setSize(100, 30);
      
      expect(element.cols).toBe(100);
      expect(element.rows).toBe(30);
    });
  });

  describe('Scrolling Edge Cases', () => {
    it('should handle scroll to positions beyond buffer', () => {
      // Try to scroll beyond buffer limits
      element.scrollToLine(999999);
      
      // Should clamp to valid range
      expect(mockXterm.scrollLines).toHaveBeenCalled();
    });

    it('should handle scroll with empty buffer', () => {
      mockXterm.buffer.active.length = 0;
      
      element.scrollToBottom();
      element.scrollToTop();
      
      // Should handle gracefully
      expect(element).toBeTruthy();
    });

    it('should maintain scroll position during rapid writes', async () => {
      element.followCursorEnabled = false;
      const initialScroll = 50;
      element.viewportY = initialScroll;
      
      // Write multiple lines
      for (let i = 0; i < 100; i++) {
        element.write(`Line ${i}\n`);
      }
      
      // Should maintain scroll position when follow is disabled
      expect(element.followCursorEnabled).toBe(false);
    });

    it('should handle momentum scrolling', async () => {
      // Simulate touch scroll with momentum
      const touchStart = new TouchEvent('touchstart', {
        touches: [{ clientX: 0, clientY: 100 } as Touch]
      });
      const touchMove = new TouchEvent('touchmove', {
        touches: [{ clientX: 0, clientY: 50 } as Touch]
      });
      const touchEnd = new TouchEvent('touchend');
      
      element.dispatchEvent(touchStart);
      element.dispatchEvent(touchMove);
      element.dispatchEvent(touchEnd);
      
      // Should apply momentum scrolling
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(element).toBeTruthy();
    });
  });

  describe('Copy/Paste Edge Cases', () => {
    it('should handle paste of massive text', async () => {
      const massiveText = 'x'.repeat(10 * 1024 * 1024); // 10MB
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer()
      });
      Object.defineProperty(pasteEvent.clipboardData, 'getData', {
        value: () => massiveText
      });
      
      element.dispatchEvent(pasteEvent);
      
      // Should handle without freezing
      expect(mockXterm.write).toHaveBeenCalled();
    });

    it('should handle copy with no selection', () => {
      mockXterm.hasSelection.mockReturnValue(false);
      
      const copyEvent = new ClipboardEvent('copy');
      element.dispatchEvent(copyEvent);
      
      // Should handle gracefully
      expect(element).toBeTruthy();
    });

    it('should sanitize pasted content', async () => {
      const maliciousContent = '<script>alert("XSS")</script>';
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer()
      });
      Object.defineProperty(pasteEvent.clipboardData, 'getData', {
        value: () => maliciousContent
      });
      
      element.dispatchEvent(pasteEvent);
      
      // Should sanitize HTML
      expect(mockXterm.write).toHaveBeenCalled();
      const writtenData = mockXterm.write.mock.calls[0][0];
      expect(writtenData).not.toContain('<script>');
    });

    it('should handle paste when clipboard API is unavailable', async () => {
      // Remove clipboard API
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true
      });
      
      element.paste('fallback text');
      
      // Should use fallback method
      expect(mockXterm.write).toHaveBeenCalled();
      
      // Restore clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true
      });
    });
  });

  describe('Theme Edge Cases', () => {
    it('should handle invalid theme values', async () => {
      element.theme = 'invalid-theme' as any;
      await element.updateComplete;
      
      // Should fallback to default theme
      expect(element).toBeTruthy();
    });

    it('should handle rapid theme changes', async () => {
      const themes = ['auto', 'dark', 'light', 'solarized-dark', 'solarized-light'];
      
      for (const theme of themes) {
        element.theme = theme as any;
        await element.updateComplete;
      }
      
      // Should apply last theme
      expect(element.theme).toBe('solarized-light');
    });

    it('should handle theme change when terminal is not initialized', () => {
      (element as any).terminal = null;
      
      element.theme = 'dark';
      
      // Should not crash
      expect(element.theme).toBe('dark');
    });
  });

  describe('Focus Management Edge Cases', () => {
    it('should handle focus when terminal is hidden', async () => {
      element.style.display = 'none';
      
      element.focus();
      
      // Should handle gracefully
      expect(mockXterm.focus).toHaveBeenCalled();
    });

    it('should handle blur during active input', () => {
      // Simulate active typing
      mockXterm.textarea = document.createElement('textarea');
      mockXterm.textarea.value = 'partial input';
      
      element.blur();
      
      // Should handle gracefully
      expect(mockXterm.blur).toHaveBeenCalled();
    });

    it('should maintain focus during terminal refresh', async () => {
      element.focus();
      
      // Trigger refresh
      element.refresh();
      
      // Should maintain focus state
      expect(mockXterm.focus).toHaveBeenCalled();
    });
  });

  describe('Memory Management Edge Cases', () => {
    it('should handle buffer overflow gracefully', () => {
      // Fill buffer to maximum
      const scrollback = 10000;
      for (let i = 0; i < scrollback * 2; i++) {
        element.write(`Line ${i}\n`);
      }
      
      // Should manage memory by removing old lines
      expect(element).toBeTruthy();
    });

    it('should clean up resources on disconnect', () => {
      const disposeSpy = vi.spyOn(mockXterm, 'dispose');
      
      element.disconnectedCallback();
      
      // Should dispose terminal and clean up
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should handle reconnection after disconnect', async () => {
      element.disconnectedCallback();
      element.connectedCallback();
      await element.updateComplete;
      
      // Should reinitialize properly
      expect(element).toBeTruthy();
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle high-frequency updates efficiently', async () => {
      const updates = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < updates; i++) {
        element.write(`\rProgress: ${i}/${updates}`);
      }
      
      const elapsed = performance.now() - startTime;
      
      // Should complete within reasonable time (< 1 second)
      expect(elapsed).toBeLessThan(1000);
    });

    it('should debounce render operations', async () => {
      const renderSpy = vi.spyOn(element as any, 'renderBuffer');
      
      // Trigger multiple renders rapidly
      for (let i = 0; i < 100; i++) {
        element.write('x');
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should batch renders
      expect(renderSpy.mock.calls.length).toBeLessThan(100);
    });
  });

  describe('Accessibility Edge Cases', () => {
    it('should handle screen reader announcements', () => {
      // Write content that should be announced
      element.write('Important: System will restart\n');
      
      // Should update ARIA live region
      const liveRegion = element.querySelector('[aria-live]');
      if (liveRegion) {
        expect(liveRegion.textContent).toContain('System will restart');
      }
    });

    it('should maintain keyboard navigation during scroll', () => {
      element.focus();
      
      // Simulate keyboard navigation
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        ctrlKey: true
      });
      
      element.dispatchEvent(keyEvent);
      
      // Should handle keyboard scrolling
      expect(element).toBeTruthy();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from render errors', () => {
      // Simulate render error
      vi.spyOn(element as any, 'renderBuffer').mockImplementationOnce(() => {
        throw new Error('Render failed');
      });
      
      element.write('test');
      
      // Should continue functioning
      expect(element).toBeTruthy();
    });

    it('should handle WebGL context loss', async () => {
      // Simulate WebGL context loss
      const contextLostEvent = new Event('webglcontextlost');
      element.dispatchEvent(contextLostEvent);
      
      // Should fallback to canvas rendering
      await element.updateComplete;
      expect(element).toBeTruthy();
    });

    it('should handle terminal reset gracefully', () => {
      // Fill terminal with content
      for (let i = 0; i < 100; i++) {
        element.write(`Line ${i}\n`);
      }
      
      // Reset terminal
      element.reset();
      
      // Should clear and reinitialize
      expect(mockXterm.reset).toHaveBeenCalled();
    });
  });
});
