/**
 * Process tree utilities for detecting parent processes
 */
interface ProcessInfo {
    pid: number;
    ppid: number;
    command: string;
}
/**
 * Get the process tree starting from current process up to root
 * Returns array of process info from current to root
 */
export declare function getProcessTree(): ProcessInfo[];
/**
 * Check if any process in the tree matches Claude patterns
 * Returns true if Claude is detected in the process tree
 */
export declare function isClaudeInProcessTree(): boolean;
/**
 * Get the Claude command from the process tree if available
 * Returns the full command line of the Claude process or null
 */
export declare function getClaudeCommandFromTree(): string | null;
export {};
