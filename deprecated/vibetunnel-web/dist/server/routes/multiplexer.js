"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMultiplexerRoutes = createMultiplexerRoutes;
const express_1 = require("express");
const multiplexer_manager_js_1 = require("../services/multiplexer-manager.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('multiplexer-routes');
function createMultiplexerRoutes(options) {
    const { ptyManager } = options;
    const router = (0, express_1.Router)();
    const multiplexerManager = multiplexer_manager_js_1.MultiplexerManager.getInstance(ptyManager);
    /**
     * Get available multiplexers and their sessions
     */
    router.get('/status', async (_req, res) => {
        try {
            const status = await multiplexerManager.getAvailableMultiplexers();
            res.json(status);
        }
        catch (error) {
            logger.error('Failed to get multiplexer status', { error });
            res.status(500).json({ error: 'Failed to get multiplexer status' });
        }
    });
    /**
     * Get windows for a tmux session
     */
    router.get('/tmux/sessions/:sessionName/windows', async (req, res) => {
        try {
            const { sessionName } = req.params;
            const windows = await multiplexerManager.getTmuxWindows(sessionName);
            res.json({ windows });
        }
        catch (error) {
            logger.error('Failed to list tmux windows', { error });
            res.status(500).json({ error: 'Failed to list tmux windows' });
        }
    });
    /**
     * Get panes for a tmux window
     */
    router.get('/tmux/sessions/:sessionName/panes', async (req, res) => {
        try {
            const { sessionName } = req.params;
            const windowIndex = req.query.window
                ? Number.parseInt(req.query.window, 10)
                : undefined;
            const panes = await multiplexerManager.getTmuxPanes(sessionName, windowIndex);
            res.json({ panes });
        }
        catch (error) {
            logger.error('Failed to list tmux panes', { error });
            res.status(500).json({ error: 'Failed to list tmux panes' });
        }
    });
    /**
     * Create a new session
     */
    router.post('/sessions', async (req, res) => {
        try {
            const { type, name, options } = req.body;
            if (!type || !name) {
                return res.status(400).json({ error: 'Type and name are required' });
            }
            await multiplexerManager.createSession(type, name, options);
            res.json({ success: true, type, name });
        }
        catch (error) {
            logger.error('Failed to create session', { error });
            res.status(500).json({ error: 'Failed to create session' });
        }
    });
    /**
     * Attach to a session
     */
    router.post('/attach', async (req, res) => {
        try {
            const { type, sessionName, windowIndex, paneIndex, cols, rows, workingDir, titleMode } = req.body;
            if (!type || !sessionName) {
                return res.status(400).json({ error: 'Type and session name are required' });
            }
            const options = {
                cols,
                rows,
                workingDir,
                titleMode,
                windowIndex,
                paneIndex,
            };
            const sessionId = await multiplexerManager.attachToSession(type, sessionName, options);
            res.json({
                success: true,
                sessionId,
                target: {
                    type,
                    session: sessionName,
                    window: windowIndex,
                    pane: paneIndex,
                },
            });
        }
        catch (error) {
            logger.error('Failed to attach to session', { error });
            res.status(500).json({ error: 'Failed to attach to session' });
        }
    });
    /**
     * Kill a session
     */
    router.delete('/:type/sessions/:sessionName', async (req, res) => {
        try {
            const { type, sessionName } = req.params;
            await multiplexerManager.killSession(type, sessionName);
            res.json({ success: true });
        }
        catch (error) {
            logger.error('Failed to kill session', { error });
            res.status(500).json({ error: 'Failed to kill session' });
        }
    });
    /**
     * Kill a tmux window
     */
    router.delete('/tmux/sessions/:sessionName/windows/:windowIndex', async (req, res) => {
        try {
            const { sessionName, windowIndex } = req.params;
            await multiplexerManager.killTmuxWindow(sessionName, Number.parseInt(windowIndex, 10));
            res.json({ success: true });
        }
        catch (error) {
            logger.error('Failed to kill window', { error });
            res.status(500).json({ error: 'Failed to kill window' });
        }
    });
    /**
     * Kill a tmux pane
     */
    router.delete('/tmux/sessions/:sessionName/panes/:paneId', async (req, res) => {
        try {
            const { sessionName, paneId } = req.params;
            await multiplexerManager.killTmuxPane(sessionName, paneId);
            res.json({ success: true });
        }
        catch (error) {
            logger.error('Failed to kill pane', { error });
            res.status(500).json({ error: 'Failed to kill pane' });
        }
    });
    /**
     * Get current multiplexer context
     */
    router.get('/context', (_req, res) => {
        const context = multiplexerManager.getCurrentMultiplexer();
        res.json({ context });
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlwbGV4ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3JvdXRlcy9tdWx0aXBsZXhlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQVNBLDBEQWlLQztBQTFLRCxxQ0FBaUM7QUFJakMsK0VBQXdFO0FBQ3hFLGtEQUFrRDtBQUVsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUVsRCxTQUFnQix1QkFBdUIsQ0FBQyxPQUFtQztJQUN6RSxNQUFNLEVBQUUsVUFBVSxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBQy9CLE1BQU0sTUFBTSxHQUFHLElBQUEsZ0JBQU0sR0FBRSxDQUFDO0lBQ3hCLE1BQU0sa0JBQWtCLEdBQUcsMkNBQWtCLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXRFOztPQUVHO0lBQ0gsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUN4QyxJQUFJLENBQUM7WUFDSCxNQUFNLE1BQU0sR0FBRyxNQUFNLGtCQUFrQixDQUFDLHdCQUF3QixFQUFFLENBQUM7WUFDbkUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBQzVELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLENBQUMsQ0FBQztRQUN0RSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSDs7T0FFRztJQUNILE1BQU0sQ0FBQyxHQUFHLENBQUMscUNBQXFDLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUs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QyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUg7O09BRUc7SUFDSCxNQUFNLENBQUMsTUFBTSxDQUFDLDJDQUEyQyxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDNUUsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLFdBQVcsRUFBRSxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDO1lBQzNDLE1BQU0sa0JBQWtCLENBQUMsWUFBWSxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUMzRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUMvQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDekQsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUg7O09BRUc7SUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsRUFBRTtRQUNuQyxNQUFNLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzNELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO0lBQ3hCLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHR5cGUgeyBNdWx0aXBsZXhlclR5cGUgfSBmcm9tICcuLi8uLi9zaGFyZWQvbXVsdGlwbGV4ZXItdHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQ3JlYXRlT3B0aW9ucyB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFB0eU1hbmFnZXIgfSBmcm9tICcuLi9wdHkvcHR5LW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgTXVsdGlwbGV4ZXJNYW5hZ2VyIH0gZnJvbSAnLi4vc2VydmljZXMvbXVsdGlwbGV4ZXItbWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ211bHRpcGxleGVyLXJvdXRlcycpO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTXVsdGlwbGV4ZXJSb3V0ZXMob3B0aW9uczogeyBwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyIH0pOiBSb3V0ZXIge1xuICBjb25zdCB7IHB0eU1hbmFnZXIgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuICBjb25zdCBtdWx0aXBsZXhlck1hbmFnZXIgPSBNdWx0aXBsZXhlck1hbmFnZXIuZ2V0SW5zdGFuY2UocHR5TWFuYWdlcik7XG5cbiAgLyoqXG4gICAqIEdldCBhdmFpbGFibGUgbXVsdGlwbGV4ZXJzIGFuZCB0aGVpciBzZXNzaW9uc1xuICAgKi9cbiAgcm91dGVyLmdldCgnL3N0YXR1cycsIGFzeW5jIChfcmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhdHVzID0gYXdhaXQgbXVsdGlwbGV4ZXJNYW5hZ2VyLmdldEF2YWlsYWJsZU11bHRpcGxleGVycygpO1xuICAgICAgcmVzLmpzb24oc3RhdHVzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gZ2V0IG11bHRpcGxleGVyIHN0YXR1cycsIHsgZXJyb3IgfSk7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCBtdWx0aXBsZXhlciBzdGF0dXMnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIEdldCB3aW5kb3dzIGZvciBhIHRtdXggc2Vzc2lvblxuICAgKi9cbiAgcm91dGVyLmdldCgnL3RtdXgvc2Vzc2lvbnMvOnNlc3Npb25OYW1lL3dpbmRvd3MnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzZXNzaW9uTmFtZSB9ID0gcmVxLnBhcmFtcztcbiAgICAgIGNvbnN0IHdpbmRvd3MgPSBhd2FpdCBtdWx0aXBsZXhlck1hbmFnZXIuZ2V0VG11eFdpbmRvd3Moc2Vzc2lvbk5hbWUpO1xuICAgICAgcmVzLmpzb24oeyB3aW5kb3dzIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsaXN0IHRtdXggd2luZG93cycsIHsgZXJyb3IgfSk7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGxpc3QgdG11eCB3aW5kb3dzJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHZXQgcGFuZXMgZm9yIGEgdG11eCB3aW5kb3dcbiAgICovXG4gIHJvdXRlci5nZXQoJy90bXV4L3Nlc3Npb25zLzpzZXNzaW9uTmFtZS9wYW5lcycsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHNlc3Npb25OYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgY29uc3Qgd2luZG93SW5kZXggPSByZXEucXVlcnkud2luZG93XG4gICAgICAgID8gTnVtYmVyLnBhcnNlSW50KHJlcS5xdWVyeS53aW5kb3cgYXMgc3RyaW5nLCAxMClcbiAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBwYW5lcyA9IGF3YWl0IG11bHRpcGxleGVyTWFuYWdlci5nZXRUbXV4UGFuZXMoc2Vzc2lvbk5hbWUsIHdpbmRvd0luZGV4KTtcbiAgICAgIHJlcy5qc29uKHsgcGFuZXMgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGxpc3QgdG11eCBwYW5lcycsIHsgZXJyb3IgfSk7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGxpc3QgdG11eCBwYW5lcycgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IHNlc3Npb25cbiAgICovXG4gIHJvdXRlci5wb3N0KCcvc2Vzc2lvbnMnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB0eXBlLCBuYW1lLCBvcHRpb25zIH0gPSByZXEuYm9keTtcblxuICAgICAgaWYgKCF0eXBlIHx8ICFuYW1lKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnVHlwZSBhbmQgbmFtZSBhcmUgcmVxdWlyZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCBtdWx0aXBsZXhlck1hbmFnZXIuY3JlYXRlU2Vzc2lvbih0eXBlLCBuYW1lLCBvcHRpb25zKTtcbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgdHlwZSwgbmFtZSB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIHNlc3Npb24nLCB7IGVycm9yIH0pO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBjcmVhdGUgc2Vzc2lvbicgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogQXR0YWNoIHRvIGEgc2Vzc2lvblxuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9hdHRhY2gnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB0eXBlLCBzZXNzaW9uTmFtZSwgd2luZG93SW5kZXgsIHBhbmVJbmRleCwgY29scywgcm93cywgd29ya2luZ0RpciwgdGl0bGVNb2RlIH0gPVxuICAgICAgICByZXEuYm9keTtcblxuICAgICAgaWYgKCF0eXBlIHx8ICFzZXNzaW9uTmFtZSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1R5cGUgYW5kIHNlc3Npb24gbmFtZSBhcmUgcmVxdWlyZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBvcHRpb25zOiBQYXJ0aWFsPFNlc3Npb25DcmVhdGVPcHRpb25zPiAmIHtcbiAgICAgICAgd2luZG93SW5kZXg/OiBudW1iZXI7XG4gICAgICAgIHBhbmVJbmRleD86IG51bWJlcjtcbiAgICAgIH0gPSB7XG4gICAgICAgIGNvbHMsXG4gICAgICAgIHJvd3MsXG4gICAgICAgIHdvcmtpbmdEaXIsXG4gICAgICAgIHRpdGxlTW9kZSxcbiAgICAgICAgd2luZG93SW5kZXgsXG4gICAgICAgIHBhbmVJbmRleCxcbiAgICAgIH07XG5cbiAgICAgIGNvbnN0IHNlc3Npb25JZCA9IGF3YWl0IG11bHRpcGxleGVyTWFuYWdlci5hdHRhY2hUb1Nlc3Npb24odHlwZSwgc2Vzc2lvbk5hbWUsIG9wdGlvbnMpO1xuXG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgdGFyZ2V0OiB7XG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgICBzZXNzaW9uOiBzZXNzaW9uTmFtZSxcbiAgICAgICAgICB3aW5kb3c6IHdpbmRvd0luZGV4LFxuICAgICAgICAgIHBhbmU6IHBhbmVJbmRleCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBhdHRhY2ggdG8gc2Vzc2lvbicsIHsgZXJyb3IgfSk7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGF0dGFjaCB0byBzZXNzaW9uJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBLaWxsIGEgc2Vzc2lvblxuICAgKi9cbiAgcm91dGVyLmRlbGV0ZSgnLzp0eXBlL3Nlc3Npb25zLzpzZXNzaW9uTmFtZScsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHR5cGUsIHNlc3Npb25OYW1lIH0gPSByZXEucGFyYW1zO1xuICAgICAgYXdhaXQgbXVsdGlwbGV4ZXJNYW5hZ2VyLmtpbGxTZXNzaW9uKHR5cGUgYXMgTXVsdGlwbGV4ZXJUeXBlLCBzZXNzaW9uTmFtZSk7XG4gICAgICByZXMuanNvbih7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGtpbGwgc2Vzc2lvbicsIHsgZXJyb3IgfSk7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGtpbGwgc2Vzc2lvbicgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggd2luZG93XG4gICAqL1xuICByb3V0ZXIuZGVsZXRlKCcvdG11eC9zZXNzaW9ucy86c2Vzc2lvbk5hbWUvd2luZG93cy86d2luZG93SW5kZXgnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzZXNzaW9uTmFtZSwgd2luZG93SW5kZXggfSA9IHJlcS5wYXJhbXM7XG4gICAgICBhd2FpdCBtdWx0aXBsZXhlck1hbmFnZXIua2lsbFRtdXhXaW5kb3coc2Vzc2lvbk5hbWUsIE51bWJlci5wYXJzZUludCh3aW5kb3dJbmRleCwgMTApKTtcbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8ga2lsbCB3aW5kb3cnLCB7IGVycm9yIH0pO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBraWxsIHdpbmRvdycgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogS2lsbCBhIHRtdXggcGFuZVxuICAgKi9cbiAgcm91dGVyLmRlbGV0ZSgnL3RtdXgvc2Vzc2lvbnMvOnNlc3Npb25OYW1lL3BhbmVzLzpwYW5lSWQnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBzZXNzaW9uTmFtZSwgcGFuZUlkIH0gPSByZXEucGFyYW1zO1xuICAgICAgYXdhaXQgbXVsdGlwbGV4ZXJNYW5hZ2VyLmtpbGxUbXV4UGFuZShzZXNzaW9uTmFtZSwgcGFuZUlkKTtcbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8ga2lsbCBwYW5lJywgeyBlcnJvciB9KTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8ga2lsbCBwYW5lJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHZXQgY3VycmVudCBtdWx0aXBsZXhlciBjb250ZXh0XG4gICAqL1xuICByb3V0ZXIuZ2V0KCcvY29udGV4dCcsIChfcmVxLCByZXMpID0+IHtcbiAgICBjb25zdCBjb250ZXh0ID0gbXVsdGlwbGV4ZXJNYW5hZ2VyLmdldEN1cnJlbnRNdWx0aXBsZXhlcigpO1xuICAgIHJlcy5qc29uKHsgY29udGV4dCB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==