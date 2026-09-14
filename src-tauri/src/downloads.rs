//! Download queue with configurable concurrency, progress events and
//! cancellation, backed by yt-dlp sidecar processes.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use uuid::Uuid;

use crate::models::{
    DonePayload, DownloadRequest, DownloadStatus, ErrorPayload, HistoryEntry, ProgressPayload,
    QueueItem, Settings, StartedPayload,
};
use crate::store::{self, SettingsState};
use crate::ytdlp;

pub const EVENT_PROGRESS: &str = "download://progress";
pub const EVENT_STARTED: &str = "download://started";
pub const EVENT_DONE: &str = "download://done";
pub const EVENT_ERROR: &str = "download://error";

/// Marker prefixes used to recognize our own lines in yt-dlp stdout.
const PROGRESS_MARKER: &str = "__FT__|";
const FILE_MARKER: &str = "__FT_FILE__";

pub struct DownloadManagerState(pub Mutex<ManagerInner>);

impl Default for DownloadManagerState {
    fn default() -> Self {
        Self(Mutex::new(ManagerInner {
            queue: VecDeque::new(),
            active: HashMap::new(),
            cancelled: HashSet::new(),
        }))
    }
}

pub struct ManagerInner {
    queue: VecDeque<Pending>,
    active: HashMap<String, ActiveDownload>,
    /// Ids that were cancelled while running; consulted when the process exits.
    cancelled: HashSet<String>,
}

struct Pending {
    id: String,
    request: DownloadRequest,
}

struct ActiveDownload {
    child: CommandChild,
    request: DownloadRequest,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn display_title(request: &DownloadRequest) -> String {
    request.title.clone().unwrap_or_else(|| request.url.clone())
}

/// Adds a request to the queue and starts it immediately if a slot is free.
/// Returns the download id.
pub fn enqueue(app: &AppHandle, request: DownloadRequest) -> String {
    let id = Uuid::new_v4().to_string();
    {
        let state = app.state::<DownloadManagerState>();
        let mut inner = state.0.lock().unwrap();
        inner.queue.push_back(Pending {
            id: id.clone(),
            request,
        });
    }
    pump(app);
    id
}

/// Kills a sidecar process together with everything it spawned.
///
/// yt-dlp ships as a PyInstaller bundle: the executable we launch is only a
/// bootstrapper that runs the real downloader as a child process. Terminating
/// the bootstrapper alone leaves that child downloading in the background,
/// still holding the inherited stdout pipe.
fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(windows))]
    {
        // Children first so they cannot outlive the bootstrapper.
        let _ = std::process::Command::new("pkill")
            .args(["-TERM", "-P", &pid.to_string()])
            .output();
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
}

/// Emits the cancellation event and records it in history.
fn report_cancelled(app: &AppHandle, id: &str, request: &DownloadRequest) {
    let _ = app.emit(
        EVENT_ERROR,
        ErrorPayload {
            id: id.to_string(),
            message: "Cancelled".into(),
            cancelled: true,
        },
    );
    store::push_history(
        app,
        HistoryEntry {
            id: id.to_string(),
            url: request.url.clone(),
            title: display_title(request),
            thumbnail: request.thumbnail.clone(),
            output_dir: request.output_dir.clone().unwrap_or_default(),
            file_path: None,
            status: DownloadStatus::Cancelled,
            error: None,
            audio_only: request.audio_only,
            created_at: now_unix(),
        },
    );
}

/// Cancels a running or queued download.
pub fn cancel(app: &AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<DownloadManagerState>();
    let mut inner = state.0.lock().unwrap();

    if let Some(active) = inner.active.remove(id) {
        inner.cancelled.insert(id.to_string());
        drop(inner);
        kill_process_tree(active.child.pid());
        active
            .child
            .kill()
            .map_err(|e| format!("failed to kill download process: {e}"))?;
        // Report the outcome now instead of waiting for the reader task.
        // Killing yt-dlp does not necessarily close its stdout: a merging ffmpeg
        // grandchild inherits the pipe and can hold it open for minutes, which
        // used to leave the card stuck on "Downloading" with nothing in history.
        report_cancelled(app, id, &active.request);
        pump(app);
        return Ok(());
    }

    if let Some(pos) = inner.queue.iter().position(|p| p.id == id) {
        let pending = inner.queue.remove(pos).unwrap();
        drop(inner);
        report_cancelled(app, id, &pending.request);
        return Ok(());
    }

    Err(format!("no download with id {id}"))
}

/// Snapshot of queued + active downloads for the UI.
pub fn queue_snapshot(app: &AppHandle) -> Vec<QueueItem> {
    let state = app.state::<DownloadManagerState>();
    let inner = state.0.lock().unwrap();
    let mut items: Vec<QueueItem> = inner
        .active
        .iter()
        .map(|(id, a)| QueueItem {
            id: id.clone(),
            url: a.request.url.clone(),
            title: display_title(&a.request),
            thumbnail: a.request.thumbnail.clone(),
            audio_only: a.request.audio_only,
            status: DownloadStatus::Downloading,
        })
        .collect();
    items.extend(inner.queue.iter().map(|p| QueueItem {
        id: p.id.clone(),
        url: p.request.url.clone(),
        title: display_title(&p.request),
        thumbnail: p.request.thumbnail.clone(),
        audio_only: p.request.audio_only,
        status: DownloadStatus::Queued,
    }));
    items
}

/// Starts queued downloads while there are free concurrency slots.
pub fn pump(app: &AppHandle) {
    let max = {
        let settings = app.state::<SettingsState>();
        let s = settings.0.lock().unwrap();
        s.max_concurrent_downloads.max(1)
    };

    loop {
        let pending = {
            let state = app.state::<DownloadManagerState>();
            let mut inner = state.0.lock().unwrap();
            if inner.active.len() >= max {
                return;
            }
            match inner.queue.pop_front() {
                Some(p) => p,
                None => return,
            }
        };

        let title = display_title(&pending.request);
        match spawn_download(app, &pending) {
            Ok(child) => {
                let state = app.state::<DownloadManagerState>();
                state.0.lock().unwrap().active.insert(
                    pending.id.clone(),
                    ActiveDownload {
                        child,
                        request: pending.request,
                    },
                );
                let _ = app.emit(
                    EVENT_STARTED,
                    StartedPayload {
                        id: pending.id,
                        title,
                    },
                );
            }
            Err(message) => {
                let _ = app.emit(
                    EVENT_ERROR,
                    ErrorPayload {
                        id: pending.id.clone(),
                        message: message.clone(),
                        cancelled: false,
                    },
                );
                store::push_history(
                    app,
                    HistoryEntry {
                        id: pending.id,
                        url: pending.request.url.clone(),
                        title,
                        thumbnail: pending.request.thumbnail.clone(),
                        output_dir: pending.request.output_dir.clone().unwrap_or_default(),
                        file_path: None,
                        status: DownloadStatus::Error,
                        error: Some(message),
                        audio_only: pending.request.audio_only,
                        created_at: now_unix(),
                    },
                );
            }
        }
    }
}

fn spawn_download(app: &AppHandle, pending: &Pending) -> Result<CommandChild, String> {
    let settings = {
        let state = app.state::<SettingsState>();
        let s = state.0.lock().unwrap();
        s.clone()
    };
    let args = build_args(&pending.request, &settings, &crate::auth::args_for(app, &settings));

    let (mut rx, child) = ytdlp::command(app)?
        .args(&args)
        .spawn()
        .map_err(|e| format!("failed to spawn yt-dlp: {e}"))?;

    let id = pending.id.clone();
    let request = pending.request.clone();
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut file_path: Option<String> = None;
        let mut stderr_tail: VecDeque<String> = VecDeque::new();
        let mut exit_code: Option<i32> = None;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    for line in text.lines() {
                        handle_stdout_line(&app, &id, line, &mut file_path);
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
                CommandEvent::Terminated(payload) => {
                    exit_code = payload.code;
                }
                CommandEvent::Error(e) => {
                    stderr_tail.push_back(e);
                }
                _ => {}
            }
        }

        finish_download(&app, &id, &request, exit_code, file_path, &stderr_tail);
        pump(&app);
    });

    Ok(child)
}

/// True once `cancel` has finalized this id, so late output must be ignored.
fn is_cancelled(app: &AppHandle, id: &str) -> bool {
    let state = app.state::<DownloadManagerState>();
    let inner = state.0.lock().unwrap();
    inner.cancelled.contains(id)
}

fn handle_stdout_line(app: &AppHandle, id: &str, line: &str, file_path: &mut Option<String>) {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix(PROGRESS_MARKER) {
        // A cancelled download is already reported as such; any output that
        // still trickles in must not flip its card back to "downloading".
        if is_cancelled(app, id) {
            return;
        }
        let mut parts = rest.split('|');
        let percent = parts
            .next()
            .map(|p| p.trim().trim_end_matches('%'))
            .and_then(|p| p.parse::<f64>().ok())
            .unwrap_or(0.0);
        let speed = parts.next().unwrap_or("").trim().to_string();
        let eta = parts.next().unwrap_or("").trim().to_string();
        let _ = app.emit(
            EVENT_PROGRESS,
            ProgressPayload {
                id: id.to_string(),
                percent,
                speed,
                eta,
            },
        );
    } else if let Some(path) = line.strip_prefix(FILE_MARKER) {
        // Emitted once per downloaded file; keep the most recent one.
        *file_path = Some(path.trim().to_string());
    }
}

fn finish_download(
    app: &AppHandle,
    id: &str,
    request: &DownloadRequest,
    exit_code: Option<i32>,
    file_path: Option<String>,
    stderr_tail: &VecDeque<String>,
) {
    let was_cancelled = {
        let state = app.state::<DownloadManagerState>();
        let mut inner = state.0.lock().unwrap();
        inner.active.remove(id);
        inner.cancelled.remove(id)
    };

    // `cancel` already emitted the event and wrote the history entry.
    if was_cancelled {
        return;
    }

    let output_dir = request.output_dir.clone().unwrap_or_else(|| {
        let state = app.state::<SettingsState>();
        let s = state.0.lock().unwrap();
        s.output_dir.clone()
    });

    let (status, error) = if exit_code == Some(0) {
        (DownloadStatus::Completed, None)
    } else {
        let message = if stderr_tail.is_empty() {
            format!("yt-dlp exited with code {exit_code:?}")
        } else {
            stderr_tail.iter().cloned().collect::<Vec<_>>().join("\n")
        };
        (DownloadStatus::Error, Some(message))
    };

    if status == DownloadStatus::Completed {
        let _ = app.emit(
            EVENT_DONE,
            DonePayload {
                id: id.to_string(),
                file_path: file_path.clone(),
            },
        );
    } else {
        let _ = app.emit(
            EVENT_ERROR,
            ErrorPayload {
                id: id.to_string(),
                message: error.clone().unwrap_or_default(),
                cancelled: false,
            },
        );
    }

    store::push_history(
        app,
        HistoryEntry {
            id: id.to_string(),
            url: request.url.clone(),
            title: display_title(request),
            thumbnail: request.thumbnail.clone(),
            output_dir,
            file_path,
            status,
            error,
            audio_only: request.audio_only,
            created_at: now_unix(),
        },
    );
}

/// Builds the yt-dlp argument list for a download request, falling back to
/// settings defaults where the request leaves options unset. `auth` carries the
/// cookie arguments so signing in also unlocks restricted downloads.
fn build_args(request: &DownloadRequest, settings: &Settings, auth: &[String]) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "--newline".into(),
        "--no-colors".into(),
        "--no-warnings".into(),
        "--no-quiet".into(),
        "--progress-template".into(),
        format!(
            "download:{PROGRESS_MARKER}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
        ),
        "--print".into(),
        format!("after_move:{FILE_MARKER}%(filepath)s"),
    ];

    args.extend(auth.iter().cloned());

    if let Some(ffmpeg) = ytdlp::ffmpeg_path() {
        args.push("--ffmpeg-location".into());
        args.push(ffmpeg.to_string_lossy().into_owned());
    }

    // Format selection.
    if request.audio_only {
        let audio_format = request
            .audio_format
            .clone()
            .unwrap_or_else(|| settings.default_audio_format.clone());
        args.extend([
            "-f".into(),
            "bestaudio/best".into(),
            "-x".into(),
            "--audio-format".into(),
            audio_format,
        ]);
        if let Some(bitrate) = &request.audio_bitrate {
            args.extend(["--audio-quality".into(), bitrate.clone()]);
        }
    } else {
        if let Some(format_id) = &request.format_id {
            args.extend([
                "-f".into(),
                format!("{format_id}+bestaudio/{format_id}/best"),
            ]);
        } else {
            let quality = request
                .quality
                .clone()
                .unwrap_or_else(|| settings.default_quality.clone());
            let selector = if quality == "best" {
                "bestvideo+bestaudio/best".to_string()
            } else {
                format!("bestvideo[height<={quality}]+bestaudio/best[height<={quality}]/best")
            };
            args.extend(["-f".into(), selector]);
        }
        let container = request
            .container
            .clone()
            .unwrap_or_else(|| settings.default_container.clone());
        args.extend(["--merge-output-format".into(), container]);
    }

    // Subtitles.
    let want_subs = request.download_subtitles || request.embed_subtitles;
    if request.download_subtitles {
        args.push("--write-subs".into());
    }
    if request.embed_subtitles {
        args.push("--embed-subs".into());
    }
    if want_subs {
        let langs = request
            .subtitle_languages
            .clone()
            .unwrap_or_else(|| settings.subtitle_languages.clone());
        args.extend(["--sub-langs".into(), langs]);
    }

    if request.embed_thumbnail {
        args.push("--embed-thumbnail".into());
    }
    if request.embed_metadata {
        args.push("--embed-metadata".into());
    }

    // Playlist handling.
    if request.is_playlist {
        args.push("--yes-playlist".into());
        if let Some(items) = &request.playlist_items {
            args.extend(["--playlist-items".into(), items.clone()]);
        }
    } else {
        args.push("--no-playlist".into());
    }

    // Output path.
    let output_dir = request
        .output_dir
        .clone()
        .filter(|d| !d.is_empty())
        .unwrap_or_else(|| settings.output_dir.clone());
    let template = request
        .filename_template
        .clone()
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            if request.is_playlist {
                format!("%(playlist_index)s - {}", settings.filename_template)
            } else {
                settings.filename_template.clone()
            }
        });
    let output = if output_dir.is_empty() {
        template
    } else {
        format!("{}{}{}", output_dir, std::path::MAIN_SEPARATOR, template)
    };
    args.extend(["-o".into(), output]);

    // Speed limit.
    if let Some(limit) = request
        .speed_limit
        .clone()
        .or_else(|| settings.speed_limit.clone())
        .filter(|l| !l.is_empty())
    {
        args.extend(["--limit-rate".into(), limit]);
    }

    args.push(request.url.clone());
    args
}
