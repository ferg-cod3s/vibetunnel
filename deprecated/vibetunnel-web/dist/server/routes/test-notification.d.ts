import { Router } from 'express';
import type { PushNotificationService } from '../services/push-notification-service.js';
import type { SessionMonitor } from '../services/session-monitor.js';
interface TestNotificationOptions {
    sessionMonitor?: SessionMonitor;
    pushNotificationService?: PushNotificationService | null;
}
/**
 * Test notification endpoint to verify the full notification flow
 * from server → SSE → Mac app AND push notifications
 */
export declare function createTestNotificationRouter(options: TestNotificationOptions): Router;
export {};
