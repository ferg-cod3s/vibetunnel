const { chromium } = require('playwright');

(async () => {
  console.log('🎭 Starting Playwright debugging...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 
  });
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    console.log(`🖥️  CONSOLE [${type.toUpperCase()}]: ${text}`);
  });
  
  // Capture network requests
  page.on('request', request => {
    console.log(`📤 REQUEST: ${request.method()} ${request.url()}`);
  });
  
  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    const statusIcon = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    console.log(`📥 RESPONSE: ${statusIcon} ${status} ${url}`);
  });
  
  console.log('🌐 Navigating to VibeTunnel...');
  await page.goto('http://192.168.68.58:3002');
  
  console.log('⏱️  Waiting 10 seconds for page to load...');
  await page.waitForTimeout(10000);
  
  // Take screenshot
  console.log('📸 Taking screenshot...');
  await page.screenshot({ path: 'vibetunnel-debug.png', fullPage: true });
  
  // Check for specific error messages
  const bodyText = await page.textContent('body');
  console.log('📄 Page contains "failed to load user information":', bodyText.includes('failed to load user information'));
  console.log('📄 Page contains "johnferguson":', bodyText.includes('johnferguson'));
  
  // Get current authentication state
  const authState = await page.evaluate(() => {
    return {
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      currentUser: window.authClient?.getCurrentUser?.() || null,
      isAuthenticated: window.authClient?.isAuthenticated?.() || false
    };
  });
  
  console.log('🔐 Auth State:', JSON.stringify(authState, null, 2));
  
  // Now test page reload
  console.log('🔄 Testing page reload...');
  await page.reload();
  
  // Wait for page to reload and initialize
  console.log('⏱️  Waiting 5 seconds after reload...');
  await page.waitForTimeout(5000);
  
  // Check for errors after reload
  const bodyTextAfterReload = await page.textContent('body');
  console.log('📄 After reload - Page contains "failed to load user information":', bodyTextAfterReload.includes('failed to load user information'));
  console.log('📄 After reload - Page contains "johnferguson":', bodyTextAfterReload.includes('johnferguson'));
  
  // Get auth state after reload
  const authStateAfterReload = await page.evaluate(() => {
    return {
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      currentUser: window.authClient?.getCurrentUser?.() || null,
      isAuthenticated: window.authClient?.isAuthenticated?.() || false
    };
  });
  
  console.log('🔐 Auth State after reload:', JSON.stringify(authStateAfterReload, null, 2));
  
  console.log('✅ Debug complete. Check vibetunnel-debug.png for screenshot');
  
  await browser.close();
})().catch(error => {
  console.error('❌ Playwright error:', error);
});