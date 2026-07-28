/** Turns anything a rejected Tauri invoke can throw into a readable message. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong";
}

/** Trims yt-dlp's multi-line stderr down to something a toast can show. */
export function shortErrorMessage(error: unknown, maxLength = 220): string {
  const raw = errorMessage(error)
    .split("\n")
    .map((line) => line.replace(/^ERROR:\s*/i, "").trim())
    .filter(Boolean)
    .join(" — ");
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw;
}

/** True when running outside a Tauri webview (e.g. plain `vite dev`). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
