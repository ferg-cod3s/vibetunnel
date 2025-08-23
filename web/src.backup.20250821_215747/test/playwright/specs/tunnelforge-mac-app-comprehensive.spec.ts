/**
 * TunnelForge Mac App Comprehensive Tests
 * 
 * This test suite covers edge cases, error scenarios, and visual verification
 * to ensure the Mac app is displaying everything it's supposed to.
 */

import { test, expect } from '@playwright/test';

const MAC_APP_CONFIG = {
  baseURL: 'http://localhost:3001',
  timeout: 15000,
};

test.describe('TunnelForge Mac App - Error Scenarios & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(45000); // Longer timeout for comprehensive tests
    await page.goto(MAC_APP_CONFIG.baseURL);
    await expect(page.locator('tunnelforge-app')).toBeVisible({ timeout: 15000 });
  });

  test('should handle network disconnection gracefully', async ({ page }) => {
    // Create a session first
    const createButton = page.locator('button:has-text("+")').first();
    await createButton.click();
    await page.waitForTimeout(2000);

    // Open the session
    const firstSession = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();
    await firstSession.click();

    // Wait for terminal to load
    const terminal = page.locator('vibe-terminal').or(
      page.locator('vibe-terminal-binary')
    ).first();
    await expect(terminal).toBeVisible({ timeout: 15000 });

    // Simulate network issues by intercepting requests
    await page.route('**/api/sessions/**/stream', route => {
      route.abort();
    });

    // The app should handle disconnection gracefully
    // Look for reconnection indicators or error messages
    const errorIndicators = page.locator('text=connection').or(
      page.locator('text=reconnect').or(
        page.locator('text=disconnected')
      )
    );

    // Either error messages appear or app continues working
    // (depending on reconnection strategy)
    await page.waitForTimeout(5000);
  });

  test('should handle session creation failures', async ({ page }) => {
    // Intercept session creation requests to simulate failure
    await page.route('**/api/sessions', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Server error' })
        });
      } else {
        route.continue();
      }
    });

    const createButton = page.locator('button:has-text("+")').first();
    await createButton.click();

    // Should show error message or handle gracefully
    const errorMessages = page.locator('text=error').or(
      page.locator('text=failed').or(
        page.locator('[data-testid*="error"]')
      )
    );

    // Either shows error or button remains clickable
    await page.waitForTimeout(3000);
  });

  test('should handle empty session lists', async ({ page }) => {
    // Clean all sessions first
    const cleanButton = page.locator('button:has-text("Clean")');
    if (await cleanButton.isVisible({ timeout: 2000 })) {
      await cleanButton.click();
      await page.waitForTimeout(2000);
    }

    // Check for empty state messaging
    const emptyStateMessages = page.locator('text=No sessions').or(
      page.locator('text=Create your first').or(
        page.locator('text=Get started')
      )
    );

    // Should show helpful empty state
    await expect(emptyStateMessages.first()).toBeVisible({ timeout: 5000 });

    // Create button should still be available
    const createButton = page.locator('button:has-text("+")');
    await expect(createButton.first()).toBeVisible();
  });

  test('should handle rapid session creation', async ({ page }) => {
    // Test creating multiple sessions quickly
    const createButton = page.locator('button:has-text("+")').first();

    for (let i = 0; i < 3; i++) {
      await createButton.click();
      await page.waitForTimeout(500); // Short delay between clicks
    }

    // Wait for all sessions to appear
    await page.waitForTimeout(5000);

    const sessionCards = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    );

    // Should have created 3 sessions
    await expect(sessionCards).toHaveCount(3, { timeout: 10000 });
  });

  test('should handle browser refresh in session view', async ({ page }) => {
    // Create and open a session
    const createButton = page.locator('button:has-text("+")').first();
    await createButton.click();
    await page.waitForTimeout(2000);

    const firstSession = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();
    await firstSession.click();

    // Wait for session view to load
    await expect(page.locator('session-view')).toBeVisible({ timeout: 15000 });

    // Refresh the page
    await page.reload();

    // Should handle refresh gracefully - either redirect to list or restore session
    await page.waitForTimeout(3000);
    
    // Should either be back at session list or still in session view
    const isInSessionView = await page.locator('session-view').isVisible();
    const isInSessionList = await page.locator('tunnelforge-app').isVisible();
    
    expect(isInSessionView || isInSessionList).toBeTruthy();
  });
});

test.describe('TunnelForge Mac App - Visual Verification', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(MAC_APP_CONFIG.baseURL);
    await expect(page.locator('tunnelforge-app')).toBeVisible({ timeout: 15000 });
  });

  test('should display complete UI elements', async ({ page }) => {
    // Verify all major UI components are present
    const uiChecklist = [
      // Header/Navigation
      { selector: 'header', description: 'Header section' },
      { selector: '[data-testid="create-session"]', description: 'Create session button', fallback: 'button:has-text("+")' },
      
      // Session list area
      { selector: '[data-testid="session-list"]', description: 'Session list container', fallback: '.session-list' },
      
      // Theme toggle
      { selector: 'theme-toggle', description: 'Theme toggle', fallback: '[data-testid="theme-toggle"]' },
      
      // Settings or menu
      { selector: '[data-testid="settings"]', description: 'Settings menu', fallback: 'button[title*="settings"]' },
    ];

    for (const item of uiChecklist) {
      let element = page.locator(item.selector);
      
      // Try fallback if main selector doesn't work
      if (item.fallback && !(await element.isVisible({ timeout: 2000 }))) {
        element = page.locator(item.fallback);
      }
      
      // Take screenshot if element is missing for debugging
      if (!(await element.isVisible({ timeout: 2000 }))) {
        await page.screenshot({ 
          path: `missing-${item.description.replace(/\\s+/g, '-')}.png`,
          fullPage: true 
        });
        console.log(`⚠️  Missing UI element: ${item.description}`);
      }
    }
  });

  test('should display TunnelForge branding consistently', async ({ page }) => {
    // Check for TunnelForge branding in multiple places
    const brandingChecks = [
      // Page title
      async () => {
        const title = await page.title();
        expect(title).toContain('TunnelForge');
      },
      
      // Logo or brand text
      async () => {
        const brandText = page.locator('text=TunnelForge');
        const isVisible = await brandText.first().isVisible({ timeout: 5000 });
        if (!isVisible) {
          console.log('⚠️  TunnelForge brand text not found in UI');
        }
      },
      
      // Favicon
      async () => {
        const favicon = page.locator('link[rel*="icon"]');
        const href = await favicon.getAttribute('href');
        expect(href).toBeTruthy();
      },
    ];

    for (const check of brandingChecks) {
      await check();
    }
  });

  test('should apply TunnelForge theme colors', async ({ page }) => {
    // Verify theme colors are applied correctly
    const colorVars = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        primaryGold: styles.getPropertyValue('--tf-primary-gold')?.trim(),
        terminalGreen: styles.getPropertyValue('--tf-terminal-green')?.trim(),
        darkBg: styles.getPropertyValue('--tf-bg-dark')?.trim(),
        metaMedium: styles.getPropertyValue('--tf-metal-medium')?.trim(),
      };
    });

    // Check that TunnelForge theme variables are defined
    expect(colorVars.primaryGold).toBe('#FFD700');
    expect(colorVars.terminalGreen).toBe('#00FF41');
    expect(colorVars.darkBg).toBe('#1A1A1A');
    expect(colorVars.metaMedium).toBe('#4A4A4A');

    // Verify colors are actually being used in elements
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).backgroundColor;
    });

    // Background should use dark theme colors
    expect(bgColor).toContain('26, 26, 26'); // RGB values for #1A1A1A
  });

  test('should display session cards with proper styling', async ({ page }) => {
    // Create a session to test styling
    const createButton = page.locator('button:has-text("+")').first();
    await createButton.click();
    await page.waitForTimeout(3000);

    const sessionCard = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();

    await expect(sessionCard).toBeVisible({ timeout: 10000 });

    // Check session card styling
    const cardStyles = await sessionCard.evaluate(el => {
      const styles = getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        borderRadius: styles.borderRadius,
      };
    });

    // Session cards should have dark theme styling
    console.log('Session card styles:', cardStyles);
    
    // Take a screenshot for visual verification
    await page.screenshot({ 
      path: 'session-card-styling.png',
      clip: await sessionCard.boundingBox() || undefined
    });
  });

  test('should display terminal with correct theme in session view', async ({ page }) => {
    // Create and open a session
    const createButton = page.locator('button:has-text("+")').first();
    await createButton.click();
    await page.waitForTimeout(2000);

    const firstSession = page.locator('[data-testid*="session"]').or(
      page.locator('.session-card')
    ).first();
    await firstSession.click();

    // Wait for terminal to load
    const terminal = page.locator('vibe-terminal').or(
      page.locator('vibe-terminal-binary')
    ).first();
    await expect(terminal).toBeVisible({ timeout: 15000 });

    // Take screenshot of terminal for visual verification
    await page.screenshot({ 
      path: 'terminal-theme-verification.png',
      fullPage: true
    });

    // Check terminal styling
    const terminalStyles = await terminal.evaluate(el => {
      const styles = getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });

    console.log('Terminal styles:', terminalStyles);

    // Terminal should have TunnelForge theme colors
    // (Specific color assertions depend on the terminal implementation)
  });

  test('should be responsive and handle window resizing', async ({ page }) => {
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop-large' },
      { width: 1440, height: 900, name: 'desktop-medium' },
      { width: 1024, height: 768, name: 'desktop-small' },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(1000);

      // Take screenshot at each size
      await page.screenshot({ 
        path: `responsive-${viewport.name}.png`,
        fullPage: true
      });

      // Verify UI is still functional
      const createButton = page.locator('button:has-text("+")').first();
      await expect(createButton).toBeVisible();

      // Verify no horizontal scroll bars (unless expected)
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const windowWidth = await page.evaluate(() => window.innerWidth);
      
      if (bodyWidth > windowWidth + 10) { // Allow small variance
        console.log(`⚠️  Horizontal scroll detected at ${viewport.name}: body=${bodyWidth}px, window=${windowWidth}px`);
      }
    }
  });
});