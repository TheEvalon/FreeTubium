//! Stream preparation for the Watch page's local player.
//!
//! YouTube no longer offers muxed formats — every rendition is video-only or
//! audio-only — so nothing YouTube hands out can go straight into a `<video>`
//! element. The bundled ffmpeg combines a video and an audio rendition into one
//! MP4 (`-c copy`, no re-encoding) which the webview then plays through Tauri's
//! asset protocol, so seeking works for the whole file.
//!
//! This path is the fallback for content the embedded YouTube player refuses:
//! age-restricted, embedding-disabled and members-only videos. Those are
//! exactly the cases where the user's cookies matter, so extraction runs
//! authenticated.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

use crate::models::{PrepareErrorPayload, PrepareProgressPayload, StreamInfo};
use crate::store::SettingsState;
use crate::ytdlp;

pub const EVENT_PREPARE_PROGRESS: &str = "watch://prepare-progress";
pub const EVENT_PREPARE_READY: &str = "watch://prepare-ready";
pub const EVENT_PREPARE_ERROR: &str = "watch://prepare-error";

#[derive(Default)]
pub struct WatchState(pub Mutex<HashMap<String, Session>>);

pub struct Session {
    path: PathBuf,
    child: Option<CommandChild>,
}

/// Directory for remuxed playback files. Cleared on startup so a crash cannot
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

// ---------- format selection ----------

struct Chosen {
    video_url: String,
    audio_url: Option<String>,
    height: Option<u32>,
}

fn as_f64(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}

fn is_none_codec(v: &Value, key: &str) -> bool {
    matches!(v.get(key).and_then(Value::as_str), None | Some("none"))
}

/// Picks a video and an audio rendition to combine.
///
/// Progressive (already-muxed) formats are preferred when a site still offers
/// them, since they need no remux at all. For YouTube there are none, so this
/// falls through to the best video-only plus best audio-only pair within the
/// requested height.
fn choose_formats(formats: &[Value], max_height: Option<u32>) -> Option<Chosen> {
    let within = |v: &Value| match (max_height, v.get("height").and_then(Value::as_u64)) {
        (Some(cap), Some(h)) => h <= cap as u64,
        _ => true,
    };
    let playable = |v: &Value| {
        matches!(
            v.get("protocol").and_then(Value::as_str),
            Some("https") | Some("m3u8_native")
        )
    };

    // A single URL carrying both streams is the cheapest possible case.
    let muxed = formats
        .iter()
        .filter(|f| {
            playable(f)
                && within(f)
                && !is_none_codec(f, "vcodec")
                && !is_none_codec(f, "acodec")
                && f.get("url").is_some()
        })
        .max_by(|a, b| {
            as_f64(a, "tbr")
                .unwrap_or(0.0)
                .total_cmp(&as_f64(b, "tbr").unwrap_or(0.0))
        });

    if let Some(f) = muxed {
        return Some(Chosen {
            video_url: f.get("url")?.as_str()?.to_string(),
            audio_url: None,
            height: f.get("height").and_then(Value::as_u64).map(|h| h as u32),
        });
    }

    let best_video = formats
        .iter()
        .filter(|f| {
            playable(f)
                && within(f)
                && !is_none_codec(f, "vcodec")
                && is_none_codec(f, "acodec")
                && f.get("url").is_some()
        })
        .max_by(|a, b| {
            let key = |v: &Value| {
                (
                    v.get("height").and_then(Value::as_u64).unwrap_or(0),
                    as_f64(v, "tbr").unwrap_or(0.0),
                )
            };
            let (ah, ab) = key(a);
            let (bh, bb) = key(b);
            ah.cmp(&bh).then(ab.total_cmp(&bb))
        })?;

    let best_audio = formats
        .iter()
        .filter(|f| {
            playable(f)
                && is_none_codec(f, "vcodec")
                && !is_none_codec(f, "acodec")
                && f.get("url").is_some()
        })
        .max_by(|a, b| {
            as_f64(a, "abr")
                .or_else(|| as_f64(a, "tbr"))
                .unwrap_or(0.0)
                .total_cmp(&as_f64(b, "abr").or_else(|| as_f64(b, "tbr")).unwrap_or(0.0))
        });

    Some(Chosen {
        video_url: best_video.get("url")?.as_str()?.to_string(),
        audio_url: best_audio
            .and_then(|f| f.get("url"))
            .and_then(Value::as_str)
            .map(str::to_string),
        height: best_video
            .get("height")
            .and_then(Value::as_u64)
            .map(|h| h as u32),
    })
}

// ---------- remux ----------

/// Builds the ffmpeg argument list that combines the chosen renditions.
fn ffmpeg_args(chosen: &Chosen, output: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        // Report machine-readable progress on stdout instead of a status line.
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        "-y".into(),
    ];

    args.extend(["-i".into(), chosen.video_url.clone()]);
    if let Some(audio) = &chosen.audio_url {
        args.extend(["-i".into(), audio.clone()]);
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
    }

    args.extend([
        "-c".into(),
        "copy".into(),
        // Streams come from separate requests and can start at slightly
        // different timestamps; without this the audio can lead or lag.
        "-async".into(),
        "1".into(),
        "-movflags".into(),
        "+faststart".into(),
        "-f".into(),
        "mp4".into(),
        output.to_string(),
    ]);
    args
}

/// Parses ffmpeg's `-progress` output, which is `key=value` one per line.
fn progress_percent(line: &str, duration: Option<f64>) -> Option<f64> {
    let micros = line.strip_prefix("out_time_us=")?.trim().parse::<f64>().ok()?;
    let duration = duration.filter(|d| *d > 0.0)?;
    Some(((micros / 1_000_000.0) / duration * 100.0).clamp(0.0, 100.0))
}

// ---------- commands ----------

/// Resolves a video for local playback and starts the remux.
///
/// Returns as soon as the output path is known; the caller waits for
/// `watch://prepare-ready` before playing. Progress arrives on
/// `watch://prepare-progress`.
#[tauri::command]
pub async fn prepare_stream(
    app: AppHandle,
    url: String,
    quality: Option<String>,
) -> Result<StreamInfo, String> {
    let quality = quality.unwrap_or_else(|| {
        let state = app.state::<SettingsState>();
        let guard = state.0.lock().unwrap();
        guard.watch_quality.clone()
    });
    let max_height = quality.parse::<u32>().ok();

    let output = ytdlp::run_ytdlp_authed(
        &app,
        &["-J", "--no-playlist", "--no-warnings", "--no-colors", &url],
    )
    .await?;

    if !output.status.success() {
        let err = ytdlp::stderr_string(&output);
        return Err(if err.is_empty() {
            "yt-dlp could not read this video".into()
        } else {
            err
        });
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("failed to parse yt-dlp JSON: {e}"))?;

    let formats = json
        .get("formats")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let chosen = choose_formats(&formats, max_height)
        .ok_or_else(|| "No playable video format was offered for this video".to_string())?;

    let title = json
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&url)
        .to_string();
    let video_id = json
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let duration = as_f64(&json, "duration");

    let session_id = Uuid::new_v4().to_string();
    let path = watch_dir(&app)?.join(format!("{session_id}.mp4"));
    let path_string = path.to_string_lossy().into_owned();

    let args = ffmpeg_args(&chosen, &path_string);
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg sidecar not available: {e}"))?
        .args(&args)
        .spawn()
        .map_err(|e| format!("failed to start ffmpeg: {e}"))?;

    {
        let state = app.state::<WatchState>();
        state.0.lock().unwrap().insert(
            session_id.clone(),
            Session {
                path: path.clone(),
                child: Some(child),
            },
        );
    }

    let handle = app.clone();
    let progress_session = session_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut stderr = String::new();
        let mut code = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        if let Some(percent) = progress_percent(line, duration) {
                            let _ = handle.emit(
                                EVENT_PREPARE_PROGRESS,
                                PrepareProgressPayload {
                                    session_id: progress_session.clone(),
                                    percent,
                                },
                            );
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    stderr.push_str(&String::from_utf8_lossy(&bytes));
                }
                CommandEvent::Terminated(payload) => code = payload.code,
                _ => {}
            }
        }

        // The child has exited, so there is nothing left to kill.
        if let Some(session) = handle
            .state::<WatchState>()
            .0
            .lock()
            .unwrap()
            .get_mut(&progress_session)
        {
            session.child = None;
        }

        if code == Some(0) {
            let _ = handle.emit(EVENT_PREPARE_READY, progress_session.clone());
        } else {
            let message = stderr
                .lines()
                .rfind(|l| !l.trim().is_empty())
                .unwrap_or("ffmpeg could not prepare this video")
                .to_string();
            let _ = handle.emit(
                EVENT_PREPARE_ERROR,
                PrepareErrorPayload {
                    session_id: progress_session.clone(),
                    message,
                },
            );
        }
    });

    Ok(StreamInfo {
        playback_path: path_string,
        session_id,
        video_id,
        title,
        duration,
        height: chosen.height,
    })
}

/// Stops a playback session and deletes its file.
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
        let _ = fs::remove_file(session.path);
    }
    Ok(())
}
