"use strict";
/**
 * Socket API client for VibeTunnel control operations
 * Used by the vt command to communicate with the server via Unix socket
 */
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
exports.SocketApiClient = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const socket_client_js_1 = require("./pty/socket-client.js");
const socket_protocol_js_1 = require("./pty/socket-protocol.js");
const logger_js_1 = require("./utils/logger.js");
const logger = (0, logger_js_1.createLogger)('socket-api');
/**
 * Client for control socket operations
 */
class SocketApiClient {
    constructor() {
        // Use control directory from environment or default
        this.controlDir = process.env.VIBETUNNEL_CONTROL_DIR || path.join(os.homedir(), '.vibetunnel');
        // Use api.sock instead of control.sock to avoid conflicts with Mac app
        this.controlSocketPath = path.join(this.controlDir, 'api.sock');
        logger.debug(`SocketApiClient initialized with control directory: ${this.controlDir}`);
        logger.debug(`Socket path: ${this.controlSocketPath}`);
    }
    /**
     * Check if the control socket exists
     */
    isSocketAvailable() {
        const available = fs.existsSync(this.controlSocketPath);
        logger.debug(`Socket availability check: ${this.controlSocketPath} - ${available ? 'available' : 'not available'}`);
        return available;
    }
    /**
     * Send a request and wait for response
     */
    async sendRequest(type, payload, responseType, timeout = 5000) {
        if (!this.isSocketAvailable()) {
            throw new Error('VibeTunnel server is not running');
        }
        const client = new socket_client_js_1.VibeTunnelSocketClient(this.controlSocketPath);
        try {
            await client.connect();
            const response = await client.sendMessageWithResponse(type, payload, responseType, timeout);
            return response;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('ENOENT')) {
                throw new Error('VibeTunnel server is not running');
            }
            throw error;
        }
        finally {
            client.disconnect();
        }
    }
    /**
     * Get server status
     */
    async getStatus() {
        if (!this.isSocketAvailable()) {
            return { running: false };
        }
        try {
            // Send STATUS_REQUEST and wait for STATUS_RESPONSE
            const response = await this.sendRequest(socket_protocol_js_1.MessageType.STATUS_REQUEST, {}, socket_protocol_js_1.MessageType.STATUS_RESPONSE);
            return response;
        }
        catch (error) {
            logger.error('Failed to get server status:', error);
            return { running: false };
        }
    }
    /**
     * Enable or disable Git follow mode
     */
    async setFollowMode(request) {
        return this.sendRequest(socket_protocol_js_1.MessageType.GIT_FOLLOW_REQUEST, request, socket_protocol_js_1.MessageType.GIT_FOLLOW_RESPONSE);
    }
    /**
     * Send Git event notification
     */
    async sendGitEvent(event) {
        return this.sendRequest(socket_protocol_js_1.MessageType.GIT_EVENT_NOTIFY, event, socket_protocol_js_1.MessageType.GIT_EVENT_ACK);
    }
}
exports.SocketApiClient = SocketApiClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic29ja2V0LWFwaS1jbGllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2VydmVyL3NvY2tldC1hcGktY2xpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILHVDQUF5QjtBQUN6Qix1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZEQUFnRTtBQUNoRSxpRUFPa0M7QUFDbEMsaURBQWlEO0FBRWpELE1BQU0sTUFBTSxHQUFHLElBQUEsd0JBQVksRUFBQyxZQUFZLENBQUMsQ0FBQztBQWExQzs7R0FFRztBQUNILE1BQWEsZUFBZTtJQUkxQjtRQUNFLG9EQUFvRDtRQUNwRCxJQUFJLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDL0YsdUVBQXVFO1FBQ3ZFLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFaEUsTUFBTSxDQUFDLEtBQUssQ0FBQyx1REFBdUQsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDdkYsTUFBTSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxpQkFBaUI7UUFDdkIsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsS0FBSyxDQUNWLDhCQUE4QixJQUFJLENBQUMsaUJBQWlCLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUN0RyxDQUFDO1FBQ0YsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLFdBQVcsQ0FDdkIsSUFBYyxFQUNkLE9BQWlDLEVBQ2pDLFlBQXlCLEVBQ3pCLE9BQU8sR0FBRyxJQUFJO1FBRWQsSUFBSSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLHlDQUFzQixDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRWxFLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3ZCLE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzVGLE9BQU8sUUFBcUIsQ0FBQztRQUMvQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLElBQUksS0FBSyxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7WUFDdEQsQ0FBQztZQUNELE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztnQkFBUyxDQUFDO1lBQ1QsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3RCLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsU0FBUztRQUNiLElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDO1lBQzlCLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILG1EQUFtRDtZQUNuRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQ3JDLGdDQUFXLENBQUMsY0FBYyxFQUMxQixFQUFFLEVBQ0YsZ0NBQVcsQ0FBQyxlQUFlLENBQzVCLENBQUM7WUFDRixPQUFPLFFBQVEsQ0FBQztRQUNsQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE1BQU0sQ0FBQyxLQUFLLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDcEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUM1QixDQUFDO0lBQ0gsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUF5QjtRQUMzQyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQ3JCLGdDQUFXLENBQUMsa0JBQWtCLEVBQzlCLE9BQU8sRUFDUCxnQ0FBVyxDQUFDLG1CQUFtQixDQUNoQyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFxQjtRQUN0QyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQ3JCLGdDQUFXLENBQUMsZ0JBQWdCLEVBQzVCLEtBQUssRUFDTCxnQ0FBVyxDQUFDLGFBQWEsQ0FDMUIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQWpHRCwwQ0FpR0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIFNvY2tldCBBUEkgY2xpZW50IGZvciBWaWJlVHVubmVsIGNvbnRyb2wgb3BlcmF0aW9uc1xuICogVXNlZCBieSB0aGUgdnQgY29tbWFuZCB0byBjb21tdW5pY2F0ZSB3aXRoIHRoZSBzZXJ2ZXIgdmlhIFVuaXggc29ja2V0XG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFZpYmVUdW5uZWxTb2NrZXRDbGllbnQgfSBmcm9tICcuL3B0eS9zb2NrZXQtY2xpZW50LmpzJztcbmltcG9ydCB7XG4gIHR5cGUgR2l0RXZlbnRBY2ssXG4gIHR5cGUgR2l0RXZlbnROb3RpZnksXG4gIHR5cGUgR2l0Rm9sbG93UmVxdWVzdCxcbiAgdHlwZSBHaXRGb2xsb3dSZXNwb25zZSxcbiAgdHlwZSBNZXNzYWdlUGF5bG9hZCxcbiAgTWVzc2FnZVR5cGUsXG59IGZyb20gJy4vcHR5L3NvY2tldC1wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignc29ja2V0LWFwaScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNlcnZlclN0YXR1cyB7XG4gIHJ1bm5pbmc6IGJvb2xlYW47XG4gIHBvcnQ/OiBudW1iZXI7XG4gIHVybD86IHN0cmluZztcbiAgZm9sbG93TW9kZT86IHtcbiAgICBlbmFibGVkOiBib29sZWFuO1xuICAgIGJyYW5jaD86IHN0cmluZztcbiAgICByZXBvUGF0aD86IHN0cmluZztcbiAgfTtcbn1cblxuLyoqXG4gKiBDbGllbnQgZm9yIGNvbnRyb2wgc29ja2V0IG9wZXJhdGlvbnNcbiAqL1xuZXhwb3J0IGNsYXNzIFNvY2tldEFwaUNsaWVudCB7XG4gIHByaXZhdGUgcmVhZG9ubHkgY29udHJvbFNvY2tldFBhdGg6IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBjb250cm9sRGlyOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgLy8gVXNlIGNvbnRyb2wgZGlyZWN0b3J5IGZyb20gZW52aXJvbm1lbnQgb3IgZGVmYXVsdFxuICAgIHRoaXMuY29udHJvbERpciA9IHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfQ09OVFJPTF9ESVIgfHwgcGF0aC5qb2luKG9zLmhvbWVkaXIoKSwgJy52aWJldHVubmVsJyk7XG4gICAgLy8gVXNlIGFwaS5zb2NrIGluc3RlYWQgb2YgY29udHJvbC5zb2NrIHRvIGF2b2lkIGNvbmZsaWN0cyB3aXRoIE1hYyBhcHBcbiAgICB0aGlzLmNvbnRyb2xTb2NrZXRQYXRoID0gcGF0aC5qb2luKHRoaXMuY29udHJvbERpciwgJ2FwaS5zb2NrJyk7XG5cbiAgICBsb2dnZXIuZGVidWcoYFNvY2tldEFwaUNsaWVudCBpbml0aWFsaXplZCB3aXRoIGNvbnRyb2wgZGlyZWN0b3J5OiAke3RoaXMuY29udHJvbERpcn1gKTtcbiAgICBsb2dnZXIuZGVidWcoYFNvY2tldCBwYXRoOiAke3RoaXMuY29udHJvbFNvY2tldFBhdGh9YCk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgdGhlIGNvbnRyb2wgc29ja2V0IGV4aXN0c1xuICAgKi9cbiAgcHJpdmF0ZSBpc1NvY2tldEF2YWlsYWJsZSgpOiBib29sZWFuIHtcbiAgICBjb25zdCBhdmFpbGFibGUgPSBmcy5leGlzdHNTeW5jKHRoaXMuY29udHJvbFNvY2tldFBhdGgpO1xuICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgIGBTb2NrZXQgYXZhaWxhYmlsaXR5IGNoZWNrOiAke3RoaXMuY29udHJvbFNvY2tldFBhdGh9IC0gJHthdmFpbGFibGUgPyAnYXZhaWxhYmxlJyA6ICdub3QgYXZhaWxhYmxlJ31gXG4gICAgKTtcbiAgICByZXR1cm4gYXZhaWxhYmxlO1xuICB9XG5cbiAgLyoqXG4gICAqIFNlbmQgYSByZXF1ZXN0IGFuZCB3YWl0IGZvciByZXNwb25zZVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzZW5kUmVxdWVzdDxUUmVxdWVzdCBleHRlbmRzIE1lc3NhZ2VUeXBlLCBUUmVzcG9uc2U+KFxuICAgIHR5cGU6IFRSZXF1ZXN0LFxuICAgIHBheWxvYWQ6IE1lc3NhZ2VQYXlsb2FkPFRSZXF1ZXN0PixcbiAgICByZXNwb25zZVR5cGU6IE1lc3NhZ2VUeXBlLFxuICAgIHRpbWVvdXQgPSA1MDAwXG4gICk6IFByb21pc2U8VFJlc3BvbnNlPiB7XG4gICAgaWYgKCF0aGlzLmlzU29ja2V0QXZhaWxhYmxlKCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVmliZVR1bm5lbCBzZXJ2ZXIgaXMgbm90IHJ1bm5pbmcnKTtcbiAgICB9XG5cbiAgICBjb25zdCBjbGllbnQgPSBuZXcgVmliZVR1bm5lbFNvY2tldENsaWVudCh0aGlzLmNvbnRyb2xTb2NrZXRQYXRoKTtcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQuc2VuZE1lc3NhZ2VXaXRoUmVzcG9uc2UodHlwZSwgcGF5bG9hZCwgcmVzcG9uc2VUeXBlLCB0aW1lb3V0KTtcbiAgICAgIHJldHVybiByZXNwb25zZSBhcyBUUmVzcG9uc2U7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0VOT0VOVCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVmliZVR1bm5lbCBzZXJ2ZXIgaXMgbm90IHJ1bm5pbmcnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbGllbnQuZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc2VydmVyIHN0YXR1c1xuICAgKi9cbiAgYXN5bmMgZ2V0U3RhdHVzKCk6IFByb21pc2U8U2VydmVyU3RhdHVzPiB7XG4gICAgaWYgKCF0aGlzLmlzU29ja2V0QXZhaWxhYmxlKCkpIHtcbiAgICAgIHJldHVybiB7IHJ1bm5pbmc6IGZhbHNlIH07XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIC8vIFNlbmQgU1RBVFVTX1JFUVVFU1QgYW5kIHdhaXQgZm9yIFNUQVRVU19SRVNQT05TRVxuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0PE1lc3NhZ2VUeXBlLlNUQVRVU19SRVFVRVNULCBTZXJ2ZXJTdGF0dXM+KFxuICAgICAgICBNZXNzYWdlVHlwZS5TVEFUVVNfUkVRVUVTVCxcbiAgICAgICAge30sXG4gICAgICAgIE1lc3NhZ2VUeXBlLlNUQVRVU19SRVNQT05TRVxuICAgICAgKTtcbiAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gZ2V0IHNlcnZlciBzdGF0dXM6JywgZXJyb3IpO1xuICAgICAgcmV0dXJuIHsgcnVubmluZzogZmFsc2UgfTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRW5hYmxlIG9yIGRpc2FibGUgR2l0IGZvbGxvdyBtb2RlXG4gICAqL1xuICBhc3luYyBzZXRGb2xsb3dNb2RlKHJlcXVlc3Q6IEdpdEZvbGxvd1JlcXVlc3QpOiBQcm9taXNlPEdpdEZvbGxvd1Jlc3BvbnNlPiB7XG4gICAgcmV0dXJuIHRoaXMuc2VuZFJlcXVlc3Q8TWVzc2FnZVR5cGUuR0lUX0ZPTExPV19SRVFVRVNULCBHaXRGb2xsb3dSZXNwb25zZT4oXG4gICAgICBNZXNzYWdlVHlwZS5HSVRfRk9MTE9XX1JFUVVFU1QsXG4gICAgICByZXF1ZXN0LFxuICAgICAgTWVzc2FnZVR5cGUuR0lUX0ZPTExPV19SRVNQT05TRVxuICAgICk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBHaXQgZXZlbnQgbm90aWZpY2F0aW9uXG4gICAqL1xuICBhc3luYyBzZW5kR2l0RXZlbnQoZXZlbnQ6IEdpdEV2ZW50Tm90aWZ5KTogUHJvbWlzZTxHaXRFdmVudEFjaz4ge1xuICAgIHJldHVybiB0aGlzLnNlbmRSZXF1ZXN0PE1lc3NhZ2VUeXBlLkdJVF9FVkVOVF9OT1RJRlksIEdpdEV2ZW50QWNrPihcbiAgICAgIE1lc3NhZ2VUeXBlLkdJVF9FVkVOVF9OT1RJRlksXG4gICAgICBldmVudCxcbiAgICAgIE1lc3NhZ2VUeXBlLkdJVF9FVkVOVF9BQ0tcbiAgICApO1xuICB9XG59XG4iXX0=