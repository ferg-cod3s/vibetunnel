"use strict";
/**
 * Shared utility for formatting terminal text with style markup
 * Used by both client and server for consistent text representation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCellStyle = formatCellStyle;
exports.cellsToText = cellsToText;
/**
 * Format style attributes for a cell into a string
 */
function formatCellStyle(cell) {
    const attrs = [];
    // Foreground color
    if (cell.fg !== undefined) {
        if (cell.fg >= 0 && cell.fg <= 255) {
            attrs.push(`fg="${cell.fg}"`);
        }
        else {
            const r = (cell.fg >> 16) & 0xff;
            const g = (cell.fg >> 8) & 0xff;
            const b = cell.fg & 0xff;
            attrs.push(`fg="${r},${g},${b}"`);
        }
    }
    // Background color
    if (cell.bg !== undefined) {
        if (cell.bg >= 0 && cell.bg <= 255) {
            attrs.push(`bg="${cell.bg}"`);
        }
        else {
            const r = (cell.bg >> 16) & 0xff;
            const g = (cell.bg >> 8) & 0xff;
            const b = cell.bg & 0xff;
            attrs.push(`bg="${r},${g},${b}"`);
        }
    }
    // Text attributes
    if (cell.attributes) {
        if (cell.attributes & 0x01)
            attrs.push('bold');
        if (cell.attributes & 0x02)
            attrs.push('dim');
        if (cell.attributes & 0x04)
            attrs.push('italic');
        if (cell.attributes & 0x08)
            attrs.push('underline');
        if (cell.attributes & 0x10)
            attrs.push('inverse');
        if (cell.attributes & 0x20)
            attrs.push('invisible');
        if (cell.attributes & 0x40)
            attrs.push('strikethrough');
    }
    return attrs.join(' ');
}
/**
 * Convert buffer cells to text with optional style markup
 */
function cellsToText(cells, includeStyles = true) {
    const lines = [];
    for (const row of cells) {
        let line = '';
        if (includeStyles) {
            let currentStyle = '';
            let currentText = '';
            const flushStyleGroup = () => {
                if (currentText) {
                    if (currentStyle) {
                        line += `[style ${currentStyle}]${currentText}[/style]`;
                    }
                    else {
                        line += currentText;
                    }
                    currentText = '';
                }
            };
            for (const cell of row) {
                const style = formatCellStyle(cell);
                if (style !== currentStyle) {
                    flushStyleGroup();
                    currentStyle = style;
                }
                currentText += cell.char;
            }
            flushStyleGroup();
        }
        else {
            // Plain text without styles
            for (const cell of row) {
                line += cell.char;
            }
        }
        // Trim trailing spaces but preserve empty lines
        lines.push(line.trimEnd());
    }
    return lines.join('\n');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwtdGV4dC1mb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2hhcmVkL3Rlcm1pbmFsLXRleHQtZm9ybWF0dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7O0FBYUgsMENBdUNDO0FBS0Qsa0NBNkNDO0FBNUZEOztHQUVHO0FBQ0gsU0FBZ0IsZUFBZSxDQUFDLElBQWdCO0lBQzlDLE1BQU0sS0FBSyxHQUFhLEVBQUUsQ0FBQztJQUUzQixtQkFBbUI7SUFDbkIsSUFBSSxJQUFJLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQzFCLElBQUksSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNuQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEMsQ0FBQzthQUFNLENBQUM7WUFDTixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7WUFDaEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUM7WUFDekIsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwQyxDQUFDO0lBQ0gsQ0FBQztJQUVELG1CQUFtQjtJQUNuQixJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDMUIsSUFBSSxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsRUFBRSxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ25DLEtBQUss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SSxJQUFJLEdBQUcsRUFBRSxDQUFDO2dCQUN2QixJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQztZQUNwQixDQUFDO1FBQ0gsQ0FBQztRQUVELGdEQUFnRDtRQUNoRCxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2hhcmVkIHV0aWxpdHkgZm9yIGZvcm1hdHRpbmcgdGVybWluYWwgdGV4dCB3aXRoIHN0eWxlIG1hcmt1cFxuICogVXNlZCBieSBib3RoIGNsaWVudCBhbmQgc2VydmVyIGZvciBjb25zaXN0ZW50IHRleHQgcmVwcmVzZW50YXRpb25cbiAqL1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ1ZmZlckNlbGwge1xuICBjaGFyOiBzdHJpbmc7XG4gIHdpZHRoOiBudW1iZXI7XG4gIGZnPzogbnVtYmVyO1xuICBiZz86IG51bWJlcjtcbiAgYXR0cmlidXRlcz86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBGb3JtYXQgc3R5bGUgYXR0cmlidXRlcyBmb3IgYSBjZWxsIGludG8gYSBzdHJpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdENlbGxTdHlsZShjZWxsOiBCdWZmZXJDZWxsKTogc3RyaW5nIHtcbiAgY29uc3QgYXR0cnM6IHN0cmluZ1tdID0gW107XG5cbiAgLy8gRm9yZWdyb3VuZCBjb2xvclxuICBpZiAoY2VsbC5mZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKGNlbGwuZmcgPj0gMCAmJiBjZWxsLmZnIDw9IDI1NSkge1xuICAgICAgYXR0cnMucHVzaChgZmc9XCIke2NlbGwuZmd9XCJgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgciA9IChjZWxsLmZnID4+IDE2KSAmIDB4ZmY7XG4gICAgICBjb25zdCBnID0gKGNlbGwuZmcgPj4gOCkgJiAweGZmO1xuICAgICAgY29uc3QgYiA9IGNlbGwuZmcgJiAweGZmO1xuICAgICAgYXR0cnMucHVzaChgZmc9XCIke3J9LCR7Z30sJHtifVwiYCk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmFja2dyb3VuZCBjb2xvclxuICBpZiAoY2VsbC5iZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKGNlbGwuYmcgPj0gMCAmJiBjZWxsLmJnIDw9IDI1NSkge1xuICAgICAgYXR0cnMucHVzaChgYmc9XCIke2NlbGwuYmd9XCJgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgciA9IChjZWxsLmJnID4+IDE2KSAmIDB4ZmY7XG4gICAgICBjb25zdCBnID0gKGNlbGwuYmcgPj4gOCkgJiAweGZmO1xuICAgICAgY29uc3QgYiA9IGNlbGwuYmcgJiAweGZmO1xuICAgICAgYXR0cnMucHVzaChgYmc9XCIke3J9LCR7Z30sJHtifVwiYCk7XG4gICAgfVxuICB9XG5cbiAgLy8gVGV4dCBhdHRyaWJ1dGVzXG4gIGlmIChjZWxsLmF0dHJpYnV0ZXMpIHtcbiAgICBpZiAoY2VsbC5hdHRyaWJ1dGVzICYgMHgwMSkgYXR0cnMucHVzaCgnYm9sZCcpO1xuICAgIGlmIChjZWxsLmF0dHJpYnV0ZXMgJiAweDAyKSBhdHRycy5wdXNoKCdkaW0nKTtcbiAgICBpZiAoY2VsbC5hdHRyaWJ1dGVzICYgMHgwNCkgYXR0cnMucHVzaCgnaXRhbGljJyk7XG4gICAgaWYgKGNlbGwuYXR0cmlidXRlcyAmIDB4MDgpIGF0dHJzLnB1c2goJ3VuZGVybGluZScpO1xuICAgIGlmIChjZWxsLmF0dHJpYnV0ZXMgJiAweDEwKSBhdHRycy5wdXNoKCdpbnZlcnNlJyk7XG4gICAgaWYgKGNlbGwuYXR0cmlidXRlcyAmIDB4MjApIGF0dHJzLnB1c2goJ2ludmlzaWJsZScpO1xuICAgIGlmIChjZWxsLmF0dHJpYnV0ZXMgJiAweDQwKSBhdHRycy5wdXNoKCdzdHJpa2V0aHJvdWdoJyk7XG4gIH1cblxuICByZXR1cm4gYXR0cnMuam9pbignICcpO1xufVxuXG4vKipcbiAqIENvbnZlcnQgYnVmZmVyIGNlbGxzIHRvIHRleHQgd2l0aCBvcHRpb25hbCBzdHlsZSBtYXJrdXBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNlbGxzVG9UZXh0KGNlbGxzOiBCdWZmZXJDZWxsW11bXSwgaW5jbHVkZVN0eWxlcyA9IHRydWUpOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJvdyBvZiBjZWxscykge1xuICAgIGxldCBsaW5lID0gJyc7XG5cbiAgICBpZiAoaW5jbHVkZVN0eWxlcykge1xuICAgICAgbGV0IGN1cnJlbnRTdHlsZSA9ICcnO1xuICAgICAgbGV0IGN1cnJlbnRUZXh0ID0gJyc7XG5cbiAgICAgIGNvbnN0IGZsdXNoU3R5bGVHcm91cCA9ICgpID0+IHtcbiAgICAgICAgaWYgKGN1cnJlbnRUZXh0KSB7XG4gICAgICAgICAgaWYgKGN1cnJlbnRTdHlsZSkge1xuICAgICAgICAgICAgbGluZSArPSBgW3N0eWxlICR7Y3VycmVudFN0eWxlfV0ke2N1cnJlbnRUZXh0fVsvc3R5bGVdYDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZSArPSBjdXJyZW50VGV4dDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3VycmVudFRleHQgPSAnJztcbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgZm9yIChjb25zdCBjZWxsIG9mIHJvdykge1xuICAgICAgICBjb25zdCBzdHlsZSA9IGZvcm1hdENlbGxTdHlsZShjZWxsKTtcblxuICAgICAgICBpZiAoc3R5bGUgIT09IGN1cnJlbnRTdHlsZSkge1xuICAgICAgICAgIGZsdXNoU3R5bGVHcm91cCgpO1xuICAgICAgICAgIGN1cnJlbnRTdHlsZSA9IHN0eWxlO1xuICAgICAgICB9XG5cbiAgICAgICAgY3VycmVudFRleHQgKz0gY2VsbC5jaGFyO1xuICAgICAgfVxuXG4gICAgICBmbHVzaFN0eWxlR3JvdXAoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gUGxhaW4gdGV4dCB3aXRob3V0IHN0eWxlc1xuICAgICAgZm9yIChjb25zdCBjZWxsIG9mIHJvdykge1xuICAgICAgICBsaW5lICs9IGNlbGwuY2hhcjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUcmltIHRyYWlsaW5nIHNwYWNlcyBidXQgcHJlc2VydmUgZW1wdHkgbGluZXNcbiAgICBsaW5lcy5wdXNoKGxpbmUudHJpbUVuZCgpKTtcbiAgfVxuXG4gIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbn1cbiJdfQ==