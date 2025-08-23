"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfigRoutes = createConfigRoutes;
const express_1 = require("express");
const zod_1 = require("zod");
const constants_js_1 = require("../../shared/constants.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('config');
// Validation schemas
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
const QuickStartCommandSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    command: zod_1.z.string().min(1).trim(),
});
/**
 * Create routes for application configuration
 */
function createConfigRoutes(options) {
    const router = (0, express_1.Router)();
    const { configService } = options;
    /**
     * Get application configuration
     * GET /api/config
     */
    router.get('/config', (_req, res) => {
        try {
            const vibeTunnelConfig = configService.getConfig();
            const repositoryBasePath = vibeTunnelConfig.repositoryBasePath || constants_js_1.DEFAULT_REPOSITORY_BASE_PATH;
            const config = {
                repositoryBasePath: repositoryBasePath,
                serverConfigured: true, // Always configured when server is running
                quickStartCommands: vibeTunnelConfig.quickStartCommands,
                notificationPreferences: configService.getNotificationPreferences(),
            };
            logger.debug('[GET /api/config] Returning app config:', config);
            res.json(config);
        }
        catch (error) {
            logger.error('[GET /api/config] Error getting app config:', error);
            res.status(500).json({ error: 'Failed to get app config' });
        }
    });
    /**
     * Update application configuration
     * PUT /api/config
     */
    router.put('/config', (req, res) => {
        try {
            const { quickStartCommands, repositoryBasePath, notificationPreferences } = req.body;
            const updates = {};
            if (quickStartCommands !== undefined) {
                // First check if it's an array
                if (!Array.isArray(quickStartCommands)) {
                    logger.error('[PUT /api/config] Invalid quick start commands: not an array');
                    // Don't return immediately - let it fall through to "No valid updates"
                }
                else {
                    // Filter and validate commands, keeping only valid ones
                    const validatedCommands = [];
                    for (const cmd of quickStartCommands) {
                        try {
                            // Skip null/undefined entries
                            if (cmd == null)
                                continue;
                            const validated = QuickStartCommandSchema.parse(cmd);
                            // Skip empty commands
                            if (validated.command.trim()) {
                                validatedCommands.push(validated);
                            }
                        }
                        catch {
                            // Skip invalid commands
                        }
                    }
                    // Update config
                    configService.updateQuickStartCommands(validatedCommands);
                    updates.quickStartCommands = validatedCommands;
                    logger.debug('[PUT /api/config] Updated quick start commands:', validatedCommands);
                }
            }
            if (repositoryBasePath !== undefined) {
                try {
                    // Validate repository base path
                    const validatedPath = zod_1.z.string().min(1).parse(repositoryBasePath);
                    // Update config
                    configService.updateRepositoryBasePath(validatedPath);
                    updates.repositoryBasePath = validatedPath;
                    logger.debug('[PUT /api/config] Updated repository base path:', validatedPath);
                }
                catch (validationError) {
                    logger.error('[PUT /api/config] Invalid repository base path:', validationError);
                    // Skip invalid values instead of returning error
                }
            }
            if (notificationPreferences !== undefined) {
                try {
                    // Validate notification preferences
                    const validatedPrefs = NotificationPreferencesSchema.parse(notificationPreferences);
                    // Update config
                    configService.updateNotificationPreferences(validatedPrefs);
                    updates.notificationPreferences = validatedPrefs;
                    logger.debug('[PUT /api/config] Updated notification preferences:', validatedPrefs);
                }
                catch (validationError) {
                    logger.error('[PUT /api/config] Invalid notification preferences:', validationError);
                    // Skip invalid values instead of returning error
                }
            }
            if (Object.keys(updates).length > 0) {
                res.json({ success: true, ...updates });
            }
            else {
                res.status(400).json({ error: 'No valid updates provided' });
            }
        }
        catch (error) {
            logger.error('[PUT /api/config] Error updating config:', error);
            res.status(500).json({ error: 'Failed to update config' });
        }
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBMkNBLGdEQStHQztBQTFKRCxxQ0FBaUM7QUFDakMsNkJBQXdCO0FBQ3hCLDREQUF5RTtBQUd6RSxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRXRDLHFCQUFxQjtBQUNyQixNQUFNLDZCQUE2QixHQUFHLE9BQUM7S0FDcEMsTUFBTSxDQUFDO0lBQ04sT0FBTyxFQUFFLE9BQUMsQ0FBQyxPQUFPLEVBQUU7SUFDcEIsWUFBWSxFQUFFLE9BQUMsQ0FBQyxPQUFPLEVBQUU7SUFDekIsV0FBVyxFQUFFLE9BQUMsQ0FBQyxPQUFPLEVBQUU7SUFDeEIsaUJBQWlCLEVBQUUsT0FBQyxDQUFDLE9BQU8sRUFBRTtJQUM5QixZQUFZLEVBQUUsT0FBQyxDQUFDLE9BQU8sRUFBRTtJQUN6QixJQUFJLEVBQUUsT0FBQyxDQUFDLE9BQU8sRUFBRTtJQUNqQixVQUFVLEVBQUUsT0FBQyxDQUFDLE9BQU8sRUFBRTtJQUN2QixZQUFZLEVBQUUsT0FBQyxDQUFDLE9BQU8sRUFBRTtJQUN6QixnQkFBZ0IsRUFBRSxPQUFDLENBQUMsT0FBTyxFQUFFO0NBQzlCLENBQUM7S0FDRCxPQUFPLEVBQUUsQ0FBQztBQUViLE1BQU0sdUJBQXVCLEdBQUcsT0FBQyxDQUFDLE1BQU0sQ0FBQztJQUN2QyxJQUFJLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRTtJQUMzQixPQUFPLEVBQUUsT0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7Q0FDbEMsQ0FBQyxDQUFDO0FBYUg7O0dBRUc7QUFDSCxTQUFnQixrQkFBa0IsQ0FBQyxPQUEyQjtJQUM1RCxNQUFNLE1BQU0sR0FB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RSxDQUFDLENBQUM7WUFDMUMsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLDJCQUEyQixFQUFFLENBQUMsQ0FBQztZQUMvRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2hFLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUm91dGVyIH0gZnJvbSAnZXhwcmVzcyc7XG5pbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCB7IERFRkFVTFRfUkVQT1NJVE9SWV9CQVNFX1BBVEggfSBmcm9tICcuLi8uLi9zaGFyZWQvY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgTm90aWZpY2F0aW9uUHJlZmVyZW5jZXMsIFF1aWNrU3RhcnRDb21tYW5kIH0gZnJvbSAnLi4vLi4vdHlwZXMvY29uZmlnLmpzJztcbmltcG9ydCB0eXBlIHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL2NvbmZpZy1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlci5qcyc7XG5cbmNvbnN0IGxvZ2dlciA9IGNyZWF0ZUxvZ2dlcignY29uZmlnJyk7XG5cbi8vIFZhbGlkYXRpb24gc2NoZW1hc1xuY29uc3QgTm90aWZpY2F0aW9uUHJlZmVyZW5jZXNTY2hlbWEgPSB6XG4gIC5vYmplY3Qoe1xuICAgIGVuYWJsZWQ6IHouYm9vbGVhbigpLFxuICAgIHNlc3Npb25TdGFydDogei5ib29sZWFuKCksXG4gICAgc2Vzc2lvbkV4aXQ6IHouYm9vbGVhbigpLFxuICAgIGNvbW1hbmRDb21wbGV0aW9uOiB6LmJvb2xlYW4oKSxcbiAgICBjb21tYW5kRXJyb3I6IHouYm9vbGVhbigpLFxuICAgIGJlbGw6IHouYm9vbGVhbigpLFxuICAgIGNsYXVkZVR1cm46IHouYm9vbGVhbigpLFxuICAgIHNvdW5kRW5hYmxlZDogei5ib29sZWFuKCksXG4gICAgdmlicmF0aW9uRW5hYmxlZDogei5ib29sZWFuKCksXG4gIH0pXG4gIC5wYXJ0aWFsKCk7XG5cbmNvbnN0IFF1aWNrU3RhcnRDb21tYW5kU2NoZW1hID0gei5vYmplY3Qoe1xuICBuYW1lOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gIGNvbW1hbmQ6IHouc3RyaW5nKCkubWluKDEpLnRyaW0oKSxcbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcENvbmZpZyB7XG4gIHJlcG9zaXRvcnlCYXNlUGF0aDogc3RyaW5nO1xuICBzZXJ2ZXJDb25maWd1cmVkPzogYm9vbGVhbjtcbiAgcXVpY2tTdGFydENvbW1hbmRzPzogUXVpY2tTdGFydENvbW1hbmRbXTtcbiAgbm90aWZpY2F0aW9uUHJlZmVyZW5jZXM/OiBOb3RpZmljYXRpb25QcmVmZXJlbmNlcztcbn1cblxuaW50ZXJmYWNlIENvbmZpZ1JvdXRlT3B0aW9ucyB7XG4gIGNvbmZpZ1NlcnZpY2U6IENvbmZpZ1NlcnZpY2U7XG59XG5cbi8qKlxuICogQ3JlYXRlIHJvdXRlcyBmb3IgYXBwbGljYXRpb24gY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29uZmlnUm91dGVzKG9wdGlvbnM6IENvbmZpZ1JvdXRlT3B0aW9ucyk6IFJvdXRlciB7XG4gIGNvbnN0IHJvdXRlciA9IFJvdXRlcigpO1xuICBjb25zdCB7IGNvbmZpZ1NlcnZpY2UgfSA9IG9wdGlvbnM7XG5cbiAgLyoqXG4gICAqIEdldCBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uXG4gICAqIEdFVCAvYXBpL2NvbmZpZ1xuICAgKi9cbiAgcm91dGVyLmdldCgnL2NvbmZpZycsIChfcmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmliZVR1bm5lbENvbmZpZyA9IGNvbmZpZ1NlcnZpY2UuZ2V0Q29uZmlnKCk7XG4gICAgICBjb25zdCByZXBvc2l0b3J5QmFzZVBhdGggPVxuICAgICAgICB2aWJlVHVubmVsQ29uZmlnLnJlcG9zaXRvcnlCYXNlUGF0aCB8fCBERUZBVUxUX1JFUE9TSVRPUllfQkFTRV9QQVRIO1xuXG4gICAgICBjb25zdCBjb25maWc6IEFwcENvbmZpZyA9IHtcbiAgICAgICAgcmVwb3NpdG9yeUJhc2VQYXRoOiByZXBvc2l0b3J5QmFzZVBhdGgsXG4gICAgICAgIHNlcnZlckNvbmZpZ3VyZWQ6IHRydWUsIC8vIEFsd2F5cyBjb25maWd1cmVkIHdoZW4gc2VydmVyIGlzIHJ1bm5pbmdcbiAgICAgICAgcXVpY2tTdGFydENvbW1hbmRzOiB2aWJlVHVubmVsQ29uZmlnLnF1aWNrU3RhcnRDb21tYW5kcyxcbiAgICAgICAgbm90aWZpY2F0aW9uUHJlZmVyZW5jZXM6IGNvbmZpZ1NlcnZpY2UuZ2V0Tm90aWZpY2F0aW9uUHJlZmVyZW5jZXMoKSxcbiAgICAgIH07XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZygnW0dFVCAvYXBpL2NvbmZpZ10gUmV0dXJuaW5nIGFwcCBjb25maWc6JywgY29uZmlnKTtcbiAgICAgIHJlcy5qc29uKGNvbmZpZyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignW0dFVCAvYXBpL2NvbmZpZ10gRXJyb3IgZ2V0dGluZyBhcHAgY29uZmlnOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IGFwcCBjb25maWcnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIFVwZGF0ZSBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uXG4gICAqIFBVVCAvYXBpL2NvbmZpZ1xuICAgKi9cbiAgcm91dGVyLnB1dCgnL2NvbmZpZycsIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHF1aWNrU3RhcnRDb21tYW5kcywgcmVwb3NpdG9yeUJhc2VQYXRoLCBub3RpZmljYXRpb25QcmVmZXJlbmNlcyB9ID0gcmVxLmJvZHk7XG4gICAgICBjb25zdCB1cGRhdGVzOiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSA9IHt9O1xuXG4gICAgICBpZiAocXVpY2tTdGFydENvbW1hbmRzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gRmlyc3QgY2hlY2sgaWYgaXQncyBhbiBhcnJheVxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocXVpY2tTdGFydENvbW1hbmRzKSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignW1BVVCAvYXBpL2NvbmZpZ10gSW52YWxpZCBxdWljayBzdGFydCBjb21tYW5kczogbm90IGFuIGFycmF5Jyk7XG4gICAgICAgICAgLy8gRG9uJ3QgcmV0dXJuIGltbWVkaWF0ZWx5IC0gbGV0IGl0IGZhbGwgdGhyb3VnaCB0byBcIk5vIHZhbGlkIHVwZGF0ZXNcIlxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIEZpbHRlciBhbmQgdmFsaWRhdGUgY29tbWFuZHMsIGtlZXBpbmcgb25seSB2YWxpZCBvbmVzXG4gICAgICAgICAgY29uc3QgdmFsaWRhdGVkQ29tbWFuZHM6IFF1aWNrU3RhcnRDb21tYW5kW10gPSBbXTtcblxuICAgICAgICAgIGZvciAoY29uc3QgY21kIG9mIHF1aWNrU3RhcnRDb21tYW5kcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgLy8gU2tpcCBudWxsL3VuZGVmaW5lZCBlbnRyaWVzXG4gICAgICAgICAgICAgIGlmIChjbWQgPT0gbnVsbCkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgY29uc3QgdmFsaWRhdGVkID0gUXVpY2tTdGFydENvbW1hbmRTY2hlbWEucGFyc2UoY21kKTtcbiAgICAgICAgICAgICAgLy8gU2tpcCBlbXB0eSBjb21tYW5kc1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVkLmNvbW1hbmQudHJpbSgpKSB7XG4gICAgICAgICAgICAgICAgdmFsaWRhdGVkQ29tbWFuZHMucHVzaCh2YWxpZGF0ZWQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgICAgLy8gU2tpcCBpbnZhbGlkIGNvbW1hbmRzXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gVXBkYXRlIGNvbmZpZ1xuICAgICAgICAgIGNvbmZpZ1NlcnZpY2UudXBkYXRlUXVpY2tTdGFydENvbW1hbmRzKHZhbGlkYXRlZENvbW1hbmRzKTtcbiAgICAgICAgICB1cGRhdGVzLnF1aWNrU3RhcnRDb21tYW5kcyA9IHZhbGlkYXRlZENvbW1hbmRzO1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnW1BVVCAvYXBpL2NvbmZpZ10gVXBkYXRlZCBxdWljayBzdGFydCBjb21tYW5kczonLCB2YWxpZGF0ZWRDb21tYW5kcyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHJlcG9zaXRvcnlCYXNlUGF0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgLy8gVmFsaWRhdGUgcmVwb3NpdG9yeSBiYXNlIHBhdGhcbiAgICAgICAgICBjb25zdCB2YWxpZGF0ZWRQYXRoID0gei5zdHJpbmcoKS5taW4oMSkucGFyc2UocmVwb3NpdG9yeUJhc2VQYXRoKTtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBjb25maWdcbiAgICAgICAgICBjb25maWdTZXJ2aWNlLnVwZGF0ZVJlcG9zaXRvcnlCYXNlUGF0aCh2YWxpZGF0ZWRQYXRoKTtcbiAgICAgICAgICB1cGRhdGVzLnJlcG9zaXRvcnlCYXNlUGF0aCA9IHZhbGlkYXRlZFBhdGg7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKCdbUFVUIC9hcGkvY29uZmlnXSBVcGRhdGVkIHJlcG9zaXRvcnkgYmFzZSBwYXRoOicsIHZhbGlkYXRlZFBhdGgpO1xuICAgICAgICB9IGNhdGNoICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1tQVVQgL2FwaS9jb25maWddIEludmFsaWQgcmVwb3NpdG9yeSBiYXNlIHBhdGg6JywgdmFsaWRhdGlvbkVycm9yKTtcbiAgICAgICAgICAvLyBTa2lwIGludmFsaWQgdmFsdWVzIGluc3RlYWQgb2YgcmV0dXJuaW5nIGVycm9yXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG5vdGlmaWNhdGlvblByZWZlcmVuY2VzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSBub3RpZmljYXRpb24gcHJlZmVyZW5jZXNcbiAgICAgICAgICBjb25zdCB2YWxpZGF0ZWRQcmVmcyA9IE5vdGlmaWNhdGlvblByZWZlcmVuY2VzU2NoZW1hLnBhcnNlKG5vdGlmaWNhdGlvblByZWZlcmVuY2VzKTtcblxuICAgICAgICAgIC8vIFVwZGF0ZSBjb25maWdcbiAgICAgICAgICBjb25maWdTZXJ2aWNlLnVwZGF0ZU5vdGlmaWNhdGlvblByZWZlcmVuY2VzKHZhbGlkYXRlZFByZWZzKTtcbiAgICAgICAgICB1cGRhdGVzLm5vdGlmaWNhdGlvblByZWZlcmVuY2VzID0gdmFsaWRhdGVkUHJlZnM7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKCdbUFVUIC9hcGkvY29uZmlnXSBVcGRhdGVkIG5vdGlmaWNhdGlvbiBwcmVmZXJlbmNlczonLCB2YWxpZGF0ZWRQcmVmcyk7XG4gICAgICAgIH0gY2F0Y2ggKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignW1BVVCAvYXBpL2NvbmZpZ10gSW52YWxpZCBub3RpZmljYXRpb24gcHJlZmVyZW5jZXM6JywgdmFsaWRhdGlvbkVycm9yKTtcbiAgICAgICAgICAvLyBTa2lwIGludmFsaWQgdmFsdWVzIGluc3RlYWQgb2YgcmV0dXJuaW5nIGVycm9yXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKE9iamVjdC5rZXlzKHVwZGF0ZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmVzLmpzb24oeyBzdWNjZXNzOiB0cnVlLCAuLi51cGRhdGVzIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ05vIHZhbGlkIHVwZGF0ZXMgcHJvdmlkZWQnIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ1tQVVQgL2FwaS9jb25maWddIEVycm9yIHVwZGF0aW5nIGNvbmZpZzonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIHVwZGF0ZSBjb25maWcnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==