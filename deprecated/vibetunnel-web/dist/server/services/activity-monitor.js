"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityMonitor = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('activity-monitor');
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
class ActivityMonitor {
    constructor(controlPath) {
        this.activities = new Map();
        this.watchers = new Map();
        this.checkInterval = null;
        this.ACTIVITY_TIMEOUT = 500; // 500ms of no activity = inactive
        this.CHECK_INTERVAL = 100; // Check every 100ms
        this.controlPath = controlPath;
    }
    /**
     * Start monitoring all sessions for activity
     */
    start() {
        logger.log(chalk_1.default.green('activity monitor started'));
        // Initial scan of existing sessions
        const sessionCount = this.scanSessions();
        if (sessionCount > 0) {
            logger.log(chalk_1.default.blue(`monitoring ${sessionCount} existing sessions`));
        }
        // Set up periodic scanning for new sessions
        this.checkInterval = setInterval(() => {
            this.scanSessions();
            this.updateActivityStates();
        }, this.CHECK_INTERVAL);
    }
    /**
     * Stop monitoring
     */
    stop() {
        logger.log(chalk_1.default.yellow('stopping activity monitor'));
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        // Close all watchers
        const watcherCount = this.watchers.size;
        for (const [sessionId, watcher] of this.watchers) {
            watcher.close();
            this.watchers.delete(sessionId);
        }
        this.activities.clear();
        if (watcherCount > 0) {
            logger.log(chalk_1.default.gray(`closed ${watcherCount} file watchers`));
        }
    }
    /**
     * Scan for sessions and start monitoring new ones
     */
    scanSessions() {
        try {
            if (!fs.existsSync(this.controlPath)) {
                return 0;
            }
            const entries = fs.readdirSync(this.controlPath, { withFileTypes: true });
            let newSessions = 0;
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const sessionId = entry.name;
                    // Skip if already monitoring
                    if (this.activities.has(sessionId)) {
                        continue;
                    }
                    const streamOutPath = path.join(this.controlPath, sessionId, 'stdout');
                    // Check if stdout exists
                    if (fs.existsSync(streamOutPath)) {
                        if (this.startMonitoringSession(sessionId, streamOutPath)) {
                            newSessions++;
                        }
                    }
                }
            }
            // Clean up sessions that no longer exist
            const sessionsToCleanup = [];
            for (const [sessionId, _] of this.activities) {
                const sessionDir = path.join(this.controlPath, sessionId);
                if (!fs.existsSync(sessionDir)) {
                    sessionsToCleanup.push(sessionId);
                }
            }
            if (sessionsToCleanup.length > 0) {
                logger.log(chalk_1.default.yellow(`cleaning up ${sessionsToCleanup.length} removed sessions`));
                for (const sessionId of sessionsToCleanup) {
                    this.stopMonitoringSession(sessionId);
                }
            }
            return newSessions;
        }
        catch (error) {
            logger.error('failed to scan sessions:', error);
            return 0;
        }
    }
    /**
     * Start monitoring a specific session
     */
    startMonitoringSession(sessionId, streamOutPath) {
        try {
            const stats = fs.statSync(streamOutPath);
            // Initialize activity tracking
            this.activities.set(sessionId, {
                sessionId,
                isActive: false,
                lastActivityTime: Date.now(),
                lastFileSize: stats.size,
            });
            // Watch for file changes
            const watcher = fs.watch(streamOutPath, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange(sessionId, streamOutPath);
                }
            });
            this.watchers.set(sessionId, watcher);
            logger.debug(`started monitoring session ${sessionId}`);
            return true;
        }
        catch (error) {
            logger.error(`failed to start monitor for session ${sessionId}:`, error);
            return false;
        }
    }
    /**
     * Stop monitoring a specific session
     */
    stopMonitoringSession(sessionId) {
        const watcher = this.watchers.get(sessionId);
        if (watcher) {
            watcher.close();
            this.watchers.delete(sessionId);
        }
        this.activities.delete(sessionId);
        logger.debug(`stopped monitoring session ${sessionId}`);
    }
    /**
     * Handle file change event
     */
    handleFileChange(sessionId, streamOutPath) {
        try {
            const activity = this.activities.get(sessionId);
            if (!activity)
                return;
            // Check if file still exists before trying to stat it
            if (!fs.existsSync(streamOutPath)) {
                // Session has been cleaned up, stop monitoring
                this.stopMonitoringSession(sessionId);
                return;
            }
            const stats = fs.statSync(streamOutPath);
            // Check if file size increased (new output)
            if (stats.size > activity.lastFileSize) {
                const wasActive = activity.isActive;
                activity.isActive = true;
                activity.lastActivityTime = Date.now();
                activity.lastFileSize = stats.size;
                // Log state transition
                if (!wasActive) {
                    logger.debug(`session ${sessionId} became active`);
                }
                // Write activity status immediately
                this.writeActivityStatus(sessionId, true);
            }
        }
        catch (error) {
            // Check if error is ENOENT (file not found)
            if (error.code === 'ENOENT') {
                // Session has been cleaned up, stop monitoring
                this.stopMonitoringSession(sessionId);
            }
            else {
                logger.error(`failed to handle file change for session ${sessionId}:`, error);
            }
        }
    }
    /**
     * Update activity states based on timeout
     */
    updateActivityStates() {
        const now = Date.now();
        for (const [sessionId, activity] of this.activities) {
            if (activity.isActive && now - activity.lastActivityTime > this.ACTIVITY_TIMEOUT) {
                activity.isActive = false;
                logger.debug(`session ${sessionId} became inactive`);
                this.writeActivityStatus(sessionId, false);
            }
        }
    }
    /**
     * Write activity status to disk
     */
    writeActivityStatus(sessionId, isActive) {
        try {
            const activityPath = path.join(this.controlPath, sessionId, 'activity.json');
            const sessionJsonPath = path.join(this.controlPath, sessionId, 'session.json');
            const activityData = {
                isActive,
                timestamp: new Date().toISOString(),
            };
            // Try to read full session data
            if (fs.existsSync(sessionJsonPath)) {
                try {
                    const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                    activityData.session = sessionData;
                }
                catch (_error) {
                    // If we can't read session.json, just proceed without session data
                    logger.debug(`could not read session.json for ${sessionId}`);
                }
            }
            fs.writeFileSync(activityPath, JSON.stringify(activityData, null, 2));
        }
        catch (error) {
            logger.error(`failed to write activity status for session ${sessionId}:`, error);
        }
    }
    /**
     * Get activity status for all sessions
     */
    getActivityStatus() {
        const status = {};
        const startTime = Date.now();
        // Read from disk to get the most up-to-date status
        try {
            if (!fs.existsSync(this.controlPath)) {
                return status;
            }
            const entries = fs.readdirSync(this.controlPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const sessionId = entry.name;
                    const activityPath = path.join(this.controlPath, sessionId, 'activity.json');
                    const sessionJsonPath = path.join(this.controlPath, sessionId, 'session.json');
                    if (fs.existsSync(activityPath)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
                            status[sessionId] = data;
                        }
                        catch (_error) {
                            // If we can't read the file, create one from current state
                            logger.debug(`could not read activity.json for ${sessionId}`);
                            const activity = this.activities.get(sessionId);
                            if (activity) {
                                const activityStatus = {
                                    isActive: activity.isActive,
                                    timestamp: new Date().toISOString(),
                                };
                                // Try to read full session data
                                if (fs.existsSync(sessionJsonPath)) {
                                    try {
                                        const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                                        activityStatus.session = sessionData;
                                    }
                                    catch (_error) {
                                        // Ignore session.json read errors
                                        logger.debug(`could not read session.json for ${sessionId} when creating activity`);
                                    }
                                }
                                status[sessionId] = activityStatus;
                            }
                        }
                    }
                    else if (fs.existsSync(sessionJsonPath)) {
                        // No activity file yet, but session exists - create default activity
                        try {
                            const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                            status[sessionId] = {
                                isActive: false,
                                timestamp: new Date().toISOString(),
                                session: sessionData,
                            };
                        }
                        catch (_error) {
                            // Ignore errors
                            logger.debug(`could not read session.json for ${sessionId}`);
                        }
                    }
                }
            }
            const duration = Date.now() - startTime;
            if (duration > 100) {
                logger.warn(`activity status scan took ${duration}ms for ${Object.keys(status).length} sessions`);
            }
        }
        catch (error) {
            logger.error('failed to read activity status:', error);
        }
        return status;
    }
    /**
     * Get activity status for a specific session
     */
    getSessionActivityStatus(sessionId) {
        const sessionJsonPath = path.join(this.controlPath, sessionId, 'session.json');
        // Try to read from disk first
        try {
            const activityPath = path.join(this.controlPath, sessionId, 'activity.json');
            if (fs.existsSync(activityPath)) {
                const data = JSON.parse(fs.readFileSync(activityPath, 'utf8'));
                return data;
            }
        }
        catch (_error) {
            // Fall back to creating from current state
            logger.debug(`could not read activity.json for session ${sessionId}, creating from current state`);
            const activity = this.activities.get(sessionId);
            if (activity) {
                const activityStatus = {
                    isActive: activity.isActive,
                    timestamp: new Date().toISOString(),
                };
                // Try to read full session data
                if (fs.existsSync(sessionJsonPath)) {
                    try {
                        const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                        activityStatus.session = sessionData;
                    }
                    catch (_error) {
                        // Ignore session.json read errors
                        logger.debug(`could not read session.json for ${sessionId} in getSessionActivityStatus`);
                    }
                }
                return activityStatus;
            }
        }
        // If no activity data but session exists, create default
        if (fs.existsSync(sessionJsonPath)) {
            try {
                const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
                return {
                    isActive: false,
                    timestamp: new Date().toISOString(),
                    session: sessionData,
                };
            }
            catch (_error) {
                // Ignore errors
                logger.debug(`could not read session.json for ${sessionId} when creating default activity`);
            }
        }
        return null;
    }
}
exports.ActivityMonitor = ActivityMonitor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aXZpdHktbW9uaXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvc2VydmljZXMvYWN0aXZpdHktbW9uaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxrREFBMEI7QUFDMUIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGtCQUFrQixDQUFDLENBQUM7QUFTaEQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBbUNHO0FBQ0gsTUFBYSxlQUFlO0lBUTFCLFlBQVksV0FBbUI7UUFOdkIsZUFBVSxHQUFzQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzFELGFBQVEsR0FBOEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNoRCxrQkFBYSxHQUEwQixJQUFJLENBQUM7UUFDbkMscUJBQWdCLEdBQUcsR0FBRyxDQUFDLENBQUMsa0NBQWtDO1FBQzFELG1CQUFjLEdBQUcsR0FBRyxDQUFDLENBQUMsb0JBQW9CO1FBR3pELElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO0lBQ2pDLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUs7UUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBRXBELG9DQUFvQztRQUNwQyxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDekMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLGNBQWMsWUFBWSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDekUsQ0FBQztRQUVELDRDQUE0QztRQUM1QyxJQUFJLENBQUMsYUFBYSxH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O3dCQUNsQyxNQUFNLENBQUMsS0FBSyxDQUNWLG1DQUFtQyxTQUFTLDhCQUE4QixDQUMzRSxDQUFDO29CQUNKLENBQUM7Z0JBQ0gsQ0FBQztnQkFFRCxPQUFPLGNBQWMsQ0FBQztZQUN4QixDQUFDO1FBQ0gsQ0FBQztRQUVELHlEQUF5RDtRQUN6RCxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO2dCQUN6RSxPQUFPO29CQUNMLFFBQVEsRUFBRSxLQUFLO29CQUNmLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtvQkFDbkMsT0FBTyxFQUFFLFdBQVc7aUJBQ3JCLENBQUM7WUFDSixDQUFDO1lBQUMsT0FBTyxNQUFNLEVBQUUsQ0FBQztnQkFDaEIsZ0JBQWdCO2dCQUNoQixNQUFNLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxTQUFTLGlDQUFpQyxDQUFDLENBQUM7WUFDOUYsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7Q0FDRjtBQWhZRCwwQ0FnWUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkFjdGl2aXR5IH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignYWN0aXZpdHktbW9uaXRvcicpO1xuXG5pbnRlcmZhY2UgU2Vzc2lvbkFjdGl2aXR5U3RhdGUge1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgaXNBY3RpdmU6IGJvb2xlYW47XG4gIGxhc3RBY3Rpdml0eVRpbWU6IG51bWJlcjtcbiAgbGFzdEZpbGVTaXplOiBudW1iZXI7XG59XG5cbi8qKlxuICogQWN0aXZpdHlNb25pdG9yIHRyYWNrcyB0aGUgcmVhbC10aW1lIGFjdGl2aXR5IHN0YXR1cyBvZiB0ZXJtaW5hbCBzZXNzaW9ucyBieSBtb25pdG9yaW5nXG4gKiB0aGVpciBvdXRwdXQgc3RyZWFtcy4gSXQgcHJvdmlkZXMgYSBsaWdodHdlaWdodCB3YXkgdG8gZGV0ZXJtaW5lIHdoaWNoIHNlc3Npb25zIGFyZVxuICogYWN0aXZlbHkgcHJvZHVjaW5nIG91dHB1dCB2ZXJzdXMgaWRsZSBzZXNzaW9ucy5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAtIE1vbml0b3JzIHN0ZG91dCBmaWxlIGNoYW5nZXMgdG8gZGV0ZWN0IHRlcm1pbmFsIG91dHB1dCBhY3Rpdml0eVxuICogLSBNYWludGFpbnMgYWN0aXZpdHkgc3RhdGUgd2l0aCBjb25maWd1cmFibGUgdGltZW91dCAoZGVmYXVsdCA1MDBtcylcbiAqIC0gQXV0b21hdGljYWxseSBkaXNjb3ZlcnMgbmV3IHNlc3Npb25zIGFuZCBjbGVhbnMgdXAgcmVtb3ZlZCBvbmVzXG4gKiAtIFdyaXRlcyBhY3Rpdml0eSBzdGF0dXMgdG8gZGlzayBmb3IgZXh0ZXJuYWwgY29uc3VtZXJzXG4gKiAtIFByb3ZpZGVzIGJvdGggaW5kaXZpZHVhbCBhbmQgYnVsayBhY3Rpdml0eSBzdGF0dXMgcXVlcmllc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgYW5kIHN0YXJ0IHRoZSBhY3Rpdml0eSBtb25pdG9yXG4gKiBjb25zdCBtb25pdG9yID0gbmV3IEFjdGl2aXR5TW9uaXRvcignL3Zhci9saWIvdmliZXR1bm5lbC9jb250cm9sJyk7XG4gKiBtb25pdG9yLnN0YXJ0KCk7XG4gKlxuICogLy8gR2V0IGFjdGl2aXR5IHN0YXR1cyBmb3IgYWxsIHNlc3Npb25zXG4gKiBjb25zdCBhbGxTdGF0dXMgPSBtb25pdG9yLmdldEFjdGl2aXR5U3RhdHVzKCk7XG4gKiBjb25zb2xlLmxvZyhhbGxTdGF0dXMpO1xuICogLy8ge1xuICogLy8gICAnc2Vzc2lvbi0xMjMnOiB7IGlzQWN0aXZlOiB0cnVlLCB0aW1lc3RhbXA6ICcyMDI0LTAxLTAxVDEyOjAwOjAwWicsIHNlc3Npb246IHsuLi59IH0sXG4gKiAvLyAgICdzZXNzaW9uLTQ1Nic6IHsgaXNBY3RpdmU6IGZhbHNlLCB0aW1lc3RhbXA6ICcyMDI0LTAxLTAxVDExOjU5OjAwWicsIHNlc3Npb246IHsuLi59IH1cbiAqIC8vIH1cbiAqXG4gKiAvLyBHZXQgc3RhdHVzIGZvciBhIHNwZWNpZmljIHNlc3Npb25cbiAqIGNvbnN0IHNlc3Npb25TdGF0dXMgPSBtb25pdG9yLmdldFNlc3Npb25BY3Rpdml0eVN0YXR1cygnc2Vzc2lvbi0xMjMnKTtcbiAqIGlmIChzZXNzaW9uU3RhdHVzPy5pc0FjdGl2ZSkge1xuICogICBjb25zb2xlLmxvZygnU2Vzc2lvbiBpcyBhY3RpdmVseSBwcm9kdWNpbmcgb3V0cHV0Jyk7XG4gKiB9XG4gKlxuICogLy8gQ2xlYW4gdXAgd2hlbiBkb25lXG4gKiBtb25pdG9yLnN0b3AoKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgQWN0aXZpdHlNb25pdG9yIHtcbiAgcHJpdmF0ZSBjb250cm9sUGF0aDogc3RyaW5nO1xuICBwcml2YXRlIGFjdGl2aXRpZXM6IE1hcDxzdHJpbmcsIFNlc3Npb25BY3Rpdml0eVN0YXRlPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSB3YXRjaGVyczogTWFwPHN0cmluZywgZnMuRlNXYXRjaGVyPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSBjaGVja0ludGVydmFsOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHJlYWRvbmx5IEFDVElWSVRZX1RJTUVPVVQgPSA1MDA7IC8vIDUwMG1zIG9mIG5vIGFjdGl2aXR5ID0gaW5hY3RpdmVcbiAgcHJpdmF0ZSByZWFkb25seSBDSEVDS19JTlRFUlZBTCA9IDEwMDsgLy8gQ2hlY2sgZXZlcnkgMTAwbXNcblxuICBjb25zdHJ1Y3Rvcihjb250cm9sUGF0aDogc3RyaW5nKSB7XG4gICAgdGhpcy5jb250cm9sUGF0aCA9IGNvbnRyb2xQYXRoO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IG1vbml0b3JpbmcgYWxsIHNlc3Npb25zIGZvciBhY3Rpdml0eVxuICAgKi9cbiAgc3RhcnQoKSB7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbignYWN0aXZpdHkgbW9uaXRvciBzdGFydGVkJykpO1xuXG4gICAgLy8gSW5pdGlhbCBzY2FuIG9mIGV4aXN0aW5nIHNlc3Npb25zXG4gICAgY29uc3Qgc2Vzc2lvbkNvdW50ID0gdGhpcy5zY2FuU2Vzc2lvbnMoKTtcbiAgICBpZiAoc2Vzc2lvbkNvdW50ID4gMCkge1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ibHVlKGBtb25pdG9yaW5nICR7c2Vzc2lvbkNvdW50fSBleGlzdGluZyBzZXNzaW9uc2ApKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdXAgcGVyaW9kaWMgc2Nhbm5pbmcgZm9yIG5ldyBzZXNzaW9uc1xuICAgIHRoaXMuY2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIHRoaXMuc2NhblNlc3Npb25zKCk7XG4gICAgICB0aGlzLnVwZGF0ZUFjdGl2aXR5U3RhdGVzKCk7XG4gICAgfSwgdGhpcy5DSEVDS19JTlRFUlZBTCk7XG4gIH1cblxuICAvKipcbiAgICogU3RvcCBtb25pdG9yaW5nXG4gICAqL1xuICBzdG9wKCkge1xuICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KCdzdG9wcGluZyBhY3Rpdml0eSBtb25pdG9yJykpO1xuXG4gICAgaWYgKHRoaXMuY2hlY2tJbnRlcnZhbCkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmNoZWNrSW50ZXJ2YWwpO1xuICAgICAgdGhpcy5jaGVja0ludGVydmFsID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDbG9zZSBhbGwgd2F0Y2hlcnNcbiAgICBjb25zdCB3YXRjaGVyQ291bnQgPSB0aGlzLndhdGNoZXJzLnNpemU7XG4gICAgZm9yIChjb25zdCBbc2Vzc2lvbklkLCB3YXRjaGVyXSBvZiB0aGlzLndhdGNoZXJzKSB7XG4gICAgICB3YXRjaGVyLmNsb3NlKCk7XG4gICAgICB0aGlzLndhdGNoZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIH1cblxuICAgIHRoaXMuYWN0aXZpdGllcy5jbGVhcigpO1xuXG4gICAgaWYgKHdhdGNoZXJDb3VudCA+IDApIHtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheShgY2xvc2VkICR7d2F0Y2hlckNvdW50fSBmaWxlIHdhdGNoZXJzYCkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTY2FuIGZvciBzZXNzaW9ucyBhbmQgc3RhcnQgbW9uaXRvcmluZyBuZXcgb25lc1xuICAgKi9cbiAgcHJpdmF0ZSBzY2FuU2Vzc2lvbnMoKTogbnVtYmVyIHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY29udHJvbFBhdGgpKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBlbnRyaWVzID0gZnMucmVhZGRpclN5bmModGhpcy5jb250cm9sUGF0aCwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuICAgICAgbGV0IG5ld1Nlc3Npb25zID0gMDtcblxuICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gZW50cnkubmFtZTtcblxuICAgICAgICAgIC8vIFNraXAgaWYgYWxyZWFkeSBtb25pdG9yaW5nXG4gICAgICAgICAgaWYgKHRoaXMuYWN0aXZpdGllcy5oYXMoc2Vzc2lvbklkKSkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgc3RyZWFtT3V0UGF0aCA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQsICdzdGRvdXQnKTtcblxuICAgICAgICAgIC8vIENoZWNrIGlmIHN0ZG91dCBleGlzdHNcbiAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhzdHJlYW1PdXRQYXRoKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RhcnRNb25pdG9yaW5nU2Vzc2lvbihzZXNzaW9uSWQsIHN0cmVhbU91dFBhdGgpKSB7XG4gICAgICAgICAgICAgIG5ld1Nlc3Npb25zKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIHVwIHNlc3Npb25zIHRoYXQgbm8gbG9uZ2VyIGV4aXN0XG4gICAgICBjb25zdCBzZXNzaW9uc1RvQ2xlYW51cCA9IFtdO1xuICAgICAgZm9yIChjb25zdCBbc2Vzc2lvbklkLCBfXSBvZiB0aGlzLmFjdGl2aXRpZXMpIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbkRpciA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQpO1xuICAgICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc2Vzc2lvbkRpcikpIHtcbiAgICAgICAgICBzZXNzaW9uc1RvQ2xlYW51cC5wdXNoKHNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHNlc3Npb25zVG9DbGVhbnVwLmxlbmd0aCA+IDApIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYGNsZWFuaW5nIHVwICR7c2Vzc2lvbnNUb0NsZWFudXAubGVuZ3RofSByZW1vdmVkIHNlc3Npb25zYCkpO1xuICAgICAgICBmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBzZXNzaW9uc1RvQ2xlYW51cCkge1xuICAgICAgICAgIHRoaXMuc3RvcE1vbml0b3JpbmdTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5ld1Nlc3Npb25zO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2ZhaWxlZCB0byBzY2FuIHNlc3Npb25zOicsIGVycm9yKTtcbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCBtb25pdG9yaW5nIGEgc3BlY2lmaWMgc2Vzc2lvblxuICAgKi9cbiAgcHJpdmF0ZSBzdGFydE1vbml0b3JpbmdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCBzdHJlYW1PdXRQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhzdHJlYW1PdXRQYXRoKTtcblxuICAgICAgLy8gSW5pdGlhbGl6ZSBhY3Rpdml0eSB0cmFja2luZ1xuICAgICAgdGhpcy5hY3Rpdml0aWVzLnNldChzZXNzaW9uSWQsIHtcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICBpc0FjdGl2ZTogZmFsc2UsXG4gICAgICAgIGxhc3RBY3Rpdml0eVRpbWU6IERhdGUubm93KCksXG4gICAgICAgIGxhc3RGaWxlU2l6ZTogc3RhdHMuc2l6ZSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBXYXRjaCBmb3IgZmlsZSBjaGFuZ2VzXG4gICAgICBjb25zdCB3YXRjaGVyID0gZnMud2F0Y2goc3RyZWFtT3V0UGF0aCwgKGV2ZW50VHlwZSkgPT4ge1xuICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnY2hhbmdlJykge1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmlsZUNoYW5nZShzZXNzaW9uSWQsIHN0cmVhbU91dFBhdGgpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgdGhpcy53YXRjaGVycy5zZXQoc2Vzc2lvbklkLCB3YXRjaGVyKTtcbiAgICAgIGxvZ2dlci5kZWJ1Zyhgc3RhcnRlZCBtb25pdG9yaW5nIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gc3RhcnQgbW9uaXRvciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIG1vbml0b3JpbmcgYSBzcGVjaWZpYyBzZXNzaW9uXG4gICAqL1xuICBwcml2YXRlIHN0b3BNb25pdG9yaW5nU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IHdhdGNoZXIgPSB0aGlzLndhdGNoZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICh3YXRjaGVyKSB7XG4gICAgICB3YXRjaGVyLmNsb3NlKCk7XG4gICAgICB0aGlzLndhdGNoZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIH1cblxuICAgIHRoaXMuYWN0aXZpdGllcy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICBsb2dnZXIuZGVidWcoYHN0b3BwZWQgbW9uaXRvcmluZyBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBmaWxlIGNoYW5nZSBldmVudFxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVGaWxlQ2hhbmdlKHNlc3Npb25JZDogc3RyaW5nLCBzdHJlYW1PdXRQYXRoOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgYWN0aXZpdHkgPSB0aGlzLmFjdGl2aXRpZXMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAoIWFjdGl2aXR5KSByZXR1cm47XG5cbiAgICAgIC8vIENoZWNrIGlmIGZpbGUgc3RpbGwgZXhpc3RzIGJlZm9yZSB0cnlpbmcgdG8gc3RhdCBpdFxuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHN0cmVhbU91dFBhdGgpKSB7XG4gICAgICAgIC8vIFNlc3Npb24gaGFzIGJlZW4gY2xlYW5lZCB1cCwgc3RvcCBtb25pdG9yaW5nXG4gICAgICAgIHRoaXMuc3RvcE1vbml0b3JpbmdTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhzdHJlYW1PdXRQYXRoKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBzaXplIGluY3JlYXNlZCAobmV3IG91dHB1dClcbiAgICAgIGlmIChzdGF0cy5zaXplID4gYWN0aXZpdHkubGFzdEZpbGVTaXplKSB7XG4gICAgICAgIGNvbnN0IHdhc0FjdGl2ZSA9IGFjdGl2aXR5LmlzQWN0aXZlO1xuICAgICAgICBhY3Rpdml0eS5pc0FjdGl2ZSA9IHRydWU7XG4gICAgICAgIGFjdGl2aXR5Lmxhc3RBY3Rpdml0eVRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBhY3Rpdml0eS5sYXN0RmlsZVNpemUgPSBzdGF0cy5zaXplO1xuXG4gICAgICAgIC8vIExvZyBzdGF0ZSB0cmFuc2l0aW9uXG4gICAgICAgIGlmICghd2FzQWN0aXZlKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBzZXNzaW9uICR7c2Vzc2lvbklkfSBiZWNhbWUgYWN0aXZlYCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXcml0ZSBhY3Rpdml0eSBzdGF0dXMgaW1tZWRpYXRlbHlcbiAgICAgICAgdGhpcy53cml0ZUFjdGl2aXR5U3RhdHVzKHNlc3Npb25JZCwgdHJ1ZSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIENoZWNrIGlmIGVycm9yIGlzIEVOT0VOVCAoZmlsZSBub3QgZm91bmQpXG4gICAgICBpZiAoKGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgLy8gU2Vzc2lvbiBoYXMgYmVlbiBjbGVhbmVkIHVwLCBzdG9wIG1vbml0b3JpbmdcbiAgICAgICAgdGhpcy5zdG9wTW9uaXRvcmluZ1Nlc3Npb24oc2Vzc2lvbklkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGhhbmRsZSBmaWxlIGNoYW5nZSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgYWN0aXZpdHkgc3RhdGVzIGJhc2VkIG9uIHRpbWVvdXRcbiAgICovXG4gIHByaXZhdGUgdXBkYXRlQWN0aXZpdHlTdGF0ZXMoKSB7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgYWN0aXZpdHldIG9mIHRoaXMuYWN0aXZpdGllcykge1xuICAgICAgaWYgKGFjdGl2aXR5LmlzQWN0aXZlICYmIG5vdyAtIGFjdGl2aXR5Lmxhc3RBY3Rpdml0eVRpbWUgPiB0aGlzLkFDVElWSVRZX1RJTUVPVVQpIHtcbiAgICAgICAgYWN0aXZpdHkuaXNBY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBzZXNzaW9uICR7c2Vzc2lvbklkfSBiZWNhbWUgaW5hY3RpdmVgKTtcbiAgICAgICAgdGhpcy53cml0ZUFjdGl2aXR5U3RhdHVzKHNlc3Npb25JZCwgZmFsc2UpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSBhY3Rpdml0eSBzdGF0dXMgdG8gZGlza1xuICAgKi9cbiAgcHJpdmF0ZSB3cml0ZUFjdGl2aXR5U3RhdHVzKHNlc3Npb25JZDogc3RyaW5nLCBpc0FjdGl2ZTogYm9vbGVhbikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhY3Rpdml0eVBhdGggPSBwYXRoLmpvaW4odGhpcy5jb250cm9sUGF0aCwgc2Vzc2lvbklkLCAnYWN0aXZpdHkuanNvbicpO1xuICAgICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbFBhdGgsIHNlc3Npb25JZCwgJ3Nlc3Npb24uanNvbicpO1xuXG4gICAgICBjb25zdCBhY3Rpdml0eURhdGE6IFNlc3Npb25BY3Rpdml0eSA9IHtcbiAgICAgICAgaXNBY3RpdmUsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfTtcblxuICAgICAgLy8gVHJ5IHRvIHJlYWQgZnVsbCBzZXNzaW9uIGRhdGFcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNlc3Npb25Kc29uUGF0aCkpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBzZXNzaW9uRGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHNlc3Npb25Kc29uUGF0aCwgJ3V0ZjgnKSk7XG4gICAgICAgICAgYWN0aXZpdHlEYXRhLnNlc3Npb24gPSBzZXNzaW9uRGF0YTtcbiAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgLy8gSWYgd2UgY2FuJ3QgcmVhZCBzZXNzaW9uLmpzb24sIGp1c3QgcHJvY2VlZCB3aXRob3V0IHNlc3Npb24gZGF0YVxuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgY291bGQgbm90IHJlYWQgc2Vzc2lvbi5qc29uIGZvciAke3Nlc3Npb25JZH1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKGFjdGl2aXR5UGF0aCwgSlNPTi5zdHJpbmdpZnkoYWN0aXZpdHlEYXRhLCBudWxsLCAyKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIHdyaXRlIGFjdGl2aXR5IHN0YXR1cyBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWN0aXZpdHkgc3RhdHVzIGZvciBhbGwgc2Vzc2lvbnNcbiAgICovXG4gIGdldEFjdGl2aXR5U3RhdHVzKCk6IFJlY29yZDxzdHJpbmcsIFNlc3Npb25BY3Rpdml0eT4ge1xuICAgIGNvbnN0IHN0YXR1czogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkFjdGl2aXR5PiA9IHt9O1xuICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cbiAgICAvLyBSZWFkIGZyb20gZGlzayB0byBnZXQgdGhlIG1vc3QgdXAtdG8tZGF0ZSBzdGF0dXNcbiAgICB0cnkge1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY29udHJvbFBhdGgpKSB7XG4gICAgICAgIHJldHVybiBzdGF0dXM7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGVudHJpZXMgPSBmcy5yZWFkZGlyU3luYyh0aGlzLmNvbnRyb2xQYXRoLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG5cbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25JZCA9IGVudHJ5Lm5hbWU7XG4gICAgICAgICAgY29uc3QgYWN0aXZpdHlQYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbFBhdGgsIHNlc3Npb25JZCwgJ2FjdGl2aXR5Lmpzb24nKTtcbiAgICAgICAgICBjb25zdCBzZXNzaW9uSnNvblBhdGggPSBwYXRoLmpvaW4odGhpcy5jb250cm9sUGF0aCwgc2Vzc2lvbklkLCAnc2Vzc2lvbi5qc29uJyk7XG5cbiAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhhY3Rpdml0eVBhdGgpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoYWN0aXZpdHlQYXRoLCAndXRmOCcpKTtcbiAgICAgICAgICAgICAgc3RhdHVzW3Nlc3Npb25JZF0gPSBkYXRhO1xuICAgICAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgICAgIC8vIElmIHdlIGNhbid0IHJlYWQgdGhlIGZpbGUsIGNyZWF0ZSBvbmUgZnJvbSBjdXJyZW50IHN0YXRlXG4gICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgY291bGQgbm90IHJlYWQgYWN0aXZpdHkuanNvbiBmb3IgJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgICAgICAgIGNvbnN0IGFjdGl2aXR5ID0gdGhpcy5hY3Rpdml0aWVzLmdldChzZXNzaW9uSWQpO1xuICAgICAgICAgICAgICBpZiAoYWN0aXZpdHkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBhY3Rpdml0eVN0YXR1czogU2Vzc2lvbkFjdGl2aXR5ID0ge1xuICAgICAgICAgICAgICAgICAgaXNBY3RpdmU6IGFjdGl2aXR5LmlzQWN0aXZlLFxuICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIC8vIFRyeSB0byByZWFkIGZ1bGwgc2Vzc2lvbiBkYXRhXG4gICAgICAgICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc2Vzc2lvbkpzb25QYXRoKSkge1xuICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgc2Vzc2lvbkRhdGEgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhzZXNzaW9uSnNvblBhdGgsICd1dGY4JykpO1xuICAgICAgICAgICAgICAgICAgICBhY3Rpdml0eVN0YXR1cy5zZXNzaW9uID0gc2Vzc2lvbkRhdGE7XG4gICAgICAgICAgICAgICAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWdub3JlIHNlc3Npb24uanNvbiByZWFkIGVycm9yc1xuICAgICAgICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgICAgICAgICAgYGNvdWxkIG5vdCByZWFkIHNlc3Npb24uanNvbiBmb3IgJHtzZXNzaW9uSWR9IHdoZW4gY3JlYXRpbmcgYWN0aXZpdHlgXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgc3RhdHVzW3Nlc3Npb25JZF0gPSBhY3Rpdml0eVN0YXR1cztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoZnMuZXhpc3RzU3luYyhzZXNzaW9uSnNvblBhdGgpKSB7XG4gICAgICAgICAgICAvLyBObyBhY3Rpdml0eSBmaWxlIHlldCwgYnV0IHNlc3Npb24gZXhpc3RzIC0gY3JlYXRlIGRlZmF1bHQgYWN0aXZpdHlcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IHNlc3Npb25EYXRhID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmMoc2Vzc2lvbkpzb25QYXRoLCAndXRmOCcpKTtcbiAgICAgICAgICAgICAgc3RhdHVzW3Nlc3Npb25JZF0gPSB7XG4gICAgICAgICAgICAgICAgaXNBY3RpdmU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgIHNlc3Npb246IHNlc3Npb25EYXRhLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgICAgIC8vIElnbm9yZSBlcnJvcnNcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBjb3VsZCBub3QgcmVhZCBzZXNzaW9uLmpzb24gZm9yICR7c2Vzc2lvbklkfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgICBpZiAoZHVyYXRpb24gPiAxMDApIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYGFjdGl2aXR5IHN0YXR1cyBzY2FuIHRvb2sgJHtkdXJhdGlvbn1tcyBmb3IgJHtPYmplY3Qua2V5cyhzdGF0dXMpLmxlbmd0aH0gc2Vzc2lvbnNgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIHJlYWQgYWN0aXZpdHkgc3RhdHVzOicsIGVycm9yKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc3RhdHVzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhY3Rpdml0eSBzdGF0dXMgZm9yIGEgc3BlY2lmaWMgc2Vzc2lvblxuICAgKi9cbiAgZ2V0U2Vzc2lvbkFjdGl2aXR5U3RhdHVzKHNlc3Npb25JZDogc3RyaW5nKTogU2Vzc2lvbkFjdGl2aXR5IHwgbnVsbCB7XG4gICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbFBhdGgsIHNlc3Npb25JZCwgJ3Nlc3Npb24uanNvbicpO1xuXG4gICAgLy8gVHJ5IHRvIHJlYWQgZnJvbSBkaXNrIGZpcnN0XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFjdGl2aXR5UGF0aCA9IHBhdGguam9pbih0aGlzLmNvbnRyb2xQYXRoLCBzZXNzaW9uSWQsICdhY3Rpdml0eS5qc29uJyk7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhhY3Rpdml0eVBhdGgpKSB7XG4gICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhhY3Rpdml0eVBhdGgsICd1dGY4JykpO1xuICAgICAgICByZXR1cm4gZGF0YTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIEZhbGwgYmFjayB0byBjcmVhdGluZyBmcm9tIGN1cnJlbnQgc3RhdGVcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYGNvdWxkIG5vdCByZWFkIGFjdGl2aXR5Lmpzb24gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9LCBjcmVhdGluZyBmcm9tIGN1cnJlbnQgc3RhdGVgXG4gICAgICApO1xuICAgICAgY29uc3QgYWN0aXZpdHkgPSB0aGlzLmFjdGl2aXRpZXMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAoYWN0aXZpdHkpIHtcbiAgICAgICAgY29uc3QgYWN0aXZpdHlTdGF0dXM6IFNlc3Npb25BY3Rpdml0eSA9IHtcbiAgICAgICAgICBpc0FjdGl2ZTogYWN0aXZpdHkuaXNBY3RpdmUsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gVHJ5IHRvIHJlYWQgZnVsbCBzZXNzaW9uIGRhdGFcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc2Vzc2lvbkpzb25QYXRoKSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzZXNzaW9uRGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHNlc3Npb25Kc29uUGF0aCwgJ3V0ZjgnKSk7XG4gICAgICAgICAgICBhY3Rpdml0eVN0YXR1cy5zZXNzaW9uID0gc2Vzc2lvbkRhdGE7XG4gICAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgICAvLyBJZ25vcmUgc2Vzc2lvbi5qc29uIHJlYWQgZXJyb3JzXG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgIGBjb3VsZCBub3QgcmVhZCBzZXNzaW9uLmpzb24gZm9yICR7c2Vzc2lvbklkfSBpbiBnZXRTZXNzaW9uQWN0aXZpdHlTdGF0dXNgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBhY3Rpdml0eVN0YXR1cztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJZiBubyBhY3Rpdml0eSBkYXRhIGJ1dCBzZXNzaW9uIGV4aXN0cywgY3JlYXRlIGRlZmF1bHRcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhzZXNzaW9uSnNvblBhdGgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXNzaW9uRGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHNlc3Npb25Kc29uUGF0aCwgJ3V0ZjgnKSk7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaXNBY3RpdmU6IGZhbHNlLFxuICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIHNlc3Npb246IHNlc3Npb25EYXRhLFxuICAgICAgICB9O1xuICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgIC8vIElnbm9yZSBlcnJvcnNcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBjb3VsZCBub3QgcmVhZCBzZXNzaW9uLmpzb24gZm9yICR7c2Vzc2lvbklkfSB3aGVuIGNyZWF0aW5nIGRlZmF1bHQgYWN0aXZpdHlgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuIl19