/**
 * ProcessUtils - Cross-platform process management utilities
 *
 * Provides reliable process existence checking across Windows, macOS, and Linux.
 */
/**
 * Check if a process is currently running by PID
 * Uses platform-appropriate methods for reliable detection
 */
export declare function isProcessRunning(pid: number): boolean;
/**
 * Get basic process information if available
 * Returns null if process is not running or info cannot be retrieved
 */
export declare function getProcessInfo(pid: number): {
    pid: number;
    exists: boolean;
} | null;
/**
 * Kill a process with platform-appropriate method
 * Returns true if the kill signal was sent successfully
 */
export declare function killProcess(pid: number, signal?: NodeJS.Signals | number): boolean;
/**
 * Wait for a process to exit with timeout
 * Returns true if process exited within timeout, false otherwise
 */
export declare function waitForProcessExit(pid: number, timeoutMs?: number): Promise<boolean>;
/**
 * Determine how to spawn a command, checking if it exists in PATH or needs shell execution
 * Returns the actual command and args to use for spawning
 */
export declare function resolveCommand(command: string[]): {
    command: string;
    args: string[];
    useShell: boolean;
    isInteractive?: boolean;
    resolvedFrom?: 'path' | 'alias' | 'builtin' | 'shell';
    originalCommand?: string;
};
/**
 * Get the user's preferred shell
 * Falls back to sensible defaults if SHELL env var is not set
 */
export declare function getUserShell(): string;
export declare const ProcessUtils: {
    isProcessRunning: typeof isProcessRunning;
    getProcessInfo: typeof getProcessInfo;
    killProcess: typeof killProcess;
    waitForProcessExit: typeof waitForProcessExit;
    resolveCommand: typeof resolveCommand;
    getUserShell: typeof getUserShell;
};
