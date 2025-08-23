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
/**
 * Comprehensive list of ANSI sequences that warrant pruning.
 * These sequences indicate the terminal has been cleared or reset,
 * making previous content unnecessary for playback.
 */
export declare const PRUNE_SEQUENCES: readonly ["\u001B[3J", "\u001Bc", "\u001B[2J", "\u001B[H\u001B[J", "\u001B[H\u001B[2J", "\u001B[?1049h", "\u001B[?1049l", "\u001B[?47h", "\u001B[?47l"];
/**
 * Result of pruning sequence detection
 */
export interface PruningDetectionResult {
    sequence: string;
    index: number;
}
/**
 * Detect the last pruning sequence in raw terminal data.
 *
 * @param data - Raw terminal output data
 * @returns Detection result with sequence and index, or null if not found
 */
export declare function detectLastPruningSequence(data: string): PruningDetectionResult | null;
/**
 * Check if data contains any pruning sequence.
 *
 * @param data - Terminal data to check
 * @returns true if any pruning sequence is found
 */
export declare function containsPruningSequence(data: string): boolean;
/**
 * Find the position of the last pruning sequence and where it ends.
 *
 * @param data - Terminal data to search
 * @returns Object with sequence and end position, or null if not found
 */
export declare function findLastPrunePoint(data: string): {
    sequence: string;
    position: number;
} | null;
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
export declare function calculateSequenceBytePosition(eventStartPos: number, timestamp: number, fullData: string, sequenceIndex: number, sequenceLength: number): number;
/**
 * Parse an asciinema event line and check for pruning sequences.
 *
 * @param line - JSON line from asciinema file
 * @returns Detection result with additional metadata, or null
 */
export declare function checkAsciinemaEventForPruning(line: string): {
    sequence: string;
    dataIndex: number;
    timestamp: number;
    eventType: string;
} | null;
/**
 * Calculate the byte position of a pruning sequence found in an asciinema file.
 * This is used when scanning existing files to find exact positions.
 *
 * @param fileOffset - Current byte offset in the file
 * @param eventLine - The full JSON line containing the event
 * @param sequenceEndIndex - Character index where the sequence ends in the data
 * @returns Exact byte position where the sequence ends
 */
export declare function calculatePruningPositionInFile(fileOffset: number, eventLine: string, sequenceEndIndex: number): number;
/**
 * Log detection of a pruning sequence in a consistent format.
 *
 * @param sequence - The detected sequence
 * @param position - Byte position in the file
 * @param context - Additional context for the log
 */
export declare function logPruningDetection(sequence: string, position: number, context?: string): void;
/**
 * Get a human-readable name for a pruning sequence.
 *
 * @param sequence - The pruning sequence
 * @returns Description of what the sequence does
 */
export declare function getSequenceDescription(sequence: string): string;
