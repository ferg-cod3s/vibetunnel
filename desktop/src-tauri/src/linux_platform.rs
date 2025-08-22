// Linux-specific platform integration for TunnelForge

use super::PlatformIntegration;
use log::{info, warn};

pub struct LinuxPlatform;

impl LinuxPlatform {
    pub fn new() -> Self {
        LinuxPlatform
    }

    fn get_autostart_dir() -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
        let config_dir = dirs::config_dir()
            .ok_or("Could not find config directory")?;
        Ok(config_dir.join("autostart"))
    }

    fn create_desktop_entry(&self, enable: bool) -> Result<(), Box<dyn std::error::Error>> {
        let autostart_dir = Self::get_autostart_dir()?;
        let desktop_file = autostart_dir.join("tunnelforge.desktop");

        if enable {
            // Create autostart directory if it doesn't exist
            std::fs::create_dir_all(&autostart_dir)?;

            let exe_path = std::env::current_exe()?;
            let desktop_entry = format!(
                r#"[Desktop Entry]
Name=TunnelForge
Comment=Terminal sharing made simple
Exec={}
Icon=tunnelforge
Type=Application
Categories=Development;Network;
StartupNotify=true
X-GNOME-Autostart-enabled=true
Hidden=false
"#,
                exe_path.display()
            );

            std::fs::write(&desktop_file, desktop_entry)?;
            info!("Created Linux autostart desktop entry");
        } else {
            if desktop_file.exists() {
                std::fs::remove_file(&desktop_file)?;
                info!("Removed Linux autostart desktop entry");
            }
        }

        Ok(())
    }
}

impl PlatformIntegration for LinuxPlatform {
    fn register_startup_entry(&self, enable: bool) -> Result<(), Box<dyn std::error::Error>> {
        self.create_desktop_entry(enable)
    }

    fn show_notification(&self, title: &str, message: &str) {
        // Linux desktop notifications using libnotify
        info!("Linux notification: {} - {}", title, message);
        
        // Try to use notify-send if available
        if let Ok(mut cmd) = std::process::Command::new("notify-send")
            .arg("--app-name=TunnelForge")
            .arg("--icon=tunnelforge")
            .arg(title)
            .arg(message)
            .spawn()
        {
            let _ = cmd.wait();
        } else {
            // Fallback to zenity if notify-send is not available
            if let Ok(mut cmd) = std::process::Command::new("zenity")
                .arg("--info")
                .arg("--title")
                .arg(title)
                .arg("--text")
                .arg(message)
                .arg("--no-wrap")
                .spawn()
            {
                let _ = cmd.wait();
            }
        }
    }

    fn setup_platform_specific(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Setting up Linux-specific integrations");
        
        // Additional Linux setup can go here:
        // - Create systemd user service
        // - Register MIME types
        // - Set up file associations
        // - Configure desktop integration

        Ok(())
    }

    fn get_platform_name(&self) -> &'static str {
        "Linux"
    }
}