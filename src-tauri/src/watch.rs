//! Stream preparation for the Watch page's local player.
//!
//! YouTube no longer offers muxed formats — every rendition is video-only or
//! audio-only — so nothing it hands out can go straight into a `<video>`
//! element. Preparation therefore downloads a video and an audio rendition and
//! merges them into one MP4, which the webview plays through Tauri's asset
//! protocol so seeking works across the whole file.
//!
//! yt-dlp does the fetching, not ffmpeg. The Linux ffmpeg build is statically
//! linked, which leaves it unable to resolve hostnames — it crashes outright on
//! any http input — so ffmpeg is only ever handed local files, exactly as the
//! download path does. yt-dlp also brings cookie handling, throttling and
//! retries along with it.
//!
//! This path is the fallback for content the embedded YouTube player refuses:
//! age-restricted, embedding-disabled and members-only videos. Those are
//! exactly the cases where the user's cookies matter, so it runs authenticated.

use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use uuid::Uuid;

use crate::models::{PrepareErrorPayload, PrepareProgressPayload, PrepareReadyPayload};
use crate::store::SettingsState;
use crate::ytdlp;

pub const EVENT_PREPARE_PROGRESS: &str = "watch://prepare-progress";
pub const EVENT_PREPARE_READY: &str = "watch://prepare-ready";
pub const EVENT_PREPARE_ERROR: &str = "watch://prepare-error";

/// Markers that separate machine-readable lines from yt-dlp's normal output,
/// matching the approach in [`crate::downloads`].
const PROGRESS_MARKER: &str = "@@FTWATCH@@";
const FILE_MARKER: &str = "@@FTWFILE@@";

#[derive(Default)]
pub struct WatchState(pub Mutex<HashMap<String, Session>>);

pub struct Session {
    child: Option<CommandChild>,
}

/// Directory for prepared playback files. Cleared on startup so a crash cannot
/// leave the cache growing forever.
fn watch_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("cannot resolve app cache dir: {e}"))?
        .join("watch");
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create the playback cache: {e}"))?;
    Ok(dir)
}

/// Removes leftover playback files from previous runs.
pub fn clean_cache(app: &AppHandle) {
    if let Ok(dir) = watch_dir(app) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

/// Deletes every artefact of one session, including yt-dlp's `.part` files.
fn remove_session_files(app: &AppHandle, session_id: &str) {
    if let Ok(dir) = watch_dir(app) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if name.to_string_lossy().starts_with(session_id) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
}

/// yt-dlp format selector for playback.
///
/// H.264 video with AAC audio is preferred over the higher-bitrate VP9 and AV1
/// renditions: all three system webviews play it reliably in an MP4, which the
/// others cannot be relied on to do. Each preference falls back to the next, so
/// a video that offers none of them still plays.
fn format_selector(quality: &str) -> String {
    match quality.parse::<u32>() {
        Ok(height) => format!(
            "bv*[height<={height}][vcodec^=avc1]+ba[acodec^=mp4a]/\
             bv*[height<={height}]+ba/b[height<={height}]/b"
        ),
        // "best" and anything unexpected: no height cap.
        Err(_) => "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*+ba/b".to_string(),
    }
}

fn prepare_args(
    session_id: &str,
    url: &str,
    quality: &str,
    dir: &Path,
    auth: &[String],
) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--no-colors".into(),
        "--no-warnings".into(),
        "--no-quiet".into(),
        "--progress-template".into(),
        format!("download:{PROGRESS_MARKER}%(progress._percent_str)s"),
        "--print".into(),
        format!("after_move:{FILE_MARKER}%(filepath)s"),
    ];

    args.extend(auth.iter().cloned());

    if let Some(ffmpeg) = ytdlp::ffmpeg_path() {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg.to_string_lossy().into_owned());
    }

    args.extend([
        "--no-playlist".into(),
        "-f".into(),
        format_selector(quality),
        "--merge-output-format".into(),
        "mp4".into(),
        "-o".into(),
        dir.join(format!("{session_id}.%(ext)s"))
            .to_string_lossy()
            .into_owned(),
        url.to_string(),
    ]);
    args
}

// ---------- commands ----------

/// Starts preparing a video for local playback and returns the session id.
///
/// The caller waits for `watch://prepare-ready`, which carries the path of the
/// finished file; progress arrives on `watch://prepare-progress`.
#[tauri::command]
pub fn prepare_stream(
    app: AppHandle,
    url: String,
    quality: Option<String>,
) -> Result<String, String> {
    let settings = {
        let state = app.state::<SettingsState>();
        let guard = state.0.lock().unwrap();
        guard.clone()
    };
    let quality = quality.unwrap_or_else(|| settings.watch_quality.clone());

    let session_id = Uuid::new_v4().to_string();
    let dir = watch_dir(&app)?;
    let args = prepare_args(
        &session_id,
        &url,
        &quality,
        &dir,
        &crate::auth::args_for(&app, &settings),
    );

    let (mut rx, child) = ytdlp::command(&app)?
        .args(&args)
        .spawn()
        .map_err(|e| format!("failed to spawn yt-dlp: {e}"))?;

    {
        let state = app.state::<WatchState>();
        let mut guard = state.0.lock().unwrap();
        guard.insert(session_id.clone(), Session { child: Some(child) });
    }

    let handle = app.clone();
    let id = session_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut path: Option<String> = None;
        let mut stderr_tail: VecDeque<String> = VecDeque::new();
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        let line = line.trim();
                        if let Some(rest) = line.strip_prefix(PROGRESS_MARKER) {
                            if let Ok(percent) =
                                rest.trim().trim_end_matches('%').parse::<f64>()
                            {
                                let _ = handle.emit(
                                    EVENT_PREPARE_PROGRESS,
                                    PrepareProgressPayload {
                                        session_id: id.clone(),
                                        percent,
                                    },
                                );
                            }
                        } else if let Some(reported) = line.strip_prefix(FILE_MARKER) {
                            path = Some(reported.trim().to_string());
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        let line = line.trim();
                        if !line.is_empty() {
                            stderr_tail.push_back(line.to_string());
                            if stderr_tail.len() > 10 {
                                stderr_tail.pop_front();
                            }
                        }
                    }
                }
                CommandEvent::Terminated(payload) => exit_code = payload.code,
                CommandEvent::Error(e) => stderr_tail.push_back(e),
                _ => {}
            }
        }

        // The child has exited, so there is nothing left to kill. A session that
        // is already gone was stopped by the user, and must stay silent.
        let still_wanted = {
            let state = handle.state::<WatchState>();
            let mut guard = state.0.lock().unwrap();
            match guard.get_mut(&id) {
                Some(session) => {
                    session.child = None;
                    true
                }
                None => false,
            }
        };
        if !still_wanted {
            return;
        }

        match (exit_code, path) {
            (Some(0), Some(path)) => {
                let _ = handle.emit(
                    EVENT_PREPARE_READY,
                    PrepareReadyPayload {
                        session_id: id,
                        path,
                    },
                );
            }
            _ => {
                let message = stderr_tail
                    .iter()
                    .rev()
                    .find(|line| line.starts_with("ERROR"))
                    .or_else(|| stderr_tail.back())
                    .cloned()
                    .unwrap_or_else(|| "yt-dlp could not prepare this video".to_string());
                let _ = handle.emit(
                    EVENT_PREPARE_ERROR,
                    PrepareErrorPayload {
                        session_id: id,
                        message,
                    },
                );
            }
        }
    });

    Ok(session_id)
}

/// Stops a preparation session and deletes its files.
#[tauri::command]
pub fn stop_stream(app: AppHandle, session_id: String) -> Result<(), String> {
    let session = {
        let state = app.state::<WatchState>();
        let mut guard = state.0.lock().unwrap();
        guard.remove(&session_id)
    };
    if let Some(session) = session {
        if let Some(child) = session.child {
            let _ = child.kill();
        }
    }
    remove_session_files(&app, &session_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selector_prefers_h264_and_aac_within_the_height_cap() {
        let selector = format_selector("1080");
        assert!(selector.starts_with("bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]"));
        // Every fallback must still respect the cap, or "1080p" could play 4K.
        for alternative in selector.split('/').filter(|s| s.contains("height")) {
            assert!(alternative.contains("height<=1080"), "{alternative}");
        }
    }

    #[test]
    fn selector_without_a_cap_is_used_for_best() {
        assert_eq!(
            format_selector("best"),
            "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*+ba/b"
        );
    }

    #[test]
    fn args_name_the_output_after_the_session_so_cleanup_can_find_it() {
        let dir = PathBuf::from("/cache/watch");
        let args = prepare_args("abc", "https://example.com/v", "720", &dir, &[]);
        let output = args
            .iter()
            .position(|a| a == "-o")
            .and_then(|i| args.get(i + 1))
            .expect("output template");
        assert!(output.ends_with("abc.%(ext)s"), "{output}");
        assert!(args.contains(&"--no-playlist".to_string()));
        assert_eq!(args.last().unwrap(), "https://example.com/v");
    }

    #[test]
    fn auth_args_are_passed_through() {
        let dir = PathBuf::from("/cache/watch");
        let auth = vec!["--cookies".to_string(), "/tmp/cookies.txt".to_string()];
        let args = prepare_args("abc", "https://example.com/v", "best", &dir, &auth);
        let index = args
            .iter()
            .position(|a| a == "--cookies")
            .expect("cookies flag");
        assert_eq!(args[index + 1], "/tmp/cookies.txt");
    }
}
