"use strict";
/**
 * SessionMonitor - Server-side monitoring of terminal sessions
 *
 * Replaces the Mac app's polling-based SessionMonitor with real-time
 * event detection directly from PTY streams. Tracks session states,
 * command execution, and Claude-specific activity transitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionMonitor = void 0;
const events_1 = require("events");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('session-monitor');
// Command tracking thresholds
const MIN_COMMAND_DURATION_MS = 3000; // Minimum duration for command completion notifications
const CLAUDE_IDLE_DEBOUNCE_MS = 2000; // Debounce period for Claude idle detection
class SessionMonitor extends events_1.EventEmitter {
    constructor(ptyManager) {
        super();
        this.ptyManager = ptyManager;
        this.sessions = new Map();
        this.claudeIdleNotified = new Set();
        this.lastActivityState = new Map();
        this.commandThresholdMs = MIN_COMMAND_DURATION_MS;
        this.claudeIdleTimers = new Map();
        this.setupEventListeners();
        logger.info('SessionMonitor initialized');
    }
    setupEventListeners() {
        // Listen for session lifecycle events
        this.ptyManager.on('sessionStarted', (sessionId, sessionName) => {
            this.handleSessionStarted(sessionId, sessionName);
        });
        this.ptyManager.on('sessionExited', (sessionId, sessionName, exitCode) => {
            this.handleSessionExited(sessionId, sessionName, exitCode);
        });
        // Listen for command tracking events
        this.ptyManager.on('commandFinished', (data) => {
            this.handleCommandFinished(data);
        });
        // Listen for Claude activity events (if available)
        this.ptyManager.on('claudeTurn', (sessionId, sessionName) => {
            this.handleClaudeTurn(sessionId, sessionName);
        });
    }
    /**
     * Update session state with activity information
     */
    updateSessionActivity(sessionId, isActive, specificApp) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        const previousActive = session.activityStatus?.isActive ?? false;
        // Update activity status
        session.activityStatus = {
            isActive,
            lastActivity: isActive ? new Date() : session.activityStatus?.lastActivity,
            specificStatus: specificApp
                ? {
                    app: specificApp,
                    status: isActive ? 'active' : 'idle',
                }
                : session.activityStatus?.specificStatus,
        };
        // Check if this is a Claude session
        if (this.isClaudeSession(session)) {
            this.trackClaudeActivity(sessionId, session, previousActive, isActive);
        }
        this.lastActivityState.set(sessionId, isActive);
    }
    /**
     * Track PTY output for activity detection and bell characters
     */
    trackPtyOutput(sessionId, data) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        // Update last activity
        this.updateSessionActivity(sessionId, true);
        // Detect bell character
        if (data.includes('\x07')) {
            this.emitNotificationEvent({
                type: 'bell',
                sessionId,
                sessionName: session.name,
                timestamp: new Date().toISOString(),
            });
        }
        // Detect Claude-specific patterns in output
        if (this.isClaudeSession(session)) {
            this.detectClaudePatterns(sessionId, session, data);
        }
    }
    /**
     * Emit notification event for all clients (browsers and Mac app) via SSE
     */
    emitNotificationEvent(event) {
        // Emit notification for all clients via SSE endpoint
        this.emit('notification', {
            type: this.mapActionToServerEventType(event.type),
            sessionId: event.sessionId,
            sessionName: event.sessionName,
            timestamp: event.timestamp,
            exitCode: event.exitCode,
            command: event.command,
            duration: event.duration,
            message: event.type === 'claude-turn' ? 'Claude has finished responding' : undefined,
        });
    }
    /**
     * Map session monitor action to ServerEventType
     */
    mapActionToServerEventType(action) {
        const mapping = {
            'session-start': types_js_1.ServerEventType.SessionStart,
            'session-exit': types_js_1.ServerEventType.SessionExit,
            'command-finished': types_js_1.ServerEventType.CommandFinished,
            'command-error': types_js_1.ServerEventType.CommandError,
            bell: types_js_1.ServerEventType.Bell,
            'claude-turn': types_js_1.ServerEventType.ClaudeTurn,
        };
        return mapping[action];
    }
    /**
     * Update command information for a session
     */
    updateCommand(sessionId, command) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.lastCommand = command;
        session.commandStartTime = new Date();
        // Mark as active when a new command starts
        this.updateSessionActivity(sessionId, true);
    }
    /**
     * Handle command completion
     */
    handleCommandCompletion(sessionId, exitCode) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.commandStartTime || !session.lastCommand)
            return;
        const duration = Date.now() - session.commandStartTime.getTime();
        session.lastExitCode = exitCode;
        // Only emit event if command ran long enough
        if (duration >= this.commandThresholdMs) {
            const _event = {
                sessionId,
                sessionName: session.name,
                command: session.lastCommand,
                duration,
                exitCode,
            };
            // Emit appropriate event based on exit code
            if (exitCode === 0) {
                this.emitNotificationEvent({
                    type: 'command-finished',
                    sessionId,
                    sessionName: session.name,
                    command: session.lastCommand,
                    duration,
                    exitCode,
                    timestamp: new Date().toISOString(),
                });
            }
            else {
                this.emitNotificationEvent({
                    type: 'command-error',
                    sessionId,
                    sessionName: session.name,
                    command: session.lastCommand,
                    duration,
                    exitCode,
                    timestamp: new Date().toISOString(),
                });
            }
        }
        // Clear command tracking
        session.commandStartTime = undefined;
        session.lastCommand = undefined;
    }
    handleSessionStarted(sessionId, sessionName) {
        // Get full session info from PtyManager
        const ptySession = this.ptyManager.getSession(sessionId);
        if (!ptySession)
            return;
        const state = {
            id: sessionId,
            name: sessionName,
            command: ptySession.command || [],
            workingDir: ptySession.workingDir || process.cwd(),
            status: 'running',
            isRunning: true,
            pid: ptySession.pid,
            isClaudeSession: this.detectClaudeCommand(ptySession.command || []),
        };
        this.sessions.set(sessionId, state);
        logger.info(`Session started: ${sessionId} - ${sessionName}`);
        // Emit notification event
        this.emitNotificationEvent({
            type: 'session-start',
            sessionId,
            sessionName,
            timestamp: new Date().toISOString(),
        });
    }
    handleSessionExited(sessionId, sessionName, exitCode) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.status = 'exited';
        session.isRunning = false;
        logger.info(`Session exited: ${sessionId} - ${sessionName} (exit code: ${exitCode})`);
        // Clean up Claude tracking
        this.claudeIdleNotified.delete(sessionId);
        this.lastActivityState.delete(sessionId);
        if (this.claudeIdleTimers.has(sessionId)) {
            const timer = this.claudeIdleTimers.get(sessionId);
            if (timer)
                clearTimeout(timer);
            this.claudeIdleTimers.delete(sessionId);
        }
        // Emit notification event
        this.emitNotificationEvent({
            type: 'session-exit',
            sessionId,
            sessionName,
            exitCode,
            timestamp: new Date().toISOString(),
        });
        // Remove session after a delay to allow final events to process
        setTimeout(() => {
            this.sessions.delete(sessionId);
        }, 5000);
    }
    handleCommandFinished(data) {
        // Forward to our handler which will emit the appropriate notification
        this.handleCommandCompletion(data.sessionId, data.exitCode);
    }
    handleClaudeTurn(sessionId, _sessionName) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        // Mark Claude as idle
        this.updateSessionActivity(sessionId, false, 'claude');
    }
    isClaudeSession(session) {
        return session.isClaudeSession ?? false;
    }
    detectClaudeCommand(command) {
        const commandStr = command.join(' ').toLowerCase();
        return commandStr.includes('claude');
    }
    trackClaudeActivity(sessionId, session, previousActive, currentActive) {
        // Clear any existing idle timer
        if (this.claudeIdleTimers.has(sessionId)) {
            const timer = this.claudeIdleTimers.get(sessionId);
            if (timer)
                clearTimeout(timer);
            this.claudeIdleTimers.delete(sessionId);
        }
        // Claude went from active to potentially idle
        if (previousActive && !currentActive && !this.claudeIdleNotified.has(sessionId)) {
            // Set a debounce timer before declaring Claude idle
            const timer = setTimeout(() => {
                // Check if still idle
                const currentSession = this.sessions.get(sessionId);
                if (currentSession?.activityStatus && !currentSession.activityStatus.isActive) {
                    logger.info(`🔔 Claude turn detected for session: ${sessionId}`);
                    this.emitNotificationEvent({
                        type: 'claude-turn',
                        sessionId,
                        sessionName: session.name,
                        timestamp: new Date().toISOString(),
                        activityStatus: {
                            isActive: false,
                            app: 'claude',
                        },
                    });
                    this.claudeIdleNotified.add(sessionId);
                }
                this.claudeIdleTimers.delete(sessionId);
            }, CLAUDE_IDLE_DEBOUNCE_MS);
            this.claudeIdleTimers.set(sessionId, timer);
        }
        // Claude became active again - reset notification flag
        if (!previousActive && currentActive) {
            this.claudeIdleNotified.delete(sessionId);
        }
    }
    detectClaudePatterns(sessionId, _session, data) {
        // Detect patterns that indicate Claude is working or has finished
        const workingPatterns = ['Thinking...', 'Analyzing', 'Working on', 'Let me'];
        const idlePatterns = [
            "I've completed",
            "I've finished",
            'Done!',
            "Here's",
            'The task is complete',
        ];
        // Check for working patterns
        for (const pattern of workingPatterns) {
            if (data.includes(pattern)) {
                this.updateSessionActivity(sessionId, true, 'claude');
                return;
            }
        }
        // Check for idle patterns
        for (const pattern of idlePatterns) {
            if (data.includes(pattern)) {
                // Delay marking as idle to allow for follow-up output
                setTimeout(() => {
                    this.updateSessionActivity(sessionId, false, 'claude');
                }, 1000);
                return;
            }
        }
    }
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values()).filter((s) => s.isRunning);
    }
    /**
     * Get a specific session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Initialize monitor with existing sessions
     */
    async initialize() {
        // Get all existing sessions from PtyManager
        const existingSessions = await this.ptyManager.listSessions();
        for (const session of existingSessions) {
            if (session.status === 'running') {
                const state = {
                    id: session.id,
                    name: session.name,
                    command: session.command,
                    workingDir: session.workingDir,
                    status: 'running',
                    isRunning: true,
                    pid: session.pid,
                    isClaudeSession: this.detectClaudeCommand(session.command),
                };
                this.sessions.set(session.id, state);
            }
        }
        logger.info(`Initialized with ${this.sessions.size} existing sessions`);
    }
}
exports.SessionMonitor = SessionMonitor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi1tb25pdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9zZXNzaW9uLW1vbml0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7O0FBRUgsbUNBQXNDO0FBQ3RDLG9EQUF3RDtBQUV4RCxrREFBa0Q7QUFHbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFL0MsOEJBQThCO0FBQzlCLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLENBQUMsd0RBQXdEO0FBQzlGLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxDQUFDLENBQUMsNENBQTRDO0FBNkNsRixNQUFhLGNBQWUsU0FBUSxxQkFBWTtJQU85QyxZQUFvQixVQUFzQjtRQUN4QyxLQUFLLEVBQUUsQ0FBQztRQURVLGVBQVUsR0FBVixVQUFVLENBQVk7UUFObEMsYUFBUSxHQUFHLElBQUksR0FBRyxFQUF3QixDQUFDO1FBQzNDLHVCQUFrQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDdkMsc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQW1CLENBQUM7UUFDL0MsdUJBQWtCLEdBQUcsdUJBQXVCLENBQUM7UUFDN0MscUJBQWdCLEdBQUcsSUFBSSxHQUFHLEVBQTBCLENBQUM7UUFJM0QsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFTyxtQkFBbUI7UUFDekIsc0NBQXNDO1FBQ3RDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLGdCQUFnQixFQUFFLENBQUMsU0FBaUIsRUFBRSxXQUFtQixFQUFFLEVBQUU7WUFDOUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNwRCxDQUFDLENBQUMsQ0FBQztRQUVI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Q0FBQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxDQUFDO0lBQzFFLENBQUM7Q0FDRjtBQXRZRCx3Q0FzWUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNlc3Npb25Nb25pdG9yIC0gU2VydmVyLXNpZGUgbW9uaXRvcmluZyBvZiB0ZXJtaW5hbCBzZXNzaW9uc1xuICpcbiAqIFJlcGxhY2VzIHRoZSBNYWMgYXBwJ3MgcG9sbGluZy1iYXNlZCBTZXNzaW9uTW9uaXRvciB3aXRoIHJlYWwtdGltZVxuICogZXZlbnQgZGV0ZWN0aW9uIGRpcmVjdGx5IGZyb20gUFRZIHN0cmVhbXMuIFRyYWNrcyBzZXNzaW9uIHN0YXRlcyxcbiAqIGNvbW1hbmQgZXhlY3V0aW9uLCBhbmQgQ2xhdWRlLXNwZWNpZmljIGFjdGl2aXR5IHRyYW5zaXRpb25zLlxuICovXG5cbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBTZXJ2ZXJFdmVudFR5cGUgfSBmcm9tICcuLi8uLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBQdHlNYW5hZ2VyIH0gZnJvbSAnLi4vcHR5L3B0eS1tYW5hZ2VyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25Nb25pdG9yRXZlbnQgfSBmcm9tICcuLi93ZWJzb2NrZXQvY29udHJvbC1wcm90b2NvbC5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignc2Vzc2lvbi1tb25pdG9yJyk7XG5cbi8vIENvbW1hbmQgdHJhY2tpbmcgdGhyZXNob2xkc1xuY29uc3QgTUlOX0NPTU1BTkRfRFVSQVRJT05fTVMgPSAzMDAwOyAvLyBNaW5pbXVtIGR1cmF0aW9uIGZvciBjb21tYW5kIGNvbXBsZXRpb24gbm90aWZpY2F0aW9uc1xuY29uc3QgQ0xBVURFX0lETEVfREVCT1VOQ0VfTVMgPSAyMDAwOyAvLyBEZWJvdW5jZSBwZXJpb2QgZm9yIENsYXVkZSBpZGxlIGRldGVjdGlvblxuXG5leHBvcnQgaW50ZXJmYWNlIFNlc3Npb25TdGF0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgY29tbWFuZDogc3RyaW5nW107XG4gIHdvcmtpbmdEaXI6IHN0cmluZztcbiAgc3RhdHVzOiAncnVubmluZycgfCAnZXhpdGVkJztcbiAgaXNSdW5uaW5nOiBib29sZWFuO1xuICBwaWQ/OiBudW1iZXI7XG5cbiAgLy8gQWN0aXZpdHkgdHJhY2tpbmdcbiAgYWN0aXZpdHlTdGF0dXM/OiB7XG4gICAgaXNBY3RpdmU6IGJvb2xlYW47XG4gICAgbGFzdEFjdGl2aXR5PzogRGF0ZTtcbiAgICBzcGVjaWZpY1N0YXR1cz86IHtcbiAgICAgIGFwcDogc3RyaW5nO1xuICAgICAgc3RhdHVzOiBzdHJpbmc7XG4gICAgfTtcbiAgfTtcblxuICAvLyBDb21tYW5kIHRyYWNraW5nXG4gIGNvbW1hbmRTdGFydFRpbWU/OiBEYXRlO1xuICBsYXN0Q29tbWFuZD86IHN0cmluZztcbiAgbGFzdEV4aXRDb2RlPzogbnVtYmVyO1xuXG4gIC8vIENsYXVkZS1zcGVjaWZpYyB0cmFja2luZ1xuICBpc0NsYXVkZVNlc3Npb24/OiBib29sZWFuO1xuICBjbGF1ZGVBY3Rpdml0eVN0YXRlPzogJ2FjdGl2ZScgfCAnaWRsZScgfCAndW5rbm93bic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tbWFuZEZpbmlzaGVkRXZlbnQge1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgc2Vzc2lvbk5hbWU6IHN0cmluZztcbiAgY29tbWFuZDogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBleGl0Q29kZTogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENsYXVkZVR1cm5FdmVudCB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICBzZXNzaW9uTmFtZTogc3RyaW5nO1xuICBtZXNzYWdlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbk1vbml0b3IgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICBwcml2YXRlIHNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIFNlc3Npb25TdGF0ZT4oKTtcbiAgcHJpdmF0ZSBjbGF1ZGVJZGxlTm90aWZpZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBsYXN0QWN0aXZpdHlTdGF0ZSA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuICBwcml2YXRlIGNvbW1hbmRUaHJlc2hvbGRNcyA9IE1JTl9DT01NQU5EX0RVUkFUSU9OX01TO1xuICBwcml2YXRlIGNsYXVkZUlkbGVUaW1lcnMgPSBuZXcgTWFwPHN0cmluZywgTm9kZUpTLlRpbWVvdXQ+KCk7XG5cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcbiAgICBsb2dnZXIuaW5mbygnU2Vzc2lvbk1vbml0b3IgaW5pdGlhbGl6ZWQnKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpIHtcbiAgICAvLyBMaXN0ZW4gZm9yIHNlc3Npb24gbGlmZWN5Y2xlIGV2ZW50c1xuICAgIHRoaXMucHR5TWFuYWdlci5vbignc2Vzc2lvblN0YXJ0ZWQnLCAoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIHRoaXMuaGFuZGxlU2Vzc2lvblN0YXJ0ZWQoc2Vzc2lvbklkLCBzZXNzaW9uTmFtZSk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnB0eU1hbmFnZXIub24oXG4gICAgICAnc2Vzc2lvbkV4aXRlZCcsXG4gICAgICAoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25OYW1lOiBzdHJpbmcsIGV4aXRDb2RlPzogbnVtYmVyKSA9PiB7XG4gICAgICAgIHRoaXMuaGFuZGxlU2Vzc2lvbkV4aXRlZChzZXNzaW9uSWQsIHNlc3Npb25OYW1lLCBleGl0Q29kZSk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIExpc3RlbiBmb3IgY29tbWFuZCB0cmFja2luZyBldmVudHNcbiAgICB0aGlzLnB0eU1hbmFnZXIub24oJ2NvbW1hbmRGaW5pc2hlZCcsIChkYXRhOiBDb21tYW5kRmluaXNoZWRFdmVudCkgPT4ge1xuICAgICAgdGhpcy5oYW5kbGVDb21tYW5kRmluaXNoZWQoZGF0YSk7XG4gICAgfSk7XG5cbiAgICAvLyBMaXN0ZW4gZm9yIENsYXVkZSBhY3Rpdml0eSBldmVudHMgKGlmIGF2YWlsYWJsZSlcbiAgICB0aGlzLnB0eU1hbmFnZXIub24oJ2NsYXVkZVR1cm4nLCAoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25OYW1lOiBzdHJpbmcpID0+IHtcbiAgICAgIHRoaXMuaGFuZGxlQ2xhdWRlVHVybihzZXNzaW9uSWQsIHNlc3Npb25OYW1lKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgc2Vzc2lvbiBzdGF0ZSB3aXRoIGFjdGl2aXR5IGluZm9ybWF0aW9uXG4gICAqL1xuICBwdWJsaWMgdXBkYXRlU2Vzc2lvbkFjdGl2aXR5KHNlc3Npb25JZDogc3RyaW5nLCBpc0FjdGl2ZTogYm9vbGVhbiwgc3BlY2lmaWNBcHA/OiBzdHJpbmcpIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24pIHJldHVybjtcblxuICAgIGNvbnN0IHByZXZpb3VzQWN0aXZlID0gc2Vzc2lvbi5hY3Rpdml0eVN0YXR1cz8uaXNBY3RpdmUgPz8gZmFsc2U7XG5cbiAgICAvLyBVcGRhdGUgYWN0aXZpdHkgc3RhdHVzXG4gICAgc2Vzc2lvbi5hY3Rpdml0eVN0YXR1cyA9IHtcbiAgICAgIGlzQWN0aXZlLFxuICAgICAgbGFzdEFjdGl2aXR5OiBpc0FjdGl2ZSA/IG5ldyBEYXRlKCkgOiBzZXNzaW9uLmFjdGl2aXR5U3RhdHVzPy5sYXN0QWN0aXZpdHksXG4gICAgICBzcGVjaWZpY1N0YXR1czogc3BlY2lmaWNBcHBcbiAgICAgICAgPyB7XG4gICAgICAgICAgICBhcHA6IHNwZWNpZmljQXBwLFxuICAgICAgICAgICAgc3RhdHVzOiBpc0FjdGl2ZSA/ICdhY3RpdmUnIDogJ2lkbGUnLFxuICAgICAgICAgIH1cbiAgICAgICAgOiBzZXNzaW9uLmFjdGl2aXR5U3RhdHVzPy5zcGVjaWZpY1N0YXR1cyxcbiAgICB9O1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIENsYXVkZSBzZXNzaW9uXG4gICAgaWYgKHRoaXMuaXNDbGF1ZGVTZXNzaW9uKHNlc3Npb24pKSB7XG4gICAgICB0aGlzLnRyYWNrQ2xhdWRlQWN0aXZpdHkoc2Vzc2lvbklkLCBzZXNzaW9uLCBwcmV2aW91c0FjdGl2ZSwgaXNBY3RpdmUpO1xuICAgIH1cblxuICAgIHRoaXMubGFzdEFjdGl2aXR5U3RhdGUuc2V0KHNlc3Npb25JZCwgaXNBY3RpdmUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFRyYWNrIFBUWSBvdXRwdXQgZm9yIGFjdGl2aXR5IGRldGVjdGlvbiBhbmQgYmVsbCBjaGFyYWN0ZXJzXG4gICAqL1xuICBwdWJsaWMgdHJhY2tQdHlPdXRwdXQoc2Vzc2lvbklkOiBzdHJpbmcsIGRhdGE6IHN0cmluZykge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuXG4gICAgLy8gVXBkYXRlIGxhc3QgYWN0aXZpdHlcbiAgICB0aGlzLnVwZGF0ZVNlc3Npb25BY3Rpdml0eShzZXNzaW9uSWQsIHRydWUpO1xuXG4gICAgLy8gRGV0ZWN0IGJlbGwgY2hhcmFjdGVyXG4gICAgaWYgKGRhdGEuaW5jbHVkZXMoJ1xceDA3JykpIHtcbiAgICAgIHRoaXMuZW1pdE5vdGlmaWNhdGlvbkV2ZW50KHtcbiAgICAgICAgdHlwZTogJ2JlbGwnLFxuICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLm5hbWUsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gRGV0ZWN0IENsYXVkZS1zcGVjaWZpYyBwYXR0ZXJucyBpbiBvdXRwdXRcbiAgICBpZiAodGhpcy5pc0NsYXVkZVNlc3Npb24oc2Vzc2lvbikpIHtcbiAgICAgIHRoaXMuZGV0ZWN0Q2xhdWRlUGF0dGVybnMoc2Vzc2lvbklkLCBzZXNzaW9uLCBkYXRhKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRW1pdCBub3RpZmljYXRpb24gZXZlbnQgZm9yIGFsbCBjbGllbnRzIChicm93c2VycyBhbmQgTWFjIGFwcCkgdmlhIFNTRVxuICAgKi9cbiAgcHJpdmF0ZSBlbWl0Tm90aWZpY2F0aW9uRXZlbnQoZXZlbnQ6IFNlc3Npb25Nb25pdG9yRXZlbnQpIHtcbiAgICAvLyBFbWl0IG5vdGlmaWNhdGlvbiBmb3IgYWxsIGNsaWVudHMgdmlhIFNTRSBlbmRwb2ludFxuICAgIHRoaXMuZW1pdCgnbm90aWZpY2F0aW9uJywge1xuICAgICAgdHlwZTogdGhpcy5tYXBBY3Rpb25Ub1NlcnZlckV2ZW50VHlwZShldmVudC50eXBlKSxcbiAgICAgIHNlc3Npb25JZDogZXZlbnQuc2Vzc2lvbklkLFxuICAgICAgc2Vzc2lvbk5hbWU6IGV2ZW50LnNlc3Npb25OYW1lLFxuICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICBleGl0Q29kZTogZXZlbnQuZXhpdENvZGUsXG4gICAgICBjb21tYW5kOiBldmVudC5jb21tYW5kLFxuICAgICAgZHVyYXRpb246IGV2ZW50LmR1cmF0aW9uLFxuICAgICAgbWVzc2FnZTogZXZlbnQudHlwZSA9PT0gJ2NsYXVkZS10dXJuJyA/ICdDbGF1ZGUgaGFzIGZpbmlzaGVkIHJlc3BvbmRpbmcnIDogdW5kZWZpbmVkLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIE1hcCBzZXNzaW9uIG1vbml0b3IgYWN0aW9uIHRvIFNlcnZlckV2ZW50VHlwZVxuICAgKi9cbiAgcHJpdmF0ZSBtYXBBY3Rpb25Ub1NlcnZlckV2ZW50VHlwZShhY3Rpb246IFNlc3Npb25Nb25pdG9yRXZlbnRbJ3R5cGUnXSk6IFNlcnZlckV2ZW50VHlwZSB7XG4gICAgY29uc3QgbWFwcGluZyA9IHtcbiAgICAgICdzZXNzaW9uLXN0YXJ0JzogU2VydmVyRXZlbnRUeXBlLlNlc3Npb25TdGFydCxcbiAgICAgICdzZXNzaW9uLWV4aXQnOiBTZXJ2ZXJFdmVudFR5cGUuU2Vzc2lvbkV4aXQsXG4gICAgICAnY29tbWFuZC1maW5pc2hlZCc6IFNlcnZlckV2ZW50VHlwZS5Db21tYW5kRmluaXNoZWQsXG4gICAgICAnY29tbWFuZC1lcnJvcic6IFNlcnZlckV2ZW50VHlwZS5Db21tYW5kRXJyb3IsXG4gICAgICBiZWxsOiBTZXJ2ZXJFdmVudFR5cGUuQmVsbCxcbiAgICAgICdjbGF1ZGUtdHVybic6IFNlcnZlckV2ZW50VHlwZS5DbGF1ZGVUdXJuLFxuICAgIH07XG4gICAgcmV0dXJuIG1hcHBpbmdbYWN0aW9uXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVcGRhdGUgY29tbWFuZCBpbmZvcm1hdGlvbiBmb3IgYSBzZXNzaW9uXG4gICAqL1xuICBwdWJsaWMgdXBkYXRlQ29tbWFuZChzZXNzaW9uSWQ6IHN0cmluZywgY29tbWFuZDogc3RyaW5nKSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XG5cbiAgICBzZXNzaW9uLmxhc3RDb21tYW5kID0gY29tbWFuZDtcbiAgICBzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWUgPSBuZXcgRGF0ZSgpO1xuXG4gICAgLy8gTWFyayBhcyBhY3RpdmUgd2hlbiBhIG5ldyBjb21tYW5kIHN0YXJ0c1xuICAgIHRoaXMudXBkYXRlU2Vzc2lvbkFjdGl2aXR5KHNlc3Npb25JZCwgdHJ1ZSk7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGNvbW1hbmQgY29tcGxldGlvblxuICAgKi9cbiAgcHVibGljIGhhbmRsZUNvbW1hbmRDb21wbGV0aW9uKHNlc3Npb25JZDogc3RyaW5nLCBleGl0Q29kZTogbnVtYmVyKSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uIHx8ICFzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWUgfHwgIXNlc3Npb24ubGFzdENvbW1hbmQpIHJldHVybjtcblxuICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHNlc3Npb24uY29tbWFuZFN0YXJ0VGltZS5nZXRUaW1lKCk7XG4gICAgc2Vzc2lvbi5sYXN0RXhpdENvZGUgPSBleGl0Q29kZTtcblxuICAgIC8vIE9ubHkgZW1pdCBldmVudCBpZiBjb21tYW5kIHJhbiBsb25nIGVub3VnaFxuICAgIGlmIChkdXJhdGlvbiA+PSB0aGlzLmNvbW1hbmRUaHJlc2hvbGRNcykge1xuICAgICAgY29uc3QgX2V2ZW50OiBDb21tYW5kRmluaXNoZWRFdmVudCA9IHtcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICBzZXNzaW9uTmFtZTogc2Vzc2lvbi5uYW1lLFxuICAgICAgICBjb21tYW5kOiBzZXNzaW9uLmxhc3RDb21tYW5kLFxuICAgICAgICBkdXJhdGlvbixcbiAgICAgICAgZXhpdENvZGUsXG4gICAgICB9O1xuXG4gICAgICAvLyBFbWl0IGFwcHJvcHJpYXRlIGV2ZW50IGJhc2VkIG9uIGV4aXQgY29kZVxuICAgICAgaWYgKGV4aXRDb2RlID09PSAwKSB7XG4gICAgICAgIHRoaXMuZW1pdE5vdGlmaWNhdGlvbkV2ZW50KHtcbiAgICAgICAgICB0eXBlOiAnY29tbWFuZC1maW5pc2hlZCcsXG4gICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLm5hbWUsXG4gICAgICAgICAgY29tbWFuZDogc2Vzc2lvbi5sYXN0Q29tbWFuZCxcbiAgICAgICAgICBkdXJhdGlvbixcbiAgICAgICAgICBleGl0Q29kZSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXROb3RpZmljYXRpb25FdmVudCh7XG4gICAgICAgICAgdHlwZTogJ2NvbW1hbmQtZXJyb3InLFxuICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICBzZXNzaW9uTmFtZTogc2Vzc2lvbi5uYW1lLFxuICAgICAgICAgIGNvbW1hbmQ6IHNlc3Npb24ubGFzdENvbW1hbmQsXG4gICAgICAgICAgZHVyYXRpb24sXG4gICAgICAgICAgZXhpdENvZGUsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENsZWFyIGNvbW1hbmQgdHJhY2tpbmdcbiAgICBzZXNzaW9uLmNvbW1hbmRTdGFydFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgc2Vzc2lvbi5sYXN0Q29tbWFuZCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlU2Vzc2lvblN0YXJ0ZWQoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25OYW1lOiBzdHJpbmcpIHtcbiAgICAvLyBHZXQgZnVsbCBzZXNzaW9uIGluZm8gZnJvbSBQdHlNYW5hZ2VyXG4gICAgY29uc3QgcHR5U2Vzc2lvbiA9IHRoaXMucHR5TWFuYWdlci5nZXRTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgaWYgKCFwdHlTZXNzaW9uKSByZXR1cm47XG5cbiAgICBjb25zdCBzdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuICAgICAgaWQ6IHNlc3Npb25JZCxcbiAgICAgIG5hbWU6IHNlc3Npb25OYW1lLFxuICAgICAgY29tbWFuZDogcHR5U2Vzc2lvbi5jb21tYW5kIHx8IFtdLFxuICAgICAgd29ya2luZ0RpcjogcHR5U2Vzc2lvbi53b3JraW5nRGlyIHx8IHByb2Nlc3MuY3dkKCksXG4gICAgICBzdGF0dXM6ICdydW5uaW5nJyxcbiAgICAgIGlzUnVubmluZzogdHJ1ZSxcbiAgICAgIHBpZDogcHR5U2Vzc2lvbi5waWQsXG4gICAgICBpc0NsYXVkZVNlc3Npb246IHRoaXMuZGV0ZWN0Q2xhdWRlQ29tbWFuZChwdHlTZXNzaW9uLmNvbW1hbmQgfHwgW10pLFxuICAgIH07XG5cbiAgICB0aGlzLnNlc3Npb25zLnNldChzZXNzaW9uSWQsIHN0YXRlKTtcbiAgICBsb2dnZXIuaW5mbyhgU2Vzc2lvbiBzdGFydGVkOiAke3Nlc3Npb25JZH0gLSAke3Nlc3Npb25OYW1lfWApO1xuXG4gICAgLy8gRW1pdCBub3RpZmljYXRpb24gZXZlbnRcbiAgICB0aGlzLmVtaXROb3RpZmljYXRpb25FdmVudCh7XG4gICAgICB0eXBlOiAnc2Vzc2lvbi1zdGFydCcsXG4gICAgICBzZXNzaW9uSWQsXG4gICAgICBzZXNzaW9uTmFtZSxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVTZXNzaW9uRXhpdGVkKHNlc3Npb25JZDogc3RyaW5nLCBzZXNzaW9uTmFtZTogc3RyaW5nLCBleGl0Q29kZT86IG51bWJlcikge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvbikgcmV0dXJuO1xuXG4gICAgc2Vzc2lvbi5zdGF0dXMgPSAnZXhpdGVkJztcbiAgICBzZXNzaW9uLmlzUnVubmluZyA9IGZhbHNlO1xuXG4gICAgbG9nZ2VyLmluZm8oYFNlc3Npb24gZXhpdGVkOiAke3Nlc3Npb25JZH0gLSAke3Nlc3Npb25OYW1lfSAoZXhpdCBjb2RlOiAke2V4aXRDb2RlfSlgKTtcblxuICAgIC8vIENsZWFuIHVwIENsYXVkZSB0cmFja2luZ1xuICAgIHRoaXMuY2xhdWRlSWRsZU5vdGlmaWVkLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIHRoaXMubGFzdEFjdGl2aXR5U3RhdGUuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgaWYgKHRoaXMuY2xhdWRlSWRsZVRpbWVycy5oYXMoc2Vzc2lvbklkKSkge1xuICAgICAgY29uc3QgdGltZXIgPSB0aGlzLmNsYXVkZUlkbGVUaW1lcnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAodGltZXIpIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICB0aGlzLmNsYXVkZUlkbGVUaW1lcnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgfVxuXG4gICAgLy8gRW1pdCBub3RpZmljYXRpb24gZXZlbnRcbiAgICB0aGlzLmVtaXROb3RpZmljYXRpb25FdmVudCh7XG4gICAgICB0eXBlOiAnc2Vzc2lvbi1leGl0JyxcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHNlc3Npb25OYW1lLFxuICAgICAgZXhpdENvZGUsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICB9KTtcblxuICAgIC8vIFJlbW92ZSBzZXNzaW9uIGFmdGVyIGEgZGVsYXkgdG8gYWxsb3cgZmluYWwgZXZlbnRzIHRvIHByb2Nlc3NcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMuc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgfSwgNTAwMCk7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZUNvbW1hbmRGaW5pc2hlZChkYXRhOiBDb21tYW5kRmluaXNoZWRFdmVudCkge1xuICAgIC8vIEZvcndhcmQgdG8gb3VyIGhhbmRsZXIgd2hpY2ggd2lsbCBlbWl0IHRoZSBhcHByb3ByaWF0ZSBub3RpZmljYXRpb25cbiAgICB0aGlzLmhhbmRsZUNvbW1hbmRDb21wbGV0aW9uKGRhdGEuc2Vzc2lvbklkLCBkYXRhLmV4aXRDb2RlKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlQ2xhdWRlVHVybihzZXNzaW9uSWQ6IHN0cmluZywgX3Nlc3Npb25OYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoIXNlc3Npb24pIHJldHVybjtcblxuICAgIC8vIE1hcmsgQ2xhdWRlIGFzIGlkbGVcbiAgICB0aGlzLnVwZGF0ZVNlc3Npb25BY3Rpdml0eShzZXNzaW9uSWQsIGZhbHNlLCAnY2xhdWRlJyk7XG4gIH1cblxuICBwcml2YXRlIGlzQ2xhdWRlU2Vzc2lvbihzZXNzaW9uOiBTZXNzaW9uU3RhdGUpOiBib29sZWFuIHtcbiAgICByZXR1cm4gc2Vzc2lvbi5pc0NsYXVkZVNlc3Npb24gPz8gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIGRldGVjdENsYXVkZUNvbW1hbmQoY29tbWFuZDogc3RyaW5nW10pOiBib29sZWFuIHtcbiAgICBjb25zdCBjb21tYW5kU3RyID0gY29tbWFuZC5qb2luKCcgJykudG9Mb3dlckNhc2UoKTtcbiAgICByZXR1cm4gY29tbWFuZFN0ci5pbmNsdWRlcygnY2xhdWRlJyk7XG4gIH1cblxuICBwcml2YXRlIHRyYWNrQ2xhdWRlQWN0aXZpdHkoXG4gICAgc2Vzc2lvbklkOiBzdHJpbmcsXG4gICAgc2Vzc2lvbjogU2Vzc2lvblN0YXRlLFxuICAgIHByZXZpb3VzQWN0aXZlOiBib29sZWFuLFxuICAgIGN1cnJlbnRBY3RpdmU6IGJvb2xlYW5cbiAgKSB7XG4gICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIGlkbGUgdGltZXJcbiAgICBpZiAodGhpcy5jbGF1ZGVJZGxlVGltZXJzLmhhcyhzZXNzaW9uSWQpKSB7XG4gICAgICBjb25zdCB0aW1lciA9IHRoaXMuY2xhdWRlSWRsZVRpbWVycy5nZXQoc2Vzc2lvbklkKTtcbiAgICAgIGlmICh0aW1lcikgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgIHRoaXMuY2xhdWRlSWRsZVRpbWVycy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICB9XG5cbiAgICAvLyBDbGF1ZGUgd2VudCBmcm9tIGFjdGl2ZSB0byBwb3RlbnRpYWxseSBpZGxlXG4gICAgaWYgKHByZXZpb3VzQWN0aXZlICYmICFjdXJyZW50QWN0aXZlICYmICF0aGlzLmNsYXVkZUlkbGVOb3RpZmllZC5oYXMoc2Vzc2lvbklkKSkge1xuICAgICAgLy8gU2V0IGEgZGVib3VuY2UgdGltZXIgYmVmb3JlIGRlY2xhcmluZyBDbGF1ZGUgaWRsZVxuICAgICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgc3RpbGwgaWRsZVxuICAgICAgICBjb25zdCBjdXJyZW50U2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICAgIGlmIChjdXJyZW50U2Vzc2lvbj8uYWN0aXZpdHlTdGF0dXMgJiYgIWN1cnJlbnRTZXNzaW9uLmFjdGl2aXR5U3RhdHVzLmlzQWN0aXZlKSB7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oYPCflJQgQ2xhdWRlIHR1cm4gZGV0ZWN0ZWQgZm9yIHNlc3Npb246ICR7c2Vzc2lvbklkfWApO1xuXG4gICAgICAgICAgdGhpcy5lbWl0Tm90aWZpY2F0aW9uRXZlbnQoe1xuICAgICAgICAgICAgdHlwZTogJ2NsYXVkZS10dXJuJyxcbiAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIHNlc3Npb25OYW1lOiBzZXNzaW9uLm5hbWUsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgIGFjdGl2aXR5U3RhdHVzOiB7XG4gICAgICAgICAgICAgIGlzQWN0aXZlOiBmYWxzZSxcbiAgICAgICAgICAgICAgYXBwOiAnY2xhdWRlJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICB0aGlzLmNsYXVkZUlkbGVOb3RpZmllZC5hZGQoc2Vzc2lvbklkKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY2xhdWRlSWRsZVRpbWVycy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgIH0sIENMQVVERV9JRExFX0RFQk9VTkNFX01TKTtcblxuICAgICAgdGhpcy5jbGF1ZGVJZGxlVGltZXJzLnNldChzZXNzaW9uSWQsIHRpbWVyKTtcbiAgICB9XG5cbiAgICAvLyBDbGF1ZGUgYmVjYW1lIGFjdGl2ZSBhZ2FpbiAtIHJlc2V0IG5vdGlmaWNhdGlvbiBmbGFnXG4gICAgaWYgKCFwcmV2aW91c0FjdGl2ZSAmJiBjdXJyZW50QWN0aXZlKSB7XG4gICAgICB0aGlzLmNsYXVkZUlkbGVOb3RpZmllZC5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGRldGVjdENsYXVkZVBhdHRlcm5zKHNlc3Npb25JZDogc3RyaW5nLCBfc2Vzc2lvbjogU2Vzc2lvblN0YXRlLCBkYXRhOiBzdHJpbmcpIHtcbiAgICAvLyBEZXRlY3QgcGF0dGVybnMgdGhhdCBpbmRpY2F0ZSBDbGF1ZGUgaXMgd29ya2luZyBvciBoYXMgZmluaXNoZWRcbiAgICBjb25zdCB3b3JraW5nUGF0dGVybnMgPSBbJ1RoaW5raW5nLi4uJywgJ0FuYWx5emluZycsICdXb3JraW5nIG9uJywgJ0xldCBtZSddO1xuXG4gICAgY29uc3QgaWRsZVBhdHRlcm5zID0gW1xuICAgICAgXCJJJ3ZlIGNvbXBsZXRlZFwiLFxuICAgICAgXCJJJ3ZlIGZpbmlzaGVkXCIsXG4gICAgICAnRG9uZSEnLFxuICAgICAgXCJIZXJlJ3NcIixcbiAgICAgICdUaGUgdGFzayBpcyBjb21wbGV0ZScsXG4gICAgXTtcblxuICAgIC8vIENoZWNrIGZvciB3b3JraW5nIHBhdHRlcm5zXG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHdvcmtpbmdQYXR0ZXJucykge1xuICAgICAgaWYgKGRhdGEuaW5jbHVkZXMocGF0dGVybikpIHtcbiAgICAgICAgdGhpcy51cGRhdGVTZXNzaW9uQWN0aXZpdHkoc2Vzc2lvbklkLCB0cnVlLCAnY2xhdWRlJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBmb3IgaWRsZSBwYXR0ZXJuc1xuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBpZGxlUGF0dGVybnMpIHtcbiAgICAgIGlmIChkYXRhLmluY2x1ZGVzKHBhdHRlcm4pKSB7XG4gICAgICAgIC8vIERlbGF5IG1hcmtpbmcgYXMgaWRsZSB0byBhbGxvdyBmb3IgZm9sbG93LXVwIG91dHB1dFxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNlc3Npb25BY3Rpdml0eShzZXNzaW9uSWQsIGZhbHNlLCAnY2xhdWRlJyk7XG4gICAgICAgIH0sIDEwMDApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhbGwgYWN0aXZlIHNlc3Npb25zXG4gICAqL1xuICBwdWJsaWMgZ2V0QWN0aXZlU2Vzc2lvbnMoKTogU2Vzc2lvblN0YXRlW10ge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuc2Vzc2lvbnMudmFsdWVzKCkpLmZpbHRlcigocykgPT4gcy5pc1J1bm5pbmcpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhIHNwZWNpZmljIHNlc3Npb25cbiAgICovXG4gIHB1YmxpYyBnZXRTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy5zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIG1vbml0b3Igd2l0aCBleGlzdGluZyBzZXNzaW9uc1xuICAgKi9cbiAgcHVibGljIGFzeW5jIGluaXRpYWxpemUoKSB7XG4gICAgLy8gR2V0IGFsbCBleGlzdGluZyBzZXNzaW9ucyBmcm9tIFB0eU1hbmFnZXJcbiAgICBjb25zdCBleGlzdGluZ1Nlc3Npb25zID0gYXdhaXQgdGhpcy5wdHlNYW5hZ2VyLmxpc3RTZXNzaW9ucygpO1xuXG4gICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIGV4aXN0aW5nU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSB7XG4gICAgICAgIGNvbnN0IHN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG4gICAgICAgICAgaWQ6IHNlc3Npb24uaWQsXG4gICAgICAgICAgbmFtZTogc2Vzc2lvbi5uYW1lLFxuICAgICAgICAgIGNvbW1hbmQ6IHNlc3Npb24uY29tbWFuZCxcbiAgICAgICAgICB3b3JraW5nRGlyOiBzZXNzaW9uLndvcmtpbmdEaXIsXG4gICAgICAgICAgc3RhdHVzOiAncnVubmluZycsXG4gICAgICAgICAgaXNSdW5uaW5nOiB0cnVlLFxuICAgICAgICAgIHBpZDogc2Vzc2lvbi5waWQsXG4gICAgICAgICAgaXNDbGF1ZGVTZXNzaW9uOiB0aGlzLmRldGVjdENsYXVkZUNvbW1hbmQoc2Vzc2lvbi5jb21tYW5kKSxcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnNlc3Npb25zLnNldChzZXNzaW9uLmlkLCBzdGF0ZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbG9nZ2VyLmluZm8oYEluaXRpYWxpemVkIHdpdGggJHt0aGlzLnNlc3Npb25zLnNpemV9IGV4aXN0aW5nIHNlc3Npb25zYCk7XG4gIH1cbn1cbiJdfQ==