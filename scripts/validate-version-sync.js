#!/usr/bin/env node

/**
 * TunnelForge Version Validation Script
 * 
 * This script validates that all TunnelForge components have consistent version numbers.
 * It's designed to be run in CI/CD pipelines and during development.
 * 
 * Usage:
 *   node scripts/validate-version-sync.js           # Exit 0 if consistent, 1 if not
 *   node scripts/validate-version-sync.js --verbose # Show detailed output
 */

const fs = require('fs');
const path = require('path');
const VersionSynchronizer = require('./sync-versions.js');

class VersionValidator extends VersionSynchronizer {
  constructor(verbose = false) {
    super();
    this.verbose = verbose;
    this.errors = [];
    this.warnings = [];
  }

  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  error(message) {
    this.errors.push(message);
    console.error(`❌ ${message}`);
  }

  warning(message) {
    this.warnings.push(message);
    if (this.verbose) {
      console.warn(`⚠️  ${message}`);
    }
  }

  /**
   * Comprehensive validation of all version-related files
   */
  async validateAll() {
    this.log('🔍 TunnelForge Version Validation');
    this.log('=================================\n');

    // Step 1: Check if all required files exist
    this.validateFileExistence();

    // Step 2: Read all versions
    this.readAllVersions();

    // Step 3: Check version consistency
    this.validateVersionConsistency();

    // Step 4: Validate version formats
    this.validateVersionFormats();

    // Step 5: Check for additional version references
    await this.validateVersionReferences();

    // Step 6: Generate report
    this.generateReport();

    return this.errors.length === 0;
  }

  /**
   * Check if all required version files exist
   */
  validateFileExistence() {
    this.log('📁 Checking version file existence...\n');

    const files = [
      { name: 'Web package.json', path: this.constructor.prototype.constructor.VERSION_FILES?.web || path.join(__dirname, '../development/bun-web/package.json') },
      { name: 'Mac version.xcconfig', path: path.join(__dirname, '../mac/TunnelForge/version.xcconfig') },
      { name: 'iOS version.xcconfig', path: path.join(__dirname, '../ios/TunnelForge/version.xcconfig') },
      { name: 'Go go.mod', path: path.join(__dirname, '../development/go-server/go.mod') },
    ];

    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        this.error(`Missing version file: ${file.name} at ${file.path}`);
      } else {
        this.log(`✅ Found: ${file.name}`);
      }
    }

    this.log('');
  }

  /**
   * Validate that version formats are correct
   */
  validateVersionFormats() {
    this.log('🔤 Validating version formats...\n');

    const versions = this.currentVersions;

    if (versions.web && !this.isValidVersion(versions.web)) {
      this.error(`Invalid web version format: ${versions.web}`);
    } else if (versions.web) {
      this.log(`✅ Web version format valid: ${versions.web}`);
    }

    if (versions.mac && !this.isValidVersion(versions.mac)) {
      this.error(`Invalid Mac version format: ${versions.mac}`);
    } else if (versions.mac) {
      this.log(`✅ Mac version format valid: ${versions.mac}`);
    }

    if (versions.ios && !this.isValidVersion(versions.ios)) {
      this.error(`Invalid iOS version format: ${versions.ios}`);
    } else if (versions.ios) {
      this.log(`✅ iOS version format valid: ${versions.ios}`);
    }

    this.log('');
  }

  /**
   * Check version consistency across platforms
   */
  validateVersionConsistency() {
    this.log('🔄 Checking version consistency...\n');

    const webVersion = this.currentVersions.web;
    
    if (!webVersion) {
      this.error('Cannot validate consistency - web version not found');
      return;
    }

    const platforms = [
      { name: 'Mac', version: this.currentVersions.mac },
      { name: 'iOS', version: this.currentVersions.ios },
    ];

    let allConsistent = true;

    for (const platform of platforms) {
      if (!platform.version) {
        this.error(`${platform.name} version not found`);
        allConsistent = false;
      } else if (platform.version !== webVersion) {
        this.error(`${platform.name} version mismatch: ${platform.version} (expected: ${webVersion})`);
        allConsistent = false;
      } else {
        this.log(`✅ ${platform.name} version matches: ${platform.version}`);
      }
    }

    if (allConsistent && this.currentVersions.mac && this.currentVersions.ios) {
      this.log('✅ All platform versions are consistent!');
    }

    this.log('');
  }

  /**
   * Search for hardcoded version references in the codebase
   */
  async validateVersionReferences() {
    this.log('🔍 Searching for hardcoded version references...\n');

    const searchPaths = [
      path.join(__dirname, '../development/bun-web/src'),
      path.join(__dirname, '../mac'),
      path.join(__dirname, '../ios'),
    ];

    const versionPattern = /['"]\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?['"]/g;
    const foundReferences = [];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        try {
          await this.searchVersionInDirectory(searchPath, versionPattern, foundReferences);
        } catch (error) {
          this.warning(`Failed to search in ${searchPath}: ${error.message}`);
        }
      }
    }

    if (foundReferences.length > 0) {
      this.warning('Found potential hardcoded version references:');
      foundReferences.forEach(ref => {
        this.warning(`  ${ref.file}:${ref.line} - ${ref.match}`);
      });
    } else {
      this.log('✅ No hardcoded version references found');
    }

    this.log('');
  }

  /**
   * Recursively search for version patterns in a directory
   */
  async searchVersionInDirectory(dirPath, pattern, results) {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip certain directories
        if (['node_modules', '.git', 'DerivedData', 'build'].includes(item)) {
          continue;
        }
        await this.searchVersionInDirectory(fullPath, pattern, results);
      } else if (stat.isFile()) {
        // Check specific file types
        const ext = path.extname(item);
        if (['.ts', '.js', '.swift', '.json', '.plist', '.md'].includes(ext)) {
          this.searchVersionInFile(fullPath, pattern, results);
        }
      }
    }
  }

  /**
   * Search for version patterns in a specific file
   */
  searchVersionInFile(filePath, pattern, results) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // Filter out obvious false positives
            if (!this.isLikelyVersionReference(match, line)) {
              return;
            }

            results.push({
              file: path.relative(path.join(__dirname, '..'), filePath),
              line: index + 1,
              match: match,
              context: line.trim()
            });
          });
        }
      });
    } catch (error) {
      // Ignore files that can't be read as text
    }
  }

  /**
   * Heuristic to determine if a string is likely a version reference
   */
  isLikelyVersionReference(match, line) {
    // Remove quotes
    const version = match.replace(/['"]/g, '');
    
    // Skip if it's in a comment about versions being managed elsewhere
    if (line.includes('injected') || line.includes('build time') || line.includes('replaced')) {
      return false;
    }

    // Skip if it's our actual version management files
    if (line.includes('package.json') || line.includes('version.xcconfig')) {
      return false;
    }

    // Check if it looks like our current version
    const currentVersion = this.currentVersions.web;
    if (currentVersion && version === currentVersion) {
      return true;
    }

    // Check if it's a likely version number (not just any x.y.z pattern)
    const parts = version.split('.');
    if (parts.length === 3) {
      const [major, minor, patch] = parts;
      // Likely version if major < 100, minor < 100, and patch doesn't look like a date
      return parseInt(major) < 100 && parseInt(minor) < 100 && 
             (!patch.includes('-') || parseInt(patch.split('-')[0]) < 100);
    }

    return false;
  }

  /**
   * Generate a comprehensive validation report
   */
  generateReport() {
    console.log('📊 Validation Report');
    console.log('==================\n');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All version validations passed!');
      console.log('✅ No errors or warnings found');
    } else {
      if (this.errors.length > 0) {
        console.log(`❌ Errors found: ${this.errors.length}`);
        this.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
        console.log('');
      }

      if (this.warnings.length > 0) {
        console.log(`⚠️  Warnings found: ${this.warnings.length}`);
        this.warnings.forEach((warning, index) => {
          console.log(`   ${index + 1}. ${warning}`);
        });
        console.log('');
      }

      if (this.errors.length > 0) {
        console.log('💡 To fix version inconsistencies, run:');
        console.log('   node scripts/sync-versions.js');
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   Errors: ${this.errors.length}`);
    console.log(`   Warnings: ${this.warnings.length}`);
    console.log(`   Status: ${this.errors.length === 0 ? 'PASS' : 'FAIL'}`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (args.includes('--help') || args.includes('-h')) {
    console.log('TunnelForge Version Validation');
    console.log('Usage:');
    console.log('  node scripts/validate-version-sync.js           # Basic validation');
    console.log('  node scripts/validate-version-sync.js --verbose # Detailed output');
    console.log('  node scripts/validate-version-sync.js --help    # Show this help');
    console.log('');
    console.log('Exit codes:');
    console.log('  0 - All validations passed');
    console.log('  1 - Validation errors found');
    return;
  }

  const validator = new VersionValidator(verbose);
  const isValid = await validator.validateAll();

  process.exit(isValid ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Validation script failed:', error.message);
    process.exit(1);
  });
}

module.exports = VersionValidator;