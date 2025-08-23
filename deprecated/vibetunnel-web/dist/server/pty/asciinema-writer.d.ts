/**
 * AsciinemaWriter - Records terminal sessions in asciinema format
 *
 * This class writes terminal output in the standard asciinema cast format (v2),
 * which is compatible with asciinema players and the existing web interface.
 * It handles real-time streaming of terminal data while properly managing:
 * - UTF-8 encoding and incomplete multi-byte sequences
 * - ANSI escape sequences preservation
 * - Buffering and backpressure
 * - Atomic writes with fsync for durability
 *
 * Key features:
 * - Real-time recording with minimal buffering
 * - Proper handling of escape sequences across buffer boundaries
 * - Support for all asciinema event types (output, input, resize, markers)
 * - Automatic directory creation and file management
 * - Thread-safe write queue for concurrent operations
 *
 * @example
 * ```typescript
 * // Create a writer for a new recording
 * const writer = AsciinemaWriter.create(
 *   '/path/to/recording.cast',
 *   80,  // terminal width
 *   24,  // terminal height
 *   'npm test',  // command being recorded
 *   'Test Run Recording'  // title
 * );
 *
 * // Write terminal output
 * writer.writeOutput(Buffer.from('Hello, world!\r\n'));
 *
 * // Record user input
 * writer.writeInput('ls -la');
 *
 * // Handle terminal resize
 * writer.writeResize(120, 40);
 *
 * // Add a bookmark/marker
 * writer.writeMarker('Test started');
 *
 * // Close the recording when done
 * await writer.close();
 * ```
 */
import { type AsciinemaHeader } from './types.js';
export type PruningCallback = (info: {
    sequence: string;
    position: number;
    timestamp: number;
}) => void;
export declare class AsciinemaWriter {
    private filePath;
    private header;
    private writeStream;
    private startTime;
    private utf8Buffer;
    private headerWritten;
    private fd;
    private writeQueue;
    private bytesWritten;
    private pendingBytes;
    private pruningCallback?;
    private lastValidatedPosition;
    private validationErrors;
    constructor(filePath: string, header: AsciinemaHeader);
    /**
     * Create an AsciinemaWriter with standard parameters
     */
    static create(filePath: string, width?: number, height?: number, command?: string, title?: string, env?: Record<string, string>): AsciinemaWriter;
    /**
     * Get the current byte position in the file
     * @returns Object with current position and pending bytes
     */
    getPosition(): {
        written: number;
        pending: number;
        total: number;
    };
    /**
     * Set a callback to be notified when pruning sequences are detected
     * @param callback Function called with sequence info and byte position
     */
    onPruningSequence(callback: PruningCallback): void;
    /**
     * Write the asciinema header to the file
     */
    private writeHeader;
    /**
     * Write terminal output data
     */
    writeOutput(data: Buffer): void;
    /**
     * Write terminal input data (usually from user)
     */
    writeInput(data: string): void;
    /**
     * Write terminal resize event
     */
    writeResize(cols: number, rows: number): void;
    /**
     * Write marker event (for bookmarks/annotations)
     */
    writeMarker(message: string): void;
    /**
     * Write a raw JSON event (for custom events like exit)
     */
    writeRawJson(jsonValue: unknown): void;
    /**
     * Write an asciinema event to the file
     */
    private writeEvent;
    /**
     * Process terminal data while preserving escape sequences and handling UTF-8
     */
    private processTerminalData;
    /**
     * Find the end of an ANSI escape sequence
     */
    private findEscapeSequenceEnd;
    /**
     * Find valid UTF-8 portion of a buffer
     */
    private findValidUtf8;
    /**
     * Check if a buffer might contain incomplete UTF-8 sequence
     */
    private mightBeIncompleteUtf8;
    /**
     * Get elapsed time since start in seconds
     */
    private getElapsedTime;
    /**
     * Validate that our tracked position matches the actual file size
     */
    private validateFilePosition;
    /**
     * Close the writer and finalize the file
     */
    close(): Promise<void>;
    /**
     * Check if the writer is still open
     */
    isOpen(): boolean;
}
