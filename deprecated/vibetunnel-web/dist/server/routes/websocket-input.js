"use strict";
/**
 * WebSocket Input Handler for VibeTunnel
 *
 * Handles WebSocket connections for low-latency input transmission.
 * Optimized for speed:
 * - Fire-and-forget input (no ACKs)
 * - Minimal message parsing
 * - Direct PTY forwarding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketInputHandler = void 0;
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('websocket-input');
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
class WebSocketInputHandler {
    constructor(options) {
        this.remoteConnections = new Map();
        this.ptyManager = options.ptyManager;
        this.terminalManager = options.terminalManager;
        this.activityMonitor = options.activityMonitor;
        this.remoteRegistry = options.remoteRegistry;
        this.authService = options.authService;
        this.isHQMode = options.isHQMode;
    }
    async connectToRemote(remoteUrl, sessionId, token) {
        const wsUrl = remoteUrl.replace(/^https?:/, (match) => (match === 'https:' ? 'wss:' : 'ws:'));
        const fullUrl = `${wsUrl}/ws/input?sessionId=${sessionId}&token=${encodeURIComponent(token)}`;
        logger.log(`Establishing proxy connection to remote: ${fullUrl}`);
        const remoteWs = new WebSocket(fullUrl);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                remoteWs.close();
                reject(new Error('Remote WebSocket connection timeout'));
            }, 5000);
            remoteWs.addEventListener('open', () => {
                clearTimeout(timeout);
                logger.log(`Remote WebSocket proxy established for session ${sessionId}`);
                resolve(remoteWs);
            });
            remoteWs.addEventListener('error', (error) => {
                clearTimeout(timeout);
                logger.error(`Remote WebSocket error for session ${sessionId}:`, error);
                reject(error);
            });
        });
    }
    async handleConnection(ws, sessionId, userId) {
        logger.log(`WebSocket input connection established for session ${sessionId}, user ${userId}`);
        // Check if this is a remote session in HQ mode
        let remoteWs = null;
        if (this.isHQMode && this.remoteRegistry) {
            const remote = this.remoteRegistry.getRemoteBySessionId(sessionId);
            if (remote) {
                logger.log(`Session ${sessionId} is on remote ${remote.name}, establishing proxy connection`);
                try {
                    remoteWs = await this.connectToRemote(remote.url, sessionId, remote.token);
                    this.remoteConnections.set(sessionId, remoteWs);
                    // Set up remote connection error handling
                    remoteWs.addEventListener('close', () => {
                        logger.log(`Remote WebSocket closed for session ${sessionId}`);
                        this.remoteConnections.delete(sessionId);
                        ws.close(); // Close client connection when remote closes
                    });
                    remoteWs.addEventListener('error', (error) => {
                        logger.error(`Remote WebSocket error for session ${sessionId}:`, error);
                        this.remoteConnections.delete(sessionId);
                        ws.close(); // Close client connection on remote error
                    });
                }
                catch (error) {
                    logger.error(`Failed to establish proxy connection to remote for session ${sessionId}:`, error);
                    ws.close();
                    return;
                }
            }
        }
        ws.on('message', (data) => {
            try {
                // If we have a remote connection, just forward the raw data
                if (remoteWs && remoteWs.readyState === WebSocket.OPEN) {
                    // Convert ws library's RawData to something native WebSocket can send
                    if (data instanceof Buffer) {
                        remoteWs.send(data);
                    }
                    else if (Array.isArray(data)) {
                        // Concatenate buffer array
                        remoteWs.send(Buffer.concat(data));
                    }
                    else {
                        // ArrayBuffer or other types
                        remoteWs.send(data);
                    }
                    return;
                }
                // Otherwise, handle local session
                // Ultra-minimal: expect raw text input directly
                const inputReceived = data.toString();
                if (!inputReceived) {
                    return; // Ignore empty messages
                }
                // Parse input with special key marker detection
                // Special keys are wrapped in null bytes: "\x00enter\x00"
                // Regular text (including literal "enter") is sent as-is
                try {
                    let input;
                    // Debug logging to see what we're receiving
                    logger.debug(`Raw WebSocket input: ${JSON.stringify(inputReceived)} (length: ${inputReceived.length})`);
                    if (inputReceived.startsWith('\x00') &&
                        inputReceived.endsWith('\x00') &&
                        inputReceived.length > 2) {
                        // Special key wrapped in null bytes
                        const keyName = inputReceived.slice(1, -1); // Remove null byte markers
                        logger.debug(`Detected special key: "${keyName}"`);
                        input = { key: keyName };
                        logger.debug(`Mapped to special key: ${JSON.stringify(input)}`);
                    }
                    else {
                        // Regular text (including literal words like "enter", "escape", etc.)
                        input = { text: inputReceived };
                        logger.debug(`Regular text input: ${JSON.stringify(input)}`);
                    }
                    logger.debug(`Sending to PTY manager: ${JSON.stringify(input)}`);
                    this.ptyManager.sendInput(sessionId, input);
                }
                catch (error) {
                    logger.warn(`Failed to send input to session ${sessionId}:`, error);
                    // Don't close connection on input errors, just log
                }
            }
            catch (error) {
                logger.error('Error processing WebSocket input message:', error);
                // Don't close connection on errors, just ignore
            }
        });
        ws.on('close', () => {
            logger.log(`WebSocket input connection closed for session ${sessionId}`);
            // Clean up remote connection if exists
            if (remoteWs) {
                remoteWs.close();
                this.remoteConnections.delete(sessionId);
            }
        });
        ws.on('error', (error) => {
            logger.error(`WebSocket input error for session ${sessionId}:`, error);
        });
    }
}
exports.WebSocketInputHandler = WebSocketInputHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic29ja2V0LWlucHV0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvd2Vic29ja2V0LWlucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7R0FRRzs7O0FBU0gsa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBVy9DOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXlDRztBQUNILE1BQWEscUJBQXFCO0lBU2hDLFlBQVksT0FBcUM7UUFGekMsc0JBQWlCLEdBQTJCLElBQUksR0FBRyxFQUFFLENBQUM7UUFHNUQsSUFBSSxDQUFDLFVBQVUsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQztRQUMvQyxJQUFJLENBQUMsZUFBZSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUM7UUFDL0MsSUFBSSxDQUFDLGNBQWMsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDO1FBQzdDLElBQUksQ0FBQyxXQUFXLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztRQUN2QyxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUM7SUFDbkMsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQzNCLFNBQWlCLEVBQ2pCLFNBQWlCLEVBQ2pCLEtBQWE7UUFFYixNQUFNLEtBQUssR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDOUYsTUFBTSxPQUFPLEdBQUcsR0FBRyxLQUFLLHVCQUF1QixTQUFTLFVBQVUsa0JBQWtCLENB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QUFTLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDcEUsbURBQW1EO2dCQUNyRCxDQUFDO1lBQ0gsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDakUsZ0RBQWdEO1lBQ2xELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILEVBQUUsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUNsQixNQUFNLENBQUMsR0FBRyxDQUFDLGlEQUFpRCxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBRXpFLHVDQUF1QztZQUN2QyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNiLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDakIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMzQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sQ0FBQyxLQUFLLENBQUMscUNBQXFDLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdktELHNEQXVLQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogV2ViU29ja2V0IElucHV0IEhhbmRsZXIgZm9yIFZpYmVUdW5uZWxcbiAqXG4gKiBIYW5kbGVzIFdlYlNvY2tldCBjb25uZWN0aW9ucyBmb3IgbG93LWxhdGVuY3kgaW5wdXQgdHJhbnNtaXNzaW9uLlxuICogT3B0aW1pemVkIGZvciBzcGVlZDpcbiAqIC0gRmlyZS1hbmQtZm9yZ2V0IGlucHV0IChubyBBQ0tzKVxuICogLSBNaW5pbWFsIG1lc3NhZ2UgcGFyc2luZ1xuICogLSBEaXJlY3QgUFRZIGZvcndhcmRpbmdcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IFdlYlNvY2tldCBhcyBXU1dlYlNvY2tldCB9IGZyb20gJ3dzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbklucHV0LCBTcGVjaWFsS2V5IH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgUHR5TWFuYWdlciB9IGZyb20gJy4uL3B0eS9pbmRleC5qcyc7XG5pbXBvcnQgdHlwZSB7IEFjdGl2aXR5TW9uaXRvciB9IGZyb20gJy4uL3NlcnZpY2VzL2FjdGl2aXR5LW1vbml0b3IuanMnO1xuaW1wb3J0IHR5cGUgeyBBdXRoU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2F1dGgtc2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlbW90ZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vc2VydmljZXMvcmVtb3RlLXJlZ2lzdHJ5LmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi4vc2VydmljZXMvdGVybWluYWwtbWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3dlYnNvY2tldC1pbnB1dCcpO1xuXG5pbnRlcmZhY2UgV2ViU29ja2V0SW5wdXRIYW5kbGVyT3B0aW9ucyB7XG4gIHB0eU1hbmFnZXI6IFB0eU1hbmFnZXI7XG4gIHRlcm1pbmFsTWFuYWdlcjogVGVybWluYWxNYW5hZ2VyO1xuICBhY3Rpdml0eU1vbml0b3I6IEFjdGl2aXR5TW9uaXRvcjtcbiAgcmVtb3RlUmVnaXN0cnk6IFJlbW90ZVJlZ2lzdHJ5IHwgbnVsbDtcbiAgYXV0aFNlcnZpY2U6IEF1dGhTZXJ2aWNlO1xuICBpc0hRTW9kZTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBIYW5kbGVzIFdlYlNvY2tldCBjb25uZWN0aW9ucyBmb3IgcmVhbC10aW1lIHRlcm1pbmFsIGlucHV0IHRyYW5zbWlzc2lvbi5cbiAqXG4gKiBQcm92aWRlcyB1bHRyYS1sb3ctbGF0ZW5jeSBpbnB1dCBoYW5kbGluZyBmb3IgdGVybWluYWwgc2Vzc2lvbnMgd2l0aCBzdXBwb3J0XG4gKiBmb3IgYm90aCBsb2NhbCBhbmQgcmVtb3RlIHNlc3Npb25zIGluIEhRIG1vZGUuIFVzZXMgYSBmaXJlLWFuZC1mb3JnZXQgYXBwcm9hY2hcbiAqIHdpdGggbWluaW1hbCBwYXJzaW5nIG92ZXJoZWFkIGZvciBtYXhpbXVtIHBlcmZvcm1hbmNlLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBEaXJlY3QgV2ViU29ja2V0LXRvLVBUWSBpbnB1dCBmb3J3YXJkaW5nXG4gKiAtIFNwZWNpYWwga2V5IGRldGVjdGlvbiB3aXRoIG51bGwtYnl0ZSBtYXJrZXJzXG4gKiAtIFRyYW5zcGFyZW50IHByb3h5IG1vZGUgZm9yIHJlbW90ZSBzZXNzaW9uc1xuICogLSBObyBhY2tub3dsZWRnbWVudCBvdmVyaGVhZCAoZmlyZS1hbmQtZm9yZ2V0KVxuICogLSBBdXRvbWF0aWMgY29ubmVjdGlvbiBjbGVhbnVwXG4gKiAtIFN1cHBvcnQgZm9yIGFsbCBpbnB1dCB0eXBlcyAodGV4dCwgc3BlY2lhbCBrZXlzKVxuICpcbiAqIFByb3RvY29sOlxuICogLSBSZWd1bGFyIHRleHQ6IHNlbnQgYXMtaXNcbiAqIC0gU3BlY2lhbCBrZXlzOiB3cmFwcGVkIGluIG51bGwgYnl0ZXMgKGUuZy4sIFwiXFx4MDBlbnRlclxceDAwXCIpXG4gKiAtIFJlbW90ZSBtb2RlOiByYXcgcGFzc3Rocm91Z2ggd2l0aG91dCBwYXJzaW5nXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGhhbmRsZXIgPSBuZXcgV2ViU29ja2V0SW5wdXRIYW5kbGVyKHtcbiAqICAgcHR5TWFuYWdlcixcbiAqICAgdGVybWluYWxNYW5hZ2VyLFxuICogICBhY3Rpdml0eU1vbml0b3IsXG4gKiAgIHJlbW90ZVJlZ2lzdHJ5LFxuICogICBhdXRoU2VydmljZSxcbiAqICAgaXNIUU1vZGU6IHRydWVcbiAqIH0pO1xuICpcbiAqIC8vIEhhbmRsZSBpbmNvbWluZyBXZWJTb2NrZXQgY29ubmVjdGlvblxuICogd3NzLm9uKCdjb25uZWN0aW9uJywgKHdzLCByZXEpID0+IHtcbiAqICAgY29uc3QgeyBzZXNzaW9uSWQsIHVzZXJJZCB9ID0gcGFyc2VRdWVyeShyZXEudXJsKTtcbiAqICAgaGFuZGxlci5oYW5kbGVDb25uZWN0aW9uKHdzLCBzZXNzaW9uSWQsIHVzZXJJZCk7XG4gKiB9KTtcbiAqIGBgYFxuICpcbiAqIEBzZWUgUHR5TWFuYWdlciAtIEhhbmRsZXMgYWN0dWFsIHRlcm1pbmFsIGlucHV0IHByb2Nlc3NpbmdcbiAqIEBzZWUgUmVtb3RlUmVnaXN0cnkgLSBNYW5hZ2VzIHJlbW90ZSBzZXJ2ZXIgY29ubmVjdGlvbnMgaW4gSFEgbW9kZVxuICogQHNlZSB3ZWIvc3JjL2NsaWVudC9jb21wb25lbnRzL3Nlc3Npb24tdmlldy9pbnB1dC1tYW5hZ2VyLnRzIC0gQ2xpZW50LXNpZGUgaW5wdXQgaGFuZGxpbmdcbiAqL1xuZXhwb3J0IGNsYXNzIFdlYlNvY2tldElucHV0SGFuZGxlciB7XG4gIHByaXZhdGUgcHR5TWFuYWdlcjogUHR5TWFuYWdlcjtcbiAgcHJpdmF0ZSB0ZXJtaW5hbE1hbmFnZXI6IFRlcm1pbmFsTWFuYWdlcjtcbiAgcHJpdmF0ZSBhY3Rpdml0eU1vbml0b3I6IEFjdGl2aXR5TW9uaXRvcjtcbiAgcHJpdmF0ZSByZW1vdGVSZWdpc3RyeTogUmVtb3RlUmVnaXN0cnkgfCBudWxsO1xuICBwcml2YXRlIGF1dGhTZXJ2aWNlOiBBdXRoU2VydmljZTtcbiAgcHJpdmF0ZSBpc0hRTW9kZTogYm9vbGVhbjtcbiAgcHJpdmF0ZSByZW1vdGVDb25uZWN0aW9uczogTWFwPHN0cmluZywgV2ViU29ja2V0PiA9IG5ldyBNYXAoKTtcblxuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBXZWJTb2NrZXRJbnB1dEhhbmRsZXJPcHRpb25zKSB7XG4gICAgdGhpcy5wdHlNYW5hZ2VyID0gb3B0aW9ucy5wdHlNYW5hZ2VyO1xuICAgIHRoaXMudGVybWluYWxNYW5hZ2VyID0gb3B0aW9ucy50ZXJtaW5hbE1hbmFnZXI7XG4gICAgdGhpcy5hY3Rpdml0eU1vbml0b3IgPSBvcHRpb25zLmFjdGl2aXR5TW9uaXRvcjtcbiAgICB0aGlzLnJlbW90ZVJlZ2lzdHJ5ID0gb3B0aW9ucy5yZW1vdGVSZWdpc3RyeTtcbiAgICB0aGlzLmF1dGhTZXJ2aWNlID0gb3B0aW9ucy5hdXRoU2VydmljZTtcbiAgICB0aGlzLmlzSFFNb2RlID0gb3B0aW9ucy5pc0hRTW9kZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29ubmVjdFRvUmVtb3RlKFxuICAgIHJlbW90ZVVybDogc3RyaW5nLFxuICAgIHNlc3Npb25JZDogc3RyaW5nLFxuICAgIHRva2VuOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxXZWJTb2NrZXQ+IHtcbiAgICBjb25zdCB3c1VybCA9IHJlbW90ZVVybC5yZXBsYWNlKC9eaHR0cHM/Oi8sIChtYXRjaCkgPT4gKG1hdGNoID09PSAnaHR0cHM6JyA/ICd3c3M6JyA6ICd3czonKSk7XG4gICAgY29uc3QgZnVsbFVybCA9IGAke3dzVXJsfS93cy9pbnB1dD9zZXNzaW9uSWQ9JHtzZXNzaW9uSWR9JnRva2VuPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRva2VuKX1gO1xuXG4gICAgbG9nZ2VyLmxvZyhgRXN0YWJsaXNoaW5nIHByb3h5IGNvbm5lY3Rpb24gdG8gcmVtb3RlOiAke2Z1bGxVcmx9YCk7XG5cbiAgICBjb25zdCByZW1vdGVXcyA9IG5ldyBXZWJTb2NrZXQoZnVsbFVybCk7XG5cbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZW1vdGVXcy5jbG9zZSgpO1xuICAgICAgICByZWplY3QobmV3IEVycm9yKCdSZW1vdGUgV2ViU29ja2V0IGNvbm5lY3Rpb24gdGltZW91dCcpKTtcbiAgICAgIH0sIDUwMDApO1xuXG4gICAgICByZW1vdGVXcy5hZGRFdmVudExpc3RlbmVyKCdvcGVuJywgKCkgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGxvZ2dlci5sb2coYFJlbW90ZSBXZWJTb2NrZXQgcHJveHkgZXN0YWJsaXNoZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG4gICAgICAgIHJlc29sdmUocmVtb3RlV3MpO1xuICAgICAgfSk7XG5cbiAgICAgIHJlbW90ZVdzLmFkZEV2ZW50TGlzdGVuZXIoJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBSZW1vdGUgV2ViU29ja2V0IGVycm9yIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUNvbm5lY3Rpb24od3M6IFdTV2ViU29ja2V0LCBzZXNzaW9uSWQ6IHN0cmluZywgdXNlcklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIubG9nKGBXZWJTb2NrZXQgaW5wdXQgY29ubmVjdGlvbiBlc3RhYmxpc2hlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0sIHVzZXIgJHt1c2VySWR9YCk7XG5cbiAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgcmVtb3RlIHNlc3Npb24gaW4gSFEgbW9kZVxuICAgIGxldCByZW1vdGVXczogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKHRoaXMuaXNIUU1vZGUgJiYgdGhpcy5yZW1vdGVSZWdpc3RyeSkge1xuICAgICAgY29uc3QgcmVtb3RlID0gdGhpcy5yZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgIGBTZXNzaW9uICR7c2Vzc2lvbklkfSBpcyBvbiByZW1vdGUgJHtyZW1vdGUubmFtZX0sIGVzdGFibGlzaGluZyBwcm94eSBjb25uZWN0aW9uYFxuICAgICAgICApO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVtb3RlV3MgPSBhd2FpdCB0aGlzLmNvbm5lY3RUb1JlbW90ZShyZW1vdGUudXJsLCBzZXNzaW9uSWQsIHJlbW90ZS50b2tlbik7XG4gICAgICAgICAgdGhpcy5yZW1vdGVDb25uZWN0aW9ucy5zZXQoc2Vzc2lvbklkLCByZW1vdGVXcyk7XG5cbiAgICAgICAgICAvLyBTZXQgdXAgcmVtb3RlIGNvbm5lY3Rpb24gZXJyb3IgaGFuZGxpbmdcbiAgICAgICAgICByZW1vdGVXcy5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsICgpID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci5sb2coYFJlbW90ZSBXZWJTb2NrZXQgY2xvc2VkIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgICAgICAgICAgdGhpcy5yZW1vdGVDb25uZWN0aW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIHdzLmNsb3NlKCk7IC8vIENsb3NlIGNsaWVudCBjb25uZWN0aW9uIHdoZW4gcmVtb3RlIGNsb3Nlc1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmVtb3RlV3MuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgUmVtb3RlIFdlYlNvY2tldCBlcnJvciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgdGhpcy5yZW1vdGVDb25uZWN0aW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAgIHdzLmNsb3NlKCk7IC8vIENsb3NlIGNsaWVudCBjb25uZWN0aW9uIG9uIHJlbW90ZSBlcnJvclxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgIGBGYWlsZWQgdG8gZXN0YWJsaXNoIHByb3h5IGNvbm5lY3Rpb24gdG8gcmVtb3RlIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLFxuICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICApO1xuICAgICAgICAgIHdzLmNsb3NlKCk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgd3Mub24oJ21lc3NhZ2UnLCAoZGF0YSkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gSWYgd2UgaGF2ZSBhIHJlbW90ZSBjb25uZWN0aW9uLCBqdXN0IGZvcndhcmQgdGhlIHJhdyBkYXRhXG4gICAgICAgIGlmIChyZW1vdGVXcyAmJiByZW1vdGVXcy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuICAgICAgICAgIC8vIENvbnZlcnQgd3MgbGlicmFyeSdzIFJhd0RhdGEgdG8gc29tZXRoaW5nIG5hdGl2ZSBXZWJTb2NrZXQgY2FuIHNlbmRcbiAgICAgICAgICBpZiAoZGF0YSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgICAgICAgcmVtb3RlV3Muc2VuZChkYXRhKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgICAgICAgIC8vIENvbmNhdGVuYXRlIGJ1ZmZlciBhcnJheVxuICAgICAgICAgICAgcmVtb3RlV3Muc2VuZChCdWZmZXIuY29uY2F0KGRhdGEpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQXJyYXlCdWZmZXIgb3Igb3RoZXIgdHlwZXNcbiAgICAgICAgICAgIHJlbW90ZVdzLnNlbmQoZGF0YSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE90aGVyd2lzZSwgaGFuZGxlIGxvY2FsIHNlc3Npb25cbiAgICAgICAgLy8gVWx0cmEtbWluaW1hbDogZXhwZWN0IHJhdyB0ZXh0IGlucHV0IGRpcmVjdGx5XG4gICAgICAgIGNvbnN0IGlucHV0UmVjZWl2ZWQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cbiAgICAgICAgaWYgKCFpbnB1dFJlY2VpdmVkKSB7XG4gICAgICAgICAgcmV0dXJuOyAvLyBJZ25vcmUgZW1wdHkgbWVzc2FnZXNcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBhcnNlIGlucHV0IHdpdGggc3BlY2lhbCBrZXkgbWFya2VyIGRldGVjdGlvblxuICAgICAgICAvLyBTcGVjaWFsIGtleXMgYXJlIHdyYXBwZWQgaW4gbnVsbCBieXRlczogXCJcXHgwMGVudGVyXFx4MDBcIlxuICAgICAgICAvLyBSZWd1bGFyIHRleHQgKGluY2x1ZGluZyBsaXRlcmFsIFwiZW50ZXJcIikgaXMgc2VudCBhcy1pc1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxldCBpbnB1dDogU2Vzc2lvbklucHV0O1xuXG4gICAgICAgICAgLy8gRGVidWcgbG9nZ2luZyB0byBzZWUgd2hhdCB3ZSdyZSByZWNlaXZpbmdcbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgUmF3IFdlYlNvY2tldCBpbnB1dDogJHtKU09OLnN0cmluZ2lmeShpbnB1dFJlY2VpdmVkKX0gKGxlbmd0aDogJHtpbnB1dFJlY2VpdmVkLmxlbmd0aH0pYFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBpbnB1dFJlY2VpdmVkLnN0YXJ0c1dpdGgoJ1xceDAwJykgJiZcbiAgICAgICAgICAgIGlucHV0UmVjZWl2ZWQuZW5kc1dpdGgoJ1xceDAwJykgJiZcbiAgICAgICAgICAgIGlucHV0UmVjZWl2ZWQubGVuZ3RoID4gMlxuICAgICAgICAgICkge1xuICAgICAgICAgICAgLy8gU3BlY2lhbCBrZXkgd3JhcHBlZCBpbiBudWxsIGJ5dGVzXG4gICAgICAgICAgICBjb25zdCBrZXlOYW1lID0gaW5wdXRSZWNlaXZlZC5zbGljZSgxLCAtMSk7IC8vIFJlbW92ZSBudWxsIGJ5dGUgbWFya2Vyc1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBEZXRlY3RlZCBzcGVjaWFsIGtleTogXCIke2tleU5hbWV9XCJgKTtcbiAgICAgICAgICAgIGlucHV0ID0geyBrZXk6IGtleU5hbWUgYXMgU3BlY2lhbEtleSB9O1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBNYXBwZWQgdG8gc3BlY2lhbCBrZXk6ICR7SlNPTi5zdHJpbmdpZnkoaW5wdXQpfWApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBSZWd1bGFyIHRleHQgKGluY2x1ZGluZyBsaXRlcmFsIHdvcmRzIGxpa2UgXCJlbnRlclwiLCBcImVzY2FwZVwiLCBldGMuKVxuICAgICAgICAgICAgaW5wdXQgPSB7IHRleHQ6IGlucHV0UmVjZWl2ZWQgfTtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgUmVndWxhciB0ZXh0IGlucHV0OiAke0pTT04uc3RyaW5naWZ5KGlucHV0KX1gKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsb2dnZXIuZGVidWcoYFNlbmRpbmcgdG8gUFRZIG1hbmFnZXI6ICR7SlNPTi5zdHJpbmdpZnkoaW5wdXQpfWApO1xuICAgICAgICAgIHRoaXMucHR5TWFuYWdlci5zZW5kSW5wdXQoc2Vzc2lvbklkLCBpbnB1dCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byBzZW5kIGlucHV0IHRvIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICAgICAgICAvLyBEb24ndCBjbG9zZSBjb25uZWN0aW9uIG9uIGlucHV0IGVycm9ycywganVzdCBsb2dcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIFdlYlNvY2tldCBpbnB1dCBtZXNzYWdlOicsIGVycm9yKTtcbiAgICAgICAgLy8gRG9uJ3QgY2xvc2UgY29ubmVjdGlvbiBvbiBlcnJvcnMsIGp1c3QgaWdub3JlXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB3cy5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIubG9nKGBXZWJTb2NrZXQgaW5wdXQgY29ubmVjdGlvbiBjbG9zZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cbiAgICAgIC8vIENsZWFuIHVwIHJlbW90ZSBjb25uZWN0aW9uIGlmIGV4aXN0c1xuICAgICAgaWYgKHJlbW90ZVdzKSB7XG4gICAgICAgIHJlbW90ZVdzLmNsb3NlKCk7XG4gICAgICAgIHRoaXMucmVtb3RlQ29ubmVjdGlvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB3cy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcihgV2ViU29ja2V0IGlucHV0IGVycm9yIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==