/**
 * TunnelForge Mac App Integration Tests
 * 
 * These tests verify the TunnelForge Mac app is working correctly by testing
 * the web interface that the Mac app serves. These tests assume the Mac app
 * is already running and serving on localhost:3001.
 */

import { test, expect } from '@playwright/test';

// Test configuration for Mac app testing
const MAC_APP_CONFIG = {
  baseURL: 'http://localhost:3001',
  timeout: 10000,
  retries: 2,
};

test.describe('TunnelForge Mac App Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Set a longer timeout for Mac app tests since they involve real server startup
    test.setTimeout(30000);
    
    // Navigate to the Mac app's web interface
    await page.goto(MAC_APP_CONFIG.baseURL);
    
    // Wait for the app to load
    await expect(page.locator('tunnelforge-app')).toBeVisible({ timeout: 10000 });
  });

  test('should display TunnelForge branding', async ({ page }) => {
    // Check that the page title uses TunnelForge branding
    await expect(page).toHaveTitle(/TunnelForge/);
    
    // Verify TunnelForge branding in the interface
    const brandingElements = page.locator('text=TunnelForge').or(
      page.locator('[data-testid*="tunnelforge"]')
    );
    await expect(brandingElements.first()).toBeVisible();
  });

  test('should load with new color scheme', async ({ page }) => {
    // Check for TunnelForge theme CSS variables
    const themeVars = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        primaryGold: styles.getPropertyValue('--tf-primary-gold'),
        terminalGreen: styles.getPropertyValue('--tf-terminal-green'),
        darkBg: styles.getPropertyValue('--tf-bg-dark'),
      };
    });
    
    expect(themeVars.primaryGold).toBe('#FFD700');
    expect(themeVars.terminalGreen).toBe('#00FF41');
    expect(themeVars.darkBg).toBe('#1A1A1A');
  });

  test('should show session list', async ({ page }) => {
    // Wait for session list to load
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible({ timeout: 10000 });
    
    // Check for session creation button
    const createButton = page.locator('button:has-text("+")').or(
      page.locator('[data-testid="create-session"]')
    );
    await expect(createButton.first()).toBeVisible();
  });

  test('should create and display a new session', async ({ page }) => {
    // Click the create session button
    const createButton = page.locator('button:has-text("+")').or(
      page.locator('[data-testid="create-session"]')
    ).first();
    
    await createButton.click();
    
    // Wait for session creation (this should call the Go server)
    await page.waitForTimeout(2000);
    
    // Check that a session appears in the list
    const sessionCards = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    );
    
    await expect(sessionCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should open terminal view when clicking on session', async ({ page }) => {
    // First ensure we have at least one session
    const createButton = page.locator('button:has-text("+")').or(
      page.locator('[data-testid="create-session"]')
    ).first();
    
    await createButton.click();
    await page.waitForTimeout(2000);
    
    // Click on the first session
    const firstSession = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();
    
    await firstSession.click();
    
    // Verify we're in session view
    await expect(page.locator('session-view')).toBeVisible({ timeout: 10000 });
    
    // Check for terminal component
    const terminal = page.locator('vibe-terminal').or(
      page.locator('vibe-terminal-binary')
    ).or(
      page.locator('[data-testid="terminal"]')
    );
    
    await expect(terminal.first()).toBeVisible({ timeout: 15000 });
  });

  test('should connect to backend servers', async ({ page }) => {
    // Test that the app can communicate with both Bun and Go servers
    
    // Check health endpoint (Go server)
    const healthResponse = await page.request.get('http://localhost:4021/health');
    expect(healthResponse.ok()).toBeTruthy();
    
    // Check sessions API (Go server via Bun proxy)
    const sessionsResponse = await page.request.get('/api/sessions');
    expect(sessionsResponse.ok()).toBeTruthy();
    
    const sessions = await sessionsResponse.json();
    expect(Array.isArray(sessions)).toBeTruthy();
  });

  test('should handle terminal input and output', async ({ page }) => {
    // Create a session first
    const createButton = page.locator('button:has-text("+")').or(
      page.locator('[data-testid="create-session"]')
    ).first();
    
    await createButton.click();
    await page.waitForTimeout(2000);
    
    // Open session
    const firstSession = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();
    
    await firstSession.click();
    
    // Wait for terminal to be ready
    const terminal = page.locator('vibe-terminal').or(
      page.locator('vibe-terminal-binary')
    ).first();
    
    await expect(terminal).toBeVisible({ timeout: 15000 });
    
    // Try to interact with terminal (click to focus)
    await terminal.click();
    
    // Type a simple command
    await page.keyboard.type('echo "TunnelForge test"\\n');
    
    // Wait for output (this tests the full SSE/WebSocket pipeline)
    await expect(page.locator('text=TunnelForge test')).toBeVisible({ timeout: 10000 });
  });

  test('should show proper error handling for offline servers', async ({ page }) => {
    // This test checks what happens if servers are not running
    // Skip if we detect servers are running (which they should be for Mac app tests)
    
    const healthCheck = await page.request.get('http://localhost:4021/health').catch(() => null);
    
    if (healthCheck?.ok()) {
      test.skip('Servers are running - skipping offline test');
      return;
    }
    
    // If servers are down, app should show appropriate error messages
    await expect(page.locator('text=connection').or(
      page.locator('text=server').or(
        page.locator('text=error')
      )
    )).toBeVisible({ timeout: 5000 });
  });
});

test.describe('TunnelForge Mac App Performance', () => {
  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto(MAC_APP_CONFIG.baseURL);
    await expect(page.locator('tunnelforge-app')).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    
    // App should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle multiple sessions', async ({ page }) => {
    await page.goto(MAC_APP_CONFIG.baseURL);
    await expect(page.locator('tunnelforge-app')).toBeVisible();
    
    // Create multiple sessions to test performance
    const createButton = page.locator('button:has-text("+")').first();
    
    for (let i = 0; i < 3; i++) {
      await createButton.click();
      await page.waitForTimeout(1000);
    }
    
    // Verify all sessions are displayed
    const sessionCards = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    );
    
    await expect(sessionCards).toHaveCount(3, { timeout: 10000 });
  });
});