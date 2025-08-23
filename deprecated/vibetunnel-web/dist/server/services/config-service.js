"use strict";
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
exports.ConfigService = void 0;
const chokidar_1 = require("chokidar");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const config_js_1 = require("../../types/config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('config-service');
// Zod schema for config validation
const ConfigSchema = zod_1.z.object({
    version: zod_1.z.number(),
    quickStartCommands: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().optional(),
        command: zod_1.z.string().min(1, 'Command cannot be empty'),
    })),
    repositoryBasePath: zod_1.z.string().optional(),
    // Extended configuration sections - we parse but don't use most of these yet
    server: zod_1.z
        .object({
        port: zod_1.z.number(),
        dashboardAccessMode: zod_1.z.string(),
        cleanupOnStartup: zod_1.z.boolean(),
        authenticationMode: zod_1.z.string(),
    })
        .optional(),
    development: zod_1.z
        .object({
        debugMode: zod_1.z.boolean(),
        useDevServer: zod_1.z.boolean(),
        devServerPath: zod_1.z.string(),
        logLevel: zod_1.z.string(),
    })
        .optional(),
    preferences: zod_1.z
        .object({
        preferredGitApp: zod_1.z.string().optional(),
        preferredTerminal: zod_1.z.string().optional(),
        updateChannel: zod_1.z.string(),
        showInDock: zod_1.z.boolean(),
        preventSleepWhenRunning: zod_1.z.boolean(),
        notifications: zod_1.z
            .object({
            enabled: zod_1.z.boolean(),
            sessionStart: zod_1.z.boolean(),
            sessionExit: zod_1.z.boolean(),
            commandCompletion: zod_1.z.boolean(),
            commandError: zod_1.z.boolean(),
            bell: zod_1.z.boolean(),
            claudeTurn: zod_1.z.boolean(),
            soundEnabled: zod_1.z.boolean(),
            vibrationEnabled: zod_1.z.boolean(),
        })
            .optional(),
    })
        .optional(),
    remoteAccess: zod_1.z
        .object({
        ngrokEnabled: zod_1.z.boolean(),
        ngrokTokenPresent: zod_1.z.boolean(),
    })
        .optional(),
    sessionDefaults: zod_1.z
        .object({
        command: zod_1.z.string(),
        workingDirectory: zod_1.z.string(),
        spawnWindow: zod_1.z.boolean(),
        titleMode: zod_1.z.string(),
    })
        .optional(),
});
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
class ConfigService {
    constructor() {
        this.config = config_js_1.DEFAULT_CONFIG;
        this.configChangeCallbacks = new Set();
        this.configDir = path.join(os.homedir(), '.vibetunnel');
        this.configPath = path.join(this.configDir, 'config.json');
        this.loadConfig();
    }
    ensureConfigDir() {
        try {
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
                logger.info(`Created config directory: ${this.configDir}`);
            }
        }
        catch (error) {
            logger.error('Failed to create config directory:', error);
        }
    }
    validateConfig(data) {
        try {
            return ConfigSchema.parse(data);
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                logger.error('Config validation failed:', error.issues);
                throw new Error(`Invalid config: ${error.issues.map((e) => e.message).join(', ')}`);
            }
            throw error;
        }
    }
    loadConfig() {
        try {
            this.ensureConfigDir();
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const parsedData = JSON.parse(data);
                try {
                    // Validate config using Zod schema
                    this.config = this.validateConfig(parsedData);
                    logger.info('Loaded and validated configuration from disk');
                }
                catch (validationError) {
                    logger.warn('Config validation failed, using defaults:', validationError);
                    this.config = config_js_1.DEFAULT_CONFIG;
                    this.saveConfig(); // Save defaults to fix invalid config
                }
            }
            else {
                logger.info('No config file found, creating with defaults');
                this.saveConfig(); // Create config with defaults
            }
        }
        catch (error) {
            logger.error('Failed to load config:', error);
            // Keep using defaults
        }
    }
    saveConfig() {
        try {
            this.ensureConfigDir();
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
            logger.info('Saved configuration to disk');
        }
        catch (error) {
            logger.error('Failed to save config:', error);
            throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    startWatching() {
        if (this.watcher) {
            return; // Already watching
        }
        try {
            this.watcher = (0, chokidar_1.watch)(this.configPath, {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 500,
                    pollInterval: 100,
                },
            });
            this.watcher.on('change', () => {
                logger.info('Configuration file changed, reloading...');
                const oldConfig = JSON.stringify(this.config);
                this.loadConfig();
                // Only notify if config actually changed
                if (JSON.stringify(this.config) !== oldConfig) {
                    this.notifyConfigChange();
                }
            });
            this.watcher.on('error', (error) => {
                logger.error('Config watcher error:', error);
            });
            logger.info('Started watching configuration file');
        }
        catch (error) {
            logger.error('Failed to start config watcher:', error);
        }
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher.close().catch((error) => {
                logger.error('Error closing config watcher:', error);
            });
            this.watcher = undefined;
            logger.info('Stopped watching configuration file');
        }
    }
    notifyConfigChange() {
        for (const callback of this.configChangeCallbacks) {
            try {
                callback(this.config);
            }
            catch (error) {
                logger.error('Error in config change callback:', error);
            }
        }
    }
    onConfigChange(callback) {
        this.configChangeCallbacks.add(callback);
        // Return unsubscribe function
        return () => {
            this.configChangeCallbacks.delete(callback);
        };
    }
    getConfig() {
        return this.config;
    }
    updateConfig(config) {
        // Validate the config before updating
        this.config = this.validateConfig(config);
        this.saveConfig();
        this.notifyConfigChange();
    }
    updateQuickStartCommands(commands) {
        // Validate the entire config with updated commands
        const updatedConfig = { ...this.config, quickStartCommands: commands };
        this.config = this.validateConfig(updatedConfig);
        this.saveConfig();
        this.notifyConfigChange();
    }
    updateRepositoryBasePath(path) {
        // Validate the entire config with updated repository base path
        const updatedConfig = { ...this.config, repositoryBasePath: path };
        this.config = this.validateConfig(updatedConfig);
        this.saveConfig();
        this.notifyConfigChange();
    }
    getConfigPath() {
        return this.configPath;
    }
    getNotificationPreferences() {
        return this.config.preferences?.notifications || config_js_1.DEFAULT_NOTIFICATION_PREFERENCES;
    }
    updateNotificationPreferences(notifications) {
        // Validate the notifications object
        try {
            const NotificationPreferencesSchema = zod_1.z
                .object({
                enabled: zod_1.z.boolean(),
                sessionStart: zod_1.z.boolean(),
                sessionExit: zod_1.z.boolean(),
                commandCompletion: zod_1.z.boolean(),
                commandError: zod_1.z.boolean(),
                bell: zod_1.z.boolean(),
                claudeTurn: zod_1.z.boolean(),
                soundEnabled: zod_1.z.boolean(),
                vibrationEnabled: zod_1.z.boolean(),
            })
                .partial();
            const validatedNotifications = NotificationPreferencesSchema.parse(notifications);
            // Merge with existing notifications or defaults
            const currentNotifications = this.config.preferences?.notifications || config_js_1.DEFAULT_NOTIFICATION_PREFERENCES;
            const mergedNotifications = { ...currentNotifications, ...validatedNotifications };
            // Ensure preferences object exists
            if (!this.config.preferences) {
                this.config.preferences = {
                    updateChannel: 'stable',
                    showInDock: false,
                    preventSleepWhenRunning: true,
                };
            }
            // Update notifications with merged values
            this.config.preferences.notifications = mergedNotifications;
            this.saveConfig();
            this.notifyConfigChange();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                logger.error('Invalid notification preferences:', error.issues);
                throw new Error(`Invalid notification preferences: ${error.issues.map((e) => e.message).join(', ')}`);
            }
            throw error;
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL2NvbmZpZy1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFpQztBQUNqQyx1Q0FBeUI7QUFDekIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3Qiw2QkFBd0I7QUFDeEIscURBSytCO0FBQy9CLGtEQUFrRDtBQUVsRCxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUU5QyxtQ0FBbUM7QUFDbkMsTUFBTSxZQUFZLEdBQUcsT0FBQyxDQUFDLE1BQU0sQ0FBQztJQUM1QixPQUFPLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRTtJQUNuQixrQkFBa0IsRUFBRSxPQUFDLENBQUMsS0FBSyxDQUN6QixPQUFDLENBQUMsTUFBTSxDQUFDO1FBQ1AsSUFBSSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7UUFDM0IsT0FBTyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLHlCQUF5QixDQUFDO0tBQ3RELENBQUMsQ0FDSDtJQUNELGtCQUFrQixFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxRQUFRLEVBQUU7SUFDekMsNkVBQTZFO0lBQzdFLE1BQU0sRUFBRSxPQUFDO1NBQ04sTUFBTSxDQUFDO1FBQ04sSUFBSSxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7UUFDaEIsbUJBQW1CLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRTtRQUMvQixnQkFBZ0IsRUFBRSxPQUFDLENBQUMsT0FBTyxFQUFFO1FBQzdCLGtCQUFrQixFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7S0FDL0IsQ0FBQztTQUNELFFBQVEsRUFBRTtJQUNiLFdBQVcsRUFBRSxP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QUNoQyxNQUFNLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDaEUsTUFBTSxJQUFJLEtBQUssQ0FDYixxQ0FBcUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FDckYsQ0FBQztZQUNKLENBQUM7WUFDRCxNQUFNLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUE5TkQsc0NBOE5DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBGU1dhdGNoZXIgfSBmcm9tICdjaG9raWRhcic7XG5pbXBvcnQgeyB3YXRjaCB9IGZyb20gJ2Nob2tpZGFyJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7XG4gIERFRkFVTFRfQ09ORklHLFxuICBERUZBVUxUX05PVElGSUNBVElPTl9QUkVGRVJFTkNFUyxcbiAgdHlwZSBOb3RpZmljYXRpb25QcmVmZXJlbmNlcyxcbiAgdHlwZSBWaWJlVHVubmVsQ29uZmlnLFxufSBmcm9tICcuLi8uLi90eXBlcy9jb25maWcuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdjb25maWctc2VydmljZScpO1xuXG4vLyBab2Qgc2NoZW1hIGZvciBjb25maWcgdmFsaWRhdGlvblxuY29uc3QgQ29uZmlnU2NoZW1hID0gei5vYmplY3Qoe1xuICB2ZXJzaW9uOiB6Lm51bWJlcigpLFxuICBxdWlja1N0YXJ0Q29tbWFuZHM6IHouYXJyYXkoXG4gICAgei5vYmplY3Qoe1xuICAgICAgbmFtZTogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgICAgY29tbWFuZDogei5zdHJpbmcoKS5taW4oMSwgJ0NvbW1hbmQgY2Fubm90IGJlIGVtcHR5JyksXG4gICAgfSlcbiAgKSxcbiAgcmVwb3NpdG9yeUJhc2VQYXRoOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIC8vIEV4dGVuZGVkIGNvbmZpZ3VyYXRpb24gc2VjdGlvbnMgLSB3ZSBwYXJzZSBidXQgZG9uJ3QgdXNlIG1vc3Qgb2YgdGhlc2UgeWV0XG4gIHNlcnZlcjogelxuICAgIC5vYmplY3Qoe1xuICAgICAgcG9ydDogei5udW1iZXIoKSxcbiAgICAgIGRhc2hib2FyZEFjY2Vzc01vZGU6IHouc3RyaW5nKCksXG4gICAgICBjbGVhbnVwT25TdGFydHVwOiB6LmJvb2xlYW4oKSxcbiAgICAgIGF1dGhlbnRpY2F0aW9uTW9kZTogei5zdHJpbmcoKSxcbiAgICB9KVxuICAgIC5vcHRpb25hbCgpLFxuICBkZXZlbG9wbWVudDogelxuICAgIC5vYmplY3Qoe1xuICAgICAgZGVidWdNb2RlOiB6LmJvb2xlYW4oKSxcbiAgICAgIHVzZURldlNlcnZlcjogei5ib29sZWFuKCksXG4gICAgICBkZXZTZXJ2ZXJQYXRoOiB6LnN0cmluZygpLFxuICAgICAgbG9nTGV2ZWw6IHouc3RyaW5nKCksXG4gICAgfSlcbiAgICAub3B0aW9uYWwoKSxcbiAgcHJlZmVyZW5jZXM6IHpcbiAgICAub2JqZWN0KHtcbiAgICAgIHByZWZlcnJlZEdpdEFwcDogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICAgICAgcHJlZmVycmVkVGVybWluYWw6IHouc3RyaW5nKCkub3B0aW9uYWwoKSxcbiAgICAgIHVwZGF0ZUNoYW5uZWw6IHouc3RyaW5nKCksXG4gICAgICBzaG93SW5Eb2NrOiB6LmJvb2xlYW4oKSxcbiAgICAgIHByZXZlbnRTbGVlcFdoZW5SdW5uaW5nOiB6LmJvb2xlYW4oKSxcbiAgICAgIG5vdGlmaWNhdGlvbnM6IHpcbiAgICAgICAgLm9iamVjdCh7XG4gICAgICAgICAgZW5hYmxlZDogei5ib29sZWFuKCksXG4gICAgICAgICAgc2Vzc2lvblN0YXJ0OiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBzZXNzaW9uRXhpdDogei5ib29sZWFuKCksXG4gICAgICAgICAgY29tbWFuZENvbXBsZXRpb246IHouYm9vbGVhbigpLFxuICAgICAgICAgIGNvbW1hbmRFcnJvcjogei5ib29sZWFuKCksXG4gICAgICAgICAgYmVsbDogei5ib29sZWFuKCksXG4gICAgICAgICAgY2xhdWRlVHVybjogei5ib29sZWFuKCksXG4gICAgICAgICAgc291bmRFbmFibGVkOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICB2aWJyYXRpb25FbmFibGVkOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgfSlcbiAgICAgICAgLm9wdGlvbmFsKCksXG4gICAgfSlcbiAgICAub3B0aW9uYWwoKSxcbiAgcmVtb3RlQWNjZXNzOiB6XG4gICAgLm9iamVjdCh7XG4gICAgICBuZ3Jva0VuYWJsZWQ6IHouYm9vbGVhbigpLFxuICAgICAgbmdyb2tUb2tlblByZXNlbnQ6IHouYm9vbGVhbigpLFxuICAgIH0pXG4gICAgLm9wdGlvbmFsKCksXG4gIHNlc3Npb25EZWZhdWx0czogelxuICAgIC5vYmplY3Qoe1xuICAgICAgY29tbWFuZDogei5zdHJpbmcoKSxcbiAgICAgIHdvcmtpbmdEaXJlY3Rvcnk6IHouc3RyaW5nKCksXG4gICAgICBzcGF3bldpbmRvdzogei5ib29sZWFuKCksXG4gICAgICB0aXRsZU1vZGU6IHouc3RyaW5nKCksXG4gICAgfSlcbiAgICAub3B0aW9uYWwoKSxcbn0pO1xuXG4vKipcbiAqIFNlcnZpY2UgZm9yIG1hbmFnaW5nIFZpYmVUdW5uZWwgY29uZmlndXJhdGlvbiB3aXRoIGZpbGUgcGVyc2lzdGVuY2UgYW5kIGxpdmUgcmVsb2FkaW5nLlxuICpcbiAqIFRoZSBDb25maWdTZXJ2aWNlIGhhbmRsZXMgbG9hZGluZywgc2F2aW5nLCBhbmQgd2F0Y2hpbmcgdGhlIFZpYmVUdW5uZWwgY29uZmlndXJhdGlvbiBmaWxlXG4gKiBzdG9yZWQgaW4gdGhlIHVzZXIncyBob21lIGRpcmVjdG9yeSBhdCBgfi8udmliZXR1bm5lbC9jb25maWcuanNvbmAuIEl0IHByb3ZpZGVzIHZhbGlkYXRpb25cbiAqIHVzaW5nIFpvZCBzY2hlbWFzLCBhdXRvbWF0aWMgZmlsZSB3YXRjaGluZyBmb3IgbGl2ZSByZWxvYWRpbmcsIGFuZCBldmVudC1iYXNlZCBub3RpZmljYXRpb25zXG4gKiB3aGVuIGNvbmZpZ3VyYXRpb24gY2hhbmdlcyBvY2N1ci5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAtIFBlcnNpc3RlbnQgc3RvcmFnZSBpbiB1c2VyJ3MgaG9tZSBkaXJlY3RvcnlcbiAqIC0gQXV0b21hdGljIHZhbGlkYXRpb24gd2l0aCBab2Qgc2NoZW1hc1xuICogLSBMaXZlIHJlbG9hZGluZyB3aXRoIGZpbGUgd2F0Y2hpbmdcbiAqIC0gRXZlbnQtYmFzZWQgY2hhbmdlIG5vdGlmaWNhdGlvbnNcbiAqIC0gR3JhY2VmdWwgZmFsbGJhY2sgdG8gZGVmYXVsdHMgb24gZXJyb3JzXG4gKiAtIEF0b21pYyB1cGRhdGVzIHdpdGggdmFsaWRhdGlvblxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgYW5kIHN0YXJ0IHRoZSBjb25maWcgc2VydmljZVxuICogY29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBDb25maWdTZXJ2aWNlKCk7XG4gKiBjb25maWdTZXJ2aWNlLnN0YXJ0V2F0Y2hpbmcoKTtcbiAqXG4gKiAvLyBTdWJzY3JpYmUgdG8gY29uZmlndXJhdGlvbiBjaGFuZ2VzXG4gKiBjb25zdCB1bnN1YnNjcmliZSA9IGNvbmZpZ1NlcnZpY2Uub25Db25maWdDaGFuZ2UoKG5ld0NvbmZpZykgPT4ge1xuICogICBjb25zb2xlLmxvZygnQ29uZmlnIHVwZGF0ZWQ6JywgbmV3Q29uZmlnKTtcbiAqIH0pO1xuICpcbiAqIC8vIFVwZGF0ZSBxdWljayBzdGFydCBjb21tYW5kc1xuICogY29uZmlnU2VydmljZS51cGRhdGVRdWlja1N0YXJ0Q29tbWFuZHMoW1xuICogICB7IG5hbWU6ICfwn5qAIGRldicsIGNvbW1hbmQ6ICducG0gcnVuIGRldicgfSxcbiAqICAgeyBjb21tYW5kOiAnYmFzaCcgfVxuICogXSk7XG4gKlxuICogLy8gR2V0IGN1cnJlbnQgY29uZmlndXJhdGlvblxuICogY29uc3QgY29uZmlnID0gY29uZmlnU2VydmljZS5nZXRDb25maWcoKTtcbiAqXG4gKiAvLyBDbGVhbiB1cCB3aGVuIGRvbmVcbiAqIHVuc3Vic2NyaWJlKCk7XG4gKiBjb25maWdTZXJ2aWNlLnN0b3BXYXRjaGluZygpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBDb25maWdTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBjb25maWdEaXI6IHN0cmluZztcbiAgcHJpdmF0ZSBjb25maWdQYXRoOiBzdHJpbmc7XG4gIHByaXZhdGUgY29uZmlnOiBWaWJlVHVubmVsQ29uZmlnID0gREVGQVVMVF9DT05GSUc7XG4gIHByaXZhdGUgd2F0Y2hlcj86IEZTV2F0Y2hlcjtcbiAgcHJpdmF0ZSBjb25maWdDaGFuZ2VDYWxsYmFja3M6IFNldDwoY29uZmlnOiBWaWJlVHVubmVsQ29uZmlnKSA9PiB2b2lkPiA9IG5ldyBTZXQoKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmNvbmZpZ0RpciA9IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbCcpO1xuICAgIHRoaXMuY29uZmlnUGF0aCA9IHBhdGguam9pbih0aGlzLmNvbmZpZ0RpciwgJ2NvbmZpZy5qc29uJyk7XG4gICAgdGhpcy5sb2FkQ29uZmlnKCk7XG4gIH1cblxuICBwcml2YXRlIGVuc3VyZUNvbmZpZ0RpcigpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHRoaXMuY29uZmlnRGlyKSkge1xuICAgICAgICBmcy5ta2RpclN5bmModGhpcy5jb25maWdEaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICBsb2dnZXIuaW5mbyhgQ3JlYXRlZCBjb25maWcgZGlyZWN0b3J5OiAke3RoaXMuY29uZmlnRGlyfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgY29uZmlnIGRpcmVjdG9yeTonLCBlcnJvcik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSB2YWxpZGF0ZUNvbmZpZyhkYXRhOiB1bmtub3duKTogVmliZVR1bm5lbENvbmZpZyB7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBDb25maWdTY2hlbWEucGFyc2UoZGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIHouWm9kRXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25maWcgdmFsaWRhdGlvbiBmYWlsZWQ6JywgZXJyb3IuaXNzdWVzKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNvbmZpZzogJHtlcnJvci5pc3N1ZXMubWFwKChlKSA9PiBlLm1lc3NhZ2UpLmpvaW4oJywgJyl9YCk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGxvYWRDb25maWcoKTogdm9pZCB7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuZW5zdXJlQ29uZmlnRGlyKCk7XG5cbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHRoaXMuY29uZmlnUGF0aCkpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyh0aGlzLmNvbmZpZ1BhdGgsICd1dGY4Jyk7XG4gICAgICAgIGNvbnN0IHBhcnNlZERhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gVmFsaWRhdGUgY29uZmlnIHVzaW5nIFpvZCBzY2hlbWFcbiAgICAgICAgICB0aGlzLmNvbmZpZyA9IHRoaXMudmFsaWRhdGVDb25maWcocGFyc2VkRGF0YSk7XG4gICAgICAgICAgbG9nZ2VyLmluZm8oJ0xvYWRlZCBhbmQgdmFsaWRhdGVkIGNvbmZpZ3VyYXRpb24gZnJvbSBkaXNrJyk7XG4gICAgICAgIH0gY2F0Y2ggKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIGxvZ2dlci53YXJuKCdDb25maWcgdmFsaWRhdGlvbiBmYWlsZWQsIHVzaW5nIGRlZmF1bHRzOicsIHZhbGlkYXRpb25FcnJvcik7XG4gICAgICAgICAgdGhpcy5jb25maWcgPSBERUZBVUxUX0NPTkZJRztcbiAgICAgICAgICB0aGlzLnNhdmVDb25maWcoKTsgLy8gU2F2ZSBkZWZhdWx0cyB0byBmaXggaW52YWxpZCBjb25maWdcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmluZm8oJ05vIGNvbmZpZyBmaWxlIGZvdW5kLCBjcmVhdGluZyB3aXRoIGRlZmF1bHRzJyk7XG4gICAgICAgIHRoaXMuc2F2ZUNvbmZpZygpOyAvLyBDcmVhdGUgY29uZmlnIHdpdGggZGVmYXVsdHNcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBjb25maWc6JywgZXJyb3IpO1xuICAgICAgLy8gS2VlcCB1c2luZyBkZWZhdWx0c1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc2F2ZUNvbmZpZygpOiB2b2lkIHtcbiAgICB0cnkge1xuICAgICAgdGhpcy5lbnN1cmVDb25maWdEaXIoKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModGhpcy5jb25maWdQYXRoLCBKU09OLnN0cmluZ2lmeSh0aGlzLmNvbmZpZywgbnVsbCwgMiksICd1dGY4Jyk7XG4gICAgICBsb2dnZXIuaW5mbygnU2F2ZWQgY29uZmlndXJhdGlvbiB0byBkaXNrJyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHNhdmUgY29uZmlnOicsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYEZhaWxlZCB0byBzYXZlIGNvbmZpZ3VyYXRpb246ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHN0YXJ0V2F0Y2hpbmcoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMud2F0Y2hlcikge1xuICAgICAgcmV0dXJuOyAvLyBBbHJlYWR5IHdhdGNoaW5nXG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIHRoaXMud2F0Y2hlciA9IHdhdGNoKHRoaXMuY29uZmlnUGF0aCwge1xuICAgICAgICBwZXJzaXN0ZW50OiB0cnVlLFxuICAgICAgICBpZ25vcmVJbml0aWFsOiB0cnVlLFxuICAgICAgICBhd2FpdFdyaXRlRmluaXNoOiB7XG4gICAgICAgICAgc3RhYmlsaXR5VGhyZXNob2xkOiA1MDAsXG4gICAgICAgICAgcG9sbEludGVydmFsOiAxMDAsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgdGhpcy53YXRjaGVyLm9uKCdjaGFuZ2UnLCAoKSA9PiB7XG4gICAgICAgIGxvZ2dlci5pbmZvKCdDb25maWd1cmF0aW9uIGZpbGUgY2hhbmdlZCwgcmVsb2FkaW5nLi4uJyk7XG4gICAgICAgIGNvbnN0IG9sZENvbmZpZyA9IEpTT04uc3RyaW5naWZ5KHRoaXMuY29uZmlnKTtcbiAgICAgICAgdGhpcy5sb2FkQ29uZmlnKCk7XG5cbiAgICAgICAgLy8gT25seSBub3RpZnkgaWYgY29uZmlnIGFjdHVhbGx5IGNoYW5nZWRcbiAgICAgICAgaWYgKEpTT04uc3RyaW5naWZ5KHRoaXMuY29uZmlnKSAhPT0gb2xkQ29uZmlnKSB7XG4gICAgICAgICAgdGhpcy5ub3RpZnlDb25maWdDaGFuZ2UoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMud2F0Y2hlci5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb25maWcgd2F0Y2hlciBlcnJvcjonLCBlcnJvcik7XG4gICAgICB9KTtcblxuICAgICAgbG9nZ2VyLmluZm8oJ1N0YXJ0ZWQgd2F0Y2hpbmcgY29uZmlndXJhdGlvbiBmaWxlJyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHN0YXJ0IGNvbmZpZyB3YXRjaGVyOicsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc3RvcFdhdGNoaW5nKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLndhdGNoZXIpIHtcbiAgICAgIHRoaXMud2F0Y2hlci5jbG9zZSgpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGNsb3NpbmcgY29uZmlnIHdhdGNoZXI6JywgZXJyb3IpO1xuICAgICAgfSk7XG4gICAgICB0aGlzLndhdGNoZXIgPSB1bmRlZmluZWQ7XG4gICAgICBsb2dnZXIuaW5mbygnU3RvcHBlZCB3YXRjaGluZyBjb25maWd1cmF0aW9uIGZpbGUnKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG5vdGlmeUNvbmZpZ0NoYW5nZSgpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGNhbGxiYWNrIG9mIHRoaXMuY29uZmlnQ2hhbmdlQ2FsbGJhY2tzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjYWxsYmFjayh0aGlzLmNvbmZpZyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGluIGNvbmZpZyBjaGFuZ2UgY2FsbGJhY2s6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBvbkNvbmZpZ0NoYW5nZShjYWxsYmFjazogKGNvbmZpZzogVmliZVR1bm5lbENvbmZpZykgPT4gdm9pZCk6ICgpID0+IHZvaWQge1xuICAgIHRoaXMuY29uZmlnQ2hhbmdlQ2FsbGJhY2tzLmFkZChjYWxsYmFjayk7XG4gICAgLy8gUmV0dXJuIHVuc3Vic2NyaWJlIGZ1bmN0aW9uXG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIHRoaXMuY29uZmlnQ2hhbmdlQ2FsbGJhY2tzLmRlbGV0ZShjYWxsYmFjayk7XG4gICAgfTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDb25maWcoKTogVmliZVR1bm5lbENvbmZpZyB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICB9XG5cbiAgcHVibGljIHVwZGF0ZUNvbmZpZyhjb25maWc6IFZpYmVUdW5uZWxDb25maWcpOiB2b2lkIHtcbiAgICAvLyBWYWxpZGF0ZSB0aGUgY29uZmlnIGJlZm9yZSB1cGRhdGluZ1xuICAgIHRoaXMuY29uZmlnID0gdGhpcy52YWxpZGF0ZUNvbmZpZyhjb25maWcpO1xuICAgIHRoaXMuc2F2ZUNvbmZpZygpO1xuICAgIHRoaXMubm90aWZ5Q29uZmlnQ2hhbmdlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlUXVpY2tTdGFydENvbW1hbmRzKGNvbW1hbmRzOiBWaWJlVHVubmVsQ29uZmlnWydxdWlja1N0YXJ0Q29tbWFuZHMnXSk6IHZvaWQge1xuICAgIC8vIFZhbGlkYXRlIHRoZSBlbnRpcmUgY29uZmlnIHdpdGggdXBkYXRlZCBjb21tYW5kc1xuICAgIGNvbnN0IHVwZGF0ZWRDb25maWcgPSB7IC4uLnRoaXMuY29uZmlnLCBxdWlja1N0YXJ0Q29tbWFuZHM6IGNvbW1hbmRzIH07XG4gICAgdGhpcy5jb25maWcgPSB0aGlzLnZhbGlkYXRlQ29uZmlnKHVwZGF0ZWRDb25maWcpO1xuICAgIHRoaXMuc2F2ZUNvbmZpZygpO1xuICAgIHRoaXMubm90aWZ5Q29uZmlnQ2hhbmdlKCk7XG4gIH1cblxuICBwdWJsaWMgdXBkYXRlUmVwb3NpdG9yeUJhc2VQYXRoKHBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIC8vIFZhbGlkYXRlIHRoZSBlbnRpcmUgY29uZmlnIHdpdGggdXBkYXRlZCByZXBvc2l0b3J5IGJhc2UgcGF0aFxuICAgIGNvbnN0IHVwZGF0ZWRDb25maWcgPSB7IC4uLnRoaXMuY29uZmlnLCByZXBvc2l0b3J5QmFzZVBhdGg6IHBhdGggfTtcbiAgICB0aGlzLmNvbmZpZyA9IHRoaXMudmFsaWRhdGVDb25maWcodXBkYXRlZENvbmZpZyk7XG4gICAgdGhpcy5zYXZlQ29uZmlnKCk7XG4gICAgdGhpcy5ub3RpZnlDb25maWdDaGFuZ2UoKTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRDb25maWdQYXRoKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnUGF0aDtcbiAgfVxuXG4gIHB1YmxpYyBnZXROb3RpZmljYXRpb25QcmVmZXJlbmNlcygpOiBOb3RpZmljYXRpb25QcmVmZXJlbmNlcyB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLnByZWZlcmVuY2VzPy5ub3RpZmljYXRpb25zIHx8IERFRkFVTFRfTk9USUZJQ0FUSU9OX1BSRUZFUkVOQ0VTO1xuICB9XG5cbiAgcHVibGljIHVwZGF0ZU5vdGlmaWNhdGlvblByZWZlcmVuY2VzKG5vdGlmaWNhdGlvbnM6IFBhcnRpYWw8Tm90aWZpY2F0aW9uUHJlZmVyZW5jZXM+KTogdm9pZCB7XG4gICAgLy8gVmFsaWRhdGUgdGhlIG5vdGlmaWNhdGlvbnMgb2JqZWN0XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IE5vdGlmaWNhdGlvblByZWZlcmVuY2VzU2NoZW1hID0gelxuICAgICAgICAub2JqZWN0KHtcbiAgICAgICAgICBlbmFibGVkOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBzZXNzaW9uU3RhcnQ6IHouYm9vbGVhbigpLFxuICAgICAgICAgIHNlc3Npb25FeGl0OiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBjb21tYW5kQ29tcGxldGlvbjogei5ib29sZWFuKCksXG4gICAgICAgICAgY29tbWFuZEVycm9yOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBiZWxsOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBjbGF1ZGVUdXJuOiB6LmJvb2xlYW4oKSxcbiAgICAgICAgICBzb3VuZEVuYWJsZWQ6IHouYm9vbGVhbigpLFxuICAgICAgICAgIHZpYnJhdGlvbkVuYWJsZWQ6IHouYm9vbGVhbigpLFxuICAgICAgICB9KVxuICAgICAgICAucGFydGlhbCgpO1xuXG4gICAgICBjb25zdCB2YWxpZGF0ZWROb3RpZmljYXRpb25zID0gTm90aWZpY2F0aW9uUHJlZmVyZW5jZXNTY2hlbWEucGFyc2Uobm90aWZpY2F0aW9ucyk7XG5cbiAgICAgIC8vIE1lcmdlIHdpdGggZXhpc3Rpbmcgbm90aWZpY2F0aW9ucyBvciBkZWZhdWx0c1xuICAgICAgY29uc3QgY3VycmVudE5vdGlmaWNhdGlvbnMgPVxuICAgICAgICB0aGlzLmNvbmZpZy5wcmVmZXJlbmNlcz8ubm90aWZpY2F0aW9ucyB8fCBERUZBVUxUX05PVElGSUNBVElPTl9QUkVGRVJFTkNFUztcbiAgICAgIGNvbnN0IG1lcmdlZE5vdGlmaWNhdGlvbnMgPSB7IC4uLmN1cnJlbnROb3RpZmljYXRpb25zLCAuLi52YWxpZGF0ZWROb3RpZmljYXRpb25zIH07XG5cbiAgICAgIC8vIEVuc3VyZSBwcmVmZXJlbmNlcyBvYmplY3QgZXhpc3RzXG4gICAgICBpZiAoIXRoaXMuY29uZmlnLnByZWZlcmVuY2VzKSB7XG4gICAgICAgIHRoaXMuY29uZmlnLnByZWZlcmVuY2VzID0ge1xuICAgICAgICAgIHVwZGF0ZUNoYW5uZWw6ICdzdGFibGUnLFxuICAgICAgICAgIHNob3dJbkRvY2s6IGZhbHNlLFxuICAgICAgICAgIHByZXZlbnRTbGVlcFdoZW5SdW5uaW5nOiB0cnVlLFxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICAvLyBVcGRhdGUgbm90aWZpY2F0aW9ucyB3aXRoIG1lcmdlZCB2YWx1ZXNcbiAgICAgIHRoaXMuY29uZmlnLnByZWZlcmVuY2VzLm5vdGlmaWNhdGlvbnMgPSBtZXJnZWROb3RpZmljYXRpb25zO1xuICAgICAgdGhpcy5zYXZlQ29uZmlnKCk7XG4gICAgICB0aGlzLm5vdGlmeUNvbmZpZ0NoYW5nZSgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiB6LlpvZEVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignSW52YWxpZCBub3RpZmljYXRpb24gcHJlZmVyZW5jZXM6JywgZXJyb3IuaXNzdWVzKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBJbnZhbGlkIG5vdGlmaWNhdGlvbiBwcmVmZXJlbmNlczogJHtlcnJvci5pc3N1ZXMubWFwKChlKSA9PiBlLm1lc3NhZ2UpLmpvaW4oJywgJyl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG59XG4iXX0=