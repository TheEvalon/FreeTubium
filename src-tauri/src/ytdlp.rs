//! Helpers for running the bundled yt-dlp / ffmpeg sidecar binaries.

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::process::{Command, Output};
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
    let name = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let path = sidecar_dir()?.join(name);
    path.exists().then_some(path)
}

/// Builds a yt-dlp sidecar command that writes UTF-8 to its pipes.
///
/// When yt-dlp's stdout is a pipe it encodes text with the system code page and
/// *drops* whatever cannot be represented. That silently corrupted the parsed
/// `filepath` — e.g. the fullwidth colon yt-dlp substitutes into Windows
/// filenames vanished, so "Title： Sub.mp4" was recorded as "Title Sub.mp4" and
/// "open folder" pointed at a file that did not exist. `--encoding utf-8` makes
/// the output match what `from_utf8_lossy` expects.
pub fn command(app: &AppHandle) -> Result<Command, String> {
    Ok(app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("yt-dlp sidecar not available: {e}"))?
        .args(["--encoding", "utf-8"]))
}

/// Runs the yt-dlp sidecar to completion, returning its output.
pub async fn run_ytdlp(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    command(app)?
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
