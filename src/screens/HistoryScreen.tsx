import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Spinner } from "../components/ui/Spinner";
import { Thumbnail } from "../components/ui/Thumbnail";
import { openFolder, type HistoryEntry } from "../lib/api";
import { baseName, formatRelativeTime, hostOf } from "../lib/format";
import { shortErrorMessage } from "../lib/errors";
import { useDownloads } from "../state/downloads";
import { useToast } from "../state/toast";

type Filter = "all" | "completed" | "failed";

const STATUS_BADGE = {
  completed: { label: "Completed", tone: "positive" as const, icon: <CheckCircle2 className="size-3" /> },
  error: { label: "Failed", tone: "negative" as const, icon: <AlertTriangle className="size-3" /> },
  cancelled: { label: "Cancelled", tone: "neutral" as const, icon: <X className="size-3" /> },
  queued: { label: "Queued", tone: "neutral" as const, icon: <Clock className="size-3" /> },
  downloading: { label: "Interrupted", tone: "warning" as const, icon: <Clock className="size-3" /> },
};

export function HistoryScreen({ onQueued }: { onQueued: () => void }) {
  const {
    history,
    historyLoading,
    enqueue,
    removeFromHistory,
    clearAllHistory,
  } = useDownloads();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return history.filter((entry) => {
      if (filter === "completed" && entry.status !== "completed") return false;
      if (filter === "failed" && entry.status === "completed") return false;
      if (!needle) return true;
      return (
        entry.title.toLowerCase().includes(needle) ||
        entry.url.toLowerCase().includes(needle) ||
        (entry.filePath ?? "").toLowerCase().includes(needle)
      );
    });
  }, [history, query, filter]);

  const reveal = async (entry: HistoryEntry) => {
    const target = entry.filePath ?? entry.outputDir;
    if (!target) {
      push({ tone: "info", title: "No file path recorded for this entry" });
      return;
    }
    try {
      await openFolder(target);
    } catch (error) {
      push({
        tone: "error",
        title: "Could not open the folder",
        description: shortErrorMessage(error),
      });
    }
  };

  const redownload = async (entry: HistoryEntry) => {
    const id = await enqueue({
      url: entry.url,
      title: entry.title,
      thumbnail: entry.thumbnail ?? undefined,
      audioOnly: entry.audioOnly,
      outputDir: entry.outputDir || undefined,
    });
    if (id) {
      push({
        tone: "success",
        title: "Re-downloading",
        description: entry.title,
      });
      onQueued();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {history.length
              ? `${history.length} download${history.length === 1 ? "" : "s"} recorded`
              : "Completed downloads will be listed here."}
          </p>
        </div>
        {history.length ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="size-3.5" />}
            onClick={() => void clearAllHistory()}
          >
            Clear history
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, links or files…"
            aria-label="Search history"
            className="focus-ring h-10 w-full rounded-xl border border-hairline bg-canvas-soft/70 pr-9 pl-9 text-sm text-ink transition-colors placeholder:text-ink-faint hover:border-hairline-strong focus:border-violet/60"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="focus-ring absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-colors hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <SegmentedControl
          size="sm"
          layoutId="history-filter"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: "all", label: "All" },
            { value: "completed", label: "Completed" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>

      {historyLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-5 text-violet" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-5" />}
          title={history.length ? "No matches" : "No downloads yet"}
          description={
            history.length
              ? "Try a different search term or filter."
              : "Once a download finishes it lands here, ready to reveal in the folder or fetch again."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visible.map((entry) => {
              const badge = STATUS_BADGE[entry.status];
              const file = baseName(entry.filePath);
              const host = hostOf(entry.url);
              return (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                  className="glass group flex items-center gap-3 overflow-hidden rounded-card border border-hairline p-2.5 transition-colors hover:border-hairline-strong"
                >
                  <Thumbnail
                    src={entry.thumbnail}
                    alt={entry.title}
                    audioOnly={entry.audioOnly}
                    className="aspect-video w-20 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={entry.title}>
                      {entry.title}
                    </p>
                    <p
                      className="truncate text-xs text-ink-faint"
                      title={entry.filePath ?? entry.url}
                    >
                      {file ?? entry.url}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={badge.tone} icon={badge.icon}>
                        {badge.label}
                      </Badge>
                      {entry.audioOnly ? <Badge tone="accent">Audio</Badge> : null}
                      {host ? <Badge>{host}</Badge> : null}
                      <span className="text-[0.7rem] text-ink-faint">
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>
                    {entry.status === "error" && entry.error ? (
                      <p
                        className="mt-1 truncate text-[0.7rem] text-negative"
                        title={entry.error}
                      >
                        {entry.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label="Download again"
                      onClick={() => void redownload(entry)}
                    >
                      <RotateCcw className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Reveal in folder"
                      onClick={() => void reveal(entry)}
                    >
                      <FolderOpen className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Remove from history"
                      onClick={() => void removeFromHistory(entry.id)}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
