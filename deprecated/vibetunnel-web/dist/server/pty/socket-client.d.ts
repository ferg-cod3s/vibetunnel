/**
 * Client for connecting to VibeTunnel Unix sockets
 */
import { EventEmitter } from 'events';
import { type MessagePayload, MessageType } from './socket-protocol.js';
export interface SocketClientEvents {
    connect: () => void;
    disconnect: (error?: Error) => void;
    error: (error: Error) => void;
}
/**
 * Unix socket client for communication between VibeTunnel web server and terminal processes.
 *
 * This class provides a robust client for connecting to Unix domain sockets with automatic
 * reconnection, heartbeat support, and message parsing using the VibeTunnel socket protocol.
 * It handles terminal control operations like stdin input, resizing, and process management.
 *
 * Key features:
 * - Automatic reconnection with configurable delay
 * - Heartbeat mechanism to detect connection health
 * - Binary message protocol with length-prefixed framing
 * - Event-based API for handling connection state and messages
 * - macOS socket path length validation (104 char limit)
 *
 * @example
 * ```typescript
 * // Create a client for a terminal session
 * const client = new VibeTunnelSocketClient('/tmp/vibetunnel/session-123.sock', {
 *   autoReconnect: true,
 *   heartbeatInterval: 30000
 * });
 *
 * // Listen for events
 * client.on('connect', () => console.log('Connected to terminal'));
 * client.on('status', (status) => console.log('Terminal status:', status));
 * client.on('error', (error) => console.error('Socket error:', error));
 *
 * // Connect and send commands
 * await client.connect();
 * client.sendStdin('ls -la\n');
 * client.resize(80, 24);
 * ```
 *
 * @extends EventEmitter
 */
export declare class VibeTunnelSocketClient extends EventEmitter {
    private readonly socketPath;
    private readonly options;
    private socket?;
    private parser;
    private connected;
    private reconnectTimer?;
    private readonly reconnectDelay;
    private heartbeatInterval?;
    private lastHeartbeat;
    constructor(socketPath: string, options?: {
        autoReconnect?: boolean;
        heartbeatInterval?: number;
    });
    /**
     * Connect to the socket
     */
    connect(): Promise<void>;
    /**
     * Setup socket event handlers
     */
    private setupSocketHandlers;
    /**
     * Handle incoming messages
     */
    private handleMessage;
    /**
     * Handle disconnection
     */
    private handleDisconnect;
    /**
     * Start heartbeat
     */
    private startHeartbeat;
    /**
     * Stop heartbeat
     */
    private stopHeartbeat;
    /**
     * Send data to stdin
     */
    sendStdin(data: string): boolean;
    /**
     * Send resize command
     */
    resize(cols: number, rows: number): boolean;
    /**
     * Send kill command
     */
    kill(signal?: string | number): boolean;
    /**
     * Send reset size command
     */
    resetSize(): boolean;
    /**
     * Send update title command
     */
    updateTitle(title: string): boolean;
    /**
     * Send status update
     */
    sendStatus(app: string, status: string, extra?: Record<string, unknown>): boolean;
    /**
     * Send a message with type-safe payload
     */
    sendMessage<T extends MessageType>(type: T, payload: MessagePayload<T>): boolean;
    /**
     * Send a message and wait for a response
     */
    sendMessageWithResponse<TRequest extends MessageType, TResponse extends MessageType>(requestType: TRequest, payload: MessagePayload<TRequest>, responseType: TResponse, timeout?: number): Promise<MessagePayload<TResponse>>;
    /**
     * Build a message buffer from type and payload
     */
    private buildMessage;
    /**
     * Send heartbeat
     */
    private sendHeartbeat;
    /**
     * Send raw message
     */
    private send;
    /**
     * Disconnect from the socket
     */
    disconnect(): void;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get time since last heartbeat
     */
    getTimeSinceLastHeartbeat(): number;
}
