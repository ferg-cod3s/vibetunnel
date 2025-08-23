/**
 * WebSocket Input Handler for VibeTunnel
 *
 * Handles WebSocket connections for low-latency input transmission.
 * Optimized for speed:
 * - Fire-and-forget input (no ACKs)
 * - Minimal message parsing
 * - Direct PTY forwarding
 */
import type { WebSocket as WSWebSocket } from 'ws';
import type { PtyManager } from '../pty/index.js';
import type { ActivityMonitor } from '../services/activity-monitor.js';
import type { AuthService } from '../services/auth-service.js';
import type { RemoteRegistry } from '../services/remote-registry.js';
import type { TerminalManager } from '../services/terminal-manager.js';
interface WebSocketInputHandlerOptions {
    ptyManager: PtyManager;
    terminalManager: TerminalManager;
    activityMonitor: ActivityMonitor;
    remoteRegistry: RemoteRegistry | null;
    authService: AuthService;
    isHQMode: boolean;
}
/**
 * Handles WebSocket connections for real-time terminal input transmission.
 *
 * Provides ultra-low-latency input handling for terminal sessions with support
 * for both local and remote sessions in HQ mode. Uses a fire-and-forget approach
 * with minimal parsing overhead for maximum performance.
 *
 * Features:
 * - Direct WebSocket-to-PTY input forwarding
 * - Special key detection with null-byte markers
 * - Transparent proxy mode for remote sessions
 * - No acknowledgment overhead (fire-and-forget)
 * - Automatic connection cleanup
 * - Support for all input types (text, special keys)
 *
 * Protocol:
 * - Regular text: sent as-is
 * - Special keys: wrapped in null bytes (e.g., "\x00enter\x00")
 * - Remote mode: raw passthrough without parsing
 *
 * @example
 * ```typescript
 * const handler = new WebSocketInputHandler({
 *   ptyManager,
 *   terminalManager,
 *   activityMonitor,
 *   remoteRegistry,
 *   authService,
 *   isHQMode: true
 * });
 *
 * // Handle incoming WebSocket connection
 * wss.on('connection', (ws, req) => {
 *   const { sessionId, userId } = parseQuery(req.url);
 *   handler.handleConnection(ws, sessionId, userId);
 * });
 * ```
 *
 * @see PtyManager - Handles actual terminal input processing
 * @see RemoteRegistry - Manages remote server connections in HQ mode
 * @see web/src/client/components/session-view/input-manager.ts - Client-side input handling
 */
export declare class WebSocketInputHandler {
    private ptyManager;
    private terminalManager;
    private activityMonitor;
    private remoteRegistry;
    private authService;
    private isHQMode;
    private remoteConnections;
    constructor(options: WebSocketInputHandlerOptions);
    private connectToRemote;
    handleConnection(ws: WSWebSocket, sessionId: string, userId: string): Promise<void>;
}
export {};
