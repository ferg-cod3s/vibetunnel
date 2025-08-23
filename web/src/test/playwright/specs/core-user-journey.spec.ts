import { expect, test } from '../fixtures/test.fixture';
import { createAndNavigateToSession } from '../helpers/session-lifecycle.helper';
import { TestSessionManager } from '../helpers/test-data-manager.helper';

// This test covers the core user journey that TunnelForge is designed for:
// 1. Create a terminal session
// 2. Interact with the terminal in real-time
// 3. Verify WebSocket streaming works
// 4. Verify terminal state persists
test.describe.configure({ mode: 'parallel' });

test.describe('Core User Journey - Terminal Interaction', () => {
  test.setTimeout(60000); // Extended timeout for terminal interaction

  let sessionManager: TestSessionManager;

  test.beforeEach(async ({ page }) => {
    sessionManager = new TestSessionManager(page, 'core-journey');
  });

  test.afterEach(async () => {
    await sessionManager.cleanupAllSessions();
  });

  test('should complete the full terminal interaction workflow', async ({ page }) => {
    // Step 1: Create a terminal session
    console.log('🚀 Creating terminal session...');
    const { sessionId } = await createAndNavigateToSession(page);

    // Step 2: Wait for terminal to be fully ready
    console.log('⏳ Waiting for terminal to initialize...');
    await page.waitForSelector('vibe-terminal', { state: 'visible', timeout: 15000 });

    // Give terminal more time to fully initialize
    await page.waitForTimeout(3000);

    // Step 3: Focus the terminal
    console.log('🎯 Focusing terminal...');
    const terminal = page.locator('vibe-terminal').first();
    await terminal.click();

    // Step 4: Wait for shell prompt to appear (indicating PTY is working)
    console.log('🐚 Waiting for shell prompt...');
    let promptAppeared = false;

    try {
      await page.waitForFunction(
        () => {
          const term = document.querySelector('vibe-terminal');
          const container = term?.querySelector('#terminal-container');
          const content = container?.textContent || term?.textContent || '';

          // Look for common shell prompt indicators
          const promptPatterns = [
            /[$>#%❯]\s*$/, // Common shell prompts
            /\$\s+$/, // Dollar with space
            />\s+$/, // Greater than with space
            /#\s+$/, // Root prompt with space
            /\w+@[\w-]+/, // username@hostname pattern
            /]\s*[$>#]/, // Bracketed prompt
            /bash-\d+\.\d+\$/, // Bash version prompt
            /zsh.*%/, // Zsh prompt pattern
          ];

          const hasPrompt = promptPatterns.some((pattern) => pattern.test(content));
          const hasContent = content.length > 5;

          return hasPrompt || hasContent;
        },
        { timeout: 25000 }
      );
      promptAppeared = true;
      console.log('✅ Shell prompt detected!');
    } catch (error) {
      console.log('⚠️ Shell prompt timeout, checking terminal content...');

      // Get terminal content for debugging
      const terminalContent = await page.evaluate(() => {
        const term = document.querySelector('vibe-terminal');
        const container = term?.querySelector('#terminal-container');
        return container?.textContent || term?.textContent || '';
      });

      console.log('Terminal content:', terminalContent);

      // Continue with test even if prompt detection fails - terminal might still be working
      if (terminalContent.length > 0) {
        promptAppeared = true;
        console.log('✅ Terminal has content, proceeding...');
      }
    }

    // Step 5: Test terminal input/output if prompt appeared
    if (promptAppeared) {
      console.log('⌨️ Testing terminal input...');

      // Type a simple command
      await page.keyboard.type('echo "TunnelForge Core Test"');
      await page.keyboard.press('Enter');

      // Wait for command output
      try {
        await page.waitForFunction(
          () => {
            const terminal = document.querySelector('vibe-terminal');
            const content = terminal?.textContent || '';
            return content.includes('TunnelForge Core Test');
          },
          { timeout: 10000 }
        );
        console.log('✅ Terminal input/output working!');

        // Step 6: Test real-time interaction
        console.log('🔄 Testing real-time interaction...');
        await page.keyboard.type('pwd');
        await page.keyboard.press('Enter');

        // Wait for pwd output
        await page.waitForFunction(
          () => {
            const terminal = document.querySelector('vibe-terminal');
            const content = terminal?.textContent || '';
            return content.includes('/') && content.match(/\/\w+/);
          },
          { timeout: 8000 }
        );
        console.log('✅ Real-time interaction confirmed!');
      } catch (error) {
        console.log('⚠️ Command output timeout - may indicate WebSocket streaming issue');

        // Check if WebSocket connections are established
        const wsStatus = await page.evaluate(() => {
          const wsConnections = [];
          // Check for WebSocket connections in global scope
          if ((window as any).webSockets) {
            wsConnections.push('WebSockets found in global scope');
          }
          return {
            connections: wsConnections,
            url: window.location.href,
          };
        });

        console.log('WebSocket status:', wsStatus);

        // This is a critical failure - terminal interaction is the core feature
        throw new Error('Terminal interaction failed - WebSocket streaming not working');
      }
    } else {
      throw new Error('Terminal initialization failed - no shell prompt detected');
    }

    // Step 7: Verify session persistence by navigating away and back
    console.log('🔄 Testing session persistence...');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate back to the session
    await page.goto(`/session/${sessionId}`);
    await page.waitForLoadState('domcontentloaded');

    // Verify terminal content persists
    await page.waitForFunction(
      () => {
        const terminal = document.querySelector('vibe-terminal');
        const content = terminal?.textContent || '';
        return content.includes('TunnelForge Core Test');
      },
      { timeout: 10000 }
    );

    console.log('✅ Session persistence verified!');
    console.log('🎉 Core user journey completed successfully!');
  });

  test('should handle WebSocket connection errors gracefully', async ({ page }) => {
    // Create session normally
    const { sessionId } = await createAndNavigateToSession(page);

    // Wait for terminal
    await page.waitForSelector('vibe-terminal', { state: 'visible', timeout: 15000 });

    // Monitor browser console for WebSocket errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('WebSocket')) {
        consoleErrors.push(msg.text());
      }
    });

    // Try to interact with terminal
    const terminal = page.locator('vibe-terminal').first();
    await terminal.click();

    // Type something
    await page.keyboard.type('echo "connection test"');
    await page.keyboard.press('Enter');

    // Give it time to attempt connection
    await page.waitForTimeout(5000);

    // Check if we got WebSocket errors but application still functions
    if (consoleErrors.length > 0) {
      console.log('WebSocket errors detected:', consoleErrors);

      // Verify the UI still shows the session
      await expect(page.locator('session-header')).toBeVisible();
      await expect(page.locator('vibe-terminal')).toBeVisible();

      console.log('✅ Application handles WebSocket errors gracefully');
    } else {
      console.log('✅ No WebSocket errors detected');
    }
  });
});
