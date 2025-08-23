"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchClaudeBinary = patchClaudeBinary;
exports.checkAndPatchClaude = checkAndPatchClaude;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('claude-patcher');
// Track patched binaries for cleanup
const patchedBinaries = new Map(); // originalPath -> backupPath
/**
 * Restore all patched binaries from their backups
 */
function restoreAllBinaries() {
    for (const [originalPath, backupPath] of patchedBinaries.entries()) {
        try {
            if (fs_1.default.existsSync(backupPath)) {
                fs_1.default.copyFileSync(backupPath, originalPath);
                logger.debug(`Restored binary: ${originalPath}`);
                // Clean up temp backup file
                try {
                    fs_1.default.unlinkSync(backupPath);
                    logger.debug(`Cleaned up backup: ${backupPath}`);
                }
                catch (cleanupError) {
                    // Non-critical error, just log it
                    logger.debug(`Failed to clean up backup ${backupPath}:`, cleanupError);
                }
            }
        }
        catch (error) {
            logger.error(`Failed to restore binary ${originalPath}:`, error);
        }
    }
    patchedBinaries.clear();
}
// Set up cleanup handlers
let cleanupRegistered = false;
function registerCleanupHandlers() {
    if (cleanupRegistered)
        return;
    cleanupRegistered = true;
    const cleanup = () => {
        restoreAllBinaries();
    };
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
        cleanup();
        process.exit(130); // Standard exit code for SIGINT
    });
    process.on('SIGTERM', () => {
        cleanup();
        process.exit(143); // Standard exit code for SIGTERM
    });
}
function patchClaudeBinary(claudePath) {
    // Check if already patched
    if (patchedBinaries.has(claudePath)) {
        logger.debug(`Binary already patched: ${claudePath}`);
        return claudePath;
    }
    // Create a unique temp file for backup
    const claudeFilename = path_1.default.basename(claudePath);
    const tempDir = os_1.default.tmpdir();
    const backupPath = path_1.default.join(tempDir, `vibetunnel-claude-backup-${Date.now()}-${claudeFilename}`);
    // Create backup
    fs_1.default.copyFileSync(claudePath, backupPath);
    logger.debug(`Created backup at ${backupPath}`);
    // Read the Claude binary
    const content = fs_1.default.readFileSync(claudePath, 'utf8');
    // Multiple patterns to match different variations of anti-debugging checks
    const patterns = [
        // Standard pattern: if(PF5())process.exit(1);
        /if\([A-Za-z0-9_$]+\(\)\)process\.exit\(1\);/g,
        // With spaces: if (PF5()) process.exit(1);
        /if\s*\([A-Za-z0-9_$]+\(\)\)\s*process\.exit\(1\);/g,
        // Different exit codes: if(PF5())process.exit(2);
        /if\([A-Za-z0-9_$]+\(\)\)process\.exit\(\d+\);/g,
    ];
    let patchedContent = content;
    let patched = false;
    for (const pattern of patterns) {
        const newContent = patchedContent.replace(pattern, 'if(false)process.exit(1);');
        if (newContent !== patchedContent) {
            patchedContent = newContent;
            patched = true;
            logger.debug(`Applied patch for pattern: ${pattern}`);
        }
    }
    if (!patched) {
        logger.warn('No anti-debugging pattern found - Claude binary may have changed');
        return claudePath;
    }
    // Write patched version directly over the original
    fs_1.default.writeFileSync(claudePath, patchedContent);
    // Track this patched binary for cleanup
    patchedBinaries.set(claudePath, backupPath);
    registerCleanupHandlers();
    logger.log(`Patched Claude binary`);
    return claudePath;
}
/**
 * Checks if a command is the Claude CLI binary and patches it if necessary.
 *
 * @param command - The command array from fwd.ts (e.g., ["claude", "--resume"])
 * @returns The potentially patched command array
 */
function checkAndPatchClaude(command) {
    if (command.length === 0) {
        return command;
    }
    // Get the base command (first element)
    let baseCommand = command[0];
    logger.debug(`Checking command: ${baseCommand}`);
    // Step 1: Check if it's an alias and resolve it
    try {
        // Get the user's shell from SHELL env var, default to bash
        const userShell = process.env.SHELL || '/bin/bash';
        const shellName = path_1.default.basename(userShell);
        // First try to check if it's an alias using the user's shell
        const aliasCommand = shellName === 'zsh'
            ? `${userShell} -i -c "alias ${baseCommand} 2>/dev/null"`
            : `${userShell} -i -c "alias ${baseCommand} 2>&1"`;
        const aliasOutput = (0, child_process_1.execSync)(aliasCommand, {
            encoding: 'utf8',
        }).trim();
        if (aliasOutput && !aliasOutput.includes('not found')) {
            // Parse alias output (format may vary by shell)
            // zsh: alias name='command' or name=command
            // bash: alias name='command'
            const match = aliasOutput.match(/^(?:alias\s+)?[^=]+=["']?(.+?)["']?$/);
            if (match) {
                const aliasCommand = match[1].split(' ')[0];
                logger.debug(`Resolved alias: ${baseCommand} → ${aliasCommand}`);
                baseCommand = aliasCommand;
            }
        }
    }
    catch {
        // This is expected when alias doesn't exist
        logger.debug(`No alias found for: ${baseCommand}`);
    }
    // Step 2: Resolve the full path if it's not already absolute
    let resolvedPath = baseCommand;
    if (!path_1.default.isAbsolute(baseCommand)) {
        try {
            // Try to find the executable in PATH using which
            const whichOutput = (0, child_process_1.execSync)(`which "${baseCommand}" 2>/dev/null`, {
                encoding: 'utf8',
            }).trim();
            if (whichOutput) {
                resolvedPath = whichOutput;
                logger.debug(`Found in PATH: ${resolvedPath}`);
            }
            else {
                // Try command -v as a fallback
                try {
                    const commandOutput = (0, child_process_1.execSync)(`command -v "${baseCommand}" 2>/dev/null`, {
                        encoding: 'utf8',
                        shell: '/bin/sh',
                    }).trim();
                    if (commandOutput && commandOutput !== baseCommand) {
                        resolvedPath = commandOutput;
                        logger.debug(`Found via command -v: ${resolvedPath}`);
                    }
                }
                catch {
                    // command -v also failed
                }
            }
        }
        catch {
            // which failed, continue with current path
            logger.debug(`Could not find ${baseCommand} in PATH`);
        }
    }
    // Step 3: Check if it's a symlink and resolve it
    try {
        if (fs_1.default.existsSync(resolvedPath) && fs_1.default.lstatSync(resolvedPath).isSymbolicLink()) {
            const realPath = fs_1.default.realpathSync(resolvedPath);
            logger.debug(`Resolved symlink: ${resolvedPath} → ${realPath}`);
            resolvedPath = realPath;
        }
    }
    catch (error) {
        logger.debug(`Could not resolve symlink: ${error}`);
    }
    // Step 4: Check if this is the Claude CLI binary
    // We'll check for various indicators that this is Claude
    if (!fs_1.default.existsSync(resolvedPath)) {
        logger.debug(`Resolved path does not exist: ${resolvedPath}`);
        return command;
    }
    // Check if this is the Claude CLI by examining file content
    try {
        // Read the first 1KB of the file to check the header
        const fd = fs_1.default.openSync(resolvedPath, 'r');
        const buffer = Buffer.alloc(1024);
        const bytesRead = fs_1.default.readSync(fd, buffer, 0, 1024, 0);
        fs_1.default.closeSync(fd);
        const fileHeader = buffer.toString('utf8', 0, bytesRead);
        // Check for Claude CLI indicators:
        // 1. Shebang with node
        // 2. Anthropic copyright
        const isClaudeBinary = fileHeader.includes('#!/usr/bin/env') &&
            fileHeader.includes('node') &&
            fileHeader.includes('Anthropic PBC');
        if (!isClaudeBinary) {
            logger.debug(`Not a Claude CLI binary: ${path_1.default.basename(resolvedPath)}`);
            return command;
        }
        // Now read the full file to check for anti-debugging patterns
        const fullContent = fs_1.default.readFileSync(resolvedPath, 'utf8');
        const hasAntiDebugging = fullContent.includes('process.exit(1)') || fullContent.includes('PF5()');
        if (!hasAntiDebugging) {
            logger.debug(`Claude CLI detected but no anti-debugging patterns found`);
            return command;
        }
    }
    catch (error) {
        logger.debug(`Could not read file to verify Claude binary: ${error}`);
        return command;
    }
    // Step 5: It's Claude! Patch it
    logger.log(`Detected Claude CLI binary at: ${resolvedPath}`);
    const patchedPath = patchClaudeBinary(resolvedPath);
    // Return the command with the patched path
    const patchedCommand = [patchedPath, ...command.slice(1)];
    logger.log(`Using patched command: ${patchedCommand.join(' ')}`);
    return patchedCommand;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xhdWRlLXBhdGNoZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL2NsYXVkZS1wYXRjaGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBMERBLDhDQXVEQztBQVFELGtEQTBJQztBQW5RRCxpREFBeUM7QUFDekMsNENBQW9CO0FBQ3BCLDRDQUFvQjtBQUNwQixnREFBd0I7QUFDeEIsMkNBQTJDO0FBRTNDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBRTlDLHFDQUFxQztBQUNyQyxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQyxDQUFDLDZCQUE2QjtBQUVoRjs7R0FFRztBQUNILFNBQVMsa0JBQWtCO0lBQ3pCLEtBQUssTUFBTSxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUMsSUFBSSxlQUFlLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUNuRSxJQUFJLENBQUM7WUFDSCxJQUFJLFlBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFDOUIsWUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7Z0JBQzFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsb0JBQW9CLFlBQVksRUFBRSxDQUFDLENBQUM7Z0JBRWpELDRCQUE0QjtnQkFDNUIsSUFBSSxDQUFDO29CQUNILFlBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQzFCLE1BQU0sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLFVBQVUsRUFBRSxDQUFDLENBQUM7Z0JBQ25ELENBQUM7Z0JBQUMsT0FBTyxZQUFZLEVBQUUsQ0FBQztvQkFDdEIsa0NBQWtDO29CQUNsQyxNQUFNLENBQUMsS0FBSyxDQUFDLDZCQUE2QixVQUFVLEdBQUcsRUFBRSxZQUFZLENBQUMsQ0FBQztnQkFDekUsQ0FBQztZQUNILENBQUM7UUFDSCxD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QUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTNFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxLQUFLLENBQUMsMERBQTBELENBQUMsQ0FBQztZQUN6RSxPQUFPLE9BQU8sQ0FBQztRQUNqQixDQUFDO0lBQ0gsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLGdEQUFnRCxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxnQ0FBZ0M7SUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsWUFBWSxFQUFFLENBQUMsQ0FBQztJQUM3RCxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztJQUVwRCwyQ0FBMkM7SUFDM0MsTUFBTSxjQUFjLEdBQUcsQ0FBQyxXQUFXLEVBQUUsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUQsTUFBTSxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDakUsT0FBTyxjQUFjLENBQUM7QUFDeEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IG9zIGZyb20gJ29zJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ2NsYXVkZS1wYXRjaGVyJyk7XG5cbi8vIFRyYWNrIHBhdGNoZWQgYmluYXJpZXMgZm9yIGNsZWFudXBcbmNvbnN0IHBhdGNoZWRCaW5hcmllcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7IC8vIG9yaWdpbmFsUGF0aCAtPiBiYWNrdXBQYXRoXG5cbi8qKlxuICogUmVzdG9yZSBhbGwgcGF0Y2hlZCBiaW5hcmllcyBmcm9tIHRoZWlyIGJhY2t1cHNcbiAqL1xuZnVuY3Rpb24gcmVzdG9yZUFsbEJpbmFyaWVzKCkge1xuICBmb3IgKGNvbnN0IFtvcmlnaW5hbFBhdGgsIGJhY2t1cFBhdGhdIG9mIHBhdGNoZWRCaW5hcmllcy5lbnRyaWVzKCkpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoYmFja3VwUGF0aCkpIHtcbiAgICAgICAgZnMuY29weUZpbGVTeW5jKGJhY2t1cFBhdGgsIG9yaWdpbmFsUGF0aCk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgUmVzdG9yZWQgYmluYXJ5OiAke29yaWdpbmFsUGF0aH1gKTtcblxuICAgICAgICAvLyBDbGVhbiB1cCB0ZW1wIGJhY2t1cCBmaWxlXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZnMudW5saW5rU3luYyhiYWNrdXBQYXRoKTtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYENsZWFuZWQgdXAgYmFja3VwOiAke2JhY2t1cFBhdGh9YCk7XG4gICAgICAgIH0gY2F0Y2ggKGNsZWFudXBFcnJvcikge1xuICAgICAgICAgIC8vIE5vbi1jcml0aWNhbCBlcnJvciwganVzdCBsb2cgaXRcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYEZhaWxlZCB0byBjbGVhbiB1cCBiYWNrdXAgJHtiYWNrdXBQYXRofTpgLCBjbGVhbnVwRXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJlc3RvcmUgYmluYXJ5ICR7b3JpZ2luYWxQYXRofTpgLCBlcnJvcik7XG4gICAgfVxuICB9XG4gIHBhdGNoZWRCaW5hcmllcy5jbGVhcigpO1xufVxuXG4vLyBTZXQgdXAgY2xlYW51cCBoYW5kbGVyc1xubGV0IGNsZWFudXBSZWdpc3RlcmVkID0gZmFsc2U7XG5mdW5jdGlvbiByZWdpc3RlckNsZWFudXBIYW5kbGVycygpIHtcbiAgaWYgKGNsZWFudXBSZWdpc3RlcmVkKSByZXR1cm47XG4gIGNsZWFudXBSZWdpc3RlcmVkID0gdHJ1ZTtcblxuICBjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuICAgIHJlc3RvcmVBbGxCaW5hcmllcygpO1xuICB9O1xuXG4gIHByb2Nlc3Mub24oJ2V4aXQnLCBjbGVhbnVwKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgKCkgPT4ge1xuICAgIGNsZWFudXAoKTtcbiAgICBwcm9jZXNzLmV4aXQoMTMwKTsgLy8gU3RhbmRhcmQgZXhpdCBjb2RlIGZvciBTSUdJTlRcbiAgfSk7XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCAoKSA9PiB7XG4gICAgY2xlYW51cCgpO1xuICAgIHByb2Nlc3MuZXhpdCgxNDMpOyAvLyBTdGFuZGFyZCBleGl0IGNvZGUgZm9yIFNJR1RFUk1cbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXRjaENsYXVkZUJpbmFyeShjbGF1ZGVQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAvLyBDaGVjayBpZiBhbHJlYWR5IHBhdGNoZWRcbiAgaWYgKHBhdGNoZWRCaW5hcmllcy5oYXMoY2xhdWRlUGF0aCkpIHtcbiAgICBsb2dnZXIuZGVidWcoYEJpbmFyeSBhbHJlYWR5IHBhdGNoZWQ6ICR7Y2xhdWRlUGF0aH1gKTtcbiAgICByZXR1cm4gY2xhdWRlUGF0aDtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIHVuaXF1ZSB0ZW1wIGZpbGUgZm9yIGJhY2t1cFxuICBjb25zdCBjbGF1ZGVGaWxlbmFtZSA9IHBhdGguYmFzZW5hbWUoY2xhdWRlUGF0aCk7XG4gIGNvbnN0IHRlbXBEaXIgPSBvcy50bXBkaXIoKTtcbiAgY29uc3QgYmFja3VwUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgdmliZXR1bm5lbC1jbGF1ZGUtYmFja3VwLSR7RGF0ZS5ub3coKX0tJHtjbGF1ZGVGaWxlbmFtZX1gKTtcblxuICAvLyBDcmVhdGUgYmFja3VwXG4gIGZzLmNvcHlGaWxlU3luYyhjbGF1ZGVQYXRoLCBiYWNrdXBQYXRoKTtcbiAgbG9nZ2VyLmRlYnVnKGBDcmVhdGVkIGJhY2t1cCBhdCAke2JhY2t1cFBhdGh9YCk7XG5cbiAgLy8gUmVhZCB0aGUgQ2xhdWRlIGJpbmFyeVxuICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNsYXVkZVBhdGgsICd1dGY4Jyk7XG5cbiAgLy8gTXVsdGlwbGUgcGF0dGVybnMgdG8gbWF0Y2ggZGlmZmVyZW50IHZhcmlhdGlvbnMgb2YgYW50aS1kZWJ1Z2dpbmcgY2hlY2tzXG4gIGNvbnN0IHBhdHRlcm5zID0gW1xuICAgIC8vIFN0YW5kYXJkIHBhdHRlcm46IGlmKFBGNSgpKXByb2Nlc3MuZXhpdCgxKTtcbiAgICAvaWZcXChbQS1aYS16MC05XyRdK1xcKFxcKVxcKXByb2Nlc3NcXC5leGl0XFwoMVxcKTsvZyxcbiAgICAvLyBXaXRoIHNwYWNlczogaWYgKFBGNSgpKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgL2lmXFxzKlxcKFtBLVphLXowLTlfJF0rXFwoXFwpXFwpXFxzKnByb2Nlc3NcXC5leGl0XFwoMVxcKTsvZyxcbiAgICAvLyBEaWZmZXJlbnQgZXhpdCBjb2RlczogaWYoUEY1KCkpcHJvY2Vzcy5leGl0KDIpO1xuICAgIC9pZlxcKFtBLVphLXowLTlfJF0rXFwoXFwpXFwpcHJvY2Vzc1xcLmV4aXRcXChcXGQrXFwpOy9nLFxuICBdO1xuXG4gIGxldCBwYXRjaGVkQ29udGVudCA9IGNvbnRlbnQ7XG4gIGxldCBwYXRjaGVkID0gZmFsc2U7XG5cbiAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHBhdHRlcm5zKSB7XG4gICAgY29uc3QgbmV3Q29udGVudCA9IHBhdGNoZWRDb250ZW50LnJlcGxhY2UocGF0dGVybiwgJ2lmKGZhbHNlKXByb2Nlc3MuZXhpdCgxKTsnKTtcbiAgICBpZiAobmV3Q29udGVudCAhPT0gcGF0Y2hlZENvbnRlbnQpIHtcbiAgICAgIHBhdGNoZWRDb250ZW50ID0gbmV3Q29udGVudDtcbiAgICAgIHBhdGNoZWQgPSB0cnVlO1xuICAgICAgbG9nZ2VyLmRlYnVnKGBBcHBsaWVkIHBhdGNoIGZvciBwYXR0ZXJuOiAke3BhdHRlcm59YCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFwYXRjaGVkKSB7XG4gICAgbG9nZ2VyLndhcm4oJ05vIGFudGktZGVidWdnaW5nIHBhdHRlcm4gZm91bmQgLSBDbGF1ZGUgYmluYXJ5IG1heSBoYXZlIGNoYW5nZWQnKTtcbiAgICByZXR1cm4gY2xhdWRlUGF0aDtcbiAgfVxuXG4gIC8vIFdyaXRlIHBhdGNoZWQgdmVyc2lvbiBkaXJlY3RseSBvdmVyIHRoZSBvcmlnaW5hbFxuICBmcy53cml0ZUZpbGVTeW5jKGNsYXVkZVBhdGgsIHBhdGNoZWRDb250ZW50KTtcblxuICAvLyBUcmFjayB0aGlzIHBhdGNoZWQgYmluYXJ5IGZvciBjbGVhbnVwXG4gIHBhdGNoZWRCaW5hcmllcy5zZXQoY2xhdWRlUGF0aCwgYmFja3VwUGF0aCk7XG4gIHJlZ2lzdGVyQ2xlYW51cEhhbmRsZXJzKCk7XG5cbiAgbG9nZ2VyLmxvZyhgUGF0Y2hlZCBDbGF1ZGUgYmluYXJ5YCk7XG4gIHJldHVybiBjbGF1ZGVQYXRoO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBhIGNvbW1hbmQgaXMgdGhlIENsYXVkZSBDTEkgYmluYXJ5IGFuZCBwYXRjaGVzIGl0IGlmIG5lY2Vzc2FyeS5cbiAqXG4gKiBAcGFyYW0gY29tbWFuZCAtIFRoZSBjb21tYW5kIGFycmF5IGZyb20gZndkLnRzIChlLmcuLCBbXCJjbGF1ZGVcIiwgXCItLXJlc3VtZVwiXSlcbiAqIEByZXR1cm5zIFRoZSBwb3RlbnRpYWxseSBwYXRjaGVkIGNvbW1hbmQgYXJyYXlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrQW5kUGF0Y2hDbGF1ZGUoY29tbWFuZDogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG4gIGlmIChjb21tYW5kLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBjb21tYW5kO1xuICB9XG5cbiAgLy8gR2V0IHRoZSBiYXNlIGNvbW1hbmQgKGZpcnN0IGVsZW1lbnQpXG4gIGxldCBiYXNlQ29tbWFuZCA9IGNvbW1hbmRbMF07XG4gIGxvZ2dlci5kZWJ1ZyhgQ2hlY2tpbmcgY29tbWFuZDogJHtiYXNlQ29tbWFuZH1gKTtcblxuICAvLyBTdGVwIDE6IENoZWNrIGlmIGl0J3MgYW4gYWxpYXMgYW5kIHJlc29sdmUgaXRcbiAgdHJ5IHtcbiAgICAvLyBHZXQgdGhlIHVzZXIncyBzaGVsbCBmcm9tIFNIRUxMIGVudiB2YXIsIGRlZmF1bHQgdG8gYmFzaFxuICAgIGNvbnN0IHVzZXJTaGVsbCA9IHByb2Nlc3MuZW52LlNIRUxMIHx8ICcvYmluL2Jhc2gnO1xuICAgIGNvbnN0IHNoZWxsTmFtZSA9IHBhdGguYmFzZW5hbWUodXNlclNoZWxsKTtcblxuICAgIC8vIEZpcnN0IHRyeSB0byBjaGVjayBpZiBpdCdzIGFuIGFsaWFzIHVzaW5nIHRoZSB1c2VyJ3Mgc2hlbGxcbiAgICBjb25zdCBhbGlhc0NvbW1hbmQgPVxuICAgICAgc2hlbGxOYW1lID09PSAnenNoJ1xuICAgICAgICA/IGAke3VzZXJTaGVsbH0gLWkgLWMgXCJhbGlhcyAke2Jhc2VDb21tYW5kfSAyPi9kZXYvbnVsbFwiYFxuICAgICAgICA6IGAke3VzZXJTaGVsbH0gLWkgLWMgXCJhbGlhcyAke2Jhc2VDb21tYW5kfSAyPiYxXCJgO1xuXG4gICAgY29uc3QgYWxpYXNPdXRwdXQgPSBleGVjU3luYyhhbGlhc0NvbW1hbmQsIHtcbiAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgfSkudHJpbSgpO1xuXG4gICAgaWYgKGFsaWFzT3V0cHV0ICYmICFhbGlhc091dHB1dC5pbmNsdWRlcygnbm90IGZvdW5kJykpIHtcbiAgICAgIC8vIFBhcnNlIGFsaWFzIG91dHB1dCAoZm9ybWF0IG1heSB2YXJ5IGJ5IHNoZWxsKVxuICAgICAgLy8genNoOiBhbGlhcyBuYW1lPSdjb21tYW5kJyBvciBuYW1lPWNvbW1hbmRcbiAgICAgIC8vIGJhc2g6IGFsaWFzIG5hbWU9J2NvbW1hbmQnXG4gICAgICBjb25zdCBtYXRjaCA9IGFsaWFzT3V0cHV0Lm1hdGNoKC9eKD86YWxpYXNcXHMrKT9bXj1dKz1bXCInXT8oLis/KVtcIiddPyQvKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBjb25zdCBhbGlhc0NvbW1hbmQgPSBtYXRjaFsxXS5zcGxpdCgnICcpWzBdO1xuICAgICAgICBsb2dnZXIuZGVidWcoYFJlc29sdmVkIGFsaWFzOiAke2Jhc2VDb21tYW5kfSDihpIgJHthbGlhc0NvbW1hbmR9YCk7XG4gICAgICAgIGJhc2VDb21tYW5kID0gYWxpYXNDb21tYW5kO1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgLy8gVGhpcyBpcyBleHBlY3RlZCB3aGVuIGFsaWFzIGRvZXNuJ3QgZXhpc3RcbiAgICBsb2dnZXIuZGVidWcoYE5vIGFsaWFzIGZvdW5kIGZvcjogJHtiYXNlQ29tbWFuZH1gKTtcbiAgfVxuXG4gIC8vIFN0ZXAgMjogUmVzb2x2ZSB0aGUgZnVsbCBwYXRoIGlmIGl0J3Mgbm90IGFscmVhZHkgYWJzb2x1dGVcbiAgbGV0IHJlc29sdmVkUGF0aCA9IGJhc2VDb21tYW5kO1xuICBpZiAoIXBhdGguaXNBYnNvbHV0ZShiYXNlQ29tbWFuZCkpIHtcbiAgICB0cnkge1xuICAgICAgLy8gVHJ5IHRvIGZpbmQgdGhlIGV4ZWN1dGFibGUgaW4gUEFUSCB1c2luZyB3aGljaFxuICAgICAgY29uc3Qgd2hpY2hPdXRwdXQgPSBleGVjU3luYyhgd2hpY2ggXCIke2Jhc2VDb21tYW5kfVwiIDI+L2Rldi9udWxsYCwge1xuICAgICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgfSkudHJpbSgpO1xuXG4gICAgICBpZiAod2hpY2hPdXRwdXQpIHtcbiAgICAgICAgcmVzb2x2ZWRQYXRoID0gd2hpY2hPdXRwdXQ7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgRm91bmQgaW4gUEFUSDogJHtyZXNvbHZlZFBhdGh9YCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUcnkgY29tbWFuZCAtdiBhcyBhIGZhbGxiYWNrXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tbWFuZE91dHB1dCA9IGV4ZWNTeW5jKGBjb21tYW5kIC12IFwiJHtiYXNlQ29tbWFuZH1cIiAyPi9kZXYvbnVsbGAsIHtcbiAgICAgICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICAgICAgICBzaGVsbDogJy9iaW4vc2gnLFxuICAgICAgICAgIH0pLnRyaW0oKTtcblxuICAgICAgICAgIGlmIChjb21tYW5kT3V0cHV0ICYmIGNvbW1hbmRPdXRwdXQgIT09IGJhc2VDb21tYW5kKSB7XG4gICAgICAgICAgICByZXNvbHZlZFBhdGggPSBjb21tYW5kT3V0cHV0O1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKGBGb3VuZCB2aWEgY29tbWFuZCAtdjogJHtyZXNvbHZlZFBhdGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBjb21tYW5kIC12IGFsc28gZmFpbGVkXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIHdoaWNoIGZhaWxlZCwgY29udGludWUgd2l0aCBjdXJyZW50IHBhdGhcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ291bGQgbm90IGZpbmQgJHtiYXNlQ29tbWFuZH0gaW4gUEFUSGApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFN0ZXAgMzogQ2hlY2sgaWYgaXQncyBhIHN5bWxpbmsgYW5kIHJlc29sdmUgaXRcbiAgdHJ5IHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhyZXNvbHZlZFBhdGgpICYmIGZzLmxzdGF0U3luYyhyZXNvbHZlZFBhdGgpLmlzU3ltYm9saWNMaW5rKCkpIHtcbiAgICAgIGNvbnN0IHJlYWxQYXRoID0gZnMucmVhbHBhdGhTeW5jKHJlc29sdmVkUGF0aCk7XG4gICAgICBsb2dnZXIuZGVidWcoYFJlc29sdmVkIHN5bWxpbms6ICR7cmVzb2x2ZWRQYXRofSDihpIgJHtyZWFsUGF0aH1gKTtcbiAgICAgIHJlc29sdmVkUGF0aCA9IHJlYWxQYXRoO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZGVidWcoYENvdWxkIG5vdCByZXNvbHZlIHN5bWxpbms6ICR7ZXJyb3J9YCk7XG4gIH1cblxuICAvLyBTdGVwIDQ6IENoZWNrIGlmIHRoaXMgaXMgdGhlIENsYXVkZSBDTEkgYmluYXJ5XG4gIC8vIFdlJ2xsIGNoZWNrIGZvciB2YXJpb3VzIGluZGljYXRvcnMgdGhhdCB0aGlzIGlzIENsYXVkZVxuICBpZiAoIWZzLmV4aXN0c1N5bmMocmVzb2x2ZWRQYXRoKSkge1xuICAgIGxvZ2dlci5kZWJ1ZyhgUmVzb2x2ZWQgcGF0aCBkb2VzIG5vdCBleGlzdDogJHtyZXNvbHZlZFBhdGh9YCk7XG4gICAgcmV0dXJuIGNvbW1hbmQ7XG4gIH1cblxuICAvLyBDaGVjayBpZiB0aGlzIGlzIHRoZSBDbGF1ZGUgQ0xJIGJ5IGV4YW1pbmluZyBmaWxlIGNvbnRlbnRcbiAgdHJ5IHtcbiAgICAvLyBSZWFkIHRoZSBmaXJzdCAxS0Igb2YgdGhlIGZpbGUgdG8gY2hlY2sgdGhlIGhlYWRlclxuICAgIGNvbnN0IGZkID0gZnMub3BlblN5bmMocmVzb2x2ZWRQYXRoLCAncicpO1xuICAgIGNvbnN0IGJ1ZmZlciA9IEJ1ZmZlci5hbGxvYygxMDI0KTtcbiAgICBjb25zdCBieXRlc1JlYWQgPSBmcy5yZWFkU3luYyhmZCwgYnVmZmVyLCAwLCAxMDI0LCAwKTtcbiAgICBmcy5jbG9zZVN5bmMoZmQpO1xuXG4gICAgY29uc3QgZmlsZUhlYWRlciA9IGJ1ZmZlci50b1N0cmluZygndXRmOCcsIDAsIGJ5dGVzUmVhZCk7XG5cbiAgICAvLyBDaGVjayBmb3IgQ2xhdWRlIENMSSBpbmRpY2F0b3JzOlxuICAgIC8vIDEuIFNoZWJhbmcgd2l0aCBub2RlXG4gICAgLy8gMi4gQW50aHJvcGljIGNvcHlyaWdodFxuICAgIGNvbnN0IGlzQ2xhdWRlQmluYXJ5ID1cbiAgICAgIGZpbGVIZWFkZXIuaW5jbHVkZXMoJyMhL3Vzci9iaW4vZW52JykgJiZcbiAgICAgIGZpbGVIZWFkZXIuaW5jbHVkZXMoJ25vZGUnKSAmJlxuICAgICAgZmlsZUhlYWRlci5pbmNsdWRlcygnQW50aHJvcGljIFBCQycpO1xuXG4gICAgaWYgKCFpc0NsYXVkZUJpbmFyeSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBOb3QgYSBDbGF1ZGUgQ0xJIGJpbmFyeTogJHtwYXRoLmJhc2VuYW1lKHJlc29sdmVkUGF0aCl9YCk7XG4gICAgICByZXR1cm4gY29tbWFuZDtcbiAgICB9XG5cbiAgICAvLyBOb3cgcmVhZCB0aGUgZnVsbCBmaWxlIHRvIGNoZWNrIGZvciBhbnRpLWRlYnVnZ2luZyBwYXR0ZXJuc1xuICAgIGNvbnN0IGZ1bGxDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlc29sdmVkUGF0aCwgJ3V0ZjgnKTtcbiAgICBjb25zdCBoYXNBbnRpRGVidWdnaW5nID1cbiAgICAgIGZ1bGxDb250ZW50LmluY2x1ZGVzKCdwcm9jZXNzLmV4aXQoMSknKSB8fCBmdWxsQ29udGVudC5pbmNsdWRlcygnUEY1KCknKTtcblxuICAgIGlmICghaGFzQW50aURlYnVnZ2luZykge1xuICAgICAgbG9nZ2VyLmRlYnVnKGBDbGF1ZGUgQ0xJIGRldGVjdGVkIGJ1dCBubyBhbnRpLWRlYnVnZ2luZyBwYXR0ZXJucyBmb3VuZGApO1xuICAgICAgcmV0dXJuIGNvbW1hbmQ7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5kZWJ1ZyhgQ291bGQgbm90IHJlYWQgZmlsZSB0byB2ZXJpZnkgQ2xhdWRlIGJpbmFyeTogJHtlcnJvcn1gKTtcbiAgICByZXR1cm4gY29tbWFuZDtcbiAgfVxuXG4gIC8vIFN0ZXAgNTogSXQncyBDbGF1ZGUhIFBhdGNoIGl0XG4gIGxvZ2dlci5sb2coYERldGVjdGVkIENsYXVkZSBDTEkgYmluYXJ5IGF0OiAke3Jlc29sdmVkUGF0aH1gKTtcbiAgY29uc3QgcGF0Y2hlZFBhdGggPSBwYXRjaENsYXVkZUJpbmFyeShyZXNvbHZlZFBhdGgpO1xuXG4gIC8vIFJldHVybiB0aGUgY29tbWFuZCB3aXRoIHRoZSBwYXRjaGVkIHBhdGhcbiAgY29uc3QgcGF0Y2hlZENvbW1hbmQgPSBbcGF0Y2hlZFBhdGgsIC4uLmNvbW1hbmQuc2xpY2UoMSldO1xuICBsb2dnZXIubG9nKGBVc2luZyBwYXRjaGVkIGNvbW1hbmQ6ICR7cGF0Y2hlZENvbW1hbmQuam9pbignICcpfWApO1xuICByZXR1cm4gcGF0Y2hlZENvbW1hbmQ7XG59XG4iXX0=