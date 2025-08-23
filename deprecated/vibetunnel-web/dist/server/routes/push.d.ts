import { Router } from 'express';
import type { PushNotificationService } from '../services/push-notification-service.js';
import type { SessionMonitor } from '../services/session-monitor.js';
import type { VapidManager } from '../utils/vapid-manager.js';
export interface CreatePushRoutesOptions {
    vapidManager: VapidManager;
    pushNotificationService: PushNotificationService | null;
    sessionMonitor?: SessionMonitor;
}
export declare function createPushRoutes(options: CreatePushRoutesOptions): Router;
