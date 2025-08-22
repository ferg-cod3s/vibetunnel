/**
 * Test configuration for Playwright tests
 */

export const testConfig = {
  // Port for the test server - use environment variable or default
  get port() {
    if (process.env.VIBETUNNEL_URL) {
      const url = new URL(process.env.VIBETUNNEL_URL);
      return Number.parseInt(url.port) || 3000;
    }
    return 4022; // fallback for standalone tests
  },

  // Base URL from environment variable or constructed from port
  get baseURL() {
    return process.env.VIBETUNNEL_URL || `http://localhost:${this.port}`;
  },

  // Timeouts - Optimized for faster test execution
  defaultTimeout: 5000, // 5 seconds for default operations
  navigationTimeout: 5000, // 5 seconds for page navigation
  actionTimeout: 2000, // 2 seconds for UI actions

  // Session defaults
  defaultSessionName: 'Test Session',
  hideExitedSessions: true,
};
