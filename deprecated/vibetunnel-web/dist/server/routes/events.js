"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventsRouter = createEventsRouter;
const express_1 = require("express");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('events');
/**
 * Server-Sent Events (SSE) endpoint for real-time event streaming
 */
function createEventsRouter(sessionMonitor) {
    const router = (0, express_1.Router)();
    // SSE endpoint for event streaming
    router.get('/events', (req, res) => {
        logger.info('📡 SSE connection attempt received');
        logger.debug('Client connected to event stream');
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
        // Event ID counter
        let eventId = 0;
        // biome-ignore lint/style/useConst: keepAlive is assigned after declaration
        let keepAlive;
        // Forward-declare event handlers for cleanup
        let onNotification;
        // Cleanup function to remove event listeners
        const cleanup = () => {
            if (keepAlive) {
                clearInterval(keepAlive);
            }
            if (sessionMonitor) {
                sessionMonitor.off('notification', onNotification);
            }
        };
        // Send initial connection event as default message event
        try {
            res.write('event: connected\ndata: {"type": "connected"}\n\n');
        }
        catch (error) {
            logger.debug('Failed to send initial connection event:', error);
            return;
        }
        // Keep connection alive
        keepAlive = setInterval(() => {
            try {
                res.write(':heartbeat\n\n'); // SSE comment to keep connection alive
            }
            catch (error) {
                logger.debug('Failed to send heartbeat:', error);
                cleanup();
            }
        }, 30000);
        // Handle SessionMonitor notification events
        if (sessionMonitor) {
            onNotification = (event) => {
                // SessionMonitor already provides properly formatted ServerEvent objects
                logger.info(`📢 SessionMonitor notification: ${event.type} for session ${event.sessionId}`);
                // Log test notifications specifically for debugging
                if (event.type === types_js_1.ServerEventType.TestNotification) {
                    logger.info('🧪 Forwarding test notification through SSE:', event);
                }
                // The event type is already included in the data payload
                try {
                    const sseMessage = `id: ${++eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
                    res.write(sseMessage);
                    logger.debug(`✅ SSE event written: ${event.type}`);
                }
                catch (error) {
                    logger.error('Failed to write SSE event:', error);
                }
            };
            sessionMonitor.on('notification', onNotification);
        }
        // Handle client disconnect
        req.on('close', () => {
            logger.debug('Client disconnected from event stream');
            cleanup();
        });
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvZXZlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBVUEsZ0RBcUZDO0FBL0ZELHFDQUE4RDtBQUM5RCxvREFBMEU7QUFFMUUsa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxRQUFRLENBQUMsQ0FBQztBQUV0Qzs7R0FFRztBQUNILFNBQWdCLGtCQUFrQixDQUFDLGNBQStCO0lBQ2hFLE1BQU0sTUFBTSxHQUFHLElBQUEsZ0JBQU0sR0FBRSxDQUFDO0lBRXhCLG1DQUFtQztJQUNuQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQVksRUFBRSxHQUFhLEVBQUUsRUFBRTtRQUNwRCxNQUFNLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWpELHNCQUFzQjtRQUN0QixHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsQ0FBQyxTQUFTLENBQUMsZUFBZSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQzNDLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEQsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtRQUVwRSxtQkFBbUI7UUFDbkIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLDRFQUE0RTtRQUM1RSxJQUFJLFNBQXlCLENBQUM7UUFFOUIsNkNBQTZDO1FBQzdDLElBQUksY0FBNEMsQ0FBQztRQUVqRCw2Q0FBNkM7UUFDN0MsTUFBTSxPQUFPLEdBQUcsR0FBRyxFQUFFO1lBQ25CLElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2QsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNCLENBQUM7WUFDRCxJQUFJLGNBQWMsRUFBRSxDQUFDO2dCQUNuQixjQUFjLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsQ0FBQztZQUNyRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBRUYseURBQXlEO1FBQ3pELElBQUksQ0FBQztZQUNILEdBQUcsQ0FBQyxLQUFLLENBQUMsbURBQW1ELENBQUMsQ0FBQztRQUNqRSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsMENBQTBDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDaEUsT0FBTztRQUNULENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsU0FBUyxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUU7WUFDM0IsSUFBSSxDQUFDO2dCQUNILEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLHVDQUF1QztZQUN0RSxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNqRCxPQUFPLEVBQUUsQ0FBQztZQUNaLENBQUM7UUFDSCxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFViw0Q0FBNEM7UUFDNUMsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNuQixjQUFjLEdBQUcsQ0FBQyxLQUFrQixFQUFFLEVBQUU7Z0JBQ3RDLHlFQUF5RTtnQkFDekUsTUFBTSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsS0FBSyxDQUFDLElBQUksZ0JBQWdCLEtBQUssQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUU1RixvREFBb0Q7Z0JBQ3BELElBQUksS0FBSyxDQUFDLElBQUksS0FBSywwQkFBZSxDQUFDLGdCQUFnQixFQUFFLENBQUM7b0JBQ3BELE1BQU0sQ0FBQyxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ3JFLENBQUM7Z0JBRUQseURBQXlEO2dCQUN6RCxJQUFJLENBQUM7b0JBQ0gsTUFBTSxVQUFVLEdBQUcsT0FBTyxFQUFFLE9BQU8sWUFDakMsS0FBSyxDQUFDLElBQ1IsV0FBVyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUM7b0JBQ3ZDLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDcEQsQ0FBQztZQUNILENBQUMsQ0FBQztZQUVGLGNBQWMsQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3BELENBQUM7UUFFRCwyQkFBMkI7UUFDM0IsR0FBRyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1lBQ25CLE1BQU0sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUN0RCxPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBSZXF1ZXN0LCB0eXBlIFJlc3BvbnNlLCBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IHR5cGUgU2VydmVyRXZlbnQsIFNlcnZlckV2ZW50VHlwZSB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25Nb25pdG9yIH0gZnJvbSAnLi4vc2VydmljZXMvc2Vzc2lvbi1tb25pdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignZXZlbnRzJyk7XG5cbi8qKlxuICogU2VydmVyLVNlbnQgRXZlbnRzIChTU0UpIGVuZHBvaW50IGZvciByZWFsLXRpbWUgZXZlbnQgc3RyZWFtaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFdmVudHNSb3V0ZXIoc2Vzc2lvbk1vbml0b3I/OiBTZXNzaW9uTW9uaXRvcik6IFJvdXRlciB7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuXG4gIC8vIFNTRSBlbmRwb2ludCBmb3IgZXZlbnQgc3RyZWFtaW5nXG4gIHJvdXRlci5nZXQoJy9ldmVudHMnLCAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgbG9nZ2VyLmluZm8oJ/Cfk6EgU1NFIGNvbm5lY3Rpb24gYXR0ZW1wdCByZWNlaXZlZCcpO1xuICAgIGxvZ2dlci5kZWJ1ZygnQ2xpZW50IGNvbm5lY3RlZCB0byBldmVudCBzdHJlYW0nKTtcblxuICAgIC8vIFNldCBoZWFkZXJzIGZvciBTU0VcbiAgICByZXMuc2V0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAndGV4dC9ldmVudC1zdHJlYW0nKTtcbiAgICByZXMuc2V0SGVhZGVyKCdDYWNoZS1Db250cm9sJywgJ25vLWNhY2hlJyk7XG4gICAgcmVzLnNldEhlYWRlcignQ29ubmVjdGlvbicsICdrZWVwLWFsaXZlJyk7XG4gICAgcmVzLnNldEhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgJyonKTtcbiAgICByZXMuc2V0SGVhZGVyKCdYLUFjY2VsLUJ1ZmZlcmluZycsICdubycpOyAvLyBEaXNhYmxlIHByb3h5IGJ1ZmZlcmluZ1xuXG4gICAgLy8gRXZlbnQgSUQgY291bnRlclxuICAgIGxldCBldmVudElkID0gMDtcbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdHlsZS91c2VDb25zdDoga2VlcEFsaXZlIGlzIGFzc2lnbmVkIGFmdGVyIGRlY2xhcmF0aW9uXG4gICAgbGV0IGtlZXBBbGl2ZTogTm9kZUpTLlRpbWVvdXQ7XG5cbiAgICAvLyBGb3J3YXJkLWRlY2xhcmUgZXZlbnQgaGFuZGxlcnMgZm9yIGNsZWFudXBcbiAgICBsZXQgb25Ob3RpZmljYXRpb246IChldmVudDogU2VydmVyRXZlbnQpID0+IHZvaWQ7XG5cbiAgICAvLyBDbGVhbnVwIGZ1bmN0aW9uIHRvIHJlbW92ZSBldmVudCBsaXN0ZW5lcnNcbiAgICBjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuICAgICAgaWYgKGtlZXBBbGl2ZSkge1xuICAgICAgICBjbGVhckludGVydmFsKGtlZXBBbGl2ZSk7XG4gICAgICB9XG4gICAgICBpZiAoc2Vzc2lvbk1vbml0b3IpIHtcbiAgICAgICAgc2Vzc2lvbk1vbml0b3Iub2ZmKCdub3RpZmljYXRpb24nLCBvbk5vdGlmaWNhdGlvbik7XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIFNlbmQgaW5pdGlhbCBjb25uZWN0aW9uIGV2ZW50IGFzIGRlZmF1bHQgbWVzc2FnZSBldmVudFxuICAgIHRyeSB7XG4gICAgICByZXMud3JpdGUoJ2V2ZW50OiBjb25uZWN0ZWRcXG5kYXRhOiB7XCJ0eXBlXCI6IFwiY29ubmVjdGVkXCJ9XFxuXFxuJyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnRmFpbGVkIHRvIHNlbmQgaW5pdGlhbCBjb25uZWN0aW9uIGV2ZW50OicsIGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBLZWVwIGNvbm5lY3Rpb24gYWxpdmVcbiAgICBrZWVwQWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICByZXMud3JpdGUoJzpoZWFydGJlYXRcXG5cXG4nKTsgLy8gU1NFIGNvbW1lbnQgdG8ga2VlcCBjb25uZWN0aW9uIGFsaXZlXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0ZhaWxlZCB0byBzZW5kIGhlYXJ0YmVhdDonLCBlcnJvcik7XG4gICAgICAgIGNsZWFudXAoKTtcbiAgICAgIH1cbiAgICB9LCAzMDAwMCk7XG5cbiAgICAvLyBIYW5kbGUgU2Vzc2lvbk1vbml0b3Igbm90aWZpY2F0aW9uIGV2ZW50c1xuICAgIGlmIChzZXNzaW9uTW9uaXRvcikge1xuICAgICAgb25Ob3RpZmljYXRpb24gPSAoZXZlbnQ6IFNlcnZlckV2ZW50KSA9PiB7XG4gICAgICAgIC8vIFNlc3Npb25Nb25pdG9yIGFscmVhZHkgcHJvdmlkZXMgcHJvcGVybHkgZm9ybWF0dGVkIFNlcnZlckV2ZW50IG9iamVjdHNcbiAgICAgICAgbG9nZ2VyLmluZm8oYPCfk6IgU2Vzc2lvbk1vbml0b3Igbm90aWZpY2F0aW9uOiAke2V2ZW50LnR5cGV9IGZvciBzZXNzaW9uICR7ZXZlbnQuc2Vzc2lvbklkfWApO1xuXG4gICAgICAgIC8vIExvZyB0ZXN0IG5vdGlmaWNhdGlvbnMgc3BlY2lmaWNhbGx5IGZvciBkZWJ1Z2dpbmdcbiAgICAgICAgaWYgKGV2ZW50LnR5cGUgPT09IFNlcnZlckV2ZW50VHlwZS5UZXN0Tm90aWZpY2F0aW9uKSB7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ/Cfp6ogRm9yd2FyZGluZyB0ZXN0IG5vdGlmaWNhdGlvbiB0aHJvdWdoIFNTRTonLCBldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGUgZXZlbnQgdHlwZSBpcyBhbHJlYWR5IGluY2x1ZGVkIGluIHRoZSBkYXRhIHBheWxvYWRcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBzc2VNZXNzYWdlID0gYGlkOiAkeysrZXZlbnRJZH1cXG5ldmVudDogJHtcbiAgICAgICAgICAgIGV2ZW50LnR5cGVcbiAgICAgICAgICB9XFxuZGF0YTogJHtKU09OLnN0cmluZ2lmeShldmVudCl9XFxuXFxuYDtcbiAgICAgICAgICByZXMud3JpdGUoc3NlTWVzc2FnZSk7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGDinIUgU1NFIGV2ZW50IHdyaXR0ZW46ICR7ZXZlbnQudHlwZX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byB3cml0ZSBTU0UgZXZlbnQ6JywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICBzZXNzaW9uTW9uaXRvci5vbignbm90aWZpY2F0aW9uJywgb25Ob3RpZmljYXRpb24pO1xuICAgIH1cblxuICAgIC8vIEhhbmRsZSBjbGllbnQgZGlzY29ubmVjdFxuICAgIHJlcS5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBsb2dnZXIuZGVidWcoJ0NsaWVudCBkaXNjb25uZWN0ZWQgZnJvbSBldmVudCBzdHJlYW0nKTtcbiAgICAgIGNsZWFudXAoKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==