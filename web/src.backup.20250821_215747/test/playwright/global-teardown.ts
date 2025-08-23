import { chromium, type FullConfig } from '@playwright/test';
import { testConfig } from './test-config';

async function globalTeardown(_config: FullConfig) {
  // End performance tracking
  console.timeEnd('Total test duration');

  // Aggressive cleanup of test sessions to prevent resource exhaustion
  console.log('Starting final session cleanup...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(testConfig.baseURL, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });

    // Get all sessions
    const sessions = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/sessions');
        if (!response.ok) return [];
        return response.json();
      } catch {
        return [];
      }
    });

    // Clean up test sessions (be aggressive with cleanup patterns)
    const testSessionPatterns = [
      /^test-/i,
      /^nav-test/i,
      /^keyboard-test/i,
      /^sesscreate-/i,
      /^actmon-/i,
      /^termint-/i,
      /^uifeat-/i,
      /^terminal-test$/i,
      /^custom-\d+/i,
      /^multi-test/i,
      /^basic-test/i,
      /^history-test/i,
      /^tab-completion/i,
      /^file-browser/i,
      /^quick-start/i,
      /^notification/i,
    ];

    const testSessions = sessions.filter((s: any) =>
      testSessionPatterns.some((pattern) => pattern.test(s.name || ''))
    );

    if (testSessions.length > 0) {
      console.log(`Cleaning up ${testSessions.length} test sessions in global teardown`);

      // Delete test sessions in parallel
      await page.evaluate(
        async (sessionIds) => {
          const promises = sessionIds.map((id: string) =>
            fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {
              // Ignore individual failures
            })
          );
          await Promise.all(promises);
        },
        testSessions.map((s: any) => s.id)
      );

      console.log(`Cleanup completed: ${testSessions.length} test sessions removed`);
    } else {
      console.log('No test sessions found to clean up');
    }
  } catch (error) {
    console.warn('Failed to perform final session cleanup:', error);
  } finally {
    await browser.close();
  }

  console.log('Global teardown complete');
}

export default globalTeardown;
