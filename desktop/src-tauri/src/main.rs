// TunnelForge Desktop - Cross-Platform Tauri v2 Application
// This manages the Bun-based TunnelForge server and provides a native desktop interface.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, State, WebviewWindow};
use serde::{Deserialize, Serialize};

// Application state
struct AppState {
    server_process: Arc<Mutex<Option<Child>>>,
    server_port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
struct ServerStatus {
    running: bool,
    port: u16,
    pid: Option<u32>,
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
    // Stop current server
    stop_server_internal(&state)?;
    
    // Wait a moment
    thread::sleep(Duration::from_millis(1000));
    
    // Start new server
    start_server_internal(&state, &app)?;
    
    Ok(())
}

#[tauri::command]
async fn get_server_url(state: State<'_, AppState>) -> Result<String, String> {
    let url = format!("http://localhost:{}", state.server_port);
    Ok(url)
}

#[tauri::command]
async fn show_notification(title: String, message: String) -> Result<(), String> {
    // Use Tauri v2 notification plugin
    Ok(())
}

// Internal server management
fn start_server_internal(state: &State<AppState>, app: &AppHandle) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if server_process.is_some() {
        return Err("Server is already running".to_string());
    }
    
    // Start the Bun server from the web directory
    let web_dir = std::path::Path::new("../web");
    if !web_dir.exists() {
        return Err("Web directory not found. Make sure to run from the correct location.".to_string());
    }
    
    println!("Starting Bun server from web directory...");
    
    // Set up Bun server command
    let mut cmd = Command::new("bun");
    cmd.args(&["run", "start:bun"])
       .current_dir(web_dir)
       .env("PORT", state.server_port.to_string())
       .env("HOST", "127.0.0.1")
       .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" });

    // Platform-specific configuration
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    // Start the process
    match cmd.spawn() {
        Ok(child) => {
            println!("Bun server started with PID: {}", child.id());
            *server_process = Some(child);
            
            // Emit status change event
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("server-status-changed", ServerStatus {
                    running: true,
                    port: state.server_port,
                    pid: Some(child.id()),
                });
            }
            
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to start Bun server: {}", e);
            Err(format!("Failed to start server: {}. Make sure Bun is installed.", e))
        }
    }
}

fn stop_server_internal(state: &State<AppState>) -> Result<(), String> {
    let mut server_process = state.server_process.lock().unwrap();
    
    if let Some(mut child) = server_process.take() {
        println!("Stopping Bun server (PID: {})...", child.id());
        
        // Try graceful shutdown first
        match child.kill() {
            Ok(_) => {
                // Wait for process to exit
                let _ = child.wait();
                println!("Bun server stopped successfully");
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to stop Bun server: {}", e);
                Err(format!("Failed to stop server: {}", e))
            }
        }
    } else {
        Ok(()) // Already stopped
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize app state
    let state = AppState {
        server_process: Arc::new(Mutex::new(None)),
        server_port: 3001, // Bun server default port
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            restart_server,
            get_server_url,
            show_notification
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_state = app_handle.state::<AppState>();
            
            // Start the Bun server
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_server_internal(&app_state, &app_handle) {
                    eprintln!("Failed to start server during setup: {}", e);
                }
                
                // Wait a moment for server to start, then show window
                tokio::time::sleep(Duration::from_millis(2000)).await;
                
                if let Some(window) = app_handle.get_webview_window("main") {
                    if let Err(e) = window.show() {
                        eprintln!("Failed to show main window: {}", e);
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
