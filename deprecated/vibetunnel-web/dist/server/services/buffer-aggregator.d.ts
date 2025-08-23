import { WebSocket } from 'ws';
import type { RemoteRegistry } from './remote-registry.js';
import type { TerminalManager } from './terminal-manager.js';
interface BufferAggregatorConfig {
    terminalManager: TerminalManager;
    remoteRegistry: RemoteRegistry | null;
    isHQMode: boolean;
}
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
export declare class BufferAggregator {
    private config;
    private remoteConnections;
    private clientSubscriptions;
    constructor(config: BufferAggregatorConfig);
    /**
     * Handle a new client WebSocket connection
     */
    handleClientConnection(ws: WebSocket): Promise<void>;
    /**
     * Handle messages from a client
     */
    private handleClientMessage;
    /**
     * Subscribe a client to a local session
     */
    private subscribeToLocalSession;
    /**
     * Subscribe a client to a remote session
     */
    private subscribeToRemoteSession;
    /**
     * Connect to a remote server's WebSocket
     */
    private connectToRemote;
    /**
     * Handle messages from a remote server
     */
    private handleRemoteMessage;
    /**
     * Forward a buffer update to all subscribed clients
     */
    private forwardBufferToClients;
    /**
     * Handle client disconnection
     */
    private handleClientDisconnect;
    /**
     * Register a new remote server (called when a remote registers with HQ)
     */
    onRemoteRegistered(remoteId: string): Promise<void>;
    /**
     * Handle remote server unregistration
     */
    onRemoteUnregistered(remoteId: string): void;
    /**
     * Clean up all connections
     */
    destroy(): void;
}
export {};
