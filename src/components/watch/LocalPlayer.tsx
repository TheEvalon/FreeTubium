import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { needsAuthentication } from "../../lib/youtube";
import type { PrepareState } from "../../state/watch";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { Spinner } from "../ui/Spinner";

/**
 * Plays a video the embed refused, using the file prepared by the bundled
 * ffmpeg.
 *
 * The file is played only once it is complete. YouTube offers no muxed formats
 * any more, so preparation combines a separate video and audio stream, and an
 * MP4 is not playable until its index has been written. Waiting costs time up
 * front but makes the whole file seekable, which matters more than a fast start
 * on a path that only handles restricted videos.
 */
export function LocalPlayer({
  prepare,
  title,
  onEnded,
  onRetry,
}: {
  prepare: PrepareState;
  title: string;
  onEnded: () => void;
  onRetry: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const src = useMemo(
    () => (prepare.status === "ready" ? convertFileSrc(prepare.path) : null),
    [prepare],
  );

  // Autoplay when a new file becomes ready, matching the embed's behaviour.
  useEffect(() => {
    if (!src) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay can be refused; the controls are right there.
    });
  }, [src]);

  if (prepare.status === "error") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center">
        <AlertTriangle className="size-6 text-negative" />
        <div>
          <p className="text-sm font-medium text-white">Could not play this video</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-white/70">
            {prepare.message}
          </p>
          {needsAuthentication(prepare.message) ? (
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-warning">
              This needs a signed-in account. Set one up under Settings →
              YouTube account, or capture your cookies again if you already did.
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw className="size-4" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (prepare.status !== "ready" || !src) {
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
      className="size-full bg-black"
    />
  );
}
