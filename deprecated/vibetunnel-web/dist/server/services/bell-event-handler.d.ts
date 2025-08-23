/**
 * BellEventHandler - Ultra-simple bell event handler
 *
 * This simplified handler just sends notifications for bell events
 * without any filtering, correlation, or user tracking.
 */
import type { SessionInfo } from '../../shared/types.js';
import { type ProcessInfo, type ProcessSnapshot } from './process-tree-analyzer.js';
import type { PushNotificationService } from './push-notification-service.js';
/**
 * Enhanced bell event context with process information
 */
export interface BellEventContext {
    sessionInfo: SessionInfo;
    timestamp: Date;
    bellCount?: number;
    processSnapshot?: ProcessSnapshot;
    suspectedSource?: ProcessInfo | null;
}
/**
 * Simple bell notification payload
 */
export interface BellNotificationPayload {
    type: 'bell-event';
    sessionId: string;
    sessionName: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag: string;
    requireInteraction: boolean;
    actions?: Array<{
        action: string;
        title: string;
    }>;
    data: {
        sessionId: string;
        timestamp: string;
        processName?: string;
        processCommand?: string;
        processPid?: number;
    };
}
/**
 * Ultra-simple bell event handler
 */
export declare class BellEventHandler {
    private pushNotificationService;
    constructor();
    /**
     * Set the push notification service for sending notifications
     */
    setPushNotificationService(service: PushNotificationService): void;
    /**
     * Process a bell event - ultra-simple version
     */
    processBellEvent(context: BellEventContext): Promise<void>;
    /**
     * Create enhanced notification payload with process information
     */
    private createNotificationPayload;
    /**
     * Send push notification
     */
    private sendPushNotification;
    /**
     * Clean up resources
     */
    dispose(): void;
}
