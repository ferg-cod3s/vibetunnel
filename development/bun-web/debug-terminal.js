#!/usr/bin/env node

/**
 * TunnelForge Terminal Debug Script
 * 
 * This script helps debug terminal connection issues by testing the API endpoints
 * and connection flow step by step.
 */

const GO_SERVER_URL = process.env.GO_SERVER_URL || 'http://localhost:4021';

async function debugTerminalConnection() {
  console.log('🔍 TunnelForge Terminal Debug');
  console.log('================================');
  
  try {
    // Step 1: Check if Go server is running
    console.log('\n1. Testing Go server connection...');
    const healthResponse = await fetch(`${GO_SERVER_URL}/health`);
    if (healthResponse.ok) {
      console.log('✅ Go server is running');
    } else {
      console.log('❌ Go server health check failed:', healthResponse.status);
      return;
    }
    
    // Step 2: Check auth configuration
    console.log('\n2. Checking auth configuration...');
    try {
      const authResponse = await fetch(`${GO_SERVER_URL}/api/auth/config`);
      if (authResponse.ok) {
        const authConfig = await authResponse.json();
        console.log('✅ Auth config:', authConfig);
      } else {
        console.log('⚠️  Auth config not available (might be expected)');
      }
    } catch (error) {
      console.log('⚠️  Auth config check failed:', error.message);
    }
    
    // Step 3: List existing sessions
    console.log('\n3. Listing existing sessions...');
    const sessionsResponse = await fetch(`${GO_SERVER_URL}/api/sessions`);
    if (sessionsResponse.ok) {
      const sessions = await sessionsResponse.json();
      console.log(`✅ Found ${sessions.length} sessions`);
      
      if (sessions.length > 0) {
        console.log('Sessions:');
        sessions.forEach((session, index) => {
          console.log(`  ${index + 1}. ${session.id} - ${session.status} - ${session.name || session.command?.join(' ') || 'Unknown'}`);
        });
        
        // Step 4: Test stream connection for first session
        const testSession = sessions[0];
        console.log(`\n4. Testing stream connection for session ${testSession.id}...`);
        
        try {
          const streamUrl = `${GO_SERVER_URL}/api/sessions/${testSession.id}/stream`;
          console.log(`Stream URL: ${streamUrl}`);
          
          // Note: We can't easily test SSE from Node.js, but we can check if the endpoint exists
          const streamResponse = await fetch(streamUrl, { method: 'HEAD' });
          console.log(`Stream endpoint status: ${streamResponse.status}`);
          
          if (streamResponse.status === 200) {
            console.log('✅ Stream endpoint is accessible');
          } else {
            console.log('❌ Stream endpoint returned error:', streamResponse.status);
          }
        } catch (error) {
          console.log('❌ Stream connection test failed:', error.message);
        }
      } else {
        console.log('ℹ️  No sessions found. Try creating a session first.');
      }
    } else {
      console.log('❌ Failed to list sessions:', sessionsResponse.status);
    }
    
    // Step 5: Test session creation
    console.log('\n5. Testing session creation...');
    try {
      const createResponse = await fetch(`${GO_SERVER_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: ['echo', 'TunnelForge debug test'],
          workingDir: process.cwd(),
          sessionType: 'command'
        })
      });
      
      if (createResponse.ok) {
        const newSession = await createResponse.json();
        console.log('✅ Session creation works. New session:', newSession.sessionId);
        
        // Clean up test session
        try {
          await fetch(`${GO_SERVER_URL}/api/sessions/${newSession.sessionId}`, { method: 'DELETE' });
          console.log('🧹 Cleaned up test session');
        } catch (cleanupError) {
          console.log('⚠️  Failed to cleanup test session:', cleanupError.message);
        }
      } else {
        console.log('❌ Session creation failed:', createResponse.status);
        const error = await createResponse.text();
        console.log('Error details:', error);
      }
    } catch (error) {
      console.log('❌ Session creation test failed:', error.message);
    }
    
  } catch (error) {
    console.log('❌ Debug script failed:', error.message);
  }
  
  console.log('\n🏁 Debug complete');
  console.log('\nNext steps:');
  console.log('1. Check browser console for JavaScript errors');
  console.log('2. Check browser Network tab for failed requests');
  console.log('3. Verify session appears in session list before clicking');
  console.log('4. Check if terminal container renders but stays empty');
}

debugTerminalConnection();