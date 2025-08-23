"use strict";
/**
 * Simple and robust filter for ANSI title sequences (OSC 0, 1, and 2)
 *
 * This filter removes terminal title sequences from the output stream without
 * attempting to parse other ANSI sequences, avoiding the complexity and bugs
 * of a full ANSI parser.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TitleSequenceFilter = void 0;
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
class TitleSequenceFilter {
    constructor() {
        this.buffer = '';
    }
    /**
     * Filter terminal title sequences from the input data.
     * Handles sequences that may be split across multiple chunks.
     *
     * @param chunk The input data chunk to filter
     * @returns The filtered data with title sequences removed
     */
    filter(chunk) {
        // Append new chunk to any leftover buffer
        this.buffer += chunk;
        // Remove all complete title sequences
        // Matches: ESC ] 0/1/2 ; <title text> BEL or ESC ] 0/1/2 ; <title text> ESC \
        const filtered = this.buffer.replace(TitleSequenceFilter.COMPLETE_TITLE_REGEX, '');
        // Check if we have a partial title sequence at the end
        // This includes sequences that might be terminated by ESC \ where the ESC is at the end
        // We need to look for:
        // - \x1b at the end (could be start of new sequence OR part of \x1b\\ terminator)
        // - \x1b] at the end
        // - \x1b][0-2] at the end
        // - \x1b][0-2]; followed by any text ending with \x1b (potential \x1b\\ terminator)
        // - \x1b][0-2]; followed by any text without terminator
        const partialMatch = filtered.match(TitleSequenceFilter.PARTIAL_TITLE_REGEX);
        if (partialMatch) {
            // Save the partial sequence for the next chunk
            this.buffer = partialMatch[0];
            // Return everything except the partial sequence
            return filtered.slice(0, -partialMatch[0].length);
        }
        // No partial sequence, clear buffer and return everything
        this.buffer = '';
        return filtered;
    }
}
exports.TitleSequenceFilter = TitleSequenceFilter;
// Compile regexes once as static properties for better performance
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
TitleSequenceFilter.COMPLETE_TITLE_REGEX = /\x1b\][0-2];[^\x07\x1b]*(?:\x07|\x1b\\)/g;
TitleSequenceFilter.PARTIAL_TITLE_REGEX = 
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control characters
/\x1b\][0-2];.*\x1b$|\x1b\][0-2];[^\x07]*$|\x1b(?:\](?:[0-2])?)?$/;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5zaS10aXRsZS1maWx0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL2Fuc2ktdGl0bGUtZmlsdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVIOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBa0NHO0FBQ0gsTUFBYSxtQkFBbUI7SUFBaEM7UUFDVSxXQUFNLEdBQUcsRUFBRSxDQUFDO0lBNkN0QixDQUFDO0lBcENDOzs7Ozs7T0FNRztJQUNILE1BQU0sQ0FBQyxLQUFhO1FBQ2xCLDBDQUEwQztRQUMxQyxJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQztRQUVyQixzQ0FBc0M7UUFDdEMsOEVBQThFO1FBQzlFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLG9CQUFvQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRW5GLHVEQUF1RDtRQUN2RCx3RkFBd0Y7UUFDeEYsdUJBQXVCO1FBQ3ZCLGtGQUFrRjtRQUNsRixxQkFBcUI7UUFDckIsMEJBQTBCO1FBQzFCLG9GQUFvRjtRQUNwRix3REFBd0Q7UUFDeEQsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTdFLElBQUksWUFBWSxFQUFFLENBQUM7WUFDakIsK0NBQStDO1lBQy9DLElBQUksQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLGdEQUFnRDtZQUNoRCxPQUFPLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BELENBQUM7UUFFRCwwREFBMEQ7UUFDMUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7UUFDakIsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQzs7QUE3Q0gsa0RBOENDO0FBM0NDLG1FQUFtRTtBQUNuRSw0R0FBNEc7QUFDcEYsd0NBQW9CLEdBQUcsMENBQTBDLEFBQTdDLENBQThDO0FBQ2xFLHVDQUFtQjtBQUN6Qyw0R0FBNEc7QUFDNUcsa0VBQWtFLEFBRnpCLENBRTBCIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBTaW1wbGUgYW5kIHJvYnVzdCBmaWx0ZXIgZm9yIEFOU0kgdGl0bGUgc2VxdWVuY2VzIChPU0MgMCwgMSwgYW5kIDIpXG4gKlxuICogVGhpcyBmaWx0ZXIgcmVtb3ZlcyB0ZXJtaW5hbCB0aXRsZSBzZXF1ZW5jZXMgZnJvbSB0aGUgb3V0cHV0IHN0cmVhbSB3aXRob3V0XG4gKiBhdHRlbXB0aW5nIHRvIHBhcnNlIG90aGVyIEFOU0kgc2VxdWVuY2VzLCBhdm9pZGluZyB0aGUgY29tcGxleGl0eSBhbmQgYnVnc1xuICogb2YgYSBmdWxsIEFOU0kgcGFyc2VyLlxuICovXG5cbi8qKlxuICogRmlsdGVycyBBTlNJIHRlcm1pbmFsIHRpdGxlIHNlcXVlbmNlcyBmcm9tIG91dHB1dCBzdHJlYW1zLlxuICpcbiAqIFRoaXMgY2xhc3MgcHJvdmlkZXMgYSBsaWdodHdlaWdodCwgc3RhdGVmdWwgZmlsdGVyIHRoYXQgcmVtb3ZlcyB0ZXJtaW5hbCB0aXRsZVxuICogc2VxdWVuY2VzIChPU0MgMCwgMSwgYW5kIDIpIGZyb20gdGV4dCBzdHJlYW1zIHdoaWxlIHByZXNlcnZpbmcgYWxsIG90aGVyIGNvbnRlbnQuXG4gKiBJdCdzIGRlc2lnbmVkIHRvIGhhbmRsZSBzZXF1ZW5jZXMgdGhhdCBtYXkgYmUgc3BsaXQgYWNyb3NzIG11bHRpcGxlIGRhdGEgY2h1bmtzLFxuICogbWFraW5nIGl0IHN1aXRhYmxlIGZvciBzdHJlYW1pbmcgdGVybWluYWwgb3V0cHV0LlxuICpcbiAqIEtleSBmZWF0dXJlczpcbiAqIC0gSGFuZGxlcyBzcGxpdCBzZXF1ZW5jZXMgYWNyb3NzIGNodW5rIGJvdW5kYXJpZXNcbiAqIC0gU3VwcG9ydHMgYm90aCBCRUwgKFxceDA3KSBhbmQgRVNDIFxcIChcXHgxYlxcXFwpIHRlcm1pbmF0b3JzXG4gKiAtIFplcm8tY29weSBkZXNpZ24gd2l0aCBtaW5pbWFsIHBlcmZvcm1hbmNlIGltcGFjdFxuICogLSBObyBkZXBlbmRlbmN5IG9uIGZ1bGwgQU5TSSBwYXJzaW5nIGxpYnJhcmllc1xuICogLSBQcmVzZXJ2ZXMgYWxsIG5vbi10aXRsZSBBTlNJIHNlcXVlbmNlc1xuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgYSBmaWx0ZXIgaW5zdGFuY2VcbiAqIGNvbnN0IGZpbHRlciA9IG5ldyBUaXRsZVNlcXVlbmNlRmlsdGVyKCk7XG4gKlxuICogLy8gRmlsdGVyIHRlcm1pbmFsIG91dHB1dCBjaHVua3NcbiAqIGNvbnN0IGNodW5rMSA9ICdIZWxsbyBcXHgxYl0wO015IFRpdGxlXFx4MDdXb3JsZCc7XG4gKiBjb25zb2xlLmxvZyhmaWx0ZXIuZmlsdGVyKGNodW5rMSkpOyAvLyBcIkhlbGxvIFdvcmxkXCJcbiAqXG4gKiAvLyBIYW5kbGUgc3BsaXQgc2VxdWVuY2VzXG4gKiBjb25zdCBjaHVuazIgPSAnU3RhcnQgXFx4MWJdMjtQYXJ0aWFsJztcbiAqIGNvbnN0IGNodW5rMyA9ICcgVGl0bGVcXHgwNyBFbmQnO1xuICogY29uc29sZS5sb2coZmlsdGVyLmZpbHRlcihjaHVuazIpKTsgLy8gXCJTdGFydCBcIlxuICogY29uc29sZS5sb2coZmlsdGVyLmZpbHRlcihjaHVuazMpKTsgLy8gXCIgRW5kXCJcbiAqXG4gKiAvLyBXb3JrcyB3aXRoIEVTQyBcXCB0ZXJtaW5hdG9yXG4gKiBjb25zdCBjaHVuazQgPSAnXFx4MWJdMTtXaW5kb3cgVGl0bGVcXHgxYlxcXFxNb3JlIHRleHQnO1xuICogY29uc29sZS5sb2coZmlsdGVyLmZpbHRlcihjaHVuazQpKTsgLy8gXCJNb3JlIHRleHRcIlxuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBUaXRsZVNlcXVlbmNlRmlsdGVyIHtcbiAgcHJpdmF0ZSBidWZmZXIgPSAnJztcblxuICAvLyBDb21waWxlIHJlZ2V4ZXMgb25jZSBhcyBzdGF0aWMgcHJvcGVydGllcyBmb3IgYmV0dGVyIHBlcmZvcm1hbmNlXG4gIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Db250cm9sQ2hhcmFjdGVyc0luUmVnZXg6IEFOU0kgZXNjYXBlIHNlcXVlbmNlcyByZXF1aXJlIGNvbnRyb2wgY2hhcmFjdGVyc1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBDT01QTEVURV9USVRMRV9SRUdFWCA9IC9cXHgxYlxcXVswLTJdO1teXFx4MDdcXHgxYl0qKD86XFx4MDd8XFx4MWJcXFxcKS9nO1xuICBwcml2YXRlIHN0YXRpYyByZWFkb25seSBQQVJUSUFMX1RJVExFX1JFR0VYID1cbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQ29udHJvbENoYXJhY3RlcnNJblJlZ2V4OiBBTlNJIGVzY2FwZSBzZXF1ZW5jZXMgcmVxdWlyZSBjb250cm9sIGNoYXJhY3RlcnNcbiAgICAvXFx4MWJcXF1bMC0yXTsuKlxceDFiJHxcXHgxYlxcXVswLTJdO1teXFx4MDddKiR8XFx4MWIoPzpcXF0oPzpbMC0yXSk/KT8kLztcblxuICAvKipcbiAgICogRmlsdGVyIHRlcm1pbmFsIHRpdGxlIHNlcXVlbmNlcyBmcm9tIHRoZSBpbnB1dCBkYXRhLlxuICAgKiBIYW5kbGVzIHNlcXVlbmNlcyB0aGF0IG1heSBiZSBzcGxpdCBhY3Jvc3MgbXVsdGlwbGUgY2h1bmtzLlxuICAgKlxuICAgKiBAcGFyYW0gY2h1bmsgVGhlIGlucHV0IGRhdGEgY2h1bmsgdG8gZmlsdGVyXG4gICAqIEByZXR1cm5zIFRoZSBmaWx0ZXJlZCBkYXRhIHdpdGggdGl0bGUgc2VxdWVuY2VzIHJlbW92ZWRcbiAgICovXG4gIGZpbHRlcihjaHVuazogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBBcHBlbmQgbmV3IGNodW5rIHRvIGFueSBsZWZ0b3ZlciBidWZmZXJcbiAgICB0aGlzLmJ1ZmZlciArPSBjaHVuaztcblxuICAgIC8vIFJlbW92ZSBhbGwgY29tcGxldGUgdGl0bGUgc2VxdWVuY2VzXG4gICAgLy8gTWF0Y2hlczogRVNDIF0gMC8xLzIgOyA8dGl0bGUgdGV4dD4gQkVMIG9yIEVTQyBdIDAvMS8yIDsgPHRpdGxlIHRleHQ+IEVTQyBcXFxuICAgIGNvbnN0IGZpbHRlcmVkID0gdGhpcy5idWZmZXIucmVwbGFjZShUaXRsZVNlcXVlbmNlRmlsdGVyLkNPTVBMRVRFX1RJVExFX1JFR0VYLCAnJyk7XG5cbiAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIGEgcGFydGlhbCB0aXRsZSBzZXF1ZW5jZSBhdCB0aGUgZW5kXG4gICAgLy8gVGhpcyBpbmNsdWRlcyBzZXF1ZW5jZXMgdGhhdCBtaWdodCBiZSB0ZXJtaW5hdGVkIGJ5IEVTQyBcXCB3aGVyZSB0aGUgRVNDIGlzIGF0IHRoZSBlbmRcbiAgICAvLyBXZSBuZWVkIHRvIGxvb2sgZm9yOlxuICAgIC8vIC0gXFx4MWIgYXQgdGhlIGVuZCAoY291bGQgYmUgc3RhcnQgb2YgbmV3IHNlcXVlbmNlIE9SIHBhcnQgb2YgXFx4MWJcXFxcIHRlcm1pbmF0b3IpXG4gICAgLy8gLSBcXHgxYl0gYXQgdGhlIGVuZFxuICAgIC8vIC0gXFx4MWJdWzAtMl0gYXQgdGhlIGVuZFxuICAgIC8vIC0gXFx4MWJdWzAtMl07IGZvbGxvd2VkIGJ5IGFueSB0ZXh0IGVuZGluZyB3aXRoIFxceDFiIChwb3RlbnRpYWwgXFx4MWJcXFxcIHRlcm1pbmF0b3IpXG4gICAgLy8gLSBcXHgxYl1bMC0yXTsgZm9sbG93ZWQgYnkgYW55IHRleHQgd2l0aG91dCB0ZXJtaW5hdG9yXG4gICAgY29uc3QgcGFydGlhbE1hdGNoID0gZmlsdGVyZWQubWF0Y2goVGl0bGVTZXF1ZW5jZUZpbHRlci5QQVJUSUFMX1RJVExFX1JFR0VYKTtcblxuICAgIGlmIChwYXJ0aWFsTWF0Y2gpIHtcbiAgICAgIC8vIFNhdmUgdGhlIHBhcnRpYWwgc2VxdWVuY2UgZm9yIHRoZSBuZXh0IGNodW5rXG4gICAgICB0aGlzLmJ1ZmZlciA9IHBhcnRpYWxNYXRjaFswXTtcbiAgICAgIC8vIFJldHVybiBldmVyeXRoaW5nIGV4Y2VwdCB0aGUgcGFydGlhbCBzZXF1ZW5jZVxuICAgICAgcmV0dXJuIGZpbHRlcmVkLnNsaWNlKDAsIC1wYXJ0aWFsTWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICB9XG5cbiAgICAvLyBObyBwYXJ0aWFsIHNlcXVlbmNlLCBjbGVhciBidWZmZXIgYW5kIHJldHVybiBldmVyeXRoaW5nXG4gICAgdGhpcy5idWZmZXIgPSAnJztcbiAgICByZXR1cm4gZmlsdGVyZWQ7XG4gIH1cbn1cbiJdfQ==