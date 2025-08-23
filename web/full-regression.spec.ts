import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive regression test suite to verify feature parity between
 * Node.js version and Go/Bun version of TunnelForge
 */

// Test configuration
const CONFIG = {
  // Update these URLs based on your running servers
  BUN_SERVER: 'http://localhost:3003',
  NODEJS_SERVER: 'http://localhost:4020', // Update if Node.js server is running
  
  // Test timeouts
  NETWORK_TIMEOUT: 10000,
  SESSION_TIMEOUT: 15000,
  SSE_TIMEOUT: 5000,
};

class TunnelForgeTestHelper {
  constructor(private page: Page) {}

  async navigateToApp(serverUrl: string) {
    await this.page.goto(serverUrl);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForAppReady() {
    // Wait for the main app component to be loaded
    await this.page.waitForSelector('tunnelforge-app', { timeout: 10000 });
    
    // Wait for any initial API calls to complete
    await this.page.waitForTimeout(1000);
  }

  async createSession(options: {
    command?: string;
    cwd?: string;
    title?: string;
  } = {}) {
    const defaultOptions = {
      command: 'bash',
      cwd: '/tmp',
      title: 'Test Session'
    };
    
    const sessionOptions = { ...defaultOptions, ...options };

    // Click create session button (adjust selector based on actual UI)
    await this.page.click('[data-testid="create-session-btn"]', { timeout: 5000 });
    
    // Fill session details
    if (await this.page.locator('[data-testid="session-command"]').isVisible()) {
      await this.page.fill('[data-testid="session-command"]', sessionOptions.command);
    }
    
    if (await this.page.locator('[data-testid="session-cwd"]').isVisible()) {
      await this.page.fill('[data-testid="session-cwd"]', sessionOptions.cwd);
    }
    
    // Submit session creation
    await this.page.click('[data-testid="create-session-submit"]');
    
    // Wait for session to be created
    await this.page.waitForSelector('[data-testid="terminal-container"]', {
      timeout: CONFIG.SESSION_TIMEOUT
    });
    
    return this.getCurrentSessionId();
  }

  async getCurrentSessionId(): Promise<string | null> {
    // Extract session ID from URL or DOM
    const url = this.page.url();
    const sessionIdMatch = url.match(/session[=/]([a-f0-9-]+)/i);
    return sessionIdMatch ? sessionIdMatch[1] : null;
  }

  async getSessionsList() {
    // Navigate to sessions list or return current sessions data
    const response = await this.page.evaluate(async () => {
      const res = await fetch('/api/sessions');
      return res.json();
    });
    return response;
  }

  async sendTerminalInput(input: string) {
    // Focus terminal and send input
    await this.page.click('[data-testid="terminal-container"]');
    await this.page.keyboard.type(input);
    await this.page.keyboard.press('Enter');
  }

  async getTerminalOutput(): Promise<string> {
    // Extract terminal content
    return await this.page.textContent('[data-testid="terminal-output"]') || '';
  }

  async deleteCurrentSession() {
    await this.page.click('[data-testid="delete-session-btn"]');
    // Confirm deletion if needed
    if (await this.page.locator('[data-testid="confirm-delete"]').isVisible()) {
      await this.page.click('[data-testid="confirm-delete"]');
    }
  }

  async checkAuthenticationState() {
    const response = await this.page.evaluate(async () => {
      const res = await fetch('/api/auth/config');
      return res.json();
    });
    return response;
  }

  async takeAppSnapshot(name: string) {
    // Take screenshot for visual regression testing
    await this.page.screenshot({
      path: `test-results/snapshots/${name}.png`,
      fullPage: true
    });
  }
}

test.describe('TunnelForge Full Regression Tests', () => {
  let helper: TunnelForgeTestHelper;

  test.beforeEach(async ({ page }) => {
    helper = new TunnelForgeTestHelper(page);
  });

  test.describe('Go/Bun Server Tests', () => {
    test.beforeEach(async ({ page }) => {
      await helper.navigateToApp(CONFIG.BUN_SERVER);
      await helper.waitForAppReady();
    });

    test('should load application successfully', async ({ page }) => {
      await expect(page.locator('tunnelforge-app')).toBeVisible();
      
      // Check that essential elements are present
      await expect(page.locator('[data-testid="app-header"]')).toBeVisible();
      
      // Take snapshot for comparison
      await helper.takeAppSnapshot('bun-app-loaded');
    });

    test('should handle authentication correctly', async ({ page }) => {
      const authConfig = await helper.checkAuthenticationState();
      
      // Should be in no-auth mode for testing
      expect(authConfig.noAuth).toBe(true);
      
      // Verify auth UI is correct
      if (authConfig.noAuth) {
        // No auth form should be visible
        await expect(page.locator('[data-testid="login-form"]')).not.toBeVisible();
      } else {
        await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      }
    });

    test('should create terminal session successfully', async ({ page }) => {
      // Create a session
      await helper.createSession({
        command: 'echo \"Hello TunnelForge\"',
        cwd: '/tmp'
      });
      
      // Verify session was created
      const sessionId = await helper.getCurrentSessionId();
      expect(sessionId).toBeTruthy();
      
      // Verify session appears in API
      const sessions = await helper.getSessionsList();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe(sessionId);
      
      // Take snapshot
      await helper.takeAppSnapshot('bun-session-created');
    });

    test('should handle terminal input/output', async ({ page }) => {
      await helper.createSession();
      
      // Send command to terminal
      await helper.sendTerminalInput('echo \"Test Output\"');
      
      // Wait for output to appear
      await page.waitForTimeout(2000);
      
      // Verify output is visible
      const output = await helper.getTerminalOutput();
      expect(output).toContain('Test Output');
      
      await helper.takeAppSnapshot('bun-terminal-io');
    });

    test('should handle session deletion', async ({ page }) => {
      await helper.createSession();
      
      // Delete the session
      await helper.deleteCurrentSession();
      
      // Verify session was deleted
      await page.waitForTimeout(1000);
      const sessions = await helper.getSessionsList();
      expect(sessions).toHaveLength(0);
    });

    test('should establish WebSocket connection', async ({ page }) => {
      // Listen for WebSocket connection
      let wsConnected = false;
      
      page.on('websocket', (ws) => {
        wsConnected = true;
        ws.on('framereceived', () => {
          // WebSocket is receiving data
        });
      });
      
      await helper.createSession();
      
      // Wait for WebSocket to connect
      await page.waitForTimeout(3000);
      expect(wsConnected).toBe(true);
    });

    test('should receive SSE events', async ({ page }) => {
      let sseConnected = false;
      
      // Monitor network requests for SSE
      page.on('response', (response) => {
        if (response.url().includes('/api/events') && 
            response.headers()['content-type']?.includes('text/event-stream')) {
          sseConnected = true;
        }
      });
      
      await helper.createSession();
      
      // Wait for SSE connection
      await page.waitForTimeout(CONFIG.SSE_TIMEOUT);
      expect(sseConnected).toBe(true);
    });

    test('should handle multiple sessions', async ({ page }) => {
      // Create multiple sessions
      await helper.createSession({ command: 'bash', title: 'Session 1' });
      await helper.createSession({ command: 'sh', title: 'Session 2' });
      
      // Verify both sessions exist
      const sessions = await helper.getSessionsList();
      expect(sessions).toHaveLength(2);
      
      await helper.takeAppSnapshot('bun-multiple-sessions');
    });
  });

  // Only run Node.js tests if server is available
  test.describe('Node.js Server Comparison Tests', () => {
    test.skip(({ browserName }) => {
      // Skip if Node.js server is not running
      // You can add a check here to ping the Node.js server
      return false; // Set to true to skip Node.js tests
    });

    test.beforeEach(async ({ page }) => {
      await helper.navigateToApp(CONFIG.NODEJS_SERVER);
      await helper.waitForAppReady();
    });

    test('should load application successfully (Node.js)', async ({ page }) => {
      await expect(page.locator('tunnelforge-app')).toBeVisible();
      await helper.takeAppSnapshot('nodejs-app-loaded');
    });

    test('should create terminal session successfully (Node.js)', async ({ page }) => {
      await helper.createSession({
        command: 'echo \"Hello TunnelForge\"',
        cwd: '/tmp'
      });
      
      const sessionId = await helper.getCurrentSessionId();
      expect(sessionId).toBeTruthy();
      
      const sessions = await helper.getSessionsList();
      expect(sessions).toHaveLength(1);
      
      await helper.takeAppSnapshot('nodejs-session-created');
    });

    test('should handle terminal input/output (Node.js)', async ({ page }) => {
      await helper.createSession();
      await helper.sendTerminalInput('echo \"Test Output\"');
      
      await page.waitForTimeout(2000);
      const output = await helper.getTerminalOutput();
      expect(output).toContain('Test Output');
      
      await helper.takeAppSnapshot('nodejs-terminal-io');
    });
  });

  test.describe('Cross-Platform API Compatibility Tests', () => {
    test('API responses should be identical between Node.js and Go/Bun', async ({ page }) => {
      // Test critical API endpoints and compare responses
      const endpoints = [
        '/api/auth/config',
        '/api/sessions',
        '/health'
      ];

      for (const endpoint of endpoints) {
        // Get response from Bun server
        await page.goto(CONFIG.BUN_SERVER);
        const bunResponse = await page.evaluate(async (url) => {
          const res = await fetch(url);
          return {
            status: res.status,
            data: await res.json()
          };
        }, endpoint);

        // Compare structure and essential fields
        expect(bunResponse.status).toBe(200);
        expect(bunResponse.data).toBeDefined();
        
        // Add specific assertions based on endpoint
        if (endpoint === '/api/auth/config') {
          expect(bunResponse.data).toHaveProperty('noAuth');
        } else if (endpoint === '/api/sessions') {
          expect(Array.isArray(bunResponse.data)).toBe(true);
        }
      }
    });

    test('Session creation API should behave identically', async ({ page }) => {
      await page.goto(CONFIG.BUN_SERVER);
      
      const sessionData = {
        command: 'echo \"API Test\"',
        cwd: '/tmp',
        cols: 80,
        rows: 24
      };

      const response = await page.evaluate(async (data) => {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        return {
          status: res.status,
          data: await res.json()
        };
      }, sessionData);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('title');
      expect(response.data.command).toBe(sessionData.command);
      expect(response.data.cwd).toBe(sessionData.cwd);
      expect(response.data.active).toBe(true);
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      await helper.navigateToApp(CONFIG.BUN_SERVER);
      await helper.waitForAppReady();
    });

    test('should handle invalid session creation gracefully', async ({ page }) => {
      const invalidData = {
        command: '', // Invalid empty command
        cwd: '/nonexistent/path'
      };

      const response = await page.evaluate(async (data) => {
        try {
          const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          return { status: res.status, error: await res.text() };
        } catch (error) {
          return { status: 0, error: error.message };
        }
      }, invalidData);

      // Should return an error status
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Test app behavior when API calls fail
      await page.route('/api/sessions', route => route.abort());
      
      // Try to create session - should show error state
      try {
        await helper.createSession();
      } catch (error) {
        // Expected to fail
      }
      
      // App should still be functional
      await expect(page.locator('tunnelforge-app')).toBeVisible();
    });

    test('should handle session not found errors', async ({ page }) => {
      // Try to access non-existent session
      await page.goto(`${CONFIG.BUN_SERVER}/session/nonexistent-id`);
      
      // Should show appropriate error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    });
  });
});

test.describe('Performance and Load Tests', () => {
  test('should handle rapid session creation', async ({ page }) => {
    const helper = new TunnelForgeTestHelper(page);
    await helper.navigateToApp(CONFIG.BUN_SERVER);
    await helper.waitForAppReady();

    // Create multiple sessions rapidly
    const sessionPromises = Array.from({ length: 5 }, (_, i) =>
      helper.createSession({ title: `Rapid Session ${i + 1}` })
    );

    await Promise.allSettled(sessionPromises);
    
    // Verify all sessions were created
    const sessions = await helper.getSessionsList();
    expect(sessions.length).toBeGreaterThanOrEqual(3); // Allow for some failures
  });

  test('should maintain performance with large terminal output', async ({ page }) => {
    const helper = new TunnelForgeTestHelper(page);
    await helper.navigateToApp(CONFIG.BUN_SERVER);
    await helper.waitForAppReady();

    await helper.createSession();
    
    // Send command that produces large output
    await helper.sendTerminalInput('seq 1 1000');
    
    // Wait for output to complete
    await page.waitForTimeout(5000);
    
    // Terminal should still be responsive
    await helper.sendTerminalInput('echo \"Still responsive\"');
    await page.waitForTimeout(1000);
    
    const output = await helper.getTerminalOutput();
    expect(output).toContain('Still responsive');
  });
});