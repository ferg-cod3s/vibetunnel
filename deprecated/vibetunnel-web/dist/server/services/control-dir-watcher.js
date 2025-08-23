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
exports.ControlDirWatcher = void 0;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_js_1 = require("../../shared/types.js");
const server_js_1 = require("../server.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('control-dir-watcher');
class ControlDirWatcher {
    constructor(config) {
        this.watcher = null;
        this.recentlyNotifiedSessions = new Map(); // Track recently notified sessions
        this.config = config;
        logger.debug(`Initialized with control dir: ${config.controlDir}, HQ mode: ${config.isHQMode}`);
    }
    start() {
        // Create control directory if it doesn't exist
        if (!fs.existsSync(this.config.controlDir)) {
            logger.debug(chalk_1.default.yellow(`Control directory ${this.config.controlDir} does not exist, creating it`));
            fs.mkdirSync(this.config.controlDir, { recursive: true });
        }
        this.watcher = fs.watch(this.config.controlDir, { persistent: true }, async (eventType, filename) => {
            if (eventType === 'rename' && filename) {
                await this.handleFileChange(filename);
            }
        });
        logger.debug(chalk_1.default.green(`Control directory watcher started for ${this.config.controlDir}`));
    }
    async handleFileChange(filename) {
        const sessionPath = path.join(this.config.controlDir, filename);
        const sessionJsonPath = path.join(sessionPath, 'session.json');
        try {
            // Check if this is a directory creation event
            if (fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory()) {
                // This is a new session directory, wait for session.json with retries
                const maxRetries = 5;
                const baseDelay = 100;
                let sessionData = null;
                for (let i = 0; i < maxRetries; i++) {
                    const delay = baseDelay * 2 ** i; // Exponential backoff: 100, 200, 400, 800, 1600ms
                    logger.debug(`Attempt ${i + 1}/${maxRetries}: Waiting ${delay}ms for session.json for ${filename}`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    if (fs.existsSync(sessionJsonPath)) {
                        try {
                            const content = fs.readFileSync(sessionJsonPath, 'utf8');
                            sessionData = JSON.parse(content);
                            logger.debug(`Successfully read session.json for ${filename} on attempt ${i + 1}`);
                            break;
                        }
                        catch (error) {
                            logger.debug(`Failed to read/parse session.json on attempt ${i + 1}:`, error);
                            // Continue to next retry
                        }
                    }
                }
                if (sessionData) {
                    // Session was created
                    const sessionId = (sessionData.id || sessionData.session_id || filename);
                    logger.debug(chalk_1.default.blue(`Detected new external session: ${sessionId}`));
                    // Check if PtyManager already knows about this session
                    if (this.config.ptyManager) {
                        const existingSession = this.config.ptyManager.getSession(sessionId);
                        if (!existingSession) {
                            // This is a new external session, PtyManager needs to track it
                            logger.debug(chalk_1.default.green(`Attaching to external session: ${sessionId}`));
                            // PtyManager will pick it up through its own session listing
                            // since it reads from the control directory
                        }
                    }
                    // Send push notification for session start (with deduplication)
                    if (this.config.pushNotificationService) {
                        // Check if we recently sent a notification for this session
                        const lastNotified = this.recentlyNotifiedSessions.get(sessionId);
                        const now = Date.now();
                        // Skip if we notified about this session in the last 5 seconds
                        if (lastNotified && now - lastNotified < 5000) {
                            logger.debug(`Skipping duplicate notification for session ${sessionId} (notified ${now - lastNotified}ms ago)`);
                            return;
                        }
                        // Update last notified time
                        this.recentlyNotifiedSessions.set(sessionId, now);
                        // Clean up old entries (older than 1 minute)
                        for (const [sid, time] of this.recentlyNotifiedSessions.entries()) {
                            if (now - time > 60000) {
                                this.recentlyNotifiedSessions.delete(sid);
                            }
                        }
                        const sessionName = (sessionData.name ||
                            sessionData.command ||
                            'Terminal Session');
                        this.config.pushNotificationService
                            ?.sendNotification({
                            type: 'session-start',
                            title: 'Session Started',
                            body: `${sessionName} has started.`,
                            icon: '/apple-touch-icon.png',
                            badge: '/favicon-32.png',
                            tag: `vibetunnel-session-start-${sessionId}`,
                            requireInteraction: false,
                            data: {
                                type: 'session-start',
                                sessionId,
                                sessionName,
                                timestamp: new Date().toISOString(),
                            },
                            actions: [
                                { action: 'view-session', title: 'View Session' },
                                { action: 'dismiss', title: 'Dismiss' },
                            ],
                        })
                            .catch((err) => logger.error('Push notify session-start failed:', err));
                    }
                    // If we're a remote server registered with HQ, immediately notify HQ
                    if (this.config.hqClient && !(0, server_js_1.isShuttingDown)()) {
                        try {
                            await this.notifyHQAboutSession(sessionId, 'created');
                        }
                        catch (error) {
                            logger.error(`Failed to notify HQ about new session ${sessionId}:`, error);
                        }
                    }
                    // If we're in HQ mode and this is a local session, no special handling needed
                    // The session is already tracked locally
                }
                else {
                    logger.warn(`Session.json not found for ${filename} after ${maxRetries} retries`);
                }
            }
            else if (!fs.existsSync(sessionPath)) {
                // Session directory was removed
                const sessionId = filename;
                logger.debug(chalk_1.default.yellow(`Detected removed session: ${sessionId}`));
                // If we're a remote server registered with HQ, immediately notify HQ
                if (this.config.hqClient && !(0, server_js_1.isShuttingDown)()) {
                    try {
                        await this.notifyHQAboutSession(sessionId, 'deleted');
                    }
                    catch (error) {
                        // During shutdown, this is expected
                        if (!(0, server_js_1.isShuttingDown)()) {
                            logger.error(`Failed to notify HQ about deleted session ${sessionId}:`, error);
                        }
                    }
                }
                // If in HQ mode, remove from tracking
                if (this.config.isHQMode && this.config.remoteRegistry) {
                    logger.debug(`Removing session ${sessionId} from remote registry`);
                    this.config.remoteRegistry.removeSessionFromRemote(sessionId);
                }
            }
        }
        catch (error) {
            logger.error(`Error handling file change for ${filename}:`, error);
        }
    }
    async notifyHQAboutSession(sessionId, action) {
        if (!this.config.hqClient || (0, server_js_1.isShuttingDown)()) {
            logger.debug(`Skipping HQ notification for ${sessionId} (${action}): shutting down or no HQ client`);
            return;
        }
        const hqUrl = this.config.hqClient.getHQUrl();
        const hqAuth = this.config.hqClient.getHQAuth();
        const remoteName = this.config.hqClient.getName();
        logger.debug(`Notifying HQ at ${hqUrl} about ${action} session ${sessionId} from remote ${remoteName}`);
        const startTime = Date.now();
        // Notify HQ about session change
        // For now, we'll trigger a session list refresh by calling the HQ's session endpoint
        // This will cause HQ to update its registry with the latest session information
        const response = await fetch(`${hqUrl}/api/remotes/${remoteName}/refresh-sessions`, {
            method: types_js_1.HttpMethod.POST,
            headers: {
                'Content-Type': 'application/json',
                Authorization: hqAuth,
            },
            body: JSON.stringify({
                action,
                sessionId,
            }),
        });
        if (!response.ok) {
            // If we get a 503 during shutdown, that's expected
            if (response.status === 503 && (0, server_js_1.isShuttingDown)()) {
                logger.debug(`Got expected 503 from HQ during shutdown`);
                return;
            }
            throw new Error(`HQ responded with ${response.status}: ${await response.text()}`);
        }
        const duration = Date.now() - startTime;
        logger.debug(chalk_1.default.green(`Notified HQ about ${action} session ${sessionId} (${duration}ms)`));
    }
    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.debug(chalk_1.default.yellow('Control directory watcher stopped'));
        }
        else {
            logger.debug('Stop called but watcher was not running');
        }
    }
}
exports.ControlDirWatcher = ControlDirWatcher;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbC1kaXItd2F0Y2hlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvc2VydmljZXMvY29udHJvbC1kaXItd2F0Y2hlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxrREFBMEI7QUFDMUIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QixvREFBbUQ7QUFFbkQsNENBQThDO0FBQzlDLGtEQUFrRDtBQUtsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMscUJBQXFCLENBQUMsQ0FBQztBQVduRCxNQUFhLGlCQUFpQjtJQUs1QixZQUFZLE1BQStCO1FBSm5DLFlBQU8sR0FBd0IsSUFBSSxDQUFDO1FBRXBDLDZCQUF3QixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDLENBQUMsbUNBQW1DO1FBRy9GLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLE1BQU0sQ0FBQyxVQUFVLGNBQWMsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDbEcsQ0FBQztJQUVELEtBQUs7UUFDSCwrQ0FBK0M7UUFDL0MsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQzNDLE1BQU0sQ0FBQyxLQUFLLENBQ1YsZUFBSyxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLDhCQUE4QixDQUFDLENBQ3hGLENBQUM7WUFDRixFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLEtB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aGFsayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgSHR0cE1ldGhvZCB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFB0eU1hbmFnZXIgfSBmcm9tICcuLi9wdHkvaW5kZXguanMnO1xuaW1wb3J0IHsgaXNTaHV0dGluZ0Rvd24gfSBmcm9tICcuLi9zZXJ2ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgSFFDbGllbnQgfSBmcm9tICcuL2hxLWNsaWVudC5qcyc7XG5pbXBvcnQgdHlwZSB7IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9wdXNoLW5vdGlmaWNhdGlvbi1zZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgUmVtb3RlUmVnaXN0cnkgfSBmcm9tICcuL3JlbW90ZS1yZWdpc3RyeS5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignY29udHJvbC1kaXItd2F0Y2hlcicpO1xuXG5pbnRlcmZhY2UgQ29udHJvbERpcldhdGNoZXJDb25maWcge1xuICBjb250cm9sRGlyOiBzdHJpbmc7XG4gIHJlbW90ZVJlZ2lzdHJ5OiBSZW1vdGVSZWdpc3RyeSB8IG51bGw7XG4gIGlzSFFNb2RlOiBib29sZWFuO1xuICBocUNsaWVudDogSFFDbGllbnQgfCBudWxsO1xuICBwdHlNYW5hZ2VyPzogUHR5TWFuYWdlcjtcbiAgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2U/OiBQdXNoTm90aWZpY2F0aW9uU2VydmljZTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnRyb2xEaXJXYXRjaGVyIHtcbiAgcHJpdmF0ZSB3YXRjaGVyOiBmcy5GU1dhdGNoZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjb25maWc6IENvbnRyb2xEaXJXYXRjaGVyQ29uZmlnO1xuICBwcml2YXRlIHJlY2VudGx5Tm90aWZpZWRTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7IC8vIFRyYWNrIHJlY2VudGx5IG5vdGlmaWVkIHNlc3Npb25zXG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBDb250cm9sRGlyV2F0Y2hlckNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIGxvZ2dlci5kZWJ1ZyhgSW5pdGlhbGl6ZWQgd2l0aCBjb250cm9sIGRpcjogJHtjb25maWcuY29udHJvbERpcn0sIEhRIG1vZGU6ICR7Y29uZmlnLmlzSFFNb2RlfWApO1xuICB9XG5cbiAgc3RhcnQoKTogdm9pZCB7XG4gICAgLy8gQ3JlYXRlIGNvbnRyb2wgZGlyZWN0b3J5IGlmIGl0IGRvZXNuJ3QgZXhpc3RcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmModGhpcy5jb25maWcuY29udHJvbERpcikpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgY2hhbGsueWVsbG93KGBDb250cm9sIGRpcmVjdG9yeSAke3RoaXMuY29uZmlnLmNvbnRyb2xEaXJ9IGRvZXMgbm90IGV4aXN0LCBjcmVhdGluZyBpdGApXG4gICAgICApO1xuICAgICAgZnMubWtkaXJTeW5jKHRoaXMuY29uZmlnLmNvbnRyb2xEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIH1cblxuICAgIHRoaXMud2F0Y2hlciA9IGZzLndhdGNoKFxuICAgICAgdGhpcy5jb25maWcuY29udHJvbERpcixcbiAgICAgIHsgcGVyc2lzdGVudDogdHJ1ZSB9LFxuICAgICAgYXN5bmMgKGV2ZW50VHlwZSwgZmlsZW5hbWUpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ3JlbmFtZScgJiYgZmlsZW5hbWUpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUZpbGVDaGFuZ2UoZmlsZW5hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgKTtcblxuICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ncmVlbihgQ29udHJvbCBkaXJlY3Rvcnkgd2F0Y2hlciBzdGFydGVkIGZvciAke3RoaXMuY29uZmlnLmNvbnRyb2xEaXJ9YCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVGaWxlQ2hhbmdlKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uUGF0aCA9IHBhdGguam9pbih0aGlzLmNvbmZpZy5jb250cm9sRGlyLCBmaWxlbmFtZSk7XG4gICAgY29uc3Qgc2Vzc2lvbkpzb25QYXRoID0gcGF0aC5qb2luKHNlc3Npb25QYXRoLCAnc2Vzc2lvbi5qc29uJyk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGRpcmVjdG9yeSBjcmVhdGlvbiBldmVudFxuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc2Vzc2lvblBhdGgpICYmIGZzLnN0YXRTeW5jKHNlc3Npb25QYXRoKS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIC8vIFRoaXMgaXMgYSBuZXcgc2Vzc2lvbiBkaXJlY3RvcnksIHdhaXQgZm9yIHNlc3Npb24uanNvbiB3aXRoIHJldHJpZXNcbiAgICAgICAgY29uc3QgbWF4UmV0cmllcyA9IDU7XG4gICAgICAgIGNvbnN0IGJhc2VEZWxheSA9IDEwMDtcbiAgICAgICAgbGV0IHNlc3Npb25EYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbWF4UmV0cmllczsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgZGVsYXkgPSBiYXNlRGVsYXkgKiAyICoqIGk7IC8vIEV4cG9uZW50aWFsIGJhY2tvZmY6IDEwMCwgMjAwLCA0MDAsIDgwMCwgMTYwMG1zXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgYEF0dGVtcHQgJHtpICsgMX0vJHttYXhSZXRyaWVzfTogV2FpdGluZyAke2RlbGF5fW1zIGZvciBzZXNzaW9uLmpzb24gZm9yICR7ZmlsZW5hbWV9YFxuICAgICAgICAgICk7XG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcblxuICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNlc3Npb25Kc29uUGF0aCkpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBmcy5yZWFkRmlsZVN5bmMoc2Vzc2lvbkpzb25QYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgICBzZXNzaW9uRGF0YSA9IEpTT04ucGFyc2UoY29udGVudCk7XG4gICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgU3VjY2Vzc2Z1bGx5IHJlYWQgc2Vzc2lvbi5qc29uIGZvciAke2ZpbGVuYW1lfSBvbiBhdHRlbXB0ICR7aSArIDF9YCk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBGYWlsZWQgdG8gcmVhZC9wYXJzZSBzZXNzaW9uLmpzb24gb24gYXR0ZW1wdCAke2kgKyAxfTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgIC8vIENvbnRpbnVlIHRvIG5leHQgcmV0cnlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbkRhdGEpIHtcbiAgICAgICAgICAvLyBTZXNzaW9uIHdhcyBjcmVhdGVkXG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gKHNlc3Npb25EYXRhLmlkIHx8IHNlc3Npb25EYXRhLnNlc3Npb25faWQgfHwgZmlsZW5hbWUpIGFzIHN0cmluZztcblxuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ibHVlKGBEZXRlY3RlZCBuZXcgZXh0ZXJuYWwgc2Vzc2lvbjogJHtzZXNzaW9uSWR9YCkpO1xuXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgUHR5TWFuYWdlciBhbHJlYWR5IGtub3dzIGFib3V0IHRoaXMgc2Vzc2lvblxuICAgICAgICAgIGlmICh0aGlzLmNvbmZpZy5wdHlNYW5hZ2VyKSB7XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ1Nlc3Npb24gPSB0aGlzLmNvbmZpZy5wdHlNYW5hZ2VyLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIGlmICghZXhpc3RpbmdTZXNzaW9uKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBuZXcgZXh0ZXJuYWwgc2Vzc2lvbiwgUHR5TWFuYWdlciBuZWVkcyB0byB0cmFjayBpdFxuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoY2hhbGsuZ3JlZW4oYEF0dGFjaGluZyB0byBleHRlcm5hbCBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKSk7XG4gICAgICAgICAgICAgIC8vIFB0eU1hbmFnZXIgd2lsbCBwaWNrIGl0IHVwIHRocm91Z2ggaXRzIG93biBzZXNzaW9uIGxpc3RpbmdcbiAgICAgICAgICAgICAgLy8gc2luY2UgaXQgcmVhZHMgZnJvbSB0aGUgY29udHJvbCBkaXJlY3RvcnlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTZW5kIHB1c2ggbm90aWZpY2F0aW9uIGZvciBzZXNzaW9uIHN0YXJ0ICh3aXRoIGRlZHVwbGljYXRpb24pXG4gICAgICAgICAgaWYgKHRoaXMuY29uZmlnLnB1c2hOb3RpZmljYXRpb25TZXJ2aWNlKSB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSByZWNlbnRseSBzZW50IGEgbm90aWZpY2F0aW9uIGZvciB0aGlzIHNlc3Npb25cbiAgICAgICAgICAgIGNvbnN0IGxhc3ROb3RpZmllZCA9IHRoaXMucmVjZW50bHlOb3RpZmllZFNlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuICAgICAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAgICAgLy8gU2tpcCBpZiB3ZSBub3RpZmllZCBhYm91dCB0aGlzIHNlc3Npb24gaW4gdGhlIGxhc3QgNSBzZWNvbmRzXG4gICAgICAgICAgICBpZiAobGFzdE5vdGlmaWVkICYmIG5vdyAtIGxhc3ROb3RpZmllZCA8IDUwMDApIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICAgIGBTa2lwcGluZyBkdXBsaWNhdGUgbm90aWZpY2F0aW9uIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSAobm90aWZpZWQgJHtub3cgLSBsYXN0Tm90aWZpZWR9bXMgYWdvKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgbGFzdCBub3RpZmllZCB0aW1lXG4gICAgICAgICAgICB0aGlzLnJlY2VudGx5Tm90aWZpZWRTZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBub3cpO1xuXG4gICAgICAgICAgICAvLyBDbGVhbiB1cCBvbGQgZW50cmllcyAob2xkZXIgdGhhbiAxIG1pbnV0ZSlcbiAgICAgICAgICAgIGZvciAoY29uc3QgW3NpZCwgdGltZV0gb2YgdGhpcy5yZWNlbnRseU5vdGlmaWVkU2Vzc2lvbnMuZW50cmllcygpKSB7XG4gICAgICAgICAgICAgIGlmIChub3cgLSB0aW1lID4gNjAwMDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlY2VudGx5Tm90aWZpZWRTZXNzaW9ucy5kZWxldGUoc2lkKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBzZXNzaW9uTmFtZSA9IChzZXNzaW9uRGF0YS5uYW1lIHx8XG4gICAgICAgICAgICAgIHNlc3Npb25EYXRhLmNvbW1hbmQgfHxcbiAgICAgICAgICAgICAgJ1Rlcm1pbmFsIFNlc3Npb24nKSBhcyBzdHJpbmc7XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wdXNoTm90aWZpY2F0aW9uU2VydmljZVxuICAgICAgICAgICAgICA/LnNlbmROb3RpZmljYXRpb24oe1xuICAgICAgICAgICAgICAgIHR5cGU6ICdzZXNzaW9uLXN0YXJ0JyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ1Nlc3Npb24gU3RhcnRlZCcsXG4gICAgICAgICAgICAgICAgYm9keTogYCR7c2Vzc2lvbk5hbWV9IGhhcyBzdGFydGVkLmAsXG4gICAgICAgICAgICAgICAgaWNvbjogJy9hcHBsZS10b3VjaC1pY29uLnBuZycsXG4gICAgICAgICAgICAgICAgYmFkZ2U6ICcvZmF2aWNvbi0zMi5wbmcnLFxuICAgICAgICAgICAgICAgIHRhZzogYHZpYmV0dW5uZWwtc2Vzc2lvbi1zdGFydC0ke3Nlc3Npb25JZH1gLFxuICAgICAgICAgICAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ3Nlc3Npb24tc3RhcnQnLFxuICAgICAgICAgICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgICAgICAgICAgc2Vzc2lvbk5hbWUsXG4gICAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgIHsgYWN0aW9uOiAndmlldy1zZXNzaW9uJywgdGl0bGU6ICdWaWV3IFNlc3Npb24nIH0sXG4gICAgICAgICAgICAgICAgICB7IGFjdGlvbjogJ2Rpc21pc3MnLCB0aXRsZTogJ0Rpc21pc3MnIH0sXG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgLmNhdGNoKChlcnIpID0+IGxvZ2dlci5lcnJvcignUHVzaCBub3RpZnkgc2Vzc2lvbi1zdGFydCBmYWlsZWQ6JywgZXJyKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gSWYgd2UncmUgYSByZW1vdGUgc2VydmVyIHJlZ2lzdGVyZWQgd2l0aCBIUSwgaW1tZWRpYXRlbHkgbm90aWZ5IEhRXG4gICAgICAgICAgaWYgKHRoaXMuY29uZmlnLmhxQ2xpZW50ICYmICFpc1NodXR0aW5nRG93bigpKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLm5vdGlmeUhRQWJvdXRTZXNzaW9uKHNlc3Npb25JZCwgJ2NyZWF0ZWQnKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIG5vdGlmeSBIUSBhYm91dCBuZXcgc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHdlJ3JlIGluIEhRIG1vZGUgYW5kIHRoaXMgaXMgYSBsb2NhbCBzZXNzaW9uLCBubyBzcGVjaWFsIGhhbmRsaW5nIG5lZWRlZFxuICAgICAgICAgIC8vIFRoZSBzZXNzaW9uIGlzIGFscmVhZHkgdHJhY2tlZCBsb2NhbGx5XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oYFNlc3Npb24uanNvbiBub3QgZm91bmQgZm9yICR7ZmlsZW5hbWV9IGFmdGVyICR7bWF4UmV0cmllc30gcmV0cmllc2ApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFmcy5leGlzdHNTeW5jKHNlc3Npb25QYXRoKSkge1xuICAgICAgICAvLyBTZXNzaW9uIGRpcmVjdG9yeSB3YXMgcmVtb3ZlZFxuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSBmaWxlbmFtZTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGNoYWxrLnllbGxvdyhgRGV0ZWN0ZWQgcmVtb3ZlZCBzZXNzaW9uOiAke3Nlc3Npb25JZH1gKSk7XG5cbiAgICAgICAgLy8gSWYgd2UncmUgYSByZW1vdGUgc2VydmVyIHJlZ2lzdGVyZWQgd2l0aCBIUSwgaW1tZWRpYXRlbHkgbm90aWZ5IEhRXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5ocUNsaWVudCAmJiAhaXNTaHV0dGluZ0Rvd24oKSkge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLm5vdGlmeUhRQWJvdXRTZXNzaW9uKHNlc3Npb25JZCwgJ2RlbGV0ZWQnKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgLy8gRHVyaW5nIHNodXRkb3duLCB0aGlzIGlzIGV4cGVjdGVkXG4gICAgICAgICAgICBpZiAoIWlzU2h1dHRpbmdEb3duKCkpIHtcbiAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gbm90aWZ5IEhRIGFib3V0IGRlbGV0ZWQgc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIGluIEhRIG1vZGUsIHJlbW92ZSBmcm9tIHRyYWNraW5nXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5pc0hRTW9kZSAmJiB0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeSkge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgUmVtb3Zpbmcgc2Vzc2lvbiAke3Nlc3Npb25JZH0gZnJvbSByZW1vdGUgcmVnaXN0cnlgKTtcbiAgICAgICAgICB0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeS5yZW1vdmVTZXNzaW9uRnJvbVJlbW90ZShzZXNzaW9uSWQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgaGFuZGxpbmcgZmlsZSBjaGFuZ2UgZm9yICR7ZmlsZW5hbWV9OmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIG5vdGlmeUhRQWJvdXRTZXNzaW9uKFxuICAgIHNlc3Npb25JZDogc3RyaW5nLFxuICAgIGFjdGlvbjogJ2NyZWF0ZWQnIHwgJ2RlbGV0ZWQnXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5jb25maWcuaHFDbGllbnQgfHwgaXNTaHV0dGluZ0Rvd24oKSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgU2tpcHBpbmcgSFEgbm90aWZpY2F0aW9uIGZvciAke3Nlc3Npb25JZH0gKCR7YWN0aW9ufSk6IHNodXR0aW5nIGRvd24gb3Igbm8gSFEgY2xpZW50YFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBocVVybCA9IHRoaXMuY29uZmlnLmhxQ2xpZW50LmdldEhRVXJsKCk7XG4gICAgY29uc3QgaHFBdXRoID0gdGhpcy5jb25maWcuaHFDbGllbnQuZ2V0SFFBdXRoKCk7XG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IHRoaXMuY29uZmlnLmhxQ2xpZW50LmdldE5hbWUoKTtcblxuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBOb3RpZnlpbmcgSFEgYXQgJHtocVVybH0gYWJvdXQgJHthY3Rpb259IHNlc3Npb24gJHtzZXNzaW9uSWR9IGZyb20gcmVtb3RlICR7cmVtb3RlTmFtZX1gXG4gICAgKTtcbiAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gTm90aWZ5IEhRIGFib3V0IHNlc3Npb24gY2hhbmdlXG4gICAgLy8gRm9yIG5vdywgd2UnbGwgdHJpZ2dlciBhIHNlc3Npb24gbGlzdCByZWZyZXNoIGJ5IGNhbGxpbmcgdGhlIEhRJ3Mgc2Vzc2lvbiBlbmRwb2ludFxuICAgIC8vIFRoaXMgd2lsbCBjYXVzZSBIUSB0byB1cGRhdGUgaXRzIHJlZ2lzdHJ5IHdpdGggdGhlIGxhdGVzdCBzZXNzaW9uIGluZm9ybWF0aW9uXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtocVVybH0vYXBpL3JlbW90ZXMvJHtyZW1vdGVOYW1lfS9yZWZyZXNoLXNlc3Npb25zYCwge1xuICAgICAgbWV0aG9kOiBIdHRwTWV0aG9kLlBPU1QsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIEF1dGhvcml6YXRpb246IGhxQXV0aCxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGFjdGlvbixcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAvLyBJZiB3ZSBnZXQgYSA1MDMgZHVyaW5nIHNodXRkb3duLCB0aGF0J3MgZXhwZWN0ZWRcbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDUwMyAmJiBpc1NodXR0aW5nRG93bigpKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgR290IGV4cGVjdGVkIDUwMyBmcm9tIEhRIGR1cmluZyBzaHV0ZG93bmApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEhRIHJlc3BvbmRlZCB3aXRoICR7cmVzcG9uc2Uuc3RhdHVzfTogJHthd2FpdCByZXNwb25zZS50ZXh0KCl9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgIGxvZ2dlci5kZWJ1ZyhjaGFsay5ncmVlbihgTm90aWZpZWQgSFEgYWJvdXQgJHthY3Rpb259IHNlc3Npb24gJHtzZXNzaW9uSWR9ICgke2R1cmF0aW9ufW1zKWApKTtcbiAgfVxuXG4gIHN0b3AoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMud2F0Y2hlcikge1xuICAgICAgdGhpcy53YXRjaGVyLmNsb3NlKCk7XG4gICAgICB0aGlzLndhdGNoZXIgPSBudWxsO1xuICAgICAgbG9nZ2VyLmRlYnVnKGNoYWxrLnllbGxvdygnQ29udHJvbCBkaXJlY3Rvcnkgd2F0Y2hlciBzdG9wcGVkJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ1N0b3AgY2FsbGVkIGJ1dCB3YXRjaGVyIHdhcyBub3QgcnVubmluZycpO1xuICAgIH1cbiAgfVxufVxuIl19