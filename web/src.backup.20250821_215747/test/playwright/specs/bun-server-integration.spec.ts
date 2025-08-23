import { expect, test } from '../fixtures/test.fixture.ts';
import { TestSessionTracker } from '../helpers/test-session-tracker.ts';

test.describe('Bun Server Integration', () => {
  let sessionTracker: TestSessionTracker;

  test.beforeEach(async ({ page }) => {
    sessionTracker = new TestSessionTracker();

    // Navigate to the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for authentication to complete
    await expect(page.getByText('Create New Session')).toBeVisible();
  });

  test.afterEach(async () => {
    await sessionTracker.cleanup();
  });

  test('should serve static files correctly', async ({ page }) => {
    // Check that main CSS is loaded
    const cssResponse = await page.goto('/bundle/styles.css');
    expect(cssResponse?.status()).toBe(200);

    // Check that main JS bundle is loaded
    const jsResponse = await page.goto('/bundle/client-bundle.js');
    expect(jsResponse?.status()).toBe(200);

    // Check that fonts are loaded
    const fontResponse = await page.goto('/fonts/HackNerdFontMono-Regular.ttf');
    expect(fontResponse?.status()).toBe(200);

    // Navigate back to main page
    await page.goto('/');
  });

  test('should proxy API requests to Go server', async ({ page }) => {
    await page.goto('/');

    // Wait for page to load and check that API requests work
    const response = page.waitForResponse('/api/config');
    await page.reload();
    const configResponse = await response;

    expect(configResponse.status()).toBe(200);

    // Check that sessions API works
    const sessionsResponse = await page.request.get('/api/sessions');
    expect(sessionsResponse.status()).toBe(200);

    const sessions = await sessionsResponse.json();
    expect(Array.isArray(sessions)).toBe(true);
  });

  test('should handle VAPID public key endpoint', async ({ page }) => {
    await page.goto('/');

    // Test the corrected VAPID endpoint
    const vapidResponse = await page.request.get('/api/push/vapid-public-key');
    expect(vapidResponse.status()).toBe(200);

    const vapidData = await vapidResponse.json();
    expect(vapidData).toHaveProperty('publicKey');
  });

  test('should establish WebSocket connection for buffers', async ({ page }) => {
    await page.goto('/');

    // Monitor WebSocket connections
    const wsConnections: any[] = [];
    page.on('websocket', (ws) => {
      wsConnections.push({
        url: ws.url(),
        isClosed: false,
      });

      ws.on('close', () => {
        const connection = wsConnections.find((conn) => conn.url === ws.url());
        if (connection) {
          connection.isClosed = true;
        }
      });
    });

    // Wait for buffer subscription service to attempt connection
    await page.waitForTimeout(2000);

    // Check that WebSocket connection was attempted
    const bufferWsConnection = wsConnections.find((ws) => ws.url.includes('/buffers'));

    expect(bufferWsConnection).toBeTruthy();
    expect(bufferWsConnection?.url).toContain('ws://localhost:3001/buffers');

    // Create a session to test WebSocket functionality
    await page.getByRole('button', { name: 'Create New Session' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill out the form
    await page.getByPlaceholder('My Session').fill('Bun WebSocket Test');
    await page.getByPlaceholder('zsh').fill('echo "WebSocket test"');

    // Create the session
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for session creation and WebSocket connection
    await page.waitForTimeout(3000);

    // Track this session for cleanup
    const sessionCards = page.locator('[data-testid="session-card"]');
    const sessionCount = await sessionCards.count();

    if (sessionCount > 0) {
      const sessionCard = sessionCards.first();
      const sessionTitle = await sessionCard.getByRole('heading').textContent();
      if (sessionTitle) {
        sessionTracker.addSession(sessionTitle.trim());
      }
    }
  });

  test('should handle Server-Sent Events for notifications', async ({ page }) => {
    await page.goto('/');

    // Monitor network requests for SSE connections
    const sseRequests: any[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/events') || request.url().includes('/api/control/stream')) {
        sseRequests.push({
          url: request.url(),
          headers: request.headers(),
        });
      }
    });

    // Wait for SSE connections to be attempted
    await page.waitForTimeout(3000);

    // Check that SSE requests were made
    const eventsRequest = sseRequests.find((req) => req.url.includes('/api/events'));

    const controlRequest = sseRequests.find((req) => req.url.includes('/api/control/stream'));

    expect(eventsRequest).toBeTruthy();
    expect(controlRequest).toBeTruthy();

    // Verify the requests have proper headers for SSE
    if (eventsRequest) {
      // The browser should set Accept header for EventSource
      expect(eventsRequest.headers['accept'] || eventsRequest.headers['Accept']).toContain(
        'text/event-stream'
      );
    }
  });

  test('should create and manage sessions through Bun proxy', async ({ page }) => {
    await page.goto('/');

    // Create a session
    await page.getByRole('button', { name: 'Create New Session' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const sessionName = 'Bun Proxy Test Session';
    await page.getByPlaceholder('My Session').fill(sessionName);
    await page.getByPlaceholder('zsh').fill('echo "Hello from Bun proxy"');

    await page.getByRole('button', { name: 'Create' }).click();

    // Wait for session creation
    await page.waitForTimeout(2000);

    // Verify session appears in the list
    await expect(page.getByText(sessionName)).toBeVisible();

    // Track session for cleanup
    sessionTracker.addSession(sessionName);

    // Test session interaction by clicking on it
    await page.getByText(sessionName).click();

    // Wait for session view to load
    await page.waitForTimeout(1000);

    // The session view should be visible (even if WebSocket connection is still establishing)
    await expect(
      page.locator('.terminal-container, .session-view, [data-testid="session-view"]')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should handle authentication config through proxy', async ({ page }) => {
    await page.goto('/');

    // Test auth config endpoint
    const authResponse = await page.request.get('/api/auth/config');
    expect(authResponse.status()).toBe(200);

    const authConfig = await authResponse.json();
    expect(authConfig).toHaveProperty('noAuth');
    expect(authConfig.noAuth).toBe(true); // Should be true in development

    // Test current user endpoint
    const userResponse = await page.request.get('/api/auth/current-user');
    expect(userResponse.status()).toBe(200);

    const userData = await userResponse.json();
    expect(userData).toHaveProperty('username');
  });

  test('should proxy file operations correctly', async ({ page }) => {
    await page.goto('/');

    // Test that the file browser can be opened (tests file API proxy)
    await page.getByRole('button', { name: 'Browse Files' }).click();

    // Wait for file browser modal or component
    await page.waitForTimeout(1000);

    // The file browser should attempt to load directory contents
    // This tests that filesystem API calls are properly proxied
    const modalVisible = await page.locator('dialog, .modal, .file-browser').isVisible();
    expect(modalVisible).toBe(true);
  });
});
