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
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlUnixHandler = exports.ControlUnixHandler = void 0;
const child_process = __importStar(require("node:child_process"));
const fs = __importStar(require("node:fs"));
const net = __importStar(require("node:net"));
const path = __importStar(require("node:path"));
const uuid_1 = require("uuid");
const logger_js_1 = require("../utils/logger.js");
const control_protocol_js_1 = require("./control-protocol.js");
const logger = (0, logger_js_1.createLogger)('control-unix');
class TerminalHandler {
    async handleMessage(message) {
        logger.log(`Terminal handler: ${message.action}`);
        if (message.action === 'spawn') {
            const request = message.payload;
            try {
                // Build the command for launching terminal with VibeTunnel
                const args = ['launch'];
                if (request.workingDirectory) {
                    args.push('--working-directory', request.workingDirectory);
                }
                if (request.command) {
                    args.push('--command', request.command);
                }
                args.push('--session-id', request.sessionId);
                if (request.terminalPreference) {
                    args.push('--terminal', request.terminalPreference);
                }
                // Execute vibetunnel command
                logger.log(`Spawning terminal with args: ${args.join(' ')}`);
                // Use spawn to avoid shell injection
                const vt = child_process.spawn('vibetunnel', args, {
                    detached: true,
                    stdio: 'ignore',
                });
                vt.unref();
                const response = {
                    success: true,
                };
                return (0, control_protocol_js_1.createControlResponse)(message, response);
            }
            catch (error) {
                logger.error('Failed to spawn terminal:', error);
                return (0, control_protocol_js_1.createControlResponse)(message, null, error instanceof Error ? error.message : 'Failed to spawn terminal');
            }
        }
        return (0, control_protocol_js_1.createControlResponse)(message, null, `Unknown terminal action: ${message.action}`);
    }
}
class SystemHandler {
    async handleMessage(message) {
        logger.log(`System handler: ${message.action}, type: ${message.type}, id: ${message.id}`);
        switch (message.action) {
            case 'ping':
                // Already handled in handleMacMessage
                return null;
            case 'ready':
                // Event, no response needed
                return null;
            default:
                logger.warn(`Unknown system action: ${message.action}`);
                return (0, control_protocol_js_1.createControlResponse)(message, null, `Unknown action: ${message.action}`);
        }
    }
}
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
class ControlUnixHandler {
    constructor() {
        this.pendingRequests = new Map();
        this.macSocket = null;
        this.unixServer = null;
        this.handlers = new Map();
        this.messageBuffer = Buffer.alloc(0);
        // Use control directory from environment or default
        const home = process.env.HOME || '/tmp';
        const controlDir = process.env.VIBETUNNEL_CONTROL_DIR || path.join(home, '.vibetunnel');
        const socketDir = controlDir;
        // Ensure directory exists
        try {
            fs.mkdirSync(socketDir, { recursive: true });
        }
        catch (_e) {
            // Ignore if already exists
        }
        this.socketPath = path.join(socketDir, 'control.sock');
        // Initialize handlers
        this.handlers.set('terminal', new TerminalHandler());
        this.handlers.set('system', new SystemHandler());
    }
    async start() {
        logger.log('🚀 Starting control Unix socket handler');
        logger.log(`📂 Socket path: ${this.socketPath}`);
        // Clean up any existing socket file to prevent EADDRINUSE errors on restart.
        try {
            if (fs.existsSync(this.socketPath)) {
                fs.unlinkSync(this.socketPath);
                logger.log('🧹 Removed existing stale socket file.');
            }
            else {
                logger.log('✅ No existing socket file found');
            }
        }
        catch (error) {
            logger.warn('⚠️ Failed to remove stale socket file:', error);
        }
        // Create UNIX socket server
        this.unixServer = net.createServer((socket) => {
            this.handleMacConnection(socket);
        });
        // Start listening
        await new Promise((resolve, reject) => {
            this.unixServer?.listen(this.socketPath, () => {
                logger.log(`Control UNIX socket server listening at ${this.socketPath}`);
                // Set restrictive permissions - only owner can read/write
                fs.chmod(this.socketPath, 0o600, (err) => {
                    if (err) {
                        logger.error('Failed to set socket permissions:', err);
                    }
                    else {
                        logger.log('Socket permissions set to 0600 (owner read/write only)');
                    }
                });
                resolve();
            });
            this.unixServer?.on('error', (error) => {
                logger.error('UNIX socket server error:', error);
                reject(error);
            });
        });
    }
    stop() {
        if (this.macSocket) {
            this.macSocket.destroy();
            this.macSocket = null;
        }
        if (this.unixServer) {
            this.unixServer.close();
            this.unixServer = null;
        }
        // Clean up socket file
        try {
            fs.unlinkSync(this.socketPath);
        }
        catch (_error) {
            // Ignore
        }
    }
    isMacAppConnected() {
        return this.macSocket !== null && !this.macSocket.destroyed;
    }
    handleMacConnection(socket) {
        logger.log('🔌 New Mac connection via UNIX socket');
        logger.log(`🔍 Socket info: local=${socket.localAddress}, remote=${socket.remoteAddress}`);
        // Close any existing Mac connection
        if (this.macSocket) {
            logger.log('⚠️ Closing existing Mac connection');
            this.macSocket.destroy();
        }
        this.macSocket = socket;
        logger.log('✅ Mac socket stored');
        // Set socket options for better handling of large messages
        socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency
        logger.log('✅ Socket options set: NoDelay=true');
        // Increase the buffer size for receiving large messages
        const bufferSize = 1024 * 1024; // 1MB
        try {
            const socketWithState = socket;
            if (socketWithState._readableState) {
                socketWithState._readableState.highWaterMark = bufferSize;
                logger.log(`Set socket receive buffer to ${bufferSize} bytes`);
            }
        }
        catch (error) {
            logger.warn('Failed to set socket buffer size:', error);
        }
        socket.on('data', (data) => {
            // Append new data to our buffer
            this.messageBuffer = Buffer.concat([this.messageBuffer, data]);
            logger.log(`📥 Received from Mac: ${data.length} bytes, buffer size: ${this.messageBuffer.length}`);
            // Log first few bytes for debugging
            if (data.length > 0) {
                const preview = data.subarray(0, Math.min(data.length, 50));
                logger.debug(`📋 Data preview (first ${preview.length} bytes):`, preview.toString('hex'));
            }
            // Process as many messages as we can from the buffer
            while (true) {
                // A message needs at least 4 bytes for the length header
                if (this.messageBuffer.length < 4) {
                    break;
                }
                // Read the length of the message
                const messageLength = this.messageBuffer.readUInt32BE(0);
                // Validate message length
                if (messageLength <= 0) {
                    logger.error(`Invalid message length: ${messageLength}`);
                    // Clear the buffer to recover from this error
                    this.messageBuffer = Buffer.alloc(0);
                    break;
                }
                // Sanity check: messages shouldn't be larger than 10MB
                const maxMessageSize = 10 * 1024 * 1024; // 10MB
                if (messageLength > maxMessageSize) {
                    logger.error(`Message too large: ${messageLength} bytes (max: ${maxMessageSize})`);
                    // Clear the buffer to recover from this error
                    this.messageBuffer = Buffer.alloc(0);
                    break;
                }
                // Check if we have the full message in the buffer
                if (this.messageBuffer.length < 4 + messageLength) {
                    // Not enough data yet, wait for more
                    logger.debug(`Waiting for more data: have ${this.messageBuffer.length}, need ${4 + messageLength}`);
                    break;
                }
                // Extract the message data
                const messageData = this.messageBuffer.subarray(4, 4 + messageLength);
                // Remove the message (header + body) from the buffer
                this.messageBuffer = this.messageBuffer.subarray(4 + messageLength);
                try {
                    const messageStr = messageData.toString('utf-8');
                    logger.debug(`📨 Parsing message (${messageLength} bytes): ${messageStr.substring(0, 100)}...`);
                    const message = JSON.parse(messageStr);
                    logger.log(`✅ Parsed Mac message: category=${message.category}, action=${message.action}, id=${message.id}`);
                    this.handleMacMessage(message);
                }
                catch (error) {
                    logger.error('❌ Failed to parse Mac message:', error);
                    logger.error('Message length:', messageLength);
                    logger.error('Raw message buffer:', messageData.toString('utf-8'));
                }
            }
        });
        socket.on('error', (error) => {
            logger.error('❌ Mac socket error:', error);
            const errorObj = error;
            logger.error('Error details:', {
                code: errorObj.code,
                syscall: errorObj.syscall,
                errno: errorObj.errno,
                message: errorObj.message,
            });
            // Check if it's a write-related error
            if (errorObj.code === 'EPIPE' || errorObj.code === 'ECONNRESET') {
                logger.error('🔴 Connection broken - Mac app likely closed the connection');
            }
        });
        socket.on('close', (hadError) => {
            logger.log(`🔌 Mac disconnected (hadError: ${hadError})`);
            logger.log(`📊 Socket state: destroyed=${socket.destroyed}, readable=${socket.readable}, writable=${socket.writable}`);
            if (socket === this.macSocket) {
                this.macSocket = null;
                logger.log('🧹 Cleared Mac socket reference');
            }
        });
        // Handle drain event for backpressure
        socket.on('drain', () => {
            logger.log('Mac socket drained - ready for more data');
        });
        // Add event for socket end (clean close)
        socket.on('end', () => {
            logger.log('📴 Mac socket received FIN packet (clean close)');
        });
        // Send ready event to Mac
        logger.log('📤 Sending initial system:ready event to Mac');
        this.sendToMac((0, control_protocol_js_1.createControlEvent)('system', 'ready'));
        logger.log('✅ system:ready event sent');
    }
    handleBrowserConnection(ws, userId) {
        logger.log('🌐 New browser WebSocket connection for control messages');
        logger.log(`👤 User ID: ${userId || 'unknown'}`);
        logger.log(`🔌 Mac socket status on browser connect: ${this.macSocket ? 'CONNECTED' : 'NOT CONNECTED'}`);
        ws.on('message', async (data) => {
            try {
                const rawMessage = data.toString();
                logger.log(`📨 Browser message received (${rawMessage.length} chars): ${rawMessage.substring(0, 200)}...`);
                const message = JSON.parse(rawMessage);
                logger.log(`📥 Parsed browser message - type: ${message.type}, category: ${message.category}, action: ${message.action}`);
                // Handle browser -> Mac messages
                logger.warn(`⚠️ Browser sent message for category: ${message.category}`);
            }
            catch (error) {
                logger.error('❌ Failed to parse browser message:', error);
                ws.send(JSON.stringify((0, control_protocol_js_1.createControlEvent)('system', 'error', {
                    error: error instanceof Error ? error.message : String(error),
                })));
            }
        });
        ws.on('close', () => {
            logger.log('Browser disconnected');
        });
        ws.on('error', (error) => {
            logger.error('Browser WebSocket error:', error);
        });
    }
    async handleMacMessage(message) {
        logger.log(`Mac message - category: ${message.category}, action: ${message.action}, type: ${message.type}, id: ${message.id}`);
        // Handle ping keep-alive from Mac client
        if (message.category === 'system' && message.action === 'ping') {
            const pong = (0, control_protocol_js_1.createControlResponse)(message, { status: 'ok' });
            this.sendToMac(pong);
            return;
        }
        // Check if this is a response to a pending request
        if (message.type === 'response' && this.pendingRequests.has(message.id)) {
            const resolver = this.pendingRequests.get(message.id);
            if (resolver) {
                logger.debug(`Resolving pending request for id: ${message.id}`);
                this.pendingRequests.delete(message.id);
                resolver(message);
            }
            return;
        }
        // Skip processing for response messages that aren't pending requests
        // This prevents response loops where error responses get processed again
        if (message.type === 'response') {
            logger.debug(`Ignoring response message that has no pending request: ${message.id}, action: ${message.action}`);
            return;
        }
        const handler = this.handlers.get(message.category);
        if (!handler) {
            logger.warn(`No handler for category: ${message.category}`);
            if (message.type === 'request') {
                const response = (0, control_protocol_js_1.createControlResponse)(message, null, `Unknown category: ${message.category}`);
                this.sendToMac(response);
            }
            return;
        }
        try {
            const response = await handler.handleMessage(message);
            if (response) {
                this.sendToMac(response);
            }
        }
        catch (error) {
            logger.error(`Handler error for ${message.category}:${message.action}:`, error);
            if (message.type === 'request') {
                const response = (0, control_protocol_js_1.createControlResponse)(message, null, error instanceof Error ? error.message : 'Handler error');
                this.sendToMac(response);
            }
        }
    }
    async sendControlMessage(message) {
        // If Mac is not connected, return null immediately
        if (!this.isMacAppConnected()) {
            return null;
        }
        return new Promise((resolve) => {
            // Store the pending request
            this.pendingRequests.set(message.id, resolve);
            // Send the message
            this.sendToMac(message);
            // Set a timeout
            setTimeout(() => {
                if (this.pendingRequests.has(message.id)) {
                    this.pendingRequests.delete(message.id);
                    resolve(null);
                }
            }, 10000); // 10 second timeout
        });
    }
    /**
     * Send a notification to the Mac app via the Unix socket
     */
    sendNotification(title, body, options) {
        if (!this.macSocket) {
            logger.warn('[ControlUnixHandler] Cannot send notification - Mac app not connected');
            return;
        }
        const message = {
            id: (0, uuid_1.v4)(),
            type: 'event',
            category: 'notification',
            action: 'show',
            payload: {
                title,
                body,
                ...options,
            },
        };
        this.sendToMac(message);
        logger.info('[ControlUnixHandler] Sent notification:', { title, body, options });
    }
    sendToMac(message) {
        if (!this.macSocket) {
            logger.warn('⚠️ Cannot send to Mac - no socket connection');
            return;
        }
        if (this.macSocket.destroyed) {
            logger.warn('⚠️ Cannot send to Mac - socket is destroyed');
            this.macSocket = null;
            return;
        }
        try {
            // Convert message to JSON
            const jsonStr = JSON.stringify(message);
            const jsonData = Buffer.from(jsonStr, 'utf-8');
            // Create a buffer with 4-byte length header + JSON data
            const lengthBuffer = Buffer.allocUnsafe(4);
            lengthBuffer.writeUInt32BE(jsonData.length, 0);
            // Combine length header and data
            const fullData = Buffer.concat([lengthBuffer, jsonData]);
            // Log message details
            logger.log(`📤 Sending to Mac: ${message.category}:${message.action}, header: 4 bytes, payload: ${jsonData.length} bytes, total: ${fullData.length} bytes`);
            logger.log(`📋 Message ID being sent: ${message.id}`);
            logger.debug(`📝 Message content: ${jsonStr.substring(0, 200)}...`);
            // Log the actual bytes for the first few messages
            if (message.category === 'system' || message.action === 'get-initial-data') {
                logger.debug(`🔍 Length header bytes: ${lengthBuffer.toString('hex')}`);
                logger.debug(`🔍 First 50 bytes of full data: ${fullData.subarray(0, Math.min(50, fullData.length)).toString('hex')}`);
            }
            if (jsonData.length > 65536) {
                logger.warn(`⚠️ Large message to Mac: ${jsonData.length} bytes`);
            }
            // Write with error handling
            const result = this.macSocket.write(fullData, (error) => {
                if (error) {
                    logger.error('❌ Error writing to Mac socket:', error);
                    logger.error('Error details:', {
                        // biome-ignore lint/suspicious/noExplicitAny: error object has non-standard properties
                        code: error.code,
                        // biome-ignore lint/suspicious/noExplicitAny: error object has non-standard properties
                        syscall: error.syscall,
                        message: error.message,
                    });
                    // Close the connection on write error
                    this.macSocket?.destroy();
                    this.macSocket = null;
                }
                else {
                    logger.debug('✅ Write to Mac socket completed successfully');
                }
            });
            // Check if write was buffered (backpressure)
            if (!result) {
                logger.warn('⚠️ Socket write buffered - backpressure detected');
            }
            else {
                logger.debug('✅ Write immediate - no backpressure');
            }
        }
        catch (error) {
            logger.error('❌ Exception while sending to Mac:', error);
            this.macSocket?.destroy();
            this.macSocket = null;
        }
    }
}
exports.ControlUnixHandler = ControlUnixHandler;
exports.controlUnixHandler = new ControlUnixHandler();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbC11bml4LWhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3dlYnNvY2tldC9jb250cm9sLXVuaXgtaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxrRUFBb0Q7QUFDcEQsNENBQThCO0FBQzlCLDhDQUFnQztBQUNoQyxnREFBa0M7QUFDbEMsK0JBQW9DO0FBRXBDLGtEQUFrRDtBQU9sRCwrREFBa0Y7QUFFbEYsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGNBQWMsQ0FBQyxDQUFDO0FBTTVDLE1BQU0sZUFBZTtJQUNuQixLQUFLLENBQUMsYUFBYSxDQUFDLE9BQXVCO1FBQ3pDLE1BQU0sQ0FBQyxHQUFHLENBQUMscUJBQXFCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRWxELElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQztZQUMvQixNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBK0IsQ0FBQztZQUV4RCxJQUFJLENBQUM7Z0JBQ0gsMkRBQTJEO2dCQUMzRCxNQUFNLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUV4QixJQUFJLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO29CQUM3QixJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUM3RCxDQUFDO2dCQUVELElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQzFDLENBQUM7Z0JBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUU3QyxJQUFJ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QzFCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixDQUFDO3FCQUFNLENBQUM7b0JBQ04sTUFBTSxDQUFDLEtBQUssQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO2dCQUMvRCxDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7WUFFSCw2Q0FBNkM7WUFDN0MsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNaLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0RBQWtELENBQUMsQ0FBQztZQUNsRSxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxDQUFDLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO1lBQ3RELENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekQsSUFBSSxDQUFDLFNBQVMsRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztRQUN4QixDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBbGVELGdEQWtlQztBQUVZLFFBQUEsa0JBQWtCLEdBQUcsSUFBSSxrQkFBa0IsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2hpbGRfcHJvY2VzcyBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbm9kZTpuZXQnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgdHlwZSB7IFdlYlNvY2tldCB9IGZyb20gJ3dzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQgdHlwZSB7XG4gIENvbnRyb2xDYXRlZ29yeSxcbiAgQ29udHJvbE1lc3NhZ2UsXG4gIFRlcm1pbmFsU3Bhd25SZXF1ZXN0LFxuICBUZXJtaW5hbFNwYXduUmVzcG9uc2UsXG59IGZyb20gJy4vY29udHJvbC1wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb250cm9sRXZlbnQsIGNyZWF0ZUNvbnRyb2xSZXNwb25zZSB9IGZyb20gJy4vY29udHJvbC1wcm90b2NvbC5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignY29udHJvbC11bml4Jyk7XG5cbmludGVyZmFjZSBNZXNzYWdlSGFuZGxlciB7XG4gIGhhbmRsZU1lc3NhZ2UobWVzc2FnZTogQ29udHJvbE1lc3NhZ2UpOiBQcm9taXNlPENvbnRyb2xNZXNzYWdlIHwgbnVsbD47XG59XG5cbmNsYXNzIFRlcm1pbmFsSGFuZGxlciBpbXBsZW1lbnRzIE1lc3NhZ2VIYW5kbGVyIHtcbiAgYXN5bmMgaGFuZGxlTWVzc2FnZShtZXNzYWdlOiBDb250cm9sTWVzc2FnZSk6IFByb21pc2U8Q29udHJvbE1lc3NhZ2U+IHtcbiAgICBsb2dnZXIubG9nKGBUZXJtaW5hbCBoYW5kbGVyOiAke21lc3NhZ2UuYWN0aW9ufWApO1xuXG4gICAgaWYgKG1lc3NhZ2UuYWN0aW9uID09PSAnc3Bhd24nKSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gbWVzc2FnZS5wYXlsb2FkIGFzIFRlcm1pbmFsU3Bhd25SZXF1ZXN0O1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgY29tbWFuZCBmb3IgbGF1bmNoaW5nIHRlcm1pbmFsIHdpdGggVmliZVR1bm5lbFxuICAgICAgICBjb25zdCBhcmdzID0gWydsYXVuY2gnXTtcblxuICAgICAgICBpZiAocmVxdWVzdC53b3JraW5nRGlyZWN0b3J5KSB7XG4gICAgICAgICAgYXJncy5wdXNoKCctLXdvcmtpbmctZGlyZWN0b3J5JywgcmVxdWVzdC53b3JraW5nRGlyZWN0b3J5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXF1ZXN0LmNvbW1hbmQpIHtcbiAgICAgICAgICBhcmdzLnB1c2goJy0tY29tbWFuZCcsIHJlcXVlc3QuY29tbWFuZCk7XG4gICAgICAgIH1cblxuICAgICAgICBhcmdzLnB1c2goJy0tc2Vzc2lvbi1pZCcsIHJlcXVlc3Quc2Vzc2lvbklkKTtcblxuICAgICAgICBpZiAocmVxdWVzdC50ZXJtaW5hbFByZWZlcmVuY2UpIHtcbiAgICAgICAgICBhcmdzLnB1c2goJy0tdGVybWluYWwnLCByZXF1ZXN0LnRlcm1pbmFsUHJlZmVyZW5jZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeGVjdXRlIHZpYmV0dW5uZWwgY29tbWFuZFxuICAgICAgICBsb2dnZXIubG9nKGBTcGF3bmluZyB0ZXJtaW5hbCB3aXRoIGFyZ3M6ICR7YXJncy5qb2luKCcgJyl9YCk7XG5cbiAgICAgICAgLy8gVXNlIHNwYXduIHRvIGF2b2lkIHNoZWxsIGluamVjdGlvblxuICAgICAgICBjb25zdCB2dCA9IGNoaWxkX3Byb2Nlc3Muc3Bhd24oJ3ZpYmV0dW5uZWwnLCBhcmdzLCB7XG4gICAgICAgICAgZGV0YWNoZWQ6IHRydWUsXG4gICAgICAgICAgc3RkaW86ICdpZ25vcmUnLFxuICAgICAgICB9KTtcblxuICAgICAgICB2dC51bnJlZigpO1xuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlOiBUZXJtaW5hbFNwYXduUmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gY3JlYXRlQ29udHJvbFJlc3BvbnNlKG1lc3NhZ2UsIHJlc3BvbnNlKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHNwYXduIHRlcm1pbmFsOicsIGVycm9yKTtcbiAgICAgICAgcmV0dXJuIGNyZWF0ZUNvbnRyb2xSZXNwb25zZShcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnRmFpbGVkIHRvIHNwYXduIHRlcm1pbmFsJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjcmVhdGVDb250cm9sUmVzcG9uc2UobWVzc2FnZSwgbnVsbCwgYFVua25vd24gdGVybWluYWwgYWN0aW9uOiAke21lc3NhZ2UuYWN0aW9ufWApO1xuICB9XG59XG5cbmNsYXNzIFN5c3RlbUhhbmRsZXIgaW1wbGVtZW50cyBNZXNzYWdlSGFuZGxlciB7XG4gIGFzeW5jIGhhbmRsZU1lc3NhZ2UobWVzc2FnZTogQ29udHJvbE1lc3NhZ2UpOiBQcm9taXNlPENvbnRyb2xNZXNzYWdlIHwgbnVsbD4ge1xuICAgIGxvZ2dlci5sb2coYFN5c3RlbSBoYW5kbGVyOiAke21lc3NhZ2UuYWN0aW9ufSwgdHlwZTogJHttZXNzYWdlLnR5cGV9LCBpZDogJHttZXNzYWdlLmlkfWApO1xuXG4gICAgc3dpdGNoIChtZXNzYWdlLmFjdGlvbikge1xuICAgICAgY2FzZSAncGluZyc6XG4gICAgICAgIC8vIEFscmVhZHkgaGFuZGxlZCBpbiBoYW5kbGVNYWNNZXNzYWdlXG4gICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICBjYXNlICdyZWFkeSc6XG4gICAgICAgIC8vIEV2ZW50LCBubyByZXNwb25zZSBuZWVkZWRcbiAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxvZ2dlci53YXJuKGBVbmtub3duIHN5c3RlbSBhY3Rpb246ICR7bWVzc2FnZS5hY3Rpb259YCk7XG4gICAgICAgIHJldHVybiBjcmVhdGVDb250cm9sUmVzcG9uc2UobWVzc2FnZSwgbnVsbCwgYFVua25vd24gYWN0aW9uOiAke21lc3NhZ2UuYWN0aW9ufWApO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEhhbmRsZXMgVW5peCBkb21haW4gc29ja2V0IGNvbW11bmljYXRpb24gYmV0d2VlbiB0aGUgVmliZVR1bm5lbCB3ZWIgc2VydmVyIGFuZCBtYWNPUyBhcHAuXG4gKlxuICogVGhpcyBjbGFzcyBtYW5hZ2VzIGEgVW5peCBzb2NrZXQgc2VydmVyIHRoYXQgcHJvdmlkZXMgYmlkaXJlY3Rpb25hbCBjb21tdW5pY2F0aW9uXG4gKiBiZXR3ZWVuIHRoZSB3ZWIgc2VydmVyIGFuZCB0aGUgbmF0aXZlIG1hY09TIGFwcGxpY2F0aW9uLiBJdCBpbXBsZW1lbnRzIGEgbWVzc2FnZS1iYXNlZFxuICogcHJvdG9jb2wgd2l0aCBsZW5ndGgtcHJlZml4ZWQgZnJhbWluZyBmb3IgcmVsaWFibGUgbWVzc2FnZSBkZWxpdmVyeSBhbmQgc3VwcG9ydHNcbiAqIG11bHRpcGxlIG1lc3NhZ2UgY2F0ZWdvcmllcyBpbmNsdWRpbmcgdGVybWluYWwgY29udHJvbCBhbmQgc3lzdGVtIGV2ZW50cy5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAtIFVuaXggZG9tYWluIHNvY2tldCBzZXJ2ZXIgd2l0aCBhdXRvbWF0aWMgY2xlYW51cCBvbiByZXN0YXJ0XG4gKiAtIExlbmd0aC1wcmVmaXhlZCBiaW5hcnkgcHJvdG9jb2wgZm9yIG1lc3NhZ2UgZnJhbWluZ1xuICogLSBNZXNzYWdlIHJvdXRpbmcgYmFzZWQgb24gY2F0ZWdvcmllcyAodGVybWluYWwsIHN5c3RlbSlcbiAqIC0gUmVxdWVzdC9yZXNwb25zZSBwYXR0ZXJuIHdpdGggdGltZW91dCBzdXBwb3J0XG4gKiAtIFdlYlNvY2tldCBicmlkZ2UgZm9yIGJyb3dzZXIgY2xpZW50c1xuICogLSBBdXRvbWF0aWMgc29ja2V0IHBlcm1pc3Npb24gbWFuYWdlbWVudCAoMDYwMClcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogLy8gQ3JlYXRlIGFuZCBzdGFydCB0aGUgaGFuZGxlclxuICogY29uc3QgaGFuZGxlciA9IG5ldyBDb250cm9sVW5peEhhbmRsZXIoKTtcbiAqIGF3YWl0IGhhbmRsZXIuc3RhcnQoKTtcbiAqXG4gKiAvLyBDaGVjayBpZiBNYWMgYXBwIGlzIGNvbm5lY3RlZFxuICogaWYgKGhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICogICAvLyBTZW5kIGEgY29udHJvbCBtZXNzYWdlXG4gKiAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgaGFuZGxlci5zZW5kQ29udHJvbE1lc3NhZ2Uoe1xuICogICAgIGlkOiAnbXNnLTEyMycsXG4gKiAgICAgdHlwZTogJ3JlcXVlc3QnLFxuICogICAgIGNhdGVnb3J5OiAndGVybWluYWwnLFxuICogICAgIGFjdGlvbjogJ3NwYXduJyxcbiAqICAgICBwYXlsb2FkOiB7XG4gKiAgICAgICBzZXNzaW9uSWQ6ICdzZXNzaW9uLTQ1NicsXG4gKiAgICAgICB3b3JraW5nRGlyZWN0b3J5OiAnL1VzZXJzL2FsaWNlJyxcbiAqICAgICAgIGNvbW1hbmQ6ICd2aW0nXG4gKiAgICAgfVxuICogICB9KTtcbiAqIH1cbiAqXG4gKiAvLyBIYW5kbGUgYnJvd3NlciBXZWJTb2NrZXQgY29ubmVjdGlvbnNcbiAqIHdzLm9uKCdjb25uZWN0aW9uJywgKHNvY2tldCkgPT4ge1xuICogICBoYW5kbGVyLmhhbmRsZUJyb3dzZXJDb25uZWN0aW9uKHNvY2tldCwgdXNlcklkKTtcbiAqIH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBDb250cm9sVW5peEhhbmRsZXIge1xuICBwcml2YXRlIHBlbmRpbmdSZXF1ZXN0cyA9IG5ldyBNYXA8c3RyaW5nLCAocmVzcG9uc2U6IENvbnRyb2xNZXNzYWdlKSA9PiB2b2lkPigpO1xuICBwcml2YXRlIG1hY1NvY2tldDogbmV0LlNvY2tldCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHVuaXhTZXJ2ZXI6IG5ldC5TZXJ2ZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSByZWFkb25seSBzb2NrZXRQYXRoOiBzdHJpbmc7XG4gIHByaXZhdGUgaGFuZGxlcnMgPSBuZXcgTWFwPENvbnRyb2xDYXRlZ29yeSwgTWVzc2FnZUhhbmRsZXI+KCk7XG4gIHByaXZhdGUgbWVzc2FnZUJ1ZmZlciA9IEJ1ZmZlci5hbGxvYygwKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICAvLyBVc2UgY29udHJvbCBkaXJlY3RvcnkgZnJvbSBlbnZpcm9ubWVudCBvciBkZWZhdWx0XG4gICAgY29uc3QgaG9tZSA9IHByb2Nlc3MuZW52LkhPTUUgfHwgJy90bXAnO1xuICAgIGNvbnN0IGNvbnRyb2xEaXIgPSBwcm9jZXNzLmVudi5WSUJFVFVOTkVMX0NPTlRST0xfRElSIHx8IHBhdGguam9pbihob21lLCAnLnZpYmV0dW5uZWwnKTtcbiAgICBjb25zdCBzb2NrZXREaXIgPSBjb250cm9sRGlyO1xuXG4gICAgLy8gRW5zdXJlIGRpcmVjdG9yeSBleGlzdHNcbiAgICB0cnkge1xuICAgICAgZnMubWtkaXJTeW5jKHNvY2tldERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfSBjYXRjaCAoX2UpIHtcbiAgICAgIC8vIElnbm9yZSBpZiBhbHJlYWR5IGV4aXN0c1xuICAgIH1cblxuICAgIHRoaXMuc29ja2V0UGF0aCA9IHBhdGguam9pbihzb2NrZXREaXIsICdjb250cm9sLnNvY2snKTtcblxuICAgIC8vIEluaXRpYWxpemUgaGFuZGxlcnNcbiAgICB0aGlzLmhhbmRsZXJzLnNldCgndGVybWluYWwnLCBuZXcgVGVybWluYWxIYW5kbGVyKCkpO1xuICAgIHRoaXMuaGFuZGxlcnMuc2V0KCdzeXN0ZW0nLCBuZXcgU3lzdGVtSGFuZGxlcigpKTtcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxvZ2dlci5sb2coJ/CfmoAgU3RhcnRpbmcgY29udHJvbCBVbml4IHNvY2tldCBoYW5kbGVyJyk7XG4gICAgbG9nZ2VyLmxvZyhg8J+TgiBTb2NrZXQgcGF0aDogJHt0aGlzLnNvY2tldFBhdGh9YCk7XG5cbiAgICAvLyBDbGVhbiB1cCBhbnkgZXhpc3Rpbmcgc29ja2V0IGZpbGUgdG8gcHJldmVudCBFQUREUklOVVNFIGVycm9ycyBvbiByZXN0YXJ0LlxuICAgIHRyeSB7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyh0aGlzLnNvY2tldFBhdGgpKSB7XG4gICAgICAgIGZzLnVubGlua1N5bmModGhpcy5zb2NrZXRQYXRoKTtcbiAgICAgICAgbG9nZ2VyLmxvZygn8J+nuSBSZW1vdmVkIGV4aXN0aW5nIHN0YWxlIHNvY2tldCBmaWxlLicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmxvZygn4pyFIE5vIGV4aXN0aW5nIHNvY2tldCBmaWxlIGZvdW5kJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci53YXJuKCfimqDvuI8gRmFpbGVkIHRvIHJlbW92ZSBzdGFsZSBzb2NrZXQgZmlsZTonLCBlcnJvcik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIFVOSVggc29ja2V0IHNlcnZlclxuICAgIHRoaXMudW5peFNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoKHNvY2tldCkgPT4ge1xuICAgICAgdGhpcy5oYW5kbGVNYWNDb25uZWN0aW9uKHNvY2tldCk7XG4gICAgfSk7XG5cbiAgICAvLyBTdGFydCBsaXN0ZW5pbmdcbiAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLnVuaXhTZXJ2ZXI/Lmxpc3Rlbih0aGlzLnNvY2tldFBhdGgsICgpID0+IHtcbiAgICAgICAgbG9nZ2VyLmxvZyhgQ29udHJvbCBVTklYIHNvY2tldCBzZXJ2ZXIgbGlzdGVuaW5nIGF0ICR7dGhpcy5zb2NrZXRQYXRofWApO1xuXG4gICAgICAgIC8vIFNldCByZXN0cmljdGl2ZSBwZXJtaXNzaW9ucyAtIG9ubHkgb3duZXIgY2FuIHJlYWQvd3JpdGVcbiAgICAgICAgZnMuY2htb2QodGhpcy5zb2NrZXRQYXRoLCAwbzYwMCwgKGVycikgPT4ge1xuICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHNldCBzb2NrZXQgcGVybWlzc2lvbnM6JywgZXJyKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9nZ2VyLmxvZygnU29ja2V0IHBlcm1pc3Npb25zIHNldCB0byAwNjAwIChvd25lciByZWFkL3dyaXRlIG9ubHkpJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXNvbHZlKCk7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy51bml4U2VydmVyPy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdVTklYIHNvY2tldCBzZXJ2ZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBzdG9wKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1hY1NvY2tldCkge1xuICAgICAgdGhpcy5tYWNTb2NrZXQuZGVzdHJveSgpO1xuICAgICAgdGhpcy5tYWNTb2NrZXQgPSBudWxsO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnVuaXhTZXJ2ZXIpIHtcbiAgICAgIHRoaXMudW5peFNlcnZlci5jbG9zZSgpO1xuICAgICAgdGhpcy51bml4U2VydmVyID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDbGVhbiB1cCBzb2NrZXQgZmlsZVxuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKHRoaXMuc29ja2V0UGF0aCk7XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAvLyBJZ25vcmVcbiAgICB9XG4gIH1cblxuICBpc01hY0FwcENvbm5lY3RlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5tYWNTb2NrZXQgIT09IG51bGwgJiYgIXRoaXMubWFjU29ja2V0LmRlc3Ryb3llZDtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlTWFjQ29ubmVjdGlvbihzb2NrZXQ6IG5ldC5Tb2NrZXQpIHtcbiAgICBsb2dnZXIubG9nKCfwn5SMIE5ldyBNYWMgY29ubmVjdGlvbiB2aWEgVU5JWCBzb2NrZXQnKTtcbiAgICBsb2dnZXIubG9nKGDwn5SNIFNvY2tldCBpbmZvOiBsb2NhbD0ke3NvY2tldC5sb2NhbEFkZHJlc3N9LCByZW1vdGU9JHtzb2NrZXQucmVtb3RlQWRkcmVzc31gKTtcblxuICAgIC8vIENsb3NlIGFueSBleGlzdGluZyBNYWMgY29ubmVjdGlvblxuICAgIGlmICh0aGlzLm1hY1NvY2tldCkge1xuICAgICAgbG9nZ2VyLmxvZygn4pqg77iPIENsb3NpbmcgZXhpc3RpbmcgTWFjIGNvbm5lY3Rpb24nKTtcbiAgICAgIHRoaXMubWFjU29ja2V0LmRlc3Ryb3koKTtcbiAgICB9XG5cbiAgICB0aGlzLm1hY1NvY2tldCA9IHNvY2tldDtcbiAgICBsb2dnZXIubG9nKCfinIUgTWFjIHNvY2tldCBzdG9yZWQnKTtcblxuICAgIC8vIFNldCBzb2NrZXQgb3B0aW9ucyBmb3IgYmV0dGVyIGhhbmRsaW5nIG9mIGxhcmdlIG1lc3NhZ2VzXG4gICAgc29ja2V0LnNldE5vRGVsYXkodHJ1ZSk7IC8vIERpc2FibGUgTmFnbGUncyBhbGdvcml0aG0gZm9yIGxvd2VyIGxhdGVuY3lcbiAgICBsb2dnZXIubG9nKCfinIUgU29ja2V0IG9wdGlvbnMgc2V0OiBOb0RlbGF5PXRydWUnKTtcblxuICAgIC8vIEluY3JlYXNlIHRoZSBidWZmZXIgc2l6ZSBmb3IgcmVjZWl2aW5nIGxhcmdlIG1lc3NhZ2VzXG4gICAgY29uc3QgYnVmZmVyU2l6ZSA9IDEwMjQgKiAxMDI0OyAvLyAxTUJcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc29ja2V0V2l0aFN0YXRlID0gc29ja2V0IGFzIG5ldC5Tb2NrZXQgJiB7XG4gICAgICAgIF9yZWFkYWJsZVN0YXRlPzogeyBoaWdoV2F0ZXJNYXJrOiBudW1iZXIgfTtcbiAgICAgIH07XG4gICAgICBpZiAoc29ja2V0V2l0aFN0YXRlLl9yZWFkYWJsZVN0YXRlKSB7XG4gICAgICAgIHNvY2tldFdpdGhTdGF0ZS5fcmVhZGFibGVTdGF0ZS5oaWdoV2F0ZXJNYXJrID0gYnVmZmVyU2l6ZTtcbiAgICAgICAgbG9nZ2VyLmxvZyhgU2V0IHNvY2tldCByZWNlaXZlIGJ1ZmZlciB0byAke2J1ZmZlclNpemV9IGJ5dGVzYCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdGYWlsZWQgdG8gc2V0IHNvY2tldCBidWZmZXIgc2l6ZTonLCBlcnJvcik7XG4gICAgfVxuXG4gICAgc29ja2V0Lm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgIC8vIEFwcGVuZCBuZXcgZGF0YSB0byBvdXIgYnVmZmVyXG4gICAgICB0aGlzLm1lc3NhZ2VCdWZmZXIgPSBCdWZmZXIuY29uY2F0KFt0aGlzLm1lc3NhZ2VCdWZmZXIsIGRhdGFdKTtcblxuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgYPCfk6UgUmVjZWl2ZWQgZnJvbSBNYWM6ICR7ZGF0YS5sZW5ndGh9IGJ5dGVzLCBidWZmZXIgc2l6ZTogJHt0aGlzLm1lc3NhZ2VCdWZmZXIubGVuZ3RofWBcbiAgICAgICk7XG5cbiAgICAgIC8vIExvZyBmaXJzdCBmZXcgYnl0ZXMgZm9yIGRlYnVnZ2luZ1xuICAgICAgaWYgKGRhdGEubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBwcmV2aWV3ID0gZGF0YS5zdWJhcnJheSgwLCBNYXRoLm1pbihkYXRhLmxlbmd0aCwgNTApKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGDwn5OLIERhdGEgcHJldmlldyAoZmlyc3QgJHtwcmV2aWV3Lmxlbmd0aH0gYnl0ZXMpOmAsIHByZXZpZXcudG9TdHJpbmcoJ2hleCcpKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyBhcyBtYW55IG1lc3NhZ2VzIGFzIHdlIGNhbiBmcm9tIHRoZSBidWZmZXJcbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIC8vIEEgbWVzc2FnZSBuZWVkcyBhdCBsZWFzdCA0IGJ5dGVzIGZvciB0aGUgbGVuZ3RoIGhlYWRlclxuICAgICAgICBpZiAodGhpcy5tZXNzYWdlQnVmZmVyLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlYWQgdGhlIGxlbmd0aCBvZiB0aGUgbWVzc2FnZVxuICAgICAgICBjb25zdCBtZXNzYWdlTGVuZ3RoID0gdGhpcy5tZXNzYWdlQnVmZmVyLnJlYWRVSW50MzJCRSgwKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBtZXNzYWdlIGxlbmd0aFxuICAgICAgICBpZiAobWVzc2FnZUxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKGBJbnZhbGlkIG1lc3NhZ2UgbGVuZ3RoOiAke21lc3NhZ2VMZW5ndGh9YCk7XG4gICAgICAgICAgLy8gQ2xlYXIgdGhlIGJ1ZmZlciB0byByZWNvdmVyIGZyb20gdGhpcyBlcnJvclxuICAgICAgICAgIHRoaXMubWVzc2FnZUJ1ZmZlciA9IEJ1ZmZlci5hbGxvYygwKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNhbml0eSBjaGVjazogbWVzc2FnZXMgc2hvdWxkbid0IGJlIGxhcmdlciB0aGFuIDEwTUJcbiAgICAgICAgY29uc3QgbWF4TWVzc2FnZVNpemUgPSAxMCAqIDEwMjQgKiAxMDI0OyAvLyAxME1CXG4gICAgICAgIGlmIChtZXNzYWdlTGVuZ3RoID4gbWF4TWVzc2FnZVNpemUpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoYE1lc3NhZ2UgdG9vIGxhcmdlOiAke21lc3NhZ2VMZW5ndGh9IGJ5dGVzIChtYXg6ICR7bWF4TWVzc2FnZVNpemV9KWApO1xuICAgICAgICAgIC8vIENsZWFyIHRoZSBidWZmZXIgdG8gcmVjb3ZlciBmcm9tIHRoaXMgZXJyb3JcbiAgICAgICAgICB0aGlzLm1lc3NhZ2VCdWZmZXIgPSBCdWZmZXIuYWxsb2MoMCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIHRoZSBmdWxsIG1lc3NhZ2UgaW4gdGhlIGJ1ZmZlclxuICAgICAgICBpZiAodGhpcy5tZXNzYWdlQnVmZmVyLmxlbmd0aCA8IDQgKyBtZXNzYWdlTGVuZ3RoKSB7XG4gICAgICAgICAgLy8gTm90IGVub3VnaCBkYXRhIHlldCwgd2FpdCBmb3IgbW9yZVxuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGBXYWl0aW5nIGZvciBtb3JlIGRhdGE6IGhhdmUgJHt0aGlzLm1lc3NhZ2VCdWZmZXIubGVuZ3RofSwgbmVlZCAkezQgKyBtZXNzYWdlTGVuZ3RofWBcbiAgICAgICAgICApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRXh0cmFjdCB0aGUgbWVzc2FnZSBkYXRhXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VEYXRhID0gdGhpcy5tZXNzYWdlQnVmZmVyLnN1YmFycmF5KDQsIDQgKyBtZXNzYWdlTGVuZ3RoKTtcblxuICAgICAgICAvLyBSZW1vdmUgdGhlIG1lc3NhZ2UgKGhlYWRlciArIGJvZHkpIGZyb20gdGhlIGJ1ZmZlclxuICAgICAgICB0aGlzLm1lc3NhZ2VCdWZmZXIgPSB0aGlzLm1lc3NhZ2VCdWZmZXIuc3ViYXJyYXkoNCArIG1lc3NhZ2VMZW5ndGgpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZVN0ciA9IG1lc3NhZ2VEYXRhLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGDwn5OoIFBhcnNpbmcgbWVzc2FnZSAoJHttZXNzYWdlTGVuZ3RofSBieXRlcyk6ICR7bWVzc2FnZVN0ci5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IENvbnRyb2xNZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlU3RyKTtcbiAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgYOKchSBQYXJzZWQgTWFjIG1lc3NhZ2U6IGNhdGVnb3J5PSR7bWVzc2FnZS5jYXRlZ29yeX0sIGFjdGlvbj0ke21lc3NhZ2UuYWN0aW9ufSwgaWQ9JHttZXNzYWdlLmlkfWBcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgdGhpcy5oYW5kbGVNYWNNZXNzYWdlKG1lc3NhZ2UpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byBwYXJzZSBNYWMgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdNZXNzYWdlIGxlbmd0aDonLCBtZXNzYWdlTGVuZ3RoKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1JhdyBtZXNzYWdlIGJ1ZmZlcjonLCBtZXNzYWdlRGF0YS50b1N0cmluZygndXRmLTgnKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHNvY2tldC5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcign4p2MIE1hYyBzb2NrZXQgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgY29uc3QgZXJyb3JPYmogPSBlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGRldGFpbHM6Jywge1xuICAgICAgICBjb2RlOiBlcnJvck9iai5jb2RlLFxuICAgICAgICBzeXNjYWxsOiBlcnJvck9iai5zeXNjYWxsLFxuICAgICAgICBlcnJubzogZXJyb3JPYmouZXJybm8sXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yT2JqLm1lc3NhZ2UsXG4gICAgICB9KTtcblxuICAgICAgLy8gQ2hlY2sgaWYgaXQncyBhIHdyaXRlLXJlbGF0ZWQgZXJyb3JcbiAgICAgIGlmIChlcnJvck9iai5jb2RlID09PSAnRVBJUEUnIHx8IGVycm9yT2JqLmNvZGUgPT09ICdFQ09OTlJFU0VUJykge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ/CflLQgQ29ubmVjdGlvbiBicm9rZW4gLSBNYWMgYXBwIGxpa2VseSBjbG9zZWQgdGhlIGNvbm5lY3Rpb24nKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHNvY2tldC5vbignY2xvc2UnLCAoaGFkRXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5sb2coYPCflIwgTWFjIGRpc2Nvbm5lY3RlZCAoaGFkRXJyb3I6ICR7aGFkRXJyb3J9KWApO1xuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgYPCfk4ogU29ja2V0IHN0YXRlOiBkZXN0cm95ZWQ9JHtzb2NrZXQuZGVzdHJveWVkfSwgcmVhZGFibGU9JHtzb2NrZXQucmVhZGFibGV9LCB3cml0YWJsZT0ke3NvY2tldC53cml0YWJsZX1gXG4gICAgICApO1xuXG4gICAgICBpZiAoc29ja2V0ID09PSB0aGlzLm1hY1NvY2tldCkge1xuICAgICAgICB0aGlzLm1hY1NvY2tldCA9IG51bGw7XG4gICAgICAgIGxvZ2dlci5sb2coJ/Cfp7kgQ2xlYXJlZCBNYWMgc29ja2V0IHJlZmVyZW5jZScpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIGRyYWluIGV2ZW50IGZvciBiYWNrcHJlc3N1cmVcbiAgICBzb2NrZXQub24oJ2RyYWluJywgKCkgPT4ge1xuICAgICAgbG9nZ2VyLmxvZygnTWFjIHNvY2tldCBkcmFpbmVkIC0gcmVhZHkgZm9yIG1vcmUgZGF0YScpO1xuICAgIH0pO1xuXG4gICAgLy8gQWRkIGV2ZW50IGZvciBzb2NrZXQgZW5kIChjbGVhbiBjbG9zZSlcbiAgICBzb2NrZXQub24oJ2VuZCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5sb2coJ/Cfk7QgTWFjIHNvY2tldCByZWNlaXZlZCBGSU4gcGFja2V0IChjbGVhbiBjbG9zZSknKTtcbiAgICB9KTtcblxuICAgIC8vIFNlbmQgcmVhZHkgZXZlbnQgdG8gTWFjXG4gICAgbG9nZ2VyLmxvZygn8J+TpCBTZW5kaW5nIGluaXRpYWwgc3lzdGVtOnJlYWR5IGV2ZW50IHRvIE1hYycpO1xuICAgIHRoaXMuc2VuZFRvTWFjKGNyZWF0ZUNvbnRyb2xFdmVudCgnc3lzdGVtJywgJ3JlYWR5JykpO1xuICAgIGxvZ2dlci5sb2coJ+KchSBzeXN0ZW06cmVhZHkgZXZlbnQgc2VudCcpO1xuICB9XG5cbiAgaGFuZGxlQnJvd3NlckNvbm5lY3Rpb24od3M6IFdlYlNvY2tldCwgdXNlcklkPzogc3RyaW5nKSB7XG4gICAgbG9nZ2VyLmxvZygn8J+MkCBOZXcgYnJvd3NlciBXZWJTb2NrZXQgY29ubmVjdGlvbiBmb3IgY29udHJvbCBtZXNzYWdlcycpO1xuICAgIGxvZ2dlci5sb2coYPCfkaQgVXNlciBJRDogJHt1c2VySWQgfHwgJ3Vua25vd24nfWApO1xuICAgIGxvZ2dlci5sb2coXG4gICAgICBg8J+UjCBNYWMgc29ja2V0IHN0YXR1cyBvbiBicm93c2VyIGNvbm5lY3Q6ICR7dGhpcy5tYWNTb2NrZXQgPyAnQ09OTkVDVEVEJyA6ICdOT1QgQ09OTkVDVEVEJ31gXG4gICAgKTtcblxuICAgIHdzLm9uKCdtZXNzYWdlJywgYXN5bmMgKGRhdGEpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJhd01lc3NhZ2UgPSBkYXRhLnRvU3RyaW5nKCk7XG4gICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgYPCfk6ggQnJvd3NlciBtZXNzYWdlIHJlY2VpdmVkICgke3Jhd01lc3NhZ2UubGVuZ3RofSBjaGFycyk6ICR7cmF3TWVzc2FnZS5zdWJzdHJpbmcoMCwgMjAwKX0uLi5gXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2U6IENvbnRyb2xNZXNzYWdlID0gSlNPTi5wYXJzZShyYXdNZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBg8J+TpSBQYXJzZWQgYnJvd3NlciBtZXNzYWdlIC0gdHlwZTogJHttZXNzYWdlLnR5cGV9LCBjYXRlZ29yeTogJHttZXNzYWdlLmNhdGVnb3J5fSwgYWN0aW9uOiAke21lc3NhZ2UuYWN0aW9ufWBcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBIYW5kbGUgYnJvd3NlciAtPiBNYWMgbWVzc2FnZXNcbiAgICAgICAgbG9nZ2VyLndhcm4oYOKaoO+4jyBCcm93c2VyIHNlbnQgbWVzc2FnZSBmb3IgY2F0ZWdvcnk6ICR7bWVzc2FnZS5jYXRlZ29yeX1gKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byBwYXJzZSBicm93c2VyIG1lc3NhZ2U6JywgZXJyb3IpO1xuICAgICAgICB3cy5zZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KFxuICAgICAgICAgICAgY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnZXJyb3InLCB7XG4gICAgICAgICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHdzLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGxvZ2dlci5sb2coJ0Jyb3dzZXIgZGlzY29ubmVjdGVkJyk7XG4gICAgfSk7XG5cbiAgICB3cy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcignQnJvd3NlciBXZWJTb2NrZXQgZXJyb3I6JywgZXJyb3IpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNYWNNZXNzYWdlKG1lc3NhZ2U6IENvbnRyb2xNZXNzYWdlKSB7XG4gICAgbG9nZ2VyLmxvZyhcbiAgICAgIGBNYWMgbWVzc2FnZSAtIGNhdGVnb3J5OiAke21lc3NhZ2UuY2F0ZWdvcnl9LCBhY3Rpb246ICR7bWVzc2FnZS5hY3Rpb259LCB0eXBlOiAke21lc3NhZ2UudHlwZX0sIGlkOiAke21lc3NhZ2UuaWR9YFxuICAgICk7XG5cbiAgICAvLyBIYW5kbGUgcGluZyBrZWVwLWFsaXZlIGZyb20gTWFjIGNsaWVudFxuICAgIGlmIChtZXNzYWdlLmNhdGVnb3J5ID09PSAnc3lzdGVtJyAmJiBtZXNzYWdlLmFjdGlvbiA9PT0gJ3BpbmcnKSB7XG4gICAgICBjb25zdCBwb25nID0gY3JlYXRlQ29udHJvbFJlc3BvbnNlKG1lc3NhZ2UsIHsgc3RhdHVzOiAnb2snIH0pO1xuICAgICAgdGhpcy5zZW5kVG9NYWMocG9uZyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHJlc3BvbnNlIHRvIGEgcGVuZGluZyByZXF1ZXN0XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ3Jlc3BvbnNlJyAmJiB0aGlzLnBlbmRpbmdSZXF1ZXN0cy5oYXMobWVzc2FnZS5pZCkpIHtcbiAgICAgIGNvbnN0IHJlc29sdmVyID0gdGhpcy5wZW5kaW5nUmVxdWVzdHMuZ2V0KG1lc3NhZ2UuaWQpO1xuICAgICAgaWYgKHJlc29sdmVyKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgUmVzb2x2aW5nIHBlbmRpbmcgcmVxdWVzdCBmb3IgaWQ6ICR7bWVzc2FnZS5pZH1gKTtcbiAgICAgICAgdGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKG1lc3NhZ2UuaWQpO1xuICAgICAgICByZXNvbHZlcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTa2lwIHByb2Nlc3NpbmcgZm9yIHJlc3BvbnNlIG1lc3NhZ2VzIHRoYXQgYXJlbid0IHBlbmRpbmcgcmVxdWVzdHNcbiAgICAvLyBUaGlzIHByZXZlbnRzIHJlc3BvbnNlIGxvb3BzIHdoZXJlIGVycm9yIHJlc3BvbnNlcyBnZXQgcHJvY2Vzc2VkIGFnYWluXG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ3Jlc3BvbnNlJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgSWdub3JpbmcgcmVzcG9uc2UgbWVzc2FnZSB0aGF0IGhhcyBubyBwZW5kaW5nIHJlcXVlc3Q6ICR7bWVzc2FnZS5pZH0sIGFjdGlvbjogJHttZXNzYWdlLmFjdGlvbn1gXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGhhbmRsZXIgPSB0aGlzLmhhbmRsZXJzLmdldChtZXNzYWdlLmNhdGVnb3J5KTtcbiAgICBpZiAoIWhhbmRsZXIpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBObyBoYW5kbGVyIGZvciBjYXRlZ29yeTogJHttZXNzYWdlLmNhdGVnb3J5fWApO1xuICAgICAgaWYgKG1lc3NhZ2UudHlwZSA9PT0gJ3JlcXVlc3QnKSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlQ29udHJvbFJlc3BvbnNlKFxuICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBgVW5rbm93biBjYXRlZ29yeTogJHttZXNzYWdlLmNhdGVnb3J5fWBcbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5zZW5kVG9NYWMocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGhhbmRsZXIuaGFuZGxlTWVzc2FnZShtZXNzYWdlKTtcbiAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICB0aGlzLnNlbmRUb01hYyhyZXNwb25zZSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgSGFuZGxlciBlcnJvciBmb3IgJHttZXNzYWdlLmNhdGVnb3J5fToke21lc3NhZ2UuYWN0aW9ufTpgLCBlcnJvcik7XG4gICAgICBpZiAobWVzc2FnZS50eXBlID09PSAncmVxdWVzdCcpIHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBjcmVhdGVDb250cm9sUmVzcG9uc2UoXG4gICAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ0hhbmRsZXIgZXJyb3InXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuc2VuZFRvTWFjKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzZW5kQ29udHJvbE1lc3NhZ2UobWVzc2FnZTogQ29udHJvbE1lc3NhZ2UpOiBQcm9taXNlPENvbnRyb2xNZXNzYWdlIHwgbnVsbD4ge1xuICAgIC8vIElmIE1hYyBpcyBub3QgY29ubmVjdGVkLCByZXR1cm4gbnVsbCBpbW1lZGlhdGVseVxuICAgIGlmICghdGhpcy5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIC8vIFN0b3JlIHRoZSBwZW5kaW5nIHJlcXVlc3RcbiAgICAgIHRoaXMucGVuZGluZ1JlcXVlc3RzLnNldChtZXNzYWdlLmlkLCByZXNvbHZlKTtcblxuICAgICAgLy8gU2VuZCB0aGUgbWVzc2FnZVxuICAgICAgdGhpcy5zZW5kVG9NYWMobWVzc2FnZSk7XG5cbiAgICAgIC8vIFNldCBhIHRpbWVvdXRcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5wZW5kaW5nUmVxdWVzdHMuaGFzKG1lc3NhZ2UuaWQpKSB7XG4gICAgICAgICAgdGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKG1lc3NhZ2UuaWQpO1xuICAgICAgICAgIHJlc29sdmUobnVsbCk7XG4gICAgICAgIH1cbiAgICAgIH0sIDEwMDAwKTsgLy8gMTAgc2Vjb25kIHRpbWVvdXRcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgbm90aWZpY2F0aW9uIHRvIHRoZSBNYWMgYXBwIHZpYSB0aGUgVW5peCBzb2NrZXRcbiAgICovXG4gIHNlbmROb3RpZmljYXRpb24oXG4gICAgdGl0bGU6IHN0cmluZyxcbiAgICBib2R5OiBzdHJpbmcsXG4gICAgb3B0aW9ucz86IHtcbiAgICAgIHR5cGU/OiAnc2Vzc2lvbi1zdGFydCcgfCAnc2Vzc2lvbi1leGl0JyB8ICd5b3VyLXR1cm4nO1xuICAgICAgc2Vzc2lvbklkPzogc3RyaW5nO1xuICAgICAgc2Vzc2lvbk5hbWU/OiBzdHJpbmc7XG4gICAgfVxuICApOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMubWFjU29ja2V0KSB7XG4gICAgICBsb2dnZXIud2FybignW0NvbnRyb2xVbml4SGFuZGxlcl0gQ2Fubm90IHNlbmQgbm90aWZpY2F0aW9uIC0gTWFjIGFwcCBub3QgY29ubmVjdGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgbWVzc2FnZTogQ29udHJvbE1lc3NhZ2UgPSB7XG4gICAgICBpZDogdXVpZHY0KCksXG4gICAgICB0eXBlOiAnZXZlbnQnLFxuICAgICAgY2F0ZWdvcnk6ICdub3RpZmljYXRpb24nLFxuICAgICAgYWN0aW9uOiAnc2hvdycsXG4gICAgICBwYXlsb2FkOiB7XG4gICAgICAgIHRpdGxlLFxuICAgICAgICBib2R5LFxuICAgICAgICAuLi5vcHRpb25zLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgdGhpcy5zZW5kVG9NYWMobWVzc2FnZSk7XG4gICAgbG9nZ2VyLmluZm8oJ1tDb250cm9sVW5peEhhbmRsZXJdIFNlbnQgbm90aWZpY2F0aW9uOicsIHsgdGl0bGUsIGJvZHksIG9wdGlvbnMgfSk7XG4gIH1cblxuICBzZW5kVG9NYWMobWVzc2FnZTogQ29udHJvbE1lc3NhZ2UpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMubWFjU29ja2V0KSB7XG4gICAgICBsb2dnZXIud2Fybign4pqg77iPIENhbm5vdCBzZW5kIHRvIE1hYyAtIG5vIHNvY2tldCBjb25uZWN0aW9uJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMubWFjU29ja2V0LmRlc3Ryb3llZCkge1xuICAgICAgbG9nZ2VyLndhcm4oJ+KaoO+4jyBDYW5ub3Qgc2VuZCB0byBNYWMgLSBzb2NrZXQgaXMgZGVzdHJveWVkJyk7XG4gICAgICB0aGlzLm1hY1NvY2tldCA9IG51bGw7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIENvbnZlcnQgbWVzc2FnZSB0byBKU09OXG4gICAgICBjb25zdCBqc29uU3RyID0gSlNPTi5zdHJpbmdpZnkobWVzc2FnZSk7XG4gICAgICBjb25zdCBqc29uRGF0YSA9IEJ1ZmZlci5mcm9tKGpzb25TdHIsICd1dGYtOCcpO1xuXG4gICAgICAvLyBDcmVhdGUgYSBidWZmZXIgd2l0aCA0LWJ5dGUgbGVuZ3RoIGhlYWRlciArIEpTT04gZGF0YVxuICAgICAgY29uc3QgbGVuZ3RoQnVmZmVyID0gQnVmZmVyLmFsbG9jVW5zYWZlKDQpO1xuICAgICAgbGVuZ3RoQnVmZmVyLndyaXRlVUludDMyQkUoanNvbkRhdGEubGVuZ3RoLCAwKTtcblxuICAgICAgLy8gQ29tYmluZSBsZW5ndGggaGVhZGVyIGFuZCBkYXRhXG4gICAgICBjb25zdCBmdWxsRGF0YSA9IEJ1ZmZlci5jb25jYXQoW2xlbmd0aEJ1ZmZlciwganNvbkRhdGFdKTtcblxuICAgICAgLy8gTG9nIG1lc3NhZ2UgZGV0YWlsc1xuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgYPCfk6QgU2VuZGluZyB0byBNYWM6ICR7bWVzc2FnZS5jYXRlZ29yeX06JHttZXNzYWdlLmFjdGlvbn0sIGhlYWRlcjogNCBieXRlcywgcGF5bG9hZDogJHtqc29uRGF0YS5sZW5ndGh9IGJ5dGVzLCB0b3RhbDogJHtmdWxsRGF0YS5sZW5ndGh9IGJ5dGVzYFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci5sb2coYPCfk4sgTWVzc2FnZSBJRCBiZWluZyBzZW50OiAke21lc3NhZ2UuaWR9YCk7XG4gICAgICBsb2dnZXIuZGVidWcoYPCfk50gTWVzc2FnZSBjb250ZW50OiAke2pzb25TdHIuc3Vic3RyaW5nKDAsIDIwMCl9Li4uYCk7XG5cbiAgICAgIC8vIExvZyB0aGUgYWN0dWFsIGJ5dGVzIGZvciB0aGUgZmlyc3QgZmV3IG1lc3NhZ2VzXG4gICAgICBpZiAobWVzc2FnZS5jYXRlZ29yeSA9PT0gJ3N5c3RlbScgfHwgbWVzc2FnZS5hY3Rpb24gPT09ICdnZXQtaW5pdGlhbC1kYXRhJykge1xuICAgICAgICBsb2dnZXIuZGVidWcoYPCflI0gTGVuZ3RoIGhlYWRlciBieXRlczogJHtsZW5ndGhCdWZmZXIudG9TdHJpbmcoJ2hleCcpfWApO1xuICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgYPCflI0gRmlyc3QgNTAgYnl0ZXMgb2YgZnVsbCBkYXRhOiAke2Z1bGxEYXRhLnN1YmFycmF5KDAsIE1hdGgubWluKDUwLCBmdWxsRGF0YS5sZW5ndGgpKS50b1N0cmluZygnaGV4Jyl9YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBpZiAoanNvbkRhdGEubGVuZ3RoID4gNjU1MzYpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYOKaoO+4jyBMYXJnZSBtZXNzYWdlIHRvIE1hYzogJHtqc29uRGF0YS5sZW5ndGh9IGJ5dGVzYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFdyaXRlIHdpdGggZXJyb3IgaGFuZGxpbmdcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMubWFjU29ja2V0LndyaXRlKGZ1bGxEYXRhLCAoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCfinYwgRXJyb3Igd3JpdGluZyB0byBNYWMgc29ja2V0OicsIGVycm9yKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGRldGFpbHM6Jywge1xuICAgICAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0V4cGxpY2l0QW55OiBlcnJvciBvYmplY3QgaGFzIG5vbi1zdGFuZGFyZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICBjb2RlOiAoZXJyb3IgYXMgYW55KS5jb2RlLFxuICAgICAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0V4cGxpY2l0QW55OiBlcnJvciBvYmplY3QgaGFzIG5vbi1zdGFuZGFyZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICBzeXNjYWxsOiAoZXJyb3IgYXMgYW55KS5zeXNjYWxsLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICAvLyBDbG9zZSB0aGUgY29ubmVjdGlvbiBvbiB3cml0ZSBlcnJvclxuICAgICAgICAgIHRoaXMubWFjU29ja2V0Py5kZXN0cm95KCk7XG4gICAgICAgICAgdGhpcy5tYWNTb2NrZXQgPSBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIFdyaXRlIHRvIE1hYyBzb2NrZXQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gQ2hlY2sgaWYgd3JpdGUgd2FzIGJ1ZmZlcmVkIChiYWNrcHJlc3N1cmUpXG4gICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBsb2dnZXIud2Fybign4pqg77iPIFNvY2tldCB3cml0ZSBidWZmZXJlZCAtIGJhY2twcmVzc3VyZSBkZXRlY3RlZCcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCfinIUgV3JpdGUgaW1tZWRpYXRlIC0gbm8gYmFja3ByZXNzdXJlJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcign4p2MIEV4Y2VwdGlvbiB3aGlsZSBzZW5kaW5nIHRvIE1hYzonLCBlcnJvcik7XG4gICAgICB0aGlzLm1hY1NvY2tldD8uZGVzdHJveSgpO1xuICAgICAgdGhpcy5tYWNTb2NrZXQgPSBudWxsO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY29uc3QgY29udHJvbFVuaXhIYW5kbGVyID0gbmV3IENvbnRyb2xVbml4SGFuZGxlcigpO1xuIl19