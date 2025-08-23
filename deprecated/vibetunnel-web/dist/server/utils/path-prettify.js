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
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettifyPath = prettifyPath;
exports.prettifyPaths = prettifyPaths;
const os = __importStar(require("os"));
/**
 * Convert absolute paths to use ~ for the home directory
 * @param absolutePath The absolute path to prettify
 * @returns The prettified path with ~ for home directory
 */
function prettifyPath(absolutePath) {
    const homeDir = os.homedir();
    if (absolutePath.startsWith(homeDir)) {
        return `~${absolutePath.slice(homeDir.length)}`;
    }
    return absolutePath;
}
/**
 * Convert multiple paths to use ~ for the home directory
 * @param paths Array of absolute paths to prettify
 * @returns Array of prettified paths
 */
function prettifyPaths(paths) {
    return paths.map(prettifyPath);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aC1wcmV0dGlmeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvdXRpbHMvcGF0aC1wcmV0dGlmeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQU9BLG9DQVFDO0FBT0Qsc0NBRUM7QUF4QkQsdUNBQXlCO0FBRXpCOzs7O0dBSUc7QUFDSCxTQUFnQixZQUFZLENBQUMsWUFBb0I7SUFDL0MsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBRTdCLElBQUksWUFBWSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3JDLE9BQU8sSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ2xELENBQUM7SUFFRCxPQUFPLFlBQVksQ0FBQztBQUN0QixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILFNBQWdCLGFBQWEsQ0FBQyxLQUFlO0lBQzNDLE9BQU8sS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUNqQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuXG4vKipcbiAqIENvbnZlcnQgYWJzb2x1dGUgcGF0aHMgdG8gdXNlIH4gZm9yIHRoZSBob21lIGRpcmVjdG9yeVxuICogQHBhcmFtIGFic29sdXRlUGF0aCBUaGUgYWJzb2x1dGUgcGF0aCB0byBwcmV0dGlmeVxuICogQHJldHVybnMgVGhlIHByZXR0aWZpZWQgcGF0aCB3aXRoIH4gZm9yIGhvbWUgZGlyZWN0b3J5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmV0dGlmeVBhdGgoYWJzb2x1dGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBob21lRGlyID0gb3MuaG9tZWRpcigpO1xuXG4gIGlmIChhYnNvbHV0ZVBhdGguc3RhcnRzV2l0aChob21lRGlyKSkge1xuICAgIHJldHVybiBgfiR7YWJzb2x1dGVQYXRoLnNsaWNlKGhvbWVEaXIubGVuZ3RoKX1gO1xuICB9XG5cbiAgcmV0dXJuIGFic29sdXRlUGF0aDtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IG11bHRpcGxlIHBhdGhzIHRvIHVzZSB+IGZvciB0aGUgaG9tZSBkaXJlY3RvcnlcbiAqIEBwYXJhbSBwYXRocyBBcnJheSBvZiBhYnNvbHV0ZSBwYXRocyB0byBwcmV0dGlmeVxuICogQHJldHVybnMgQXJyYXkgb2YgcHJldHRpZmllZCBwYXRoc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcHJldHRpZnlQYXRocyhwYXRoczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG4gIHJldHVybiBwYXRocy5tYXAocHJldHRpZnlQYXRoKTtcbn1cbiJdfQ==