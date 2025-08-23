"use strict";
/**
 * Fish Shell Handler
 *
 * Provides fish shell tab completion support.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fishHandler = exports.FishHandler = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
/**
 * FishHandler - Provides intelligent tab completion support for the Fish shell
 *
 * This class integrates with Fish shell's built-in completion system to provide
 * context-aware command and argument suggestions. It handles the complexity of
 * spawning Fish processes, managing timeouts, and parsing completion results.
 *
 * Key features:
 * - Leverages Fish's powerful built-in completion engine
 * - Handles process timeouts to prevent hanging
 * - Safely escapes input to prevent injection attacks
 * - Parses Fish's tab-separated completion format
 * - Provides shell detection and version checking utilities
 *
 * @example
 * ```typescript
 * import { fishHandler } from './fish-handler';
 *
 * // Get completions for a partial command
 * const completions = await fishHandler.getCompletions('git co', '/home/user/project');
 * // Returns: ['commit', 'config', 'checkout', ...]
 *
 * // Check if a shell path is Fish
 * if (FishHandler.isFishShell('/usr/local/bin/fish')) {
 *   // Use Fish-specific features
 *   const version = await FishHandler.getFishVersion();
 *   console.log(`Fish version: ${version}`);
 * }
 * ```
 */
class FishHandler {
    /**
     * Get completion suggestions for a partial command
     */
    async getCompletions(partial, cwd = process.cwd()) {
        return new Promise((resolve) => {
            try {
                // Use fish's built-in completion system with proper escaping
                const fishProcess = (0, child_process_1.spawn)('fish', ['-c', `complete -C ${JSON.stringify(partial)}`], {
                    cwd,
                    stdio: ['ignore', 'pipe', 'ignore'],
                });
                let stdout = '';
                const timeout = setTimeout(() => {
                    fishProcess.kill('SIGTERM');
                    resolve([]);
                }, 2000);
                fishProcess.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
                fishProcess.on('close', (code) => {
                    clearTimeout(timeout);
                    if (code !== 0 || !stdout.trim()) {
                        resolve([]);
                        return;
                    }
                    const completions = stdout
                        .split('\n')
                        .filter((line) => line.trim())
                        .map((line) => line.split('\t')[0]) // Fish completions are tab-separated
                        .filter((completion) => completion && completion !== partial);
                    resolve(completions);
                });
                fishProcess.on('error', () => {
                    clearTimeout(timeout);
                    resolve([]);
                });
            }
            catch (_error) {
                resolve([]);
            }
        });
    }
    /**
     * Check if the current shell is fish
     */
    static isFishShell(shellPath) {
        const basename = path_1.default.basename(shellPath);
        // Exact match for fish or fish with version suffix (e.g., fish3)
        return basename === 'fish' || /^fish\d*$/.test(basename);
    }
    /**
     * Get fish shell version
     */
    static async getFishVersion() {
        return new Promise((resolve) => {
            try {
                const fishProcess = (0, child_process_1.spawn)('fish', ['--version'], {
                    stdio: ['ignore', 'pipe', 'ignore'],
                });
                let stdout = '';
                const timeout = setTimeout(() => {
                    fishProcess.kill('SIGTERM');
                    resolve(null);
                }, 1000);
                fishProcess.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });
                fishProcess.on('close', (code) => {
                    clearTimeout(timeout);
                    resolve(code === 0 && stdout.trim() ? stdout.trim() : null);
                });
                fishProcess.on('error', () => {
                    clearTimeout(timeout);
                    resolve(null);
                });
            }
            catch {
                resolve(null);
            }
        });
    }
}
exports.FishHandler = FishHandler;
// Export singleton instance
exports.fishHandler = new FishHandler();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlzaC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9wdHkvZmlzaC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOzs7Ozs7QUFFSCxpREFBc0M7QUFDdEMsZ0RBQXdCO0FBRXhCOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQTZCRztBQUNILE1BQWEsV0FBVztJQUN0Qjs7T0FFRztJQUNILEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBZSxFQUFFLE1BQWMsT0FBTyxDQUFDLEdBQUcsRUFBRTtRQUMvRCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDN0IsSUFBSSxDQUFDO2dCQUNILDZEQUE2RDtnQkFDN0QsTUFBTSxXQUFXLEdBQUcsSUFBQSxxQkFBSyxFQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxlQUFlLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFO29CQUNsRixHQUFHO29CQUNILEtBQUssRUFBRSxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDO2lCQUNwQyxDQUFDLENBQUM7Z0JBRUgsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO2dCQUNoQixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO29CQUM5QixXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUM1QixPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2QsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUVULFdBQVcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO29CQUN0QyxNQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUM1QixDQUFDLENBQUMsQ0FBQztnQkFFSCxXQUFXLENBQUMsRUFBRSxD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WUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN0QixPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2hCLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEIsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBN0ZELGtDQTZGQztBQUVELDRCQUE0QjtBQUNmLFFBQUEsV0FBVyxHQUFHLElBQUksV0FBVyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEZpc2ggU2hlbGwgSGFuZGxlclxuICpcbiAqIFByb3ZpZGVzIGZpc2ggc2hlbGwgdGFiIGNvbXBsZXRpb24gc3VwcG9ydC5cbiAqL1xuXG5pbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5cbi8qKlxuICogRmlzaEhhbmRsZXIgLSBQcm92aWRlcyBpbnRlbGxpZ2VudCB0YWIgY29tcGxldGlvbiBzdXBwb3J0IGZvciB0aGUgRmlzaCBzaGVsbFxuICpcbiAqIFRoaXMgY2xhc3MgaW50ZWdyYXRlcyB3aXRoIEZpc2ggc2hlbGwncyBidWlsdC1pbiBjb21wbGV0aW9uIHN5c3RlbSB0byBwcm92aWRlXG4gKiBjb250ZXh0LWF3YXJlIGNvbW1hbmQgYW5kIGFyZ3VtZW50IHN1Z2dlc3Rpb25zLiBJdCBoYW5kbGVzIHRoZSBjb21wbGV4aXR5IG9mXG4gKiBzcGF3bmluZyBGaXNoIHByb2Nlc3NlcywgbWFuYWdpbmcgdGltZW91dHMsIGFuZCBwYXJzaW5nIGNvbXBsZXRpb24gcmVzdWx0cy5cbiAqXG4gKiBLZXkgZmVhdHVyZXM6XG4gKiAtIExldmVyYWdlcyBGaXNoJ3MgcG93ZXJmdWwgYnVpbHQtaW4gY29tcGxldGlvbiBlbmdpbmVcbiAqIC0gSGFuZGxlcyBwcm9jZXNzIHRpbWVvdXRzIHRvIHByZXZlbnQgaGFuZ2luZ1xuICogLSBTYWZlbHkgZXNjYXBlcyBpbnB1dCB0byBwcmV2ZW50IGluamVjdGlvbiBhdHRhY2tzXG4gKiAtIFBhcnNlcyBGaXNoJ3MgdGFiLXNlcGFyYXRlZCBjb21wbGV0aW9uIGZvcm1hdFxuICogLSBQcm92aWRlcyBzaGVsbCBkZXRlY3Rpb24gYW5kIHZlcnNpb24gY2hlY2tpbmcgdXRpbGl0aWVzXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGltcG9ydCB7IGZpc2hIYW5kbGVyIH0gZnJvbSAnLi9maXNoLWhhbmRsZXInO1xuICpcbiAqIC8vIEdldCBjb21wbGV0aW9ucyBmb3IgYSBwYXJ0aWFsIGNvbW1hbmRcbiAqIGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgZmlzaEhhbmRsZXIuZ2V0Q29tcGxldGlvbnMoJ2dpdCBjbycsICcvaG9tZS91c2VyL3Byb2plY3QnKTtcbiAqIC8vIFJldHVybnM6IFsnY29tbWl0JywgJ2NvbmZpZycsICdjaGVja291dCcsIC4uLl1cbiAqXG4gKiAvLyBDaGVjayBpZiBhIHNoZWxsIHBhdGggaXMgRmlzaFxuICogaWYgKEZpc2hIYW5kbGVyLmlzRmlzaFNoZWxsKCcvdXNyL2xvY2FsL2Jpbi9maXNoJykpIHtcbiAqICAgLy8gVXNlIEZpc2gtc3BlY2lmaWMgZmVhdHVyZXNcbiAqICAgY29uc3QgdmVyc2lvbiA9IGF3YWl0IEZpc2hIYW5kbGVyLmdldEZpc2hWZXJzaW9uKCk7XG4gKiAgIGNvbnNvbGUubG9nKGBGaXNoIHZlcnNpb246ICR7dmVyc2lvbn1gKTtcbiAqIH1cbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRmlzaEhhbmRsZXIge1xuICAvKipcbiAgICogR2V0IGNvbXBsZXRpb24gc3VnZ2VzdGlvbnMgZm9yIGEgcGFydGlhbCBjb21tYW5kXG4gICAqL1xuICBhc3luYyBnZXRDb21wbGV0aW9ucyhwYXJ0aWFsOiBzdHJpbmcsIGN3ZDogc3RyaW5nID0gcHJvY2Vzcy5jd2QoKSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFVzZSBmaXNoJ3MgYnVpbHQtaW4gY29tcGxldGlvbiBzeXN0ZW0gd2l0aCBwcm9wZXIgZXNjYXBpbmdcbiAgICAgICAgY29uc3QgZmlzaFByb2Nlc3MgPSBzcGF3bignZmlzaCcsIFsnLWMnLCBgY29tcGxldGUgLUMgJHtKU09OLnN0cmluZ2lmeShwYXJ0aWFsKX1gXSwge1xuICAgICAgICAgIGN3ZCxcbiAgICAgICAgICBzdGRpbzogWydpZ25vcmUnLCAncGlwZScsICdpZ25vcmUnXSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IHN0ZG91dCA9ICcnO1xuICAgICAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgZmlzaFByb2Nlc3Mua2lsbCgnU0lHVEVSTScpO1xuICAgICAgICAgIHJlc29sdmUoW10pO1xuICAgICAgICB9LCAyMDAwKTtcblxuICAgICAgICBmaXNoUHJvY2Vzcy5zdGRvdXQ/Lm9uKCdkYXRhJywgKGRhdGEpID0+IHtcbiAgICAgICAgICBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBmaXNoUHJvY2Vzcy5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblxuICAgICAgICAgIGlmIChjb2RlICE9PSAwIHx8ICFzdGRvdXQudHJpbSgpKSB7XG4gICAgICAgICAgICByZXNvbHZlKFtdKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBjb21wbGV0aW9ucyA9IHN0ZG91dFxuICAgICAgICAgICAgLnNwbGl0KCdcXG4nKVxuICAgICAgICAgICAgLmZpbHRlcigobGluZSkgPT4gbGluZS50cmltKCkpXG4gICAgICAgICAgICAubWFwKChsaW5lKSA9PiBsaW5lLnNwbGl0KCdcXHQnKVswXSkgLy8gRmlzaCBjb21wbGV0aW9ucyBhcmUgdGFiLXNlcGFyYXRlZFxuICAgICAgICAgICAgLmZpbHRlcigoY29tcGxldGlvbikgPT4gY29tcGxldGlvbiAmJiBjb21wbGV0aW9uICE9PSBwYXJ0aWFsKTtcblxuICAgICAgICAgIHJlc29sdmUoY29tcGxldGlvbnMpO1xuICAgICAgICB9KTtcblxuICAgICAgICBmaXNoUHJvY2Vzcy5vbignZXJyb3InLCAoKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHJlc29sdmUoW10pO1xuICAgICAgICB9KTtcbiAgICAgIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgICAgICByZXNvbHZlKFtdKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiB0aGUgY3VycmVudCBzaGVsbCBpcyBmaXNoXG4gICAqL1xuICBzdGF0aWMgaXNGaXNoU2hlbGwoc2hlbGxQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWUoc2hlbGxQYXRoKTtcbiAgICAvLyBFeGFjdCBtYXRjaCBmb3IgZmlzaCBvciBmaXNoIHdpdGggdmVyc2lvbiBzdWZmaXggKGUuZy4sIGZpc2gzKVxuICAgIHJldHVybiBiYXNlbmFtZSA9PT0gJ2Zpc2gnIHx8IC9eZmlzaFxcZCokLy50ZXN0KGJhc2VuYW1lKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZmlzaCBzaGVsbCB2ZXJzaW9uXG4gICAqL1xuICBzdGF0aWMgYXN5bmMgZ2V0RmlzaFZlcnNpb24oKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBmaXNoUHJvY2VzcyA9IHNwYXduKCdmaXNoJywgWyctLXZlcnNpb24nXSwge1xuICAgICAgICAgIHN0ZGlvOiBbJ2lnbm9yZScsICdwaXBlJywgJ2lnbm9yZSddLFxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgc3Rkb3V0ID0gJyc7XG4gICAgICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBmaXNoUHJvY2Vzcy5raWxsKCdTSUdURVJNJyk7XG4gICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgfSwgMTAwMCk7XG5cbiAgICAgICAgZmlzaFByb2Nlc3Muc3Rkb3V0Py5vbignZGF0YScsIChkYXRhKSA9PiB7XG4gICAgICAgICAgc3Rkb3V0ICs9IGRhdGEudG9TdHJpbmcoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZmlzaFByb2Nlc3Mub24oJ2Nsb3NlJywgKGNvZGUpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgcmVzb2x2ZShjb2RlID09PSAwICYmIHN0ZG91dC50cmltKCkgPyBzdGRvdXQudHJpbSgpIDogbnVsbCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZpc2hQcm9jZXNzLm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmVzb2x2ZShudWxsKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG4vLyBFeHBvcnQgc2luZ2xldG9uIGluc3RhbmNlXG5leHBvcnQgY29uc3QgZmlzaEhhbmRsZXIgPSBuZXcgRmlzaEhhbmRsZXIoKTtcbiJdfQ==