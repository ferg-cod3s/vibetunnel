#!/usr/bin/env node
// Entry point for the server - imports the modular server which starts automatically

// Suppress xterm.js errors globally - must be before any other imports
import { suppressXtermErrors } from './shared/suppress-xterm-errors.js';

suppressXtermErrors();

import { startTunnelForgeForward } from './server/fwd.js';
import { startTunnelForgeServer } from './server/server.js';
import { closeLogger, createLogger, initLogger, VerbosityLevel } from './server/utils/logger.js';
import { parseVerbosityFromEnv } from './server/utils/verbosity-parser.js';
import { VERSION } from './server/version.js';

// Check for version command early - before logger initialization
if (process.argv[2] === 'version') {
  console.log(`TunnelForge Server v${VERSION}`);
  process.exit(0);
}

// Initialize logger before anything else
// Parse verbosity from environment variables
const verbosityLevel = parseVerbosityFromEnv();

// Check for legacy debug mode (for backward compatibility with initLogger)
const debugMode = process.env.TUNNELFORGE_DEBUG === '1' || process.env.TUNNELFORGE_DEBUG === 'true';

initLogger(debugMode, verbosityLevel);
const logger = createLogger('cli');

// Source maps are only included if built with --sourcemap flag

// Prevent double execution in SEA context where require.main might be undefined
// Use a global flag to ensure we only run once
interface GlobalWithVibetunnel {
  __tunnelforgeStarted?: boolean;
}

const globalWithVibetunnel = global as unknown as GlobalWithVibetunnel;

if (globalWithVibetunnel.__tunnelforgeStarted) {
  process.exit(0);
}
globalWithVibetunnel.__tunnelforgeStarted = true;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  logger.error('Stack trace:', error.stack);
  closeLogger();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    logger.error('Stack trace:', reason.stack);
  }
  closeLogger();
  process.exit(1);
});

/**
 * Print help message with version and usage information
 */
function printHelp(): void {
  console.log(`TunnelForge Server v${VERSION}`);
  console.log('');
  console.log('Usage:');
  console.log('  tunnelforge [options]                    Start TunnelForge server');
  console.log('  tunnelforge fwd <session-id> <command>   Forward command to session');
  console.log('  tunnelforge status                       Show server and follow mode status');
  console.log('  tunnelforge follow [branch]              Enable Git follow mode');
  console.log('  tunnelforge unfollow                     Disable Git follow mode');
  console.log('  tunnelforge git-event                    Notify server of Git event');
  console.log('  tunnelforge systemd [action]             Manage systemd service (Linux)');
  console.log('  tunnelforge version                      Show version');
  console.log('  tunnelforge help                         Show this help');
  console.log('');
  console.log('Systemd Service Actions:');
  console.log('  install   - Install TunnelForge as systemd service (default)');
  console.log('  uninstall - Remove TunnelForge systemd service');
  console.log('  status    - Check systemd service status');
  console.log('');
  console.log('Examples:');
  console.log('  tunnelforge --port 8080 --no-auth');
  console.log('  tunnelforge fwd abc123 "ls -la"');
  console.log('  tunnelforge systemd');
  console.log('  tunnelforge systemd uninstall');
  console.log('');
  console.log('For more options, run: tunnelforge --help');
}

/**
 * Print version information
 */
function printVersion(): void {
  console.log(`TunnelForge Server v${VERSION}`);
}

/**
 * Handle command forwarding to a session
 */
async function handleForwardCommand(): Promise<void> {
  try {
    await startTunnelForgeForward(process.argv.slice(3));
  } catch (error) {
    logger.error('Fatal error:', error);
    closeLogger();
    process.exit(1);
  }
}

/**
 * Handle systemd service installation and management
 */
async function handleSystemdService(): Promise<void> {
  try {
    // Import systemd installer dynamically to avoid loading it on every startup
    const { installSystemdService } = await import('./server/services/systemd-installer.js');
    const action = process.argv[3] || 'install';
    installSystemdService(action);
  } catch (error) {
    logger.error('Failed to load systemd installer:', error);
    closeLogger();
    process.exit(1);
  }
}

/**
 * Handle socket API commands
 */
async function handleSocketCommand(command: string): Promise<void> {
  try {
    const { SocketApiClient } = await import('./server/socket-api-client.js');
    const client = new SocketApiClient();

    switch (command) {
      case 'status': {
        const status = await client.getStatus();
        console.log('TunnelForge Server Status:');
        console.log(`  Running: ${status.running ? 'Yes' : 'No'}`);
        if (status.running) {
          console.log(`  Port: ${status.port || 'Unknown'}`);
          console.log(`  URL: ${status.url || 'Unknown'}`);

          if (status.followMode) {
            console.log('\nGit Follow Mode:');
            console.log(`  Enabled: ${status.followMode.enabled ? 'Yes' : 'No'}`);
            if (status.followMode.enabled && status.followMode.branch) {
              console.log(`  Following branch: ${status.followMode.branch}`);
              console.log(`  Worktree: ${status.followMode.repoPath || 'Unknown'}`);
            }
          } else {
            console.log('\nGit Follow Mode: Not in a git repository');
          }
        }
        break;
      }

      case 'follow': {
        // Parse command line arguments
        const args = process.argv.slice(3);
        let worktreePath: string | undefined;
        let mainRepoPath: string | undefined;

        // Parse flags
        for (let i = 0; i < args.length; i++) {
          switch (args[i]) {
            case '--from-worktree':
              // Flag handled by vt script
              break;
            case '--worktree-path':
              worktreePath = args[++i];
              break;
            case '--main-repo':
              mainRepoPath = args[++i];
              break;
          }
        }

        const response = await client.setFollowMode({
          enable: true,
          worktreePath,
          mainRepoPath,
          // For backward compatibility, pass repoPath if mainRepoPath not set
          repoPath: mainRepoPath,
        });

        if (response.success) {
          // Success message is already printed by the vt script
        } else {
          console.error(`Failed to enable follow mode: ${response.error || 'Unknown error'}`);
          process.exit(1);
        }
        break;
      }

      case 'unfollow': {
        const repoPath = process.cwd();

        const response = await client.setFollowMode({
          repoPath,
          enable: false,
        });

        if (response.success) {
          console.log('Disabled follow mode');
        } else {
          console.error(`Failed to disable follow mode: ${response.error || 'Unknown error'}`);
          process.exit(1);
        }
        break;
      }

      case 'git-event': {
        const repoPath = process.cwd();

        await client.sendGitEvent({
          repoPath,
          type: 'other', // We don't know the specific type from command line
        });
        break;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'TunnelForge server is not running') {
      console.error('Error: TunnelForge server is not running');
      console.error('Start the server first with: tunnelforge');
    } else {
      logger.error('Socket command failed:', error);
    }
    closeLogger();
    process.exit(1);
  }
}

/**
 * Start the TunnelForge server with optional startup logging
 */
function handleStartServer(): void {
  // Show startup message at INFO level or when debug is enabled
  if (verbosityLevel !== undefined && verbosityLevel >= VerbosityLevel.INFO) {
    logger.log('Starting TunnelForge server...');
  }
  startTunnelForgeServer();
}

/**
 * Parse command line arguments and execute appropriate action
 */
async function parseCommandAndExecute(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'version':
      printVersion();
      process.exit(0);
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;

    case 'fwd':
      await handleForwardCommand();
      break;

    case 'status':
    case 'follow':
    case 'unfollow':
    case 'git-event':
      await handleSocketCommand(command);
      break;

    case 'systemd':
      await handleSystemdService();
      break;

    default:
      // No command provided - start the server
      handleStartServer();
      break;
  }
}

/**
 * Check if this module is being run directly (not imported)
 */
function isMainModule(): boolean {
  return (
    !module.parent &&
    (require.main === module ||
      require.main === undefined ||
      (require.main?.filename?.endsWith('/tunnelforge-cli') ?? false))
  );
}

// Main execution
if (isMainModule()) {
  parseCommandAndExecute().catch((error) => {
    logger.error('Unhandled error in main execution:', error);
    if (error instanceof Error) {
      logger.error('Stack trace:', error.stack);
    }
    closeLogger();
    process.exit(1);
  });
}
