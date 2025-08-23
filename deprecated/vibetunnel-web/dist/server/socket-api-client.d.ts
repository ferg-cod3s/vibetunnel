/**
 * Socket API client for VibeTunnel control operations
 * Used by the vt command to communicate with the server via Unix socket
 */
import { type GitEventAck, type GitEventNotify, type GitFollowRequest, type GitFollowResponse } from './pty/socket-protocol.js';
export interface ServerStatus {
    running: boolean;
    port?: number;
    url?: string;
    followMode?: {
        enabled: boolean;
        branch?: string;
        repoPath?: string;
    };
}
/**
 * Client for control socket operations
 */
export declare class SocketApiClient {
    private readonly controlSocketPath;
    private readonly controlDir;
    constructor();
    /**
     * Check if the control socket exists
     */
    private isSocketAvailable;
    /**
     * Send a request and wait for response
     */
    private sendRequest;
    /**
     * Get server status
     */
    getStatus(): Promise<ServerStatus>;
    /**
     * Enable or disable Git follow mode
     */
    setFollowMode(request: GitFollowRequest): Promise<GitFollowResponse>;
    /**
     * Send Git event notification
     */
    sendGitEvent(event: GitEventNotify): Promise<GitEventAck>;
}
