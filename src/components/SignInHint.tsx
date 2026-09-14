import { KeyRound } from "lucide-react";

import { cn } from "../lib/cn";
import { needsAuthentication } from "../lib/youtube";
import {
  SETTINGS_YOUTUBE_ACCOUNT,
  useNavigation,
} from "../state/navigation";

/**
 * Turns a sign-in-related yt-dlp failure into something the user can act on.
 *
 * yt-dlp's own message tells people to pass `--cookies-from-browser`, a flag
 * they have no way to type from inside the app, so every failure that looks
 * like a missing or expired session gets this instead. Cookies also rotate on
 * their own, which makes "set one up" and "do it again" the same prompt.
 *
 * Renders nothing when the failure is unrelated to signing in, so call sites
 * can hand it any error message without checking first.
 */
export function SignInHint({
  message,
  tone = "block",
  className,
}: {
  message: string | null | undefined;
  /** `block` for a standalone notice, `inline` inside an existing error line. */
  tone?: "block" | "inline";
  className?: string;
}) {
  const { navigate } = useNavigation();

  if (!message || !needsAuthentication(message)) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-warning",
        tone === "block"
          ? "rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed"
          : "text-[0.7rem] leading-relaxed",
        className,
      )}
    >
      <KeyRound className="size-3.5 shrink-0" />
      <span>This needs a signed-in YouTube account.</span>
      <button
        type="button"
        onClick={() => navigate("settings", SETTINGS_YOUTUBE_ACCOUNT)}
        className="focus-ring cursor-pointer rounded font-medium underline decoration-warning/50 underline-offset-2 hover:decoration-warning"
      >
        Set one up, or capture your cookies again
      </button>
    </div>
  );
}
