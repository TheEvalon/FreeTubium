/**
 * YouTube URL helpers for the Watch page.
 *
 * The embedded player only works for YouTube, so the Watch page needs to know
 * both whether a URL is a YouTube video and what its id is. Everything else
 * goes straight to the local player, which handles any site yt-dlp supports.
 */

const ID_PATTERN = /^[\w-]{11}$/;

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

/** Extracts the 11-character video id from any YouTube URL shape. */
export function youtubeVideoId(url: string): string | null {
  // Playlist analysis hands back bare ids for entries.
  if (ID_PATTERN.test(url)) return url;

  let parsed: URL;
  try {
    parsed = new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(parsed.hostname)) return null;

  if (parsed.hostname.endsWith("youtu.be")) {
    const id = parsed.pathname.slice(1).split("/")[0];
    return ID_PATTERN.test(id) ? id : null;
  }

  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery && ID_PATTERN.test(fromQuery)) return fromQuery;

  // /embed/ID, /shorts/ID and /live/ID all carry the id as the last segment.
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && ["embed", "shorts", "live", "v"].includes(segments[0])) {
    const id = segments[1];
    return ID_PATTERN.test(id) ? id : null;
  }

  return null;
}

export function watchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
