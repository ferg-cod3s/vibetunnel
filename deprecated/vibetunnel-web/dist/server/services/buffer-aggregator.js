"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferAggregator = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ws_1 = require("ws");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('buffer-aggregator');
/**
 * Aggregates and distributes terminal buffer updates across local and remote sessions.
 *
 * The BufferAggregator acts as a central hub for WebSocket-based terminal buffer streaming,
 * managing connections between clients and terminal sessions. In HQ (headquarters) mode,
 * it also handles connections to remote VibeTunnel servers, enabling cross-server terminal
 * session access.
 *
 * Key features:
 * - WebSocket-based real-time buffer streaming
 * - Support for both local and remote terminal sessions
 * - Efficient binary protocol for buffer updates
 * - Automatic connection management and reconnection
 * - Session subscription/unsubscription handling
 * - Remote server connection pooling in HQ mode
 * - Graceful cleanup on disconnection
 *
 * The aggregator uses a binary protocol for buffer updates:
 * - Magic byte (0xBF) to identify binary messages
 * - 4-byte session ID length (little-endian)
 * - UTF-8 encoded session ID
 * - Binary terminal buffer data
 *
 * @example
 * ```typescript
 * // Create aggregator for local-only mode
 * const aggregator = new BufferAggregator({
 *   terminalManager,
 *   remoteRegistry: null,
 *   isHQMode: false
 * });
 *
 * // Handle client WebSocket connection
 * wss.on('connection', (ws) => {
 *   aggregator.handleClientConnection(ws);
 * });
 *
 * // In HQ mode with remote registry
 * const hqAggregator = new BufferAggregator({
 *   terminalManager,
 *   remoteRegistry,
 *   isHQMode: true
 * });
 *
 * // Register remote server
 * await hqAggregator.onRemoteRegistered(remoteId);
 * ```
 *
 * @see TerminalManager - Manages local terminal instances
 * @see RemoteRegistry - Tracks remote VibeTunnel servers in HQ mode
 * @see web/src/server/routes/buffer.ts - WebSocket endpoint setup
 */
class BufferAggregator {
    constructor(config) {
        this.remoteConnections = new Map();
        this.clientSubscriptions = new Map();
        this.config = config;
        logger.log(`BufferAggregator initialized (HQ mode: ${config.isHQMode})`);
    }
    /**
     * Handle a new client WebSocket connection
     */
    async handleClientConnection(ws) {
        logger.log(chalk_1.default.blue('New client connected'));
        const clientId = `client-${Date.now()}`;
        logger.debug(`Assigned client ID: ${clientId}`);
        // Initialize subscription map for this client
        this.clientSubscriptions.set(ws, new Map());
        // Send welcome message
        ws.send(JSON.stringify({ type: 'connected', version: '1.0' }));
        logger.debug('Sent welcome message to client');
        // Handle messages from client
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                await this.handleClientMessage(ws, data);
            }
            catch (error) {
                logger.error('Error handling client message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format',
                }));
            }
        });
        // Handle disconnection
        ws.on('close', () => {
            this.handleClientDisconnect(ws);
        });
        ws.on('error', (error) => {
            logger.error('Client WebSocket error:', error);
        });
    }
    /**
     * Handle messages from a client
     */
    async handleClientMessage(clientWs, data) {
        const subscriptions = this.clientSubscriptions.get(clientWs);
        if (!subscriptions)
            return;
        if (data.type === 'subscribe' && data.sessionId) {
            const sessionId = data.sessionId;
            // Unsubscribe if already subscribed
            if (subscriptions.has(sessionId)) {
                const existingUnsubscribe = subscriptions.get(sessionId);
                if (existingUnsubscribe) {
                    existingUnsubscribe();
                }
                subscriptions.delete(sessionId);
            }
            // Check if this is a local or remote session
            const isRemoteSession = this.config.isHQMode &&
                this.config.remoteRegistry &&
                this.config.remoteRegistry.getRemoteBySessionId(sessionId);
            if (isRemoteSession) {
                // Subscribe to remote session
                logger.debug(`Subscribing to remote session ${sessionId} on remote ${isRemoteSession.id}`);
                await this.subscribeToRemoteSession(clientWs, sessionId, isRemoteSession.id);
            }
            else {
                // Subscribe to local session
                logger.debug(`Subscribing to local session ${sessionId}`);
                await this.subscribeToLocalSession(clientWs, sessionId);
            }
            clientWs.send(JSON.stringify({ type: 'subscribed', sessionId }));
            logger.log(chalk_1.default.green(`Client subscribed to session ${sessionId}`));
        }
        else if (data.type === 'unsubscribe' && data.sessionId) {
            const sessionId = data.sessionId;
            const unsubscribe = subscriptions.get(sessionId);
            if (unsubscribe) {
                unsubscribe();
                subscriptions.delete(sessionId);
                logger.log(chalk_1.default.yellow(`Client unsubscribed from session ${sessionId}`));
            }
            // Also unsubscribe from remote if applicable
            if (this.config.isHQMode && this.config.remoteRegistry) {
                const remote = this.config.remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    const remoteConn = this.remoteConnections.get(remote.id);
                    if (remoteConn) {
                        remoteConn.subscriptions.delete(sessionId);
                        if (remoteConn.ws.readyState === ws_1.WebSocket.OPEN) {
                            remoteConn.ws.send(JSON.stringify({ type: 'unsubscribe', sessionId }));
                            logger.debug(`Sent unsubscribe request to remote ${remoteConn.remoteName} for session ${sessionId}`);
                        }
                        else {
                            logger.debug(`Cannot unsubscribe from remote ${remoteConn.remoteName} - WebSocket not open`);
                        }
                    }
                }
            }
        }
        else if (data.type === 'ping') {
            clientWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
    }
    /**
     * Subscribe a client to a local session
     */
    async subscribeToLocalSession(clientWs, sessionId) {
        const subscriptions = this.clientSubscriptions.get(clientWs);
        if (!subscriptions)
            return;
        try {
            const unsubscribe = await this.config.terminalManager.subscribeToBufferChanges(sessionId, (sessionId, snapshot) => {
                try {
                    const buffer = this.config.terminalManager.encodeSnapshot(snapshot);
                    const sessionIdBuffer = Buffer.from(sessionId, 'utf8');
                    const totalLength = 1 + 4 + sessionIdBuffer.length + buffer.length;
                    const fullBuffer = Buffer.allocUnsafe(totalLength);
                    let offset = 0;
                    fullBuffer.writeUInt8(0xbf, offset); // Magic byte for binary message
                    offset += 1;
                    fullBuffer.writeUInt32LE(sessionIdBuffer.length, offset);
                    offset += 4;
                    sessionIdBuffer.copy(fullBuffer, offset);
                    offset += sessionIdBuffer.length;
                    buffer.copy(fullBuffer, offset);
                    if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                        clientWs.send(fullBuffer);
                    }
                    else {
                        logger.debug(`Skipping buffer update - client WebSocket not open`);
                    }
                }
                catch (error) {
                    logger.error('Error encoding buffer update:', error);
                }
            });
            subscriptions.set(sessionId, unsubscribe);
            logger.debug(`Created subscription for local session ${sessionId}`);
            // Send initial buffer
            logger.debug(`Sending initial buffer for session ${sessionId}`);
            const initialSnapshot = await this.config.terminalManager.getBufferSnapshot(sessionId);
            const buffer = this.config.terminalManager.encodeSnapshot(initialSnapshot);
            const sessionIdBuffer = Buffer.from(sessionId, 'utf8');
            const totalLength = 1 + 4 + sessionIdBuffer.length + buffer.length;
            const fullBuffer = Buffer.allocUnsafe(totalLength);
            let offset = 0;
            fullBuffer.writeUInt8(0xbf, offset);
            offset += 1;
            fullBuffer.writeUInt32LE(sessionIdBuffer.length, offset);
            offset += 4;
            sessionIdBuffer.copy(fullBuffer, offset);
            offset += sessionIdBuffer.length;
            buffer.copy(fullBuffer, offset);
            if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                clientWs.send(fullBuffer);
                logger.debug(`Sent initial buffer (${fullBuffer.length} bytes) for session ${sessionId}`);
            }
            else {
                logger.warn(`Cannot send initial buffer - client WebSocket not open`);
            }
        }
        catch (error) {
            logger.error(`Error subscribing to local session ${sessionId}:`, error);
            clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to subscribe to session' }));
        }
    }
    /**
     * Subscribe a client to a remote session
     */
    async subscribeToRemoteSession(clientWs, sessionId, remoteId) {
        // Ensure we have a connection to this remote
        let remoteConn = this.remoteConnections.get(remoteId);
        if (!remoteConn || remoteConn.ws.readyState !== ws_1.WebSocket.OPEN) {
            logger.debug(`No active connection to remote ${remoteId}, establishing new connection`);
            // Need to connect to remote
            const connected = await this.connectToRemote(remoteId);
            if (!connected) {
                logger.warn(`Failed to connect to remote ${remoteId} for session ${sessionId}`);
                clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to connect to remote server' }));
                return;
            }
            remoteConn = this.remoteConnections.get(remoteId);
        }
        if (!remoteConn)
            return;
        // Subscribe to the session on the remote
        remoteConn.subscriptions.add(sessionId);
        remoteConn.ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
        logger.debug(`Sent subscription request to remote ${remoteConn.remoteName} for session ${sessionId}`);
        // Store an unsubscribe function for the client
        const subscriptions = this.clientSubscriptions.get(clientWs);
        if (subscriptions) {
            subscriptions.set(sessionId, () => {
                // Will be handled in the unsubscribe message handler
            });
        }
    }
    /**
     * Connect to a remote server's WebSocket
     */
    async connectToRemote(remoteId) {
        logger.log(`Connecting to remote ${remoteId}`);
        if (!this.config.remoteRegistry) {
            logger.warn('No remote registry available');
            return false;
        }
        const remote = this.config.remoteRegistry.getRemote(remoteId);
        if (!remote) {
            logger.warn(`Remote ${remoteId} not found in registry`);
            return false;
        }
        try {
            // Convert HTTP URL to WebSocket URL and add /buffers path
            const wsUrl = `${remote.url.replace(/^http/, 'ws')}/buffers`;
            const ws = new ws_1.WebSocket(wsUrl, {
                headers: {
                    Authorization: `Bearer ${remote.token}`,
                },
            });
            logger.debug(`Attempting WebSocket connection to ${wsUrl}`);
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    logger.warn(`Connection to remote ${remote.name} timed out after 5s`);
                    reject(new Error('Connection timeout'));
                }, 5000);
                ws.on('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            const remoteConn = {
                ws,
                remoteId: remote.id,
                remoteName: remote.name,
                subscriptions: new Set(),
            };
            this.remoteConnections.set(remoteId, remoteConn);
            // Handle messages from remote
            ws.on('message', (data) => {
                this.handleRemoteMessage(remoteId, data);
            });
            logger.debug(`Remote ${remote.name} connection established with ${remoteConn.subscriptions.size} initial subscriptions`);
            // Handle disconnection
            ws.on('close', () => {
                logger.log(chalk_1.default.yellow(`Disconnected from remote ${remote.name}`));
                this.remoteConnections.delete(remoteId);
            });
            ws.on('error', (error) => {
                logger.error(`Remote ${remote.name} WebSocket error:`, error);
            });
            logger.log(chalk_1.default.green(`Connected to remote ${remote.name}`));
            return true;
        }
        catch (error) {
            logger.error(`Failed to connect to remote ${remoteId}:`, error);
            return false;
        }
    }
    /**
     * Handle messages from a remote server
     */
    handleRemoteMessage(remoteId, data) {
        // Check if this is a binary buffer update
        if (data.length > 0 && data[0] === 0xbf) {
            // Forward to all clients subscribed to sessions from this remote
            this.forwardBufferToClients(data);
        }
        else {
            // JSON message
            try {
                const message = JSON.parse(data.toString());
                logger.debug(`Remote ${remoteId} message:`, message.type);
            }
            catch (error) {
                logger.error(`Failed to parse remote message:`, error);
            }
        }
    }
    /**
     * Forward a buffer update to all subscribed clients
     */
    forwardBufferToClients(buffer) {
        // Extract session ID from buffer
        if (buffer.length < 5)
            return;
        const sessionIdLength = buffer.readUInt32LE(1);
        if (buffer.length < 5 + sessionIdLength)
            return;
        const sessionId = buffer.subarray(5, 5 + sessionIdLength).toString('utf8');
        // Forward to all clients subscribed to this session
        let forwardedCount = 0;
        for (const [clientWs, subscriptions] of this.clientSubscriptions) {
            if (subscriptions.has(sessionId) && clientWs.readyState === ws_1.WebSocket.OPEN) {
                clientWs.send(buffer);
                forwardedCount++;
            }
        }
        if (forwardedCount > 0) {
            logger.debug(`Forwarded buffer update for session ${sessionId} to ${forwardedCount} clients`);
        }
    }
    /**
     * Handle client disconnection
     */
    handleClientDisconnect(ws) {
        const subscriptions = this.clientSubscriptions.get(ws);
        if (subscriptions) {
            const subscriptionCount = subscriptions.size;
            // Unsubscribe from all sessions
            for (const [sessionId, unsubscribe] of subscriptions) {
                logger.debug(`Cleaning up subscription for session ${sessionId}`);
                unsubscribe();
            }
            subscriptions.clear();
            logger.debug(`Cleaned up ${subscriptionCount} subscriptions`);
        }
        this.clientSubscriptions.delete(ws);
        logger.log(chalk_1.default.yellow('Client disconnected'));
    }
    /**
     * Register a new remote server (called when a remote registers with HQ)
     */
    async onRemoteRegistered(remoteId) {
        logger.log(`Remote ${remoteId} registered, establishing connection`);
        // Optionally pre-connect to the remote
        const connected = await this.connectToRemote(remoteId);
        if (!connected) {
            logger.warn(`Failed to establish connection to newly registered remote ${remoteId}`);
        }
    }
    /**
     * Handle remote server unregistration
     */
    onRemoteUnregistered(remoteId) {
        logger.log(`Remote ${remoteId} unregistered, closing connection`);
        const remoteConn = this.remoteConnections.get(remoteId);
        if (remoteConn) {
            logger.debug(`Closing connection to remote ${remoteConn.remoteName} with ${remoteConn.subscriptions.size} active subscriptions`);
            remoteConn.ws.close();
            this.remoteConnections.delete(remoteId);
        }
        else {
            logger.debug(`No active connection found for unregistered remote ${remoteId}`);
        }
    }
    /**
     * Clean up all connections
     */
    destroy() {
        logger.log(chalk_1.default.yellow('Shutting down BufferAggregator'));
        // Close all client connections
        const clientCount = this.clientSubscriptions.size;
        for (const [ws] of this.clientSubscriptions) {
            ws.close();
        }
        this.clientSubscriptions.clear();
        logger.debug(`Closed ${clientCount} client connections`);
        // Close all remote connections
        const remoteCount = this.remoteConnections.size;
        for (const [_, remoteConn] of this.remoteConnections) {
            remoteConn.ws.close();
        }
        this.remoteConnections.clear();
        logger.debug(`Closed ${remoteCount} remote connections`);
    }
}
exports.BufferAggregator = BufferAggregator;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVmZmVyLWFnZ3JlZ2F0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL2J1ZmZlci1hZ2dyZWdhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLGtEQUEwQjtBQUMxQiwyQkFBK0I7QUFDL0Isa0RBQWtEO0FBSWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBZWpEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtREc7QUFDSCxNQUFhLGdCQUFnQjtJQUszQixZQUFZLE1BQThCO1FBSGxDLHNCQUFpQixHQUEyQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RFLHdCQUFtQixHQUE0QyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRy9FLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxHQUFHLENBQUMsMENBQTBDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxFQUFhO1FBQ3hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFDL0MsTUFBTSxRQUFRLEdBQUcsVUFBVSxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsS0FBSyxDQUFDLHVCQUF1QixRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRWhELDhDQUE4QztRQUM5QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFFNUMsdUJBQXVCO1FBQ3ZCLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElB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Q0FBQzthQUFNLENBQUM7WUFDTixNQUFNLENBQUMsS0FBSyxDQUFDLHNEQUFzRCxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ2pGLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxPQUFPO1FBQ0wsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztRQUUzRCwrQkFBK0I7UUFDL0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQztRQUNsRCxLQUFLLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUM1QyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxLQUFLLENBQUMsVUFBVSxXQUFXLHFCQUFxQixDQUFDLENBQUM7UUFFekQsK0JBQStCO1FBQy9CLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7UUFDaEQsS0FBSyxNQUFNLENBQUMsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3JELFVBQVUsQ0FBQyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDeEIsQ0FBQztRQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMvQixNQUFNLENBQUMsS0FBSyxDQUFDLFVBQVUsV0FBVyxxQkFBcUIsQ0FBQyxDQUFDO0lBQzNELENBQUM7Q0FDRjtBQXZiRCw0Q0F1YkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0IHsgV2ViU29ja2V0IH0gZnJvbSAnd3MnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgUmVtb3RlUmVnaXN0cnkgfSBmcm9tICcuL3JlbW90ZS1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVybWluYWwtbWFuYWdlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignYnVmZmVyLWFnZ3JlZ2F0b3InKTtcblxuaW50ZXJmYWNlIEJ1ZmZlckFnZ3JlZ2F0b3JDb25maWcge1xuICB0ZXJtaW5hbE1hbmFnZXI6IFRlcm1pbmFsTWFuYWdlcjtcbiAgcmVtb3RlUmVnaXN0cnk6IFJlbW90ZVJlZ2lzdHJ5IHwgbnVsbDtcbiAgaXNIUU1vZGU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBSZW1vdGVXZWJTb2NrZXRDb25uZWN0aW9uIHtcbiAgd3M6IFdlYlNvY2tldDtcbiAgcmVtb3RlSWQ6IHN0cmluZztcbiAgcmVtb3RlTmFtZTogc3RyaW5nO1xuICBzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPjtcbn1cblxuLyoqXG4gKiBBZ2dyZWdhdGVzIGFuZCBkaXN0cmlidXRlcyB0ZXJtaW5hbCBidWZmZXIgdXBkYXRlcyBhY3Jvc3MgbG9jYWwgYW5kIHJlbW90ZSBzZXNzaW9ucy5cbiAqXG4gKiBUaGUgQnVmZmVyQWdncmVnYXRvciBhY3RzIGFzIGEgY2VudHJhbCBodWIgZm9yIFdlYlNvY2tldC1iYXNlZCB0ZXJtaW5hbCBidWZmZXIgc3RyZWFtaW5nLFxuICogbWFuYWdpbmcgY29ubmVjdGlvbnMgYmV0d2VlbiBjbGllbnRzIGFuZCB0ZXJtaW5hbCBzZXNzaW9ucy4gSW4gSFEgKGhlYWRxdWFydGVycykgbW9kZSxcbiAqIGl0IGFsc28gaGFuZGxlcyBjb25uZWN0aW9ucyB0byByZW1vdGUgVmliZVR1bm5lbCBzZXJ2ZXJzLCBlbmFibGluZyBjcm9zcy1zZXJ2ZXIgdGVybWluYWxcbiAqIHNlc3Npb24gYWNjZXNzLlxuICpcbiAqIEtleSBmZWF0dXJlczpcbiAqIC0gV2ViU29ja2V0LWJhc2VkIHJlYWwtdGltZSBidWZmZXIgc3RyZWFtaW5nXG4gKiAtIFN1cHBvcnQgZm9yIGJvdGggbG9jYWwgYW5kIHJlbW90ZSB0ZXJtaW5hbCBzZXNzaW9uc1xuICogLSBFZmZpY2llbnQgYmluYXJ5IHByb3RvY29sIGZvciBidWZmZXIgdXBkYXRlc1xuICogLSBBdXRvbWF0aWMgY29ubmVjdGlvbiBtYW5hZ2VtZW50IGFuZCByZWNvbm5lY3Rpb25cbiAqIC0gU2Vzc2lvbiBzdWJzY3JpcHRpb24vdW5zdWJzY3JpcHRpb24gaGFuZGxpbmdcbiAqIC0gUmVtb3RlIHNlcnZlciBjb25uZWN0aW9uIHBvb2xpbmcgaW4gSFEgbW9kZVxuICogLSBHcmFjZWZ1bCBjbGVhbnVwIG9uIGRpc2Nvbm5lY3Rpb25cbiAqXG4gKiBUaGUgYWdncmVnYXRvciB1c2VzIGEgYmluYXJ5IHByb3RvY29sIGZvciBidWZmZXIgdXBkYXRlczpcbiAqIC0gTWFnaWMgYnl0ZSAoMHhCRikgdG8gaWRlbnRpZnkgYmluYXJ5IG1lc3NhZ2VzXG4gKiAtIDQtYnl0ZSBzZXNzaW9uIElEIGxlbmd0aCAobGl0dGxlLWVuZGlhbilcbiAqIC0gVVRGLTggZW5jb2RlZCBzZXNzaW9uIElEXG4gKiAtIEJpbmFyeSB0ZXJtaW5hbCBidWZmZXIgZGF0YVxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgYWdncmVnYXRvciBmb3IgbG9jYWwtb25seSBtb2RlXG4gKiBjb25zdCBhZ2dyZWdhdG9yID0gbmV3IEJ1ZmZlckFnZ3JlZ2F0b3Ioe1xuICogICB0ZXJtaW5hbE1hbmFnZXIsXG4gKiAgIHJlbW90ZVJlZ2lzdHJ5OiBudWxsLFxuICogICBpc0hRTW9kZTogZmFsc2VcbiAqIH0pO1xuICpcbiAqIC8vIEhhbmRsZSBjbGllbnQgV2ViU29ja2V0IGNvbm5lY3Rpb25cbiAqIHdzcy5vbignY29ubmVjdGlvbicsICh3cykgPT4ge1xuICogICBhZ2dyZWdhdG9yLmhhbmRsZUNsaWVudENvbm5lY3Rpb24od3MpO1xuICogfSk7XG4gKlxuICogLy8gSW4gSFEgbW9kZSB3aXRoIHJlbW90ZSByZWdpc3RyeVxuICogY29uc3QgaHFBZ2dyZWdhdG9yID0gbmV3IEJ1ZmZlckFnZ3JlZ2F0b3Ioe1xuICogICB0ZXJtaW5hbE1hbmFnZXIsXG4gKiAgIHJlbW90ZVJlZ2lzdHJ5LFxuICogICBpc0hRTW9kZTogdHJ1ZVxuICogfSk7XG4gKlxuICogLy8gUmVnaXN0ZXIgcmVtb3RlIHNlcnZlclxuICogYXdhaXQgaHFBZ2dyZWdhdG9yLm9uUmVtb3RlUmVnaXN0ZXJlZChyZW1vdGVJZCk7XG4gKiBgYGBcbiAqXG4gKiBAc2VlIFRlcm1pbmFsTWFuYWdlciAtIE1hbmFnZXMgbG9jYWwgdGVybWluYWwgaW5zdGFuY2VzXG4gKiBAc2VlIFJlbW90ZVJlZ2lzdHJ5IC0gVHJhY2tzIHJlbW90ZSBWaWJlVHVubmVsIHNlcnZlcnMgaW4gSFEgbW9kZVxuICogQHNlZSB3ZWIvc3JjL3NlcnZlci9yb3V0ZXMvYnVmZmVyLnRzIC0gV2ViU29ja2V0IGVuZHBvaW50IHNldHVwXG4gKi9cbmV4cG9ydCBjbGFzcyBCdWZmZXJBZ2dyZWdhdG9yIHtcbiAgcHJpdmF0ZSBjb25maWc6IEJ1ZmZlckFnZ3JlZ2F0b3JDb25maWc7XG4gIHByaXZhdGUgcmVtb3RlQ29ubmVjdGlvbnM6IE1hcDxzdHJpbmcsIFJlbW90ZVdlYlNvY2tldENvbm5lY3Rpb24+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIGNsaWVudFN1YnNjcmlwdGlvbnM6IE1hcDxXZWJTb2NrZXQsIE1hcDxzdHJpbmcsICgpID0+IHZvaWQ+PiA9IG5ldyBNYXAoKTtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IEJ1ZmZlckFnZ3JlZ2F0b3JDb25maWcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICBsb2dnZXIubG9nKGBCdWZmZXJBZ2dyZWdhdG9yIGluaXRpYWxpemVkIChIUSBtb2RlOiAke2NvbmZpZy5pc0hRTW9kZX0pYCk7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGEgbmV3IGNsaWVudCBXZWJTb2NrZXQgY29ubmVjdGlvblxuICAgKi9cbiAgYXN5bmMgaGFuZGxlQ2xpZW50Q29ubmVjdGlvbih3czogV2ViU29ja2V0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ibHVlKCdOZXcgY2xpZW50IGNvbm5lY3RlZCcpKTtcbiAgICBjb25zdCBjbGllbnRJZCA9IGBjbGllbnQtJHtEYXRlLm5vdygpfWA7XG4gICAgbG9nZ2VyLmRlYnVnKGBBc3NpZ25lZCBjbGllbnQgSUQ6ICR7Y2xpZW50SWR9YCk7XG5cbiAgICAvLyBJbml0aWFsaXplIHN1YnNjcmlwdGlvbiBtYXAgZm9yIHRoaXMgY2xpZW50XG4gICAgdGhpcy5jbGllbnRTdWJzY3JpcHRpb25zLnNldCh3cywgbmV3IE1hcCgpKTtcblxuICAgIC8vIFNlbmQgd2VsY29tZSBtZXNzYWdlXG4gICAgd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdjb25uZWN0ZWQnLCB2ZXJzaW9uOiAnMS4wJyB9KSk7XG4gICAgbG9nZ2VyLmRlYnVnKCdTZW50IHdlbGNvbWUgbWVzc2FnZSB0byBjbGllbnQnKTtcblxuICAgIC8vIEhhbmRsZSBtZXNzYWdlcyBmcm9tIGNsaWVudFxuICAgIHdzLm9uKCdtZXNzYWdlJywgYXN5bmMgKG1lc3NhZ2U6IEJ1ZmZlcikgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UobWVzc2FnZS50b1N0cmluZygpKTtcbiAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVDbGllbnRNZXNzYWdlKHdzLCBkYXRhKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgaGFuZGxpbmcgY2xpZW50IG1lc3NhZ2U6JywgZXJyb3IpO1xuICAgICAgICB3cy5zZW5kKFxuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgIHR5cGU6ICdlcnJvcicsXG4gICAgICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCBtZXNzYWdlIGZvcm1hdCcsXG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBkaXNjb25uZWN0aW9uXG4gICAgd3Mub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgdGhpcy5oYW5kbGVDbGllbnREaXNjb25uZWN0KHdzKTtcbiAgICB9KTtcblxuICAgIHdzLm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgbG9nZ2VyLmVycm9yKCdDbGllbnQgV2ViU29ja2V0IGVycm9yOicsIGVycm9yKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgbWVzc2FnZXMgZnJvbSBhIGNsaWVudFxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVDbGllbnRNZXNzYWdlKFxuICAgIGNsaWVudFdzOiBXZWJTb2NrZXQsXG4gICAgZGF0YTogeyB0eXBlOiBzdHJpbmc7IHNlc3Npb25JZD86IHN0cmluZyB9XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbnMgPSB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMuZ2V0KGNsaWVudFdzKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbnMpIHJldHVybjtcblxuICAgIGlmIChkYXRhLnR5cGUgPT09ICdzdWJzY3JpYmUnICYmIGRhdGEuc2Vzc2lvbklkKSB7XG4gICAgICBjb25zdCBzZXNzaW9uSWQgPSBkYXRhLnNlc3Npb25JZDtcblxuICAgICAgLy8gVW5zdWJzY3JpYmUgaWYgYWxyZWFkeSBzdWJzY3JpYmVkXG4gICAgICBpZiAoc3Vic2NyaXB0aW9ucy5oYXMoc2Vzc2lvbklkKSkge1xuICAgICAgICBjb25zdCBleGlzdGluZ1Vuc3Vic2NyaWJlID0gc3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nVW5zdWJzY3JpYmUpIHtcbiAgICAgICAgICBleGlzdGluZ1Vuc3Vic2NyaWJlKCk7XG4gICAgICAgIH1cbiAgICAgICAgc3Vic2NyaXB0aW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGxvY2FsIG9yIHJlbW90ZSBzZXNzaW9uXG4gICAgICBjb25zdCBpc1JlbW90ZVNlc3Npb24gPVxuICAgICAgICB0aGlzLmNvbmZpZy5pc0hRTW9kZSAmJlxuICAgICAgICB0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeSAmJlxuICAgICAgICB0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuXG4gICAgICBpZiAoaXNSZW1vdGVTZXNzaW9uKSB7XG4gICAgICAgIC8vIFN1YnNjcmliZSB0byByZW1vdGUgc2Vzc2lvblxuICAgICAgICBsb2dnZXIuZGVidWcoYFN1YnNjcmliaW5nIHRvIHJlbW90ZSBzZXNzaW9uICR7c2Vzc2lvbklkfSBvbiByZW1vdGUgJHtpc1JlbW90ZVNlc3Npb24uaWR9YCk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3Vic2NyaWJlVG9SZW1vdGVTZXNzaW9uKGNsaWVudFdzLCBzZXNzaW9uSWQsIGlzUmVtb3RlU2Vzc2lvbi5pZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBTdWJzY3JpYmUgdG8gbG9jYWwgc2Vzc2lvblxuICAgICAgICBsb2dnZXIuZGVidWcoYFN1YnNjcmliaW5nIHRvIGxvY2FsIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgIGF3YWl0IHRoaXMuc3Vic2NyaWJlVG9Mb2NhbFNlc3Npb24oY2xpZW50V3MsIHNlc3Npb25JZCk7XG4gICAgICB9XG5cbiAgICAgIGNsaWVudFdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnc3Vic2NyaWJlZCcsIHNlc3Npb25JZCB9KSk7XG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKGBDbGllbnQgc3Vic2NyaWJlZCB0byBzZXNzaW9uICR7c2Vzc2lvbklkfWApKTtcbiAgICB9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gJ3Vuc3Vic2NyaWJlJyAmJiBkYXRhLnNlc3Npb25JZCkge1xuICAgICAgY29uc3Qgc2Vzc2lvbklkID0gZGF0YS5zZXNzaW9uSWQ7XG4gICAgICBjb25zdCB1bnN1YnNjcmliZSA9IHN1YnNjcmlwdGlvbnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgICBpZiAodW5zdWJzY3JpYmUpIHtcbiAgICAgICAgdW5zdWJzY3JpYmUoKTtcbiAgICAgICAgc3Vic2NyaXB0aW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYENsaWVudCB1bnN1YnNjcmliZWQgZnJvbSBzZXNzaW9uICR7c2Vzc2lvbklkfWApKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWxzbyB1bnN1YnNjcmliZSBmcm9tIHJlbW90ZSBpZiBhcHBsaWNhYmxlXG4gICAgICBpZiAodGhpcy5jb25maWcuaXNIUU1vZGUgJiYgdGhpcy5jb25maWcucmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gdGhpcy5jb25maWcucmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIGNvbnN0IHJlbW90ZUNvbm4gPSB0aGlzLnJlbW90ZUNvbm5lY3Rpb25zLmdldChyZW1vdGUuaWQpO1xuICAgICAgICAgIGlmIChyZW1vdGVDb25uKSB7XG4gICAgICAgICAgICByZW1vdGVDb25uLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgICAgICAgICBpZiAocmVtb3RlQ29ubi53cy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgICAgICAgICByZW1vdGVDb25uLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAndW5zdWJzY3JpYmUnLCBzZXNzaW9uSWQgfSkpO1xuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgICAgYFNlbnQgdW5zdWJzY3JpYmUgcmVxdWVzdCB0byByZW1vdGUgJHtyZW1vdGVDb25uLnJlbW90ZU5hbWV9IGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgICAgICBgQ2Fubm90IHVuc3Vic2NyaWJlIGZyb20gcmVtb3RlICR7cmVtb3RlQ29ubi5yZW1vdGVOYW1lfSAtIFdlYlNvY2tldCBub3Qgb3BlbmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGRhdGEudHlwZSA9PT0gJ3BpbmcnKSB7XG4gICAgICBjbGllbnRXcy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3BvbmcnLCB0aW1lc3RhbXA6IERhdGUubm93KCkgfSkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzY3JpYmUgYSBjbGllbnQgdG8gYSBsb2NhbCBzZXNzaW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHN1YnNjcmliZVRvTG9jYWxTZXNzaW9uKGNsaWVudFdzOiBXZWJTb2NrZXQsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IHRoaXMuY2xpZW50U3Vic2NyaXB0aW9ucy5nZXQoY2xpZW50V3MpO1xuICAgIGlmICghc3Vic2NyaXB0aW9ucykgcmV0dXJuO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVuc3Vic2NyaWJlID0gYXdhaXQgdGhpcy5jb25maWcudGVybWluYWxNYW5hZ2VyLnN1YnNjcmliZVRvQnVmZmVyQ2hhbmdlcyhcbiAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAoc2Vzc2lvbklkOiBzdHJpbmcsIHNuYXBzaG90OiBQYXJhbWV0ZXJzPFRlcm1pbmFsTWFuYWdlclsnZW5jb2RlU25hcHNob3QnXT5bMF0pID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5jb25maWcudGVybWluYWxNYW5hZ2VyLmVuY29kZVNuYXBzaG90KHNuYXBzaG90KTtcbiAgICAgICAgICAgIGNvbnN0IHNlc3Npb25JZEJ1ZmZlciA9IEJ1ZmZlci5mcm9tKHNlc3Npb25JZCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gMSArIDQgKyBzZXNzaW9uSWRCdWZmZXIubGVuZ3RoICsgYnVmZmVyLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnN0IGZ1bGxCdWZmZXIgPSBCdWZmZXIuYWxsb2NVbnNhZmUodG90YWxMZW5ndGgpO1xuXG4gICAgICAgICAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICAgICAgICAgIGZ1bGxCdWZmZXIud3JpdGVVSW50OCgweGJmLCBvZmZzZXQpOyAvLyBNYWdpYyBieXRlIGZvciBiaW5hcnkgbWVzc2FnZVxuICAgICAgICAgICAgb2Zmc2V0ICs9IDE7XG5cbiAgICAgICAgICAgIGZ1bGxCdWZmZXIud3JpdGVVSW50MzJMRShzZXNzaW9uSWRCdWZmZXIubGVuZ3RoLCBvZmZzZXQpO1xuICAgICAgICAgICAgb2Zmc2V0ICs9IDQ7XG5cbiAgICAgICAgICAgIHNlc3Npb25JZEJ1ZmZlci5jb3B5KGZ1bGxCdWZmZXIsIG9mZnNldCk7XG4gICAgICAgICAgICBvZmZzZXQgKz0gc2Vzc2lvbklkQnVmZmVyLmxlbmd0aDtcblxuICAgICAgICAgICAgYnVmZmVyLmNvcHkoZnVsbEJ1ZmZlciwgb2Zmc2V0KTtcblxuICAgICAgICAgICAgaWYgKGNsaWVudFdzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgICAgICAgIGNsaWVudFdzLnNlbmQoZnVsbEJ1ZmZlcik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBsb2dnZXIuZGVidWcoYFNraXBwaW5nIGJ1ZmZlciB1cGRhdGUgLSBjbGllbnQgV2ViU29ja2V0IG5vdCBvcGVuYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZW5jb2RpbmcgYnVmZmVyIHVwZGF0ZTonLCBlcnJvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBzdWJzY3JpcHRpb25zLnNldChzZXNzaW9uSWQsIHVuc3Vic2NyaWJlKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ3JlYXRlZCBzdWJzY3JpcHRpb24gZm9yIGxvY2FsIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cbiAgICAgIC8vIFNlbmQgaW5pdGlhbCBidWZmZXJcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgU2VuZGluZyBpbml0aWFsIGJ1ZmZlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcbiAgICAgIGNvbnN0IGluaXRpYWxTbmFwc2hvdCA9IGF3YWl0IHRoaXMuY29uZmlnLnRlcm1pbmFsTWFuYWdlci5nZXRCdWZmZXJTbmFwc2hvdChzZXNzaW9uSWQpO1xuICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5jb25maWcudGVybWluYWxNYW5hZ2VyLmVuY29kZVNuYXBzaG90KGluaXRpYWxTbmFwc2hvdCk7XG5cbiAgICAgIGNvbnN0IHNlc3Npb25JZEJ1ZmZlciA9IEJ1ZmZlci5mcm9tKHNlc3Npb25JZCwgJ3V0ZjgnKTtcbiAgICAgIGNvbnN0IHRvdGFsTGVuZ3RoID0gMSArIDQgKyBzZXNzaW9uSWRCdWZmZXIubGVuZ3RoICsgYnVmZmVyLmxlbmd0aDtcbiAgICAgIGNvbnN0IGZ1bGxCdWZmZXIgPSBCdWZmZXIuYWxsb2NVbnNhZmUodG90YWxMZW5ndGgpO1xuXG4gICAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICAgIGZ1bGxCdWZmZXIud3JpdGVVSW50OCgweGJmLCBvZmZzZXQpO1xuICAgICAgb2Zmc2V0ICs9IDE7XG5cbiAgICAgIGZ1bGxCdWZmZXIud3JpdGVVSW50MzJMRShzZXNzaW9uSWRCdWZmZXIubGVuZ3RoLCBvZmZzZXQpO1xuICAgICAgb2Zmc2V0ICs9IDQ7XG5cbiAgICAgIHNlc3Npb25JZEJ1ZmZlci5jb3B5KGZ1bGxCdWZmZXIsIG9mZnNldCk7XG4gICAgICBvZmZzZXQgKz0gc2Vzc2lvbklkQnVmZmVyLmxlbmd0aDtcblxuICAgICAgYnVmZmVyLmNvcHkoZnVsbEJ1ZmZlciwgb2Zmc2V0KTtcblxuICAgICAgaWYgKGNsaWVudFdzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgIGNsaWVudFdzLnNlbmQoZnVsbEJ1ZmZlcik7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgU2VudCBpbml0aWFsIGJ1ZmZlciAoJHtmdWxsQnVmZmVyLmxlbmd0aH0gYnl0ZXMpIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYENhbm5vdCBzZW5kIGluaXRpYWwgYnVmZmVyIC0gY2xpZW50IFdlYlNvY2tldCBub3Qgb3BlbmApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEVycm9yIHN1YnNjcmliaW5nIHRvIGxvY2FsIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICAgIGNsaWVudFdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnZXJyb3InLCBtZXNzYWdlOiAnRmFpbGVkIHRvIHN1YnNjcmliZSB0byBzZXNzaW9uJyB9KSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN1YnNjcmliZSBhIGNsaWVudCB0byBhIHJlbW90ZSBzZXNzaW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHN1YnNjcmliZVRvUmVtb3RlU2Vzc2lvbihcbiAgICBjbGllbnRXczogV2ViU29ja2V0LFxuICAgIHNlc3Npb25JZDogc3RyaW5nLFxuICAgIHJlbW90ZUlkOiBzdHJpbmdcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gRW5zdXJlIHdlIGhhdmUgYSBjb25uZWN0aW9uIHRvIHRoaXMgcmVtb3RlXG4gICAgbGV0IHJlbW90ZUNvbm4gPSB0aGlzLnJlbW90ZUNvbm5lY3Rpb25zLmdldChyZW1vdGVJZCk7XG4gICAgaWYgKCFyZW1vdGVDb25uIHx8IHJlbW90ZUNvbm4ud3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgTm8gYWN0aXZlIGNvbm5lY3Rpb24gdG8gcmVtb3RlICR7cmVtb3RlSWR9LCBlc3RhYmxpc2hpbmcgbmV3IGNvbm5lY3Rpb25gKTtcbiAgICAgIC8vIE5lZWQgdG8gY29ubmVjdCB0byByZW1vdGVcbiAgICAgIGNvbnN0IGNvbm5lY3RlZCA9IGF3YWl0IHRoaXMuY29ubmVjdFRvUmVtb3RlKHJlbW90ZUlkKTtcbiAgICAgIGlmICghY29ubmVjdGVkKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBGYWlsZWQgdG8gY29ubmVjdCB0byByZW1vdGUgJHtyZW1vdGVJZH0gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgIGNsaWVudFdzLnNlbmQoXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnZXJyb3InLCBtZXNzYWdlOiAnRmFpbGVkIHRvIGNvbm5lY3QgdG8gcmVtb3RlIHNlcnZlcicgfSlcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmVtb3RlQ29ubiA9IHRoaXMucmVtb3RlQ29ubmVjdGlvbnMuZ2V0KHJlbW90ZUlkKTtcbiAgICB9XG5cbiAgICBpZiAoIXJlbW90ZUNvbm4pIHJldHVybjtcblxuICAgIC8vIFN1YnNjcmliZSB0byB0aGUgc2Vzc2lvbiBvbiB0aGUgcmVtb3RlXG4gICAgcmVtb3RlQ29ubi5zdWJzY3JpcHRpb25zLmFkZChzZXNzaW9uSWQpO1xuICAgIHJlbW90ZUNvbm4ud3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzdWJzY3JpYmUnLCBzZXNzaW9uSWQgfSkpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBTZW50IHN1YnNjcmlwdGlvbiByZXF1ZXN0IHRvIHJlbW90ZSAke3JlbW90ZUNvbm4ucmVtb3RlTmFtZX0gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YFxuICAgICk7XG5cbiAgICAvLyBTdG9yZSBhbiB1bnN1YnNjcmliZSBmdW5jdGlvbiBmb3IgdGhlIGNsaWVudFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbnMgPSB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMuZ2V0KGNsaWVudFdzKTtcbiAgICBpZiAoc3Vic2NyaXB0aW9ucykge1xuICAgICAgc3Vic2NyaXB0aW9ucy5zZXQoc2Vzc2lvbklkLCAoKSA9PiB7XG4gICAgICAgIC8vIFdpbGwgYmUgaGFuZGxlZCBpbiB0aGUgdW5zdWJzY3JpYmUgbWVzc2FnZSBoYW5kbGVyXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ29ubmVjdCB0byBhIHJlbW90ZSBzZXJ2ZXIncyBXZWJTb2NrZXRcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgY29ubmVjdFRvUmVtb3RlKHJlbW90ZUlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsb2dnZXIubG9nKGBDb25uZWN0aW5nIHRvIHJlbW90ZSAke3JlbW90ZUlkfWApO1xuXG4gICAgaWYgKCF0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeSkge1xuICAgICAgbG9nZ2VyLndhcm4oJ05vIHJlbW90ZSByZWdpc3RyeSBhdmFpbGFibGUnKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCByZW1vdGUgPSB0aGlzLmNvbmZpZy5yZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGUocmVtb3RlSWQpO1xuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBsb2dnZXIud2FybihgUmVtb3RlICR7cmVtb3RlSWR9IG5vdCBmb3VuZCBpbiByZWdpc3RyeWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAvLyBDb252ZXJ0IEhUVFAgVVJMIHRvIFdlYlNvY2tldCBVUkwgYW5kIGFkZCAvYnVmZmVycyBwYXRoXG4gICAgICBjb25zdCB3c1VybCA9IGAke3JlbW90ZS51cmwucmVwbGFjZSgvXmh0dHAvLCAnd3MnKX0vYnVmZmVyc2A7XG4gICAgICBjb25zdCB3cyA9IG5ldyBXZWJTb2NrZXQod3NVcmwsIHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBsb2dnZXIuZGVidWcoYEF0dGVtcHRpbmcgV2ViU29ja2V0IGNvbm5lY3Rpb24gdG8gJHt3c1VybH1gKTtcblxuICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oYENvbm5lY3Rpb24gdG8gcmVtb3RlICR7cmVtb3RlLm5hbWV9IHRpbWVkIG91dCBhZnRlciA1c2ApO1xuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gdGltZW91dCcpKTtcbiAgICAgICAgfSwgNTAwMCk7XG5cbiAgICAgICAgd3Mub24oJ29wZW4nLCAoKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgd3Mub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUNvbm46IFJlbW90ZVdlYlNvY2tldENvbm5lY3Rpb24gPSB7XG4gICAgICAgIHdzLFxuICAgICAgICByZW1vdGVJZDogcmVtb3RlLmlkLFxuICAgICAgICByZW1vdGVOYW1lOiByZW1vdGUubmFtZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogbmV3IFNldCgpLFxuICAgICAgfTtcblxuICAgICAgdGhpcy5yZW1vdGVDb25uZWN0aW9ucy5zZXQocmVtb3RlSWQsIHJlbW90ZUNvbm4pO1xuXG4gICAgICAvLyBIYW5kbGUgbWVzc2FnZXMgZnJvbSByZW1vdGVcbiAgICAgIHdzLm9uKCdtZXNzYWdlJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuICAgICAgICB0aGlzLmhhbmRsZVJlbW90ZU1lc3NhZ2UocmVtb3RlSWQsIGRhdGEpO1xuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYFJlbW90ZSAke3JlbW90ZS5uYW1lfSBjb25uZWN0aW9uIGVzdGFibGlzaGVkIHdpdGggJHtyZW1vdGVDb25uLnN1YnNjcmlwdGlvbnMuc2l6ZX0gaW5pdGlhbCBzdWJzY3JpcHRpb25zYFxuICAgICAgKTtcblxuICAgICAgLy8gSGFuZGxlIGRpc2Nvbm5lY3Rpb25cbiAgICAgIHdzLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYERpc2Nvbm5lY3RlZCBmcm9tIHJlbW90ZSAke3JlbW90ZS5uYW1lfWApKTtcbiAgICAgICAgdGhpcy5yZW1vdGVDb25uZWN0aW9ucy5kZWxldGUocmVtb3RlSWQpO1xuICAgICAgfSk7XG5cbiAgICAgIHdzLm9uKCdlcnJvcicsIChlcnJvcikgPT4ge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYFJlbW90ZSAke3JlbW90ZS5uYW1lfSBXZWJTb2NrZXQgZXJyb3I6YCwgZXJyb3IpO1xuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYENvbm5lY3RlZCB0byByZW1vdGUgJHtyZW1vdGUubmFtZX1gKSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gY29ubmVjdCB0byByZW1vdGUgJHtyZW1vdGVJZH06YCwgZXJyb3IpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgbWVzc2FnZXMgZnJvbSBhIHJlbW90ZSBzZXJ2ZXJcbiAgICovXG4gIHByaXZhdGUgaGFuZGxlUmVtb3RlTWVzc2FnZShyZW1vdGVJZDogc3RyaW5nLCBkYXRhOiBCdWZmZXIpOiB2b2lkIHtcbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgYmluYXJ5IGJ1ZmZlciB1cGRhdGVcbiAgICBpZiAoZGF0YS5sZW5ndGggPiAwICYmIGRhdGFbMF0gPT09IDB4YmYpIHtcbiAgICAgIC8vIEZvcndhcmQgdG8gYWxsIGNsaWVudHMgc3Vic2NyaWJlZCB0byBzZXNzaW9ucyBmcm9tIHRoaXMgcmVtb3RlXG4gICAgICB0aGlzLmZvcndhcmRCdWZmZXJUb0NsaWVudHMoZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEpTT04gbWVzc2FnZVxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IEpTT04ucGFyc2UoZGF0YS50b1N0cmluZygpKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBSZW1vdGUgJHtyZW1vdGVJZH0gbWVzc2FnZTpgLCBtZXNzYWdlLnR5cGUpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcGFyc2UgcmVtb3RlIG1lc3NhZ2U6YCwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBGb3J3YXJkIGEgYnVmZmVyIHVwZGF0ZSB0byBhbGwgc3Vic2NyaWJlZCBjbGllbnRzXG4gICAqL1xuICBwcml2YXRlIGZvcndhcmRCdWZmZXJUb0NsaWVudHMoYnVmZmVyOiBCdWZmZXIpOiB2b2lkIHtcbiAgICAvLyBFeHRyYWN0IHNlc3Npb24gSUQgZnJvbSBidWZmZXJcbiAgICBpZiAoYnVmZmVyLmxlbmd0aCA8IDUpIHJldHVybjtcblxuICAgIGNvbnN0IHNlc3Npb25JZExlbmd0aCA9IGJ1ZmZlci5yZWFkVUludDMyTEUoMSk7XG4gICAgaWYgKGJ1ZmZlci5sZW5ndGggPCA1ICsgc2Vzc2lvbklkTGVuZ3RoKSByZXR1cm47XG5cbiAgICBjb25zdCBzZXNzaW9uSWQgPSBidWZmZXIuc3ViYXJyYXkoNSwgNSArIHNlc3Npb25JZExlbmd0aCkudG9TdHJpbmcoJ3V0ZjgnKTtcblxuICAgIC8vIEZvcndhcmQgdG8gYWxsIGNsaWVudHMgc3Vic2NyaWJlZCB0byB0aGlzIHNlc3Npb25cbiAgICBsZXQgZm9yd2FyZGVkQ291bnQgPSAwO1xuICAgIGZvciAoY29uc3QgW2NsaWVudFdzLCBzdWJzY3JpcHRpb25zXSBvZiB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMpIHtcbiAgICAgIGlmIChzdWJzY3JpcHRpb25zLmhhcyhzZXNzaW9uSWQpICYmIGNsaWVudFdzLnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG4gICAgICAgIGNsaWVudFdzLnNlbmQoYnVmZmVyKTtcbiAgICAgICAgZm9yd2FyZGVkQ291bnQrKztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZm9yd2FyZGVkQ291bnQgPiAwKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYEZvcndhcmRlZCBidWZmZXIgdXBkYXRlIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSB0byAke2ZvcndhcmRlZENvdW50fSBjbGllbnRzYCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBjbGllbnQgZGlzY29ubmVjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVDbGllbnREaXNjb25uZWN0KHdzOiBXZWJTb2NrZXQpOiB2b2lkIHtcbiAgICBjb25zdCBzdWJzY3JpcHRpb25zID0gdGhpcy5jbGllbnRTdWJzY3JpcHRpb25zLmdldCh3cyk7XG4gICAgaWYgKHN1YnNjcmlwdGlvbnMpIHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkNvdW50ID0gc3Vic2NyaXB0aW9ucy5zaXplO1xuICAgICAgLy8gVW5zdWJzY3JpYmUgZnJvbSBhbGwgc2Vzc2lvbnNcbiAgICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgdW5zdWJzY3JpYmVdIG9mIHN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBDbGVhbmluZyB1cCBzdWJzY3JpcHRpb24gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgIHVuc3Vic2NyaWJlKCk7XG4gICAgICB9XG4gICAgICBzdWJzY3JpcHRpb25zLmNsZWFyKCk7XG4gICAgICBsb2dnZXIuZGVidWcoYENsZWFuZWQgdXAgJHtzdWJzY3JpcHRpb25Db3VudH0gc3Vic2NyaXB0aW9uc2ApO1xuICAgIH1cbiAgICB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMuZGVsZXRlKHdzKTtcbiAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdygnQ2xpZW50IGRpc2Nvbm5lY3RlZCcpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBhIG5ldyByZW1vdGUgc2VydmVyIChjYWxsZWQgd2hlbiBhIHJlbW90ZSByZWdpc3RlcnMgd2l0aCBIUSlcbiAgICovXG4gIGFzeW5jIG9uUmVtb3RlUmVnaXN0ZXJlZChyZW1vdGVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbG9nZ2VyLmxvZyhgUmVtb3RlICR7cmVtb3RlSWR9IHJlZ2lzdGVyZWQsIGVzdGFibGlzaGluZyBjb25uZWN0aW9uYCk7XG4gICAgLy8gT3B0aW9uYWxseSBwcmUtY29ubmVjdCB0byB0aGUgcmVtb3RlXG4gICAgY29uc3QgY29ubmVjdGVkID0gYXdhaXQgdGhpcy5jb25uZWN0VG9SZW1vdGUocmVtb3RlSWQpO1xuICAgIGlmICghY29ubmVjdGVkKSB7XG4gICAgICBsb2dnZXIud2FybihgRmFpbGVkIHRvIGVzdGFibGlzaCBjb25uZWN0aW9uIHRvIG5ld2x5IHJlZ2lzdGVyZWQgcmVtb3RlICR7cmVtb3RlSWR9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSByZW1vdGUgc2VydmVyIHVucmVnaXN0cmF0aW9uXG4gICAqL1xuICBvblJlbW90ZVVucmVnaXN0ZXJlZChyZW1vdGVJZDogc3RyaW5nKTogdm9pZCB7XG4gICAgbG9nZ2VyLmxvZyhgUmVtb3RlICR7cmVtb3RlSWR9IHVucmVnaXN0ZXJlZCwgY2xvc2luZyBjb25uZWN0aW9uYCk7XG4gICAgY29uc3QgcmVtb3RlQ29ubiA9IHRoaXMucmVtb3RlQ29ubmVjdGlvbnMuZ2V0KHJlbW90ZUlkKTtcbiAgICBpZiAocmVtb3RlQ29ubikge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgQ2xvc2luZyBjb25uZWN0aW9uIHRvIHJlbW90ZSAke3JlbW90ZUNvbm4ucmVtb3RlTmFtZX0gd2l0aCAke3JlbW90ZUNvbm4uc3Vic2NyaXB0aW9ucy5zaXplfSBhY3RpdmUgc3Vic2NyaXB0aW9uc2BcbiAgICAgICk7XG4gICAgICByZW1vdGVDb25uLndzLmNsb3NlKCk7XG4gICAgICB0aGlzLnJlbW90ZUNvbm5lY3Rpb25zLmRlbGV0ZShyZW1vdGVJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgTm8gYWN0aXZlIGNvbm5lY3Rpb24gZm91bmQgZm9yIHVucmVnaXN0ZXJlZCByZW1vdGUgJHtyZW1vdGVJZH1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xlYW4gdXAgYWxsIGNvbm5lY3Rpb25zXG4gICAqL1xuICBkZXN0cm95KCk6IHZvaWQge1xuICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KCdTaHV0dGluZyBkb3duIEJ1ZmZlckFnZ3JlZ2F0b3InKSk7XG5cbiAgICAvLyBDbG9zZSBhbGwgY2xpZW50IGNvbm5lY3Rpb25zXG4gICAgY29uc3QgY2xpZW50Q291bnQgPSB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMuc2l6ZTtcbiAgICBmb3IgKGNvbnN0IFt3c10gb2YgdGhpcy5jbGllbnRTdWJzY3JpcHRpb25zKSB7XG4gICAgICB3cy5jbG9zZSgpO1xuICAgIH1cbiAgICB0aGlzLmNsaWVudFN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcbiAgICBsb2dnZXIuZGVidWcoYENsb3NlZCAke2NsaWVudENvdW50fSBjbGllbnQgY29ubmVjdGlvbnNgKTtcblxuICAgIC8vIENsb3NlIGFsbCByZW1vdGUgY29ubmVjdGlvbnNcbiAgICBjb25zdCByZW1vdGVDb3VudCA9IHRoaXMucmVtb3RlQ29ubmVjdGlvbnMuc2l6ZTtcbiAgICBmb3IgKGNvbnN0IFtfLCByZW1vdGVDb25uXSBvZiB0aGlzLnJlbW90ZUNvbm5lY3Rpb25zKSB7XG4gICAgICByZW1vdGVDb25uLndzLmNsb3NlKCk7XG4gICAgfVxuICAgIHRoaXMucmVtb3RlQ29ubmVjdGlvbnMuY2xlYXIoKTtcbiAgICBsb2dnZXIuZGVidWcoYENsb3NlZCAke3JlbW90ZUNvdW50fSByZW1vdGUgY29ubmVjdGlvbnNgKTtcbiAgfVxufVxuIl19