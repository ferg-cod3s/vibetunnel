import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for TunnelForge Desktop E2E tests
 * 
 * This configuration is designed to test the Tauri desktop application
 * by connecting to the development server or built app.
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:1420', // Default Tauri dev server
    
    /* Global timeout for assertions */
    expect: {
      timeout: 10000, // 10 seconds for desktop app assertions
    },
    
    /* Action timeout (click, fill, etc.) */
    actionTimeout: 15000, // 15 seconds for desktop app actions
    
    /* Navigation timeout */
    navigationTimeout: 30000, // 30 seconds for desktop app navigation
    
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Additional context options for desktop app testing */
    viewport: { width: 1280, height: 800 }, // Default desktop size
    ignoreHTTPSErrors: true, // In case of self-signed certs
  },

  /* Configure projects for major browsers and desktop environments */
  projects: [
    {
      name: 'desktop-chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Desktop-specific settings
        channel: 'chromium',
        launchOptions: {
          // Tauri apps might need specific launch options
          args: [
            '--disable-web-security', // For local file access
            '--allow-running-insecure-content',
            '--disable-features=VizDisplayCompositor', // Reduce GPU usage
          ],
        },
      },
    },
    
    {
      name: 'desktop-firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific settings for desktop testing
      },
    },
    
    {
      name: 'desktop-webkit',
      use: { 
        ...devices['Desktop Safari'],
        // Safari/WebKit settings
      },
    },
    
    // Mobile testing for responsive design
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
      },
    },
    
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
      },
    },
  ],

  /* Global test setup and teardown */
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
  
  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'bun run tauri dev',
    port: 1420,
    timeout: 60000, // 1 minute for Tauri to start
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Test-specific environment variables
      TAURI_ENV: 'test',
      TUNNELFORGE_TEST_MODE: 'true',
      RUST_LOG: 'debug',
    },
  },
  
  /* Output directories */
  outputDir: 'test-results/',
  
  /* Test match patterns */
  testMatch: [
    '**/*.spec.ts',
    '**/*.test.ts',
  ],
  
  /* Test ignore patterns */
  testIgnore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
  ],
  
  /* Timeout for each test */
  timeout: 60000, // 1 minute per test for desktop operations
  
  /* Timeout for expect assertions */
  expect: {
    timeout: 10000, // 10 seconds for assertions
  },
  
  /* Maximum time for the entire test suite */
  globalTimeout: 600000, // 10 minutes total
});
