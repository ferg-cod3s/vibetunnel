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
exports.createWorktreeRoutes = createWorktreeRoutes;
const express_1 = require("express");
const path = __importStar(require("path"));
const util_1 = require("util");
const git_error_js_1 = require("../utils/git-error.js");
const git_hooks_js_1 = require("../utils/git-hooks.js");
const logger_js_1 = require("../utils/logger.js");
const control_protocol_js_1 = require("../websocket/control-protocol.js");
const control_unix_handler_js_1 = require("../websocket/control-unix-handler.js");
const logger = (0, logger_js_1.createLogger)('worktree-routes');
const execFile = (0, util_1.promisify)(require('child_process').execFile);
/**
 * Execute a git command with proper error handling and security
 * @param args Git command arguments
 * @param options Execution options
 * @returns Command output
 */
async function execGit(args, options = {}) {
    try {
        const { stdout, stderr } = await execFile('git', args, {
            cwd: options.cwd || process.cwd(),
            timeout: options.timeout || 10000, // 10s for potentially slow operations
            maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // Disable git prompts
        });
        return { stdout: stdout.toString(), stderr: stderr.toString() };
    }
    catch (error) {
        // Re-throw with more context
        throw (0, git_error_js_1.createGitError)(error, 'Git command failed');
    }
}
/**
 * Detect the repository's default branch
 * @param repoPath Repository path
 * @returns Default branch name
 */
async function detectDefaultBranch(repoPath) {
    try {
        // Try to get the default branch from origin
        const { stdout } = await execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], {
            cwd: repoPath,
        });
        // Output format: refs/remotes/origin/main
        const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
        if (match) {
            return match[1];
        }
    }
    catch (_error) {
        logger.debug('Could not detect default branch from origin');
    }
    // Fallback: check if main exists
    try {
        await execGit(['rev-parse', '--verify', 'main'], { cwd: repoPath });
        return 'main';
    }
    catch {
        // Fallback to master
        return 'master';
    }
}
/**
 * Parse git worktree list --porcelain output
 * @param output Git command output
 * @returns Parsed worktrees
 */
function parseWorktreePorcelain(output) {
    const worktrees = [];
    const lines = output.trim().split('\n');
    let current = null;
    for (const line of lines) {
        if (line === '') {
            if (current?.path && current.HEAD) {
                worktrees.push({
                    path: current.path,
                    branch: current.branch || 'HEAD',
                    HEAD: current.HEAD,
                    detached: current.detached || false,
                    prunable: current.prunable,
                    locked: current.locked,
                    lockedReason: current.lockedReason,
                });
            }
            current = null;
            continue;
        }
        const [key, ...valueParts] = line.split(' ');
        const value = valueParts.join(' ');
        if (key === 'worktree') {
            current = { path: value };
        }
        else if (current) {
            switch (key) {
                case 'HEAD':
                    current.HEAD = value;
                    break;
                case 'branch':
                    current.branch = value;
                    break;
                case 'detached':
                    current.detached = true;
                    break;
                case 'prunable':
                    current.prunable = true;
                    break;
                case 'locked':
                    current.locked = true;
                    if (value) {
                        current.lockedReason = value;
                    }
                    break;
            }
        }
    }
    // Handle last worktree if no trailing newline
    if (current?.path && current.HEAD) {
        worktrees.push({
            path: current.path,
            branch: current.branch || 'HEAD',
            HEAD: current.HEAD,
            detached: current.detached || false,
            prunable: current.prunable,
            locked: current.locked,
            lockedReason: current.lockedReason,
        });
    }
    return worktrees;
}
/**
 * Get commit and diff stats for a branch
 * @param repoPath Repository path
 * @param branch Branch name
 * @param baseBranch Base branch to compare against
 * @returns Stats
 */
async function getBranchStats(repoPath, branch, baseBranch) {
    const stats = {
        commitsAhead: 0,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
    };
    try {
        // Get commit count
        const { stdout: commitCount } = await execGit(['rev-list', '--count', `${baseBranch}...${branch}`], { cwd: repoPath });
        stats.commitsAhead = Number.parseInt(commitCount.trim()) || 0;
    }
    catch (error) {
        logger.debug(`Could not get commit count for ${branch}: ${error}`);
    }
    try {
        // Get diff stats
        const { stdout: diffStat } = await execGit(['diff', '--shortstat', `${baseBranch}...${branch}`], { cwd: repoPath });
        // Parse output like: "3 files changed, 10 insertions(+), 5 deletions(-)"
        const match = diffStat.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
        if (match) {
            stats.filesChanged = Number.parseInt(match[1]) || 0;
            stats.insertions = Number.parseInt(match[2]) || 0;
            stats.deletions = Number.parseInt(match[3]) || 0;
        }
    }
    catch (error) {
        logger.debug(`Could not get diff stats for ${branch}: ${error}`);
    }
    return stats;
}
/**
 * Check if a worktree has uncommitted changes
 * @param worktreePath Worktree path
 * @returns True if there are uncommitted changes
 */
async function hasUncommittedChanges(worktreePath) {
    try {
        const { stdout } = await execGit(['status', '--porcelain'], { cwd: worktreePath });
        return stdout.trim().length > 0;
    }
    catch (error) {
        logger.debug(`Could not check uncommitted changes for ${worktreePath}: ${error}`);
        return false;
    }
}
/**
 * Slugify branch name for directory naming
 * @param branch Branch name
 * @returns Slugified name
 */
function _slugifyBranch(branch) {
    return branch
        .replace(/\//g, '-')
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .toLowerCase();
}
/**
 * Create worktree management routes
 */
function createWorktreeRoutes() {
    const router = (0, express_1.Router)();
    /**
     * GET /api/worktrees
     * List all worktrees with extended information
     */
    router.get('/worktrees', async (req, res) => {
        try {
            const { repoPath } = req.query;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath parameter',
                });
            }
            const absoluteRepoPath = path.resolve(repoPath);
            logger.debug(`Listing worktrees for repo: ${absoluteRepoPath}`);
            // Detect default branch
            const baseBranch = await detectDefaultBranch(absoluteRepoPath);
            logger.debug(`Using base branch: ${baseBranch}`);
            // Get follow worktree if configured
            let followBranch;
            try {
                const { stdout } = await execGit(['config', 'vibetunnel.followWorktree'], {
                    cwd: absoluteRepoPath,
                });
                const followWorktreePath = stdout.trim();
                if (followWorktreePath) {
                    // Find the branch for this worktree path - we need to parse worktrees first
                    // This is a bit of a circular dependency, so let's get minimal worktree info
                    const { stdout: worktreeListOutput } = await execGit(['worktree', 'list', '--porcelain'], {
                        cwd: absoluteRepoPath,
                    });
                    const allWorktrees = parseWorktreePorcelain(worktreeListOutput);
                    const followWorktree = allWorktrees.find((w) => w.path === followWorktreePath);
                    if (followWorktree) {
                        followBranch = followWorktree.branch.replace(/^refs\/heads\//, '');
                    }
                }
            }
            catch {
                // No follow worktree configured
            }
            // Get worktree list
            const { stdout } = await execGit(['worktree', 'list', '--porcelain'], {
                cwd: absoluteRepoPath,
            });
            const allWorktrees = parseWorktreePorcelain(stdout);
            // Enrich all worktrees with additional stats (including main repository)
            const enrichedWorktrees = await Promise.all(allWorktrees.map(async (worktree) => {
                // Skip stats for detached HEAD
                if (worktree.detached || !worktree.branch) {
                    return worktree;
                }
                // Get branch stats
                const stats = await getBranchStats(worktree.path, worktree.branch, baseBranch);
                // Check for uncommitted changes
                const hasChanges = await hasUncommittedChanges(worktree.path);
                return {
                    ...worktree,
                    ...stats,
                    stats, // Also include stats as a nested object for compatibility
                    hasUncommittedChanges: hasChanges,
                };
            }));
            return res.json({
                worktrees: enrichedWorktrees,
                baseBranch,
                followBranch,
            });
        }
        catch (error) {
            logger.error('Error listing worktrees:', error);
            const gitError = error;
            // Check if it's a "not a git repository" error or git not found
            if (gitError.code === 'ENOENT' || gitError.stderr?.includes('not a git repository')) {
                // Return empty worktrees list for non-git directories or when git is not available
                return res.json({
                    worktrees: [],
                    baseBranch: 'main',
                    followBranch: undefined,
                });
            }
            return res.status(500).json({
                error: 'Failed to list worktrees',
                details: gitError.stderr || gitError.message,
            });
        }
    });
    /**
     * DELETE /api/worktrees/:branch
     * Remove a worktree
     */
    router.delete('/worktrees/:branch', async (req, res) => {
        try {
            const { branch } = req.params;
            const { repoPath, force } = req.query;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath parameter',
                });
            }
            const absoluteRepoPath = path.resolve(repoPath);
            const forceDelete = force === 'true';
            logger.debug(`Removing worktree for branch: ${branch}, force: ${forceDelete}`);
            // First, find the worktree path for this branch
            const { stdout: listOutput } = await execGit(['worktree', 'list', '--porcelain'], {
                cwd: absoluteRepoPath,
            });
            const worktrees = parseWorktreePorcelain(listOutput);
            const worktree = worktrees.find((w) => {
                // Match against both the full ref path and the short branch name
                const shortBranch = w.branch?.replace(/^refs\/heads\//, '');
                return w.branch === `refs/heads/${branch}` || shortBranch === branch || w.branch === branch;
            });
            if (!worktree) {
                return res.status(404).json({
                    error: `Worktree for branch '${branch}' not found`,
                });
            }
            // Check for uncommitted changes if not forcing
            if (!forceDelete) {
                const hasChanges = await hasUncommittedChanges(worktree.path);
                if (hasChanges) {
                    return res.status(409).json({
                        error: 'Worktree has uncommitted changes',
                        worktreePath: worktree.path,
                    });
                }
            }
            // Remove the worktree
            const removeArgs = ['worktree', 'remove'];
            if (forceDelete) {
                removeArgs.push('--force');
            }
            removeArgs.push(worktree.path);
            await execGit(removeArgs, { cwd: absoluteRepoPath });
            logger.info(`Successfully removed worktree: ${worktree.path}`);
            return res.json({
                success: true,
                message: 'Worktree removed successfully',
                removedPath: worktree.path,
            });
        }
        catch (error) {
            logger.error('Error removing worktree:', error);
            const gitError = error;
            return res.status(500).json({
                error: 'Failed to remove worktree',
                details: gitError.stderr || gitError.message,
            });
        }
    });
    /**
     * POST /api/worktrees/prune
     * Prune worktree information
     */
    router.post('/worktrees/prune', async (req, res) => {
        try {
            const { repoPath } = req.body;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath in request body',
                });
            }
            const absoluteRepoPath = path.resolve(repoPath);
            logger.debug(`Pruning worktrees for repo: ${absoluteRepoPath}`);
            const { stdout, stderr } = await execGit(['worktree', 'prune'], { cwd: absoluteRepoPath });
            logger.info('Successfully pruned worktree information');
            return res.json({
                success: true,
                message: 'Worktree information pruned successfully',
                output: stdout || stderr || 'No output',
                pruned: stdout || stderr || '',
            });
        }
        catch (error) {
            logger.error('Error pruning worktrees:', error);
            const gitError = error;
            return res.status(500).json({
                error: 'Failed to prune worktrees',
                details: gitError.stderr || gitError.message,
            });
        }
    });
    /**
     * POST /api/worktrees
     * Create a new worktree
     */
    router.post('/worktrees', async (req, res) => {
        try {
            const { repoPath, branch, path: worktreePath, baseBranch } = req.body;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath in request body',
                });
            }
            if (!branch || typeof branch !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid branch in request body',
                });
            }
            if (!worktreePath || typeof worktreePath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid path in request body',
                });
            }
            const absoluteRepoPath = path.resolve(repoPath);
            const absoluteWorktreePath = path.resolve(worktreePath);
            logger.debug(`Creating worktree for branch: ${branch} at path: ${absoluteWorktreePath}`);
            // Create the worktree
            const createArgs = ['worktree', 'add'];
            // If baseBranch is provided, create new branch from it
            if (baseBranch) {
                createArgs.push('-b', branch, absoluteWorktreePath, baseBranch);
            }
            else {
                // Otherwise just checkout existing branch
                createArgs.push(absoluteWorktreePath, branch);
            }
            await execGit(createArgs, { cwd: absoluteRepoPath });
            logger.info(`Successfully created worktree at: ${absoluteWorktreePath}`);
            return res.json({
                message: 'Worktree created successfully',
                worktreePath: absoluteWorktreePath,
                branch,
            });
        }
        catch (error) {
            logger.error('Error creating worktree:', error);
            const gitError = error;
            return res.status(500).json({
                error: 'Failed to create worktree',
                details: gitError.stderr || gitError.message,
            });
        }
    });
    /**
     * POST /api/worktrees/follow
     * Enable or disable follow mode for a branch
     */
    router.post('/worktrees/follow', async (req, res) => {
        try {
            const { repoPath, branch, enable } = req.body;
            if (!repoPath || typeof repoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath in request body',
                });
            }
            if (typeof enable !== 'boolean') {
                return res.status(400).json({
                    error: 'Missing or invalid enable flag in request body',
                });
            }
            // Branch is only required when enabling follow mode
            if (enable && (!branch || typeof branch !== 'string')) {
                return res.status(400).json({
                    error: 'Missing or invalid branch in request body',
                });
            }
            const absoluteRepoPath = path.resolve(repoPath);
            logger.debug(`${enable ? 'Enabling' : 'Disabling'} follow mode${branch ? ` for branch: ${branch}` : ''}`);
            if (enable) {
                // Check if Git hooks are already installed
                const hooksAlreadyInstalled = await (0, git_hooks_js_1.areHooksInstalled)(absoluteRepoPath);
                logger.debug(`Git hooks installed: ${hooksAlreadyInstalled}`);
                let hooksInstallResult = null;
                if (!hooksAlreadyInstalled) {
                    // Install Git hooks
                    logger.info('Installing Git hooks for follow mode');
                    const installResult = await (0, git_hooks_js_1.installGitHooks)(absoluteRepoPath);
                    hooksInstallResult = installResult;
                    if (!installResult.success) {
                        logger.error('Failed to install Git hooks:', installResult.errors);
                        return res.status(500).json({
                            error: 'Failed to install Git hooks',
                            details: installResult.errors,
                        });
                    }
                    logger.info('Git hooks installed successfully');
                }
                // Get worktree information to find the path for this branch
                const { stdout: worktreeListOutput } = await execGit(['worktree', 'list', '--porcelain'], {
                    cwd: absoluteRepoPath,
                });
                const allWorktrees = parseWorktreePorcelain(worktreeListOutput);
                const worktree = allWorktrees.find((w) => w.branch === branch ||
                    w.branch === `refs/heads/${branch}` ||
                    w.branch.replace(/^refs\/heads\//, '') === branch);
                if (!worktree) {
                    return res.status(400).json({
                        error: `No worktree found for branch: ${branch}`,
                    });
                }
                // Set the follow worktree path (not branch name)
                await execGit(['config', '--local', 'vibetunnel.followWorktree', worktree.path], {
                    cwd: absoluteRepoPath,
                });
                logger.info(`Follow mode enabled for branch: ${branch}`);
                // Immediately sync main repository to the followed branch
                try {
                    // Strip refs/heads/ prefix if present
                    const cleanBranch = branch.replace(/^refs\/heads\//, '');
                    // Check if the branch exists locally
                    const { stdout: branchList } = await execGit(['branch', '--list', cleanBranch], {
                        cwd: absoluteRepoPath,
                    });
                    if (branchList.trim()) {
                        // Branch exists locally, switch to it
                        await execGit(['checkout', cleanBranch], { cwd: absoluteRepoPath });
                        logger.info(`Main repository switched to branch: ${cleanBranch}`);
                    }
                    else {
                        // Branch doesn't exist locally, try to fetch and create it
                        try {
                            await execGit(['fetch', 'origin', `${cleanBranch}:${cleanBranch}`], {
                                cwd: absoluteRepoPath,
                            });
                            await execGit(['checkout', cleanBranch], { cwd: absoluteRepoPath });
                            logger.info(`Fetched and switched to branch: ${cleanBranch}`);
                        }
                        catch (error) {
                            logger.warn(`Could not fetch/switch to branch ${cleanBranch}:`, error);
                            // Don't fail follow mode enable if branch switch fails
                        }
                    }
                }
                catch (error) {
                    logger.warn(`Could not immediately switch to branch ${branch}:`, error);
                    // Don't fail follow mode enable if branch switch fails
                }
                // Send notification to Mac app
                if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                    const notification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', {
                        level: 'info',
                        title: 'Follow Mode Enabled',
                        message: `Now following branch '${branch}' in ${path.basename(absoluteRepoPath)}`,
                    });
                    control_unix_handler_js_1.controlUnixHandler.sendToMac(notification);
                }
                return res.json({
                    success: true,
                    enabled: true,
                    message: 'Follow mode enabled',
                    branch,
                    hooksInstalled: true,
                    hooksInstallResult: hooksInstallResult,
                });
            }
            else {
                // Unset the follow worktree config
                await execGit(['config', '--local', '--unset', 'vibetunnel.followWorktree'], {
                    cwd: absoluteRepoPath,
                });
                // Uninstall Git hooks when disabling follow mode
                logger.info('Uninstalling Git hooks');
                const uninstallResult = await (0, git_hooks_js_1.uninstallGitHooks)(absoluteRepoPath);
                if (!uninstallResult.success) {
                    logger.warn('Failed to uninstall some Git hooks:', uninstallResult.errors);
                    // Continue anyway - follow mode is still disabled
                }
                else {
                    logger.info('Git hooks uninstalled successfully');
                }
                logger.info('Follow mode disabled');
                // Send notification to Mac app
                if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                    const notification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', {
                        level: 'info',
                        title: 'Follow Mode Disabled',
                        message: `Follow mode has been disabled for ${path.basename(absoluteRepoPath)}`,
                    });
                    control_unix_handler_js_1.controlUnixHandler.sendToMac(notification);
                }
                return res.json({
                    success: true,
                    enabled: false,
                    message: 'Follow mode disabled',
                    branch,
                });
            }
        }
        catch (error) {
            // Ignore error if config key doesn't exist when unsetting
            if ((0, git_error_js_1.isGitConfigNotFoundError)(error) && !req.body.enable) {
                logger.debug('Follow mode was already disabled');
                return res.json({
                    success: true,
                    enabled: false,
                    message: 'Follow mode disabled',
                });
            }
            logger.error('Error managing follow mode:', error);
            const gitError = error;
            return res.status(500).json({
                error: 'Failed to manage follow mode',
                details: gitError.stderr || gitError.message,
            });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3RyZWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvd29ya3RyZWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBcVBBLG9EQWdkQztBQXJzQkQscUNBQWlDO0FBQ2pDLDJDQUE2QjtBQUM3QiwrQkFBaUM7QUFDakMsd0RBQWdHO0FBQ2hHLHdEQUE4RjtBQUM5RixrREFBa0Q7QUFDbEQsMEVBQXNFO0FBQ3RFLGtGQUEwRTtBQUUxRSxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBeUI5RDs7Ozs7R0FLRztBQUNILEtBQUssVUFBVSxPQUFPLENBQ3BCLElBQWMsRUFDZCxVQUE4QyxFQUFFO0lBRWhELElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxRQUFRLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRTtZQUNyRCxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQ2pDLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLEtBQUssRUFBRSxzQ0FBc0M7WUFDekUsU0FBUyxFQUFFLEVBQUUsR0FBRyxJQUFJLEdBQUcsSUFBSSxFQUFFLHVCQUF1QjtZQUNwRCxHQUFHLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLEVBQUUsc0JBQXNCO1NBQzFFLENBQUMsQ0FBQztRQUNILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsUUFBUSxF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Q0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLEtBQUssRUFBRSw4QkFBOEI7Z0JBQ3JDLE9BQU8sRUFBRSxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxPQUFPO2FBQzdDLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGNyZWF0ZUdpdEVycm9yLCB0eXBlIEdpdEVycm9yLCBpc0dpdENvbmZpZ05vdEZvdW5kRXJyb3IgfSBmcm9tICcuLi91dGlscy9naXQtZXJyb3IuanMnO1xuaW1wb3J0IHsgYXJlSG9va3NJbnN0YWxsZWQsIGluc3RhbGxHaXRIb29rcywgdW5pbnN0YWxsR2l0SG9va3MgfSBmcm9tICcuLi91dGlscy9naXQtaG9va3MuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbnRyb2xFdmVudCB9IGZyb20gJy4uL3dlYnNvY2tldC9jb250cm9sLXByb3RvY29sLmpzJztcbmltcG9ydCB7IGNvbnRyb2xVbml4SGFuZGxlciB9IGZyb20gJy4uL3dlYnNvY2tldC9jb250cm9sLXVuaXgtaGFuZGxlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignd29ya3RyZWUtcm91dGVzJyk7XG5jb25zdCBleGVjRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuZXhlY0ZpbGUpO1xuXG5pbnRlcmZhY2UgV29ya3RyZWUge1xuICBwYXRoOiBzdHJpbmc7XG4gIGJyYW5jaDogc3RyaW5nO1xuICBIRUFEOiBzdHJpbmc7XG4gIGRldGFjaGVkOiBib29sZWFuO1xuICBwcnVuYWJsZT86IGJvb2xlYW47XG4gIGxvY2tlZD86IGJvb2xlYW47XG4gIGxvY2tlZFJlYXNvbj86IHN0cmluZztcbiAgLy8gRXh0ZW5kZWQgc3RhdHNcbiAgY29tbWl0c0FoZWFkPzogbnVtYmVyO1xuICBmaWxlc0NoYW5nZWQ/OiBudW1iZXI7XG4gIGluc2VydGlvbnM/OiBudW1iZXI7XG4gIGRlbGV0aW9ucz86IG51bWJlcjtcbiAgaGFzVW5jb21taXR0ZWRDaGFuZ2VzPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFdvcmt0cmVlU3RhdHMge1xuICBjb21taXRzQWhlYWQ6IG51bWJlcjtcbiAgZmlsZXNDaGFuZ2VkOiBudW1iZXI7XG4gIGluc2VydGlvbnM6IG51bWJlcjtcbiAgZGVsZXRpb25zOiBudW1iZXI7XG59XG5cbi8qKlxuICogRXhlY3V0ZSBhIGdpdCBjb21tYW5kIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nIGFuZCBzZWN1cml0eVxuICogQHBhcmFtIGFyZ3MgR2l0IGNvbW1hbmQgYXJndW1lbnRzXG4gKiBAcGFyYW0gb3B0aW9ucyBFeGVjdXRpb24gb3B0aW9uc1xuICogQHJldHVybnMgQ29tbWFuZCBvdXRwdXRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY0dpdChcbiAgYXJnczogc3RyaW5nW10sXG4gIG9wdGlvbnM6IHsgY3dkPzogc3RyaW5nOyB0aW1lb3V0PzogbnVtYmVyIH0gPSB7fVxuKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZyB9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGUoJ2dpdCcsIGFyZ3MsIHtcbiAgICAgIGN3ZDogb3B0aW9ucy5jd2QgfHwgcHJvY2Vzcy5jd2QoKSxcbiAgICAgIHRpbWVvdXQ6IG9wdGlvbnMudGltZW91dCB8fCAxMDAwMCwgLy8gMTBzIGZvciBwb3RlbnRpYWxseSBzbG93IG9wZXJhdGlvbnNcbiAgICAgIG1heEJ1ZmZlcjogMTAgKiAxMDI0ICogMTAyNCwgLy8gMTBNQiBmb3IgbGFyZ2UgZGlmZnNcbiAgICAgIGVudjogeyAuLi5wcm9jZXNzLmVudiwgR0lUX1RFUk1JTkFMX1BST01QVDogJzAnIH0sIC8vIERpc2FibGUgZ2l0IHByb21wdHNcbiAgICB9KTtcbiAgICByZXR1cm4geyBzdGRvdXQ6IHN0ZG91dC50b1N0cmluZygpLCBzdGRlcnI6IHN0ZGVyci50b1N0cmluZygpIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gUmUtdGhyb3cgd2l0aCBtb3JlIGNvbnRleHRcbiAgICB0aHJvdyBjcmVhdGVHaXRFcnJvcihlcnJvciwgJ0dpdCBjb21tYW5kIGZhaWxlZCcpO1xuICB9XG59XG5cbi8qKlxuICogRGV0ZWN0IHRoZSByZXBvc2l0b3J5J3MgZGVmYXVsdCBicmFuY2hcbiAqIEBwYXJhbSByZXBvUGF0aCBSZXBvc2l0b3J5IHBhdGhcbiAqIEByZXR1cm5zIERlZmF1bHQgYnJhbmNoIG5hbWVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZGV0ZWN0RGVmYXVsdEJyYW5jaChyZXBvUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBUcnkgdG8gZ2V0IHRoZSBkZWZhdWx0IGJyYW5jaCBmcm9tIG9yaWdpblxuICAgIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBleGVjR2l0KFsnc3ltYm9saWMtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCddLCB7XG4gICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgIH0pO1xuICAgIC8vIE91dHB1dCBmb3JtYXQ6IHJlZnMvcmVtb3Rlcy9vcmlnaW4vbWFpblxuICAgIGNvbnN0IG1hdGNoID0gc3Rkb3V0LnRyaW0oKS5tYXRjaCgvcmVmc1xcL3JlbW90ZXNcXC9vcmlnaW5cXC8oLispJC8pO1xuICAgIGlmIChtYXRjaCkge1xuICAgICAgcmV0dXJuIG1hdGNoWzFdO1xuICAgIH1cbiAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgbG9nZ2VyLmRlYnVnKCdDb3VsZCBub3QgZGV0ZWN0IGRlZmF1bHQgYnJhbmNoIGZyb20gb3JpZ2luJyk7XG4gIH1cblxuICAvLyBGYWxsYmFjazogY2hlY2sgaWYgbWFpbiBleGlzdHNcbiAgdHJ5IHtcbiAgICBhd2FpdCBleGVjR2l0KFsncmV2LXBhcnNlJywgJy0tdmVyaWZ5JywgJ21haW4nXSwgeyBjd2Q6IHJlcG9QYXRoIH0pO1xuICAgIHJldHVybiAnbWFpbic7XG4gIH0gY2F0Y2gge1xuICAgIC8vIEZhbGxiYWNrIHRvIG1hc3RlclxuICAgIHJldHVybiAnbWFzdGVyJztcbiAgfVxufVxuXG4vKipcbiAqIFBhcnNlIGdpdCB3b3JrdHJlZSBsaXN0IC0tcG9yY2VsYWluIG91dHB1dFxuICogQHBhcmFtIG91dHB1dCBHaXQgY29tbWFuZCBvdXRwdXRcbiAqIEByZXR1cm5zIFBhcnNlZCB3b3JrdHJlZXNcbiAqL1xuZnVuY3Rpb24gcGFyc2VXb3JrdHJlZVBvcmNlbGFpbihvdXRwdXQ6IHN0cmluZyk6IFdvcmt0cmVlW10ge1xuICBjb25zdCB3b3JrdHJlZXM6IFdvcmt0cmVlW10gPSBbXTtcbiAgY29uc3QgbGluZXMgPSBvdXRwdXQudHJpbSgpLnNwbGl0KCdcXG4nKTtcblxuICBsZXQgY3VycmVudDogUGFydGlhbDxXb3JrdHJlZT4gfCBudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBpZiAobGluZSA9PT0gJycpIHtcbiAgICAgIGlmIChjdXJyZW50Py5wYXRoICYmIGN1cnJlbnQuSEVBRCkge1xuICAgICAgICB3b3JrdHJlZXMucHVzaCh7XG4gICAgICAgICAgcGF0aDogY3VycmVudC5wYXRoLFxuICAgICAgICAgIGJyYW5jaDogY3VycmVudC5icmFuY2ggfHwgJ0hFQUQnLFxuICAgICAgICAgIEhFQUQ6IGN1cnJlbnQuSEVBRCxcbiAgICAgICAgICBkZXRhY2hlZDogY3VycmVudC5kZXRhY2hlZCB8fCBmYWxzZSxcbiAgICAgICAgICBwcnVuYWJsZTogY3VycmVudC5wcnVuYWJsZSxcbiAgICAgICAgICBsb2NrZWQ6IGN1cnJlbnQubG9ja2VkLFxuICAgICAgICAgIGxvY2tlZFJlYXNvbjogY3VycmVudC5sb2NrZWRSZWFzb24sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgY3VycmVudCA9IG51bGw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBba2V5LCAuLi52YWx1ZVBhcnRzXSA9IGxpbmUuc3BsaXQoJyAnKTtcbiAgICBjb25zdCB2YWx1ZSA9IHZhbHVlUGFydHMuam9pbignICcpO1xuXG4gICAgaWYgKGtleSA9PT0gJ3dvcmt0cmVlJykge1xuICAgICAgY3VycmVudCA9IHsgcGF0aDogdmFsdWUgfTtcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnQpIHtcbiAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgIGNhc2UgJ0hFQUQnOlxuICAgICAgICAgIGN1cnJlbnQuSEVBRCA9IHZhbHVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdicmFuY2gnOlxuICAgICAgICAgIGN1cnJlbnQuYnJhbmNoID0gdmFsdWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2RldGFjaGVkJzpcbiAgICAgICAgICBjdXJyZW50LmRldGFjaGVkID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncHJ1bmFibGUnOlxuICAgICAgICAgIGN1cnJlbnQucHJ1bmFibGUgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdsb2NrZWQnOlxuICAgICAgICAgIGN1cnJlbnQubG9ja2VkID0gdHJ1ZTtcbiAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgIGN1cnJlbnQubG9ja2VkUmVhc29uID0gdmFsdWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEhhbmRsZSBsYXN0IHdvcmt0cmVlIGlmIG5vIHRyYWlsaW5nIG5ld2xpbmVcbiAgaWYgKGN1cnJlbnQ/LnBhdGggJiYgY3VycmVudC5IRUFEKSB7XG4gICAgd29ya3RyZWVzLnB1c2goe1xuICAgICAgcGF0aDogY3VycmVudC5wYXRoLFxuICAgICAgYnJhbmNoOiBjdXJyZW50LmJyYW5jaCB8fCAnSEVBRCcsXG4gICAgICBIRUFEOiBjdXJyZW50LkhFQUQsXG4gICAgICBkZXRhY2hlZDogY3VycmVudC5kZXRhY2hlZCB8fCBmYWxzZSxcbiAgICAgIHBydW5hYmxlOiBjdXJyZW50LnBydW5hYmxlLFxuICAgICAgbG9ja2VkOiBjdXJyZW50LmxvY2tlZCxcbiAgICAgIGxvY2tlZFJlYXNvbjogY3VycmVudC5sb2NrZWRSZWFzb24sXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gd29ya3RyZWVzO1xufVxuXG4vKipcbiAqIEdldCBjb21taXQgYW5kIGRpZmYgc3RhdHMgZm9yIGEgYnJhbmNoXG4gKiBAcGFyYW0gcmVwb1BhdGggUmVwb3NpdG9yeSBwYXRoXG4gKiBAcGFyYW0gYnJhbmNoIEJyYW5jaCBuYW1lXG4gKiBAcGFyYW0gYmFzZUJyYW5jaCBCYXNlIGJyYW5jaCB0byBjb21wYXJlIGFnYWluc3RcbiAqIEByZXR1cm5zIFN0YXRzXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEJyYW5jaFN0YXRzKFxuICByZXBvUGF0aDogc3RyaW5nLFxuICBicmFuY2g6IHN0cmluZyxcbiAgYmFzZUJyYW5jaDogc3RyaW5nXG4pOiBQcm9taXNlPFdvcmt0cmVlU3RhdHM+IHtcbiAgY29uc3Qgc3RhdHM6IFdvcmt0cmVlU3RhdHMgPSB7XG4gICAgY29tbWl0c0FoZWFkOiAwLFxuICAgIGZpbGVzQ2hhbmdlZDogMCxcbiAgICBpbnNlcnRpb25zOiAwLFxuICAgIGRlbGV0aW9uczogMCxcbiAgfTtcblxuICB0cnkge1xuICAgIC8vIEdldCBjb21taXQgY291bnRcbiAgICBjb25zdCB7IHN0ZG91dDogY29tbWl0Q291bnQgfSA9IGF3YWl0IGV4ZWNHaXQoXG4gICAgICBbJ3Jldi1saXN0JywgJy0tY291bnQnLCBgJHtiYXNlQnJhbmNofS4uLiR7YnJhbmNofWBdLFxuICAgICAgeyBjd2Q6IHJlcG9QYXRoIH1cbiAgICApO1xuICAgIHN0YXRzLmNvbW1pdHNBaGVhZCA9IE51bWJlci5wYXJzZUludChjb21taXRDb3VudC50cmltKCkpIHx8IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmRlYnVnKGBDb3VsZCBub3QgZ2V0IGNvbW1pdCBjb3VudCBmb3IgJHticmFuY2h9OiAke2Vycm9yfWApO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBHZXQgZGlmZiBzdGF0c1xuICAgIGNvbnN0IHsgc3Rkb3V0OiBkaWZmU3RhdCB9ID0gYXdhaXQgZXhlY0dpdChcbiAgICAgIFsnZGlmZicsICctLXNob3J0c3RhdCcsIGAke2Jhc2VCcmFuY2h9Li4uJHticmFuY2h9YF0sXG4gICAgICB7IGN3ZDogcmVwb1BhdGggfVxuICAgICk7XG5cbiAgICAvLyBQYXJzZSBvdXRwdXQgbGlrZTogXCIzIGZpbGVzIGNoYW5nZWQsIDEwIGluc2VydGlvbnMoKyksIDUgZGVsZXRpb25zKC0pXCJcbiAgICBjb25zdCBtYXRjaCA9IGRpZmZTdGF0Lm1hdGNoKFxuICAgICAgLyhcXGQrKSBmaWxlcz8gY2hhbmdlZCg/OiwgKFxcZCspIGluc2VydGlvbnM/XFwoXFwrXFwpKT8oPzosIChcXGQrKSBkZWxldGlvbnM/XFwoLVxcKSk/L1xuICAgICk7XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICBzdGF0cy5maWxlc0NoYW5nZWQgPSBOdW1iZXIucGFyc2VJbnQobWF0Y2hbMV0pIHx8IDA7XG4gICAgICBzdGF0cy5pbnNlcnRpb25zID0gTnVtYmVyLnBhcnNlSW50KG1hdGNoWzJdKSB8fCAwO1xuICAgICAgc3RhdHMuZGVsZXRpb25zID0gTnVtYmVyLnBhcnNlSW50KG1hdGNoWzNdKSB8fCAwO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZGVidWcoYENvdWxkIG5vdCBnZXQgZGlmZiBzdGF0cyBmb3IgJHticmFuY2h9OiAke2Vycm9yfWApO1xuICB9XG5cbiAgcmV0dXJuIHN0YXRzO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGEgd29ya3RyZWUgaGFzIHVuY29tbWl0dGVkIGNoYW5nZXNcbiAqIEBwYXJhbSB3b3JrdHJlZVBhdGggV29ya3RyZWUgcGF0aFxuICogQHJldHVybnMgVHJ1ZSBpZiB0aGVyZSBhcmUgdW5jb21taXR0ZWQgY2hhbmdlc1xuICovXG5hc3luYyBmdW5jdGlvbiBoYXNVbmNvbW1pdHRlZENoYW5nZXMod29ya3RyZWVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCB7IGN3ZDogd29ya3RyZWVQYXRoIH0pO1xuICAgIHJldHVybiBzdGRvdXQudHJpbSgpLmxlbmd0aCA+IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmRlYnVnKGBDb3VsZCBub3QgY2hlY2sgdW5jb21taXR0ZWQgY2hhbmdlcyBmb3IgJHt3b3JrdHJlZVBhdGh9OiAke2Vycm9yfWApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIFNsdWdpZnkgYnJhbmNoIG5hbWUgZm9yIGRpcmVjdG9yeSBuYW1pbmdcbiAqIEBwYXJhbSBicmFuY2ggQnJhbmNoIG5hbWVcbiAqIEByZXR1cm5zIFNsdWdpZmllZCBuYW1lXG4gKi9cbmZ1bmN0aW9uIF9zbHVnaWZ5QnJhbmNoKGJyYW5jaDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGJyYW5jaFxuICAgIC5yZXBsYWNlKC9cXC8vZywgJy0nKVxuICAgIC5yZXBsYWNlKC9bXmEtekEtWjAtOS1fXS9nLCAnXycpXG4gICAgLnRvTG93ZXJDYXNlKCk7XG59XG5cbi8qKlxuICogQ3JlYXRlIHdvcmt0cmVlIG1hbmFnZW1lbnQgcm91dGVzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVXb3JrdHJlZVJvdXRlcygpOiBSb3V0ZXIge1xuICBjb25zdCByb3V0ZXIgPSBSb3V0ZXIoKTtcblxuICAvKipcbiAgICogR0VUIC9hcGkvd29ya3RyZWVzXG4gICAqIExpc3QgYWxsIHdvcmt0cmVlcyB3aXRoIGV4dGVuZGVkIGluZm9ybWF0aW9uXG4gICAqL1xuICByb3V0ZXIuZ2V0KCcvd29ya3RyZWVzJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcmVwb1BhdGggfSA9IHJlcS5xdWVyeTtcblxuICAgICAgaWYgKCFyZXBvUGF0aCB8fCB0eXBlb2YgcmVwb1BhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgcmVwb1BhdGggcGFyYW1ldGVyJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFic29sdXRlUmVwb1BhdGggPSBwYXRoLnJlc29sdmUocmVwb1BhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBMaXN0aW5nIHdvcmt0cmVlcyBmb3IgcmVwbzogJHthYnNvbHV0ZVJlcG9QYXRofWApO1xuXG4gICAgICAvLyBEZXRlY3QgZGVmYXVsdCBicmFuY2hcbiAgICAgIGNvbnN0IGJhc2VCcmFuY2ggPSBhd2FpdCBkZXRlY3REZWZhdWx0QnJhbmNoKGFic29sdXRlUmVwb1BhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBVc2luZyBiYXNlIGJyYW5jaDogJHtiYXNlQnJhbmNofWApO1xuXG4gICAgICAvLyBHZXQgZm9sbG93IHdvcmt0cmVlIGlmIGNvbmZpZ3VyZWRcbiAgICAgIGxldCBmb2xsb3dCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBleGVjR2l0KFsnY29uZmlnJywgJ3ZpYmV0dW5uZWwuZm9sbG93V29ya3RyZWUnXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGZvbGxvd1dvcmt0cmVlUGF0aCA9IHN0ZG91dC50cmltKCk7XG5cbiAgICAgICAgaWYgKGZvbGxvd1dvcmt0cmVlUGF0aCkge1xuICAgICAgICAgIC8vIEZpbmQgdGhlIGJyYW5jaCBmb3IgdGhpcyB3b3JrdHJlZSBwYXRoIC0gd2UgbmVlZCB0byBwYXJzZSB3b3JrdHJlZXMgZmlyc3RcbiAgICAgICAgICAvLyBUaGlzIGlzIGEgYml0IG9mIGEgY2lyY3VsYXIgZGVwZW5kZW5jeSwgc28gbGV0J3MgZ2V0IG1pbmltYWwgd29ya3RyZWUgaW5mb1xuICAgICAgICAgIGNvbnN0IHsgc3Rkb3V0OiB3b3JrdHJlZUxpc3RPdXRwdXQgfSA9IGF3YWl0IGV4ZWNHaXQoXG4gICAgICAgICAgICBbJ3dvcmt0cmVlJywgJ2xpc3QnLCAnLS1wb3JjZWxhaW4nXSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgY3dkOiBhYnNvbHV0ZVJlcG9QYXRoLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3QgYWxsV29ya3RyZWVzID0gcGFyc2VXb3JrdHJlZVBvcmNlbGFpbih3b3JrdHJlZUxpc3RPdXRwdXQpO1xuICAgICAgICAgIGNvbnN0IGZvbGxvd1dvcmt0cmVlID0gYWxsV29ya3RyZWVzLmZpbmQoKHc6IFdvcmt0cmVlKSA9PiB3LnBhdGggPT09IGZvbGxvd1dvcmt0cmVlUGF0aCk7XG4gICAgICAgICAgaWYgKGZvbGxvd1dvcmt0cmVlKSB7XG4gICAgICAgICAgICBmb2xsb3dCcmFuY2ggPSBmb2xsb3dXb3JrdHJlZS5icmFuY2gucmVwbGFjZSgvXnJlZnNcXC9oZWFkc1xcLy8sICcnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBObyBmb2xsb3cgd29ya3RyZWUgY29uZmlndXJlZFxuICAgICAgfVxuXG4gICAgICAvLyBHZXQgd29ya3RyZWUgbGlzdFxuICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWyd3b3JrdHJlZScsICdsaXN0JywgJy0tcG9yY2VsYWluJ10sIHtcbiAgICAgICAgY3dkOiBhYnNvbHV0ZVJlcG9QYXRoLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGFsbFdvcmt0cmVlcyA9IHBhcnNlV29ya3RyZWVQb3JjZWxhaW4oc3Rkb3V0KTtcblxuICAgICAgLy8gRW5yaWNoIGFsbCB3b3JrdHJlZXMgd2l0aCBhZGRpdGlvbmFsIHN0YXRzIChpbmNsdWRpbmcgbWFpbiByZXBvc2l0b3J5KVxuICAgICAgY29uc3QgZW5yaWNoZWRXb3JrdHJlZXMgPSBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgYWxsV29ya3RyZWVzLm1hcChhc3luYyAod29ya3RyZWUpID0+IHtcbiAgICAgICAgICAvLyBTa2lwIHN0YXRzIGZvciBkZXRhY2hlZCBIRUFEXG4gICAgICAgICAgaWYgKHdvcmt0cmVlLmRldGFjaGVkIHx8ICF3b3JrdHJlZS5icmFuY2gpIHtcbiAgICAgICAgICAgIHJldHVybiB3b3JrdHJlZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBHZXQgYnJhbmNoIHN0YXRzXG4gICAgICAgICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBnZXRCcmFuY2hTdGF0cyh3b3JrdHJlZS5wYXRoLCB3b3JrdHJlZS5icmFuY2gsIGJhc2VCcmFuY2gpO1xuXG4gICAgICAgICAgLy8gQ2hlY2sgZm9yIHVuY29tbWl0dGVkIGNoYW5nZXNcbiAgICAgICAgICBjb25zdCBoYXNDaGFuZ2VzID0gYXdhaXQgaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmt0cmVlLnBhdGgpO1xuXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLndvcmt0cmVlLFxuICAgICAgICAgICAgLi4uc3RhdHMsXG4gICAgICAgICAgICBzdGF0cywgLy8gQWxzbyBpbmNsdWRlIHN0YXRzIGFzIGEgbmVzdGVkIG9iamVjdCBmb3IgY29tcGF0aWJpbGl0eVxuICAgICAgICAgICAgaGFzVW5jb21taXR0ZWRDaGFuZ2VzOiBoYXNDaGFuZ2VzLFxuICAgICAgICAgIH07XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICB3b3JrdHJlZXM6IGVucmljaGVkV29ya3RyZWVzLFxuICAgICAgICBiYXNlQnJhbmNoLFxuICAgICAgICBmb2xsb3dCcmFuY2gsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBsaXN0aW5nIHdvcmt0cmVlczonLCBlcnJvcik7XG4gICAgICBjb25zdCBnaXRFcnJvciA9IGVycm9yIGFzIEdpdEVycm9yO1xuXG4gICAgICAvLyBDaGVjayBpZiBpdCdzIGEgXCJub3QgYSBnaXQgcmVwb3NpdG9yeVwiIGVycm9yIG9yIGdpdCBub3QgZm91bmRcbiAgICAgIGlmIChnaXRFcnJvci5jb2RlID09PSAnRU5PRU5UJyB8fCBnaXRFcnJvci5zdGRlcnI/LmluY2x1ZGVzKCdub3QgYSBnaXQgcmVwb3NpdG9yeScpKSB7XG4gICAgICAgIC8vIFJldHVybiBlbXB0eSB3b3JrdHJlZXMgbGlzdCBmb3Igbm9uLWdpdCBkaXJlY3RvcmllcyBvciB3aGVuIGdpdCBpcyBub3QgYXZhaWxhYmxlXG4gICAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgICAgd29ya3RyZWVzOiBbXSxcbiAgICAgICAgICBiYXNlQnJhbmNoOiAnbWFpbicsXG4gICAgICAgICAgZm9sbG93QnJhbmNoOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBsaXN0IHdvcmt0cmVlcycsXG4gICAgICAgIGRldGFpbHM6IGdpdEVycm9yLnN0ZGVyciB8fCBnaXRFcnJvci5tZXNzYWdlLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogREVMRVRFIC9hcGkvd29ya3RyZWVzLzpicmFuY2hcbiAgICogUmVtb3ZlIGEgd29ya3RyZWVcbiAgICovXG4gIHJvdXRlci5kZWxldGUoJy93b3JrdHJlZXMvOmJyYW5jaCcsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGJyYW5jaCB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IHsgcmVwb1BhdGgsIGZvcmNlIH0gPSByZXEucXVlcnk7XG5cbiAgICAgIGlmICghcmVwb1BhdGggfHwgdHlwZW9mIHJlcG9QYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIHJlcG9QYXRoIHBhcmFtZXRlcicsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhYnNvbHV0ZVJlcG9QYXRoID0gcGF0aC5yZXNvbHZlKHJlcG9QYXRoKTtcbiAgICAgIGNvbnN0IGZvcmNlRGVsZXRlID0gZm9yY2UgPT09ICd0cnVlJztcblxuICAgICAgbG9nZ2VyLmRlYnVnKGBSZW1vdmluZyB3b3JrdHJlZSBmb3IgYnJhbmNoOiAke2JyYW5jaH0sIGZvcmNlOiAke2ZvcmNlRGVsZXRlfWApO1xuXG4gICAgICAvLyBGaXJzdCwgZmluZCB0aGUgd29ya3RyZWUgcGF0aCBmb3IgdGhpcyBicmFuY2hcbiAgICAgIGNvbnN0IHsgc3Rkb3V0OiBsaXN0T3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsnd29ya3RyZWUnLCAnbGlzdCcsICctLXBvcmNlbGFpbiddLCB7XG4gICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB3b3JrdHJlZXMgPSBwYXJzZVdvcmt0cmVlUG9yY2VsYWluKGxpc3RPdXRwdXQpO1xuICAgICAgY29uc3Qgd29ya3RyZWUgPSB3b3JrdHJlZXMuZmluZCgodykgPT4ge1xuICAgICAgICAvLyBNYXRjaCBhZ2FpbnN0IGJvdGggdGhlIGZ1bGwgcmVmIHBhdGggYW5kIHRoZSBzaG9ydCBicmFuY2ggbmFtZVxuICAgICAgICBjb25zdCBzaG9ydEJyYW5jaCA9IHcuYnJhbmNoPy5yZXBsYWNlKC9ecmVmc1xcL2hlYWRzXFwvLywgJycpO1xuICAgICAgICByZXR1cm4gdy5icmFuY2ggPT09IGByZWZzL2hlYWRzLyR7YnJhbmNofWAgfHwgc2hvcnRCcmFuY2ggPT09IGJyYW5jaCB8fCB3LmJyYW5jaCA9PT0gYnJhbmNoO1xuICAgICAgfSk7XG5cbiAgICAgIGlmICghd29ya3RyZWUpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogYFdvcmt0cmVlIGZvciBicmFuY2ggJyR7YnJhbmNofScgbm90IGZvdW5kYCxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGZvciB1bmNvbW1pdHRlZCBjaGFuZ2VzIGlmIG5vdCBmb3JjaW5nXG4gICAgICBpZiAoIWZvcmNlRGVsZXRlKSB7XG4gICAgICAgIGNvbnN0IGhhc0NoYW5nZXMgPSBhd2FpdCBoYXNVbmNvbW1pdHRlZENoYW5nZXMod29ya3RyZWUucGF0aCk7XG4gICAgICAgIGlmIChoYXNDaGFuZ2VzKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA5KS5qc29uKHtcbiAgICAgICAgICAgIGVycm9yOiAnV29ya3RyZWUgaGFzIHVuY29tbWl0dGVkIGNoYW5nZXMnLFxuICAgICAgICAgICAgd29ya3RyZWVQYXRoOiB3b3JrdHJlZS5wYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFJlbW92ZSB0aGUgd29ya3RyZWVcbiAgICAgIGNvbnN0IHJlbW92ZUFyZ3MgPSBbJ3dvcmt0cmVlJywgJ3JlbW92ZSddO1xuICAgICAgaWYgKGZvcmNlRGVsZXRlKSB7XG4gICAgICAgIHJlbW92ZUFyZ3MucHVzaCgnLS1mb3JjZScpO1xuICAgICAgfVxuICAgICAgcmVtb3ZlQXJncy5wdXNoKHdvcmt0cmVlLnBhdGgpO1xuXG4gICAgICBhd2FpdCBleGVjR2l0KHJlbW92ZUFyZ3MsIHsgY3dkOiBhYnNvbHV0ZVJlcG9QYXRoIH0pO1xuXG4gICAgICBsb2dnZXIuaW5mbyhgU3VjY2Vzc2Z1bGx5IHJlbW92ZWQgd29ya3RyZWU6ICR7d29ya3RyZWUucGF0aH1gKTtcbiAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6ICdXb3JrdHJlZSByZW1vdmVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIHJlbW92ZWRQYXRoOiB3b3JrdHJlZS5wYXRoLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgcmVtb3Zpbmcgd29ya3RyZWU6JywgZXJyb3IpO1xuICAgICAgY29uc3QgZ2l0RXJyb3IgPSBlcnJvciBhcyBHaXRFcnJvcjtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnRmFpbGVkIHRvIHJlbW92ZSB3b3JrdHJlZScsXG4gICAgICAgIGRldGFpbHM6IGdpdEVycm9yLnN0ZGVyciB8fCBnaXRFcnJvci5tZXNzYWdlLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogUE9TVCAvYXBpL3dvcmt0cmVlcy9wcnVuZVxuICAgKiBQcnVuZSB3b3JrdHJlZSBpbmZvcm1hdGlvblxuICAgKi9cbiAgcm91dGVyLnBvc3QoJy93b3JrdHJlZXMvcHJ1bmUnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyByZXBvUGF0aCB9ID0gcmVxLmJvZHk7XG5cbiAgICAgIGlmICghcmVwb1BhdGggfHwgdHlwZW9mIHJlcG9QYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIHJlcG9QYXRoIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhYnNvbHV0ZVJlcG9QYXRoID0gcGF0aC5yZXNvbHZlKHJlcG9QYXRoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgUHJ1bmluZyB3b3JrdHJlZXMgZm9yIHJlcG86ICR7YWJzb2x1dGVSZXBvUGF0aH1gKTtcblxuICAgICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0dpdChbJ3dvcmt0cmVlJywgJ3BydW5lJ10sIHsgY3dkOiBhYnNvbHV0ZVJlcG9QYXRoIH0pO1xuXG4gICAgICBsb2dnZXIuaW5mbygnU3VjY2Vzc2Z1bGx5IHBydW5lZCB3b3JrdHJlZSBpbmZvcm1hdGlvbicpO1xuICAgICAgcmV0dXJuIHJlcy5qc29uKHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogJ1dvcmt0cmVlIGluZm9ybWF0aW9uIHBydW5lZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBvdXRwdXQ6IHN0ZG91dCB8fCBzdGRlcnIgfHwgJ05vIG91dHB1dCcsXG4gICAgICAgIHBydW5lZDogc3Rkb3V0IHx8IHN0ZGVyciB8fCAnJyxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIHBydW5pbmcgd29ya3RyZWVzOicsIGVycm9yKTtcbiAgICAgIGNvbnN0IGdpdEVycm9yID0gZXJyb3IgYXMgR2l0RXJyb3I7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBwcnVuZSB3b3JrdHJlZXMnLFxuICAgICAgICBkZXRhaWxzOiBnaXRFcnJvci5zdGRlcnIgfHwgZ2l0RXJyb3IubWVzc2FnZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIFBPU1QgL2FwaS93b3JrdHJlZXNcbiAgICogQ3JlYXRlIGEgbmV3IHdvcmt0cmVlXG4gICAqL1xuICByb3V0ZXIucG9zdCgnL3dvcmt0cmVlcycsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHJlcG9QYXRoLCBicmFuY2gsIHBhdGg6IHdvcmt0cmVlUGF0aCwgYmFzZUJyYW5jaCB9ID0gcmVxLmJvZHk7XG5cbiAgICAgIGlmICghcmVwb1BhdGggfHwgdHlwZW9mIHJlcG9QYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIHJlcG9QYXRoIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWJyYW5jaCB8fCB0eXBlb2YgYnJhbmNoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIGJyYW5jaCBpbiByZXF1ZXN0IGJvZHknLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKCF3b3JrdHJlZVBhdGggfHwgdHlwZW9mIHdvcmt0cmVlUGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ01pc3Npbmcgb3IgaW52YWxpZCBwYXRoIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhYnNvbHV0ZVJlcG9QYXRoID0gcGF0aC5yZXNvbHZlKHJlcG9QYXRoKTtcbiAgICAgIGNvbnN0IGFic29sdXRlV29ya3RyZWVQYXRoID0gcGF0aC5yZXNvbHZlKHdvcmt0cmVlUGF0aCk7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ3JlYXRpbmcgd29ya3RyZWUgZm9yIGJyYW5jaDogJHticmFuY2h9IGF0IHBhdGg6ICR7YWJzb2x1dGVXb3JrdHJlZVBhdGh9YCk7XG5cbiAgICAgIC8vIENyZWF0ZSB0aGUgd29ya3RyZWVcbiAgICAgIGNvbnN0IGNyZWF0ZUFyZ3MgPSBbJ3dvcmt0cmVlJywgJ2FkZCddO1xuXG4gICAgICAvLyBJZiBiYXNlQnJhbmNoIGlzIHByb3ZpZGVkLCBjcmVhdGUgbmV3IGJyYW5jaCBmcm9tIGl0XG4gICAgICBpZiAoYmFzZUJyYW5jaCkge1xuICAgICAgICBjcmVhdGVBcmdzLnB1c2goJy1iJywgYnJhbmNoLCBhYnNvbHV0ZVdvcmt0cmVlUGF0aCwgYmFzZUJyYW5jaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBPdGhlcndpc2UganVzdCBjaGVja291dCBleGlzdGluZyBicmFuY2hcbiAgICAgICAgY3JlYXRlQXJncy5wdXNoKGFic29sdXRlV29ya3RyZWVQYXRoLCBicmFuY2gpO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBleGVjR2l0KGNyZWF0ZUFyZ3MsIHsgY3dkOiBhYnNvbHV0ZVJlcG9QYXRoIH0pO1xuXG4gICAgICBsb2dnZXIuaW5mbyhgU3VjY2Vzc2Z1bGx5IGNyZWF0ZWQgd29ya3RyZWUgYXQ6ICR7YWJzb2x1dGVXb3JrdHJlZVBhdGh9YCk7XG4gICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICBtZXNzYWdlOiAnV29ya3RyZWUgY3JlYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICB3b3JrdHJlZVBhdGg6IGFic29sdXRlV29ya3RyZWVQYXRoLFxuICAgICAgICBicmFuY2gsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBjcmVhdGluZyB3b3JrdHJlZTonLCBlcnJvcik7XG4gICAgICBjb25zdCBnaXRFcnJvciA9IGVycm9yIGFzIEdpdEVycm9yO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gY3JlYXRlIHdvcmt0cmVlJyxcbiAgICAgICAgZGV0YWlsczogZ2l0RXJyb3Iuc3RkZXJyIHx8IGdpdEVycm9yLm1lc3NhZ2UsXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBQT1NUIC9hcGkvd29ya3RyZWVzL2ZvbGxvd1xuICAgKiBFbmFibGUgb3IgZGlzYWJsZSBmb2xsb3cgbW9kZSBmb3IgYSBicmFuY2hcbiAgICovXG4gIHJvdXRlci5wb3N0KCcvd29ya3RyZWVzL2ZvbGxvdycsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHJlcG9QYXRoLCBicmFuY2gsIGVuYWJsZSB9ID0gcmVxLmJvZHk7XG5cbiAgICAgIGlmICghcmVwb1BhdGggfHwgdHlwZW9mIHJlcG9QYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnTWlzc2luZyBvciBpbnZhbGlkIHJlcG9QYXRoIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIGVuYWJsZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgZW5hYmxlIGZsYWcgaW4gcmVxdWVzdCBib2R5JyxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEJyYW5jaCBpcyBvbmx5IHJlcXVpcmVkIHdoZW4gZW5hYmxpbmcgZm9sbG93IG1vZGVcbiAgICAgIGlmIChlbmFibGUgJiYgKCFicmFuY2ggfHwgdHlwZW9mIGJyYW5jaCAhPT0gJ3N0cmluZycpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgYnJhbmNoIGluIHJlcXVlc3QgYm9keScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBhYnNvbHV0ZVJlcG9QYXRoID0gcGF0aC5yZXNvbHZlKHJlcG9QYXRoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYCR7ZW5hYmxlID8gJ0VuYWJsaW5nJyA6ICdEaXNhYmxpbmcnfSBmb2xsb3cgbW9kZSR7YnJhbmNoID8gYCBmb3IgYnJhbmNoOiAke2JyYW5jaH1gIDogJyd9YFxuICAgICAgKTtcblxuICAgICAgaWYgKGVuYWJsZSkge1xuICAgICAgICAvLyBDaGVjayBpZiBHaXQgaG9va3MgYXJlIGFscmVhZHkgaW5zdGFsbGVkXG4gICAgICAgIGNvbnN0IGhvb2tzQWxyZWFkeUluc3RhbGxlZCA9IGF3YWl0IGFyZUhvb2tzSW5zdGFsbGVkKGFic29sdXRlUmVwb1BhdGgpO1xuICAgICAgICBsb2dnZXIuZGVidWcoYEdpdCBob29rcyBpbnN0YWxsZWQ6ICR7aG9va3NBbHJlYWR5SW5zdGFsbGVkfWApO1xuXG4gICAgICAgIGxldCBob29rc0luc3RhbGxSZXN1bHQgPSBudWxsO1xuICAgICAgICBpZiAoIWhvb2tzQWxyZWFkeUluc3RhbGxlZCkge1xuICAgICAgICAgIC8vIEluc3RhbGwgR2l0IGhvb2tzXG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0luc3RhbGxpbmcgR2l0IGhvb2tzIGZvciBmb2xsb3cgbW9kZScpO1xuICAgICAgICAgIGNvbnN0IGluc3RhbGxSZXN1bHQgPSBhd2FpdCBpbnN0YWxsR2l0SG9va3MoYWJzb2x1dGVSZXBvUGF0aCk7XG4gICAgICAgICAgaG9va3NJbnN0YWxsUmVzdWx0ID0gaW5zdGFsbFJlc3VsdDtcblxuICAgICAgICAgIGlmICghaW5zdGFsbFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBpbnN0YWxsIEdpdCBob29rczonLCBpbnN0YWxsUmVzdWx0LmVycm9ycyk7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBpbnN0YWxsIEdpdCBob29rcycsXG4gICAgICAgICAgICAgIGRldGFpbHM6IGluc3RhbGxSZXN1bHQuZXJyb3JzLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0dpdCBob29rcyBpbnN0YWxsZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHZXQgd29ya3RyZWUgaW5mb3JtYXRpb24gdG8gZmluZCB0aGUgcGF0aCBmb3IgdGhpcyBicmFuY2hcbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHdvcmt0cmVlTGlzdE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3dvcmt0cmVlJywgJ2xpc3QnLCAnLS1wb3JjZWxhaW4nXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGFsbFdvcmt0cmVlcyA9IHBhcnNlV29ya3RyZWVQb3JjZWxhaW4od29ya3RyZWVMaXN0T3V0cHV0KTtcbiAgICAgICAgY29uc3Qgd29ya3RyZWUgPSBhbGxXb3JrdHJlZXMuZmluZChcbiAgICAgICAgICAodykgPT5cbiAgICAgICAgICAgIHcuYnJhbmNoID09PSBicmFuY2ggfHxcbiAgICAgICAgICAgIHcuYnJhbmNoID09PSBgcmVmcy9oZWFkcy8ke2JyYW5jaH1gIHx8XG4gICAgICAgICAgICB3LmJyYW5jaC5yZXBsYWNlKC9ecmVmc1xcL2hlYWRzXFwvLywgJycpID09PSBicmFuY2hcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoIXdvcmt0cmVlKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICAgIGVycm9yOiBgTm8gd29ya3RyZWUgZm91bmQgZm9yIGJyYW5jaDogJHticmFuY2h9YCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCB0aGUgZm9sbG93IHdvcmt0cmVlIHBhdGggKG5vdCBicmFuY2ggbmFtZSlcbiAgICAgICAgYXdhaXQgZXhlY0dpdChbJ2NvbmZpZycsICctLWxvY2FsJywgJ3ZpYmV0dW5uZWwuZm9sbG93V29ya3RyZWUnLCB3b3JrdHJlZS5wYXRoXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbG9nZ2VyLmluZm8oYEZvbGxvdyBtb2RlIGVuYWJsZWQgZm9yIGJyYW5jaDogJHticmFuY2h9YCk7XG5cbiAgICAgICAgLy8gSW1tZWRpYXRlbHkgc3luYyBtYWluIHJlcG9zaXRvcnkgdG8gdGhlIGZvbGxvd2VkIGJyYW5jaFxuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFN0cmlwIHJlZnMvaGVhZHMvIHByZWZpeCBpZiBwcmVzZW50XG4gICAgICAgICAgY29uc3QgY2xlYW5CcmFuY2ggPSBicmFuY2gucmVwbGFjZSgvXnJlZnNcXC9oZWFkc1xcLy8sICcnKTtcblxuICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBicmFuY2ggZXhpc3RzIGxvY2FsbHlcbiAgICAgICAgICBjb25zdCB7IHN0ZG91dDogYnJhbmNoTGlzdCB9ID0gYXdhaXQgZXhlY0dpdChbJ2JyYW5jaCcsICctLWxpc3QnLCBjbGVhbkJyYW5jaF0sIHtcbiAgICAgICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmIChicmFuY2hMaXN0LnRyaW0oKSkge1xuICAgICAgICAgICAgLy8gQnJhbmNoIGV4aXN0cyBsb2NhbGx5LCBzd2l0Y2ggdG8gaXRcbiAgICAgICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjaGVja291dCcsIGNsZWFuQnJhbmNoXSwgeyBjd2Q6IGFic29sdXRlUmVwb1BhdGggfSk7XG4gICAgICAgICAgICBsb2dnZXIuaW5mbyhgTWFpbiByZXBvc2l0b3J5IHN3aXRjaGVkIHRvIGJyYW5jaDogJHtjbGVhbkJyYW5jaH1gKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQnJhbmNoIGRvZXNuJ3QgZXhpc3QgbG9jYWxseSwgdHJ5IHRvIGZldGNoIGFuZCBjcmVhdGUgaXRcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIGF3YWl0IGV4ZWNHaXQoWydmZXRjaCcsICdvcmlnaW4nLCBgJHtjbGVhbkJyYW5jaH06JHtjbGVhbkJyYW5jaH1gXSwge1xuICAgICAgICAgICAgICAgIGN3ZDogYWJzb2x1dGVSZXBvUGF0aCxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjaGVja291dCcsIGNsZWFuQnJhbmNoXSwgeyBjd2Q6IGFic29sdXRlUmVwb1BhdGggfSk7XG4gICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBGZXRjaGVkIGFuZCBzd2l0Y2hlZCB0byBicmFuY2g6ICR7Y2xlYW5CcmFuY2h9YCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBsb2dnZXIud2FybihgQ291bGQgbm90IGZldGNoL3N3aXRjaCB0byBicmFuY2ggJHtjbGVhbkJyYW5jaH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAvLyBEb24ndCBmYWlsIGZvbGxvdyBtb2RlIGVuYWJsZSBpZiBicmFuY2ggc3dpdGNoIGZhaWxzXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGxvZ2dlci53YXJuKGBDb3VsZCBub3QgaW1tZWRpYXRlbHkgc3dpdGNoIHRvIGJyYW5jaCAke2JyYW5jaH06YCwgZXJyb3IpO1xuICAgICAgICAgIC8vIERvbid0IGZhaWwgZm9sbG93IG1vZGUgZW5hYmxlIGlmIGJyYW5jaCBzd2l0Y2ggZmFpbHNcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9uIHRvIE1hYyBhcHBcbiAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgY29uc3Qgbm90aWZpY2F0aW9uID0gY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnbm90aWZpY2F0aW9uJywge1xuICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRm9sbG93IE1vZGUgRW5hYmxlZCcsXG4gICAgICAgICAgICBtZXNzYWdlOiBgTm93IGZvbGxvd2luZyBicmFuY2ggJyR7YnJhbmNofScgaW4gJHtwYXRoLmJhc2VuYW1lKGFic29sdXRlUmVwb1BhdGgpfWAsXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgY29udHJvbFVuaXhIYW5kbGVyLnNlbmRUb01hYyhub3RpZmljYXRpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcy5qc29uKHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWVzc2FnZTogJ0ZvbGxvdyBtb2RlIGVuYWJsZWQnLFxuICAgICAgICAgIGJyYW5jaCxcbiAgICAgICAgICBob29rc0luc3RhbGxlZDogdHJ1ZSxcbiAgICAgICAgICBob29rc0luc3RhbGxSZXN1bHQ6IGhvb2tzSW5zdGFsbFJlc3VsdCxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBVbnNldCB0aGUgZm9sbG93IHdvcmt0cmVlIGNvbmZpZ1xuICAgICAgICBhd2FpdCBleGVjR2l0KFsnY29uZmlnJywgJy0tbG9jYWwnLCAnLS11bnNldCcsICd2aWJldHVubmVsLmZvbGxvd1dvcmt0cmVlJ10sIHtcbiAgICAgICAgICBjd2Q6IGFic29sdXRlUmVwb1BhdGgsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFVuaW5zdGFsbCBHaXQgaG9va3Mgd2hlbiBkaXNhYmxpbmcgZm9sbG93IG1vZGVcbiAgICAgICAgbG9nZ2VyLmluZm8oJ1VuaW5zdGFsbGluZyBHaXQgaG9va3MnKTtcbiAgICAgICAgY29uc3QgdW5pbnN0YWxsUmVzdWx0ID0gYXdhaXQgdW5pbnN0YWxsR2l0SG9va3MoYWJzb2x1dGVSZXBvUGF0aCk7XG5cbiAgICAgICAgaWYgKCF1bmluc3RhbGxSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdGYWlsZWQgdG8gdW5pbnN0YWxsIHNvbWUgR2l0IGhvb2tzOicsIHVuaW5zdGFsbFJlc3VsdC5lcnJvcnMpO1xuICAgICAgICAgIC8vIENvbnRpbnVlIGFueXdheSAtIGZvbGxvdyBtb2RlIGlzIHN0aWxsIGRpc2FibGVkXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0dpdCBob29rcyB1bmluc3RhbGxlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ2dlci5pbmZvKCdGb2xsb3cgbW9kZSBkaXNhYmxlZCcpO1xuXG4gICAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9uIHRvIE1hYyBhcHBcbiAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgY29uc3Qgbm90aWZpY2F0aW9uID0gY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnbm90aWZpY2F0aW9uJywge1xuICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRm9sbG93IE1vZGUgRGlzYWJsZWQnLFxuICAgICAgICAgICAgbWVzc2FnZTogYEZvbGxvdyBtb2RlIGhhcyBiZWVuIGRpc2FibGVkIGZvciAke3BhdGguYmFzZW5hbWUoYWJzb2x1dGVSZXBvUGF0aCl9YCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb250cm9sVW5peEhhbmRsZXIuc2VuZFRvTWFjKG5vdGlmaWNhdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgbWVzc2FnZTogJ0ZvbGxvdyBtb2RlIGRpc2FibGVkJyxcbiAgICAgICAgICBicmFuY2gsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBJZ25vcmUgZXJyb3IgaWYgY29uZmlnIGtleSBkb2Vzbid0IGV4aXN0IHdoZW4gdW5zZXR0aW5nXG4gICAgICBpZiAoaXNHaXRDb25maWdOb3RGb3VuZEVycm9yKGVycm9yKSAmJiAhcmVxLmJvZHkuZW5hYmxlKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnRm9sbG93IG1vZGUgd2FzIGFscmVhZHkgZGlzYWJsZWQnKTtcbiAgICAgICAgcmV0dXJuIHJlcy5qc29uKHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgIG1lc3NhZ2U6ICdGb2xsb3cgbW9kZSBkaXNhYmxlZCcsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIG1hbmFnaW5nIGZvbGxvdyBtb2RlOicsIGVycm9yKTtcbiAgICAgIGNvbnN0IGdpdEVycm9yID0gZXJyb3IgYXMgR2l0RXJyb3I7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBtYW5hZ2UgZm9sbG93IG1vZGUnLFxuICAgICAgICBkZXRhaWxzOiBnaXRFcnJvci5zdGRlcnIgfHwgZ2l0RXJyb3IubWVzc2FnZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==