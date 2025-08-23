"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZellijManager = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const logger = (0, logger_js_1.createLogger)('ZellijManager');
class ZellijManager {
    constructor(ptyManager) {
        this.ptyManager = ptyManager;
    }
    /**
     * Validate session name to prevent command injection
     */
    validateSessionName(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('Session name must be a non-empty string');
        }
        // Only allow alphanumeric, dash, underscore, and dot
        if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
            throw new Error('Session name can only contain letters, numbers, dots, dashes, and underscores');
        }
        if (name.length > 100) {
            throw new Error('Session name too long (max 100 characters)');
        }
    }
    /**
     * Strip ANSI escape codes from text
     */
    stripAnsiCodes(text) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes contain control characters
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    }
    static getInstance(ptyManager) {
        if (!ZellijManager.instance) {
            ZellijManager.instance = new ZellijManager(ptyManager);
        }
        return ZellijManager.instance;
    }
    /**
     * Check if zellij is installed and available
     */
    async isAvailable() {
        try {
            await execFileAsync('which', ['zellij']);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * List all zellij sessions
     */
    async listSessions() {
        try {
            const { stdout } = await execFileAsync('zellij', ['list-sessions']);
            if (stdout.includes('No active zellij sessions found')) {
                return [];
            }
            // Parse zellij session output
            // Format: SESSION NAME [EXITED] (CREATED)
            const sessions = [];
            const lines = stdout
                .trim()
                .split('\n')
                .filter((line) => line.trim());
            for (const line of lines) {
                // Strip ANSI codes first
                const cleanLine = this.stripAnsiCodes(line).trim();
                if (!cleanLine)
                    continue;
                // Parse session info
                // Format: "session-name [Created 15s ago]" or "session-name [EXITED] [Created 1h ago]"
                const exited = cleanLine.includes('[EXITED]');
                // Extract session name (everything before the first [)
                const nameMatch = cleanLine.match(/^([^[]+)/);
                if (!nameMatch)
                    continue;
                const name = nameMatch[1].trim();
                // Extract created time if available
                const createdMatch = cleanLine.match(/\[Created ([^\]]+)\]/);
                const created = createdMatch ? createdMatch[1] : 'unknown';
                if (name) {
                    sessions.push({
                        name,
                        created,
                        exited,
                    });
                }
            }
            return sessions;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('No active zellij sessions found')) {
                return [];
            }
            logger.error('Failed to list zellij sessions', { error });
            throw error;
        }
    }
    /**
     * Get tabs for a session (requires being attached to query)
     * Note: Zellij doesn't provide a way to query tabs without being attached
     */
    async getSessionTabs(sessionName) {
        // This would need to be run inside the session
        // For now, return empty as we can't query from outside
        logger.warn('Cannot query tabs for zellij session from outside', { sessionName });
        return [];
    }
    /**
     * Create a new zellij session
     * Note: Zellij requires a terminal, so we create sessions through attachToZellij instead
     */
    async createSession(name, layout) {
        // Zellij can't create detached sessions like tmux
        // Sessions are created when attaching to them
        logger.info('Zellij session will be created on first attach', { name, layout });
        // Store the layout preference if provided
        if (layout) {
            // We could store this in a temporary map or config file
            // For now, we'll just log it
            logger.info('Layout preference noted for session', { name, layout });
        }
    }
    /**
     * Attach to a zellij session through VibeTunnel
     */
    async attachToZellij(sessionName, options) {
        // Zellij attach command with -c flag to create if doesn't exist
        const zellijCommand = ['zellij', 'attach', '-c', sessionName];
        // Add layout if provided and session doesn't exist yet
        if (options?.layout) {
            const sessions = await this.listSessions();
            const sessionExists = sessions.some((s) => s.name === sessionName && !s.exited);
            if (!sessionExists) {
                zellijCommand.push('-l', options.layout);
            }
        }
        // Create a new VibeTunnel session that runs zellij attach
        const sessionOptions = {
            name: `zellij: ${sessionName}`,
            workingDir: options?.workingDir || process.env.HOME || '/',
            cols: options?.cols || 80,
            rows: options?.rows || 24,
            titleMode: options?.titleMode || types_js_1.TitleMode.DYNAMIC,
        };
        const session = await this.ptyManager.createSession(zellijCommand, sessionOptions);
        return session.sessionId;
    }
    /**
     * Kill a zellij session
     */
    async killSession(sessionName) {
        this.validateSessionName(sessionName);
        try {
            // Use delete-session with --force flag to handle both running and exited sessions
            await execFileAsync('zellij', ['delete-session', '--force', sessionName]);
            logger.info('Killed zellij session', { sessionName });
        }
        catch (error) {
            logger.error('Failed to kill zellij session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Delete a zellij session
     */
    async deleteSession(sessionName) {
        this.validateSessionName(sessionName);
        try {
            await execFileAsync('zellij', ['delete-session', sessionName]);
            logger.info('Deleted zellij session', { sessionName });
        }
        catch (error) {
            logger.error('Failed to delete zellij session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Check if inside a zellij session
     */
    isInsideZellij() {
        return !!process.env.ZELLIJ;
    }
    /**
     * Get the current zellij session name if inside zellij
     */
    getCurrentSession() {
        if (!this.isInsideZellij()) {
            return null;
        }
        return process.env.ZELLIJ_SESSION_NAME || null;
    }
}
exports.ZellijManager = ZellijManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiemVsbGlqLW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3plbGxpai1tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGlEQUF5QztBQUN6QywrQkFBaUM7QUFDakMsb0RBQTZFO0FBRTdFLGtEQUFrRDtBQUVsRCxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxlQUFlLENBQUMsQ0FBQztBQVE3QyxNQUFhLGFBQWE7SUFJeEIsWUFBb0IsVUFBc0I7UUFDeEMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDL0IsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQUMsSUFBWTtRQUN0QyxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3RDLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBQ0QscURBQXFEO1FBQ3JELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNwQyxNQUFNLElBQUksS0FBSyxDQUNiLCtFQUErRSxDQUNoRixDQUFDO1FBQ0osQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7UUFDaEUsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNLLGNBQWMsQ0FBQyxJQUFZO1FBQ2pDLHdHQUF3RztRQUN4RyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBc0I7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Q0FBQyxnQkFBZ0IsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO1lBQy9ELE1BQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3pELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQ3hFLE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILGNBQWM7UUFDWixPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztJQUM5QixDQUFDO0lBRUQ7O09BRUc7SUFDSCxpQkFBaUI7UUFDZixJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLENBQUM7WUFDM0IsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixJQUFJLElBQUksQ0FBQztJQUNqRCxDQUFDO0NBQ0Y7QUExTkQsc0NBME5DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgdHlwZSBTZXNzaW9uQ3JlYXRlT3B0aW9ucywgVGl0bGVNb2RlIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgUHR5TWFuYWdlciB9IGZyb20gJy4uL3B0eS9wdHktbWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignWmVsbGlqTWFuYWdlcicpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFplbGxpalNlc3Npb24ge1xuICBuYW1lOiBzdHJpbmc7XG4gIGNyZWF0ZWQ6IHN0cmluZztcbiAgZXhpdGVkOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgWmVsbGlqTWFuYWdlciB7XG4gIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBaZWxsaWpNYW5hZ2VyO1xuICBwcml2YXRlIHB0eU1hbmFnZXI6IFB0eU1hbmFnZXI7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyKSB7XG4gICAgdGhpcy5wdHlNYW5hZ2VyID0gcHR5TWFuYWdlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBzZXNzaW9uIG5hbWUgdG8gcHJldmVudCBjb21tYW5kIGluamVjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZVNlc3Npb25OYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghbmFtZSB8fCB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiBuYW1lIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nJyk7XG4gICAgfVxuICAgIC8vIE9ubHkgYWxsb3cgYWxwaGFudW1lcmljLCBkYXNoLCB1bmRlcnNjb3JlLCBhbmQgZG90XG4gICAgaWYgKCEvXlthLXpBLVowLTkuXy1dKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ1Nlc3Npb24gbmFtZSBjYW4gb25seSBjb250YWluIGxldHRlcnMsIG51bWJlcnMsIGRvdHMsIGRhc2hlcywgYW5kIHVuZGVyc2NvcmVzJ1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG5hbWUubGVuZ3RoID4gMTAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Nlc3Npb24gbmFtZSB0b28gbG9uZyAobWF4IDEwMCBjaGFyYWN0ZXJzKScpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTdHJpcCBBTlNJIGVzY2FwZSBjb2RlcyBmcm9tIHRleHRcbiAgICovXG4gIHByaXZhdGUgc3RyaXBBbnNpQ29kZXModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQ29udHJvbENoYXJhY3RlcnNJblJlZ2V4OiBBTlNJIGVzY2FwZSBjb2RlcyBjb250YWluIGNvbnRyb2wgY2hhcmFjdGVyc1xuICAgIHJldHVybiB0ZXh0LnJlcGxhY2UoL1xceDFiXFxbWzAtOTtdKm0vZywgJycpO1xuICB9XG5cbiAgc3RhdGljIGdldEluc3RhbmNlKHB0eU1hbmFnZXI6IFB0eU1hbmFnZXIpOiBaZWxsaWpNYW5hZ2VyIHtcbiAgICBpZiAoIVplbGxpak1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIFplbGxpak1hbmFnZXIuaW5zdGFuY2UgPSBuZXcgWmVsbGlqTWFuYWdlcihwdHlNYW5hZ2VyKTtcbiAgICB9XG4gICAgcmV0dXJuIFplbGxpak1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgemVsbGlqIGlzIGluc3RhbGxlZCBhbmQgYXZhaWxhYmxlXG4gICAqL1xuICBhc3luYyBpc0F2YWlsYWJsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgZXhlY0ZpbGVBc3luYygnd2hpY2gnLCBbJ3plbGxpaiddKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0IGFsbCB6ZWxsaWogc2Vzc2lvbnNcbiAgICovXG4gIGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPFplbGxpalNlc3Npb25bXT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYygnemVsbGlqJywgWydsaXN0LXNlc3Npb25zJ10pO1xuXG4gICAgICBpZiAoc3Rkb3V0LmluY2x1ZGVzKCdObyBhY3RpdmUgemVsbGlqIHNlc3Npb25zIGZvdW5kJykpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgfVxuXG4gICAgICAvLyBQYXJzZSB6ZWxsaWogc2Vzc2lvbiBvdXRwdXRcbiAgICAgIC8vIEZvcm1hdDogU0VTU0lPTiBOQU1FIFtFWElURURdIChDUkVBVEVEKVxuICAgICAgY29uc3Qgc2Vzc2lvbnM6IFplbGxpalNlc3Npb25bXSA9IFtdO1xuICAgICAgY29uc3QgbGluZXMgPSBzdGRvdXRcbiAgICAgICAgLnRyaW0oKVxuICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUudHJpbSgpKTtcblxuICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgIC8vIFN0cmlwIEFOU0kgY29kZXMgZmlyc3RcbiAgICAgICAgY29uc3QgY2xlYW5MaW5lID0gdGhpcy5zdHJpcEFuc2lDb2RlcyhsaW5lKS50cmltKCk7XG5cbiAgICAgICAgaWYgKCFjbGVhbkxpbmUpIGNvbnRpbnVlO1xuXG4gICAgICAgIC8vIFBhcnNlIHNlc3Npb24gaW5mb1xuICAgICAgICAvLyBGb3JtYXQ6IFwic2Vzc2lvbi1uYW1lIFtDcmVhdGVkIDE1cyBhZ29dXCIgb3IgXCJzZXNzaW9uLW5hbWUgW0VYSVRFRF0gW0NyZWF0ZWQgMWggYWdvXVwiXG4gICAgICAgIGNvbnN0IGV4aXRlZCA9IGNsZWFuTGluZS5pbmNsdWRlcygnW0VYSVRFRF0nKTtcblxuICAgICAgICAvLyBFeHRyYWN0IHNlc3Npb24gbmFtZSAoZXZlcnl0aGluZyBiZWZvcmUgdGhlIGZpcnN0IFspXG4gICAgICAgIGNvbnN0IG5hbWVNYXRjaCA9IGNsZWFuTGluZS5tYXRjaCgvXihbXltdKykvKTtcbiAgICAgICAgaWYgKCFuYW1lTWF0Y2gpIGNvbnRpbnVlO1xuXG4gICAgICAgIGNvbnN0IG5hbWUgPSBuYW1lTWF0Y2hbMV0udHJpbSgpO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgY3JlYXRlZCB0aW1lIGlmIGF2YWlsYWJsZVxuICAgICAgICBjb25zdCBjcmVhdGVkTWF0Y2ggPSBjbGVhbkxpbmUubWF0Y2goL1xcW0NyZWF0ZWQgKFteXFxdXSspXFxdLyk7XG4gICAgICAgIGNvbnN0IGNyZWF0ZWQgPSBjcmVhdGVkTWF0Y2ggPyBjcmVhdGVkTWF0Y2hbMV0gOiAndW5rbm93bic7XG5cbiAgICAgICAgaWYgKG5hbWUpIHtcbiAgICAgICAgICBzZXNzaW9ucy5wdXNoKHtcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBjcmVhdGVkLFxuICAgICAgICAgICAgZXhpdGVkLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZXNzaW9ucztcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnTm8gYWN0aXZlIHplbGxpaiBzZXNzaW9ucyBmb3VuZCcpKSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGxpc3QgemVsbGlqIHNlc3Npb25zJywgeyBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGFicyBmb3IgYSBzZXNzaW9uIChyZXF1aXJlcyBiZWluZyBhdHRhY2hlZCB0byBxdWVyeSlcbiAgICogTm90ZTogWmVsbGlqIGRvZXNuJ3QgcHJvdmlkZSBhIHdheSB0byBxdWVyeSB0YWJzIHdpdGhvdXQgYmVpbmcgYXR0YWNoZWRcbiAgICovXG4gIGFzeW5jIGdldFNlc3Npb25UYWJzKHNlc3Npb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gICAgLy8gVGhpcyB3b3VsZCBuZWVkIHRvIGJlIHJ1biBpbnNpZGUgdGhlIHNlc3Npb25cbiAgICAvLyBGb3Igbm93LCByZXR1cm4gZW1wdHkgYXMgd2UgY2FuJ3QgcXVlcnkgZnJvbSBvdXRzaWRlXG4gICAgbG9nZ2VyLndhcm4oJ0Nhbm5vdCBxdWVyeSB0YWJzIGZvciB6ZWxsaWogc2Vzc2lvbiBmcm9tIG91dHNpZGUnLCB7IHNlc3Npb25OYW1lIH0pO1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuZXcgemVsbGlqIHNlc3Npb25cbiAgICogTm90ZTogWmVsbGlqIHJlcXVpcmVzIGEgdGVybWluYWwsIHNvIHdlIGNyZWF0ZSBzZXNzaW9ucyB0aHJvdWdoIGF0dGFjaFRvWmVsbGlqIGluc3RlYWRcbiAgICovXG4gIGFzeW5jIGNyZWF0ZVNlc3Npb24obmFtZTogc3RyaW5nLCBsYXlvdXQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBaZWxsaWogY2FuJ3QgY3JlYXRlIGRldGFjaGVkIHNlc3Npb25zIGxpa2UgdG11eFxuICAgIC8vIFNlc3Npb25zIGFyZSBjcmVhdGVkIHdoZW4gYXR0YWNoaW5nIHRvIHRoZW1cbiAgICBsb2dnZXIuaW5mbygnWmVsbGlqIHNlc3Npb24gd2lsbCBiZSBjcmVhdGVkIG9uIGZpcnN0IGF0dGFjaCcsIHsgbmFtZSwgbGF5b3V0IH0pO1xuXG4gICAgLy8gU3RvcmUgdGhlIGxheW91dCBwcmVmZXJlbmNlIGlmIHByb3ZpZGVkXG4gICAgaWYgKGxheW91dCkge1xuICAgICAgLy8gV2UgY291bGQgc3RvcmUgdGhpcyBpbiBhIHRlbXBvcmFyeSBtYXAgb3IgY29uZmlnIGZpbGVcbiAgICAgIC8vIEZvciBub3csIHdlJ2xsIGp1c3QgbG9nIGl0XG4gICAgICBsb2dnZXIuaW5mbygnTGF5b3V0IHByZWZlcmVuY2Ugbm90ZWQgZm9yIHNlc3Npb24nLCB7IG5hbWUsIGxheW91dCB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQXR0YWNoIHRvIGEgemVsbGlqIHNlc3Npb24gdGhyb3VnaCBWaWJlVHVubmVsXG4gICAqL1xuICBhc3luYyBhdHRhY2hUb1plbGxpaihcbiAgICBzZXNzaW9uTmFtZTogc3RyaW5nLFxuICAgIG9wdGlvbnM/OiBQYXJ0aWFsPFNlc3Npb25DcmVhdGVPcHRpb25zPiAmIHsgbGF5b3V0Pzogc3RyaW5nIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICAvLyBaZWxsaWogYXR0YWNoIGNvbW1hbmQgd2l0aCAtYyBmbGFnIHRvIGNyZWF0ZSBpZiBkb2Vzbid0IGV4aXN0XG4gICAgY29uc3QgemVsbGlqQ29tbWFuZCA9IFsnemVsbGlqJywgJ2F0dGFjaCcsICctYycsIHNlc3Npb25OYW1lXTtcblxuICAgIC8vIEFkZCBsYXlvdXQgaWYgcHJvdmlkZWQgYW5kIHNlc3Npb24gZG9lc24ndCBleGlzdCB5ZXRcbiAgICBpZiAob3B0aW9ucz8ubGF5b3V0KSB7XG4gICAgICBjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMubGlzdFNlc3Npb25zKCk7XG4gICAgICBjb25zdCBzZXNzaW9uRXhpc3RzID0gc2Vzc2lvbnMuc29tZSgocykgPT4gcy5uYW1lID09PSBzZXNzaW9uTmFtZSAmJiAhcy5leGl0ZWQpO1xuICAgICAgaWYgKCFzZXNzaW9uRXhpc3RzKSB7XG4gICAgICAgIHplbGxpakNvbW1hbmQucHVzaCgnLWwnLCBvcHRpb25zLmxheW91dCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGEgbmV3IFZpYmVUdW5uZWwgc2Vzc2lvbiB0aGF0IHJ1bnMgemVsbGlqIGF0dGFjaFxuICAgIGNvbnN0IHNlc3Npb25PcHRpb25zOiBTZXNzaW9uQ3JlYXRlT3B0aW9ucyA9IHtcbiAgICAgIG5hbWU6IGB6ZWxsaWo6ICR7c2Vzc2lvbk5hbWV9YCxcbiAgICAgIHdvcmtpbmdEaXI6IG9wdGlvbnM/LndvcmtpbmdEaXIgfHwgcHJvY2Vzcy5lbnYuSE9NRSB8fCAnLycsXG4gICAgICBjb2xzOiBvcHRpb25zPy5jb2xzIHx8IDgwLFxuICAgICAgcm93czogb3B0aW9ucz8ucm93cyB8fCAyNCxcbiAgICAgIHRpdGxlTW9kZTogb3B0aW9ucz8udGl0bGVNb2RlIHx8IFRpdGxlTW9kZS5EWU5BTUlDLFxuICAgIH07XG5cbiAgICBjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5wdHlNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oemVsbGlqQ29tbWFuZCwgc2Vzc2lvbk9wdGlvbnMpO1xuICAgIHJldHVybiBzZXNzaW9uLnNlc3Npb25JZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBLaWxsIGEgemVsbGlqIHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGtpbGxTZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFVzZSBkZWxldGUtc2Vzc2lvbiB3aXRoIC0tZm9yY2UgZmxhZyB0byBoYW5kbGUgYm90aCBydW5uaW5nIGFuZCBleGl0ZWQgc2Vzc2lvbnNcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3plbGxpaicsIFsnZGVsZXRlLXNlc3Npb24nLCAnLS1mb3JjZScsIHNlc3Npb25OYW1lXSk7XG4gICAgICBsb2dnZXIuaW5mbygnS2lsbGVkIHplbGxpaiBzZXNzaW9uJywgeyBzZXNzaW9uTmFtZSB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8ga2lsbCB6ZWxsaWogc2Vzc2lvbicsIHsgc2Vzc2lvbk5hbWUsIGVycm9yIH0pO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIERlbGV0ZSBhIHplbGxpaiBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBkZWxldGVTZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3plbGxpaicsIFsnZGVsZXRlLXNlc3Npb24nLCBzZXNzaW9uTmFtZV0pO1xuICAgICAgbG9nZ2VyLmluZm8oJ0RlbGV0ZWQgemVsbGlqIHNlc3Npb24nLCB7IHNlc3Npb25OYW1lIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBkZWxldGUgemVsbGlqIHNlc3Npb24nLCB7IHNlc3Npb25OYW1lLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBpbnNpZGUgYSB6ZWxsaWogc2Vzc2lvblxuICAgKi9cbiAgaXNJbnNpZGVaZWxsaWooKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhcHJvY2Vzcy5lbnYuWkVMTElKO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCB6ZWxsaWogc2Vzc2lvbiBuYW1lIGlmIGluc2lkZSB6ZWxsaWpcbiAgICovXG4gIGdldEN1cnJlbnRTZXNzaW9uKCk6IHN0cmluZyB8IG51bGwge1xuICAgIGlmICghdGhpcy5pc0luc2lkZVplbGxpaigpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHByb2Nlc3MuZW52LlpFTExJSl9TRVNTSU9OX05BTUUgfHwgbnVsbDtcbiAgfVxufVxuIl19