"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mdnsService = exports.MDNSService = void 0;
const node_os_1 = __importDefault(require("node:os"));
const BonjourLib = require('bonjour-service');
const logger_js_1 = require("../utils/logger.js");
const log = (0, logger_js_1.createLogger)('mdns-service');
class MDNSService {
    constructor() {
        // biome-ignore lint/suspicious/noExplicitAny: bonjour-service doesn't export proper types
        this.bonjour = null;
        this.service = null;
        this.isAdvertising = false;
    }
    /**
     * Start advertising the VibeTunnel service via mDNS/Bonjour
     */
    async startAdvertising(port, instanceName) {
        if (this.isAdvertising) {
            log.warn('mDNS service already advertising');
            return;
        }
        try {
            this.bonjour = new BonjourLib();
            // Use hostname or custom name as the instance name
            const name = instanceName || node_os_1.default.hostname() || 'VibeTunnel Server';
            // Advertise the service
            if (!this.bonjour) {
                throw new Error('Failed to initialize Bonjour');
            }
            this.service = this.bonjour.publish({
                name,
                type: '_vibetunnel._tcp',
                port,
                txt: {
                    version: '1.0',
                    platform: process.platform,
                },
            });
            this.isAdvertising = true;
            log.log(`Started mDNS advertisement: ${name} on port ${port}`);
            // Handle service events
            if (this.service) {
                this.service.on('up', () => {
                    log.debug('mDNS service is up');
                });
                this.service.on('error', (...args) => {
                    log.warn('mDNS service error:', args[0]);
                });
            }
        }
        catch (error) {
            log.warn('Failed to start mDNS advertisement:', error);
            throw error;
        }
    }
    /**
     * Stop advertising the service
     */
    async stopAdvertising() {
        if (!this.isAdvertising) {
            return;
        }
        try {
            if (this.service) {
                await new Promise((resolve) => {
                    if (this.service && typeof this.service.stop === 'function') {
                        this.service.stop(() => {
                            log.debug('mDNS service stopped');
                            resolve();
                        });
                    }
                    else {
                        resolve();
                    }
                });
                this.service = null;
            }
            if (this.bonjour) {
                this.bonjour.destroy();
                this.bonjour = null;
            }
            this.isAdvertising = false;
            log.log('Stopped mDNS advertisement');
        }
        catch (error) {
            log.warn('Error stopping mDNS advertisement:', error);
        }
    }
    /**
     * Check if the service is currently advertising
     */
    isActive() {
        return this.isAdvertising;
    }
}
exports.MDNSService = MDNSService;
// Singleton instance
exports.mdnsService = new MDNSService();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWRucy1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9zZXJ2aWNlcy9tZG5zLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsc0RBQXlCO0FBRXpCLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRzlDLGtEQUFrRDtBQUVsRCxNQUFNLEdBQUcsR0FBRyxJQUFBLHdCQUFZLEVBQUMsY0FBYyxDQUFDLENBQUM7QUFFekMsTUFBYSxXQUFXO0lBQXhCO1FBQ0UsMEZBQTBGO1FBQ2xGLFlBQU8sR0FBUSxJQUFJLENBQUM7UUFDcEIsWUFBTyxHQUFtQixJQUFJLENBQUM7UUFDL0Isa0JBQWEsR0FBRyxLQUFLLENBQUM7SUEyRmhDLENBQUM7SUF6RkM7O09BRUc7SUFDSCxLQUFLLENBQUMsZ0JBQWdCLENBQUMsSUFBWSxFQUFFLFlBQXFCO1FBQ3hELElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3ZCLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQztZQUM3QyxPQUFPO1FBQ1QsQ0FBQztRQUVELElBQUksQ0FBQztZQUNILElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUVoQyxtREFBbUQ7WUFDbkQsTUFBTSxJQUFJLEdBQUcsWUFBWSxJQUFJLGlCQUFFLENBQUMsUUFBUSxFQUFFLElBQUksbUJBQW1CLENBQUM7WUFFbEUsd0JBQXdCO1lBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsOEJBQThCLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBQ0QsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztnQkFDbEMsSUFBSTtnQkFDSixJQUFJLEVBQUUsa0JBQWtCO2dCQUN4QixJQUFJO2dCQUNKLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsS0FBSztvQkFDZCxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7aUJBQzNCO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7WUFDMUIsR0FBRyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLENBQUM7WUFFL0Qsd0JBQXdCO1lBQ3hCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNqQixJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO29CQUN6QixHQUFHLENBQUMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUM7Z0JBQ2xDLENBQUMsQ0FBQyxDQUFDO2dCQUVILElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBZSxFQUFFLEVBQUU7b0JBQzlDLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNDLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsR0FBRyxDQUFDLElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN2RCxNQUFNLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsZUFBZTtRQUNuQixJQUFJLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hCLE9BQU87UUFDVCxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0gsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2pCLE1BQU0sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsRUFBRTtvQkFDbEMsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7d0JBQzVELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTs0QkFDckIsR0FBRyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDOzRCQUNsQyxPQUFPLEVBQUUsQ0FBQzt3QkFDWixDQUFDLENBQUMsQ0FBQztvQkFDTCxDQUFDO3lCQUFNLENBQUM7d0JBQ04sT0FBTyxFQUFFLENBQUM7b0JBQ1osQ0FBQztnQkFDSCxDQUFDLENBQUMsQ0FBQztnQkFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztZQUN0QixDQUFDO1lBRUQsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2pCLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLENBQUM7WUFFRCxJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztZQUMzQixHQUFHLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDeEMsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixHQUFHLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hELENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxRQUFRO1FBQ04sT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO0lBQzVCLENBQUM7Q0FDRjtBQS9GRCxrQ0ErRkM7QUFFRCxxQkFBcUI7QUFDUixRQUFBLFdBQVcsR0FBRyxJQUFJLFdBQVcsRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IG9zIGZyb20gJ25vZGU6b3MnO1xuXG5jb25zdCBCb25qb3VyTGliID0gcmVxdWlyZSgnYm9uam91ci1zZXJ2aWNlJyk7XG5cbmltcG9ydCB0eXBlIHsgU2VydmljZSB9IGZyb20gJ2JvbmpvdXItc2VydmljZSc7XG5pbXBvcnQgeyBjcmVhdGVMb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXIuanMnO1xuXG5jb25zdCBsb2cgPSBjcmVhdGVMb2dnZXIoJ21kbnMtc2VydmljZScpO1xuXG5leHBvcnQgY2xhc3MgTUROU1NlcnZpY2Uge1xuICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vRXhwbGljaXRBbnk6IGJvbmpvdXItc2VydmljZSBkb2Vzbid0IGV4cG9ydCBwcm9wZXIgdHlwZXNcbiAgcHJpdmF0ZSBib25qb3VyOiBhbnkgPSBudWxsO1xuICBwcml2YXRlIHNlcnZpY2U6IFNlcnZpY2UgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpc0FkdmVydGlzaW5nID0gZmFsc2U7XG5cbiAgLyoqXG4gICAqIFN0YXJ0IGFkdmVydGlzaW5nIHRoZSBWaWJlVHVubmVsIHNlcnZpY2UgdmlhIG1ETlMvQm9uam91clxuICAgKi9cbiAgYXN5bmMgc3RhcnRBZHZlcnRpc2luZyhwb3J0OiBudW1iZXIsIGluc3RhbmNlTmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLmlzQWR2ZXJ0aXNpbmcpIHtcbiAgICAgIGxvZy53YXJuKCdtRE5TIHNlcnZpY2UgYWxyZWFkeSBhZHZlcnRpc2luZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICB0aGlzLmJvbmpvdXIgPSBuZXcgQm9uam91ckxpYigpO1xuXG4gICAgICAvLyBVc2UgaG9zdG5hbWUgb3IgY3VzdG9tIG5hbWUgYXMgdGhlIGluc3RhbmNlIG5hbWVcbiAgICAgIGNvbnN0IG5hbWUgPSBpbnN0YW5jZU5hbWUgfHwgb3MuaG9zdG5hbWUoKSB8fCAnVmliZVR1bm5lbCBTZXJ2ZXInO1xuXG4gICAgICAvLyBBZHZlcnRpc2UgdGhlIHNlcnZpY2VcbiAgICAgIGlmICghdGhpcy5ib25qb3VyKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgQm9uam91cicpO1xuICAgICAgfVxuICAgICAgdGhpcy5zZXJ2aWNlID0gdGhpcy5ib25qb3VyLnB1Ymxpc2goe1xuICAgICAgICBuYW1lLFxuICAgICAgICB0eXBlOiAnX3ZpYmV0dW5uZWwuX3RjcCcsXG4gICAgICAgIHBvcnQsXG4gICAgICAgIHR4dDoge1xuICAgICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICAgIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuaXNBZHZlcnRpc2luZyA9IHRydWU7XG4gICAgICBsb2cubG9nKGBTdGFydGVkIG1ETlMgYWR2ZXJ0aXNlbWVudDogJHtuYW1lfSBvbiBwb3J0ICR7cG9ydH1gKTtcblxuICAgICAgLy8gSGFuZGxlIHNlcnZpY2UgZXZlbnRzXG4gICAgICBpZiAodGhpcy5zZXJ2aWNlKSB7XG4gICAgICAgIHRoaXMuc2VydmljZS5vbigndXAnLCAoKSA9PiB7XG4gICAgICAgICAgbG9nLmRlYnVnKCdtRE5TIHNlcnZpY2UgaXMgdXAnKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zZXJ2aWNlLm9uKCdlcnJvcicsICguLi5hcmdzOiB1bmtub3duW10pID0+IHtcbiAgICAgICAgICBsb2cud2FybignbUROUyBzZXJ2aWNlIGVycm9yOicsIGFyZ3NbMF0pO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgbG9nLndhcm4oJ0ZhaWxlZCB0byBzdGFydCBtRE5TIGFkdmVydGlzZW1lbnQ6JywgZXJyb3IpO1xuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3AgYWR2ZXJ0aXNpbmcgdGhlIHNlcnZpY2VcbiAgICovXG4gIGFzeW5jIHN0b3BBZHZlcnRpc2luZygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuaXNBZHZlcnRpc2luZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBpZiAodGhpcy5zZXJ2aWNlKSB7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMuc2VydmljZSAmJiB0eXBlb2YgdGhpcy5zZXJ2aWNlLnN0b3AgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHRoaXMuc2VydmljZS5zdG9wKCgpID0+IHtcbiAgICAgICAgICAgICAgbG9nLmRlYnVnKCdtRE5TIHNlcnZpY2Ugc3RvcHBlZCcpO1xuICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2VydmljZSA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLmJvbmpvdXIpIHtcbiAgICAgICAgdGhpcy5ib25qb3VyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5ib25qb3VyID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc0FkdmVydGlzaW5nID0gZmFsc2U7XG4gICAgICBsb2cubG9nKCdTdG9wcGVkIG1ETlMgYWR2ZXJ0aXNlbWVudCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2cud2FybignRXJyb3Igc3RvcHBpbmcgbUROUyBhZHZlcnRpc2VtZW50OicsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgdGhlIHNlcnZpY2UgaXMgY3VycmVudGx5IGFkdmVydGlzaW5nXG4gICAqL1xuICBpc0FjdGl2ZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5pc0FkdmVydGlzaW5nO1xuICB9XG59XG5cbi8vIFNpbmdsZXRvbiBpbnN0YW5jZVxuZXhwb3J0IGNvbnN0IG1kbnNTZXJ2aWNlID0gbmV3IE1ETlNTZXJ2aWNlKCk7XG4iXX0=