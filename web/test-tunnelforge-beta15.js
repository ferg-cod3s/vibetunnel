console.log('Testing TunnelForge beta 15 package...\n');

// Check what's installed
console.log('Package contents:');
console.log('=================');

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const tunnelforgePath = './node_modules/tunnelforge';

try {
  // List files in the package
  const files = await readdir(tunnelforgePath);
  console.log('Files:', files);
  
  // Check package.json
  const packageJson = JSON.parse(await readFile(join(tunnelforgePath, 'package.json'), 'utf-8'));
  console.log('\nPackage version:', packageJson.version);
  console.log('Package bin:', packageJson.bin);
  
  // Check if binary exists
  if (packageJson.bin && packageJson.bin.tunnelforge) {
    const binPath = join(tunnelforgePath, packageJson.bin.tunnelforge);
    console.log('\nBinary path:', binPath);
    
    try {
      await readFile(binPath);
      console.log('✅ Binary file exists');
    } catch (e) {
      console.log('❌ Binary file missing');
    }
  }
  
  // Try to run the server directly
  console.log('\nTrying to run TunnelForge server...');
  try {
    const { default: server } = await import('tunnelforge/dist/server/server.js');
    console.log('✅ Server module loaded successfully');
  } catch (e) {
    console.log('❌ Failed to load server module:', e.message);
  }
  
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}