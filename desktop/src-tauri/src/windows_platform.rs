// Windows-specific platform integration for TunnelForge

use super::PlatformIntegration;
use log::{info, warn};

#[cfg(target_os = "windows")]
use {
    winreg::enums::*,
    winreg::RegKey,
};

pub struct WindowsPlatform;

impl WindowsPlatform {
    pub fn new() -> Self {
        WindowsPlatform
    }
}

impl PlatformIntegration for WindowsPlatform {
    fn register_startup_entry(&self, enable: bool) -> Result<(), Box<dyn std::error::Error>> {
        #[cfg(target_os = "windows")]
        {
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let startup_key = hkcu.open_subkey_with_flags(
                "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run",
                KEY_SET_VALUE,
            )?;

            if enable {
                let exe_path = std::env::current_exe()?;
                startup_key.set_value("TunnelForge", &exe_path.to_string_lossy().to_string())?;
                info!("Registered TunnelForge for Windows startup");
            } else {
                let _ = startup_key.delete_value("TunnelForge");
                info!("Unregistered TunnelForge from Windows startup");
            }
        }

        Ok(())
    }

    fn show_notification(&self, title: &str, message: &str) {
        // Windows toast notifications
        info!("Windows notification: {} - {}", title, message);
        // TODO: Implement proper Windows 10/11 toast notifications using WinRT
    }

    fn setup_platform_specific(&self) -> Result<(), Box<dyn std::error::Error>> {
        info!("Setting up Windows-specific integrations");
        
        #[cfg(target_os = "windows")]
        {
            // Additional Windows setup can go here
            // - Register file associations
            // - Set up Windows Service if needed
            // - Configure Windows Defender exclusions
        }

        Ok(())
    }

    fn get_platform_name(&self) -> &'static str {
        "Windows"
    }
}