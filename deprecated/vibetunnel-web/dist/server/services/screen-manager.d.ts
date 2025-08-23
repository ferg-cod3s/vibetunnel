import type { MultiplexerSession } from '../../shared/multiplexer-types.js';
/**
 * GNU Screen manager for terminal multiplexing
 *
 * Note: GNU Screen has a simpler model than tmux:
 * - Sessions (like tmux sessions)
 * - Windows (like tmux windows)
 * - No panes concept (screen uses split regions but they're not addressable like tmux panes)
 */
export declare class ScreenManager {
    private static instance;
    static getInstance(): ScreenManager;
    /**
     * Validate session name to prevent command injection
     */
    private validateSessionName;
    /**
     * Validate window index
     */
    private validateWindowIndex;
    /**
     * Check if screen is available
     */
    isAvailable(): Promise<boolean>;
    /**
     * List all screen sessions
     * Screen output format: <pid>.<sessionname>\t(<status>)
     * Example: 12345.my-session	(Detached)
     */
    listSessions(): Promise<MultiplexerSession[]>;
    /**
     * Create a new screen session
     */
    createSession(sessionName: string, command?: string): Promise<void>;
    /**
     * Attach to a screen session
     * For programmatic use, we'll create a new window in the session
     */
    attachToSession(sessionName: string, command?: string): Promise<string[]>;
    /**
     * Kill a screen session
     */
    killSession(sessionName: string): Promise<void>;
    /**
     * Check if inside a screen session
     */
    isInsideScreen(): boolean;
    /**
     * Get the current screen session name if inside screen
     */
    getCurrentSession(): string | null;
    /**
     * List windows in a screen session
     * Note: This is more limited than tmux - screen doesn't provide easy machine-readable output
     */
    listWindows(sessionName: string): Promise<Array<{
        index: number;
        name: string;
    }>>;
    /**
     * Create a new window in a screen session
     */
    createWindow(sessionName: string, windowName?: string, command?: string): Promise<void>;
    /**
     * Kill a window in a screen session
     * Note: Screen uses window numbers, not names for targeting
     */
    killWindow(sessionName: string, windowIndex: number): Promise<void>;
}
