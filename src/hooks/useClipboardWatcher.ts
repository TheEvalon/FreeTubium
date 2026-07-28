import { useCallback, useEffect, useRef, useState } from "react";

import { looksLikeUrl, readClipboardText } from "../lib/clipboard";

const POLL_MS = 1500;

/**
 * Polls the clipboard while the window is focused and surfaces the first new
 * URL it sees. Each URL is only offered once; `ignore` marks URLs the app
 * already knows about (e.g. the one in the input).
 */
export function useClipboardWatcher({
  enabled,
  ignore,
}: {
  enabled: boolean;
  ignore: string[];
}) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;

  const dismiss = useCallback(() => {
    setSuggestion((current) => {
      if (current) seen.current.add(current);
      return null;
    });
  }, []);

  const consume = useCallback(() => {
    setSuggestion((current) => {
      if (current) seen.current.add(current);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;

    const check = async () => {
      if (cancelled || document.hidden || !document.hasFocus()) return;
      const text = await readClipboardText();
      if (cancelled || !text || !looksLikeUrl(text)) return;
      if (seen.current.has(text) || ignoreRef.current.includes(text)) return;
      setSuggestion(text);
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [enabled]);

  return { suggestion, dismiss, consume };
}
