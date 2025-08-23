/**
 * Simple and robust filter for ANSI title sequences (OSC 0, 1, and 2)
 *
 * This filter removes terminal title sequences from the output stream without
 * attempting to parse other ANSI sequences, avoiding the complexity and bugs
 * of a full ANSI parser.
 */
/**
 * Filters ANSI terminal title sequences from output streams.
 *
 * This class provides a lightweight, stateful filter that removes terminal title
 * sequences (OSC 0, 1, and 2) from text streams while preserving all other content.
 * It's designed to handle sequences that may be split across multiple data chunks,
 * making it suitable for streaming terminal output.
 *
 * Key features:
 * - Handles split sequences across chunk boundaries
 * - Supports both BEL (\x07) and ESC \ (\x1b\\) terminators
 * - Zero-copy design with minimal performance impact
 * - No dependency on full ANSI parsing libraries
 * - Preserves all non-title ANSI sequences
 *
 * @example
 * ```typescript
 * // Create a filter instance
 * const filter = new TitleSequenceFilter();
 *
 * // Filter terminal output chunks
 * const chunk1 = 'Hello \x1b]0;My Title\x07World';
 * console.log(filter.filter(chunk1)); // "Hello World"
 *
 * // Handle split sequences
 * const chunk2 = 'Start \x1b]2;Partial';
 * const chunk3 = ' Title\x07 End';
 * console.log(filter.filter(chunk2)); // "Start "
 * console.log(filter.filter(chunk3)); // " End"
 *
 * // Works with ESC \ terminator
 * const chunk4 = '\x1b]1;Window Title\x1b\\More text';
 * console.log(filter.filter(chunk4)); // "More text"
 * ```
 */
export declare class TitleSequenceFilter {
    private buffer;
    private static readonly COMPLETE_TITLE_REGEX;
    private static readonly PARTIAL_TITLE_REGEX;
    /**
     * Filter terminal title sequences from the input data.
     * Handles sequences that may be split across multiple chunks.
     *
     * @param chunk The input data chunk to filter
     * @returns The filtered data with title sequences removed
     */
    filter(chunk: string): string;
}
