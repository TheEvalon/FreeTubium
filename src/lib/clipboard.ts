/**
 * Clipboard access for the paste button and the optional clipboard watcher.
 *
 * The Rust core exposes no clipboard command, so this uses the webview's async
 * clipboard API and degrades gracefully when the platform denies read access
 * (in that case users can still paste with Ctrl/Cmd+V).
 */

export async function readClipboardText(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText) return null;
    const text = await navigator.clipboard.readText();
    return text?.trim() ? text.trim() : null;
  } catch {
    return null;
  }
}

const URL_LIKE = /^(https?:\/\/|www\.)[^\s]+$/i;

/** True for a single http(s) URL — what the analyzer accepts. */
export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (!URL_LIKE.test(trimmed)) return false;
  try {
    new URL(trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed);
    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed;
}
