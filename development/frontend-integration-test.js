#!/usr/bin/env node

/**
 * TunnelForge Frontend Integration Test
 * Tests the web frontend against the Go backend server
 */

const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

// Configuration
const GO_SERVER_PORT = 4021;
const BUN_WEB_PORT = 3000;
const TEST_TIMEOUT = 30000;

// Test results tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Server processes
let goServerProcess = null;
let bunWebProcess = null;

// Cleanup function
const cleanup = () => {
    console.log('\n🧹 Cleaning up processes...');
    
    if (goServerProcess) {
        goServerProcess.kill();
        goServerProcess = null;
    }
    
    if (bunWebProcess) {
        bunWebProcess.kill();
        bunWebProcess = null;
    }
    
    // Kill any remaining processes
    try {
        spawn('pkill', ['-f', 'tunnelforge-server'], { stdio: 'ignore' });
        spawn('pkill', ['-f', 'bun run dev'], { stdio: 'ignore' });
    } catch (e) {
        // Ignore errors
    }
};

// Set up cleanup handlers
process.on('exit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Utility functions
const log = (message, type = 'info') => {
    const timestamp = new Date().toISOString();
    const colors = {
        info: '\x1b[34m',
        success: '\x1b[32m',
        error: '\x1b[31m',
        warning: '\x1b[33m',
        reset: '\x1b[0m'
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
};

const makeRequest = (options) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.abort();
            reject(new Error('Request timeout'));
        });
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
};

const waitForServer = async (port, name, maxAttempts = 30) => {
    log(`Waiting for ${name} on port ${port}...`, 'info');
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await makeRequest({
                hostname: 'localhost',
                port: port,
                path: '/health',
                method: 'GET'
            });
            
            log(`${name} is ready!`, 'success');
            return true;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`${name} failed to start within ${maxAttempts} seconds`);
};

const runTest = async (testName, testFn) => {
    testsRun++;
    log(`Running test: ${testName}`, 'info');
    
    try {
        await testFn();
        testsPassed++;
        log(`✓ ${testName}`, 'success');
        return true;
    } catch (error) {
        testsFailed++;
        log(`✗ ${testName}: ${error.message}`, 'error');
        return false;
    }
};

// Test functions
const testHealthEndpoints = async () => {
    // Test Go server health
    const goHealthResponse = await makeRequest({
        hostname: 'localhost',
        port: GO_SERVER_PORT,
        path: '/health',
        method: 'GET'
    });
    
    if (goHealthResponse.statusCode !== 200) {
        throw new Error(`Go server health returned ${goHealthResponse.statusCode}`);
    }
    
    const goHealthData = JSON.parse(goHealthResponse.body);
    if (goHealthData.status !== 'ok') {
        throw new Error('Go server health status not ok');
    }
    
    // Test Bun web proxy health
    const bunHealthResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/api/health',
        method: 'GET'
    });
    
    if (bunHealthResponse.statusCode !== 200) {
        throw new Error(`Bun web proxy health returned ${bunHealthResponse.statusCode}`);
    }
};

const testStaticAssets = async () => {
    // Test that static assets are served by Bun web server
    const indexResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/',
        method: 'GET'
    });
    
    if (indexResponse.statusCode !== 200) {
        throw new Error(`Index page returned ${indexResponse.statusCode}`);
    }
    
    if (!indexResponse.body.includes('<html')) {
        throw new Error('Index page does not contain HTML');
    }
    
    // Test CSS asset
    const cssResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/bundle/styles.css',
        method: 'GET'
    });
    
    if (cssResponse.statusCode !== 200) {
        throw new Error(`CSS asset returned ${cssResponse.statusCode}`);
    }
    
    // Test JS bundle
    const jsResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/bundle/client-bundle.js',
        method: 'GET'
    });
    
    if (jsResponse.statusCode !== 200) {
        throw new Error(`JS bundle returned ${jsResponse.statusCode}`);
    }
};

const testApiProxy = async () => {
    // Test that API requests are properly proxied to Go server
    const configResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/api/config',
        method: 'GET'
    });
    
    if (configResponse.statusCode !== 200) {
        throw new Error(`API proxy config returned ${configResponse.statusCode}`);
    }
    
    const configData = JSON.parse(configResponse.body);
    if (!configData.serverName) {
        throw new Error('API proxy did not return expected config data');
    }
    
    // Test sessions endpoint through proxy
    const sessionsResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/api/sessions',
        method: 'GET'
    });
    
    if (sessionsResponse.statusCode !== 200) {
        throw new Error(`API proxy sessions returned ${sessionsResponse.statusCode}`);
    }
};

const testSessionCreation = async () => {
    // Create a test session through the proxy
    const sessionData = {
        title: 'Frontend Integration Test',
        command: 'echo "Hello from integration test"',
        cols: 80,
        rows: 24
    };
    
    const createResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/api/sessions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionData)
    });
    
    if (createResponse.statusCode !== 201) {
        throw new Error(`Session creation returned ${createResponse.statusCode}: ${createResponse.body}`);
    }
    
    const session = JSON.parse(createResponse.body);
    if (!session.id || session.title !== sessionData.title) {
        throw new Error('Session creation did not return expected data');
    }
    
    // Verify session exists
    const getResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: `/api/sessions/${session.id}`,
        method: 'GET'
    });
    
    if (getResponse.statusCode !== 200) {
        throw new Error(`Session retrieval returned ${getResponse.statusCode}`);
    }
    
    // Clean up session
    await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: `/api/sessions/${session.id}`,
        method: 'DELETE'
    });
    
    return session.id;
};

const testWebSocketConnection = async () => {
    return new Promise(async (resolve, reject) => {
        // First create a session
        const sessionData = {
            title: 'WebSocket Test',
            command: 'echo "WebSocket test"',
            cols: 80,
            rows: 24
        };
        
        const createResponse = await makeRequest({
            hostname: 'localhost',
            port: GO_SERVER_PORT,
            path: '/api/sessions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sessionData)
        });
        
        if (createResponse.statusCode !== 201) {
            reject(new Error(`Failed to create session for WebSocket test: ${createResponse.statusCode}`));
            return;
        }
        
        const session = JSON.parse(createResponse.body);
        
        // Test WebSocket connection to Go server
        const ws = new WebSocket(`ws://localhost:${GO_SERVER_PORT}/ws?sessionId=${session.id}`);
        
        let connected = false;
        let receivedData = false;
        
        const timeout = setTimeout(() => {
            ws.close();
            if (!connected) {
                reject(new Error('WebSocket connection timeout'));
            } else {
                reject(new Error('WebSocket data timeout'));
            }
        }, 5000);
        
        ws.on('open', () => {
            connected = true;
            log('WebSocket connected successfully', 'success');
            
            // Send a test command
            ws.send(JSON.stringify({
                type: 'input',
                data: 'echo "WebSocket test successful"\n'
            }));
        });
        
        ws.on('message', (data) => {
            receivedData = true;
            log(`WebSocket received: ${data}`, 'info');
            
            clearTimeout(timeout);
            ws.close();
            
            // Clean up session
            makeRequest({
                hostname: 'localhost',
                port: GO_SERVER_PORT,
                path: `/api/sessions/${session.id}`,
                method: 'DELETE'
            }).catch(() => {}); // Ignore cleanup errors
            
            resolve();
        });
        
        ws.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`WebSocket error: ${error.message}`));
        });
        
        ws.on('close', () => {
            if (!receivedData && connected) {
                clearTimeout(timeout);
                reject(new Error('WebSocket closed without receiving data'));
            }
        });
    });
};

const testEventStreaming = async () => {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: BUN_WEB_PORT,
            path: '/api/events',
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`SSE endpoint returned ${res.statusCode}`));
                return;
            }
            
            let receivedEvent = false;
            const timeout = setTimeout(() => {
                req.abort();
                if (!receivedEvent) {
                    reject(new Error('No SSE events received within timeout'));
                }
            }, 5000);
            
            res.on('data', (chunk) => {
                const data = chunk.toString();
                if (data.includes('event:') || data.includes('data:')) {
                    receivedEvent = true;
                    log('SSE event received successfully', 'success');
                    clearTimeout(timeout);
                    req.abort();
                    resolve();
                }
            });
            
            res.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`SSE request error: ${error.message}`));
        });
        
        req.end();
    });
};

const testPushNotificationEndpoints = async () => {
    // Test VAPID key endpoint
    const vapidResponse = await makeRequest({
        hostname: 'localhost',
        port: BUN_WEB_PORT,
        path: '/api/push/vapid-key',
        method: 'GET'
    });
    
    if (vapidResponse.statusCode !== 200) {
        throw new Error(`VAPID key endpoint returned ${vapidResponse.statusCode}`);
    }
    
    const vapidData = JSON.parse(vapidResponse.body);
    if (!vapidData.publicKey) {
        throw new Error('VAPID key endpoint did not return public key');
    }
    
    log(`VAPID public key received: ${vapidData.publicKey.substring(0, 20)}...`, 'info');
};

const startServers = async () => {
    log('Starting Go server...', 'info');
    
    // Start Go server
    goServerProcess = spawn('go', ['run', 'cmd/server/main.go', `--port=${GO_SERVER_PORT}`], {
        cwd: './go-server',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    goServerProcess.stdout.on('data', (data) => {
        if (process.env.DEBUG) {
            log(`Go Server: ${data.toString().trim()}`, 'info');
        }
    });
    
    goServerProcess.stderr.on('data', (data) => {
        if (process.env.DEBUG) {
            log(`Go Server Error: ${data.toString().trim()}`, 'warning');
        }
    });
    
    // Start Bun web server
    log('Starting Bun web server...', 'info');
    
    bunWebProcess = spawn('bun', ['run', 'dev'], {
        cwd: './bun-web',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PORT: BUN_WEB_PORT.toString(),
            GO_SERVER_URL: `http://localhost:${GO_SERVER_PORT}`
        }
    });
    
    bunWebProcess.stdout.on('data', (data) => {
        if (process.env.DEBUG) {
            log(`Bun Server: ${data.toString().trim()}`, 'info');
        }
    });
    
    bunWebProcess.stderr.on('data', (data) => {
        if (process.env.DEBUG) {
            log(`Bun Server Error: ${data.toString().trim()}`, 'warning');
        }
    });
    
    // Wait for servers to be ready
    await waitForServer(GO_SERVER_PORT, 'Go Server');
    await waitForServer(BUN_WEB_PORT, 'Bun Web Server');
    
    // Give servers a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
};

const runAllTests = async () => {
    log('🧪 Running Frontend Integration Tests', 'info');
    log('=====================================', 'info');
    
    await runTest('Health Endpoints', testHealthEndpoints);
    await runTest('Static Assets Serving', testStaticAssets);
    await runTest('API Proxy Functionality', testApiProxy);
    await runTest('Session Creation via Proxy', testSessionCreation);
    await runTest('WebSocket Connection', testWebSocketConnection);
    await runTest('Server-Sent Events', testEventStreaming);
    await runTest('Push Notification Endpoints', testPushNotificationEndpoints);
};

const generateReport = () => {
    log('\n📊 Frontend Integration Test Results', 'info');
    log('====================================', 'info');
    
    const passRate = testsRun > 0 ? Math.round((testsPassed / testsRun) * 100) : 0;
    
    log(`Tests Run: ${testsRun}`, 'info');
    log(`Tests Passed: ${testsPassed}`, testsPassed === testsRun ? 'success' : 'info');
    log(`Tests Failed: ${testsFailed}`, testsFailed > 0 ? 'error' : 'info');
    log(`Pass Rate: ${passRate}%`, passRate >= 90 ? 'success' : passRate >= 70 ? 'warning' : 'error');
    
    if (testsFailed === 0) {
        log('\n🎉 All tests passed! Frontend integration is working perfectly.', 'success');
        log('The Bun web server is successfully proxying to the Go backend.', 'success');
        return true;
    } else {
        log(`\n❌ ${testsFailed} test(s) failed. Integration issues need to be addressed.`, 'error');
        return false;
    }
};

// Main execution
const main = async () => {
    try {
        await startServers();
        await runAllTests();
        const success = generateReport();
        
        process.exit(success ? 0 : 1);
        
    } catch (error) {
        log(`Fatal error: ${error.message}`, 'error');
        process.exit(1);
    }
};

// Handle WebSocket dependency
try {
    require.resolve('ws');
} catch (e) {
    log('Installing WebSocket dependency...', 'warning');
    const installWs = spawn('npm', ['install', 'ws'], { stdio: 'inherit' });
    installWs.on('close', (code) => {
        if (code === 0) {
            main();
        } else {
            log('Failed to install WebSocket dependency', 'error');
            process.exit(1);
        }
    });
    return;
}

main();