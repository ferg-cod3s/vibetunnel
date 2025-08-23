import CryptoKit
import Darwin
import Foundation
import OSLog
import Observation

/// Server state enumeration
enum ServerState {
    case idle
    case starting
    case running
    case stopping
    case crashed
}

/// TunnelForge server implementation.
///
/// Manages the TunnelForge server as a subprocess. This implementation
/// uses the embedded Go server for optimal performance and resource efficiency.
/// It handles process lifecycle, log streaming, and error recovery.
@MainActor
@Observable
final class ServerManager {
    /// Shared singleton instance
    static let shared = ServerManager()
    
    /// Callback when the server crashes unexpectedly
    var onCrash: ((Int32) -> Void)?
    
    /// Last error that occurred during server operations
    var lastError: Error?

    // MARK: - Properties

    private var process: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var outputTask: Task<Void, Never>?
    private var errorTask: Task<Void, Never>?

    /// Server state machine - thread-safe through MainActor
    private var state: ServerState = .idle

    /// Resource cleanup tracking
    private var isCleaningUp = false

    private let logger = Logger(subsystem: BundleIdentifiers.loggerSubsystem, category: "ServerManager")
    private let serverOutput = Logger(subsystem: BundleIdentifiers.loggerSubsystem, category: "ServerOutput")

    var isRunning: Bool {
        state == .running
    }

    var port: String = {
        // Load port from UserDefaults or use default
        let storedPort = AppConstants.intValue(for: AppConstants.UserDefaultsKeys.serverPort)
        return storedPort > 0 ? String(storedPort) : String(AppConstants.Defaults.serverPort)
    }() {
        didSet {
            // Save to UserDefaults when changed
            if let portInt = Int(port), portInt > 0 {
                UserDefaults.standard.set(portInt, forKey: AppConstants.UserDefaultsKeys.serverPort)
            }
        }
    }

    var bindAddress: String = {
        // Load bind address based on dashboard access mode
        let mode = AppConstants.getDashboardAccessMode()
        return mode.bindAddress
    }() {
        didSet {
            // Update dashboard access mode when bind address changes
            if bindAddress == "127.0.0.1" {
                AppConstants.setDashboardAccessMode(.localhost)
            } else if bindAddress == "0.0.0.0" {
                AppConstants.setDashboardAccessMode(.network)
            }
        }
    }

    /// The process identifier of the running server, if available
    var processIdentifier: Int32? {
        process?.processIdentifier
    }

    /// Local authentication token for bypassing auth on localhost
    let localAuthToken: String = {
        // Generate a secure random token for this session
        let randomData = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        return randomData.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }()

    /// Get the local auth token for use in HTTP requests
    var localToken: String? {
        // Check if we're in external Go server mode
        let useExternalGoServer = AppConstants.boolValue(for: AppConstants.UserDefaultsKeys.useExternalGoServer)
        if useExternalGoServer {
            // Go server uses "no-auth-token" for local requests
            return "no-auth-token"
        }
        
        // For unified Go server, auth is typically disabled for Mac app integration
        // Check if authentication is disabled
        let authConfig = AuthConfig.current()
        if authConfig.mode == "none" {
            return nil
        }
        
        // For unified server, return nil since we disable auth via environment
        return nil
    }

    /// Get the current authentication mode
    var authMode: String {
        AuthConfig.current().mode
    }

    // MARK: - Initialization

    init() {
        // No need for log streams anymore
    }

    // MARK: - Public Methods

    func start() async throws {
        // Update state atomically using MainActor
        let currentState = state
        if currentState == .running || currentState == .starting {
            logger.warning("Server already running or starting")
            return
        }
        if currentState == .stopping {
            logger.warning("Cannot start server while stopping")
            throw ServerManagerError.invalidState
        }
        state = .starting

        defer {
            // Ensure we reset state on error
            if state == .starting {
                state = .idle
            }
        }

        guard !port.isEmpty else {
            let error = ServerManagerError.invalidPort
            logger.error("Port not configured")
            lastError = error
            throw error
        }

        // Check if we should use external Go server (bypass mode)
        let useExternalGoServer = AppConstants.boolValue(for: AppConstants.UserDefaultsKeys.useExternalGoServer)
        if useExternalGoServer {
            logger.notice("🔧 Using EXTERNAL GO SERVER on port \(self.port)")
            logger.info("Bypassing internal server startup - connecting to external Go server")
            serverOutput.notice("🔧 TunnelForge External Go Server Mode")
            serverOutput.info("Connecting to Go server on port \(self.port)")
            
            // Test connection to the external Go server
            do {
                let url = URL(string: "http://127.0.0.1:\(port)/health")!
                let (_, response) = try await URLSession.shared.data(from: url)
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    logger.info("✅ External Go server is responding on port \(self.port)")
                } else {
                    logger.warning("⚠️ External Go server responded with unexpected status")
                }
            } catch {
                logger.error("❌ Failed to connect to external Go server on port \(self.port): \(error)")
                let serverError = ServerManagerError.processFailedToStart
                lastError = serverError
                throw serverError
            }
            
            // Skip all server startup and just mark as running
            state = .running
            lastError = nil // Clear any previous errors
            logger.notice("✅ External Go server mode activated - Mac app will connect to port \(self.port)")
            return
        }

        // Check if we should use dev server
        let devConfig = DevServerConfig.current()

        if devConfig.useDevServer && !devConfig.devServerPath.isEmpty {
            logger.notice("🔧 Starting DEVELOPMENT SERVER with hot reload (pnpm run dev) on port \(self.port)")
            logger.info("Development path: \(devConfig.devServerPath)")
            serverOutput.notice("🔧 TunnelForge Development Mode - Hot reload enabled")
            serverOutput.info("Project: \(devConfig.devServerPath)")
            try await startDevServer(path: devConfig.devServerPath)
        } else {
            logger.info("Starting embedded server on port \(self.port)")
            try await startEmbeddedGoServer()
        }
    }

    private func startEmbeddedGoServer() async throws {
        // Use the embedded TunnelForge server binary (Node.js based)
        let binaryName = "tunnelforge"
        let serverType = "Embedded TunnelForge server"
        
        guard let binaryPath = Bundle.main.path(forResource: binaryName, ofType: nil) else {
            let error = ServerManagerError.binaryNotFound
            logger.error("\(binaryName) binary not found in bundle")
            lastError = error

            // Additional diagnostics for CI debugging
            logger.error("Bundle path: \(Bundle.main.bundlePath)")
            logger.error("Resources path: \(Bundle.main.resourcePath ?? "nil")")

            // List contents of Resources directory
            if let resourcesPath = Bundle.main.resourcePath {
                do {
                    let contents = try FileManager.default.contentsOfDirectory(atPath: resourcesPath)
                    logger.error("Resources directory contents: \(contents.joined(separator: ", "))")
                } catch {
                    logger.error("Failed to list Resources directory: \(error)")
                }
            }

            throw error
        }

        logger.info("Using \(serverType) executable at: \(binaryPath)")
        serverOutput.notice("🚀 Starting embedded TunnelForge server")
        serverOutput.info("Node.js-based server with web terminal capabilities")

        // Ensure binary is executable
        do {
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: binaryPath)
        } catch {
            logger.error("Failed to set executable permissions on binary: \(error.localizedDescription)")
            let serverError = ServerManagerError.binaryNotFound
            lastError = serverError
            throw serverError
        }

        // Verify binary exists and is executable
        var isDirectory: ObjCBool = false
        let fileExists = FileManager.default.fileExists(atPath: binaryPath, isDirectory: &isDirectory)
        if fileExists && !isDirectory.boolValue {
            let attributes = try FileManager.default.attributesOfItem(atPath: binaryPath)
            if let permissions = attributes[.posixPermissions] as? NSNumber,
               let fileSize = attributes[.size] as? NSNumber
            {
                logger
                    .info(
                        "tunnelforge binary size: \(fileSize.intValue) bytes, permissions: \(String(permissions.intValue, radix: 8))"
                    )
            }
        } else if !fileExists {
            logger.error("tunnelforge binary NOT FOUND at: \(binaryPath)")
        }

        // Run the Go server directly (no shell wrapper needed)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)

        // Set working directory to the Resources folder where web assets are located
        // The tunnelforge server expects to find public/ relative to its working directory
        if let resourcesPath = Bundle.main.resourcePath {
            let resourcesURL = URL(fileURLWithPath: resourcesPath).appendingPathComponent("web")
            process.currentDirectoryURL = resourcesURL
            logger.info("Process working directory: \(resourcesURL.path)")
        } else {
            // Fallback to home directory
            process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
            logger.info("Process working directory: \(process.currentDirectoryURL?.path ?? "unknown")")
        }

        // The Node.js server needs command line arguments for configuration
        logger.info("Configuring embedded server with port=\(self.port), bindAddress=\(self.bindAddress)")

        // Set up command arguments for tunnelforge
        // Pass --no-auth to disable authentication for the Mac app
        // Note: tunnelforge doesn't support --host, it uses environment variables for that
        process.arguments = ["--port", self.port, "--no-auth"]

        // Set up a termination handler for logging
        process.terminationHandler = { [weak self] process in
            self?.logger.info("TunnelForge server process terminated with status: \(process.terminationStatus)")
        }

        logger.info("Executing embedded TunnelForge server")
        logger.info("Binary location: \(binaryPath)")
        logger.info("Server configuration: port=\(self.port), bindAddress=\(self.bindAddress)")

        // Set up environment for the server
        var environment = ProcessInfo.processInfo.environment

        // Configure TunnelForge server via environment variables
        environment["PORT"] = self.port
        environment["HOST"] = self.bindAddress
        environment["AUTH_REQUIRED"] = "false" // Disable auth for Mac app integration
        environment["ENABLE_RATE_LIMIT"] = "false" // Disable rate limiting for Mac app
        environment["ENABLE_REQUEST_LOG"] = "false" // Reduce noise in logs
        environment["PERSISTENCE_ENABLED"] = "true" // Enable session persistence
        environment["SERVER_NAME"] = "TunnelForge Mac App Server" // Identify as Mac app server
        
        // Set the path to web assets
        if let staticPath = getStaticFilesPath() {
            environment["PUBLIC_PATH"] = staticPath
            logger.info("Setting PUBLIC_PATH to: \(staticPath)")
        } else {
            logger.warning("Could not determine static files path")
        }
        
        // Add authentication configuration
        let authConfig = AuthConfig.current()
        logger.info("Configuring authentication mode: \(authConfig.mode)")
        
        switch authConfig.mode {
        case "none":
            environment["AUTH_REQUIRED"] = "false"
        case "ssh":
            environment["AUTH_REQUIRED"] = "true"
            // Add SSH-specific config if needed
        case "both", "os", _:
            environment["AUTH_REQUIRED"] = "false" // For Mac app, keep simple for now
        }
        
        logger.info("TunnelForge server environment: PORT=\(self.port), HOST=\(self.bindAddress), AUTH_REQUIRED=\(environment["AUTH_REQUIRED"] ?? "false")")
        serverOutput.info("Server ready to handle terminal sessions")

        process.environment = environment

        // Set up pipes for stdout and stderr
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        self.process = process
        self.stdoutPipe = stdoutPipe
        self.stderrPipe = stderrPipe

        // Start monitoring output
        startOutputMonitoring()

        do {
            // Start the process with parent termination handling
            try await process.runWithParentTerminationAsync()

            logger.info("TunnelForge server process started")

            // Give the process a moment to start before checking for early failures
            try await Task.sleep(for: .milliseconds(500))

            // Check if process exited immediately (indicating failure)
            if !process.isRunning {
                let exitCode = process.terminationStatus

                // Special handling for specific exit codes
                if exitCode == 126 {
                    logger.error("Process exited immediately: Command not executable (exit code: 126)")
                    throw ServerManagerError.binaryNotFound
                } else if exitCode == 9 {
                    logger.error("Process exited immediately: Port \(self.port) is already in use (exit code: 9)")
                } else {
                    logger.error("Process exited immediately with code: \(exitCode)")
                }

                // Try to read any error output
                var errorDetails = "Exit code: \(exitCode)"
                if let stderrPipe = self.stderrPipe {
                    do {
                        if let errorData = try stderrPipe.fileHandleForReading.readToEnd(),
                           !errorData.isEmpty
                        {
                            let errorOutput = String(bytes: errorData, encoding: .utf8) ?? "<Invalid UTF-8>"
                            errorDetails += "\nError: \(errorOutput.trimmingCharacters(in: .whitespacesAndNewlines))"
                        }
                    } catch {
                        logger.debug("Could not read stderr: \(error.localizedDescription)")
                    }
                }

                logger.error("Server failed to start: \(errorDetails)")
                let serverError = ServerManagerError.processFailedToStart
                lastError = serverError
                throw serverError
            }

            // Mark server as running only after successful start
            state = .running
            lastError = nil // Clear any previous errors

            logger.info("TunnelForge server process started successfully")
            serverOutput.notice("✅ Embedded TunnelForge server is running")
            serverOutput.info("Server ready to accept connections")

            // Monitor process termination
            Task {
                await monitorProcessTermination()
            }
        } catch {
            // Log more detailed error information
            let errorMessage: String = if let bunError = error as? ServerManagerError {
                bunError.localizedDescription
            } else if let urlError = error as? URLError {
                "Network error: \(urlError.localizedDescription) (Code: \(urlError.code.rawValue))"
            } else if let posixError = error as? POSIXError {
                "System error: \(posixError.localizedDescription) (Code: \(posixError.code.rawValue))"
            } else {
                error.localizedDescription
            }

            logger.error("Failed to start TunnelForge server: \(errorMessage)")
            lastError = error
            throw error
        }
    }

    private func startDevServer(path: String) async throws {
        let devServerManager = DevServerManager.shared
        let expandedPath = devServerManager.expandedPath(for: path)

        // Validate the path first
        let validation = devServerManager.validate(path: path)
        guard validation.isValid else {
            let error = ServerManagerError.devServerInvalid(validation.errorMessage ?? "Invalid dev server path")
            logger.error("Dev server validation failed: \(error.localizedDescription)")
            lastError = error
            throw error
        }

        // Create the process using login shell
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")

        // Set working directory to the web project
        process.currentDirectoryURL = URL(fileURLWithPath: expandedPath)
        logger.info("Dev server working directory: \(expandedPath)")

        // Get authentication mode
        let authConfig = AuthConfig.current()

        // Build the dev server arguments
        var effectiveBindAddress = bindAddress

        // Check if Tailscale Serve is enabled and force localhost binding
        let tailscaleServeEnabled = UserDefaults.standard
            .bool(forKey: AppConstants.UserDefaultsKeys.tailscaleServeEnabled)
        if tailscaleServeEnabled && bindAddress == "0.0.0.0" {
            logger.warning("Overriding bind address to localhost for Tailscale Serve security")
            effectiveBindAddress = "127.0.0.1"
        }

        let devArgs = devServerManager.buildDevServerArguments(
            port: port,
            bindAddress: effectiveBindAddress,
            authMode: authConfig.mode,
            localToken: localToken
        )

        // Find pnpm executable
        guard let pnpmPath = devServerManager.findPnpmPath() else {
            let error = ServerManagerError.devServerInvalid("pnpm executable not found")
            logger.error("Failed to find pnpm executable")
            lastError = error
            throw error
        }

        logger.info("Using pnpm at: \(pnpmPath)")

        // Create wrapper to run pnpm with parent death monitoring AND crash detection
        let parentPid = ProcessInfo.processInfo.processIdentifier
        let pnpmDir = URL(fileURLWithPath: pnpmPath).deletingLastPathComponent().path
        let pnpmCommand = """
        # Change to the project directory
        cd '\(expandedPath)'

        # Add pnpm to PATH for the dev script
        export PATH="\(pnpmDir):$PATH"

        # Start pnpm dev in background
        # We'll use pkill later to ensure all related processes are terminated
        \(pnpmPath) \(devArgs.joined(separator: " ")) &
        PNPM_PID=$!

        # Monitor both parent process AND pnpm process
        while kill -0 \(parentPid) 2>/dev/null && kill -0 $PNPM_PID 2>/dev/null; do
            sleep 1
        done

        # Check why we exited the loop
        if ! kill -0 $PNPM_PID 2>/dev/null; then
            # Pnpm died - wait to get its exit code
            wait $PNPM_PID
            EXIT_CODE=$?
            echo "🔴 Development server crashed with exit code: $EXIT_CODE" >&2
            echo "Check 'pnpm run dev' output above for errors" >&2
            exit $EXIT_CODE
        else
            # Parent died - kill pnpm and all its children
            echo "🛑 TunnelForge is shutting down, stopping development server..." >&2

            # First try to kill pnpm gracefully
            kill -TERM $PNPM_PID 2>/dev/null

            # Give it a moment to clean up
            sleep 0.5

            # If still running, force kill
            if kill -0 $PNPM_PID 2>/dev/null; then
                kill -KILL $PNPM_PID 2>/dev/null
            fi

            # Also kill any node processes that might have been spawned
            # This ensures we don't leave orphaned processes
            pkill -P $PNPM_PID 2>/dev/null || true

            wait $PNPM_PID 2>/dev/null
            exit 0
        fi
        """
        process.arguments = ["-l", "-c", pnpmCommand]

        // Set up a termination handler for logging
        process.terminationHandler = { [weak self] process in
            self?.logger.info("Dev server process terminated with status: \(process.terminationStatus)")
            self?.serverOutput.notice("🛑 Development server stopped")
        }

        logger.info("Executing command: /bin/zsh -l -c \"\(pnpmCommand)\"")
        logger.info("Working directory: \(expandedPath)")
        logger.info("Dev server configuration: port=\(self.port), bindAddress=\(self.bindAddress)")

        // Set up environment for dev server
        var environment = ProcessInfo.processInfo.environment
        // Add Node.js memory settings
        environment["NODE_OPTIONS"] = "--max-old-space-size=4096 --max-semi-space-size=128"

        // Always set NODE_ENV to development for dev server to ensure caching is disabled
        environment["NODE_ENV"] = "development"
        logger.info("Dev server mode - setting NODE_ENV=development to disable caching")

        // Add pnpm to PATH so that scripts can use it
        // pnpmDir is already defined above
        if let existingPath = environment[EnvironmentKeys.path] {
            environment[EnvironmentKeys.path] = "\(pnpmDir):\(existingPath)"
        } else {
            environment[EnvironmentKeys.path] = pnpmDir
        }
        logger.info("Added pnpm directory to PATH: \(pnpmDir)")

        process.environment = environment

        // Set up pipes for stdout and stderr
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        self.process = process
        self.stdoutPipe = stdoutPipe
        self.stderrPipe = stderrPipe

        // Start monitoring output
        startOutputMonitoring()

        do {
            // Start the process with parent termination handling
            try await process.runWithParentTerminationAsync()

            logger.info("Dev server process started")

            // Output a clear banner in the server logs
            serverOutput.notice("")
            serverOutput.notice("==========================================")
            serverOutput.notice("🔧 DEVELOPMENT MODE ACTIVE")
            serverOutput.notice("------------------------------------------")
            serverOutput.notice("Hot reload enabled - changes auto-refresh")
            serverOutput.notice("Project: \(expandedPath, privacy: .public)")
            serverOutput.notice("Port: \(self.port, privacy: .public)")
            serverOutput.notice("==========================================")
            serverOutput.notice("")

            // Give the process a moment to start before checking for early failures
            try await Task.sleep(for: .milliseconds(500)) // Dev server takes longer to start

            // Check if process exited immediately (indicating failure)
            if !process.isRunning {
                let exitCode = process.terminationStatus
                logger.error("Dev server process exited immediately with code: \(exitCode)")

                // Try to read any error output
                var errorDetails = "Exit code: \(exitCode)"
                if let stderrPipe = self.stderrPipe {
                    do {
                        if let errorData = try stderrPipe.fileHandleForReading.readToEnd(),
                           !errorData.isEmpty
                        {
                            let errorOutput = String(bytes: errorData, encoding: .utf8) ?? "<Invalid UTF-8>"
                            errorDetails += "\nError: \(errorOutput.trimmingCharacters(in: .whitespacesAndNewlines))"
                        }
                    } catch {
                        logger.debug("Could not read stderr: \(error.localizedDescription)")
                    }
                }

                logger.error("Dev server failed to start: \(errorDetails)")
                let serverError = ServerManagerError.processFailedToStart
                lastError = serverError
                throw serverError
            }

            // Mark server as running only after successful start
            state = .running
            lastError = nil // Clear any previous errors

            logger.notice("✅ Development server started successfully with hot reload")
            serverOutput.notice("🔧 Development server is running - changes will auto-reload")

            // Monitor process termination
            Task {
                await monitorProcessTermination()
            }
        } catch {
            // Log more detailed error information
            logger.error("Failed to start dev server: \(error.localizedDescription)")
            lastError = error
            throw error
        }
    }

    func stop() async {
        // Update state atomically using MainActor
        switch state {
        case .running, .crashed:
            break // Continue with stop
        default:
            logger.warning("Bun server not running (state: \(String(describing: self.state)))")
            return
        }

        // Prevent concurrent cleanup
        if isCleaningUp {
            logger.warning("Already cleaning up server")
            return
        }

        state = .stopping
        isCleaningUp = true

        defer {
            state = .idle
            isCleaningUp = false
        }

        // Check if we're in external Go server mode
        let useExternalGoServer = AppConstants.boolValue(for: AppConstants.UserDefaultsKeys.useExternalGoServer)
        if useExternalGoServer {
            logger.info("External Go server mode - no process to stop")
            return
        }

        guard let process else {
            logger.warning("No process to stop")
            await performCleanup()
            return
        }

        logger.info("Stopping TunnelForge server")

        // Cancel output monitoring tasks
        outputTask?.cancel()
        errorTask?.cancel()

        // Close pipes to trigger EOF in monitors
        if let pipe = self.stdoutPipe {
            try? pipe.fileHandleForReading.close()
        }
        if let pipe = self.stderrPipe {
            try? pipe.fileHandleForReading.close()
        }

        // Give tasks a moment to complete
        try? await Task.sleep(for: .milliseconds(100))

        // Terminate the process
        await process.terminateAsync()

        // Wait for process to terminate (with timeout)
        let terminated = await process.waitUntilExitWithTimeout(seconds: 5)

        if !terminated {
            // Force kill if termination timeout
            process.interrupt()
            logger.warning("Force killed TunnelForge server after timeout")
        }

        // Clean up
        await performCleanup()

        logger.info("TunnelForge server stopped")
    }

    func restart() async throws {
        logger.info("Restarting TunnelForge server")
        await stop()
        try await start()
    }

    func checkHealth() async -> Bool {
        guard let process else { return false }
        return process.isRunning
    }

    func getStaticFilesPath() -> String? {
        guard let resourcesPath = Bundle.main.resourcePath else { return nil }
        // Updated path for TunnelForge web assets
        return URL(fileURLWithPath: resourcesPath).appendingPathComponent("web/public").path
    }

    func cleanup() async {
        await stop()
    }

    /// Get current server state
    func getState() -> ServerState {
        state
    }

    /// Backward compatibility property for tests
    /// Returns self when server is running, nil otherwise
    var bunServer: ServerManager? {
        return isRunning ? self : nil
    }

    // MARK: - Private Methods

    /// Perform cleanup of all resources
    private func performCleanup() async {
        self.process = nil
        self.stdoutPipe = nil
        self.stderrPipe = nil
        self.outputTask = nil
        self.errorTask = nil
    }

    private func startOutputMonitoring() {
        // Capture pipes and port before starting detached tasks
        guard let stdoutPipe = self.stdoutPipe,
              let stderrPipe = self.stderrPipe
        else {
            logger.warning("No pipes available for monitoring")
            return
        }

        let currentPort = self.port

        // Create a sendable reference for logging
        let logHandler = LogHandler()

        // Monitor stdout on background thread with DispatchSource
        outputTask = Task.detached { [logHandler] in
            let pipe = stdoutPipe

            let handle = pipe.fileHandleForReading
            let source = DispatchSource.makeReadSource(fileDescriptor: handle.fileDescriptor)

            let logger = Logger(subsystem: BundleIdentifiers.loggerSubsystem, category: "ServerManager")
            logger.debug("Starting stdout monitoring for TunnelForge server on port \(currentPort)")

            // Create a cancellation handler
            let cancelSource = {
                source.cancel()
                try? handle.close()
            }

            source.setEventHandler { [logHandler] in
                // Read data in a non-blocking way to prevent hangs on large output
                var buffer = Data()
                let maxBytesPerRead = 65_536 // 64KB chunks

                // Read available data without blocking
                while true {
                    var readBuffer = Data(count: maxBytesPerRead)
                    let bytesRead = readBuffer.withUnsafeMutableBytes { bytes in
                        guard let baseAddress = bytes.baseAddress else {
                            logger.error("Failed to get base address for read buffer")
                            return -1
                        }
                        return Darwin.read(handle.fileDescriptor, baseAddress, maxBytesPerRead)
                    }

                    if bytesRead > 0 {
                        buffer.append(readBuffer.prefix(bytesRead))

                        // Check if more data is immediately available
                        var pollfd = pollfd(fd: handle.fileDescriptor, events: Int16(POLLIN), revents: 0)
                        let pollResult = poll(&pollfd, 1, 0) // 0 timeout = non-blocking

                        if pollResult <= 0 || (pollfd.revents & Int16(POLLIN)) == 0 {
                            break // No more data immediately available
                        }
                    } else if bytesRead == 0 {
                        // EOF reached
                        cancelSource()
                        return
                    } else {
                        // Error occurred
                        if errno != EAGAIN && errno != EWOULDBLOCK {
                            logger.error("Read error on stdout: \(String(cString: strerror(errno)))")
                            cancelSource()
                            return
                        }
                        break // No data available right now
                    }
                }

                // Process accumulated data
                if !buffer.isEmpty {
                    // Simply use the built-in lossy conversion instead of manual filtering
                    let output = String(bytes: buffer, encoding: .utf8) ?? "<Invalid UTF-8>"
                    Self.processOutputStatic(output, logHandler: logHandler, isError: false)
                }
            }

            source.setCancelHandler {
                logger.debug("Stopped stdout monitoring for TunnelForge server")
            }

            source.activate()

            // Keep the task alive until cancelled
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
            }

            cancelSource()
        }

        // Monitor stderr on background thread with DispatchSource
        errorTask = Task.detached { [logHandler] in
            let pipe = stderrPipe

            let handle = pipe.fileHandleForReading
            let source = DispatchSource.makeReadSource(fileDescriptor: handle.fileDescriptor)

            let logger = Logger(subsystem: BundleIdentifiers.loggerSubsystem, category: "ServerManager")
            logger.debug("Starting stderr monitoring for TunnelForge server on port \(currentPort)")

            // Create a cancellation handler
            let cancelSource = {
                source.cancel()
                try? handle.close()
            }

            source.setEventHandler { [logHandler] in
                // Read data in a non-blocking way to prevent hangs on large output
                var buffer = Data()
                let maxBytesPerRead = 65_536 // 64KB chunks

                // Read available data without blocking
                while true {
                    var readBuffer = Data(count: maxBytesPerRead)
                    let bytesRead = readBuffer.withUnsafeMutableBytes { bytes in
                        guard let baseAddress = bytes.baseAddress else {
                            logger.error("Failed to get base address for read buffer")
                            return -1
                        }
                        return Darwin.read(handle.fileDescriptor, baseAddress, maxBytesPerRead)
                    }

                    if bytesRead > 0 {
                        buffer.append(readBuffer.prefix(bytesRead))

                        // Check if more data is immediately available
                        var pollfd = pollfd(fd: handle.fileDescriptor, events: Int16(POLLIN), revents: 0)
                        let pollResult = poll(&pollfd, 1, 0) // 0 timeout = non-blocking

                        if pollResult <= 0 || (pollfd.revents & Int16(POLLIN)) == 0 {
                            break // No more data immediately available
                        }
                    } else if bytesRead == 0 {
                        // EOF reached
                        cancelSource()
                        return
                    } else {
                        // Error occurred
                        if errno != EAGAIN && errno != EWOULDBLOCK {
                            logger.error("Read error on stderr: \(String(cString: strerror(errno)))")
                            cancelSource()
                            return
                        }
                        break // No data available right now
                    }
                }

                // Process accumulated data
                if !buffer.isEmpty {
                    // Simply use the built-in lossy conversion instead of manual filtering
                    let output = String(bytes: buffer, encoding: .utf8) ?? "<Invalid UTF-8>"
                    Self.processOutputStatic(output, logHandler: logHandler, isError: true)
                }
            }

            source.setCancelHandler {
                logger.debug("Stopped stderr monitoring for TunnelForge server")
            }

            source.activate()

            // Keep the task alive until cancelled
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
            }

            cancelSource()
        }
    }

    private func logServerOutput(_ line: String, isError: Bool) {
        let lowercased = line.lowercased()

        if isError || lowercased.contains("error") || lowercased.contains("failed") || lowercased.contains("fatal") {
            serverOutput.error("\(line, privacy: .public)")
        } else if lowercased.contains("warn") || lowercased.contains("warning") {
            serverOutput.warning("\(line, privacy: .public)")
        } else if lowercased.contains("debug") || lowercased.contains("verbose") {
            serverOutput.debug("\(line, privacy: .public)")
        } else {
            serverOutput.info("\(line, privacy: .public)")
        }
    }

    private func withTimeoutOrNil<T: Sendable>(
        seconds: TimeInterval,
        operation: @escaping @Sendable () async -> T
    )
        async -> T?
    {
        await withTaskGroup(of: T?.self) { group in
            group.addTask {
                await operation()
            }

            group.addTask {
                try? await Task.sleep(for: .seconds(seconds))
                return nil
            }

            for await result in group {
                group.cancelAll()
                return result
            }

            return nil
        }
    }

    private func monitorProcessTermination() async {
        // Capture process reference to avoid race conditions
        guard let process = self.process else { return }

        // Wait for process exit
        await process.waitUntilExitAsync()

        // Check if process is still valid before accessing terminationStatus
        guard self.process != nil else {
            logger.warning("Process was deallocated during termination monitoring")
            return
        }
        
        let exitCode = process.terminationStatus

        // Check current state
        let currentState = state
        let wasRunning = currentState == .running
        if wasRunning {
            state = .crashed
        }

        if wasRunning {
            // Unexpected termination
            let devConfig = DevServerConfig.current()
            let serverType = devConfig.useDevServer ? "Development server (pnpm run dev)" : "Production server"

            self.logger.error("\(serverType) terminated unexpectedly with exit code: \(exitCode)")

            if devConfig.useDevServer {
                self.serverOutput.error("🔴 Development server crashed (exit code: \(exitCode))")
                self.serverOutput.error("Check the output above for error details")
            }

            // Clean up process reference
            self.process = nil

            // Notify about the crash
            if let onCrash = self.onCrash {
                self.logger.info("Notifying ServerManager about server crash")
                onCrash(exitCode)
            }
        } else {
            // Normal termination
            let devConfig = DevServerConfig.current()
            let serverType = devConfig.useDevServer ? "Development server" : "Production server"
            self.logger.info("\(serverType) terminated normally with exit code: \(exitCode)")
        }
    }

    // MARK: - HTTP Request Methods
    
    /// Build a URL for the given endpoint with optional query parameters
    func buildURL(endpoint: String, queryItems: [URLQueryItem]? = nil) -> URL? {
        var components = URLComponents()
        components.scheme = "http"
        components.host = bindAddress
        components.port = Int(port)
        components.path = endpoint
        components.queryItems = queryItems
        
        return components.url
    }
    
    /// Perform an HTTP request and decode the response
    func performRequest<T: Codable, B: Encodable>(
        endpoint: String,
        method: String = "GET",
        body: B? = nil,
        responseType: T.Type,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        guard let url = buildURL(endpoint: endpoint, queryItems: queryItems) else {
            throw ServerManagerError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add authentication token if available
        if let token = localToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Add request body if provided
        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                throw ServerManagerError.encodingError(error)
            }
        }
        
        // Perform the request
        let (data, response) = try await URLSession.shared.data(for: request)
        
        // Check HTTP status code
        if let httpResponse = response as? HTTPURLResponse {
            guard 200...299 ~= httpResponse.statusCode else {
                throw ServerManagerError.httpError(httpResponse.statusCode)
            }
        }
        
        // Decode the response
        do {
            return try JSONDecoder().decode(responseType, from: data)
        } catch {
            throw ServerManagerError.decodingError(error)
        }
    }
    
    /// Perform an HTTP request and decode the response (no body)
    func performRequest<T: Codable>(
        endpoint: String,
        method: String = "GET",
        responseType: T.Type,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        return try await performRequest(
            endpoint: endpoint, 
            method: method, 
            body: Optional<String>.none, 
            responseType: responseType, 
            queryItems: queryItems
        )
    }

    /// Perform an HTTP request without expecting a response body
    func performVoidRequest<B: Encodable>(
        endpoint: String,
        method: String = "GET",
        body: B? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws {
        guard let url = buildURL(endpoint: endpoint, queryItems: queryItems) else {
            throw ServerManagerError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add authentication token if available
        if let token = localToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Add request body if provided
        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                throw ServerManagerError.encodingError(error)
            }
        }
        
        // Perform the request
        let (_, response) = try await URLSession.shared.data(for: request)
        
        // Check HTTP status code
        if let httpResponse = response as? HTTPURLResponse {
            guard 200...299 ~= httpResponse.statusCode else {
                throw ServerManagerError.httpError(httpResponse.statusCode)
            }
        }
    }
    
    /// Perform an HTTP request without expecting a response body (no body)
    func performVoidRequest(
        endpoint: String,
        method: String = "GET",
        queryItems: [URLQueryItem]? = nil
    ) async throws {
        return try await performVoidRequest(
            endpoint: endpoint, 
            method: method, 
            body: Optional<String>.none, 
            queryItems: queryItems
        )
    }
    
    // MARK: - Utilities
}

// MARK: - Errors

enum ServerManagerError: LocalizedError, Equatable {
    case binaryNotFound
    case processFailedToStart
    case invalidPort
    case invalidState
    case devServerInvalid(String)
    case invalidURL
    case encodingError(Error)
    case decodingError(Error)
    case httpError(Int)
    
    static func == (lhs: ServerManagerError, rhs: ServerManagerError) -> Bool {
        switch (lhs, rhs) {
        case (.binaryNotFound, .binaryNotFound),
             (.processFailedToStart, .processFailedToStart),
             (.invalidPort, .invalidPort),
             (.invalidState, .invalidState),
             (.invalidURL, .invalidURL):
            return true
        case (.devServerInvalid(let lhsReason), .devServerInvalid(let rhsReason)):
            return lhsReason == rhsReason
        case (.encodingError, .encodingError),
             (.decodingError, .decodingError):
            return true
        case (.httpError(let lhsCode), .httpError(let rhsCode)):
            return lhsCode == rhsCode
        default:
            return false
        }
    }

    var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            "The TunnelForge server binary was not found in the app bundle"
        case .processFailedToStart:
            "The server process failed to start"
        case .invalidPort:
            "Server port is not configured"
        case .invalidState:
            "Server is in an invalid state for this operation"
        case .devServerInvalid(let reason):
            "Dev server configuration invalid: \(reason)"
        case .invalidURL:
            "Failed to construct valid URL"
        case .encodingError(let error):
            "Failed to encode request: \(error.localizedDescription)"
        case .decodingError(let error):
            "Failed to decode response: \(error.localizedDescription)"
        case .httpError(let statusCode):
            "HTTP error \(statusCode)"
        }
    }
}

// MARK: - Private Output Processing

extension ServerManager {
    /// Process output with chunking for large lines and rate limiting awareness
    fileprivate nonisolated static func processOutputStatic(_ output: String, logHandler: LogHandler, isError: Bool) {
        let maxLineLength = 4_096 // Max chars per log line to avoid os.log truncation
        let lines = output.trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .newlines)

        for line in lines where !line.isEmpty {
            // Skip shell initialization messages
            if line.contains("zsh:") || line.hasPrefix("Last login:") {
                continue
            }

            // If line is too long, chunk it to avoid os.log limits
            if line.count > maxLineLength {
                // Log that we're chunking a large line
                logHandler.log("[Large output: \(line.count) chars, chunking...]", isError: isError)

                // Chunk the line
                var startIndex = line.startIndex
                var chunkNumber = 1
                while startIndex < line.endIndex {
                    let endIndex = line.index(startIndex, offsetBy: maxLineLength, limitedBy: line.endIndex) ?? line
                        .endIndex
                    let chunk = String(line[startIndex..<endIndex])
                    logHandler.log("[Chunk \(chunkNumber)] \(chunk)", isError: isError)
                    startIndex = endIndex
                    chunkNumber += 1

                    // Add small delay between chunks to avoid rate limiting
                    if chunkNumber.isMultiple(of: 10) {
                        usleep(1_000) // 1ms delay every 10 chunks
                    }
                }
            } else {
                // Log normally
                logHandler.log(line, isError: isError)
            }
        }
    }
}

// MARK: - LogHandler

/// A sendable log handler for use in detached tasks
private final class LogHandler: Sendable {
    private let serverOutput = Logger(subsystem: BundleIdentifiers.loggerSubsystem, category: "ServerOutput")

    func log(_ line: String, isError: Bool) {
        let lowercased = line.lowercased()

        if isError || lowercased.contains("error") || lowercased.contains("failed") || lowercased.contains("fatal") {
            serverOutput.error("\(line, privacy: .public)")
        } else if lowercased.contains("warn") || lowercased.contains("warning") {
            serverOutput.warning("\(line, privacy: .public)")
        } else if lowercased.contains("debug") || lowercased.contains("verbose") {
            serverOutput.debug("\(line, privacy: .public)")
        } else {
            serverOutput.info("\(line, privacy: .public)")
        }
    }
}
