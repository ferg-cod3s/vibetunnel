#!/usr/bin/env node

/**
 * TunnelForge Version Synchronization Script
 * 
 * This script ensures all TunnelForge components maintain the same version number:
 * - Web frontend (package.json)
 * - Mac app (version.xcconfig)
 * - iOS app (version.xcconfig)
 * - Go server (module references)
 * 
 * Usage:
 *   node scripts/sync-versions.js                    # Sync all to web version
 *   node scripts/sync-versions.js --version 1.0.0    # Set specific version
 *   node scripts/sync-versions.js --check            # Check for inconsistencies
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

// Version file locations
const VERSION_FILES = {
  web: path.join(PROJECT_ROOT, 'development/bun-web/package.json'),
  macXcconfig: path.join(PROJECT_ROOT, 'mac/TunnelForge/version.xcconfig'),
  iosXcconfig: path.join(PROJECT_ROOT, 'ios/TunnelForge/version.xcconfig'),
  goMod: path.join(PROJECT_ROOT, 'development/go-server/go.mod'),
};

class VersionSynchronizer {
  constructor() {
    this.currentVersions = {};
  }

  /**
   * Read current version from web package.json
   */
  getSourceVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync(VERSION_FILES.web, 'utf8'));
      return packageJson.version;
    } catch (error) {
      throw new Error(`Failed to read web package.json: ${error.message}`);
    }
  }

  /**
   * Read versions from all platform files
   */
  readAllVersions() {
    console.log('📖 Reading current versions from all platforms...\n');

    // Web version
    try {
      const packageJson = JSON.parse(fs.readFileSync(VERSION_FILES.web, 'utf8'));
      this.currentVersions.web = packageJson.version;
      console.log(`✅ Web Frontend: ${this.currentVersions.web}`);
    } catch (error) {
      console.log(`❌ Web Frontend: Failed to read (${error.message})`);
      this.currentVersions.web = null;
    }

    // Mac version
    try {
      const macXcconfig = fs.readFileSync(VERSION_FILES.macXcconfig, 'utf8');
      const macVersion = macXcconfig.match(/MARKETING_VERSION = (.+)/)?.[1];
      this.currentVersions.mac = macVersion;
      console.log(`✅ Mac App: ${this.currentVersions.mac}`);
    } catch (error) {
      console.log(`❌ Mac App: Failed to read (${error.message})`);
      this.currentVersions.mac = null;
    }

    // iOS version  
    try {
      const iosXcconfig = fs.readFileSync(VERSION_FILES.iosXcconfig, 'utf8');
      const iosVersion = iosXcconfig.match(/MARKETING_VERSION = (.+)/)?.[1];
      this.currentVersions.ios = iosVersion;
      console.log(`✅ iOS App: ${this.currentVersions.ios}`);
    } catch (error) {
      console.log(`❌ iOS App: Failed to read (${error.message})`);
      this.currentVersions.ios = null;
    }

    // Go module (read but don't update - it uses different versioning)
    try {
      const goMod = fs.readFileSync(VERSION_FILES.goMod, 'utf8');
      const moduleLine = goMod.match(/module (.+)/)?.[1];
      this.currentVersions.goModule = moduleLine;
      console.log(`ℹ️  Go Module: ${this.currentVersions.goModule} (module name only)`);
    } catch (error) {
      console.log(`❌ Go Module: Failed to read (${error.message})`);
      this.currentVersions.goModule = null;
    }

    console.log('');
  }

  /**
   * Check if all versions are synchronized
   */
  checkVersionConsistency() {
    const webVersion = this.currentVersions.web;
    const inconsistencies = [];

    if (this.currentVersions.mac !== webVersion) {
      inconsistencies.push(`Mac app: ${this.currentVersions.mac} (expected: ${webVersion})`);
    }

    if (this.currentVersions.ios !== webVersion) {
      inconsistencies.push(`iOS app: ${this.currentVersions.ios} (expected: ${webVersion})`);
    }

    if (inconsistencies.length > 0) {
      console.log('❌ Version inconsistencies found:');
      inconsistencies.forEach(msg => console.log(`   ${msg}`));
      return false;
    } else {
      console.log('✅ All versions are synchronized!');
      return true;
    }
  }

  /**
   * Update Mac app version.xcconfig
   */
  updateMacVersion(newVersion) {
    try {
      let content = fs.readFileSync(VERSION_FILES.macXcconfig, 'utf8');
      
      // Update MARKETING_VERSION
      content = content.replace(
        /MARKETING_VERSION = .+/,
        `MARKETING_VERSION = ${newVersion}`
      );

      fs.writeFileSync(VERSION_FILES.macXcconfig, content);
      console.log(`✅ Updated Mac app version to ${newVersion}`);
    } catch (error) {
      console.log(`❌ Failed to update Mac app version: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update iOS app version.xcconfig
   */
  updateIosVersion(newVersion) {
    try {
      let content = fs.readFileSync(VERSION_FILES.iosXcconfig, 'utf8');
      
      // Update MARKETING_VERSION
      content = content.replace(
        /MARKETING_VERSION = .+/,
        `MARKETING_VERSION = ${newVersion}`
      );

      fs.writeFileSync(VERSION_FILES.iosXcconfig, content);
      console.log(`✅ Updated iOS app version to ${newVersion}`);
    } catch (error) {
      console.log(`❌ Failed to update iOS app version: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update web package.json version
   */
  updateWebVersion(newVersion) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(VERSION_FILES.web, 'utf8'));
      packageJson.version = newVersion;
      
      fs.writeFileSync(VERSION_FILES.web, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`✅ Updated web frontend version to ${newVersion}`);
    } catch (error) {
      console.log(`❌ Failed to update web frontend version: ${error.message}`);
      throw error;
    }
  }

  /**
   * Synchronize all platforms to a target version
   */
  syncToVersion(targetVersion) {
    console.log(`🔄 Synchronizing all platforms to version: ${targetVersion}\n`);

    try {
      // Update web version first (source of truth)
      this.updateWebVersion(targetVersion);
      
      // Update platform versions
      this.updateMacVersion(targetVersion);
      this.updateIosVersion(targetVersion);

      console.log(`\n🎉 Successfully synchronized all platforms to version ${targetVersion}!`);
      console.log('\n📝 Next steps:');
      console.log('   1. Build and test all platforms');
      console.log('   2. Commit version changes');
      console.log('   3. Create release tag if ready');
      
    } catch (error) {
      console.log(`\n💥 Synchronization failed: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Validate version format
   */
  isValidVersion(version) {
    // Support semantic versioning with optional prerelease
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/;
    return semverRegex.test(version);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const synchronizer = new VersionSynchronizer();

  console.log('🔧 TunnelForge Version Synchronizer');
  console.log('===================================\n');

  // Parse command line arguments
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  node scripts/sync-versions.js                    # Sync all to web version');
    console.log('  node scripts/sync-versions.js --version 1.0.0    # Set specific version');
    console.log('  node scripts/sync-versions.js --check            # Check for inconsistencies');
    console.log('  node scripts/sync-versions.js --help             # Show this help');
    return;
  }

  // Read current versions
  synchronizer.readAllVersions();

  if (args.includes('--check')) {
    // Check mode - just report inconsistencies
    const isConsistent = synchronizer.checkVersionConsistency();
    process.exit(isConsistent ? 0 : 1);
  }

  // Get target version
  let targetVersion;
  const versionIndex = args.indexOf('--version');
  
  if (versionIndex !== -1 && args[versionIndex + 1]) {
    targetVersion = args[versionIndex + 1];
    
    if (!synchronizer.isValidVersion(targetVersion)) {
      console.log(`❌ Invalid version format: ${targetVersion}`);
      console.log('   Expected format: X.Y.Z or X.Y.Z-prerelease');
      process.exit(1);
    }
  } else {
    // Use web frontend version as source of truth
    targetVersion = synchronizer.getSourceVersion();
    console.log(`Using web frontend version as target: ${targetVersion}\n`);
  }

  // Perform synchronization
  synchronizer.syncToVersion(targetVersion);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = VersionSynchronizer;