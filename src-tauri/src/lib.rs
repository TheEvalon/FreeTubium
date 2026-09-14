mod analyze;
mod auth;
mod downloads;
mod models;
mod player_server;
mod store;
mod watch;
mod ytdlp;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use models::{AnalyzeResult, DownloadRequest, HistoryEntry, QueueItem, Settings};
use store::{HistoryState, SettingsState};

// ---------- commands ----------

/// Fetches metadata for a video or playlist URL via `yt-dlp -J`.
#[tauri::command]
async fn analyze_url(app: AppHandle, url: String) -> Result<AnalyzeResult, String> {
    analyze::analyze(&app, &url).await
}

/// Queues a download and returns its id. Progress is reported through the
/// `download://progress` / `download://done` / `download://error` events.
#[tauri::command]
fn start_download(app: AppHandle, request: DownloadRequest) -> Result<String, String> {
    if request.url.trim().is_empty() {
        return Err("URL must not be empty".into());
    }
    Ok(downloads::enqueue(&app, request))
}

/// Cancels a queued or running download by id.
#[tauri::command]
fn cancel_download(app: AppHandle, id: String) -> Result<(), String> {
    downloads::cancel(&app, &id)
}

/// Snapshot of currently queued and running downloads.
#[tauri::command]
fn get_queue(app: AppHandle) -> Vec<QueueItem> {
    downloads::queue_snapshot(&app)
}

/// Opens a folder in the system file manager; when given a file path,
/// reveals the file inside its parent folder.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.is_file() {
        tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| e.to_string())
    } else {
        tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, SettingsState>) -> Settings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: tauri::State<'_, SettingsState>,
    settings: Settings,
) -> Result<(), String> {
    store::save_settings(&app, &settings)?;
    *state.0.lock().unwrap() = settings;
    Ok(())
}

#[tauri::command]
fn get_history(state: tauri::State<'_, HistoryState>) -> Vec<HistoryEntry> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn clear_history(app: AppHandle, state: tauri::State<'_, HistoryState>) -> Result<(), String> {
    let mut history = state.0.lock().unwrap();
    history.clear();
    store::save_history(&app, &history)
}

#[tauri::command]
fn remove_history_entry(
    app: AppHandle,
    state: tauri::State<'_, HistoryState>,
    id: String,
) -> Result<(), String> {
    let mut history = state.0.lock().unwrap();
    history.retain(|e| e.id != id);
    store::save_history(&app, &history)
}

/// Returns the version string of the bundled yt-dlp.
#[tauri::command]
async fn get_ytdlp_version(app: AppHandle) -> Result<String, String> {
    let output = ytdlp::run_ytdlp(&app, &["--version"]).await?;
    if output.status.success() {
        Ok(ytdlp::stdout_string(&output))
    } else {
        Err(ytdlp::stderr_string(&output))
    }
}

/// Runs yt-dlp self-update (`yt-dlp -U`) and returns its output.
#[tauri::command]
async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let output = ytdlp::run_ytdlp(&app, &["-U"]).await?;
    if output.status.success() {
        Ok(ytdlp::stdout_string(&output))
    } else {
        Err(ytdlp::stderr_string(&output))
    }
}

// ---------- entry point ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            let settings = store::load_settings(handle);
            app.manage(SettingsState(Mutex::new(settings)));
            app.manage(HistoryState(Mutex::new(store::load_history(handle))));
            app.manage(downloads::DownloadManagerState::default());
            app.manage(watch::WatchState::default());
            app.manage(player_server::PlayerServerState::default());
            // A crash can leave prepared playback files behind.
            watch::clean_cache(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            analyze_url,
            start_download,
            cancel_download,
            get_queue,
            open_folder,
            get_settings,
            save_settings,
            get_history,
            clear_history,
            remove_history_entry,
            get_ytdlp_version,
            update_ytdlp,
            auth::youtube_auth_status,
            auth::open_youtube_login,
            auth::capture_youtube_cookies,
            auth::import_cookies_file,
            auth::use_browser_cookies,
            auth::clear_youtube_auth,
            watch::prepare_stream,
            watch::stop_stream,
            player_server::player_page_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
