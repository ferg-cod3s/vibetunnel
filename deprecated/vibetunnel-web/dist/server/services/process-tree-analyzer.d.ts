export interface ProcessInfo {
    pid: number;
    ppid: number;
    pgid: number;
    sid?: number;
    tty?: string;
    command: string;
    state?: string;
    startTime?: string;
}
export interface ProcessSnapshot {
    sessionPid: number;
    processTree: ProcessInfo[];
    foregroundProcess: ProcessInfo | null;
    suspectedBellSource: ProcessInfo | null;
    capturedAt: string;
}
export declare class ProcessTreeAnalyzer {
    /**
     * Get the complete process tree for a given root process
     */
    getProcessTree(rootPid: number): Promise<ProcessInfo[]>;
    /**
     * Get process tree on Unix-like systems (macOS, Linux)
     */
    private getUnixProcessTree;
    /**
     * Get process tree on Windows systems
     */
    private getWindowsProcessTree;
    /**
     * Parse Unix/Linux ps command output
     */
    private parseUnixProcessOutput;
    /**
     * Parse Windows tasklist/wmic output
     */
    private parseWindowsProcessOutput;
    /**
     * Identify the most likely source of a bell event
     */
    identifyBellSource(sessionPid: number): Promise<ProcessInfo | null>;
    /**
     * Find the foreground process (likely the active process the user is interacting with)
     */
    private findForegroundProcess;
    /**
     * Find the most recently started child process
     */
    private findMostRecentChild;
    /**
     * Check if a process is likely a shell process
     */
    private isShellProcess;
    /**
     * Check if a process is likely a background process or shell utility
     */
    private isBackgroundProcess;
    /**
     * Get process tree recursively by finding children
     */
    private getProcessTreeRecursive;
    /**
     * Create a complete process snapshot for bell event analysis
     */
    captureProcessSnapshot(sessionPid: number): Promise<ProcessSnapshot>;
    /**
     * Extract a human-readable process name from a command string
     */
    static extractProcessName(command: string): string;
    /**
     * Get a short description of the process for notifications
     */
    static getProcessDescription(processInfo: ProcessInfo | null): string;
}
