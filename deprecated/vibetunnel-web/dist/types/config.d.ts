export interface QuickStartCommand {
    name?: string;
    command: string;
}
/**
 * Unified notification preferences used across Mac and Web
 * This is the single source of truth for notification settings
 */
export interface NotificationPreferences {
    enabled: boolean;
    sessionStart: boolean;
    sessionExit: boolean;
    commandCompletion: boolean;
    commandError: boolean;
    bell: boolean;
    claudeTurn: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
}
export interface VibeTunnelConfig {
    version: number;
    quickStartCommands: QuickStartCommand[];
    repositoryBasePath?: string;
    server?: {
        port: number;
        dashboardAccessMode: string;
        cleanupOnStartup: boolean;
        authenticationMode: string;
    };
    development?: {
        debugMode: boolean;
        useDevServer: boolean;
        devServerPath: string;
        logLevel: string;
    };
    preferences?: {
        preferredGitApp?: string;
        preferredTerminal?: string;
        updateChannel: string;
        showInDock: boolean;
        preventSleepWhenRunning: boolean;
        notifications?: NotificationPreferences;
    };
    remoteAccess?: {
        ngrokEnabled: boolean;
        ngrokTokenPresent: boolean;
    };
    sessionDefaults?: {
        command: string;
        workingDirectory: string;
        spawnWindow: boolean;
        titleMode: string;
    };
}
export declare const DEFAULT_QUICK_START_COMMANDS: QuickStartCommand[];
export declare const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences;
/**
 * Recommended notification preferences for new users
 * These are sensible defaults when notifications are enabled
 */
export declare const RECOMMENDED_NOTIFICATION_PREFERENCES: NotificationPreferences;
export declare const DEFAULT_CONFIG: VibeTunnelConfig;
