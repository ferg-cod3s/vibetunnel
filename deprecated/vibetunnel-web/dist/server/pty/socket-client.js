"use strict";
/**
 * Client for connecting to VibeTunnel Unix sockets
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
exports.VibeTunnelSocketClient = void 0;
const events_1 = require("events");
const net = __importStar(require("net"));
const logger_js_1 = require("../utils/logger.js");
const socket_protocol_js_1 = require("./socket-protocol.js");
const logger = (0, logger_js_1.createLogger)('socket-client');
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
class VibeTunnelSocketClient extends events_1.EventEmitter {
    constructor(socketPath, options = {}) {
        super();
        this.socketPath = socketPath;
        this.options = options;
        this.parser = new socket_protocol_js_1.MessageParser();
        this.connected = false;
        this.reconnectDelay = 1000;
        this.lastHeartbeat = Date.now();
        // IMPORTANT: macOS has a 104 character limit for Unix socket paths
        // If you get EINVAL errors when connecting, the path is likely too long
        if (socketPath.length > 103) {
            logger.warn(`Socket path may be too long (${socketPath.length} chars): ${socketPath}`);
        }
    }
    /**
     * Connect to the socket
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected) {
                resolve();
                return;
            }
            this.socket = net.createConnection(this.socketPath);
            this.socket.setNoDelay(true);
            this.socket.setKeepAlive(true, 0);
            const onConnect = () => {
                this.connected = true;
                this.setupSocketHandlers();
                this.emit('connect');
                this.startHeartbeat();
                cleanup();
                resolve();
            };
            const onError = (error) => {
                cleanup();
                // Destroy the socket to prevent further errors
                this.socket?.destroy();
                this.socket = undefined;
                reject(error);
            };
            const cleanup = () => {
                this.socket?.off('connect', onConnect);
                this.socket?.off('error', onError);
            };
            this.socket.once('connect', onConnect);
            this.socket.once('error', onError);
        });
    }
    /**
     * Setup socket event handlers
     */
    setupSocketHandlers() {
        if (!this.socket)
            return;
        this.socket.on('data', (chunk) => {
            this.parser.addData(chunk);
            for (const { type, payload } of this.parser.parseMessages()) {
                this.handleMessage(type, payload);
            }
        });
        this.socket.on('close', () => {
            this.handleDisconnect();
        });
        this.socket.on('error', (error) => {
            logger.error(`Socket error on ${this.socketPath}:`, error);
            this.emit('error', error);
        });
    }
    /**
     * Handle incoming messages
     */
    handleMessage(type, payload) {
        try {
            const data = (0, socket_protocol_js_1.parsePayload)(type, payload);
            // Emit event with message type enum name
            this.emit(socket_protocol_js_1.MessageType[type], data);
            // Handle heartbeat
            if (type === socket_protocol_js_1.MessageType.HEARTBEAT) {
                this.lastHeartbeat = Date.now();
                // Echo heartbeat back
                this.sendHeartbeat();
            }
        }
        catch (error) {
            logger.error('Failed to parse message:', error);
        }
    }
    /**
     * Handle disconnection
     */
    handleDisconnect(error) {
        this.connected = false;
        this.stopHeartbeat();
        this.emit('disconnect', error);
        if (this.options.autoReconnect && !this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = undefined;
                this.connect().catch((err) => {
                    logger.debug(`Reconnection failed: ${err.message}`);
                    this.handleDisconnect(err);
                });
            }, this.reconnectDelay);
        }
    }
    /**
     * Start heartbeat
     */
    startHeartbeat() {
        if (this.options.heartbeatInterval) {
            this.heartbeatInterval = setInterval(() => {
                this.sendHeartbeat();
            }, this.options.heartbeatInterval);
        }
    }
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
    }
    /**
     * Send data to stdin
     */
    sendStdin(data) {
        return this.send(socket_protocol_js_1.MessageBuilder.stdin(data));
    }
    /**
     * Send resize command
     */
    resize(cols, rows) {
        return this.send(socket_protocol_js_1.MessageBuilder.resize(cols, rows));
    }
    /**
     * Send kill command
     */
    kill(signal) {
        return this.send(socket_protocol_js_1.MessageBuilder.kill(signal));
    }
    /**
     * Send reset size command
     */
    resetSize() {
        return this.send(socket_protocol_js_1.MessageBuilder.resetSize());
    }
    /**
     * Send update title command
     */
    updateTitle(title) {
        return this.send(socket_protocol_js_1.MessageBuilder.updateTitle(title));
    }
    /**
     * Send status update
     */
    sendStatus(app, status, extra) {
        return this.send(socket_protocol_js_1.MessageBuilder.status(app, status, extra));
    }
    /**
     * Send a message with type-safe payload
     */
    sendMessage(type, payload) {
        const message = this.buildMessage(type, payload);
        return this.send(message);
    }
    /**
     * Send a message and wait for a response
     */
    async sendMessageWithResponse(requestType, payload, responseType, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(socket_protocol_js_1.MessageType[responseType], handleResponse);
                this.off('error', handleError);
                reject(new Error(`Request timeout waiting for ${socket_protocol_js_1.MessageType[responseType]}`));
            }, timeout);
            const handleResponse = (data) => {
                clearTimeout(timer);
                this.off('error', handleError);
                resolve(data);
            };
            const handleError = (error) => {
                clearTimeout(timer);
                this.off(socket_protocol_js_1.MessageType[responseType], handleResponse);
                if ('message' in error) {
                    reject(new Error(error.message));
                }
                else {
                    reject(error);
                }
            };
            // Listen for response
            this.once(socket_protocol_js_1.MessageType[responseType], handleResponse);
            this.once('error', handleError);
            const sent = this.sendMessage(requestType, payload);
            if (!sent) {
                clearTimeout(timer);
                this.off(socket_protocol_js_1.MessageType[responseType], handleResponse);
                this.off('error', handleError);
                reject(new Error('Failed to send message'));
            }
        });
    }
    /**
     * Build a message buffer from type and payload
     */
    buildMessage(type, payload) {
        switch (type) {
            case socket_protocol_js_1.MessageType.STDIN_DATA:
                return socket_protocol_js_1.MessageBuilder.stdin(payload);
            case socket_protocol_js_1.MessageType.CONTROL_CMD: {
                const cmd = payload;
                switch (cmd.cmd) {
                    case 'resize':
                        return socket_protocol_js_1.MessageBuilder.resize(cmd.cols, cmd.rows);
                    case 'kill':
                        return socket_protocol_js_1.MessageBuilder.kill(cmd.signal);
                    case 'reset-size':
                        return socket_protocol_js_1.MessageBuilder.resetSize();
                    case 'update-title':
                        return socket_protocol_js_1.MessageBuilder.updateTitle(cmd.title);
                    default:
                        // For generic control commands, use frameMessage directly
                        return (0, socket_protocol_js_1.frameMessage)(socket_protocol_js_1.MessageType.CONTROL_CMD, cmd);
                }
            }
            case socket_protocol_js_1.MessageType.STATUS_UPDATE: {
                const statusPayload = payload;
                return socket_protocol_js_1.MessageBuilder.status(statusPayload.app, statusPayload.status, statusPayload.extra);
            }
            case socket_protocol_js_1.MessageType.HEARTBEAT:
                return socket_protocol_js_1.MessageBuilder.heartbeat();
            case socket_protocol_js_1.MessageType.STATUS_REQUEST:
                return socket_protocol_js_1.MessageBuilder.statusRequest();
            case socket_protocol_js_1.MessageType.GIT_FOLLOW_REQUEST:
                return socket_protocol_js_1.MessageBuilder.gitFollowRequest(payload);
            case socket_protocol_js_1.MessageType.GIT_EVENT_NOTIFY:
                return socket_protocol_js_1.MessageBuilder.gitEventNotify(payload);
            default:
                throw new Error(`Unsupported message type: ${type}`);
        }
    }
    /**
     * Send heartbeat
     */
    sendHeartbeat() {
        return this.send(socket_protocol_js_1.MessageBuilder.heartbeat());
    }
    /**
     * Send raw message
     */
    send(message) {
        if (!this.connected || !this.socket) {
            logger.debug('Cannot send message: not connected');
            return false;
        }
        try {
            return this.socket.write(message);
        }
        catch (error) {
            logger.error('Failed to send message:', error);
            return false;
        }
    }
    /**
     * Disconnect from the socket
     */
    disconnect() {
        this.options.autoReconnect = false;
        this.connected = false;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
        }
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Get time since last heartbeat
     */
    getTimeSinceLastHeartbeat() {
        return Date.now() - this.lastHeartbeat;
    }
}
exports.VibeTunnelSocketClient = VibeTunnelSocketClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29ja2V0LWNsaWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcHR5L3NvY2tldC1jbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOztHQUVHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxtQ0FBc0M7QUFDdEMseUNBQTJCO0FBQzNCLGtEQUFrRDtBQUNsRCw2REFlOEI7QUFFOUIsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGVBQWUsQ0FBQyxDQUFDO0FBVTdDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBa0NHO0FBQ0gsTUFBYSxzQkFBdUIsU0FBUSxxQkFBWTtJQVN0RCxZQUNtQixVQUFrQixFQUNsQixVQUdiLEVBQUU7UUFFTixLQUFLLEVBQUUsQ0FBQztRQU5TLGVBQVUsR0FBVixVQUFVLENBQVE7UUFDbEIsWUFBTyxHQUFQLE9BQU8sQ0FHbEI7UUFaQSxXQUFNLEdBQUcsSUFBSSxrQ0FBYSxFQUFFLENBQUM7UUFDN0IsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUVULG1CQUFjLEdBQUcsSUFBSSxDQUFDO1FBRS9CLGtCQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBV2pDLG1FQUFtRTtRQUNuRSx3RUFBd0U7UUFDeEUsSUFBSSxVQUFVLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQzVCLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLFVBQVUsQ0FBQyxNQUFNLFlBQVksVUFBVSxFQUFFLENBQUMsQ0FBQztRQUN6RixDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsT0FBTztRQUNMLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDckMsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ25CLE9BQU8sRUFBRSxDQUFDO2dCQUNWLE9B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QUMsY0FBYyxDQUFDLENBQUM7WUFDbEMsSUFBSSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7UUFDbEMsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxTQUFTLENBQUM7UUFDMUIsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILFdBQVc7UUFDVCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDeEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gseUJBQXlCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDekMsQ0FBQztDQUNGO0FBM1ZELHdEQTJWQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ2xpZW50IGZvciBjb25uZWN0aW5nIHRvIFZpYmVUdW5uZWwgVW5peCBzb2NrZXRzXG4gKi9cblxuaW1wb3J0IHsgRXZlbnRFbWl0dGVyIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7XG4gIHR5cGUgQ29udHJvbENvbW1hbmQsXG4gIHR5cGUgRXJyb3JNZXNzYWdlLFxuICBmcmFtZU1lc3NhZ2UsXG4gIHR5cGUgR2l0RXZlbnROb3RpZnksXG4gIHR5cGUgR2l0Rm9sbG93UmVxdWVzdCxcbiAgdHlwZSBLaWxsQ29tbWFuZCxcbiAgTWVzc2FnZUJ1aWxkZXIsXG4gIE1lc3NhZ2VQYXJzZXIsXG4gIHR5cGUgTWVzc2FnZVBheWxvYWQsXG4gIE1lc3NhZ2VUeXBlLFxuICBwYXJzZVBheWxvYWQsXG4gIHR5cGUgUmVzaXplQ29tbWFuZCxcbiAgdHlwZSBTdGF0dXNVcGRhdGUsXG4gIHR5cGUgVXBkYXRlVGl0bGVDb21tYW5kLFxufSBmcm9tICcuL3NvY2tldC1wcm90b2NvbC5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignc29ja2V0LWNsaWVudCcpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNvY2tldENsaWVudEV2ZW50cyB7XG4gIGNvbm5lY3Q6ICgpID0+IHZvaWQ7XG4gIGRpc2Nvbm5lY3Q6IChlcnJvcj86IEVycm9yKSA9PiB2b2lkO1xuICBlcnJvcjogKGVycm9yOiBFcnJvcikgPT4gdm9pZDtcbiAgLy8gTWVzc2FnZS1zcGVjaWZpYyBldmVudHMgYXJlIGVtaXR0ZWQgdXNpbmcgTWVzc2FnZVR5cGUgZW51bSBuYW1lc1xuICAvLyBlLmcuLCAnU1RBVFVTX1VQREFURScsICdFUlJPUicsICdIRUFSVEJFQVQnLCBldGMuXG59XG5cbi8qKlxuICogVW5peCBzb2NrZXQgY2xpZW50IGZvciBjb21tdW5pY2F0aW9uIGJldHdlZW4gVmliZVR1bm5lbCB3ZWIgc2VydmVyIGFuZCB0ZXJtaW5hbCBwcm9jZXNzZXMuXG4gKlxuICogVGhpcyBjbGFzcyBwcm92aWRlcyBhIHJvYnVzdCBjbGllbnQgZm9yIGNvbm5lY3RpbmcgdG8gVW5peCBkb21haW4gc29ja2V0cyB3aXRoIGF1dG9tYXRpY1xuICogcmVjb25uZWN0aW9uLCBoZWFydGJlYXQgc3VwcG9ydCwgYW5kIG1lc3NhZ2UgcGFyc2luZyB1c2luZyB0aGUgVmliZVR1bm5lbCBzb2NrZXQgcHJvdG9jb2wuXG4gKiBJdCBoYW5kbGVzIHRlcm1pbmFsIGNvbnRyb2wgb3BlcmF0aW9ucyBsaWtlIHN0ZGluIGlucHV0LCByZXNpemluZywgYW5kIHByb2Nlc3MgbWFuYWdlbWVudC5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAtIEF1dG9tYXRpYyByZWNvbm5lY3Rpb24gd2l0aCBjb25maWd1cmFibGUgZGVsYXlcbiAqIC0gSGVhcnRiZWF0IG1lY2hhbmlzbSB0byBkZXRlY3QgY29ubmVjdGlvbiBoZWFsdGhcbiAqIC0gQmluYXJ5IG1lc3NhZ2UgcHJvdG9jb2wgd2l0aCBsZW5ndGgtcHJlZml4ZWQgZnJhbWluZ1xuICogLSBFdmVudC1iYXNlZCBBUEkgZm9yIGhhbmRsaW5nIGNvbm5lY3Rpb24gc3RhdGUgYW5kIG1lc3NhZ2VzXG4gKiAtIG1hY09TIHNvY2tldCBwYXRoIGxlbmd0aCB2YWxpZGF0aW9uICgxMDQgY2hhciBsaW1pdClcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogLy8gQ3JlYXRlIGEgY2xpZW50IGZvciBhIHRlcm1pbmFsIHNlc3Npb25cbiAqIGNvbnN0IGNsaWVudCA9IG5ldyBWaWJlVHVubmVsU29ja2V0Q2xpZW50KCcvdG1wL3ZpYmV0dW5uZWwvc2Vzc2lvbi0xMjMuc29jaycsIHtcbiAqICAgYXV0b1JlY29ubmVjdDogdHJ1ZSxcbiAqICAgaGVhcnRiZWF0SW50ZXJ2YWw6IDMwMDAwXG4gKiB9KTtcbiAqXG4gKiAvLyBMaXN0ZW4gZm9yIGV2ZW50c1xuICogY2xpZW50Lm9uKCdjb25uZWN0JywgKCkgPT4gY29uc29sZS5sb2coJ0Nvbm5lY3RlZCB0byB0ZXJtaW5hbCcpKTtcbiAqIGNsaWVudC5vbignc3RhdHVzJywgKHN0YXR1cykgPT4gY29uc29sZS5sb2coJ1Rlcm1pbmFsIHN0YXR1czonLCBzdGF0dXMpKTtcbiAqIGNsaWVudC5vbignZXJyb3InLCAoZXJyb3IpID0+IGNvbnNvbGUuZXJyb3IoJ1NvY2tldCBlcnJvcjonLCBlcnJvcikpO1xuICpcbiAqIC8vIENvbm5lY3QgYW5kIHNlbmQgY29tbWFuZHNcbiAqIGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG4gKiBjbGllbnQuc2VuZFN0ZGluKCdscyAtbGFcXG4nKTtcbiAqIGNsaWVudC5yZXNpemUoODAsIDI0KTtcbiAqIGBgYFxuICpcbiAqIEBleHRlbmRzIEV2ZW50RW1pdHRlclxuICovXG5leHBvcnQgY2xhc3MgVmliZVR1bm5lbFNvY2tldENsaWVudCBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gIHByaXZhdGUgc29ja2V0PzogbmV0LlNvY2tldDtcbiAgcHJpdmF0ZSBwYXJzZXIgPSBuZXcgTWVzc2FnZVBhcnNlcigpO1xuICBwcml2YXRlIGNvbm5lY3RlZCA9IGZhbHNlO1xuICBwcml2YXRlIHJlY29ubmVjdFRpbWVyPzogTm9kZUpTLlRpbWVvdXQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgcmVjb25uZWN0RGVsYXkgPSAxMDAwO1xuICBwcml2YXRlIGhlYXJ0YmVhdEludGVydmFsPzogTm9kZUpTLlRpbWVvdXQ7XG4gIHByaXZhdGUgbGFzdEhlYXJ0YmVhdCA9IERhdGUubm93KCk7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSByZWFkb25seSBzb2NrZXRQYXRoOiBzdHJpbmcsXG4gICAgcHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiB7XG4gICAgICBhdXRvUmVjb25uZWN0PzogYm9vbGVhbjtcbiAgICAgIGhlYXJ0YmVhdEludGVydmFsPzogbnVtYmVyO1xuICAgIH0gPSB7fVxuICApIHtcbiAgICBzdXBlcigpO1xuXG4gICAgLy8gSU1QT1JUQU5UOiBtYWNPUyBoYXMgYSAxMDQgY2hhcmFjdGVyIGxpbWl0IGZvciBVbml4IHNvY2tldCBwYXRoc1xuICAgIC8vIElmIHlvdSBnZXQgRUlOVkFMIGVycm9ycyB3aGVuIGNvbm5lY3RpbmcsIHRoZSBwYXRoIGlzIGxpa2VseSB0b28gbG9uZ1xuICAgIGlmIChzb2NrZXRQYXRoLmxlbmd0aCA+IDEwMykge1xuICAgICAgbG9nZ2VyLndhcm4oYFNvY2tldCBwYXRoIG1heSBiZSB0b28gbG9uZyAoJHtzb2NrZXRQYXRoLmxlbmd0aH0gY2hhcnMpOiAke3NvY2tldFBhdGh9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbm5lY3QgdG8gdGhlIHNvY2tldFxuICAgKi9cbiAgY29ubmVjdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgaWYgKHRoaXMuY29ubmVjdGVkKSB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0aGlzLnNvY2tldCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKHRoaXMuc29ja2V0UGF0aCk7XG4gICAgICB0aGlzLnNvY2tldC5zZXROb0RlbGF5KHRydWUpO1xuICAgICAgdGhpcy5zb2NrZXQuc2V0S2VlcEFsaXZlKHRydWUsIDApO1xuXG4gICAgICBjb25zdCBvbkNvbm5lY3QgPSAoKSA9PiB7XG4gICAgICAgIHRoaXMuY29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5zZXR1cFNvY2tldEhhbmRsZXJzKCk7XG4gICAgICAgIHRoaXMuZW1pdCgnY29ubmVjdCcpO1xuICAgICAgICB0aGlzLnN0YXJ0SGVhcnRiZWF0KCk7XG4gICAgICAgIGNsZWFudXAoKTtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfTtcblxuICAgICAgY29uc3Qgb25FcnJvciA9IChlcnJvcjogRXJyb3IpID0+IHtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgICAvLyBEZXN0cm95IHRoZSBzb2NrZXQgdG8gcHJldmVudCBmdXJ0aGVyIGVycm9yc1xuICAgICAgICB0aGlzLnNvY2tldD8uZGVzdHJveSgpO1xuICAgICAgICB0aGlzLnNvY2tldCA9IHVuZGVmaW5lZDtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG4gICAgICAgIHRoaXMuc29ja2V0Py5vZmYoJ2Nvbm5lY3QnLCBvbkNvbm5lY3QpO1xuICAgICAgICB0aGlzLnNvY2tldD8ub2ZmKCdlcnJvcicsIG9uRXJyb3IpO1xuICAgICAgfTtcblxuICAgICAgdGhpcy5zb2NrZXQub25jZSgnY29ubmVjdCcsIG9uQ29ubmVjdCk7XG4gICAgICB0aGlzLnNvY2tldC5vbmNlKCdlcnJvcicsIG9uRXJyb3IpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHVwIHNvY2tldCBldmVudCBoYW5kbGVyc1xuICAgKi9cbiAgcHJpdmF0ZSBzZXR1cFNvY2tldEhhbmRsZXJzKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5zb2NrZXQpIHJldHVybjtcblxuICAgIHRoaXMuc29ja2V0Lm9uKCdkYXRhJywgKGNodW5rKSA9PiB7XG4gICAgICB0aGlzLnBhcnNlci5hZGREYXRhKGNodW5rKTtcblxuICAgICAgZm9yIChjb25zdCB7IHR5cGUsIHBheWxvYWQgfSBvZiB0aGlzLnBhcnNlci5wYXJzZU1lc3NhZ2VzKCkpIHtcbiAgICAgICAgdGhpcy5oYW5kbGVNZXNzYWdlKHR5cGUsIHBheWxvYWQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgdGhpcy5oYW5kbGVEaXNjb25uZWN0KCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnNvY2tldC5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcihgU29ja2V0IGVycm9yIG9uICR7dGhpcy5zb2NrZXRQYXRofTpgLCBlcnJvcik7XG4gICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyb3IpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBpbmNvbWluZyBtZXNzYWdlc1xuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVNZXNzYWdlKHR5cGU6IE1lc3NhZ2VUeXBlLCBwYXlsb2FkOiBCdWZmZXIpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZGF0YSA9IHBhcnNlUGF5bG9hZCh0eXBlLCBwYXlsb2FkKTtcblxuICAgICAgLy8gRW1pdCBldmVudCB3aXRoIG1lc3NhZ2UgdHlwZSBlbnVtIG5hbWVcbiAgICAgIHRoaXMuZW1pdChNZXNzYWdlVHlwZVt0eXBlXSwgZGF0YSk7XG5cbiAgICAgIC8vIEhhbmRsZSBoZWFydGJlYXRcbiAgICAgIGlmICh0eXBlID09PSBNZXNzYWdlVHlwZS5IRUFSVEJFQVQpIHtcbiAgICAgICAgdGhpcy5sYXN0SGVhcnRiZWF0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gRWNobyBoZWFydGJlYXQgYmFja1xuICAgICAgICB0aGlzLnNlbmRIZWFydGJlYXQoKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gcGFyc2UgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBkaXNjb25uZWN0aW9uXG4gICAqL1xuICBwcml2YXRlIGhhbmRsZURpc2Nvbm5lY3QoZXJyb3I/OiBFcnJvcik6IHZvaWQge1xuICAgIHRoaXMuY29ubmVjdGVkID0gZmFsc2U7XG4gICAgdGhpcy5zdG9wSGVhcnRiZWF0KCk7XG4gICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JywgZXJyb3IpO1xuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5hdXRvUmVjb25uZWN0ICYmICF0aGlzLnJlY29ubmVjdFRpbWVyKSB7XG4gICAgICB0aGlzLnJlY29ubmVjdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMucmVjb25uZWN0VGltZXIgPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuY29ubmVjdCgpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYFJlY29ubmVjdGlvbiBmYWlsZWQ6ICR7ZXJyLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgdGhpcy5oYW5kbGVEaXNjb25uZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgICAgfSwgdGhpcy5yZWNvbm5lY3REZWxheSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGhlYXJ0YmVhdFxuICAgKi9cbiAgcHJpdmF0ZSBzdGFydEhlYXJ0YmVhdCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLmhlYXJ0YmVhdEludGVydmFsKSB7XG4gICAgICB0aGlzLmhlYXJ0YmVhdEludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICB0aGlzLnNlbmRIZWFydGJlYXQoKTtcbiAgICAgIH0sIHRoaXMub3B0aW9ucy5oZWFydGJlYXRJbnRlcnZhbCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgaGVhcnRiZWF0XG4gICAqL1xuICBwcml2YXRlIHN0b3BIZWFydGJlYXQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaGVhcnRiZWF0SW50ZXJ2YWwpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5oZWFydGJlYXRJbnRlcnZhbCk7XG4gICAgICB0aGlzLmhlYXJ0YmVhdEludGVydmFsID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGRhdGEgdG8gc3RkaW5cbiAgICovXG4gIHNlbmRTdGRpbihkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zZW5kKE1lc3NhZ2VCdWlsZGVyLnN0ZGluKGRhdGEpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIHJlc2l6ZSBjb21tYW5kXG4gICAqL1xuICByZXNpemUoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5zZW5kKE1lc3NhZ2VCdWlsZGVyLnJlc2l6ZShjb2xzLCByb3dzKSk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBraWxsIGNvbW1hbmRcbiAgICovXG4gIGtpbGwoc2lnbmFsPzogc3RyaW5nIHwgbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuc2VuZChNZXNzYWdlQnVpbGRlci5raWxsKHNpZ25hbCkpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgcmVzZXQgc2l6ZSBjb21tYW5kXG4gICAqL1xuICByZXNldFNpemUoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuc2VuZChNZXNzYWdlQnVpbGRlci5yZXNldFNpemUoKSk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCB1cGRhdGUgdGl0bGUgY29tbWFuZFxuICAgKi9cbiAgdXBkYXRlVGl0bGUodGl0bGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLnNlbmQoTWVzc2FnZUJ1aWxkZXIudXBkYXRlVGl0bGUodGl0bGUpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIHN0YXR1cyB1cGRhdGVcbiAgICovXG4gIHNlbmRTdGF0dXMoYXBwOiBzdHJpbmcsIHN0YXR1czogc3RyaW5nLCBleHRyYT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuc2VuZChNZXNzYWdlQnVpbGRlci5zdGF0dXMoYXBwLCBzdGF0dXMsIGV4dHJhKSk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBhIG1lc3NhZ2Ugd2l0aCB0eXBlLXNhZmUgcGF5bG9hZFxuICAgKi9cbiAgcHVibGljIHNlbmRNZXNzYWdlPFQgZXh0ZW5kcyBNZXNzYWdlVHlwZT4odHlwZTogVCwgcGF5bG9hZDogTWVzc2FnZVBheWxvYWQ8VD4pOiBib29sZWFuIHtcbiAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5idWlsZE1lc3NhZ2UodHlwZSwgcGF5bG9hZCk7XG4gICAgcmV0dXJuIHRoaXMuc2VuZChtZXNzYWdlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgbWVzc2FnZSBhbmQgd2FpdCBmb3IgYSByZXNwb25zZVxuICAgKi9cbiAgcHVibGljIGFzeW5jIHNlbmRNZXNzYWdlV2l0aFJlc3BvbnNlPFRSZXF1ZXN0IGV4dGVuZHMgTWVzc2FnZVR5cGUsIFRSZXNwb25zZSBleHRlbmRzIE1lc3NhZ2VUeXBlPihcbiAgICByZXF1ZXN0VHlwZTogVFJlcXVlc3QsXG4gICAgcGF5bG9hZDogTWVzc2FnZVBheWxvYWQ8VFJlcXVlc3Q+LFxuICAgIHJlc3BvbnNlVHlwZTogVFJlc3BvbnNlLFxuICAgIHRpbWVvdXQgPSA1MDAwXG4gICk6IFByb21pc2U8TWVzc2FnZVBheWxvYWQ8VFJlc3BvbnNlPj4ge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLm9mZihNZXNzYWdlVHlwZVtyZXNwb25zZVR5cGVdLCBoYW5kbGVSZXNwb25zZSk7XG4gICAgICAgIHRoaXMub2ZmKCdlcnJvcicsIGhhbmRsZUVycm9yKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgUmVxdWVzdCB0aW1lb3V0IHdhaXRpbmcgZm9yICR7TWVzc2FnZVR5cGVbcmVzcG9uc2VUeXBlXX1gKSk7XG4gICAgICB9LCB0aW1lb3V0KTtcblxuICAgICAgY29uc3QgaGFuZGxlUmVzcG9uc2UgPSAoZGF0YTogTWVzc2FnZVBheWxvYWQ8VFJlc3BvbnNlPikgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgICB0aGlzLm9mZignZXJyb3InLCBoYW5kbGVFcnJvcik7XG4gICAgICAgIHJlc29sdmUoZGF0YSk7XG4gICAgICB9O1xuXG4gICAgICBjb25zdCBoYW5kbGVFcnJvciA9IChlcnJvcjogRXJyb3IgfCBFcnJvck1lc3NhZ2UpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgdGhpcy5vZmYoTWVzc2FnZVR5cGVbcmVzcG9uc2VUeXBlXSwgaGFuZGxlUmVzcG9uc2UpO1xuICAgICAgICBpZiAoJ21lc3NhZ2UnIGluIGVycm9yKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihlcnJvci5tZXNzYWdlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gTGlzdGVuIGZvciByZXNwb25zZVxuICAgICAgdGhpcy5vbmNlKE1lc3NhZ2VUeXBlW3Jlc3BvbnNlVHlwZV0sIGhhbmRsZVJlc3BvbnNlKTtcbiAgICAgIHRoaXMub25jZSgnZXJyb3InLCBoYW5kbGVFcnJvcik7XG5cbiAgICAgIGNvbnN0IHNlbnQgPSB0aGlzLnNlbmRNZXNzYWdlKHJlcXVlc3RUeXBlLCBwYXlsb2FkKTtcbiAgICAgIGlmICghc2VudCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICAgICAgICB0aGlzLm9mZihNZXNzYWdlVHlwZVtyZXNwb25zZVR5cGVdLCBoYW5kbGVSZXNwb25zZSk7XG4gICAgICAgIHRoaXMub2ZmKCdlcnJvcicsIGhhbmRsZUVycm9yKTtcbiAgICAgICAgcmVqZWN0KG5ldyBFcnJvcignRmFpbGVkIHRvIHNlbmQgbWVzc2FnZScpKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBhIG1lc3NhZ2UgYnVmZmVyIGZyb20gdHlwZSBhbmQgcGF5bG9hZFxuICAgKi9cbiAgcHJpdmF0ZSBidWlsZE1lc3NhZ2U8VCBleHRlbmRzIE1lc3NhZ2VUeXBlPih0eXBlOiBULCBwYXlsb2FkOiBNZXNzYWdlUGF5bG9hZDxUPik6IEJ1ZmZlciB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIE1lc3NhZ2VUeXBlLlNURElOX0RBVEE6XG4gICAgICAgIHJldHVybiBNZXNzYWdlQnVpbGRlci5zdGRpbihwYXlsb2FkIGFzIHN0cmluZyk7XG4gICAgICBjYXNlIE1lc3NhZ2VUeXBlLkNPTlRST0xfQ01EOiB7XG4gICAgICAgIGNvbnN0IGNtZCA9IHBheWxvYWQgYXMgQ29udHJvbENvbW1hbmQ7XG4gICAgICAgIHN3aXRjaCAoY21kLmNtZCkge1xuICAgICAgICAgIGNhc2UgJ3Jlc2l6ZSc6XG4gICAgICAgICAgICByZXR1cm4gTWVzc2FnZUJ1aWxkZXIucmVzaXplKChjbWQgYXMgUmVzaXplQ29tbWFuZCkuY29scywgKGNtZCBhcyBSZXNpemVDb21tYW5kKS5yb3dzKTtcbiAgICAgICAgICBjYXNlICdraWxsJzpcbiAgICAgICAgICAgIHJldHVybiBNZXNzYWdlQnVpbGRlci5raWxsKChjbWQgYXMgS2lsbENvbW1hbmQpLnNpZ25hbCk7XG4gICAgICAgICAgY2FzZSAncmVzZXQtc2l6ZSc6XG4gICAgICAgICAgICByZXR1cm4gTWVzc2FnZUJ1aWxkZXIucmVzZXRTaXplKCk7XG4gICAgICAgICAgY2FzZSAndXBkYXRlLXRpdGxlJzpcbiAgICAgICAgICAgIHJldHVybiBNZXNzYWdlQnVpbGRlci51cGRhdGVUaXRsZSgoY21kIGFzIFVwZGF0ZVRpdGxlQ29tbWFuZCkudGl0bGUpO1xuICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBGb3IgZ2VuZXJpYyBjb250cm9sIGNvbW1hbmRzLCB1c2UgZnJhbWVNZXNzYWdlIGRpcmVjdGx5XG4gICAgICAgICAgICByZXR1cm4gZnJhbWVNZXNzYWdlKE1lc3NhZ2VUeXBlLkNPTlRST0xfQ01ELCBjbWQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjYXNlIE1lc3NhZ2VUeXBlLlNUQVRVU19VUERBVEU6IHtcbiAgICAgICAgY29uc3Qgc3RhdHVzUGF5bG9hZCA9IHBheWxvYWQgYXMgU3RhdHVzVXBkYXRlO1xuICAgICAgICByZXR1cm4gTWVzc2FnZUJ1aWxkZXIuc3RhdHVzKFxuICAgICAgICAgIHN0YXR1c1BheWxvYWQuYXBwLFxuICAgICAgICAgIHN0YXR1c1BheWxvYWQuc3RhdHVzLFxuICAgICAgICAgIHN0YXR1c1BheWxvYWQuZXh0cmEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWRcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGNhc2UgTWVzc2FnZVR5cGUuSEVBUlRCRUFUOlxuICAgICAgICByZXR1cm4gTWVzc2FnZUJ1aWxkZXIuaGVhcnRiZWF0KCk7XG4gICAgICBjYXNlIE1lc3NhZ2VUeXBlLlNUQVRVU19SRVFVRVNUOlxuICAgICAgICByZXR1cm4gTWVzc2FnZUJ1aWxkZXIuc3RhdHVzUmVxdWVzdCgpO1xuICAgICAgY2FzZSBNZXNzYWdlVHlwZS5HSVRfRk9MTE9XX1JFUVVFU1Q6XG4gICAgICAgIHJldHVybiBNZXNzYWdlQnVpbGRlci5naXRGb2xsb3dSZXF1ZXN0KHBheWxvYWQgYXMgR2l0Rm9sbG93UmVxdWVzdCk7XG4gICAgICBjYXNlIE1lc3NhZ2VUeXBlLkdJVF9FVkVOVF9OT1RJRlk6XG4gICAgICAgIHJldHVybiBNZXNzYWdlQnVpbGRlci5naXRFdmVudE5vdGlmeShwYXlsb2FkIGFzIEdpdEV2ZW50Tm90aWZ5KTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgbWVzc2FnZSB0eXBlOiAke3R5cGV9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgaGVhcnRiZWF0XG4gICAqL1xuICBwcml2YXRlIHNlbmRIZWFydGJlYXQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuc2VuZChNZXNzYWdlQnVpbGRlci5oZWFydGJlYXQoKSk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCByYXcgbWVzc2FnZVxuICAgKi9cbiAgcHJpdmF0ZSBzZW5kKG1lc3NhZ2U6IEJ1ZmZlcik6IGJvb2xlYW4ge1xuICAgIGlmICghdGhpcy5jb25uZWN0ZWQgfHwgIXRoaXMuc29ja2V0KSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0Nhbm5vdCBzZW5kIG1lc3NhZ2U6IG5vdCBjb25uZWN0ZWQnKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIHRoaXMuc29ja2V0LndyaXRlKG1lc3NhZ2UpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIG1lc3NhZ2U6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBEaXNjb25uZWN0IGZyb20gdGhlIHNvY2tldFxuICAgKi9cbiAgZGlzY29ubmVjdCgpOiB2b2lkIHtcbiAgICB0aGlzLm9wdGlvbnMuYXV0b1JlY29ubmVjdCA9IGZhbHNlO1xuICAgIHRoaXMuY29ubmVjdGVkID0gZmFsc2U7XG4gICAgdGhpcy5zdG9wSGVhcnRiZWF0KCk7XG5cbiAgICBpZiAodGhpcy5yZWNvbm5lY3RUaW1lcikge1xuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucmVjb25uZWN0VGltZXIpO1xuICAgICAgdGhpcy5yZWNvbm5lY3RUaW1lciA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zb2NrZXQpIHtcbiAgICAgIHRoaXMuc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgIHRoaXMuc29ja2V0ID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBjb25uZWN0ZWRcbiAgICovXG4gIGlzQ29ubmVjdGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3RlZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGltZSBzaW5jZSBsYXN0IGhlYXJ0YmVhdFxuICAgKi9cbiAgZ2V0VGltZVNpbmNlTGFzdEhlYXJ0YmVhdCgpOiBudW1iZXIge1xuICAgIHJldHVybiBEYXRlLm5vdygpIC0gdGhpcy5sYXN0SGVhcnRiZWF0O1xuICB9XG59XG4iXX0=