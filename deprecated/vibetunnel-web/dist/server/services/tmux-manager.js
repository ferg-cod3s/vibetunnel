"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TmuxManager = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const logger = (0, logger_js_1.createLogger)('TmuxManager');
class TmuxManager {
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
     * Validate window index
     */
    validateWindowIndex(index) {
        if (!Number.isInteger(index) || index < 0 || index > 999) {
            throw new Error('Window index must be an integer between 0 and 999');
        }
    }
    /**
     * Validate pane index
     */
    validatePaneIndex(index) {
        if (!Number.isInteger(index) || index < 0 || index > 999) {
            throw new Error('Pane index must be an integer between 0 and 999');
        }
    }
    static getInstance(ptyManager) {
        if (!TmuxManager.instance) {
            TmuxManager.instance = new TmuxManager(ptyManager);
        }
        return TmuxManager.instance;
    }
    /**
     * Check if tmux is installed and available
     */
    async isAvailable() {
        try {
            await execFileAsync('which', ['tmux']);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * List all tmux sessions
     */
    async listSessions() {
        try {
            const { stdout } = await execFileAsync('tmux', [
                'list-sessions',
                '-F',
                '#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}|#{session_activity}|#{?session_active,active,}',
            ]);
            return stdout
                .trim()
                .split('\n')
                .filter((line) => line?.includes('|'))
                .map((line) => {
                const [name, windows, created, attached, activity, current] = line.split('|');
                return {
                    name,
                    windows: Number.parseInt(windows, 10),
                    created,
                    attached: attached === 'attached',
                    activity,
                    current: current === 'active',
                };
            });
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('no server running')) {
                return [];
            }
            throw error;
        }
    }
    /**
     * List windows in a tmux session
     */
    async listWindows(sessionName) {
        this.validateSessionName(sessionName);
        try {
            const { stdout } = await execFileAsync('tmux', [
                'list-windows',
                '-t',
                sessionName,
                '-F',
                '#{session_name}|#{window_index}|#{window_name}|#{?window_active,active,}|#{window_panes}',
            ]);
            return stdout
                .trim()
                .split('\n')
                .filter((line) => line)
                .map((line) => {
                const [session, index, name, active, panes] = line.split('|');
                return {
                    session,
                    index: Number.parseInt(index, 10),
                    name,
                    active: active === 'active',
                    panes: Number.parseInt(panes, 10),
                };
            });
        }
        catch (error) {
            logger.error('Failed to list windows', { sessionName, error });
            throw error;
        }
    }
    /**
     * List panes in a window
     */
    async listPanes(sessionName, windowIndex) {
        this.validateSessionName(sessionName);
        if (windowIndex !== undefined) {
            this.validateWindowIndex(windowIndex);
        }
        try {
            const targetArgs = windowIndex !== undefined ? [sessionName, String(windowIndex)].join(':') : sessionName;
            const { stdout } = await execFileAsync('tmux', [
                'list-panes',
                '-t',
                targetArgs,
                '-F',
                '#{session_name}|#{window_index}|#{pane_index}|#{?pane_active,active,}|#{pane_title}|#{pane_pid}|#{pane_current_command}|#{pane_width}|#{pane_height}|#{pane_current_path}',
            ]);
            return stdout
                .trim()
                .split('\n')
                .filter((line) => line)
                .map((line) => {
                const [session, window, index, active, title, pid, command, width, height, currentPath] = line.split('|');
                return {
                    session,
                    window: Number.parseInt(window, 10),
                    index: Number.parseInt(index, 10),
                    active: active === 'active',
                    title: title || undefined,
                    pid: pid ? Number.parseInt(pid, 10) : undefined,
                    command: command || undefined,
                    width: Number.parseInt(width, 10),
                    height: Number.parseInt(height, 10),
                    currentPath: currentPath || undefined,
                };
            });
        }
        catch (error) {
            logger.error('Failed to list panes', { sessionName, windowIndex, error });
            throw error;
        }
    }
    /**
     * Create a new tmux session
     */
    async createSession(name, command) {
        this.validateSessionName(name);
        try {
            const args = ['new-session', '-d', '-s', name];
            // If command is provided, add it as separate arguments
            if (command && command.length > 0) {
                // Validate command arguments
                for (const arg of command) {
                    if (typeof arg !== 'string') {
                        throw new Error('Command arguments must be strings');
                    }
                }
                args.push(...command);
            }
            await execFileAsync('tmux', args);
            logger.info('Created tmux session', { name, command });
        }
        catch (error) {
            logger.error('Failed to create tmux session', { name, error });
            throw error;
        }
    }
    /**
     * Attach to a tmux session/window/pane through VibeTunnel
     */
    async attachToTmux(sessionName, windowIndex, paneIndex, options) {
        let target = sessionName;
        if (windowIndex !== undefined) {
            target = `${sessionName}:${windowIndex}`;
            if (paneIndex !== undefined) {
                target = `${target}.${paneIndex}`;
            }
        }
        // Always attach to session/window level, not individual panes
        // This gives users full control over pane management once attached
        const attachTarget = windowIndex !== undefined ? `${sessionName}:${windowIndex}` : sessionName;
        const tmuxCommand = ['tmux', 'attach-session', '-t', attachTarget];
        // Create a new VibeTunnel session that runs tmux attach
        const sessionOptions = {
            name: `tmux: ${target}`,
            workingDir: options?.workingDir || process.env.HOME || '/',
            cols: options?.cols || 80,
            rows: options?.rows || 24,
            titleMode: options?.titleMode || types_js_1.TitleMode.DYNAMIC,
        };
        const session = await this.ptyManager.createSession(tmuxCommand, sessionOptions);
        return session.sessionId;
    }
    /**
     * Send a command to a specific tmux pane
     */
    async sendToPane(sessionName, command, windowIndex, paneIndex) {
        this.validateSessionName(sessionName);
        if (windowIndex !== undefined) {
            this.validateWindowIndex(windowIndex);
        }
        if (paneIndex !== undefined) {
            this.validatePaneIndex(paneIndex);
        }
        if (typeof command !== 'string') {
            throw new Error('Command must be a string');
        }
        let targetArgs = sessionName;
        if (windowIndex !== undefined) {
            targetArgs = `${sessionName}:${windowIndex}`;
            if (paneIndex !== undefined) {
                targetArgs = `${targetArgs}.${paneIndex}`;
            }
        }
        try {
            // Use send-keys to send the command
            await execFileAsync('tmux', ['send-keys', '-t', targetArgs, command, 'Enter']);
            logger.info('Sent command to tmux pane', { target: targetArgs, command });
        }
        catch (error) {
            logger.error('Failed to send command to tmux pane', { target: targetArgs, command, error });
            throw error;
        }
    }
    /**
     * Kill a tmux session
     */
    async killSession(sessionName) {
        this.validateSessionName(sessionName);
        try {
            await execFileAsync('tmux', ['kill-session', '-t', sessionName]);
            logger.info('Killed tmux session', { sessionName });
        }
        catch (error) {
            logger.error('Failed to kill tmux session', { sessionName, error });
            throw error;
        }
    }
    /**
     * Kill a tmux window
     */
    async killWindow(sessionName, windowIndex) {
        this.validateSessionName(sessionName);
        this.validateWindowIndex(windowIndex);
        try {
            const target = `${sessionName}:${windowIndex}`;
            await execFileAsync('tmux', ['kill-window', '-t', target]);
            logger.info('Killed tmux window', { sessionName, windowIndex });
        }
        catch (error) {
            logger.error('Failed to kill tmux window', { sessionName, windowIndex, error });
            throw error;
        }
    }
    /**
     * Kill a tmux pane
     */
    async killPane(sessionName, paneId) {
        // Validate paneId format (should be session:window.pane)
        if (!paneId || typeof paneId !== 'string') {
            throw new Error('Pane ID must be a non-empty string');
        }
        // Basic validation for pane ID format
        if (!/^[a-zA-Z0-9._:-]+$/.test(paneId)) {
            throw new Error('Invalid pane ID format');
        }
        try {
            await execFileAsync('tmux', ['kill-pane', '-t', paneId]);
            logger.info('Killed tmux pane', { sessionName, paneId });
        }
        catch (error) {
            logger.error('Failed to kill tmux pane', { sessionName, paneId, error });
            throw error;
        }
    }
    /**
     * Check if inside a tmux session
     */
    isInsideTmux() {
        return !!process.env.TMUX;
    }
    /**
     * Get the current tmux session name if inside tmux
     */
    getCurrentSession() {
        if (!this.isInsideTmux()) {
            return null;
        }
        try {
            const result = (0, child_process_1.execFileSync)('tmux', ['display-message', '-p', '#{session_name}'], {
                encoding: 'utf8',
            });
            return result.trim();
        }
        catch {
            return null;
        }
    }
}
exports.TmuxManager = TmuxManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG11eC1tYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy90bXV4LW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQXVEO0FBQ3ZELCtCQUFpQztBQUVqQyxvREFBNkU7QUFFN0Usa0RBQWtEO0FBRWxELE1BQU0sYUFBYSxHQUFHLElBQUEsZ0JBQVMsRUFBQyx3QkFBUSxDQUFDLENBQUM7QUFDMUMsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRTNDLE1BQWEsV0FBVztJQUl0QixZQUFvQixVQUFzQjtRQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUMvQixDQUFDO0lBRUQ7O09BRUc7SUFDSyxtQkFBbUIsQ0FBQyxJQUFZO1FBQ3RDLElBQUksQ0FBQyxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDdEMsTUFBTSxJQUFJLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQzdELENBQUM7UUFDRCxxREFBcUQ7UUFDckQsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQ3BDLE1BQU0sSUFBSSxLQUFLLENBQ2IsK0VBQStFLENBQ2hGLENBQUM7UUFDSixDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0ssbUJBQW1CLENBQUMsS0FBYTtRQUN2QyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssR0FBRyxHQUFHLEVBQUUsQ0FBQztZQUN6RCxNQUFNLElBQUksS0FB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QkFBaUIsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsRUFBRTtnQkFDaEYsUUFBUSxFQUFFLE1BQU07YUFDakIsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdkIsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNQLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7Q0FDRjtBQXZXRCxrQ0F1V0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBleGVjRmlsZSwgZXhlY0ZpbGVTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB0eXBlIHsgVG11eFBhbmUsIFRtdXhTZXNzaW9uLCBUbXV4V2luZG93IH0gZnJvbSAnLi4vLi4vc2hhcmVkL3RtdXgtdHlwZXMuanMnO1xuaW1wb3J0IHsgdHlwZSBTZXNzaW9uQ3JlYXRlT3B0aW9ucywgVGl0bGVNb2RlIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgUHR5TWFuYWdlciB9IGZyb20gJy4uL3B0eS9wdHktbWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignVG11eE1hbmFnZXInKTtcblxuZXhwb3J0IGNsYXNzIFRtdXhNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IFRtdXhNYW5hZ2VyO1xuICBwcml2YXRlIHB0eU1hbmFnZXI6IFB0eU1hbmFnZXI7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyKSB7XG4gICAgdGhpcy5wdHlNYW5hZ2VyID0gcHR5TWFuYWdlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBzZXNzaW9uIG5hbWUgdG8gcHJldmVudCBjb21tYW5kIGluamVjdGlvblxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZVNlc3Npb25OYW1lKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghbmFtZSB8fCB0eXBlb2YgbmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiBuYW1lIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nJyk7XG4gICAgfVxuICAgIC8vIE9ubHkgYWxsb3cgYWxwaGFudW1lcmljLCBkYXNoLCB1bmRlcnNjb3JlLCBhbmQgZG90XG4gICAgaWYgKCEvXlthLXpBLVowLTkuXy1dKyQvLnRlc3QobmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgJ1Nlc3Npb24gbmFtZSBjYW4gb25seSBjb250YWluIGxldHRlcnMsIG51bWJlcnMsIGRvdHMsIGRhc2hlcywgYW5kIHVuZGVyc2NvcmVzJ1xuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKG5hbWUubGVuZ3RoID4gMTAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Nlc3Npb24gbmFtZSB0b28gbG9uZyAobWF4IDEwMCBjaGFyYWN0ZXJzKScpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB3aW5kb3cgaW5kZXhcbiAgICovXG4gIHByaXZhdGUgdmFsaWRhdGVXaW5kb3dJbmRleChpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGluZGV4KSB8fCBpbmRleCA8IDAgfHwgaW5kZXggPiA5OTkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignV2luZG93IGluZGV4IG11c3QgYmUgYW4gaW50ZWdlciBiZXR3ZWVuIDAgYW5kIDk5OScpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBwYW5lIGluZGV4XG4gICAqL1xuICBwcml2YXRlIHZhbGlkYXRlUGFuZUluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoaW5kZXgpIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+IDk5OSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQYW5lIGluZGV4IG11c3QgYmUgYW4gaW50ZWdlciBiZXR3ZWVuIDAgYW5kIDk5OScpO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyBnZXRJbnN0YW5jZShwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyKTogVG11eE1hbmFnZXIge1xuICAgIGlmICghVG11eE1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIFRtdXhNYW5hZ2VyLmluc3RhbmNlID0gbmV3IFRtdXhNYW5hZ2VyKHB0eU1hbmFnZXIpO1xuICAgIH1cbiAgICByZXR1cm4gVG11eE1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgdG11eCBpcyBpbnN0YWxsZWQgYW5kIGF2YWlsYWJsZVxuICAgKi9cbiAgYXN5bmMgaXNBdmFpbGFibGUoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3doaWNoJywgWyd0bXV4J10pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgYWxsIHRtdXggc2Vzc2lvbnNcbiAgICovXG4gIGFzeW5jIGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPFRtdXhTZXNzaW9uW10+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBbXG4gICAgICAgICdsaXN0LXNlc3Npb25zJyxcbiAgICAgICAgJy1GJyxcbiAgICAgICAgJyN7c2Vzc2lvbl9uYW1lfXwje3Nlc3Npb25fd2luZG93c318I3tzZXNzaW9uX2NyZWF0ZWR9fCN7P3Nlc3Npb25fYXR0YWNoZWQsYXR0YWNoZWQsZGV0YWNoZWR9fCN7c2Vzc2lvbl9hY3Rpdml0eX18I3s/c2Vzc2lvbl9hY3RpdmUsYWN0aXZlLH0nLFxuICAgICAgXSk7XG5cbiAgICAgIHJldHVybiBzdGRvdXRcbiAgICAgICAgLnRyaW0oKVxuICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmU/LmluY2x1ZGVzKCd8JykpXG4gICAgICAgIC5tYXAoKGxpbmUpID0+IHtcbiAgICAgICAgICBjb25zdCBbbmFtZSwgd2luZG93cywgY3JlYXRlZCwgYXR0YWNoZWQsIGFjdGl2aXR5LCBjdXJyZW50XSA9IGxpbmUuc3BsaXQoJ3wnKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgIHdpbmRvd3M6IE51bWJlci5wYXJzZUludCh3aW5kb3dzLCAxMCksXG4gICAgICAgICAgICBjcmVhdGVkLFxuICAgICAgICAgICAgYXR0YWNoZWQ6IGF0dGFjaGVkID09PSAnYXR0YWNoZWQnLFxuICAgICAgICAgICAgYWN0aXZpdHksXG4gICAgICAgICAgICBjdXJyZW50OiBjdXJyZW50ID09PSAnYWN0aXZlJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnbm8gc2VydmVyIHJ1bm5pbmcnKSkge1xuICAgICAgICByZXR1cm4gW107XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTGlzdCB3aW5kb3dzIGluIGEgdG11eCBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBsaXN0V2luZG93cyhzZXNzaW9uTmFtZTogc3RyaW5nKTogUHJvbWlzZTxUbXV4V2luZG93W10+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBleGVjRmlsZUFzeW5jKCd0bXV4JywgW1xuICAgICAgICAnbGlzdC13aW5kb3dzJyxcbiAgICAgICAgJy10JyxcbiAgICAgICAgc2Vzc2lvbk5hbWUsXG4gICAgICAgICctRicsXG4gICAgICAgICcje3Nlc3Npb25fbmFtZX18I3t3aW5kb3dfaW5kZXh9fCN7d2luZG93X25hbWV9fCN7P3dpbmRvd19hY3RpdmUsYWN0aXZlLH18I3t3aW5kb3dfcGFuZXN9JyxcbiAgICAgIF0pO1xuXG4gICAgICByZXR1cm4gc3Rkb3V0XG4gICAgICAgIC50cmltKClcbiAgICAgICAgLnNwbGl0KCdcXG4nKVxuICAgICAgICAuZmlsdGVyKChsaW5lKSA9PiBsaW5lKVxuICAgICAgICAubWFwKChsaW5lKSA9PiB7XG4gICAgICAgICAgY29uc3QgW3Nlc3Npb24sIGluZGV4LCBuYW1lLCBhY3RpdmUsIHBhbmVzXSA9IGxpbmUuc3BsaXQoJ3wnKTtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2Vzc2lvbixcbiAgICAgICAgICAgIGluZGV4OiBOdW1iZXIucGFyc2VJbnQoaW5kZXgsIDEwKSxcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBhY3RpdmU6IGFjdGl2ZSA9PT0gJ2FjdGl2ZScsXG4gICAgICAgICAgICBwYW5lczogTnVtYmVyLnBhcnNlSW50KHBhbmVzLCAxMCksXG4gICAgICAgICAgfTtcbiAgICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGxpc3Qgd2luZG93cycsIHsgc2Vzc2lvbk5hbWUsIGVycm9yIH0pO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIExpc3QgcGFuZXMgaW4gYSB3aW5kb3dcbiAgICovXG4gIGFzeW5jIGxpc3RQYW5lcyhzZXNzaW9uTmFtZTogc3RyaW5nLCB3aW5kb3dJbmRleD86IG51bWJlcik6IFByb21pc2U8VG11eFBhbmVbXT4ge1xuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uTmFtZShzZXNzaW9uTmFtZSk7XG4gICAgaWYgKHdpbmRvd0luZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVXaW5kb3dJbmRleCh3aW5kb3dJbmRleCk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHRhcmdldEFyZ3MgPVxuICAgICAgICB3aW5kb3dJbmRleCAhPT0gdW5kZWZpbmVkID8gW3Nlc3Npb25OYW1lLCBTdHJpbmcod2luZG93SW5kZXgpXS5qb2luKCc6JykgOiBzZXNzaW9uTmFtZTtcblxuICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBbXG4gICAgICAgICdsaXN0LXBhbmVzJyxcbiAgICAgICAgJy10JyxcbiAgICAgICAgdGFyZ2V0QXJncyxcbiAgICAgICAgJy1GJyxcbiAgICAgICAgJyN7c2Vzc2lvbl9uYW1lfXwje3dpbmRvd19pbmRleH18I3twYW5lX2luZGV4fXwjez9wYW5lX2FjdGl2ZSxhY3RpdmUsfXwje3BhbmVfdGl0bGV9fCN7cGFuZV9waWR9fCN7cGFuZV9jdXJyZW50X2NvbW1hbmR9fCN7cGFuZV93aWR0aH18I3twYW5lX2hlaWdodH18I3twYW5lX2N1cnJlbnRfcGF0aH0nLFxuICAgICAgXSk7XG5cbiAgICAgIHJldHVybiBzdGRvdXRcbiAgICAgICAgLnRyaW0oKVxuICAgICAgICAuc3BsaXQoJ1xcbicpXG4gICAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUpXG4gICAgICAgIC5tYXAoKGxpbmUpID0+IHtcbiAgICAgICAgICBjb25zdCBbc2Vzc2lvbiwgd2luZG93LCBpbmRleCwgYWN0aXZlLCB0aXRsZSwgcGlkLCBjb21tYW5kLCB3aWR0aCwgaGVpZ2h0LCBjdXJyZW50UGF0aF0gPVxuICAgICAgICAgICAgbGluZS5zcGxpdCgnfCcpO1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzZXNzaW9uLFxuICAgICAgICAgICAgd2luZG93OiBOdW1iZXIucGFyc2VJbnQod2luZG93LCAxMCksXG4gICAgICAgICAgICBpbmRleDogTnVtYmVyLnBhcnNlSW50KGluZGV4LCAxMCksXG4gICAgICAgICAgICBhY3RpdmU6IGFjdGl2ZSA9PT0gJ2FjdGl2ZScsXG4gICAgICAgICAgICB0aXRsZTogdGl0bGUgfHwgdW5kZWZpbmVkLFxuICAgICAgICAgICAgcGlkOiBwaWQgPyBOdW1iZXIucGFyc2VJbnQocGlkLCAxMCkgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICBjb21tYW5kOiBjb21tYW5kIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgICAgIHdpZHRoOiBOdW1iZXIucGFyc2VJbnQod2lkdGgsIDEwKSxcbiAgICAgICAgICAgIGhlaWdodDogTnVtYmVyLnBhcnNlSW50KGhlaWdodCwgMTApLFxuICAgICAgICAgICAgY3VycmVudFBhdGg6IGN1cnJlbnRQYXRoIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gbGlzdCBwYW5lcycsIHsgc2Vzc2lvbk5hbWUsIHdpbmRvd0luZGV4LCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBuZXcgdG11eCBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBjcmVhdGVTZXNzaW9uKG5hbWU6IHN0cmluZywgY29tbWFuZD86IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25OYW1lKG5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSBbJ25ldy1zZXNzaW9uJywgJy1kJywgJy1zJywgbmFtZV07XG5cbiAgICAgIC8vIElmIGNvbW1hbmQgaXMgcHJvdmlkZWQsIGFkZCBpdCBhcyBzZXBhcmF0ZSBhcmd1bWVudHNcbiAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBjb21tYW5kIGFyZ3VtZW50c1xuICAgICAgICBmb3IgKGNvbnN0IGFyZyBvZiBjb21tYW5kKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBhcmcgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvbW1hbmQgYXJndW1lbnRzIG11c3QgYmUgc3RyaW5ncycpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhcmdzLnB1c2goLi4uY29tbWFuZCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBhcmdzKTtcbiAgICAgIGxvZ2dlci5pbmZvKCdDcmVhdGVkIHRtdXggc2Vzc2lvbicsIHsgbmFtZSwgY29tbWFuZCB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIHRtdXggc2Vzc2lvbicsIHsgbmFtZSwgZXJyb3IgfSk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQXR0YWNoIHRvIGEgdG11eCBzZXNzaW9uL3dpbmRvdy9wYW5lIHRocm91Z2ggVmliZVR1bm5lbFxuICAgKi9cbiAgYXN5bmMgYXR0YWNoVG9UbXV4KFxuICAgIHNlc3Npb25OYW1lOiBzdHJpbmcsXG4gICAgd2luZG93SW5kZXg/OiBudW1iZXIsXG4gICAgcGFuZUluZGV4PzogbnVtYmVyLFxuICAgIG9wdGlvbnM/OiBQYXJ0aWFsPFNlc3Npb25DcmVhdGVPcHRpb25zPlxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGxldCB0YXJnZXQgPSBzZXNzaW9uTmFtZTtcbiAgICBpZiAod2luZG93SW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGFyZ2V0ID0gYCR7c2Vzc2lvbk5hbWV9OiR7d2luZG93SW5kZXh9YDtcbiAgICAgIGlmIChwYW5lSW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0YXJnZXQgPSBgJHt0YXJnZXR9LiR7cGFuZUluZGV4fWA7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQWx3YXlzIGF0dGFjaCB0byBzZXNzaW9uL3dpbmRvdyBsZXZlbCwgbm90IGluZGl2aWR1YWwgcGFuZXNcbiAgICAvLyBUaGlzIGdpdmVzIHVzZXJzIGZ1bGwgY29udHJvbCBvdmVyIHBhbmUgbWFuYWdlbWVudCBvbmNlIGF0dGFjaGVkXG4gICAgY29uc3QgYXR0YWNoVGFyZ2V0ID0gd2luZG93SW5kZXggIT09IHVuZGVmaW5lZCA/IGAke3Nlc3Npb25OYW1lfToke3dpbmRvd0luZGV4fWAgOiBzZXNzaW9uTmFtZTtcbiAgICBjb25zdCB0bXV4Q29tbWFuZCA9IFsndG11eCcsICdhdHRhY2gtc2Vzc2lvbicsICctdCcsIGF0dGFjaFRhcmdldF07XG5cbiAgICAvLyBDcmVhdGUgYSBuZXcgVmliZVR1bm5lbCBzZXNzaW9uIHRoYXQgcnVucyB0bXV4IGF0dGFjaFxuICAgIGNvbnN0IHNlc3Npb25PcHRpb25zOiBTZXNzaW9uQ3JlYXRlT3B0aW9ucyA9IHtcbiAgICAgIG5hbWU6IGB0bXV4OiAke3RhcmdldH1gLFxuICAgICAgd29ya2luZ0Rpcjogb3B0aW9ucz8ud29ya2luZ0RpciB8fCBwcm9jZXNzLmVudi5IT01FIHx8ICcvJyxcbiAgICAgIGNvbHM6IG9wdGlvbnM/LmNvbHMgfHwgODAsXG4gICAgICByb3dzOiBvcHRpb25zPy5yb3dzIHx8IDI0LFxuICAgICAgdGl0bGVNb2RlOiBvcHRpb25zPy50aXRsZU1vZGUgfHwgVGl0bGVNb2RlLkRZTkFNSUMsXG4gICAgfTtcblxuICAgIGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLnB0eU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih0bXV4Q29tbWFuZCwgc2Vzc2lvbk9wdGlvbnMpO1xuICAgIHJldHVybiBzZXNzaW9uLnNlc3Npb25JZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgY29tbWFuZCB0byBhIHNwZWNpZmljIHRtdXggcGFuZVxuICAgKi9cbiAgYXN5bmMgc2VuZFRvUGFuZShcbiAgICBzZXNzaW9uTmFtZTogc3RyaW5nLFxuICAgIGNvbW1hbmQ6IHN0cmluZyxcbiAgICB3aW5kb3dJbmRleD86IG51bWJlcixcbiAgICBwYW5lSW5kZXg/OiBudW1iZXJcbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25OYW1lKHNlc3Npb25OYW1lKTtcbiAgICBpZiAod2luZG93SW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy52YWxpZGF0ZVdpbmRvd0luZGV4KHdpbmRvd0luZGV4KTtcbiAgICB9XG4gICAgaWYgKHBhbmVJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlUGFuZUluZGV4KHBhbmVJbmRleCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBjb21tYW5kICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb21tYW5kIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgICB9XG5cbiAgICBsZXQgdGFyZ2V0QXJncyA9IHNlc3Npb25OYW1lO1xuICAgIGlmICh3aW5kb3dJbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICB0YXJnZXRBcmdzID0gYCR7c2Vzc2lvbk5hbWV9OiR7d2luZG93SW5kZXh9YDtcbiAgICAgIGlmIChwYW5lSW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0YXJnZXRBcmdzID0gYCR7dGFyZ2V0QXJnc30uJHtwYW5lSW5kZXh9YDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgLy8gVXNlIHNlbmQta2V5cyB0byBzZW5kIHRoZSBjb21tYW5kXG4gICAgICBhd2FpdCBleGVjRmlsZUFzeW5jKCd0bXV4JywgWydzZW5kLWtleXMnLCAnLXQnLCB0YXJnZXRBcmdzLCBjb21tYW5kLCAnRW50ZXInXSk7XG4gICAgICBsb2dnZXIuaW5mbygnU2VudCBjb21tYW5kIHRvIHRtdXggcGFuZScsIHsgdGFyZ2V0OiB0YXJnZXRBcmdzLCBjb21tYW5kIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIGNvbW1hbmQgdG8gdG11eCBwYW5lJywgeyB0YXJnZXQ6IHRhcmdldEFyZ3MsIGNvbW1hbmQsIGVycm9yIH0pO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEtpbGwgYSB0bXV4IHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGtpbGxTZXNzaW9uKHNlc3Npb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBbJ2tpbGwtc2Vzc2lvbicsICctdCcsIHNlc3Npb25OYW1lXSk7XG4gICAgICBsb2dnZXIuaW5mbygnS2lsbGVkIHRtdXggc2Vzc2lvbicsIHsgc2Vzc2lvbk5hbWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgdG11eCBzZXNzaW9uJywgeyBzZXNzaW9uTmFtZSwgZXJyb3IgfSk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggd2luZG93XG4gICAqL1xuICBhc3luYyBraWxsV2luZG93KHNlc3Npb25OYW1lOiBzdHJpbmcsIHdpbmRvd0luZGV4OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbk5hbWUoc2Vzc2lvbk5hbWUpO1xuICAgIHRoaXMudmFsaWRhdGVXaW5kb3dJbmRleCh3aW5kb3dJbmRleCk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgdGFyZ2V0ID0gYCR7c2Vzc2lvbk5hbWV9OiR7d2luZG93SW5kZXh9YDtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBbJ2tpbGwtd2luZG93JywgJy10JywgdGFyZ2V0XSk7XG4gICAgICBsb2dnZXIuaW5mbygnS2lsbGVkIHRtdXggd2luZG93JywgeyBzZXNzaW9uTmFtZSwgd2luZG93SW5kZXggfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgdG11eCB3aW5kb3cnLCB7IHNlc3Npb25OYW1lLCB3aW5kb3dJbmRleCwgZXJyb3IgfSk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggcGFuZVxuICAgKi9cbiAgYXN5bmMga2lsbFBhbmUoc2Vzc2lvbk5hbWU6IHN0cmluZywgcGFuZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAvLyBWYWxpZGF0ZSBwYW5lSWQgZm9ybWF0IChzaG91bGQgYmUgc2Vzc2lvbjp3aW5kb3cucGFuZSlcbiAgICBpZiAoIXBhbmVJZCB8fCB0eXBlb2YgcGFuZUlkICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQYW5lIElEIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nJyk7XG4gICAgfVxuXG4gICAgLy8gQmFzaWMgdmFsaWRhdGlvbiBmb3IgcGFuZSBJRCBmb3JtYXRcbiAgICBpZiAoIS9eW2EtekEtWjAtOS5fOi1dKyQvLnRlc3QocGFuZUlkKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHBhbmUgSUQgZm9ybWF0Jyk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ3RtdXgnLCBbJ2tpbGwtcGFuZScsICctdCcsIHBhbmVJZF0pO1xuICAgICAgbG9nZ2VyLmluZm8oJ0tpbGxlZCB0bXV4IHBhbmUnLCB7IHNlc3Npb25OYW1lLCBwYW5lSWQgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgdG11eCBwYW5lJywgeyBzZXNzaW9uTmFtZSwgcGFuZUlkLCBlcnJvciB9KTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBpbnNpZGUgYSB0bXV4IHNlc3Npb25cbiAgICovXG4gIGlzSW5zaWRlVG11eCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gISFwcm9jZXNzLmVudi5UTVVYO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgY3VycmVudCB0bXV4IHNlc3Npb24gbmFtZSBpZiBpbnNpZGUgdG11eFxuICAgKi9cbiAgZ2V0Q3VycmVudFNlc3Npb24oKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgaWYgKCF0aGlzLmlzSW5zaWRlVG11eCgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IGV4ZWNGaWxlU3luYygndG11eCcsIFsnZGlzcGxheS1tZXNzYWdlJywgJy1wJywgJyN7c2Vzc2lvbl9uYW1lfSddLCB7XG4gICAgICAgIGVuY29kaW5nOiAndXRmOCcsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHQudHJpbSgpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG59XG4iXX0=