/**
 * API Socket Server for VibeTunnel control operations
 * Provides a Unix socket interface for CLI commands (vt) to communicate with the server
 */
/**
 * API Socket Server that handles CLI commands via Unix socket
 */
export declare class ApiSocketServer {
    private server;
    private readonly socketPath;
    private serverPort?;
    private serverUrl?;
    constructor();
    /**
     * Set server info for status queries
     */
    setServerInfo(port: number, url: string): void;
    /**
     * Start the API socket server
     */
    start(): Promise<void>;
    /**
     * Stop the API socket server
     */
    stop(): void;
    /**
     * Handle incoming socket connections
     */
    private handleConnection;
    /**
     * Handle incoming messages
     */
    private handleMessage;
    /**
     * Handle status request
     */
    private handleStatusRequest;
    /**
     * Handle Git follow mode request
     */
    private handleGitFollowRequest;
    /**
     * Handle Git event notification
     */
    private handleGitEventNotify;
    /**
     * Send error response
     */
    private sendError;
}
export declare const apiSocketServer: ApiSocketServer;
