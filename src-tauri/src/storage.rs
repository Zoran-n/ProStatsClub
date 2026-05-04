use crate::models::Settings;
use anyhow::Result;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};
use std::path::PathBuf;

// Gzip magic bytes
const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];

pub struct StorageManager {
    settings_path: PathBuf,
}

impl StorageManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let settings_path = app_data_dir.join("ProClubsStats").join("settings.json");
        Self { settings_path }
    }

    /// Serialize settings to JSON and compress with gzip before writing to disk.
    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        if let Some(parent) = self.settings_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string(settings)?;
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(json.as_bytes())?;
        let compressed = encoder.finish()?;
        std::fs::write(&self.settings_path, compressed)?;
        Ok(())
    }

    /// Load settings from disk. Handles both gzip-compressed and plain-JSON files
    /// transparently (backward compatible with pre-compression saves).
    pub fn load_settings(&self) -> Settings {
        let bytes = match std::fs::read(&self.settings_path) {
            Ok(b) => b,
            Err(_) => return Settings::default(),
        };
        // Detect gzip by magic bytes
        let json_str = if bytes.starts_with(&GZIP_MAGIC) {
            let mut decoder = GzDecoder::new(&bytes[..]);
            let mut s = String::new();
            match decoder.read_to_string(&mut s) {
                Ok(_) => s,
                Err(_) => return Settings::default(),
            }
        } else {
            // Plain JSON (legacy file or first-run from old version)
            match String::from_utf8(bytes) {
                Ok(s) => s,
                Err(_) => return Settings::default(),
            }
        };
        serde_json::from_str(&json_str).unwrap_or_default()
    }

    /// Returns the settings file size in bytes (0 if not found).
    #[allow(dead_code)]
    pub fn settings_file_size(&self) -> u64 {
        self.settings_path.metadata().map(|m| m.len()).unwrap_or(0)
    }
}
