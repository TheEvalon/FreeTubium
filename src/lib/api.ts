/**
 * Typed contract between the React UI and the FreeTubium Rust core.
 *
 * Every Tauri command exposed by src-tauri has a typed wrapper here, and all
 * backend event names are exported as constants with typed payloads and
 * `onXxx` listener helpers. UI code should import from this module instead of
 * calling `invoke`/`listen` directly.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------- event names ----------

export const DOWNLOAD_EVENTS = {
  /** Emitted repeatedly while a download is running. Payload: {@link DownloadProgressPayload} */
  progress: "download://progress",
  /** Emitted when a queued download actually starts. Payload: {@link DownloadStartedPayload} */
  started: "download://started",
  /** Emitted when a download completes successfully. Payload: {@link DownloadDonePayload} */
  done: "download://done",
  /** Emitted when a download fails or is cancelled (`cancelled: true`). Payload: {@link DownloadErrorPayload} */
  error: "download://error",
} as const;

// ---------- analyze types ----------

export interface FormatInfo {
  formatId: string;
  ext: string | null;
  formatNote: string | null;
  resolution: string | null;
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  filesizeApprox: number | null;
  /** Total bitrate in KBit/s */
  tbr: number | null;
  /** Audio bitrate in KBit/s */
  abr: number | null;
  /** Video bitrate in KBit/s */
  vbr: number | null;
}

export interface VideoInfo {
  id: string;
  title: string;
  /** Canonical webpage URL of the video */
  url: string;
  thumbnail: string | null;
  /** Duration in seconds */
  duration: number | null;
  channel: string | null;
  /** Upload date as YYYYMMDD */
  uploadDate: string | null;
  viewCount: number | null;
  formats: FormatInfo[];
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string | null;
  /** Duration in seconds */
  duration: number | null;
  thumbnail: string | null;
  channel: string | null;
  /** 1-based index inside the playlist */
  playlistIndex: number | null;
}

export interface AnalyzeResult {
  isPlaylist: boolean;
  /** Set when the URL points to a single video */
  video: VideoInfo | null;
  /** Playlist metadata; only meaningful when isPlaylist is true */
  playlistTitle: string | null;
  playlistId: string | null;
  playlistChannel: string | null;
  entries: PlaylistEntry[];
}

// ---------- download types ----------

export type Quality = "best" | "2160" | "1440" | "1080" | "720" | "480";
export type Container = "mp4" | "mkv" | "webm";
export type AudioFormat = "mp3" | "m4a" | "opus";

export interface DownloadRequest {
  url: string;
  /** Display title for queue/history (falls back to the URL) */
  title?: string;
  thumbnail?: string;
  /**
   * Explicit yt-dlp format id; takes precedence over `quality`.
   * Applied as `formatId+bestaudio/formatId/best`, so video-only ids get
   * merged with the best audio automatically.
   */
  formatId?: string;
  /** Max video height; defaults to the settings default */
  quality?: Quality;
  /** Output/merge container; defaults to the settings default */
  container?: Container;
  audioOnly?: boolean;
  /** Used when audioOnly is true; defaults to the settings default */
  audioFormat?: AudioFormat;
  /** e.g. "192K" or "0" (best); passed to yt-dlp --audio-quality */
  audioBitrate?: string;
  downloadSubtitles?: boolean;
  embedSubtitles?: boolean;
  /** Comma-separated language codes/patterns, e.g. "en.*,ru" */
  subtitleLanguages?: string;
  embedThumbnail?: boolean;
  embedMetadata?: boolean;
  /** Treat the URL as a playlist (download all or `playlistItems`) */
  isPlaylist?: boolean;
  /** yt-dlp --playlist-items selection, e.g. "1-5,8,10" */
  playlistItems?: string;
  /** Overrides the settings output dir when set */
  outputDir?: string;
  /** yt-dlp output template, e.g. "%(title)s.%(ext)s" */
  filenameTemplate?: string;
  /** e.g. "5M" bytes/s; passed to yt-dlp --limit-rate */
  speedLimit?: string;
}

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "error"
  | "cancelled";

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  audioOnly: boolean;
  status: DownloadStatus;
}

// ---------- event payloads ----------

export interface DownloadProgressPayload {
  id: string;
  /** 0–100 */
  percent: number;
  /** Human-readable speed, e.g. "5.10MiB/s" */
  speed: string;
  /** Human-readable ETA, e.g. "00:35" */
  eta: string;
}

export interface DownloadStartedPayload {
  id: string;
  title: string;
}

export interface DownloadDonePayload {
  id: string;
  /** Absolute path of the downloaded file (last file for playlists) */
  filePath: string | null;
}

export interface DownloadErrorPayload {
  id: string;
  message: string;
  /** True when the download was cancelled by the user rather than failing */
  cancelled: boolean;
}

// ---------- settings & history types ----------

export interface Settings {
  /** Absolute path where downloads are written */
  outputDir: string;
  /** yt-dlp output template */
  filenameTemplate: string;
  maxConcurrentDownloads: number;
  /** e.g. "5M"; null = unlimited */
  speedLimit: string | null;
  defaultQuality: Quality;
  defaultContainer: Container;
  defaultAudioFormat: AudioFormat;
  downloadSubtitles: boolean;
  embedSubtitles: boolean;
  subtitleLanguages: string;
  embedThumbnail: boolean;
  embedMetadata: boolean;
  clipboardWatcher: boolean;
  theme: "dark" | "light";
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  outputDir: string;
  filePath: string | null;
  status: DownloadStatus;
  error: string | null;
  audioOnly: boolean;
  /** Unix timestamp in seconds */
  createdAt: number;
}

// ---------- commands ----------

/** Fetches metadata for a video or playlist URL (runs `yt-dlp -J`). */
export function analyzeUrl(url: string): Promise<AnalyzeResult> {
  return invoke("analyze_url", { url });
}

/**
 * Queues a download and returns its id. Track it via the
 * {@link DOWNLOAD_EVENTS} events or {@link getQueue}.
 */
export function startDownload(request: DownloadRequest): Promise<string> {
  return invoke("start_download", { request });
}

/** Cancels a queued or running download. */
export function cancelDownload(id: string): Promise<void> {
  return invoke("cancel_download", { id });
}

/** Snapshot of currently queued and running downloads. */
export function getQueue(): Promise<QueueItem[]> {
  return invoke("get_queue");
}

/**
 * Opens a folder in the system file manager. When given a file path, reveals
 * the file inside its parent folder.
 */
export function openFolder(path: string): Promise<void> {
  return invoke("open_folder", { path });
}

export function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}

export function getHistory(): Promise<HistoryEntry[]> {
  return invoke("get_history");
}

export function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

export function removeHistoryEntry(id: string): Promise<void> {
  return invoke("remove_history_entry", { id });
}

/** Returns the version string of the bundled yt-dlp. */
export function getYtdlpVersion(): Promise<string> {
  return invoke("get_ytdlp_version");
}

/** Runs yt-dlp self-update (`yt-dlp -U`) and returns its output. */
export function updateYtdlp(): Promise<string> {
  return invoke("update_ytdlp");
}

// ---------- event listener helpers ----------

export function onDownloadProgress(
  handler: (payload: DownloadProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgressPayload>(DOWNLOAD_EVENTS.progress, (e) =>
    handler(e.payload),
  );
}

export function onDownloadStarted(
  handler: (payload: DownloadStartedPayload) => void,
): Promise<UnlistenFn> {
  return listen<DownloadStartedPayload>(DOWNLOAD_EVENTS.started, (e) =>
    handler(e.payload),
  );
}

export function onDownloadDone(
  handler: (payload: DownloadDonePayload) => void,
): Promise<UnlistenFn> {
  return listen<DownloadDonePayload>(DOWNLOAD_EVENTS.done, (e) =>
    handler(e.payload),
  );
}

export function onDownloadError(
  handler: (payload: DownloadErrorPayload) => void,
): Promise<UnlistenFn> {
  return listen<DownloadErrorPayload>(DOWNLOAD_EVENTS.error, (e) =>
    handler(e.payload),
  );
}
