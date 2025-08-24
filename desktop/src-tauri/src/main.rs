// TunnelForge Desktop - Cross-Platform Tauri v2 Application
// This manages the Bun-based TunnelForge server and provides a native desktop interface.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, Emitter};
use log::{info, error};
use tauri_plugin_log::{Target, TargetKind};

// Application state
struct AppState {
    server_process: Arc<Mutex<Option<Child>>>,
    server_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerStatus {
    running: bool,
    port: u16,
    pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogEntry {
    timestamp: String,
    level: String,
    message: String,
}

// Tauri commands
#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server_process = state.server_process.lock().unwrap();
    
    let status = match &*server_process {
        Some(child) => {
            // Check if the process is still alive
            let running = is_server_running(state.server_port);
            add_log_entry("debug", &format!("Server process PID {} running: {}", child.id(), running));
            
            ServerStatus {
                running,
                port: state.server_port,
                pid: Some(child.id()),
            }
        }
        None => {
            // Check if server is running externally
            let running = is_server_running(state.server_port);
            if running {
                add_log_entry("info", "Server running externally (not managed by this app)");
            }
            
            ServerStatus {
                running,
                port: state.server_port,
                pid: None,
            }
        },
    };
    
    Ok(status)
}

#[tauri::command]
async fn start_server(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    add_log_entry("info", "Starting server...");
    start_server_internal(&state, &app)
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<(), String> {
    add_log_entry("info", "Stopping server...");
    stop_server_internal(&state)
}

#[tauri::command]
async fn restart_server(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    add_log_entry("info", "Restarting server...");
    
    // Stop current server
    if let Err(e) = stop_server_internal(&state) {
        add_log_entry("error", &format!("Failed to stop server: {}", e));
        return Err(e);
    }
    
    // Wait a moment
    add_log_entry("debug", "Waiting for server to shutdown...");
    thread::sleep(Duration::from_millis(1000));
    
    // Start new server
    if let Err(e) = start_server_internal(&state, &app) {
        add_log_entry("error", &format!("Failed to start server: {}", e));
        return Err(e);
    }
    
    add_log_entry("info", "Server restarted successfully");
    Ok(())
}

#[tauri::command]
async fn get_server_url(state: State<'_, AppState>) -> Result<String, String> {
    let url = format!("http://localhost:{}", state.server_port);
    add_log_entry("debug", &format!("Returning server URL: {}", url));
    Ok(url)
}

#[tauri::command]
async fn show_notification(_title: String, _message: String) -> Result<(), String> {
    // Use Tauri v2 notification plugin
    Ok(())
}

#[tauri::command]
async fn check_cli_installation() -> Result<bool, String> {
    // Check if tunnelforge CLI is installed
    let paths = vec![
        "/usr/local/bin/tunnelforge",
        "/opt/homebrew/bin/tunnelforge",
    ];
    
    for path in paths {
        if Path::new(path).exists() {
            return Ok(true);
        }
    }
    
    Ok(false)
}

#[tauri::command]
async fn install_cli_tool() -> Result<(), String> {
    info!("Installing CLI tool...");
    
    #[cfg(target_os = "macos")]
    {
        // For now, we'll create a simple shell script that connects to the local server
        // In a production app, this would download the actual TunnelForge CLI
        
        let install_path = "/usr/local/bin/tunnelforge";
        
        // Create a simple CLI script content
        let cli_script_content = r#"#!/bin/bash
# TunnelForge CLI (Desktop App Version)
# This is a simple wrapper that connects to the TunnelForge server

case "$1" in
    "start")
        echo "Starting TunnelForge session..."
        curl -s "http://localhost:4021/api/sessions" | head -5
        ;;
    "list")
        echo "Active TunnelForge sessions:"
        curl -s "http://localhost:4021/api/sessions" 2>/dev/null || echo "Server not running on localhost:4021"
        ;;
    "join")
        if [ -z "$2" ]; then
            echo "Usage: tunnelforge join <session-id>"
            exit 1
        fi
        echo "Joining session $2..."
        open "http://localhost:4021/session/$2"
        ;;
    *)
        echo "TunnelForge CLI (Desktop Version)"
        echo "Usage:"
        echo "  tunnelforge start     - Start a new session"
        echo "  tunnelforge list      - List active sessions"
        echo "  tunnelforge join <id> - Join a session"
        ;;
esac
"#;
        
        // Write the script to a temporary file first
        let temp_path = "/tmp/tunnelforge_cli_install";
        std::fs::write(temp_path, cli_script_content)
            .map_err(|e| format!("Failed to create temporary CLI script: {}", e))?;
        
        // Install with administrator privileges
        let status = Command::new("osascript")
            .arg("-e")
            .arg(format!(
                "do shell script \"cp '{}' '{}' && chmod +x '{}' && rm '{}'\" with administrator privileges",
                temp_path,
                install_path,
                install_path,
                temp_path
            ))
            .status()
            .map_err(|e| format!("Failed to execute install command: {}", e))?;
            
        if status.success() {
            info!("CLI tool installed successfully to {}", install_path);
            Ok(())
        } else {
            error!("CLI installation failed or was cancelled by user");
            Err("CLI installation failed or was cancelled by user".to_string())
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows implementation would go here
        Err("CLI installation is not yet supported on Windows".to_string())
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux implementation would go here  
        Err("CLI installation is not yet supported on Linux".to_string())
    }
}

#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

// Global log buffer for storing runtime logs
static LOG_BUFFER: std::sync::Mutex<Vec<LogEntry>> = std::sync::Mutex::new(Vec::new());

// Add a log entry to the buffer
fn add_log_entry(level: &str, message: &str) {
    let entry = LogEntry {
        timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
        level: level.to_string(),
        message: message.to_string(),
    };
    
    if let Ok(mut buffer) = LOG_BUFFER.lock() {
        buffer.push(entry);
        // Keep only the last 200 entries
        if buffer.len() > 200 {
            buffer.remove(0);
        }
    }
}

#[tauri::command]
async fn get_backend_logs(limit: Option<usize>) -> Result<Vec<LogEntry>, String> {
    info!("Getting backend logs with limit: {:?}", limit);
    
    let mut logs = if let Ok(buffer) = LOG_BUFFER.lock() {
        buffer.clone()
    } else {
        add_log_entry("error", "Failed to access log buffer");
        vec![LogEntry {
            timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
            level: "error".to_string(),
            message: "Failed to access log buffer".to_string(),
        }]
    };
    
    // Apply limit if specified
    if let Some(limit) = limit {
        let start = if logs.len() > limit { logs.len() - limit } else { 0 };
        logs = logs[start..].to_vec();
    }
    
    info!("Returning {} log entries", logs.len());
    Ok(logs)
}

// fn parse_log_line(line: &str) -> Option<LogEntry> {
//     // Simple parsing for log lines
//     // Expected format: "2023-12-07T10:30:45.123Z [INFO] message"
    
//     if line.is_empty() {
//         return None;
//     }
    
//     // Find the level in brackets
//     if let Some(start) = line.find('[') {
//         if let Some(end) = line.find(']') {
//             if start < end {
//                 let timestamp = line[..start].trim().to_string();
//                 let level = line[start + 1..end].trim().to_lowercase();
//                 let message = line[end + 1..].trim().to_string();
                
//                 return Some(LogEntry {
//                     timestamp,
//                     level,
//                     message,
//                 });
//             }
//         }
//     }
    
//     // Fallback: treat entire line as a message with current timestamp
//     Some(LogEntry {
//         timestamp: chrono::Utc::now().format("%H:%M:%S").to_string(),
//         level: "info".to_string(),
//         message: line.to_string(),
//     })
// }

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    info!("Attempting to open URL: {}", url);
    
    // Try using the tauri_plugin_opener first
    match tauri_plugin_opener::open_url(&url, None::<&str>) {
        Ok(_) => {
            info!("URL opened successfully with tauri_plugin_opener");
            Ok(())
        }
        Err(e) => {
            error!("tauri_plugin_opener failed: {}", e);
            
            // Fallback to system open command
            #[cfg(target_os = "macos")]
            {
                info!("Trying fallback: macOS 'open' command");
                let status = std::process::Command::new("open")
                    .arg(&url)
                    .status()
                    .map_err(|e| {
                        error!("Failed to execute 'open' command: {}", e);
                        format!("Failed to execute 'open' command: {}", e)
                    })?;
                    
                if status.success() {
                    info!("URL opened successfully with 'open' command");
                    Ok(())
                } else {
                    error!("'open' command failed with exit code: {:?}", status.code());
                    Err(format!("'open' command failed with exit code: {:?}", status.code()))
                }
            }
            
            #[cfg(target_os = "windows")]
            {
                println!("Trying fallback: Windows 'start' command");
                let status = std::process::Command::new("cmd")
                    .args(&["/C", "start", &url])
                    .status()
                    .map_err(|e| format!("Failed to execute 'start' command: {}", e))?;
                    
                if status.success() {
                    println!("URL opened successfully with 'start' command");
                    Ok(())
                } else {
                    Err(format!("'start' command failed with exit code: {:?}", status.code()))
                }
            }
            
            #[cfg(target_os = "linux")]
            {
                println!("Trying fallback: Linux 'xdg-open' command");
                let status = std::process::Command::new("xdg-open")
                    .arg(&url)
                    .status()
                    .map_err(|e| format!("Failed to execute 'xdg-open' command: {}", e))?;
                    
                if status.success() {
                    println!("URL opened successfully with 'xdg-open' command");
                    Ok(())
                } else {
                    Err(format!("'xdg-open' command failed with exit code: {:?}", status.code()))
                }
            }
        }
    }
}

// Internal server management
fn start_server_internal(state: &State<AppState>, app: &AppHandle) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if server_process.is_some() {
        add_log_entry("warning", "Attempt to start server when already running");
        return Err("Server is already running".to_string());
    }
    
    add_log_entry("info", &format!("Checking if server is already running on port {}", state.server_port));
    
    // First, check if a server is already running on the target port
    if is_server_running(state.server_port) {
        let msg = format!("Server is already running on port {}, not starting a new one", state.server_port);
        info!("{}", msg);
        add_log_entry("info", &msg);
        return Ok(());
    }
    
    // Find the server directory - look for the Go server
    add_log_entry("debug", "Looking for server directory...");
    let server_dir = match find_server_directory() {
        Ok(dir) => {
            add_log_entry("info", &format!("Found server directory: {:?}", dir));
            dir
        }
        Err(e) => {
            add_log_entry("error", &format!("Server directory not found: {}", e));
            return Err(e);
        }
    };
    
    info!("Starting TunnelForge Go server from directory: {:?}", server_dir);
    
    // Check if the server binary exists, if not try to build it
    let server_binary = server_dir.join("tunnelforge-server");
    if !server_binary.exists() {
        add_log_entry("info", "Server binary not found, attempting to build...");
        info!("Server binary not found, attempting to build...");
        
        if let Err(e) = build_go_server(&server_dir) {
            add_log_entry("error", &format!("Failed to build server: {}", e));
            return Err(e);
        }
        add_log_entry("info", "Server binary built successfully");
    } else {
        add_log_entry("debug", "Using existing server binary");
    }
    
    // Set up server command
    let mut cmd = Command::new("./tunnelforge-server");
    cmd.current_dir(&server_dir)
       .env("PORT", state.server_port.to_string())
       .env("HOST", "127.0.0.1");

    add_log_entry("debug", &format!("Starting server with PORT={} HOST=127.0.0.1", state.server_port));

    // Platform-specific configuration
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    // Start the process
    match cmd.spawn() {
        Ok(child) => {
            let child_id = child.id();
            let msg = format!("TunnelForge server started with PID: {}", child_id);
            info!("{}", msg);
            add_log_entry("info", &msg);
            *server_process = Some(child);
            
            // Wait a moment for the server to start up
            add_log_entry("debug", "Waiting for server to initialize...");
            thread::sleep(Duration::from_millis(3000));
            
            // Verify the server actually started
            if is_server_running(state.server_port) {
                add_log_entry("info", "Server started successfully and is responding");
            } else {
                add_log_entry("warning", "Server process started but not responding on expected port");
            }
            
            // Emit status change event
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("server-status-changed", ServerStatus {
                    running: true,
                    port: state.server_port,
                    pid: Some(child_id),
                });
            }
            
            Ok(())
        }
        Err(e) => {
            let msg = format!("Failed to start TunnelForge server: {}. Make sure Go is installed and the server can be built.", e);
            error!("{}", msg);
            add_log_entry("error", &msg);
            Err(msg)
        }
    }
}

fn stop_server_internal(state: &State<AppState>) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if let Some(mut child) = server_process.take() {
        info!("Stopping TunnelForge server (PID: {})...", child.id());
        
        // Try graceful shutdown first
        match child.kill() {
            Ok(_) => {
                // Wait for process to exit
                let _ = child.wait();
                info!("TunnelForge server stopped successfully");
                Ok(())
            }
            Err(e) => {
                error!("Failed to stop TunnelForge server: {}", e);
                Err(format!("Failed to stop server: {}", e))
            }
        }
    } else {
        Ok(()) // Already stopped
    }
}

// Helper function to check if server is already running
fn is_server_running(port: u16) -> bool {
    use std::net::{TcpStream, SocketAddr};
    use std::time::Duration;
    
    let addr = format!("127.0.0.1:{}", port);
    if let Ok(socket_addr) = addr.parse::<SocketAddr>() {
        TcpStream::connect_timeout(&socket_addr, Duration::from_millis(1000)).is_ok()
    } else {
        false
    }
}

// Helper function to find the server directory
fn find_server_directory() -> Result<std::path::PathBuf, String> {
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    
    add_log_entry("debug", &format!("Current directory: {:?}", current_dir));
    
    // Get the home directory as a fallback
    let home_dir = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/Users/"));
    
    // Try different possible locations for the server
    let possible_paths = vec![
        // Development paths (when running from project)
        current_dir.join("../server"),
        current_dir.join("server"),
        current_dir.join("../../server"),
        
        // Common project locations
        home_dir.join("Github/tunnelforge/server"),
        home_dir.join("Projects/tunnelforge/server"),
        home_dir.join("tunnelforge/server"),
        
        // System-wide locations
        std::path::PathBuf::from("/usr/local/share/tunnelforge/server"),
        std::path::PathBuf::from("/opt/tunnelforge/server"),
        
        // Fallback: assume we can use the web server's built executable
        home_dir.join("Github/tunnelforge/web/native"),
    ];
    
    for path in &possible_paths {
        add_log_entry("debug", &format!("Checking server path: {:?}", path));
        if path.exists() {
            // Check for Go server
            if path.join("go.mod").exists() {
                add_log_entry("info", &format!("Found Go server directory with go.mod at: {:?}", path));
                return Ok(path.clone());
            }
            // Check for pre-built Bun executable
            else if path.join("tunnelforge").exists() {
                add_log_entry("info", &format!("Found pre-built server executable at: {:?}", path));
                return Ok(path.clone());
            }
            else {
                add_log_entry("debug", &format!("Directory exists but no server found: {:?}", path));
            }
        } else {
            add_log_entry("debug", &format!("Directory does not exist: {:?}", path));
        }
    }
    
    let error_msg = format!(
        "TunnelForge server directory not found. Searched paths: {}. Make sure the server directory exists with go.mod or a pre-built executable.",
        possible_paths.iter().map(|p| format!("{:?}", p)).collect::<Vec<_>>().join(", ")
    );
    add_log_entry("error", &error_msg);
    Err(error_msg)
}

// Helper function to build the Go server
fn build_go_server(server_dir: &std::path::Path) -> Result<(), String> {
    let msg = format!("Building Go server in directory: {:?}", server_dir);
    info!("{}", msg);
    add_log_entry("info", &msg);
    
    // Check if go.mod exists
    if !server_dir.join("go.mod").exists() {
        let error = "go.mod not found in server directory";
        add_log_entry("error", error);
        return Err(error.to_string());
    }
    
    // Check if cmd/server/main.go exists
    if !server_dir.join("cmd/server/main.go").exists() {
        let error = "cmd/server/main.go not found in server directory";
        add_log_entry("error", error);
        return Err(error.to_string());
    }
    
    add_log_entry("debug", "Running: go build -o tunnelforge-server cmd/server/main.go");
    
    let output = Command::new("go")
        .args(&["build", "-o", "tunnelforge-server", "cmd/server/main.go"])
        .current_dir(server_dir)
        .output()
        .map_err(|e| {
            let error = format!("Failed to run go build: {}", e);
            add_log_entry("error", &error);
            error
        })?;
        
    if output.status.success() {
        let msg = "Go server built successfully";
        info!("{}", msg);
        add_log_entry("info", msg);
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error = format!("Go server build failed with exit code: {:?}. Error: {}", output.status.code(), stderr);
        add_log_entry("error", &error);
        Err(error)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize app state
    let state = AppState {
        server_process: Arc::new(Mutex::new(None)),
        server_port: 4021, // Connect to existing Go server
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_log::Builder::new()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::LogDir { file_name: Some("tunnelforge".to_string()) }),
                Target::new(TargetKind::Webview),
            ])
            .level(log::LevelFilter::Debug)
            .build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            start_server,
            stop_server,
            restart_server,
            get_server_url,
            show_notification,
            check_cli_installation,
            install_cli_tool,
            get_app_version,
            get_backend_logs,
            open_external_url
        ])
        .setup(|app| {
            // Initialize logging
            add_log_entry("info", "TunnelForge Desktop starting up...");
            add_log_entry("info", &format!("App version: {}", env!("CARGO_PKG_VERSION")));
            
            // Show the window immediately - no need to wait for server
            if let Some(window) = app.get_webview_window("main") {
                // Inject a flag to indicate we're in Tauri
                let _ = window.eval("window.isTauri = true;");
                
                if let Err(e) = window.show() {
                    let msg = format!("Failed to show main window: {}", e);
                    error!("{}", msg);
                    add_log_entry("error", &msg);
                } else {
                    add_log_entry("info", "Main window shown successfully");
                }
            }
            
            // Try to start the server if it's not already running
            add_log_entry("info", "Attempting to start TunnelForge server...");
            let state = app.state::<AppState>();
            let app_handle = app.handle().clone();
            if let Err(e) = start_server_internal(&state, &app_handle) {
                let msg = format!("Failed to start server during setup: {}", e);
                error!("{}", msg);
                add_log_entry("error", &msg);
                // Don't fail the app startup if server fails to start
            }
            
            add_log_entry("info", "TunnelForge Desktop initialization complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
