"use strict";
/**
 * BellEventHandler - Ultra-simple bell event handler
 *
 * This simplified handler just sends notifications for bell events
 * without any filtering, correlation, or user tracking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BellEventHandler = void 0;
const logger_js_1 = require("../utils/logger.js");
const process_tree_analyzer_js_1 = require("./process-tree-analyzer.js");
const logger = (0, logger_js_1.createLogger)('bell-event-handler');
/**
 * Ultra-simple bell event handler
 */
class BellEventHandler {
    constructor() {
        this.pushNotificationService = null;
        logger.debug('BellEventHandler initialized');
    }
    /**
     * Set the push notification service for sending notifications
     */
    setPushNotificationService(service) {
        this.pushNotificationService = service;
        logger.debug('Push notification service configured');
    }
    /**
     * Process a bell event - ultra-simple version
     */
    async processBellEvent(context) {
        try {
            logger.debug('Processing bell event', {
                sessionId: context.sessionInfo.id,
                timestamp: context.timestamp.toISOString(),
            });
            // Always send notification - no filtering
            if (this.pushNotificationService) {
                const payload = this.createNotificationPayload(context);
                await this.sendPushNotification(payload);
            }
            logger.debug('Bell event processed successfully', {
                sessionId: context.sessionInfo.id,
            });
        }
        catch (error) {
            logger.error('Error processing bell event', {
                sessionId: context.sessionInfo.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Create enhanced notification payload with process information
     */
    createNotificationPayload(context) {
        const sessionName = context.sessionInfo.name || 'Terminal Session';
        // Extract process information if available
        const processName = context.suspectedSource
            ? process_tree_analyzer_js_1.ProcessTreeAnalyzer.extractProcessName(context.suspectedSource.command)
            : null;
        const processDescription = process_tree_analyzer_js_1.ProcessTreeAnalyzer.getProcessDescription(context.suspectedSource || null);
        // Create title and body with process information
        const title = '🔔 Terminal Activity';
        const body = processName && processName !== 'shell'
            ? `${processDescription} in ${sessionName} triggered a bell`
            : `${sessionName} triggered a bell`;
        const tag = `vibetunnel-bell-${context.sessionInfo.id}`;
        return {
            type: 'bell-event',
            sessionId: context.sessionInfo.id,
            sessionName,
            title,
            body,
            icon: '/apple-touch-icon.png',
            badge: '/favicon-32.png',
            tag,
            requireInteraction: false,
            actions: [
                {
                    action: 'view-session',
                    title: 'View Session',
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss',
                },
            ],
            data: {
                sessionId: context.sessionInfo.id,
                timestamp: context.timestamp.toISOString(),
                processName: processName || undefined,
                processCommand: context.suspectedSource?.command || undefined,
                processPid: context.suspectedSource?.pid || undefined,
            },
        };
    }
    /**
     * Send push notification
     */
    async sendPushNotification(payload) {
        if (!this.pushNotificationService) {
            logger.debug('No push notification service configured');
            return;
        }
        try {
            await this.pushNotificationService.sendBellNotification(payload);
            logger.debug('Push notification sent', {
                sessionId: payload.sessionId,
                title: payload.title,
            });
        }
        catch (error) {
            logger.error('Failed to send push notification', {
                sessionId: payload.sessionId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    /**
     * Clean up resources
     */
    dispose() {
        logger.debug('BellEventHandler disposed');
    }
}
exports.BellEventHandler = BellEventHandler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmVsbC1ldmVudC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9iZWxsLWV2ZW50LWhhbmRsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7OztHQUtHOzs7QUFHSCxrREFBa0Q7QUFDbEQseUVBSW9DO0FBR3BDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBdUNsRDs7R0FFRztBQUNILE1BQWEsZ0JBQWdCO0lBRzNCO1FBRlEsNEJBQXVCLEdBQW1DLElBQUksQ0FBQztRQUdyRSxNQUFNLENBQUMsS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVEOztPQUVHO0lBQ0gsMEJBQTBCLENBQUMsT0FBZ0M7UUFDekQsSUFBSSxDQUFDLHVCQUF1QixHQUFHLE9BQU8sQ0FBQztRQUN2QyxNQUFNLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQXlCO1FBQzlDLElBQUksQ0FBQztZQUNILE1BQU0sQ0FBQyxLQUFLLENBQUMsdUJBQXVCLEVBQUU7Z0JBQ3BDLFNBQVMsRUFBRSxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUU7Z0JBQ2pDLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRTthQUMzQyxDQUFDLENBQUM7WUFFSCwwQ0FBMEM7WUFDMUMsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDakMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN4RCxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMzQyxDQUFDO1lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsRUFBRTtnQkFD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T0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUU7Z0JBQy9DLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUztnQkFDNUIsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7YUFDOUQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNILENBQUM7SUFFRDs7T0FFRztJQUNILE9BQU87UUFDTCxNQUFNLENBQUMsS0FBSyxDQUFDLDJCQUEyQixDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUNGO0FBM0hELDRDQTJIQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQmVsbEV2ZW50SGFuZGxlciAtIFVsdHJhLXNpbXBsZSBiZWxsIGV2ZW50IGhhbmRsZXJcbiAqXG4gKiBUaGlzIHNpbXBsaWZpZWQgaGFuZGxlciBqdXN0IHNlbmRzIG5vdGlmaWNhdGlvbnMgZm9yIGJlbGwgZXZlbnRzXG4gKiB3aXRob3V0IGFueSBmaWx0ZXJpbmcsIGNvcnJlbGF0aW9uLCBvciB1c2VyIHRyYWNraW5nLlxuICovXG5cbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkluZm8gfSBmcm9tICcuLi8uLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcbmltcG9ydCB7XG4gIHR5cGUgUHJvY2Vzc0luZm8sXG4gIHR5cGUgUHJvY2Vzc1NuYXBzaG90LFxuICBQcm9jZXNzVHJlZUFuYWx5emVyLFxufSBmcm9tICcuL3Byb2Nlc3MtdHJlZS1hbmFseXplci5qcyc7XG5pbXBvcnQgdHlwZSB7IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9wdXNoLW5vdGlmaWNhdGlvbi1zZXJ2aWNlLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdiZWxsLWV2ZW50LWhhbmRsZXInKTtcblxuLyoqXG4gKiBFbmhhbmNlZCBiZWxsIGV2ZW50IGNvbnRleHQgd2l0aCBwcm9jZXNzIGluZm9ybWF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmVsbEV2ZW50Q29udGV4dCB7XG4gIHNlc3Npb25JbmZvOiBTZXNzaW9uSW5mbztcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBiZWxsQ291bnQ/OiBudW1iZXI7XG4gIHByb2Nlc3NTbmFwc2hvdD86IFByb2Nlc3NTbmFwc2hvdDtcbiAgc3VzcGVjdGVkU291cmNlPzogUHJvY2Vzc0luZm8gfCBudWxsO1xufVxuXG4vKipcbiAqIFNpbXBsZSBiZWxsIG5vdGlmaWNhdGlvbiBwYXlsb2FkXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQmVsbE5vdGlmaWNhdGlvblBheWxvYWQge1xuICB0eXBlOiAnYmVsbC1ldmVudCc7XG4gIHNlc3Npb25JZDogc3RyaW5nO1xuICBzZXNzaW9uTmFtZTogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGljb24/OiBzdHJpbmc7XG4gIGJhZGdlPzogc3RyaW5nO1xuICB0YWc6IHN0cmluZztcbiAgcmVxdWlyZUludGVyYWN0aW9uOiBib29sZWFuO1xuICBhY3Rpb25zPzogQXJyYXk8e1xuICAgIGFjdGlvbjogc3RyaW5nO1xuICAgIHRpdGxlOiBzdHJpbmc7XG4gIH0+O1xuICBkYXRhOiB7XG4gICAgc2Vzc2lvbklkOiBzdHJpbmc7XG4gICAgdGltZXN0YW1wOiBzdHJpbmc7XG4gICAgcHJvY2Vzc05hbWU/OiBzdHJpbmc7XG4gICAgcHJvY2Vzc0NvbW1hbmQ/OiBzdHJpbmc7XG4gICAgcHJvY2Vzc1BpZD86IG51bWJlcjtcbiAgfTtcbn1cblxuLyoqXG4gKiBVbHRyYS1zaW1wbGUgYmVsbCBldmVudCBoYW5kbGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBCZWxsRXZlbnRIYW5kbGVyIHtcbiAgcHJpdmF0ZSBwdXNoTm90aWZpY2F0aW9uU2VydmljZTogUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfCBudWxsID0gbnVsbDtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBsb2dnZXIuZGVidWcoJ0JlbGxFdmVudEhhbmRsZXIgaW5pdGlhbGl6ZWQnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIHB1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2UgZm9yIHNlbmRpbmcgbm90aWZpY2F0aW9uc1xuICAgKi9cbiAgc2V0UHVzaE5vdGlmaWNhdGlvblNlcnZpY2Uoc2VydmljZTogUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UpOiB2b2lkIHtcbiAgICB0aGlzLnB1c2hOb3RpZmljYXRpb25TZXJ2aWNlID0gc2VydmljZTtcbiAgICBsb2dnZXIuZGVidWcoJ1B1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2UgY29uZmlndXJlZCcpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgYSBiZWxsIGV2ZW50IC0gdWx0cmEtc2ltcGxlIHZlcnNpb25cbiAgICovXG4gIGFzeW5jIHByb2Nlc3NCZWxsRXZlbnQoY29udGV4dDogQmVsbEV2ZW50Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICBsb2dnZXIuZGVidWcoJ1Byb2Nlc3NpbmcgYmVsbCBldmVudCcsIHtcbiAgICAgICAgc2Vzc2lvbklkOiBjb250ZXh0LnNlc3Npb25JbmZvLmlkLFxuICAgICAgICB0aW1lc3RhbXA6IGNvbnRleHQudGltZXN0YW1wLnRvSVNPU3RyaW5nKCksXG4gICAgICB9KTtcblxuICAgICAgLy8gQWx3YXlzIHNlbmQgbm90aWZpY2F0aW9uIC0gbm8gZmlsdGVyaW5nXG4gICAgICBpZiAodGhpcy5wdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gdGhpcy5jcmVhdGVOb3RpZmljYXRpb25QYXlsb2FkKGNvbnRleHQpO1xuICAgICAgICBhd2FpdCB0aGlzLnNlbmRQdXNoTm90aWZpY2F0aW9uKHBheWxvYWQpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuZGVidWcoJ0JlbGwgZXZlbnQgcHJvY2Vzc2VkIHN1Y2Nlc3NmdWxseScsIHtcbiAgICAgICAgc2Vzc2lvbklkOiBjb250ZXh0LnNlc3Npb25JbmZvLmlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBiZWxsIGV2ZW50Jywge1xuICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuc2Vzc2lvbkluZm8uaWQsXG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGVuaGFuY2VkIG5vdGlmaWNhdGlvbiBwYXlsb2FkIHdpdGggcHJvY2VzcyBpbmZvcm1hdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBjcmVhdGVOb3RpZmljYXRpb25QYXlsb2FkKGNvbnRleHQ6IEJlbGxFdmVudENvbnRleHQpOiBCZWxsTm90aWZpY2F0aW9uUGF5bG9hZCB7XG4gICAgY29uc3Qgc2Vzc2lvbk5hbWUgPSBjb250ZXh0LnNlc3Npb25JbmZvLm5hbWUgfHwgJ1Rlcm1pbmFsIFNlc3Npb24nO1xuXG4gICAgLy8gRXh0cmFjdCBwcm9jZXNzIGluZm9ybWF0aW9uIGlmIGF2YWlsYWJsZVxuICAgIGNvbnN0IHByb2Nlc3NOYW1lID0gY29udGV4dC5zdXNwZWN0ZWRTb3VyY2VcbiAgICAgID8gUHJvY2Vzc1RyZWVBbmFseXplci5leHRyYWN0UHJvY2Vzc05hbWUoY29udGV4dC5zdXNwZWN0ZWRTb3VyY2UuY29tbWFuZClcbiAgICAgIDogbnVsbDtcbiAgICBjb25zdCBwcm9jZXNzRGVzY3JpcHRpb24gPSBQcm9jZXNzVHJlZUFuYWx5emVyLmdldFByb2Nlc3NEZXNjcmlwdGlvbihcbiAgICAgIGNvbnRleHQuc3VzcGVjdGVkU291cmNlIHx8IG51bGxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIHRpdGxlIGFuZCBib2R5IHdpdGggcHJvY2VzcyBpbmZvcm1hdGlvblxuICAgIGNvbnN0IHRpdGxlID0gJ/CflJQgVGVybWluYWwgQWN0aXZpdHknO1xuICAgIGNvbnN0IGJvZHkgPVxuICAgICAgcHJvY2Vzc05hbWUgJiYgcHJvY2Vzc05hbWUgIT09ICdzaGVsbCdcbiAgICAgICAgPyBgJHtwcm9jZXNzRGVzY3JpcHRpb259IGluICR7c2Vzc2lvbk5hbWV9IHRyaWdnZXJlZCBhIGJlbGxgXG4gICAgICAgIDogYCR7c2Vzc2lvbk5hbWV9IHRyaWdnZXJlZCBhIGJlbGxgO1xuICAgIGNvbnN0IHRhZyA9IGB2aWJldHVubmVsLWJlbGwtJHtjb250ZXh0LnNlc3Npb25JbmZvLmlkfWA7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ2JlbGwtZXZlbnQnLFxuICAgICAgc2Vzc2lvbklkOiBjb250ZXh0LnNlc3Npb25JbmZvLmlkLFxuICAgICAgc2Vzc2lvbk5hbWUsXG4gICAgICB0aXRsZSxcbiAgICAgIGJvZHksXG4gICAgICBpY29uOiAnL2FwcGxlLXRvdWNoLWljb24ucG5nJyxcbiAgICAgIGJhZGdlOiAnL2Zhdmljb24tMzIucG5nJyxcbiAgICAgIHRhZyxcbiAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhY3Rpb246ICd2aWV3LXNlc3Npb24nLFxuICAgICAgICAgIHRpdGxlOiAnVmlldyBTZXNzaW9uJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGFjdGlvbjogJ2Rpc21pc3MnLFxuICAgICAgICAgIHRpdGxlOiAnRGlzbWlzcycsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgZGF0YToge1xuICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuc2Vzc2lvbkluZm8uaWQsXG4gICAgICAgIHRpbWVzdGFtcDogY29udGV4dC50aW1lc3RhbXAudG9JU09TdHJpbmcoKSxcbiAgICAgICAgcHJvY2Vzc05hbWU6IHByb2Nlc3NOYW1lIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJvY2Vzc0NvbW1hbmQ6IGNvbnRleHQuc3VzcGVjdGVkU291cmNlPy5jb21tYW5kIHx8IHVuZGVmaW5lZCxcbiAgICAgICAgcHJvY2Vzc1BpZDogY29udGV4dC5zdXNwZWN0ZWRTb3VyY2U/LnBpZCB8fCB1bmRlZmluZWQsXG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBwdXNoIG5vdGlmaWNhdGlvblxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzZW5kUHVzaE5vdGlmaWNhdGlvbihwYXlsb2FkOiBCZWxsTm90aWZpY2F0aW9uUGF5bG9hZCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5wdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdObyBwdXNoIG5vdGlmaWNhdGlvbiBzZXJ2aWNlIGNvbmZpZ3VyZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5wdXNoTm90aWZpY2F0aW9uU2VydmljZS5zZW5kQmVsbE5vdGlmaWNhdGlvbihwYXlsb2FkKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnUHVzaCBub3RpZmljYXRpb24gc2VudCcsIHtcbiAgICAgICAgc2Vzc2lvbklkOiBwYXlsb2FkLnNlc3Npb25JZCxcbiAgICAgICAgdGl0bGU6IHBheWxvYWQudGl0bGUsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2VuZCBwdXNoIG5vdGlmaWNhdGlvbicsIHtcbiAgICAgICAgc2Vzc2lvbklkOiBwYXlsb2FkLnNlc3Npb25JZCxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCByZXNvdXJjZXNcbiAgICovXG4gIGRpc3Bvc2UoKTogdm9pZCB7XG4gICAgbG9nZ2VyLmRlYnVnKCdCZWxsRXZlbnRIYW5kbGVyIGRpc3Bvc2VkJyk7XG4gIH1cbn1cbiJdfQ==