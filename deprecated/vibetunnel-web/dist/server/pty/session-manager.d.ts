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
import type { Session, SessionInfo } from '../../shared/types.js';
export declare class SessionManager {
    private controlPath;
    private static readonly SESSION_ID_REGEX;
    constructor(controlPath?: string);
    /**
     * Validate session ID format for security
     */
    private validateSessionId;
    /**
     * Ensure the control directory exists
     */
    private ensureControlDirectory;
    /**
     * Get the path to the version tracking file
     */
    private getVersionFilePath;
    /**
     * Read the last known version from the version file
     */
    private readLastVersion;
    /**
     * Write the current version to the version file
     */
    private writeCurrentVersion;
    /**
     * Create a new session directory structure
     */
    createSessionDirectory(sessionId: string): {
        controlDir: string;
        stdoutPath: string;
        stdinPath: string;
        sessionJsonPath: string;
    };
    /**
     * Create stdin pipe (FIFO if possible, regular file otherwise)
     */
    private createStdinPipe;
    /**
     * Save session info to JSON file
     */
    saveSessionInfo(sessionId: string, sessionInfo: SessionInfo): void;
    /**
     * Load session info from JSON file
     */
    loadSessionInfo(sessionId: string): SessionInfo | null;
    /**
     * Update session status
     */
    updateSessionStatus(sessionId: string, status: string, pid?: number, exitCode?: number): void;
    /**
     * Ensure a session name is unique by adding a suffix if necessary
     */
    private ensureUniqueName;
    /**
     * Update session name
     */
    updateSessionName(sessionId: string, name: string): string;
    /**
     * List all sessions
     */
    listSessions(): Session[];
    /**
     * Check if a session exists
     */
    sessionExists(sessionId: string): boolean;
    /**
     * Cleanup a specific session
     */
    cleanupSession(sessionId: string): void;
    /**
     * Cleanup all exited sessions
     */
    cleanupExitedSessions(): string[];
    /**
     * Cleanup sessions from old VibeTunnel versions
     * This is called during server startup to clean sessions when version changes
     */
    cleanupOldVersionSessions(): {
        versionChanged: boolean;
        cleanedCount: number;
    };
    /**
     * Get session paths for a given session ID
     */
    getSessionPaths(sessionId: string, checkExists?: boolean): {
        controlDir: string;
        stdoutPath: string;
        stdinPath: string;
        sessionJsonPath: string;
    } | null;
    /**
     * Write to stdin pipe/file
     */
    writeToStdin(sessionId: string, data: string): void;
    /**
     * Update sessions that have zombie processes
     */
    updateZombieSessions(): string[];
    /**
     * Get control path
     */
    getControlPath(): string;
}
