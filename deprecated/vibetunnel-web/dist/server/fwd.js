#!/usr/bin/env pnpm exec tsx --no-deprecation
"use strict";
/**
 * VibeTunnel Forward (fwd.ts)
 *
 * A simple command-line tool that spawns a PTY session and forwards it
 * using the VibeTunnel PTY infrastructure.
 *
 * Usage:
 *   pnpm exec tsx src/fwd.ts <command> [args...]
 *   pnpm exec tsx src/fwd.ts claude --resume
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVibeTunnelForward = startVibeTunnelForward;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const types_js_1 = require("../shared/types.js");
const index_js_1 = require("./pty/index.js");
const session_manager_js_1 = require("./pty/session-manager.js");
const socket_client_js_1 = require("./pty/socket-client.js");
const activity_detector_js_1 = require("./utils/activity-detector.js");
const claude_patcher_js_1 = require("./utils/claude-patcher.js");
const git_info_js_1 = require("./utils/git-info.js");
const logger_js_1 = require("./utils/logger.js");
const session_naming_js_1 = require("./utils/session-naming.js");
const terminal_title_js_1 = require("./utils/terminal-title.js");
const verbosity_parser_js_1 = require("./utils/verbosity-parser.js");
const version_js_1 = require("./version.js");
const logger = (0, logger_js_1.createLogger)('fwd');
const _execFile = (0, util_1.promisify)(require('child_process').execFile);
function showUsage() {
    console.log(chalk_1.default.blue(`VibeTunnel Forward v${version_js_1.VERSION}`) + chalk_1.default.gray(` (${version_js_1.BUILD_DATE})`));
    console.log('');
    console.log('Usage:');
    console.log('  pnpm exec tsx src/fwd.ts [--session-id <id>] [--title-mode <mode>] [--verbosity <level>] <command> [args...]');
    console.log('');
    console.log('Options:');
    console.log('  --session-id <id>     Use a pre-generated session ID');
    console.log('  --title-mode <mode>   Terminal title mode: none, filter, static, dynamic');
    console.log('                        (defaults to none for most commands, dynamic for claude)');
    console.log('  --update-title <title> Update session title and exit (requires --session-id)');
    console.log('  --verbosity <level>   Set logging verbosity: silent, error, warn, info, verbose, debug');
    console.log('                        (defaults to error)');
    console.log('  --log-file <path>     Override default log file location');
    console.log('                        (defaults to ~/.vibetunnel/log.txt)');
    console.log('');
    console.log('Title Modes:');
    console.log('  none     - No title management (default)');
    console.log('  filter   - Block all title changes from applications');
    console.log('  static   - Show working directory and command');
    console.log('  dynamic  - Show directory, command, and activity (auto-selected for claude)');
    console.log('');
    console.log('Verbosity Levels:');
    console.log(`  ${chalk_1.default.gray('silent')}   - No output except critical errors`);
    console.log(`  ${chalk_1.default.red('error')}    - Only errors ${chalk_1.default.gray('(default)')}`);
    console.log(`  ${chalk_1.default.yellow('warn')}     - Errors and warnings`);
    console.log(`  ${chalk_1.default.green('info')}     - Errors, warnings, and informational messages`);
    console.log(`  ${chalk_1.default.blue('verbose')}  - All messages except debug`);
    console.log(`  ${chalk_1.default.magenta('debug')}    - All messages including debug`);
    console.log('');
    console.log(`Quick verbosity: ${chalk_1.default.cyan('-q (quiet), -v (verbose), -vv (extra), -vvv (debug)')}`);
    console.log('');
    console.log('Environment Variables:');
    console.log('  VIBETUNNEL_TITLE_MODE=<mode>         Set default title mode');
    console.log('  VIBETUNNEL_CLAUDE_DYNAMIC_TITLE=1    Force dynamic title for Claude');
    console.log('  VIBETUNNEL_LOG_LEVEL=<level>         Set default verbosity level');
    console.log('  VIBETUNNEL_DEBUG=1                   Enable debug mode (legacy)');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm exec tsx src/fwd.ts claude --resume');
    console.log('  pnpm exec tsx src/fwd.ts --title-mode static bash -l');
    console.log('  pnpm exec tsx src/fwd.ts --title-mode filter vim');
    console.log('  pnpm exec tsx src/fwd.ts --session-id abc123 claude');
    console.log('  pnpm exec tsx src/fwd.ts --update-title "New Title" --session-id abc123');
    console.log('  pnpm exec tsx src/fwd.ts --verbosity silent npm test');
    console.log('');
    console.log('The command will be spawned in the current working directory');
    console.log('and managed through the VibeTunnel PTY infrastructure.');
}
async function startVibeTunnelForward(args) {
    // Parse verbosity from environment variables
    let verbosityLevel = (0, verbosity_parser_js_1.parseVerbosityFromEnv)();
    // Set debug mode on logger for backward compatibility
    if (verbosityLevel === logger_js_1.VerbosityLevel.DEBUG) {
        logger.setDebugMode(true);
    }
    // Parse command line arguments
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showUsage();
        (0, logger_js_1.closeLogger)();
        process.exit(0);
    }
    logger.debug(chalk_1.default.blue(`VibeTunnel Forward v${version_js_1.VERSION}`) + chalk_1.default.gray(` (${version_js_1.BUILD_DATE})`));
    logger.debug(`Full command: ${args.join(' ')}`);
    // Parse command line arguments
    let sessionId;
    let titleMode = types_js_1.TitleMode.NONE;
    let updateTitle;
    let logFilePath;
    let remainingArgs = args;
    // Check environment variables for title mode
    if (process.env.VIBETUNNEL_TITLE_MODE) {
        const envMode = process.env.VIBETUNNEL_TITLE_MODE.toLowerCase();
        if (Object.values(types_js_1.TitleMode).includes(envMode)) {
            titleMode = envMode;
            logger.debug(`Title mode set from environment: ${titleMode}`);
        }
    }
    // Force dynamic mode for Claude via environment variable
    if (process.env.VIBETUNNEL_CLAUDE_DYNAMIC_TITLE === '1' ||
        process.env.VIBETUNNEL_CLAUDE_DYNAMIC_TITLE === 'true') {
        titleMode = types_js_1.TitleMode.DYNAMIC;
        logger.debug('Forced dynamic title mode for Claude via environment variable');
    }
    // Parse flags
    while (remainingArgs.length > 0) {
        if (remainingArgs[0] === '--session-id' && remainingArgs.length > 1) {
            sessionId = remainingArgs[1];
            remainingArgs = remainingArgs.slice(2);
        }
        else if (remainingArgs[0] === '--update-title' && remainingArgs.length > 1) {
            updateTitle = remainingArgs[1];
            remainingArgs = remainingArgs.slice(2);
        }
        else if (remainingArgs[0] === '--title-mode' && remainingArgs.length > 1) {
            const mode = remainingArgs[1].toLowerCase();
            if (Object.values(types_js_1.TitleMode).includes(mode)) {
                titleMode = mode;
            }
            else {
                logger.error(`Invalid title mode: ${remainingArgs[1]}`);
                logger.error(`Valid modes: ${Object.values(types_js_1.TitleMode).join(', ')}`);
                (0, logger_js_1.closeLogger)();
                process.exit(1);
            }
            remainingArgs = remainingArgs.slice(2);
        }
        else if (remainingArgs[0] === '--verbosity' && remainingArgs.length > 1) {
            const parsedLevel = (0, logger_js_1.parseVerbosityLevel)(remainingArgs[1]);
            if (parsedLevel !== undefined) {
                verbosityLevel = parsedLevel;
            }
            else {
                logger.error(`Invalid verbosity level: ${remainingArgs[1]}`);
                logger.error('Valid levels: silent, error, warn, info, verbose, debug');
                (0, logger_js_1.closeLogger)();
                process.exit(1);
            }
            remainingArgs = remainingArgs.slice(2);
        }
        else if (remainingArgs[0] === '--log-file' && remainingArgs.length > 1) {
            logFilePath = remainingArgs[1];
            remainingArgs = remainingArgs.slice(2);
        }
        else {
            // Not a flag, must be the start of the command
            break;
        }
    }
    // Handle -- separator (used by some shells as end-of-options marker)
    // This allows commands like: fwd -- command-with-dashes
    if (remainingArgs[0] === '--' && remainingArgs.length > 1) {
        remainingArgs = remainingArgs.slice(1);
    }
    // Apply log file path if set
    if (logFilePath !== undefined) {
        (0, logger_js_1.setLogFilePath)(logFilePath);
        logger.debug(`Log file path set to: ${logFilePath}`);
    }
    // Apply verbosity level if set
    if (verbosityLevel !== undefined) {
        (0, logger_js_1.setVerbosityLevel)(verbosityLevel);
        if (verbosityLevel >= logger_js_1.VerbosityLevel.INFO) {
            logger.log(`Verbosity level set to: ${logger_js_1.VerbosityLevel[verbosityLevel].toLowerCase()}`);
        }
    }
    // Handle special case: --update-title mode
    if (updateTitle !== undefined) {
        if (!sessionId) {
            logger.error('--update-title requires --session-id');
            (0, logger_js_1.closeLogger)();
            process.exit(1);
        }
        // Initialize session manager
        const controlPath = path.join(os.homedir(), '.vibetunnel', 'control');
        const sessionManager = new session_manager_js_1.SessionManager(controlPath);
        // Validate session ID format for security
        if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
            logger.error(`Invalid session ID format: "${sessionId}". Session IDs must only contain letters, numbers, hyphens (-), and underscores (_).`);
            (0, logger_js_1.closeLogger)();
            process.exit(1);
        }
        try {
            // Load existing session info
            const sessionInfo = sessionManager.loadSessionInfo(sessionId);
            if (!sessionInfo) {
                logger.error(`Session ${sessionId} not found`);
                (0, logger_js_1.closeLogger)();
                process.exit(1);
            }
            // Sanitize the title - limit length and filter out problematic characters
            const sanitizedTitle = updateTitle
                .substring(0, 256) // Limit length
                .split('')
                .filter((char) => {
                const code = char.charCodeAt(0);
                // Allow printable characters (space to ~) and extended ASCII/Unicode
                return code >= 32 && code !== 127 && (code < 128 || code > 159);
            })
                .join('');
            // Update the title via IPC if session is active
            const socketPath = path.join(controlPath, sessionId, 'ipc.sock');
            // Check if IPC socket exists (session is active)
            if (fs.existsSync(socketPath)) {
                logger.debug(`IPC socket found, sending title update via IPC`);
                // Connect to IPC socket and send update-title command
                const socketClient = new socket_client_js_1.VibeTunnelSocketClient(socketPath, {
                    autoReconnect: false, // One-shot operation
                });
                try {
                    await socketClient.connect();
                    // Send update-title command
                    const sent = socketClient.updateTitle(sanitizedTitle);
                    if (sent) {
                        logger.log(`Session title updated to: ${sanitizedTitle}`);
                        // IPC update succeeded, server will handle the file update
                        socketClient.disconnect();
                        (0, logger_js_1.closeLogger)();
                        process.exit(0);
                    }
                    else {
                        logger.warn(`Failed to send title update via IPC, falling back to file update`);
                    }
                    // Disconnect after sending
                    socketClient.disconnect();
                }
                catch (ipcError) {
                    logger.warn(`IPC connection failed: ${ipcError}, falling back to file update`);
                }
            }
            else {
                logger.debug(`No IPC socket found, session might not be active`);
            }
            // Only update the file if IPC failed or socket doesn't exist
            sessionInfo.name = sanitizedTitle;
            sessionManager.saveSessionInfo(sessionId, sessionInfo);
            logger.log(`Session title updated to: ${sanitizedTitle}`);
            (0, logger_js_1.closeLogger)();
            process.exit(0);
        }
        catch (error) {
            logger.error(`Failed to update session title: ${error instanceof Error ? error.message : String(error)}`);
            (0, logger_js_1.closeLogger)();
            process.exit(1);
        }
    }
    let command = remainingArgs;
    if (command.length === 0) {
        logger.error('No command specified');
        showUsage();
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    }
    // Check if this is Claude and patch it if necessary (only in debug mode)
    if (process.env.VIBETUNNEL_DEBUG === '1' || process.env.VIBETUNNEL_DEBUG === 'true') {
        const patchedCommand = (0, claude_patcher_js_1.checkAndPatchClaude)(command);
        if (patchedCommand !== command) {
            command = patchedCommand;
            logger.debug(`Command updated after patching`);
        }
    }
    // Auto-select dynamic mode for Claude if no mode was explicitly set
    if (titleMode === types_js_1.TitleMode.NONE) {
        // Check all command arguments for Claude
        const isClaudeCommand = command.some((arg) => arg.toLowerCase().includes('claude'));
        if (isClaudeCommand) {
            titleMode = types_js_1.TitleMode.DYNAMIC;
            logger.log(chalk_1.default.cyan('✓ Auto-selected dynamic title mode for Claude'));
            logger.debug(`Detected Claude in command: ${command.join(' ')}`);
        }
    }
    const cwd = process.cwd();
    // Initialize PTY manager with fallback support
    const controlPath = path.join(os.homedir(), '.vibetunnel', 'control');
    logger.debug(`Control path: ${controlPath}`);
    // Initialize PtyManager before creating instance
    await index_js_1.PtyManager.initialize().catch((error) => {
        logger.error('Failed to initialize PTY manager:', error);
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    });
    const ptyManager = new index_js_1.PtyManager(controlPath);
    // Store original terminal dimensions
    // For external spawns, wait a moment for terminal to fully initialize
    const isExternalSpawn = process.env.VIBETUNNEL_SESSION_ID !== undefined;
    let originalCols;
    let originalRows;
    if (isExternalSpawn) {
        // Give terminal window time to fully initialize its dimensions
        await new Promise((resolve) => setTimeout(resolve, 100));
        // For external spawns, try to get the actual terminal size
        // If stdout isn't properly connected, don't use fallback values
        if (process.stdout.isTTY && process.stdout.columns && process.stdout.rows) {
            originalCols = process.stdout.columns;
            originalRows = process.stdout.rows;
            logger.debug(`External spawn using actual terminal size: ${originalCols}x${originalRows}`);
        }
        else {
            // Don't pass dimensions - let PTY use terminal's natural size
            logger.debug('External spawn: terminal dimensions not available, using terminal defaults');
        }
    }
    else {
        // For non-external spawns, use reasonable defaults
        originalCols = process.stdout.columns || 120;
        originalRows = process.stdout.rows || 40;
        logger.debug(`Regular spawn with dimensions: ${originalCols}x${originalRows}`);
    }
    try {
        // Create a human-readable session name
        const sessionName = (0, session_naming_js_1.generateSessionName)(command, cwd);
        // Pre-generate session ID if not provided
        const finalSessionId = sessionId || `fwd_${Date.now()}`;
        logger.log(`Creating session for command: ${command.join(' ')}`);
        logger.debug(`Session ID: ${finalSessionId}, working directory: ${cwd}`);
        // Log title mode if not default
        if (titleMode !== types_js_1.TitleMode.NONE) {
            const modeDescriptions = {
                [types_js_1.TitleMode.FILTER]: 'Terminal title changes will be blocked',
                [types_js_1.TitleMode.STATIC]: 'Terminal title will show path and command',
                [types_js_1.TitleMode.DYNAMIC]: 'Terminal title will show path, command, and activity',
            };
            logger.log(chalk_1.default.cyan(`✓ ${modeDescriptions[titleMode]}`));
        }
        // Detect Git information
        const gitInfo = await (0, git_info_js_1.detectGitInfo)(cwd);
        // Variables that need to be accessible in cleanup
        let sessionFileWatcher;
        let fileWatchDebounceTimer;
        let isExitingNormally = false;
        const sessionOptions = {
            sessionId: finalSessionId,
            name: sessionName,
            workingDir: cwd,
            titleMode: titleMode,
            forwardToStdout: true,
            gitRepoPath: gitInfo.gitRepoPath,
            gitBranch: gitInfo.gitBranch,
            gitAheadCount: gitInfo.gitAheadCount,
            gitBehindCount: gitInfo.gitBehindCount,
            gitHasChanges: gitInfo.gitHasChanges,
            gitIsWorktree: gitInfo.gitIsWorktree,
            gitMainRepoPath: gitInfo.gitMainRepoPath,
            onExit: async (exitCode) => {
                // Mark that we're exiting normally
                isExitingNormally = true;
                // Show exit message
                logger.log(chalk_1.default.yellow(`\n✓ VibeTunnel session ended`) + chalk_1.default.gray(` (exit code: ${exitCode})`));
                // Remove resize listener
                process.stdout.removeListener('resize', resizeHandler);
                // Restore terminal settings and clean up stdin
                if (process.stdin.isTTY) {
                    logger.debug('Restoring terminal to normal mode');
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                process.stdin.removeAllListeners();
                // Destroy stdin to ensure it doesn't keep the process alive
                if (process.stdin.destroy) {
                    process.stdin.destroy();
                }
                // Restore original stdout.write if we hooked it
                if (cleanupStdout) {
                    cleanupStdout();
                }
                // Clean up file watchers
                if (sessionFileWatcher) {
                    sessionFileWatcher.close();
                    sessionFileWatcher = undefined;
                    logger.debug('Closed session file watcher');
                }
                if (fileWatchDebounceTimer) {
                    clearTimeout(fileWatchDebounceTimer);
                }
                // Stop watching the file
                fs.unwatchFile(sessionJsonPath);
                // Clean up only this session, not all sessions
                logger.debug(`Cleaning up session ${finalSessionId}`);
                try {
                    await ptyManager.killSession(finalSessionId);
                }
                catch (error) {
                    // Session might already be cleaned up
                    logger.debug(`Session ${finalSessionId} cleanup error (likely already cleaned):`, error);
                }
                // Force exit
                (0, logger_js_1.closeLogger)();
                process.exit(exitCode || 0);
            },
        };
        // Only add dimensions if they're available (for non-external spawns or when TTY is properly connected)
        if (originalCols !== undefined && originalRows !== undefined) {
            sessionOptions.cols = originalCols;
            sessionOptions.rows = originalRows;
        }
        const result = await ptyManager.createSession(command, sessionOptions);
        // Get session info
        const session = ptyManager.getSession(result.sessionId);
        if (!session) {
            throw new Error('Session not found after creation');
        }
        // Log session info with version
        logger.log(chalk_1.default.green(`✓ VibeTunnel session started`) + chalk_1.default.gray(` (v${version_js_1.VERSION})`));
        logger.log(chalk_1.default.gray('Command:'), command.join(' '));
        logger.log(chalk_1.default.gray('Control directory:'), path.join(controlPath, result.sessionId));
        logger.log(chalk_1.default.gray('Build:'), `${version_js_1.BUILD_DATE} | Commit: ${version_js_1.GIT_COMMIT}`);
        // Connect to the session's IPC socket
        const socketPath = path.join(controlPath, result.sessionId, 'ipc.sock');
        const socketClient = new socket_client_js_1.VibeTunnelSocketClient(socketPath, {
            autoReconnect: true,
            heartbeatInterval: 30000, // 30 seconds
        });
        // Wait for socket connection
        try {
            await socketClient.connect();
            logger.debug('Connected to session IPC socket');
        }
        catch (error) {
            logger.error('Failed to connect to session socket:', error);
            throw error;
        }
        // Set up terminal resize handler
        const resizeHandler = () => {
            const cols = process.stdout.columns || 80;
            const rows = process.stdout.rows || 24;
            logger.debug(`Terminal resized to ${cols}x${rows}`);
            // Send resize command through socket
            if (!socketClient.resize(cols, rows)) {
                logger.error('Failed to send resize command');
            }
        };
        // Listen for terminal resize events
        process.stdout.on('resize', resizeHandler);
        // Set up file watcher for session.json changes (for external updates)
        const sessionJsonPath = path.join(controlPath, result.sessionId, 'session.json');
        let lastKnownSessionName = result.sessionInfo.name;
        // Set up file watcher with retry logic
        const setupFileWatcher = async (retryCount = 0) => {
            const maxRetries = 5;
            const retryDelay = 500 * 2 ** retryCount; // Exponential backoff
            try {
                // Check if file exists
                if (!fs.existsSync(sessionJsonPath)) {
                    if (retryCount < maxRetries) {
                        logger.debug(`Session file not found, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                        setTimeout(() => setupFileWatcher(retryCount + 1), retryDelay);
                        return;
                    }
                    else {
                        logger.warn(`Session file not found after ${maxRetries} attempts: ${sessionJsonPath}`);
                        return;
                    }
                }
                logger.log(`Setting up file watcher for session name changes`);
                // Function to check and update title if session name changed
                const checkSessionNameChange = () => {
                    try {
                        // Check file still exists before reading
                        if (!fs.existsSync(sessionJsonPath)) {
                            return;
                        }
                        const sessionContent = fs.readFileSync(sessionJsonPath, 'utf-8');
                        const updatedInfo = JSON.parse(sessionContent);
                        // Check if session name changed
                        if (updatedInfo.name !== lastKnownSessionName) {
                            logger.debug(`[File Watch] Session name changed from "${lastKnownSessionName}" to "${updatedInfo.name}"`);
                            lastKnownSessionName = updatedInfo.name;
                            // Always update terminal title when session name changes
                            // Generate new title sequence based on title mode
                            let titleSequence;
                            if (titleMode === types_js_1.TitleMode.NONE || titleMode === types_js_1.TitleMode.FILTER) {
                                // For NONE and FILTER modes, just use the session name
                                titleSequence = `\x1B]2;${updatedInfo.name}\x07`;
                            }
                            else {
                                // For STATIC and DYNAMIC, use the full format with path and command
                                titleSequence = (0, terminal_title_js_1.generateTitleSequence)(cwd, command, updatedInfo.name);
                            }
                            // Write title sequence to terminal
                            process.stdout.write(titleSequence);
                            logger.log(`Updated terminal title to "${updatedInfo.name}" via file watcher`);
                        }
                    }
                    catch (error) {
                        logger.error('Failed to check session.json:', error);
                    }
                };
                // Use fs.watchFile for more reliable file monitoring (polling-based)
                fs.watchFile(sessionJsonPath, { interval: 500 }, (curr, prev) => {
                    logger.debug(`[File Watch] File stats changed - mtime: ${curr.mtime} vs ${prev.mtime}`);
                    if (curr.mtime !== prev.mtime) {
                        checkSessionNameChange();
                    }
                });
                // Also use fs.watch as a fallback for immediate notifications
                try {
                    const sessionDir = path.dirname(sessionJsonPath);
                    sessionFileWatcher = fs.watch(sessionDir, (eventType, filename) => {
                        // Only log in debug mode to avoid noise
                        logger.debug(`[File Watch] Directory event: ${eventType} on ${filename || 'unknown'}`);
                        // Check if it's our file
                        // On macOS, filename might be undefined, so we can't filter properly
                        // In that case, skip fs.watch events and rely on fs.watchFile instead
                        if (filename && (filename === 'session.json' || filename === 'session.json.tmp')) {
                            // Debounce rapid changes
                            if (fileWatchDebounceTimer) {
                                clearTimeout(fileWatchDebounceTimer);
                            }
                            fileWatchDebounceTimer = setTimeout(checkSessionNameChange, 100);
                        }
                    });
                }
                catch (error) {
                    logger.warn('Failed to set up fs.watch, relying on fs.watchFile:', error);
                }
                logger.log(`File watcher successfully set up with polling fallback`);
                // Clean up watcher on error if it was created
                sessionFileWatcher?.on('error', (error) => {
                    logger.error('File watcher error:', error);
                    sessionFileWatcher?.close();
                    sessionFileWatcher = undefined;
                });
            }
            catch (error) {
                logger.error('Failed to set up file watcher:', error);
                if (retryCount < maxRetries) {
                    setTimeout(() => setupFileWatcher(retryCount + 1), retryDelay);
                }
            }
        };
        // Start setting up the file watcher after a short delay
        setTimeout(() => setupFileWatcher(), 500);
        // Set up activity detector for Claude status updates
        let activityDetector;
        let cleanupStdout;
        if (titleMode === types_js_1.TitleMode.DYNAMIC) {
            activityDetector = new activity_detector_js_1.ActivityDetector(command, sessionId);
            // Hook into stdout to detect Claude status
            const originalStdoutWrite = process.stdout.write.bind(process.stdout);
            let isProcessingActivity = false;
            // Create a proper override that handles all overloads
            const _stdoutWriteOverride = function (chunk, encodingOrCallback, callback) {
                // Handle the overload: write(chunk, callback)
                if (typeof encodingOrCallback === 'function') {
                    callback = encodingOrCallback;
                    encodingOrCallback = undefined;
                }
                if (isProcessingActivity) {
                    if (callback) {
                        return originalStdoutWrite.call(this, chunk, encodingOrCallback, callback);
                    }
                    else if (encodingOrCallback && typeof encodingOrCallback === 'string') {
                        return originalStdoutWrite.call(this, chunk, encodingOrCallback);
                    }
                    else {
                        return originalStdoutWrite.call(this, chunk);
                    }
                }
                isProcessingActivity = true;
                try {
                    // Process output through activity detector
                    if (activityDetector && typeof chunk === 'string') {
                        const { filteredData, activity } = activityDetector.processOutput(chunk);
                        // Send status update if detected
                        if (activity.specificStatus) {
                            socketClient.sendStatus(activity.specificStatus.app, activity.specificStatus.status);
                        }
                        // Call original with correct arguments
                        if (callback) {
                            return originalStdoutWrite.call(this, filteredData, encodingOrCallback, callback);
                        }
                        else if (encodingOrCallback && typeof encodingOrCallback === 'string') {
                            return originalStdoutWrite.call(this, filteredData, encodingOrCallback);
                        }
                        else {
                            return originalStdoutWrite.call(this, filteredData);
                        }
                    }
                    // Pass through as-is if not string or no detector
                    if (callback) {
                        return originalStdoutWrite.call(this, chunk, encodingOrCallback, callback);
                    }
                    else if (encodingOrCallback && typeof encodingOrCallback === 'string') {
                        return originalStdoutWrite.call(this, chunk, encodingOrCallback);
                    }
                    else {
                        return originalStdoutWrite.call(this, chunk);
                    }
                }
                finally {
                    isProcessingActivity = false;
                }
            };
            // Apply the override
            process.stdout.write = _stdoutWriteOverride;
            // Store reference for cleanup
            cleanupStdout = () => {
                process.stdout.write = originalStdoutWrite;
            };
            // Ensure cleanup happens on process exit
            process.on('exit', cleanupStdout);
            process.on('SIGINT', cleanupStdout);
            process.on('SIGTERM', cleanupStdout);
        }
        // Set up raw mode for terminal input
        if (process.stdin.isTTY) {
            logger.debug('Setting terminal to raw mode for input forwarding');
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        // Forward stdin through socket
        process.stdin.on('data', (data) => {
            // Send through socket
            if (!socketClient.sendStdin(data)) {
                logger.error('Failed to send stdin data');
            }
        });
        // Handle socket events
        socketClient.on('disconnect', (error) => {
            // Don't log error if we're exiting normally
            if (isExitingNormally) {
                logger.debug('Socket disconnected during normal exit');
                return;
            }
            // Check if this is a common disconnect error during normal operation
            const errorMessage = error?.message || '';
            const isNormalDisconnect = errorMessage.includes('EPIPE') ||
                errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('socket hang up') ||
                errorMessage === 'Unknown error' || // Common during clean exits
                !error; // No error object means clean disconnect
            if (isNormalDisconnect) {
                logger.debug('Socket disconnected (normal termination)');
            }
            else {
                logger.error('Socket disconnected:', error?.message || 'Unknown error');
            }
            process.exit(1);
        });
        socketClient.on('error', (error) => {
            logger.error('Socket error:', error);
        });
        // The process will stay alive because stdin is in raw mode and resumed
    }
    catch (error) {
        logger.error('Failed to create or manage session:', error);
        (0, logger_js_1.closeLogger)();
        process.exit(1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZndkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NlcnZlci9md2QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7Ozs7O0dBU0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBc0ZILHdEQXlxQkM7QUE3dkJELGtEQUEwQjtBQUMxQix1Q0FBeUI7QUFDekIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QiwrQkFBaUM7QUFDakMsaURBQWlFO0FBQ2pFLDZDQUE0QztBQUM1QyxpRUFBMEQ7QUFDMUQsNkRBQWdFO0FBQ2hFLHVFQUFnRTtBQUNoRSxpRUFBZ0U7QUFDaEUscURBQW9EO0FBQ3BELGlEQU8yQjtBQUMzQixpRUFBZ0U7QUFDaEUsaUVBQWtFO0FBQ2xFLHFFQUFvRTtBQUNwRSw2Q0FBK0Q7QUFFL0QsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ25DLE1BQU0sU0FBUyxHQUFHLElBQUEsZ0JBQVMsRUFBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFFL0QsU0FBUyxTQUFTO0lBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsb0JBQU8sRUFBRSxDQUFDLEdBQUcsZUFBSyxDQUFDLElBQUksQ0FBQyxLQUFLLHVCQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDM0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNoQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQ1QsZ0hBQWdILENBQ2pILENBQUM7SUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDeEIsT0FBTyxDQUFDLEdBQUcsQ0FB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QUUsRUFBRTtZQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQztRQUVILHVFQUF1RTtJQUN6RSxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMscUNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0QsSUFBQSx1QkFBVyxHQUFFLENBQUM7UUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgcG5wbSBleGVjIHRzeCAtLW5vLWRlcHJlY2F0aW9uXG5cbi8qKlxuICogVmliZVR1bm5lbCBGb3J3YXJkIChmd2QudHMpXG4gKlxuICogQSBzaW1wbGUgY29tbWFuZC1saW5lIHRvb2wgdGhhdCBzcGF3bnMgYSBQVFkgc2Vzc2lvbiBhbmQgZm9yd2FyZHMgaXRcbiAqIHVzaW5nIHRoZSBWaWJlVHVubmVsIFBUWSBpbmZyYXN0cnVjdHVyZS5cbiAqXG4gKiBVc2FnZTpcbiAqICAgcG5wbSBleGVjIHRzeCBzcmMvZndkLnRzIDxjb21tYW5kPiBbYXJncy4uLl1cbiAqICAgcG5wbSBleGVjIHRzeCBzcmMvZndkLnRzIGNsYXVkZSAtLXJlc3VtZVxuICovXG5cbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyB0eXBlIFNlc3Npb25JbmZvLCBUaXRsZU1vZGUgfSBmcm9tICcuLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgUHR5TWFuYWdlciB9IGZyb20gJy4vcHR5L2luZGV4LmpzJztcbmltcG9ydCB7IFNlc3Npb25NYW5hZ2VyIH0gZnJvbSAnLi9wdHkvc2Vzc2lvbi1tYW5hZ2VyLmpzJztcbmltcG9ydCB7IFZpYmVUdW5uZWxTb2NrZXRDbGllbnQgfSBmcm9tICcuL3B0eS9zb2NrZXQtY2xpZW50LmpzJztcbmltcG9ydCB7IEFjdGl2aXR5RGV0ZWN0b3IgfSBmcm9tICcuL3V0aWxzL2FjdGl2aXR5LWRldGVjdG9yLmpzJztcbmltcG9ydCB7IGNoZWNrQW5kUGF0Y2hDbGF1ZGUgfSBmcm9tICcuL3V0aWxzL2NsYXVkZS1wYXRjaGVyLmpzJztcbmltcG9ydCB7IGRldGVjdEdpdEluZm8gfSBmcm9tICcuL3V0aWxzL2dpdC1pbmZvLmpzJztcbmltcG9ydCB7XG4gIGNsb3NlTG9nZ2VyLFxuICBjcmVhdGVMb2dnZXIsXG4gIHBhcnNlVmVyYm9zaXR5TGV2ZWwsXG4gIHNldExvZ0ZpbGVQYXRoLFxuICBzZXRWZXJib3NpdHlMZXZlbCxcbiAgVmVyYm9zaXR5TGV2ZWwsXG59IGZyb20gJy4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlU2Vzc2lvbk5hbWUgfSBmcm9tICcuL3V0aWxzL3Nlc3Npb24tbmFtaW5nLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVGl0bGVTZXF1ZW5jZSB9IGZyb20gJy4vdXRpbHMvdGVybWluYWwtdGl0bGUuanMnO1xuaW1wb3J0IHsgcGFyc2VWZXJib3NpdHlGcm9tRW52IH0gZnJvbSAnLi91dGlscy92ZXJib3NpdHktcGFyc2VyLmpzJztcbmltcG9ydCB7IEJVSUxEX0RBVEUsIEdJVF9DT01NSVQsIFZFUlNJT04gfSBmcm9tICcuL3ZlcnNpb24uanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2Z3ZCcpO1xuY29uc3QgX2V4ZWNGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5leGVjRmlsZSk7XG5cbmZ1bmN0aW9uIHNob3dVc2FnZSgpIHtcbiAgY29uc29sZS5sb2coY2hhbGsuYmx1ZShgVmliZVR1bm5lbCBGb3J3YXJkIHYke1ZFUlNJT059YCkgKyBjaGFsay5ncmF5KGAgKCR7QlVJTERfREFURX0pYCkpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdVc2FnZTonKTtcbiAgY29uc29sZS5sb2coXG4gICAgJyAgcG5wbSBleGVjIHRzeCBzcmMvZndkLnRzIFstLXNlc3Npb24taWQgPGlkPl0gWy0tdGl0bGUtbW9kZSA8bW9kZT5dIFstLXZlcmJvc2l0eSA8bGV2ZWw+XSA8Y29tbWFuZD4gW2FyZ3MuLi5dJ1xuICApO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdPcHRpb25zOicpO1xuICBjb25zb2xlLmxvZygnICAtLXNlc3Npb24taWQgPGlkPiAgICAgVXNlIGEgcHJlLWdlbmVyYXRlZCBzZXNzaW9uIElEJyk7XG4gIGNvbnNvbGUubG9nKCcgIC0tdGl0bGUtbW9kZSA8bW9kZT4gICBUZXJtaW5hbCB0aXRsZSBtb2RlOiBub25lLCBmaWx0ZXIsIHN0YXRpYywgZHluYW1pYycpO1xuICBjb25zb2xlLmxvZygnICAgICAgICAgICAgICAgICAgICAgICAgKGRlZmF1bHRzIHRvIG5vbmUgZm9yIG1vc3QgY29tbWFuZHMsIGR5bmFtaWMgZm9yIGNsYXVkZSknKTtcbiAgY29uc29sZS5sb2coJyAgLS11cGRhdGUtdGl0bGUgPHRpdGxlPiBVcGRhdGUgc2Vzc2lvbiB0aXRsZSBhbmQgZXhpdCAocmVxdWlyZXMgLS1zZXNzaW9uLWlkKScpO1xuICBjb25zb2xlLmxvZyhcbiAgICAnICAtLXZlcmJvc2l0eSA8bGV2ZWw+ICAgU2V0IGxvZ2dpbmcgdmVyYm9zaXR5OiBzaWxlbnQsIGVycm9yLCB3YXJuLCBpbmZvLCB2ZXJib3NlLCBkZWJ1ZydcbiAgKTtcbiAgY29uc29sZS5sb2coJyAgICAgICAgICAgICAgICAgICAgICAgIChkZWZhdWx0cyB0byBlcnJvciknKTtcbiAgY29uc29sZS5sb2coJyAgLS1sb2ctZmlsZSA8cGF0aD4gICAgIE92ZXJyaWRlIGRlZmF1bHQgbG9nIGZpbGUgbG9jYXRpb24nKTtcbiAgY29uc29sZS5sb2coJyAgICAgICAgICAgICAgICAgICAgICAgIChkZWZhdWx0cyB0byB+Ly52aWJldHVubmVsL2xvZy50eHQpJyk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ1RpdGxlIE1vZGVzOicpO1xuICBjb25zb2xlLmxvZygnICBub25lICAgICAtIE5vIHRpdGxlIG1hbmFnZW1lbnQgKGRlZmF1bHQpJyk7XG4gIGNvbnNvbGUubG9nKCcgIGZpbHRlciAgIC0gQmxvY2sgYWxsIHRpdGxlIGNoYW5nZXMgZnJvbSBhcHBsaWNhdGlvbnMnKTtcbiAgY29uc29sZS5sb2coJyAgc3RhdGljICAgLSBTaG93IHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBjb21tYW5kJyk7XG4gIGNvbnNvbGUubG9nKCcgIGR5bmFtaWMgIC0gU2hvdyBkaXJlY3RvcnksIGNvbW1hbmQsIGFuZCBhY3Rpdml0eSAoYXV0by1zZWxlY3RlZCBmb3IgY2xhdWRlKScpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdWZXJib3NpdHkgTGV2ZWxzOicpO1xuICBjb25zb2xlLmxvZyhgICAke2NoYWxrLmdyYXkoJ3NpbGVudCcpfSAgIC0gTm8gb3V0cHV0IGV4Y2VwdCBjcml0aWNhbCBlcnJvcnNgKTtcbiAgY29uc29sZS5sb2coYCAgJHtjaGFsay5yZWQoJ2Vycm9yJyl9ICAgIC0gT25seSBlcnJvcnMgJHtjaGFsay5ncmF5KCcoZGVmYXVsdCknKX1gKTtcbiAgY29uc29sZS5sb2coYCAgJHtjaGFsay55ZWxsb3coJ3dhcm4nKX0gICAgIC0gRXJyb3JzIGFuZCB3YXJuaW5nc2ApO1xuICBjb25zb2xlLmxvZyhgICAke2NoYWxrLmdyZWVuKCdpbmZvJyl9ICAgICAtIEVycm9ycywgd2FybmluZ3MsIGFuZCBpbmZvcm1hdGlvbmFsIG1lc3NhZ2VzYCk7XG4gIGNvbnNvbGUubG9nKGAgICR7Y2hhbGsuYmx1ZSgndmVyYm9zZScpfSAgLSBBbGwgbWVzc2FnZXMgZXhjZXB0IGRlYnVnYCk7XG4gIGNvbnNvbGUubG9nKGAgICR7Y2hhbGsubWFnZW50YSgnZGVidWcnKX0gICAgLSBBbGwgbWVzc2FnZXMgaW5jbHVkaW5nIGRlYnVnYCk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coXG4gICAgYFF1aWNrIHZlcmJvc2l0eTogJHtjaGFsay5jeWFuKCctcSAocXVpZXQpLCAtdiAodmVyYm9zZSksIC12diAoZXh0cmEpLCAtdnZ2IChkZWJ1ZyknKX1gXG4gICk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ0Vudmlyb25tZW50IFZhcmlhYmxlczonKTtcbiAgY29uc29sZS5sb2coJyAgVklCRVRVTk5FTF9USVRMRV9NT0RFPTxtb2RlPiAgICAgICAgIFNldCBkZWZhdWx0IHRpdGxlIG1vZGUnKTtcbiAgY29uc29sZS5sb2coJyAgVklCRVRVTk5FTF9DTEFVREVfRFlOQU1JQ19USVRMRT0xICAgIEZvcmNlIGR5bmFtaWMgdGl0bGUgZm9yIENsYXVkZScpO1xuICBjb25zb2xlLmxvZygnICBWSUJFVFVOTkVMX0xPR19MRVZFTD08bGV2ZWw+ICAgICAgICAgU2V0IGRlZmF1bHQgdmVyYm9zaXR5IGxldmVsJyk7XG4gIGNvbnNvbGUubG9nKCcgIFZJQkVUVU5ORUxfREVCVUc9MSAgICAgICAgICAgICAgICAgICBFbmFibGUgZGVidWcgbW9kZSAobGVnYWN5KScpO1xuICBjb25zb2xlLmxvZygnJyk7XG4gIGNvbnNvbGUubG9nKCdFeGFtcGxlczonKTtcbiAgY29uc29sZS5sb2coJyAgcG5wbSBleGVjIHRzeCBzcmMvZndkLnRzIGNsYXVkZSAtLXJlc3VtZScpO1xuICBjb25zb2xlLmxvZygnICBwbnBtIGV4ZWMgdHN4IHNyYy9md2QudHMgLS10aXRsZS1tb2RlIHN0YXRpYyBiYXNoIC1sJyk7XG4gIGNvbnNvbGUubG9nKCcgIHBucG0gZXhlYyB0c3ggc3JjL2Z3ZC50cyAtLXRpdGxlLW1vZGUgZmlsdGVyIHZpbScpO1xuICBjb25zb2xlLmxvZygnICBwbnBtIGV4ZWMgdHN4IHNyYy9md2QudHMgLS1zZXNzaW9uLWlkIGFiYzEyMyBjbGF1ZGUnKTtcbiAgY29uc29sZS5sb2coJyAgcG5wbSBleGVjIHRzeCBzcmMvZndkLnRzIC0tdXBkYXRlLXRpdGxlIFwiTmV3IFRpdGxlXCIgLS1zZXNzaW9uLWlkIGFiYzEyMycpO1xuICBjb25zb2xlLmxvZygnICBwbnBtIGV4ZWMgdHN4IHNyYy9md2QudHMgLS12ZXJib3NpdHkgc2lsZW50IG5wbSB0ZXN0Jyk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ1RoZSBjb21tYW5kIHdpbGwgYmUgc3Bhd25lZCBpbiB0aGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeScpO1xuICBjb25zb2xlLmxvZygnYW5kIG1hbmFnZWQgdGhyb3VnaCB0aGUgVmliZVR1bm5lbCBQVFkgaW5mcmFzdHJ1Y3R1cmUuJyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFZpYmVUdW5uZWxGb3J3YXJkKGFyZ3M6IHN0cmluZ1tdKSB7XG4gIC8vIFBhcnNlIHZlcmJvc2l0eSBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICBsZXQgdmVyYm9zaXR5TGV2ZWwgPSBwYXJzZVZlcmJvc2l0eUZyb21FbnYoKTtcblxuICAvLyBTZXQgZGVidWcgbW9kZSBvbiBsb2dnZXIgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgaWYgKHZlcmJvc2l0eUxldmVsID09PSBWZXJib3NpdHlMZXZlbC5ERUJVRykge1xuICAgIGxvZ2dlci5zZXREZWJ1Z01vZGUodHJ1ZSk7XG4gIH1cblxuICAvLyBQYXJzZSBjb21tYW5kIGxpbmUgYXJndW1lbnRzXG4gIGlmIChhcmdzLmxlbmd0aCA9PT0gMCB8fCBhcmdzWzBdID09PSAnLS1oZWxwJyB8fCBhcmdzWzBdID09PSAnLWgnKSB7XG4gICAgc2hvd1VzYWdlKCk7XG4gICAgY2xvc2VMb2dnZXIoKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH1cblxuICBsb2dnZXIuZGVidWcoY2hhbGsuYmx1ZShgVmliZVR1bm5lbCBGb3J3YXJkIHYke1ZFUlNJT059YCkgKyBjaGFsay5ncmF5KGAgKCR7QlVJTERfREFURX0pYCkpO1xuICBsb2dnZXIuZGVidWcoYEZ1bGwgY29tbWFuZDogJHthcmdzLmpvaW4oJyAnKX1gKTtcblxuICAvLyBQYXJzZSBjb21tYW5kIGxpbmUgYXJndW1lbnRzXG4gIGxldCBzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHRpdGxlTW9kZTogVGl0bGVNb2RlID0gVGl0bGVNb2RlLk5PTkU7XG4gIGxldCB1cGRhdGVUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBsZXQgbG9nRmlsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgbGV0IHJlbWFpbmluZ0FyZ3MgPSBhcmdzO1xuXG4gIC8vIENoZWNrIGVudmlyb25tZW50IHZhcmlhYmxlcyBmb3IgdGl0bGUgbW9kZVxuICBpZiAocHJvY2Vzcy5lbnYuVklCRVRVTk5FTF9USVRMRV9NT0RFKSB7XG4gICAgY29uc3QgZW52TW9kZSA9IHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfVElUTEVfTU9ERS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChPYmplY3QudmFsdWVzKFRpdGxlTW9kZSkuaW5jbHVkZXMoZW52TW9kZSBhcyBUaXRsZU1vZGUpKSB7XG4gICAgICB0aXRsZU1vZGUgPSBlbnZNb2RlIGFzIFRpdGxlTW9kZTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgVGl0bGUgbW9kZSBzZXQgZnJvbSBlbnZpcm9ubWVudDogJHt0aXRsZU1vZGV9YCk7XG4gICAgfVxuICB9XG5cbiAgLy8gRm9yY2UgZHluYW1pYyBtb2RlIGZvciBDbGF1ZGUgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlXG4gIGlmIChcbiAgICBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX0NMQVVERV9EWU5BTUlDX1RJVExFID09PSAnMScgfHxcbiAgICBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX0NMQVVERV9EWU5BTUlDX1RJVExFID09PSAndHJ1ZSdcbiAgKSB7XG4gICAgdGl0bGVNb2RlID0gVGl0bGVNb2RlLkRZTkFNSUM7XG4gICAgbG9nZ2VyLmRlYnVnKCdGb3JjZWQgZHluYW1pYyB0aXRsZSBtb2RlIGZvciBDbGF1ZGUgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlJyk7XG4gIH1cblxuICAvLyBQYXJzZSBmbGFnc1xuICB3aGlsZSAocmVtYWluaW5nQXJncy5sZW5ndGggPiAwKSB7XG4gICAgaWYgKHJlbWFpbmluZ0FyZ3NbMF0gPT09ICctLXNlc3Npb24taWQnICYmIHJlbWFpbmluZ0FyZ3MubGVuZ3RoID4gMSkge1xuICAgICAgc2Vzc2lvbklkID0gcmVtYWluaW5nQXJnc1sxXTtcbiAgICAgIHJlbWFpbmluZ0FyZ3MgPSByZW1haW5pbmdBcmdzLnNsaWNlKDIpO1xuICAgIH0gZWxzZSBpZiAocmVtYWluaW5nQXJnc1swXSA9PT0gJy0tdXBkYXRlLXRpdGxlJyAmJiByZW1haW5pbmdBcmdzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHVwZGF0ZVRpdGxlID0gcmVtYWluaW5nQXJnc1sxXTtcbiAgICAgIHJlbWFpbmluZ0FyZ3MgPSByZW1haW5pbmdBcmdzLnNsaWNlKDIpO1xuICAgIH0gZWxzZSBpZiAocmVtYWluaW5nQXJnc1swXSA9PT0gJy0tdGl0bGUtbW9kZScgJiYgcmVtYWluaW5nQXJncy5sZW5ndGggPiAxKSB7XG4gICAgICBjb25zdCBtb2RlID0gcmVtYWluaW5nQXJnc1sxXS50b0xvd2VyQ2FzZSgpO1xuICAgICAgaWYgKE9iamVjdC52YWx1ZXMoVGl0bGVNb2RlKS5pbmNsdWRlcyhtb2RlIGFzIFRpdGxlTW9kZSkpIHtcbiAgICAgICAgdGl0bGVNb2RlID0gbW9kZSBhcyBUaXRsZU1vZGU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEludmFsaWQgdGl0bGUgbW9kZTogJHtyZW1haW5pbmdBcmdzWzFdfWApO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYFZhbGlkIG1vZGVzOiAke09iamVjdC52YWx1ZXMoVGl0bGVNb2RlKS5qb2luKCcsICcpfWApO1xuICAgICAgICBjbG9zZUxvZ2dlcigpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgICByZW1haW5pbmdBcmdzID0gcmVtYWluaW5nQXJncy5zbGljZSgyKTtcbiAgICB9IGVsc2UgaWYgKHJlbWFpbmluZ0FyZ3NbMF0gPT09ICctLXZlcmJvc2l0eScgJiYgcmVtYWluaW5nQXJncy5sZW5ndGggPiAxKSB7XG4gICAgICBjb25zdCBwYXJzZWRMZXZlbCA9IHBhcnNlVmVyYm9zaXR5TGV2ZWwocmVtYWluaW5nQXJnc1sxXSk7XG4gICAgICBpZiAocGFyc2VkTGV2ZWwgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB2ZXJib3NpdHlMZXZlbCA9IHBhcnNlZExldmVsO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBJbnZhbGlkIHZlcmJvc2l0eSBsZXZlbDogJHtyZW1haW5pbmdBcmdzWzFdfWApO1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ1ZhbGlkIGxldmVsczogc2lsZW50LCBlcnJvciwgd2FybiwgaW5mbywgdmVyYm9zZSwgZGVidWcnKTtcbiAgICAgICAgY2xvc2VMb2dnZXIoKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgICAgcmVtYWluaW5nQXJncyA9IHJlbWFpbmluZ0FyZ3Muc2xpY2UoMik7XG4gICAgfSBlbHNlIGlmIChyZW1haW5pbmdBcmdzWzBdID09PSAnLS1sb2ctZmlsZScgJiYgcmVtYWluaW5nQXJncy5sZW5ndGggPiAxKSB7XG4gICAgICBsb2dGaWxlUGF0aCA9IHJlbWFpbmluZ0FyZ3NbMV07XG4gICAgICByZW1haW5pbmdBcmdzID0gcmVtYWluaW5nQXJncy5zbGljZSgyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTm90IGEgZmxhZywgbXVzdCBiZSB0aGUgc3RhcnQgb2YgdGhlIGNvbW1hbmRcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSAtLSBzZXBhcmF0b3IgKHVzZWQgYnkgc29tZSBzaGVsbHMgYXMgZW5kLW9mLW9wdGlvbnMgbWFya2VyKVxuICAvLyBUaGlzIGFsbG93cyBjb21tYW5kcyBsaWtlOiBmd2QgLS0gY29tbWFuZC13aXRoLWRhc2hlc1xuICBpZiAocmVtYWluaW5nQXJnc1swXSA9PT0gJy0tJyAmJiByZW1haW5pbmdBcmdzLmxlbmd0aCA+IDEpIHtcbiAgICByZW1haW5pbmdBcmdzID0gcmVtYWluaW5nQXJncy5zbGljZSgxKTtcbiAgfVxuXG4gIC8vIEFwcGx5IGxvZyBmaWxlIHBhdGggaWYgc2V0XG4gIGlmIChsb2dGaWxlUGF0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgc2V0TG9nRmlsZVBhdGgobG9nRmlsZVBhdGgpO1xuICAgIGxvZ2dlci5kZWJ1ZyhgTG9nIGZpbGUgcGF0aCBzZXQgdG86ICR7bG9nRmlsZVBhdGh9YCk7XG4gIH1cblxuICAvLyBBcHBseSB2ZXJib3NpdHkgbGV2ZWwgaWYgc2V0XG4gIGlmICh2ZXJib3NpdHlMZXZlbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgc2V0VmVyYm9zaXR5TGV2ZWwodmVyYm9zaXR5TGV2ZWwpO1xuICAgIGlmICh2ZXJib3NpdHlMZXZlbCA+PSBWZXJib3NpdHlMZXZlbC5JTkZPKSB7XG4gICAgICBsb2dnZXIubG9nKGBWZXJib3NpdHkgbGV2ZWwgc2V0IHRvOiAke1ZlcmJvc2l0eUxldmVsW3ZlcmJvc2l0eUxldmVsXS50b0xvd2VyQ2FzZSgpfWApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBzcGVjaWFsIGNhc2U6IC0tdXBkYXRlLXRpdGxlIG1vZGVcbiAgaWYgKHVwZGF0ZVRpdGxlICE9PSB1bmRlZmluZWQpIHtcbiAgICBpZiAoIXNlc3Npb25JZCkge1xuICAgICAgbG9nZ2VyLmVycm9yKCctLXVwZGF0ZS10aXRsZSByZXF1aXJlcyAtLXNlc3Npb24taWQnKTtcbiAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbGl6ZSBzZXNzaW9uIG1hbmFnZXJcbiAgICBjb25zdCBjb250cm9sUGF0aCA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbCcsICdjb250cm9sJyk7XG4gICAgY29uc3Qgc2Vzc2lvbk1hbmFnZXIgPSBuZXcgU2Vzc2lvbk1hbmFnZXIoY29udHJvbFBhdGgpO1xuXG4gICAgLy8gVmFsaWRhdGUgc2Vzc2lvbiBJRCBmb3JtYXQgZm9yIHNlY3VyaXR5XG4gICAgaWYgKCEvXlthLXpBLVowLTlfLV0rJC8udGVzdChzZXNzaW9uSWQpKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBJbnZhbGlkIHNlc3Npb24gSUQgZm9ybWF0OiBcIiR7c2Vzc2lvbklkfVwiLiBTZXNzaW9uIElEcyBtdXN0IG9ubHkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzLCBoeXBoZW5zICgtKSwgYW5kIHVuZGVyc2NvcmVzIChfKS5gXG4gICAgICApO1xuICAgICAgY2xvc2VMb2dnZXIoKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gTG9hZCBleGlzdGluZyBzZXNzaW9uIGluZm9cbiAgICAgIGNvbnN0IHNlc3Npb25JbmZvID0gc2Vzc2lvbk1hbmFnZXIubG9hZFNlc3Npb25JbmZvKHNlc3Npb25JZCk7XG4gICAgICBpZiAoIXNlc3Npb25JbmZvKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25JZH0gbm90IGZvdW5kYCk7XG4gICAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cblxuICAgICAgLy8gU2FuaXRpemUgdGhlIHRpdGxlIC0gbGltaXQgbGVuZ3RoIGFuZCBmaWx0ZXIgb3V0IHByb2JsZW1hdGljIGNoYXJhY3RlcnNcbiAgICAgIGNvbnN0IHNhbml0aXplZFRpdGxlID0gdXBkYXRlVGl0bGVcbiAgICAgICAgLnN1YnN0cmluZygwLCAyNTYpIC8vIExpbWl0IGxlbmd0aFxuICAgICAgICAuc3BsaXQoJycpXG4gICAgICAgIC5maWx0ZXIoKGNoYXIpID0+IHtcbiAgICAgICAgICBjb25zdCBjb2RlID0gY2hhci5jaGFyQ29kZUF0KDApO1xuICAgICAgICAgIC8vIEFsbG93IHByaW50YWJsZSBjaGFyYWN0ZXJzIChzcGFjZSB0byB+KSBhbmQgZXh0ZW5kZWQgQVNDSUkvVW5pY29kZVxuICAgICAgICAgIHJldHVybiBjb2RlID49IDMyICYmIGNvZGUgIT09IDEyNyAmJiAoY29kZSA8IDEyOCB8fCBjb2RlID4gMTU5KTtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oJycpO1xuXG4gICAgICAvLyBVcGRhdGUgdGhlIHRpdGxlIHZpYSBJUEMgaWYgc2Vzc2lvbiBpcyBhY3RpdmVcbiAgICAgIGNvbnN0IHNvY2tldFBhdGggPSBwYXRoLmpvaW4oY29udHJvbFBhdGgsIHNlc3Npb25JZCwgJ2lwYy5zb2NrJyk7XG5cbiAgICAgIC8vIENoZWNrIGlmIElQQyBzb2NrZXQgZXhpc3RzIChzZXNzaW9uIGlzIGFjdGl2ZSlcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNvY2tldFBhdGgpKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgSVBDIHNvY2tldCBmb3VuZCwgc2VuZGluZyB0aXRsZSB1cGRhdGUgdmlhIElQQ2ApO1xuXG4gICAgICAgIC8vIENvbm5lY3QgdG8gSVBDIHNvY2tldCBhbmQgc2VuZCB1cGRhdGUtdGl0bGUgY29tbWFuZFxuICAgICAgICBjb25zdCBzb2NrZXRDbGllbnQgPSBuZXcgVmliZVR1bm5lbFNvY2tldENsaWVudChzb2NrZXRQYXRoLCB7XG4gICAgICAgICAgYXV0b1JlY29ubmVjdDogZmFsc2UsIC8vIE9uZS1zaG90IG9wZXJhdGlvblxuICAgICAgICB9KTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHNvY2tldENsaWVudC5jb25uZWN0KCk7XG5cbiAgICAgICAgICAvLyBTZW5kIHVwZGF0ZS10aXRsZSBjb21tYW5kXG4gICAgICAgICAgY29uc3Qgc2VudCA9IHNvY2tldENsaWVudC51cGRhdGVUaXRsZShzYW5pdGl6ZWRUaXRsZSk7XG5cbiAgICAgICAgICBpZiAoc2VudCkge1xuICAgICAgICAgICAgbG9nZ2VyLmxvZyhgU2Vzc2lvbiB0aXRsZSB1cGRhdGVkIHRvOiAke3Nhbml0aXplZFRpdGxlfWApO1xuICAgICAgICAgICAgLy8gSVBDIHVwZGF0ZSBzdWNjZWVkZWQsIHNlcnZlciB3aWxsIGhhbmRsZSB0aGUgZmlsZSB1cGRhdGVcbiAgICAgICAgICAgIHNvY2tldENsaWVudC5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICBjbG9zZUxvZ2dlcigpO1xuICAgICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybihgRmFpbGVkIHRvIHNlbmQgdGl0bGUgdXBkYXRlIHZpYSBJUEMsIGZhbGxpbmcgYmFjayB0byBmaWxlIHVwZGF0ZWApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIERpc2Nvbm5lY3QgYWZ0ZXIgc2VuZGluZ1xuICAgICAgICAgIHNvY2tldENsaWVudC5kaXNjb25uZWN0KCk7XG4gICAgICAgIH0gY2F0Y2ggKGlwY0Vycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oYElQQyBjb25uZWN0aW9uIGZhaWxlZDogJHtpcGNFcnJvcn0sIGZhbGxpbmcgYmFjayB0byBmaWxlIHVwZGF0ZWApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZGVidWcoYE5vIElQQyBzb2NrZXQgZm91bmQsIHNlc3Npb24gbWlnaHQgbm90IGJlIGFjdGl2ZWApO1xuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgZmlsZSBpZiBJUEMgZmFpbGVkIG9yIHNvY2tldCBkb2Vzbid0IGV4aXN0XG4gICAgICBzZXNzaW9uSW5mby5uYW1lID0gc2FuaXRpemVkVGl0bGU7XG4gICAgICBzZXNzaW9uTWFuYWdlci5zYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkLCBzZXNzaW9uSW5mbyk7XG5cbiAgICAgIGxvZ2dlci5sb2coYFNlc3Npb24gdGl0bGUgdXBkYXRlZCB0bzogJHtzYW5pdGl6ZWRUaXRsZX1gKTtcbiAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byB1cGRhdGUgc2Vzc2lvbiB0aXRsZTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgKTtcbiAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9XG5cbiAgbGV0IGNvbW1hbmQgPSByZW1haW5pbmdBcmdzO1xuXG4gIGlmIChjb21tYW5kLmxlbmd0aCA9PT0gMCkge1xuICAgIGxvZ2dlci5lcnJvcignTm8gY29tbWFuZCBzcGVjaWZpZWQnKTtcbiAgICBzaG93VXNhZ2UoKTtcbiAgICBjbG9zZUxvZ2dlcigpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuXG4gIC8vIENoZWNrIGlmIHRoaXMgaXMgQ2xhdWRlIGFuZCBwYXRjaCBpdCBpZiBuZWNlc3NhcnkgKG9ubHkgaW4gZGVidWcgbW9kZSlcbiAgaWYgKHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfREVCVUcgPT09ICcxJyB8fCBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX0RFQlVHID09PSAndHJ1ZScpIHtcbiAgICBjb25zdCBwYXRjaGVkQ29tbWFuZCA9IGNoZWNrQW5kUGF0Y2hDbGF1ZGUoY29tbWFuZCk7XG4gICAgaWYgKHBhdGNoZWRDb21tYW5kICE9PSBjb21tYW5kKSB7XG4gICAgICBjb21tYW5kID0gcGF0Y2hlZENvbW1hbmQ7XG4gICAgICBsb2dnZXIuZGVidWcoYENvbW1hbmQgdXBkYXRlZCBhZnRlciBwYXRjaGluZ2ApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEF1dG8tc2VsZWN0IGR5bmFtaWMgbW9kZSBmb3IgQ2xhdWRlIGlmIG5vIG1vZGUgd2FzIGV4cGxpY2l0bHkgc2V0XG4gIGlmICh0aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5OT05FKSB7XG4gICAgLy8gQ2hlY2sgYWxsIGNvbW1hbmQgYXJndW1lbnRzIGZvciBDbGF1ZGVcbiAgICBjb25zdCBpc0NsYXVkZUNvbW1hbmQgPSBjb21tYW5kLnNvbWUoKGFyZykgPT4gYXJnLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NsYXVkZScpKTtcbiAgICBpZiAoaXNDbGF1ZGVDb21tYW5kKSB7XG4gICAgICB0aXRsZU1vZGUgPSBUaXRsZU1vZGUuRFlOQU1JQztcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuY3lhbign4pyTIEF1dG8tc2VsZWN0ZWQgZHluYW1pYyB0aXRsZSBtb2RlIGZvciBDbGF1ZGUnKSk7XG4gICAgICBsb2dnZXIuZGVidWcoYERldGVjdGVkIENsYXVkZSBpbiBjb21tYW5kOiAke2NvbW1hbmQuam9pbignICcpfWApO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGN3ZCA9IHByb2Nlc3MuY3dkKCk7XG5cbiAgLy8gSW5pdGlhbGl6ZSBQVFkgbWFuYWdlciB3aXRoIGZhbGxiYWNrIHN1cHBvcnRcbiAgY29uc3QgY29udHJvbFBhdGggPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLnZpYmV0dW5uZWwnLCAnY29udHJvbCcpO1xuICBsb2dnZXIuZGVidWcoYENvbnRyb2wgcGF0aDogJHtjb250cm9sUGF0aH1gKTtcblxuICAvLyBJbml0aWFsaXplIFB0eU1hbmFnZXIgYmVmb3JlIGNyZWF0aW5nIGluc3RhbmNlXG4gIGF3YWl0IFB0eU1hbmFnZXIuaW5pdGlhbGl6ZSgpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgUFRZIG1hbmFnZXI6JywgZXJyb3IpO1xuICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9KTtcblxuICBjb25zdCBwdHlNYW5hZ2VyID0gbmV3IFB0eU1hbmFnZXIoY29udHJvbFBhdGgpO1xuXG4gIC8vIFN0b3JlIG9yaWdpbmFsIHRlcm1pbmFsIGRpbWVuc2lvbnNcbiAgLy8gRm9yIGV4dGVybmFsIHNwYXducywgd2FpdCBhIG1vbWVudCBmb3IgdGVybWluYWwgdG8gZnVsbHkgaW5pdGlhbGl6ZVxuICBjb25zdCBpc0V4dGVybmFsU3Bhd24gPSBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX1NFU1NJT05fSUQgIT09IHVuZGVmaW5lZDtcblxuICBsZXQgb3JpZ2luYWxDb2xzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gIGxldCBvcmlnaW5hbFJvd3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuICBpZiAoaXNFeHRlcm5hbFNwYXduKSB7XG4gICAgLy8gR2l2ZSB0ZXJtaW5hbCB3aW5kb3cgdGltZSB0byBmdWxseSBpbml0aWFsaXplIGl0cyBkaW1lbnNpb25zXG4gICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cbiAgICAvLyBGb3IgZXh0ZXJuYWwgc3Bhd25zLCB0cnkgdG8gZ2V0IHRoZSBhY3R1YWwgdGVybWluYWwgc2l6ZVxuICAgIC8vIElmIHN0ZG91dCBpc24ndCBwcm9wZXJseSBjb25uZWN0ZWQsIGRvbid0IHVzZSBmYWxsYmFjayB2YWx1ZXNcbiAgICBpZiAocHJvY2Vzcy5zdGRvdXQuaXNUVFkgJiYgcHJvY2Vzcy5zdGRvdXQuY29sdW1ucyAmJiBwcm9jZXNzLnN0ZG91dC5yb3dzKSB7XG4gICAgICBvcmlnaW5hbENvbHMgPSBwcm9jZXNzLnN0ZG91dC5jb2x1bW5zO1xuICAgICAgb3JpZ2luYWxSb3dzID0gcHJvY2Vzcy5zdGRvdXQucm93cztcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgRXh0ZXJuYWwgc3Bhd24gdXNpbmcgYWN0dWFsIHRlcm1pbmFsIHNpemU6ICR7b3JpZ2luYWxDb2xzfXgke29yaWdpbmFsUm93c31gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRG9uJ3QgcGFzcyBkaW1lbnNpb25zIC0gbGV0IFBUWSB1c2UgdGVybWluYWwncyBuYXR1cmFsIHNpemVcbiAgICAgIGxvZ2dlci5kZWJ1ZygnRXh0ZXJuYWwgc3Bhd246IHRlcm1pbmFsIGRpbWVuc2lvbnMgbm90IGF2YWlsYWJsZSwgdXNpbmcgdGVybWluYWwgZGVmYXVsdHMnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gRm9yIG5vbi1leHRlcm5hbCBzcGF3bnMsIHVzZSByZWFzb25hYmxlIGRlZmF1bHRzXG4gICAgb3JpZ2luYWxDb2xzID0gcHJvY2Vzcy5zdGRvdXQuY29sdW1ucyB8fCAxMjA7XG4gICAgb3JpZ2luYWxSb3dzID0gcHJvY2Vzcy5zdGRvdXQucm93cyB8fCA0MDtcbiAgICBsb2dnZXIuZGVidWcoYFJlZ3VsYXIgc3Bhd24gd2l0aCBkaW1lbnNpb25zOiAke29yaWdpbmFsQ29sc314JHtvcmlnaW5hbFJvd3N9YCk7XG4gIH1cblxuICB0cnkge1xuICAgIC8vIENyZWF0ZSBhIGh1bWFuLXJlYWRhYmxlIHNlc3Npb24gbmFtZVxuICAgIGNvbnN0IHNlc3Npb25OYW1lID0gZ2VuZXJhdGVTZXNzaW9uTmFtZShjb21tYW5kLCBjd2QpO1xuXG4gICAgLy8gUHJlLWdlbmVyYXRlIHNlc3Npb24gSUQgaWYgbm90IHByb3ZpZGVkXG4gICAgY29uc3QgZmluYWxTZXNzaW9uSWQgPSBzZXNzaW9uSWQgfHwgYGZ3ZF8ke0RhdGUubm93KCl9YDtcblxuICAgIGxvZ2dlci5sb2coYENyZWF0aW5nIHNlc3Npb24gZm9yIGNvbW1hbmQ6ICR7Y29tbWFuZC5qb2luKCcgJyl9YCk7XG4gICAgbG9nZ2VyLmRlYnVnKGBTZXNzaW9uIElEOiAke2ZpbmFsU2Vzc2lvbklkfSwgd29ya2luZyBkaXJlY3Rvcnk6ICR7Y3dkfWApO1xuXG4gICAgLy8gTG9nIHRpdGxlIG1vZGUgaWYgbm90IGRlZmF1bHRcbiAgICBpZiAodGl0bGVNb2RlICE9PSBUaXRsZU1vZGUuTk9ORSkge1xuICAgICAgY29uc3QgbW9kZURlc2NyaXB0aW9ucyA9IHtcbiAgICAgICAgW1RpdGxlTW9kZS5GSUxURVJdOiAnVGVybWluYWwgdGl0bGUgY2hhbmdlcyB3aWxsIGJlIGJsb2NrZWQnLFxuICAgICAgICBbVGl0bGVNb2RlLlNUQVRJQ106ICdUZXJtaW5hbCB0aXRsZSB3aWxsIHNob3cgcGF0aCBhbmQgY29tbWFuZCcsXG4gICAgICAgIFtUaXRsZU1vZGUuRFlOQU1JQ106ICdUZXJtaW5hbCB0aXRsZSB3aWxsIHNob3cgcGF0aCwgY29tbWFuZCwgYW5kIGFjdGl2aXR5JyxcbiAgICAgIH07XG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmN5YW4oYOKckyAke21vZGVEZXNjcmlwdGlvbnNbdGl0bGVNb2RlXX1gKSk7XG4gICAgfVxuXG4gICAgLy8gRGV0ZWN0IEdpdCBpbmZvcm1hdGlvblxuICAgIGNvbnN0IGdpdEluZm8gPSBhd2FpdCBkZXRlY3RHaXRJbmZvKGN3ZCk7XG5cbiAgICAvLyBWYXJpYWJsZXMgdGhhdCBuZWVkIHRvIGJlIGFjY2Vzc2libGUgaW4gY2xlYW51cFxuICAgIGxldCBzZXNzaW9uRmlsZVdhdGNoZXI6IGZzLkZTV2F0Y2hlciB8IHVuZGVmaW5lZDtcbiAgICBsZXQgZmlsZVdhdGNoRGVib3VuY2VUaW1lcjogTm9kZUpTLlRpbWVvdXQgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGlzRXhpdGluZ05vcm1hbGx5ID0gZmFsc2U7XG5cbiAgICBjb25zdCBzZXNzaW9uT3B0aW9uczogUGFyYW1ldGVyczx0eXBlb2YgcHR5TWFuYWdlci5jcmVhdGVTZXNzaW9uPlsxXSA9IHtcbiAgICAgIHNlc3Npb25JZDogZmluYWxTZXNzaW9uSWQsXG4gICAgICBuYW1lOiBzZXNzaW9uTmFtZSxcbiAgICAgIHdvcmtpbmdEaXI6IGN3ZCxcbiAgICAgIHRpdGxlTW9kZTogdGl0bGVNb2RlLFxuICAgICAgZm9yd2FyZFRvU3Rkb3V0OiB0cnVlLFxuICAgICAgZ2l0UmVwb1BhdGg6IGdpdEluZm8uZ2l0UmVwb1BhdGgsXG4gICAgICBnaXRCcmFuY2g6IGdpdEluZm8uZ2l0QnJhbmNoLFxuICAgICAgZ2l0QWhlYWRDb3VudDogZ2l0SW5mby5naXRBaGVhZENvdW50LFxuICAgICAgZ2l0QmVoaW5kQ291bnQ6IGdpdEluZm8uZ2l0QmVoaW5kQ291bnQsXG4gICAgICBnaXRIYXNDaGFuZ2VzOiBnaXRJbmZvLmdpdEhhc0NoYW5nZXMsXG4gICAgICBnaXRJc1dvcmt0cmVlOiBnaXRJbmZvLmdpdElzV29ya3RyZWUsXG4gICAgICBnaXRNYWluUmVwb1BhdGg6IGdpdEluZm8uZ2l0TWFpblJlcG9QYXRoLFxuICAgICAgb25FeGl0OiBhc3luYyAoZXhpdENvZGU6IG51bWJlcikgPT4ge1xuICAgICAgICAvLyBNYXJrIHRoYXQgd2UncmUgZXhpdGluZyBub3JtYWxseVxuICAgICAgICBpc0V4aXRpbmdOb3JtYWxseSA9IHRydWU7XG5cbiAgICAgICAgLy8gU2hvdyBleGl0IG1lc3NhZ2VcbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBjaGFsay55ZWxsb3coYFxcbuKckyBWaWJlVHVubmVsIHNlc3Npb24gZW5kZWRgKSArIGNoYWxrLmdyYXkoYCAoZXhpdCBjb2RlOiAke2V4aXRDb2RlfSlgKVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIFJlbW92ZSByZXNpemUgbGlzdGVuZXJcbiAgICAgICAgcHJvY2Vzcy5zdGRvdXQucmVtb3ZlTGlzdGVuZXIoJ3Jlc2l6ZScsIHJlc2l6ZUhhbmRsZXIpO1xuXG4gICAgICAgIC8vIFJlc3RvcmUgdGVybWluYWwgc2V0dGluZ3MgYW5kIGNsZWFuIHVwIHN0ZGluXG4gICAgICAgIGlmIChwcm9jZXNzLnN0ZGluLmlzVFRZKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKCdSZXN0b3JpbmcgdGVybWluYWwgdG8gbm9ybWFsIG1vZGUnKTtcbiAgICAgICAgICBwcm9jZXNzLnN0ZGluLnNldFJhd01vZGUoZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHByb2Nlc3Muc3RkaW4ucGF1c2UoKTtcbiAgICAgICAgcHJvY2Vzcy5zdGRpbi5yZW1vdmVBbGxMaXN0ZW5lcnMoKTtcblxuICAgICAgICAvLyBEZXN0cm95IHN0ZGluIHRvIGVuc3VyZSBpdCBkb2Vzbid0IGtlZXAgdGhlIHByb2Nlc3MgYWxpdmVcbiAgICAgICAgaWYgKHByb2Nlc3Muc3RkaW4uZGVzdHJveSkge1xuICAgICAgICAgIHByb2Nlc3Muc3RkaW4uZGVzdHJveSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVzdG9yZSBvcmlnaW5hbCBzdGRvdXQud3JpdGUgaWYgd2UgaG9va2VkIGl0XG4gICAgICAgIGlmIChjbGVhbnVwU3Rkb3V0KSB7XG4gICAgICAgICAgY2xlYW51cFN0ZG91dCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgZmlsZSB3YXRjaGVyc1xuICAgICAgICBpZiAoc2Vzc2lvbkZpbGVXYXRjaGVyKSB7XG4gICAgICAgICAgc2Vzc2lvbkZpbGVXYXRjaGVyLmNsb3NlKCk7XG4gICAgICAgICAgc2Vzc2lvbkZpbGVXYXRjaGVyID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnQ2xvc2VkIHNlc3Npb24gZmlsZSB3YXRjaGVyJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpbGVXYXRjaERlYm91bmNlVGltZXIpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQoZmlsZVdhdGNoRGVib3VuY2VUaW1lcik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RvcCB3YXRjaGluZyB0aGUgZmlsZVxuICAgICAgICBmcy51bndhdGNoRmlsZShzZXNzaW9uSnNvblBhdGgpO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIG9ubHkgdGhpcyBzZXNzaW9uLCBub3QgYWxsIHNlc3Npb25zXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgQ2xlYW5pbmcgdXAgc2Vzc2lvbiAke2ZpbmFsU2Vzc2lvbklkfWApO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHB0eU1hbmFnZXIua2lsbFNlc3Npb24oZmluYWxTZXNzaW9uSWQpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIC8vIFNlc3Npb24gbWlnaHQgYWxyZWFkeSBiZSBjbGVhbmVkIHVwXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBTZXNzaW9uICR7ZmluYWxTZXNzaW9uSWR9IGNsZWFudXAgZXJyb3IgKGxpa2VseSBhbHJlYWR5IGNsZWFuZWQpOmAsIGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZvcmNlIGV4aXRcbiAgICAgICAgY2xvc2VMb2dnZXIoKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KGV4aXRDb2RlIHx8IDApO1xuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gT25seSBhZGQgZGltZW5zaW9ucyBpZiB0aGV5J3JlIGF2YWlsYWJsZSAoZm9yIG5vbi1leHRlcm5hbCBzcGF3bnMgb3Igd2hlbiBUVFkgaXMgcHJvcGVybHkgY29ubmVjdGVkKVxuICAgIGlmIChvcmlnaW5hbENvbHMgIT09IHVuZGVmaW5lZCAmJiBvcmlnaW5hbFJvd3MgIT09IHVuZGVmaW5lZCkge1xuICAgICAgc2Vzc2lvbk9wdGlvbnMuY29scyA9IG9yaWdpbmFsQ29scztcbiAgICAgIHNlc3Npb25PcHRpb25zLnJvd3MgPSBvcmlnaW5hbFJvd3M7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHR5TWFuYWdlci5jcmVhdGVTZXNzaW9uKGNvbW1hbmQsIHNlc3Npb25PcHRpb25zKTtcblxuICAgIC8vIEdldCBzZXNzaW9uIGluZm9cbiAgICBjb25zdCBzZXNzaW9uID0gcHR5TWFuYWdlci5nZXRTZXNzaW9uKHJlc3VsdC5zZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uIG5vdCBmb3VuZCBhZnRlciBjcmVhdGlvbicpO1xuICAgIH1cbiAgICAvLyBMb2cgc2Vzc2lvbiBpbmZvIHdpdGggdmVyc2lvblxuICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYOKckyBWaWJlVHVubmVsIHNlc3Npb24gc3RhcnRlZGApICsgY2hhbGsuZ3JheShgICh2JHtWRVJTSU9OfSlgKSk7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ncmF5KCdDb21tYW5kOicpLCBjb21tYW5kLmpvaW4oJyAnKSk7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ncmF5KCdDb250cm9sIGRpcmVjdG9yeTonKSwgcGF0aC5qb2luKGNvbnRyb2xQYXRoLCByZXN1bHQuc2Vzc2lvbklkKSk7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ncmF5KCdCdWlsZDonKSwgYCR7QlVJTERfREFURX0gfCBDb21taXQ6ICR7R0lUX0NPTU1JVH1gKTtcblxuICAgIC8vIENvbm5lY3QgdG8gdGhlIHNlc3Npb24ncyBJUEMgc29ja2V0XG4gICAgY29uc3Qgc29ja2V0UGF0aCA9IHBhdGguam9pbihjb250cm9sUGF0aCwgcmVzdWx0LnNlc3Npb25JZCwgJ2lwYy5zb2NrJyk7XG4gICAgY29uc3Qgc29ja2V0Q2xpZW50ID0gbmV3IFZpYmVUdW5uZWxTb2NrZXRDbGllbnQoc29ja2V0UGF0aCwge1xuICAgICAgYXV0b1JlY29ubmVjdDogdHJ1ZSxcbiAgICAgIGhlYXJ0YmVhdEludGVydmFsOiAzMDAwMCwgLy8gMzAgc2Vjb25kc1xuICAgIH0pO1xuXG4gICAgLy8gV2FpdCBmb3Igc29ja2V0IGNvbm5lY3Rpb25cbiAgICB0cnkge1xuICAgICAgYXdhaXQgc29ja2V0Q2xpZW50LmNvbm5lY3QoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ29ubmVjdGVkIHRvIHNlc3Npb24gSVBDIHNvY2tldCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBjb25uZWN0IHRvIHNlc3Npb24gc29ja2V0OicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cblxuICAgIC8vIFNldCB1cCB0ZXJtaW5hbCByZXNpemUgaGFuZGxlclxuICAgIGNvbnN0IHJlc2l6ZUhhbmRsZXIgPSAoKSA9PiB7XG4gICAgICBjb25zdCBjb2xzID0gcHJvY2Vzcy5zdGRvdXQuY29sdW1ucyB8fCA4MDtcbiAgICAgIGNvbnN0IHJvd3MgPSBwcm9jZXNzLnN0ZG91dC5yb3dzIHx8IDI0O1xuICAgICAgbG9nZ2VyLmRlYnVnKGBUZXJtaW5hbCByZXNpemVkIHRvICR7Y29sc314JHtyb3dzfWApO1xuXG4gICAgICAvLyBTZW5kIHJlc2l6ZSBjb21tYW5kIHRocm91Z2ggc29ja2V0XG4gICAgICBpZiAoIXNvY2tldENsaWVudC5yZXNpemUoY29scywgcm93cykpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2VuZCByZXNpemUgY29tbWFuZCcpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBMaXN0ZW4gZm9yIHRlcm1pbmFsIHJlc2l6ZSBldmVudHNcbiAgICBwcm9jZXNzLnN0ZG91dC5vbigncmVzaXplJywgcmVzaXplSGFuZGxlcik7XG5cbiAgICAvLyBTZXQgdXAgZmlsZSB3YXRjaGVyIGZvciBzZXNzaW9uLmpzb24gY2hhbmdlcyAoZm9yIGV4dGVybmFsIHVwZGF0ZXMpXG4gICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKGNvbnRyb2xQYXRoLCByZXN1bHQuc2Vzc2lvbklkLCAnc2Vzc2lvbi5qc29uJyk7XG4gICAgbGV0IGxhc3RLbm93blNlc3Npb25OYW1lID0gcmVzdWx0LnNlc3Npb25JbmZvLm5hbWU7XG5cbiAgICAvLyBTZXQgdXAgZmlsZSB3YXRjaGVyIHdpdGggcmV0cnkgbG9naWNcbiAgICBjb25zdCBzZXR1cEZpbGVXYXRjaGVyID0gYXN5bmMgKHJldHJ5Q291bnQgPSAwKSA9PiB7XG4gICAgICBjb25zdCBtYXhSZXRyaWVzID0gNTtcbiAgICAgIGNvbnN0IHJldHJ5RGVsYXkgPSA1MDAgKiAyICoqIHJldHJ5Q291bnQ7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBleGlzdHNcbiAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHNlc3Npb25Kc29uUGF0aCkpIHtcbiAgICAgICAgICBpZiAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgICAgYFNlc3Npb24gZmlsZSBub3QgZm91bmQsIHJldHJ5aW5nIGluICR7cmV0cnlEZWxheX1tcyAoYXR0ZW1wdCAke3JldHJ5Q291bnQgKyAxfS8ke21heFJldHJpZXN9KWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHNldHVwRmlsZVdhdGNoZXIocmV0cnlDb3VudCArIDEpLCByZXRyeURlbGF5KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oYFNlc3Npb24gZmlsZSBub3QgZm91bmQgYWZ0ZXIgJHttYXhSZXRyaWVzfSBhdHRlbXB0czogJHtzZXNzaW9uSnNvblBhdGh9YCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbG9nZ2VyLmxvZyhgU2V0dGluZyB1cCBmaWxlIHdhdGNoZXIgZm9yIHNlc3Npb24gbmFtZSBjaGFuZ2VzYCk7XG5cbiAgICAgICAgLy8gRnVuY3Rpb24gdG8gY2hlY2sgYW5kIHVwZGF0ZSB0aXRsZSBpZiBzZXNzaW9uIG5hbWUgY2hhbmdlZFxuICAgICAgICBjb25zdCBjaGVja1Nlc3Npb25OYW1lQ2hhbmdlID0gKCkgPT4ge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDaGVjayBmaWxlIHN0aWxsIGV4aXN0cyBiZWZvcmUgcmVhZGluZ1xuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHNlc3Npb25Kc29uUGF0aCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBzZXNzaW9uQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhzZXNzaW9uSnNvblBhdGgsICd1dGYtOCcpO1xuICAgICAgICAgICAgY29uc3QgdXBkYXRlZEluZm8gPSBKU09OLnBhcnNlKHNlc3Npb25Db250ZW50KSBhcyBTZXNzaW9uSW5mbztcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgc2Vzc2lvbiBuYW1lIGNoYW5nZWRcbiAgICAgICAgICAgIGlmICh1cGRhdGVkSW5mby5uYW1lICE9PSBsYXN0S25vd25TZXNzaW9uTmFtZSkge1xuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgICAgYFtGaWxlIFdhdGNoXSBTZXNzaW9uIG5hbWUgY2hhbmdlZCBmcm9tIFwiJHtsYXN0S25vd25TZXNzaW9uTmFtZX1cIiB0byBcIiR7dXBkYXRlZEluZm8ubmFtZX1cImBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgbGFzdEtub3duU2Vzc2lvbk5hbWUgPSB1cGRhdGVkSW5mby5uYW1lO1xuXG4gICAgICAgICAgICAgIC8vIEFsd2F5cyB1cGRhdGUgdGVybWluYWwgdGl0bGUgd2hlbiBzZXNzaW9uIG5hbWUgY2hhbmdlc1xuICAgICAgICAgICAgICAvLyBHZW5lcmF0ZSBuZXcgdGl0bGUgc2VxdWVuY2UgYmFzZWQgb24gdGl0bGUgbW9kZVxuICAgICAgICAgICAgICBsZXQgdGl0bGVTZXF1ZW5jZTogc3RyaW5nO1xuICAgICAgICAgICAgICBpZiAodGl0bGVNb2RlID09PSBUaXRsZU1vZGUuTk9ORSB8fCB0aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5GSUxURVIpIHtcbiAgICAgICAgICAgICAgICAvLyBGb3IgTk9ORSBhbmQgRklMVEVSIG1vZGVzLCBqdXN0IHVzZSB0aGUgc2Vzc2lvbiBuYW1lXG4gICAgICAgICAgICAgICAgdGl0bGVTZXF1ZW5jZSA9IGBcXHgxQl0yOyR7dXBkYXRlZEluZm8ubmFtZX1cXHgwN2A7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRm9yIFNUQVRJQyBhbmQgRFlOQU1JQywgdXNlIHRoZSBmdWxsIGZvcm1hdCB3aXRoIHBhdGggYW5kIGNvbW1hbmRcbiAgICAgICAgICAgICAgICB0aXRsZVNlcXVlbmNlID0gZ2VuZXJhdGVUaXRsZVNlcXVlbmNlKGN3ZCwgY29tbWFuZCwgdXBkYXRlZEluZm8ubmFtZSk7XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAvLyBXcml0ZSB0aXRsZSBzZXF1ZW5jZSB0byB0ZXJtaW5hbFxuICAgICAgICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSh0aXRsZVNlcXVlbmNlKTtcbiAgICAgICAgICAgICAgbG9nZ2VyLmxvZyhgVXBkYXRlZCB0ZXJtaW5hbCB0aXRsZSB0byBcIiR7dXBkYXRlZEluZm8ubmFtZX1cIiB2aWEgZmlsZSB3YXRjaGVyYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGNoZWNrIHNlc3Npb24uanNvbjonLCBlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFVzZSBmcy53YXRjaEZpbGUgZm9yIG1vcmUgcmVsaWFibGUgZmlsZSBtb25pdG9yaW5nIChwb2xsaW5nLWJhc2VkKVxuICAgICAgICBmcy53YXRjaEZpbGUoc2Vzc2lvbkpzb25QYXRoLCB7IGludGVydmFsOiA1MDAgfSwgKGN1cnIsIHByZXYpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYFtGaWxlIFdhdGNoXSBGaWxlIHN0YXRzIGNoYW5nZWQgLSBtdGltZTogJHtjdXJyLm10aW1lfSB2cyAke3ByZXYubXRpbWV9YCk7XG4gICAgICAgICAgaWYgKGN1cnIubXRpbWUgIT09IHByZXYubXRpbWUpIHtcbiAgICAgICAgICAgIGNoZWNrU2Vzc2lvbk5hbWVDaGFuZ2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFsc28gdXNlIGZzLndhdGNoIGFzIGEgZmFsbGJhY2sgZm9yIGltbWVkaWF0ZSBub3RpZmljYXRpb25zXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbkRpciA9IHBhdGguZGlybmFtZShzZXNzaW9uSnNvblBhdGgpO1xuICAgICAgICAgIHNlc3Npb25GaWxlV2F0Y2hlciA9IGZzLndhdGNoKHNlc3Npb25EaXIsIChldmVudFR5cGUsIGZpbGVuYW1lKSA9PiB7XG4gICAgICAgICAgICAvLyBPbmx5IGxvZyBpbiBkZWJ1ZyBtb2RlIHRvIGF2b2lkIG5vaXNlXG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFtGaWxlIFdhdGNoXSBEaXJlY3RvcnkgZXZlbnQ6ICR7ZXZlbnRUeXBlfSBvbiAke2ZpbGVuYW1lIHx8ICd1bmtub3duJ31gKTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBvdXIgZmlsZVxuICAgICAgICAgICAgLy8gT24gbWFjT1MsIGZpbGVuYW1lIG1pZ2h0IGJlIHVuZGVmaW5lZCwgc28gd2UgY2FuJ3QgZmlsdGVyIHByb3Blcmx5XG4gICAgICAgICAgICAvLyBJbiB0aGF0IGNhc2UsIHNraXAgZnMud2F0Y2ggZXZlbnRzIGFuZCByZWx5IG9uIGZzLndhdGNoRmlsZSBpbnN0ZWFkXG4gICAgICAgICAgICBpZiAoZmlsZW5hbWUgJiYgKGZpbGVuYW1lID09PSAnc2Vzc2lvbi5qc29uJyB8fCBmaWxlbmFtZSA9PT0gJ3Nlc3Npb24uanNvbi50bXAnKSkge1xuICAgICAgICAgICAgICAvLyBEZWJvdW5jZSByYXBpZCBjaGFuZ2VzXG4gICAgICAgICAgICAgIGlmIChmaWxlV2F0Y2hEZWJvdW5jZVRpbWVyKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGZpbGVXYXRjaERlYm91bmNlVGltZXIpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGZpbGVXYXRjaERlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KGNoZWNrU2Vzc2lvbk5hbWVDaGFuZ2UsIDEwMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ0ZhaWxlZCB0byBzZXQgdXAgZnMud2F0Y2gsIHJlbHlpbmcgb24gZnMud2F0Y2hGaWxlOicsIGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ2dlci5sb2coYEZpbGUgd2F0Y2hlciBzdWNjZXNzZnVsbHkgc2V0IHVwIHdpdGggcG9sbGluZyBmYWxsYmFja2ApO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIHdhdGNoZXIgb24gZXJyb3IgaWYgaXQgd2FzIGNyZWF0ZWRcbiAgICAgICAgc2Vzc2lvbkZpbGVXYXRjaGVyPy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZpbGUgd2F0Y2hlciBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgc2Vzc2lvbkZpbGVXYXRjaGVyPy5jbG9zZSgpO1xuICAgICAgICAgIHNlc3Npb25GaWxlV2F0Y2hlciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZXQgdXAgZmlsZSB3YXRjaGVyOicsIGVycm9yKTtcbiAgICAgICAgaWYgKHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiBzZXR1cEZpbGVXYXRjaGVyKHJldHJ5Q291bnQgKyAxKSwgcmV0cnlEZWxheSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gU3RhcnQgc2V0dGluZyB1cCB0aGUgZmlsZSB3YXRjaGVyIGFmdGVyIGEgc2hvcnQgZGVsYXlcbiAgICBzZXRUaW1lb3V0KCgpID0+IHNldHVwRmlsZVdhdGNoZXIoKSwgNTAwKTtcblxuICAgIC8vIFNldCB1cCBhY3Rpdml0eSBkZXRlY3RvciBmb3IgQ2xhdWRlIHN0YXR1cyB1cGRhdGVzXG4gICAgbGV0IGFjdGl2aXR5RGV0ZWN0b3I6IEFjdGl2aXR5RGV0ZWN0b3IgfCB1bmRlZmluZWQ7XG4gICAgbGV0IGNsZWFudXBTdGRvdXQ6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuICAgIGlmICh0aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5EWU5BTUlDKSB7XG4gICAgICBhY3Rpdml0eURldGVjdG9yID0gbmV3IEFjdGl2aXR5RGV0ZWN0b3IoY29tbWFuZCwgc2Vzc2lvbklkKTtcblxuICAgICAgLy8gSG9vayBpbnRvIHN0ZG91dCB0byBkZXRlY3QgQ2xhdWRlIHN0YXR1c1xuICAgICAgY29uc3Qgb3JpZ2luYWxTdGRvdXRXcml0ZSA9IHByb2Nlc3Muc3Rkb3V0LndyaXRlLmJpbmQocHJvY2Vzcy5zdGRvdXQpO1xuXG4gICAgICBsZXQgaXNQcm9jZXNzaW5nQWN0aXZpdHkgPSBmYWxzZTtcblxuICAgICAgLy8gQ3JlYXRlIGEgcHJvcGVyIG92ZXJyaWRlIHRoYXQgaGFuZGxlcyBhbGwgb3ZlcmxvYWRzXG4gICAgICBjb25zdCBfc3Rkb3V0V3JpdGVPdmVycmlkZSA9IGZ1bmN0aW9uIChcbiAgICAgICAgdGhpczogTm9kZUpTLldyaXRlU3RyZWFtLFxuICAgICAgICBjaHVuazogc3RyaW5nIHwgVWludDhBcnJheSxcbiAgICAgICAgZW5jb2RpbmdPckNhbGxiYWNrPzogQnVmZmVyRW5jb2RpbmcgfCAoKGVycj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCksXG4gICAgICAgIGNhbGxiYWNrPzogKGVycj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZFxuICAgICAgKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIEhhbmRsZSB0aGUgb3ZlcmxvYWQ6IHdyaXRlKGNodW5rLCBjYWxsYmFjaylcbiAgICAgICAgaWYgKHR5cGVvZiBlbmNvZGluZ09yQ2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICBjYWxsYmFjayA9IGVuY29kaW5nT3JDYWxsYmFjaztcbiAgICAgICAgICBlbmNvZGluZ09yQ2FsbGJhY2sgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNQcm9jZXNzaW5nQWN0aXZpdHkpIHtcbiAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFN0ZG91dFdyaXRlLmNhbGwoXG4gICAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAgIGNodW5rLFxuICAgICAgICAgICAgICBlbmNvZGluZ09yQ2FsbGJhY2sgYXMgQnVmZmVyRW5jb2RpbmcgfCB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNhbGxiYWNrXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZW5jb2RpbmdPckNhbGxiYWNrICYmIHR5cGVvZiBlbmNvZGluZ09yQ2FsbGJhY2sgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKHRoaXMsIGNodW5rLCBlbmNvZGluZ09yQ2FsbGJhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKHRoaXMsIGNodW5rKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpc1Byb2Nlc3NpbmdBY3Rpdml0eSA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gUHJvY2VzcyBvdXRwdXQgdGhyb3VnaCBhY3Rpdml0eSBkZXRlY3RvclxuICAgICAgICAgIGlmIChhY3Rpdml0eURldGVjdG9yICYmIHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgZmlsdGVyZWREYXRhLCBhY3Rpdml0eSB9ID0gYWN0aXZpdHlEZXRlY3Rvci5wcm9jZXNzT3V0cHV0KGNodW5rKTtcblxuICAgICAgICAgICAgLy8gU2VuZCBzdGF0dXMgdXBkYXRlIGlmIGRldGVjdGVkXG4gICAgICAgICAgICBpZiAoYWN0aXZpdHkuc3BlY2lmaWNTdGF0dXMpIHtcbiAgICAgICAgICAgICAgc29ja2V0Q2xpZW50LnNlbmRTdGF0dXMoYWN0aXZpdHkuc3BlY2lmaWNTdGF0dXMuYXBwLCBhY3Rpdml0eS5zcGVjaWZpY1N0YXR1cy5zdGF0dXMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDYWxsIG9yaWdpbmFsIHdpdGggY29ycmVjdCBhcmd1bWVudHNcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKFxuICAgICAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAgICAgZmlsdGVyZWREYXRhLFxuICAgICAgICAgICAgICAgIGVuY29kaW5nT3JDYWxsYmFjayBhcyBCdWZmZXJFbmNvZGluZyB8IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICBjYWxsYmFja1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmNvZGluZ09yQ2FsbGJhY2sgJiYgdHlwZW9mIGVuY29kaW5nT3JDYWxsYmFjayA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsU3Rkb3V0V3JpdGUuY2FsbCh0aGlzLCBmaWx0ZXJlZERhdGEsIGVuY29kaW5nT3JDYWxsYmFjayk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKHRoaXMsIGZpbHRlcmVkRGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gUGFzcyB0aHJvdWdoIGFzLWlzIGlmIG5vdCBzdHJpbmcgb3Igbm8gZGV0ZWN0b3JcbiAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbFN0ZG91dFdyaXRlLmNhbGwoXG4gICAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICAgIGNodW5rLFxuICAgICAgICAgICAgICBlbmNvZGluZ09yQ2FsbGJhY2sgYXMgQnVmZmVyRW5jb2RpbmcgfCB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNhbGxiYWNrXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZW5jb2RpbmdPckNhbGxiYWNrICYmIHR5cGVvZiBlbmNvZGluZ09yQ2FsbGJhY2sgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKHRoaXMsIGNodW5rLCBlbmNvZGluZ09yQ2FsbGJhY2spO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxTdGRvdXRXcml0ZS5jYWxsKHRoaXMsIGNodW5rKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgaXNQcm9jZXNzaW5nQWN0aXZpdHkgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQXBwbHkgdGhlIG92ZXJyaWRlXG4gICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSA9IF9zdGRvdXRXcml0ZU92ZXJyaWRlIGFzIHR5cGVvZiBwcm9jZXNzLnN0ZG91dC53cml0ZTtcblxuICAgICAgLy8gU3RvcmUgcmVmZXJlbmNlIGZvciBjbGVhbnVwXG4gICAgICBjbGVhbnVwU3Rkb3V0ID0gKCkgPT4ge1xuICAgICAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSA9IG9yaWdpbmFsU3Rkb3V0V3JpdGU7XG4gICAgICB9O1xuXG4gICAgICAvLyBFbnN1cmUgY2xlYW51cCBoYXBwZW5zIG9uIHByb2Nlc3MgZXhpdFxuICAgICAgcHJvY2Vzcy5vbignZXhpdCcsIGNsZWFudXBTdGRvdXQpO1xuICAgICAgcHJvY2Vzcy5vbignU0lHSU5UJywgY2xlYW51cFN0ZG91dCk7XG4gICAgICBwcm9jZXNzLm9uKCdTSUdURVJNJywgY2xlYW51cFN0ZG91dCk7XG4gICAgfVxuXG4gICAgLy8gU2V0IHVwIHJhdyBtb2RlIGZvciB0ZXJtaW5hbCBpbnB1dFxuICAgIGlmIChwcm9jZXNzLnN0ZGluLmlzVFRZKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ1NldHRpbmcgdGVybWluYWwgdG8gcmF3IG1vZGUgZm9yIGlucHV0IGZvcndhcmRpbmcnKTtcbiAgICAgIHByb2Nlc3Muc3RkaW4uc2V0UmF3TW9kZSh0cnVlKTtcbiAgICB9XG4gICAgcHJvY2Vzcy5zdGRpbi5yZXN1bWUoKTtcbiAgICBwcm9jZXNzLnN0ZGluLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cbiAgICAvLyBGb3J3YXJkIHN0ZGluIHRocm91Z2ggc29ja2V0XG4gICAgcHJvY2Vzcy5zdGRpbi5vbignZGF0YScsIChkYXRhOiBzdHJpbmcpID0+IHtcbiAgICAgIC8vIFNlbmQgdGhyb3VnaCBzb2NrZXRcbiAgICAgIGlmICghc29ja2V0Q2xpZW50LnNlbmRTdGRpbihkYXRhKSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHN0ZGluIGRhdGEnKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBzb2NrZXQgZXZlbnRzXG4gICAgc29ja2V0Q2xpZW50Lm9uKCdkaXNjb25uZWN0JywgKGVycm9yKSA9PiB7XG4gICAgICAvLyBEb24ndCBsb2cgZXJyb3IgaWYgd2UncmUgZXhpdGluZyBub3JtYWxseVxuICAgICAgaWYgKGlzRXhpdGluZ05vcm1hbGx5KSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnU29ja2V0IGRpc2Nvbm5lY3RlZCBkdXJpbmcgbm9ybWFsIGV4aXQnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgY29tbW9uIGRpc2Nvbm5lY3QgZXJyb3IgZHVyaW5nIG5vcm1hbCBvcGVyYXRpb25cbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yPy5tZXNzYWdlIHx8ICcnO1xuICAgICAgY29uc3QgaXNOb3JtYWxEaXNjb25uZWN0ID1cbiAgICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdFUElQRScpIHx8XG4gICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnRUNPTk5SRVNFVCcpIHx8XG4gICAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnc29ja2V0IGhhbmcgdXAnKSB8fFxuICAgICAgICBlcnJvck1lc3NhZ2UgPT09ICdVbmtub3duIGVycm9yJyB8fCAvLyBDb21tb24gZHVyaW5nIGNsZWFuIGV4aXRzXG4gICAgICAgICFlcnJvcjsgLy8gTm8gZXJyb3Igb2JqZWN0IG1lYW5zIGNsZWFuIGRpc2Nvbm5lY3RcblxuICAgICAgaWYgKGlzTm9ybWFsRGlzY29ubmVjdCkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1NvY2tldCBkaXNjb25uZWN0ZWQgKG5vcm1hbCB0ZXJtaW5hdGlvbiknKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignU29ja2V0IGRpc2Nvbm5lY3RlZDonLCBlcnJvcj8ubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcicpO1xuICAgICAgfVxuXG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfSk7XG5cbiAgICBzb2NrZXRDbGllbnQub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1NvY2tldCBlcnJvcjonLCBlcnJvcik7XG4gICAgfSk7XG5cbiAgICAvLyBUaGUgcHJvY2VzcyB3aWxsIHN0YXkgYWxpdmUgYmVjYXVzZSBzdGRpbiBpcyBpbiByYXcgbW9kZSBhbmQgcmVzdW1lZFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBvciBtYW5hZ2Ugc2Vzc2lvbjonLCBlcnJvcik7XG5cbiAgICBjbG9zZUxvZ2dlcigpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuIl19