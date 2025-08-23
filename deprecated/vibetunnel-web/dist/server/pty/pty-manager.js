"use strict";
/**
 * PtyManager - Core PTY management using node-pty
 *
 * This class handles PTY creation, process management, and I/O operations
 * using the node-pty library while maintaining compatibility with tty-fwd.
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
exports.PtyManager = void 0;
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const events_1 = require("events");
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const path = __importStar(require("path"));
// Import node-pty with fallback support
let pty;
// Dynamic import will be done in initialization
const util_1 = require("util");
const uuid_1 = require("uuid");
const types_js_1 = require("../../shared/types.js");
const process_tree_analyzer_js_1 = require("../services/process-tree-analyzer.js");
const activity_detector_js_1 = require("../utils/activity-detector.js");
const ansi_title_filter_js_1 = require("../utils/ansi-title-filter.js");
const logger_js_1 = require("../utils/logger.js");
const terminal_title_js_1 = require("../utils/terminal-title.js");
const write_queue_js_1 = require("../utils/write-queue.js");
const version_js_1 = require("../version.js");
const control_unix_handler_js_1 = require("../websocket/control-unix-handler.js");
const asciinema_writer_js_1 = require("./asciinema-writer.js");
const fish_handler_js_1 = require("./fish-handler.js");
const process_utils_js_1 = require("./process-utils.js");
const session_manager_js_1 = require("./session-manager.js");
const socket_protocol_js_1 = require("./socket-protocol.js");
const types_js_2 = require("./types.js");
const logger = (0, logger_js_1.createLogger)('pty-manager');
// Title injection timing constants
const TITLE_UPDATE_INTERVAL_MS = 1000; // How often to check if title needs updating
const TITLE_INJECTION_QUIET_PERIOD_MS = 50; // Minimum quiet period before injecting title
const TITLE_INJECTION_CHECK_INTERVAL_MS = 10; // How often to check for quiet period
// Foreground process tracking constants
const PROCESS_POLL_INTERVAL_MS = 500; // How often to check foreground process
const MIN_COMMAND_DURATION_MS = 3000; // Minimum duration for command completion notifications (3 seconds)
const SHELL_COMMANDS = new Set(['cd', 'ls', 'pwd', 'echo', 'export', 'alias', 'unset']); // Built-in commands to ignore
/**
 * PtyManager handles the lifecycle and I/O operations of pseudo-terminal (PTY) sessions.
 *
 * This class provides comprehensive terminal session management including:
 * - Creating and managing PTY processes using node-pty
 * - Handling terminal input/output with proper buffering and queuing
 * - Managing terminal resizing from both browser and host terminal
 * - Recording sessions in asciinema format for playback
 * - Communicating with external sessions via Unix domain sockets
 * - Dynamic terminal title management with activity detection
 * - Session persistence and recovery across server restarts
 *
 * The PtyManager supports both in-memory sessions (where the PTY is managed directly)
 * and external sessions (where communication happens via IPC sockets).
 *
 * @extends EventEmitter
 *
 * @fires PtyManager#sessionExited - When a session terminates
 * @fires PtyManager#sessionNameChanged - When a session name is updated
 * @fires PtyManager#bell - When a bell character is detected in terminal output
 *
 * @example
 * ```typescript
 * // Create a PTY manager instance
 * const ptyManager = new PtyManager('/path/to/control/dir');
 *
 * // Create a new session
 * const { sessionId, sessionInfo } = await ptyManager.createSession(
 *   ['bash', '-l'],
 *   {
 *     name: 'My Terminal',
 *     workingDir: '/home/user',
 *     cols: 80,
 *     rows: 24,
 *     titleMode: TitleMode.DYNAMIC
 *   }
 * );
 *
 * // Send input to the session
 * ptyManager.sendInput(sessionId, { text: 'ls -la\n' });
 *
 * // Resize the terminal
 * ptyManager.resizeSession(sessionId, 100, 30);
 *
 * // Kill the session gracefully
 * await ptyManager.killSession(sessionId);
 * ```
 */
class PtyManager extends events_1.EventEmitter {
    constructor(controlPath) {
        super();
        this.sessions = new Map();
        this.defaultTerm = 'xterm-256color';
        this.inputSocketClients = new Map(); // Cache socket connections
        this.lastTerminalSize = null;
        this.resizeEventListeners = [];
        this.sessionResizeSources = new Map();
        this.sessionEventListeners = new Map();
        this.sessionExitTimes = new Map(); // Track session exit times to avoid false bells
        this.processTreeAnalyzer = new process_tree_analyzer_js_1.ProcessTreeAnalyzer(); // Process tree analysis for bell source identification
        this.activityFileWarningsLogged = new Set(); // Track which sessions we've logged warnings for
        this.lastWrittenActivityState = new Map(); // Track last written activity state to avoid unnecessary writes
        this.sessionMonitor = null; // Reference to SessionMonitor for notification tracking
        // Command tracking for notifications
        this.commandTracking = new Map();
        /**
         * Import necessary exec function
         */
        this.execAsync = (0, util_1.promisify)(child_process_1.exec);
        this.sessionManager = new session_manager_js_1.SessionManager(controlPath);
        this.processTreeAnalyzer = new process_tree_analyzer_js_1.ProcessTreeAnalyzer();
        this.setupTerminalResizeDetection();
        // Initialize node-pty if not already done
        if (!PtyManager.initialized) {
            throw new Error('PtyManager not initialized. Call PtyManager.initialize() first.');
        }
    }
    /**
     * Initialize PtyManager with fallback support for node-pty
     */
    static async initialize() {
        if (PtyManager.initialized) {
            return;
        }
        try {
            logger.log('Initializing PtyManager...');
            pty = await Promise.resolve().then(() => __importStar(require('node-pty')));
            PtyManager.initialized = true;
            logger.log('✅ PtyManager initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize PtyManager:', error);
            throw new Error(`Cannot load node-pty: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Set the SessionMonitor instance for activity tracking
     */
    setSessionMonitor(monitor) {
        this.sessionMonitor = monitor;
    }
    /**
     * Setup terminal resize detection for when the hosting terminal is resized
     */
    setupTerminalResizeDetection() {
        // Only setup resize detection if we're running in a TTY
        if (!process.stdout.isTTY) {
            logger.debug('Not a TTY, skipping terminal resize detection');
            return;
        }
        // Store initial terminal size
        this.lastTerminalSize = {
            cols: process.stdout.columns || 80,
            rows: process.stdout.rows || 24,
        };
        // Method 1: Listen for Node.js TTY resize events (most reliable)
        const handleStdoutResize = () => {
            const newCols = process.stdout.columns || 80;
            const newRows = process.stdout.rows || 24;
            this.handleTerminalResize(newCols, newRows);
        };
        process.stdout.on('resize', handleStdoutResize);
        this.resizeEventListeners.push(() => {
            process.stdout.removeListener('resize', handleStdoutResize);
        });
        // Method 2: Listen for SIGWINCH signals (backup for Unix systems)
        const handleSigwinch = () => {
            const newCols = process.stdout.columns || 80;
            const newRows = process.stdout.rows || 24;
            this.handleTerminalResize(newCols, newRows);
        };
        process.on('SIGWINCH', handleSigwinch);
        this.resizeEventListeners.push(() => {
            process.removeListener('SIGWINCH', handleSigwinch);
        });
    }
    /**
     * Handle terminal resize events from the hosting terminal
     */
    handleTerminalResize(newCols, newRows) {
        // Skip if size hasn't actually changed
        if (this.lastTerminalSize &&
            this.lastTerminalSize.cols === newCols &&
            this.lastTerminalSize.rows === newRows) {
            return;
        }
        logger.log(chalk_1.default.blue(`Terminal resized to ${newCols}x${newRows}`));
        // Update stored size
        this.lastTerminalSize = { cols: newCols, rows: newRows };
        // Forward resize to all active sessions using "last resize wins" logic
        const currentTime = Date.now();
        for (const [sessionId, session] of this.sessions) {
            if (session.ptyProcess && session.sessionInfo.status === 'running') {
                // Check if we should apply this resize based on "last resize wins" logic
                const lastResize = this.sessionResizeSources.get(sessionId);
                const shouldResize = !lastResize ||
                    lastResize.source === 'terminal' ||
                    currentTime - lastResize.timestamp > 1000; // 1 second grace period for browser resizes
                if (shouldResize) {
                    try {
                        // Resize the PTY process
                        session.ptyProcess.resize(newCols, newRows);
                        // Record the resize event in the asciinema file
                        session.asciinemaWriter?.writeResize(newCols, newRows);
                        // Track this resize
                        this.sessionResizeSources.set(sessionId, {
                            cols: newCols,
                            rows: newRows,
                            source: 'terminal',
                            timestamp: currentTime,
                        });
                        logger.debug(`Resized session ${sessionId} to ${newCols}x${newRows} from terminal`);
                    }
                    catch (error) {
                        logger.error(`Failed to resize session ${sessionId}:`, error);
                    }
                }
                else {
                    logger.debug(`Skipping terminal resize for session ${sessionId} (browser has precedence)`);
                }
            }
        }
    }
    /**
     * Create a new PTY session
     */
    async createSession(command, options) {
        const sessionId = options.sessionId || (0, uuid_1.v4)();
        const sessionName = options.name || path.basename(command[0]);
        // Correctly determine the web directory path
        const webDir = path.resolve(__dirname, '..', '..');
        const workingDir = options.workingDir || webDir;
        const term = this.defaultTerm;
        // For external spawns without dimensions, let node-pty use the terminal's natural size
        // For other cases, use reasonable defaults
        const cols = options.cols;
        const rows = options.rows;
        // Verify working directory exists
        logger.debug('Session creation parameters:', {
            sessionId,
            sessionName,
            workingDir,
            term,
            cols: cols !== undefined ? cols : 'terminal default',
            rows: rows !== undefined ? rows : 'terminal default',
        });
        try {
            // Create session directory structure
            const paths = this.sessionManager.createSessionDirectory(sessionId);
            // Resolve the command using unified resolution logic
            const resolved = process_utils_js_1.ProcessUtils.resolveCommand(command);
            const { command: finalCommand, args: finalArgs } = resolved;
            const resolvedCommand = [finalCommand, ...finalArgs];
            // Log resolution details
            if (resolved.resolvedFrom === 'alias') {
                logger.log(chalk_1.default.cyan(`Using alias: '${resolved.originalCommand}' → '${resolvedCommand.join(' ')}'`));
            }
            else if (resolved.resolvedFrom === 'path' && resolved.originalCommand) {
                logger.log(chalk_1.default.gray(`Resolved '${resolved.originalCommand}' → '${finalCommand}'`));
            }
            else if (resolved.useShell) {
                logger.debug(`Using shell to execute ${resolved.resolvedFrom}: ${command.join(' ')}`);
            }
            // Log the final command
            logger.debug(chalk_1.default.blue(`Creating PTY session with command: ${resolvedCommand.join(' ')}`));
            logger.debug(`Working directory: ${workingDir}`);
            // Check if this session is being spawned from within VibeTunnel
            const attachedViaVT = !!process.env.VIBETUNNEL_SESSION_ID;
            // Create initial session info with resolved command
            const sessionInfo = {
                id: sessionId,
                command: resolvedCommand,
                name: sessionName,
                workingDir: workingDir,
                status: 'starting',
                startedAt: new Date().toISOString(),
                initialCols: cols,
                initialRows: rows,
                lastClearOffset: 0,
                version: version_js_1.VERSION,
                gitRepoPath: options.gitRepoPath,
                gitBranch: options.gitBranch,
                gitAheadCount: options.gitAheadCount,
                gitBehindCount: options.gitBehindCount,
                gitHasChanges: options.gitHasChanges,
                gitIsWorktree: options.gitIsWorktree,
                gitMainRepoPath: options.gitMainRepoPath,
                attachedViaVT,
            };
            // Save initial session info
            this.sessionManager.saveSessionInfo(sessionId, sessionInfo);
            // Create asciinema writer
            // Use actual dimensions if provided, otherwise AsciinemaWriter will use defaults (80x24)
            const asciinemaWriter = asciinema_writer_js_1.AsciinemaWriter.create(paths.stdoutPath, cols || undefined, rows || undefined, command.join(' '), sessionName, this.createEnvVars(term));
            // Set up pruning detection callback for precise offset tracking
            asciinemaWriter.onPruningSequence(async ({ sequence, position }) => {
                const sessionInfo = this.sessionManager.loadSessionInfo(sessionId);
                if (sessionInfo) {
                    sessionInfo.lastClearOffset = position;
                    await this.sessionManager.saveSessionInfo(sessionId, sessionInfo);
                    logger.debug(`Updated lastClearOffset for session ${sessionId} to exact position ${position} ` +
                        `after detecting pruning sequence '${sequence.split('\x1b').join('\\x1b')}'`);
                }
            });
            // Create PTY process
            let ptyProcess;
            try {
                // Set up environment like Linux implementation
                const ptyEnv = {
                    ...process.env,
                    TERM: term,
                    // Set session ID to prevent recursive vt calls and for debugging
                    VIBETUNNEL_SESSION_ID: sessionId,
                };
                // Debug log the spawn parameters
                logger.debug('PTY spawn parameters:', {
                    command: finalCommand,
                    args: finalArgs,
                    options: {
                        name: term,
                        cols: cols !== undefined ? cols : 'terminal default',
                        rows: rows !== undefined ? rows : 'terminal default',
                        cwd: workingDir,
                        hasEnv: !!ptyEnv,
                        envKeys: Object.keys(ptyEnv).length,
                    },
                });
                // Build spawn options - only include dimensions if provided
                const spawnOptions = {
                    name: term,
                    cwd: workingDir,
                    env: ptyEnv,
                };
                // Only add dimensions if they're explicitly provided
                // This allows node-pty to use the terminal's natural size for external spawns
                if (cols !== undefined) {
                    spawnOptions.cols = cols;
                }
                if (rows !== undefined) {
                    spawnOptions.rows = rows;
                }
                ptyProcess = pty.spawn(finalCommand, finalArgs, spawnOptions);
                // Add immediate exit handler to catch CI issues
                const exitHandler = (event) => {
                    const timeSinceStart = Date.now() - Date.parse(sessionInfo.startedAt);
                    if (timeSinceStart < 1000) {
                        logger.error(`PTY process exited quickly after spawn! Exit code: ${event.exitCode}, signal: ${event.signal}, time: ${timeSinceStart}ms`);
                        logger.error('This often happens in CI when PTY allocation fails or shell is misconfigured');
                        logger.error('Debug info:', {
                            SHELL: process.env.SHELL,
                            TERM: process.env.TERM,
                            CI: process.env.CI,
                            NODE_ENV: process.env.NODE_ENV,
                            command: finalCommand,
                            args: finalArgs,
                            cwd: workingDir,
                            cwdExists: fs.existsSync(workingDir),
                            commandExists: fs.existsSync(finalCommand),
                        });
                    }
                };
                ptyProcess.onExit(exitHandler);
            }
            catch (spawnError) {
                // Debug log the raw error first
                logger.debug('Raw spawn error:', {
                    type: typeof spawnError,
                    isError: spawnError instanceof Error,
                    errorString: String(spawnError),
                    errorKeys: spawnError && typeof spawnError === 'object' ? Object.keys(spawnError) : [],
                });
                // Provide better error messages for common issues
                let errorMessage = spawnError instanceof Error ? spawnError.message : String(spawnError);
                const errorCode = spawnError instanceof Error && 'code' in spawnError
                    ? spawnError.code
                    : undefined;
                if (errorCode === 'ENOENT' || errorMessage.includes('ENOENT')) {
                    errorMessage = `Command not found: '${command[0]}'. Please ensure the command exists and is in your PATH.`;
                }
                else if (errorCode === 'EACCES' || errorMessage.includes('EACCES')) {
                    errorMessage = `Permission denied: '${command[0]}'. The command exists but is not executable.`;
                }
                else if (errorCode === 'ENXIO' || errorMessage.includes('ENXIO')) {
                    errorMessage = `Failed to allocate terminal for '${command[0]}'. This may occur if the command doesn't exist or the system cannot create a pseudo-terminal.`;
                }
                else if (errorMessage.includes('cwd') || errorMessage.includes('working directory')) {
                    errorMessage = `Working directory does not exist: '${workingDir}'`;
                }
                // Log the error with better serialization
                const errorDetails = spawnError instanceof Error
                    ? {
                        ...spawnError,
                        message: spawnError.message,
                        stack: spawnError.stack,
                        code: spawnError.code,
                    }
                    : spawnError;
                logger.error(`Failed to spawn PTY for command '${command.join(' ')}':`, errorDetails);
                throw new types_js_2.PtyError(errorMessage, 'SPAWN_FAILED');
            }
            // Create session object
            // Auto-detect Claude commands and set dynamic mode if no title mode specified
            let titleMode = options.titleMode;
            if (!titleMode) {
                // Check all command arguments for Claude
                const isClaudeCommand = command.some((arg) => arg.toLowerCase().includes('claude'));
                if (isClaudeCommand) {
                    titleMode = types_js_1.TitleMode.DYNAMIC;
                    logger.log(chalk_1.default.cyan('✓ Auto-selected dynamic title mode for Claude'));
                    logger.debug(`Detected Claude in command: ${command.join(' ')}`);
                }
            }
            // Detect if this is a tmux attachment session
            const isTmuxAttachment = (resolvedCommand.includes('tmux') &&
                (resolvedCommand.includes('attach-session') ||
                    resolvedCommand.includes('attach') ||
                    resolvedCommand.includes('a'))) ||
                sessionName.startsWith('tmux:');
            const session = {
                id: sessionId,
                sessionInfo,
                ptyProcess,
                asciinemaWriter,
                controlDir: paths.controlDir,
                stdoutPath: paths.stdoutPath,
                stdinPath: paths.stdinPath,
                sessionJsonPath: paths.sessionJsonPath,
                startTime: new Date(),
                titleMode: titleMode || types_js_1.TitleMode.NONE,
                isExternalTerminal: !!options.forwardToStdout,
                currentWorkingDir: workingDir,
                titleFilter: new ansi_title_filter_js_1.TitleSequenceFilter(),
                isTmuxAttachment,
            };
            this.sessions.set(sessionId, session);
            // Update session info with PID and running status
            sessionInfo.pid = ptyProcess.pid;
            sessionInfo.status = 'running';
            this.sessionManager.saveSessionInfo(sessionId, sessionInfo);
            // Setup session.json watcher for external sessions
            if (options.forwardToStdout) {
                this.setupSessionWatcher(session);
            }
            logger.debug(chalk_1.default.green(`Session ${sessionId} created successfully (PID: ${ptyProcess.pid})`));
            logger.log(chalk_1.default.gray(`Running: ${resolvedCommand.join(' ')} in ${workingDir}`));
            // Setup PTY event handlers
            this.setupPtyHandlers(session, options.forwardToStdout || false, options.onExit);
            // Start foreground process tracking
            this.startForegroundProcessTracking(session);
            // Note: stdin forwarding is now handled via IPC socket
            // Initial title will be set when the first output is received
            // Do not write title sequence to PTY input as it would be sent to the shell
            // Emit session started event
            this.emit('sessionStarted', sessionId, sessionInfo.name || sessionInfo.command.join(' '));
            // Send notification to Mac app
            if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                control_unix_handler_js_1.controlUnixHandler.sendNotification('Session Started', sessionInfo.name || sessionInfo.command.join(' '), {
                    type: 'session-start',
                    sessionId: sessionId,
                    sessionName: sessionInfo.name || sessionInfo.command.join(' '),
                });
            }
            return {
                sessionId,
                sessionInfo,
            };
        }
        catch (error) {
            // Cleanup on failure
            try {
                this.sessionManager.cleanupSession(sessionId);
            }
            catch (cleanupError) {
                logger.warn(`Failed to cleanup session ${sessionId} after creation failure:`, cleanupError);
            }
            throw new types_js_2.PtyError(`Failed to create session: ${error instanceof Error ? error.message : String(error)}`, 'SESSION_CREATE_FAILED');
        }
    }
    getPtyForSession(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.ptyProcess || null;
    }
    getInternalSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Setup event handlers for a PTY process
     */
    setupPtyHandlers(session, forwardToStdout, onExit) {
        const { ptyProcess, asciinemaWriter } = session;
        if (!ptyProcess) {
            logger.error(`No PTY process found for session ${session.id}`);
            return;
        }
        // Create write queue for stdout if forwarding
        const stdoutQueue = forwardToStdout ? new write_queue_js_1.WriteQueue() : null;
        if (stdoutQueue) {
            session.stdoutQueue = stdoutQueue;
        }
        // Create write queue for input to prevent race conditions
        const inputQueue = new write_queue_js_1.WriteQueue();
        session.inputQueue = inputQueue;
        // Setup activity detector for dynamic mode
        if (session.titleMode === types_js_1.TitleMode.DYNAMIC) {
            session.activityDetector = new activity_detector_js_1.ActivityDetector(session.sessionInfo.command, session.id);
            // Set up Claude turn notification callback
            session.activityDetector.setOnClaudeTurn((sessionId) => {
                logger.info(`🔔 NOTIFICATION DEBUG: Claude turn detected for session ${sessionId}`);
                this.emit('claudeTurn', sessionId, session.sessionInfo.name || session.sessionInfo.command.join(' '));
            });
        }
        // Setup periodic title updates for both static and dynamic modes
        if (session.titleMode !== types_js_1.TitleMode.NONE &&
            session.titleMode !== types_js_1.TitleMode.FILTER &&
            forwardToStdout) {
            // Track last known activity state for change detection
            let lastKnownActivityState = null;
            session.titleUpdateInterval = setInterval(() => {
                // For dynamic mode, check for activity state changes
                if (session.titleMode === types_js_1.TitleMode.DYNAMIC && session.activityDetector) {
                    const activityState = session.activityDetector.getActivityState();
                    // Check if activity state has changed
                    const activityChanged = lastKnownActivityState === null ||
                        activityState.isActive !== lastKnownActivityState.isActive ||
                        activityState.specificStatus?.status !== lastKnownActivityState.specificStatus;
                    if (activityChanged) {
                        // Update last known state
                        lastKnownActivityState = {
                            isActive: activityState.isActive,
                            specificStatus: activityState.specificStatus?.status,
                        };
                        // Mark title for update
                        this.markTitleUpdateNeeded(session);
                        logger.debug(`Activity state changed for session ${session.id}: ` +
                            `active=${activityState.isActive}, ` +
                            `status=${activityState.specificStatus?.status || 'none'}`);
                        // Send notification when activity becomes inactive (Claude's turn)
                        if (!activityState.isActive && activityState.specificStatus?.status === 'waiting') {
                            logger.info(`🔔 NOTIFICATION DEBUG: Claude turn detected for session ${session.id}`);
                            this.emit('claudeTurn', session.id, session.sessionInfo.name || session.sessionInfo.command.join(' '));
                            // Send notification to Mac app directly
                            if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                                control_unix_handler_js_1.controlUnixHandler.sendNotification('Your Turn', 'Claude has finished responding', {
                                    type: 'your-turn',
                                    sessionId: session.id,
                                    sessionName: session.sessionInfo.name || session.sessionInfo.command.join(' '),
                                });
                            }
                        }
                    }
                    // Always write activity state for external tools
                    this.writeActivityState(session, activityState);
                }
                // Check and update title if needed
                this.checkAndUpdateTitle(session);
            }, TITLE_UPDATE_INTERVAL_MS);
        }
        // Handle PTY data output
        ptyProcess.onData((data) => {
            let processedData = data;
            // Track PTY output in SessionMonitor for activity and bell detection
            if (this.sessionMonitor) {
                this.sessionMonitor.trackPtyOutput(session.id, data);
            }
            // If title mode is not NONE, filter out any title sequences the process might
            // have written to the stream.
            if (session.titleMode !== undefined && session.titleMode !== types_js_1.TitleMode.NONE) {
                processedData = session.titleFilter ? session.titleFilter.filter(data) : data;
            }
            // Handle activity detection for dynamic mode
            if (session.titleMode === types_js_1.TitleMode.DYNAMIC && session.activityDetector) {
                const { filteredData, activity } = session.activityDetector.processOutput(processedData);
                processedData = filteredData;
                // Check if activity status changed
                if (activity.specificStatus?.status !== session.lastActivityStatus) {
                    session.lastActivityStatus = activity.specificStatus?.status;
                    this.markTitleUpdateNeeded(session);
                    // Update SessionMonitor with activity change
                    if (this.sessionMonitor) {
                        const isActive = activity.specificStatus?.status === 'working';
                        this.sessionMonitor.updateSessionActivity(session.id, isActive, activity.specificStatus?.app);
                    }
                }
            }
            // Check for title update triggers
            if (session.titleMode === types_js_1.TitleMode.STATIC && forwardToStdout) {
                // Check if we should update title based on data content
                if (!session.initialTitleSent || (0, terminal_title_js_1.shouldInjectTitle)(processedData)) {
                    this.markTitleUpdateNeeded(session);
                    if (!session.initialTitleSent) {
                        session.initialTitleSent = true;
                    }
                }
            }
            // Write to asciinema file (it has its own internal queue)
            // The AsciinemaWriter now handles pruning detection internally with precise byte tracking
            asciinemaWriter?.writeOutput(Buffer.from(processedData, 'utf8'));
            // Forward to stdout if requested (using queue for ordering)
            if (forwardToStdout && stdoutQueue) {
                stdoutQueue.enqueue(async () => {
                    const canWrite = process.stdout.write(processedData);
                    // Track write activity for safe title injection
                    session.lastWriteTimestamp = Date.now();
                    if (!canWrite) {
                        await (0, events_1.once)(process.stdout, 'drain');
                    }
                });
            }
        });
        // Handle PTY exit
        ptyProcess.onExit(async ({ exitCode, signal }) => {
            try {
                // Mark session as exiting to prevent false bell notifications
                this.sessionExitTimes.set(session.id, Date.now());
                // Write exit event to asciinema
                if (asciinemaWriter?.isOpen()) {
                    asciinemaWriter.writeRawJson(['exit', exitCode || 0, session.id]);
                    asciinemaWriter
                        .close()
                        .catch((error) => logger.error(`Failed to close asciinema writer for session ${session.id}:`, error));
                }
                // Update session status
                this.sessionManager.updateSessionStatus(session.id, 'exited', undefined, exitCode || (signal ? 128 + (typeof signal === 'number' ? signal : 1) : 1));
                // Wait for stdout queue to drain if it exists
                if (session.stdoutQueue) {
                    try {
                        await session.stdoutQueue.drain();
                    }
                    catch (error) {
                        logger.error(`Failed to drain stdout queue for session ${session.id}:`, error);
                    }
                }
                // Clean up session resources
                this.cleanupSessionResources(session);
                // Remove from active sessions
                this.sessions.delete(session.id);
                // Clean up command tracking
                this.commandTracking.delete(session.id);
                // Emit session exited event
                this.emit('sessionExited', session.id, session.sessionInfo.name || session.sessionInfo.command.join(' '), exitCode);
                // Send notification to Mac app
                if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                    control_unix_handler_js_1.controlUnixHandler.sendNotification('Session Ended', session.sessionInfo.name || session.sessionInfo.command.join(' '), {
                        type: 'session-exit',
                        sessionId: session.id,
                        sessionName: session.sessionInfo.name || session.sessionInfo.command.join(' '),
                    });
                }
                // Call exit callback if provided (for fwd.ts)
                if (onExit) {
                    onExit(exitCode || 0, signal);
                }
            }
            catch (error) {
                logger.error(`Failed to handle exit for session ${session.id}:`, error);
            }
        });
        // Mark for initial title update
        if (forwardToStdout &&
            (session.titleMode === types_js_1.TitleMode.STATIC || session.titleMode === types_js_1.TitleMode.DYNAMIC)) {
            this.markTitleUpdateNeeded(session);
            session.initialTitleSent = true;
            logger.debug(`Marked initial title update for session ${session.id}`);
        }
        // Setup IPC socket for all communication
        this.setupIPCSocket(session);
    }
    /**
     * Setup Unix socket for all IPC communication
     */
    setupIPCSocket(session) {
        const ptyProcess = session.ptyProcess;
        if (!ptyProcess) {
            logger.error(`No PTY process found for session ${session.id}`);
            return;
        }
        // Create Unix domain socket for all IPC
        // IMPORTANT: macOS has a 104 character limit for Unix socket paths, including null terminator.
        // This means the actual usable path length is 103 characters. To avoid EINVAL errors:
        // - Use short socket names (e.g., 'ipc.sock' instead of 'vibetunnel-ipc.sock')
        // - Keep session directories as short as possible
        // - Avoid deeply nested directory structures
        const socketPath = path.join(session.controlDir, 'ipc.sock');
        // Verify the socket path isn't too long
        if (socketPath.length > 103) {
            const error = new Error(`Socket path too long: ${socketPath.length} characters`);
            logger.error(`Socket path too long (${socketPath.length} chars): ${socketPath}`);
            logger.error(`macOS limit is 103 characters. Consider using shorter session IDs or control paths.`);
            throw error; // Fail fast instead of returning silently
        }
        try {
            // Remove existing socket if it exists
            try {
                fs.unlinkSync(socketPath);
            }
            catch (_e) {
                // Socket doesn't exist, this is expected
            }
            // Initialize connected clients set if not already present
            if (!session.connectedClients) {
                session.connectedClients = new Set();
            }
            // Create Unix domain socket server with framed message protocol
            const inputServer = net.createServer((client) => {
                const parser = new socket_protocol_js_1.MessageParser();
                client.setNoDelay(true);
                // Add client to connected clients set
                session.connectedClients?.add(client);
                logger.debug(`Client connected to session ${session.id}, total clients: ${session.connectedClients?.size}`);
                client.on('data', (chunk) => {
                    parser.addData(chunk);
                    for (const { type, payload } of parser.parseMessages()) {
                        this.handleSocketMessage(session, type, payload);
                    }
                });
                client.on('error', (err) => {
                    logger.debug(`Client socket error for session ${session.id}:`, err);
                });
                client.on('close', () => {
                    // Remove client from connected clients set
                    session.connectedClients?.delete(client);
                    logger.debug(`Client disconnected from session ${session.id}, remaining clients: ${session.connectedClients?.size}`);
                });
            });
            inputServer.listen(socketPath, () => {
                // Make socket writable by all
                try {
                    fs.chmodSync(socketPath, 0o666);
                }
                catch (e) {
                    logger.debug(`Failed to chmod input socket for session ${session.id}:`, e);
                }
                logger.debug(`Input socket created for session ${session.id}`);
            });
            // Store server reference for cleanup
            session.inputSocketServer = inputServer;
        }
        catch (error) {
            logger.error(`Failed to create input socket for session ${session.id}:`, error);
        }
        // All IPC goes through this socket
    }
    /**
     * Setup file watcher for session.json changes
     */
    setupSessionWatcher(session) {
        const _sessionJsonPath = path.join(session.controlDir, 'session.json');
        try {
            // Use polling approach for better reliability on macOS
            // Check for changes every 100ms
            const checkInterval = setInterval(() => {
                try {
                    // Read the current session info from disk
                    const updatedInfo = this.sessionManager.loadSessionInfo(session.id);
                    if (updatedInfo && updatedInfo.name !== session.sessionInfo.name) {
                        // Name has changed, update our internal state
                        const oldName = session.sessionInfo.name;
                        session.sessionInfo.name = updatedInfo.name;
                        logger.debug(`Session ${session.id} name changed from "${oldName}" to "${updatedInfo.name}"`);
                        // Emit event for name change
                        this.trackAndEmit('sessionNameChanged', session.id, updatedInfo.name);
                        // Update title if needed for external terminals
                        if (session.isExternalTerminal &&
                            (session.titleMode === types_js_1.TitleMode.STATIC || session.titleMode === types_js_1.TitleMode.DYNAMIC)) {
                            this.markTitleUpdateNeeded(session);
                        }
                    }
                }
                catch (error) {
                    // Session file might be deleted, ignore
                    logger.debug(`Failed to read session file for ${session.id}:`, error);
                }
            }, 100);
            // Store interval for cleanup
            session.sessionJsonInterval = checkInterval;
            logger.debug(`Session watcher setup for ${session.id}`);
        }
        catch (error) {
            logger.error(`Failed to setup session watcher for ${session.id}:`, error);
        }
    }
    /**
     * Handle incoming socket messages
     */
    handleSocketMessage(session, type, payload) {
        try {
            const data = (0, socket_protocol_js_1.parsePayload)(type, payload);
            switch (type) {
                case socket_protocol_js_1.MessageType.STDIN_DATA: {
                    const text = data;
                    if (session.ptyProcess && session.inputQueue) {
                        // Queue input write to prevent race conditions
                        session.inputQueue.enqueue(() => {
                            if (session.ptyProcess) {
                                session.ptyProcess.write(text);
                            }
                            // Record it (non-blocking)
                            session.asciinemaWriter?.writeInput(text);
                        });
                    }
                    break;
                }
                case socket_protocol_js_1.MessageType.CONTROL_CMD: {
                    const cmd = data;
                    this.handleControlMessage(session, cmd);
                    break;
                }
                case socket_protocol_js_1.MessageType.STATUS_UPDATE: {
                    const status = data;
                    // Update activity status for the session
                    if (!session.activityStatus) {
                        session.activityStatus = {};
                    }
                    session.activityStatus.specificStatus = {
                        app: status.app,
                        status: status.status,
                    };
                    logger.debug(`Updated status for session ${session.id}:`, status);
                    // Broadcast status update to all connected clients
                    if (session.connectedClients && session.connectedClients.size > 0) {
                        const message = (0, socket_protocol_js_1.frameMessage)(socket_protocol_js_1.MessageType.STATUS_UPDATE, status);
                        for (const client of session.connectedClients) {
                            try {
                                client.write(message);
                            }
                            catch (err) {
                                logger.debug(`Failed to broadcast status to client:`, err);
                            }
                        }
                        logger.debug(`Broadcasted status update to ${session.connectedClients.size} clients`);
                    }
                    break;
                }
                case socket_protocol_js_1.MessageType.HEARTBEAT:
                    // Heartbeat received - no action needed for now
                    break;
                default:
                    logger.debug(`Unknown message type ${type} for session ${session.id}`);
            }
        }
        catch (error) {
            // Don't log the full error object as it might contain buffers or circular references
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to handle socket message for session ${session.id}: ${errorMessage}`);
        }
    }
    /**
     * Handle control messages from control pipe
     */
    handleControlMessage(session, message) {
        if (message.cmd === 'resize' &&
            typeof message.cols === 'number' &&
            typeof message.rows === 'number') {
            try {
                if (session.ptyProcess) {
                    session.ptyProcess.resize(message.cols, message.rows);
                    session.asciinemaWriter?.writeResize(message.cols, message.rows);
                }
            }
            catch (error) {
                logger.warn(`Failed to resize session ${session.id} to ${message.cols}x${message.rows}:`, error);
            }
        }
        else if (message.cmd === 'kill') {
            const signal = typeof message.signal === 'string' || typeof message.signal === 'number'
                ? message.signal
                : 'SIGTERM';
            try {
                if (session.ptyProcess) {
                    session.ptyProcess.kill(signal);
                }
            }
            catch (error) {
                logger.warn(`Failed to kill session ${session.id} with signal ${signal}:`, error);
            }
        }
        else if (message.cmd === 'reset-size') {
            try {
                if (session.ptyProcess) {
                    // Get current terminal size from process.stdout
                    const cols = process.stdout.columns || 80;
                    const rows = process.stdout.rows || 24;
                    session.ptyProcess.resize(cols, rows);
                    session.asciinemaWriter?.writeResize(cols, rows);
                    logger.debug(`Reset session ${session.id} size to terminal size: ${cols}x${rows}`);
                }
            }
            catch (error) {
                logger.warn(`Failed to reset session ${session.id} size to terminal size:`, error);
            }
        }
        else if (message.cmd === 'update-title' && typeof message.title === 'string') {
            // Handle title update via IPC (used by vt title command)
            logger.debug(`[IPC] Received title update for session ${session.id}: "${message.title}"`);
            logger.debug(`[IPC] Current session name before update: "${session.sessionInfo.name}"`);
            this.updateSessionName(session.id, message.title);
        }
    }
    /**
     * Get fish shell completions for a partial command
     */
    async getFishCompletions(sessionId, partial) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                return [];
            }
            const userShell = process_utils_js_1.ProcessUtils.getUserShell();
            if (!fish_handler_js_1.FishHandler.isFishShell(userShell)) {
                return [];
            }
            const { fishHandler } = await Promise.resolve().then(() => __importStar(require('./fish-handler.js')));
            const cwd = session.currentWorkingDir || process.cwd();
            return await fishHandler.getCompletions(partial, cwd);
        }
        catch (error) {
            logger.warn(`Fish completions failed: ${error}`);
            return [];
        }
    }
    /**
     * Send text input to a session
     */
    sendInput(sessionId, input) {
        try {
            let dataToSend = '';
            if (input.text !== undefined) {
                dataToSend = input.text;
                logger.debug(`Received text input: ${JSON.stringify(input.text)} -> sending: ${JSON.stringify(dataToSend)}`);
            }
            else if (input.key !== undefined) {
                dataToSend = this.convertSpecialKey(input.key);
                logger.debug(`Received special key: "${input.key}" -> converted to: ${JSON.stringify(dataToSend)}`);
            }
            else {
                throw new types_js_2.PtyError('No text or key specified in input', 'INVALID_INPUT');
            }
            // If we have an in-memory session with active PTY, use it
            const memorySession = this.sessions.get(sessionId);
            if (memorySession?.ptyProcess && memorySession.inputQueue) {
                // Queue input write to prevent race conditions
                memorySession.inputQueue.enqueue(() => {
                    if (memorySession.ptyProcess) {
                        memorySession.ptyProcess.write(dataToSend);
                    }
                    memorySession.asciinemaWriter?.writeInput(dataToSend);
                    // Track directory changes for title modes that need it
                    if ((memorySession.titleMode === types_js_1.TitleMode.STATIC ||
                        memorySession.titleMode === types_js_1.TitleMode.DYNAMIC) &&
                        input.text) {
                        const newDir = (0, terminal_title_js_1.extractCdDirectory)(input.text, memorySession.currentWorkingDir || memorySession.sessionInfo.workingDir);
                        if (newDir) {
                            memorySession.currentWorkingDir = newDir;
                            this.markTitleUpdateNeeded(memorySession);
                            logger.debug(`Session ${sessionId} changed directory to: ${newDir}`);
                        }
                    }
                });
                return; // Important: return here to avoid socket path
            }
            else {
                const sessionPaths = this.sessionManager.getSessionPaths(sessionId);
                if (!sessionPaths) {
                    throw new types_js_2.PtyError(`Session ${sessionId} paths not found`, 'SESSION_PATHS_NOT_FOUND', sessionId);
                }
                // For forwarded sessions, we need to use socket communication
                const socketPath = path.join(sessionPaths.controlDir, 'ipc.sock');
                // Check if we have a cached socket connection
                let socketClient = this.inputSocketClients.get(sessionId);
                if (!socketClient || socketClient.destroyed) {
                    // Try to connect to the socket
                    try {
                        socketClient = net.createConnection(socketPath);
                        socketClient.setNoDelay(true);
                        // Keep socket alive for better performance
                        socketClient.setKeepAlive(true, 0);
                        this.inputSocketClients.set(sessionId, socketClient);
                        socketClient.on('error', () => {
                            this.inputSocketClients.delete(sessionId);
                        });
                        socketClient.on('close', () => {
                            this.inputSocketClients.delete(sessionId);
                        });
                    }
                    catch (error) {
                        logger.debug(`Failed to connect to input socket for session ${sessionId}:`, error);
                        socketClient = undefined;
                    }
                }
                if (socketClient && !socketClient.destroyed) {
                    // Send stdin data using framed message protocol
                    const message = (0, socket_protocol_js_1.frameMessage)(socket_protocol_js_1.MessageType.STDIN_DATA, dataToSend);
                    const canWrite = socketClient.write(message);
                    if (!canWrite) {
                        // Socket buffer is full
                        logger.debug(`Socket buffer full for session ${sessionId}, data queued`);
                    }
                }
                else {
                    throw new types_js_2.PtyError(`No socket connection available for session ${sessionId}`, 'NO_SOCKET_CONNECTION', sessionId);
                }
            }
        }
        catch (error) {
            throw new types_js_2.PtyError(`Failed to send input to session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'SEND_INPUT_FAILED', sessionId);
        }
    }
    /**
     * Send a control message to an external session via socket
     */
    sendControlMessage(sessionId, message) {
        const sessionPaths = this.sessionManager.getSessionPaths(sessionId);
        if (!sessionPaths) {
            return false;
        }
        try {
            const socketPath = path.join(sessionPaths.controlDir, 'ipc.sock');
            let socketClient = this.inputSocketClients.get(sessionId);
            if (!socketClient || socketClient.destroyed) {
                // Try to connect to the socket
                try {
                    socketClient = net.createConnection(socketPath);
                    socketClient.setNoDelay(true);
                    socketClient.setKeepAlive(true, 0);
                    this.inputSocketClients.set(sessionId, socketClient);
                    socketClient.on('error', () => {
                        this.inputSocketClients.delete(sessionId);
                    });
                    socketClient.on('close', () => {
                        this.inputSocketClients.delete(sessionId);
                    });
                }
                catch (error) {
                    logger.debug(`Failed to connect to control socket for session ${sessionId}:`, error);
                    return false;
                }
            }
            if (socketClient && !socketClient.destroyed) {
                const frameMsg = (0, socket_protocol_js_1.frameMessage)(socket_protocol_js_1.MessageType.CONTROL_CMD, message);
                return socketClient.write(frameMsg);
            }
        }
        catch (error) {
            logger.error(`Failed to send control message to session ${sessionId}:`, error);
        }
        return false;
    }
    /**
     * Convert special key names to escape sequences
     */
    convertSpecialKey(key) {
        const keyMap = {
            arrow_up: '\x1b[A',
            arrow_down: '\x1b[B',
            arrow_right: '\x1b[C',
            arrow_left: '\x1b[D',
            escape: '\x1b',
            enter: '\r',
            ctrl_enter: '\n',
            shift_enter: '\r\n',
            backspace: '\x7f',
            tab: '\t',
            shift_tab: '\x1b[Z',
            page_up: '\x1b[5~',
            page_down: '\x1b[6~',
            home: '\x1b[H',
            end: '\x1b[F',
            delete: '\x1b[3~',
            f1: '\x1bOP',
            f2: '\x1bOQ',
            f3: '\x1bOR',
            f4: '\x1bOS',
            f5: '\x1b[15~',
            f6: '\x1b[17~',
            f7: '\x1b[18~',
            f8: '\x1b[19~',
            f9: '\x1b[20~',
            f10: '\x1b[21~',
            f11: '\x1b[23~',
            f12: '\x1b[24~',
        };
        const sequence = keyMap[key];
        if (!sequence) {
            throw new types_js_2.PtyError(`Unknown special key: ${key}`, 'UNKNOWN_KEY');
        }
        return sequence;
    }
    /**
     * Resize a session terminal
     */
    resizeSession(sessionId, cols, rows) {
        const memorySession = this.sessions.get(sessionId);
        const currentTime = Date.now();
        // Check for rapid resizes (potential feedback loop)
        const lastResize = this.sessionResizeSources.get(sessionId);
        if (lastResize) {
            const timeSinceLastResize = currentTime - lastResize.timestamp;
            if (timeSinceLastResize < 100) {
                // Less than 100ms since last resize - this might indicate a loop
                logger.warn(`Rapid resize detected for session ${sessionId}: ${timeSinceLastResize}ms since last resize (${lastResize.cols}x${lastResize.rows} -> ${cols}x${rows})`);
            }
        }
        try {
            // If we have an in-memory session with active PTY, resize it
            if (memorySession?.ptyProcess) {
                memorySession.ptyProcess.resize(cols, rows);
                memorySession.asciinemaWriter?.writeResize(cols, rows);
                // Track this browser-initiated resize
                this.sessionResizeSources.set(sessionId, {
                    cols,
                    rows,
                    source: 'browser',
                    timestamp: currentTime,
                });
                logger.debug(`Resized session ${sessionId} to ${cols}x${rows}`);
            }
            else {
                // For external sessions, try to send resize via control pipe
                const resizeMessage = {
                    cmd: 'resize',
                    cols,
                    rows,
                };
                this.sendControlMessage(sessionId, resizeMessage);
                // Track this resize for external sessions too
                this.sessionResizeSources.set(sessionId, {
                    cols,
                    rows,
                    source: 'browser',
                    timestamp: currentTime,
                });
            }
        }
        catch (error) {
            throw new types_js_2.PtyError(`Failed to resize session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'RESIZE_FAILED', sessionId);
        }
    }
    /**
     * Update session name
     */
    updateSessionName(sessionId, name) {
        logger.debug(`[PtyManager] updateSessionName called for session ${sessionId} with name: ${name}`);
        // Update in session manager (persisted storage) - get the unique name back
        logger.debug(`[PtyManager] Calling sessionManager.updateSessionName`);
        const uniqueName = this.sessionManager.updateSessionName(sessionId, name);
        // Update in-memory session if it exists
        const memorySession = this.sessions.get(sessionId);
        if (memorySession?.sessionInfo) {
            logger.debug(`[PtyManager] Found in-memory session, updating...`);
            const oldName = memorySession.sessionInfo.name;
            memorySession.sessionInfo.name = uniqueName;
            logger.debug(`[PtyManager] Session info after update:`, {
                sessionId: memorySession.id,
                newName: memorySession.sessionInfo.name,
                oldCurrentTitle: `${memorySession.currentTitle?.substring(0, 50)}...`,
            });
            // Force immediate title update for active sessions
            // For session name changes, always update title regardless of mode
            if (memorySession.isExternalTerminal && memorySession.stdoutQueue) {
                logger.debug(`[PtyManager] Forcing immediate title update for session ${sessionId}`, {
                    titleMode: memorySession.titleMode,
                    hadCurrentTitle: !!memorySession.currentTitle,
                    titleUpdateNeeded: memorySession.titleUpdateNeeded,
                });
                // Clear current title to force regeneration
                memorySession.currentTitle = undefined;
                this.updateTerminalTitleForSessionName(memorySession);
            }
            logger.log(`[PtyManager] Updated session ${sessionId} name from "${oldName}" to "${uniqueName}"`);
        }
        else {
            logger.debug(`[PtyManager] No in-memory session found for ${sessionId}`, {
                sessionsMapSize: this.sessions.size,
                sessionIds: Array.from(this.sessions.keys()),
            });
        }
        // Emit event for clients to refresh their session data
        this.trackAndEmit('sessionNameChanged', sessionId, uniqueName);
        logger.debug(`[PtyManager] Updated session ${sessionId} name to: ${uniqueName}`);
        return uniqueName;
    }
    /**
     * Reset session size to terminal size (for external terminals)
     */
    resetSessionSize(sessionId) {
        const memorySession = this.sessions.get(sessionId);
        try {
            // For in-memory sessions, we can't reset to terminal size since we don't know it
            if (memorySession?.ptyProcess) {
                throw new types_js_2.PtyError(`Cannot reset size for in-memory session ${sessionId}`, 'INVALID_OPERATION', sessionId);
            }
            // For external sessions, send reset-size command via control pipe
            const resetSizeMessage = {
                cmd: 'reset-size',
            };
            const sent = this.sendControlMessage(sessionId, resetSizeMessage);
            if (!sent) {
                throw new types_js_2.PtyError(`Failed to send reset-size command to session ${sessionId}`, 'CONTROL_MESSAGE_FAILED', sessionId);
            }
            logger.debug(`Sent reset-size command to session ${sessionId}`);
        }
        catch (error) {
            throw new types_js_2.PtyError(`Failed to reset session size for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'RESET_SIZE_FAILED', sessionId);
        }
    }
    /**
     * Detach from a tmux session gracefully
     * @param sessionId The session ID of the tmux attachment
     * @returns Promise that resolves when detached
     */
    async detachFromTmux(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isTmuxAttachment || !session.ptyProcess) {
            return false;
        }
        try {
            logger.log(chalk_1.default.cyan(`Detaching from tmux session (${sessionId})`));
            // Try the standard detach sequence first (Ctrl-B, d)
            await this.sendInput(sessionId, { text: '\x02d' }); // \x02 is Ctrl-B
            // Wait for detachment
            await new Promise((resolve) => setTimeout(resolve, 300));
            // Check if the process is still running
            if (!process_utils_js_1.ProcessUtils.isProcessRunning(session.ptyProcess.pid)) {
                logger.log(chalk_1.default.green(`Successfully detached from tmux (${sessionId})`));
                return true;
            }
            // If still running, try sending the detach-client command
            logger.debug('First detach attempt failed, trying detach-client command');
            await this.sendInput(sessionId, { text: ':detach-client\n' });
            // Wait a bit longer
            await new Promise((resolve) => setTimeout(resolve, 500));
            // Final check
            if (!process_utils_js_1.ProcessUtils.isProcessRunning(session.ptyProcess.pid)) {
                logger.log(chalk_1.default.green(`Successfully detached from tmux using detach-client (${sessionId})`));
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error(`Error detaching from tmux: ${error}`);
            return false;
        }
    }
    /**
     * Kill a session with proper SIGTERM -> SIGKILL escalation
     * Returns a promise that resolves when the process is actually terminated
     */
    async killSession(sessionId, signal = 'SIGTERM') {
        const memorySession = this.sessions.get(sessionId);
        try {
            // Special handling for tmux attachment sessions
            if (memorySession?.isTmuxAttachment) {
                const detached = await this.detachFromTmux(sessionId);
                if (detached) {
                    // The PTY process should exit cleanly after detaching
                    // Let the normal exit handler clean up the session
                    return;
                }
                logger.warn(`Failed to detach from tmux, falling back to normal kill`);
                // Fall through to normal kill logic
            }
            // If we have an in-memory session with active PTY, kill it directly
            if (memorySession?.ptyProcess) {
                // If signal is already SIGKILL, send it immediately and wait briefly
                if (signal === 'SIGKILL' || signal === 9) {
                    memorySession.ptyProcess.kill('SIGKILL');
                    // Note: We no longer kill the process group to avoid affecting other sessions
                    // that might share the same process group (e.g., multiple fwd.ts instances)
                    this.sessions.delete(sessionId);
                    // Wait a bit for SIGKILL to take effect
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    return;
                }
                // Start with SIGTERM and escalate if needed
                await this.killSessionWithEscalation(sessionId, memorySession);
            }
            else {
                // For external sessions, try control pipe first, then fall back to PID
                const killMessage = {
                    cmd: 'kill',
                    signal,
                };
                const sentControl = this.sendControlMessage(sessionId, killMessage);
                if (sentControl) {
                    // Wait a bit for the control message to be processed
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                // Check if process is still running, if so, use direct PID kill
                const diskSession = this.sessionManager.loadSessionInfo(sessionId);
                if (!diskSession) {
                    throw new types_js_2.PtyError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND', sessionId);
                }
                if (diskSession.pid && process_utils_js_1.ProcessUtils.isProcessRunning(diskSession.pid)) {
                    logger.log(chalk_1.default.yellow(`Killing external session ${sessionId} (PID: ${diskSession.pid})`));
                    if (signal === 'SIGKILL' || signal === 9) {
                        process.kill(diskSession.pid, 'SIGKILL');
                        // Note: We no longer kill the process group to avoid affecting other sessions
                        // that might share the same process group (e.g., multiple fwd.ts instances)
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        return;
                    }
                    // Send SIGTERM first
                    process.kill(diskSession.pid, 'SIGTERM');
                    // Note: We no longer kill the process group to avoid affecting other sessions
                    // that might share the same process group (e.g., multiple fwd.ts instances)
                    // Wait up to 3 seconds for graceful termination
                    const maxWaitTime = 3000;
                    const checkInterval = 500;
                    const maxChecks = maxWaitTime / checkInterval;
                    for (let i = 0; i < maxChecks; i++) {
                        await new Promise((resolve) => setTimeout(resolve, checkInterval));
                        if (!process_utils_js_1.ProcessUtils.isProcessRunning(diskSession.pid)) {
                            logger.debug(chalk_1.default.green(`External session ${sessionId} terminated gracefully`));
                            return;
                        }
                    }
                    // Process didn't terminate gracefully, force kill
                    logger.debug(chalk_1.default.yellow(`External session ${sessionId} requires SIGKILL`));
                    process.kill(diskSession.pid, 'SIGKILL');
                    // Note: We no longer kill the process group to avoid affecting other sessions
                    // that might share the same process group (e.g., multiple fwd.ts instances)
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
        }
        catch (error) {
            throw new types_js_2.PtyError(`Failed to kill session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'KILL_FAILED', sessionId);
        }
    }
    /**
     * Kill session with SIGTERM -> SIGKILL escalation (3 seconds, check every 500ms)
     */
    async killSessionWithEscalation(sessionId, session) {
        if (!session.ptyProcess) {
            this.sessions.delete(sessionId);
            return;
        }
        const pid = session.ptyProcess.pid;
        logger.debug(chalk_1.default.yellow(`Terminating session ${sessionId} (PID: ${pid})`));
        try {
            // Send SIGTERM first
            session.ptyProcess.kill('SIGTERM');
            // Note: We no longer kill the process group to avoid affecting other sessions
            // that might share the same process group (e.g., multiple fwd.ts instances)
            // Wait up to 3 seconds for graceful termination (check every 500ms)
            const maxWaitTime = 3000;
            const checkInterval = 500;
            const maxChecks = maxWaitTime / checkInterval;
            for (let i = 0; i < maxChecks; i++) {
                // Wait for check interval
                await new Promise((resolve) => setTimeout(resolve, checkInterval));
                // Check if process is still alive
                if (!process_utils_js_1.ProcessUtils.isProcessRunning(pid)) {
                    // Process no longer exists - it terminated gracefully
                    logger.debug(chalk_1.default.green(`Session ${sessionId} terminated gracefully`));
                    this.sessions.delete(sessionId);
                    return;
                }
                // Process still exists, continue waiting
                logger.debug(`Session ${sessionId} still running after ${(i + 1) * checkInterval}ms`);
            }
            // Process didn't terminate gracefully within 3 seconds, force kill
            logger.debug(chalk_1.default.yellow(`Session ${sessionId} requires SIGKILL`));
            try {
                session.ptyProcess.kill('SIGKILL');
                // Also force kill the entire process group if on Unix
                // Note: We no longer kill the process group to avoid affecting other sessions
                // that might share the same process group (e.g., multiple fwd.ts instances)
                // Wait a bit more for SIGKILL to take effect
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            catch (_killError) {
                // Process might have died between our check and SIGKILL
                logger.debug(`SIGKILL failed for session ${sessionId} (process already terminated)`);
            }
            // Remove from sessions regardless
            this.sessions.delete(sessionId);
            logger.debug(chalk_1.default.yellow(`Session ${sessionId} forcefully terminated`));
        }
        catch (error) {
            // Remove from sessions even if kill failed
            this.sessions.delete(sessionId);
            throw new types_js_2.PtyError(`Failed to terminate session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'KILL_FAILED', sessionId);
        }
    }
    /**
     * List all sessions (both active and persisted)
     */
    listSessions() {
        // Update zombie sessions first and clean up socket connections
        const zombieSessionIds = this.sessionManager.updateZombieSessions();
        for (const sessionId of zombieSessionIds) {
            const socket = this.inputSocketClients.get(sessionId);
            if (socket) {
                socket.destroy();
                this.inputSocketClients.delete(sessionId);
            }
        }
        // Get all sessions from storage
        const sessions = this.sessionManager.listSessions();
        // Enhance with activity information
        return sessions.map((session) => {
            // First try to get activity from active session
            const activeSession = this.sessions.get(session.id);
            // Check for socket-based status updates first
            if (activeSession?.activityStatus) {
                return {
                    ...session,
                    activityStatus: activeSession.activityStatus,
                };
            }
            // Then check activity detector for dynamic mode
            if (activeSession?.activityDetector) {
                const activityState = activeSession.activityDetector.getActivityState();
                return {
                    ...session,
                    activityStatus: {
                        isActive: activityState.isActive,
                        specificStatus: activityState.specificStatus,
                    },
                };
            }
            // Otherwise, try to read from activity file (for external sessions)
            try {
                const sessionPaths = this.sessionManager.getSessionPaths(session.id);
                if (!sessionPaths) {
                    return session;
                }
                const activityPath = path.join(sessionPaths.controlDir, 'claude-activity.json');
                if (fs.existsSync(activityPath)) {
                    const activityData = JSON.parse(fs.readFileSync(activityPath, 'utf-8'));
                    // Check if activity is recent (within last 60 seconds)
                    // Use Math.abs to handle future timestamps from system clock issues
                    const timeDiff = Math.abs(Date.now() - new Date(activityData.timestamp).getTime());
                    const isRecent = timeDiff < 60000;
                    if (isRecent) {
                        logger.debug(`Found recent activity for external session ${session.id}:`, {
                            isActive: activityData.isActive,
                            specificStatus: activityData.specificStatus,
                        });
                        return {
                            ...session,
                            activityStatus: {
                                isActive: activityData.isActive,
                                specificStatus: activityData.specificStatus,
                            },
                        };
                    }
                    else {
                        logger.debug(`Activity file for session ${session.id} is stale (time diff: ${timeDiff}ms)`);
                    }
                }
                else {
                    // Only log once per session to avoid spam
                    if (!this.activityFileWarningsLogged.has(session.id)) {
                        this.activityFileWarningsLogged.add(session.id);
                        logger.debug(`No claude-activity.json found for session ${session.id} at ${activityPath}`);
                    }
                }
            }
            catch (error) {
                // Ignore errors reading activity file
                logger.debug(`Failed to read activity file for session ${session.id}:`, error);
            }
            return session;
        });
    }
    /**
     * Get a specific session
     */
    getSession(sessionId) {
        logger.debug(`[PtyManager] getSession called for sessionId: ${sessionId}`);
        const paths = this.sessionManager.getSessionPaths(sessionId, true);
        if (!paths) {
            logger.debug(`[PtyManager] No session paths found for ${sessionId}`);
            return null;
        }
        const sessionInfo = this.sessionManager.loadSessionInfo(sessionId);
        if (!sessionInfo) {
            logger.debug(`[PtyManager] No session info found for ${sessionId}`);
            return null;
        }
        // Create Session object with the id field
        const session = {
            ...sessionInfo,
            id: sessionId, // Ensure the id field is set
            lastModified: sessionInfo.startedAt,
        };
        if (fs.existsSync(paths.stdoutPath)) {
            const lastModified = fs.statSync(paths.stdoutPath).mtime.toISOString();
            session.lastModified = lastModified;
        }
        logger.debug(`[PtyManager] Found session: ${JSON.stringify(session)}`);
        return session;
    }
    getSessionPaths(sessionId) {
        return this.sessionManager.getSessionPaths(sessionId);
    }
    /**
     * Cleanup a specific session
     */
    cleanupSession(sessionId) {
        // Kill active session if exists (fire-and-forget for cleanup)
        if (this.sessions.has(sessionId)) {
            this.killSession(sessionId).catch((error) => {
                logger.error(`Failed to kill session ${sessionId} during cleanup:`, error);
            });
        }
        // Remove from storage
        this.sessionManager.cleanupSession(sessionId);
        // Clean up socket connection if any
        const socket = this.inputSocketClients.get(sessionId);
        if (socket) {
            socket.destroy();
            this.inputSocketClients.delete(sessionId);
        }
    }
    /**
     * Cleanup all exited sessions
     */
    cleanupExitedSessions() {
        return this.sessionManager.cleanupExitedSessions();
    }
    /**
     * Create environment variables for sessions
     */
    createEnvVars(term) {
        const envVars = {
            TERM: term,
        };
        // Include other important terminal-related environment variables if they exist
        const importantVars = ['SHELL', 'LANG', 'LC_ALL', 'PATH', 'USER', 'HOME'];
        for (const varName of importantVars) {
            const value = process.env[varName];
            if (value) {
                envVars[varName] = value;
            }
        }
        return envVars;
    }
    /**
     * Get active session count
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }
    /**
     * Check if a session is active (has running PTY)
     */
    isSessionActive(sessionId) {
        return this.sessions.has(sessionId);
    }
    /**
     * Shutdown all active sessions and clean up resources
     */
    async shutdown() {
        for (const [sessionId, session] of Array.from(this.sessions.entries())) {
            try {
                if (session.ptyProcess) {
                    session.ptyProcess.kill();
                    // Note: We no longer kill the process group to avoid affecting other sessions
                    // that might share the same process group (e.g., multiple fwd.ts instances)
                    // The shutdown() method is only called during server shutdown where we DO want
                    // to clean up all sessions, but we still avoid process group kills to be safe
                }
                if (session.asciinemaWriter?.isOpen()) {
                    await session.asciinemaWriter.close();
                }
                // Clean up all session resources
                this.cleanupSessionResources(session);
            }
            catch (error) {
                logger.error(`Failed to cleanup session ${sessionId} during shutdown:`, error);
            }
        }
        this.sessions.clear();
        // Clean up all socket clients
        for (const [_sessionId, socket] of this.inputSocketClients.entries()) {
            try {
                socket.destroy();
            }
            catch (_e) {
                // Socket already destroyed
            }
        }
        this.inputSocketClients.clear();
        // Clean up resize event listeners
        for (const removeListener of this.resizeEventListeners) {
            try {
                removeListener();
            }
            catch (error) {
                logger.error('Failed to remove resize event listener:', error);
            }
        }
        this.resizeEventListeners.length = 0;
    }
    /**
     * Get session manager instance
     */
    getSessionManager() {
        return this.sessionManager;
    }
    /**
     * Write activity state only if it has changed
     */
    writeActivityState(session, activityState) {
        const activityPath = path.join(session.controlDir, 'claude-activity.json');
        const activityData = {
            isActive: activityState.isActive,
            specificStatus: activityState.specificStatus,
            timestamp: new Date().toISOString(),
        };
        const stateJson = JSON.stringify(activityData);
        const lastState = this.lastWrittenActivityState.get(session.id);
        if (lastState !== stateJson) {
            try {
                fs.writeFileSync(activityPath, JSON.stringify(activityData, null, 2));
                this.lastWrittenActivityState.set(session.id, stateJson);
                // Debug log first write
                if (!session.activityFileWritten) {
                    session.activityFileWritten = true;
                    logger.debug(`Writing activity state to ${activityPath} for session ${session.id}`, {
                        activityState,
                        timestamp: activityData.timestamp,
                    });
                }
            }
            catch (error) {
                logger.error(`Failed to write activity state for session ${session.id}:`, error);
            }
        }
    }
    /**
     * Track and emit events for proper cleanup
     */
    trackAndEmit(event, sessionId, ...args) {
        const listeners = this.listeners(event);
        if (!this.sessionEventListeners.has(sessionId)) {
            this.sessionEventListeners.set(sessionId, new Set());
        }
        const sessionListeners = this.sessionEventListeners.get(sessionId);
        if (!sessionListeners) {
            return;
        }
        listeners.forEach((listener) => sessionListeners.add(listener));
        this.emit(event, sessionId, ...args);
    }
    /**
     * Clean up all resources associated with a session
     */
    cleanupSessionResources(session) {
        // Clean up resize tracking
        this.sessionResizeSources.delete(session.id);
        // Clean up title update interval for dynamic mode
        if (session.titleUpdateInterval) {
            clearInterval(session.titleUpdateInterval);
            session.titleUpdateInterval = undefined;
        }
        // Clean up activity detector
        if (session.activityDetector) {
            session.activityDetector.clearStatus();
            session.activityDetector = undefined;
        }
        // Clean up title filter
        if (session.titleFilter) {
            // No need to reset, just remove reference
            session.titleFilter = undefined;
        }
        // Clean up session.json watcher/interval
        if (session.sessionJsonWatcher) {
            session.sessionJsonWatcher.close();
            session.sessionJsonWatcher = undefined;
        }
        if (session.sessionJsonInterval) {
            clearInterval(session.sessionJsonInterval);
            session.sessionJsonInterval = undefined;
        }
        // Clean up connected socket clients
        if (session.connectedClients) {
            for (const client of session.connectedClients) {
                try {
                    client.destroy();
                }
                catch (_e) {
                    // Client already destroyed
                }
            }
            session.connectedClients.clear();
        }
        // Clean up input socket server
        if (session.inputSocketServer) {
            // Close the server and wait for it to close
            session.inputSocketServer.close();
            // Unref the server so it doesn't keep the process alive
            session.inputSocketServer.unref();
            try {
                fs.unlinkSync(path.join(session.controlDir, 'ipc.sock'));
            }
            catch (_e) {
                // Socket already removed
            }
        }
        // Note: stdin handling is done via IPC socket, no global listeners to clean up
        // Remove all event listeners for this session
        const listeners = this.sessionEventListeners.get(session.id);
        if (listeners) {
            listeners.forEach((listener) => {
                this.removeListener('sessionNameChanged', listener);
                this.removeListener('watcherError', listener);
                this.removeListener('bell', listener);
            });
            this.sessionEventListeners.delete(session.id);
        }
        // Clean up activity state tracking
        this.lastWrittenActivityState.delete(session.id);
        // Clean up title injection timer
        if (session.titleInjectionTimer) {
            clearInterval(session.titleInjectionTimer);
            session.titleInjectionTimer = undefined;
        }
    }
    /**
     * Mark session for title update and trigger immediate check
     */
    markTitleUpdateNeeded(session) {
        logger.debug(`[markTitleUpdateNeeded] Called for session ${session.id}`, {
            titleMode: session.titleMode,
            sessionName: session.sessionInfo.name,
            titleUpdateNeeded: session.titleUpdateNeeded,
        });
        if (!session.titleMode || session.titleMode === types_js_1.TitleMode.NONE) {
            logger.debug(`[markTitleUpdateNeeded] Skipping - title mode is NONE or undefined`);
            return;
        }
        session.titleUpdateNeeded = true;
        logger.debug(`[markTitleUpdateNeeded] Set titleUpdateNeeded=true, calling checkAndUpdateTitle`);
        this.checkAndUpdateTitle(session);
    }
    /**
     * Update terminal title specifically for session name changes
     * This bypasses title mode checks to ensure name changes are always reflected
     */
    updateTerminalTitleForSessionName(session) {
        if (!session.stdoutQueue || !session.isExternalTerminal) {
            logger.debug(`[updateTerminalTitleForSessionName] Early return - no stdout queue or not external terminal`);
            return;
        }
        // For NONE mode, just use the session name
        // For other modes, regenerate the title with the new name
        let newTitle = null;
        if (!session.titleMode ||
            session.titleMode === types_js_1.TitleMode.NONE ||
            session.titleMode === types_js_1.TitleMode.FILTER) {
            // In NONE or FILTER mode, use simple session name
            newTitle = (0, terminal_title_js_1.generateTitleSequence)(session.currentWorkingDir || session.sessionInfo.workingDir, session.sessionInfo.command, session.sessionInfo.name || 'VibeTunnel');
        }
        else {
            // For STATIC and DYNAMIC modes, use the standard generation logic
            newTitle = this.generateTerminalTitle(session);
        }
        if (newTitle && newTitle !== session.currentTitle) {
            logger.debug(`[updateTerminalTitleForSessionName] Updating title for session name change`);
            session.pendingTitleToInject = newTitle;
            session.titleUpdateNeeded = true;
            // Start injection monitor if not already running
            if (!session.titleInjectionTimer) {
                this.startTitleInjectionMonitor(session);
            }
        }
    }
    /**
     * Check if title needs updating and write if changed
     */
    checkAndUpdateTitle(session) {
        logger.debug(`[checkAndUpdateTitle] Called for session ${session.id}`, {
            titleUpdateNeeded: session.titleUpdateNeeded,
            hasStdoutQueue: !!session.stdoutQueue,
            isExternalTerminal: session.isExternalTerminal,
            sessionName: session.sessionInfo.name,
        });
        if (!session.titleUpdateNeeded || !session.stdoutQueue || !session.isExternalTerminal) {
            logger.debug(`[checkAndUpdateTitle] Early return - conditions not met`);
            return;
        }
        // Generate new title
        logger.debug(`[checkAndUpdateTitle] Generating new title...`);
        const newTitle = this.generateTerminalTitle(session);
        // Debug logging for title updates
        logger.debug(`[Title Update] Session ${session.id}:`, {
            sessionName: session.sessionInfo.name,
            newTitle: newTitle ? `${newTitle.substring(0, 50)}...` : null,
            currentTitle: session.currentTitle ? `${session.currentTitle.substring(0, 50)}...` : null,
            titleChanged: newTitle !== session.currentTitle,
        });
        // Only proceed if title changed
        if (newTitle && newTitle !== session.currentTitle) {
            logger.debug(`[checkAndUpdateTitle] Title changed, queueing for injection`);
            // Store pending title
            session.pendingTitleToInject = newTitle;
            // Start injection monitor if not already running
            if (!session.titleInjectionTimer) {
                logger.debug(`[checkAndUpdateTitle] Starting title injection monitor`);
                this.startTitleInjectionMonitor(session);
            }
        }
        else {
            logger.debug(`[checkAndUpdateTitle] Title unchanged or null, skipping injection`, {
                newTitleNull: !newTitle,
                titlesEqual: newTitle === session.currentTitle,
            });
        }
        // Clear flag
        session.titleUpdateNeeded = false;
    }
    /**
     * Monitor for quiet period to safely inject title
     */
    startTitleInjectionMonitor(session) {
        // Run periodically to find quiet period
        session.titleInjectionTimer = setInterval(() => {
            if (!session.pendingTitleToInject || !session.stdoutQueue) {
                // No title to inject or session ended, stop monitor
                if (session.titleInjectionTimer) {
                    clearInterval(session.titleInjectionTimer);
                    session.titleInjectionTimer = undefined;
                }
                return;
            }
            const now = Date.now();
            const timeSinceLastWrite = now - (session.lastWriteTimestamp || 0);
            // Check for quiet period and not already injecting
            if (timeSinceLastWrite >= TITLE_INJECTION_QUIET_PERIOD_MS &&
                !session.titleInjectionInProgress) {
                // Safe to inject title - capture the title before clearing it
                const titleToInject = session.pendingTitleToInject;
                if (!titleToInject) {
                    return;
                }
                // Mark injection as in progress
                session.titleInjectionInProgress = true;
                // Update timestamp immediately to prevent quiet period violations
                session.lastWriteTimestamp = Date.now();
                session.stdoutQueue.enqueue(async () => {
                    try {
                        logger.debug(`[Title Injection] Writing title to stdout for session ${session.id}:`, {
                            title: `${titleToInject.substring(0, 50)}...`,
                        });
                        const canWrite = process.stdout.write(titleToInject);
                        if (!canWrite) {
                            await (0, events_1.once)(process.stdout, 'drain');
                        }
                        // Update tracking after successful write
                        session.currentTitle = titleToInject;
                        logger.debug(`[Title Injection] Successfully injected title for session ${session.id}`);
                        // Clear pending title only after successful write
                        if (session.pendingTitleToInject === titleToInject) {
                            session.pendingTitleToInject = undefined;
                        }
                        // If no more titles pending, stop monitor
                        if (!session.pendingTitleToInject && session.titleInjectionTimer) {
                            clearInterval(session.titleInjectionTimer);
                            session.titleInjectionTimer = undefined;
                        }
                    }
                    finally {
                        // Always clear the in-progress flag
                        session.titleInjectionInProgress = false;
                    }
                });
                logger.debug(`Injected title during quiet period (${timeSinceLastWrite}ms) for session ${session.id}`);
            }
        }, TITLE_INJECTION_CHECK_INTERVAL_MS);
    }
    /**
     * Generate terminal title based on session mode and state
     */
    generateTerminalTitle(session) {
        if (!session.titleMode || session.titleMode === types_js_1.TitleMode.NONE) {
            return null;
        }
        const currentDir = session.currentWorkingDir || session.sessionInfo.workingDir;
        logger.debug(`[generateTerminalTitle] Session ${session.id}:`, {
            titleMode: session.titleMode,
            sessionName: session.sessionInfo.name,
            sessionInfoObjectId: session.sessionInfo,
            currentDir,
            command: session.sessionInfo.command,
            activityDetectorExists: !!session.activityDetector,
        });
        if (session.titleMode === types_js_1.TitleMode.STATIC) {
            return (0, terminal_title_js_1.generateTitleSequence)(currentDir, session.sessionInfo.command, session.sessionInfo.name);
        }
        else if (session.titleMode === types_js_1.TitleMode.DYNAMIC && session.activityDetector) {
            const activity = session.activityDetector.getActivityState();
            logger.debug(`[generateTerminalTitle] Calling generateDynamicTitle with:`, {
                currentDir,
                command: session.sessionInfo.command,
                sessionName: session.sessionInfo.name,
                activity: activity,
            });
            return (0, terminal_title_js_1.generateDynamicTitle)(currentDir, session.sessionInfo.command, activity, session.sessionInfo.name, session.sessionInfo.gitRepoPath, undefined // Git branch will be fetched dynamically when needed
            );
        }
        return null;
    }
    /**
     * Start tracking foreground process for command completion notifications
     */
    startForegroundProcessTracking(session) {
        if (!session.ptyProcess)
            return;
        logger.debug(`Starting foreground process tracking for session ${session.id}`);
        const ptyPid = session.ptyProcess.pid;
        // Get the shell's process group ID (pgid)
        this.getProcessPgid(ptyPid)
            .then((shellPgid) => {
            if (shellPgid) {
                session.shellPgid = shellPgid;
                session.currentForegroundPgid = shellPgid;
                logger.info(`🔔 NOTIFICATION DEBUG: Starting command tracking for session ${session.id} - shellPgid: ${shellPgid}, polling every ${PROCESS_POLL_INTERVAL_MS}ms`);
                logger.debug(`Session ${session.id}: Shell PGID is ${shellPgid}, starting polling`);
                // Start polling for foreground process changes
                session.processPollingInterval = setInterval(() => {
                    this.checkForegroundProcess(session);
                }, PROCESS_POLL_INTERVAL_MS);
            }
            else {
                logger.warn(`Session ${session.id}: Could not get shell PGID`);
            }
        })
            .catch((err) => {
            logger.warn(`Failed to get shell PGID for session ${session.id}:`, err);
        });
    }
    /**
     * Get process group ID for a process
     */
    async getProcessPgid(pid) {
        try {
            const { stdout } = await this.execAsync(`ps -o pgid= -p ${pid}`, { timeout: 1000 });
            const pgid = Number.parseInt(stdout.trim(), 10);
            return Number.isNaN(pgid) ? null : pgid;
        }
        catch (_error) {
            return null;
        }
    }
    /**
     * Get the foreground process group of a terminal
     */
    async getTerminalForegroundPgid(session) {
        if (!session.ptyProcess)
            return null;
        try {
            // On Unix-like systems, we can check the terminal's foreground process group
            // biome-ignore lint/suspicious/noExplicitAny: Accessing internal node-pty property
            const ttyName = session.ptyProcess._pty; // Internal PTY name
            if (!ttyName) {
                logger.debug(`Session ${session.id}: No TTY name found, falling back to process tree`);
                return this.getForegroundFromProcessTree(session);
            }
            // Use ps to find processes associated with this terminal
            const psCommand = `ps -t ${ttyName} -o pgid,pid,ppid,command | grep -v PGID | head -1`;
            const { stdout } = await this.execAsync(psCommand, { timeout: 1000 });
            const lines = stdout.trim().split('\n');
            if (lines.length > 0 && lines[0].trim()) {
                const parts = lines[0].trim().split(/\s+/);
                const pgid = Number.parseInt(parts[0], 10);
                // Log the raw ps output for debugging
                logger.debug(`Session ${session.id}: ps output for TTY ${ttyName}: "${lines[0].trim()}"`);
                if (!Number.isNaN(pgid)) {
                    return pgid;
                }
            }
            logger.debug(`Session ${session.id}: Could not parse PGID from ps output, falling back`);
        }
        catch (error) {
            logger.debug(`Session ${session.id}: Error getting terminal PGID: ${error}, falling back`);
            // Fallback: try to get foreground process from process tree
            return this.getForegroundFromProcessTree(session);
        }
        return null;
    }
    /**
     * Get foreground process from process tree analysis
     */
    async getForegroundFromProcessTree(session) {
        if (!session.ptyProcess)
            return null;
        try {
            const processTree = await this.processTreeAnalyzer.getProcessTree(session.ptyProcess.pid);
            // Find the most recent non-shell process
            for (const proc of processTree) {
                if (proc.pgid !== session.shellPgid && proc.command && !this.isShellProcess(proc.command)) {
                    return proc.pgid;
                }
            }
        }
        catch (error) {
            logger.debug(`Failed to analyze process tree for session ${session.id}:`, error);
        }
        return session.shellPgid || null;
    }
    /**
     * Check if a command is a shell process
     */
    isShellProcess(command) {
        const shellNames = ['bash', 'zsh', 'fish', 'sh', 'dash', 'tcsh', 'csh'];
        const cmdLower = command.toLowerCase();
        return shellNames.some((shell) => cmdLower.includes(shell));
    }
    /**
     * Check current foreground process and detect changes
     */
    async checkForegroundProcess(session) {
        if (!session.ptyProcess || !session.shellPgid)
            return;
        try {
            const currentPgid = await this.getTerminalForegroundPgid(session);
            // Enhanced debug logging
            const timestamp = new Date().toISOString();
            logger.debug(chalk_1.default.gray(`[${timestamp}] Session ${session.id} PGID check: current=${currentPgid}, previous=${session.currentForegroundPgid}, shell=${session.shellPgid}`));
            // Add debug logging
            if (currentPgid !== session.currentForegroundPgid) {
                logger.info(`🔔 NOTIFICATION DEBUG: PGID change detected - sessionId: ${session.id}, from ${session.currentForegroundPgid} to ${currentPgid}, shellPgid: ${session.shellPgid}`);
                logger.debug(chalk_1.default.yellow(`Session ${session.id}: Foreground PGID changed from ${session.currentForegroundPgid} to ${currentPgid}`));
            }
            if (currentPgid && currentPgid !== session.currentForegroundPgid) {
                // Foreground process changed
                const previousPgid = session.currentForegroundPgid;
                session.currentForegroundPgid = currentPgid;
                if (currentPgid === session.shellPgid && previousPgid !== session.shellPgid) {
                    // A command just finished (returned to shell)
                    logger.debug(chalk_1.default.green(`Session ${session.id}: Command finished, returning to shell (PGID ${previousPgid} → ${currentPgid})`));
                    await this.handleCommandFinished(session, previousPgid);
                }
                else if (currentPgid !== session.shellPgid) {
                    // A new command started
                    logger.debug(chalk_1.default.blue(`Session ${session.id}: New command started (PGID ${currentPgid})`));
                    await this.handleCommandStarted(session, currentPgid);
                }
            }
        }
        catch (error) {
            logger.debug(`Error checking foreground process for session ${session.id}:`, error);
        }
    }
    /**
     * Handle when a new command starts
     */
    async handleCommandStarted(session, pgid) {
        try {
            // Get command info from process tree
            if (!session.ptyProcess)
                return;
            const processTree = await this.processTreeAnalyzer.getProcessTree(session.ptyProcess.pid);
            const commandProc = processTree.find((p) => p.pgid === pgid);
            if (commandProc) {
                session.currentCommand = commandProc.command;
                session.commandStartTime = Date.now();
                // Update SessionMonitor with new command
                if (this.sessionMonitor) {
                    this.sessionMonitor.updateCommand(session.id, commandProc.command);
                }
                // Special logging for Claude commands
                const isClaudeCommand = commandProc.command.toLowerCase().includes('claude');
                if (isClaudeCommand) {
                    logger.log(chalk_1.default.cyan(`🤖 Session ${session.id}: Claude command started: "${commandProc.command}" (PGID: ${pgid})`));
                }
                else {
                    logger.debug(`Session ${session.id}: Command started: "${commandProc.command}" (PGID: ${pgid})`);
                }
                // Log process tree for debugging
                logger.debug(`Process tree for session ${session.id}:`, processTree.map((p) => `  PID: ${p.pid}, PGID: ${p.pgid}, CMD: ${p.command}`).join('\n'));
            }
            else {
                logger.warn(chalk_1.default.yellow(`Session ${session.id}: Could not find process info for PGID ${pgid}`));
            }
        }
        catch (error) {
            logger.debug(`Failed to get command info for session ${session.id}:`, error);
        }
    }
    /**
     * Handle when a command finishes
     */
    async handleCommandFinished(session, pgid) {
        if (!pgid || !session.commandStartTime || !session.currentCommand) {
            logger.debug(chalk_1.default.red(`Session ${session.id}: Cannot handle command finished - missing data: pgid=${pgid}, startTime=${session.commandStartTime}, command="${session.currentCommand}"`));
            return;
        }
        const duration = Date.now() - session.commandStartTime;
        const command = session.currentCommand;
        const isClaudeCommand = command.toLowerCase().includes('claude');
        // Reset tracking
        session.currentCommand = undefined;
        session.commandStartTime = undefined;
        // Log command completion for Claude
        if (isClaudeCommand) {
            logger.log(chalk_1.default.cyan(`🤖 Session ${session.id}: Claude command completed: "${command}" (duration: ${duration}ms)`));
        }
        // Check if we should notify - bypass duration check for Claude commands
        if (!isClaudeCommand && duration < MIN_COMMAND_DURATION_MS) {
            logger.debug(`Session ${session.id}: Command "${command}" too short (${duration}ms < ${MIN_COMMAND_DURATION_MS}ms), not notifying`);
            return;
        }
        // Log duration for Claude commands even if bypassing the check
        if (isClaudeCommand && duration < MIN_COMMAND_DURATION_MS) {
            logger.log(chalk_1.default.yellow(`⚡ Session ${session.id}: Claude command completed quickly (${duration}ms) - still notifying`));
        }
        // Check if it's a built-in shell command
        const baseCommand = command.split(/\s+/)[0];
        if (SHELL_COMMANDS.has(baseCommand)) {
            logger.debug(`Session ${session.id}: Ignoring built-in command: ${baseCommand}`);
            return;
        }
        // Try to get exit code (this is tricky and might not always work)
        const exitCode = 0;
        try {
            // Check if we can find the exit status in shell history or process info
            // This is platform-specific and might not be reliable
            const { stdout } = await this.execAsync(`ps -o pid,stat -p ${pgid} 2>/dev/null || echo "NOTFOUND"`, { timeout: 500 });
            if (stdout.includes('NOTFOUND') || stdout.includes('Z')) {
                // Process is zombie or not found, likely exited
                // We can't reliably get exit code this way
                logger.debug(`Session ${session.id}: Process ${pgid} not found or zombie, assuming exit code 0`);
            }
        }
        catch (_error) {
            // Ignore errors in exit code detection
            logger.debug(`Session ${session.id}: Could not detect exit code for process ${pgid}`);
        }
        // Emit the event
        const eventData = {
            sessionId: session.id,
            command,
            exitCode,
            duration,
            timestamp: new Date().toISOString(),
        };
        logger.info(`🔔 NOTIFICATION DEBUG: Emitting commandFinished event - sessionId: ${session.id}, command: "${command}", duration: ${duration}ms, exitCode: ${exitCode}`);
        this.emit('commandFinished', eventData);
        // Send notification to Mac app
        if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
            const notifTitle = isClaudeCommand ? 'Claude Task Finished' : 'Command Finished';
            const notifBody = `"${command}" completed in ${Math.round(duration / 1000)}s.`;
            logger.info(`🔔 NOTIFICATION DEBUG: Sending command notification to Mac - title: "${notifTitle}", body: "${notifBody}"`);
            control_unix_handler_js_1.controlUnixHandler.sendNotification('Your Turn', notifBody, {
                type: 'your-turn',
                sessionId: session.id,
                sessionName: session.sessionInfo.name || session.sessionInfo.command.join(' '),
            });
        }
        else {
            logger.warn('🔔 NOTIFICATION DEBUG: Cannot send command notification - Mac app not connected');
        }
        // Enhanced logging for events
        if (isClaudeCommand) {
            logger.log(chalk_1.default.green(`✅ Session ${session.id}: Claude command notification event emitted: "${command}" (duration: ${duration}ms, exit: ${exitCode})`));
        }
        else {
            logger.log(`Session ${session.id}: Command finished: "${command}" (duration: ${duration}ms)`);
        }
        logger.debug(`Session ${session.id}: commandFinished event data:`, eventData);
    }
}
exports.PtyManager = PtyManager;
PtyManager.initialized = false;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHR5LW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3B0eS9wdHktbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7O0dBS0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILGtEQUEwQjtBQUMxQixpREFBcUM7QUFDckMsbUNBQTRDO0FBQzVDLHVDQUF5QjtBQUN6Qix5Q0FBMkI7QUFFM0IsMkNBQTZCO0FBRTdCLHdDQUF3QztBQUN4QyxJQUFJLEdBQThCLENBQUM7QUFFbkMsZ0RBQWdEO0FBQ2hELCtCQUFpQztBQUNqQywrQkFBb0M7QUFRcEMsb0RBQWtEO0FBQ2xELG1GQUEyRTtBQUUzRSx3RUFBcUY7QUFDckYsd0VBQW9FO0FBQ3BFLGtEQUFrRDtBQUNsRCxrRUFLb0M7QUFDcEMsNERBQXFEO0FBQ3JELDhDQUF3QztBQUN4QyxrRkFBMEU7QUFDMUUsK0RBQXdEO0FBQ3hELHVEQUFnRDtBQUNoRCx5REFBa0Q7QUFDbEQsNkRBQXNEO0FBQ3RELDZEQU04QjtBQUM5Qix5Q0FPb0I7QUFFcEIsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRTNDLG1DQUFtQztBQUNuQyxNQUFNLHdCQUF3QixHQUFHLElBQUksQ0FBQyxDQUFDLDZDQUE2QztBQUNwRixNQUFNLCtCQUErQixHQUFHLEVBQUUsQ0FBQyxDQUFDLDhDQUE4QztBQUMxRixNQUFNLGlDQUFpQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLHNDQUFzQztBQUVwRix3Q0FBd0M7QUFDeEMsTUFBTSx3QkFBd0IsR0FBRyxHQUFHLENBQUMsQ0FBQyx3Q0FBd0M7QUFDOUUsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsQ0FBQyxvRUFBb0U7QUFDMUcsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFB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O1lBQ3BCLE1BQU0sQ0FBQyxHQUFHLENBQ1IsZUFBSyxDQUFDLEtBQUssQ0FDVCxhQUFhLE9BQU8sQ0FBQyxFQUFFLGlEQUFpRCxPQUFPLGdCQUFnQixRQUFRLGFBQWEsUUFBUSxHQUFHLENBQ2hJLENBQ0YsQ0FBQztRQUNKLENBQUM7YUFBTSxDQUFDO1lBQ04sTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLE9BQU8sQ0FBQyxFQUFFLHdCQUF3QixPQUFPLGdCQUFnQixRQUFRLEtBQUssQ0FBQyxDQUFDO1FBQ2hHLENBQUM7UUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsT0FBTyxDQUFDLEVBQUUsK0JBQStCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDaEYsQ0FBQzs7QUF6aEZILGdDQStoRkM7QUFwaEZnQixzQkFBVyxHQUFHLEtBQUssQUFBUixDQUFTIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQdHlNYW5hZ2VyIC0gQ29yZSBQVFkgbWFuYWdlbWVudCB1c2luZyBub2RlLXB0eVxuICpcbiAqIFRoaXMgY2xhc3MgaGFuZGxlcyBQVFkgY3JlYXRpb24sIHByb2Nlc3MgbWFuYWdlbWVudCwgYW5kIEkvTyBvcGVyYXRpb25zXG4gKiB1c2luZyB0aGUgbm9kZS1wdHkgbGlicmFyeSB3aGlsZSBtYWludGFpbmluZyBjb21wYXRpYmlsaXR5IHdpdGggdHR5LWZ3ZC5cbiAqL1xuXG5pbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgRXZlbnRFbWl0dGVyLCBvbmNlIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHR5cGUgeyBJUHR5LCBJUHR5Rm9ya09wdGlvbnMgfSBmcm9tICdub2RlLXB0eSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vLyBJbXBvcnQgbm9kZS1wdHkgd2l0aCBmYWxsYmFjayBzdXBwb3J0XG5sZXQgcHR5OiB0eXBlb2YgaW1wb3J0KCdub2RlLXB0eScpO1xuXG4vLyBEeW5hbWljIGltcG9ydCB3aWxsIGJlIGRvbmUgaW4gaW5pdGlhbGl6YXRpb25cbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgdHlwZSB7XG4gIFNlc3Npb24sXG4gIFNlc3Npb25DcmVhdGVPcHRpb25zLFxuICBTZXNzaW9uSW5mbyxcbiAgU2Vzc2lvbklucHV0LFxuICBTcGVjaWFsS2V5LFxufSBmcm9tICcuLi8uLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgVGl0bGVNb2RlIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB7IFByb2Nlc3NUcmVlQW5hbHl6ZXIgfSBmcm9tICcuLi9zZXJ2aWNlcy9wcm9jZXNzLXRyZWUtYW5hbHl6ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uTW9uaXRvciB9IGZyb20gJy4uL3NlcnZpY2VzL3Nlc3Npb24tbW9uaXRvci5qcyc7XG5pbXBvcnQgeyBBY3Rpdml0eURldGVjdG9yLCB0eXBlIEFjdGl2aXR5U3RhdGUgfSBmcm9tICcuLi91dGlscy9hY3Rpdml0eS1kZXRlY3Rvci5qcyc7XG5pbXBvcnQgeyBUaXRsZVNlcXVlbmNlRmlsdGVyIH0gZnJvbSAnLi4vdXRpbHMvYW5zaS10aXRsZS1maWx0ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7XG4gIGV4dHJhY3RDZERpcmVjdG9yeSxcbiAgZ2VuZXJhdGVEeW5hbWljVGl0bGUsXG4gIGdlbmVyYXRlVGl0bGVTZXF1ZW5jZSxcbiAgc2hvdWxkSW5qZWN0VGl0bGUsXG59IGZyb20gJy4uL3V0aWxzL3Rlcm1pbmFsLXRpdGxlLmpzJztcbmltcG9ydCB7IFdyaXRlUXVldWUgfSBmcm9tICcuLi91dGlscy93cml0ZS1xdWV1ZS5qcyc7XG5pbXBvcnQgeyBWRVJTSU9OIH0gZnJvbSAnLi4vdmVyc2lvbi5qcyc7XG5pbXBvcnQgeyBjb250cm9sVW5peEhhbmRsZXIgfSBmcm9tICcuLi93ZWJzb2NrZXQvY29udHJvbC11bml4LWhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQXNjaWluZW1hV3JpdGVyIH0gZnJvbSAnLi9hc2NpaW5lbWEtd3JpdGVyLmpzJztcbmltcG9ydCB7IEZpc2hIYW5kbGVyIH0gZnJvbSAnLi9maXNoLWhhbmRsZXIuanMnO1xuaW1wb3J0IHsgUHJvY2Vzc1V0aWxzIH0gZnJvbSAnLi9wcm9jZXNzLXV0aWxzLmpzJztcbmltcG9ydCB7IFNlc3Npb25NYW5hZ2VyIH0gZnJvbSAnLi9zZXNzaW9uLW1hbmFnZXIuanMnO1xuaW1wb3J0IHtcbiAgdHlwZSBDb250cm9sQ29tbWFuZCxcbiAgZnJhbWVNZXNzYWdlLFxuICBNZXNzYWdlUGFyc2VyLFxuICBNZXNzYWdlVHlwZSxcbiAgcGFyc2VQYXlsb2FkLFxufSBmcm9tICcuL3NvY2tldC1wcm90b2NvbC5qcyc7XG5pbXBvcnQge1xuICB0eXBlIEtpbGxDb250cm9sTWVzc2FnZSxcbiAgUHR5RXJyb3IsXG4gIHR5cGUgUHR5U2Vzc2lvbixcbiAgdHlwZSBSZXNldFNpemVDb250cm9sTWVzc2FnZSxcbiAgdHlwZSBSZXNpemVDb250cm9sTWVzc2FnZSxcbiAgdHlwZSBTZXNzaW9uQ3JlYXRpb25SZXN1bHQsXG59IGZyb20gJy4vdHlwZXMuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3B0eS1tYW5hZ2VyJyk7XG5cbi8vIFRpdGxlIGluamVjdGlvbiB0aW1pbmcgY29uc3RhbnRzXG5jb25zdCBUSVRMRV9VUERBVEVfSU5URVJWQUxfTVMgPSAxMDAwOyAvLyBIb3cgb2Z0ZW4gdG8gY2hlY2sgaWYgdGl0bGUgbmVlZHMgdXBkYXRpbmdcbmNvbnN0IFRJVExFX0lOSkVDVElPTl9RVUlFVF9QRVJJT0RfTVMgPSA1MDsgLy8gTWluaW11bSBxdWlldCBwZXJpb2QgYmVmb3JlIGluamVjdGluZyB0aXRsZVxuY29uc3QgVElUTEVfSU5KRUNUSU9OX0NIRUNLX0lOVEVSVkFMX01TID0gMTA7IC8vIEhvdyBvZnRlbiB0byBjaGVjayBmb3IgcXVpZXQgcGVyaW9kXG5cbi8vIEZvcmVncm91bmQgcHJvY2VzcyB0cmFja2luZyBjb25zdGFudHNcbmNvbnN0IFBST0NFU1NfUE9MTF9JTlRFUlZBTF9NUyA9IDUwMDsgLy8gSG93IG9mdGVuIHRvIGNoZWNrIGZvcmVncm91bmQgcHJvY2Vzc1xuY29uc3QgTUlOX0NPTU1BTkRfRFVSQVRJT05fTVMgPSAzMDAwOyAvLyBNaW5pbXVtIGR1cmF0aW9uIGZvciBjb21tYW5kIGNvbXBsZXRpb24gbm90aWZpY2F0aW9ucyAoMyBzZWNvbmRzKVxuY29uc3QgU0hFTExfQ09NTUFORFMgPSBuZXcgU2V0KFsnY2QnLCAnbHMnLCAncHdkJywgJ2VjaG8nLCAnZXhwb3J0JywgJ2FsaWFzJywgJ3Vuc2V0J10pOyAvLyBCdWlsdC1pbiBjb21tYW5kcyB0byBpZ25vcmVcblxuLyoqXG4gKiBQdHlNYW5hZ2VyIGhhbmRsZXMgdGhlIGxpZmVjeWNsZSBhbmQgSS9PIG9wZXJhdGlvbnMgb2YgcHNldWRvLXRlcm1pbmFsIChQVFkpIHNlc3Npb25zLlxuICpcbiAqIFRoaXMgY2xhc3MgcHJvdmlkZXMgY29tcHJlaGVuc2l2ZSB0ZXJtaW5hbCBzZXNzaW9uIG1hbmFnZW1lbnQgaW5jbHVkaW5nOlxuICogLSBDcmVhdGluZyBhbmQgbWFuYWdpbmcgUFRZIHByb2Nlc3NlcyB1c2luZyBub2RlLXB0eVxuICogLSBIYW5kbGluZyB0ZXJtaW5hbCBpbnB1dC9vdXRwdXQgd2l0aCBwcm9wZXIgYnVmZmVyaW5nIGFuZCBxdWV1aW5nXG4gKiAtIE1hbmFnaW5nIHRlcm1pbmFsIHJlc2l6aW5nIGZyb20gYm90aCBicm93c2VyIGFuZCBob3N0IHRlcm1pbmFsXG4gKiAtIFJlY29yZGluZyBzZXNzaW9ucyBpbiBhc2NpaW5lbWEgZm9ybWF0IGZvciBwbGF5YmFja1xuICogLSBDb21tdW5pY2F0aW5nIHdpdGggZXh0ZXJuYWwgc2Vzc2lvbnMgdmlhIFVuaXggZG9tYWluIHNvY2tldHNcbiAqIC0gRHluYW1pYyB0ZXJtaW5hbCB0aXRsZSBtYW5hZ2VtZW50IHdpdGggYWN0aXZpdHkgZGV0ZWN0aW9uXG4gKiAtIFNlc3Npb24gcGVyc2lzdGVuY2UgYW5kIHJlY292ZXJ5IGFjcm9zcyBzZXJ2ZXIgcmVzdGFydHNcbiAqXG4gKiBUaGUgUHR5TWFuYWdlciBzdXBwb3J0cyBib3RoIGluLW1lbW9yeSBzZXNzaW9ucyAod2hlcmUgdGhlIFBUWSBpcyBtYW5hZ2VkIGRpcmVjdGx5KVxuICogYW5kIGV4dGVybmFsIHNlc3Npb25zICh3aGVyZSBjb21tdW5pY2F0aW9uIGhhcHBlbnMgdmlhIElQQyBzb2NrZXRzKS5cbiAqXG4gKiBAZXh0ZW5kcyBFdmVudEVtaXR0ZXJcbiAqXG4gKiBAZmlyZXMgUHR5TWFuYWdlciNzZXNzaW9uRXhpdGVkIC0gV2hlbiBhIHNlc3Npb24gdGVybWluYXRlc1xuICogQGZpcmVzIFB0eU1hbmFnZXIjc2Vzc2lvbk5hbWVDaGFuZ2VkIC0gV2hlbiBhIHNlc3Npb24gbmFtZSBpcyB1cGRhdGVkXG4gKiBAZmlyZXMgUHR5TWFuYWdlciNiZWxsIC0gV2hlbiBhIGJlbGwgY2hhcmFjdGVyIGlzIGRldGVjdGVkIGluIHRlcm1pbmFsIG91dHB1dFxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgYSBQVFkgbWFuYWdlciBpbnN0YW5jZVxuICogY29uc3QgcHR5TWFuYWdlciA9IG5ldyBQdHlNYW5hZ2VyKCcvcGF0aC90by9jb250cm9sL2RpcicpO1xuICpcbiAqIC8vIENyZWF0ZSBhIG5ldyBzZXNzaW9uXG4gKiBjb25zdCB7IHNlc3Npb25JZCwgc2Vzc2lvbkluZm8gfSA9IGF3YWl0IHB0eU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihcbiAqICAgWydiYXNoJywgJy1sJ10sXG4gKiAgIHtcbiAqICAgICBuYW1lOiAnTXkgVGVybWluYWwnLFxuICogICAgIHdvcmtpbmdEaXI6ICcvaG9tZS91c2VyJyxcbiAqICAgICBjb2xzOiA4MCxcbiAqICAgICByb3dzOiAyNCxcbiAqICAgICB0aXRsZU1vZGU6IFRpdGxlTW9kZS5EWU5BTUlDXG4gKiAgIH1cbiAqICk7XG4gKlxuICogLy8gU2VuZCBpbnB1dCB0byB0aGUgc2Vzc2lvblxuICogcHR5TWFuYWdlci5zZW5kSW5wdXQoc2Vzc2lvbklkLCB7IHRleHQ6ICdscyAtbGFcXG4nIH0pO1xuICpcbiAqIC8vIFJlc2l6ZSB0aGUgdGVybWluYWxcbiAqIHB0eU1hbmFnZXIucmVzaXplU2Vzc2lvbihzZXNzaW9uSWQsIDEwMCwgMzApO1xuICpcbiAqIC8vIEtpbGwgdGhlIHNlc3Npb24gZ3JhY2VmdWxseVxuICogYXdhaXQgcHR5TWFuYWdlci5raWxsU2Vzc2lvbihzZXNzaW9uSWQpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBQdHlNYW5hZ2VyIGV4dGVuZHMgRXZlbnRFbWl0dGVyIHtcbiAgcHJpdmF0ZSBzZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBQdHlTZXNzaW9uPigpO1xuICBwcml2YXRlIHNlc3Npb25NYW5hZ2VyOiBTZXNzaW9uTWFuYWdlcjtcbiAgcHJpdmF0ZSBkZWZhdWx0VGVybSA9ICd4dGVybS0yNTZjb2xvcic7XG4gIHByaXZhdGUgaW5wdXRTb2NrZXRDbGllbnRzID0gbmV3IE1hcDxzdHJpbmcsIG5ldC5Tb2NrZXQ+KCk7IC8vIENhY2hlIHNvY2tldCBjb25uZWN0aW9uc1xuICBwcml2YXRlIGxhc3RUZXJtaW5hbFNpemU6IHsgY29sczogbnVtYmVyOyByb3dzOiBudW1iZXIgfSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHJlc2l6ZUV2ZW50TGlzdGVuZXJzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdO1xuICBwcml2YXRlIHNlc3Npb25SZXNpemVTb3VyY2VzID0gbmV3IE1hcDxcbiAgICBzdHJpbmcsXG4gICAgeyBjb2xzOiBudW1iZXI7IHJvd3M6IG51bWJlcjsgc291cmNlOiAnYnJvd3NlcicgfCAndGVybWluYWwnOyB0aW1lc3RhbXA6IG51bWJlciB9XG4gID4oKTtcbiAgcHJpdmF0ZSBzdGF0aWMgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBzZXNzaW9uRXZlbnRMaXN0ZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgU2V0PCguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQ+PigpO1xuICBwcml2YXRlIHNlc3Npb25FeGl0VGltZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpOyAvLyBUcmFjayBzZXNzaW9uIGV4aXQgdGltZXMgdG8gYXZvaWQgZmFsc2UgYmVsbHNcbiAgcHJpdmF0ZSBwcm9jZXNzVHJlZUFuYWx5emVyID0gbmV3IFByb2Nlc3NUcmVlQW5hbHl6ZXIoKTsgLy8gUHJvY2VzcyB0cmVlIGFuYWx5c2lzIGZvciBiZWxsIHNvdXJjZSBpZGVudGlmaWNhdGlvblxuICBwcml2YXRlIGFjdGl2aXR5RmlsZVdhcm5pbmdzTG9nZ2VkID0gbmV3IFNldDxzdHJpbmc+KCk7IC8vIFRyYWNrIHdoaWNoIHNlc3Npb25zIHdlJ3ZlIGxvZ2dlZCB3YXJuaW5ncyBmb3JcbiAgcHJpdmF0ZSBsYXN0V3JpdHRlbkFjdGl2aXR5U3RhdGUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpOyAvLyBUcmFjayBsYXN0IHdyaXR0ZW4gYWN0aXZpdHkgc3RhdGUgdG8gYXZvaWQgdW5uZWNlc3Nhcnkgd3JpdGVzXG4gIHByaXZhdGUgc2Vzc2lvbk1vbml0b3I6IFNlc3Npb25Nb25pdG9yIHwgbnVsbCA9IG51bGw7IC8vIFJlZmVyZW5jZSB0byBTZXNzaW9uTW9uaXRvciBmb3Igbm90aWZpY2F0aW9uIHRyYWNraW5nXG5cbiAgLy8gQ29tbWFuZCB0cmFja2luZyBmb3Igbm90aWZpY2F0aW9uc1xuICBwcml2YXRlIGNvbW1hbmRUcmFja2luZyA9IG5ldyBNYXA8XG4gICAgc3RyaW5nLFxuICAgIHtcbiAgICAgIGNvbW1hbmQ6IHN0cmluZztcbiAgICAgIHN0YXJ0VGltZTogbnVtYmVyO1xuICAgICAgcGlkPzogbnVtYmVyO1xuICAgIH1cbiAgPigpO1xuXG4gIGNvbnN0cnVjdG9yKGNvbnRyb2xQYXRoPzogc3RyaW5nKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLnNlc3Npb25NYW5hZ2VyID0gbmV3IFNlc3Npb25NYW5hZ2VyKGNvbnRyb2xQYXRoKTtcbiAgICB0aGlzLnByb2Nlc3NUcmVlQW5hbHl6ZXIgPSBuZXcgUHJvY2Vzc1RyZWVBbmFseXplcigpO1xuICAgIHRoaXMuc2V0dXBUZXJtaW5hbFJlc2l6ZURldGVjdGlvbigpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBub2RlLXB0eSBpZiBub3QgYWxyZWFkeSBkb25lXG4gICAgaWYgKCFQdHlNYW5hZ2VyLmluaXRpYWxpemVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1B0eU1hbmFnZXIgbm90IGluaXRpYWxpemVkLiBDYWxsIFB0eU1hbmFnZXIuaW5pdGlhbGl6ZSgpIGZpcnN0LicpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIFB0eU1hbmFnZXIgd2l0aCBmYWxsYmFjayBzdXBwb3J0IGZvciBub2RlLXB0eVxuICAgKi9cbiAgcHVibGljIHN0YXRpYyBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChQdHlNYW5hZ2VyLmluaXRpYWxpemVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5sb2coJ0luaXRpYWxpemluZyBQdHlNYW5hZ2VyLi4uJyk7XG4gICAgICBwdHkgPSBhd2FpdCBpbXBvcnQoJ25vZGUtcHR5Jyk7XG4gICAgICBQdHlNYW5hZ2VyLmluaXRpYWxpemVkID0gdHJ1ZTtcbiAgICAgIGxvZ2dlci5sb2coJ+KchSBQdHlNYW5hZ2VyIGluaXRpYWxpemVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBpbml0aWFsaXplIFB0eU1hbmFnZXI6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ2Fubm90IGxvYWQgbm9kZS1wdHk6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNldCB0aGUgU2Vzc2lvbk1vbml0b3IgaW5zdGFuY2UgZm9yIGFjdGl2aXR5IHRyYWNraW5nXG4gICAqL1xuICBwdWJsaWMgc2V0U2Vzc2lvbk1vbml0b3IobW9uaXRvcjogU2Vzc2lvbk1vbml0b3IpOiB2b2lkIHtcbiAgICB0aGlzLnNlc3Npb25Nb25pdG9yID0gbW9uaXRvcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXR1cCB0ZXJtaW5hbCByZXNpemUgZGV0ZWN0aW9uIGZvciB3aGVuIHRoZSBob3N0aW5nIHRlcm1pbmFsIGlzIHJlc2l6ZWRcbiAgICovXG4gIHByaXZhdGUgc2V0dXBUZXJtaW5hbFJlc2l6ZURldGVjdGlvbigpOiB2b2lkIHtcbiAgICAvLyBPbmx5IHNldHVwIHJlc2l6ZSBkZXRlY3Rpb24gaWYgd2UncmUgcnVubmluZyBpbiBhIFRUWVxuICAgIGlmICghcHJvY2Vzcy5zdGRvdXQuaXNUVFkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnTm90IGEgVFRZLCBza2lwcGluZyB0ZXJtaW5hbCByZXNpemUgZGV0ZWN0aW9uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gU3RvcmUgaW5pdGlhbCB0ZXJtaW5hbCBzaXplXG4gICAgdGhpcy5sYXN0VGVybWluYWxTaXplID0ge1xuICAgICAgY29sczogcHJvY2Vzcy5zdGRvdXQuY29sdW1ucyB8fCA4MCxcbiAgICAgIHJvd3M6IHByb2Nlc3Muc3Rkb3V0LnJvd3MgfHwgMjQsXG4gICAgfTtcblxuICAgIC8vIE1ldGhvZCAxOiBMaXN0ZW4gZm9yIE5vZGUuanMgVFRZIHJlc2l6ZSBldmVudHMgKG1vc3QgcmVsaWFibGUpXG4gICAgY29uc3QgaGFuZGxlU3Rkb3V0UmVzaXplID0gKCkgPT4ge1xuICAgICAgY29uc3QgbmV3Q29scyA9IHByb2Nlc3Muc3Rkb3V0LmNvbHVtbnMgfHwgODA7XG4gICAgICBjb25zdCBuZXdSb3dzID0gcHJvY2Vzcy5zdGRvdXQucm93cyB8fCAyNDtcbiAgICAgIHRoaXMuaGFuZGxlVGVybWluYWxSZXNpemUobmV3Q29scywgbmV3Um93cyk7XG4gICAgfTtcblxuICAgIHByb2Nlc3Muc3Rkb3V0Lm9uKCdyZXNpemUnLCBoYW5kbGVTdGRvdXRSZXNpemUpO1xuICAgIHRoaXMucmVzaXplRXZlbnRMaXN0ZW5lcnMucHVzaCgoKSA9PiB7XG4gICAgICBwcm9jZXNzLnN0ZG91dC5yZW1vdmVMaXN0ZW5lcigncmVzaXplJywgaGFuZGxlU3Rkb3V0UmVzaXplKTtcbiAgICB9KTtcblxuICAgIC8vIE1ldGhvZCAyOiBMaXN0ZW4gZm9yIFNJR1dJTkNIIHNpZ25hbHMgKGJhY2t1cCBmb3IgVW5peCBzeXN0ZW1zKVxuICAgIGNvbnN0IGhhbmRsZVNpZ3dpbmNoID0gKCkgPT4ge1xuICAgICAgY29uc3QgbmV3Q29scyA9IHByb2Nlc3Muc3Rkb3V0LmNvbHVtbnMgfHwgODA7XG4gICAgICBjb25zdCBuZXdSb3dzID0gcHJvY2Vzcy5zdGRvdXQucm93cyB8fCAyNDtcbiAgICAgIHRoaXMuaGFuZGxlVGVybWluYWxSZXNpemUobmV3Q29scywgbmV3Um93cyk7XG4gICAgfTtcblxuICAgIHByb2Nlc3Mub24oJ1NJR1dJTkNIJywgaGFuZGxlU2lnd2luY2gpO1xuICAgIHRoaXMucmVzaXplRXZlbnRMaXN0ZW5lcnMucHVzaCgoKSA9PiB7XG4gICAgICBwcm9jZXNzLnJlbW92ZUxpc3RlbmVyKCdTSUdXSU5DSCcsIGhhbmRsZVNpZ3dpbmNoKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgdGVybWluYWwgcmVzaXplIGV2ZW50cyBmcm9tIHRoZSBob3N0aW5nIHRlcm1pbmFsXG4gICAqL1xuICBwcml2YXRlIGhhbmRsZVRlcm1pbmFsUmVzaXplKG5ld0NvbHM6IG51bWJlciwgbmV3Um93czogbnVtYmVyKTogdm9pZCB7XG4gICAgLy8gU2tpcCBpZiBzaXplIGhhc24ndCBhY3R1YWxseSBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5sYXN0VGVybWluYWxTaXplICYmXG4gICAgICB0aGlzLmxhc3RUZXJtaW5hbFNpemUuY29scyA9PT0gbmV3Q29scyAmJlxuICAgICAgdGhpcy5sYXN0VGVybWluYWxTaXplLnJvd3MgPT09IG5ld1Jvd3NcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dnZXIubG9nKGNoYWxrLmJsdWUoYFRlcm1pbmFsIHJlc2l6ZWQgdG8gJHtuZXdDb2xzfXgke25ld1Jvd3N9YCkpO1xuXG4gICAgLy8gVXBkYXRlIHN0b3JlZCBzaXplXG4gICAgdGhpcy5sYXN0VGVybWluYWxTaXplID0geyBjb2xzOiBuZXdDb2xzLCByb3dzOiBuZXdSb3dzIH07XG5cbiAgICAvLyBGb3J3YXJkIHJlc2l6ZSB0byBhbGwgYWN0aXZlIHNlc3Npb25zIHVzaW5nIFwibGFzdCByZXNpemUgd2luc1wiIGxvZ2ljXG4gICAgY29uc3QgY3VycmVudFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgc2Vzc2lvbl0gb2YgdGhpcy5zZXNzaW9ucykge1xuICAgICAgaWYgKHNlc3Npb24ucHR5UHJvY2VzcyAmJiBzZXNzaW9uLnNlc3Npb25JbmZvLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHdlIHNob3VsZCBhcHBseSB0aGlzIHJlc2l6ZSBiYXNlZCBvbiBcImxhc3QgcmVzaXplIHdpbnNcIiBsb2dpY1xuICAgICAgICBjb25zdCBsYXN0UmVzaXplID0gdGhpcy5zZXNzaW9uUmVzaXplU291cmNlcy5nZXQoc2Vzc2lvbklkKTtcbiAgICAgICAgY29uc3Qgc2hvdWxkUmVzaXplID1cbiAgICAgICAgICAhbGFzdFJlc2l6ZSB8fFxuICAgICAgICAgIGxhc3RSZXNpemUuc291cmNlID09PSAndGVybWluYWwnIHx8XG4gICAgICAgICAgY3VycmVudFRpbWUgLSBsYXN0UmVzaXplLnRpbWVzdGFtcCA+IDEwMDA7IC8vIDEgc2Vjb25kIGdyYWNlIHBlcmlvZCBmb3IgYnJvd3NlciByZXNpemVzXG5cbiAgICAgICAgaWYgKHNob3VsZFJlc2l6ZSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBSZXNpemUgdGhlIFBUWSBwcm9jZXNzXG4gICAgICAgICAgICBzZXNzaW9uLnB0eVByb2Nlc3MucmVzaXplKG5ld0NvbHMsIG5ld1Jvd3MpO1xuXG4gICAgICAgICAgICAvLyBSZWNvcmQgdGhlIHJlc2l6ZSBldmVudCBpbiB0aGUgYXNjaWluZW1hIGZpbGVcbiAgICAgICAgICAgIHNlc3Npb24uYXNjaWluZW1hV3JpdGVyPy53cml0ZVJlc2l6ZShuZXdDb2xzLCBuZXdSb3dzKTtcblxuICAgICAgICAgICAgLy8gVHJhY2sgdGhpcyByZXNpemVcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvblJlc2l6ZVNvdXJjZXMuc2V0KHNlc3Npb25JZCwge1xuICAgICAgICAgICAgICBjb2xzOiBuZXdDb2xzLFxuICAgICAgICAgICAgICByb3dzOiBuZXdSb3dzLFxuICAgICAgICAgICAgICBzb3VyY2U6ICd0ZXJtaW5hbCcsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogY3VycmVudFRpbWUsXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBSZXNpemVkIHNlc3Npb24gJHtzZXNzaW9uSWR9IHRvICR7bmV3Q29sc314JHtuZXdSb3dzfSBmcm9tIHRlcm1pbmFsYCk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJlc2l6ZSBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGBTa2lwcGluZyB0ZXJtaW5hbCByZXNpemUgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9IChicm93c2VyIGhhcyBwcmVjZWRlbmNlKWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBQVFkgc2Vzc2lvblxuICAgKi9cbiAgYXN5bmMgY3JlYXRlU2Vzc2lvbihcbiAgICBjb21tYW5kOiBzdHJpbmdbXSxcbiAgICBvcHRpb25zOiBTZXNzaW9uQ3JlYXRlT3B0aW9ucyAmIHtcbiAgICAgIGZvcndhcmRUb1N0ZG91dD86IGJvb2xlYW47XG4gICAgICBvbkV4aXQ/OiAoZXhpdENvZGU6IG51bWJlciwgc2lnbmFsPzogbnVtYmVyKSA9PiB2b2lkO1xuICAgIH1cbiAgKTogUHJvbWlzZTxTZXNzaW9uQ3JlYXRpb25SZXN1bHQ+IHtcbiAgICBjb25zdCBzZXNzaW9uSWQgPSBvcHRpb25zLnNlc3Npb25JZCB8fCB1dWlkdjQoKTtcbiAgICBjb25zdCBzZXNzaW9uTmFtZSA9IG9wdGlvbnMubmFtZSB8fCBwYXRoLmJhc2VuYW1lKGNvbW1hbmRbMF0pO1xuICAgIC8vIENvcnJlY3RseSBkZXRlcm1pbmUgdGhlIHdlYiBkaXJlY3RvcnkgcGF0aFxuICAgIGNvbnN0IHdlYkRpciA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLicsICcuLicpO1xuICAgIGNvbnN0IHdvcmtpbmdEaXIgPSBvcHRpb25zLndvcmtpbmdEaXIgfHwgd2ViRGlyO1xuICAgIGNvbnN0IHRlcm0gPSB0aGlzLmRlZmF1bHRUZXJtO1xuICAgIC8vIEZvciBleHRlcm5hbCBzcGF3bnMgd2l0aG91dCBkaW1lbnNpb25zLCBsZXQgbm9kZS1wdHkgdXNlIHRoZSB0ZXJtaW5hbCdzIG5hdHVyYWwgc2l6ZVxuICAgIC8vIEZvciBvdGhlciBjYXNlcywgdXNlIHJlYXNvbmFibGUgZGVmYXVsdHNcbiAgICBjb25zdCBjb2xzID0gb3B0aW9ucy5jb2xzO1xuICAgIGNvbnN0IHJvd3MgPSBvcHRpb25zLnJvd3M7XG5cbiAgICAvLyBWZXJpZnkgd29ya2luZyBkaXJlY3RvcnkgZXhpc3RzXG4gICAgbG9nZ2VyLmRlYnVnKCdTZXNzaW9uIGNyZWF0aW9uIHBhcmFtZXRlcnM6Jywge1xuICAgICAgc2Vzc2lvbklkLFxuICAgICAgc2Vzc2lvbk5hbWUsXG4gICAgICB3b3JraW5nRGlyLFxuICAgICAgdGVybSxcbiAgICAgIGNvbHM6IGNvbHMgIT09IHVuZGVmaW5lZCA/IGNvbHMgOiAndGVybWluYWwgZGVmYXVsdCcsXG4gICAgICByb3dzOiByb3dzICE9PSB1bmRlZmluZWQgPyByb3dzIDogJ3Rlcm1pbmFsIGRlZmF1bHQnLFxuICAgIH0pO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIENyZWF0ZSBzZXNzaW9uIGRpcmVjdG9yeSBzdHJ1Y3R1cmVcbiAgICAgIGNvbnN0IHBhdGhzID0gdGhpcy5zZXNzaW9uTWFuYWdlci5jcmVhdGVTZXNzaW9uRGlyZWN0b3J5KHNlc3Npb25JZCk7XG5cbiAgICAgIC8vIFJlc29sdmUgdGhlIGNvbW1hbmQgdXNpbmcgdW5pZmllZCByZXNvbHV0aW9uIGxvZ2ljXG4gICAgICBjb25zdCByZXNvbHZlZCA9IFByb2Nlc3NVdGlscy5yZXNvbHZlQ29tbWFuZChjb21tYW5kKTtcbiAgICAgIGNvbnN0IHsgY29tbWFuZDogZmluYWxDb21tYW5kLCBhcmdzOiBmaW5hbEFyZ3MgfSA9IHJlc29sdmVkO1xuICAgICAgY29uc3QgcmVzb2x2ZWRDb21tYW5kID0gW2ZpbmFsQ29tbWFuZCwgLi4uZmluYWxBcmdzXTtcblxuICAgICAgLy8gTG9nIHJlc29sdXRpb24gZGV0YWlsc1xuICAgICAgaWYgKHJlc29sdmVkLnJlc29sdmVkRnJvbSA9PT0gJ2FsaWFzJykge1xuICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgIGNoYWxrLmN5YW4oYFVzaW5nIGFsaWFzOiAnJHtyZXNvbHZlZC5vcmlnaW5hbENvbW1hbmR9JyDihpIgJyR7cmVzb2x2ZWRDb21tYW5kLmpvaW4oJyAnKX0nYClcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAocmVzb2x2ZWQucmVzb2x2ZWRGcm9tID09PSAncGF0aCcgJiYgcmVzb2x2ZWQub3JpZ2luYWxDb21tYW5kKSB7XG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheShgUmVzb2x2ZWQgJyR7cmVzb2x2ZWQub3JpZ2luYWxDb21tYW5kfScg4oaSICcke2ZpbmFsQ29tbWFuZH0nYCkpO1xuICAgICAgfSBlbHNlIGlmIChyZXNvbHZlZC51c2VTaGVsbCkge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFVzaW5nIHNoZWxsIHRvIGV4ZWN1dGUgJHtyZXNvbHZlZC5yZXNvbHZlZEZyb219OiAke2NvbW1hbmQuam9pbignICcpfWApO1xuICAgICAgfVxuXG4gICAgICAvLyBMb2cgdGhlIGZpbmFsIGNvbW1hbmRcbiAgICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ibHVlKGBDcmVhdGluZyBQVFkgc2Vzc2lvbiB3aXRoIGNvbW1hbmQ6ICR7cmVzb2x2ZWRDb21tYW5kLmpvaW4oJyAnKX1gKSk7XG4gICAgICBsb2dnZXIuZGVidWcoYFdvcmtpbmcgZGlyZWN0b3J5OiAke3dvcmtpbmdEaXJ9YCk7XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgc2Vzc2lvbiBpcyBiZWluZyBzcGF3bmVkIGZyb20gd2l0aGluIFZpYmVUdW5uZWxcbiAgICAgIGNvbnN0IGF0dGFjaGVkVmlhVlQgPSAhIXByb2Nlc3MuZW52LlZJQkVUVU5ORUxfU0VTU0lPTl9JRDtcblxuICAgICAgLy8gQ3JlYXRlIGluaXRpYWwgc2Vzc2lvbiBpbmZvIHdpdGggcmVzb2x2ZWQgY29tbWFuZFxuICAgICAgY29uc3Qgc2Vzc2lvbkluZm86IFNlc3Npb25JbmZvID0ge1xuICAgICAgICBpZDogc2Vzc2lvbklkLFxuICAgICAgICBjb21tYW5kOiByZXNvbHZlZENvbW1hbmQsXG4gICAgICAgIG5hbWU6IHNlc3Npb25OYW1lLFxuICAgICAgICB3b3JraW5nRGlyOiB3b3JraW5nRGlyLFxuICAgICAgICBzdGF0dXM6ICdzdGFydGluZycsXG4gICAgICAgIHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBpbml0aWFsQ29sczogY29scyxcbiAgICAgICAgaW5pdGlhbFJvd3M6IHJvd3MsXG4gICAgICAgIGxhc3RDbGVhck9mZnNldDogMCxcbiAgICAgICAgdmVyc2lvbjogVkVSU0lPTixcbiAgICAgICAgZ2l0UmVwb1BhdGg6IG9wdGlvbnMuZ2l0UmVwb1BhdGgsXG4gICAgICAgIGdpdEJyYW5jaDogb3B0aW9ucy5naXRCcmFuY2gsXG4gICAgICAgIGdpdEFoZWFkQ291bnQ6IG9wdGlvbnMuZ2l0QWhlYWRDb3VudCxcbiAgICAgICAgZ2l0QmVoaW5kQ291bnQ6IG9wdGlvbnMuZ2l0QmVoaW5kQ291bnQsXG4gICAgICAgIGdpdEhhc0NoYW5nZXM6IG9wdGlvbnMuZ2l0SGFzQ2hhbmdlcyxcbiAgICAgICAgZ2l0SXNXb3JrdHJlZTogb3B0aW9ucy5naXRJc1dvcmt0cmVlLFxuICAgICAgICBnaXRNYWluUmVwb1BhdGg6IG9wdGlvbnMuZ2l0TWFpblJlcG9QYXRoLFxuICAgICAgICBhdHRhY2hlZFZpYVZULFxuICAgICAgfTtcblxuICAgICAgLy8gU2F2ZSBpbml0aWFsIHNlc3Npb24gaW5mb1xuICAgICAgdGhpcy5zZXNzaW9uTWFuYWdlci5zYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkLCBzZXNzaW9uSW5mbyk7XG5cbiAgICAgIC8vIENyZWF0ZSBhc2NpaW5lbWEgd3JpdGVyXG4gICAgICAvLyBVc2UgYWN0dWFsIGRpbWVuc2lvbnMgaWYgcHJvdmlkZWQsIG90aGVyd2lzZSBBc2NpaW5lbWFXcml0ZXIgd2lsbCB1c2UgZGVmYXVsdHMgKDgweDI0KVxuICAgICAgY29uc3QgYXNjaWluZW1hV3JpdGVyID0gQXNjaWluZW1hV3JpdGVyLmNyZWF0ZShcbiAgICAgICAgcGF0aHMuc3Rkb3V0UGF0aCxcbiAgICAgICAgY29scyB8fCB1bmRlZmluZWQsXG4gICAgICAgIHJvd3MgfHwgdW5kZWZpbmVkLFxuICAgICAgICBjb21tYW5kLmpvaW4oJyAnKSxcbiAgICAgICAgc2Vzc2lvbk5hbWUsXG4gICAgICAgIHRoaXMuY3JlYXRlRW52VmFycyh0ZXJtKVxuICAgICAgKTtcblxuICAgICAgLy8gU2V0IHVwIHBydW5pbmcgZGV0ZWN0aW9uIGNhbGxiYWNrIGZvciBwcmVjaXNlIG9mZnNldCB0cmFja2luZ1xuICAgICAgYXNjaWluZW1hV3JpdGVyLm9uUHJ1bmluZ1NlcXVlbmNlKGFzeW5jICh7IHNlcXVlbmNlLCBwb3NpdGlvbiB9KSA9PiB7XG4gICAgICAgIGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5zZXNzaW9uTWFuYWdlci5sb2FkU2Vzc2lvbkluZm8oc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHNlc3Npb25JbmZvKSB7XG4gICAgICAgICAgc2Vzc2lvbkluZm8ubGFzdENsZWFyT2Zmc2V0ID0gcG9zaXRpb247XG4gICAgICAgICAgYXdhaXQgdGhpcy5zZXNzaW9uTWFuYWdlci5zYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkLCBzZXNzaW9uSW5mbyk7XG5cbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgVXBkYXRlZCBsYXN0Q2xlYXJPZmZzZXQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9IHRvIGV4YWN0IHBvc2l0aW9uICR7cG9zaXRpb259IGAgK1xuICAgICAgICAgICAgICBgYWZ0ZXIgZGV0ZWN0aW5nIHBydW5pbmcgc2VxdWVuY2UgJyR7c2VxdWVuY2Uuc3BsaXQoJ1xceDFiJykuam9pbignXFxcXHgxYicpfSdgXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIENyZWF0ZSBQVFkgcHJvY2Vzc1xuICAgICAgbGV0IHB0eVByb2Nlc3M6IElQdHk7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBTZXQgdXAgZW52aXJvbm1lbnQgbGlrZSBMaW51eCBpbXBsZW1lbnRhdGlvblxuICAgICAgICBjb25zdCBwdHlFbnYgPSB7XG4gICAgICAgICAgLi4ucHJvY2Vzcy5lbnYsXG4gICAgICAgICAgVEVSTTogdGVybSxcbiAgICAgICAgICAvLyBTZXQgc2Vzc2lvbiBJRCB0byBwcmV2ZW50IHJlY3Vyc2l2ZSB2dCBjYWxscyBhbmQgZm9yIGRlYnVnZ2luZ1xuICAgICAgICAgIFZJQkVUVU5ORUxfU0VTU0lPTl9JRDogc2Vzc2lvbklkLFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIERlYnVnIGxvZyB0aGUgc3Bhd24gcGFyYW1ldGVyc1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1BUWSBzcGF3biBwYXJhbWV0ZXJzOicsIHtcbiAgICAgICAgICBjb21tYW5kOiBmaW5hbENvbW1hbmQsXG4gICAgICAgICAgYXJnczogZmluYWxBcmdzLFxuICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgIG5hbWU6IHRlcm0sXG4gICAgICAgICAgICBjb2xzOiBjb2xzICE9PSB1bmRlZmluZWQgPyBjb2xzIDogJ3Rlcm1pbmFsIGRlZmF1bHQnLFxuICAgICAgICAgICAgcm93czogcm93cyAhPT0gdW5kZWZpbmVkID8gcm93cyA6ICd0ZXJtaW5hbCBkZWZhdWx0JyxcbiAgICAgICAgICAgIGN3ZDogd29ya2luZ0RpcixcbiAgICAgICAgICAgIGhhc0VudjogISFwdHlFbnYsXG4gICAgICAgICAgICBlbnZLZXlzOiBPYmplY3Qua2V5cyhwdHlFbnYpLmxlbmd0aCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBCdWlsZCBzcGF3biBvcHRpb25zIC0gb25seSBpbmNsdWRlIGRpbWVuc2lvbnMgaWYgcHJvdmlkZWRcbiAgICAgICAgY29uc3Qgc3Bhd25PcHRpb25zOiBJUHR5Rm9ya09wdGlvbnMgPSB7XG4gICAgICAgICAgbmFtZTogdGVybSxcbiAgICAgICAgICBjd2Q6IHdvcmtpbmdEaXIsXG4gICAgICAgICAgZW52OiBwdHlFbnYsXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gT25seSBhZGQgZGltZW5zaW9ucyBpZiB0aGV5J3JlIGV4cGxpY2l0bHkgcHJvdmlkZWRcbiAgICAgICAgLy8gVGhpcyBhbGxvd3Mgbm9kZS1wdHkgdG8gdXNlIHRoZSB0ZXJtaW5hbCdzIG5hdHVyYWwgc2l6ZSBmb3IgZXh0ZXJuYWwgc3Bhd25zXG4gICAgICAgIGlmIChjb2xzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBzcGF3bk9wdGlvbnMuY29scyA9IGNvbHM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvd3MgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHNwYXduT3B0aW9ucy5yb3dzID0gcm93cztcbiAgICAgICAgfVxuXG4gICAgICAgIHB0eVByb2Nlc3MgPSBwdHkuc3Bhd24oZmluYWxDb21tYW5kLCBmaW5hbEFyZ3MsIHNwYXduT3B0aW9ucyk7XG5cbiAgICAgICAgLy8gQWRkIGltbWVkaWF0ZSBleGl0IGhhbmRsZXIgdG8gY2F0Y2ggQ0kgaXNzdWVzXG4gICAgICAgIGNvbnN0IGV4aXRIYW5kbGVyID0gKGV2ZW50OiB7IGV4aXRDb2RlOiBudW1iZXI7IHNpZ25hbD86IG51bWJlciB9KSA9PiB7XG4gICAgICAgICAgY29uc3QgdGltZVNpbmNlU3RhcnQgPSBEYXRlLm5vdygpIC0gRGF0ZS5wYXJzZShzZXNzaW9uSW5mby5zdGFydGVkQXQpO1xuICAgICAgICAgIGlmICh0aW1lU2luY2VTdGFydCA8IDEwMDApIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYFBUWSBwcm9jZXNzIGV4aXRlZCBxdWlja2x5IGFmdGVyIHNwYXduISBFeGl0IGNvZGU6ICR7ZXZlbnQuZXhpdENvZGV9LCBzaWduYWw6ICR7ZXZlbnQuc2lnbmFsfSwgdGltZTogJHt0aW1lU2luY2VTdGFydH1tc2BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICdUaGlzIG9mdGVuIGhhcHBlbnMgaW4gQ0kgd2hlbiBQVFkgYWxsb2NhdGlvbiBmYWlscyBvciBzaGVsbCBpcyBtaXNjb25maWd1cmVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRGVidWcgaW5mbzonLCB7XG4gICAgICAgICAgICAgIFNIRUxMOiBwcm9jZXNzLmVudi5TSEVMTCxcbiAgICAgICAgICAgICAgVEVSTTogcHJvY2Vzcy5lbnYuVEVSTSxcbiAgICAgICAgICAgICAgQ0k6IHByb2Nlc3MuZW52LkNJLFxuICAgICAgICAgICAgICBOT0RFX0VOVjogcHJvY2Vzcy5lbnYuTk9ERV9FTlYsXG4gICAgICAgICAgICAgIGNvbW1hbmQ6IGZpbmFsQ29tbWFuZCxcbiAgICAgICAgICAgICAgYXJnczogZmluYWxBcmdzLFxuICAgICAgICAgICAgICBjd2Q6IHdvcmtpbmdEaXIsXG4gICAgICAgICAgICAgIGN3ZEV4aXN0czogZnMuZXhpc3RzU3luYyh3b3JraW5nRGlyKSxcbiAgICAgICAgICAgICAgY29tbWFuZEV4aXN0czogZnMuZXhpc3RzU3luYyhmaW5hbENvbW1hbmQpLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBwdHlQcm9jZXNzLm9uRXhpdChleGl0SGFuZGxlcik7XG4gICAgICB9IGNhdGNoIChzcGF3bkVycm9yKSB7XG4gICAgICAgIC8vIERlYnVnIGxvZyB0aGUgcmF3IGVycm9yIGZpcnN0XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnUmF3IHNwYXduIGVycm9yOicsIHtcbiAgICAgICAgICB0eXBlOiB0eXBlb2Ygc3Bhd25FcnJvcixcbiAgICAgICAgICBpc0Vycm9yOiBzcGF3bkVycm9yIGluc3RhbmNlb2YgRXJyb3IsXG4gICAgICAgICAgZXJyb3JTdHJpbmc6IFN0cmluZyhzcGF3bkVycm9yKSxcbiAgICAgICAgICBlcnJvcktleXM6IHNwYXduRXJyb3IgJiYgdHlwZW9mIHNwYXduRXJyb3IgPT09ICdvYmplY3QnID8gT2JqZWN0LmtleXMoc3Bhd25FcnJvcikgOiBbXSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUHJvdmlkZSBiZXR0ZXIgZXJyb3IgbWVzc2FnZXMgZm9yIGNvbW1vbiBpc3N1ZXNcbiAgICAgICAgbGV0IGVycm9yTWVzc2FnZSA9IHNwYXduRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHNwYXduRXJyb3IubWVzc2FnZSA6IFN0cmluZyhzcGF3bkVycm9yKTtcblxuICAgICAgICBjb25zdCBlcnJvckNvZGUgPVxuICAgICAgICAgIHNwYXduRXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiAnY29kZScgaW4gc3Bhd25FcnJvclxuICAgICAgICAgICAgPyAoc3Bhd25FcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGVcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAoZXJyb3JDb2RlID09PSAnRU5PRU5UJyB8fCBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0VOT0VOVCcpKSB7XG4gICAgICAgICAgZXJyb3JNZXNzYWdlID0gYENvbW1hbmQgbm90IGZvdW5kOiAnJHtjb21tYW5kWzBdfScuIFBsZWFzZSBlbnN1cmUgdGhlIGNvbW1hbmQgZXhpc3RzIGFuZCBpcyBpbiB5b3VyIFBBVEguYDtcbiAgICAgICAgfSBlbHNlIGlmIChlcnJvckNvZGUgPT09ICdFQUNDRVMnIHx8IGVycm9yTWVzc2FnZS5pbmNsdWRlcygnRUFDQ0VTJykpIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgUGVybWlzc2lvbiBkZW5pZWQ6ICcke2NvbW1hbmRbMF19Jy4gVGhlIGNvbW1hbmQgZXhpc3RzIGJ1dCBpcyBub3QgZXhlY3V0YWJsZS5gO1xuICAgICAgICB9IGVsc2UgaWYgKGVycm9yQ29kZSA9PT0gJ0VOWElPJyB8fCBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ0VOWElPJykpIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgRmFpbGVkIHRvIGFsbG9jYXRlIHRlcm1pbmFsIGZvciAnJHtjb21tYW5kWzBdfScuIFRoaXMgbWF5IG9jY3VyIGlmIHRoZSBjb21tYW5kIGRvZXNuJ3QgZXhpc3Qgb3IgdGhlIHN5c3RlbSBjYW5ub3QgY3JlYXRlIGEgcHNldWRvLXRlcm1pbmFsLmA7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdjd2QnKSB8fCBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ3dvcmtpbmcgZGlyZWN0b3J5JykpIHtcbiAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgV29ya2luZyBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3Q6ICcke3dvcmtpbmdEaXJ9J2A7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2cgdGhlIGVycm9yIHdpdGggYmV0dGVyIHNlcmlhbGl6YXRpb25cbiAgICAgICAgY29uc3QgZXJyb3JEZXRhaWxzID1cbiAgICAgICAgICBzcGF3bkVycm9yIGluc3RhbmNlb2YgRXJyb3JcbiAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgIC4uLnNwYXduRXJyb3IsXG4gICAgICAgICAgICAgICAgbWVzc2FnZTogc3Bhd25FcnJvci5tZXNzYWdlLFxuICAgICAgICAgICAgICAgIHN0YWNrOiBzcGF3bkVycm9yLnN0YWNrLFxuICAgICAgICAgICAgICAgIGNvZGU6IChzcGF3bkVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZSxcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgOiBzcGF3bkVycm9yO1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBzcGF3biBQVFkgZm9yIGNvbW1hbmQgJyR7Y29tbWFuZC5qb2luKCcgJyl9JzpgLCBlcnJvckRldGFpbHMpO1xuICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoZXJyb3JNZXNzYWdlLCAnU1BBV05fRkFJTEVEJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIENyZWF0ZSBzZXNzaW9uIG9iamVjdFxuICAgICAgLy8gQXV0by1kZXRlY3QgQ2xhdWRlIGNvbW1hbmRzIGFuZCBzZXQgZHluYW1pYyBtb2RlIGlmIG5vIHRpdGxlIG1vZGUgc3BlY2lmaWVkXG4gICAgICBsZXQgdGl0bGVNb2RlID0gb3B0aW9ucy50aXRsZU1vZGU7XG4gICAgICBpZiAoIXRpdGxlTW9kZSkge1xuICAgICAgICAvLyBDaGVjayBhbGwgY29tbWFuZCBhcmd1bWVudHMgZm9yIENsYXVkZVxuICAgICAgICBjb25zdCBpc0NsYXVkZUNvbW1hbmQgPSBjb21tYW5kLnNvbWUoKGFyZykgPT4gYXJnLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NsYXVkZScpKTtcbiAgICAgICAgaWYgKGlzQ2xhdWRlQ29tbWFuZCkge1xuICAgICAgICAgIHRpdGxlTW9kZSA9IFRpdGxlTW9kZS5EWU5BTUlDO1xuICAgICAgICAgIGxvZ2dlci5sb2coY2hhbGsuY3lhbign4pyTIEF1dG8tc2VsZWN0ZWQgZHluYW1pYyB0aXRsZSBtb2RlIGZvciBDbGF1ZGUnKSk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBEZXRlY3RlZCBDbGF1ZGUgaW4gY29tbWFuZDogJHtjb21tYW5kLmpvaW4oJyAnKX1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBEZXRlY3QgaWYgdGhpcyBpcyBhIHRtdXggYXR0YWNobWVudCBzZXNzaW9uXG4gICAgICBjb25zdCBpc1RtdXhBdHRhY2htZW50ID1cbiAgICAgICAgKHJlc29sdmVkQ29tbWFuZC5pbmNsdWRlcygndG11eCcpICYmXG4gICAgICAgICAgKHJlc29sdmVkQ29tbWFuZC5pbmNsdWRlcygnYXR0YWNoLXNlc3Npb24nKSB8fFxuICAgICAgICAgICAgcmVzb2x2ZWRDb21tYW5kLmluY2x1ZGVzKCdhdHRhY2gnKSB8fFxuICAgICAgICAgICAgcmVzb2x2ZWRDb21tYW5kLmluY2x1ZGVzKCdhJykpKSB8fFxuICAgICAgICBzZXNzaW9uTmFtZS5zdGFydHNXaXRoKCd0bXV4OicpO1xuXG4gICAgICBjb25zdCBzZXNzaW9uOiBQdHlTZXNzaW9uID0ge1xuICAgICAgICBpZDogc2Vzc2lvbklkLFxuICAgICAgICBzZXNzaW9uSW5mbyxcbiAgICAgICAgcHR5UHJvY2VzcyxcbiAgICAgICAgYXNjaWluZW1hV3JpdGVyLFxuICAgICAgICBjb250cm9sRGlyOiBwYXRocy5jb250cm9sRGlyLFxuICAgICAgICBzdGRvdXRQYXRoOiBwYXRocy5zdGRvdXRQYXRoLFxuICAgICAgICBzdGRpblBhdGg6IHBhdGhzLnN0ZGluUGF0aCxcbiAgICAgICAgc2Vzc2lvbkpzb25QYXRoOiBwYXRocy5zZXNzaW9uSnNvblBhdGgsXG4gICAgICAgIHN0YXJ0VGltZTogbmV3IERhdGUoKSxcbiAgICAgICAgdGl0bGVNb2RlOiB0aXRsZU1vZGUgfHwgVGl0bGVNb2RlLk5PTkUsXG4gICAgICAgIGlzRXh0ZXJuYWxUZXJtaW5hbDogISFvcHRpb25zLmZvcndhcmRUb1N0ZG91dCxcbiAgICAgICAgY3VycmVudFdvcmtpbmdEaXI6IHdvcmtpbmdEaXIsXG4gICAgICAgIHRpdGxlRmlsdGVyOiBuZXcgVGl0bGVTZXF1ZW5jZUZpbHRlcigpLFxuICAgICAgICBpc1RtdXhBdHRhY2htZW50LFxuICAgICAgfTtcblxuICAgICAgdGhpcy5zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uKTtcblxuICAgICAgLy8gVXBkYXRlIHNlc3Npb24gaW5mbyB3aXRoIFBJRCBhbmQgcnVubmluZyBzdGF0dXNcbiAgICAgIHNlc3Npb25JbmZvLnBpZCA9IHB0eVByb2Nlc3MucGlkO1xuICAgICAgc2Vzc2lvbkluZm8uc3RhdHVzID0gJ3J1bm5pbmcnO1xuICAgICAgdGhpcy5zZXNzaW9uTWFuYWdlci5zYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkLCBzZXNzaW9uSW5mbyk7XG5cbiAgICAgIC8vIFNldHVwIHNlc3Npb24uanNvbiB3YXRjaGVyIGZvciBleHRlcm5hbCBzZXNzaW9uc1xuICAgICAgaWYgKG9wdGlvbnMuZm9yd2FyZFRvU3Rkb3V0KSB7XG4gICAgICAgIHRoaXMuc2V0dXBTZXNzaW9uV2F0Y2hlcihzZXNzaW9uKTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBjaGFsay5ncmVlbihgU2Vzc2lvbiAke3Nlc3Npb25JZH0gY3JlYXRlZCBzdWNjZXNzZnVsbHkgKFBJRDogJHtwdHlQcm9jZXNzLnBpZH0pYClcbiAgICAgICk7XG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyYXkoYFJ1bm5pbmc6ICR7cmVzb2x2ZWRDb21tYW5kLmpvaW4oJyAnKX0gaW4gJHt3b3JraW5nRGlyfWApKTtcblxuICAgICAgLy8gU2V0dXAgUFRZIGV2ZW50IGhhbmRsZXJzXG4gICAgICB0aGlzLnNldHVwUHR5SGFuZGxlcnMoc2Vzc2lvbiwgb3B0aW9ucy5mb3J3YXJkVG9TdGRvdXQgfHwgZmFsc2UsIG9wdGlvbnMub25FeGl0KTtcblxuICAgICAgLy8gU3RhcnQgZm9yZWdyb3VuZCBwcm9jZXNzIHRyYWNraW5nXG4gICAgICB0aGlzLnN0YXJ0Rm9yZWdyb3VuZFByb2Nlc3NUcmFja2luZyhzZXNzaW9uKTtcblxuICAgICAgLy8gTm90ZTogc3RkaW4gZm9yd2FyZGluZyBpcyBub3cgaGFuZGxlZCB2aWEgSVBDIHNvY2tldFxuXG4gICAgICAvLyBJbml0aWFsIHRpdGxlIHdpbGwgYmUgc2V0IHdoZW4gdGhlIGZpcnN0IG91dHB1dCBpcyByZWNlaXZlZFxuICAgICAgLy8gRG8gbm90IHdyaXRlIHRpdGxlIHNlcXVlbmNlIHRvIFBUWSBpbnB1dCBhcyBpdCB3b3VsZCBiZSBzZW50IHRvIHRoZSBzaGVsbFxuXG4gICAgICAvLyBFbWl0IHNlc3Npb24gc3RhcnRlZCBldmVudFxuICAgICAgdGhpcy5lbWl0KCdzZXNzaW9uU3RhcnRlZCcsIHNlc3Npb25JZCwgc2Vzc2lvbkluZm8ubmFtZSB8fCBzZXNzaW9uSW5mby5jb21tYW5kLmpvaW4oJyAnKSk7XG5cbiAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9uIHRvIE1hYyBhcHBcbiAgICAgIGlmIChjb250cm9sVW5peEhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICAgICAgICBjb250cm9sVW5peEhhbmRsZXIuc2VuZE5vdGlmaWNhdGlvbihcbiAgICAgICAgICAnU2Vzc2lvbiBTdGFydGVkJyxcbiAgICAgICAgICBzZXNzaW9uSW5mby5uYW1lIHx8IHNlc3Npb25JbmZvLmNvbW1hbmQuam9pbignICcpLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHR5cGU6ICdzZXNzaW9uLXN0YXJ0JyxcbiAgICAgICAgICAgIHNlc3Npb25JZDogc2Vzc2lvbklkLFxuICAgICAgICAgICAgc2Vzc2lvbk5hbWU6IHNlc3Npb25JbmZvLm5hbWUgfHwgc2Vzc2lvbkluZm8uY29tbWFuZC5qb2luKCcgJyksXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgIHNlc3Npb25JbmZvLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gQ2xlYW51cCBvbiBmYWlsdXJlXG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLnNlc3Npb25NYW5hZ2VyLmNsZWFudXBTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgICB9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byBjbGVhbnVwIHNlc3Npb24gJHtzZXNzaW9uSWR9IGFmdGVyIGNyZWF0aW9uIGZhaWx1cmU6YCwgY2xlYW51cEVycm9yKTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgbmV3IFB0eUVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIGNyZWF0ZSBzZXNzaW9uOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gLFxuICAgICAgICAnU0VTU0lPTl9DUkVBVEVfRkFJTEVEJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgZ2V0UHR5Rm9yU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IElQdHkgfCBudWxsIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICByZXR1cm4gc2Vzc2lvbj8ucHR5UHJvY2VzcyB8fCBudWxsO1xuICB9XG5cbiAgcHVibGljIGdldEludGVybmFsU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFB0eVNlc3Npb24gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHVwIGV2ZW50IGhhbmRsZXJzIGZvciBhIFBUWSBwcm9jZXNzXG4gICAqL1xuICBwcml2YXRlIHNldHVwUHR5SGFuZGxlcnMoXG4gICAgc2Vzc2lvbjogUHR5U2Vzc2lvbixcbiAgICBmb3J3YXJkVG9TdGRvdXQ6IGJvb2xlYW4sXG4gICAgb25FeGl0PzogKGV4aXRDb2RlOiBudW1iZXIsIHNpZ25hbD86IG51bWJlcikgPT4gdm9pZFxuICApOiB2b2lkIHtcbiAgICBjb25zdCB7IHB0eVByb2Nlc3MsIGFzY2lpbmVtYVdyaXRlciB9ID0gc2Vzc2lvbjtcblxuICAgIGlmICghcHR5UHJvY2Vzcykge1xuICAgICAgbG9nZ2VyLmVycm9yKGBObyBQVFkgcHJvY2VzcyBmb3VuZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHdyaXRlIHF1ZXVlIGZvciBzdGRvdXQgaWYgZm9yd2FyZGluZ1xuICAgIGNvbnN0IHN0ZG91dFF1ZXVlID0gZm9yd2FyZFRvU3Rkb3V0ID8gbmV3IFdyaXRlUXVldWUoKSA6IG51bGw7XG4gICAgaWYgKHN0ZG91dFF1ZXVlKSB7XG4gICAgICBzZXNzaW9uLnN0ZG91dFF1ZXVlID0gc3Rkb3V0UXVldWU7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHdyaXRlIHF1ZXVlIGZvciBpbnB1dCB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuICAgIGNvbnN0IGlucHV0UXVldWUgPSBuZXcgV3JpdGVRdWV1ZSgpO1xuICAgIHNlc3Npb24uaW5wdXRRdWV1ZSA9IGlucHV0UXVldWU7XG5cbiAgICAvLyBTZXR1cCBhY3Rpdml0eSBkZXRlY3RvciBmb3IgZHluYW1pYyBtb2RlXG4gICAgaWYgKHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuRFlOQU1JQykge1xuICAgICAgc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yID0gbmV3IEFjdGl2aXR5RGV0ZWN0b3Ioc2Vzc2lvbi5zZXNzaW9uSW5mby5jb21tYW5kLCBzZXNzaW9uLmlkKTtcblxuICAgICAgLy8gU2V0IHVwIENsYXVkZSB0dXJuIG5vdGlmaWNhdGlvbiBjYWxsYmFja1xuICAgICAgc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yLnNldE9uQ2xhdWRlVHVybigoc2Vzc2lvbklkKSA9PiB7XG4gICAgICAgIGxvZ2dlci5pbmZvKGDwn5SUIE5PVElGSUNBVElPTiBERUJVRzogQ2xhdWRlIHR1cm4gZGV0ZWN0ZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgIHRoaXMuZW1pdChcbiAgICAgICAgICAnY2xhdWRlVHVybicsXG4gICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgIHNlc3Npb24uc2Vzc2lvbkluZm8ubmFtZSB8fCBzZXNzaW9uLnNlc3Npb25JbmZvLmNvbW1hbmQuam9pbignICcpXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTZXR1cCBwZXJpb2RpYyB0aXRsZSB1cGRhdGVzIGZvciBib3RoIHN0YXRpYyBhbmQgZHluYW1pYyBtb2Rlc1xuICAgIGlmIChcbiAgICAgIHNlc3Npb24udGl0bGVNb2RlICE9PSBUaXRsZU1vZGUuTk9ORSAmJlxuICAgICAgc2Vzc2lvbi50aXRsZU1vZGUgIT09IFRpdGxlTW9kZS5GSUxURVIgJiZcbiAgICAgIGZvcndhcmRUb1N0ZG91dFxuICAgICkge1xuICAgICAgLy8gVHJhY2sgbGFzdCBrbm93biBhY3Rpdml0eSBzdGF0ZSBmb3IgY2hhbmdlIGRldGVjdGlvblxuICAgICAgbGV0IGxhc3RLbm93bkFjdGl2aXR5U3RhdGU6IHtcbiAgICAgICAgaXNBY3RpdmU6IGJvb2xlYW47XG4gICAgICAgIHNwZWNpZmljU3RhdHVzPzogc3RyaW5nO1xuICAgICAgfSB8IG51bGwgPSBudWxsO1xuXG4gICAgICBzZXNzaW9uLnRpdGxlVXBkYXRlSW50ZXJ2YWwgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICAgIC8vIEZvciBkeW5hbWljIG1vZGUsIGNoZWNrIGZvciBhY3Rpdml0eSBzdGF0ZSBjaGFuZ2VzXG4gICAgICAgIGlmIChzZXNzaW9uLnRpdGxlTW9kZSA9PT0gVGl0bGVNb2RlLkRZTkFNSUMgJiYgc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yKSB7XG4gICAgICAgICAgY29uc3QgYWN0aXZpdHlTdGF0ZSA9IHNlc3Npb24uYWN0aXZpdHlEZXRlY3Rvci5nZXRBY3Rpdml0eVN0YXRlKCk7XG5cbiAgICAgICAgICAvLyBDaGVjayBpZiBhY3Rpdml0eSBzdGF0ZSBoYXMgY2hhbmdlZFxuICAgICAgICAgIGNvbnN0IGFjdGl2aXR5Q2hhbmdlZCA9XG4gICAgICAgICAgICBsYXN0S25vd25BY3Rpdml0eVN0YXRlID09PSBudWxsIHx8XG4gICAgICAgICAgICBhY3Rpdml0eVN0YXRlLmlzQWN0aXZlICE9PSBsYXN0S25vd25BY3Rpdml0eVN0YXRlLmlzQWN0aXZlIHx8XG4gICAgICAgICAgICBhY3Rpdml0eVN0YXRlLnNwZWNpZmljU3RhdHVzPy5zdGF0dXMgIT09IGxhc3RLbm93bkFjdGl2aXR5U3RhdGUuc3BlY2lmaWNTdGF0dXM7XG5cbiAgICAgICAgICBpZiAoYWN0aXZpdHlDaGFuZ2VkKSB7XG4gICAgICAgICAgICAvLyBVcGRhdGUgbGFzdCBrbm93biBzdGF0ZVxuICAgICAgICAgICAgbGFzdEtub3duQWN0aXZpdHlTdGF0ZSA9IHtcbiAgICAgICAgICAgICAgaXNBY3RpdmU6IGFjdGl2aXR5U3RhdGUuaXNBY3RpdmUsXG4gICAgICAgICAgICAgIHNwZWNpZmljU3RhdHVzOiBhY3Rpdml0eVN0YXRlLnNwZWNpZmljU3RhdHVzPy5zdGF0dXMsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBNYXJrIHRpdGxlIGZvciB1cGRhdGVcbiAgICAgICAgICAgIHRoaXMubWFya1RpdGxlVXBkYXRlTmVlZGVkKHNlc3Npb24pO1xuXG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgIGBBY3Rpdml0eSBzdGF0ZSBjaGFuZ2VkIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06IGAgK1xuICAgICAgICAgICAgICAgIGBhY3RpdmU9JHthY3Rpdml0eVN0YXRlLmlzQWN0aXZlfSwgYCArXG4gICAgICAgICAgICAgICAgYHN0YXR1cz0ke2FjdGl2aXR5U3RhdGUuc3BlY2lmaWNTdGF0dXM/LnN0YXR1cyB8fCAnbm9uZSd9YFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy8gU2VuZCBub3RpZmljYXRpb24gd2hlbiBhY3Rpdml0eSBiZWNvbWVzIGluYWN0aXZlIChDbGF1ZGUncyB0dXJuKVxuICAgICAgICAgICAgaWYgKCFhY3Rpdml0eVN0YXRlLmlzQWN0aXZlICYmIGFjdGl2aXR5U3RhdGUuc3BlY2lmaWNTdGF0dXM/LnN0YXR1cyA9PT0gJ3dhaXRpbmcnKSB7XG4gICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGDwn5SUIE5PVElGSUNBVElPTiBERUJVRzogQ2xhdWRlIHR1cm4gZGV0ZWN0ZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfWApO1xuICAgICAgICAgICAgICB0aGlzLmVtaXQoXG4gICAgICAgICAgICAgICAgJ2NsYXVkZVR1cm4nLFxuICAgICAgICAgICAgICAgIHNlc3Npb24uaWQsXG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lIHx8IHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZC5qb2luKCcgJylcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAvLyBTZW5kIG5vdGlmaWNhdGlvbiB0byBNYWMgYXBwIGRpcmVjdGx5XG4gICAgICAgICAgICAgIGlmIChjb250cm9sVW5peEhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICAgICAgICAgICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kTm90aWZpY2F0aW9uKCdZb3VyIFR1cm4nLCAnQ2xhdWRlIGhhcyBmaW5pc2hlZCByZXNwb25kaW5nJywge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3lvdXItdHVybicsXG4gICAgICAgICAgICAgICAgICBzZXNzaW9uSWQ6IHNlc3Npb24uaWQsXG4gICAgICAgICAgICAgICAgICBzZXNzaW9uTmFtZTogc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lIHx8IHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZC5qb2luKCcgJyksXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBBbHdheXMgd3JpdGUgYWN0aXZpdHkgc3RhdGUgZm9yIGV4dGVybmFsIHRvb2xzXG4gICAgICAgICAgdGhpcy53cml0ZUFjdGl2aXR5U3RhdGUoc2Vzc2lvbiwgYWN0aXZpdHlTdGF0ZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBhbmQgdXBkYXRlIHRpdGxlIGlmIG5lZWRlZFxuICAgICAgICB0aGlzLmNoZWNrQW5kVXBkYXRlVGl0bGUoc2Vzc2lvbik7XG4gICAgICB9LCBUSVRMRV9VUERBVEVfSU5URVJWQUxfTVMpO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBQVFkgZGF0YSBvdXRwdXRcbiAgICBwdHlQcm9jZXNzLm9uRGF0YSgoZGF0YTogc3RyaW5nKSA9PiB7XG4gICAgICBsZXQgcHJvY2Vzc2VkRGF0YSA9IGRhdGE7XG5cbiAgICAgIC8vIFRyYWNrIFBUWSBvdXRwdXQgaW4gU2Vzc2lvbk1vbml0b3IgZm9yIGFjdGl2aXR5IGFuZCBiZWxsIGRldGVjdGlvblxuICAgICAgaWYgKHRoaXMuc2Vzc2lvbk1vbml0b3IpIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uTW9uaXRvci50cmFja1B0eU91dHB1dChzZXNzaW9uLmlkLCBkYXRhKTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgdGl0bGUgbW9kZSBpcyBub3QgTk9ORSwgZmlsdGVyIG91dCBhbnkgdGl0bGUgc2VxdWVuY2VzIHRoZSBwcm9jZXNzIG1pZ2h0XG4gICAgICAvLyBoYXZlIHdyaXR0ZW4gdG8gdGhlIHN0cmVhbS5cbiAgICAgIGlmIChzZXNzaW9uLnRpdGxlTW9kZSAhPT0gdW5kZWZpbmVkICYmIHNlc3Npb24udGl0bGVNb2RlICE9PSBUaXRsZU1vZGUuTk9ORSkge1xuICAgICAgICBwcm9jZXNzZWREYXRhID0gc2Vzc2lvbi50aXRsZUZpbHRlciA/IHNlc3Npb24udGl0bGVGaWx0ZXIuZmlsdGVyKGRhdGEpIDogZGF0YTtcbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIGFjdGl2aXR5IGRldGVjdGlvbiBmb3IgZHluYW1pYyBtb2RlXG4gICAgICBpZiAoc2Vzc2lvbi50aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5EWU5BTUlDICYmIHNlc3Npb24uYWN0aXZpdHlEZXRlY3Rvcikge1xuICAgICAgICBjb25zdCB7IGZpbHRlcmVkRGF0YSwgYWN0aXZpdHkgfSA9IHNlc3Npb24uYWN0aXZpdHlEZXRlY3Rvci5wcm9jZXNzT3V0cHV0KHByb2Nlc3NlZERhdGEpO1xuICAgICAgICBwcm9jZXNzZWREYXRhID0gZmlsdGVyZWREYXRhO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGFjdGl2aXR5IHN0YXR1cyBjaGFuZ2VkXG4gICAgICAgIGlmIChhY3Rpdml0eS5zcGVjaWZpY1N0YXR1cz8uc3RhdHVzICE9PSBzZXNzaW9uLmxhc3RBY3Rpdml0eVN0YXR1cykge1xuICAgICAgICAgIHNlc3Npb24ubGFzdEFjdGl2aXR5U3RhdHVzID0gYWN0aXZpdHkuc3BlY2lmaWNTdGF0dXM/LnN0YXR1cztcbiAgICAgICAgICB0aGlzLm1hcmtUaXRsZVVwZGF0ZU5lZWRlZChzZXNzaW9uKTtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBTZXNzaW9uTW9uaXRvciB3aXRoIGFjdGl2aXR5IGNoYW5nZVxuICAgICAgICAgIGlmICh0aGlzLnNlc3Npb25Nb25pdG9yKSB7XG4gICAgICAgICAgICBjb25zdCBpc0FjdGl2ZSA9IGFjdGl2aXR5LnNwZWNpZmljU3RhdHVzPy5zdGF0dXMgPT09ICd3b3JraW5nJztcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbk1vbml0b3IudXBkYXRlU2Vzc2lvbkFjdGl2aXR5KFxuICAgICAgICAgICAgICBzZXNzaW9uLmlkLFxuICAgICAgICAgICAgICBpc0FjdGl2ZSxcbiAgICAgICAgICAgICAgYWN0aXZpdHkuc3BlY2lmaWNTdGF0dXM/LmFwcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgZm9yIHRpdGxlIHVwZGF0ZSB0cmlnZ2Vyc1xuICAgICAgaWYgKHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuU1RBVElDICYmIGZvcndhcmRUb1N0ZG91dCkge1xuICAgICAgICAvLyBDaGVjayBpZiB3ZSBzaG91bGQgdXBkYXRlIHRpdGxlIGJhc2VkIG9uIGRhdGEgY29udGVudFxuICAgICAgICBpZiAoIXNlc3Npb24uaW5pdGlhbFRpdGxlU2VudCB8fCBzaG91bGRJbmplY3RUaXRsZShwcm9jZXNzZWREYXRhKSkge1xuICAgICAgICAgIHRoaXMubWFya1RpdGxlVXBkYXRlTmVlZGVkKHNlc3Npb24pO1xuICAgICAgICAgIGlmICghc2Vzc2lvbi5pbml0aWFsVGl0bGVTZW50KSB7XG4gICAgICAgICAgICBzZXNzaW9uLmluaXRpYWxUaXRsZVNlbnQgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBXcml0ZSB0byBhc2NpaW5lbWEgZmlsZSAoaXQgaGFzIGl0cyBvd24gaW50ZXJuYWwgcXVldWUpXG4gICAgICAvLyBUaGUgQXNjaWluZW1hV3JpdGVyIG5vdyBoYW5kbGVzIHBydW5pbmcgZGV0ZWN0aW9uIGludGVybmFsbHkgd2l0aCBwcmVjaXNlIGJ5dGUgdHJhY2tpbmdcbiAgICAgIGFzY2lpbmVtYVdyaXRlcj8ud3JpdGVPdXRwdXQoQnVmZmVyLmZyb20ocHJvY2Vzc2VkRGF0YSwgJ3V0ZjgnKSk7XG5cbiAgICAgIC8vIEZvcndhcmQgdG8gc3Rkb3V0IGlmIHJlcXVlc3RlZCAodXNpbmcgcXVldWUgZm9yIG9yZGVyaW5nKVxuICAgICAgaWYgKGZvcndhcmRUb1N0ZG91dCAmJiBzdGRvdXRRdWV1ZSkge1xuICAgICAgICBzdGRvdXRRdWV1ZS5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBjYW5Xcml0ZSA9IHByb2Nlc3Muc3Rkb3V0LndyaXRlKHByb2Nlc3NlZERhdGEpO1xuXG4gICAgICAgICAgLy8gVHJhY2sgd3JpdGUgYWN0aXZpdHkgZm9yIHNhZmUgdGl0bGUgaW5qZWN0aW9uXG4gICAgICAgICAgc2Vzc2lvbi5sYXN0V3JpdGVUaW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgICAgaWYgKCFjYW5Xcml0ZSkge1xuICAgICAgICAgICAgYXdhaXQgb25jZShwcm9jZXNzLnN0ZG91dCwgJ2RyYWluJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBQVFkgZXhpdFxuICAgIHB0eVByb2Nlc3Mub25FeGl0KGFzeW5jICh7IGV4aXRDb2RlLCBzaWduYWwgfTogeyBleGl0Q29kZTogbnVtYmVyOyBzaWduYWw/OiBudW1iZXIgfSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gTWFyayBzZXNzaW9uIGFzIGV4aXRpbmcgdG8gcHJldmVudCBmYWxzZSBiZWxsIG5vdGlmaWNhdGlvbnNcbiAgICAgICAgdGhpcy5zZXNzaW9uRXhpdFRpbWVzLnNldChzZXNzaW9uLmlkLCBEYXRlLm5vdygpKTtcbiAgICAgICAgLy8gV3JpdGUgZXhpdCBldmVudCB0byBhc2NpaW5lbWFcbiAgICAgICAgaWYgKGFzY2lpbmVtYVdyaXRlcj8uaXNPcGVuKCkpIHtcbiAgICAgICAgICBhc2NpaW5lbWFXcml0ZXIud3JpdGVSYXdKc29uKFsnZXhpdCcsIGV4aXRDb2RlIHx8IDAsIHNlc3Npb24uaWRdKTtcbiAgICAgICAgICBhc2NpaW5lbWFXcml0ZXJcbiAgICAgICAgICAgIC5jbG9zZSgpXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PlxuICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBjbG9zZSBhc2NpaW5lbWEgd3JpdGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlIHNlc3Npb24gc3RhdHVzXG4gICAgICAgIHRoaXMuc2Vzc2lvbk1hbmFnZXIudXBkYXRlU2Vzc2lvblN0YXR1cyhcbiAgICAgICAgICBzZXNzaW9uLmlkLFxuICAgICAgICAgICdleGl0ZWQnLFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICBleGl0Q29kZSB8fCAoc2lnbmFsID8gMTI4ICsgKHR5cGVvZiBzaWduYWwgPT09ICdudW1iZXInID8gc2lnbmFsIDogMSkgOiAxKVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIHN0ZG91dCBxdWV1ZSB0byBkcmFpbiBpZiBpdCBleGlzdHNcbiAgICAgICAgaWYgKHNlc3Npb24uc3Rkb3V0UXVldWUpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgYXdhaXQgc2Vzc2lvbi5zdGRvdXRRdWV1ZS5kcmFpbigpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBkcmFpbiBzdGRvdXQgcXVldWUgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTpgLCBlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgc2Vzc2lvbiByZXNvdXJjZXNcbiAgICAgICAgdGhpcy5jbGVhbnVwU2Vzc2lvblJlc291cmNlcyhzZXNzaW9uKTtcblxuICAgICAgICAvLyBSZW1vdmUgZnJvbSBhY3RpdmUgc2Vzc2lvbnNcbiAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbi5pZCk7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgY29tbWFuZCB0cmFja2luZ1xuICAgICAgICB0aGlzLmNvbW1hbmRUcmFja2luZy5kZWxldGUoc2Vzc2lvbi5pZCk7XG5cbiAgICAgICAgLy8gRW1pdCBzZXNzaW9uIGV4aXRlZCBldmVudFxuICAgICAgICB0aGlzLmVtaXQoXG4gICAgICAgICAgJ3Nlc3Npb25FeGl0ZWQnLFxuICAgICAgICAgIHNlc3Npb24uaWQsXG4gICAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lIHx8IHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZC5qb2luKCcgJyksXG4gICAgICAgICAgZXhpdENvZGVcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBTZW5kIG5vdGlmaWNhdGlvbiB0byBNYWMgYXBwXG4gICAgICAgIGlmIChjb250cm9sVW5peEhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICAgICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kTm90aWZpY2F0aW9uKFxuICAgICAgICAgICAgJ1Nlc3Npb24gRW5kZWQnLFxuICAgICAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lIHx8IHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZC5qb2luKCcgJyksXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHR5cGU6ICdzZXNzaW9uLWV4aXQnLFxuICAgICAgICAgICAgICBzZXNzaW9uSWQ6IHNlc3Npb24uaWQsXG4gICAgICAgICAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUgfHwgc2Vzc2lvbi5zZXNzaW9uSW5mby5jb21tYW5kLmpvaW4oJyAnKSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsbCBleGl0IGNhbGxiYWNrIGlmIHByb3ZpZGVkIChmb3IgZndkLnRzKVxuICAgICAgICBpZiAob25FeGl0KSB7XG4gICAgICAgICAgb25FeGl0KGV4aXRDb2RlIHx8IDAsIHNpZ25hbCk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIGhhbmRsZSBleGl0IGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTWFyayBmb3IgaW5pdGlhbCB0aXRsZSB1cGRhdGVcbiAgICBpZiAoXG4gICAgICBmb3J3YXJkVG9TdGRvdXQgJiZcbiAgICAgIChzZXNzaW9uLnRpdGxlTW9kZSA9PT0gVGl0bGVNb2RlLlNUQVRJQyB8fCBzZXNzaW9uLnRpdGxlTW9kZSA9PT0gVGl0bGVNb2RlLkRZTkFNSUMpXG4gICAgKSB7XG4gICAgICB0aGlzLm1hcmtUaXRsZVVwZGF0ZU5lZWRlZChzZXNzaW9uKTtcbiAgICAgIHNlc3Npb24uaW5pdGlhbFRpdGxlU2VudCA9IHRydWU7XG4gICAgICBsb2dnZXIuZGVidWcoYE1hcmtlZCBpbml0aWFsIHRpdGxlIHVwZGF0ZSBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCk7XG4gICAgfVxuXG4gICAgLy8gU2V0dXAgSVBDIHNvY2tldCBmb3IgYWxsIGNvbW11bmljYXRpb25cbiAgICB0aGlzLnNldHVwSVBDU29ja2V0KHNlc3Npb24pO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHVwIFVuaXggc29ja2V0IGZvciBhbGwgSVBDIGNvbW11bmljYXRpb25cbiAgICovXG4gIHByaXZhdGUgc2V0dXBJUENTb2NrZXQoc2Vzc2lvbjogUHR5U2Vzc2lvbik6IHZvaWQge1xuICAgIGNvbnN0IHB0eVByb2Nlc3MgPSBzZXNzaW9uLnB0eVByb2Nlc3M7XG4gICAgaWYgKCFwdHlQcm9jZXNzKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYE5vIFBUWSBwcm9jZXNzIGZvdW5kIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgVW5peCBkb21haW4gc29ja2V0IGZvciBhbGwgSVBDXG4gICAgLy8gSU1QT1JUQU5UOiBtYWNPUyBoYXMgYSAxMDQgY2hhcmFjdGVyIGxpbWl0IGZvciBVbml4IHNvY2tldCBwYXRocywgaW5jbHVkaW5nIG51bGwgdGVybWluYXRvci5cbiAgICAvLyBUaGlzIG1lYW5zIHRoZSBhY3R1YWwgdXNhYmxlIHBhdGggbGVuZ3RoIGlzIDEwMyBjaGFyYWN0ZXJzLiBUbyBhdm9pZCBFSU5WQUwgZXJyb3JzOlxuICAgIC8vIC0gVXNlIHNob3J0IHNvY2tldCBuYW1lcyAoZS5nLiwgJ2lwYy5zb2NrJyBpbnN0ZWFkIG9mICd2aWJldHVubmVsLWlwYy5zb2NrJylcbiAgICAvLyAtIEtlZXAgc2Vzc2lvbiBkaXJlY3RvcmllcyBhcyBzaG9ydCBhcyBwb3NzaWJsZVxuICAgIC8vIC0gQXZvaWQgZGVlcGx5IG5lc3RlZCBkaXJlY3Rvcnkgc3RydWN0dXJlc1xuICAgIGNvbnN0IHNvY2tldFBhdGggPSBwYXRoLmpvaW4oc2Vzc2lvbi5jb250cm9sRGlyLCAnaXBjLnNvY2snKTtcblxuICAgIC8vIFZlcmlmeSB0aGUgc29ja2V0IHBhdGggaXNuJ3QgdG9vIGxvbmdcbiAgICBpZiAoc29ja2V0UGF0aC5sZW5ndGggPiAxMDMpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKGBTb2NrZXQgcGF0aCB0b28gbG9uZzogJHtzb2NrZXRQYXRoLmxlbmd0aH0gY2hhcmFjdGVyc2ApO1xuICAgICAgbG9nZ2VyLmVycm9yKGBTb2NrZXQgcGF0aCB0b28gbG9uZyAoJHtzb2NrZXRQYXRoLmxlbmd0aH0gY2hhcnMpOiAke3NvY2tldFBhdGh9YCk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBtYWNPUyBsaW1pdCBpcyAxMDMgY2hhcmFjdGVycy4gQ29uc2lkZXIgdXNpbmcgc2hvcnRlciBzZXNzaW9uIElEcyBvciBjb250cm9sIHBhdGhzLmBcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjsgLy8gRmFpbCBmYXN0IGluc3RlYWQgb2YgcmV0dXJuaW5nIHNpbGVudGx5XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFJlbW92ZSBleGlzdGluZyBzb2NrZXQgaWYgaXQgZXhpc3RzXG4gICAgICB0cnkge1xuICAgICAgICBmcy51bmxpbmtTeW5jKHNvY2tldFBhdGgpO1xuICAgICAgfSBjYXRjaCAoX2UpIHtcbiAgICAgICAgLy8gU29ja2V0IGRvZXNuJ3QgZXhpc3QsIHRoaXMgaXMgZXhwZWN0ZWRcbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSBjb25uZWN0ZWQgY2xpZW50cyBzZXQgaWYgbm90IGFscmVhZHkgcHJlc2VudFxuICAgICAgaWYgKCFzZXNzaW9uLmNvbm5lY3RlZENsaWVudHMpIHtcbiAgICAgICAgc2Vzc2lvbi5jb25uZWN0ZWRDbGllbnRzID0gbmV3IFNldDxuZXQuU29ja2V0PigpO1xuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgVW5peCBkb21haW4gc29ja2V0IHNlcnZlciB3aXRoIGZyYW1lZCBtZXNzYWdlIHByb3RvY29sXG4gICAgICBjb25zdCBpbnB1dFNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoKGNsaWVudCkgPT4ge1xuICAgICAgICBjb25zdCBwYXJzZXIgPSBuZXcgTWVzc2FnZVBhcnNlcigpO1xuICAgICAgICBjbGllbnQuc2V0Tm9EZWxheSh0cnVlKTtcblxuICAgICAgICAvLyBBZGQgY2xpZW50IHRvIGNvbm5lY3RlZCBjbGllbnRzIHNldFxuICAgICAgICBzZXNzaW9uLmNvbm5lY3RlZENsaWVudHM/LmFkZChjbGllbnQpO1xuICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgYENsaWVudCBjb25uZWN0ZWQgdG8gc2Vzc2lvbiAke3Nlc3Npb24uaWR9LCB0b3RhbCBjbGllbnRzOiAke3Nlc3Npb24uY29ubmVjdGVkQ2xpZW50cz8uc2l6ZX1gXG4gICAgICAgICk7XG5cbiAgICAgICAgY2xpZW50Lm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICAgICAgcGFyc2VyLmFkZERhdGEoY2h1bmspO1xuXG4gICAgICAgICAgZm9yIChjb25zdCB7IHR5cGUsIHBheWxvYWQgfSBvZiBwYXJzZXIucGFyc2VNZXNzYWdlcygpKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZVNvY2tldE1lc3NhZ2Uoc2Vzc2lvbiwgdHlwZSwgcGF5bG9hZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjbGllbnQub24oJ2Vycm9yJywgKGVycikgPT4ge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgQ2xpZW50IHNvY2tldCBlcnJvciBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGVycik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIGNvbm5lY3RlZCBjbGllbnRzIHNldFxuICAgICAgICAgIHNlc3Npb24uY29ubmVjdGVkQ2xpZW50cz8uZGVsZXRlKGNsaWVudCk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgYENsaWVudCBkaXNjb25uZWN0ZWQgZnJvbSBzZXNzaW9uICR7c2Vzc2lvbi5pZH0sIHJlbWFpbmluZyBjbGllbnRzOiAke3Nlc3Npb24uY29ubmVjdGVkQ2xpZW50cz8uc2l6ZX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgaW5wdXRTZXJ2ZXIubGlzdGVuKHNvY2tldFBhdGgsICgpID0+IHtcbiAgICAgICAgLy8gTWFrZSBzb2NrZXQgd3JpdGFibGUgYnkgYWxsXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZnMuY2htb2RTeW5jKHNvY2tldFBhdGgsIDBvNjY2KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgRmFpbGVkIHRvIGNobW9kIGlucHV0IHNvY2tldCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgSW5wdXQgc29ja2V0IGNyZWF0ZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfWApO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFN0b3JlIHNlcnZlciByZWZlcmVuY2UgZm9yIGNsZWFudXBcbiAgICAgIHNlc3Npb24uaW5wdXRTb2NrZXRTZXJ2ZXIgPSBpbnB1dFNlcnZlcjtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIGlucHV0IHNvY2tldCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGVycm9yKTtcbiAgICB9XG5cbiAgICAvLyBBbGwgSVBDIGdvZXMgdGhyb3VnaCB0aGlzIHNvY2tldFxuICB9XG5cbiAgLyoqXG4gICAqIFNldHVwIGZpbGUgd2F0Y2hlciBmb3Igc2Vzc2lvbi5qc29uIGNoYW5nZXNcbiAgICovXG4gIHByaXZhdGUgc2V0dXBTZXNzaW9uV2F0Y2hlcihzZXNzaW9uOiBQdHlTZXNzaW9uKTogdm9pZCB7XG4gICAgY29uc3QgX3Nlc3Npb25Kc29uUGF0aCA9IHBhdGguam9pbihzZXNzaW9uLmNvbnRyb2xEaXIsICdzZXNzaW9uLmpzb24nKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBVc2UgcG9sbGluZyBhcHByb2FjaCBmb3IgYmV0dGVyIHJlbGlhYmlsaXR5IG9uIG1hY09TXG4gICAgICAvLyBDaGVjayBmb3IgY2hhbmdlcyBldmVyeSAxMDBtc1xuICAgICAgY29uc3QgY2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBSZWFkIHRoZSBjdXJyZW50IHNlc3Npb24gaW5mbyBmcm9tIGRpc2tcbiAgICAgICAgICBjb25zdCB1cGRhdGVkSW5mbyA9IHRoaXMuc2Vzc2lvbk1hbmFnZXIubG9hZFNlc3Npb25JbmZvKHNlc3Npb24uaWQpO1xuICAgICAgICAgIGlmICh1cGRhdGVkSW5mbyAmJiB1cGRhdGVkSW5mby5uYW1lICE9PSBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUpIHtcbiAgICAgICAgICAgIC8vIE5hbWUgaGFzIGNoYW5nZWQsIHVwZGF0ZSBvdXIgaW50ZXJuYWwgc3RhdGVcbiAgICAgICAgICAgIGNvbnN0IG9sZE5hbWUgPSBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWU7XG4gICAgICAgICAgICBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUgPSB1cGRhdGVkSW5mby5uYW1lO1xuXG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgIGBTZXNzaW9uICR7c2Vzc2lvbi5pZH0gbmFtZSBjaGFuZ2VkIGZyb20gXCIke29sZE5hbWV9XCIgdG8gXCIke3VwZGF0ZWRJbmZvLm5hbWV9XCJgXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvLyBFbWl0IGV2ZW50IGZvciBuYW1lIGNoYW5nZVxuICAgICAgICAgICAgdGhpcy50cmFja0FuZEVtaXQoJ3Nlc3Npb25OYW1lQ2hhbmdlZCcsIHNlc3Npb24uaWQsIHVwZGF0ZWRJbmZvLm5hbWUpO1xuXG4gICAgICAgICAgICAvLyBVcGRhdGUgdGl0bGUgaWYgbmVlZGVkIGZvciBleHRlcm5hbCB0ZXJtaW5hbHNcbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgc2Vzc2lvbi5pc0V4dGVybmFsVGVybWluYWwgJiZcbiAgICAgICAgICAgICAgKHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuU1RBVElDIHx8IHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuRFlOQU1JQylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aGlzLm1hcmtUaXRsZVVwZGF0ZU5lZWRlZChzZXNzaW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgLy8gU2Vzc2lvbiBmaWxlIG1pZ2h0IGJlIGRlbGV0ZWQsIGlnbm9yZVxuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgRmFpbGVkIHRvIHJlYWQgc2Vzc2lvbiBmaWxlIGZvciAke3Nlc3Npb24uaWR9OmAsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSwgMTAwKTtcblxuICAgICAgLy8gU3RvcmUgaW50ZXJ2YWwgZm9yIGNsZWFudXBcbiAgICAgIHNlc3Npb24uc2Vzc2lvbkpzb25JbnRlcnZhbCA9IGNoZWNrSW50ZXJ2YWw7XG4gICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gd2F0Y2hlciBzZXR1cCBmb3IgJHtzZXNzaW9uLmlkfWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBzZXR1cCBzZXNzaW9uIHdhdGNoZXIgZm9yICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgaW5jb21pbmcgc29ja2V0IG1lc3NhZ2VzXG4gICAqL1xuICBwcml2YXRlIGhhbmRsZVNvY2tldE1lc3NhZ2Uoc2Vzc2lvbjogUHR5U2Vzc2lvbiwgdHlwZTogTWVzc2FnZVR5cGUsIHBheWxvYWQ6IEJ1ZmZlcik6IHZvaWQge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBkYXRhID0gcGFyc2VQYXlsb2FkKHR5cGUsIHBheWxvYWQpO1xuXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5TVERJTl9EQVRBOiB7XG4gICAgICAgICAgY29uc3QgdGV4dCA9IGRhdGEgYXMgc3RyaW5nO1xuICAgICAgICAgIGlmIChzZXNzaW9uLnB0eVByb2Nlc3MgJiYgc2Vzc2lvbi5pbnB1dFF1ZXVlKSB7XG4gICAgICAgICAgICAvLyBRdWV1ZSBpbnB1dCB3cml0ZSB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuICAgICAgICAgICAgc2Vzc2lvbi5pbnB1dFF1ZXVlLmVucXVldWUoKCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoc2Vzc2lvbi5wdHlQcm9jZXNzKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5wdHlQcm9jZXNzLndyaXRlKHRleHQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIFJlY29yZCBpdCAobm9uLWJsb2NraW5nKVxuICAgICAgICAgICAgICBzZXNzaW9uLmFzY2lpbmVtYVdyaXRlcj8ud3JpdGVJbnB1dCh0ZXh0KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuQ09OVFJPTF9DTUQ6IHtcbiAgICAgICAgICBjb25zdCBjbWQgPSBkYXRhIGFzIENvbnRyb2xDb21tYW5kO1xuICAgICAgICAgIHRoaXMuaGFuZGxlQ29udHJvbE1lc3NhZ2Uoc2Vzc2lvbiwgY21kKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuU1RBVFVTX1VQREFURToge1xuICAgICAgICAgIGNvbnN0IHN0YXR1cyA9IGRhdGEgYXMgeyBhcHA6IHN0cmluZzsgc3RhdHVzOiBzdHJpbmcgfTtcbiAgICAgICAgICAvLyBVcGRhdGUgYWN0aXZpdHkgc3RhdHVzIGZvciB0aGUgc2Vzc2lvblxuICAgICAgICAgIGlmICghc2Vzc2lvbi5hY3Rpdml0eVN0YXR1cykge1xuICAgICAgICAgICAgc2Vzc2lvbi5hY3Rpdml0eVN0YXR1cyA9IHt9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBzZXNzaW9uLmFjdGl2aXR5U3RhdHVzLnNwZWNpZmljU3RhdHVzID0ge1xuICAgICAgICAgICAgYXBwOiBzdGF0dXMuYXBwLFxuICAgICAgICAgICAgc3RhdHVzOiBzdGF0dXMuc3RhdHVzLFxuICAgICAgICAgIH07XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBVcGRhdGVkIHN0YXR1cyBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIHN0YXR1cyk7XG5cbiAgICAgICAgICAvLyBCcm9hZGNhc3Qgc3RhdHVzIHVwZGF0ZSB0byBhbGwgY29ubmVjdGVkIGNsaWVudHNcbiAgICAgICAgICBpZiAoc2Vzc2lvbi5jb25uZWN0ZWRDbGllbnRzICYmIHNlc3Npb24uY29ubmVjdGVkQ2xpZW50cy5zaXplID4gMCkge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGZyYW1lTWVzc2FnZShNZXNzYWdlVHlwZS5TVEFUVVNfVVBEQVRFLCBzdGF0dXMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBjbGllbnQgb2Ygc2Vzc2lvbi5jb25uZWN0ZWRDbGllbnRzKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY2xpZW50LndyaXRlKG1lc3NhZ2UpO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYEZhaWxlZCB0byBicm9hZGNhc3Qgc3RhdHVzIHRvIGNsaWVudDpgLCBlcnIpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYEJyb2FkY2FzdGVkIHN0YXR1cyB1cGRhdGUgdG8gJHtzZXNzaW9uLmNvbm5lY3RlZENsaWVudHMuc2l6ZX0gY2xpZW50c2ApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuSEVBUlRCRUFUOlxuICAgICAgICAgIC8vIEhlYXJ0YmVhdCByZWNlaXZlZCAtIG5vIGFjdGlvbiBuZWVkZWQgZm9yIG5vd1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBVbmtub3duIG1lc3NhZ2UgdHlwZSAke3R5cGV9IGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH1gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRG9uJ3QgbG9nIHRoZSBmdWxsIGVycm9yIG9iamVjdCBhcyBpdCBtaWdodCBjb250YWluIGJ1ZmZlcnMgb3IgY2lyY3VsYXIgcmVmZXJlbmNlc1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gaGFuZGxlIHNvY2tldCBtZXNzYWdlIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06ICR7ZXJyb3JNZXNzYWdlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgY29udHJvbCBtZXNzYWdlcyBmcm9tIGNvbnRyb2wgcGlwZVxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVDb250cm9sTWVzc2FnZShzZXNzaW9uOiBQdHlTZXNzaW9uLCBtZXNzYWdlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuICAgIGlmIChcbiAgICAgIG1lc3NhZ2UuY21kID09PSAncmVzaXplJyAmJlxuICAgICAgdHlwZW9mIG1lc3NhZ2UuY29scyA9PT0gJ251bWJlcicgJiZcbiAgICAgIHR5cGVvZiBtZXNzYWdlLnJvd3MgPT09ICdudW1iZXInXG4gICAgKSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoc2Vzc2lvbi5wdHlQcm9jZXNzKSB7XG4gICAgICAgICAgc2Vzc2lvbi5wdHlQcm9jZXNzLnJlc2l6ZShtZXNzYWdlLmNvbHMsIG1lc3NhZ2Uucm93cyk7XG4gICAgICAgICAgc2Vzc2lvbi5hc2NpaW5lbWFXcml0ZXI/LndyaXRlUmVzaXplKG1lc3NhZ2UuY29scywgbWVzc2FnZS5yb3dzKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYEZhaWxlZCB0byByZXNpemUgc2Vzc2lvbiAke3Nlc3Npb24uaWR9IHRvICR7bWVzc2FnZS5jb2xzfXgke21lc3NhZ2Uucm93c306YCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobWVzc2FnZS5jbWQgPT09ICdraWxsJykge1xuICAgICAgY29uc3Qgc2lnbmFsID1cbiAgICAgICAgdHlwZW9mIG1lc3NhZ2Uuc2lnbmFsID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgbWVzc2FnZS5zaWduYWwgPT09ICdudW1iZXInXG4gICAgICAgICAgPyBtZXNzYWdlLnNpZ25hbFxuICAgICAgICAgIDogJ1NJR1RFUk0nO1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKHNlc3Npb24ucHR5UHJvY2Vzcykge1xuICAgICAgICAgIHNlc3Npb24ucHR5UHJvY2Vzcy5raWxsKHNpZ25hbCBhcyBzdHJpbmcpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIud2FybihgRmFpbGVkIHRvIGtpbGwgc2Vzc2lvbiAke3Nlc3Npb24uaWR9IHdpdGggc2lnbmFsICR7c2lnbmFsfTpgLCBlcnJvcik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChtZXNzYWdlLmNtZCA9PT0gJ3Jlc2V0LXNpemUnKSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoc2Vzc2lvbi5wdHlQcm9jZXNzKSB7XG4gICAgICAgICAgLy8gR2V0IGN1cnJlbnQgdGVybWluYWwgc2l6ZSBmcm9tIHByb2Nlc3Muc3Rkb3V0XG4gICAgICAgICAgY29uc3QgY29scyA9IHByb2Nlc3Muc3Rkb3V0LmNvbHVtbnMgfHwgODA7XG4gICAgICAgICAgY29uc3Qgcm93cyA9IHByb2Nlc3Muc3Rkb3V0LnJvd3MgfHwgMjQ7XG4gICAgICAgICAgc2Vzc2lvbi5wdHlQcm9jZXNzLnJlc2l6ZShjb2xzLCByb3dzKTtcbiAgICAgICAgICBzZXNzaW9uLmFzY2lpbmVtYVdyaXRlcj8ud3JpdGVSZXNpemUoY29scywgcm93cyk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBSZXNldCBzZXNzaW9uICR7c2Vzc2lvbi5pZH0gc2l6ZSB0byB0ZXJtaW5hbCBzaXplOiAke2NvbHN9eCR7cm93c31gKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byByZXNldCBzZXNzaW9uICR7c2Vzc2lvbi5pZH0gc2l6ZSB0byB0ZXJtaW5hbCBzaXplOmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG1lc3NhZ2UuY21kID09PSAndXBkYXRlLXRpdGxlJyAmJiB0eXBlb2YgbWVzc2FnZS50aXRsZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIC8vIEhhbmRsZSB0aXRsZSB1cGRhdGUgdmlhIElQQyAodXNlZCBieSB2dCB0aXRsZSBjb21tYW5kKVxuICAgICAgbG9nZ2VyLmRlYnVnKGBbSVBDXSBSZWNlaXZlZCB0aXRsZSB1cGRhdGUgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTogXCIke21lc3NhZ2UudGl0bGV9XCJgKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW0lQQ10gQ3VycmVudCBzZXNzaW9uIG5hbWUgYmVmb3JlIHVwZGF0ZTogXCIke3Nlc3Npb24uc2Vzc2lvbkluZm8ubmFtZX1cImApO1xuICAgICAgdGhpcy51cGRhdGVTZXNzaW9uTmFtZShzZXNzaW9uLmlkLCBtZXNzYWdlLnRpdGxlKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGZpc2ggc2hlbGwgY29tcGxldGlvbnMgZm9yIGEgcGFydGlhbCBjb21tYW5kXG4gICAqL1xuICBhc3luYyBnZXRGaXNoQ29tcGxldGlvbnMoc2Vzc2lvbklkOiBzdHJpbmcsIHBhcnRpYWw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyU2hlbGwgPSBQcm9jZXNzVXRpbHMuZ2V0VXNlclNoZWxsKCk7XG4gICAgICBpZiAoIUZpc2hIYW5kbGVyLmlzRmlzaFNoZWxsKHVzZXJTaGVsbCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IGZpc2hIYW5kbGVyIH0gPSBhd2FpdCBpbXBvcnQoJy4vZmlzaC1oYW5kbGVyLmpzJyk7XG4gICAgICBjb25zdCBjd2QgPSBzZXNzaW9uLmN1cnJlbnRXb3JraW5nRGlyIHx8IHByb2Nlc3MuY3dkKCk7XG4gICAgICByZXR1cm4gYXdhaXQgZmlzaEhhbmRsZXIuZ2V0Q29tcGxldGlvbnMocGFydGlhbCwgY3dkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oYEZpc2ggY29tcGxldGlvbnMgZmFpbGVkOiAke2Vycm9yfWApO1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIHRleHQgaW5wdXQgdG8gYSBzZXNzaW9uXG4gICAqL1xuICBzZW5kSW5wdXQoc2Vzc2lvbklkOiBzdHJpbmcsIGlucHV0OiBTZXNzaW9uSW5wdXQpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgbGV0IGRhdGFUb1NlbmQgPSAnJztcbiAgICAgIGlmIChpbnB1dC50ZXh0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgZGF0YVRvU2VuZCA9IGlucHV0LnRleHQ7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICBgUmVjZWl2ZWQgdGV4dCBpbnB1dDogJHtKU09OLnN0cmluZ2lmeShpbnB1dC50ZXh0KX0gLT4gc2VuZGluZzogJHtKU09OLnN0cmluZ2lmeShkYXRhVG9TZW5kKX1gXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGlucHV0LmtleSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRhdGFUb1NlbmQgPSB0aGlzLmNvbnZlcnRTcGVjaWFsS2V5KGlucHV0LmtleSk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICBgUmVjZWl2ZWQgc3BlY2lhbCBrZXk6IFwiJHtpbnB1dC5rZXl9XCIgLT4gY29udmVydGVkIHRvOiAke0pTT04uc3RyaW5naWZ5KGRhdGFUb1NlbmQpfWBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBQdHlFcnJvcignTm8gdGV4dCBvciBrZXkgc3BlY2lmaWVkIGluIGlucHV0JywgJ0lOVkFMSURfSU5QVVQnKTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgd2UgaGF2ZSBhbiBpbi1tZW1vcnkgc2Vzc2lvbiB3aXRoIGFjdGl2ZSBQVFksIHVzZSBpdFxuICAgICAgY29uc3QgbWVtb3J5U2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAobWVtb3J5U2Vzc2lvbj8ucHR5UHJvY2VzcyAmJiBtZW1vcnlTZXNzaW9uLmlucHV0UXVldWUpIHtcbiAgICAgICAgLy8gUXVldWUgaW5wdXQgd3JpdGUgdG8gcHJldmVudCByYWNlIGNvbmRpdGlvbnNcbiAgICAgICAgbWVtb3J5U2Vzc2lvbi5pbnB1dFF1ZXVlLmVucXVldWUoKCkgPT4ge1xuICAgICAgICAgIGlmIChtZW1vcnlTZXNzaW9uLnB0eVByb2Nlc3MpIHtcbiAgICAgICAgICAgIG1lbW9yeVNlc3Npb24ucHR5UHJvY2Vzcy53cml0ZShkYXRhVG9TZW5kKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgbWVtb3J5U2Vzc2lvbi5hc2NpaW5lbWFXcml0ZXI/LndyaXRlSW5wdXQoZGF0YVRvU2VuZCk7XG5cbiAgICAgICAgICAvLyBUcmFjayBkaXJlY3RvcnkgY2hhbmdlcyBmb3IgdGl0bGUgbW9kZXMgdGhhdCBuZWVkIGl0XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgKG1lbW9yeVNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuU1RBVElDIHx8XG4gICAgICAgICAgICAgIG1lbW9yeVNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuRFlOQU1JQykgJiZcbiAgICAgICAgICAgIGlucHV0LnRleHRcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGNvbnN0IG5ld0RpciA9IGV4dHJhY3RDZERpcmVjdG9yeShcbiAgICAgICAgICAgICAgaW5wdXQudGV4dCxcbiAgICAgICAgICAgICAgbWVtb3J5U2Vzc2lvbi5jdXJyZW50V29ya2luZ0RpciB8fCBtZW1vcnlTZXNzaW9uLnNlc3Npb25JbmZvLndvcmtpbmdEaXJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAobmV3RGlyKSB7XG4gICAgICAgICAgICAgIG1lbW9yeVNlc3Npb24uY3VycmVudFdvcmtpbmdEaXIgPSBuZXdEaXI7XG4gICAgICAgICAgICAgIHRoaXMubWFya1RpdGxlVXBkYXRlTmVlZGVkKG1lbW9yeVNlc3Npb24pO1xuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gJHtzZXNzaW9uSWR9IGNoYW5nZWQgZGlyZWN0b3J5IHRvOiAke25ld0Rpcn1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybjsgLy8gSW1wb3J0YW50OiByZXR1cm4gaGVyZSB0byBhdm9pZCBzb2NrZXQgcGF0aFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvblBhdGhzID0gdGhpcy5zZXNzaW9uTWFuYWdlci5nZXRTZXNzaW9uUGF0aHMoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKCFzZXNzaW9uUGF0aHMpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgICAgICBgU2Vzc2lvbiAke3Nlc3Npb25JZH0gcGF0aHMgbm90IGZvdW5kYCxcbiAgICAgICAgICAgICdTRVNTSU9OX1BBVEhTX05PVF9GT1VORCcsXG4gICAgICAgICAgICBzZXNzaW9uSWRcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9yIGZvcndhcmRlZCBzZXNzaW9ucywgd2UgbmVlZCB0byB1c2Ugc29ja2V0IGNvbW11bmljYXRpb25cbiAgICAgICAgY29uc3Qgc29ja2V0UGF0aCA9IHBhdGguam9pbihzZXNzaW9uUGF0aHMuY29udHJvbERpciwgJ2lwYy5zb2NrJyk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSBhIGNhY2hlZCBzb2NrZXQgY29ubmVjdGlvblxuICAgICAgICBsZXQgc29ja2V0Q2xpZW50ID0gdGhpcy5pbnB1dFNvY2tldENsaWVudHMuZ2V0KHNlc3Npb25JZCk7XG5cbiAgICAgICAgaWYgKCFzb2NrZXRDbGllbnQgfHwgc29ja2V0Q2xpZW50LmRlc3Ryb3llZCkge1xuICAgICAgICAgIC8vIFRyeSB0byBjb25uZWN0IHRvIHRoZSBzb2NrZXRcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgc29ja2V0Q2xpZW50ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oc29ja2V0UGF0aCk7XG4gICAgICAgICAgICBzb2NrZXRDbGllbnQuc2V0Tm9EZWxheSh0cnVlKTtcbiAgICAgICAgICAgIC8vIEtlZXAgc29ja2V0IGFsaXZlIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2VcbiAgICAgICAgICAgIHNvY2tldENsaWVudC5zZXRLZWVwQWxpdmUodHJ1ZSwgMCk7XG4gICAgICAgICAgICB0aGlzLmlucHV0U29ja2V0Q2xpZW50cy5zZXQoc2Vzc2lvbklkLCBzb2NrZXRDbGllbnQpO1xuXG4gICAgICAgICAgICBzb2NrZXRDbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmlucHV0U29ja2V0Q2xpZW50cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBzb2NrZXRDbGllbnQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmlucHV0U29ja2V0Q2xpZW50cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYEZhaWxlZCB0byBjb25uZWN0IHRvIGlucHV0IHNvY2tldCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgc29ja2V0Q2xpZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzb2NrZXRDbGllbnQgJiYgIXNvY2tldENsaWVudC5kZXN0cm95ZWQpIHtcbiAgICAgICAgICAvLyBTZW5kIHN0ZGluIGRhdGEgdXNpbmcgZnJhbWVkIG1lc3NhZ2UgcHJvdG9jb2xcbiAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZnJhbWVNZXNzYWdlKE1lc3NhZ2VUeXBlLlNURElOX0RBVEEsIGRhdGFUb1NlbmQpO1xuICAgICAgICAgIGNvbnN0IGNhbldyaXRlID0gc29ja2V0Q2xpZW50LndyaXRlKG1lc3NhZ2UpO1xuICAgICAgICAgIGlmICghY2FuV3JpdGUpIHtcbiAgICAgICAgICAgIC8vIFNvY2tldCBidWZmZXIgaXMgZnVsbFxuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBTb2NrZXQgYnVmZmVyIGZ1bGwgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9LCBkYXRhIHF1ZXVlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgICAgICBgTm8gc29ja2V0IGNvbm5lY3Rpb24gYXZhaWxhYmxlIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWAsXG4gICAgICAgICAgICAnTk9fU09DS0VUX0NPTk5FQ1RJT04nLFxuICAgICAgICAgICAgc2Vzc2lvbklkXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gc2VuZCBpbnB1dCB0byBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgJ1NFTkRfSU5QVVRfRkFJTEVEJyxcbiAgICAgICAgc2Vzc2lvbklkXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgY29udHJvbCBtZXNzYWdlIHRvIGFuIGV4dGVybmFsIHNlc3Npb24gdmlhIHNvY2tldFxuICAgKi9cbiAgcHJpdmF0ZSBzZW5kQ29udHJvbE1lc3NhZ2UoXG4gICAgc2Vzc2lvbklkOiBzdHJpbmcsXG4gICAgbWVzc2FnZTogUmVzaXplQ29udHJvbE1lc3NhZ2UgfCBLaWxsQ29udHJvbE1lc3NhZ2UgfCBSZXNldFNpemVDb250cm9sTWVzc2FnZVxuICApOiBib29sZWFuIHtcbiAgICBjb25zdCBzZXNzaW9uUGF0aHMgPSB0aGlzLnNlc3Npb25NYW5hZ2VyLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvblBhdGhzKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNvY2tldFBhdGggPSBwYXRoLmpvaW4oc2Vzc2lvblBhdGhzLmNvbnRyb2xEaXIsICdpcGMuc29jaycpO1xuICAgICAgbGV0IHNvY2tldENsaWVudCA9IHRoaXMuaW5wdXRTb2NrZXRDbGllbnRzLmdldChzZXNzaW9uSWQpO1xuXG4gICAgICBpZiAoIXNvY2tldENsaWVudCB8fCBzb2NrZXRDbGllbnQuZGVzdHJveWVkKSB7XG4gICAgICAgIC8vIFRyeSB0byBjb25uZWN0IHRvIHRoZSBzb2NrZXRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzb2NrZXRDbGllbnQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbihzb2NrZXRQYXRoKTtcbiAgICAgICAgICBzb2NrZXRDbGllbnQuc2V0Tm9EZWxheSh0cnVlKTtcbiAgICAgICAgICBzb2NrZXRDbGllbnQuc2V0S2VlcEFsaXZlKHRydWUsIDApO1xuICAgICAgICAgIHRoaXMuaW5wdXRTb2NrZXRDbGllbnRzLnNldChzZXNzaW9uSWQsIHNvY2tldENsaWVudCk7XG5cbiAgICAgICAgICBzb2NrZXRDbGllbnQub24oJ2Vycm9yJywgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5pbnB1dFNvY2tldENsaWVudHMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICBzb2NrZXRDbGllbnQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5pbnB1dFNvY2tldENsaWVudHMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBGYWlsZWQgdG8gY29ubmVjdCB0byBjb250cm9sIHNvY2tldCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoc29ja2V0Q2xpZW50ICYmICFzb2NrZXRDbGllbnQuZGVzdHJveWVkKSB7XG4gICAgICAgIGNvbnN0IGZyYW1lTXNnID0gZnJhbWVNZXNzYWdlKE1lc3NhZ2VUeXBlLkNPTlRST0xfQ01ELCBtZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuIHNvY2tldENsaWVudC53cml0ZShmcmFtZU1zZyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHNlbmQgY29udHJvbCBtZXNzYWdlIHRvIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgc3BlY2lhbCBrZXkgbmFtZXMgdG8gZXNjYXBlIHNlcXVlbmNlc1xuICAgKi9cbiAgcHJpdmF0ZSBjb252ZXJ0U3BlY2lhbEtleShrZXk6IFNwZWNpYWxLZXkpOiBzdHJpbmcge1xuICAgIGNvbnN0IGtleU1hcDogUmVjb3JkPFNwZWNpYWxLZXksIHN0cmluZz4gPSB7XG4gICAgICBhcnJvd191cDogJ1xceDFiW0EnLFxuICAgICAgYXJyb3dfZG93bjogJ1xceDFiW0InLFxuICAgICAgYXJyb3dfcmlnaHQ6ICdcXHgxYltDJyxcbiAgICAgIGFycm93X2xlZnQ6ICdcXHgxYltEJyxcbiAgICAgIGVzY2FwZTogJ1xceDFiJyxcbiAgICAgIGVudGVyOiAnXFxyJyxcbiAgICAgIGN0cmxfZW50ZXI6ICdcXG4nLFxuICAgICAgc2hpZnRfZW50ZXI6ICdcXHJcXG4nLFxuICAgICAgYmFja3NwYWNlOiAnXFx4N2YnLFxuICAgICAgdGFiOiAnXFx0JyxcbiAgICAgIHNoaWZ0X3RhYjogJ1xceDFiW1onLFxuICAgICAgcGFnZV91cDogJ1xceDFiWzV+JyxcbiAgICAgIHBhZ2VfZG93bjogJ1xceDFiWzZ+JyxcbiAgICAgIGhvbWU6ICdcXHgxYltIJyxcbiAgICAgIGVuZDogJ1xceDFiW0YnLFxuICAgICAgZGVsZXRlOiAnXFx4MWJbM34nLFxuICAgICAgZjE6ICdcXHgxYk9QJyxcbiAgICAgIGYyOiAnXFx4MWJPUScsXG4gICAgICBmMzogJ1xceDFiT1InLFxuICAgICAgZjQ6ICdcXHgxYk9TJyxcbiAgICAgIGY1OiAnXFx4MWJbMTV+JyxcbiAgICAgIGY2OiAnXFx4MWJbMTd+JyxcbiAgICAgIGY3OiAnXFx4MWJbMTh+JyxcbiAgICAgIGY4OiAnXFx4MWJbMTl+JyxcbiAgICAgIGY5OiAnXFx4MWJbMjB+JyxcbiAgICAgIGYxMDogJ1xceDFiWzIxficsXG4gICAgICBmMTE6ICdcXHgxYlsyM34nLFxuICAgICAgZjEyOiAnXFx4MWJbMjR+JyxcbiAgICB9O1xuXG4gICAgY29uc3Qgc2VxdWVuY2UgPSBrZXlNYXBba2V5XTtcbiAgICBpZiAoIXNlcXVlbmNlKSB7XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoYFVua25vd24gc3BlY2lhbCBrZXk6ICR7a2V5fWAsICdVTktOT1dOX0tFWScpO1xuICAgIH1cblxuICAgIHJldHVybiBzZXF1ZW5jZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNpemUgYSBzZXNzaW9uIHRlcm1pbmFsXG4gICAqL1xuICByZXNpemVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IG1lbW9yeVNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcblxuICAgIC8vIENoZWNrIGZvciByYXBpZCByZXNpemVzIChwb3RlbnRpYWwgZmVlZGJhY2sgbG9vcClcbiAgICBjb25zdCBsYXN0UmVzaXplID0gdGhpcy5zZXNzaW9uUmVzaXplU291cmNlcy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAobGFzdFJlc2l6ZSkge1xuICAgICAgY29uc3QgdGltZVNpbmNlTGFzdFJlc2l6ZSA9IGN1cnJlbnRUaW1lIC0gbGFzdFJlc2l6ZS50aW1lc3RhbXA7XG4gICAgICBpZiAodGltZVNpbmNlTGFzdFJlc2l6ZSA8IDEwMCkge1xuICAgICAgICAvLyBMZXNzIHRoYW4gMTAwbXMgc2luY2UgbGFzdCByZXNpemUgLSB0aGlzIG1pZ2h0IGluZGljYXRlIGEgbG9vcFxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgUmFwaWQgcmVzaXplIGRldGVjdGVkIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHt0aW1lU2luY2VMYXN0UmVzaXplfW1zIHNpbmNlIGxhc3QgcmVzaXplICgke2xhc3RSZXNpemUuY29sc314JHtsYXN0UmVzaXplLnJvd3N9IC0+ICR7Y29sc314JHtyb3dzfSlgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIHdlIGhhdmUgYW4gaW4tbWVtb3J5IHNlc3Npb24gd2l0aCBhY3RpdmUgUFRZLCByZXNpemUgaXRcbiAgICAgIGlmIChtZW1vcnlTZXNzaW9uPy5wdHlQcm9jZXNzKSB7XG4gICAgICAgIG1lbW9yeVNlc3Npb24ucHR5UHJvY2Vzcy5yZXNpemUoY29scywgcm93cyk7XG4gICAgICAgIG1lbW9yeVNlc3Npb24uYXNjaWluZW1hV3JpdGVyPy53cml0ZVJlc2l6ZShjb2xzLCByb3dzKTtcblxuICAgICAgICAvLyBUcmFjayB0aGlzIGJyb3dzZXItaW5pdGlhdGVkIHJlc2l6ZVxuICAgICAgICB0aGlzLnNlc3Npb25SZXNpemVTb3VyY2VzLnNldChzZXNzaW9uSWQsIHtcbiAgICAgICAgICBjb2xzLFxuICAgICAgICAgIHJvd3MsXG4gICAgICAgICAgc291cmNlOiAnYnJvd3NlcicsXG4gICAgICAgICAgdGltZXN0YW1wOiBjdXJyZW50VGltZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBSZXNpemVkIHNlc3Npb24gJHtzZXNzaW9uSWR9IHRvICR7Y29sc314JHtyb3dzfWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRm9yIGV4dGVybmFsIHNlc3Npb25zLCB0cnkgdG8gc2VuZCByZXNpemUgdmlhIGNvbnRyb2wgcGlwZVxuICAgICAgICBjb25zdCByZXNpemVNZXNzYWdlOiBSZXNpemVDb250cm9sTWVzc2FnZSA9IHtcbiAgICAgICAgICBjbWQ6ICdyZXNpemUnLFxuICAgICAgICAgIGNvbHMsXG4gICAgICAgICAgcm93cyxcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5zZW5kQ29udHJvbE1lc3NhZ2Uoc2Vzc2lvbklkLCByZXNpemVNZXNzYWdlKTtcblxuICAgICAgICAvLyBUcmFjayB0aGlzIHJlc2l6ZSBmb3IgZXh0ZXJuYWwgc2Vzc2lvbnMgdG9vXG4gICAgICAgIHRoaXMuc2Vzc2lvblJlc2l6ZVNvdXJjZXMuc2V0KHNlc3Npb25JZCwge1xuICAgICAgICAgIGNvbHMsXG4gICAgICAgICAgcm93cyxcbiAgICAgICAgICBzb3VyY2U6ICdicm93c2VyJyxcbiAgICAgICAgICB0aW1lc3RhbXA6IGN1cnJlbnRUaW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhyb3cgbmV3IFB0eUVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIHJlc2l6ZSBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgJ1JFU0laRV9GQUlMRUQnLFxuICAgICAgICBzZXNzaW9uSWRcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBzZXNzaW9uIG5hbWVcbiAgICovXG4gIHVwZGF0ZVNlc3Npb25OYW1lKHNlc3Npb25JZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBbUHR5TWFuYWdlcl0gdXBkYXRlU2Vzc2lvbk5hbWUgY2FsbGVkIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSB3aXRoIG5hbWU6ICR7bmFtZX1gXG4gICAgKTtcblxuICAgIC8vIFVwZGF0ZSBpbiBzZXNzaW9uIG1hbmFnZXIgKHBlcnNpc3RlZCBzdG9yYWdlKSAtIGdldCB0aGUgdW5pcXVlIG5hbWUgYmFja1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1B0eU1hbmFnZXJdIENhbGxpbmcgc2Vzc2lvbk1hbmFnZXIudXBkYXRlU2Vzc2lvbk5hbWVgKTtcbiAgICBjb25zdCB1bmlxdWVOYW1lID0gdGhpcy5zZXNzaW9uTWFuYWdlci51cGRhdGVTZXNzaW9uTmFtZShzZXNzaW9uSWQsIG5hbWUpO1xuXG4gICAgLy8gVXBkYXRlIGluLW1lbW9yeSBzZXNzaW9uIGlmIGl0IGV4aXN0c1xuICAgIGNvbnN0IG1lbW9yeVNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmIChtZW1vcnlTZXNzaW9uPy5zZXNzaW9uSW5mbykge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbUHR5TWFuYWdlcl0gRm91bmQgaW4tbWVtb3J5IHNlc3Npb24sIHVwZGF0aW5nLi4uYCk7XG4gICAgICBjb25zdCBvbGROYW1lID0gbWVtb3J5U2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lO1xuICAgICAgbWVtb3J5U2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lID0gdW5pcXVlTmFtZTtcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBbUHR5TWFuYWdlcl0gU2Vzc2lvbiBpbmZvIGFmdGVyIHVwZGF0ZTpgLCB7XG4gICAgICAgIHNlc3Npb25JZDogbWVtb3J5U2Vzc2lvbi5pZCxcbiAgICAgICAgbmV3TmFtZTogbWVtb3J5U2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lLFxuICAgICAgICBvbGRDdXJyZW50VGl0bGU6IGAke21lbW9yeVNlc3Npb24uY3VycmVudFRpdGxlPy5zdWJzdHJpbmcoMCwgNTApfS4uLmAsXG4gICAgICB9KTtcblxuICAgICAgLy8gRm9yY2UgaW1tZWRpYXRlIHRpdGxlIHVwZGF0ZSBmb3IgYWN0aXZlIHNlc3Npb25zXG4gICAgICAvLyBGb3Igc2Vzc2lvbiBuYW1lIGNoYW5nZXMsIGFsd2F5cyB1cGRhdGUgdGl0bGUgcmVnYXJkbGVzcyBvZiBtb2RlXG4gICAgICBpZiAobWVtb3J5U2Vzc2lvbi5pc0V4dGVybmFsVGVybWluYWwgJiYgbWVtb3J5U2Vzc2lvbi5zdGRvdXRRdWV1ZSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtQdHlNYW5hZ2VyXSBGb3JjaW5nIGltbWVkaWF0ZSB0aXRsZSB1cGRhdGUgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCwge1xuICAgICAgICAgIHRpdGxlTW9kZTogbWVtb3J5U2Vzc2lvbi50aXRsZU1vZGUsXG4gICAgICAgICAgaGFkQ3VycmVudFRpdGxlOiAhIW1lbW9yeVNlc3Npb24uY3VycmVudFRpdGxlLFxuICAgICAgICAgIHRpdGxlVXBkYXRlTmVlZGVkOiBtZW1vcnlTZXNzaW9uLnRpdGxlVXBkYXRlTmVlZGVkLFxuICAgICAgICB9KTtcbiAgICAgICAgLy8gQ2xlYXIgY3VycmVudCB0aXRsZSB0byBmb3JjZSByZWdlbmVyYXRpb25cbiAgICAgICAgbWVtb3J5U2Vzc2lvbi5jdXJyZW50VGl0bGUgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMudXBkYXRlVGVybWluYWxUaXRsZUZvclNlc3Npb25OYW1lKG1lbW9yeVNlc3Npb24pO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBgW1B0eU1hbmFnZXJdIFVwZGF0ZWQgc2Vzc2lvbiAke3Nlc3Npb25JZH0gbmFtZSBmcm9tIFwiJHtvbGROYW1lfVwiIHRvIFwiJHt1bmlxdWVOYW1lfVwiYFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbUHR5TWFuYWdlcl0gTm8gaW4tbWVtb3J5IHNlc3Npb24gZm91bmQgZm9yICR7c2Vzc2lvbklkfWAsIHtcbiAgICAgICAgc2Vzc2lvbnNNYXBTaXplOiB0aGlzLnNlc3Npb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25JZHM6IEFycmF5LmZyb20odGhpcy5zZXNzaW9ucy5rZXlzKCkpLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gRW1pdCBldmVudCBmb3IgY2xpZW50cyB0byByZWZyZXNoIHRoZWlyIHNlc3Npb24gZGF0YVxuICAgIHRoaXMudHJhY2tBbmRFbWl0KCdzZXNzaW9uTmFtZUNoYW5nZWQnLCBzZXNzaW9uSWQsIHVuaXF1ZU5hbWUpO1xuXG4gICAgbG9nZ2VyLmRlYnVnKGBbUHR5TWFuYWdlcl0gVXBkYXRlZCBzZXNzaW9uICR7c2Vzc2lvbklkfSBuYW1lIHRvOiAke3VuaXF1ZU5hbWV9YCk7XG5cbiAgICByZXR1cm4gdW5pcXVlTmFtZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldCBzZXNzaW9uIHNpemUgdG8gdGVybWluYWwgc2l6ZSAoZm9yIGV4dGVybmFsIHRlcm1pbmFscylcbiAgICovXG4gIHJlc2V0U2Vzc2lvblNpemUoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBtZW1vcnlTZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBGb3IgaW4tbWVtb3J5IHNlc3Npb25zLCB3ZSBjYW4ndCByZXNldCB0byB0ZXJtaW5hbCBzaXplIHNpbmNlIHdlIGRvbid0IGtub3cgaXRcbiAgICAgIGlmIChtZW1vcnlTZXNzaW9uPy5wdHlQcm9jZXNzKSB7XG4gICAgICAgIHRocm93IG5ldyBQdHlFcnJvcihcbiAgICAgICAgICBgQ2Fubm90IHJlc2V0IHNpemUgZm9yIGluLW1lbW9yeSBzZXNzaW9uICR7c2Vzc2lvbklkfWAsXG4gICAgICAgICAgJ0lOVkFMSURfT1BFUkFUSU9OJyxcbiAgICAgICAgICBzZXNzaW9uSWRcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yIGV4dGVybmFsIHNlc3Npb25zLCBzZW5kIHJlc2V0LXNpemUgY29tbWFuZCB2aWEgY29udHJvbCBwaXBlXG4gICAgICBjb25zdCByZXNldFNpemVNZXNzYWdlOiBSZXNldFNpemVDb250cm9sTWVzc2FnZSA9IHtcbiAgICAgICAgY21kOiAncmVzZXQtc2l6ZScsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBzZW50ID0gdGhpcy5zZW5kQ29udHJvbE1lc3NhZ2Uoc2Vzc2lvbklkLCByZXNldFNpemVNZXNzYWdlKTtcbiAgICAgIGlmICghc2VudCkge1xuICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCB0byBzZW5kIHJlc2V0LXNpemUgY29tbWFuZCB0byBzZXNzaW9uICR7c2Vzc2lvbklkfWAsXG4gICAgICAgICAgJ0NPTlRST0xfTUVTU0FHRV9GQUlMRUQnLFxuICAgICAgICAgIHNlc3Npb25JZFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZGVidWcoYFNlbnQgcmVzZXQtc2l6ZSBjb21tYW5kIHRvIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byByZXNldCBzZXNzaW9uIHNpemUgZm9yICR7c2Vzc2lvbklkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgJ1JFU0VUX1NJWkVfRkFJTEVEJyxcbiAgICAgICAgc2Vzc2lvbklkXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEZXRhY2ggZnJvbSBhIHRtdXggc2Vzc2lvbiBncmFjZWZ1bGx5XG4gICAqIEBwYXJhbSBzZXNzaW9uSWQgVGhlIHNlc3Npb24gSUQgb2YgdGhlIHRtdXggYXR0YWNobWVudFxuICAgKiBAcmV0dXJucyBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBkZXRhY2hlZFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBkZXRhY2hGcm9tVG11eChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbiB8fCAhc2Vzc2lvbi5pc1RtdXhBdHRhY2htZW50IHx8ICFzZXNzaW9uLnB0eVByb2Nlc3MpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5jeWFuKGBEZXRhY2hpbmcgZnJvbSB0bXV4IHNlc3Npb24gKCR7c2Vzc2lvbklkfSlgKSk7XG5cbiAgICAgIC8vIFRyeSB0aGUgc3RhbmRhcmQgZGV0YWNoIHNlcXVlbmNlIGZpcnN0IChDdHJsLUIsIGQpXG4gICAgICBhd2FpdCB0aGlzLnNlbmRJbnB1dChzZXNzaW9uSWQsIHsgdGV4dDogJ1xceDAyZCcgfSk7IC8vIFxceDAyIGlzIEN0cmwtQlxuXG4gICAgICAvLyBXYWl0IGZvciBkZXRhY2htZW50XG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAzMDApKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhlIHByb2Nlc3MgaXMgc3RpbGwgcnVubmluZ1xuICAgICAgaWYgKCFQcm9jZXNzVXRpbHMuaXNQcm9jZXNzUnVubmluZyhzZXNzaW9uLnB0eVByb2Nlc3MucGlkKSkge1xuICAgICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKGBTdWNjZXNzZnVsbHkgZGV0YWNoZWQgZnJvbSB0bXV4ICgke3Nlc3Npb25JZH0pYCkpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgLy8gSWYgc3RpbGwgcnVubmluZywgdHJ5IHNlbmRpbmcgdGhlIGRldGFjaC1jbGllbnQgY29tbWFuZFxuICAgICAgbG9nZ2VyLmRlYnVnKCdGaXJzdCBkZXRhY2ggYXR0ZW1wdCBmYWlsZWQsIHRyeWluZyBkZXRhY2gtY2xpZW50IGNvbW1hbmQnKTtcbiAgICAgIGF3YWl0IHRoaXMuc2VuZElucHV0KHNlc3Npb25JZCwgeyB0ZXh0OiAnOmRldGFjaC1jbGllbnRcXG4nIH0pO1xuXG4gICAgICAvLyBXYWl0IGEgYml0IGxvbmdlclxuICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTAwKSk7XG5cbiAgICAgIC8vIEZpbmFsIGNoZWNrXG4gICAgICBpZiAoIVByb2Nlc3NVdGlscy5pc1Byb2Nlc3NSdW5uaW5nKHNlc3Npb24ucHR5UHJvY2Vzcy5waWQpKSB7XG4gICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgY2hhbGsuZ3JlZW4oYFN1Y2Nlc3NmdWxseSBkZXRhY2hlZCBmcm9tIHRtdXggdXNpbmcgZGV0YWNoLWNsaWVudCAoJHtzZXNzaW9uSWR9KWApXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgZGV0YWNoaW5nIGZyb20gdG11eDogJHtlcnJvcn1gKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2lsbCBhIHNlc3Npb24gd2l0aCBwcm9wZXIgU0lHVEVSTSAtPiBTSUdLSUxMIGVzY2FsYXRpb25cbiAgICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBwcm9jZXNzIGlzIGFjdHVhbGx5IHRlcm1pbmF0ZWRcbiAgICovXG4gIGFzeW5jIGtpbGxTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCBzaWduYWw6IHN0cmluZyB8IG51bWJlciA9ICdTSUdURVJNJyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG1lbW9yeVNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNwZWNpYWwgaGFuZGxpbmcgZm9yIHRtdXggYXR0YWNobWVudCBzZXNzaW9uc1xuICAgICAgaWYgKG1lbW9yeVNlc3Npb24/LmlzVG11eEF0dGFjaG1lbnQpIHtcbiAgICAgICAgY29uc3QgZGV0YWNoZWQgPSBhd2FpdCB0aGlzLmRldGFjaEZyb21UbXV4KHNlc3Npb25JZCk7XG4gICAgICAgIGlmIChkZXRhY2hlZCkge1xuICAgICAgICAgIC8vIFRoZSBQVFkgcHJvY2VzcyBzaG91bGQgZXhpdCBjbGVhbmx5IGFmdGVyIGRldGFjaGluZ1xuICAgICAgICAgIC8vIExldCB0aGUgbm9ybWFsIGV4aXQgaGFuZGxlciBjbGVhbiB1cCB0aGUgc2Vzc2lvblxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ2dlci53YXJuKGBGYWlsZWQgdG8gZGV0YWNoIGZyb20gdG11eCwgZmFsbGluZyBiYWNrIHRvIG5vcm1hbCBraWxsYCk7XG4gICAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byBub3JtYWwga2lsbCBsb2dpY1xuICAgICAgfVxuXG4gICAgICAvLyBJZiB3ZSBoYXZlIGFuIGluLW1lbW9yeSBzZXNzaW9uIHdpdGggYWN0aXZlIFBUWSwga2lsbCBpdCBkaXJlY3RseVxuICAgICAgaWYgKG1lbW9yeVNlc3Npb24/LnB0eVByb2Nlc3MpIHtcbiAgICAgICAgLy8gSWYgc2lnbmFsIGlzIGFscmVhZHkgU0lHS0lMTCwgc2VuZCBpdCBpbW1lZGlhdGVseSBhbmQgd2FpdCBicmllZmx5XG4gICAgICAgIGlmIChzaWduYWwgPT09ICdTSUdLSUxMJyB8fCBzaWduYWwgPT09IDkpIHtcbiAgICAgICAgICBtZW1vcnlTZXNzaW9uLnB0eVByb2Nlc3Mua2lsbCgnU0lHS0lMTCcpO1xuXG4gICAgICAgICAgLy8gTm90ZTogV2Ugbm8gbG9uZ2VyIGtpbGwgdGhlIHByb2Nlc3MgZ3JvdXAgdG8gYXZvaWQgYWZmZWN0aW5nIG90aGVyIHNlc3Npb25zXG4gICAgICAgICAgLy8gdGhhdCBtaWdodCBzaGFyZSB0aGUgc2FtZSBwcm9jZXNzIGdyb3VwIChlLmcuLCBtdWx0aXBsZSBmd2QudHMgaW5zdGFuY2VzKVxuXG4gICAgICAgICAgdGhpcy5zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAvLyBXYWl0IGEgYml0IGZvciBTSUdLSUxMIHRvIHRha2UgZWZmZWN0XG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3RhcnQgd2l0aCBTSUdURVJNIGFuZCBlc2NhbGF0ZSBpZiBuZWVkZWRcbiAgICAgICAgYXdhaXQgdGhpcy5raWxsU2Vzc2lvbldpdGhFc2NhbGF0aW9uKHNlc3Npb25JZCwgbWVtb3J5U2Vzc2lvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGb3IgZXh0ZXJuYWwgc2Vzc2lvbnMsIHRyeSBjb250cm9sIHBpcGUgZmlyc3QsIHRoZW4gZmFsbCBiYWNrIHRvIFBJRFxuICAgICAgICBjb25zdCBraWxsTWVzc2FnZTogS2lsbENvbnRyb2xNZXNzYWdlID0ge1xuICAgICAgICAgIGNtZDogJ2tpbGwnLFxuICAgICAgICAgIHNpZ25hbCxcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCBzZW50Q29udHJvbCA9IHRoaXMuc2VuZENvbnRyb2xNZXNzYWdlKHNlc3Npb25JZCwga2lsbE1lc3NhZ2UpO1xuICAgICAgICBpZiAoc2VudENvbnRyb2wpIHtcbiAgICAgICAgICAvLyBXYWl0IGEgYml0IGZvciB0aGUgY29udHJvbCBtZXNzYWdlIHRvIGJlIHByb2Nlc3NlZFxuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDUwMCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgcHJvY2VzcyBpcyBzdGlsbCBydW5uaW5nLCBpZiBzbywgdXNlIGRpcmVjdCBQSUQga2lsbFxuICAgICAgICBjb25zdCBkaXNrU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbk1hbmFnZXIubG9hZFNlc3Npb25JbmZvKHNlc3Npb25JZCk7XG4gICAgICAgIGlmICghZGlza1Nlc3Npb24pIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uSWR9IG5vdCBmb3VuZGAsICdTRVNTSU9OX05PVF9GT1VORCcsIHNlc3Npb25JZCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGlza1Nlc3Npb24ucGlkICYmIFByb2Nlc3NVdGlscy5pc1Byb2Nlc3NSdW5uaW5nKGRpc2tTZXNzaW9uLnBpZCkpIHtcbiAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgY2hhbGsueWVsbG93KGBLaWxsaW5nIGV4dGVybmFsIHNlc3Npb24gJHtzZXNzaW9uSWR9IChQSUQ6ICR7ZGlza1Nlc3Npb24ucGlkfSlgKVxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBpZiAoc2lnbmFsID09PSAnU0lHS0lMTCcgfHwgc2lnbmFsID09PSA5KSB7XG4gICAgICAgICAgICBwcm9jZXNzLmtpbGwoZGlza1Nlc3Npb24ucGlkLCAnU0lHS0lMTCcpO1xuXG4gICAgICAgICAgICAvLyBOb3RlOiBXZSBubyBsb25nZXIga2lsbCB0aGUgcHJvY2VzcyBncm91cCB0byBhdm9pZCBhZmZlY3Rpbmcgb3RoZXIgc2Vzc2lvbnNcbiAgICAgICAgICAgIC8vIHRoYXQgbWlnaHQgc2hhcmUgdGhlIHNhbWUgcHJvY2VzcyBncm91cCAoZS5nLiwgbXVsdGlwbGUgZndkLnRzIGluc3RhbmNlcylcblxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gU2VuZCBTSUdURVJNIGZpcnN0XG4gICAgICAgICAgcHJvY2Vzcy5raWxsKGRpc2tTZXNzaW9uLnBpZCwgJ1NJR1RFUk0nKTtcblxuICAgICAgICAgIC8vIE5vdGU6IFdlIG5vIGxvbmdlciBraWxsIHRoZSBwcm9jZXNzIGdyb3VwIHRvIGF2b2lkIGFmZmVjdGluZyBvdGhlciBzZXNzaW9uc1xuICAgICAgICAgIC8vIHRoYXQgbWlnaHQgc2hhcmUgdGhlIHNhbWUgcHJvY2VzcyBncm91cCAoZS5nLiwgbXVsdGlwbGUgZndkLnRzIGluc3RhbmNlcylcblxuICAgICAgICAgIC8vIFdhaXQgdXAgdG8gMyBzZWNvbmRzIGZvciBncmFjZWZ1bCB0ZXJtaW5hdGlvblxuICAgICAgICAgIGNvbnN0IG1heFdhaXRUaW1lID0gMzAwMDtcbiAgICAgICAgICBjb25zdCBjaGVja0ludGVydmFsID0gNTAwO1xuICAgICAgICAgIGNvbnN0IG1heENoZWNrcyA9IG1heFdhaXRUaW1lIC8gY2hlY2tJbnRlcnZhbDtcblxuICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF4Q2hlY2tzOyBpKyspIHtcbiAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIGNoZWNrSW50ZXJ2YWwpKTtcblxuICAgICAgICAgICAgaWYgKCFQcm9jZXNzVXRpbHMuaXNQcm9jZXNzUnVubmluZyhkaXNrU2Vzc2lvbi5waWQpKSB7XG4gICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ncmVlbihgRXh0ZXJuYWwgc2Vzc2lvbiAke3Nlc3Npb25JZH0gdGVybWluYXRlZCBncmFjZWZ1bGx5YCkpO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gUHJvY2VzcyBkaWRuJ3QgdGVybWluYXRlIGdyYWNlZnVsbHksIGZvcmNlIGtpbGxcbiAgICAgICAgICBsb2dnZXIuZGVidWcoY2hhbGsueWVsbG93KGBFeHRlcm5hbCBzZXNzaW9uICR7c2Vzc2lvbklkfSByZXF1aXJlcyBTSUdLSUxMYCkpO1xuICAgICAgICAgIHByb2Nlc3Mua2lsbChkaXNrU2Vzc2lvbi5waWQsICdTSUdLSUxMJyk7XG5cbiAgICAgICAgICAvLyBOb3RlOiBXZSBubyBsb25nZXIga2lsbCB0aGUgcHJvY2VzcyBncm91cCB0byBhdm9pZCBhZmZlY3Rpbmcgb3RoZXIgc2Vzc2lvbnNcbiAgICAgICAgICAvLyB0aGF0IG1pZ2h0IHNoYXJlIHRoZSBzYW1lIHByb2Nlc3MgZ3JvdXAgKGUuZy4sIG11bHRpcGxlIGZ3ZC50cyBpbnN0YW5jZXMpXG5cbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8ga2lsbCBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgJ0tJTExfRkFJTEVEJyxcbiAgICAgICAgc2Vzc2lvbklkXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLaWxsIHNlc3Npb24gd2l0aCBTSUdURVJNIC0+IFNJR0tJTEwgZXNjYWxhdGlvbiAoMyBzZWNvbmRzLCBjaGVjayBldmVyeSA1MDBtcylcbiAgICovXG4gIHByaXZhdGUgYXN5bmMga2lsbFNlc3Npb25XaXRoRXNjYWxhdGlvbihzZXNzaW9uSWQ6IHN0cmluZywgc2Vzc2lvbjogUHR5U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghc2Vzc2lvbi5wdHlQcm9jZXNzKSB7XG4gICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBpZCA9IHNlc3Npb24ucHR5UHJvY2Vzcy5waWQ7XG4gICAgbG9nZ2VyLmRlYnVnKGNoYWxrLnllbGxvdyhgVGVybWluYXRpbmcgc2Vzc2lvbiAke3Nlc3Npb25JZH0gKFBJRDogJHtwaWR9KWApKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBTZW5kIFNJR1RFUk0gZmlyc3RcbiAgICAgIHNlc3Npb24ucHR5UHJvY2Vzcy5raWxsKCdTSUdURVJNJyk7XG5cbiAgICAgIC8vIE5vdGU6IFdlIG5vIGxvbmdlciBraWxsIHRoZSBwcm9jZXNzIGdyb3VwIHRvIGF2b2lkIGFmZmVjdGluZyBvdGhlciBzZXNzaW9uc1xuICAgICAgLy8gdGhhdCBtaWdodCBzaGFyZSB0aGUgc2FtZSBwcm9jZXNzIGdyb3VwIChlLmcuLCBtdWx0aXBsZSBmd2QudHMgaW5zdGFuY2VzKVxuXG4gICAgICAvLyBXYWl0IHVwIHRvIDMgc2Vjb25kcyBmb3IgZ3JhY2VmdWwgdGVybWluYXRpb24gKGNoZWNrIGV2ZXJ5IDUwMG1zKVxuICAgICAgY29uc3QgbWF4V2FpdFRpbWUgPSAzMDAwO1xuICAgICAgY29uc3QgY2hlY2tJbnRlcnZhbCA9IDUwMDtcbiAgICAgIGNvbnN0IG1heENoZWNrcyA9IG1heFdhaXRUaW1lIC8gY2hlY2tJbnRlcnZhbDtcblxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBtYXhDaGVja3M7IGkrKykge1xuICAgICAgICAvLyBXYWl0IGZvciBjaGVjayBpbnRlcnZhbFxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBjaGVja0ludGVydmFsKSk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgcHJvY2VzcyBpcyBzdGlsbCBhbGl2ZVxuICAgICAgICBpZiAoIVByb2Nlc3NVdGlscy5pc1Byb2Nlc3NSdW5uaW5nKHBpZCkpIHtcbiAgICAgICAgICAvLyBQcm9jZXNzIG5vIGxvbmdlciBleGlzdHMgLSBpdCB0ZXJtaW5hdGVkIGdyYWNlZnVsbHlcbiAgICAgICAgICBsb2dnZXIuZGVidWcoY2hhbGsuZ3JlZW4oYFNlc3Npb24gJHtzZXNzaW9uSWR9IHRlcm1pbmF0ZWQgZ3JhY2VmdWxseWApKTtcbiAgICAgICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3Mgc3RpbGwgZXhpc3RzLCBjb250aW51ZSB3YWl0aW5nXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgU2Vzc2lvbiAke3Nlc3Npb25JZH0gc3RpbGwgcnVubmluZyBhZnRlciAkeyhpICsgMSkgKiBjaGVja0ludGVydmFsfW1zYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByb2Nlc3MgZGlkbid0IHRlcm1pbmF0ZSBncmFjZWZ1bGx5IHdpdGhpbiAzIHNlY29uZHMsIGZvcmNlIGtpbGxcbiAgICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay55ZWxsb3coYFNlc3Npb24gJHtzZXNzaW9uSWR9IHJlcXVpcmVzIFNJR0tJTExgKSk7XG4gICAgICB0cnkge1xuICAgICAgICBzZXNzaW9uLnB0eVByb2Nlc3Mua2lsbCgnU0lHS0lMTCcpO1xuXG4gICAgICAgIC8vIEFsc28gZm9yY2Uga2lsbCB0aGUgZW50aXJlIHByb2Nlc3MgZ3JvdXAgaWYgb24gVW5peFxuICAgICAgICAvLyBOb3RlOiBXZSBubyBsb25nZXIga2lsbCB0aGUgcHJvY2VzcyBncm91cCB0byBhdm9pZCBhZmZlY3Rpbmcgb3RoZXIgc2Vzc2lvbnNcbiAgICAgICAgLy8gdGhhdCBtaWdodCBzaGFyZSB0aGUgc2FtZSBwcm9jZXNzIGdyb3VwIChlLmcuLCBtdWx0aXBsZSBmd2QudHMgaW5zdGFuY2VzKVxuXG4gICAgICAgIC8vIFdhaXQgYSBiaXQgbW9yZSBmb3IgU0lHS0lMTCB0byB0YWtlIGVmZmVjdFxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbiAgICAgIH0gY2F0Y2ggKF9raWxsRXJyb3IpIHtcbiAgICAgICAgLy8gUHJvY2VzcyBtaWdodCBoYXZlIGRpZWQgYmV0d2VlbiBvdXIgY2hlY2sgYW5kIFNJR0tJTExcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBTSUdLSUxMIGZhaWxlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKHByb2Nlc3MgYWxyZWFkeSB0ZXJtaW5hdGVkKWApO1xuICAgICAgfVxuXG4gICAgICAvLyBSZW1vdmUgZnJvbSBzZXNzaW9ucyByZWdhcmRsZXNzXG4gICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGNoYWxrLnllbGxvdyhgU2Vzc2lvbiAke3Nlc3Npb25JZH0gZm9yY2VmdWxseSB0ZXJtaW5hdGVkYCkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBSZW1vdmUgZnJvbSBzZXNzaW9ucyBldmVuIGlmIGtpbGwgZmFpbGVkXG4gICAgICB0aGlzLnNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgdGhyb3cgbmV3IFB0eUVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIHRlcm1pbmF0ZSBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgJ0tJTExfRkFJTEVEJyxcbiAgICAgICAgc2Vzc2lvbklkXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0IGFsbCBzZXNzaW9ucyAoYm90aCBhY3RpdmUgYW5kIHBlcnNpc3RlZClcbiAgICovXG4gIGxpc3RTZXNzaW9ucygpIHtcbiAgICAvLyBVcGRhdGUgem9tYmllIHNlc3Npb25zIGZpcnN0IGFuZCBjbGVhbiB1cCBzb2NrZXQgY29ubmVjdGlvbnNcbiAgICBjb25zdCB6b21iaWVTZXNzaW9uSWRzID0gdGhpcy5zZXNzaW9uTWFuYWdlci51cGRhdGVab21iaWVTZXNzaW9ucygpO1xuICAgIGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIHpvbWJpZVNlc3Npb25JZHMpIHtcbiAgICAgIGNvbnN0IHNvY2tldCA9IHRoaXMuaW5wdXRTb2NrZXRDbGllbnRzLmdldChzZXNzaW9uSWQpO1xuICAgICAgaWYgKHNvY2tldCkge1xuICAgICAgICBzb2NrZXQuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLmlucHV0U29ja2V0Q2xpZW50cy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBHZXQgYWxsIHNlc3Npb25zIGZyb20gc3RvcmFnZVxuICAgIGNvbnN0IHNlc3Npb25zID0gdGhpcy5zZXNzaW9uTWFuYWdlci5saXN0U2Vzc2lvbnMoKTtcblxuICAgIC8vIEVuaGFuY2Ugd2l0aCBhY3Rpdml0eSBpbmZvcm1hdGlvblxuICAgIHJldHVybiBzZXNzaW9ucy5tYXAoKHNlc3Npb24pID0+IHtcbiAgICAgIC8vIEZpcnN0IHRyeSB0byBnZXQgYWN0aXZpdHkgZnJvbSBhY3RpdmUgc2Vzc2lvblxuICAgICAgY29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb24uaWQpO1xuXG4gICAgICAvLyBDaGVjayBmb3Igc29ja2V0LWJhc2VkIHN0YXR1cyB1cGRhdGVzIGZpcnN0XG4gICAgICBpZiAoYWN0aXZlU2Vzc2lvbj8uYWN0aXZpdHlTdGF0dXMpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5zZXNzaW9uLFxuICAgICAgICAgIGFjdGl2aXR5U3RhdHVzOiBhY3RpdmVTZXNzaW9uLmFjdGl2aXR5U3RhdHVzLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICAvLyBUaGVuIGNoZWNrIGFjdGl2aXR5IGRldGVjdG9yIGZvciBkeW5hbWljIG1vZGVcbiAgICAgIGlmIChhY3RpdmVTZXNzaW9uPy5hY3Rpdml0eURldGVjdG9yKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2aXR5U3RhdGUgPSBhY3RpdmVTZXNzaW9uLmFjdGl2aXR5RGV0ZWN0b3IuZ2V0QWN0aXZpdHlTdGF0ZSgpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLnNlc3Npb24sXG4gICAgICAgICAgYWN0aXZpdHlTdGF0dXM6IHtcbiAgICAgICAgICAgIGlzQWN0aXZlOiBhY3Rpdml0eVN0YXRlLmlzQWN0aXZlLFxuICAgICAgICAgICAgc3BlY2lmaWNTdGF0dXM6IGFjdGl2aXR5U3RhdGUuc3BlY2lmaWNTdGF0dXMsXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgLy8gT3RoZXJ3aXNlLCB0cnkgdG8gcmVhZCBmcm9tIGFjdGl2aXR5IGZpbGUgKGZvciBleHRlcm5hbCBzZXNzaW9ucylcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHNlc3Npb25QYXRocyA9IHRoaXMuc2Vzc2lvbk1hbmFnZXIuZ2V0U2Vzc2lvblBhdGhzKHNlc3Npb24uaWQpO1xuICAgICAgICBpZiAoIXNlc3Npb25QYXRocykge1xuICAgICAgICAgIHJldHVybiBzZXNzaW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYWN0aXZpdHlQYXRoID0gcGF0aC5qb2luKHNlc3Npb25QYXRocy5jb250cm9sRGlyLCAnY2xhdWRlLWFjdGl2aXR5Lmpzb24nKTtcblxuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhhY3Rpdml0eVBhdGgpKSB7XG4gICAgICAgICAgY29uc3QgYWN0aXZpdHlEYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoYWN0aXZpdHlQYXRoLCAndXRmLTgnKSk7XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgYWN0aXZpdHkgaXMgcmVjZW50ICh3aXRoaW4gbGFzdCA2MCBzZWNvbmRzKVxuICAgICAgICAgIC8vIFVzZSBNYXRoLmFicyB0byBoYW5kbGUgZnV0dXJlIHRpbWVzdGFtcHMgZnJvbSBzeXN0ZW0gY2xvY2sgaXNzdWVzXG4gICAgICAgICAgY29uc3QgdGltZURpZmYgPSBNYXRoLmFicyhEYXRlLm5vdygpIC0gbmV3IERhdGUoYWN0aXZpdHlEYXRhLnRpbWVzdGFtcCkuZ2V0VGltZSgpKTtcbiAgICAgICAgICBjb25zdCBpc1JlY2VudCA9IHRpbWVEaWZmIDwgNjAwMDA7XG5cbiAgICAgICAgICBpZiAoaXNSZWNlbnQpIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgRm91bmQgcmVjZW50IGFjdGl2aXR5IGZvciBleHRlcm5hbCBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwge1xuICAgICAgICAgICAgICBpc0FjdGl2ZTogYWN0aXZpdHlEYXRhLmlzQWN0aXZlLFxuICAgICAgICAgICAgICBzcGVjaWZpY1N0YXR1czogYWN0aXZpdHlEYXRhLnNwZWNpZmljU3RhdHVzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAuLi5zZXNzaW9uLFxuICAgICAgICAgICAgICBhY3Rpdml0eVN0YXR1czoge1xuICAgICAgICAgICAgICAgIGlzQWN0aXZlOiBhY3Rpdml0eURhdGEuaXNBY3RpdmUsXG4gICAgICAgICAgICAgICAgc3BlY2lmaWNTdGF0dXM6IGFjdGl2aXR5RGF0YS5zcGVjaWZpY1N0YXR1cyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgICAgYEFjdGl2aXR5IGZpbGUgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfSBpcyBzdGFsZSAodGltZSBkaWZmOiAke3RpbWVEaWZmfW1zKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE9ubHkgbG9nIG9uY2UgcGVyIHNlc3Npb24gdG8gYXZvaWQgc3BhbVxuICAgICAgICAgIGlmICghdGhpcy5hY3Rpdml0eUZpbGVXYXJuaW5nc0xvZ2dlZC5oYXMoc2Vzc2lvbi5pZCkpIHtcbiAgICAgICAgICAgIHRoaXMuYWN0aXZpdHlGaWxlV2FybmluZ3NMb2dnZWQuYWRkKHNlc3Npb24uaWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICBgTm8gY2xhdWRlLWFjdGl2aXR5Lmpzb24gZm91bmQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfSBhdCAke2FjdGl2aXR5UGF0aH1gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyByZWFkaW5nIGFjdGl2aXR5IGZpbGVcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBGYWlsZWQgdG8gcmVhZCBhY3Rpdml0eSBmaWxlIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gc2Vzc2lvbjtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYSBzcGVjaWZpYyBzZXNzaW9uXG4gICAqL1xuICBnZXRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogU2Vzc2lvbiB8IG51bGwge1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1B0eU1hbmFnZXJdIGdldFNlc3Npb24gY2FsbGVkIGZvciBzZXNzaW9uSWQ6ICR7c2Vzc2lvbklkfWApO1xuXG4gICAgY29uc3QgcGF0aHMgPSB0aGlzLnNlc3Npb25NYW5hZ2VyLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQsIHRydWUpO1xuICAgIGlmICghcGF0aHMpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1B0eU1hbmFnZXJdIE5vIHNlc3Npb24gcGF0aHMgZm91bmQgZm9yICR7c2Vzc2lvbklkfWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLnNlc3Npb25NYW5hZ2VyLmxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbkluZm8pIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1B0eU1hbmFnZXJdIE5vIHNlc3Npb24gaW5mbyBmb3VuZCBmb3IgJHtzZXNzaW9uSWR9YCk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgU2Vzc2lvbiBvYmplY3Qgd2l0aCB0aGUgaWQgZmllbGRcbiAgICBjb25zdCBzZXNzaW9uOiBTZXNzaW9uID0ge1xuICAgICAgLi4uc2Vzc2lvbkluZm8sXG4gICAgICBpZDogc2Vzc2lvbklkLCAvLyBFbnN1cmUgdGhlIGlkIGZpZWxkIGlzIHNldFxuICAgICAgbGFzdE1vZGlmaWVkOiBzZXNzaW9uSW5mby5zdGFydGVkQXQsXG4gICAgfTtcblxuICAgIGlmIChmcy5leGlzdHNTeW5jKHBhdGhzLnN0ZG91dFBhdGgpKSB7XG4gICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBmcy5zdGF0U3luYyhwYXRocy5zdGRvdXRQYXRoKS5tdGltZS50b0lTT1N0cmluZygpO1xuICAgICAgc2Vzc2lvbi5sYXN0TW9kaWZpZWQgPSBsYXN0TW9kaWZpZWQ7XG4gICAgfVxuXG4gICAgbG9nZ2VyLmRlYnVnKGBbUHR5TWFuYWdlcl0gRm91bmQgc2Vzc2lvbjogJHtKU09OLnN0cmluZ2lmeShzZXNzaW9uKX1gKTtcbiAgICByZXR1cm4gc2Vzc2lvbjtcbiAgfVxuXG4gIGdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnNlc3Npb25NYW5hZ2VyLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFudXAgYSBzcGVjaWZpYyBzZXNzaW9uXG4gICAqL1xuICBjbGVhbnVwU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIC8vIEtpbGwgYWN0aXZlIHNlc3Npb24gaWYgZXhpc3RzIChmaXJlLWFuZC1mb3JnZXQgZm9yIGNsZWFudXApXG4gICAgaWYgKHRoaXMuc2Vzc2lvbnMuaGFzKHNlc3Npb25JZCkpIHtcbiAgICAgIHRoaXMua2lsbFNlc3Npb24oc2Vzc2lvbklkKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8ga2lsbCBzZXNzaW9uICR7c2Vzc2lvbklkfSBkdXJpbmcgY2xlYW51cDpgLCBlcnJvcik7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgZnJvbSBzdG9yYWdlXG4gICAgdGhpcy5zZXNzaW9uTWFuYWdlci5jbGVhbnVwU2Vzc2lvbihzZXNzaW9uSWQpO1xuXG4gICAgLy8gQ2xlYW4gdXAgc29ja2V0IGNvbm5lY3Rpb24gaWYgYW55XG4gICAgY29uc3Qgc29ja2V0ID0gdGhpcy5pbnB1dFNvY2tldENsaWVudHMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKHNvY2tldCkge1xuICAgICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgIHRoaXMuaW5wdXRTb2NrZXRDbGllbnRzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbnVwIGFsbCBleGl0ZWQgc2Vzc2lvbnNcbiAgICovXG4gIGNsZWFudXBFeGl0ZWRTZXNzaW9ucygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIHRoaXMuc2Vzc2lvbk1hbmFnZXIuY2xlYW51cEV4aXRlZFNlc3Npb25zKCk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGVudmlyb25tZW50IHZhcmlhYmxlcyBmb3Igc2Vzc2lvbnNcbiAgICovXG4gIHByaXZhdGUgY3JlYXRlRW52VmFycyh0ZXJtOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcbiAgICBjb25zdCBlbnZWYXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgVEVSTTogdGVybSxcbiAgICB9O1xuXG4gICAgLy8gSW5jbHVkZSBvdGhlciBpbXBvcnRhbnQgdGVybWluYWwtcmVsYXRlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaWYgdGhleSBleGlzdFxuICAgIGNvbnN0IGltcG9ydGFudFZhcnMgPSBbJ1NIRUxMJywgJ0xBTkcnLCAnTENfQUxMJywgJ1BBVEgnLCAnVVNFUicsICdIT01FJ107XG4gICAgZm9yIChjb25zdCB2YXJOYW1lIG9mIGltcG9ydGFudFZhcnMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gcHJvY2Vzcy5lbnZbdmFyTmFtZV07XG4gICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgZW52VmFyc1t2YXJOYW1lXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBlbnZWYXJzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhY3RpdmUgc2Vzc2lvbiBjb3VudFxuICAgKi9cbiAgZ2V0QWN0aXZlU2Vzc2lvbkNvdW50KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuc2Vzc2lvbnMuc2l6ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBhIHNlc3Npb24gaXMgYWN0aXZlIChoYXMgcnVubmluZyBQVFkpXG4gICAqL1xuICBpc1Nlc3Npb25BY3RpdmUoc2Vzc2lvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zZXNzaW9ucy5oYXMoc2Vzc2lvbklkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaHV0ZG93biBhbGwgYWN0aXZlIHNlc3Npb25zIGFuZCBjbGVhbiB1cCByZXNvdXJjZXNcbiAgICovXG4gIGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgc2Vzc2lvbl0gb2YgQXJyYXkuZnJvbSh0aGlzLnNlc3Npb25zLmVudHJpZXMoKSkpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChzZXNzaW9uLnB0eVByb2Nlc3MpIHtcbiAgICAgICAgICBzZXNzaW9uLnB0eVByb2Nlc3Mua2lsbCgpO1xuXG4gICAgICAgICAgLy8gTm90ZTogV2Ugbm8gbG9uZ2VyIGtpbGwgdGhlIHByb2Nlc3MgZ3JvdXAgdG8gYXZvaWQgYWZmZWN0aW5nIG90aGVyIHNlc3Npb25zXG4gICAgICAgICAgLy8gdGhhdCBtaWdodCBzaGFyZSB0aGUgc2FtZSBwcm9jZXNzIGdyb3VwIChlLmcuLCBtdWx0aXBsZSBmd2QudHMgaW5zdGFuY2VzKVxuICAgICAgICAgIC8vIFRoZSBzaHV0ZG93bigpIG1ldGhvZCBpcyBvbmx5IGNhbGxlZCBkdXJpbmcgc2VydmVyIHNodXRkb3duIHdoZXJlIHdlIERPIHdhbnRcbiAgICAgICAgICAvLyB0byBjbGVhbiB1cCBhbGwgc2Vzc2lvbnMsIGJ1dCB3ZSBzdGlsbCBhdm9pZCBwcm9jZXNzIGdyb3VwIGtpbGxzIHRvIGJlIHNhZmVcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2Vzc2lvbi5hc2NpaW5lbWFXcml0ZXI/LmlzT3BlbigpKSB7XG4gICAgICAgICAgYXdhaXQgc2Vzc2lvbi5hc2NpaW5lbWFXcml0ZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDbGVhbiB1cCBhbGwgc2Vzc2lvbiByZXNvdXJjZXNcbiAgICAgICAgdGhpcy5jbGVhbnVwU2Vzc2lvblJlc291cmNlcyhzZXNzaW9uKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIGNsZWFudXAgc2Vzc2lvbiAke3Nlc3Npb25JZH0gZHVyaW5nIHNodXRkb3duOmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnNlc3Npb25zLmNsZWFyKCk7XG5cbiAgICAvLyBDbGVhbiB1cCBhbGwgc29ja2V0IGNsaWVudHNcbiAgICBmb3IgKGNvbnN0IFtfc2Vzc2lvbklkLCBzb2NrZXRdIG9mIHRoaXMuaW5wdXRTb2NrZXRDbGllbnRzLmVudHJpZXMoKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICAgIC8vIFNvY2tldCBhbHJlYWR5IGRlc3Ryb3llZFxuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmlucHV0U29ja2V0Q2xpZW50cy5jbGVhcigpO1xuXG4gICAgLy8gQ2xlYW4gdXAgcmVzaXplIGV2ZW50IGxpc3RlbmVyc1xuICAgIGZvciAoY29uc3QgcmVtb3ZlTGlzdGVuZXIgb2YgdGhpcy5yZXNpemVFdmVudExpc3RlbmVycykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXIoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHJlbW92ZSByZXNpemUgZXZlbnQgbGlzdGVuZXI6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnJlc2l6ZUV2ZW50TGlzdGVuZXJzLmxlbmd0aCA9IDA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHNlc3Npb24gbWFuYWdlciBpbnN0YW5jZVxuICAgKi9cbiAgZ2V0U2Vzc2lvbk1hbmFnZXIoKTogU2Vzc2lvbk1hbmFnZXIge1xuICAgIHJldHVybiB0aGlzLnNlc3Npb25NYW5hZ2VyO1xuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIGFjdGl2aXR5IHN0YXRlIG9ubHkgaWYgaXQgaGFzIGNoYW5nZWRcbiAgICovXG4gIHByaXZhdGUgd3JpdGVBY3Rpdml0eVN0YXRlKHNlc3Npb246IFB0eVNlc3Npb24sIGFjdGl2aXR5U3RhdGU6IEFjdGl2aXR5U3RhdGUpOiB2b2lkIHtcbiAgICBjb25zdCBhY3Rpdml0eVBhdGggPSBwYXRoLmpvaW4oc2Vzc2lvbi5jb250cm9sRGlyLCAnY2xhdWRlLWFjdGl2aXR5Lmpzb24nKTtcbiAgICBjb25zdCBhY3Rpdml0eURhdGEgPSB7XG4gICAgICBpc0FjdGl2ZTogYWN0aXZpdHlTdGF0ZS5pc0FjdGl2ZSxcbiAgICAgIHNwZWNpZmljU3RhdHVzOiBhY3Rpdml0eVN0YXRlLnNwZWNpZmljU3RhdHVzLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfTtcblxuICAgIGNvbnN0IHN0YXRlSnNvbiA9IEpTT04uc3RyaW5naWZ5KGFjdGl2aXR5RGF0YSk7XG4gICAgY29uc3QgbGFzdFN0YXRlID0gdGhpcy5sYXN0V3JpdHRlbkFjdGl2aXR5U3RhdGUuZ2V0KHNlc3Npb24uaWQpO1xuXG4gICAgaWYgKGxhc3RTdGF0ZSAhPT0gc3RhdGVKc29uKSB7XG4gICAgICB0cnkge1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKGFjdGl2aXR5UGF0aCwgSlNPTi5zdHJpbmdpZnkoYWN0aXZpdHlEYXRhLCBudWxsLCAyKSk7XG4gICAgICAgIHRoaXMubGFzdFdyaXR0ZW5BY3Rpdml0eVN0YXRlLnNldChzZXNzaW9uLmlkLCBzdGF0ZUpzb24pO1xuXG4gICAgICAgIC8vIERlYnVnIGxvZyBmaXJzdCB3cml0ZVxuICAgICAgICBpZiAoIXNlc3Npb24uYWN0aXZpdHlGaWxlV3JpdHRlbikge1xuICAgICAgICAgIHNlc3Npb24uYWN0aXZpdHlGaWxlV3JpdHRlbiA9IHRydWU7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBXcml0aW5nIGFjdGl2aXR5IHN0YXRlIHRvICR7YWN0aXZpdHlQYXRofSBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCwge1xuICAgICAgICAgICAgYWN0aXZpdHlTdGF0ZSxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogYWN0aXZpdHlEYXRhLnRpbWVzdGFtcCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gd3JpdGUgYWN0aXZpdHkgc3RhdGUgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTpgLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRyYWNrIGFuZCBlbWl0IGV2ZW50cyBmb3IgcHJvcGVyIGNsZWFudXBcbiAgICovXG4gIHByaXZhdGUgdHJhY2tBbmRFbWl0KGV2ZW50OiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcbiAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmxpc3RlbmVycyhldmVudCkgYXMgKCguLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpW107XG4gICAgaWYgKCF0aGlzLnNlc3Npb25FdmVudExpc3RlbmVycy5oYXMoc2Vzc2lvbklkKSkge1xuICAgICAgdGhpcy5zZXNzaW9uRXZlbnRMaXN0ZW5lcnMuc2V0KHNlc3Npb25JZCwgbmV3IFNldCgpKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvbkxpc3RlbmVycyA9IHRoaXMuc2Vzc2lvbkV2ZW50TGlzdGVuZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbkxpc3RlbmVycykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBsaXN0ZW5lcnMuZm9yRWFjaCgobGlzdGVuZXIpID0+IHNlc3Npb25MaXN0ZW5lcnMuYWRkKGxpc3RlbmVyKSk7XG4gICAgdGhpcy5lbWl0KGV2ZW50LCBzZXNzaW9uSWQsIC4uLmFyZ3MpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFuIHVwIGFsbCByZXNvdXJjZXMgYXNzb2NpYXRlZCB3aXRoIGEgc2Vzc2lvblxuICAgKi9cbiAgcHJpdmF0ZSBjbGVhbnVwU2Vzc2lvblJlc291cmNlcyhzZXNzaW9uOiBQdHlTZXNzaW9uKTogdm9pZCB7XG4gICAgLy8gQ2xlYW4gdXAgcmVzaXplIHRyYWNraW5nXG4gICAgdGhpcy5zZXNzaW9uUmVzaXplU291cmNlcy5kZWxldGUoc2Vzc2lvbi5pZCk7XG5cbiAgICAvLyBDbGVhbiB1cCB0aXRsZSB1cGRhdGUgaW50ZXJ2YWwgZm9yIGR5bmFtaWMgbW9kZVxuICAgIGlmIChzZXNzaW9uLnRpdGxlVXBkYXRlSW50ZXJ2YWwpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwoc2Vzc2lvbi50aXRsZVVwZGF0ZUludGVydmFsKTtcbiAgICAgIHNlc3Npb24udGl0bGVVcGRhdGVJbnRlcnZhbCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvLyBDbGVhbiB1cCBhY3Rpdml0eSBkZXRlY3RvclxuICAgIGlmIChzZXNzaW9uLmFjdGl2aXR5RGV0ZWN0b3IpIHtcbiAgICAgIHNlc3Npb24uYWN0aXZpdHlEZXRlY3Rvci5jbGVhclN0YXR1cygpO1xuICAgICAgc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIC8vIENsZWFuIHVwIHRpdGxlIGZpbHRlclxuICAgIGlmIChzZXNzaW9uLnRpdGxlRmlsdGVyKSB7XG4gICAgICAvLyBObyBuZWVkIHRvIHJlc2V0LCBqdXN0IHJlbW92ZSByZWZlcmVuY2VcbiAgICAgIHNlc3Npb24udGl0bGVGaWx0ZXIgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLy8gQ2xlYW4gdXAgc2Vzc2lvbi5qc29uIHdhdGNoZXIvaW50ZXJ2YWxcbiAgICBpZiAoc2Vzc2lvbi5zZXNzaW9uSnNvbldhdGNoZXIpIHtcbiAgICAgIHNlc3Npb24uc2Vzc2lvbkpzb25XYXRjaGVyLmNsb3NlKCk7XG4gICAgICBzZXNzaW9uLnNlc3Npb25Kc29uV2F0Y2hlciA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgaWYgKHNlc3Npb24uc2Vzc2lvbkpzb25JbnRlcnZhbCkge1xuICAgICAgY2xlYXJJbnRlcnZhbChzZXNzaW9uLnNlc3Npb25Kc29uSW50ZXJ2YWwpO1xuICAgICAgc2Vzc2lvbi5zZXNzaW9uSnNvbkludGVydmFsID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIC8vIENsZWFuIHVwIGNvbm5lY3RlZCBzb2NrZXQgY2xpZW50c1xuICAgIGlmIChzZXNzaW9uLmNvbm5lY3RlZENsaWVudHMpIHtcbiAgICAgIGZvciAoY29uc3QgY2xpZW50IG9mIHNlc3Npb24uY29ubmVjdGVkQ2xpZW50cykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNsaWVudC5kZXN0cm95KCk7XG4gICAgICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICAgICAgLy8gQ2xpZW50IGFscmVhZHkgZGVzdHJveWVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHNlc3Npb24uY29ubmVjdGVkQ2xpZW50cy5jbGVhcigpO1xuICAgIH1cblxuICAgIC8vIENsZWFuIHVwIGlucHV0IHNvY2tldCBzZXJ2ZXJcbiAgICBpZiAoc2Vzc2lvbi5pbnB1dFNvY2tldFNlcnZlcikge1xuICAgICAgLy8gQ2xvc2UgdGhlIHNlcnZlciBhbmQgd2FpdCBmb3IgaXQgdG8gY2xvc2VcbiAgICAgIHNlc3Npb24uaW5wdXRTb2NrZXRTZXJ2ZXIuY2xvc2UoKTtcbiAgICAgIC8vIFVucmVmIHRoZSBzZXJ2ZXIgc28gaXQgZG9lc24ndCBrZWVwIHRoZSBwcm9jZXNzIGFsaXZlXG4gICAgICBzZXNzaW9uLmlucHV0U29ja2V0U2VydmVyLnVucmVmKCk7XG4gICAgICB0cnkge1xuICAgICAgICBmcy51bmxpbmtTeW5jKHBhdGguam9pbihzZXNzaW9uLmNvbnRyb2xEaXIsICdpcGMuc29jaycpKTtcbiAgICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICAgIC8vIFNvY2tldCBhbHJlYWR5IHJlbW92ZWRcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBOb3RlOiBzdGRpbiBoYW5kbGluZyBpcyBkb25lIHZpYSBJUEMgc29ja2V0LCBubyBnbG9iYWwgbGlzdGVuZXJzIHRvIGNsZWFuIHVwXG5cbiAgICAvLyBSZW1vdmUgYWxsIGV2ZW50IGxpc3RlbmVycyBmb3IgdGhpcyBzZXNzaW9uXG4gICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5zZXNzaW9uRXZlbnRMaXN0ZW5lcnMuZ2V0KHNlc3Npb24uaWQpO1xuICAgIGlmIChsaXN0ZW5lcnMpIHtcbiAgICAgIGxpc3RlbmVycy5mb3JFYWNoKChsaXN0ZW5lcikgPT4ge1xuICAgICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKCdzZXNzaW9uTmFtZUNoYW5nZWQnLCBsaXN0ZW5lcik7XG4gICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ3dhdGNoZXJFcnJvcicsIGxpc3RlbmVyKTtcbiAgICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcignYmVsbCcsIGxpc3RlbmVyKTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5zZXNzaW9uRXZlbnRMaXN0ZW5lcnMuZGVsZXRlKHNlc3Npb24uaWQpO1xuICAgIH1cblxuICAgIC8vIENsZWFuIHVwIGFjdGl2aXR5IHN0YXRlIHRyYWNraW5nXG4gICAgdGhpcy5sYXN0V3JpdHRlbkFjdGl2aXR5U3RhdGUuZGVsZXRlKHNlc3Npb24uaWQpO1xuXG4gICAgLy8gQ2xlYW4gdXAgdGl0bGUgaW5qZWN0aW9uIHRpbWVyXG4gICAgaWYgKHNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lcikge1xuICAgICAgY2xlYXJJbnRlcnZhbChzZXNzaW9uLnRpdGxlSW5qZWN0aW9uVGltZXIpO1xuICAgICAgc2Vzc2lvbi50aXRsZUluamVjdGlvblRpbWVyID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBNYXJrIHNlc3Npb24gZm9yIHRpdGxlIHVwZGF0ZSBhbmQgdHJpZ2dlciBpbW1lZGlhdGUgY2hlY2tcbiAgICovXG4gIHByaXZhdGUgbWFya1RpdGxlVXBkYXRlTmVlZGVkKHNlc3Npb246IFB0eVNlc3Npb24pOiB2b2lkIHtcbiAgICBsb2dnZXIuZGVidWcoYFttYXJrVGl0bGVVcGRhdGVOZWVkZWRdIENhbGxlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCwge1xuICAgICAgdGl0bGVNb2RlOiBzZXNzaW9uLnRpdGxlTW9kZSxcbiAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUsXG4gICAgICB0aXRsZVVwZGF0ZU5lZWRlZDogc2Vzc2lvbi50aXRsZVVwZGF0ZU5lZWRlZCxcbiAgICB9KTtcblxuICAgIGlmICghc2Vzc2lvbi50aXRsZU1vZGUgfHwgc2Vzc2lvbi50aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5OT05FKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYFttYXJrVGl0bGVVcGRhdGVOZWVkZWRdIFNraXBwaW5nIC0gdGl0bGUgbW9kZSBpcyBOT05FIG9yIHVuZGVmaW5lZGApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNlc3Npb24udGl0bGVVcGRhdGVOZWVkZWQgPSB0cnVlO1xuICAgIGxvZ2dlci5kZWJ1ZyhgW21hcmtUaXRsZVVwZGF0ZU5lZWRlZF0gU2V0IHRpdGxlVXBkYXRlTmVlZGVkPXRydWUsIGNhbGxpbmcgY2hlY2tBbmRVcGRhdGVUaXRsZWApO1xuICAgIHRoaXMuY2hlY2tBbmRVcGRhdGVUaXRsZShzZXNzaW9uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgdGVybWluYWwgdGl0bGUgc3BlY2lmaWNhbGx5IGZvciBzZXNzaW9uIG5hbWUgY2hhbmdlc1xuICAgKiBUaGlzIGJ5cGFzc2VzIHRpdGxlIG1vZGUgY2hlY2tzIHRvIGVuc3VyZSBuYW1lIGNoYW5nZXMgYXJlIGFsd2F5cyByZWZsZWN0ZWRcbiAgICovXG4gIHByaXZhdGUgdXBkYXRlVGVybWluYWxUaXRsZUZvclNlc3Npb25OYW1lKHNlc3Npb246IFB0eVNlc3Npb24pOiB2b2lkIHtcbiAgICBpZiAoIXNlc3Npb24uc3Rkb3V0UXVldWUgfHwgIXNlc3Npb24uaXNFeHRlcm5hbFRlcm1pbmFsKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBbdXBkYXRlVGVybWluYWxUaXRsZUZvclNlc3Npb25OYW1lXSBFYXJseSByZXR1cm4gLSBubyBzdGRvdXQgcXVldWUgb3Igbm90IGV4dGVybmFsIHRlcm1pbmFsYFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBGb3IgTk9ORSBtb2RlLCBqdXN0IHVzZSB0aGUgc2Vzc2lvbiBuYW1lXG4gICAgLy8gRm9yIG90aGVyIG1vZGVzLCByZWdlbmVyYXRlIHRoZSB0aXRsZSB3aXRoIHRoZSBuZXcgbmFtZVxuICAgIGxldCBuZXdUaXRsZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAoXG4gICAgICAhc2Vzc2lvbi50aXRsZU1vZGUgfHxcbiAgICAgIHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuTk9ORSB8fFxuICAgICAgc2Vzc2lvbi50aXRsZU1vZGUgPT09IFRpdGxlTW9kZS5GSUxURVJcbiAgICApIHtcbiAgICAgIC8vIEluIE5PTkUgb3IgRklMVEVSIG1vZGUsIHVzZSBzaW1wbGUgc2Vzc2lvbiBuYW1lXG4gICAgICBuZXdUaXRsZSA9IGdlbmVyYXRlVGl0bGVTZXF1ZW5jZShcbiAgICAgICAgc2Vzc2lvbi5jdXJyZW50V29ya2luZ0RpciB8fCBzZXNzaW9uLnNlc3Npb25JbmZvLndvcmtpbmdEaXIsXG4gICAgICAgIHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZCxcbiAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lIHx8ICdWaWJlVHVubmVsJ1xuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRm9yIFNUQVRJQyBhbmQgRFlOQU1JQyBtb2RlcywgdXNlIHRoZSBzdGFuZGFyZCBnZW5lcmF0aW9uIGxvZ2ljXG4gICAgICBuZXdUaXRsZSA9IHRoaXMuZ2VuZXJhdGVUZXJtaW5hbFRpdGxlKHNlc3Npb24pO1xuICAgIH1cblxuICAgIGlmIChuZXdUaXRsZSAmJiBuZXdUaXRsZSAhPT0gc2Vzc2lvbi5jdXJyZW50VGl0bGUpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW3VwZGF0ZVRlcm1pbmFsVGl0bGVGb3JTZXNzaW9uTmFtZV0gVXBkYXRpbmcgdGl0bGUgZm9yIHNlc3Npb24gbmFtZSBjaGFuZ2VgKTtcbiAgICAgIHNlc3Npb24ucGVuZGluZ1RpdGxlVG9JbmplY3QgPSBuZXdUaXRsZTtcbiAgICAgIHNlc3Npb24udGl0bGVVcGRhdGVOZWVkZWQgPSB0cnVlO1xuXG4gICAgICAvLyBTdGFydCBpbmplY3Rpb24gbW9uaXRvciBpZiBub3QgYWxyZWFkeSBydW5uaW5nXG4gICAgICBpZiAoIXNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lcikge1xuICAgICAgICB0aGlzLnN0YXJ0VGl0bGVJbmplY3Rpb25Nb25pdG9yKHNlc3Npb24pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiB0aXRsZSBuZWVkcyB1cGRhdGluZyBhbmQgd3JpdGUgaWYgY2hhbmdlZFxuICAgKi9cbiAgcHJpdmF0ZSBjaGVja0FuZFVwZGF0ZVRpdGxlKHNlc3Npb246IFB0eVNlc3Npb24pOiB2b2lkIHtcbiAgICBsb2dnZXIuZGVidWcoYFtjaGVja0FuZFVwZGF0ZVRpdGxlXSBDYWxsZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfWAsIHtcbiAgICAgIHRpdGxlVXBkYXRlTmVlZGVkOiBzZXNzaW9uLnRpdGxlVXBkYXRlTmVlZGVkLFxuICAgICAgaGFzU3Rkb3V0UXVldWU6ICEhc2Vzc2lvbi5zdGRvdXRRdWV1ZSxcbiAgICAgIGlzRXh0ZXJuYWxUZXJtaW5hbDogc2Vzc2lvbi5pc0V4dGVybmFsVGVybWluYWwsXG4gICAgICBzZXNzaW9uTmFtZTogc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lLFxuICAgIH0pO1xuXG4gICAgaWYgKCFzZXNzaW9uLnRpdGxlVXBkYXRlTmVlZGVkIHx8ICFzZXNzaW9uLnN0ZG91dFF1ZXVlIHx8ICFzZXNzaW9uLmlzRXh0ZXJuYWxUZXJtaW5hbCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbY2hlY2tBbmRVcGRhdGVUaXRsZV0gRWFybHkgcmV0dXJuIC0gY29uZGl0aW9ucyBub3QgbWV0YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgbmV3IHRpdGxlXG4gICAgbG9nZ2VyLmRlYnVnKGBbY2hlY2tBbmRVcGRhdGVUaXRsZV0gR2VuZXJhdGluZyBuZXcgdGl0bGUuLi5gKTtcbiAgICBjb25zdCBuZXdUaXRsZSA9IHRoaXMuZ2VuZXJhdGVUZXJtaW5hbFRpdGxlKHNlc3Npb24pO1xuXG4gICAgLy8gRGVidWcgbG9nZ2luZyBmb3IgdGl0bGUgdXBkYXRlc1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1RpdGxlIFVwZGF0ZV0gU2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIHtcbiAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUsXG4gICAgICBuZXdUaXRsZTogbmV3VGl0bGUgPyBgJHtuZXdUaXRsZS5zdWJzdHJpbmcoMCwgNTApfS4uLmAgOiBudWxsLFxuICAgICAgY3VycmVudFRpdGxlOiBzZXNzaW9uLmN1cnJlbnRUaXRsZSA/IGAke3Nlc3Npb24uY3VycmVudFRpdGxlLnN1YnN0cmluZygwLCA1MCl9Li4uYCA6IG51bGwsXG4gICAgICB0aXRsZUNoYW5nZWQ6IG5ld1RpdGxlICE9PSBzZXNzaW9uLmN1cnJlbnRUaXRsZSxcbiAgICB9KTtcblxuICAgIC8vIE9ubHkgcHJvY2VlZCBpZiB0aXRsZSBjaGFuZ2VkXG4gICAgaWYgKG5ld1RpdGxlICYmIG5ld1RpdGxlICE9PSBzZXNzaW9uLmN1cnJlbnRUaXRsZSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbY2hlY2tBbmRVcGRhdGVUaXRsZV0gVGl0bGUgY2hhbmdlZCwgcXVldWVpbmcgZm9yIGluamVjdGlvbmApO1xuICAgICAgLy8gU3RvcmUgcGVuZGluZyB0aXRsZVxuICAgICAgc2Vzc2lvbi5wZW5kaW5nVGl0bGVUb0luamVjdCA9IG5ld1RpdGxlO1xuXG4gICAgICAvLyBTdGFydCBpbmplY3Rpb24gbW9uaXRvciBpZiBub3QgYWxyZWFkeSBydW5uaW5nXG4gICAgICBpZiAoIXNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lcikge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFtjaGVja0FuZFVwZGF0ZVRpdGxlXSBTdGFydGluZyB0aXRsZSBpbmplY3Rpb24gbW9uaXRvcmApO1xuICAgICAgICB0aGlzLnN0YXJ0VGl0bGVJbmplY3Rpb25Nb25pdG9yKHNlc3Npb24pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIuZGVidWcoYFtjaGVja0FuZFVwZGF0ZVRpdGxlXSBUaXRsZSB1bmNoYW5nZWQgb3IgbnVsbCwgc2tpcHBpbmcgaW5qZWN0aW9uYCwge1xuICAgICAgICBuZXdUaXRsZU51bGw6ICFuZXdUaXRsZSxcbiAgICAgICAgdGl0bGVzRXF1YWw6IG5ld1RpdGxlID09PSBzZXNzaW9uLmN1cnJlbnRUaXRsZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENsZWFyIGZsYWdcbiAgICBzZXNzaW9uLnRpdGxlVXBkYXRlTmVlZGVkID0gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogTW9uaXRvciBmb3IgcXVpZXQgcGVyaW9kIHRvIHNhZmVseSBpbmplY3QgdGl0bGVcbiAgICovXG4gIHByaXZhdGUgc3RhcnRUaXRsZUluamVjdGlvbk1vbml0b3Ioc2Vzc2lvbjogUHR5U2Vzc2lvbik6IHZvaWQge1xuICAgIC8vIFJ1biBwZXJpb2RpY2FsbHkgdG8gZmluZCBxdWlldCBwZXJpb2RcbiAgICBzZXNzaW9uLnRpdGxlSW5qZWN0aW9uVGltZXIgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICBpZiAoIXNlc3Npb24ucGVuZGluZ1RpdGxlVG9JbmplY3QgfHwgIXNlc3Npb24uc3Rkb3V0UXVldWUpIHtcbiAgICAgICAgLy8gTm8gdGl0bGUgdG8gaW5qZWN0IG9yIHNlc3Npb24gZW5kZWQsIHN0b3AgbW9uaXRvclxuICAgICAgICBpZiAoc2Vzc2lvbi50aXRsZUluamVjdGlvblRpbWVyKSB7XG4gICAgICAgICAgY2xlYXJJbnRlcnZhbChzZXNzaW9uLnRpdGxlSW5qZWN0aW9uVGltZXIpO1xuICAgICAgICAgIHNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgICBjb25zdCB0aW1lU2luY2VMYXN0V3JpdGUgPSBub3cgLSAoc2Vzc2lvbi5sYXN0V3JpdGVUaW1lc3RhbXAgfHwgMCk7XG5cbiAgICAgIC8vIENoZWNrIGZvciBxdWlldCBwZXJpb2QgYW5kIG5vdCBhbHJlYWR5IGluamVjdGluZ1xuICAgICAgaWYgKFxuICAgICAgICB0aW1lU2luY2VMYXN0V3JpdGUgPj0gVElUTEVfSU5KRUNUSU9OX1FVSUVUX1BFUklPRF9NUyAmJlxuICAgICAgICAhc2Vzc2lvbi50aXRsZUluamVjdGlvbkluUHJvZ3Jlc3NcbiAgICAgICkge1xuICAgICAgICAvLyBTYWZlIHRvIGluamVjdCB0aXRsZSAtIGNhcHR1cmUgdGhlIHRpdGxlIGJlZm9yZSBjbGVhcmluZyBpdFxuICAgICAgICBjb25zdCB0aXRsZVRvSW5qZWN0ID0gc2Vzc2lvbi5wZW5kaW5nVGl0bGVUb0luamVjdDtcbiAgICAgICAgaWYgKCF0aXRsZVRvSW5qZWN0KSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFyayBpbmplY3Rpb24gYXMgaW4gcHJvZ3Jlc3NcbiAgICAgICAgc2Vzc2lvbi50aXRsZUluamVjdGlvbkluUHJvZ3Jlc3MgPSB0cnVlO1xuXG4gICAgICAgIC8vIFVwZGF0ZSB0aW1lc3RhbXAgaW1tZWRpYXRlbHkgdG8gcHJldmVudCBxdWlldCBwZXJpb2QgdmlvbGF0aW9uc1xuICAgICAgICBzZXNzaW9uLmxhc3RXcml0ZVRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cbiAgICAgICAgc2Vzc2lvbi5zdGRvdXRRdWV1ZS5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBbVGl0bGUgSW5qZWN0aW9uXSBXcml0aW5nIHRpdGxlIHRvIHN0ZG91dCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIHtcbiAgICAgICAgICAgICAgdGl0bGU6IGAke3RpdGxlVG9JbmplY3Quc3Vic3RyaW5nKDAsIDUwKX0uLi5gLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGNhbldyaXRlID0gcHJvY2Vzcy5zdGRvdXQud3JpdGUodGl0bGVUb0luamVjdCk7XG5cbiAgICAgICAgICAgIGlmICghY2FuV3JpdGUpIHtcbiAgICAgICAgICAgICAgYXdhaXQgb25jZShwcm9jZXNzLnN0ZG91dCwgJ2RyYWluJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFVwZGF0ZSB0cmFja2luZyBhZnRlciBzdWNjZXNzZnVsIHdyaXRlXG4gICAgICAgICAgICBzZXNzaW9uLmN1cnJlbnRUaXRsZSA9IHRpdGxlVG9JbmplY3Q7XG5cbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgW1RpdGxlIEluamVjdGlvbl0gU3VjY2Vzc2Z1bGx5IGluamVjdGVkIHRpdGxlIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH1gKTtcblxuICAgICAgICAgICAgLy8gQ2xlYXIgcGVuZGluZyB0aXRsZSBvbmx5IGFmdGVyIHN1Y2Nlc3NmdWwgd3JpdGVcbiAgICAgICAgICAgIGlmIChzZXNzaW9uLnBlbmRpbmdUaXRsZVRvSW5qZWN0ID09PSB0aXRsZVRvSW5qZWN0KSB7XG4gICAgICAgICAgICAgIHNlc3Npb24ucGVuZGluZ1RpdGxlVG9JbmplY3QgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIElmIG5vIG1vcmUgdGl0bGVzIHBlbmRpbmcsIHN0b3AgbW9uaXRvclxuICAgICAgICAgICAgaWYgKCFzZXNzaW9uLnBlbmRpbmdUaXRsZVRvSW5qZWN0ICYmIHNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lcikge1xuICAgICAgICAgICAgICBjbGVhckludGVydmFsKHNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lcik7XG4gICAgICAgICAgICAgIHNlc3Npb24udGl0bGVJbmplY3Rpb25UaW1lciA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgLy8gQWx3YXlzIGNsZWFyIHRoZSBpbi1wcm9ncmVzcyBmbGFnXG4gICAgICAgICAgICBzZXNzaW9uLnRpdGxlSW5qZWN0aW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBJbmplY3RlZCB0aXRsZSBkdXJpbmcgcXVpZXQgcGVyaW9kICgke3RpbWVTaW5jZUxhc3RXcml0ZX1tcykgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9LCBUSVRMRV9JTkpFQ1RJT05fQ0hFQ0tfSU5URVJWQUxfTVMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHRlcm1pbmFsIHRpdGxlIGJhc2VkIG9uIHNlc3Npb24gbW9kZSBhbmQgc3RhdGVcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVUZXJtaW5hbFRpdGxlKHNlc3Npb246IFB0eVNlc3Npb24pOiBzdHJpbmcgfCBudWxsIHtcbiAgICBpZiAoIXNlc3Npb24udGl0bGVNb2RlIHx8IHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuTk9ORSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgY29uc3QgY3VycmVudERpciA9IHNlc3Npb24uY3VycmVudFdvcmtpbmdEaXIgfHwgc2Vzc2lvbi5zZXNzaW9uSW5mby53b3JraW5nRGlyO1xuXG4gICAgbG9nZ2VyLmRlYnVnKGBbZ2VuZXJhdGVUZXJtaW5hbFRpdGxlXSBTZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwge1xuICAgICAgdGl0bGVNb2RlOiBzZXNzaW9uLnRpdGxlTW9kZSxcbiAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLnNlc3Npb25JbmZvLm5hbWUsXG4gICAgICBzZXNzaW9uSW5mb09iamVjdElkOiBzZXNzaW9uLnNlc3Npb25JbmZvLFxuICAgICAgY3VycmVudERpcixcbiAgICAgIGNvbW1hbmQ6IHNlc3Npb24uc2Vzc2lvbkluZm8uY29tbWFuZCxcbiAgICAgIGFjdGl2aXR5RGV0ZWN0b3JFeGlzdHM6ICEhc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yLFxuICAgIH0pO1xuXG4gICAgaWYgKHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuU1RBVElDKSB7XG4gICAgICByZXR1cm4gZ2VuZXJhdGVUaXRsZVNlcXVlbmNlKFxuICAgICAgICBjdXJyZW50RGlyLFxuICAgICAgICBzZXNzaW9uLnNlc3Npb25JbmZvLmNvbW1hbmQsXG4gICAgICAgIHNlc3Npb24uc2Vzc2lvbkluZm8ubmFtZVxuICAgICAgKTtcbiAgICB9IGVsc2UgaWYgKHNlc3Npb24udGl0bGVNb2RlID09PSBUaXRsZU1vZGUuRFlOQU1JQyAmJiBzZXNzaW9uLmFjdGl2aXR5RGV0ZWN0b3IpIHtcbiAgICAgIGNvbnN0IGFjdGl2aXR5ID0gc2Vzc2lvbi5hY3Rpdml0eURldGVjdG9yLmdldEFjdGl2aXR5U3RhdGUoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW2dlbmVyYXRlVGVybWluYWxUaXRsZV0gQ2FsbGluZyBnZW5lcmF0ZUR5bmFtaWNUaXRsZSB3aXRoOmAsIHtcbiAgICAgICAgY3VycmVudERpcixcbiAgICAgICAgY29tbWFuZDogc2Vzc2lvbi5zZXNzaW9uSW5mby5jb21tYW5kLFxuICAgICAgICBzZXNzaW9uTmFtZTogc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lLFxuICAgICAgICBhY3Rpdml0eTogYWN0aXZpdHksXG4gICAgICB9KTtcbiAgICAgIHJldHVybiBnZW5lcmF0ZUR5bmFtaWNUaXRsZShcbiAgICAgICAgY3VycmVudERpcixcbiAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5jb21tYW5kLFxuICAgICAgICBhY3Rpdml0eSxcbiAgICAgICAgc2Vzc2lvbi5zZXNzaW9uSW5mby5uYW1lLFxuICAgICAgICBzZXNzaW9uLnNlc3Npb25JbmZvLmdpdFJlcG9QYXRoLFxuICAgICAgICB1bmRlZmluZWQgLy8gR2l0IGJyYW5jaCB3aWxsIGJlIGZldGNoZWQgZHluYW1pY2FsbHkgd2hlbiBuZWVkZWRcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgdHJhY2tpbmcgZm9yZWdyb3VuZCBwcm9jZXNzIGZvciBjb21tYW5kIGNvbXBsZXRpb24gbm90aWZpY2F0aW9uc1xuICAgKi9cbiAgcHJpdmF0ZSBzdGFydEZvcmVncm91bmRQcm9jZXNzVHJhY2tpbmcoc2Vzc2lvbjogUHR5U2Vzc2lvbik6IHZvaWQge1xuICAgIGlmICghc2Vzc2lvbi5wdHlQcm9jZXNzKSByZXR1cm47XG5cbiAgICBsb2dnZXIuZGVidWcoYFN0YXJ0aW5nIGZvcmVncm91bmQgcHJvY2VzcyB0cmFja2luZyBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCk7XG4gICAgY29uc3QgcHR5UGlkID0gc2Vzc2lvbi5wdHlQcm9jZXNzLnBpZDtcblxuICAgIC8vIEdldCB0aGUgc2hlbGwncyBwcm9jZXNzIGdyb3VwIElEIChwZ2lkKVxuICAgIHRoaXMuZ2V0UHJvY2Vzc1BnaWQocHR5UGlkKVxuICAgICAgLnRoZW4oKHNoZWxsUGdpZCkgPT4ge1xuICAgICAgICBpZiAoc2hlbGxQZ2lkKSB7XG4gICAgICAgICAgc2Vzc2lvbi5zaGVsbFBnaWQgPSBzaGVsbFBnaWQ7XG4gICAgICAgICAgc2Vzc2lvbi5jdXJyZW50Rm9yZWdyb3VuZFBnaWQgPSBzaGVsbFBnaWQ7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oXG4gICAgICAgICAgICBg8J+UlCBOT1RJRklDQVRJT04gREVCVUc6IFN0YXJ0aW5nIGNvbW1hbmQgdHJhY2tpbmcgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfSAtIHNoZWxsUGdpZDogJHtzaGVsbFBnaWR9LCBwb2xsaW5nIGV2ZXJ5ICR7UFJPQ0VTU19QT0xMX0lOVEVSVkFMX01TfW1zYFxuICAgICAgICAgICk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IFNoZWxsIFBHSUQgaXMgJHtzaGVsbFBnaWR9LCBzdGFydGluZyBwb2xsaW5nYCk7XG5cbiAgICAgICAgICAvLyBTdGFydCBwb2xsaW5nIGZvciBmb3JlZ3JvdW5kIHByb2Nlc3MgY2hhbmdlc1xuICAgICAgICAgIHNlc3Npb24ucHJvY2Vzc1BvbGxpbmdJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2hlY2tGb3JlZ3JvdW5kUHJvY2VzcyhzZXNzaW9uKTtcbiAgICAgICAgICB9LCBQUk9DRVNTX1BPTExfSU5URVJWQUxfTVMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci53YXJuKGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENvdWxkIG5vdCBnZXQgc2hlbGwgUEdJRGApO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byBnZXQgc2hlbGwgUEdJRCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGVycik7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcHJvY2VzcyBncm91cCBJRCBmb3IgYSBwcm9jZXNzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdldFByb2Nlc3NQZ2lkKHBpZDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCB0aGlzLmV4ZWNBc3luYyhgcHMgLW8gcGdpZD0gLXAgJHtwaWR9YCwgeyB0aW1lb3V0OiAxMDAwIH0pO1xuICAgICAgY29uc3QgcGdpZCA9IE51bWJlci5wYXJzZUludChzdGRvdXQudHJpbSgpLCAxMCk7XG4gICAgICByZXR1cm4gTnVtYmVyLmlzTmFOKHBnaWQpID8gbnVsbCA6IHBnaWQ7XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBmb3JlZ3JvdW5kIHByb2Nlc3MgZ3JvdXAgb2YgYSB0ZXJtaW5hbFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRUZXJtaW5hbEZvcmVncm91bmRQZ2lkKHNlc3Npb246IFB0eVNlc3Npb24pOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICBpZiAoIXNlc3Npb24ucHR5UHJvY2VzcykgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgLy8gT24gVW5peC1saWtlIHN5c3RlbXMsIHdlIGNhbiBjaGVjayB0aGUgdGVybWluYWwncyBmb3JlZ3JvdW5kIHByb2Nlc3MgZ3JvdXBcbiAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9FeHBsaWNpdEFueTogQWNjZXNzaW5nIGludGVybmFsIG5vZGUtcHR5IHByb3BlcnR5XG4gICAgICBjb25zdCB0dHlOYW1lID0gKHNlc3Npb24ucHR5UHJvY2VzcyBhcyBhbnkpLl9wdHk7IC8vIEludGVybmFsIFBUWSBuYW1lXG4gICAgICBpZiAoIXR0eU5hbWUpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IE5vIFRUWSBuYW1lIGZvdW5kLCBmYWxsaW5nIGJhY2sgdG8gcHJvY2VzcyB0cmVlYCk7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEZvcmVncm91bmRGcm9tUHJvY2Vzc1RyZWUoc2Vzc2lvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIFVzZSBwcyB0byBmaW5kIHByb2Nlc3NlcyBhc3NvY2lhdGVkIHdpdGggdGhpcyB0ZXJtaW5hbFxuICAgICAgY29uc3QgcHNDb21tYW5kID0gYHBzIC10ICR7dHR5TmFtZX0gLW8gcGdpZCxwaWQscHBpZCxjb21tYW5kIHwgZ3JlcCAtdiBQR0lEIHwgaGVhZCAtMWA7XG4gICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgdGhpcy5leGVjQXN5bmMocHNDb21tYW5kLCB7IHRpbWVvdXQ6IDEwMDAgfSk7XG5cbiAgICAgIGNvbnN0IGxpbmVzID0gc3Rkb3V0LnRyaW0oKS5zcGxpdCgnXFxuJyk7XG4gICAgICBpZiAobGluZXMubGVuZ3RoID4gMCAmJiBsaW5lc1swXS50cmltKCkpIHtcbiAgICAgICAgY29uc3QgcGFydHMgPSBsaW5lc1swXS50cmltKCkuc3BsaXQoL1xccysvKTtcbiAgICAgICAgY29uc3QgcGdpZCA9IE51bWJlci5wYXJzZUludChwYXJ0c1swXSwgMTApO1xuXG4gICAgICAgIC8vIExvZyB0aGUgcmF3IHBzIG91dHB1dCBmb3IgZGVidWdnaW5nXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgU2Vzc2lvbiAke3Nlc3Npb24uaWR9OiBwcyBvdXRwdXQgZm9yIFRUWSAke3R0eU5hbWV9OiBcIiR7bGluZXNbMF0udHJpbSgpfVwiYCk7XG5cbiAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGdpZCkpIHtcbiAgICAgICAgICByZXR1cm4gcGdpZDtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogQ291bGQgbm90IHBhcnNlIFBHSUQgZnJvbSBwcyBvdXRwdXQsIGZhbGxpbmcgYmFja2ApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogRXJyb3IgZ2V0dGluZyB0ZXJtaW5hbCBQR0lEOiAke2Vycm9yfSwgZmFsbGluZyBiYWNrYCk7XG4gICAgICAvLyBGYWxsYmFjazogdHJ5IHRvIGdldCBmb3JlZ3JvdW5kIHByb2Nlc3MgZnJvbSBwcm9jZXNzIHRyZWVcbiAgICAgIHJldHVybiB0aGlzLmdldEZvcmVncm91bmRGcm9tUHJvY2Vzc1RyZWUoc2Vzc2lvbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGZvcmVncm91bmQgcHJvY2VzcyBmcm9tIHByb2Nlc3MgdHJlZSBhbmFseXNpc1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZXRGb3JlZ3JvdW5kRnJvbVByb2Nlc3NUcmVlKHNlc3Npb246IFB0eVNlc3Npb24pOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICBpZiAoIXNlc3Npb24ucHR5UHJvY2VzcykgcmV0dXJuIG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcHJvY2Vzc1RyZWUgPSBhd2FpdCB0aGlzLnByb2Nlc3NUcmVlQW5hbHl6ZXIuZ2V0UHJvY2Vzc1RyZWUoc2Vzc2lvbi5wdHlQcm9jZXNzLnBpZCk7XG5cbiAgICAgIC8vIEZpbmQgdGhlIG1vc3QgcmVjZW50IG5vbi1zaGVsbCBwcm9jZXNzXG4gICAgICBmb3IgKGNvbnN0IHByb2Mgb2YgcHJvY2Vzc1RyZWUpIHtcbiAgICAgICAgaWYgKHByb2MucGdpZCAhPT0gc2Vzc2lvbi5zaGVsbFBnaWQgJiYgcHJvYy5jb21tYW5kICYmICF0aGlzLmlzU2hlbGxQcm9jZXNzKHByb2MuY29tbWFuZCkpIHtcbiAgICAgICAgICByZXR1cm4gcHJvYy5wZ2lkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgRmFpbGVkIHRvIGFuYWx5emUgcHJvY2VzcyB0cmVlIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpO1xuICAgIH1cblxuICAgIHJldHVybiBzZXNzaW9uLnNoZWxsUGdpZCB8fCBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgY29tbWFuZCBpcyBhIHNoZWxsIHByb2Nlc3NcbiAgICovXG4gIHByaXZhdGUgaXNTaGVsbFByb2Nlc3MoY29tbWFuZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3Qgc2hlbGxOYW1lcyA9IFsnYmFzaCcsICd6c2gnLCAnZmlzaCcsICdzaCcsICdkYXNoJywgJ3Rjc2gnLCAnY3NoJ107XG4gICAgY29uc3QgY21kTG93ZXIgPSBjb21tYW5kLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIHNoZWxsTmFtZXMuc29tZSgoc2hlbGwpID0+IGNtZExvd2VyLmluY2x1ZGVzKHNoZWxsKSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgY3VycmVudCBmb3JlZ3JvdW5kIHByb2Nlc3MgYW5kIGRldGVjdCBjaGFuZ2VzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGNoZWNrRm9yZWdyb3VuZFByb2Nlc3Moc2Vzc2lvbjogUHR5U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghc2Vzc2lvbi5wdHlQcm9jZXNzIHx8ICFzZXNzaW9uLnNoZWxsUGdpZCkgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRQZ2lkID0gYXdhaXQgdGhpcy5nZXRUZXJtaW5hbEZvcmVncm91bmRQZ2lkKHNlc3Npb24pO1xuXG4gICAgICAvLyBFbmhhbmNlZCBkZWJ1ZyBsb2dnaW5nXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGNoYWxrLmdyYXkoXG4gICAgICAgICAgYFske3RpbWVzdGFtcH1dIFNlc3Npb24gJHtzZXNzaW9uLmlkfSBQR0lEIGNoZWNrOiBjdXJyZW50PSR7Y3VycmVudFBnaWR9LCBwcmV2aW91cz0ke3Nlc3Npb24uY3VycmVudEZvcmVncm91bmRQZ2lkfSwgc2hlbGw9JHtzZXNzaW9uLnNoZWxsUGdpZH1gXG4gICAgICAgIClcbiAgICAgICk7XG5cbiAgICAgIC8vIEFkZCBkZWJ1ZyBsb2dnaW5nXG4gICAgICBpZiAoY3VycmVudFBnaWQgIT09IHNlc3Npb24uY3VycmVudEZvcmVncm91bmRQZ2lkKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKFxuICAgICAgICAgIGDwn5SUIE5PVElGSUNBVElPTiBERUJVRzogUEdJRCBjaGFuZ2UgZGV0ZWN0ZWQgLSBzZXNzaW9uSWQ6ICR7c2Vzc2lvbi5pZH0sIGZyb20gJHtzZXNzaW9uLmN1cnJlbnRGb3JlZ3JvdW5kUGdpZH0gdG8gJHtjdXJyZW50UGdpZH0sIHNoZWxsUGdpZDogJHtzZXNzaW9uLnNoZWxsUGdpZH1gXG4gICAgICAgICk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgICBgU2Vzc2lvbiAke3Nlc3Npb24uaWR9OiBGb3JlZ3JvdW5kIFBHSUQgY2hhbmdlZCBmcm9tICR7c2Vzc2lvbi5jdXJyZW50Rm9yZWdyb3VuZFBnaWR9IHRvICR7Y3VycmVudFBnaWR9YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGN1cnJlbnRQZ2lkICYmIGN1cnJlbnRQZ2lkICE9PSBzZXNzaW9uLmN1cnJlbnRGb3JlZ3JvdW5kUGdpZCkge1xuICAgICAgICAvLyBGb3JlZ3JvdW5kIHByb2Nlc3MgY2hhbmdlZFxuICAgICAgICBjb25zdCBwcmV2aW91c1BnaWQgPSBzZXNzaW9uLmN1cnJlbnRGb3JlZ3JvdW5kUGdpZDtcbiAgICAgICAgc2Vzc2lvbi5jdXJyZW50Rm9yZWdyb3VuZFBnaWQgPSBjdXJyZW50UGdpZDtcblxuICAgICAgICBpZiAoY3VycmVudFBnaWQgPT09IHNlc3Npb24uc2hlbGxQZ2lkICYmIHByZXZpb3VzUGdpZCAhPT0gc2Vzc2lvbi5zaGVsbFBnaWQpIHtcbiAgICAgICAgICAvLyBBIGNvbW1hbmQganVzdCBmaW5pc2hlZCAocmV0dXJuZWQgdG8gc2hlbGwpXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgY2hhbGsuZ3JlZW4oXG4gICAgICAgICAgICAgIGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENvbW1hbmQgZmluaXNoZWQsIHJldHVybmluZyB0byBzaGVsbCAoUEdJRCAke3ByZXZpb3VzUGdpZH0g4oaSICR7Y3VycmVudFBnaWR9KWBcbiAgICAgICAgICAgIClcbiAgICAgICAgICApO1xuICAgICAgICAgIGF3YWl0IHRoaXMuaGFuZGxlQ29tbWFuZEZpbmlzaGVkKHNlc3Npb24sIHByZXZpb3VzUGdpZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoY3VycmVudFBnaWQgIT09IHNlc3Npb24uc2hlbGxQZ2lkKSB7XG4gICAgICAgICAgLy8gQSBuZXcgY29tbWFuZCBzdGFydGVkXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgY2hhbGsuYmx1ZShgU2Vzc2lvbiAke3Nlc3Npb24uaWR9OiBOZXcgY29tbWFuZCBzdGFydGVkIChQR0lEICR7Y3VycmVudFBnaWR9KWApXG4gICAgICAgICAgKTtcbiAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUNvbW1hbmRTdGFydGVkKHNlc3Npb24sIGN1cnJlbnRQZ2lkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYEVycm9yIGNoZWNraW5nIGZvcmVncm91bmQgcHJvY2VzcyBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIHdoZW4gYSBuZXcgY29tbWFuZCBzdGFydHNcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29tbWFuZFN0YXJ0ZWQoc2Vzc2lvbjogUHR5U2Vzc2lvbiwgcGdpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCBjb21tYW5kIGluZm8gZnJvbSBwcm9jZXNzIHRyZWVcbiAgICAgIGlmICghc2Vzc2lvbi5wdHlQcm9jZXNzKSByZXR1cm47XG4gICAgICBjb25zdCBwcm9jZXNzVHJlZSA9IGF3YWl0IHRoaXMucHJvY2Vzc1RyZWVBbmFseXplci5nZXRQcm9jZXNzVHJlZShzZXNzaW9uLnB0eVByb2Nlc3MucGlkKTtcbiAgICAgIGNvbnN0IGNvbW1hbmRQcm9jID0gcHJvY2Vzc1RyZWUuZmluZCgocCkgPT4gcC5wZ2lkID09PSBwZ2lkKTtcblxuICAgICAgaWYgKGNvbW1hbmRQcm9jKSB7XG4gICAgICAgIHNlc3Npb24uY3VycmVudENvbW1hbmQgPSBjb21tYW5kUHJvYy5jb21tYW5kO1xuICAgICAgICBzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBTZXNzaW9uTW9uaXRvciB3aXRoIG5ldyBjb21tYW5kXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb25Nb25pdG9yKSB7XG4gICAgICAgICAgdGhpcy5zZXNzaW9uTW9uaXRvci51cGRhdGVDb21tYW5kKHNlc3Npb24uaWQsIGNvbW1hbmRQcm9jLmNvbW1hbmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU3BlY2lhbCBsb2dnaW5nIGZvciBDbGF1ZGUgY29tbWFuZHNcbiAgICAgICAgY29uc3QgaXNDbGF1ZGVDb21tYW5kID0gY29tbWFuZFByb2MuY29tbWFuZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbGF1ZGUnKTtcbiAgICAgICAgaWYgKGlzQ2xhdWRlQ29tbWFuZCkge1xuICAgICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgICBjaGFsay5jeWFuKFxuICAgICAgICAgICAgICBg8J+kliBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENsYXVkZSBjb21tYW5kIHN0YXJ0ZWQ6IFwiJHtjb21tYW5kUHJvYy5jb21tYW5kfVwiIChQR0lEOiAke3BnaWR9KWBcbiAgICAgICAgICAgIClcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENvbW1hbmQgc3RhcnRlZDogXCIke2NvbW1hbmRQcm9jLmNvbW1hbmR9XCIgKFBHSUQ6ICR7cGdpZH0pYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBMb2cgcHJvY2VzcyB0cmVlIGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBQcm9jZXNzIHRyZWUgZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTpgLFxuICAgICAgICAgIHByb2Nlc3NUcmVlLm1hcCgocCkgPT4gYCAgUElEOiAke3AucGlkfSwgUEdJRDogJHtwLnBnaWR9LCBDTUQ6ICR7cC5jb21tYW5kfWApLmpvaW4oJ1xcbicpXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBjaGFsay55ZWxsb3coYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogQ291bGQgbm90IGZpbmQgcHJvY2VzcyBpbmZvIGZvciBQR0lEICR7cGdpZH1gKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYEZhaWxlZCB0byBnZXQgY29tbWFuZCBpbmZvIGZvciBzZXNzaW9uICR7c2Vzc2lvbi5pZH06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgd2hlbiBhIGNvbW1hbmQgZmluaXNoZXNcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlQ29tbWFuZEZpbmlzaGVkKFxuICAgIHNlc3Npb246IFB0eVNlc3Npb24sXG4gICAgcGdpZDogbnVtYmVyIHwgdW5kZWZpbmVkXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghcGdpZCB8fCAhc2Vzc2lvbi5jb21tYW5kU3RhcnRUaW1lIHx8ICFzZXNzaW9uLmN1cnJlbnRDb21tYW5kKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGNoYWxrLnJlZChcbiAgICAgICAgICBgU2Vzc2lvbiAke3Nlc3Npb24uaWR9OiBDYW5ub3QgaGFuZGxlIGNvbW1hbmQgZmluaXNoZWQgLSBtaXNzaW5nIGRhdGE6IHBnaWQ9JHtwZ2lkfSwgc3RhcnRUaW1lPSR7c2Vzc2lvbi5jb21tYW5kU3RhcnRUaW1lfSwgY29tbWFuZD1cIiR7c2Vzc2lvbi5jdXJyZW50Q29tbWFuZH1cImBcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWU7XG4gICAgY29uc3QgY29tbWFuZCA9IHNlc3Npb24uY3VycmVudENvbW1hbmQ7XG4gICAgY29uc3QgaXNDbGF1ZGVDb21tYW5kID0gY29tbWFuZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbGF1ZGUnKTtcblxuICAgIC8vIFJlc2V0IHRyYWNraW5nXG4gICAgc2Vzc2lvbi5jdXJyZW50Q29tbWFuZCA9IHVuZGVmaW5lZDtcbiAgICBzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWUgPSB1bmRlZmluZWQ7XG5cbiAgICAvLyBMb2cgY29tbWFuZCBjb21wbGV0aW9uIGZvciBDbGF1ZGVcbiAgICBpZiAoaXNDbGF1ZGVDb21tYW5kKSB7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay5jeWFuKFxuICAgICAgICAgIGDwn6SWIFNlc3Npb24gJHtzZXNzaW9uLmlkfTogQ2xhdWRlIGNvbW1hbmQgY29tcGxldGVkOiBcIiR7Y29tbWFuZH1cIiAoZHVyYXRpb246ICR7ZHVyYXRpb259bXMpYFxuICAgICAgICApXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHdlIHNob3VsZCBub3RpZnkgLSBieXBhc3MgZHVyYXRpb24gY2hlY2sgZm9yIENsYXVkZSBjb21tYW5kc1xuICAgIGlmICghaXNDbGF1ZGVDb21tYW5kICYmIGR1cmF0aW9uIDwgTUlOX0NPTU1BTkRfRFVSQVRJT05fTVMpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogQ29tbWFuZCBcIiR7Y29tbWFuZH1cIiB0b28gc2hvcnQgKCR7ZHVyYXRpb259bXMgPCAke01JTl9DT01NQU5EX0RVUkFUSU9OX01TfW1zKSwgbm90IG5vdGlmeWluZ2BcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gTG9nIGR1cmF0aW9uIGZvciBDbGF1ZGUgY29tbWFuZHMgZXZlbiBpZiBieXBhc3NpbmcgdGhlIGNoZWNrXG4gICAgaWYgKGlzQ2xhdWRlQ29tbWFuZCAmJiBkdXJhdGlvbiA8IE1JTl9DT01NQU5EX0RVUkFUSU9OX01TKSB7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgYOKaoSBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENsYXVkZSBjb21tYW5kIGNvbXBsZXRlZCBxdWlja2x5ICgke2R1cmF0aW9ufW1zKSAtIHN0aWxsIG5vdGlmeWluZ2BcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBpdCdzIGEgYnVpbHQtaW4gc2hlbGwgY29tbWFuZFxuICAgIGNvbnN0IGJhc2VDb21tYW5kID0gY29tbWFuZC5zcGxpdCgvXFxzKy8pWzBdO1xuICAgIGlmIChTSEVMTF9DT01NQU5EUy5oYXMoYmFzZUNvbW1hbmQpKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogSWdub3JpbmcgYnVpbHQtaW4gY29tbWFuZDogJHtiYXNlQ29tbWFuZH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gZ2V0IGV4aXQgY29kZSAodGhpcyBpcyB0cmlja3kgYW5kIG1pZ2h0IG5vdCBhbHdheXMgd29yaylcbiAgICBjb25zdCBleGl0Q29kZSA9IDA7XG4gICAgdHJ5IHtcbiAgICAgIC8vIENoZWNrIGlmIHdlIGNhbiBmaW5kIHRoZSBleGl0IHN0YXR1cyBpbiBzaGVsbCBoaXN0b3J5IG9yIHByb2Nlc3MgaW5mb1xuICAgICAgLy8gVGhpcyBpcyBwbGF0Zm9ybS1zcGVjaWZpYyBhbmQgbWlnaHQgbm90IGJlIHJlbGlhYmxlXG4gICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgdGhpcy5leGVjQXN5bmMoXG4gICAgICAgIGBwcyAtbyBwaWQsc3RhdCAtcCAke3BnaWR9IDI+L2Rldi9udWxsIHx8IGVjaG8gXCJOT1RGT1VORFwiYCxcbiAgICAgICAgeyB0aW1lb3V0OiA1MDAgfVxuICAgICAgKTtcbiAgICAgIGlmIChzdGRvdXQuaW5jbHVkZXMoJ05PVEZPVU5EJykgfHwgc3Rkb3V0LmluY2x1ZGVzKCdaJykpIHtcbiAgICAgICAgLy8gUHJvY2VzcyBpcyB6b21iaWUgb3Igbm90IGZvdW5kLCBsaWtlbHkgZXhpdGVkXG4gICAgICAgIC8vIFdlIGNhbid0IHJlbGlhYmx5IGdldCBleGl0IGNvZGUgdGhpcyB3YXlcbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IFByb2Nlc3MgJHtwZ2lkfSBub3QgZm91bmQgb3Igem9tYmllLCBhc3N1bWluZyBleGl0IGNvZGUgMGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIElnbm9yZSBlcnJvcnMgaW4gZXhpdCBjb2RlIGRldGVjdGlvblxuICAgICAgbG9nZ2VyLmRlYnVnKGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENvdWxkIG5vdCBkZXRlY3QgZXhpdCBjb2RlIGZvciBwcm9jZXNzICR7cGdpZH1gKTtcbiAgICB9XG5cbiAgICAvLyBFbWl0IHRoZSBldmVudFxuICAgIGNvbnN0IGV2ZW50RGF0YSA9IHtcbiAgICAgIHNlc3Npb25JZDogc2Vzc2lvbi5pZCxcbiAgICAgIGNvbW1hbmQsXG4gICAgICBleGl0Q29kZSxcbiAgICAgIGR1cmF0aW9uLFxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgfTtcblxuICAgIGxvZ2dlci5pbmZvKFxuICAgICAgYPCflJQgTk9USUZJQ0FUSU9OIERFQlVHOiBFbWl0dGluZyBjb21tYW5kRmluaXNoZWQgZXZlbnQgLSBzZXNzaW9uSWQ6ICR7c2Vzc2lvbi5pZH0sIGNvbW1hbmQ6IFwiJHtjb21tYW5kfVwiLCBkdXJhdGlvbjogJHtkdXJhdGlvbn1tcywgZXhpdENvZGU6ICR7ZXhpdENvZGV9YFxuICAgICk7XG4gICAgdGhpcy5lbWl0KCdjb21tYW5kRmluaXNoZWQnLCBldmVudERhdGEpO1xuXG4gICAgLy8gU2VuZCBub3RpZmljYXRpb24gdG8gTWFjIGFwcFxuICAgIGlmIChjb250cm9sVW5peEhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICAgICAgY29uc3Qgbm90aWZUaXRsZSA9IGlzQ2xhdWRlQ29tbWFuZCA/ICdDbGF1ZGUgVGFzayBGaW5pc2hlZCcgOiAnQ29tbWFuZCBGaW5pc2hlZCc7XG4gICAgICBjb25zdCBub3RpZkJvZHkgPSBgXCIke2NvbW1hbmR9XCIgY29tcGxldGVkIGluICR7TWF0aC5yb3VuZChkdXJhdGlvbiAvIDEwMDApfXMuYDtcbiAgICAgIGxvZ2dlci5pbmZvKFxuICAgICAgICBg8J+UlCBOT1RJRklDQVRJT04gREVCVUc6IFNlbmRpbmcgY29tbWFuZCBub3RpZmljYXRpb24gdG8gTWFjIC0gdGl0bGU6IFwiJHtub3RpZlRpdGxlfVwiLCBib2R5OiBcIiR7bm90aWZCb2R5fVwiYFxuICAgICAgKTtcbiAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kTm90aWZpY2F0aW9uKCdZb3VyIFR1cm4nLCBub3RpZkJvZHksIHtcbiAgICAgICAgdHlwZTogJ3lvdXItdHVybicsXG4gICAgICAgIHNlc3Npb25JZDogc2Vzc2lvbi5pZCxcbiAgICAgICAgc2Vzc2lvbk5hbWU6IHNlc3Npb24uc2Vzc2lvbkluZm8ubmFtZSB8fCBzZXNzaW9uLnNlc3Npb25JbmZvLmNvbW1hbmQuam9pbignICcpLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAn8J+UlCBOT1RJRklDQVRJT04gREVCVUc6IENhbm5vdCBzZW5kIGNvbW1hbmQgbm90aWZpY2F0aW9uIC0gTWFjIGFwcCBub3QgY29ubmVjdGVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBFbmhhbmNlZCBsb2dnaW5nIGZvciBldmVudHNcbiAgICBpZiAoaXNDbGF1ZGVDb21tYW5kKSB7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay5ncmVlbihcbiAgICAgICAgICBg4pyFIFNlc3Npb24gJHtzZXNzaW9uLmlkfTogQ2xhdWRlIGNvbW1hbmQgbm90aWZpY2F0aW9uIGV2ZW50IGVtaXR0ZWQ6IFwiJHtjb21tYW5kfVwiIChkdXJhdGlvbjogJHtkdXJhdGlvbn1tcywgZXhpdDogJHtleGl0Q29kZX0pYFxuICAgICAgICApXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIubG9nKGBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IENvbW1hbmQgZmluaXNoZWQ6IFwiJHtjb21tYW5kfVwiIChkdXJhdGlvbjogJHtkdXJhdGlvbn1tcylgKTtcbiAgICB9XG5cbiAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gJHtzZXNzaW9uLmlkfTogY29tbWFuZEZpbmlzaGVkIGV2ZW50IGRhdGE6YCwgZXZlbnREYXRhKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbXBvcnQgbmVjZXNzYXJ5IGV4ZWMgZnVuY3Rpb25cbiAgICovXG4gIHByaXZhdGUgZXhlY0FzeW5jID0gcHJvbWlzaWZ5KGV4ZWMpO1xufVxuIl19