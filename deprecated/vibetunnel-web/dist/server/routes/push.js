"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPushRoutes = createPushRoutes;
const express_1 = require("express");
const types_js_1 = require("../../shared/types.js");
const push_notification_status_service_js_1 = require("../services/push-notification-status-service.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('push-routes');
function createPushRoutes(options) {
    const { vapidManager, pushNotificationService, sessionMonitor } = options;
    const router = (0, express_1.Router)();
    /**
     * Get VAPID public key for client registration
     */
    router.get('/push/vapid-public-key', (_req, res) => {
        try {
            // Check if VAPID manager is properly initialized
            if (!vapidManager.isEnabled()) {
                return res.status(503).json({
                    error: 'Push notifications not configured',
                    message: 'VAPID keys not available or service not initialized',
                });
            }
            const publicKey = vapidManager.getPublicKey();
            if (!publicKey) {
                return res.status(503).json({
                    error: 'Push notifications not configured',
                    message: 'VAPID keys not available',
                });
            }
            res.json({
                publicKey,
                enabled: true,
            });
        }
        catch (error) {
            logger.error('Failed to get VAPID public key:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to retrieve VAPID public key',
            });
        }
    });
    /**
     * Subscribe to push notifications
     */
    router.post('/push/subscribe', async (req, res) => {
        if (!pushNotificationService) {
            return res.status(503).json({
                error: 'Push notifications not initialized',
                message: 'Push notification service is not available',
            });
        }
        try {
            const { endpoint, keys } = req.body;
            if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
                return res.status(400).json({
                    error: 'Invalid subscription data',
                    message: 'Missing required subscription fields',
                });
            }
            const subscriptionId = await pushNotificationService.addSubscription(endpoint, keys);
            res.json({
                success: true,
                subscriptionId,
                message: 'Successfully subscribed to push notifications',
            });
            logger.log(`Push subscription created: ${subscriptionId}`);
        }
        catch (error) {
            logger.error('Failed to create push subscription:', error);
            res.status(500).json({
                error: 'Subscription failed',
                message: 'Failed to create push subscription',
            });
        }
    });
    /**
     * Unsubscribe from push notifications
     */
    router.post('/push/unsubscribe', async (req, res) => {
        if (!pushNotificationService) {
            return res.status(503).json({
                error: 'Push notifications not initialized',
                message: 'Push notification service is not available',
            });
        }
        try {
            const { endpoint } = req.body;
            if (!endpoint) {
                return res.status(400).json({
                    error: 'Missing endpoint',
                    message: 'Endpoint is required for unsubscription',
                });
            }
            // For simplicity, we'll find and remove by endpoint
            const subscriptions = pushNotificationService.getSubscriptions();
            const subscription = subscriptions.find((sub) => sub.endpoint === endpoint);
            if (subscription) {
                await pushNotificationService.removeSubscription(subscription.id);
                logger.log(`Push subscription removed: ${subscription.id}`);
            }
            res.json({
                success: true,
                message: 'Successfully unsubscribed from push notifications',
            });
        }
        catch (error) {
            logger.error('Failed to remove push subscription:', error);
            res.status(500).json({
                error: 'Unsubscription failed',
                message: 'Failed to remove push subscription',
            });
        }
    });
    /**
     * Send test notification
     */
    router.post('/push/test', async (req, res) => {
        if (!pushNotificationService) {
            return res.status(503).json({
                error: 'Push notifications not initialized',
                message: 'Push notification service is not available',
            });
        }
        try {
            const { message } = req.body;
            const result = await pushNotificationService.sendNotification({
                type: 'test',
                title: '🔔 Test Notification',
                body: message || 'This is a test notification from VibeTunnel',
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
            });
            // Also emit through SSE if sessionMonitor is available
            if (sessionMonitor) {
                const testEvent = {
                    type: types_js_1.ServerEventType.TestNotification,
                    sessionId: 'test-session',
                    sessionName: 'Test Notification',
                    timestamp: new Date().toISOString(),
                    message: message || 'This is a test notification from VibeTunnel',
                    title: '🔔 Test Notification',
                    body: message || 'This is a test notification from VibeTunnel',
                };
                sessionMonitor.emit('notification', testEvent);
                logger.info('✅ Test notification also emitted through SSE');
            }
            res.json({
                success: result.success,
                sent: result.sent,
                failed: result.failed,
                errors: result.errors,
                message: `Test notification sent to ${result.sent} push subscribers${sessionMonitor ? ' and SSE listeners' : ''}`,
            });
            logger.log(`Test notification sent: ${result.sent} successful, ${result.failed} failed`);
        }
        catch (error) {
            logger.error('Failed to send test notification:', error);
            res.status(500).json({
                error: 'Test notification failed',
                message: 'Failed to send test notification',
            });
        }
    });
    /**
     * Get service status
     */
    router.get('/push/status', (_req, res) => {
        try {
            // Return disabled status if services are not available
            if (!pushNotificationService || !vapidManager.isEnabled()) {
                return res.json({
                    enabled: false,
                    configured: false,
                    hasVapidKeys: false,
                    totalSubscriptions: 0,
                    activeSubscriptions: 0,
                    errors: ['Push notification service not initialized or VAPID not configured'],
                });
            }
            const subscriptions = pushNotificationService.getSubscriptions();
            res.json({
                enabled: vapidManager.isEnabled(),
                configured: true,
                hasVapidKeys: !!vapidManager.getPublicKey(),
                totalSubscriptions: subscriptions.length,
                activeSubscriptions: subscriptions.filter((sub) => sub.isActive).length,
                status: new push_notification_status_service_js_1.PushNotificationStatusService(vapidManager, pushNotificationService).getStatus(),
            });
        }
        catch (error) {
            logger.error('Failed to get push status:', error);
            res.status(500).json({
                error: 'Status check failed',
                message: 'Failed to retrieve push notification status',
            });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVzaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL3B1c2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFnQkEsNENBZ09DO0FBaFBELHFDQUE4RDtBQUM5RCxvREFBd0Q7QUFFeEQseUdBQWdHO0FBRWhHLGtEQUFrRDtBQUdsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsYUFBYSxDQUFDLENBQUM7QUFRM0MsU0FBZ0IsZ0JBQWdCLENBQUMsT0FBZ0M7SUFDL0QsTUFBTSxFQUFFLFlBQVksRUFBRSx1QkFBdUIsRUFBRSxjQUFjLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDMUUsTUFBTSxNQUFNLEdBQUcsSUFBQSxnQkFBTSxHQUFFLENBQUM7SUFFeEI7O09BRUc7SUFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLHdCQUF3QixFQUFFLENBQUMsSUFBYSxFQUFFLEdBQWEsRUFBRSxFQUFFO1FBQ3BFLElBQUksQ0FBQztZQUNILGlEQUFpRDtZQUNqRCxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7Z0JBQzlCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLEtBQUssRUFBRSxtQ0FBbUM7b0JBQzFDLE9BQU8sRUFBRSxxREFBcUQ7aUJBQy9ELENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxNQUFNLFNBQVMsR0FBRyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFOUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNmLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQzFCLEtBQUssRUFBRSxtQ0FBbUM7b0JBQzFDLE9BQU8sRUFBRSwwQkFBMEI7aUJBQ3BDLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUNQLFNBQVM7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Z0JBQ2hCLFlBQVksRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRTtnQkFDM0Msa0JBQWtCLEVBQUUsYUFBYSxDQUFDLE1BQU07Z0JBQ3hDLG1CQUFtQixFQUFFLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNO2dCQUN2RSxNQUFNLEVBQUUsSUFBSSxtRUFBNkIsQ0FDdkMsWUFBWSxFQUNaLHVCQUF1QixDQUN4QixDQUFDLFNBQVMsRUFBRTthQUNkLENBQUMsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsRCxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHFCQUFxQjtnQkFDNUIsT0FBTyxFQUFFLDZDQUE2QzthQUN2RCxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdHlwZSBSZXF1ZXN0LCB0eXBlIFJlc3BvbnNlLCBSb3V0ZXIgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB7IFNlcnZlckV2ZW50VHlwZSB9IGZyb20gJy4uLy4uL3NoYXJlZC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvcHVzaC1ub3RpZmljYXRpb24tc2VydmljZS5qcyc7XG5pbXBvcnQgeyBQdXNoTm90aWZpY2F0aW9uU3RhdHVzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3B1c2gtbm90aWZpY2F0aW9uLXN0YXR1cy1zZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbk1vbml0b3IgfSBmcm9tICcuLi9zZXJ2aWNlcy9zZXNzaW9uLW1vbml0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgVmFwaWRNYW5hZ2VyIH0gZnJvbSAnLi4vdXRpbHMvdmFwaWQtbWFuYWdlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigncHVzaC1yb3V0ZXMnKTtcblxuZXhwb3J0IGludGVyZmFjZSBDcmVhdGVQdXNoUm91dGVzT3B0aW9ucyB7XG4gIHZhcGlkTWFuYWdlcjogVmFwaWRNYW5hZ2VyO1xuICBwdXNoTm90aWZpY2F0aW9uU2VydmljZTogUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfCBudWxsO1xuICBzZXNzaW9uTW9uaXRvcj86IFNlc3Npb25Nb25pdG9yO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUHVzaFJvdXRlcyhvcHRpb25zOiBDcmVhdGVQdXNoUm91dGVzT3B0aW9ucyk6IFJvdXRlciB7XG4gIGNvbnN0IHsgdmFwaWRNYW5hZ2VyLCBwdXNoTm90aWZpY2F0aW9uU2VydmljZSwgc2Vzc2lvbk1vbml0b3IgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuXG4gIC8qKlxuICAgKiBHZXQgVkFQSUQgcHVibGljIGtleSBmb3IgY2xpZW50IHJlZ2lzdHJhdGlvblxuICAgKi9cbiAgcm91dGVyLmdldCgnL3B1c2gvdmFwaWQtcHVibGljLWtleScsIChfcmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIENoZWNrIGlmIFZBUElEIG1hbmFnZXIgaXMgcHJvcGVybHkgaW5pdGlhbGl6ZWRcbiAgICAgIGlmICghdmFwaWRNYW5hZ2VyLmlzRW5hYmxlZCgpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDUwMykuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdQdXNoIG5vdGlmaWNhdGlvbnMgbm90IGNvbmZpZ3VyZWQnLFxuICAgICAgICAgIG1lc3NhZ2U6ICdWQVBJRCBrZXlzIG5vdCBhdmFpbGFibGUgb3Igc2VydmljZSBub3QgaW5pdGlhbGl6ZWQnLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcHVibGljS2V5ID0gdmFwaWRNYW5hZ2VyLmdldFB1YmxpY0tleSgpO1xuXG4gICAgICBpZiAoIXB1YmxpY0tleSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnUHVzaCBub3RpZmljYXRpb25zIG5vdCBjb25maWd1cmVkJyxcbiAgICAgICAgICBtZXNzYWdlOiAnVkFQSUQga2V5cyBub3QgYXZhaWxhYmxlJyxcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgcHVibGljS2V5LFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGdldCBWQVBJRCBwdWJsaWMga2V5OicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIHJldHJpZXZlIFZBUElEIHB1YmxpYyBrZXknLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogU3Vic2NyaWJlIHRvIHB1c2ggbm90aWZpY2F0aW9uc1xuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9wdXNoL3N1YnNjcmliZScsIGFzeW5jIChyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpID0+IHtcbiAgICBpZiAoIXB1c2hOb3RpZmljYXRpb25TZXJ2aWNlKSB7XG4gICAgICByZXR1cm4gcmVzLnN0YXR1cyg1MDMpLmpzb24oe1xuICAgICAgICBlcnJvcjogJ1B1c2ggbm90aWZpY2F0aW9ucyBub3QgaW5pdGlhbGl6ZWQnLFxuICAgICAgICBtZXNzYWdlOiAnUHVzaCBub3RpZmljYXRpb24gc2VydmljZSBpcyBub3QgYXZhaWxhYmxlJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IGVuZHBvaW50LCBrZXlzIH0gPSByZXEuYm9keTtcblxuICAgICAgaWYgKCFlbmRwb2ludCB8fCAha2V5cyB8fCAha2V5cy5wMjU2ZGggfHwgIWtleXMuYXV0aCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oe1xuICAgICAgICAgIGVycm9yOiAnSW52YWxpZCBzdWJzY3JpcHRpb24gZGF0YScsXG4gICAgICAgICAgbWVzc2FnZTogJ01pc3NpbmcgcmVxdWlyZWQgc3Vic2NyaXB0aW9uIGZpZWxkcycsXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JZCA9IGF3YWl0IHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlLmFkZFN1YnNjcmlwdGlvbihlbmRwb2ludCwga2V5cyk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uSWQsXG4gICAgICAgIG1lc3NhZ2U6ICdTdWNjZXNzZnVsbHkgc3Vic2NyaWJlZCB0byBwdXNoIG5vdGlmaWNhdGlvbnMnLFxuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5sb2coYFB1c2ggc3Vic2NyaXB0aW9uIGNyZWF0ZWQ6ICR7c3Vic2NyaXB0aW9uSWR9YCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBwdXNoIHN1YnNjcmlwdGlvbjonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnU3Vic2NyaXB0aW9uIGZhaWxlZCcsXG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gY3JlYXRlIHB1c2ggc3Vic2NyaXB0aW9uJyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIFVuc3Vic2NyaWJlIGZyb20gcHVzaCBub3RpZmljYXRpb25zXG4gICAqL1xuICByb3V0ZXIucG9zdCgnL3B1c2gvdW5zdWJzY3JpYmUnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgaWYgKCFwdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdQdXNoIG5vdGlmaWNhdGlvbnMgbm90IGluaXRpYWxpemVkJyxcbiAgICAgICAgbWVzc2FnZTogJ1B1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2UgaXMgbm90IGF2YWlsYWJsZScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBlbmRwb2ludCB9ID0gcmVxLmJvZHk7XG5cbiAgICAgIGlmICghZW5kcG9pbnQpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ01pc3NpbmcgZW5kcG9pbnQnLFxuICAgICAgICAgIG1lc3NhZ2U6ICdFbmRwb2ludCBpcyByZXF1aXJlZCBmb3IgdW5zdWJzY3JpcHRpb24nLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlJ2xsIGZpbmQgYW5kIHJlbW92ZSBieSBlbmRwb2ludFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlLmdldFN1YnNjcmlwdGlvbnMoKTtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbnMuZmluZCgoc3ViKSA9PiBzdWIuZW5kcG9pbnQgPT09IGVuZHBvaW50KTtcblxuICAgICAgaWYgKHN1YnNjcmlwdGlvbikge1xuICAgICAgICBhd2FpdCBwdXNoTm90aWZpY2F0aW9uU2VydmljZS5yZW1vdmVTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uLmlkKTtcbiAgICAgICAgbG9nZ2VyLmxvZyhgUHVzaCBzdWJzY3JpcHRpb24gcmVtb3ZlZDogJHtzdWJzY3JpcHRpb24uaWR9YCk7XG4gICAgICB9XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogJ1N1Y2Nlc3NmdWxseSB1bnN1YnNjcmliZWQgZnJvbSBwdXNoIG5vdGlmaWNhdGlvbnMnLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHJlbW92ZSBwdXNoIHN1YnNjcmlwdGlvbjonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7XG4gICAgICAgIGVycm9yOiAnVW5zdWJzY3JpcHRpb24gZmFpbGVkJyxcbiAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byByZW1vdmUgcHVzaCBzdWJzY3JpcHRpb24nLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogU2VuZCB0ZXN0IG5vdGlmaWNhdGlvblxuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9wdXNoL3Rlc3QnLCBhc3luYyAocmVxOiBSZXF1ZXN0LCByZXM6IFJlc3BvbnNlKSA9PiB7XG4gICAgaWYgKCFwdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNTAzKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdQdXNoIG5vdGlmaWNhdGlvbnMgbm90IGluaXRpYWxpemVkJyxcbiAgICAgICAgbWVzc2FnZTogJ1B1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2UgaXMgbm90IGF2YWlsYWJsZScsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBtZXNzYWdlIH0gPSByZXEuYm9keTtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2Uuc2VuZE5vdGlmaWNhdGlvbih7XG4gICAgICAgIHR5cGU6ICd0ZXN0JyxcbiAgICAgICAgdGl0bGU6ICfwn5SUIFRlc3QgTm90aWZpY2F0aW9uJyxcbiAgICAgICAgYm9keTogbWVzc2FnZSB8fCAnVGhpcyBpcyBhIHRlc3Qgbm90aWZpY2F0aW9uIGZyb20gVmliZVR1bm5lbCcsXG4gICAgICAgIGljb246ICcvYXBwbGUtdG91Y2gtaWNvbi5wbmcnLFxuICAgICAgICBiYWRnZTogJy9mYXZpY29uLTMyLnBuZycsXG4gICAgICAgIHRhZzogJ3ZpYmV0dW5uZWwtdGVzdCcsXG4gICAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBhY3Rpb246ICdkaXNtaXNzJyxcbiAgICAgICAgICAgIHRpdGxlOiAnRGlzbWlzcycsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBbHNvIGVtaXQgdGhyb3VnaCBTU0UgaWYgc2Vzc2lvbk1vbml0b3IgaXMgYXZhaWxhYmxlXG4gICAgICBpZiAoc2Vzc2lvbk1vbml0b3IpIHtcbiAgICAgICAgY29uc3QgdGVzdEV2ZW50ID0ge1xuICAgICAgICAgIHR5cGU6IFNlcnZlckV2ZW50VHlwZS5UZXN0Tm90aWZpY2F0aW9uLFxuICAgICAgICAgIHNlc3Npb25JZDogJ3Rlc3Qtc2Vzc2lvbicsXG4gICAgICAgICAgc2Vzc2lvbk5hbWU6ICdUZXN0IE5vdGlmaWNhdGlvbicsXG4gICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgbWVzc2FnZTogbWVzc2FnZSB8fCAnVGhpcyBpcyBhIHRlc3Qgbm90aWZpY2F0aW9uIGZyb20gVmliZVR1bm5lbCcsXG4gICAgICAgICAgdGl0bGU6ICfwn5SUIFRlc3QgTm90aWZpY2F0aW9uJyxcbiAgICAgICAgICBib2R5OiBtZXNzYWdlIHx8ICdUaGlzIGlzIGEgdGVzdCBub3RpZmljYXRpb24gZnJvbSBWaWJlVHVubmVsJyxcbiAgICAgICAgfTtcbiAgICAgICAgc2Vzc2lvbk1vbml0b3IuZW1pdCgnbm90aWZpY2F0aW9uJywgdGVzdEV2ZW50KTtcbiAgICAgICAgbG9nZ2VyLmluZm8oJ+KchSBUZXN0IG5vdGlmaWNhdGlvbiBhbHNvIGVtaXR0ZWQgdGhyb3VnaCBTU0UnKTtcbiAgICAgIH1cblxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdWNjZXNzOiByZXN1bHQuc3VjY2VzcyxcbiAgICAgICAgc2VudDogcmVzdWx0LnNlbnQsXG4gICAgICAgIGZhaWxlZDogcmVzdWx0LmZhaWxlZCxcbiAgICAgICAgZXJyb3JzOiByZXN1bHQuZXJyb3JzLFxuICAgICAgICBtZXNzYWdlOiBgVGVzdCBub3RpZmljYXRpb24gc2VudCB0byAke3Jlc3VsdC5zZW50fSBwdXNoIHN1YnNjcmliZXJzJHtzZXNzaW9uTW9uaXRvciA/ICcgYW5kIFNTRSBsaXN0ZW5lcnMnIDogJyd9YCxcbiAgICAgIH0pO1xuXG4gICAgICBsb2dnZXIubG9nKGBUZXN0IG5vdGlmaWNhdGlvbiBzZW50OiAke3Jlc3VsdC5zZW50fSBzdWNjZXNzZnVsLCAke3Jlc3VsdC5mYWlsZWR9IGZhaWxlZGApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHRlc3Qgbm90aWZpY2F0aW9uOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHtcbiAgICAgICAgZXJyb3I6ICdUZXN0IG5vdGlmaWNhdGlvbiBmYWlsZWQnLFxuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIHNlbmQgdGVzdCBub3RpZmljYXRpb24nLFxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogR2V0IHNlcnZpY2Ugc3RhdHVzXG4gICAqL1xuICByb3V0ZXIuZ2V0KCcvcHVzaC9zdGF0dXMnLCAoX3JlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAvLyBSZXR1cm4gZGlzYWJsZWQgc3RhdHVzIGlmIHNlcnZpY2VzIGFyZSBub3QgYXZhaWxhYmxlXG4gICAgICBpZiAoIXB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIHx8ICF2YXBpZE1hbmFnZXIuaXNFbmFibGVkKCkpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5qc29uKHtcbiAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICBjb25maWd1cmVkOiBmYWxzZSxcbiAgICAgICAgICBoYXNWYXBpZEtleXM6IGZhbHNlLFxuICAgICAgICAgIHRvdGFsU3Vic2NyaXB0aW9uczogMCxcbiAgICAgICAgICBhY3RpdmVTdWJzY3JpcHRpb25zOiAwLFxuICAgICAgICAgIGVycm9yczogWydQdXNoIG5vdGlmaWNhdGlvbiBzZXJ2aWNlIG5vdCBpbml0aWFsaXplZCBvciBWQVBJRCBub3QgY29uZmlndXJlZCddLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlLmdldFN1YnNjcmlwdGlvbnMoKTtcblxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBlbmFibGVkOiB2YXBpZE1hbmFnZXIuaXNFbmFibGVkKCksXG4gICAgICAgIGNvbmZpZ3VyZWQ6IHRydWUsXG4gICAgICAgIGhhc1ZhcGlkS2V5czogISF2YXBpZE1hbmFnZXIuZ2V0UHVibGljS2V5KCksXG4gICAgICAgIHRvdGFsU3Vic2NyaXB0aW9uczogc3Vic2NyaXB0aW9ucy5sZW5ndGgsXG4gICAgICAgIGFjdGl2ZVN1YnNjcmlwdGlvbnM6IHN1YnNjcmlwdGlvbnMuZmlsdGVyKChzdWIpID0+IHN1Yi5pc0FjdGl2ZSkubGVuZ3RoLFxuICAgICAgICBzdGF0dXM6IG5ldyBQdXNoTm90aWZpY2F0aW9uU3RhdHVzU2VydmljZShcbiAgICAgICAgICB2YXBpZE1hbmFnZXIsXG4gICAgICAgICAgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2VcbiAgICAgICAgKS5nZXRTdGF0dXMoKSxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBnZXQgcHVzaCBzdGF0dXM6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oe1xuICAgICAgICBlcnJvcjogJ1N0YXR1cyBjaGVjayBmYWlsZWQnLFxuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIHJldHJpZXZlIHB1c2ggbm90aWZpY2F0aW9uIHN0YXR1cycsXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIHJldHVybiByb3V0ZXI7XG59XG4iXX0=