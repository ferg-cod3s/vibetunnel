"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthMiddleware = createAuthMiddleware;
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)('auth');
// Helper function to check if request is from localhost
function isLocalRequest(req) {
    // Get the real client IP
    const clientIp = req.ip || req.socket.remoteAddress || '';
    // Check for localhost IPs
    const localIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
    const ipIsLocal = localIPs.includes(clientIp);
    // Additional security checks to prevent spoofing
    const noForwardedFor = !req.headers['x-forwarded-for'];
    const noRealIP = !req.headers['x-real-ip'];
    const noForwardedHost = !req.headers['x-forwarded-host'];
    // Check hostname
    const hostIsLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname === '[::1]';
    logger.debug(`Local request check - IP: ${clientIp}, Host: ${req.hostname}, ` +
        `Forwarded headers: ${!noForwardedFor || !noRealIP || !noForwardedHost}`);
    return ipIsLocal && noForwardedFor && noRealIP && noForwardedHost && hostIsLocal;
}
// Helper function to check if request is from localhost (for reverse proxy scenarios)
function isFromLocalhostAddress(req) {
    const remoteAddr = req.socket.remoteAddress;
    return remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
}
// Helper function to check if request has valid Tailscale headers
function getTailscaleUser(req) {
    // Type-safe header access
    const headers = req.headers;
    const login = headers['tailscale-user-login'];
    const name = headers['tailscale-user-name'];
    const profilePic = headers['tailscale-user-profile-pic'];
    // Must have at least login to be valid
    if (!login) {
        return null;
    }
    return {
        login,
        name: name || login, // Fallback to login if name not provided
        profilePic,
    };
}
function createAuthMiddleware(config) {
    return (req, res, next) => {
        // Skip auth for auth endpoints, client logging, push notifications, and Tailscale status
        if (req.path.startsWith('/auth') ||
            req.path.startsWith('/api/auth') ||
            req.path.startsWith('/logs') ||
            req.path === '/sessions/tailscale/status' ||
            req.path.startsWith('/push')) {
            // Special case: If Tailscale auth is enabled and we have valid headers,
            // set the auth info even for /auth endpoints so the client knows we're authenticated
            if (config.allowTailscaleAuth &&
                (req.path.startsWith('/auth') || req.path.startsWith('/api/auth'))) {
                const tailscaleUser = getTailscaleUser(req);
                if (tailscaleUser) {
                    req.authMethod = 'tailscale';
                    req.userId = tailscaleUser.login;
                    req.tailscaleUser = tailscaleUser;
                }
            }
            return next();
        }
        // If no auth is required, allow all requests
        if (config.noAuth) {
            req.authMethod = 'no-auth';
            req.userId = 'no-auth-user'; // Set a default user ID for no-auth mode
            return next();
        }
        // Check for Tailscale authentication if enabled
        if (config.allowTailscaleAuth) {
            const tailscaleUser = getTailscaleUser(req);
            if (tailscaleUser) {
                // Security check: Ensure request is from localhost (Tailscale Serve proxy)
                if (!isFromLocalhostAddress(req)) {
                    logger.warn(`Tailscale headers present but request not from localhost: ${req.socket.remoteAddress}`);
                    return res.status(401).json({ error: 'Invalid request origin' });
                }
                // Additional check: Verify proxy headers exist
                const hasProxyHeaders = !!(req.headers['x-forwarded-proto'] &&
                    req.headers['x-forwarded-for'] &&
                    req.headers['x-forwarded-host']);
                if (!hasProxyHeaders) {
                    logger.warn('Tailscale headers present but missing proxy headers');
                    return res.status(401).json({ error: 'Invalid proxy configuration' });
                }
                // Log Tailscale authentication
                logger.info(`Tailscale authentication successful for user: ${tailscaleUser.login}`);
                logger.info(`User details - Name: ${tailscaleUser.name}, Has profile pic: ${!!tailscaleUser.profilePic}`);
                req.authMethod = 'tailscale';
                req.userId = tailscaleUser.login;
                req.tailscaleUser = tailscaleUser;
                return next();
            }
        }
        // Check for local bypass if enabled
        if (config.allowLocalBypass && isLocalRequest(req)) {
            // If a local auth token is configured, check for it
            if (config.localAuthToken) {
                const providedToken = req.headers['x-vibetunnel-local'];
                if (providedToken === config.localAuthToken) {
                    logger.debug('Local request authenticated with token');
                    req.authMethod = 'local-bypass';
                    req.userId = 'local-user';
                    return next();
                }
                else {
                    logger.debug('Local request missing or invalid token');
                }
            }
            else {
                // No token required for local bypass
                logger.debug('Local request authenticated without token');
                req.authMethod = 'local-bypass';
                req.userId = 'local-user';
                return next();
            }
        }
        // Only log auth requests that might be problematic (no header or failures)
        // Remove verbose logging for successful token auth to reduce spam
        const authHeader = req.headers.authorization;
        const tokenQuery = req.query.token;
        // Check for Bearer token
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            // In HQ mode, check if this is a valid HQ-to-remote bearer token
            if (config.isHQMode && config.bearerToken && token === config.bearerToken) {
                logger.debug('Valid HQ bearer token authentication');
                req.isHQRequest = true;
                req.authMethod = 'hq-bearer';
                return next();
            }
            // If we have enhanced auth service and SSH keys are enabled, try JWT token validation
            if (config.authService && config.enableSSHKeys) {
                const verification = config.authService.verifyToken(token);
                if (verification.valid && verification.userId) {
                    req.userId = verification.userId;
                    req.authMethod = 'ssh-key'; // JWT tokens are issued for SSH key auth
                    return next();
                }
                else {
                    logger.error('Invalid JWT token');
                }
            }
            else if (config.authService) {
                const verification = config.authService.verifyToken(token);
                if (verification.valid && verification.userId) {
                    req.userId = verification.userId;
                    req.authMethod = 'password'; // Password auth only
                    return next();
                }
                else {
                    logger.error('Invalid JWT token');
                }
            }
            // For non-HQ mode, check if bearer token matches remote expectation
            if (!config.isHQMode && config.bearerToken && token === config.bearerToken) {
                logger.debug('Valid remote bearer token authentication');
                req.authMethod = 'hq-bearer';
                return next();
            }
            logger.error(`Bearer token rejected - HQ mode: ${config.isHQMode}, token matches: ${config.bearerToken === token}`);
        }
        // Check for token in query parameter (for EventSource connections)
        if (tokenQuery && config.authService) {
            const verification = config.authService.verifyToken(tokenQuery);
            if (verification.valid && verification.userId) {
                logger.debug(`Valid query token for user: ${verification.userId}`);
                req.userId = verification.userId;
                req.authMethod = config.enableSSHKeys ? 'ssh-key' : 'password';
                return next();
            }
            else {
                logger.error('Invalid query token');
            }
        }
        // No valid auth provided
        logger.error(`Unauthorized request to ${req.method} ${req.path} from ${req.ip}`);
        res.setHeader('WWW-Authenticate', 'Bearer realm="VibeTunnel"');
        res.status(401).json({ error: 'Authentication required' });
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9zZXJ2ZXIvbWlkZGxld2FyZS9hdXRoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBNEZBLG9EQWlLQztBQTNQRCxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsSUFBQSx3QkFBWSxFQUFDLE1BQU0sQ0FBQyxDQUFDO0FBcUJwQyx3REFBd0Q7QUFDeEQsU0FBUyxjQUFjLENBQUMsR0FBWTtJQUNsQyx5QkFBeUI7SUFDekIsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsSUFBSSxFQUFFLENBQUM7SUFFMUQsMEJBQTBCO0lBQzFCLE1BQU0sUUFBUSxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN2RSxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTlDLGlEQUFpRDtJQUNqRCxNQUFNLGNBQWMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUN2RCxNQUFNLFFBQVEsR0FBRyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDM0MsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFFekQsaUJBQWlCO0lBQ2pCLE1BQU0sV0FBVyxHQUNmLEdBQUcsQ0FBQyxRQUFRLEtBQUssV0FBVyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEtBQUssV0FBVyxJQUFJLEdBQUcsQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO0lBRTNGLE1BQU0sQ0FBQyxLQUFLLENBQ1YsNkJBQTZCLFFBQVEsV0FBVyxHQUFHLENBQUMsUUFBUSxJQUFJO1FBQzlELHNCQUFzQixDQUFDLGNBQWMsSUFBSSxDQUFDLFFB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QUM7UUFDSCxDQUFDO1FBRUQseUJBQXlCO1FBQ3pCLE1BQU0sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLEdBQUcsQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNqRixHQUFHLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFDL0QsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxLQUFLLEVBQUUseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO0lBQzdELENBQUMsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IE5leHRGdW5jdGlvbiwgUmVxdWVzdCwgUmVzcG9uc2UgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCB0eXBlIHsgQXV0aFNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9hdXRoLXNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlTG9nZ2VyIH0gZnJvbSAnLi4vdXRpbHMvbG9nZ2VyLmpzJztcblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdhdXRoJyk7XG5cbmludGVyZmFjZSBBdXRoQ29uZmlnIHtcbiAgZW5hYmxlU1NIS2V5czogYm9vbGVhbjtcbiAgZGlzYWxsb3dVc2VyUGFzc3dvcmQ6IGJvb2xlYW47XG4gIG5vQXV0aDogYm9vbGVhbjtcbiAgaXNIUU1vZGU6IGJvb2xlYW47XG4gIGJlYXJlclRva2VuPzogc3RyaW5nOyAvLyBUb2tlbiB0aGF0IEhRIG11c3QgdXNlIHRvIGF1dGhlbnRpY2F0ZSB3aXRoIHRoaXMgcmVtb3RlXG4gIGF1dGhTZXJ2aWNlPzogQXV0aFNlcnZpY2U7IC8vIEVuaGFuY2VkIGF1dGggc2VydmljZSBmb3IgSldUIHRva2Vuc1xuICBhbGxvd0xvY2FsQnlwYXNzPzogYm9vbGVhbjsgLy8gQWxsb3cgbG9jYWxob3N0IGNvbm5lY3Rpb25zIHRvIGJ5cGFzcyBhdXRoXG4gIGxvY2FsQXV0aFRva2VuPzogc3RyaW5nOyAvLyBUb2tlbiBmb3IgbG9jYWxob3N0IGF1dGhlbnRpY2F0aW9uXG4gIGFsbG93VGFpbHNjYWxlQXV0aD86IGJvb2xlYW47IC8vIEFsbG93IFRhaWxzY2FsZSBpZGVudGl0eSBoZWFkZXJzIGZvciBhdXRoZW50aWNhdGlvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhlbnRpY2F0ZWRSZXF1ZXN0IGV4dGVuZHMgUmVxdWVzdCB7XG4gIHVzZXJJZD86IHN0cmluZztcbiAgYXV0aE1ldGhvZD86ICdzc2gta2V5JyB8ICdwYXNzd29yZCcgfCAnaHEtYmVhcmVyJyB8ICduby1hdXRoJyB8ICdsb2NhbC1ieXBhc3MnIHwgJ3RhaWxzY2FsZSc7XG4gIGlzSFFSZXF1ZXN0PzogYm9vbGVhbjtcbiAgdGFpbHNjYWxlVXNlcj86IFRhaWxzY2FsZVVzZXI7XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBjaGVjayBpZiByZXF1ZXN0IGlzIGZyb20gbG9jYWxob3N0XG5mdW5jdGlvbiBpc0xvY2FsUmVxdWVzdChyZXE6IFJlcXVlc3QpOiBib29sZWFuIHtcbiAgLy8gR2V0IHRoZSByZWFsIGNsaWVudCBJUFxuICBjb25zdCBjbGllbnRJcCA9IHJlcS5pcCB8fCByZXEuc29ja2V0LnJlbW90ZUFkZHJlc3MgfHwgJyc7XG5cbiAgLy8gQ2hlY2sgZm9yIGxvY2FsaG9zdCBJUHNcbiAgY29uc3QgbG9jYWxJUHMgPSBbJzEyNy4wLjAuMScsICc6OjEnLCAnOjpmZmZmOjEyNy4wLjAuMScsICdsb2NhbGhvc3QnXTtcbiAgY29uc3QgaXBJc0xvY2FsID0gbG9jYWxJUHMuaW5jbHVkZXMoY2xpZW50SXApO1xuXG4gIC8vIEFkZGl0aW9uYWwgc2VjdXJpdHkgY2hlY2tzIHRvIHByZXZlbnQgc3Bvb2ZpbmdcbiAgY29uc3Qgbm9Gb3J3YXJkZWRGb3IgPSAhcmVxLmhlYWRlcnNbJ3gtZm9yd2FyZGVkLWZvciddO1xuICBjb25zdCBub1JlYWxJUCA9ICFyZXEuaGVhZGVyc1sneC1yZWFsLWlwJ107XG4gIGNvbnN0IG5vRm9yd2FyZGVkSG9zdCA9ICFyZXEuaGVhZGVyc1sneC1mb3J3YXJkZWQtaG9zdCddO1xuXG4gIC8vIENoZWNrIGhvc3RuYW1lXG4gIGNvbnN0IGhvc3RJc0xvY2FsID1cbiAgICByZXEuaG9zdG5hbWUgPT09ICdsb2NhbGhvc3QnIHx8IHJlcS5ob3N0bmFtZSA9PT0gJzEyNy4wLjAuMScgfHwgcmVxLmhvc3RuYW1lID09PSAnWzo6MV0nO1xuXG4gIGxvZ2dlci5kZWJ1ZyhcbiAgICBgTG9jYWwgcmVxdWVzdCBjaGVjayAtIElQOiAke2NsaWVudElwfSwgSG9zdDogJHtyZXEuaG9zdG5hbWV9LCBgICtcbiAgICAgIGBGb3J3YXJkZWQgaGVhZGVyczogJHshbm9Gb3J3YXJkZWRGb3IgfHwgIW5vUmVhbElQIHx8ICFub0ZvcndhcmRlZEhvc3R9YFxuICApO1xuXG4gIHJldHVybiBpcElzTG9jYWwgJiYgbm9Gb3J3YXJkZWRGb3IgJiYgbm9SZWFsSVAgJiYgbm9Gb3J3YXJkZWRIb3N0ICYmIGhvc3RJc0xvY2FsO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2hlY2sgaWYgcmVxdWVzdCBpcyBmcm9tIGxvY2FsaG9zdCAoZm9yIHJldmVyc2UgcHJveHkgc2NlbmFyaW9zKVxuZnVuY3Rpb24gaXNGcm9tTG9jYWxob3N0QWRkcmVzcyhyZXE6IFJlcXVlc3QpOiBib29sZWFuIHtcbiAgY29uc3QgcmVtb3RlQWRkciA9IHJlcS5zb2NrZXQucmVtb3RlQWRkcmVzcztcbiAgcmV0dXJuIHJlbW90ZUFkZHIgPT09ICcxMjcuMC4wLjEnIHx8IHJlbW90ZUFkZHIgPT09ICc6OjEnIHx8IHJlbW90ZUFkZHIgPT09ICc6OmZmZmY6MTI3LjAuMC4xJztcbn1cblxuLy8gVHlwZSBkZWZpbml0aW9uIGZvciBUYWlsc2NhbGUgaGVhZGVyc1xuaW50ZXJmYWNlIFRhaWxzY2FsZUhlYWRlcnMge1xuICAndGFpbHNjYWxlLXVzZXItbG9naW4nPzogc3RyaW5nO1xuICAndGFpbHNjYWxlLXVzZXItbmFtZSc/OiBzdHJpbmc7XG4gICd0YWlsc2NhbGUtdXNlci1wcm9maWxlLXBpYyc/OiBzdHJpbmc7XG59XG5cbi8vIFR5cGUgZm9yIHZhbGlkYXRlZCBUYWlsc2NhbGUgdXNlciBpbmZvcm1hdGlvblxuZXhwb3J0IGludGVyZmFjZSBUYWlsc2NhbGVVc2VyIHtcbiAgbG9naW46IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBwcm9maWxlUGljPzogc3RyaW5nO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY2hlY2sgaWYgcmVxdWVzdCBoYXMgdmFsaWQgVGFpbHNjYWxlIGhlYWRlcnNcbmZ1bmN0aW9uIGdldFRhaWxzY2FsZVVzZXIocmVxOiBSZXF1ZXN0KTogVGFpbHNjYWxlVXNlciB8IG51bGwge1xuICAvLyBUeXBlLXNhZmUgaGVhZGVyIGFjY2Vzc1xuICBjb25zdCBoZWFkZXJzID0gcmVxLmhlYWRlcnMgYXMgdW5rbm93biBhcyBUYWlsc2NhbGVIZWFkZXJzO1xuXG4gIGNvbnN0IGxvZ2luID0gaGVhZGVyc1sndGFpbHNjYWxlLXVzZXItbG9naW4nXTtcbiAgY29uc3QgbmFtZSA9IGhlYWRlcnNbJ3RhaWxzY2FsZS11c2VyLW5hbWUnXTtcbiAgY29uc3QgcHJvZmlsZVBpYyA9IGhlYWRlcnNbJ3RhaWxzY2FsZS11c2VyLXByb2ZpbGUtcGljJ107XG5cbiAgLy8gTXVzdCBoYXZlIGF0IGxlYXN0IGxvZ2luIHRvIGJlIHZhbGlkXG4gIGlmICghbG9naW4pIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbG9naW4sXG4gICAgbmFtZTogbmFtZSB8fCBsb2dpbiwgLy8gRmFsbGJhY2sgdG8gbG9naW4gaWYgbmFtZSBub3QgcHJvdmlkZWRcbiAgICBwcm9maWxlUGljLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXV0aE1pZGRsZXdhcmUoY29uZmlnOiBBdXRoQ29uZmlnKSB7XG4gIHJldHVybiAocmVxOiBBdXRoZW50aWNhdGVkUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XG4gICAgLy8gU2tpcCBhdXRoIGZvciBhdXRoIGVuZHBvaW50cywgY2xpZW50IGxvZ2dpbmcsIHB1c2ggbm90aWZpY2F0aW9ucywgYW5kIFRhaWxzY2FsZSBzdGF0dXNcbiAgICBpZiAoXG4gICAgICByZXEucGF0aC5zdGFydHNXaXRoKCcvYXV0aCcpIHx8XG4gICAgICByZXEucGF0aC5zdGFydHNXaXRoKCcvYXBpL2F1dGgnKSB8fFxuICAgICAgcmVxLnBhdGguc3RhcnRzV2l0aCgnL2xvZ3MnKSB8fFxuICAgICAgcmVxLnBhdGggPT09ICcvc2Vzc2lvbnMvdGFpbHNjYWxlL3N0YXR1cycgfHxcbiAgICAgIHJlcS5wYXRoLnN0YXJ0c1dpdGgoJy9wdXNoJylcbiAgICApIHtcbiAgICAgIC8vIFNwZWNpYWwgY2FzZTogSWYgVGFpbHNjYWxlIGF1dGggaXMgZW5hYmxlZCBhbmQgd2UgaGF2ZSB2YWxpZCBoZWFkZXJzLFxuICAgICAgLy8gc2V0IHRoZSBhdXRoIGluZm8gZXZlbiBmb3IgL2F1dGggZW5kcG9pbnRzIHNvIHRoZSBjbGllbnQga25vd3Mgd2UncmUgYXV0aGVudGljYXRlZFxuICAgICAgaWYgKFxuICAgICAgICBjb25maWcuYWxsb3dUYWlsc2NhbGVBdXRoICYmXG4gICAgICAgIChyZXEucGF0aC5zdGFydHNXaXRoKCcvYXV0aCcpIHx8IHJlcS5wYXRoLnN0YXJ0c1dpdGgoJy9hcGkvYXV0aCcpKVxuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IHRhaWxzY2FsZVVzZXIgPSBnZXRUYWlsc2NhbGVVc2VyKHJlcSk7XG4gICAgICAgIGlmICh0YWlsc2NhbGVVc2VyKSB7XG4gICAgICAgICAgcmVxLmF1dGhNZXRob2QgPSAndGFpbHNjYWxlJztcbiAgICAgICAgICByZXEudXNlcklkID0gdGFpbHNjYWxlVXNlci5sb2dpbjtcbiAgICAgICAgICByZXEudGFpbHNjYWxlVXNlciA9IHRhaWxzY2FsZVVzZXI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgfVxuXG4gICAgLy8gSWYgbm8gYXV0aCBpcyByZXF1aXJlZCwgYWxsb3cgYWxsIHJlcXVlc3RzXG4gICAgaWYgKGNvbmZpZy5ub0F1dGgpIHtcbiAgICAgIHJlcS5hdXRoTWV0aG9kID0gJ25vLWF1dGgnO1xuICAgICAgcmVxLnVzZXJJZCA9ICduby1hdXRoLXVzZXInOyAvLyBTZXQgYSBkZWZhdWx0IHVzZXIgSUQgZm9yIG5vLWF1dGggbW9kZVxuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBmb3IgVGFpbHNjYWxlIGF1dGhlbnRpY2F0aW9uIGlmIGVuYWJsZWRcbiAgICBpZiAoY29uZmlnLmFsbG93VGFpbHNjYWxlQXV0aCkge1xuICAgICAgY29uc3QgdGFpbHNjYWxlVXNlciA9IGdldFRhaWxzY2FsZVVzZXIocmVxKTtcbiAgICAgIGlmICh0YWlsc2NhbGVVc2VyKSB7XG4gICAgICAgIC8vIFNlY3VyaXR5IGNoZWNrOiBFbnN1cmUgcmVxdWVzdCBpcyBmcm9tIGxvY2FsaG9zdCAoVGFpbHNjYWxlIFNlcnZlIHByb3h5KVxuICAgICAgICBpZiAoIWlzRnJvbUxvY2FsaG9zdEFkZHJlc3MocmVxKSkge1xuICAgICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgICAgYFRhaWxzY2FsZSBoZWFkZXJzIHByZXNlbnQgYnV0IHJlcXVlc3Qgbm90IGZyb20gbG9jYWxob3N0OiAke3JlcS5zb2NrZXQucmVtb3RlQWRkcmVzc31gXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDEpLmpzb24oeyBlcnJvcjogJ0ludmFsaWQgcmVxdWVzdCBvcmlnaW4nIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWRkaXRpb25hbCBjaGVjazogVmVyaWZ5IHByb3h5IGhlYWRlcnMgZXhpc3RcbiAgICAgICAgY29uc3QgaGFzUHJveHlIZWFkZXJzID0gISEoXG4gICAgICAgICAgcmVxLmhlYWRlcnNbJ3gtZm9yd2FyZGVkLXByb3RvJ10gJiZcbiAgICAgICAgICByZXEuaGVhZGVyc1sneC1mb3J3YXJkZWQtZm9yJ10gJiZcbiAgICAgICAgICByZXEuaGVhZGVyc1sneC1mb3J3YXJkZWQtaG9zdCddXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKCFoYXNQcm94eUhlYWRlcnMpIHtcbiAgICAgICAgICBsb2dnZXIud2FybignVGFpbHNjYWxlIGhlYWRlcnMgcHJlc2VudCBidXQgbWlzc2luZyBwcm94eSBoZWFkZXJzJyk7XG4gICAgICAgICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAxKS5qc29uKHsgZXJyb3I6ICdJbnZhbGlkIHByb3h5IGNvbmZpZ3VyYXRpb24nIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTG9nIFRhaWxzY2FsZSBhdXRoZW50aWNhdGlvblxuICAgICAgICBsb2dnZXIuaW5mbyhgVGFpbHNjYWxlIGF1dGhlbnRpY2F0aW9uIHN1Y2Nlc3NmdWwgZm9yIHVzZXI6ICR7dGFpbHNjYWxlVXNlci5sb2dpbn1gKTtcbiAgICAgICAgbG9nZ2VyLmluZm8oXG4gICAgICAgICAgYFVzZXIgZGV0YWlscyAtIE5hbWU6ICR7dGFpbHNjYWxlVXNlci5uYW1lfSwgSGFzIHByb2ZpbGUgcGljOiAkeyEhdGFpbHNjYWxlVXNlci5wcm9maWxlUGljfWBcbiAgICAgICAgKTtcblxuICAgICAgICByZXEuYXV0aE1ldGhvZCA9ICd0YWlsc2NhbGUnO1xuICAgICAgICByZXEudXNlcklkID0gdGFpbHNjYWxlVXNlci5sb2dpbjtcbiAgICAgICAgcmVxLnRhaWxzY2FsZVVzZXIgPSB0YWlsc2NhbGVVc2VyO1xuICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBsb2NhbCBieXBhc3MgaWYgZW5hYmxlZFxuICAgIGlmIChjb25maWcuYWxsb3dMb2NhbEJ5cGFzcyAmJiBpc0xvY2FsUmVxdWVzdChyZXEpKSB7XG4gICAgICAvLyBJZiBhIGxvY2FsIGF1dGggdG9rZW4gaXMgY29uZmlndXJlZCwgY2hlY2sgZm9yIGl0XG4gICAgICBpZiAoY29uZmlnLmxvY2FsQXV0aFRva2VuKSB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVkVG9rZW4gPSByZXEuaGVhZGVyc1sneC12aWJldHVubmVsLWxvY2FsJ10gYXMgc3RyaW5nO1xuICAgICAgICBpZiAocHJvdmlkZWRUb2tlbiA9PT0gY29uZmlnLmxvY2FsQXV0aFRva2VuKSB7XG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKCdMb2NhbCByZXF1ZXN0IGF1dGhlbnRpY2F0ZWQgd2l0aCB0b2tlbicpO1xuICAgICAgICAgIHJlcS5hdXRoTWV0aG9kID0gJ2xvY2FsLWJ5cGFzcyc7XG4gICAgICAgICAgcmVxLnVzZXJJZCA9ICdsb2NhbC11c2VyJztcbiAgICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZygnTG9jYWwgcmVxdWVzdCBtaXNzaW5nIG9yIGludmFsaWQgdG9rZW4nKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTm8gdG9rZW4gcmVxdWlyZWQgZm9yIGxvY2FsIGJ5cGFzc1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0xvY2FsIHJlcXVlc3QgYXV0aGVudGljYXRlZCB3aXRob3V0IHRva2VuJyk7XG4gICAgICAgIHJlcS5hdXRoTWV0aG9kID0gJ2xvY2FsLWJ5cGFzcyc7XG4gICAgICAgIHJlcS51c2VySWQgPSAnbG9jYWwtdXNlcic7XG4gICAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT25seSBsb2cgYXV0aCByZXF1ZXN0cyB0aGF0IG1pZ2h0IGJlIHByb2JsZW1hdGljIChubyBoZWFkZXIgb3IgZmFpbHVyZXMpXG4gICAgLy8gUmVtb3ZlIHZlcmJvc2UgbG9nZ2luZyBmb3Igc3VjY2Vzc2Z1bCB0b2tlbiBhdXRoIHRvIHJlZHVjZSBzcGFtXG5cbiAgICBjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcbiAgICBjb25zdCB0b2tlblF1ZXJ5ID0gcmVxLnF1ZXJ5LnRva2VuIGFzIHN0cmluZztcblxuICAgIC8vIENoZWNrIGZvciBCZWFyZXIgdG9rZW5cbiAgICBpZiAoYXV0aEhlYWRlcj8uc3RhcnRzV2l0aCgnQmVhcmVyICcpKSB7XG4gICAgICBjb25zdCB0b2tlbiA9IGF1dGhIZWFkZXIuc3Vic3RyaW5nKDcpO1xuXG4gICAgICAvLyBJbiBIUSBtb2RlLCBjaGVjayBpZiB0aGlzIGlzIGEgdmFsaWQgSFEtdG8tcmVtb3RlIGJlYXJlciB0b2tlblxuICAgICAgaWYgKGNvbmZpZy5pc0hRTW9kZSAmJiBjb25maWcuYmVhcmVyVG9rZW4gJiYgdG9rZW4gPT09IGNvbmZpZy5iZWFyZXJUb2tlbikge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1ZhbGlkIEhRIGJlYXJlciB0b2tlbiBhdXRoZW50aWNhdGlvbicpO1xuICAgICAgICByZXEuaXNIUVJlcXVlc3QgPSB0cnVlO1xuICAgICAgICByZXEuYXV0aE1ldGhvZCA9ICdocS1iZWFyZXInO1xuICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgfVxuXG4gICAgICAvLyBJZiB3ZSBoYXZlIGVuaGFuY2VkIGF1dGggc2VydmljZSBhbmQgU1NIIGtleXMgYXJlIGVuYWJsZWQsIHRyeSBKV1QgdG9rZW4gdmFsaWRhdGlvblxuICAgICAgaWYgKGNvbmZpZy5hdXRoU2VydmljZSAmJiBjb25maWcuZW5hYmxlU1NIS2V5cykge1xuICAgICAgICBjb25zdCB2ZXJpZmljYXRpb24gPSBjb25maWcuYXV0aFNlcnZpY2UudmVyaWZ5VG9rZW4odG9rZW4pO1xuICAgICAgICBpZiAodmVyaWZpY2F0aW9uLnZhbGlkICYmIHZlcmlmaWNhdGlvbi51c2VySWQpIHtcbiAgICAgICAgICByZXEudXNlcklkID0gdmVyaWZpY2F0aW9uLnVzZXJJZDtcbiAgICAgICAgICByZXEuYXV0aE1ldGhvZCA9ICdzc2gta2V5JzsgLy8gSldUIHRva2VucyBhcmUgaXNzdWVkIGZvciBTU0gga2V5IGF1dGhcbiAgICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignSW52YWxpZCBKV1QgdG9rZW4nKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChjb25maWcuYXV0aFNlcnZpY2UpIHtcbiAgICAgICAgY29uc3QgdmVyaWZpY2F0aW9uID0gY29uZmlnLmF1dGhTZXJ2aWNlLnZlcmlmeVRva2VuKHRva2VuKTtcbiAgICAgICAgaWYgKHZlcmlmaWNhdGlvbi52YWxpZCAmJiB2ZXJpZmljYXRpb24udXNlcklkKSB7XG4gICAgICAgICAgcmVxLnVzZXJJZCA9IHZlcmlmaWNhdGlvbi51c2VySWQ7XG4gICAgICAgICAgcmVxLmF1dGhNZXRob2QgPSAncGFzc3dvcmQnOyAvLyBQYXNzd29yZCBhdXRoIG9ubHlcbiAgICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignSW52YWxpZCBKV1QgdG9rZW4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBGb3Igbm9uLUhRIG1vZGUsIGNoZWNrIGlmIGJlYXJlciB0b2tlbiBtYXRjaGVzIHJlbW90ZSBleHBlY3RhdGlvblxuICAgICAgaWYgKCFjb25maWcuaXNIUU1vZGUgJiYgY29uZmlnLmJlYXJlclRva2VuICYmIHRva2VuID09PSBjb25maWcuYmVhcmVyVG9rZW4pIHtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdWYWxpZCByZW1vdGUgYmVhcmVyIHRva2VuIGF1dGhlbnRpY2F0aW9uJyk7XG4gICAgICAgIHJlcS5hdXRoTWV0aG9kID0gJ2hxLWJlYXJlcic7XG4gICAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEJlYXJlciB0b2tlbiByZWplY3RlZCAtIEhRIG1vZGU6ICR7Y29uZmlnLmlzSFFNb2RlfSwgdG9rZW4gbWF0Y2hlczogJHtjb25maWcuYmVhcmVyVG9rZW4gPT09IHRva2VufWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZm9yIHRva2VuIGluIHF1ZXJ5IHBhcmFtZXRlciAoZm9yIEV2ZW50U291cmNlIGNvbm5lY3Rpb25zKVxuICAgIGlmICh0b2tlblF1ZXJ5ICYmIGNvbmZpZy5hdXRoU2VydmljZSkge1xuICAgICAgY29uc3QgdmVyaWZpY2F0aW9uID0gY29uZmlnLmF1dGhTZXJ2aWNlLnZlcmlmeVRva2VuKHRva2VuUXVlcnkpO1xuICAgICAgaWYgKHZlcmlmaWNhdGlvbi52YWxpZCAmJiB2ZXJpZmljYXRpb24udXNlcklkKSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZyhgVmFsaWQgcXVlcnkgdG9rZW4gZm9yIHVzZXI6ICR7dmVyaWZpY2F0aW9uLnVzZXJJZH1gKTtcbiAgICAgICAgcmVxLnVzZXJJZCA9IHZlcmlmaWNhdGlvbi51c2VySWQ7XG4gICAgICAgIHJlcS5hdXRoTWV0aG9kID0gY29uZmlnLmVuYWJsZVNTSEtleXMgPyAnc3NoLWtleScgOiAncGFzc3dvcmQnO1xuICAgICAgICByZXR1cm4gbmV4dCgpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdJbnZhbGlkIHF1ZXJ5IHRva2VuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTm8gdmFsaWQgYXV0aCBwcm92aWRlZFxuICAgIGxvZ2dlci5lcnJvcihgVW5hdXRob3JpemVkIHJlcXVlc3QgdG8gJHtyZXEubWV0aG9kfSAke3JlcS5wYXRofSBmcm9tICR7cmVxLmlwfWApO1xuICAgIHJlcy5zZXRIZWFkZXIoJ1dXVy1BdXRoZW50aWNhdGUnLCAnQmVhcmVyIHJlYWxtPVwiVmliZVR1bm5lbFwiJyk7XG4gICAgcmVzLnN0YXR1cyg0MDEpLmpzb24oeyBlcnJvcjogJ0F1dGhlbnRpY2F0aW9uIHJlcXVpcmVkJyB9KTtcbiAgfTtcbn1cbiJdfQ==