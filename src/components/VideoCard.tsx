import { CalendarDays, Eye, Radio, Timer } from "lucide-react";

import type { VideoInfo } from "../lib/api";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatUploadDate,
  hostOf,
} from "../lib/format";
import { Badge } from "./ui/Badge";
import { Thumbnail } from "./ui/Thumbnail";

export function VideoCard({
  video,
  estimatedBytes,
}: {
  video: VideoInfo;
  estimatedBytes?: number | null;
}) {
  const host = hostOf(video.url);
  const uploaded = formatUploadDate(video.uploadDate);
  const views = formatCount(video.viewCount);
  const size = formatBytes(estimatedBytes ?? null);

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Thumbnail
        src={video.thumbnail}
        alt={video.title}
        overlay={video.duration != null ? formatDuration(video.duration) : undefined}
        className="aspect-video w-full sm:w-64"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <h3
          className="text-base leading-snug font-semibold text-ink"
          title={video.title}
        >
          {video.title}
        </h3>
        {video.channel ? (
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Radio className="size-3.5 shrink-0" />
            <span className="truncate">{video.channel}</span>
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {host ? <Badge tone="accent">{host}</Badge> : null}
          {video.duration != null ? (
            <Badge icon={<Timer className="size-3" />}>
              {formatDuration(video.duration)}
            </Badge>
          ) : null}
          {views ? (
            <Badge icon={<Eye className="size-3" />}>{views} views</Badge>
          ) : null}
          {uploaded ? (
            <Badge icon={<CalendarDays className="size-3" />}>{uploaded}</Badge>
          ) : null}
          {size ? <Badge tone="neutral">≈ {size}</Badge> : null}
        </div>
      </div>
    </div>
  );
}
