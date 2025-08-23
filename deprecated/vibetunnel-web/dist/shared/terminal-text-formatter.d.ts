/**
 * Shared utility for formatting terminal text with style markup
 * Used by both client and server for consistent text representation
 */
export interface BufferCell {
    char: string;
    width: number;
    fg?: number;
    bg?: number;
    attributes?: number;
}
/**
 * Format style attributes for a cell into a string
 */
export declare function formatCellStyle(cell: BufferCell): string;
/**
 * Convert buffer cells to text with optional style markup
 */
export declare function cellsToText(cells: BufferCell[][], includeStyles?: boolean): string;
