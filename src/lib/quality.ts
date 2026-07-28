/**
 * Derives the quality / container / audio choices offered by the UI from the
 * formats reported by `analyze_url`.
 */
import type {
  AudioFormat,
  Container,
  FormatInfo,
  PlaylistEntry,
  Quality,
} from "./api";

export interface QualityOption {
  /** Stable key used by the picker. */
  key: string;
  label: string;
  hint?: string;
  /** Sent as `quality` when the height maps onto the backend enum. */
  quality?: Quality;
  /** Sent as `formatId` for heights the enum cannot express (e.g. 8K). */
  formatId?: string;
}

const HEIGHT_LABELS: Array<{ height: number; label: string; hint: string }> = [
  { height: 4320, label: "8K", hint: "4320p" },
  { height: 2160, label: "4K", hint: "2160p" },
  { height: 1440, label: "1440p", hint: "QHD" },
  { height: 1080, label: "1080p", hint: "Full HD" },
  { height: 720, label: "720p", hint: "HD" },
  { height: 480, label: "480p", hint: "SD" },
];

const ENUM_HEIGHTS = new Set([2160, 1440, 1080, 720, 480]);

function hasVideo(format: FormatInfo): boolean {
  return format.vcodec !== "none" && (format.height ?? 0) > 0;
}

/** Best (highest bitrate) video format at exactly the given height. */
export function pickFormatIdForHeight(
  formats: FormatInfo[],
  height: number,
): string | undefined {
  const candidates = formats
    .filter((f) => hasVideo(f) && f.height === height)
    .sort((a, b) => (b.tbr ?? b.vbr ?? 0) - (a.tbr ?? a.vbr ?? 0));
  return candidates[0]?.formatId;
}

/**
 * "best" plus every standard rung the video actually offers. Heights above the
 * backend's `Quality` enum (8K) are expressed as an explicit format id.
 */
export function buildQualityOptions(formats: FormatInfo[]): QualityOption[] {
  const options: QualityOption[] = [
    { key: "best", label: "Best", hint: "highest available", quality: "best" },
  ];

  const available = new Set(
    formats.filter(hasVideo).map((f) => f.height as number),
  );

  for (const rung of HEIGHT_LABELS) {
    const exact = available.has(rung.height);
    const anyAbove = [...available].some((h) => h >= rung.height);
    if (!exact && !anyAbove) continue;

    if (ENUM_HEIGHTS.has(rung.height)) {
      options.push({
        key: String(rung.height),
        label: rung.label,
        hint: rung.hint,
        quality: String(rung.height) as Quality,
      });
    } else if (exact) {
      const formatId = pickFormatIdForHeight(formats, rung.height);
      if (formatId) {
        options.push({
          key: `h${rung.height}`,
          label: rung.label,
          hint: rung.hint,
          formatId,
        });
      }
    }
  }

  return options;
}

/** Fallback list for playlists, where per-item formats are not fetched. */
export function defaultQualityOptions(): QualityOption[] {
  const options: QualityOption[] = [
    { key: "best", label: "Best", hint: "highest available", quality: "best" },
  ];
  for (const rung of HEIGHT_LABELS) {
    if (!ENUM_HEIGHTS.has(rung.height)) continue;
    options.push({
      key: String(rung.height),
      label: rung.label,
      hint: rung.hint,
      quality: String(rung.height) as Quality,
    });
  }
  return options;
}

export const CONTAINERS: Array<{ value: Container; label: string }> = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "MKV" },
  { value: "webm", label: "WebM" },
];

export const AUDIO_FORMATS: Array<{
  value: AudioFormat;
  label: string;
  hint: string;
}> = [
  { value: "mp3", label: "MP3", hint: "most compatible" },
  { value: "m4a", label: "M4A", hint: "AAC" },
  { value: "opus", label: "Opus", hint: "best per bit" },
];

export const AUDIO_BITRATES: Array<{ value: string; label: string }> = [
  { value: "0", label: "Best" },
  { value: "320K", label: "320k" },
  { value: "256K", label: "256k" },
  { value: "192K", label: "192k" },
  { value: "128K", label: "128k" },
];

/** Best guess at the final file size for a picked quality, when yt-dlp knows it. */
export function estimateSize(
  formats: FormatInfo[],
  option: QualityOption,
): number | null {
  if (!formats.length) return null;
  const videos = formats.filter(hasVideo);
  if (!videos.length) return null;

  const targetHeight = option.formatId
    ? (videos.find((f) => f.formatId === option.formatId)?.height ?? null)
    : option.quality && option.quality !== "best"
      ? Number(option.quality)
      : null;

  const pool =
    targetHeight == null
      ? videos
      : videos.filter((f) => (f.height ?? 0) <= targetHeight);
  const best = [...(pool.length ? pool : videos)].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0),
  )[0];
  const video = best?.filesize ?? best?.filesizeApprox ?? null;
  if (video == null) return null;

  const audios = formats.filter((f) => f.vcodec === "none" && f.acodec !== "none");
  const audio = audios
    .map((f) => f.filesize ?? f.filesizeApprox ?? 0)
    .sort((a, b) => b - a)[0];

  // Video-only streams get merged with an audio track, so add it in.
  return best.acodec && best.acodec !== "none" ? video : video + (audio ?? 0);
}

/**
 * Compresses 1-based playlist indices into a yt-dlp `--playlist-items` value,
 * e.g. [1,2,3,5,9,10] -> "1-3,5,9-10".
 */
export function toPlaylistItems(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = -1;
  let prev = -1;

  for (const index of sorted) {
    if (start < 0) {
      start = index;
      prev = index;
      continue;
    }
    if (index === prev + 1) {
      prev = index;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = index;
    prev = index;
  }
  if (start >= 0) ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(",");
}

/** True when every selected entry has a playlist index we can pass to yt-dlp. */
export function allHaveIndex(entries: PlaylistEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => e.playlistIndex != null);
}
