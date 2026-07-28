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
  cancelDownload,
  clearHistory,
  getHistory,
  getQueue,
  onDownloadDone,
  onDownloadError,
  onDownloadProgress,
  onDownloadStarted,
  removeHistoryEntry,
  startDownload,
  type DownloadRequest,
  type DownloadStatus,
  type HistoryEntry,
} from "../lib/api";
import { shortErrorMessage } from "../lib/errors";
import { useToast } from "./toast";

/**
 * yt-dlp has no wire protocol for pausing, but it resumes partial `.part`
 * files, so "pause" is implemented as cancel-and-remember: the request is kept
 * in the UI and re-queued on resume, continuing where it left off.
 */
export type QueueStatus = DownloadStatus | "paused";

export interface DownloadItem {
  /** Backend download id; changes when a paused item is resumed. */
  id: string;
  request: DownloadRequest;
  title: string;
  thumbnail: string | null;
  audioOnly: boolean;
  status: QueueStatus;
  percent: number;
  speed: string | null;
  eta: string | null;
  error: string | null;
  filePath: string | null;
  addedAt: number;
}

interface DownloadsContextValue {
  items: DownloadItem[];
  history: HistoryEntry[];
  historyLoading: boolean;
  activeCount: number;
  enqueue: (request: DownloadRequest) => Promise<string | null>;
  enqueueMany: (requests: DownloadRequest[]) => Promise<number>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  dismiss: (id: string) => void;
  clearFinished: () => void;
  refreshHistory: () => Promise<void>;
  removeFromHistory: (id: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

const FINISHED: QueueStatus[] = ["completed", "error", "cancelled"];

export function isFinished(status: QueueStatus): boolean {
  return FINISHED.includes(status);
}

export function isActive(status: QueueStatus): boolean {
  return status === "queued" || status === "downloading";
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  /** Ids whose next "cancelled" event means "paused", not "cancelled". */
  const pausing = useRef<Set<string>>(new Set());

  const refreshHistory = useCallback(async () => {
    try {
      const entries = await getHistory();
      entries.sort((a, b) => b.createdAt - a.createdAt);
      setHistory(entries);
    } catch {
      // History is best-effort; a failed read should not break the screen.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Hydrate from the backend, then stream live updates.
  useEffect(() => {
    void refreshHistory();

    getQueue()
      .then((queued) => {
        if (!queued.length) return;
        setItems((current) => {
          const known = new Set(current.map((item) => item.id));
          const restored = queued
            .filter((item) => !known.has(item.id))
            .map<DownloadItem>((item) => ({
              id: item.id,
              request: { url: item.url, title: item.title },
              title: item.title,
              thumbnail: item.thumbnail,
              audioOnly: item.audioOnly,
              status: item.status,
              percent: 0,
              speed: null,
              eta: null,
              error: null,
              filePath: null,
              addedAt: Date.now(),
            }));
          return [...restored, ...current];
        });
      })
      .catch(() => {
        // Not fatal: the queue is empty on a cold start anyway.
      });

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
      onDownloadProgress(({ id, percent, speed, eta }) => {
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: item.status === "paused" ? item.status : "downloading",
                  percent: Math.max(0, Math.min(100, percent)),
                  speed,
                  eta,
                }
              : item,
          ),
        );
      }),
    );

    track(
      onDownloadStarted(({ id, title }) => {
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "downloading", title: item.title || title }
              : item,
          ),
        );
      }),
    );

    track(
      onDownloadDone(({ id, filePath }) => {
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "completed",
                  percent: 100,
                  speed: null,
                  eta: null,
                  filePath,
                }
              : item,
          ),
        );
        void refreshHistory();
      }),
    );

    track(
      onDownloadError(({ id, message, cancelled }) => {
        const wasPausing = pausing.current.delete(id);
        setItems((current) =>
          current.map((item) => {
            if (item.id !== id) return item;
            if (cancelled && wasPausing) {
              return { ...item, status: "paused", speed: null, eta: null };
            }
            return {
              ...item,
              status: cancelled ? "cancelled" : "error",
              speed: null,
              eta: null,
              error: cancelled ? null : message,
            };
          }),
        );
        if (wasPausing) {
          // A pause is not history-worthy, but the core writes its history entry
          // just after emitting this event, so give that write a head start.
          window.setTimeout(() => {
            removeHistoryEntry(id)
              .then(() => refreshHistory())
              .catch(() => refreshHistory());
          }, 400);
        } else {
          void refreshHistory();
        }
      }),
    );

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [refreshHistory]);

  const startItem = useCallback(
    async (request: DownloadRequest): Promise<DownloadItem> => {
      const id = await startDownload(request);
      return {
        id,
        request,
        title: request.title?.trim() || request.url,
        thumbnail: request.thumbnail ?? null,
        audioOnly: Boolean(request.audioOnly),
        status: "queued",
        percent: 0,
        speed: null,
        eta: null,
        error: null,
        filePath: null,
        addedAt: Date.now(),
      };
    },
    [],
  );

  const enqueue = useCallback(
    async (request: DownloadRequest) => {
      try {
        const item = await startItem(request);
        setItems((current) => [item, ...current]);
        return item.id;
      } catch (error) {
        push({
          tone: "error",
          title: "Could not start download",
          description: shortErrorMessage(error),
        });
        return null;
      }
    },
    [push, startItem],
  );

  const enqueueMany = useCallback(
    async (requests: DownloadRequest[]) => {
      const started: DownloadItem[] = [];
      let failures = 0;
      for (const request of requests) {
        try {
          started.push(await startItem(request));
        } catch {
          failures += 1;
        }
      }
      if (started.length) setItems((current) => [...started, ...current]);
      if (failures) {
        push({
          tone: "error",
          title: `${failures} download${failures === 1 ? "" : "s"} could not be queued`,
        });
      }
      return started.length;
    },
    [push, startItem],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await cancelDownload(id);
      } catch (error) {
        push({
          tone: "error",
          title: "Could not cancel download",
          description: shortErrorMessage(error),
        });
      }
    },
    [push],
  );

  const pause = useCallback(
    async (id: string) => {
      pausing.current.add(id);
      try {
        await cancelDownload(id);
      } catch (error) {
        pausing.current.delete(id);
        push({
          tone: "error",
          title: "Could not pause download",
          description: shortErrorMessage(error),
        });
      }
    },
    [push],
  );

  const requeue = useCallback(
    async (id: string, resetProgress: boolean) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return;
      try {
        const newId = await startDownload(item.request);
        setItems((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  id: newId,
                  status: "queued",
                  error: null,
                  speed: null,
                  eta: null,
                  percent: resetProgress ? 0 : entry.percent,
                }
              : entry,
          ),
        );
      } catch (error) {
        push({
          tone: "error",
          title: "Could not resume download",
          description: shortErrorMessage(error),
        });
      }
    },
    [items, push],
  );

  const resume = useCallback((id: string) => requeue(id, false), [requeue]);
  const retry = useCallback((id: string) => requeue(id, true), [requeue]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => !isFinished(item.status)));
  }, []);

  const removeFromHistory = useCallback(
    async (id: string) => {
      setHistory((current) => current.filter((entry) => entry.id !== id));
      try {
        await removeHistoryEntry(id);
      } catch (error) {
        push({
          tone: "error",
          title: "Could not remove entry",
          description: shortErrorMessage(error),
        });
        void refreshHistory();
      }
    },
    [push, refreshHistory],
  );

  const clearAllHistory = useCallback(async () => {
    setHistory([]);
    try {
      await clearHistory();
    } catch (error) {
      push({
        tone: "error",
        title: "Could not clear history",
        description: shortErrorMessage(error),
      });
      void refreshHistory();
    }
  }, [push, refreshHistory]);

  const activeCount = useMemo(
    () => items.filter((item) => isActive(item.status)).length,
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      history,
      historyLoading,
      activeCount,
      enqueue,
      enqueueMany,
      pause,
      resume,
      cancel,
      retry,
      dismiss,
      clearFinished,
      refreshHistory,
      removeFromHistory,
      clearAllHistory,
    }),
    [
      items,
      history,
      historyLoading,
      activeCount,
      enqueue,
      enqueueMany,
      pause,
      resume,
      cancel,
      retry,
      dismiss,
      clearFinished,
      refreshHistory,
      removeFromHistory,
      clearAllHistory,
    ],
  );

  return (
    <DownloadsContext.Provider value={value}>
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsContextValue {
  const context = useContext(DownloadsContext);
  if (!context)
    throw new Error("useDownloads must be used inside a DownloadsProvider");
  return context;
}
