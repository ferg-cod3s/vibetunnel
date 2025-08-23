"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRemoteRoutes = createRemoteRoutes;
const chalk_1 = __importDefault(require("chalk"));
const express_1 = require("express");
const server_js_1 = require("../server.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('remotes');
function createRemoteRoutes(config) {
    const router = (0, express_1.Router)();
    const { remoteRegistry, isHQMode } = config;
    // HQ Mode: List all registered remotes
    router.get('/remotes', (_req, res) => {
        if (!isHQMode || !remoteRegistry) {
            logger.debug('remotes list requested but not in HQ mode');
            return res.status(404).json({ error: 'Not running in HQ mode' });
        }
        const remotes = remoteRegistry.getRemotes();
        logger.debug(`listing ${remotes.length} registered remotes`);
        // Convert Set to Array for JSON serialization
        const remotesWithArraySessionIds = remotes.map((remote) => ({
            ...remote,
            sessionIds: Array.from(remote.sessionIds),
        }));
        res.json(remotesWithArraySessionIds);
    });
    // HQ Mode: Register a new remote
    router.post('/remotes/register', (req, res) => {
        if (!isHQMode || !remoteRegistry) {
            logger.debug('remote registration attempted but not in HQ mode');
            return res.status(404).json({ error: 'Not running in HQ mode' });
        }
        const { id, name, url, token } = req.body;
        if (!id || !name || !url || !token) {
            logger.warn(`remote registration missing required fields: got id=${!!id}, name=${!!name}, url=${!!url}, token=${!!token}`);
            return res.status(400).json({ error: 'Missing required fields: id, name, url, token' });
        }
        logger.debug(`attempting to register remote ${name} (${id}) from ${url}`);
        try {
            const remote = remoteRegistry.register({ id, name, url, token });
            logger.log(chalk_1.default.green(`remote registered: ${name} (${id}) from ${url}`));
            res.json({ success: true, remote });
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('already registered')) {
                return res.status(409).json({ error: error.message });
            }
            logger.error('failed to register remote:', error);
            res.status(500).json({ error: 'Failed to register remote' });
        }
    });
    // HQ Mode: Unregister a remote
    router.delete('/remotes/:remoteId', (req, res) => {
        if (!isHQMode || !remoteRegistry) {
            logger.debug('remote unregistration attempted but not in HQ mode');
            return res.status(404).json({ error: 'Not running in HQ mode' });
        }
        const remoteId = req.params.remoteId;
        logger.debug(`attempting to unregister remote ${remoteId}`);
        const success = remoteRegistry.unregister(remoteId);
        if (success) {
            logger.log(chalk_1.default.yellow(`remote unregistered: ${remoteId}`));
            res.json({ success: true });
        }
        else {
            logger.warn(`attempted to unregister non-existent remote: ${remoteId}`);
            res.status(404).json({ error: 'Remote not found' });
        }
    });
    // HQ Mode: Refresh sessions for a specific remote
    router.post('/remotes/:remoteName/refresh-sessions', async (req, res) => {
        if (!isHQMode || !remoteRegistry) {
            logger.debug('session refresh attempted but not in HQ mode');
            return res.status(404).json({ error: 'Not running in HQ mode' });
        }
        // If server is shutting down, return service unavailable
        if ((0, server_js_1.isShuttingDown)()) {
            logger.debug('session refresh rejected during shutdown');
            return res.status(503).json({ error: 'Server is shutting down' });
        }
        const remoteName = req.params.remoteName;
        const { action, sessionId } = req.body;
        logger.debug(`refreshing sessions for remote ${remoteName} (action: ${action}, sessionId: ${sessionId})`);
        // Find remote by name
        const remotes = remoteRegistry.getRemotes();
        const remote = remotes.find((r) => r.name === remoteName);
        if (!remote) {
            logger.warn(`remote not found for session refresh: ${remoteName}`);
            return res.status(404).json({ error: 'Remote not found' });
        }
        try {
            // Fetch latest sessions from the remote
            const startTime = Date.now();
            const response = await fetch(`${remote.url}/api/sessions`, {
                headers: {
                    Authorization: `Bearer ${remote.token}`,
                },
                signal: AbortSignal.timeout(5000),
            });
            if (response.ok) {
                const sessions = (await response.json());
                const sessionIds = sessions.map((s) => s.id);
                const duration = Date.now() - startTime;
                remoteRegistry.updateRemoteSessions(remote.id, sessionIds);
                logger.log(chalk_1.default.green(`updated sessions for remote ${remote.name}: ${sessionIds.length} sessions`));
                logger.debug(`session refresh completed in ${duration}ms (action: ${action}, sessionId: ${sessionId})`);
                res.json({ success: true, sessionCount: sessionIds.length });
            }
            else {
                throw new Error(`Failed to fetch sessions: ${response.status}`);
            }
        }
        catch (error) {
            // During shutdown, connection failures are expected
            if ((0, server_js_1.isShuttingDown)()) {
                logger.log(chalk_1.default.yellow(`remote ${remote.name} refresh failed during shutdown (expected)`));
                return res.status(503).json({ error: 'Server is shutting down' });
            }
            logger.error(`failed to refresh sessions for remote ${remote.name}:`, error);
            res.status(500).json({ error: 'Failed to refresh sessions' });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3Rlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL3JlbW90ZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFhQSxnREE0SUM7QUF6SkQsa0RBQTBCO0FBQzFCLHFDQUFpQztBQUNqQyw0Q0FBOEM7QUFFOUMsa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxTQUFTLENBQUMsQ0FBQztBQU92QyxTQUFnQixrQkFBa0IsQ0FBQyxNQUEwQjtJQUMzRCxNQUFNLE1BQU0sR0FBRyxJQUFBLGdCQUFNLEdBQUUsQ0FBQztJQUN4QixNQUFNLEVBQUUsY0FBYyxFQUFFLFFBQVEsRUFBRSxHQUFHLE1BQU0sQ0FBQztJQUU1Qyx1Q0FBdUM7SUFDdkMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDbkMsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQztZQUMxRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUNuRSxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxPQUFPLENBQUMsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDO1FBQzdELDhDQUE4QztRQUM5QyxNQUFNLDBCQUEwQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDMUQsR0FBRyxNQUFNO1lBQ1QsVUFBVSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUs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LENBQUMsQ0FBQztZQUNwRSxDQUFDO1lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsTUFBTSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzdFLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB7IFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHsgaXNTaHV0dGluZ0Rvd24gfSBmcm9tICcuLi9zZXJ2ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBSZW1vdGVSZWdpc3RyeSB9IGZyb20gJy4uL3NlcnZpY2VzL3JlbW90ZS1yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3JlbW90ZXMnKTtcblxuaW50ZXJmYWNlIFJlbW90ZVJvdXRlc0NvbmZpZyB7XG4gIHJlbW90ZVJlZ2lzdHJ5OiBSZW1vdGVSZWdpc3RyeSB8IG51bGw7XG4gIGlzSFFNb2RlOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVtb3RlUm91dGVzKGNvbmZpZzogUmVtb3RlUm91dGVzQ29uZmlnKTogUm91dGVyIHtcbiAgY29uc3Qgcm91dGVyID0gUm91dGVyKCk7XG4gIGNvbnN0IHsgcmVtb3RlUmVnaXN0cnksIGlzSFFNb2RlIH0gPSBjb25maWc7XG5cbiAgLy8gSFEgTW9kZTogTGlzdCBhbGwgcmVnaXN0ZXJlZCByZW1vdGVzXG4gIHJvdXRlci5nZXQoJy9yZW1vdGVzJywgKF9yZXEsIHJlcykgPT4ge1xuICAgIGlmICghaXNIUU1vZGUgfHwgIXJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ3JlbW90ZXMgbGlzdCByZXF1ZXN0ZWQgYnV0IG5vdCBpbiBIUSBtb2RlJyk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ05vdCBydW5uaW5nIGluIEhRIG1vZGUnIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZXMgPSByZW1vdGVSZWdpc3RyeS5nZXRSZW1vdGVzKCk7XG4gICAgbG9nZ2VyLmRlYnVnKGBsaXN0aW5nICR7cmVtb3Rlcy5sZW5ndGh9IHJlZ2lzdGVyZWQgcmVtb3Rlc2ApO1xuICAgIC8vIENvbnZlcnQgU2V0IHRvIEFycmF5IGZvciBKU09OIHNlcmlhbGl6YXRpb25cbiAgICBjb25zdCByZW1vdGVzV2l0aEFycmF5U2Vzc2lvbklkcyA9IHJlbW90ZXMubWFwKChyZW1vdGUpID0+ICh7XG4gICAgICAuLi5yZW1vdGUsXG4gICAgICBzZXNzaW9uSWRzOiBBcnJheS5mcm9tKHJlbW90ZS5zZXNzaW9uSWRzKSxcbiAgICB9KSk7XG4gICAgcmVzLmpzb24ocmVtb3Rlc1dpdGhBcnJheVNlc3Npb25JZHMpO1xuICB9KTtcblxuICAvLyBIUSBNb2RlOiBSZWdpc3RlciBhIG5ldyByZW1vdGVcbiAgcm91dGVyLnBvc3QoJy9yZW1vdGVzL3JlZ2lzdGVyJywgKHJlcSwgcmVzKSA9PiB7XG4gICAgaWYgKCFpc0hRTW9kZSB8fCAhcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygncmVtb3RlIHJlZ2lzdHJhdGlvbiBhdHRlbXB0ZWQgYnV0IG5vdCBpbiBIUSBtb2RlJyk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ05vdCBydW5uaW5nIGluIEhRIG1vZGUnIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHsgaWQsIG5hbWUsIHVybCwgdG9rZW4gfSA9IHJlcS5ib2R5O1xuXG4gICAgaWYgKCFpZCB8fCAhbmFtZSB8fCAhdXJsIHx8ICF0b2tlbikge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGByZW1vdGUgcmVnaXN0cmF0aW9uIG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzOiBnb3QgaWQ9JHshIWlkfSwgbmFtZT0keyEhbmFtZX0sIHVybD0keyEhdXJsfSwgdG9rZW49JHshIXRva2VufWBcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ01pc3NpbmcgcmVxdWlyZWQgZmllbGRzOiBpZCwgbmFtZSwgdXJsLCB0b2tlbicgfSk7XG4gICAgfVxuXG4gICAgbG9nZ2VyLmRlYnVnKGBhdHRlbXB0aW5nIHRvIHJlZ2lzdGVyIHJlbW90ZSAke25hbWV9ICgke2lkfSkgZnJvbSAke3VybH1gKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZW1vdGUgPSByZW1vdGVSZWdpc3RyeS5yZWdpc3Rlcih7IGlkLCBuYW1lLCB1cmwsIHRva2VuIH0pO1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgcmVtb3RlIHJlZ2lzdGVyZWQ6ICR7bmFtZX0gKCR7aWR9KSBmcm9tICR7dXJsfWApKTtcbiAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgcmVtb3RlIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdhbHJlYWR5IHJlZ2lzdGVyZWQnKSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDkpLmpzb24oeyBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICAgIH1cbiAgICAgIGxvZ2dlci5lcnJvcignZmFpbGVkIHRvIHJlZ2lzdGVyIHJlbW90ZTonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlZ2lzdGVyIHJlbW90ZScgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBIUSBNb2RlOiBVbnJlZ2lzdGVyIGEgcmVtb3RlXG4gIHJvdXRlci5kZWxldGUoJy9yZW1vdGVzLzpyZW1vdGVJZCcsIChyZXEsIHJlcykgPT4ge1xuICAgIGlmICghaXNIUU1vZGUgfHwgIXJlbW90ZVJlZ2lzdHJ5KSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ3JlbW90ZSB1bnJlZ2lzdHJhdGlvbiBhdHRlbXB0ZWQgYnV0IG5vdCBpbiBIUSBtb2RlJyk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ05vdCBydW5uaW5nIGluIEhRIG1vZGUnIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW90ZUlkID0gcmVxLnBhcmFtcy5yZW1vdGVJZDtcbiAgICBsb2dnZXIuZGVidWcoYGF0dGVtcHRpbmcgdG8gdW5yZWdpc3RlciByZW1vdGUgJHtyZW1vdGVJZH1gKTtcbiAgICBjb25zdCBzdWNjZXNzID0gcmVtb3RlUmVnaXN0cnkudW5yZWdpc3RlcihyZW1vdGVJZCk7XG5cbiAgICBpZiAoc3VjY2Vzcykge1xuICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYHJlbW90ZSB1bnJlZ2lzdGVyZWQ6ICR7cmVtb3RlSWR9YCkpO1xuICAgICAgcmVzLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2dnZXIud2FybihgYXR0ZW1wdGVkIHRvIHVucmVnaXN0ZXIgbm9uLWV4aXN0ZW50IHJlbW90ZTogJHtyZW1vdGVJZH1gKTtcbiAgICAgIHJlcy5zdGF0dXMoNDA0KS5qc29uKHsgZXJyb3I6ICdSZW1vdGUgbm90IGZvdW5kJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEhRIE1vZGU6IFJlZnJlc2ggc2Vzc2lvbnMgZm9yIGEgc3BlY2lmaWMgcmVtb3RlXG4gIHJvdXRlci5wb3N0KCcvcmVtb3Rlcy86cmVtb3RlTmFtZS9yZWZyZXNoLXNlc3Npb25zJywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgaWYgKCFpc0hRTW9kZSB8fCAhcmVtb3RlUmVnaXN0cnkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1Zygnc2Vzc2lvbiByZWZyZXNoIGF0dGVtcHRlZCBidXQgbm90IGluIEhRIG1vZGUnKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnTm90IHJ1bm5pbmcgaW4gSFEgbW9kZScgfSk7XG4gICAgfVxuXG4gICAgLy8gSWYgc2VydmVyIGlzIHNodXR0aW5nIGRvd24sIHJldHVybiBzZXJ2aWNlIHVuYXZhaWxhYmxlXG4gICAgaWYgKGlzU2h1dHRpbmdEb3duKCkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1Zygnc2Vzc2lvbiByZWZyZXNoIHJlamVjdGVkIGR1cmluZyBzaHV0ZG93bicpO1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHsgZXJyb3I6ICdTZXJ2ZXIgaXMgc2h1dHRpbmcgZG93bicgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVtb3RlTmFtZSA9IHJlcS5wYXJhbXMucmVtb3RlTmFtZTtcbiAgICBjb25zdCB7IGFjdGlvbiwgc2Vzc2lvbklkIH0gPSByZXEuYm9keTtcbiAgICBsb2dnZXIuZGVidWcoXG4gICAgICBgcmVmcmVzaGluZyBzZXNzaW9ucyBmb3IgcmVtb3RlICR7cmVtb3RlTmFtZX0gKGFjdGlvbjogJHthY3Rpb259LCBzZXNzaW9uSWQ6ICR7c2Vzc2lvbklkfSlgXG4gICAgKTtcblxuICAgIC8vIEZpbmQgcmVtb3RlIGJ5IG5hbWVcbiAgICBjb25zdCByZW1vdGVzID0gcmVtb3RlUmVnaXN0cnkuZ2V0UmVtb3RlcygpO1xuICAgIGNvbnN0IHJlbW90ZSA9IHJlbW90ZXMuZmluZCgocikgPT4gci5uYW1lID09PSByZW1vdGVOYW1lKTtcblxuICAgIGlmICghcmVtb3RlKSB7XG4gICAgICBsb2dnZXIud2FybihgcmVtb3RlIG5vdCBmb3VuZCBmb3Igc2Vzc2lvbiByZWZyZXNoOiAke3JlbW90ZU5hbWV9YCk7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1JlbW90ZSBub3QgZm91bmQnIH0pO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAvLyBGZXRjaCBsYXRlc3Qgc2Vzc2lvbnMgZnJvbSB0aGUgcmVtb3RlXG4gICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtyZW1vdGUudXJsfS9hcGkvc2Vzc2lvbnNgLCB7XG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7cmVtb3RlLnRva2VufWAsXG4gICAgICAgIH0sXG4gICAgICAgIHNpZ25hbDogQWJvcnRTaWduYWwudGltZW91dCg1MDAwKSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbnMgPSAoYXdhaXQgcmVzcG9uc2UuanNvbigpKSBhcyBBcnJheTx7IGlkOiBzdHJpbmcgfT47XG4gICAgICAgIGNvbnN0IHNlc3Npb25JZHMgPSBzZXNzaW9ucy5tYXAoKHMpID0+IHMuaWQpO1xuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG5cbiAgICAgICAgcmVtb3RlUmVnaXN0cnkudXBkYXRlUmVtb3RlU2Vzc2lvbnMocmVtb3RlLmlkLCBzZXNzaW9uSWRzKTtcblxuICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgIGNoYWxrLmdyZWVuKGB1cGRhdGVkIHNlc3Npb25zIGZvciByZW1vdGUgJHtyZW1vdGUubmFtZX06ICR7c2Vzc2lvbklkcy5sZW5ndGh9IHNlc3Npb25zYClcbiAgICAgICAgKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgIGBzZXNzaW9uIHJlZnJlc2ggY29tcGxldGVkIGluICR7ZHVyYXRpb259bXMgKGFjdGlvbjogJHthY3Rpb259LCBzZXNzaW9uSWQ6ICR7c2Vzc2lvbklkfSlgXG4gICAgICAgICk7XG4gICAgICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgc2Vzc2lvbkNvdW50OiBzZXNzaW9uSWRzLmxlbmd0aCB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIHNlc3Npb25zOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRHVyaW5nIHNodXRkb3duLCBjb25uZWN0aW9uIGZhaWx1cmVzIGFyZSBleHBlY3RlZFxuICAgICAgaWYgKGlzU2h1dHRpbmdEb3duKCkpIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYHJlbW90ZSAke3JlbW90ZS5uYW1lfSByZWZyZXNoIGZhaWxlZCBkdXJpbmcgc2h1dGRvd24gKGV4cGVjdGVkKWApKTtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHsgZXJyb3I6ICdTZXJ2ZXIgaXMgc2h1dHRpbmcgZG93bicgfSk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5lcnJvcihgZmFpbGVkIHRvIHJlZnJlc2ggc2Vzc2lvbnMgZm9yIHJlbW90ZSAke3JlbW90ZS5uYW1lfTpgLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHJlZnJlc2ggc2Vzc2lvbnMnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==