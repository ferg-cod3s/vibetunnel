"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestNotificationRouter = createTestNotificationRouter;
const express_1 = require("express");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const version_js_1 = require("../version.js");
const logger = (0, logger_js_1.createLogger)('test-notification');
/**
 * Test notification endpoint to verify the full notification flow
 * from server → SSE → Mac app AND push notifications
 */
function createTestNotificationRouter(options) {
    const { sessionMonitor, pushNotificationService } = options;
    const router = (0, express_1.Router)();
    // POST /api/test-notification - Trigger a test notification through BOTH SSE and push systems
    router.post('/test-notification', async (req, res) => {
        logger.info('📨 Test notification requested from client');
        logger.debug('Request headers:', req.headers);
        if (!sessionMonitor) {
            logger.error('❌ SessionMonitor not available - notification system not initialized');
            return res.status(503).json({
                error: 'Notification system not initialized',
            });
        }
        try {
            // Get server version info
            const versionInfo = (0, version_js_1.getVersionInfo)();
            // Create the test notification event
            const testEvent = {
                type: types_js_1.ServerEventType.TestNotification,
                sessionId: 'test-session',
                sessionName: 'Test Notification',
                timestamp: new Date().toISOString(),
                message: 'This is a test notification from VibeTunnel server',
                title: `VibeTunnel Test v${versionInfo.version}`,
                body: `Server-side notifications are working correctly! Server version: ${versionInfo.version}`,
            };
            logger.info('📤 Emitting test notification event through SessionMonitor:', testEvent);
            // Emit a test notification event through SessionMonitor
            // This will be picked up by the SSE endpoint and sent to all connected clients
            sessionMonitor.emit('notification', testEvent);
            logger.info('✅ Test notification event emitted successfully through SSE');
            // Also send through push notification service if available
            let pushResult = null;
            if (pushNotificationService) {
                try {
                    logger.info('📤 Sending test notification through push service...');
                    pushResult = await pushNotificationService.sendNotification({
                        type: 'test',
                        title: testEvent.title || '🔔 Test Notification',
                        body: testEvent.body || 'This is a test notification from VibeTunnel',
                        icon: '/apple-touch-icon.png',
                        badge: '/favicon-32.png',
                        tag: 'vibetunnel-test',
                        requireInteraction: false,
                        actions: [
                            {
                                action: 'dismiss',
                                title: 'Dismiss',
                            },
                        ],
                        data: {
                            type: 'test-notification',
                            sessionId: testEvent.sessionId,
                            timestamp: testEvent.timestamp,
                        },
                    });
                    logger.info(`✅ Push notification sent to ${pushResult.sent} subscribers`);
                }
                catch (error) {
                    logger.error('❌ Failed to send push notification:', error);
                }
            }
            res.json({
                success: true,
                message: 'Test notification sent through SSE and push',
                event: testEvent,
                pushResult,
            });
        }
        catch (error) {
            logger.error('❌ Failed to send test notification:', error);
            res.status(500).json({
                error: 'Failed to send test notification',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1ub3RpZmljYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3JvdXRlcy90ZXN0LW5vdGlmaWNhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWtCQSxvRUFzRkM7QUF4R0QscUNBQThEO0FBQzlELG9EQUF3RDtBQUd4RCxrREFBa0Q7QUFDbEQsOENBQStDO0FBRS9DLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBT2pEOzs7R0FHRztBQUNILFNBQWdCLDRCQUE0QixDQUFDLE9BQWdDO0lBQzNFLE1BQU0sRUFBRSxjQUFjLEVBQUUsdUJBQXVCLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDNUQsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7SUFFeEIsOEZBQThGO0lBQzlGLE1BQU0sQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLEdBQVksRUFBRSxHQUFhLEVBQUUsRUFBRTtRQUN0RSxNQUFNLENBQUMsSUFBSSxDQUFDLDRDQUE0QyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFOUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sQ0FBQyxLQUFLLENBQUMsc0VBQXNFLENBQUMsQ0FBQztZQUNyRixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUMxQixLQUFLLEVBQUUscUNBQXFDO2FBQzdDLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxJQUFJLENBQUM7WUFDSCwwQkFBMEI7WUFDMUIsTUFBTSxXQUFXLEdBQUcsSUFBQSwyQkFBYyxHQUFFLENBQUM7WUFFckMscUNBQXFDO1lBQ3JDLE1BQU0sU0FBUyxHQUFHO2dCQUNoQixJQUFJLEVBQUUsMEJBQWUsQ0FBQyxnQkFBZ0I7Z0JBQ3RDLFNBQVMsRUFBRSxjQUFjO2dCQUN6QixXQUFXLEVBQUUsbUJBQW1CO2dCQUNoQyxTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ25DLE9BQU8sRUFBRSxvREFBb0Q7Z0JBQzdELEtBQUssRUFBRSxvQkFBb0IsV0FBVyxDQUFDLE9BQU8sRUFBRTtnQkFDaEQsSUFBSSxFQUFFLG9FQUFvRSxXQUFXLENBQUMsT0FBTyxFQUFFO2FBQ2hHLENBQUM7WUFFRixNQUFNLENBQUMsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRXRGLHdEQUF3RDtZQUN4RCwrRUFBK0U7WUFDL0UsY0FBYyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFL0MsTUFBTSxDQUFDLElBQUksQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1lBRTFFLDJEQUEyRDtZQUMzRCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDdEIsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO2dCQUM1QixJQUFJLENBQUM7b0JBQ0gsTUFBTSxDQUFDLElBQUksQ0FBQyxzREFBc0QsQ0FBQyxDQUFDO29CQUNwRSxVQUFVLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQyxnQkFBZ0IsQ0FBQzt3QkFDMUQsSUFBSSxFQUFFLE1BQU07d0JBQ1osS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLElBQUksc0JBQXNCO3dCQUNoRCxJQUFJLEVBQUUsU0FBUyxDQUFDLElBQUksSUFBSSw2Q0FBNkM7d0JBQ3JFLElBQUksRUFBRSx1QkFBdUI7d0JBQzdCLEtBQUssRUFBRSxpQkFBaUI7d0JBQ3hCLEdBQUcsRUFBRSxpQkFBaUI7d0JBQ3RCLGtCQUFrQixFQUFFLEtBQUs7d0JBQ3pCLE9BQU8sRUFBRTs0QkFDUDtnQ0FDRSxNQUFNLEVBQUUsU0FBUztnQ0FDakIsS0FBSyxFQUFFLFNBQVM7NkJBQ2pCO3lCQUNGO3dCQUNELElBQUksRUFBRTs0QkFDSixJQUFJLEVBQUUsbUJBQW1COzRCQUN6QixTQUFTLEVBQUUsU0FBUyxDQUFDLFNBQVM7NEJBQzlCLFNBQVMsRUFBRSxTQUFTLENBQUMsU0FBUzt5QkFDL0I7cUJBQ0YsQ0FBQyxDQUFDO29CQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsK0JBQStCLFVBQVUsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxDQUFDO2dCQUM1RSxDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDN0QsQ0FBQztZQUNILENBQUM7WUFFRCxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUNQLE9BQU8sRUFBRSxJQUFJO2dCQUNiLE9BQU8sRUFBRSw2Q0FBNkM7Z0JBQ3RELEtBQUssRUFBRSxTQUFTO2dCQUNoQixVQUFVO2FBQ1gsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNELEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDO2dCQUNuQixLQUFLLEVBQUUsa0NBQWtDO2dCQUN6QyxPQUFPLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNsRSxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBSZXF1ZXN0LCB0eXBlIFJlc3BvbnNlLCBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IFNlcnZlckV2ZW50VHlwZSB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvcHVzaC1ub3RpZmljYXRpb24tc2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25Nb25pdG9yIH0gZnJvbSAnLi4vc2VydmljZXMvc2Vzc2lvbi1tb25pdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBnZXRWZXJzaW9uSW5mbyB9IGZyb20gJy4uL3ZlcnNpb24uanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3Rlc3Qtbm90aWZpY2F0aW9uJyk7XG5cbmludGVyZmFjZSBUZXN0Tm90aWZpY2F0aW9uT3B0aW9ucyB7XG4gIHNlc3Npb25Nb25pdG9yPzogU2Vzc2lvbk1vbml0b3I7XG4gIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlPzogUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfCBudWxsO1xufVxuXG4vKipcbiAqIFRlc3Qgbm90aWZpY2F0aW9uIGVuZHBvaW50IHRvIHZlcmlmeSB0aGUgZnVsbCBub3RpZmljYXRpb24gZmxvd1xuICogZnJvbSBzZXJ2ZXIg4oaSIFNTRSDihpIgTWFjIGFwcCBBTkQgcHVzaCBub3RpZmljYXRpb25zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXN0Tm90aWZpY2F0aW9uUm91dGVyKG9wdGlvbnM6IFRlc3ROb3RpZmljYXRpb25PcHRpb25zKTogUm91dGVyIHtcbiAgY29uc3QgeyBzZXNzaW9uTW9uaXRvciwgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuXG4gIC8vIFBPU1QgL2FwaS90ZXN0LW5vdGlmaWNhdGlvbiAtIFRyaWdnZXIgYSB0ZXN0IG5vdGlmaWNhdGlvbiB0aHJvdWdoIEJPVEggU1NFIGFuZCBwdXNoIHN5c3RlbXNcbiAgcm91dGVyLnBvc3QoJy90ZXN0LW5vdGlmaWNhdGlvbicsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICBsb2dnZXIuaW5mbygn8J+TqCBUZXN0IG5vdGlmaWNhdGlvbiByZXF1ZXN0ZWQgZnJvbSBjbGllbnQnKTtcbiAgICBsb2dnZXIuZGVidWcoJ1JlcXVlc3QgaGVhZGVyczonLCByZXEuaGVhZGVycyk7XG5cbiAgICBpZiAoIXNlc3Npb25Nb25pdG9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBTZXNzaW9uTW9uaXRvciBub3QgYXZhaWxhYmxlIC0gbm90aWZpY2F0aW9uIHN5c3RlbSBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7XG4gICAgICAgIGVycm9yOiAnTm90aWZpY2F0aW9uIHN5c3RlbSBub3QgaW5pdGlhbGl6ZWQnLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCBzZXJ2ZXIgdmVyc2lvbiBpbmZvXG4gICAgICBjb25zdCB2ZXJzaW9uSW5mbyA9IGdldFZlcnNpb25JbmZvKCk7XG5cbiAgICAgIC8vIENyZWF0ZSB0aGUgdGVzdCBub3RpZmljYXRpb24gZXZlbnRcbiAgICAgIGNvbnN0IHRlc3RFdmVudCA9IHtcbiAgICAgICAgdHlwZTogU2VydmVyRXZlbnRUeXBlLlRlc3ROb3RpZmljYXRpb24sXG4gICAgICAgIHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicsXG4gICAgICAgIHNlc3Npb25OYW1lOiAnVGVzdCBOb3RpZmljYXRpb24nLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgbWVzc2FnZTogJ1RoaXMgaXMgYSB0ZXN0IG5vdGlmaWNhdGlvbiBmcm9tIFZpYmVUdW5uZWwgc2VydmVyJyxcbiAgICAgICAgdGl0bGU6IGBWaWJlVHVubmVsIFRlc3QgdiR7dmVyc2lvbkluZm8udmVyc2lvbn1gLFxuICAgICAgICBib2R5OiBgU2VydmVyLXNpZGUgbm90aWZpY2F0aW9ucyBhcmUgd29ya2luZyBjb3JyZWN0bHkhIFNlcnZlciB2ZXJzaW9uOiAke3ZlcnNpb25JbmZvLnZlcnNpb259YCxcbiAgICAgIH07XG5cbiAgICAgIGxvZ2dlci5pbmZvKCfwn5OkIEVtaXR0aW5nIHRlc3Qgbm90aWZpY2F0aW9uIGV2ZW50IHRocm91Z2ggU2Vzc2lvbk1vbml0b3I6JywgdGVzdEV2ZW50KTtcblxuICAgICAgLy8gRW1pdCBhIHRlc3Qgbm90aWZpY2F0aW9uIGV2ZW50IHRocm91Z2ggU2Vzc2lvbk1vbml0b3JcbiAgICAgIC8vIFRoaXMgd2lsbCBiZSBwaWNrZWQgdXAgYnkgdGhlIFNTRSBlbmRwb2ludCBhbmQgc2VudCB0byBhbGwgY29ubmVjdGVkIGNsaWVudHNcbiAgICAgIHNlc3Npb25Nb25pdG9yLmVtaXQoJ25vdGlmaWNhdGlvbicsIHRlc3RFdmVudCk7XG5cbiAgICAgIGxvZ2dlci5pbmZvKCfinIUgVGVzdCBub3RpZmljYXRpb24gZXZlbnQgZW1pdHRlZCBzdWNjZXNzZnVsbHkgdGhyb3VnaCBTU0UnKTtcblxuICAgICAgLy8gQWxzbyBzZW5kIHRocm91Z2ggcHVzaCBub3RpZmljYXRpb24gc2VydmljZSBpZiBhdmFpbGFibGVcbiAgICAgIGxldCBwdXNoUmVzdWx0ID0gbnVsbDtcbiAgICAgIGlmIChwdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGxvZ2dlci5pbmZvKCfwn5OkIFNlbmRpbmcgdGVzdCBub3RpZmljYXRpb24gdGhyb3VnaCBwdXNoIHNlcnZpY2UuLi4nKTtcbiAgICAgICAgICBwdXNoUmVzdWx0ID0gYXdhaXQgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2Uuc2VuZE5vdGlmaWNhdGlvbih7XG4gICAgICAgICAgICB0eXBlOiAndGVzdCcsXG4gICAgICAgICAgICB0aXRsZTogdGVzdEV2ZW50LnRpdGxlIHx8ICfwn5SUIFRlc3QgTm90aWZpY2F0aW9uJyxcbiAgICAgICAgICAgIGJvZHk6IHRlc3RFdmVudC5ib2R5IHx8ICdUaGlzIGlzIGEgdGVzdCBub3RpZmljYXRpb24gZnJvbSBWaWJlVHVubmVsJyxcbiAgICAgICAgICAgIGljb246ICcvYXBwbGUtdG91Y2gtaWNvbi5wbmcnLFxuICAgICAgICAgICAgYmFkZ2U6ICcvZmF2aWNvbi0zMi5wbmcnLFxuICAgICAgICAgICAgdGFnOiAndmliZXR1bm5lbC10ZXN0JyxcbiAgICAgICAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICdkaXNtaXNzJyxcbiAgICAgICAgICAgICAgICB0aXRsZTogJ0Rpc21pc3MnLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgICAgdHlwZTogJ3Rlc3Qtbm90aWZpY2F0aW9uJyxcbiAgICAgICAgICAgICAgc2Vzc2lvbklkOiB0ZXN0RXZlbnQuc2Vzc2lvbklkLFxuICAgICAgICAgICAgICB0aW1lc3RhbXA6IHRlc3RFdmVudC50aW1lc3RhbXAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxvZ2dlci5pbmZvKGDinIUgUHVzaCBub3RpZmljYXRpb24gc2VudCB0byAke3B1c2hSZXN1bHQuc2VudH0gc3Vic2NyaWJlcnNgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gc2VuZCBwdXNoIG5vdGlmaWNhdGlvbjonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgICBtZXNzYWdlOiAnVGVzdCBub3RpZmljYXRpb24gc2VudCB0aHJvdWdoIFNTRSBhbmQgcHVzaCcsXG4gICAgICAgIGV2ZW50OiB0ZXN0RXZlbnQsXG4gICAgICAgIHB1c2hSZXN1bHQsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCfinYwgRmFpbGVkIHRvIHNlbmQgdGVzdCBub3RpZmljYXRpb246JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBzZW5kIHRlc3Qgbm90aWZpY2F0aW9uJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiByb3V0ZXI7XG59XG4iXX0=