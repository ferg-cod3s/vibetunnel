/**
 * PushNotificationService - Simplified push notification system
 *
 * This simplified service provides:
 * - Basic subscription storage
 * - Simple notification sending without user tracking or preferences
 */
import type { VapidManager } from '../utils/vapid-manager.js';
import type { BellNotificationPayload } from './bell-event-handler.js';
/**
 * Simplified push subscription data structure
 */
export interface PushSubscription {
    id: string;
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    subscribedAt: string;
    isActive: boolean;
}
/**
 * Generic notification payload
 */
export interface NotificationPayload {
    type: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
    actions?: Array<{
        action: string;
        title: string;
    }>;
    data?: Record<string, unknown>;
}
/**
 * Send notification result
 */
export interface SendNotificationResult {
    success: boolean;
    sent: number;
    failed: number;
    errors: string[];
}
/**
 * Simplified push notification service
 */
export declare class PushNotificationService {
    private vapidManager;
    private subscriptions;
    private initialized;
    private readonly subscriptionsFile;
    constructor(vapidManager: VapidManager);
    /**
     * Initialize the service
     */
    initialize(): Promise<void>;
    /**
     * Add a new subscription
     */
    addSubscription(endpoint: string, keys: {
        p256dh: string;
        auth: string;
    }): Promise<string>;
    /**
     * Remove a subscription
     */
    removeSubscription(subscriptionId: string): Promise<boolean>;
    /**
     * Get all active subscriptions
     */
    getSubscriptions(): PushSubscription[];
    /**
     * Send notification to all subscriptions
     */
    sendNotification(payload: NotificationPayload): Promise<SendNotificationResult>;
    /**
     * Send bell notification
     */
    sendBellNotification(bellPayload: BellNotificationPayload): Promise<SendNotificationResult>;
    /**
     * Determine if a subscription should be removed based on the error
     */
    private shouldRemoveSubscription;
    /**
     * Clean up inactive subscriptions
     */
    cleanupInactiveSubscriptions(): Promise<number>;
    /**
     * Load subscriptions from file
     */
    private loadSubscriptions;
    /**
     * Save subscriptions to file
     */
    private saveSubscriptions;
    /**
     * Shutdown the service
     */
    shutdown(): Promise<void>;
    /**
     * Generate unique subscription ID
     */
    private generateSubscriptionId;
}
