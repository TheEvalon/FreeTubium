import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  analyzeUrl,
  onPrepareError,
  onPrepareProgress,
  onPrepareReady,
  playLocalFile,
  playerPageUrl,
  prepareStream,
  stopStream,
  type AnalyzeResult,
} from "../lib/api";
import { normalizeUrl } from "../lib/clipboard";
import { shortErrorMessage } from "../lib/errors";
import { youtubeVideoId } from "../lib/youtube";
import { useSettings } from "./settings";
import { useToast } from "./toast";

/**
 * Which player is showing an item.
 *
 * `embed` is YouTube's own IFrame player: no bandwidth cost to us, ads and all,
 * and it refuses age-restricted, members-only and embedding-disabled videos.
 * `local` extracts the video with yt-dlp instead, which is slower to start but
 * plays what the embed will not — and honours the user's cookies.
 */
export type WatchEngine = "embed" | "local";

export interface WatchItem {
  /** Stable key for this queue position. */
  key: string;
  /** Canonical page URL, used for extraction. */
  url: string;
  /** YouTube video id, or null for sites the embed cannot play. */
  videoId: string | null;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  /**
   * Set when the item is a finished download rather than something to fetch.
   * Those play straight off disk, so nothing is extracted and nothing is
   * deleted when they are released.
   */
  filePath: string | null;
}

export type PrepareState =
  | { status: "idle" }
  | { status: "preparing"; percent: number }
  /** `url` plays the file; `path` is the file itself, for acting on it. */
  | { status: "ready"; url: string; path: string }
  | { status: "error"; message: string };

interface WatchContextValue {
  /**
   * The Watch page runs its own analyze flow rather than sharing the download
   * screen's, so opening something to watch does not replace whatever the user
   * was about to download.
   */
  url: string;
  setUrl: (url: string) => void;
  analyzing: boolean;
  analyzeError: string | null;
  /** Analyses a link and replaces the queue with it. */
  open: (url?: string) => Promise<void>;
  /** Plays a finished download, with no analysis and no extraction. */
  openFile: (file: WatchFile) => void;
  queue: WatchItem[];
  index: number;
  current: WatchItem | null;
  /** Player showing the current item. */
  engine: WatchEngine;
  prepare: PrepareState;
  /** Loopback page that hosts the embed; null until it has been resolved. */
  embedHostUrl: string | null;
  embedHostError: string | null;
  playlistTitle: string | null;
  playAt: (index: number) => void;
  next: () => void;
  previous: () => void;
  clear: () => void;
  /** Hands the current item to the local player, e.g. after an embed refusal. */
  useLocalPlayer: (reason?: string) => void;
  /** Returns the current item to the embed. */
  useEmbedPlayer: () => void;
  /** Re-runs preparation for the current item after a failure. */
  retryLocal: () => void;
}

/** A finished download, as the history screen knows it. */
export interface WatchFile {
  path: string;
  title: string;
  thumbnail?: string | null;
  /** Page the file came from, so it can still be re-downloaded or saved. */
  url?: string;
}

const WatchContext = createContext<WatchContextValue | null>(null);

function itemsFrom(result: AnalyzeResult, fallbackUrl: string): WatchItem[] {
  if (result.isPlaylist) {
    return result.entries.map((entry, position) => {
      const url = entry.url ?? fallbackUrl;
      return {
        key: `${entry.id || url}-${position}`,
        url,
        videoId: youtubeVideoId(entry.id) ?? youtubeVideoId(url),
        title: entry.title,
        thumbnail: entry.thumbnail,
        duration: entry.duration,
        filePath: null,
      };
    });
  }

  const video = result.video;
  if (!video) return [];
  const url = video.url || fallbackUrl;
  return [
    {
      key: video.id || url,
      url,
      videoId: youtubeVideoId(video.id) ?? youtubeVideoId(url),
      title: video.title,
      thumbnail: video.thumbnail,
      duration: video.duration,
      filePath: null,
    },
  ];
}

export function WatchProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { push } = useToast();

  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [queue, setQueue] = useState<WatchItem[]>([]);
  const [index, setIndex] = useState(0);
  const [playlistTitle, setPlaylistTitle] = useState<string | null>(null);
  /**
   * Engine per item key rather than per index, so a video that fell back to the
   * local player stays there if the user comes back to it.
   */
  const [engines, setEngines] = useState<Record<string, WatchEngine>>({});
  const [prepare, setPrepare] = useState<PrepareState>({ status: "idle" });
  const [embedHostUrl, setEmbedHostUrl] = useState<string | null>(null);
  const [embedHostError, setEmbedHostError] = useState<string | null>(null);

  /** Session currently being prepared or played, so it can be cleaned up. */
  const session = useRef<string | null>(null);
  /** Guards against a slow preparation landing after the user moved on. */
  const prepareId = useRef(0);
  /**
   * A short video can finish before `prepare_stream` has even returned its
   * session id, so outcomes that arrive early are held here and applied once the
   * session is known.
   */
  const earlyReady = useRef<Map<string, { url: string; path: string }>>(
    new Map(),
  );
  const earlyError = useRef<Map<string, string>>(new Map());

  const current = queue[index] ?? null;
  const engine: WatchEngine = current
    ? (engines[current.key] ?? (current.videoId ? "embed" : "local"))
    : "embed";

  // The embed needs a real http origin, which the app's own origin cannot
  // provide, so it is hosted by a small loopback server.
  useEffect(() => {
    let cancelled = false;
    playerPageUrl()
      .then((url) => {
        if (!cancelled) setEmbedHostUrl(url);
      })
      .catch((error) => {
        if (!cancelled) setEmbedHostError(shortErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const releaseSession = useCallback(() => {
    const id = session.current;
    session.current = null;
    if (id) void stopStream(id).catch(() => undefined);
  }, []);

  // Preparation progress arrives from ffmpeg by way of the backend.
  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const track = (promise: Promise<() => void>) => {
      promise
        .then((unlisten) => {
          if (disposed) unlisten();
          else unlisteners.push(unlisten);
        })
        .catch(() => {
          // Event bridge unavailable outside Tauri.
        });
    };

    track(
      onPrepareProgress(({ sessionId, percent }) => {
        if (sessionId !== session.current) return;
        setPrepare((state) =>
          state.status === "preparing" ? { status: "preparing", percent } : state,
        );
      }),
    );

    track(
      onPrepareReady(({ sessionId, url, path }) => {
        if (sessionId !== session.current) {
          earlyReady.current.set(sessionId, { url, path });
          return;
        }
        setPrepare({ status: "ready", url, path });
      }),
    );

    track(
      onPrepareError(({ sessionId, message }) => {
        if (sessionId !== session.current) {
          earlyError.current.set(sessionId, message);
          return;
        }
        setPrepare({ status: "error", message });
      }),
    );

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  const startPreparing = useCallback(
    async (item: WatchItem) => {
      const attempt = ++prepareId.current;
      releaseSession();
      setPrepare({ status: "preparing", percent: 0 });

      let sessionId: string;
      try {
        sessionId = await prepareStream(item.url, settings.watchQuality);
      } catch (error) {
        if (prepareId.current === attempt) {
          setPrepare({ status: "error", message: shortErrorMessage(error) });
        }
        return;
      }

      if (prepareId.current !== attempt) {
        // The user moved on while yt-dlp was still starting up.
        void stopStream(sessionId).catch(() => undefined);
        return;
      }
      session.current = sessionId;

      const failure = earlyError.current.get(sessionId);
      const ready = earlyReady.current.get(sessionId);
      if (failure !== undefined) {
        earlyError.current.delete(sessionId);
        setPrepare({ status: "error", message: failure });
      } else if (ready !== undefined) {
        earlyReady.current.delete(sessionId);
        setPrepare({ status: "ready", ...ready });
      }
    },
    [releaseSession, settings.watchQuality],
  );

  /** Registers a finished download with the loopback server so it can play. */
  const startFile = useCallback(
    async (filePath: string) => {
      const attempt = ++prepareId.current;
      releaseSession();
      setPrepare({ status: "preparing", percent: 0 });

      try {
        const ready = await playLocalFile(filePath);
        if (prepareId.current !== attempt) {
          void stopStream(ready.sessionId).catch(() => undefined);
          return;
        }
        session.current = ready.sessionId;
        setPrepare({ status: "ready", url: ready.url, path: ready.path });
      } catch (error) {
        if (prepareId.current === attempt) {
          setPrepare({ status: "error", message: shortErrorMessage(error) });
        }
      }
    },
    [releaseSession],
  );

  // Drive preparation from whichever item and engine are current.
  useEffect(() => {
    if (!current) {
      prepareId.current += 1;
      releaseSession();
      setPrepare({ status: "idle" });
      return;
    }
    if (engine !== "local") {
      prepareId.current += 1;
      releaseSession();
      setPrepare({ status: "idle" });
      return;
    }
    if (current.filePath) {
      void startFile(current.filePath);
      return;
    }
    void startPreparing(current);
  }, [current, engine, releaseSession, startFile, startPreparing]);

  // Stop any running ffmpeg when the app closes the page.
  useEffect(() => releaseSession, [releaseSession]);

  /** Guards against a slow analysis replacing a newer queue. */
  const analyzeAttempt = useRef(0);

  const open = useCallback(
    async (candidate?: string) => {
      const target = normalizeUrl(candidate ?? url);
      if (!target) return;
      const attempt = ++analyzeAttempt.current;

      setUrl(target);
      setAnalyzing(true);
      setAnalyzeError(null);
      try {
        const result: AnalyzeResult = await analyzeUrl(target);
        if (analyzeAttempt.current !== attempt) return;

        const items = itemsFrom(result, target);
        if (!items.length) {
          setAnalyzeError("There is nothing playable at that link.");
          return;
        }
        setQueue(items);
        setIndex(0);
        setEngines({});
        setPlaylistTitle(result.isPlaylist ? result.playlistTitle : null);
      } catch (error) {
        if (analyzeAttempt.current === attempt) {
          setAnalyzeError(shortErrorMessage(error));
        }
      } finally {
        if (analyzeAttempt.current === attempt) setAnalyzing(false);
      }
    },
    [url],
  );

  const openFile = useCallback((file: WatchFile) => {
    // Cancels an analysis still in flight, which would otherwise land later and
    // replace the file the user just asked for.
    analyzeAttempt.current += 1;
    setAnalyzing(false);
    setAnalyzeError(null);
    setUrl("");

    const item: WatchItem = {
      key: `file:${file.path}`,
      // The page it came from when that is known, so it can still be saved.
      url: file.url || file.path,
      // Left null so the item stays with the local player: the point of opening
      // a download is to play that file, not to stream it again.
      videoId: null,
      title: file.title,
      thumbnail: file.thumbnail ?? null,
      duration: null,
      filePath: file.path,
    };
    setQueue([item]);
    setIndex(0);
    setEngines({ [item.key]: "local" });
    setPlaylistTitle(null);
  }, []);

  const playAt = useCallback(
    (target: number) => {
      setIndex((currentIndex) => {
        if (target < 0 || target >= queue.length) return currentIndex;
        return target;
      });
    },
    [queue.length],
  );

  const next = useCallback(() => {
    setIndex((currentIndex) =>
      currentIndex + 1 < queue.length ? currentIndex + 1 : currentIndex,
    );
  }, [queue.length]);

  const previous = useCallback(() => {
    setIndex((currentIndex) => (currentIndex > 0 ? currentIndex - 1 : currentIndex));
  }, []);

  const clear = useCallback(() => {
    analyzeAttempt.current += 1;
    setUrl("");
    setAnalyzing(false);
    setAnalyzeError(null);
    setQueue([]);
    setIndex(0);
    setEngines({});
    setPlaylistTitle(null);
  }, []);

  const useLocalPlayer = useCallback(
    (reason?: string) => {
      if (!current) return;
      setEngines((state) => ({ ...state, [current.key]: "local" }));
      if (reason) {
        push({ tone: "info", title: reason, description: current.title });
      }
    },
    [current, push],
  );

  const useEmbedPlayer = useCallback(() => {
    if (!current?.videoId) return;
    setEngines((state) => ({ ...state, [current.key]: "embed" }));
  }, [current]);

  const retryLocal = useCallback(() => {
    if (!current) return;
    // Worth retrying for a file too: the usual failure is that it was moved or
    // deleted since the download finished, which the user can put right.
    if (current.filePath) void startFile(current.filePath);
    else void startPreparing(current);
  }, [current, startFile, startPreparing]);

  const value = useMemo(
    () => ({
      url,
      setUrl,
      analyzing,
      analyzeError,
      open,
      openFile,
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
    }),
    [
      url,
      analyzing,
      analyzeError,
      open,
      openFile,
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
    ],
  );

  return <WatchContext.Provider value={value}>{children}</WatchContext.Provider>;
}

export function useWatch(): WatchContextValue {
  const context = useContext(WatchContext);
  if (!context) throw new Error("useWatch must be used inside a WatchProvider");
  return context;
}
