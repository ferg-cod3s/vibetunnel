import Foundation

/// Configuration for connecting to a TunnelForge server.
///
/// ServerConfig stores all necessary information to establish
/// a connection to a TunnelForge server, including host, port,
/// optional authentication, and display name.
struct ServerConfig: Codable, Equatable {
    let host: String
    let port: Int
    let name: String?

    init(
        host: String,
        port: Int,
        name: String? = nil
    ) throws {
        // Validate host input
        let trimmedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedHost.isEmpty else {
            throw ValidationError.invalidHost("Host cannot be empty")
        }
        
        // Validate hostname/IP format
        try Self.validateHost(trimmedHost)
        
        // Validate port range
        guard port > 0 && port <= 65535 else {
            throw ValidationError.invalidPort("Port must be between 1 and 65535")
        }
        
        // Validate name if provided
        if let name = name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmedName.count <= 100 else {
                throw ValidationError.invalidName("Name must be 100 characters or less")
            }
            self.name = trimmedName
        } else {
            self.name = nil
        }
        
        self.host = trimmedHost
        self.port = port
    }
    
    /// Validation errors for server configuration
    enum ValidationError: LocalizedError {
        case invalidHost(String)
        case invalidPort(String) 
        case invalidName(String)
        
        var errorDescription: String? {
            switch self {
            case .invalidHost(let message):
                return "Invalid host: \(message)"
            case .invalidPort(let message):
                return "Invalid port: \(message)"
            case .invalidName(let message):
                return "Invalid name: \(message)"
            }
        }
    }
    
    /// Validate hostname or IP address format
    private static func validateHost(_ host: String) throws {
        // Check for dangerous characters
        let allowedCharacters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:[]%")
        guard host.unicodeScalars.allSatisfy({ allowedCharacters.contains($0) }) else {
            throw ValidationError.invalidHost("Contains invalid characters")
        }
        
        // Check for obvious injection attempts
        let dangerousPatterns = ["<", ">", "\"", "'", ";", "|", "&", "$(", "`"]
        for pattern in dangerousPatterns {
            if host.contains(pattern) {
                throw ValidationError.invalidHost("Contains potentially dangerous characters")
            }
        }
        
        // Basic length check
        guard host.count <= 253 else {
            throw ValidationError.invalidHost("Hostname too long (max 253 characters)")
        }
    }

    /// Constructs the base URL for API requests.
    ///
    /// - Returns: A URL constructed from the host and port.
    ///
    /// The URL uses HTTP protocol. If URL construction fails
    /// (which should not happen with valid host/port), returns
    /// a file URL as fallback to ensure non-nil return.
    var baseURL: URL {
        // Handle IPv6 addresses by wrapping in brackets
        var formattedHost = host

        // First, strip any existing brackets to normalize
        if formattedHost.hasPrefix("[") && formattedHost.hasSuffix("]") {
            formattedHost = String(formattedHost.dropFirst().dropLast())
        }

        // Check if this is an IPv6 address
        // IPv6 addresses must:
        // 1. Contain at least 2 colons
        // 2. Only contain valid IPv6 characters (hex digits, colons, and optionally dots for IPv4-mapped addresses)
        // 3. Not be a hostname with colons (which would contain other characters)
        let colonCount = formattedHost.count { $0 == ":" }
        let validIPv6Chars = CharacterSet(charactersIn: "0123456789abcdefABCDEF:.%")
        let isIPv6 = colonCount >= 2 && formattedHost.unicodeScalars.allSatisfy { validIPv6Chars.contains($0) }

        // Add brackets for IPv6 addresses
        if isIPv6 {
            formattedHost = "[\(formattedHost)]"
        }

        // This should always succeed with valid host and port
        // Fallback ensures we always have a valid URL
        return URL(string: "http://\(formattedHost):\(port)") ?? URL(fileURLWithPath: "/")
    }

    /// User-friendly display name for the server.
    ///
    /// Returns the custom name if set, otherwise formats
    /// the host and port as "host:port".
    var displayName: String {
        name ?? "\(host):\(port)"
    }

    /// Creates a URL for an API endpoint path.
    ///
    /// - Parameter path: The API path (e.g., "/api/sessions")
    /// - Returns: A complete URL for the API endpoint
    func apiURL(path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    /// Unique identifier for this server configuration.
    ///
    /// Used for keychain storage and identifying server instances.
    var id: String {
        "\(host):\(port)"
    }
}
