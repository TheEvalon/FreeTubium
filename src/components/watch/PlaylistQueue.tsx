import { ListVideo, MonitorPlay, Play } from "lucide-react";

import { cn } from "../../lib/cn";
import { formatDuration, formatTotalDuration } from "../../lib/format";
import type { WatchItem } from "../../state/watch";
import { Badge } from "../ui/Badge";
import { Thumbnail } from "../ui/Thumbnail";

/** The play queue, adapted from the playlist list on the download screen. */
export function PlaylistQueue({
  items,
  index,
  title,
  onPlay,
}: {
  items: WatchItem[];
  index: number;
  title: string | null;
  onPlay: (index: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-hairline">
      <div className="flex items-center gap-2 border-b border-hairline bg-canvas-soft/60 px-3 py-2">
        <ListVideo className="size-3.5 shrink-0 text-ink-faint" />
        <span className="min-w-0 truncate text-xs font-medium text-ink-muted">
          {title ?? "Up next"}
        </span>
        <span className="ml-auto shrink-0 text-xs text-ink-faint tabular-nums">
          {items.length} · {formatTotalDuration(items.map((item) => item.duration))}
        </span>
      </div>

      <ul className="max-h-[26rem] divide-y divide-hairline overflow-y-auto">
        {items.map((item, position) => {
          const playing = position === index;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onPlay(position)}
                aria-current={playing ? "true" : undefined}
                className={cn(
                  "focus-ring flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors duration-150",
                  playing ? "bg-accent-soft/60" : "hover:bg-card-hover",
                )}
              >
                <span className="flex w-6 shrink-0 justify-end text-xs text-ink-faint tabular-nums">
                  {playing ? (
                    <Play className="size-3.5 fill-current text-violet" />
                  ) : (
                    position + 1
                  )}
                </span>
                <Thumbnail
                  src={item.thumbnail}
                  alt={item.title}
                  className="aspect-video w-20"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm",
                      playing ? "font-medium text-ink" : "text-ink",
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </p>
                  {!item.videoId ? (
                    <Badge tone="neutral" icon={<MonitorPlay className="size-3" />}>
                      Local player
                    </Badge>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                  {formatDuration(item.duration)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
