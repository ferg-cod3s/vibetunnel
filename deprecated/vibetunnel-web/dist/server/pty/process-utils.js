"use strict";
/**
 * ProcessUtils - Cross-platform process management utilities
 *
 * Provides reliable process existence checking across Windows, macOS, and Linux.
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessUtils = void 0;
exports.isProcessRunning = isProcessRunning;
exports.getProcessInfo = getProcessInfo;
exports.killProcess = killProcess;
exports.waitForProcessExit = waitForProcessExit;
exports.resolveCommand = resolveCommand;
exports.getUserShell = getUserShell;
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('process-utils');
/**
 * Get the appropriate shell configuration file for a given shell
 * @param shellPath The path to the shell executable
 * @returns The path to the shell config file, or null if none found
 */
function getShellConfigFile(shellPath) {
    const homeDir = os.homedir();
    const shellName = path.basename(shellPath);
    // Map of shell names to their config files (in order of preference)
    const shellConfigs = {
        zsh: ['.zshrc', '.zshenv'],
        bash: ['.bashrc', '.bash_profile', '.profile'],
        sh: ['.profile'],
        ksh: ['.kshrc', '.profile'],
        fish: ['.config/fish/config.fish'],
        tcsh: ['.tcshrc', '.cshrc'],
        csh: ['.cshrc'],
        dash: ['.profile'],
    };
    // Get config files for this shell
    const configFiles = shellConfigs[shellName] || [];
    // Check each config file in order of preference
    for (const configFile of configFiles) {
        const fullPath = path.join(homeDir, configFile);
        if (existsSync(fullPath)) {
            return fullPath;
        }
    }
    // Fallback to .profile for unknown shells
    const profilePath = path.join(homeDir, '.profile');
    if (existsSync(profilePath)) {
        return profilePath;
    }
    return null;
}
/**
 * Safe file existence check
 */
function existsSync(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if a process is currently running by PID
 * Uses platform-appropriate methods for reliable detection
 */
function isProcessRunning(pid) {
    if (!pid || pid <= 0) {
        return false;
    }
    try {
        if (process.platform === 'win32') {
            // Windows: Use tasklist command
            return isProcessRunningWindows(pid);
        }
        else {
            // Unix/Linux/macOS: Use kill with signal 0
            return isProcessRunningUnix(pid);
        }
    }
    catch (error) {
        logger.warn(`error checking if process ${pid} is running:`, error);
        return false;
    }
}
/**
 * Windows-specific process check using tasklist
 */
function isProcessRunningWindows(pid) {
    try {
        logger.debug(`checking windows process ${pid} with tasklist`);
        const result = (0, child_process_1.spawnSync)('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000, // 5 second timeout
        });
        // Check if the command succeeded and PID appears in output
        if (result.status === 0 && result.stdout) {
            // tasklist outputs CSV format with PID in quotes
            const exists = result.stdout.includes(`"${pid}"`);
            logger.debug(`process ${pid} exists: ${exists}`);
            return exists;
        }
        logger.debug(`tasklist command failed with status ${result.status}`);
        return false;
    }
    catch (error) {
        logger.warn(`windows process check failed for PID ${pid}:`, error);
        return false;
    }
}
/**
 * Unix-like systems process check using kill signal 0
 */
function isProcessRunningUnix(pid) {
    try {
        // Send signal 0 to check if process exists
        // This doesn't actually kill the process, just checks existence
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        // If we get ESRCH, the process doesn't exist
        // If we get EPERM, the process exists but we don't have permission
        const err = error;
        if (err.code === 'EPERM') {
            // Process exists but we don't have permission to signal it
            return true;
        }
        // ESRCH or other errors mean process doesn't exist
        return false;
    }
}
/**
 * Get basic process information if available
 * Returns null if process is not running or info cannot be retrieved
 */
function getProcessInfo(pid) {
    if (!isProcessRunning(pid)) {
        return null;
    }
    return {
        pid,
        exists: true,
    };
}
/**
 * Kill a process with platform-appropriate method
 * Returns true if the kill signal was sent successfully
 */
function killProcess(pid, signal = 'SIGTERM') {
    if (!pid || pid <= 0) {
        return false;
    }
    logger.debug(`attempting to kill process ${pid} with signal ${signal}`);
    try {
        if (process.platform === 'win32') {
            // Windows: Use taskkill command for more reliable termination
            const result = (0, child_process_1.spawnSync)('taskkill', ['/PID', pid.toString(), '/F'], {
                windowsHide: true,
                timeout: 5000,
            });
            if (result.status === 0) {
                logger.log(chalk_1.default.green(`process ${pid} killed successfully`));
                return true;
            }
            else {
                logger.debug(`taskkill failed with status ${result.status}`);
                return false;
            }
        }
        else {
            // Unix-like: Use built-in process.kill
            process.kill(pid, signal);
            logger.log(chalk_1.default.green(`signal ${signal} sent to process ${pid}`));
            return true;
        }
    }
    catch (error) {
        logger.warn(`error killing process ${pid}:`, error);
        return false;
    }
}
/**
 * Wait for a process to exit with timeout
 * Returns true if process exited within timeout, false otherwise
 */
async function waitForProcessExit(pid, timeoutMs = 5000) {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    logger.debug(`waiting for process ${pid} to exit (timeout: ${timeoutMs}ms)`);
    while (Date.now() - startTime < timeoutMs) {
        if (!isProcessRunning(pid)) {
            const elapsed = Date.now() - startTime;
            logger.log(chalk_1.default.green(`process ${pid} exited after ${elapsed}ms`));
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }
    logger.log(chalk_1.default.yellow(`process ${pid} did not exit within ${timeoutMs}ms timeout`));
    return false;
}
/**
 * Check if this is an interactive shell session
 */
function isInteractiveShellCommand(cmdName, args) {
    // Common shells
    const shells = ['bash', 'zsh', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'csh'];
    const isShell = shells.some((shell) => cmdName === shell || cmdName.endsWith(`/${shell}`));
    if (!isShell)
        return false;
    // Check for interactive flags
    const interactiveFlags = ['-i', '--interactive', '-l', '--login'];
    // If no args, it's interactive by default
    if (args.length === 0)
        return true;
    // Check if any args indicate interactive mode
    return args.some((arg) => interactiveFlags.includes(arg));
}
/**
 * Determine how to spawn a command, checking if it exists in PATH or needs shell execution
 * Returns the actual command and args to use for spawning
 */
function resolveCommand(command) {
    if (command.length === 0) {
        throw new Error('No command provided');
    }
    const cmdName = command[0];
    const cmdArgs = command.slice(1);
    // Check if command exists in PATH using 'which' (Unix) or 'where' (Windows)
    const whichCommand = process.platform === 'win32' ? 'where' : 'which';
    try {
        const result = (0, child_process_1.spawnSync)(whichCommand, [cmdName], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 2000, // 2 second timeout
        });
        if (result.status === 0 && result.stdout && result.stdout.trim()) {
            // Command found in PATH
            logger.debug(`Command '${cmdName}' found at: ${result.stdout.trim()}`);
            // Check if this is an interactive shell command
            if (isInteractiveShellCommand(cmdName, cmdArgs)) {
                logger.log(chalk_1.default.cyan(`✓ Starting ${cmdName} as login shell to load configuration files`));
                // Add both -i (interactive) and -l/--login flags for proper shell initialization
                // This ensures shell RC files are sourced and the environment is properly set up
                // Don't add flags if they're already present
                const hasInteractiveFlag = cmdArgs.some((arg) => arg === '-i' || arg === '--interactive');
                const hasLoginFlag = cmdArgs.some((arg) => arg === '-l' || arg === '--login');
                // Build args array
                const finalArgs = [...cmdArgs];
                // For fish shell, use --login and --interactive instead of -l and -i
                const isFish = cmdName === 'fish' || cmdName.endsWith('/fish');
                if (!hasInteractiveFlag) {
                    finalArgs.unshift(isFish ? '--interactive' : '-i');
                }
                if (!hasLoginFlag) {
                    finalArgs.unshift(isFish ? '--login' : '-l');
                }
                return {
                    command: cmdName,
                    args: finalArgs,
                    useShell: false,
                    resolvedFrom: 'path',
                    originalCommand: cmdName,
                    isInteractive: true,
                };
            }
            return {
                command: cmdName,
                args: cmdArgs,
                useShell: false,
                resolvedFrom: 'path',
                originalCommand: cmdName,
            };
        }
    }
    catch (error) {
        logger.debug(`Failed to check command existence for '${cmdName}':`, error);
    }
    // Command not found in PATH, likely an alias or shell builtin
    // Need to run through shell
    logger.debug(`Command '${cmdName}' not found in PATH, will use shell`);
    // Determine user's shell
    const userShell = getUserShell();
    // Check if this is trying to execute a command (not an interactive shell session)
    // If so, use non-interactive mode to ensure shell exits after execution
    const isCommand = !isInteractiveShellCommand(cmdName, cmdArgs);
    // Use interactive shell to execute the command
    // This ensures aliases and shell functions are available
    if (process.platform === 'win32') {
        // Windows shells have different syntax
        if (userShell.includes('bash')) {
            // Git Bash on Windows: Use Unix-style syntax
            if (isCommand) {
                // Non-interactive command execution
                return {
                    command: userShell,
                    args: ['-c', command.join(' ')],
                    useShell: true,
                    resolvedFrom: 'shell',
                };
            }
            else {
                // Interactive shell session
                return {
                    command: userShell,
                    args: ['-i', '-c', command.join(' ')],
                    useShell: true,
                    resolvedFrom: 'shell',
                    isInteractive: true,
                };
            }
        }
        else if (userShell.includes('pwsh') || userShell.includes('powershell')) {
            // PowerShell: Use -Command for execution
            // Note: PowerShell aliases work differently than Unix aliases
            return {
                command: userShell,
                args: ['-NoLogo', '-Command', command.join(' ')],
                useShell: true,
                resolvedFrom: 'shell',
            };
        }
        else {
            // cmd.exe: Use /C to execute and exit
            // Note: cmd.exe uses 'doskey' for aliases, not traditional aliases
            return {
                command: userShell,
                args: ['/C', command.join(' ')],
                useShell: true,
                resolvedFrom: 'shell',
            };
        }
    }
    else {
        // Unix shells: Choose execution mode based on command type
        if (isCommand) {
            // Non-interactive command execution: shell will exit after completion
            // Use interactive mode to ensure aliases and functions are properly expanded
            const shellConfig = getShellConfigFile(userShell);
            if (shellConfig) {
                // Use interactive mode with login shell to ensure aliases are loaded and expanded
                // The -i flag enables interactive mode, which loads aliases
                // The -l flag makes it a login shell, ensuring profile/rc files are sourced
                return {
                    command: userShell,
                    args: ['-i', '-l', '-c', command.join(' ')],
                    useShell: true,
                    resolvedFrom: 'alias',
                };
            }
            else {
                // No shell config found, use basic execution
                return {
                    command: userShell,
                    args: ['-c', command.join(' ')],
                    useShell: true,
                    resolvedFrom: 'shell',
                };
            }
        }
        else {
            // Interactive shell session: use -i and -l for proper initialization
            return {
                command: userShell,
                args: ['-i', '-l', '-c', command.join(' ')],
                useShell: true,
                resolvedFrom: 'shell',
                isInteractive: true,
            };
        }
    }
}
/**
 * Get the user's preferred shell
 * Falls back to sensible defaults if SHELL env var is not set
 */
function getUserShell() {
    // First try SHELL environment variable (most reliable on Unix)
    if (process.env.SHELL) {
        return process.env.SHELL;
    }
    // Platform-specific defaults
    if (process.platform === 'win32') {
        // Check for modern shells first
        // 1. Check for PowerShell Core (pwsh) - cross-platform version
        try {
            const result = (0, child_process_1.spawnSync)('pwsh', ['-Command', 'echo test'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 1000,
            });
            if (result.status === 0) {
                return 'pwsh';
            }
        }
        catch (_) {
            // PowerShell Core not available
        }
        // 2. Check for Windows PowerShell (older, Windows-only)
        const powershellPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        try {
            const result = (0, child_process_1.spawnSync)(powershellPath, ['-Command', 'echo test'], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 1000,
            });
            if (result.status === 0) {
                return powershellPath;
            }
        }
        catch (_) {
            // PowerShell not available
        }
        // 3. Check for Git Bash if available
        const gitBashPaths = [
            'C:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
            path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
        ];
        for (const gitBashPath of gitBashPaths) {
            try {
                const result = (0, child_process_1.spawnSync)(gitBashPath, ['-c', 'echo test'], {
                    encoding: 'utf8',
                    windowsHide: true,
                    timeout: 1000,
                });
                if (result.status === 0) {
                    return gitBashPath;
                }
            }
            catch (_) {
                // Git Bash not at this location
            }
        }
        // 4. Fall back to cmd.exe
        return process.env.ComSpec || 'cmd.exe';
    }
    else {
        // Unix-like systems
        // Node.js os.userInfo() includes shell on some platforms
        try {
            const userInfo = os.userInfo();
            if ('shell' in userInfo && userInfo.shell) {
                return userInfo.shell;
            }
        }
        catch (_) {
            // userInfo might fail in some environments
        }
        // Check common shell paths in order of preference
        // Prefer bash over zsh to avoid first-run configuration issues in CI
        const commonShells = ['/bin/bash', '/usr/bin/bash', '/bin/zsh', '/usr/bin/zsh', '/bin/sh'];
        for (const shell of commonShells) {
            try {
                // Just check if the shell exists and is executable
                const result = (0, child_process_1.spawnSync)('test', ['-x', shell], {
                    encoding: 'utf8',
                    timeout: 500,
                });
                if (result.status === 0) {
                    return shell;
                }
            }
            catch (_) {
                // test command failed, try next shell
            }
        }
        // Final fallback - /bin/sh should always exist on Unix
        return '/bin/sh';
    }
}
// Re-export as object for backwards compatibility
exports.ProcessUtils = {
    isProcessRunning,
    getProcessInfo,
    killProcess,
    waitForProcessExit,
    resolveCommand,
    getUserShell,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzcy11dGlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcHR5L3Byb2Nlc3MtdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW9FSCw0Q0FpQkM7QUF3REQsd0NBU0M7QUFNRCxrQ0ErQkM7QUFNRCxnREFpQkM7QUEwQkQsd0NBc0tDO0FBTUQsb0NBcUdDO0FBM2ZELGtEQUEwQjtBQUMxQixpREFBMEM7QUFDMUMsdUNBQXlCO0FBQ3pCLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0Isa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxlQUFlLENBQUMsQ0FBQztBQUU3Qzs7OztHQUlHO0FBQ0gsU0FBUyxrQkFBa0IsQ0FBQyxTQUFpQjtJQUMzQyxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDN0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUUzQyxvRUFBb0U7SUFDcEUsTUFBTSxZQUFZLEdBQTZCO1FBQzdDLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUM7UUFDMUIsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLGVBQWUsRUFBRSxVQUFVLENBQUM7UUFDOUMsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDO1FBQ2hCLEdBQUcsRUFBRSxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUM7UUFDM0IsSUFBSSxFQUFFLENBQUMsMEJBQTBCLENBQUM7UUFDbEMsSUFBSSxFQUFFLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQztRQUMzQixHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUM7UUFDZixJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUM7S0FDbkIsQ0FBQztJQUVGLGtDQUFrQztJQUNsQyxNQUFN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RSxVQUFVLEVBQUUsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzNGLEtBQUssTUFBTSxLQUFLLElBQUksWUFBWSxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDO2dCQUNILG1EQUFtRDtnQkFDbkQsTUFBTSxNQUFNLEdBQUcsSUFBQSx5QkFBUyxFQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRTtvQkFDOUMsUUFBUSxFQUFFLE1BQU07b0JBQ2hCLE9BQU8sRUFBRSxHQUFHO2lCQUNiLENBQUMsQ0FBQztnQkFDSCxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3hCLE9BQU8sS0FBSyxDQUFDO2dCQUNmLENBQUM7WUFDSCxDQUFDO1lBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDWCxzQ0FBc0M7WUFDeEMsQ0FBQztRQUNILENBQUM7UUFFRCx1REFBdUQ7UUFDdkQsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztBQUNILENBQUM7QUFFRCxrREFBa0Q7QUFDckMsUUFBQSxZQUFZLEdBQUc7SUFDMUIsZ0JBQWdCO0lBQ2hCLGNBQWM7SUFDZCxXQUFXO0lBQ1gsa0JBQWtCO0lBQ2xCLGNBQWM7SUFDZCxZQUFZO0NBQ2IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUHJvY2Vzc1V0aWxzIC0gQ3Jvc3MtcGxhdGZvcm0gcHJvY2VzcyBtYW5hZ2VtZW50IHV0aWxpdGllc1xuICpcbiAqIFByb3ZpZGVzIHJlbGlhYmxlIHByb2Nlc3MgZXhpc3RlbmNlIGNoZWNraW5nIGFjcm9zcyBXaW5kb3dzLCBtYWNPUywgYW5kIExpbnV4LlxuICovXG5cbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgeyBzcGF3blN5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3Byb2Nlc3MtdXRpbHMnKTtcblxuLyoqXG4gKiBHZXQgdGhlIGFwcHJvcHJpYXRlIHNoZWxsIGNvbmZpZ3VyYXRpb24gZmlsZSBmb3IgYSBnaXZlbiBzaGVsbFxuICogQHBhcmFtIHNoZWxsUGF0aCBUaGUgcGF0aCB0byB0aGUgc2hlbGwgZXhlY3V0YWJsZVxuICogQHJldHVybnMgVGhlIHBhdGggdG8gdGhlIHNoZWxsIGNvbmZpZyBmaWxlLCBvciBudWxsIGlmIG5vbmUgZm91bmRcbiAqL1xuZnVuY3Rpb24gZ2V0U2hlbGxDb25maWdGaWxlKHNoZWxsUGF0aDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG4gIGNvbnN0IGhvbWVEaXIgPSBvcy5ob21lZGlyKCk7XG4gIGNvbnN0IHNoZWxsTmFtZSA9IHBhdGguYmFzZW5hbWUoc2hlbGxQYXRoKTtcblxuICAvLyBNYXAgb2Ygc2hlbGwgbmFtZXMgdG8gdGhlaXIgY29uZmlnIGZpbGVzIChpbiBvcmRlciBvZiBwcmVmZXJlbmNlKVxuICBjb25zdCBzaGVsbENvbmZpZ3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgICB6c2g6IFsnLnpzaHJjJywgJy56c2hlbnYnXSxcbiAgICBiYXNoOiBbJy5iYXNocmMnLCAnLmJhc2hfcHJvZmlsZScsICcucHJvZmlsZSddLFxuICAgIHNoOiBbJy5wcm9maWxlJ10sXG4gICAga3NoOiBbJy5rc2hyYycsICcucHJvZmlsZSddLFxuICAgIGZpc2g6IFsnLmNvbmZpZy9maXNoL2NvbmZpZy5maXNoJ10sXG4gICAgdGNzaDogWycudGNzaHJjJywgJy5jc2hyYyddLFxuICAgIGNzaDogWycuY3NocmMnXSxcbiAgICBkYXNoOiBbJy5wcm9maWxlJ10sXG4gIH07XG5cbiAgLy8gR2V0IGNvbmZpZyBmaWxlcyBmb3IgdGhpcyBzaGVsbFxuICBjb25zdCBjb25maWdGaWxlcyA9IHNoZWxsQ29uZmlnc1tzaGVsbE5hbWVdIHx8IFtdO1xuXG4gIC8vIENoZWNrIGVhY2ggY29uZmlnIGZpbGUgaW4gb3JkZXIgb2YgcHJlZmVyZW5jZVxuICBmb3IgKGNvbnN0IGNvbmZpZ0ZpbGUgb2YgY29uZmlnRmlsZXMpIHtcbiAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihob21lRGlyLCBjb25maWdGaWxlKTtcbiAgICBpZiAoZXhpc3RzU3luYyhmdWxsUGF0aCkpIHtcbiAgICAgIHJldHVybiBmdWxsUGF0aDtcbiAgICB9XG4gIH1cblxuICAvLyBGYWxsYmFjayB0byAucHJvZmlsZSBmb3IgdW5rbm93biBzaGVsbHNcbiAgY29uc3QgcHJvZmlsZVBhdGggPSBwYXRoLmpvaW4oaG9tZURpciwgJy5wcm9maWxlJyk7XG4gIGlmIChleGlzdHNTeW5jKHByb2ZpbGVQYXRoKSkge1xuICAgIHJldHVybiBwcm9maWxlUGF0aDtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIFNhZmUgZmlsZSBleGlzdGVuY2UgY2hlY2tcbiAqL1xuZnVuY3Rpb24gZXhpc3RzU3luYyhmaWxlUGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgZnMuYWNjZXNzU3luYyhmaWxlUGF0aCwgZnMuY29uc3RhbnRzLkZfT0spO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIHByb2Nlc3MgaXMgY3VycmVudGx5IHJ1bm5pbmcgYnkgUElEXG4gKiBVc2VzIHBsYXRmb3JtLWFwcHJvcHJpYXRlIG1ldGhvZHMgZm9yIHJlbGlhYmxlIGRldGVjdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNQcm9jZXNzUnVubmluZyhwaWQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAoIXBpZCB8fCBwaWQgPD0gMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHRyeSB7XG4gICAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpIHtcbiAgICAgIC8vIFdpbmRvd3M6IFVzZSB0YXNrbGlzdCBjb21tYW5kXG4gICAgICByZXR1cm4gaXNQcm9jZXNzUnVubmluZ1dpbmRvd3MocGlkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVW5peC9MaW51eC9tYWNPUzogVXNlIGtpbGwgd2l0aCBzaWduYWwgMFxuICAgICAgcmV0dXJuIGlzUHJvY2Vzc1J1bm5pbmdVbml4KHBpZCk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci53YXJuKGBlcnJvciBjaGVja2luZyBpZiBwcm9jZXNzICR7cGlkfSBpcyBydW5uaW5nOmAsIGVycm9yKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBXaW5kb3dzLXNwZWNpZmljIHByb2Nlc3MgY2hlY2sgdXNpbmcgdGFza2xpc3RcbiAqL1xuZnVuY3Rpb24gaXNQcm9jZXNzUnVubmluZ1dpbmRvd3MocGlkOiBudW1iZXIpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBsb2dnZXIuZGVidWcoYGNoZWNraW5nIHdpbmRvd3MgcHJvY2VzcyAke3BpZH0gd2l0aCB0YXNrbGlzdGApO1xuICAgIGNvbnN0IHJlc3VsdCA9IHNwYXduU3luYygndGFza2xpc3QnLCBbJy9GSScsIGBQSUQgZXEgJHtwaWR9YCwgJy9OSCcsICcvRk8nLCAnQ1NWJ10sIHtcbiAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcbiAgICAgIHRpbWVvdXQ6IDUwMDAsIC8vIDUgc2Vjb25kIHRpbWVvdXRcbiAgICB9KTtcblxuICAgIC8vIENoZWNrIGlmIHRoZSBjb21tYW5kIHN1Y2NlZWRlZCBhbmQgUElEIGFwcGVhcnMgaW4gb3V0cHV0XG4gICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IDAgJiYgcmVzdWx0LnN0ZG91dCkge1xuICAgICAgLy8gdGFza2xpc3Qgb3V0cHV0cyBDU1YgZm9ybWF0IHdpdGggUElEIGluIHF1b3Rlc1xuICAgICAgY29uc3QgZXhpc3RzID0gcmVzdWx0LnN0ZG91dC5pbmNsdWRlcyhgXCIke3BpZH1cImApO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBwcm9jZXNzICR7cGlkfSBleGlzdHM6ICR7ZXhpc3RzfWApO1xuICAgICAgcmV0dXJuIGV4aXN0cztcbiAgICB9XG5cbiAgICBsb2dnZXIuZGVidWcoYHRhc2tsaXN0IGNvbW1hbmQgZmFpbGVkIHdpdGggc3RhdHVzICR7cmVzdWx0LnN0YXR1c31gKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLndhcm4oYHdpbmRvd3MgcHJvY2VzcyBjaGVjayBmYWlsZWQgZm9yIFBJRCAke3BpZH06YCwgZXJyb3IpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIFVuaXgtbGlrZSBzeXN0ZW1zIHByb2Nlc3MgY2hlY2sgdXNpbmcga2lsbCBzaWduYWwgMFxuICovXG5mdW5jdGlvbiBpc1Byb2Nlc3NSdW5uaW5nVW5peChwaWQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIC8vIFNlbmQgc2lnbmFsIDAgdG8gY2hlY2sgaWYgcHJvY2VzcyBleGlzdHNcbiAgICAvLyBUaGlzIGRvZXNuJ3QgYWN0dWFsbHkga2lsbCB0aGUgcHJvY2VzcywganVzdCBjaGVja3MgZXhpc3RlbmNlXG4gICAgcHJvY2Vzcy5raWxsKHBpZCwgMCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSWYgd2UgZ2V0IEVTUkNILCB0aGUgcHJvY2VzcyBkb2Vzbid0IGV4aXN0XG4gICAgLy8gSWYgd2UgZ2V0IEVQRVJNLCB0aGUgcHJvY2VzcyBleGlzdHMgYnV0IHdlIGRvbid0IGhhdmUgcGVybWlzc2lvblxuICAgIGNvbnN0IGVyciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcbiAgICBpZiAoZXJyLmNvZGUgPT09ICdFUEVSTScpIHtcbiAgICAgIC8vIFByb2Nlc3MgZXhpc3RzIGJ1dCB3ZSBkb24ndCBoYXZlIHBlcm1pc3Npb24gdG8gc2lnbmFsIGl0XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gRVNSQ0ggb3Igb3RoZXIgZXJyb3JzIG1lYW4gcHJvY2VzcyBkb2Vzbid0IGV4aXN0XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogR2V0IGJhc2ljIHByb2Nlc3MgaW5mb3JtYXRpb24gaWYgYXZhaWxhYmxlXG4gKiBSZXR1cm5zIG51bGwgaWYgcHJvY2VzcyBpcyBub3QgcnVubmluZyBvciBpbmZvIGNhbm5vdCBiZSByZXRyaWV2ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFByb2Nlc3NJbmZvKHBpZDogbnVtYmVyKTogeyBwaWQ6IG51bWJlcjsgZXhpc3RzOiBib29sZWFuIH0gfCBudWxsIHtcbiAgaWYgKCFpc1Byb2Nlc3NSdW5uaW5nKHBpZCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgcGlkLFxuICAgIGV4aXN0czogdHJ1ZSxcbiAgfTtcbn1cblxuLyoqXG4gKiBLaWxsIGEgcHJvY2VzcyB3aXRoIHBsYXRmb3JtLWFwcHJvcHJpYXRlIG1ldGhvZFxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBraWxsIHNpZ25hbCB3YXMgc2VudCBzdWNjZXNzZnVsbHlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGtpbGxQcm9jZXNzKHBpZDogbnVtYmVyLCBzaWduYWw6IE5vZGVKUy5TaWduYWxzIHwgbnVtYmVyID0gJ1NJR1RFUk0nKTogYm9vbGVhbiB7XG4gIGlmICghcGlkIHx8IHBpZCA8PSAwKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbG9nZ2VyLmRlYnVnKGBhdHRlbXB0aW5nIHRvIGtpbGwgcHJvY2VzcyAke3BpZH0gd2l0aCBzaWduYWwgJHtzaWduYWx9YCk7XG5cbiAgdHJ5IHtcbiAgICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJykge1xuICAgICAgLy8gV2luZG93czogVXNlIHRhc2traWxsIGNvbW1hbmQgZm9yIG1vcmUgcmVsaWFibGUgdGVybWluYXRpb25cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHNwYXduU3luYygndGFza2tpbGwnLCBbJy9QSUQnLCBwaWQudG9TdHJpbmcoKSwgJy9GJ10sIHtcbiAgICAgICAgd2luZG93c0hpZGU6IHRydWUsXG4gICAgICAgIHRpbWVvdXQ6IDUwMDAsXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAwKSB7XG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYHByb2Nlc3MgJHtwaWR9IGtpbGxlZCBzdWNjZXNzZnVsbHlgKSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGB0YXNra2lsbCBmYWlsZWQgd2l0aCBzdGF0dXMgJHtyZXN1bHQuc3RhdHVzfWApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVuaXgtbGlrZTogVXNlIGJ1aWx0LWluIHByb2Nlc3Mua2lsbFxuICAgICAgcHJvY2Vzcy5raWxsKHBpZCwgc2lnbmFsKTtcbiAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oYHNpZ25hbCAke3NpZ25hbH0gc2VudCB0byBwcm9jZXNzICR7cGlkfWApKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIud2FybihgZXJyb3Iga2lsbGluZyBwcm9jZXNzICR7cGlkfTpgLCBlcnJvcik7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogV2FpdCBmb3IgYSBwcm9jZXNzIHRvIGV4aXQgd2l0aCB0aW1lb3V0XG4gKiBSZXR1cm5zIHRydWUgaWYgcHJvY2VzcyBleGl0ZWQgd2l0aGluIHRpbWVvdXQsIGZhbHNlIG90aGVyd2lzZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvclByb2Nlc3NFeGl0KHBpZDogbnVtYmVyLCB0aW1lb3V0TXM6IG51bWJlciA9IDUwMDApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgY29uc3QgY2hlY2tJbnRlcnZhbCA9IDEwMDsgLy8gQ2hlY2sgZXZlcnkgMTAwbXNcblxuICBsb2dnZXIuZGVidWcoYHdhaXRpbmcgZm9yIHByb2Nlc3MgJHtwaWR9IHRvIGV4aXQgKHRpbWVvdXQ6ICR7dGltZW91dE1zfW1zKWApO1xuXG4gIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDwgdGltZW91dE1zKSB7XG4gICAgaWYgKCFpc1Byb2Nlc3NSdW5uaW5nKHBpZCkpIHtcbiAgICAgIGNvbnN0IGVsYXBzZWQgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgcHJvY2VzcyAke3BpZH0gZXhpdGVkIGFmdGVyICR7ZWxhcHNlZH1tc2ApKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBjaGVja0ludGVydmFsKSk7XG4gIH1cblxuICBsb2dnZXIubG9nKGNoYWxrLnllbGxvdyhgcHJvY2VzcyAke3BpZH0gZGlkIG5vdCBleGl0IHdpdGhpbiAke3RpbWVvdXRNc31tcyB0aW1lb3V0YCkpO1xuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhpcyBpcyBhbiBpbnRlcmFjdGl2ZSBzaGVsbCBzZXNzaW9uXG4gKi9cbmZ1bmN0aW9uIGlzSW50ZXJhY3RpdmVTaGVsbENvbW1hbmQoY21kTmFtZTogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuICAvLyBDb21tb24gc2hlbGxzXG4gIGNvbnN0IHNoZWxscyA9IFsnYmFzaCcsICd6c2gnLCAnc2gnLCAnZmlzaCcsICdkYXNoJywgJ2tzaCcsICd0Y3NoJywgJ2NzaCddO1xuICBjb25zdCBpc1NoZWxsID0gc2hlbGxzLnNvbWUoKHNoZWxsKSA9PiBjbWROYW1lID09PSBzaGVsbCB8fCBjbWROYW1lLmVuZHNXaXRoKGAvJHtzaGVsbH1gKSk7XG5cbiAgaWYgKCFpc1NoZWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgLy8gQ2hlY2sgZm9yIGludGVyYWN0aXZlIGZsYWdzXG4gIGNvbnN0IGludGVyYWN0aXZlRmxhZ3MgPSBbJy1pJywgJy0taW50ZXJhY3RpdmUnLCAnLWwnLCAnLS1sb2dpbiddO1xuXG4gIC8vIElmIG5vIGFyZ3MsIGl0J3MgaW50ZXJhY3RpdmUgYnkgZGVmYXVsdFxuICBpZiAoYXJncy5sZW5ndGggPT09IDApIHJldHVybiB0cnVlO1xuXG4gIC8vIENoZWNrIGlmIGFueSBhcmdzIGluZGljYXRlIGludGVyYWN0aXZlIG1vZGVcbiAgcmV0dXJuIGFyZ3Muc29tZSgoYXJnKSA9PiBpbnRlcmFjdGl2ZUZsYWdzLmluY2x1ZGVzKGFyZykpO1xufVxuXG4vKipcbiAqIERldGVybWluZSBob3cgdG8gc3Bhd24gYSBjb21tYW5kLCBjaGVja2luZyBpZiBpdCBleGlzdHMgaW4gUEFUSCBvciBuZWVkcyBzaGVsbCBleGVjdXRpb25cbiAqIFJldHVybnMgdGhlIGFjdHVhbCBjb21tYW5kIGFuZCBhcmdzIHRvIHVzZSBmb3Igc3Bhd25pbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb21tYW5kKGNvbW1hbmQ6IHN0cmluZ1tdKToge1xuICBjb21tYW5kOiBzdHJpbmc7XG4gIGFyZ3M6IHN0cmluZ1tdO1xuICB1c2VTaGVsbDogYm9vbGVhbjtcbiAgaXNJbnRlcmFjdGl2ZT86IGJvb2xlYW47XG4gIHJlc29sdmVkRnJvbT86ICdwYXRoJyB8ICdhbGlhcycgfCAnYnVpbHRpbicgfCAnc2hlbGwnO1xuICBvcmlnaW5hbENvbW1hbmQ/OiBzdHJpbmc7XG59IHtcbiAgaWYgKGNvbW1hbmQubGVuZ3RoID09PSAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBjb21tYW5kIHByb3ZpZGVkJyk7XG4gIH1cblxuICBjb25zdCBjbWROYW1lID0gY29tbWFuZFswXTtcbiAgY29uc3QgY21kQXJncyA9IGNvbW1hbmQuc2xpY2UoMSk7XG5cbiAgLy8gQ2hlY2sgaWYgY29tbWFuZCBleGlzdHMgaW4gUEFUSCB1c2luZyAnd2hpY2gnIChVbml4KSBvciAnd2hlcmUnIChXaW5kb3dzKVxuICBjb25zdCB3aGljaENvbW1hbmQgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ3doZXJlJyA6ICd3aGljaCc7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBzcGF3blN5bmMod2hpY2hDb21tYW5kLCBbY21kTmFtZV0sIHtcbiAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICB3aW5kb3dzSGlkZTogdHJ1ZSxcbiAgICAgIHRpbWVvdXQ6IDIwMDAsIC8vIDIgc2Vjb25kIHRpbWVvdXRcbiAgICB9KTtcblxuICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAwICYmIHJlc3VsdC5zdGRvdXQgJiYgcmVzdWx0LnN0ZG91dC50cmltKCkpIHtcbiAgICAgIC8vIENvbW1hbmQgZm91bmQgaW4gUEFUSFxuICAgICAgbG9nZ2VyLmRlYnVnKGBDb21tYW5kICcke2NtZE5hbWV9JyBmb3VuZCBhdDogJHtyZXN1bHQuc3Rkb3V0LnRyaW0oKX1gKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhbiBpbnRlcmFjdGl2ZSBzaGVsbCBjb21tYW5kXG4gICAgICBpZiAoaXNJbnRlcmFjdGl2ZVNoZWxsQ29tbWFuZChjbWROYW1lLCBjbWRBcmdzKSkge1xuICAgICAgICBsb2dnZXIubG9nKGNoYWxrLmN5YW4oYOKckyBTdGFydGluZyAke2NtZE5hbWV9IGFzIGxvZ2luIHNoZWxsIHRvIGxvYWQgY29uZmlndXJhdGlvbiBmaWxlc2ApKTtcbiAgICAgICAgLy8gQWRkIGJvdGggLWkgKGludGVyYWN0aXZlKSBhbmQgLWwvLS1sb2dpbiBmbGFncyBmb3IgcHJvcGVyIHNoZWxsIGluaXRpYWxpemF0aW9uXG4gICAgICAgIC8vIFRoaXMgZW5zdXJlcyBzaGVsbCBSQyBmaWxlcyBhcmUgc291cmNlZCBhbmQgdGhlIGVudmlyb25tZW50IGlzIHByb3Blcmx5IHNldCB1cFxuXG4gICAgICAgIC8vIERvbid0IGFkZCBmbGFncyBpZiB0aGV5J3JlIGFscmVhZHkgcHJlc2VudFxuICAgICAgICBjb25zdCBoYXNJbnRlcmFjdGl2ZUZsYWcgPSBjbWRBcmdzLnNvbWUoKGFyZykgPT4gYXJnID09PSAnLWknIHx8IGFyZyA9PT0gJy0taW50ZXJhY3RpdmUnKTtcbiAgICAgICAgY29uc3QgaGFzTG9naW5GbGFnID0gY21kQXJncy5zb21lKChhcmcpID0+IGFyZyA9PT0gJy1sJyB8fCBhcmcgPT09ICctLWxvZ2luJyk7XG5cbiAgICAgICAgLy8gQnVpbGQgYXJncyBhcnJheVxuICAgICAgICBjb25zdCBmaW5hbEFyZ3MgPSBbLi4uY21kQXJnc107XG5cbiAgICAgICAgLy8gRm9yIGZpc2ggc2hlbGwsIHVzZSAtLWxvZ2luIGFuZCAtLWludGVyYWN0aXZlIGluc3RlYWQgb2YgLWwgYW5kIC1pXG4gICAgICAgIGNvbnN0IGlzRmlzaCA9IGNtZE5hbWUgPT09ICdmaXNoJyB8fCBjbWROYW1lLmVuZHNXaXRoKCcvZmlzaCcpO1xuXG4gICAgICAgIGlmICghaGFzSW50ZXJhY3RpdmVGbGFnKSB7XG4gICAgICAgICAgZmluYWxBcmdzLnVuc2hpZnQoaXNGaXNoID8gJy0taW50ZXJhY3RpdmUnIDogJy1pJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWhhc0xvZ2luRmxhZykge1xuICAgICAgICAgIGZpbmFsQXJncy51bnNoaWZ0KGlzRmlzaCA/ICctLWxvZ2luJyA6ICctbCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjb21tYW5kOiBjbWROYW1lLFxuICAgICAgICAgIGFyZ3M6IGZpbmFsQXJncyxcbiAgICAgICAgICB1c2VTaGVsbDogZmFsc2UsXG4gICAgICAgICAgcmVzb2x2ZWRGcm9tOiAncGF0aCcsXG4gICAgICAgICAgb3JpZ2luYWxDb21tYW5kOiBjbWROYW1lLFxuICAgICAgICAgIGlzSW50ZXJhY3RpdmU6IHRydWUsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvbW1hbmQ6IGNtZE5hbWUsXG4gICAgICAgIGFyZ3M6IGNtZEFyZ3MsXG4gICAgICAgIHVzZVNoZWxsOiBmYWxzZSxcbiAgICAgICAgcmVzb2x2ZWRGcm9tOiAncGF0aCcsXG4gICAgICAgIG9yaWdpbmFsQ29tbWFuZDogY21kTmFtZSxcbiAgICAgIH07XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5kZWJ1ZyhgRmFpbGVkIHRvIGNoZWNrIGNvbW1hbmQgZXhpc3RlbmNlIGZvciAnJHtjbWROYW1lfSc6YCwgZXJyb3IpO1xuICB9XG5cbiAgLy8gQ29tbWFuZCBub3QgZm91bmQgaW4gUEFUSCwgbGlrZWx5IGFuIGFsaWFzIG9yIHNoZWxsIGJ1aWx0aW5cbiAgLy8gTmVlZCB0byBydW4gdGhyb3VnaCBzaGVsbFxuICBsb2dnZXIuZGVidWcoYENvbW1hbmQgJyR7Y21kTmFtZX0nIG5vdCBmb3VuZCBpbiBQQVRILCB3aWxsIHVzZSBzaGVsbGApO1xuXG4gIC8vIERldGVybWluZSB1c2VyJ3Mgc2hlbGxcbiAgY29uc3QgdXNlclNoZWxsID0gZ2V0VXNlclNoZWxsKCk7XG5cbiAgLy8gQ2hlY2sgaWYgdGhpcyBpcyB0cnlpbmcgdG8gZXhlY3V0ZSBhIGNvbW1hbmQgKG5vdCBhbiBpbnRlcmFjdGl2ZSBzaGVsbCBzZXNzaW9uKVxuICAvLyBJZiBzbywgdXNlIG5vbi1pbnRlcmFjdGl2ZSBtb2RlIHRvIGVuc3VyZSBzaGVsbCBleGl0cyBhZnRlciBleGVjdXRpb25cbiAgY29uc3QgaXNDb21tYW5kID0gIWlzSW50ZXJhY3RpdmVTaGVsbENvbW1hbmQoY21kTmFtZSwgY21kQXJncyk7XG5cbiAgLy8gVXNlIGludGVyYWN0aXZlIHNoZWxsIHRvIGV4ZWN1dGUgdGhlIGNvbW1hbmRcbiAgLy8gVGhpcyBlbnN1cmVzIGFsaWFzZXMgYW5kIHNoZWxsIGZ1bmN0aW9ucyBhcmUgYXZhaWxhYmxlXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgLy8gV2luZG93cyBzaGVsbHMgaGF2ZSBkaWZmZXJlbnQgc3ludGF4XG4gICAgaWYgKHVzZXJTaGVsbC5pbmNsdWRlcygnYmFzaCcpKSB7XG4gICAgICAvLyBHaXQgQmFzaCBvbiBXaW5kb3dzOiBVc2UgVW5peC1zdHlsZSBzeW50YXhcbiAgICAgIGlmIChpc0NvbW1hbmQpIHtcbiAgICAgICAgLy8gTm9uLWludGVyYWN0aXZlIGNvbW1hbmQgZXhlY3V0aW9uXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgY29tbWFuZDogdXNlclNoZWxsLFxuICAgICAgICAgIGFyZ3M6IFsnLWMnLCBjb21tYW5kLmpvaW4oJyAnKV0sXG4gICAgICAgICAgdXNlU2hlbGw6IHRydWUsXG4gICAgICAgICAgcmVzb2x2ZWRGcm9tOiAnc2hlbGwnLFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSW50ZXJhY3RpdmUgc2hlbGwgc2Vzc2lvblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNvbW1hbmQ6IHVzZXJTaGVsbCxcbiAgICAgICAgICBhcmdzOiBbJy1pJywgJy1jJywgY29tbWFuZC5qb2luKCcgJyldLFxuICAgICAgICAgIHVzZVNoZWxsOiB0cnVlLFxuICAgICAgICAgIHJlc29sdmVkRnJvbTogJ3NoZWxsJyxcbiAgICAgICAgICBpc0ludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodXNlclNoZWxsLmluY2x1ZGVzKCdwd3NoJykgfHwgdXNlclNoZWxsLmluY2x1ZGVzKCdwb3dlcnNoZWxsJykpIHtcbiAgICAgIC8vIFBvd2VyU2hlbGw6IFVzZSAtQ29tbWFuZCBmb3IgZXhlY3V0aW9uXG4gICAgICAvLyBOb3RlOiBQb3dlclNoZWxsIGFsaWFzZXMgd29yayBkaWZmZXJlbnRseSB0aGFuIFVuaXggYWxpYXNlc1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWFuZDogdXNlclNoZWxsLFxuICAgICAgICBhcmdzOiBbJy1Ob0xvZ28nLCAnLUNvbW1hbmQnLCBjb21tYW5kLmpvaW4oJyAnKV0sXG4gICAgICAgIHVzZVNoZWxsOiB0cnVlLFxuICAgICAgICByZXNvbHZlZEZyb206ICdzaGVsbCcsXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjbWQuZXhlOiBVc2UgL0MgdG8gZXhlY3V0ZSBhbmQgZXhpdFxuICAgICAgLy8gTm90ZTogY21kLmV4ZSB1c2VzICdkb3NrZXknIGZvciBhbGlhc2VzLCBub3QgdHJhZGl0aW9uYWwgYWxpYXNlc1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWFuZDogdXNlclNoZWxsLFxuICAgICAgICBhcmdzOiBbJy9DJywgY29tbWFuZC5qb2luKCcgJyldLFxuICAgICAgICB1c2VTaGVsbDogdHJ1ZSxcbiAgICAgICAgcmVzb2x2ZWRGcm9tOiAnc2hlbGwnLFxuICAgICAgfTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gVW5peCBzaGVsbHM6IENob29zZSBleGVjdXRpb24gbW9kZSBiYXNlZCBvbiBjb21tYW5kIHR5cGVcbiAgICBpZiAoaXNDb21tYW5kKSB7XG4gICAgICAvLyBOb24taW50ZXJhY3RpdmUgY29tbWFuZCBleGVjdXRpb246IHNoZWxsIHdpbGwgZXhpdCBhZnRlciBjb21wbGV0aW9uXG4gICAgICAvLyBVc2UgaW50ZXJhY3RpdmUgbW9kZSB0byBlbnN1cmUgYWxpYXNlcyBhbmQgZnVuY3Rpb25zIGFyZSBwcm9wZXJseSBleHBhbmRlZFxuICAgICAgY29uc3Qgc2hlbGxDb25maWcgPSBnZXRTaGVsbENvbmZpZ0ZpbGUodXNlclNoZWxsKTtcblxuICAgICAgaWYgKHNoZWxsQ29uZmlnKSB7XG4gICAgICAgIC8vIFVzZSBpbnRlcmFjdGl2ZSBtb2RlIHdpdGggbG9naW4gc2hlbGwgdG8gZW5zdXJlIGFsaWFzZXMgYXJlIGxvYWRlZCBhbmQgZXhwYW5kZWRcbiAgICAgICAgLy8gVGhlIC1pIGZsYWcgZW5hYmxlcyBpbnRlcmFjdGl2ZSBtb2RlLCB3aGljaCBsb2FkcyBhbGlhc2VzXG4gICAgICAgIC8vIFRoZSAtbCBmbGFnIG1ha2VzIGl0IGEgbG9naW4gc2hlbGwsIGVuc3VyaW5nIHByb2ZpbGUvcmMgZmlsZXMgYXJlIHNvdXJjZWRcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjb21tYW5kOiB1c2VyU2hlbGwsXG4gICAgICAgICAgYXJnczogWyctaScsICctbCcsICctYycsIGNvbW1hbmQuam9pbignICcpXSxcbiAgICAgICAgICB1c2VTaGVsbDogdHJ1ZSxcbiAgICAgICAgICByZXNvbHZlZEZyb206ICdhbGlhcycsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBObyBzaGVsbCBjb25maWcgZm91bmQsIHVzZSBiYXNpYyBleGVjdXRpb25cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjb21tYW5kOiB1c2VyU2hlbGwsXG4gICAgICAgICAgYXJnczogWyctYycsIGNvbW1hbmQuam9pbignICcpXSxcbiAgICAgICAgICB1c2VTaGVsbDogdHJ1ZSxcbiAgICAgICAgICByZXNvbHZlZEZyb206ICdzaGVsbCcsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEludGVyYWN0aXZlIHNoZWxsIHNlc3Npb246IHVzZSAtaSBhbmQgLWwgZm9yIHByb3BlciBpbml0aWFsaXphdGlvblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWFuZDogdXNlclNoZWxsLFxuICAgICAgICBhcmdzOiBbJy1pJywgJy1sJywgJy1jJywgY29tbWFuZC5qb2luKCcgJyldLFxuICAgICAgICB1c2VTaGVsbDogdHJ1ZSxcbiAgICAgICAgcmVzb2x2ZWRGcm9tOiAnc2hlbGwnLFxuICAgICAgICBpc0ludGVyYWN0aXZlOiB0cnVlLFxuICAgICAgfTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdGhlIHVzZXIncyBwcmVmZXJyZWQgc2hlbGxcbiAqIEZhbGxzIGJhY2sgdG8gc2Vuc2libGUgZGVmYXVsdHMgaWYgU0hFTEwgZW52IHZhciBpcyBub3Qgc2V0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRVc2VyU2hlbGwoKTogc3RyaW5nIHtcbiAgLy8gRmlyc3QgdHJ5IFNIRUxMIGVudmlyb25tZW50IHZhcmlhYmxlIChtb3N0IHJlbGlhYmxlIG9uIFVuaXgpXG4gIGlmIChwcm9jZXNzLmVudi5TSEVMTCkge1xuICAgIHJldHVybiBwcm9jZXNzLmVudi5TSEVMTDtcbiAgfVxuXG4gIC8vIFBsYXRmb3JtLXNwZWNpZmljIGRlZmF1bHRzXG4gIGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG4gICAgLy8gQ2hlY2sgZm9yIG1vZGVybiBzaGVsbHMgZmlyc3RcblxuICAgIC8vIDEuIENoZWNrIGZvciBQb3dlclNoZWxsIENvcmUgKHB3c2gpIC0gY3Jvc3MtcGxhdGZvcm0gdmVyc2lvblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXN1bHQgPSBzcGF3blN5bmMoJ3B3c2gnLCBbJy1Db21tYW5kJywgJ2VjaG8gdGVzdCddLCB7XG4gICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxuICAgICAgICB0aW1lb3V0OiAxMDAwLFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gJ3B3c2gnO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgIC8vIFBvd2VyU2hlbGwgQ29yZSBub3QgYXZhaWxhYmxlXG4gICAgfVxuXG4gICAgLy8gMi4gQ2hlY2sgZm9yIFdpbmRvd3MgUG93ZXJTaGVsbCAob2xkZXIsIFdpbmRvd3Mtb25seSlcbiAgICBjb25zdCBwb3dlcnNoZWxsUGF0aCA9IHBhdGguam9pbihcbiAgICAgIHByb2Nlc3MuZW52LlN5c3RlbVJvb3QgfHwgJ0M6XFxcXFdpbmRvd3MnLFxuICAgICAgJ1N5c3RlbTMyJyxcbiAgICAgICdXaW5kb3dzUG93ZXJTaGVsbCcsXG4gICAgICAndjEuMCcsXG4gICAgICAncG93ZXJzaGVsbC5leGUnXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKHBvd2Vyc2hlbGxQYXRoLCBbJy1Db21tYW5kJywgJ2VjaG8gdGVzdCddLCB7XG4gICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxuICAgICAgICB0aW1lb3V0OiAxMDAwLFxuICAgICAgfSk7XG4gICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gMCkge1xuICAgICAgICByZXR1cm4gcG93ZXJzaGVsbFBhdGg7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoXykge1xuICAgICAgLy8gUG93ZXJTaGVsbCBub3QgYXZhaWxhYmxlXG4gICAgfVxuXG4gICAgLy8gMy4gQ2hlY2sgZm9yIEdpdCBCYXNoIGlmIGF2YWlsYWJsZVxuICAgIGNvbnN0IGdpdEJhc2hQYXRocyA9IFtcbiAgICAgICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXEdpdFxcXFxiaW5cXFxcYmFzaC5leGUnLFxuICAgICAgJ0M6XFxcXFByb2dyYW0gRmlsZXMgKHg4NilcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZScsXG4gICAgICBwYXRoLmpvaW4ocHJvY2Vzcy5lbnYuUHJvZ3JhbUZpbGVzIHx8ICdDOlxcXFxQcm9ncmFtIEZpbGVzJywgJ0dpdCcsICdiaW4nLCAnYmFzaC5leGUnKSxcbiAgICBdO1xuICAgIGZvciAoY29uc3QgZ2l0QmFzaFBhdGggb2YgZ2l0QmFzaFBhdGhzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBzcGF3blN5bmMoZ2l0QmFzaFBhdGgsIFsnLWMnLCAnZWNobyB0ZXN0J10sIHtcbiAgICAgICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxuICAgICAgICAgIHRpbWVvdXQ6IDEwMDAsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gMCkge1xuICAgICAgICAgIHJldHVybiBnaXRCYXNoUGF0aDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAvLyBHaXQgQmFzaCBub3QgYXQgdGhpcyBsb2NhdGlvblxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIDQuIEZhbGwgYmFjayB0byBjbWQuZXhlXG4gICAgcmV0dXJuIHByb2Nlc3MuZW52LkNvbVNwZWMgfHwgJ2NtZC5leGUnO1xuICB9IGVsc2Uge1xuICAgIC8vIFVuaXgtbGlrZSBzeXN0ZW1zXG4gICAgLy8gTm9kZS5qcyBvcy51c2VySW5mbygpIGluY2x1ZGVzIHNoZWxsIG9uIHNvbWUgcGxhdGZvcm1zXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVzZXJJbmZvID0gb3MudXNlckluZm8oKTtcbiAgICAgIGlmICgnc2hlbGwnIGluIHVzZXJJbmZvICYmIHVzZXJJbmZvLnNoZWxsKSB7XG4gICAgICAgIHJldHVybiB1c2VySW5mby5zaGVsbCBhcyBzdHJpbmc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoXykge1xuICAgICAgLy8gdXNlckluZm8gbWlnaHQgZmFpbCBpbiBzb21lIGVudmlyb25tZW50c1xuICAgIH1cblxuICAgIC8vIENoZWNrIGNvbW1vbiBzaGVsbCBwYXRocyBpbiBvcmRlciBvZiBwcmVmZXJlbmNlXG4gICAgLy8gUHJlZmVyIGJhc2ggb3ZlciB6c2ggdG8gYXZvaWQgZmlyc3QtcnVuIGNvbmZpZ3VyYXRpb24gaXNzdWVzIGluIENJXG4gICAgY29uc3QgY29tbW9uU2hlbGxzID0gWycvYmluL2Jhc2gnLCAnL3Vzci9iaW4vYmFzaCcsICcvYmluL3pzaCcsICcvdXNyL2Jpbi96c2gnLCAnL2Jpbi9zaCddO1xuICAgIGZvciAoY29uc3Qgc2hlbGwgb2YgY29tbW9uU2hlbGxzKSB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBKdXN0IGNoZWNrIGlmIHRoZSBzaGVsbCBleGlzdHMgYW5kIGlzIGV4ZWN1dGFibGVcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gc3Bhd25TeW5jKCd0ZXN0JywgWycteCcsIHNoZWxsXSwge1xuICAgICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICAgICAgdGltZW91dDogNTAwLFxuICAgICAgICB9KTtcbiAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09IDApIHtcbiAgICAgICAgICByZXR1cm4gc2hlbGw7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgLy8gdGVzdCBjb21tYW5kIGZhaWxlZCwgdHJ5IG5leHQgc2hlbGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGaW5hbCBmYWxsYmFjayAtIC9iaW4vc2ggc2hvdWxkIGFsd2F5cyBleGlzdCBvbiBVbml4XG4gICAgcmV0dXJuICcvYmluL3NoJztcbiAgfVxufVxuXG4vLyBSZS1leHBvcnQgYXMgb2JqZWN0IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuZXhwb3J0IGNvbnN0IFByb2Nlc3NVdGlscyA9IHtcbiAgaXNQcm9jZXNzUnVubmluZyxcbiAgZ2V0UHJvY2Vzc0luZm8sXG4gIGtpbGxQcm9jZXNzLFxuICB3YWl0Rm9yUHJvY2Vzc0V4aXQsXG4gIHJlc29sdmVDb21tYW5kLFxuICBnZXRVc2VyU2hlbGwsXG59O1xuIl19