import type { MultiplexerStatus, MultiplexerType, TmuxPane, TmuxWindow } from '../../shared/multiplexer-types.js';
import type { SessionCreateOptions } from '../../shared/types.js';
import type { PtyManager } from '../pty/pty-manager.js';
export declare class MultiplexerManager {
    private static instance;
    private tmuxManager;
    private zellijManager;
    private screenManager;
    private ptyManager;
    private constructor();
    static getInstance(ptyManager: PtyManager): MultiplexerManager;
    /**
     * Get available multiplexers and their sessions
     */
    getAvailableMultiplexers(): Promise<MultiplexerStatus>;
    /**
     * Get windows for a tmux session
     */
    getTmuxWindows(sessionName: string): Promise<TmuxWindow[]>;
    /**
     * Get panes for a tmux window
     */
    getTmuxPanes(sessionName: string, windowIndex?: number): Promise<TmuxPane[]>;
    /**
     * Create a new session
     */
    createSession(type: MultiplexerType, name: string, options?: {
        command?: string[];
        layout?: string;
    }): Promise<void>;
    /**
     * Attach to a session
     */
    attachToSession(type: MultiplexerType, sessionName: string, options?: Partial<SessionCreateOptions> & {
        windowIndex?: number;
        paneIndex?: number;
    }): Promise<string>;
    /**
     * Kill/delete a session
     */
    killSession(type: MultiplexerType, sessionName: string): Promise<void>;
    /**
     * Kill a tmux window
     */
    killTmuxWindow(sessionName: string, windowIndex: number): Promise<void>;
    /**
     * Kill a tmux pane
     */
    killTmuxPane(sessionName: string, paneId: string): Promise<void>;
    /**
     * Check which multiplexer we're currently inside
     */
    getCurrentMultiplexer(): {
        type: MultiplexerType;
        session: string;
    } | null;
}
