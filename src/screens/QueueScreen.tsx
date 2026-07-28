import { AnimatePresence } from "framer-motion";
import { ArrowDownToLine, Inbox, ListX } from "lucide-react";
import { useMemo } from "react";

import { QueueCard } from "../components/QueueCard";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { openFolder } from "../lib/api";
import { shortErrorMessage } from "../lib/errors";
import { isFinished, useDownloads } from "../state/downloads";
import { useSettings } from "../state/settings";
import { useToast } from "../state/toast";

export function QueueScreen({ onAddMore }: { onAddMore: () => void }) {
  const {
    items,
    pause,
    resume,
    cancel,
    retry,
    dismiss,
    clearFinished,
    activeCount,
  } = useDownloads();
  const { settings } = useSettings();
  const { push } = useToast();

  const finishedCount = useMemo(
    () => items.filter((item) => isFinished(item.status)).length,
    [items],
  );

  const reveal = async (filePath: string | null) => {
    const target = filePath ?? settings.outputDir;
    if (!target) {
      push({ tone: "info", title: "No output folder set yet" });
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Downloads</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {activeCount > 0
              ? `${activeCount} in progress · max ${settings.maxConcurrentDownloads} at a time`
              : "Nothing running right now."}
          </p>
        </div>
        <div className="flex gap-2">
          {finishedCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<ListX className="size-3.5" />}
              onClick={clearFinished}
            >
              Clear finished
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowDownToLine className="size-3.5" />}
            onClick={onAddMore}
          >
            New download
          </Button>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="Your queue is empty"
          description="Paste a video or playlist link on the New download screen and it will show up here with live progress."
          action={
            <Button size="sm" variant="primary" onClick={onAddMore}>
              Add a link
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onPause={() => void pause(item.id)}
                onResume={() => void resume(item.id)}
                onCancel={() => void cancel(item.id)}
                onRetry={() => void retry(item.id)}
                onDismiss={() => dismiss(item.id)}
                onReveal={() => void reveal(item.filePath)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
