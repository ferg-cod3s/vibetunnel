"use strict";
/**
 * Git information detection utilities
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
exports.detectGitInfo = detectGitInfo;
exports.clearGitInfoCache = clearGitInfoCache;
exports.clearGitInfoCacheForDir = clearGitInfoCacheForDir;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Extract repository path from a worktree's .git file
 */
async function getMainRepositoryPath(workingDir) {
    try {
        const gitFile = path.join(workingDir, '.git');
        const gitContent = await fs.promises.readFile(gitFile, 'utf-8');
        // Parse the .git file format: "gitdir: /path/to/main/.git/worktrees/worktree-name"
        const match = gitContent.match(/^gitdir:\s*(.+)$/m);
        if (!match)
            return undefined;
        const gitDirPath = match[1].trim();
        // Extract the main repository path from the worktree path
        // Format: /path/to/main/.git/worktrees/worktree-name
        const worktreeMatch = gitDirPath.match(/^(.+)\/\.git\/worktrees\/.+$/);
        if (worktreeMatch) {
            return worktreeMatch[1];
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
// Cache for Git info to avoid calling git commands too frequently
const gitInfoCache = new Map();
const CACHE_TTL = 5000; // 5 seconds
/**
 * Detect Git repository information for a given directory
 */
async function detectGitInfo(workingDir) {
    // Check cache first
    const cached = gitInfoCache.get(workingDir);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.info;
    }
    try {
        // Check if the directory is in a Git repository
        const { stdout: repoPath } = await execFile('git', ['rev-parse', '--show-toplevel'], {
            cwd: workingDir,
            timeout: 5000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        const gitRepoPath = repoPath.trim();
        // Get the current branch name
        try {
            const { stdout: branch } = await execFile('git', ['branch', '--show-current'], {
                cwd: workingDir,
                timeout: 5000,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            });
            const gitBranch = branch.trim();
            // Get additional Git status information
            let gitAheadCount;
            let gitBehindCount;
            let gitHasChanges = false;
            let gitIsWorktree = false;
            try {
                // Check if this is a worktree
                const gitFile = path.join(workingDir, '.git');
                const stats = await fs.promises.stat(gitFile).catch(() => null);
                if (stats && !stats.isDirectory()) {
                    // .git is a file, not a directory - this is a worktree
                    gitIsWorktree = true;
                }
                // Get ahead/behind counts
                const { stdout: revList } = await execFile('git', ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], {
                    cwd: workingDir,
                    timeout: 5000,
                    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
                });
                const [ahead, behind] = revList.trim().split('\t').map(Number);
                gitAheadCount = ahead;
                gitBehindCount = behind;
            }
            catch {
                // Ignore errors - might not have upstream
            }
            // Check for uncommitted changes
            try {
                await execFile('git', ['diff-index', '--quiet', 'HEAD', '--'], {
                    cwd: workingDir,
                    timeout: 5000,
                    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
                });
                // Command succeeded, no changes
                gitHasChanges = false;
            }
            catch {
                // Command failed, there are changes
                gitHasChanges = true;
            }
            // Get main repository path if this is a worktree
            const gitMainRepoPath = gitIsWorktree ? await getMainRepositoryPath(workingDir) : gitRepoPath;
            const info = {
                gitRepoPath,
                gitBranch,
                gitAheadCount,
                gitBehindCount,
                gitHasChanges,
                gitIsWorktree,
                gitMainRepoPath,
            };
            // Update cache
            gitInfoCache.set(workingDir, { info, timestamp: Date.now() });
            return info;
        }
        catch (_branchError) {
            // Could be in detached HEAD state or other situation where branch name isn't available
            const info = {
                gitRepoPath,
                gitBranch: '', // Empty branch for detached HEAD
            };
            // Update cache
            gitInfoCache.set(workingDir, { info, timestamp: Date.now() });
            return info;
        }
    }
    catch {
        // Not a Git repository
        const info = {};
        // Update cache
        gitInfoCache.set(workingDir, { info, timestamp: Date.now() });
        return info;
    }
}
/**
 * Clear the Git info cache
 */
function clearGitInfoCache() {
    gitInfoCache.clear();
}
/**
 * Clear cache entry for a specific directory
 */
function clearGitInfoCacheForDir(workingDir) {
    gitInfoCache.delete(workingDir);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LWluZm8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL2dpdC1pbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7R0FFRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUF3REgsc0NBOEdDO0FBS0QsOENBRUM7QUFLRCwwREFFQztBQWxMRCxpREFBNkQ7QUFDN0QsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QiwrQkFBaUM7QUFFakMsTUFBTSxRQUFRLEdBQUcsSUFBQSxnQkFBUyxFQUFDLHdCQUFnQixDQUFDLENBQUM7QUFlN0M7O0dBRUc7QUFDSCxLQUFLLFVBQVUscUJBQXFCLENBQUMsVUFBa0I7SUFDckQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDOUMsTUFBTSxVQUFVLEdBQUcsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEUsbUZBQW1GO1FBQ25GLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sU0FBUyxDQUFDO1FBRTdCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVuQywwREFBMEQ7UUFDMUQscURBQXFEO1FBQ3JELE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUN2RSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1As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LGVBQWU7WUFDZixZQUFZLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUU5RCxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsdUJBQXVCO1FBQ3ZCLE1BQU0sSUFBSSxHQUFZLEVBQUUsQ0FBQztRQUV6QixlQUFlO1FBQ2YsWUFBWSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFOUQsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0IsaUJBQWlCO0lBQy9CLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUN2QixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQix1QkFBdUIsQ0FBQyxVQUFrQjtJQUN4RCxZQUFZLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0FBQ2xDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEdpdCBpbmZvcm1hdGlvbiBkZXRlY3Rpb24gdXRpbGl0aWVzXG4gKi9cblxuaW1wb3J0IHsgZXhlY0ZpbGUgYXMgZXhlY0ZpbGVDYWxsYmFjayB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuXG5jb25zdCBleGVjRmlsZSA9IHByb21pc2lmeShleGVjRmlsZUNhbGxiYWNrKTtcblxuLyoqXG4gKiBHaXQgcmVwb3NpdG9yeSBpbmZvcm1hdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIEdpdEluZm8ge1xuICBnaXRSZXBvUGF0aD86IHN0cmluZztcbiAgZ2l0QnJhbmNoPzogc3RyaW5nO1xuICBnaXRBaGVhZENvdW50PzogbnVtYmVyO1xuICBnaXRCZWhpbmRDb3VudD86IG51bWJlcjtcbiAgZ2l0SGFzQ2hhbmdlcz86IGJvb2xlYW47XG4gIGdpdElzV29ya3RyZWU/OiBib29sZWFuO1xuICBnaXRNYWluUmVwb1BhdGg/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogRXh0cmFjdCByZXBvc2l0b3J5IHBhdGggZnJvbSBhIHdvcmt0cmVlJ3MgLmdpdCBmaWxlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldE1haW5SZXBvc2l0b3J5UGF0aCh3b3JraW5nRGlyOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGdpdEZpbGUgPSBwYXRoLmpvaW4od29ya2luZ0RpciwgJy5naXQnKTtcbiAgICBjb25zdCBnaXRDb250ZW50ID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZEZpbGUoZ2l0RmlsZSwgJ3V0Zi04Jyk7XG5cbiAgICAvLyBQYXJzZSB0aGUgLmdpdCBmaWxlIGZvcm1hdDogXCJnaXRkaXI6IC9wYXRoL3RvL21haW4vLmdpdC93b3JrdHJlZXMvd29ya3RyZWUtbmFtZVwiXG4gICAgY29uc3QgbWF0Y2ggPSBnaXRDb250ZW50Lm1hdGNoKC9eZ2l0ZGlyOlxccyooLispJC9tKTtcbiAgICBpZiAoIW1hdGNoKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gICAgY29uc3QgZ2l0RGlyUGF0aCA9IG1hdGNoWzFdLnRyaW0oKTtcblxuICAgIC8vIEV4dHJhY3QgdGhlIG1haW4gcmVwb3NpdG9yeSBwYXRoIGZyb20gdGhlIHdvcmt0cmVlIHBhdGhcbiAgICAvLyBGb3JtYXQ6IC9wYXRoL3RvL21haW4vLmdpdC93b3JrdHJlZXMvd29ya3RyZWUtbmFtZVxuICAgIGNvbnN0IHdvcmt0cmVlTWF0Y2ggPSBnaXREaXJQYXRoLm1hdGNoKC9eKC4rKVxcL1xcLmdpdFxcL3dvcmt0cmVlc1xcLy4rJC8pO1xuICAgIGlmICh3b3JrdHJlZU1hdGNoKSB7XG4gICAgICByZXR1cm4gd29ya3RyZWVNYXRjaFsxXTtcbiAgICB9XG5cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59XG5cbi8vIENhY2hlIGZvciBHaXQgaW5mbyB0byBhdm9pZCBjYWxsaW5nIGdpdCBjb21tYW5kcyB0b28gZnJlcXVlbnRseVxuY29uc3QgZ2l0SW5mb0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHsgaW5mbzogR2l0SW5mbzsgdGltZXN0YW1wOiBudW1iZXIgfT4oKTtcbmNvbnN0IENBQ0hFX1RUTCA9IDUwMDA7IC8vIDUgc2Vjb25kc1xuXG4vKipcbiAqIERldGVjdCBHaXQgcmVwb3NpdG9yeSBpbmZvcm1hdGlvbiBmb3IgYSBnaXZlbiBkaXJlY3RvcnlcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRldGVjdEdpdEluZm8od29ya2luZ0Rpcjogc3RyaW5nKTogUHJvbWlzZTxHaXRJbmZvPiB7XG4gIC8vIENoZWNrIGNhY2hlIGZpcnN0XG4gIGNvbnN0IGNhY2hlZCA9IGdpdEluZm9DYWNoZS5nZXQod29ya2luZ0Rpcik7XG4gIGlmIChjYWNoZWQgJiYgRGF0ZS5ub3coKSAtIGNhY2hlZC50aW1lc3RhbXAgPCBDQUNIRV9UVEwpIHtcbiAgICByZXR1cm4gY2FjaGVkLmluZm87XG4gIH1cblxuICB0cnkge1xuICAgIC8vIENoZWNrIGlmIHRoZSBkaXJlY3RvcnkgaXMgaW4gYSBHaXQgcmVwb3NpdG9yeVxuICAgIGNvbnN0IHsgc3Rkb3V0OiByZXBvUGF0aCB9ID0gYXdhaXQgZXhlY0ZpbGUoJ2dpdCcsIFsncmV2LXBhcnNlJywgJy0tc2hvdy10b3BsZXZlbCddLCB7XG4gICAgICBjd2Q6IHdvcmtpbmdEaXIsXG4gICAgICB0aW1lb3V0OiA1MDAwLFxuICAgICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBHSVRfVEVSTUlOQUxfUFJPTVBUOiAnMCcgfSxcbiAgICB9KTtcbiAgICBjb25zdCBnaXRSZXBvUGF0aCA9IHJlcG9QYXRoLnRyaW0oKTtcblxuICAgIC8vIEdldCB0aGUgY3VycmVudCBicmFuY2ggbmFtZVxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHN0ZG91dDogYnJhbmNoIH0gPSBhd2FpdCBleGVjRmlsZSgnZ2l0JywgWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSwge1xuICAgICAgICBjd2Q6IHdvcmtpbmdEaXIsXG4gICAgICAgIHRpbWVvdXQ6IDUwMDAsXG4gICAgICAgIGVudjogeyAuLi5wcm9jZXNzLmVudiwgR0lUX1RFUk1JTkFMX1BST01QVDogJzAnIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IGdpdEJyYW5jaCA9IGJyYW5jaC50cmltKCk7XG5cbiAgICAgIC8vIEdldCBhZGRpdGlvbmFsIEdpdCBzdGF0dXMgaW5mb3JtYXRpb25cbiAgICAgIGxldCBnaXRBaGVhZENvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG4gICAgICBsZXQgZ2l0QmVoaW5kQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBnaXRIYXNDaGFuZ2VzID0gZmFsc2U7XG4gICAgICBsZXQgZ2l0SXNXb3JrdHJlZSA9IGZhbHNlO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIGEgd29ya3RyZWVcbiAgICAgICAgY29uc3QgZ2l0RmlsZSA9IHBhdGguam9pbih3b3JraW5nRGlyLCAnLmdpdCcpO1xuICAgICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnByb21pc2VzLnN0YXQoZ2l0RmlsZSkuY2F0Y2goKCkgPT4gbnVsbCk7XG5cbiAgICAgICAgaWYgKHN0YXRzICYmICFzdGF0cy5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgLy8gLmdpdCBpcyBhIGZpbGUsIG5vdCBhIGRpcmVjdG9yeSAtIHRoaXMgaXMgYSB3b3JrdHJlZVxuICAgICAgICAgIGdpdElzV29ya3RyZWUgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gR2V0IGFoZWFkL2JlaGluZCBjb3VudHNcbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHJldkxpc3QgfSA9IGF3YWl0IGV4ZWNGaWxlKFxuICAgICAgICAgICdnaXQnLFxuICAgICAgICAgIFsncmV2LWxpc3QnLCAnLS1sZWZ0LXJpZ2h0JywgJy0tY291bnQnLCAnSEVBRC4uLkB7dXBzdHJlYW19J10sXG4gICAgICAgICAge1xuICAgICAgICAgICAgY3dkOiB3b3JraW5nRGlyLFxuICAgICAgICAgICAgdGltZW91dDogNTAwMCxcbiAgICAgICAgICAgIGVudjogeyAuLi5wcm9jZXNzLmVudiwgR0lUX1RFUk1JTkFMX1BST01QVDogJzAnIH0sXG4gICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBjb25zdCBbYWhlYWQsIGJlaGluZF0gPSByZXZMaXN0LnRyaW0oKS5zcGxpdCgnXFx0JykubWFwKE51bWJlcik7XG4gICAgICAgIGdpdEFoZWFkQ291bnQgPSBhaGVhZDtcbiAgICAgICAgZ2l0QmVoaW5kQ291bnQgPSBiZWhpbmQ7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gSWdub3JlIGVycm9ycyAtIG1pZ2h0IG5vdCBoYXZlIHVwc3RyZWFtXG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGZvciB1bmNvbW1pdHRlZCBjaGFuZ2VzXG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBleGVjRmlsZSgnZ2l0JywgWydkaWZmLWluZGV4JywgJy0tcXVpZXQnLCAnSEVBRCcsICctLSddLCB7XG4gICAgICAgICAgY3dkOiB3b3JraW5nRGlyLFxuICAgICAgICAgIHRpbWVvdXQ6IDUwMDAsXG4gICAgICAgICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBHSVRfVEVSTUlOQUxfUFJPTVBUOiAnMCcgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIENvbW1hbmQgc3VjY2VlZGVkLCBubyBjaGFuZ2VzXG4gICAgICAgIGdpdEhhc0NoYW5nZXMgPSBmYWxzZTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBDb21tYW5kIGZhaWxlZCwgdGhlcmUgYXJlIGNoYW5nZXNcbiAgICAgICAgZ2l0SGFzQ2hhbmdlcyA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIEdldCBtYWluIHJlcG9zaXRvcnkgcGF0aCBpZiB0aGlzIGlzIGEgd29ya3RyZWVcbiAgICAgIGNvbnN0IGdpdE1haW5SZXBvUGF0aCA9IGdpdElzV29ya3RyZWUgPyBhd2FpdCBnZXRNYWluUmVwb3NpdG9yeVBhdGgod29ya2luZ0RpcikgOiBnaXRSZXBvUGF0aDtcblxuICAgICAgY29uc3QgaW5mbzogR2l0SW5mbyA9IHtcbiAgICAgICAgZ2l0UmVwb1BhdGgsXG4gICAgICAgIGdpdEJyYW5jaCxcbiAgICAgICAgZ2l0QWhlYWRDb3VudCxcbiAgICAgICAgZ2l0QmVoaW5kQ291bnQsXG4gICAgICAgIGdpdEhhc0NoYW5nZXMsXG4gICAgICAgIGdpdElzV29ya3RyZWUsXG4gICAgICAgIGdpdE1haW5SZXBvUGF0aCxcbiAgICAgIH07XG5cbiAgICAgIC8vIFVwZGF0ZSBjYWNoZVxuICAgICAgZ2l0SW5mb0NhY2hlLnNldCh3b3JraW5nRGlyLCB7IGluZm8sIHRpbWVzdGFtcDogRGF0ZS5ub3coKSB9KTtcblxuICAgICAgcmV0dXJuIGluZm87XG4gICAgfSBjYXRjaCAoX2JyYW5jaEVycm9yKSB7XG4gICAgICAvLyBDb3VsZCBiZSBpbiBkZXRhY2hlZCBIRUFEIHN0YXRlIG9yIG90aGVyIHNpdHVhdGlvbiB3aGVyZSBicmFuY2ggbmFtZSBpc24ndCBhdmFpbGFibGVcbiAgICAgIGNvbnN0IGluZm86IEdpdEluZm8gPSB7XG4gICAgICAgIGdpdFJlcG9QYXRoLFxuICAgICAgICBnaXRCcmFuY2g6ICcnLCAvLyBFbXB0eSBicmFuY2ggZm9yIGRldGFjaGVkIEhFQURcbiAgICAgIH07XG5cbiAgICAgIC8vIFVwZGF0ZSBjYWNoZVxuICAgICAgZ2l0SW5mb0NhY2hlLnNldCh3b3JraW5nRGlyLCB7IGluZm8sIHRpbWVzdGFtcDogRGF0ZS5ub3coKSB9KTtcblxuICAgICAgcmV0dXJuIGluZm87XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvLyBOb3QgYSBHaXQgcmVwb3NpdG9yeVxuICAgIGNvbnN0IGluZm86IEdpdEluZm8gPSB7fTtcblxuICAgIC8vIFVwZGF0ZSBjYWNoZVxuICAgIGdpdEluZm9DYWNoZS5zZXQod29ya2luZ0RpciwgeyBpbmZvLCB0aW1lc3RhbXA6IERhdGUubm93KCkgfSk7XG5cbiAgICByZXR1cm4gaW5mbztcbiAgfVxufVxuXG4vKipcbiAqIENsZWFyIHRoZSBHaXQgaW5mbyBjYWNoZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJHaXRJbmZvQ2FjaGUoKTogdm9pZCB7XG4gIGdpdEluZm9DYWNoZS5jbGVhcigpO1xufVxuXG4vKipcbiAqIENsZWFyIGNhY2hlIGVudHJ5IGZvciBhIHNwZWNpZmljIGRpcmVjdG9yeVxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJHaXRJbmZvQ2FjaGVGb3JEaXIod29ya2luZ0Rpcjogc3RyaW5nKTogdm9pZCB7XG4gIGdpdEluZm9DYWNoZS5kZWxldGUod29ya2luZ0Rpcik7XG59XG4iXX0=