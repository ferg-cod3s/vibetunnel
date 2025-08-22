import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for TunnelForge Mac App Testing
 * 
 * This config tests the actual TunnelForge Mac app running on localhost:3001
 * instead of starting its own test server. Use this when the Mac app is running.
 */
export default defineConfig({
  testDir: './src/test/playwright',
  
  /* Test only the Mac app integration spec */
  testMatch: '**/tunnelforge-mac-app.spec.ts',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry failed tests */
  retries: process.env.CI ? 2 : 1,
  
  /* Use multiple workers for better performance when Mac app can handle it */
  workers: process.env.CI ? 2 : 1,
  
  /* Longer timeout for Mac app integration tests */
  timeout: 30 * 1000, // 30 seconds
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'mac-app-test-results.json' }],
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL points to TunnelForge Mac app */
    baseURL: 'http://localhost:3001',

    /* Collect trace when retrying failed tests */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Capture video on failure for debugging */
    video: 'retain-on-failure',

    /* Longer timeouts for Mac app tests */
    actionTimeout: 10000, // 10 seconds
    navigationTimeout: 15000, // 15 seconds

    /* Run in headed mode to see what's happening */
    headless: false,

    /* Larger viewport for better terminal visibility */
    viewport: { width: 1440, height: 900 },

    /* Ignore HTTPS errors */
    ignoreHTTPSErrors: true,

    /* Browser launch options optimized for Mac app testing */
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      slowMo: process.env.CI ? 0 : 100, // Slow down locally for better visibility
    },
  },

  /* Configure projects for testing */
  projects: [
    {
      name: 'tunnelforge-mac-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tunnelforge-mac-safari',
      use: { ...devices['Desktop Safari'] },
      // Only run Safari tests if explicitly requested
      testIgnore: process.env.TEST_SAFARI ? [] : ['**/*'],
    },
  ],

  /* No webServer config - we expect TunnelForge Mac app to be running */
});