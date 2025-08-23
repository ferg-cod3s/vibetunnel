/**
 * PtyManager - Core PTY management using node-pty
 *
 * This class handles PTY creation, process management, and I/O operations
 * using the node-pty library while maintaining compatibility with tty-fwd.
 */
import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import type { Session, SessionCreateOptions, SessionInput } from '../../shared/types.js';
import type { SessionMonitor } from '../services/session-monitor.js';
import { SessionManager } from './session-manager.js';
import { type PtySession, type SessionCreationResult } from './types.js';
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
export declare class PtyManager extends EventEmitter {
    private sessions;
    private sessionManager;
    private defaultTerm;
    private inputSocketClients;
    private lastTerminalSize;
    private resizeEventListeners;
    private sessionResizeSources;
    private static initialized;
    private sessionEventListeners;
    private sessionExitTimes;
    private processTreeAnalyzer;
    private activityFileWarningsLogged;
    private lastWrittenActivityState;
    private sessionMonitor;
    private commandTracking;
    constructor(controlPath?: string);
    /**
     * Initialize PtyManager with fallback support for node-pty
     */
    static initialize(): Promise<void>;
    /**
     * Set the SessionMonitor instance for activity tracking
     */
    setSessionMonitor(monitor: SessionMonitor): void;
    /**
     * Setup terminal resize detection for when the hosting terminal is resized
     */
    private setupTerminalResizeDetection;
    /**
     * Handle terminal resize events from the hosting terminal
     */
    private handleTerminalResize;
    /**
     * Create a new PTY session
     */
    createSession(command: string[], options: SessionCreateOptions & {
        forwardToStdout?: boolean;
        onExit?: (exitCode: number, signal?: number) => void;
    }): Promise<SessionCreationResult>;
    getPtyForSession(sessionId: string): IPty | null;
    getInternalSession(sessionId: string): PtySession | undefined;
    /**
     * Setup event handlers for a PTY process
     */
    private setupPtyHandlers;
    /**
     * Setup Unix socket for all IPC communication
     */
    private setupIPCSocket;
    /**
     * Setup file watcher for session.json changes
     */
    private setupSessionWatcher;
    /**
     * Handle incoming socket messages
     */
    private handleSocketMessage;
    /**
     * Handle control messages from control pipe
     */
    private handleControlMessage;
    /**
     * Get fish shell completions for a partial command
     */
    getFishCompletions(sessionId: string, partial: string): Promise<string[]>;
    /**
     * Send text input to a session
     */
    sendInput(sessionId: string, input: SessionInput): void;
    /**
     * Send a control message to an external session via socket
     */
    private sendControlMessage;
    /**
     * Convert special key names to escape sequences
     */
    private convertSpecialKey;
    /**
     * Resize a session terminal
     */
    resizeSession(sessionId: string, cols: number, rows: number): void;
    /**
     * Update session name
     */
    updateSessionName(sessionId: string, name: string): string;
    /**
     * Reset session size to terminal size (for external terminals)
     */
    resetSessionSize(sessionId: string): void;
    /**
     * Detach from a tmux session gracefully
     * @param sessionId The session ID of the tmux attachment
     * @returns Promise that resolves when detached
     */
    private detachFromTmux;
    /**
     * Kill a session with proper SIGTERM -> SIGKILL escalation
     * Returns a promise that resolves when the process is actually terminated
     */
    killSession(sessionId: string, signal?: string | number): Promise<void>;
    /**
     * Kill session with SIGTERM -> SIGKILL escalation (3 seconds, check every 500ms)
     */
    private killSessionWithEscalation;
    /**
     * List all sessions (both active and persisted)
     */
    listSessions(): (Session | {
        activityStatus: {
            specificStatus?: {
                app: string;
                status: string;
            };
        };
        lastModified: string;
        active?: boolean;
        source?: "local" | "remote";
        remoteId?: string;
        remoteName?: string;
        remoteUrl?: string;
        id: string;
        name: string;
        command: string[];
        workingDir: string;
        status: import("../../shared/types.js").SessionStatus;
        exitCode?: number;
        startedAt: string;
        pid?: number;
        initialCols?: number;
        initialRows?: number;
        lastClearOffset?: number;
        version?: string;
        gitRepoPath?: string;
        gitBranch?: string;
        gitAheadCount?: number;
        gitBehindCount?: number;
        gitHasChanges?: boolean;
        gitIsWorktree?: boolean;
        gitMainRepoPath?: string;
        gitModifiedCount?: number;
        gitUntrackedCount?: number;
        gitStagedCount?: number;
        gitAddedCount?: number;
        gitDeletedCount?: number;
        attachedViaVT?: boolean;
    } | {
        activityStatus: {
            isActive: any;
            specificStatus: any;
        };
        lastModified: string;
        active?: boolean;
        source?: "local" | "remote";
        remoteId?: string;
        remoteName?: string;
        remoteUrl?: string;
        id: string;
        name: string;
        command: string[];
        workingDir: string;
        status: import("../../shared/types.js").SessionStatus;
        exitCode?: number;
        startedAt: string;
        pid?: number;
        initialCols?: number;
        initialRows?: number;
        lastClearOffset?: number;
        version?: string;
        gitRepoPath?: string;
        gitBranch?: string;
        gitAheadCount?: number;
        gitBehindCount?: number;
        gitHasChanges?: boolean;
        gitIsWorktree?: boolean;
        gitMainRepoPath?: string;
        gitModifiedCount?: number;
        gitUntrackedCount?: number;
        gitStagedCount?: number;
        gitAddedCount?: number;
        gitDeletedCount?: number;
        attachedViaVT?: boolean;
    })[];
    /**
     * Get a specific session
     */
    getSession(sessionId: string): Session | null;
    getSessionPaths(sessionId: string): {
        controlDir: string;
        stdoutPath: string;
        stdinPath: string;
        sessionJsonPath: string;
    } | null;
    /**
     * Cleanup a specific session
     */
    cleanupSession(sessionId: string): void;
    /**
     * Cleanup all exited sessions
     */
    cleanupExitedSessions(): string[];
    /**
     * Create environment variables for sessions
     */
    private createEnvVars;
    /**
     * Get active session count
     */
    getActiveSessionCount(): number;
    /**
     * Check if a session is active (has running PTY)
     */
    isSessionActive(sessionId: string): boolean;
    /**
     * Shutdown all active sessions and clean up resources
     */
    shutdown(): Promise<void>;
    /**
     * Get session manager instance
     */
    getSessionManager(): SessionManager;
    /**
     * Write activity state only if it has changed
     */
    private writeActivityState;
    /**
     * Track and emit events for proper cleanup
     */
    private trackAndEmit;
    /**
     * Clean up all resources associated with a session
     */
    private cleanupSessionResources;
    /**
     * Mark session for title update and trigger immediate check
     */
    private markTitleUpdateNeeded;
    /**
     * Update terminal title specifically for session name changes
     * This bypasses title mode checks to ensure name changes are always reflected
     */
    private updateTerminalTitleForSessionName;
    /**
     * Check if title needs updating and write if changed
     */
    private checkAndUpdateTitle;
    /**
     * Monitor for quiet period to safely inject title
     */
    private startTitleInjectionMonitor;
    /**
     * Generate terminal title based on session mode and state
     */
    private generateTerminalTitle;
    /**
     * Start tracking foreground process for command completion notifications
     */
    private startForegroundProcessTracking;
    /**
     * Get process group ID for a process
     */
    private getProcessPgid;
    /**
     * Get the foreground process group of a terminal
     */
    private getTerminalForegroundPgid;
    /**
     * Get foreground process from process tree analysis
     */
    private getForegroundFromProcessTree;
    /**
     * Check if a command is a shell process
     */
    private isShellProcess;
    /**
     * Check current foreground process and detect changes
     */
    private checkForegroundProcess;
    /**
     * Handle when a new command starts
     */
    private handleCommandStarted;
    /**
     * Handle when a command finishes
     */
    private handleCommandFinished;
    /**
     * Import necessary exec function
     */
    private execAsync;
}
