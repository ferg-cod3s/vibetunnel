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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogRoutes = createLogRoutes;
const express_1 = require("express");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('logs');
function createLogRoutes(_config) {
    const router = (0, express_1.Router)();
    // Client-side logging endpoint
    router.post('/logs/client', (req, res) => {
        try {
            const { level, module, args } = req.body;
            // Validate input
            if (!level || !module || !Array.isArray(args)) {
                return res.status(400).json({
                    error: 'Invalid log request. Required: level, module, args[]',
                });
            }
            // Validate level
            if (!['log', 'warn', 'error', 'debug'].includes(level)) {
                return res.status(400).json({
                    error: 'Invalid log level. Must be: log, warn, error, or debug',
                });
            }
            // Add [FE] prefix to module name to distinguish frontend logs from server logs
            const clientModule = `[FE] ${module}`;
            // Map client levels to server levels (uppercase)
            const serverLevel = level.toUpperCase();
            // Log to server log file via logFromModule
            (0, logger_js_1.logFromModule)(serverLevel === 'LOG' ? 'LOG' : serverLevel, clientModule, args);
            res.status(204).send();
        }
        catch (error) {
            logger.error('Failed to process client log:', error);
            res.status(500).json({ error: 'Failed to process log' });
        }
    });
    // Get raw log file
    router.get('/logs/raw', (_req, res) => {
        try {
            const logPath = path.join(os.homedir(), '.vibetunnel', 'log.txt');
            // Check if log file exists - if not, return empty content
            if (!fs.existsSync(logPath)) {
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                return res.send('');
            }
            // Stream the log file
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            const stream = fs.createReadStream(logPath);
            stream.pipe(res);
        }
        catch (error) {
            logger.error('Failed to read log file:', error);
            res.status(500).json({ error: 'Failed to read log file' });
        }
    });
    // Get log stats/info
    router.get('/logs/info', (_req, res) => {
        try {
            const logPath = path.join(os.homedir(), '.vibetunnel', 'log.txt');
            if (!fs.existsSync(logPath)) {
                return res.json({
                    exists: false,
                    size: 0,
                    lastModified: null,
                    path: logPath,
                });
            }
            const stats = fs.statSync(logPath);
            res.json({
                exists: true,
                size: stats.size,
                sizeHuman: formatBytes(stats.size),
                lastModified: stats.mtime,
                path: logPath,
            });
        }
        catch (error) {
            logger.error('Failed to get log info:', error);
            res.status(500).json({ error: 'Failed to get log info' });
        }
    });
    // Clear log file (for development/debugging)
    router.delete('/logs/clear', (_req, res) => {
        try {
            const logPath = path.join(os.homedir(), '.vibetunnel', 'log.txt');
            if (fs.existsSync(logPath)) {
                fs.truncateSync(logPath, 0);
                logger.log('Log file cleared');
            }
            res.status(204).send();
        }
        catch (error) {
            logger.error('Failed to clear log file:', error);
            res.status(500).json({ error: 'Failed to clear log file' });
        }
    });
    // Flush log buffer (for testing)
    router.post('/logs/flush', async (_req, res) => {
        try {
            await (0, logger_js_1.flushLogger)();
            res.status(204).send();
        }
        catch (error) {
            logger.error('Failed to flush log buffer:', error);
            res.status(500).json({ error: 'Failed to flush log buffer' });
        }
    });
    return router;
}
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9ncy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL2xvZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFnQkEsMENBcUhDO0FBcklELHFDQUE4RDtBQUM5RCx1Q0FBeUI7QUFDekIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3QixrREFBOEU7QUFFOUUsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0FBVXBDLFNBQWdCLGVBQWUsQ0FBQyxPQUF5QjtJQUN2RCxNQUFNLE1BQU0sR0FBRyxJQUFBLGdCQUFNLEdBQUUsQ0FBQztJQUV4QiwrQkFBK0I7SUFDL0IsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxHQUFZLEVBQUUsR0FBYSxFQUFFLEVBQUU7UUFDMUQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQXdCLENBQUM7WUFFN0QsaUJBQWlCO1lBQ2pCLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQzlDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLEtBQUssRUFBRSxzREFBc0Q7aUJBQzlELENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxpQkFBaUI7WUFDakIsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ3ZELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLEtBQUssRUFBRSx3REFBd0Q7aUJBQ2hFLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCwrRUFBK0U7WUFDL0UsTUFBTSxZQUFZLEdBQUcsUUFBUSxNQUFNLEVBQUUsQ0FBQztZQUV0QyxpREFBaUQ7WUFDakQsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBRXhDLDJDQUEyQztZQUMzQyxJQUFBLHlCQUFhLEVBQUMsV0FBVyxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBRS9FLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxtQkFBbUI7SUFDbkIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFhLEVBQUUsR0FBYSxFQUFFLEVBQUU7UUFDdkQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRWxFLDBEQUEwRDtZQUMxRCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM1QixHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO2dCQUMzRCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEIsQ0FBQztZQUVELHNCQUFzQjtZQUN0QixHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1lBQzNELE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM1QyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNoRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgscUJBQXFCO0lBQ3JCLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLENBQUMsSUFBYSxFQUFFLEdBQWEsRUFBRSxFQUFFO1FBQ3hELElBQUksQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUVsRSxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUM1QixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7b0JBQ2QsTUFBTSxFQUFFLEtBQUs7b0JBQ2IsSUFBSSxFQUFFLENBQUM7b0JBQ1AsWUFBWSxFQUFFLElBQUk7b0JBQ2xCLElBQUksRUFBRSxPQUFPO2lCQUNkLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRW5DLEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ1AsTUFBTSxFQUFFLElBQUk7Z0JBQ1osSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUNoQixTQUFTLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7Z0JBQ2xDLFlBQVksRUFBRSxLQUFLLENBQUMsS0FBSztnQkFDekIsSUFBSSxFQUFFLE9BQU87YUFDZCxDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMseUJBQXlCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDL0MsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBQzVELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILDZDQUE2QztJQUM3QyxNQUFNLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQWEsRUFBRSxHQUFhLEVBQUUsRUFBRTtRQUM1RCxJQUFJLENBQUM7WUFDSCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFbEUsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzNCLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixNQUFNLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDakMsQ0FBQztZQUVELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxpQ0FBaUM7SUFDakMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsS0FBSyxFQUFFLElBQWEsRUFBRSxHQUFhLEVBQUUsRUFBRTtRQUNoRSxJQUFJLENBQUM7WUFDSCxNQUFNLElBQUEsdUJBQVcsR0FBRSxDQUFDO1lBQ3BCLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDekIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ25ELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDRCQUE0QixFQUFFLENBQUMsQ0FBQztRQUNoRSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyxXQUFXLENBQUMsS0FBYTtJQUNoQyxJQUFJLEtBQUssS0FBSyxDQUFDO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFDbEMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ2YsTUFBTSxLQUFLLEdBQUcsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMxQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BELE9BQU8sR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUN6RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBSZXF1ZXN0LCB0eXBlIFJlc3BvbnNlLCBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIsIGZsdXNoTG9nZ2VyLCBsb2dGcm9tTW9kdWxlIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdsb2dzJyk7XG5cbnR5cGUgTG9nUm91dGVzQ29uZmlnID0gUmVjb3JkPHN0cmluZywgbmV2ZXI+O1xuXG5pbnRlcmZhY2UgQ2xpZW50TG9nUmVxdWVzdCB7XG4gIGxldmVsOiAnbG9nJyB8ICd3YXJuJyB8ICdlcnJvcicgfCAnZGVidWcnO1xuICBtb2R1bGU6IHN0cmluZztcbiAgYXJnczogdW5rbm93bltdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTG9nUm91dGVzKF9jb25maWc/OiBMb2dSb3V0ZXNDb25maWcpOiBSb3V0ZXIge1xuICBjb25zdCByb3V0ZXIgPSBSb3V0ZXIoKTtcblxuICAvLyBDbGllbnQtc2lkZSBsb2dnaW5nIGVuZHBvaW50XG4gIHJvdXRlci5wb3N0KCcvbG9ncy9jbGllbnQnLCAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgbGV2ZWwsIG1vZHVsZSwgYXJncyB9ID0gcmVxLmJvZHkgYXMgQ2xpZW50TG9nUmVxdWVzdDtcblxuICAgICAgLy8gVmFsaWRhdGUgaW5wdXRcbiAgICAgIGlmICghbGV2ZWwgfHwgIW1vZHVsZSB8fCAhQXJyYXkuaXNBcnJheShhcmdzKSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBsb2cgcmVxdWVzdC4gUmVxdWlyZWQ6IGxldmVsLCBtb2R1bGUsIGFyZ3NbXScsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBWYWxpZGF0ZSBsZXZlbFxuICAgICAgaWYgKCFbJ2xvZycsICd3YXJuJywgJ2Vycm9yJywgJ2RlYnVnJ10uaW5jbHVkZXMobGV2ZWwpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIGxvZyBsZXZlbC4gTXVzdCBiZTogbG9nLCB3YXJuLCBlcnJvciwgb3IgZGVidWcnLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIFtGRV0gcHJlZml4IHRvIG1vZHVsZSBuYW1lIHRvIGRpc3Rpbmd1aXNoIGZyb250ZW5kIGxvZ3MgZnJvbSBzZXJ2ZXIgbG9nc1xuICAgICAgY29uc3QgY2xpZW50TW9kdWxlID0gYFtGRV0gJHttb2R1bGV9YDtcblxuICAgICAgLy8gTWFwIGNsaWVudCBsZXZlbHMgdG8gc2VydmVyIGxldmVscyAodXBwZXJjYXNlKVxuICAgICAgY29uc3Qgc2VydmVyTGV2ZWwgPSBsZXZlbC50b1VwcGVyQ2FzZSgpO1xuXG4gICAgICAvLyBMb2cgdG8gc2VydmVyIGxvZyBmaWxlIHZpYSBsb2dGcm9tTW9kdWxlXG4gICAgICBsb2dGcm9tTW9kdWxlKHNlcnZlckxldmVsID09PSAnTE9HJyA/ICdMT0cnIDogc2VydmVyTGV2ZWwsIGNsaWVudE1vZHVsZSwgYXJncyk7XG5cbiAgICAgIHJlcy5zdGF0dXMoMjA0KS5zZW5kKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHByb2Nlc3MgY2xpZW50IGxvZzonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHByb2Nlc3MgbG9nJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCByYXcgbG9nIGZpbGVcbiAgcm91dGVyLmdldCgnL2xvZ3MvcmF3JywgKF9yZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbCcsICdsb2cudHh0Jyk7XG5cbiAgICAgIC8vIENoZWNrIGlmIGxvZyBmaWxlIGV4aXN0cyAtIGlmIG5vdCwgcmV0dXJuIGVtcHR5IGNvbnRlbnRcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhsb2dQYXRoKSkge1xuICAgICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOCcpO1xuICAgICAgICByZXR1cm4gcmVzLnNlbmQoJycpO1xuICAgICAgfVxuXG4gICAgICAvLyBTdHJlYW0gdGhlIGxvZyBmaWxlXG4gICAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9wbGFpbjsgY2hhcnNldD11dGYtOCcpO1xuICAgICAgY29uc3Qgc3RyZWFtID0gZnMuY3JlYXRlUmVhZFN0cmVhbShsb2dQYXRoKTtcbiAgICAgIHN0cmVhbS5waXBlKHJlcyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHJlYWQgbG9nIGZpbGU6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byByZWFkIGxvZyBmaWxlJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIEdldCBsb2cgc3RhdHMvaW5mb1xuICByb3V0ZXIuZ2V0KCcvbG9ncy9pbmZvJywgKF9yZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgbG9nUGF0aCA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbCcsICdsb2cudHh0Jyk7XG5cbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhsb2dQYXRoKSkge1xuICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgIGV4aXN0czogZmFsc2UsXG4gICAgICAgICAgc2l6ZTogMCxcbiAgICAgICAgICBsYXN0TW9kaWZpZWQ6IG51bGwsXG4gICAgICAgICAgcGF0aDogbG9nUGF0aCxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0YXRzID0gZnMuc3RhdFN5bmMobG9nUGF0aCk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgZXhpc3RzOiB0cnVlLFxuICAgICAgICBzaXplOiBzdGF0cy5zaXplLFxuICAgICAgICBzaXplSHVtYW46IGZvcm1hdEJ5dGVzKHN0YXRzLnNpemUpLFxuICAgICAgICBsYXN0TW9kaWZpZWQ6IHN0YXRzLm10aW1lLFxuICAgICAgICBwYXRoOiBsb2dQYXRoLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGdldCBsb2cgaW5mbzonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCBsb2cgaW5mbycgfSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBDbGVhciBsb2cgZmlsZSAoZm9yIGRldmVsb3BtZW50L2RlYnVnZ2luZylcbiAgcm91dGVyLmRlbGV0ZSgnL2xvZ3MvY2xlYXInLCAoX3JlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBsb2dQYXRoID0gcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy52aWJldHVubmVsJywgJ2xvZy50eHQnKTtcblxuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMobG9nUGF0aCkpIHtcbiAgICAgICAgZnMudHJ1bmNhdGVTeW5jKGxvZ1BhdGgsIDApO1xuICAgICAgICBsb2dnZXIubG9nKCdMb2cgZmlsZSBjbGVhcmVkJyk7XG4gICAgICB9XG5cbiAgICAgIHJlcy5zdGF0dXMoMjA0KS5zZW5kKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGNsZWFyIGxvZyBmaWxlOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gY2xlYXIgbG9nIGZpbGUnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gRmx1c2ggbG9nIGJ1ZmZlciAoZm9yIHRlc3RpbmcpXG4gIHJvdXRlci5wb3N0KCcvbG9ncy9mbHVzaCcsIGFzeW5jIChfcmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGF3YWl0IGZsdXNoTG9nZ2VyKCk7XG4gICAgICByZXMuc3RhdHVzKDIwNCkuc2VuZCgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBmbHVzaCBsb2cgYnVmZmVyOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZmx1c2ggbG9nIGJ1ZmZlcicgfSk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gcm91dGVyO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRCeXRlcyhieXRlczogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKGJ5dGVzID09PSAwKSByZXR1cm4gJzAgQnl0ZXMnO1xuICBjb25zdCBrID0gMTAyNDtcbiAgY29uc3Qgc2l6ZXMgPSBbJ0J5dGVzJywgJ0tCJywgJ01CJywgJ0dCJ107XG4gIGNvbnN0IGkgPSBNYXRoLmZsb29yKE1hdGgubG9nKGJ5dGVzKSAvIE1hdGgubG9nKGspKTtcbiAgcmV0dXJuIGAke051bWJlci5wYXJzZUZsb2F0KChieXRlcyAvIGsgKiogaSkudG9GaXhlZCgyKSl9ICR7c2l6ZXNbaV19YDtcbn1cbiJdfQ==