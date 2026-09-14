use serde::{Deserialize, Serialize};

// ---------- analyze_url ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: Option<String>,
    pub format_note: Option<String>,
    pub resolution: Option<String>,
    pub height: Option<u32>,
    pub width: Option<u32>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    /// Total bitrate (KBit/s)
    pub tbr: Option<f64>,
    /// Audio bitrate (KBit/s)
    pub abr: Option<f64>,
    /// Video bitrate (KBit/s)
    pub vbr: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    /// Canonical webpage URL of the video.
    pub url: String,
    pub thumbnail: Option<String>,
    /// Duration in seconds.
    pub duration: Option<f64>,
    pub channel: Option<String>,
    /// Upload date in YYYYMMDD format.
    pub upload_date: Option<String>,
    pub view_count: Option<u64>,
    pub formats: Vec<FormatInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub title: String,
    pub url: Option<String>,
    /// Duration in seconds.
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub channel: Option<String>,
    /// 1-based index inside the playlist.
    pub playlist_index: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub is_playlist: bool,
    /// Set when the URL points to a single video.
    pub video: Option<VideoInfo>,
    /// Playlist metadata; only meaningful when `is_playlist` is true.
    pub playlist_title: Option<String>,
    pub playlist_id: Option<String>,
    pub playlist_channel: Option<String>,
    pub entries: Vec<PlaylistEntry>,
}

// ---------- downloads ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub url: String,
    /// Display title (used for queue/history; falls back to the URL).
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    /// Explicit yt-dlp format id. Takes precedence over `quality`.
    pub format_id: Option<String>,
    /// "best" | "2160" | "1440" | "1080" | "720" | "480" (max video height).
    pub quality: Option<String>,
    /// "mp4" | "mkv" | "webm" — merge/output container for video downloads.
    pub container: Option<String>,
    #[serde(default)]
    pub audio_only: bool,
    /// "mp3" | "m4a" | "opus" — used when `audio_only` is true.
    pub audio_format: Option<String>,
    /// e.g. "192K" or "0" (best) — passed to --audio-quality.
    pub audio_bitrate: Option<String>,
    #[serde(default)]
    pub download_subtitles: bool,
    #[serde(default)]
    pub embed_subtitles: bool,
    /// Comma-separated language codes/patterns, e.g. "en.*,ru".
    pub subtitle_languages: Option<String>,
    #[serde(default)]
    pub embed_thumbnail: bool,
    #[serde(default)]
    pub embed_metadata: bool,
    /// True when the URL should be treated as a playlist.
    #[serde(default)]
    pub is_playlist: bool,
    /// yt-dlp --playlist-items selection, e.g. "1-5,8,10".
    pub playlist_items: Option<String>,
    /// Overrides the settings default when set.
    pub output_dir: Option<String>,
    /// yt-dlp output template, e.g. "%(title)s.%(ext)s".
    pub filename_template: Option<String>,
    /// e.g. "5M" (bytes/s) — passed to --limit-rate.
    pub speed_limit: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Completed,
    Error,
    Cancelled,
}

/// Snapshot of a queue item returned by `get_queue`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub audio_only: bool,
    pub status: DownloadStatus,
}

// ---------- events ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    pub percent: f64,
    pub speed: String,
    pub eta: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedPayload {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DonePayload {
    pub id: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub id: String,
    pub message: String,
    pub cancelled: bool,
}

// ---------- settings ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Absolute path where downloads are written. Empty = resolved to the
    /// user's Downloads directory on first load.
    pub output_dir: String,
    /// yt-dlp output template.
    pub filename_template: String,
    pub max_concurrent_downloads: usize,
    /// e.g. "5M"; None = unlimited.
    pub speed_limit: Option<String>,
    pub default_quality: String,
    pub default_container: String,
    pub default_audio_format: String,
    pub download_subtitles: bool,
    pub embed_subtitles: bool,
    pub subtitle_languages: String,
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub clipboard_watcher: bool,
    /// "dark" | "light"
    pub theme: String,
    /// How yt-dlp authenticates with YouTube: "none" | "file" | "browser".
    pub auth_mode: String,
    /// Browser name for `--cookies-from-browser`; only used when
    /// `auth_mode` is "browser".
    pub cookies_browser: Option<String>,
    /// Preferred max height for in-app playback, e.g. "1080"; "best" = no cap.
    pub watch_quality: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            output_dir: String::new(),
            filename_template: "%(title)s.%(ext)s".into(),
            max_concurrent_downloads: 3,
            speed_limit: None,
            default_quality: "best".into(),
            default_container: "mp4".into(),
            default_audio_format: "mp3".into(),
            download_subtitles: false,
            embed_subtitles: false,
            subtitle_languages: "en.*".into(),
            embed_thumbnail: false,
            embed_metadata: true,
            clipboard_watcher: false,
            theme: "dark".into(),
            auth_mode: "none".into(),
            cookies_browser: None,
            watch_quality: "1080".into(),
        }
    }
}

// ---------- authentication ----------

/// Current state of YouTube authentication, as shown in Settings.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    /// "none" | "file" | "browser"
    pub mode: String,
    pub browser: Option<String>,
    pub cookie_file_exists: bool,
    /// Number of cookies in the stored cookie file.
    pub cookie_count: usize,
    /// True when the stored cookies include a YouTube session cookie. A
    /// heuristic: it means cookies were captured while signed in, not that
    /// they are still valid.
    pub signed_in: bool,
    /// Earliest expiry among the session cookies, as a Unix timestamp.
    pub expires_at: Option<u64>,
}

// ---------- watch ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareProgressPayload {
    pub session_id: String,
    /// 0-100 for the rendition currently downloading. Video and audio arrive as
    /// separate downloads, so this restarts once before the merge.
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareReadyPayload {
    pub session_id: String,
    /// Absolute path of the prepared MP4. The UI turns this into a URL the
    /// webview can load with Tauri's `convertFileSrc`.
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareErrorPayload {
    pub session_id: String,
    pub message: String,
}

// ---------- history ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub output_dir: String,
    pub file_path: Option<String>,
    pub status: DownloadStatus,
    pub error: Option<String>,
    pub audio_only: bool,
    /// Unix timestamp (seconds).
    pub created_at: u64,
}
