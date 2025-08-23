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
exports.installGitHooks = installGitHooks;
exports.uninstallGitHooks = uninstallGitHooks;
exports.areHooksInstalled = areHooksInstalled;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const util_1 = require("util");
const git_error_js_1 = require("./git-error.js");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('git-hooks');
const execFile = (0, util_1.promisify)(require('child_process').execFile);
/**
 * Execute a git command with proper error handling
 */
async function execGit(args, options = {}) {
    try {
        const { stdout, stderr } = await execFile('git', args, {
            cwd: options.cwd || process.cwd(),
            timeout: 5000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        return { stdout: stdout.toString(), stderr: stderr.toString() };
    }
    catch (error) {
        throw (0, git_error_js_1.createGitError)(error, 'Git command failed');
    }
}
/**
 * Get the Git hooks directory for a repository
 */
async function getHooksDirectory(repoPath) {
    try {
        // Check if core.hooksPath is configured
        const { stdout } = await execGit(['config', 'core.hooksPath'], { cwd: repoPath });
        const customPath = stdout.trim();
        if (customPath) {
            // Resolve relative to repo root
            return path.resolve(repoPath, customPath);
        }
    }
    catch {
        // core.hooksPath not set, use default
    }
    // Default hooks directory
    return path.join(repoPath, '.git', 'hooks');
}
/**
 * Create the hook script content
 */
function createHookScript(hookType) {
    return `#!/bin/sh
# VibeTunnel Git hook - ${hookType}
# This hook notifies VibeTunnel when Git events occur

# Check if vt command is available
if command -v vt >/dev/null 2>&1; then
  # Run in background to avoid blocking Git operations
  vt git event &
fi

# Always exit successfully
exit 0
`;
}
/**
 * Install a Git hook with safe chaining
 */
async function installHook(repoPath, hookType) {
    try {
        const hooksDir = await getHooksDirectory(repoPath);
        const hookPath = path.join(hooksDir, hookType);
        const backupPath = `${hookPath}.vtbak`;
        // Ensure hooks directory exists
        await fs.mkdir(hooksDir, { recursive: true });
        // Check if hook already exists
        let existingHook = null;
        try {
            existingHook = await fs.readFile(hookPath, 'utf8');
        }
        catch {
            // Hook doesn't exist yet
        }
        // If hook exists and is already ours, skip
        if (existingHook?.includes('VibeTunnel Git hook')) {
            logger.debug(`${hookType} hook already installed`);
            return { success: true };
        }
        // If hook exists and is not ours, back it up
        if (existingHook) {
            await fs.writeFile(backupPath, existingHook);
            logger.debug(`Backed up existing ${hookType} hook to ${backupPath}`);
        }
        // Create our hook script
        let hookContent = createHookScript(hookType);
        // If there was an existing hook, chain it
        if (existingHook) {
            hookContent = `#!/bin/sh
# VibeTunnel Git hook - ${hookType}
# This hook notifies VibeTunnel when Git events occur

# Check if vt command is available
if command -v vt >/dev/null 2>&1; then
  # Run in background to avoid blocking Git operations
  vt git event &
fi

# Execute the original hook if it exists
if [ -f "${backupPath}" ]; then
  exec "${backupPath}" "$@"
fi

exit 0
`;
        }
        // Write the hook
        await fs.writeFile(hookPath, hookContent);
        // Make it executable
        await fs.chmod(hookPath, 0o755);
        logger.info(`Successfully installed ${hookType} hook`);
        return { success: true, backedUp: !!existingHook };
    }
    catch (error) {
        logger.error(`Failed to install ${hookType} hook:`, error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Uninstall a Git hook and restore backup
 */
async function uninstallHook(repoPath, hookType) {
    try {
        const hooksDir = await getHooksDirectory(repoPath);
        const hookPath = path.join(hooksDir, hookType);
        const backupPath = `${hookPath}.vtbak`;
        // Check if hook exists
        let existingHook = null;
        try {
            existingHook = await fs.readFile(hookPath, 'utf8');
        }
        catch {
            // Hook doesn't exist
            return { success: true };
        }
        // If it's not our hook, leave it alone
        if (!existingHook.includes('VibeTunnel Git hook')) {
            logger.debug(`${hookType} hook is not ours, skipping uninstall`);
            return { success: true };
        }
        // Check if there's a backup to restore
        let hasBackup = false;
        try {
            await fs.access(backupPath);
            hasBackup = true;
        }
        catch {
            // No backup
        }
        if (hasBackup) {
            // Restore the backup
            const backupContent = await fs.readFile(backupPath, 'utf8');
            await fs.writeFile(hookPath, backupContent);
            await fs.chmod(hookPath, 0o755);
            await fs.unlink(backupPath);
            logger.info(`Restored original ${hookType} hook from backup`);
            return { success: true, restored: true };
        }
        else {
            // No backup, just remove our hook
            await fs.unlink(hookPath);
            logger.info(`Removed ${hookType} hook`);
            return { success: true, restored: false };
        }
    }
    catch (error) {
        logger.error(`Failed to uninstall ${hookType} hook:`, error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Install Git hooks for VibeTunnel follow mode
 */
async function installGitHooks(repoPath) {
    logger.info(`Installing Git hooks for repository: ${repoPath}`);
    const results = await Promise.all([
        installHook(repoPath, 'post-commit'),
        installHook(repoPath, 'post-checkout'),
    ]);
    const errors = results
        .filter((r) => !r.success)
        .map((r) => r.error)
        .filter((e) => !!e);
    if (errors.length > 0) {
        return { success: false, errors };
    }
    return { success: true };
}
/**
 * Uninstall Git hooks for VibeTunnel follow mode
 */
async function uninstallGitHooks(repoPath) {
    logger.info(`Uninstalling Git hooks for repository: ${repoPath}`);
    const results = await Promise.all([
        uninstallHook(repoPath, 'post-commit'),
        uninstallHook(repoPath, 'post-checkout'),
    ]);
    const errors = results
        .filter((r) => !r.success)
        .map((r) => r.error)
        .filter((e) => !!e);
    if (errors.length > 0) {
        return { success: false, errors };
    }
    return { success: true };
}
/**
 * Check if Git hooks are installed
 */
async function areHooksInstalled(repoPath) {
    try {
        const hooksDir = await getHooksDirectory(repoPath);
        const hooks = ['post-commit', 'post-checkout'];
        for (const hookType of hooks) {
            const hookPath = path.join(hooksDir, hookType);
            try {
                const content = await fs.readFile(hookPath, 'utf8');
                if (!content.includes('VibeTunnel Git hook')) {
                    return false;
                }
            }
            catch {
                return false;
            }
        }
        return true;
    }
    catch (error) {
        logger.error('Failed to check hook installation:', error);
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LWhvb2tzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9naXQtaG9va3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFtTkEsMENBcUJDO0FBS0QsOENBcUJDO0FBS0QsOENBc0JDO0FBN1JELGdEQUFrQztBQUNsQywyQ0FBNkI7QUFDN0IsK0JBQWlDO0FBQ2pDLGlEQUFnRDtBQUNoRCwyQ0FBMkM7QUFFM0MsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLFdBQVcsQ0FBQyxDQUFDO0FBQ3pDLE1BQU0sUUFBUSxHQUFHLElBQUEsZ0JBQVMsRUFBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7QUFjOUQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsT0FBTyxDQUNwQixJQUFjLEVBQ2QsVUFBNEIsRUFBRTtJQUU5QixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE1BQU0sUUFBUSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUU7WUFDckQsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEdBQUcsRUFBRTtZQUNqQyxPQUFPLEVBQUUsSUFBSTtZQUNiLEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7U0FDbEQsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO0lBQ2xFLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsTUFBTSxJQUFBLDZCQUFjLEVBQUMsS0FBSyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDcEQsQ0FBQztBQUNILENB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Q0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxPQUFPLEtBQUssQ0FBQztZQUNmLENBQUM7UUFDSCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGNyZWF0ZUdpdEVycm9yIH0gZnJvbSAnLi9naXQtZXJyb3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2dpdC1ob29rcycpO1xuY29uc3QgZXhlY0ZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWNGaWxlKTtcblxuaW50ZXJmYWNlIEhvb2tJbnN0YWxsUmVzdWx0IHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIGJhY2tlZFVwPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIEhvb2tVbmluc3RhbGxSZXN1bHQge1xuICBzdWNjZXNzOiBib29sZWFuO1xuICBlcnJvcj86IHN0cmluZztcbiAgcmVzdG9yZWQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEV4ZWN1dGUgYSBnaXQgY29tbWFuZCB3aXRoIHByb3BlciBlcnJvciBoYW5kbGluZ1xuICovXG5hc3luYyBmdW5jdGlvbiBleGVjR2l0KFxuICBhcmdzOiBzdHJpbmdbXSxcbiAgb3B0aW9uczogeyBjd2Q/OiBzdHJpbmcgfSA9IHt9XG4pOiBQcm9taXNlPHsgc3Rkb3V0OiBzdHJpbmc7IHN0ZGVycjogc3RyaW5nIH0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZSgnZ2l0JywgYXJncywge1xuICAgICAgY3dkOiBvcHRpb25zLmN3ZCB8fCBwcm9jZXNzLmN3ZCgpLFxuICAgICAgdGltZW91dDogNTAwMCxcbiAgICAgIGVudjogeyAuLi5wcm9jZXNzLmVudiwgR0lUX1RFUk1JTkFMX1BST01QVDogJzAnIH0sXG4gICAgfSk7XG4gICAgcmV0dXJuIHsgc3Rkb3V0OiBzdGRvdXQudG9TdHJpbmcoKSwgc3RkZXJyOiBzdGRlcnIudG9TdHJpbmcoKSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHRocm93IGNyZWF0ZUdpdEVycm9yKGVycm9yLCAnR2l0IGNvbW1hbmQgZmFpbGVkJyk7XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdGhlIEdpdCBob29rcyBkaXJlY3RvcnkgZm9yIGEgcmVwb3NpdG9yeVxuICovXG5hc3luYyBmdW5jdGlvbiBnZXRIb29rc0RpcmVjdG9yeShyZXBvUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBDaGVjayBpZiBjb3JlLmhvb2tzUGF0aCBpcyBjb25maWd1cmVkXG4gICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydjb25maWcnLCAnY29yZS5ob29rc1BhdGgnXSwgeyBjd2Q6IHJlcG9QYXRoIH0pO1xuICAgIGNvbnN0IGN1c3RvbVBhdGggPSBzdGRvdXQudHJpbSgpO1xuICAgIGlmIChjdXN0b21QYXRoKSB7XG4gICAgICAvLyBSZXNvbHZlIHJlbGF0aXZlIHRvIHJlcG8gcm9vdFxuICAgICAgcmV0dXJuIHBhdGgucmVzb2x2ZShyZXBvUGF0aCwgY3VzdG9tUGF0aCk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvLyBjb3JlLmhvb2tzUGF0aCBub3Qgc2V0LCB1c2UgZGVmYXVsdFxuICB9XG5cbiAgLy8gRGVmYXVsdCBob29rcyBkaXJlY3RvcnlcbiAgcmV0dXJuIHBhdGguam9pbihyZXBvUGF0aCwgJy5naXQnLCAnaG9va3MnKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgdGhlIGhvb2sgc2NyaXB0IGNvbnRlbnRcbiAqL1xuZnVuY3Rpb24gY3JlYXRlSG9va1NjcmlwdChob29rVHlwZTogJ3Bvc3QtY29tbWl0JyB8ICdwb3N0LWNoZWNrb3V0Jyk6IHN0cmluZyB7XG4gIHJldHVybiBgIyEvYmluL3NoXG4jIFZpYmVUdW5uZWwgR2l0IGhvb2sgLSAke2hvb2tUeXBlfVxuIyBUaGlzIGhvb2sgbm90aWZpZXMgVmliZVR1bm5lbCB3aGVuIEdpdCBldmVudHMgb2NjdXJcblxuIyBDaGVjayBpZiB2dCBjb21tYW5kIGlzIGF2YWlsYWJsZVxuaWYgY29tbWFuZCAtdiB2dCA+L2Rldi9udWxsIDI+JjE7IHRoZW5cbiAgIyBSdW4gaW4gYmFja2dyb3VuZCB0byBhdm9pZCBibG9ja2luZyBHaXQgb3BlcmF0aW9uc1xuICB2dCBnaXQgZXZlbnQgJlxuZmlcblxuIyBBbHdheXMgZXhpdCBzdWNjZXNzZnVsbHlcbmV4aXQgMFxuYDtcbn1cblxuLyoqXG4gKiBJbnN0YWxsIGEgR2l0IGhvb2sgd2l0aCBzYWZlIGNoYWluaW5nXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGluc3RhbGxIb29rKFxuICByZXBvUGF0aDogc3RyaW5nLFxuICBob29rVHlwZTogJ3Bvc3QtY29tbWl0JyB8ICdwb3N0LWNoZWNrb3V0J1xuKTogUHJvbWlzZTxIb29rSW5zdGFsbFJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGhvb2tzRGlyID0gYXdhaXQgZ2V0SG9va3NEaXJlY3RvcnkocmVwb1BhdGgpO1xuICAgIGNvbnN0IGhvb2tQYXRoID0gcGF0aC5qb2luKGhvb2tzRGlyLCBob29rVHlwZSk7XG4gICAgY29uc3QgYmFja3VwUGF0aCA9IGAke2hvb2tQYXRofS52dGJha2A7XG5cbiAgICAvLyBFbnN1cmUgaG9va3MgZGlyZWN0b3J5IGV4aXN0c1xuICAgIGF3YWl0IGZzLm1rZGlyKGhvb2tzRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICAgIC8vIENoZWNrIGlmIGhvb2sgYWxyZWFkeSBleGlzdHNcbiAgICBsZXQgZXhpc3RpbmdIb29rOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdIb29rID0gYXdhaXQgZnMucmVhZEZpbGUoaG9va1BhdGgsICd1dGY4Jyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBIb29rIGRvZXNuJ3QgZXhpc3QgeWV0XG4gICAgfVxuXG4gICAgLy8gSWYgaG9vayBleGlzdHMgYW5kIGlzIGFscmVhZHkgb3Vycywgc2tpcFxuICAgIGlmIChleGlzdGluZ0hvb2s/LmluY2x1ZGVzKCdWaWJlVHVubmVsIEdpdCBob29rJykpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgJHtob29rVHlwZX0gaG9vayBhbHJlYWR5IGluc3RhbGxlZGApO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgIH1cblxuICAgIC8vIElmIGhvb2sgZXhpc3RzIGFuZCBpcyBub3Qgb3VycywgYmFjayBpdCB1cFxuICAgIGlmIChleGlzdGluZ0hvb2spIHtcbiAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShiYWNrdXBQYXRoLCBleGlzdGluZ0hvb2spO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBCYWNrZWQgdXAgZXhpc3RpbmcgJHtob29rVHlwZX0gaG9vayB0byAke2JhY2t1cFBhdGh9YCk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIG91ciBob29rIHNjcmlwdFxuICAgIGxldCBob29rQ29udGVudCA9IGNyZWF0ZUhvb2tTY3JpcHQoaG9va1R5cGUpO1xuXG4gICAgLy8gSWYgdGhlcmUgd2FzIGFuIGV4aXN0aW5nIGhvb2ssIGNoYWluIGl0XG4gICAgaWYgKGV4aXN0aW5nSG9vaykge1xuICAgICAgaG9va0NvbnRlbnQgPSBgIyEvYmluL3NoXG4jIFZpYmVUdW5uZWwgR2l0IGhvb2sgLSAke2hvb2tUeXBlfVxuIyBUaGlzIGhvb2sgbm90aWZpZXMgVmliZVR1bm5lbCB3aGVuIEdpdCBldmVudHMgb2NjdXJcblxuIyBDaGVjayBpZiB2dCBjb21tYW5kIGlzIGF2YWlsYWJsZVxuaWYgY29tbWFuZCAtdiB2dCA+L2Rldi9udWxsIDI+JjE7IHRoZW5cbiAgIyBSdW4gaW4gYmFja2dyb3VuZCB0byBhdm9pZCBibG9ja2luZyBHaXQgb3BlcmF0aW9uc1xuICB2dCBnaXQgZXZlbnQgJlxuZmlcblxuIyBFeGVjdXRlIHRoZSBvcmlnaW5hbCBob29rIGlmIGl0IGV4aXN0c1xuaWYgWyAtZiBcIiR7YmFja3VwUGF0aH1cIiBdOyB0aGVuXG4gIGV4ZWMgXCIke2JhY2t1cFBhdGh9XCIgXCIkQFwiXG5maVxuXG5leGl0IDBcbmA7XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgdGhlIGhvb2tcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUoaG9va1BhdGgsIGhvb2tDb250ZW50KTtcblxuICAgIC8vIE1ha2UgaXQgZXhlY3V0YWJsZVxuICAgIGF3YWl0IGZzLmNobW9kKGhvb2tQYXRoLCAwbzc1NSk7XG5cbiAgICBsb2dnZXIuaW5mbyhgU3VjY2Vzc2Z1bGx5IGluc3RhbGxlZCAke2hvb2tUeXBlfSBob29rYCk7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgYmFja2VkVXA6ICEhZXhpc3RpbmdIb29rIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gaW5zdGFsbCAke2hvb2tUeXBlfSBob29rOmAsIGVycm9yKTtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9O1xuICB9XG59XG5cbi8qKlxuICogVW5pbnN0YWxsIGEgR2l0IGhvb2sgYW5kIHJlc3RvcmUgYmFja3VwXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHVuaW5zdGFsbEhvb2soXG4gIHJlcG9QYXRoOiBzdHJpbmcsXG4gIGhvb2tUeXBlOiAncG9zdC1jb21taXQnIHwgJ3Bvc3QtY2hlY2tvdXQnXG4pOiBQcm9taXNlPEhvb2tVbmluc3RhbGxSZXN1bHQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBob29rc0RpciA9IGF3YWl0IGdldEhvb2tzRGlyZWN0b3J5KHJlcG9QYXRoKTtcbiAgICBjb25zdCBob29rUGF0aCA9IHBhdGguam9pbihob29rc0RpciwgaG9va1R5cGUpO1xuICAgIGNvbnN0IGJhY2t1cFBhdGggPSBgJHtob29rUGF0aH0udnRiYWtgO1xuXG4gICAgLy8gQ2hlY2sgaWYgaG9vayBleGlzdHNcbiAgICBsZXQgZXhpc3RpbmdIb29rOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgZXhpc3RpbmdIb29rID0gYXdhaXQgZnMucmVhZEZpbGUoaG9va1BhdGgsICd1dGY4Jyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBIb29rIGRvZXNuJ3QgZXhpc3RcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcbiAgICB9XG5cbiAgICAvLyBJZiBpdCdzIG5vdCBvdXIgaG9vaywgbGVhdmUgaXQgYWxvbmVcbiAgICBpZiAoIWV4aXN0aW5nSG9vay5pbmNsdWRlcygnVmliZVR1bm5lbCBHaXQgaG9vaycpKSB7XG4gICAgICBsb2dnZXIuZGVidWcoYCR7aG9va1R5cGV9IGhvb2sgaXMgbm90IG91cnMsIHNraXBwaW5nIHVuaW5zdGFsbGApO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZXJlJ3MgYSBiYWNrdXAgdG8gcmVzdG9yZVxuICAgIGxldCBoYXNCYWNrdXAgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZnMuYWNjZXNzKGJhY2t1cFBhdGgpO1xuICAgICAgaGFzQmFja3VwID0gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIE5vIGJhY2t1cFxuICAgIH1cblxuICAgIGlmIChoYXNCYWNrdXApIHtcbiAgICAgIC8vIFJlc3RvcmUgdGhlIGJhY2t1cFxuICAgICAgY29uc3QgYmFja3VwQ29udGVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKGJhY2t1cFBhdGgsICd1dGY4Jyk7XG4gICAgICBhd2FpdCBmcy53cml0ZUZpbGUoaG9va1BhdGgsIGJhY2t1cENvbnRlbnQpO1xuICAgICAgYXdhaXQgZnMuY2htb2QoaG9va1BhdGgsIDBvNzU1KTtcbiAgICAgIGF3YWl0IGZzLnVubGluayhiYWNrdXBQYXRoKTtcbiAgICAgIGxvZ2dlci5pbmZvKGBSZXN0b3JlZCBvcmlnaW5hbCAke2hvb2tUeXBlfSBob29rIGZyb20gYmFja3VwYCk7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCByZXN0b3JlZDogdHJ1ZSB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBObyBiYWNrdXAsIGp1c3QgcmVtb3ZlIG91ciBob29rXG4gICAgICBhd2FpdCBmcy51bmxpbmsoaG9va1BhdGgpO1xuICAgICAgbG9nZ2VyLmluZm8oYFJlbW92ZWQgJHtob29rVHlwZX0gaG9va2ApO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcmVzdG9yZWQ6IGZhbHNlIH07XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHVuaW5zdGFsbCAke2hvb2tUeXBlfSBob29rOmAsIGVycm9yKTtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9O1xuICB9XG59XG5cbi8qKlxuICogSW5zdGFsbCBHaXQgaG9va3MgZm9yIFZpYmVUdW5uZWwgZm9sbG93IG1vZGVcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGluc3RhbGxHaXRIb29rcyhyZXBvUGF0aDogc3RyaW5nKTogUHJvbWlzZTx7XG4gIHN1Y2Nlc3M6IGJvb2xlYW47XG4gIGVycm9ycz86IHN0cmluZ1tdO1xufT4ge1xuICBsb2dnZXIuaW5mbyhgSW5zdGFsbGluZyBHaXQgaG9va3MgZm9yIHJlcG9zaXRvcnk6ICR7cmVwb1BhdGh9YCk7XG5cbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBpbnN0YWxsSG9vayhyZXBvUGF0aCwgJ3Bvc3QtY29tbWl0JyksXG4gICAgaW5zdGFsbEhvb2socmVwb1BhdGgsICdwb3N0LWNoZWNrb3V0JyksXG4gIF0pO1xuXG4gIGNvbnN0IGVycm9ycyA9IHJlc3VsdHNcbiAgICAuZmlsdGVyKChyKSA9PiAhci5zdWNjZXNzKVxuICAgIC5tYXAoKHIpID0+IHIuZXJyb3IpXG4gICAgLmZpbHRlcigoZSk6IGUgaXMgc3RyaW5nID0+ICEhZSk7XG5cbiAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9ycyB9O1xuICB9XG5cbiAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xufVxuXG4vKipcbiAqIFVuaW5zdGFsbCBHaXQgaG9va3MgZm9yIFZpYmVUdW5uZWwgZm9sbG93IG1vZGVcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVuaW5zdGFsbEdpdEhvb2tzKHJlcG9QYXRoOiBzdHJpbmcpOiBQcm9taXNlPHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgZXJyb3JzPzogc3RyaW5nW107XG59PiB7XG4gIGxvZ2dlci5pbmZvKGBVbmluc3RhbGxpbmcgR2l0IGhvb2tzIGZvciByZXBvc2l0b3J5OiAke3JlcG9QYXRofWApO1xuXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgdW5pbnN0YWxsSG9vayhyZXBvUGF0aCwgJ3Bvc3QtY29tbWl0JyksXG4gICAgdW5pbnN0YWxsSG9vayhyZXBvUGF0aCwgJ3Bvc3QtY2hlY2tvdXQnKSxcbiAgXSk7XG5cbiAgY29uc3QgZXJyb3JzID0gcmVzdWx0c1xuICAgIC5maWx0ZXIoKHIpID0+ICFyLnN1Y2Nlc3MpXG4gICAgLm1hcCgocikgPT4gci5lcnJvcilcbiAgICAuZmlsdGVyKChlKTogZSBpcyBzdHJpbmcgPT4gISFlKTtcblxuICBpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JzIH07XG4gIH1cblxuICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgR2l0IGhvb2tzIGFyZSBpbnN0YWxsZWRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFyZUhvb2tzSW5zdGFsbGVkKHJlcG9QYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBob29rc0RpciA9IGF3YWl0IGdldEhvb2tzRGlyZWN0b3J5KHJlcG9QYXRoKTtcbiAgICBjb25zdCBob29rcyA9IFsncG9zdC1jb21taXQnLCAncG9zdC1jaGVja291dCddO1xuXG4gICAgZm9yIChjb25zdCBob29rVHlwZSBvZiBob29rcykge1xuICAgICAgY29uc3QgaG9va1BhdGggPSBwYXRoLmpvaW4oaG9va3NEaXIsIGhvb2tUeXBlKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZShob29rUGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgaWYgKCFjb250ZW50LmluY2x1ZGVzKCdWaWJlVHVubmVsIEdpdCBob29rJykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gY2hlY2sgaG9vayBpbnN0YWxsYXRpb246JywgZXJyb3IpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuIl19