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
exports.getMainRepositoryPath = getMainRepositoryPath;
exports.isWorktree = isWorktree;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('git-utils');
const readFile = (0, util_1.promisify)(fs.readFile);
const stat = (0, util_1.promisify)(fs.stat);
const execFile = (0, util_1.promisify)(require('child_process').execFile);
/**
 * Get the main repository path for a given path
 * @param gitPath Path that might be a worktree or main repo
 * @returns Main repository path
 */
async function getMainRepositoryPath(gitPath) {
    try {
        const gitFile = path.join(gitPath, '.git');
        const stats = await stat(gitFile).catch(() => null);
        if (!stats) {
            // Not a git repository
            return gitPath;
        }
        if (stats.isDirectory()) {
            // This is the main repository
            return gitPath;
        }
        // This is a worktree - read the .git file to find the main repo
        const gitFileContent = await readFile(gitFile, 'utf-8');
        const match = gitFileContent.match(/^gitdir:\s*(.+)$/m);
        if (!match) {
            logger.warn(`Could not parse .git file at ${gitFile}`);
            return gitPath;
        }
        // Extract main repo path from worktree path
        // Example: /Users/steipete/Projects/vibetunnel/.git/worktrees/vibetunnel-treetest
        // We want: /Users/steipete/Projects/vibetunnel
        const worktreePath = match[1].trim();
        const mainRepoMatch = worktreePath.match(/^(.+)\/.git\/worktrees\/.+$/);
        if (mainRepoMatch) {
            return mainRepoMatch[1];
        }
        // Fallback: try to resolve it using git command
        try {
            const { stdout } = await execFile('git', ['rev-parse', '--git-common-dir'], {
                cwd: gitPath,
            });
            const commonDir = stdout.trim();
            // Go up one level from .git directory
            return path.dirname(commonDir);
        }
        catch (error) {
            logger.warn(`Could not determine main repo path for ${gitPath}:`, error);
            return gitPath;
        }
    }
    catch (error) {
        logger.error(`Error getting main repository path for ${gitPath}:`, error);
        return gitPath;
    }
}
/**
 * Check if a path is a git worktree
 * @param gitPath Path to check
 * @returns True if the path is a worktree
 */
async function isWorktree(gitPath) {
    try {
        const gitFile = path.join(gitPath, '.git');
        const stats = await stat(gitFile).catch(() => null);
        if (!stats) {
            return false;
        }
        // If .git is a file (not a directory), it's a worktree
        return !stats.isDirectory();
    }
    catch (error) {
        logger.error(`Error checking if path is worktree: ${gitPath}`, error);
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LXV0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9naXQtdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFlQSxzREFrREM7QUFPRCxnQ0FlQztBQXZGRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtCQUFpQztBQUNqQywyQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3pDLE1BQU0sUUFBUSxHQUFHLElBQUEsZ0JBQVMsRUFBQyxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDeEMsTUFBTSxJQUFJLEdBQUcsSUFBQSxnQkFBUyxFQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNoQyxNQUFNLFFBQVEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRTlEOzs7O0dBSUc7QUFDSSxLQUFLLFVBQVUscUJBQXFCLENBQUMsT0FBZTtJQUN6RCxJQUFJLENBQUM7UUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUMzQyxNQUFNLEtBQUssR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsdUJBQXVCO1lBQ3ZCLE9BQU8sT0FBTyxDQUFDO1FBQ2pCLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDO1lBQ3hCLDhCQUE4QjtZQUM5QixPQUFPLE9BQU8sQ0FBQztRQUNqQixDQUFDO1FBRUQsZ0VBQWdFO1FBQ2hFLE1BQU0sY0FBYyxHQUFHLE1BQU0sUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN4RCxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFeEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1gsTUFBTSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN2RCxPQUFPLE9BQU8sQ0FBQztRQUNqQixDQUFDO1FBRUQsNENBQTRDO1FBQzVDLGtGQUFrRjtRQUNsRiwrQ0FBK0M7UUFDL0MsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JDLE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUV4RSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFFRCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQyxFQUFFO2dCQUMxRSxHQUFHLEVBQUUsT0FBTzthQUNiLENBQUMsQ0FBQztZQUNILE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQyxzQ0FBc0M7WUFDdEMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLElBQUksQ0FBQywwQ0FBMEMsT0FBTyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekUsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsT0FBTyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUUsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztBQUNILENBQUM7QUFFRDs7OztHQUlHO0FBQ0ksS0FBSyxVQUFVLFVBQVUsQ0FBQyxPQUFlO0lBQzlDLElBQUksQ0FBQztRQUNILE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzNDLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPLEtBQUssQ0FBQztRQUNmLENBQUM7UUFFRCx1REFBdUQ7UUFDdkQsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLE9BQU8sRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sS0FBSyxDQUFDO0lBQ2YsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignZ2l0LXV0aWxzJyk7XG5jb25zdCByZWFkRmlsZSA9IHByb21pc2lmeShmcy5yZWFkRmlsZSk7XG5jb25zdCBzdGF0ID0gcHJvbWlzaWZ5KGZzLnN0YXQpO1xuY29uc3QgZXhlY0ZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWNGaWxlKTtcblxuLyoqXG4gKiBHZXQgdGhlIG1haW4gcmVwb3NpdG9yeSBwYXRoIGZvciBhIGdpdmVuIHBhdGhcbiAqIEBwYXJhbSBnaXRQYXRoIFBhdGggdGhhdCBtaWdodCBiZSBhIHdvcmt0cmVlIG9yIG1haW4gcmVwb1xuICogQHJldHVybnMgTWFpbiByZXBvc2l0b3J5IHBhdGhcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldE1haW5SZXBvc2l0b3J5UGF0aChnaXRQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIGNvbnN0IGdpdEZpbGUgPSBwYXRoLmpvaW4oZ2l0UGF0aCwgJy5naXQnKTtcbiAgICBjb25zdCBzdGF0cyA9IGF3YWl0IHN0YXQoZ2l0RmlsZSkuY2F0Y2goKCkgPT4gbnVsbCk7XG5cbiAgICBpZiAoIXN0YXRzKSB7XG4gICAgICAvLyBOb3QgYSBnaXQgcmVwb3NpdG9yeVxuICAgICAgcmV0dXJuIGdpdFBhdGg7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRzLmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIC8vIFRoaXMgaXMgdGhlIG1haW4gcmVwb3NpdG9yeVxuICAgICAgcmV0dXJuIGdpdFBhdGg7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpcyBhIHdvcmt0cmVlIC0gcmVhZCB0aGUgLmdpdCBmaWxlIHRvIGZpbmQgdGhlIG1haW4gcmVwb1xuICAgIGNvbnN0IGdpdEZpbGVDb250ZW50ID0gYXdhaXQgcmVhZEZpbGUoZ2l0RmlsZSwgJ3V0Zi04Jyk7XG4gICAgY29uc3QgbWF0Y2ggPSBnaXRGaWxlQ29udGVudC5tYXRjaCgvXmdpdGRpcjpcXHMqKC4rKSQvbSk7XG5cbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICBsb2dnZXIud2FybihgQ291bGQgbm90IHBhcnNlIC5naXQgZmlsZSBhdCAke2dpdEZpbGV9YCk7XG4gICAgICByZXR1cm4gZ2l0UGF0aDtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IG1haW4gcmVwbyBwYXRoIGZyb20gd29ya3RyZWUgcGF0aFxuICAgIC8vIEV4YW1wbGU6IC9Vc2Vycy9zdGVpcGV0ZS9Qcm9qZWN0cy92aWJldHVubmVsLy5naXQvd29ya3RyZWVzL3ZpYmV0dW5uZWwtdHJlZXRlc3RcbiAgICAvLyBXZSB3YW50OiAvVXNlcnMvc3RlaXBldGUvUHJvamVjdHMvdmliZXR1bm5lbFxuICAgIGNvbnN0IHdvcmt0cmVlUGF0aCA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICBjb25zdCBtYWluUmVwb01hdGNoID0gd29ya3RyZWVQYXRoLm1hdGNoKC9eKC4rKVxcLy5naXRcXC93b3JrdHJlZXNcXC8uKyQvKTtcblxuICAgIGlmIChtYWluUmVwb01hdGNoKSB7XG4gICAgICByZXR1cm4gbWFpblJlcG9NYXRjaFsxXTtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjazogdHJ5IHRvIHJlc29sdmUgaXQgdXNpbmcgZ2l0IGNvbW1hbmRcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNGaWxlKCdnaXQnLCBbJ3Jldi1wYXJzZScsICctLWdpdC1jb21tb24tZGlyJ10sIHtcbiAgICAgICAgY3dkOiBnaXRQYXRoLFxuICAgICAgfSk7XG4gICAgICBjb25zdCBjb21tb25EaXIgPSBzdGRvdXQudHJpbSgpO1xuICAgICAgLy8gR28gdXAgb25lIGxldmVsIGZyb20gLmdpdCBkaXJlY3RvcnlcbiAgICAgIHJldHVybiBwYXRoLmRpcm5hbWUoY29tbW9uRGlyKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oYENvdWxkIG5vdCBkZXRlcm1pbmUgbWFpbiByZXBvIHBhdGggZm9yICR7Z2l0UGF0aH06YCwgZXJyb3IpO1xuICAgICAgcmV0dXJuIGdpdFBhdGg7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcihgRXJyb3IgZ2V0dGluZyBtYWluIHJlcG9zaXRvcnkgcGF0aCBmb3IgJHtnaXRQYXRofTpgLCBlcnJvcik7XG4gICAgcmV0dXJuIGdpdFBhdGg7XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIHBhdGggaXMgYSBnaXQgd29ya3RyZWVcbiAqIEBwYXJhbSBnaXRQYXRoIFBhdGggdG8gY2hlY2tcbiAqIEByZXR1cm5zIFRydWUgaWYgdGhlIHBhdGggaXMgYSB3b3JrdHJlZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaXNXb3JrdHJlZShnaXRQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBnaXRGaWxlID0gcGF0aC5qb2luKGdpdFBhdGgsICcuZ2l0Jyk7XG4gICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBzdGF0KGdpdEZpbGUpLmNhdGNoKCgpID0+IG51bGwpO1xuXG4gICAgaWYgKCFzdGF0cykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIElmIC5naXQgaXMgYSBmaWxlIChub3QgYSBkaXJlY3RvcnkpLCBpdCdzIGEgd29ya3RyZWVcbiAgICByZXR1cm4gIXN0YXRzLmlzRGlyZWN0b3J5KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKGBFcnJvciBjaGVja2luZyBpZiBwYXRoIGlzIHdvcmt0cmVlOiAke2dpdFBhdGh9YCwgZXJyb3IpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuIl19