"use strict";
/**
 * PushNotificationService - Simplified push notification system
 *
 * This simplified service provides:
 * - Basic subscription storage
 * - Simple notification sending without user tracking or preferences
 */
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
exports.PushNotificationService = void 0;
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('push-notification-service');
/**
 * Simplified push notification service
 */
class PushNotificationService {
    constructor(vapidManager) {
        this.subscriptions = new Map();
        this.initialized = false;
        this.vapidManager = vapidManager;
        const storageDir = path.join(os.homedir(), '.vibetunnel/notifications');
        this.subscriptionsFile = path.join(storageDir, 'subscriptions.json');
    }
    /**
     * Initialize the service
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        try {
            // Ensure storage directory exists
            await fs.mkdir(path.dirname(this.subscriptionsFile), { recursive: true });
            // Load existing subscriptions
            await this.loadSubscriptions();
            this.initialized = true;
            logger.log('PushNotificationService initialized');
        }
        catch (error) {
            logger.error('Failed to initialize PushNotificationService:', error);
            throw error;
        }
    }
    /**
     * Add a new subscription
     */
    async addSubscription(endpoint, keys) {
        const subscriptionId = this.generateSubscriptionId(endpoint, keys);
        const subscription = {
            id: subscriptionId,
            endpoint,
            keys,
            subscribedAt: new Date().toISOString(),
            isActive: true,
        };
        this.subscriptions.set(subscriptionId, subscription);
        await this.saveSubscriptions();
        logger.log(`New subscription added: ${subscriptionId}`);
        return subscriptionId;
    }
    /**
     * Remove a subscription
     */
    async removeSubscription(subscriptionId) {
        const existed = this.subscriptions.delete(subscriptionId);
        if (existed) {
            await this.saveSubscriptions();
            logger.log(`Subscription removed: ${subscriptionId}`);
        }
        return existed;
    }
    /**
     * Get all active subscriptions
     */
    getSubscriptions() {
        return Array.from(this.subscriptions.values()).filter((sub) => sub.isActive);
    }
    /**
     * Send notification to all subscriptions
     */
    async sendNotification(payload) {
        if (!this.vapidManager.isEnabled()) {
            throw new Error('VAPID not properly configured');
        }
        const activeSubscriptions = this.getSubscriptions();
        if (activeSubscriptions.length === 0) {
            return {
                success: true,
                sent: 0,
                failed: 0,
                errors: [],
            };
        }
        let successful = 0;
        let failed = 0;
        const errors = [];
        const webPushPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/apple-touch-icon.png',
            badge: payload.badge || '/favicon-32.png',
            tag: payload.tag || `vibetunnel-${payload.type}`,
            requireInteraction: payload.requireInteraction || false,
            actions: payload.actions || [],
            data: {
                type: payload.type,
                timestamp: new Date().toISOString(),
                ...payload.data,
            },
        });
        // Send to all subscriptions
        for (const subscription of activeSubscriptions) {
            try {
                const webpushSubscription = {
                    endpoint: subscription.endpoint,
                    keys: subscription.keys,
                };
                await this.vapidManager.sendNotification(webpushSubscription, webPushPayload);
                successful++;
                logger.debug(`Notification sent to: ${subscription.id}`);
            }
            catch (error) {
                failed++;
                const errorMsg = `Failed to send to ${subscription.id}: ${error}`;
                errors.push(errorMsg);
                logger.warn(errorMsg);
                // Remove expired/invalid subscriptions
                const shouldRemove = this.shouldRemoveSubscription(error);
                if (shouldRemove) {
                    this.subscriptions.delete(subscription.id);
                    const webPushError = error;
                    logger.log(`Removed expired subscription: ${subscription.id} (status: ${webPushError.statusCode})`);
                }
                else {
                    // Debug log for unhandled errors
                    const webPushError = error;
                    logger.debug(`Not removing subscription ${subscription.id}, error: ${error instanceof Error ? error.message : String(error)}, statusCode: ${webPushError.statusCode}`);
                }
            }
        }
        // Save updated subscriptions
        await this.saveSubscriptions();
        logger.log(`Notification sent: ${successful} successful, ${failed} failed`, {
            type: payload.type,
            title: payload.title,
        });
        return {
            success: true,
            sent: successful,
            failed,
            errors,
        };
    }
    /**
     * Send bell notification
     */
    async sendBellNotification(bellPayload) {
        const payload = {
            type: 'bell',
            title: bellPayload.title,
            body: bellPayload.body,
            icon: bellPayload.icon,
            badge: bellPayload.badge,
            tag: bellPayload.tag,
            requireInteraction: bellPayload.requireInteraction,
            actions: bellPayload.actions,
            data: bellPayload.data,
        };
        return await this.sendNotification(payload);
    }
    /**
     * Determine if a subscription should be removed based on the error
     */
    shouldRemoveSubscription(error) {
        if (!(error instanceof Error)) {
            return false;
        }
        // Check for HTTP 410 Gone status (subscription expired)
        // WebPushError has a statusCode property
        const webPushError = error;
        if (webPushError.statusCode === 410) {
            return true;
        }
        // Also check message content for other error formats
        if (error.message.includes('410') || error.message.includes('Gone')) {
            return true;
        }
        // Check for other expired/invalid subscription indicators
        const errorMessage = error.message.toLowerCase();
        return (errorMessage.includes('invalid') ||
            errorMessage.includes('expired') ||
            errorMessage.includes('no such subscription') ||
            errorMessage.includes('unsubscribed'));
    }
    /**
     * Clean up inactive subscriptions
     */
    async cleanupInactiveSubscriptions() {
        const beforeCount = this.subscriptions.size;
        // Remove all inactive subscriptions
        const activeSubscriptions = Array.from(this.subscriptions.values()).filter((subscription) => subscription.isActive);
        this.subscriptions.clear();
        for (const subscription of activeSubscriptions) {
            this.subscriptions.set(subscription.id, subscription);
        }
        const removedCount = beforeCount - this.subscriptions.size;
        if (removedCount > 0) {
            await this.saveSubscriptions();
            logger.log(`Cleaned up ${removedCount} inactive subscriptions`);
        }
        return removedCount;
    }
    /**
     * Load subscriptions from file
     */
    async loadSubscriptions() {
        try {
            const data = await fs.readFile(this.subscriptionsFile, 'utf8');
            const subscriptions = JSON.parse(data);
            this.subscriptions.clear();
            for (const subscription of subscriptions) {
                this.subscriptions.set(subscription.id, subscription);
            }
            logger.debug(`Loaded ${subscriptions.length} subscriptions`);
        }
        catch (error) {
            const fsError = error;
            if (fsError.code === 'ENOENT') {
                logger.debug('No existing subscriptions file found');
            }
            else {
                logger.error('Failed to load subscriptions:', error);
            }
        }
    }
    /**
     * Save subscriptions to file
     */
    async saveSubscriptions() {
        try {
            const subscriptions = Array.from(this.subscriptions.values());
            await fs.writeFile(this.subscriptionsFile, JSON.stringify(subscriptions, null, 2));
            logger.debug(`Saved ${subscriptions.length} subscriptions`);
        }
        catch (error) {
            logger.error('Failed to save subscriptions:', error);
        }
    }
    /**
     * Shutdown the service
     */
    async shutdown() {
        await this.saveSubscriptions();
        logger.log('PushNotificationService shutdown');
    }
    /**
     * Generate unique subscription ID
     */
    generateSubscriptionId(endpoint, keys) {
        try {
            const url = new URL(endpoint);
            const hash = Buffer.from(keys.p256dh).toString('base64').substring(0, 8);
            return `${url.hostname}-${hash}`;
        }
        catch {
            // Fallback to a hash of the entire endpoint
            return Buffer.from(endpoint).toString('base64').substring(0, 16);
        }
    }
}
exports.PushNotificationService = PushNotificationService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVzaC1ub3RpZmljYXRpb24tc2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvc2VydmljZXMvcHVzaC1ub3RpZmljYXRpb24tc2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxnREFBa0M7QUFDbEMsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUU3QixrREFBa0Q7QUFJbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLDJCQUEyQixDQUFDLENBQUM7QUE0Q3pEOztHQUVHO0FBQ0gsTUFBYSx1QkFBdUI7SUFNbEMsWUFBWSxZQUEwQjtRQUo5QixrQkFBYSxHQUFHLElBQUksR0FBRyxFQUE0QixDQUFDO1FBQ3BELGdCQUFXLEdBQUcsS0FBSyxDQUFDO1FBSTFCLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVU7UUFDZCxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNyQixPQUFPO1FBQ1QsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILGtDQUFrQztZQUNsQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRTFFLDhCQUE4QjtZQUM5QixNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBRS9CLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLE1BQU0sQ0FBQyxHQUFHLENBQUMscUNBQXFDLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsK0NBQStDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGVBQWUsQ0FBQyxRQUFnQixFQUFFLElBQXNDO1FBQzVFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbkUsTUFBTSxZQUFZLEdBQXFCO1lBQ3JDLEVBQUUsRUFBRSxjQUFjO1lBQ2xCLFFBQVE7WUFDUixJQUFJO1lBQ0osWUFBWSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ3RDLFFBQVEsRUFBRSxJQUFJO1NBQ2YsQ0FBQztRQUVGLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUNyRCxNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDeEQsT0FBTyxjQUFjLENBQUM7SUFDeEIsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGtCQUFrQixDQUFDLGNBQXNCO1FBQzdDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzFELElBQUksT0FBTyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQy9CLE1BQU0sQ0FBQyxHQUFHLENBQUMseUJBQXlCLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDeEQsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFFRDs7T0FFRztJQUNILGdCQUFnQjtRQUNkLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDL0UsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGdCQUFnQixDQUFDLE9BQTRCO1FBQ2pELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFFRCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3BELElBQUksbUJBQW1CLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU87Z0JBQ0wsT0FBTyxFQUFFLElBQUk7Z0JBQ2IsSUFBSSxFQUFFLENBQUM7Z0JBQ1AsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsTUFBTSxFQUFFLEVBQUU7YUFDWCxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNuQixJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDZixNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7UUFFNUIsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNwQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUs7WUFDcEIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1lBQ2xCLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSSxJQUFJLHVCQUF1QjtZQUM3QyxLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUssSUFBSSxpQkFBaUI7WUFDekMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLElBQUksY0FBYyxPQUFPLENBQUMsSUFBSSxFQUFFO1lBQ2hELGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsSUFBSSxLQUFLO1lBQ3ZELE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLEVBQUU7WUFDOUIsSUFBSSxFQUFFO2dCQUNKLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtnQkFDbEIsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2dCQUNuQyxHQUFHLE9BQU8sQ0FBQyxJQUFJO2FBQ2hCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLEtBQUssTUFBTSxZQUFZLElBQUksbUJBQW1CLEVBQUUsQ0FBQztZQUMvQyxJQUFJLENBQUM7Z0JBQ0gsTUFBTSxtQkFBbUIsR0FBNkI7b0JBQ3BELFFBQVEsRUFBRSxZQUFZLENBQUMsUUFBUTtvQkFDL0IsSUFBSSxFQUFFLFlBQVksQ0FBQyxJQUFJO2lCQUN4QixDQUFDO2dCQUVGLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsRUFBRSxjQUFjLENBQUMsQ0FBQztnQkFDOUUsVUFBVSxFQUFFLENBQUM7Z0JBRWIsTUFBTSxDQUFDLEtBQUssQ0FBQyx5QkFBeUIsWUFBWSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDM0QsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsTUFBTSxFQUFFLENBQUM7Z0JBQ1QsTUFBTSxRQUFRLEdBQUcscUJBQXFCLFlBQVksQ0FBQyxFQUFFLEtBQUssS0FBSyxFQUFFLENBQUM7Z0JBQ2xFLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBRXRCLHVDQUF1QztnQkFDdkMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxRCxJQUFJLFlBQVksRUFBRSxDQUFDO29CQUNqQixJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzNDLE1BQU0sWUFBWSxHQUFHLEtBQXdDLENBQUM7b0JBQzlELE1BQU0sQ0FBQyxHQUFHLENBQ1IsaUNBQWlDLFlBQVksQ0FBQyxFQUFFLGFBQWEsWUFBWSxDQUFDLFVBQVUsR0FBRyxDQUN4RixDQUFDO2dCQUNKLENBQUM7cUJBQU0sQ0FBQztvQkFDTixpQ0FBaUM7b0JBQ2pDLE1BQU0sWUFBWSxHQUFHLEtBQXdDLENBQUM7b0JBQzlELE1BQU0sQ0FBQyxLQUFLLENBQ1YsNkJBQTZCLFlBQVksQ0FBQyxFQUFFLFlBQVksS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUN6SixDQUFDO2dCQUNKLENBQUM7WUFDSCxDQUFDO1FBQ0gsQ0FBQztRQUVELDZCQUE2QjtRQUM3QixNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBRS9CLE1BQU0sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLFVBQVUsZ0JBQWdCLE1BQU0sU0FBUyxFQUFFO1lBQzFFLElBQUksRUFBRSxPQUFPLENBQUMsSUFBSTtZQUNsQixLQUFLLEVBQUUsT0FBTyxDQUFDLEtBQUs7U0FDckIsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNMLE9BQU8sRUFBRSxJQUFJO1lBQ2IsSUFBSSxFQUFFLFVBQVU7WUFDaEIsTUFBTTtZQUNOLE1BQU07U0FDUCxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG9CQUFvQixDQUN4QixXQUFvQztRQUVwQyxNQUFNLE9BQU8sR0FBd0I7WUFDbkMsSUFBSSxFQUFFLE1BQU07WUFDWixLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUs7WUFDeEIsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJO1lBQ3RCLElBQUksRUFBRSxXQUFXLENBQUMsSUFBSTtZQUN0QixLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUs7WUFDeEIsR0FBRyxFQUFFLFdBQVcsQ0FBQyxHQUFHO1lBQ3BCLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxrQkFBa0I7WUFDbEQsT0FBTyxFQUFFLFdBQVcsQ0FBQyxPQUFPO1lBQzVCLElBQUksRUFBRSxXQUFXLENBQUMsSUFBSTtTQUN2QixDQUFDO1FBRUYsT0FBTyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQ7O09BRUc7SUFDSyx3QkFBd0IsQ0FBQyxLQUFjO1FBQzdDLElBQUksQ0FBQyxDQUFDLEtBQUssWUFBWSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzlCLE9BQU8sS0FBSyxDQUFDO1FBQ2YsQ0FBQztRQUVELHdEQUF3RDtRQUN4RCx5Q0FBeUM7UUFDekMsTUFBTSxZQUFZLEdBQUcsS0FBd0MsQ0FBQztRQUM5RCxJQUFJLFlBQVksQ0FBQyxVQUFVLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDcEMsT0FBTyxJQUFJLENBQUM7UUFDZCxDQUFDO1FBRUQscURBQXFEO1FBQ3JELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNwRSxPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7UUFFRCwwREFBMEQ7UUFDMUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNqRCxPQUFPLENBQ0wsWUFBWSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7WUFDaEMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7WUFDaEMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQztZQUM3QyxZQUFZLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxDQUN0QyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLDRCQUE0QjtRQUNoQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQztRQUU1QyxvQ0FBb0M7UUFDcEMsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQ3hFLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUN4QyxDQUFDO1FBRUYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMzQixLQUFLLE1BQU0sWUFBWSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDL0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUN4RCxDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDO1FBRTNELElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3JCLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDL0IsTUFBTSxDQUFDLEdBQUcsQ0FBQyxjQUFjLFlBQVkseUJBQXlCLENBQUMsQ0FBQztRQUNsRSxDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUM7SUFDdEIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGlCQUFpQjtRQUM3QixJQUFJLENBQUM7WUFDSCxNQUFNLElBQUksR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQy9ELE1BQU0sYUFBYSxHQUF1QixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTNELElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDM0IsS0FBSyxNQUFNLFlBQVksSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUMsQ0FBQztZQUN4RCxDQUFDO1lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLGFBQWEsQ0FBQyxNQUFNLGdCQUFnQixDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLE9BQU8sR0FBRyxLQUE4QixDQUFDO1lBQy9DLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDOUIsTUFBTSxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ3ZELENBQUM7aUJBQU0sQ0FBQztnQkFDTixNQUFNLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELENBQUM7UUFDSCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGlCQUFpQjtRQUM3QixJQUFJLENBQUM7WUFDSCxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUM5RCxNQUFNLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25GLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxhQUFhLENBQUMsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RCxDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFFBQVE7UUFDWixNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxHQUFHLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxzQkFBc0IsQ0FBQyxRQUFnQixFQUFFLElBQXNDO1FBQ3JGLElBQUksQ0FBQztZQUNILE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3pFLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ25DLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCw0Q0FBNEM7WUFDNUMsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUEzU0QsMERBMlNDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBQdXNoTm90aWZpY2F0aW9uU2VydmljZSAtIFNpbXBsaWZpZWQgcHVzaCBub3RpZmljYXRpb24gc3lzdGVtXG4gKlxuICogVGhpcyBzaW1wbGlmaWVkIHNlcnZpY2UgcHJvdmlkZXM6XG4gKiAtIEJhc2ljIHN1YnNjcmlwdGlvbiBzdG9yYWdlXG4gKiAtIFNpbXBsZSBub3RpZmljYXRpb24gc2VuZGluZyB3aXRob3V0IHVzZXIgdHJhY2tpbmcgb3IgcHJlZmVyZW5jZXNcbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHR5cGUgd2VicHVzaCBmcm9tICd3ZWItcHVzaCc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBWYXBpZE1hbmFnZXIgfSBmcm9tICcuLi91dGlscy92YXBpZC1tYW5hZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgQmVsbE5vdGlmaWNhdGlvblBheWxvYWQgfSBmcm9tICcuL2JlbGwtZXZlbnQtaGFuZGxlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigncHVzaC1ub3RpZmljYXRpb24tc2VydmljZScpO1xuXG4vKipcbiAqIFNpbXBsaWZpZWQgcHVzaCBzdWJzY3JpcHRpb24gZGF0YSBzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQdXNoU3Vic2NyaXB0aW9uIHtcbiAgaWQ6IHN0cmluZztcbiAgZW5kcG9pbnQ6IHN0cmluZztcbiAga2V5czoge1xuICAgIHAyNTZkaDogc3RyaW5nO1xuICAgIGF1dGg6IHN0cmluZztcbiAgfTtcbiAgc3Vic2NyaWJlZEF0OiBzdHJpbmc7XG4gIGlzQWN0aXZlOiBib29sZWFuO1xufVxuXG4vKipcbiAqIEdlbmVyaWMgbm90aWZpY2F0aW9uIHBheWxvYWRcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBOb3RpZmljYXRpb25QYXlsb2FkIHtcbiAgdHlwZTogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBib2R5OiBzdHJpbmc7XG4gIGljb24/OiBzdHJpbmc7XG4gIGJhZGdlPzogc3RyaW5nO1xuICB0YWc/OiBzdHJpbmc7XG4gIHJlcXVpcmVJbnRlcmFjdGlvbj86IGJvb2xlYW47XG4gIGFjdGlvbnM/OiBBcnJheTx7XG4gICAgYWN0aW9uOiBzdHJpbmc7XG4gICAgdGl0bGU6IHN0cmluZztcbiAgfT47XG4gIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuLyoqXG4gKiBTZW5kIG5vdGlmaWNhdGlvbiByZXN1bHRcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZW5kTm90aWZpY2F0aW9uUmVzdWx0IHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgc2VudDogbnVtYmVyO1xuICBmYWlsZWQ6IG51bWJlcjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBTaW1wbGlmaWVkIHB1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIHtcbiAgcHJpdmF0ZSB2YXBpZE1hbmFnZXI6IFZhcGlkTWFuYWdlcjtcbiAgcHJpdmF0ZSBzdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFB1c2hTdWJzY3JpcHRpb24+KCk7XG4gIHByaXZhdGUgaW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZWFkb25seSBzdWJzY3JpcHRpb25zRmlsZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHZhcGlkTWFuYWdlcjogVmFwaWRNYW5hZ2VyKSB7XG4gICAgdGhpcy52YXBpZE1hbmFnZXIgPSB2YXBpZE1hbmFnZXI7XG4gICAgY29uc3Qgc3RvcmFnZURpciA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbC9ub3RpZmljYXRpb25zJyk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zRmlsZSA9IHBhdGguam9pbihzdG9yYWdlRGlyLCAnc3Vic2NyaXB0aW9ucy5qc29uJyk7XG4gIH1cblxuICAvKipcbiAgICogSW5pdGlhbGl6ZSB0aGUgc2VydmljZVxuICAgKi9cbiAgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5pbml0aWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAvLyBFbnN1cmUgc3RvcmFnZSBkaXJlY3RvcnkgZXhpc3RzXG4gICAgICBhd2FpdCBmcy5ta2RpcihwYXRoLmRpcm5hbWUodGhpcy5zdWJzY3JpcHRpb25zRmlsZSksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXG4gICAgICAvLyBMb2FkIGV4aXN0aW5nIHN1YnNjcmlwdGlvbnNcbiAgICAgIGF3YWl0IHRoaXMubG9hZFN1YnNjcmlwdGlvbnMoKTtcblxuICAgICAgdGhpcy5pbml0aWFsaXplZCA9IHRydWU7XG4gICAgICBsb2dnZXIubG9nKCdQdXNoTm90aWZpY2F0aW9uU2VydmljZSBpbml0aWFsaXplZCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBpbml0aWFsaXplIFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZGQgYSBuZXcgc3Vic2NyaXB0aW9uXG4gICAqL1xuICBhc3luYyBhZGRTdWJzY3JpcHRpb24oZW5kcG9pbnQ6IHN0cmluZywga2V5czogeyBwMjU2ZGg6IHN0cmluZzsgYXV0aDogc3RyaW5nIH0pOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHN1YnNjcmlwdGlvbklkID0gdGhpcy5nZW5lcmF0ZVN1YnNjcmlwdGlvbklkKGVuZHBvaW50LCBrZXlzKTtcblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbjogUHVzaFN1YnNjcmlwdGlvbiA9IHtcbiAgICAgIGlkOiBzdWJzY3JpcHRpb25JZCxcbiAgICAgIGVuZHBvaW50LFxuICAgICAga2V5cyxcbiAgICAgIHN1YnNjcmliZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgaXNBY3RpdmU6IHRydWUsXG4gICAgfTtcblxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSWQsIHN1YnNjcmlwdGlvbik7XG4gICAgYXdhaXQgdGhpcy5zYXZlU3Vic2NyaXB0aW9ucygpO1xuXG4gICAgbG9nZ2VyLmxvZyhgTmV3IHN1YnNjcmlwdGlvbiBhZGRlZDogJHtzdWJzY3JpcHRpb25JZH1gKTtcbiAgICByZXR1cm4gc3Vic2NyaXB0aW9uSWQ7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlIGEgc3Vic2NyaXB0aW9uXG4gICAqL1xuICBhc3luYyByZW1vdmVTdWJzY3JpcHRpb24oc3Vic2NyaXB0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGV4aXN0ZWQgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbklkKTtcbiAgICBpZiAoZXhpc3RlZCkge1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU3Vic2NyaXB0aW9ucygpO1xuICAgICAgbG9nZ2VyLmxvZyhgU3Vic2NyaXB0aW9uIHJlbW92ZWQ6ICR7c3Vic2NyaXB0aW9uSWR9YCk7XG4gICAgfVxuICAgIHJldHVybiBleGlzdGVkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhbGwgYWN0aXZlIHN1YnNjcmlwdGlvbnNcbiAgICovXG4gIGdldFN1YnNjcmlwdGlvbnMoKTogUHVzaFN1YnNjcmlwdGlvbltdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnN1YnNjcmlwdGlvbnMudmFsdWVzKCkpLmZpbHRlcigoc3ViKSA9PiBzdWIuaXNBY3RpdmUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgbm90aWZpY2F0aW9uIHRvIGFsbCBzdWJzY3JpcHRpb25zXG4gICAqL1xuICBhc3luYyBzZW5kTm90aWZpY2F0aW9uKHBheWxvYWQ6IE5vdGlmaWNhdGlvblBheWxvYWQpOiBQcm9taXNlPFNlbmROb3RpZmljYXRpb25SZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMudmFwaWRNYW5hZ2VyLmlzRW5hYmxlZCgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZBUElEIG5vdCBwcm9wZXJseSBjb25maWd1cmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgYWN0aXZlU3Vic2NyaXB0aW9ucyA9IHRoaXMuZ2V0U3Vic2NyaXB0aW9ucygpO1xuICAgIGlmIChhY3RpdmVTdWJzY3JpcHRpb25zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgc2VudDogMCxcbiAgICAgICAgZmFpbGVkOiAwLFxuICAgICAgICBlcnJvcnM6IFtdLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBsZXQgc3VjY2Vzc2Z1bCA9IDA7XG4gICAgbGV0IGZhaWxlZCA9IDA7XG4gICAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgY29uc3Qgd2ViUHVzaFBheWxvYWQgPSBKU09OLnN0cmluZ2lmeSh7XG4gICAgICB0aXRsZTogcGF5bG9hZC50aXRsZSxcbiAgICAgIGJvZHk6IHBheWxvYWQuYm9keSxcbiAgICAgIGljb246IHBheWxvYWQuaWNvbiB8fCAnL2FwcGxlLXRvdWNoLWljb24ucG5nJyxcbiAgICAgIGJhZGdlOiBwYXlsb2FkLmJhZGdlIHx8ICcvZmF2aWNvbi0zMi5wbmcnLFxuICAgICAgdGFnOiBwYXlsb2FkLnRhZyB8fCBgdmliZXR1bm5lbC0ke3BheWxvYWQudHlwZX1gLFxuICAgICAgcmVxdWlyZUludGVyYWN0aW9uOiBwYXlsb2FkLnJlcXVpcmVJbnRlcmFjdGlvbiB8fCBmYWxzZSxcbiAgICAgIGFjdGlvbnM6IHBheWxvYWQuYWN0aW9ucyB8fCBbXSxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdHlwZTogcGF5bG9hZC50eXBlLFxuICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgLi4ucGF5bG9hZC5kYXRhLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFNlbmQgdG8gYWxsIHN1YnNjcmlwdGlvbnNcbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBhY3RpdmVTdWJzY3JpcHRpb25zKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3ZWJwdXNoU3Vic2NyaXB0aW9uOiB3ZWJwdXNoLlB1c2hTdWJzY3JpcHRpb24gPSB7XG4gICAgICAgICAgZW5kcG9pbnQ6IHN1YnNjcmlwdGlvbi5lbmRwb2ludCxcbiAgICAgICAgICBrZXlzOiBzdWJzY3JpcHRpb24ua2V5cyxcbiAgICAgICAgfTtcblxuICAgICAgICBhd2FpdCB0aGlzLnZhcGlkTWFuYWdlci5zZW5kTm90aWZpY2F0aW9uKHdlYnB1c2hTdWJzY3JpcHRpb24sIHdlYlB1c2hQYXlsb2FkKTtcbiAgICAgICAgc3VjY2Vzc2Z1bCsrO1xuXG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgTm90aWZpY2F0aW9uIHNlbnQgdG86ICR7c3Vic2NyaXB0aW9uLmlkfWApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgZmFpbGVkKys7XG4gICAgICAgIGNvbnN0IGVycm9yTXNnID0gYEZhaWxlZCB0byBzZW5kIHRvICR7c3Vic2NyaXB0aW9uLmlkfTogJHtlcnJvcn1gO1xuICAgICAgICBlcnJvcnMucHVzaChlcnJvck1zZyk7XG4gICAgICAgIGxvZ2dlci53YXJuKGVycm9yTXNnKTtcblxuICAgICAgICAvLyBSZW1vdmUgZXhwaXJlZC9pbnZhbGlkIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3Qgc2hvdWxkUmVtb3ZlID0gdGhpcy5zaG91bGRSZW1vdmVTdWJzY3JpcHRpb24oZXJyb3IpO1xuICAgICAgICBpZiAoc2hvdWxkUmVtb3ZlKSB7XG4gICAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaWQpO1xuICAgICAgICAgIGNvbnN0IHdlYlB1c2hFcnJvciA9IGVycm9yIGFzIEVycm9yICYgeyBzdGF0dXNDb2RlPzogbnVtYmVyIH07XG4gICAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICAgIGBSZW1vdmVkIGV4cGlyZWQgc3Vic2NyaXB0aW9uOiAke3N1YnNjcmlwdGlvbi5pZH0gKHN0YXR1czogJHt3ZWJQdXNoRXJyb3Iuc3RhdHVzQ29kZX0pYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRGVidWcgbG9nIGZvciB1bmhhbmRsZWQgZXJyb3JzXG4gICAgICAgICAgY29uc3Qgd2ViUHVzaEVycm9yID0gZXJyb3IgYXMgRXJyb3IgJiB7IHN0YXR1c0NvZGU/OiBudW1iZXIgfTtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgICBgTm90IHJlbW92aW5nIHN1YnNjcmlwdGlvbiAke3N1YnNjcmlwdGlvbi5pZH0sIGVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX0sIHN0YXR1c0NvZGU6ICR7d2ViUHVzaEVycm9yLnN0YXR1c0NvZGV9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBTYXZlIHVwZGF0ZWQgc3Vic2NyaXB0aW9uc1xuICAgIGF3YWl0IHRoaXMuc2F2ZVN1YnNjcmlwdGlvbnMoKTtcblxuICAgIGxvZ2dlci5sb2coYE5vdGlmaWNhdGlvbiBzZW50OiAke3N1Y2Nlc3NmdWx9IHN1Y2Nlc3NmdWwsICR7ZmFpbGVkfSBmYWlsZWRgLCB7XG4gICAgICB0eXBlOiBwYXlsb2FkLnR5cGUsXG4gICAgICB0aXRsZTogcGF5bG9hZC50aXRsZSxcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgc2VudDogc3VjY2Vzc2Z1bCxcbiAgICAgIGZhaWxlZCxcbiAgICAgIGVycm9ycyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgYmVsbCBub3RpZmljYXRpb25cbiAgICovXG4gIGFzeW5jIHNlbmRCZWxsTm90aWZpY2F0aW9uKFxuICAgIGJlbGxQYXlsb2FkOiBCZWxsTm90aWZpY2F0aW9uUGF5bG9hZFxuICApOiBQcm9taXNlPFNlbmROb3RpZmljYXRpb25SZXN1bHQ+IHtcbiAgICBjb25zdCBwYXlsb2FkOiBOb3RpZmljYXRpb25QYXlsb2FkID0ge1xuICAgICAgdHlwZTogJ2JlbGwnLFxuICAgICAgdGl0bGU6IGJlbGxQYXlsb2FkLnRpdGxlLFxuICAgICAgYm9keTogYmVsbFBheWxvYWQuYm9keSxcbiAgICAgIGljb246IGJlbGxQYXlsb2FkLmljb24sXG4gICAgICBiYWRnZTogYmVsbFBheWxvYWQuYmFkZ2UsXG4gICAgICB0YWc6IGJlbGxQYXlsb2FkLnRhZyxcbiAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogYmVsbFBheWxvYWQucmVxdWlyZUludGVyYWN0aW9uLFxuICAgICAgYWN0aW9uczogYmVsbFBheWxvYWQuYWN0aW9ucyxcbiAgICAgIGRhdGE6IGJlbGxQYXlsb2FkLmRhdGEsXG4gICAgfTtcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNlbmROb3RpZmljYXRpb24ocGF5bG9hZCk7XG4gIH1cblxuICAvKipcbiAgICogRGV0ZXJtaW5lIGlmIGEgc3Vic2NyaXB0aW9uIHNob3VsZCBiZSByZW1vdmVkIGJhc2VkIG9uIHRoZSBlcnJvclxuICAgKi9cbiAgcHJpdmF0ZSBzaG91bGRSZW1vdmVTdWJzY3JpcHRpb24oZXJyb3I6IHVua25vd24pOiBib29sZWFuIHtcbiAgICBpZiAoIShlcnJvciBpbnN0YW5jZW9mIEVycm9yKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBIVFRQIDQxMCBHb25lIHN0YXR1cyAoc3Vic2NyaXB0aW9uIGV4cGlyZWQpXG4gICAgLy8gV2ViUHVzaEVycm9yIGhhcyBhIHN0YXR1c0NvZGUgcHJvcGVydHlcbiAgICBjb25zdCB3ZWJQdXNoRXJyb3IgPSBlcnJvciBhcyBFcnJvciAmIHsgc3RhdHVzQ29kZT86IG51bWJlciB9O1xuICAgIGlmICh3ZWJQdXNoRXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDEwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBBbHNvIGNoZWNrIG1lc3NhZ2UgY29udGVudCBmb3Igb3RoZXIgZXJyb3IgZm9ybWF0c1xuICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCc0MTAnKSB8fCBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdHb25lJykpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBvdGhlciBleHBpcmVkL2ludmFsaWQgc3Vic2NyaXB0aW9uIGluZGljYXRvcnNcbiAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIChcbiAgICAgIGVycm9yTWVzc2FnZS5pbmNsdWRlcygnaW52YWxpZCcpIHx8XG4gICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ2V4cGlyZWQnKSB8fFxuICAgICAgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdubyBzdWNoIHN1YnNjcmlwdGlvbicpIHx8XG4gICAgICBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ3Vuc3Vic2NyaWJlZCcpXG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhbiB1cCBpbmFjdGl2ZSBzdWJzY3JpcHRpb25zXG4gICAqL1xuICBhc3luYyBjbGVhbnVwSW5hY3RpdmVTdWJzY3JpcHRpb25zKCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgYmVmb3JlQ291bnQgPSB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZTtcblxuICAgIC8vIFJlbW92ZSBhbGwgaW5hY3RpdmUgc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGFjdGl2ZVN1YnNjcmlwdGlvbnMgPSBBcnJheS5mcm9tKHRoaXMuc3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkuZmlsdGVyKFxuICAgICAgKHN1YnNjcmlwdGlvbikgPT4gc3Vic2NyaXB0aW9uLmlzQWN0aXZlXG4gICAgKTtcblxuICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5jbGVhcigpO1xuICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIGFjdGl2ZVN1YnNjcmlwdGlvbnMpIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uLmlkLCBzdWJzY3JpcHRpb24pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlbW92ZWRDb3VudCA9IGJlZm9yZUNvdW50IC0gdGhpcy5zdWJzY3JpcHRpb25zLnNpemU7XG5cbiAgICBpZiAocmVtb3ZlZENvdW50ID4gMCkge1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU3Vic2NyaXB0aW9ucygpO1xuICAgICAgbG9nZ2VyLmxvZyhgQ2xlYW5lZCB1cCAke3JlbW92ZWRDb3VudH0gaW5hY3RpdmUgc3Vic2NyaXB0aW9uc2ApO1xuICAgIH1cblxuICAgIHJldHVybiByZW1vdmVkQ291bnQ7XG4gIH1cblxuICAvKipcbiAgICogTG9hZCBzdWJzY3JpcHRpb25zIGZyb20gZmlsZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBsb2FkU3Vic2NyaXB0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IGZzLnJlYWRGaWxlKHRoaXMuc3Vic2NyaXB0aW9uc0ZpbGUsICd1dGY4Jyk7XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25zOiBQdXNoU3Vic2NyaXB0aW9uW10gPSBKU09OLnBhcnNlKGRhdGEpO1xuXG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcbiAgICAgIGZvciAoY29uc3Qgc3Vic2NyaXB0aW9uIG9mIHN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLnNldChzdWJzY3JpcHRpb24uaWQsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZyhgTG9hZGVkICR7c3Vic2NyaXB0aW9ucy5sZW5ndGh9IHN1YnNjcmlwdGlvbnNgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcbiAgICAgIGlmIChmc0Vycm9yLmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnTm8gZXhpc3Rpbmcgc3Vic2NyaXB0aW9ucyBmaWxlIGZvdW5kJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIHN1YnNjcmlwdGlvbnM6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTYXZlIHN1YnNjcmlwdGlvbnMgdG8gZmlsZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzYXZlU3Vic2NyaXB0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9ucyA9IEFycmF5LmZyb20odGhpcy5zdWJzY3JpcHRpb25zLnZhbHVlcygpKTtcbiAgICAgIGF3YWl0IGZzLndyaXRlRmlsZSh0aGlzLnN1YnNjcmlwdGlvbnNGaWxlLCBKU09OLnN0cmluZ2lmeShzdWJzY3JpcHRpb25zLCBudWxsLCAyKSk7XG4gICAgICBsb2dnZXIuZGVidWcoYFNhdmVkICR7c3Vic2NyaXB0aW9ucy5sZW5ndGh9IHN1YnNjcmlwdGlvbnNgKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBzdWJzY3JpcHRpb25zOicsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU2h1dGRvd24gdGhlIHNlcnZpY2VcbiAgICovXG4gIGFzeW5jIHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZVN1YnNjcmlwdGlvbnMoKTtcbiAgICBsb2dnZXIubG9nKCdQdXNoTm90aWZpY2F0aW9uU2VydmljZSBzaHV0ZG93bicpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHVuaXF1ZSBzdWJzY3JpcHRpb24gSURcbiAgICovXG4gIHByaXZhdGUgZ2VuZXJhdGVTdWJzY3JpcHRpb25JZChlbmRwb2ludDogc3RyaW5nLCBrZXlzOiB7IHAyNTZkaDogc3RyaW5nOyBhdXRoOiBzdHJpbmcgfSk6IHN0cmluZyB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoZW5kcG9pbnQpO1xuICAgICAgY29uc3QgaGFzaCA9IEJ1ZmZlci5mcm9tKGtleXMucDI1NmRoKS50b1N0cmluZygnYmFzZTY0Jykuc3Vic3RyaW5nKDAsIDgpO1xuICAgICAgcmV0dXJuIGAke3VybC5ob3N0bmFtZX0tJHtoYXNofWA7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBGYWxsYmFjayB0byBhIGhhc2ggb2YgdGhlIGVudGlyZSBlbmRwb2ludFxuICAgICAgcmV0dXJuIEJ1ZmZlci5mcm9tKGVuZHBvaW50KS50b1N0cmluZygnYmFzZTY0Jykuc3Vic3RyaW5nKDAsIDE2KTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==