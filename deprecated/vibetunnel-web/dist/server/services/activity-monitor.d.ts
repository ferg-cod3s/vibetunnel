import type { SessionActivity } from '../../shared/types.js';
/**
 * ActivityMonitor tracks the real-time activity status of terminal sessions by monitoring
 * their output streams. It provides a lightweight way to determine which sessions are
 * actively producing output versus idle sessions.
 *
 * Key features:
 * - Monitors stdout file changes to detect terminal output activity
 * - Maintains activity state with configurable timeout (default 500ms)
 * - Automatically discovers new sessions and cleans up removed ones
 * - Writes activity status to disk for external consumers
 * - Provides both individual and bulk activity status queries
 *
 * @example
 * ```typescript
 * // Create and start the activity monitor
 * const monitor = new ActivityMonitor('/var/lib/vibetunnel/control');
 * monitor.start();
 *
 * // Get activity status for all sessions
 * const allStatus = monitor.getActivityStatus();
 * console.log(allStatus);
 * // {
 * //   'session-123': { isActive: true, timestamp: '2024-01-01T12:00:00Z', session: {...} },
 * //   'session-456': { isActive: false, timestamp: '2024-01-01T11:59:00Z', session: {...} }
 * // }
 *
 * // Get status for a specific session
 * const sessionStatus = monitor.getSessionActivityStatus('session-123');
 * if (sessionStatus?.isActive) {
 *   console.log('Session is actively producing output');
 * }
 *
 * // Clean up when done
 * monitor.stop();
 * ```
 */
export declare class ActivityMonitor {
    private controlPath;
    private activities;
    private watchers;
    private checkInterval;
    private readonly ACTIVITY_TIMEOUT;
    private readonly CHECK_INTERVAL;
    constructor(controlPath: string);
    /**
     * Start monitoring all sessions for activity
     */
    start(): void;
    /**
     * Stop monitoring
     */
    stop(): void;
    /**
     * Scan for sessions and start monitoring new ones
     */
    private scanSessions;
    /**
     * Start monitoring a specific session
     */
    private startMonitoringSession;
    /**
     * Stop monitoring a specific session
     */
    private stopMonitoringSession;
    /**
     * Handle file change event
     */
    private handleFileChange;
    /**
     * Update activity states based on timeout
     */
    private updateActivityStates;
    /**
     * Write activity status to disk
     */
    private writeActivityStatus;
    /**
     * Get activity status for all sessions
     */
    getActivityStatus(): Record<string, SessionActivity>;
    /**
     * Get activity status for a specific session
     */
    getSessionActivityStatus(sessionId: string): SessionActivity | null;
}
