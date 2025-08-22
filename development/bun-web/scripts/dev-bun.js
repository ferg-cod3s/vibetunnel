const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Bun development mode...');

// Validate version sync first
require('child_process').execSync('node scripts/validate-version-sync.js', { stdio: 'inherit' });

// Parse command line arguments using Node's built-in parseArgs
const { parseArgs } = require('util');

const { values } = parseArgs({
  options: {
    port: {
      type: 'string',
    },
    bind: {
      type: 'string',
    },
    'go-server-url': {
      type: 'string',
    },
  },
  allowPositionals: true,
  strict: false,
});

// Set up environment variables
const env = { ...process.env };

if (values.port) {
  env.PORT = values.port;
} else {
  env.PORT = '3001'; // Default port for Bun server
}

if (values.bind) {
  env.HOST = values.bind;
} else {
  env.HOST = '0.0.0.0'; // Default bind
}

if (values['go-server-url']) {
  env.GO_SERVER_URL = values['go-server-url'];
} else {
  env.GO_SERVER_URL = 'http://localhost:4022'; // Default Go server URL
}

console.log(`🚇 Bun server will start on http://${env.HOST}:${env.PORT}`);
console.log(`🔗 Proxying API requests to: ${env.GO_SERVER_URL}`);

// Start the Bun server with hot reload
const bunProcess = spawn('bun', ['run', '--hot', 'src/bun-server.ts'], {
  stdio: 'inherit',
  env,
  cwd: process.cwd(),
});

bunProcess.on('error', (error) => {
  console.error('Failed to start Bun server:', error);
  process.exit(1);
});

bunProcess.on('close', (code) => {
  console.log(`Bun server process exited with code ${code}`);
  process.exit(code);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down Bun server...');
  bunProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\nShutting down Bun server...');
  bunProcess.kill('SIGTERM');
});