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

/**
 * Why a yt-dlp failure points at the YouTube account settings.
 *
 * `"signin"` means the content itself needs an account. YouTube also rotates
 * cookies and can invalidate a captured session at any time, so this covers
 * re-capturing as much as setting up for the first time.
 *
 * `"cookies"` means the chosen cookie source is broken rather than missing —
 * a browser whose store yt-dlp cannot read, which is the documented state of
 * Chrome 127 and later, or a file that is not in Netscape format. Both are
 * fixed in the same place, but telling someone to sign in when they already
 * did would send them in a circle.
 */
export type AuthProblem = "signin" | "cookies";

const SIGN_IN_PATTERNS = [
  /sign in to confirm/i,
  /confirm your age/i,
  /age-?restricted/i,
  /members-only/i,
  /private video/i,
  /this video is available to this channel's members/i,
  /use --cookies/i,
  /cookies are no longer valid/i,
  /account.*(cookies|sign)/i,
];

const COOKIE_SOURCE_PATTERNS = [
  /could not find .*cookies database/i,
  /could not (copy|read|open|decrypt) .*cookie/i,
  /failed to decrypt .*cookie/i,
  /unsupported browser/i,
  /netscape format/i,
  /cookie(s)? (file|database).*(invalid|malformed|not)/i,
];

export function authProblem(
  message: string | null | undefined,
): AuthProblem | null {
  if (!message) return null;
  // The cookie-source check runs first: those failures often also mention
  // cookies in a way the sign-in patterns would claim.
  if (COOKIE_SOURCE_PATTERNS.some((pattern) => pattern.test(message))) {
    return "cookies";
  }
  if (SIGN_IN_PATTERNS.some((pattern) => pattern.test(message))) {
    return "signin";
  }
  return null;
}
