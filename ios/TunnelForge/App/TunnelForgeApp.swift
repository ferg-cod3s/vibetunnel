import Observation
import SwiftUI

/// Main entry point for the TunnelForge iOS application.
/// Manages app lifecycle, scene configuration, and URL handling.
@main
struct TunnelForgeApp: App {
    @State private var connectionManager = ConnectionManager.shared
    @State private var navigationManager = NavigationManager()
    @State private var networkMonitor = NetworkMonitor.shared

    @AppStorage("colorSchemePreference")
    private var colorSchemePreferenceRaw = "system"

    init() {
        // Configure app logging level
        AppConfig.configureLogging()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(connectionManager)
                .environment(navigationManager)
                .offlineBanner()
                .onOpenURL { url in
                    handleURL(url)
                }
                .task {
                    // Initialize network monitoring
                    _ = networkMonitor
                }
                .preferredColorScheme(colorScheme)
            #if targetEnvironment(macCatalyst)
                .macCatalystWindowStyle(getStoredWindowStyle())
            #endif
        }
    }

    private var colorScheme: ColorScheme? {
        switch colorSchemePreferenceRaw {
        case "light": .light
        case "dark": .dark
        default: nil // System default
        }
    }

    #if targetEnvironment(macCatalyst)
        private func getStoredWindowStyle() -> MacWindowStyle {
            let styleRaw = UserDefaults.standard.string(forKey: "macWindowStyle") ?? "standard"
            return styleRaw == "inline" ? .inline : .standard
        }
    #endif

    private func handleURL(_ url: URL) {
        // Handle tunnelforge://session/{sessionId} URLs
        guard url.scheme == "tunnelforge" else { return }
        
        // SECURITY: Only process URL if user is authenticated and connected
        guard connectionManager.isConnected,
              connectionManager.authenticationService?.isAuthenticated ?? false else {
            Logger(category: "TunnelForgeApp").warning("Ignoring URL - user not authenticated: \(url)")
            return
        }

        if url.host == "session",
           let sessionId = url.pathComponents.last,
           !sessionId.isEmpty
        {
            // Validate session ID format (alphanumeric + hyphens only)
            let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
            guard sessionId.rangeOfCharacter(from: allowedCharacters.inverted) == nil else {
                Logger(category: "TunnelForgeApp").warning("Invalid session ID format: \(sessionId)")
                return
            }
            
            navigationManager.navigateToSession(sessionId)
        }
    }
}

/// Manages app-wide navigation state.
///
/// NavigationManager handles deep linking and programmatic navigation,
/// particularly for opening specific sessions via URL schemes.
@Observable
class NavigationManager {
    var selectedSessionId: String?
    var shouldNavigateToSession: Bool = false

    func navigateToSession(_ sessionId: String) {
        selectedSessionId = sessionId
        shouldNavigateToSession = true
    }

    func clearNavigation() {
        selectedSessionId = nil
        shouldNavigateToSession = false
    }
}
