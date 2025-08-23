import { type NotificationPreferences, type VibeTunnelConfig } from '../../types/config.js';
/**
 * Service for managing VibeTunnel configuration with file persistence and live reloading.
 *
 * The ConfigService handles loading, saving, and watching the VibeTunnel configuration file
 * stored in the user's home directory at `~/.vibetunnel/config.json`. It provides validation
 * using Zod schemas, automatic file watching for live reloading, and event-based notifications
 * when configuration changes occur.
 *
 * Key features:
 * - Persistent storage in user's home directory
 * - Automatic validation with Zod schemas
 * - Live reloading with file watching
 * - Event-based change notifications
 * - Graceful fallback to defaults on errors
 * - Atomic updates with validation
 *
 * @example
 * ```typescript
 * // Create and start the config service
 * const configService = new ConfigService();
 * configService.startWatching();
 *
 * // Subscribe to configuration changes
 * const unsubscribe = configService.onConfigChange((newConfig) => {
 *   console.log('Config updated:', newConfig);
 * });
 *
 * // Update quick start commands
 * configService.updateQuickStartCommands([
 *   { name: '🚀 dev', command: 'npm run dev' },
 *   { command: 'bash' }
 * ]);
 *
 * // Get current configuration
 * const config = configService.getConfig();
 *
 * // Clean up when done
 * unsubscribe();
 * configService.stopWatching();
 * ```
 */
export declare class ConfigService {
    private configDir;
    private configPath;
    private config;
    private watcher?;
    private configChangeCallbacks;
    constructor();
    private ensureConfigDir;
    private validateConfig;
    private loadConfig;
    private saveConfig;
    startWatching(): void;
    stopWatching(): void;
    private notifyConfigChange;
    onConfigChange(callback: (config: VibeTunnelConfig) => void): () => void;
    getConfig(): VibeTunnelConfig;
    updateConfig(config: VibeTunnelConfig): void;
    updateQuickStartCommands(commands: VibeTunnelConfig['quickStartCommands']): void;
    updateRepositoryBasePath(path: string): void;
    getConfigPath(): string;
    getNotificationPreferences(): NotificationPreferences;
    updateNotificationPreferences(notifications: Partial<NotificationPreferences>): void;
}
