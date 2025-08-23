import { Terminal as XtermTerminal } from '@xterm/headless';
type BufferChangeListener = (sessionId: string, snapshot: BufferSnapshot) => void;
interface BufferCell {
    char: string;
    width: number;
    fg?: number;
    bg?: number;
    attributes?: number;
}
interface BufferSnapshot {
    cols: number;
    rows: number;
    viewportY: number;
    cursorX: number;
    cursorY: number;
    cells: BufferCell[][];
}
/**
 * Manages terminal instances and their buffer operations for terminal sessions.
 *
 * Provides high-performance terminal emulation using xterm.js headless terminals,
 * with sophisticated flow control, buffer management, and real-time change
 * notifications. Handles asciinema stream parsing, terminal resizing, and
 * efficient binary encoding of terminal buffers.
 *
 * Key features:
 * - Headless xterm.js terminal instances with 10K line scrollback
 * - Asciinema v2 format stream parsing and playback
 * - Flow control with backpressure to prevent memory exhaustion
 * - Efficient binary buffer encoding for WebSocket transmission
 * - Real-time buffer change notifications with debouncing
 * - Error deduplication to prevent log spam
 * - Automatic cleanup of stale terminals
 *
 * Flow control strategy:
 * - Pauses reading when buffer reaches 80% capacity
 * - Resumes when buffer drops below 50%
 * - Queues up to 10K pending lines while paused
 * - Times out paused sessions after 5 minutes
 *
 * @example
 * ```typescript
 * const manager = new TerminalManager('/var/run/vibetunnel');
 *
 * // Get terminal for session
 * const terminal = await manager.getTerminal(sessionId);
 *
 * // Subscribe to buffer changes
 * const unsubscribe = await manager.subscribeToBufferChanges(
 *   sessionId,
 *   (id, snapshot) => {
 *     const encoded = manager.encodeSnapshot(snapshot);
 *     ws.send(encoded);
 *   }
 * );
 * ```
 *
 * @see XtermTerminal - Terminal emulation engine
 * @see web/src/server/services/buffer-aggregator.ts - Aggregates buffer updates
 * @see web/src/server/pty/asciinema-writer.ts - Writes asciinema streams
 */
export declare class TerminalManager {
    private terminals;
    private controlDir;
    private bufferListeners;
    private changeTimers;
    private writeQueues;
    private writeTimers;
    private errorDeduplicator;
    private originalConsoleWarn;
    private flowControlTimer?;
    constructor(controlDir: string);
    /**
     * Get or create a terminal for a session
     */
    getTerminal(sessionId: string): Promise<XtermTerminal>;
    /**
     * Watch stream file for changes
     */
    private watchStreamFile;
    /**
     * Start flow control timer to check paused sessions
     */
    private startFlowControlTimer;
    /**
     * Check buffer pressure and pause/resume as needed
     */
    private checkBufferPressure;
    /**
     * Handle stream line
     */
    private handleStreamLine;
    /**
     * Process a stream line (separated from handleStreamLine for flow control)
     */
    private processStreamLine;
    /**
     * Get buffer stats for a session
     */
    getBufferStats(sessionId: string): Promise<{
        totalRows: number;
        cols: number;
        rows: number;
        viewportY: number;
        cursorX: number;
        cursorY: number;
        scrollback: number;
        isPaused: boolean;
        pendingLines: number;
        bufferUtilization: number;
        maxBufferLines: number;
    }>;
    /**
     * Get buffer snapshot for a session - always returns full terminal buffer (cols x rows)
     */
    getBufferSnapshot(sessionId: string): Promise<BufferSnapshot>;
    /**
     * Clean up terminal for a session to prevent memory leaks
     */
    cleanupTerminal(sessionId: string): void;
    /**
     * Clean up inactive terminals to prevent memory leaks
     */
    cleanupInactiveTerminals(maxAgeMs?: number): number;
    /**
     * Encode buffer snapshot to binary format
     *
     * Converts a buffer snapshot into an optimized binary format for
     * efficient transmission over WebSocket. The encoding uses various
     * compression techniques:
     *
     * - Empty rows are marked with 2-byte markers
     * - Spaces with default styling use 1 byte
     * - ASCII characters with colors use 2-8 bytes
     * - Unicode characters use variable length encoding
     *
     * The binary format is designed for fast decoding on the client
     * while minimizing bandwidth usage.
     *
     * @param snapshot - Terminal buffer snapshot to encode
     * @returns Binary buffer ready for transmission
     *
     * @example
     * ```typescript
     * const snapshot = await manager.getBufferSnapshot('session-123');
     * const binary = manager.encodeSnapshot(snapshot);
     *
     * // Send over WebSocket with session ID
     * const packet = Buffer.concat([
     *   Buffer.from([0xBF]), // Magic byte
     *   Buffer.from(sessionId.length.toString(16), 'hex'),
     *   Buffer.from(sessionId),
     *   binary
     * ]);
     * ws.send(packet);
     * ```
     */
    encodeSnapshot(snapshot: BufferSnapshot): Buffer;
    /**
     * Calculate the size needed to encode a cell
     */
    private calculateCellSize;
    /**
     * Encode a single cell into the buffer
     */
    private encodeCell;
    /**
     * Close a terminal session
     */
    closeTerminal(sessionId: string): void;
    /**
     * Clean up old terminals
     */
    cleanup(maxAge?: number): void;
    /**
     * Queue terminal write with rate limiting to prevent flow control issues
     */
    private queueTerminalWrite;
    /**
     * Process write queue with rate limiting
     */
    private processWriteQueue;
    /**
     * Get all active terminals
     */
    getActiveTerminals(): string[];
    /**
     * Subscribe to buffer changes for a session
     */
    subscribeToBufferChanges(sessionId: string, listener: BufferChangeListener): Promise<() => void>;
    /**
     * Schedule buffer change notification (debounced)
     */
    private scheduleBufferChangeNotification;
    /**
     * Notify listeners of buffer change
     */
    private notifyBufferChange;
    /**
     * Resume file watching for a paused session
     */
    private resumeFileWatcher;
    /**
     * Destroy the terminal manager and restore console overrides
     */
    destroy(): void;
}
export {};
