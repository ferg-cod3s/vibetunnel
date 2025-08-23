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
exports.abbreviatePath = abbreviatePath;
exports.generateSessionName = generateSessionName;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/**
 * Abbreviate a file path to make it more readable
 * Examples:
 *   /Users/john/Projects/myproject -> ~/Projects/myproject
 *   /Users/john/Development/vibetunnel/web -> ~/Dev/vibetunnel/web
 *   /very/long/path/to/some/directory -> …/some/directory
 */
function abbreviatePath(fullPath) {
    if (!fullPath)
        return '';
    const homedir = os.homedir();
    let abbreviated = fullPath;
    // Replace home directory with ~
    if (fullPath.startsWith(homedir)) {
        abbreviated = `~${fullPath.slice(homedir.length)}`;
    }
    // Common abbreviations
    abbreviated = abbreviated
        .replace('/Development/', '/Dev/')
        .replace('/Documents/', '/Docs/')
        .replace('/Applications/', '/Apps/');
    // If still long, show only last 2 path components
    const parts = abbreviated.split('/').filter((p) => p);
    if (parts.length > 3) {
        return `…/${parts.slice(-2).join('/')}`;
    }
    return abbreviated;
}
/**
 * Generate a human-readable session name
 * Format: commandName (abbreviatedPath)
 * Examples:
 *   claude (~/Dev/vibetunnel/web)
 *   bash (~/Projects/myapp)
 *   python3 (~)
 */
function generateSessionName(command, workingDir) {
    const commandName = path.basename(command[0]);
    const abbrevCwd = abbreviatePath(workingDir);
    return abbrevCwd ? `${commandName} (${abbrevCwd})` : commandName;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbi1uYW1pbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL3Nlc3Npb24tbmFtaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBVUEsd0NBd0JDO0FBVUQsa0RBSUM7QUFoREQsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3Qjs7Ozs7O0dBTUc7QUFDSCxTQUFnQixjQUFjLENBQUMsUUFBZ0I7SUFDN0MsSUFBSSxDQUFDLFFBQVE7UUFBRSxPQUFPLEVBQUUsQ0FBQztJQUV6QixNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDN0IsSUFBSSxXQUFXLEdBQUcsUUFBUSxDQUFDO0lBRTNCLGdDQUFnQztJQUNoQyxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxXQUFXLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ3JELENBQUM7SUFFRCx1QkFBdUI7SUFDdkIsV0FBVyxHQUFHLFdBQVc7U0FDdEIsT0FBTyxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUM7U0FDakMsT0FBTyxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUM7U0FDaEMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBRXZDLGtEQUFrRDtJQUNsRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEQsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFDMUMsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDO0FBQ3JCLENBQUM7QUFFRDs7Ozs7OztHQU9HO0FBQ0gsU0FBZ0IsbUJBQW1CLENBQUMsT0FBaUIsRUFBRSxVQUFrQjtJQUN2RSxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUM3QyxPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxXQUFXLEtBQUssU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUNuRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLyoqXG4gKiBBYmJyZXZpYXRlIGEgZmlsZSBwYXRoIHRvIG1ha2UgaXQgbW9yZSByZWFkYWJsZVxuICogRXhhbXBsZXM6XG4gKiAgIC9Vc2Vycy9qb2huL1Byb2plY3RzL215cHJvamVjdCAtPiB+L1Byb2plY3RzL215cHJvamVjdFxuICogICAvVXNlcnMvam9obi9EZXZlbG9wbWVudC92aWJldHVubmVsL3dlYiAtPiB+L0Rldi92aWJldHVubmVsL3dlYlxuICogICAvdmVyeS9sb25nL3BhdGgvdG8vc29tZS9kaXJlY3RvcnkgLT4g4oCmL3NvbWUvZGlyZWN0b3J5XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhYmJyZXZpYXRlUGF0aChmdWxsUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKCFmdWxsUGF0aCkgcmV0dXJuICcnO1xuXG4gIGNvbnN0IGhvbWVkaXIgPSBvcy5ob21lZGlyKCk7XG4gIGxldCBhYmJyZXZpYXRlZCA9IGZ1bGxQYXRoO1xuXG4gIC8vIFJlcGxhY2UgaG9tZSBkaXJlY3Rvcnkgd2l0aCB+XG4gIGlmIChmdWxsUGF0aC5zdGFydHNXaXRoKGhvbWVkaXIpKSB7XG4gICAgYWJicmV2aWF0ZWQgPSBgfiR7ZnVsbFBhdGguc2xpY2UoaG9tZWRpci5sZW5ndGgpfWA7XG4gIH1cblxuICAvLyBDb21tb24gYWJicmV2aWF0aW9uc1xuICBhYmJyZXZpYXRlZCA9IGFiYnJldmlhdGVkXG4gICAgLnJlcGxhY2UoJy9EZXZlbG9wbWVudC8nLCAnL0Rldi8nKVxuICAgIC5yZXBsYWNlKCcvRG9jdW1lbnRzLycsICcvRG9jcy8nKVxuICAgIC5yZXBsYWNlKCcvQXBwbGljYXRpb25zLycsICcvQXBwcy8nKTtcblxuICAvLyBJZiBzdGlsbCBsb25nLCBzaG93IG9ubHkgbGFzdCAyIHBhdGggY29tcG9uZW50c1xuICBjb25zdCBwYXJ0cyA9IGFiYnJldmlhdGVkLnNwbGl0KCcvJykuZmlsdGVyKChwKSA9PiBwKTtcbiAgaWYgKHBhcnRzLmxlbmd0aCA+IDMpIHtcbiAgICByZXR1cm4gYOKApi8ke3BhcnRzLnNsaWNlKC0yKS5qb2luKCcvJyl9YDtcbiAgfVxuXG4gIHJldHVybiBhYmJyZXZpYXRlZDtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIGh1bWFuLXJlYWRhYmxlIHNlc3Npb24gbmFtZVxuICogRm9ybWF0OiBjb21tYW5kTmFtZSAoYWJicmV2aWF0ZWRQYXRoKVxuICogRXhhbXBsZXM6XG4gKiAgIGNsYXVkZSAofi9EZXYvdmliZXR1bm5lbC93ZWIpXG4gKiAgIGJhc2ggKH4vUHJvamVjdHMvbXlhcHApXG4gKiAgIHB5dGhvbjMgKH4pXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVNlc3Npb25OYW1lKGNvbW1hbmQ6IHN0cmluZ1tdLCB3b3JraW5nRGlyOiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBjb21tYW5kTmFtZSA9IHBhdGguYmFzZW5hbWUoY29tbWFuZFswXSk7XG4gIGNvbnN0IGFiYnJldkN3ZCA9IGFiYnJldmlhdGVQYXRoKHdvcmtpbmdEaXIpO1xuICByZXR1cm4gYWJicmV2Q3dkID8gYCR7Y29tbWFuZE5hbWV9ICgke2FiYnJldkN3ZH0pYCA6IGNvbW1hbmROYW1lO1xufVxuIl19