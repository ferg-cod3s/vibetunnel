/**
 * HQ Client
 *
 * Manages registration of a remote VibeTunnel server with a headquarters (HQ) server.
 * This enables distributed VibeTunnel architecture where multiple remote servers can
 * connect to a central HQ server, allowing users to access terminal sessions across
 * different servers through a single entry point.
 *
 * ## Architecture Overview
 *
 * In HQ mode, VibeTunnel supports a distributed architecture:
 * - **HQ Server**: Central server that acts as a gateway and registry
 * - **Remote Servers**: Individual VibeTunnel instances that register with HQ
 * - **Session Routing**: HQ routes client requests to appropriate remote servers
 * - **WebSocket Aggregation**: HQ aggregates terminal buffers from all remotes
 *
 * ## Registration Process
 *
 * 1. Remote server starts with HQ configuration (URL, credentials, bearer token)
 * 2. HQClient generates a unique remote ID and registers with HQ
 * 3. HQ stores remote information and uses bearer token for authentication
 * 4. Remote server maintains registration until shutdown
 * 5. On shutdown, remote unregisters from HQ gracefully
 *
 * ## Authentication
 *
 * Two-way authentication is used:
 * - **Remote → HQ**: Uses HTTP Basic Auth (username/password)
 * - **HQ → Remote**: Uses Bearer token provided during registration
 *
 * ## Usage Example
 *
 * ```typescript
 * // Create HQ client for remote server
 * const hqClient = new HQClient(
 *   'https://hq.example.com',      // HQ server URL
 *   'remote-user',                 // HQ username
 *   'remote-password',             // HQ password
 *   'us-west-1',                   // Remote name
 *   'https://remote1.example.com', // This server's public URL
 *   'secret-bearer-token'          // Token for HQ to authenticate back
 * );
 *
 * // Register with HQ
 * try {
 *   await hqClient.register();
 *   console.log(`Registered as: ${hqClient.getRemoteId()}`);
 * } catch (error) {
 *   console.error('Failed to register with HQ:', error);
 * }
 *
 * // On shutdown
 * await hqClient.destroy();
 * ```
 *
 * @see web/src/server/services/remote-registry.ts for HQ-side registry
 * @see web/src/server/services/buffer-aggregator.ts for cross-server buffer streaming
 * @see web/src/server/server.ts for HQ mode initialization
 */
export declare class HQClient {
    private readonly hqUrl;
    private readonly remoteId;
    private readonly remoteName;
    private readonly token;
    private readonly hqUsername;
    private readonly hqPassword;
    private readonly remoteUrl;
    /**
     * Create a new HQ client
     *
     * @param hqUrl - Base URL of the HQ server (e.g., 'https://hq.example.com')
     * @param hqUsername - Username for authenticating with HQ (Basic Auth)
     * @param hqPassword - Password for authenticating with HQ (Basic Auth)
     * @param remoteName - Human-readable name for this remote server (e.g., 'us-west-1')
     * @param remoteUrl - Public URL of this remote server for HQ to connect back
     * @param bearerToken - Bearer token that HQ will use to authenticate with this remote
     */
    constructor(hqUrl: string, hqUsername: string, hqPassword: string, remoteName: string, remoteUrl: string, bearerToken: string);
    /**
     * Register this remote server with HQ
     *
     * Sends a registration request to the HQ server with this remote's information.
     * The HQ server will store this registration and use it to route sessions and
     * establish WebSocket connections for buffer streaming.
     *
     * Registration includes:
     * - Unique remote ID (UUID v4)
     * - Remote name for display
     * - Public URL for HQ to connect back
     * - Bearer token for HQ authentication
     *
     * @throws {Error} If registration fails (network error, auth failure, etc.)
     *
     * @example
     * ```typescript
     * try {
     *   await hqClient.register();
     *   console.log('Successfully registered with HQ');
     * } catch (error) {
     *   console.error('Registration failed:', error.message);
     *   // Implement retry logic if needed
     * }
     * ```
     */
    register(): Promise<void>;
    /**
     * Unregister from HQ and clean up
     *
     * Attempts to gracefully unregister this remote from the HQ server.
     * This should be called during shutdown to inform HQ that this remote
     * is no longer available.
     *
     * The method is designed to be safe during shutdown:
     * - Errors are logged but not thrown
     * - Timeouts are handled gracefully
     * - Always completes without blocking shutdown
     *
     * @example
     * ```typescript
     * // In shutdown handler
     * process.on('SIGTERM', async () => {
     *   await hqClient.destroy();
     *   process.exit(0);
     * });
     * ```
     */
    destroy(): Promise<void>;
    /**
     * Get the unique ID of this remote
     *
     * The remote ID is a UUID v4 generated when the HQClient is created.
     * This ID uniquely identifies this remote server in the HQ registry.
     *
     * @returns The remote's unique identifier
     */
    getRemoteId(): string;
    /**
     * Get the bearer token for this remote
     *
     * This token is provided by the remote server and given to HQ during
     * registration. HQ uses this token to authenticate when connecting
     * back to this remote (e.g., for WebSocket buffer streaming).
     *
     * @returns The bearer token for HQ authentication
     */
    getToken(): string;
    /**
     * Get the HQ server URL
     *
     * @returns The base URL of the HQ server
     */
    getHQUrl(): string;
    /**
     * Get the Authorization header value for HQ requests
     *
     * Constructs a Basic Authentication header using the HQ username and password.
     * This is used by the remote to authenticate with the HQ server.
     *
     * @returns Authorization header value (e.g., 'Basic base64credentials')
     */
    getHQAuth(): string;
    /**
     * Get the human-readable name of this remote
     *
     * The remote name is used for display purposes in HQ interfaces
     * and logs (e.g., 'us-west-1', 'europe-1', 'dev-server').
     *
     * @returns The remote's display name
     */
    getName(): string;
}
