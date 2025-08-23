import SwiftUI

/// Centralized color definitions for TunnelForge with forge-themed colors
enum AppColors {
    // MARK: - Primary Forge Colors
    
    /// Primary forge fire orange-red (#FF6B35)
    static var forgeFire: Color {
        Color(red: 1.0, green: 0.42, blue: 0.21) // #FF6B35
    }
    
    /// Secondary bright gold/yellow for sparks (#FFD700)
    static var forgeGold: Color {
        Color(red: 1.0, green: 0.843, blue: 0.0) // #FFD700
    }
    
    /// Background dark charcoal (#2C2C2C)
    static var darkCharcoal: Color {
        Color(red: 0.173, green: 0.173, blue: 0.173) // #2C2C2C
    }
    
    /// Accent terminal green (#00FF41)
    static var terminalGreen: Color {
        Color(red: 0.0, green: 1.0, blue: 0.255) // #00FF41
    }
    
    // MARK: - UI Element Colors (using forge theme)
    
    /// Git branch color - uses forge fire orange
    static var gitBranch: Color {
        forgeFire
    }

    /// Git changes color - uses forge gold
    static var gitChanges: Color {
        forgeGold
    }

    /// Git clean/success color - uses terminal green
    static var gitClean: Color {
        terminalGreen
    }

    /// Server running status - uses terminal green
    static var serverRunning: Color {
        terminalGreen
    }

    /// Activity indicator - uses forge fire orange
    static var activityIndicator: Color {
        forgeFire
    }

    /// Fallback colors if asset catalog colors are not defined - using forge theme
    enum Fallback {
        static func gitBranch(for colorScheme: ColorScheme) -> Color {
            // Use forge fire orange for git branches
            forgeFire
        }

        static func gitChanges(for colorScheme: ColorScheme) -> Color {
            // Use forge gold for git changes
            forgeGold
        }

        static func gitClean(for colorScheme: ColorScheme) -> Color {
            // Use terminal green for clean state
            terminalGreen
        }

        static func serverRunning(for colorScheme: ColorScheme) -> Color {
            // Use terminal green for running servers
            terminalGreen
        }

        static func activityIndicator(for colorScheme: ColorScheme) -> Color {
            // Use forge fire orange for activity
            forgeFire
        }

        static func hoverBackground(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color.gray.opacity(0.15)
                : Color.gray.opacity(0.1)
        }

        static func accentHover(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color.accentColor.opacity(0.08)
                : Color.accentColor.opacity(0.15)
        }

        static func destructive(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color.red.opacity(0.9)
                : Color.red
        }

        static func controlBackground(for colorScheme: ColorScheme) -> Color {
            Color(NSColor.controlBackgroundColor)
        }

        static func secondaryText(for colorScheme: ColorScheme) -> Color {
            Color.secondary
        }

        /// Git-specific colors using forge theme
        static func gitFolder(for colorScheme: ColorScheme) -> Color {
            // Use slightly dimmed forge fire for folders
            forgeFire.opacity(0.8)
        }

        static func gitFolderHover(for colorScheme: ColorScheme) -> Color {
            // Use full forge fire on hover
            forgeFire
        }

        static func gitModified(for colorScheme: ColorScheme) -> Color {
            // Use forge gold for modified files
            forgeGold
        }

        static func gitAdded(for colorScheme: ColorScheme) -> Color {
            // Use terminal green for added files
            terminalGreen
        }

        static func gitDeleted(for colorScheme: ColorScheme) -> Color {
            // Use forge fire for deleted files (danger/heat)
            forgeFire
        }

        static func gitUntracked(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color(red: 0.6, green: 0.6, blue: 0.6) // Gray in dark mode
                : Color(red: 0.4, green: 0.4, blue: 0.4) // Darker gray in light mode
        }

        static func gitBackground(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color.gray.opacity(0.2)
                : Color.gray.opacity(0.1)
        }

        static func gitBorder(for colorScheme: ColorScheme) -> Color {
            colorScheme == .dark
                ? Color.gray.opacity(0.3)
                : Color.gray.opacity(0.2)
        }
    }
}

/// Extension to use fallback colors when needed
extension View {
    func gitBranchColor(_ colorScheme: ColorScheme) -> Color {
        AppColors.Fallback.gitBranch(for: colorScheme)
    }

    func gitChangesColor(_ colorScheme: ColorScheme) -> Color {
        AppColors.Fallback.gitChanges(for: colorScheme)
    }

    func gitCleanColor(_ colorScheme: ColorScheme) -> Color {
        AppColors.Fallback.gitClean(for: colorScheme)
    }

    func serverRunningColor(_ colorScheme: ColorScheme) -> Color {
        AppColors.Fallback.serverRunning(for: colorScheme)
    }

    func activityIndicatorColor(_ colorScheme: ColorScheme) -> Color {
        AppColors.Fallback.activityIndicator(for: colorScheme)
    }
}
