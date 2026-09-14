import { AlertTriangle, Download, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PrepareState } from "../../state/watch";
import { SignInHint } from "../SignInHint";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { Spinner } from "../ui/Spinner";

/**
 * Plays a video the embed refused, from the file the backend prepared.
 *
 * The file is played only once it is complete. YouTube offers no muxed formats
 * any more, so preparation combines a separate video and audio stream, and an
 * MP4 is not playable until its index has been written. Waiting costs time up
 * front but makes the whole file seekable, which matters more than a fast start
 * on a path that only handles restricted videos.
 *
 * The source is a loopback http URL rather than a file path: WebKitGTK gives
 * media to GStreamer, which refuses every scheme outside `blob`, `data`,
 * `file`, `http` and `https`, so Tauri's `asset://` can never drive a `<video>`
 * on Linux.
 */

/**
 * What the webview says when it cannot play a file that downloaded fine.
 *
 * Preparation forces an MP4 container, but the codecs inside it come from the
 * site, and each platform's webview decodes a different set. Without this the
 * failure is a black rectangle with working controls that never advance.
 */
function decodeFailure(video: HTMLVideoElement): string {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
    case MediaError.MEDIA_ERR_DECODE:
      return "This system cannot decode the video or audio in this file. It downloaded correctly, so saving it and opening it in a media player will work.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "The prepared file could not be read. It may have been cleared while playing.";
    default:
      return video.error?.message || "The prepared file could not be played.";
  }
}

export function LocalPlayer({
  prepare,
  title,
  onEnded,
  onRetry,
  onSave,
}: {
  prepare: PrepareState;
  title: string;
  onEnded: () => void;
  onRetry: () => void;
  onSave: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const src = prepare.status === "ready" ? prepare.url : null;

  // Autoplay when a new file becomes ready, matching the embed's behaviour.
  useEffect(() => {
    setPlaybackError(null);
    if (!src) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay can be refused; the controls are right there.
    });
  }, [src]);

  const failure =
    prepare.status === "error" ? prepare.message : (playbackError ?? null);

  if (failure) {
    // Re-preparing an undecodable file produces the same file, so offer the
    // download instead. A failure during preparation is worth retrying.
    const retryable = prepare.status === "error";
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center">
        <AlertTriangle className="size-6 text-negative" />
        <div>
          <p className="text-sm font-medium text-white">Could not play this video</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-white/70">
            {failure}
          </p>
          <SignInHint
            message={failure}
            className="mx-auto mt-2.5 max-w-md justify-center"
          />
        </div>
        {retryable ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            onClick={onRetry}
          >
            Try again
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="size-4" />}
            onClick={onSave}
          >
            Save to downloads
          </Button>
        )}
      </div>
    );
  }

  if (!src) {
    const percent = prepare.status === "preparing" ? prepare.percent : 0;
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center">
        <Spinner className="size-6 text-violet" />
        <div>
          <p className="text-sm font-medium text-white">Preparing this video…</p>
          <p className="mx-auto mt-1 max-w-md truncate text-xs text-white/70" title={title}>
            {title}
          </p>
        </div>
        <div className="w-full max-w-xs">
          <ProgressBar percent={percent} />
        </div>
        <p className="text-xs text-white/60 tabular-nums">{Math.round(percent)}%</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      controls
      autoPlay
      onEnded={onEnded}
      onError={(event) => setPlaybackError(decodeFailure(event.currentTarget))}
      className="size-full bg-black"
    />
  );
}
