// TunnelForge Windows - Tauri Application
// 
// This is the main entry point for the TunnelForge Windows desktop application built with Tauri.
// It provides Windows-specific integrations while sharing core functionality with the Linux version.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{
    AppHandle, CustomMenuItem, Manager, RunEvent, State, SystemTray, SystemTrayEvent,
    SystemTrayMenu, SystemTrayMenuItem, Window, WindowEvent,
};
use serde::{Deserialize, Serialize};
use log::{debug, error, info, warn};

#[cfg(target_os = "windows")]
use {
    winreg::enums::*,
    winreg::RegKey,
    windows::Win32::UI::Shell::*,
};

// Application state
struct AppState {
    server_process: Arc<Mutex<Option<Child>>>,
    server_port: u16,
    is_quitting: Arc<Mutex<bool>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ServerStatus {
    running: bool,
    port: u16,
    pid: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AppSettings {
    auto_start: bool,
    minimize_to_tray: bool,
    server_port: u16,
    enable_logging: bool,
    start_on_boot: bool,
    enable_windows_service: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_start: false,
            minimize_to_tray: true,
            server_port: 4021,
            enable_logging: false,
            start_on_boot: false,
            enable_windows_service: false,
        }
    }
}

// Windows-specific functionality
#[cfg(target_os = "windows")]
mod windows_integration {
    use super::*;

    pub fn register_startup_entry(enable: bool) -> Result<(), Box<dyn std::error::Error>> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu.open_subkey_with_flags("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run", KEY_SET_VALUE)?;
        
        if enable {
            let exe_path = std::env::current_exe()?;
            startup_key.set_value("TunnelForge", &exe_path.to_string_lossy().to_string())?;
            info!("Registered TunnelForge for startup");
        } else {
            let _ = startup_key.delete_value("TunnelForge");
            info!("Unregistered TunnelForge from startup");
        }
        
        Ok(())
    }

    pub fn show_windows_notification(title: &str, message: &str) {
        // Implementation for Windows toast notifications
        info!("Windows notification: {} - {}", title, message);
        // TODO: Implement proper Windows toast notifications
    }

    pub fn setup_windows_integration() -> Result<(), Box<dyn std::error::Error>> {
        // Additional Windows-specific setup
        info!("Setting up Windows integration");
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod windows_integration {
    use super::*;

    pub fn register_startup_entry(_enable: bool) -> Result<(), Box<dyn std::error::Error>> {
        Ok(())
    }

    pub fn show_windows_notification(_title: &str, _message: &str) {
        // No-op on non-Windows
    }

    pub fn setup_windows_integration() -> Result<(), Box<dyn std::error::Error>> {
        Ok(())
    }
}

// Tauri commands
#[tauri::command]
async fn get_server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let server_process = state.server_process.lock().unwrap();
    
    match &*server_process {
        Some(child) => {
            Ok(ServerStatus {
                running: true,
                port: state.server_port,
                pid: Some(child.id()),
            })
        }
        None => Ok(ServerStatus {
            running: false,
            port: state.server_port,
            pid: None,
        }),
    }
}

#[tauri::command]
async fn restart_server(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    info!("Restarting server...");
    
    // Stop current server
    stop_server_internal(&state)?;
    
    // Wait a moment
    thread::sleep(Duration::from_millis(1000));
    
    // Start new server
    start_server_internal(&state, &app)?;
    
    Ok(())
}

#[tauri::command]
async fn get_app_settings() -> Result<AppSettings, String> {
    // TODO: Load from Windows registry or config file
    Ok(AppSettings::default())
}

#[tauri::command]
async fn update_app_settings(settings: AppSettings) -> Result<(), String> {
    info!("Updating app settings: {:?}", settings);
    
    // Handle Windows-specific settings
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = windows_integration::register_startup_entry(settings.start_on_boot) {
            warn!("Failed to update startup registry: {}", e);
        }
    }
    
    // TODO: Save to config file/registry
    Ok(())
}

#[tauri::command]
async fn create_new_session(app: AppHandle) -> Result<(), String> {
    info!("Creating new session...");
    
    // Show main window and focus it
    if let Some(window) = app.get_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        
        // Emit event to web interface to create new session
        window.emit("create-session", {}).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
async fn copy_server_url(state: State<'_, AppState>) -> Result<String, String> {
    let url = format!("http://localhost:{}", state.server_port);
    
    // Copy to clipboard via tauri's clipboard API would be here
    // For now, just return the URL for the frontend to handle
    Ok(url)
}

#[tauri::command]
async fn show_notification(title: String, message: String) -> Result<(), String> {
    windows_integration::show_windows_notification(&title, &message);
    Ok(())
}

// Internal server management
fn start_server_internal(state: &State<AppState>, app: &AppHandle) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if server_process.is_some() {
        return Err("Server is already running".to_string());
    }
    
    // Get the path to the bundled Go server
    let server_path = get_server_binary_path(app)?;
    
    info!("Starting Go server at: {}", server_path);
    
    // Set up environment variables
    let mut cmd = Command::new(&server_path);
    cmd.env("HOST", "127.0.0.1")
       .env("PORT", state.server_port.to_string())
       .env("ENABLE_RATE_LIMIT", "false")
       .env("ENABLE_REQUEST_LOG", if cfg!(debug_assertions) { "true" } else { "false" });

    // Windows-specific configuration
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    // Start the process
    match cmd.spawn() {
        Ok(child) => {
            info!("Go server started with PID: {}", child.id());
            *server_process = Some(child);
            
            // Emit status change event
            if let Some(window) = app.get_window("main") {
                let _ = window.emit("server-status-changed", ServerStatus {
                    running: true,
                    port: state.server_port,
                    pid: Some(child.id()),
                });
            }
            
            Ok(())
        }
        Err(e) => {
            error!("Failed to start Go server: {}", e);
            Err(format!("Failed to start server: {}", e))
        }
    }
}

fn stop_server_internal(state: &State<AppState>) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if let Some(mut child) = server_process.take() {
        info!("Stopping Go server (PID: {})...", child.id());
        
        // Try graceful shutdown first
        match child.kill() {
            Ok(_) => {
                // Wait for process to exit
                let _ = child.wait();
                info!("Go server stopped successfully");
                Ok(())
            }
            Err(e) => {
                error!("Failed to stop Go server: {}", e);
                Err(format!("Failed to stop server: {}", e))
            }
        }
    } else {
        Ok(()) // Already stopped
    }
}

fn get_server_binary_path(app: &AppHandle) -> Result<String, String> {
    // In development, use the development server
    if cfg!(debug_assertions) {
        // Look for development Go server
        let dev_paths = [
            "../development/go-server/tunnelforge-server.exe",
            "../../development/go-server/tunnelforge-server.exe",
            "../../../development/go-server/tunnelforge-server.exe",
            "../development/go-server/tunnelforge-server",
            "../../development/go-server/tunnelforge-server",
            "../../../development/go-server/tunnelforge-server",
        ];
        
        for path in &dev_paths {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }
        
        return Err("Development server binary not found. Please build the Go server first.".to_string());
    }
    
    // In production, use bundled binary
    app.path_resolver()
        .resolve_resource("bin/tunnelforge-server.exe")
        .or_else(|| app.path_resolver().resolve_resource("bin/tunnelforge-server"))
        .ok_or_else(|| "Server binary not found in bundle".to_string())
        .and_then(|path| {
            path.to_str()
                .ok_or_else(|| "Invalid server binary path".to_string())
                .map(|s| s.to_string())
        })
}

// System tray setup
fn create_system_tray() -> SystemTray {
    let open = CustomMenuItem::new("open".to_string(), "Open TunnelForge");
    let new_session = CustomMenuItem::new("new_session".to_string(), "New Terminal Session");
    let separator1 = SystemTrayMenuItem::Separator;
    let server_status = CustomMenuItem::new("server_status".to_string(), "Server: Checking...")
        .disabled();
    let copy_url = CustomMenuItem::new("copy_url".to_string(), "Copy Server URL");
    let separator2 = SystemTrayMenuItem::Separator;
    let settings = CustomMenuItem::new("settings".to_string(), "Settings");
    let about = CustomMenuItem::new("about".to_string(), "About TunnelForge");
    let separator3 = SystemTrayMenuItem::Separator;
    let quit = CustomMenuItem::new("quit".to_string(), "Exit TunnelForge");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(open)
        .add_native_item(separator1)
        .add_item(new_session)
        .add_native_item(separator2)
        .add_item(server_status)
        .add_item(copy_url)
        .add_native_item(separator2)
        .add_item(settings)
        .add_item(about)
        .add_native_item(separator3)
        .add_item(quit);
    
    SystemTray::new().with_menu(tray_menu)
}

// System tray event handler
fn handle_system_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            // Toggle main window on left click
            if let Some(window) = app.get_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "open" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "new_session" => {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = create_new_session(app_clone).await;
                    });
                }
                "copy_url" => {
                    // Copy server URL to clipboard
                    info!("Copy URL requested");
                    // TODO: Implement clipboard functionality
                }
                "settings" => {
                    // Open settings (for now, just show main window)
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "about" => {
                    // Show about dialog
                    info!("About dialog requested");
                    // TODO: Implement about dialog
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

// Window event handler
fn handle_window_event(event: tauri::GlobalWindowEvent) {
    match event.event() {
        WindowEvent::CloseRequested { api, .. } => {
            // Prevent window from closing, hide it instead
            api.prevent_close();
            let _ = event.window().hide();
            
            // Show Windows notification about running in background
            windows_integration::show_windows_notification(
                "TunnelForge",
                "TunnelForge is running in the background. Right-click the tray icon to access it."
            );
        }
        _ => {}
    }
}

// Application setup
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    info!("Setting up TunnelForge Windows application...");
    
    // Windows-specific setup
    windows_integration::setup_windows_integration()?;
    
    // Initialize app state
    let state = AppState {
        server_process: Arc::new(Mutex::new(None)),
        server_port: 4021,
        is_quitting: Arc::new(Mutex::new(false)),
    };
    
    app.manage(state);
    
    // Start the Go server
    let app_handle = app.handle();
    let app_state = app_handle.state::<AppState>();
    
    tauri::async_runtime::spawn(async move {
        if let Err(e) = start_server_internal(&app_state, &app_handle) {
            error!("Failed to start server during setup: {}", e);
        }
        
        // Wait a moment for server to start, then show window
        tokio::time::sleep(Duration::from_millis(2000)).await;
        
        if let Some(window) = app_handle.get_window("main") {
            if let Err(e) = window.show() {
                error!("Failed to show main window: {}", e);
            }
        }
    });
    
    Ok(())
}

// Application cleanup
fn cleanup_app(app: &AppHandle) {
    info!("Cleaning up TunnelForge Windows application...");
    
    let state = app.state::<AppState>();
    *state.is_quitting.lock().unwrap() = true;
    
    if let Err(e) = stop_server_internal(&state) {
        error!("Error during server cleanup: {}", e);
    }
}

fn main() {
    // Initialize logging
    env_logger::Builder::from_default_env()
        .filter_level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        })
        .init();
    
    info!("Starting TunnelForge Windows v{}", env!("CARGO_PKG_VERSION"));
    
    tauri::Builder::default()
        .setup(setup_app)
        .system_tray(create_system_tray())
        .on_system_tray_event(handle_system_tray_event)
        .on_window_event(handle_window_event)
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            restart_server,
            get_app_settings,
            update_app_settings,
            create_new_session,
            copy_server_url,
            show_notification
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            match event {
                RunEvent::ExitRequested { .. } => {
                    cleanup_app(app_handle);
                }
                _ => {}
            }
        });
}