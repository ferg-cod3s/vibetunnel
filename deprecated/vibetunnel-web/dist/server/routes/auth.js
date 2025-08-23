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
exports.createAuthRoutes = createAuthRoutes;
const express_1 = require("express");
const util_1 = require("util");
function createAuthRoutes(config) {
    const router = (0, express_1.Router)();
    const { authService } = config;
    /**
     * Create authentication challenge for SSH key auth
     * POST /api/auth/challenge
     */
    router.post('/challenge', async (req, res) => {
        try {
            const { userId } = req.body;
            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }
            // Check if user exists
            const userExists = await authService.userExists(userId);
            if (!userExists) {
                return res.status(404).json({ error: 'User not found' });
            }
            // Create challenge
            const challenge = authService.createChallenge(userId);
            res.json({
                challengeId: challenge.challengeId,
                challenge: challenge.challenge,
                expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            });
        }
        catch (error) {
            console.error('Error creating auth challenge:', error);
            res.status(500).json({ error: 'Failed to create authentication challenge' });
        }
    });
    /**
     * Authenticate with SSH key
     * POST /api/auth/ssh-key
     */
    router.post('/ssh-key', async (req, res) => {
        try {
            const { challengeId, publicKey, signature } = req.body;
            if (!challengeId || !publicKey || !signature) {
                return res.status(400).json({
                    error: 'Challenge ID, public key, and signature are required',
                });
            }
            const result = await authService.authenticateWithSSHKey({
                challengeId,
                publicKey,
                signature,
            });
            if (result.success) {
                res.json({
                    success: true,
                    token: result.token,
                    userId: result.userId,
                    authMethod: 'ssh-key',
                });
            }
            else {
                res.status(401).json({
                    success: false,
                    error: result.error,
                });
            }
        }
        catch (error) {
            console.error('Error authenticating with SSH key:', error);
            res.status(500).json({ error: 'SSH key authentication failed' });
        }
    });
    /**
     * Authenticate with password
     * POST /api/auth/password
     */
    router.post('/password', async (req, res) => {
        try {
            const { userId, password } = req.body;
            if (!userId || !password) {
                return res.status(400).json({
                    error: 'User ID and password are required',
                });
            }
            const result = await authService.authenticateWithPassword(userId, password);
            if (result.success) {
                res.json({
                    success: true,
                    token: result.token,
                    userId: result.userId,
                    authMethod: 'password',
                });
            }
            else {
                res.status(401).json({
                    success: false,
                    error: result.error,
                });
            }
        }
        catch (error) {
            console.error('Error authenticating with password:', error);
            res.status(500).json({ error: 'Password authentication failed' });
        }
    });
    /**
     * Verify current authentication status
     * GET /api/auth/verify
     */
    router.get('/verify', (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ valid: false, error: 'No token provided' });
            }
            const token = authHeader.slice(7);
            const verification = authService.verifyToken(token);
            if (verification.valid) {
                res.json({
                    valid: true,
                    userId: verification.userId,
                });
            }
            else {
                res.status(401).json({
                    valid: false,
                    error: 'Invalid or expired token',
                });
            }
        }
        catch (error) {
            console.error('Error verifying token:', error);
            res.status(500).json({ error: 'Token verification failed' });
        }
    });
    /**
     * Get current system user (for initial auth)
     * GET /api/auth/current-user
     */
    router.get('/current-user', (_req, res) => {
        try {
            const currentUser = authService.getCurrentUser();
            res.json({ userId: currentUser });
        }
        catch (error) {
            console.error('Error getting current user:', error);
            res.status(500).json({ error: 'Failed to get current user' });
        }
    });
    /**
     * Get authentication configuration
     * GET /api/auth/config
     */
    router.get('/config', (req, res) => {
        try {
            const response = {
                enableSSHKeys: config.enableSSHKeys || false,
                disallowUserPassword: config.disallowUserPassword || false,
                noAuth: config.noAuth || false,
            };
            // If user is authenticated via Tailscale, indicate this
            if (req.authMethod === 'tailscale' && req.userId) {
                response.tailscaleAuth = true;
                response.authenticatedUser = req.userId;
                response.tailscaleUser = req.tailscaleUser;
            }
            res.json(response);
        }
        catch (error) {
            console.error('Error getting auth config:', error);
            res.status(500).json({ error: 'Failed to get auth config' });
        }
    });
    /**
     * Get user avatar (macOS only)
     * GET /api/auth/avatar/:userId
     */
    router.get('/avatar/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            // Validate userId to prevent command injection
            // Only allow alphanumeric characters, dots, hyphens, and underscores
            if (!userId || !/^[a-zA-Z0-9._-]+$/.test(userId)) {
                return res.status(400).json({ error: 'Invalid user ID format' });
            }
            // Additional length check
            if (userId.length > 255) {
                return res.status(400).json({ error: 'User ID too long' });
            }
            // Check if we're on macOS
            if (process.platform !== 'darwin') {
                return res.json({ avatar: null, platform: process.platform });
            }
            // Try to get user's JPEGPhoto from Directory Services
            try {
                // Use execFile with explicit arguments to prevent command injection
                const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
                const execFileAsync = (0, util_1.promisify)(execFile);
                const { stdout } = await execFileAsync('dscl', [
                    '.',
                    '-read',
                    `/Users/${userId}`,
                    'JPEGPhoto',
                ]);
                // Check if JPEGPhoto exists and extract the hex data
                if (stdout.includes('JPEGPhoto:')) {
                    const lines = stdout.split('\n');
                    const hexLines = lines
                        .slice(1)
                        .filter((line) => line.trim() && !line.startsWith('dsAttrTypeNative'));
                    if (hexLines.length > 0) {
                        // Join all hex lines and remove spaces
                        const hexData = hexLines.join('').replace(/\s/g, '');
                        // Convert hex to base64
                        const buffer = Buffer.from(hexData, 'hex');
                        const base64 = buffer.toString('base64');
                        return res.json({
                            avatar: `data:image/jpeg;base64,${base64}`,
                            platform: 'darwin',
                            source: 'dscl',
                        });
                    }
                }
            }
            catch (_dsclError) {
                console.log('No JPEGPhoto found for user, trying Picture attribute');
            }
            // Fallback: try Picture attribute (file path)
            try {
                const { execFile } = await Promise.resolve().then(() => __importStar(require('child_process')));
                const execFileAsync = (0, util_1.promisify)(execFile);
                const { stdout } = await execFileAsync('dscl', [
                    '.',
                    '-read',
                    `/Users/${userId}`,
                    'Picture',
                ]);
                if (stdout.includes('Picture:')) {
                    const picturePath = stdout.split('Picture:')[1].trim();
                    if (picturePath && picturePath !== 'Picture:') {
                        return res.json({
                            avatar: picturePath,
                            platform: 'darwin',
                            source: 'picture_path',
                        });
                    }
                }
            }
            catch (_pictureError) {
                console.log('No Picture attribute found for user');
            }
            // No avatar found
            res.json({ avatar: null, platform: 'darwin' });
        }
        catch (error) {
            console.error('Error getting user avatar:', error);
            res.status(500).json({ error: 'Failed to get user avatar' });
        }
    });
    /**
     * Logout (invalidate token - client-side only for now)
     * POST /api/auth/logout
     */
    router.post('/logout', (_req, res) => {
        // For JWT tokens, logout is primarily client-side (remove token)
        // In the future, we could implement token blacklisting
        res.json({ success: true, message: 'Logged out successfully' });
    });
    return router;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvcm91dGVzL2F1dGgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFZQSw0Q0F3U0M7QUFwVEQscUNBQWlDO0FBQ2pDLCtCQUFpQztBQVdqQyxTQUFnQixnQkFBZ0IsQ0FBQyxNQUF3QjtJQUN2RCxNQUFNLE1BQU0sR0FBRyxJQUFBLGdCQUFNLEdBQUUsQ0FBQztJQUN4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsTUFBTSxDQUFDO0lBRS9COzs7T0FHRztJQUNILE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7UUFDM0MsSUFBSSxDQUFDO1lBQ0gsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFFNUIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNaLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLENBQUM7WUFFRCx1QkFBdUI7WUFDdkIsTUFBTSxVQUFVLEdBQUcsTUFBTSxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLENBQUM7WUFDM0QsQ0FBQztZQUVELG1CQUFtQjtZQUNuQixNQUFNLFNBQVMsR0FBRyxXQUFXLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXRELEdBQUcsQ0FBQyxJQUFJLENBQUM7Z0JBQ1AsV0FB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QUUsT0FBTyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO0lBQ2xFLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJvdXRlciB9IGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgdHlwZSB7IEF1dGhlbnRpY2F0ZWRSZXF1ZXN0LCBUYWlsc2NhbGVVc2VyIH0gZnJvbSAnLi4vbWlkZGxld2FyZS9hdXRoLmpzJztcbmltcG9ydCB0eXBlIHsgQXV0aFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9hdXRoLXNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgQXV0aFJvdXRlc0NvbmZpZyB7XG4gIGF1dGhTZXJ2aWNlOiBBdXRoU2VydmljZTtcbiAgZW5hYmxlU1NIS2V5cz86IGJvb2xlYW47XG4gIGRpc2FsbG93VXNlclBhc3N3b3JkPzogYm9vbGVhbjtcbiAgbm9BdXRoPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUF1dGhSb3V0ZXMoY29uZmlnOiBBdXRoUm91dGVzQ29uZmlnKTogUm91dGVyIHtcbiAgY29uc3Qgcm91dGVyID0gUm91dGVyKCk7XG4gIGNvbnN0IHsgYXV0aFNlcnZpY2UgfSA9IGNvbmZpZztcblxuICAvKipcbiAgICogQ3JlYXRlIGF1dGhlbnRpY2F0aW9uIGNoYWxsZW5nZSBmb3IgU1NIIGtleSBhdXRoXG4gICAqIFBPU1QgL2FwaS9hdXRoL2NoYWxsZW5nZVxuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9jaGFsbGVuZ2UnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB1c2VySWQgfSA9IHJlcS5ib2R5O1xuXG4gICAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1VzZXIgSUQgaXMgcmVxdWlyZWQnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiB1c2VyIGV4aXN0c1xuICAgICAgY29uc3QgdXNlckV4aXN0cyA9IGF3YWl0IGF1dGhTZXJ2aWNlLnVzZXJFeGlzdHModXNlcklkKTtcbiAgICAgIGlmICghdXNlckV4aXN0cykge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oeyBlcnJvcjogJ1VzZXIgbm90IGZvdW5kJyB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gQ3JlYXRlIGNoYWxsZW5nZVxuICAgICAgY29uc3QgY2hhbGxlbmdlID0gYXV0aFNlcnZpY2UuY3JlYXRlQ2hhbGxlbmdlKHVzZXJJZCk7XG5cbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgY2hhbGxlbmdlSWQ6IGNoYWxsZW5nZS5jaGFsbGVuZ2VJZCxcbiAgICAgICAgY2hhbGxlbmdlOiBjaGFsbGVuZ2UuY2hhbGxlbmdlLFxuICAgICAgICBleHBpcmVzQXQ6IERhdGUubm93KCkgKyA1ICogNjAgKiAxMDAwLCAvLyA1IG1pbnV0ZXNcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBhdXRoIGNoYWxsZW5nZTonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGNyZWF0ZSBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2UnIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLyoqXG4gICAqIEF1dGhlbnRpY2F0ZSB3aXRoIFNTSCBrZXlcbiAgICogUE9TVCAvYXBpL2F1dGgvc3NoLWtleVxuICAgKi9cbiAgcm91dGVyLnBvc3QoJy9zc2gta2V5JywgYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgY2hhbGxlbmdlSWQsIHB1YmxpY0tleSwgc2lnbmF0dXJlIH0gPSByZXEuYm9keTtcblxuICAgICAgaWYgKCFjaGFsbGVuZ2VJZCB8fCAhcHVibGljS2V5IHx8ICFzaWduYXR1cmUpIHtcbiAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAwKS5qc29uKHtcbiAgICAgICAgICBlcnJvcjogJ0NoYWxsZW5nZSBJRCwgcHVibGljIGtleSwgYW5kIHNpZ25hdHVyZSBhcmUgcmVxdWlyZWQnLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0aFNlcnZpY2UuYXV0aGVudGljYXRlV2l0aFNTSEtleSh7XG4gICAgICAgIGNoYWxsZW5nZUlkLFxuICAgICAgICBwdWJsaWNLZXksXG4gICAgICAgIHNpZ25hdHVyZSxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgcmVzLmpzb24oe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgdG9rZW46IHJlc3VsdC50b2tlbixcbiAgICAgICAgICB1c2VySWQ6IHJlc3VsdC51c2VySWQsXG4gICAgICAgICAgYXV0aE1ldGhvZDogJ3NzaC1rZXknLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBlcnJvcjogcmVzdWx0LmVycm9yLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgYXV0aGVudGljYXRpbmcgd2l0aCBTU0gga2V5OicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdTU0gga2V5IGF1dGhlbnRpY2F0aW9uIGZhaWxlZCcgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogQXV0aGVudGljYXRlIHdpdGggcGFzc3dvcmRcbiAgICogUE9TVCAvYXBpL2F1dGgvcGFzc3dvcmRcbiAgICovXG4gIHJvdXRlci5wb3N0KCcvcGFzc3dvcmQnLCBhc3luYyAocmVxLCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB1c2VySWQsIHBhc3N3b3JkIH0gPSByZXEuYm9keTtcblxuICAgICAgaWYgKCF1c2VySWQgfHwgIXBhc3N3b3JkKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7XG4gICAgICAgICAgZXJyb3I6ICdVc2VyIElEIGFuZCBwYXNzd29yZCBhcmUgcmVxdWlyZWQnLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0aFNlcnZpY2UuYXV0aGVudGljYXRlV2l0aFBhc3N3b3JkKHVzZXJJZCwgcGFzc3dvcmQpO1xuXG4gICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgcmVzLmpzb24oe1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgdG9rZW46IHJlc3VsdC50b2tlbixcbiAgICAgICAgICB1c2VySWQ6IHJlc3VsdC51c2VySWQsXG4gICAgICAgICAgYXV0aE1ldGhvZDogJ3Bhc3N3b3JkJyxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXMuc3RhdHVzKDQwMSkuanNvbih7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6IHJlc3VsdC5lcnJvcixcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGF1dGhlbnRpY2F0aW5nIHdpdGggcGFzc3dvcmQ6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ1Bhc3N3b3JkIGF1dGhlbnRpY2F0aW9uIGZhaWxlZCcgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogVmVyaWZ5IGN1cnJlbnQgYXV0aGVudGljYXRpb24gc3RhdHVzXG4gICAqIEdFVCAvYXBpL2F1dGgvdmVyaWZ5XG4gICAqL1xuICByb3V0ZXIuZ2V0KCcvdmVyaWZ5JywgKHJlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGF1dGhIZWFkZXIgPSByZXEuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuXG4gICAgICBpZiAoIWF1dGhIZWFkZXIgfHwgIWF1dGhIZWFkZXIuc3RhcnRzV2l0aCgnQmVhcmVyICcpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMSkuanNvbih7IHZhbGlkOiBmYWxzZSwgZXJyb3I6ICdObyB0b2tlbiBwcm92aWRlZCcgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRva2VuID0gYXV0aEhlYWRlci5zbGljZSg3KTtcbiAgICAgIGNvbnN0IHZlcmlmaWNhdGlvbiA9IGF1dGhTZXJ2aWNlLnZlcmlmeVRva2VuKHRva2VuKTtcblxuICAgICAgaWYgKHZlcmlmaWNhdGlvbi52YWxpZCkge1xuICAgICAgICByZXMuanNvbih7XG4gICAgICAgICAgdmFsaWQ6IHRydWUsXG4gICAgICAgICAgdXNlcklkOiB2ZXJpZmljYXRpb24udXNlcklkLFxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlcy5zdGF0dXMoNDAxKS5qc29uKHtcbiAgICAgICAgICB2YWxpZDogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6ICdJbnZhbGlkIG9yIGV4cGlyZWQgdG9rZW4nLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdmVyaWZ5aW5nIHRva2VuOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdUb2tlbiB2ZXJpZmljYXRpb24gZmFpbGVkJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHZXQgY3VycmVudCBzeXN0ZW0gdXNlciAoZm9yIGluaXRpYWwgYXV0aClcbiAgICogR0VUIC9hcGkvYXV0aC9jdXJyZW50LXVzZXJcbiAgICovXG4gIHJvdXRlci5nZXQoJy9jdXJyZW50LXVzZXInLCAoX3JlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRVc2VyID0gYXV0aFNlcnZpY2UuZ2V0Q3VycmVudFVzZXIoKTtcbiAgICAgIHJlcy5qc29uKHsgdXNlcklkOiBjdXJyZW50VXNlciB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyBjdXJyZW50IHVzZXI6JywgZXJyb3IpO1xuICAgICAgcmVzLnN0YXR1cyg1MDApLmpzb24oeyBlcnJvcjogJ0ZhaWxlZCB0byBnZXQgY3VycmVudCB1c2VyJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHZXQgYXV0aGVudGljYXRpb24gY29uZmlndXJhdGlvblxuICAgKiBHRVQgL2FwaS9hdXRoL2NvbmZpZ1xuICAgKi9cbiAgcm91dGVyLmdldCgnL2NvbmZpZycsIChyZXE6IEF1dGhlbnRpY2F0ZWRSZXF1ZXN0LCByZXMpID0+IHtcbiAgICB0cnkge1xuICAgICAgaW50ZXJmYWNlIEF1dGhDb25maWdSZXNwb25zZSB7XG4gICAgICAgIGVuYWJsZVNTSEtleXM6IGJvb2xlYW47XG4gICAgICAgIGRpc2FsbG93VXNlclBhc3N3b3JkOiBib29sZWFuO1xuICAgICAgICBub0F1dGg6IGJvb2xlYW47XG4gICAgICAgIHRhaWxzY2FsZUF1dGg/OiBib29sZWFuO1xuICAgICAgICBhdXRoZW50aWNhdGVkVXNlcj86IHN0cmluZztcbiAgICAgICAgdGFpbHNjYWxlVXNlcj86IFRhaWxzY2FsZVVzZXI7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBBdXRoQ29uZmlnUmVzcG9uc2UgPSB7XG4gICAgICAgIGVuYWJsZVNTSEtleXM6IGNvbmZpZy5lbmFibGVTU0hLZXlzIHx8IGZhbHNlLFxuICAgICAgICBkaXNhbGxvd1VzZXJQYXNzd29yZDogY29uZmlnLmRpc2FsbG93VXNlclBhc3N3b3JkIHx8IGZhbHNlLFxuICAgICAgICBub0F1dGg6IGNvbmZpZy5ub0F1dGggfHwgZmFsc2UsXG4gICAgICB9O1xuXG4gICAgICAvLyBJZiB1c2VyIGlzIGF1dGhlbnRpY2F0ZWQgdmlhIFRhaWxzY2FsZSwgaW5kaWNhdGUgdGhpc1xuICAgICAgaWYgKHJlcS5hdXRoTWV0aG9kID09PSAndGFpbHNjYWxlJyAmJiByZXEudXNlcklkKSB7XG4gICAgICAgIHJlc3BvbnNlLnRhaWxzY2FsZUF1dGggPSB0cnVlO1xuICAgICAgICByZXNwb25zZS5hdXRoZW50aWNhdGVkVXNlciA9IHJlcS51c2VySWQ7XG4gICAgICAgIHJlc3BvbnNlLnRhaWxzY2FsZVVzZXIgPSByZXEudGFpbHNjYWxlVXNlcjtcbiAgICAgIH1cblxuICAgICAgcmVzLmpzb24ocmVzcG9uc2UpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZXR0aW5nIGF1dGggY29uZmlnOicsIGVycm9yKTtcbiAgICAgIHJlcy5zdGF0dXMoNTAwKS5qc29uKHsgZXJyb3I6ICdGYWlsZWQgdG8gZ2V0IGF1dGggY29uZmlnJyB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8qKlxuICAgKiBHZXQgdXNlciBhdmF0YXIgKG1hY09TIG9ubHkpXG4gICAqIEdFVCAvYXBpL2F1dGgvYXZhdGFyLzp1c2VySWRcbiAgICovXG4gIHJvdXRlci5nZXQoJy9hdmF0YXIvOnVzZXJJZCcsIGFzeW5jIChyZXEsIHJlcykgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCB9ID0gcmVxLnBhcmFtcztcblxuICAgICAgLy8gVmFsaWRhdGUgdXNlcklkIHRvIHByZXZlbnQgY29tbWFuZCBpbmplY3Rpb25cbiAgICAgIC8vIE9ubHkgYWxsb3cgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMsIGRvdHMsIGh5cGhlbnMsIGFuZCB1bmRlcnNjb3Jlc1xuICAgICAgaWYgKCF1c2VySWQgfHwgIS9eW2EtekEtWjAtOS5fLV0rJC8udGVzdCh1c2VySWQpKSB7XG4gICAgICAgIHJldHVybiByZXMuc3RhdHVzKDQwMCkuanNvbih7IGVycm9yOiAnSW52YWxpZCB1c2VyIElEIGZvcm1hdCcgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZGl0aW9uYWwgbGVuZ3RoIGNoZWNrXG4gICAgICBpZiAodXNlcklkLmxlbmd0aCA+IDI1NSkge1xuICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDApLmpzb24oeyBlcnJvcjogJ1VzZXIgSUQgdG9vIGxvbmcnIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiB3ZSdyZSBvbiBtYWNPU1xuICAgICAgaWYgKHByb2Nlc3MucGxhdGZvcm0gIT09ICdkYXJ3aW4nKSB7XG4gICAgICAgIHJldHVybiByZXMuanNvbih7IGF2YXRhcjogbnVsbCwgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm0gfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIFRyeSB0byBnZXQgdXNlcidzIEpQRUdQaG90byBmcm9tIERpcmVjdG9yeSBTZXJ2aWNlc1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gVXNlIGV4ZWNGaWxlIHdpdGggZXhwbGljaXQgYXJndW1lbnRzIHRvIHByZXZlbnQgY29tbWFuZCBpbmplY3Rpb25cbiAgICAgICAgY29uc3QgeyBleGVjRmlsZSB9ID0gYXdhaXQgaW1wb3J0KCdjaGlsZF9wcm9jZXNzJyk7XG4gICAgICAgIGNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuICAgICAgICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYygnZHNjbCcsIFtcbiAgICAgICAgICAnLicsXG4gICAgICAgICAgJy1yZWFkJyxcbiAgICAgICAgICBgL1VzZXJzLyR7dXNlcklkfWAsXG4gICAgICAgICAgJ0pQRUdQaG90bycsXG4gICAgICAgIF0pO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIEpQRUdQaG90byBleGlzdHMgYW5kIGV4dHJhY3QgdGhlIGhleCBkYXRhXG4gICAgICAgIGlmIChzdGRvdXQuaW5jbHVkZXMoJ0pQRUdQaG90bzonKSkge1xuICAgICAgICAgIGNvbnN0IGxpbmVzID0gc3Rkb3V0LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICBjb25zdCBoZXhMaW5lcyA9IGxpbmVzXG4gICAgICAgICAgICAuc2xpY2UoMSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGxpbmUpID0+IGxpbmUudHJpbSgpICYmICFsaW5lLnN0YXJ0c1dpdGgoJ2RzQXR0clR5cGVOYXRpdmUnKSk7XG5cbiAgICAgICAgICBpZiAoaGV4TGluZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gSm9pbiBhbGwgaGV4IGxpbmVzIGFuZCByZW1vdmUgc3BhY2VzXG4gICAgICAgICAgICBjb25zdCBoZXhEYXRhID0gaGV4TGluZXMuam9pbignJykucmVwbGFjZSgvXFxzL2csICcnKTtcblxuICAgICAgICAgICAgLy8gQ29udmVydCBoZXggdG8gYmFzZTY0XG4gICAgICAgICAgICBjb25zdCBidWZmZXIgPSBCdWZmZXIuZnJvbShoZXhEYXRhLCAnaGV4Jyk7XG4gICAgICAgICAgICBjb25zdCBiYXNlNjQgPSBidWZmZXIudG9TdHJpbmcoJ2Jhc2U2NCcpO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgICAgICBhdmF0YXI6IGBkYXRhOmltYWdlL2pwZWc7YmFzZTY0LCR7YmFzZTY0fWAsXG4gICAgICAgICAgICAgIHBsYXRmb3JtOiAnZGFyd2luJyxcbiAgICAgICAgICAgICAgc291cmNlOiAnZHNjbCcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKF9kc2NsRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ05vIEpQRUdQaG90byBmb3VuZCBmb3IgdXNlciwgdHJ5aW5nIFBpY3R1cmUgYXR0cmlidXRlJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIEZhbGxiYWNrOiB0cnkgUGljdHVyZSBhdHRyaWJ1dGUgKGZpbGUgcGF0aClcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZXhlY0ZpbGUgfSA9IGF3YWl0IGltcG9ydCgnY2hpbGRfcHJvY2VzcycpO1xuICAgICAgICBjb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbiAgICAgICAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoJ2RzY2wnLCBbXG4gICAgICAgICAgJy4nLFxuICAgICAgICAgICctcmVhZCcsXG4gICAgICAgICAgYC9Vc2Vycy8ke3VzZXJJZH1gLFxuICAgICAgICAgICdQaWN0dXJlJyxcbiAgICAgICAgXSk7XG4gICAgICAgIGlmIChzdGRvdXQuaW5jbHVkZXMoJ1BpY3R1cmU6JykpIHtcbiAgICAgICAgICBjb25zdCBwaWN0dXJlUGF0aCA9IHN0ZG91dC5zcGxpdCgnUGljdHVyZTonKVsxXS50cmltKCk7XG4gICAgICAgICAgaWYgKHBpY3R1cmVQYXRoICYmIHBpY3R1cmVQYXRoICE9PSAnUGljdHVyZTonKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzLmpzb24oe1xuICAgICAgICAgICAgICBhdmF0YXI6IHBpY3R1cmVQYXRoLFxuICAgICAgICAgICAgICBwbGF0Zm9ybTogJ2RhcndpbicsXG4gICAgICAgICAgICAgIHNvdXJjZTogJ3BpY3R1cmVfcGF0aCcsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKF9waWN0dXJlRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ05vIFBpY3R1cmUgYXR0cmlidXRlIGZvdW5kIGZvciB1c2VyJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIE5vIGF2YXRhciBmb3VuZFxuICAgICAgcmVzLmpzb24oeyBhdmF0YXI6IG51bGwsIHBsYXRmb3JtOiAnZGFyd2luJyB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2V0dGluZyB1c2VyIGF2YXRhcjonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdldCB1c2VyIGF2YXRhcicgfSk7XG4gICAgfVxuICB9KTtcblxuICAvKipcbiAgICogTG9nb3V0IChpbnZhbGlkYXRlIHRva2VuIC0gY2xpZW50LXNpZGUgb25seSBmb3Igbm93KVxuICAgKiBQT1NUIC9hcGkvYXV0aC9sb2dvdXRcbiAgICovXG4gIHJvdXRlci5wb3N0KCcvbG9nb3V0JywgKF9yZXEsIHJlcykgPT4ge1xuICAgIC8vIEZvciBKV1QgdG9rZW5zLCBsb2dvdXQgaXMgcHJpbWFyaWx5IGNsaWVudC1zaWRlIChyZW1vdmUgdG9rZW4pXG4gICAgLy8gSW4gdGhlIGZ1dHVyZSwgd2UgY291bGQgaW1wbGVtZW50IHRva2VuIGJsYWNrbGlzdGluZ1xuICAgIHJlcy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogJ0xvZ2dlZCBvdXQgc3VjY2Vzc2Z1bGx5JyB9KTtcbiAgfSk7XG5cbiAgcmV0dXJuIHJvdXRlcjtcbn1cbiJdfQ==