import { type SessionCreateOptions } from '../../shared/types.js';
import type { PtyManager } from '../pty/pty-manager.js';
export interface ZellijSession {
    name: string;
    created: string;
    exited: boolean;
}
export declare class ZellijManager {
    private static instance;
    private ptyManager;
    private constructor();
    /**
     * Validate session name to prevent command injection
     */
    private validateSessionName;
    /**
     * Strip ANSI escape codes from text
     */
    private stripAnsiCodes;
    static getInstance(ptyManager: PtyManager): ZellijManager;
    /**
     * Check if zellij is installed and available
     */
    isAvailable(): Promise<boolean>;
    /**
     * List all zellij sessions
     */
    listSessions(): Promise<ZellijSession[]>;
    /**
     * Get tabs for a session (requires being attached to query)
     * Note: Zellij doesn't provide a way to query tabs without being attached
     */
    getSessionTabs(sessionName: string): Promise<string[]>;
    /**
     * Create a new zellij session
     * Note: Zellij requires a terminal, so we create sessions through attachToZellij instead
     */
    createSession(name: string, layout?: string): Promise<void>;
    /**
     * Attach to a zellij session through VibeTunnel
     */
    attachToZellij(sessionName: string, options?: Partial<SessionCreateOptions> & {
        layout?: string;
    }): Promise<string>;
    /**
     * Kill a zellij session
     */
    killSession(sessionName: string): Promise<void>;
    /**
     * Delete a zellij session
     */
    deleteSession(sessionName: string): Promise<void>;
    /**
     * Check if inside a zellij session
     */
    isInsideZellij(): boolean;
    /**
     * Get the current zellij session name if inside zellij
     */
    getCurrentSession(): string | null;
}
