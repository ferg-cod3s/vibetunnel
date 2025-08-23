import type { VapidManager } from '../utils/vapid-manager.js';
import type { PushNotificationService } from './push-notification-service.js';
export declare class PushNotificationStatusService {
    private vapidManager;
    private pushNotificationService;
    constructor(vapidManager: VapidManager, pushNotificationService: PushNotificationService | null);
    getStatus(): {
        enabled: boolean;
        configured: boolean;
        subscriptions: number;
        error: string;
    } | {
        enabled: boolean;
        configured: boolean;
        subscriptions: number;
        error?: undefined;
    };
}
