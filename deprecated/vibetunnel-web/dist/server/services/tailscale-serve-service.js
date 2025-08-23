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
exports.tailscaleServeService = exports.TailscaleServeServiceImpl = void 0;
const child_process_1 = require("child_process");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('tailscale-serve');
/**
 * Service to manage Tailscale Serve as a background process
 */
class TailscaleServeServiceImpl {
    constructor() {
        this.serveProcess = null;
        this.currentPort = null;
        this.isStarting = false;
        this.tailscaleExecutable = 'tailscale'; // Default to PATH lookup
    }
    async start(port) {
        if (this.isStarting) {
            throw new Error('Tailscale Serve is already starting');
        }
        if (this.serveProcess) {
            logger.info('Tailscale Serve is already running, stopping first...');
            await this.stop();
        }
        this.isStarting = true;
        this.lastError = undefined; // Clear previous errors
        try {
            // Check if tailscale command is available
            await this.checkTailscaleAvailable();
            // First, reset any existing serve configuration
            try {
                logger.debug('Resetting Tailscale Serve configuration...');
                const resetProcess = (0, child_process_1.spawn)(this.tailscaleExecutable, ['serve', 'reset'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                await new Promise((resolve) => {
                    resetProcess.on('exit', () => resolve());
                    resetProcess.on('error', () => resolve()); // Continue even if reset fails
                    setTimeout(resolve, 1000); // Timeout after 1 second
                });
            }
            catch (_error) {
                logger.debug('Failed to reset serve config (this is normal if none exists)');
            }
            // TCP port: tailscale serve port
            const args = ['serve', port.toString()];
            logger.info(`Starting Tailscale Serve on port ${port}`);
            logger.debug(`Command: ${this.tailscaleExecutable} ${args.join(' ')}`);
            this.currentPort = port;
            // Start the serve process
            this.serveProcess = (0, child_process_1.spawn)(this.tailscaleExecutable, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false, // Keep it attached to our process
            });
            // Handle process events
            this.serveProcess.on('error', (error) => {
                logger.error(`Tailscale Serve process error: ${error.message}`);
                this.lastError = error.message;
                this.cleanup();
            });
            this.serveProcess.on('exit', (code, signal) => {
                logger.info(`Tailscale Serve process exited with code ${code}, signal ${signal}`);
                if (code !== 0) {
                    this.lastError = `Process exited with code ${code}`;
                }
                this.cleanup();
            });
            // Log stdout/stderr
            if (this.serveProcess.stdout) {
                this.serveProcess.stdout.on('data', (data) => {
                    logger.debug(`Tailscale Serve stdout: ${data.toString().trim()}`);
                });
            }
            if (this.serveProcess.stderr) {
                this.serveProcess.stderr.on('data', (data) => {
                    const stderr = data.toString().trim();
                    logger.debug(`Tailscale Serve stderr: ${stderr}`);
                    // Capture common error patterns
                    if (stderr.includes('error') || stderr.includes('failed')) {
                        this.lastError = stderr;
                    }
                });
            }
            // Wait a moment to see if it starts successfully
            await new Promise((resolve, reject) => {
                let settled = false;
                const settlePromise = (isSuccess, error) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timeout);
                    if (isSuccess) {
                        logger.info('Tailscale Serve started successfully');
                        this.startTime = new Date();
                        resolve();
                    }
                    else {
                        const errorMessage = error instanceof Error ? error.message : error || 'Tailscale Serve failed to start';
                        this.lastError = errorMessage;
                        reject(new Error(errorMessage));
                    }
                };
                const timeout = setTimeout(() => {
                    if (this.serveProcess && !this.serveProcess.killed) {
                        settlePromise(true);
                    }
                    else {
                        settlePromise(false, this.lastError);
                    }
                }, 3000); // Wait 3 seconds
                if (this.serveProcess) {
                    this.serveProcess.once('error', (error) => {
                        settlePromise(false, error);
                    });
                    this.serveProcess.once('exit', (code) => {
                        // Exit code 0 during startup might indicate success for some commands
                        // But for 'tailscale serve', it usually means it couldn't start
                        if (code === 0) {
                            settlePromise(false, `Tailscale Serve exited immediately with code 0 - likely already configured or invalid state`);
                        }
                        else {
                            settlePromise(false, `Tailscale Serve exited unexpectedly with code ${code}`);
                        }
                    });
                }
            });
        }
        catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            this.cleanup();
            throw error;
        }
        finally {
            this.isStarting = false;
        }
    }
    async stop() {
        // First try to remove the serve configuration
        try {
            logger.debug('Removing Tailscale Serve configuration...');
            // Use 'reset' to completely clear all serve configuration
            const resetProcess = (0, child_process_1.spawn)(this.tailscaleExecutable, ['serve', 'reset'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            await new Promise((resolve) => {
                resetProcess.on('exit', (code) => {
                    if (code === 0) {
                        logger.debug('Tailscale Serve configuration reset successfully');
                    }
                    resolve();
                });
                resetProcess.on('error', () => resolve());
                setTimeout(resolve, 2000); // Timeout after 2 seconds
            });
        }
        catch (_error) {
            logger.debug('Failed to reset serve config during stop');
        }
        if (!this.serveProcess) {
            logger.debug('No Tailscale Serve process to stop');
            return;
        }
        logger.info('Stopping Tailscale Serve process...');
        return new Promise((resolve) => {
            if (!this.serveProcess) {
                resolve();
                return;
            }
            const cleanup = () => {
                this.cleanup();
                resolve();
            };
            // Set a timeout to force kill if graceful shutdown fails
            const forceKillTimeout = setTimeout(() => {
                if (this.serveProcess && !this.serveProcess.killed) {
                    logger.warn('Force killing Tailscale Serve process');
                    this.serveProcess.kill('SIGKILL');
                }
                cleanup();
            }, 5000);
            this.serveProcess.once('exit', () => {
                clearTimeout(forceKillTimeout);
                cleanup();
            });
            // Try graceful shutdown first
            this.serveProcess.kill('SIGTERM');
        });
    }
    isRunning() {
        return this.serveProcess !== null && !this.serveProcess.killed;
    }
    async getStatus() {
        const isRunning = this.isRunning();
        // Debug mode: simulate errors based on environment variable
        if (process.env.VIBETUNNEL_TAILSCALE_ERROR) {
            return {
                isRunning: false,
                lastError: process.env.VIBETUNNEL_TAILSCALE_ERROR,
            };
        }
        return {
            isRunning,
            port: isRunning ? (this.currentPort ?? undefined) : undefined,
            lastError: this.lastError,
            startTime: this.startTime,
        };
    }
    cleanup() {
        // Kill the process if it's still running
        if (this.serveProcess && !this.serveProcess.killed) {
            logger.debug('Terminating orphaned Tailscale Serve process');
            try {
                this.serveProcess.kill('SIGTERM');
                // Give it a moment to terminate gracefully
                setTimeout(() => {
                    if (this.serveProcess && !this.serveProcess.killed) {
                        logger.warn('Force killing Tailscale Serve process');
                        this.serveProcess.kill('SIGKILL');
                    }
                }, 1000);
            }
            catch (error) {
                logger.error('Failed to kill Tailscale Serve process:', error);
            }
        }
        this.serveProcess = null;
        this.currentPort = null;
        this.isStarting = false;
        this.startTime = undefined;
        // Keep lastError for debugging
    }
    async checkTailscaleAvailable() {
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        // Platform-specific paths to check
        let tailscalePaths = [];
        if (process.platform === 'darwin') {
            // macOS paths
            tailscalePaths = [
                '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
                '/usr/local/bin/tailscale',
                '/opt/homebrew/bin/tailscale',
            ];
        }
        else if (process.platform === 'linux') {
            // Linux paths
            tailscalePaths = [
                '/usr/bin/tailscale',
                '/usr/local/bin/tailscale',
                '/opt/tailscale/bin/tailscale',
                '/snap/bin/tailscale',
            ];
        }
        // Check platform-specific paths first
        for (const path of tailscalePaths) {
            try {
                await fs.access(path, fs.constants.X_OK);
                this.tailscaleExecutable = path;
                logger.debug(`Found Tailscale at: ${path}`);
                return;
            }
            catch {
                // Continue checking other paths
            }
        }
        // Fallback to checking PATH
        return new Promise((resolve, reject) => {
            const checkProcess = (0, child_process_1.spawn)('which', ['tailscale'], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            checkProcess.on('exit', (code) => {
                if (code === 0) {
                    // Keep default 'tailscale' which will use PATH
                    resolve();
                }
                else {
                    reject(new Error('Tailscale command not found. Please install Tailscale first.'));
                }
            });
            checkProcess.on('error', (error) => {
                reject(new Error(`Failed to check Tailscale availability: ${error.message}`));
            });
        });
    }
}
exports.TailscaleServeServiceImpl = TailscaleServeServiceImpl;
// Singleton instance
exports.tailscaleServeService = new TailscaleServeServiceImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFpbHNjYWxlLXNlcnZlLXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3RhaWxzY2FsZS1zZXJ2ZS1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUF5RDtBQUN6RCxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLGlCQUFpQixDQUFDLENBQUM7QUFpQi9DOztHQUVHO0FBQ0gsTUFBYSx5QkFBeUI7SUFBdEM7UUFDVSxpQkFBWSxHQUF3QixJQUFJLENBQUM7UUFDekMsZ0JBQVcsR0FBa0IsSUFBSSxDQUFDO1FBQ2xDLGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsd0JBQW1CLEdBQUcsV0FBVyxDQUFDLENBQUMseUJBQXlCO0lBK1N0RSxDQUFDO0lBM1NDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBWTtRQUN0QixJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNwQixNQUFNLElBQUksS0FBSyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFDekQsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUMsdURBQXVELENBQUMsQ0FBQztZQUNyRSxNQUFNLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNwQixDQUFDO1FBRUQsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDdkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUMsQ0FBQyx3QkFBd0I7UUFFcEQsSUFBSSxDQUFDO1lBQ0gsMENBQTBDO1lBQzFDLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFFckMsZ0RBQWdEO1lBQ2hELElBQUksQ0FBQztnQkFDSCxNQUFNLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxD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dGVudCI6WyJpbXBvcnQgeyB0eXBlIENoaWxkUHJvY2Vzcywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcigndGFpbHNjYWxlLXNlcnZlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGFpbHNjYWxlU2VydmVTZXJ2aWNlIHtcbiAgc3RhcnQocG9ydDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcbiAgc3RvcCgpOiBQcm9taXNlPHZvaWQ+O1xuICBpc1J1bm5pbmcoKTogYm9vbGVhbjtcbiAgZ2V0U3RhdHVzKCk6IFByb21pc2U8VGFpbHNjYWxlU2VydmVTdGF0dXM+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRhaWxzY2FsZVNlcnZlU3RhdHVzIHtcbiAgaXNSdW5uaW5nOiBib29sZWFuO1xuICBwb3J0PzogbnVtYmVyO1xuICBlcnJvcj86IHN0cmluZztcbiAgbGFzdEVycm9yPzogc3RyaW5nO1xuICBzdGFydFRpbWU/OiBEYXRlO1xufVxuXG4vKipcbiAqIFNlcnZpY2UgdG8gbWFuYWdlIFRhaWxzY2FsZSBTZXJ2ZSBhcyBhIGJhY2tncm91bmQgcHJvY2Vzc1xuICovXG5leHBvcnQgY2xhc3MgVGFpbHNjYWxlU2VydmVTZXJ2aWNlSW1wbCBpbXBsZW1lbnRzIFRhaWxzY2FsZVNlcnZlU2VydmljZSB7XG4gIHByaXZhdGUgc2VydmVQcm9jZXNzOiBDaGlsZFByb2Nlc3MgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjdXJyZW50UG9ydDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNTdGFydGluZyA9IGZhbHNlO1xuICBwcml2YXRlIHRhaWxzY2FsZUV4ZWN1dGFibGUgPSAndGFpbHNjYWxlJzsgLy8gRGVmYXVsdCB0byBQQVRIIGxvb2t1cFxuICBwcml2YXRlIGxhc3RFcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuICBwcml2YXRlIHN0YXJ0VGltZTogRGF0ZSB8IHVuZGVmaW5lZDtcblxuICBhc3luYyBzdGFydChwb3J0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5pc1N0YXJ0aW5nKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RhaWxzY2FsZSBTZXJ2ZSBpcyBhbHJlYWR5IHN0YXJ0aW5nJyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2VydmVQcm9jZXNzKSB7XG4gICAgICBsb2dnZXIuaW5mbygnVGFpbHNjYWxlIFNlcnZlIGlzIGFscmVhZHkgcnVubmluZywgc3RvcHBpbmcgZmlyc3QuLi4nKTtcbiAgICAgIGF3YWl0IHRoaXMuc3RvcCgpO1xuICAgIH1cblxuICAgIHRoaXMuaXNTdGFydGluZyA9IHRydWU7XG4gICAgdGhpcy5sYXN0RXJyb3IgPSB1bmRlZmluZWQ7IC8vIENsZWFyIHByZXZpb3VzIGVycm9yc1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIENoZWNrIGlmIHRhaWxzY2FsZSBjb21tYW5kIGlzIGF2YWlsYWJsZVxuICAgICAgYXdhaXQgdGhpcy5jaGVja1RhaWxzY2FsZUF2YWlsYWJsZSgpO1xuXG4gICAgICAvLyBGaXJzdCwgcmVzZXQgYW55IGV4aXN0aW5nIHNlcnZlIGNvbmZpZ3VyYXRpb25cbiAgICAgIHRyeSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnUmVzZXR0aW5nIFRhaWxzY2FsZSBTZXJ2ZSBjb25maWd1cmF0aW9uLi4uJyk7XG4gICAgICAgIGNvbnN0IHJlc2V0UHJvY2VzcyA9IHNwYXduKHRoaXMudGFpbHNjYWxlRXhlY3V0YWJsZSwgWydzZXJ2ZScsICdyZXNldCddLCB7XG4gICAgICAgICAgc3RkaW86IFsnaWdub3JlJywgJ3BpcGUnLCAncGlwZSddLFxuICAgICAgICB9KTtcblxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgIHJlc2V0UHJvY2Vzcy5vbignZXhpdCcsICgpID0+IHJlc29sdmUoKSk7XG4gICAgICAgICAgcmVzZXRQcm9jZXNzLm9uKCdlcnJvcicsICgpID0+IHJlc29sdmUoKSk7IC8vIENvbnRpbnVlIGV2ZW4gaWYgcmVzZXQgZmFpbHNcbiAgICAgICAgICBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDApOyAvLyBUaW1lb3V0IGFmdGVyIDEgc2Vjb25kXG4gICAgICAgIH0pO1xuICAgICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnRmFpbGVkIHRvIHJlc2V0IHNlcnZlIGNvbmZpZyAodGhpcyBpcyBub3JtYWwgaWYgbm9uZSBleGlzdHMpJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFRDUCBwb3J0OiB0YWlsc2NhbGUgc2VydmUgcG9ydFxuICAgICAgY29uc3QgYXJncyA9IFsnc2VydmUnLCBwb3J0LnRvU3RyaW5nKCldO1xuICAgICAgbG9nZ2VyLmluZm8oYFN0YXJ0aW5nIFRhaWxzY2FsZSBTZXJ2ZSBvbiBwb3J0ICR7cG9ydH1gKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhgQ29tbWFuZDogJHt0aGlzLnRhaWxzY2FsZUV4ZWN1dGFibGV9ICR7YXJncy5qb2luKCcgJyl9YCk7XG4gICAgICB0aGlzLmN1cnJlbnRQb3J0ID0gcG9ydDtcblxuICAgICAgLy8gU3RhcnQgdGhlIHNlcnZlIHByb2Nlc3NcbiAgICAgIHRoaXMuc2VydmVQcm9jZXNzID0gc3Bhd24odGhpcy50YWlsc2NhbGVFeGVjdXRhYmxlLCBhcmdzLCB7XG4gICAgICAgIHN0ZGlvOiBbJ2lnbm9yZScsICdwaXBlJywgJ3BpcGUnXSxcbiAgICAgICAgZGV0YWNoZWQ6IGZhbHNlLCAvLyBLZWVwIGl0IGF0dGFjaGVkIHRvIG91ciBwcm9jZXNzXG4gICAgICB9KTtcblxuICAgICAgLy8gSGFuZGxlIHByb2Nlc3MgZXZlbnRzXG4gICAgICB0aGlzLnNlcnZlUHJvY2Vzcy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBUYWlsc2NhbGUgU2VydmUgcHJvY2VzcyBlcnJvcjogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB0aGlzLmxhc3RFcnJvciA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgIHRoaXMuY2xlYW51cCgpO1xuICAgICAgfSk7XG5cbiAgICAgIHRoaXMuc2VydmVQcm9jZXNzLm9uKCdleGl0JywgKGNvZGUsIHNpZ25hbCkgPT4ge1xuICAgICAgICBsb2dnZXIuaW5mbyhgVGFpbHNjYWxlIFNlcnZlIHByb2Nlc3MgZXhpdGVkIHdpdGggY29kZSAke2NvZGV9LCBzaWduYWwgJHtzaWduYWx9YCk7XG4gICAgICAgIGlmIChjb2RlICE9PSAwKSB7XG4gICAgICAgICAgdGhpcy5sYXN0RXJyb3IgPSBgUHJvY2VzcyBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX1gO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYW51cCgpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIExvZyBzdGRvdXQvc3RkZXJyXG4gICAgICBpZiAodGhpcy5zZXJ2ZVByb2Nlc3Muc3Rkb3V0KSB7XG4gICAgICAgIHRoaXMuc2VydmVQcm9jZXNzLnN0ZG91dC5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKGBUYWlsc2NhbGUgU2VydmUgc3Rkb3V0OiAke2RhdGEudG9TdHJpbmcoKS50cmltKCl9YCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5zZXJ2ZVByb2Nlc3Muc3RkZXJyKSB7XG4gICAgICAgIHRoaXMuc2VydmVQcm9jZXNzLnN0ZGVyci5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgY29uc3Qgc3RkZXJyID0gZGF0YS50b1N0cmluZygpLnRyaW0oKTtcbiAgICAgICAgICBsb2dnZXIuZGVidWcoYFRhaWxzY2FsZSBTZXJ2ZSBzdGRlcnI6ICR7c3RkZXJyfWApO1xuICAgICAgICAgIC8vIENhcHR1cmUgY29tbW9uIGVycm9yIHBhdHRlcm5zXG4gICAgICAgICAgaWYgKHN0ZGVyci5pbmNsdWRlcygnZXJyb3InKSB8fCBzdGRlcnIuaW5jbHVkZXMoJ2ZhaWxlZCcpKSB7XG4gICAgICAgICAgICB0aGlzLmxhc3RFcnJvciA9IHN0ZGVycjtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBXYWl0IGEgbW9tZW50IHRvIHNlZSBpZiBpdCBzdGFydHMgc3VjY2Vzc2Z1bGx5XG4gICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGxldCBzZXR0bGVkID0gZmFsc2U7XG5cbiAgICAgICAgY29uc3Qgc2V0dGxlUHJvbWlzZSA9IChpc1N1Y2Nlc3M6IGJvb2xlYW4sIGVycm9yPzogRXJyb3IgfCBzdHJpbmcpID0+IHtcbiAgICAgICAgICBpZiAoc2V0dGxlZCkgcmV0dXJuO1xuICAgICAgICAgIHNldHRsZWQgPSB0cnVlO1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblxuICAgICAgICAgIGlmIChpc1N1Y2Nlc3MpIHtcbiAgICAgICAgICAgIGxvZ2dlci5pbmZvKCdUYWlsc2NhbGUgU2VydmUgc3RhcnRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUaW1lID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID1cbiAgICAgICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvciB8fCAnVGFpbHNjYWxlIFNlcnZlIGZhaWxlZCB0byBzdGFydCc7XG4gICAgICAgICAgICB0aGlzLmxhc3RFcnJvciA9IGVycm9yTWVzc2FnZTtcbiAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoZXJyb3JNZXNzYWdlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5zZXJ2ZVByb2Nlc3MgJiYgIXRoaXMuc2VydmVQcm9jZXNzLmtpbGxlZCkge1xuICAgICAgICAgICAgc2V0dGxlUHJvbWlzZSh0cnVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2V0dGxlUHJvbWlzZShmYWxzZSwgdGhpcy5sYXN0RXJyb3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgMzAwMCk7IC8vIFdhaXQgMyBzZWNvbmRzXG5cbiAgICAgICAgaWYgKHRoaXMuc2VydmVQcm9jZXNzKSB7XG4gICAgICAgICAgdGhpcy5zZXJ2ZVByb2Nlc3Mub25jZSgnZXJyb3InLCAoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIHNldHRsZVByb21pc2UoZmFsc2UsIGVycm9yKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIHRoaXMuc2VydmVQcm9jZXNzLm9uY2UoJ2V4aXQnLCAoY29kZSkgPT4ge1xuICAgICAgICAgICAgLy8gRXhpdCBjb2RlIDAgZHVyaW5nIHN0YXJ0dXAgbWlnaHQgaW5kaWNhdGUgc3VjY2VzcyBmb3Igc29tZSBjb21tYW5kc1xuICAgICAgICAgICAgLy8gQnV0IGZvciAndGFpbHNjYWxlIHNlcnZlJywgaXQgdXN1YWxseSBtZWFucyBpdCBjb3VsZG4ndCBzdGFydFxuICAgICAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcbiAgICAgICAgICAgICAgc2V0dGxlUHJvbWlzZShcbiAgICAgICAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICAgICAgICBgVGFpbHNjYWxlIFNlcnZlIGV4aXRlZCBpbW1lZGlhdGVseSB3aXRoIGNvZGUgMCAtIGxpa2VseSBhbHJlYWR5IGNvbmZpZ3VyZWQgb3IgaW52YWxpZCBzdGF0ZWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHNldHRsZVByb21pc2UoZmFsc2UsIGBUYWlsc2NhbGUgU2VydmUgZXhpdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgJHtjb2RlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5sYXN0RXJyb3IgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICB0aGlzLmNsZWFudXAoKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLmlzU3RhcnRpbmcgPSBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIEZpcnN0IHRyeSB0byByZW1vdmUgdGhlIHNlcnZlIGNvbmZpZ3VyYXRpb25cbiAgICB0cnkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdSZW1vdmluZyBUYWlsc2NhbGUgU2VydmUgY29uZmlndXJhdGlvbi4uLicpO1xuXG4gICAgICAvLyBVc2UgJ3Jlc2V0JyB0byBjb21wbGV0ZWx5IGNsZWFyIGFsbCBzZXJ2ZSBjb25maWd1cmF0aW9uXG4gICAgICBjb25zdCByZXNldFByb2Nlc3MgPSBzcGF3bih0aGlzLnRhaWxzY2FsZUV4ZWN1dGFibGUsIFsnc2VydmUnLCAncmVzZXQnXSwge1xuICAgICAgICBzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdwaXBlJ10sXG4gICAgICB9KTtcblxuICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcbiAgICAgICAgcmVzZXRQcm9jZXNzLm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgICBpZiAoY29kZSA9PT0gMCkge1xuICAgICAgICAgICAgbG9nZ2VyLmRlYnVnKCdUYWlsc2NhbGUgU2VydmUgY29uZmlndXJhdGlvbiByZXNldCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVzZXRQcm9jZXNzLm9uKCdlcnJvcicsICgpID0+IHJlc29sdmUoKSk7XG4gICAgICAgIHNldFRpbWVvdXQocmVzb2x2ZSwgMjAwMCk7IC8vIFRpbWVvdXQgYWZ0ZXIgMiBzZWNvbmRzXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnRmFpbGVkIHRvIHJlc2V0IHNlcnZlIGNvbmZpZyBkdXJpbmcgc3RvcCcpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5zZXJ2ZVByb2Nlc3MpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnTm8gVGFpbHNjYWxlIFNlcnZlIHByb2Nlc3MgdG8gc3RvcCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ2dlci5pbmZvKCdTdG9wcGluZyBUYWlsc2NhbGUgU2VydmUgcHJvY2Vzcy4uLicpO1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICBpZiAoIXRoaXMuc2VydmVQcm9jZXNzKSB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuICAgICAgICB0aGlzLmNsZWFudXAoKTtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfTtcblxuICAgICAgLy8gU2V0IGEgdGltZW91dCB0byBmb3JjZSBraWxsIGlmIGdyYWNlZnVsIHNodXRkb3duIGZhaWxzXG4gICAgICBjb25zdCBmb3JjZUtpbGxUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnNlcnZlUHJvY2VzcyAmJiAhdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbGVkKSB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ0ZvcmNlIGtpbGxpbmcgVGFpbHNjYWxlIFNlcnZlIHByb2Nlc3MnKTtcbiAgICAgICAgICB0aGlzLnNlcnZlUHJvY2Vzcy5raWxsKCdTSUdLSUxMJyk7XG4gICAgICAgIH1cbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgfSwgNTAwMCk7XG5cbiAgICAgIHRoaXMuc2VydmVQcm9jZXNzLm9uY2UoJ2V4aXQnLCAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dChmb3JjZUtpbGxUaW1lb3V0KTtcbiAgICAgICAgY2xlYW51cCgpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFRyeSBncmFjZWZ1bCBzaHV0ZG93biBmaXJzdFxuICAgICAgdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbCgnU0lHVEVSTScpO1xuICAgIH0pO1xuICB9XG5cbiAgaXNSdW5uaW5nKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLnNlcnZlUHJvY2VzcyAhPT0gbnVsbCAmJiAhdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbGVkO1xuICB9XG5cbiAgYXN5bmMgZ2V0U3RhdHVzKCk6IFByb21pc2U8VGFpbHNjYWxlU2VydmVTdGF0dXM+IHtcbiAgICBjb25zdCBpc1J1bm5pbmcgPSB0aGlzLmlzUnVubmluZygpO1xuXG4gICAgLy8gRGVidWcgbW9kZTogc2ltdWxhdGUgZXJyb3JzIGJhc2VkIG9uIGVudmlyb25tZW50IHZhcmlhYmxlXG4gICAgaWYgKHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfVEFJTFNDQUxFX0VSUk9SKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpc1J1bm5pbmc6IGZhbHNlLFxuICAgICAgICBsYXN0RXJyb3I6IHByb2Nlc3MuZW52LlZJQkVUVU5ORUxfVEFJTFNDQUxFX0VSUk9SLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgaXNSdW5uaW5nLFxuICAgICAgcG9ydDogaXNSdW5uaW5nID8gKHRoaXMuY3VycmVudFBvcnQgPz8gdW5kZWZpbmVkKSA6IHVuZGVmaW5lZCxcbiAgICAgIGxhc3RFcnJvcjogdGhpcy5sYXN0RXJyb3IsXG4gICAgICBzdGFydFRpbWU6IHRoaXMuc3RhcnRUaW1lLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIGNsZWFudXAoKTogdm9pZCB7XG4gICAgLy8gS2lsbCB0aGUgcHJvY2VzcyBpZiBpdCdzIHN0aWxsIHJ1bm5pbmdcbiAgICBpZiAodGhpcy5zZXJ2ZVByb2Nlc3MgJiYgIXRoaXMuc2VydmVQcm9jZXNzLmtpbGxlZCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdUZXJtaW5hdGluZyBvcnBoYW5lZCBUYWlsc2NhbGUgU2VydmUgcHJvY2VzcycpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbCgnU0lHVEVSTScpO1xuICAgICAgICAvLyBHaXZlIGl0IGEgbW9tZW50IHRvIHRlcm1pbmF0ZSBncmFjZWZ1bGx5XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIGlmICh0aGlzLnNlcnZlUHJvY2VzcyAmJiAhdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbGVkKSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybignRm9yY2Uga2lsbGluZyBUYWlsc2NhbGUgU2VydmUgcHJvY2VzcycpO1xuICAgICAgICAgICAgdGhpcy5zZXJ2ZVByb2Nlc3Mua2lsbCgnU0lHS0lMTCcpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgMTAwMCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byBraWxsIFRhaWxzY2FsZSBTZXJ2ZSBwcm9jZXNzOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnNlcnZlUHJvY2VzcyA9IG51bGw7XG4gICAgdGhpcy5jdXJyZW50UG9ydCA9IG51bGw7XG4gICAgdGhpcy5pc1N0YXJ0aW5nID0gZmFsc2U7XG4gICAgdGhpcy5zdGFydFRpbWUgPSB1bmRlZmluZWQ7XG4gICAgLy8gS2VlcCBsYXN0RXJyb3IgZm9yIGRlYnVnZ2luZ1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjaGVja1RhaWxzY2FsZUF2YWlsYWJsZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblxuICAgIC8vIFBsYXRmb3JtLXNwZWNpZmljIHBhdGhzIHRvIGNoZWNrXG4gICAgbGV0IHRhaWxzY2FsZVBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nKSB7XG4gICAgICAvLyBtYWNPUyBwYXRoc1xuICAgICAgdGFpbHNjYWxlUGF0aHMgPSBbXG4gICAgICAgICcvQXBwbGljYXRpb25zL1RhaWxzY2FsZS5hcHAvQ29udGVudHMvTWFjT1MvVGFpbHNjYWxlJyxcbiAgICAgICAgJy91c3IvbG9jYWwvYmluL3RhaWxzY2FsZScsXG4gICAgICAgICcvb3B0L2hvbWVicmV3L2Jpbi90YWlsc2NhbGUnLFxuICAgICAgXTtcbiAgICB9IGVsc2UgaWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICdsaW51eCcpIHtcbiAgICAgIC8vIExpbnV4IHBhdGhzXG4gICAgICB0YWlsc2NhbGVQYXRocyA9IFtcbiAgICAgICAgJy91c3IvYmluL3RhaWxzY2FsZScsXG4gICAgICAgICcvdXNyL2xvY2FsL2Jpbi90YWlsc2NhbGUnLFxuICAgICAgICAnL29wdC90YWlsc2NhbGUvYmluL3RhaWxzY2FsZScsXG4gICAgICAgICcvc25hcC9iaW4vdGFpbHNjYWxlJyxcbiAgICAgIF07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgcGxhdGZvcm0tc3BlY2lmaWMgcGF0aHMgZmlyc3RcbiAgICBmb3IgKGNvbnN0IHBhdGggb2YgdGFpbHNjYWxlUGF0aHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGZzLmFjY2VzcyhwYXRoLCBmcy5jb25zdGFudHMuWF9PSyk7XG4gICAgICAgIHRoaXMudGFpbHNjYWxlRXhlY3V0YWJsZSA9IHBhdGg7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgRm91bmQgVGFpbHNjYWxlIGF0OiAke3BhdGh9YCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBDb250aW51ZSBjaGVja2luZyBvdGhlciBwYXRoc1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIHRvIGNoZWNraW5nIFBBVEhcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2hlY2tQcm9jZXNzID0gc3Bhd24oJ3doaWNoJywgWyd0YWlsc2NhbGUnXSwge1xuICAgICAgICBzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdwaXBlJ10sXG4gICAgICB9KTtcblxuICAgICAgY2hlY2tQcm9jZXNzLm9uKCdleGl0JywgKGNvZGUpID0+IHtcbiAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcbiAgICAgICAgICAvLyBLZWVwIGRlZmF1bHQgJ3RhaWxzY2FsZScgd2hpY2ggd2lsbCB1c2UgUEFUSFxuICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdUYWlsc2NhbGUgY29tbWFuZCBub3QgZm91bmQuIFBsZWFzZSBpbnN0YWxsIFRhaWxzY2FsZSBmaXJzdC4nKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjaGVja1Byb2Nlc3Mub24oJ2Vycm9yJywgKGVycm9yKSA9PiB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBjaGVjayBUYWlsc2NhbGUgYXZhaWxhYmlsaXR5OiAke2Vycm9yLm1lc3NhZ2V9YCkpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuLy8gU2luZ2xldG9uIGluc3RhbmNlXG5leHBvcnQgY29uc3QgdGFpbHNjYWxlU2VydmVTZXJ2aWNlID0gbmV3IFRhaWxzY2FsZVNlcnZlU2VydmljZUltcGwoKTtcbiJdfQ==