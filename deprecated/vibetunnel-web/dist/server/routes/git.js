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
exports.createGitRoutes = createGitRoutes;
const express_1 = require("express");
const path = __importStar(require("path"));
const util_1 = require("util");
const session_manager_js_1 = require("../pty/session-manager.js");
const git_error_js_1 = require("../utils/git-error.js");
const git_utils_js_1 = require("../utils/git-utils.js");
const logger_js_1 = require("../utils/logger.js");
const path_utils_js_1 = require("../utils/path-utils.js");
const control_protocol_js_1 = require("../websocket/control-protocol.js");
const control_unix_handler_js_1 = require("../websocket/control-unix-handler.js");
const logger = (0, logger_js_1.createLogger)('git-routes');
const execFile = (0, util_1.promisify)(require('child_process').execFile);
// Store for pending notifications when macOS client is not connected
const pendingNotifications = [];
const repoLocks = new Map();
/**
 * Acquire a lock for a repository path
 * @param repoPath The repository path to lock
 * @returns A promise that resolves when the lock is acquired
 */
async function acquireRepoLock(repoPath) {
    return new Promise((resolve) => {
        let lock = repoLocks.get(repoPath);
        if (!lock) {
            lock = { isLocked: false, queue: [] };
            repoLocks.set(repoPath, lock);
        }
        if (!lock.isLocked) {
            lock.isLocked = true;
            resolve();
        }
        else {
            lock.queue.push(resolve);
        }
    });
}
/**
 * Release a lock for a repository path
 * @param repoPath The repository path to unlock
 */
function releaseRepoLock(repoPath) {
    const lock = repoLocks.get(repoPath);
    if (!lock) {
        return;
    }
    if (lock.queue.length > 0) {
        const next = lock.queue.shift();
        if (next) {
            next();
        }
    }
    else {
        lock.isLocked = false;
    }
}
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
            timeout: options.timeout || 5000,
            maxBuffer: 1024 * 1024, // 1MB
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
 * Create Git-related routes
 */
function createGitRoutes() {
    const router = (0, express_1.Router)();
    /**
     * GET /api/git/repo-info
     * Check if a path is within a Git repository
     */
    router.get('/git/repo-info', async (req, res) => {
        try {
            const { path: queryPath } = req.query;
            logger.info(`🔍 [git/repo-info] Received request for path: ${queryPath}`);
            if (!queryPath || typeof queryPath !== 'string') {
                logger.warn('❌ Missing or invalid path parameter');
                return res.status(400).json({
                    error: 'Missing or invalid path parameter',
                });
            }
            // Resolve the path to absolute, expanding tilde if present
            const absolutePath = (0, path_utils_js_1.resolveAbsolutePath)(queryPath);
            logger.info(`🔍 [git/repo-info] Resolved ${queryPath} to absolute path: ${absolutePath}`);
            try {
                // Use git rev-parse to find the repository root
                const { stdout } = await execGit(['rev-parse', '--show-toplevel'], {
                    cwd: absolutePath,
                });
                const repoPath = stdout.trim();
                const response = {
                    isGitRepo: true,
                    repoPath,
                };
                logger.info(`✅ [git/repo-info] Path is in git repo: ${repoPath}`);
                return res.json(response);
            }
            catch (error) {
                // If git command fails, it's not a git repo
                if ((0, git_error_js_1.isGitNotFoundError)(error)) {
                    logger.debug('Git command not found');
                    return res.json({ isGitRepo: false });
                }
                // Git returns exit code 128 when not in a git repo
                if ((0, git_error_js_1.isNotGitRepositoryError)(error)) {
                    logger.info(`❌ [git/repo-info] Path is not in a git repository: ${absolutePath}`);
                    return res.json({ isGitRepo: false });
                }
                // Unexpected error
                throw error;
            }
        }
        catch (error) {
            logger.error('Error checking git repo info:', error);
            return res.status(500).json({
                error: 'Failed to check git repository info',
            });
        }
    });
    /**
     * POST /api/git/event
     * Handle Git repository change events with locking to prevent race conditions
     */
    router.post('/git/event', async (req, res) => {
        let lockAcquired = false;
        let repoPath;
        try {
            const { repoPath: requestedRepoPath, branch, event } = req.body;
            if (!requestedRepoPath || typeof requestedRepoPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid repoPath parameter',
                });
            }
            // Normalize the repository path
            repoPath = path.resolve(requestedRepoPath);
            logger.debug(`Processing git event for repo: ${repoPath}, branch: ${branch}, event: ${event}`);
            // Acquire lock for this repository
            await acquireRepoLock(repoPath);
            lockAcquired = true;
            // Get all sessions and find those within the repository path
            const sessionManager = new session_manager_js_1.SessionManager();
            const allSessions = sessionManager.listSessions();
            const sessionsInRepo = allSessions.filter((session) => {
                if (!session.workingDir || !repoPath)
                    return false;
                const sessionPath = path.resolve(session.workingDir);
                return sessionPath.startsWith(repoPath);
            });
            logger.debug(`Found ${sessionsInRepo.length} sessions in repository ${repoPath}`);
            const updatedSessionIds = [];
            // Check follow mode status
            let followWorktree;
            let currentBranch;
            let followMode = false;
            let isMainRepo = false;
            let isWorktreeRepo = false;
            try {
                // Check if this is a worktree
                const { stdout: gitDirOutput } = await execGit(['rev-parse', '--git-dir'], {
                    cwd: repoPath,
                });
                const gitDir = gitDirOutput.trim();
                isWorktreeRepo = gitDir.includes('/.git/worktrees/');
                // If this is a worktree, find the main repo
                let mainRepoPath = repoPath;
                if (isWorktreeRepo) {
                    // Extract main repo from git dir (e.g., /path/to/main/.git/worktrees/branch)
                    mainRepoPath = gitDir.replace(/\/\.git\/worktrees\/.*$/, '');
                    logger.debug(`Worktree detected, main repo: ${mainRepoPath}`);
                }
                else {
                    isMainRepo = true;
                }
                // Get follow worktree setting from main repo
                const { stdout: followWorktreeOutput } = await execGit(['config', 'vibetunnel.followWorktree'], {
                    cwd: mainRepoPath,
                });
                followWorktree = followWorktreeOutput.trim();
                followMode = !!followWorktree;
                // Get current branch
                const { stdout: branchOutput } = await execGit(['branch', '--show-current'], {
                    cwd: repoPath,
                });
                currentBranch = branchOutput.trim();
            }
            catch (error) {
                // Config not set or git command failed - follow mode is disabled
                logger.debug('Follow worktree check failed or not configured:', error);
            }
            // Extract repository name from path
            const _repoName = path.basename(repoPath);
            // Update session titles for all sessions in the repository
            for (const session of sessionsInRepo) {
                try {
                    // Get the branch for this specific session's working directory
                    let _sessionBranch = currentBranch;
                    try {
                        const { stdout: sessionBranchOutput } = await execGit(['branch', '--show-current'], {
                            cwd: session.workingDir,
                        });
                        if (sessionBranchOutput.trim()) {
                            _sessionBranch = sessionBranchOutput.trim();
                        }
                    }
                    catch (_error) {
                        // Use current branch as fallback
                        logger.debug(`Could not get branch for session ${session.id}, using repo branch`);
                    }
                    // Extract base session name (remove any existing git info in square brackets at the end)
                    // Use a more specific regex to only match git-related content in brackets
                    const baseSessionName = session.name?.replace(/\s*\[(checkout|branch|merge|rebase|commit|push|pull|fetch|stash|reset|cherry-pick):[^\]]+\]\s*$/, '') || 'Terminal';
                    // Construct new title with format: baseSessionName [event: branch]
                    let newTitle = baseSessionName;
                    if (event && branch) {
                        newTitle = `${baseSessionName} [${event}: ${branch}]`;
                    }
                    // Update the session name
                    sessionManager.updateSessionName(session.id, newTitle);
                    updatedSessionIds.push(session.id);
                    logger.debug(`Updated session ${session.id} title to: ${newTitle}`);
                }
                catch (error) {
                    logger.error(`Failed to update session ${session.id}:`, error);
                }
            }
            // Handle follow mode sync logic
            if (followMode && followWorktree) {
                logger.info(`Follow mode active: processing event from ${repoPath}`);
                // Determine which repo we're in and which direction to sync
                if (repoPath === followWorktree && isWorktreeRepo) {
                    // Event from worktree - sync to main repo
                    logger.info(`Syncing from worktree to main repo`);
                    try {
                        // Find the main repo path
                        const { stdout: gitDirOutput } = await execGit(['rev-parse', '--git-dir'], {
                            cwd: repoPath,
                        });
                        const gitDir = gitDirOutput.trim();
                        const mainRepoPath = gitDir.replace(/\/\.git\/worktrees\/.*$/, '');
                        // Get the current branch in worktree
                        const { stdout: worktreeBranchOutput } = await execGit(['branch', '--show-current'], {
                            cwd: repoPath,
                        });
                        const worktreeBranch = worktreeBranchOutput.trim();
                        if (worktreeBranch) {
                            // Sync main repo to worktree's branch
                            logger.info(`Syncing main repo to branch: ${worktreeBranch}`);
                            await execGit(['checkout', worktreeBranch], { cwd: mainRepoPath });
                            // Pull latest changes in main repo
                            await execGit(['pull', '--ff-only'], { cwd: mainRepoPath });
                            // Send sync success notification
                            const syncNotif = {
                                level: 'info',
                                title: 'Main Repository Synced',
                                message: `Main repository synced to branch '${worktreeBranch}'`,
                            };
                            if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                                const syncNotification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', syncNotif);
                                control_unix_handler_js_1.controlUnixHandler.sendToMac(syncNotification);
                            }
                            else {
                                pendingNotifications.push({
                                    timestamp: Date.now(),
                                    notification: syncNotif,
                                });
                            }
                        }
                    }
                    catch (error) {
                        logger.error('Failed to sync from worktree to main:', error);
                        // Send error notification
                        const errorNotif = {
                            level: 'error',
                            title: 'Sync Failed',
                            message: `Failed to sync main repository: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        };
                        if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                            const errorNotification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', errorNotif);
                            control_unix_handler_js_1.controlUnixHandler.sendToMac(errorNotification);
                        }
                        else {
                            pendingNotifications.push({
                                timestamp: Date.now(),
                                notification: errorNotif,
                            });
                        }
                    }
                }
                else if (isMainRepo && event === 'commit') {
                    // Event from main repo (commit only) - sync to worktree
                    logger.info(`Syncing commit from main repo to worktree`);
                    try {
                        // Pull latest changes in worktree
                        await execGit(['pull', '--ff-only'], { cwd: followWorktree });
                        // Send sync success notification
                        const syncNotif = {
                            level: 'info',
                            title: 'Worktree Synced',
                            message: `Worktree synced with latest commits`,
                        };
                        if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                            const syncNotification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', syncNotif);
                            control_unix_handler_js_1.controlUnixHandler.sendToMac(syncNotification);
                        }
                        else {
                            pendingNotifications.push({
                                timestamp: Date.now(),
                                notification: syncNotif,
                            });
                        }
                    }
                    catch (error) {
                        logger.error('Failed to sync commit to worktree:', error);
                    }
                }
                else if (isMainRepo && event === 'checkout') {
                    // Branch switch in main repo - disable follow mode
                    logger.info('Branch switched in main repo, disabling follow mode');
                    try {
                        await execGit(['config', '--local', '--unset', 'vibetunnel.followWorktree'], {
                            cwd: repoPath,
                        });
                        followMode = false;
                        followWorktree = undefined;
                        // Send notification about follow mode being disabled
                        const disableNotif = {
                            level: 'info',
                            title: 'Follow Mode Disabled',
                            message: `Follow mode disabled due to branch switch in main repository`,
                        };
                        if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                            const disableNotification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', disableNotif);
                            control_unix_handler_js_1.controlUnixHandler.sendToMac(disableNotification);
                        }
                        else {
                            pendingNotifications.push({
                                timestamp: Date.now(),
                                notification: disableNotif,
                            });
                        }
                    }
                    catch (error) {
                        logger.error('Failed to disable follow mode:', error);
                    }
                }
            }
            // Create notification payload
            const notification = {
                type: 'git-event',
                repoPath,
                branch: branch || currentBranch,
                event,
                followMode,
                sessionsUpdated: updatedSessionIds,
            };
            // Prepare notifications
            const notificationsToSend = [];
            // Add specific follow mode notifications
            if (followMode && followWorktree) {
                const worktreeName = path.basename(followWorktree);
                notificationsToSend.push({
                    level: 'info',
                    title: 'Follow Mode Active',
                    message: `Following worktree '${worktreeName}' in ${path.basename(repoPath)}`,
                });
            }
            // Send notifications via Unix socket to Mac app if connected
            if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                // Send repository changed event
                const controlMessage = (0, control_protocol_js_1.createControlEvent)('git', 'repository-changed', notification);
                control_unix_handler_js_1.controlUnixHandler.sendToMac(controlMessage);
                logger.debug('Sent git event notification to Mac app');
                // Send specific notifications
                for (const notif of notificationsToSend) {
                    const notificationMessage = (0, control_protocol_js_1.createControlEvent)('system', 'notification', notif);
                    control_unix_handler_js_1.controlUnixHandler.sendToMac(notificationMessage);
                }
            }
            else {
                // Store notifications for web UI when macOS client is not connected
                const now = Date.now();
                for (const notif of notificationsToSend) {
                    pendingNotifications.push({
                        timestamp: now,
                        notification: notif,
                    });
                }
                // Keep only notifications from the last 5 minutes
                const fiveMinutesAgo = now - 5 * 60 * 1000;
                while (pendingNotifications.length > 0 &&
                    pendingNotifications[0].timestamp < fiveMinutesAgo) {
                    pendingNotifications.shift();
                }
                logger.debug(`Stored ${notificationsToSend.length} notifications for web UI`);
            }
            // Return success response
            res.json({
                success: true,
                repoPath,
                sessionsUpdated: updatedSessionIds.length,
                followMode,
                notification,
            });
        }
        catch (error) {
            logger.error('Error handling git event:', error);
            return res.status(500).json({
                error: 'Failed to process git event',
                message: error instanceof Error ? error.message : String(error),
            });
        }
        finally {
            // Always release the lock
            if (lockAcquired && repoPath) {
                releaseRepoLock(repoPath);
            }
        }
    });
    /**
     * GET /api/git/notifications
     * Get pending notifications for the web UI
     */
    router.get('/git/notifications', async (_req, res) => {
        try {
            // Clean up old notifications (older than 5 minutes)
            const now = Date.now();
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            while (pendingNotifications.length > 0 &&
                pendingNotifications[0].timestamp < fiveMinutesAgo) {
                pendingNotifications.shift();
            }
            // Return current notifications and clear them
            const notifications = pendingNotifications.map((n) => n.notification);
            pendingNotifications.length = 0;
            logger.debug(`Returning ${notifications.length} pending notifications`);
            res.json({ notifications });
        }
        catch (error) {
            logger.error('Error fetching notifications:', error);
            return res.status(500).json({
                error: 'Failed to fetch notifications',
            });
        }
    });
    /**
     * GET /api/git/status
     * Get repository status with file counts and branch info
     */
    router.get('/git/status', async (req, res) => {
        try {
            const { path: queryPath } = req.query;
            if (!queryPath || typeof queryPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid path parameter',
                });
            }
            // Resolve the path to absolute
            const absolutePath = (0, path_utils_js_1.resolveAbsolutePath)(queryPath);
            logger.debug(`Getting git status for path: ${absolutePath}`);
            try {
                // Get repository root
                const { stdout: repoPathOutput } = await execGit(['rev-parse', '--show-toplevel'], {
                    cwd: absolutePath,
                });
                const repoPath = repoPathOutput.trim();
                // Get current branch
                const { stdout: branchOutput } = await execGit(['branch', '--show-current'], {
                    cwd: repoPath,
                });
                const currentBranch = branchOutput.trim();
                // Get status in porcelain format
                const { stdout: statusOutput } = await execGit(['status', '--porcelain=v1'], {
                    cwd: repoPath,
                });
                // Parse status output
                const lines = statusOutput
                    .trim()
                    .split('\n')
                    .filter((line) => line.length > 0);
                let modifiedCount = 0;
                let untrackedCount = 0;
                let stagedCount = 0;
                let addedCount = 0;
                let deletedCount = 0;
                for (const line of lines) {
                    if (line.length < 2)
                        continue;
                    const indexStatus = line[0];
                    const workTreeStatus = line[1];
                    // Staged changes
                    if (indexStatus !== ' ' && indexStatus !== '?') {
                        stagedCount++;
                        // Count specific types of staged changes
                        if (indexStatus === 'A') {
                            addedCount++;
                        }
                        else if (indexStatus === 'D') {
                            deletedCount++;
                        }
                    }
                    // Working tree changes
                    if (workTreeStatus === 'M') {
                        modifiedCount++;
                    }
                    else if (workTreeStatus === 'D' && indexStatus === ' ') {
                        // Deleted in working tree but not staged
                        deletedCount++;
                    }
                    // Untracked files
                    if (indexStatus === '?' && workTreeStatus === '?') {
                        untrackedCount++;
                    }
                }
                // Get ahead/behind counts
                let aheadCount = 0;
                let behindCount = 0;
                let hasUpstream = false;
                try {
                    // Check if we have an upstream branch
                    const { stdout: upstreamOutput } = await execGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: repoPath });
                    if (upstreamOutput.trim()) {
                        hasUpstream = true;
                        // Get ahead/behind counts
                        const { stdout: aheadBehindOutput } = await execGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { cwd: repoPath });
                        const [ahead, behind] = aheadBehindOutput
                            .trim()
                            .split('\t')
                            .map((n) => Number.parseInt(n, 10));
                        aheadCount = ahead || 0;
                        behindCount = behind || 0;
                    }
                }
                catch (_error) {
                    // No upstream branch configured
                    logger.debug('No upstream branch configured');
                }
                return res.json({
                    isGitRepo: true,
                    repoPath,
                    currentBranch,
                    hasChanges: lines.length > 0,
                    modifiedCount,
                    untrackedCount,
                    stagedCount,
                    addedCount,
                    deletedCount,
                    aheadCount,
                    behindCount,
                    hasUpstream,
                });
            }
            catch (error) {
                if ((0, git_error_js_1.isNotGitRepositoryError)(error)) {
                    return res.json({
                        isGitRepo: false,
                    });
                }
                throw error;
            }
        }
        catch (error) {
            logger.error('Error getting git status:', error);
            return res.status(500).json({
                error: 'Failed to get git status',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    /**
     * GET /api/git/remote
     * Get remote URL for a repository
     */
    router.get('/git/remote', async (req, res) => {
        try {
            const { path: queryPath } = req.query;
            if (!queryPath || typeof queryPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid path parameter',
                });
            }
            // Resolve the path to absolute
            const absolutePath = (0, path_utils_js_1.resolveAbsolutePath)(queryPath);
            logger.debug(`Getting git remote for path: ${absolutePath}`);
            try {
                // Get repository root
                const { stdout: repoPathOutput } = await execGit(['rev-parse', '--show-toplevel'], {
                    cwd: absolutePath,
                });
                const repoPath = repoPathOutput.trim();
                // Get remote URL
                const { stdout: remoteOutput } = await execGit(['remote', 'get-url', 'origin'], {
                    cwd: repoPath,
                });
                const remoteUrl = remoteOutput.trim();
                // Parse GitHub URL from remote URL
                let githubUrl = null;
                if (remoteUrl) {
                    // Handle HTTPS URLs: https://github.com/user/repo.git
                    if (remoteUrl.startsWith('https://github.com/')) {
                        githubUrl = remoteUrl.endsWith('.git') ? remoteUrl.slice(0, -4) : remoteUrl;
                    }
                    // Handle SSH URLs: git@github.com:user/repo.git
                    else if (remoteUrl.startsWith('git@github.com:')) {
                        const pathPart = remoteUrl.substring('git@github.com:'.length);
                        const cleanPath = pathPart.endsWith('.git') ? pathPart.slice(0, -4) : pathPart;
                        githubUrl = `https://github.com/${cleanPath}`;
                    }
                }
                return res.json({
                    isGitRepo: true,
                    repoPath,
                    remoteUrl,
                    githubUrl,
                });
            }
            catch (error) {
                if ((0, git_error_js_1.isNotGitRepositoryError)(error)) {
                    return res.json({
                        isGitRepo: false,
                    });
                }
                // Check if it's just missing remote
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('No such remote')) {
                    return res.json({
                        isGitRepo: true,
                        remoteUrl: null,
                        githubUrl: null,
                    });
                }
                throw error;
            }
        }
        catch (error) {
            logger.error('Error getting git remote:', error);
            return res.status(500).json({
                error: 'Failed to get git remote',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    /**
     * GET /api/git/repository-info
     * Get comprehensive repository information (combines multiple git commands)
     */
    router.get('/git/repository-info', async (req, res) => {
        try {
            const { path: queryPath } = req.query;
            if (!queryPath || typeof queryPath !== 'string') {
                return res.status(400).json({
                    error: 'Missing or invalid path parameter',
                });
            }
            // Resolve the path to absolute
            const absolutePath = (0, path_utils_js_1.resolveAbsolutePath)(queryPath);
            logger.debug(`Getting comprehensive git info for path: ${absolutePath}`);
            try {
                // Get repository root
                const { stdout: repoPathOutput } = await execGit(['rev-parse', '--show-toplevel'], {
                    cwd: absolutePath,
                });
                const repoPath = repoPathOutput.trim();
                // Check if this is a worktree
                const worktreeStatus = await (0, git_utils_js_1.isWorktree)(repoPath);
                // Gather all information in parallel
                const [branchResult, statusResult, remoteResult, aheadBehindResult] = await Promise.allSettled([
                    // Current branch
                    execGit(['branch', '--show-current'], { cwd: repoPath }),
                    // Status
                    execGit(['status', '--porcelain=v1'], { cwd: repoPath }),
                    // Remote URL
                    execGit(['remote', 'get-url', 'origin'], { cwd: repoPath }),
                    // Ahead/behind counts
                    execGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], { cwd: repoPath }),
                ]);
                // Process results
                const currentBranch = branchResult.status === 'fulfilled' ? branchResult.value.stdout.trim() : null;
                // Parse status
                let modifiedCount = 0;
                let untrackedCount = 0;
                let stagedCount = 0;
                let addedCount = 0;
                let deletedCount = 0;
                let hasChanges = false;
                if (statusResult.status === 'fulfilled') {
                    const lines = statusResult.value.stdout
                        .trim()
                        .split('\n')
                        .filter((line) => line.length > 0);
                    hasChanges = lines.length > 0;
                    for (const line of lines) {
                        if (line.length < 2)
                            continue;
                        const indexStatus = line[0];
                        const workTreeStatus = line[1];
                        if (indexStatus !== ' ' && indexStatus !== '?') {
                            stagedCount++;
                            if (indexStatus === 'A') {
                                addedCount++;
                            }
                            else if (indexStatus === 'D') {
                                deletedCount++;
                            }
                        }
                        if (workTreeStatus === 'M') {
                            modifiedCount++;
                        }
                        else if (workTreeStatus === 'D' && indexStatus === ' ') {
                            deletedCount++;
                        }
                        if (indexStatus === '?' && workTreeStatus === '?') {
                            untrackedCount++;
                        }
                    }
                }
                // Remote URL
                const remoteUrl = remoteResult.status === 'fulfilled' ? remoteResult.value.stdout.trim() : null;
                // Ahead/behind counts
                let aheadCount = 0;
                let behindCount = 0;
                let hasUpstream = false;
                if (aheadBehindResult.status === 'fulfilled') {
                    hasUpstream = true;
                    const [ahead, behind] = aheadBehindResult.value.stdout
                        .trim()
                        .split('\t')
                        .map((n) => Number.parseInt(n, 10));
                    aheadCount = ahead || 0;
                    behindCount = behind || 0;
                }
                return res.json({
                    isGitRepo: true,
                    repoPath,
                    currentBranch,
                    remoteUrl,
                    hasChanges,
                    modifiedCount,
                    untrackedCount,
                    stagedCount,
                    addedCount,
                    deletedCount,
                    aheadCount,
                    behindCount,
                    hasUpstream,
                    isWorktree: worktreeStatus,
                });
            }
            catch (error) {
                if ((0, git_error_js_1.isNotGitRepositoryError)(error)) {
                    return res.json({
                        isGitRepo: false,
                    });
                }
                throw error;
            }
        }
        catch (error) {
            logger.error('Error getting repository info:', error);
            return res.status(500).json({
                error: 'Failed to get repository info',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvZ2l0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBMkhBLDBDQWl5QkM7QUE1NUJELHFDQUFpQztBQUNqQywyQ0FBNkI7QUFDN0IsK0JBQWlDO0FBQ2pDLGtFQUEyRDtBQUMzRCx3REFBb0c7QUFDcEcsd0RBQW1EO0FBQ25ELGtEQUFrRDtBQUNsRCwwREFBNkQ7QUFDN0QsMEVBQXNFO0FBQ3RFLGtGQUEwRTtBQUUxRSxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsWUFBWSxDQUFDLENBQUM7QUFDMUMsTUFBTSxRQUFRLEdBQUcsSUFBQSxnQkFBUyxFQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQXNCOUQscUVBQXFFO0FBQ3JFLE1BQU0sb0JBQW9CLEdBT3JCLEVBQUUsQ0FBQztBQVFSLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0FBRTlDOzs7O0dBSUc7QUFDSCxLQUFLLFVBQVUsZUFBZSxDQUFDLFFBQWdCO0lBQzdDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUM3QixJQUFJLElBQUksR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRW5DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNWLElBQUksR0FBRyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO1lBQ3RDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ3JC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QUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUm91dGVyIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBTZXNzaW9uTWFuYWdlciB9IGZyb20gJy4uL3B0eS9zZXNzaW9uLW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlR2l0RXJyb3IsIGlzR2l0Tm90Rm91bmRFcnJvciwgaXNOb3RHaXRSZXBvc2l0b3J5RXJyb3IgfSBmcm9tICcuLi91dGlscy9naXQtZXJyb3IuanMnO1xuaW1wb3J0IHsgaXNXb3JrdHJlZSB9IGZyb20gJy4uL3V0aWxzL2dpdC11dGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUFic29sdXRlUGF0aCB9IGZyb20gJy4uL3V0aWxzL3BhdGgtdXRpbHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29udHJvbEV2ZW50IH0gZnJvbSAnLi4vd2Vic29ja2V0L2NvbnRyb2wtcHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY29udHJvbFVuaXhIYW5kbGVyIH0gZnJvbSAnLi4vd2Vic29ja2V0L2NvbnRyb2wtdW5peC1oYW5kbGVyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdnaXQtcm91dGVzJyk7XG5jb25zdCBleGVjRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuZXhlY0ZpbGUpO1xuXG5pbnRlcmZhY2UgR2l0UmVwb0luZm8ge1xuICBpc0dpdFJlcG86IGJvb2xlYW47XG4gIHJlcG9QYXRoPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgR2l0RXZlbnRSZXF1ZXN0IHtcbiAgcmVwb1BhdGg6IHN0cmluZztcbiAgYnJhbmNoPzogc3RyaW5nO1xuICBldmVudD86ICdjaGVja291dCcgfCAncHVsbCcgfCAnbWVyZ2UnIHwgJ3JlYmFzZScgfCAnY29tbWl0JyB8ICdwdXNoJztcbn1cblxuaW50ZXJmYWNlIEdpdEV2ZW50Tm90aWZpY2F0aW9uIHtcbiAgdHlwZTogJ2dpdC1ldmVudCc7XG4gIHJlcG9QYXRoOiBzdHJpbmc7XG4gIGJyYW5jaD86IHN0cmluZztcbiAgZXZlbnQ/OiBzdHJpbmc7XG4gIGZvbGxvd01vZGU/OiBib29sZWFuO1xuICBzZXNzaW9uc1VwZGF0ZWQ6IHN0cmluZ1tdO1xufVxuXG4vLyBTdG9yZSBmb3IgcGVuZGluZyBub3RpZmljYXRpb25zIHdoZW4gbWFjT1MgY2xpZW50IGlzIG5vdCBjb25uZWN0ZWRcbmNvbnN0IHBlbmRpbmdOb3RpZmljYXRpb25zOiBBcnJheTx7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICBub3RpZmljYXRpb246IHtcbiAgICBsZXZlbDogJ2luZm8nIHwgJ2Vycm9yJztcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgfTtcbn0+ID0gW107XG5cbi8vIEluLW1lbW9yeSBsb2NrIHRvIHByZXZlbnQgcmFjZSBjb25kaXRpb25zXG5pbnRlcmZhY2UgUmVwb0xvY2sge1xuICBpc0xvY2tlZDogYm9vbGVhbjtcbiAgcXVldWU6IEFycmF5PCgpID0+IHZvaWQ+O1xufVxuXG5jb25zdCByZXBvTG9ja3MgPSBuZXcgTWFwPHN0cmluZywgUmVwb0xvY2s+KCk7XG5cbi8qKlxuICogQWNxdWlyZSBhIGxvY2sgZm9yIGEgcmVwb3NpdG9yeSBwYXRoXG4gKiBAcGFyYW0gcmVwb1BhdGggVGhlIHJlcG9zaXRvcnkgcGF0aCB0byBsb2NrXG4gKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBsb2NrIGlzIGFjcXVpcmVkXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGFjcXVpcmVSZXBvTG9jayhyZXBvUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGxldCBsb2NrID0gcmVwb0xvY2tzLmdldChyZXBvUGF0aCk7XG5cbiAgICBpZiAoIWxvY2spIHtcbiAgICAgIGxvY2sgPSB7IGlzTG9ja2VkOiBmYWxzZSwgcXVldWU6IFtdIH07XG4gICAgICByZXBvTG9ja3Muc2V0KHJlcG9QYXRoLCBsb2NrKTtcbiAgICB9XG5cbiAgICBpZiAoIWxvY2suaXNMb2NrZWQpIHtcbiAgICAgIGxvY2suaXNMb2NrZWQgPSB0cnVlO1xuICAgICAgcmVzb2x2ZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2NrLnF1ZXVlLnB1c2gocmVzb2x2ZSk7XG4gICAgfVxuICB9KTtcbn1cblxuLyoqXG4gKiBSZWxlYXNlIGEgbG9jayBmb3IgYSByZXBvc2l0b3J5IHBhdGhcbiAqIEBwYXJhbSByZXBvUGF0aCBUaGUgcmVwb3NpdG9yeSBwYXRoIHRvIHVubG9ja1xuICovXG5mdW5jdGlvbiByZWxlYXNlUmVwb0xvY2socmVwb1BhdGg6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBsb2NrID0gcmVwb0xvY2tzLmdldChyZXBvUGF0aCk7XG5cbiAgaWYgKCFsb2NrKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKGxvY2sucXVldWUubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IG5leHQgPSBsb2NrLnF1ZXVlLnNoaWZ0KCk7XG4gICAgaWYgKG5leHQpIHtcbiAgICAgIG5leHQoKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbG9jay5pc0xvY2tlZCA9IGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogRXhlY3V0ZSBhIGdpdCBjb21tYW5kIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nIGFuZCBzZWN1cml0eVxuICogQHBhcmFtIGFyZ3MgR2l0IGNvbW1hbmQgYXJndW1lbnRzXG4gKiBAcGFyYW0gb3B0aW9ucyBFeGVjdXRpb24gb3B0aW9uc1xuICogQHJldHVybnMgQ29tbWFuZCBvdXRwdXRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY0dpdChcbiAgYXJnczogc3RyaW5nW10sXG4gIG9wdGlvbnM6IHsgY3dkPzogc3RyaW5nOyB0aW1lb3V0PzogbnVtYmVyIH0gPSB7fVxuKTogUHJvbWlzZTx7IHN0ZG91dDogc3RyaW5nOyBzdGRlcnI6IHN0cmluZyB9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGUoJ2dpdCcsIGFyZ3MsIHtcbiAgICAgIGN3ZDogb3B0aW9ucy5jd2QgfHwgcHJvY2Vzcy5jd2QoKSxcbiAgICAgIHRpbWVvdXQ6IG9wdGlvbnMudGltZW91dCB8fCA1MDAwLFxuICAgICAgbWF4QnVmZmVyOiAxMDI0ICogMTAyNCwgLy8gMU1CXG4gICAgICBlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIEdJVF9URVJNSU5BTF9QUk9NUFQ6ICcwJyB9LCAvLyBEaXNhYmxlIGdpdCBwcm9tcHRzXG4gICAgfSk7XG4gICAgcmV0dXJuIHsgc3Rkb3V0OiBzdGRvdXQudG9TdHJpbmcoKSwgc3RkZXJyOiBzdGRlcnIudG9TdHJpbmcoKSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIFJlLXRocm93IHdpdGggbW9yZSBjb250ZXh0XG4gICAgdGhyb3cgY3JlYXRlR2l0RXJyb3IoZXJyb3IsICdHaXQgY29tbWFuZCBmYWlsZWQnKTtcbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBHaXQtcmVsYXRlZCByb3V0ZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUdpdFJvdXRlcygpOiBSb3V0ZXIge1xuICBjb25zdCByb3V0ZXIgPSBSb3V0ZXIoKTtcblxuICAvKipcbiAgICogR0VUIC9hcGkvZ2l0L3JlcG8taW5mb1xuICAgKiBDaGVjayBpZiBhIHBhdGggaXMgd2l0aGluIGEgR2l0IHJlcG9zaXRvcnlcbiAgICovXG4gIHJvdXRlci5nZXQoJy9naXQvcmVwby1pbmZvJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcGF0aDogcXVlcnlQYXRoIH0gPSByZXEucXVlcnk7XG4gICAgICBsb2dnZXIuaW5mbyhg8J+UjSBbZ2l0L3JlcG8taW5mb10gUmVjZWl2ZWQgcmVxdWVzdCBmb3IgcGF0aDogJHtxdWVyeVBhdGh9YCk7XG5cbiAgICAgIGlmICghcXVlcnlQYXRoIHx8IHR5cGVvZiBxdWVyeVBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKCfinYwgTWlzc2luZyBvciBpbnZhbGlkIHBhdGggcGFyYW1ldGVyJyk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgcGF0aCBwYXJhbWV0ZXInLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVzb2x2ZSB0aGUgcGF0aCB0byBhYnNvbHV0ZSwgZXhwYW5kaW5nIHRpbGRlIGlmIHByZXNlbnRcbiAgICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHJlc29sdmVBYnNvbHV0ZVBhdGgocXVlcnlQYXRoKTtcbiAgICAgIGxvZ2dlci5pbmZvKGDwn5SNIFtnaXQvcmVwby1pbmZvXSBSZXNvbHZlZCAke3F1ZXJ5UGF0aH0gdG8gYWJzb2x1dGUgcGF0aDogJHthYnNvbHV0ZVBhdGh9YCk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFVzZSBnaXQgcmV2LXBhcnNlIHRvIGZpbmQgdGhlIHJlcG9zaXRvcnkgcm9vdFxuICAgICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3Jldi1wYXJzZScsICctLXNob3ctdG9wbGV2ZWwnXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVQYXRoLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCByZXBvUGF0aCA9IHN0ZG91dC50cmltKCk7XG5cbiAgICAgICAgY29uc3QgcmVzcG9uc2U6IEdpdFJlcG9JbmZvID0ge1xuICAgICAgICAgIGlzR2l0UmVwbzogdHJ1ZSxcbiAgICAgICAgICByZXBvUGF0aCxcbiAgICAgICAgfTtcblxuICAgICAgICBsb2dnZXIuaW5mbyhg4pyFIFtnaXQvcmVwby1pbmZvXSBQYXRoIGlzIGluIGdpdCByZXBvOiAke3JlcG9QYXRofWApO1xuICAgICAgICByZXR1cm4gcmVzLmpzb24ocmVzcG9uc2UpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgLy8gSWYgZ2l0IGNvbW1hbmQgZmFpbHMsIGl0J3Mgbm90IGEgZ2l0IHJlcG9cbiAgICAgICAgaWYgKGlzR2l0Tm90Rm91bmRFcnJvcihlcnJvcikpIHtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoJ0dpdCBjb21tYW5kIG5vdCBmb3VuZCcpO1xuICAgICAgICAgIHJldHVybiByZXMuanNvbih7IGlzR2l0UmVwbzogZmFsc2UgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHaXQgcmV0dXJucyBleGl0IGNvZGUgMTI4IHdoZW4gbm90IGluIGEgZ2l0IHJlcG9cbiAgICAgICAgaWYgKGlzTm90R2l0UmVwb3NpdG9yeUVycm9yKGVycm9yKSkge1xuICAgICAgICAgIGxvZ2dlci5pbmZvKGDinYwgW2dpdC9yZXBvLWluZm9dIFBhdGggaXMgbm90IGluIGEgZ2l0IHJlcG9zaXRvcnk6ICR7YWJzb2x1dGVQYXRofWApO1xuICAgICAgICAgIHJldHVybiByZXMuanNvbih7IGlzR2l0UmVwbzogZmFsc2UgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVbmV4cGVjdGVkIGVycm9yXG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNoZWNraW5nIGdpdCByZXBvIGluZm86JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gY2hlY2sgZ2l0IHJlcG9zaXRvcnkgaW5mbycsXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBQT1NUIC9hcGkvZ2l0L2V2ZW50XG4gICAqIEhhbmRsZSBHaXQgcmVwb3NpdG9yeSBjaGFuZ2UgZXZlbnRzIHdpdGggbG9ja2luZyB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9naXQvZXZlbnQnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBsZXQgbG9ja0FjcXVpcmVkID0gZmFsc2U7XG4gICAgbGV0IHJlcG9QYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyByZXBvUGF0aDogcmVxdWVzdGVkUmVwb1BhdGgsIGJyYW5jaCwgZXZlbnQgfSA9IHJlcS5ib2R5IGFzIEdpdEV2ZW50UmVxdWVzdDtcblxuICAgICAgaWYgKCFyZXF1ZXN0ZWRSZXBvUGF0aCB8fCB0eXBlb2YgcmVxdWVzdGVkUmVwb1BhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgcmVwb1BhdGggcGFyYW1ldGVyJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgcmVwb3NpdG9yeSBwYXRoXG4gICAgICByZXBvUGF0aCA9IHBhdGgucmVzb2x2ZShyZXF1ZXN0ZWRSZXBvUGF0aCk7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBQcm9jZXNzaW5nIGdpdCBldmVudCBmb3IgcmVwbzogJHtyZXBvUGF0aH0sIGJyYW5jaDogJHticmFuY2h9LCBldmVudDogJHtldmVudH1gXG4gICAgICApO1xuXG4gICAgICAvLyBBY3F1aXJlIGxvY2sgZm9yIHRoaXMgcmVwb3NpdG9yeVxuICAgICAgYXdhaXQgYWNxdWlyZVJlcG9Mb2NrKHJlcG9QYXRoKTtcbiAgICAgIGxvY2tBY3F1aXJlZCA9IHRydWU7XG5cbiAgICAgIC8vIEdldCBhbGwgc2Vzc2lvbnMgYW5kIGZpbmQgdGhvc2Ugd2l0aGluIHRoZSByZXBvc2l0b3J5IHBhdGhcbiAgICAgIGNvbnN0IHNlc3Npb25NYW5hZ2VyID0gbmV3IFNlc3Npb25NYW5hZ2VyKCk7XG4gICAgICBjb25zdCBhbGxTZXNzaW9ucyA9IHNlc3Npb25NYW5hZ2VyLmxpc3RTZXNzaW9ucygpO1xuICAgICAgY29uc3Qgc2Vzc2lvbnNJblJlcG8gPSBhbGxTZXNzaW9ucy5maWx0ZXIoKHNlc3Npb24pID0+IHtcbiAgICAgICAgaWYgKCFzZXNzaW9uLndvcmtpbmdEaXIgfHwgIXJlcG9QYXRoKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGNvbnN0IHNlc3Npb25QYXRoID0gcGF0aC5yZXNvbHZlKHNlc3Npb24ud29ya2luZ0Rpcik7XG4gICAgICAgIHJldHVybiBzZXNzaW9uUGF0aC5zdGFydHNXaXRoKHJlcG9QYXRoKTtcbiAgICAgIH0pO1xuXG4gICAgICBsb2dnZXIuZGVidWcoYEZvdW5kICR7c2Vzc2lvbnNJblJlcG8ubGVuZ3RofSBzZXNzaW9ucyBpbiByZXBvc2l0b3J5ICR7cmVwb1BhdGh9YCk7XG5cbiAgICAgIGNvbnN0IHVwZGF0ZWRTZXNzaW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgICAvLyBDaGVjayBmb2xsb3cgbW9kZSBzdGF0dXNcbiAgICAgIGxldCBmb2xsb3dXb3JrdHJlZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICAgICAgbGV0IGN1cnJlbnRCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGxldCBmb2xsb3dNb2RlID0gZmFsc2U7XG4gICAgICBsZXQgaXNNYWluUmVwbyA9IGZhbHNlO1xuICAgICAgbGV0IGlzV29ya3RyZWVSZXBvID0gZmFsc2U7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSB3b3JrdHJlZVxuICAgICAgICBjb25zdCB7IHN0ZG91dDogZ2l0RGlyT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsncmV2LXBhcnNlJywgJy0tZ2l0LWRpciddLCB7XG4gICAgICAgICAgY3dkOiByZXBvUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGdpdERpciA9IGdpdERpck91dHB1dC50cmltKCk7XG4gICAgICAgIGlzV29ya3RyZWVSZXBvID0gZ2l0RGlyLmluY2x1ZGVzKCcvLmdpdC93b3JrdHJlZXMvJyk7XG5cbiAgICAgICAgLy8gSWYgdGhpcyBpcyBhIHdvcmt0cmVlLCBmaW5kIHRoZSBtYWluIHJlcG9cbiAgICAgICAgbGV0IG1haW5SZXBvUGF0aCA9IHJlcG9QYXRoO1xuICAgICAgICBpZiAoaXNXb3JrdHJlZVJlcG8pIHtcbiAgICAgICAgICAvLyBFeHRyYWN0IG1haW4gcmVwbyBmcm9tIGdpdCBkaXIgKGUuZy4sIC9wYXRoL3RvL21haW4vLmdpdC93b3JrdHJlZXMvYnJhbmNoKVxuICAgICAgICAgIG1haW5SZXBvUGF0aCA9IGdpdERpci5yZXBsYWNlKC9cXC9cXC5naXRcXC93b3JrdHJlZXNcXC8uKiQvLCAnJyk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBXb3JrdHJlZSBkZXRlY3RlZCwgbWFpbiByZXBvOiAke21haW5SZXBvUGF0aH1gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpc01haW5SZXBvID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdldCBmb2xsb3cgd29ya3RyZWUgc2V0dGluZyBmcm9tIG1haW4gcmVwb1xuICAgICAgICBjb25zdCB7IHN0ZG91dDogZm9sbG93V29ya3RyZWVPdXRwdXQgfSA9IGF3YWl0IGV4ZWNHaXQoXG4gICAgICAgICAgWydjb25maWcnLCAndmliZXR1bm5lbC5mb2xsb3dXb3JrdHJlZSddLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGN3ZDogbWFpblJlcG9QYXRoLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgICAgZm9sbG93V29ya3RyZWUgPSBmb2xsb3dXb3JrdHJlZU91dHB1dC50cmltKCk7XG4gICAgICAgIGZvbGxvd01vZGUgPSAhIWZvbGxvd1dvcmt0cmVlO1xuXG4gICAgICAgIC8vIEdldCBjdXJyZW50IGJyYW5jaFxuICAgICAgICBjb25zdCB7IHN0ZG91dDogYnJhbmNoT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsnYnJhbmNoJywgJy0tc2hvdy1jdXJyZW50J10sIHtcbiAgICAgICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgY3VycmVudEJyYW5jaCA9IGJyYW5jaE91dHB1dC50cmltKCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBDb25maWcgbm90IHNldCBvciBnaXQgY29tbWFuZCBmYWlsZWQgLSBmb2xsb3cgbW9kZSBpcyBkaXNhYmxlZFxuICAgICAgICBsb2dnZXIuZGVidWcoJ0ZvbGxvdyB3b3JrdHJlZSBjaGVjayBmYWlsZWQgb3Igbm90IGNvbmZpZ3VyZWQ6JywgZXJyb3IpO1xuICAgICAgfVxuXG4gICAgICAvLyBFeHRyYWN0IHJlcG9zaXRvcnkgbmFtZSBmcm9tIHBhdGhcbiAgICAgIGNvbnN0IF9yZXBvTmFtZSA9IHBhdGguYmFzZW5hbWUocmVwb1BhdGgpO1xuXG4gICAgICAvLyBVcGRhdGUgc2Vzc2lvbiB0aXRsZXMgZm9yIGFsbCBzZXNzaW9ucyBpbiB0aGUgcmVwb3NpdG9yeVxuICAgICAgZm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zSW5SZXBvKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gR2V0IHRoZSBicmFuY2ggZm9yIHRoaXMgc3BlY2lmaWMgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5XG4gICAgICAgICAgbGV0IF9zZXNzaW9uQnJhbmNoID0gY3VycmVudEJyYW5jaDtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHNlc3Npb25CcmFuY2hPdXRwdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSwge1xuICAgICAgICAgICAgICBjd2Q6IHNlc3Npb24ud29ya2luZ0RpcixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgaWYgKHNlc3Npb25CcmFuY2hPdXRwdXQudHJpbSgpKSB7XG4gICAgICAgICAgICAgIF9zZXNzaW9uQnJhbmNoID0gc2Vzc2lvbkJyYW5jaE91dHB1dC50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgICAvLyBVc2UgY3VycmVudCBicmFuY2ggYXMgZmFsbGJhY2tcbiAgICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgQ291bGQgbm90IGdldCBicmFuY2ggZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfSwgdXNpbmcgcmVwbyBicmFuY2hgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBFeHRyYWN0IGJhc2Ugc2Vzc2lvbiBuYW1lIChyZW1vdmUgYW55IGV4aXN0aW5nIGdpdCBpbmZvIGluIHNxdWFyZSBicmFja2V0cyBhdCB0aGUgZW5kKVxuICAgICAgICAgIC8vIFVzZSBhIG1vcmUgc3BlY2lmaWMgcmVnZXggdG8gb25seSBtYXRjaCBnaXQtcmVsYXRlZCBjb250ZW50IGluIGJyYWNrZXRzXG4gICAgICAgICAgY29uc3QgYmFzZVNlc3Npb25OYW1lID1cbiAgICAgICAgICAgIHNlc3Npb24ubmFtZT8ucmVwbGFjZShcbiAgICAgICAgICAgICAgL1xccypcXFsoY2hlY2tvdXR8YnJhbmNofG1lcmdlfHJlYmFzZXxjb21taXR8cHVzaHxwdWxsfGZldGNofHN0YXNofHJlc2V0fGNoZXJyeS1waWNrKTpbXlxcXV0rXFxdXFxzKiQvLFxuICAgICAgICAgICAgICAnJ1xuICAgICAgICAgICAgKSB8fCAnVGVybWluYWwnO1xuXG4gICAgICAgICAgLy8gQ29uc3RydWN0IG5ldyB0aXRsZSB3aXRoIGZvcm1hdDogYmFzZVNlc3Npb25OYW1lIFtldmVudDogYnJhbmNoXVxuICAgICAgICAgIGxldCBuZXdUaXRsZSA9IGJhc2VTZXNzaW9uTmFtZTtcbiAgICAgICAgICBpZiAoZXZlbnQgJiYgYnJhbmNoKSB7XG4gICAgICAgICAgICBuZXdUaXRsZSA9IGAke2Jhc2VTZXNzaW9uTmFtZX0gWyR7ZXZlbnR9OiAke2JyYW5jaH1dYDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBVcGRhdGUgdGhlIHNlc3Npb24gbmFtZVxuICAgICAgICAgIHNlc3Npb25NYW5hZ2VyLnVwZGF0ZVNlc3Npb25OYW1lKHNlc3Npb24uaWQsIG5ld1RpdGxlKTtcbiAgICAgICAgICB1cGRhdGVkU2Vzc2lvbklkcy5wdXNoKHNlc3Npb24uaWQpO1xuXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBVcGRhdGVkIHNlc3Npb24gJHtzZXNzaW9uLmlkfSB0aXRsZSB0bzogJHtuZXdUaXRsZX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byB1cGRhdGUgc2Vzc2lvbiAke3Nlc3Npb24uaWR9OmAsIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBIYW5kbGUgZm9sbG93IG1vZGUgc3luYyBsb2dpY1xuICAgICAgaWYgKGZvbGxvd01vZGUgJiYgZm9sbG93V29ya3RyZWUpIHtcbiAgICAgICAgbG9nZ2VyLmluZm8oYEZvbGxvdyBtb2RlIGFjdGl2ZTogcHJvY2Vzc2luZyBldmVudCBmcm9tICR7cmVwb1BhdGh9YCk7XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIHJlcG8gd2UncmUgaW4gYW5kIHdoaWNoIGRpcmVjdGlvbiB0byBzeW5jXG4gICAgICAgIGlmIChyZXBvUGF0aCA9PT0gZm9sbG93V29ya3RyZWUgJiYgaXNXb3JrdHJlZVJlcG8pIHtcbiAgICAgICAgICAvLyBFdmVudCBmcm9tIHdvcmt0cmVlIC0gc3luYyB0byBtYWluIHJlcG9cbiAgICAgICAgICBsb2dnZXIuaW5mbyhgU3luY2luZyBmcm9tIHdvcmt0cmVlIHRvIG1haW4gcmVwb2ApO1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEZpbmQgdGhlIG1haW4gcmVwbyBwYXRoXG4gICAgICAgICAgICBjb25zdCB7IHN0ZG91dDogZ2l0RGlyT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsncmV2LXBhcnNlJywgJy0tZ2l0LWRpciddLCB7XG4gICAgICAgICAgICAgIGN3ZDogcmVwb1BhdGgsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGdpdERpciA9IGdpdERpck91dHB1dC50cmltKCk7XG4gICAgICAgICAgICBjb25zdCBtYWluUmVwb1BhdGggPSBnaXREaXIucmVwbGFjZSgvXFwvXFwuZ2l0XFwvd29ya3RyZWVzXFwvLiokLywgJycpO1xuXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGN1cnJlbnQgYnJhbmNoIGluIHdvcmt0cmVlXG4gICAgICAgICAgICBjb25zdCB7IHN0ZG91dDogd29ya3RyZWVCcmFuY2hPdXRwdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSwge1xuICAgICAgICAgICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCB3b3JrdHJlZUJyYW5jaCA9IHdvcmt0cmVlQnJhbmNoT3V0cHV0LnRyaW0oKTtcblxuICAgICAgICAgICAgaWYgKHdvcmt0cmVlQnJhbmNoKSB7XG4gICAgICAgICAgICAgIC8vIFN5bmMgbWFpbiByZXBvIHRvIHdvcmt0cmVlJ3MgYnJhbmNoXG4gICAgICAgICAgICAgIGxvZ2dlci5pbmZvKGBTeW5jaW5nIG1haW4gcmVwbyB0byBicmFuY2g6ICR7d29ya3RyZWVCcmFuY2h9YCk7XG4gICAgICAgICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjaGVja291dCcsIHdvcmt0cmVlQnJhbmNoXSwgeyBjd2Q6IG1haW5SZXBvUGF0aCB9KTtcblxuICAgICAgICAgICAgICAvLyBQdWxsIGxhdGVzdCBjaGFuZ2VzIGluIG1haW4gcmVwb1xuICAgICAgICAgICAgICBhd2FpdCBleGVjR2l0KFsncHVsbCcsICctLWZmLW9ubHknXSwgeyBjd2Q6IG1haW5SZXBvUGF0aCB9KTtcblxuICAgICAgICAgICAgICAvLyBTZW5kIHN5bmMgc3VjY2VzcyBub3RpZmljYXRpb25cbiAgICAgICAgICAgICAgY29uc3Qgc3luY05vdGlmID0ge1xuICAgICAgICAgICAgICAgIGxldmVsOiAnaW5mbycgYXMgY29uc3QsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICdNYWluIFJlcG9zaXRvcnkgU3luY2VkJyxcbiAgICAgICAgICAgICAgICBtZXNzYWdlOiBgTWFpbiByZXBvc2l0b3J5IHN5bmNlZCB0byBicmFuY2ggJyR7d29ya3RyZWVCcmFuY2h9J2AsXG4gICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3luY05vdGlmaWNhdGlvbiA9IGNyZWF0ZUNvbnRyb2xFdmVudCgnc3lzdGVtJywgJ25vdGlmaWNhdGlvbicsIHN5bmNOb3RpZik7XG4gICAgICAgICAgICAgICAgY29udHJvbFVuaXhIYW5kbGVyLnNlbmRUb01hYyhzeW5jTm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwZW5kaW5nTm90aWZpY2F0aW9ucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICAgIG5vdGlmaWNhdGlvbjogc3luY05vdGlmLFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHN5bmMgZnJvbSB3b3JrdHJlZSB0byBtYWluOicsIGVycm9yKTtcblxuICAgICAgICAgICAgLy8gU2VuZCBlcnJvciBub3RpZmljYXRpb25cbiAgICAgICAgICAgIGNvbnN0IGVycm9yTm90aWYgPSB7XG4gICAgICAgICAgICAgIGxldmVsOiAnZXJyb3InIGFzIGNvbnN0LFxuICAgICAgICAgICAgICB0aXRsZTogJ1N5bmMgRmFpbGVkJyxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYEZhaWxlZCB0byBzeW5jIG1haW4gcmVwb3NpdG9yeTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJ31gLFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGVycm9yTm90aWZpY2F0aW9uID0gY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnbm90aWZpY2F0aW9uJywgZXJyb3JOb3RpZik7XG4gICAgICAgICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kVG9NYWMoZXJyb3JOb3RpZmljYXRpb24pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIG5vdGlmaWNhdGlvbjogZXJyb3JOb3RpZixcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGlzTWFpblJlcG8gJiYgZXZlbnQgPT09ICdjb21taXQnKSB7XG4gICAgICAgICAgLy8gRXZlbnQgZnJvbSBtYWluIHJlcG8gKGNvbW1pdCBvbmx5KSAtIHN5bmMgdG8gd29ya3RyZWVcbiAgICAgICAgICBsb2dnZXIuaW5mbyhgU3luY2luZyBjb21taXQgZnJvbSBtYWluIHJlcG8gdG8gd29ya3RyZWVgKTtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQdWxsIGxhdGVzdCBjaGFuZ2VzIGluIHdvcmt0cmVlXG4gICAgICAgICAgICBhd2FpdCBleGVjR2l0KFsncHVsbCcsICctLWZmLW9ubHknXSwgeyBjd2Q6IGZvbGxvd1dvcmt0cmVlIH0pO1xuXG4gICAgICAgICAgICAvLyBTZW5kIHN5bmMgc3VjY2VzcyBub3RpZmljYXRpb25cbiAgICAgICAgICAgIGNvbnN0IHN5bmNOb3RpZiA9IHtcbiAgICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgdGl0bGU6ICdXb3JrdHJlZSBTeW5jZWQnLFxuICAgICAgICAgICAgICBtZXNzYWdlOiBgV29ya3RyZWUgc3luY2VkIHdpdGggbGF0ZXN0IGNvbW1pdHNgLFxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHN5bmNOb3RpZmljYXRpb24gPSBjcmVhdGVDb250cm9sRXZlbnQoJ3N5c3RlbScsICdub3RpZmljYXRpb24nLCBzeW5jTm90aWYpO1xuICAgICAgICAgICAgICBjb250cm9sVW5peEhhbmRsZXIuc2VuZFRvTWFjKHN5bmNOb3RpZmljYXRpb24pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnMucHVzaCh7XG4gICAgICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIG5vdGlmaWNhdGlvbjogc3luY05vdGlmLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc3luYyBjb21taXQgdG8gd29ya3RyZWU6JywgZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChpc01haW5SZXBvICYmIGV2ZW50ID09PSAnY2hlY2tvdXQnKSB7XG4gICAgICAgICAgLy8gQnJhbmNoIHN3aXRjaCBpbiBtYWluIHJlcG8gLSBkaXNhYmxlIGZvbGxvdyBtb2RlXG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0JyYW5jaCBzd2l0Y2hlZCBpbiBtYWluIHJlcG8sIGRpc2FibGluZyBmb2xsb3cgbW9kZScpO1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjb25maWcnLCAnLS1sb2NhbCcsICctLXVuc2V0JywgJ3ZpYmV0dW5uZWwuZm9sbG93V29ya3RyZWUnXSwge1xuICAgICAgICAgICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGZvbGxvd01vZGUgPSBmYWxzZTtcbiAgICAgICAgICAgIGZvbGxvd1dvcmt0cmVlID0gdW5kZWZpbmVkO1xuXG4gICAgICAgICAgICAvLyBTZW5kIG5vdGlmaWNhdGlvbiBhYm91dCBmb2xsb3cgbW9kZSBiZWluZyBkaXNhYmxlZFxuICAgICAgICAgICAgY29uc3QgZGlzYWJsZU5vdGlmID0ge1xuICAgICAgICAgICAgICBsZXZlbDogJ2luZm8nIGFzIGNvbnN0LFxuICAgICAgICAgICAgICB0aXRsZTogJ0ZvbGxvdyBNb2RlIERpc2FibGVkJyxcbiAgICAgICAgICAgICAgbWVzc2FnZTogYEZvbGxvdyBtb2RlIGRpc2FibGVkIGR1ZSB0byBicmFuY2ggc3dpdGNoIGluIG1haW4gcmVwb3NpdG9yeWAsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAoY29udHJvbFVuaXhIYW5kbGVyLmlzTWFjQXBwQ29ubmVjdGVkKCkpIHtcbiAgICAgICAgICAgICAgY29uc3QgZGlzYWJsZU5vdGlmaWNhdGlvbiA9IGNyZWF0ZUNvbnRyb2xFdmVudChcbiAgICAgICAgICAgICAgICAnc3lzdGVtJyxcbiAgICAgICAgICAgICAgICAnbm90aWZpY2F0aW9uJyxcbiAgICAgICAgICAgICAgICBkaXNhYmxlTm90aWZcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgY29udHJvbFVuaXhIYW5kbGVyLnNlbmRUb01hYyhkaXNhYmxlTm90aWZpY2F0aW9uKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlbmRpbmdOb3RpZmljYXRpb25zLnB1c2goe1xuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgICBub3RpZmljYXRpb246IGRpc2FibGVOb3RpZixcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGRpc2FibGUgZm9sbG93IG1vZGU6JywgZXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgbm90aWZpY2F0aW9uIHBheWxvYWRcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbjogR2l0RXZlbnROb3RpZmljYXRpb24gPSB7XG4gICAgICAgIHR5cGU6ICdnaXQtZXZlbnQnLFxuICAgICAgICByZXBvUGF0aCxcbiAgICAgICAgYnJhbmNoOiBicmFuY2ggfHwgY3VycmVudEJyYW5jaCxcbiAgICAgICAgZXZlbnQsXG4gICAgICAgIGZvbGxvd01vZGUsXG4gICAgICAgIHNlc3Npb25zVXBkYXRlZDogdXBkYXRlZFNlc3Npb25JZHMsXG4gICAgICB9O1xuXG4gICAgICAvLyBQcmVwYXJlIG5vdGlmaWNhdGlvbnNcbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbnNUb1NlbmQ6IEFycmF5PHtcbiAgICAgICAgbGV2ZWw6ICdpbmZvJyB8ICdlcnJvcic7XG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XG4gICAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICAgIH0+ID0gW107XG5cbiAgICAgIC8vIEFkZCBzcGVjaWZpYyBmb2xsb3cgbW9kZSBub3RpZmljYXRpb25zXG4gICAgICBpZiAoZm9sbG93TW9kZSAmJiBmb2xsb3dXb3JrdHJlZSkge1xuICAgICAgICBjb25zdCB3b3JrdHJlZU5hbWUgPSBwYXRoLmJhc2VuYW1lKGZvbGxvd1dvcmt0cmVlKTtcbiAgICAgICAgbm90aWZpY2F0aW9uc1RvU2VuZC5wdXNoKHtcbiAgICAgICAgICBsZXZlbDogJ2luZm8nLFxuICAgICAgICAgIHRpdGxlOiAnRm9sbG93IE1vZGUgQWN0aXZlJyxcbiAgICAgICAgICBtZXNzYWdlOiBgRm9sbG93aW5nIHdvcmt0cmVlICcke3dvcmt0cmVlTmFtZX0nIGluICR7cGF0aC5iYXNlbmFtZShyZXBvUGF0aCl9YCxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9ucyB2aWEgVW5peCBzb2NrZXQgdG8gTWFjIGFwcCBpZiBjb25uZWN0ZWRcbiAgICAgIGlmIChjb250cm9sVW5peEhhbmRsZXIuaXNNYWNBcHBDb25uZWN0ZWQoKSkge1xuICAgICAgICAvLyBTZW5kIHJlcG9zaXRvcnkgY2hhbmdlZCBldmVudFxuICAgICAgICBjb25zdCBjb250cm9sTWVzc2FnZSA9IGNyZWF0ZUNvbnRyb2xFdmVudCgnZ2l0JywgJ3JlcG9zaXRvcnktY2hhbmdlZCcsIG5vdGlmaWNhdGlvbik7XG4gICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kVG9NYWMoY29udHJvbE1lc3NhZ2UpO1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1NlbnQgZ2l0IGV2ZW50IG5vdGlmaWNhdGlvbiB0byBNYWMgYXBwJyk7XG5cbiAgICAgICAgLy8gU2VuZCBzcGVjaWZpYyBub3RpZmljYXRpb25zXG4gICAgICAgIGZvciAoY29uc3Qgbm90aWYgb2Ygbm90aWZpY2F0aW9uc1RvU2VuZCkge1xuICAgICAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbk1lc3NhZ2UgPSBjcmVhdGVDb250cm9sRXZlbnQoJ3N5c3RlbScsICdub3RpZmljYXRpb24nLCBub3RpZik7XG4gICAgICAgICAgY29udHJvbFVuaXhIYW5kbGVyLnNlbmRUb01hYyhub3RpZmljYXRpb25NZXNzYWdlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU3RvcmUgbm90aWZpY2F0aW9ucyBmb3Igd2ViIFVJIHdoZW4gbWFjT1MgY2xpZW50IGlzIG5vdCBjb25uZWN0ZWRcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgZm9yIChjb25zdCBub3RpZiBvZiBub3RpZmljYXRpb25zVG9TZW5kKSB7XG4gICAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnMucHVzaCh7XG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5vdyxcbiAgICAgICAgICAgIG5vdGlmaWNhdGlvbjogbm90aWYsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBLZWVwIG9ubHkgbm90aWZpY2F0aW9ucyBmcm9tIHRoZSBsYXN0IDUgbWludXRlc1xuICAgICAgICBjb25zdCBmaXZlTWludXRlc0FnbyA9IG5vdyAtIDUgKiA2MCAqIDEwMDA7XG4gICAgICAgIHdoaWxlIChcbiAgICAgICAgICBwZW5kaW5nTm90aWZpY2F0aW9ucy5sZW5ndGggPiAwICYmXG4gICAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnNbMF0udGltZXN0YW1wIDwgZml2ZU1pbnV0ZXNBZ29cbiAgICAgICAgKSB7XG4gICAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnMuc2hpZnQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgU3RvcmVkICR7bm90aWZpY2F0aW9uc1RvU2VuZC5sZW5ndGh9IG5vdGlmaWNhdGlvbnMgZm9yIHdlYiBVSWApO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICByZXBvUGF0aCxcbiAgICAgICAgc2Vzc2lvbnNVcGRhdGVkOiB1cGRhdGVkU2Vzc2lvbklkcy5sZW5ndGgsXG4gICAgICAgIGZvbGxvd01vZGUsXG4gICAgICAgIG5vdGlmaWNhdGlvbixcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGhhbmRsaW5nIGdpdCBldmVudDonLCBlcnJvcik7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBwcm9jZXNzIGdpdCBldmVudCcsXG4gICAgICAgIG1lc3NhZ2U6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSxcbiAgICAgIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICAvLyBBbHdheXMgcmVsZWFzZSB0aGUgbG9ja1xuICAgICAgaWYgKGxvY2tBY3F1aXJlZCAmJiByZXBvUGF0aCkge1xuICAgICAgICByZWxlYXNlUmVwb0xvY2socmVwb1BhdGgpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIEdFVCAvYXBpL2dpdC9ub3RpZmljYXRpb25zXG4gICAqIEdldCBwZW5kaW5nIG5vdGlmaWNhdGlvbnMgZm9yIHRoZSB3ZWIgVUlcbiAgICovXG4gIHJvdXRlci5nZXQoJy9naXQvbm90aWZpY2F0aW9ucycsIGFzeW5jIChfcmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgLy8gQ2xlYW4gdXAgb2xkIG5vdGlmaWNhdGlvbnMgKG9sZGVyIHRoYW4gNSBtaW51dGVzKVxuICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICAgIGNvbnN0IGZpdmVNaW51dGVzQWdvID0gbm93IC0gNSAqIDYwICogMTAwMDtcbiAgICAgIHdoaWxlIChcbiAgICAgICAgcGVuZGluZ05vdGlmaWNhdGlvbnMubGVuZ3RoID4gMCAmJlxuICAgICAgICBwZW5kaW5nTm90aWZpY2F0aW9uc1swXS50aW1lc3RhbXAgPCBmaXZlTWludXRlc0Fnb1xuICAgICAgKSB7XG4gICAgICAgIHBlbmRpbmdOb3RpZmljYXRpb25zLnNoaWZ0KCk7XG4gICAgICB9XG5cbiAgICAgIC8vIFJldHVybiBjdXJyZW50IG5vdGlmaWNhdGlvbnMgYW5kIGNsZWFyIHRoZW1cbiAgICAgIGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBwZW5kaW5nTm90aWZpY2F0aW9ucy5tYXAoKG4pID0+IG4ubm90aWZpY2F0aW9uKTtcbiAgICAgIHBlbmRpbmdOb3RpZmljYXRpb25zLmxlbmd0aCA9IDA7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgUmV0dXJuaW5nICR7bm90aWZpY2F0aW9ucy5sZW5ndGh9IHBlbmRpbmcgbm90aWZpY2F0aW9uc2ApO1xuICAgICAgcmVzLmpzb24oeyBub3RpZmljYXRpb25zIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIG5vdGlmaWNhdGlvbnM6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggbm90aWZpY2F0aW9ucycsXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHRVQgL2FwaS9naXQvc3RhdHVzXG4gICAqIEdldCByZXBvc2l0b3J5IHN0YXR1cyB3aXRoIGZpbGUgY291bnRzIGFuZCBicmFuY2ggaW5mb1xuICAgKi9cbiAgcm91dGVyLmdldCgnL2dpdC9zdGF0dXMnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBwYXRoOiBxdWVyeVBhdGggfSA9IHJlcS5xdWVyeTtcblxuICAgICAgaWYgKCFxdWVyeVBhdGggfHwgdHlwZW9mIHF1ZXJ5UGF0aCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ01pc3Npbmcgb3IgaW52YWxpZCBwYXRoIHBhcmFtZXRlcicsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXNvbHZlIHRoZSBwYXRoIHRvIGFic29sdXRlXG4gICAgICBjb25zdCBhYnNvbHV0ZVBhdGggPSByZXNvbHZlQWJzb2x1dGVQYXRoKHF1ZXJ5UGF0aCk7XG4gICAgICBsb2dnZXIuZGVidWcoYEdldHRpbmcgZ2l0IHN0YXR1cyBmb3IgcGF0aDogJHthYnNvbHV0ZVBhdGh9YCk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEdldCByZXBvc2l0b3J5IHJvb3RcbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHJlcG9QYXRoT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsncmV2LXBhcnNlJywgJy0tc2hvdy10b3BsZXZlbCddLCB7XG4gICAgICAgICAgY3dkOiBhYnNvbHV0ZVBhdGgsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCByZXBvUGF0aCA9IHJlcG9QYXRoT3V0cHV0LnRyaW0oKTtcblxuICAgICAgICAvLyBHZXQgY3VycmVudCBicmFuY2hcbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IGJyYW5jaE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ2JyYW5jaCcsICctLXNob3ctY3VycmVudCddLCB7XG4gICAgICAgICAgY3dkOiByZXBvUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGN1cnJlbnRCcmFuY2ggPSBicmFuY2hPdXRwdXQudHJpbSgpO1xuXG4gICAgICAgIC8vIEdldCBzdGF0dXMgaW4gcG9yY2VsYWluIGZvcm1hdFxuICAgICAgICBjb25zdCB7IHN0ZG91dDogc3RhdHVzT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJ10sIHtcbiAgICAgICAgICBjd2Q6IHJlcG9QYXRoLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBQYXJzZSBzdGF0dXMgb3V0cHV0XG4gICAgICAgIGNvbnN0IGxpbmVzID0gc3RhdHVzT3V0cHV0XG4gICAgICAgICAgLnRyaW0oKVxuICAgICAgICAgIC5zcGxpdCgnXFxuJylcbiAgICAgICAgICAuZmlsdGVyKChsaW5lKSA9PiBsaW5lLmxlbmd0aCA+IDApO1xuICAgICAgICBsZXQgbW9kaWZpZWRDb3VudCA9IDA7XG4gICAgICAgIGxldCB1bnRyYWNrZWRDb3VudCA9IDA7XG4gICAgICAgIGxldCBzdGFnZWRDb3VudCA9IDA7XG4gICAgICAgIGxldCBhZGRlZENvdW50ID0gMDtcbiAgICAgICAgbGV0IGRlbGV0ZWRDb3VudCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgaWYgKGxpbmUubGVuZ3RoIDwgMikgY29udGludWU7XG5cbiAgICAgICAgICBjb25zdCBpbmRleFN0YXR1cyA9IGxpbmVbMF07XG4gICAgICAgICAgY29uc3Qgd29ya1RyZWVTdGF0dXMgPSBsaW5lWzFdO1xuXG4gICAgICAgICAgLy8gU3RhZ2VkIGNoYW5nZXNcbiAgICAgICAgICBpZiAoaW5kZXhTdGF0dXMgIT09ICcgJyAmJiBpbmRleFN0YXR1cyAhPT0gJz8nKSB7XG4gICAgICAgICAgICBzdGFnZWRDb3VudCsrO1xuXG4gICAgICAgICAgICAvLyBDb3VudCBzcGVjaWZpYyB0eXBlcyBvZiBzdGFnZWQgY2hhbmdlc1xuICAgICAgICAgICAgaWYgKGluZGV4U3RhdHVzID09PSAnQScpIHtcbiAgICAgICAgICAgICAgYWRkZWRDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleFN0YXR1cyA9PT0gJ0QnKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZWRDb3VudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFdvcmtpbmcgdHJlZSBjaGFuZ2VzXG4gICAgICAgICAgaWYgKHdvcmtUcmVlU3RhdHVzID09PSAnTScpIHtcbiAgICAgICAgICAgIG1vZGlmaWVkQ291bnQrKztcbiAgICAgICAgICB9IGVsc2UgaWYgKHdvcmtUcmVlU3RhdHVzID09PSAnRCcgJiYgaW5kZXhTdGF0dXMgPT09ICcgJykge1xuICAgICAgICAgICAgLy8gRGVsZXRlZCBpbiB3b3JraW5nIHRyZWUgYnV0IG5vdCBzdGFnZWRcbiAgICAgICAgICAgIGRlbGV0ZWRDb3VudCsrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFVudHJhY2tlZCBmaWxlc1xuICAgICAgICAgIGlmIChpbmRleFN0YXR1cyA9PT0gJz8nICYmIHdvcmtUcmVlU3RhdHVzID09PSAnPycpIHtcbiAgICAgICAgICAgIHVudHJhY2tlZENvdW50Kys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gR2V0IGFoZWFkL2JlaGluZCBjb3VudHNcbiAgICAgICAgbGV0IGFoZWFkQ291bnQgPSAwO1xuICAgICAgICBsZXQgYmVoaW5kQ291bnQgPSAwO1xuICAgICAgICBsZXQgaGFzVXBzdHJlYW0gPSBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIENoZWNrIGlmIHdlIGhhdmUgYW4gdXBzdHJlYW0gYnJhbmNoXG4gICAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHVwc3RyZWFtT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFxuICAgICAgICAgICAgWydyZXYtcGFyc2UnLCAnLS1hYmJyZXYtcmVmJywgJy0tc3ltYm9saWMtZnVsbC1uYW1lJywgJ0B7dX0nXSxcbiAgICAgICAgICAgIHsgY3dkOiByZXBvUGF0aCB9XG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGlmICh1cHN0cmVhbU91dHB1dC50cmltKCkpIHtcbiAgICAgICAgICAgIGhhc1Vwc3RyZWFtID0gdHJ1ZTtcblxuICAgICAgICAgICAgLy8gR2V0IGFoZWFkL2JlaGluZCBjb3VudHNcbiAgICAgICAgICAgIGNvbnN0IHsgc3Rkb3V0OiBhaGVhZEJlaGluZE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChcbiAgICAgICAgICAgICAgWydyZXYtbGlzdCcsICctLWxlZnQtcmlnaHQnLCAnLS1jb3VudCcsICdIRUFELi4uQHt1fSddLFxuICAgICAgICAgICAgICB7IGN3ZDogcmVwb1BhdGggfVxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgY29uc3QgW2FoZWFkLCBiZWhpbmRdID0gYWhlYWRCZWhpbmRPdXRwdXRcbiAgICAgICAgICAgICAgLnRyaW0oKVxuICAgICAgICAgICAgICAuc3BsaXQoJ1xcdCcpXG4gICAgICAgICAgICAgIC5tYXAoKG4pID0+IE51bWJlci5wYXJzZUludChuLCAxMCkpO1xuICAgICAgICAgICAgYWhlYWRDb3VudCA9IGFoZWFkIHx8IDA7XG4gICAgICAgICAgICBiZWhpbmRDb3VudCA9IGJlaGluZCB8fCAwO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgICAgLy8gTm8gdXBzdHJlYW0gYnJhbmNoIGNvbmZpZ3VyZWRcbiAgICAgICAgICBsb2dnZXIuZGVidWcoJ05vIHVwc3RyZWFtIGJyYW5jaCBjb25maWd1cmVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgIGlzR2l0UmVwbzogdHJ1ZSxcbiAgICAgICAgICByZXBvUGF0aCxcbiAgICAgICAgICBjdXJyZW50QnJhbmNoLFxuICAgICAgICAgIGhhc0NoYW5nZXM6IGxpbmVzLmxlbmd0aCA+IDAsXG4gICAgICAgICAgbW9kaWZpZWRDb3VudCxcbiAgICAgICAgICB1bnRyYWNrZWRDb3VudCxcbiAgICAgICAgICBzdGFnZWRDb3VudCxcbiAgICAgICAgICBhZGRlZENvdW50LFxuICAgICAgICAgIGRlbGV0ZWRDb3VudCxcbiAgICAgICAgICBhaGVhZENvdW50LFxuICAgICAgICAgIGJlaGluZENvdW50LFxuICAgICAgICAgIGhhc1Vwc3RyZWFtLFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChpc05vdEdpdFJlcG9zaXRvcnlFcnJvcihlcnJvcikpIHtcbiAgICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgICAgaXNHaXRSZXBvOiBmYWxzZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBnZXR0aW5nIGdpdCBzdGF0dXM6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IGdpdCBzdGF0dXMnLFxuICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHRVQgL2FwaS9naXQvcmVtb3RlXG4gICAqIEdldCByZW1vdGUgVVJMIGZvciBhIHJlcG9zaXRvcnlcbiAgICovXG4gIHJvdXRlci5nZXQoJy9naXQvcmVtb3RlJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcGF0aDogcXVlcnlQYXRoIH0gPSByZXEucXVlcnk7XG5cbiAgICAgIGlmICghcXVlcnlQYXRoIHx8IHR5cGVvZiBxdWVyeVBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgcGF0aCBwYXJhbWV0ZXInLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVzb2x2ZSB0aGUgcGF0aCB0byBhYnNvbHV0ZVxuICAgICAgY29uc3QgYWJzb2x1dGVQYXRoID0gcmVzb2x2ZUFic29sdXRlUGF0aChxdWVyeVBhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBHZXR0aW5nIGdpdCByZW1vdGUgZm9yIHBhdGg6ICR7YWJzb2x1dGVQYXRofWApO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBHZXQgcmVwb3NpdG9yeSByb290XG4gICAgICAgIGNvbnN0IHsgc3Rkb3V0OiByZXBvUGF0aE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3Jldi1wYXJzZScsICctLXNob3ctdG9wbGV2ZWwnXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgcmVwb1BhdGggPSByZXBvUGF0aE91dHB1dC50cmltKCk7XG5cbiAgICAgICAgLy8gR2V0IHJlbW90ZSBVUkxcbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHJlbW90ZU91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3JlbW90ZScsICdnZXQtdXJsJywgJ29yaWdpbiddLCB7XG4gICAgICAgICAgY3dkOiByZXBvUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9IHJlbW90ZU91dHB1dC50cmltKCk7XG5cbiAgICAgICAgLy8gUGFyc2UgR2l0SHViIFVSTCBmcm9tIHJlbW90ZSBVUkxcbiAgICAgICAgbGV0IGdpdGh1YlVybDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgICAgIGlmIChyZW1vdGVVcmwpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgSFRUUFMgVVJMczogaHR0cHM6Ly9naXRodWIuY29tL3VzZXIvcmVwby5naXRcbiAgICAgICAgICBpZiAocmVtb3RlVXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vZ2l0aHViLmNvbS8nKSkge1xuICAgICAgICAgICAgZ2l0aHViVXJsID0gcmVtb3RlVXJsLmVuZHNXaXRoKCcuZ2l0JykgPyByZW1vdGVVcmwuc2xpY2UoMCwgLTQpIDogcmVtb3RlVXJsO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBIYW5kbGUgU1NIIFVSTHM6IGdpdEBnaXRodWIuY29tOnVzZXIvcmVwby5naXRcbiAgICAgICAgICBlbHNlIGlmIChyZW1vdGVVcmwuc3RhcnRzV2l0aCgnZ2l0QGdpdGh1Yi5jb206JykpIHtcbiAgICAgICAgICAgIGNvbnN0IHBhdGhQYXJ0ID0gcmVtb3RlVXJsLnN1YnN0cmluZygnZ2l0QGdpdGh1Yi5jb206Jy5sZW5ndGgpO1xuICAgICAgICAgICAgY29uc3QgY2xlYW5QYXRoID0gcGF0aFBhcnQuZW5kc1dpdGgoJy5naXQnKSA/IHBhdGhQYXJ0LnNsaWNlKDAsIC00KSA6IHBhdGhQYXJ0O1xuICAgICAgICAgICAgZ2l0aHViVXJsID0gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke2NsZWFuUGF0aH1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgICAgaXNHaXRSZXBvOiB0cnVlLFxuICAgICAgICAgIHJlcG9QYXRoLFxuICAgICAgICAgIHJlbW90ZVVybCxcbiAgICAgICAgICBnaXRodWJVcmwsXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGlzTm90R2l0UmVwb3NpdG9yeUVycm9yKGVycm9yKSkge1xuICAgICAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgICAgICBpc0dpdFJlcG86IGZhbHNlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyBqdXN0IG1pc3NpbmcgcmVtb3RlXG4gICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcbiAgICAgICAgaWYgKGVycm9yTWVzc2FnZS5pbmNsdWRlcygnTm8gc3VjaCByZW1vdGUnKSkge1xuICAgICAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgICAgICBpc0dpdFJlcG86IHRydWUsXG4gICAgICAgICAgICByZW1vdGVVcmw6IG51bGwsXG4gICAgICAgICAgICBnaXRodWJVcmw6IG51bGwsXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBnZXR0aW5nIGdpdCByZW1vdGU6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IGdpdCByZW1vdGUnLFxuICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHRVQgL2FwaS9naXQvcmVwb3NpdG9yeS1pbmZvXG4gICAqIEdldCBjb21wcmVoZW5zaXZlIHJlcG9zaXRvcnkgaW5mb3JtYXRpb24gKGNvbWJpbmVzIG11bHRpcGxlIGdpdCBjb21tYW5kcylcbiAgICovXG4gIHJvdXRlci5nZXQoJy9naXQvcmVwb3NpdG9yeS1pbmZvJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgcGF0aDogcXVlcnlQYXRoIH0gPSByZXEucXVlcnk7XG5cbiAgICAgIGlmICghcXVlcnlQYXRoIHx8IHR5cGVvZiBxdWVyeVBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdNaXNzaW5nIG9yIGludmFsaWQgcGF0aCBwYXJhbWV0ZXInLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gUmVzb2x2ZSB0aGUgcGF0aCB0byBhYnNvbHV0ZVxuICAgICAgY29uc3QgYWJzb2x1dGVQYXRoID0gcmVzb2x2ZUFic29sdXRlUGF0aChxdWVyeVBhdGgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBHZXR0aW5nIGNvbXByZWhlbnNpdmUgZ2l0IGluZm8gZm9yIHBhdGg6ICR7YWJzb2x1dGVQYXRofWApO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBHZXQgcmVwb3NpdG9yeSByb290XG4gICAgICAgIGNvbnN0IHsgc3Rkb3V0OiByZXBvUGF0aE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3Jldi1wYXJzZScsICctLXNob3ctdG9wbGV2ZWwnXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVQYXRoLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgcmVwb1BhdGggPSByZXBvUGF0aE91dHB1dC50cmltKCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHdvcmt0cmVlXG4gICAgICAgIGNvbnN0IHdvcmt0cmVlU3RhdHVzID0gYXdhaXQgaXNXb3JrdHJlZShyZXBvUGF0aCk7XG5cbiAgICAgICAgLy8gR2F0aGVyIGFsbCBpbmZvcm1hdGlvbiBpbiBwYXJhbGxlbFxuICAgICAgICBjb25zdCBbYnJhbmNoUmVzdWx0LCBzdGF0dXNSZXN1bHQsIHJlbW90ZVJlc3VsdCwgYWhlYWRCZWhpbmRSZXN1bHRdID1cbiAgICAgICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuICAgICAgICAgICAgLy8gQ3VycmVudCBicmFuY2hcbiAgICAgICAgICAgIGV4ZWNHaXQoWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSwgeyBjd2Q6IHJlcG9QYXRoIH0pLFxuICAgICAgICAgICAgLy8gU3RhdHVzXG4gICAgICAgICAgICBleGVjR2l0KFsnc3RhdHVzJywgJy0tcG9yY2VsYWluPXYxJ10sIHsgY3dkOiByZXBvUGF0aCB9KSxcbiAgICAgICAgICAgIC8vIFJlbW90ZSBVUkxcbiAgICAgICAgICAgIGV4ZWNHaXQoWydyZW1vdGUnLCAnZ2V0LXVybCcsICdvcmlnaW4nXSwgeyBjd2Q6IHJlcG9QYXRoIH0pLFxuICAgICAgICAgICAgLy8gQWhlYWQvYmVoaW5kIGNvdW50c1xuICAgICAgICAgICAgZXhlY0dpdChbJ3Jldi1saXN0JywgJy0tbGVmdC1yaWdodCcsICctLWNvdW50JywgJ0hFQUQuLi5Ae3V9J10sIHsgY3dkOiByZXBvUGF0aCB9KSxcbiAgICAgICAgICBdKTtcblxuICAgICAgICAvLyBQcm9jZXNzIHJlc3VsdHNcbiAgICAgICAgY29uc3QgY3VycmVudEJyYW5jaCA9XG4gICAgICAgICAgYnJhbmNoUmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgPyBicmFuY2hSZXN1bHQudmFsdWUuc3Rkb3V0LnRyaW0oKSA6IG51bGw7XG5cbiAgICAgICAgLy8gUGFyc2Ugc3RhdHVzXG4gICAgICAgIGxldCBtb2RpZmllZENvdW50ID0gMDtcbiAgICAgICAgbGV0IHVudHJhY2tlZENvdW50ID0gMDtcbiAgICAgICAgbGV0IHN0YWdlZENvdW50ID0gMDtcbiAgICAgICAgbGV0IGFkZGVkQ291bnQgPSAwO1xuICAgICAgICBsZXQgZGVsZXRlZENvdW50ID0gMDtcbiAgICAgICAgbGV0IGhhc0NoYW5nZXMgPSBmYWxzZTtcblxuICAgICAgICBpZiAoc3RhdHVzUmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcbiAgICAgICAgICBjb25zdCBsaW5lcyA9IHN0YXR1c1Jlc3VsdC52YWx1ZS5zdGRvdXRcbiAgICAgICAgICAgIC50cmltKClcbiAgICAgICAgICAgIC5zcGxpdCgnXFxuJylcbiAgICAgICAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUubGVuZ3RoID4gMCk7XG4gICAgICAgICAgaGFzQ2hhbmdlcyA9IGxpbmVzLmxlbmd0aCA+IDA7XG5cbiAgICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIGlmIChsaW5lLmxlbmd0aCA8IDIpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBjb25zdCBpbmRleFN0YXR1cyA9IGxpbmVbMF07XG4gICAgICAgICAgICBjb25zdCB3b3JrVHJlZVN0YXR1cyA9IGxpbmVbMV07XG5cbiAgICAgICAgICAgIGlmIChpbmRleFN0YXR1cyAhPT0gJyAnICYmIGluZGV4U3RhdHVzICE9PSAnPycpIHtcbiAgICAgICAgICAgICAgc3RhZ2VkQ291bnQrKztcblxuICAgICAgICAgICAgICBpZiAoaW5kZXhTdGF0dXMgPT09ICdBJykge1xuICAgICAgICAgICAgICAgIGFkZGVkQ291bnQrKztcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChpbmRleFN0YXR1cyA9PT0gJ0QnKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlZENvdW50Kys7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHdvcmtUcmVlU3RhdHVzID09PSAnTScpIHtcbiAgICAgICAgICAgICAgbW9kaWZpZWRDb3VudCsrO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh3b3JrVHJlZVN0YXR1cyA9PT0gJ0QnICYmIGluZGV4U3RhdHVzID09PSAnICcpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZENvdW50Kys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpbmRleFN0YXR1cyA9PT0gJz8nICYmIHdvcmtUcmVlU3RhdHVzID09PSAnPycpIHtcbiAgICAgICAgICAgICAgdW50cmFja2VkQ291bnQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdGUgVVJMXG4gICAgICAgIGNvbnN0IHJlbW90ZVVybCA9XG4gICAgICAgICAgcmVtb3RlUmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgPyByZW1vdGVSZXN1bHQudmFsdWUuc3Rkb3V0LnRyaW0oKSA6IG51bGw7XG5cbiAgICAgICAgLy8gQWhlYWQvYmVoaW5kIGNvdW50c1xuICAgICAgICBsZXQgYWhlYWRDb3VudCA9IDA7XG4gICAgICAgIGxldCBiZWhpbmRDb3VudCA9IDA7XG4gICAgICAgIGxldCBoYXNVcHN0cmVhbSA9IGZhbHNlO1xuXG4gICAgICAgIGlmIChhaGVhZEJlaGluZFJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG4gICAgICAgICAgaGFzVXBzdHJlYW0gPSB0cnVlO1xuICAgICAgICAgIGNvbnN0IFthaGVhZCwgYmVoaW5kXSA9IGFoZWFkQmVoaW5kUmVzdWx0LnZhbHVlLnN0ZG91dFxuICAgICAgICAgICAgLnRyaW0oKVxuICAgICAgICAgICAgLnNwbGl0KCdcXHQnKVxuICAgICAgICAgICAgLm1hcCgobikgPT4gTnVtYmVyLnBhcnNlSW50KG4sIDEwKSk7XG4gICAgICAgICAgYWhlYWRDb3VudCA9IGFoZWFkIHx8IDA7XG4gICAgICAgICAgYmVoaW5kQ291bnQgPSBiZWhpbmQgfHwgMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXMuanNvbih7XG4gICAgICAgICAgaXNHaXRSZXBvOiB0cnVlLFxuICAgICAgICAgIHJlcG9QYXRoLFxuICAgICAgICAgIGN1cnJlbnRCcmFuY2gsXG4gICAgICAgICAgcmVtb3RlVXJsLFxuICAgICAgICAgIGhhc0NoYW5nZXMsXG4gICAgICAgICAgbW9kaWZpZWRDb3VudCxcbiAgICAgICAgICB1bnRyYWNrZWRDb3VudCxcbiAgICAgICAgICBzdGFnZWRDb3VudCxcbiAgICAgICAgICBhZGRlZENvdW50LFxuICAgICAgICAgIGRlbGV0ZWRDb3VudCxcbiAgICAgICAgICBhaGVhZENvdW50LFxuICAgICAgICAgIGJlaGluZENvdW50LFxuICAgICAgICAgIGhhc1Vwc3RyZWFtLFxuICAgICAgICAgIGlzV29ya3RyZWU6IHdvcmt0cmVlU3RhdHVzLFxuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmIChpc05vdEdpdFJlcG9zaXRvcnlFcnJvcihlcnJvcikpIHtcbiAgICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgICAgaXNHaXRSZXBvOiBmYWxzZSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdFcnJvciBnZXR0aW5nIHJlcG9zaXRvcnkgaW5mbzonLCBlcnJvcik7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBnZXQgcmVwb3NpdG9yeSBpbmZvJyxcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcm91dGVyO1xufVxuIl19