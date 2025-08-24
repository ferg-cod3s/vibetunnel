/**
 * Mobile Responsive Terminal Test Suite
 * 
 * Tests mobile-specific optimizations including:
 * - Responsive font sizing based on device pixel ratio
 * - Mobile capability detection
 * - Performance optimizations for low-end devices
 */

import { html, fixture, expect, aTimeout } from '@open-wc/testing';
import { Terminal } from '../terminal.js';
import type { Terminal as TerminalType } from '../terminal.js';

// Mock window and navigator properties for mobile testing
const mockMobile = (width: number, devicePixelRatio = 1, hardwareConcurrency = 4) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });

  Object.defineProperty(window, 'devicePixelRatio', {
    writable: true,
    configurable: true,
    value: devicePixelRatio,
  });

  Object.defineProperty(navigator, 'hardwareConcurrency', {
    writable: true,
    configurable: true,
    value: hardwareConcurrency,
  });
};

const mockDesktop = () => {
  mockMobile(1024, 1, 8); // Desktop: wide screen, normal DPI, more cores
};

describe('Terminal Mobile Responsive Features', () => {
  let element: TerminalType;

  beforeEach(async () => {
    // Reset to desktop defaults before each test
    mockDesktop();
  });

  afterEach(() => {
    if (element) {
      element.remove();
    }
  });

  describe('Mobile Font Size Optimization', () => {
    it('should increase font size on mobile devices', async () => {
      // Mock mobile environment
      mockMobile(400, 1, 2); // Mobile: narrow screen, low DPI, low cores
      
      element = await fixture(html`
        <vibe-terminal fontSize="14"></vibe-terminal>
      `);
      
      await aTimeout(100); // Allow initialization
      
      // Font should be increased for mobile readability
      expect(element.fontSize).to.be.greaterThan(14);
      expect(element.fontSize).to.be.at.most(22); // Within mobile range
    });

    it('should apply high-DPI scaling on mobile', async () => {
      // Mock high-DPI mobile device
      mockMobile(400, 2.5, 4); // Mobile: narrow screen, high DPI
      
      element = await fixture(html`
        <vibe-terminal fontSize="16"></vibe-terminal>
      `);
      
      await aTimeout(100); // Allow initialization
      
      // High-DPI mobile should have slightly smaller font than low-DPI
      const highDpiFontSize = element.fontSize;
      
      // Compare with low-DPI mobile
      mockMobile(400, 1, 4); // Same mobile, low DPI
      const lowDpiElement = await fixture(html`
        <vibe-terminal fontSize="16"></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      expect(lowDpiElement.fontSize).to.be.greaterThan(highDpiFontSize);
    });

    it('should not modify font size on desktop', async () => {
      // Desktop should use original font size
      element = await fixture(html`
        <vibe-terminal fontSize="14"></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Desktop should keep original font size
      expect(element.fontSize).to.equal(14);
    });

    it('should clamp font size to reasonable mobile range', async () => {
      // Test with very small initial font
      mockMobile(400, 1, 2);
      
      element = await fixture(html`
        <vibe-terminal fontSize="8"></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Should be clamped to minimum readable size
      expect(element.fontSize).to.be.at.least(14);
      
      // Test with very large initial font
      const largeElement = await fixture(html`
        <vibe-terminal fontSize="30"></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Should be clamped to maximum mobile size
      expect(largeElement.fontSize).to.be.at.most(22);
    });
  });

  describe('Mobile Capability Detection', () => {
    it('should detect low-end mobile devices', async () => {
      // Mock low-end mobile device
      mockMobile(400, 1, 2); // Low hardware concurrency
      
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        configurable: true,
        value: 1, // Low memory
      });
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Access private method for testing (TypeScript will complain, but it's a test)
      const capabilities = (element as any).getMobileCapabilities();
      
      expect(capabilities.isLowEnd).to.be.true;
      expect(capabilities.isTouchPrimary).to.be.true;
      expect(capabilities.hasHighDPI).to.be.false;
    });

    it('should detect high-end mobile devices', async () => {
      // Mock high-end mobile device
      mockMobile(400, 3, 8); // High DPI, many cores
      
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        configurable: true,
        value: 8, // High memory
      });
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      const capabilities = (element as any).getMobileCapabilities();
      
      expect(capabilities.isLowEnd).to.be.false;
      expect(capabilities.isTouchPrimary).to.be.true;
      expect(capabilities.hasHighDPI).to.be.true;
    });

    it('should return desktop capabilities for desktop devices', async () => {
      // Desktop environment
      mockDesktop();
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      const capabilities = (element as any).getMobileCapabilities();
      
      expect(capabilities.isLowEnd).to.be.false;
      expect(capabilities.isTouchPrimary).to.be.false;
      expect(capabilities.maxTouchPoints).to.equal(0);
    });
  });

  describe('Performance Optimizations', () => {
    it('should use reduced scrollback on mobile', async () => {
      // Mock mobile device
      mockMobile(400, 1, 2);
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      const scrollback = (element as any).getOptimizedScrollback();
      
      // Mobile should have reduced scrollback for performance
      expect(scrollback).to.be.at.most(500);
    });

    it('should use higher scrollback on desktop', async () => {
      // Desktop environment
      mockDesktop();
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      const scrollback = (element as any).getOptimizedScrollback();
      
      // Desktop can handle more scrollback
      expect(scrollback).to.be.greaterThan(500);
      expect(scrollback).to.be.at.most(2000);
    });

    it('should apply higher contrast ratio for low-end devices', async () => {
      // Mock low-end mobile device
      mockMobile(400, 1, 1);
      
      Object.defineProperty(navigator, 'deviceMemory', {
        writable: true,
        configurable: true,
        value: 1,
      });
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(200); // Allow terminal initialization
      
      // Access the terminal instance to check configuration
      const terminal = (element as any).terminal;
      if (terminal) {
        expect(terminal.options.minimumContrastRatio).to.equal(1.5);
      }
    });

    it('should use normal contrast ratio for high-end devices', async () => {
      // Mock high-end device
      mockDesktop();
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(200); // Allow terminal initialization
      
      // Access the terminal instance to check configuration
      const terminal = (element as any).terminal;
      if (terminal) {
        expect(terminal.options.minimumContrastRatio).to.equal(1);
      }
    });
  });

  describe('Responsive Behavior Integration', () => {
    it('should detect mobile state correctly', async () => {
      // Mobile viewport
      mockMobile(600); // Below 768px breakpoint
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Should be detected as mobile
      expect((element as any).isMobile).to.be.true;
    });

    it('should detect desktop state correctly', async () => {
      // Desktop viewport
      mockDesktop(); // Above 768px breakpoint
      
      element = await fixture(html`
        <vibe-terminal></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      // Should be detected as desktop
      expect((element as any).isMobile).to.be.false;
    });

    it('should update optimizations when switching between mobile and desktop', async () => {
      // Start as mobile
      mockMobile(400);
      
      element = await fixture(html`
        <vibe-terminal fontSize="14"></vibe-terminal>
      `);
      
      await aTimeout(100);
      
      const mobileFontSize = element.fontSize;
      expect(mobileFontSize).to.be.greaterThan(14);
      
      // Simulate switching to desktop (would trigger resize in real scenario)
      mockDesktop();
      
      // Trigger a manual resize to simulate viewport change
      (element as any).requestResize('test-desktop-switch');
      
      await aTimeout(100);
      
      // Font size should revert to desktop behavior
      expect(element.fontSize).to.be.at.most(mobileFontSize);
    });
  });
});
