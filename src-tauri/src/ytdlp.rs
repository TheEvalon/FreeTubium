//! Helpers for running the bundled yt-dlp / ffmpeg sidecar binaries.

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::process::Output;
use tauri_plugin_shell::ShellExt;

/// Directory that contains the sidecar binaries at runtime (next to the app
/// executable, both in `tauri dev` and in bundled builds).
pub fn sidecar_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(|p| p.to_path_buf())
}

/// Path to the bundled ffmpeg, if present. Passed to yt-dlp via
/// `--ffmpeg-location` so merging/conversion works without a system ffmpeg.
pub fn ffmpeg_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let path = sidecar_dir()?.join(name);
    path.exists().then_some(path)
}

/// Runs the yt-dlp sidecar to completion, returning its output.
pub async fn run_ytdlp(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    app.shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar not available: {e}"))?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("failed to run yt-dlp: {e}"))
}

pub fn stdout_string(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub fn stderr_string(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).trim().to_string()
}
