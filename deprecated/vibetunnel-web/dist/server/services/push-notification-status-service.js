"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushNotificationStatusService = void 0;
class PushNotificationStatusService {
    constructor(vapidManager, pushNotificationService) {
        this.vapidManager = vapidManager;
        this.pushNotificationService = pushNotificationService;
    }
    getStatus() {
        if (!this.pushNotificationService) {
            return {
                enabled: false,
                configured: false,
                subscriptions: 0,
                error: 'Push notification service not initialized',
            };
        }
        const subscriptions = this.pushNotificationService.getSubscriptions();
        return {
            enabled: this.vapidManager.isEnabled(),
            configured: !!this.vapidManager.getPublicKey(),
            subscriptions: subscriptions.length,
        };
    }
}
exports.PushNotificationStatusService = PushNotificationStatusService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVzaC1ub3RpZmljYXRpb24tc3RhdHVzLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3B1c2gtbm90aWZpY2F0aW9uLXN0YXR1cy1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUdBLE1BQWEsNkJBQTZCO0lBQ3hDLFlBQ1UsWUFBMEIsRUFDMUIsdUJBQXVEO1FBRHZELGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQzFCLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBZ0M7SUFDOUQsQ0FBQztJQUVKLFNBQVM7UUFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDbEMsT0FBTztnQkFDTCxPQUFPLEVBQUUsS0FBSztnQkFDZCxVQUFVLEVBQUUsS0FBSztnQkFDakIsYUFBYSxFQUFFLENBQUM7Z0JBQ2hCLEtBQUssRUFBRSwyQ0FBMkM7YUFDbkQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUV0RSxPQUFPO1lBQ0wsT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFO1lBQ3RDLFVBQVUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUU7WUFDOUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxNQUFNO1NBQ3BDLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUF4QkQsc0VBd0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBWYXBpZE1hbmFnZXIgfSBmcm9tICcuLi91dGlscy92YXBpZC1tYW5hZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuL3B1c2gtbm90aWZpY2F0aW9uLXNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgUHVzaE5vdGlmaWNhdGlvblN0YXR1c1NlcnZpY2Uge1xuICBjb25zdHJ1Y3RvcihcbiAgICBwcml2YXRlIHZhcGlkTWFuYWdlcjogVmFwaWRNYW5hZ2VyLFxuICAgIHByaXZhdGUgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2U6IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIHwgbnVsbFxuICApIHt9XG5cbiAgZ2V0U3RhdHVzKCkge1xuICAgIGlmICghdGhpcy5wdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgIGNvbmZpZ3VyZWQ6IGZhbHNlLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiAwLFxuICAgICAgICBlcnJvcjogJ1B1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2Ugbm90IGluaXRpYWxpemVkJyxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IHRoaXMucHVzaE5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0U3Vic2NyaXB0aW9ucygpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVuYWJsZWQ6IHRoaXMudmFwaWRNYW5hZ2VyLmlzRW5hYmxlZCgpLFxuICAgICAgY29uZmlndXJlZDogISF0aGlzLnZhcGlkTWFuYWdlci5nZXRQdWJsaWNLZXkoKSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHN1YnNjcmlwdGlvbnMubGVuZ3RoLFxuICAgIH07XG4gIH1cbn1cbiJdfQ==