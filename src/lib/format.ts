/** Formatting helpers shared across the UI. */

/** 3725 -> "1:02:05", 95 -> "1:35", null -> "--:--" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Sums a list of possibly-missing durations into a rough "1h 24m" label. */
export function formatTotalDuration(
  durations: Array<number | null | undefined>,
): string {
  const total = durations.reduce<number>(
    (sum, d) => sum + (d && Number.isFinite(d) ? d : 0),
    0,
  );
  if (total <= 0) return "unknown length";
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(total)}s`;
}

export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatCount(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count)) return null;
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
  if (count < 1_000_000_000)
    return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0)}M`;
  return `${(count / 1_000_000_000).toFixed(1)}B`;
}

/** yt-dlp upload dates arrive as "20240131". */
export function formatUploadDate(raw: string | null | undefined): string | null {
  if (!raw || raw.length !== 8) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Unix seconds -> "just now" / "3h ago" / "12 Mar 2024". */
export function formatRelativeTime(unixSeconds: number): string {
  const deltaSeconds = Date.now() / 1000 - unixSeconds;
  if (deltaSeconds < 60) return "just now";
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86_400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  if (deltaSeconds < 7 * 86_400) return `${Math.floor(deltaSeconds / 86_400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** yt-dlp speed strings can be "Unknown B/s" or padded; normalise for display. */
export function formatSpeed(speed: string | null | undefined): string | null {
  const trimmed = speed?.trim();
  if (!trimmed || /unknown/i.test(trimmed) || trimmed === "N/A") return null;
  return trimmed.replace("iB/s", "B/s");
}

export function formatEta(eta: string | null | undefined): string | null {
  const trimmed = eta?.trim();
  if (!trimmed || /unknown/i.test(trimmed) || trimmed === "N/A") return null;
  return trimmed;
}

/** Last path segment of a Windows or POSIX path. */
export function baseName(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
