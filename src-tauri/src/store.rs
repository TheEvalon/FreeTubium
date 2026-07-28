//! JSON persistence for settings and download history in the app config dir.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::models::{HistoryEntry, Settings};

pub struct SettingsState(pub Mutex<Settings>);
pub struct HistoryState(pub Mutex<Vec<HistoryEntry>>);

fn config_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    Ok(dir.join(name))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    config_file(app, "settings.json")
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    config_file(app, "history.json")
}

pub fn load_settings(app: &AppHandle) -> Settings {
    let mut settings = settings_path(app)
        .ok()
        .filter(|p| p.exists())
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or_default();

    if settings.output_dir.is_empty() {
        settings.output_dir = app
            .path()
            .download_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
    }
    settings
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("cannot write settings: {e}"))
}

pub fn load_history(app: &AppHandle) -> Vec<HistoryEntry> {
    history_path(app)
        .ok()
        .filter(|p| p.exists())
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<HistoryEntry>>(&s).ok())
        .unwrap_or_default()
}

pub fn save_history(app: &AppHandle, history: &[HistoryEntry]) -> Result<(), String> {
    let path = history_path(app)?;
    let json = serde_json::to_string_pretty(history).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("cannot write history: {e}"))
}

/// Prepends an entry to the in-memory history and persists it to disk.
pub fn push_history(app: &AppHandle, entry: HistoryEntry) {
    let state = app.state::<HistoryState>();
    let mut history = state.0.lock().unwrap();
    history.insert(0, entry);
    // Keep history bounded.
    history.truncate(1000);
    if let Err(e) = save_history(app, &history) {
        eprintln!("failed to save history: {e}");
    }
}
