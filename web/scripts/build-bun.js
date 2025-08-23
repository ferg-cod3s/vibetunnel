const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function buildBun() {
  console.log('Starting Bun build process...');
  
  // Validate version sync
  console.log('Validating version sync...');
  execSync('node scripts/validate-version-sync.js', { stdio: 'inherit' });

  // Ensure directories exist
  console.log('Creating directories...');
  execSync('node scripts/ensure-dirs.js', { stdio: 'inherit' });

  // Copy assets
  console.log('Copying assets...');
  execSync('node scripts/copy-assets.js', { stdio: 'inherit' });

  // Build CSS
  console.log('Building CSS...');
  execSync('pnpm exec postcss ./src/client/styles.css -o ./public/bundle/styles.css', { stdio: 'inherit' });

  // Bundle client JavaScript using Bun's bundler
  console.log('Bundling client JavaScript with Bun...');
  
  // Build main app bundle
  execSync('bun build src/client/app-entry.ts --outfile=public/bundle/client-bundle.js --format=esm --minify', { stdio: 'inherit' });
  
  // Build test bundle
  execSync('bun build src/client/test-entry.ts --outfile=public/bundle/test.js --format=esm --minify', { stdio: 'inherit' });
  
  // Build service worker
  execSync('bun build src/client/sw.ts --outfile=public/sw.js --format=iife --minify', { stdio: 'inherit' });

  console.log('Client bundles built successfully with Bun');

  // Build server TypeScript
  console.log('Building server...');
  execSync('npx tsc -p tsconfig.server.json', { stdio: 'inherit' });

  // Build native executable using Bun
  console.log('Building native Bun executable...');

  // Create native directory
  if (!fs.existsSync('native')) {
    fs.mkdirSync('native');
  }

  // Check for --custom-node flag (not applicable for Bun, but keep for compatibility)
  const useCustomNode = process.argv.includes('--custom-node');
  if (useCustomNode) {
    console.log('Note: --custom-node flag ignored for Bun builds');
  }

  // Use Bun's native bundler to create executable
  execSync('node build-native-bun.js', { stdio: 'inherit' });

  console.log('Bun build completed successfully!');
}

// Run the build
buildBun().catch(error => {
  console.error('Bun build failed:', error);
  process.exit(1);
});
