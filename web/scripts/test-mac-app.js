#!/usr/bin/env node

/**
 * TunnelForge Mac App Test Script
 * 
 * This script runs Playwright tests against the TunnelForge Mac app.
 * It verifies that the Mac app is running before starting tests.
 */

const { spawn } = require('child_process');
const { createRequire } = require('module');

const require = createRequire(import.meta.url);

async function checkMacAppRunning() {
  console.log('🔍 Checking if TunnelForge Mac app is running...');
  
  try {
    const response = await fetch('http://localhost:3001');
    if (response.ok) {
      console.log('✅ TunnelForge Mac app is running on localhost:3001');
      return true;
    }
  } catch (error) {
    console.log('❌ TunnelForge Mac app is not running on localhost:3001');
    console.log('');
    console.log('Please start the TunnelForge Mac app first:');
    console.log('1. Build the app: cd ../mac && xcodebuild -scheme TunnelForge -configuration Debug');
    console.log('2. Open the app: open /path/to/TunnelForge.app');
    console.log('3. Wait for it to start the servers');
    console.log('4. Re-run this test script');
    return false;
  }
}

async function checkBackendServers() {
  console.log('🔍 Checking backend servers...');
  
  try {
    // Check Go server
    const goResponse = await fetch('http://localhost:4021/health');
    if (goResponse.ok) {
      console.log('✅ Go server is running on localhost:4021');
    } else {
      console.log('⚠️  Go server responded with status:', goResponse.status);
    }
    
    // Check sessions API through Bun proxy
    const sessionsResponse = await fetch('http://localhost:3001/api/sessions');
    if (sessionsResponse.ok) {
      const sessions = await sessionsResponse.json();
      console.log(`✅ Sessions API working - found ${sessions.length} sessions`);
    } else {
      console.log('⚠️  Sessions API responded with status:', sessionsResponse.status);
    }
    
    return true;
  } catch (error) {
    console.log('❌ Backend servers check failed:', error.message);
    return false;
  }
}

async function runPlaywrightTests() {
  console.log('🎭 Running Playwright tests for TunnelForge Mac app...');
  
  const args = [
    'npx',
    'playwright',
    'test',
    '--config=playwright.mac-app.config.ts',
    ...process.argv.slice(2), // Pass through any additional arguments
  ];
  
  const child = spawn('node', args, {
    stdio: 'inherit',
    shell: true,
  });
  
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ All tests passed!');
        resolve(code);
      } else {
        console.log(`❌ Tests failed with exit code ${code}`);
        reject(new Error(`Tests failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      console.error('❌ Failed to run tests:', error);
      reject(error);
    });
  });
}

async function main() {
  console.log('🍎 TunnelForge Mac App Test Runner');
  console.log('==================================');
  
  try {
    // Check if Mac app is running
    const macAppRunning = await checkMacAppRunning();
    if (!macAppRunning) {
      process.exit(1);
    }
    
    // Check backend servers
    const serversRunning = await checkBackendServers();
    if (!serversRunning) {
      console.log('⚠️  Some backend checks failed, but continuing with tests...');
    }
    
    // Run the tests
    await runPlaywrightTests();
    
    console.log('');
    console.log('🎉 Mac app testing complete!');
    
  } catch (error) {
    console.error('💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

// Add helpful usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('TunnelForge Mac App Test Runner');
  console.log('');
  console.log('Usage: node scripts/test-mac-app.js [playwright-options]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-mac-app.js                    # Run all Mac app tests');
  console.log('  node scripts/test-mac-app.js --headed           # Run with browser visible');
  console.log('  node scripts/test-mac-app.js --debug            # Run in debug mode');
  console.log('  node scripts/test-mac-app.js --project=chrome   # Run specific browser');
  console.log('');
  console.log('Prerequisites:');
  console.log('1. TunnelForge Mac app must be running');
  console.log('2. App should be serving on localhost:3001');
  console.log('3. Backend servers should be accessible');
  process.exit(0);
}

main();