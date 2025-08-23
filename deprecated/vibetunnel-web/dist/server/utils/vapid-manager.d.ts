import webpush from 'web-push';
export interface VapidKeyPair {
    publicKey: string;
    privateKey: string;
}
export interface VapidConfig {
    keyPair: VapidKeyPair;
    contactEmail: string;
    enabled: boolean;
}
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
export declare class VapidManager {
    private config;
    private readonly vapidDir;
    private readonly keysFilePath;
    constructor(vapidDir?: string);
    /**
     * Initialize VAPID configuration
     */
    initialize(options: {
        contactEmail?: string;
        publicKey?: string;
        privateKey?: string;
        generateIfMissing?: boolean;
    }): Promise<VapidConfig>;
    /**
     * Generate new VAPID key pair
     */
    generateKeys(): VapidKeyPair;
    /**
     * Rotate VAPID keys (generate new ones and save)
     */
    rotateKeys(contactEmail?: string): Promise<VapidKeyPair>;
    /**
     * Get current VAPID configuration
     */
    getConfig(): VapidConfig | null;
    /**
     * Get public key for client registration
     */
    getPublicKey(): string | null;
    /**
     * Check if VAPID is properly configured and enabled
     */
    isEnabled(): boolean;
    /**
     * Validate VAPID configuration
     */
    validateConfig(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Save VAPID keys to disk
     */
    private saveKeys;
    /**
     * Load VAPID keys from disk
     */
    private loadKeys;
    /**
     * Configure web-push library with current VAPID settings
     */
    private configureWebPush;
    /**
     * Validate email format
     */
    private isValidEmail;
    /**
     * Basic VAPID key format validation
     */
    private isValidVapidKey;
    /**
     * Get keys directory path (for external access)
     */
    getKeysDirectory(): string;
    /**
     * Remove saved keys from disk
     */
    removeKeys(): Promise<void>;
    /**
     * Send push notification using configured VAPID keys
     */
    sendNotification(subscription: webpush.PushSubscription, payload: string | Buffer | null, options?: webpush.RequestOptions): Promise<webpush.SendResult>;
}
export declare const vapidManager: VapidManager;
