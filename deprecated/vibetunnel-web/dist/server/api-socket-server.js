"use strict";
/**
 * API Socket Server for VibeTunnel control operations
 * Provides a Unix socket interface for CLI commands (vt) to communicate with the server
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
exports.apiSocketServer = exports.ApiSocketServer = void 0;
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const socket_protocol_js_1 = require("./pty/socket-protocol.js");
const git_error_js_1 = require("./utils/git-error.js");
const git_hooks_js_1 = require("./utils/git-hooks.js");
const logger_js_1 = require("./utils/logger.js");
const path_prettify_js_1 = require("./utils/path-prettify.js");
const version_js_1 = require("./version.js");
const control_protocol_js_1 = require("./websocket/control-protocol.js");
const control_unix_handler_js_1 = require("./websocket/control-unix-handler.js");
const logger = (0, logger_js_1.createLogger)('api-socket');
const execFile = (0, util_1.promisify)(require('child_process').execFile);
/**
 * Execute a git command with proper error handling
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
        throw (0, git_error_js_1.createGitError)(error, 'Git command failed');
    }
}
/**
 * API Socket Server that handles CLI commands via Unix socket
 */
class ApiSocketServer {
    constructor() {
        this.server = null;
        // Use control directory from environment or default
        const controlDir = process.env.VIBETUNNEL_CONTROL_DIR || path.join(os.homedir(), '.vibetunnel');
        const socketDir = controlDir;
        // Ensure directory exists
        if (!fs.existsSync(socketDir)) {
            fs.mkdirSync(socketDir, { recursive: true });
        }
        // Use a different socket name to avoid conflicts
        this.socketPath = path.join(socketDir, 'api.sock');
    }
    /**
     * Set server info for status queries
     */
    setServerInfo(port, url) {
        this.serverPort = port;
        this.serverUrl = url;
    }
    /**
     * Start the API socket server
     */
    async start() {
        // Clean up any existing socket
        try {
            fs.unlinkSync(this.socketPath);
        }
        catch (_error) {
            // Ignore
        }
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this.handleConnection(socket);
            });
            this.server.on('error', (error) => {
                logger.error('API socket server error:', error);
                reject(error);
            });
            this.server.listen(this.socketPath, () => {
                logger.log(`API socket server listening on ${this.socketPath}`);
                resolve();
            });
        });
    }
    /**
     * Stop the API socket server
     */
    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        // Clean up socket file
        try {
            fs.unlinkSync(this.socketPath);
        }
        catch (_error) {
            // Ignore
        }
    }
    /**
     * Handle incoming socket connections
     */
    handleConnection(socket) {
        const parser = new socket_protocol_js_1.MessageParser();
        socket.on('data', (data) => {
            parser.addData(data);
            for (const { type, payload } of parser.parseMessages()) {
                this.handleMessage(socket, type, payload);
            }
        });
        socket.on('error', (error) => {
            logger.error('API socket connection error:', error);
        });
    }
    /**
     * Handle incoming messages
     */
    async handleMessage(socket, type, payload) {
        try {
            const data = (0, socket_protocol_js_1.parsePayload)(type, payload);
            switch (type) {
                case socket_protocol_js_1.MessageType.STATUS_REQUEST:
                    await this.handleStatusRequest(socket);
                    break;
                case socket_protocol_js_1.MessageType.GIT_FOLLOW_REQUEST:
                    await this.handleGitFollowRequest(socket, data);
                    break;
                case socket_protocol_js_1.MessageType.GIT_EVENT_NOTIFY:
                    await this.handleGitEventNotify(socket, data);
                    break;
                default:
                    logger.warn(`Unhandled message type: ${type}`);
            }
        }
        catch (error) {
            logger.error('Failed to handle message:', error);
            this.sendError(socket, error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Handle status request
     */
    async handleStatusRequest(socket) {
        try {
            // Get current working directory for follow mode check
            const cwd = process.cwd();
            // Check follow mode status
            let followMode;
            try {
                // Check if we're in a git repo
                const { stdout: repoPathOutput } = await execGit(['rev-parse', '--show-toplevel'], { cwd });
                const repoPath = repoPathOutput.trim();
                // Check if this is a worktree
                const { stdout: gitDirOutput } = await execGit(['rev-parse', '--git-dir'], { cwd });
                const gitDir = gitDirOutput.trim();
                const isWorktree = gitDir.includes('/.git/worktrees/');
                // Find main repo path
                let mainRepoPath = repoPath;
                if (isWorktree) {
                    mainRepoPath = gitDir.replace(/\/\.git\/worktrees\/.*$/, '');
                }
                // Check for new worktree-based follow mode
                try {
                    const { stdout } = await execGit(['config', 'vibetunnel.followWorktree'], {
                        cwd: mainRepoPath,
                    });
                    const followWorktree = stdout.trim();
                    if (followWorktree) {
                        // Get branch name from worktree for display
                        let branchName = path.basename(followWorktree);
                        try {
                            const { stdout: branchOutput } = await execGit(['branch', '--show-current'], {
                                cwd: followWorktree,
                            });
                            if (branchOutput.trim()) {
                                branchName = branchOutput.trim();
                            }
                        }
                        catch (_e) {
                            // Use directory name as fallback
                        }
                        followMode = {
                            enabled: true,
                            branch: branchName,
                            repoPath: (0, path_prettify_js_1.prettifyPath)(followWorktree),
                        };
                    }
                }
                catch (_e) {
                    // No follow mode configured
                }
            }
            catch (_error) {
                // Not in a git repo
            }
            const response = {
                running: true,
                port: this.serverPort,
                url: this.serverUrl,
                version: version_js_1.VERSION,
                buildDate: version_js_1.BUILD_DATE,
                followMode,
            };
            socket.write(socket_protocol_js_1.MessageBuilder.statusResponse(response));
        }
        catch (error) {
            logger.error('Failed to get status:', error);
            this.sendError(socket, 'Failed to get server status');
        }
    }
    /**
     * Handle Git follow mode request
     */
    async handleGitFollowRequest(socket, request) {
        try {
            const { repoPath, branch, enable, worktreePath, mainRepoPath } = request;
            // Use new fields if available, otherwise fall back to old fields
            const targetMainRepo = mainRepoPath || repoPath;
            if (!targetMainRepo) {
                throw new Error('No repository path provided');
            }
            const absoluteMainRepo = path.resolve(targetMainRepo);
            const absoluteWorktreePath = worktreePath ? path.resolve(worktreePath) : undefined;
            logger.debug(`${enable ? 'Enabling' : 'Disabling'} follow mode${absoluteWorktreePath ? ` for worktree: ${absoluteWorktreePath}` : branch ? ` for branch: ${branch}` : ''}`);
            if (enable) {
                // Check if Git hooks are already installed
                const hooksAlreadyInstalled = await (0, git_hooks_js_1.areHooksInstalled)(absoluteMainRepo);
                if (!hooksAlreadyInstalled) {
                    // Install Git hooks
                    logger.info('Installing Git hooks for follow mode');
                    const installResult = await (0, git_hooks_js_1.installGitHooks)(absoluteMainRepo);
                    if (!installResult.success) {
                        const response = {
                            success: false,
                            error: 'Failed to install Git hooks',
                        };
                        socket.write(socket_protocol_js_1.MessageBuilder.gitFollowResponse(response));
                        return;
                    }
                }
                // If we have a worktree path, use that. Otherwise try to find worktree from branch
                let followPath;
                let displayName;
                if (absoluteWorktreePath) {
                    // Direct worktree path provided
                    followPath = absoluteWorktreePath;
                    // Get the branch name from the worktree for display
                    try {
                        const { stdout } = await execGit(['branch', '--show-current'], {
                            cwd: absoluteWorktreePath,
                        });
                        displayName = stdout.trim() || path.basename(absoluteWorktreePath);
                    }
                    catch {
                        displayName = path.basename(absoluteWorktreePath);
                    }
                }
                else if (branch) {
                    // Try to find worktree for the branch
                    try {
                        const { stdout } = await execGit(['worktree', 'list', '--porcelain'], {
                            cwd: absoluteMainRepo,
                        });
                        const lines = stdout.split('\n');
                        let foundWorktree;
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].startsWith('worktree ')) {
                                const worktreePath = lines[i].substring(9);
                                // Check if next lines contain our branch
                                if (i + 2 < lines.length && lines[i + 2] === `branch refs/heads/${branch}`) {
                                    if (worktreePath !== absoluteMainRepo) {
                                        foundWorktree = worktreePath;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!foundWorktree) {
                            throw new Error(`No worktree found for branch '${branch}'`);
                        }
                        followPath = foundWorktree;
                        displayName = branch;
                    }
                    catch (error) {
                        throw new Error(`Failed to find worktree: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                else {
                    // No branch or worktree specified - try current branch
                    try {
                        const { stdout } = await execGit(['branch', '--show-current'], {
                            cwd: absoluteMainRepo,
                        });
                        const currentBranch = stdout.trim();
                        if (!currentBranch) {
                            throw new Error('Not on a branch (detached HEAD)');
                        }
                        // Recursively call with the current branch
                        return this.handleGitFollowRequest(socket, {
                            ...request,
                            branch: currentBranch,
                        });
                    }
                    catch (error) {
                        throw new Error(`Failed to get current branch: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                // Set the follow mode config with worktree path
                await execGit(['config', '--local', 'vibetunnel.followWorktree', followPath], {
                    cwd: absoluteMainRepo,
                });
                // Install hooks in both locations
                const mainRepoHooksInstalled = await (0, git_hooks_js_1.areHooksInstalled)(absoluteMainRepo);
                if (!mainRepoHooksInstalled) {
                    logger.info('Installing Git hooks in main repository');
                    const installResult = await (0, git_hooks_js_1.installGitHooks)(absoluteMainRepo);
                    if (!installResult.success) {
                        throw new Error('Failed to install Git hooks in main repository');
                    }
                }
                const worktreeHooksInstalled = await (0, git_hooks_js_1.areHooksInstalled)(followPath);
                if (!worktreeHooksInstalled) {
                    logger.info('Installing Git hooks in worktree');
                    const installResult = await (0, git_hooks_js_1.installGitHooks)(followPath);
                    if (!installResult.success) {
                        logger.warn('Failed to install Git hooks in worktree, continuing anyway');
                    }
                }
                // Send notification to Mac app
                if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                    const notification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', {
                        level: 'info',
                        title: 'Follow Mode Enabled',
                        message: `Now following ${displayName} in ${path.basename(absoluteMainRepo)}`,
                    });
                    control_unix_handler_js_1.controlUnixHandler.sendToMac(notification);
                }
                const response = {
                    success: true,
                    currentBranch: displayName,
                };
                socket.write(socket_protocol_js_1.MessageBuilder.gitFollowResponse(response));
            }
            else {
                // Disable follow mode
                await execGit(['config', '--local', '--unset', 'vibetunnel.followWorktree'], {
                    cwd: absoluteMainRepo,
                });
                // Get the worktree path that was being followed
                let followedWorktree;
                try {
                    const { stdout } = await execGit(['config', 'vibetunnel.followWorktree'], {
                        cwd: absoluteMainRepo,
                    });
                    followedWorktree = stdout.trim();
                }
                catch {
                    // No worktree was being followed
                }
                // Uninstall Git hooks from main repo
                logger.info('Uninstalling Git hooks from main repository');
                const mainUninstallResult = await (0, git_hooks_js_1.uninstallGitHooks)(absoluteMainRepo);
                // Also uninstall from worktree if we know which one was being followed
                if (followedWorktree && followedWorktree !== absoluteMainRepo) {
                    logger.info('Uninstalling Git hooks from worktree');
                    const worktreeUninstallResult = await (0, git_hooks_js_1.uninstallGitHooks)(followedWorktree);
                    if (!worktreeUninstallResult.success) {
                        logger.warn('Failed to uninstall some Git hooks from worktree:', worktreeUninstallResult.errors);
                    }
                }
                if (!mainUninstallResult.success) {
                    logger.warn('Failed to uninstall some Git hooks from main repo:', mainUninstallResult.errors);
                    // Continue anyway - follow mode is still disabled
                }
                else {
                    logger.info('Git hooks uninstalled successfully from main repository');
                }
                // Send notification to Mac app
                if (control_unix_handler_js_1.controlUnixHandler.isMacAppConnected()) {
                    const notification = (0, control_protocol_js_1.createControlEvent)('system', 'notification', {
                        level: 'info',
                        title: 'Follow Mode Disabled',
                        message: `Follow mode disabled in ${path.basename(absoluteMainRepo)}`,
                    });
                    control_unix_handler_js_1.controlUnixHandler.sendToMac(notification);
                }
                const response = {
                    success: true,
                };
                socket.write(socket_protocol_js_1.MessageBuilder.gitFollowResponse(response));
            }
        }
        catch (error) {
            const response = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
            socket.write(socket_protocol_js_1.MessageBuilder.gitFollowResponse(response));
        }
    }
    /**
     * Handle Git event notification
     */
    async handleGitEventNotify(socket, event) {
        logger.debug(`Git event notification received: ${event.type} for ${event.repoPath}`);
        try {
            // Forward the event to the HTTP endpoint which contains the sync logic
            const port = this.serverPort || 4020;
            const url = `http://localhost:${port}/api/git/event`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    repoPath: event.repoPath,
                    event: event.type,
                    // Branch information would need to be extracted from git hooks
                    // For now, we'll let the endpoint handle branch detection
                }),
            });
            if (!response.ok) {
                throw new Error(`HTTP endpoint returned ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            logger.debug('Git event processed successfully:', result);
            const ack = {
                handled: true,
            };
            socket.write(socket_protocol_js_1.MessageBuilder.gitEventAck(ack));
        }
        catch (error) {
            logger.error('Failed to forward git event to HTTP endpoint:', error);
            const ack = {
                handled: false,
            };
            socket.write(socket_protocol_js_1.MessageBuilder.gitEventAck(ack));
        }
    }
    /**
     * Send error response
     */
    sendError(socket, message) {
        socket.write(socket_protocol_js_1.MessageBuilder.error('API_ERROR', message));
    }
}
exports.ApiSocketServer = ApiSocketServer;
// Export singleton instance
exports.apiSocketServer = new ApiSocketServer();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLXNvY2tldC1zZXJ2ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmVyL2FwaS1zb2NrZXQtc2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHVDQUF5QjtBQUN6Qix5Q0FBMkI7QUFDM0IsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QiwrQkFBaUM7QUFDakMsaUVBVWtDO0FBQ2xDLHVEQUFzRDtBQUN0RCx1REFBNkY7QUFDN0YsaURBQWlEO0FBQ2pELCtEQUF3RDtBQUN4RCw2Q0FBbUQ7QUFDbkQseUVBQXFFO0FBQ3JFLGlGQUF5RTtBQUV6RSxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsWUFBWSxDQUFDLENBQUM7QUFDMUMsTUFBTSxRQUFRLEdBQUcsSUFBQSxnQkFBUyxFQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUU5RDs7R0FFRztBQUNILEtBQUssVUFBVSxPQUFPLENBQ3BCLElBQWMsRUFDZCxVQUE4QyxFQUFFO0lBRWhELElBQUksQ0FBQztRQUNILE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsTUFBTSxRQUFRLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRTtZQUNyRCxHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUMsR0FBRyxFQUFFO1lBQ2pDLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLElBQUk7WUFDaEMsU0FBUyxFQUFFLElBQUksR0FBRyxJQUFJLEVBQUUsTUFBTTtZQUM5QixHQUFHLEVBQUUsRUFBRSxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLEVBQUUsc0JBQXNCO1NBQzFFLENBQUMsQ0FBQztRQUNILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLFFB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O1lBRUgsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQywwQkFBMEIsUUFBUSxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztZQUN2RixDQUFDO1lBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckMsTUFBTSxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUUxRCxNQUFNLEdBQUcsR0FBZ0I7Z0JBQ3ZCLE9BQU8sRUFBRSxJQUFJO2FBQ2QsQ0FBQztZQUNGLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUNBQWMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoRCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFFckUsTUFBTSxHQUFHLEdBQWdCO2dCQUN2QixPQUFPLEVBQUUsS0FBSzthQUNmLENBQUM7WUFDRixNQUFNLENBQUMsS0FBSyxDQUFDLG1DQUFjLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLFNBQVMsQ0FBQyxNQUFrQixFQUFFLE9BQWU7UUFDbkQsTUFBTSxDQUFDLEtBQUssQ0FBQyxtQ0FBYyxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUMzRCxDQUFDO0NBQ0Y7QUExZEQsMENBMGRDO0FBRUQsNEJBQTRCO0FBQ2YsUUFBQSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQVBJIFNvY2tldCBTZXJ2ZXIgZm9yIFZpYmVUdW5uZWwgY29udHJvbCBvcGVyYXRpb25zXG4gKiBQcm92aWRlcyBhIFVuaXggc29ja2V0IGludGVyZmFjZSBmb3IgQ0xJIGNvbW1hbmRzICh2dCkgdG8gY29tbXVuaWNhdGUgd2l0aCB0aGUgc2VydmVyXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQge1xuICB0eXBlIEdpdEV2ZW50QWNrLFxuICB0eXBlIEdpdEV2ZW50Tm90aWZ5LFxuICB0eXBlIEdpdEZvbGxvd1JlcXVlc3QsXG4gIHR5cGUgR2l0Rm9sbG93UmVzcG9uc2UsXG4gIE1lc3NhZ2VCdWlsZGVyLFxuICBNZXNzYWdlUGFyc2VyLFxuICBNZXNzYWdlVHlwZSxcbiAgcGFyc2VQYXlsb2FkLFxuICB0eXBlIFN0YXR1c1Jlc3BvbnNlLFxufSBmcm9tICcuL3B0eS9zb2NrZXQtcHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY3JlYXRlR2l0RXJyb3IgfSBmcm9tICcuL3V0aWxzL2dpdC1lcnJvci5qcyc7XG5pbXBvcnQgeyBhcmVIb29rc0luc3RhbGxlZCwgaW5zdGFsbEdpdEhvb2tzLCB1bmluc3RhbGxHaXRIb29rcyB9IGZyb20gJy4vdXRpbHMvZ2l0LWhvb2tzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IHByZXR0aWZ5UGF0aCB9IGZyb20gJy4vdXRpbHMvcGF0aC1wcmV0dGlmeS5qcyc7XG5pbXBvcnQgeyBCVUlMRF9EQVRFLCBWRVJTSU9OIH0gZnJvbSAnLi92ZXJzaW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbnRyb2xFdmVudCB9IGZyb20gJy4vd2Vic29ja2V0L2NvbnRyb2wtcHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY29udHJvbFVuaXhIYW5kbGVyIH0gZnJvbSAnLi93ZWJzb2NrZXQvY29udHJvbC11bml4LWhhbmRsZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2FwaS1zb2NrZXQnKTtcbmNvbnN0IGV4ZWNGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5leGVjRmlsZSk7XG5cbi8qKlxuICogRXhlY3V0ZSBhIGdpdCBjb21tYW5kIHdpdGggcHJvcGVyIGVycm9yIGhhbmRsaW5nXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGV4ZWNHaXQoXG4gIGFyZ3M6IHN0cmluZ1tdLFxuICBvcHRpb25zOiB7IGN3ZD86IHN0cmluZzsgdGltZW91dD86IG51bWJlciB9ID0ge31cbik6IFByb21pc2U8eyBzdGRvdXQ6IHN0cmluZzsgc3RkZXJyOiBzdHJpbmcgfT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgc3Rkb3V0LCBzdGRlcnIgfSA9IGF3YWl0IGV4ZWNGaWxlKCdnaXQnLCBhcmdzLCB7XG4gICAgICBjd2Q6IG9wdGlvbnMuY3dkIHx8IHByb2Nlc3MuY3dkKCksXG4gICAgICB0aW1lb3V0OiBvcHRpb25zLnRpbWVvdXQgfHwgNTAwMCxcbiAgICAgIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQsIC8vIDFNQlxuICAgICAgZW52OiB7IC4uLnByb2Nlc3MuZW52LCBHSVRfVEVSTUlOQUxfUFJPTVBUOiAnMCcgfSwgLy8gRGlzYWJsZSBnaXQgcHJvbXB0c1xuICAgIH0pO1xuICAgIHJldHVybiB7IHN0ZG91dDogc3Rkb3V0LnRvU3RyaW5nKCksIHN0ZGVycjogc3RkZXJyLnRvU3RyaW5nKCkgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBjcmVhdGVHaXRFcnJvcihlcnJvciwgJ0dpdCBjb21tYW5kIGZhaWxlZCcpO1xuICB9XG59XG5cbi8qKlxuICogQVBJIFNvY2tldCBTZXJ2ZXIgdGhhdCBoYW5kbGVzIENMSSBjb21tYW5kcyB2aWEgVW5peCBzb2NrZXRcbiAqL1xuZXhwb3J0IGNsYXNzIEFwaVNvY2tldFNlcnZlciB7XG4gIHByaXZhdGUgc2VydmVyOiBuZXQuU2VydmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcmVhZG9ubHkgc29ja2V0UGF0aDogc3RyaW5nO1xuICBwcml2YXRlIHNlcnZlclBvcnQ/OiBudW1iZXI7XG4gIHByaXZhdGUgc2VydmVyVXJsPzogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIC8vIFVzZSBjb250cm9sIGRpcmVjdG9yeSBmcm9tIGVudmlyb25tZW50IG9yIGRlZmF1bHRcbiAgICBjb25zdCBjb250cm9sRGlyID0gcHJvY2Vzcy5lbnYuVklCRVRVTk5FTF9DT05UUk9MX0RJUiB8fCBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLnZpYmV0dW5uZWwnKTtcbiAgICBjb25zdCBzb2NrZXREaXIgPSBjb250cm9sRGlyO1xuXG4gICAgLy8gRW5zdXJlIGRpcmVjdG9yeSBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoc29ja2V0RGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKHNvY2tldERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgfVxuXG4gICAgLy8gVXNlIGEgZGlmZmVyZW50IHNvY2tldCBuYW1lIHRvIGF2b2lkIGNvbmZsaWN0c1xuICAgIHRoaXMuc29ja2V0UGF0aCA9IHBhdGguam9pbihzb2NrZXREaXIsICdhcGkuc29jaycpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldCBzZXJ2ZXIgaW5mbyBmb3Igc3RhdHVzIHF1ZXJpZXNcbiAgICovXG4gIHNldFNlcnZlckluZm8ocG9ydDogbnVtYmVyLCB1cmw6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc2VydmVyUG9ydCA9IHBvcnQ7XG4gICAgdGhpcy5zZXJ2ZXJVcmwgPSB1cmw7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnQgdGhlIEFQSSBzb2NrZXQgc2VydmVyXG4gICAqL1xuICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBDbGVhbiB1cCBhbnkgZXhpc3Rpbmcgc29ja2V0XG4gICAgdHJ5IHtcbiAgICAgIGZzLnVubGlua1N5bmModGhpcy5zb2NrZXRQYXRoKTtcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIC8vIElnbm9yZVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLnNlcnZlciA9IG5ldC5jcmVhdGVTZXJ2ZXIoKHNvY2tldCkgPT4ge1xuICAgICAgICB0aGlzLmhhbmRsZUNvbm5lY3Rpb24oc29ja2V0KTtcbiAgICAgIH0pO1xuXG4gICAgICB0aGlzLnNlcnZlci5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdBUEkgc29ja2V0IHNlcnZlciBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9KTtcblxuICAgICAgdGhpcy5zZXJ2ZXIubGlzdGVuKHRoaXMuc29ja2V0UGF0aCwgKCkgPT4ge1xuICAgICAgICBsb2dnZXIubG9nKGBBUEkgc29ja2V0IHNlcnZlciBsaXN0ZW5pbmcgb24gJHt0aGlzLnNvY2tldFBhdGh9YCk7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgdGhlIEFQSSBzb2NrZXQgc2VydmVyXG4gICAqL1xuICBzdG9wKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnNlcnZlcikge1xuICAgICAgdGhpcy5zZXJ2ZXIuY2xvc2UoKTtcbiAgICAgIHRoaXMuc2VydmVyID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBDbGVhbiB1cCBzb2NrZXQgZmlsZVxuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKHRoaXMuc29ja2V0UGF0aCk7XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAvLyBJZ25vcmVcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGluY29taW5nIHNvY2tldCBjb25uZWN0aW9uc1xuICAgKi9cbiAgcHJpdmF0ZSBoYW5kbGVDb25uZWN0aW9uKHNvY2tldDogbmV0LlNvY2tldCk6IHZvaWQge1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBNZXNzYWdlUGFyc2VyKCk7XG5cbiAgICBzb2NrZXQub24oJ2RhdGEnLCAoZGF0YSkgPT4ge1xuICAgICAgcGFyc2VyLmFkZERhdGEoZGF0YSk7XG5cbiAgICAgIGZvciAoY29uc3QgeyB0eXBlLCBwYXlsb2FkIH0gb2YgcGFyc2VyLnBhcnNlTWVzc2FnZXMoKSkge1xuICAgICAgICB0aGlzLmhhbmRsZU1lc3NhZ2Uoc29ja2V0LCB0eXBlLCBwYXlsb2FkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHNvY2tldC5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgIGxvZ2dlci5lcnJvcignQVBJIHNvY2tldCBjb25uZWN0aW9uIGVycm9yOicsIGVycm9yKTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgaW5jb21pbmcgbWVzc2FnZXNcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlTWVzc2FnZShcbiAgICBzb2NrZXQ6IG5ldC5Tb2NrZXQsXG4gICAgdHlwZTogTWVzc2FnZVR5cGUsXG4gICAgcGF5bG9hZDogQnVmZmVyXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBkYXRhID0gcGFyc2VQYXlsb2FkKHR5cGUsIHBheWxvYWQpO1xuXG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBNZXNzYWdlVHlwZS5TVEFUVVNfUkVRVUVTVDpcbiAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZVN0YXR1c1JlcXVlc3Qoc29ja2V0KTtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIE1lc3NhZ2VUeXBlLkdJVF9GT0xMT1dfUkVRVUVTVDpcbiAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUdpdEZvbGxvd1JlcXVlc3Qoc29ja2V0LCBkYXRhIGFzIEdpdEZvbGxvd1JlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgTWVzc2FnZVR5cGUuR0lUX0VWRU5UX05PVElGWTpcbiAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUdpdEV2ZW50Tm90aWZ5KHNvY2tldCwgZGF0YSBhcyBHaXRFdmVudE5vdGlmeSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBsb2dnZXIud2FybihgVW5oYW5kbGVkIG1lc3NhZ2UgdHlwZTogJHt0eXBlfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBoYW5kbGUgbWVzc2FnZTonLCBlcnJvcik7XG4gICAgICB0aGlzLnNlbmRFcnJvcihzb2NrZXQsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIHN0YXR1cyByZXF1ZXN0XG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGhhbmRsZVN0YXR1c1JlcXVlc3Qoc29ja2V0OiBuZXQuU29ja2V0KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IGZvciBmb2xsb3cgbW9kZSBjaGVja1xuICAgICAgY29uc3QgY3dkID0gcHJvY2Vzcy5jd2QoKTtcblxuICAgICAgLy8gQ2hlY2sgZm9sbG93IG1vZGUgc3RhdHVzXG4gICAgICBsZXQgZm9sbG93TW9kZTogU3RhdHVzUmVzcG9uc2VbJ2ZvbGxvd01vZGUnXTtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHdlJ3JlIGluIGEgZ2l0IHJlcG9cbiAgICAgICAgY29uc3QgeyBzdGRvdXQ6IHJlcG9QYXRoT3V0cHV0IH0gPSBhd2FpdCBleGVjR2l0KFsncmV2LXBhcnNlJywgJy0tc2hvdy10b3BsZXZlbCddLCB7IGN3ZCB9KTtcbiAgICAgICAgY29uc3QgcmVwb1BhdGggPSByZXBvUGF0aE91dHB1dC50cmltKCk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIHdvcmt0cmVlXG4gICAgICAgIGNvbnN0IHsgc3Rkb3V0OiBnaXREaXJPdXRwdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydyZXYtcGFyc2UnLCAnLS1naXQtZGlyJ10sIHsgY3dkIH0pO1xuICAgICAgICBjb25zdCBnaXREaXIgPSBnaXREaXJPdXRwdXQudHJpbSgpO1xuICAgICAgICBjb25zdCBpc1dvcmt0cmVlID0gZ2l0RGlyLmluY2x1ZGVzKCcvLmdpdC93b3JrdHJlZXMvJyk7XG5cbiAgICAgICAgLy8gRmluZCBtYWluIHJlcG8gcGF0aFxuICAgICAgICBsZXQgbWFpblJlcG9QYXRoID0gcmVwb1BhdGg7XG4gICAgICAgIGlmIChpc1dvcmt0cmVlKSB7XG4gICAgICAgICAgbWFpblJlcG9QYXRoID0gZ2l0RGlyLnJlcGxhY2UoL1xcL1xcLmdpdFxcL3dvcmt0cmVlc1xcLy4qJC8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGZvciBuZXcgd29ya3RyZWUtYmFzZWQgZm9sbG93IG1vZGVcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0dpdChbJ2NvbmZpZycsICd2aWJldHVubmVsLmZvbGxvd1dvcmt0cmVlJ10sIHtcbiAgICAgICAgICAgIGN3ZDogbWFpblJlcG9QYXRoLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnN0IGZvbGxvd1dvcmt0cmVlID0gc3Rkb3V0LnRyaW0oKTtcbiAgICAgICAgICBpZiAoZm9sbG93V29ya3RyZWUpIHtcbiAgICAgICAgICAgIC8vIEdldCBicmFuY2ggbmFtZSBmcm9tIHdvcmt0cmVlIGZvciBkaXNwbGF5XG4gICAgICAgICAgICBsZXQgYnJhbmNoTmFtZSA9IHBhdGguYmFzZW5hbWUoZm9sbG93V29ya3RyZWUpO1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgY29uc3QgeyBzdGRvdXQ6IGJyYW5jaE91dHB1dCB9ID0gYXdhaXQgZXhlY0dpdChbJ2JyYW5jaCcsICctLXNob3ctY3VycmVudCddLCB7XG4gICAgICAgICAgICAgICAgY3dkOiBmb2xsb3dXb3JrdHJlZSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIGlmIChicmFuY2hPdXRwdXQudHJpbSgpKSB7XG4gICAgICAgICAgICAgICAgYnJhbmNoTmFtZSA9IGJyYW5jaE91dHB1dC50cmltKCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICAgICAgICAgIC8vIFVzZSBkaXJlY3RvcnkgbmFtZSBhcyBmYWxsYmFja1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb2xsb3dNb2RlID0ge1xuICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBicmFuY2g6IGJyYW5jaE5hbWUsXG4gICAgICAgICAgICAgIHJlcG9QYXRoOiBwcmV0dGlmeVBhdGgoZm9sbG93V29ya3RyZWUpLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKF9lKSB7XG4gICAgICAgICAgLy8gTm8gZm9sbG93IG1vZGUgY29uZmlndXJlZFxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgICAgLy8gTm90IGluIGEgZ2l0IHJlcG9cbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzcG9uc2U6IFN0YXR1c1Jlc3BvbnNlID0ge1xuICAgICAgICBydW5uaW5nOiB0cnVlLFxuICAgICAgICBwb3J0OiB0aGlzLnNlcnZlclBvcnQsXG4gICAgICAgIHVybDogdGhpcy5zZXJ2ZXJVcmwsXG4gICAgICAgIHZlcnNpb246IFZFUlNJT04sXG4gICAgICAgIGJ1aWxkRGF0ZTogQlVJTERfREFURSxcbiAgICAgICAgZm9sbG93TW9kZSxcbiAgICAgIH07XG5cbiAgICAgIHNvY2tldC53cml0ZShNZXNzYWdlQnVpbGRlci5zdGF0dXNSZXNwb25zZShyZXNwb25zZSkpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgc3RhdHVzOicsIGVycm9yKTtcbiAgICAgIHRoaXMuc2VuZEVycm9yKHNvY2tldCwgJ0ZhaWxlZCB0byBnZXQgc2VydmVyIHN0YXR1cycpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgR2l0IGZvbGxvdyBtb2RlIHJlcXVlc3RcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlR2l0Rm9sbG93UmVxdWVzdChcbiAgICBzb2NrZXQ6IG5ldC5Tb2NrZXQsXG4gICAgcmVxdWVzdDogR2l0Rm9sbG93UmVxdWVzdFxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyByZXBvUGF0aCwgYnJhbmNoLCBlbmFibGUsIHdvcmt0cmVlUGF0aCwgbWFpblJlcG9QYXRoIH0gPSByZXF1ZXN0O1xuXG4gICAgICAvLyBVc2UgbmV3IGZpZWxkcyBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gb2xkIGZpZWxkc1xuICAgICAgY29uc3QgdGFyZ2V0TWFpblJlcG8gPSBtYWluUmVwb1BhdGggfHwgcmVwb1BhdGg7XG4gICAgICBpZiAoIXRhcmdldE1haW5SZXBvKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcmVwb3NpdG9yeSBwYXRoIHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFic29sdXRlTWFpblJlcG8gPSBwYXRoLnJlc29sdmUodGFyZ2V0TWFpblJlcG8pO1xuICAgICAgY29uc3QgYWJzb2x1dGVXb3JrdHJlZVBhdGggPSB3b3JrdHJlZVBhdGggPyBwYXRoLnJlc29sdmUod29ya3RyZWVQYXRoKSA6IHVuZGVmaW5lZDtcblxuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgJHtlbmFibGUgPyAnRW5hYmxpbmcnIDogJ0Rpc2FibGluZyd9IGZvbGxvdyBtb2RlJHthYnNvbHV0ZVdvcmt0cmVlUGF0aCA/IGAgZm9yIHdvcmt0cmVlOiAke2Fic29sdXRlV29ya3RyZWVQYXRofWAgOiBicmFuY2ggPyBgIGZvciBicmFuY2g6ICR7YnJhbmNofWAgOiAnJ31gXG4gICAgICApO1xuXG4gICAgICBpZiAoZW5hYmxlKSB7XG4gICAgICAgIC8vIENoZWNrIGlmIEdpdCBob29rcyBhcmUgYWxyZWFkeSBpbnN0YWxsZWRcbiAgICAgICAgY29uc3QgaG9va3NBbHJlYWR5SW5zdGFsbGVkID0gYXdhaXQgYXJlSG9va3NJbnN0YWxsZWQoYWJzb2x1dGVNYWluUmVwbyk7XG5cbiAgICAgICAgaWYgKCFob29rc0FscmVhZHlJbnN0YWxsZWQpIHtcbiAgICAgICAgICAvLyBJbnN0YWxsIEdpdCBob29rc1xuICAgICAgICAgIGxvZ2dlci5pbmZvKCdJbnN0YWxsaW5nIEdpdCBob29rcyBmb3IgZm9sbG93IG1vZGUnKTtcbiAgICAgICAgICBjb25zdCBpbnN0YWxsUmVzdWx0ID0gYXdhaXQgaW5zdGFsbEdpdEhvb2tzKGFic29sdXRlTWFpblJlcG8pO1xuXG4gICAgICAgICAgaWYgKCFpbnN0YWxsUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlOiBHaXRGb2xsb3dSZXNwb25zZSA9IHtcbiAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGluc3RhbGwgR2l0IGhvb2tzJyxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzb2NrZXQud3JpdGUoTWVzc2FnZUJ1aWxkZXIuZ2l0Rm9sbG93UmVzcG9uc2UocmVzcG9uc2UpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBoYXZlIGEgd29ya3RyZWUgcGF0aCwgdXNlIHRoYXQuIE90aGVyd2lzZSB0cnkgdG8gZmluZCB3b3JrdHJlZSBmcm9tIGJyYW5jaFxuICAgICAgICBsZXQgZm9sbG93UGF0aDogc3RyaW5nO1xuICAgICAgICBsZXQgZGlzcGxheU5hbWU6IHN0cmluZztcblxuICAgICAgICBpZiAoYWJzb2x1dGVXb3JrdHJlZVBhdGgpIHtcbiAgICAgICAgICAvLyBEaXJlY3Qgd29ya3RyZWUgcGF0aCBwcm92aWRlZFxuICAgICAgICAgIGZvbGxvd1BhdGggPSBhYnNvbHV0ZVdvcmt0cmVlUGF0aDtcblxuICAgICAgICAgIC8vIEdldCB0aGUgYnJhbmNoIG5hbWUgZnJvbSB0aGUgd29ya3RyZWUgZm9yIGRpc3BsYXlcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydicmFuY2gnLCAnLS1zaG93LWN1cnJlbnQnXSwge1xuICAgICAgICAgICAgICBjd2Q6IGFic29sdXRlV29ya3RyZWVQYXRoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBkaXNwbGF5TmFtZSA9IHN0ZG91dC50cmltKCkgfHwgcGF0aC5iYXNlbmFtZShhYnNvbHV0ZVdvcmt0cmVlUGF0aCk7XG4gICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICBkaXNwbGF5TmFtZSA9IHBhdGguYmFzZW5hbWUoYWJzb2x1dGVXb3JrdHJlZVBhdGgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChicmFuY2gpIHtcbiAgICAgICAgICAvLyBUcnkgdG8gZmluZCB3b3JrdHJlZSBmb3IgdGhlIGJyYW5jaFxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0dpdChbJ3dvcmt0cmVlJywgJ2xpc3QnLCAnLS1wb3JjZWxhaW4nXSwge1xuICAgICAgICAgICAgICBjd2Q6IGFic29sdXRlTWFpblJlcG8sXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBzdGRvdXQuc3BsaXQoJ1xcbicpO1xuICAgICAgICAgICAgbGV0IGZvdW5kV29ya3RyZWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICBpZiAobGluZXNbaV0uc3RhcnRzV2l0aCgnd29ya3RyZWUgJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB3b3JrdHJlZVBhdGggPSBsaW5lc1tpXS5zdWJzdHJpbmcoOSk7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgbmV4dCBsaW5lcyBjb250YWluIG91ciBicmFuY2hcbiAgICAgICAgICAgICAgICBpZiAoaSArIDIgPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaSArIDJdID09PSBgYnJhbmNoIHJlZnMvaGVhZHMvJHticmFuY2h9YCkge1xuICAgICAgICAgICAgICAgICAgaWYgKHdvcmt0cmVlUGF0aCAhPT0gYWJzb2x1dGVNYWluUmVwbykge1xuICAgICAgICAgICAgICAgICAgICBmb3VuZFdvcmt0cmVlID0gd29ya3RyZWVQYXRoO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZFdvcmt0cmVlKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gd29ya3RyZWUgZm91bmQgZm9yIGJyYW5jaCAnJHticmFuY2h9J2ApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb2xsb3dQYXRoID0gZm91bmRXb3JrdHJlZTtcbiAgICAgICAgICAgIGRpc3BsYXlOYW1lID0gYnJhbmNoO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgIGBGYWlsZWQgdG8gZmluZCB3b3JrdHJlZTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTm8gYnJhbmNoIG9yIHdvcmt0cmVlIHNwZWNpZmllZCAtIHRyeSBjdXJyZW50IGJyYW5jaFxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0dpdChbJ2JyYW5jaCcsICctLXNob3ctY3VycmVudCddLCB7XG4gICAgICAgICAgICAgIGN3ZDogYWJzb2x1dGVNYWluUmVwbyxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEJyYW5jaCA9IHN0ZG91dC50cmltKCk7XG5cbiAgICAgICAgICAgIGlmICghY3VycmVudEJyYW5jaCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vdCBvbiBhIGJyYW5jaCAoZGV0YWNoZWQgSEVBRCknKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUmVjdXJzaXZlbHkgY2FsbCB3aXRoIHRoZSBjdXJyZW50IGJyYW5jaFxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2l0Rm9sbG93UmVxdWVzdChzb2NrZXQsIHtcbiAgICAgICAgICAgICAgLi4ucmVxdWVzdCxcbiAgICAgICAgICAgICAgYnJhbmNoOiBjdXJyZW50QnJhbmNoLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCB0byBnZXQgY3VycmVudCBicmFuY2g6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2V0IHRoZSBmb2xsb3cgbW9kZSBjb25maWcgd2l0aCB3b3JrdHJlZSBwYXRoXG4gICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjb25maWcnLCAnLS1sb2NhbCcsICd2aWJldHVubmVsLmZvbGxvd1dvcmt0cmVlJywgZm9sbG93UGF0aF0sIHtcbiAgICAgICAgICBjd2Q6IGFic29sdXRlTWFpblJlcG8sXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEluc3RhbGwgaG9va3MgaW4gYm90aCBsb2NhdGlvbnNcbiAgICAgICAgY29uc3QgbWFpblJlcG9Ib29rc0luc3RhbGxlZCA9IGF3YWl0IGFyZUhvb2tzSW5zdGFsbGVkKGFic29sdXRlTWFpblJlcG8pO1xuICAgICAgICBpZiAoIW1haW5SZXBvSG9va3NJbnN0YWxsZWQpIHtcbiAgICAgICAgICBsb2dnZXIuaW5mbygnSW5zdGFsbGluZyBHaXQgaG9va3MgaW4gbWFpbiByZXBvc2l0b3J5Jyk7XG4gICAgICAgICAgY29uc3QgaW5zdGFsbFJlc3VsdCA9IGF3YWl0IGluc3RhbGxHaXRIb29rcyhhYnNvbHV0ZU1haW5SZXBvKTtcbiAgICAgICAgICBpZiAoIWluc3RhbGxSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gaW5zdGFsbCBHaXQgaG9va3MgaW4gbWFpbiByZXBvc2l0b3J5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3Qgd29ya3RyZWVIb29rc0luc3RhbGxlZCA9IGF3YWl0IGFyZUhvb2tzSW5zdGFsbGVkKGZvbGxvd1BhdGgpO1xuICAgICAgICBpZiAoIXdvcmt0cmVlSG9va3NJbnN0YWxsZWQpIHtcbiAgICAgICAgICBsb2dnZXIuaW5mbygnSW5zdGFsbGluZyBHaXQgaG9va3MgaW4gd29ya3RyZWUnKTtcbiAgICAgICAgICBjb25zdCBpbnN0YWxsUmVzdWx0ID0gYXdhaXQgaW5zdGFsbEdpdEhvb2tzKGZvbGxvd1BhdGgpO1xuICAgICAgICAgIGlmICghaW5zdGFsbFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignRmFpbGVkIHRvIGluc3RhbGwgR2l0IGhvb2tzIGluIHdvcmt0cmVlLCBjb250aW51aW5nIGFueXdheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9uIHRvIE1hYyBhcHBcbiAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgY29uc3Qgbm90aWZpY2F0aW9uID0gY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnbm90aWZpY2F0aW9uJywge1xuICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRm9sbG93IE1vZGUgRW5hYmxlZCcsXG4gICAgICAgICAgICBtZXNzYWdlOiBgTm93IGZvbGxvd2luZyAke2Rpc3BsYXlOYW1lfSBpbiAke3BhdGguYmFzZW5hbWUoYWJzb2x1dGVNYWluUmVwbyl9YCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBjb250cm9sVW5peEhhbmRsZXIuc2VuZFRvTWFjKG5vdGlmaWNhdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXNwb25zZTogR2l0Rm9sbG93UmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgICBjdXJyZW50QnJhbmNoOiBkaXNwbGF5TmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgc29ja2V0LndyaXRlKE1lc3NhZ2VCdWlsZGVyLmdpdEZvbGxvd1Jlc3BvbnNlKHJlc3BvbnNlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXNhYmxlIGZvbGxvdyBtb2RlXG4gICAgICAgIGF3YWl0IGV4ZWNHaXQoWydjb25maWcnLCAnLS1sb2NhbCcsICctLXVuc2V0JywgJ3ZpYmV0dW5uZWwuZm9sbG93V29ya3RyZWUnXSwge1xuICAgICAgICAgIGN3ZDogYWJzb2x1dGVNYWluUmVwbyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gR2V0IHRoZSB3b3JrdHJlZSBwYXRoIHRoYXQgd2FzIGJlaW5nIGZvbGxvd2VkXG4gICAgICAgIGxldCBmb2xsb3dlZFdvcmt0cmVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNHaXQoWydjb25maWcnLCAndmliZXR1bm5lbC5mb2xsb3dXb3JrdHJlZSddLCB7XG4gICAgICAgICAgICBjd2Q6IGFic29sdXRlTWFpblJlcG8sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgZm9sbG93ZWRXb3JrdHJlZSA9IHN0ZG91dC50cmltKCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIE5vIHdvcmt0cmVlIHdhcyBiZWluZyBmb2xsb3dlZFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVW5pbnN0YWxsIEdpdCBob29rcyBmcm9tIG1haW4gcmVwb1xuICAgICAgICBsb2dnZXIuaW5mbygnVW5pbnN0YWxsaW5nIEdpdCBob29rcyBmcm9tIG1haW4gcmVwb3NpdG9yeScpO1xuICAgICAgICBjb25zdCBtYWluVW5pbnN0YWxsUmVzdWx0ID0gYXdhaXQgdW5pbnN0YWxsR2l0SG9va3MoYWJzb2x1dGVNYWluUmVwbyk7XG5cbiAgICAgICAgLy8gQWxzbyB1bmluc3RhbGwgZnJvbSB3b3JrdHJlZSBpZiB3ZSBrbm93IHdoaWNoIG9uZSB3YXMgYmVpbmcgZm9sbG93ZWRcbiAgICAgICAgaWYgKGZvbGxvd2VkV29ya3RyZWUgJiYgZm9sbG93ZWRXb3JrdHJlZSAhPT0gYWJzb2x1dGVNYWluUmVwbykge1xuICAgICAgICAgIGxvZ2dlci5pbmZvKCdVbmluc3RhbGxpbmcgR2l0IGhvb2tzIGZyb20gd29ya3RyZWUnKTtcbiAgICAgICAgICBjb25zdCB3b3JrdHJlZVVuaW5zdGFsbFJlc3VsdCA9IGF3YWl0IHVuaW5zdGFsbEdpdEhvb2tzKGZvbGxvd2VkV29ya3RyZWUpO1xuICAgICAgICAgIGlmICghd29ya3RyZWVVbmluc3RhbGxSZXN1bHQuc3VjY2Vzcykge1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAgICdGYWlsZWQgdG8gdW5pbnN0YWxsIHNvbWUgR2l0IGhvb2tzIGZyb20gd29ya3RyZWU6JyxcbiAgICAgICAgICAgICAgd29ya3RyZWVVbmluc3RhbGxSZXN1bHQuZXJyb3JzXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghbWFpblVuaW5zdGFsbFJlc3VsdC5zdWNjZXNzKSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAnRmFpbGVkIHRvIHVuaW5zdGFsbCBzb21lIEdpdCBob29rcyBmcm9tIG1haW4gcmVwbzonLFxuICAgICAgICAgICAgbWFpblVuaW5zdGFsbFJlc3VsdC5lcnJvcnNcbiAgICAgICAgICApO1xuICAgICAgICAgIC8vIENvbnRpbnVlIGFueXdheSAtIGZvbGxvdyBtb2RlIGlzIHN0aWxsIGRpc2FibGVkXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0dpdCBob29rcyB1bmluc3RhbGxlZCBzdWNjZXNzZnVsbHkgZnJvbSBtYWluIHJlcG9zaXRvcnknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlbmQgbm90aWZpY2F0aW9uIHRvIE1hYyBhcHBcbiAgICAgICAgaWYgKGNvbnRyb2xVbml4SGFuZGxlci5pc01hY0FwcENvbm5lY3RlZCgpKSB7XG4gICAgICAgICAgY29uc3Qgbm90aWZpY2F0aW9uID0gY3JlYXRlQ29udHJvbEV2ZW50KCdzeXN0ZW0nLCAnbm90aWZpY2F0aW9uJywge1xuICAgICAgICAgICAgbGV2ZWw6ICdpbmZvJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRm9sbG93IE1vZGUgRGlzYWJsZWQnLFxuICAgICAgICAgICAgbWVzc2FnZTogYEZvbGxvdyBtb2RlIGRpc2FibGVkIGluICR7cGF0aC5iYXNlbmFtZShhYnNvbHV0ZU1haW5SZXBvKX1gLFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zZW5kVG9NYWMobm90aWZpY2F0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlOiBHaXRGb2xsb3dSZXNwb25zZSA9IHtcbiAgICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICB9O1xuICAgICAgICBzb2NrZXQud3JpdGUoTWVzc2FnZUJ1aWxkZXIuZ2l0Rm9sbG93UmVzcG9uc2UocmVzcG9uc2UpKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgcmVzcG9uc2U6IEdpdEZvbGxvd1Jlc3BvbnNlID0ge1xuICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgfTtcbiAgICAgIHNvY2tldC53cml0ZShNZXNzYWdlQnVpbGRlci5naXRGb2xsb3dSZXNwb25zZShyZXNwb25zZSkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBIYW5kbGUgR2l0IGV2ZW50IG5vdGlmaWNhdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVHaXRFdmVudE5vdGlmeShzb2NrZXQ6IG5ldC5Tb2NrZXQsIGV2ZW50OiBHaXRFdmVudE5vdGlmeSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxvZ2dlci5kZWJ1ZyhgR2l0IGV2ZW50IG5vdGlmaWNhdGlvbiByZWNlaXZlZDogJHtldmVudC50eXBlfSBmb3IgJHtldmVudC5yZXBvUGF0aH1gKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBGb3J3YXJkIHRoZSBldmVudCB0byB0aGUgSFRUUCBlbmRwb2ludCB3aGljaCBjb250YWlucyB0aGUgc3luYyBsb2dpY1xuICAgICAgY29uc3QgcG9ydCA9IHRoaXMuc2VydmVyUG9ydCB8fCA0MDIwO1xuICAgICAgY29uc3QgdXJsID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtwb3J0fS9hcGkvZ2l0L2V2ZW50YDtcblxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIHtcbiAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgcmVwb1BhdGg6IGV2ZW50LnJlcG9QYXRoLFxuICAgICAgICAgIGV2ZW50OiBldmVudC50eXBlLFxuICAgICAgICAgIC8vIEJyYW5jaCBpbmZvcm1hdGlvbiB3b3VsZCBuZWVkIHRvIGJlIGV4dHJhY3RlZCBmcm9tIGdpdCBob29rc1xuICAgICAgICAgIC8vIEZvciBub3csIHdlJ2xsIGxldCB0aGUgZW5kcG9pbnQgaGFuZGxlIGJyYW5jaCBkZXRlY3Rpb25cbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZW5kcG9pbnQgcmV0dXJuZWQgJHtyZXNwb25zZS5zdGF0dXN9OiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnR2l0IGV2ZW50IHByb2Nlc3NlZCBzdWNjZXNzZnVsbHk6JywgcmVzdWx0KTtcblxuICAgICAgY29uc3QgYWNrOiBHaXRFdmVudEFjayA9IHtcbiAgICAgICAgaGFuZGxlZDogdHJ1ZSxcbiAgICAgIH07XG4gICAgICBzb2NrZXQud3JpdGUoTWVzc2FnZUJ1aWxkZXIuZ2l0RXZlbnRBY2soYWNrKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGZvcndhcmQgZ2l0IGV2ZW50IHRvIEhUVFAgZW5kcG9pbnQ6JywgZXJyb3IpO1xuXG4gICAgICBjb25zdCBhY2s6IEdpdEV2ZW50QWNrID0ge1xuICAgICAgICBoYW5kbGVkOiBmYWxzZSxcbiAgICAgIH07XG4gICAgICBzb2NrZXQud3JpdGUoTWVzc2FnZUJ1aWxkZXIuZ2l0RXZlbnRBY2soYWNrKSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgZXJyb3IgcmVzcG9uc2VcbiAgICovXG4gIHByaXZhdGUgc2VuZEVycm9yKHNvY2tldDogbmV0LlNvY2tldCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gICAgc29ja2V0LndyaXRlKE1lc3NhZ2VCdWlsZGVyLmVycm9yKCdBUElfRVJST1InLCBtZXNzYWdlKSk7XG4gIH1cbn1cblxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxuZXhwb3J0IGNvbnN0IGFwaVNvY2tldFNlcnZlciA9IG5ldyBBcGlTb2NrZXRTZXJ2ZXIoKTtcbiJdfQ==