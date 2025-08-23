"use strict";
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
exports.AsciinemaWriter = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const logger_js_1 = require("../utils/logger.js");
const pruning_detector_js_1 = require("../utils/pruning-detector.js");
const write_queue_js_1 = require("../utils/write-queue.js");
const types_js_1 = require("./types.js");
const _logger = (0, logger_js_1.createLogger)('AsciinemaWriter');
const fsync = (0, util_1.promisify)(fs.fsync);
class AsciinemaWriter {
    constructor(filePath, header) {
        this.filePath = filePath;
        this.header = header;
        this.utf8Buffer = Buffer.alloc(0);
        this.headerWritten = false;
        this.fd = null;
        this.writeQueue = new write_queue_js_1.WriteQueue();
        // Byte position tracking
        this.bytesWritten = 0; // Bytes actually written to disk
        this.pendingBytes = 0; // Bytes queued but not yet written
        // Validation tracking
        this.lastValidatedPosition = 0;
        this.validationErrors = 0;
        this.startTime = new Date();
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Create write stream with no buffering for real-time performance
        this.writeStream = fs.createWriteStream(filePath, {
            flags: 'w',
            encoding: 'utf8',
            highWaterMark: 0, // Disable internal buffering
        });
        // Get file descriptor for fsync
        this.writeStream.on('open', (fd) => {
            this.fd = fd;
        });
        this.writeHeader();
    }
    /**
     * Create an AsciinemaWriter with standard parameters
     */
    static create(filePath, width = 80, height = 24, command, title, env) {
        const header = {
            version: 2,
            width,
            height,
            timestamp: Math.floor(Date.now() / 1000),
            command,
            title,
            env,
        };
        return new AsciinemaWriter(filePath, header);
    }
    /**
     * Get the current byte position in the file
     * @returns Object with current position and pending bytes
     */
    getPosition() {
        return {
            written: this.bytesWritten, // Bytes actually written to disk
            pending: this.pendingBytes, // Bytes in queue
            total: this.bytesWritten + this.pendingBytes, // Total position after queue flush
        };
    }
    /**
     * Set a callback to be notified when pruning sequences are detected
     * @param callback Function called with sequence info and byte position
     */
    onPruningSequence(callback) {
        this.pruningCallback = callback;
    }
    /**
     * Write the asciinema header to the file
     */
    writeHeader() {
        if (this.headerWritten)
            return;
        this.writeQueue.enqueue(async () => {
            const headerJson = JSON.stringify(this.header);
            const headerLine = `${headerJson}\n`;
            const headerBytes = Buffer.from(headerLine, 'utf8').length;
            // Track pending bytes before write
            this.pendingBytes += headerBytes;
            const canWrite = this.writeStream.write(headerLine);
            if (!canWrite) {
                await (0, events_1.once)(this.writeStream, 'drain');
            }
            // Move bytes from pending to written
            this.bytesWritten += headerBytes;
            this.pendingBytes -= headerBytes;
        });
        this.headerWritten = true;
    }
    /**
     * Write terminal output data
     */
    writeOutput(data) {
        this.writeQueue.enqueue(async () => {
            const time = this.getElapsedTime();
            // Combine any buffered bytes with the new data
            const combinedBuffer = Buffer.concat([this.utf8Buffer, data]);
            // Process data in escape-sequence-aware chunks
            const { processedData, remainingBuffer } = this.processTerminalData(combinedBuffer);
            if (processedData.length > 0) {
                // First, check for pruning sequences in the data
                let pruningInfo = null;
                if (this.pruningCallback) {
                    // Use shared detector to find pruning sequences
                    const detection = (0, pruning_detector_js_1.detectLastPruningSequence)(processedData);
                    if (detection) {
                        pruningInfo = detection;
                        _logger.debug(`Found pruning sequence '${detection.sequence.split('\x1b').join('\\x1b')}' ` +
                            `at string index ${detection.index} in output data`);
                    }
                }
                // Create the event with ALL data (not truncated)
                const event = {
                    time,
                    type: 'o',
                    data: processedData,
                };
                // Calculate the byte position where the event will start
                const eventStartPos = this.bytesWritten + this.pendingBytes;
                // Write the event
                await this.writeEvent(event);
                // Now that the write is complete, handle pruning callback if needed
                if (pruningInfo && this.pruningCallback) {
                    // Use shared calculator for exact byte position
                    const exactSequenceEndPos = (0, pruning_detector_js_1.calculateSequenceBytePosition)(eventStartPos, time, processedData, pruningInfo.index, pruningInfo.sequence.length);
                    // Validate the calculation
                    const eventJson = `${JSON.stringify([time, 'o', processedData])}\n`;
                    const totalEventSize = Buffer.from(eventJson, 'utf8').length;
                    const calculatedEventEndPos = eventStartPos + totalEventSize;
                    if ((0, logger_js_1.isDebugEnabled)()) {
                        _logger.debug(`Pruning sequence byte calculation:\n` +
                            `  Event start position: ${eventStartPos}\n` +
                            `  Event total size: ${totalEventSize} bytes\n` +
                            `  Event end position: ${calculatedEventEndPos}\n` +
                            `  Exact sequence position: ${exactSequenceEndPos}\n` +
                            `  Current file position: ${this.bytesWritten}`);
                    }
                    // Sanity check: sequence position should be within the event
                    if (exactSequenceEndPos > calculatedEventEndPos) {
                        _logger.error(`Pruning sequence position calculation error: ` +
                            `sequence position ${exactSequenceEndPos} is beyond event end ${calculatedEventEndPos}`);
                    }
                    else {
                        // Call the callback with the exact position
                        this.pruningCallback({
                            sequence: pruningInfo.sequence,
                            position: exactSequenceEndPos,
                            timestamp: time,
                        });
                        // Use shared logging function
                        (0, pruning_detector_js_1.logPruningDetection)(pruningInfo.sequence, exactSequenceEndPos, '(real-time)');
                    }
                }
            }
            // Store any remaining incomplete data for next time
            this.utf8Buffer = remainingBuffer;
        });
    }
    /**
     * Write terminal input data (usually from user)
     */
    writeInput(data) {
        this.writeQueue.enqueue(async () => {
            const time = this.getElapsedTime();
            const event = {
                time,
                type: 'i',
                data,
            };
            await this.writeEvent(event);
        });
    }
    /**
     * Write terminal resize event
     */
    writeResize(cols, rows) {
        this.writeQueue.enqueue(async () => {
            const time = this.getElapsedTime();
            const event = {
                time,
                type: 'r',
                data: `${cols}x${rows}`,
            };
            await this.writeEvent(event);
        });
    }
    /**
     * Write marker event (for bookmarks/annotations)
     */
    writeMarker(message) {
        this.writeQueue.enqueue(async () => {
            const time = this.getElapsedTime();
            const event = {
                time,
                type: 'm',
                data: message,
            };
            await this.writeEvent(event);
        });
    }
    /**
     * Write a raw JSON event (for custom events like exit)
     */
    writeRawJson(jsonValue) {
        this.writeQueue.enqueue(async () => {
            const jsonString = JSON.stringify(jsonValue);
            const jsonLine = `${jsonString}\n`;
            const jsonBytes = Buffer.from(jsonLine, 'utf8').length;
            // Track pending bytes before write
            this.pendingBytes += jsonBytes;
            const canWrite = this.writeStream.write(jsonLine);
            if (!canWrite) {
                await (0, events_1.once)(this.writeStream, 'drain');
            }
            // Move bytes from pending to written
            this.bytesWritten += jsonBytes;
            this.pendingBytes -= jsonBytes;
        });
    }
    /**
     * Write an asciinema event to the file
     */
    async writeEvent(event) {
        // Asciinema format: [time, type, data]
        const eventArray = [event.time, event.type, event.data];
        const eventJson = JSON.stringify(eventArray);
        const eventLine = `${eventJson}\n`;
        const eventBytes = Buffer.from(eventLine, 'utf8').length;
        // Log detailed write information for debugging
        if (event.type === 'o' && (0, logger_js_1.isDebugEnabled)()) {
            _logger.debug(`Writing output event: ${eventBytes} bytes, ` +
                `data length: ${event.data.length} chars, ` +
                `position: ${this.bytesWritten + this.pendingBytes}`);
        }
        // Track pending bytes before write
        this.pendingBytes += eventBytes;
        // Write and handle backpressure
        const canWrite = this.writeStream.write(eventLine);
        if (!canWrite) {
            _logger.debug('Write stream backpressure detected, waiting for drain');
            await (0, events_1.once)(this.writeStream, 'drain');
        }
        // Move bytes from pending to written
        this.bytesWritten += eventBytes;
        this.pendingBytes -= eventBytes;
        // Validate position periodically
        if (this.bytesWritten - this.lastValidatedPosition > 1024 * 1024) {
            // Every 1MB
            await this.validateFilePosition();
        }
        // Sync to disk asynchronously
        if (this.fd !== null) {
            try {
                await fsync(this.fd);
            }
            catch (err) {
                _logger.debug(`fsync failed for ${this.filePath}:`, err);
            }
        }
    }
    /**
     * Process terminal data while preserving escape sequences and handling UTF-8
     */
    processTerminalData(buffer) {
        let result = '';
        let pos = 0;
        while (pos < buffer.length) {
            // Look for escape sequences starting with ESC (0x1B)
            if (buffer[pos] === 0x1b) {
                // Try to find complete escape sequence
                const seqEnd = this.findEscapeSequenceEnd(buffer.subarray(pos));
                if (seqEnd !== null) {
                    const seqBytes = buffer.subarray(pos, pos + seqEnd);
                    // Preserve escape sequence as-is using toString to maintain exact bytes
                    result += seqBytes.toString('latin1');
                    pos += seqEnd;
                }
                else {
                    // Incomplete escape sequence at end of buffer - save for later
                    return {
                        processedData: result,
                        remainingBuffer: buffer.subarray(pos),
                    };
                }
            }
            else {
                // Regular text - find the next escape sequence or end of valid UTF-8
                const chunkStart = pos;
                while (pos < buffer.length && buffer[pos] !== 0x1b) {
                    pos++;
                }
                const textChunk = buffer.subarray(chunkStart, pos);
                // Handle UTF-8 validation for text chunks
                try {
                    const validText = textChunk.toString('utf8');
                    result += validText;
                }
                catch (_e) {
                    // Try to find how much is valid UTF-8
                    const { validData, invalidStart } = this.findValidUtf8(textChunk);
                    if (validData.length > 0) {
                        result += validData.toString('utf8');
                    }
                    // Check if we have incomplete UTF-8 at the end
                    if (invalidStart < textChunk.length && pos >= buffer.length) {
                        const remaining = buffer.subarray(chunkStart + invalidStart);
                        // If it might be incomplete UTF-8 at buffer end, save it
                        if (remaining.length <= 4 && this.mightBeIncompleteUtf8(remaining)) {
                            return {
                                processedData: result,
                                remainingBuffer: remaining,
                            };
                        }
                    }
                    // Invalid UTF-8 in middle or complete invalid sequence
                    // Use lossy conversion for this part
                    const invalidPart = textChunk.subarray(invalidStart);
                    result += invalidPart.toString('latin1');
                }
            }
        }
        return { processedData: result, remainingBuffer: Buffer.alloc(0) };
    }
    /**
     * Find the end of an ANSI escape sequence
     */
    findEscapeSequenceEnd(buffer) {
        if (buffer.length === 0 || buffer[0] !== 0x1b) {
            return null;
        }
        if (buffer.length < 2) {
            return null; // Incomplete - need more data
        }
        switch (buffer[1]) {
            // CSI sequences: ESC [ ... final_char
            case 0x5b: {
                // '['
                let pos = 2;
                // Skip parameter and intermediate characters
                while (pos < buffer.length) {
                    const byte = buffer[pos];
                    if (byte >= 0x20 && byte <= 0x3f) {
                        // Parameter characters 0-9 : ; < = > ? and Intermediate characters
                        pos++;
                    }
                    else if (byte >= 0x40 && byte <= 0x7e) {
                        // Final character @ A-Z [ \ ] ^ _ ` a-z { | } ~
                        return pos + 1;
                    }
                    else {
                        // Invalid sequence, stop here
                        return pos;
                    }
                }
                return null; // Incomplete sequence
            }
            // OSC sequences: ESC ] ... (ST or BEL)
            case 0x5d: {
                // ']'
                let pos = 2;
                while (pos < buffer.length) {
                    const byte = buffer[pos];
                    if (byte === 0x07) {
                        // BEL terminator
                        return pos + 1;
                    }
                    else if (byte === 0x1b && pos + 1 < buffer.length && buffer[pos + 1] === 0x5c) {
                        // ESC \ (ST) terminator
                        return pos + 2;
                    }
                    pos++;
                }
                return null; // Incomplete sequence
            }
            // Simple two-character sequences: ESC letter
            default:
                return 2;
        }
    }
    /**
     * Find valid UTF-8 portion of a buffer
     */
    findValidUtf8(buffer) {
        for (let i = 0; i < buffer.length; i++) {
            try {
                const testSlice = buffer.subarray(0, i + 1);
                testSlice.toString('utf8');
            }
            catch (_e) {
                // Found invalid UTF-8, return valid portion
                return {
                    validData: buffer.subarray(0, i),
                    invalidStart: i,
                };
            }
        }
        // All valid
        return {
            validData: buffer,
            invalidStart: buffer.length,
        };
    }
    /**
     * Check if a buffer might contain incomplete UTF-8 sequence
     */
    mightBeIncompleteUtf8(buffer) {
        if (buffer.length === 0)
            return false;
        // Check if first byte indicates multi-byte UTF-8 character
        const firstByte = buffer[0];
        // Single byte (ASCII) - not incomplete
        if (firstByte < 0x80)
            return false;
        // Multi-byte sequence starters
        if (firstByte >= 0xc0) {
            // 2-byte sequence needs 2 bytes
            if (firstByte < 0xe0)
                return buffer.length < 2;
            // 3-byte sequence needs 3 bytes
            if (firstByte < 0xf0)
                return buffer.length < 3;
            // 4-byte sequence needs 4 bytes
            if (firstByte < 0xf8)
                return buffer.length < 4;
        }
        return false;
    }
    /**
     * Get elapsed time since start in seconds
     */
    getElapsedTime() {
        return (Date.now() - this.startTime.getTime()) / 1000;
    }
    /**
     * Validate that our tracked position matches the actual file size
     */
    async validateFilePosition() {
        try {
            const stats = await fs.promises.stat(this.filePath);
            const actualSize = stats.size;
            const expectedSize = this.bytesWritten;
            if (actualSize !== expectedSize) {
                this.validationErrors++;
                _logger.error(`AsciinemaWriter position mismatch! ` +
                    `Expected: ${expectedSize} bytes, Actual: ${actualSize} bytes, ` +
                    `Difference: ${actualSize - expectedSize} bytes, ` +
                    `Validation errors: ${this.validationErrors}`);
                // If the difference is significant, this is a critical error
                if (Math.abs(actualSize - expectedSize) > 100) {
                    throw new types_js_1.PtyError(`Critical byte position tracking error: expected ${expectedSize}, actual ${actualSize}`, 'POSITION_MISMATCH');
                }
            }
            else {
                _logger.debug(`Position validation passed: ${actualSize} bytes`);
            }
            this.lastValidatedPosition = this.bytesWritten;
        }
        catch (error) {
            if (error instanceof types_js_1.PtyError) {
                throw error;
            }
            _logger.error(`Failed to validate file position:`, error);
        }
    }
    /**
     * Close the writer and finalize the file
     */
    async close() {
        // Flush any remaining UTF-8 buffer through the queue
        if (this.utf8Buffer.length > 0) {
            // Force write any remaining data using lossy conversion
            const time = this.getElapsedTime();
            const event = {
                time,
                type: 'o',
                data: this.utf8Buffer.toString('latin1'),
            };
            // Use the queue to ensure ordering
            this.writeQueue.enqueue(async () => {
                await this.writeEvent(event);
            });
            this.utf8Buffer = Buffer.alloc(0);
        }
        // Wait for all queued writes to complete
        await this.writeQueue.drain();
        // Now it's safe to end the stream
        return new Promise((resolve, reject) => {
            this.writeStream.end((error) => {
                if (error) {
                    reject(new types_js_1.PtyError(`Failed to close asciinema writer: ${error.message}`));
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Check if the writer is still open
     */
    isOpen() {
        return !this.writeStream.destroyed;
    }
}
exports.AsciinemaWriter = AsciinemaWriter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNjaWluZW1hLXdyaXRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcHR5L2FzY2lpbmVtYS13cml0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTRDRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsbUNBQThCO0FBQzlCLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsK0JBQWlDO0FBQ2pDLGtEQUFrRTtBQUNsRSxzRUFJc0M7QUFDdEMsNERBQXFEO0FBQ3JELHlDQUFpRjtBQUVqRixNQUFNLE9BQU8sR0FBRyxJQUFBLHdCQUFZLEVBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUNoRCxNQUFNLEtBQUssR0FBRyxJQUFBLGdCQUFTLEVBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBU2xDLE1BQWEsZUFBZTtJQW1CMUIsWUFDVSxRQUFnQixFQUNoQixNQUF1QjtRQUR2QixhQUFRLEdBQVIsUUFBUSxDQUFRO1FBQ2hCLFdBQU0sR0FBTixNQUFNLENBQWlCO1FBbEJ6QixlQUFVLEdBQVcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQyxrQkFBYSxHQUFHLEtBQUssQ0FBQztRQUN0QixPQUFFLEdBQWtCLElBQUksQ0FBQztRQUN6QixlQUFVLEdBQUcsSUFBSSwyQkFBVSxFQUFFLENBQUM7UUFFdEMseUJBQXlCO1FBQ2pCLGlCQUFZLEdBQVcsQ0FBQyxDQUFDLENBQUMsaUNBQWlDO1FBQzNELGlCQUFZLEdBQVcsQ0FBQyxDQUFDLENBQUMsbUNBQW1DO1FBS3JFLHNCQUFzQjtRQUNkLDBCQUFxQixHQUFXLENBQUMsQ0FBQztRQUNsQyxxQkFBZ0IsR0FBVyxDQUFDLENBQUM7UUFNbkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBRTVC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SSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUU5QixrQ0FBa0M7UUFDbEMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNyQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQWEsRUFBRSxFQUFFO2dCQUNyQyxJQUFJLEtBQUssRUFBRSxDQUFDO29CQUNWLE1BQU0sQ0FBQyxJQUFJLG1CQUFRLENBQUMscUNBQXFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzdFLENBQUM7cUJBQU0sQ0FBQztvQkFDTixPQUFPLEVBQUUsQ0FBQztnQkFDWixDQUFDO1lBQ0gsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU07UUFDSixPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUM7SUFDckMsQ0FBQztDQUNGO0FBOWtCRCwwQ0E4a0JDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBc2NpaW5lbWFXcml0ZXIgLSBSZWNvcmRzIHRlcm1pbmFsIHNlc3Npb25zIGluIGFzY2lpbmVtYSBmb3JtYXRcbiAqXG4gKiBUaGlzIGNsYXNzIHdyaXRlcyB0ZXJtaW5hbCBvdXRwdXQgaW4gdGhlIHN0YW5kYXJkIGFzY2lpbmVtYSBjYXN0IGZvcm1hdCAodjIpLFxuICogd2hpY2ggaXMgY29tcGF0aWJsZSB3aXRoIGFzY2lpbmVtYSBwbGF5ZXJzIGFuZCB0aGUgZXhpc3Rpbmcgd2ViIGludGVyZmFjZS5cbiAqIEl0IGhhbmRsZXMgcmVhbC10aW1lIHN0cmVhbWluZyBvZiB0ZXJtaW5hbCBkYXRhIHdoaWxlIHByb3Blcmx5IG1hbmFnaW5nOlxuICogLSBVVEYtOCBlbmNvZGluZyBhbmQgaW5jb21wbGV0ZSBtdWx0aS1ieXRlIHNlcXVlbmNlc1xuICogLSBBTlNJIGVzY2FwZSBzZXF1ZW5jZXMgcHJlc2VydmF0aW9uXG4gKiAtIEJ1ZmZlcmluZyBhbmQgYmFja3ByZXNzdXJlXG4gKiAtIEF0b21pYyB3cml0ZXMgd2l0aCBmc3luYyBmb3IgZHVyYWJpbGl0eVxuICpcbiAqIEtleSBmZWF0dXJlczpcbiAqIC0gUmVhbC10aW1lIHJlY29yZGluZyB3aXRoIG1pbmltYWwgYnVmZmVyaW5nXG4gKiAtIFByb3BlciBoYW5kbGluZyBvZiBlc2NhcGUgc2VxdWVuY2VzIGFjcm9zcyBidWZmZXIgYm91bmRhcmllc1xuICogLSBTdXBwb3J0IGZvciBhbGwgYXNjaWluZW1hIGV2ZW50IHR5cGVzIChvdXRwdXQsIGlucHV0LCByZXNpemUsIG1hcmtlcnMpXG4gKiAtIEF1dG9tYXRpYyBkaXJlY3RvcnkgY3JlYXRpb24gYW5kIGZpbGUgbWFuYWdlbWVudFxuICogLSBUaHJlYWQtc2FmZSB3cml0ZSBxdWV1ZSBmb3IgY29uY3VycmVudCBvcGVyYXRpb25zXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIC8vIENyZWF0ZSBhIHdyaXRlciBmb3IgYSBuZXcgcmVjb3JkaW5nXG4gKiBjb25zdCB3cml0ZXIgPSBBc2NpaW5lbWFXcml0ZXIuY3JlYXRlKFxuICogICAnL3BhdGgvdG8vcmVjb3JkaW5nLmNhc3QnLFxuICogICA4MCwgIC8vIHRlcm1pbmFsIHdpZHRoXG4gKiAgIDI0LCAgLy8gdGVybWluYWwgaGVpZ2h0XG4gKiAgICducG0gdGVzdCcsICAvLyBjb21tYW5kIGJlaW5nIHJlY29yZGVkXG4gKiAgICdUZXN0IFJ1biBSZWNvcmRpbmcnICAvLyB0aXRsZVxuICogKTtcbiAqXG4gKiAvLyBXcml0ZSB0ZXJtaW5hbCBvdXRwdXRcbiAqIHdyaXRlci53cml0ZU91dHB1dChCdWZmZXIuZnJvbSgnSGVsbG8sIHdvcmxkIVxcclxcbicpKTtcbiAqXG4gKiAvLyBSZWNvcmQgdXNlciBpbnB1dFxuICogd3JpdGVyLndyaXRlSW5wdXQoJ2xzIC1sYScpO1xuICpcbiAqIC8vIEhhbmRsZSB0ZXJtaW5hbCByZXNpemVcbiAqIHdyaXRlci53cml0ZVJlc2l6ZSgxMjAsIDQwKTtcbiAqXG4gKiAvLyBBZGQgYSBib29rbWFyay9tYXJrZXJcbiAqIHdyaXRlci53cml0ZU1hcmtlcignVGVzdCBzdGFydGVkJyk7XG4gKlxuICogLy8gQ2xvc2UgdGhlIHJlY29yZGluZyB3aGVuIGRvbmVcbiAqIGF3YWl0IHdyaXRlci5jbG9zZSgpO1xuICogYGBgXG4gKi9cblxuaW1wb3J0IHsgb25jZSB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIsIGlzRGVidWdFbmFibGVkIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7XG4gIGNhbGN1bGF0ZVNlcXVlbmNlQnl0ZVBvc2l0aW9uLFxuICBkZXRlY3RMYXN0UHJ1bmluZ1NlcXVlbmNlLFxuICBsb2dQcnVuaW5nRGV0ZWN0aW9uLFxufSBmcm9tICcuLi91dGlscy9wcnVuaW5nLWRldGVjdG9yLmpzJztcbmltcG9ydCB7IFdyaXRlUXVldWUgfSBmcm9tICcuLi91dGlscy93cml0ZS1xdWV1ZS5qcyc7XG5pbXBvcnQgeyB0eXBlIEFzY2lpbmVtYUV2ZW50LCB0eXBlIEFzY2lpbmVtYUhlYWRlciwgUHR5RXJyb3IgfSBmcm9tICcuL3R5cGVzLmpzJztcblxuY29uc3QgX2xvZ2dlciA9IGNyZWF0ZUxvZ2dlcignQXNjaWluZW1hV3JpdGVyJyk7XG5jb25zdCBmc3luYyA9IHByb21pc2lmeShmcy5mc3luYyk7XG5cbi8vIFR5cGUgZm9yIHBydW5pbmcgc2VxdWVuY2UgY2FsbGJhY2tcbmV4cG9ydCB0eXBlIFBydW5pbmdDYWxsYmFjayA9IChpbmZvOiB7XG4gIHNlcXVlbmNlOiBzdHJpbmc7XG4gIHBvc2l0aW9uOiBudW1iZXI7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufSkgPT4gdm9pZDtcblxuZXhwb3J0IGNsYXNzIEFzY2lpbmVtYVdyaXRlciB7XG4gIHByaXZhdGUgd3JpdGVTdHJlYW06IGZzLldyaXRlU3RyZWFtO1xuICBwcml2YXRlIHN0YXJ0VGltZTogRGF0ZTtcbiAgcHJpdmF0ZSB1dGY4QnVmZmVyOiBCdWZmZXIgPSBCdWZmZXIuYWxsb2MoMCk7XG4gIHByaXZhdGUgaGVhZGVyV3JpdHRlbiA9IGZhbHNlO1xuICBwcml2YXRlIGZkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSB3cml0ZVF1ZXVlID0gbmV3IFdyaXRlUXVldWUoKTtcblxuICAvLyBCeXRlIHBvc2l0aW9uIHRyYWNraW5nXG4gIHByaXZhdGUgYnl0ZXNXcml0dGVuOiBudW1iZXIgPSAwOyAvLyBCeXRlcyBhY3R1YWxseSB3cml0dGVuIHRvIGRpc2tcbiAgcHJpdmF0ZSBwZW5kaW5nQnl0ZXM6IG51bWJlciA9IDA7IC8vIEJ5dGVzIHF1ZXVlZCBidXQgbm90IHlldCB3cml0dGVuXG5cbiAgLy8gUHJ1bmluZyBzZXF1ZW5jZSBkZXRlY3Rpb24gY2FsbGJhY2tcbiAgcHJpdmF0ZSBwcnVuaW5nQ2FsbGJhY2s/OiBQcnVuaW5nQ2FsbGJhY2s7XG5cbiAgLy8gVmFsaWRhdGlvbiB0cmFja2luZ1xuICBwcml2YXRlIGxhc3RWYWxpZGF0ZWRQb3NpdGlvbjogbnVtYmVyID0gMDtcbiAgcHJpdmF0ZSB2YWxpZGF0aW9uRXJyb3JzOiBudW1iZXIgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByaXZhdGUgZmlsZVBhdGg6IHN0cmluZyxcbiAgICBwcml2YXRlIGhlYWRlcjogQXNjaWluZW1hSGVhZGVyXG4gICkge1xuICAgIHRoaXMuc3RhcnRUaW1lID0gbmV3IERhdGUoKTtcblxuICAgIC8vIEVuc3VyZSBkaXJlY3RvcnkgZXhpc3RzXG4gICAgY29uc3QgZGlyID0gcGF0aC5kaXJuYW1lKGZpbGVQYXRoKTtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGRpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHdyaXRlIHN0cmVhbSB3aXRoIG5vIGJ1ZmZlcmluZyBmb3IgcmVhbC10aW1lIHBlcmZvcm1hbmNlXG4gICAgdGhpcy53cml0ZVN0cmVhbSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGZpbGVQYXRoLCB7XG4gICAgICBmbGFnczogJ3cnLFxuICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgIGhpZ2hXYXRlck1hcms6IDAsIC8vIERpc2FibGUgaW50ZXJuYWwgYnVmZmVyaW5nXG4gICAgfSk7XG5cbiAgICAvLyBHZXQgZmlsZSBkZXNjcmlwdG9yIGZvciBmc3luY1xuICAgIHRoaXMud3JpdGVTdHJlYW0ub24oJ29wZW4nLCAoZmQpID0+IHtcbiAgICAgIHRoaXMuZmQgPSBmZDtcbiAgICB9KTtcblxuICAgIHRoaXMud3JpdGVIZWFkZXIoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYW4gQXNjaWluZW1hV3JpdGVyIHdpdGggc3RhbmRhcmQgcGFyYW1ldGVyc1xuICAgKi9cbiAgc3RhdGljIGNyZWF0ZShcbiAgICBmaWxlUGF0aDogc3RyaW5nLFxuICAgIHdpZHRoOiBudW1iZXIgPSA4MCxcbiAgICBoZWlnaHQ6IG51bWJlciA9IDI0LFxuICAgIGNvbW1hbmQ/OiBzdHJpbmcsXG4gICAgdGl0bGU/OiBzdHJpbmcsXG4gICAgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuICApOiBBc2NpaW5lbWFXcml0ZXIge1xuICAgIGNvbnN0IGhlYWRlcjogQXNjaWluZW1hSGVhZGVyID0ge1xuICAgICAgdmVyc2lvbjogMixcbiAgICAgIHdpZHRoLFxuICAgICAgaGVpZ2h0LFxuICAgICAgdGltZXN0YW1wOiBNYXRoLmZsb29yKERhdGUubm93KCkgLyAxMDAwKSxcbiAgICAgIGNvbW1hbmQsXG4gICAgICB0aXRsZSxcbiAgICAgIGVudixcbiAgICB9O1xuXG4gICAgcmV0dXJuIG5ldyBBc2NpaW5lbWFXcml0ZXIoZmlsZVBhdGgsIGhlYWRlcik7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBjdXJyZW50IGJ5dGUgcG9zaXRpb24gaW4gdGhlIGZpbGVcbiAgICogQHJldHVybnMgT2JqZWN0IHdpdGggY3VycmVudCBwb3NpdGlvbiBhbmQgcGVuZGluZyBieXRlc1xuICAgKi9cbiAgZ2V0UG9zaXRpb24oKTogeyB3cml0dGVuOiBudW1iZXI7IHBlbmRpbmc6IG51bWJlcjsgdG90YWw6IG51bWJlciB9IHtcbiAgICByZXR1cm4ge1xuICAgICAgd3JpdHRlbjogdGhpcy5ieXRlc1dyaXR0ZW4sIC8vIEJ5dGVzIGFjdHVhbGx5IHdyaXR0ZW4gdG8gZGlza1xuICAgICAgcGVuZGluZzogdGhpcy5wZW5kaW5nQnl0ZXMsIC8vIEJ5dGVzIGluIHF1ZXVlXG4gICAgICB0b3RhbDogdGhpcy5ieXRlc1dyaXR0ZW4gKyB0aGlzLnBlbmRpbmdCeXRlcywgLy8gVG90YWwgcG9zaXRpb24gYWZ0ZXIgcXVldWUgZmx1c2hcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNldCBhIGNhbGxiYWNrIHRvIGJlIG5vdGlmaWVkIHdoZW4gcHJ1bmluZyBzZXF1ZW5jZXMgYXJlIGRldGVjdGVkXG4gICAqIEBwYXJhbSBjYWxsYmFjayBGdW5jdGlvbiBjYWxsZWQgd2l0aCBzZXF1ZW5jZSBpbmZvIGFuZCBieXRlIHBvc2l0aW9uXG4gICAqL1xuICBvblBydW5pbmdTZXF1ZW5jZShjYWxsYmFjazogUHJ1bmluZ0NhbGxiYWNrKTogdm9pZCB7XG4gICAgdGhpcy5wcnVuaW5nQ2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSB0aGUgYXNjaWluZW1hIGhlYWRlciB0byB0aGUgZmlsZVxuICAgKi9cbiAgcHJpdmF0ZSB3cml0ZUhlYWRlcigpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5oZWFkZXJXcml0dGVuKSByZXR1cm47XG5cbiAgICB0aGlzLndyaXRlUXVldWUuZW5xdWV1ZShhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBoZWFkZXJKc29uID0gSlNPTi5zdHJpbmdpZnkodGhpcy5oZWFkZXIpO1xuICAgICAgY29uc3QgaGVhZGVyTGluZSA9IGAke2hlYWRlckpzb259XFxuYDtcbiAgICAgIGNvbnN0IGhlYWRlckJ5dGVzID0gQnVmZmVyLmZyb20oaGVhZGVyTGluZSwgJ3V0ZjgnKS5sZW5ndGg7XG5cbiAgICAgIC8vIFRyYWNrIHBlbmRpbmcgYnl0ZXMgYmVmb3JlIHdyaXRlXG4gICAgICB0aGlzLnBlbmRpbmdCeXRlcyArPSBoZWFkZXJCeXRlcztcblxuICAgICAgY29uc3QgY2FuV3JpdGUgPSB0aGlzLndyaXRlU3RyZWFtLndyaXRlKGhlYWRlckxpbmUpO1xuICAgICAgaWYgKCFjYW5Xcml0ZSkge1xuICAgICAgICBhd2FpdCBvbmNlKHRoaXMud3JpdGVTdHJlYW0sICdkcmFpbicpO1xuICAgICAgfVxuXG4gICAgICAvLyBNb3ZlIGJ5dGVzIGZyb20gcGVuZGluZyB0byB3cml0dGVuXG4gICAgICB0aGlzLmJ5dGVzV3JpdHRlbiArPSBoZWFkZXJCeXRlcztcbiAgICAgIHRoaXMucGVuZGluZ0J5dGVzIC09IGhlYWRlckJ5dGVzO1xuICAgIH0pO1xuICAgIHRoaXMuaGVhZGVyV3JpdHRlbiA9IHRydWU7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgdGVybWluYWwgb3V0cHV0IGRhdGFcbiAgICovXG4gIHdyaXRlT3V0cHV0KGRhdGE6IEJ1ZmZlcik6IHZvaWQge1xuICAgIHRoaXMud3JpdGVRdWV1ZS5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHRpbWUgPSB0aGlzLmdldEVsYXBzZWRUaW1lKCk7XG5cbiAgICAgIC8vIENvbWJpbmUgYW55IGJ1ZmZlcmVkIGJ5dGVzIHdpdGggdGhlIG5ldyBkYXRhXG4gICAgICBjb25zdCBjb21iaW5lZEJ1ZmZlciA9IEJ1ZmZlci5jb25jYXQoW3RoaXMudXRmOEJ1ZmZlciwgZGF0YV0pO1xuXG4gICAgICAvLyBQcm9jZXNzIGRhdGEgaW4gZXNjYXBlLXNlcXVlbmNlLWF3YXJlIGNodW5rc1xuICAgICAgY29uc3QgeyBwcm9jZXNzZWREYXRhLCByZW1haW5pbmdCdWZmZXIgfSA9IHRoaXMucHJvY2Vzc1Rlcm1pbmFsRGF0YShjb21iaW5lZEJ1ZmZlcik7XG5cbiAgICAgIGlmIChwcm9jZXNzZWREYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gRmlyc3QsIGNoZWNrIGZvciBwcnVuaW5nIHNlcXVlbmNlcyBpbiB0aGUgZGF0YVxuICAgICAgICBsZXQgcHJ1bmluZ0luZm86IHsgc2VxdWVuY2U6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cbiAgICAgICAgaWYgKHRoaXMucHJ1bmluZ0NhbGxiYWNrKSB7XG4gICAgICAgICAgLy8gVXNlIHNoYXJlZCBkZXRlY3RvciB0byBmaW5kIHBydW5pbmcgc2VxdWVuY2VzXG4gICAgICAgICAgY29uc3QgZGV0ZWN0aW9uID0gZGV0ZWN0TGFzdFBydW5pbmdTZXF1ZW5jZShwcm9jZXNzZWREYXRhKTtcblxuICAgICAgICAgIGlmIChkZXRlY3Rpb24pIHtcbiAgICAgICAgICAgIHBydW5pbmdJbmZvID0gZGV0ZWN0aW9uO1xuICAgICAgICAgICAgX2xvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgICAgYEZvdW5kIHBydW5pbmcgc2VxdWVuY2UgJyR7ZGV0ZWN0aW9uLnNlcXVlbmNlLnNwbGl0KCdcXHgxYicpLmpvaW4oJ1xcXFx4MWInKX0nIGAgK1xuICAgICAgICAgICAgICAgIGBhdCBzdHJpbmcgaW5kZXggJHtkZXRlY3Rpb24uaW5kZXh9IGluIG91dHB1dCBkYXRhYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDcmVhdGUgdGhlIGV2ZW50IHdpdGggQUxMIGRhdGEgKG5vdCB0cnVuY2F0ZWQpXG4gICAgICAgIGNvbnN0IGV2ZW50OiBBc2NpaW5lbWFFdmVudCA9IHtcbiAgICAgICAgICB0aW1lLFxuICAgICAgICAgIHR5cGU6ICdvJyxcbiAgICAgICAgICBkYXRhOiBwcm9jZXNzZWREYXRhLFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgYnl0ZSBwb3NpdGlvbiB3aGVyZSB0aGUgZXZlbnQgd2lsbCBzdGFydFxuICAgICAgICBjb25zdCBldmVudFN0YXJ0UG9zID0gdGhpcy5ieXRlc1dyaXR0ZW4gKyB0aGlzLnBlbmRpbmdCeXRlcztcblxuICAgICAgICAvLyBXcml0ZSB0aGUgZXZlbnRcbiAgICAgICAgYXdhaXQgdGhpcy53cml0ZUV2ZW50KGV2ZW50KTtcblxuICAgICAgICAvLyBOb3cgdGhhdCB0aGUgd3JpdGUgaXMgY29tcGxldGUsIGhhbmRsZSBwcnVuaW5nIGNhbGxiYWNrIGlmIG5lZWRlZFxuICAgICAgICBpZiAocHJ1bmluZ0luZm8gJiYgdGhpcy5wcnVuaW5nQ2FsbGJhY2spIHtcbiAgICAgICAgICAvLyBVc2Ugc2hhcmVkIGNhbGN1bGF0b3IgZm9yIGV4YWN0IGJ5dGUgcG9zaXRpb25cbiAgICAgICAgICBjb25zdCBleGFjdFNlcXVlbmNlRW5kUG9zID0gY2FsY3VsYXRlU2VxdWVuY2VCeXRlUG9zaXRpb24oXG4gICAgICAgICAgICBldmVudFN0YXJ0UG9zLFxuICAgICAgICAgICAgdGltZSxcbiAgICAgICAgICAgIHByb2Nlc3NlZERhdGEsXG4gICAgICAgICAgICBwcnVuaW5nSW5mby5pbmRleCxcbiAgICAgICAgICAgIHBydW5pbmdJbmZvLnNlcXVlbmNlLmxlbmd0aFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBWYWxpZGF0ZSB0aGUgY2FsY3VsYXRpb25cbiAgICAgICAgICBjb25zdCBldmVudEpzb24gPSBgJHtKU09OLnN0cmluZ2lmeShbdGltZSwgJ28nLCBwcm9jZXNzZWREYXRhXSl9XFxuYDtcbiAgICAgICAgICBjb25zdCB0b3RhbEV2ZW50U2l6ZSA9IEJ1ZmZlci5mcm9tKGV2ZW50SnNvbiwgJ3V0ZjgnKS5sZW5ndGg7XG4gICAgICAgICAgY29uc3QgY2FsY3VsYXRlZEV2ZW50RW5kUG9zID0gZXZlbnRTdGFydFBvcyArIHRvdGFsRXZlbnRTaXplO1xuXG4gICAgICAgICAgaWYgKGlzRGVidWdFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIF9sb2dnZXIuZGVidWcoXG4gICAgICAgICAgICAgIGBQcnVuaW5nIHNlcXVlbmNlIGJ5dGUgY2FsY3VsYXRpb246XFxuYCArXG4gICAgICAgICAgICAgICAgYCAgRXZlbnQgc3RhcnQgcG9zaXRpb246ICR7ZXZlbnRTdGFydFBvc31cXG5gICtcbiAgICAgICAgICAgICAgICBgICBFdmVudCB0b3RhbCBzaXplOiAke3RvdGFsRXZlbnRTaXplfSBieXRlc1xcbmAgK1xuICAgICAgICAgICAgICAgIGAgIEV2ZW50IGVuZCBwb3NpdGlvbjogJHtjYWxjdWxhdGVkRXZlbnRFbmRQb3N9XFxuYCArXG4gICAgICAgICAgICAgICAgYCAgRXhhY3Qgc2VxdWVuY2UgcG9zaXRpb246ICR7ZXhhY3RTZXF1ZW5jZUVuZFBvc31cXG5gICtcbiAgICAgICAgICAgICAgICBgICBDdXJyZW50IGZpbGUgcG9zaXRpb246ICR7dGhpcy5ieXRlc1dyaXR0ZW59YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBTYW5pdHkgY2hlY2s6IHNlcXVlbmNlIHBvc2l0aW9uIHNob3VsZCBiZSB3aXRoaW4gdGhlIGV2ZW50XG4gICAgICAgICAgaWYgKGV4YWN0U2VxdWVuY2VFbmRQb3MgPiBjYWxjdWxhdGVkRXZlbnRFbmRQb3MpIHtcbiAgICAgICAgICAgIF9sb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgIGBQcnVuaW5nIHNlcXVlbmNlIHBvc2l0aW9uIGNhbGN1bGF0aW9uIGVycm9yOiBgICtcbiAgICAgICAgICAgICAgICBgc2VxdWVuY2UgcG9zaXRpb24gJHtleGFjdFNlcXVlbmNlRW5kUG9zfSBpcyBiZXlvbmQgZXZlbnQgZW5kICR7Y2FsY3VsYXRlZEV2ZW50RW5kUG9zfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENhbGwgdGhlIGNhbGxiYWNrIHdpdGggdGhlIGV4YWN0IHBvc2l0aW9uXG4gICAgICAgICAgICB0aGlzLnBydW5pbmdDYWxsYmFjayh7XG4gICAgICAgICAgICAgIHNlcXVlbmNlOiBwcnVuaW5nSW5mby5zZXF1ZW5jZSxcbiAgICAgICAgICAgICAgcG9zaXRpb246IGV4YWN0U2VxdWVuY2VFbmRQb3MsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogdGltZSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBVc2Ugc2hhcmVkIGxvZ2dpbmcgZnVuY3Rpb25cbiAgICAgICAgICAgIGxvZ1BydW5pbmdEZXRlY3Rpb24ocHJ1bmluZ0luZm8uc2VxdWVuY2UsIGV4YWN0U2VxdWVuY2VFbmRQb3MsICcocmVhbC10aW1lKScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBTdG9yZSBhbnkgcmVtYWluaW5nIGluY29tcGxldGUgZGF0YSBmb3IgbmV4dCB0aW1lXG4gICAgICB0aGlzLnV0ZjhCdWZmZXIgPSByZW1haW5pbmdCdWZmZXI7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgdGVybWluYWwgaW5wdXQgZGF0YSAodXN1YWxseSBmcm9tIHVzZXIpXG4gICAqL1xuICB3cml0ZUlucHV0KGRhdGE6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMud3JpdGVRdWV1ZS5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHRpbWUgPSB0aGlzLmdldEVsYXBzZWRUaW1lKCk7XG4gICAgICBjb25zdCBldmVudDogQXNjaWluZW1hRXZlbnQgPSB7XG4gICAgICAgIHRpbWUsXG4gICAgICAgIHR5cGU6ICdpJyxcbiAgICAgICAgZGF0YSxcbiAgICAgIH07XG4gICAgICBhd2FpdCB0aGlzLndyaXRlRXZlbnQoZXZlbnQpO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFdyaXRlIHRlcm1pbmFsIHJlc2l6ZSBldmVudFxuICAgKi9cbiAgd3JpdGVSZXNpemUoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLndyaXRlUXVldWUuZW5xdWV1ZShhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCB0aW1lID0gdGhpcy5nZXRFbGFwc2VkVGltZSgpO1xuICAgICAgY29uc3QgZXZlbnQ6IEFzY2lpbmVtYUV2ZW50ID0ge1xuICAgICAgICB0aW1lLFxuICAgICAgICB0eXBlOiAncicsXG4gICAgICAgIGRhdGE6IGAke2NvbHN9eCR7cm93c31gLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVFdmVudChldmVudCk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgbWFya2VyIGV2ZW50IChmb3IgYm9va21hcmtzL2Fubm90YXRpb25zKVxuICAgKi9cbiAgd3JpdGVNYXJrZXIobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy53cml0ZVF1ZXVlLmVucXVldWUoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgdGltZSA9IHRoaXMuZ2V0RWxhcHNlZFRpbWUoKTtcbiAgICAgIGNvbnN0IGV2ZW50OiBBc2NpaW5lbWFFdmVudCA9IHtcbiAgICAgICAgdGltZSxcbiAgICAgICAgdHlwZTogJ20nLFxuICAgICAgICBkYXRhOiBtZXNzYWdlLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHRoaXMud3JpdGVFdmVudChldmVudCk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogV3JpdGUgYSByYXcgSlNPTiBldmVudCAoZm9yIGN1c3RvbSBldmVudHMgbGlrZSBleGl0KVxuICAgKi9cbiAgd3JpdGVSYXdKc29uKGpzb25WYWx1ZTogdW5rbm93bik6IHZvaWQge1xuICAgIHRoaXMud3JpdGVRdWV1ZS5lbnF1ZXVlKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IGpzb25TdHJpbmcgPSBKU09OLnN0cmluZ2lmeShqc29uVmFsdWUpO1xuICAgICAgY29uc3QganNvbkxpbmUgPSBgJHtqc29uU3RyaW5nfVxcbmA7XG4gICAgICBjb25zdCBqc29uQnl0ZXMgPSBCdWZmZXIuZnJvbShqc29uTGluZSwgJ3V0ZjgnKS5sZW5ndGg7XG5cbiAgICAgIC8vIFRyYWNrIHBlbmRpbmcgYnl0ZXMgYmVmb3JlIHdyaXRlXG4gICAgICB0aGlzLnBlbmRpbmdCeXRlcyArPSBqc29uQnl0ZXM7XG5cbiAgICAgIGNvbnN0IGNhbldyaXRlID0gdGhpcy53cml0ZVN0cmVhbS53cml0ZShqc29uTGluZSk7XG4gICAgICBpZiAoIWNhbldyaXRlKSB7XG4gICAgICAgIGF3YWl0IG9uY2UodGhpcy53cml0ZVN0cmVhbSwgJ2RyYWluJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIE1vdmUgYnl0ZXMgZnJvbSBwZW5kaW5nIHRvIHdyaXR0ZW5cbiAgICAgIHRoaXMuYnl0ZXNXcml0dGVuICs9IGpzb25CeXRlcztcbiAgICAgIHRoaXMucGVuZGluZ0J5dGVzIC09IGpzb25CeXRlcztcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBXcml0ZSBhbiBhc2NpaW5lbWEgZXZlbnQgdG8gdGhlIGZpbGVcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgd3JpdGVFdmVudChldmVudDogQXNjaWluZW1hRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBBc2NpaW5lbWEgZm9ybWF0OiBbdGltZSwgdHlwZSwgZGF0YV1cbiAgICBjb25zdCBldmVudEFycmF5ID0gW2V2ZW50LnRpbWUsIGV2ZW50LnR5cGUsIGV2ZW50LmRhdGFdO1xuICAgIGNvbnN0IGV2ZW50SnNvbiA9IEpTT04uc3RyaW5naWZ5KGV2ZW50QXJyYXkpO1xuICAgIGNvbnN0IGV2ZW50TGluZSA9IGAke2V2ZW50SnNvbn1cXG5gO1xuICAgIGNvbnN0IGV2ZW50Qnl0ZXMgPSBCdWZmZXIuZnJvbShldmVudExpbmUsICd1dGY4JykubGVuZ3RoO1xuXG4gICAgLy8gTG9nIGRldGFpbGVkIHdyaXRlIGluZm9ybWF0aW9uIGZvciBkZWJ1Z2dpbmdcbiAgICBpZiAoZXZlbnQudHlwZSA9PT0gJ28nICYmIGlzRGVidWdFbmFibGVkKCkpIHtcbiAgICAgIF9sb2dnZXIuZGVidWcoXG4gICAgICAgIGBXcml0aW5nIG91dHB1dCBldmVudDogJHtldmVudEJ5dGVzfSBieXRlcywgYCArXG4gICAgICAgICAgYGRhdGEgbGVuZ3RoOiAke2V2ZW50LmRhdGEubGVuZ3RofSBjaGFycywgYCArXG4gICAgICAgICAgYHBvc2l0aW9uOiAke3RoaXMuYnl0ZXNXcml0dGVuICsgdGhpcy5wZW5kaW5nQnl0ZXN9YFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBUcmFjayBwZW5kaW5nIGJ5dGVzIGJlZm9yZSB3cml0ZVxuICAgIHRoaXMucGVuZGluZ0J5dGVzICs9IGV2ZW50Qnl0ZXM7XG5cbiAgICAvLyBXcml0ZSBhbmQgaGFuZGxlIGJhY2twcmVzc3VyZVxuICAgIGNvbnN0IGNhbldyaXRlID0gdGhpcy53cml0ZVN0cmVhbS53cml0ZShldmVudExpbmUpO1xuICAgIGlmICghY2FuV3JpdGUpIHtcbiAgICAgIF9sb2dnZXIuZGVidWcoJ1dyaXRlIHN0cmVhbSBiYWNrcHJlc3N1cmUgZGV0ZWN0ZWQsIHdhaXRpbmcgZm9yIGRyYWluJyk7XG4gICAgICBhd2FpdCBvbmNlKHRoaXMud3JpdGVTdHJlYW0sICdkcmFpbicpO1xuICAgIH1cblxuICAgIC8vIE1vdmUgYnl0ZXMgZnJvbSBwZW5kaW5nIHRvIHdyaXR0ZW5cbiAgICB0aGlzLmJ5dGVzV3JpdHRlbiArPSBldmVudEJ5dGVzO1xuICAgIHRoaXMucGVuZGluZ0J5dGVzIC09IGV2ZW50Qnl0ZXM7XG5cbiAgICAvLyBWYWxpZGF0ZSBwb3NpdGlvbiBwZXJpb2RpY2FsbHlcbiAgICBpZiAodGhpcy5ieXRlc1dyaXR0ZW4gLSB0aGlzLmxhc3RWYWxpZGF0ZWRQb3NpdGlvbiA+IDEwMjQgKiAxMDI0KSB7XG4gICAgICAvLyBFdmVyeSAxTUJcbiAgICAgIGF3YWl0IHRoaXMudmFsaWRhdGVGaWxlUG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvLyBTeW5jIHRvIGRpc2sgYXN5bmNocm9ub3VzbHlcbiAgICBpZiAodGhpcy5mZCAhPT0gbnVsbCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZnN5bmModGhpcy5mZCk7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgX2xvZ2dlci5kZWJ1ZyhgZnN5bmMgZmFpbGVkIGZvciAke3RoaXMuZmlsZVBhdGh9OmAsIGVycik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgdGVybWluYWwgZGF0YSB3aGlsZSBwcmVzZXJ2aW5nIGVzY2FwZSBzZXF1ZW5jZXMgYW5kIGhhbmRsaW5nIFVURi04XG4gICAqL1xuICBwcml2YXRlIHByb2Nlc3NUZXJtaW5hbERhdGEoYnVmZmVyOiBCdWZmZXIpOiB7IHByb2Nlc3NlZERhdGE6IHN0cmluZzsgcmVtYWluaW5nQnVmZmVyOiBCdWZmZXIgfSB7XG4gICAgbGV0IHJlc3VsdCA9ICcnO1xuICAgIGxldCBwb3MgPSAwO1xuXG4gICAgd2hpbGUgKHBvcyA8IGJ1ZmZlci5sZW5ndGgpIHtcbiAgICAgIC8vIExvb2sgZm9yIGVzY2FwZSBzZXF1ZW5jZXMgc3RhcnRpbmcgd2l0aCBFU0MgKDB4MUIpXG4gICAgICBpZiAoYnVmZmVyW3Bvc10gPT09IDB4MWIpIHtcbiAgICAgICAgLy8gVHJ5IHRvIGZpbmQgY29tcGxldGUgZXNjYXBlIHNlcXVlbmNlXG4gICAgICAgIGNvbnN0IHNlcUVuZCA9IHRoaXMuZmluZEVzY2FwZVNlcXVlbmNlRW5kKGJ1ZmZlci5zdWJhcnJheShwb3MpKTtcbiAgICAgICAgaWYgKHNlcUVuZCAhPT0gbnVsbCkge1xuICAgICAgICAgIGNvbnN0IHNlcUJ5dGVzID0gYnVmZmVyLnN1YmFycmF5KHBvcywgcG9zICsgc2VxRW5kKTtcbiAgICAgICAgICAvLyBQcmVzZXJ2ZSBlc2NhcGUgc2VxdWVuY2UgYXMtaXMgdXNpbmcgdG9TdHJpbmcgdG8gbWFpbnRhaW4gZXhhY3QgYnl0ZXNcbiAgICAgICAgICByZXN1bHQgKz0gc2VxQnl0ZXMudG9TdHJpbmcoJ2xhdGluMScpO1xuICAgICAgICAgIHBvcyArPSBzZXFFbmQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gSW5jb21wbGV0ZSBlc2NhcGUgc2VxdWVuY2UgYXQgZW5kIG9mIGJ1ZmZlciAtIHNhdmUgZm9yIGxhdGVyXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHByb2Nlc3NlZERhdGE6IHJlc3VsdCxcbiAgICAgICAgICAgIHJlbWFpbmluZ0J1ZmZlcjogYnVmZmVyLnN1YmFycmF5KHBvcyksXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUmVndWxhciB0ZXh0IC0gZmluZCB0aGUgbmV4dCBlc2NhcGUgc2VxdWVuY2Ugb3IgZW5kIG9mIHZhbGlkIFVURi04XG4gICAgICAgIGNvbnN0IGNodW5rU3RhcnQgPSBwb3M7XG4gICAgICAgIHdoaWxlIChwb3MgPCBidWZmZXIubGVuZ3RoICYmIGJ1ZmZlcltwb3NdICE9PSAweDFiKSB7XG4gICAgICAgICAgcG9zKys7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB0ZXh0Q2h1bmsgPSBidWZmZXIuc3ViYXJyYXkoY2h1bmtTdGFydCwgcG9zKTtcblxuICAgICAgICAvLyBIYW5kbGUgVVRGLTggdmFsaWRhdGlvbiBmb3IgdGV4dCBjaHVua3NcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB2YWxpZFRleHQgPSB0ZXh0Q2h1bmsudG9TdHJpbmcoJ3V0ZjgnKTtcbiAgICAgICAgICByZXN1bHQgKz0gdmFsaWRUZXh0O1xuICAgICAgICB9IGNhdGNoIChfZSkge1xuICAgICAgICAgIC8vIFRyeSB0byBmaW5kIGhvdyBtdWNoIGlzIHZhbGlkIFVURi04XG4gICAgICAgICAgY29uc3QgeyB2YWxpZERhdGEsIGludmFsaWRTdGFydCB9ID0gdGhpcy5maW5kVmFsaWRVdGY4KHRleHRDaHVuayk7XG5cbiAgICAgICAgICBpZiAodmFsaWREYXRhLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHJlc3VsdCArPSB2YWxpZERhdGEudG9TdHJpbmcoJ3V0ZjgnKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIGluY29tcGxldGUgVVRGLTggYXQgdGhlIGVuZFxuICAgICAgICAgIGlmIChpbnZhbGlkU3RhcnQgPCB0ZXh0Q2h1bmsubGVuZ3RoICYmIHBvcyA+PSBidWZmZXIubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb25zdCByZW1haW5pbmcgPSBidWZmZXIuc3ViYXJyYXkoY2h1bmtTdGFydCArIGludmFsaWRTdGFydCk7XG5cbiAgICAgICAgICAgIC8vIElmIGl0IG1pZ2h0IGJlIGluY29tcGxldGUgVVRGLTggYXQgYnVmZmVyIGVuZCwgc2F2ZSBpdFxuICAgICAgICAgICAgaWYgKHJlbWFpbmluZy5sZW5ndGggPD0gNCAmJiB0aGlzLm1pZ2h0QmVJbmNvbXBsZXRlVXRmOChyZW1haW5pbmcpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcHJvY2Vzc2VkRGF0YTogcmVzdWx0LFxuICAgICAgICAgICAgICAgIHJlbWFpbmluZ0J1ZmZlcjogcmVtYWluaW5nLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEludmFsaWQgVVRGLTggaW4gbWlkZGxlIG9yIGNvbXBsZXRlIGludmFsaWQgc2VxdWVuY2VcbiAgICAgICAgICAvLyBVc2UgbG9zc3kgY29udmVyc2lvbiBmb3IgdGhpcyBwYXJ0XG4gICAgICAgICAgY29uc3QgaW52YWxpZFBhcnQgPSB0ZXh0Q2h1bmsuc3ViYXJyYXkoaW52YWxpZFN0YXJ0KTtcbiAgICAgICAgICByZXN1bHQgKz0gaW52YWxpZFBhcnQudG9TdHJpbmcoJ2xhdGluMScpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcHJvY2Vzc2VkRGF0YTogcmVzdWx0LCByZW1haW5pbmdCdWZmZXI6IEJ1ZmZlci5hbGxvYygwKSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmQgdGhlIGVuZCBvZiBhbiBBTlNJIGVzY2FwZSBzZXF1ZW5jZVxuICAgKi9cbiAgcHJpdmF0ZSBmaW5kRXNjYXBlU2VxdWVuY2VFbmQoYnVmZmVyOiBCdWZmZXIpOiBudW1iZXIgfCBudWxsIHtcbiAgICBpZiAoYnVmZmVyLmxlbmd0aCA9PT0gMCB8fCBidWZmZXJbMF0gIT09IDB4MWIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmIChidWZmZXIubGVuZ3RoIDwgMikge1xuICAgICAgcmV0dXJuIG51bGw7IC8vIEluY29tcGxldGUgLSBuZWVkIG1vcmUgZGF0YVxuICAgIH1cblxuICAgIHN3aXRjaCAoYnVmZmVyWzFdKSB7XG4gICAgICAvLyBDU0kgc2VxdWVuY2VzOiBFU0MgWyAuLi4gZmluYWxfY2hhclxuICAgICAgY2FzZSAweDViOiB7XG4gICAgICAgIC8vICdbJ1xuICAgICAgICBsZXQgcG9zID0gMjtcbiAgICAgICAgLy8gU2tpcCBwYXJhbWV0ZXIgYW5kIGludGVybWVkaWF0ZSBjaGFyYWN0ZXJzXG4gICAgICAgIHdoaWxlIChwb3MgPCBidWZmZXIubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgYnl0ZSA9IGJ1ZmZlcltwb3NdO1xuICAgICAgICAgIGlmIChieXRlID49IDB4MjAgJiYgYnl0ZSA8PSAweDNmKSB7XG4gICAgICAgICAgICAvLyBQYXJhbWV0ZXIgY2hhcmFjdGVycyAwLTkgOiA7IDwgPSA+ID8gYW5kIEludGVybWVkaWF0ZSBjaGFyYWN0ZXJzXG4gICAgICAgICAgICBwb3MrKztcbiAgICAgICAgICB9IGVsc2UgaWYgKGJ5dGUgPj0gMHg0MCAmJiBieXRlIDw9IDB4N2UpIHtcbiAgICAgICAgICAgIC8vIEZpbmFsIGNoYXJhY3RlciBAIEEtWiBbIFxcIF0gXiBfIGAgYS16IHsgfCB9IH5cbiAgICAgICAgICAgIHJldHVybiBwb3MgKyAxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBJbnZhbGlkIHNlcXVlbmNlLCBzdG9wIGhlcmVcbiAgICAgICAgICAgIHJldHVybiBwb3M7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsOyAvLyBJbmNvbXBsZXRlIHNlcXVlbmNlXG4gICAgICB9XG5cbiAgICAgIC8vIE9TQyBzZXF1ZW5jZXM6IEVTQyBdIC4uLiAoU1Qgb3IgQkVMKVxuICAgICAgY2FzZSAweDVkOiB7XG4gICAgICAgIC8vICddJ1xuICAgICAgICBsZXQgcG9zID0gMjtcbiAgICAgICAgd2hpbGUgKHBvcyA8IGJ1ZmZlci5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBieXRlID0gYnVmZmVyW3Bvc107XG4gICAgICAgICAgaWYgKGJ5dGUgPT09IDB4MDcpIHtcbiAgICAgICAgICAgIC8vIEJFTCB0ZXJtaW5hdG9yXG4gICAgICAgICAgICByZXR1cm4gcG9zICsgMTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGJ5dGUgPT09IDB4MWIgJiYgcG9zICsgMSA8IGJ1ZmZlci5sZW5ndGggJiYgYnVmZmVyW3BvcyArIDFdID09PSAweDVjKSB7XG4gICAgICAgICAgICAvLyBFU0MgXFwgKFNUKSB0ZXJtaW5hdG9yXG4gICAgICAgICAgICByZXR1cm4gcG9zICsgMjtcbiAgICAgICAgICB9XG4gICAgICAgICAgcG9zKys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7IC8vIEluY29tcGxldGUgc2VxdWVuY2VcbiAgICAgIH1cblxuICAgICAgLy8gU2ltcGxlIHR3by1jaGFyYWN0ZXIgc2VxdWVuY2VzOiBFU0MgbGV0dGVyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gMjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRmluZCB2YWxpZCBVVEYtOCBwb3J0aW9uIG9mIGEgYnVmZmVyXG4gICAqL1xuICBwcml2YXRlIGZpbmRWYWxpZFV0ZjgoYnVmZmVyOiBCdWZmZXIpOiB7IHZhbGlkRGF0YTogQnVmZmVyOyBpbnZhbGlkU3RhcnQ6IG51bWJlciB9IHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdGVzdFNsaWNlID0gYnVmZmVyLnN1YmFycmF5KDAsIGkgKyAxKTtcbiAgICAgICAgdGVzdFNsaWNlLnRvU3RyaW5nKCd1dGY4Jyk7XG4gICAgICB9IGNhdGNoIChfZSkge1xuICAgICAgICAvLyBGb3VuZCBpbnZhbGlkIFVURi04LCByZXR1cm4gdmFsaWQgcG9ydGlvblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHZhbGlkRGF0YTogYnVmZmVyLnN1YmFycmF5KDAsIGkpLFxuICAgICAgICAgIGludmFsaWRTdGFydDogaSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBBbGwgdmFsaWRcbiAgICByZXR1cm4ge1xuICAgICAgdmFsaWREYXRhOiBidWZmZXIsXG4gICAgICBpbnZhbGlkU3RhcnQ6IGJ1ZmZlci5sZW5ndGgsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBhIGJ1ZmZlciBtaWdodCBjb250YWluIGluY29tcGxldGUgVVRGLTggc2VxdWVuY2VcbiAgICovXG4gIHByaXZhdGUgbWlnaHRCZUluY29tcGxldGVVdGY4KGJ1ZmZlcjogQnVmZmVyKTogYm9vbGVhbiB7XG4gICAgaWYgKGJ1ZmZlci5sZW5ndGggPT09IDApIHJldHVybiBmYWxzZTtcblxuICAgIC8vIENoZWNrIGlmIGZpcnN0IGJ5dGUgaW5kaWNhdGVzIG11bHRpLWJ5dGUgVVRGLTggY2hhcmFjdGVyXG4gICAgY29uc3QgZmlyc3RCeXRlID0gYnVmZmVyWzBdO1xuXG4gICAgLy8gU2luZ2xlIGJ5dGUgKEFTQ0lJKSAtIG5vdCBpbmNvbXBsZXRlXG4gICAgaWYgKGZpcnN0Qnl0ZSA8IDB4ODApIHJldHVybiBmYWxzZTtcblxuICAgIC8vIE11bHRpLWJ5dGUgc2VxdWVuY2Ugc3RhcnRlcnNcbiAgICBpZiAoZmlyc3RCeXRlID49IDB4YzApIHtcbiAgICAgIC8vIDItYnl0ZSBzZXF1ZW5jZSBuZWVkcyAyIGJ5dGVzXG4gICAgICBpZiAoZmlyc3RCeXRlIDwgMHhlMCkgcmV0dXJuIGJ1ZmZlci5sZW5ndGggPCAyO1xuICAgICAgLy8gMy1ieXRlIHNlcXVlbmNlIG5lZWRzIDMgYnl0ZXNcbiAgICAgIGlmIChmaXJzdEJ5dGUgPCAweGYwKSByZXR1cm4gYnVmZmVyLmxlbmd0aCA8IDM7XG4gICAgICAvLyA0LWJ5dGUgc2VxdWVuY2UgbmVlZHMgNCBieXRlc1xuICAgICAgaWYgKGZpcnN0Qnl0ZSA8IDB4ZjgpIHJldHVybiBidWZmZXIubGVuZ3RoIDwgNDtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGVsYXBzZWQgdGltZSBzaW5jZSBzdGFydCBpbiBzZWNvbmRzXG4gICAqL1xuICBwcml2YXRlIGdldEVsYXBzZWRUaW1lKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIChEYXRlLm5vdygpIC0gdGhpcy5zdGFydFRpbWUuZ2V0VGltZSgpKSAvIDEwMDA7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGUgdGhhdCBvdXIgdHJhY2tlZCBwb3NpdGlvbiBtYXRjaGVzIHRoZSBhY3R1YWwgZmlsZSBzaXplXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHZhbGlkYXRlRmlsZVBvc2l0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQodGhpcy5maWxlUGF0aCk7XG4gICAgICBjb25zdCBhY3R1YWxTaXplID0gc3RhdHMuc2l6ZTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkU2l6ZSA9IHRoaXMuYnl0ZXNXcml0dGVuO1xuXG4gICAgICBpZiAoYWN0dWFsU2l6ZSAhPT0gZXhwZWN0ZWRTaXplKSB7XG4gICAgICAgIHRoaXMudmFsaWRhdGlvbkVycm9ycysrO1xuICAgICAgICBfbG9nZ2VyLmVycm9yKFxuICAgICAgICAgIGBBc2NpaW5lbWFXcml0ZXIgcG9zaXRpb24gbWlzbWF0Y2ghIGAgK1xuICAgICAgICAgICAgYEV4cGVjdGVkOiAke2V4cGVjdGVkU2l6ZX0gYnl0ZXMsIEFjdHVhbDogJHthY3R1YWxTaXplfSBieXRlcywgYCArXG4gICAgICAgICAgICBgRGlmZmVyZW5jZTogJHthY3R1YWxTaXplIC0gZXhwZWN0ZWRTaXplfSBieXRlcywgYCArXG4gICAgICAgICAgICBgVmFsaWRhdGlvbiBlcnJvcnM6ICR7dGhpcy52YWxpZGF0aW9uRXJyb3JzfWBcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBJZiB0aGUgZGlmZmVyZW5jZSBpcyBzaWduaWZpY2FudCwgdGhpcyBpcyBhIGNyaXRpY2FsIGVycm9yXG4gICAgICAgIGlmIChNYXRoLmFicyhhY3R1YWxTaXplIC0gZXhwZWN0ZWRTaXplKSA+IDEwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQdHlFcnJvcihcbiAgICAgICAgICAgIGBDcml0aWNhbCBieXRlIHBvc2l0aW9uIHRyYWNraW5nIGVycm9yOiBleHBlY3RlZCAke2V4cGVjdGVkU2l6ZX0sIGFjdHVhbCAke2FjdHVhbFNpemV9YCxcbiAgICAgICAgICAgICdQT1NJVElPTl9NSVNNQVRDSCdcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBfbG9nZ2VyLmRlYnVnKGBQb3NpdGlvbiB2YWxpZGF0aW9uIHBhc3NlZDogJHthY3R1YWxTaXplfSBieXRlc2ApO1xuICAgICAgfVxuXG4gICAgICB0aGlzLmxhc3RWYWxpZGF0ZWRQb3NpdGlvbiA9IHRoaXMuYnl0ZXNXcml0dGVuO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQdHlFcnJvcikge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIF9sb2dnZXIuZXJyb3IoYEZhaWxlZCB0byB2YWxpZGF0ZSBmaWxlIHBvc2l0aW9uOmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xvc2UgdGhlIHdyaXRlciBhbmQgZmluYWxpemUgdGhlIGZpbGVcbiAgICovXG4gIGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIEZsdXNoIGFueSByZW1haW5pbmcgVVRGLTggYnVmZmVyIHRocm91Z2ggdGhlIHF1ZXVlXG4gICAgaWYgKHRoaXMudXRmOEJ1ZmZlci5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBGb3JjZSB3cml0ZSBhbnkgcmVtYWluaW5nIGRhdGEgdXNpbmcgbG9zc3kgY29udmVyc2lvblxuICAgICAgY29uc3QgdGltZSA9IHRoaXMuZ2V0RWxhcHNlZFRpbWUoKTtcbiAgICAgIGNvbnN0IGV2ZW50OiBBc2NpaW5lbWFFdmVudCA9IHtcbiAgICAgICAgdGltZSxcbiAgICAgICAgdHlwZTogJ28nLFxuICAgICAgICBkYXRhOiB0aGlzLnV0ZjhCdWZmZXIudG9TdHJpbmcoJ2xhdGluMScpLFxuICAgICAgfTtcbiAgICAgIC8vIFVzZSB0aGUgcXVldWUgdG8gZW5zdXJlIG9yZGVyaW5nXG4gICAgICB0aGlzLndyaXRlUXVldWUuZW5xdWV1ZShhc3luYyAoKSA9PiB7XG4gICAgICAgIGF3YWl0IHRoaXMud3JpdGVFdmVudChldmVudCk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMudXRmOEJ1ZmZlciA9IEJ1ZmZlci5hbGxvYygwKTtcbiAgICB9XG5cbiAgICAvLyBXYWl0IGZvciBhbGwgcXVldWVkIHdyaXRlcyB0byBjb21wbGV0ZVxuICAgIGF3YWl0IHRoaXMud3JpdGVRdWV1ZS5kcmFpbigpO1xuXG4gICAgLy8gTm93IGl0J3Mgc2FmZSB0byBlbmQgdGhlIHN0cmVhbVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLndyaXRlU3RyZWFtLmVuZCgoZXJyb3I/OiBFcnJvcikgPT4ge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICByZWplY3QobmV3IFB0eUVycm9yKGBGYWlsZWQgdG8gY2xvc2UgYXNjaWluZW1hIHdyaXRlcjogJHtlcnJvci5tZXNzYWdlfWApKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIHRoZSB3cml0ZXIgaXMgc3RpbGwgb3BlblxuICAgKi9cbiAgaXNPcGVuKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhdGhpcy53cml0ZVN0cmVhbS5kZXN0cm95ZWQ7XG4gIH1cbn1cbiJdfQ==