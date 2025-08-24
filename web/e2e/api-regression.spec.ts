import { test, expect } from '@playwright/test';

/**
 * API Regression Tests - Validates API endpoints between Go/Bun and Node.js versions
 */

const BUN_SERVER = 'http://localhost:3003';
const GO_SERVER = 'http://localhost:4024';

test.describe('API Regression Tests', () => {
  test.describe('Session Management API', () => {
    test('should create session with valid JSON', async ({ request }) => {
      const sessionData = {
        command: 'bash',
        cwd: '/tmp',
        cols: 80,
        rows: 24
      };

      // Test direct Go server
      const goResponse = await request.post(`${GO_SERVER}/api/sessions`, {
        data: sessionData
      });
      
      expect(goResponse.status()).toBe(201);
      const goSession = await goResponse.json();
      expect(goSession).toHaveProperty('id');
      expect(goSession.command).toBe('bash');
      expect(goSession.cwd).toBe('/tmp');

      // Test Bun proxy
      const bunResponse = await request.post(`${BUN_SERVER}/api/sessions`, {
        data: sessionData
      });
      
      expect(bunResponse.status()).toBe(201);
      const bunSession = await bunResponse.json();
      expect(bunSession).toHaveProperty('id');
      expect(bunSession.command).toBe('bash');
      expect(bunSession.cwd).toBe('/tmp');

      // Structure should be identical
      expect(Object.keys(goSession).sort()).toEqual(Object.keys(bunSession).sort());
    });

    test('should handle invalid JSON gracefully', async ({ request }) => {
      const invalidData = {
        command: '',  // Empty command should be invalid
        cwd: '/nonexistent'
      };

      // Test Go server
      const goResponse = await request.post(`${GO_SERVER}/api/sessions`, {
        data: invalidData
      });
      expect(goResponse.status()).toBeGreaterThanOrEqual(400);

      // Test Bun proxy
      const bunResponse = await request.post(`${BUN_SERVER}/api/sessions`, {
        data: invalidData
      });
      expect(bunResponse.status()).toBeGreaterThanOrEqual(400);
    });

    test('should handle malformed JSON body', async ({ request }) => {
      // Test with completely invalid JSON
      const goResponse = await request.post(`${GO_SERVER}/api/sessions`, {
        data: 'invalid json{',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(goResponse.status()).toBe(400);

      const bunResponse = await request.post(`${BUN_SERVER}/api/sessions`, {
        data: 'invalid json{',
        headers: { 'Content-Type': 'application/json' }
      });
      expect(bunResponse.status()).toBe(400);
    });

    test('should handle missing Content-Type header', async ({ request }) => {
      const sessionData = JSON.stringify({
        command: 'bash',
        cwd: '/tmp'
      });

      // Test without Content-Type header
      const goResponse = await request.post(`${GO_SERVER}/api/sessions`, {
        data: sessionData,
        headers: {} // No Content-Type
      });

      const bunResponse = await request.post(`${BUN_SERVER}/api/sessions`, {
        data: sessionData,
        headers: {} // No Content-Type
      });

      // Both should handle this consistently
      expect(goResponse.status()).toBe(bunResponse.status());
    });
  });

  test.describe('Authentication API', () => {
    test('auth config should be identical', async ({ request }) => {
      const goResponse = await request.get(`${GO_SERVER}/api/auth/config`);
      const bunResponse = await request.get(`${BUN_SERVER}/api/auth/config`);

      expect(goResponse.status()).toBe(200);
      expect(bunResponse.status()).toBe(200);

      const goConfig = await goResponse.json();
      const bunConfig = await bunResponse.json();

      // Should have identical structure and values
      expect(goConfig).toEqual(bunConfig);
    });

    test('invalid login should behave identically', async ({ request }) => {
      const invalidCreds = { password: 'wrong_password' };

      const goResponse = await request.post(`${GO_SERVER}/api/auth/login`, {
        data: invalidCreds
      });
      const bunResponse = await request.post(`${BUN_SERVER}/api/auth/login`, {
        data: invalidCreds
      });

      expect(goResponse.status()).toBe(401);
      expect(bunResponse.status()).toBe(401);

      const goError = await goResponse.json();
      const bunError = await bunResponse.json();
      expect(goError).toEqual(bunError);
    });
  });

  test.describe('Health and Status API', () => {
    test('health endpoints should respond correctly', async ({ request }) => {
      // Go server health
      const goHealth = await request.get(`${GO_SERVER}/health`);
      expect(goHealth.status()).toBe(200);
      
      const goHealthData = await goHealth.json();
      expect(goHealthData).toHaveProperty('status', 'ok');
      expect(goHealthData).toHaveProperty('uptime');

      // Bun server health (serves HTML)
      const bunHealth = await request.get(`${BUN_SERVER}/health`);
      expect(bunHealth.status()).toBe(200);
    });

    test('server status endpoint', async ({ request }) => {
      const goStatus = await request.get(`${GO_SERVER}/api/server/status`);
      const bunStatus = await request.get(`${BUN_SERVER}/api/server/status`);

      expect(goStatus.status()).toBe(200);
      expect(bunStatus.status()).toBe(200);

      // Should proxy to same Go server, so data should be identical
      const goData = await goStatus.json();
      const bunData = await bunStatus.json();
      expect(goData).toEqual(bunData);
    });
  });

  test.describe('Error Handling', () => {
    test('404 endpoints should behave similarly', async ({ request }) => {
      const goResponse = await request.get(`${GO_SERVER}/api/nonexistent`);
      const bunResponse = await request.get(`${BUN_SERVER}/api/nonexistent`);

      expect(goResponse.status()).toBe(404);
      expect(bunResponse.status()).toBe(404);
    });

    test('unsupported methods should be handled consistently', async ({ request }) => {
      const goResponse = await request.patch(`${GO_SERVER}/api/sessions`);
      const bunResponse = await request.patch(`${BUN_SERVER}/api/sessions`);

      // Both should reject unsupported methods similarly
      expect(goResponse.status()).toBeGreaterThanOrEqual(400);
      expect(bunResponse.status()).toBeGreaterThanOrEqual(400);
    });
  });

  test.describe('CORS and Headers', () => {
    test('CORS headers should be present', async ({ request }) => {
      const response = await request.options(`${BUN_SERVER}/api/sessions`, {
        headers: { 'Origin': 'http://example.com' }
      });

      expect(response.status()).toBe(200);
      expect(response.headers()['access-control-allow-origin']).toBe('*');
      expect(response.headers()['access-control-allow-methods']).toContain('POST');
    });

    test('proxy should maintain essential headers', async ({ request }) => {
      const bunResponse = await request.get(`${BUN_SERVER}/api/sessions`);
      
      expect(bunResponse.status()).toBe(200);
      expect(bunResponse.headers()['access-control-allow-origin']).toBe('*');
      expect(bunResponse.headers()['content-type']).toContain('application/json');
    });
  });

  test.describe('Push Notification API', () => {
    test('VAPID key should be accessible', async ({ request }) => {
      const goResponse = await request.get(`${GO_SERVER}/api/push/vapid-public-key`);
      const bunResponse = await request.get(`${BUN_SERVER}/api/push/vapid-public-key`);

      expect(goResponse.status()).toBe(200);
      expect(bunResponse.status()).toBe(200);

      const goKey = await goResponse.json();
      const bunKey = await bunResponse.json();
      
      expect(goKey).toHaveProperty('publicKey');
      expect(bunKey).toHaveProperty('publicKey');
      expect(goKey.publicKey).toBe(bunKey.publicKey); // Should be same key
    });

    test('push subscribe should require auth', async ({ request }) => {
      const invalidSubscription = { endpoint: 'test' };

      const goResponse = await request.post(`${GO_SERVER}/api/push/subscribe`, {
        data: invalidSubscription
      });
      const bunResponse = await request.post(`${BUN_SERVER}/api/push/subscribe`, {
        data: invalidSubscription
      });

      expect(goResponse.status()).toBe(401);
      expect(bunResponse.status()).toBe(401);
    });
  });
});