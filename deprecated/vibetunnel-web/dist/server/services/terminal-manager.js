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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalManager = void 0;
const headless_1 = require("@xterm/headless");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const error_deduplicator_js_1 = require("../utils/error-deduplicator.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('terminal-manager');
// Helper function to truncate long strings for logging
function truncateForLog(str, maxLength = 50) {
    if (str.length <= maxLength)
        return str;
    return `${str.substring(0, maxLength)}...(${str.length} chars total)`;
}
// Flow control configuration
const FLOW_CONTROL_CONFIG = {
    // When buffer exceeds this percentage of max lines, pause reading
    // 80% gives a good buffer before hitting the scrollback limit
    highWatermark: 0.8,
    // Resume reading when buffer drops below this percentage
    // 50% ensures enough space is cleared before resuming
    lowWatermark: 0.5,
    // Check interval for resuming paused sessions
    // 100ms provides responsive resumption without excessive CPU usage
    checkInterval: 100, // ms
    // Maximum pending lines to accumulate while paused
    // 10K lines handles bursts without excessive memory (avg ~1MB at 100 chars/line)
    maxPendingLines: 10000,
    // Maximum time a session can be paused before timing out
    // 5 minutes handles temporary client issues without indefinite memory growth
    maxPauseTime: 5 * 60 * 1000, // 5 minutes
    // Lines to process between buffer pressure checks
    // Checking every 100 lines balances performance with responsiveness
    bufferCheckInterval: 100,
};
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
class TerminalManager {
    constructor(controlDir) {
        this.terminals = new Map();
        this.bufferListeners = new Map();
        this.changeTimers = new Map();
        this.writeQueues = new Map();
        this.writeTimers = new Map();
        this.errorDeduplicator = new error_deduplicator_js_1.ErrorDeduplicator({
            keyExtractor: (error, context) => {
                // Use session ID and line prefix as context for xterm parsing errors
                const errorMessage = error instanceof Error ? error.message : String(error);
                return `${context}:${errorMessage}`;
            },
        });
        this.controlDir = controlDir;
        // Override console.warn to suppress xterm.js parsing warnings
        this.originalConsoleWarn = console.warn;
        console.warn = (...args) => {
            const message = args[0];
            if (typeof message === 'string' &&
                (message.includes('xterm.js parsing error') ||
                    message.includes('Unable to process character') ||
                    message.includes('Cannot read properties of undefined'))) {
                // Suppress xterm.js parsing warnings
                return;
            }
            this.originalConsoleWarn.apply(console, args);
        };
        // Start flow control check timer
        this.startFlowControlTimer();
    }
    /**
     * Get or create a terminal for a session
     */
    async getTerminal(sessionId) {
        let sessionTerminal = this.terminals.get(sessionId);
        if (!sessionTerminal) {
            // Create new terminal with memory-conscious settings
            const terminal = new headless_1.Terminal({
                cols: 80,
                rows: 24,
                scrollback: 5000, // Reduced from 10K to prevent memory issues in long-running sessions
                allowProposedApi: true,
                convertEol: true,
            });
            sessionTerminal = {
                terminal,
                lastUpdate: Date.now(),
            };
            this.terminals.set(sessionId, sessionTerminal);
            logger.log(chalk_1.default.green(`Terminal created for session ${sessionId} (${terminal.cols}x${terminal.rows})`));
            // Start watching the stream file
            await this.watchStreamFile(sessionId);
        }
        sessionTerminal.lastUpdate = Date.now();
        return sessionTerminal.terminal;
    }
    /**
     * Watch stream file for changes
     */
    async watchStreamFile(sessionId) {
        const sessionTerminal = this.terminals.get(sessionId);
        if (!sessionTerminal)
            return;
        const streamPath = path.join(this.controlDir, sessionId, 'stdout');
        let lastOffset = sessionTerminal.lastFileOffset || 0;
        let lineBuffer = sessionTerminal.lineBuffer || '';
        // Check if the file exists
        if (!fs.existsSync(streamPath)) {
            logger.error(`Stream file does not exist for session ${truncateForLog(sessionId)}: ${truncateForLog(streamPath, 100)}`);
            return;
        }
        try {
            // Read existing content first
            const content = fs.readFileSync(streamPath, 'utf8');
            lastOffset = Buffer.byteLength(content, 'utf8');
            // Process existing content
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    this.handleStreamLine(sessionId, sessionTerminal, line);
                }
            }
            // Watch for changes
            sessionTerminal.watcher = fs.watch(streamPath, (eventType) => {
                if (eventType === 'change') {
                    try {
                        const stats = fs.statSync(streamPath);
                        if (stats.size > lastOffset) {
                            // Read only the new data
                            const fd = fs.openSync(streamPath, 'r');
                            const buffer = Buffer.alloc(stats.size - lastOffset);
                            fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
                            fs.closeSync(fd);
                            // Update offset
                            lastOffset = stats.size;
                            sessionTerminal.lastFileOffset = lastOffset;
                            // Process new data
                            const newData = buffer.toString('utf8');
                            lineBuffer += newData;
                            // Process complete lines
                            const lines = lineBuffer.split('\n');
                            lineBuffer = lines.pop() || ''; // Keep incomplete line for next time
                            sessionTerminal.lineBuffer = lineBuffer;
                            for (const line of lines) {
                                if (line.trim()) {
                                    this.handleStreamLine(sessionId, sessionTerminal, line);
                                }
                            }
                        }
                    }
                    catch (error) {
                        logger.error(`Error reading stream file for session ${truncateForLog(sessionId)}:`, error);
                    }
                }
            });
            logger.log(chalk_1.default.green(`Watching stream file for session ${truncateForLog(sessionId)}`));
        }
        catch (error) {
            logger.error(`Failed to watch stream file for session ${truncateForLog(sessionId)}:`, error);
            throw error;
        }
    }
    /**
     * Start flow control timer to check paused sessions
     */
    startFlowControlTimer() {
        let checkIndex = 0;
        const sessionIds = [];
        this.flowControlTimer = setInterval(() => {
            // Rebuild session list periodically
            if (checkIndex === 0) {
                sessionIds.length = 0;
                for (const [sessionId, sessionTerminal] of this.terminals) {
                    if (sessionTerminal.isPaused) {
                        sessionIds.push(sessionId);
                    }
                }
            }
            // Process one session per tick to avoid thundering herd
            if (sessionIds.length > 0) {
                const sessionId = sessionIds[checkIndex % sessionIds.length];
                const sessionTerminal = this.terminals.get(sessionId);
                if (sessionTerminal?.isPaused) {
                    // Check for timeout
                    if (sessionTerminal.pausedAt &&
                        Date.now() - sessionTerminal.pausedAt > FLOW_CONTROL_CONFIG.maxPauseTime) {
                        logger.warn(chalk_1.default.red(`Session ${sessionId} has been paused for too long. ` +
                            `Dropping ${sessionTerminal.pendingLines?.length || 0} pending lines.`));
                        sessionTerminal.isPaused = false;
                        sessionTerminal.pendingLines = [];
                        sessionTerminal.pausedAt = undefined;
                        // Resume file watching after timeout
                        this.resumeFileWatcher(sessionId).catch((error) => {
                            logger.error(`Failed to resume file watcher for session ${sessionId} after timeout:`, error);
                        });
                    }
                    else {
                        this.checkBufferPressure(sessionId);
                    }
                }
                checkIndex = (checkIndex + 1) % Math.max(sessionIds.length, 1);
            }
        }, FLOW_CONTROL_CONFIG.checkInterval);
    }
    /**
     * Check buffer pressure and pause/resume as needed
     */
    checkBufferPressure(sessionId) {
        const sessionTerminal = this.terminals.get(sessionId);
        if (!sessionTerminal)
            return false;
        const terminal = sessionTerminal.terminal;
        const buffer = terminal.buffer.active;
        const maxLines = terminal.options.scrollback || 10000;
        const currentLines = buffer.length;
        const bufferUtilization = currentLines / maxLines;
        const wasPaused = sessionTerminal.isPaused || false;
        // Check if we should pause
        if (!wasPaused && bufferUtilization > FLOW_CONTROL_CONFIG.highWatermark) {
            sessionTerminal.isPaused = true;
            sessionTerminal.pendingLines = [];
            sessionTerminal.pausedAt = Date.now();
            // Apply backpressure by closing the file watcher
            if (sessionTerminal.watcher) {
                sessionTerminal.watcher.close();
                sessionTerminal.watcher = undefined;
            }
            logger.warn(chalk_1.default.yellow(`Buffer pressure high for session ${sessionId}: ${Math.round(bufferUtilization * 100)}% ` +
                `(${currentLines}/${maxLines} lines). Pausing file watcher.`));
            return true;
        }
        // Check if we should resume
        if (wasPaused && bufferUtilization < FLOW_CONTROL_CONFIG.lowWatermark) {
            // Avoid race condition: mark as processing pending before resuming
            if (sessionTerminal.pendingLines &&
                sessionTerminal.pendingLines.length > 0 &&
                !sessionTerminal.isProcessingPending) {
                sessionTerminal.isProcessingPending = true;
                const pendingCount = sessionTerminal.pendingLines.length;
                logger.log(chalk_1.default.green(`Buffer pressure normalized for session ${sessionId}: ${Math.round(bufferUtilization * 100)}% ` +
                    `(${currentLines}/${maxLines} lines). Processing ${pendingCount} pending lines.`));
                // Process pending lines asynchronously to avoid blocking
                setImmediate(() => {
                    const lines = sessionTerminal.pendingLines || [];
                    sessionTerminal.pendingLines = [];
                    sessionTerminal.isPaused = false;
                    sessionTerminal.pausedAt = undefined;
                    sessionTerminal.isProcessingPending = false;
                    for (const pendingLine of lines) {
                        this.processStreamLine(sessionId, sessionTerminal, pendingLine);
                    }
                    // Resume file watching after processing pending lines
                    this.resumeFileWatcher(sessionId).catch((error) => {
                        logger.error(`Failed to resume file watcher for session ${truncateForLog(sessionId)}:`, error);
                    });
                });
            }
            else if (!sessionTerminal.pendingLines || sessionTerminal.pendingLines.length === 0) {
                // No pending lines, just resume
                sessionTerminal.isPaused = false;
                sessionTerminal.pausedAt = undefined;
                // Resume file watching
                this.resumeFileWatcher(sessionId).catch((error) => {
                    logger.error(`Failed to resume file watcher for session ${truncateForLog(sessionId)}:`, error);
                });
                logger.log(chalk_1.default.green(`Buffer pressure normalized for session ${sessionId}: ${Math.round(bufferUtilization * 100)}% ` +
                    `(${currentLines}/${maxLines} lines). Resuming file watcher.`));
            }
            return false;
        }
        return wasPaused;
    }
    /**
     * Handle stream line
     */
    handleStreamLine(sessionId, sessionTerminal, line) {
        // Initialize line counter if needed
        if (sessionTerminal.linesProcessedSinceCheck === undefined) {
            sessionTerminal.linesProcessedSinceCheck = 0;
        }
        // Check buffer pressure periodically or if already paused
        let isPaused = sessionTerminal.isPaused || false;
        if (!isPaused &&
            sessionTerminal.linesProcessedSinceCheck >= FLOW_CONTROL_CONFIG.bufferCheckInterval) {
            isPaused = this.checkBufferPressure(sessionId);
            sessionTerminal.linesProcessedSinceCheck = 0;
        }
        if (isPaused) {
            // Queue the line for later processing
            if (!sessionTerminal.pendingLines) {
                sessionTerminal.pendingLines = [];
            }
            // Limit pending lines to prevent memory issues
            if (sessionTerminal.pendingLines.length < FLOW_CONTROL_CONFIG.maxPendingLines) {
                sessionTerminal.pendingLines.push(line);
            }
            else {
                logger.warn(chalk_1.default.red(`Pending lines limit reached for session ${sessionId}. Dropping new data to prevent memory overflow.`));
            }
            return;
        }
        sessionTerminal.linesProcessedSinceCheck++;
        this.processStreamLine(sessionId, sessionTerminal, line);
    }
    /**
     * Process a stream line (separated from handleStreamLine for flow control)
     */
    processStreamLine(sessionId, sessionTerminal, line) {
        try {
            const data = JSON.parse(line);
            // Handle asciinema header
            if (data.version && data.width && data.height) {
                sessionTerminal.terminal.resize(data.width, data.height);
                this.notifyBufferChange(sessionId);
                return;
            }
            // Handle asciinema events [timestamp, type, data]
            if (Array.isArray(data) && data.length >= 3) {
                const [timestamp, type, eventData] = data;
                if (timestamp === 'exit') {
                    // Session exited
                    logger.log(chalk_1.default.yellow(`Session ${truncateForLog(sessionId)} exited with code ${data[1]}`));
                    if (sessionTerminal.watcher) {
                        sessionTerminal.watcher.close();
                    }
                    return;
                }
                if (type === 'o') {
                    // Output event - queue write to terminal with rate limiting
                    this.queueTerminalWrite(sessionId, sessionTerminal, eventData);
                    this.scheduleBufferChangeNotification(sessionId);
                }
                else if (type === 'r') {
                    // Resize event
                    const match = eventData.match(/^(\d+)x(\d+)$/);
                    if (match) {
                        const cols = Number.parseInt(match[1], 10);
                        const rows = Number.parseInt(match[2], 10);
                        sessionTerminal.terminal.resize(cols, rows);
                        this.notifyBufferChange(sessionId);
                    }
                }
                // Ignore 'i' (input) events
            }
        }
        catch (error) {
            // Use deduplicator to check if we should log this error
            // Use a more generic context key to group similar parsing errors together
            const contextKey = `${sessionId}:parse-stream-line`;
            if (this.errorDeduplicator.shouldLog(error, contextKey)) {
                const stats = this.errorDeduplicator.getErrorStats(error, contextKey);
                if (stats && stats.count > 1) {
                    // Log summary for repeated errors
                    logger.warn((0, error_deduplicator_js_1.formatErrorSummary)(error, stats, `session ${truncateForLog(sessionId)}`));
                }
                else {
                    // First occurrence - log the error with details
                    const truncatedLine = line.length > 100 ? `${line.substring(0, 100)}...` : line;
                    logger.error(`Failed to parse stream line for session ${truncateForLog(sessionId)}: ${truncatedLine}`);
                    if (error instanceof Error && error.stack) {
                        logger.debug(`Parse error details: ${error.message}`);
                    }
                }
            }
        }
    }
    /**
     * Get buffer stats for a session
     */
    async getBufferStats(sessionId) {
        const terminal = await this.getTerminal(sessionId);
        const buffer = terminal.buffer.active;
        const sessionTerminal = this.terminals.get(sessionId);
        logger.debug(`Getting buffer stats for session ${truncateForLog(sessionId)}: ${buffer.length} total rows`);
        const maxLines = terminal.options.scrollback || 10000;
        const bufferUtilization = buffer.length / maxLines;
        return {
            totalRows: buffer.length,
            cols: terminal.cols,
            rows: terminal.rows,
            viewportY: buffer.viewportY,
            cursorX: buffer.cursorX,
            cursorY: buffer.cursorY,
            scrollback: terminal.options.scrollback || 0,
            // Flow control metrics
            isPaused: sessionTerminal?.isPaused || false,
            pendingLines: sessionTerminal?.pendingLines?.length || 0,
            bufferUtilization: Math.round(bufferUtilization * 100),
            maxBufferLines: maxLines,
        };
    }
    /**
     * Get buffer snapshot for a session - always returns full terminal buffer (cols x rows)
     */
    async getBufferSnapshot(sessionId) {
        const startTime = Date.now();
        const terminal = await this.getTerminal(sessionId);
        const buffer = terminal.buffer.active;
        // Always get the visible terminal area from bottom
        const startLine = Math.max(0, buffer.length - terminal.rows);
        const endLine = buffer.length;
        const actualLines = endLine - startLine;
        // Get cursor position relative to our viewport
        const cursorX = buffer.cursorX;
        const cursorY = buffer.cursorY + buffer.viewportY - startLine;
        // Extract cells
        const cells = [];
        const cell = buffer.getNullCell();
        for (let row = 0; row < actualLines; row++) {
            const line = buffer.getLine(startLine + row);
            const rowCells = [];
            if (line) {
                for (let col = 0; col < terminal.cols; col++) {
                    line.getCell(col, cell);
                    const char = cell.getChars() || ' ';
                    const width = cell.getWidth();
                    // Skip zero-width cells (part of wide characters)
                    if (width === 0)
                        continue;
                    // Build attributes byte
                    let attributes = 0;
                    if (cell.isBold())
                        attributes |= 0x01;
                    if (cell.isItalic())
                        attributes |= 0x02;
                    if (cell.isUnderline())
                        attributes |= 0x04;
                    if (cell.isDim())
                        attributes |= 0x08;
                    if (cell.isInverse())
                        attributes |= 0x10;
                    if (cell.isInvisible())
                        attributes |= 0x20;
                    if (cell.isStrikethrough())
                        attributes |= 0x40;
                    const bufferCell = {
                        char,
                        width,
                    };
                    // Only include non-default values
                    const fg = cell.getFgColor();
                    const bg = cell.getBgColor();
                    // Handle color values - -1 means default color
                    if (fg !== undefined && fg !== -1)
                        bufferCell.fg = fg;
                    if (bg !== undefined && bg !== -1)
                        bufferCell.bg = bg;
                    if (attributes !== 0)
                        bufferCell.attributes = attributes;
                    rowCells.push(bufferCell);
                }
                // Trim blank cells from the end of the line
                let lastNonBlankCell = rowCells.length - 1;
                while (lastNonBlankCell >= 0) {
                    const cell = rowCells[lastNonBlankCell];
                    if (cell.char !== ' ' ||
                        cell.fg !== undefined ||
                        cell.bg !== undefined ||
                        cell.attributes !== undefined) {
                        break;
                    }
                    lastNonBlankCell--;
                }
                // Trim the array, but keep at least one cell
                if (lastNonBlankCell < rowCells.length - 1) {
                    rowCells.splice(Math.max(1, lastNonBlankCell + 1));
                }
            }
            else {
                // Empty line - just add a single space
                rowCells.push({ char: ' ', width: 1 });
            }
            cells.push(rowCells);
        }
        // Trim blank lines from the bottom
        let lastNonBlankRow = cells.length - 1;
        while (lastNonBlankRow >= 0) {
            const row = cells[lastNonBlankRow];
            const hasContent = row.some((cell) => cell.char !== ' ' ||
                cell.fg !== undefined ||
                cell.bg !== undefined ||
                cell.attributes !== undefined);
            if (hasContent)
                break;
            lastNonBlankRow--;
        }
        // Keep at least one row
        const trimmedCells = cells.slice(0, Math.max(1, lastNonBlankRow + 1));
        const duration = Date.now() - startTime;
        if (duration > 10) {
            logger.debug(`Buffer snapshot for session ${sessionId} took ${duration}ms (${trimmedCells.length} rows)`);
        }
        return {
            cols: terminal.cols,
            rows: trimmedCells.length,
            viewportY: startLine,
            cursorX,
            cursorY,
            cells: trimmedCells,
        };
    }
    /**
     * Clean up terminal for a session to prevent memory leaks
     */
    cleanupTerminal(sessionId) {
        const sessionTerminal = this.terminals.get(sessionId);
        if (sessionTerminal) {
            // Stop watching the stream file
            if (sessionTerminal.watcher) {
                sessionTerminal.watcher.close();
                sessionTerminal.watcher = undefined;
            }
            // Dispose of the terminal to free memory
            try {
                sessionTerminal.terminal.dispose();
            }
            catch (error) {
                logger.warn(`Error disposing terminal for session ${sessionId}:`, error);
            }
            // Clear references
            this.terminals.delete(sessionId);
            // Remove from buffer change listeners
            this.bufferListeners.delete(sessionId);
            logger.debug(`Terminal cleaned up for session ${sessionId}`);
        }
    }
    /**
     * Clean up inactive terminals to prevent memory leaks
     */
    cleanupInactiveTerminals(maxAgeMs = 24 * 60 * 60 * 1000) {
        // 24 hours
        const now = Date.now();
        const toCleanup = [];
        for (const [sessionId, sessionTerminal] of this.terminals.entries()) {
            const age = now - sessionTerminal.lastUpdate;
            if (age > maxAgeMs) {
                toCleanup.push(sessionId);
            }
        }
        for (const sessionId of toCleanup) {
            this.cleanupTerminal(sessionId);
        }
        if (toCleanup.length > 0) {
            logger.log(chalk_1.default.yellow(`Cleaned up ${toCleanup.length} inactive terminals`));
        }
        return toCleanup.length;
    }
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
    encodeSnapshot(snapshot) {
        const startTime = Date.now();
        const { cols, rows, viewportY, cursorX, cursorY, cells } = snapshot;
        // Pre-calculate actual data size for efficiency
        let dataSize = 32; // Header size
        // First pass: calculate exact size needed
        for (let row = 0; row < cells.length; row++) {
            const rowCells = cells[row];
            if (rowCells.length === 0 ||
                (rowCells.length === 1 &&
                    rowCells[0].char === ' ' &&
                    !rowCells[0].fg &&
                    !rowCells[0].bg &&
                    !rowCells[0].attributes)) {
                // Empty row marker: 2 bytes
                dataSize += 2;
            }
            else {
                // Row header: 3 bytes (marker + length)
                dataSize += 3;
                for (const cell of rowCells) {
                    dataSize += this.calculateCellSize(cell);
                }
            }
        }
        const buffer = Buffer.allocUnsafe(dataSize);
        let offset = 0;
        // Write header (32 bytes)
        buffer.writeUInt16LE(0x5654, offset);
        offset += 2; // Magic "VT"
        buffer.writeUInt8(0x01, offset); // Version 1 - our only format
        offset += 1; // Version
        buffer.writeUInt8(0x00, offset);
        offset += 1; // Flags
        buffer.writeUInt32LE(cols, offset);
        offset += 4; // Cols (32-bit)
        buffer.writeUInt32LE(rows, offset);
        offset += 4; // Rows (32-bit)
        buffer.writeInt32LE(viewportY, offset); // Signed for large buffers
        offset += 4; // ViewportY (32-bit signed)
        buffer.writeInt32LE(cursorX, offset); // Signed for consistency
        offset += 4; // CursorX (32-bit signed)
        buffer.writeInt32LE(cursorY, offset); // Signed for relative positions
        offset += 4; // CursorY (32-bit signed)
        buffer.writeUInt32LE(0, offset);
        offset += 4; // Reserved
        // Write cells with new optimized format
        for (let row = 0; row < cells.length; row++) {
            const rowCells = cells[row];
            // Check if this is an empty row
            if (rowCells.length === 0 ||
                (rowCells.length === 1 &&
                    rowCells[0].char === ' ' &&
                    !rowCells[0].fg &&
                    !rowCells[0].bg &&
                    !rowCells[0].attributes)) {
                // Empty row marker
                buffer.writeUInt8(0xfe, offset++); // Empty row marker
                buffer.writeUInt8(1, offset++); // Count of empty rows (for now just 1)
            }
            else {
                // Row with content
                buffer.writeUInt8(0xfd, offset++); // Row marker
                buffer.writeUInt16LE(rowCells.length, offset); // Number of cells in row
                offset += 2;
                // Write each cell
                for (const cell of rowCells) {
                    offset = this.encodeCell(buffer, offset, cell);
                }
            }
        }
        // Return exact size buffer
        const result = buffer.subarray(0, offset);
        const duration = Date.now() - startTime;
        if (duration > 5) {
            logger.debug(`Encoded snapshot: ${result.length} bytes in ${duration}ms (${rows} rows)`);
        }
        return result;
    }
    /**
     * Calculate the size needed to encode a cell
     */
    calculateCellSize(cell) {
        // Optimized encoding:
        // - Simple space with default colors: 1 byte
        // - ASCII char with default colors: 2 bytes
        // - ASCII char with colors/attrs: 2-8 bytes
        // - Unicode char: variable
        const isSpace = cell.char === ' ';
        const hasAttrs = cell.attributes && cell.attributes !== 0;
        const hasFg = cell.fg !== undefined;
        const hasBg = cell.bg !== undefined;
        const isAscii = cell.char.charCodeAt(0) <= 127;
        if (isSpace && !hasAttrs && !hasFg && !hasBg) {
            return 1; // Just a space marker
        }
        let size = 1; // Type byte
        if (isAscii) {
            size += 1; // ASCII character
        }
        else {
            const charBytes = Buffer.byteLength(cell.char, 'utf8');
            size += 1 + charBytes; // Length byte + UTF-8 bytes
        }
        // Attributes/colors byte
        if (hasAttrs || hasFg || hasBg) {
            size += 1; // Flags byte
            if (hasFg && cell.fg !== undefined) {
                size += cell.fg > 255 ? 3 : 1; // RGB or palette
            }
            if (hasBg && cell.bg !== undefined) {
                size += cell.bg > 255 ? 3 : 1; // RGB or palette
            }
        }
        return size;
    }
    /**
     * Encode a single cell into the buffer
     */
    encodeCell(buffer, offset, cell) {
        const isSpace = cell.char === ' ';
        const hasAttrs = cell.attributes && cell.attributes !== 0;
        const hasFg = cell.fg !== undefined;
        const hasBg = cell.bg !== undefined;
        const isAscii = cell.char.charCodeAt(0) <= 127;
        // Type byte format:
        // Bit 7: Has extended data (attrs/colors)
        // Bit 6: Is Unicode (vs ASCII)
        // Bit 5: Has foreground color
        // Bit 4: Has background color
        // Bit 3: Is RGB foreground (vs palette)
        // Bit 2: Is RGB background (vs palette)
        // Bits 1-0: Character type (00=space, 01=ASCII, 10=Unicode)
        if (isSpace && !hasAttrs && !hasFg && !hasBg) {
            // Simple space - 1 byte
            buffer.writeUInt8(0x00, offset++); // Type: space, no extended data
            return offset;
        }
        let typeByte = 0;
        if (hasAttrs || hasFg || hasBg) {
            typeByte |= 0x80; // Has extended data
        }
        if (!isAscii) {
            typeByte |= 0x40; // Is Unicode
            typeByte |= 0x02; // Character type: Unicode
        }
        else if (!isSpace) {
            typeByte |= 0x01; // Character type: ASCII
        }
        if (hasFg && cell.fg !== undefined) {
            typeByte |= 0x20; // Has foreground
            if (cell.fg > 255)
                typeByte |= 0x08; // Is RGB
        }
        if (hasBg && cell.bg !== undefined) {
            typeByte |= 0x10; // Has background
            if (cell.bg > 255)
                typeByte |= 0x04; // Is RGB
        }
        buffer.writeUInt8(typeByte, offset++);
        // Write character
        if (!isAscii) {
            const charBytes = Buffer.from(cell.char, 'utf8');
            buffer.writeUInt8(charBytes.length, offset++);
            charBytes.copy(buffer, offset);
            offset += charBytes.length;
        }
        else if (!isSpace) {
            buffer.writeUInt8(cell.char.charCodeAt(0), offset++);
        }
        // Write extended data if present
        if (typeByte & 0x80) {
            // Attributes byte (if any)
            if (hasAttrs && cell.attributes !== undefined) {
                buffer.writeUInt8(cell.attributes, offset++);
            }
            else if (hasFg || hasBg) {
                buffer.writeUInt8(0, offset++); // No attributes but need the byte
            }
            // Foreground color
            if (hasFg && cell.fg !== undefined) {
                if (cell.fg > 255) {
                    // RGB
                    buffer.writeUInt8((cell.fg >> 16) & 0xff, offset++);
                    buffer.writeUInt8((cell.fg >> 8) & 0xff, offset++);
                    buffer.writeUInt8(cell.fg & 0xff, offset++);
                }
                else {
                    // Palette
                    buffer.writeUInt8(cell.fg, offset++);
                }
            }
            // Background color
            if (hasBg && cell.bg !== undefined) {
                if (cell.bg > 255) {
                    // RGB
                    buffer.writeUInt8((cell.bg >> 16) & 0xff, offset++);
                    buffer.writeUInt8((cell.bg >> 8) & 0xff, offset++);
                    buffer.writeUInt8(cell.bg & 0xff, offset++);
                }
                else {
                    // Palette
                    buffer.writeUInt8(cell.bg, offset++);
                }
            }
        }
        return offset;
    }
    /**
     * Close a terminal session
     */
    closeTerminal(sessionId) {
        const sessionTerminal = this.terminals.get(sessionId);
        if (sessionTerminal) {
            if (sessionTerminal.watcher) {
                sessionTerminal.watcher.close();
            }
            sessionTerminal.terminal.dispose();
            this.terminals.delete(sessionId);
            // Clear write timer if exists
            const writeTimer = this.writeTimers.get(sessionId);
            if (writeTimer) {
                clearTimeout(writeTimer);
                this.writeTimers.delete(sessionId);
            }
            // Clear write queue
            this.writeQueues.delete(sessionId);
            logger.log(chalk_1.default.yellow(`Terminal closed for session ${truncateForLog(sessionId)}`));
        }
    }
    /**
     * Clean up old terminals
     */
    cleanup(maxAge = 30 * 60 * 1000) {
        const now = Date.now();
        const toRemove = [];
        for (const [sessionId, sessionTerminal] of this.terminals) {
            if (now - sessionTerminal.lastUpdate > maxAge) {
                toRemove.push(sessionId);
            }
        }
        for (const sessionId of toRemove) {
            logger.log(chalk_1.default.yellow(`Cleaning up stale terminal for session ${truncateForLog(sessionId)}`));
            this.closeTerminal(sessionId);
        }
        if (toRemove.length > 0) {
            logger.log(chalk_1.default.gray(`Cleaned up ${toRemove.length} stale terminals`));
        }
    }
    /**
     * Queue terminal write with rate limiting to prevent flow control issues
     */
    queueTerminalWrite(sessionId, sessionTerminal, data) {
        // Get or create write queue for this session
        let queue = this.writeQueues.get(sessionId);
        if (!queue) {
            queue = [];
            this.writeQueues.set(sessionId, queue);
        }
        // Add data to queue
        queue.push(data);
        // If no write timer is active, start processing the queue
        if (!this.writeTimers.has(sessionId)) {
            this.processWriteQueue(sessionId, sessionTerminal);
        }
    }
    /**
     * Process write queue with rate limiting
     */
    processWriteQueue(sessionId, sessionTerminal) {
        const queue = this.writeQueues.get(sessionId);
        if (!queue || queue.length === 0) {
            this.writeTimers.delete(sessionId);
            return;
        }
        // Process a batch of writes (limit batch size to prevent overwhelming the terminal)
        const batchSize = 10;
        const batch = queue.splice(0, batchSize);
        const combinedData = batch.join('');
        try {
            sessionTerminal.terminal.write(combinedData);
        }
        catch (error) {
            // Use error deduplicator to prevent log spam
            const contextKey = `${sessionId}:terminal-write`;
            if (this.errorDeduplicator.shouldLog(error, contextKey)) {
                const stats = this.errorDeduplicator.getErrorStats(error, contextKey);
                if (stats && stats.count > 1) {
                    // Log summary for repeated errors
                    logger.warn((0, error_deduplicator_js_1.formatErrorSummary)(error, stats, `terminal write for session ${truncateForLog(sessionId)}`));
                }
                else {
                    // First occurrence - log with more detail
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logger.warn(`Terminal write error for session ${truncateForLog(sessionId)}: ${errorMessage}`);
                    if (error instanceof Error && error.stack) {
                        logger.debug(`Write error stack: ${error.stack}`);
                    }
                }
            }
        }
        // Schedule next batch processing
        if (queue.length > 0) {
            const timer = setTimeout(() => {
                this.processWriteQueue(sessionId, sessionTerminal);
            }, 10); // 10ms delay between batches
            this.writeTimers.set(sessionId, timer);
        }
        else {
            this.writeTimers.delete(sessionId);
        }
    }
    /**
     * Get all active terminals
     */
    getActiveTerminals() {
        return Array.from(this.terminals.keys());
    }
    /**
     * Subscribe to buffer changes for a session
     */
    async subscribeToBufferChanges(sessionId, listener) {
        // Ensure terminal exists and is watching
        await this.getTerminal(sessionId);
        if (!this.bufferListeners.has(sessionId)) {
            this.bufferListeners.set(sessionId, new Set());
        }
        const listeners = this.bufferListeners.get(sessionId);
        if (listeners) {
            listeners.add(listener);
            logger.log(chalk_1.default.blue(`Buffer listener subscribed for session ${sessionId} (${listeners.size} total)`));
        }
        // Return unsubscribe function
        return () => {
            const listeners = this.bufferListeners.get(sessionId);
            if (listeners) {
                listeners.delete(listener);
                logger.log(chalk_1.default.yellow(`Buffer listener unsubscribed for session ${sessionId} (${listeners.size} remaining)`));
                if (listeners.size === 0) {
                    this.bufferListeners.delete(sessionId);
                }
            }
        };
    }
    /**
     * Schedule buffer change notification (debounced)
     */
    scheduleBufferChangeNotification(sessionId) {
        // Cancel existing timer
        const existingTimer = this.changeTimers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        // Schedule new notification in 50ms
        const timer = setTimeout(() => {
            this.changeTimers.delete(sessionId);
            this.notifyBufferChange(sessionId);
        }, 50);
        this.changeTimers.set(sessionId, timer);
    }
    /**
     * Notify listeners of buffer change
     */
    async notifyBufferChange(sessionId) {
        const listeners = this.bufferListeners.get(sessionId);
        if (!listeners || listeners.size === 0)
            return;
        // logger.debug(
        //   `Notifying ${listeners.size} buffer change listeners for session ${truncateForLog(sessionId)}`
        // );
        try {
            // Get full buffer snapshot
            const snapshot = await this.getBufferSnapshot(sessionId);
            // Notify all listeners
            listeners.forEach((listener) => {
                try {
                    listener(sessionId, snapshot);
                }
                catch (error) {
                    logger.error(`Error notifying buffer change listener for ${truncateForLog(sessionId)}:`, error);
                }
            });
        }
        catch (error) {
            logger.error(`Error getting buffer snapshot for notification ${truncateForLog(sessionId)}:`, error);
        }
    }
    /**
     * Resume file watching for a paused session
     */
    async resumeFileWatcher(sessionId) {
        const sessionTerminal = this.terminals.get(sessionId);
        if (!sessionTerminal || sessionTerminal.watcher) {
            return; // Already watching or session doesn't exist
        }
        await this.watchStreamFile(sessionId);
    }
    /**
     * Destroy the terminal manager and restore console overrides
     */
    destroy() {
        // Close all terminals
        for (const sessionId of this.terminals.keys()) {
            this.closeTerminal(sessionId);
        }
        // Clear all timers
        for (const timer of this.changeTimers.values()) {
            clearTimeout(timer);
        }
        this.changeTimers.clear();
        // Clear write timers
        for (const timer of this.writeTimers.values()) {
            clearTimeout(timer);
        }
        this.writeTimers.clear();
        // Clear write queues
        this.writeQueues.clear();
        // Clear flow control timer
        if (this.flowControlTimer) {
            clearInterval(this.flowControlTimer);
            this.flowControlTimer = undefined;
        }
        // Restore original console.warn
        console.warn = this.originalConsoleWarn;
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvc2VydmljZXMvdGVybWluYWwtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw4Q0FBNEQ7QUFDNUQsa0RBQTBCO0FBQzFCLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsMEVBQXVGO0FBQ3ZGLGtEQUFrRDtBQUVsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUVoRCx1REFBdUQ7QUFDdkQsU0FBUyxjQUFjLENBQUMsR0FBVyxFQUFFLFlBQW9CLEVBQUU7SUFDekQsSUFBSSxHQUFHLENBQUMsTUFBTSxJQUFJLFNBQVM7UUFBRSxPQUFPLEdBQUcsQ0FBQztJQUN4QyxPQUFPLEdBQUcsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLE9BQU8sR0FBRyxDQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ3hFLENBQUM7QUFFRCw2QkFBNkI7QUFDN0IsTUFBTSxtQkFBbUIsR0FBRztJQUMxQixrRUFBa0U7SUFDbEUsOERBQThEO0lBQzlELGFBQWEsRUFBRSxHQUFHO0lBQ2xCLHlEQUF5RDtJQUN6RCxzREFBc0Q7SUFDdEQsWUFBWSxFQUFFLEdBQUc7SUFDakIsOENBQThDO0lBQzlDLG1FQUFtRTtJQUNuRSxhQUFhLEVBQUUsR0FBRyxFQUFFLEtBQUs7SUFDekIsbURBQW1EO0lBQ25ELGlGQUFpRjtJQUNqRixlQUFlLEVBQUUsS0FBSztJQUN0Qix5REFBeUQ7SUFDekQsNkVBQTZFO0lBQzdFLFlBQVksRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksRUFBRSxZQUFZO0lBQ3pDLGtEQUFrRDtJQUNsRCxvRUFBb0U7SUFDcEUsbUJBQW1CLEVBQUUsR0FBRztDQUN6QixDQUFDO0FBa0NGOzs7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LENBQUMsU0FBUyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELG1CQUFtQjtRQUNuQixLQUFLLE1BQU0sS0FBSyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUMvQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFMUIscUJBQXFCO1FBQ3JCLEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQzlDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUV6QixxQkFBcUI7UUFDckIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUV6QiwyQkFBMkI7UUFDM0IsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUMxQixhQUFhLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFNBQVMsQ0FBQztRQUNwQyxDQUFDO1FBRUQsZ0NBQWdDO1FBQ2hDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDO0lBQzFDLENBQUM7Q0FDRjtBQXBwQ0QsMENBb3BDQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFRlcm1pbmFsIGFzIFh0ZXJtVGVybWluYWwgfSBmcm9tICdAeHRlcm0vaGVhZGxlc3MnO1xuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBFcnJvckRlZHVwbGljYXRvciwgZm9ybWF0RXJyb3JTdW1tYXJ5IH0gZnJvbSAnLi4vdXRpbHMvZXJyb3ItZGVkdXBsaWNhdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigndGVybWluYWwtbWFuYWdlcicpO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gdHJ1bmNhdGUgbG9uZyBzdHJpbmdzIGZvciBsb2dnaW5nXG5mdW5jdGlvbiB0cnVuY2F0ZUZvckxvZyhzdHI6IHN0cmluZywgbWF4TGVuZ3RoOiBudW1iZXIgPSA1MCk6IHN0cmluZyB7XG4gIGlmIChzdHIubGVuZ3RoIDw9IG1heExlbmd0aCkgcmV0dXJuIHN0cjtcbiAgcmV0dXJuIGAke3N0ci5zdWJzdHJpbmcoMCwgbWF4TGVuZ3RoKX0uLi4oJHtzdHIubGVuZ3RofSBjaGFycyB0b3RhbClgO1xufVxuXG4vLyBGbG93IGNvbnRyb2wgY29uZmlndXJhdGlvblxuY29uc3QgRkxPV19DT05UUk9MX0NPTkZJRyA9IHtcbiAgLy8gV2hlbiBidWZmZXIgZXhjZWVkcyB0aGlzIHBlcmNlbnRhZ2Ugb2YgbWF4IGxpbmVzLCBwYXVzZSByZWFkaW5nXG4gIC8vIDgwJSBnaXZlcyBhIGdvb2QgYnVmZmVyIGJlZm9yZSBoaXR0aW5nIHRoZSBzY3JvbGxiYWNrIGxpbWl0XG4gIGhpZ2hXYXRlcm1hcms6IDAuOCxcbiAgLy8gUmVzdW1lIHJlYWRpbmcgd2hlbiBidWZmZXIgZHJvcHMgYmVsb3cgdGhpcyBwZXJjZW50YWdlXG4gIC8vIDUwJSBlbnN1cmVzIGVub3VnaCBzcGFjZSBpcyBjbGVhcmVkIGJlZm9yZSByZXN1bWluZ1xuICBsb3dXYXRlcm1hcms6IDAuNSxcbiAgLy8gQ2hlY2sgaW50ZXJ2YWwgZm9yIHJlc3VtaW5nIHBhdXNlZCBzZXNzaW9uc1xuICAvLyAxMDBtcyBwcm92aWRlcyByZXNwb25zaXZlIHJlc3VtcHRpb24gd2l0aG91dCBleGNlc3NpdmUgQ1BVIHVzYWdlXG4gIGNoZWNrSW50ZXJ2YWw6IDEwMCwgLy8gbXNcbiAgLy8gTWF4aW11bSBwZW5kaW5nIGxpbmVzIHRvIGFjY3VtdWxhdGUgd2hpbGUgcGF1c2VkXG4gIC8vIDEwSyBsaW5lcyBoYW5kbGVzIGJ1cnN0cyB3aXRob3V0IGV4Y2Vzc2l2ZSBtZW1vcnkgKGF2ZyB+MU1CIGF0IDEwMCBjaGFycy9saW5lKVxuICBtYXhQZW5kaW5nTGluZXM6IDEwMDAwLFxuICAvLyBNYXhpbXVtIHRpbWUgYSBzZXNzaW9uIGNhbiBiZSBwYXVzZWQgYmVmb3JlIHRpbWluZyBvdXRcbiAgLy8gNSBtaW51dGVzIGhhbmRsZXMgdGVtcG9yYXJ5IGNsaWVudCBpc3N1ZXMgd2l0aG91dCBpbmRlZmluaXRlIG1lbW9yeSBncm93dGhcbiAgbWF4UGF1c2VUaW1lOiA1ICogNjAgKiAxMDAwLCAvLyA1IG1pbnV0ZXNcbiAgLy8gTGluZXMgdG8gcHJvY2VzcyBiZXR3ZWVuIGJ1ZmZlciBwcmVzc3VyZSBjaGVja3NcbiAgLy8gQ2hlY2tpbmcgZXZlcnkgMTAwIGxpbmVzIGJhbGFuY2VzIHBlcmZvcm1hbmNlIHdpdGggcmVzcG9uc2l2ZW5lc3NcbiAgYnVmZmVyQ2hlY2tJbnRlcnZhbDogMTAwLFxufTtcblxuaW50ZXJmYWNlIFNlc3Npb25UZXJtaW5hbCB7XG4gIHRlcm1pbmFsOiBYdGVybVRlcm1pbmFsO1xuICB3YXRjaGVyPzogZnMuRlNXYXRjaGVyO1xuICBsYXN0VXBkYXRlOiBudW1iZXI7XG4gIGlzUGF1c2VkPzogYm9vbGVhbjtcbiAgcGVuZGluZ0xpbmVzPzogc3RyaW5nW107XG4gIHBhdXNlZEF0PzogbnVtYmVyO1xuICBsaW5lc1Byb2Nlc3NlZFNpbmNlQ2hlY2s/OiBudW1iZXI7XG4gIGlzUHJvY2Vzc2luZ1BlbmRpbmc/OiBib29sZWFuO1xuICBsYXN0RmlsZU9mZnNldD86IG51bWJlcjtcbiAgbGluZUJ1ZmZlcj86IHN0cmluZztcbn1cblxudHlwZSBCdWZmZXJDaGFuZ2VMaXN0ZW5lciA9IChzZXNzaW9uSWQ6IHN0cmluZywgc25hcHNob3Q6IEJ1ZmZlclNuYXBzaG90KSA9PiB2b2lkO1xuXG5pbnRlcmZhY2UgQnVmZmVyQ2VsbCB7XG4gIGNoYXI6IHN0cmluZztcbiAgd2lkdGg6IG51bWJlcjtcbiAgZmc/OiBudW1iZXI7XG4gIGJnPzogbnVtYmVyO1xuICBhdHRyaWJ1dGVzPzogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQnVmZmVyU25hcHNob3Qge1xuICBjb2xzOiBudW1iZXI7XG4gIHJvd3M6IG51bWJlcjtcbiAgdmlld3BvcnRZOiBudW1iZXI7XG4gIGN1cnNvclg6IG51bWJlcjtcbiAgY3Vyc29yWTogbnVtYmVyO1xuICBjZWxsczogQnVmZmVyQ2VsbFtdW107XG59XG5cbi8qKlxuICogTWFuYWdlcyB0ZXJtaW5hbCBpbnN0YW5jZXMgYW5kIHRoZWlyIGJ1ZmZlciBvcGVyYXRpb25zIGZvciB0ZXJtaW5hbCBzZXNzaW9ucy5cbiAqXG4gKiBQcm92aWRlcyBoaWdoLXBlcmZvcm1hbmNlIHRlcm1pbmFsIGVtdWxhdGlvbiB1c2luZyB4dGVybS5qcyBoZWFkbGVzcyB0ZXJtaW5hbHMsXG4gKiB3aXRoIHNvcGhpc3RpY2F0ZWQgZmxvdyBjb250cm9sLCBidWZmZXIgbWFuYWdlbWVudCwgYW5kIHJlYWwtdGltZSBjaGFuZ2VcbiAqIG5vdGlmaWNhdGlvbnMuIEhhbmRsZXMgYXNjaWluZW1hIHN0cmVhbSBwYXJzaW5nLCB0ZXJtaW5hbCByZXNpemluZywgYW5kXG4gKiBlZmZpY2llbnQgYmluYXJ5IGVuY29kaW5nIG9mIHRlcm1pbmFsIGJ1ZmZlcnMuXG4gKlxuICogS2V5IGZlYXR1cmVzOlxuICogLSBIZWFkbGVzcyB4dGVybS5qcyB0ZXJtaW5hbCBpbnN0YW5jZXMgd2l0aCAxMEsgbGluZSBzY3JvbGxiYWNrXG4gKiAtIEFzY2lpbmVtYSB2MiBmb3JtYXQgc3RyZWFtIHBhcnNpbmcgYW5kIHBsYXliYWNrXG4gKiAtIEZsb3cgY29udHJvbCB3aXRoIGJhY2twcmVzc3VyZSB0byBwcmV2ZW50IG1lbW9yeSBleGhhdXN0aW9uXG4gKiAtIEVmZmljaWVudCBiaW5hcnkgYnVmZmVyIGVuY29kaW5nIGZvciBXZWJTb2NrZXQgdHJhbnNtaXNzaW9uXG4gKiAtIFJlYWwtdGltZSBidWZmZXIgY2hhbmdlIG5vdGlmaWNhdGlvbnMgd2l0aCBkZWJvdW5jaW5nXG4gKiAtIEVycm9yIGRlZHVwbGljYXRpb24gdG8gcHJldmVudCBsb2cgc3BhbVxuICogLSBBdXRvbWF0aWMgY2xlYW51cCBvZiBzdGFsZSB0ZXJtaW5hbHNcbiAqXG4gKiBGbG93IGNvbnRyb2wgc3RyYXRlZ3k6XG4gKiAtIFBhdXNlcyByZWFkaW5nIHdoZW4gYnVmZmVyIHJlYWNoZXMgODAlIGNhcGFjaXR5XG4gKiAtIFJlc3VtZXMgd2hlbiBidWZmZXIgZHJvcHMgYmVsb3cgNTAlXG4gKiAtIFF1ZXVlcyB1cCB0byAxMEsgcGVuZGluZyBsaW5lcyB3aGlsZSBwYXVzZWRcbiAqIC0gVGltZXMgb3V0IHBhdXNlZCBzZXNzaW9ucyBhZnRlciA1IG1pbnV0ZXNcbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgbWFuYWdlciA9IG5ldyBUZXJtaW5hbE1hbmFnZXIoJy92YXIvcnVuL3ZpYmV0dW5uZWwnKTtcbiAqXG4gKiAvLyBHZXQgdGVybWluYWwgZm9yIHNlc3Npb25cbiAqIGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgbWFuYWdlci5nZXRUZXJtaW5hbChzZXNzaW9uSWQpO1xuICpcbiAqIC8vIFN1YnNjcmliZSB0byBidWZmZXIgY2hhbmdlc1xuICogY29uc3QgdW5zdWJzY3JpYmUgPSBhd2FpdCBtYW5hZ2VyLnN1YnNjcmliZVRvQnVmZmVyQ2hhbmdlcyhcbiAqICAgc2Vzc2lvbklkLFxuICogICAoaWQsIHNuYXBzaG90KSA9PiB7XG4gKiAgICAgY29uc3QgZW5jb2RlZCA9IG1hbmFnZXIuZW5jb2RlU25hcHNob3Qoc25hcHNob3QpO1xuICogICAgIHdzLnNlbmQoZW5jb2RlZCk7XG4gKiAgIH1cbiAqICk7XG4gKiBgYGBcbiAqXG4gKiBAc2VlIFh0ZXJtVGVybWluYWwgLSBUZXJtaW5hbCBlbXVsYXRpb24gZW5naW5lXG4gKiBAc2VlIHdlYi9zcmMvc2VydmVyL3NlcnZpY2VzL2J1ZmZlci1hZ2dyZWdhdG9yLnRzIC0gQWdncmVnYXRlcyBidWZmZXIgdXBkYXRlc1xuICogQHNlZSB3ZWIvc3JjL3NlcnZlci9wdHkvYXNjaWluZW1hLXdyaXRlci50cyAtIFdyaXRlcyBhc2NpaW5lbWEgc3RyZWFtc1xuICovXG5leHBvcnQgY2xhc3MgVGVybWluYWxNYW5hZ2VyIHtcbiAgcHJpdmF0ZSB0ZXJtaW5hbHM6IE1hcDxzdHJpbmcsIFNlc3Npb25UZXJtaW5hbD4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgY29udHJvbERpcjogc3RyaW5nO1xuICBwcml2YXRlIGJ1ZmZlckxpc3RlbmVyczogTWFwPHN0cmluZywgU2V0PEJ1ZmZlckNoYW5nZUxpc3RlbmVyPj4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgY2hhbmdlVGltZXJzOiBNYXA8c3RyaW5nLCBOb2RlSlMuVGltZW91dD4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgd3JpdGVRdWV1ZXM6IE1hcDxzdHJpbmcsIHN0cmluZ1tdPiA9IG5ldyBNYXAoKTtcbiAgcHJpdmF0ZSB3cml0ZVRpbWVyczogTWFwPHN0cmluZywgTm9kZUpTLlRpbWVvdXQ+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIGVycm9yRGVkdXBsaWNhdG9yID0gbmV3IEVycm9yRGVkdXBsaWNhdG9yKHtcbiAgICBrZXlFeHRyYWN0b3I6IChlcnJvciwgY29udGV4dCkgPT4ge1xuICAgICAgLy8gVXNlIHNlc3Npb24gSUQgYW5kIGxpbmUgcHJlZml4IGFzIGNvbnRleHQgZm9yIHh0ZXJtIHBhcnNpbmcgZXJyb3JzXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICByZXR1cm4gYCR7Y29udGV4dH06JHtlcnJvck1lc3NhZ2V9YDtcbiAgICB9LFxuICB9KTtcbiAgcHJpdmF0ZSBvcmlnaW5hbENvbnNvbGVXYXJuOiB0eXBlb2YgY29uc29sZS53YXJuO1xuICBwcml2YXRlIGZsb3dDb250cm9sVGltZXI/OiBOb2RlSlMuVGltZW91dDtcblxuICBjb25zdHJ1Y3Rvcihjb250cm9sRGlyOiBzdHJpbmcpIHtcbiAgICB0aGlzLmNvbnRyb2xEaXIgPSBjb250cm9sRGlyO1xuXG4gICAgLy8gT3ZlcnJpZGUgY29uc29sZS53YXJuIHRvIHN1cHByZXNzIHh0ZXJtLmpzIHBhcnNpbmcgd2FybmluZ3NcbiAgICB0aGlzLm9yaWdpbmFsQ29uc29sZVdhcm4gPSBjb25zb2xlLndhcm47XG4gICAgY29uc29sZS53YXJuID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGFyZ3NbMF07XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAobWVzc2FnZS5pbmNsdWRlcygneHRlcm0uanMgcGFyc2luZyBlcnJvcicpIHx8XG4gICAgICAgICAgbWVzc2FnZS5pbmNsdWRlcygnVW5hYmxlIHRvIHByb2Nlc3MgY2hhcmFjdGVyJykgfHxcbiAgICAgICAgICBtZXNzYWdlLmluY2x1ZGVzKCdDYW5ub3QgcmVhZCBwcm9wZXJ0aWVzIG9mIHVuZGVmaW5lZCcpKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFN1cHByZXNzIHh0ZXJtLmpzIHBhcnNpbmcgd2FybmluZ3NcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhpcy5vcmlnaW5hbENvbnNvbGVXYXJuLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuICAgIH07XG5cbiAgICAvLyBTdGFydCBmbG93IGNvbnRyb2wgY2hlY2sgdGltZXJcbiAgICB0aGlzLnN0YXJ0Rmxvd0NvbnRyb2xUaW1lcigpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBvciBjcmVhdGUgYSB0ZXJtaW5hbCBmb3IgYSBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBnZXRUZXJtaW5hbChzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8WHRlcm1UZXJtaW5hbD4ge1xuICAgIGxldCBzZXNzaW9uVGVybWluYWwgPSB0aGlzLnRlcm1pbmFscy5nZXQoc2Vzc2lvbklkKTtcblxuICAgIGlmICghc2Vzc2lvblRlcm1pbmFsKSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IHRlcm1pbmFsIHdpdGggbWVtb3J5LWNvbnNjaW91cyBzZXR0aW5nc1xuICAgICAgY29uc3QgdGVybWluYWwgPSBuZXcgWHRlcm1UZXJtaW5hbCh7XG4gICAgICAgIGNvbHM6IDgwLFxuICAgICAgICByb3dzOiAyNCxcbiAgICAgICAgc2Nyb2xsYmFjazogNTAwMCwgLy8gUmVkdWNlZCBmcm9tIDEwSyB0byBwcmV2ZW50IG1lbW9yeSBpc3N1ZXMgaW4gbG9uZy1ydW5uaW5nIHNlc3Npb25zXG4gICAgICAgIGFsbG93UHJvcG9zZWRBcGk6IHRydWUsXG4gICAgICAgIGNvbnZlcnRFb2w6IHRydWUsXG4gICAgICB9KTtcblxuICAgICAgc2Vzc2lvblRlcm1pbmFsID0ge1xuICAgICAgICB0ZXJtaW5hbCxcbiAgICAgICAgbGFzdFVwZGF0ZTogRGF0ZS5ub3coKSxcbiAgICAgIH07XG5cbiAgICAgIHRoaXMudGVybWluYWxzLnNldChzZXNzaW9uSWQsIHNlc3Npb25UZXJtaW5hbCk7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay5ncmVlbihgVGVybWluYWwgY3JlYXRlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKCR7dGVybWluYWwuY29sc314JHt0ZXJtaW5hbC5yb3dzfSlgKVxuICAgICAgKTtcblxuICAgICAgLy8gU3RhcnQgd2F0Y2hpbmcgdGhlIHN0cmVhbSBmaWxlXG4gICAgICBhd2FpdCB0aGlzLndhdGNoU3RyZWFtRmlsZShzZXNzaW9uSWQpO1xuICAgIH1cblxuICAgIHNlc3Npb25UZXJtaW5hbC5sYXN0VXBkYXRlID0gRGF0ZS5ub3coKTtcbiAgICByZXR1cm4gc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsO1xuICB9XG5cbiAgLyoqXG4gICAqIFdhdGNoIHN0cmVhbSBmaWxlIGZvciBjaGFuZ2VzXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHdhdGNoU3RyZWFtRmlsZShzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb25UZXJtaW5hbCA9IHRoaXMudGVybWluYWxzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvblRlcm1pbmFsKSByZXR1cm47XG5cbiAgICBjb25zdCBzdHJlYW1QYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbERpciwgc2Vzc2lvbklkLCAnc3Rkb3V0Jyk7XG4gICAgbGV0IGxhc3RPZmZzZXQgPSBzZXNzaW9uVGVybWluYWwubGFzdEZpbGVPZmZzZXQgfHwgMDtcbiAgICBsZXQgbGluZUJ1ZmZlciA9IHNlc3Npb25UZXJtaW5hbC5saW5lQnVmZmVyIHx8ICcnO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIGZpbGUgZXhpc3RzXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHN0cmVhbVBhdGgpKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBTdHJlYW0gZmlsZSBkb2VzIG5vdCBleGlzdCBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9OiAke3RydW5jYXRlRm9yTG9nKHN0cmVhbVBhdGgsIDEwMCl9YFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gUmVhZCBleGlzdGluZyBjb250ZW50IGZpcnN0XG4gICAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHN0cmVhbVBhdGgsICd1dGY4Jyk7XG4gICAgICBsYXN0T2Zmc2V0ID0gQnVmZmVyLmJ5dGVMZW5ndGgoY29udGVudCwgJ3V0ZjgnKTtcblxuICAgICAgLy8gUHJvY2VzcyBleGlzdGluZyBjb250ZW50XG4gICAgICBjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgIGlmIChsaW5lLnRyaW0oKSkge1xuICAgICAgICAgIHRoaXMuaGFuZGxlU3RyZWFtTGluZShzZXNzaW9uSWQsIHNlc3Npb25UZXJtaW5hbCwgbGluZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2F0Y2ggZm9yIGNoYW5nZXNcbiAgICAgIHNlc3Npb25UZXJtaW5hbC53YXRjaGVyID0gZnMud2F0Y2goc3RyZWFtUGF0aCwgKGV2ZW50VHlwZSkgPT4ge1xuICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnY2hhbmdlJykge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBzdGF0cyA9IGZzLnN0YXRTeW5jKHN0cmVhbVBhdGgpO1xuICAgICAgICAgICAgaWYgKHN0YXRzLnNpemUgPiBsYXN0T2Zmc2V0KSB7XG4gICAgICAgICAgICAgIC8vIFJlYWQgb25seSB0aGUgbmV3IGRhdGFcbiAgICAgICAgICAgICAgY29uc3QgZmQgPSBmcy5vcGVuU3luYyhzdHJlYW1QYXRoLCAncicpO1xuICAgICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2Moc3RhdHMuc2l6ZSAtIGxhc3RPZmZzZXQpO1xuICAgICAgICAgICAgICBmcy5yZWFkU3luYyhmZCwgYnVmZmVyLCAwLCBidWZmZXIubGVuZ3RoLCBsYXN0T2Zmc2V0KTtcbiAgICAgICAgICAgICAgZnMuY2xvc2VTeW5jKGZkKTtcblxuICAgICAgICAgICAgICAvLyBVcGRhdGUgb2Zmc2V0XG4gICAgICAgICAgICAgIGxhc3RPZmZzZXQgPSBzdGF0cy5zaXplO1xuICAgICAgICAgICAgICBzZXNzaW9uVGVybWluYWwubGFzdEZpbGVPZmZzZXQgPSBsYXN0T2Zmc2V0O1xuXG4gICAgICAgICAgICAgIC8vIFByb2Nlc3MgbmV3IGRhdGFcbiAgICAgICAgICAgICAgY29uc3QgbmV3RGF0YSA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuICAgICAgICAgICAgICBsaW5lQnVmZmVyICs9IG5ld0RhdGE7XG5cbiAgICAgICAgICAgICAgLy8gUHJvY2VzcyBjb21wbGV0ZSBsaW5lc1xuICAgICAgICAgICAgICBjb25zdCBsaW5lcyA9IGxpbmVCdWZmZXIuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgICBsaW5lQnVmZmVyID0gbGluZXMucG9wKCkgfHwgJyc7IC8vIEtlZXAgaW5jb21wbGV0ZSBsaW5lIGZvciBuZXh0IHRpbWVcbiAgICAgICAgICAgICAgc2Vzc2lvblRlcm1pbmFsLmxpbmVCdWZmZXIgPSBsaW5lQnVmZmVyO1xuXG4gICAgICAgICAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAgICAgICAgIGlmIChsaW5lLnRyaW0oKSkge1xuICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVTdHJlYW1MaW5lKHNlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsLCBsaW5lKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRXJyb3IgcmVhZGluZyBzdHJlYW0gZmlsZSBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9OmAsXG4gICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYFdhdGNoaW5nIHN0cmVhbSBmaWxlIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX1gKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHdhdGNoIHN0cmVhbSBmaWxlIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX06YCwgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGZsb3cgY29udHJvbCB0aW1lciB0byBjaGVjayBwYXVzZWQgc2Vzc2lvbnNcbiAgICovXG4gIHByaXZhdGUgc3RhcnRGbG93Q29udHJvbFRpbWVyKCk6IHZvaWQge1xuICAgIGxldCBjaGVja0luZGV4ID0gMDtcbiAgICBjb25zdCBzZXNzaW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdGhpcy5mbG93Q29udHJvbFRpbWVyID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgLy8gUmVidWlsZCBzZXNzaW9uIGxpc3QgcGVyaW9kaWNhbGx5XG4gICAgICBpZiAoY2hlY2tJbmRleCA9PT0gMCkge1xuICAgICAgICBzZXNzaW9uSWRzLmxlbmd0aCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsXSBvZiB0aGlzLnRlcm1pbmFscykge1xuICAgICAgICAgIGlmIChzZXNzaW9uVGVybWluYWwuaXNQYXVzZWQpIHtcbiAgICAgICAgICAgIHNlc3Npb25JZHMucHVzaChzZXNzaW9uSWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIG9uZSBzZXNzaW9uIHBlciB0aWNrIHRvIGF2b2lkIHRodW5kZXJpbmcgaGVyZFxuICAgICAgaWYgKHNlc3Npb25JZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBzZXNzaW9uSWQgPSBzZXNzaW9uSWRzW2NoZWNrSW5kZXggJSBzZXNzaW9uSWRzLmxlbmd0aF07XG4gICAgICAgIGNvbnN0IHNlc3Npb25UZXJtaW5hbCA9IHRoaXMudGVybWluYWxzLmdldChzZXNzaW9uSWQpO1xuXG4gICAgICAgIGlmIChzZXNzaW9uVGVybWluYWw/LmlzUGF1c2VkKSB7XG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIHRpbWVvdXRcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXNzaW9uVGVybWluYWwucGF1c2VkQXQgJiZcbiAgICAgICAgICAgIERhdGUubm93KCkgLSBzZXNzaW9uVGVybWluYWwucGF1c2VkQXQgPiBGTE9XX0NPTlRST0xfQ09ORklHLm1heFBhdXNlVGltZVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAgIGNoYWxrLnJlZChcbiAgICAgICAgICAgICAgICBgU2Vzc2lvbiAke3Nlc3Npb25JZH0gaGFzIGJlZW4gcGF1c2VkIGZvciB0b28gbG9uZy4gYCArXG4gICAgICAgICAgICAgICAgICBgRHJvcHBpbmcgJHtzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzPy5sZW5ndGggfHwgMH0gcGVuZGluZyBsaW5lcy5gXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBzZXNzaW9uVGVybWluYWwuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMgPSBbXTtcbiAgICAgICAgICAgIHNlc3Npb25UZXJtaW5hbC5wYXVzZWRBdCA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgLy8gUmVzdW1lIGZpbGUgd2F0Y2hpbmcgYWZ0ZXIgdGltZW91dFxuICAgICAgICAgICAgdGhpcy5yZXN1bWVGaWxlV2F0Y2hlcihzZXNzaW9uSWQpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgYEZhaWxlZCB0byByZXN1bWUgZmlsZSB3YXRjaGVyIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfSBhZnRlciB0aW1lb3V0OmAsXG4gICAgICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmNoZWNrQnVmZmVyUHJlc3N1cmUoc2Vzc2lvbklkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjaGVja0luZGV4ID0gKGNoZWNrSW5kZXggKyAxKSAlIE1hdGgubWF4KHNlc3Npb25JZHMubGVuZ3RoLCAxKTtcbiAgICAgIH1cbiAgICB9LCBGTE9XX0NPTlRST0xfQ09ORklHLmNoZWNrSW50ZXJ2YWwpO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGJ1ZmZlciBwcmVzc3VyZSBhbmQgcGF1c2UvcmVzdW1lIGFzIG5lZWRlZFxuICAgKi9cbiAgcHJpdmF0ZSBjaGVja0J1ZmZlclByZXNzdXJlKHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3Qgc2Vzc2lvblRlcm1pbmFsID0gdGhpcy50ZXJtaW5hbHMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uVGVybWluYWwpIHJldHVybiBmYWxzZTtcblxuICAgIGNvbnN0IHRlcm1pbmFsID0gc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsO1xuICAgIGNvbnN0IGJ1ZmZlciA9IHRlcm1pbmFsLmJ1ZmZlci5hY3RpdmU7XG4gICAgY29uc3QgbWF4TGluZXMgPSB0ZXJtaW5hbC5vcHRpb25zLnNjcm9sbGJhY2sgfHwgMTAwMDA7XG4gICAgY29uc3QgY3VycmVudExpbmVzID0gYnVmZmVyLmxlbmd0aDtcbiAgICBjb25zdCBidWZmZXJVdGlsaXphdGlvbiA9IGN1cnJlbnRMaW5lcyAvIG1heExpbmVzO1xuXG4gICAgY29uc3Qgd2FzUGF1c2VkID0gc2Vzc2lvblRlcm1pbmFsLmlzUGF1c2VkIHx8IGZhbHNlO1xuXG4gICAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHBhdXNlXG4gICAgaWYgKCF3YXNQYXVzZWQgJiYgYnVmZmVyVXRpbGl6YXRpb24gPiBGTE9XX0NPTlRST0xfQ09ORklHLmhpZ2hXYXRlcm1hcmspIHtcbiAgICAgIHNlc3Npb25UZXJtaW5hbC5pc1BhdXNlZCA9IHRydWU7XG4gICAgICBzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzID0gW107XG4gICAgICBzZXNzaW9uVGVybWluYWwucGF1c2VkQXQgPSBEYXRlLm5vdygpO1xuXG4gICAgICAvLyBBcHBseSBiYWNrcHJlc3N1cmUgYnkgY2xvc2luZyB0aGUgZmlsZSB3YXRjaGVyXG4gICAgICBpZiAoc2Vzc2lvblRlcm1pbmFsLndhdGNoZXIpIHtcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLndhdGNoZXIuY2xvc2UoKTtcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLndhdGNoZXIgPSB1bmRlZmluZWQ7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgYEJ1ZmZlciBwcmVzc3VyZSBoaWdoIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTogJHtNYXRoLnJvdW5kKGJ1ZmZlclV0aWxpemF0aW9uICogMTAwKX0lIGAgK1xuICAgICAgICAgICAgYCgke2N1cnJlbnRMaW5lc30vJHttYXhMaW5lc30gbGluZXMpLiBQYXVzaW5nIGZpbGUgd2F0Y2hlci5gXG4gICAgICAgIClcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB3ZSBzaG91bGQgcmVzdW1lXG4gICAgaWYgKHdhc1BhdXNlZCAmJiBidWZmZXJVdGlsaXphdGlvbiA8IEZMT1dfQ09OVFJPTF9DT05GSUcubG93V2F0ZXJtYXJrKSB7XG4gICAgICAvLyBBdm9pZCByYWNlIGNvbmRpdGlvbjogbWFyayBhcyBwcm9jZXNzaW5nIHBlbmRpbmcgYmVmb3JlIHJlc3VtaW5nXG4gICAgICBpZiAoXG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMgJiZcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLnBlbmRpbmdMaW5lcy5sZW5ndGggPiAwICYmXG4gICAgICAgICFzZXNzaW9uVGVybWluYWwuaXNQcm9jZXNzaW5nUGVuZGluZ1xuICAgICAgKSB7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC5pc1Byb2Nlc3NpbmdQZW5kaW5nID0gdHJ1ZTtcblxuICAgICAgICBjb25zdCBwZW5kaW5nQ291bnQgPSBzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzLmxlbmd0aDtcbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBjaGFsay5ncmVlbihcbiAgICAgICAgICAgIGBCdWZmZXIgcHJlc3N1cmUgbm9ybWFsaXplZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7TWF0aC5yb3VuZChidWZmZXJVdGlsaXphdGlvbiAqIDEwMCl9JSBgICtcbiAgICAgICAgICAgICAgYCgke2N1cnJlbnRMaW5lc30vJHttYXhMaW5lc30gbGluZXMpLiBQcm9jZXNzaW5nICR7cGVuZGluZ0NvdW50fSBwZW5kaW5nIGxpbmVzLmBcbiAgICAgICAgICApXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gUHJvY2VzcyBwZW5kaW5nIGxpbmVzIGFzeW5jaHJvbm91c2x5IHRvIGF2b2lkIGJsb2NraW5nXG4gICAgICAgIHNldEltbWVkaWF0ZSgoKSA9PiB7XG4gICAgICAgICAgY29uc3QgbGluZXMgPSBzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzIHx8IFtdO1xuICAgICAgICAgIHNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMgPSBbXTtcbiAgICAgICAgICBzZXNzaW9uVGVybWluYWwuaXNQYXVzZWQgPSBmYWxzZTtcbiAgICAgICAgICBzZXNzaW9uVGVybWluYWwucGF1c2VkQXQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgc2Vzc2lvblRlcm1pbmFsLmlzUHJvY2Vzc2luZ1BlbmRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgIGZvciAoY29uc3QgcGVuZGluZ0xpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc1N0cmVhbUxpbmUoc2Vzc2lvbklkLCBzZXNzaW9uVGVybWluYWwsIHBlbmRpbmdMaW5lKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBSZXN1bWUgZmlsZSB3YXRjaGluZyBhZnRlciBwcm9jZXNzaW5nIHBlbmRpbmcgbGluZXNcbiAgICAgICAgICB0aGlzLnJlc3VtZUZpbGVXYXRjaGVyKHNlc3Npb25JZCkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgdG8gcmVzdW1lIGZpbGUgd2F0Y2hlciBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9OmAsXG4gICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAoIXNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMgfHwgc2Vzc2lvblRlcm1pbmFsLnBlbmRpbmdMaW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gTm8gcGVuZGluZyBsaW5lcywganVzdCByZXN1bWVcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLmlzUGF1c2VkID0gZmFsc2U7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC5wYXVzZWRBdCA9IHVuZGVmaW5lZDtcblxuICAgICAgICAvLyBSZXN1bWUgZmlsZSB3YXRjaGluZ1xuICAgICAgICB0aGlzLnJlc3VtZUZpbGVXYXRjaGVyKHNlc3Npb25JZCkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgYEZhaWxlZCB0byByZXN1bWUgZmlsZSB3YXRjaGVyIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX06YCxcbiAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICBjaGFsay5ncmVlbihcbiAgICAgICAgICAgIGBCdWZmZXIgcHJlc3N1cmUgbm9ybWFsaXplZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7TWF0aC5yb3VuZChidWZmZXJVdGlsaXphdGlvbiAqIDEwMCl9JSBgICtcbiAgICAgICAgICAgICAgYCgke2N1cnJlbnRMaW5lc30vJHttYXhMaW5lc30gbGluZXMpLiBSZXN1bWluZyBmaWxlIHdhdGNoZXIuYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gd2FzUGF1c2VkO1xuICB9XG5cbiAgLyoqXG4gICAqIEhhbmRsZSBzdHJlYW0gbGluZVxuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVTdHJlYW1MaW5lKHNlc3Npb25JZDogc3RyaW5nLCBzZXNzaW9uVGVybWluYWw6IFNlc3Npb25UZXJtaW5hbCwgbGluZTogc3RyaW5nKSB7XG4gICAgLy8gSW5pdGlhbGl6ZSBsaW5lIGNvdW50ZXIgaWYgbmVlZGVkXG4gICAgaWYgKHNlc3Npb25UZXJtaW5hbC5saW5lc1Byb2Nlc3NlZFNpbmNlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2Vzc2lvblRlcm1pbmFsLmxpbmVzUHJvY2Vzc2VkU2luY2VDaGVjayA9IDA7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgYnVmZmVyIHByZXNzdXJlIHBlcmlvZGljYWxseSBvciBpZiBhbHJlYWR5IHBhdXNlZFxuICAgIGxldCBpc1BhdXNlZCA9IHNlc3Npb25UZXJtaW5hbC5pc1BhdXNlZCB8fCBmYWxzZTtcbiAgICBpZiAoXG4gICAgICAhaXNQYXVzZWQgJiZcbiAgICAgIHNlc3Npb25UZXJtaW5hbC5saW5lc1Byb2Nlc3NlZFNpbmNlQ2hlY2sgPj0gRkxPV19DT05UUk9MX0NPTkZJRy5idWZmZXJDaGVja0ludGVydmFsXG4gICAgKSB7XG4gICAgICBpc1BhdXNlZCA9IHRoaXMuY2hlY2tCdWZmZXJQcmVzc3VyZShzZXNzaW9uSWQpO1xuICAgICAgc2Vzc2lvblRlcm1pbmFsLmxpbmVzUHJvY2Vzc2VkU2luY2VDaGVjayA9IDA7XG4gICAgfVxuXG4gICAgaWYgKGlzUGF1c2VkKSB7XG4gICAgICAvLyBRdWV1ZSB0aGUgbGluZSBmb3IgbGF0ZXIgcHJvY2Vzc2luZ1xuICAgICAgaWYgKCFzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzKSB7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMgPSBbXTtcbiAgICAgIH1cblxuICAgICAgLy8gTGltaXQgcGVuZGluZyBsaW5lcyB0byBwcmV2ZW50IG1lbW9yeSBpc3N1ZXNcbiAgICAgIGlmIChzZXNzaW9uVGVybWluYWwucGVuZGluZ0xpbmVzLmxlbmd0aCA8IEZMT1dfQ09OVFJPTF9DT05GSUcubWF4UGVuZGluZ0xpbmVzKSB7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC5wZW5kaW5nTGluZXMucHVzaChsaW5lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgIGNoYWxrLnJlZChcbiAgICAgICAgICAgIGBQZW5kaW5nIGxpbmVzIGxpbWl0IHJlYWNoZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9LiBEcm9wcGluZyBuZXcgZGF0YSB0byBwcmV2ZW50IG1lbW9yeSBvdmVyZmxvdy5gXG4gICAgICAgICAgKVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNlc3Npb25UZXJtaW5hbC5saW5lc1Byb2Nlc3NlZFNpbmNlQ2hlY2srKztcbiAgICB0aGlzLnByb2Nlc3NTdHJlYW1MaW5lKHNlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsLCBsaW5lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIGEgc3RyZWFtIGxpbmUgKHNlcGFyYXRlZCBmcm9tIGhhbmRsZVN0cmVhbUxpbmUgZm9yIGZsb3cgY29udHJvbClcbiAgICovXG4gIHByaXZhdGUgcHJvY2Vzc1N0cmVhbUxpbmUoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25UZXJtaW5hbDogU2Vzc2lvblRlcm1pbmFsLCBsaW5lOiBzdHJpbmcpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UobGluZSk7XG5cbiAgICAgIC8vIEhhbmRsZSBhc2NpaW5lbWEgaGVhZGVyXG4gICAgICBpZiAoZGF0YS52ZXJzaW9uICYmIGRhdGEud2lkdGggJiYgZGF0YS5oZWlnaHQpIHtcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsLnJlc2l6ZShkYXRhLndpZHRoLCBkYXRhLmhlaWdodCk7XG4gICAgICAgIHRoaXMubm90aWZ5QnVmZmVyQ2hhbmdlKHNlc3Npb25JZCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gSGFuZGxlIGFzY2lpbmVtYSBldmVudHMgW3RpbWVzdGFtcCwgdHlwZSwgZGF0YV1cbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpICYmIGRhdGEubGVuZ3RoID49IDMpIHtcbiAgICAgICAgY29uc3QgW3RpbWVzdGFtcCwgdHlwZSwgZXZlbnREYXRhXSA9IGRhdGE7XG5cbiAgICAgICAgaWYgKHRpbWVzdGFtcCA9PT0gJ2V4aXQnKSB7XG4gICAgICAgICAgLy8gU2Vzc2lvbiBleGl0ZWRcbiAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgY2hhbGsueWVsbG93KGBTZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX0gZXhpdGVkIHdpdGggY29kZSAke2RhdGFbMV19YClcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChzZXNzaW9uVGVybWluYWwud2F0Y2hlcikge1xuICAgICAgICAgICAgc2Vzc2lvblRlcm1pbmFsLndhdGNoZXIuY2xvc2UoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGUgPT09ICdvJykge1xuICAgICAgICAgIC8vIE91dHB1dCBldmVudCAtIHF1ZXVlIHdyaXRlIHRvIHRlcm1pbmFsIHdpdGggcmF0ZSBsaW1pdGluZ1xuICAgICAgICAgIHRoaXMucXVldWVUZXJtaW5hbFdyaXRlKHNlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsLCBldmVudERhdGEpO1xuICAgICAgICAgIHRoaXMuc2NoZWR1bGVCdWZmZXJDaGFuZ2VOb3RpZmljYXRpb24oc2Vzc2lvbklkKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAncicpIHtcbiAgICAgICAgICAvLyBSZXNpemUgZXZlbnRcbiAgICAgICAgICBjb25zdCBtYXRjaCA9IGV2ZW50RGF0YS5tYXRjaCgvXihcXGQrKXgoXFxkKykkLyk7XG4gICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBjb25zdCBjb2xzID0gTnVtYmVyLnBhcnNlSW50KG1hdGNoWzFdLCAxMCk7XG4gICAgICAgICAgICBjb25zdCByb3dzID0gTnVtYmVyLnBhcnNlSW50KG1hdGNoWzJdLCAxMCk7XG4gICAgICAgICAgICBzZXNzaW9uVGVybWluYWwudGVybWluYWwucmVzaXplKGNvbHMsIHJvd3MpO1xuICAgICAgICAgICAgdGhpcy5ub3RpZnlCdWZmZXJDaGFuZ2Uoc2Vzc2lvbklkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWdub3JlICdpJyAoaW5wdXQpIGV2ZW50c1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBVc2UgZGVkdXBsaWNhdG9yIHRvIGNoZWNrIGlmIHdlIHNob3VsZCBsb2cgdGhpcyBlcnJvclxuICAgICAgLy8gVXNlIGEgbW9yZSBnZW5lcmljIGNvbnRleHQga2V5IHRvIGdyb3VwIHNpbWlsYXIgcGFyc2luZyBlcnJvcnMgdG9nZXRoZXJcbiAgICAgIGNvbnN0IGNvbnRleHRLZXkgPSBgJHtzZXNzaW9uSWR9OnBhcnNlLXN0cmVhbS1saW5lYDtcblxuICAgICAgaWYgKHRoaXMuZXJyb3JEZWR1cGxpY2F0b3Iuc2hvdWxkTG9nKGVycm9yLCBjb250ZXh0S2V5KSkge1xuICAgICAgICBjb25zdCBzdGF0cyA9IHRoaXMuZXJyb3JEZWR1cGxpY2F0b3IuZ2V0RXJyb3JTdGF0cyhlcnJvciwgY29udGV4dEtleSk7XG5cbiAgICAgICAgaWYgKHN0YXRzICYmIHN0YXRzLmNvdW50ID4gMSkge1xuICAgICAgICAgIC8vIExvZyBzdW1tYXJ5IGZvciByZXBlYXRlZCBlcnJvcnNcbiAgICAgICAgICBsb2dnZXIud2Fybihmb3JtYXRFcnJvclN1bW1hcnkoZXJyb3IsIHN0YXRzLCBgc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9YCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZpcnN0IG9jY3VycmVuY2UgLSBsb2cgdGhlIGVycm9yIHdpdGggZGV0YWlsc1xuICAgICAgICAgIGNvbnN0IHRydW5jYXRlZExpbmUgPSBsaW5lLmxlbmd0aCA+IDEwMCA/IGAke2xpbmUuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCA6IGxpbmU7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgYEZhaWxlZCB0byBwYXJzZSBzdHJlYW0gbGluZSBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9OiAke3RydW5jYXRlZExpbmV9YFxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3Iuc3RhY2spIHtcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgUGFyc2UgZXJyb3IgZGV0YWlsczogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYnVmZmVyIHN0YXRzIGZvciBhIHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGdldEJ1ZmZlclN0YXRzKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgY29uc3QgdGVybWluYWwgPSBhd2FpdCB0aGlzLmdldFRlcm1pbmFsKHNlc3Npb25JZCk7XG4gICAgY29uc3QgYnVmZmVyID0gdGVybWluYWwuYnVmZmVyLmFjdGl2ZTtcbiAgICBjb25zdCBzZXNzaW9uVGVybWluYWwgPSB0aGlzLnRlcm1pbmFscy5nZXQoc2Vzc2lvbklkKTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgR2V0dGluZyBidWZmZXIgc3RhdHMgZm9yIHNlc3Npb24gJHt0cnVuY2F0ZUZvckxvZyhzZXNzaW9uSWQpfTogJHtidWZmZXIubGVuZ3RofSB0b3RhbCByb3dzYFxuICAgICk7XG5cbiAgICBjb25zdCBtYXhMaW5lcyA9IHRlcm1pbmFsLm9wdGlvbnMuc2Nyb2xsYmFjayB8fCAxMDAwMDtcbiAgICBjb25zdCBidWZmZXJVdGlsaXphdGlvbiA9IGJ1ZmZlci5sZW5ndGggLyBtYXhMaW5lcztcblxuICAgIHJldHVybiB7XG4gICAgICB0b3RhbFJvd3M6IGJ1ZmZlci5sZW5ndGgsXG4gICAgICBjb2xzOiB0ZXJtaW5hbC5jb2xzLFxuICAgICAgcm93czogdGVybWluYWwucm93cyxcbiAgICAgIHZpZXdwb3J0WTogYnVmZmVyLnZpZXdwb3J0WSxcbiAgICAgIGN1cnNvclg6IGJ1ZmZlci5jdXJzb3JYLFxuICAgICAgY3Vyc29yWTogYnVmZmVyLmN1cnNvclksXG4gICAgICBzY3JvbGxiYWNrOiB0ZXJtaW5hbC5vcHRpb25zLnNjcm9sbGJhY2sgfHwgMCxcbiAgICAgIC8vIEZsb3cgY29udHJvbCBtZXRyaWNzXG4gICAgICBpc1BhdXNlZDogc2Vzc2lvblRlcm1pbmFsPy5pc1BhdXNlZCB8fCBmYWxzZSxcbiAgICAgIHBlbmRpbmdMaW5lczogc2Vzc2lvblRlcm1pbmFsPy5wZW5kaW5nTGluZXM/Lmxlbmd0aCB8fCAwLFxuICAgICAgYnVmZmVyVXRpbGl6YXRpb246IE1hdGgucm91bmQoYnVmZmVyVXRpbGl6YXRpb24gKiAxMDApLFxuICAgICAgbWF4QnVmZmVyTGluZXM6IG1heExpbmVzLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2V0IGJ1ZmZlciBzbmFwc2hvdCBmb3IgYSBzZXNzaW9uIC0gYWx3YXlzIHJldHVybnMgZnVsbCB0ZXJtaW5hbCBidWZmZXIgKGNvbHMgeCByb3dzKVxuICAgKi9cbiAgYXN5bmMgZ2V0QnVmZmVyU25hcHNob3Qoc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZmZlclNuYXBzaG90PiB7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IHRoaXMuZ2V0VGVybWluYWwoc2Vzc2lvbklkKTtcbiAgICBjb25zdCBidWZmZXIgPSB0ZXJtaW5hbC5idWZmZXIuYWN0aXZlO1xuXG4gICAgLy8gQWx3YXlzIGdldCB0aGUgdmlzaWJsZSB0ZXJtaW5hbCBhcmVhIGZyb20gYm90dG9tXG4gICAgY29uc3Qgc3RhcnRMaW5lID0gTWF0aC5tYXgoMCwgYnVmZmVyLmxlbmd0aCAtIHRlcm1pbmFsLnJvd3MpO1xuICAgIGNvbnN0IGVuZExpbmUgPSBidWZmZXIubGVuZ3RoO1xuICAgIGNvbnN0IGFjdHVhbExpbmVzID0gZW5kTGluZSAtIHN0YXJ0TGluZTtcblxuICAgIC8vIEdldCBjdXJzb3IgcG9zaXRpb24gcmVsYXRpdmUgdG8gb3VyIHZpZXdwb3J0XG4gICAgY29uc3QgY3Vyc29yWCA9IGJ1ZmZlci5jdXJzb3JYO1xuICAgIGNvbnN0IGN1cnNvclkgPSBidWZmZXIuY3Vyc29yWSArIGJ1ZmZlci52aWV3cG9ydFkgLSBzdGFydExpbmU7XG5cbiAgICAvLyBFeHRyYWN0IGNlbGxzXG4gICAgY29uc3QgY2VsbHM6IEJ1ZmZlckNlbGxbXVtdID0gW107XG4gICAgY29uc3QgY2VsbCA9IGJ1ZmZlci5nZXROdWxsQ2VsbCgpO1xuXG4gICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgYWN0dWFsTGluZXM7IHJvdysrKSB7XG4gICAgICBjb25zdCBsaW5lID0gYnVmZmVyLmdldExpbmUoc3RhcnRMaW5lICsgcm93KTtcbiAgICAgIGNvbnN0IHJvd0NlbGxzOiBCdWZmZXJDZWxsW10gPSBbXTtcblxuICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgdGVybWluYWwuY29sczsgY29sKyspIHtcbiAgICAgICAgICBsaW5lLmdldENlbGwoY29sLCBjZWxsKTtcblxuICAgICAgICAgIGNvbnN0IGNoYXIgPSBjZWxsLmdldENoYXJzKCkgfHwgJyAnO1xuICAgICAgICAgIGNvbnN0IHdpZHRoID0gY2VsbC5nZXRXaWR0aCgpO1xuXG4gICAgICAgICAgLy8gU2tpcCB6ZXJvLXdpZHRoIGNlbGxzIChwYXJ0IG9mIHdpZGUgY2hhcmFjdGVycylcbiAgICAgICAgICBpZiAod2lkdGggPT09IDApIGNvbnRpbnVlO1xuXG4gICAgICAgICAgLy8gQnVpbGQgYXR0cmlidXRlcyBieXRlXG4gICAgICAgICAgbGV0IGF0dHJpYnV0ZXMgPSAwO1xuICAgICAgICAgIGlmIChjZWxsLmlzQm9sZCgpKSBhdHRyaWJ1dGVzIHw9IDB4MDE7XG4gICAgICAgICAgaWYgKGNlbGwuaXNJdGFsaWMoKSkgYXR0cmlidXRlcyB8PSAweDAyO1xuICAgICAgICAgIGlmIChjZWxsLmlzVW5kZXJsaW5lKCkpIGF0dHJpYnV0ZXMgfD0gMHgwNDtcbiAgICAgICAgICBpZiAoY2VsbC5pc0RpbSgpKSBhdHRyaWJ1dGVzIHw9IDB4MDg7XG4gICAgICAgICAgaWYgKGNlbGwuaXNJbnZlcnNlKCkpIGF0dHJpYnV0ZXMgfD0gMHgxMDtcbiAgICAgICAgICBpZiAoY2VsbC5pc0ludmlzaWJsZSgpKSBhdHRyaWJ1dGVzIHw9IDB4MjA7XG4gICAgICAgICAgaWYgKGNlbGwuaXNTdHJpa2V0aHJvdWdoKCkpIGF0dHJpYnV0ZXMgfD0gMHg0MDtcblxuICAgICAgICAgIGNvbnN0IGJ1ZmZlckNlbGw6IEJ1ZmZlckNlbGwgPSB7XG4gICAgICAgICAgICBjaGFyLFxuICAgICAgICAgICAgd2lkdGgsXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIE9ubHkgaW5jbHVkZSBub24tZGVmYXVsdCB2YWx1ZXNcbiAgICAgICAgICBjb25zdCBmZyA9IGNlbGwuZ2V0RmdDb2xvcigpO1xuICAgICAgICAgIGNvbnN0IGJnID0gY2VsbC5nZXRCZ0NvbG9yKCk7XG5cbiAgICAgICAgICAvLyBIYW5kbGUgY29sb3IgdmFsdWVzIC0gLTEgbWVhbnMgZGVmYXVsdCBjb2xvclxuICAgICAgICAgIGlmIChmZyAhPT0gdW5kZWZpbmVkICYmIGZnICE9PSAtMSkgYnVmZmVyQ2VsbC5mZyA9IGZnO1xuICAgICAgICAgIGlmIChiZyAhPT0gdW5kZWZpbmVkICYmIGJnICE9PSAtMSkgYnVmZmVyQ2VsbC5iZyA9IGJnO1xuICAgICAgICAgIGlmIChhdHRyaWJ1dGVzICE9PSAwKSBidWZmZXJDZWxsLmF0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzO1xuXG4gICAgICAgICAgcm93Q2VsbHMucHVzaChidWZmZXJDZWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRyaW0gYmxhbmsgY2VsbHMgZnJvbSB0aGUgZW5kIG9mIHRoZSBsaW5lXG4gICAgICAgIGxldCBsYXN0Tm9uQmxhbmtDZWxsID0gcm93Q2VsbHMubGVuZ3RoIC0gMTtcbiAgICAgICAgd2hpbGUgKGxhc3ROb25CbGFua0NlbGwgPj0gMCkge1xuICAgICAgICAgIGNvbnN0IGNlbGwgPSByb3dDZWxsc1tsYXN0Tm9uQmxhbmtDZWxsXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBjZWxsLmNoYXIgIT09ICcgJyB8fFxuICAgICAgICAgICAgY2VsbC5mZyAhPT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICBjZWxsLmJnICE9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgIGNlbGwuYXR0cmlidXRlcyAhPT0gdW5kZWZpbmVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgICAgbGFzdE5vbkJsYW5rQ2VsbC0tO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVHJpbSB0aGUgYXJyYXksIGJ1dCBrZWVwIGF0IGxlYXN0IG9uZSBjZWxsXG4gICAgICAgIGlmIChsYXN0Tm9uQmxhbmtDZWxsIDwgcm93Q2VsbHMubGVuZ3RoIC0gMSkge1xuICAgICAgICAgIHJvd0NlbGxzLnNwbGljZShNYXRoLm1heCgxLCBsYXN0Tm9uQmxhbmtDZWxsICsgMSkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBFbXB0eSBsaW5lIC0ganVzdCBhZGQgYSBzaW5nbGUgc3BhY2VcbiAgICAgICAgcm93Q2VsbHMucHVzaCh7IGNoYXI6ICcgJywgd2lkdGg6IDEgfSk7XG4gICAgICB9XG5cbiAgICAgIGNlbGxzLnB1c2gocm93Q2VsbHMpO1xuICAgIH1cblxuICAgIC8vIFRyaW0gYmxhbmsgbGluZXMgZnJvbSB0aGUgYm90dG9tXG4gICAgbGV0IGxhc3ROb25CbGFua1JvdyA9IGNlbGxzLmxlbmd0aCAtIDE7XG4gICAgd2hpbGUgKGxhc3ROb25CbGFua1JvdyA+PSAwKSB7XG4gICAgICBjb25zdCByb3cgPSBjZWxsc1tsYXN0Tm9uQmxhbmtSb3ddO1xuICAgICAgY29uc3QgaGFzQ29udGVudCA9IHJvdy5zb21lKFxuICAgICAgICAoY2VsbCkgPT5cbiAgICAgICAgICBjZWxsLmNoYXIgIT09ICcgJyB8fFxuICAgICAgICAgIGNlbGwuZmcgIT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIGNlbGwuYmcgIT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIGNlbGwuYXR0cmlidXRlcyAhPT0gdW5kZWZpbmVkXG4gICAgICApO1xuICAgICAgaWYgKGhhc0NvbnRlbnQpIGJyZWFrO1xuICAgICAgbGFzdE5vbkJsYW5rUm93LS07XG4gICAgfVxuXG4gICAgLy8gS2VlcCBhdCBsZWFzdCBvbmUgcm93XG4gICAgY29uc3QgdHJpbW1lZENlbGxzID0gY2VsbHMuc2xpY2UoMCwgTWF0aC5tYXgoMSwgbGFzdE5vbkJsYW5rUm93ICsgMSkpO1xuXG4gICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgIGlmIChkdXJhdGlvbiA+IDEwKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBCdWZmZXIgc25hcHNob3QgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9IHRvb2sgJHtkdXJhdGlvbn1tcyAoJHt0cmltbWVkQ2VsbHMubGVuZ3RofSByb3dzKWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbHM6IHRlcm1pbmFsLmNvbHMsXG4gICAgICByb3dzOiB0cmltbWVkQ2VsbHMubGVuZ3RoLFxuICAgICAgdmlld3BvcnRZOiBzdGFydExpbmUsXG4gICAgICBjdXJzb3JYLFxuICAgICAgY3Vyc29yWSxcbiAgICAgIGNlbGxzOiB0cmltbWVkQ2VsbHMsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCB0ZXJtaW5hbCBmb3IgYSBzZXNzaW9uIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtzXG4gICAqL1xuICBjbGVhbnVwVGVybWluYWwoc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzZXNzaW9uVGVybWluYWwgPSB0aGlzLnRlcm1pbmFscy5nZXQoc2Vzc2lvbklkKTtcbiAgICBpZiAoc2Vzc2lvblRlcm1pbmFsKSB7XG4gICAgICAvLyBTdG9wIHdhdGNoaW5nIHRoZSBzdHJlYW0gZmlsZVxuICAgICAgaWYgKHNlc3Npb25UZXJtaW5hbC53YXRjaGVyKSB7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC53YXRjaGVyLmNsb3NlKCk7XG4gICAgICAgIHNlc3Npb25UZXJtaW5hbC53YXRjaGVyID0gdW5kZWZpbmVkO1xuICAgICAgfVxuXG4gICAgICAvLyBEaXNwb3NlIG9mIHRoZSB0ZXJtaW5hbCB0byBmcmVlIG1lbW9yeVxuICAgICAgdHJ5IHtcbiAgICAgICAgc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsLmRpc3Bvc2UoKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBFcnJvciBkaXNwb3NpbmcgdGVybWluYWwgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycm9yKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2xlYXIgcmVmZXJlbmNlc1xuICAgICAgdGhpcy50ZXJtaW5hbHMuZGVsZXRlKHNlc3Npb25JZCk7XG5cbiAgICAgIC8vIFJlbW92ZSBmcm9tIGJ1ZmZlciBjaGFuZ2UgbGlzdGVuZXJzXG4gICAgICB0aGlzLmJ1ZmZlckxpc3RlbmVycy5kZWxldGUoc2Vzc2lvbklkKTtcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBUZXJtaW5hbCBjbGVhbmVkIHVwIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCBpbmFjdGl2ZSB0ZXJtaW5hbHMgdG8gcHJldmVudCBtZW1vcnkgbGVha3NcbiAgICovXG4gIGNsZWFudXBJbmFjdGl2ZVRlcm1pbmFscyhtYXhBZ2VNczogbnVtYmVyID0gMjQgKiA2MCAqIDYwICogMTAwMCk6IG51bWJlciB7XG4gICAgLy8gMjQgaG91cnNcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHRvQ2xlYW51cDogc3RyaW5nW10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgW3Nlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsXSBvZiB0aGlzLnRlcm1pbmFscy5lbnRyaWVzKCkpIHtcbiAgICAgIGNvbnN0IGFnZSA9IG5vdyAtIHNlc3Npb25UZXJtaW5hbC5sYXN0VXBkYXRlO1xuICAgICAgaWYgKGFnZSA+IG1heEFnZU1zKSB7XG4gICAgICAgIHRvQ2xlYW51cC5wdXNoKHNlc3Npb25JZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBzZXNzaW9uSWQgb2YgdG9DbGVhbnVwKSB7XG4gICAgICB0aGlzLmNsZWFudXBUZXJtaW5hbChzZXNzaW9uSWQpO1xuICAgIH1cblxuICAgIGlmICh0b0NsZWFudXAubGVuZ3RoID4gMCkge1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYENsZWFuZWQgdXAgJHt0b0NsZWFudXAubGVuZ3RofSBpbmFjdGl2ZSB0ZXJtaW5hbHNgKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvQ2xlYW51cC5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogRW5jb2RlIGJ1ZmZlciBzbmFwc2hvdCB0byBiaW5hcnkgZm9ybWF0XG4gICAqXG4gICAqIENvbnZlcnRzIGEgYnVmZmVyIHNuYXBzaG90IGludG8gYW4gb3B0aW1pemVkIGJpbmFyeSBmb3JtYXQgZm9yXG4gICAqIGVmZmljaWVudCB0cmFuc21pc3Npb24gb3ZlciBXZWJTb2NrZXQuIFRoZSBlbmNvZGluZyB1c2VzIHZhcmlvdXNcbiAgICogY29tcHJlc3Npb24gdGVjaG5pcXVlczpcbiAgICpcbiAgICogLSBFbXB0eSByb3dzIGFyZSBtYXJrZWQgd2l0aCAyLWJ5dGUgbWFya2Vyc1xuICAgKiAtIFNwYWNlcyB3aXRoIGRlZmF1bHQgc3R5bGluZyB1c2UgMSBieXRlXG4gICAqIC0gQVNDSUkgY2hhcmFjdGVycyB3aXRoIGNvbG9ycyB1c2UgMi04IGJ5dGVzXG4gICAqIC0gVW5pY29kZSBjaGFyYWN0ZXJzIHVzZSB2YXJpYWJsZSBsZW5ndGggZW5jb2RpbmdcbiAgICpcbiAgICogVGhlIGJpbmFyeSBmb3JtYXQgaXMgZGVzaWduZWQgZm9yIGZhc3QgZGVjb2Rpbmcgb24gdGhlIGNsaWVudFxuICAgKiB3aGlsZSBtaW5pbWl6aW5nIGJhbmR3aWR0aCB1c2FnZS5cbiAgICpcbiAgICogQHBhcmFtIHNuYXBzaG90IC0gVGVybWluYWwgYnVmZmVyIHNuYXBzaG90IHRvIGVuY29kZVxuICAgKiBAcmV0dXJucyBCaW5hcnkgYnVmZmVyIHJlYWR5IGZvciB0cmFuc21pc3Npb25cbiAgICpcbiAgICogQGV4YW1wbGVcbiAgICogYGBgdHlwZXNjcmlwdFxuICAgKiBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IG1hbmFnZXIuZ2V0QnVmZmVyU25hcHNob3QoJ3Nlc3Npb24tMTIzJyk7XG4gICAqIGNvbnN0IGJpbmFyeSA9IG1hbmFnZXIuZW5jb2RlU25hcHNob3Qoc25hcHNob3QpO1xuICAgKlxuICAgKiAvLyBTZW5kIG92ZXIgV2ViU29ja2V0IHdpdGggc2Vzc2lvbiBJRFxuICAgKiBjb25zdCBwYWNrZXQgPSBCdWZmZXIuY29uY2F0KFtcbiAgICogICBCdWZmZXIuZnJvbShbMHhCRl0pLCAvLyBNYWdpYyBieXRlXG4gICAqICAgQnVmZmVyLmZyb20oc2Vzc2lvbklkLmxlbmd0aC50b1N0cmluZygxNiksICdoZXgnKSxcbiAgICogICBCdWZmZXIuZnJvbShzZXNzaW9uSWQpLFxuICAgKiAgIGJpbmFyeVxuICAgKiBdKTtcbiAgICogd3Muc2VuZChwYWNrZXQpO1xuICAgKiBgYGBcbiAgICovXG4gIGVuY29kZVNuYXBzaG90KHNuYXBzaG90OiBCdWZmZXJTbmFwc2hvdCk6IEJ1ZmZlciB7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCB7IGNvbHMsIHJvd3MsIHZpZXdwb3J0WSwgY3Vyc29yWCwgY3Vyc29yWSwgY2VsbHMgfSA9IHNuYXBzaG90O1xuXG4gICAgLy8gUHJlLWNhbGN1bGF0ZSBhY3R1YWwgZGF0YSBzaXplIGZvciBlZmZpY2llbmN5XG4gICAgbGV0IGRhdGFTaXplID0gMzI7IC8vIEhlYWRlciBzaXplXG5cbiAgICAvLyBGaXJzdCBwYXNzOiBjYWxjdWxhdGUgZXhhY3Qgc2l6ZSBuZWVkZWRcbiAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBjZWxscy5sZW5ndGg7IHJvdysrKSB7XG4gICAgICBjb25zdCByb3dDZWxscyA9IGNlbGxzW3Jvd107XG4gICAgICBpZiAoXG4gICAgICAgIHJvd0NlbGxzLmxlbmd0aCA9PT0gMCB8fFxuICAgICAgICAocm93Q2VsbHMubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgcm93Q2VsbHNbMF0uY2hhciA9PT0gJyAnICYmXG4gICAgICAgICAgIXJvd0NlbGxzWzBdLmZnICYmXG4gICAgICAgICAgIXJvd0NlbGxzWzBdLmJnICYmXG4gICAgICAgICAgIXJvd0NlbGxzWzBdLmF0dHJpYnV0ZXMpXG4gICAgICApIHtcbiAgICAgICAgLy8gRW1wdHkgcm93IG1hcmtlcjogMiBieXRlc1xuICAgICAgICBkYXRhU2l6ZSArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUm93IGhlYWRlcjogMyBieXRlcyAobWFya2VyICsgbGVuZ3RoKVxuICAgICAgICBkYXRhU2l6ZSArPSAzO1xuXG4gICAgICAgIGZvciAoY29uc3QgY2VsbCBvZiByb3dDZWxscykge1xuICAgICAgICAgIGRhdGFTaXplICs9IHRoaXMuY2FsY3VsYXRlQ2VsbFNpemUoY2VsbCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuYWxsb2NVbnNhZmUoZGF0YVNpemUpO1xuICAgIGxldCBvZmZzZXQgPSAwO1xuXG4gICAgLy8gV3JpdGUgaGVhZGVyICgzMiBieXRlcylcbiAgICBidWZmZXIud3JpdGVVSW50MTZMRSgweDU2NTQsIG9mZnNldCk7XG4gICAgb2Zmc2V0ICs9IDI7IC8vIE1hZ2ljIFwiVlRcIlxuICAgIGJ1ZmZlci53cml0ZVVJbnQ4KDB4MDEsIG9mZnNldCk7IC8vIFZlcnNpb24gMSAtIG91ciBvbmx5IGZvcm1hdFxuICAgIG9mZnNldCArPSAxOyAvLyBWZXJzaW9uXG4gICAgYnVmZmVyLndyaXRlVUludDgoMHgwMCwgb2Zmc2V0KTtcbiAgICBvZmZzZXQgKz0gMTsgLy8gRmxhZ3NcbiAgICBidWZmZXIud3JpdGVVSW50MzJMRShjb2xzLCBvZmZzZXQpO1xuICAgIG9mZnNldCArPSA0OyAvLyBDb2xzICgzMi1iaXQpXG4gICAgYnVmZmVyLndyaXRlVUludDMyTEUocm93cywgb2Zmc2V0KTtcbiAgICBvZmZzZXQgKz0gNDsgLy8gUm93cyAoMzItYml0KVxuICAgIGJ1ZmZlci53cml0ZUludDMyTEUodmlld3BvcnRZLCBvZmZzZXQpOyAvLyBTaWduZWQgZm9yIGxhcmdlIGJ1ZmZlcnNcbiAgICBvZmZzZXQgKz0gNDsgLy8gVmlld3BvcnRZICgzMi1iaXQgc2lnbmVkKVxuICAgIGJ1ZmZlci53cml0ZUludDMyTEUoY3Vyc29yWCwgb2Zmc2V0KTsgLy8gU2lnbmVkIGZvciBjb25zaXN0ZW5jeVxuICAgIG9mZnNldCArPSA0OyAvLyBDdXJzb3JYICgzMi1iaXQgc2lnbmVkKVxuICAgIGJ1ZmZlci53cml0ZUludDMyTEUoY3Vyc29yWSwgb2Zmc2V0KTsgLy8gU2lnbmVkIGZvciByZWxhdGl2ZSBwb3NpdGlvbnNcbiAgICBvZmZzZXQgKz0gNDsgLy8gQ3Vyc29yWSAoMzItYml0IHNpZ25lZClcbiAgICBidWZmZXIud3JpdGVVSW50MzJMRSgwLCBvZmZzZXQpO1xuICAgIG9mZnNldCArPSA0OyAvLyBSZXNlcnZlZFxuXG4gICAgLy8gV3JpdGUgY2VsbHMgd2l0aCBuZXcgb3B0aW1pemVkIGZvcm1hdFxuICAgIGZvciAobGV0IHJvdyA9IDA7IHJvdyA8IGNlbGxzLmxlbmd0aDsgcm93KyspIHtcbiAgICAgIGNvbnN0IHJvd0NlbGxzID0gY2VsbHNbcm93XTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhbiBlbXB0eSByb3dcbiAgICAgIGlmIChcbiAgICAgICAgcm93Q2VsbHMubGVuZ3RoID09PSAwIHx8XG4gICAgICAgIChyb3dDZWxscy5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICByb3dDZWxsc1swXS5jaGFyID09PSAnICcgJiZcbiAgICAgICAgICAhcm93Q2VsbHNbMF0uZmcgJiZcbiAgICAgICAgICAhcm93Q2VsbHNbMF0uYmcgJiZcbiAgICAgICAgICAhcm93Q2VsbHNbMF0uYXR0cmlidXRlcylcbiAgICAgICkge1xuICAgICAgICAvLyBFbXB0eSByb3cgbWFya2VyXG4gICAgICAgIGJ1ZmZlci53cml0ZVVJbnQ4KDB4ZmUsIG9mZnNldCsrKTsgLy8gRW1wdHkgcm93IG1hcmtlclxuICAgICAgICBidWZmZXIud3JpdGVVSW50OCgxLCBvZmZzZXQrKyk7IC8vIENvdW50IG9mIGVtcHR5IHJvd3MgKGZvciBub3cganVzdCAxKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUm93IHdpdGggY29udGVudFxuICAgICAgICBidWZmZXIud3JpdGVVSW50OCgweGZkLCBvZmZzZXQrKyk7IC8vIFJvdyBtYXJrZXJcbiAgICAgICAgYnVmZmVyLndyaXRlVUludDE2TEUocm93Q2VsbHMubGVuZ3RoLCBvZmZzZXQpOyAvLyBOdW1iZXIgb2YgY2VsbHMgaW4gcm93XG4gICAgICAgIG9mZnNldCArPSAyO1xuXG4gICAgICAgIC8vIFdyaXRlIGVhY2ggY2VsbFxuICAgICAgICBmb3IgKGNvbnN0IGNlbGwgb2Ygcm93Q2VsbHMpIHtcbiAgICAgICAgICBvZmZzZXQgPSB0aGlzLmVuY29kZUNlbGwoYnVmZmVyLCBvZmZzZXQsIGNlbGwpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIGV4YWN0IHNpemUgYnVmZmVyXG4gICAgY29uc3QgcmVzdWx0ID0gYnVmZmVyLnN1YmFycmF5KDAsIG9mZnNldCk7XG5cbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG4gICAgaWYgKGR1cmF0aW9uID4gNSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBFbmNvZGVkIHNuYXBzaG90OiAke3Jlc3VsdC5sZW5ndGh9IGJ5dGVzIGluICR7ZHVyYXRpb259bXMgKCR7cm93c30gcm93cylgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGN1bGF0ZSB0aGUgc2l6ZSBuZWVkZWQgdG8gZW5jb2RlIGEgY2VsbFxuICAgKi9cbiAgcHJpdmF0ZSBjYWxjdWxhdGVDZWxsU2l6ZShjZWxsOiBCdWZmZXJDZWxsKTogbnVtYmVyIHtcbiAgICAvLyBPcHRpbWl6ZWQgZW5jb2Rpbmc6XG4gICAgLy8gLSBTaW1wbGUgc3BhY2Ugd2l0aCBkZWZhdWx0IGNvbG9yczogMSBieXRlXG4gICAgLy8gLSBBU0NJSSBjaGFyIHdpdGggZGVmYXVsdCBjb2xvcnM6IDIgYnl0ZXNcbiAgICAvLyAtIEFTQ0lJIGNoYXIgd2l0aCBjb2xvcnMvYXR0cnM6IDItOCBieXRlc1xuICAgIC8vIC0gVW5pY29kZSBjaGFyOiB2YXJpYWJsZVxuXG4gICAgY29uc3QgaXNTcGFjZSA9IGNlbGwuY2hhciA9PT0gJyAnO1xuICAgIGNvbnN0IGhhc0F0dHJzID0gY2VsbC5hdHRyaWJ1dGVzICYmIGNlbGwuYXR0cmlidXRlcyAhPT0gMDtcbiAgICBjb25zdCBoYXNGZyA9IGNlbGwuZmcgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBoYXNCZyA9IGNlbGwuYmcgIT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBpc0FzY2lpID0gY2VsbC5jaGFyLmNoYXJDb2RlQXQoMCkgPD0gMTI3O1xuXG4gICAgaWYgKGlzU3BhY2UgJiYgIWhhc0F0dHJzICYmICFoYXNGZyAmJiAhaGFzQmcpIHtcbiAgICAgIHJldHVybiAxOyAvLyBKdXN0IGEgc3BhY2UgbWFya2VyXG4gICAgfVxuXG4gICAgbGV0IHNpemUgPSAxOyAvLyBUeXBlIGJ5dGVcblxuICAgIGlmIChpc0FzY2lpKSB7XG4gICAgICBzaXplICs9IDE7IC8vIEFTQ0lJIGNoYXJhY3RlclxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjaGFyQnl0ZXMgPSBCdWZmZXIuYnl0ZUxlbmd0aChjZWxsLmNoYXIsICd1dGY4Jyk7XG4gICAgICBzaXplICs9IDEgKyBjaGFyQnl0ZXM7IC8vIExlbmd0aCBieXRlICsgVVRGLTggYnl0ZXNcbiAgICB9XG5cbiAgICAvLyBBdHRyaWJ1dGVzL2NvbG9ycyBieXRlXG4gICAgaWYgKGhhc0F0dHJzIHx8IGhhc0ZnIHx8IGhhc0JnKSB7XG4gICAgICBzaXplICs9IDE7IC8vIEZsYWdzIGJ5dGVcblxuICAgICAgaWYgKGhhc0ZnICYmIGNlbGwuZmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzaXplICs9IGNlbGwuZmcgPiAyNTUgPyAzIDogMTsgLy8gUkdCIG9yIHBhbGV0dGVcbiAgICAgIH1cblxuICAgICAgaWYgKGhhc0JnICYmIGNlbGwuYmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBzaXplICs9IGNlbGwuYmcgPiAyNTUgPyAzIDogMTsgLy8gUkdCIG9yIHBhbGV0dGVcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gc2l6ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmNvZGUgYSBzaW5nbGUgY2VsbCBpbnRvIHRoZSBidWZmZXJcbiAgICovXG4gIHByaXZhdGUgZW5jb2RlQ2VsbChidWZmZXI6IEJ1ZmZlciwgb2Zmc2V0OiBudW1iZXIsIGNlbGw6IEJ1ZmZlckNlbGwpOiBudW1iZXIge1xuICAgIGNvbnN0IGlzU3BhY2UgPSBjZWxsLmNoYXIgPT09ICcgJztcbiAgICBjb25zdCBoYXNBdHRycyA9IGNlbGwuYXR0cmlidXRlcyAmJiBjZWxsLmF0dHJpYnV0ZXMgIT09IDA7XG4gICAgY29uc3QgaGFzRmcgPSBjZWxsLmZnICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaGFzQmcgPSBjZWxsLmJnICE9PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgaXNBc2NpaSA9IGNlbGwuY2hhci5jaGFyQ29kZUF0KDApIDw9IDEyNztcblxuICAgIC8vIFR5cGUgYnl0ZSBmb3JtYXQ6XG4gICAgLy8gQml0IDc6IEhhcyBleHRlbmRlZCBkYXRhIChhdHRycy9jb2xvcnMpXG4gICAgLy8gQml0IDY6IElzIFVuaWNvZGUgKHZzIEFTQ0lJKVxuICAgIC8vIEJpdCA1OiBIYXMgZm9yZWdyb3VuZCBjb2xvclxuICAgIC8vIEJpdCA0OiBIYXMgYmFja2dyb3VuZCBjb2xvclxuICAgIC8vIEJpdCAzOiBJcyBSR0IgZm9yZWdyb3VuZCAodnMgcGFsZXR0ZSlcbiAgICAvLyBCaXQgMjogSXMgUkdCIGJhY2tncm91bmQgKHZzIHBhbGV0dGUpXG4gICAgLy8gQml0cyAxLTA6IENoYXJhY3RlciB0eXBlICgwMD1zcGFjZSwgMDE9QVNDSUksIDEwPVVuaWNvZGUpXG5cbiAgICBpZiAoaXNTcGFjZSAmJiAhaGFzQXR0cnMgJiYgIWhhc0ZnICYmICFoYXNCZykge1xuICAgICAgLy8gU2ltcGxlIHNwYWNlIC0gMSBieXRlXG4gICAgICBidWZmZXIud3JpdGVVSW50OCgweDAwLCBvZmZzZXQrKyk7IC8vIFR5cGU6IHNwYWNlLCBubyBleHRlbmRlZCBkYXRhXG4gICAgICByZXR1cm4gb2Zmc2V0O1xuICAgIH1cblxuICAgIGxldCB0eXBlQnl0ZSA9IDA7XG5cbiAgICBpZiAoaGFzQXR0cnMgfHwgaGFzRmcgfHwgaGFzQmcpIHtcbiAgICAgIHR5cGVCeXRlIHw9IDB4ODA7IC8vIEhhcyBleHRlbmRlZCBkYXRhXG4gICAgfVxuXG4gICAgaWYgKCFpc0FzY2lpKSB7XG4gICAgICB0eXBlQnl0ZSB8PSAweDQwOyAvLyBJcyBVbmljb2RlXG4gICAgICB0eXBlQnl0ZSB8PSAweDAyOyAvLyBDaGFyYWN0ZXIgdHlwZTogVW5pY29kZVxuICAgIH0gZWxzZSBpZiAoIWlzU3BhY2UpIHtcbiAgICAgIHR5cGVCeXRlIHw9IDB4MDE7IC8vIENoYXJhY3RlciB0eXBlOiBBU0NJSVxuICAgIH1cblxuICAgIGlmIChoYXNGZyAmJiBjZWxsLmZnICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHR5cGVCeXRlIHw9IDB4MjA7IC8vIEhhcyBmb3JlZ3JvdW5kXG4gICAgICBpZiAoY2VsbC5mZyA+IDI1NSkgdHlwZUJ5dGUgfD0gMHgwODsgLy8gSXMgUkdCXG4gICAgfVxuXG4gICAgaWYgKGhhc0JnICYmIGNlbGwuYmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdHlwZUJ5dGUgfD0gMHgxMDsgLy8gSGFzIGJhY2tncm91bmRcbiAgICAgIGlmIChjZWxsLmJnID4gMjU1KSB0eXBlQnl0ZSB8PSAweDA0OyAvLyBJcyBSR0JcbiAgICB9XG5cbiAgICBidWZmZXIud3JpdGVVSW50OCh0eXBlQnl0ZSwgb2Zmc2V0KyspO1xuXG4gICAgLy8gV3JpdGUgY2hhcmFjdGVyXG4gICAgaWYgKCFpc0FzY2lpKSB7XG4gICAgICBjb25zdCBjaGFyQnl0ZXMgPSBCdWZmZXIuZnJvbShjZWxsLmNoYXIsICd1dGY4Jyk7XG4gICAgICBidWZmZXIud3JpdGVVSW50OChjaGFyQnl0ZXMubGVuZ3RoLCBvZmZzZXQrKyk7XG4gICAgICBjaGFyQnl0ZXMuY29weShidWZmZXIsIG9mZnNldCk7XG4gICAgICBvZmZzZXQgKz0gY2hhckJ5dGVzLmxlbmd0aDtcbiAgICB9IGVsc2UgaWYgKCFpc1NwYWNlKSB7XG4gICAgICBidWZmZXIud3JpdGVVSW50OChjZWxsLmNoYXIuY2hhckNvZGVBdCgwKSwgb2Zmc2V0KyspO1xuICAgIH1cblxuICAgIC8vIFdyaXRlIGV4dGVuZGVkIGRhdGEgaWYgcHJlc2VudFxuICAgIGlmICh0eXBlQnl0ZSAmIDB4ODApIHtcbiAgICAgIC8vIEF0dHJpYnV0ZXMgYnl0ZSAoaWYgYW55KVxuICAgICAgaWYgKGhhc0F0dHJzICYmIGNlbGwuYXR0cmlidXRlcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJ1ZmZlci53cml0ZVVJbnQ4KGNlbGwuYXR0cmlidXRlcywgb2Zmc2V0KyspO1xuICAgICAgfSBlbHNlIGlmIChoYXNGZyB8fCBoYXNCZykge1xuICAgICAgICBidWZmZXIud3JpdGVVSW50OCgwLCBvZmZzZXQrKyk7IC8vIE5vIGF0dHJpYnV0ZXMgYnV0IG5lZWQgdGhlIGJ5dGVcbiAgICAgIH1cblxuICAgICAgLy8gRm9yZWdyb3VuZCBjb2xvclxuICAgICAgaWYgKGhhc0ZnICYmIGNlbGwuZmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoY2VsbC5mZyA+IDI1NSkge1xuICAgICAgICAgIC8vIFJHQlxuICAgICAgICAgIGJ1ZmZlci53cml0ZVVJbnQ4KChjZWxsLmZnID4+IDE2KSAmIDB4ZmYsIG9mZnNldCsrKTtcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OCgoY2VsbC5mZyA+PiA4KSAmIDB4ZmYsIG9mZnNldCsrKTtcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OChjZWxsLmZnICYgMHhmZiwgb2Zmc2V0KyspO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFBhbGV0dGVcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OChjZWxsLmZnLCBvZmZzZXQrKyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQmFja2dyb3VuZCBjb2xvclxuICAgICAgaWYgKGhhc0JnICYmIGNlbGwuYmcgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoY2VsbC5iZyA+IDI1NSkge1xuICAgICAgICAgIC8vIFJHQlxuICAgICAgICAgIGJ1ZmZlci53cml0ZVVJbnQ4KChjZWxsLmJnID4+IDE2KSAmIDB4ZmYsIG9mZnNldCsrKTtcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OCgoY2VsbC5iZyA+PiA4KSAmIDB4ZmYsIG9mZnNldCsrKTtcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OChjZWxsLmJnICYgMHhmZiwgb2Zmc2V0KyspO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFBhbGV0dGVcbiAgICAgICAgICBidWZmZXIud3JpdGVVSW50OChjZWxsLmJnLCBvZmZzZXQrKyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2Zmc2V0O1xuICB9XG5cbiAgLyoqXG4gICAqIENsb3NlIGEgdGVybWluYWwgc2Vzc2lvblxuICAgKi9cbiAgY2xvc2VUZXJtaW5hbChzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHNlc3Npb25UZXJtaW5hbCA9IHRoaXMudGVybWluYWxzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmIChzZXNzaW9uVGVybWluYWwpIHtcbiAgICAgIGlmIChzZXNzaW9uVGVybWluYWwud2F0Y2hlcikge1xuICAgICAgICBzZXNzaW9uVGVybWluYWwud2F0Y2hlci5jbG9zZSgpO1xuICAgICAgfVxuICAgICAgc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsLmRpc3Bvc2UoKTtcbiAgICAgIHRoaXMudGVybWluYWxzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXG4gICAgICAvLyBDbGVhciB3cml0ZSB0aW1lciBpZiBleGlzdHNcbiAgICAgIGNvbnN0IHdyaXRlVGltZXIgPSB0aGlzLndyaXRlVGltZXJzLmdldChzZXNzaW9uSWQpO1xuICAgICAgaWYgKHdyaXRlVGltZXIpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHdyaXRlVGltZXIpO1xuICAgICAgICB0aGlzLndyaXRlVGltZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgfVxuXG4gICAgICAvLyBDbGVhciB3cml0ZSBxdWV1ZVxuICAgICAgdGhpcy53cml0ZVF1ZXVlcy5kZWxldGUoc2Vzc2lvbklkKTtcblxuICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYFRlcm1pbmFsIGNsb3NlZCBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9YCkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCBvbGQgdGVybWluYWxzXG4gICAqL1xuICBjbGVhbnVwKG1heEFnZTogbnVtYmVyID0gMzAgKiA2MCAqIDEwMDApOiB2b2lkIHtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHRvUmVtb3ZlOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBbc2Vzc2lvbklkLCBzZXNzaW9uVGVybWluYWxdIG9mIHRoaXMudGVybWluYWxzKSB7XG4gICAgICBpZiAobm93IC0gc2Vzc2lvblRlcm1pbmFsLmxhc3RVcGRhdGUgPiBtYXhBZ2UpIHtcbiAgICAgICAgdG9SZW1vdmUucHVzaChzZXNzaW9uSWQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIHRvUmVtb3ZlKSB7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay55ZWxsb3coYENsZWFuaW5nIHVwIHN0YWxlIHRlcm1pbmFsIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX1gKVxuICAgICAgKTtcbiAgICAgIHRoaXMuY2xvc2VUZXJtaW5hbChzZXNzaW9uSWQpO1xuICAgIH1cblxuICAgIGlmICh0b1JlbW92ZS5sZW5ndGggPiAwKSB7XG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmdyYXkoYENsZWFuZWQgdXAgJHt0b1JlbW92ZS5sZW5ndGh9IHN0YWxlIHRlcm1pbmFsc2ApKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUXVldWUgdGVybWluYWwgd3JpdGUgd2l0aCByYXRlIGxpbWl0aW5nIHRvIHByZXZlbnQgZmxvdyBjb250cm9sIGlzc3Vlc1xuICAgKi9cbiAgcHJpdmF0ZSBxdWV1ZVRlcm1pbmFsV3JpdGUoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25UZXJtaW5hbDogU2Vzc2lvblRlcm1pbmFsLCBkYXRhOiBzdHJpbmcpIHtcbiAgICAvLyBHZXQgb3IgY3JlYXRlIHdyaXRlIHF1ZXVlIGZvciB0aGlzIHNlc3Npb25cbiAgICBsZXQgcXVldWUgPSB0aGlzLndyaXRlUXVldWVzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghcXVldWUpIHtcbiAgICAgIHF1ZXVlID0gW107XG4gICAgICB0aGlzLndyaXRlUXVldWVzLnNldChzZXNzaW9uSWQsIHF1ZXVlKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgZGF0YSB0byBxdWV1ZVxuICAgIHF1ZXVlLnB1c2goZGF0YSk7XG5cbiAgICAvLyBJZiBubyB3cml0ZSB0aW1lciBpcyBhY3RpdmUsIHN0YXJ0IHByb2Nlc3NpbmcgdGhlIHF1ZXVlXG4gICAgaWYgKCF0aGlzLndyaXRlVGltZXJzLmhhcyhzZXNzaW9uSWQpKSB7XG4gICAgICB0aGlzLnByb2Nlc3NXcml0ZVF1ZXVlKHNlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUHJvY2VzcyB3cml0ZSBxdWV1ZSB3aXRoIHJhdGUgbGltaXRpbmdcbiAgICovXG4gIHByaXZhdGUgcHJvY2Vzc1dyaXRlUXVldWUoc2Vzc2lvbklkOiBzdHJpbmcsIHNlc3Npb25UZXJtaW5hbDogU2Vzc2lvblRlcm1pbmFsKSB7XG4gICAgY29uc3QgcXVldWUgPSB0aGlzLndyaXRlUXVldWVzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghcXVldWUgfHwgcXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aGlzLndyaXRlVGltZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgYSBiYXRjaCBvZiB3cml0ZXMgKGxpbWl0IGJhdGNoIHNpemUgdG8gcHJldmVudCBvdmVyd2hlbG1pbmcgdGhlIHRlcm1pbmFsKVxuICAgIGNvbnN0IGJhdGNoU2l6ZSA9IDEwO1xuICAgIGNvbnN0IGJhdGNoID0gcXVldWUuc3BsaWNlKDAsIGJhdGNoU2l6ZSk7XG4gICAgY29uc3QgY29tYmluZWREYXRhID0gYmF0Y2guam9pbignJyk7XG5cbiAgICB0cnkge1xuICAgICAgc2Vzc2lvblRlcm1pbmFsLnRlcm1pbmFsLndyaXRlKGNvbWJpbmVkRGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIFVzZSBlcnJvciBkZWR1cGxpY2F0b3IgdG8gcHJldmVudCBsb2cgc3BhbVxuICAgICAgY29uc3QgY29udGV4dEtleSA9IGAke3Nlc3Npb25JZH06dGVybWluYWwtd3JpdGVgO1xuXG4gICAgICBpZiAodGhpcy5lcnJvckRlZHVwbGljYXRvci5zaG91bGRMb2coZXJyb3IsIGNvbnRleHRLZXkpKSB7XG4gICAgICAgIGNvbnN0IHN0YXRzID0gdGhpcy5lcnJvckRlZHVwbGljYXRvci5nZXRFcnJvclN0YXRzKGVycm9yLCBjb250ZXh0S2V5KTtcblxuICAgICAgICBpZiAoc3RhdHMgJiYgc3RhdHMuY291bnQgPiAxKSB7XG4gICAgICAgICAgLy8gTG9nIHN1bW1hcnkgZm9yIHJlcGVhdGVkIGVycm9yc1xuICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgZm9ybWF0RXJyb3JTdW1tYXJ5KFxuICAgICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICAgIGB0ZXJtaW5hbCB3cml0ZSBmb3Igc2Vzc2lvbiAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9YFxuICAgICAgICAgICAgKVxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRmlyc3Qgb2NjdXJyZW5jZSAtIGxvZyB3aXRoIG1vcmUgZGV0YWlsXG4gICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgYFRlcm1pbmFsIHdyaXRlIGVycm9yIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX06ICR7ZXJyb3JNZXNzYWdlfWBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLnN0YWNrKSB7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoYFdyaXRlIGVycm9yIHN0YWNrOiAke2Vycm9yLnN0YWNrfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNjaGVkdWxlIG5leHQgYmF0Y2ggcHJvY2Vzc2luZ1xuICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLnByb2Nlc3NXcml0ZVF1ZXVlKHNlc3Npb25JZCwgc2Vzc2lvblRlcm1pbmFsKTtcbiAgICAgIH0sIDEwKTsgLy8gMTBtcyBkZWxheSBiZXR3ZWVuIGJhdGNoZXNcbiAgICAgIHRoaXMud3JpdGVUaW1lcnMuc2V0KHNlc3Npb25JZCwgdGltZXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLndyaXRlVGltZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIGFjdGl2ZSB0ZXJtaW5hbHNcbiAgICovXG4gIGdldEFjdGl2ZVRlcm1pbmFscygpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odGhpcy50ZXJtaW5hbHMua2V5cygpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzY3JpYmUgdG8gYnVmZmVyIGNoYW5nZXMgZm9yIGEgc2Vzc2lvblxuICAgKi9cbiAgYXN5bmMgc3Vic2NyaWJlVG9CdWZmZXJDaGFuZ2VzKFxuICAgIHNlc3Npb25JZDogc3RyaW5nLFxuICAgIGxpc3RlbmVyOiBCdWZmZXJDaGFuZ2VMaXN0ZW5lclxuICApOiBQcm9taXNlPCgpID0+IHZvaWQ+IHtcbiAgICAvLyBFbnN1cmUgdGVybWluYWwgZXhpc3RzIGFuZCBpcyB3YXRjaGluZ1xuICAgIGF3YWl0IHRoaXMuZ2V0VGVybWluYWwoc2Vzc2lvbklkKTtcblxuICAgIGlmICghdGhpcy5idWZmZXJMaXN0ZW5lcnMuaGFzKHNlc3Npb25JZCkpIHtcbiAgICAgIHRoaXMuYnVmZmVyTGlzdGVuZXJzLnNldChzZXNzaW9uSWQsIG5ldyBTZXQoKSk7XG4gICAgfVxuXG4gICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5idWZmZXJMaXN0ZW5lcnMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKGxpc3RlbmVycykge1xuICAgICAgbGlzdGVuZXJzLmFkZChsaXN0ZW5lcik7XG4gICAgICBsb2dnZXIubG9nKFxuICAgICAgICBjaGFsay5ibHVlKGBCdWZmZXIgbGlzdGVuZXIgc3Vic2NyaWJlZCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0gKCR7bGlzdGVuZXJzLnNpemV9IHRvdGFsKWApXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFJldHVybiB1bnN1YnNjcmliZSBmdW5jdGlvblxuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICBjb25zdCBsaXN0ZW5lcnMgPSB0aGlzLmJ1ZmZlckxpc3RlbmVycy5nZXQoc2Vzc2lvbklkKTtcbiAgICAgIGlmIChsaXN0ZW5lcnMpIHtcbiAgICAgICAgbGlzdGVuZXJzLmRlbGV0ZShsaXN0ZW5lcik7XG4gICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgY2hhbGsueWVsbG93KFxuICAgICAgICAgICAgYEJ1ZmZlciBsaXN0ZW5lciB1bnN1YnNjcmliZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9ICgke2xpc3RlbmVycy5zaXplfSByZW1haW5pbmcpYFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGxpc3RlbmVycy5zaXplID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5idWZmZXJMaXN0ZW5lcnMuZGVsZXRlKHNlc3Npb25JZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNjaGVkdWxlIGJ1ZmZlciBjaGFuZ2Ugbm90aWZpY2F0aW9uIChkZWJvdW5jZWQpXG4gICAqL1xuICBwcml2YXRlIHNjaGVkdWxlQnVmZmVyQ2hhbmdlTm90aWZpY2F0aW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgLy8gQ2FuY2VsIGV4aXN0aW5nIHRpbWVyXG4gICAgY29uc3QgZXhpc3RpbmdUaW1lciA9IHRoaXMuY2hhbmdlVGltZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmIChleGlzdGluZ1RpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQoZXhpc3RpbmdUaW1lcik7XG4gICAgfVxuXG4gICAgLy8gU2NoZWR1bGUgbmV3IG5vdGlmaWNhdGlvbiBpbiA1MG1zXG4gICAgY29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMuY2hhbmdlVGltZXJzLmRlbGV0ZShzZXNzaW9uSWQpO1xuICAgICAgdGhpcy5ub3RpZnlCdWZmZXJDaGFuZ2Uoc2Vzc2lvbklkKTtcbiAgICB9LCA1MCk7XG5cbiAgICB0aGlzLmNoYW5nZVRpbWVycy5zZXQoc2Vzc2lvbklkLCB0aW1lcik7XG4gIH1cblxuICAvKipcbiAgICogTm90aWZ5IGxpc3RlbmVycyBvZiBidWZmZXIgY2hhbmdlXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIG5vdGlmeUJ1ZmZlckNoYW5nZShzZXNzaW9uSWQ6IHN0cmluZykge1xuICAgIGNvbnN0IGxpc3RlbmVycyA9IHRoaXMuYnVmZmVyTGlzdGVuZXJzLmdldChzZXNzaW9uSWQpO1xuICAgIGlmICghbGlzdGVuZXJzIHx8IGxpc3RlbmVycy5zaXplID09PSAwKSByZXR1cm47XG5cbiAgICAvLyBsb2dnZXIuZGVidWcoXG4gICAgLy8gICBgTm90aWZ5aW5nICR7bGlzdGVuZXJzLnNpemV9IGJ1ZmZlciBjaGFuZ2UgbGlzdGVuZXJzIGZvciBzZXNzaW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX1gXG4gICAgLy8gKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBHZXQgZnVsbCBidWZmZXIgc25hcHNob3RcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5nZXRCdWZmZXJTbmFwc2hvdChzZXNzaW9uSWQpO1xuXG4gICAgICAvLyBOb3RpZnkgYWxsIGxpc3RlbmVyc1xuICAgICAgbGlzdGVuZXJzLmZvckVhY2goKGxpc3RlbmVyKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbGlzdGVuZXIoc2Vzc2lvbklkLCBzbmFwc2hvdCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgYEVycm9yIG5vdGlmeWluZyBidWZmZXIgY2hhbmdlIGxpc3RlbmVyIGZvciAke3RydW5jYXRlRm9yTG9nKHNlc3Npb25JZCl9OmAsXG4gICAgICAgICAgICBlcnJvclxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBFcnJvciBnZXR0aW5nIGJ1ZmZlciBzbmFwc2hvdCBmb3Igbm90aWZpY2F0aW9uICR7dHJ1bmNhdGVGb3JMb2coc2Vzc2lvbklkKX06YCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJlc3VtZSBmaWxlIHdhdGNoaW5nIGZvciBhIHBhdXNlZCBzZXNzaW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHJlc3VtZUZpbGVXYXRjaGVyKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvblRlcm1pbmFsID0gdGhpcy50ZXJtaW5hbHMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uVGVybWluYWwgfHwgc2Vzc2lvblRlcm1pbmFsLndhdGNoZXIpIHtcbiAgICAgIHJldHVybjsgLy8gQWxyZWFkeSB3YXRjaGluZyBvciBzZXNzaW9uIGRvZXNuJ3QgZXhpc3RcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLndhdGNoU3RyZWFtRmlsZShzZXNzaW9uSWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIERlc3Ryb3kgdGhlIHRlcm1pbmFsIG1hbmFnZXIgYW5kIHJlc3RvcmUgY29uc29sZSBvdmVycmlkZXNcbiAgICovXG4gIGRlc3Ryb3koKTogdm9pZCB7XG4gICAgLy8gQ2xvc2UgYWxsIHRlcm1pbmFsc1xuICAgIGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIHRoaXMudGVybWluYWxzLmtleXMoKSkge1xuICAgICAgdGhpcy5jbG9zZVRlcm1pbmFsKHNlc3Npb25JZCk7XG4gICAgfVxuXG4gICAgLy8gQ2xlYXIgYWxsIHRpbWVyc1xuICAgIGZvciAoY29uc3QgdGltZXIgb2YgdGhpcy5jaGFuZ2VUaW1lcnMudmFsdWVzKCkpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgfVxuICAgIHRoaXMuY2hhbmdlVGltZXJzLmNsZWFyKCk7XG5cbiAgICAvLyBDbGVhciB3cml0ZSB0aW1lcnNcbiAgICBmb3IgKGNvbnN0IHRpbWVyIG9mIHRoaXMud3JpdGVUaW1lcnMudmFsdWVzKCkpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgfVxuICAgIHRoaXMud3JpdGVUaW1lcnMuY2xlYXIoKTtcblxuICAgIC8vIENsZWFyIHdyaXRlIHF1ZXVlc1xuICAgIHRoaXMud3JpdGVRdWV1ZXMuY2xlYXIoKTtcblxuICAgIC8vIENsZWFyIGZsb3cgY29udHJvbCB0aW1lclxuICAgIGlmICh0aGlzLmZsb3dDb250cm9sVGltZXIpIHtcbiAgICAgIGNsZWFySW50ZXJ2YWwodGhpcy5mbG93Q29udHJvbFRpbWVyKTtcbiAgICAgIHRoaXMuZmxvd0NvbnRyb2xUaW1lciA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvLyBSZXN0b3JlIG9yaWdpbmFsIGNvbnNvbGUud2FyblxuICAgIGNvbnNvbGUud2FybiA9IHRoaXMub3JpZ2luYWxDb25zb2xlV2FybjtcbiAgfVxufVxuIl19