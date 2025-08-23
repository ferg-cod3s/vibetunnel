"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlEventEmitter = void 0;
exports.createControlRoutes = createControlRoutes;
/**
 * Control Event Stream Route
 *
 * Provides a server-sent event stream for real-time control messages
 * including Git notifications and system events.
 */
const events_1 = require("events");
const express_1 = require("express");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('control-stream');
// Event emitter for control events
exports.controlEventEmitter = new events_1.EventEmitter();
function createControlRoutes() {
    const router = (0, express_1.Router)();
    // SSE endpoint for control events
    router.get('/control/stream', (req, res) => {
        // Set headers for SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable Nginx buffering
        });
        // Send initial connection message
        res.write(':ok\n\n');
        logger.debug('Control event stream connected');
        // Subscribe to control events
        const handleEvent = (event) => {
            try {
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            }
            catch (error) {
                logger.error('Failed to send control event:', error);
            }
        };
        exports.controlEventEmitter.on('event', handleEvent);
        // Send periodic heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            res.write(':heartbeat\n\n');
        }, 30000); // 30 seconds
        // Clean up on disconnect
        req.on('close', () => {
            logger.debug('Control event stream disconnected');
            exports.controlEventEmitter.off('event', handleEvent);
            clearInterval(heartbeatInterval);
        });
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL2NvbnRyb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBc0JBLGtEQTJDQztBQWpFRDs7Ozs7R0FLRztBQUNILG1DQUFzQztBQUN0QyxxQ0FBaUM7QUFFakMsa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBRTlDLG1DQUFtQztBQUN0QixRQUFBLG1CQUFtQixHQUFHLElBQUkscUJBQVksRUFBRSxDQUFDO0FBUXRELFNBQWdCLG1CQUFtQjtJQUNqQyxNQUFNLE1BQU0sR0FBRyxJQUFBLGdCQUFNLEdBQUUsQ0FBQztJQUV4QixrQ0FBa0M7SUFDbEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLEdBQXlCLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDL0Qsc0JBQXNCO1FBQ3RCLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ2pCLGNBQWMsRUFBRSxtQkFBbUI7WUFDbkMsZUFBZSxFQUFFLFVBQVU7WUFDM0IsVUFBVSxFQUFFLFlBQVk7WUFDeEIsbUJBQW1CLEVBQUUsSUFBSSxFQUFFLDBCQUEwQjtTQUN0RCxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVyQixNQUFNLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFFL0MsOEJBQThCO1FBQzlCLE1BQU0sV0FBVyxHQUFHLENBQUMsS0FBbUIsRUFBRSxFQUFFO1lBQzFDLElBQUksQ0FBQztnQkFDSCxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEQsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBRUYsMkJBQW1CLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUU3QyxtREFBbUQ7UUFDbkQsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFO1lBQ3pDLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUM5QixDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxhQUFhO1FBRXhCLHlCQUF5QjtRQUN6QixHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDbkIsTUFBTSxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1lBQ2xELDJCQUFtQixDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDOUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvbnRyb2wgRXZlbnQgU3RyZWFtIFJvdXRlXG4gKlxuICogUHJvdmlkZXMgYSBzZXJ2ZXItc2VudCBldmVudCBzdHJlYW0gZm9yIHJlYWwtdGltZSBjb250cm9sIG1lc3NhZ2VzXG4gKiBpbmNsdWRpbmcgR2l0IG5vdGlmaWNhdGlvbnMgYW5kIHN5c3RlbSBldmVudHMuXG4gKi9cbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB0eXBlIHsgQXV0aGVudGljYXRlZFJlcXVlc3QgfSBmcm9tICcuLi9taWRkbGV3YXJlL2F1dGguanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdjb250cm9sLXN0cmVhbScpO1xuXG4vLyBFdmVudCBlbWl0dGVyIGZvciBjb250cm9sIGV2ZW50c1xuZXhwb3J0IGNvbnN0IGNvbnRyb2xFdmVudEVtaXR0ZXIgPSBuZXcgRXZlbnRFbWl0dGVyKCk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udHJvbEV2ZW50IHtcbiAgY2F0ZWdvcnk6IHN0cmluZztcbiAgYWN0aW9uOiBzdHJpbmc7XG4gIGRhdGE/OiB1bmtub3duO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29udHJvbFJvdXRlcygpOiBSb3V0ZXIge1xuICBjb25zdCByb3V0ZXIgPSBSb3V0ZXIoKTtcblxuICAvLyBTU0UgZW5kcG9pbnQgZm9yIGNvbnRyb2wgZXZlbnRzXG4gIHJvdXRlci5nZXQoJy9jb250cm9sL3N0cmVhbScsIChyZXE6IEF1dGhlbnRpY2F0ZWRSZXF1ZXN0LCByZXMpID0+IHtcbiAgICAvLyBTZXQgaGVhZGVycyBmb3IgU1NFXG4gICAgcmVzLndyaXRlSGVhZCgyMDAsIHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAndGV4dC9ldmVudC1zdHJlYW0nLFxuICAgICAgJ0NhY2hlLUNvbnRyb2wnOiAnbm8tY2FjaGUnLFxuICAgICAgQ29ubmVjdGlvbjogJ2tlZXAtYWxpdmUnLFxuICAgICAgJ1gtQWNjZWwtQnVmZmVyaW5nJzogJ25vJywgLy8gRGlzYWJsZSBOZ2lueCBidWZmZXJpbmdcbiAgICB9KTtcblxuICAgIC8vIFNlbmQgaW5pdGlhbCBjb25uZWN0aW9uIG1lc3NhZ2VcbiAgICByZXMud3JpdGUoJzpva1xcblxcbicpO1xuXG4gICAgbG9nZ2VyLmRlYnVnKCdDb250cm9sIGV2ZW50IHN0cmVhbSBjb25uZWN0ZWQnKTtcblxuICAgIC8vIFN1YnNjcmliZSB0byBjb250cm9sIGV2ZW50c1xuICAgIGNvbnN0IGhhbmRsZUV2ZW50ID0gKGV2ZW50OiBDb250cm9sRXZlbnQpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcy53cml0ZShgZGF0YTogJHtKU09OLnN0cmluZ2lmeShldmVudCl9XFxuXFxuYCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIGNvbnRyb2wgZXZlbnQ6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICBjb250cm9sRXZlbnRFbWl0dGVyLm9uKCdldmVudCcsIGhhbmRsZUV2ZW50KTtcblxuICAgIC8vIFNlbmQgcGVyaW9kaWMgaGVhcnRiZWF0IHRvIGtlZXAgY29ubmVjdGlvbiBhbGl2ZVxuICAgIGNvbnN0IGhlYXJ0YmVhdEludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgcmVzLndyaXRlKCc6aGVhcnRiZWF0XFxuXFxuJyk7XG4gICAgfSwgMzAwMDApOyAvLyAzMCBzZWNvbmRzXG5cbiAgICAvLyBDbGVhbiB1cCBvbiBkaXNjb25uZWN0XG4gICAgcmVxLm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ29udHJvbCBldmVudCBzdHJlYW0gZGlzY29ubmVjdGVkJyk7XG4gICAgICBjb250cm9sRXZlbnRFbWl0dGVyLm9mZignZXZlbnQnLCBoYW5kbGVFdmVudCk7XG4gICAgICBjbGVhckludGVydmFsKGhlYXJ0YmVhdEludGVydmFsKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==