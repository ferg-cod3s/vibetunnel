"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenManager = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_js_1 = require("../utils/logger.js");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const logger = (0, logger_js_1.createLogger)('screen-manager');
/**
 * GNU Screen manager for terminal multiplexing
 *
 * Note: GNU Screen has a simpler model than tmux:
 * - Sessions (like tmux sessions)
 * - Windows (like tmux windows)
 * - No panes concept (screen uses split regions but they're not addressable like tmux panes)
 */
class ScreenManager {
    static getInstance() {
        if (!ScreenManager.instance) {
            ScreenManager.instance = new ScreenManager();
        }
        return ScreenManager.instance;
    }
    /**
     * Validate session name to prevent command injection
     */
    validateSessionName(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('Session name must be a non-empty string');
        }
        // Allow dots for screen sessions (PID.name format), but still restrict dangerous chars
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
            throw new Error('Session name can only contain letters, numbers, dots, dashes, and underscores');
        }
        if (name.length > 100) {
            throw new Error('Session name too long (max 100 characters)');
        }
    }
    /**
     * Validate window index
     */
    validateWindowIndex(index) {
        if (!Number.isInteger(index) || index < 0 || index > 999) {
            throw new Error('Window index must be an integer between 0 and 999');
        }
    }
    /**
     * Check if screen is available
     */
    async isAvailable() {
        try {
            await execFileAsync('which', ['screen']);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * List all screen sessions
     * Screen output format: <pid>.<sessionname>\t(<status>)
     * Example: 12345.my-session	(Detached)
     */
    async listSessions() {
        try {
            const { stdout } = await execFileAsync('screen', ['-ls']).catch((error) => {
                // Screen returns exit code 1 when there are sessions (non-zero means "has sessions")
                // We need to check the output to determine if it's a real error
                if (error.stdout && !error.stdout.includes('No Sockets found')) {
                    return { stdout: error.stdout, stderr: error.stderr };
                }
                throw error;
            });
            const lines = stdout.split('\n');
            const sessions = [];
            for (const line of lines) {
                // Match lines like: 12345.session-name	(Detached)
                // Note: session name may contain dots, so we match until tab character
                const match = line.match(/^\s*(\d+)\.([^\t]+)\s*\t\s*\(([^)]+)\)/);
                if (match) {
                    const [, pid, name, status] = match;
                    sessions.push({
                        name: `${pid}.${name}`, // Use full name including PID for uniqueness
                        type: 'screen',
                        attached: status.toLowerCase().includes('attached'),
                        exited: status.toLowerCase().includes('dead'),
                        // Screen doesn't provide window count in list output
                    });
                }
            }
            return sessions;
        }
        catch (error) {
            // If no sessions exist, screen returns "No Sockets found"
            if (error instanceof Error &&
                'stdout' in error &&
                typeof error.stdout === 'string' &&
                error.stdout.includes('No Sockets found')) {
                return [];
            }
            logger.error('Failed to list screen sessions', { error });
            throw error;
        }
    }
    /**
     * Create a new screen session
     */
    async createSession(sessionName, command) {
        this.validateSessionName(sessionName);
        try {
            // Remove PID prefix if present (for creating new sessions)
            const cleanName = sessionName.includes('.')
                ? sessionName.split('.').slice(1).join('.')
                : sessionName;
            const args = ['screen', '-dmS', cleanName];
            // If command is provided, validate and add it
            if (command) {
                if (typeof command !== 'string') {
                    throw new Error('Command must be a string');
                }
                // For screen, we need to pass the command as a single argument
                // Screen expects the command and its args as separate elements
                args.push(command);
            }
            await execFileAsync(args[0], args.slice(1));
            logger.info('Created screen session', { sessionName: cleanName });
        }
        catch (error) {
            logger.error('Failed to create screen session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Attach to a screen session
     * For programmatic use, we'll create a new window in the session
     */
    async attachToSession(sessionName, command) {
        try {
            // For newly created sessions, we might need to wait a bit or handle differently
            // First check if this looks like a full session name with PID
            const isFullName = /^\d+\./.test(sessionName);
            if (!isFullName) {
                // This is a simple name, we need to find the full name with PID
                const sessions = await this.listSessions();
                const session = sessions.find((s) => {
                    // Check if the session name ends with our provided name
                    const parts = s.name.split('.');
                    const simpleName = parts.slice(1).join('.');
                    return simpleName === sessionName;
                });
                if (session) {
                    sessionName = session.name;
                }
                else {
                    // Session might have just been created, use -R flag which is more forgiving
                    return ['screen', '-R', sessionName];
                }
            }
            // Create a new window in the session if command is provided
            if (command) {
                if (typeof command !== 'string') {
                    throw new Error('Command must be a string');
                }
                await execFileAsync('screen', ['-S', sessionName, '-X', 'screen', command]);
            }
            // Return a command array that can be used to attach
            // Use -r for existing sessions with full name
            return ['screen', '-r', sessionName];
        }
        catch (error) {
            logger.error('Failed to attach to screen session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Kill a screen session
     */
    async killSession(sessionName) {
        this.validateSessionName(sessionName);
        try {
            // Screen can be killed using the full name with PID or just the PID
            await execFileAsync('screen', ['-S', sessionName, '-X', 'quit']);
            logger.info('Killed screen session', { sessionName });
        }
        catch (error) {
            logger.error('Failed to kill screen session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Check if inside a screen session
     */
    isInsideScreen() {
        return !!process.env.STY;
    }
    /**
     * Get the current screen session name if inside screen
     */
    getCurrentSession() {
        const sty = process.env.STY;
        if (!sty)
            return null;
        // STY format is pid.sessionname or pid.tty.host
        const parts = sty.split('.');
        if (parts.length >= 2) {
            return parts.slice(1).join('.');
        }
        return null;
    }
    /**
     * List windows in a screen session
     * Note: This is more limited than tmux - screen doesn't provide easy machine-readable output
     */
    async listWindows(sessionName) {
        try {
            // Screen doesn't have a good way to list windows programmatically
            // We could parse the windowlist output but it's not reliable
            // For now, return empty array
            logger.warn('Window listing not fully implemented for screen');
            return [];
        }
        catch (error) {
            logger.error('Failed to list screen windows', { sessionName, error });
            return [];
        }
    }
    /**
     * Create a new window in a screen session
     */
    async createWindow(sessionName, windowName, command) {
        this.validateSessionName(sessionName);
        try {
            const args = ['screen', '-S', sessionName, '-X', 'screen'];
            if (windowName) {
                if (typeof windowName !== 'string' || windowName.length > 50) {
                    throw new Error('Window name must be a string (max 50 characters)');
                }
                args.push('-t', windowName);
            }
            if (command) {
                if (typeof command !== 'string') {
                    throw new Error('Command must be a string');
                }
                args.push(command);
            }
            await execFileAsync(args[0], args.slice(1));
            logger.info('Created window in screen session', { sessionName, windowName });
        }
        catch (error) {
            logger.error('Failed to create window', { sessionName, windowName, error });
            throw error;
        }
    }
    /**
     * Kill a window in a screen session
     * Note: Screen uses window numbers, not names for targeting
     */
    async killWindow(sessionName, windowIndex) {
        this.validateSessionName(sessionName);
        this.validateWindowIndex(windowIndex);
        try {
            // First select the window, then kill it
            await execFileAsync('screen', ['-S', sessionName, '-p', String(windowIndex), '-X', 'kill']);
            logger.info('Killed window in screen session', { sessionName, windowIndex });
        }
        catch (error) {
            logger.error('Failed to kill window', { sessionName, windowIndex, error });
            throw error;
        }
    }
}
exports.ScreenManager = ScreenManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyZWVuLW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3NjcmVlbi1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGlEQUF5QztBQUN6QywrQkFBaUM7QUFFakMsa0RBQWtEO0FBRWxELE1BQU0sYUFBYSxHQUFHLElBQUEsZ0JBQVMsRUFBQyx3QkFBUSxDQUFDLENBQUM7QUFDMUMsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGdCQUFnQixDQUFDLENBQUM7QUFFOUM7Ozs7Ozs7R0FPRztBQUNILE1BQWEsYUFBYTtJQUd4QixNQUFNLENBQUMsV0FBVztRQUNoQixJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQzVCLGFBQWEsQ0FBQyxRQUFRLEdBQUcsSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUMvQyxDQUFDO1FBQ0QsT0FBTyxhQUFhLENBQUMsUUFBUSxDQUFDO0lBQ2hDLENBQUM7SUFFRDs7T0FFRztJQUNLLG1CQUFtQixDQUFDLElBQVk7UUFDdEMsSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUNELHVGQUF1RjtRQUN2RixJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FDYiwrRUFBK0UsQ0FDaEYsQ0FBQztRQUNKLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDdEIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxtQkFBbUIsQ0FBQyxLQUFhO1FBQ3ZDLElBQUks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O0NBQ0Y7QUF4UkQsc0NBd1JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHR5cGUgeyBNdWx0aXBsZXhlclNlc3Npb24gfSBmcm9tICcuLi8uLi9zaGFyZWQvbXVsdGlwbGV4ZXItdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7XG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3NjcmVlbi1tYW5hZ2VyJyk7XG5cbi8qKlxuICogR05VIFNjcmVlbiBtYW5hZ2VyIGZvciB0ZXJtaW5hbCBtdWx0aXBsZXhpbmdcbiAqXG4gKiBOb3RlOiBHTlUgU2NyZWVuIGhhcyBhIHNpbXBsZXIgbW9kZWwgdGhhbiB0bXV4OlxuICogLSBTZXNzaW9ucyAobGlrZSB0bXV4IHNlc3Npb25zKVxuICogLSBXaW5kb3dzIChsaWtlIHRtdXggd2luZG93cylcbiAqIC0gTm8gcGFuZXMgY29uY2VwdCAoc2NyZWVuIHVzZXMgc3BsaXQgcmVnaW9ucyBidXQgdGhleSdyZSBub3QgYWRkcmVzc2FibGUgbGlrZSB0bXV4IHBhbmVzKVxuICovXG5leHBvcnQgY2xhc3MgU2NyZWVuTWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBTY3JlZW5NYW5hZ2VyO1xuXG4gIHN0YXRpYyBnZXRJbnN0YW5jZSgpOiBTY3JlZW5NYW5hZ2VyIHtcbiAgICBpZiAoIVNjcmVlbk1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIFNjcmVlbk1hbmFnZXIuaW5zdGFuY2UgPSBuZXcgU2NyZWVuTWFuYWdlcigpO1xuICAgIH1cbiAgICByZXR1cm4gU2NyZWVuTWFuYWdlci5pbnN0YW5jZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBzZXNzaW9uIG5hbWUgdG8gcHJldmVudCBjb21tYW5kIGluamVjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZVNlc3Npb25OYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghbmFtZSB8fCB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiBuYW1lIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nJyk7XG4gICAgfVxuICAgIC8vIEFsbG93IGRvdHMgZm9yIHNjcmVlbiBzZXNzaW9ucyAoUElELm5hbWUgZm9ybWF0KSwgYnV0IHN0aWxsIHJlc3RyaWN0IGRhbmdlcm91cyBjaGFyc1xuICAgIGlmICghL15bYS16QS1aMC05Ll8tXSskLy50ZXN0KG5hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICdTZXNzaW9uIG5hbWUgY2FuIG9ubHkgY29udGFpbiBsZXR0ZXJzLCBudW1iZXJzLCBkb3RzLCBkYXNoZXMsIGFuZCB1bmRlcnNjb3JlcydcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChuYW1lLmxlbmd0aCA+IDEwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdTZXNzaW9uIG5hbWUgdG9vIGxvbmcgKG1heCAxMDAgY2hhcmFjdGVycyknKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGUgd2luZG93IGluZGV4XG4gICAqL1xuICBwcml2YXRlIHZhbGlkYXRlV2luZG93SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihpbmRleCkgfHwgaW5kZXggPCAwIHx8IGluZGV4ID4gOTk5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dpbmRvdyBpbmRleCBtdXN0IGJlIGFuIGludGVnZXIgYmV0d2VlbiAwIGFuZCA5OTknKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgc2NyZWVuIGlzIGF2YWlsYWJsZVxuICAgKi9cbiAgYXN5bmMgaXNBdmFpbGFibGUoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3doaWNoJywgWydzY3JlZW4nXSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTGlzdCBhbGwgc2NyZWVuIHNlc3Npb25zXG4gICAqIFNjcmVlbiBvdXRwdXQgZm9ybWF0OiA8cGlkPi48c2Vzc2lvbm5hbWU+XFx0KDxzdGF0dXM+KVxuICAgKiBFeGFtcGxlOiAxMjM0NS5teS1zZXNzaW9uXHQoRGV0YWNoZWQpXG4gICAqL1xuICBhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxNdWx0aXBsZXhlclNlc3Npb25bXT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYygnc2NyZWVuJywgWyctbHMnXSkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgIC8vIFNjcmVlbiByZXR1cm5zIGV4aXQgY29kZSAxIHdoZW4gdGhlcmUgYXJlIHNlc3Npb25zIChub24temVybyBtZWFucyBcImhhcyBzZXNzaW9uc1wiKVxuICAgICAgICAvLyBXZSBuZWVkIHRvIGNoZWNrIHRoZSBvdXRwdXQgdG8gZGV0ZXJtaW5lIGlmIGl0J3MgYSByZWFsIGVycm9yXG4gICAgICAgIGlmIChlcnJvci5zdGRvdXQgJiYgIWVycm9yLnN0ZG91dC5pbmNsdWRlcygnTm8gU29ja2V0cyBmb3VuZCcpKSB7XG4gICAgICAgICAgcmV0dXJuIHsgc3Rkb3V0OiBlcnJvci5zdGRvdXQsIHN0ZGVycjogZXJyb3Iuc3RkZXJyIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcblxuICAgICAgY29uc3QgbGluZXMgPSBzdGRvdXQuc3BsaXQoJ1xcbicpO1xuICAgICAgY29uc3Qgc2Vzc2lvbnM6IE11bHRpcGxleGVyU2Vzc2lvbltdID0gW107XG5cbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICAvLyBNYXRjaCBsaW5lcyBsaWtlOiAxMjM0NS5zZXNzaW9uLW5hbWVcdChEZXRhY2hlZClcbiAgICAgICAgLy8gTm90ZTogc2Vzc2lvbiBuYW1lIG1heSBjb250YWluIGRvdHMsIHNvIHdlIG1hdGNoIHVudGlsIHRhYiBjaGFyYWN0ZXJcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKC9eXFxzKihcXGQrKVxcLihbXlxcdF0rKVxccypcXHRcXHMqXFwoKFteKV0rKVxcKS8pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCBbLCBwaWQsIG5hbWUsIHN0YXR1c10gPSBtYXRjaDtcbiAgICAgICAgICBzZXNzaW9ucy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWU6IGAke3BpZH0uJHtuYW1lfWAsIC8vIFVzZSBmdWxsIG5hbWUgaW5jbHVkaW5nIFBJRCBmb3IgdW5pcXVlbmVzc1xuICAgICAgICAgICAgdHlwZTogJ3NjcmVlbicsXG4gICAgICAgICAgICBhdHRhY2hlZDogc3RhdHVzLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2F0dGFjaGVkJyksXG4gICAgICAgICAgICBleGl0ZWQ6IHN0YXR1cy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdkZWFkJyksXG4gICAgICAgICAgICAvLyBTY3JlZW4gZG9lc24ndCBwcm92aWRlIHdpbmRvdyBjb3VudCBpbiBsaXN0IG91dHB1dFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZXNzaW9ucztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gSWYgbm8gc2Vzc2lvbnMgZXhpc3QsIHNjcmVlbiByZXR1cm5zIFwiTm8gU29ja2V0cyBmb3VuZFwiXG4gICAgICBpZiAoXG4gICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiZcbiAgICAgICAgJ3N0ZG91dCcgaW4gZXJyb3IgJiZcbiAgICAgICAgdHlwZW9mIGVycm9yLnN0ZG91dCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgZXJyb3Iuc3Rkb3V0LmluY2x1ZGVzKCdObyBTb2NrZXRzIGZvdW5kJylcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsaXN0IHNjcmVlbiBzZXNzaW9ucycsIHsgZXJyb3IgfSk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHNjcmVlbiBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBjcmVhdGVTZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcsIGNvbW1hbmQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFJlbW92ZSBQSUQgcHJlZml4IGlmIHByZXNlbnQgKGZvciBjcmVhdGluZyBuZXcgc2Vzc2lvbnMpXG4gICAgICBjb25zdCBjbGVhbk5hbWUgPSBzZXNzaW9uTmFtZS5pbmNsdWRlcygnLicpXG4gICAgICAgID8gc2Vzc2lvbk5hbWUuc3BsaXQoJy4nKS5zbGljZSgxKS5qb2luKCcuJylcbiAgICAgICAgOiBzZXNzaW9uTmFtZTtcblxuICAgICAgY29uc3QgYXJncyA9IFsnc2NyZWVuJywgJy1kbVMnLCBjbGVhbk5hbWVdO1xuXG4gICAgICAvLyBJZiBjb21tYW5kIGlzIHByb3ZpZGVkLCB2YWxpZGF0ZSBhbmQgYWRkIGl0XG4gICAgICBpZiAoY29tbWFuZCkge1xuICAgICAgICBpZiAodHlwZW9mIGNvbW1hbmQgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb21tYW5kIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGb3Igc2NyZWVuLCB3ZSBuZWVkIHRvIHBhc3MgdGhlIGNvbW1hbmQgYXMgYSBzaW5nbGUgYXJndW1lbnRcbiAgICAgICAgLy8gU2NyZWVuIGV4cGVjdHMgdGhlIGNvbW1hbmQgYW5kIGl0cyBhcmdzIGFzIHNlcGFyYXRlIGVsZW1lbnRzXG4gICAgICAgIGFyZ3MucHVzaChjb21tYW5kKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgZXhlY0ZpbGVBc3luYyhhcmdzWzBdLCBhcmdzLnNsaWNlKDEpKTtcbiAgICAgIGxvZ2dlci5pbmZvKCdDcmVhdGVkIHNjcmVlbiBzZXNzaW9uJywgeyBzZXNzaW9uTmFtZTogY2xlYW5OYW1lIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgc2NyZWVuIHNlc3Npb24nLCB7IHNlc3Npb25OYW1lLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRhY2ggdG8gYSBzY3JlZW4gc2Vzc2lvblxuICAgKiBGb3IgcHJvZ3JhbW1hdGljIHVzZSwgd2UnbGwgY3JlYXRlIGEgbmV3IHdpbmRvdyBpbiB0aGUgc2Vzc2lvblxuICAgKi9cbiAgYXN5bmMgYXR0YWNoVG9TZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcsIGNvbW1hbmQ/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEZvciBuZXdseSBjcmVhdGVkIHNlc3Npb25zLCB3ZSBtaWdodCBuZWVkIHRvIHdhaXQgYSBiaXQgb3IgaGFuZGxlIGRpZmZlcmVudGx5XG4gICAgICAvLyBGaXJzdCBjaGVjayBpZiB0aGlzIGxvb2tzIGxpa2UgYSBmdWxsIHNlc3Npb24gbmFtZSB3aXRoIFBJRFxuICAgICAgY29uc3QgaXNGdWxsTmFtZSA9IC9eXFxkK1xcLi8udGVzdChzZXNzaW9uTmFtZSk7XG5cbiAgICAgIGlmICghaXNGdWxsTmFtZSkge1xuICAgICAgICAvLyBUaGlzIGlzIGEgc2ltcGxlIG5hbWUsIHdlIG5lZWQgdG8gZmluZCB0aGUgZnVsbCBuYW1lIHdpdGggUElEXG4gICAgICAgIGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5saXN0U2Vzc2lvbnMoKTtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQoKHMpID0+IHtcbiAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgc2Vzc2lvbiBuYW1lIGVuZHMgd2l0aCBvdXIgcHJvdmlkZWQgbmFtZVxuICAgICAgICAgIGNvbnN0IHBhcnRzID0gcy5uYW1lLnNwbGl0KCcuJyk7XG4gICAgICAgICAgY29uc3Qgc2ltcGxlTmFtZSA9IHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgICAgICAgICByZXR1cm4gc2ltcGxlTmFtZSA9PT0gc2Vzc2lvbk5hbWU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChzZXNzaW9uKSB7XG4gICAgICAgICAgc2Vzc2lvbk5hbWUgPSBzZXNzaW9uLm5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gU2Vzc2lvbiBtaWdodCBoYXZlIGp1c3QgYmVlbiBjcmVhdGVkLCB1c2UgLVIgZmxhZyB3aGljaCBpcyBtb3JlIGZvcmdpdmluZ1xuICAgICAgICAgIHJldHVybiBbJ3NjcmVlbicsICctUicsIHNlc3Npb25OYW1lXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBDcmVhdGUgYSBuZXcgd2luZG93IGluIHRoZSBzZXNzaW9uIGlmIGNvbW1hbmQgaXMgcHJvdmlkZWRcbiAgICAgIGlmIChjb21tYW5kKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY29tbWFuZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgbXVzdCBiZSBhIHN0cmluZycpO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3NjcmVlbicsIFsnLVMnLCBzZXNzaW9uTmFtZSwgJy1YJywgJ3NjcmVlbicsIGNvbW1hbmRdKTtcbiAgICAgIH1cblxuICAgICAgLy8gUmV0dXJuIGEgY29tbWFuZCBhcnJheSB0aGF0IGNhbiBiZSB1c2VkIHRvIGF0dGFjaFxuICAgICAgLy8gVXNlIC1yIGZvciBleGlzdGluZyBzZXNzaW9ucyB3aXRoIGZ1bGwgbmFtZVxuICAgICAgcmV0dXJuIFsnc2NyZWVuJywgJy1yJywgc2Vzc2lvbk5hbWVdO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBhdHRhY2ggdG8gc2NyZWVuIHNlc3Npb24nLCB7IHNlc3Npb25OYW1lLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLaWxsIGEgc2NyZWVuIHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGtpbGxTZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNjcmVlbiBjYW4gYmUga2lsbGVkIHVzaW5nIHRoZSBmdWxsIG5hbWUgd2l0aCBQSUQgb3IganVzdCB0aGUgUElEXG4gICAgICBhd2FpdCBleGVjRmlsZUFzeW5jKCdzY3JlZW4nLCBbJy1TJywgc2Vzc2lvbk5hbWUsICctWCcsICdxdWl0J10pO1xuICAgICAgbG9nZ2VyLmluZm8oJ0tpbGxlZCBzY3JlZW4gc2Vzc2lvbicsIHsgc2Vzc2lvbk5hbWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgc2NyZWVuIHNlc3Npb24nLCB7IHNlc3Npb25OYW1lLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBpbnNpZGUgYSBzY3JlZW4gc2Vzc2lvblxuICAgKi9cbiAgaXNJbnNpZGVTY3JlZW4oKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhcHJvY2Vzcy5lbnYuU1RZO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCBzY3JlZW4gc2Vzc2lvbiBuYW1lIGlmIGluc2lkZSBzY3JlZW5cbiAgICovXG4gIGdldEN1cnJlbnRTZXNzaW9uKCk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHN0eSA9IHByb2Nlc3MuZW52LlNUWTtcbiAgICBpZiAoIXN0eSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBTVFkgZm9ybWF0IGlzIHBpZC5zZXNzaW9ubmFtZSBvciBwaWQudHR5Lmhvc3RcbiAgICBjb25zdCBwYXJ0cyA9IHN0eS5zcGxpdCgnLicpO1xuICAgIGlmIChwYXJ0cy5sZW5ndGggPj0gMikge1xuICAgICAgcmV0dXJuIHBhcnRzLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogTGlzdCB3aW5kb3dzIGluIGEgc2NyZWVuIHNlc3Npb25cbiAgICogTm90ZTogVGhpcyBpcyBtb3JlIGxpbWl0ZWQgdGhhbiB0bXV4IC0gc2NyZWVuIGRvZXNuJ3QgcHJvdmlkZSBlYXN5IG1hY2hpbmUtcmVhZGFibGUgb3V0cHV0XG4gICAqL1xuICBhc3luYyBsaXN0V2luZG93cyhzZXNzaW9uTmFtZTogc3RyaW5nKTogUHJvbWlzZTxBcnJheTx7IGluZGV4OiBudW1iZXI7IG5hbWU6IHN0cmluZyB9Pj4ge1xuICAgIHRyeSB7XG4gICAgICAvLyBTY3JlZW4gZG9lc24ndCBoYXZlIGEgZ29vZCB3YXkgdG8gbGlzdCB3aW5kb3dzIHByb2dyYW1tYXRpY2FsbHlcbiAgICAgIC8vIFdlIGNvdWxkIHBhcnNlIHRoZSB3aW5kb3dsaXN0IG91dHB1dCBidXQgaXQncyBub3QgcmVsaWFibGVcbiAgICAgIC8vIEZvciBub3csIHJldHVybiBlbXB0eSBhcnJheVxuICAgICAgbG9nZ2VyLndhcm4oJ1dpbmRvdyBsaXN0aW5nIG5vdCBmdWxseSBpbXBsZW1lbnRlZCBmb3Igc2NyZWVuJyk7XG4gICAgICByZXR1cm4gW107XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGxpc3Qgc2NyZWVuIHdpbmRvd3MnLCB7IHNlc3Npb25OYW1lLCBlcnJvciB9KTtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHdpbmRvdyBpbiBhIHNjcmVlbiBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBjcmVhdGVXaW5kb3coc2Vzc2lvbk5hbWU6IHN0cmluZywgd2luZG93TmFtZT86IHN0cmluZywgY29tbWFuZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uTmFtZShzZXNzaW9uTmFtZSk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgYXJncyA9IFsnc2NyZWVuJywgJy1TJywgc2Vzc2lvbk5hbWUsICctWCcsICdzY3JlZW4nXTtcblxuICAgICAgaWYgKHdpbmRvd05hbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3dOYW1lICE9PSAnc3RyaW5nJyB8fCB3aW5kb3dOYW1lLmxlbmd0aCA+IDUwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdXaW5kb3cgbmFtZSBtdXN0IGJlIGEgc3RyaW5nIChtYXggNTAgY2hhcmFjdGVycyknKTtcbiAgICAgICAgfVxuICAgICAgICBhcmdzLnB1c2goJy10Jywgd2luZG93TmFtZSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjb21tYW5kKSB7XG4gICAgICAgIGlmICh0eXBlb2YgY29tbWFuZCAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgbXVzdCBiZSBhIHN0cmluZycpO1xuICAgICAgICB9XG4gICAgICAgIGFyZ3MucHVzaChjb21tYW5kKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgZXhlY0ZpbGVBc3luYyhhcmdzWzBdLCBhcmdzLnNsaWNlKDEpKTtcbiAgICAgIGxvZ2dlci5pbmZvKCdDcmVhdGVkIHdpbmRvdyBpbiBzY3JlZW4gc2Vzc2lvbicsIHsgc2Vzc2lvbk5hbWUsIHdpbmRvd05hbWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGNyZWF0ZSB3aW5kb3cnLCB7IHNlc3Npb25OYW1lLCB3aW5kb3dOYW1lLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLaWxsIGEgd2luZG93IGluIGEgc2NyZWVuIHNlc3Npb25cbiAgICogTm90ZTogU2NyZWVuIHVzZXMgd2luZG93IG51bWJlcnMsIG5vdCBuYW1lcyBmb3IgdGFyZ2V0aW5nXG4gICAqL1xuICBhc3luYyBraWxsV2luZG93KHNlc3Npb25OYW1lOiBzdHJpbmcsIHdpbmRvd0luZGV4OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuICAgIHRoaXMudmFsaWRhdGVXaW5kb3dJbmRleCh3aW5kb3dJbmRleCk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gRmlyc3Qgc2VsZWN0IHRoZSB3aW5kb3csIHRoZW4ga2lsbCBpdFxuICAgICAgYXdhaXQgZXhlY0ZpbGVBc3luYygnc2NyZWVuJywgWyctUycsIHNlc3Npb25OYW1lLCAnLXAnLCBTdHJpbmcod2luZG93SW5kZXgpLCAnLVgnLCAna2lsbCddKTtcbiAgICAgIGxvZ2dlci5pbmZvKCdLaWxsZWQgd2luZG93IGluIHNjcmVlbiBzZXNzaW9uJywgeyBzZXNzaW9uTmFtZSwgd2luZG93SW5kZXggfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgd2luZG93JywgeyBzZXNzaW9uTmFtZSwgd2luZG93SW5kZXgsIGVycm9yIH0pO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG59XG4iXX0=