import { Router } from 'express';
import type { NotificationPreferences, QuickStartCommand } from '../../types/config.js';
import type { ConfigService } from '../services/config-service.js';
export interface AppConfig {
    repositoryBasePath: string;
    serverConfigured?: boolean;
    quickStartCommands?: QuickStartCommand[];
    notificationPreferences?: NotificationPreferences;
}
interface ConfigRouteOptions {
    configService: ConfigService;
}
/**
 * Create routes for application configuration
 */
export declare function createConfigRoutes(options: ConfigRouteOptions): Router;
export {};
