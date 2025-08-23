/**
 * SessionMonitor - Server-side monitoring of terminal sessions
 *
 * Replaces the Mac app's polling-based SessionMonitor with real-time
 * event detection directly from PTY streams. Tracks session states,
 * command execution, and Claude-specific activity transitions.
 */
import { EventEmitter } from 'events';
import type { PtyManager } from '../pty/pty-manager.js';
export interface SessionState {
    id: string;
    name: string;
    command: string[];
    workingDir: string;
    status: 'running' | 'exited';
    isRunning: boolean;
    pid?: number;
    activityStatus?: {
        isActive: boolean;
        lastActivity?: Date;
        specificStatus?: {
            app: string;
            status: string;
        };
    };
    commandStartTime?: Date;
    lastCommand?: string;
    lastExitCode?: number;
    isClaudeSession?: boolean;
    claudeActivityState?: 'active' | 'idle' | 'unknown';
}
export interface CommandFinishedEvent {
    sessionId: string;
    sessionName: string;
    command: string;
    duration: number;
    exitCode: number;
}
export interface ClaudeTurnEvent {
    sessionId: string;
    sessionName: string;
    message?: string;
}
export declare class SessionMonitor extends EventEmitter {
    private ptyManager;
    private sessions;
    private claudeIdleNotified;
    private lastActivityState;
    private commandThresholdMs;
    private claudeIdleTimers;
    constructor(ptyManager: PtyManager);
    private setupEventListeners;
    /**
     * Update session state with activity information
     */
    updateSessionActivity(sessionId: string, isActive: boolean, specificApp?: string): void;
    /**
     * Track PTY output for activity detection and bell characters
     */
    trackPtyOutput(sessionId: string, data: string): void;
    /**
     * Emit notification event for all clients (browsers and Mac app) via SSE
     */
    private emitNotificationEvent;
    /**
     * Map session monitor action to ServerEventType
     */
    private mapActionToServerEventType;
    /**
     * Update command information for a session
     */
    updateCommand(sessionId: string, command: string): void;
    /**
     * Handle command completion
     */
    handleCommandCompletion(sessionId: string, exitCode: number): void;
    private handleSessionStarted;
    private handleSessionExited;
    private handleCommandFinished;
    private handleClaudeTurn;
    private isClaudeSession;
    private detectClaudeCommand;
    private trackClaudeActivity;
    private detectClaudePatterns;
    /**
     * Get all active sessions
     */
    getActiveSessions(): SessionState[];
    /**
     * Get a specific session
     */
    getSession(sessionId: string): SessionState | undefined;
    /**
     * Initialize monitor with existing sessions
     */
    initialize(): Promise<void>;
}
