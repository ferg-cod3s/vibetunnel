/**
 * Formats a duration in milliseconds to a human-readable string
 */
export declare function formatDuration(ms: number): string;
/**
 * Calculates duration from a start time to now
 */
export declare function getDurationFromStart(startTime: string): number;
/**
 * Calculates duration between two times
 */
export declare function getDurationBetween(startTime: string, endTime: string): number;
/**
 * Formats session duration for display
 * For running sessions, calculates from startedAt to now
 * For exited sessions, calculates from startedAt to endedAt
 * If endedAt is invalid or before startedAt, shows "0s"
 */
export declare function formatSessionDuration(startedAt: string, endedAt?: string): string;
