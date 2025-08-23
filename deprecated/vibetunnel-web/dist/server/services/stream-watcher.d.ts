import type { Response } from 'express';
import type { SessionManager } from '../pty/session-manager.js';
export declare class StreamWatcher {
    private activeWatchers;
    private sessionManager;
    constructor(sessionManager: SessionManager);
    /**
     * Process a clear sequence event and update tracking variables
     */
    private processClearSequence;
    /**
     * Parse a line of asciinema data and return the parsed event
     */
    private parseAsciinemaLine;
    /**
     * Send an event to the client with proper formatting
     */
    private sendEventToClient;
    /**
     * Add a client to watch a stream file
     */
    addClient(sessionId: string, streamPath: string, response: Response): void;
    /**
     * Remove a client
     */
    removeClient(sessionId: string, response: Response): void;
    /**
     * Send existing content to a client
     */
    private sendExistingContent;
    /**
     * Start watching a file for changes
     */
    private startWatching;
    /**
     * Broadcast a line to all clients
     */
    private broadcastLine;
    /**
     * Start git watching for a session if it's in a git repository
     */
    private startGitWatching;
    /**
     * Clean up all watchers and listeners
     */
    private cleanup;
}
