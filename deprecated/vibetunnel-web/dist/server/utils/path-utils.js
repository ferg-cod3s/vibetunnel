"use strict";
/**
 * Path utilities for server-side path operations
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
exports.expandTildePath = expandTildePath;
exports.resolveAbsolutePath = resolveAbsolutePath;
const path = __importStar(require("path"));
/**
 * Expand tilde (~) in file paths to the user's home directory
 * @param filePath The path to expand
 * @returns The expanded path
 */
function expandTildePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
        return filePath;
    }
    if (filePath === '~' || filePath.startsWith('~/')) {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (!homeDir) {
            // If we can't determine home directory, return original path
            return filePath;
        }
        return filePath === '~' ? homeDir : path.join(homeDir, filePath.slice(2));
    }
    return filePath;
}
/**
 * Resolve a path to an absolute path, expanding tilde if present
 * @param filePath The path to resolve
 * @returns The absolute path
 */
function resolveAbsolutePath(filePath) {
    const expanded = expandTildePath(filePath);
    return path.resolve(expanded);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aC11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvdXRpbHMvcGF0aC11dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBU0gsMENBZUM7QUFPRCxrREFHQztBQWhDRCwyQ0FBNkI7QUFFN0I7Ozs7R0FJRztBQUNILFNBQWdCLGVBQWUsQ0FBQyxRQUFnQjtJQUM5QyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sUUFBUSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlDLE9BQU8sUUFBUSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxJQUFJLFFBQVEsS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2xELE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1FBQzVELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLDZEQUE2RDtZQUM3RCxPQUFPLFFBQVEsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxRQUFRLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFnQixtQkFBbUIsQ0FBQyxRQUFnQjtJQUNsRCxNQUFNLFFBQVEsR0FBRyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0MsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2hDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFBhdGggdXRpbGl0aWVzIGZvciBzZXJ2ZXItc2lkZSBwYXRoIG9wZXJhdGlvbnNcbiAqL1xuXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vKipcbiAqIEV4cGFuZCB0aWxkZSAofikgaW4gZmlsZSBwYXRocyB0byB0aGUgdXNlcidzIGhvbWUgZGlyZWN0b3J5XG4gKiBAcGFyYW0gZmlsZVBhdGggVGhlIHBhdGggdG8gZXhwYW5kXG4gKiBAcmV0dXJucyBUaGUgZXhwYW5kZWQgcGF0aFxuICovXG5leHBvcnQgZnVuY3Rpb24gZXhwYW5kVGlsZGVQYXRoKGZpbGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAoIWZpbGVQYXRoIHx8IHR5cGVvZiBmaWxlUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gZmlsZVBhdGg7XG4gIH1cblxuICBpZiAoZmlsZVBhdGggPT09ICd+JyB8fCBmaWxlUGF0aC5zdGFydHNXaXRoKCd+LycpKSB7XG4gICAgY29uc3QgaG9tZURpciA9IHByb2Nlc3MuZW52LkhPTUUgfHwgcHJvY2Vzcy5lbnYuVVNFUlBST0ZJTEU7XG4gICAgaWYgKCFob21lRGlyKSB7XG4gICAgICAvLyBJZiB3ZSBjYW4ndCBkZXRlcm1pbmUgaG9tZSBkaXJlY3RvcnksIHJldHVybiBvcmlnaW5hbCBwYXRoXG4gICAgICByZXR1cm4gZmlsZVBhdGg7XG4gICAgfVxuICAgIHJldHVybiBmaWxlUGF0aCA9PT0gJ34nID8gaG9tZURpciA6IHBhdGguam9pbihob21lRGlyLCBmaWxlUGF0aC5zbGljZSgyKSk7XG4gIH1cblxuICByZXR1cm4gZmlsZVBhdGg7XG59XG5cbi8qKlxuICogUmVzb2x2ZSBhIHBhdGggdG8gYW4gYWJzb2x1dGUgcGF0aCwgZXhwYW5kaW5nIHRpbGRlIGlmIHByZXNlbnRcbiAqIEBwYXJhbSBmaWxlUGF0aCBUaGUgcGF0aCB0byByZXNvbHZlXG4gKiBAcmV0dXJucyBUaGUgYWJzb2x1dGUgcGF0aFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUFic29sdXRlUGF0aChmaWxlUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgZXhwYW5kZWQgPSBleHBhbmRUaWxkZVBhdGgoZmlsZVBhdGgpO1xuICByZXR1cm4gcGF0aC5yZXNvbHZlKGV4cGFuZGVkKTtcbn1cbiJdfQ==