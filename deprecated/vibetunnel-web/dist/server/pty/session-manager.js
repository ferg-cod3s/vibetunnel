"use strict";
/**
 * SessionManager - Centralized management for terminal session lifecycle and persistence
 *
 * This class provides a comprehensive solution for managing terminal sessions in VibeTunnel.
 * It handles session directory structure, metadata persistence, process tracking, and
 * file operations while maintaining compatibility with the tty-fwd format.
 *
 * ## Key Features:
 * - **Session Lifecycle Management**: Create, track, and cleanup terminal sessions
 * - **Persistent Storage**: Store session metadata and I/O streams in filesystem
 * - **Process Tracking**: Monitor running processes and detect zombie sessions
 * - **Version Management**: Handle cleanup across VibeTunnel version upgrades
 * - **Unique Naming**: Ensure session names are unique with automatic suffix handling
 * - **Atomic Operations**: Use temp files and rename for safe metadata updates
 *
 * ## Directory Structure:
 * ```
 * ~/.vibetunnel/control/
 * ├── .version                    # VibeTunnel version tracking
 * └── [session-id]/              # Per-session directory
 *     ├── session.json           # Session metadata
 *     ├── stdout                 # Process output stream
 *     └── stdin                  # Process input (FIFO or file)
 * ```
 *
 * ## Session States:
 * - `starting`: Session is being initialized
 * - `running`: Process is active and accepting input
 * - `exited`: Process has terminated
 *
 * @example
 * ```typescript
 * // Initialize session manager
 * const manager = new SessionManager();
 *
 * // Create a new session
 * const paths = manager.createSessionDirectory('session-123');
 *
 * // Save session metadata
 * manager.saveSessionInfo('session-123', {
 *   name: 'Development Server',
 *   status: 'starting',
 *   pid: 12345,
 *   startedAt: new Date().toISOString()
 * });
 *
 * // Update session status when process starts
 * manager.updateSessionStatus('session-123', 'running', 12345);
 *
 * // List all sessions
 * const sessions = manager.listSessions();
 * console.log(`Found ${sessions.length} sessions`);
 *
 * // Cleanup when done
 * manager.updateSessionStatus('session-123', 'exited', undefined, 0);
 * manager.cleanupSession('session-123');
 * ```
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
exports.SessionManager = void 0;
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_js_1 = require("../utils/logger.js");
const version_js_1 = require("../version.js");
const process_utils_js_1 = require("./process-utils.js");
const types_js_1 = require("./types.js");
const logger = (0, logger_js_1.createLogger)('session-manager');
class SessionManager {
    constructor(controlPath) {
        this.controlPath = controlPath || path.join(os.homedir(), '.vibetunnel', 'control');
        logger.debug(`initializing session manager with control path: ${this.controlPath}`);
        this.ensureControlDirectory();
    }
    /**
     * Validate session ID format for security
     */
    validateSessionId(sessionId) {
        if (!SessionManager.SESSION_ID_REGEX.test(sessionId)) {
            throw new types_js_1.PtyError(`Invalid session ID format: "${sessionId}". Session IDs must only contain letters, numbers, hyphens (-), and underscores (_).`, 'INVALID_SESSION_ID');
        }
    }
    /**
     * Ensure the control directory exists
     */
    ensureControlDirectory() {
        if (!fs.existsSync(this.controlPath)) {
            fs.mkdirSync(this.controlPath, { recursive: true });
            logger.debug(chalk_1.default.green(`control directory created: ${this.controlPath}`));
        }
    }
    /**
     * Get the path to the version tracking file
     */
    getVersionFilePath() {
        return path.join(this.controlPath, '.version');
    }
    /**
     * Read the last known version from the version file
     */
    readLastVersion() {
        try {
            const versionFile = this.getVersionFilePath();
            if (fs.existsSync(versionFile)) {
                const content = fs.readFileSync(versionFile, 'utf8').trim();
                logger.debug(`read last version from file: ${content}`);
                return content;
            }
            return null;
        }
        catch (error) {
            logger.warn(`failed to read version file: ${error}`);
            return null;
        }
    }
    /**
     * Write the current version to the version file
     */
    writeCurrentVersion() {
        try {
            const versionFile = this.getVersionFilePath();
            fs.writeFileSync(versionFile, version_js_1.VERSION, 'utf8');
            logger.debug(`wrote current version to file: ${version_js_1.VERSION}`);
        }
        catch (error) {
            logger.warn(`failed to write version file: ${error}`);
        }
    }
    /**
     * Create a new session directory structure
     */
    createSessionDirectory(sessionId) {
        this.validateSessionId(sessionId);
        const controlDir = path.join(this.controlPath, sessionId);
        // Create session directory
        if (!fs.existsSync(controlDir)) {
            fs.mkdirSync(controlDir, { recursive: true });
        }
        const paths = this.getSessionPaths(sessionId, true);
        if (!paths) {
            throw new Error(`Session ${sessionId} not found`);
        }
        // Create FIFO pipe for stdin (or regular file on systems without mkfifo)
        this.createStdinPipe(paths.stdinPath);
        logger.debug(chalk_1.default.green(`session directory created for ${sessionId}`));
        return paths;
    }
    /**
     * Create stdin pipe (FIFO if possible, regular file otherwise)
     */
    createStdinPipe(stdinPath) {
        try {
            // Try to create FIFO pipe (Unix-like systems)
            if (process.platform !== 'win32') {
                const result = (0, child_process_1.spawnSync)('mkfifo', [stdinPath], { stdio: 'ignore' });
                if (result.status === 0) {
                    logger.debug(`FIFO pipe created: ${stdinPath}`);
                    return; // Successfully created FIFO
                }
            }
            // Fallback to regular file
            if (!fs.existsSync(stdinPath)) {
                fs.writeFileSync(stdinPath, '');
            }
        }
        catch (error) {
            // If mkfifo fails, create regular file
            logger.debug(`mkfifo failed (${error instanceof Error ? error.message : 'unknown error'}), creating regular file: ${stdinPath}`);
            if (!fs.existsSync(stdinPath)) {
                fs.writeFileSync(stdinPath, '');
            }
        }
    }
    /**
     * Save session info to JSON file
     */
    saveSessionInfo(sessionId, sessionInfo) {
        this.validateSessionId(sessionId);
        try {
            const sessionDir = path.join(this.controlPath, sessionId);
            const sessionJsonPath = path.join(sessionDir, 'session.json');
            const tempPath = `${sessionJsonPath}.tmp`;
            // Ensure session directory exists before writing
            if (!fs.existsSync(sessionDir)) {
                logger.warn(`Session directory ${sessionDir} does not exist, creating it`);
                fs.mkdirSync(sessionDir, { recursive: true });
            }
            const sessionInfoStr = JSON.stringify(sessionInfo, null, 2);
            // Write to temporary file first, then move to final location (atomic write)
            fs.writeFileSync(tempPath, sessionInfoStr, 'utf8');
            // Double-check directory still exists before rename (handle race conditions)
            if (!fs.existsSync(sessionDir)) {
                logger.error(`Session directory ${sessionDir} was deleted during save operation`);
                // Clean up temp file if it exists
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                throw new types_js_1.PtyError(`Session directory was deleted during save operation`, 'SESSION_DIR_DELETED');
            }
            fs.renameSync(tempPath, sessionJsonPath);
            logger.debug(`session.json file saved for session ${sessionId} with name: ${sessionInfo.name}`);
        }
        catch (error) {
            if (error instanceof types_js_1.PtyError) {
                throw error;
            }
            throw new types_js_1.PtyError(`Failed to save session info: ${error instanceof Error ? error.message : String(error)}`, 'SAVE_SESSION_FAILED');
        }
    }
    /**
     * Load session info from JSON file
     */
    loadSessionInfo(sessionId) {
        const sessionJsonPath = path.join(this.controlPath, sessionId, 'session.json');
        try {
            if (!fs.existsSync(sessionJsonPath)) {
                return null;
            }
            const content = fs.readFileSync(sessionJsonPath, 'utf8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.warn(`failed to load session info for ${sessionId}:`, error);
            return null;
        }
    }
    /**
     * Update session status
     */
    updateSessionStatus(sessionId, status, pid, exitCode) {
        const sessionInfo = this.loadSessionInfo(sessionId);
        if (!sessionInfo) {
            throw new types_js_1.PtyError('Session info not found', 'SESSION_NOT_FOUND');
        }
        if (pid !== undefined) {
            sessionInfo.pid = pid;
        }
        sessionInfo.status = status;
        if (exitCode !== undefined) {
            sessionInfo.exitCode = exitCode;
        }
        this.saveSessionInfo(sessionId, sessionInfo);
        logger.debug(`session ${sessionId} status updated to ${status}${pid ? ` (pid: ${pid})` : ''}${exitCode !== undefined ? ` (exit code: ${exitCode})` : ''}`);
    }
    /**
     * Ensure a session name is unique by adding a suffix if necessary
     */
    ensureUniqueName(desiredName, excludeSessionId) {
        const sessions = this.listSessions();
        let finalName = desiredName;
        let suffix = 2;
        // Keep checking until we find a unique name
        while (true) {
            const nameExists = sessions.some((session) => session.name === finalName && session.id !== excludeSessionId);
            if (!nameExists) {
                break;
            }
            // Add or increment suffix
            finalName = `${desiredName} (${suffix})`;
            suffix++;
        }
        return finalName;
    }
    /**
     * Update session name
     */
    updateSessionName(sessionId, name) {
        logger.debug(`[SessionManager] updateSessionName called for session ${sessionId} with name: ${name}`);
        const sessionInfo = this.loadSessionInfo(sessionId);
        if (!sessionInfo) {
            logger.error(`[SessionManager] Session info not found for ${sessionId}`);
            throw new types_js_1.PtyError('Session info not found', 'SESSION_NOT_FOUND');
        }
        logger.debug(`[SessionManager] Current session info: ${JSON.stringify(sessionInfo)}`);
        // Ensure the name is unique
        const uniqueName = this.ensureUniqueName(name, sessionId);
        if (uniqueName !== name) {
            logger.debug(`[SessionManager] Name "${name}" already exists, using "${uniqueName}" instead`);
        }
        sessionInfo.name = uniqueName;
        logger.debug(`[SessionManager] Updated session info: ${JSON.stringify(sessionInfo)}`);
        logger.debug(`[SessionManager] Calling saveSessionInfo`);
        this.saveSessionInfo(sessionId, sessionInfo);
        logger.debug(`[SessionManager] session ${sessionId} name updated to: ${uniqueName}`);
        return uniqueName;
    }
    /**
     * List all sessions
     */
    listSessions() {
        try {
            if (!fs.existsSync(this.controlPath)) {
                return [];
            }
            const sessions = [];
            const entries = fs.readdirSync(this.controlPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const sessionId = entry.name;
                    const sessionDir = path.join(this.controlPath, sessionId);
                    const stdoutPath = path.join(sessionDir, 'stdout');
                    const sessionInfo = this.loadSessionInfo(sessionId);
                    if (sessionInfo) {
                        // Determine active state for running processes
                        if (sessionInfo.status === 'running' && sessionInfo.pid) {
                            // Update status if process is no longer alive
                            if (!process_utils_js_1.ProcessUtils.isProcessRunning(sessionInfo.pid)) {
                                logger.debug(chalk_1.default.yellow(`process ${sessionInfo.pid} no longer running for session ${sessionId}`));
                                sessionInfo.status = 'exited';
                                if (sessionInfo.exitCode === undefined) {
                                    sessionInfo.exitCode = 1; // Default exit code for dead processes
                                }
                                this.saveSessionInfo(sessionId, sessionInfo);
                            }
                        }
                        if (fs.existsSync(stdoutPath)) {
                            const lastModified = fs.statSync(stdoutPath).mtime.toISOString();
                            sessions.push({ ...sessionInfo, id: sessionId, lastModified });
                        }
                        else {
                            sessions.push({ ...sessionInfo, id: sessionId, lastModified: sessionInfo.startedAt });
                        }
                    }
                }
            }
            // Sort by startedAt timestamp (newest first)
            sessions.sort((a, b) => {
                const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
                const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
                return bTime - aTime;
            });
            logger.debug(`listSessions found ${sessions.length} sessions`);
            sessions.forEach((session) => {
                logger.debug(`  - Session ${session.id}: name="${session.name}", status="${session.status}"`);
            });
            return sessions;
        }
        catch (error) {
            throw new types_js_1.PtyError(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`, 'LIST_SESSIONS_FAILED');
        }
    }
    /**
     * Check if a session exists
     */
    sessionExists(sessionId) {
        const sessionDir = path.join(this.controlPath, sessionId);
        const sessionJsonPath = path.join(sessionDir, 'session.json');
        return fs.existsSync(sessionJsonPath);
    }
    /**
     * Cleanup a specific session
     */
    cleanupSession(sessionId) {
        if (!sessionId) {
            throw new types_js_1.PtyError('Session ID is required for cleanup', 'INVALID_SESSION_ID');
        }
        try {
            const sessionDir = path.join(this.controlPath, sessionId);
            if (fs.existsSync(sessionDir)) {
                logger.debug(`Cleaning up session directory: ${sessionDir}`);
                // Log session info before cleanup for debugging
                const sessionInfo = this.loadSessionInfo(sessionId);
                if (sessionInfo) {
                    logger.debug(`Cleaning up session ${sessionId} with status: ${sessionInfo.status}`);
                }
                // Remove directory and all contents
                fs.rmSync(sessionDir, { recursive: true, force: true });
                logger.debug(chalk_1.default.green(`session ${sessionId} cleaned up`));
            }
            else {
                logger.debug(`Session directory ${sessionDir} does not exist, nothing to clean up`);
            }
        }
        catch (error) {
            throw new types_js_1.PtyError(`Failed to cleanup session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'CLEANUP_FAILED', sessionId);
        }
    }
    /**
     * Cleanup all exited sessions
     */
    cleanupExitedSessions() {
        const cleanedSessions = [];
        try {
            const sessions = this.listSessions();
            for (const session of sessions) {
                if (session.status === 'exited' && session.id) {
                    this.cleanupSession(session.id);
                    cleanedSessions.push(session.id);
                }
            }
            if (cleanedSessions.length > 0) {
                logger.debug(chalk_1.default.green(`cleaned up ${cleanedSessions.length} exited sessions`));
            }
            return cleanedSessions;
        }
        catch (error) {
            throw new types_js_1.PtyError(`Failed to cleanup exited sessions: ${error instanceof Error ? error.message : String(error)}`, 'CLEANUP_EXITED_FAILED');
        }
    }
    /**
     * Cleanup sessions from old VibeTunnel versions
     * This is called during server startup to clean sessions when version changes
     */
    cleanupOldVersionSessions() {
        const lastVersion = this.readLastVersion();
        const currentVersion = version_js_1.VERSION;
        // If no version file exists, this is likely a fresh install or first time with version tracking
        if (!lastVersion) {
            logger.debug('no previous version found, checking for legacy sessions');
            // First update zombie sessions to mark dead processes
            this.updateZombieSessions();
            // Clean up any sessions without version field that are also not active
            let cleanedCount = 0;
            const sessions = this.listSessions();
            for (const session of sessions) {
                if (!session.version) {
                    // Only clean if the session is not actively running
                    if (session.status === 'exited' ||
                        (session.pid && !process_utils_js_1.ProcessUtils.isProcessRunning(session.pid))) {
                        logger.debug(`cleaning up legacy zombie session ${session.id} (no version field)`);
                        this.cleanupSession(session.id);
                        cleanedCount++;
                    }
                    else {
                        logger.debug(`preserving active legacy session ${session.id}`);
                    }
                }
            }
            this.writeCurrentVersion();
            return { versionChanged: false, cleanedCount };
        }
        // If version hasn't changed, nothing to do
        if (lastVersion === currentVersion) {
            logger.debug(`version unchanged (${currentVersion}), skipping cleanup`);
            return { versionChanged: false, cleanedCount: 0 };
        }
        logger.log(chalk_1.default.yellow(`VibeTunnel version changed from ${lastVersion} to ${currentVersion}`));
        logger.log(chalk_1.default.yellow('cleaning up zombie sessions from old version...'));
        // First update zombie sessions to mark dead processes
        this.updateZombieSessions();
        let cleanedCount = 0;
        try {
            const sessions = this.listSessions();
            for (const session of sessions) {
                // Only clean sessions that don't match the current version AND are not active
                if (!session.version || session.version !== currentVersion) {
                    // Check if session is actually dead/zombie
                    if (session.status === 'exited' ||
                        (session.pid && !process_utils_js_1.ProcessUtils.isProcessRunning(session.pid))) {
                        logger.debug(`cleaning up zombie session ${session.id} (version: ${session.version || 'unknown'})`);
                        this.cleanupSession(session.id);
                        cleanedCount++;
                    }
                    else {
                        logger.debug(`preserving active session ${session.id} (version: ${session.version || 'unknown'})`);
                    }
                }
            }
            // Update the version file to current version
            this.writeCurrentVersion();
            if (cleanedCount > 0) {
                logger.log(chalk_1.default.green(`cleaned up ${cleanedCount} zombie sessions from previous version`));
            }
            else {
                logger.log(chalk_1.default.gray('no zombie sessions to clean up (active sessions preserved)'));
            }
            return { versionChanged: true, cleanedCount };
        }
        catch (error) {
            logger.error(`failed to cleanup old version sessions: ${error}`);
            // Still update version file to prevent repeated cleanup attempts
            this.writeCurrentVersion();
            return { versionChanged: true, cleanedCount };
        }
    }
    /**
     * Get session paths for a given session ID
     */
    getSessionPaths(sessionId, checkExists = false) {
        const sessionDir = path.join(this.controlPath, sessionId);
        logger.debug(`[SessionManager] getSessionPaths for ${sessionId}, sessionDir: ${sessionDir}, checkExists: ${checkExists}`);
        if (checkExists && !fs.existsSync(sessionDir)) {
            logger.debug(`[SessionManager] Session directory does not exist: ${sessionDir}`);
            return null;
        }
        return {
            controlDir: sessionDir,
            stdoutPath: path.join(sessionDir, 'stdout'),
            stdinPath: path.join(sessionDir, 'stdin'),
            sessionJsonPath: path.join(sessionDir, 'session.json'),
        };
    }
    /**
     * Write to stdin pipe/file
     */
    writeToStdin(sessionId, data) {
        const paths = this.getSessionPaths(sessionId);
        if (!paths) {
            throw new types_js_1.PtyError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND', sessionId);
        }
        try {
            // For FIFO pipes, we need to open in append mode
            // For regular files, we also use append mode to avoid conflicts
            fs.appendFileSync(paths.stdinPath, data);
            logger.debug(`wrote ${data.length} bytes to stdin for session ${sessionId}`);
        }
        catch (error) {
            throw new types_js_1.PtyError(`Failed to write to stdin for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, 'STDIN_WRITE_FAILED', sessionId);
        }
    }
    /**
     * Update sessions that have zombie processes
     */
    updateZombieSessions() {
        const updatedSessions = [];
        try {
            const sessions = this.listSessions();
            for (const session of sessions) {
                if (session.status === 'running' && session.pid) {
                    if (!process_utils_js_1.ProcessUtils.isProcessRunning(session.pid)) {
                        // Process is dead, update status
                        const paths = this.getSessionPaths(session.id);
                        if (paths) {
                            logger.debug(chalk_1.default.yellow(`marking zombie process ${session.pid} as exited for session ${session.id}`));
                            this.updateSessionStatus(session.id, 'exited', undefined, 1);
                            updatedSessions.push(session.id);
                        }
                    }
                }
            }
            return updatedSessions;
        }
        catch (error) {
            logger.warn('failed to update zombie sessions:', error);
            return [];
        }
    }
    /**
     * Get control path
     */
    getControlPath() {
        return this.controlPath;
    }
}
exports.SessionManager = SessionManager;
SessionManager.SESSION_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9wdHkvc2Vzc2lvbi1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeURHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxrREFBMEI7QUFDMUIsaURBQTBDO0FBQzFDLHVDQUF5QjtBQUN6Qix1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLGtEQUFrRDtBQUNsRCw4Q0FBd0M7QUFDeEMseURBQWtEO0FBQ2xELHlDQUFzQztBQUV0QyxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUUvQyxNQUFhLGNBQWM7SUFJekIsWUFBWSxXQUFvQjtRQUM5QixJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEYsTUFBTSxDQUFDLEtBQUssQ0FBQyxtREFBbUQsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVEOztPQUVHO0lBQ0ssaUJBQWlCLENBQUMsU0FBaUI7UUFDekMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxNQUFNLElBQUksbUJBQVEsQ0FDaEIsK0JBQStCLFNBQVMsc0ZBQXNGLEVBQzlILG9CQUFvQixDQUNyQixDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLHNCQUFzQjtRQUM1QixJQUFJLENBQUMsRUFBRSxDQUFD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aW9uTWFuYWdlciAtIENlbnRyYWxpemVkIG1hbmFnZW1lbnQgZm9yIHRlcm1pbmFsIHNlc3Npb24gbGlmZWN5Y2xlIGFuZCBwZXJzaXN0ZW5jZVxuICpcbiAqIFRoaXMgY2xhc3MgcHJvdmlkZXMgYSBjb21wcmVoZW5zaXZlIHNvbHV0aW9uIGZvciBtYW5hZ2luZyB0ZXJtaW5hbCBzZXNzaW9ucyBpbiBWaWJlVHVubmVsLlxuICogSXQgaGFuZGxlcyBzZXNzaW9uIGRpcmVjdG9yeSBzdHJ1Y3R1cmUsIG1ldGFkYXRhIHBlcnNpc3RlbmNlLCBwcm9jZXNzIHRyYWNraW5nLCBhbmRcbiAqIGZpbGUgb3BlcmF0aW9ucyB3aGlsZSBtYWludGFpbmluZyBjb21wYXRpYmlsaXR5IHdpdGggdGhlIHR0eS1md2QgZm9ybWF0LlxuICpcbiAqICMjIEtleSBGZWF0dXJlczpcbiAqIC0gKipTZXNzaW9uIExpZmVjeWNsZSBNYW5hZ2VtZW50Kio6IENyZWF0ZSwgdHJhY2ssIGFuZCBjbGVhbnVwIHRlcm1pbmFsIHNlc3Npb25zXG4gKiAtICoqUGVyc2lzdGVudCBTdG9yYWdlKio6IFN0b3JlIHNlc3Npb24gbWV0YWRhdGEgYW5kIEkvTyBzdHJlYW1zIGluIGZpbGVzeXN0ZW1cbiAqIC0gKipQcm9jZXNzIFRyYWNraW5nKio6IE1vbml0b3IgcnVubmluZyBwcm9jZXNzZXMgYW5kIGRldGVjdCB6b21iaWUgc2Vzc2lvbnNcbiAqIC0gKipWZXJzaW9uIE1hbmFnZW1lbnQqKjogSGFuZGxlIGNsZWFudXAgYWNyb3NzIFZpYmVUdW5uZWwgdmVyc2lvbiB1cGdyYWRlc1xuICogLSAqKlVuaXF1ZSBOYW1pbmcqKjogRW5zdXJlIHNlc3Npb24gbmFtZXMgYXJlIHVuaXF1ZSB3aXRoIGF1dG9tYXRpYyBzdWZmaXggaGFuZGxpbmdcbiAqIC0gKipBdG9taWMgT3BlcmF0aW9ucyoqOiBVc2UgdGVtcCBmaWxlcyBhbmQgcmVuYW1lIGZvciBzYWZlIG1ldGFkYXRhIHVwZGF0ZXNcbiAqXG4gKiAjIyBEaXJlY3RvcnkgU3RydWN0dXJlOlxuICogYGBgXG4gKiB+Ly52aWJldHVubmVsL2NvbnRyb2wvXG4gKiDilJzilIDilIAgLnZlcnNpb24gICAgICAgICAgICAgICAgICAgICMgVmliZVR1bm5lbCB2ZXJzaW9uIHRyYWNraW5nXG4gKiDilJTilIDilIAgW3Nlc3Npb24taWRdLyAgICAgICAgICAgICAgIyBQZXItc2Vzc2lvbiBkaXJlY3RvcnlcbiAqICAgICDilJzilIDilIAgc2Vzc2lvbi5qc29uICAgICAgICAgICAjIFNlc3Npb24gbWV0YWRhdGFcbiAqICAgICDilJzilIDilIAgc3Rkb3V0ICAgICAgICAgICAgICAgICAjIFByb2Nlc3Mgb3V0cHV0IHN0cmVhbVxuICogICAgIOKUlOKUgOKUgCBzdGRpbiAgICAgICAgICAgICAgICAgICMgUHJvY2VzcyBpbnB1dCAoRklGTyBvciBmaWxlKVxuICogYGBgXG4gKlxuICogIyMgU2Vzc2lvbiBTdGF0ZXM6XG4gKiAtIGBzdGFydGluZ2A6IFNlc3Npb24gaXMgYmVpbmcgaW5pdGlhbGl6ZWRcbiAqIC0gYHJ1bm5pbmdgOiBQcm9jZXNzIGlzIGFjdGl2ZSBhbmQgYWNjZXB0aW5nIGlucHV0XG4gKiAtIGBleGl0ZWRgOiBQcm9jZXNzIGhhcyB0ZXJtaW5hdGVkXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIC8vIEluaXRpYWxpemUgc2Vzc2lvbiBtYW5hZ2VyXG4gKiBjb25zdCBtYW5hZ2VyID0gbmV3IFNlc3Npb25NYW5hZ2VyKCk7XG4gKlxuICogLy8gQ3JlYXRlIGEgbmV3IHNlc3Npb25cbiAqIGNvbnN0IHBhdGhzID0gbWFuYWdlci5jcmVhdGVTZXNzaW9uRGlyZWN0b3J5KCdzZXNzaW9uLTEyMycpO1xuICpcbiAqIC8vIFNhdmUgc2Vzc2lvbiBtZXRhZGF0YVxuICogbWFuYWdlci5zYXZlU2Vzc2lvbkluZm8oJ3Nlc3Npb24tMTIzJywge1xuICogICBuYW1lOiAnRGV2ZWxvcG1lbnQgU2VydmVyJyxcbiAqICAgc3RhdHVzOiAnc3RhcnRpbmcnLFxuICogICBwaWQ6IDEyMzQ1LFxuICogICBzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICogfSk7XG4gKlxuICogLy8gVXBkYXRlIHNlc3Npb24gc3RhdHVzIHdoZW4gcHJvY2VzcyBzdGFydHNcbiAqIG1hbmFnZXIudXBkYXRlU2Vzc2lvblN0YXR1cygnc2Vzc2lvbi0xMjMnLCAncnVubmluZycsIDEyMzQ1KTtcbiAqXG4gKiAvLyBMaXN0IGFsbCBzZXNzaW9uc1xuICogY29uc3Qgc2Vzc2lvbnMgPSBtYW5hZ2VyLmxpc3RTZXNzaW9ucygpO1xuICogY29uc29sZS5sb2coYEZvdW5kICR7c2Vzc2lvbnMubGVuZ3RofSBzZXNzaW9uc2ApO1xuICpcbiAqIC8vIENsZWFudXAgd2hlbiBkb25lXG4gKiBtYW5hZ2VyLnVwZGF0ZVNlc3Npb25TdGF0dXMoJ3Nlc3Npb24tMTIzJywgJ2V4aXRlZCcsIHVuZGVmaW5lZCwgMCk7XG4gKiBtYW5hZ2VyLmNsZWFudXBTZXNzaW9uKCdzZXNzaW9uLTEyMycpO1xuICogYGBgXG4gKi9cblxuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB7IHNwYXduU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbiwgU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IFZFUlNJT04gfSBmcm9tICcuLi92ZXJzaW9uLmpzJztcbmltcG9ydCB7IFByb2Nlc3NVdGlscyB9IGZyb20gJy4vcHJvY2Vzcy11dGlscy5qcyc7XG5pbXBvcnQgeyBQdHlFcnJvciB9IGZyb20gJy4vdHlwZXMuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3Nlc3Npb24tbWFuYWdlcicpO1xuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbk1hbmFnZXIge1xuICBwcml2YXRlIGNvbnRyb2xQYXRoOiBzdHJpbmc7XG4gIHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFU1NJT05fSURfUkVHRVggPSAvXlthLXpBLVowLTlfLV0rJC87XG5cbiAgY29uc3RydWN0b3IoY29udHJvbFBhdGg/OiBzdHJpbmcpIHtcbiAgICB0aGlzLmNvbnRyb2xQYXRoID0gY29udHJvbFBhdGggfHwgcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy52aWJldHVubmVsJywgJ2NvbnRyb2wnKTtcbiAgICBsb2dnZXIuZGVidWcoYGluaXRpYWxpemluZyBzZXNzaW9uIG1hbmFnZXIgd2l0aCBjb250cm9sIHBhdGg6ICR7dGhpcy5jb250cm9sUGF0aH1gKTtcbiAgICB0aGlzLmVuc3VyZUNvbnRyb2xEaXJlY3RvcnkoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBzZXNzaW9uIElEIGZvcm1hdCBmb3Igc2VjdXJpdHlcbiAgICovXG4gIHByaXZhdGUgdmFsaWRhdGVTZXNzaW9uSWQoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIVNlc3Npb25NYW5hZ2VyLlNFU1NJT05fSURfUkVHRVgudGVzdChzZXNzaW9uSWQpKSB7XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgIGBJbnZhbGlkIHNlc3Npb24gSUQgZm9ybWF0OiBcIiR7c2Vzc2lvbklkfVwiLiBTZXNzaW9uIElEcyBtdXN0IG9ubHkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzLCBoeXBoZW5zICgtKSwgYW5kIHVuZGVyc2NvcmVzIChfKS5gLFxuICAgICAgICAnSU5WQUxJRF9TRVNTSU9OX0lEJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRW5zdXJlIHRoZSBjb250cm9sIGRpcmVjdG9yeSBleGlzdHNcbiAgICovXG4gIHByaXZhdGUgZW5zdXJlQ29udHJvbERpcmVjdG9yeSgpOiB2b2lkIHtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5jb250cm9sUGF0aCkpIHtcbiAgICAgIGZzLm1rZGlyU3luYyh0aGlzLmNvbnRyb2xQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ncmVlbihgY29udHJvbCBkaXJlY3RvcnkgY3JlYXRlZDogJHt0aGlzLmNvbnRyb2xQYXRofWApKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBwYXRoIHRvIHRoZSB2ZXJzaW9uIHRyYWNraW5nIGZpbGVcbiAgICovXG4gIHByaXZhdGUgZ2V0VmVyc2lvbkZpbGVQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCAnLnZlcnNpb24nKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWFkIHRoZSBsYXN0IGtub3duIHZlcnNpb24gZnJvbSB0aGUgdmVyc2lvbiBmaWxlXG4gICAqL1xuICBwcml2YXRlIHJlYWRMYXN0VmVyc2lvbigpOiBzdHJpbmcgfCBudWxsIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmVyc2lvbkZpbGUgPSB0aGlzLmdldFZlcnNpb25GaWxlUGF0aCgpO1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmModmVyc2lvbkZpbGUpKSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmModmVyc2lvbkZpbGUsICd1dGY4JykudHJpbSgpO1xuICAgICAgICBsb2dnZXIuZGVidWcoYHJlYWQgbGFzdCB2ZXJzaW9uIGZyb20gZmlsZTogJHtjb250ZW50fWApO1xuICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIud2FybihgZmFpbGVkIHRvIHJlYWQgdmVyc2lvbiBmaWxlOiAke2Vycm9yfWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIHRoZSBjdXJyZW50IHZlcnNpb24gdG8gdGhlIHZlcnNpb24gZmlsZVxuICAgKi9cbiAgcHJpdmF0ZSB3cml0ZUN1cnJlbnRWZXJzaW9uKCk6IHZvaWQge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2ZXJzaW9uRmlsZSA9IHRoaXMuZ2V0VmVyc2lvbkZpbGVQYXRoKCk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHZlcnNpb25GaWxlLCBWRVJTSU9OLCAndXRmOCcpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGB3cm90ZSBjdXJyZW50IHZlcnNpb24gdG8gZmlsZTogJHtWRVJTSU9OfWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIud2FybihgZmFpbGVkIHRvIHdyaXRlIHZlcnNpb24gZmlsZTogJHtlcnJvcn1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHNlc3Npb24gZGlyZWN0b3J5IHN0cnVjdHVyZVxuICAgKi9cbiAgY3JlYXRlU2Vzc2lvbkRpcmVjdG9yeShzZXNzaW9uSWQ6IHN0cmluZyk6IHtcbiAgICBjb250cm9sRGlyOiBzdHJpbmc7XG4gICAgc3Rkb3V0UGF0aDogc3RyaW5nO1xuICAgIHN0ZGluUGF0aDogc3RyaW5nO1xuICAgIHNlc3Npb25Kc29uUGF0aDogc3RyaW5nO1xuICB9IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbklkKHNlc3Npb25JZCk7XG4gICAgY29uc3QgY29udHJvbERpciA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQpO1xuXG4gICAgLy8gQ3JlYXRlIHNlc3Npb24gZGlyZWN0b3J5XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGNvbnRyb2xEaXIpKSB7XG4gICAgICBmcy5ta2RpclN5bmMoY29udHJvbERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcGF0aHMgPSB0aGlzLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQsIHRydWUpO1xuICAgIGlmICghcGF0aHMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25JZH0gbm90IGZvdW5kYCk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIEZJRk8gcGlwZSBmb3Igc3RkaW4gKG9yIHJlZ3VsYXIgZmlsZSBvbiBzeXN0ZW1zIHdpdGhvdXQgbWtmaWZvKVxuICAgIHRoaXMuY3JlYXRlU3RkaW5QaXBlKHBhdGhzLnN0ZGluUGF0aCk7XG4gICAgbG9nZ2VyLmRlYnVnKGNoYWxrLmdyZWVuKGBzZXNzaW9uIGRpcmVjdG9yeSBjcmVhdGVkIGZvciAke3Nlc3Npb25JZH1gKSk7XG4gICAgcmV0dXJuIHBhdGhzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBzdGRpbiBwaXBlIChGSUZPIGlmIHBvc3NpYmxlLCByZWd1bGFyIGZpbGUgb3RoZXJ3aXNlKVxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVTdGRpblBpcGUoc3RkaW5QYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgLy8gVHJ5IHRvIGNyZWF0ZSBGSUZPIHBpcGUgKFVuaXgtbGlrZSBzeXN0ZW1zKVxuICAgICAgaWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICd3aW4zMicpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKCdta2ZpZm8nLCBbc3RkaW5QYXRoXSwgeyBzdGRpbzogJ2lnbm9yZScgfSk7XG4gICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAwKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBGSUZPIHBpcGUgY3JlYXRlZDogJHtzdGRpblBhdGh9YCk7XG4gICAgICAgICAgcmV0dXJuOyAvLyBTdWNjZXNzZnVsbHkgY3JlYXRlZCBGSUZPXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gRmFsbGJhY2sgdG8gcmVndWxhciBmaWxlXG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc3RkaW5QYXRoKSkge1xuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHN0ZGluUGF0aCwgJycpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBJZiBta2ZpZm8gZmFpbHMsIGNyZWF0ZSByZWd1bGFyIGZpbGVcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYG1rZmlmbyBmYWlsZWQgKCR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAndW5rbm93biBlcnJvcid9KSwgY3JlYXRpbmcgcmVndWxhciBmaWxlOiAke3N0ZGluUGF0aH1gXG4gICAgICApO1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHN0ZGluUGF0aCkpIHtcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhzdGRpblBhdGgsICcnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2F2ZSBzZXNzaW9uIGluZm8gdG8gSlNPTiBmaWxlXG4gICAqL1xuICBzYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25JbmZvOiBTZXNzaW9uSW5mbyk6IHZvaWQge1xuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc2Vzc2lvbkRpciA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQpO1xuICAgICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKHNlc3Npb25EaXIsICdzZXNzaW9uLmpzb24nKTtcbiAgICAgIGNvbnN0IHRlbXBQYXRoID0gYCR7c2Vzc2lvbkpzb25QYXRofS50bXBgO1xuXG4gICAgICAvLyBFbnN1cmUgc2Vzc2lvbiBkaXJlY3RvcnkgZXhpc3RzIGJlZm9yZSB3cml0aW5nXG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc2Vzc2lvbkRpcikpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYFNlc3Npb24gZGlyZWN0b3J5ICR7c2Vzc2lvbkRpcn0gZG9lcyBub3QgZXhpc3QsIGNyZWF0aW5nIGl0YCk7XG4gICAgICAgIGZzLm1rZGlyU3luYyhzZXNzaW9uRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2Vzc2lvbkluZm9TdHIgPSBKU09OLnN0cmluZ2lmeShzZXNzaW9uSW5mbywgbnVsbCwgMik7XG5cbiAgICAgIC8vIFdyaXRlIHRvIHRlbXBvcmFyeSBmaWxlIGZpcnN0LCB0aGVuIG1vdmUgdG8gZmluYWwgbG9jYXRpb24gKGF0b21pYyB3cml0ZSlcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGVtcFBhdGgsIHNlc3Npb25JbmZvU3RyLCAndXRmOCcpO1xuXG4gICAgICAvLyBEb3VibGUtY2hlY2sgZGlyZWN0b3J5IHN0aWxsIGV4aXN0cyBiZWZvcmUgcmVuYW1lIChoYW5kbGUgcmFjZSBjb25kaXRpb25zKVxuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHNlc3Npb25EaXIpKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgU2Vzc2lvbiBkaXJlY3RvcnkgJHtzZXNzaW9uRGlyfSB3YXMgZGVsZXRlZCBkdXJpbmcgc2F2ZSBvcGVyYXRpb25gKTtcbiAgICAgICAgLy8gQ2xlYW4gdXAgdGVtcCBmaWxlIGlmIGl0IGV4aXN0c1xuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh0ZW1wUGF0aCkpIHtcbiAgICAgICAgICBmcy51bmxpbmtTeW5jKHRlbXBQYXRoKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgICAgYFNlc3Npb24gZGlyZWN0b3J5IHdhcyBkZWxldGVkIGR1cmluZyBzYXZlIG9wZXJhdGlvbmAsXG4gICAgICAgICAgJ1NFU1NJT05fRElSX0RFTEVURUQnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGZzLnJlbmFtZVN5bmModGVtcFBhdGgsIHNlc3Npb25Kc29uUGF0aCk7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBzZXNzaW9uLmpzb24gZmlsZSBzYXZlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gd2l0aCBuYW1lOiAke3Nlc3Npb25JbmZvLm5hbWV9YFxuICAgICAgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUHR5RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gc2F2ZSBzZXNzaW9uIGluZm86ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXG4gICAgICAgICdTQVZFX1NFU1NJT05fRkFJTEVEJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTG9hZCBzZXNzaW9uIGluZm8gZnJvbSBKU09OIGZpbGVcbiAgICovXG4gIGxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQ6IHN0cmluZyk6IFNlc3Npb25JbmZvIHwgbnVsbCB7XG4gICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbFBhdGgsIHNlc3Npb25JZCwgJ3Nlc3Npb24uanNvbicpO1xuICAgIHRyeSB7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc2Vzc2lvbkpzb25QYXRoKSkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhzZXNzaW9uSnNvblBhdGgsICd1dGY4Jyk7XG4gICAgICByZXR1cm4gSlNPTi5wYXJzZShjb250ZW50KSBhcyBTZXNzaW9uSW5mbztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oYGZhaWxlZCB0byBsb2FkIHNlc3Npb24gaW5mbyBmb3IgJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgc2Vzc2lvbiBzdGF0dXNcbiAgICovXG4gIHVwZGF0ZVNlc3Npb25TdGF0dXMoc2Vzc2lvbklkOiBzdHJpbmcsIHN0YXR1czogc3RyaW5nLCBwaWQ/OiBudW1iZXIsIGV4aXRDb2RlPzogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbkluZm8pIHtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcignU2Vzc2lvbiBpbmZvIG5vdCBmb3VuZCcsICdTRVNTSU9OX05PVF9GT1VORCcpO1xuICAgIH1cblxuICAgIGlmIChwaWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgc2Vzc2lvbkluZm8ucGlkID0gcGlkO1xuICAgIH1cbiAgICBzZXNzaW9uSW5mby5zdGF0dXMgPSBzdGF0dXMgYXMgJ3N0YXJ0aW5nJyB8ICdydW5uaW5nJyB8ICdleGl0ZWQnO1xuICAgIGlmIChleGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZXNzaW9uSW5mby5leGl0Q29kZSA9IGV4aXRDb2RlO1xuICAgIH1cblxuICAgIHRoaXMuc2F2ZVNlc3Npb25JbmZvKHNlc3Npb25JZCwgc2Vzc2lvbkluZm8pO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBzZXNzaW9uICR7c2Vzc2lvbklkfSBzdGF0dXMgdXBkYXRlZCB0byAke3N0YXR1c30ke3BpZCA/IGAgKHBpZDogJHtwaWR9KWAgOiAnJ30ke2V4aXRDb2RlICE9PSB1bmRlZmluZWQgPyBgIChleGl0IGNvZGU6ICR7ZXhpdENvZGV9KWAgOiAnJ31gXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbnN1cmUgYSBzZXNzaW9uIG5hbWUgaXMgdW5pcXVlIGJ5IGFkZGluZyBhIHN1ZmZpeCBpZiBuZWNlc3NhcnlcbiAgICovXG4gIHByaXZhdGUgZW5zdXJlVW5pcXVlTmFtZShkZXNpcmVkTmFtZTogc3RyaW5nLCBleGNsdWRlU2Vzc2lvbklkPzogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBzZXNzaW9ucyA9IHRoaXMubGlzdFNlc3Npb25zKCk7XG4gICAgbGV0IGZpbmFsTmFtZSA9IGRlc2lyZWROYW1lO1xuICAgIGxldCBzdWZmaXggPSAyO1xuXG4gICAgLy8gS2VlcCBjaGVja2luZyB1bnRpbCB3ZSBmaW5kIGEgdW5pcXVlIG5hbWVcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgbmFtZUV4aXN0cyA9IHNlc3Npb25zLnNvbWUoXG4gICAgICAgIChzZXNzaW9uKSA9PiBzZXNzaW9uLm5hbWUgPT09IGZpbmFsTmFtZSAmJiBzZXNzaW9uLmlkICE9PSBleGNsdWRlU2Vzc2lvbklkXG4gICAgICApO1xuXG4gICAgICBpZiAoIW5hbWVFeGlzdHMpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBvciBpbmNyZW1lbnQgc3VmZml4XG4gICAgICBmaW5hbE5hbWUgPSBgJHtkZXNpcmVkTmFtZX0gKCR7c3VmZml4fSlgO1xuICAgICAgc3VmZml4Kys7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbmFsTmFtZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgc2Vzc2lvbiBuYW1lXG4gICAqL1xuICB1cGRhdGVTZXNzaW9uTmFtZShzZXNzaW9uSWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgW1Nlc3Npb25NYW5hZ2VyXSB1cGRhdGVTZXNzaW9uTmFtZSBjYWxsZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9IHdpdGggbmFtZTogJHtuYW1lfWBcbiAgICApO1xuXG4gICAgY29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbkluZm8pIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgW1Nlc3Npb25NYW5hZ2VyXSBTZXNzaW9uIGluZm8gbm90IGZvdW5kIGZvciAke3Nlc3Npb25JZH1gKTtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcignU2Vzc2lvbiBpbmZvIG5vdCBmb3VuZCcsICdTRVNTSU9OX05PVF9GT1VORCcpO1xuICAgIH1cblxuICAgIGxvZ2dlci5kZWJ1ZyhgW1Nlc3Npb25NYW5hZ2VyXSBDdXJyZW50IHNlc3Npb24gaW5mbzogJHtKU09OLnN0cmluZ2lmeShzZXNzaW9uSW5mbyl9YCk7XG5cbiAgICAvLyBFbnN1cmUgdGhlIG5hbWUgaXMgdW5pcXVlXG4gICAgY29uc3QgdW5pcXVlTmFtZSA9IHRoaXMuZW5zdXJlVW5pcXVlTmFtZShuYW1lLCBzZXNzaW9uSWQpO1xuXG4gICAgaWYgKHVuaXF1ZU5hbWUgIT09IG5hbWUpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1Nlc3Npb25NYW5hZ2VyXSBOYW1lIFwiJHtuYW1lfVwiIGFscmVhZHkgZXhpc3RzLCB1c2luZyBcIiR7dW5pcXVlTmFtZX1cIiBpbnN0ZWFkYCk7XG4gICAgfVxuXG4gICAgc2Vzc2lvbkluZm8ubmFtZSA9IHVuaXF1ZU5hbWU7XG5cbiAgICBsb2dnZXIuZGVidWcoYFtTZXNzaW9uTWFuYWdlcl0gVXBkYXRlZCBzZXNzaW9uIGluZm86ICR7SlNPTi5zdHJpbmdpZnkoc2Vzc2lvbkluZm8pfWApO1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1Nlc3Npb25NYW5hZ2VyXSBDYWxsaW5nIHNhdmVTZXNzaW9uSW5mb2ApO1xuXG4gICAgdGhpcy5zYXZlU2Vzc2lvbkluZm8oc2Vzc2lvbklkLCBzZXNzaW9uSW5mbyk7XG4gICAgbG9nZ2VyLmRlYnVnKGBbU2Vzc2lvbk1hbmFnZXJdIHNlc3Npb24gJHtzZXNzaW9uSWR9IG5hbWUgdXBkYXRlZCB0bzogJHt1bmlxdWVOYW1lfWApO1xuXG4gICAgcmV0dXJuIHVuaXF1ZU5hbWU7XG4gIH1cblxuICAvKipcbiAgICogTGlzdCBhbGwgc2Vzc2lvbnNcbiAgICovXG4gIGxpc3RTZXNzaW9ucygpOiBTZXNzaW9uW10ge1xuICAgIHRyeSB7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5jb250cm9sUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZXNzaW9uczogU2Vzc2lvbltdID0gW107XG4gICAgICBjb25zdCBlbnRyaWVzID0gZnMucmVhZGRpclN5bmModGhpcy5jb250cm9sUGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXG4gICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgICAgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSBlbnRyeS5uYW1lO1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25EaXIgPSBwYXRoLmpvaW4odGhpcy5jb250cm9sUGF0aCwgc2Vzc2lvbklkKTtcbiAgICAgICAgICBjb25zdCBzdGRvdXRQYXRoID0gcGF0aC5qb2luKHNlc3Npb25EaXIsICdzdGRvdXQnKTtcblxuICAgICAgICAgIGNvbnN0IHNlc3Npb25JbmZvID0gdGhpcy5sb2FkU2Vzc2lvbkluZm8oc2Vzc2lvbklkKTtcbiAgICAgICAgICBpZiAoc2Vzc2lvbkluZm8pIHtcbiAgICAgICAgICAgIC8vIERldGVybWluZSBhY3RpdmUgc3RhdGUgZm9yIHJ1bm5pbmcgcHJvY2Vzc2VzXG4gICAgICAgICAgICBpZiAoc2Vzc2lvbkluZm8uc3RhdHVzID09PSAncnVubmluZycgJiYgc2Vzc2lvbkluZm8ucGlkKSB7XG4gICAgICAgICAgICAgIC8vIFVwZGF0ZSBzdGF0dXMgaWYgcHJvY2VzcyBpcyBubyBsb25nZXIgYWxpdmVcbiAgICAgICAgICAgICAgaWYgKCFQcm9jZXNzVXRpbHMuaXNQcm9jZXNzUnVubmluZyhzZXNzaW9uSW5mby5waWQpKSB7XG4gICAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICAgICAgY2hhbGsueWVsbG93KFxuICAgICAgICAgICAgICAgICAgICBgcHJvY2VzcyAke3Nlc3Npb25JbmZvLnBpZH0gbm8gbG9uZ2VyIHJ1bm5pbmcgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YFxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbkluZm8uc3RhdHVzID0gJ2V4aXRlZCc7XG4gICAgICAgICAgICAgICAgaWYgKHNlc3Npb25JbmZvLmV4aXRDb2RlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgIHNlc3Npb25JbmZvLmV4aXRDb2RlID0gMTsgLy8gRGVmYXVsdCBleGl0IGNvZGUgZm9yIGRlYWQgcHJvY2Vzc2VzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuc2F2ZVNlc3Npb25JbmZvKHNlc3Npb25JZCwgc2Vzc2lvbkluZm8pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhzdGRvdXRQYXRoKSkge1xuICAgICAgICAgICAgICBjb25zdCBsYXN0TW9kaWZpZWQgPSBmcy5zdGF0U3luYyhzdGRvdXRQYXRoKS5tdGltZS50b0lTT1N0cmluZygpO1xuICAgICAgICAgICAgICBzZXNzaW9ucy5wdXNoKHsgLi4uc2Vzc2lvbkluZm8sIGlkOiBzZXNzaW9uSWQsIGxhc3RNb2RpZmllZCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHNlc3Npb25zLnB1c2goeyAuLi5zZXNzaW9uSW5mbywgaWQ6IHNlc3Npb25JZCwgbGFzdE1vZGlmaWVkOiBzZXNzaW9uSW5mby5zdGFydGVkQXQgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFNvcnQgYnkgc3RhcnRlZEF0IHRpbWVzdGFtcCAobmV3ZXN0IGZpcnN0KVxuICAgICAgc2Vzc2lvbnMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBhVGltZSA9IGEuc3RhcnRlZEF0ID8gbmV3IERhdGUoYS5zdGFydGVkQXQpLmdldFRpbWUoKSA6IDA7XG4gICAgICAgIGNvbnN0IGJUaW1lID0gYi5zdGFydGVkQXQgPyBuZXcgRGF0ZShiLnN0YXJ0ZWRBdCkuZ2V0VGltZSgpIDogMDtcbiAgICAgICAgcmV0dXJuIGJUaW1lIC0gYVRpbWU7XG4gICAgICB9KTtcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBsaXN0U2Vzc2lvbnMgZm91bmQgJHtzZXNzaW9ucy5sZW5ndGh9IHNlc3Npb25zYCk7XG4gICAgICBzZXNzaW9ucy5mb3JFYWNoKChzZXNzaW9uKSA9PiB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICBgICAtIFNlc3Npb24gJHtzZXNzaW9uLmlkfTogbmFtZT1cIiR7c2Vzc2lvbi5uYW1lfVwiLCBzdGF0dXM9XCIke3Nlc3Npb24uc3RhdHVzfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gc2Vzc2lvbnM7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byBsaXN0IHNlc3Npb25zOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gLFxuICAgICAgICAnTElTVF9TRVNTSU9OU19GQUlMRUQnXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBhIHNlc3Npb24gZXhpc3RzXG4gICAqL1xuICBzZXNzaW9uRXhpc3RzKHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3Qgc2Vzc2lvbkRpciA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQpO1xuICAgIGNvbnN0IHNlc3Npb25Kc29uUGF0aCA9IHBhdGguam9pbihzZXNzaW9uRGlyLCAnc2Vzc2lvbi5qc29uJyk7XG4gICAgcmV0dXJuIGZzLmV4aXN0c1N5bmMoc2Vzc2lvbkpzb25QYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbnVwIGEgc3BlY2lmaWMgc2Vzc2lvblxuICAgKi9cbiAgY2xlYW51cFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIXNlc3Npb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFB0eUVycm9yKCdTZXNzaW9uIElEIGlzIHJlcXVpcmVkIGZvciBjbGVhbnVwJywgJ0lOVkFMSURfU0VTU0lPTl9JRCcpO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXNzaW9uRGlyID0gcGF0aC5qb2luKHRoaXMuY29udHJvbFBhdGgsIHNlc3Npb25JZCk7XG5cbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNlc3Npb25EaXIpKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgQ2xlYW5pbmcgdXAgc2Vzc2lvbiBkaXJlY3Rvcnk6ICR7c2Vzc2lvbkRpcn1gKTtcblxuICAgICAgICAvLyBMb2cgc2Vzc2lvbiBpbmZvIGJlZm9yZSBjbGVhbnVwIGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgY29uc3Qgc2Vzc2lvbkluZm8gPSB0aGlzLmxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuICAgICAgICBpZiAoc2Vzc2lvbkluZm8pIHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYENsZWFuaW5nIHVwIHNlc3Npb24gJHtzZXNzaW9uSWR9IHdpdGggc3RhdHVzOiAke3Nlc3Npb25JbmZvLnN0YXR1c31gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbW92ZSBkaXJlY3RvcnkgYW5kIGFsbCBjb250ZW50c1xuICAgICAgICBmcy5ybVN5bmMoc2Vzc2lvbkRpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuICAgICAgICBsb2dnZXIuZGVidWcoY2hhbGsuZ3JlZW4oYHNlc3Npb24gJHtzZXNzaW9uSWR9IGNsZWFuZWQgdXBgKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZGVidWcoYFNlc3Npb24gZGlyZWN0b3J5ICR7c2Vzc2lvbkRpcn0gZG9lcyBub3QgZXhpc3QsIG5vdGhpbmcgdG8gY2xlYW4gdXBgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhyb3cgbmV3IFB0eUVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIGNsZWFudXAgc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXG4gICAgICAgICdDTEVBTlVQX0ZBSUxFRCcsXG4gICAgICAgIHNlc3Npb25JZFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xlYW51cCBhbGwgZXhpdGVkIHNlc3Npb25zXG4gICAqL1xuICBjbGVhbnVwRXhpdGVkU2Vzc2lvbnMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IGNsZWFuZWRTZXNzaW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXNzaW9ucyA9IHRoaXMubGlzdFNlc3Npb25zKCk7XG5cbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuICAgICAgICBpZiAoc2Vzc2lvbi5zdGF0dXMgPT09ICdleGl0ZWQnICYmIHNlc3Npb24uaWQpIHtcbiAgICAgICAgICB0aGlzLmNsZWFudXBTZXNzaW9uKHNlc3Npb24uaWQpO1xuICAgICAgICAgIGNsZWFuZWRTZXNzaW9ucy5wdXNoKHNlc3Npb24uaWQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGVhbmVkU2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBsb2dnZXIuZGVidWcoY2hhbGsuZ3JlZW4oYGNsZWFuZWQgdXAgJHtjbGVhbmVkU2Vzc2lvbnMubGVuZ3RofSBleGl0ZWQgc2Vzc2lvbnNgKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gY2xlYW5lZFNlc3Npb25zO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgUHR5RXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gY2xlYW51cCBleGl0ZWQgc2Vzc2lvbnM6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXG4gICAgICAgICdDTEVBTlVQX0VYSVRFRF9GQUlMRUQnXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbnVwIHNlc3Npb25zIGZyb20gb2xkIFZpYmVUdW5uZWwgdmVyc2lvbnNcbiAgICogVGhpcyBpcyBjYWxsZWQgZHVyaW5nIHNlcnZlciBzdGFydHVwIHRvIGNsZWFuIHNlc3Npb25zIHdoZW4gdmVyc2lvbiBjaGFuZ2VzXG4gICAqL1xuICBjbGVhbnVwT2xkVmVyc2lvblNlc3Npb25zKCk6IHsgdmVyc2lvbkNoYW5nZWQ6IGJvb2xlYW47IGNsZWFuZWRDb3VudDogbnVtYmVyIH0ge1xuICAgIGNvbnN0IGxhc3RWZXJzaW9uID0gdGhpcy5yZWFkTGFzdFZlcnNpb24oKTtcbiAgICBjb25zdCBjdXJyZW50VmVyc2lvbiA9IFZFUlNJT047XG5cbiAgICAvLyBJZiBubyB2ZXJzaW9uIGZpbGUgZXhpc3RzLCB0aGlzIGlzIGxpa2VseSBhIGZyZXNoIGluc3RhbGwgb3IgZmlyc3QgdGltZSB3aXRoIHZlcnNpb24gdHJhY2tpbmdcbiAgICBpZiAoIWxhc3RWZXJzaW9uKSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ25vIHByZXZpb3VzIHZlcnNpb24gZm91bmQsIGNoZWNraW5nIGZvciBsZWdhY3kgc2Vzc2lvbnMnKTtcblxuICAgICAgLy8gRmlyc3QgdXBkYXRlIHpvbWJpZSBzZXNzaW9ucyB0byBtYXJrIGRlYWQgcHJvY2Vzc2VzXG4gICAgICB0aGlzLnVwZGF0ZVpvbWJpZVNlc3Npb25zKCk7XG5cbiAgICAgIC8vIENsZWFuIHVwIGFueSBzZXNzaW9ucyB3aXRob3V0IHZlcnNpb24gZmllbGQgdGhhdCBhcmUgYWxzbyBub3QgYWN0aXZlXG4gICAgICBsZXQgY2xlYW5lZENvdW50ID0gMDtcbiAgICAgIGNvbnN0IHNlc3Npb25zID0gdGhpcy5saXN0U2Vzc2lvbnMoKTtcbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuICAgICAgICBpZiAoIXNlc3Npb24udmVyc2lvbikge1xuICAgICAgICAgIC8vIE9ubHkgY2xlYW4gaWYgdGhlIHNlc3Npb24gaXMgbm90IGFjdGl2ZWx5IHJ1bm5pbmdcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXNzaW9uLnN0YXR1cyA9PT0gJ2V4aXRlZCcgfHxcbiAgICAgICAgICAgIChzZXNzaW9uLnBpZCAmJiAhUHJvY2Vzc1V0aWxzLmlzUHJvY2Vzc1J1bm5pbmcoc2Vzc2lvbi5waWQpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBjbGVhbmluZyB1cCBsZWdhY3kgem9tYmllIHNlc3Npb24gJHtzZXNzaW9uLmlkfSAobm8gdmVyc2lvbiBmaWVsZClgKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYW51cFNlc3Npb24oc2Vzc2lvbi5pZCk7XG4gICAgICAgICAgICBjbGVhbmVkQ291bnQrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBwcmVzZXJ2aW5nIGFjdGl2ZSBsZWdhY3kgc2Vzc2lvbiAke3Nlc3Npb24uaWR9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMud3JpdGVDdXJyZW50VmVyc2lvbigpO1xuICAgICAgcmV0dXJuIHsgdmVyc2lvbkNoYW5nZWQ6IGZhbHNlLCBjbGVhbmVkQ291bnQgfTtcbiAgICB9XG5cbiAgICAvLyBJZiB2ZXJzaW9uIGhhc24ndCBjaGFuZ2VkLCBub3RoaW5nIHRvIGRvXG4gICAgaWYgKGxhc3RWZXJzaW9uID09PSBjdXJyZW50VmVyc2lvbikge1xuICAgICAgbG9nZ2VyLmRlYnVnKGB2ZXJzaW9uIHVuY2hhbmdlZCAoJHtjdXJyZW50VmVyc2lvbn0pLCBza2lwcGluZyBjbGVhbnVwYCk7XG4gICAgICByZXR1cm4geyB2ZXJzaW9uQ2hhbmdlZDogZmFsc2UsIGNsZWFuZWRDb3VudDogMCB9O1xuICAgIH1cblxuICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KGBWaWJlVHVubmVsIHZlcnNpb24gY2hhbmdlZCBmcm9tICR7bGFzdFZlcnNpb259IHRvICR7Y3VycmVudFZlcnNpb259YCkpO1xuICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KCdjbGVhbmluZyB1cCB6b21iaWUgc2Vzc2lvbnMgZnJvbSBvbGQgdmVyc2lvbi4uLicpKTtcblxuICAgIC8vIEZpcnN0IHVwZGF0ZSB6b21iaWUgc2Vzc2lvbnMgdG8gbWFyayBkZWFkIHByb2Nlc3Nlc1xuICAgIHRoaXMudXBkYXRlWm9tYmllU2Vzc2lvbnMoKTtcblxuICAgIGxldCBjbGVhbmVkQ291bnQgPSAwO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXNzaW9ucyA9IHRoaXMubGlzdFNlc3Npb25zKCk7XG5cbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuICAgICAgICAvLyBPbmx5IGNsZWFuIHNlc3Npb25zIHRoYXQgZG9uJ3QgbWF0Y2ggdGhlIGN1cnJlbnQgdmVyc2lvbiBBTkQgYXJlIG5vdCBhY3RpdmVcbiAgICAgICAgaWYgKCFzZXNzaW9uLnZlcnNpb24gfHwgc2Vzc2lvbi52ZXJzaW9uICE9PSBjdXJyZW50VmVyc2lvbikge1xuICAgICAgICAgIC8vIENoZWNrIGlmIHNlc3Npb24gaXMgYWN0dWFsbHkgZGVhZC96b21iaWVcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXNzaW9uLnN0YXR1cyA9PT0gJ2V4aXRlZCcgfHxcbiAgICAgICAgICAgIChzZXNzaW9uLnBpZCAmJiAhUHJvY2Vzc1V0aWxzLmlzUHJvY2Vzc1J1bm5pbmcoc2Vzc2lvbi5waWQpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICBgY2xlYW5pbmcgdXAgem9tYmllIHNlc3Npb24gJHtzZXNzaW9uLmlkfSAodmVyc2lvbjogJHtzZXNzaW9uLnZlcnNpb24gfHwgJ3Vua25vd24nfSlgXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgdGhpcy5jbGVhbnVwU2Vzc2lvbihzZXNzaW9uLmlkKTtcbiAgICAgICAgICAgIGNsZWFuZWRDb3VudCsrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgIGBwcmVzZXJ2aW5nIGFjdGl2ZSBzZXNzaW9uICR7c2Vzc2lvbi5pZH0gKHZlcnNpb246ICR7c2Vzc2lvbi52ZXJzaW9uIHx8ICd1bmtub3duJ30pYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gVXBkYXRlIHRoZSB2ZXJzaW9uIGZpbGUgdG8gY3VycmVudCB2ZXJzaW9uXG4gICAgICB0aGlzLndyaXRlQ3VycmVudFZlcnNpb24oKTtcblxuICAgICAgaWYgKGNsZWFuZWRDb3VudCA+IDApIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgY2xlYW5lZCB1cCAke2NsZWFuZWRDb3VudH0gem9tYmllIHNlc3Npb25zIGZyb20gcHJldmlvdXMgdmVyc2lvbmApKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheSgnbm8gem9tYmllIHNlc3Npb25zIHRvIGNsZWFuIHVwIChhY3RpdmUgc2Vzc2lvbnMgcHJlc2VydmVkKScpKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsgdmVyc2lvbkNoYW5nZWQ6IHRydWUsIGNsZWFuZWRDb3VudCB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBjbGVhbnVwIG9sZCB2ZXJzaW9uIHNlc3Npb25zOiAke2Vycm9yfWApO1xuICAgICAgLy8gU3RpbGwgdXBkYXRlIHZlcnNpb24gZmlsZSB0byBwcmV2ZW50IHJlcGVhdGVkIGNsZWFudXAgYXR0ZW1wdHNcbiAgICAgIHRoaXMud3JpdGVDdXJyZW50VmVyc2lvbigpO1xuICAgICAgcmV0dXJuIHsgdmVyc2lvbkNoYW5nZWQ6IHRydWUsIGNsZWFuZWRDb3VudCB9O1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc2Vzc2lvbiBwYXRocyBmb3IgYSBnaXZlbiBzZXNzaW9uIElEXG4gICAqL1xuICBnZXRTZXNzaW9uUGF0aHMoXG4gICAgc2Vzc2lvbklkOiBzdHJpbmcsXG4gICAgY2hlY2tFeGlzdHM6IGJvb2xlYW4gPSBmYWxzZVxuICApOiB7XG4gICAgY29udHJvbERpcjogc3RyaW5nO1xuICAgIHN0ZG91dFBhdGg6IHN0cmluZztcbiAgICBzdGRpblBhdGg6IHN0cmluZztcbiAgICBzZXNzaW9uSnNvblBhdGg6IHN0cmluZztcbiAgfSB8IG51bGwge1xuICAgIGNvbnN0IHNlc3Npb25EaXIgPSBwYXRoLmpvaW4odGhpcy5jb250cm9sUGF0aCwgc2Vzc2lvbklkKTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgW1Nlc3Npb25NYW5hZ2VyXSBnZXRTZXNzaW9uUGF0aHMgZm9yICR7c2Vzc2lvbklkfSwgc2Vzc2lvbkRpcjogJHtzZXNzaW9uRGlyfSwgY2hlY2tFeGlzdHM6ICR7Y2hlY2tFeGlzdHN9YFxuICAgICk7XG5cbiAgICBpZiAoY2hlY2tFeGlzdHMgJiYgIWZzLmV4aXN0c1N5bmMoc2Vzc2lvbkRpcikpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1Nlc3Npb25NYW5hZ2VyXSBTZXNzaW9uIGRpcmVjdG9yeSBkb2VzIG5vdCBleGlzdDogJHtzZXNzaW9uRGlyfWApO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRyb2xEaXI6IHNlc3Npb25EaXIsXG4gICAgICBzdGRvdXRQYXRoOiBwYXRoLmpvaW4oc2Vzc2lvbkRpciwgJ3N0ZG91dCcpLFxuICAgICAgc3RkaW5QYXRoOiBwYXRoLmpvaW4oc2Vzc2lvbkRpciwgJ3N0ZGluJyksXG4gICAgICBzZXNzaW9uSnNvblBhdGg6IHBhdGguam9pbihzZXNzaW9uRGlyLCAnc2Vzc2lvbi5qc29uJyksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSB0byBzdGRpbiBwaXBlL2ZpbGVcbiAgICovXG4gIHdyaXRlVG9TdGRpbihzZXNzaW9uSWQ6IHN0cmluZywgZGF0YTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgcGF0aHMgPSB0aGlzLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQpO1xuICAgIGlmICghcGF0aHMpIHtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25JZH0gbm90IGZvdW5kYCwgJ1NFU1NJT05fTk9UX0ZPVU5EJywgc2Vzc2lvbklkKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gRm9yIEZJRk8gcGlwZXMsIHdlIG5lZWQgdG8gb3BlbiBpbiBhcHBlbmQgbW9kZVxuICAgICAgLy8gRm9yIHJlZ3VsYXIgZmlsZXMsIHdlIGFsc28gdXNlIGFwcGVuZCBtb2RlIHRvIGF2b2lkIGNvbmZsaWN0c1xuICAgICAgZnMuYXBwZW5kRmlsZVN5bmMocGF0aHMuc3RkaW5QYXRoLCBkYXRhKTtcbiAgICAgIGxvZ2dlci5kZWJ1Zyhgd3JvdGUgJHtkYXRhLmxlbmd0aH0gYnl0ZXMgdG8gc3RkaW4gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRocm93IG5ldyBQdHlFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byB3cml0ZSB0byBzdGRpbiBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXG4gICAgICAgICdTVERJTl9XUklURV9GQUlMRUQnLFxuICAgICAgICBzZXNzaW9uSWRcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBzZXNzaW9ucyB0aGF0IGhhdmUgem9tYmllIHByb2Nlc3Nlc1xuICAgKi9cbiAgdXBkYXRlWm9tYmllU2Vzc2lvbnMoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IHVwZGF0ZWRTZXNzaW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBzZXNzaW9ucyA9IHRoaXMubGlzdFNlc3Npb25zKCk7XG5cbiAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuICAgICAgICBpZiAoc2Vzc2lvbi5zdGF0dXMgPT09ICdydW5uaW5nJyAmJiBzZXNzaW9uLnBpZCkge1xuICAgICAgICAgIGlmICghUHJvY2Vzc1V0aWxzLmlzUHJvY2Vzc1J1bm5pbmcoc2Vzc2lvbi5waWQpKSB7XG4gICAgICAgICAgICAvLyBQcm9jZXNzIGlzIGRlYWQsIHVwZGF0ZSBzdGF0dXNcbiAgICAgICAgICAgIGNvbnN0IHBhdGhzID0gdGhpcy5nZXRTZXNzaW9uUGF0aHMoc2Vzc2lvbi5pZCk7XG4gICAgICAgICAgICBpZiAocGF0aHMpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICAgIGNoYWxrLnllbGxvdyhcbiAgICAgICAgICAgICAgICAgIGBtYXJraW5nIHpvbWJpZSBwcm9jZXNzICR7c2Vzc2lvbi5waWR9IGFzIGV4aXRlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9YFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgdGhpcy51cGRhdGVTZXNzaW9uU3RhdHVzKHNlc3Npb24uaWQsICdleGl0ZWQnLCB1bmRlZmluZWQsIDEpO1xuICAgICAgICAgICAgICB1cGRhdGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uLmlkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHVwZGF0ZWRTZXNzaW9ucztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2ZhaWxlZCB0byB1cGRhdGUgem9tYmllIHNlc3Npb25zOicsIGVycm9yKTtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IGNvbnRyb2wgcGF0aFxuICAgKi9cbiAgZ2V0Q29udHJvbFBhdGgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5jb250cm9sUGF0aDtcbiAgfVxufVxuIl19