"use strict";
/**
 * Pruning Detector - Unified detection of terminal pruning sequences
 *
 * This module provides a single source of truth for detecting terminal sequences
 * that indicate the terminal buffer should be pruned (cleared). It's used by both:
 * - AsciinemaWriter: Real-time detection during recording
 * - StreamWatcher: Retroactive detection during playback
 *
 * Pruning helps prevent session files from growing indefinitely by identifying
 * points where old terminal content can be safely discarded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRUNE_SEQUENCES = void 0;
exports.detectLastPruningSequence = detectLastPruningSequence;
exports.containsPruningSequence = containsPruningSequence;
exports.findLastPrunePoint = findLastPrunePoint;
exports.calculateSequenceBytePosition = calculateSequenceBytePosition;
exports.checkAsciinemaEventForPruning = checkAsciinemaEventForPruning;
exports.calculatePruningPositionInFile = calculatePruningPositionInFile;
exports.logPruningDetection = logPruningDetection;
exports.getSequenceDescription = getSequenceDescription;
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('PruningDetector');
/**
 * Comprehensive list of ANSI sequences that warrant pruning.
 * These sequences indicate the terminal has been cleared or reset,
 * making previous content unnecessary for playback.
 */
exports.PRUNE_SEQUENCES = [
    '\x1b[3J', // Clear scrollback buffer (xterm) - most common
    '\x1bc', // RIS - Full terminal reset
    '\x1b[2J', // Clear screen (common)
    '\x1b[H\x1b[J', // Home cursor + clear (older pattern)
    '\x1b[H\x1b[2J', // Home cursor + clear screen variant
    '\x1b[?1049h', // Enter alternate screen (vim, less, etc)
    '\x1b[?1049l', // Exit alternate screen
    '\x1b[?47h', // Save screen and enter alternate screen (older)
    '\x1b[?47l', // Restore screen and exit alternate screen (older)
];
/**
 * Detect the last pruning sequence in raw terminal data.
 *
 * @param data - Raw terminal output data
 * @returns Detection result with sequence and index, or null if not found
 */
function detectLastPruningSequence(data) {
    let lastIndex = -1;
    let lastSequence = '';
    for (const sequence of exports.PRUNE_SEQUENCES) {
        const index = data.lastIndexOf(sequence);
        if (index > lastIndex) {
            lastIndex = index;
            lastSequence = sequence;
        }
    }
    if (lastIndex === -1) {
        return null;
    }
    return {
        sequence: lastSequence,
        index: lastIndex,
    };
}
/**
 * Check if data contains any pruning sequence.
 *
 * @param data - Terminal data to check
 * @returns true if any pruning sequence is found
 */
function containsPruningSequence(data) {
    return exports.PRUNE_SEQUENCES.some((sequence) => data.includes(sequence));
}
/**
 * Find the position of the last pruning sequence and where it ends.
 *
 * @param data - Terminal data to search
 * @returns Object with sequence and end position, or null if not found
 */
function findLastPrunePoint(data) {
    const result = detectLastPruningSequence(data);
    if (!result) {
        return null;
    }
    return {
        sequence: result.sequence,
        position: result.index + result.sequence.length,
    };
}
/**
 * Calculate the exact byte position of a sequence within an asciinema event.
 * This accounts for JSON encoding and the event format: [timestamp, "o", "data"]
 *
 * @param eventStartPos - Byte position where the event starts in the file
 * @param timestamp - Event timestamp
 * @param fullData - Complete data string that will be written
 * @param sequenceIndex - Character index of the sequence in the data
 * @param sequenceLength - Length of the sequence in characters
 * @returns Exact byte position where the sequence ends in the file
 */
function calculateSequenceBytePosition(eventStartPos, timestamp, fullData, sequenceIndex, sequenceLength) {
    // Calculate the data up to where the sequence ends
    const dataUpToSequenceEnd = fullData.substring(0, sequenceIndex + sequenceLength);
    // Create the event array prefix: [timestamp,"o","
    const eventPrefix = JSON.stringify([timestamp, 'o', '']).slice(0, -1); // Remove trailing quote
    const prefixBytes = Buffer.from(eventPrefix, 'utf8').length;
    // Calculate bytes for the data portion up to sequence end
    const sequenceBytesInData = Buffer.from(dataUpToSequenceEnd, 'utf8').length;
    // Total position is: event start + prefix bytes + data bytes
    return eventStartPos + prefixBytes + sequenceBytesInData;
}
/**
 * Parse an asciinema event line and check for pruning sequences.
 *
 * @param line - JSON line from asciinema file
 * @returns Detection result with additional metadata, or null
 */
function checkAsciinemaEventForPruning(line) {
    try {
        const parsed = JSON.parse(line);
        // Check if it's a valid event array
        if (!Array.isArray(parsed) || parsed.length < 3) {
            return null;
        }
        const [timestamp, eventType, data] = parsed;
        // Only check output events
        if (eventType !== 'o' || typeof data !== 'string') {
            return null;
        }
        // Check for pruning sequences
        const result = detectLastPruningSequence(data);
        if (!result) {
            return null;
        }
        return {
            sequence: result.sequence,
            dataIndex: result.index,
            timestamp,
            eventType,
        };
    }
    catch (error) {
        // Invalid JSON or parsing error
        logger.debug(`Failed to parse asciinema line: ${error}`);
        return null;
    }
}
/**
 * Calculate the byte position of a pruning sequence found in an asciinema file.
 * This is used when scanning existing files to find exact positions.
 *
 * @param fileOffset - Current byte offset in the file
 * @param eventLine - The full JSON line containing the event
 * @param sequenceEndIndex - Character index where the sequence ends in the data
 * @returns Exact byte position where the sequence ends
 */
function calculatePruningPositionInFile(fileOffset, eventLine, sequenceEndIndex) {
    // The fileOffset is at the end of this line
    // We need to find where within the line the sequence ends
    // Parse the event to get the data
    const event = JSON.parse(eventLine);
    const data = event[2];
    // Find where the data portion starts in the JSON string
    // This is after: [timestamp,"o","
    const jsonPrefix = JSON.stringify([event[0], event[1], '']).slice(0, -1);
    const prefixLength = jsonPrefix.length;
    // Calculate how many bytes from start of line to sequence end
    const dataUpToSequence = data.substring(0, sequenceEndIndex);
    const dataBytes = Buffer.from(dataUpToSequence, 'utf8').length;
    // The position is: start of line + prefix + data bytes
    const lineStart = fileOffset - Buffer.from(`${eventLine}\n`, 'utf8').length;
    return lineStart + prefixLength + dataBytes;
}
/**
 * Log detection of a pruning sequence in a consistent format.
 *
 * @param sequence - The detected sequence
 * @param position - Byte position in the file
 * @param context - Additional context for the log
 */
function logPruningDetection(sequence, position, context = '') {
    const escapedSequence = sequence.split('\x1b').join('\\x1b');
    logger.debug(`Detected pruning sequence '${escapedSequence}' at byte position ${position}` +
        (context ? ` ${context}` : ''));
}
/**
 * Get a human-readable name for a pruning sequence.
 *
 * @param sequence - The pruning sequence
 * @returns Description of what the sequence does
 */
function getSequenceDescription(sequence) {
    switch (sequence) {
        case '\x1b[3J':
            return 'Clear scrollback buffer';
        case '\x1bc':
            return 'Terminal reset (RIS)';
        case '\x1b[2J':
            return 'Clear screen';
        case '\x1b[H\x1b[J':
            return 'Home cursor + clear';
        case '\x1b[H\x1b[2J':
            return 'Home cursor + clear screen';
        case '\x1b[?1049h':
            return 'Enter alternate screen';
        case '\x1b[?1049l':
            return 'Exit alternate screen';
        case '\x1b[?47h':
            return 'Save screen (legacy)';
        case '\x1b[?47l':
            return 'Restore screen (legacy)';
        default:
            return 'Unknown sequence';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJ1bmluZy1kZXRlY3Rvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvdXRpbHMvcHJ1bmluZy1kZXRlY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7R0FVRzs7O0FBcUNILDhEQW9CQztBQVFELDBEQUVDO0FBUUQsZ0RBVUM7QUFhRCxzRUFtQkM7QUFRRCxzRUFzQ0M7QUFXRCx3RUF3QkM7QUFTRCxrREFVQztBQVFELHdEQXVCQztBQXRQRCwyQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFL0M7Ozs7R0FJRztBQUNVLFFBQUEsZUFBZSxHQUFHO0lBQzdCLFNBQVMsRUFBRSxnREFBZ0Q7SUFDM0QsT0FBTyxFQUFFLDRCQUE0QjtJQUNyQyxTQUFTLEVBQUUsd0JBQXdCO0lBQ25DLGNBQWMsRUFBRSxzQ0FBc0M7SUFDdEQsZUFBZSxFQUFFLHFDQUFxQztJQUN0RCxhQUFhLEVBQUUsMENBQTBDO0lBQ3pELGFBQWEsRUFBRSx3QkFBd0I7SUFDdkMsV0FBVyxFQUFFLGlEQUFpRDtJQUM5RCxXQUFXLEVBQUUsbURBQW1EO0NBQ3hELENBQUM7QUFVWDs7Ozs7R0FLRztBQUNILFNBQWdCLHlCQUF5QixDQUFDLElBQVk7SUFDcEQsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDbkIsSUFBSSxZQUFZLEdBQUcsRUFBRSxDQUFDO0lBRXRCLEtBQUssTUFBTSxRQUFRLElBQUksdUJBQWUsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsSUFBSSxLQUFLLEdBQUcsU0FBUyxFQUFFLENBQUM7WUFDdEIsU0FBUyxHQUFHLEtBQUssQ0FBQztZQUNsQixZQUFZLEdBQUcsUUFBUSxDQUFDO1FBQzFCLENBQUM7SUFDSCxDQUFDO0lBRUQsSUFB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QyxRQUFnQixFQUNoQixRQUFnQixFQUNoQixVQUFrQixFQUFFO0lBRXBCLE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzdELE1BQU0sQ0FBQyxLQUFLLENBQ1YsOEJBQThCLGVBQWUsc0JBQXNCLFFBQVEsRUFBRTtRQUMzRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQ2pDLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQixzQkFBc0IsQ0FBQyxRQUFnQjtJQUNyRCxRQUFRLFFBQVEsRUFBRSxDQUFDO1FBQ2pCLEtBQUssU0FBUztZQUNaLE9BQU8seUJBQXlCLENBQUM7UUFDbkMsS0FBSyxPQUFPO1lBQ1YsT0FBTyxzQkFBc0IsQ0FBQztRQUNoQyxLQUFLLFNBQVM7WUFDWixPQUFPLGNBQWMsQ0FBQztRQUN4QixLQUFLLGNBQWM7WUFDakIsT0FBTyxxQkFBcUIsQ0FBQztRQUMvQixLQUFLLGVBQWU7WUFDbEIsT0FBTyw0QkFBNEIsQ0FBQztRQUN0QyxLQUFLLGFBQWE7WUFDaEIsT0FBTyx3QkFBd0IsQ0FBQztRQUNsQyxLQUFLLGFBQWE7WUFDaEIsT0FBTyx1QkFBdUIsQ0FBQztRQUNqQyxLQUFLLFdBQVc7WUFDZCxPQUFPLHNCQUFzQixDQUFDO1FBQ2hDLEtBQUssV0FBVztZQUNkLE9BQU8seUJBQXlCLENBQUM7UUFDbkM7WUFDRSxPQUFPLGtCQUFrQixDQUFDO0lBQzlCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQcnVuaW5nIERldGVjdG9yIC0gVW5pZmllZCBkZXRlY3Rpb24gb2YgdGVybWluYWwgcHJ1bmluZyBzZXF1ZW5jZXNcbiAqXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyBhIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIGRldGVjdGluZyB0ZXJtaW5hbCBzZXF1ZW5jZXNcbiAqIHRoYXQgaW5kaWNhdGUgdGhlIHRlcm1pbmFsIGJ1ZmZlciBzaG91bGQgYmUgcHJ1bmVkIChjbGVhcmVkKS4gSXQncyB1c2VkIGJ5IGJvdGg6XG4gKiAtIEFzY2lpbmVtYVdyaXRlcjogUmVhbC10aW1lIGRldGVjdGlvbiBkdXJpbmcgcmVjb3JkaW5nXG4gKiAtIFN0cmVhbVdhdGNoZXI6IFJldHJvYWN0aXZlIGRldGVjdGlvbiBkdXJpbmcgcGxheWJhY2tcbiAqXG4gKiBQcnVuaW5nIGhlbHBzIHByZXZlbnQgc2Vzc2lvbiBmaWxlcyBmcm9tIGdyb3dpbmcgaW5kZWZpbml0ZWx5IGJ5IGlkZW50aWZ5aW5nXG4gKiBwb2ludHMgd2hlcmUgb2xkIHRlcm1pbmFsIGNvbnRlbnQgY2FuIGJlIHNhZmVseSBkaXNjYXJkZWQuXG4gKi9cblxuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ1BydW5pbmdEZXRlY3RvcicpO1xuXG4vKipcbiAqIENvbXByZWhlbnNpdmUgbGlzdCBvZiBBTlNJIHNlcXVlbmNlcyB0aGF0IHdhcnJhbnQgcHJ1bmluZy5cbiAqIFRoZXNlIHNlcXVlbmNlcyBpbmRpY2F0ZSB0aGUgdGVybWluYWwgaGFzIGJlZW4gY2xlYXJlZCBvciByZXNldCxcbiAqIG1ha2luZyBwcmV2aW91cyBjb250ZW50IHVubmVjZXNzYXJ5IGZvciBwbGF5YmFjay5cbiAqL1xuZXhwb3J0IGNvbnN0IFBSVU5FX1NFUVVFTkNFUyA9IFtcbiAgJ1xceDFiWzNKJywgLy8gQ2xlYXIgc2Nyb2xsYmFjayBidWZmZXIgKHh0ZXJtKSAtIG1vc3QgY29tbW9uXG4gICdcXHgxYmMnLCAvLyBSSVMgLSBGdWxsIHRlcm1pbmFsIHJlc2V0XG4gICdcXHgxYlsySicsIC8vIENsZWFyIHNjcmVlbiAoY29tbW9uKVxuICAnXFx4MWJbSFxceDFiW0onLCAvLyBIb21lIGN1cnNvciArIGNsZWFyIChvbGRlciBwYXR0ZXJuKVxuICAnXFx4MWJbSFxceDFiWzJKJywgLy8gSG9tZSBjdXJzb3IgKyBjbGVhciBzY3JlZW4gdmFyaWFudFxuICAnXFx4MWJbPzEwNDloJywgLy8gRW50ZXIgYWx0ZXJuYXRlIHNjcmVlbiAodmltLCBsZXNzLCBldGMpXG4gICdcXHgxYls/MTA0OWwnLCAvLyBFeGl0IGFsdGVybmF0ZSBzY3JlZW5cbiAgJ1xceDFiWz80N2gnLCAvLyBTYXZlIHNjcmVlbiBhbmQgZW50ZXIgYWx0ZXJuYXRlIHNjcmVlbiAob2xkZXIpXG4gICdcXHgxYls/NDdsJywgLy8gUmVzdG9yZSBzY3JlZW4gYW5kIGV4aXQgYWx0ZXJuYXRlIHNjcmVlbiAob2xkZXIpXG5dIGFzIGNvbnN0O1xuXG4vKipcbiAqIFJlc3VsdCBvZiBwcnVuaW5nIHNlcXVlbmNlIGRldGVjdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIFBydW5pbmdEZXRlY3Rpb25SZXN1bHQge1xuICBzZXF1ZW5jZTogc3RyaW5nO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG4vKipcbiAqIERldGVjdCB0aGUgbGFzdCBwcnVuaW5nIHNlcXVlbmNlIGluIHJhdyB0ZXJtaW5hbCBkYXRhLlxuICpcbiAqIEBwYXJhbSBkYXRhIC0gUmF3IHRlcm1pbmFsIG91dHB1dCBkYXRhXG4gKiBAcmV0dXJucyBEZXRlY3Rpb24gcmVzdWx0IHdpdGggc2VxdWVuY2UgYW5kIGluZGV4LCBvciBudWxsIGlmIG5vdCBmb3VuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0TGFzdFBydW5pbmdTZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBQcnVuaW5nRGV0ZWN0aW9uUmVzdWx0IHwgbnVsbCB7XG4gIGxldCBsYXN0SW5kZXggPSAtMTtcbiAgbGV0IGxhc3RTZXF1ZW5jZSA9ICcnO1xuXG4gIGZvciAoY29uc3Qgc2VxdWVuY2Ugb2YgUFJVTkVfU0VRVUVOQ0VTKSB7XG4gICAgY29uc3QgaW5kZXggPSBkYXRhLmxhc3RJbmRleE9mKHNlcXVlbmNlKTtcbiAgICBpZiAoaW5kZXggPiBsYXN0SW5kZXgpIHtcbiAgICAgIGxhc3RJbmRleCA9IGluZGV4O1xuICAgICAgbGFzdFNlcXVlbmNlID0gc2VxdWVuY2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKGxhc3RJbmRleCA9PT0gLTEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc2VxdWVuY2U6IGxhc3RTZXF1ZW5jZSxcbiAgICBpbmRleDogbGFzdEluZGV4LFxuICB9O1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGRhdGEgY29udGFpbnMgYW55IHBydW5pbmcgc2VxdWVuY2UuXG4gKlxuICogQHBhcmFtIGRhdGEgLSBUZXJtaW5hbCBkYXRhIHRvIGNoZWNrXG4gKiBAcmV0dXJucyB0cnVlIGlmIGFueSBwcnVuaW5nIHNlcXVlbmNlIGlzIGZvdW5kXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb250YWluc1BydW5pbmdTZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIFBSVU5FX1NFUVVFTkNFUy5zb21lKChzZXF1ZW5jZSkgPT4gZGF0YS5pbmNsdWRlcyhzZXF1ZW5jZSkpO1xufVxuXG4vKipcbiAqIEZpbmQgdGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHBydW5pbmcgc2VxdWVuY2UgYW5kIHdoZXJlIGl0IGVuZHMuXG4gKlxuICogQHBhcmFtIGRhdGEgLSBUZXJtaW5hbCBkYXRhIHRvIHNlYXJjaFxuICogQHJldHVybnMgT2JqZWN0IHdpdGggc2VxdWVuY2UgYW5kIGVuZCBwb3NpdGlvbiwgb3IgbnVsbCBpZiBub3QgZm91bmRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMYXN0UHJ1bmVQb2ludChkYXRhOiBzdHJpbmcpOiB7IHNlcXVlbmNlOiBzdHJpbmc7IHBvc2l0aW9uOiBudW1iZXIgfSB8IG51bGwge1xuICBjb25zdCByZXN1bHQgPSBkZXRlY3RMYXN0UHJ1bmluZ1NlcXVlbmNlKGRhdGEpO1xuICBpZiAoIXJlc3VsdCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzZXF1ZW5jZTogcmVzdWx0LnNlcXVlbmNlLFxuICAgIHBvc2l0aW9uOiByZXN1bHQuaW5kZXggKyByZXN1bHQuc2VxdWVuY2UubGVuZ3RoLFxuICB9O1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZSB0aGUgZXhhY3QgYnl0ZSBwb3NpdGlvbiBvZiBhIHNlcXVlbmNlIHdpdGhpbiBhbiBhc2NpaW5lbWEgZXZlbnQuXG4gKiBUaGlzIGFjY291bnRzIGZvciBKU09OIGVuY29kaW5nIGFuZCB0aGUgZXZlbnQgZm9ybWF0OiBbdGltZXN0YW1wLCBcIm9cIiwgXCJkYXRhXCJdXG4gKlxuICogQHBhcmFtIGV2ZW50U3RhcnRQb3MgLSBCeXRlIHBvc2l0aW9uIHdoZXJlIHRoZSBldmVudCBzdGFydHMgaW4gdGhlIGZpbGVcbiAqIEBwYXJhbSB0aW1lc3RhbXAgLSBFdmVudCB0aW1lc3RhbXBcbiAqIEBwYXJhbSBmdWxsRGF0YSAtIENvbXBsZXRlIGRhdGEgc3RyaW5nIHRoYXQgd2lsbCBiZSB3cml0dGVuXG4gKiBAcGFyYW0gc2VxdWVuY2VJbmRleCAtIENoYXJhY3RlciBpbmRleCBvZiB0aGUgc2VxdWVuY2UgaW4gdGhlIGRhdGFcbiAqIEBwYXJhbSBzZXF1ZW5jZUxlbmd0aCAtIExlbmd0aCBvZiB0aGUgc2VxdWVuY2UgaW4gY2hhcmFjdGVyc1xuICogQHJldHVybnMgRXhhY3QgYnl0ZSBwb3NpdGlvbiB3aGVyZSB0aGUgc2VxdWVuY2UgZW5kcyBpbiB0aGUgZmlsZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2FsY3VsYXRlU2VxdWVuY2VCeXRlUG9zaXRpb24oXG4gIGV2ZW50U3RhcnRQb3M6IG51bWJlcixcbiAgdGltZXN0YW1wOiBudW1iZXIsXG4gIGZ1bGxEYXRhOiBzdHJpbmcsXG4gIHNlcXVlbmNlSW5kZXg6IG51bWJlcixcbiAgc2VxdWVuY2VMZW5ndGg6IG51bWJlclxuKTogbnVtYmVyIHtcbiAgLy8gQ2FsY3VsYXRlIHRoZSBkYXRhIHVwIHRvIHdoZXJlIHRoZSBzZXF1ZW5jZSBlbmRzXG4gIGNvbnN0IGRhdGFVcFRvU2VxdWVuY2VFbmQgPSBmdWxsRGF0YS5zdWJzdHJpbmcoMCwgc2VxdWVuY2VJbmRleCArIHNlcXVlbmNlTGVuZ3RoKTtcblxuICAvLyBDcmVhdGUgdGhlIGV2ZW50IGFycmF5IHByZWZpeDogW3RpbWVzdGFtcCxcIm9cIixcIlxuICBjb25zdCBldmVudFByZWZpeCA9IEpTT04uc3RyaW5naWZ5KFt0aW1lc3RhbXAsICdvJywgJyddKS5zbGljZSgwLCAtMSk7IC8vIFJlbW92ZSB0cmFpbGluZyBxdW90ZVxuICBjb25zdCBwcmVmaXhCeXRlcyA9IEJ1ZmZlci5mcm9tKGV2ZW50UHJlZml4LCAndXRmOCcpLmxlbmd0aDtcblxuICAvLyBDYWxjdWxhdGUgYnl0ZXMgZm9yIHRoZSBkYXRhIHBvcnRpb24gdXAgdG8gc2VxdWVuY2UgZW5kXG4gIGNvbnN0IHNlcXVlbmNlQnl0ZXNJbkRhdGEgPSBCdWZmZXIuZnJvbShkYXRhVXBUb1NlcXVlbmNlRW5kLCAndXRmOCcpLmxlbmd0aDtcblxuICAvLyBUb3RhbCBwb3NpdGlvbiBpczogZXZlbnQgc3RhcnQgKyBwcmVmaXggYnl0ZXMgKyBkYXRhIGJ5dGVzXG4gIHJldHVybiBldmVudFN0YXJ0UG9zICsgcHJlZml4Qnl0ZXMgKyBzZXF1ZW5jZUJ5dGVzSW5EYXRhO1xufVxuXG4vKipcbiAqIFBhcnNlIGFuIGFzY2lpbmVtYSBldmVudCBsaW5lIGFuZCBjaGVjayBmb3IgcHJ1bmluZyBzZXF1ZW5jZXMuXG4gKlxuICogQHBhcmFtIGxpbmUgLSBKU09OIGxpbmUgZnJvbSBhc2NpaW5lbWEgZmlsZVxuICogQHJldHVybnMgRGV0ZWN0aW9uIHJlc3VsdCB3aXRoIGFkZGl0aW9uYWwgbWV0YWRhdGEsIG9yIG51bGxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrQXNjaWluZW1hRXZlbnRGb3JQcnVuaW5nKGxpbmU6IHN0cmluZyk6IHtcbiAgc2VxdWVuY2U6IHN0cmluZztcbiAgZGF0YUluZGV4OiBudW1iZXI7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICBldmVudFR5cGU6IHN0cmluZztcbn0gfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGxpbmUpO1xuXG4gICAgLy8gQ2hlY2sgaWYgaXQncyBhIHZhbGlkIGV2ZW50IGFycmF5XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkgfHwgcGFyc2VkLmxlbmd0aCA8IDMpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IFt0aW1lc3RhbXAsIGV2ZW50VHlwZSwgZGF0YV0gPSBwYXJzZWQ7XG5cbiAgICAvLyBPbmx5IGNoZWNrIG91dHB1dCBldmVudHNcbiAgICBpZiAoZXZlbnRUeXBlICE9PSAnbycgfHwgdHlwZW9mIGRhdGEgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmb3IgcHJ1bmluZyBzZXF1ZW5jZXNcbiAgICBjb25zdCByZXN1bHQgPSBkZXRlY3RMYXN0UHJ1bmluZ1NlcXVlbmNlKGRhdGEpO1xuICAgIGlmICghcmVzdWx0KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc2VxdWVuY2U6IHJlc3VsdC5zZXF1ZW5jZSxcbiAgICAgIGRhdGFJbmRleDogcmVzdWx0LmluZGV4LFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgZXZlbnRUeXBlLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSW52YWxpZCBKU09OIG9yIHBhcnNpbmcgZXJyb3JcbiAgICBsb2dnZXIuZGVidWcoYEZhaWxlZCB0byBwYXJzZSBhc2NpaW5lbWEgbGluZTogJHtlcnJvcn1gKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vKipcbiAqIENhbGN1bGF0ZSB0aGUgYnl0ZSBwb3NpdGlvbiBvZiBhIHBydW5pbmcgc2VxdWVuY2UgZm91bmQgaW4gYW4gYXNjaWluZW1hIGZpbGUuXG4gKiBUaGlzIGlzIHVzZWQgd2hlbiBzY2FubmluZyBleGlzdGluZyBmaWxlcyB0byBmaW5kIGV4YWN0IHBvc2l0aW9ucy5cbiAqXG4gKiBAcGFyYW0gZmlsZU9mZnNldCAtIEN1cnJlbnQgYnl0ZSBvZmZzZXQgaW4gdGhlIGZpbGVcbiAqIEBwYXJhbSBldmVudExpbmUgLSBUaGUgZnVsbCBKU09OIGxpbmUgY29udGFpbmluZyB0aGUgZXZlbnRcbiAqIEBwYXJhbSBzZXF1ZW5jZUVuZEluZGV4IC0gQ2hhcmFjdGVyIGluZGV4IHdoZXJlIHRoZSBzZXF1ZW5jZSBlbmRzIGluIHRoZSBkYXRhXG4gKiBAcmV0dXJucyBFeGFjdCBieXRlIHBvc2l0aW9uIHdoZXJlIHRoZSBzZXF1ZW5jZSBlbmRzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYWxjdWxhdGVQcnVuaW5nUG9zaXRpb25JbkZpbGUoXG4gIGZpbGVPZmZzZXQ6IG51bWJlcixcbiAgZXZlbnRMaW5lOiBzdHJpbmcsXG4gIHNlcXVlbmNlRW5kSW5kZXg6IG51bWJlclxuKTogbnVtYmVyIHtcbiAgLy8gVGhlIGZpbGVPZmZzZXQgaXMgYXQgdGhlIGVuZCBvZiB0aGlzIGxpbmVcbiAgLy8gV2UgbmVlZCB0byBmaW5kIHdoZXJlIHdpdGhpbiB0aGUgbGluZSB0aGUgc2VxdWVuY2UgZW5kc1xuXG4gIC8vIFBhcnNlIHRoZSBldmVudCB0byBnZXQgdGhlIGRhdGFcbiAgY29uc3QgZXZlbnQgPSBKU09OLnBhcnNlKGV2ZW50TGluZSk7XG4gIGNvbnN0IGRhdGEgPSBldmVudFsyXTtcblxuICAvLyBGaW5kIHdoZXJlIHRoZSBkYXRhIHBvcnRpb24gc3RhcnRzIGluIHRoZSBKU09OIHN0cmluZ1xuICAvLyBUaGlzIGlzIGFmdGVyOiBbdGltZXN0YW1wLFwib1wiLFwiXG4gIGNvbnN0IGpzb25QcmVmaXggPSBKU09OLnN0cmluZ2lmeShbZXZlbnRbMF0sIGV2ZW50WzFdLCAnJ10pLnNsaWNlKDAsIC0xKTtcbiAgY29uc3QgcHJlZml4TGVuZ3RoID0ganNvblByZWZpeC5sZW5ndGg7XG5cbiAgLy8gQ2FsY3VsYXRlIGhvdyBtYW55IGJ5dGVzIGZyb20gc3RhcnQgb2YgbGluZSB0byBzZXF1ZW5jZSBlbmRcbiAgY29uc3QgZGF0YVVwVG9TZXF1ZW5jZSA9IGRhdGEuc3Vic3RyaW5nKDAsIHNlcXVlbmNlRW5kSW5kZXgpO1xuICBjb25zdCBkYXRhQnl0ZXMgPSBCdWZmZXIuZnJvbShkYXRhVXBUb1NlcXVlbmNlLCAndXRmOCcpLmxlbmd0aDtcblxuICAvLyBUaGUgcG9zaXRpb24gaXM6IHN0YXJ0IG9mIGxpbmUgKyBwcmVmaXggKyBkYXRhIGJ5dGVzXG4gIGNvbnN0IGxpbmVTdGFydCA9IGZpbGVPZmZzZXQgLSBCdWZmZXIuZnJvbShgJHtldmVudExpbmV9XFxuYCwgJ3V0ZjgnKS5sZW5ndGg7XG4gIHJldHVybiBsaW5lU3RhcnQgKyBwcmVmaXhMZW5ndGggKyBkYXRhQnl0ZXM7XG59XG5cbi8qKlxuICogTG9nIGRldGVjdGlvbiBvZiBhIHBydW5pbmcgc2VxdWVuY2UgaW4gYSBjb25zaXN0ZW50IGZvcm1hdC5cbiAqXG4gKiBAcGFyYW0gc2VxdWVuY2UgLSBUaGUgZGV0ZWN0ZWQgc2VxdWVuY2VcbiAqIEBwYXJhbSBwb3NpdGlvbiAtIEJ5dGUgcG9zaXRpb24gaW4gdGhlIGZpbGVcbiAqIEBwYXJhbSBjb250ZXh0IC0gQWRkaXRpb25hbCBjb250ZXh0IGZvciB0aGUgbG9nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2dQcnVuaW5nRGV0ZWN0aW9uKFxuICBzZXF1ZW5jZTogc3RyaW5nLFxuICBwb3NpdGlvbjogbnVtYmVyLFxuICBjb250ZXh0OiBzdHJpbmcgPSAnJ1xuKTogdm9pZCB7XG4gIGNvbnN0IGVzY2FwZWRTZXF1ZW5jZSA9IHNlcXVlbmNlLnNwbGl0KCdcXHgxYicpLmpvaW4oJ1xcXFx4MWInKTtcbiAgbG9nZ2VyLmRlYnVnKFxuICAgIGBEZXRlY3RlZCBwcnVuaW5nIHNlcXVlbmNlICcke2VzY2FwZWRTZXF1ZW5jZX0nIGF0IGJ5dGUgcG9zaXRpb24gJHtwb3NpdGlvbn1gICtcbiAgICAgIChjb250ZXh0ID8gYCAke2NvbnRleHR9YCA6ICcnKVxuICApO1xufVxuXG4vKipcbiAqIEdldCBhIGh1bWFuLXJlYWRhYmxlIG5hbWUgZm9yIGEgcHJ1bmluZyBzZXF1ZW5jZS5cbiAqXG4gKiBAcGFyYW0gc2VxdWVuY2UgLSBUaGUgcHJ1bmluZyBzZXF1ZW5jZVxuICogQHJldHVybnMgRGVzY3JpcHRpb24gb2Ygd2hhdCB0aGUgc2VxdWVuY2UgZG9lc1xuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VxdWVuY2VEZXNjcmlwdGlvbihzZXF1ZW5jZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzZXF1ZW5jZSkge1xuICAgIGNhc2UgJ1xceDFiWzNKJzpcbiAgICAgIHJldHVybiAnQ2xlYXIgc2Nyb2xsYmFjayBidWZmZXInO1xuICAgIGNhc2UgJ1xceDFiYyc6XG4gICAgICByZXR1cm4gJ1Rlcm1pbmFsIHJlc2V0IChSSVMpJztcbiAgICBjYXNlICdcXHgxYlsySic6XG4gICAgICByZXR1cm4gJ0NsZWFyIHNjcmVlbic7XG4gICAgY2FzZSAnXFx4MWJbSFxceDFiW0onOlxuICAgICAgcmV0dXJuICdIb21lIGN1cnNvciArIGNsZWFyJztcbiAgICBjYXNlICdcXHgxYltIXFx4MWJbMkonOlxuICAgICAgcmV0dXJuICdIb21lIGN1cnNvciArIGNsZWFyIHNjcmVlbic7XG4gICAgY2FzZSAnXFx4MWJbPzEwNDloJzpcbiAgICAgIHJldHVybiAnRW50ZXIgYWx0ZXJuYXRlIHNjcmVlbic7XG4gICAgY2FzZSAnXFx4MWJbPzEwNDlsJzpcbiAgICAgIHJldHVybiAnRXhpdCBhbHRlcm5hdGUgc2NyZWVuJztcbiAgICBjYXNlICdcXHgxYls/NDdoJzpcbiAgICAgIHJldHVybiAnU2F2ZSBzY3JlZW4gKGxlZ2FjeSknO1xuICAgIGNhc2UgJ1xceDFiWz80N2wnOlxuICAgICAgcmV0dXJuICdSZXN0b3JlIHNjcmVlbiAobGVnYWN5KSc7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnVW5rbm93biBzZXF1ZW5jZSc7XG4gIH1cbn1cbiJdfQ==