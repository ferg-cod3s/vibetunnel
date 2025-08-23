#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSystemdService = installSystemdService;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
// Colors for output
const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const BLUE = '\x1b[0;34m';
const NC = '\x1b[0m'; // No Color
// Configuration
const SERVICE_NAME = 'vibetunnel';
const SERVICE_FILE = 'vibetunnel.service';
// Get the current user (regular user only, no sudo/root)
function getCurrentUser() {
    const username = process.env.USER || 'unknown';
    const home = process.env.HOME || `/home/${username}`;
    return { username, home };
}
// Print colored output
function printInfo(message) {
    console.log(`${BLUE}[INFO]${NC} ${message}`);
}
function printSuccess(message) {
    console.log(`${GREEN}[SUCCESS]${NC} ${message}`);
}
function printError(message) {
    console.log(`${RED}[ERROR]${NC} ${message}`);
}
// Create a stable wrapper script that can find vibetunnel regardless of node version manager
function createVibetunnelWrapper() {
    const { username, home } = getCurrentUser();
    const wrapperPath = `${home}/.local/bin/vibetunnel-systemd`;
    const wrapperContent = `#!/bin/bash
# VibeTunnel Systemd Wrapper Script
# This script finds and executes vibetunnel for user: ${username}

# Function to log messages
log_info() {
    echo "[INFO] $1" >&2
}

log_error() {
    echo "[ERROR] $1" >&2
}

# Set up environment for user ${username}
export HOME="${home}"
export USER="${username}"

# Try to find vibetunnel in various ways
find_vibetunnel() {
    # Method 1: Check if vibetunnel is in PATH
    if command -v vibetunnel >/dev/null 2>&1; then
        log_info "Found vibetunnel in PATH"
        vibetunnel "$@"
        return $?
    fi
    
    # Method 2: Check for nvm installations
    if [ -d "${home}/.nvm" ]; then
        log_info "Checking nvm installation for user ${username}"
        export NVM_DIR="${home}/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        if command -v vibetunnel >/dev/null 2>&1; then
            log_info "Found vibetunnel via nvm"
            vibetunnel "$@"
            return $?
        fi
    fi
    
    # Method 3: Check for fnm installations  
    if [ -d "${home}/.local/share/fnm" ] && [ -x "${home}/.local/share/fnm/fnm" ]; then
        log_info "Checking fnm installation for user ${username}"
        export FNM_DIR="${home}/.local/share/fnm"
        export PATH="${home}/.local/share/fnm:$PATH"
        export SHELL="/bin/bash"  # Force shell for fnm
        # Initialize fnm with explicit shell and use the default node version
        eval "$("${home}/.local/share/fnm/fnm" env --shell bash)" 2>/dev/null || true
        # Try to use the default node version or current version
        "${home}/.local/share/fnm/fnm" use default >/dev/null 2>&1 || "${home}/.local/share/fnm/fnm" use current >/dev/null 2>&1 || true
        if command -v vibetunnel >/dev/null 2>&1; then
            log_info "Found vibetunnel via fnm"
            vibetunnel "$@"
            return $?
        fi
    fi
    
    # Method 4: Check common global npm locations
    for npm_bin in "/usr/local/bin/npm" "/usr/bin/npm" "/opt/homebrew/bin/npm"; do
        if [ -x "$npm_bin" ]; then
            log_info "Trying npm global with $npm_bin"
            NPM_PREFIX=$("$npm_bin" config get prefix 2>/dev/null)
            if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/vibetunnel" ]; then
                log_info "Found vibetunnel via npm global: $NPM_PREFIX/bin/vibetunnel"
                "$NPM_PREFIX/bin/vibetunnel" "$@"
                return $?
            fi
        fi
    done
    
    # Method 5: Try to run with node directly using global npm package
    for node_bin in "/usr/local/bin/node" "/usr/bin/node" "/opt/homebrew/bin/node"; do
        if [ -x "$node_bin" ]; then
            for script_path in "/usr/local/lib/node_modules/vibetunnel/dist/cli.js" "/usr/lib/node_modules/vibetunnel/dist/cli.js"; do
                if [ -f "$script_path" ]; then
                    log_info "Running vibetunnel via node: $node_bin $script_path"
                    "$node_bin" "$script_path" "$@"
                    return $?
                fi
            done
        fi
    done
    
    log_error "Could not find vibetunnel installation for user ${username}"
    log_error "Please ensure vibetunnel is installed globally: npm install -g vibetunnel"
    return 1
}

# Execute the function with all arguments
find_vibetunnel "$@"
`;
    try {
        // Ensure ~/.local/bin directory exists
        const localBinDir = `${home}/.local/bin`;
        if (!(0, node_fs_1.existsSync)(localBinDir)) {
            (0, node_fs_1.mkdirSync)(localBinDir, { recursive: true });
            printInfo(`Created directory: ${localBinDir}`);
        }
        // Create the wrapper script
        (0, node_fs_1.writeFileSync)(wrapperPath, wrapperContent);
        (0, node_fs_1.chmodSync)(wrapperPath, 0o755);
        printSuccess(`Created wrapper script at ${wrapperPath}`);
        return wrapperPath;
    }
    catch (error) {
        printError(`Failed to create wrapper script: ${error}`);
        process.exit(1);
    }
}
// Verify that vibetunnel is accessible and return wrapper path
function checkVibetunnelAndCreateWrapper() {
    // First, verify that vibetunnel is actually installed somewhere
    try {
        const vibetunnelPath = (0, node_child_process_1.execSync)('which vibetunnel', { encoding: 'utf8', stdio: 'pipe' }).trim();
        printInfo(`Found VibeTunnel at: ${vibetunnelPath}`);
    }
    catch (_error) {
        printError('VibeTunnel is not installed or not accessible. Please install it first:');
        console.log('  npm install -g vibetunnel');
        process.exit(1);
    }
    // Create and return the wrapper script path
    return createVibetunnelWrapper();
}
// Remove wrapper script during uninstall
function removeVibetunnelWrapper() {
    const { home } = getCurrentUser();
    const wrapperPath = `${home}/.local/bin/vibetunnel-systemd`;
    try {
        if ((0, node_fs_1.existsSync)(wrapperPath)) {
            (0, node_fs_1.unlinkSync)(wrapperPath);
            printInfo('Removed wrapper script');
        }
    }
    catch (_error) {
        // Ignore errors when removing wrapper
    }
}
// No need to create users or directories - using current user
// Get the systemd service template
function getServiceTemplate(vibetunnelPath) {
    const { home } = getCurrentUser();
    return `[Unit]
Description=VibeTunnel - Terminal sharing server with web interface
Documentation=https://github.com/amantus-ai/vibetunnel
After=network.target
Wants=network.target

[Service]
Type=simple
WorkingDirectory=${home}
ExecStart=${vibetunnelPath} --port 4020 --bind 0.0.0.0
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Environment - preserve user environment for node version managers
Environment=NODE_ENV=production
Environment=VIBETUNNEL_LOG_LEVEL=info
Environment=HOME=%h
Environment=USER=%i

# Resource limits
LimitNOFILE=65536
MemoryHigh=512M
MemoryMax=1G

[Install]
WantedBy=default.target`;
}
// Install systemd service
function installService(vibetunnelPath) {
    printInfo('Installing user systemd service...');
    const { home } = getCurrentUser();
    const systemdDir = `${home}/.config/systemd/user`;
    const serviceContent = getServiceTemplate(vibetunnelPath);
    const servicePath = (0, node_path_1.join)(systemdDir, SERVICE_FILE);
    try {
        // Create user systemd directory if it doesn't exist
        (0, node_fs_1.mkdirSync)(systemdDir, { recursive: true });
        (0, node_fs_1.writeFileSync)(servicePath, serviceContent);
        (0, node_fs_1.chmodSync)(servicePath, 0o644);
        // Reload user systemd
        (0, node_child_process_1.execSync)('systemctl --user daemon-reload', { stdio: 'pipe' });
        printSuccess('User systemd service installed');
    }
    catch (error) {
        printError(`Failed to install service: ${error}`);
        process.exit(1);
    }
}
// Configure service
function configureService() {
    printInfo('Configuring service...');
    try {
        // Enable the user service
        (0, node_child_process_1.execSync)(`systemctl --user enable ${SERVICE_NAME}`, { stdio: 'pipe' });
        printSuccess('User service enabled for automatic startup');
        // Enable lingering so service starts on boot even when user not logged in
        try {
            const { username } = getCurrentUser();
            (0, node_child_process_1.execSync)(`loginctl enable-linger ${username}`, { stdio: 'pipe' });
            printSuccess('User lingering enabled - service will start on boot');
        }
        catch (error) {
            printError(`Failed to enable lingering: ${error}`);
            printError('Service will only start when user logs in');
        }
    }
    catch (error) {
        printError(`Failed to configure service: ${error}`);
        process.exit(1);
    }
}
// Display usage instructions
function showUsage() {
    const { username, home } = getCurrentUser();
    printSuccess('VibeTunnel systemd service installation completed!');
    console.log('');
    console.log('Usage:');
    console.log(`  systemctl --user start ${SERVICE_NAME}     # Start the service`);
    console.log(`  systemctl --user stop ${SERVICE_NAME}      # Stop the service`);
    console.log(`  systemctl --user restart ${SERVICE_NAME}   # Restart the service`);
    console.log(`  systemctl --user status ${SERVICE_NAME}    # Check service status`);
    console.log(`  systemctl --user enable ${SERVICE_NAME}    # Enable auto-start (already done)`);
    console.log(`  systemctl --user disable ${SERVICE_NAME}   # Disable auto-start`);
    console.log('');
    console.log('Logs:');
    console.log(`  journalctl --user -u ${SERVICE_NAME} -f    # Follow logs in real-time`);
    console.log(`  journalctl --user -u ${SERVICE_NAME}       # View all logs`);
    console.log('');
    console.log('Configuration:');
    console.log('  Service runs on port 4020 by default');
    console.log('  Web interface: http://localhost:4020');
    console.log(`  Service runs as user: ${username}`);
    console.log(`  Working directory: ${home}`);
    console.log(`  Wrapper script: ${home}/.local/bin/vibetunnel-systemd`);
    console.log('');
    console.log(`To customize the service, edit: ${home}/.config/systemd/user/${SERVICE_FILE}`);
    console.log(`Then run: systemctl --user daemon-reload && systemctl --user restart ${SERVICE_NAME}`);
}
// Uninstall function
function uninstallService() {
    printInfo('Uninstalling VibeTunnel user systemd service...');
    try {
        // Stop and disable user service
        try {
            (0, node_child_process_1.execSync)(`systemctl --user is-active ${SERVICE_NAME}`, { stdio: 'pipe' });
            (0, node_child_process_1.execSync)(`systemctl --user stop ${SERVICE_NAME}`, { stdio: 'pipe' });
            printInfo('User service stopped');
        }
        catch (_error) {
            // Service not running
        }
        try {
            (0, node_child_process_1.execSync)(`systemctl --user is-enabled ${SERVICE_NAME}`, { stdio: 'pipe' });
            (0, node_child_process_1.execSync)(`systemctl --user disable ${SERVICE_NAME}`, { stdio: 'pipe' });
            printInfo('User service disabled');
        }
        catch (_error) {
            // Service not enabled
        }
        // Remove service file
        const { home } = getCurrentUser();
        const systemdDir = `${home}/.config/systemd/user`;
        const servicePath = (0, node_path_1.join)(systemdDir, SERVICE_FILE);
        if ((0, node_fs_1.existsSync)(servicePath)) {
            (0, node_fs_1.unlinkSync)(servicePath);
            printInfo('Service file removed');
        }
        // Reload user systemd
        (0, node_child_process_1.execSync)('systemctl --user daemon-reload', { stdio: 'pipe' });
        // Remove wrapper script
        removeVibetunnelWrapper();
        // Optionally disable lingering (ask user)
        const { username } = getCurrentUser();
        printInfo('Note: User lingering is still enabled. To disable:');
        console.log(`  loginctl disable-linger ${username}`);
        printSuccess('VibeTunnel user systemd service uninstalled');
    }
    catch (error) {
        printError(`Failed to uninstall service: ${error}`);
        process.exit(1);
    }
}
// Check service status
function checkServiceStatus() {
    try {
        const status = (0, node_child_process_1.execSync)(`systemctl --user status ${SERVICE_NAME}`, { encoding: 'utf8' });
        console.log(status);
    }
    catch (error) {
        // systemctl status returns non-zero for inactive services, which is normal
        if (error instanceof Error && 'stdout' in error) {
            console.log(error.stdout);
        }
        else {
            printError(`Failed to get service status: ${error}`);
        }
    }
}
// Check if running as root and prevent execution
function checkNotRoot() {
    if (process.getuid && process.getuid() === 0) {
        printError('This installer must NOT be run as root!');
        printError('VibeTunnel systemd service should run as a regular user for security.');
        printError('Please run this command as a regular user (without sudo).');
        process.exit(1);
    }
}
// Main installation function
function installSystemdService(action = 'install') {
    // Prevent running as root for security
    checkNotRoot();
    switch (action) {
        case 'install': {
            printInfo('Installing VibeTunnel user systemd service...');
            const wrapperPath = checkVibetunnelAndCreateWrapper();
            installService(wrapperPath);
            configureService();
            showUsage();
            break;
        }
        case 'uninstall': {
            uninstallService();
            break;
        }
        case 'status':
            checkServiceStatus();
            break;
        default:
            console.log('Usage: vibetunnel systemd [install|uninstall|status]');
            console.log('  install   - Install VibeTunnel user systemd service (default)');
            console.log('  uninstall - Remove VibeTunnel user systemd service');
            console.log('  status    - Check service status');
            process.exit(1);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3lzdGVtZC1pbnN0YWxsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3NlcnZpY2VzL3N5c3RlbWQtaW5zdGFsbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQXFYQSxzREErQkM7QUFsWkQsMkRBQThDO0FBQzlDLHFDQUFzRjtBQUN0Rix5Q0FBaUM7QUFFakMsb0JBQW9CO0FBQ3BCLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQztBQUN6QixNQUFNLEtBQUssR0FBRyxZQUFZLENBQUM7QUFDM0IsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDO0FBQzFCLE1BQU0sRUFBRSxHQUFHLFNBQVMsQ0FBQyxDQUFDLFdBQVc7QUFFakMsZ0JBQWdCO0FBQ2hCLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQztBQUNsQyxNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQztBQUUxQyx5REFBeUQ7QUFDekQsU0FBUyxjQUFjO0lBQ3JCLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQztJQUMvQyxNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxTQUFTLFFBQVEsRUFBRSxDQUFDO0lBRXJELE9BQU8sRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFDNUIsQ0FBQztBQUVELHVCQUF1QjtBQUN2QixTQUFTLFNBQVMsQ0FBQyxPQUFlO0lBQ2hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsRUFBRSxJQUFJLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDL0MsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLE9BQWU7SUFDbkMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssWUFBWSxFQUFFLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQztBQUNuRCxDQUFDO0FBRUQsU0FBUyxVQUFVLENBQUMsT0FBZTtJQUNqQyxPQUFP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QUFvQyxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNwQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcblxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgY2htb2RTeW5jLCBleGlzdHNTeW5jLCBta2RpclN5bmMsIHVubGlua1N5bmMsIHdyaXRlRmlsZVN5bmMgfSBmcm9tICdub2RlOmZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdub2RlOnBhdGgnO1xuXG4vLyBDb2xvcnMgZm9yIG91dHB1dFxuY29uc3QgUkVEID0gJ1xceDFiWzA7MzFtJztcbmNvbnN0IEdSRUVOID0gJ1xceDFiWzA7MzJtJztcbmNvbnN0IEJMVUUgPSAnXFx4MWJbMDszNG0nO1xuY29uc3QgTkMgPSAnXFx4MWJbMG0nOyAvLyBObyBDb2xvclxuXG4vLyBDb25maWd1cmF0aW9uXG5jb25zdCBTRVJWSUNFX05BTUUgPSAndmliZXR1bm5lbCc7XG5jb25zdCBTRVJWSUNFX0ZJTEUgPSAndmliZXR1bm5lbC5zZXJ2aWNlJztcblxuLy8gR2V0IHRoZSBjdXJyZW50IHVzZXIgKHJlZ3VsYXIgdXNlciBvbmx5LCBubyBzdWRvL3Jvb3QpXG5mdW5jdGlvbiBnZXRDdXJyZW50VXNlcigpOiB7IHVzZXJuYW1lOiBzdHJpbmc7IGhvbWU6IHN0cmluZyB9IHtcbiAgY29uc3QgdXNlcm5hbWUgPSBwcm9jZXNzLmVudi5VU0VSIHx8ICd1bmtub3duJztcbiAgY29uc3QgaG9tZSA9IHByb2Nlc3MuZW52LkhPTUUgfHwgYC9ob21lLyR7dXNlcm5hbWV9YDtcblxuICByZXR1cm4geyB1c2VybmFtZSwgaG9tZSB9O1xufVxuXG4vLyBQcmludCBjb2xvcmVkIG91dHB1dFxuZnVuY3Rpb24gcHJpbnRJbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBjb25zb2xlLmxvZyhgJHtCTFVFfVtJTkZPXSR7TkN9ICR7bWVzc2FnZX1gKTtcbn1cblxuZnVuY3Rpb24gcHJpbnRTdWNjZXNzKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBjb25zb2xlLmxvZyhgJHtHUkVFTn1bU1VDQ0VTU10ke05DfSAke21lc3NhZ2V9YCk7XG59XG5cbmZ1bmN0aW9uIHByaW50RXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKGAke1JFRH1bRVJST1JdJHtOQ30gJHttZXNzYWdlfWApO1xufVxuXG4vLyBDcmVhdGUgYSBzdGFibGUgd3JhcHBlciBzY3JpcHQgdGhhdCBjYW4gZmluZCB2aWJldHVubmVsIHJlZ2FyZGxlc3Mgb2Ygbm9kZSB2ZXJzaW9uIG1hbmFnZXJcbmZ1bmN0aW9uIGNyZWF0ZVZpYmV0dW5uZWxXcmFwcGVyKCk6IHN0cmluZyB7XG4gIGNvbnN0IHsgdXNlcm5hbWUsIGhvbWUgfSA9IGdldEN1cnJlbnRVc2VyKCk7XG4gIGNvbnN0IHdyYXBwZXJQYXRoID0gYCR7aG9tZX0vLmxvY2FsL2Jpbi92aWJldHVubmVsLXN5c3RlbWRgO1xuICBjb25zdCB3cmFwcGVyQ29udGVudCA9IGAjIS9iaW4vYmFzaFxuIyBWaWJlVHVubmVsIFN5c3RlbWQgV3JhcHBlciBTY3JpcHRcbiMgVGhpcyBzY3JpcHQgZmluZHMgYW5kIGV4ZWN1dGVzIHZpYmV0dW5uZWwgZm9yIHVzZXI6ICR7dXNlcm5hbWV9XG5cbiMgRnVuY3Rpb24gdG8gbG9nIG1lc3NhZ2VzXG5sb2dfaW5mbygpIHtcbiAgICBlY2hvIFwiW0lORk9dICQxXCIgPiYyXG59XG5cbmxvZ19lcnJvcigpIHtcbiAgICBlY2hvIFwiW0VSUk9SXSAkMVwiID4mMlxufVxuXG4jIFNldCB1cCBlbnZpcm9ubWVudCBmb3IgdXNlciAke3VzZXJuYW1lfVxuZXhwb3J0IEhPTUU9XCIke2hvbWV9XCJcbmV4cG9ydCBVU0VSPVwiJHt1c2VybmFtZX1cIlxuXG4jIFRyeSB0byBmaW5kIHZpYmV0dW5uZWwgaW4gdmFyaW91cyB3YXlzXG5maW5kX3ZpYmV0dW5uZWwoKSB7XG4gICAgIyBNZXRob2QgMTogQ2hlY2sgaWYgdmliZXR1bm5lbCBpcyBpbiBQQVRIXG4gICAgaWYgY29tbWFuZCAtdiB2aWJldHVubmVsID4vZGV2L251bGwgMj4mMTsgdGhlblxuICAgICAgICBsb2dfaW5mbyBcIkZvdW5kIHZpYmV0dW5uZWwgaW4gUEFUSFwiXG4gICAgICAgIHZpYmV0dW5uZWwgXCIkQFwiXG4gICAgICAgIHJldHVybiAkP1xuICAgIGZpXG4gICAgXG4gICAgIyBNZXRob2QgMjogQ2hlY2sgZm9yIG52bSBpbnN0YWxsYXRpb25zXG4gICAgaWYgWyAtZCBcIiR7aG9tZX0vLm52bVwiIF07IHRoZW5cbiAgICAgICAgbG9nX2luZm8gXCJDaGVja2luZyBudm0gaW5zdGFsbGF0aW9uIGZvciB1c2VyICR7dXNlcm5hbWV9XCJcbiAgICAgICAgZXhwb3J0IE5WTV9ESVI9XCIke2hvbWV9Ly5udm1cIlxuICAgICAgICBbIC1zIFwiJE5WTV9ESVIvbnZtLnNoXCIgXSAmJiAuIFwiJE5WTV9ESVIvbnZtLnNoXCJcbiAgICAgICAgaWYgY29tbWFuZCAtdiB2aWJldHVubmVsID4vZGV2L251bGwgMj4mMTsgdGhlblxuICAgICAgICAgICAgbG9nX2luZm8gXCJGb3VuZCB2aWJldHVubmVsIHZpYSBudm1cIlxuICAgICAgICAgICAgdmliZXR1bm5lbCBcIiRAXCJcbiAgICAgICAgICAgIHJldHVybiAkP1xuICAgICAgICBmaVxuICAgIGZpXG4gICAgXG4gICAgIyBNZXRob2QgMzogQ2hlY2sgZm9yIGZubSBpbnN0YWxsYXRpb25zICBcbiAgICBpZiBbIC1kIFwiJHtob21lfS8ubG9jYWwvc2hhcmUvZm5tXCIgXSAmJiBbIC14IFwiJHtob21lfS8ubG9jYWwvc2hhcmUvZm5tL2ZubVwiIF07IHRoZW5cbiAgICAgICAgbG9nX2luZm8gXCJDaGVja2luZyBmbm0gaW5zdGFsbGF0aW9uIGZvciB1c2VyICR7dXNlcm5hbWV9XCJcbiAgICAgICAgZXhwb3J0IEZOTV9ESVI9XCIke2hvbWV9Ly5sb2NhbC9zaGFyZS9mbm1cIlxuICAgICAgICBleHBvcnQgUEFUSD1cIiR7aG9tZX0vLmxvY2FsL3NoYXJlL2ZubTokUEFUSFwiXG4gICAgICAgIGV4cG9ydCBTSEVMTD1cIi9iaW4vYmFzaFwiICAjIEZvcmNlIHNoZWxsIGZvciBmbm1cbiAgICAgICAgIyBJbml0aWFsaXplIGZubSB3aXRoIGV4cGxpY2l0IHNoZWxsIGFuZCB1c2UgdGhlIGRlZmF1bHQgbm9kZSB2ZXJzaW9uXG4gICAgICAgIGV2YWwgXCIkKFwiJHtob21lfS8ubG9jYWwvc2hhcmUvZm5tL2ZubVwiIGVudiAtLXNoZWxsIGJhc2gpXCIgMj4vZGV2L251bGwgfHwgdHJ1ZVxuICAgICAgICAjIFRyeSB0byB1c2UgdGhlIGRlZmF1bHQgbm9kZSB2ZXJzaW9uIG9yIGN1cnJlbnQgdmVyc2lvblxuICAgICAgICBcIiR7aG9tZX0vLmxvY2FsL3NoYXJlL2ZubS9mbm1cIiB1c2UgZGVmYXVsdCA+L2Rldi9udWxsIDI+JjEgfHwgXCIke2hvbWV9Ly5sb2NhbC9zaGFyZS9mbm0vZm5tXCIgdXNlIGN1cnJlbnQgPi9kZXYvbnVsbCAyPiYxIHx8IHRydWVcbiAgICAgICAgaWYgY29tbWFuZCAtdiB2aWJldHVubmVsID4vZGV2L251bGwgMj4mMTsgdGhlblxuICAgICAgICAgICAgbG9nX2luZm8gXCJGb3VuZCB2aWJldHVubmVsIHZpYSBmbm1cIlxuICAgICAgICAgICAgdmliZXR1bm5lbCBcIiRAXCJcbiAgICAgICAgICAgIHJldHVybiAkP1xuICAgICAgICBmaVxuICAgIGZpXG4gICAgXG4gICAgIyBNZXRob2QgNDogQ2hlY2sgY29tbW9uIGdsb2JhbCBucG0gbG9jYXRpb25zXG4gICAgZm9yIG5wbV9iaW4gaW4gXCIvdXNyL2xvY2FsL2Jpbi9ucG1cIiBcIi91c3IvYmluL25wbVwiIFwiL29wdC9ob21lYnJldy9iaW4vbnBtXCI7IGRvXG4gICAgICAgIGlmIFsgLXggXCIkbnBtX2JpblwiIF07IHRoZW5cbiAgICAgICAgICAgIGxvZ19pbmZvIFwiVHJ5aW5nIG5wbSBnbG9iYWwgd2l0aCAkbnBtX2JpblwiXG4gICAgICAgICAgICBOUE1fUFJFRklYPSQoXCIkbnBtX2JpblwiIGNvbmZpZyBnZXQgcHJlZml4IDI+L2Rldi9udWxsKVxuICAgICAgICAgICAgaWYgWyAtbiBcIiROUE1fUFJFRklYXCIgXSAmJiBbIC14IFwiJE5QTV9QUkVGSVgvYmluL3ZpYmV0dW5uZWxcIiBdOyB0aGVuXG4gICAgICAgICAgICAgICAgbG9nX2luZm8gXCJGb3VuZCB2aWJldHVubmVsIHZpYSBucG0gZ2xvYmFsOiAkTlBNX1BSRUZJWC9iaW4vdmliZXR1bm5lbFwiXG4gICAgICAgICAgICAgICAgXCIkTlBNX1BSRUZJWC9iaW4vdmliZXR1bm5lbFwiIFwiJEBcIlxuICAgICAgICAgICAgICAgIHJldHVybiAkP1xuICAgICAgICAgICAgZmlcbiAgICAgICAgZmlcbiAgICBkb25lXG4gICAgXG4gICAgIyBNZXRob2QgNTogVHJ5IHRvIHJ1biB3aXRoIG5vZGUgZGlyZWN0bHkgdXNpbmcgZ2xvYmFsIG5wbSBwYWNrYWdlXG4gICAgZm9yIG5vZGVfYmluIGluIFwiL3Vzci9sb2NhbC9iaW4vbm9kZVwiIFwiL3Vzci9iaW4vbm9kZVwiIFwiL29wdC9ob21lYnJldy9iaW4vbm9kZVwiOyBkb1xuICAgICAgICBpZiBbIC14IFwiJG5vZGVfYmluXCIgXTsgdGhlblxuICAgICAgICAgICAgZm9yIHNjcmlwdF9wYXRoIGluIFwiL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3ZpYmV0dW5uZWwvZGlzdC9jbGkuanNcIiBcIi91c3IvbGliL25vZGVfbW9kdWxlcy92aWJldHVubmVsL2Rpc3QvY2xpLmpzXCI7IGRvXG4gICAgICAgICAgICAgICAgaWYgWyAtZiBcIiRzY3JpcHRfcGF0aFwiIF07IHRoZW5cbiAgICAgICAgICAgICAgICAgICAgbG9nX2luZm8gXCJSdW5uaW5nIHZpYmV0dW5uZWwgdmlhIG5vZGU6ICRub2RlX2JpbiAkc2NyaXB0X3BhdGhcIlxuICAgICAgICAgICAgICAgICAgICBcIiRub2RlX2JpblwiIFwiJHNjcmlwdF9wYXRoXCIgXCIkQFwiXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAkP1xuICAgICAgICAgICAgICAgIGZpXG4gICAgICAgICAgICBkb25lXG4gICAgICAgIGZpXG4gICAgZG9uZVxuICAgIFxuICAgIGxvZ19lcnJvciBcIkNvdWxkIG5vdCBmaW5kIHZpYmV0dW5uZWwgaW5zdGFsbGF0aW9uIGZvciB1c2VyICR7dXNlcm5hbWV9XCJcbiAgICBsb2dfZXJyb3IgXCJQbGVhc2UgZW5zdXJlIHZpYmV0dW5uZWwgaXMgaW5zdGFsbGVkIGdsb2JhbGx5OiBucG0gaW5zdGFsbCAtZyB2aWJldHVubmVsXCJcbiAgICByZXR1cm4gMVxufVxuXG4jIEV4ZWN1dGUgdGhlIGZ1bmN0aW9uIHdpdGggYWxsIGFyZ3VtZW50c1xuZmluZF92aWJldHVubmVsIFwiJEBcIlxuYDtcblxuICB0cnkge1xuICAgIC8vIEVuc3VyZSB+Ly5sb2NhbC9iaW4gZGlyZWN0b3J5IGV4aXN0c1xuICAgIGNvbnN0IGxvY2FsQmluRGlyID0gYCR7aG9tZX0vLmxvY2FsL2JpbmA7XG4gICAgaWYgKCFleGlzdHNTeW5jKGxvY2FsQmluRGlyKSkge1xuICAgICAgbWtkaXJTeW5jKGxvY2FsQmluRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIHByaW50SW5mbyhgQ3JlYXRlZCBkaXJlY3Rvcnk6ICR7bG9jYWxCaW5EaXJ9YCk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSB3cmFwcGVyIHNjcmlwdFxuICAgIHdyaXRlRmlsZVN5bmMod3JhcHBlclBhdGgsIHdyYXBwZXJDb250ZW50KTtcbiAgICBjaG1vZFN5bmMod3JhcHBlclBhdGgsIDBvNzU1KTtcblxuICAgIHByaW50U3VjY2VzcyhgQ3JlYXRlZCB3cmFwcGVyIHNjcmlwdCBhdCAke3dyYXBwZXJQYXRofWApO1xuICAgIHJldHVybiB3cmFwcGVyUGF0aDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBwcmludEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIHdyYXBwZXIgc2NyaXB0OiAke2Vycm9yfWApO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG4vLyBWZXJpZnkgdGhhdCB2aWJldHVubmVsIGlzIGFjY2Vzc2libGUgYW5kIHJldHVybiB3cmFwcGVyIHBhdGhcbmZ1bmN0aW9uIGNoZWNrVmliZXR1bm5lbEFuZENyZWF0ZVdyYXBwZXIoKTogc3RyaW5nIHtcbiAgLy8gRmlyc3QsIHZlcmlmeSB0aGF0IHZpYmV0dW5uZWwgaXMgYWN0dWFsbHkgaW5zdGFsbGVkIHNvbWV3aGVyZVxuICB0cnkge1xuICAgIGNvbnN0IHZpYmV0dW5uZWxQYXRoID0gZXhlY1N5bmMoJ3doaWNoIHZpYmV0dW5uZWwnLCB7IGVuY29kaW5nOiAndXRmOCcsIHN0ZGlvOiAncGlwZScgfSkudHJpbSgpO1xuICAgIHByaW50SW5mbyhgRm91bmQgVmliZVR1bm5lbCBhdDogJHt2aWJldHVubmVsUGF0aH1gKTtcbiAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgcHJpbnRFcnJvcignVmliZVR1bm5lbCBpcyBub3QgaW5zdGFsbGVkIG9yIG5vdCBhY2Nlc3NpYmxlLiBQbGVhc2UgaW5zdGFsbCBpdCBmaXJzdDonKTtcbiAgICBjb25zb2xlLmxvZygnICBucG0gaW5zdGFsbCAtZyB2aWJldHVubmVsJyk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGFuZCByZXR1cm4gdGhlIHdyYXBwZXIgc2NyaXB0IHBhdGhcbiAgcmV0dXJuIGNyZWF0ZVZpYmV0dW5uZWxXcmFwcGVyKCk7XG59XG5cbi8vIFJlbW92ZSB3cmFwcGVyIHNjcmlwdCBkdXJpbmcgdW5pbnN0YWxsXG5mdW5jdGlvbiByZW1vdmVWaWJldHVubmVsV3JhcHBlcigpOiB2b2lkIHtcbiAgY29uc3QgeyBob21lIH0gPSBnZXRDdXJyZW50VXNlcigpO1xuICBjb25zdCB3cmFwcGVyUGF0aCA9IGAke2hvbWV9Ly5sb2NhbC9iaW4vdmliZXR1bm5lbC1zeXN0ZW1kYDtcbiAgdHJ5IHtcbiAgICBpZiAoZXhpc3RzU3luYyh3cmFwcGVyUGF0aCkpIHtcbiAgICAgIHVubGlua1N5bmMod3JhcHBlclBhdGgpO1xuICAgICAgcHJpbnRJbmZvKCdSZW1vdmVkIHdyYXBwZXIgc2NyaXB0Jyk7XG4gICAgfVxuICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAvLyBJZ25vcmUgZXJyb3JzIHdoZW4gcmVtb3Zpbmcgd3JhcHBlclxuICB9XG59XG5cbi8vIE5vIG5lZWQgdG8gY3JlYXRlIHVzZXJzIG9yIGRpcmVjdG9yaWVzIC0gdXNpbmcgY3VycmVudCB1c2VyXG5cbi8vIEdldCB0aGUgc3lzdGVtZCBzZXJ2aWNlIHRlbXBsYXRlXG5mdW5jdGlvbiBnZXRTZXJ2aWNlVGVtcGxhdGUodmliZXR1bm5lbFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHsgaG9tZSB9ID0gZ2V0Q3VycmVudFVzZXIoKTtcblxuICByZXR1cm4gYFtVbml0XVxuRGVzY3JpcHRpb249VmliZVR1bm5lbCAtIFRlcm1pbmFsIHNoYXJpbmcgc2VydmVyIHdpdGggd2ViIGludGVyZmFjZVxuRG9jdW1lbnRhdGlvbj1odHRwczovL2dpdGh1Yi5jb20vYW1hbnR1cy1haS92aWJldHVubmVsXG5BZnRlcj1uZXR3b3JrLnRhcmdldFxuV2FudHM9bmV0d29yay50YXJnZXRcblxuW1NlcnZpY2VdXG5UeXBlPXNpbXBsZVxuV29ya2luZ0RpcmVjdG9yeT0ke2hvbWV9XG5FeGVjU3RhcnQ9JHt2aWJldHVubmVsUGF0aH0gLS1wb3J0IDQwMjAgLS1iaW5kIDAuMC4wLjBcblJlc3RhcnQ9YWx3YXlzXG5SZXN0YXJ0U2VjPTEwXG5TdGFuZGFyZE91dHB1dD1qb3VybmFsXG5TdGFuZGFyZEVycm9yPWpvdXJuYWxcblN5c2xvZ0lkZW50aWZpZXI9JHtTRVJWSUNFX05BTUV9XG5cbiMgRW52aXJvbm1lbnQgLSBwcmVzZXJ2ZSB1c2VyIGVudmlyb25tZW50IGZvciBub2RlIHZlcnNpb24gbWFuYWdlcnNcbkVudmlyb25tZW50PU5PREVfRU5WPXByb2R1Y3Rpb25cbkVudmlyb25tZW50PVZJQkVUVU5ORUxfTE9HX0xFVkVMPWluZm9cbkVudmlyb25tZW50PUhPTUU9JWhcbkVudmlyb25tZW50PVVTRVI9JWlcblxuIyBSZXNvdXJjZSBsaW1pdHNcbkxpbWl0Tk9GSUxFPTY1NTM2XG5NZW1vcnlIaWdoPTUxMk1cbk1lbW9yeU1heD0xR1xuXG5bSW5zdGFsbF1cbldhbnRlZEJ5PWRlZmF1bHQudGFyZ2V0YDtcbn1cblxuLy8gSW5zdGFsbCBzeXN0ZW1kIHNlcnZpY2VcbmZ1bmN0aW9uIGluc3RhbGxTZXJ2aWNlKHZpYmV0dW5uZWxQYXRoOiBzdHJpbmcpOiB2b2lkIHtcbiAgcHJpbnRJbmZvKCdJbnN0YWxsaW5nIHVzZXIgc3lzdGVtZCBzZXJ2aWNlLi4uJyk7XG5cbiAgY29uc3QgeyBob21lIH0gPSBnZXRDdXJyZW50VXNlcigpO1xuICBjb25zdCBzeXN0ZW1kRGlyID0gYCR7aG9tZX0vLmNvbmZpZy9zeXN0ZW1kL3VzZXJgO1xuICBjb25zdCBzZXJ2aWNlQ29udGVudCA9IGdldFNlcnZpY2VUZW1wbGF0ZSh2aWJldHVubmVsUGF0aCk7XG4gIGNvbnN0IHNlcnZpY2VQYXRoID0gam9pbihzeXN0ZW1kRGlyLCBTRVJWSUNFX0ZJTEUpO1xuXG4gIHRyeSB7XG4gICAgLy8gQ3JlYXRlIHVzZXIgc3lzdGVtZCBkaXJlY3RvcnkgaWYgaXQgZG9lc24ndCBleGlzdFxuICAgIG1rZGlyU3luYyhzeXN0ZW1kRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblxuICAgIHdyaXRlRmlsZVN5bmMoc2VydmljZVBhdGgsIHNlcnZpY2VDb250ZW50KTtcbiAgICBjaG1vZFN5bmMoc2VydmljZVBhdGgsIDBvNjQ0KTtcblxuICAgIC8vIFJlbG9hZCB1c2VyIHN5c3RlbWRcbiAgICBleGVjU3luYygnc3lzdGVtY3RsIC0tdXNlciBkYWVtb24tcmVsb2FkJywgeyBzdGRpbzogJ3BpcGUnIH0pO1xuICAgIHByaW50U3VjY2VzcygnVXNlciBzeXN0ZW1kIHNlcnZpY2UgaW5zdGFsbGVkJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcHJpbnRFcnJvcihgRmFpbGVkIHRvIGluc3RhbGwgc2VydmljZTogJHtlcnJvcn1gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuLy8gQ29uZmlndXJlIHNlcnZpY2VcbmZ1bmN0aW9uIGNvbmZpZ3VyZVNlcnZpY2UoKTogdm9pZCB7XG4gIHByaW50SW5mbygnQ29uZmlndXJpbmcgc2VydmljZS4uLicpO1xuXG4gIHRyeSB7XG4gICAgLy8gRW5hYmxlIHRoZSB1c2VyIHNlcnZpY2VcbiAgICBleGVjU3luYyhgc3lzdGVtY3RsIC0tdXNlciBlbmFibGUgJHtTRVJWSUNFX05BTUV9YCwgeyBzdGRpbzogJ3BpcGUnIH0pO1xuICAgIHByaW50U3VjY2VzcygnVXNlciBzZXJ2aWNlIGVuYWJsZWQgZm9yIGF1dG9tYXRpYyBzdGFydHVwJyk7XG5cbiAgICAvLyBFbmFibGUgbGluZ2VyaW5nIHNvIHNlcnZpY2Ugc3RhcnRzIG9uIGJvb3QgZXZlbiB3aGVuIHVzZXIgbm90IGxvZ2dlZCBpblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IHVzZXJuYW1lIH0gPSBnZXRDdXJyZW50VXNlcigpO1xuICAgICAgZXhlY1N5bmMoYGxvZ2luY3RsIGVuYWJsZS1saW5nZXIgJHt1c2VybmFtZX1gLCB7IHN0ZGlvOiAncGlwZScgfSk7XG4gICAgICBwcmludFN1Y2Nlc3MoJ1VzZXIgbGluZ2VyaW5nIGVuYWJsZWQgLSBzZXJ2aWNlIHdpbGwgc3RhcnQgb24gYm9vdCcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBwcmludEVycm9yKGBGYWlsZWQgdG8gZW5hYmxlIGxpbmdlcmluZzogJHtlcnJvcn1gKTtcbiAgICAgIHByaW50RXJyb3IoJ1NlcnZpY2Ugd2lsbCBvbmx5IHN0YXJ0IHdoZW4gdXNlciBsb2dzIGluJyk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHByaW50RXJyb3IoYEZhaWxlZCB0byBjb25maWd1cmUgc2VydmljZTogJHtlcnJvcn1gKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuLy8gRGlzcGxheSB1c2FnZSBpbnN0cnVjdGlvbnNcbmZ1bmN0aW9uIHNob3dVc2FnZSgpOiB2b2lkIHtcbiAgY29uc3QgeyB1c2VybmFtZSwgaG9tZSB9ID0gZ2V0Q3VycmVudFVzZXIoKTtcblxuICBwcmludFN1Y2Nlc3MoJ1ZpYmVUdW5uZWwgc3lzdGVtZCBzZXJ2aWNlIGluc3RhbGxhdGlvbiBjb21wbGV0ZWQhJyk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ1VzYWdlOicpO1xuICBjb25zb2xlLmxvZyhgICBzeXN0ZW1jdGwgLS11c2VyIHN0YXJ0ICR7U0VSVklDRV9OQU1FfSAgICAgIyBTdGFydCB0aGUgc2VydmljZWApO1xuICBjb25zb2xlLmxvZyhgICBzeXN0ZW1jdGwgLS11c2VyIHN0b3AgJHtTRVJWSUNFX05BTUV9ICAgICAgIyBTdG9wIHRoZSBzZXJ2aWNlYCk7XG4gIGNvbnNvbGUubG9nKGAgIHN5c3RlbWN0bCAtLXVzZXIgcmVzdGFydCAke1NFUlZJQ0VfTkFNRX0gICAjIFJlc3RhcnQgdGhlIHNlcnZpY2VgKTtcbiAgY29uc29sZS5sb2coYCAgc3lzdGVtY3RsIC0tdXNlciBzdGF0dXMgJHtTRVJWSUNFX05BTUV9ICAgICMgQ2hlY2sgc2VydmljZSBzdGF0dXNgKTtcbiAgY29uc29sZS5sb2coYCAgc3lzdGVtY3RsIC0tdXNlciBlbmFibGUgJHtTRVJWSUNFX05BTUV9ICAgICMgRW5hYmxlIGF1dG8tc3RhcnQgKGFscmVhZHkgZG9uZSlgKTtcbiAgY29uc29sZS5sb2coYCAgc3lzdGVtY3RsIC0tdXNlciBkaXNhYmxlICR7U0VSVklDRV9OQU1FfSAgICMgRGlzYWJsZSBhdXRvLXN0YXJ0YCk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ0xvZ3M6Jyk7XG4gIGNvbnNvbGUubG9nKGAgIGpvdXJuYWxjdGwgLS11c2VyIC11ICR7U0VSVklDRV9OQU1FfSAtZiAgICAjIEZvbGxvdyBsb2dzIGluIHJlYWwtdGltZWApO1xuICBjb25zb2xlLmxvZyhgICBqb3VybmFsY3RsIC0tdXNlciAtdSAke1NFUlZJQ0VfTkFNRX0gICAgICAgIyBWaWV3IGFsbCBsb2dzYCk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coJ0NvbmZpZ3VyYXRpb246Jyk7XG4gIGNvbnNvbGUubG9nKCcgIFNlcnZpY2UgcnVucyBvbiBwb3J0IDQwMjAgYnkgZGVmYXVsdCcpO1xuICBjb25zb2xlLmxvZygnICBXZWIgaW50ZXJmYWNlOiBodHRwOi8vbG9jYWxob3N0OjQwMjAnKTtcbiAgY29uc29sZS5sb2coYCAgU2VydmljZSBydW5zIGFzIHVzZXI6ICR7dXNlcm5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgIFdvcmtpbmcgZGlyZWN0b3J5OiAke2hvbWV9YCk7XG4gIGNvbnNvbGUubG9nKGAgIFdyYXBwZXIgc2NyaXB0OiAke2hvbWV9Ly5sb2NhbC9iaW4vdmliZXR1bm5lbC1zeXN0ZW1kYCk7XG4gIGNvbnNvbGUubG9nKCcnKTtcbiAgY29uc29sZS5sb2coYFRvIGN1c3RvbWl6ZSB0aGUgc2VydmljZSwgZWRpdDogJHtob21lfS8uY29uZmlnL3N5c3RlbWQvdXNlci8ke1NFUlZJQ0VfRklMRX1gKTtcbiAgY29uc29sZS5sb2coXG4gICAgYFRoZW4gcnVuOiBzeXN0ZW1jdGwgLS11c2VyIGRhZW1vbi1yZWxvYWQgJiYgc3lzdGVtY3RsIC0tdXNlciByZXN0YXJ0ICR7U0VSVklDRV9OQU1FfWBcbiAgKTtcbn1cblxuLy8gVW5pbnN0YWxsIGZ1bmN0aW9uXG5mdW5jdGlvbiB1bmluc3RhbGxTZXJ2aWNlKCk6IHZvaWQge1xuICBwcmludEluZm8oJ1VuaW5zdGFsbGluZyBWaWJlVHVubmVsIHVzZXIgc3lzdGVtZCBzZXJ2aWNlLi4uJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBTdG9wIGFuZCBkaXNhYmxlIHVzZXIgc2VydmljZVxuICAgIHRyeSB7XG4gICAgICBleGVjU3luYyhgc3lzdGVtY3RsIC0tdXNlciBpcy1hY3RpdmUgJHtTRVJWSUNFX05BTUV9YCwgeyBzdGRpbzogJ3BpcGUnIH0pO1xuICAgICAgZXhlY1N5bmMoYHN5c3RlbWN0bCAtLXVzZXIgc3RvcCAke1NFUlZJQ0VfTkFNRX1gLCB7IHN0ZGlvOiAncGlwZScgfSk7XG4gICAgICBwcmludEluZm8oJ1VzZXIgc2VydmljZSBzdG9wcGVkJyk7XG4gICAgfSBjYXRjaCAoX2Vycm9yKSB7XG4gICAgICAvLyBTZXJ2aWNlIG5vdCBydW5uaW5nXG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGV4ZWNTeW5jKGBzeXN0ZW1jdGwgLS11c2VyIGlzLWVuYWJsZWQgJHtTRVJWSUNFX05BTUV9YCwgeyBzdGRpbzogJ3BpcGUnIH0pO1xuICAgICAgZXhlY1N5bmMoYHN5c3RlbWN0bCAtLXVzZXIgZGlzYWJsZSAke1NFUlZJQ0VfTkFNRX1gLCB7IHN0ZGlvOiAncGlwZScgfSk7XG4gICAgICBwcmludEluZm8oJ1VzZXIgc2VydmljZSBkaXNhYmxlZCcpO1xuICAgIH0gY2F0Y2ggKF9lcnJvcikge1xuICAgICAgLy8gU2VydmljZSBub3QgZW5hYmxlZFxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzZXJ2aWNlIGZpbGVcbiAgICBjb25zdCB7IGhvbWUgfSA9IGdldEN1cnJlbnRVc2VyKCk7XG4gICAgY29uc3Qgc3lzdGVtZERpciA9IGAke2hvbWV9Ly5jb25maWcvc3lzdGVtZC91c2VyYDtcbiAgICBjb25zdCBzZXJ2aWNlUGF0aCA9IGpvaW4oc3lzdGVtZERpciwgU0VSVklDRV9GSUxFKTtcbiAgICBpZiAoZXhpc3RzU3luYyhzZXJ2aWNlUGF0aCkpIHtcbiAgICAgIHVubGlua1N5bmMoc2VydmljZVBhdGgpO1xuICAgICAgcHJpbnRJbmZvKCdTZXJ2aWNlIGZpbGUgcmVtb3ZlZCcpO1xuICAgIH1cblxuICAgIC8vIFJlbG9hZCB1c2VyIHN5c3RlbWRcbiAgICBleGVjU3luYygnc3lzdGVtY3RsIC0tdXNlciBkYWVtb24tcmVsb2FkJywgeyBzdGRpbzogJ3BpcGUnIH0pO1xuXG4gICAgLy8gUmVtb3ZlIHdyYXBwZXIgc2NyaXB0XG4gICAgcmVtb3ZlVmliZXR1bm5lbFdyYXBwZXIoKTtcblxuICAgIC8vIE9wdGlvbmFsbHkgZGlzYWJsZSBsaW5nZXJpbmcgKGFzayB1c2VyKVxuICAgIGNvbnN0IHsgdXNlcm5hbWUgfSA9IGdldEN1cnJlbnRVc2VyKCk7XG4gICAgcHJpbnRJbmZvKCdOb3RlOiBVc2VyIGxpbmdlcmluZyBpcyBzdGlsbCBlbmFibGVkLiBUbyBkaXNhYmxlOicpO1xuICAgIGNvbnNvbGUubG9nKGAgIGxvZ2luY3RsIGRpc2FibGUtbGluZ2VyICR7dXNlcm5hbWV9YCk7XG5cbiAgICBwcmludFN1Y2Nlc3MoJ1ZpYmVUdW5uZWwgdXNlciBzeXN0ZW1kIHNlcnZpY2UgdW5pbnN0YWxsZWQnKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBwcmludEVycm9yKGBGYWlsZWQgdG8gdW5pbnN0YWxsIHNlcnZpY2U6ICR7ZXJyb3J9YCk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59XG5cbi8vIENoZWNrIHNlcnZpY2Ugc3RhdHVzXG5mdW5jdGlvbiBjaGVja1NlcnZpY2VTdGF0dXMoKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3RhdHVzID0gZXhlY1N5bmMoYHN5c3RlbWN0bCAtLXVzZXIgc3RhdHVzICR7U0VSVklDRV9OQU1FfWAsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KTtcbiAgICBjb25zb2xlLmxvZyhzdGF0dXMpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIHN5c3RlbWN0bCBzdGF0dXMgcmV0dXJucyBub24temVybyBmb3IgaW5hY3RpdmUgc2VydmljZXMsIHdoaWNoIGlzIG5vcm1hbFxuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmICdzdGRvdXQnIGluIGVycm9yKSB7XG4gICAgICBjb25zb2xlLmxvZyhlcnJvci5zdGRvdXQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcmludEVycm9yKGBGYWlsZWQgdG8gZ2V0IHNlcnZpY2Ugc3RhdHVzOiAke2Vycm9yfWApO1xuICAgIH1cbiAgfVxufVxuXG4vLyBDaGVjayBpZiBydW5uaW5nIGFzIHJvb3QgYW5kIHByZXZlbnQgZXhlY3V0aW9uXG5mdW5jdGlvbiBjaGVja05vdFJvb3QoKTogdm9pZCB7XG4gIGlmIChwcm9jZXNzLmdldHVpZCAmJiBwcm9jZXNzLmdldHVpZCgpID09PSAwKSB7XG4gICAgcHJpbnRFcnJvcignVGhpcyBpbnN0YWxsZXIgbXVzdCBOT1QgYmUgcnVuIGFzIHJvb3QhJyk7XG4gICAgcHJpbnRFcnJvcignVmliZVR1bm5lbCBzeXN0ZW1kIHNlcnZpY2Ugc2hvdWxkIHJ1biBhcyBhIHJlZ3VsYXIgdXNlciBmb3Igc2VjdXJpdHkuJyk7XG4gICAgcHJpbnRFcnJvcignUGxlYXNlIHJ1biB0aGlzIGNvbW1hbmQgYXMgYSByZWd1bGFyIHVzZXIgKHdpdGhvdXQgc3VkbykuJyk7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59XG5cbi8vIE1haW4gaW5zdGFsbGF0aW9uIGZ1bmN0aW9uXG5leHBvcnQgZnVuY3Rpb24gaW5zdGFsbFN5c3RlbWRTZXJ2aWNlKGFjdGlvbjogc3RyaW5nID0gJ2luc3RhbGwnKTogdm9pZCB7XG4gIC8vIFByZXZlbnQgcnVubmluZyBhcyByb290IGZvciBzZWN1cml0eVxuICBjaGVja05vdFJvb3QoKTtcblxuICBzd2l0Y2ggKGFjdGlvbikge1xuICAgIGNhc2UgJ2luc3RhbGwnOiB7XG4gICAgICBwcmludEluZm8oJ0luc3RhbGxpbmcgVmliZVR1bm5lbCB1c2VyIHN5c3RlbWQgc2VydmljZS4uLicpO1xuXG4gICAgICBjb25zdCB3cmFwcGVyUGF0aCA9IGNoZWNrVmliZXR1bm5lbEFuZENyZWF0ZVdyYXBwZXIoKTtcbiAgICAgIGluc3RhbGxTZXJ2aWNlKHdyYXBwZXJQYXRoKTtcbiAgICAgIGNvbmZpZ3VyZVNlcnZpY2UoKTtcbiAgICAgIHNob3dVc2FnZSgpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY2FzZSAndW5pbnN0YWxsJzoge1xuICAgICAgdW5pbnN0YWxsU2VydmljZSgpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY2FzZSAnc3RhdHVzJzpcbiAgICAgIGNoZWNrU2VydmljZVN0YXR1cygpO1xuICAgICAgYnJlYWs7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgY29uc29sZS5sb2coJ1VzYWdlOiB2aWJldHVubmVsIHN5c3RlbWQgW2luc3RhbGx8dW5pbnN0YWxsfHN0YXR1c10nKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIGluc3RhbGwgICAtIEluc3RhbGwgVmliZVR1bm5lbCB1c2VyIHN5c3RlbWQgc2VydmljZSAoZGVmYXVsdCknKTtcbiAgICAgIGNvbnNvbGUubG9nKCcgIHVuaW5zdGFsbCAtIFJlbW92ZSBWaWJlVHVubmVsIHVzZXIgc3lzdGVtZCBzZXJ2aWNlJyk7XG4gICAgICBjb25zb2xlLmxvZygnICBzdGF0dXMgICAgLSBDaGVjayBzZXJ2aWNlIHN0YXR1cycpO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59XG4iXX0=