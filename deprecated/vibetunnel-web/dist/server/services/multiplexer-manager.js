"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiplexerManager = void 0;
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const screen_manager_js_1 = require("./screen-manager.js");
const tmux_manager_js_1 = require("./tmux-manager.js");
const zellij_manager_js_1 = require("./zellij-manager.js");
const logger = (0, logger_js_1.createLogger)('MultiplexerManager');
class MultiplexerManager {
    constructor(ptyManager) {
        this.ptyManager = ptyManager;
        this.tmuxManager = tmux_manager_js_1.TmuxManager.getInstance(ptyManager);
        this.zellijManager = zellij_manager_js_1.ZellijManager.getInstance(ptyManager);
        this.screenManager = screen_manager_js_1.ScreenManager.getInstance();
    }
    static getInstance(ptyManager) {
        if (!MultiplexerManager.instance) {
            MultiplexerManager.instance = new MultiplexerManager(ptyManager);
        }
        return MultiplexerManager.instance;
    }
    /**
     * Get available multiplexers and their sessions
     */
    async getAvailableMultiplexers() {
        const [tmuxAvailable, zellijAvailable, screenAvailable] = await Promise.all([
            this.tmuxManager.isAvailable(),
            this.zellijManager.isAvailable(),
            this.screenManager.isAvailable(),
        ]);
        const result = {
            tmux: {
                available: tmuxAvailable,
                type: 'tmux',
                sessions: [],
            },
            zellij: {
                available: zellijAvailable,
                type: 'zellij',
                sessions: [],
            },
            screen: {
                available: screenAvailable,
                type: 'screen',
                sessions: [],
            },
        };
        // Load sessions for available multiplexers
        if (tmuxAvailable) {
            try {
                const tmuxSessions = await this.tmuxManager.listSessions();
                result.tmux.sessions = tmuxSessions.map((session) => ({
                    ...session,
                    type: 'tmux',
                }));
            }
            catch (error) {
                logger.error('Failed to list tmux sessions', { error });
            }
        }
        if (zellijAvailable) {
            try {
                const zellijSessions = await this.zellijManager.listSessions();
                result.zellij.sessions = zellijSessions.map((session) => ({
                    ...session,
                    type: 'zellij',
                }));
            }
            catch (error) {
                logger.error('Failed to list zellij sessions', { error });
            }
        }
        if (screenAvailable) {
            try {
                const screenSessions = await this.screenManager.listSessions();
                result.screen.sessions = screenSessions.map((session) => ({
                    ...session,
                    type: 'screen',
                }));
            }
            catch (error) {
                logger.error('Failed to list screen sessions', { error });
            }
        }
        return result;
    }
    /**
     * Get windows for a tmux session
     */
    async getTmuxWindows(sessionName) {
        return this.tmuxManager.listWindows(sessionName);
    }
    /**
     * Get panes for a tmux window
     */
    async getTmuxPanes(sessionName, windowIndex) {
        return this.tmuxManager.listPanes(sessionName, windowIndex);
    }
    /**
     * Create a new session
     */
    async createSession(type, name, options) {
        if (type === 'tmux') {
            await this.tmuxManager.createSession(name, options?.command);
        }
        else if (type === 'zellij') {
            await this.zellijManager.createSession(name, options?.layout);
        }
        else if (type === 'screen') {
            // Screen expects a single command string, not an array
            const command = options?.command ? options.command.join(' ') : undefined;
            await this.screenManager.createSession(name, command);
        }
        else {
            throw new Error(`Unknown multiplexer type: ${type}`);
        }
    }
    /**
     * Attach to a session
     */
    async attachToSession(type, sessionName, options) {
        if (type === 'tmux') {
            return this.tmuxManager.attachToTmux(sessionName, options?.windowIndex, options?.paneIndex, options);
        }
        else if (type === 'zellij') {
            return this.zellijManager.attachToZellij(sessionName, options);
        }
        else if (type === 'screen') {
            // Screen doesn't support programmatic attach like tmux/zellij
            // We need to create a new session that runs the attach command
            const attachCmd = await this.screenManager.attachToSession(sessionName);
            // Create a new PTY session that will run the screen attach command
            const result = await this.ptyManager.createSession(attachCmd, {
                ...options,
                titleMode: types_js_1.TitleMode.DYNAMIC,
            });
            return result.sessionId;
        }
        else {
            throw new Error(`Unknown multiplexer type: ${type}`);
        }
    }
    /**
     * Kill/delete a session
     */
    async killSession(type, sessionName) {
        if (type === 'tmux') {
            await this.tmuxManager.killSession(sessionName);
        }
        else if (type === 'zellij') {
            await this.zellijManager.killSession(sessionName);
        }
        else if (type === 'screen') {
            await this.screenManager.killSession(sessionName);
        }
        else {
            throw new Error(`Unknown multiplexer type: ${type}`);
        }
    }
    /**
     * Kill a tmux window
     */
    async killTmuxWindow(sessionName, windowIndex) {
        await this.tmuxManager.killWindow(sessionName, windowIndex);
    }
    /**
     * Kill a tmux pane
     */
    async killTmuxPane(sessionName, paneId) {
        await this.tmuxManager.killPane(sessionName, paneId);
    }
    /**
     * Check which multiplexer we're currently inside
     */
    getCurrentMultiplexer() {
        if (this.tmuxManager.isInsideTmux()) {
            const session = this.tmuxManager.getCurrentSession();
            if (session) {
                return { type: 'tmux', session };
            }
        }
        if (this.zellijManager.isInsideZellij()) {
            const session = this.zellijManager.getCurrentSession();
            if (session) {
                return { type: 'zellij', session };
            }
        }
        if (this.screenManager.isInsideScreen()) {
            const session = this.screenManager.getCurrentSession();
            if (session) {
                return { type: 'screen', session };
            }
        }
        return null;
    }
}
exports.MultiplexerManager = MultiplexerManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlwbGV4ZXItbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvc2VydmljZXMvbXVsdGlwbGV4ZXItbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFRQSxvREFBa0Q7QUFFbEQsa0RBQWtEO0FBQ2xELDJEQUFvRDtBQUNwRCx1REFBZ0Q7QUFDaEQsMkRBQW9EO0FBRXBELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRWxELE1BQWEsa0JBQWtCO0lBTzdCLFlBQW9CLFVBQXNCO1FBQ3hDLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxXQUFXLEdBQUcsNkJBQVcsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLGFBQWEsR0FBRyxpQ0FBYSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsYUFBYSxHQUFHLGlDQUFhLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDbkQsQ0FBQztJQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBc0I7UUFDdkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pDLGtCQUFrQixDQUFDLFFBQVEsR0FBRyxJQUFJLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFDRCxPQUFPLGtCQUFrQixDQUFDLFFBQVEsQ0FBQztJQUNyQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsd0JBQXdCO1FBQzVCLE1BQU0sQ0FBQyxhQUFhLEVBQUUsZUFBZSxFQUFFLGVBQWUsQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQztZQUMxRSxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsRUFBRTtZQUM5QixJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRTtZ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b3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7XG4gIE11bHRpcGxleGVyU2Vzc2lvbixcbiAgTXVsdGlwbGV4ZXJTdGF0dXMsXG4gIE11bHRpcGxleGVyVHlwZSxcbiAgVG11eFBhbmUsXG4gIFRtdXhXaW5kb3csXG59IGZyb20gJy4uLy4uL3NoYXJlZC9tdWx0aXBsZXhlci10eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25DcmVhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB7IFRpdGxlTW9kZSB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFB0eU1hbmFnZXIgfSBmcm9tICcuLi9wdHkvcHR5LW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7IFNjcmVlbk1hbmFnZXIgfSBmcm9tICcuL3NjcmVlbi1tYW5hZ2VyLmpzJztcbmltcG9ydCB7IFRtdXhNYW5hZ2VyIH0gZnJvbSAnLi90bXV4LW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgWmVsbGlqTWFuYWdlciB9IGZyb20gJy4vemVsbGlqLW1hbmFnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ011bHRpcGxleGVyTWFuYWdlcicpO1xuXG5leHBvcnQgY2xhc3MgTXVsdGlwbGV4ZXJNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IE11bHRpcGxleGVyTWFuYWdlcjtcbiAgcHJpdmF0ZSB0bXV4TWFuYWdlcjogVG11eE1hbmFnZXI7XG4gIHByaXZhdGUgemVsbGlqTWFuYWdlcjogWmVsbGlqTWFuYWdlcjtcbiAgcHJpdmF0ZSBzY3JlZW5NYW5hZ2VyOiBTY3JlZW5NYW5hZ2VyO1xuICBwcml2YXRlIHB0eU1hbmFnZXI6IFB0eU1hbmFnZXI7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcihwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyKSB7XG4gICAgdGhpcy5wdHlNYW5hZ2VyID0gcHR5TWFuYWdlcjtcbiAgICB0aGlzLnRtdXhNYW5hZ2VyID0gVG11eE1hbmFnZXIuZ2V0SW5zdGFuY2UocHR5TWFuYWdlcik7XG4gICAgdGhpcy56ZWxsaWpNYW5hZ2VyID0gWmVsbGlqTWFuYWdlci5nZXRJbnN0YW5jZShwdHlNYW5hZ2VyKTtcbiAgICB0aGlzLnNjcmVlbk1hbmFnZXIgPSBTY3JlZW5NYW5hZ2VyLmdldEluc3RhbmNlKCk7XG4gIH1cblxuICBzdGF0aWMgZ2V0SW5zdGFuY2UocHR5TWFuYWdlcjogUHR5TWFuYWdlcik6IE11bHRpcGxleGVyTWFuYWdlciB7XG4gICAgaWYgKCFNdWx0aXBsZXhlck1hbmFnZXIuaW5zdGFuY2UpIHtcbiAgICAgIE11bHRpcGxleGVyTWFuYWdlci5pbnN0YW5jZSA9IG5ldyBNdWx0aXBsZXhlck1hbmFnZXIocHR5TWFuYWdlcik7XG4gICAgfVxuICAgIHJldHVybiBNdWx0aXBsZXhlck1hbmFnZXIuaW5zdGFuY2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGF2YWlsYWJsZSBtdWx0aXBsZXhlcnMgYW5kIHRoZWlyIHNlc3Npb25zXG4gICAqL1xuICBhc3luYyBnZXRBdmFpbGFibGVNdWx0aXBsZXhlcnMoKTogUHJvbWlzZTxNdWx0aXBsZXhlclN0YXR1cz4ge1xuICAgIGNvbnN0IFt0bXV4QXZhaWxhYmxlLCB6ZWxsaWpBdmFpbGFibGUsIHNjcmVlbkF2YWlsYWJsZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLnRtdXhNYW5hZ2VyLmlzQXZhaWxhYmxlKCksXG4gICAgICB0aGlzLnplbGxpak1hbmFnZXIuaXNBdmFpbGFibGUoKSxcbiAgICAgIHRoaXMuc2NyZWVuTWFuYWdlci5pc0F2YWlsYWJsZSgpLFxuICAgIF0pO1xuXG4gICAgY29uc3QgcmVzdWx0OiBNdWx0aXBsZXhlclN0YXR1cyA9IHtcbiAgICAgIHRtdXg6IHtcbiAgICAgICAgYXZhaWxhYmxlOiB0bXV4QXZhaWxhYmxlLFxuICAgICAgICB0eXBlOiAndG11eCcgYXMgTXVsdGlwbGV4ZXJUeXBlLFxuICAgICAgICBzZXNzaW9uczogW10gYXMgTXVsdGlwbGV4ZXJTZXNzaW9uW10sXG4gICAgICB9LFxuICAgICAgemVsbGlqOiB7XG4gICAgICAgIGF2YWlsYWJsZTogemVsbGlqQXZhaWxhYmxlLFxuICAgICAgICB0eXBlOiAnemVsbGlqJyBhcyBNdWx0aXBsZXhlclR5cGUsXG4gICAgICAgIHNlc3Npb25zOiBbXSBhcyBNdWx0aXBsZXhlclNlc3Npb25bXSxcbiAgICAgIH0sXG4gICAgICBzY3JlZW46IHtcbiAgICAgICAgYXZhaWxhYmxlOiBzY3JlZW5BdmFpbGFibGUsXG4gICAgICAgIHR5cGU6ICdzY3JlZW4nIGFzIE11bHRpcGxleGVyVHlwZSxcbiAgICAgICAgc2Vzc2lvbnM6IFtdIGFzIE11bHRpcGxleGVyU2Vzc2lvbltdLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gTG9hZCBzZXNzaW9ucyBmb3IgYXZhaWxhYmxlIG11bHRpcGxleGVyc1xuICAgIGlmICh0bXV4QXZhaWxhYmxlKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB0bXV4U2Vzc2lvbnMgPSBhd2FpdCB0aGlzLnRtdXhNYW5hZ2VyLmxpc3RTZXNzaW9ucygpO1xuICAgICAgICByZXN1bHQudG11eC5zZXNzaW9ucyA9IHRtdXhTZXNzaW9ucy5tYXAoKHNlc3Npb24pID0+ICh7XG4gICAgICAgICAgLi4uc2Vzc2lvbixcbiAgICAgICAgICB0eXBlOiAndG11eCcgYXMgTXVsdGlwbGV4ZXJUeXBlLFxuICAgICAgICB9KSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsaXN0IHRtdXggc2Vzc2lvbnMnLCB7IGVycm9yIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh6ZWxsaWpBdmFpbGFibGUpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHplbGxpalNlc3Npb25zID0gYXdhaXQgdGhpcy56ZWxsaWpNYW5hZ2VyLmxpc3RTZXNzaW9ucygpO1xuICAgICAgICByZXN1bHQuemVsbGlqLnNlc3Npb25zID0gemVsbGlqU2Vzc2lvbnMubWFwKChzZXNzaW9uKSA9PiAoe1xuICAgICAgICAgIC4uLnNlc3Npb24sXG4gICAgICAgICAgdHlwZTogJ3plbGxpaicgYXMgTXVsdGlwbGV4ZXJUeXBlLFxuICAgICAgICB9KSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsaXN0IHplbGxpaiBzZXNzaW9ucycsIHsgZXJyb3IgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHNjcmVlbkF2YWlsYWJsZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2NyZWVuU2Vzc2lvbnMgPSBhd2FpdCB0aGlzLnNjcmVlbk1hbmFnZXIubGlzdFNlc3Npb25zKCk7XG4gICAgICAgIHJlc3VsdC5zY3JlZW4uc2Vzc2lvbnMgPSBzY3JlZW5TZXNzaW9ucy5tYXAoKHNlc3Npb24pID0+ICh7XG4gICAgICAgICAgLi4uc2Vzc2lvbixcbiAgICAgICAgICB0eXBlOiAnc2NyZWVuJyBhcyBNdWx0aXBsZXhlclR5cGUsXG4gICAgICAgIH0pKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGxpc3Qgc2NyZWVuIHNlc3Npb25zJywgeyBlcnJvciB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB3aW5kb3dzIGZvciBhIHRtdXggc2Vzc2lvblxuICAgKi9cbiAgYXN5bmMgZ2V0VG11eFdpbmRvd3Moc2Vzc2lvbk5hbWU6IHN0cmluZyk6IFByb21pc2U8VG11eFdpbmRvd1tdPiB7XG4gICAgcmV0dXJuIHRoaXMudG11eE1hbmFnZXIubGlzdFdpbmRvd3Moc2Vzc2lvbk5hbWUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBwYW5lcyBmb3IgYSB0bXV4IHdpbmRvd1xuICAgKi9cbiAgYXN5bmMgZ2V0VG11eFBhbmVzKHNlc3Npb25OYW1lOiBzdHJpbmcsIHdpbmRvd0luZGV4PzogbnVtYmVyKTogUHJvbWlzZTxUbXV4UGFuZVtdPiB7XG4gICAgcmV0dXJuIHRoaXMudG11eE1hbmFnZXIubGlzdFBhbmVzKHNlc3Npb25OYW1lLCB3aW5kb3dJbmRleCk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGNyZWF0ZVNlc3Npb24oXG4gICAgdHlwZTogTXVsdGlwbGV4ZXJUeXBlLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBvcHRpb25zPzogeyBjb21tYW5kPzogc3RyaW5nW107IGxheW91dD86IHN0cmluZyB9XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0eXBlID09PSAndG11eCcpIHtcbiAgICAgIGF3YWl0IHRoaXMudG11eE1hbmFnZXIuY3JlYXRlU2Vzc2lvbihuYW1lLCBvcHRpb25zPy5jb21tYW5kKTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICd6ZWxsaWonKSB7XG4gICAgICBhd2FpdCB0aGlzLnplbGxpak1hbmFnZXIuY3JlYXRlU2Vzc2lvbihuYW1lLCBvcHRpb25zPy5sYXlvdXQpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NjcmVlbicpIHtcbiAgICAgIC8vIFNjcmVlbiBleHBlY3RzIGEgc2luZ2xlIGNvbW1hbmQgc3RyaW5nLCBub3QgYW4gYXJyYXlcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBvcHRpb25zPy5jb21tYW5kID8gb3B0aW9ucy5jb21tYW5kLmpvaW4oJyAnKSA6IHVuZGVmaW5lZDtcbiAgICAgIGF3YWl0IHRoaXMuc2NyZWVuTWFuYWdlci5jcmVhdGVTZXNzaW9uKG5hbWUsIGNvbW1hbmQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbXVsdGlwbGV4ZXIgdHlwZTogJHt0eXBlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRhY2ggdG8gYSBzZXNzaW9uXG4gICAqL1xuICBhc3luYyBhdHRhY2hUb1Nlc3Npb24oXG4gICAgdHlwZTogTXVsdGlwbGV4ZXJUeXBlLFxuICAgIHNlc3Npb25OYW1lOiBzdHJpbmcsXG4gICAgb3B0aW9ucz86IFBhcnRpYWw8U2Vzc2lvbkNyZWF0ZU9wdGlvbnM+ICYgeyB3aW5kb3dJbmRleD86IG51bWJlcjsgcGFuZUluZGV4PzogbnVtYmVyIH1cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAodHlwZSA9PT0gJ3RtdXgnKSB7XG4gICAgICByZXR1cm4gdGhpcy50bXV4TWFuYWdlci5hdHRhY2hUb1RtdXgoXG4gICAgICAgIHNlc3Npb25OYW1lLFxuICAgICAgICBvcHRpb25zPy53aW5kb3dJbmRleCxcbiAgICAgICAgb3B0aW9ucz8ucGFuZUluZGV4LFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3plbGxpaicpIHtcbiAgICAgIHJldHVybiB0aGlzLnplbGxpak1hbmFnZXIuYXR0YWNoVG9aZWxsaWooc2Vzc2lvbk5hbWUsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3NjcmVlbicpIHtcbiAgICAgIC8vIFNjcmVlbiBkb2Vzbid0IHN1cHBvcnQgcHJvZ3JhbW1hdGljIGF0dGFjaCBsaWtlIHRtdXgvemVsbGlqXG4gICAgICAvLyBXZSBuZWVkIHRvIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHRoYXQgcnVucyB0aGUgYXR0YWNoIGNvbW1hbmRcbiAgICAgIGNvbnN0IGF0dGFjaENtZCA9IGF3YWl0IHRoaXMuc2NyZWVuTWFuYWdlci5hdHRhY2hUb1Nlc3Npb24oc2Vzc2lvbk5hbWUpO1xuICAgICAgLy8gQ3JlYXRlIGEgbmV3IFBUWSBzZXNzaW9uIHRoYXQgd2lsbCBydW4gdGhlIHNjcmVlbiBhdHRhY2ggY29tbWFuZFxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wdHlNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oYXR0YWNoQ21kLCB7XG4gICAgICAgIC4uLm9wdGlvbnMsXG4gICAgICAgIHRpdGxlTW9kZTogVGl0bGVNb2RlLkRZTkFNSUMsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHQuc2Vzc2lvbklkO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gbXVsdGlwbGV4ZXIgdHlwZTogJHt0eXBlfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBLaWxsL2RlbGV0ZSBhIHNlc3Npb25cbiAgICovXG4gIGFzeW5jIGtpbGxTZXNzaW9uKHR5cGU6IE11bHRpcGxleGVyVHlwZSwgc2Vzc2lvbk5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0eXBlID09PSAndG11eCcpIHtcbiAgICAgIGF3YWl0IHRoaXMudG11eE1hbmFnZXIua2lsbFNlc3Npb24oc2Vzc2lvbk5hbWUpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3plbGxpaicpIHtcbiAgICAgIGF3YWl0IHRoaXMuemVsbGlqTWFuYWdlci5raWxsU2Vzc2lvbihzZXNzaW9uTmFtZSk7XG4gICAgfSBlbHNlIGlmICh0eXBlID09PSAnc2NyZWVuJykge1xuICAgICAgYXdhaXQgdGhpcy5zY3JlZW5NYW5hZ2VyLmtpbGxTZXNzaW9uKHNlc3Npb25OYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmtub3duIG11bHRpcGxleGVyIHR5cGU6ICR7dHlwZX1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggd2luZG93XG4gICAqL1xuICBhc3luYyBraWxsVG11eFdpbmRvdyhzZXNzaW9uTmFtZTogc3RyaW5nLCB3aW5kb3dJbmRleDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy50bXV4TWFuYWdlci5raWxsV2luZG93KHNlc3Npb25OYW1lLCB3aW5kb3dJbmRleCk7XG4gIH1cblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggcGFuZVxuICAgKi9cbiAgYXN5bmMga2lsbFRtdXhQYW5lKHNlc3Npb25OYW1lOiBzdHJpbmcsIHBhbmVJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy50bXV4TWFuYWdlci5raWxsUGFuZShzZXNzaW9uTmFtZSwgcGFuZUlkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayB3aGljaCBtdWx0aXBsZXhlciB3ZSdyZSBjdXJyZW50bHkgaW5zaWRlXG4gICAqL1xuICBnZXRDdXJyZW50TXVsdGlwbGV4ZXIoKTogeyB0eXBlOiBNdWx0aXBsZXhlclR5cGU7IHNlc3Npb246IHN0cmluZyB9IHwgbnVsbCB7XG4gICAgaWYgKHRoaXMudG11eE1hbmFnZXIuaXNJbnNpZGVUbXV4KCkpIHtcbiAgICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnRtdXhNYW5hZ2VyLmdldEN1cnJlbnRTZXNzaW9uKCk7XG4gICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICByZXR1cm4geyB0eXBlOiAndG11eCcsIHNlc3Npb24gfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy56ZWxsaWpNYW5hZ2VyLmlzSW5zaWRlWmVsbGlqKCkpIHtcbiAgICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnplbGxpak1hbmFnZXIuZ2V0Q3VycmVudFNlc3Npb24oKTtcbiAgICAgIGlmIChzZXNzaW9uKSB7XG4gICAgICAgIHJldHVybiB7IHR5cGU6ICd6ZWxsaWonLCBzZXNzaW9uIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NyZWVuTWFuYWdlci5pc0luc2lkZVNjcmVlbigpKSB7XG4gICAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5zY3JlZW5NYW5hZ2VyLmdldEN1cnJlbnRTZXNzaW9uKCk7XG4gICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICByZXR1cm4geyB0eXBlOiAnc2NyZWVuJywgc2Vzc2lvbiB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG59XG4iXX0=