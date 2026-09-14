import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ClipboardPaste,
  Download,
  Link2,
  MonitorPlay,
  Search,
  SkipBack,
  SkipForward,
  Tv,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SignInHint } from "../components/SignInHint";
import { LocalPlayer } from "../components/watch/LocalPlayer";
import { PlaylistQueue } from "../components/watch/PlaylistQueue";
import { YouTubeEmbed } from "../components/watch/YouTubeEmbed";
import { Badge } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { looksLikeUrl, readClipboardText } from "../lib/clipboard";
import { formatDuration } from "../lib/format";
import { buildRequest, initialOptions } from "../lib/downloadOptions";
import { defaultQualityOptions } from "../lib/quality";
import { useDownloads } from "../state/downloads";
import { useSettings } from "../state/settings";
import { useToast } from "../state/toast";
import { useWatch } from "../state/watch";

export function WatchScreen() {
  const { settings } = useSettings();
  const { push } = useToast();
  const { enqueue } = useDownloads();
  const {
    url,
    setUrl,
    analyzing,
    analyzeError,
    open,
    queue,
    index,
    current,
    engine,
    prepare,
    embedHostUrl,
    embedHostError,
    playlistTitle,
    playAt,
    next,
    previous,
    clear,
    useLocalPlayer,
    useEmbedPlayer,
    retryLocal,
  } = useWatch();

  const inputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!queue.length) inputRef.current?.focus();
  }, [queue.length]);

  const handlePaste = async () => {
    const text = await readClipboardText();
    if (!text) {
      inputRef.current?.focus();
      push({
        tone: "info",
        title: "Clipboard is not readable here",
        description: "Press Ctrl+V in the field to paste the link instead.",
      });
      return;
    }
    setUrl(text);
    if (looksLikeUrl(text)) void open(text);
    else inputRef.current?.focus();
  };

  const handleClear = () => {
    clear();
    inputRef.current?.focus();
  };

  /** Sends whatever is playing to the download queue. */
  const saveCurrent = async () => {
    if (!current) return;
    setSaving(true);
    const id = await enqueue(
      buildRequest(
        {
          url: current.url,
          title: current.title,
          thumbnail: current.thumbnail ?? undefined,
        },
        initialOptions(settings),
        defaultQualityOptions(),
      ),
    );
    setSaving(false);
    if (id) {
      push({
        tone: "success",
        title: "Added to downloads",
        description: current.title,
      });
    }
  };

  const isLast = index >= queue.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void open();
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste a video or playlist link to watch"
              aria-label="Video or playlist URL to watch"
              className="focus-ring h-12 w-full rounded-2xl border border-hairline bg-canvas-soft/70 pr-10 pl-10 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-hairline-strong focus:border-violet/60"
            />
            {url ? (
              <button
                type="button"
                aria-label="Clear"
                onClick={handleClear}
                className="focus-ring absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:text-ink"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              size="lg"
              variant="secondary"
              icon={<ClipboardPaste className="size-4" />}
              onClick={handlePaste}
            >
              Paste
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={<Search className="size-4" />}
              loading={analyzing}
              disabled={!url.trim()}
              onClick={() => void open()}
            >
              Watch
            </Button>
          </div>
        </div>

        {analyzeError ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-1.5 text-xs text-negative">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {analyzeError}
            </p>
            <SignInHint message={analyzeError} />
          </div>
        ) : null}
      </Card>

      <AnimatePresence mode="wait">
        {analyzing && !queue.length ? (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="flex items-center gap-3 py-6">
              <Spinner className="size-5 text-violet" />
              <div>
                <p className="text-sm font-medium text-ink">Reading the link…</p>
                <p className="text-xs text-ink-muted">
                  Building the play queue.
                </p>
              </div>
            </Card>
          </motion.div>
        ) : !current ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <EmptyState
              icon={<MonitorPlay className="size-5" />}
              title="Watch without leaving the app"
              description="Paste a video or playlist link above. Videos play in YouTube's own player; anything it refuses — age-restricted, members-only or embedding-disabled — falls back to a local player that uses the bundled yt-dlp."
            />
          </motion.div>
        ) : (
          <motion.div
            key="player"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-4"
          >
            <div className="overflow-hidden rounded-xcard border border-hairline bg-black">
              <div className="aspect-video w-full">
                {engine === "embed" && current.videoId ? (
                  embedHostUrl ? (
                    <YouTubeEmbed
                      hostUrl={embedHostUrl}
                      videoId={current.videoId}
                      onEnded={next}
                      onNotEmbeddable={() =>
                        useLocalPlayer("Not available in YouTube's player — playing it locally")
                      }
                      onError={(code) =>
                        push({
                          tone: "error",
                          title: `YouTube player error ${code}`,
                          description: current.title,
                        })
                      }
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
                      {embedHostError ? (
                        <>
                          <AlertTriangle className="size-6 text-warning" />
                          <p className="max-w-md text-xs leading-relaxed text-white/70">
                            The embedded player could not start: {embedHostError}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => useLocalPlayer()}
                          >
                            Play locally instead
                          </Button>
                        </>
                      ) : (
                        <Spinner className="size-6 text-violet" />
                      )}
                    </div>
                  )
                ) : (
                  <LocalPlayer
                    prepare={prepare}
                    title={current.title}
                    onEnded={next}
                    onRetry={retryLocal}
                    onSave={() => void saveCurrent()}
                  />
                )}
              </div>
            </div>

            <Card className="flex flex-col gap-3 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={current.title}>
                    {current.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge
                      tone={engine === "embed" ? "accent" : "neutral"}
                      icon={
                        engine === "embed" ? (
                          <Tv className="size-3" />
                        ) : (
                          <MonitorPlay className="size-3" />
                        )
                      }
                    >
                      {engine === "embed" ? "YouTube player" : "Local player"}
                    </Badge>
                    {current.duration ? (
                      <Badge tone="neutral">{formatDuration(current.duration)}</Badge>
                    ) : null}
                    {queue.length > 1 ? (
                      <Badge tone="neutral">
                        {index + 1} of {queue.length}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {queue.length > 1 ? (
                    <>
                      <IconButton
                        label="Previous"
                        disabled={index === 0}
                        onClick={previous}
                      >
                        <SkipBack className="size-4" />
                      </IconButton>
                      <IconButton label="Next" disabled={isLast} onClick={next}>
                        <SkipForward className="size-4" />
                      </IconButton>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download className="size-4" />}
                    loading={saving}
                    onClick={saveCurrent}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                {engine === "embed" ? (
                  <Button size="sm" variant="ghost" onClick={() => useLocalPlayer()}>
                    Play locally instead
                  </Button>
                ) : current.videoId ? (
                  <Button size="sm" variant="ghost" onClick={useEmbedPlayer}>
                    Try YouTube's player
                  </Button>
                ) : null}
                <p className="ml-auto text-xs text-ink-faint">
                  {engine === "local"
                    ? "Extracted with the bundled yt-dlp, using your YouTube cookies when set up."
                    : "Streamed by YouTube, so views and ads count normally."}
                </p>
              </div>
            </Card>

            {queue.length > 1 ? (
              <PlaylistQueue
                items={queue}
                index={index}
                title={playlistTitle}
                onPlay={playAt}
              />
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
