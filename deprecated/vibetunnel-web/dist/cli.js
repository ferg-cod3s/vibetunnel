#!/usr/bin/env node
"use strict";
// Entry point for the server - imports the modular server which starts automatically
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Suppress xterm.js errors globally - must be before any other imports
const suppress_xterm_errors_js_1 = require("./shared/suppress-xterm-errors.js");
(0, suppress_xterm_errors_js_1.suppressXtermErrors)();
const fwd_js_1 = require("./server/fwd.js");
const server_js_1 = require("./server/server.js");
const logger_js_1 = require("./server/utils/logger.js");
const verbosity_parser_js_1 = require("./server/utils/verbosity-parser.js");
const version_js_1 = require("./server/version.js");
// Check for version command early - before logger initialization
if (process.argv[2] === 'version') {
    console.log(`VibeTunnel Server v${version_js_1.VERSION}`);
    process.exit(0);
}
// Initialize logger before anything else
// Parse verbosity from environment variables
const verbosityLevel = (0, verbosity_parser_js_1.parseVerbosityFromEnv)();
// Check for legacy debug mode (for backward compatibility with initLogger)
const debugMode = process.env.VIBETUNNEL_DEBUG === '1' || process.env.VIBETUNNEL_DEBUG === 'true';
(0, logger_js_1.initLogger)(debugMode, verbosityLevel);
const logger = (0, logger_js_1.createLogger)('cli');
const globalWithVibetunnel = global;
if (globalWithVibetunnel.__vibetunnelStarted) {
    process.exit(0);
}
globalWithVibetunnel.__vibetunnelStarted = true;
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    logger.error('Stack trace:', error.stack);
    (0, logger_js_1.closeLogger)();
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    if (reason instanceof Error) {
        logger.error('Stack trace:', reason.stack);
    }
    (0, logger_js_1.closeLogger)();
    process.exit(1);
});
/**
 * Print help message with version and usage information
 */
function printHelp() {
    console.log(`VibeTunnel Server v${version_js_1.VERSION}`);
    console.log('');
    console.log('Usage:');
    console.log('  vibetunnel [options]                    Start VibeTunnel server');
    console.log('  vibetunnel fwd <session-id> <command>   Forward command to session');
    console.log('  vibetunnel status                       Show server and follow mode status');
    console.log('  vibetunnel follow [branch]              Enable Git follow mode');
    console.log('  vibetunnel unfollow                     Disable Git follow mode');
    console.log('  vibetunnel git-event                    Notify server of Git event');
    console.log('  vibetunnel systemd [action]             Manage systemd service (Linux)');
    console.log('  vibetunnel version                      Show version');
    console.log('  vibetunnel help                         Show this help');
    console.log('');
    console.log('Systemd Service Actions:');
    console.log('  install   - Install VibeTunnel as systemd service (default)');
    console.log('  uninstall - Remove VibeTunnel systemd service');
    console.log('  status    - Check systemd service status');
    console.log('');
    console.log('Examples:');
    console.log('  vibetunnel --port 8080 --no-auth');
    console.log('  vibetunnel fwd abc123 "ls -la"');
    console.log('  vibetunnel systemd');
    console.log('  vibetunnel systemd uninstall');
    console.log('');
    console.log('For more options, run: vibetunnel --help');
}
/**
 * Print version information
 */
function printVersion() {
    console.log(`VibeTunnel Server v${version_js_1.VERSION}`);
}
/**
 * Handle command forwarding to a session
 */
async function handleForwardCommand() {
    try {
        await (0, fwd_js_1.startVibeTunnelForward)(process.argv.slice(3));
    }
    catch (error) {
        logger.error('Fatal error:', error);
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    }
}
/**
 * Handle systemd service installation and management
 */
async function handleSystemdService() {
    try {
        // Import systemd installer dynamically to avoid loading it on every startup
        const { installSystemdService } = await Promise.resolve().then(() => __importStar(require('./server/services/systemd-installer.js')));
        const action = process.argv[3] || 'install';
        installSystemdService(action);
    }
    catch (error) {
        logger.error('Failed to load systemd installer:', error);
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    }
}
/**
 * Handle socket API commands
 */
async function handleSocketCommand(command) {
    try {
        const { SocketApiClient } = await Promise.resolve().then(() => __importStar(require('./server/socket-api-client.js')));
        const client = new SocketApiClient();
        switch (command) {
            case 'status': {
                const status = await client.getStatus();
                console.log('VibeTunnel Server Status:');
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
                    }
                    else {
                        console.log('\nGit Follow Mode: Not in a git repository');
                    }
                }
                break;
            }
            case 'follow': {
                // Parse command line arguments
                const args = process.argv.slice(3);
                let worktreePath;
                let mainRepoPath;
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
                }
                else {
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
                }
                else {
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
    }
    catch (error) {
        if (error instanceof Error && error.message === 'VibeTunnel server is not running') {
            console.error('Error: VibeTunnel server is not running');
            console.error('Start the server first with: vibetunnel');
        }
        else {
            logger.error('Socket command failed:', error);
        }
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    }
}
/**
 * Start the VibeTunnel server with optional startup logging
 */
function handleStartServer() {
    // Show startup message at INFO level or when debug is enabled
    if (verbosityLevel !== undefined && verbosityLevel >= logger_js_1.VerbosityLevel.INFO) {
        logger.log('Starting VibeTunnel server...');
    }
    (0, server_js_1.startVibeTunnelServer)();
}
/**
 * Parse command line arguments and execute appropriate action
 */
async function parseCommandAndExecute() {
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
function isMainModule() {
    return (!module.parent &&
        (require.main === module ||
            require.main === undefined ||
            (require.main?.filename?.endsWith('/vibetunnel-cli') ?? false)));
}
// Main execution
if (isMainModule()) {
    parseCommandAndExecute().catch((error) => {
        logger.error('Unhandled error in main execution:', error);
        if (error instanceof Error) {
            logger.error('Stack trace:', error.stack);
        }
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xpLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2NsaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBLHFGQUFxRjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFckYsdUVBQXVFO0FBQ3ZFLGdGQUF3RTtBQUV4RSxJQUFBLDhDQUFtQixHQUFFLENBQUM7QUFFdEIsNENBQXlEO0FBQ3pELGtEQUEyRDtBQUMzRCx3REFBaUc7QUFDakcsNEVBQTJFO0FBQzNFLG9EQUE4QztBQUU5QyxpRUFBaUU7QUFDakUsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLG9CQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQ0FBQztBQUVELHlDQUF5QztBQUN6Qyw2Q0FBNkM7QUFDN0MsTUFBTSxjQUFjLEdBQUcsSUFBQSwyQ0FBcUIsR0FBRSxDQUFDO0FBRS9DLDJFQUEyRTtBQUMzRSxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixLQUFLLEdBQUcsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixLQUFLLE1BQU0sQ0FBQztBQUVsRyxJQUFBLHNCQUFVLEVBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0FBQ3RDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxLQUFLLENBQUMsQ0FBQztBQVVuQyxNQUFNLG9CQUFvQixHQUFHLE1BQXlDLENBQUM7QUFFdkUsSUFBSSxvQkFBb0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbEIsQ0FBQztBQUNELG9CQUFvQixDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztBQUVoRCw2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TTtJQUNWLENBQUM7QUFDSCxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLFlBQVk7SUFDbkIsT0FBTyxDQUNMLENBQUMsTUFBTSxDQUFDLE1BQU07UUFDZCxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssTUFBTTtZQUN0QixPQUFPLENBQUMsSUFBSSxLQUFLLFNBQVM7WUFDMUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUNsRSxDQUFDO0FBQ0osQ0FBQztBQUVELGlCQUFpQjtBQUNqQixJQUFJLFlBQVksRUFBRSxFQUFFLENBQUM7SUFDbkIsc0JBQXNCLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtRQUN2QyxNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzFELElBQUksS0FBSyxZQUFZLEtBQUssRUFBRSxDQUFDO1lBQzNCLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsSUFBQSx1QkFBVyxHQUFFLENBQUM7UUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8vIEVudHJ5IHBvaW50IGZvciB0aGUgc2VydmVyIC0gaW1wb3J0cyB0aGUgbW9kdWxhciBzZXJ2ZXIgd2hpY2ggc3RhcnRzIGF1dG9tYXRpY2FsbHlcblxuLy8gU3VwcHJlc3MgeHRlcm0uanMgZXJyb3JzIGdsb2JhbGx5IC0gbXVzdCBiZSBiZWZvcmUgYW55IG90aGVyIGltcG9ydHNcbmltcG9ydCB7IHN1cHByZXNzWHRlcm1FcnJvcnMgfSBmcm9tICcuL3NoYXJlZC9zdXBwcmVzcy14dGVybS1lcnJvcnMuanMnO1xuXG5zdXBwcmVzc1h0ZXJtRXJyb3JzKCk7XG5cbmltcG9ydCB7IHN0YXJ0VmliZVR1bm5lbEZvcndhcmQgfSBmcm9tICcuL3NlcnZlci9md2QuanMnO1xuaW1wb3J0IHsgc3RhcnRWaWJlVHVubmVsU2VydmVyIH0gZnJvbSAnLi9zZXJ2ZXIvc2VydmVyLmpzJztcbmltcG9ydCB7IGNsb3NlTG9nZ2VyLCBjcmVhdGVMb2dnZXIsIGluaXRMb2dnZXIsIFZlcmJvc2l0eUxldmVsIH0gZnJvbSAnLi9zZXJ2ZXIvdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IHBhcnNlVmVyYm9zaXR5RnJvbUVudiB9IGZyb20gJy4vc2VydmVyL3V0aWxzL3ZlcmJvc2l0eS1wYXJzZXIuanMnO1xuaW1wb3J0IHsgVkVSU0lPTiB9IGZyb20gJy4vc2VydmVyL3ZlcnNpb24uanMnO1xuXG4vLyBDaGVjayBmb3IgdmVyc2lvbiBjb21tYW5kIGVhcmx5IC0gYmVmb3JlIGxvZ2dlciBpbml0aWFsaXphdGlvblxuaWYgKHByb2Nlc3MuYXJndlsyXSA9PT0gJ3ZlcnNpb24nKSB7XG4gIGNvbnNvbGUubG9nKGBWaWJlVHVubmVsIFNlcnZlciB2JHtWRVJTSU9OfWApO1xuICBwcm9jZXNzLmV4aXQoMCk7XG59XG5cbi8vIEluaXRpYWxpemUgbG9nZ2VyIGJlZm9yZSBhbnl0aGluZyBlbHNlXG4vLyBQYXJzZSB2ZXJib3NpdHkgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbmNvbnN0IHZlcmJvc2l0eUxldmVsID0gcGFyc2VWZXJib3NpdHlGcm9tRW52KCk7XG5cbi8vIENoZWNrIGZvciBsZWdhY3kgZGVidWcgbW9kZSAoZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgd2l0aCBpbml0TG9nZ2VyKVxuY29uc3QgZGVidWdNb2RlID0gcHJvY2Vzcy5lbnYuVklCRVRVTk5FTF9ERUJVRyA9PT0gJzEnIHx8IHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfREVCVUcgPT09ICd0cnVlJztcblxuaW5pdExvZ2dlcihkZWJ1Z01vZGUsIHZlcmJvc2l0eUxldmVsKTtcbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignY2xpJyk7XG5cbi8vIFNvdXJjZSBtYXBzIGFyZSBvbmx5IGluY2x1ZGVkIGlmIGJ1aWx0IHdpdGggLS1zb3VyY2VtYXAgZmxhZ1xuXG4vLyBQcmV2ZW50IGRvdWJsZSBleGVjdXRpb24gaW4gU0VBIGNvbnRleHQgd2hlcmUgcmVxdWlyZS5tYWluIG1pZ2h0IGJlIHVuZGVmaW5lZFxuLy8gVXNlIGEgZ2xvYmFsIGZsYWcgdG8gZW5zdXJlIHdlIG9ubHkgcnVuIG9uY2VcbmludGVyZmFjZSBHbG9iYWxXaXRoVmliZXR1bm5lbCB7XG4gIF9fdmliZXR1bm5lbFN0YXJ0ZWQ/OiBib29sZWFuO1xufVxuXG5jb25zdCBnbG9iYWxXaXRoVmliZXR1bm5lbCA9IGdsb2JhbCBhcyB1bmtub3duIGFzIEdsb2JhbFdpdGhWaWJldHVubmVsO1xuXG5pZiAoZ2xvYmFsV2l0aFZpYmV0dW5uZWwuX192aWJldHVubmVsU3RhcnRlZCkge1xuICBwcm9jZXNzLmV4aXQoMCk7XG59XG5nbG9iYWxXaXRoVmliZXR1bm5lbC5fX3ZpYmV0dW5uZWxTdGFydGVkID0gdHJ1ZTtcblxuLy8gSGFuZGxlIHVuY2F1Z2h0IGV4Y2VwdGlvbnNcbnByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgKGVycm9yKSA9PiB7XG4gIGxvZ2dlci5lcnJvcignVW5jYXVnaHQgZXhjZXB0aW9uOicsIGVycm9yKTtcbiAgbG9nZ2VyLmVycm9yKCdTdGFjayB0cmFjZTonLCBlcnJvci5zdGFjayk7XG4gIGNsb3NlTG9nZ2VyKCk7XG4gIHByb2Nlc3MuZXhpdCgxKTtcbn0pO1xuXG5wcm9jZXNzLm9uKCd1bmhhbmRsZWRSZWplY3Rpb24nLCAocmVhc29uLCBwcm9taXNlKSA9PiB7XG4gIGxvZ2dlci5lcnJvcignVW5oYW5kbGVkIHJlamVjdGlvbiBhdDonLCBwcm9taXNlLCAncmVhc29uOicsIHJlYXNvbik7XG4gIGlmIChyZWFzb24gaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcignU3RhY2sgdHJhY2U6JywgcmVhc29uLnN0YWNrKTtcbiAgfVxuICBjbG9zZUxvZ2dlcigpO1xuICBwcm9jZXNzLmV4aXQoMSk7XG59KTtcblxuLyoqXG4gKiBQcmludCBoZWxwIG1lc3NhZ2Ugd2l0aCB2ZXJzaW9uIGFuZCB1c2FnZSBpbmZvcm1hdGlvblxuICovXG5mdW5jdGlvbiBwcmludEhlbHAoKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKGBWaWJlVHVubmVsIFNlcnZlciB2JHtWRVJTSU9OfWApO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdVc2FnZTonKTtcbiAgY29uc29sZS5sb2coJyAgdmliZXR1bm5lbCBbb3B0aW9uc10gICAgICAgICAgICAgICAgICAgIFN0YXJ0IFZpYmVUdW5uZWwgc2VydmVyJyk7XG4gIGNvbnNvbGUubG9nKCcgIHZpYmV0dW5uZWwgZndkIDxzZXNzaW9uLWlkPiA8Y29tbWFuZD4gICBGb3J3YXJkIGNvbW1hbmQgdG8gc2Vzc2lvbicpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIHN0YXR1cyAgICAgICAgICAgICAgICAgICAgICAgU2hvdyBzZXJ2ZXIgYW5kIGZvbGxvdyBtb2RlIHN0YXR1cycpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIGZvbGxvdyBbYnJhbmNoXSAgICAgICAgICAgICAgRW5hYmxlIEdpdCBmb2xsb3cgbW9kZScpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIHVuZm9sbG93ICAgICAgICAgICAgICAgICAgICAgRGlzYWJsZSBHaXQgZm9sbG93IG1vZGUnKTtcbiAgY29uc29sZS5sb2coJyAgdmliZXR1bm5lbCBnaXQtZXZlbnQgICAgICAgICAgICAgICAgICAgIE5vdGlmeSBzZXJ2ZXIgb2YgR2l0IGV2ZW50Jyk7XG4gIGNvbnNvbGUubG9nKCcgIHZpYmV0dW5uZWwgc3lzdGVtZCBbYWN0aW9uXSAgICAgICAgICAgICBNYW5hZ2Ugc3lzdGVtZCBzZXJ2aWNlIChMaW51eCknKTtcbiAgY29uc29sZS5sb2coJyAgdmliZXR1bm5lbCB2ZXJzaW9uICAgICAgICAgICAgICAgICAgICAgIFNob3cgdmVyc2lvbicpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIGhlbHAgICAgICAgICAgICAgICAgICAgICAgICAgU2hvdyB0aGlzIGhlbHAnKTtcbiAgY29uc29sZS5sb2coJycpO1xuICBjb25zb2xlLmxvZygnU3lzdGVtZCBTZXJ2aWNlIEFjdGlvbnM6Jyk7XG4gIGNvbnNvbGUubG9nKCcgIGluc3RhbGwgICAtIEluc3RhbGwgVmliZVR1bm5lbCBhcyBzeXN0ZW1kIHNlcnZpY2UgKGRlZmF1bHQpJyk7XG4gIGNvbnNvbGUubG9nKCcgIHVuaW5zdGFsbCAtIFJlbW92ZSBWaWJlVHVubmVsIHN5c3RlbWQgc2VydmljZScpO1xuICBjb25zb2xlLmxvZygnICBzdGF0dXMgICAgLSBDaGVjayBzeXN0ZW1kIHNlcnZpY2Ugc3RhdHVzJyk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ0V4YW1wbGVzOicpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIC0tcG9ydCA4MDgwIC0tbm8tYXV0aCcpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIGZ3ZCBhYmMxMjMgXCJscyAtbGFcIicpO1xuICBjb25zb2xlLmxvZygnICB2aWJldHVubmVsIHN5c3RlbWQnKTtcbiAgY29uc29sZS5sb2coJyAgdmliZXR1bm5lbCBzeXN0ZW1kIHVuaW5zdGFsbCcpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdGb3IgbW9yZSBvcHRpb25zLCBydW46IHZpYmV0dW5uZWwgLS1oZWxwJyk7XG59XG5cbi8qKlxuICogUHJpbnQgdmVyc2lvbiBpbmZvcm1hdGlvblxuICovXG5mdW5jdGlvbiBwcmludFZlcnNpb24oKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKGBWaWJlVHVubmVsIFNlcnZlciB2JHtWRVJTSU9OfWApO1xufVxuXG4vKipcbiAqIEhhbmRsZSBjb21tYW5kIGZvcndhcmRpbmcgdG8gYSBzZXNzaW9uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUZvcndhcmRDb21tYW5kKCk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGF3YWl0IHN0YXJ0VmliZVR1bm5lbEZvcndhcmQocHJvY2Vzcy5hcmd2LnNsaWNlKDMpKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0ZhdGFsIGVycm9yOicsIGVycm9yKTtcbiAgICBjbG9zZUxvZ2dlcigpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG4vKipcbiAqIEhhbmRsZSBzeXN0ZW1kIHNlcnZpY2UgaW5zdGFsbGF0aW9uIGFuZCBtYW5hZ2VtZW50XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVN5c3RlbWRTZXJ2aWNlKCk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIC8vIEltcG9ydCBzeXN0ZW1kIGluc3RhbGxlciBkeW5hbWljYWxseSB0byBhdm9pZCBsb2FkaW5nIGl0IG9uIGV2ZXJ5IHN0YXJ0dXBcbiAgICBjb25zdCB7IGluc3RhbGxTeXN0ZW1kU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuL3NlcnZlci9zZXJ2aWNlcy9zeXN0ZW1kLWluc3RhbGxlci5qcycpO1xuICAgIGNvbnN0IGFjdGlvbiA9IHByb2Nlc3MuYXJndlszXSB8fCAnaW5zdGFsbCc7XG4gICAgaW5zdGFsbFN5c3RlbWRTZXJ2aWNlKGFjdGlvbik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBzeXN0ZW1kIGluc3RhbGxlcjonLCBlcnJvcik7XG4gICAgY2xvc2VMb2dnZXIoKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuLyoqXG4gKiBIYW5kbGUgc29ja2V0IEFQSSBjb21tYW5kc1xuICovXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTb2NrZXRDb21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgU29ja2V0QXBpQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJy4vc2VydmVyL3NvY2tldC1hcGktY2xpZW50LmpzJyk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IFNvY2tldEFwaUNsaWVudCgpO1xuXG4gICAgc3dpdGNoIChjb21tYW5kKSB7XG4gICAgICBjYXNlICdzdGF0dXMnOiB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IGNsaWVudC5nZXRTdGF0dXMoKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1ZpYmVUdW5uZWwgU2VydmVyIFN0YXR1czonKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgUnVubmluZzogJHtzdGF0dXMucnVubmluZyA/ICdZZXMnIDogJ05vJ31gKTtcbiAgICAgICAgaWYgKHN0YXR1cy5ydW5uaW5nKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgUG9ydDogJHtzdGF0dXMucG9ydCB8fCAnVW5rbm93bid9YCk7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAgVVJMOiAke3N0YXR1cy51cmwgfHwgJ1Vua25vd24nfWApO1xuXG4gICAgICAgICAgaWYgKHN0YXR1cy5mb2xsb3dNb2RlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnXFxuR2l0IEZvbGxvdyBNb2RlOicpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRW5hYmxlZDogJHtzdGF0dXMuZm9sbG93TW9kZS5lbmFibGVkID8gJ1llcycgOiAnTm8nfWApO1xuICAgICAgICAgICAgaWYgKHN0YXR1cy5mb2xsb3dNb2RlLmVuYWJsZWQgJiYgc3RhdHVzLmZvbGxvd01vZGUuYnJhbmNoKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZvbGxvd2luZyBicmFuY2g6ICR7c3RhdHVzLmZvbGxvd01vZGUuYnJhbmNofWApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBXb3JrdHJlZTogJHtzdGF0dXMuZm9sbG93TW9kZS5yZXBvUGF0aCB8fCAnVW5rbm93bid9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdcXG5HaXQgRm9sbG93IE1vZGU6IE5vdCBpbiBhIGdpdCByZXBvc2l0b3J5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICdmb2xsb3cnOiB7XG4gICAgICAgIC8vIFBhcnNlIGNvbW1hbmQgbGluZSBhcmd1bWVudHNcbiAgICAgICAgY29uc3QgYXJncyA9IHByb2Nlc3MuYXJndi5zbGljZSgzKTtcbiAgICAgICAgbGV0IHdvcmt0cmVlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgbWFpblJlcG9QYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gUGFyc2UgZmxhZ3NcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgc3dpdGNoIChhcmdzW2ldKSB7XG4gICAgICAgICAgICBjYXNlICctLWZyb20td29ya3RyZWUnOlxuICAgICAgICAgICAgICAvLyBGbGFnIGhhbmRsZWQgYnkgdnQgc2NyaXB0XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnLS13b3JrdHJlZS1wYXRoJzpcbiAgICAgICAgICAgICAgd29ya3RyZWVQYXRoID0gYXJnc1srK2ldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJy0tbWFpbi1yZXBvJzpcbiAgICAgICAgICAgICAgbWFpblJlcG9QYXRoID0gYXJnc1srK2ldO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZXRGb2xsb3dNb2RlKHtcbiAgICAgICAgICBlbmFibGU6IHRydWUsXG4gICAgICAgICAgd29ya3RyZWVQYXRoLFxuICAgICAgICAgIG1haW5SZXBvUGF0aCxcbiAgICAgICAgICAvLyBGb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSwgcGFzcyByZXBvUGF0aCBpZiBtYWluUmVwb1BhdGggbm90IHNldFxuICAgICAgICAgIHJlcG9QYXRoOiBtYWluUmVwb1BhdGgsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgLy8gU3VjY2VzcyBtZXNzYWdlIGlzIGFscmVhZHkgcHJpbnRlZCBieSB0aGUgdnQgc2NyaXB0XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGVuYWJsZSBmb2xsb3cgbW9kZTogJHtyZXNwb25zZS5lcnJvciB8fCAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICd1bmZvbGxvdyc6IHtcbiAgICAgICAgY29uc3QgcmVwb1BhdGggPSBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNldEZvbGxvd01vZGUoe1xuICAgICAgICAgIHJlcG9QYXRoLFxuICAgICAgICAgIGVuYWJsZTogZmFsc2UsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChyZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ0Rpc2FibGVkIGZvbGxvdyBtb2RlJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGRpc2FibGUgZm9sbG93IG1vZGU6ICR7cmVzcG9uc2UuZXJyb3IgfHwgJ1Vua25vd24gZXJyb3InfWApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnZ2l0LWV2ZW50Jzoge1xuICAgICAgICBjb25zdCByZXBvUGF0aCA9IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAgICAgYXdhaXQgY2xpZW50LnNlbmRHaXRFdmVudCh7XG4gICAgICAgICAgcmVwb1BhdGgsXG4gICAgICAgICAgdHlwZTogJ290aGVyJywgLy8gV2UgZG9uJ3Qga25vdyB0aGUgc3BlY2lmaWMgdHlwZSBmcm9tIGNvbW1hbmQgbGluZVxuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UgPT09ICdWaWJlVHVubmVsIHNlcnZlciBpcyBub3QgcnVubmluZycpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBWaWJlVHVubmVsIHNlcnZlciBpcyBub3QgcnVubmluZycpO1xuICAgICAgY29uc29sZS5lcnJvcignU3RhcnQgdGhlIHNlcnZlciBmaXJzdCB3aXRoOiB2aWJldHVubmVsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dlci5lcnJvcignU29ja2V0IGNvbW1hbmQgZmFpbGVkOicsIGVycm9yKTtcbiAgICB9XG4gICAgY2xvc2VMb2dnZXIoKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuLyoqXG4gKiBTdGFydCB0aGUgVmliZVR1bm5lbCBzZXJ2ZXIgd2l0aCBvcHRpb25hbCBzdGFydHVwIGxvZ2dpbmdcbiAqL1xuZnVuY3Rpb24gaGFuZGxlU3RhcnRTZXJ2ZXIoKTogdm9pZCB7XG4gIC8vIFNob3cgc3RhcnR1cCBtZXNzYWdlIGF0IElORk8gbGV2ZWwgb3Igd2hlbiBkZWJ1ZyBpcyBlbmFibGVkXG4gIGlmICh2ZXJib3NpdHlMZXZlbCAhPT0gdW5kZWZpbmVkICYmIHZlcmJvc2l0eUxldmVsID49IFZlcmJvc2l0eUxldmVsLklORk8pIHtcbiAgICBsb2dnZXIubG9nKCdTdGFydGluZyBWaWJlVHVubmVsIHNlcnZlci4uLicpO1xuICB9XG4gIHN0YXJ0VmliZVR1bm5lbFNlcnZlcigpO1xufVxuXG4vKipcbiAqIFBhcnNlIGNvbW1hbmQgbGluZSBhcmd1bWVudHMgYW5kIGV4ZWN1dGUgYXBwcm9wcmlhdGUgYWN0aW9uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlQ29tbWFuZEFuZEV4ZWN1dGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGNvbW1hbmQgPSBwcm9jZXNzLmFyZ3ZbMl07XG5cbiAgc3dpdGNoIChjb21tYW5kKSB7XG4gICAgY2FzZSAndmVyc2lvbic6XG4gICAgICBwcmludFZlcnNpb24oKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnaGVscCc6XG4gICAgY2FzZSAnLS1oZWxwJzpcbiAgICBjYXNlICctaCc6XG4gICAgICBwcmludEhlbHAoKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgY2FzZSAnZndkJzpcbiAgICAgIGF3YWl0IGhhbmRsZUZvcndhcmRDb21tYW5kKCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ3N0YXR1cyc6XG4gICAgY2FzZSAnZm9sbG93JzpcbiAgICBjYXNlICd1bmZvbGxvdyc6XG4gICAgY2FzZSAnZ2l0LWV2ZW50JzpcbiAgICAgIGF3YWl0IGhhbmRsZVNvY2tldENvbW1hbmQoY29tbWFuZCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ3N5c3RlbWQnOlxuICAgICAgYXdhaXQgaGFuZGxlU3lzdGVtZFNlcnZpY2UoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIC8vIE5vIGNvbW1hbmQgcHJvdmlkZWQgLSBzdGFydCB0aGUgc2VydmVyXG4gICAgICBoYW5kbGVTdGFydFNlcnZlcigpO1xuICAgICAgYnJlYWs7XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiB0aGlzIG1vZHVsZSBpcyBiZWluZyBydW4gZGlyZWN0bHkgKG5vdCBpbXBvcnRlZClcbiAqL1xuZnVuY3Rpb24gaXNNYWluTW9kdWxlKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgICFtb2R1bGUucGFyZW50ICYmXG4gICAgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlIHx8XG4gICAgICByZXF1aXJlLm1haW4gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgKHJlcXVpcmUubWFpbj8uZmlsZW5hbWU/LmVuZHNXaXRoKCcvdmliZXR1bm5lbC1jbGknKSA/PyBmYWxzZSkpXG4gICk7XG59XG5cbi8vIE1haW4gZXhlY3V0aW9uXG5pZiAoaXNNYWluTW9kdWxlKCkpIHtcbiAgcGFyc2VDb21tYW5kQW5kRXhlY3V0ZSgpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgIGxvZ2dlci5lcnJvcignVW5oYW5kbGVkIGVycm9yIGluIG1haW4gZXhlY3V0aW9uOicsIGVycm9yKTtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdTdGFjayB0cmFjZTonLCBlcnJvci5zdGFjayk7XG4gICAgfVxuICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9KTtcbn1cbiJdfQ==