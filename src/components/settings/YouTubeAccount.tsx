import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Check,
  FileUp,
  Globe,
  Info,
  LogIn,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  captureYoutubeCookies,
  clearYoutubeAuth,
  importCookiesFile,
  openYoutubeLogin,
  useBrowserCookies,
  youtubeAuthStatus,
  type AuthStatus,
  type CookieBrowser,
} from "../../lib/api";
import { shortErrorMessage } from "../../lib/errors";
import { useToast } from "../../state/toast";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Field, Select } from "../ui/Field";

/**
 * Browsers yt-dlp can read cookies from.
 *
 * Chrome and the other Chromium browsers are listed because yt-dlp accepts
 * them, but Chrome 127 and later encrypt their cookie store in a way yt-dlp
 * cannot read, so Firefox is the one that reliably works.
 */
const BROWSERS: Array<{ value: CookieBrowser; label: string }> = [
  { value: "firefox", label: "Firefox (recommended)" },
  { value: "brave", label: "Brave" },
  { value: "chrome", label: "Chrome" },
  { value: "chromium", label: "Chromium" },
  { value: "edge", label: "Edge" },
  { value: "opera", label: "Opera" },
  { value: "safari", label: "Safari" },
  { value: "vivaldi", label: "Vivaldi" },
  { value: "whale", label: "Whale" },
];

function StatusBadge({ status }: { status: AuthStatus | null }) {
  if (!status || status.mode === "none") {
    return <Badge tone="neutral">Signed out</Badge>;
  }
  if (status.mode === "browser") {
    return (
      <Badge tone="accent" icon={<Globe className="size-3" />}>
        Reading {status.browser} cookies
      </Badge>
    );
  }
  if (!status.cookieFileExists) {
    return (
      <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>
        Cookie file missing
      </Badge>
    );
  }
  return (
    <Badge
      tone={status.signedIn ? "positive" : "warning"}
      icon={status.signedIn ? <Check className="size-3" /> : undefined}
    >
      {status.signedIn
        ? `Signed in · ${status.cookieCount} cookies`
        : `${status.cookieCount} cookies, not signed in`}
    </Badge>
  );
}

export function YouTubeAccount() {
  const { push } = useToast();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [browser, setBrowser] = useState<CookieBrowser>("firefox");
  const [awaitingCapture, setAwaitingCapture] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await youtubeAuthStatus();
      setStatus(next);
      if (next.browser) setBrowser(next.browser);
    } catch {
      // Not fatal: the section just shows "signed out".
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs an auth action, reporting the outcome and refreshing the status. */
  const run = async (
    action: () => Promise<AuthStatus>,
    success: string,
    failure: string,
  ) => {
    setBusy(true);
    try {
      setStatus(await action());
      push({ tone: "success", title: success });
      setAwaitingCapture(false);
    } catch (error) {
      push({ tone: "error", title: failure, description: shortErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const startSignIn = async () => {
    try {
      await openYoutubeLogin();
      setAwaitingCapture(true);
    } catch (error) {
      push({
        tone: "error",
        title: "Could not open the sign-in window",
        description: shortErrorMessage(error),
      });
    }
  };

  const pickCookieFile = async () => {
    try {
      const picked = await openDialog({
        multiple: false,
        title: "Choose a cookies.txt file",
        filters: [{ name: "Cookie file", extensions: ["txt"] }],
      });
      if (typeof picked !== "string" || !picked) return;
      await run(
        () => importCookiesFile(picked),
        "Cookies imported",
        "Could not import that cookie file",
      );
    } catch (error) {
      push({
        tone: "error",
        title: "Could not open the file picker",
        description: shortErrorMessage(error),
      });
    }
  };

  const signedIn = status ? status.mode !== "none" : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={status} />
        {signedIn ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-3.5" />}
            disabled={busy}
            onClick={() =>
              void run(
                clearYoutubeAuth,
                "Signed out of YouTube",
                "Could not sign out",
              )
            }
          >
            Sign out
          </Button>
        ) : null}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning/10 p-3">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed text-ink-muted">
          <span className="font-medium text-ink">Use a throwaway account.</span>{" "}
          yt-dlp's own guidance is that using an account this way risks YouTube
          temporarily or permanently restricting it. Only sign in if you need
          age-restricted, members-only or private videos.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="text-xs font-medium text-ink">Sign in inside the app</p>
        <p className="text-xs leading-relaxed text-ink-muted">
          Opens a window on Google's sign-in page, then stores that session's
          cookies. Google sometimes refuses to sign in from an embedded browser
          with a "this browser may not be secure" message; if that happens, use
          one of the import options below instead.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={awaitingCapture ? "secondary" : "primary"}
            icon={<LogIn className="size-3.5" />}
            onClick={() => void startSignIn()}
          >
            {awaitingCapture ? "Reopen sign-in" : "Sign in to YouTube"}
          </Button>
          <Button
            size="sm"
            variant={awaitingCapture ? "primary" : "secondary"}
            icon={<RefreshCw className="size-3.5" />}
            loading={busy}
            onClick={() =>
              void run(
                captureYoutubeCookies,
                "Cookies captured",
                "Could not capture cookies",
              )
            }
          >
            {status?.mode === "file" && status.signedIn
              ? "Re-capture cookies"
              : "Capture cookies"}
          </Button>
        </div>
        {awaitingCapture ? (
          <p className="text-xs text-violet">
            Finish signing in, then choose Capture cookies.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="text-xs font-medium text-ink">Read cookies from a browser</p>
        <p className="text-xs leading-relaxed text-ink-muted">
          Reads the cookie store of a browser you are already signed into, every
          time yt-dlp runs. Chrome 127 and later encrypt their cookie store in a
          way yt-dlp cannot read, so prefer Firefox for this option. Close the
          browser first if reading fails.
        </p>
        <Field label="Browser">
          <div className="flex gap-2">
            <Select
              value={browser}
              onChange={(event) => setBrowser(event.target.value as CookieBrowser)}
            >
              {BROWSERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant={status?.mode === "browser" ? "secondary" : "primary"}
              icon={<Globe className="size-3.5" />}
              loading={busy}
              onClick={() =>
                void run(
                  () => useBrowserCookies(browser),
                  `Using ${browser} cookies`,
                  "Could not use that browser",
                )
              }
            >
              Use
            </Button>
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="text-xs font-medium text-ink">Import a cookies.txt</p>
        <p className="text-xs leading-relaxed text-ink-muted">
          For a file exported by a "cookies.txt" browser extension, in Netscape
          format. Export it from a private window that you close without signing
          out, so YouTube does not rotate the session away.
        </p>
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={<FileUp className="size-3.5" />}
            loading={busy}
            onClick={() => void pickCookieFile()}
          >
            Choose file…
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-hairline bg-canvas-soft/60 p-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <p className="text-xs leading-relaxed text-ink-muted">
          Cookies expire, and watching on the Watch page keeps a YouTube session
          alive in the same cookie jar, which can make YouTube rotate them. If
          signed-in videos start failing, capture them again. The stored cookies
          grant access to your account — treat the file like a password.
        </p>
      </div>
    </div>
  );
}
