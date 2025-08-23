import AppKit
import os.log
import SwiftUI

// MARK: - CLI Installation Section

struct CLIInstallationSection: View {
    @State private var cliInstaller = CLIInstaller()
    @State private var showingTunnelforgeConflictAlert = false
    @AppStorage(AppConstants.UserDefaultsKeys.debugMode)
    private var debugMode = false

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Command Line Tool")
                            .font(.callout)
                        if cliInstaller.isInstalled {
                            if cliInstaller.isOutdated {
                                Text("Update available")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("Installed and up to date")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Text("Not installed")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    if cliInstaller.isInstalling {
                        HStack {
                            ProgressView()
                                .scaleEffect(0.7)
                            Text(cliInstaller.isUninstalling ? "Uninstalling..." : "Installing...")
                                .font(.caption)
                        }
                    } else {
                        if cliInstaller.isInstalled {
                            // Updated status
                            if cliInstaller.isOutdated {
                                HStack(spacing: 8) {
                                    Button("Update 'tunnelforge' Command") {
                                        Task {
                                            await cliInstaller.install()
                                        }
                                    }
                                    .buttonStyle(.bordered)
                                    .disabled(cliInstaller.isInstalling)

                                    Button(action: {
                                        Task {
                                            await cliInstaller.uninstall()
                                        }
                                    }, label: {
                                        Image(systemName: "trash")
                                            .font(.system(size: 14))
                                    })
                                    .buttonStyle(.plain)
                                    .foregroundColor(.red)
                                    .disabled(cliInstaller.isInstalling)
                                    .help("Uninstall CLI tool")
                                }
                            } else {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.green)
                                    Text("TunnelForge installed")
                                        .foregroundColor(.secondary)

                                    // Show reinstall button in debug mode
                                    if debugMode {
                                        Button(action: {
                                            cliInstaller.installCLITool()
                                        }, label: {
                                            Image(systemName: "arrow.clockwise.circle")
                                                .font(.system(size: 14))
                                        })
                                        .buttonStyle(.plain)
                                        .foregroundColor(.accentColor)
                                        .help("Reinstall CLI tool")
                                    }

                                    Button(action: {
                                        Task {
                                            await cliInstaller.uninstall()
                                        }
                                    }, label: {
                                        Image(systemName: "trash")
                                            .font(.system(size: 14))
                                    })
                                    .buttonStyle(.plain)
                                    .foregroundColor(.red)
                                    .disabled(cliInstaller.isInstalling)
                                    .help("Uninstall CLI tool")
                                }
                            }
                        } else {
                            Button("Install 'tunnelforge' Command") {
                                Task {
                                    await cliInstaller.install()
                                }
                            }
                            .buttonStyle(.bordered)
                            .disabled(cliInstaller.isInstalling)
                        }
                    }
                }

                if let error = cliInstaller.lastError {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                } else {
                    HStack(alignment: .center, spacing: 8) {
                        if cliInstaller.isInstalled {
                            Text("The 'tunnelforge' command line tool is installed at /usr/local/bin/tunnelforge")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("Install the 'tunnelforge' command line tool to /usr/local/bin for terminal access.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Button(action: {
                            showingTunnelforgeConflictAlert = true
                        }, label: {
                            Text("Use a different name")
                                .font(.caption)
                        })
                        .buttonStyle(.link)
                    }
                }
            }
        } header: {
            Text("Command Line Tool")
                .font(.headline)
        } footer: {
            Text(
                "Prefix any terminal command with 'tunnelforge' to enable remote control."
            )
            .font(.caption)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
        }
        .onAppear {
            cliInstaller.checkInstallationStatus()
        }
        .alert("Using a Different Command Name", isPresented: $showingTunnelforgeConflictAlert) {
            Button("OK") {}
            Button("Copy to Clipboard") {
                copyCommandToClipboard()
            }
        } message: {
            Text(tunnelforgeConflictMessage)
        }
    }

    private var tunnelforgeScriptPath: String {
        if let path = Bundle.main.path(forResource: "tunnelforge-cli", ofType: nil) {
            return path
        }
        return "/Applications/TunnelForge.app/Contents/Resources/tunnelforge-cli"
    }

    private var tunnelforgeConflictMessage: String {
        """
        You can install the `tunnelforge` bash script with a different name. For example:

        cp "\(tunnelforgeScriptPath)" /usr/local/bin/tf && chmod +x /usr/local/bin/tf
        """
    }

    private func copyCommandToClipboard() {
        let command = "cp \"\(tunnelforgeScriptPath)\" /usr/local/bin/tf && chmod +x /usr/local/bin/tf"
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(command, forType: .string)
    }
}
