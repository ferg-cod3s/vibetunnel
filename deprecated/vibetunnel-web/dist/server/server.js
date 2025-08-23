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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isShuttingDown = isShuttingDown;
exports.setShuttingDown = setShuttingDown;
exports.createApp = createApp;
exports.startVibeTunnelServer = startVibeTunnelServer;
// VibeTunnel server entry point
const chalk_1 = __importDefault(require("chalk"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto = __importStar(require("crypto"));
const express_1 = __importDefault(require("express"));
const fs = __importStar(require("fs"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const ws_1 = require("ws");
const types_js_1 = require("../shared/types.js");
const api_socket_server_js_1 = require("./api-socket-server.js");
const auth_js_1 = require("./middleware/auth.js");
const index_js_1 = require("./pty/index.js");
const auth_js_2 = require("./routes/auth.js");
const config_js_1 = require("./routes/config.js");
const control_js_1 = require("./routes/control.js");
const events_js_1 = require("./routes/events.js");
const files_js_1 = require("./routes/files.js");
const filesystem_js_1 = require("./routes/filesystem.js");
const git_js_1 = require("./routes/git.js");
const logs_js_1 = require("./routes/logs.js");
const multiplexer_js_1 = require("./routes/multiplexer.js");
const push_js_1 = require("./routes/push.js");
const remotes_js_1 = require("./routes/remotes.js");
const repositories_js_1 = require("./routes/repositories.js");
const sessions_js_1 = require("./routes/sessions.js");
const test_notification_js_1 = require("./routes/test-notification.js");
const tmux_js_1 = require("./routes/tmux.js");
const websocket_input_js_1 = require("./routes/websocket-input.js");
const worktrees_js_1 = require("./routes/worktrees.js");
const activity_monitor_js_1 = require("./services/activity-monitor.js");
const auth_service_js_1 = require("./services/auth-service.js");
const buffer_aggregator_js_1 = require("./services/buffer-aggregator.js");
const config_service_js_1 = require("./services/config-service.js");
const control_dir_watcher_js_1 = require("./services/control-dir-watcher.js");
const hq_client_js_1 = require("./services/hq-client.js");
const mdns_service_js_1 = require("./services/mdns-service.js");
const push_notification_service_js_1 = require("./services/push-notification-service.js");
const remote_registry_js_1 = require("./services/remote-registry.js");
const session_monitor_js_1 = require("./services/session-monitor.js");
const stream_watcher_js_1 = require("./services/stream-watcher.js");
const tailscale_serve_service_js_1 = require("./services/tailscale-serve-service.js");
const terminal_manager_js_1 = require("./services/terminal-manager.js");
const logger_js_1 = require("./utils/logger.js");
const vapid_manager_js_1 = require("./utils/vapid-manager.js");
const version_js_1 = require("./version.js");
const control_unix_handler_js_1 = require("./websocket/control-unix-handler.js");
const logger = (0, logger_js_1.createLogger)('server');
// Global shutdown state management
let shuttingDown = false;
function isShuttingDown() {
    return shuttingDown;
}
function setShuttingDown(value) {
    shuttingDown = value;
}
// Show help message
function showHelp() {
    console.log(`
VibeTunnel Server - Terminal Multiplexer

Usage: vibetunnel-server [options]

Options:
  --help                Show this help message
  --version             Show version information
  --port <number>       Server port (default: 4020 or PORT env var)
  --bind <address>      Bind address (default: 0.0.0.0, all interfaces)
  --enable-ssh-keys     Enable SSH key authentication UI and functionality
  --disallow-user-password  Disable password auth, SSH keys only (auto-enables --enable-ssh-keys)
  --no-auth             Disable authentication (auto-login as current user)
  --allow-local-bypass  Allow localhost connections to bypass authentication
  --local-auth-token <token>  Token for localhost authentication bypass
  --enable-tailscale-serve  Enable Tailscale Serve integration (auto-manages proxy and auth)
  --debug               Enable debug logging

Push Notification Options:
  --push-enabled        Enable push notifications (default: enabled)
  --push-disabled       Disable push notifications
  --vapid-email <email> Contact email for VAPID (or PUSH_CONTACT_EMAIL env var)
  --generate-vapid-keys Generate new VAPID keys if none exist

Network Discovery Options:
  --no-mdns             Disable mDNS/Bonjour advertisement (enabled by default)

HQ Mode Options:
  --hq                  Run as HQ (headquarters) server

Remote Server Options:
  --hq-url <url>        HQ server URL to register with
  --hq-username <user>  Username for HQ authentication
  --hq-password <pass>  Password for HQ authentication
  --name <name>         Unique name for this remote server
  --allow-insecure-hq   Allow HTTP URLs for HQ (default: HTTPS only)
  --no-hq-auth          Disable HQ authentication (for testing only)

Environment Variables:
  PORT                  Default port if --port not specified
  VIBETUNNEL_USERNAME   Default username if --username not specified
  VIBETUNNEL_PASSWORD   Default password if --password not specified
  VIBETUNNEL_CONTROL_DIR Control directory for session data
  PUSH_CONTACT_EMAIL    Contact email for VAPID configuration

Examples:
  # Run a simple server with authentication
  vibetunnel-server --username admin --password secret

  # Run as HQ server
  vibetunnel-server --hq --username hq-admin --password hq-secret

  # Run as remote server registering with HQ
  vibetunnel-server --username local --password local123 \\
    --hq-url https://hq.example.com \\
    --hq-username hq-admin --hq-password hq-secret \\
    --name remote-1
`);
}
// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        port: null,
        bind: null,
        enableSSHKeys: false,
        disallowUserPassword: false,
        noAuth: false,
        isHQMode: false,
        hqUrl: null,
        hqUsername: null,
        hqPassword: null,
        remoteName: null,
        allowInsecureHQ: false,
        showHelp: false,
        showVersion: false,
        debug: false,
        // Push notification configuration
        pushEnabled: true, // Enable by default with auto-generation
        vapidEmail: null,
        generateVapidKeys: true, // Generate keys automatically
        bellNotificationsEnabled: true, // Enable bell notifications by default
        // Local bypass configuration
        allowLocalBypass: false,
        localAuthToken: null,
        // Tailscale Serve integration (manages auth and proxy)
        enableTailscaleServe: false,
        // HQ auth bypass for testing
        noHqAuth: false,
        // mDNS advertisement
        enableMDNS: true, // Enable mDNS by default
    };
    // Check for help flag first
    if (args.includes('--help') || args.includes('-h')) {
        config.showHelp = true;
        return config;
    }
    // Check for version flag
    if (args.includes('--version') || args.includes('-v')) {
        config.showVersion = true;
        return config;
    }
    // Check for command line arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && i + 1 < args.length) {
            config.port = Number.parseInt(args[i + 1], 10);
            i++; // Skip the port value in next iteration
        }
        else if (args[i] === '--bind' && i + 1 < args.length) {
            config.bind = args[i + 1];
            i++; // Skip the bind value in next iteration
        }
        else if (args[i] === '--enable-ssh-keys') {
            config.enableSSHKeys = true;
        }
        else if (args[i] === '--disallow-user-password') {
            config.disallowUserPassword = true;
            config.enableSSHKeys = true; // Auto-enable SSH keys
        }
        else if (args[i] === '--no-auth') {
            config.noAuth = true;
        }
        else if (args[i] === '--hq') {
            config.isHQMode = true;
        }
        else if (args[i] === '--hq-url' && i + 1 < args.length) {
            config.hqUrl = args[i + 1];
            i++; // Skip the URL value in next iteration
        }
        else if (args[i] === '--hq-username' && i + 1 < args.length) {
            config.hqUsername = args[i + 1];
            i++; // Skip the username value in next iteration
        }
        else if (args[i] === '--hq-password' && i + 1 < args.length) {
            config.hqPassword = args[i + 1];
            i++; // Skip the password value in next iteration
        }
        else if (args[i] === '--name' && i + 1 < args.length) {
            config.remoteName = args[i + 1];
            i++; // Skip the name value in next iteration
        }
        else if (args[i] === '--allow-insecure-hq') {
            config.allowInsecureHQ = true;
        }
        else if (args[i] === '--debug') {
            config.debug = true;
        }
        else if (args[i] === '--push-enabled') {
            config.pushEnabled = true;
        }
        else if (args[i] === '--push-disabled') {
            config.pushEnabled = false;
        }
        else if (args[i] === '--vapid-email' && i + 1 < args.length) {
            config.vapidEmail = args[i + 1];
            i++; // Skip the email value in next iteration
        }
        else if (args[i] === '--generate-vapid-keys') {
            config.generateVapidKeys = true;
        }
        else if (args[i] === '--allow-local-bypass') {
            config.allowLocalBypass = true;
        }
        else if (args[i] === '--local-auth-token' && i + 1 < args.length) {
            config.localAuthToken = args[i + 1];
            i++; // Skip the token value in next iteration
        }
        else if (args[i] === '--enable-tailscale-serve') {
            config.enableTailscaleServe = true;
        }
        else if (args[i] === '--no-hq-auth') {
            config.noHqAuth = true;
        }
        else if (args[i] === '--no-mdns') {
            config.enableMDNS = false;
        }
        else if (args[i].startsWith('--')) {
            // Unknown argument
            logger.error(`Unknown argument: ${args[i]}`);
            logger.error('Use --help to see available options');
            process.exit(1);
        }
    }
    // Check environment variables for push notifications
    if (!config.vapidEmail && process.env.PUSH_CONTACT_EMAIL) {
        config.vapidEmail = process.env.PUSH_CONTACT_EMAIL;
    }
    return config;
}
// Validate configuration
function validateConfig(config) {
    // Validate auth configuration
    if (config.noAuth && (config.enableSSHKeys || config.disallowUserPassword)) {
        logger.warn('--no-auth overrides all other authentication settings (authentication is disabled)');
    }
    if (config.disallowUserPassword && !config.enableSSHKeys) {
        logger.warn('--disallow-user-password requires SSH keys, auto-enabling --enable-ssh-keys');
        config.enableSSHKeys = true;
    }
    // Validate HQ registration configuration
    if (config.hqUrl && (!config.hqUsername || !config.hqPassword) && !config.noHqAuth) {
        logger.error('HQ username and password required when --hq-url is specified');
        logger.error('Use --hq-username and --hq-password with --hq-url');
        logger.error('Or use --no-hq-auth for testing without authentication');
        process.exit(1);
    }
    // Validate remote name is provided when registering with HQ
    if (config.hqUrl && !config.remoteName) {
        logger.error('Remote name required when --hq-url is specified');
        logger.error('Use --name to specify a unique name for this remote server');
        process.exit(1);
    }
    // Validate HQ URL is HTTPS unless explicitly allowed
    if (config.hqUrl && !config.hqUrl.startsWith('https://') && !config.allowInsecureHQ) {
        logger.error('HQ URL must use HTTPS protocol');
        logger.error('Use --allow-insecure-hq to allow HTTP for testing');
        process.exit(1);
    }
    // Validate HQ registration configuration
    if ((config.hqUrl || config.hqUsername || config.hqPassword) &&
        (!config.hqUrl || !config.hqUsername || !config.hqPassword) &&
        !config.noHqAuth) {
        logger.error('All HQ parameters required: --hq-url, --hq-username, --hq-password');
        logger.error('Or use --no-hq-auth for testing without authentication');
        process.exit(1);
    }
    // Validate Tailscale configuration
    if (config.enableTailscaleServe && config.bind === '0.0.0.0') {
        logger.error('Security Error: Cannot bind to 0.0.0.0 when using Tailscale Serve');
        logger.error('Tailscale Serve requires binding to localhost (127.0.0.1)');
        logger.error('Use --bind 127.0.0.1 or disable Tailscale Serve');
        process.exit(1);
    }
    // Can't be both HQ mode and register with HQ
    if (config.isHQMode && config.hqUrl) {
        logger.error('Cannot use --hq and --hq-url together');
        logger.error('Use --hq to run as HQ server, or --hq-url to register with an HQ');
        process.exit(1);
    }
    // Warn about no-hq-auth
    if (config.noHqAuth && config.hqUrl) {
        logger.warn('--no-hq-auth is enabled: Remote servers can register without authentication');
        logger.warn('This should only be used for testing!');
    }
}
// Track if app has been created
let appCreated = false;
async function createApp() {
    // Prevent multiple app instances
    if (appCreated) {
        logger.error('App already created, preventing duplicate instance');
        throw new Error('Duplicate app creation detected');
    }
    appCreated = true;
    const config = parseArgs();
    // Check if help was requested
    if (config.showHelp) {
        showHelp();
        process.exit(0);
    }
    // Check if version was requested
    if (config.showVersion) {
        const versionInfo = (0, version_js_1.getVersionInfo)();
        console.log(`VibeTunnel Server v${versionInfo.version}`);
        console.log(`Built: ${versionInfo.buildDate}`);
        console.log(`Platform: ${versionInfo.platform}/${versionInfo.arch}`);
        console.log(`Node: ${versionInfo.nodeVersion}`);
        process.exit(0);
    }
    // Print version banner on startup
    (0, version_js_1.printVersionBanner)();
    validateConfig(config);
    logger.log('Initializing VibeTunnel server components');
    const app = (0, express_1.default)();
    const server = (0, http_1.createServer)(app);
    const wss = new ws_1.WebSocketServer({ noServer: true, perMessageDeflate: true });
    // Add security headers with Helmet
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: false, // We handle CSP ourselves for the web terminal
        crossOriginEmbedderPolicy: false, // Allow embedding in iframes for integrations
    }));
    logger.debug('Configured security headers with helmet');
    // Add cookie parser middleware for CSRF token handling
    app.use((0, cookie_parser_1.default)());
    logger.debug('Configured cookie parser middleware');
    // Add CSRF protection for state-changing operations using Double-Submit Cookie pattern
    app.use((req, res, next) => {
        // Skip CSRF protection for read-only operations
        if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
            return next();
        }
        // Skip CSRF for WebSocket upgrade requests
        if (req.headers.upgrade === 'websocket') {
            return next();
        }
        // Skip CSRF for authentication routes
        if (req.path === '/api/auth/password' || req.path === '/api/auth/ssh-key') {
            return next();
        }
        // Skip CSRF for authenticated API requests using Bearer tokens
        // JWT Bearer tokens are not vulnerable to CSRF attacks since they require
        // explicit JavaScript access and are not sent automatically by browsers
        if (req.headers.authorization?.startsWith('Bearer ')) {
            return next();
        }
        // For requests without Bearer tokens, enforce CSRF protection
        // This protects any cookie-based or sessionless endpoints
        const csrfToken = req.headers['x-csrf-token'];
        const csrfCookie = req.cookies?.['csrf-token'];
        // Allow requests with valid CSRF token-cookie pair
        if (csrfToken && csrfCookie && csrfToken === csrfCookie) {
            return next();
        }
        // Block potentially malicious cross-site requests
        logger.warn(`CSRF protection blocked request to ${req.path} from ${req.ip}`, {
            hasToken: !!csrfToken,
            hasCookie: !!csrfCookie,
            tokensMatch: csrfToken === csrfCookie,
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
        });
        return res.status(403).json({
            error: 'CSRF token missing or invalid',
            details: 'Cross-site request forgery protection requires matching CSRF token',
        });
    });
    logger.debug('Configured CSRF protection using Double-Submit Cookie pattern');
    // Add compression middleware with Brotli support
    // Skip compression for SSE streams (asciicast and events)
    app.use((0, compression_1.default)({
        filter: (req, res) => {
            // Skip compression for Server-Sent Events
            if (req.path.match(/\/api\/sessions\/[^/]+\/stream$/) || req.path === '/api/events') {
                return false;
            }
            // Use default filter for other requests
            return compression_1.default.filter(req, res);
        },
        // Enable Brotli compression with highest priority
        level: 6, // Balanced compression level
    }));
    logger.debug('Configured compression middleware (with SSE exclusion)');
    // Add JSON body parser middleware with size limit
    app.use(express_1.default.json({ limit: '10mb' }));
    // Add cookie parser middleware for CSRF protection
    app.use((0, cookie_parser_1.default)());
    logger.debug('Configured express middleware with cookie parser');
    // Control directory for session data
    const CONTROL_DIR = process.env.VIBETUNNEL_CONTROL_DIR || path.join(os.homedir(), '.vibetunnel/control');
    // Ensure control directory exists
    if (!fs.existsSync(CONTROL_DIR)) {
        fs.mkdirSync(CONTROL_DIR, { recursive: true });
        logger.log(chalk_1.default.green(`Created control directory: ${CONTROL_DIR}`));
    }
    else {
        logger.debug(`Using existing control directory: ${CONTROL_DIR}`);
    }
    // Initialize PTY manager with fallback support
    await index_js_1.PtyManager.initialize();
    const ptyManager = new index_js_1.PtyManager(CONTROL_DIR);
    logger.debug('Initialized PTY manager');
    // Clean up sessions from old VibeTunnel versions
    const sessionManager = ptyManager.getSessionManager();
    const cleanupResult = sessionManager.cleanupOldVersionSessions();
    if (cleanupResult.versionChanged) {
        logger.log(chalk_1.default.yellow(`Version change detected - cleaned up ${cleanupResult.cleanedCount} sessions from previous version`));
    }
    else if (cleanupResult.cleanedCount > 0) {
        logger.log(chalk_1.default.yellow(`Cleaned up ${cleanupResult.cleanedCount} legacy sessions without version information`));
    }
    // Initialize Terminal Manager for server-side terminal state
    const terminalManager = new terminal_manager_js_1.TerminalManager(CONTROL_DIR);
    logger.debug('Initialized terminal manager');
    // Set up periodic cleanup to prevent memory leaks
    const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
    const cleanupInterval = setInterval(() => {
        try {
            // Clean up inactive terminals older than 4 hours
            terminalManager.cleanupInactiveTerminals(4 * 60 * 60 * 1000);
            // Clean up exited sessions
            ptyManager.cleanupExitedSessions();
        }
        catch (error) {
            logger.warn('Error during periodic cleanup:', error);
        }
    }, CLEANUP_INTERVAL);
    // Clean up interval on shutdown
    process.on('exit', () => {
        clearInterval(cleanupInterval);
    });
    // Initialize stream watcher for file-based streaming
    const streamWatcher = new stream_watcher_js_1.StreamWatcher(sessionManager);
    logger.debug('Initialized stream watcher');
    // Initialize session monitor with PTY manager
    const sessionMonitor = new session_monitor_js_1.SessionMonitor(ptyManager);
    await sessionMonitor.initialize();
    // Set the session monitor on PTY manager for data tracking
    ptyManager.setSessionMonitor(sessionMonitor);
    logger.debug('Initialized session monitor');
    // Initialize activity monitor
    const activityMonitor = new activity_monitor_js_1.ActivityMonitor(CONTROL_DIR);
    logger.debug('Initialized activity monitor');
    // Initialize configuration service
    const configService = new config_service_js_1.ConfigService();
    configService.startWatching();
    logger.debug('Initialized configuration service');
    // Initialize push notification services
    let vapidManager = null;
    let pushNotificationService = null;
    if (config.pushEnabled) {
        try {
            logger.log('Initializing push notification services');
            // Initialize VAPID manager with auto-generation
            vapidManager = new vapid_manager_js_1.VapidManager();
            await vapidManager.initialize({
                contactEmail: config.vapidEmail || 'noreply@vibetunnel.local',
                generateIfMissing: true, // Auto-generate keys if none exist
            });
            logger.log('VAPID keys initialized successfully');
            // Initialize push notification service
            pushNotificationService = new push_notification_service_js_1.PushNotificationService(vapidManager);
            await pushNotificationService.initialize();
            logger.log(chalk_1.default.green('Push notification services initialized'));
        }
        catch (error) {
            logger.error('Failed to initialize push notification services:', error);
            logger.warn('Continuing without push notifications');
            vapidManager = null;
            pushNotificationService = null;
        }
    }
    else {
        logger.debug('Push notifications disabled');
    }
    // Connect SessionMonitor to push notification service
    if (sessionMonitor && pushNotificationService) {
        logger.info('Connecting SessionMonitor to push notification service');
        // Listen for session monitor notifications and send push notifications
        sessionMonitor.on('notification', async (event) => {
            try {
                // Map event types to push notification data
                let pushPayload = null;
                switch (event.type) {
                    case types_js_1.ServerEventType.SessionStart:
                        pushPayload = {
                            type: 'session-start',
                            title: '🚀 Session Started',
                            body: event.sessionName || 'Terminal Session',
                        };
                        break;
                    case types_js_1.ServerEventType.SessionExit:
                        pushPayload = {
                            type: 'session-exit',
                            title: '🏁 Session Ended',
                            body: event.sessionName || 'Terminal Session',
                            data: { exitCode: event.exitCode },
                        };
                        break;
                    case types_js_1.ServerEventType.CommandFinished:
                        pushPayload = {
                            type: 'command-finished',
                            title: '✅ Your Turn',
                            body: event.command || 'Command completed',
                            data: { duration: event.duration },
                        };
                        break;
                    case types_js_1.ServerEventType.CommandError:
                        pushPayload = {
                            type: 'command-error',
                            title: '❌ Command Failed',
                            body: event.command || 'Command failed',
                            data: { exitCode: event.exitCode },
                        };
                        break;
                    case types_js_1.ServerEventType.Bell:
                        pushPayload = {
                            type: 'bell',
                            title: '🔔 Terminal Bell',
                            body: event.sessionName || 'Terminal',
                        };
                        break;
                    case types_js_1.ServerEventType.ClaudeTurn:
                        pushPayload = {
                            type: 'claude-turn',
                            title: '💬 Your Turn',
                            body: event.message || 'Claude has finished responding',
                        };
                        break;
                    case types_js_1.ServerEventType.TestNotification:
                        // Test notifications are already handled by the test endpoint
                        return;
                    default:
                        return; // Skip unknown event types
                }
                if (pushPayload) {
                    // Send push notification
                    const result = await pushNotificationService.sendNotification({
                        ...pushPayload,
                        icon: '/apple-touch-icon.png',
                        badge: '/favicon-32.png',
                        tag: `vibetunnel-${pushPayload.type}`,
                        requireInteraction: pushPayload.type === 'command-error',
                        actions: [
                            {
                                action: 'view-session',
                                title: 'View Session',
                            },
                            {
                                action: 'dismiss',
                                title: 'Dismiss',
                            },
                        ],
                        data: {
                            ...pushPayload.data,
                            type: pushPayload.type,
                            sessionId: event.sessionId,
                            timestamp: event.timestamp,
                        },
                    });
                    logger.debug(`Push notification sent for ${event.type}: ${result.sent} successful, ${result.failed} failed`);
                }
            }
            catch (error) {
                logger.error('Failed to send push notification for SessionMonitor event:', error);
            }
        });
    }
    // Initialize HQ components
    let remoteRegistry = null;
    let hqClient = null;
    let controlDirWatcher = null;
    let bufferAggregator = null;
    let remoteBearerToken = null;
    if (config.isHQMode) {
        remoteRegistry = new remote_registry_js_1.RemoteRegistry();
        logger.log(chalk_1.default.green('Running in HQ mode'));
        logger.debug('Initialized remote registry for HQ mode');
    }
    else if (config.hqUrl &&
        config.remoteName &&
        (config.noHqAuth || (config.hqUsername && config.hqPassword))) {
        // Generate bearer token for this remote server
        remoteBearerToken = (0, uuid_1.v4)();
        logger.debug(`Generated bearer token for remote server: ${config.remoteName}`);
    }
    // Initialize authentication service
    const authService = new auth_service_js_1.AuthService();
    logger.debug('Initialized authentication service');
    // Initialize buffer aggregator
    bufferAggregator = new buffer_aggregator_js_1.BufferAggregator({
        terminalManager,
        remoteRegistry,
        isHQMode: config.isHQMode,
    });
    logger.debug('Initialized buffer aggregator');
    // Initialize WebSocket input handler
    const websocketInputHandler = new websocket_input_js_1.WebSocketInputHandler({
        ptyManager,
        terminalManager,
        activityMonitor,
        remoteRegistry,
        authService,
        isHQMode: config.isHQMode,
    });
    logger.debug('Initialized WebSocket input handler');
    // Set up authentication
    const authMiddleware = (0, auth_js_1.createAuthMiddleware)({
        enableSSHKeys: config.enableSSHKeys,
        disallowUserPassword: config.disallowUserPassword,
        noAuth: config.noAuth,
        isHQMode: config.isHQMode,
        bearerToken: remoteBearerToken || undefined, // Token that HQ must use to auth with us
        authService, // Add enhanced auth service for JWT tokens
        allowLocalBypass: config.allowLocalBypass,
        localAuthToken: config.localAuthToken || undefined,
        allowTailscaleAuth: config.enableTailscaleServe,
    });
    // Serve static files with .html extension handling and caching headers
    // In production/bundled mode, use the package directory; in development, use cwd
    const getPublicPath = () => {
        // First check if BUILD_PUBLIC_PATH is set (used by Mac app bundle)
        if (process.env.BUILD_PUBLIC_PATH) {
            logger.info(`Using BUILD_PUBLIC_PATH: ${process.env.BUILD_PUBLIC_PATH}`);
            return process.env.BUILD_PUBLIC_PATH;
        }
        // More precise npm package detection:
        // 1. Check if we're explicitly in an npm package structure
        // 2. The file should be in node_modules/vibetunnel/lib/
        // 3. Or check for our specific package markers
        const isNpmPackage = (() => {
            // Most reliable: check if we're in node_modules/vibetunnel structure
            if (__filename.includes(path.join('node_modules', 'vibetunnel', 'lib'))) {
                return true;
            }
            // Check for Windows path variant
            if (__filename.includes('node_modules\\vibetunnel\\lib')) {
                return true;
            }
            // Secondary check: if we're in a lib directory, verify it's actually an npm package
            // by checking for the existence of package.json in the parent directory
            if (path.basename(__dirname) === 'lib') {
                const parentDir = path.dirname(__dirname);
                const packageJsonPath = path.join(parentDir, 'package.json');
                try {
                    const packageJson = require(packageJsonPath);
                    // Verify this is actually our package
                    return packageJson.name === 'vibetunnel';
                }
                catch {
                    // Not a valid npm package structure
                    return false;
                }
            }
            return false;
        })();
        if (process.env.VIBETUNNEL_BUNDLED === 'true' || process.env.BUILD_DATE || isNpmPackage) {
            // In bundled/production/npm mode, find package root
            // When bundled, __dirname is /path/to/package/dist, so go up one level
            // When globally installed, we need to find the package root
            let packageRoot = __dirname;
            // If we're in the dist directory, go up one level
            if (path.basename(packageRoot) === 'dist') {
                packageRoot = path.dirname(packageRoot);
            }
            // For npm package context, if we're in lib directory, go up one level
            if (path.basename(packageRoot) === 'lib') {
                packageRoot = path.dirname(packageRoot);
            }
            // Look for package.json to confirm we're in the right place
            const publicPath = path.join(packageRoot, 'public');
            const indexPath = path.join(publicPath, 'index.html');
            // If index.html exists, we found the right path
            if (require('fs').existsSync(indexPath)) {
                return publicPath;
            }
            // Fallback: try going up from the bundled CLI location
            // The bundled CLI might be in node_modules/vibetunnel/dist/
            return path.join(__dirname, '..', 'public');
        }
        else {
            // In development mode, use current working directory
            return path.join(process.cwd(), 'public');
        }
    };
    const publicPath = getPublicPath();
    const isDevelopment = !process.env.BUILD_DATE || process.env.NODE_ENV === 'development';
    app.use(express_1.default.static(publicPath, {
        extensions: ['html'], // This allows /logs to resolve to /logs.html
        maxAge: isDevelopment ? 0 : '1d', // No cache in dev, 1 day in production
        etag: !isDevelopment, // Disable ETag in development
        lastModified: !isDevelopment, // Disable Last-Modified in development
        setHeaders: (res, filePath) => {
            if (isDevelopment) {
                // Disable all caching in development
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            else {
                // Production caching rules
                // Set longer cache for immutable assets
                if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
                // Shorter cache for HTML files
                else if (filePath.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
                }
            }
        },
    }));
    logger.debug(`Serving static files from: ${publicPath} ${isDevelopment ? 'with caching disabled (dev mode)' : 'with caching headers'}`);
    // Health check endpoint (no auth required)
    app.get('/api/health', (_req, res) => {
        const versionInfo = (0, version_js_1.getVersionInfo)();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            mode: config.isHQMode ? 'hq' : 'remote',
            version: versionInfo.version,
            buildDate: versionInfo.buildDate,
            uptime: versionInfo.uptime,
            pid: versionInfo.pid,
        });
    });
    // CSRF token endpoint (no auth required for token generation)
    app.get('/api/csrf-token', (_req, res) => {
        // Generate a cryptographically secure random token
        const csrfToken = require('crypto').randomBytes(32).toString('hex');
        // Set the CSRF token as an HTTP-only cookie for security
        res.cookie('csrf-token', csrfToken, {
            httpOnly: false, // Must be accessible to JavaScript for header inclusion
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'strict', // Prevent cross-site cookie usage
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/',
        });
        // Also return in response body for immediate use
        res.json({
            csrfToken,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
        });
    });
    // Connect session exit notifications if push notifications are enabled
    if (pushNotificationService) {
        ptyManager.on('sessionExited', (sessionId) => {
            // Load session info to get details
            const sessionInfo = sessionManager.loadSessionInfo(sessionId);
            const exitCode = sessionInfo?.exitCode ?? 0;
            const sessionName = sessionInfo?.name || `Session ${sessionId}`;
            // Determine notification type based on exit code
            const notificationType = exitCode === 0 ? 'session-exit' : 'session-error';
            const title = exitCode === 0 ? 'Session Ended' : 'Session Ended with Errors';
            const body = exitCode === 0
                ? `${sessionName} has finished.`
                : `${sessionName} exited with code ${exitCode}.`;
            pushNotificationService
                .sendNotification({
                type: notificationType,
                title,
                body,
                icon: '/apple-touch-icon.png',
                badge: '/favicon-32.png',
                tag: `vibetunnel-${notificationType}-${sessionId}`,
                requireInteraction: false,
                data: {
                    type: notificationType,
                    sessionId,
                    sessionName,
                    exitCode,
                    timestamp: new Date().toISOString(),
                },
                actions: [
                    { action: 'view-logs', title: 'View Logs' },
                    { action: 'dismiss', title: 'Dismiss' },
                ],
            })
                .catch((error) => {
                logger.error('Failed to send session exit notification:', error);
            });
        });
        logger.debug('Connected session exit notifications to PTY manager');
        // Connect command finished notifications
        ptyManager.on('commandFinished', ({ sessionId, command, exitCode, duration, timestamp }) => {
            const isClaudeCommand = command.toLowerCase().includes('claude');
            // Enhanced logging for Claude commands
            if (isClaudeCommand) {
                logger.log(chalk_1.default.magenta(`📬 Server received Claude commandFinished event: sessionId=${sessionId}, command="${command}", exitCode=${exitCode}, duration=${duration}ms`));
            }
            else {
                logger.debug(`Server received commandFinished event for session ${sessionId}: "${command}"`);
            }
            // Determine notification type based on exit code
            const notificationType = exitCode === 0 ? 'command-finished' : 'command-error';
            const title = exitCode === 0 ? 'Command Completed' : 'Command Failed';
            const body = exitCode === 0
                ? `${command} completed successfully`
                : `${command} failed with exit code ${exitCode}`;
            // Format duration for display
            const durationStr = duration > 60000
                ? `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
                : `${Math.round(duration / 1000)}s`;
            logger.debug(`Sending push notification: type=${notificationType}, title="${title}", body="${body} (${durationStr})"`);
            pushNotificationService
                .sendNotification({
                type: notificationType,
                title,
                body: `${body} (${durationStr})`,
                icon: '/apple-touch-icon.png',
                badge: '/favicon-32.png',
                tag: `vibetunnel-command-${sessionId}-${Date.now()}`,
                requireInteraction: false,
                data: {
                    type: notificationType,
                    sessionId,
                    command,
                    exitCode,
                    duration,
                    timestamp,
                },
                actions: [
                    { action: 'view-session', title: 'View Session' },
                    { action: 'dismiss', title: 'Dismiss' },
                ],
            })
                .catch((error) => {
                logger.error('Failed to send command finished notification:', error);
            });
        });
        logger.debug('Connected command finished notifications to PTY manager');
        // Connect Claude turn notifications
        ptyManager.on('claudeTurn', (sessionId, sessionName) => {
            logger.info(`🔔 NOTIFICATION DEBUG: Sending push notification for Claude turn - sessionId: ${sessionId}`);
            pushNotificationService
                .sendNotification({
                type: 'claude-turn',
                title: 'Claude Ready',
                body: `${sessionName} is waiting for your input.`,
                icon: '/apple-touch-icon.png',
                badge: '/favicon-32.png',
                tag: `vibetunnel-claude-turn-${sessionId}`,
                requireInteraction: true,
                data: {
                    type: 'claude-turn',
                    sessionId,
                    sessionName,
                    timestamp: new Date().toISOString(),
                },
                actions: [
                    { action: 'view-session', title: 'View Session' },
                    { action: 'dismiss', title: 'Dismiss' },
                ],
            })
                .catch((error) => {
                logger.error('Failed to send Claude turn notification:', error);
            });
        });
        logger.debug('Connected Claude turn notifications to PTY manager');
    }
    // CSRF token endpoint (no auth required, used by frontend)
    app.get('/api/csrf-token', (_req, res) => {
        try {
            // Generate a cryptographically secure random token (32 bytes = 64 hex chars)
            const csrfToken = crypto.randomBytes(32).toString('hex');
            const isDevelopment = !process.env.BUILD_DATE || process.env.NODE_ENV === 'development';
            // Set CSRF token in cookie with secure settings
            res.cookie('csrf-token', csrfToken, {
                httpOnly: false, // Must be accessible to JavaScript
                secure: !isDevelopment, // Only send over HTTPS in production
                sameSite: 'strict', // Strict same-site policy for CSRF protection
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                path: '/', // Available site-wide
            });
            // Also return in response body for immediate use
            res.json({
                csrfToken,
                expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
            });
            logger.debug('Generated CSRF token for client');
        }
        catch (error) {
            logger.error('Error generating CSRF token:', error);
            res.status(500).json({ error: 'Failed to generate CSRF token' });
        }
    });
    // Apply auth middleware to all API routes (including auth routes for Tailscale header detection)
    app.use('/api', authMiddleware);
    logger.debug('Applied authentication middleware to /api routes');
    // Mount authentication routes (auth middleware will skip these but still check Tailscale headers)
    app.use('/api/auth', (0, auth_js_2.createAuthRoutes)({
        authService,
        enableSSHKeys: config.enableSSHKeys,
        disallowUserPassword: config.disallowUserPassword,
        noAuth: config.noAuth,
    }));
    logger.debug('Mounted authentication routes');
    // Mount routes
    app.use('/api', (0, sessions_js_1.createSessionRoutes)({
        ptyManager,
        terminalManager,
        streamWatcher,
        remoteRegistry,
        isHQMode: config.isHQMode,
        activityMonitor,
    }));
    logger.debug('Mounted session routes');
    app.use('/api', (0, remotes_js_1.createRemoteRoutes)({
        remoteRegistry,
        isHQMode: config.isHQMode,
    }));
    logger.debug('Mounted remote routes');
    // Mount filesystem routes
    app.use('/api', (0, filesystem_js_1.createFilesystemRoutes)());
    logger.debug('Mounted filesystem routes');
    // Mount log routes
    app.use('/api', (0, logs_js_1.createLogRoutes)());
    logger.debug('Mounted log routes');
    // Mount file routes
    app.use('/api', (0, files_js_1.createFileRoutes)());
    logger.debug('Mounted file routes');
    // Mount repository routes
    app.use('/api', (0, repositories_js_1.createRepositoryRoutes)());
    logger.debug('Mounted repository routes');
    // Mount config routes
    app.use('/api', (0, config_js_1.createConfigRoutes)({
        configService,
    }));
    logger.debug('Mounted config routes');
    // Mount Git routes
    app.use('/api', (0, git_js_1.createGitRoutes)());
    logger.debug('Mounted Git routes');
    // Mount worktree routes
    app.use('/api', (0, worktrees_js_1.createWorktreeRoutes)());
    logger.debug('Mounted worktree routes');
    // Mount control routes
    app.use('/api', (0, control_js_1.createControlRoutes)());
    logger.debug('Mounted control routes');
    // Mount tmux routes
    app.use('/api/tmux', (0, tmux_js_1.createTmuxRoutes)({ ptyManager }));
    logger.debug('Mounted tmux routes');
    // Mount multiplexer routes (unified tmux/zellij interface)
    app.use('/api/multiplexer', (0, multiplexer_js_1.createMultiplexerRoutes)({ ptyManager }));
    logger.debug('Mounted multiplexer routes');
    // Mount push notification routes - always mount even if VAPID is not initialized
    // This ensures proper error responses instead of 404s
    app.use('/api', (0, push_js_1.createPushRoutes)({
        vapidManager: vapidManager || new vapid_manager_js_1.VapidManager(), // Pass a dummy instance if null
        pushNotificationService,
        sessionMonitor,
    }));
    logger.debug('Mounted push notification routes');
    // Mount events router for SSE streaming
    app.use('/api', (0, events_js_1.createEventsRouter)(sessionMonitor));
    logger.debug('Mounted events routes');
    // Mount test notification router
    app.use('/api', (0, test_notification_js_1.createTestNotificationRouter)({ sessionMonitor, pushNotificationService }));
    logger.debug('Mounted test notification routes');
    // Initialize control socket
    try {
        await control_unix_handler_js_1.controlUnixHandler.start();
        logger.log(chalk_1.default.green('Control UNIX socket: READY'));
    }
    catch (error) {
        logger.error('Failed to initialize control socket:', error);
        logger.warn('Mac control features will not be available.');
        // Depending on the desired behavior, you might want to exit here
        // For now, we'll let the server continue without these features.
    }
    // Initialize API socket for CLI commands
    try {
        await api_socket_server_js_1.apiSocketServer.start();
        logger.log(chalk_1.default.green('API socket server: READY'));
    }
    catch (error) {
        logger.error('Failed to initialize API socket server:', error);
        logger.warn('vt commands will not work via socket.');
    }
    // Handle WebSocket upgrade with authentication
    server.on('upgrade', async (request, socket, head) => {
        // Parse the URL to extract path and query parameters
        const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        // Handle WebSocket paths
        if (parsedUrl.pathname !== '/buffers' && parsedUrl.pathname !== '/ws/input') {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        // Check authentication and capture user info
        const authResult = await new Promise((resolve) => {
            // Track if promise has been resolved to prevent multiple resolutions
            let resolved = false;
            const safeResolve = (value) => {
                if (!resolved) {
                    resolved = true;
                    resolve(value);
                }
            };
            // Convert URLSearchParams to plain object for query parameters
            const query = {};
            parsedUrl.searchParams.forEach((value, key) => {
                query[key] = value;
            });
            // Create a mock Express request/response to use auth middleware
            const req = {
                ...request,
                url: request.url,
                path: parsedUrl.pathname,
                userId: undefined,
                authMethod: undefined,
                query, // Include parsed query parameters for token-based auth
                headers: request.headers,
                ip: request.socket.remoteAddress || '',
                socket: request.socket,
                hostname: request.headers.host?.split(':')[0] || 'localhost',
                // Add minimal Express-like methods needed by auth middleware
                get: (header) => request.headers[header.toLowerCase()],
                header: (header) => request.headers[header.toLowerCase()],
                accepts: () => false,
                acceptsCharsets: () => false,
                acceptsEncodings: () => false,
                acceptsLanguages: () => false,
            };
            let authFailed = false;
            const res = {
                status: (code) => {
                    // Only consider it a failure if it's an error status code
                    if (code >= 400) {
                        authFailed = true;
                        safeResolve({ authenticated: false });
                    }
                    return {
                        json: () => { },
                        send: () => { },
                        end: () => { },
                    };
                },
                setHeader: () => { },
                send: () => { },
                json: () => { },
                end: () => { },
            };
            const next = (error) => {
                // Authentication succeeds if next() is called without error and no auth failure was recorded
                const authenticated = !error && !authFailed;
                safeResolve({
                    authenticated,
                    userId: req.userId,
                    authMethod: req.authMethod,
                });
            };
            // Add a timeout to prevent indefinite hanging
            const timeoutId = setTimeout(() => {
                logger.error('WebSocket auth timeout - auth middleware did not complete in time');
                safeResolve({ authenticated: false });
            }, 5000); // 5 second timeout
            // Call authMiddleware and handle potential async errors
            Promise.resolve(authMiddleware(req, res, next))
                .then(() => {
                clearTimeout(timeoutId);
            })
                .catch((error) => {
                clearTimeout(timeoutId);
                logger.error('Auth middleware error:', error);
                safeResolve({ authenticated: false });
            });
        });
        if (!authResult.authenticated) {
            logger.debug('WebSocket connection rejected: unauthorized');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        // Handle the upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
            // Add path and auth information to the request for routing
            const wsRequest = request;
            wsRequest.pathname = parsedUrl.pathname;
            wsRequest.searchParams = parsedUrl.searchParams;
            wsRequest.userId = authResult.userId;
            wsRequest.authMethod = authResult.authMethod;
            wss.emit('connection', ws, wsRequest);
        });
    });
    // WebSocket connection router
    wss.on('connection', (ws, req) => {
        const wsReq = req;
        const pathname = wsReq.pathname;
        const searchParams = wsReq.searchParams;
        logger.log(`🔌 WebSocket connection to path: ${pathname}`);
        logger.log(`👤 User ID: ${wsReq.userId || 'unknown'}`);
        logger.log(`🔐 Auth method: ${wsReq.authMethod || 'unknown'}`);
        if (pathname === '/buffers') {
            logger.log('📊 Handling buffer WebSocket connection');
            // Handle buffer updates WebSocket
            if (bufferAggregator) {
                bufferAggregator.handleClientConnection(ws);
            }
            else {
                logger.error('BufferAggregator not initialized for WebSocket connection');
                ws.close();
            }
        }
        else if (pathname === '/ws/input') {
            logger.log('⌨️ Handling input WebSocket connection');
            // Handle input WebSocket
            const sessionId = searchParams?.get('sessionId');
            if (!sessionId) {
                logger.error('WebSocket input connection missing sessionId parameter');
                ws.close();
                return;
            }
            // Extract user ID from the authenticated request
            const userId = wsReq.userId || 'unknown';
            websocketInputHandler.handleConnection(ws, sessionId, userId);
        }
        else {
            logger.error(`❌ Unknown WebSocket path: ${pathname}`);
            ws.close();
        }
    });
    // Serve index.html for client-side routes (but not API routes)
    app.get('/', (_req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    // Handle /session/:id routes by serving the same index.html
    app.get('/session/:id', (_req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    // Handle /worktrees route by serving the same index.html
    app.get('/worktrees', (_req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    // Handle /file-browser route by serving the same index.html
    app.get('/file-browser', (_req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    // 404 handler for all other routes
    app.use((req, res) => {
        if (req.path.startsWith('/api/')) {
            res.status(404).json({ error: 'API endpoint not found' });
        }
        else {
            res.status(404).sendFile(path.join(publicPath, '404.html'), (err) => {
                if (err) {
                    res.status(404).send('404 - Page not found');
                }
            });
        }
    });
    // Start server function
    const startServer = () => {
        const requestedPort = config.port !== null ? config.port : Number(process.env.PORT) || 4020;
        logger.log(`Starting server on port ${requestedPort}`);
        // Remove all existing error listeners first to prevent duplicates
        server.removeAllListeners('error');
        // Add error handler for port already in use
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${requestedPort} is already in use`);
                // Provide more helpful error message in development mode
                const isDevelopment = !process.env.BUILD_DATE || process.env.NODE_ENV === 'development';
                if (isDevelopment) {
                    logger.error(chalk_1.default.yellow('\nDevelopment mode options:'));
                    logger.error(`  1. Run server on different port: ${chalk_1.default.cyan('pnpm run dev:server --port 4021')}`);
                    logger.error(`  2. Use environment variable: ${chalk_1.default.cyan('PORT=4021 pnpm run dev')}`);
                    logger.error('  3. Stop the existing server (check Activity Monitor for vibetunnel processes)');
                }
                else {
                    logger.error('Please use a different port with --port <number> or stop the existing server');
                }
                process.exit(9); // Exit with code 9 to indicate port conflict
            }
            else {
                logger.error('Server error:', error);
                process.exit(1);
            }
        });
        // Regular TCP mode
        logger.log(`Starting server on port ${requestedPort}`);
        const bindAddress = config.bind || (config.enableTailscaleServe ? '127.0.0.1' : '0.0.0.0');
        server.listen(requestedPort, bindAddress, () => {
            const address = server.address();
            const actualPort = typeof address === 'string' ? requestedPort : address?.port || requestedPort;
            const displayAddress = bindAddress === '0.0.0.0' ? 'localhost' : bindAddress;
            logger.log(chalk_1.default.green(`VibeTunnel Server running on http://${displayAddress}:${actualPort}`));
            // Update API socket server with actual port information
            api_socket_server_js_1.apiSocketServer.setServerInfo(actualPort, `http://${displayAddress}:${actualPort}`);
            if (config.noAuth) {
                logger.warn(chalk_1.default.yellow('Authentication: DISABLED (--no-auth)'));
                logger.warn('Anyone can access this server without authentication');
            }
            else if (config.disallowUserPassword) {
                logger.log(chalk_1.default.green('Authentication: SSH KEYS ONLY (--disallow-user-password)'));
                logger.log(chalk_1.default.gray('Password authentication is disabled'));
            }
            else {
                logger.log(chalk_1.default.green('Authentication: SYSTEM USER PASSWORD'));
                if (config.enableSSHKeys) {
                    logger.log(chalk_1.default.green('SSH Key Authentication: ENABLED'));
                }
                else {
                    logger.log(chalk_1.default.gray('SSH Key Authentication: DISABLED (use --enable-ssh-keys to enable)'));
                }
            }
            // Start Tailscale Serve if requested
            if (config.enableTailscaleServe) {
                logger.log(chalk_1.default.blue('Starting Tailscale Serve integration...'));
                tailscale_serve_service_js_1.tailscaleServeService
                    .start(actualPort)
                    .then(() => {
                    logger.log(chalk_1.default.green('Tailscale Serve: ENABLED'));
                    logger.log(chalk_1.default.gray('Users will be auto-authenticated via Tailscale identity headers'));
                    logger.log(chalk_1.default.gray(`Access via HTTPS on your Tailscale hostname (e.g., https://hostname.tailnet.ts.net)`));
                })
                    .catch((error) => {
                    logger.error(chalk_1.default.red('Failed to start Tailscale Serve:'), error.message);
                    logger.warn(chalk_1.default.yellow('VibeTunnel will continue running, but Tailscale Serve is not available'));
                    logger.log(chalk_1.default.blue('You can manually configure Tailscale Serve with:'));
                    logger.log(chalk_1.default.gray(`  tailscale serve ${actualPort}`));
                });
            }
            // Log local bypass status
            if (config.allowLocalBypass) {
                logger.log(chalk_1.default.yellow('Local Bypass: ENABLED'));
                if (config.localAuthToken) {
                    logger.log(chalk_1.default.gray('Local connections require auth token'));
                }
                else {
                    logger.log(chalk_1.default.gray('Local connections bypass authentication without token'));
                }
            }
            // Initialize HQ client now that we know the actual port
            if (config.hqUrl &&
                config.remoteName &&
                (config.noHqAuth || (config.hqUsername && config.hqPassword))) {
                // Use the actual bind address for HQ registration
                // If bind is 0.0.0.0, we need to determine the actual network interface IP
                let remoteHost = bindAddress;
                if (bindAddress === '0.0.0.0') {
                    // When binding to all interfaces, use the machine's hostname
                    // This allows HQ to connect from the network
                    remoteHost = os.hostname();
                }
                const remoteUrl = `http://${remoteHost}:${actualPort}`;
                hqClient = new hq_client_js_1.HQClient(config.hqUrl, config.hqUsername || 'no-auth', config.hqPassword || 'no-auth', config.remoteName, remoteUrl, remoteBearerToken || '');
                if (config.noHqAuth) {
                    logger.log(chalk_1.default.yellow(`Remote mode: ${config.remoteName} registering WITHOUT HQ authentication (--no-hq-auth)`));
                }
                else {
                    logger.log(chalk_1.default.green(`Remote mode: ${config.remoteName} will accept Bearer token for HQ access`));
                    logger.debug(`Bearer token: ${hqClient.getToken()}`);
                }
            }
            // Send message to parent process if running as child (for testing)
            // Skip in vitest environment to avoid channel conflicts
            if (process.send && !process.env.VITEST) {
                process.send({ type: 'server-started', port: actualPort });
            }
            // Register with HQ if configured
            if (hqClient) {
                logger.log(`Registering with HQ at ${config.hqUrl}`);
                hqClient.register().catch((err) => {
                    logger.error('Failed to register with HQ:', err);
                });
            }
            // Start control directory watcher
            controlDirWatcher = new control_dir_watcher_js_1.ControlDirWatcher({
                controlDir: CONTROL_DIR,
                remoteRegistry,
                isHQMode: config.isHQMode,
                hqClient,
                ptyManager,
                pushNotificationService: pushNotificationService || undefined,
            });
            controlDirWatcher.start();
            logger.debug('Started control directory watcher');
            // Start activity monitor
            activityMonitor.start();
            logger.debug('Started activity monitor');
            // Start mDNS advertisement if enabled
            if (config.enableMDNS) {
                mdns_service_js_1.mdnsService.startAdvertising(actualPort).catch((err) => {
                    logger.warn('Failed to start mDNS advertisement:', err);
                });
            }
            else {
                logger.debug('mDNS advertisement disabled');
            }
        });
    };
    return {
        app,
        server,
        wss,
        startServer,
        config,
        configService,
        ptyManager,
        terminalManager,
        streamWatcher,
        remoteRegistry,
        hqClient,
        controlDirWatcher,
        bufferAggregator,
        activityMonitor,
        pushNotificationService,
    };
}
// Track if server has been started
let serverStarted = false;
// Export a function to start the server
async function startVibeTunnelServer() {
    // Initialize logger if not already initialized (preserves debug mode from CLI)
    (0, logger_js_1.initLogger)();
    // Log diagnostic info if debug mode
    if (process.env.DEBUG === 'true' || process.argv.includes('--debug')) {
    }
    // Prevent multiple server instances
    if (serverStarted) {
        logger.error('Server already started, preventing duplicate instance');
        logger.error('This should not happen - duplicate server startup detected');
        process.exit(1);
    }
    serverStarted = true;
    logger.debug('Creating VibeTunnel application instance');
    // Create and configure the app
    const appInstance = await createApp();
    const { startServer, server, terminalManager, remoteRegistry, hqClient, controlDirWatcher, activityMonitor, config, configService, } = appInstance;
    // Update debug mode based on config or environment variable
    if (config.debug || process.env.DEBUG === 'true') {
        (0, logger_js_1.setDebugMode)(true);
        logger.log(chalk_1.default.gray('Debug logging enabled'));
    }
    startServer();
    // Cleanup old terminals every 5 minutes
    const _terminalCleanupInterval = setInterval(() => {
        terminalManager.cleanup(5 * 60 * 1000); // 5 minutes
    }, 5 * 60 * 1000);
    logger.debug('Started terminal cleanup interval (5 minutes)');
    // Cleanup inactive push subscriptions every 30 minutes
    let _subscriptionCleanupInterval = null;
    if (appInstance.pushNotificationService) {
        _subscriptionCleanupInterval = setInterval(() => {
            appInstance.pushNotificationService?.cleanupInactiveSubscriptions().catch((error) => {
                logger.error('Failed to cleanup inactive subscriptions:', error);
            });
        }, 30 * 60 * 1000 // 30 minutes
        );
        logger.debug('Started subscription cleanup interval (30 minutes)');
    }
    // Graceful shutdown
    let localShuttingDown = false;
    const shutdown = async () => {
        if (localShuttingDown) {
            logger.warn('Force exit...');
            process.exit(1);
        }
        localShuttingDown = true;
        setShuttingDown(true);
        logger.log(chalk_1.default.yellow('\nShutting down...'));
        try {
            // Clear cleanup intervals
            clearInterval(_terminalCleanupInterval);
            if (_subscriptionCleanupInterval) {
                clearInterval(_subscriptionCleanupInterval);
            }
            logger.debug('Cleared cleanup intervals');
            // Stop activity monitor
            activityMonitor.stop();
            logger.debug('Stopped activity monitor');
            // Stop configuration service watcher
            configService.stopWatching();
            logger.debug('Stopped configuration service watcher');
            // Stop mDNS advertisement if it was started
            if (mdns_service_js_1.mdnsService.isActive()) {
                await mdns_service_js_1.mdnsService.stopAdvertising();
                logger.debug('Stopped mDNS advertisement');
            }
            // Stop Tailscale Serve if it was started
            if (config.enableTailscaleServe && tailscale_serve_service_js_1.tailscaleServeService.isRunning()) {
                logger.log('Stopping Tailscale Serve...');
                await tailscale_serve_service_js_1.tailscaleServeService.stop();
                logger.debug('Stopped Tailscale Serve service');
            }
            // Stop control directory watcher
            if (controlDirWatcher) {
                controlDirWatcher.stop();
                logger.debug('Stopped control directory watcher');
            }
            // Stop UNIX socket server
            try {
                const { controlUnixHandler } = await Promise.resolve().then(() => __importStar(require('./websocket/control-unix-handler.js')));
                controlUnixHandler.stop();
                logger.debug('Stopped UNIX socket server');
            }
            catch (_error) {
                // Ignore if module not loaded
            }
            if (hqClient) {
                logger.debug('Destroying HQ client connection');
                await hqClient.destroy();
            }
            if (remoteRegistry) {
                logger.debug('Destroying remote registry');
                remoteRegistry.destroy();
            }
            server.close(() => {
                logger.log(chalk_1.default.green('Server closed successfully'));
                (0, logger_js_1.closeLogger)();
                process.exit(0);
            });
            // Force exit after 5 seconds if graceful shutdown fails
            setTimeout(() => {
                logger.warn('Graceful shutdown timeout, forcing exit...');
                (0, logger_js_1.closeLogger)();
                process.exit(1);
            }, 5000);
        }
        catch (error) {
            logger.error('Error during shutdown:', error);
            (0, logger_js_1.closeLogger)();
            process.exit(1);
        }
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    logger.debug('Registered signal handlers for graceful shutdown');
}
// Export for testing
__exportStar(require("./version.js"), exports);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NlcnZlci9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFvRUEsd0NBRUM7QUFFRCwwQ0FFQztBQTRTRCw4QkFrdENDO0FBTUQsc0RBc0pDO0FBcHVERCxnQ0FBZ0M7QUFDaEMsa0RBQTBCO0FBQzFCLDhEQUFzQztBQUN0QyxrRUFBeUM7QUFDekMsK0NBQWlDO0FBRWpDLHNEQUE4QjtBQUM5Qix1Q0FBeUI7QUFDekIsb0RBQTRCO0FBRTVCLCtCQUFvQztBQUNwQyx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLCtCQUFvQztBQUNwQywyQkFBcUM7QUFDckMsaURBQXFEO0FBQ3JELGlFQUF5RDtBQUV6RCxrREFBNEQ7QUFDNUQsNkNBQTRDO0FBQzVDLDhDQUFvRDtBQUNwRCxrREFBd0Q7QUFDeEQsb0RBQTBEO0FBQzFELGtEQUF3RDtBQUN4RCxnREFBcUQ7QUFDckQsMERBQWdFO0FBQ2hFLDRDQUFrRDtBQUNsRCw4Q0FBbUQ7QUFDbkQsNERBQWtFO0FBQ2xFLDhDQUFvRDtBQUNwRCxvREFBeUQ7QUFDekQsOERBQWtFO0FBQ2xFLHNEQUEyRDtBQUMzRCx3RUFBNkU7QUFDN0UsOENBQW9EO0FBQ3BELG9FQUFvRTtBQUNwRSx3REFBNkQ7QUFDN0Qsd0VBQWlFO0FBQ2pFLGdFQUF5RDtBQUN6RCwwRUFBbUU7QUFDbkUsb0VBQTZEO0FBQzdELDhFQUFzRTtBQUN0RSwwREFBbUQ7QUFDbkQsZ0VBQXlEO0FBQ3pELDBGQUFrRjtBQUNsRixzRUFBK0Q7QUFDL0Qsc0VBQStEO0FBQy9ELG9FQUE2RDtBQUM3RCxzRkFBOEU7QUFDOUUsd0VBQWlFO0FBQ2pFLGlEQUF3RjtBQUN4RiwrREFBd0Q7QUFDeEQsNkNBQWtFO0FBQ2xFLGlGQUF5RTtBQVV6RSxNQUFNLE1BQU0sR0FBRyxJQUFBLHdCQUFZLEVB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QztRQUNsQixDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsT0FBTyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDL0IsT0FBTyxDQUFDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDaEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxrREFBa0QsQ0FBQyxDQUFDO0FBQ25FLENBQUM7QUFFRCxxQkFBcUI7QUFDckIsK0NBQTZCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVmliZVR1bm5lbCBzZXJ2ZXIgZW50cnkgcG9pbnRcbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgY29tcHJlc3Npb24gZnJvbSAnY29tcHJlc3Npb24nO1xuaW1wb3J0IGNvb2tpZVBhcnNlciBmcm9tICdjb29raWUtcGFyc2VyJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHR5cGUgeyBSZXNwb25zZSBhcyBFeHByZXNzUmVzcG9uc2UgfSBmcm9tICdleHByZXNzJztcbmltcG9ydCBleHByZXNzIGZyb20gJ2V4cHJlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IGhlbG1ldCBmcm9tICdoZWxtZXQnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgY3JlYXRlU2VydmVyIH0gZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5pbXBvcnQgeyBXZWJTb2NrZXRTZXJ2ZXIgfSBmcm9tICd3cyc7XG5pbXBvcnQgeyBTZXJ2ZXJFdmVudFR5cGUgfSBmcm9tICcuLi9zaGFyZWQvdHlwZXMuanMnO1xuaW1wb3J0IHsgYXBpU29ja2V0U2VydmVyIH0gZnJvbSAnLi9hcGktc29ja2V0LXNlcnZlci5qcyc7XG5pbXBvcnQgdHlwZSB7IEF1dGhlbnRpY2F0ZWRSZXF1ZXN0IH0gZnJvbSAnLi9taWRkbGV3YXJlL2F1dGguanMnO1xuaW1wb3J0IHsgY3JlYXRlQXV0aE1pZGRsZXdhcmUgfSBmcm9tICcuL21pZGRsZXdhcmUvYXV0aC5qcyc7XG5pbXBvcnQgeyBQdHlNYW5hZ2VyIH0gZnJvbSAnLi9wdHkvaW5kZXguanMnO1xuaW1wb3J0IHsgY3JlYXRlQXV0aFJvdXRlcyB9IGZyb20gJy4vcm91dGVzL2F1dGguanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29uZmlnUm91dGVzIH0gZnJvbSAnLi9yb3V0ZXMvY29uZmlnLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbnRyb2xSb3V0ZXMgfSBmcm9tICcuL3JvdXRlcy9jb250cm9sLmpzJztcbmltcG9ydCB7IGNyZWF0ZUV2ZW50c1JvdXRlciB9IGZyb20gJy4vcm91dGVzL2V2ZW50cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGaWxlUm91dGVzIH0gZnJvbSAnLi9yb3V0ZXMvZmlsZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZXN5c3RlbVJvdXRlcyB9IGZyb20gJy4vcm91dGVzL2ZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgY3JlYXRlR2l0Um91dGVzIH0gZnJvbSAnLi9yb3V0ZXMvZ2l0LmpzJztcbmltcG9ydCB7IGNyZWF0ZUxvZ1JvdXRlcyB9IGZyb20gJy4vcm91dGVzL2xvZ3MuanMnO1xuaW1wb3J0IHsgY3JlYXRlTXVsdGlwbGV4ZXJSb3V0ZXMgfSBmcm9tICcuL3JvdXRlcy9tdWx0aXBsZXhlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQdXNoUm91dGVzIH0gZnJvbSAnLi9yb3V0ZXMvcHVzaC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZW1vdGVSb3V0ZXMgfSBmcm9tICcuL3JvdXRlcy9yZW1vdGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlcG9zaXRvcnlSb3V0ZXMgfSBmcm9tICcuL3JvdXRlcy9yZXBvc2l0b3JpZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2Vzc2lvblJvdXRlcyB9IGZyb20gJy4vcm91dGVzL3Nlc3Npb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3ROb3RpZmljYXRpb25Sb3V0ZXIgfSBmcm9tICcuL3JvdXRlcy90ZXN0LW5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUbXV4Um91dGVzIH0gZnJvbSAnLi9yb3V0ZXMvdG11eC5qcyc7XG5pbXBvcnQgeyBXZWJTb2NrZXRJbnB1dEhhbmRsZXIgfSBmcm9tICcuL3JvdXRlcy93ZWJzb2NrZXQtaW5wdXQuanMnO1xuaW1wb3J0IHsgY3JlYXRlV29ya3RyZWVSb3V0ZXMgfSBmcm9tICcuL3JvdXRlcy93b3JrdHJlZXMuanMnO1xuaW1wb3J0IHsgQWN0aXZpdHlNb25pdG9yIH0gZnJvbSAnLi9zZXJ2aWNlcy9hY3Rpdml0eS1tb25pdG9yLmpzJztcbmltcG9ydCB7IEF1dGhTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9hdXRoLXNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnVmZmVyQWdncmVnYXRvciB9IGZyb20gJy4vc2VydmljZXMvYnVmZmVyLWFnZ3JlZ2F0b3IuanMnO1xuaW1wb3J0IHsgQ29uZmlnU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvY29uZmlnLXNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udHJvbERpcldhdGNoZXIgfSBmcm9tICcuL3NlcnZpY2VzL2NvbnRyb2wtZGlyLXdhdGNoZXIuanMnO1xuaW1wb3J0IHsgSFFDbGllbnQgfSBmcm9tICcuL3NlcnZpY2VzL2hxLWNsaWVudC5qcyc7XG5pbXBvcnQgeyBtZG5zU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvbWRucy1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9wdXNoLW5vdGlmaWNhdGlvbi1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlbW90ZVJlZ2lzdHJ5IH0gZnJvbSAnLi9zZXJ2aWNlcy9yZW1vdGUtcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbk1vbml0b3IgfSBmcm9tICcuL3NlcnZpY2VzL3Nlc3Npb24tbW9uaXRvci5qcyc7XG5pbXBvcnQgeyBTdHJlYW1XYXRjaGVyIH0gZnJvbSAnLi9zZXJ2aWNlcy9zdHJlYW0td2F0Y2hlci5qcyc7XG5pbXBvcnQgeyB0YWlsc2NhbGVTZXJ2ZVNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3RhaWxzY2FsZS1zZXJ2ZS1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vc2VydmljZXMvdGVybWluYWwtbWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjbG9zZUxvZ2dlciwgY3JlYXRlTG9nZ2VyLCBpbml0TG9nZ2VyLCBzZXREZWJ1Z01vZGUgfSBmcm9tICcuL3V0aWxzL2xvZ2dlci5qcyc7XG5pbXBvcnQgeyBWYXBpZE1hbmFnZXIgfSBmcm9tICcuL3V0aWxzL3ZhcGlkLW1hbmFnZXIuanMnO1xuaW1wb3J0IHsgZ2V0VmVyc2lvbkluZm8sIHByaW50VmVyc2lvbkJhbm5lciB9IGZyb20gJy4vdmVyc2lvbi5qcyc7XG5pbXBvcnQgeyBjb250cm9sVW5peEhhbmRsZXIgfSBmcm9tICcuL3dlYnNvY2tldC9jb250cm9sLXVuaXgtaGFuZGxlci5qcyc7XG5cbi8vIEV4dGVuZGVkIFdlYlNvY2tldCByZXF1ZXN0IHdpdGggYXV0aGVudGljYXRpb24gYW5kIHJvdXRpbmcgaW5mb1xuaW50ZXJmYWNlIFdlYlNvY2tldFJlcXVlc3QgZXh0ZW5kcyBodHRwLkluY29taW5nTWVzc2FnZSB7XG4gIHBhdGhuYW1lPzogc3RyaW5nO1xuICBzZWFyY2hQYXJhbXM/OiBVUkxTZWFyY2hQYXJhbXM7XG4gIHVzZXJJZD86IHN0cmluZztcbiAgYXV0aE1ldGhvZD86IHN0cmluZztcbn1cblxuY29uc3QgbG9nZ2VyID0gY3JlYXRlTG9nZ2VyKCdzZXJ2ZXInKTtcblxuLy8gR2xvYmFsIHNodXRkb3duIHN0YXRlIG1hbmFnZW1lbnRcbmxldCBzaHV0dGluZ0Rvd24gPSBmYWxzZTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2h1dHRpbmdEb3duKCk6IGJvb2xlYW4ge1xuICByZXR1cm4gc2h1dHRpbmdEb3duO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0U2h1dHRpbmdEb3duKHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG4gIHNodXR0aW5nRG93biA9IHZhbHVlO1xufVxuXG5pbnRlcmZhY2UgQ29uZmlnIHtcbiAgcG9ydDogbnVtYmVyIHwgbnVsbDtcbiAgYmluZDogc3RyaW5nIHwgbnVsbDtcbiAgZW5hYmxlU1NIS2V5czogYm9vbGVhbjtcbiAgZGlzYWxsb3dVc2VyUGFzc3dvcmQ6IGJvb2xlYW47XG4gIG5vQXV0aDogYm9vbGVhbjtcbiAgaXNIUU1vZGU6IGJvb2xlYW47XG4gIGhxVXJsOiBzdHJpbmcgfCBudWxsO1xuICBocVVzZXJuYW1lOiBzdHJpbmcgfCBudWxsO1xuICBocVBhc3N3b3JkOiBzdHJpbmcgfCBudWxsO1xuICByZW1vdGVOYW1lOiBzdHJpbmcgfCBudWxsO1xuICBhbGxvd0luc2VjdXJlSFE6IGJvb2xlYW47XG4gIHNob3dIZWxwOiBib29sZWFuO1xuICBzaG93VmVyc2lvbjogYm9vbGVhbjtcbiAgZGVidWc6IGJvb2xlYW47XG4gIC8vIFB1c2ggbm90aWZpY2F0aW9uIGNvbmZpZ3VyYXRpb25cbiAgcHVzaEVuYWJsZWQ6IGJvb2xlYW47XG4gIHZhcGlkRW1haWw6IHN0cmluZyB8IG51bGw7XG4gIGdlbmVyYXRlVmFwaWRLZXlzOiBib29sZWFuO1xuICBiZWxsTm90aWZpY2F0aW9uc0VuYWJsZWQ6IGJvb2xlYW47XG4gIC8vIExvY2FsIGJ5cGFzcyBjb25maWd1cmF0aW9uXG4gIGFsbG93TG9jYWxCeXBhc3M6IGJvb2xlYW47XG4gIGxvY2FsQXV0aFRva2VuOiBzdHJpbmcgfCBudWxsO1xuICAvLyBUYWlsc2NhbGUgU2VydmUgaW50ZWdyYXRpb24gKG1hbmFnZXMgYXV0aCBhbmQgcHJveHkpXG4gIGVuYWJsZVRhaWxzY2FsZVNlcnZlOiBib29sZWFuO1xuICAvLyBIUSBhdXRoIGJ5cGFzcyBmb3IgdGVzdGluZ1xuICBub0hxQXV0aDogYm9vbGVhbjtcbiAgLy8gbUROUyBhZHZlcnRpc2VtZW50XG4gIGVuYWJsZU1ETlM6IGJvb2xlYW47XG59XG5cbi8vIFNob3cgaGVscCBtZXNzYWdlXG5mdW5jdGlvbiBzaG93SGVscCgpIHtcbiAgY29uc29sZS5sb2coYFxuVmliZVR1bm5lbCBTZXJ2ZXIgLSBUZXJtaW5hbCBNdWx0aXBsZXhlclxuXG5Vc2FnZTogdmliZXR1bm5lbC1zZXJ2ZXIgW29wdGlvbnNdXG5cbk9wdGlvbnM6XG4gIC0taGVscCAgICAgICAgICAgICAgICBTaG93IHRoaXMgaGVscCBtZXNzYWdlXG4gIC0tdmVyc2lvbiAgICAgICAgICAgICBTaG93IHZlcnNpb24gaW5mb3JtYXRpb25cbiAgLS1wb3J0IDxudW1iZXI+ICAgICAgIFNlcnZlciBwb3J0IChkZWZhdWx0OiA0MDIwIG9yIFBPUlQgZW52IHZhcilcbiAgLS1iaW5kIDxhZGRyZXNzPiAgICAgIEJpbmQgYWRkcmVzcyAoZGVmYXVsdDogMC4wLjAuMCwgYWxsIGludGVyZmFjZXMpXG4gIC0tZW5hYmxlLXNzaC1rZXlzICAgICBFbmFibGUgU1NIIGtleSBhdXRoZW50aWNhdGlvbiBVSSBhbmQgZnVuY3Rpb25hbGl0eVxuICAtLWRpc2FsbG93LXVzZXItcGFzc3dvcmQgIERpc2FibGUgcGFzc3dvcmQgYXV0aCwgU1NIIGtleXMgb25seSAoYXV0by1lbmFibGVzIC0tZW5hYmxlLXNzaC1rZXlzKVxuICAtLW5vLWF1dGggICAgICAgICAgICAgRGlzYWJsZSBhdXRoZW50aWNhdGlvbiAoYXV0by1sb2dpbiBhcyBjdXJyZW50IHVzZXIpXG4gIC0tYWxsb3ctbG9jYWwtYnlwYXNzICBBbGxvdyBsb2NhbGhvc3QgY29ubmVjdGlvbnMgdG8gYnlwYXNzIGF1dGhlbnRpY2F0aW9uXG4gIC0tbG9jYWwtYXV0aC10b2tlbiA8dG9rZW4+ICBUb2tlbiBmb3IgbG9jYWxob3N0IGF1dGhlbnRpY2F0aW9uIGJ5cGFzc1xuICAtLWVuYWJsZS10YWlsc2NhbGUtc2VydmUgIEVuYWJsZSBUYWlsc2NhbGUgU2VydmUgaW50ZWdyYXRpb24gKGF1dG8tbWFuYWdlcyBwcm94eSBhbmQgYXV0aClcbiAgLS1kZWJ1ZyAgICAgICAgICAgICAgIEVuYWJsZSBkZWJ1ZyBsb2dnaW5nXG5cblB1c2ggTm90aWZpY2F0aW9uIE9wdGlvbnM6XG4gIC0tcHVzaC1lbmFibGVkICAgICAgICBFbmFibGUgcHVzaCBub3RpZmljYXRpb25zIChkZWZhdWx0OiBlbmFibGVkKVxuICAtLXB1c2gtZGlzYWJsZWQgICAgICAgRGlzYWJsZSBwdXNoIG5vdGlmaWNhdGlvbnNcbiAgLS12YXBpZC1lbWFpbCA8ZW1haWw+IENvbnRhY3QgZW1haWwgZm9yIFZBUElEIChvciBQVVNIX0NPTlRBQ1RfRU1BSUwgZW52IHZhcilcbiAgLS1nZW5lcmF0ZS12YXBpZC1rZXlzIEdlbmVyYXRlIG5ldyBWQVBJRCBrZXlzIGlmIG5vbmUgZXhpc3RcblxuTmV0d29yayBEaXNjb3ZlcnkgT3B0aW9uczpcbiAgLS1uby1tZG5zICAgICAgICAgICAgIERpc2FibGUgbUROUy9Cb25qb3VyIGFkdmVydGlzZW1lbnQgKGVuYWJsZWQgYnkgZGVmYXVsdClcblxuSFEgTW9kZSBPcHRpb25zOlxuICAtLWhxICAgICAgICAgICAgICAgICAgUnVuIGFzIEhRIChoZWFkcXVhcnRlcnMpIHNlcnZlclxuXG5SZW1vdGUgU2VydmVyIE9wdGlvbnM6XG4gIC0taHEtdXJsIDx1cmw+ICAgICAgICBIUSBzZXJ2ZXIgVVJMIHRvIHJlZ2lzdGVyIHdpdGhcbiAgLS1ocS11c2VybmFtZSA8dXNlcj4gIFVzZXJuYW1lIGZvciBIUSBhdXRoZW50aWNhdGlvblxuICAtLWhxLXBhc3N3b3JkIDxwYXNzPiAgUGFzc3dvcmQgZm9yIEhRIGF1dGhlbnRpY2F0aW9uXG4gIC0tbmFtZSA8bmFtZT4gICAgICAgICBVbmlxdWUgbmFtZSBmb3IgdGhpcyByZW1vdGUgc2VydmVyXG4gIC0tYWxsb3ctaW5zZWN1cmUtaHEgICBBbGxvdyBIVFRQIFVSTHMgZm9yIEhRIChkZWZhdWx0OiBIVFRQUyBvbmx5KVxuICAtLW5vLWhxLWF1dGggICAgICAgICAgRGlzYWJsZSBIUSBhdXRoZW50aWNhdGlvbiAoZm9yIHRlc3Rpbmcgb25seSlcblxuRW52aXJvbm1lbnQgVmFyaWFibGVzOlxuICBQT1JUICAgICAgICAgICAgICAgICAgRGVmYXVsdCBwb3J0IGlmIC0tcG9ydCBub3Qgc3BlY2lmaWVkXG4gIFZJQkVUVU5ORUxfVVNFUk5BTUUgICBEZWZhdWx0IHVzZXJuYW1lIGlmIC0tdXNlcm5hbWUgbm90IHNwZWNpZmllZFxuICBWSUJFVFVOTkVMX1BBU1NXT1JEICAgRGVmYXVsdCBwYXNzd29yZCBpZiAtLXBhc3N3b3JkIG5vdCBzcGVjaWZpZWRcbiAgVklCRVRVTk5FTF9DT05UUk9MX0RJUiBDb250cm9sIGRpcmVjdG9yeSBmb3Igc2Vzc2lvbiBkYXRhXG4gIFBVU0hfQ09OVEFDVF9FTUFJTCAgICBDb250YWN0IGVtYWlsIGZvciBWQVBJRCBjb25maWd1cmF0aW9uXG5cbkV4YW1wbGVzOlxuICAjIFJ1biBhIHNpbXBsZSBzZXJ2ZXIgd2l0aCBhdXRoZW50aWNhdGlvblxuICB2aWJldHVubmVsLXNlcnZlciAtLXVzZXJuYW1lIGFkbWluIC0tcGFzc3dvcmQgc2VjcmV0XG5cbiAgIyBSdW4gYXMgSFEgc2VydmVyXG4gIHZpYmV0dW5uZWwtc2VydmVyIC0taHEgLS11c2VybmFtZSBocS1hZG1pbiAtLXBhc3N3b3JkIGhxLXNlY3JldFxuXG4gICMgUnVuIGFzIHJlbW90ZSBzZXJ2ZXIgcmVnaXN0ZXJpbmcgd2l0aCBIUVxuICB2aWJldHVubmVsLXNlcnZlciAtLXVzZXJuYW1lIGxvY2FsIC0tcGFzc3dvcmQgbG9jYWwxMjMgXFxcXFxuICAgIC0taHEtdXJsIGh0dHBzOi8vaHEuZXhhbXBsZS5jb20gXFxcXFxuICAgIC0taHEtdXNlcm5hbWUgaHEtYWRtaW4gLS1ocS1wYXNzd29yZCBocS1zZWNyZXQgXFxcXFxuICAgIC0tbmFtZSByZW1vdGUtMVxuYCk7XG59XG5cbi8vIFBhcnNlIGNvbW1hbmQgbGluZSBhcmd1bWVudHNcbmZ1bmN0aW9uIHBhcnNlQXJncygpOiBDb25maWcge1xuICBjb25zdCBhcmdzID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDIpO1xuICBjb25zdCBjb25maWcgPSB7XG4gICAgcG9ydDogbnVsbCBhcyBudW1iZXIgfCBudWxsLFxuICAgIGJpbmQ6IG51bGwgYXMgc3RyaW5nIHwgbnVsbCxcbiAgICBlbmFibGVTU0hLZXlzOiBmYWxzZSxcbiAgICBkaXNhbGxvd1VzZXJQYXNzd29yZDogZmFsc2UsXG4gICAgbm9BdXRoOiBmYWxzZSxcbiAgICBpc0hRTW9kZTogZmFsc2UsXG4gICAgaHFVcmw6IG51bGwgYXMgc3RyaW5nIHwgbnVsbCxcbiAgICBocVVzZXJuYW1lOiBudWxsIGFzIHN0cmluZyB8IG51bGwsXG4gICAgaHFQYXNzd29yZDogbnVsbCBhcyBzdHJpbmcgfCBudWxsLFxuICAgIHJlbW90ZU5hbWU6IG51bGwgYXMgc3RyaW5nIHwgbnVsbCxcbiAgICBhbGxvd0luc2VjdXJlSFE6IGZhbHNlLFxuICAgIHNob3dIZWxwOiBmYWxzZSxcbiAgICBzaG93VmVyc2lvbjogZmFsc2UsXG4gICAgZGVidWc6IGZhbHNlLFxuICAgIC8vIFB1c2ggbm90aWZpY2F0aW9uIGNvbmZpZ3VyYXRpb25cbiAgICBwdXNoRW5hYmxlZDogdHJ1ZSwgLy8gRW5hYmxlIGJ5IGRlZmF1bHQgd2l0aCBhdXRvLWdlbmVyYXRpb25cbiAgICB2YXBpZEVtYWlsOiBudWxsIGFzIHN0cmluZyB8IG51bGwsXG4gICAgZ2VuZXJhdGVWYXBpZEtleXM6IHRydWUsIC8vIEdlbmVyYXRlIGtleXMgYXV0b21hdGljYWxseVxuICAgIGJlbGxOb3RpZmljYXRpb25zRW5hYmxlZDogdHJ1ZSwgLy8gRW5hYmxlIGJlbGwgbm90aWZpY2F0aW9ucyBieSBkZWZhdWx0XG4gICAgLy8gTG9jYWwgYnlwYXNzIGNvbmZpZ3VyYXRpb25cbiAgICBhbGxvd0xvY2FsQnlwYXNzOiBmYWxzZSxcbiAgICBsb2NhbEF1dGhUb2tlbjogbnVsbCBhcyBzdHJpbmcgfCBudWxsLFxuICAgIC8vIFRhaWxzY2FsZSBTZXJ2ZSBpbnRlZ3JhdGlvbiAobWFuYWdlcyBhdXRoIGFuZCBwcm94eSlcbiAgICBlbmFibGVUYWlsc2NhbGVTZXJ2ZTogZmFsc2UsXG4gICAgLy8gSFEgYXV0aCBieXBhc3MgZm9yIHRlc3RpbmdcbiAgICBub0hxQXV0aDogZmFsc2UsXG4gICAgLy8gbUROUyBhZHZlcnRpc2VtZW50XG4gICAgZW5hYmxlTUROUzogdHJ1ZSwgLy8gRW5hYmxlIG1ETlMgYnkgZGVmYXVsdFxuICB9O1xuXG4gIC8vIENoZWNrIGZvciBoZWxwIGZsYWcgZmlyc3RcbiAgaWYgKGFyZ3MuaW5jbHVkZXMoJy0taGVscCcpIHx8IGFyZ3MuaW5jbHVkZXMoJy1oJykpIHtcbiAgICBjb25maWcuc2hvd0hlbHAgPSB0cnVlO1xuICAgIHJldHVybiBjb25maWc7XG4gIH1cblxuICAvLyBDaGVjayBmb3IgdmVyc2lvbiBmbGFnXG4gIGlmIChhcmdzLmluY2x1ZGVzKCctLXZlcnNpb24nKSB8fCBhcmdzLmluY2x1ZGVzKCctdicpKSB7XG4gICAgY29uZmlnLnNob3dWZXJzaW9uID0gdHJ1ZTtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgLy8gQ2hlY2sgZm9yIGNvbW1hbmQgbGluZSBhcmd1bWVudHNcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGFyZ3NbaV0gPT09ICctLXBvcnQnICYmIGkgKyAxIDwgYXJncy5sZW5ndGgpIHtcbiAgICAgIGNvbmZpZy5wb3J0ID0gTnVtYmVyLnBhcnNlSW50KGFyZ3NbaSArIDFdLCAxMCk7XG4gICAgICBpKys7IC8vIFNraXAgdGhlIHBvcnQgdmFsdWUgaW4gbmV4dCBpdGVyYXRpb25cbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWJpbmQnICYmIGkgKyAxIDwgYXJncy5sZW5ndGgpIHtcbiAgICAgIGNvbmZpZy5iaW5kID0gYXJnc1tpICsgMV07XG4gICAgICBpKys7IC8vIFNraXAgdGhlIGJpbmQgdmFsdWUgaW4gbmV4dCBpdGVyYXRpb25cbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWVuYWJsZS1zc2gta2V5cycpIHtcbiAgICAgIGNvbmZpZy5lbmFibGVTU0hLZXlzID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWRpc2FsbG93LXVzZXItcGFzc3dvcmQnKSB7XG4gICAgICBjb25maWcuZGlzYWxsb3dVc2VyUGFzc3dvcmQgPSB0cnVlO1xuICAgICAgY29uZmlnLmVuYWJsZVNTSEtleXMgPSB0cnVlOyAvLyBBdXRvLWVuYWJsZSBTU0gga2V5c1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tbm8tYXV0aCcpIHtcbiAgICAgIGNvbmZpZy5ub0F1dGggPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0taHEnKSB7XG4gICAgICBjb25maWcuaXNIUU1vZGUgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0taHEtdXJsJyAmJiBpICsgMSA8IGFyZ3MubGVuZ3RoKSB7XG4gICAgICBjb25maWcuaHFVcmwgPSBhcmdzW2kgKyAxXTtcbiAgICAgIGkrKzsgLy8gU2tpcCB0aGUgVVJMIHZhbHVlIGluIG5leHQgaXRlcmF0aW9uXG4gICAgfSBlbHNlIGlmIChhcmdzW2ldID09PSAnLS1ocS11c2VybmFtZScgJiYgaSArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgY29uZmlnLmhxVXNlcm5hbWUgPSBhcmdzW2kgKyAxXTtcbiAgICAgIGkrKzsgLy8gU2tpcCB0aGUgdXNlcm5hbWUgdmFsdWUgaW4gbmV4dCBpdGVyYXRpb25cbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWhxLXBhc3N3b3JkJyAmJiBpICsgMSA8IGFyZ3MubGVuZ3RoKSB7XG4gICAgICBjb25maWcuaHFQYXNzd29yZCA9IGFyZ3NbaSArIDFdO1xuICAgICAgaSsrOyAvLyBTa2lwIHRoZSBwYXNzd29yZCB2YWx1ZSBpbiBuZXh0IGl0ZXJhdGlvblxuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tbmFtZScgJiYgaSArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgY29uZmlnLnJlbW90ZU5hbWUgPSBhcmdzW2kgKyAxXTtcbiAgICAgIGkrKzsgLy8gU2tpcCB0aGUgbmFtZSB2YWx1ZSBpbiBuZXh0IGl0ZXJhdGlvblxuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tYWxsb3ctaW5zZWN1cmUtaHEnKSB7XG4gICAgICBjb25maWcuYWxsb3dJbnNlY3VyZUhRID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWRlYnVnJykge1xuICAgICAgY29uZmlnLmRlYnVnID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLXB1c2gtZW5hYmxlZCcpIHtcbiAgICAgIGNvbmZpZy5wdXNoRW5hYmxlZCA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChhcmdzW2ldID09PSAnLS1wdXNoLWRpc2FibGVkJykge1xuICAgICAgY29uZmlnLnB1c2hFbmFibGVkID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChhcmdzW2ldID09PSAnLS12YXBpZC1lbWFpbCcgJiYgaSArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgY29uZmlnLnZhcGlkRW1haWwgPSBhcmdzW2kgKyAxXTtcbiAgICAgIGkrKzsgLy8gU2tpcCB0aGUgZW1haWwgdmFsdWUgaW4gbmV4dCBpdGVyYXRpb25cbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLWdlbmVyYXRlLXZhcGlkLWtleXMnKSB7XG4gICAgICBjb25maWcuZ2VuZXJhdGVWYXBpZEtleXMgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tYWxsb3ctbG9jYWwtYnlwYXNzJykge1xuICAgICAgY29uZmlnLmFsbG93TG9jYWxCeXBhc3MgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tbG9jYWwtYXV0aC10b2tlbicgJiYgaSArIDEgPCBhcmdzLmxlbmd0aCkge1xuICAgICAgY29uZmlnLmxvY2FsQXV0aFRva2VuID0gYXJnc1tpICsgMV07XG4gICAgICBpKys7IC8vIFNraXAgdGhlIHRva2VuIHZhbHVlIGluIG5leHQgaXRlcmF0aW9uXG4gICAgfSBlbHNlIGlmIChhcmdzW2ldID09PSAnLS1lbmFibGUtdGFpbHNjYWxlLXNlcnZlJykge1xuICAgICAgY29uZmlnLmVuYWJsZVRhaWxzY2FsZVNlcnZlID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKGFyZ3NbaV0gPT09ICctLW5vLWhxLWF1dGgnKSB7XG4gICAgICBjb25maWcubm9IcUF1dGggPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoYXJnc1tpXSA9PT0gJy0tbm8tbWRucycpIHtcbiAgICAgIGNvbmZpZy5lbmFibGVNRE5TID0gZmFsc2U7XG4gICAgfSBlbHNlIGlmIChhcmdzW2ldLnN0YXJ0c1dpdGgoJy0tJykpIHtcbiAgICAgIC8vIFVua25vd24gYXJndW1lbnRcbiAgICAgIGxvZ2dlci5lcnJvcihgVW5rbm93biBhcmd1bWVudDogJHthcmdzW2ldfWApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdVc2UgLS1oZWxwIHRvIHNlZSBhdmFpbGFibGUgb3B0aW9ucycpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIC8vIENoZWNrIGVudmlyb25tZW50IHZhcmlhYmxlcyBmb3IgcHVzaCBub3RpZmljYXRpb25zXG4gIGlmICghY29uZmlnLnZhcGlkRW1haWwgJiYgcHJvY2Vzcy5lbnYuUFVTSF9DT05UQUNUX0VNQUlMKSB7XG4gICAgY29uZmlnLnZhcGlkRW1haWwgPSBwcm9jZXNzLmVudi5QVVNIX0NPTlRBQ1RfRU1BSUw7XG4gIH1cblxuICByZXR1cm4gY29uZmlnO1xufVxuXG4vLyBWYWxpZGF0ZSBjb25maWd1cmF0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNvbmZpZyhjb25maWc6IFJldHVyblR5cGU8dHlwZW9mIHBhcnNlQXJncz4pIHtcbiAgLy8gVmFsaWRhdGUgYXV0aCBjb25maWd1cmF0aW9uXG4gIGlmIChjb25maWcubm9BdXRoICYmIChjb25maWcuZW5hYmxlU1NIS2V5cyB8fCBjb25maWcuZGlzYWxsb3dVc2VyUGFzc3dvcmQpKSB7XG4gICAgbG9nZ2VyLndhcm4oXG4gICAgICAnLS1uby1hdXRoIG92ZXJyaWRlcyBhbGwgb3RoZXIgYXV0aGVudGljYXRpb24gc2V0dGluZ3MgKGF1dGhlbnRpY2F0aW9uIGlzIGRpc2FibGVkKSdcbiAgICApO1xuICB9XG5cbiAgaWYgKGNvbmZpZy5kaXNhbGxvd1VzZXJQYXNzd29yZCAmJiAhY29uZmlnLmVuYWJsZVNTSEtleXMpIHtcbiAgICBsb2dnZXIud2FybignLS1kaXNhbGxvdy11c2VyLXBhc3N3b3JkIHJlcXVpcmVzIFNTSCBrZXlzLCBhdXRvLWVuYWJsaW5nIC0tZW5hYmxlLXNzaC1rZXlzJyk7XG4gICAgY29uZmlnLmVuYWJsZVNTSEtleXMgPSB0cnVlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGUgSFEgcmVnaXN0cmF0aW9uIGNvbmZpZ3VyYXRpb25cbiAgaWYgKGNvbmZpZy5ocVVybCAmJiAoIWNvbmZpZy5ocVVzZXJuYW1lIHx8ICFjb25maWcuaHFQYXNzd29yZCkgJiYgIWNvbmZpZy5ub0hxQXV0aCkge1xuICAgIGxvZ2dlci5lcnJvcignSFEgdXNlcm5hbWUgYW5kIHBhc3N3b3JkIHJlcXVpcmVkIHdoZW4gLS1ocS11cmwgaXMgc3BlY2lmaWVkJyk7XG4gICAgbG9nZ2VyLmVycm9yKCdVc2UgLS1ocS11c2VybmFtZSBhbmQgLS1ocS1wYXNzd29yZCB3aXRoIC0taHEtdXJsJyk7XG4gICAgbG9nZ2VyLmVycm9yKCdPciB1c2UgLS1uby1ocS1hdXRoIGZvciB0ZXN0aW5nIHdpdGhvdXQgYXV0aGVudGljYXRpb24nKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSByZW1vdGUgbmFtZSBpcyBwcm92aWRlZCB3aGVuIHJlZ2lzdGVyaW5nIHdpdGggSFFcbiAgaWYgKGNvbmZpZy5ocVVybCAmJiAhY29uZmlnLnJlbW90ZU5hbWUpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ1JlbW90ZSBuYW1lIHJlcXVpcmVkIHdoZW4gLS1ocS11cmwgaXMgc3BlY2lmaWVkJyk7XG4gICAgbG9nZ2VyLmVycm9yKCdVc2UgLS1uYW1lIHRvIHNwZWNpZnkgYSB1bmlxdWUgbmFtZSBmb3IgdGhpcyByZW1vdGUgc2VydmVyJyk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGUgSFEgVVJMIGlzIEhUVFBTIHVubGVzcyBleHBsaWNpdGx5IGFsbG93ZWRcbiAgaWYgKGNvbmZpZy5ocVVybCAmJiAhY29uZmlnLmhxVXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgJiYgIWNvbmZpZy5hbGxvd0luc2VjdXJlSFEpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0hRIFVSTCBtdXN0IHVzZSBIVFRQUyBwcm90b2NvbCcpO1xuICAgIGxvZ2dlci5lcnJvcignVXNlIC0tYWxsb3ctaW5zZWN1cmUtaHEgdG8gYWxsb3cgSFRUUCBmb3IgdGVzdGluZycpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlIEhRIHJlZ2lzdHJhdGlvbiBjb25maWd1cmF0aW9uXG4gIGlmIChcbiAgICAoY29uZmlnLmhxVXJsIHx8IGNvbmZpZy5ocVVzZXJuYW1lIHx8IGNvbmZpZy5ocVBhc3N3b3JkKSAmJlxuICAgICghY29uZmlnLmhxVXJsIHx8ICFjb25maWcuaHFVc2VybmFtZSB8fCAhY29uZmlnLmhxUGFzc3dvcmQpICYmXG4gICAgIWNvbmZpZy5ub0hxQXV0aFxuICApIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0FsbCBIUSBwYXJhbWV0ZXJzIHJlcXVpcmVkOiAtLWhxLXVybCwgLS1ocS11c2VybmFtZSwgLS1ocS1wYXNzd29yZCcpO1xuICAgIGxvZ2dlci5lcnJvcignT3IgdXNlIC0tbm8taHEtYXV0aCBmb3IgdGVzdGluZyB3aXRob3V0IGF1dGhlbnRpY2F0aW9uJyk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGUgVGFpbHNjYWxlIGNvbmZpZ3VyYXRpb25cbiAgaWYgKGNvbmZpZy5lbmFibGVUYWlsc2NhbGVTZXJ2ZSAmJiBjb25maWcuYmluZCA9PT0gJzAuMC4wLjAnKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdTZWN1cml0eSBFcnJvcjogQ2Fubm90IGJpbmQgdG8gMC4wLjAuMCB3aGVuIHVzaW5nIFRhaWxzY2FsZSBTZXJ2ZScpO1xuICAgIGxvZ2dlci5lcnJvcignVGFpbHNjYWxlIFNlcnZlIHJlcXVpcmVzIGJpbmRpbmcgdG8gbG9jYWxob3N0ICgxMjcuMC4wLjEpJyk7XG4gICAgbG9nZ2VyLmVycm9yKCdVc2UgLS1iaW5kIDEyNy4wLjAuMSBvciBkaXNhYmxlIFRhaWxzY2FsZSBTZXJ2ZScpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuXG4gIC8vIENhbid0IGJlIGJvdGggSFEgbW9kZSBhbmQgcmVnaXN0ZXIgd2l0aCBIUVxuICBpZiAoY29uZmlnLmlzSFFNb2RlICYmIGNvbmZpZy5ocVVybCkge1xuICAgIGxvZ2dlci5lcnJvcignQ2Fubm90IHVzZSAtLWhxIGFuZCAtLWhxLXVybCB0b2dldGhlcicpO1xuICAgIGxvZ2dlci5lcnJvcignVXNlIC0taHEgdG8gcnVuIGFzIEhRIHNlcnZlciwgb3IgLS1ocS11cmwgdG8gcmVnaXN0ZXIgd2l0aCBhbiBIUScpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuXG4gIC8vIFdhcm4gYWJvdXQgbm8taHEtYXV0aFxuICBpZiAoY29uZmlnLm5vSHFBdXRoICYmIGNvbmZpZy5ocVVybCkge1xuICAgIGxvZ2dlci53YXJuKCctLW5vLWhxLWF1dGggaXMgZW5hYmxlZDogUmVtb3RlIHNlcnZlcnMgY2FuIHJlZ2lzdGVyIHdpdGhvdXQgYXV0aGVudGljYXRpb24nKTtcbiAgICBsb2dnZXIud2FybignVGhpcyBzaG91bGQgb25seSBiZSB1c2VkIGZvciB0ZXN0aW5nIScpO1xuICB9XG59XG5cbmludGVyZmFjZSBBcHBJbnN0YW5jZSB7XG4gIGFwcDogZXhwcmVzcy5BcHBsaWNhdGlvbjtcbiAgc2VydmVyOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVTZXJ2ZXI+O1xuICB3c3M6IFdlYlNvY2tldFNlcnZlcjtcbiAgc3RhcnRTZXJ2ZXI6ICgpID0+IHZvaWQ7XG4gIGNvbmZpZzogQ29uZmlnO1xuICBjb25maWdTZXJ2aWNlOiBDb25maWdTZXJ2aWNlO1xuICBwdHlNYW5hZ2VyOiBQdHlNYW5hZ2VyO1xuICB0ZXJtaW5hbE1hbmFnZXI6IFRlcm1pbmFsTWFuYWdlcjtcbiAgc3RyZWFtV2F0Y2hlcjogU3RyZWFtV2F0Y2hlcjtcbiAgcmVtb3RlUmVnaXN0cnk6IFJlbW90ZVJlZ2lzdHJ5IHwgbnVsbDtcbiAgaHFDbGllbnQ6IEhRQ2xpZW50IHwgbnVsbDtcbiAgY29udHJvbERpcldhdGNoZXI6IENvbnRyb2xEaXJXYXRjaGVyIHwgbnVsbDtcbiAgYnVmZmVyQWdncmVnYXRvcjogQnVmZmVyQWdncmVnYXRvciB8IG51bGw7XG4gIGFjdGl2aXR5TW9uaXRvcjogQWN0aXZpdHlNb25pdG9yO1xuICBwdXNoTm90aWZpY2F0aW9uU2VydmljZTogUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfCBudWxsO1xufVxuXG4vLyBUcmFjayBpZiBhcHAgaGFzIGJlZW4gY3JlYXRlZFxubGV0IGFwcENyZWF0ZWQgPSBmYWxzZTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUFwcCgpOiBQcm9taXNlPEFwcEluc3RhbmNlPiB7XG4gIC8vIFByZXZlbnQgbXVsdGlwbGUgYXBwIGluc3RhbmNlc1xuICBpZiAoYXBwQ3JlYXRlZCkge1xuICAgIGxvZ2dlci5lcnJvcignQXBwIGFscmVhZHkgY3JlYXRlZCwgcHJldmVudGluZyBkdXBsaWNhdGUgaW5zdGFuY2UnKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0R1cGxpY2F0ZSBhcHAgY3JlYXRpb24gZGV0ZWN0ZWQnKTtcbiAgfVxuICBhcHBDcmVhdGVkID0gdHJ1ZTtcblxuICBjb25zdCBjb25maWcgPSBwYXJzZUFyZ3MoKTtcblxuICAvLyBDaGVjayBpZiBoZWxwIHdhcyByZXF1ZXN0ZWRcbiAgaWYgKGNvbmZpZy5zaG93SGVscCkge1xuICAgIHNob3dIZWxwKCk7XG4gICAgcHJvY2Vzcy5leGl0KDApO1xuICB9XG5cbiAgLy8gQ2hlY2sgaWYgdmVyc2lvbiB3YXMgcmVxdWVzdGVkXG4gIGlmIChjb25maWcuc2hvd1ZlcnNpb24pIHtcbiAgICBjb25zdCB2ZXJzaW9uSW5mbyA9IGdldFZlcnNpb25JbmZvKCk7XG4gICAgY29uc29sZS5sb2coYFZpYmVUdW5uZWwgU2VydmVyIHYke3ZlcnNpb25JbmZvLnZlcnNpb259YCk7XG4gICAgY29uc29sZS5sb2coYEJ1aWx0OiAke3ZlcnNpb25JbmZvLmJ1aWxkRGF0ZX1gKTtcbiAgICBjb25zb2xlLmxvZyhgUGxhdGZvcm06ICR7dmVyc2lvbkluZm8ucGxhdGZvcm19LyR7dmVyc2lvbkluZm8uYXJjaH1gKTtcbiAgICBjb25zb2xlLmxvZyhgTm9kZTogJHt2ZXJzaW9uSW5mby5ub2RlVmVyc2lvbn1gKTtcbiAgICBwcm9jZXNzLmV4aXQoMCk7XG4gIH1cblxuICAvLyBQcmludCB2ZXJzaW9uIGJhbm5lciBvbiBzdGFydHVwXG4gIHByaW50VmVyc2lvbkJhbm5lcigpO1xuXG4gIHZhbGlkYXRlQ29uZmlnKGNvbmZpZyk7XG5cbiAgbG9nZ2VyLmxvZygnSW5pdGlhbGl6aW5nIFZpYmVUdW5uZWwgc2VydmVyIGNvbXBvbmVudHMnKTtcbiAgY29uc3QgYXBwID0gZXhwcmVzcygpO1xuICBjb25zdCBzZXJ2ZXIgPSBjcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgY29uc3Qgd3NzID0gbmV3IFdlYlNvY2tldFNlcnZlcih7IG5vU2VydmVyOiB0cnVlLCBwZXJNZXNzYWdlRGVmbGF0ZTogdHJ1ZSB9KTtcblxuICAvLyBBZGQgc2VjdXJpdHkgaGVhZGVycyB3aXRoIEhlbG1ldFxuICBhcHAudXNlKFxuICAgIGhlbG1ldCh7XG4gICAgICBjb250ZW50U2VjdXJpdHlQb2xpY3k6IGZhbHNlLCAvLyBXZSBoYW5kbGUgQ1NQIG91cnNlbHZlcyBmb3IgdGhlIHdlYiB0ZXJtaW5hbFxuICAgICAgY3Jvc3NPcmlnaW5FbWJlZGRlclBvbGljeTogZmFsc2UsIC8vIEFsbG93IGVtYmVkZGluZyBpbiBpZnJhbWVzIGZvciBpbnRlZ3JhdGlvbnNcbiAgICB9KVxuICApO1xuICBsb2dnZXIuZGVidWcoJ0NvbmZpZ3VyZWQgc2VjdXJpdHkgaGVhZGVycyB3aXRoIGhlbG1ldCcpO1xuXG4gIC8vIEFkZCBjb29raWUgcGFyc2VyIG1pZGRsZXdhcmUgZm9yIENTUkYgdG9rZW4gaGFuZGxpbmdcbiAgYXBwLnVzZShjb29raWVQYXJzZXIoKSk7XG4gIGxvZ2dlci5kZWJ1ZygnQ29uZmlndXJlZCBjb29raWUgcGFyc2VyIG1pZGRsZXdhcmUnKTtcblxuICAvLyBBZGQgQ1NSRiBwcm90ZWN0aW9uIGZvciBzdGF0ZS1jaGFuZ2luZyBvcGVyYXRpb25zIHVzaW5nIERvdWJsZS1TdWJtaXQgQ29va2llIHBhdHRlcm5cbiAgYXBwLnVzZSgocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICAvLyBTa2lwIENTUkYgcHJvdGVjdGlvbiBmb3IgcmVhZC1vbmx5IG9wZXJhdGlvbnNcbiAgICBpZiAocmVxLm1ldGhvZCA9PT0gJ0dFVCcgfHwgcmVxLm1ldGhvZCA9PT0gJ0hFQUQnIHx8IHJlcS5tZXRob2QgPT09ICdPUFRJT05TJykge1xuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICAvLyBTa2lwIENTUkYgZm9yIFdlYlNvY2tldCB1cGdyYWRlIHJlcXVlc3RzXG4gICAgaWYgKHJlcS5oZWFkZXJzLnVwZ3JhZGUgPT09ICd3ZWJzb2NrZXQnKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH1cblxuICAgIC8vIFNraXAgQ1NSRiBmb3IgYXV0aGVudGljYXRpb24gcm91dGVzXG4gICAgaWYgKHJlcS5wYXRoID09PSAnL2FwaS9hdXRoL3Bhc3N3b3JkJyB8fCByZXEucGF0aCA9PT0gJy9hcGkvYXV0aC9zc2gta2V5Jykge1xuICAgICAgcmV0dXJuIG5leHQoKTtcbiAgICB9XG5cbiAgICAvLyBTa2lwIENTUkYgZm9yIGF1dGhlbnRpY2F0ZWQgQVBJIHJlcXVlc3RzIHVzaW5nIEJlYXJlciB0b2tlbnNcbiAgICAvLyBKV1QgQmVhcmVyIHRva2VucyBhcmUgbm90IHZ1bG5lcmFibGUgdG8gQ1NSRiBhdHRhY2tzIHNpbmNlIHRoZXkgcmVxdWlyZVxuICAgIC8vIGV4cGxpY2l0IEphdmFTY3JpcHQgYWNjZXNzIGFuZCBhcmUgbm90IHNlbnQgYXV0b21hdGljYWxseSBieSBicm93c2Vyc1xuICAgIGlmIChyZXEuaGVhZGVycy5hdXRob3JpemF0aW9uPy5zdGFydHNXaXRoKCdCZWFyZXIgJykpIHtcbiAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgfVxuXG4gICAgLy8gRm9yIHJlcXVlc3RzIHdpdGhvdXQgQmVhcmVyIHRva2VucywgZW5mb3JjZSBDU1JGIHByb3RlY3Rpb25cbiAgICAvLyBUaGlzIHByb3RlY3RzIGFueSBjb29raWUtYmFzZWQgb3Igc2Vzc2lvbmxlc3MgZW5kcG9pbnRzXG4gICAgY29uc3QgY3NyZlRva2VuID0gcmVxLmhlYWRlcnNbJ3gtY3NyZi10b2tlbiddIGFzIHN0cmluZztcbiAgICBjb25zdCBjc3JmQ29va2llID0gKHJlcSBhcyBleHByZXNzLlJlcXVlc3QgJiB7IGNvb2tpZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0pLmNvb2tpZXM/LltcbiAgICAgICdjc3JmLXRva2VuJ1xuICAgIF07XG5cbiAgICAvLyBBbGxvdyByZXF1ZXN0cyB3aXRoIHZhbGlkIENTUkYgdG9rZW4tY29va2llIHBhaXJcbiAgICBpZiAoY3NyZlRva2VuICYmIGNzcmZDb29raWUgJiYgY3NyZlRva2VuID09PSBjc3JmQ29va2llKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH1cblxuICAgIC8vIEJsb2NrIHBvdGVudGlhbGx5IG1hbGljaW91cyBjcm9zcy1zaXRlIHJlcXVlc3RzXG4gICAgbG9nZ2VyLndhcm4oYENTUkYgcHJvdGVjdGlvbiBibG9ja2VkIHJlcXVlc3QgdG8gJHtyZXEucGF0aH0gZnJvbSAke3JlcS5pcH1gLCB7XG4gICAgICBoYXNUb2tlbjogISFjc3JmVG9rZW4sXG4gICAgICBoYXNDb29raWU6ICEhY3NyZkNvb2tpZSxcbiAgICAgIHRva2Vuc01hdGNoOiBjc3JmVG9rZW4gPT09IGNzcmZDb29raWUsXG4gICAgICB1c2VyQWdlbnQ6IHJlcS5oZWFkZXJzWyd1c2VyLWFnZW50J10sXG4gICAgICByZWZlcmVyOiByZXEuaGVhZGVycy5yZWZlcmVyLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlcy5zdGF0dXMoNDAzKS5qc29uKHtcbiAgICAgIGVycm9yOiAnQ1NSRiB0b2tlbiBtaXNzaW5nIG9yIGludmFsaWQnLFxuICAgICAgZGV0YWlsczogJ0Nyb3NzLXNpdGUgcmVxdWVzdCBmb3JnZXJ5IHByb3RlY3Rpb24gcmVxdWlyZXMgbWF0Y2hpbmcgQ1NSRiB0b2tlbicsXG4gICAgfSk7XG4gIH0pO1xuICBsb2dnZXIuZGVidWcoJ0NvbmZpZ3VyZWQgQ1NSRiBwcm90ZWN0aW9uIHVzaW5nIERvdWJsZS1TdWJtaXQgQ29va2llIHBhdHRlcm4nKTtcblxuICAvLyBBZGQgY29tcHJlc3Npb24gbWlkZGxld2FyZSB3aXRoIEJyb3RsaSBzdXBwb3J0XG4gIC8vIFNraXAgY29tcHJlc3Npb24gZm9yIFNTRSBzdHJlYW1zIChhc2NpaWNhc3QgYW5kIGV2ZW50cylcbiAgYXBwLnVzZShcbiAgICBjb21wcmVzc2lvbih7XG4gICAgICBmaWx0ZXI6IChyZXEsIHJlcykgPT4ge1xuICAgICAgICAvLyBTa2lwIGNvbXByZXNzaW9uIGZvciBTZXJ2ZXItU2VudCBFdmVudHNcbiAgICAgICAgaWYgKHJlcS5wYXRoLm1hdGNoKC9cXC9hcGlcXC9zZXNzaW9uc1xcL1teL10rXFwvc3RyZWFtJC8pIHx8IHJlcS5wYXRoID09PSAnL2FwaS9ldmVudHMnKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIC8vIFVzZSBkZWZhdWx0IGZpbHRlciBmb3Igb3RoZXIgcmVxdWVzdHNcbiAgICAgICAgcmV0dXJuIGNvbXByZXNzaW9uLmZpbHRlcihyZXEsIHJlcyk7XG4gICAgICB9LFxuICAgICAgLy8gRW5hYmxlIEJyb3RsaSBjb21wcmVzc2lvbiB3aXRoIGhpZ2hlc3QgcHJpb3JpdHlcbiAgICAgIGxldmVsOiA2LCAvLyBCYWxhbmNlZCBjb21wcmVzc2lvbiBsZXZlbFxuICAgIH0pXG4gICk7XG4gIGxvZ2dlci5kZWJ1ZygnQ29uZmlndXJlZCBjb21wcmVzc2lvbiBtaWRkbGV3YXJlICh3aXRoIFNTRSBleGNsdXNpb24pJyk7XG5cbiAgLy8gQWRkIEpTT04gYm9keSBwYXJzZXIgbWlkZGxld2FyZSB3aXRoIHNpemUgbGltaXRcbiAgYXBwLnVzZShleHByZXNzLmpzb24oeyBsaW1pdDogJzEwbWInIH0pKTtcblxuICAvLyBBZGQgY29va2llIHBhcnNlciBtaWRkbGV3YXJlIGZvciBDU1JGIHByb3RlY3Rpb25cbiAgYXBwLnVzZShjb29raWVQYXJzZXIoKSk7XG4gIGxvZ2dlci5kZWJ1ZygnQ29uZmlndXJlZCBleHByZXNzIG1pZGRsZXdhcmUgd2l0aCBjb29raWUgcGFyc2VyJyk7XG5cbiAgLy8gQ29udHJvbCBkaXJlY3RvcnkgZm9yIHNlc3Npb24gZGF0YVxuICBjb25zdCBDT05UUk9MX0RJUiA9XG4gICAgcHJvY2Vzcy5lbnYuVklCRVRVTk5FTF9DT05UUk9MX0RJUiB8fCBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLnZpYmV0dW5uZWwvY29udHJvbCcpO1xuXG4gIC8vIEVuc3VyZSBjb250cm9sIGRpcmVjdG9yeSBleGlzdHNcbiAgaWYgKCFmcy5leGlzdHNTeW5jKENPTlRST0xfRElSKSkge1xuICAgIGZzLm1rZGlyU3luYyhDT05UUk9MX0RJUiwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbihgQ3JlYXRlZCBjb250cm9sIGRpcmVjdG9yeTogJHtDT05UUk9MX0RJUn1gKSk7XG4gIH0gZWxzZSB7XG4gICAgbG9nZ2VyLmRlYnVnKGBVc2luZyBleGlzdGluZyBjb250cm9sIGRpcmVjdG9yeTogJHtDT05UUk9MX0RJUn1gKTtcbiAgfVxuXG4gIC8vIEluaXRpYWxpemUgUFRZIG1hbmFnZXIgd2l0aCBmYWxsYmFjayBzdXBwb3J0XG4gIGF3YWl0IFB0eU1hbmFnZXIuaW5pdGlhbGl6ZSgpO1xuICBjb25zdCBwdHlNYW5hZ2VyID0gbmV3IFB0eU1hbmFnZXIoQ09OVFJPTF9ESVIpO1xuICBsb2dnZXIuZGVidWcoJ0luaXRpYWxpemVkIFBUWSBtYW5hZ2VyJyk7XG5cbiAgLy8gQ2xlYW4gdXAgc2Vzc2lvbnMgZnJvbSBvbGQgVmliZVR1bm5lbCB2ZXJzaW9uc1xuICBjb25zdCBzZXNzaW9uTWFuYWdlciA9IHB0eU1hbmFnZXIuZ2V0U2Vzc2lvbk1hbmFnZXIoKTtcbiAgY29uc3QgY2xlYW51cFJlc3VsdCA9IHNlc3Npb25NYW5hZ2VyLmNsZWFudXBPbGRWZXJzaW9uU2Vzc2lvbnMoKTtcbiAgaWYgKGNsZWFudXBSZXN1bHQudmVyc2lvbkNoYW5nZWQpIHtcbiAgICBsb2dnZXIubG9nKFxuICAgICAgY2hhbGsueWVsbG93KFxuICAgICAgICBgVmVyc2lvbiBjaGFuZ2UgZGV0ZWN0ZWQgLSBjbGVhbmVkIHVwICR7Y2xlYW51cFJlc3VsdC5jbGVhbmVkQ291bnR9IHNlc3Npb25zIGZyb20gcHJldmlvdXMgdmVyc2lvbmBcbiAgICAgIClcbiAgICApO1xuICB9IGVsc2UgaWYgKGNsZWFudXBSZXN1bHQuY2xlYW5lZENvdW50ID4gMCkge1xuICAgIGxvZ2dlci5sb2coXG4gICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgIGBDbGVhbmVkIHVwICR7Y2xlYW51cFJlc3VsdC5jbGVhbmVkQ291bnR9IGxlZ2FjeSBzZXNzaW9ucyB3aXRob3V0IHZlcnNpb24gaW5mb3JtYXRpb25gXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIEluaXRpYWxpemUgVGVybWluYWwgTWFuYWdlciBmb3Igc2VydmVyLXNpZGUgdGVybWluYWwgc3RhdGVcbiAgY29uc3QgdGVybWluYWxNYW5hZ2VyID0gbmV3IFRlcm1pbmFsTWFuYWdlcihDT05UUk9MX0RJUik7XG4gIGxvZ2dlci5kZWJ1ZygnSW5pdGlhbGl6ZWQgdGVybWluYWwgbWFuYWdlcicpO1xuXG4gIC8vIFNldCB1cCBwZXJpb2RpYyBjbGVhbnVwIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtzXG4gIGNvbnN0IENMRUFOVVBfSU5URVJWQUwgPSA2MCAqIDYwICogMTAwMDsgLy8gMSBob3VyXG4gIGNvbnN0IGNsZWFudXBJbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICB0cnkge1xuICAgICAgLy8gQ2xlYW4gdXAgaW5hY3RpdmUgdGVybWluYWxzIG9sZGVyIHRoYW4gNCBob3Vyc1xuICAgICAgdGVybWluYWxNYW5hZ2VyLmNsZWFudXBJbmFjdGl2ZVRlcm1pbmFscyg0ICogNjAgKiA2MCAqIDEwMDApO1xuXG4gICAgICAvLyBDbGVhbiB1cCBleGl0ZWQgc2Vzc2lvbnNcbiAgICAgIHB0eU1hbmFnZXIuY2xlYW51cEV4aXRlZFNlc3Npb25zKCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdFcnJvciBkdXJpbmcgcGVyaW9kaWMgY2xlYW51cDonLCBlcnJvcik7XG4gICAgfVxuICB9LCBDTEVBTlVQX0lOVEVSVkFMKTtcblxuICAvLyBDbGVhbiB1cCBpbnRlcnZhbCBvbiBzaHV0ZG93blxuICBwcm9jZXNzLm9uKCdleGl0JywgKCkgPT4ge1xuICAgIGNsZWFySW50ZXJ2YWwoY2xlYW51cEludGVydmFsKTtcbiAgfSk7XG5cbiAgLy8gSW5pdGlhbGl6ZSBzdHJlYW0gd2F0Y2hlciBmb3IgZmlsZS1iYXNlZCBzdHJlYW1pbmdcbiAgY29uc3Qgc3RyZWFtV2F0Y2hlciA9IG5ldyBTdHJlYW1XYXRjaGVyKHNlc3Npb25NYW5hZ2VyKTtcbiAgbG9nZ2VyLmRlYnVnKCdJbml0aWFsaXplZCBzdHJlYW0gd2F0Y2hlcicpO1xuXG4gIC8vIEluaXRpYWxpemUgc2Vzc2lvbiBtb25pdG9yIHdpdGggUFRZIG1hbmFnZXJcbiAgY29uc3Qgc2Vzc2lvbk1vbml0b3IgPSBuZXcgU2Vzc2lvbk1vbml0b3IocHR5TWFuYWdlcik7XG4gIGF3YWl0IHNlc3Npb25Nb25pdG9yLmluaXRpYWxpemUoKTtcblxuICAvLyBTZXQgdGhlIHNlc3Npb24gbW9uaXRvciBvbiBQVFkgbWFuYWdlciBmb3IgZGF0YSB0cmFja2luZ1xuICBwdHlNYW5hZ2VyLnNldFNlc3Npb25Nb25pdG9yKHNlc3Npb25Nb25pdG9yKTtcbiAgbG9nZ2VyLmRlYnVnKCdJbml0aWFsaXplZCBzZXNzaW9uIG1vbml0b3InKTtcblxuICAvLyBJbml0aWFsaXplIGFjdGl2aXR5IG1vbml0b3JcbiAgY29uc3QgYWN0aXZpdHlNb25pdG9yID0gbmV3IEFjdGl2aXR5TW9uaXRvcihDT05UUk9MX0RJUik7XG4gIGxvZ2dlci5kZWJ1ZygnSW5pdGlhbGl6ZWQgYWN0aXZpdHkgbW9uaXRvcicpO1xuXG4gIC8vIEluaXRpYWxpemUgY29uZmlndXJhdGlvbiBzZXJ2aWNlXG4gIGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgQ29uZmlnU2VydmljZSgpO1xuICBjb25maWdTZXJ2aWNlLnN0YXJ0V2F0Y2hpbmcoKTtcbiAgbG9nZ2VyLmRlYnVnKCdJbml0aWFsaXplZCBjb25maWd1cmF0aW9uIHNlcnZpY2UnKTtcblxuICAvLyBJbml0aWFsaXplIHB1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2VzXG4gIGxldCB2YXBpZE1hbmFnZXI6IFZhcGlkTWFuYWdlciB8IG51bGwgPSBudWxsO1xuICBsZXQgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2U6IFB1c2hOb3RpZmljYXRpb25TZXJ2aWNlIHwgbnVsbCA9IG51bGw7XG5cbiAgaWYgKGNvbmZpZy5wdXNoRW5hYmxlZCkge1xuICAgIHRyeSB7XG4gICAgICBsb2dnZXIubG9nKCdJbml0aWFsaXppbmcgcHVzaCBub3RpZmljYXRpb24gc2VydmljZXMnKTtcblxuICAgICAgLy8gSW5pdGlhbGl6ZSBWQVBJRCBtYW5hZ2VyIHdpdGggYXV0by1nZW5lcmF0aW9uXG4gICAgICB2YXBpZE1hbmFnZXIgPSBuZXcgVmFwaWRNYW5hZ2VyKCk7XG4gICAgICBhd2FpdCB2YXBpZE1hbmFnZXIuaW5pdGlhbGl6ZSh7XG4gICAgICAgIGNvbnRhY3RFbWFpbDogY29uZmlnLnZhcGlkRW1haWwgfHwgJ25vcmVwbHlAdmliZXR1bm5lbC5sb2NhbCcsXG4gICAgICAgIGdlbmVyYXRlSWZNaXNzaW5nOiB0cnVlLCAvLyBBdXRvLWdlbmVyYXRlIGtleXMgaWYgbm9uZSBleGlzdFxuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5sb2coJ1ZBUElEIGtleXMgaW5pdGlhbGl6ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG5cbiAgICAgIC8vIEluaXRpYWxpemUgcHVzaCBub3RpZmljYXRpb24gc2VydmljZVxuICAgICAgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgUHVzaE5vdGlmaWNhdGlvblNlcnZpY2UodmFwaWRNYW5hZ2VyKTtcbiAgICAgIGF3YWl0IHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlLmluaXRpYWxpemUoKTtcblxuICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbignUHVzaCBub3RpZmljYXRpb24gc2VydmljZXMgaW5pdGlhbGl6ZWQnKSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgcHVzaCBub3RpZmljYXRpb24gc2VydmljZXM6JywgZXJyb3IpO1xuICAgICAgbG9nZ2VyLndhcm4oJ0NvbnRpbnVpbmcgd2l0aG91dCBwdXNoIG5vdGlmaWNhdGlvbnMnKTtcbiAgICAgIHZhcGlkTWFuYWdlciA9IG51bGw7XG4gICAgICBwdXNoTm90aWZpY2F0aW9uU2VydmljZSA9IG51bGw7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZ2dlci5kZWJ1ZygnUHVzaCBub3RpZmljYXRpb25zIGRpc2FibGVkJyk7XG4gIH1cblxuICAvLyBDb25uZWN0IFNlc3Npb25Nb25pdG9yIHRvIHB1c2ggbm90aWZpY2F0aW9uIHNlcnZpY2VcbiAgaWYgKHNlc3Npb25Nb25pdG9yICYmIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlKSB7XG4gICAgbG9nZ2VyLmluZm8oJ0Nvbm5lY3RpbmcgU2Vzc2lvbk1vbml0b3IgdG8gcHVzaCBub3RpZmljYXRpb24gc2VydmljZScpO1xuXG4gICAgLy8gTGlzdGVuIGZvciBzZXNzaW9uIG1vbml0b3Igbm90aWZpY2F0aW9ucyBhbmQgc2VuZCBwdXNoIG5vdGlmaWNhdGlvbnNcbiAgICBzZXNzaW9uTW9uaXRvci5vbignbm90aWZpY2F0aW9uJywgYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICAvLyBNYXAgZXZlbnQgdHlwZXMgdG8gcHVzaCBub3RpZmljYXRpb24gZGF0YVxuICAgICAgICBsZXQgcHVzaFBheWxvYWQgPSBudWxsO1xuXG4gICAgICAgIHN3aXRjaCAoZXZlbnQudHlwZSkge1xuICAgICAgICAgIGNhc2UgU2VydmVyRXZlbnRUeXBlLlNlc3Npb25TdGFydDpcbiAgICAgICAgICAgIHB1c2hQYXlsb2FkID0ge1xuICAgICAgICAgICAgICB0eXBlOiAnc2Vzc2lvbi1zdGFydCcsXG4gICAgICAgICAgICAgIHRpdGxlOiAn8J+agCBTZXNzaW9uIFN0YXJ0ZWQnLFxuICAgICAgICAgICAgICBib2R5OiBldmVudC5zZXNzaW9uTmFtZSB8fCAnVGVybWluYWwgU2Vzc2lvbicsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBjYXNlIFNlcnZlckV2ZW50VHlwZS5TZXNzaW9uRXhpdDpcbiAgICAgICAgICAgIHB1c2hQYXlsb2FkID0ge1xuICAgICAgICAgICAgICB0eXBlOiAnc2Vzc2lvbi1leGl0JyxcbiAgICAgICAgICAgICAgdGl0bGU6ICfwn4+BIFNlc3Npb24gRW5kZWQnLFxuICAgICAgICAgICAgICBib2R5OiBldmVudC5zZXNzaW9uTmFtZSB8fCAnVGVybWluYWwgU2Vzc2lvbicsXG4gICAgICAgICAgICAgIGRhdGE6IHsgZXhpdENvZGU6IGV2ZW50LmV4aXRDb2RlIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBjYXNlIFNlcnZlckV2ZW50VHlwZS5Db21tYW5kRmluaXNoZWQ6XG4gICAgICAgICAgICBwdXNoUGF5bG9hZCA9IHtcbiAgICAgICAgICAgICAgdHlwZTogJ2NvbW1hbmQtZmluaXNoZWQnLFxuICAgICAgICAgICAgICB0aXRsZTogJ+KchSBZb3VyIFR1cm4nLFxuICAgICAgICAgICAgICBib2R5OiBldmVudC5jb21tYW5kIHx8ICdDb21tYW5kIGNvbXBsZXRlZCcsXG4gICAgICAgICAgICAgIGRhdGE6IHsgZHVyYXRpb246IGV2ZW50LmR1cmF0aW9uIH0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBjYXNlIFNlcnZlckV2ZW50VHlwZS5Db21tYW5kRXJyb3I6XG4gICAgICAgICAgICBwdXNoUGF5bG9hZCA9IHtcbiAgICAgICAgICAgICAgdHlwZTogJ2NvbW1hbmQtZXJyb3InLFxuICAgICAgICAgICAgICB0aXRsZTogJ+KdjCBDb21tYW5kIEZhaWxlZCcsXG4gICAgICAgICAgICAgIGJvZHk6IGV2ZW50LmNvbW1hbmQgfHwgJ0NvbW1hbmQgZmFpbGVkJyxcbiAgICAgICAgICAgICAgZGF0YTogeyBleGl0Q29kZTogZXZlbnQuZXhpdENvZGUgfSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIGNhc2UgU2VydmVyRXZlbnRUeXBlLkJlbGw6XG4gICAgICAgICAgICBwdXNoUGF5bG9hZCA9IHtcbiAgICAgICAgICAgICAgdHlwZTogJ2JlbGwnLFxuICAgICAgICAgICAgICB0aXRsZTogJ/CflJQgVGVybWluYWwgQmVsbCcsXG4gICAgICAgICAgICAgIGJvZHk6IGV2ZW50LnNlc3Npb25OYW1lIHx8ICdUZXJtaW5hbCcsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBjYXNlIFNlcnZlckV2ZW50VHlwZS5DbGF1ZGVUdXJuOlxuICAgICAgICAgICAgcHVzaFBheWxvYWQgPSB7XG4gICAgICAgICAgICAgIHR5cGU6ICdjbGF1ZGUtdHVybicsXG4gICAgICAgICAgICAgIHRpdGxlOiAn8J+SrCBZb3VyIFR1cm4nLFxuICAgICAgICAgICAgICBib2R5OiBldmVudC5tZXNzYWdlIHx8ICdDbGF1ZGUgaGFzIGZpbmlzaGVkIHJlc3BvbmRpbmcnLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSBTZXJ2ZXJFdmVudFR5cGUuVGVzdE5vdGlmaWNhdGlvbjpcbiAgICAgICAgICAgIC8vIFRlc3Qgbm90aWZpY2F0aW9ucyBhcmUgYWxyZWFkeSBoYW5kbGVkIGJ5IHRoZSB0ZXN0IGVuZHBvaW50XG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHVua25vd24gZXZlbnQgdHlwZXNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwdXNoUGF5bG9hZCkge1xuICAgICAgICAgIC8vIFNlbmQgcHVzaCBub3RpZmljYXRpb25cbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBwdXNoTm90aWZpY2F0aW9uU2VydmljZS5zZW5kTm90aWZpY2F0aW9uKHtcbiAgICAgICAgICAgIC4uLnB1c2hQYXlsb2FkLFxuICAgICAgICAgICAgaWNvbjogJy9hcHBsZS10b3VjaC1pY29uLnBuZycsXG4gICAgICAgICAgICBiYWRnZTogJy9mYXZpY29uLTMyLnBuZycsXG4gICAgICAgICAgICB0YWc6IGB2aWJldHVubmVsLSR7cHVzaFBheWxvYWQudHlwZX1gLFxuICAgICAgICAgICAgcmVxdWlyZUludGVyYWN0aW9uOiBwdXNoUGF5bG9hZC50eXBlID09PSAnY29tbWFuZC1lcnJvcicsXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBhY3Rpb246ICd2aWV3LXNlc3Npb24nLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnVmlldyBTZXNzaW9uJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGFjdGlvbjogJ2Rpc21pc3MnLFxuICAgICAgICAgICAgICAgIHRpdGxlOiAnRGlzbWlzcycsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgICAuLi5wdXNoUGF5bG9hZC5kYXRhLFxuICAgICAgICAgICAgICB0eXBlOiBwdXNoUGF5bG9hZC50eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uSWQ6IGV2ZW50LnNlc3Npb25JZCxcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICAgICAgYFB1c2ggbm90aWZpY2F0aW9uIHNlbnQgZm9yICR7ZXZlbnQudHlwZX06ICR7cmVzdWx0LnNlbnR9IHN1Y2Nlc3NmdWwsICR7cmVzdWx0LmZhaWxlZH0gZmFpbGVkYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHNlbmQgcHVzaCBub3RpZmljYXRpb24gZm9yIFNlc3Npb25Nb25pdG9yIGV2ZW50OicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIEluaXRpYWxpemUgSFEgY29tcG9uZW50c1xuICBsZXQgcmVtb3RlUmVnaXN0cnk6IFJlbW90ZVJlZ2lzdHJ5IHwgbnVsbCA9IG51bGw7XG4gIGxldCBocUNsaWVudDogSFFDbGllbnQgfCBudWxsID0gbnVsbDtcbiAgbGV0IGNvbnRyb2xEaXJXYXRjaGVyOiBDb250cm9sRGlyV2F0Y2hlciB8IG51bGwgPSBudWxsO1xuICBsZXQgYnVmZmVyQWdncmVnYXRvcjogQnVmZmVyQWdncmVnYXRvciB8IG51bGwgPSBudWxsO1xuICBsZXQgcmVtb3RlQmVhcmVyVG9rZW46IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG4gIGlmIChjb25maWcuaXNIUU1vZGUpIHtcbiAgICByZW1vdGVSZWdpc3RyeSA9IG5ldyBSZW1vdGVSZWdpc3RyeSgpO1xuICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oJ1J1bm5pbmcgaW4gSFEgbW9kZScpKTtcbiAgICBsb2dnZXIuZGVidWcoJ0luaXRpYWxpemVkIHJlbW90ZSByZWdpc3RyeSBmb3IgSFEgbW9kZScpO1xuICB9IGVsc2UgaWYgKFxuICAgIGNvbmZpZy5ocVVybCAmJlxuICAgIGNvbmZpZy5yZW1vdGVOYW1lICYmXG4gICAgKGNvbmZpZy5ub0hxQXV0aCB8fCAoY29uZmlnLmhxVXNlcm5hbWUgJiYgY29uZmlnLmhxUGFzc3dvcmQpKVxuICApIHtcbiAgICAvLyBHZW5lcmF0ZSBiZWFyZXIgdG9rZW4gZm9yIHRoaXMgcmVtb3RlIHNlcnZlclxuICAgIHJlbW90ZUJlYXJlclRva2VuID0gdXVpZHY0KCk7XG4gICAgbG9nZ2VyLmRlYnVnKGBHZW5lcmF0ZWQgYmVhcmVyIHRva2VuIGZvciByZW1vdGUgc2VydmVyOiAke2NvbmZpZy5yZW1vdGVOYW1lfWApO1xuICB9XG5cbiAgLy8gSW5pdGlhbGl6ZSBhdXRoZW50aWNhdGlvbiBzZXJ2aWNlXG4gIGNvbnN0IGF1dGhTZXJ2aWNlID0gbmV3IEF1dGhTZXJ2aWNlKCk7XG4gIGxvZ2dlci5kZWJ1ZygnSW5pdGlhbGl6ZWQgYXV0aGVudGljYXRpb24gc2VydmljZScpO1xuXG4gIC8vIEluaXRpYWxpemUgYnVmZmVyIGFnZ3JlZ2F0b3JcbiAgYnVmZmVyQWdncmVnYXRvciA9IG5ldyBCdWZmZXJBZ2dyZWdhdG9yKHtcbiAgICB0ZXJtaW5hbE1hbmFnZXIsXG4gICAgcmVtb3RlUmVnaXN0cnksXG4gICAgaXNIUU1vZGU6IGNvbmZpZy5pc0hRTW9kZSxcbiAgfSk7XG4gIGxvZ2dlci5kZWJ1ZygnSW5pdGlhbGl6ZWQgYnVmZmVyIGFnZ3JlZ2F0b3InKTtcblxuICAvLyBJbml0aWFsaXplIFdlYlNvY2tldCBpbnB1dCBoYW5kbGVyXG4gIGNvbnN0IHdlYnNvY2tldElucHV0SGFuZGxlciA9IG5ldyBXZWJTb2NrZXRJbnB1dEhhbmRsZXIoe1xuICAgIHB0eU1hbmFnZXIsXG4gICAgdGVybWluYWxNYW5hZ2VyLFxuICAgIGFjdGl2aXR5TW9uaXRvcixcbiAgICByZW1vdGVSZWdpc3RyeSxcbiAgICBhdXRoU2VydmljZSxcbiAgICBpc0hRTW9kZTogY29uZmlnLmlzSFFNb2RlLFxuICB9KTtcbiAgbG9nZ2VyLmRlYnVnKCdJbml0aWFsaXplZCBXZWJTb2NrZXQgaW5wdXQgaGFuZGxlcicpO1xuXG4gIC8vIFNldCB1cCBhdXRoZW50aWNhdGlvblxuICBjb25zdCBhdXRoTWlkZGxld2FyZSA9IGNyZWF0ZUF1dGhNaWRkbGV3YXJlKHtcbiAgICBlbmFibGVTU0hLZXlzOiBjb25maWcuZW5hYmxlU1NIS2V5cyxcbiAgICBkaXNhbGxvd1VzZXJQYXNzd29yZDogY29uZmlnLmRpc2FsbG93VXNlclBhc3N3b3JkLFxuICAgIG5vQXV0aDogY29uZmlnLm5vQXV0aCxcbiAgICBpc0hRTW9kZTogY29uZmlnLmlzSFFNb2RlLFxuICAgIGJlYXJlclRva2VuOiByZW1vdGVCZWFyZXJUb2tlbiB8fCB1bmRlZmluZWQsIC8vIFRva2VuIHRoYXQgSFEgbXVzdCB1c2UgdG8gYXV0aCB3aXRoIHVzXG4gICAgYXV0aFNlcnZpY2UsIC8vIEFkZCBlbmhhbmNlZCBhdXRoIHNlcnZpY2UgZm9yIEpXVCB0b2tlbnNcbiAgICBhbGxvd0xvY2FsQnlwYXNzOiBjb25maWcuYWxsb3dMb2NhbEJ5cGFzcyxcbiAgICBsb2NhbEF1dGhUb2tlbjogY29uZmlnLmxvY2FsQXV0aFRva2VuIHx8IHVuZGVmaW5lZCxcbiAgICBhbGxvd1RhaWxzY2FsZUF1dGg6IGNvbmZpZy5lbmFibGVUYWlsc2NhbGVTZXJ2ZSxcbiAgfSk7XG5cbiAgLy8gU2VydmUgc3RhdGljIGZpbGVzIHdpdGggLmh0bWwgZXh0ZW5zaW9uIGhhbmRsaW5nIGFuZCBjYWNoaW5nIGhlYWRlcnNcbiAgLy8gSW4gcHJvZHVjdGlvbi9idW5kbGVkIG1vZGUsIHVzZSB0aGUgcGFja2FnZSBkaXJlY3Rvcnk7IGluIGRldmVsb3BtZW50LCB1c2UgY3dkXG4gIGNvbnN0IGdldFB1YmxpY1BhdGggPSAoKSA9PiB7XG4gICAgLy8gRmlyc3QgY2hlY2sgaWYgQlVJTERfUFVCTElDX1BBVEggaXMgc2V0ICh1c2VkIGJ5IE1hYyBhcHAgYnVuZGxlKVxuICAgIGlmIChwcm9jZXNzLmVudi5CVUlMRF9QVUJMSUNfUEFUSCkge1xuICAgICAgbG9nZ2VyLmluZm8oYFVzaW5nIEJVSUxEX1BVQkxJQ19QQVRIOiAke3Byb2Nlc3MuZW52LkJVSUxEX1BVQkxJQ19QQVRIfWApO1xuICAgICAgcmV0dXJuIHByb2Nlc3MuZW52LkJVSUxEX1BVQkxJQ19QQVRIO1xuICAgIH1cbiAgICAvLyBNb3JlIHByZWNpc2UgbnBtIHBhY2thZ2UgZGV0ZWN0aW9uOlxuICAgIC8vIDEuIENoZWNrIGlmIHdlJ3JlIGV4cGxpY2l0bHkgaW4gYW4gbnBtIHBhY2thZ2Ugc3RydWN0dXJlXG4gICAgLy8gMi4gVGhlIGZpbGUgc2hvdWxkIGJlIGluIG5vZGVfbW9kdWxlcy92aWJldHVubmVsL2xpYi9cbiAgICAvLyAzLiBPciBjaGVjayBmb3Igb3VyIHNwZWNpZmljIHBhY2thZ2UgbWFya2Vyc1xuICAgIGNvbnN0IGlzTnBtUGFja2FnZSA9ICgoKSA9PiB7XG4gICAgICAvLyBNb3N0IHJlbGlhYmxlOiBjaGVjayBpZiB3ZSdyZSBpbiBub2RlX21vZHVsZXMvdmliZXR1bm5lbCBzdHJ1Y3R1cmVcbiAgICAgIGlmIChfX2ZpbGVuYW1lLmluY2x1ZGVzKHBhdGguam9pbignbm9kZV9tb2R1bGVzJywgJ3ZpYmV0dW5uZWwnLCAnbGliJykpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBmb3IgV2luZG93cyBwYXRoIHZhcmlhbnRcbiAgICAgIGlmIChfX2ZpbGVuYW1lLmluY2x1ZGVzKCdub2RlX21vZHVsZXNcXFxcdmliZXR1bm5lbFxcXFxsaWInKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgLy8gU2Vjb25kYXJ5IGNoZWNrOiBpZiB3ZSdyZSBpbiBhIGxpYiBkaXJlY3RvcnksIHZlcmlmeSBpdCdzIGFjdHVhbGx5IGFuIG5wbSBwYWNrYWdlXG4gICAgICAvLyBieSBjaGVja2luZyBmb3IgdGhlIGV4aXN0ZW5jZSBvZiBwYWNrYWdlLmpzb24gaW4gdGhlIHBhcmVudCBkaXJlY3RvcnlcbiAgICAgIGlmIChwYXRoLmJhc2VuYW1lKF9fZGlybmFtZSkgPT09ICdsaWInKSB7XG4gICAgICAgIGNvbnN0IHBhcmVudERpciA9IHBhdGguZGlybmFtZShfX2Rpcm5hbWUpO1xuICAgICAgICBjb25zdCBwYWNrYWdlSnNvblBhdGggPSBwYXRoLmpvaW4ocGFyZW50RGlyLCAncGFja2FnZS5qc29uJyk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFja2FnZUpzb24gPSByZXF1aXJlKHBhY2thZ2VKc29uUGF0aCk7XG4gICAgICAgICAgLy8gVmVyaWZ5IHRoaXMgaXMgYWN0dWFsbHkgb3VyIHBhY2thZ2VcbiAgICAgICAgICByZXR1cm4gcGFja2FnZUpzb24ubmFtZSA9PT0gJ3ZpYmV0dW5uZWwnO1xuICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAvLyBOb3QgYSB2YWxpZCBucG0gcGFja2FnZSBzdHJ1Y3R1cmVcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0pKCk7XG5cbiAgICBpZiAocHJvY2Vzcy5lbnYuVklCRVRVTk5FTF9CVU5ETEVEID09PSAndHJ1ZScgfHwgcHJvY2Vzcy5lbnYuQlVJTERfREFURSB8fCBpc05wbVBhY2thZ2UpIHtcbiAgICAgIC8vIEluIGJ1bmRsZWQvcHJvZHVjdGlvbi9ucG0gbW9kZSwgZmluZCBwYWNrYWdlIHJvb3RcbiAgICAgIC8vIFdoZW4gYnVuZGxlZCwgX19kaXJuYW1lIGlzIC9wYXRoL3RvL3BhY2thZ2UvZGlzdCwgc28gZ28gdXAgb25lIGxldmVsXG4gICAgICAvLyBXaGVuIGdsb2JhbGx5IGluc3RhbGxlZCwgd2UgbmVlZCB0byBmaW5kIHRoZSBwYWNrYWdlIHJvb3RcbiAgICAgIGxldCBwYWNrYWdlUm9vdCA9IF9fZGlybmFtZTtcblxuICAgICAgLy8gSWYgd2UncmUgaW4gdGhlIGRpc3QgZGlyZWN0b3J5LCBnbyB1cCBvbmUgbGV2ZWxcbiAgICAgIGlmIChwYXRoLmJhc2VuYW1lKHBhY2thZ2VSb290KSA9PT0gJ2Rpc3QnKSB7XG4gICAgICAgIHBhY2thZ2VSb290ID0gcGF0aC5kaXJuYW1lKHBhY2thZ2VSb290KTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yIG5wbSBwYWNrYWdlIGNvbnRleHQsIGlmIHdlJ3JlIGluIGxpYiBkaXJlY3RvcnksIGdvIHVwIG9uZSBsZXZlbFxuICAgICAgaWYgKHBhdGguYmFzZW5hbWUocGFja2FnZVJvb3QpID09PSAnbGliJykge1xuICAgICAgICBwYWNrYWdlUm9vdCA9IHBhdGguZGlybmFtZShwYWNrYWdlUm9vdCk7XG4gICAgICB9XG5cbiAgICAgIC8vIExvb2sgZm9yIHBhY2thZ2UuanNvbiB0byBjb25maXJtIHdlJ3JlIGluIHRoZSByaWdodCBwbGFjZVxuICAgICAgY29uc3QgcHVibGljUGF0aCA9IHBhdGguam9pbihwYWNrYWdlUm9vdCwgJ3B1YmxpYycpO1xuICAgICAgY29uc3QgaW5kZXhQYXRoID0gcGF0aC5qb2luKHB1YmxpY1BhdGgsICdpbmRleC5odG1sJyk7XG5cbiAgICAgIC8vIElmIGluZGV4Lmh0bWwgZXhpc3RzLCB3ZSBmb3VuZCB0aGUgcmlnaHQgcGF0aFxuICAgICAgaWYgKHJlcXVpcmUoJ2ZzJykuZXhpc3RzU3luYyhpbmRleFBhdGgpKSB7XG4gICAgICAgIHJldHVybiBwdWJsaWNQYXRoO1xuICAgICAgfVxuXG4gICAgICAvLyBGYWxsYmFjazogdHJ5IGdvaW5nIHVwIGZyb20gdGhlIGJ1bmRsZWQgQ0xJIGxvY2F0aW9uXG4gICAgICAvLyBUaGUgYnVuZGxlZCBDTEkgbWlnaHQgYmUgaW4gbm9kZV9tb2R1bGVzL3ZpYmV0dW5uZWwvZGlzdC9cbiAgICAgIHJldHVybiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4nLCAncHVibGljJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEluIGRldmVsb3BtZW50IG1vZGUsIHVzZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5XG4gICAgICByZXR1cm4gcGF0aC5qb2luKHByb2Nlc3MuY3dkKCksICdwdWJsaWMnKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgcHVibGljUGF0aCA9IGdldFB1YmxpY1BhdGgoKTtcbiAgY29uc3QgaXNEZXZlbG9wbWVudCA9ICFwcm9jZXNzLmVudi5CVUlMRF9EQVRFIHx8IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnO1xuXG4gIGFwcC51c2UoXG4gICAgZXhwcmVzcy5zdGF0aWMocHVibGljUGF0aCwge1xuICAgICAgZXh0ZW5zaW9uczogWydodG1sJ10sIC8vIFRoaXMgYWxsb3dzIC9sb2dzIHRvIHJlc29sdmUgdG8gL2xvZ3MuaHRtbFxuICAgICAgbWF4QWdlOiBpc0RldmVsb3BtZW50ID8gMCA6ICcxZCcsIC8vIE5vIGNhY2hlIGluIGRldiwgMSBkYXkgaW4gcHJvZHVjdGlvblxuICAgICAgZXRhZzogIWlzRGV2ZWxvcG1lbnQsIC8vIERpc2FibGUgRVRhZyBpbiBkZXZlbG9wbWVudFxuICAgICAgbGFzdE1vZGlmaWVkOiAhaXNEZXZlbG9wbWVudCwgLy8gRGlzYWJsZSBMYXN0LU1vZGlmaWVkIGluIGRldmVsb3BtZW50XG4gICAgICBzZXRIZWFkZXJzOiAocmVzLCBmaWxlUGF0aCkgPT4ge1xuICAgICAgICBpZiAoaXNEZXZlbG9wbWVudCkge1xuICAgICAgICAgIC8vIERpc2FibGUgYWxsIGNhY2hpbmcgaW4gZGV2ZWxvcG1lbnRcbiAgICAgICAgICByZXMuc2V0SGVhZGVyKCdDYWNoZS1Db250cm9sJywgJ25vLWNhY2hlLCBuby1zdG9yZSwgbXVzdC1yZXZhbGlkYXRlJyk7XG4gICAgICAgICAgcmVzLnNldEhlYWRlcignUHJhZ21hJywgJ25vLWNhY2hlJyk7XG4gICAgICAgICAgcmVzLnNldEhlYWRlcignRXhwaXJlcycsICcwJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gUHJvZHVjdGlvbiBjYWNoaW5nIHJ1bGVzXG4gICAgICAgICAgLy8gU2V0IGxvbmdlciBjYWNoZSBmb3IgaW1tdXRhYmxlIGFzc2V0c1xuICAgICAgICAgIGlmIChmaWxlUGF0aC5tYXRjaCgvXFwuKGpzfGNzc3x3b2ZmMj98dHRmfGVvdHxzdmd8cG5nfGpwZ3xqcGVnfGdpZnxpY28pJC8pKSB7XG4gICAgICAgICAgICByZXMuc2V0SGVhZGVyKCdDYWNoZS1Db250cm9sJywgJ3B1YmxpYywgbWF4LWFnZT0zMTUzNjAwMCwgaW1tdXRhYmxlJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNob3J0ZXIgY2FjaGUgZm9yIEhUTUwgZmlsZXNcbiAgICAgICAgICBlbHNlIGlmIChmaWxlUGF0aC5lbmRzV2l0aCgnLmh0bWwnKSkge1xuICAgICAgICAgICAgcmVzLnNldEhlYWRlcignQ2FjaGUtQ29udHJvbCcsICdwdWJsaWMsIG1heC1hZ2U9MzYwMCcpOyAvLyAxIGhvdXJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfSlcbiAgKTtcbiAgbG9nZ2VyLmRlYnVnKFxuICAgIGBTZXJ2aW5nIHN0YXRpYyBmaWxlcyBmcm9tOiAke3B1YmxpY1BhdGh9ICR7aXNEZXZlbG9wbWVudCA/ICd3aXRoIGNhY2hpbmcgZGlzYWJsZWQgKGRldiBtb2RlKScgOiAnd2l0aCBjYWNoaW5nIGhlYWRlcnMnfWBcbiAgKTtcblxuICAvLyBIZWFsdGggY2hlY2sgZW5kcG9pbnQgKG5vIGF1dGggcmVxdWlyZWQpXG4gIGFwcC5nZXQoJy9hcGkvaGVhbHRoJywgKF9yZXEsIHJlcykgPT4ge1xuICAgIGNvbnN0IHZlcnNpb25JbmZvID0gZ2V0VmVyc2lvbkluZm8oKTtcbiAgICByZXMuanNvbih7XG4gICAgICBzdGF0dXM6ICdvaycsXG4gICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIG1vZGU6IGNvbmZpZy5pc0hRTW9kZSA/ICdocScgOiAncmVtb3RlJyxcbiAgICAgIHZlcnNpb246IHZlcnNpb25JbmZvLnZlcnNpb24sXG4gICAgICBidWlsZERhdGU6IHZlcnNpb25JbmZvLmJ1aWxkRGF0ZSxcbiAgICAgIHVwdGltZTogdmVyc2lvbkluZm8udXB0aW1lLFxuICAgICAgcGlkOiB2ZXJzaW9uSW5mby5waWQsXG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIENTUkYgdG9rZW4gZW5kcG9pbnQgKG5vIGF1dGggcmVxdWlyZWQgZm9yIHRva2VuIGdlbmVyYXRpb24pXG4gIGFwcC5nZXQoJy9hcGkvY3NyZi10b2tlbicsIChfcmVxLCByZXMpID0+IHtcbiAgICAvLyBHZW5lcmF0ZSBhIGNyeXB0b2dyYXBoaWNhbGx5IHNlY3VyZSByYW5kb20gdG9rZW5cbiAgICBjb25zdCBjc3JmVG9rZW4gPSByZXF1aXJlKCdjcnlwdG8nKS5yYW5kb21CeXRlcygzMikudG9TdHJpbmcoJ2hleCcpO1xuXG4gICAgLy8gU2V0IHRoZSBDU1JGIHRva2VuIGFzIGFuIEhUVFAtb25seSBjb29raWUgZm9yIHNlY3VyaXR5XG4gICAgcmVzLmNvb2tpZSgnY3NyZi10b2tlbicsIGNzcmZUb2tlbiwge1xuICAgICAgaHR0cE9ubHk6IGZhbHNlLCAvLyBNdXN0IGJlIGFjY2Vzc2libGUgdG8gSmF2YVNjcmlwdCBmb3IgaGVhZGVyIGluY2x1c2lvblxuICAgICAgc2VjdXJlOiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nLCAvLyBIVFRQUyBvbmx5IGluIHByb2R1Y3Rpb25cbiAgICAgIHNhbWVTaXRlOiAnc3RyaWN0JywgLy8gUHJldmVudCBjcm9zcy1zaXRlIGNvb2tpZSB1c2FnZVxuICAgICAgbWF4QWdlOiAyNCAqIDYwICogNjAgKiAxMDAwLCAvLyAyNCBob3Vyc1xuICAgICAgcGF0aDogJy8nLFxuICAgIH0pO1xuXG4gICAgLy8gQWxzbyByZXR1cm4gaW4gcmVzcG9uc2UgYm9keSBmb3IgaW1tZWRpYXRlIHVzZVxuICAgIHJlcy5qc29uKHtcbiAgICAgIGNzcmZUb2tlbixcbiAgICAgIGV4cGlyZXNBdDogRGF0ZS5ub3coKSArIDI0ICogNjAgKiA2MCAqIDEwMDAsIC8vIDI0IGhvdXJzIGZyb20gbm93XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIENvbm5lY3Qgc2Vzc2lvbiBleGl0IG5vdGlmaWNhdGlvbnMgaWYgcHVzaCBub3RpZmljYXRpb25zIGFyZSBlbmFibGVkXG4gIGlmIChwdXNoTm90aWZpY2F0aW9uU2VydmljZSkge1xuICAgIHB0eU1hbmFnZXIub24oJ3Nlc3Npb25FeGl0ZWQnLCAoc2Vzc2lvbklkOiBzdHJpbmcpID0+IHtcbiAgICAgIC8vIExvYWQgc2Vzc2lvbiBpbmZvIHRvIGdldCBkZXRhaWxzXG4gICAgICBjb25zdCBzZXNzaW9uSW5mbyA9IHNlc3Npb25NYW5hZ2VyLmxvYWRTZXNzaW9uSW5mbyhzZXNzaW9uSWQpO1xuICAgICAgY29uc3QgZXhpdENvZGUgPSBzZXNzaW9uSW5mbz8uZXhpdENvZGUgPz8gMDtcbiAgICAgIGNvbnN0IHNlc3Npb25OYW1lID0gc2Vzc2lvbkluZm8/Lm5hbWUgfHwgYFNlc3Npb24gJHtzZXNzaW9uSWR9YDtcblxuICAgICAgLy8gRGV0ZXJtaW5lIG5vdGlmaWNhdGlvbiB0eXBlIGJhc2VkIG9uIGV4aXQgY29kZVxuICAgICAgY29uc3Qgbm90aWZpY2F0aW9uVHlwZSA9IGV4aXRDb2RlID09PSAwID8gJ3Nlc3Npb24tZXhpdCcgOiAnc2Vzc2lvbi1lcnJvcic7XG4gICAgICBjb25zdCB0aXRsZSA9IGV4aXRDb2RlID09PSAwID8gJ1Nlc3Npb24gRW5kZWQnIDogJ1Nlc3Npb24gRW5kZWQgd2l0aCBFcnJvcnMnO1xuICAgICAgY29uc3QgYm9keSA9XG4gICAgICAgIGV4aXRDb2RlID09PSAwXG4gICAgICAgICAgPyBgJHtzZXNzaW9uTmFtZX0gaGFzIGZpbmlzaGVkLmBcbiAgICAgICAgICA6IGAke3Nlc3Npb25OYW1lfSBleGl0ZWQgd2l0aCBjb2RlICR7ZXhpdENvZGV9LmA7XG5cbiAgICAgIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlXG4gICAgICAgIC5zZW5kTm90aWZpY2F0aW9uKHtcbiAgICAgICAgICB0eXBlOiBub3RpZmljYXRpb25UeXBlLFxuICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgIGJvZHksXG4gICAgICAgICAgaWNvbjogJy9hcHBsZS10b3VjaC1pY29uLnBuZycsXG4gICAgICAgICAgYmFkZ2U6ICcvZmF2aWNvbi0zMi5wbmcnLFxuICAgICAgICAgIHRhZzogYHZpYmV0dW5uZWwtJHtub3RpZmljYXRpb25UeXBlfS0ke3Nlc3Npb25JZH1gLFxuICAgICAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgdHlwZTogbm90aWZpY2F0aW9uVHlwZSxcbiAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIHNlc3Npb25OYW1lLFxuICAgICAgICAgICAgZXhpdENvZGUsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIHsgYWN0aW9uOiAndmlldy1sb2dzJywgdGl0bGU6ICdWaWV3IExvZ3MnIH0sXG4gICAgICAgICAgICB7IGFjdGlvbjogJ2Rpc21pc3MnLCB0aXRsZTogJ0Rpc21pc3MnIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIHNlbmQgc2Vzc2lvbiBleGl0IG5vdGlmaWNhdGlvbjonLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGxvZ2dlci5kZWJ1ZygnQ29ubmVjdGVkIHNlc3Npb24gZXhpdCBub3RpZmljYXRpb25zIHRvIFBUWSBtYW5hZ2VyJyk7XG5cbiAgICAvLyBDb25uZWN0IGNvbW1hbmQgZmluaXNoZWQgbm90aWZpY2F0aW9uc1xuICAgIHB0eU1hbmFnZXIub24oJ2NvbW1hbmRGaW5pc2hlZCcsICh7IHNlc3Npb25JZCwgY29tbWFuZCwgZXhpdENvZGUsIGR1cmF0aW9uLCB0aW1lc3RhbXAgfSkgPT4ge1xuICAgICAgY29uc3QgaXNDbGF1ZGVDb21tYW5kID0gY29tbWFuZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbGF1ZGUnKTtcblxuICAgICAgLy8gRW5oYW5jZWQgbG9nZ2luZyBmb3IgQ2xhdWRlIGNvbW1hbmRzXG4gICAgICBpZiAoaXNDbGF1ZGVDb21tYW5kKSB7XG4gICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgY2hhbGsubWFnZW50YShcbiAgICAgICAgICAgIGDwn5OsIFNlcnZlciByZWNlaXZlZCBDbGF1ZGUgY29tbWFuZEZpbmlzaGVkIGV2ZW50OiBzZXNzaW9uSWQ9JHtzZXNzaW9uSWR9LCBjb21tYW5kPVwiJHtjb21tYW5kfVwiLCBleGl0Q29kZT0ke2V4aXRDb2RlfSwgZHVyYXRpb249JHtkdXJhdGlvbn1tc2BcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgICAgYFNlcnZlciByZWNlaXZlZCBjb21tYW5kRmluaXNoZWQgZXZlbnQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9OiBcIiR7Y29tbWFuZH1cImBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gRGV0ZXJtaW5lIG5vdGlmaWNhdGlvbiB0eXBlIGJhc2VkIG9uIGV4aXQgY29kZVxuICAgICAgY29uc3Qgbm90aWZpY2F0aW9uVHlwZSA9IGV4aXRDb2RlID09PSAwID8gJ2NvbW1hbmQtZmluaXNoZWQnIDogJ2NvbW1hbmQtZXJyb3InO1xuICAgICAgY29uc3QgdGl0bGUgPSBleGl0Q29kZSA9PT0gMCA/ICdDb21tYW5kIENvbXBsZXRlZCcgOiAnQ29tbWFuZCBGYWlsZWQnO1xuICAgICAgY29uc3QgYm9keSA9XG4gICAgICAgIGV4aXRDb2RlID09PSAwXG4gICAgICAgICAgPyBgJHtjb21tYW5kfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YFxuICAgICAgICAgIDogYCR7Y29tbWFuZH0gZmFpbGVkIHdpdGggZXhpdCBjb2RlICR7ZXhpdENvZGV9YDtcblxuICAgICAgLy8gRm9ybWF0IGR1cmF0aW9uIGZvciBkaXNwbGF5XG4gICAgICBjb25zdCBkdXJhdGlvblN0ciA9XG4gICAgICAgIGR1cmF0aW9uID4gNjAwMDBcbiAgICAgICAgICA/IGAke01hdGgucm91bmQoZHVyYXRpb24gLyA2MDAwMCl9bSAke01hdGgucm91bmQoKGR1cmF0aW9uICUgNjAwMDApIC8gMTAwMCl9c2BcbiAgICAgICAgICA6IGAke01hdGgucm91bmQoZHVyYXRpb24gLyAxMDAwKX1zYDtcblxuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgU2VuZGluZyBwdXNoIG5vdGlmaWNhdGlvbjogdHlwZT0ke25vdGlmaWNhdGlvblR5cGV9LCB0aXRsZT1cIiR7dGl0bGV9XCIsIGJvZHk9XCIke2JvZHl9ICgke2R1cmF0aW9uU3RyfSlcImBcbiAgICAgICk7XG5cbiAgICAgIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlXG4gICAgICAgIC5zZW5kTm90aWZpY2F0aW9uKHtcbiAgICAgICAgICB0eXBlOiBub3RpZmljYXRpb25UeXBlLFxuICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgIGJvZHk6IGAke2JvZHl9ICgke2R1cmF0aW9uU3RyfSlgLFxuICAgICAgICAgIGljb246ICcvYXBwbGUtdG91Y2gtaWNvbi5wbmcnLFxuICAgICAgICAgIGJhZGdlOiAnL2Zhdmljb24tMzIucG5nJyxcbiAgICAgICAgICB0YWc6IGB2aWJldHVubmVsLWNvbW1hbmQtJHtzZXNzaW9uSWR9LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgICAgIHJlcXVpcmVJbnRlcmFjdGlvbjogZmFsc2UsXG4gICAgICAgICAgZGF0YToge1xuICAgICAgICAgICAgdHlwZTogbm90aWZpY2F0aW9uVHlwZSxcbiAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIGNvbW1hbmQsXG4gICAgICAgICAgICBleGl0Q29kZSxcbiAgICAgICAgICAgIGR1cmF0aW9uLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgeyBhY3Rpb246ICd2aWV3LXNlc3Npb24nLCB0aXRsZTogJ1ZpZXcgU2Vzc2lvbicgfSxcbiAgICAgICAgICAgIHsgYWN0aW9uOiAnZGlzbWlzcycsIHRpdGxlOiAnRGlzbWlzcycgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2VuZCBjb21tYW5kIGZpbmlzaGVkIG5vdGlmaWNhdGlvbjonLCBlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGxvZ2dlci5kZWJ1ZygnQ29ubmVjdGVkIGNvbW1hbmQgZmluaXNoZWQgbm90aWZpY2F0aW9ucyB0byBQVFkgbWFuYWdlcicpO1xuXG4gICAgLy8gQ29ubmVjdCBDbGF1ZGUgdHVybiBub3RpZmljYXRpb25zXG4gICAgcHR5TWFuYWdlci5vbignY2xhdWRlVHVybicsIChzZXNzaW9uSWQ6IHN0cmluZywgc2Vzc2lvbk5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgbG9nZ2VyLmluZm8oXG4gICAgICAgIGDwn5SUIE5PVElGSUNBVElPTiBERUJVRzogU2VuZGluZyBwdXNoIG5vdGlmaWNhdGlvbiBmb3IgQ2xhdWRlIHR1cm4gLSBzZXNzaW9uSWQ6ICR7c2Vzc2lvbklkfWBcbiAgICAgICk7XG5cbiAgICAgIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlXG4gICAgICAgIC5zZW5kTm90aWZpY2F0aW9uKHtcbiAgICAgICAgICB0eXBlOiAnY2xhdWRlLXR1cm4nLFxuICAgICAgICAgIHRpdGxlOiAnQ2xhdWRlIFJlYWR5JyxcbiAgICAgICAgICBib2R5OiBgJHtzZXNzaW9uTmFtZX0gaXMgd2FpdGluZyBmb3IgeW91ciBpbnB1dC5gLFxuICAgICAgICAgIGljb246ICcvYXBwbGUtdG91Y2gtaWNvbi5wbmcnLFxuICAgICAgICAgIGJhZGdlOiAnL2Zhdmljb24tMzIucG5nJyxcbiAgICAgICAgICB0YWc6IGB2aWJldHVubmVsLWNsYXVkZS10dXJuLSR7c2Vzc2lvbklkfWAsXG4gICAgICAgICAgcmVxdWlyZUludGVyYWN0aW9uOiB0cnVlLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIHR5cGU6ICdjbGF1ZGUtdHVybicsXG4gICAgICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgICAgICBzZXNzaW9uTmFtZSxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgeyBhY3Rpb246ICd2aWV3LXNlc3Npb24nLCB0aXRsZTogJ1ZpZXcgU2Vzc2lvbicgfSxcbiAgICAgICAgICAgIHsgYWN0aW9uOiAnZGlzbWlzcycsIHRpdGxlOiAnRGlzbWlzcycgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gc2VuZCBDbGF1ZGUgdHVybiBub3RpZmljYXRpb246JywgZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBsb2dnZXIuZGVidWcoJ0Nvbm5lY3RlZCBDbGF1ZGUgdHVybiBub3RpZmljYXRpb25zIHRvIFBUWSBtYW5hZ2VyJyk7XG4gIH1cblxuICAvLyBDU1JGIHRva2VuIGVuZHBvaW50IChubyBhdXRoIHJlcXVpcmVkLCB1c2VkIGJ5IGZyb250ZW5kKVxuICBhcHAuZ2V0KCcvYXBpL2NzcmYtdG9rZW4nLCAoX3JlcSwgcmVzKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIEdlbmVyYXRlIGEgY3J5cHRvZ3JhcGhpY2FsbHkgc2VjdXJlIHJhbmRvbSB0b2tlbiAoMzIgYnl0ZXMgPSA2NCBoZXggY2hhcnMpXG4gICAgICBjb25zdCBjc3JmVG9rZW4gPSBjcnlwdG8ucmFuZG9tQnl0ZXMoMzIpLnRvU3RyaW5nKCdoZXgnKTtcblxuICAgICAgY29uc3QgaXNEZXZlbG9wbWVudCA9ICFwcm9jZXNzLmVudi5CVUlMRF9EQVRFIHx8IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAnZGV2ZWxvcG1lbnQnO1xuXG4gICAgICAvLyBTZXQgQ1NSRiB0b2tlbiBpbiBjb29raWUgd2l0aCBzZWN1cmUgc2V0dGluZ3NcbiAgICAgIHJlcy5jb29raWUoJ2NzcmYtdG9rZW4nLCBjc3JmVG9rZW4sIHtcbiAgICAgICAgaHR0cE9ubHk6IGZhbHNlLCAvLyBNdXN0IGJlIGFjY2Vzc2libGUgdG8gSmF2YVNjcmlwdFxuICAgICAgICBzZWN1cmU6ICFpc0RldmVsb3BtZW50LCAvLyBPbmx5IHNlbmQgb3ZlciBIVFRQUyBpbiBwcm9kdWN0aW9uXG4gICAgICAgIHNhbWVTaXRlOiAnc3RyaWN0JywgLy8gU3RyaWN0IHNhbWUtc2l0ZSBwb2xpY3kgZm9yIENTUkYgcHJvdGVjdGlvblxuICAgICAgICBtYXhBZ2U6IDI0ICogNjAgKiA2MCAqIDEwMDAsIC8vIDI0IGhvdXJzXG4gICAgICAgIHBhdGg6ICcvJywgLy8gQXZhaWxhYmxlIHNpdGUtd2lkZVxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFsc28gcmV0dXJuIGluIHJlc3BvbnNlIGJvZHkgZm9yIGltbWVkaWF0ZSB1c2VcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgY3NyZlRva2VuLFxuICAgICAgICBleHBpcmVzQXQ6IERhdGUubm93KCkgKyAyNCAqIDYwICogNjAgKiAxMDAwLCAvLyAyNCBob3VycyBmcm9tIG5vd1xuICAgICAgfSk7XG5cbiAgICAgIGxvZ2dlci5kZWJ1ZygnR2VuZXJhdGVkIENTUkYgdG9rZW4gZm9yIGNsaWVudCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGdlbmVyYXRpbmcgQ1NSRiB0b2tlbjonLCBlcnJvcik7XG4gICAgICByZXMuc3RhdHVzKDUwMCkuanNvbih7IGVycm9yOiAnRmFpbGVkIHRvIGdlbmVyYXRlIENTUkYgdG9rZW4nIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gQXBwbHkgYXV0aCBtaWRkbGV3YXJlIHRvIGFsbCBBUEkgcm91dGVzIChpbmNsdWRpbmcgYXV0aCByb3V0ZXMgZm9yIFRhaWxzY2FsZSBoZWFkZXIgZGV0ZWN0aW9uKVxuICBhcHAudXNlKCcvYXBpJywgYXV0aE1pZGRsZXdhcmUpO1xuICBsb2dnZXIuZGVidWcoJ0FwcGxpZWQgYXV0aGVudGljYXRpb24gbWlkZGxld2FyZSB0byAvYXBpIHJvdXRlcycpO1xuXG4gIC8vIE1vdW50IGF1dGhlbnRpY2F0aW9uIHJvdXRlcyAoYXV0aCBtaWRkbGV3YXJlIHdpbGwgc2tpcCB0aGVzZSBidXQgc3RpbGwgY2hlY2sgVGFpbHNjYWxlIGhlYWRlcnMpXG4gIGFwcC51c2UoXG4gICAgJy9hcGkvYXV0aCcsXG4gICAgY3JlYXRlQXV0aFJvdXRlcyh7XG4gICAgICBhdXRoU2VydmljZSxcbiAgICAgIGVuYWJsZVNTSEtleXM6IGNvbmZpZy5lbmFibGVTU0hLZXlzLFxuICAgICAgZGlzYWxsb3dVc2VyUGFzc3dvcmQ6IGNvbmZpZy5kaXNhbGxvd1VzZXJQYXNzd29yZCxcbiAgICAgIG5vQXV0aDogY29uZmlnLm5vQXV0aCxcbiAgICB9KVxuICApO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgYXV0aGVudGljYXRpb24gcm91dGVzJyk7XG5cbiAgLy8gTW91bnQgcm91dGVzXG4gIGFwcC51c2UoXG4gICAgJy9hcGknLFxuICAgIGNyZWF0ZVNlc3Npb25Sb3V0ZXMoe1xuICAgICAgcHR5TWFuYWdlcixcbiAgICAgIHRlcm1pbmFsTWFuYWdlcixcbiAgICAgIHN0cmVhbVdhdGNoZXIsXG4gICAgICByZW1vdGVSZWdpc3RyeSxcbiAgICAgIGlzSFFNb2RlOiBjb25maWcuaXNIUU1vZGUsXG4gICAgICBhY3Rpdml0eU1vbml0b3IsXG4gICAgfSlcbiAgKTtcbiAgbG9nZ2VyLmRlYnVnKCdNb3VudGVkIHNlc3Npb24gcm91dGVzJyk7XG5cbiAgYXBwLnVzZShcbiAgICAnL2FwaScsXG4gICAgY3JlYXRlUmVtb3RlUm91dGVzKHtcbiAgICAgIHJlbW90ZVJlZ2lzdHJ5LFxuICAgICAgaXNIUU1vZGU6IGNvbmZpZy5pc0hRTW9kZSxcbiAgICB9KVxuICApO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgcmVtb3RlIHJvdXRlcycpO1xuXG4gIC8vIE1vdW50IGZpbGVzeXN0ZW0gcm91dGVzXG4gIGFwcC51c2UoJy9hcGknLCBjcmVhdGVGaWxlc3lzdGVtUm91dGVzKCkpO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgZmlsZXN5c3RlbSByb3V0ZXMnKTtcblxuICAvLyBNb3VudCBsb2cgcm91dGVzXG4gIGFwcC51c2UoJy9hcGknLCBjcmVhdGVMb2dSb3V0ZXMoKSk7XG4gIGxvZ2dlci5kZWJ1ZygnTW91bnRlZCBsb2cgcm91dGVzJyk7XG5cbiAgLy8gTW91bnQgZmlsZSByb3V0ZXNcbiAgYXBwLnVzZSgnL2FwaScsIGNyZWF0ZUZpbGVSb3V0ZXMoKSk7XG4gIGxvZ2dlci5kZWJ1ZygnTW91bnRlZCBmaWxlIHJvdXRlcycpO1xuXG4gIC8vIE1vdW50IHJlcG9zaXRvcnkgcm91dGVzXG4gIGFwcC51c2UoJy9hcGknLCBjcmVhdGVSZXBvc2l0b3J5Um91dGVzKCkpO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgcmVwb3NpdG9yeSByb3V0ZXMnKTtcblxuICAvLyBNb3VudCBjb25maWcgcm91dGVzXG4gIGFwcC51c2UoXG4gICAgJy9hcGknLFxuICAgIGNyZWF0ZUNvbmZpZ1JvdXRlcyh7XG4gICAgICBjb25maWdTZXJ2aWNlLFxuICAgIH0pXG4gICk7XG4gIGxvZ2dlci5kZWJ1ZygnTW91bnRlZCBjb25maWcgcm91dGVzJyk7XG5cbiAgLy8gTW91bnQgR2l0IHJvdXRlc1xuICBhcHAudXNlKCcvYXBpJywgY3JlYXRlR2l0Um91dGVzKCkpO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgR2l0IHJvdXRlcycpO1xuXG4gIC8vIE1vdW50IHdvcmt0cmVlIHJvdXRlc1xuICBhcHAudXNlKCcvYXBpJywgY3JlYXRlV29ya3RyZWVSb3V0ZXMoKSk7XG4gIGxvZ2dlci5kZWJ1ZygnTW91bnRlZCB3b3JrdHJlZSByb3V0ZXMnKTtcblxuICAvLyBNb3VudCBjb250cm9sIHJvdXRlc1xuICBhcHAudXNlKCcvYXBpJywgY3JlYXRlQ29udHJvbFJvdXRlcygpKTtcbiAgbG9nZ2VyLmRlYnVnKCdNb3VudGVkIGNvbnRyb2wgcm91dGVzJyk7XG5cbiAgLy8gTW91bnQgdG11eCByb3V0ZXNcbiAgYXBwLnVzZSgnL2FwaS90bXV4JywgY3JlYXRlVG11eFJvdXRlcyh7IHB0eU1hbmFnZXIgfSkpO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgdG11eCByb3V0ZXMnKTtcblxuICAvLyBNb3VudCBtdWx0aXBsZXhlciByb3V0ZXMgKHVuaWZpZWQgdG11eC96ZWxsaWogaW50ZXJmYWNlKVxuICBhcHAudXNlKCcvYXBpL211bHRpcGxleGVyJywgY3JlYXRlTXVsdGlwbGV4ZXJSb3V0ZXMoeyBwdHlNYW5hZ2VyIH0pKTtcbiAgbG9nZ2VyLmRlYnVnKCdNb3VudGVkIG11bHRpcGxleGVyIHJvdXRlcycpO1xuXG4gIC8vIE1vdW50IHB1c2ggbm90aWZpY2F0aW9uIHJvdXRlcyAtIGFsd2F5cyBtb3VudCBldmVuIGlmIFZBUElEIGlzIG5vdCBpbml0aWFsaXplZFxuICAvLyBUaGlzIGVuc3VyZXMgcHJvcGVyIGVycm9yIHJlc3BvbnNlcyBpbnN0ZWFkIG9mIDQwNHNcbiAgYXBwLnVzZShcbiAgICAnL2FwaScsXG4gICAgY3JlYXRlUHVzaFJvdXRlcyh7XG4gICAgICB2YXBpZE1hbmFnZXI6IHZhcGlkTWFuYWdlciB8fCBuZXcgVmFwaWRNYW5hZ2VyKCksIC8vIFBhc3MgYSBkdW1teSBpbnN0YW5jZSBpZiBudWxsXG4gICAgICBwdXNoTm90aWZpY2F0aW9uU2VydmljZSxcbiAgICAgIHNlc3Npb25Nb25pdG9yLFxuICAgIH0pXG4gICk7XG4gIGxvZ2dlci5kZWJ1ZygnTW91bnRlZCBwdXNoIG5vdGlmaWNhdGlvbiByb3V0ZXMnKTtcblxuICAvLyBNb3VudCBldmVudHMgcm91dGVyIGZvciBTU0Ugc3RyZWFtaW5nXG4gIGFwcC51c2UoJy9hcGknLCBjcmVhdGVFdmVudHNSb3V0ZXIoc2Vzc2lvbk1vbml0b3IpKTtcbiAgbG9nZ2VyLmRlYnVnKCdNb3VudGVkIGV2ZW50cyByb3V0ZXMnKTtcblxuICAvLyBNb3VudCB0ZXN0IG5vdGlmaWNhdGlvbiByb3V0ZXJcbiAgYXBwLnVzZSgnL2FwaScsIGNyZWF0ZVRlc3ROb3RpZmljYXRpb25Sb3V0ZXIoeyBzZXNzaW9uTW9uaXRvciwgcHVzaE5vdGlmaWNhdGlvblNlcnZpY2UgfSkpO1xuICBsb2dnZXIuZGVidWcoJ01vdW50ZWQgdGVzdCBub3RpZmljYXRpb24gcm91dGVzJyk7XG5cbiAgLy8gSW5pdGlhbGl6ZSBjb250cm9sIHNvY2tldFxuICB0cnkge1xuICAgIGF3YWl0IGNvbnRyb2xVbml4SGFuZGxlci5zdGFydCgpO1xuICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oJ0NvbnRyb2wgVU5JWCBzb2NrZXQ6IFJFQURZJykpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgY29udHJvbCBzb2NrZXQ6JywgZXJyb3IpO1xuICAgIGxvZ2dlci53YXJuKCdNYWMgY29udHJvbCBmZWF0dXJlcyB3aWxsIG5vdCBiZSBhdmFpbGFibGUuJyk7XG4gICAgLy8gRGVwZW5kaW5nIG9uIHRoZSBkZXNpcmVkIGJlaGF2aW9yLCB5b3UgbWlnaHQgd2FudCB0byBleGl0IGhlcmVcbiAgICAvLyBGb3Igbm93LCB3ZSdsbCBsZXQgdGhlIHNlcnZlciBjb250aW51ZSB3aXRob3V0IHRoZXNlIGZlYXR1cmVzLlxuICB9XG5cbiAgLy8gSW5pdGlhbGl6ZSBBUEkgc29ja2V0IGZvciBDTEkgY29tbWFuZHNcbiAgdHJ5IHtcbiAgICBhd2FpdCBhcGlTb2NrZXRTZXJ2ZXIuc3RhcnQoKTtcbiAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKCdBUEkgc29ja2V0IHNlcnZlcjogUkVBRFknKSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBBUEkgc29ja2V0IHNlcnZlcjonLCBlcnJvcik7XG4gICAgbG9nZ2VyLndhcm4oJ3Z0IGNvbW1hbmRzIHdpbGwgbm90IHdvcmsgdmlhIHNvY2tldC4nKTtcbiAgfVxuXG4gIC8vIEhhbmRsZSBXZWJTb2NrZXQgdXBncmFkZSB3aXRoIGF1dGhlbnRpY2F0aW9uXG4gIHNlcnZlci5vbigndXBncmFkZScsIGFzeW5jIChyZXF1ZXN0LCBzb2NrZXQsIGhlYWQpID0+IHtcbiAgICAvLyBQYXJzZSB0aGUgVVJMIHRvIGV4dHJhY3QgcGF0aCBhbmQgcXVlcnkgcGFyYW1ldGVyc1xuICAgIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwocmVxdWVzdC51cmwgfHwgJycsIGBodHRwOi8vJHtyZXF1ZXN0LmhlYWRlcnMuaG9zdCB8fCAnbG9jYWxob3N0J31gKTtcblxuICAgIC8vIEhhbmRsZSBXZWJTb2NrZXQgcGF0aHNcbiAgICBpZiAocGFyc2VkVXJsLnBhdGhuYW1lICE9PSAnL2J1ZmZlcnMnICYmIHBhcnNlZFVybC5wYXRobmFtZSAhPT0gJy93cy9pbnB1dCcpIHtcbiAgICAgIHNvY2tldC53cml0ZSgnSFRUUC8xLjEgNDA0IE5vdCBGb3VuZFxcclxcblxcclxcbicpO1xuICAgICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBhdXRoZW50aWNhdGlvbiBhbmQgY2FwdHVyZSB1c2VyIGluZm9cbiAgICBjb25zdCBhdXRoUmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8e1xuICAgICAgYXV0aGVudGljYXRlZDogYm9vbGVhbjtcbiAgICAgIHVzZXJJZD86IHN0cmluZztcbiAgICAgIGF1dGhNZXRob2Q/OiBzdHJpbmc7XG4gICAgfT4oKHJlc29sdmUpID0+IHtcbiAgICAgIC8vIFRyYWNrIGlmIHByb21pc2UgaGFzIGJlZW4gcmVzb2x2ZWQgdG8gcHJldmVudCBtdWx0aXBsZSByZXNvbHV0aW9uc1xuICAgICAgbGV0IHJlc29sdmVkID0gZmFsc2U7XG4gICAgICBjb25zdCBzYWZlUmVzb2x2ZSA9ICh2YWx1ZToge1xuICAgICAgICBhdXRoZW50aWNhdGVkOiBib29sZWFuO1xuICAgICAgICB1c2VySWQ/OiBzdHJpbmc7XG4gICAgICAgIGF1dGhNZXRob2Q/OiBzdHJpbmc7XG4gICAgICB9KSA9PiB7XG4gICAgICAgIGlmICghcmVzb2x2ZWQpIHtcbiAgICAgICAgICByZXNvbHZlZCA9IHRydWU7XG4gICAgICAgICAgcmVzb2x2ZSh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIENvbnZlcnQgVVJMU2VhcmNoUGFyYW1zIHRvIHBsYWluIG9iamVjdCBmb3IgcXVlcnkgcGFyYW1ldGVyc1xuICAgICAgY29uc3QgcXVlcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIHBhcnNlZFVybC5zZWFyY2hQYXJhbXMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBxdWVyeVtrZXldID0gdmFsdWU7XG4gICAgICB9KTtcblxuICAgICAgLy8gQ3JlYXRlIGEgbW9jayBFeHByZXNzIHJlcXVlc3QvcmVzcG9uc2UgdG8gdXNlIGF1dGggbWlkZGxld2FyZVxuICAgICAgY29uc3QgcmVxID0ge1xuICAgICAgICAuLi5yZXF1ZXN0LFxuICAgICAgICB1cmw6IHJlcXVlc3QudXJsLFxuICAgICAgICBwYXRoOiBwYXJzZWRVcmwucGF0aG5hbWUsXG4gICAgICAgIHVzZXJJZDogdW5kZWZpbmVkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgICAgYXV0aE1ldGhvZDogdW5kZWZpbmVkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICAgICAgcXVlcnksIC8vIEluY2x1ZGUgcGFyc2VkIHF1ZXJ5IHBhcmFtZXRlcnMgZm9yIHRva2VuLWJhc2VkIGF1dGhcbiAgICAgICAgaGVhZGVyczogcmVxdWVzdC5oZWFkZXJzLFxuICAgICAgICBpcDogKHJlcXVlc3Quc29ja2V0IGFzIHVua25vd24gYXMgeyByZW1vdGVBZGRyZXNzPzogc3RyaW5nIH0pLnJlbW90ZUFkZHJlc3MgfHwgJycsXG4gICAgICAgIHNvY2tldDogcmVxdWVzdC5zb2NrZXQsXG4gICAgICAgIGhvc3RuYW1lOiByZXF1ZXN0LmhlYWRlcnMuaG9zdD8uc3BsaXQoJzonKVswXSB8fCAnbG9jYWxob3N0JyxcbiAgICAgICAgLy8gQWRkIG1pbmltYWwgRXhwcmVzcy1saWtlIG1ldGhvZHMgbmVlZGVkIGJ5IGF1dGggbWlkZGxld2FyZVxuICAgICAgICBnZXQ6IChoZWFkZXI6IHN0cmluZykgPT4gcmVxdWVzdC5oZWFkZXJzW2hlYWRlci50b0xvd2VyQ2FzZSgpXSxcbiAgICAgICAgaGVhZGVyOiAoaGVhZGVyOiBzdHJpbmcpID0+IHJlcXVlc3QuaGVhZGVyc1toZWFkZXIudG9Mb3dlckNhc2UoKV0sXG4gICAgICAgIGFjY2VwdHM6ICgpID0+IGZhbHNlLFxuICAgICAgICBhY2NlcHRzQ2hhcnNldHM6ICgpID0+IGZhbHNlLFxuICAgICAgICBhY2NlcHRzRW5jb2RpbmdzOiAoKSA9PiBmYWxzZSxcbiAgICAgICAgYWNjZXB0c0xhbmd1YWdlczogKCkgPT4gZmFsc2UsXG4gICAgICB9IGFzIHVua25vd24gYXMgQXV0aGVudGljYXRlZFJlcXVlc3Q7XG5cbiAgICAgIGxldCBhdXRoRmFpbGVkID0gZmFsc2U7XG4gICAgICBjb25zdCByZXMgPSB7XG4gICAgICAgIHN0YXR1czogKGNvZGU6IG51bWJlcikgPT4ge1xuICAgICAgICAgIC8vIE9ubHkgY29uc2lkZXIgaXQgYSBmYWlsdXJlIGlmIGl0J3MgYW4gZXJyb3Igc3RhdHVzIGNvZGVcbiAgICAgICAgICBpZiAoY29kZSA+PSA0MDApIHtcbiAgICAgICAgICAgIGF1dGhGYWlsZWQgPSB0cnVlO1xuICAgICAgICAgICAgc2FmZVJlc29sdmUoeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGpzb246ICgpID0+IHt9LFxuICAgICAgICAgICAgc2VuZDogKCkgPT4ge30sXG4gICAgICAgICAgICBlbmQ6ICgpID0+IHt9LFxuICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIHNldEhlYWRlcjogKCkgPT4ge30sXG4gICAgICAgIHNlbmQ6ICgpID0+IHt9LFxuICAgICAgICBqc29uOiAoKSA9PiB7fSxcbiAgICAgICAgZW5kOiAoKSA9PiB7fSxcbiAgICAgIH0gYXMgdW5rbm93biBhcyBFeHByZXNzUmVzcG9uc2U7XG5cbiAgICAgIGNvbnN0IG5leHQgPSAoZXJyb3I/OiB1bmtub3duKSA9PiB7XG4gICAgICAgIC8vIEF1dGhlbnRpY2F0aW9uIHN1Y2NlZWRzIGlmIG5leHQoKSBpcyBjYWxsZWQgd2l0aG91dCBlcnJvciBhbmQgbm8gYXV0aCBmYWlsdXJlIHdhcyByZWNvcmRlZFxuICAgICAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gIWVycm9yICYmICFhdXRoRmFpbGVkO1xuICAgICAgICBzYWZlUmVzb2x2ZSh7XG4gICAgICAgICAgYXV0aGVudGljYXRlZCxcbiAgICAgICAgICB1c2VySWQ6IHJlcS51c2VySWQsXG4gICAgICAgICAgYXV0aE1ldGhvZDogcmVxLmF1dGhNZXRob2QsXG4gICAgICAgIH0pO1xuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGEgdGltZW91dCB0byBwcmV2ZW50IGluZGVmaW5pdGUgaGFuZ2luZ1xuICAgICAgY29uc3QgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignV2ViU29ja2V0IGF1dGggdGltZW91dCAtIGF1dGggbWlkZGxld2FyZSBkaWQgbm90IGNvbXBsZXRlIGluIHRpbWUnKTtcbiAgICAgICAgc2FmZVJlc29sdmUoeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9KTtcbiAgICAgIH0sIDUwMDApOyAvLyA1IHNlY29uZCB0aW1lb3V0XG5cbiAgICAgIC8vIENhbGwgYXV0aE1pZGRsZXdhcmUgYW5kIGhhbmRsZSBwb3RlbnRpYWwgYXN5bmMgZXJyb3JzXG4gICAgICBQcm9taXNlLnJlc29sdmUoYXV0aE1pZGRsZXdhcmUocmVxLCByZXMsIG5leHQpKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0F1dGggbWlkZGxld2FyZSBlcnJvcjonLCBlcnJvcik7XG4gICAgICAgICAgc2FmZVJlc29sdmUoeyBhdXRoZW50aWNhdGVkOiBmYWxzZSB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBpZiAoIWF1dGhSZXN1bHQuYXV0aGVudGljYXRlZCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdXZWJTb2NrZXQgY29ubmVjdGlvbiByZWplY3RlZDogdW5hdXRob3JpemVkJyk7XG4gICAgICBzb2NrZXQud3JpdGUoJ0hUVFAvMS4xIDQwMSBVbmF1dGhvcml6ZWRcXHJcXG5cXHJcXG4nKTtcbiAgICAgIHNvY2tldC5kZXN0cm95KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHRoZSB1cGdyYWRlXG4gICAgd3NzLmhhbmRsZVVwZ3JhZGUocmVxdWVzdCwgc29ja2V0LCBoZWFkLCAod3MpID0+IHtcbiAgICAgIC8vIEFkZCBwYXRoIGFuZCBhdXRoIGluZm9ybWF0aW9uIHRvIHRoZSByZXF1ZXN0IGZvciByb3V0aW5nXG4gICAgICBjb25zdCB3c1JlcXVlc3QgPSByZXF1ZXN0IGFzIFdlYlNvY2tldFJlcXVlc3Q7XG4gICAgICB3c1JlcXVlc3QucGF0aG5hbWUgPSBwYXJzZWRVcmwucGF0aG5hbWU7XG4gICAgICB3c1JlcXVlc3Quc2VhcmNoUGFyYW1zID0gcGFyc2VkVXJsLnNlYXJjaFBhcmFtcztcbiAgICAgIHdzUmVxdWVzdC51c2VySWQgPSBhdXRoUmVzdWx0LnVzZXJJZDtcbiAgICAgIHdzUmVxdWVzdC5hdXRoTWV0aG9kID0gYXV0aFJlc3VsdC5hdXRoTWV0aG9kO1xuICAgICAgd3NzLmVtaXQoJ2Nvbm5lY3Rpb24nLCB3cywgd3NSZXF1ZXN0KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gV2ViU29ja2V0IGNvbm5lY3Rpb24gcm91dGVyXG4gIHdzcy5vbignY29ubmVjdGlvbicsICh3cywgcmVxKSA9PiB7XG4gICAgY29uc3Qgd3NSZXEgPSByZXEgYXMgV2ViU29ja2V0UmVxdWVzdDtcbiAgICBjb25zdCBwYXRobmFtZSA9IHdzUmVxLnBhdGhuYW1lO1xuICAgIGNvbnN0IHNlYXJjaFBhcmFtcyA9IHdzUmVxLnNlYXJjaFBhcmFtcztcblxuICAgIGxvZ2dlci5sb2coYPCflIwgV2ViU29ja2V0IGNvbm5lY3Rpb24gdG8gcGF0aDogJHtwYXRobmFtZX1gKTtcbiAgICBsb2dnZXIubG9nKGDwn5GkIFVzZXIgSUQ6ICR7d3NSZXEudXNlcklkIHx8ICd1bmtub3duJ31gKTtcbiAgICBsb2dnZXIubG9nKGDwn5SQIEF1dGggbWV0aG9kOiAke3dzUmVxLmF1dGhNZXRob2QgfHwgJ3Vua25vd24nfWApO1xuXG4gICAgaWYgKHBhdGhuYW1lID09PSAnL2J1ZmZlcnMnKSB7XG4gICAgICBsb2dnZXIubG9nKCfwn5OKIEhhbmRsaW5nIGJ1ZmZlciBXZWJTb2NrZXQgY29ubmVjdGlvbicpO1xuICAgICAgLy8gSGFuZGxlIGJ1ZmZlciB1cGRhdGVzIFdlYlNvY2tldFxuICAgICAgaWYgKGJ1ZmZlckFnZ3JlZ2F0b3IpIHtcbiAgICAgICAgYnVmZmVyQWdncmVnYXRvci5oYW5kbGVDbGllbnRDb25uZWN0aW9uKHdzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQnVmZmVyQWdncmVnYXRvciBub3QgaW5pdGlhbGl6ZWQgZm9yIFdlYlNvY2tldCBjb25uZWN0aW9uJyk7XG4gICAgICAgIHdzLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChwYXRobmFtZSA9PT0gJy93cy9pbnB1dCcpIHtcbiAgICAgIGxvZ2dlci5sb2coJ+KMqO+4jyBIYW5kbGluZyBpbnB1dCBXZWJTb2NrZXQgY29ubmVjdGlvbicpO1xuICAgICAgLy8gSGFuZGxlIGlucHV0IFdlYlNvY2tldFxuICAgICAgY29uc3Qgc2Vzc2lvbklkID0gc2VhcmNoUGFyYW1zPy5nZXQoJ3Nlc3Npb25JZCcpO1xuXG4gICAgICBpZiAoIXNlc3Npb25JZCkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ1dlYlNvY2tldCBpbnB1dCBjb25uZWN0aW9uIG1pc3Npbmcgc2Vzc2lvbklkIHBhcmFtZXRlcicpO1xuICAgICAgICB3cy5jbG9zZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIEV4dHJhY3QgdXNlciBJRCBmcm9tIHRoZSBhdXRoZW50aWNhdGVkIHJlcXVlc3RcbiAgICAgIGNvbnN0IHVzZXJJZCA9IHdzUmVxLnVzZXJJZCB8fCAndW5rbm93bic7XG5cbiAgICAgIHdlYnNvY2tldElucHV0SGFuZGxlci5oYW5kbGVDb25uZWN0aW9uKHdzLCBzZXNzaW9uSWQsIHVzZXJJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxvZ2dlci5lcnJvcihg4p2MIFVua25vd24gV2ViU29ja2V0IHBhdGg6ICR7cGF0aG5hbWV9YCk7XG4gICAgICB3cy5jbG9zZSgpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gU2VydmUgaW5kZXguaHRtbCBmb3IgY2xpZW50LXNpZGUgcm91dGVzIChidXQgbm90IEFQSSByb3V0ZXMpXG4gIGFwcC5nZXQoJy8nLCAoX3JlcSwgcmVzKSA9PiB7XG4gICAgcmVzLnNlbmRGaWxlKHBhdGguam9pbihwdWJsaWNQYXRoLCAnaW5kZXguaHRtbCcpKTtcbiAgfSk7XG5cbiAgLy8gSGFuZGxlIC9zZXNzaW9uLzppZCByb3V0ZXMgYnkgc2VydmluZyB0aGUgc2FtZSBpbmRleC5odG1sXG4gIGFwcC5nZXQoJy9zZXNzaW9uLzppZCcsIChfcmVxLCByZXMpID0+IHtcbiAgICByZXMuc2VuZEZpbGUocGF0aC5qb2luKHB1YmxpY1BhdGgsICdpbmRleC5odG1sJykpO1xuICB9KTtcblxuICAvLyBIYW5kbGUgL3dvcmt0cmVlcyByb3V0ZSBieSBzZXJ2aW5nIHRoZSBzYW1lIGluZGV4Lmh0bWxcbiAgYXBwLmdldCgnL3dvcmt0cmVlcycsIChfcmVxLCByZXMpID0+IHtcbiAgICByZXMuc2VuZEZpbGUocGF0aC5qb2luKHB1YmxpY1BhdGgsICdpbmRleC5odG1sJykpO1xuICB9KTtcblxuICAvLyBIYW5kbGUgL2ZpbGUtYnJvd3NlciByb3V0ZSBieSBzZXJ2aW5nIHRoZSBzYW1lIGluZGV4Lmh0bWxcbiAgYXBwLmdldCgnL2ZpbGUtYnJvd3NlcicsIChfcmVxLCByZXMpID0+IHtcbiAgICByZXMuc2VuZEZpbGUocGF0aC5qb2luKHB1YmxpY1BhdGgsICdpbmRleC5odG1sJykpO1xuICB9KTtcblxuICAvLyA0MDQgaGFuZGxlciBmb3IgYWxsIG90aGVyIHJvdXRlc1xuICBhcHAudXNlKChyZXEsIHJlcykgPT4ge1xuICAgIGlmIChyZXEucGF0aC5zdGFydHNXaXRoKCcvYXBpLycpKSB7XG4gICAgICByZXMuc3RhdHVzKDQwNCkuanNvbih7IGVycm9yOiAnQVBJIGVuZHBvaW50IG5vdCBmb3VuZCcgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlcy5zdGF0dXMoNDA0KS5zZW5kRmlsZShwYXRoLmpvaW4ocHVibGljUGF0aCwgJzQwNC5odG1sJyksIChlcnIpID0+IHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgIHJlcy5zdGF0dXMoNDA0KS5zZW5kKCc0MDQgLSBQYWdlIG5vdCBmb3VuZCcpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIFN0YXJ0IHNlcnZlciBmdW5jdGlvblxuICBjb25zdCBzdGFydFNlcnZlciA9ICgpID0+IHtcbiAgICBjb25zdCByZXF1ZXN0ZWRQb3J0ID0gY29uZmlnLnBvcnQgIT09IG51bGwgPyBjb25maWcucG9ydCA6IE51bWJlcihwcm9jZXNzLmVudi5QT1JUKSB8fCA0MDIwO1xuXG4gICAgbG9nZ2VyLmxvZyhgU3RhcnRpbmcgc2VydmVyIG9uIHBvcnQgJHtyZXF1ZXN0ZWRQb3J0fWApO1xuXG4gICAgLy8gUmVtb3ZlIGFsbCBleGlzdGluZyBlcnJvciBsaXN0ZW5lcnMgZmlyc3QgdG8gcHJldmVudCBkdXBsaWNhdGVzXG4gICAgc2VydmVyLnJlbW92ZUFsbExpc3RlbmVycygnZXJyb3InKTtcblxuICAgIC8vIEFkZCBlcnJvciBoYW5kbGVyIGZvciBwb3J0IGFscmVhZHkgaW4gdXNlXG4gICAgc2VydmVyLm9uKCdlcnJvcicsIChlcnJvcjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICBpZiAoZXJyb3IuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgUG9ydCAke3JlcXVlc3RlZFBvcnR9IGlzIGFscmVhZHkgaW4gdXNlYCk7XG5cbiAgICAgICAgLy8gUHJvdmlkZSBtb3JlIGhlbHBmdWwgZXJyb3IgbWVzc2FnZSBpbiBkZXZlbG9wbWVudCBtb2RlXG4gICAgICAgIGNvbnN0IGlzRGV2ZWxvcG1lbnQgPSAhcHJvY2Vzcy5lbnYuQlVJTERfREFURSB8fCBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JztcbiAgICAgICAgaWYgKGlzRGV2ZWxvcG1lbnQpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoY2hhbGsueWVsbG93KCdcXG5EZXZlbG9wbWVudCBtb2RlIG9wdGlvbnM6JykpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgIGAgIDEuIFJ1biBzZXJ2ZXIgb24gZGlmZmVyZW50IHBvcnQ6ICR7Y2hhbGsuY3lhbigncG5wbSBydW4gZGV2OnNlcnZlciAtLXBvcnQgNDAyMScpfWBcbiAgICAgICAgICApO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcihgICAyLiBVc2UgZW52aXJvbm1lbnQgdmFyaWFibGU6ICR7Y2hhbGsuY3lhbignUE9SVD00MDIxIHBucG0gcnVuIGRldicpfWApO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICcgIDMuIFN0b3AgdGhlIGV4aXN0aW5nIHNlcnZlciAoY2hlY2sgQWN0aXZpdHkgTW9uaXRvciBmb3IgdmliZXR1bm5lbCBwcm9jZXNzZXMpJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgJ1BsZWFzZSB1c2UgYSBkaWZmZXJlbnQgcG9ydCB3aXRoIC0tcG9ydCA8bnVtYmVyPiBvciBzdG9wIHRoZSBleGlzdGluZyBzZXJ2ZXInXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBwcm9jZXNzLmV4aXQoOSk7IC8vIEV4aXQgd2l0aCBjb2RlIDkgdG8gaW5kaWNhdGUgcG9ydCBjb25mbGljdFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdTZXJ2ZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBSZWd1bGFyIFRDUCBtb2RlXG4gICAgbG9nZ2VyLmxvZyhgU3RhcnRpbmcgc2VydmVyIG9uIHBvcnQgJHtyZXF1ZXN0ZWRQb3J0fWApO1xuICAgIGNvbnN0IGJpbmRBZGRyZXNzID0gY29uZmlnLmJpbmQgfHwgKGNvbmZpZy5lbmFibGVUYWlsc2NhbGVTZXJ2ZSA/ICcxMjcuMC4wLjEnIDogJzAuMC4wLjAnKTtcbiAgICBzZXJ2ZXIubGlzdGVuKHJlcXVlc3RlZFBvcnQsIGJpbmRBZGRyZXNzLCAoKSA9PiB7XG4gICAgICBjb25zdCBhZGRyZXNzID0gc2VydmVyLmFkZHJlc3MoKTtcbiAgICAgIGNvbnN0IGFjdHVhbFBvcnQgPVxuICAgICAgICB0eXBlb2YgYWRkcmVzcyA9PT0gJ3N0cmluZycgPyByZXF1ZXN0ZWRQb3J0IDogYWRkcmVzcz8ucG9ydCB8fCByZXF1ZXN0ZWRQb3J0O1xuICAgICAgY29uc3QgZGlzcGxheUFkZHJlc3MgPSBiaW5kQWRkcmVzcyA9PT0gJzAuMC4wLjAnID8gJ2xvY2FsaG9zdCcgOiBiaW5kQWRkcmVzcztcbiAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgIGNoYWxrLmdyZWVuKGBWaWJlVHVubmVsIFNlcnZlciBydW5uaW5nIG9uIGh0dHA6Ly8ke2Rpc3BsYXlBZGRyZXNzfToke2FjdHVhbFBvcnR9YClcbiAgICAgICk7XG5cbiAgICAgIC8vIFVwZGF0ZSBBUEkgc29ja2V0IHNlcnZlciB3aXRoIGFjdHVhbCBwb3J0IGluZm9ybWF0aW9uXG4gICAgICBhcGlTb2NrZXRTZXJ2ZXIuc2V0U2VydmVySW5mbyhhY3R1YWxQb3J0LCBgaHR0cDovLyR7ZGlzcGxheUFkZHJlc3N9OiR7YWN0dWFsUG9ydH1gKTtcblxuICAgICAgaWYgKGNvbmZpZy5ub0F1dGgpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oY2hhbGsueWVsbG93KCdBdXRoZW50aWNhdGlvbjogRElTQUJMRUQgKC0tbm8tYXV0aCknKSk7XG4gICAgICAgIGxvZ2dlci53YXJuKCdBbnlvbmUgY2FuIGFjY2VzcyB0aGlzIHNlcnZlciB3aXRob3V0IGF1dGhlbnRpY2F0aW9uJyk7XG4gICAgICB9IGVsc2UgaWYgKGNvbmZpZy5kaXNhbGxvd1VzZXJQYXNzd29yZCkge1xuICAgICAgICBsb2dnZXIubG9nKGNoYWxrLmdyZWVuKCdBdXRoZW50aWNhdGlvbjogU1NIIEtFWVMgT05MWSAoLS1kaXNhbGxvdy11c2VyLXBhc3N3b3JkKScpKTtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmF5KCdQYXNzd29yZCBhdXRoZW50aWNhdGlvbiBpcyBkaXNhYmxlZCcpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JlZW4oJ0F1dGhlbnRpY2F0aW9uOiBTWVNURU0gVVNFUiBQQVNTV09SRCcpKTtcbiAgICAgICAgaWYgKGNvbmZpZy5lbmFibGVTU0hLZXlzKSB7XG4gICAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbignU1NIIEtleSBBdXRoZW50aWNhdGlvbjogRU5BQkxFRCcpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgY2hhbGsuZ3JheSgnU1NIIEtleSBBdXRoZW50aWNhdGlvbjogRElTQUJMRUQgKHVzZSAtLWVuYWJsZS1zc2gta2V5cyB0byBlbmFibGUpJylcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFN0YXJ0IFRhaWxzY2FsZSBTZXJ2ZSBpZiByZXF1ZXN0ZWRcbiAgICAgIGlmIChjb25maWcuZW5hYmxlVGFpbHNjYWxlU2VydmUpIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ibHVlKCdTdGFydGluZyBUYWlsc2NhbGUgU2VydmUgaW50ZWdyYXRpb24uLi4nKSk7XG5cbiAgICAgICAgdGFpbHNjYWxlU2VydmVTZXJ2aWNlXG4gICAgICAgICAgLnN0YXJ0KGFjdHVhbFBvcnQpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbignVGFpbHNjYWxlIFNlcnZlOiBFTkFCTEVEJykpO1xuICAgICAgICAgICAgbG9nZ2VyLmxvZyhcbiAgICAgICAgICAgICAgY2hhbGsuZ3JheSgnVXNlcnMgd2lsbCBiZSBhdXRvLWF1dGhlbnRpY2F0ZWQgdmlhIFRhaWxzY2FsZSBpZGVudGl0eSBoZWFkZXJzJylcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBsb2dnZXIubG9nKFxuICAgICAgICAgICAgICBjaGFsay5ncmF5KFxuICAgICAgICAgICAgICAgIGBBY2Nlc3MgdmlhIEhUVFBTIG9uIHlvdXIgVGFpbHNjYWxlIGhvc3RuYW1lIChlLmcuLCBodHRwczovL2hvc3RuYW1lLnRhaWxuZXQudHMubmV0KWBcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihjaGFsay5yZWQoJ0ZhaWxlZCB0byBzdGFydCBUYWlsc2NhbGUgU2VydmU6JyksIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgICAgIGNoYWxrLnllbGxvdygnVmliZVR1bm5lbCB3aWxsIGNvbnRpbnVlIHJ1bm5pbmcsIGJ1dCBUYWlsc2NhbGUgU2VydmUgaXMgbm90IGF2YWlsYWJsZScpXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ibHVlKCdZb3UgY2FuIG1hbnVhbGx5IGNvbmZpZ3VyZSBUYWlsc2NhbGUgU2VydmUgd2l0aDonKSk7XG4gICAgICAgICAgICBsb2dnZXIubG9nKGNoYWxrLmdyYXkoYCAgdGFpbHNjYWxlIHNlcnZlICR7YWN0dWFsUG9ydH1gKSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIC8vIExvZyBsb2NhbCBieXBhc3Mgc3RhdHVzXG4gICAgICBpZiAoY29uZmlnLmFsbG93TG9jYWxCeXBhc3MpIHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coJ0xvY2FsIEJ5cGFzczogRU5BQkxFRCcpKTtcbiAgICAgICAgaWYgKGNvbmZpZy5sb2NhbEF1dGhUb2tlbikge1xuICAgICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheSgnTG9jYWwgY29ubmVjdGlvbnMgcmVxdWlyZSBhdXRoIHRva2VuJykpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheSgnTG9jYWwgY29ubmVjdGlvbnMgYnlwYXNzIGF1dGhlbnRpY2F0aW9uIHdpdGhvdXQgdG9rZW4nKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gSW5pdGlhbGl6ZSBIUSBjbGllbnQgbm93IHRoYXQgd2Uga25vdyB0aGUgYWN0dWFsIHBvcnRcbiAgICAgIGlmIChcbiAgICAgICAgY29uZmlnLmhxVXJsICYmXG4gICAgICAgIGNvbmZpZy5yZW1vdGVOYW1lICYmXG4gICAgICAgIChjb25maWcubm9IcUF1dGggfHwgKGNvbmZpZy5ocVVzZXJuYW1lICYmIGNvbmZpZy5ocVBhc3N3b3JkKSlcbiAgICAgICkge1xuICAgICAgICAvLyBVc2UgdGhlIGFjdHVhbCBiaW5kIGFkZHJlc3MgZm9yIEhRIHJlZ2lzdHJhdGlvblxuICAgICAgICAvLyBJZiBiaW5kIGlzIDAuMC4wLjAsIHdlIG5lZWQgdG8gZGV0ZXJtaW5lIHRoZSBhY3R1YWwgbmV0d29yayBpbnRlcmZhY2UgSVBcbiAgICAgICAgbGV0IHJlbW90ZUhvc3QgPSBiaW5kQWRkcmVzcztcbiAgICAgICAgaWYgKGJpbmRBZGRyZXNzID09PSAnMC4wLjAuMCcpIHtcbiAgICAgICAgICAvLyBXaGVuIGJpbmRpbmcgdG8gYWxsIGludGVyZmFjZXMsIHVzZSB0aGUgbWFjaGluZSdzIGhvc3RuYW1lXG4gICAgICAgICAgLy8gVGhpcyBhbGxvd3MgSFEgdG8gY29ubmVjdCBmcm9tIHRoZSBuZXR3b3JrXG4gICAgICAgICAgcmVtb3RlSG9zdCA9IG9zLmhvc3RuYW1lKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVtb3RlVXJsID0gYGh0dHA6Ly8ke3JlbW90ZUhvc3R9OiR7YWN0dWFsUG9ydH1gO1xuICAgICAgICBocUNsaWVudCA9IG5ldyBIUUNsaWVudChcbiAgICAgICAgICBjb25maWcuaHFVcmwsXG4gICAgICAgICAgY29uZmlnLmhxVXNlcm5hbWUgfHwgJ25vLWF1dGgnLFxuICAgICAgICAgIGNvbmZpZy5ocVBhc3N3b3JkIHx8ICduby1hdXRoJyxcbiAgICAgICAgICBjb25maWcucmVtb3RlTmFtZSxcbiAgICAgICAgICByZW1vdGVVcmwsXG4gICAgICAgICAgcmVtb3RlQmVhcmVyVG9rZW4gfHwgJydcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGNvbmZpZy5ub0hxQXV0aCkge1xuICAgICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgICBjaGFsay55ZWxsb3coXG4gICAgICAgICAgICAgIGBSZW1vdGUgbW9kZTogJHtjb25maWcucmVtb3RlTmFtZX0gcmVnaXN0ZXJpbmcgV0lUSE9VVCBIUSBhdXRoZW50aWNhdGlvbiAoLS1uby1ocS1hdXRoKWBcbiAgICAgICAgICAgIClcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxvZ2dlci5sb2coXG4gICAgICAgICAgICBjaGFsay5ncmVlbihgUmVtb3RlIG1vZGU6ICR7Y29uZmlnLnJlbW90ZU5hbWV9IHdpbGwgYWNjZXB0IEJlYXJlciB0b2tlbiBmb3IgSFEgYWNjZXNzYClcbiAgICAgICAgICApO1xuICAgICAgICAgIGxvZ2dlci5kZWJ1ZyhgQmVhcmVyIHRva2VuOiAke2hxQ2xpZW50LmdldFRva2VuKCl9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gU2VuZCBtZXNzYWdlIHRvIHBhcmVudCBwcm9jZXNzIGlmIHJ1bm5pbmcgYXMgY2hpbGQgKGZvciB0ZXN0aW5nKVxuICAgICAgLy8gU2tpcCBpbiB2aXRlc3QgZW52aXJvbm1lbnQgdG8gYXZvaWQgY2hhbm5lbCBjb25mbGljdHNcbiAgICAgIGlmIChwcm9jZXNzLnNlbmQgJiYgIXByb2Nlc3MuZW52LlZJVEVTVCkge1xuICAgICAgICBwcm9jZXNzLnNlbmQoeyB0eXBlOiAnc2VydmVyLXN0YXJ0ZWQnLCBwb3J0OiBhY3R1YWxQb3J0IH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBSZWdpc3RlciB3aXRoIEhRIGlmIGNvbmZpZ3VyZWRcbiAgICAgIGlmIChocUNsaWVudCkge1xuICAgICAgICBsb2dnZXIubG9nKGBSZWdpc3RlcmluZyB3aXRoIEhRIGF0ICR7Y29uZmlnLmhxVXJsfWApO1xuICAgICAgICBocUNsaWVudC5yZWdpc3RlcigpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ0ZhaWxlZCB0byByZWdpc3RlciB3aXRoIEhROicsIGVycik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICAvLyBTdGFydCBjb250cm9sIGRpcmVjdG9yeSB3YXRjaGVyXG4gICAgICBjb250cm9sRGlyV2F0Y2hlciA9IG5ldyBDb250cm9sRGlyV2F0Y2hlcih7XG4gICAgICAgIGNvbnRyb2xEaXI6IENPTlRST0xfRElSLFxuICAgICAgICByZW1vdGVSZWdpc3RyeSxcbiAgICAgICAgaXNIUU1vZGU6IGNvbmZpZy5pc0hRTW9kZSxcbiAgICAgICAgaHFDbGllbnQsXG4gICAgICAgIHB0eU1hbmFnZXIsXG4gICAgICAgIHB1c2hOb3RpZmljYXRpb25TZXJ2aWNlOiBwdXNoTm90aWZpY2F0aW9uU2VydmljZSB8fCB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICAgIGNvbnRyb2xEaXJXYXRjaGVyLnN0YXJ0KCk7XG4gICAgICBsb2dnZXIuZGVidWcoJ1N0YXJ0ZWQgY29udHJvbCBkaXJlY3Rvcnkgd2F0Y2hlcicpO1xuXG4gICAgICAvLyBTdGFydCBhY3Rpdml0eSBtb25pdG9yXG4gICAgICBhY3Rpdml0eU1vbml0b3Iuc3RhcnQoKTtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnU3RhcnRlZCBhY3Rpdml0eSBtb25pdG9yJyk7XG5cbiAgICAgIC8vIFN0YXJ0IG1ETlMgYWR2ZXJ0aXNlbWVudCBpZiBlbmFibGVkXG4gICAgICBpZiAoY29uZmlnLmVuYWJsZU1ETlMpIHtcbiAgICAgICAgbWRuc1NlcnZpY2Uuc3RhcnRBZHZlcnRpc2luZyhhY3R1YWxQb3J0KS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLndhcm4oJ0ZhaWxlZCB0byBzdGFydCBtRE5TIGFkdmVydGlzZW1lbnQ6JywgZXJyKTtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ21ETlMgYWR2ZXJ0aXNlbWVudCBkaXNhYmxlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgYXBwLFxuICAgIHNlcnZlcixcbiAgICB3c3MsXG4gICAgc3RhcnRTZXJ2ZXIsXG4gICAgY29uZmlnLFxuICAgIGNvbmZpZ1NlcnZpY2UsXG4gICAgcHR5TWFuYWdlcixcbiAgICB0ZXJtaW5hbE1hbmFnZXIsXG4gICAgc3RyZWFtV2F0Y2hlcixcbiAgICByZW1vdGVSZWdpc3RyeSxcbiAgICBocUNsaWVudCxcbiAgICBjb250cm9sRGlyV2F0Y2hlcixcbiAgICBidWZmZXJBZ2dyZWdhdG9yLFxuICAgIGFjdGl2aXR5TW9uaXRvcixcbiAgICBwdXNoTm90aWZpY2F0aW9uU2VydmljZSxcbiAgfTtcbn1cblxuLy8gVHJhY2sgaWYgc2VydmVyIGhhcyBiZWVuIHN0YXJ0ZWRcbmxldCBzZXJ2ZXJTdGFydGVkID0gZmFsc2U7XG5cbi8vIEV4cG9ydCBhIGZ1bmN0aW9uIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydFZpYmVUdW5uZWxTZXJ2ZXIoKSB7XG4gIC8vIEluaXRpYWxpemUgbG9nZ2VyIGlmIG5vdCBhbHJlYWR5IGluaXRpYWxpemVkIChwcmVzZXJ2ZXMgZGVidWcgbW9kZSBmcm9tIENMSSlcbiAgaW5pdExvZ2dlcigpO1xuXG4gIC8vIExvZyBkaWFnbm9zdGljIGluZm8gaWYgZGVidWcgbW9kZVxuICBpZiAocHJvY2Vzcy5lbnYuREVCVUcgPT09ICd0cnVlJyB8fCBwcm9jZXNzLmFyZ3YuaW5jbHVkZXMoJy0tZGVidWcnKSkge1xuICB9XG5cbiAgLy8gUHJldmVudCBtdWx0aXBsZSBzZXJ2ZXIgaW5zdGFuY2VzXG4gIGlmIChzZXJ2ZXJTdGFydGVkKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdTZXJ2ZXIgYWxyZWFkeSBzdGFydGVkLCBwcmV2ZW50aW5nIGR1cGxpY2F0ZSBpbnN0YW5jZScpO1xuICAgIGxvZ2dlci5lcnJvcignVGhpcyBzaG91bGQgbm90IGhhcHBlbiAtIGR1cGxpY2F0ZSBzZXJ2ZXIgc3RhcnR1cCBkZXRlY3RlZCcpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBzZXJ2ZXJTdGFydGVkID0gdHJ1ZTtcblxuICBsb2dnZXIuZGVidWcoJ0NyZWF0aW5nIFZpYmVUdW5uZWwgYXBwbGljYXRpb24gaW5zdGFuY2UnKTtcbiAgLy8gQ3JlYXRlIGFuZCBjb25maWd1cmUgdGhlIGFwcFxuICBjb25zdCBhcHBJbnN0YW5jZSA9IGF3YWl0IGNyZWF0ZUFwcCgpO1xuICBjb25zdCB7XG4gICAgc3RhcnRTZXJ2ZXIsXG4gICAgc2VydmVyLFxuICAgIHRlcm1pbmFsTWFuYWdlcixcbiAgICByZW1vdGVSZWdpc3RyeSxcbiAgICBocUNsaWVudCxcbiAgICBjb250cm9sRGlyV2F0Y2hlcixcbiAgICBhY3Rpdml0eU1vbml0b3IsXG4gICAgY29uZmlnLFxuICAgIGNvbmZpZ1NlcnZpY2UsXG4gIH0gPSBhcHBJbnN0YW5jZTtcblxuICAvLyBVcGRhdGUgZGVidWcgbW9kZSBiYXNlZCBvbiBjb25maWcgb3IgZW52aXJvbm1lbnQgdmFyaWFibGVcbiAgaWYgKGNvbmZpZy5kZWJ1ZyB8fCBwcm9jZXNzLmVudi5ERUJVRyA9PT0gJ3RydWUnKSB7XG4gICAgc2V0RGVidWdNb2RlKHRydWUpO1xuICAgIGxvZ2dlci5sb2coY2hhbGsuZ3JheSgnRGVidWcgbG9nZ2luZyBlbmFibGVkJykpO1xuICB9XG5cbiAgc3RhcnRTZXJ2ZXIoKTtcblxuICAvLyBDbGVhbnVwIG9sZCB0ZXJtaW5hbHMgZXZlcnkgNSBtaW51dGVzXG4gIGNvbnN0IF90ZXJtaW5hbENsZWFudXBJbnRlcnZhbCA9IHNldEludGVydmFsKFxuICAgICgpID0+IHtcbiAgICAgIHRlcm1pbmFsTWFuYWdlci5jbGVhbnVwKDUgKiA2MCAqIDEwMDApOyAvLyA1IG1pbnV0ZXNcbiAgICB9LFxuICAgIDUgKiA2MCAqIDEwMDBcbiAgKTtcbiAgbG9nZ2VyLmRlYnVnKCdTdGFydGVkIHRlcm1pbmFsIGNsZWFudXAgaW50ZXJ2YWwgKDUgbWludXRlcyknKTtcblxuICAvLyBDbGVhbnVwIGluYWN0aXZlIHB1c2ggc3Vic2NyaXB0aW9ucyBldmVyeSAzMCBtaW51dGVzXG4gIGxldCBfc3Vic2NyaXB0aW9uQ2xlYW51cEludGVydmFsOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICBpZiAoYXBwSW5zdGFuY2UucHVzaE5vdGlmaWNhdGlvblNlcnZpY2UpIHtcbiAgICBfc3Vic2NyaXB0aW9uQ2xlYW51cEludGVydmFsID0gc2V0SW50ZXJ2YWwoXG4gICAgICAoKSA9PiB7XG4gICAgICAgIGFwcEluc3RhbmNlLnB1c2hOb3RpZmljYXRpb25TZXJ2aWNlPy5jbGVhbnVwSW5hY3RpdmVTdWJzY3JpcHRpb25zKCkuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdGYWlsZWQgdG8gY2xlYW51cCBpbmFjdGl2ZSBzdWJzY3JpcHRpb25zOicsIGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgICB9LFxuICAgICAgMzAgKiA2MCAqIDEwMDAgLy8gMzAgbWludXRlc1xuICAgICk7XG4gICAgbG9nZ2VyLmRlYnVnKCdTdGFydGVkIHN1YnNjcmlwdGlvbiBjbGVhbnVwIGludGVydmFsICgzMCBtaW51dGVzKScpO1xuICB9XG5cbiAgLy8gR3JhY2VmdWwgc2h1dGRvd25cbiAgbGV0IGxvY2FsU2h1dHRpbmdEb3duID0gZmFsc2U7XG5cbiAgY29uc3Qgc2h1dGRvd24gPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKGxvY2FsU2h1dHRpbmdEb3duKSB7XG4gICAgICBsb2dnZXIud2FybignRm9yY2UgZXhpdC4uLicpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGxvY2FsU2h1dHRpbmdEb3duID0gdHJ1ZTtcbiAgICBzZXRTaHV0dGluZ0Rvd24odHJ1ZSk7XG4gICAgbG9nZ2VyLmxvZyhjaGFsay55ZWxsb3coJ1xcblNodXR0aW5nIGRvd24uLi4nKSk7XG5cbiAgICB0cnkge1xuICAgICAgLy8gQ2xlYXIgY2xlYW51cCBpbnRlcnZhbHNcbiAgICAgIGNsZWFySW50ZXJ2YWwoX3Rlcm1pbmFsQ2xlYW51cEludGVydmFsKTtcbiAgICAgIGlmIChfc3Vic2NyaXB0aW9uQ2xlYW51cEludGVydmFsKSB7XG4gICAgICAgIGNsZWFySW50ZXJ2YWwoX3N1YnNjcmlwdGlvbkNsZWFudXBJbnRlcnZhbCk7XG4gICAgICB9XG4gICAgICBsb2dnZXIuZGVidWcoJ0NsZWFyZWQgY2xlYW51cCBpbnRlcnZhbHMnKTtcblxuICAgICAgLy8gU3RvcCBhY3Rpdml0eSBtb25pdG9yXG4gICAgICBhY3Rpdml0eU1vbml0b3Iuc3RvcCgpO1xuICAgICAgbG9nZ2VyLmRlYnVnKCdTdG9wcGVkIGFjdGl2aXR5IG1vbml0b3InKTtcbiAgICAgIC8vIFN0b3AgY29uZmlndXJhdGlvbiBzZXJ2aWNlIHdhdGNoZXJcbiAgICAgIGNvbmZpZ1NlcnZpY2Uuc3RvcFdhdGNoaW5nKCk7XG4gICAgICBsb2dnZXIuZGVidWcoJ1N0b3BwZWQgY29uZmlndXJhdGlvbiBzZXJ2aWNlIHdhdGNoZXInKTtcblxuICAgICAgLy8gU3RvcCBtRE5TIGFkdmVydGlzZW1lbnQgaWYgaXQgd2FzIHN0YXJ0ZWRcbiAgICAgIGlmIChtZG5zU2VydmljZS5pc0FjdGl2ZSgpKSB7XG4gICAgICAgIGF3YWl0IG1kbnNTZXJ2aWNlLnN0b3BBZHZlcnRpc2luZygpO1xuICAgICAgICBsb2dnZXIuZGVidWcoJ1N0b3BwZWQgbUROUyBhZHZlcnRpc2VtZW50Jyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFN0b3AgVGFpbHNjYWxlIFNlcnZlIGlmIGl0IHdhcyBzdGFydGVkXG4gICAgICBpZiAoY29uZmlnLmVuYWJsZVRhaWxzY2FsZVNlcnZlICYmIHRhaWxzY2FsZVNlcnZlU2VydmljZS5pc1J1bm5pbmcoKSkge1xuICAgICAgICBsb2dnZXIubG9nKCdTdG9wcGluZyBUYWlsc2NhbGUgU2VydmUuLi4nKTtcbiAgICAgICAgYXdhaXQgdGFpbHNjYWxlU2VydmVTZXJ2aWNlLnN0b3AoKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdTdG9wcGVkIFRhaWxzY2FsZSBTZXJ2ZSBzZXJ2aWNlJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFN0b3AgY29udHJvbCBkaXJlY3Rvcnkgd2F0Y2hlclxuICAgICAgaWYgKGNvbnRyb2xEaXJXYXRjaGVyKSB7XG4gICAgICAgIGNvbnRyb2xEaXJXYXRjaGVyLnN0b3AoKTtcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCdTdG9wcGVkIGNvbnRyb2wgZGlyZWN0b3J5IHdhdGNoZXInKTtcbiAgICAgIH1cblxuICAgICAgLy8gU3RvcCBVTklYIHNvY2tldCBzZXJ2ZXJcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29udHJvbFVuaXhIYW5kbGVyIH0gPSBhd2FpdCBpbXBvcnQoJy4vd2Vic29ja2V0L2NvbnRyb2wtdW5peC1oYW5kbGVyLmpzJyk7XG4gICAgICAgIGNvbnRyb2xVbml4SGFuZGxlci5zdG9wKCk7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnU3RvcHBlZCBVTklYIHNvY2tldCBzZXJ2ZXInKTtcbiAgICAgIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgICAgICAvLyBJZ25vcmUgaWYgbW9kdWxlIG5vdCBsb2FkZWRcbiAgICAgIH1cblxuICAgICAgaWYgKGhxQ2xpZW50KSB7XG4gICAgICAgIGxvZ2dlci5kZWJ1ZygnRGVzdHJveWluZyBIUSBjbGllbnQgY29ubmVjdGlvbicpO1xuICAgICAgICBhd2FpdCBocUNsaWVudC5kZXN0cm95KCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZW1vdGVSZWdpc3RyeSkge1xuICAgICAgICBsb2dnZXIuZGVidWcoJ0Rlc3Ryb3lpbmcgcmVtb3RlIHJlZ2lzdHJ5Jyk7XG4gICAgICAgIHJlbW90ZVJlZ2lzdHJ5LmRlc3Ryb3koKTtcbiAgICAgIH1cblxuICAgICAgc2VydmVyLmNsb3NlKCgpID0+IHtcbiAgICAgICAgbG9nZ2VyLmxvZyhjaGFsay5ncmVlbignU2VydmVyIGNsb3NlZCBzdWNjZXNzZnVsbHknKSk7XG4gICAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBGb3JjZSBleGl0IGFmdGVyIDUgc2Vjb25kcyBpZiBncmFjZWZ1bCBzaHV0ZG93biBmYWlsc1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdHcmFjZWZ1bCBzaHV0ZG93biB0aW1lb3V0LCBmb3JjaW5nIGV4aXQuLi4nKTtcbiAgICAgICAgY2xvc2VMb2dnZXIoKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfSwgNTAwMCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgZHVyaW5nIHNodXRkb3duOicsIGVycm9yKTtcbiAgICAgIGNsb3NlTG9nZ2VyKCk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuICB9O1xuXG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIHNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIHNodXRkb3duKTtcbiAgbG9nZ2VyLmRlYnVnKCdSZWdpc3RlcmVkIHNpZ25hbCBoYW5kbGVycyBmb3IgZ3JhY2VmdWwgc2h1dGRvd24nKTtcbn1cblxuLy8gRXhwb3J0IGZvciB0ZXN0aW5nXG5leHBvcnQgKiBmcm9tICcuL3ZlcnNpb24uanMnO1xuIl19