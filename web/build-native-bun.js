#!/usr/bin/env node

/**
 * Build standalone tunnelforge executable using Bun
 *
 * This script creates a portable executable that bundles the TunnelForge server into a single
 * binary using Bun's built-in bundling and compilation features. The resulting executable can 
 * run on any machine with the same OS/architecture without requiring Node.js or Bun to be installed.
 *
 * ## Output
 * Creates a `native/` directory with these files:
 * - `tunnelforge` - The standalone Bun executable
 * - `pty.node` - Native binding for terminal emulation
 * - `spawn-helper` - Helper binary for spawning processes (macOS only)
 * - `authenticate_pam.node` - PAM authentication module
 *
 * ## Usage
 * ```bash
 * node build-native-bun.js                    # Build with Bun
 * node build-native-bun.js --sourcemap        # Build with inline sourcemaps
 * ```
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const includeSourcemaps = process.argv.includes('--sourcemap');

console.log('Building standalone tunnelforge executable using Bun...');

// Check if Bun is available
try {
  execSync('bun --version', { stdio: 'pipe' });
  const bunVersion = execSync('bun --version', { encoding: 'utf8' }).trim();
  console.log(`Using Bun version: ${bunVersion}`);
} catch (error) {
  console.error('Error: Bun not found. Please install Bun from https://bun.sh/');
  process.exit(1);
}

// Cleanup function
function cleanup() {
  if (fs.existsSync('build') && !process.argv.includes('--keep-build')) {
    console.log('Cleaning up build directory...');
    fs.rmSync('build', { recursive: true, force: true });
  }
}

// Ensure cleanup happens on exit
process.on('exit', cleanup);
process.on('SIGINT', () => {
  console.log('\nBuild interrupted');
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.log('\nBuild terminated');
  process.exit(1);
});

async function main() {
  try {
    console.log('Using Bun for native executable build...');
    
    // Ensure native modules are built
    const nativePtyDir = 'node_modules/node-pty/build/Release';
    const nativeAuthDir = 'node_modules/authenticate-pam/build/Release';
    
    if (!fs.existsSync(nativePtyDir)) {
      console.log('Building node-pty native module...');
      const nodePtyPath = require.resolve('node-pty/package.json');
      const nodePtyDir = path.dirname(nodePtyPath);
      console.log(`Found node-pty at: ${nodePtyDir}`);
      
      execSync(`cd "${nodePtyDir}" && npx node-gyp rebuild`, { 
        stdio: 'inherit',
        shell: true
      });
    }
    
    if (!fs.existsSync(nativeAuthDir)) {
      console.log('Building authenticate-pam native module...');
      execSync('npm rebuild authenticate-pam', { 
        stdio: 'inherit',
        cwd: __dirname
      });
    }
    
    // Create build directory
    if (!fs.existsSync('build')) {
      fs.mkdirSync('build');
    }

    // Create native directory
    if (!fs.existsSync('native')) {
      fs.mkdirSync('native');
    }

    console.log('Using Bun bundler for executable creation...');

    // Bundle the CLI using Bun's bundler targeting bun-server.ts
    console.log('\nBundling with Bun...');
    
    // Use deterministic timestamps based on git commit
    let buildDate = new Date().toISOString();
    let buildTimestamp = Date.now();
    
    try {
      const gitDate = execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim();
      buildDate = gitDate;
      buildTimestamp = new Date(gitDate).getTime();
      console.log(`Using git commit date for reproducible build: ${buildDate}`);
    } catch (e) {
      console.warn('Warning: Using current time for build - output will not be reproducible');
    }

    let gitCommit = 'unknown';
    try {
      gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch (e) {
      // Git commit will remain 'unknown'
    }

    // Create a build entry point that uses the bun-server.ts
    const buildEntryContent = `#!/usr/bin/env bun

// Build-time environment variables
process.env.BUILD_DATE = '${buildDate}';
process.env.BUILD_TIMESTAMP = '${buildTimestamp}';
process.env.GIT_COMMIT = '${gitCommit}';
process.env.TUNNELFORGE_BUN = 'true';

// Import the main CLI entry point
require('../src/cli.ts');
`;

    fs.writeFileSync('build/bun-entry.ts', buildEntryContent);

    // Build the executable using Bun
    let bunBuildCmd = 'bun build build/bun-entry.ts --compile --outfile=native/tunnelforge';
    
    if (includeSourcemaps) {
      bunBuildCmd += ' --sourcemap=inline';
      console.log('Including sourcemaps in build');
    }

    console.log('Running:', bunBuildCmd);
    execSync(bunBuildCmd, { stdio: 'inherit' });

    // Make executable
    if (process.platform !== 'win32') {
      fs.chmodSync('native/tunnelforge', 0o755);
    }

    // Check final size
    const execPath = process.platform === 'win32' ? 'native/tunnelforge.exe' : 'native/tunnelforge';
    const finalStats = fs.statSync(execPath);
    console.log(`Final executable size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Copy native modules
    console.log('\nCopying native modules...');
    
    // Find the actual node-pty build directory
    const nodePtyPath = require.resolve('node-pty/package.json');
    const nodePtyBaseDir = path.dirname(nodePtyPath);
    const nativeModulesDir = path.join(nodePtyBaseDir, 'build/Release');

    // Check if native modules exist
    if (!fs.existsSync(nativeModulesDir)) {
      console.error(`Error: Native modules directory not found at ${nativeModulesDir}`);
      console.error('This usually means the native module build failed.');
      process.exit(1);
    }

    // Copy pty.node
    const ptyNodePath = path.join(nativeModulesDir, 'pty.node');
    if (!fs.existsSync(ptyNodePath)) {
      console.error('Error: pty.node not found. Native module build may have failed.');
      process.exit(1);
    }
    fs.copyFileSync(ptyNodePath, 'native/pty.node');
    console.log('  - Copied pty.node');

    // Copy spawn-helper (macOS only)
    if (process.platform === 'darwin') {
      const spawnHelperPath = path.join(nativeModulesDir, 'spawn-helper');
      if (!fs.existsSync(spawnHelperPath)) {
        console.error('Error: spawn-helper not found. Native module build may have failed.');
        process.exit(1);
      }
      fs.copyFileSync(spawnHelperPath, 'native/spawn-helper');
      fs.chmodSync('native/spawn-helper', 0o755);
      console.log('  - Copied spawn-helper');
    }

    // Copy authenticate_pam.node
    const authPamPath = 'node_modules/authenticate-pam/build/Release/authenticate_pam.node';
    if (fs.existsSync(authPamPath)) {
      fs.copyFileSync(authPamPath, 'native/authenticate_pam.node');
      console.log('  - Copied authenticate_pam.node');
    } else {
      console.error('Error: authenticate_pam.node not found. PAM authentication is required.');
      process.exit(1);
    }

    console.log('\n✅ Bun build complete!');
    console.log(`\nPortable Bun executable created in native/ directory:`);
    console.log(`  - tunnelforge (Bun executable)`);
    console.log(`  - pty.node`);
    if (process.platform === 'darwin') {
      console.log(`  - spawn-helper`);
    }
    console.log(`  - authenticate_pam.node`);
    console.log('\nAll files must be kept together in the same directory.');
    console.log('This bundle will work on any machine with the same OS/architecture.');
    
    // Verify the executable works
    if (process.env.CI || process.argv.includes('--verify')) {
      console.log('\nVerifying Bun executable...');
      try {
        const verifyScript = 'scripts/verify-native.js';
        if (fs.existsSync(verifyScript)) {
          execSync(`node ${verifyScript}`, { stdio: 'inherit', cwd: __dirname });
        } else {
          // Simple verification
          execSync('./native/tunnelforge version', { stdio: 'inherit', cwd: __dirname });
          console.log('✅ Bun executable verified successfully');
        }
      } catch (error) {
        console.error('Bun executable verification failed!');
        process.exit(1);
      }
    }

  } catch (error) {
    console.error('\n❌ Bun build failed:', error.message);
    process.exit(1);
  }
}

main();
