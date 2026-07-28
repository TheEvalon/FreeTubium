//! URL analysis via `yt-dlp -J`.

use serde_json::Value;
use tauri::AppHandle;

use crate::models::{AnalyzeResult, FormatInfo, PlaylistEntry, VideoInfo};
use crate::ytdlp;

pub async fn analyze(app: &AppHandle, url: &str) -> Result<AnalyzeResult, String> {
    let output = ytdlp::run_ytdlp(
        app,
        &[
            "-J",
            "--no-flat-playlist",
            "--no-warnings",
            "--no-colors",
            url,
        ],
    )
    .await?;

    if !output.status.success() {
        let err = ytdlp::stderr_string(&output);
        return Err(if err.is_empty() {
            "yt-dlp failed to analyze the URL".into()
        } else {
            err
        });
    }

    let json: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("failed to parse yt-dlp JSON: {e}"))?;

    if json.get("_type").and_then(Value::as_str) == Some("playlist") {
        let entries = json
            .get("entries")
            .and_then(Value::as_array)
            .map(|arr| arr.iter().filter_map(parse_playlist_entry).collect())
            .unwrap_or_default();

        Ok(AnalyzeResult {
            is_playlist: true,
            video: None,
            playlist_title: str_field(&json, "title"),
            playlist_id: str_field(&json, "id"),
            playlist_channel: str_field(&json, "channel").or_else(|| str_field(&json, "uploader")),
            entries,
        })
    } else {
        Ok(AnalyzeResult {
            is_playlist: false,
            video: Some(parse_video(&json, url)),
            playlist_title: None,
            playlist_id: None,
            playlist_channel: None,
            entries: Vec::new(),
        })
    }
}

fn str_field(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}

fn parse_video(v: &Value, fallback_url: &str) -> VideoInfo {
    let formats = v
        .get("formats")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(parse_format).collect())
        .unwrap_or_default();

    VideoInfo {
        id: str_field(v, "id").unwrap_or_default(),
        title: str_field(v, "title").unwrap_or_else(|| fallback_url.to_string()),
        url: str_field(v, "webpage_url").unwrap_or_else(|| fallback_url.to_string()),
        thumbnail: str_field(v, "thumbnail"),
        duration: v.get("duration").and_then(Value::as_f64),
        channel: str_field(v, "channel").or_else(|| str_field(v, "uploader")),
        upload_date: str_field(v, "upload_date"),
        view_count: v.get("view_count").and_then(Value::as_u64),
        formats,
    }
}

fn parse_format(v: &Value) -> Option<FormatInfo> {
    Some(FormatInfo {
        format_id: str_field(v, "format_id")?,
        ext: str_field(v, "ext"),
        format_note: str_field(v, "format_note"),
        resolution: str_field(v, "resolution"),
        height: v.get("height").and_then(Value::as_u64).map(|h| h as u32),
        width: v.get("width").and_then(Value::as_u64).map(|w| w as u32),
        fps: v.get("fps").and_then(Value::as_f64),
        vcodec: str_field(v, "vcodec"),
        acodec: str_field(v, "acodec"),
        filesize: v.get("filesize").and_then(Value::as_u64),
        filesize_approx: v.get("filesize_approx").and_then(Value::as_u64),
        tbr: v.get("tbr").and_then(Value::as_f64),
        abr: v.get("abr").and_then(Value::as_f64),
        vbr: v.get("vbr").and_then(Value::as_f64),
    })
}

fn parse_playlist_entry(v: &Value) -> Option<PlaylistEntry> {
    // Entries can be null for unavailable/private videos.
    if v.is_null() {
        return None;
    }
    Some(PlaylistEntry {
        id: str_field(v, "id").unwrap_or_default(),
        title: str_field(v, "title").unwrap_or_else(|| "Unknown title".into()),
        url: str_field(v, "webpage_url").or_else(|| str_field(v, "url")),
        duration: v.get("duration").and_then(Value::as_f64),
        thumbnail: str_field(v, "thumbnail"),
        channel: str_field(v, "channel").or_else(|| str_field(v, "uploader")),
        playlist_index: v.get("playlist_index").and_then(Value::as_u64),
    })
}
