/**
 * Error deduplication utility to prevent log spam
 *
 * This helper tracks and deduplicates repeated errors, logging them
 * at controlled intervals to avoid overwhelming the logs.
 */
export interface ErrorInfo {
    count: number;
    lastLogged: number;
    firstSeen: number;
}
export interface DeduplicationOptions {
    /** Minimum time between logging the same error (ms). Default: 60000 (1 minute) */
    minLogInterval?: number;
    /** Log a summary every N occurrences. Default: 100 */
    summaryInterval?: number;
    /** Maximum cache size before cleanup. Default: 100 */
    maxCacheSize?: number;
    /** Cache entry TTL (ms). Default: 300000 (5 minutes) */
    cacheEntryTTL?: number;
    /** Maximum length of error key. Default: 100 */
    maxKeyLength?: number;
    /** Function to extract error key. Default: uses error message + context substring */
    keyExtractor?: (error: unknown, context?: string) => string;
}
export declare class ErrorDeduplicator {
    private errorCache;
    private options;
    constructor(options?: DeduplicationOptions);
    /**
     * Check if an error should be logged, and track it
     * @returns true if the error should be logged, false if it should be suppressed
     */
    shouldLog(error: unknown, context?: string): boolean;
    /**
     * Get error statistics for a given error
     */
    getErrorStats(error: unknown, context?: string): ErrorInfo | undefined;
    /**
     * Clear all cached errors
     */
    clear(): void;
    /**
     * Get the number of unique errors being tracked
     */
    get size(): number;
    /**
     * Default key extractor
     */
    private defaultKeyExtractor;
    /**
     * Clean up old cache entries if cache is too large
     */
    private cleanupCacheIfNeeded;
}
/**
 * Format an error summary message
 */
export declare function formatErrorSummary(error: unknown, stats: ErrorInfo, context?: string): string;
/**
 * Create a singleton error deduplicator with default options
 */
export declare const defaultErrorDeduplicator: ErrorDeduplicator;
