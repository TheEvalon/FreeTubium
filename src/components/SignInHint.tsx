import { KeyRound } from "lucide-react";

import { cn } from "../lib/cn";
import { authProblem, type AuthProblem } from "../lib/youtube";
import {
  SETTINGS_YOUTUBE_ACCOUNT,
  useNavigation,
} from "../state/navigation";

/**
 * Turns an account-related yt-dlp failure into something the user can act on.
 *
 * yt-dlp's own message tells people to pass `--cookies-from-browser`, a flag
 * they have no way to type from inside the app, so both kinds of account
 * failure get this instead.
 *
 * Renders nothing when the failure has nothing to do with the account, so call
 * sites can hand it any error message without checking first.
 */
const COPY: Record<AuthProblem, { problem: string; action: string }> = {
  signin: {
    problem: "This needs a signed-in YouTube account.",
    action: "Set one up, or capture your cookies again",
  },
  cookies: {
    problem: "Your saved cookies could not be read.",
    action: "Pick another browser, or import a cookies.txt",
  },
};

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

  const problem = authProblem(message);
  if (!problem) return null;
  const copy = COPY[problem];

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
      <span>{copy.problem}</span>
      <button
        type="button"
        onClick={() => navigate("settings", SETTINGS_YOUTUBE_ACCOUNT)}
        className="focus-ring cursor-pointer rounded font-medium underline decoration-warning/50 underline-offset-2 hover:decoration-warning"
      >
        {copy.action}
      </button>
    </div>
  );
}
