import { test, expect, Page, BrowserContext } from '@playwright/test';
import { spawn } from 'child_process';
import * as path from 'path';

// Test configuration
const TEST_PORT = 3456;
const TEST_URL = `http://localhost:${TEST_PORT}`;
let serverProcess: any;

test.describe('TunnelForge E2E - Critical User Journeys', () => {
  // Start server before all tests
  test.beforeAll(async () => {
    serverProcess = spawn('bun', ['run', 'src/cli.ts', '--port', TEST_PORT.toString(), '--no-auth'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, TUNNELFORGE_AUTH_BYPASS: 'true' }
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test.describe('Authentication Flow', () => {
    test('should login successfully with valid credentials', async ({ page }) => {
      await page.goto(TEST_URL);
      
      // Fill login form
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass123');
      await page.click('button[type="submit"]');

      // Should redirect to sessions page
      await expect(page).toHaveURL(`${TEST_URL}/sessions`);
      
      // Should show user info
      await expect(page.locator('.user-info')).toContainText('testuser');
    });

    test('should handle login failure gracefully', async ({ page }) => {
      await page.goto(TEST_URL);
      
      // Try invalid credentials
      await page.fill('input[name="username"]', 'invalid');
      await page.fill('input[name="password"]', 'wrong');
      await page.click('button[type="submit"]');

      // Should show error message
      await expect(page.locator('.error-message')).toBeVisible();
      await expect(page.locator('.error-message')).toContainText('Invalid credentials');
      
      // Should remain on login page
      await expect(page).toHaveURL(TEST_URL);
    });

    test('should handle session expiry', async ({ page, context }) => {
      // Login first
      await page.goto(TEST_URL);
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass123');
      await page.click('button[type="submit"]');

      // Simulate token expiry by clearing cookies
      await context.clearCookies();

      // Try to access protected route
      await page.goto(`${TEST_URL}/sessions`);

      // Should redirect to login
      await expect(page).toHaveURL(`${TEST_URL}/login`);
    });

    test('should handle concurrent login attempts', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login from both contexts simultaneously
      await Promise.all([
        loginUser(page1, 'user1', 'pass1'),
        loginUser(page2, 'user2', 'pass2')
      ]);

      // Both should be logged in independently
      await expect(page1.locator('.user-info')).toContainText('user1');
      await expect(page2.locator('.user-info')).toContainText('user2');

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Session Management', () => {
    test('should create a new terminal session', async ({ page }) => {
      await loginAndNavigate(page);

      // Click create session button
      await page.click('button[data-testid="create-session"]');

      // Fill session form
      await page.fill('input[name="sessionName"]', 'Test Session');
      await page.fill('input[name="command"]', 'bash');
      await page.fill('input[name="workingDirectory"]', '/tmp');
      
      // Submit form
      await page.click('button[data-testid="create-session-submit"]');

      // Should show new session
      await expect(page.locator('.session-card')).toContainText('Test Session');
      
      // Terminal should be visible
      await expect(page.locator('.terminal-container')).toBeVisible();
    });

    test('should handle multiple simultaneous sessions', async ({ page }) => {
      await loginAndNavigate(page);

      // Create multiple sessions
      const sessionNames = ['Session 1', 'Session 2', 'Session 3'];
      
      for (const name of sessionNames) {
        await createSession(page, name);
      }

      // All sessions should be visible
      const sessionCards = page.locator('.session-card');
      await expect(sessionCards).toHaveCount(3);

      // Switch between sessions
      await page.click('.session-card:nth-child(2)');
      await expect(page.locator('.active-session')).toContainText('Session 2');
    });

    test('should reconnect to existing session', async ({ page, context }) => {
      await loginAndNavigate(page);
      
      // Create a session
      await createSession(page, 'Persistent Session');
      
      // Write some content
      await page.locator('.terminal-container').click();
      await page.keyboard.type('echo "Hello World"');
      await page.keyboard.press('Enter');
      
      // Wait for output
      await expect(page.locator('.terminal-container')).toContainText('Hello World');

      // Simulate disconnect (refresh page)
      await page.reload();

      // Session should still exist
      await expect(page.locator('.session-card')).toContainText('Persistent Session');
      
      // Click to reconnect
      await page.click('.session-card:has-text("Persistent Session")');
      
      // Previous output should still be visible
      await expect(page.locator('.terminal-container')).toContainText('Hello World');
    });

    test('should handle session termination', async ({ page }) => {
      await loginAndNavigate(page);
      
      // Create a session
      await createSession(page, 'Temporary Session');
      
      // Terminate session
      await page.click('button[data-testid="terminate-session"]');
      
      // Confirm termination
      await page.click('button[data-testid="confirm-terminate"]');
      
      // Session should be removed
      await expect(page.locator('.session-card:has-text("Temporary Session")')).not.toBeVisible();
    });
  });

  test.describe('Terminal Interaction', () => {
    test('should execute commands and display output', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Command Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Execute various commands
      const commands = [
        { cmd: 'pwd', expected: '/tmp' },
        { cmd: 'echo $USER', expected: process.env.USER || 'testuser' },
        { cmd: 'ls -la', expected: 'total' },
        { cmd: 'date', expected: new Date().getFullYear().toString() }
      ];

      for (const { cmd, expected } of commands) {
        await page.keyboard.type(cmd);
        await page.keyboard.press('Enter');
        await expect(terminal).toContainText(expected, { timeout: 5000 });
      }
    });

    test('should handle special keys and shortcuts', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Keyboard Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Test Ctrl+C (interrupt)
      await page.keyboard.type('sleep 10');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await page.keyboard.press('Control+C');
      await expect(terminal).toContainText('^C');

      // Test Ctrl+L (clear)
      await page.keyboard.press('Control+L');
      // Terminal should be cleared
      
      // Test Tab completion
      await page.keyboard.type('ech');
      await page.keyboard.press('Tab');
      await expect(terminal).toContainText('echo');
    });

    test('should handle copy and paste', async ({ page, context }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Copy Paste Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Type and select text
      await page.keyboard.type('echo "Copy this text"');
      await page.keyboard.press('Enter');
      
      // Select output text
      await page.keyboard.down('Shift');
      await page.keyboard.press('Home');
      await page.keyboard.up('Shift');
      
      // Copy
      await page.keyboard.press('Control+C');
      
      // Paste
      await page.keyboard.press('Control+V');
      
      // Should paste the copied text
      await expect(terminal).toContainText('Copy this text');
    });

    test('should handle terminal resizing', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Resize Test');

      // Set different viewport sizes
      const sizes = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 800, height: 600 },
        { width: 375, height: 667 } // Mobile
      ];

      for (const size of sizes) {
        await page.setViewportSize(size);
        await page.waitForTimeout(500);
        
        // Terminal should adapt to new size
        const terminal = page.locator('.terminal-container');
        const box = await terminal.boundingBox();
        
        expect(box?.width).toBeLessThanOrEqual(size.width);
        expect(box?.height).toBeLessThanOrEqual(size.height);
      }
    });
  });

  test.describe('File Operations', () => {
    test('should upload files via drag and drop', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'File Upload Test');

      // Create a test file
      const fileContent = 'Test file content';
      const fileName = 'test-upload.txt';
      
      // Simulate file drop
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await page.dispatchEvent('.terminal-container', 'drop', { dataTransfer });

      // File should be uploaded
      await expect(page.locator('.file-upload-status')).toContainText('Upload complete');
      
      // Verify file exists
      const terminal = page.locator('.terminal-container');
      await terminal.click();
      await page.keyboard.type(`cat ${fileName}`);
      await page.keyboard.press('Enter');
      await expect(terminal).toContainText(fileContent);
    });

    test('should download files', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'File Download Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Create a file to download
      await page.keyboard.type('echo "Download content" > download-test.txt');
      await page.keyboard.press('Enter');

      // Trigger download
      const downloadPromise = page.waitForEvent('download');
      await page.click('button[data-testid="download-file"]');
      await page.fill('input[name="filepath"]', 'download-test.txt');
      await page.click('button[data-testid="confirm-download"]');

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('download-test.txt');
      
      // Verify content
      const content = await download.createReadStream();
      const buffer = await streamToBuffer(content);
      expect(buffer.toString()).toContain('Download content');
    });

    test('should handle binary files', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Binary File Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Create a binary file
      await page.keyboard.type('dd if=/dev/zero of=binary.dat bs=1024 count=1');
      await page.keyboard.press('Enter');
      
      // Verify file size
      await page.keyboard.type('ls -lh binary.dat');
      await page.keyboard.press('Enter');
      await expect(terminal).toContainText('1.0K');
    });
  });

  test.describe('Performance and Stress Tests', () => {
    test('should handle rapid command execution', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Performance Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      const startTime = Date.now();
      
      // Execute 100 commands rapidly
      for (let i = 0; i < 100; i++) {
        await page.keyboard.type(`echo "Line ${i}"`);
        await page.keyboard.press('Enter');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (< 10 seconds)
      expect(duration).toBeLessThan(10000);

      // All lines should be visible
      await expect(terminal).toContainText('Line 99');
    });

    test('should handle large output gracefully', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Large Output Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Generate large output
      await page.keyboard.type('for i in {1..10000}; do echo "Line $i"; done');
      await page.keyboard.press('Enter');

      // Should handle without freezing
      await expect(terminal).toContainText('Line 10000', { timeout: 30000 });

      // Should be able to scroll
      await page.keyboard.press('Control+Home'); // Scroll to top
      await expect(terminal).toContainText('Line 1');
      
      await page.keyboard.press('Control+End'); // Scroll to bottom
      await expect(terminal).toContainText('Line 10000');
    });

    test('should maintain performance with multiple sessions', async ({ page }) => {
      await loginAndNavigate(page);

      // Create 10 sessions
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        await createSession(page, `Session ${i}`);
        sessions.push(`Session ${i}`);
      }

      // Switch between sessions rapidly
      for (let i = 0; i < 20; i++) {
        const randomSession = sessions[Math.floor(Math.random() * sessions.length)];
        await page.click(`.session-card:has-text("${randomSession}")`);
        await page.waitForTimeout(100);
      }

      // All sessions should remain responsive
      await page.click('.session-card:first-child');
      const terminal = page.locator('.terminal-container');
      await terminal.click();
      await page.keyboard.type('echo "Still responsive"');
      await page.keyboard.press('Enter');
      await expect(terminal).toContainText('Still responsive');
    });
  });

  test.describe('Error Handling and Recovery', () => {
    test('should handle network disconnection', async ({ page, context }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Network Test');

      // Simulate network offline
      await context.setOffline(true);

      // Should show disconnection notice
      await expect(page.locator('.connection-status')).toContainText('Disconnected');

      // Restore network
      await context.setOffline(false);

      // Should reconnect automatically
      await expect(page.locator('.connection-status')).toContainText('Connected', { timeout: 10000 });
    });

    test('should handle server restart', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Server Restart Test');

      // Kill server
      serverProcess.kill();
      
      // Should show error
      await expect(page.locator('.connection-status')).toContainText('Disconnected');

      // Restart server
      serverProcess = spawn('bun', ['run', 'src/cli.ts', '--port', TEST_PORT.toString(), '--no-auth'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, TUNNELFORGE_AUTH_BYPASS: 'true' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Should reconnect
      await page.reload();
      await expect(page.locator('.connection-status')).toContainText('Connected');
    });

    test('should handle invalid input gracefully', async ({ page }) => {
      await loginAndNavigate(page);
      await createSession(page, 'Invalid Input Test');

      const terminal = page.locator('.terminal-container');
      await terminal.click();

      // Send invalid/malformed commands
      const invalidInputs = [
        '\x00\x01\x02\x03', // Binary data
        'a'.repeat(10000), // Very long command
        '${evil}', // Potential injection
        '../../../../etc/passwd' // Path traversal attempt
      ];

      for (const input of invalidInputs) {
        await page.keyboard.type(input);
        await page.keyboard.press('Enter');
        
        // Should not crash
        await page.waitForTimeout(500);
        expect(await page.locator('.terminal-container').isVisible()).toBe(true);
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto(TEST_URL);

      // Navigate using Tab
      await page.keyboard.press('Tab'); // Focus username
      await page.keyboard.type('testuser');
      await page.keyboard.press('Tab'); // Focus password
      await page.keyboard.type('testpass123');
      await page.keyboard.press('Tab'); // Focus submit
      await page.keyboard.press('Enter'); // Submit

      // Should login successfully
      await expect(page).toHaveURL(`${TEST_URL}/sessions`);

      // Navigate sessions with keyboard
      await page.keyboard.press('Tab'); // Focus create button
      await page.keyboard.press('Enter'); // Open create form
      
      // Fill form with keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.type('Keyboard Session');
      await page.keyboard.press('Tab');
      await page.keyboard.type('bash');
      await page.keyboard.press('Tab');
      await page.keyboard.type('/tmp');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); // Submit

      // Session should be created
      await expect(page.locator('.session-card')).toContainText('Keyboard Session');
    });

    test('should work with screen readers', async ({ page }) => {
      await loginAndNavigate(page);

      // Check ARIA labels
      await expect(page.locator('[aria-label="Create new session"]')).toBeVisible();
      await expect(page.locator('[aria-label="Terminal output"]')).toBeVisible();
      await expect(page.locator('[aria-live="polite"]')).toBeVisible();

      // Check role attributes
      await expect(page.locator('[role="main"]')).toBeVisible();
      await expect(page.locator('[role="navigation"]')).toBeVisible();
    });

    test('should support high contrast mode', async ({ page }) => {
      await loginAndNavigate(page);

      // Enable high contrast
      await page.emulateMedia({ colorScheme: 'dark' });
      
      // Check contrast ratios
      const backgroundColor = await page.locator('.terminal-container').evaluate(
        el => window.getComputedStyle(el).backgroundColor
      );
      const textColor = await page.locator('.terminal-container').evaluate(
        el => window.getComputedStyle(el).color
      );

      // Verify sufficient contrast (simplified check)
      expect(backgroundColor).not.toBe(textColor);
    });
  });
});

// Helper functions
async function loginUser(page: Page, username: string, password: string) {
  await page.goto(TEST_URL);
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${TEST_URL}/sessions`);
}

async function loginAndNavigate(page: Page) {
  await loginUser(page, 'testuser', 'testpass123');
}

async function createSession(page: Page, name: string) {
  await page.click('button[data-testid="create-session"]');
  await page.fill('input[name="sessionName"]', name);
  await page.fill('input[name="command"]', 'bash');
  await page.fill('input[name="workingDirectory"]', '/tmp');
  await page.click('button[data-testid="create-session-submit"]');
  await page.waitForSelector(`.session-card:has-text("${name}")`);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
