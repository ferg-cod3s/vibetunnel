/**
 * Set custom log file path
 */
export declare function setLogFilePath(filePath: string): void;
export declare enum VerbosityLevel {
    SILENT = 0,// No console output (logs to file only)
    ERROR = 1,// Errors only (default)
    WARN = 2,// Errors and warnings
    INFO = 3,// Errors, warnings, and info
    VERBOSE = 4,// All except debug
    DEBUG = 5
}
/**
 * Type-safe mapping of string names to verbosity levels
 */
export declare const VERBOSITY_MAP: Record<string, VerbosityLevel>;
/**
 * Type guard to check if a string is a valid VerbosityLevel key
 */
export declare function isVerbosityLevel(value: string): value is keyof typeof VERBOSITY_MAP;
/**
 * Parse a string to VerbosityLevel, returns undefined if invalid
 */
export declare function parseVerbosityLevel(value: string): VerbosityLevel | undefined;
/**
 * Initialize the logger - creates log directory and file
 */
export declare function initLogger(debug?: boolean, verbosity?: VerbosityLevel): void;
/**
 * Flush the log file buffer
 */
export declare function flushLogger(): Promise<void>;
/**
 * Close the logger
 */
export declare function closeLogger(): void;
/**
 * Enable or disable debug mode
 */
export declare function setDebugMode(enabled: boolean): void;
/**
 * Set verbosity level
 */
export declare function setVerbosityLevel(level: VerbosityLevel): void;
/**
 * Get current verbosity level
 */
export declare function getVerbosityLevel(): VerbosityLevel;
/**
 * Check if debug logging is enabled
 */
export declare function isDebugEnabled(): boolean;
/**
 * Check if verbose logging is enabled
 */
export declare function isVerbose(): boolean;
/**
 * Log from a specific module (used by client-side API)
 */
export declare function logFromModule(level: string, module: string, args: unknown[]): void;
/**
 * Create a logger for a specific module
 * This is the main factory function that should be used
 */
export declare function createLogger(moduleName: string): {
    /**
     * @deprecated Use info() instead for clarity
     */
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    setDebugMode: (enabled: boolean) => void;
    setVerbosity: (level: VerbosityLevel) => void;
};
