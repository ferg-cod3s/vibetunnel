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
import type { Response } from 'express';
export declare class GitWatcher {
    private watchers;
    /**
     * Start watching git repository for a session
     */
    startWatching(sessionId: string, workingDir: string, gitRepoPath: string): void;
    /**
     * Add a client to receive git status updates
     */
    addClient(sessionId: string, client: Response): void;
    /**
     * Remove a client from git status updates
     */
    removeClient(sessionId: string, client: Response): void;
    /**
     * Stop watching git directory for a session
     */
    stopWatching(sessionId: string): void;
    /**
     * Check git status and broadcast if changed
     */
    private checkAndBroadcastStatus;
    /**
     * Check if git status has changed
     */
    private hasStatusChanged;
    /**
     * Broadcast status update to all clients
     */
    private broadcastStatusUpdate;
    /**
     * Send status update to a specific client
     */
    private sendStatusUpdate;
    /**
     * Clean up all watchers
     */
    cleanup(): void;
}
export declare const gitWatcher: GitWatcher;
