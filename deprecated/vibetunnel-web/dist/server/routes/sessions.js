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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSessionRoutes = createSessionRoutes;
exports.requestTerminalSpawn = requestTerminalSpawn;
const chalk_1 = __importDefault(require("chalk"));
const express_1 = require("express");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const util_1 = require("util");
const terminal_text_formatter_js_1 = require("../../shared/terminal-text-formatter.js");
const types_js_1 = require("../../shared/types.js");
const index_js_1 = require("../pty/index.js");
const tailscale_serve_service_js_1 = require("../services/tailscale-serve-service.js");
const git_info_js_1 = require("../utils/git-info.js");
const git_status_js_1 = require("../utils/git-status.js");
const logger_js_1 = require("../utils/logger.js");
const path_utils_js_1 = require("../utils/path-utils.js");
const session_naming_js_1 = require("../utils/session-naming.js");
const control_protocol_js_1 = require("../websocket/control-protocol.js");
const control_unix_handler_js_1 = require("../websocket/control-unix-handler.js");
const logger = (0, logger_js_1.createLogger)('sessions');
const _execFile = (0, util_1.promisify)(require('child_process').execFile);
// Helper function to resolve path with default fallback
function resolvePath(inputPath, defaultPath) {
    if (!inputPath || inputPath.trim() === '') {
        return defaultPath;
    }
    // Use our utility function to handle tilde expansion and absolute path resolution
    const expanded = (0, path_utils_js_1.resolveAbsolutePath)(inputPath);
    // If the input was relative (not starting with / or ~), resolve it relative to defaultPath
    if (!inputPath.startsWith('/') && !inputPath.startsWith('~')) {
        return path.join(defaultPath, inputPath);
    }
    return expanded;
}
function createSessionRoutes(config) {
    const router = (0, express_1.Router)();
    const { ptyManager, terminalManager, streamWatcher, remoteRegistry, isHQMode, activityMonitor } = config;
    // Server status endpoint
    router.get('/server/status', async (_req, res) => {
        logger.debug('[GET /server/status] Getting server status');
        try {
            const status = {
                macAppConnected: control_unix_handler_js_1.controlUnixHandler.isMacAppConnected(),
                isHQMode,
                version: process.env.VERSION || 'unknown',
            };
            res.json(status);
        }
        catch (error) {
            logger.error('Failed to get server status:', error);
            res.status(500).json({ error: 'Failed to get server status' });
        }
    });
    // Tailscale Serve status endpoint
    router.get('/sessions/tailscale/status', async (_req, res) => {
        logger.debug('[GET /sessions/tailscale/status] Getting Tailscale Serve status');
        try {
            const status = await tailscale_serve_service_js_1.tailscaleServeService.getStatus();
            res.json(status);
        }
        catch (error) {
            logger.error('Failed to get Tailscale Serve status:', error);
            res.status(500).json({ error: 'Failed to get Tailscale Serve status' });
        }
    });
    // List all sessions (aggregate local + remote in HQ mode)
    router.get('/sessions', async (_req, res) => {
        logger.debug('[GET /sessions] Listing all sessions');
        try {
            let allSessions = [];
            // Get local sessions
            const localSessions = ptyManager.listSessions();
            logger.debug(`[GET /sessions] Found ${localSessions.length} local sessions`);
            // Log session names for debugging
            // localSessions.forEach((session) => {
            //   logger.debug(
            //     `[GET /sessions] Session ${session.id}: name="${session.name || 'null'}", workingDir="${session.workingDir}"`
            //   );
            // });
            // Add source info to local sessions and detect Git info if missing
            const localSessionsWithSource = await Promise.all(localSessions.map(async (session) => {
                // If session doesn't have Git info, try to detect it
                if (!session.gitRepoPath && session.workingDir) {
                    try {
                        const gitInfo = await (0, git_info_js_1.detectGitInfo)(session.workingDir);
                        // logger.debug(
                        //   `[GET /sessions] Detected Git info for session ${session.id}: repo=${gitInfo.gitRepoPath}, branch=${gitInfo.gitBranch}`
                        // );
                        return {
                            ...session,
                            ...gitInfo,
                            source: 'local',
                        };
                    }
                    catch (error) {
                        // If Git detection fails, just return session as-is
                        logger.debug(`[GET /sessions] Could not detect Git info for session ${session.id}: ${error}`);
                    }
                }
                return {
                    ...session,
                    source: 'local',
                };
            }));
            allSessions = [...localSessionsWithSource];
            // If in HQ mode, aggregate sessions from all remotes
            if (isHQMode && remoteRegistry) {
                const remotes = remoteRegistry.getRemotes();
                logger.debug(`checking ${remotes.length} remote servers for sessions`);
                // Fetch sessions from each remote in parallel
                const remotePromises = remotes.map(async (remote) => {
                    try {
                        const response = await fetch(`${remote.url}/api/sessions`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000), // 5 second timeout
                        });
                        if (response.ok) {
                            const remoteSessions = (await response.json());
                            logger.debug(`got ${remoteSessions.length} sessions from remote ${remote.name}`);
                            // Track session IDs for this remote
                            const sessionIds = remoteSessions.map((s) => s.id);
                            remoteRegistry.updateRemoteSessions(remote.id, sessionIds);
                            // Add remote info to each session
                            return remoteSessions.map((session) => ({
                                ...session,
                                source: 'remote',
                                remoteId: remote.id,
                                remoteName: remote.name,
                                remoteUrl: remote.url,
                            }));
                        }
                        else {
                            logger.warn(`failed to get sessions from remote ${remote.name}: HTTP ${response.status}`);
                            return [];
                        }
                    }
                    catch (error) {
                        logger.error(`failed to get sessions from remote ${remote.name}:`, error);
                        return [];
                    }
                });
                const remoteResults = await Promise.all(remotePromises);
                const remoteSessions = remoteResults.flat();
                logger.debug(`total remote sessions: ${remoteSessions.length}`);
                allSessions = [...allSessions, ...remoteSessions];
            }
            logger.debug(`returning ${allSessions.length} total sessions`);
            res.json(allSessions);
        }
        catch (error) {
            logger.error('error listing sessions:', error);
            res.status(500).json({ error: 'Failed to list sessions' });
        }
    });
    // Create new session (local or on remote)
    router.post('/sessions', async (req, res) => {
        const { command, workingDir, name, remoteId, spawn_terminal, cols, rows, titleMode } = req.body;
        logger.debug(`creating new session: command=${JSON.stringify(command)}, remoteId=${remoteId || 'local'}, spawn_terminal=${spawn_terminal}, cols=${cols}, rows=${rows}`);
        if (!command || !Array.isArray(command) || command.length === 0) {
            logger.warn('session creation failed: invalid command array');
            return res.status(400).json({ error: 'Command array is required' });
        }
        // Validate command array for security
        try {
            for (const arg of command) {
                if (typeof arg !== 'string') {
                    throw new Error('All command arguments must be strings');
                }
                if (arg.length > 1000) {
                    throw new Error('Command argument exceeds maximum length');
                }
                // Prevent null bytes which can be used for injection
                if (arg.includes('\0')) {
                    throw new Error('Command arguments cannot contain null bytes');
                }
            }
            // Validate the base command
            const baseCommand = command[0];
            if (baseCommand.includes('/') && !baseCommand.startsWith('/')) {
                // Relative paths with directory separators are suspicious
                if (baseCommand.includes('../')) {
                    throw new Error('Command cannot contain directory traversal sequences');
                }
            }
            // Check for command injection patterns in the first argument
            const dangerousPatterns = [
                /[;&|`$()]/, // Command separators and substitution
                /\$\{/, // Parameter expansion
                /\$\(/, // Command substitution
                />\s*\/dev/, // Device redirections
                /2>&1/, // Error redirection
            ];
            for (const pattern of dangerousPatterns) {
                if (pattern.test(baseCommand)) {
                    throw new Error('Command contains potentially dangerous patterns');
                }
            }
        }
        catch (validationError) {
            logger.warn(`session creation failed: command validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
            return res.status(400).json({
                error: 'Invalid command',
                details: validationError instanceof Error ? validationError.message : String(validationError),
            });
        }
        try {
            // If remoteId is specified and we're in HQ mode, forward to remote
            if (remoteId && isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemote(remoteId);
                if (!remote) {
                    logger.warn(`session creation failed: remote ${remoteId} not found`);
                    return res.status(404).json({ error: 'Remote server not found' });
                }
                logger.log(chalk_1.default.blue(`forwarding session creation to remote ${remote.name}`));
                // Forward the request to the remote server
                const startTime = Date.now();
                const response = await fetch(`${remote.url}/api/sessions`, {
                    method: types_js_1.HttpMethod.POST,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${remote.token}`,
                    },
                    body: JSON.stringify({
                        command,
                        workingDir,
                        name,
                        spawn_terminal,
                        cols,
                        rows,
                        titleMode,
                        // Don't forward remoteId to avoid recursion
                    }),
                    signal: AbortSignal.timeout(10000), // 10 second timeout
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                    return res.status(response.status).json(error);
                }
                const result = (await response.json());
                logger.debug(`remote session creation took ${Date.now() - startTime}ms`);
                // Track the session in the remote's sessionIds
                if (result.sessionId) {
                    remoteRegistry.addSessionToRemote(remote.id, result.sessionId);
                }
                res.json(result); // Return sessionId as-is, no namespacing
                return;
            }
            // If spawn_terminal is true, use the control socket for terminal spawning
            if (spawn_terminal) {
                try {
                    // Generate session ID
                    const sessionId = generateSessionId();
                    const resolvedCwd = resolvePath(workingDir, process.cwd());
                    const sessionName = name || (0, session_naming_js_1.generateSessionName)(command, resolvedCwd);
                    // Detect Git information for terminal spawn
                    const gitInfo = await (0, git_info_js_1.detectGitInfo)(resolvedCwd);
                    // Request Mac app to spawn terminal
                    logger.log(chalk_1.default.blue(`requesting terminal spawn with command: ${JSON.stringify(command)}`));
                    const spawnResult = await requestTerminalSpawn({
                        sessionId,
                        sessionName,
                        command,
                        workingDir: resolvedCwd,
                        titleMode,
                        gitRepoPath: gitInfo.gitRepoPath,
                        gitBranch: gitInfo.gitBranch,
                        gitAheadCount: gitInfo.gitAheadCount,
                        gitBehindCount: gitInfo.gitBehindCount,
                        gitHasChanges: gitInfo.gitHasChanges,
                        gitIsWorktree: gitInfo.gitIsWorktree,
                        gitMainRepoPath: gitInfo.gitMainRepoPath,
                    });
                    if (!spawnResult.success) {
                        // Log the error but continue with fallback
                        logger.warn('terminal spawn failed:', spawnResult.error || 'Unknown error');
                        logger.debug('falling back to normal web session');
                    }
                    else {
                        // Wait a bit for the session to be created
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        // Return the session ID - client will poll for the session to appear
                        logger.log(chalk_1.default.green(`terminal spawn requested for session ${sessionId}`));
                        res.json({ sessionId, message: 'Terminal spawn requested' });
                        return;
                    }
                }
                catch (error) {
                    // Log the error but continue with fallback
                    logger.error('error spawning terminal:', error);
                    logger.debug('falling back to normal web session');
                }
            }
            // Create local session
            let cwd = resolvePath(workingDir, process.cwd());
            // Check if the working directory exists, fall back to process.cwd() if not
            if (!fs.existsSync(cwd)) {
                logger.warn(`Working directory '${cwd}' does not exist, using current directory as fallback`);
                cwd = process.cwd();
            }
            const sessionName = name || (0, session_naming_js_1.generateSessionName)(command, cwd);
            // Detect Git information
            const gitInfo = await (0, git_info_js_1.detectGitInfo)(cwd);
            logger.log(chalk_1.default.blue(`creating WEB session: ${command.join(' ')} in ${cwd} (spawn_terminal=${spawn_terminal})`));
            const result = await ptyManager.createSession(command, {
                name: sessionName,
                workingDir: cwd,
                cols,
                rows,
                titleMode,
                gitRepoPath: gitInfo.gitRepoPath,
                gitBranch: gitInfo.gitBranch,
                gitAheadCount: gitInfo.gitAheadCount,
                gitBehindCount: gitInfo.gitBehindCount,
                gitHasChanges: gitInfo.gitHasChanges,
                gitIsWorktree: gitInfo.gitIsWorktree,
                gitMainRepoPath: gitInfo.gitMainRepoPath,
            });
            const { sessionId, sessionInfo } = result;
            logger.log(chalk_1.default.green(`WEB session ${sessionId} created (PID: ${sessionInfo.pid})`));
            // Stream watcher is set up when clients connect to the stream endpoint
            res.json({ sessionId });
        }
        catch (error) {
            logger.error('error creating session:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to create session', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to create session' });
            }
        }
    });
    // Get activity status for all sessions
    router.get('/sessions/activity', async (_req, res) => {
        logger.debug('getting activity status for all sessions');
        try {
            const activityStatus = {};
            // Get local sessions activity
            const localActivity = activityMonitor.getActivityStatus();
            Object.assign(activityStatus, localActivity);
            // If in HQ mode, get activity from remote servers
            if (isHQMode && remoteRegistry) {
                const remotes = remoteRegistry.getRemotes();
                // Fetch activity from each remote in parallel
                const remotePromises = remotes.map(async (remote) => {
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/activity`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (response.ok) {
                            const remoteActivity = await response.json();
                            return {
                                remote: {
                                    id: remote.id,
                                    name: remote.name,
                                    url: remote.url,
                                },
                                activity: remoteActivity,
                            };
                        }
                    }
                    catch (error) {
                        logger.error(`failed to get activity from remote ${remote.name}:`, error);
                    }
                    return null;
                });
                const remoteResults = await Promise.all(remotePromises);
                // Merge remote activity data
                for (const result of remoteResults) {
                    if (result?.activity) {
                        // Merge remote activity data
                        Object.assign(activityStatus, result.activity);
                    }
                }
            }
            res.json(activityStatus);
        }
        catch (error) {
            logger.error('error getting activity status:', error);
            res.status(500).json({ error: 'Failed to get activity status' });
        }
    });
    // Get activity status for a specific session
    router.get('/sessions/:sessionId/activity', async (req, res) => {
        const sessionId = req.params.sessionId;
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/activity`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to get activity from remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const activityStatus = activityMonitor.getSessionActivityStatus(sessionId);
            if (!activityStatus) {
                return res.status(404).json({ error: 'Session not found' });
            }
            res.json(activityStatus);
        }
        catch (error) {
            logger.error(`error getting activity status for session ${sessionId}:`, error);
            res.status(500).json({ error: 'Failed to get activity status' });
        }
    });
    // Get git status for a specific session
    router.get('/sessions/:sessionId/git-status', async (req, res) => {
        const sessionId = req.params.sessionId;
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/git-status`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to get git status from remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            // Get detailed git status for the session's working directory
            const gitStatus = await (0, git_status_js_1.getDetailedGitStatus)(session.workingDir);
            res.json(gitStatus);
        }
        catch (error) {
            logger.error(`error getting git status for session ${sessionId}:`, error);
            res.status(500).json({ error: 'Failed to get git status' });
        }
    });
    // Get single session info
    router.get('/sessions/:sessionId', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.debug(`getting info for session ${sessionId}`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to get session info from remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            // If session doesn't have Git info, try to detect it
            if (!session.gitRepoPath && session.workingDir) {
                try {
                    const gitInfo = await (0, git_info_js_1.detectGitInfo)(session.workingDir);
                    // logger.debug(
                    //   `[GET /sessions/:id] Detected Git info for session ${session.id}: repo=${gitInfo.gitRepoPath}, branch=${gitInfo.gitBranch}`
                    // );
                    res.json({ ...session, ...gitInfo });
                    return;
                }
                catch (error) {
                    // If Git detection fails, just return session as-is
                    logger.debug(`[GET /sessions/:id] Could not detect Git info for session ${session.id}: ${error}`);
                }
            }
            res.json(session);
        }
        catch (error) {
            logger.error('error getting session info:', error);
            res.status(500).json({ error: 'Failed to get session info' });
        }
    });
    // Kill session (just kill the process)
    router.delete('/sessions/:sessionId', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.debug(`killing session ${sessionId}`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward kill request to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}`, {
                            method: types_js_1.HttpMethod.DELETE,
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(10000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        // Remote killed the session, now update our registry
                        remoteRegistry.removeSessionFromRemote(sessionId);
                        logger.log(chalk_1.default.yellow(`remote session ${sessionId} killed on ${remote.name}`));
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to kill session on remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling - just kill it, no registry updates needed
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            // If session is already exited, clean it up instead of trying to kill it
            if (session.status === 'exited') {
                ptyManager.cleanupSession(sessionId);
                logger.log(chalk_1.default.yellow(`local session ${sessionId} cleaned up`));
                res.json({ success: true, message: 'Session cleaned up' });
            }
            else {
                // Check if this is a tmux attachment before killing
                const isTmuxAttachment = session.name?.startsWith('tmux:') || session.command?.includes('tmux attach');
                await ptyManager.killSession(sessionId, 'SIGTERM');
                if (isTmuxAttachment) {
                    logger.log(chalk_1.default.yellow(`local session ${sessionId} detached from tmux`));
                    res.json({ success: true, message: 'Detached from tmux session' });
                }
                else {
                    logger.log(chalk_1.default.yellow(`local session ${sessionId} killed`));
                    res.json({ success: true, message: 'Session killed' });
                }
            }
        }
        catch (error) {
            logger.error('error killing session:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to kill session', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to kill session' });
            }
        }
    });
    // Cleanup session files
    router.delete('/sessions/:sessionId/cleanup', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.debug(`cleaning up session ${sessionId} files`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward cleanup request to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/cleanup`, {
                            method: types_js_1.HttpMethod.DELETE,
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(10000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        // Remote cleaned up the session, now update our registry
                        remoteRegistry.removeSessionFromRemote(sessionId);
                        logger.log(chalk_1.default.yellow(`remote session ${sessionId} cleaned up on ${remote.name}`));
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to cleanup session on remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling - just cleanup, no registry updates needed
            ptyManager.cleanupSession(sessionId);
            logger.log(chalk_1.default.yellow(`local session ${sessionId} cleaned up`));
            res.json({ success: true, message: 'Session cleaned up' });
        }
        catch (error) {
            logger.error('error cleaning up session:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to cleanup session', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to cleanup session' });
            }
        }
    });
    // Cleanup all exited sessions (local and remote)
    router.post('/cleanup-exited', async (_req, res) => {
        logger.log(chalk_1.default.blue('cleaning up all exited sessions'));
        try {
            // Clean up local sessions
            const localCleanedSessions = ptyManager.cleanupExitedSessions();
            logger.log(chalk_1.default.green(`cleaned up ${localCleanedSessions.length} local exited sessions`));
            // Remove cleaned local sessions from remote registry if in HQ mode
            if (isHQMode && remoteRegistry) {
                for (const sessionId of localCleanedSessions) {
                    remoteRegistry.removeSessionFromRemote(sessionId);
                }
            }
            let totalCleaned = localCleanedSessions.length;
            const remoteResults = [];
            // If in HQ mode, clean up sessions on all remotes
            if (isHQMode && remoteRegistry) {
                const allRemotes = remoteRegistry.getRemotes();
                // Clean up on each remote in parallel
                const remoteCleanupPromises = allRemotes.map(async (remote) => {
                    try {
                        const response = await fetch(`${remote.url}/api/cleanup-exited`, {
                            method: types_js_1.HttpMethod.POST,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(10000), // 10 second timeout
                        });
                        if (response.ok) {
                            const result = (await response.json());
                            const cleanedSessionIds = result.cleanedSessions || [];
                            const cleanedCount = cleanedSessionIds.length;
                            totalCleaned += cleanedCount;
                            // Remove cleaned remote sessions from registry
                            for (const sessionId of cleanedSessionIds) {
                                remoteRegistry.removeSessionFromRemote(sessionId);
                            }
                            remoteResults.push({ remoteName: remote.name, cleaned: cleanedCount });
                        }
                        else {
                            throw new Error(`HTTP ${response.status}`);
                        }
                    }
                    catch (error) {
                        logger.error(`failed to cleanup sessions on remote ${remote.name}:`, error);
                        remoteResults.push({
                            remoteName: remote.name,
                            cleaned: 0,
                            error: error instanceof Error ? error.message : 'Unknown error',
                        });
                    }
                });
                await Promise.all(remoteCleanupPromises);
            }
            res.json({
                success: true,
                message: `${totalCleaned} exited sessions cleaned up across all servers`,
                localCleaned: localCleanedSessions.length,
                remoteResults,
            });
        }
        catch (error) {
            logger.error('error cleaning up exited sessions:', error);
            if (error instanceof index_js_1.PtyError) {
                res
                    .status(500)
                    .json({ error: 'Failed to cleanup exited sessions', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to cleanup exited sessions' });
            }
        }
    });
    // Get session plain text
    router.get('/sessions/:sessionId/text', async (req, res) => {
        const sessionId = req.params.sessionId;
        const includeStyles = req.query.styles !== undefined;
        logger.debug(`getting plain text for session ${sessionId}, styles=${includeStyles}`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward text request to remote server
                    try {
                        const url = new URL(`${remote.url}/api/sessions/${sessionId}/text`);
                        if (includeStyles) {
                            url.searchParams.set('styles', '');
                        }
                        const response = await fetch(url.toString(), {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        // Forward the text response
                        const text = await response.text();
                        res.setHeader('Content-Type', 'text/plain');
                        return res.send(text);
                    }
                    catch (error) {
                        logger.error(`failed to get text from remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            // Get terminal buffer snapshot
            const snapshot = await terminalManager.getBufferSnapshot(sessionId);
            // Use shared formatter to convert cells to text
            const plainText = (0, terminal_text_formatter_js_1.cellsToText)(snapshot.cells, includeStyles);
            // Send as plain text
            res.setHeader('Content-Type', 'text/plain');
            res.send(plainText);
        }
        catch (error) {
            logger.error('error getting plain text:', error);
            res.status(500).json({ error: 'Failed to get terminal text' });
        }
    });
    // Get session buffer
    router.get('/sessions/:sessionId/buffer', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.debug(`client requesting buffer for session ${sessionId}`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward buffer request to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/buffer`, {
                            headers: {
                                Authorization: `Bearer ${remote.token}`,
                            },
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        // Forward the binary buffer
                        const buffer = await response.arrayBuffer();
                        res.setHeader('Content-Type', 'application/octet-stream');
                        return res.send(Buffer.from(buffer));
                    }
                    catch (error) {
                        logger.error(`failed to get buffer from remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                logger.error(`session ${sessionId} not found`);
                return res.status(404).json({ error: 'Session not found' });
            }
            // Get terminal buffer snapshot
            const snapshot = await terminalManager.getBufferSnapshot(sessionId);
            // Encode as binary buffer
            const buffer = terminalManager.encodeSnapshot(snapshot);
            logger.debug(`sending buffer for session ${sessionId}: ${buffer.length} bytes, ` +
                `dimensions: ${snapshot.cols}x${snapshot.rows}, cursor: (${snapshot.cursorX},${snapshot.cursorY})`);
            // Send as binary data
            res.setHeader('Content-Type', 'application/octet-stream');
            res.send(buffer);
        }
        catch (error) {
            logger.error('error getting buffer:', error);
            res.status(500).json({ error: 'Failed to get terminal buffer' });
        }
    });
    // Stream session output
    router.get('/sessions/:sessionId/stream', async (req, res) => {
        const sessionId = req.params.sessionId;
        const startTime = Date.now();
        logger.log(chalk_1.default.blue(`new SSE client connected to session ${sessionId} from ${req.get('User-Agent')?.substring(0, 50) || 'unknown'}`));
        // If in HQ mode, check if this is a remote session
        if (isHQMode && remoteRegistry) {
            const remote = remoteRegistry.getRemoteBySessionId(sessionId);
            if (remote) {
                // Proxy SSE stream from remote server
                try {
                    const controller = new AbortController();
                    const response = await fetch(`${remote.url}/api/sessions/${sessionId}/stream`, {
                        headers: {
                            Authorization: `Bearer ${remote.token}`,
                            Accept: 'text/event-stream',
                        },
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        return res.status(response.status).json(await response.json());
                    }
                    // Set up SSE headers
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        Connection: 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Cache-Control',
                        'X-Accel-Buffering': 'no',
                    });
                    // Proxy the stream
                    const reader = response.body?.getReader();
                    if (!reader) {
                        throw new Error('No response body');
                    }
                    const decoder = new TextDecoder();
                    const bytesProxied = { count: 0 };
                    const pump = async () => {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done)
                                    break;
                                bytesProxied.count += value.length;
                                const chunk = decoder.decode(value, { stream: true });
                                res.write(chunk);
                            }
                        }
                        catch (error) {
                            logger.error(`stream proxy error for remote ${remote.name}:`, error);
                        }
                    };
                    pump();
                    // Clean up on disconnect
                    req.on('close', () => {
                        logger.log(chalk_1.default.yellow(`SSE client disconnected from remote session ${sessionId} (proxied ${bytesProxied.count} bytes)`));
                        controller.abort();
                    });
                    return;
                }
                catch (error) {
                    logger.error(`failed to stream from remote ${remote.name}:`, error);
                    return res.status(503).json({ error: 'Failed to reach remote server' });
                }
            }
        }
        // Local session handling
        const session = ptyManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const sessionPaths = ptyManager.getSessionPaths(sessionId);
        if (!sessionPaths) {
            return res.status(404).json({ error: 'Session paths not found' });
        }
        const streamPath = sessionPaths.stdoutPath;
        if (!streamPath || !fs.existsSync(streamPath)) {
            logger.warn(`stream path not found for session ${sessionId}`);
            return res.status(404).json({ error: 'Session stream not found' });
        }
        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control',
            'X-Accel-Buffering': 'no', // Disable Nginx buffering
            'Content-Encoding': 'identity', // Prevent compression
        });
        // Force headers to be sent immediately
        res.flushHeaders();
        // Send initial connection event
        res.write(':ok\n\n');
        if (res.flush)
            res.flush();
        // Add client to stream watcher
        streamWatcher.addClient(sessionId, streamPath, res);
        logger.debug(`SSE stream setup completed in ${Date.now() - startTime}ms`);
        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeat = setInterval(() => {
            res.write(':heartbeat\n\n');
            if (res.flush)
                res.flush();
        }, 30000);
        // Track if cleanup has been called to avoid duplicate calls
        let cleanedUp = false;
        const cleanup = () => {
            if (!cleanedUp) {
                cleanedUp = true;
                logger.log(chalk_1.default.yellow(`SSE client disconnected from session ${sessionId}`));
                streamWatcher.removeClient(sessionId, res);
                clearInterval(heartbeat);
            }
        };
        // Clean up on disconnect - listen to all possible events
        req.on('close', cleanup);
        req.on('error', (err) => {
            logger.error(`SSE client error for session ${sessionId}:`, err);
            cleanup();
        });
        res.on('close', cleanup);
        res.on('finish', cleanup);
    });
    // Send input to session
    router.post('/sessions/:sessionId/input', async (req, res) => {
        const sessionId = req.params.sessionId;
        const { text, key } = req.body;
        // Validate that only one of text or key is provided
        if ((text === undefined && key === undefined) || (text !== undefined && key !== undefined)) {
            logger.warn(`invalid input request for session ${sessionId}: both or neither text/key provided`);
            return res.status(400).json({ error: 'Either text or key must be provided, but not both' });
        }
        if (text !== undefined && typeof text !== 'string') {
            logger.warn(`invalid input request for session ${sessionId}: text is not a string`);
            return res.status(400).json({ error: 'Text must be a string' });
        }
        if (key !== undefined && typeof key !== 'string') {
            logger.warn(`invalid input request for session ${sessionId}: key is not a string`);
            return res.status(400).json({ error: 'Key must be a string' });
        }
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward input to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/input`, {
                            method: types_js_1.HttpMethod.POST,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${remote.token}`,
                            },
                            body: JSON.stringify(req.body),
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to send input to remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                logger.error(`session ${sessionId} not found for input`);
                return res.status(404).json({ error: 'Session not found' });
            }
            if (session.status !== 'running') {
                logger.error(`session ${sessionId} is not running (status: ${session.status})`);
                return res.status(400).json({ error: 'Session is not running' });
            }
            const inputData = text !== undefined ? { text } : { key };
            logger.debug(`sending input to session ${sessionId}: ${JSON.stringify(inputData)}`);
            ptyManager.sendInput(sessionId, inputData);
            res.json({ success: true });
        }
        catch (error) {
            logger.error('error sending input:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to send input', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to send input' });
            }
        }
    });
    // Resize session
    router.post('/sessions/:sessionId/resize', async (req, res) => {
        const sessionId = req.params.sessionId;
        const { cols, rows } = req.body;
        if (typeof cols !== 'number' || typeof rows !== 'number') {
            logger.warn(`invalid resize request for session ${sessionId}: cols/rows not numbers`);
            return res.status(400).json({ error: 'Cols and rows must be numbers' });
        }
        if (cols < 1 || rows < 1 || cols > 1000 || rows > 1000) {
            logger.warn(`invalid resize request for session ${sessionId}: cols=${cols}, rows=${rows} out of range`);
            return res.status(400).json({ error: 'Cols and rows must be between 1 and 1000' });
        }
        // Log resize requests at debug level
        logger.debug(`Resizing session ${sessionId} to ${cols}x${rows}`);
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward resize to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}/resize`, {
                            method: types_js_1.HttpMethod.POST,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${remote.token}`,
                            },
                            body: JSON.stringify({ cols, rows }),
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to resize session on remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                logger.warn(`session ${sessionId} not found for resize`);
                return res.status(404).json({ error: 'Session not found' });
            }
            if (session.status !== 'running') {
                logger.warn(`session ${sessionId} is not running (status: ${session.status})`);
                return res.status(400).json({ error: 'Session is not running' });
            }
            // Resize the session
            ptyManager.resizeSession(sessionId, cols, rows);
            logger.log(chalk_1.default.green(`session ${sessionId} resized to ${cols}x${rows}`));
            res.json({ success: true, cols, rows });
        }
        catch (error) {
            logger.error('error resizing session via PTY service:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to resize session', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to resize session' });
            }
        }
    });
    // Update session name
    router.patch('/sessions/:sessionId', async (req, res) => {
        const sessionId = req.params.sessionId;
        logger.log(chalk_1.default.yellow(`[PATCH] Received rename request for session ${sessionId}`));
        logger.debug(`[PATCH] Request body:`, req.body);
        logger.debug(`[PATCH] Request headers:`, req.headers);
        const { name } = req.body;
        if (typeof name !== 'string' || name.trim() === '') {
            logger.warn(`[PATCH] Invalid name provided: ${JSON.stringify(name)}`);
            return res.status(400).json({ error: 'Name must be a non-empty string' });
        }
        logger.log(chalk_1.default.blue(`[PATCH] Updating session ${sessionId} name to: ${name}`));
        try {
            // If in HQ mode, check if this is a remote session
            if (isHQMode && remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    // Forward update to remote server
                    try {
                        const response = await fetch(`${remote.url}/api/sessions/${sessionId}`, {
                            method: types_js_1.HttpMethod.PATCH,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${remote.token}`,
                            },
                            body: JSON.stringify({ name }),
                            signal: AbortSignal.timeout(5000),
                        });
                        if (!response.ok) {
                            return res.status(response.status).json(await response.json());
                        }
                        return res.json(await response.json());
                    }
                    catch (error) {
                        logger.error(`failed to update session name on remote ${remote.name}:`, error);
                        return res.status(503).json({ error: 'Failed to reach remote server' });
                    }
                }
            }
            // Local session handling
            logger.debug(`[PATCH] Handling local session update`);
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                logger.warn(`[PATCH] Session ${sessionId} not found for name update`);
                return res.status(404).json({ error: 'Session not found' });
            }
            logger.debug(`[PATCH] Found session: ${JSON.stringify(session)}`);
            // Update the session name
            logger.debug(`[PATCH] Calling ptyManager.updateSessionName(${sessionId}, ${name})`);
            const uniqueName = ptyManager.updateSessionName(sessionId, name);
            logger.log(chalk_1.default.green(`[PATCH] Session ${sessionId} name updated to: ${uniqueName}`));
            res.json({ success: true, name: uniqueName });
        }
        catch (error) {
            logger.error('error updating session name:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to update session name', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to update session name' });
            }
        }
    });
    // Reset terminal size (for external terminals)
    router.post('/sessions/:sessionId/reset-size', async (req, res) => {
        const { sessionId } = req.params;
        try {
            // In HQ mode, forward to remote if session belongs to one
            if (remoteRegistry) {
                const remote = remoteRegistry.getRemoteBySessionId(sessionId);
                if (remote) {
                    logger.debug(`forwarding reset-size to remote ${remote.id}`);
                    const response = await fetch(`${remote.url}/api/sessions/${sessionId}/reset-size`, {
                        method: types_js_1.HttpMethod.POST,
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${remote.token}`,
                        },
                    });
                    if (!response.ok) {
                        const error = await response.json();
                        return res.status(response.status).json(error);
                    }
                    const result = await response.json();
                    return res.json(result);
                }
            }
            logger.log(chalk_1.default.cyan(`resetting terminal size for session ${sessionId}`));
            // Check if session exists
            const session = ptyManager.getSession(sessionId);
            if (!session) {
                logger.error(`session ${sessionId} not found for reset-size`);
                return res.status(404).json({ error: 'Session not found' });
            }
            // Check if session is running
            if (session.status !== 'running') {
                logger.error(`session ${sessionId} is not running (status: ${session.status})`);
                return res.status(400).json({ error: 'Session is not running' });
            }
            // Reset the session size
            ptyManager.resetSessionSize(sessionId);
            logger.log(chalk_1.default.green(`session ${sessionId} size reset to terminal size`));
            res.json({ success: true });
        }
        catch (error) {
            logger.error('error resetting session size via PTY service:', error);
            if (error instanceof index_js_1.PtyError) {
                res.status(500).json({ error: 'Failed to reset session size', details: error.message });
            }
            else {
                res.status(500).json({ error: 'Failed to reset session size' });
            }
        }
    });
    return router;
}
// Generate a unique session ID
function generateSessionId() {
    // Generate UUID v4
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
    }
    // Set version (4) and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    // Convert to hex string with dashes
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}
// Request terminal spawn from Mac app via control socket
async function requestTerminalSpawn(params) {
    try {
        // Create control message for terminal spawn
        const message = (0, control_protocol_js_1.createControlMessage)('terminal', 'spawn', {
            sessionId: params.sessionId,
            workingDirectory: params.workingDir,
            command: params.command.join(' '),
            terminalPreference: null, // Let Mac app use default terminal
            gitRepoPath: params.gitRepoPath,
            gitBranch: params.gitBranch,
            gitAheadCount: params.gitAheadCount,
            gitBehindCount: params.gitBehindCount,
            gitHasChanges: params.gitHasChanges,
            gitIsWorktree: params.gitIsWorktree,
            gitMainRepoPath: params.gitMainRepoPath,
        }, params.sessionId);
        logger.debug(`requesting terminal spawn via control socket for session ${params.sessionId}`);
        // Send the message and wait for response
        const response = await control_unix_handler_js_1.controlUnixHandler.sendControlMessage(message);
        if (!response) {
            return {
                success: false,
                error: 'No response from Mac app',
            };
        }
        if (response.error) {
            return {
                success: false,
                error: response.error,
            };
        }
        const success = response.payload?.success === true;
        return {
            success,
            error: success ? undefined : 'Terminal spawn failed',
        };
    }
    catch (error) {
        logger.error('failed to spawn terminal:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3JvdXRlcy9zZXNzaW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1EQSxrREEyeUNDO0FBMEJELG9EQWtFQztBQTE3Q0Qsa0RBQTBCO0FBQzFCLHFDQUFpQztBQUNqQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyx3RkFBc0U7QUFFdEUsb0RBQW1EO0FBQ25ELDhDQUE0RDtBQUk1RCx1RkFBK0U7QUFFL0Usc0RBQXFEO0FBQ3JELDBEQUE4RDtBQUM5RCxrREFBa0Q7QUFDbEQsMERBQTZEO0FBQzdELGtFQUFpRTtBQUNqRSwwRUFBb0c7QUFDcEcsa0ZBQTBFO0FBRTFFLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxVQUFVLENBQUMsQ0FBQztBQUN4QyxNQUFNLFNBQVMsR0FBRyxJQUFBLGdCQUFTLEVBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBVy9ELHdEQUF3RDtBQUN4RCxTQUFTLFdBQVcsQ0FBQyxTQUFpQixFQUFFLFdBQW1CO0lBQ3pELElBQUksQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1FBQzFDLE9BQU8sV0FBVyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxrRkFBa0Y7SUFDbEYsTUFBTSxRQUFRLEdBQUcsSUFBQSxtQ0FBbUIsRUFBQyxTQUFTLENBQUMsQ0FBQztJQUVoRCwyRkFBMkY7SUFDM0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDN0QsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQztBQUVELFNBQWdCLG1CQUFtQixDQUFDLE1BQTJCO0lBQzdELE1BQU0sTUFBTSxHQUFHLElBQUEsZ0JBQU0sR0FBRSxDQUFDO0lBQ3hCLE1BQU0sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsUUFBUSxFQUFFLGVBQWUsRUFBRSxHQUM3RixNQUFNLENBQUM7SUFFVCx5QkFBeUI7SUFDekIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQy9DLE1BQU0sQ0FBQyxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBaUI7Z0JBQzNCLGVBQWUsRUFBRSw0Q0FBa0IsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDdkQsUUFBUTtnQkFDUixPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksU0FBUzthQUMxQyxDQUFDO1lBQ0YsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILGtDQUFrQztJQUNsQyxNQUFNLENBQUMsR0FBRyxDQUFDLDRCQUE0QixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDM0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxpRUFBaUUsQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sa0RBQXFCLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDdkQsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0QsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsc0NBQXNDLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILDBEQUEwRDtJQUMxRCxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUM7WUFDSCxJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7WUFFckIscUJBQXFCO1lBQ3JCLE1BQU0sYUFBYSxHQUFHLFVBQVUsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNoRCxNQUFNLENBQUMsS0FBSyxDQUFDLHlCQUF5QixhQUFhLENBQUMsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDO1lBRTdFLGtDQUFrQztZQUNsQyx1Q0FBdUM7WUFDdkMsa0JBQWtCO1lBQ2xCLG9IQUFvSDtZQUNwSCxPQUFPO1lBQ1AsTUFBTTtZQUVOLG1FQUFtRTtZQUNuRSxNQUFNLHVCQUF1QixHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDL0MsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUU7Z0JBQ2xDLHFEQUFxRDtnQkFDckQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUMvQyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLDJCQUFhLEVBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO3dCQUN4RCxnQkFBZ0I7d0JBQ2hCLDRIQUE0SDt3QkFDNUgsS0FBSzt3QkFDTCxPQUFPOzRCQUNMLEdBQUcsT0FBTzs0QkFDVixHQUFHLE9BQU87NEJBQ1YsTUFBTSxFQUFFLE9BQWdCO3lCQUN6QixDQUFDO29CQUNKLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDZixvREFBb0Q7d0JBQ3BELE1BQU0sQ0FBQyxLQUFLLENBQ1YseURBQXlELE9BQU8sQ0FBQyxFQUFFLEtBQUssS0FBSyxFQUFFLENBQ2hGLENBQUM7b0JBQ0osQ0FBQztnQkFDSCxDQUFDO2dCQUVELE9BQU87b0JBQ0wsR0FBRyxPQUFPO29CQUNWLE1BQU0sRUFBRSxPQUFnQjtpQkFDekIsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUNILENBQUM7WUFFRixXQUFXLEdBQUcsQ0FBQyxHQUFHLHVCQUF1QixDQUFDLENBQUM7WUFFM0MscURBQXFEO1lBQ3JELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxPQUFPLENBQUMsTUFBTSw4QkFBOEIsQ0FBQyxDQUFDO2dCQUV2RSw4Q0FBOEM7Z0JBQzlDLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFO29CQUNsRCxJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxlQUFlLEVBQUU7NEJBQ3pELE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxtQkFBbUI7eUJBQ3ZELENBQUMsQ0FBQzt3QkFFSCxJQUFJLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQzs0QkFDaEIsTUFBTSxjQUFjLEdBQUcsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBYyxDQUFDOzRCQUM1RCxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sY0FBYyxDQUFDLE1BQU0seUJBQXlCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDOzRCQUVqRixvQ0FBb0M7NEJBQ3BDLE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFVLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzs0QkFDNUQsY0FBYyxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7NEJBRTNELGtDQUFrQzs0QkFDbEMsT0FBTyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBZ0IsRUFBRSxFQUFFLENBQUMsQ0FBQztnQ0FDL0MsR0FBRyxPQUFPO2dDQUNWLE1BQU0sRUFBRSxRQUFRO2dDQUNoQixRQUFRLEVBQUUsTUFBTSxDQUFDLEVBQUU7Z0NBQ25CLFVBQVUsRUFBRSxNQUFNLENBQUMsSUFBSTtnQ0FDdkIsU0FBUyxFQUFFLE1BQU0sQ0FBQyxHQUFHOzZCQUN0QixDQUFDLENBQUMsQ0FBQzt3QkFDTixDQUFDOzZCQUFNLENBQUM7NEJBQ04sTUFBTSxDQUFDLElBQUksQ0FDVCxzQ0FBc0MsTUFBTSxDQUFDLElBQUksVUFBVSxRQUFRLENBQUMsTUFBTSxFQUFFLENBQzdFLENBQUM7NEJBQ0YsT0FBTyxFQUFFLENBQUM7d0JBQ1osQ0FBQztvQkFDSCxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUMxRSxPQUFPLEVBQUUsQ0FBQztvQkFDWixDQUFDO2dCQUNILENBQUMsQ0FBQyxDQUFDO2dCQUVILE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUM1QyxNQUFNLENBQUMsS0FBSyxDQUFDLDBCQUEwQixjQUFjLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztnQkFFaEUsV0FBVyxHQUFHLENBQUMsR0FBRyxXQUFXLEVBQUUsR0FBRyxjQUFjLENBQUMsQ0FBQztZQUNwRCxDQUFDO1lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLFdBQVcsQ0FBQyxNQUFNLGlCQUFpQixDQUFDLENBQUM7WUFDL0QsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN4QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMseUJBQXlCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0MsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO1FBQzdELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILDBDQUEwQztJQUMxQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQztRQUNoRyxNQUFNLENBQUMsS0FBSyxDQUNWLGlDQUFpQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxjQUFjLFFBQVEsSUFBSSxPQUFPLG9CQUFvQixjQUFjLFVBQVUsSUFBSSxVQUFVLElBQUksRUFBRSxDQUMxSixDQUFDO1FBRUYsSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNoRSxNQUFNLENBQUMsSUFBSSxDQUFDLGdEQUFnRCxDQUFDLENBQUM7WUFDOUQsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUVELHNDQUFzQztRQUN0QyxJQUFJLENBQUM7WUFDSCxLQUFLLE1BQU0sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO2dCQUMxQixJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUM1QixNQUFNLElBQUksS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7Z0JBQzNELENBQUM7Z0JBQ0QsSUFBSSxHQUFHLENBQUMsTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDO29CQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7Z0JBQzdELENBQUM7Z0JBQ0QscURBQXFEO2dCQUNyRCxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDO1lBQ0gsQ0FBQztZQUVELDRCQUE0QjtZQUM1QixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0IsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM5RCwwREFBMEQ7Z0JBQzFELElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLHNEQUFzRCxDQUFDLENBQUM7Z0JBQzFFLENBQUM7WUFDSCxDQUFDO1lBRUQsNkRBQTZEO1lBQzdELE1BQU0saUJBQWlCLEdBQUc7Z0JBQ3hCLFdBQVcsRUFBRSxzQ0FBc0M7Z0JBQ25ELE1BQU0sRUFBRSxzQkFBc0I7Z0JBQzlCLE1BQU0sRUFBRSx1QkFBdUI7Z0JBQy9CLFdBQVcsRUFBRSxzQkFBc0I7Z0JBQ25DLE1BQU0sRUFBRSxvQkFBb0I7YUFDN0IsQ0FBQztZQUVGLEtBQUssTUFBTSxPQUFPLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDeEMsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7b0JBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztnQkFDckUsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxlQUFlLEVBQUUsQ0FBQztZQUN6QixNQUFNLENBQUMsSUFBSSxDQUNULHNEQUFzRCxlQUFlLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FDN0ksQ0FBQztZQUNGLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7Z0JBQzFCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLE9BQU8sRUFDTCxlQUFlLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDO2FBQ3ZGLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCxtRUFBbUU7WUFDbkUsSUFBSSxRQUFRLElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMzQyxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNsRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7b0JBQ1osTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsUUFBUSxZQUFZLENBQUMsQ0FBQztvQkFDckUsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7Z0JBQ3BFLENBQUM7Z0JBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUUvRSwyQ0FBMkM7Z0JBQzNDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztnQkFDN0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxlQUFlLEVBQUU7b0JBQ3pELE1BQU0sRUFBRSxxQkFBVSxDQUFDLElBQUk7b0JBQ3ZCLE9BQU8sRUFBRTt3QkFDUCxjQUFjLEVBQUUsa0JBQWtCO3dCQUNsQyxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFO3FCQUN4QztvQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQzt3QkFDbkIsT0FBTzt3QkFDUCxVQUFVO3dCQUNWLElBQUk7d0JBQ0osY0FBYzt3QkFDZCxJQUFJO3dCQUNKLElBQUk7d0JBQ0osU0FBUzt3QkFDVCw0Q0FBNEM7cUJBQzdDLENBQUM7b0JBQ0YsTUFBTSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsb0JBQW9CO2lCQUN6RCxDQUFDLENBQUM7Z0JBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztvQkFDakIsTUFBTSxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUM5RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDakQsQ0FBQztnQkFFRCxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUEwQixDQUFDO2dCQUNoRSxNQUFNLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxJQUFJLENBQUMsQ0FBQztnQkFFekUsK0NBQStDO2dCQUMvQyxJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDckIsY0FBYyxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDO2dCQUVELEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyx5Q0FBeUM7Z0JBQzNELE9BQU87WUFDVCxDQUFDO1lBRUQsMEVBQTBFO1lBQzFFLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQztvQkFDSCxzQkFBc0I7b0JBQ3RCLE1BQU0sU0FBUyxHQUFHLGlCQUFpQixFQUFFLENBQUM7b0JBQ3RDLE1BQU0sV0FBVyxHQUFHLFdBQVcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7b0JBQzNELE1BQU0sV0FBVyxHQUFHLElBQUksSUFBSSxJQUFBLHVDQUFtQixFQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztvQkFFdEUsNENBQTRDO29CQUM1QyxNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUEsMkJBQWEsRUFBQyxXQUFXLENBQUMsQ0FBQztvQkFFakQsb0NBQW9DO29CQUNwQyxNQUFNLENBQUMsR0FBRyxDQUNSLGVBQUssQ0FBQyxJQUFJLENBQUMsMkNBQTJDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUNqRixDQUFDO29CQUNGLE1BQU0sV0FBVyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7d0JBQzdDLFNBQVM7d0JBQ1QsV0FBVzt3QkFDWCxPQUFPO3dCQUNQLFVBQVUsRUFBRSxXQUFXO3dCQUN2QixTQUFTO3dCQUNULFdBQVcsRUFBRSxPQUFPLENBQUMsV0FBVzt3QkFDaEMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO3dCQUM1QixhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWE7d0JBQ3BDLGNBQWMsRUFBRSxPQUFPLENBQUMsY0FBYzt3QkFDdEMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxhQUFhO3dCQUNwQyxhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWE7d0JBQ3BDLGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZTtxQkFDekMsQ0FBQyxDQUFDO29CQUVILElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7d0JBQ3pCLDJDQUEyQzt3QkFDM0MsTUFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxXQUFXLENBQUMsS0FBSyxJQUFJLGVBQWUsQ0FBQyxDQUFDO3dCQUM1RSxNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7b0JBQ3JELENBQUM7eUJBQU0sQ0FBQzt3QkFDTiwyQ0FBMkM7d0JBQzNDLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFFekQscUVBQXFFO3dCQUNyRSxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxLQUFLLENBQUMsd0NBQXdDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDN0UsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO3dCQUM3RCxPQUFPO29CQUNULENBQUM7Z0JBQ0gsQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNmLDJDQUEyQztvQkFDM0MsTUFBTSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO1lBQ0gsQ0FBQztZQUVELHVCQUF1QjtZQUN2QixJQUFJLEdBQUcsR0FBRyxXQUFXLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBRWpELDJFQUEyRTtZQUMzRSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsSUFBSSxDQUNULHNCQUFzQixHQUFHLHVEQUF1RCxDQUNqRixDQUFDO2dCQUNGLEdBQUcsR0FBRyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDdEIsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLElBQUksSUFBSSxJQUFBLHVDQUFtQixFQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQztZQUU5RCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFBLDJCQUFhLEVBQUMsR0FBRyxDQUFDLENBQUM7WUFFekMsTUFBTSxDQUFDLEdBQUcsQ0FDUixlQUFLLENBQUMsSUFBSSxDQUNSLHlCQUF5QixPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEdBQUcsb0JBQW9CLGNBQWMsR0FBRyxDQUMxRixDQUNGLENBQUM7WUFFRixNQUFNLE1BQU0sR0FBRyxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFO2dCQUNyRCxJQUFJLEVBQUUsV0FBVztnQkFDakIsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSTtnQkFDSixJQUFJO2dCQUNKLFNBQVM7Z0JBQ1QsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXO2dCQUNoQyxTQUFTLEVBQUUsT0FBTyxDQUFDLFNBQVM7Z0JBQzVCLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYTtnQkFDcEMsY0FBYyxFQUFFLE9BQU8sQ0FBQyxjQUFjO2dCQUN0QyxhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWE7Z0JBQ3BDLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYTtnQkFDcEMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlO2FBQ3pDLENBQUMsQ0FBQztZQUVILE1BQU0sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLEdBQUcsTUFBTSxDQUFDO1lBQzFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLEtBQUssQ0FBQyxlQUFlLFNBQVMsa0JBQWtCLFdBQVcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdEYsdUVBQXVFO1lBRXZFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQzFCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvQyxJQUFJLEtBQUssWUFBWSxtQkFBUSxFQUFFLENBQUM7Z0JBQzlCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUN0RixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUM7SUFDdkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ25ELE1BQU0sQ0FBQyxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztRQUN6RCxJQUFJLENBQUM7WUFDSCxNQUFNLGNBQWMsR0FBb0MsRUFBRSxDQUFDO1lBRTNELDhCQUE4QjtZQUM5QixNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUMxRCxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUU3QyxrREFBa0Q7WUFDbEQsSUFBSSxRQUFRLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sT0FBTyxHQUFHLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFFNUMsOENBQThDO2dCQUM5QyxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsRUFBRTtvQkFDbEQsSUFBSSxDQUFDO3dCQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsd0JBQXdCLEVBQUU7NEJBQ2xFLE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQzs0QkFDaEIsTUFBTSxjQUFjLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7NEJBQzdDLE9BQU87Z0NBQ0wsTUFBTSxFQUFFO29DQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRTtvQ0FDYixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7b0NBQ2pCLEdBQUcsRUFBRSxNQUFNLENBQUMsR0FBRztpQ0FDaEI7Z0NBQ0QsUUFBUSxFQUFFLGNBQWM7NkJBQ3pCLENBQUM7d0JBQ0osQ0FBQztvQkFDSCxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO29CQUM1RSxDQUFDO29CQUNELE9BQU8sSUFBSSxDQUFDO2dCQUNkLENBQUMsQ0FBQyxDQUFDO2dCQUVILE1BQU0sYUFBYSxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztnQkFFeEQsNkJBQTZCO2dCQUM3QixLQUFLLE1BQU0sTUFBTSxJQUFJLGFBQWEsRUFBRSxDQUFDO29CQUNuQyxJQUFJLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQzt3QkFDckIsNkJBQTZCO3dCQUM3QixNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ2pELENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7WUFFRCxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN0RCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7UUFDbkUsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsNkNBQTZDO0lBQzdDLE1BQU0sQ0FBQyxHQUFHLENBQUMsK0JBQStCLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUM3RCxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUV2QyxJQUFJLENBQUM7WUFDSCxtREFBbUQ7WUFDbkQsSUFBSSxRQUFRLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWCwyQkFBMkI7b0JBQzNCLElBQUksQ0FBQzt3QkFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQixTQUFTLFdBQVcsRUFBRTs0QkFDL0UsT0FBTyxFQUFFO2dDQUNQLGFBQWEsRUFBRSxVQUFVLE1BQU0sQ0FBQyxLQUFLLEVBQUU7NkJBQ3hDOzRCQUNELE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt5QkFDbEMsQ0FBQyxDQUFDO3dCQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ2pFLENBQUM7d0JBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3pDLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxNQUFNLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQzFFLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO29CQUMxRSxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1lBRUQseUJBQXlCO1lBQ3pCLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMzRSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7WUFDRCxHQUFHLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyw2Q0FBNkMsU0FBUyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0UsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILHdDQUF3QztJQUN4QyxNQUFNLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDL0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFFdkMsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsMkJBQTJCO29CQUMzQixJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxhQUFhLEVBQUU7NEJBQ2pGLE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUM1RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQsOERBQThEO1lBQzlELE1BQU0sU0FBUyxHQUFHLE1BQU0sSUFBQSxvQ0FBb0IsRUFBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7WUFFakUsR0FBRyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0NBQXdDLFNBQVMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCwwQkFBMEI7SUFDMUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ3BELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFdEQsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsMkJBQTJCO29CQUMzQixJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxFQUFFLEVBQUU7NEJBQ3RFLE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywwQ0FBMEMsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUM5RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRWpELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQscURBQXFEO1lBQ3JELElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDL0MsSUFBSSxDQUFDO29CQUNILE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBQSwyQkFBYSxFQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDeEQsZ0JBQWdCO29CQUNoQixnSUFBZ0k7b0JBQ2hJLEtBQUs7b0JBQ0wsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsT0FBTyxFQUFFLENBQUMsQ0FBQztvQkFDckMsT0FBTztnQkFDVCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2Ysb0RBQW9EO29CQUNwRCxNQUFNLENBQUMsS0FBSyxDQUNWLDZEQUE2RCxPQUFPLENBQUMsRUFBRSxLQUFLLEtBQUssRUFBRSxDQUNwRixDQUFDO2dCQUNKLENBQUM7WUFDSCxDQUFDO1lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNwQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDbkQsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QztJQUN2QyxNQUFNLENBQUMsTUFBTSxDQUFDLHNCQUFzQixFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDdkQsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDdkMsTUFBTSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUU3QyxJQUFJLENBQUM7WUFDSCxtREFBbUQ7WUFDbkQsSUFBSSxRQUFRLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWCx3Q0FBd0M7b0JBQ3hDLElBQUksQ0FBQzt3QkFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQixTQUFTLEVBQUUsRUFBRTs0QkFDdEUsTUFBTSxFQUFFLHFCQUFVLENBQUMsTUFBTTs0QkFDekIsT0FBTyxFQUFFO2dDQUNQLGFBQWEsRUFBRSxVQUFVLE1BQU0sQ0FBQyxLQUFLLEVBQUU7NkJBQ3hDOzRCQUNELE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQzt5QkFDbkMsQ0FBQyxDQUFDO3dCQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ2pFLENBQUM7d0JBRUQscURBQXFEO3dCQUNyRCxjQUFjLENBQUMsdUJBQXVCLENBQUMsU0FBUyxDQUFDLENBQUM7d0JBQ2xELE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsU0FBUyxjQUFjLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBRWpGLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUN4RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELG9FQUFvRTtZQUNwRSxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRWpELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQseUVBQXlFO1lBQ3pFLElBQUksT0FBTyxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDaEMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDckMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLGlCQUFpQixTQUFTLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7WUFDN0QsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLG9EQUFvRDtnQkFDcEQsTUFBTSxnQkFBZ0IsR0FDcEIsT0FBTyxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBRWhGLE1BQU0sVUFBVSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBRW5ELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztvQkFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLGlCQUFpQixTQUFTLHFCQUFxQixDQUFDLENBQUMsQ0FBQztvQkFDMUUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLENBQUMsQ0FBQztnQkFDckUsQ0FBQztxQkFBTSxDQUFDO29CQUNOLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsU0FBUyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUM5RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM5QyxJQUFJLEtBQUssWUFBWSxtQkFBUSxFQUFFLENBQUM7Z0JBQzlCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHdCQUF3QixFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNwRixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1lBQzVELENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCx3QkFBd0I7SUFDeEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQy9ELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLFNBQVMsUUFBUSxDQUFDLENBQUM7UUFFdkQsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsMkNBQTJDO29CQUMzQyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxVQUFVLEVBQUU7NEJBQzlFLE1BQU0sRUFBRSxxQkFBVSxDQUFDLE1BQU07NEJBQ3pCLE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUM7eUJBQ25DLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELHlEQUF5RDt3QkFDekQsY0FBYyxDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxDQUFDO3dCQUNsRCxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxNQUFNLENBQUMsa0JBQWtCLFNBQVMsa0JBQWtCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBRXJGLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUMzRSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELG9FQUFvRTtZQUNwRSxVQUFVLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsU0FBUyxhQUFhLENBQUMsQ0FBQyxDQUFDO1lBRWxFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2xELElBQUksS0FBSyxZQUFZLG1CQUFRLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMkJBQTJCLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3ZGLENBQUM7aUJBQU0sQ0FBQztnQkFDTixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwyQkFBMkIsRUFBRSxDQUFDLENBQUM7WUFDL0QsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILGlEQUFpRDtJQUNqRCxNQUFNLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDakQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUM7WUFDSCwwQkFBMEI7WUFDMUIsTUFBTSxvQkFBb0IsR0FBRyxVQUFVLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNoRSxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxLQUFLLENBQUMsY0FBYyxvQkFBb0IsQ0FBQyxNQUFNLHdCQUF3QixDQUFDLENBQUMsQ0FBQztZQUUzRixtRUFBbUU7WUFDbkUsSUFBSSxRQUFRLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQy9CLEtBQUssTUFBTSxTQUFTLElBQUksb0JBQW9CLEVBQUUsQ0FBQztvQkFDN0MsY0FBYyxDQUFDLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUNwRCxDQUFDO1lBQ0gsQ0FBQztZQUVELElBQUksWUFBWSxHQUFHLG9CQUFvQixDQUFDLE1BQU0sQ0FBQztZQUMvQyxNQUFNLGFBQWEsR0FBbUUsRUFBRSxDQUFDO1lBRXpGLGtEQUFrRDtZQUNsRCxJQUFJLFFBQVEsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDL0IsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUUvQyxzQ0FBc0M7Z0JBQ3RDLE1BQU0scUJBQXFCLEdBQUcsVUFBVSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEVBQUU7b0JBQzVELElBQUksQ0FBQzt3QkFDSCxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLHFCQUFxQixFQUFFOzRCQUMvRCxNQUFNLEVBQUUscUJBQVUsQ0FBQyxJQUFJOzRCQUN2QixPQUFPLEVBQUU7Z0NBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQ0FDbEMsYUFBYSxFQUFFLFVBQVUsTUFBTSxDQUFDLEtBQUssRUFBRTs2QkFDeEM7NEJBQ0QsTUFBTSxFQUFFLFdBQVcsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsb0JBQW9CO3lCQUN6RCxDQUFDLENBQUM7d0JBRUgsSUFBSSxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ2hCLE1BQU0sTUFBTSxHQUFHLENBQUMsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQWtDLENBQUM7NEJBQ3hFLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLGVBQWUsSUFBSSxFQUFFLENBQUM7NEJBQ3ZELE1BQU0sWUFBWSxHQUFHLGlCQUFpQixDQUFDLE1BQU0sQ0FBQzs0QkFDOUMsWUFBWSxJQUFJLFlBQVksQ0FBQzs0QkFFN0IsK0NBQStDOzRCQUMvQyxLQUFLLE1BQU0sU0FBUyxJQUFJLGlCQUFpQixFQUFFLENBQUM7Z0NBQzFDLGNBQWMsQ0FBQyx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsQ0FBQzs0QkFDcEQsQ0FBQzs0QkFFRCxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7d0JBQ3pFLENBQUM7NkJBQU0sQ0FBQzs0QkFDTixNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7d0JBQzdDLENBQUM7b0JBQ0gsQ0FBQztvQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO3dCQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0NBQXdDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzt3QkFDNUUsYUFBYSxDQUFDLElBQUksQ0FBQzs0QkFDakIsVUFBVSxFQUFFLE1BQU0sQ0FBQyxJQUFJOzRCQUN2QixPQUFPLEVBQUUsQ0FBQzs0QkFDVixLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTt5QkFDaEUsQ0FBQyxDQUFDO29CQUNMLENBQUM7Z0JBQ0gsQ0FBQyxDQUFDLENBQUM7Z0JBRUgsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDM0MsQ0FBQztZQUVELEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ1AsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsT0FBTyxFQUFFLEdBQUcsWUFBWSxnREFBZ0Q7Z0JBQ3hFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxNQUFNO2dCQUN6QyxhQUFhO2FBQ2QsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzFELElBQUksS0FBSyxZQUFZLG1CQUFRLEVBQUUsQ0FBQztnQkFDOUIsR0FBRztxQkFDQSxNQUFNLENBQUMsR0FBRyxDQUFDO3FCQUNYLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDbEYsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1DQUFtQyxFQUFFLENBQUMsQ0FBQztZQUN2RSxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgseUJBQXlCO0lBQ3pCLE1BQU0sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUN6RCxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUN2QyxNQUFNLGFBQWEsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUM7UUFDckQsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsU0FBUyxZQUFZLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFckYsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsd0NBQXdDO29CQUN4QyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxPQUFPLENBQUMsQ0FBQzt3QkFDcEUsSUFBSSxhQUFhLEVBQUUsQ0FBQzs0QkFDbEIsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3dCQUNyQyxDQUFDO3dCQUVELE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRTs0QkFDM0MsT0FBTyxFQUFFO2dDQUNQLGFBQWEsRUFBRSxVQUFVLE1BQU0sQ0FBQyxLQUFLLEVBQUU7NkJBQ3hDOzRCQUNELE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt5QkFDbEMsQ0FBQyxDQUFDO3dCQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ2pFLENBQUM7d0JBRUQsNEJBQTRCO3dCQUM1QixNQUFNLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDbkMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsWUFBWSxDQUFDLENBQUM7d0JBQzVDLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDeEIsQ0FBQztvQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO3dCQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzt3QkFDdEUsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7b0JBQzFFLENBQUM7Z0JBQ0gsQ0FBQztZQUNILENBQUM7WUFFRCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxDQUFDLENBQUM7WUFDOUQsQ0FBQztZQUVELCtCQUErQjtZQUMvQixNQUFNLFFBQVEsR0FBRyxNQUFNLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUVwRSxnREFBZ0Q7WUFDaEQsTUFBTSxTQUFTLEdBQUcsSUFBQSx3Q0FBVyxFQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFFN0QscUJBQXFCO1lBQ3JCLEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxDQUFDO1lBQzVDLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdEIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDZCQUE2QixFQUFFLENBQUMsQ0FBQztRQUNqRSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxxQkFBcUI7SUFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzNELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBRXZDLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0NBQXdDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFbEUsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsMENBQTBDO29CQUMxQyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxTQUFTLEVBQUU7NEJBQzdFLE9BQU8sRUFBRTtnQ0FDUCxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELDRCQUE0Qjt3QkFDNUIsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQzVDLEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLDBCQUEwQixDQUFDLENBQUM7d0JBQzFELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQ3ZDLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLG9DQUFvQyxNQUFNLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQ3hFLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO29CQUMxRSxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1lBRUQseUJBQXlCO1lBQ3pCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxTQUFTLFlBQVksQ0FBQyxDQUFDO2dCQUMvQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQsK0JBQStCO1lBQy9CLE1BQU0sUUFBUSxHQUFHLE1BQU0sZUFBZSxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRXBFLDBCQUEwQjtZQUMxQixNQUFNLE1BQU0sR0FBRyxlQUFlLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXhELE1BQU0sQ0FBQyxLQUFLLENBQ1YsOEJBQThCLFNBQVMsS0FBSyxNQUFNLENBQUMsTUFBTSxVQUFVO2dCQUNqRSxlQUFlLFFBQVEsQ0FBQyxJQUFJLElBQUksUUFBUSxDQUFDLElBQUksY0FBYyxRQUFRLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEdBQUcsQ0FDckcsQ0FBQztZQUVGLHNCQUFzQjtZQUN0QixHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1lBQzFELEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztRQUNuRSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCx3QkFBd0I7SUFDeEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQzNELE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3ZDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUU3QixNQUFNLENBQUMsR0FBRyxDQUNSLGVBQUssQ0FBQyxJQUFJLENBQ1IsdUNBQXVDLFNBQVMsU0FBUyxHQUFHLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksU0FBUyxFQUFFLENBQ2hILENBQ0YsQ0FBQztRQUVGLG1EQUFtRDtRQUNuRCxJQUFJLFFBQVEsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztnQkFDWCxzQ0FBc0M7Z0JBQ3RDLElBQUksQ0FBQztvQkFDSCxNQUFNLFVBQVUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO29CQUN6QyxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLGlCQUFpQixTQUFTLFNBQVMsRUFBRTt3QkFDN0UsT0FBTyxFQUFFOzRCQUNQLGFBQWEsRUFBRSxVQUFVLE1BQU0sQ0FBQyxLQUFLLEVBQUU7NEJBQ3ZDLE1BQU0sRUFBRSxtQkFBbUI7eUJBQzVCO3dCQUNELE1BQU0sRUFBRSxVQUFVLENBQUMsTUFBTTtxQkFDMUIsQ0FBQyxDQUFDO29CQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7d0JBQ2pCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ2pFLENBQUM7b0JBRUQscUJBQXFCO29CQUNyQixHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRTt3QkFDakIsY0FBYyxFQUFFLG1CQUFtQjt3QkFDbkMsZUFBZSxFQUFFLFVBQVU7d0JBQzNCLFVBQVUsRUFBRSxZQUFZO3dCQUN4Qiw2QkFBNkIsRUFBRSxHQUFHO3dCQUNsQyw4QkFBOEIsRUFBRSxlQUFlO3dCQUMvQyxtQkFBbUIsRUFBRSxJQUFJO3FCQUMxQixDQUFDLENBQUM7b0JBRUgsbUJBQW1CO29CQUNuQixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxDQUFDO29CQUMxQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO29CQUN0QyxDQUFDO29CQUVELE1BQU0sT0FBTyxHQUFHLElBQUksV0FBVyxFQUFFLENBQUM7b0JBQ2xDLE1BQU0sWUFBWSxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO29CQUNsQyxNQUFNLElBQUksR0FBRyxLQUFLLElBQUksRUFBRTt3QkFDdEIsSUFBSSxDQUFDOzRCQUNILE9BQU8sSUFBSSxFQUFFLENBQUM7Z0NBQ1osTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQ0FDNUMsSUFBSSxJQUFJO29DQUFFLE1BQU07Z0NBQ2hCLFlBQVksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQztnQ0FDbkMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztnQ0FDdEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQzs0QkFDbkIsQ0FBQzt3QkFDSCxDQUFDO3dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7NEJBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUN2RSxDQUFDO29CQUNILENBQUMsQ0FBQztvQkFFRixJQUFJLEVBQUUsQ0FBQztvQkFFUCx5QkFBeUI7b0JBQ3pCLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTt3QkFDbkIsTUFBTSxDQUFDLEdBQUcsQ0FDUixlQUFLLENBQUMsTUFBTSxDQUNWLCtDQUErQyxTQUFTLGFBQWEsWUFBWSxDQUFDLEtBQUssU0FBUyxDQUNqRyxDQUNGLENBQUM7d0JBQ0YsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUNyQixDQUFDLENBQUMsQ0FBQztvQkFFSCxPQUFPO2dCQUNULENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxNQUFNLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3BFLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO2dCQUMxRSxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7UUFFRCx5QkFBeUI7UUFDekIsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDcEUsQ0FBQztRQUVELE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUM7UUFDM0MsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUM5QyxNQUFNLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQzlELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLENBQUM7UUFFRCxxQkFBcUI7UUFDckIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDakIsY0FBYyxFQUFFLG1CQUFtQjtZQUNuQyxlQUFlLEVBQUUsVUFBVTtZQUMzQixVQUFVLEVBQUUsWUFBWTtZQUN4Qiw2QkFBNkIsRUFBRSxHQUFHO1lBQ2xDLDhCQUE4QixFQUFFLGVBQWU7WUFDL0MsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLDBCQUEwQjtZQUNyRCxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsc0JBQXNCO1NBQ3ZELENBQUMsQ0FBQztRQUVILHVDQUF1QztRQUN2QyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFbkIsZ0NBQWdDO1FBQ2hDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckIsSUFBSSxHQUFHLENBQUMsS0FBSztZQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUUzQiwrQkFBK0I7UUFDL0IsYUFBYSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxLQUFLLENBQUMsaUNBQWlDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxTQUFTLElBQUksQ0FBQyxDQUFDO1FBRTFFLDJEQUEyRDtRQUMzRCxNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFO1lBQ2pDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUM1QixJQUFJLEdBQUcsQ0FBQyxLQUFLO2dCQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM3QixDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFViw0REFBNEQ7UUFDNUQsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLE1BQU0sT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUNuQixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2YsU0FBUyxHQUFHLElBQUksQ0FBQztnQkFDakIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLHdDQUF3QyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQzlFLGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUMzQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDM0IsQ0FBQztRQUNILENBQUMsQ0FBQztRQUVGLHlEQUF5RDtRQUN6RCxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQ3RCLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLFNBQVMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ2hFLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQyxDQUFDLENBQUM7UUFDSCxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUM1QixDQUFDLENBQUMsQ0FBQztJQUVILHdCQUF3QjtJQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDM0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDdkMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBRS9CLG9EQUFvRDtRQUNwRCxJQUFJLENBQUMsSUFBSSxLQUFLLFNBQVMsSUFBSSxHQUFHLEtBQUssU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssU0FBUyxJQUFJLEdBQUcsS0FBSyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQzNGLE1BQU0sQ0FBQyxJQUFJLENBQ1QscUNBQXFDLFNBQVMscUNBQXFDLENBQ3BGLENBQUM7WUFDRixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1EQUFtRCxFQUFFLENBQUMsQ0FBQztRQUM5RixDQUFDO1FBRUQsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUMscUNBQXFDLFNBQVMsd0JBQXdCLENBQUMsQ0FBQztZQUNwRixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBRUQsSUFBSSxHQUFHLEtBQUssU0FBUyxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxJQUFJLENBQUMscUNBQXFDLFNBQVMsdUJBQXVCLENBQUMsQ0FBQztZQUNuRixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsaUNBQWlDO29CQUNqQyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxRQUFRLEVBQUU7NEJBQzVFLE1BQU0sRUFBRSxxQkFBVSxDQUFDLElBQUk7NEJBQ3ZCLE9BQU8sRUFBRTtnQ0FDUCxjQUFjLEVBQUUsa0JBQWtCO2dDQUNsQyxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDOzRCQUM5QixNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUN0RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2pELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDYixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsU0FBUyxzQkFBc0IsQ0FBQyxDQUFDO2dCQUN6RCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsU0FBUyw0QkFBNEIsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQ2hGLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxJQUFJLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQzFELE1BQU0sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLFNBQVMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVwRixVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMzQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLElBQUksS0FBSyxZQUFZLG1CQUFRLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ2xGLENBQUM7aUJBQU0sQ0FBQztnQkFDTixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7WUFDMUQsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILGlCQUFpQjtJQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDNUQsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDdkMsTUFBTSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBRWhDLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pELE1BQU0sQ0FBQyxJQUFJLENBQUMsc0NBQXNDLFNBQVMseUJBQXlCLENBQUMsQ0FBQztZQUN0RixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztRQUMxRSxDQUFDO1FBRUQsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxJQUFJLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFDdkQsTUFBTSxDQUFDLElBQUksQ0FDVCxzQ0FBc0MsU0FBUyxVQUFVLElBQUksVUFBVSxJQUFJLGVBQWUsQ0FDM0YsQ0FBQztZQUNGLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMENBQTBDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLENBQUM7UUFFRCxxQ0FBcUM7UUFDckMsTUFBTSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsU0FBUyxPQUFPLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRWpFLElBQUksQ0FBQztZQUNILG1EQUFtRDtZQUNuRCxJQUFJLFFBQVEsSUFBSSxjQUFjLEVBQUUsQ0FBQztnQkFDL0IsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUM5RCxJQUFJLE1BQU0sRUFBRSxDQUFDO29CQUNYLGtDQUFrQztvQkFDbEMsSUFBSSxDQUFDO3dCQUNILE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLEdBQUcsTUFBTSxDQUFDLEdBQUcsaUJBQWlCLFNBQVMsU0FBUyxFQUFFOzRCQUM3RSxNQUFNLEVBQUUscUJBQVUsQ0FBQyxJQUFJOzRCQUN2QixPQUFPLEVBQUU7Z0NBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQ0FDbEMsYUFBYSxFQUFFLFVBQVUsTUFBTSxDQUFDLEtBQUssRUFBRTs2QkFDeEM7NEJBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUM7NEJBQ3BDLE1BQU0sRUFBRSxXQUFXLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt5QkFDbEMsQ0FBQyxDQUFDO3dCQUVILElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ2pCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7d0JBQ2pFLENBQUM7d0JBRUQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ3pDLENBQUM7b0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzt3QkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxNQUFNLENBQUMsSUFBSSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQzFFLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO29CQUMxRSxDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDO1lBRUQseUJBQXlCO1lBQ3pCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxTQUFTLHVCQUF1QixDQUFDLENBQUM7Z0JBQ3pELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7WUFFRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxTQUFTLDRCQUE0QixPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztnQkFDL0UsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7WUFDbkUsQ0FBQztZQUVELHFCQUFxQjtZQUNyQixVQUFVLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDaEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsU0FBUyxlQUFlLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFM0UsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHlDQUF5QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQy9ELElBQUksS0FBSyxZQUFZLG1CQUFRLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ3RGLENBQUM7aUJBQU0sQ0FBQztnQkFDTixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDLENBQUM7WUFDOUQsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILHNCQUFzQjtJQUN0QixNQUFNLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDdEQsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUM7UUFDdkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsTUFBTSxDQUFDLCtDQUErQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDckYsTUFBTSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdEQsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFFMUIsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUMsa0NBQWtDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsaUNBQWlDLEVBQUUsQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFFRCxNQUFNLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsNEJBQTRCLFNBQVMsYUFBYSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFakYsSUFBSSxDQUFDO1lBQ0gsbURBQW1EO1lBQ25ELElBQUksUUFBUSxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUMvQixNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQzlELElBQUksTUFBTSxFQUFFLENBQUM7b0JBQ1gsa0NBQWtDO29CQUNsQyxJQUFJLENBQUM7d0JBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxFQUFFLEVBQUU7NEJBQ3RFLE1BQU0sRUFBRSxxQkFBVSxDQUFDLEtBQUs7NEJBQ3hCLE9BQU8sRUFBRTtnQ0FDUCxjQUFjLEVBQUUsa0JBQWtCO2dDQUNsQyxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFOzZCQUN4Qzs0QkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDOzRCQUM5QixNQUFNLEVBQUUsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7eUJBQ2xDLENBQUMsQ0FBQzt3QkFFSCxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxDQUFDOzRCQUNqQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO3dCQUNqRSxDQUFDO3dCQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO29CQUN6QyxDQUFDO29CQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7d0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUMvRSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUMsQ0FBQztvQkFDMUUsQ0FBQztnQkFDSCxDQUFDO1lBQ0gsQ0FBQztZQUVELHlCQUF5QjtZQUN6QixNQUFNLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7WUFFdEQsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2IsTUFBTSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsU0FBUyw0QkFBNEIsQ0FBQyxDQUFDO2dCQUN0RSxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLENBQUMsQ0FBQztZQUM5RCxDQUFDO1lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFbEUsMEJBQTBCO1lBQzFCLE1BQU0sQ0FBQyxLQUFLLENBQUMsZ0RBQWdELFNBQVMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxDQUFDO1lBQ3BGLE1BQU0sVUFBVSxHQUFHLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDakUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsS0FBSyxDQUFDLG1CQUFtQixTQUFTLHFCQUFxQixVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFdkYsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3BELElBQUksS0FBSyxZQUFZLG1CQUFRLEVBQUUsQ0FBQztnQkFDOUIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsK0JBQStCLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQzNGLENBQUM7aUJBQU0sQ0FBQztnQkFDTixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSwrQkFBK0IsRUFBRSxDQUFDLENBQUM7WUFDbkUsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILCtDQUErQztJQUMvQyxNQUFNLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDaEUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7UUFFakMsSUFBSSxDQUFDO1lBQ0gsMERBQTBEO1lBQzFELElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ25CLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWCxNQUFNLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDN0QsTUFBTSxRQUFRLEdBQUcsTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxpQkFBaUIsU0FBUyxhQUFhLEVBQUU7d0JBQ2pGLE1BQU0sRUFBRSxxQkFBVSxDQUFDLElBQUk7d0JBQ3ZCLE9BQU8sRUFBRTs0QkFDUCxjQUFjLEVBQUUsa0JBQWtCOzRCQUNsQyxhQUFhLEVBQUUsVUFBVSxNQUFNLENBQUMsS0FBSyxFQUFFO3lCQUN4QztxQkFDRixDQUFDLENBQUM7b0JBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQzt3QkFDakIsTUFBTSxLQUFLLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7d0JBQ3BDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUNqRCxDQUFDO29CQUVELE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksRUFBRSxDQUFDO29CQUNyQyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzFCLENBQUM7WUFDSCxDQUFDO1lBRUQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLHVDQUF1QyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFM0UsMEJBQTBCO1lBQzFCLE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxTQUFTLDJCQUEyQixDQUFDLENBQUM7Z0JBQzlELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1lBQzlELENBQUM7WUFFRCw4QkFBOEI7WUFDOUIsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNqQyxNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsU0FBUyw0QkFBNEIsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQ2hGLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLENBQUM7WUFFRCx5QkFBeUI7WUFDekIsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZDLE1BQU0sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLEtBQUssQ0FBQyxXQUFXLFNBQVMsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1lBRTVFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsSUFBSSxLQUFLLFlBQVksbUJBQVEsRUFBRSxDQUFDO2dCQUM5QixHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDMUYsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDhCQUE4QixFQUFFLENBQUMsQ0FBQztZQUNsRSxDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVELCtCQUErQjtBQUMvQixTQUFTLGlCQUFpQjtJQUN4QixtQkFBbUI7SUFDbkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDakMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQzVCLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUM3QyxDQUFDO0lBRUQsbUNBQW1DO0lBQ25DLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDcEMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUVwQyxvQ0FBb0M7SUFDcEMsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvRSxPQUFPO1FBQ0wsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2YsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ2hCLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUNqQixHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFDakIsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDO0tBQ2xCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ2QsQ0FBQztBQUVELHlEQUF5RDtBQUNsRCxLQUFLLFVBQVUsb0JBQW9CLENBQUMsTUFhMUM7SUFDQyxJQUFJLENBQUM7UUFDSCw0Q0FBNEM7UUFDNUMsTUFBTSxPQUFPLEdBQUcsSUFBQSwwQ0FBb0IsRUFDbEMsVUFBVSxFQUNWLE9BQU8sRUFDUDtZQUNFLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUztZQUMzQixnQkFBZ0IsRUFBRSxNQUFNLENBQUMsVUFBVTtZQUNuQyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ2pDLGtCQUFrQixFQUFFLElBQUksRUFBRSxtQ0FBbUM7WUFDN0QsV0FBVyxFQUFFLE1BQU0sQ0FBQyxXQUFXO1lBQy9CLFNBQVMsRUFBRSxNQUFNLENBQUMsU0FBUztZQUMzQixhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7WUFDbkMsY0FBYyxFQUFFLE1BQU0sQ0FBQyxjQUFjO1lBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtZQUNuQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7WUFDbkMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxlQUFlO1NBQ3hDLEVBQ0QsTUFBTSxDQUFDLFNBQVMsQ0FDakIsQ0FBQztRQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMsNERBQTRELE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRTdGLHlDQUF5QztRQUN6QyxNQUFNLFFBQVEsR0FBRyxNQUFNLDRDQUFrQixDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXRFLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ0wsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLDBCQUEwQjthQUNsQyxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ25CLE9BQU87Z0JBQ0wsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsS0FBSyxFQUFFLFFBQVEsQ0FBQyxLQUFLO2FBQ3RCLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUksUUFBUSxDQUFDLE9BQWlDLEVBQUUsT0FBTyxLQUFLLElBQUksQ0FBQztRQUM5RSxPQUFPO1lBQ0wsT0FBTztZQUNQLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsdUJBQXVCO1NBQ3JELENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsT0FBTztZQUNMLE9BQU8sRUFBRSxLQUFLO1lBQ2QsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7U0FDaEUsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB7IFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgY2VsbHNUb1RleHQgfSBmcm9tICcuLi8uLi9zaGFyZWQvdGVybWluYWwtdGV4dC1mb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXJ2ZXJTdGF0dXMsIFNlc3Npb24sIFNlc3Npb25BY3Rpdml0eSwgVGl0bGVNb2RlIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB7IEh0dHBNZXRob2QgfSBmcm9tICcuLi8uLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgUHR5RXJyb3IsIHR5cGUgUHR5TWFuYWdlciB9IGZyb20gJy4uL3B0eS9pbmRleC5qcyc7XG5pbXBvcnQgdHlwZSB7IEFjdGl2aXR5TW9uaXRvciB9IGZyb20gJy4uL3NlcnZpY2VzL2FjdGl2aXR5LW1vbml0b3IuanMnO1xuaW1wb3J0IHR5cGUgeyBSZW1vdGVSZWdpc3RyeSB9IGZyb20gJy4uL3NlcnZpY2VzL3JlbW90ZS1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IFN0cmVhbVdhdGNoZXIgfSBmcm9tICcuLi9zZXJ2aWNlcy9zdHJlYW0td2F0Y2hlci5qcyc7XG5pbXBvcnQgeyB0YWlsc2NhbGVTZXJ2ZVNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy90YWlsc2NhbGUtc2VydmUtc2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uL3NlcnZpY2VzL3Rlcm1pbmFsLW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgZGV0ZWN0R2l0SW5mbyB9IGZyb20gJy4uL3V0aWxzL2dpdC1pbmZvLmpzJztcbmltcG9ydCB7IGdldERldGFpbGVkR2l0U3RhdHVzIH0gZnJvbSAnLi4vdXRpbHMvZ2l0LXN0YXR1cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUFic29sdXRlUGF0aCB9IGZyb20gJy4uL3V0aWxzL3BhdGgtdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTZXNzaW9uTmFtZSB9IGZyb20gJy4uL3V0aWxzL3Nlc3Npb24tbmFtaW5nLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbnRyb2xNZXNzYWdlLCB0eXBlIFRlcm1pbmFsU3Bhd25SZXNwb25zZSB9IGZyb20gJy4uL3dlYnNvY2tldC9jb250cm9sLXByb3RvY29sLmpzJztcbmltcG9ydCB7IGNvbnRyb2xVbml4SGFuZGxlciB9IGZyb20gJy4uL3dlYnNvY2tldC9jb250cm9sLXVuaXgtaGFuZGxlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignc2Vzc2lvbnMnKTtcbmNvbnN0IF9leGVjRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuZXhlY0ZpbGUpO1xuXG5pbnRlcmZhY2UgU2Vzc2lvblJvdXRlc0NvbmZpZyB7XG4gIHB0eU1hbmFnZXI6IFB0eU1hbmFnZXI7XG4gIHRlcm1pbmFsTWFuYWdlcjogVGVybWluYWxNYW5hZ2VyO1xuICBzdHJlYW1XYXRjaGVyOiBTdHJlYW1XYXRjaGVyO1xuICByZW1vdGVSZWdpc3RyeTogUmVtb3RlUmVnaXN0cnkgfCBudWxsO1xuICBpc0hRTW9kZTogYm9vbGVhbjtcbiAgYWN0aXZpdHlNb25pdG9yOiBBY3Rpdml0eU1vbml0b3I7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byByZXNvbHZlIHBhdGggd2l0aCBkZWZhdWx0IGZhbGxiYWNrXG5mdW5jdGlvbiByZXNvbHZlUGF0aChpbnB1dFBhdGg6IHN0cmluZywgZGVmYXVsdFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICghaW5wdXRQYXRoIHx8IGlucHV0UGF0aC50cmltKCkgPT09ICcnKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRQYXRoO1xuICB9XG5cbiAgLy8gVXNlIG91ciB1dGlsaXR5IGZ1bmN0aW9uIHRvIGhhbmRsZSB0aWxkZSBleHBhbnNpb24gYW5kIGFic29sdXRlIHBhdGggcmVzb2x1dGlvblxuICBjb25zdCBleHBhbmRlZCA9IHJlc29sdmVBYnNvbHV0ZVBhdGgoaW5wdXRQYXRoKTtcblxuICAvLyBJZiB0aGUgaW5wdXQgd2FzIHJlbGF0aXZlIChub3Qgc3RhcnRpbmcgd2l0aCAvIG9yIH4pLCByZXNvbHZlIGl0IHJlbGF0aXZlIHRvIGRlZmF1bHRQYXRoXG4gIGlmICghaW5wdXRQYXRoLnN0YXJ0c1dpdGgoJy8nKSAmJiAhaW5wdXRQYXRoLnN0YXJ0c1dpdGgoJ34nKSkge1xuICAgIHJldHVybiBwYXRoLmpvaW4oZGVmYXVsdFBhdGgsIGlucHV0UGF0aCk7XG4gIH1cblxuICByZXR1cm4gZXhwYW5kZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uUm91dGVzKGNvbmZpZzogU2Vzc2lvblJvdXRlc0NvbmZpZyk6IFJvdXRlciB7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuICBjb25zdCB7IHB0eU1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgc3RyZWFtV2F0Y2hlciwgcmVtb3RlUmVnaXN0cnksIGlzSFFNb2RlLCBhY3Rpdml0eU1vbml0b3IgfSA9XG4gICAgY29uZmlnO1xuXG4gIC8vIFNlcnZlciBzdGF0dXMgZW5kcG9pbnRcbiAgcm91dGVyLmdldCgnL3NlcnZlci9zdGF0dXMnLCBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG4gICAgbG9nZ2VyLmRlYnVnKCdbR0VUIC9zZXJ2ZXIvc3RhdHVzXSBHZXR0aW5nIHNlcnZlciBzdGF0dXMnKTtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhdHVzOiBTZXJ2ZXJTdGF0dXMgPSB7XG4gICAgICAgIG1hY0FwcENvbm5lY3RlZDogY29udHJvbFVuaXhIYW5kbGVyLmlzTWFjQXBwQ29ubmVjdGVkKCksXG4gICAgICAgIGlzSFFNb2RlLFxuICAgICAgICB2ZXJzaW9uOiBwcm9jZXNzLmVudi5WRVJTSU9OIHx8ICd1bmtub3duJyxcbiAgICAgIH07XG4gICAgICByZXMuanNvbihzdGF0dXMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgc2VydmVyIHN0YXR1czonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCBzZXJ2ZXIgc3RhdHVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIFRhaWxzY2FsZSBTZXJ2ZSBzdGF0dXMgZW5kcG9pbnRcbiAgcm91dGVyLmdldCgnL3Nlc3Npb25zL3RhaWxzY2FsZS9zdGF0dXMnLCBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG4gICAgbG9nZ2VyLmRlYnVnKCdbR0VUIC9zZXNzaW9ucy90YWlsc2NhbGUvc3RhdHVzXSBHZXR0aW5nIFRhaWxzY2FsZSBTZXJ2ZSBzdGF0dXMnKTtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgdGFpbHNjYWxlU2VydmVTZXJ2aWNlLmdldFN0YXR1cygpO1xuICAgICAgcmVzLmpzb24oc3RhdHVzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gZ2V0IFRhaWxzY2FsZSBTZXJ2ZSBzdGF0dXM6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBnZXQgVGFpbHNjYWxlIFNlcnZlIHN0YXR1cycgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBMaXN0IGFsbCBzZXNzaW9ucyAoYWdncmVnYXRlIGxvY2FsICsgcmVtb3RlIGluIEhRIG1vZGUpXG4gIHJvdXRlci5nZXQoJy9zZXNzaW9ucycsIGFzeW5jIChfcmVxLCByZXMpID0+IHtcbiAgICBsb2dnZXIuZGVidWcoJ1tHRVQgL3Nlc3Npb25zXSBMaXN0aW5nIGFsbCBzZXNzaW9ucycpO1xuICAgIHRyeSB7XG4gICAgICBsZXQgYWxsU2Vzc2lvbnMgPSBbXTtcblxuICAgICAgLy8gR2V0IGxvY2FsIHNlc3Npb25zXG4gICAgICBjb25zdCBsb2NhbFNlc3Npb25zID0gcHR5TWFuYWdlci5saXN0U2Vzc2lvbnMoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW0dFVCAvc2Vzc2lvbnNdIEZvdW5kICR7bG9jYWxTZXNzaW9ucy5sZW5ndGh9IGxvY2FsIHNlc3Npb25zYCk7XG5cbiAgICAgIC8vIExvZyBzZXNzaW9uIG5hbWVzIGZvciBkZWJ1Z2dpbmdcbiAgICAgIC8vIGxvY2FsU2Vzc2lvbnMuZm9yRWFjaCgoc2Vzc2lvbikgPT4ge1xuICAgICAgLy8gICBsb2dnZXIuZGVidWcoXG4gICAgICAvLyAgICAgYFtHRVQgL3Nlc3Npb25zXSBTZXNzaW9uICR7c2Vzc2lvbi5pZH06IG5hbWU9XCIke3Nlc3Npb24ubmFtZSB8fCAnbnVsbCd9XCIsIHdvcmtpbmdEaXI9XCIke3Nlc3Npb24ud29ya2luZ0Rpcn1cImBcbiAgICAgIC8vICAgKTtcbiAgICAgIC8vIH0pO1xuXG4gICAgICAvLyBBZGQgc291cmNlIGluZm8gdG8gbG9jYWwgc2Vzc2lvbnMgYW5kIGRldGVjdCBHaXQgaW5mbyBpZiBtaXNzaW5nXG4gICAgICBjb25zdCBsb2NhbFNlc3Npb25zV2l0aFNvdXJjZSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICBsb2NhbFNlc3Npb25zLm1hcChhc3luYyAoc2Vzc2lvbikgPT4ge1xuICAgICAgICAgIC8vIElmIHNlc3Npb24gZG9lc24ndCBoYXZlIEdpdCBpbmZvLCB0cnkgdG8gZGV0ZWN0IGl0XG4gICAgICAgICAgaWYgKCFzZXNzaW9uLmdpdFJlcG9QYXRoICYmIHNlc3Npb24ud29ya2luZ0Rpcikge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgZ2l0SW5mbyA9IGF3YWl0IGRldGVjdEdpdEluZm8oc2Vzc2lvbi53b3JraW5nRGlyKTtcbiAgICAgICAgICAgICAgLy8gbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICAvLyAgIGBbR0VUIC9zZXNzaW9uc10gRGV0ZWN0ZWQgR2l0IGluZm8gZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTogcmVwbz0ke2dpdEluZm8uZ2l0UmVwb1BhdGh9LCBicmFuY2g9JHtnaXRJbmZvLmdpdEJyYW5jaH1gXG4gICAgICAgICAgICAgIC8vICk7XG4gICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgLi4uc2Vzc2lvbixcbiAgICAgICAgICAgICAgICAuLi5naXRJbmZvLFxuICAgICAgICAgICAgICAgIHNvdXJjZTogJ2xvY2FsJyBhcyBjb25zdCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgIC8vIElmIEdpdCBkZXRlY3Rpb24gZmFpbHMsIGp1c3QgcmV0dXJuIHNlc3Npb24gYXMtaXNcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgICAgIGBbR0VUIC9zZXNzaW9uc10gQ291bGQgbm90IGRldGVjdCBHaXQgaW5mbyBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OiAke2Vycm9yfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uc2Vzc2lvbixcbiAgICAgICAgICAgIHNvdXJjZTogJ2xvY2FsJyBhcyBjb25zdCxcbiAgICAgICAgICB9O1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgICAgYWxsU2Vzc2lvbnMgPSBbLi4ubG9jYWxTZXNzaW9uc1dpdGhTb3VyY2VdO1xuXG4gICAgICAvLyBJZiBpbiBIUSBtb2RlLCBhZ2dyZWdhdGUgc2Vzc2lvbnMgZnJvbSBhbGwgcmVtb3Rlc1xuICAgICAgaWYgKGlzSFFNb2RlICYmIHJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZXMgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVzKCk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgY2hlY2tpbmcgJHtyZW1vdGVzLmxlbmd0aH0gcmVtb3RlIHNlcnZlcnMgZm9yIHNlc3Npb25zYCk7XG5cbiAgICAgICAgLy8gRmV0Y2ggc2Vzc2lvbnMgZnJvbSBlYWNoIHJlbW90ZSBpbiBwYXJhbGxlbFxuICAgICAgICBjb25zdCByZW1vdGVQcm9taXNlcyA9IHJlbW90ZXMubWFwKGFzeW5jIChyZW1vdGUpID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnNgLCB7XG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSwgLy8gNSBzZWNvbmQgdGltZW91dFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICBjb25zdCByZW1vdGVTZXNzaW9ucyA9IChhd2FpdCByZXNwb25zZS5qc29uKCkpIGFzIFNlc3Npb25bXTtcbiAgICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBnb3QgJHtyZW1vdGVTZXNzaW9ucy5sZW5ndGh9IHNlc3Npb25zIGZyb20gcmVtb3RlICR7cmVtb3RlLm5hbWV9YCk7XG5cbiAgICAgICAgICAgICAgLy8gVHJhY2sgc2Vzc2lvbiBJRHMgZm9yIHRoaXMgcmVtb3RlXG4gICAgICAgICAgICAgIGNvbnN0IHNlc3Npb25JZHMgPSByZW1vdGVTZXNzaW9ucy5tYXAoKHM6IFNlc3Npb24pID0+IHMuaWQpO1xuICAgICAgICAgICAgICByZW1vdGVSZWdpc3RyeS51cGRhdGVSZW1vdGVTZXNzaW9ucyhyZW1vdGUuaWQsIHNlc3Npb25JZHMpO1xuXG4gICAgICAgICAgICAgIC8vIEFkZCByZW1vdGUgaW5mbyB0byBlYWNoIHNlc3Npb25cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbW90ZVNlc3Npb25zLm1hcCgoc2Vzc2lvbjogU2Vzc2lvbikgPT4gKHtcbiAgICAgICAgICAgICAgICAuLi5zZXNzaW9uLFxuICAgICAgICAgICAgICAgIHNvdXJjZTogJ3JlbW90ZScsXG4gICAgICAgICAgICAgICAgcmVtb3RlSWQ6IHJlbW90ZS5pZCxcbiAgICAgICAgICAgICAgICByZW1vdGVOYW1lOiByZW1vdGUubmFtZSxcbiAgICAgICAgICAgICAgICByZW1vdGVVcmw6IHJlbW90ZS51cmwsXG4gICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgICAgIGBmYWlsZWQgdG8gZ2V0IHNlc3Npb25zIGZyb20gcmVtb3RlICR7cmVtb3RlLm5hbWV9OiBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBnZXQgc2Vzc2lvbnMgZnJvbSByZW1vdGUgJHtyZW1vdGUubmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcmVtb3RlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHJlbW90ZVByb21pc2VzKTtcbiAgICAgICAgY29uc3QgcmVtb3RlU2Vzc2lvbnMgPSByZW1vdGVSZXN1bHRzLmZsYXQoKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGB0b3RhbCByZW1vdGUgc2Vzc2lvbnM6ICR7cmVtb3RlU2Vzc2lvbnMubGVuZ3RofWApO1xuXG4gICAgICAgIGFsbFNlc3Npb25zID0gWy4uLmFsbFNlc3Npb25zLCAuLi5yZW1vdGVTZXNzaW9uc107XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgcmV0dXJuaW5nICR7YWxsU2Vzc2lvbnMubGVuZ3RofSB0b3RhbCBzZXNzaW9uc2ApO1xuICAgICAgcmVzLmpzb24oYWxsU2Vzc2lvbnMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGxpc3Rpbmcgc2Vzc2lvbnM6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBsaXN0IHNlc3Npb25zJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENyZWF0ZSBuZXcgc2Vzc2lvbiAobG9jYWwgb3Igb24gcmVtb3RlKVxuICByb3V0ZXIucG9zdCgnL3Nlc3Npb25zJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3QgeyBjb21tYW5kLCB3b3JraW5nRGlyLCBuYW1lLCByZW1vdGVJZCwgc3Bhd25fdGVybWluYWwsIGNvbHMsIHJvd3MsIHRpdGxlTW9kZSB9ID0gcmVxLmJvZHk7XG4gICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgYGNyZWF0aW5nIG5ldyBzZXNzaW9uOiBjb21tYW5kPSR7SlNPTi5zdHJpbmdpZnkoY29tbWFuZCl9LCByZW1vdGVJZD0ke3JlbW90ZUlkIHx8ICdsb2NhbCd9LCBzcGF3bl90ZXJtaW5hbD0ke3NwYXduX3Rlcm1pbmFsfSwgY29scz0ke2NvbHN9LCByb3dzPSR7cm93c31gXG4gICAgKTtcblxuICAgIGlmICghY29tbWFuZCB8fCAhQXJyYXkuaXNBcnJheShjb21tYW5kKSB8fCBjb21tYW5kLmxlbmd0aCA9PT0gMCkge1xuICAgICAgbG9nZ2VyLndhcm4oJ3Nlc3Npb24gY3JlYXRpb24gZmFpbGVkOiBpbnZhbGlkIGNvbW1hbmQgYXJyYXknKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnQ29tbWFuZCBhcnJheSBpcyByZXF1aXJlZCcgfSk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgY29tbWFuZCBhcnJheSBmb3Igc2VjdXJpdHlcbiAgICB0cnkge1xuICAgICAgZm9yIChjb25zdCBhcmcgb2YgY29tbWFuZCkge1xuICAgICAgICBpZiAodHlwZW9mIGFyZyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FsbCBjb21tYW5kIGFyZ3VtZW50cyBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYXJnLmxlbmd0aCA+IDEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgYXJndW1lbnQgZXhjZWVkcyBtYXhpbXVtIGxlbmd0aCcpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFByZXZlbnQgbnVsbCBieXRlcyB3aGljaCBjYW4gYmUgdXNlZCBmb3IgaW5qZWN0aW9uXG4gICAgICAgIGlmIChhcmcuaW5jbHVkZXMoJ1xcMCcpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb21tYW5kIGFyZ3VtZW50cyBjYW5ub3QgY29udGFpbiBudWxsIGJ5dGVzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gVmFsaWRhdGUgdGhlIGJhc2UgY29tbWFuZFxuICAgICAgY29uc3QgYmFzZUNvbW1hbmQgPSBjb21tYW5kWzBdO1xuICAgICAgaWYgKGJhc2VDb21tYW5kLmluY2x1ZGVzKCcvJykgJiYgIWJhc2VDb21tYW5kLnN0YXJ0c1dpdGgoJy8nKSkge1xuICAgICAgICAvLyBSZWxhdGl2ZSBwYXRocyB3aXRoIGRpcmVjdG9yeSBzZXBhcmF0b3JzIGFyZSBzdXNwaWNpb3VzXG4gICAgICAgIGlmIChiYXNlQ29tbWFuZC5pbmNsdWRlcygnLi4vJykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgY2Fubm90IGNvbnRhaW4gZGlyZWN0b3J5IHRyYXZlcnNhbCBzZXF1ZW5jZXMnKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBmb3IgY29tbWFuZCBpbmplY3Rpb24gcGF0dGVybnMgaW4gdGhlIGZpcnN0IGFyZ3VtZW50XG4gICAgICBjb25zdCBkYW5nZXJvdXNQYXR0ZXJucyA9IFtcbiAgICAgICAgL1s7JnxgJCgpXS8sIC8vIENvbW1hbmQgc2VwYXJhdG9ycyBhbmQgc3Vic3RpdHV0aW9uXG4gICAgICAgIC9cXCRcXHsvLCAvLyBQYXJhbWV0ZXIgZXhwYW5zaW9uXG4gICAgICAgIC9cXCRcXCgvLCAvLyBDb21tYW5kIHN1YnN0aXR1dGlvblxuICAgICAgICAvPlxccypcXC9kZXYvLCAvLyBEZXZpY2UgcmVkaXJlY3Rpb25zXG4gICAgICAgIC8yPiYxLywgLy8gRXJyb3IgcmVkaXJlY3Rpb25cbiAgICAgIF07XG5cbiAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBkYW5nZXJvdXNQYXR0ZXJucykge1xuICAgICAgICBpZiAocGF0dGVybi50ZXN0KGJhc2VDb21tYW5kKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ29tbWFuZCBjb250YWlucyBwb3RlbnRpYWxseSBkYW5nZXJvdXMgcGF0dGVybnMnKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBzZXNzaW9uIGNyZWF0aW9uIGZhaWxlZDogY29tbWFuZCB2YWxpZGF0aW9uIGVycm9yOiAke3ZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIEVycm9yID8gdmFsaWRhdGlvbkVycm9yLm1lc3NhZ2UgOiBTdHJpbmcodmFsaWRhdGlvbkVycm9yKX1gXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdJbnZhbGlkIGNvbW1hbmQnLFxuICAgICAgICBkZXRhaWxzOlxuICAgICAgICAgIHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIEVycm9yID8gdmFsaWRhdGlvbkVycm9yLm1lc3NhZ2UgOiBTdHJpbmcodmFsaWRhdGlvbkVycm9yKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAvLyBJZiByZW1vdGVJZCBpcyBzcGVjaWZpZWQgYW5kIHdlJ3JlIGluIEhRIG1vZGUsIGZvcndhcmQgdG8gcmVtb3RlXG4gICAgICBpZiAocmVtb3RlSWQgJiYgaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlKHJlbW90ZUlkKTtcbiAgICAgICAgaWYgKCFyZW1vdGUpIHtcbiAgICAgICAgICBsb2dnZXIud2Fybihgc2Vzc2lvbiBjcmVhdGlvbiBmYWlsZWQ6IHJlbW90ZSAke3JlbW90ZUlkfSBub3QgZm91bmRgKTtcbiAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1JlbW90ZSBzZXJ2ZXIgbm90IGZvdW5kJyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsuYmx1ZShgZm9yd2FyZGluZyBzZXNzaW9uIGNyZWF0aW9uIHRvIHJlbW90ZSAke3JlbW90ZS5uYW1lfWApKTtcblxuICAgICAgICAvLyBGb3J3YXJkIHRoZSByZXF1ZXN0IHRvIHRoZSByZW1vdGUgc2VydmVyXG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7cmVtb3RlLnVybH0vYXBpL3Nlc3Npb25zYCwge1xuICAgICAgICAgIG1ldGhvZDogSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICBjb21tYW5kLFxuICAgICAgICAgICAgd29ya2luZ0RpcixcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBzcGF3bl90ZXJtaW5hbCxcbiAgICAgICAgICAgIGNvbHMsXG4gICAgICAgICAgICByb3dzLFxuICAgICAgICAgICAgdGl0bGVNb2RlLFxuICAgICAgICAgICAgLy8gRG9uJ3QgZm9yd2FyZCByZW1vdGVJZCB0byBhdm9pZCByZWN1cnNpb25cbiAgICAgICAgICB9KSxcbiAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApLCAvLyAxMCBzZWNvbmQgdGltZW91dFxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgY29uc3QgZXJyb3IgPSBhd2FpdCByZXNwb25zZS5qc29uKCkuY2F0Y2goKCkgPT4gKHsgZXJyb3I6ICdVbmtub3duIGVycm9yJyB9KSk7XG4gICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IChhd2FpdCByZXNwb25zZS5qc29uKCkpIGFzIHsgc2Vzc2lvbklkOiBzdHJpbmcgfTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGByZW1vdGUgc2Vzc2lvbiBjcmVhdGlvbiB0b29rICR7RGF0ZS5ub3coKSAtIHN0YXJ0VGltZX1tc2ApO1xuXG4gICAgICAgIC8vIFRyYWNrIHRoZSBzZXNzaW9uIGluIHRoZSByZW1vdGUncyBzZXNzaW9uSWRzXG4gICAgICAgIGlmIChyZXN1bHQuc2Vzc2lvbklkKSB7XG4gICAgICAgICAgcmVtb3RlUmVnaXN0cnkuYWRkU2Vzc2lvblRvUmVtb3RlKHJlbW90ZS5pZCwgcmVzdWx0LnNlc3Npb25JZCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXMuanNvbihyZXN1bHQpOyAvLyBSZXR1cm4gc2Vzc2lvbklkIGFzLWlzLCBubyBuYW1lc3BhY2luZ1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHNwYXduX3Rlcm1pbmFsIGlzIHRydWUsIHVzZSB0aGUgY29udHJvbCBzb2NrZXQgZm9yIHRlcm1pbmFsIHNwYXduaW5nXG4gICAgICBpZiAoc3Bhd25fdGVybWluYWwpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBHZW5lcmF0ZSBzZXNzaW9uIElEXG4gICAgICAgICAgY29uc3Qgc2Vzc2lvbklkID0gZ2VuZXJhdGVTZXNzaW9uSWQoKTtcbiAgICAgICAgICBjb25zdCByZXNvbHZlZEN3ZCA9IHJlc29sdmVQYXRoKHdvcmtpbmdEaXIsIHByb2Nlc3MuY3dkKCkpO1xuICAgICAgICAgIGNvbnN0IHNlc3Npb25OYW1lID0gbmFtZSB8fCBnZW5lcmF0ZVNlc3Npb25OYW1lKGNvbW1hbmQsIHJlc29sdmVkQ3dkKTtcblxuICAgICAgICAgIC8vIERldGVjdCBHaXQgaW5mb3JtYXRpb24gZm9yIHRlcm1pbmFsIHNwYXduXG4gICAgICAgICAgY29uc3QgZ2l0SW5mbyA9IGF3YWl0IGRldGVjdEdpdEluZm8ocmVzb2x2ZWRDd2QpO1xuXG4gICAgICAgICAgLy8gUmVxdWVzdCBNYWMgYXBwIHRvIHNwYXduIHRlcm1pbmFsXG4gICAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICAgIGNoYWxrLmJsdWUoYHJlcXVlc3RpbmcgdGVybWluYWwgc3Bhd24gd2l0aCBjb21tYW5kOiAke0pTT04uc3RyaW5naWZ5KGNvbW1hbmQpfWApXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBzcGF3blJlc3VsdCA9IGF3YWl0IHJlcXVlc3RUZXJtaW5hbFNwYXduKHtcbiAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIHNlc3Npb25OYW1lLFxuICAgICAgICAgICAgY29tbWFuZCxcbiAgICAgICAgICAgIHdvcmtpbmdEaXI6IHJlc29sdmVkQ3dkLFxuICAgICAgICAgICAgdGl0bGVNb2RlLFxuICAgICAgICAgICAgZ2l0UmVwb1BhdGg6IGdpdEluZm8uZ2l0UmVwb1BhdGgsXG4gICAgICAgICAgICBnaXRCcmFuY2g6IGdpdEluZm8uZ2l0QnJhbmNoLFxuICAgICAgICAgICAgZ2l0QWhlYWRDb3VudDogZ2l0SW5mby5naXRBaGVhZENvdW50LFxuICAgICAgICAgICAgZ2l0QmVoaW5kQ291bnQ6IGdpdEluZm8uZ2l0QmVoaW5kQ291bnQsXG4gICAgICAgICAgICBnaXRIYXNDaGFuZ2VzOiBnaXRJbmZvLmdpdEhhc0NoYW5nZXMsXG4gICAgICAgICAgICBnaXRJc1dvcmt0cmVlOiBnaXRJbmZvLmdpdElzV29ya3RyZWUsXG4gICAgICAgICAgICBnaXRNYWluUmVwb1BhdGg6IGdpdEluZm8uZ2l0TWFpblJlcG9QYXRoLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKCFzcGF3blJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICAvLyBMb2cgdGhlIGVycm9yIGJ1dCBjb250aW51ZSB3aXRoIGZhbGxiYWNrXG4gICAgICAgICAgICBsb2dnZXIud2FybigndGVybWluYWwgc3Bhd24gZmFpbGVkOicsIHNwYXduUmVzdWx0LmVycm9yIHx8ICdVbmtub3duIGVycm9yJyk7XG4gICAgICAgICAgICBsb2dnZXIuZGVidWcoJ2ZhbGxpbmcgYmFjayB0byBub3JtYWwgd2ViIHNlc3Npb24nKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gV2FpdCBhIGJpdCBmb3IgdGhlIHNlc3Npb24gdG8gYmUgY3JlYXRlZFxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgNTAwKSk7XG5cbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgc2Vzc2lvbiBJRCAtIGNsaWVudCB3aWxsIHBvbGwgZm9yIHRoZSBzZXNzaW9uIHRvIGFwcGVhclxuICAgICAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgdGVybWluYWwgc3Bhd24gcmVxdWVzdGVkIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApKTtcbiAgICAgICAgICAgIHJlcy5qc29uKHsgc2Vzc2lvbklkLCBtZXNzYWdlOiAnVGVybWluYWwgc3Bhd24gcmVxdWVzdGVkJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgLy8gTG9nIHRoZSBlcnJvciBidXQgY29udGludWUgd2l0aCBmYWxsYmFja1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignZXJyb3Igc3Bhd25pbmcgdGVybWluYWw6JywgZXJyb3IpO1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnZmFsbGluZyBiYWNrIHRvIG5vcm1hbCB3ZWIgc2Vzc2lvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENyZWF0ZSBsb2NhbCBzZXNzaW9uXG4gICAgICBsZXQgY3dkID0gcmVzb2x2ZVBhdGgod29ya2luZ0RpciwgcHJvY2Vzcy5jd2QoKSk7XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBleGlzdHMsIGZhbGwgYmFjayB0byBwcm9jZXNzLmN3ZCgpIGlmIG5vdFxuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGN3ZCkpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFdvcmtpbmcgZGlyZWN0b3J5ICcke2N3ZH0nIGRvZXMgbm90IGV4aXN0LCB1c2luZyBjdXJyZW50IGRpcmVjdG9yeSBhcyBmYWxsYmFja2BcbiAgICAgICAgKTtcbiAgICAgICAgY3dkID0gcHJvY2Vzcy5jd2QoKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2Vzc2lvbk5hbWUgPSBuYW1lIHx8IGdlbmVyYXRlU2Vzc2lvbk5hbWUoY29tbWFuZCwgY3dkKTtcblxuICAgICAgLy8gRGV0ZWN0IEdpdCBpbmZvcm1hdGlvblxuICAgICAgY29uc3QgZ2l0SW5mbyA9IGF3YWl0IGRldGVjdEdpdEluZm8oY3dkKTtcblxuICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgY2hhbGsuYmx1ZShcbiAgICAgICAgICBgY3JlYXRpbmcgV0VCIHNlc3Npb246ICR7Y29tbWFuZC5qb2luKCcgJyl9IGluICR7Y3dkfSAoc3Bhd25fdGVybWluYWw9JHtzcGF3bl90ZXJtaW5hbH0pYFxuICAgICAgICApXG4gICAgICApO1xuXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwdHlNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oY29tbWFuZCwge1xuICAgICAgICBuYW1lOiBzZXNzaW9uTmFtZSxcbiAgICAgICAgd29ya2luZ0RpcjogY3dkLFxuICAgICAgICBjb2xzLFxuICAgICAgICByb3dzLFxuICAgICAgICB0aXRsZU1vZGUsXG4gICAgICAgIGdpdFJlcG9QYXRoOiBnaXRJbmZvLmdpdFJlcG9QYXRoLFxuICAgICAgICBnaXRCcmFuY2g6IGdpdEluZm8uZ2l0QnJhbmNoLFxuICAgICAgICBnaXRBaGVhZENvdW50OiBnaXRJbmZvLmdpdEFoZWFkQ291bnQsXG4gICAgICAgIGdpdEJlaGluZENvdW50OiBnaXRJbmZvLmdpdEJlaGluZENvdW50LFxuICAgICAgICBnaXRIYXNDaGFuZ2VzOiBnaXRJbmZvLmdpdEhhc0NoYW5nZXMsXG4gICAgICAgIGdpdElzV29ya3RyZWU6IGdpdEluZm8uZ2l0SXNXb3JrdHJlZSxcbiAgICAgICAgZ2l0TWFpblJlcG9QYXRoOiBnaXRJbmZvLmdpdE1haW5SZXBvUGF0aCxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB7IHNlc3Npb25JZCwgc2Vzc2lvbkluZm8gfSA9IHJlc3VsdDtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYFdFQiBzZXNzaW9uICR7c2Vzc2lvbklkfSBjcmVhdGVkIChQSUQ6ICR7c2Vzc2lvbkluZm8ucGlkfSlgKSk7XG5cbiAgICAgIC8vIFN0cmVhbSB3YXRjaGVyIGlzIHNldCB1cCB3aGVuIGNsaWVudHMgY29ubmVjdCB0byB0aGUgc3RyZWFtIGVuZHBvaW50XG5cbiAgICAgIHJlcy5qc29uKHsgc2Vzc2lvbklkIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGNyZWF0aW5nIHNlc3Npb246JywgZXJyb3IpO1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUHR5RXJyb3IpIHtcbiAgICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBjcmVhdGUgc2Vzc2lvbicsIGRldGFpbHM6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGNyZWF0ZSBzZXNzaW9uJyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBhY3Rpdml0eSBzdGF0dXMgZm9yIGFsbCBzZXNzaW9uc1xuICByb3V0ZXIuZ2V0KCcvc2Vzc2lvbnMvYWN0aXZpdHknLCBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG4gICAgbG9nZ2VyLmRlYnVnKCdnZXR0aW5nIGFjdGl2aXR5IHN0YXR1cyBmb3IgYWxsIHNlc3Npb25zJyk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFjdGl2aXR5U3RhdHVzOiBSZWNvcmQ8c3RyaW5nLCBTZXNzaW9uQWN0aXZpdHk+ID0ge307XG5cbiAgICAgIC8vIEdldCBsb2NhbCBzZXNzaW9ucyBhY3Rpdml0eVxuICAgICAgY29uc3QgbG9jYWxBY3Rpdml0eSA9IGFjdGl2aXR5TW9uaXRvci5nZXRBY3Rpdml0eVN0YXR1cygpO1xuICAgICAgT2JqZWN0LmFzc2lnbihhY3Rpdml0eVN0YXR1cywgbG9jYWxBY3Rpdml0eSk7XG5cbiAgICAgIC8vIElmIGluIEhRIG1vZGUsIGdldCBhY3Rpdml0eSBmcm9tIHJlbW90ZSBzZXJ2ZXJzXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlcyA9IHJlbW90ZVJlZ2lzdHJ5LmdldFJlbW90ZXMoKTtcblxuICAgICAgICAvLyBGZXRjaCBhY3Rpdml0eSBmcm9tIGVhY2ggcmVtb3RlIGluIHBhcmFsbGVsXG4gICAgICAgIGNvbnN0IHJlbW90ZVByb21pc2VzID0gcmVtb3Rlcy5tYXAoYXN5bmMgKHJlbW90ZSkgPT4ge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9zZXNzaW9ucy9hY3Rpdml0eWAsIHtcbiAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmIChyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICBjb25zdCByZW1vdGVBY3Rpdml0eSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByZW1vdGU6IHtcbiAgICAgICAgICAgICAgICAgIGlkOiByZW1vdGUuaWQsXG4gICAgICAgICAgICAgICAgICBuYW1lOiByZW1vdGUubmFtZSxcbiAgICAgICAgICAgICAgICAgIHVybDogcmVtb3RlLnVybCxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIGFjdGl2aXR5OiByZW1vdGVBY3Rpdml0eSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gZ2V0IGFjdGl2aXR5IGZyb20gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlbW90ZVJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChyZW1vdGVQcm9taXNlcyk7XG5cbiAgICAgICAgLy8gTWVyZ2UgcmVtb3RlIGFjdGl2aXR5IGRhdGFcbiAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVtb3RlUmVzdWx0cykge1xuICAgICAgICAgIGlmIChyZXN1bHQ/LmFjdGl2aXR5KSB7XG4gICAgICAgICAgICAvLyBNZXJnZSByZW1vdGUgYWN0aXZpdHkgZGF0YVxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihhY3Rpdml0eVN0YXR1cywgcmVzdWx0LmFjdGl2aXR5KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmVzLmpzb24oYWN0aXZpdHlTdGF0dXMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYWN0aXZpdHkgc3RhdHVzOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IGFjdGl2aXR5IHN0YXR1cycgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBHZXQgYWN0aXZpdHkgc3RhdHVzIGZvciBhIHNwZWNpZmljIHNlc3Npb25cbiAgcm91dGVyLmdldCgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvYWN0aXZpdHknLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBzZXNzaW9uSWQgPSByZXEucGFyYW1zLnNlc3Npb25JZDtcblxuICAgIHRyeSB7XG4gICAgICAvLyBJZiBpbiBIUSBtb2RlLCBjaGVjayBpZiB0aGlzIGlzIGEgcmVtb3RlIHNlc3Npb25cbiAgICAgIGlmIChpc0hRTW9kZSAmJiByZW1vdGVSZWdpc3RyeSkge1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuICAgICAgICBpZiAocmVtb3RlKSB7XG4gICAgICAgICAgLy8gRm9yd2FyZCB0byByZW1vdGUgc2VydmVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7cmVtb3RlLnVybH0vYXBpL3Nlc3Npb25zLyR7c2Vzc2lvbklkfS9hY3Rpdml0eWAsIHtcbiAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXMuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBnZXQgYWN0aXZpdHkgZnJvbSByZW1vdGUgJHtyZW1vdGUubmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gcmVhY2ggcmVtb3RlIHNlcnZlcicgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIExvY2FsIHNlc3Npb24gaGFuZGxpbmdcbiAgICAgIGNvbnN0IGFjdGl2aXR5U3RhdHVzID0gYWN0aXZpdHlNb25pdG9yLmdldFNlc3Npb25BY3Rpdml0eVN0YXR1cyhzZXNzaW9uSWQpO1xuICAgICAgaWYgKCFhY3Rpdml0eVN0YXR1cykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cbiAgICAgIHJlcy5qc29uKGFjdGl2aXR5U3RhdHVzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKGBlcnJvciBnZXR0aW5nIGFjdGl2aXR5IHN0YXR1cyBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06YCwgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBnZXQgYWN0aXZpdHkgc3RhdHVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBnaXQgc3RhdHVzIGZvciBhIHNwZWNpZmljIHNlc3Npb25cbiAgcm91dGVyLmdldCgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvZ2l0LXN0YXR1cycsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcS5wYXJhbXMuc2Vzc2lvbklkO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIGluIEhRIG1vZGUsIGNoZWNrIGlmIHRoaXMgaXMgYSByZW1vdGUgc2Vzc2lvblxuICAgICAgaWYgKGlzSFFNb2RlICYmIHJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZVJlZ2lzdHJ5LmdldFJlbW90ZUJ5U2Vzc2lvbklkKHNlc3Npb25JZCk7XG4gICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAvLyBGb3J3YXJkIHRvIHJlbW90ZSBzZXJ2ZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnMvJHtzZXNzaW9uSWR9L2dpdC1zdGF0dXNgLCB7XG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKHJlc3BvbnNlLnN0YXR1cykuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzLmpzb24oYXdhaXQgcmVzcG9uc2UuanNvbigpKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gZ2V0IGdpdCBzdGF0dXMgZnJvbSByZW1vdGUgJHtyZW1vdGUubmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gcmVhY2ggcmVtb3RlIHNlcnZlcicgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIExvY2FsIHNlc3Npb24gaGFuZGxpbmdcbiAgICAgIGNvbnN0IHNlc3Npb24gPSBwdHlNYW5hZ2VyLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcbiAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gR2V0IGRldGFpbGVkIGdpdCBzdGF0dXMgZm9yIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcnlcbiAgICAgIGNvbnN0IGdpdFN0YXR1cyA9IGF3YWl0IGdldERldGFpbGVkR2l0U3RhdHVzKHNlc3Npb24ud29ya2luZ0Rpcik7XG5cbiAgICAgIHJlcy5qc29uKGdpdFN0YXR1cyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgZXJyb3IgZ2V0dGluZyBnaXQgc3RhdHVzIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTpgLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCBnaXQgc3RhdHVzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBzaW5nbGUgc2Vzc2lvbiBpbmZvXG4gIHJvdXRlci5nZXQoJy9zZXNzaW9ucy86c2Vzc2lvbklkJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG4gICAgbG9nZ2VyLmRlYnVnKGBnZXR0aW5nIGluZm8gZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIC8vIEZvcndhcmQgdG8gcmVtb3RlIHNlcnZlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9zZXNzaW9ucy8ke3Nlc3Npb25JZH1gLCB7XG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKHJlc3BvbnNlLnN0YXR1cykuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzLmpzb24oYXdhaXQgcmVzcG9uc2UuanNvbigpKTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gZ2V0IHNlc3Npb24gaW5mbyBmcm9tIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9jYWwgc2Vzc2lvbiBoYW5kbGluZ1xuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdTZXNzaW9uIG5vdCBmb3VuZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHNlc3Npb24gZG9lc24ndCBoYXZlIEdpdCBpbmZvLCB0cnkgdG8gZGV0ZWN0IGl0XG4gICAgICBpZiAoIXNlc3Npb24uZ2l0UmVwb1BhdGggJiYgc2Vzc2lvbi53b3JraW5nRGlyKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZ2l0SW5mbyA9IGF3YWl0IGRldGVjdEdpdEluZm8oc2Vzc2lvbi53b3JraW5nRGlyKTtcbiAgICAgICAgICAvLyBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgLy8gICBgW0dFVCAvc2Vzc2lvbnMvOmlkXSBEZXRlY3RlZCBHaXQgaW5mbyBmb3Igc2Vzc2lvbiAke3Nlc3Npb24uaWR9OiByZXBvPSR7Z2l0SW5mby5naXRSZXBvUGF0aH0sIGJyYW5jaD0ke2dpdEluZm8uZ2l0QnJhbmNofWBcbiAgICAgICAgICAvLyApO1xuICAgICAgICAgIHJlcy5qc29uKHsgLi4uc2Vzc2lvbiwgLi4uZ2l0SW5mbyB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgLy8gSWYgR2l0IGRldGVjdGlvbiBmYWlscywganVzdCByZXR1cm4gc2Vzc2lvbiBhcy1pc1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgICAgIGBbR0VUIC9zZXNzaW9ucy86aWRdIENvdWxkIG5vdCBkZXRlY3QgR2l0IGluZm8gZm9yIHNlc3Npb24gJHtzZXNzaW9uLmlkfTogJHtlcnJvcn1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXMuanNvbihzZXNzaW9uKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdlcnJvciBnZXR0aW5nIHNlc3Npb24gaW5mbzonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCBzZXNzaW9uIGluZm8nIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gS2lsbCBzZXNzaW9uIChqdXN0IGtpbGwgdGhlIHByb2Nlc3MpXG4gIHJvdXRlci5kZWxldGUoJy9zZXNzaW9ucy86c2Vzc2lvbklkJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG4gICAgbG9nZ2VyLmRlYnVnKGBraWxsaW5nIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIC8vIEZvcndhcmQga2lsbCByZXF1ZXN0IHRvIHJlbW90ZSBzZXJ2ZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnMvJHtzZXNzaW9uSWR9YCwge1xuICAgICAgICAgICAgICBtZXRob2Q6IEh0dHBNZXRob2QuREVMRVRFLFxuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3JlbW90ZS50b2tlbn1gLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoMTAwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlbW90ZSBraWxsZWQgdGhlIHNlc3Npb24sIG5vdyB1cGRhdGUgb3VyIHJlZ2lzdHJ5XG4gICAgICAgICAgICByZW1vdGVSZWdpc3RyeS5yZW1vdmVTZXNzaW9uRnJvbVJlbW90ZShzZXNzaW9uSWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYHJlbW90ZSBzZXNzaW9uICR7c2Vzc2lvbklkfSBraWxsZWQgb24gJHtyZW1vdGUubmFtZX1gKSk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXMuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBraWxsIHNlc3Npb24gb24gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlYWNoIHJlbW90ZSBzZXJ2ZXInIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBMb2NhbCBzZXNzaW9uIGhhbmRsaW5nIC0ganVzdCBraWxsIGl0LCBubyByZWdpc3RyeSB1cGRhdGVzIG5lZWRlZFxuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdTZXNzaW9uIG5vdCBmb3VuZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHNlc3Npb24gaXMgYWxyZWFkeSBleGl0ZWQsIGNsZWFuIGl0IHVwIGluc3RlYWQgb2YgdHJ5aW5nIHRvIGtpbGwgaXRcbiAgICAgIGlmIChzZXNzaW9uLnN0YXR1cyA9PT0gJ2V4aXRlZCcpIHtcbiAgICAgICAgcHR5TWFuYWdlci5jbGVhbnVwU2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgbG9jYWwgc2Vzc2lvbiAke3Nlc3Npb25JZH0gY2xlYW5lZCB1cGApKTtcbiAgICAgICAgcmVzLmpzb24oeyBzdWNjZXNzOiB0cnVlLCBtZXNzYWdlOiAnU2Vzc2lvbiBjbGVhbmVkIHVwJyB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSB0bXV4IGF0dGFjaG1lbnQgYmVmb3JlIGtpbGxpbmdcbiAgICAgICAgY29uc3QgaXNUbXV4QXR0YWNobWVudCA9XG4gICAgICAgICAgc2Vzc2lvbi5uYW1lPy5zdGFydHNXaXRoKCd0bXV4OicpIHx8IHNlc3Npb24uY29tbWFuZD8uaW5jbHVkZXMoJ3RtdXggYXR0YWNoJyk7XG5cbiAgICAgICAgYXdhaXQgcHR5TWFuYWdlci5raWxsU2Vzc2lvbihzZXNzaW9uSWQsICdTSUdURVJNJyk7XG5cbiAgICAgICAgaWYgKGlzVG11eEF0dGFjaG1lbnQpIHtcbiAgICAgICAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgbG9jYWwgc2Vzc2lvbiAke3Nlc3Npb25JZH0gZGV0YWNoZWQgZnJvbSB0bXV4YCkpO1xuICAgICAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ0RldGFjaGVkIGZyb20gdG11eCBzZXNzaW9uJyB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgbG9jYWwgc2Vzc2lvbiAke3Nlc3Npb25JZH0ga2lsbGVkYCkpO1xuICAgICAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ1Nlc3Npb24ga2lsbGVkJyB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGtpbGxpbmcgc2Vzc2lvbjonLCBlcnJvcik7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQdHlFcnJvcikge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGtpbGwgc2Vzc2lvbicsIGRldGFpbHM6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGtpbGwgc2Vzc2lvbicgfSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBDbGVhbnVwIHNlc3Npb24gZmlsZXNcbiAgcm91dGVyLmRlbGV0ZSgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvY2xlYW51cCcsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcS5wYXJhbXMuc2Vzc2lvbklkO1xuICAgIGxvZ2dlci5kZWJ1ZyhgY2xlYW5pbmcgdXAgc2Vzc2lvbiAke3Nlc3Npb25JZH0gZmlsZXNgKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBJZiBpbiBIUSBtb2RlLCBjaGVjayBpZiB0aGlzIGlzIGEgcmVtb3RlIHNlc3Npb25cbiAgICAgIGlmIChpc0hRTW9kZSAmJiByZW1vdGVSZWdpc3RyeSkge1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuICAgICAgICBpZiAocmVtb3RlKSB7XG4gICAgICAgICAgLy8gRm9yd2FyZCBjbGVhbnVwIHJlcXVlc3QgdG8gcmVtb3RlIHNlcnZlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9zZXNzaW9ucy8ke3Nlc3Npb25JZH0vY2xlYW51cGAsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiBIdHRwTWV0aG9kLkRFTEVURSxcbiAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKHJlc3BvbnNlLnN0YXR1cykuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdGUgY2xlYW5lZCB1cCB0aGUgc2Vzc2lvbiwgbm93IHVwZGF0ZSBvdXIgcmVnaXN0cnlcbiAgICAgICAgICAgIHJlbW90ZVJlZ2lzdHJ5LnJlbW92ZVNlc3Npb25Gcm9tUmVtb3RlKHNlc3Npb25JZCk7XG4gICAgICAgICAgICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgcmVtb3RlIHNlc3Npb24gJHtzZXNzaW9uSWR9IGNsZWFuZWQgdXAgb24gJHtyZW1vdGUubmFtZX1gKSk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXMuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBjbGVhbnVwIHNlc3Npb24gb24gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlYWNoIHJlbW90ZSBzZXJ2ZXInIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBMb2NhbCBzZXNzaW9uIGhhbmRsaW5nIC0ganVzdCBjbGVhbnVwLCBubyByZWdpc3RyeSB1cGRhdGVzIG5lZWRlZFxuICAgICAgcHR5TWFuYWdlci5jbGVhbnVwU2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYGxvY2FsIHNlc3Npb24gJHtzZXNzaW9uSWR9IGNsZWFuZWQgdXBgKSk7XG5cbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ1Nlc3Npb24gY2xlYW5lZCB1cCcgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignZXJyb3IgY2xlYW5pbmcgdXAgc2Vzc2lvbjonLCBlcnJvcik7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQdHlFcnJvcikge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGNsZWFudXAgc2Vzc2lvbicsIGRldGFpbHM6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGNsZWFudXAgc2Vzc2lvbicgfSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICAvLyBDbGVhbnVwIGFsbCBleGl0ZWQgc2Vzc2lvbnMgKGxvY2FsIGFuZCByZW1vdGUpXG4gIHJvdXRlci5wb3N0KCcvY2xlYW51cC1leGl0ZWQnLCBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ibHVlKCdjbGVhbmluZyB1cCBhbGwgZXhpdGVkIHNlc3Npb25zJykpO1xuICAgIHRyeSB7XG4gICAgICAvLyBDbGVhbiB1cCBsb2NhbCBzZXNzaW9uc1xuICAgICAgY29uc3QgbG9jYWxDbGVhbmVkU2Vzc2lvbnMgPSBwdHlNYW5hZ2VyLmNsZWFudXBFeGl0ZWRTZXNzaW9ucygpO1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgY2xlYW5lZCB1cCAke2xvY2FsQ2xlYW5lZFNlc3Npb25zLmxlbmd0aH0gbG9jYWwgZXhpdGVkIHNlc3Npb25zYCkpO1xuXG4gICAgICAvLyBSZW1vdmUgY2xlYW5lZCBsb2NhbCBzZXNzaW9ucyBmcm9tIHJlbW90ZSByZWdpc3RyeSBpZiBpbiBIUSBtb2RlXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgZm9yIChjb25zdCBzZXNzaW9uSWQgb2YgbG9jYWxDbGVhbmVkU2Vzc2lvbnMpIHtcbiAgICAgICAgICByZW1vdGVSZWdpc3RyeS5yZW1vdmVTZXNzaW9uRnJvbVJlbW90ZShzZXNzaW9uSWQpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxldCB0b3RhbENsZWFuZWQgPSBsb2NhbENsZWFuZWRTZXNzaW9ucy5sZW5ndGg7XG4gICAgICBjb25zdCByZW1vdGVSZXN1bHRzOiBBcnJheTx7IHJlbW90ZU5hbWU6IHN0cmluZzsgY2xlYW5lZDogbnVtYmVyOyBlcnJvcj86IHN0cmluZyB9PiA9IFtdO1xuXG4gICAgICAvLyBJZiBpbiBIUSBtb2RlLCBjbGVhbiB1cCBzZXNzaW9ucyBvbiBhbGwgcmVtb3Rlc1xuICAgICAgaWYgKGlzSFFNb2RlICYmIHJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICAgIGNvbnN0IGFsbFJlbW90ZXMgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVzKCk7XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgb24gZWFjaCByZW1vdGUgaW4gcGFyYWxsZWxcbiAgICAgICAgY29uc3QgcmVtb3RlQ2xlYW51cFByb21pc2VzID0gYWxsUmVtb3Rlcy5tYXAoYXN5bmMgKHJlbW90ZSkgPT4ge1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9jbGVhbnVwLWV4aXRlZGAsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiBIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDEwMDAwKSwgLy8gMTAgc2Vjb25kIHRpbWVvdXRcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gKGF3YWl0IHJlc3BvbnNlLmpzb24oKSkgYXMgeyBjbGVhbmVkU2Vzc2lvbnM6IHN0cmluZ1tdIH07XG4gICAgICAgICAgICAgIGNvbnN0IGNsZWFuZWRTZXNzaW9uSWRzID0gcmVzdWx0LmNsZWFuZWRTZXNzaW9ucyB8fCBbXTtcbiAgICAgICAgICAgICAgY29uc3QgY2xlYW5lZENvdW50ID0gY2xlYW5lZFNlc3Npb25JZHMubGVuZ3RoO1xuICAgICAgICAgICAgICB0b3RhbENsZWFuZWQgKz0gY2xlYW5lZENvdW50O1xuXG4gICAgICAgICAgICAgIC8vIFJlbW92ZSBjbGVhbmVkIHJlbW90ZSBzZXNzaW9ucyBmcm9tIHJlZ2lzdHJ5XG4gICAgICAgICAgICAgIGZvciAoY29uc3Qgc2Vzc2lvbklkIG9mIGNsZWFuZWRTZXNzaW9uSWRzKSB7XG4gICAgICAgICAgICAgICAgcmVtb3RlUmVnaXN0cnkucmVtb3ZlU2Vzc2lvbkZyb21SZW1vdGUoc2Vzc2lvbklkKTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHJlbW90ZVJlc3VsdHMucHVzaCh7IHJlbW90ZU5hbWU6IHJlbW90ZS5uYW1lLCBjbGVhbmVkOiBjbGVhbmVkQ291bnQgfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIGNsZWFudXAgc2Vzc2lvbnMgb24gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJlbW90ZVJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgIHJlbW90ZU5hbWU6IHJlbW90ZS5uYW1lLFxuICAgICAgICAgICAgICBjbGVhbmVkOiAwLFxuICAgICAgICAgICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHJlbW90ZUNsZWFudXBQcm9taXNlcyk7XG4gICAgICB9XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogYCR7dG90YWxDbGVhbmVkfSBleGl0ZWQgc2Vzc2lvbnMgY2xlYW5lZCB1cCBhY3Jvc3MgYWxsIHNlcnZlcnNgLFxuICAgICAgICBsb2NhbENsZWFuZWQ6IGxvY2FsQ2xlYW5lZFNlc3Npb25zLmxlbmd0aCxcbiAgICAgICAgcmVtb3RlUmVzdWx0cyxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGNsZWFuaW5nIHVwIGV4aXRlZCBzZXNzaW9uczonLCBlcnJvcik7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQdHlFcnJvcikge1xuICAgICAgICByZXNcbiAgICAgICAgICAuc3RhdHVzKDUwMClcbiAgICAgICAgICAuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGNsZWFudXAgZXhpdGVkIHNlc3Npb25zJywgZGV0YWlsczogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gY2xlYW51cCBleGl0ZWQgc2Vzc2lvbnMnIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gR2V0IHNlc3Npb24gcGxhaW4gdGV4dFxuICByb3V0ZXIuZ2V0KCcvc2Vzc2lvbnMvOnNlc3Npb25JZC90ZXh0JywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG4gICAgY29uc3QgaW5jbHVkZVN0eWxlcyA9IHJlcS5xdWVyeS5zdHlsZXMgIT09IHVuZGVmaW5lZDtcbiAgICBsb2dnZXIuZGVidWcoYGdldHRpbmcgcGxhaW4gdGV4dCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH0sIHN0eWxlcz0ke2luY2x1ZGVTdHlsZXN9YCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIC8vIEZvcndhcmQgdGV4dCByZXF1ZXN0IHRvIHJlbW90ZSBzZXJ2ZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnMvJHtzZXNzaW9uSWR9L3RleHRgKTtcbiAgICAgICAgICAgIGlmIChpbmNsdWRlU3R5bGVzKSB7XG4gICAgICAgICAgICAgIHVybC5zZWFyY2hQYXJhbXMuc2V0KCdzdHlsZXMnLCAnJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLnRvU3RyaW5nKCksIHtcbiAgICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZvcndhcmQgdGhlIHRleHQgcmVzcG9uc2VcbiAgICAgICAgICAgIGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcy5zZW5kKHRleHQpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBnZXQgdGV4dCBmcm9tIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9jYWwgc2Vzc2lvbiBoYW5kbGluZ1xuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnU2Vzc2lvbiBub3QgZm91bmQnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBHZXQgdGVybWluYWwgYnVmZmVyIHNuYXBzaG90XG4gICAgICBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHRlcm1pbmFsTWFuYWdlci5nZXRCdWZmZXJTbmFwc2hvdChzZXNzaW9uSWQpO1xuXG4gICAgICAvLyBVc2Ugc2hhcmVkIGZvcm1hdHRlciB0byBjb252ZXJ0IGNlbGxzIHRvIHRleHRcbiAgICAgIGNvbnN0IHBsYWluVGV4dCA9IGNlbGxzVG9UZXh0KHNuYXBzaG90LmNlbGxzLCBpbmNsdWRlU3R5bGVzKTtcblxuICAgICAgLy8gU2VuZCBhcyBwbGFpbiB0ZXh0XG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbicpO1xuICAgICAgcmVzLnNlbmQocGxhaW5UZXh0KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdlcnJvciBnZXR0aW5nIHBsYWluIHRleHQ6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBnZXQgdGVybWluYWwgdGV4dCcgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBHZXQgc2Vzc2lvbiBidWZmZXJcbiAgcm91dGVyLmdldCgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvYnVmZmVyJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG5cbiAgICBsb2dnZXIuZGVidWcoYGNsaWVudCByZXF1ZXN0aW5nIGJ1ZmZlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBJZiBpbiBIUSBtb2RlLCBjaGVjayBpZiB0aGlzIGlzIGEgcmVtb3RlIHNlc3Npb25cbiAgICAgIGlmIChpc0hRTW9kZSAmJiByZW1vdGVSZWdpc3RyeSkge1xuICAgICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuICAgICAgICBpZiAocmVtb3RlKSB7XG4gICAgICAgICAgLy8gRm9yd2FyZCBidWZmZXIgcmVxdWVzdCB0byByZW1vdGUgc2VydmVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7cmVtb3RlLnVybH0vYXBpL3Nlc3Npb25zLyR7c2Vzc2lvbklkfS9idWZmZXJgLCB7XG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKHJlc3BvbnNlLnN0YXR1cykuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGb3J3YXJkIHRoZSBiaW5hcnkgYnVmZmVyXG4gICAgICAgICAgICBjb25zdCBidWZmZXIgPSBhd2FpdCByZXNwb25zZS5hcnJheUJ1ZmZlcigpO1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQ29udGVudC1UeXBlJywgJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbScpO1xuICAgICAgICAgICAgcmV0dXJuIHJlcy5zZW5kKEJ1ZmZlci5mcm9tKGJ1ZmZlcikpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBnZXQgYnVmZmVyIGZyb20gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlYWNoIHJlbW90ZSBzZXJ2ZXInIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBMb2NhbCBzZXNzaW9uIGhhbmRsaW5nXG4gICAgICBjb25zdCBzZXNzaW9uID0gcHR5TWFuYWdlci5nZXRTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgICBpZiAoIXNlc3Npb24pIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBzZXNzaW9uICR7c2Vzc2lvbklkfSBub3QgZm91bmRgKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdTZXNzaW9uIG5vdCBmb3VuZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdldCB0ZXJtaW5hbCBidWZmZXIgc25hcHNob3RcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGVybWluYWxNYW5hZ2VyLmdldEJ1ZmZlclNuYXBzaG90KHNlc3Npb25JZCk7XG5cbiAgICAgIC8vIEVuY29kZSBhcyBiaW5hcnkgYnVmZmVyXG4gICAgICBjb25zdCBidWZmZXIgPSB0ZXJtaW5hbE1hbmFnZXIuZW5jb2RlU25hcHNob3Qoc25hcHNob3QpO1xuXG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBzZW5kaW5nIGJ1ZmZlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06ICR7YnVmZmVyLmxlbmd0aH0gYnl0ZXMsIGAgK1xuICAgICAgICAgIGBkaW1lbnNpb25zOiAke3NuYXBzaG90LmNvbHN9eCR7c25hcHNob3Qucm93c30sIGN1cnNvcjogKCR7c25hcHNob3QuY3Vyc29yWH0sJHtzbmFwc2hvdC5jdXJzb3JZfSlgXG4gICAgICApO1xuXG4gICAgICAvLyBTZW5kIGFzIGJpbmFyeSBkYXRhXG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJyk7XG4gICAgICByZXMuc2VuZChidWZmZXIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIGdldHRpbmcgYnVmZmVyOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IHRlcm1pbmFsIGJ1ZmZlcicgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBTdHJlYW0gc2Vzc2lvbiBvdXRwdXRcbiAgcm91dGVyLmdldCgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvc3RyZWFtJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuICAgIGxvZ2dlci5sb2coXG4gICAgICBjaGFsay5ibHVlKFxuICAgICAgICBgbmV3IFNTRSBjbGllbnQgY29ubmVjdGVkIHRvIHNlc3Npb24gJHtzZXNzaW9uSWR9IGZyb20gJHtyZXEuZ2V0KCdVc2VyLUFnZW50Jyk/LnN1YnN0cmluZygwLCA1MCkgfHwgJ3Vua25vd24nfWBcbiAgICAgIClcbiAgICApO1xuXG4gICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgaWYgKGlzSFFNb2RlICYmIHJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVCeVNlc3Npb25JZChzZXNzaW9uSWQpO1xuICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAvLyBQcm94eSBTU0Ugc3RyZWFtIGZyb20gcmVtb3RlIHNlcnZlclxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnMvJHtzZXNzaW9uSWR9L3N0cmVhbWAsIHtcbiAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3JlbW90ZS50b2tlbn1gLFxuICAgICAgICAgICAgICBBY2NlcHQ6ICd0ZXh0L2V2ZW50LXN0cmVhbScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgc2lnbmFsOiBjb250cm9sbGVyLnNpZ25hbCxcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgIHJldHVybiByZXMuc3RhdHVzKHJlc3BvbnNlLnN0YXR1cykuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIFNldCB1cCBTU0UgaGVhZGVyc1xuICAgICAgICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7XG4gICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcbiAgICAgICAgICAgICdDYWNoZS1Db250cm9sJzogJ25vLWNhY2hlJyxcbiAgICAgICAgICAgIENvbm5lY3Rpb246ICdrZWVwLWFsaXZlJyxcbiAgICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDYWNoZS1Db250cm9sJyxcbiAgICAgICAgICAgICdYLUFjY2VsLUJ1ZmZlcmluZyc6ICdubycsXG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICAvLyBQcm94eSB0aGUgc3RyZWFtXG4gICAgICAgICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuYm9keT8uZ2V0UmVhZGVyKCk7XG4gICAgICAgICAgaWYgKCFyZWFkZXIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcmVzcG9uc2UgYm9keScpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcbiAgICAgICAgICBjb25zdCBieXRlc1Byb3hpZWQgPSB7IGNvdW50OiAwIH07XG4gICAgICAgICAgY29uc3QgcHVtcCA9IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBkb25lLCB2YWx1ZSB9ID0gYXdhaXQgcmVhZGVyLnJlYWQoKTtcbiAgICAgICAgICAgICAgICBpZiAoZG9uZSkgYnJlYWs7XG4gICAgICAgICAgICAgICAgYnl0ZXNQcm94aWVkLmNvdW50ICs9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb25zdCBjaHVuayA9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcbiAgICAgICAgICAgICAgICByZXMud3JpdGUoY2h1bmspO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoYHN0cmVhbSBwcm94eSBlcnJvciBmb3IgcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgcHVtcCgpO1xuXG4gICAgICAgICAgLy8gQ2xlYW4gdXAgb24gZGlzY29ubmVjdFxuICAgICAgICAgIHJlcS5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgICAgICAgYFNTRSBjbGllbnQgZGlzY29ubmVjdGVkIGZyb20gcmVtb3RlIHNlc3Npb24gJHtzZXNzaW9uSWR9IChwcm94aWVkICR7Ynl0ZXNQcm94aWVkLmNvdW50fSBieXRlcylgXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb250cm9sbGVyLmFib3J0KCk7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKGBmYWlsZWQgdG8gc3RyZWFtIGZyb20gcmVtb3RlICR7cmVtb3RlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIExvY2FsIHNlc3Npb24gaGFuZGxpbmdcbiAgICBjb25zdCBzZXNzaW9uID0gcHR5TWFuYWdlci5nZXRTZXNzaW9uKHNlc3Npb25JZCk7XG4gICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBzZXNzaW9uUGF0aHMgPSBwdHlNYW5hZ2VyLmdldFNlc3Npb25QYXRocyhzZXNzaW9uSWQpO1xuICAgIGlmICghc2Vzc2lvblBhdGhzKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gcGF0aHMgbm90IGZvdW5kJyB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBzdHJlYW1QYXRoID0gc2Vzc2lvblBhdGhzLnN0ZG91dFBhdGg7XG4gICAgaWYgKCFzdHJlYW1QYXRoIHx8ICFmcy5leGlzdHNTeW5jKHN0cmVhbVBhdGgpKSB7XG4gICAgICBsb2dnZXIud2Fybihgc3RyZWFtIHBhdGggbm90IGZvdW5kIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdTZXNzaW9uIHN0cmVhbSBub3QgZm91bmQnIH0pO1xuICAgIH1cblxuICAgIC8vIFNldCB1cCBTU0UgaGVhZGVyc1xuICAgIHJlcy53cml0ZUhlYWQoMjAwLCB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJyxcbiAgICAgICdDYWNoZS1Db250cm9sJzogJ25vLWNhY2hlJyxcbiAgICAgIENvbm5lY3Rpb246ICdrZWVwLWFsaXZlJyxcbiAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDYWNoZS1Db250cm9sJyxcbiAgICAgICdYLUFjY2VsLUJ1ZmZlcmluZyc6ICdubycsIC8vIERpc2FibGUgTmdpbnggYnVmZmVyaW5nXG4gICAgICAnQ29udGVudC1FbmNvZGluZyc6ICdpZGVudGl0eScsIC8vIFByZXZlbnQgY29tcHJlc3Npb25cbiAgICB9KTtcblxuICAgIC8vIEZvcmNlIGhlYWRlcnMgdG8gYmUgc2VudCBpbW1lZGlhdGVseVxuICAgIHJlcy5mbHVzaEhlYWRlcnMoKTtcblxuICAgIC8vIFNlbmQgaW5pdGlhbCBjb25uZWN0aW9uIGV2ZW50XG4gICAgcmVzLndyaXRlKCc6b2tcXG5cXG4nKTtcbiAgICBpZiAocmVzLmZsdXNoKSByZXMuZmx1c2goKTtcblxuICAgIC8vIEFkZCBjbGllbnQgdG8gc3RyZWFtIHdhdGNoZXJcbiAgICBzdHJlYW1XYXRjaGVyLmFkZENsaWVudChzZXNzaW9uSWQsIHN0cmVhbVBhdGgsIHJlcyk7XG4gICAgbG9nZ2VyLmRlYnVnKGBTU0Ugc3RyZWFtIHNldHVwIGNvbXBsZXRlZCBpbiAke0RhdGUubm93KCkgLSBzdGFydFRpbWV9bXNgKTtcblxuICAgIC8vIFNlbmQgaGVhcnRiZWF0IGV2ZXJ5IDMwIHNlY29uZHMgdG8ga2VlcCBjb25uZWN0aW9uIGFsaXZlXG4gICAgY29uc3QgaGVhcnRiZWF0ID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgcmVzLndyaXRlKCc6aGVhcnRiZWF0XFxuXFxuJyk7XG4gICAgICBpZiAocmVzLmZsdXNoKSByZXMuZmx1c2goKTtcbiAgICB9LCAzMDAwMCk7XG5cbiAgICAvLyBUcmFjayBpZiBjbGVhbnVwIGhhcyBiZWVuIGNhbGxlZCB0byBhdm9pZCBkdXBsaWNhdGUgY2FsbHNcbiAgICBsZXQgY2xlYW5lZFVwID0gZmFsc2U7XG4gICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcbiAgICAgIGlmICghY2xlYW5lZFVwKSB7XG4gICAgICAgIGNsZWFuZWRVcCA9IHRydWU7XG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsueWVsbG93KGBTU0UgY2xpZW50IGRpc2Nvbm5lY3RlZCBmcm9tIHNlc3Npb24gJHtzZXNzaW9uSWR9YCkpO1xuICAgICAgICBzdHJlYW1XYXRjaGVyLnJlbW92ZUNsaWVudChzZXNzaW9uSWQsIHJlcyk7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwoaGVhcnRiZWF0KTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gQ2xlYW4gdXAgb24gZGlzY29ubmVjdCAtIGxpc3RlbiB0byBhbGwgcG9zc2libGUgZXZlbnRzXG4gICAgcmVxLm9uKCdjbG9zZScsIGNsZWFudXApO1xuICAgIHJlcS5vbignZXJyb3InLCAoZXJyKSA9PiB7XG4gICAgICBsb2dnZXIuZXJyb3IoYFNTRSBjbGllbnQgZXJyb3IgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OmAsIGVycik7XG4gICAgICBjbGVhbnVwKCk7XG4gICAgfSk7XG4gICAgcmVzLm9uKCdjbG9zZScsIGNsZWFudXApO1xuICAgIHJlcy5vbignZmluaXNoJywgY2xlYW51cCk7XG4gIH0pO1xuXG4gIC8vIFNlbmQgaW5wdXQgdG8gc2Vzc2lvblxuICByb3V0ZXIucG9zdCgnL3Nlc3Npb25zLzpzZXNzaW9uSWQvaW5wdXQnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBzZXNzaW9uSWQgPSByZXEucGFyYW1zLnNlc3Npb25JZDtcbiAgICBjb25zdCB7IHRleHQsIGtleSB9ID0gcmVxLmJvZHk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGF0IG9ubHkgb25lIG9mIHRleHQgb3Iga2V5IGlzIHByb3ZpZGVkXG4gICAgaWYgKCh0ZXh0ID09PSB1bmRlZmluZWQgJiYga2V5ID09PSB1bmRlZmluZWQpIHx8ICh0ZXh0ICE9PSB1bmRlZmluZWQgJiYga2V5ICE9PSB1bmRlZmluZWQpKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYGludmFsaWQgaW5wdXQgcmVxdWVzdCBmb3Igc2Vzc2lvbiAke3Nlc3Npb25JZH06IGJvdGggb3IgbmVpdGhlciB0ZXh0L2tleSBwcm92aWRlZGBcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ0VpdGhlciB0ZXh0IG9yIGtleSBtdXN0IGJlIHByb3ZpZGVkLCBidXQgbm90IGJvdGgnIH0pO1xuICAgIH1cblxuICAgIGlmICh0ZXh0ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHRleHQgIT09ICdzdHJpbmcnKSB7XG4gICAgICBsb2dnZXIud2FybihgaW52YWxpZCBpbnB1dCByZXF1ZXN0IGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTogdGV4dCBpcyBub3QgYSBzdHJpbmdgKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnVGV4dCBtdXN0IGJlIGEgc3RyaW5nJyB9KTtcbiAgICB9XG5cbiAgICBpZiAoa2V5ICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIGtleSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBpbnZhbGlkIGlucHV0IHJlcXVlc3QgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OiBrZXkgaXMgbm90IGEgc3RyaW5nYCk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ0tleSBtdXN0IGJlIGEgc3RyaW5nJyB9KTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIC8vIEZvcndhcmQgaW5wdXQgdG8gcmVtb3RlIHNlcnZlclxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9zZXNzaW9ucy8ke3Nlc3Npb25JZH0vaW5wdXRgLCB7XG4gICAgICAgICAgICAgIG1ldGhvZDogSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHJlcS5ib2R5KSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXMuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byBzZW5kIGlucHV0IHRvIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9jYWwgc2Vzc2lvbiBoYW5kbGluZ1xuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgc2Vzc2lvbiAke3Nlc3Npb25JZH0gbm90IGZvdW5kIGZvciBpbnB1dGApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNlc3Npb24uc3RhdHVzICE9PSAncnVubmluZycpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBzZXNzaW9uICR7c2Vzc2lvbklkfSBpcyBub3QgcnVubmluZyAoc3RhdHVzOiAke3Nlc3Npb24uc3RhdHVzfSlgKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHsgZXJyb3I6ICdTZXNzaW9uIGlzIG5vdCBydW5uaW5nJyB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW5wdXREYXRhID0gdGV4dCAhPT0gdW5kZWZpbmVkID8geyB0ZXh0IH0gOiB7IGtleSB9O1xuICAgICAgbG9nZ2VyLmRlYnVnKGBzZW5kaW5nIGlucHV0IHRvIHNlc3Npb24gJHtzZXNzaW9uSWR9OiAke0pTT04uc3RyaW5naWZ5KGlucHV0RGF0YSl9YCk7XG5cbiAgICAgIHB0eU1hbmFnZXIuc2VuZElucHV0KHNlc3Npb25JZCwgaW5wdXREYXRhKTtcbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdlcnJvciBzZW5kaW5nIGlucHV0OicsIGVycm9yKTtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFB0eUVycm9yKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gc2VuZCBpbnB1dCcsIGRldGFpbHM6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHNlbmQgaW5wdXQnIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gUmVzaXplIHNlc3Npb25cbiAgcm91dGVyLnBvc3QoJy9zZXNzaW9ucy86c2Vzc2lvbklkL3Jlc2l6ZScsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHNlc3Npb25JZCA9IHJlcS5wYXJhbXMuc2Vzc2lvbklkO1xuICAgIGNvbnN0IHsgY29scywgcm93cyB9ID0gcmVxLmJvZHk7XG5cbiAgICBpZiAodHlwZW9mIGNvbHMgIT09ICdudW1iZXInIHx8IHR5cGVvZiByb3dzICE9PSAnbnVtYmVyJykge1xuICAgICAgbG9nZ2VyLndhcm4oYGludmFsaWQgcmVzaXplIHJlcXVlc3QgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OiBjb2xzL3Jvd3Mgbm90IG51bWJlcnNgKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnQ29scyBhbmQgcm93cyBtdXN0IGJlIG51bWJlcnMnIH0pO1xuICAgIH1cblxuICAgIGlmIChjb2xzIDwgMSB8fCByb3dzIDwgMSB8fCBjb2xzID4gMTAwMCB8fCByb3dzID4gMTAwMCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBpbnZhbGlkIHJlc2l6ZSByZXF1ZXN0IGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfTogY29scz0ke2NvbHN9LCByb3dzPSR7cm93c30gb3V0IG9mIHJhbmdlYFxuICAgICAgKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnQ29scyBhbmQgcm93cyBtdXN0IGJlIGJldHdlZW4gMSBhbmQgMTAwMCcgfSk7XG4gICAgfVxuXG4gICAgLy8gTG9nIHJlc2l6ZSByZXF1ZXN0cyBhdCBkZWJ1ZyBsZXZlbFxuICAgIGxvZ2dlci5kZWJ1ZyhgUmVzaXppbmcgc2Vzc2lvbiAke3Nlc3Npb25JZH0gdG8gJHtjb2xzfXgke3Jvd3N9YCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gSWYgaW4gSFEgbW9kZSwgY2hlY2sgaWYgdGhpcyBpcyBhIHJlbW90ZSBzZXNzaW9uXG4gICAgICBpZiAoaXNIUU1vZGUgJiYgcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIC8vIEZvcndhcmQgcmVzaXplIHRvIHJlbW90ZSBzZXJ2ZXJcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnMvJHtzZXNzaW9uSWR9L3Jlc2l6ZWAsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiBIdHRwTWV0aG9kLlBPU1QsXG4gICAgICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtyZW1vdGUudG9rZW59YCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBjb2xzLCByb3dzIH0pLFxuICAgICAgICAgICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoNTAwMCksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyhyZXNwb25zZS5zdGF0dXMpLmpzb24oYXdhaXQgcmVzcG9uc2UuanNvbigpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJlcy5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIHJlc2l6ZSBzZXNzaW9uIG9uIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9jYWwgc2Vzc2lvbiBoYW5kbGluZ1xuICAgICAgY29uc3Qgc2Vzc2lvbiA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgaWYgKCFzZXNzaW9uKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKGBzZXNzaW9uICR7c2Vzc2lvbklkfSBub3QgZm91bmQgZm9yIHJlc2l6ZWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgaWYgKHNlc3Npb24uc3RhdHVzICE9PSAncnVubmluZycpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYHNlc3Npb24gJHtzZXNzaW9uSWR9IGlzIG5vdCBydW5uaW5nIChzdGF0dXM6ICR7c2Vzc2lvbi5zdGF0dXN9KWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gaXMgbm90IHJ1bm5pbmcnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXNpemUgdGhlIHNlc3Npb25cbiAgICAgIHB0eU1hbmFnZXIucmVzaXplU2Vzc2lvbihzZXNzaW9uSWQsIGNvbHMsIHJvd3MpO1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgc2Vzc2lvbiAke3Nlc3Npb25JZH0gcmVzaXplZCB0byAke2NvbHN9eCR7cm93c31gKSk7XG5cbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgY29scywgcm93cyB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdlcnJvciByZXNpemluZyBzZXNzaW9uIHZpYSBQVFkgc2VydmljZTonLCBlcnJvcik7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQdHlFcnJvcikge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlc2l6ZSBzZXNzaW9uJywgZGV0YWlsczogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gcmVzaXplIHNlc3Npb24nIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gVXBkYXRlIHNlc3Npb24gbmFtZVxuICByb3V0ZXIucGF0Y2goJy9zZXNzaW9ucy86c2Vzc2lvbklkJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gcmVxLnBhcmFtcy5zZXNzaW9uSWQ7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYFtQQVRDSF0gUmVjZWl2ZWQgcmVuYW1lIHJlcXVlc3QgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCkpO1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1BBVENIXSBSZXF1ZXN0IGJvZHk6YCwgcmVxLmJvZHkpO1xuICAgIGxvZ2dlci5kZWJ1ZyhgW1BBVENIXSBSZXF1ZXN0IGhlYWRlcnM6YCwgcmVxLmhlYWRlcnMpO1xuXG4gICAgY29uc3QgeyBuYW1lIH0gPSByZXEuYm9keTtcblxuICAgIGlmICh0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycgfHwgbmFtZS50cmltKCkgPT09ICcnKSB7XG4gICAgICBsb2dnZXIud2FybihgW1BBVENIXSBJbnZhbGlkIG5hbWUgcHJvdmlkZWQ6ICR7SlNPTi5zdHJpbmdpZnkobmFtZSl9YCk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ05hbWUgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcnIH0pO1xuICAgIH1cblxuICAgIGxvZ2dlci5sb2coY2hhbGsuYmx1ZShgW1BBVENIXSBVcGRhdGluZyBzZXNzaW9uICR7c2Vzc2lvbklkfSBuYW1lIHRvOiAke25hbWV9YCkpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIElmIGluIEhRIG1vZGUsIGNoZWNrIGlmIHRoaXMgaXMgYSByZW1vdGUgc2Vzc2lvblxuICAgICAgaWYgKGlzSFFNb2RlICYmIHJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZVJlZ2lzdHJ5LmdldFJlbW90ZUJ5U2Vzc2lvbklkKHNlc3Npb25JZCk7XG4gICAgICAgIGlmIChyZW1vdGUpIHtcbiAgICAgICAgICAvLyBGb3J3YXJkIHVwZGF0ZSB0byByZW1vdGUgc2VydmVyXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7cmVtb3RlLnVybH0vYXBpL3Nlc3Npb25zLyR7c2Vzc2lvbklkfWAsIHtcbiAgICAgICAgICAgICAgbWV0aG9kOiBIdHRwTWV0aG9kLlBBVENILFxuICAgICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbmFtZSB9KSxcbiAgICAgICAgICAgICAgc2lnbmFsOiBBYm9ydFNpZ25hbC50aW1lb3V0KDUwMDApLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMocmVzcG9uc2Uuc3RhdHVzKS5qc29uKGF3YWl0IHJlc3BvbnNlLmpzb24oKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXMuanNvbihhd2FpdCByZXNwb25zZS5qc29uKCkpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBsb2dnZXIuZXJyb3IoYGZhaWxlZCB0byB1cGRhdGUgc2Vzc2lvbiBuYW1lIG9uIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFjaCByZW1vdGUgc2VydmVyJyB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gTG9jYWwgc2Vzc2lvbiBoYW5kbGluZ1xuICAgICAgbG9nZ2VyLmRlYnVnKGBbUEFUQ0hdIEhhbmRsaW5nIGxvY2FsIHNlc3Npb24gdXBkYXRlYCk7XG5cbiAgICAgIGNvbnN0IHNlc3Npb24gPSBwdHlNYW5hZ2VyLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcbiAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICBsb2dnZXIud2FybihgW1BBVENIXSBTZXNzaW9uICR7c2Vzc2lvbklkfSBub3QgZm91bmQgZm9yIG5hbWUgdXBkYXRlYCk7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnU2Vzc2lvbiBub3QgZm91bmQnIH0pO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZGVidWcoYFtQQVRDSF0gRm91bmQgc2Vzc2lvbjogJHtKU09OLnN0cmluZ2lmeShzZXNzaW9uKX1gKTtcblxuICAgICAgLy8gVXBkYXRlIHRoZSBzZXNzaW9uIG5hbWVcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgW1BBVENIXSBDYWxsaW5nIHB0eU1hbmFnZXIudXBkYXRlU2Vzc2lvbk5hbWUoJHtzZXNzaW9uSWR9LCAke25hbWV9KWApO1xuICAgICAgY29uc3QgdW5pcXVlTmFtZSA9IHB0eU1hbmFnZXIudXBkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbklkLCBuYW1lKTtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYFtQQVRDSF0gU2Vzc2lvbiAke3Nlc3Npb25JZH0gbmFtZSB1cGRhdGVkIHRvOiAke3VuaXF1ZU5hbWV9YCkpO1xuXG4gICAgICByZXMuanNvbih7IHN1Y2Nlc3M6IHRydWUsIG5hbWU6IHVuaXF1ZU5hbWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignZXJyb3IgdXBkYXRpbmcgc2Vzc2lvbiBuYW1lOicsIGVycm9yKTtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFB0eUVycm9yKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gdXBkYXRlIHNlc3Npb24gbmFtZScsIGRldGFpbHM6IGVycm9yLm1lc3NhZ2UgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHVwZGF0ZSBzZXNzaW9uIG5hbWUnIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gUmVzZXQgdGVybWluYWwgc2l6ZSAoZm9yIGV4dGVybmFsIHRlcm1pbmFscylcbiAgcm91dGVyLnBvc3QoJy9zZXNzaW9ucy86c2Vzc2lvbklkL3Jlc2V0LXNpemUnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICBjb25zdCB7IHNlc3Npb25JZCB9ID0gcmVxLnBhcmFtcztcblxuICAgIHRyeSB7XG4gICAgICAvLyBJbiBIUSBtb2RlLCBmb3J3YXJkIHRvIHJlbW90ZSBpZiBzZXNzaW9uIGJlbG9uZ3MgdG8gb25lXG4gICAgICBpZiAocmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgcmVtb3RlID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlQnlTZXNzaW9uSWQoc2Vzc2lvbklkKTtcbiAgICAgICAgaWYgKHJlbW90ZSkge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgZm9yd2FyZGluZyByZXNldC1zaXplIHRvIHJlbW90ZSAke3JlbW90ZS5pZH1gKTtcbiAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3JlbW90ZS51cmx9L2FwaS9zZXNzaW9ucy8ke3Nlc3Npb25JZH0vcmVzZXQtc2l6ZWAsIHtcbiAgICAgICAgICAgIG1ldGhvZDogSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgY29uc3QgZXJyb3IgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyhyZXNwb25zZS5zdGF0dXMpLmpzb24oZXJyb3IpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICByZXR1cm4gcmVzLmpzb24ocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2dnZXIubG9nKGNoYWxrLmN5YW4oYHJlc2V0dGluZyB0ZXJtaW5hbCBzaXplIGZvciBzZXNzaW9uICR7c2Vzc2lvbklkfWApKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgc2Vzc2lvbiBleGlzdHNcbiAgICAgIGNvbnN0IHNlc3Npb24gPSBwdHlNYW5hZ2VyLmdldFNlc3Npb24oc2Vzc2lvbklkKTtcbiAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYHNlc3Npb24gJHtzZXNzaW9uSWR9IG5vdCBmb3VuZCBmb3IgcmVzZXQtc2l6ZWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgc2Vzc2lvbiBpcyBydW5uaW5nXG4gICAgICBpZiAoc2Vzc2lvbi5zdGF0dXMgIT09ICdydW5uaW5nJykge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYHNlc3Npb24gJHtzZXNzaW9uSWR9IGlzIG5vdCBydW5uaW5nIChzdGF0dXM6ICR7c2Vzc2lvbi5zdGF0dXN9KWApO1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gaXMgbm90IHJ1bm5pbmcnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBSZXNldCB0aGUgc2Vzc2lvbiBzaXplXG4gICAgICBwdHlNYW5hZ2VyLnJlc2V0U2Vzc2lvblNpemUoc2Vzc2lvbklkKTtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYHNlc3Npb24gJHtzZXNzaW9uSWR9IHNpemUgcmVzZXQgdG8gdGVybWluYWwgc2l6ZWApKTtcblxuICAgICAgcmVzLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2Vycm9yIHJlc2V0dGluZyBzZXNzaW9uIHNpemUgdmlhIFBUWSBzZXJ2aWNlOicsIGVycm9yKTtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFB0eUVycm9yKSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gcmVzZXQgc2Vzc2lvbiBzaXplJywgZGV0YWlsczogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gcmVzZXQgc2Vzc2lvbiBzaXplJyB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiByb3V0ZXI7XG59XG5cbi8vIEdlbmVyYXRlIGEgdW5pcXVlIHNlc3Npb24gSURcbmZ1bmN0aW9uIGdlbmVyYXRlU2Vzc2lvbklkKCk6IHN0cmluZyB7XG4gIC8vIEdlbmVyYXRlIFVVSUQgdjRcbiAgY29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheSgxNik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgMTY7IGkrKykge1xuICAgIGJ5dGVzW2ldID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMjU2KTtcbiAgfVxuXG4gIC8vIFNldCB2ZXJzaW9uICg0KSBhbmQgdmFyaWFudCBiaXRzXG4gIGJ5dGVzWzZdID0gKGJ5dGVzWzZdICYgMHgwZikgfCAweDQwO1xuICBieXRlc1s4XSA9IChieXRlc1s4XSAmIDB4M2YpIHwgMHg4MDtcblxuICAvLyBDb252ZXJ0IHRvIGhleCBzdHJpbmcgd2l0aCBkYXNoZXNcbiAgY29uc3QgaGV4ID0gQXJyYXkuZnJvbShieXRlcywgKGIpID0+IGIudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykpLmpvaW4oJycpO1xuICByZXR1cm4gW1xuICAgIGhleC5zbGljZSgwLCA4KSxcbiAgICBoZXguc2xpY2UoOCwgMTIpLFxuICAgIGhleC5zbGljZSgxMiwgMTYpLFxuICAgIGhleC5zbGljZSgxNiwgMjApLFxuICAgIGhleC5zbGljZSgyMCwgMzIpLFxuICBdLmpvaW4oJy0nKTtcbn1cblxuLy8gUmVxdWVzdCB0ZXJtaW5hbCBzcGF3biBmcm9tIE1hYyBhcHAgdmlhIGNvbnRyb2wgc29ja2V0XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVxdWVzdFRlcm1pbmFsU3Bhd24ocGFyYW1zOiB7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICBzZXNzaW9uTmFtZTogc3RyaW5nO1xuICBjb21tYW5kOiBzdHJpbmdbXTtcbiAgd29ya2luZ0Rpcjogc3RyaW5nO1xuICB0aXRsZU1vZGU/OiBUaXRsZU1vZGU7XG4gIGdpdFJlcG9QYXRoPzogc3RyaW5nO1xuICBnaXRCcmFuY2g/OiBzdHJpbmc7XG4gIGdpdEFoZWFkQ291bnQ/OiBudW1iZXI7XG4gIGdpdEJlaGluZENvdW50PzogbnVtYmVyO1xuICBnaXRIYXNDaGFuZ2VzPzogYm9vbGVhbjtcbiAgZ2l0SXNXb3JrdHJlZT86IGJvb2xlYW47XG4gIGdpdE1haW5SZXBvUGF0aD86IHN0cmluZztcbn0pOiBQcm9taXNlPHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICB0cnkge1xuICAgIC8vIENyZWF0ZSBjb250cm9sIG1lc3NhZ2UgZm9yIHRlcm1pbmFsIHNwYXduXG4gICAgY29uc3QgbWVzc2FnZSA9IGNyZWF0ZUNvbnRyb2xNZXNzYWdlKFxuICAgICAgJ3Rlcm1pbmFsJyxcbiAgICAgICdzcGF3bicsXG4gICAgICB7XG4gICAgICAgIHNlc3Npb25JZDogcGFyYW1zLnNlc3Npb25JZCxcbiAgICAgICAgd29ya2luZ0RpcmVjdG9yeTogcGFyYW1zLndvcmtpbmdEaXIsXG4gICAgICAgIGNvbW1hbmQ6IHBhcmFtcy5jb21tYW5kLmpvaW4oJyAnKSxcbiAgICAgICAgdGVybWluYWxQcmVmZXJlbmNlOiBudWxsLCAvLyBMZXQgTWFjIGFwcCB1c2UgZGVmYXVsdCB0ZXJtaW5hbFxuICAgICAgICBnaXRSZXBvUGF0aDogcGFyYW1zLmdpdFJlcG9QYXRoLFxuICAgICAgICBnaXRCcmFuY2g6IHBhcmFtcy5naXRCcmFuY2gsXG4gICAgICAgIGdpdEFoZWFkQ291bnQ6IHBhcmFtcy5naXRBaGVhZENvdW50LFxuICAgICAgICBnaXRCZWhpbmRDb3VudDogcGFyYW1zLmdpdEJlaGluZENvdW50LFxuICAgICAgICBnaXRIYXNDaGFuZ2VzOiBwYXJhbXMuZ2l0SGFzQ2hhbmdlcyxcbiAgICAgICAgZ2l0SXNXb3JrdHJlZTogcGFyYW1zLmdpdElzV29ya3RyZWUsXG4gICAgICAgIGdpdE1haW5SZXBvUGF0aDogcGFyYW1zLmdpdE1haW5SZXBvUGF0aCxcbiAgICAgIH0sXG4gICAgICBwYXJhbXMuc2Vzc2lvbklkXG4gICAgKTtcblxuICAgIGxvZ2dlci5kZWJ1ZyhgcmVxdWVzdGluZyB0ZXJtaW5hbCBzcGF3biB2aWEgY29udHJvbCBzb2NrZXQgZm9yIHNlc3Npb24gJHtwYXJhbXMuc2Vzc2lvbklkfWApO1xuXG4gICAgLy8gU2VuZCB0aGUgbWVzc2FnZSBhbmQgd2FpdCBmb3IgcmVzcG9uc2VcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNvbnRyb2xVbml4SGFuZGxlci5zZW5kQ29udHJvbE1lc3NhZ2UobWVzc2FnZSk7XG5cbiAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6ICdObyByZXNwb25zZSBmcm9tIE1hYyBhcHAnLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3IpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN1Y2Nlc3M6IGZhbHNlLFxuICAgICAgICBlcnJvcjogcmVzcG9uc2UuZXJyb3IsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHN1Y2Nlc3MgPSAocmVzcG9uc2UucGF5bG9hZCBhcyBUZXJtaW5hbFNwYXduUmVzcG9uc2UpPy5zdWNjZXNzID09PSB0cnVlO1xuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzLFxuICAgICAgZXJyb3I6IHN1Y2Nlc3MgPyB1bmRlZmluZWQgOiAnVGVybWluYWwgc3Bhd24gZmFpbGVkJyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIHNwYXduIHRlcm1pbmFsOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgfTtcbiAgfVxufVxuIl19