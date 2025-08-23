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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vapidManager = exports.VapidManager = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const web_push_1 = __importDefault(require("web-push"));
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createLogger)('vapid-manager');
/**
 * Manages VAPID (Voluntary Application Server Identification) keys for web push notifications.
 *
 * This class handles the generation, storage, validation, and rotation of VAPID keys
 * used for authenticating push notifications sent from the VibeTunnel server to web clients.
 * It provides a complete lifecycle management system for VAPID credentials with secure
 * file-based persistence.
 *
 * Key features:
 * - Automatic key generation with secure storage (0600 permissions)
 * - Key rotation support for security best practices
 * - Validation of keys and email format
 * - Integration with web-push library for sending notifications
 * - Persistent storage in ~/.vibetunnel/vapid/keys.json
 *
 * @example
 * ```typescript
 * // Initialize VAPID manager with automatic key generation
 * const manager = new VapidManager();
 * const config = await manager.initialize({
 *   contactEmail: 'admin@example.com',
 *   generateIfMissing: true
 * });
 *
 * // Get public key for client registration
 * const publicKey = manager.getPublicKey();
 *
 * // Send a push notification
 * await manager.sendNotification(subscription, JSON.stringify({
 *   title: 'New Terminal Session',
 *   body: 'A new session has been created'
 * }));
 *
 * // Rotate keys for security
 * await manager.rotateKeys('admin@example.com');
 * ```
 */
class VapidManager {
    constructor(vapidDir) {
        this.config = null;
        this.vapidDir = vapidDir || path.join(os.homedir(), '.vibetunnel/vapid');
        this.keysFilePath = path.join(this.vapidDir, 'keys.json');
    }
    /**
     * Initialize VAPID configuration
     */
    async initialize(options) {
        const { contactEmail, publicKey, privateKey, generateIfMissing = true } = options;
        // If both keys provided, use them
        if (publicKey && privateKey) {
            logger.log('Using provided VAPID keys');
            this.config = {
                keyPair: { publicKey, privateKey },
                contactEmail: contactEmail || 'noreply@vibetunnel.local',
                enabled: true,
            };
            await this.saveKeys(this.config.keyPair);
            this.configureWebPush();
            return this.config;
        }
        // Try to load existing keys
        const existingKeys = await this.loadKeys();
        if (existingKeys) {
            logger.log('Using existing VAPID keys');
            this.config = {
                keyPair: existingKeys,
                contactEmail: contactEmail || 'noreply@vibetunnel.local',
                enabled: true,
            };
            this.configureWebPush();
            return this.config;
        }
        // Generate new keys if requested
        if (generateIfMissing) {
            logger.log('Generating new VAPID keys');
            const newKeys = this.generateKeys();
            this.config = {
                keyPair: newKeys,
                contactEmail: contactEmail || 'noreply@vibetunnel.local',
                enabled: true,
            };
            await this.saveKeys(this.config.keyPair);
            this.configureWebPush();
            return this.config;
        }
        // No keys available and not generating
        logger.warn('No VAPID keys available and generation disabled');
        this.config = {
            keyPair: { publicKey: '', privateKey: '' },
            contactEmail: contactEmail || 'noreply@vibetunnel.local',
            enabled: false,
        };
        return this.config;
    }
    /**
     * Generate new VAPID key pair
     */
    generateKeys() {
        logger.debug('Generating VAPID key pair');
        const keyPair = web_push_1.default.generateVAPIDKeys();
        return {
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
        };
    }
    /**
     * Rotate VAPID keys (generate new ones and save)
     */
    async rotateKeys(contactEmail) {
        logger.log('Rotating VAPID keys');
        const newKeys = this.generateKeys();
        // Update config
        this.config = {
            keyPair: newKeys,
            contactEmail: contactEmail || this.config?.contactEmail || 'noreply@vibetunnel.local',
            enabled: true,
        };
        await this.saveKeys(newKeys);
        this.configureWebPush();
        logger.log('VAPID keys rotated successfully');
        return newKeys;
    }
    /**
     * Get current VAPID configuration
     */
    getConfig() {
        return this.config;
    }
    /**
     * Get public key for client registration
     */
    getPublicKey() {
        return this.config?.keyPair.publicKey || null;
    }
    /**
     * Check if VAPID is properly configured and enabled
     */
    isEnabled() {
        return (this.config?.enabled === true &&
            !!this.config.keyPair.publicKey &&
            !!this.config.keyPair.privateKey);
    }
    /**
     * Validate VAPID configuration
     */
    validateConfig() {
        const errors = [];
        if (!this.config) {
            errors.push('VAPID manager not initialized');
            return { valid: false, errors };
        }
        if (!this.config.keyPair.publicKey) {
            errors.push('Missing VAPID public key');
        }
        if (!this.config.keyPair.privateKey) {
            errors.push('Missing VAPID private key');
        }
        if (!this.config.contactEmail) {
            errors.push('Missing contact email for VAPID');
        }
        // Validate email format
        if (this.config.contactEmail && !this.isValidEmail(this.config.contactEmail)) {
            errors.push('Invalid contact email format');
        }
        // Validate key format (basic check)
        if (this.config.keyPair.publicKey && !this.isValidVapidKey(this.config.keyPair.publicKey)) {
            errors.push('Invalid VAPID public key format');
        }
        if (this.config.keyPair.privateKey && !this.isValidVapidKey(this.config.keyPair.privateKey)) {
            errors.push('Invalid VAPID private key format');
        }
        return { valid: errors.length === 0, errors };
    }
    /**
     * Save VAPID keys to disk
     */
    async saveKeys(keyPair) {
        try {
            // Ensure directory exists
            if (!fs.existsSync(this.vapidDir)) {
                fs.mkdirSync(this.vapidDir, { recursive: true });
                logger.debug(`Created VAPID directory: ${this.vapidDir}`);
            }
            const keyData = {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                generated: new Date().toISOString(),
            };
            fs.writeFileSync(this.keysFilePath, JSON.stringify(keyData, null, 2), {
                mode: 0o600, // Restrict access to owner only
            });
            logger.debug('VAPID keys saved to disk');
        }
        catch (error) {
            logger.error('Failed to save VAPID keys:', error);
            throw new Error(`Failed to save VAPID keys: ${error}`);
        }
    }
    /**
     * Load VAPID keys from disk
     */
    async loadKeys() {
        try {
            if (!fs.existsSync(this.keysFilePath)) {
                logger.debug('No existing VAPID keys file found');
                return null;
            }
            const keyData = JSON.parse(fs.readFileSync(this.keysFilePath, 'utf8'));
            if (!keyData.publicKey || !keyData.privateKey) {
                logger.warn('Invalid VAPID keys file format');
                return null;
            }
            logger.debug('VAPID keys loaded from disk');
            return {
                publicKey: keyData.publicKey,
                privateKey: keyData.privateKey,
            };
        }
        catch (error) {
            logger.error('Failed to load VAPID keys:', error);
            return null;
        }
    }
    /**
     * Configure web-push library with current VAPID settings
     */
    configureWebPush() {
        if (!this.config || !this.isEnabled()) {
            logger.debug('Skipping web-push configuration - VAPID not enabled');
            return;
        }
        try {
            web_push_1.default.setVapidDetails(`mailto:${this.config.contactEmail}`, this.config.keyPair.publicKey, this.config.keyPair.privateKey);
            logger.debug('Web-push library configured with VAPID details');
        }
        catch (error) {
            logger.error('Failed to configure web-push library:', error);
            throw new Error(`Failed to configure web-push: ${error}`);
        }
    }
    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    /**
     * Basic VAPID key format validation
     */
    isValidVapidKey(key) {
        // VAPID keys are base64url encoded and typically 65 characters for public keys
        // and 43 characters for private keys
        return typeof key === 'string' && key.length > 20 && /^[A-Za-z0-9_-]+$/.test(key);
    }
    /**
     * Get keys directory path (for external access)
     */
    getKeysDirectory() {
        return this.vapidDir;
    }
    /**
     * Remove saved keys from disk
     */
    async removeKeys() {
        try {
            if (fs.existsSync(this.keysFilePath)) {
                fs.unlinkSync(this.keysFilePath);
                logger.log('VAPID keys removed from disk');
            }
            this.config = null;
        }
        catch (error) {
            logger.error('Failed to remove VAPID keys:', error);
            throw new Error(`Failed to remove VAPID keys: ${error}`);
        }
    }
    /**
     * Send push notification using configured VAPID keys
     */
    async sendNotification(subscription, payload, options) {
        if (!this.isEnabled()) {
            throw new Error('VAPID not properly configured');
        }
        try {
            return await web_push_1.default.sendNotification(subscription, payload, options);
        }
        catch (error) {
            logger.error('Failed to send push notification:', error);
            throw error;
        }
    }
}
exports.VapidManager = VapidManager;
// Export singleton instance
exports.vapidManager = new VapidManager();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFwaWQtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvdXRpbHMvdmFwaWQtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsdUNBQXlCO0FBQ3pCLDJDQUE2QjtBQUM3Qix3REFBK0I7QUFDL0IsMkNBQTJDO0FBRTNDLE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxlQUFlLENBQUMsQ0FBQztBQWE3Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBb0NHO0FBQ0gsTUFBYSxZQUFZO0lBS3ZCLFlBQVksUUFBaUI7UUFKckIsV0FBTSxHQUF1QixJQUFJLENBQUM7UUFLeEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsVUFBVSxDQUFDLE9BS2hCO1FBQ0MsTUFBTSxFQUFFLFlBQVksRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixHQUFHLElBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUVsRixrQ0FBa0M7UUFDbEMsSUFBSSxTQUFTLElBQUksVUFBVSxFQUFFLENBQUM7WUFDNUIsTUFBTSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxNQUFNLEdBQUc7Z0JBQ1osT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRTtnQkFDbEMsWUFBWSxFQUFFLFlBQVksSUFBSSwwQkFB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QUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDekQsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBblRELG9DQW1UQztBQUVELDRCQUE0QjtBQUNmLFFBQUEsWUFBWSxHQUFHLElBQUksWUFBWSxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHdlYnB1c2ggZnJvbSAnd2ViLXB1c2gnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2dnZXIgPSBjcmVhdGVMb2dnZXIoJ3ZhcGlkLW1hbmFnZXInKTtcblxuZXhwb3J0IGludGVyZmFjZSBWYXBpZEtleVBhaXIge1xuICBwdWJsaWNLZXk6IHN0cmluZztcbiAgcHJpdmF0ZUtleTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZhcGlkQ29uZmlnIHtcbiAga2V5UGFpcjogVmFwaWRLZXlQYWlyO1xuICBjb250YWN0RW1haWw6IHN0cmluZztcbiAgZW5hYmxlZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIFZBUElEIChWb2x1bnRhcnkgQXBwbGljYXRpb24gU2VydmVyIElkZW50aWZpY2F0aW9uKSBrZXlzIGZvciB3ZWIgcHVzaCBub3RpZmljYXRpb25zLlxuICpcbiAqIFRoaXMgY2xhc3MgaGFuZGxlcyB0aGUgZ2VuZXJhdGlvbiwgc3RvcmFnZSwgdmFsaWRhdGlvbiwgYW5kIHJvdGF0aW9uIG9mIFZBUElEIGtleXNcbiAqIHVzZWQgZm9yIGF1dGhlbnRpY2F0aW5nIHB1c2ggbm90aWZpY2F0aW9ucyBzZW50IGZyb20gdGhlIFZpYmVUdW5uZWwgc2VydmVyIHRvIHdlYiBjbGllbnRzLlxuICogSXQgcHJvdmlkZXMgYSBjb21wbGV0ZSBsaWZlY3ljbGUgbWFuYWdlbWVudCBzeXN0ZW0gZm9yIFZBUElEIGNyZWRlbnRpYWxzIHdpdGggc2VjdXJlXG4gKiBmaWxlLWJhc2VkIHBlcnNpc3RlbmNlLlxuICpcbiAqIEtleSBmZWF0dXJlczpcbiAqIC0gQXV0b21hdGljIGtleSBnZW5lcmF0aW9uIHdpdGggc2VjdXJlIHN0b3JhZ2UgKDA2MDAgcGVybWlzc2lvbnMpXG4gKiAtIEtleSByb3RhdGlvbiBzdXBwb3J0IGZvciBzZWN1cml0eSBiZXN0IHByYWN0aWNlc1xuICogLSBWYWxpZGF0aW9uIG9mIGtleXMgYW5kIGVtYWlsIGZvcm1hdFxuICogLSBJbnRlZ3JhdGlvbiB3aXRoIHdlYi1wdXNoIGxpYnJhcnkgZm9yIHNlbmRpbmcgbm90aWZpY2F0aW9uc1xuICogLSBQZXJzaXN0ZW50IHN0b3JhZ2UgaW4gfi8udmliZXR1bm5lbC92YXBpZC9rZXlzLmpzb25cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogLy8gSW5pdGlhbGl6ZSBWQVBJRCBtYW5hZ2VyIHdpdGggYXV0b21hdGljIGtleSBnZW5lcmF0aW9uXG4gKiBjb25zdCBtYW5hZ2VyID0gbmV3IFZhcGlkTWFuYWdlcigpO1xuICogY29uc3QgY29uZmlnID0gYXdhaXQgbWFuYWdlci5pbml0aWFsaXplKHtcbiAqICAgY29udGFjdEVtYWlsOiAnYWRtaW5AZXhhbXBsZS5jb20nLFxuICogICBnZW5lcmF0ZUlmTWlzc2luZzogdHJ1ZVxuICogfSk7XG4gKlxuICogLy8gR2V0IHB1YmxpYyBrZXkgZm9yIGNsaWVudCByZWdpc3RyYXRpb25cbiAqIGNvbnN0IHB1YmxpY0tleSA9IG1hbmFnZXIuZ2V0UHVibGljS2V5KCk7XG4gKlxuICogLy8gU2VuZCBhIHB1c2ggbm90aWZpY2F0aW9uXG4gKiBhd2FpdCBtYW5hZ2VyLnNlbmROb3RpZmljYXRpb24oc3Vic2NyaXB0aW9uLCBKU09OLnN0cmluZ2lmeSh7XG4gKiAgIHRpdGxlOiAnTmV3IFRlcm1pbmFsIFNlc3Npb24nLFxuICogICBib2R5OiAnQSBuZXcgc2Vzc2lvbiBoYXMgYmVlbiBjcmVhdGVkJ1xuICogfSkpO1xuICpcbiAqIC8vIFJvdGF0ZSBrZXlzIGZvciBzZWN1cml0eVxuICogYXdhaXQgbWFuYWdlci5yb3RhdGVLZXlzKCdhZG1pbkBleGFtcGxlLmNvbScpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBWYXBpZE1hbmFnZXIge1xuICBwcml2YXRlIGNvbmZpZzogVmFwaWRDb25maWcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSByZWFkb25seSB2YXBpZERpcjogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IGtleXNGaWxlUGF0aDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHZhcGlkRGlyPzogc3RyaW5nKSB7XG4gICAgdGhpcy52YXBpZERpciA9IHZhcGlkRGlyIHx8IHBhdGguam9pbihvcy5ob21lZGlyKCksICcudmliZXR1bm5lbC92YXBpZCcpO1xuICAgIHRoaXMua2V5c0ZpbGVQYXRoID0gcGF0aC5qb2luKHRoaXMudmFwaWREaXIsICdrZXlzLmpzb24nKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbml0aWFsaXplIFZBUElEIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGFzeW5jIGluaXRpYWxpemUob3B0aW9uczoge1xuICAgIGNvbnRhY3RFbWFpbD86IHN0cmluZztcbiAgICBwdWJsaWNLZXk/OiBzdHJpbmc7XG4gICAgcHJpdmF0ZUtleT86IHN0cmluZztcbiAgICBnZW5lcmF0ZUlmTWlzc2luZz86IGJvb2xlYW47XG4gIH0pOiBQcm9taXNlPFZhcGlkQ29uZmlnPiB7XG4gICAgY29uc3QgeyBjb250YWN0RW1haWwsIHB1YmxpY0tleSwgcHJpdmF0ZUtleSwgZ2VuZXJhdGVJZk1pc3NpbmcgPSB0cnVlIH0gPSBvcHRpb25zO1xuXG4gICAgLy8gSWYgYm90aCBrZXlzIHByb3ZpZGVkLCB1c2UgdGhlbVxuICAgIGlmIChwdWJsaWNLZXkgJiYgcHJpdmF0ZUtleSkge1xuICAgICAgbG9nZ2VyLmxvZygnVXNpbmcgcHJvdmlkZWQgVkFQSUQga2V5cycpO1xuICAgICAgdGhpcy5jb25maWcgPSB7XG4gICAgICAgIGtleVBhaXI6IHsgcHVibGljS2V5LCBwcml2YXRlS2V5IH0sXG4gICAgICAgIGNvbnRhY3RFbWFpbDogY29udGFjdEVtYWlsIHx8ICdub3JlcGx5QHZpYmV0dW5uZWwubG9jYWwnLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZUtleXModGhpcy5jb25maWcua2V5UGFpcik7XG4gICAgICB0aGlzLmNvbmZpZ3VyZVdlYlB1c2goKTtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZztcbiAgICB9XG5cbiAgICAvLyBUcnkgdG8gbG9hZCBleGlzdGluZyBrZXlzXG4gICAgY29uc3QgZXhpc3RpbmdLZXlzID0gYXdhaXQgdGhpcy5sb2FkS2V5cygpO1xuICAgIGlmIChleGlzdGluZ0tleXMpIHtcbiAgICAgIGxvZ2dlci5sb2coJ1VzaW5nIGV4aXN0aW5nIFZBUElEIGtleXMnKTtcbiAgICAgIHRoaXMuY29uZmlnID0ge1xuICAgICAgICBrZXlQYWlyOiBleGlzdGluZ0tleXMsXG4gICAgICAgIGNvbnRhY3RFbWFpbDogY29udGFjdEVtYWlsIHx8ICdub3JlcGx5QHZpYmV0dW5uZWwubG9jYWwnLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgfTtcbiAgICAgIHRoaXMuY29uZmlndXJlV2ViUHVzaCgpO1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIG5ldyBrZXlzIGlmIHJlcXVlc3RlZFxuICAgIGlmIChnZW5lcmF0ZUlmTWlzc2luZykge1xuICAgICAgbG9nZ2VyLmxvZygnR2VuZXJhdGluZyBuZXcgVkFQSUQga2V5cycpO1xuICAgICAgY29uc3QgbmV3S2V5cyA9IHRoaXMuZ2VuZXJhdGVLZXlzKCk7XG4gICAgICB0aGlzLmNvbmZpZyA9IHtcbiAgICAgICAga2V5UGFpcjogbmV3S2V5cyxcbiAgICAgICAgY29udGFjdEVtYWlsOiBjb250YWN0RW1haWwgfHwgJ25vcmVwbHlAdmliZXR1bm5lbC5sb2NhbCcsXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICB9O1xuICAgICAgYXdhaXQgdGhpcy5zYXZlS2V5cyh0aGlzLmNvbmZpZy5rZXlQYWlyKTtcbiAgICAgIHRoaXMuY29uZmlndXJlV2ViUHVzaCgpO1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnO1xuICAgIH1cblxuICAgIC8vIE5vIGtleXMgYXZhaWxhYmxlIGFuZCBub3QgZ2VuZXJhdGluZ1xuICAgIGxvZ2dlci53YXJuKCdObyBWQVBJRCBrZXlzIGF2YWlsYWJsZSBhbmQgZ2VuZXJhdGlvbiBkaXNhYmxlZCcpO1xuICAgIHRoaXMuY29uZmlnID0ge1xuICAgICAga2V5UGFpcjogeyBwdWJsaWNLZXk6ICcnLCBwcml2YXRlS2V5OiAnJyB9LFxuICAgICAgY29udGFjdEVtYWlsOiBjb250YWN0RW1haWwgfHwgJ25vcmVwbHlAdmliZXR1bm5lbC5sb2NhbCcsXG4gICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICB9O1xuICAgIHJldHVybiB0aGlzLmNvbmZpZztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSBuZXcgVkFQSUQga2V5IHBhaXJcbiAgICovXG4gIGdlbmVyYXRlS2V5cygpOiBWYXBpZEtleVBhaXIge1xuICAgIGxvZ2dlci5kZWJ1ZygnR2VuZXJhdGluZyBWQVBJRCBrZXkgcGFpcicpO1xuICAgIGNvbnN0IGtleVBhaXIgPSB3ZWJwdXNoLmdlbmVyYXRlVkFQSURLZXlzKCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHB1YmxpY0tleToga2V5UGFpci5wdWJsaWNLZXksXG4gICAgICBwcml2YXRlS2V5OiBrZXlQYWlyLnByaXZhdGVLZXksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSb3RhdGUgVkFQSUQga2V5cyAoZ2VuZXJhdGUgbmV3IG9uZXMgYW5kIHNhdmUpXG4gICAqL1xuICBhc3luYyByb3RhdGVLZXlzKGNvbnRhY3RFbWFpbD86IHN0cmluZyk6IFByb21pc2U8VmFwaWRLZXlQYWlyPiB7XG4gICAgbG9nZ2VyLmxvZygnUm90YXRpbmcgVkFQSUQga2V5cycpO1xuICAgIGNvbnN0IG5ld0tleXMgPSB0aGlzLmdlbmVyYXRlS2V5cygpO1xuXG4gICAgLy8gVXBkYXRlIGNvbmZpZ1xuICAgIHRoaXMuY29uZmlnID0ge1xuICAgICAga2V5UGFpcjogbmV3S2V5cyxcbiAgICAgIGNvbnRhY3RFbWFpbDogY29udGFjdEVtYWlsIHx8IHRoaXMuY29uZmlnPy5jb250YWN0RW1haWwgfHwgJ25vcmVwbHlAdmliZXR1bm5lbC5sb2NhbCcsXG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgIH07XG5cbiAgICBhd2FpdCB0aGlzLnNhdmVLZXlzKG5ld0tleXMpO1xuICAgIHRoaXMuY29uZmlndXJlV2ViUHVzaCgpO1xuXG4gICAgbG9nZ2VyLmxvZygnVkFQSUQga2V5cyByb3RhdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIHJldHVybiBuZXdLZXlzO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjdXJyZW50IFZBUElEIGNvbmZpZ3VyYXRpb25cbiAgICovXG4gIGdldENvbmZpZygpOiBWYXBpZENvbmZpZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcHVibGljIGtleSBmb3IgY2xpZW50IHJlZ2lzdHJhdGlvblxuICAgKi9cbiAgZ2V0UHVibGljS2V5KCk6IHN0cmluZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZz8ua2V5UGFpci5wdWJsaWNLZXkgfHwgbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBWQVBJRCBpcyBwcm9wZXJseSBjb25maWd1cmVkIGFuZCBlbmFibGVkXG4gICAqL1xuICBpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY29uZmlnPy5lbmFibGVkID09PSB0cnVlICYmXG4gICAgICAhIXRoaXMuY29uZmlnLmtleVBhaXIucHVibGljS2V5ICYmXG4gICAgICAhIXRoaXMuY29uZmlnLmtleVBhaXIucHJpdmF0ZUtleVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGUgVkFQSUQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgdmFsaWRhdGVDb25maWcoKTogeyB2YWxpZDogYm9vbGVhbjsgZXJyb3JzOiBzdHJpbmdbXSB9IHtcbiAgICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAoIXRoaXMuY29uZmlnKSB7XG4gICAgICBlcnJvcnMucHVzaCgnVkFQSUQgbWFuYWdlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgIHJldHVybiB7IHZhbGlkOiBmYWxzZSwgZXJyb3JzIH07XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmNvbmZpZy5rZXlQYWlyLnB1YmxpY0tleSkge1xuICAgICAgZXJyb3JzLnB1c2goJ01pc3NpbmcgVkFQSUQgcHVibGljIGtleScpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5jb25maWcua2V5UGFpci5wcml2YXRlS2V5KSB7XG4gICAgICBlcnJvcnMucHVzaCgnTWlzc2luZyBWQVBJRCBwcml2YXRlIGtleScpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5jb25maWcuY29udGFjdEVtYWlsKSB7XG4gICAgICBlcnJvcnMucHVzaCgnTWlzc2luZyBjb250YWN0IGVtYWlsIGZvciBWQVBJRCcpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVtYWlsIGZvcm1hdFxuICAgIGlmICh0aGlzLmNvbmZpZy5jb250YWN0RW1haWwgJiYgIXRoaXMuaXNWYWxpZEVtYWlsKHRoaXMuY29uZmlnLmNvbnRhY3RFbWFpbCkpIHtcbiAgICAgIGVycm9ycy5wdXNoKCdJbnZhbGlkIGNvbnRhY3QgZW1haWwgZm9ybWF0Jyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUga2V5IGZvcm1hdCAoYmFzaWMgY2hlY2spXG4gICAgaWYgKHRoaXMuY29uZmlnLmtleVBhaXIucHVibGljS2V5ICYmICF0aGlzLmlzVmFsaWRWYXBpZEtleSh0aGlzLmNvbmZpZy5rZXlQYWlyLnB1YmxpY0tleSkpIHtcbiAgICAgIGVycm9ycy5wdXNoKCdJbnZhbGlkIFZBUElEIHB1YmxpYyBrZXkgZm9ybWF0Jyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuY29uZmlnLmtleVBhaXIucHJpdmF0ZUtleSAmJiAhdGhpcy5pc1ZhbGlkVmFwaWRLZXkodGhpcy5jb25maWcua2V5UGFpci5wcml2YXRlS2V5KSkge1xuICAgICAgZXJyb3JzLnB1c2goJ0ludmFsaWQgVkFQSUQgcHJpdmF0ZSBrZXkgZm9ybWF0Jyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgdmFsaWQ6IGVycm9ycy5sZW5ndGggPT09IDAsIGVycm9ycyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNhdmUgVkFQSUQga2V5cyB0byBkaXNrXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIHNhdmVLZXlzKGtleVBhaXI6IFZhcGlkS2V5UGFpcik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAvLyBFbnN1cmUgZGlyZWN0b3J5IGV4aXN0c1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHRoaXMudmFwaWREaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyh0aGlzLnZhcGlkRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKGBDcmVhdGVkIFZBUElEIGRpcmVjdG9yeTogJHt0aGlzLnZhcGlkRGlyfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBrZXlEYXRhID0ge1xuICAgICAgICBwdWJsaWNLZXk6IGtleVBhaXIucHVibGljS2V5LFxuICAgICAgICBwcml2YXRlS2V5OiBrZXlQYWlyLnByaXZhdGVLZXksXG4gICAgICAgIGdlbmVyYXRlZDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfTtcblxuICAgICAgZnMud3JpdGVGaWxlU3luYyh0aGlzLmtleXNGaWxlUGF0aCwgSlNPTi5zdHJpbmdpZnkoa2V5RGF0YSwgbnVsbCwgMiksIHtcbiAgICAgICAgbW9kZTogMG82MDAsIC8vIFJlc3RyaWN0IGFjY2VzcyB0byBvd25lciBvbmx5XG4gICAgICB9KTtcblxuICAgICAgbG9nZ2VyLmRlYnVnKCdWQVBJRCBrZXlzIHNhdmVkIHRvIGRpc2snKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBWQVBJRCBrZXlzOicsIGVycm9yKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHNhdmUgVkFQSUQga2V5czogJHtlcnJvcn1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTG9hZCBWQVBJRCBrZXlzIGZyb20gZGlza1xuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBsb2FkS2V5cygpOiBQcm9taXNlPFZhcGlkS2V5UGFpciB8IG51bGw+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKHRoaXMua2V5c0ZpbGVQYXRoKSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ05vIGV4aXN0aW5nIFZBUElEIGtleXMgZmlsZSBmb3VuZCcpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3Qga2V5RGF0YSA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHRoaXMua2V5c0ZpbGVQYXRoLCAndXRmOCcpKTtcblxuICAgICAgaWYgKCFrZXlEYXRhLnB1YmxpY0tleSB8fCAha2V5RGF0YS5wcml2YXRlS2V5KSB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdJbnZhbGlkIFZBUElEIGtleXMgZmlsZSBmb3JtYXQnKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZygnVkFQSUQga2V5cyBsb2FkZWQgZnJvbSBkaXNrJyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBwdWJsaWNLZXk6IGtleURhdGEucHVibGljS2V5LFxuICAgICAgICBwcml2YXRlS2V5OiBrZXlEYXRhLnByaXZhdGVLZXksXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIFZBUElEIGtleXM6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIENvbmZpZ3VyZSB3ZWItcHVzaCBsaWJyYXJ5IHdpdGggY3VycmVudCBWQVBJRCBzZXR0aW5nc1xuICAgKi9cbiAgcHJpdmF0ZSBjb25maWd1cmVXZWJQdXNoKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5jb25maWcgfHwgIXRoaXMuaXNFbmFibGVkKCkpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnU2tpcHBpbmcgd2ViLXB1c2ggY29uZmlndXJhdGlvbiAtIFZBUElEIG5vdCBlbmFibGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIHdlYnB1c2guc2V0VmFwaWREZXRhaWxzKFxuICAgICAgICBgbWFpbHRvOiR7dGhpcy5jb25maWcuY29udGFjdEVtYWlsfWAsXG4gICAgICAgIHRoaXMuY29uZmlnLmtleVBhaXIucHVibGljS2V5LFxuICAgICAgICB0aGlzLmNvbmZpZy5rZXlQYWlyLnByaXZhdGVLZXlcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZGVidWcoJ1dlYi1wdXNoIGxpYnJhcnkgY29uZmlndXJlZCB3aXRoIFZBUElEIGRldGFpbHMnKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gY29uZmlndXJlIHdlYi1wdXNoIGxpYnJhcnk6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY29uZmlndXJlIHdlYi1wdXNoOiAke2Vycm9yfWApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSBlbWFpbCBmb3JtYXRcbiAgICovXG4gIHByaXZhdGUgaXNWYWxpZEVtYWlsKGVtYWlsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBlbWFpbFJlZ2V4ID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gICAgcmV0dXJuIGVtYWlsUmVnZXgudGVzdChlbWFpbCk7XG4gIH1cblxuICAvKipcbiAgICogQmFzaWMgVkFQSUQga2V5IGZvcm1hdCB2YWxpZGF0aW9uXG4gICAqL1xuICBwcml2YXRlIGlzVmFsaWRWYXBpZEtleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIC8vIFZBUElEIGtleXMgYXJlIGJhc2U2NHVybCBlbmNvZGVkIGFuZCB0eXBpY2FsbHkgNjUgY2hhcmFjdGVycyBmb3IgcHVibGljIGtleXNcbiAgICAvLyBhbmQgNDMgY2hhcmFjdGVycyBmb3IgcHJpdmF0ZSBrZXlzXG4gICAgcmV0dXJuIHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnICYmIGtleS5sZW5ndGggPiAyMCAmJiAvXltBLVphLXowLTlfLV0rJC8udGVzdChrZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBrZXlzIGRpcmVjdG9yeSBwYXRoIChmb3IgZXh0ZXJuYWwgYWNjZXNzKVxuICAgKi9cbiAgZ2V0S2V5c0RpcmVjdG9yeSgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLnZhcGlkRGlyO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBzYXZlZCBrZXlzIGZyb20gZGlza1xuICAgKi9cbiAgYXN5bmMgcmVtb3ZlS2V5cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cnkge1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmModGhpcy5rZXlzRmlsZVBhdGgpKSB7XG4gICAgICAgIGZzLnVubGlua1N5bmModGhpcy5rZXlzRmlsZVBhdGgpO1xuICAgICAgICBsb2dnZXIubG9nKCdWQVBJRCBrZXlzIHJlbW92ZWQgZnJvbSBkaXNrJyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuY29uZmlnID0gbnVsbDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gcmVtb3ZlIFZBUElEIGtleXM6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmVtb3ZlIFZBUElEIGtleXM6ICR7ZXJyb3J9YCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgcHVzaCBub3RpZmljYXRpb24gdXNpbmcgY29uZmlndXJlZCBWQVBJRCBrZXlzXG4gICAqL1xuICBhc3luYyBzZW5kTm90aWZpY2F0aW9uKFxuICAgIHN1YnNjcmlwdGlvbjogd2VicHVzaC5QdXNoU3Vic2NyaXB0aW9uLFxuICAgIHBheWxvYWQ6IHN0cmluZyB8IEJ1ZmZlciB8IG51bGwsXG4gICAgb3B0aW9ucz86IHdlYnB1c2guUmVxdWVzdE9wdGlvbnNcbiAgKTogUHJvbWlzZTx3ZWJwdXNoLlNlbmRSZXN1bHQ+IHtcbiAgICBpZiAoIXRoaXMuaXNFbmFibGVkKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVkFQSUQgbm90IHByb3Blcmx5IGNvbmZpZ3VyZWQnKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGF3YWl0IHdlYnB1c2guc2VuZE5vdGlmaWNhdGlvbihzdWJzY3JpcHRpb24sIHBheWxvYWQsIG9wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHB1c2ggbm90aWZpY2F0aW9uOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxufVxuXG4vLyBFeHBvcnQgc2luZ2xldG9uIGluc3RhbmNlXG5leHBvcnQgY29uc3QgdmFwaWRNYW5hZ2VyID0gbmV3IFZhcGlkTWFuYWdlcigpO1xuIl19