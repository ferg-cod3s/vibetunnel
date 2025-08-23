"use strict";
/**
 * Git File Watcher Service
 *
 * Monitors git repositories for file changes and broadcasts git status updates via SSE.
 *
 * Uses a shallow watch strategy to prevent EMFILE errors:
 * - Watches repository root at depth 0 (immediate children only)
 * - Watches specific .git files that affect status
 * - Combined with periodic polling to catch any missed changes
 *
 * This approach prevents watching thousands of files in large repos while still
 * detecting both tracked and untracked file changes.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitWatcher = exports.GitWatcher = void 0;
const chokidar = __importStar(require("chokidar"));
const fs_1 = require("fs");
const git_status_js_1 = require("../utils/git-status.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('git-watcher');
class GitWatcher {
    constructor() {
        this.watchers = new Map();
    }
    /**
     * Start watching git repository for a session
     */
    startWatching(sessionId, workingDir, gitRepoPath) {
        // Don't create duplicate watchers
        if (this.watchers.has(sessionId)) {
            logger.debug(`Git watcher already exists for session ${sessionId}`);
            return;
        }
        logger.debug(`Starting git watcher for session ${sessionId} at ${gitRepoPath}`);
        // Watch strategy:
        // 1. Watch the repository root at depth 0 (only immediate files/folders)
        // 2. Watch .git directory separately for git operations
        // This gives us file change detection without watching thousands of files
        const watcher = chokidar.watch(gitRepoPath, {
            ignoreInitial: true,
            ignored: [
                // Always ignore these to prevent performance issues
                '**/node_modules/**',
                '**/.git/objects/**', // Git's object database - huge
                '**/.git/logs/**', // Git's log files
                '**/dist/**',
                '**/build/**',
                '**/.next/**',
                '**/coverage/**',
                '**/.turbo/**',
                '**/*.log',
                '**/.DS_Store',
            ],
            // CRITICAL: Only watch immediate children, not recursive
            depth: 0,
            // Don't follow symlinks to avoid infinite loops
            followSymlinks: false,
            // Use native events for better performance
            usePolling: false,
            // Don't wait for write to finish - we'll debounce anyway
            awaitWriteFinish: false,
        });
        // Also watch specific git files that affect status
        const gitPaths = [
            `${gitRepoPath}/.git/index`,
            `${gitRepoPath}/.git/HEAD`,
            `${gitRepoPath}/.git/refs/heads`,
        ].filter((path) => {
            try {
                (0, fs_1.accessSync)(path);
                return true;
            }
            catch {
                return false;
            }
        });
        if (gitPaths.length > 0) {
            // Add git paths to the watcher
            watcher.add(gitPaths);
        }
        logger.debug(`Git watcher started for session ${sessionId} with shallow directory watching`);
        const watcherInfo = {
            watcher,
            sessionId,
            workingDir,
            gitRepoPath,
            clients: new Set(),
        };
        // Handle any file system change
        const handleChange = (changedPath, eventType) => {
            // Only log significant events to reduce noise
            const isGitFile = changedPath.includes('.git');
            if (isGitFile || eventType !== 'change') {
                logger.debug(`Git watcher event for session ${sessionId}: ${eventType} ${changedPath}`);
            }
            // Clear existing debounce timer
            if (watcherInfo.debounceTimer) {
                clearTimeout(watcherInfo.debounceTimer);
            }
            // Debounce rapid changes
            watcherInfo.debounceTimer = setTimeout(() => {
                this.checkAndBroadcastStatus(watcherInfo);
            }, 300);
        };
        // Listen to all events
        watcher.on('all', (eventType, path) => handleChange(path, eventType));
        watcher.on('error', (error) => {
            logger.error(`Git watcher error for session ${sessionId}:`, error);
        });
        this.watchers.set(sessionId, watcherInfo);
        // Get initial status
        this.checkAndBroadcastStatus(watcherInfo);
        // Start periodic check every 2 seconds to catch working directory changes
        // This complements the git file watching and ensures we don't miss changes
        watcherInfo.periodicCheckTimer = setInterval(() => {
            this.checkAndBroadcastStatus(watcherInfo);
        }, 2000);
    }
    /**
     * Add a client to receive git status updates
     */
    addClient(sessionId, client) {
        const watcherInfo = this.watchers.get(sessionId);
        if (!watcherInfo) {
            logger.debug(`No git watcher found for session ${sessionId}`);
            return;
        }
        watcherInfo.clients.add(client);
        logger.debug(`Added SSE client to git watcher for session ${sessionId} (${watcherInfo.clients.size} total)`);
        // Send current status to new client
        if (watcherInfo.lastStatus) {
            this.sendStatusUpdate(client, sessionId, watcherInfo.lastStatus);
        }
    }
    /**
     * Remove a client from git status updates
     */
    removeClient(sessionId, client) {
        const watcherInfo = this.watchers.get(sessionId);
        if (!watcherInfo) {
            return;
        }
        watcherInfo.clients.delete(client);
        logger.debug(`Removed SSE client from git watcher for session ${sessionId} (${watcherInfo.clients.size} remaining)`);
        // If no more clients, stop watching
        if (watcherInfo.clients.size === 0) {
            this.stopWatching(sessionId);
        }
    }
    /**
     * Stop watching git directory for a session
     */
    stopWatching(sessionId) {
        const watcherInfo = this.watchers.get(sessionId);
        if (!watcherInfo) {
            return;
        }
        logger.debug(`Stopping git watcher for session ${sessionId}`);
        // Clear debounce timer
        if (watcherInfo.debounceTimer) {
            clearTimeout(watcherInfo.debounceTimer);
        }
        // Clear periodic check timer
        if (watcherInfo.periodicCheckTimer) {
            clearInterval(watcherInfo.periodicCheckTimer);
        }
        // Close watcher
        watcherInfo.watcher.close();
        // Remove from map
        this.watchers.delete(sessionId);
    }
    /**
     * Check git status and broadcast if changed
     */
    async checkAndBroadcastStatus(watcherInfo) {
        try {
            const status = await (0, git_status_js_1.getDetailedGitStatus)(watcherInfo.workingDir);
            // Check if status has changed
            if (this.hasStatusChanged(watcherInfo.lastStatus, status)) {
                logger.debug(`Git status changed for session ${watcherInfo.sessionId}:`, status);
                watcherInfo.lastStatus = status;
                // Broadcast to all clients
                this.broadcastStatusUpdate(watcherInfo, status);
            }
        }
        catch (error) {
            logger.error(`Failed to get git status for session ${watcherInfo.sessionId}:`, error);
        }
    }
    /**
     * Check if git status has changed
     */
    hasStatusChanged(oldStatus, newStatus) {
        if (!oldStatus)
            return true;
        return (oldStatus.modified !== newStatus.modified ||
            oldStatus.added !== newStatus.added ||
            oldStatus.staged !== newStatus.staged ||
            oldStatus.deleted !== newStatus.deleted ||
            oldStatus.ahead !== newStatus.ahead ||
            oldStatus.behind !== newStatus.behind);
    }
    /**
     * Broadcast status update to all clients
     */
    broadcastStatusUpdate(watcherInfo, status) {
        for (const client of watcherInfo.clients) {
            this.sendStatusUpdate(client, watcherInfo.sessionId, status);
        }
    }
    /**
     * Send status update to a specific client
     */
    sendStatusUpdate(client, sessionId, status) {
        try {
            const event = {
                type: 'git-status-update',
                sessionId,
                gitModifiedCount: status.modified,
                gitAddedCount: status.added,
                gitDeletedCount: status.deleted,
                gitAheadCount: status.ahead,
                gitBehindCount: status.behind,
            };
            client.write(`event: session-update\ndata: ${JSON.stringify(event)}\n\n`);
        }
        catch (error) {
            logger.error(`Failed to send git status update to client:`, error);
        }
    }
    /**
     * Clean up all watchers
     */
    cleanup() {
        logger.debug('Cleaning up all git watchers');
        for (const [sessionId] of this.watchers) {
            this.stopWatching(sessionId);
        }
    }
}
exports.GitWatcher = GitWatcher;
// Export singleton instance
exports.gitWatcher = new GitWatcher();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LXdhdGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL2dpdC13YXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7O0dBWUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILG1EQUFxQztBQUVyQywyQkFBZ0M7QUFDaEMsMERBQW9GO0FBQ3BGLGtEQUFrRDtBQUVsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsYUFBYSxDQUFDLENBQUM7QUFhM0MsTUFBYSxVQUFVO0lBQXZCO1FBQ1UsYUFBUSxHQUFHLElBQUksR0FBRyxFQUF1QixDQUFDO0lBa1FwRCxDQUFDO0lBaFFDOztPQUVHO0lBQ0gsYUFBYSxDQUFDLFNBQWlCLEVBQUUsVUFBa0IsRUFBRSxXQUFtQjtRQUN0RSxrQ0FBa0M7UUFDbEMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxLQUFLLENBQUMsMENBQTBDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDcEUsT0FBTztRQUNULENBQUM7UUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxTQUFTLE9BQU8sV0FBVyxFQUFFLENBQUMsQ0FBQztRQUVoRixrQkFBa0I7UUFDbEIseUVBQXlFO1FBQ3pFLHdEQUF3RDtRQUN4RCwwRUFBMEU7UUFFMUUsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDMUMsYUFBYSxFQUFFLElBQUk7WUFDbkIsT0FBTyxFQUFFO2dCQUNQLG9EQUFvRDtnQkFDcEQsb0JBQW9CO2dCQUNwQixvQkFBb0IsRUFBRSwrQkFBK0I7Z0JBQ3JELGlCQUFpQixFQUFFLGtCQUFrQjtnQkFDckMsWUFBWTtnQkFDWixhQUFhO2dCQUNiLGFBQWE7Z0JBQ2IsZ0JBQWdCO2dCQUNo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LEVBQUUsTUFBTSxDQUFDLEtBQUs7Z0JBQzNCLGVBQWUsRUFBRSxNQUFNLENBQUMsT0FBTztnQkFDL0IsYUFBYSxFQUFFLE1BQU0sQ0FBQyxLQUFLO2dCQUMzQixjQUFjLEVBQUUsTUFBTSxDQUFDLE1BQU07YUFDOUIsQ0FBQztZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyw2Q0FBNkMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRSxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsT0FBTztRQUNMLE1BQU0sQ0FBQyxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUM3QyxLQUFLLE1BQU0sQ0FBQyxTQUFTLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvQixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBblFELGdDQW1RQztBQUVELDRCQUE0QjtBQUNmLFFBQUEsVUFBVSxHQUFHLElBQUksVUFBVSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdpdCBGaWxlIFdhdGNoZXIgU2VydmljZVxuICpcbiAqIE1vbml0b3JzIGdpdCByZXBvc2l0b3JpZXMgZm9yIGZpbGUgY2hhbmdlcyBhbmQgYnJvYWRjYXN0cyBnaXQgc3RhdHVzIHVwZGF0ZXMgdmlhIFNTRS5cbiAqXG4gKiBVc2VzIGEgc2hhbGxvdyB3YXRjaCBzdHJhdGVneSB0byBwcmV2ZW50IEVNRklMRSBlcnJvcnM6XG4gKiAtIFdhdGNoZXMgcmVwb3NpdG9yeSByb290IGF0IGRlcHRoIDAgKGltbWVkaWF0ZSBjaGlsZHJlbiBvbmx5KVxuICogLSBXYXRjaGVzIHNwZWNpZmljIC5naXQgZmlsZXMgdGhhdCBhZmZlY3Qgc3RhdHVzXG4gKiAtIENvbWJpbmVkIHdpdGggcGVyaW9kaWMgcG9sbGluZyB0byBjYXRjaCBhbnkgbWlzc2VkIGNoYW5nZXNcbiAqXG4gKiBUaGlzIGFwcHJvYWNoIHByZXZlbnRzIHdhdGNoaW5nIHRob3VzYW5kcyBvZiBmaWxlcyBpbiBsYXJnZSByZXBvcyB3aGlsZSBzdGlsbFxuICogZGV0ZWN0aW5nIGJvdGggdHJhY2tlZCBhbmQgdW50cmFja2VkIGZpbGUgY2hhbmdlcy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBjaG9raWRhciBmcm9tICdjaG9raWRhcic7XG5pbXBvcnQgdHlwZSB7IFJlc3BvbnNlIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyBhY2Nlc3NTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdHlwZSBHaXRTdGF0dXNDb3VudHMsIGdldERldGFpbGVkR2l0U3RhdHVzIH0gZnJvbSAnLi4vdXRpbHMvZ2l0LXN0YXR1cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2dpdC13YXRjaGVyJyk7XG5cbmludGVyZmFjZSBXYXRjaGVySW5mbyB7XG4gIHdhdGNoZXI6IGNob2tpZGFyLkZTV2F0Y2hlcjtcbiAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gIHdvcmtpbmdEaXI6IHN0cmluZztcbiAgZ2l0UmVwb1BhdGg6IHN0cmluZztcbiAgbGFzdFN0YXR1cz86IEdpdFN0YXR1c0NvdW50cztcbiAgZGVib3VuY2VUaW1lcj86IE5vZGVKUy5UaW1lb3V0O1xuICBwZXJpb2RpY0NoZWNrVGltZXI/OiBOb2RlSlMuVGltZW91dDtcbiAgY2xpZW50czogU2V0PFJlc3BvbnNlPjtcbn1cblxuZXhwb3J0IGNsYXNzIEdpdFdhdGNoZXIge1xuICBwcml2YXRlIHdhdGNoZXJzID0gbmV3IE1hcDxzdHJpbmcsIFdhdGNoZXJJbmZvPigpO1xuXG4gIC8qKlxuICAgKiBTdGFydCB3YXRjaGluZyBnaXQgcmVwb3NpdG9yeSBmb3IgYSBzZXNzaW9uXG4gICAqL1xuICBzdGFydFdhdGNoaW5nKHNlc3Npb25JZDogc3RyaW5nLCB3b3JraW5nRGlyOiBzdHJpbmcsIGdpdFJlcG9QYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBEb24ndCBjcmVhdGUgZHVwbGljYXRlIHdhdGNoZXJzXG4gICAgaWYgKHRoaXMud2F0Y2hlcnMuaGFzKHNlc3Npb25JZCkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgR2l0IHdhdGNoZXIgYWxyZWFkeSBleGlzdHMgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbG9nZ2VyLmRlYnVnKGBTdGFydGluZyBnaXQgd2F0Y2hlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gYXQgJHtnaXRSZXBvUGF0aH1gKTtcblxuICAgIC8vIFdhdGNoIHN0cmF0ZWd5OlxuICAgIC8vIDEuIFdhdGNoIHRoZSByZXBvc2l0b3J5IHJvb3QgYXQgZGVwdGggMCAob25seSBpbW1lZGlhdGUgZmlsZXMvZm9sZGVycylcbiAgICAvLyAyLiBXYXRjaCAuZ2l0IGRpcmVjdG9yeSBzZXBhcmF0ZWx5IGZvciBnaXQgb3BlcmF0aW9uc1xuICAgIC8vIFRoaXMgZ2l2ZXMgdXMgZmlsZSBjaGFuZ2UgZGV0ZWN0aW9uIHdpdGhvdXQgd2F0Y2hpbmcgdGhvdXNhbmRzIG9mIGZpbGVzXG5cbiAgICBjb25zdCB3YXRjaGVyID0gY2hva2lkYXIud2F0Y2goZ2l0UmVwb1BhdGgsIHtcbiAgICAgIGlnbm9yZUluaXRpYWw6IHRydWUsXG4gICAgICBpZ25vcmVkOiBbXG4gICAgICAgIC8vIEFsd2F5cyBpZ25vcmUgdGhlc2UgdG8gcHJldmVudCBwZXJmb3JtYW5jZSBpc3N1ZXNcbiAgICAgICAgJyoqL25vZGVfbW9kdWxlcy8qKicsXG4gICAgICAgICcqKi8uZ2l0L29iamVjdHMvKionLCAvLyBHaXQncyBvYmplY3QgZGF0YWJhc2UgLSBodWdlXG4gICAgICAgICcqKi8uZ2l0L2xvZ3MvKionLCAvLyBHaXQncyBsb2cgZmlsZXNcbiAgICAgICAgJyoqL2Rpc3QvKionLFxuICAgICAgICAnKiovYnVpbGQvKionLFxuICAgICAgICAnKiovLm5leHQvKionLFxuICAgICAgICAnKiovY292ZXJhZ2UvKionLFxuICAgICAgICAnKiovLnR1cmJvLyoqJyxcbiAgICAgICAgJyoqLyoubG9nJyxcbiAgICAgICAgJyoqLy5EU19TdG9yZScsXG4gICAgICBdLFxuICAgICAgLy8gQ1JJVElDQUw6IE9ubHkgd2F0Y2ggaW1tZWRpYXRlIGNoaWxkcmVuLCBub3QgcmVjdXJzaXZlXG4gICAgICBkZXB0aDogMCxcbiAgICAgIC8vIERvbid0IGZvbGxvdyBzeW1saW5rcyB0byBhdm9pZCBpbmZpbml0ZSBsb29wc1xuICAgICAgZm9sbG93U3ltbGlua3M6IGZhbHNlLFxuICAgICAgLy8gVXNlIG5hdGl2ZSBldmVudHMgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxuICAgICAgdXNlUG9sbGluZzogZmFsc2UsXG4gICAgICAvLyBEb24ndCB3YWl0IGZvciB3cml0ZSB0byBmaW5pc2ggLSB3ZSdsbCBkZWJvdW5jZSBhbnl3YXlcbiAgICAgIGF3YWl0V3JpdGVGaW5pc2g6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gQWxzbyB3YXRjaCBzcGVjaWZpYyBnaXQgZmlsZXMgdGhhdCBhZmZlY3Qgc3RhdHVzXG4gICAgY29uc3QgZ2l0UGF0aHMgPSBbXG4gICAgICBgJHtnaXRSZXBvUGF0aH0vLmdpdC9pbmRleGAsXG4gICAgICBgJHtnaXRSZXBvUGF0aH0vLmdpdC9IRUFEYCxcbiAgICAgIGAke2dpdFJlcG9QYXRofS8uZ2l0L3JlZnMvaGVhZHNgLFxuICAgIF0uZmlsdGVyKChwYXRoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBhY2Nlc3NTeW5jKHBhdGgpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBpZiAoZ2l0UGF0aHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gQWRkIGdpdCBwYXRocyB0byB0aGUgd2F0Y2hlclxuICAgICAgd2F0Y2hlci5hZGQoZ2l0UGF0aHMpO1xuICAgIH1cblxuICAgIGxvZ2dlci5kZWJ1ZyhgR2l0IHdhdGNoZXIgc3RhcnRlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gd2l0aCBzaGFsbG93IGRpcmVjdG9yeSB3YXRjaGluZ2ApO1xuXG4gICAgY29uc3Qgd2F0Y2hlckluZm86IFdhdGNoZXJJbmZvID0ge1xuICAgICAgd2F0Y2hlcixcbiAgICAgIHNlc3Npb25JZCxcbiAgICAgIHdvcmtpbmdEaXIsXG4gICAgICBnaXRSZXBvUGF0aCxcbiAgICAgIGNsaWVudHM6IG5ldyBTZXQoKSxcbiAgICB9O1xuXG4gICAgLy8gSGFuZGxlIGFueSBmaWxlIHN5c3RlbSBjaGFuZ2VcbiAgICBjb25zdCBoYW5kbGVDaGFuZ2UgPSAoY2hhbmdlZFBhdGg6IHN0cmluZywgZXZlbnRUeXBlOiBzdHJpbmcpID0+IHtcbiAgICAgIC8vIE9ubHkgbG9nIHNpZ25pZmljYW50IGV2ZW50cyB0byByZWR1Y2Ugbm9pc2VcbiAgICAgIGNvbnN0IGlzR2l0RmlsZSA9IGNoYW5nZWRQYXRoLmluY2x1ZGVzKCcuZ2l0Jyk7XG4gICAgICBpZiAoaXNHaXRGaWxlIHx8IGV2ZW50VHlwZSAhPT0gJ2NoYW5nZScpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBHaXQgd2F0Y2hlciBldmVudCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7ZXZlbnRUeXBlfSAke2NoYW5nZWRQYXRofWApO1xuICAgICAgfVxuXG4gICAgICAvLyBDbGVhciBleGlzdGluZyBkZWJvdW5jZSB0aW1lclxuICAgICAgaWYgKHdhdGNoZXJJbmZvLmRlYm91bmNlVGltZXIpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHdhdGNoZXJJbmZvLmRlYm91bmNlVGltZXIpO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWJvdW5jZSByYXBpZCBjaGFuZ2VzXG4gICAgICB3YXRjaGVySW5mby5kZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMuY2hlY2tBbmRCcm9hZGNhc3RTdGF0dXMod2F0Y2hlckluZm8pO1xuICAgICAgfSwgMzAwKTtcbiAgICB9O1xuXG4gICAgLy8gTGlzdGVuIHRvIGFsbCBldmVudHNcbiAgICB3YXRjaGVyLm9uKCdhbGwnLCAoZXZlbnRUeXBlLCBwYXRoKSA9PiBoYW5kbGVDaGFuZ2UocGF0aCwgZXZlbnRUeXBlKSk7XG5cbiAgICB3YXRjaGVyLm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgbG9nZ2VyLmVycm9yKGBHaXQgd2F0Y2hlciBlcnJvciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgIH0pO1xuXG4gICAgdGhpcy53YXRjaGVycy5zZXQoc2Vzc2lvbklkLCB3YXRjaGVySW5mbyk7XG5cbiAgICAvLyBHZXQgaW5pdGlhbCBzdGF0dXNcbiAgICB0aGlzLmNoZWNrQW5kQnJvYWRjYXN0U3RhdHVzKHdhdGNoZXJJbmZvKTtcblxuICAgIC8vIFN0YXJ0IHBlcmlvZGljIGNoZWNrIGV2ZXJ5IDIgc2Vjb25kcyB0byBjYXRjaCB3b3JraW5nIGRpcmVjdG9yeSBjaGFuZ2VzXG4gICAgLy8gVGhpcyBjb21wbGVtZW50cyB0aGUgZ2l0IGZpbGUgd2F0Y2hpbmcgYW5kIGVuc3VyZXMgd2UgZG9uJ3QgbWlzcyBjaGFuZ2VzXG4gICAgd2F0Y2hlckluZm8ucGVyaW9kaWNDaGVja1RpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgdGhpcy5jaGVja0FuZEJyb2FkY2FzdFN0YXR1cyh3YXRjaGVySW5mbyk7XG4gICAgfSwgMjAwMCk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgY2xpZW50IHRvIHJlY2VpdmUgZ2l0IHN0YXR1cyB1cGRhdGVzXG4gICAqL1xuICBhZGRDbGllbnQoc2Vzc2lvbklkOiBzdHJpbmcsIGNsaWVudDogUmVzcG9uc2UpOiB2b2lkIHtcbiAgICBjb25zdCB3YXRjaGVySW5mbyA9IHRoaXMud2F0Y2hlcnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCF3YXRjaGVySW5mbykge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBObyBnaXQgd2F0Y2hlciBmb3VuZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB3YXRjaGVySW5mby5jbGllbnRzLmFkZChjbGllbnQpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBBZGRlZCBTU0UgY2xpZW50IHRvIGdpdCB3YXRjaGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSAoJHt3YXRjaGVySW5mby5jbGllbnRzLnNpemV9IHRvdGFsKWBcbiAgICApO1xuXG4gICAgLy8gU2VuZCBjdXJyZW50IHN0YXR1cyB0byBuZXcgY2xpZW50XG4gICAgaWYgKHdhdGNoZXJJbmZvLmxhc3RTdGF0dXMpIHtcbiAgICAgIHRoaXMuc2VuZFN0YXR1c1VwZGF0ZShjbGllbnQsIHNlc3Npb25JZCwgd2F0Y2hlckluZm8ubGFzdFN0YXR1cyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhIGNsaWVudCBmcm9tIGdpdCBzdGF0dXMgdXBkYXRlc1xuICAgKi9cbiAgcmVtb3ZlQ2xpZW50KHNlc3Npb25JZDogc3RyaW5nLCBjbGllbnQ6IFJlc3BvbnNlKTogdm9pZCB7XG4gICAgY29uc3Qgd2F0Y2hlckluZm8gPSB0aGlzLndhdGNoZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghd2F0Y2hlckluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB3YXRjaGVySW5mby5jbGllbnRzLmRlbGV0ZShjbGllbnQpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBSZW1vdmVkIFNTRSBjbGllbnQgZnJvbSBnaXQgd2F0Y2hlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKCR7d2F0Y2hlckluZm8uY2xpZW50cy5zaXplfSByZW1haW5pbmcpYFxuICAgICk7XG5cbiAgICAvLyBJZiBubyBtb3JlIGNsaWVudHMsIHN0b3Agd2F0Y2hpbmdcbiAgICBpZiAod2F0Y2hlckluZm8uY2xpZW50cy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN0b3BXYXRjaGluZyhzZXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdG9wIHdhdGNoaW5nIGdpdCBkaXJlY3RvcnkgZm9yIGEgc2Vzc2lvblxuICAgKi9cbiAgc3RvcFdhdGNoaW5nKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgd2F0Y2hlckluZm8gPSB0aGlzLndhdGNoZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghd2F0Y2hlckluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsb2dnZXIuZGVidWcoYFN0b3BwaW5nIGdpdCB3YXRjaGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXG4gICAgLy8gQ2xlYXIgZGVib3VuY2UgdGltZXJcbiAgICBpZiAod2F0Y2hlckluZm8uZGVib3VuY2VUaW1lcikge1xuICAgICAgY2xlYXJUaW1lb3V0KHdhdGNoZXJJbmZvLmRlYm91bmNlVGltZXIpO1xuICAgIH1cblxuICAgIC8vIENsZWFyIHBlcmlvZGljIGNoZWNrIHRpbWVyXG4gICAgaWYgKHdhdGNoZXJJbmZvLnBlcmlvZGljQ2hlY2tUaW1lcikge1xuICAgICAgY2xlYXJJbnRlcnZhbCh3YXRjaGVySW5mby5wZXJpb2RpY0NoZWNrVGltZXIpO1xuICAgIH1cblxuICAgIC8vIENsb3NlIHdhdGNoZXJcbiAgICB3YXRjaGVySW5mby53YXRjaGVyLmNsb3NlKCk7XG5cbiAgICAvLyBSZW1vdmUgZnJvbSBtYXBcbiAgICB0aGlzLndhdGNoZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGdpdCBzdGF0dXMgYW5kIGJyb2FkY2FzdCBpZiBjaGFuZ2VkXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGNoZWNrQW5kQnJvYWRjYXN0U3RhdHVzKHdhdGNoZXJJbmZvOiBXYXRjaGVySW5mbyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzdGF0dXMgPSBhd2FpdCBnZXREZXRhaWxlZEdpdFN0YXR1cyh3YXRjaGVySW5mby53b3JraW5nRGlyKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgc3RhdHVzIGhhcyBjaGFuZ2VkXG4gICAgICBpZiAodGhpcy5oYXNTdGF0dXNDaGFuZ2VkKHdhdGNoZXJJbmZvLmxhc3RTdGF0dXMsIHN0YXR1cykpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBHaXQgc3RhdHVzIGNoYW5nZWQgZm9yIHNlc3Npb24gJHt3YXRjaGVySW5mby5zZXNzaW9uSWR9OmAsIHN0YXR1cyk7XG4gICAgICAgIHdhdGNoZXJJbmZvLmxhc3RTdGF0dXMgPSBzdGF0dXM7XG5cbiAgICAgICAgLy8gQnJvYWRjYXN0IHRvIGFsbCBjbGllbnRzXG4gICAgICAgIHRoaXMuYnJvYWRjYXN0U3RhdHVzVXBkYXRlKHdhdGNoZXJJbmZvLCBzdGF0dXMpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBnZXQgZ2l0IHN0YXR1cyBmb3Igc2Vzc2lvbiAke3dhdGNoZXJJbmZvLnNlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBnaXQgc3RhdHVzIGhhcyBjaGFuZ2VkXG4gICAqL1xuICBwcml2YXRlIGhhc1N0YXR1c0NoYW5nZWQoXG4gICAgb2xkU3RhdHVzOiBHaXRTdGF0dXNDb3VudHMgfCB1bmRlZmluZWQsXG4gICAgbmV3U3RhdHVzOiBHaXRTdGF0dXNDb3VudHNcbiAgKTogYm9vbGVhbiB7XG4gICAgaWYgKCFvbGRTdGF0dXMpIHJldHVybiB0cnVlO1xuXG4gICAgcmV0dXJuIChcbiAgICAgIG9sZFN0YXR1cy5tb2RpZmllZCAhPT0gbmV3U3RhdHVzLm1vZGlmaWVkIHx8XG4gICAgICBvbGRTdGF0dXMuYWRkZWQgIT09IG5ld1N0YXR1cy5hZGRlZCB8fFxuICAgICAgb2xkU3RhdHVzLnN0YWdlZCAhPT0gbmV3U3RhdHVzLnN0YWdlZCB8fFxuICAgICAgb2xkU3RhdHVzLmRlbGV0ZWQgIT09IG5ld1N0YXR1cy5kZWxldGVkIHx8XG4gICAgICBvbGRTdGF0dXMuYWhlYWQgIT09IG5ld1N0YXR1cy5haGVhZCB8fFxuICAgICAgb2xkU3RhdHVzLmJlaGluZCAhPT0gbmV3U3RhdHVzLmJlaGluZFxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogQnJvYWRjYXN0IHN0YXR1cyB1cGRhdGUgdG8gYWxsIGNsaWVudHNcbiAgICovXG4gIHByaXZhdGUgYnJvYWRjYXN0U3RhdHVzVXBkYXRlKHdhdGNoZXJJbmZvOiBXYXRjaGVySW5mbywgc3RhdHVzOiBHaXRTdGF0dXNDb3VudHMpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGNsaWVudCBvZiB3YXRjaGVySW5mby5jbGllbnRzKSB7XG4gICAgICB0aGlzLnNlbmRTdGF0dXNVcGRhdGUoY2xpZW50LCB3YXRjaGVySW5mby5zZXNzaW9uSWQsIHN0YXR1cyk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgc3RhdHVzIHVwZGF0ZSB0byBhIHNwZWNpZmljIGNsaWVudFxuICAgKi9cbiAgcHJpdmF0ZSBzZW5kU3RhdHVzVXBkYXRlKGNsaWVudDogUmVzcG9uc2UsIHNlc3Npb25JZDogc3RyaW5nLCBzdGF0dXM6IEdpdFN0YXR1c0NvdW50cyk6IHZvaWQge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBldmVudCA9IHtcbiAgICAgICAgdHlwZTogJ2dpdC1zdGF0dXMtdXBkYXRlJyxcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICBnaXRNb2RpZmllZENvdW50OiBzdGF0dXMubW9kaWZpZWQsXG4gICAgICAgIGdpdEFkZGVkQ291bnQ6IHN0YXR1cy5hZGRlZCxcbiAgICAgICAgZ2l0RGVsZXRlZENvdW50OiBzdGF0dXMuZGVsZXRlZCxcbiAgICAgICAgZ2l0QWhlYWRDb3VudDogc3RhdHVzLmFoZWFkLFxuICAgICAgICBnaXRCZWhpbmRDb3VudDogc3RhdHVzLmJlaGluZCxcbiAgICAgIH07XG5cbiAgICAgIGNsaWVudC53cml0ZShgZXZlbnQ6IHNlc3Npb24tdXBkYXRlXFxuZGF0YTogJHtKU09OLnN0cmluZ2lmeShldmVudCl9XFxuXFxuYCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHNlbmQgZ2l0IHN0YXR1cyB1cGRhdGUgdG8gY2xpZW50OmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xlYW4gdXAgYWxsIHdhdGNoZXJzXG4gICAqL1xuICBjbGVhbnVwKCk6IHZvaWQge1xuICAgIGxvZ2dlci5kZWJ1ZygnQ2xlYW5pbmcgdXAgYWxsIGdpdCB3YXRjaGVycycpO1xuICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZF0gb2YgdGhpcy53YXRjaGVycykge1xuICAgICAgdGhpcy5zdG9wV2F0Y2hpbmcoc2Vzc2lvbklkKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxuZXhwb3J0IGNvbnN0IGdpdFdhdGNoZXIgPSBuZXcgR2l0V2F0Y2hlcigpO1xuIl19