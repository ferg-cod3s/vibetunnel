import type { TmuxPane, TmuxSession, TmuxWindow } from '../../shared/tmux-types.js';
import { type SessionCreateOptions } from '../../shared/types.js';
import type { PtyManager } from '../pty/pty-manager.js';
export declare class TmuxManager {
    private static instance;
    private ptyManager;
    private constructor();
    /**
     * Validate session name to prevent command injection
     */
    private validateSessionName;
    /**
     * Validate window index
     */
    private validateWindowIndex;
    /**
     * Validate pane index
     */
    private validatePaneIndex;
    static getInstance(ptyManager: PtyManager): TmuxManager;
    /**
     * Check if tmux is installed and available
     */
    isAvailable(): Promise<boolean>;
    /**
     * List all tmux sessions
     */
    listSessions(): Promise<TmuxSession[]>;
    /**
     * List windows in a tmux session
     */
    listWindows(sessionName: string): Promise<TmuxWindow[]>;
    /**
     * List panes in a window
     */
    listPanes(sessionName: string, windowIndex?: number): Promise<TmuxPane[]>;
    /**
     * Create a new tmux session
     */
    createSession(name: string, command?: string[]): Promise<void>;
    /**
     * Attach to a tmux session/window/pane through VibeTunnel
     */
    attachToTmux(sessionName: string, windowIndex?: number, paneIndex?: number, options?: Partial<SessionCreateOptions>): Promise<string>;
    /**
     * Send a command to a specific tmux pane
     */
    sendToPane(sessionName: string, command: string, windowIndex?: number, paneIndex?: number): Promise<void>;
    /**
     * Kill a tmux session
     */
    killSession(sessionName: string): Promise<void>;
    /**
     * Kill a tmux window
     */
    killWindow(sessionName: string, windowIndex: number): Promise<void>;
    /**
     * Kill a tmux pane
     */
    killPane(sessionName: string, paneId: string): Promise<void>;
    /**
     * Check if inside a tmux session
     */
    isInsideTmux(): boolean;
    /**
     * Get the current tmux session name if inside tmux
     */
    getCurrentSession(): string | null;
}
