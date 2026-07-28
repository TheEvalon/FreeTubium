import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Gauge,
  Hourglass,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { formatEta, formatSpeed } from "../lib/format";
import type { DownloadItem, QueueStatus } from "../state/downloads";
import { Badge } from "./ui/Badge";
import { Button, IconButton } from "./ui/Button";
import { ProgressBar } from "./ui/ProgressBar";
import { Thumbnail } from "./ui/Thumbnail";

const STATUS_META: Record<
  QueueStatus,
  { label: string; tone: "neutral" | "accent" | "positive" | "warning" | "negative"; icon: ReactNode }
> = {
  queued: {
    label: "Waiting",
    tone: "neutral",
    icon: <Hourglass className="size-3" />,
  },
  downloading: {
    label: "Downloading",
    tone: "accent",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  paused: { label: "Paused", tone: "warning", icon: <Pause className="size-3" /> },
  completed: {
    label: "Completed",
    tone: "positive",
    icon: <CheckCircle2 className="size-3" />,
  },
  error: {
    label: "Failed",
    tone: "negative",
    icon: <AlertTriangle className="size-3" />,
  },
  cancelled: { label: "Cancelled", tone: "neutral", icon: <X className="size-3" /> },
};

interface QueueCardProps {
  item: DownloadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onReveal: () => void;
}

// forwardRef so `AnimatePresence mode="popLayout"` can measure the card while
// it animates out.
export const QueueCard = forwardRef<HTMLDivElement, QueueCardProps>(function QueueCard(
  { item, onPause, onResume, onCancel, onRetry, onDismiss, onReveal },
  ref,
) {
  const meta = STATUS_META[item.status];
  const speed = formatSpeed(item.speed);
  const eta = formatEta(item.eta);
  const running = item.status === "downloading";
  const finished =
    item.status === "completed" ||
    item.status === "error" ||
    item.status === "cancelled";

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "glass overflow-hidden rounded-card border border-hairline p-3 shadow-panel",
        item.status === "error" && "border-negative/30",
        item.status === "completed" && "border-positive/25",
      )}
    >
      <div className="flex gap-3">
        <Thumbnail
          src={item.thumbnail}
          alt={item.title}
          audioOnly={item.audioOnly}
          className="aspect-video w-28 shrink-0 sm:w-32"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <p
              className="min-w-0 flex-1 truncate text-sm font-medium text-ink"
              title={item.title}
            >
              {item.title}
            </p>
            <Badge tone={meta.tone} icon={meta.icon}>
              {meta.label}
            </Badge>
          </div>

          <ProgressBar
            percent={item.status === "completed" ? 100 : item.percent}
            active={running}
            indeterminate={running && item.percent === 0}
            tone={
              item.status === "error"
                ? "negative"
                : item.status === "paused" || item.status === "cancelled"
                  ? "muted"
                  : "accent"
            }
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {item.status !== "completed" && item.status !== "cancelled" ? (
              <span className="font-medium text-ink tabular-nums">
                {Math.round(item.percent)}%
              </span>
            ) : null}
            {running && speed ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Gauge className="size-3" />
                {speed}
              </span>
            ) : null}
            {running && eta ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Hourglass className="size-3" />
                {eta} left
              </span>
            ) : null}
            {item.status === "error" && item.error ? (
              <span className="min-w-0 flex-1 truncate text-negative" title={item.error}>
                {item.error}
              </span>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              {running ? (
                <IconButton label="Pause" onClick={onPause}>
                  <Pause className="size-4" />
                </IconButton>
              ) : null}
              {item.status === "paused" ? (
                <IconButton label="Resume" onClick={onResume}>
                  <Play className="size-4" />
                </IconButton>
              ) : null}
              {item.status === "queued" || running ? (
                <IconButton label="Cancel" variant="danger" onClick={onCancel}>
                  <X className="size-4" />
                </IconButton>
              ) : null}
              {item.status === "completed" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FolderOpen className="size-3.5" />}
                  onClick={onReveal}
                >
                  Open folder
                </Button>
              ) : null}
              {item.status === "error" || item.status === "cancelled" ? (
                <IconButton label="Try again" onClick={onRetry}>
                  <RotateCcw className="size-4" />
                </IconButton>
              ) : null}
              {finished || item.status === "paused" ? (
                <IconButton label="Remove from list" onClick={onDismiss}>
                  <Trash2 className="size-4" />
                </IconButton>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
