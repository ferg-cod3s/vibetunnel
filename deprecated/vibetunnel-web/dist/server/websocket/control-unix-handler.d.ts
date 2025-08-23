import type { WebSocket } from 'ws';
import type { ControlMessage } from './control-protocol.js';
/**
 * Handles Unix domain socket communication between the VibeTunnel web server and macOS app.
 *
 * This class manages a Unix socket server that provides bidirectional communication
 * between the web server and the native macOS application. It implements a message-based
 * protocol with length-prefixed framing for reliable message delivery and supports
 * multiple message categories including terminal control and system events.
 *
 * Key features:
 * - Unix domain socket server with automatic cleanup on restart
 * - Length-prefixed binary protocol for message framing
 * - Message routing based on categories (terminal, system)
 * - Request/response pattern with timeout support
 * - WebSocket bridge for browser clients
 * - Automatic socket permission management (0600)
 *
 * @example
 * ```typescript
 * // Create and start the handler
 * const handler = new ControlUnixHandler();
 * await handler.start();
 *
 * // Check if Mac app is connected
 * if (handler.isMacAppConnected()) {
 *   // Send a control message
 *   const response = await handler.sendControlMessage({
 *     id: 'msg-123',
 *     type: 'request',
 *     category: 'terminal',
 *     action: 'spawn',
 *     payload: {
 *       sessionId: 'session-456',
 *       workingDirectory: '/Users/alice',
 *       command: 'vim'
 *     }
 *   });
 * }
 *
 * // Handle browser WebSocket connections
 * ws.on('connection', (socket) => {
 *   handler.handleBrowserConnection(socket, userId);
 * });
 * ```
 */
export declare class ControlUnixHandler {
    private pendingRequests;
    private macSocket;
    private unixServer;
    private readonly socketPath;
    private handlers;
    private messageBuffer;
    constructor();
    start(): Promise<void>;
    stop(): void;
    isMacAppConnected(): boolean;
    private handleMacConnection;
    handleBrowserConnection(ws: WebSocket, userId?: string): void;
    private handleMacMessage;
    sendControlMessage(message: ControlMessage): Promise<ControlMessage | null>;
    /**
     * Send a notification to the Mac app via the Unix socket
     */
    sendNotification(title: string, body: string, options?: {
        type?: 'session-start' | 'session-exit' | 'your-turn';
        sessionId?: string;
        sessionName?: string;
    }): void;
    sendToMac(message: ControlMessage): void;
}
export declare const controlUnixHandler: ControlUnixHandler;
