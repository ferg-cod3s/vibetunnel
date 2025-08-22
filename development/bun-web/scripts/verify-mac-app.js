#!/usr/bin/env node

/**
 * TunnelForge Mac App Quick Verification Script
 * 
 * This script performs a quick smoke test to verify the Mac app is showing
 * everything it's supposed to, including proper branding, theme, and functionality.
 */

async function verifyMacApp() {
  console.log('🔍 TunnelForge Mac App Quick Verification');
  console.log('=========================================');

  const baseURL = 'http://localhost:3001';
  const checks = [];

  try {
    // 1. Basic connectivity
    console.log('\\n1. Testing basic connectivity...');
    const response = await fetch(baseURL);
    if (response.ok) {
      checks.push('✅ Mac app web interface is accessible');
    } else {
      checks.push(`❌ Mac app web interface returned ${response.status}`);
      return { success: false, checks };
    }

    // 2. Check if it's serving TunnelForge content
    const html = await response.text();
    
    if (html.includes('TunnelForge')) {
      checks.push('✅ TunnelForge branding present in HTML');
    } else {
      checks.push('❌ TunnelForge branding missing from HTML');
    }

    if (html.includes('tunnelforge-app')) {
      checks.push('✅ TunnelForge app component found');
    } else {
      checks.push('❌ TunnelForge app component missing');
    }

    // 3. Check for theme CSS
    if (html.includes('tunnelforge-theme.css') || html.includes('--tf-primary-gold')) {
      checks.push('✅ TunnelForge theme CSS detected');
    } else {
      checks.push('⚠️  TunnelForge theme CSS not detected');
    }

    // 4. Check backend servers
    console.log('\\n2. Testing backend servers...');
    
    try {
      const healthResponse = await fetch('http://localhost:4021/health');
      if (healthResponse.ok) {
        checks.push('✅ Go server is running (port 4021)');
      } else {
        checks.push('❌ Go server health check failed');
      }
    } catch (error) {
      checks.push('❌ Go server is not accessible');
    }

    try {
      const sessionsResponse = await fetch(`${baseURL}/api/sessions`);
      if (sessionsResponse.ok) {
        const sessions = await sessionsResponse.json();
        checks.push(`✅ Sessions API working (${sessions.length} sessions)`);
      } else {
        checks.push('❌ Sessions API not working');
      }
    } catch (error) {
      checks.push('❌ Sessions API is not accessible');
    }

    // 5. Check for required static assets
    console.log('\\n3. Testing static assets...');
    
    const assets = [
      { path: '/favicon.ico', name: 'Favicon' },
      { path: '/manifest.json', name: 'Web manifest' },
      { path: '/bundle/styles.css', name: 'Main styles' },
      { path: '/styles/tunnelforge-theme.css', name: 'TunnelForge theme' },
    ];

    for (const asset of assets) {
      try {
        const assetResponse = await fetch(`${baseURL}${asset.path}`);
        if (assetResponse.ok) {
          checks.push(`✅ ${asset.name} loads correctly`);
        } else {
          checks.push(`⚠️  ${asset.name} returned ${assetResponse.status}`);
        }
      } catch (error) {
        checks.push(`❌ ${asset.name} failed to load`);
      }
    }

    // 6. Check manifest for TunnelForge branding
    try {
      const manifestResponse = await fetch(`${baseURL}/manifest.json`);
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        if (manifest.name?.includes('TunnelForge')) {
          checks.push('✅ Web manifest has TunnelForge branding');
        } else {
          checks.push('❌ Web manifest missing TunnelForge branding');
        }
      }
    } catch (error) {
      checks.push('⚠️  Could not verify web manifest');
    }

    return { success: true, checks };

  } catch (error) {
    checks.push(`❌ Verification failed: ${error.message}`);
    return { success: false, checks };
  }
}

async function runFullPlaywrightTest() {
  console.log('\\n🎭 Running comprehensive Playwright tests...');
  console.log('This will test UI functionality, error scenarios, and visual verification.');
  
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const child = spawn('npx', [
      'playwright', 'test',
      '--config=playwright.mac-app.config.ts',
      '--reporter=list'
    ], {
      stdio: 'inherit',
      shell: true,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ All Playwright tests passed!');
      } else {
        console.log(`⚠️  Some Playwright tests failed (exit code: ${code})`);
      }
      resolve(code === 0);
    });
  });
}

async function main() {
  const { success, checks } = await verifyMacApp();
  
  // Print all checks
  console.log('\\n📋 Verification Results:');
  console.log('========================');
  checks.forEach(check => console.log(check));
  
  const successCount = checks.filter(c => c.startsWith('✅')).length;
  const warningCount = checks.filter(c => c.startsWith('⚠️')).length;
  const errorCount = checks.filter(c => c.startsWith('❌')).length;
  
  console.log(`\\n📊 Summary: ${successCount} passed, ${warningCount} warnings, ${errorCount} errors`);
  
  if (success && errorCount === 0) {
    console.log('\\n🎉 Mac app verification successful!');
    
    // Ask if user wants to run full Playwright tests
    console.log('\\nTo run comprehensive UI tests, use:');
    console.log('node scripts/test-mac-app.js');
    console.log('');
    console.log('Or to run just the visual verification tests:');
    console.log('npx playwright test --config=playwright.mac-app.config.ts --grep="Visual Verification"');
    
  } else {
    console.log('\\n❌ Mac app verification found issues!');
    console.log('\\nTroubleshooting:');
    console.log('1. Make sure TunnelForge Mac app is running');
    console.log('2. Check that it opened a browser to localhost:3001');
    console.log('3. Verify both Go server (4021) and Bun server (3001) are running');
    console.log('4. Look for error messages in the Mac app menu or console');
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('TunnelForge Mac App Quick Verification');
  console.log('');
  console.log('Usage: node scripts/verify-mac-app.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('');
  console.log('This script checks:');
  console.log('✓ Mac app web interface accessibility');
  console.log('✓ TunnelForge branding and theming');
  console.log('✓ Backend server connectivity');
  console.log('✓ Static asset loading');
  console.log('✓ API functionality');
  process.exit(0);
}

main();