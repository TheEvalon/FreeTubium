import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ClipboardPaste,
  Download,
  Link2,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DownloadOptions } from "../components/DownloadOptions";
import { PlaylistPicker } from "../components/PlaylistPicker";
import { SignInHint } from "../components/SignInHint";
import { VideoCard } from "../components/VideoCard";
import { Button, IconButton } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Spinner } from "../components/ui/Spinner";
import { looksLikeUrl, readClipboardText } from "../lib/clipboard";
import type { DownloadRequest, PlaylistEntry } from "../lib/api";
import {
  buildRequest,
  describeOptions,
  initialOptions,
  resolveQuality,
  type DownloadOptionsValue,
} from "../lib/downloadOptions";
import {
  allHaveIndex,
  buildQualityOptions,
  defaultQualityOptions,
  estimateSize,
  toPlaylistItems,
} from "../lib/quality";
import { useAnalyzer } from "../state/analyzer";
import { useDownloads } from "../state/downloads";
import { useSettings } from "../state/settings";
import { useToast } from "../state/toast";

const EXAMPLES = [
  "youtube.com/watch?v=…",
  "youtube.com/playlist?list=…",
  "vimeo.com, twitch, soundcloud, and ~1800 more",
];

export function HomeScreen({ onQueued }: { onQueued: () => void }) {
  const { settings, loading: settingsLoading } = useSettings();
  const { url, setUrl, result, analyzing, error, analyze, reset } = useAnalyzer();
  const { enqueue, enqueueMany } = useDownloads();
  const { push } = useToast();

  const [options, setOptions] = useState<DownloadOptionsValue>(() =>
    initialOptions(settings),
  );
  const [queueing, setQueueing] = useState(false);
  const [fromClipboard, setFromClipboard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsSynced = useRef(false);

  // Adopt the persisted defaults once settings have loaded.
  useEffect(() => {
    if (settingsLoading || optionsSynced.current) return;
    optionsSynced.current = true;
    setOptions(initialOptions(settings));
  }, [settings, settingsLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Offer whatever link is already on the clipboard, once per visit to the screen.
  useEffect(() => {
    let cancelled = false;
    if (url || result) return;
    void readClipboardText().then((text) => {
      if (cancelled || !text || !looksLikeUrl(text)) return;
      setUrl(text);
      setFromClipboard(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const video = result?.video ?? null;
  const isPlaylist = Boolean(result?.isPlaylist);

  const qualityOptions = useMemo(
    () =>
      video && video.formats.length
        ? buildQualityOptions(video.formats)
        : defaultQualityOptions(),
    [video],
  );

  // Keep the picked quality valid when a new analysis offers different rungs.
  useEffect(() => {
    setOptions((current) =>
      qualityOptions.some((option) => option.key === current.qualityKey)
        ? current
        : { ...current, qualityKey: "best" },
    );
  }, [qualityOptions]);

  const estimatedBytes = useMemo(
    () =>
      video && !options.audioOnly
        ? estimateSize(video.formats, resolveQuality(qualityOptions, options.qualityKey))
        : null,
    [video, options.audioOnly, options.qualityKey, qualityOptions],
  );

  const patchOptions = (patch: Partial<DownloadOptionsValue>) =>
    setOptions((current) => ({ ...current, ...patch }));

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
    if (looksLikeUrl(text)) void analyze(text);
    else inputRef.current?.focus();
  };

  const handleAnalyze = () => {
    if (!url.trim() || analyzing) return;
    setFromClipboard(false);
    void analyze();
  };

  const handleReset = () => {
    setFromClipboard(false);
    reset();
    inputRef.current?.focus();
  };

  const startSingle = async () => {
    if (!video) return;
    setQueueing(true);
    const request = buildRequest(
      {
        url: video.url || url,
        title: video.title,
        thumbnail: video.thumbnail ?? undefined,
      },
      options,
      qualityOptions,
    );
    const id = await enqueue(request);
    setQueueing(false);
    if (id) {
      push({ tone: "success", title: "Added to downloads", description: video.title });
      reset();
      onQueued();
    }
  };

  const startPlaylist = async (entries: PlaylistEntry[]) => {
    if (!result || !entries.length) return;
    setQueueing(true);

    const playlistTitle = result.playlistTitle ?? "Playlist";
    let queued = 0;

    if (allHaveIndex(entries) && entries.length > 1) {
      // One yt-dlp run for the whole selection keeps playlist numbering intact.
      const request = buildRequest(
        {
          url,
          title: `${playlistTitle} (${entries.length} items)`,
          thumbnail: entries[0]?.thumbnail ?? undefined,
          isPlaylist: true,
          playlistItems: toPlaylistItems(
            entries.map((entry) => entry.playlistIndex as number),
          ),
        },
        options,
        qualityOptions,
      );
      queued = (await enqueue(request)) ? 1 : 0;
    } else {
      const requests: DownloadRequest[] = entries.map((entry) =>
        buildRequest(
          {
            url: entry.url ?? url,
            title: entry.title,
            thumbnail: entry.thumbnail ?? undefined,
          },
          options,
          qualityOptions,
        ),
      );
      queued = await enqueueMany(requests);
    }

    setQueueing(false);
    if (queued) {
      push({
        tone: "success",
        title: `Queued ${entries.length} item${entries.length === 1 ? "" : "s"}`,
        description: playlistTitle,
      });
      reset();
      onQueued();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-2 pt-6 text-center"
      >
        <h1 className="text-2xl font-semibold tracking-tight">
          Paste a link, get the <span className="accent-text">file</span>.
        </h1>
        <p className="max-w-md text-sm text-ink-muted">
          Videos, playlists and audio from YouTube and hundreds of other sites —
          powered by the bundled yt-dlp.
        </p>
      </motion.div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              ref={inputRef}
              value={url}
              onChange={(event) => {
                setFromClipboard(false);
                setUrl(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAnalyze();
                if (event.key === "Escape") handleReset();
              }}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://www.youtube.com/watch?v=…"
              aria-label="Video or playlist URL"
              className="focus-ring h-12 w-full rounded-2xl border border-hairline bg-canvas-soft/70 pr-10 pl-10 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-hairline-strong focus:border-violet/60"
            />
            {url ? (
              <button
                type="button"
                aria-label="Clear"
                onClick={handleReset}
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
              onClick={handleAnalyze}
            >
              Analyze
            </Button>
          </div>
        </div>

        {fromClipboard ? (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 text-[0.7rem] text-violet"
          >
            <ClipboardPaste className="size-3" />
            Filled in from your clipboard — press Analyze to continue.
          </motion.p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-ink-faint">
            <Sparkles className="size-3" />
            {EXAMPLES.map((example, index) => (
              <span key={example}>
                {example}
                {index < EXAMPLES.length - 1 ? " ·" : ""}
              </span>
            ))}
          </div>
        )}
      </Card>

      <AnimatePresence mode="wait">
        {analyzing ? (
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
                  Fetching metadata and available formats.
                </p>
              </div>
            </Card>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="flex items-start gap-3 border-negative/35">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Could not read that link</p>
                <p className="mt-1 text-xs leading-relaxed break-words text-ink-muted">
                  {error}
                </p>
                <SignInHint message={error} className="mt-2.5" />
              </div>
              <IconButton label="Try again" onClick={handleAnalyze}>
                <RotateCcw className="size-4" />
              </IconButton>
            </Card>
          </motion.div>
        ) : isPlaylist && result ? (
          <motion.div
            key="playlist"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <PlaylistPicker
              result={result}
              options={options}
              onOptionsChange={patchOptions}
              qualityOptions={qualityOptions}
              onDownload={startPlaylist}
              busy={queueing}
            />
          </motion.div>
        ) : video ? (
          <motion.div
            key="video"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="flex flex-col gap-5">
              <VideoCard video={video} estimatedBytes={estimatedBytes} />
              <div className="border-t border-hairline pt-4">
                <DownloadOptions
                  scope="home"
                  options={options}
                  onChange={patchOptions}
                  qualityOptions={qualityOptions}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                <p className="text-xs text-ink-muted">
                  {describeOptions(options, qualityOptions)}
                </p>
                <Button
                  size="lg"
                  variant="primary"
                  icon={<Download className="size-4" />}
                  loading={queueing}
                  onClick={startSingle}
                >
                  Download
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
