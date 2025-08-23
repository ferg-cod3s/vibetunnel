"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HQClient = void 0;
const chalk_1 = __importDefault(require("chalk"));
const uuid_1 = require("uuid");
const types_js_1 = require("../../shared/types.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('hq-client');
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
class HQClient {
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
    constructor(hqUrl, hqUsername, hqPassword, remoteName, remoteUrl, bearerToken) {
        this.hqUrl = hqUrl;
        this.remoteId = (0, uuid_1.v4)();
        this.remoteName = remoteName;
        this.token = bearerToken;
        this.hqUsername = hqUsername;
        this.hqPassword = hqPassword;
        this.remoteUrl = remoteUrl;
        logger.debug('hq client initialized', {
            hqUrl,
            remoteName,
            remoteId: this.remoteId,
            remoteUrl,
        });
    }
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
    async register() {
        logger.log(`registering with hq at ${this.hqUrl}`);
        try {
            const response = await fetch(`${this.hqUrl}/api/remotes/register`, {
                method: types_js_1.HttpMethod.POST,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${this.hqUsername}:${this.hqPassword}`).toString('base64')}`,
                },
                body: JSON.stringify({
                    id: this.remoteId,
                    name: this.remoteName,
                    url: this.remoteUrl,
                    token: this.token, // Token for HQ to authenticate with this remote
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`registration failed with status ${response.status}: ${errorText}`);
                logger.debug('registration request details:', {
                    url: `${this.hqUrl}/api/remotes/register`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Basic ${Buffer.from(`${this.hqUsername}:${this.hqPassword}`).toString('base64')}`,
                    },
                    body: {
                        id: this.remoteId,
                        name: this.remoteName,
                        url: this.remoteUrl,
                        token: `${this.token.substring(0, 8)}...`,
                    },
                });
                throw new Error(`Registration failed (${response.status}): ${errorText}`);
            }
            logger.log(chalk_1.default.green(`successfully registered with hq: ${this.remoteName} (${this.remoteId})`) +
                chalk_1.default.gray(` at ${this.hqUrl}`));
            logger.debug('registration details', {
                remoteId: this.remoteId,
                remoteName: this.remoteName,
                token: `${this.token.substring(0, 8)}...`,
            });
        }
        catch (error) {
            logger.error('failed to register with hq:', error);
            throw error; // Let the caller handle retries if needed
        }
    }
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
    async destroy() {
        logger.log(chalk_1.default.yellow(`unregistering from hq: ${this.remoteName} (${this.remoteId})`));
        try {
            // Try to unregister
            const response = await fetch(`${this.hqUrl}/api/remotes/${this.remoteId}`, {
                method: types_js_1.HttpMethod.DELETE,
                headers: {
                    Authorization: `Basic ${Buffer.from(`${this.hqUsername}:${this.hqPassword}`).toString('base64')}`,
                },
            });
            if (response.ok) {
                logger.debug('successfully unregistered from hq');
            }
            else {
                logger.debug(`unregistration returned status ${response.status}`);
            }
        }
        catch (error) {
            // Log but don't throw during shutdown
            logger.debug('error during unregistration:', error);
        }
    }
    /**
     * Get the unique ID of this remote
     *
     * The remote ID is a UUID v4 generated when the HQClient is created.
     * This ID uniquely identifies this remote server in the HQ registry.
     *
     * @returns The remote's unique identifier
     */
    getRemoteId() {
        return this.remoteId;
    }
    /**
     * Get the bearer token for this remote
     *
     * This token is provided by the remote server and given to HQ during
     * registration. HQ uses this token to authenticate when connecting
     * back to this remote (e.g., for WebSocket buffer streaming).
     *
     * @returns The bearer token for HQ authentication
     */
    getToken() {
        return this.token;
    }
    /**
     * Get the HQ server URL
     *
     * @returns The base URL of the HQ server
     */
    getHQUrl() {
        return this.hqUrl;
    }
    /**
     * Get the Authorization header value for HQ requests
     *
     * Constructs a Basic Authentication header using the HQ username and password.
     * This is used by the remote to authenticate with the HQ server.
     *
     * @returns Authorization header value (e.g., 'Basic base64credentials')
     */
    getHQAuth() {
        const credentials = Buffer.from(`${this.hqUsername}:${this.hqPassword}`).toString('base64');
        return `Basic ${credentials}`;
    }
    /**
     * Get the human-readable name of this remote
     *
     * The remote name is used for display purposes in HQ interfaces
     * and logs (e.g., 'us-west-1', 'europe-1', 'dev-server').
     *
     * @returns The remote's display name
     */
    getName() {
        return this.remoteName;
    }
}
exports.HQClient = HQClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHEtY2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9ocS1jbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsa0RBQTBCO0FBQzFCLCtCQUFvQztBQUNwQyxvREFBbUQ7QUFDbkQsa0RBQWtEO0FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxXQUFXLENBQUMsQ0FBQztBQUV6Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTBERztBQUNILE1BQWEsUUFBUTtJQVNuQjs7Ozs7Ozs7O09BU0c7SUFDSCxZQUNFLEtBQWEsRUFDYixVQUFrQixFQUNsQixVQUFrQixFQUNsQixVQUFrQixFQUNsQixTQUFpQixFQUNqQixXQUFtQjtRQUVuQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUEsU0FBTSxHQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUM7UUFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFFM0IsTUFBTSxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRTtZQUNwQyxLQUFLO1lBQ0wsVUFBVTtZQUNWLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixTQUFTO1NBQ1YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BeUJHO0lBQ0gsS0FBSyxDQUFDLFFBQVE7UUFDWixNQUFNLENBQUMsR0FBRyxDQUFDLDBCQUEwQixJQUFJLENBQUMs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Q0gsU0FBUztRQUNQLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RixPQUFPLFNBQVMsV0FBVyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSCxPQUFPO1FBQ0wsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDO0lBQ3pCLENBQUM7Q0FDRjtBQS9ORCw0QkErTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgeyBIdHRwTWV0aG9kIH0gZnJvbSAnLi4vLi4vc2hhcmVkL3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignaHEtY2xpZW50Jyk7XG5cbi8qKlxuICogSFEgQ2xpZW50XG4gKlxuICogTWFuYWdlcyByZWdpc3RyYXRpb24gb2YgYSByZW1vdGUgVmliZVR1bm5lbCBzZXJ2ZXIgd2l0aCBhIGhlYWRxdWFydGVycyAoSFEpIHNlcnZlci5cbiAqIFRoaXMgZW5hYmxlcyBkaXN0cmlidXRlZCBWaWJlVHVubmVsIGFyY2hpdGVjdHVyZSB3aGVyZSBtdWx0aXBsZSByZW1vdGUgc2VydmVycyBjYW5cbiAqIGNvbm5lY3QgdG8gYSBjZW50cmFsIEhRIHNlcnZlciwgYWxsb3dpbmcgdXNlcnMgdG8gYWNjZXNzIHRlcm1pbmFsIHNlc3Npb25zIGFjcm9zc1xuICogZGlmZmVyZW50IHNlcnZlcnMgdGhyb3VnaCBhIHNpbmdsZSBlbnRyeSBwb2ludC5cbiAqXG4gKiAjIyBBcmNoaXRlY3R1cmUgT3ZlcnZpZXdcbiAqXG4gKiBJbiBIUSBtb2RlLCBWaWJlVHVubmVsIHN1cHBvcnRzIGEgZGlzdHJpYnV0ZWQgYXJjaGl0ZWN0dXJlOlxuICogLSAqKkhRIFNlcnZlcioqOiBDZW50cmFsIHNlcnZlciB0aGF0IGFjdHMgYXMgYSBnYXRld2F5IGFuZCByZWdpc3RyeVxuICogLSAqKlJlbW90ZSBTZXJ2ZXJzKio6IEluZGl2aWR1YWwgVmliZVR1bm5lbCBpbnN0YW5jZXMgdGhhdCByZWdpc3RlciB3aXRoIEhRXG4gKiAtICoqU2Vzc2lvbiBSb3V0aW5nKio6IEhRIHJvdXRlcyBjbGllbnQgcmVxdWVzdHMgdG8gYXBwcm9wcmlhdGUgcmVtb3RlIHNlcnZlcnNcbiAqIC0gKipXZWJTb2NrZXQgQWdncmVnYXRpb24qKjogSFEgYWdncmVnYXRlcyB0ZXJtaW5hbCBidWZmZXJzIGZyb20gYWxsIHJlbW90ZXNcbiAqXG4gKiAjIyBSZWdpc3RyYXRpb24gUHJvY2Vzc1xuICpcbiAqIDEuIFJlbW90ZSBzZXJ2ZXIgc3RhcnRzIHdpdGggSFEgY29uZmlndXJhdGlvbiAoVVJMLCBjcmVkZW50aWFscywgYmVhcmVyIHRva2VuKVxuICogMi4gSFFDbGllbnQgZ2VuZXJhdGVzIGEgdW5pcXVlIHJlbW90ZSBJRCBhbmQgcmVnaXN0ZXJzIHdpdGggSFFcbiAqIDMuIEhRIHN0b3JlcyByZW1vdGUgaW5mb3JtYXRpb24gYW5kIHVzZXMgYmVhcmVyIHRva2VuIGZvciBhdXRoZW50aWNhdGlvblxuICogNC4gUmVtb3RlIHNlcnZlciBtYWludGFpbnMgcmVnaXN0cmF0aW9uIHVudGlsIHNodXRkb3duXG4gKiA1LiBPbiBzaHV0ZG93biwgcmVtb3RlIHVucmVnaXN0ZXJzIGZyb20gSFEgZ3JhY2VmdWxseVxuICpcbiAqICMjIEF1dGhlbnRpY2F0aW9uXG4gKlxuICogVHdvLXdheSBhdXRoZW50aWNhdGlvbiBpcyB1c2VkOlxuICogLSAqKlJlbW90ZSDihpIgSFEqKjogVXNlcyBIVFRQIEJhc2ljIEF1dGggKHVzZXJuYW1lL3Bhc3N3b3JkKVxuICogLSAqKkhRIOKGkiBSZW1vdGUqKjogVXNlcyBCZWFyZXIgdG9rZW4gcHJvdmlkZWQgZHVyaW5nIHJlZ2lzdHJhdGlvblxuICpcbiAqICMjIFVzYWdlIEV4YW1wbGVcbiAqXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDcmVhdGUgSFEgY2xpZW50IGZvciByZW1vdGUgc2VydmVyXG4gKiBjb25zdCBocUNsaWVudCA9IG5ldyBIUUNsaWVudChcbiAqICAgJ2h0dHBzOi8vaHEuZXhhbXBsZS5jb20nLCAgICAgIC8vIEhRIHNlcnZlciBVUkxcbiAqICAgJ3JlbW90ZS11c2VyJywgICAgICAgICAgICAgICAgIC8vIEhRIHVzZXJuYW1lXG4gKiAgICdyZW1vdGUtcGFzc3dvcmQnLCAgICAgICAgICAgICAvLyBIUSBwYXNzd29yZFxuICogICAndXMtd2VzdC0xJywgICAgICAgICAgICAgICAgICAgLy8gUmVtb3RlIG5hbWVcbiAqICAgJ2h0dHBzOi8vcmVtb3RlMS5leGFtcGxlLmNvbScsIC8vIFRoaXMgc2VydmVyJ3MgcHVibGljIFVSTFxuICogICAnc2VjcmV0LWJlYXJlci10b2tlbicgICAgICAgICAgLy8gVG9rZW4gZm9yIEhRIHRvIGF1dGhlbnRpY2F0ZSBiYWNrXG4gKiApO1xuICpcbiAqIC8vIFJlZ2lzdGVyIHdpdGggSFFcbiAqIHRyeSB7XG4gKiAgIGF3YWl0IGhxQ2xpZW50LnJlZ2lzdGVyKCk7XG4gKiAgIGNvbnNvbGUubG9nKGBSZWdpc3RlcmVkIGFzOiAke2hxQ2xpZW50LmdldFJlbW90ZUlkKCl9YCk7XG4gKiB9IGNhdGNoIChlcnJvcikge1xuICogICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcmVnaXN0ZXIgd2l0aCBIUTonLCBlcnJvcik7XG4gKiB9XG4gKlxuICogLy8gT24gc2h1dGRvd25cbiAqIGF3YWl0IGhxQ2xpZW50LmRlc3Ryb3koKTtcbiAqIGBgYFxuICpcbiAqIEBzZWUgd2ViL3NyYy9zZXJ2ZXIvc2VydmljZXMvcmVtb3RlLXJlZ2lzdHJ5LnRzIGZvciBIUS1zaWRlIHJlZ2lzdHJ5XG4gKiBAc2VlIHdlYi9zcmMvc2VydmVyL3NlcnZpY2VzL2J1ZmZlci1hZ2dyZWdhdG9yLnRzIGZvciBjcm9zcy1zZXJ2ZXIgYnVmZmVyIHN0cmVhbWluZ1xuICogQHNlZSB3ZWIvc3JjL3NlcnZlci9zZXJ2ZXIudHMgZm9yIEhRIG1vZGUgaW5pdGlhbGl6YXRpb25cbiAqL1xuZXhwb3J0IGNsYXNzIEhRQ2xpZW50IHtcbiAgcHJpdmF0ZSByZWFkb25seSBocVVybDogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUlkOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlTmFtZTogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgaHFVc2VybmFtZTogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IGhxUGFzc3dvcmQ6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSByZW1vdGVVcmw6IHN0cmluZztcblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IEhRIGNsaWVudFxuICAgKlxuICAgKiBAcGFyYW0gaHFVcmwgLSBCYXNlIFVSTCBvZiB0aGUgSFEgc2VydmVyIChlLmcuLCAnaHR0cHM6Ly9ocS5leGFtcGxlLmNvbScpXG4gICAqIEBwYXJhbSBocVVzZXJuYW1lIC0gVXNlcm5hbWUgZm9yIGF1dGhlbnRpY2F0aW5nIHdpdGggSFEgKEJhc2ljIEF1dGgpXG4gICAqIEBwYXJhbSBocVBhc3N3b3JkIC0gUGFzc3dvcmQgZm9yIGF1dGhlbnRpY2F0aW5nIHdpdGggSFEgKEJhc2ljIEF1dGgpXG4gICAqIEBwYXJhbSByZW1vdGVOYW1lIC0gSHVtYW4tcmVhZGFibGUgbmFtZSBmb3IgdGhpcyByZW1vdGUgc2VydmVyIChlLmcuLCAndXMtd2VzdC0xJylcbiAgICogQHBhcmFtIHJlbW90ZVVybCAtIFB1YmxpYyBVUkwgb2YgdGhpcyByZW1vdGUgc2VydmVyIGZvciBIUSB0byBjb25uZWN0IGJhY2tcbiAgICogQHBhcmFtIGJlYXJlclRva2VuIC0gQmVhcmVyIHRva2VuIHRoYXQgSFEgd2lsbCB1c2UgdG8gYXV0aGVudGljYXRlIHdpdGggdGhpcyByZW1vdGVcbiAgICovXG4gIGNvbnN0cnVjdG9yKFxuICAgIGhxVXJsOiBzdHJpbmcsXG4gICAgaHFVc2VybmFtZTogc3RyaW5nLFxuICAgIGhxUGFzc3dvcmQ6IHN0cmluZyxcbiAgICByZW1vdGVOYW1lOiBzdHJpbmcsXG4gICAgcmVtb3RlVXJsOiBzdHJpbmcsXG4gICAgYmVhcmVyVG9rZW46IHN0cmluZ1xuICApIHtcbiAgICB0aGlzLmhxVXJsID0gaHFVcmw7XG4gICAgdGhpcy5yZW1vdGVJZCA9IHV1aWR2NCgpO1xuICAgIHRoaXMucmVtb3RlTmFtZSA9IHJlbW90ZU5hbWU7XG4gICAgdGhpcy50b2tlbiA9IGJlYXJlclRva2VuO1xuICAgIHRoaXMuaHFVc2VybmFtZSA9IGhxVXNlcm5hbWU7XG4gICAgdGhpcy5ocVBhc3N3b3JkID0gaHFQYXNzd29yZDtcbiAgICB0aGlzLnJlbW90ZVVybCA9IHJlbW90ZVVybDtcblxuICAgIGxvZ2dlci5kZWJ1ZygnaHEgY2xpZW50IGluaXRpYWxpemVkJywge1xuICAgICAgaHFVcmwsXG4gICAgICByZW1vdGVOYW1lLFxuICAgICAgcmVtb3RlSWQ6IHRoaXMucmVtb3RlSWQsXG4gICAgICByZW1vdGVVcmwsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVnaXN0ZXIgdGhpcyByZW1vdGUgc2VydmVyIHdpdGggSFFcbiAgICpcbiAgICogU2VuZHMgYSByZWdpc3RyYXRpb24gcmVxdWVzdCB0byB0aGUgSFEgc2VydmVyIHdpdGggdGhpcyByZW1vdGUncyBpbmZvcm1hdGlvbi5cbiAgICogVGhlIEhRIHNlcnZlciB3aWxsIHN0b3JlIHRoaXMgcmVnaXN0cmF0aW9uIGFuZCB1c2UgaXQgdG8gcm91dGUgc2Vzc2lvbnMgYW5kXG4gICAqIGVzdGFibGlzaCBXZWJTb2NrZXQgY29ubmVjdGlvbnMgZm9yIGJ1ZmZlciBzdHJlYW1pbmcuXG4gICAqXG4gICAqIFJlZ2lzdHJhdGlvbiBpbmNsdWRlczpcbiAgICogLSBVbmlxdWUgcmVtb3RlIElEIChVVUlEIHY0KVxuICAgKiAtIFJlbW90ZSBuYW1lIGZvciBkaXNwbGF5XG4gICAqIC0gUHVibGljIFVSTCBmb3IgSFEgdG8gY29ubmVjdCBiYWNrXG4gICAqIC0gQmVhcmVyIHRva2VuIGZvciBIUSBhdXRoZW50aWNhdGlvblxuICAgKlxuICAgKiBAdGhyb3dzIHtFcnJvcn0gSWYgcmVnaXN0cmF0aW9uIGZhaWxzIChuZXR3b3JrIGVycm9yLCBhdXRoIGZhaWx1cmUsIGV0Yy4pXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogdHJ5IHtcbiAgICogICBhd2FpdCBocUNsaWVudC5yZWdpc3RlcigpO1xuICAgKiAgIGNvbnNvbGUubG9nKCdTdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCB3aXRoIEhRJyk7XG4gICAqIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAqICAgY29uc29sZS5lcnJvcignUmVnaXN0cmF0aW9uIGZhaWxlZDonLCBlcnJvci5tZXNzYWdlKTtcbiAgICogICAvLyBJbXBsZW1lbnQgcmV0cnkgbG9naWMgaWYgbmVlZGVkXG4gICAqIH1cbiAgICogYGBgXG4gICAqL1xuICBhc3luYyByZWdpc3RlcigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsb2dnZXIubG9nKGByZWdpc3RlcmluZyB3aXRoIGhxIGF0ICR7dGhpcy5ocVVybH1gKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke3RoaXMuaHFVcmx9L2FwaS9yZW1vdGVzL3JlZ2lzdGVyYCwge1xuICAgICAgICBtZXRob2Q6IEh0dHBNZXRob2QuUE9TVCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJhc2ljICR7QnVmZmVyLmZyb20oYCR7dGhpcy5ocVVzZXJuYW1lfToke3RoaXMuaHFQYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyl9YCxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGlkOiB0aGlzLnJlbW90ZUlkLFxuICAgICAgICAgIG5hbWU6IHRoaXMucmVtb3RlTmFtZSxcbiAgICAgICAgICB1cmw6IHRoaXMucmVtb3RlVXJsLFxuICAgICAgICAgIHRva2VuOiB0aGlzLnRva2VuLCAvLyBUb2tlbiBmb3IgSFEgdG8gYXV0aGVudGljYXRlIHdpdGggdGhpcyByZW1vdGVcbiAgICAgICAgfSksXG4gICAgICB9KTtcblxuICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICBjb25zdCBlcnJvclRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgcmVnaXN0cmF0aW9uIGZhaWxlZCB3aXRoIHN0YXR1cyAke3Jlc3BvbnNlLnN0YXR1c306ICR7ZXJyb3JUZXh0fWApO1xuICAgICAgICBsb2dnZXIuZGVidWcoJ3JlZ2lzdHJhdGlvbiByZXF1ZXN0IGRldGFpbHM6Jywge1xuICAgICAgICAgIHVybDogYCR7dGhpcy5ocVVybH0vYXBpL3JlbW90ZXMvcmVnaXN0ZXJgLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICBBdXRob3JpemF0aW9uOiBgQmFzaWMgJHtCdWZmZXIuZnJvbShgJHt0aGlzLmhxVXNlcm5hbWV9OiR7dGhpcy5ocVBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKX1gLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keToge1xuICAgICAgICAgICAgaWQ6IHRoaXMucmVtb3RlSWQsXG4gICAgICAgICAgICBuYW1lOiB0aGlzLnJlbW90ZU5hbWUsXG4gICAgICAgICAgICB1cmw6IHRoaXMucmVtb3RlVXJsLFxuICAgICAgICAgICAgdG9rZW46IGAke3RoaXMudG9rZW4uc3Vic3RyaW5nKDAsIDgpfS4uLmAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgUmVnaXN0cmF0aW9uIGZhaWxlZCAoJHtyZXNwb25zZS5zdGF0dXN9KTogJHtlcnJvclRleHR9YCk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgIGNoYWxrLmdyZWVuKGBzdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCB3aXRoIGhxOiAke3RoaXMucmVtb3RlTmFtZX0gKCR7dGhpcy5yZW1vdGVJZH0pYCkgK1xuICAgICAgICAgIGNoYWxrLmdyYXkoYCBhdCAke3RoaXMuaHFVcmx9YClcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZGVidWcoJ3JlZ2lzdHJhdGlvbiBkZXRhaWxzJywge1xuICAgICAgICByZW1vdGVJZDogdGhpcy5yZW1vdGVJZCxcbiAgICAgICAgcmVtb3RlTmFtZTogdGhpcy5yZW1vdGVOYW1lLFxuICAgICAgICB0b2tlbjogYCR7dGhpcy50b2tlbi5zdWJzdHJpbmcoMCwgOCl9Li4uYCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ2ZhaWxlZCB0byByZWdpc3RlciB3aXRoIGhxOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yOyAvLyBMZXQgdGhlIGNhbGxlciBoYW5kbGUgcmV0cmllcyBpZiBuZWVkZWRcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVW5yZWdpc3RlciBmcm9tIEhRIGFuZCBjbGVhbiB1cFxuICAgKlxuICAgKiBBdHRlbXB0cyB0byBncmFjZWZ1bGx5IHVucmVnaXN0ZXIgdGhpcyByZW1vdGUgZnJvbSB0aGUgSFEgc2VydmVyLlxuICAgKiBUaGlzIHNob3VsZCBiZSBjYWxsZWQgZHVyaW5nIHNodXRkb3duIHRvIGluZm9ybSBIUSB0aGF0IHRoaXMgcmVtb3RlXG4gICAqIGlzIG5vIGxvbmdlciBhdmFpbGFibGUuXG4gICAqXG4gICAqIFRoZSBtZXRob2QgaXMgZGVzaWduZWQgdG8gYmUgc2FmZSBkdXJpbmcgc2h1dGRvd246XG4gICAqIC0gRXJyb3JzIGFyZSBsb2dnZWQgYnV0IG5vdCB0aHJvd25cbiAgICogLSBUaW1lb3V0cyBhcmUgaGFuZGxlZCBncmFjZWZ1bGx5XG4gICAqIC0gQWx3YXlzIGNvbXBsZXRlcyB3aXRob3V0IGJsb2NraW5nIHNodXRkb3duXG4gICAqXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogLy8gSW4gc2h1dGRvd24gaGFuZGxlclxuICAgKiBwcm9jZXNzLm9uKCdTSUdURVJNJywgYXN5bmMgKCkgPT4ge1xuICAgKiAgIGF3YWl0IGhxQ2xpZW50LmRlc3Ryb3koKTtcbiAgICogICBwcm9jZXNzLmV4aXQoMCk7XG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIGFzeW5jIGRlc3Ryb3koKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coYHVucmVnaXN0ZXJpbmcgZnJvbSBocTogJHt0aGlzLnJlbW90ZU5hbWV9ICgke3RoaXMucmVtb3RlSWR9KWApKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBUcnkgdG8gdW5yZWdpc3RlclxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHt0aGlzLmhxVXJsfS9hcGkvcmVtb3Rlcy8ke3RoaXMucmVtb3RlSWR9YCwge1xuICAgICAgICBtZXRob2Q6IEh0dHBNZXRob2QuREVMRVRFLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJhc2ljICR7QnVmZmVyLmZyb20oYCR7dGhpcy5ocVVzZXJuYW1lfToke3RoaXMuaHFQYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyl9YCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzcG9uc2Uub2spIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdzdWNjZXNzZnVsbHkgdW5yZWdpc3RlcmVkIGZyb20gaHEnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgdW5yZWdpc3RyYXRpb24gcmV0dXJuZWQgc3RhdHVzICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBMb2cgYnV0IGRvbid0IHRocm93IGR1cmluZyBzaHV0ZG93blxuICAgICAgbG9nZ2VyLmRlYnVnKCdlcnJvciBkdXJpbmcgdW5yZWdpc3RyYXRpb246JywgZXJyb3IpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIHVuaXF1ZSBJRCBvZiB0aGlzIHJlbW90ZVxuICAgKlxuICAgKiBUaGUgcmVtb3RlIElEIGlzIGEgVVVJRCB2NCBnZW5lcmF0ZWQgd2hlbiB0aGUgSFFDbGllbnQgaXMgY3JlYXRlZC5cbiAgICogVGhpcyBJRCB1bmlxdWVseSBpZGVudGlmaWVzIHRoaXMgcmVtb3RlIHNlcnZlciBpbiB0aGUgSFEgcmVnaXN0cnkuXG4gICAqXG4gICAqIEByZXR1cm5zIFRoZSByZW1vdGUncyB1bmlxdWUgaWRlbnRpZmllclxuICAgKi9cbiAgZ2V0UmVtb3RlSWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5yZW1vdGVJZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIGJlYXJlciB0b2tlbiBmb3IgdGhpcyByZW1vdGVcbiAgICpcbiAgICogVGhpcyB0b2tlbiBpcyBwcm92aWRlZCBieSB0aGUgcmVtb3RlIHNlcnZlciBhbmQgZ2l2ZW4gdG8gSFEgZHVyaW5nXG4gICAqIHJlZ2lzdHJhdGlvbi4gSFEgdXNlcyB0aGlzIHRva2VuIHRvIGF1dGhlbnRpY2F0ZSB3aGVuIGNvbm5lY3RpbmdcbiAgICogYmFjayB0byB0aGlzIHJlbW90ZSAoZS5nLiwgZm9yIFdlYlNvY2tldCBidWZmZXIgc3RyZWFtaW5nKS5cbiAgICpcbiAgICogQHJldHVybnMgVGhlIGJlYXJlciB0b2tlbiBmb3IgSFEgYXV0aGVudGljYXRpb25cbiAgICovXG4gIGdldFRva2VuKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMudG9rZW47XG4gIH1cblxuICAvKipcbiAgICogR2V0IHRoZSBIUSBzZXJ2ZXIgVVJMXG4gICAqXG4gICAqIEByZXR1cm5zIFRoZSBiYXNlIFVSTCBvZiB0aGUgSFEgc2VydmVyXG4gICAqL1xuICBnZXRIUVVybCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmhxVXJsO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgQXV0aG9yaXphdGlvbiBoZWFkZXIgdmFsdWUgZm9yIEhRIHJlcXVlc3RzXG4gICAqXG4gICAqIENvbnN0cnVjdHMgYSBCYXNpYyBBdXRoZW50aWNhdGlvbiBoZWFkZXIgdXNpbmcgdGhlIEhRIHVzZXJuYW1lIGFuZCBwYXNzd29yZC5cbiAgICogVGhpcyBpcyB1c2VkIGJ5IHRoZSByZW1vdGUgdG8gYXV0aGVudGljYXRlIHdpdGggdGhlIEhRIHNlcnZlci5cbiAgICpcbiAgICogQHJldHVybnMgQXV0aG9yaXphdGlvbiBoZWFkZXIgdmFsdWUgKGUuZy4sICdCYXNpYyBiYXNlNjRjcmVkZW50aWFscycpXG4gICAqL1xuICBnZXRIUUF1dGgoKTogc3RyaW5nIHtcbiAgICBjb25zdCBjcmVkZW50aWFscyA9IEJ1ZmZlci5mcm9tKGAke3RoaXMuaHFVc2VybmFtZX06JHt0aGlzLmhxUGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuICAgIHJldHVybiBgQmFzaWMgJHtjcmVkZW50aWFsc31gO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgaHVtYW4tcmVhZGFibGUgbmFtZSBvZiB0aGlzIHJlbW90ZVxuICAgKlxuICAgKiBUaGUgcmVtb3RlIG5hbWUgaXMgdXNlZCBmb3IgZGlzcGxheSBwdXJwb3NlcyBpbiBIUSBpbnRlcmZhY2VzXG4gICAqIGFuZCBsb2dzIChlLmcuLCAndXMtd2VzdC0xJywgJ2V1cm9wZS0xJywgJ2Rldi1zZXJ2ZXInKS5cbiAgICpcbiAgICogQHJldHVybnMgVGhlIHJlbW90ZSdzIGRpc3BsYXkgbmFtZVxuICAgKi9cbiAgZ2V0TmFtZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLnJlbW90ZU5hbWU7XG4gIH1cbn1cbiJdfQ==