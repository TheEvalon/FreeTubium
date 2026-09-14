import { useEffect, useRef } from "react";

/**
 * YouTube's IFrame player, hosted by the app's loopback server.
 *
 * The iframe cannot be pointed at youtube.com directly: YouTube requires an
 * HTTP Referer and shows its blocked-playback screen (error 153) without one,
 * and the app window is served from a custom `tauri://` scheme. The loopback
 * page supplies a real http origin and relays commands and events over
 * `postMessage`.
 */

/** `YT.PlayerState` values used here. */
const ENDED = 0;

/**
 * Errors that mean "this player will never show this video, but yt-dlp might".
 * 101 and 150 are the two forms of "the uploader disallowed embedding"; 100 is
 * a video the embed cannot see, which includes private videos the signed-in
 * user may actually have access to.
 */
const NOT_EMBEDDABLE = new Set([100, 101, 150]);

interface PlayerMessage {
  source?: string;
  type?: string;
  state?: number;
  code?: number;
}

export function YouTubeEmbed({
  hostUrl,
  videoId,
  onEnded,
  onNotEmbeddable,
  onError,
}: {
  hostUrl: string;
  videoId: string;
  onEnded: () => void;
  onNotEmbeddable: () => void;
  onError: (code: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  // Keep the callbacks current without re-subscribing the message listener.
  const handlers = useRef({ onEnded, onNotEmbeddable, onError });
  handlers.current = { onEnded, onNotEmbeddable, onError };

  const send = (message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(
      { source: "freetubium-host", ...message },
      "*",
    );
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<PlayerMessage>) => {
      const data = event.data;
      if (!data || data.source !== "freetubium-player") return;

      if (data.type === "ready") {
        ready.current = true;
        send({ type: "load", videoId });
        return;
      }
      if (data.type === "state" && data.state === ENDED) {
        handlers.current.onEnded();
        return;
      }
      if (data.type === "error" && typeof data.code === "number") {
        if (NOT_EMBEDDABLE.has(data.code)) handlers.current.onNotEmbeddable();
        else handlers.current.onError(data.code);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoId]);

  // Switch videos in place rather than reloading the iframe, which would cost
  // another IFrame API load per queue item.
  useEffect(() => {
    if (ready.current) send({ type: "load", videoId });
  }, [videoId]);

  // A new host page means a new player, so wait for it to announce itself.
  useEffect(() => {
    ready.current = false;
  }, [hostUrl]);

  return (
    <iframe
      ref={frameRef}
      src={hostUrl}
      title="YouTube player"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      className="size-full border-0 bg-black"
    />
  );
}
