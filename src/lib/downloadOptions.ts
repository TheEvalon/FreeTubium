/**
 * The option set shared by the Home and playlist screens, plus the mapping from
 * those options onto a `DownloadRequest`.
 */
import type {
  AudioFormat,
  Container,
  DownloadRequest,
  Settings,
} from "./api";
import type { QualityOption } from "./quality";

export interface DownloadOptionsValue {
  audioOnly: boolean;
  /** Key of the chosen entry in the current `QualityOption[]`. */
  qualityKey: string;
  container: Container;
  audioFormat: AudioFormat;
  audioBitrate: string;
  downloadSubtitles: boolean;
  embedSubtitles: boolean;
  subtitleLanguages: string;
  embedThumbnail: boolean;
  embedMetadata: boolean;
}

export function initialOptions(settings: Settings): DownloadOptionsValue {
  return {
    audioOnly: false,
    qualityKey:
      settings.defaultQuality === "best" ? "best" : settings.defaultQuality,
    container: settings.defaultContainer,
    audioFormat: settings.defaultAudioFormat,
    audioBitrate: "0",
    downloadSubtitles: settings.downloadSubtitles,
    embedSubtitles: settings.embedSubtitles,
    subtitleLanguages: settings.subtitleLanguages,
    embedThumbnail: settings.embedThumbnail,
    embedMetadata: settings.embedMetadata,
  };
}

/** Resolves the picked quality, falling back to "best" if it disappeared. */
export function resolveQuality(
  options: QualityOption[],
  qualityKey: string,
): QualityOption {
  return (
    options.find((option) => option.key === qualityKey) ??
    options[0] ?? { key: "best", label: "Best", quality: "best" }
  );
}

export function buildRequest(
  base: Pick<DownloadRequest, "url" | "title" | "thumbnail"> &
    Partial<DownloadRequest>,
  options: DownloadOptionsValue,
  qualityOptions: QualityOption[],
): DownloadRequest {
  const request: DownloadRequest = {
    ...base,
    audioOnly: options.audioOnly,
    downloadSubtitles: options.downloadSubtitles,
    embedSubtitles: options.embedSubtitles,
    subtitleLanguages: options.subtitleLanguages || undefined,
    embedThumbnail: options.embedThumbnail,
    embedMetadata: options.embedMetadata,
  };

  if (options.audioOnly) {
    request.audioFormat = options.audioFormat;
    request.audioBitrate = options.audioBitrate;
    // Embedding subtitles into an extracted audio track is not meaningful.
    request.embedSubtitles = false;
    request.downloadSubtitles = false;
    return request;
  }

  const quality = resolveQuality(qualityOptions, options.qualityKey);
  if (quality.formatId) request.formatId = quality.formatId;
  else request.quality = quality.quality ?? "best";
  request.container = options.container;
  return request;
}

/** One-line summary of the current options, shown next to the download button. */
export function describeOptions(
  options: DownloadOptionsValue,
  qualityOptions: QualityOption[],
): string {
  if (options.audioOnly) {
    const bitrate = options.audioBitrate === "0" ? "best" : options.audioBitrate;
    return `${options.audioFormat.toUpperCase()} · ${bitrate} · audio only`;
  }
  const quality = resolveQuality(qualityOptions, options.qualityKey);
  const parts = [quality.label, options.container.toUpperCase()];
  if (options.embedSubtitles) parts.push("subs embedded");
  else if (options.downloadSubtitles) parts.push("subs saved");
  return parts.join(" · ");
}
