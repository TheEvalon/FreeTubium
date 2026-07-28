import { motion } from "framer-motion";
import {
  CheckCheck,
  Download,
  FlipHorizontal2,
  ListVideo,
  XSquare,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { AnalyzeResult, PlaylistEntry } from "../lib/api";
import { cn } from "../lib/cn";
import type { DownloadOptionsValue } from "../lib/downloadOptions";
import { describeOptions } from "../lib/downloadOptions";
import { formatDuration, formatTotalDuration } from "../lib/format";
import type { QualityOption } from "../lib/quality";
import { BulkOptionsBar } from "./DownloadOptions";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Checkbox } from "./ui/Field";
import { Thumbnail } from "./ui/Thumbnail";

export function PlaylistPicker({
  result,
  options,
  onOptionsChange,
  qualityOptions,
  onDownload,
  busy = false,
}: {
  result: AnalyzeResult;
  options: DownloadOptionsValue;
  onOptionsChange: (patch: Partial<DownloadOptionsValue>) => void;
  qualityOptions: QualityOption[];
  onDownload: (entries: PlaylistEntry[]) => void;
  busy?: boolean;
}) {
  const entries = result.entries;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(entries.map((entry) => entry.id)),
  );
  const lastToggled = useRef<number | null>(null);

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selected.has(entry.id)),
    [entries, selected],
  );

  const allSelected = selected.size === entries.length && entries.length > 0;
  const noneSelected = selected.size === 0;

  const setAll = (value: boolean) => {
    setSelected(value ? new Set(entries.map((entry) => entry.id)) : new Set());
  };

  const invert = () => {
    setSelected((current) => {
      const next = new Set<string>();
      for (const entry of entries) if (!current.has(entry.id)) next.add(entry.id);
      return next;
    });
  };

  const toggle = (index: number, shiftKey: boolean) => {
    const entry = entries[index];
    if (!entry) return;
    setSelected((current) => {
      const next = new Set(current);
      const shouldSelect = !next.has(entry.id);
      const anchor = lastToggled.current;

      if (shiftKey && anchor != null && anchor !== index) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (let i = from; i <= to; i += 1) {
          const target = entries[i];
          if (!target) continue;
          if (shouldSelect) next.add(target.id);
          else next.delete(target.id);
        }
      } else if (shouldSelect) {
        next.add(entry.id);
      } else {
        next.delete(entry.id);
      }

      return next;
    });
    lastToggled.current = index;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="accent-gradient flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow">
              <ListVideo className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-ink">
                {result.playlistTitle ?? "Playlist"}
              </h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {result.playlistChannel ? `${result.playlistChannel} · ` : ""}
                {entries.length} item{entries.length === 1 ? "" : "s"} ·{" "}
                {formatTotalDuration(entries.map((entry) => entry.duration))}
              </p>
            </div>
          </div>
          <Badge tone="accent">
            {selected.size} of {entries.length} selected
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<CheckCheck className="size-3.5" />}
            onClick={() => setAll(true)}
            disabled={allSelected}
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<XSquare className="size-3.5" />}
            onClick={() => setAll(false)}
            disabled={noneSelected}
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FlipHorizontal2 className="size-3.5" />}
            onClick={invert}
          >
            Invert
          </Button>
          <span className="ml-1 hidden text-[0.7rem] text-ink-faint sm:inline">
            Tip: shift-click to select a range
          </span>
          <div className="ml-auto">
            <BulkOptionsBar
              scope="playlist"
              options={options}
              onChange={onOptionsChange}
              qualityOptions={qualityOptions}
            />
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-card border border-hairline">
        <div className="flex items-center gap-3 border-b border-hairline bg-canvas-soft/60 px-3 py-2">
          <Checkbox
            label="Select all items"
            checked={allSelected}
            indeterminate={!allSelected && !noneSelected}
            onChange={(checked) => setAll(checked)}
          />
          <span className="text-xs font-medium text-ink-muted">Title</span>
          <span className="ml-auto text-xs font-medium text-ink-muted">Length</span>
        </div>
        <ul className="max-h-[26rem] divide-y divide-hairline overflow-y-auto">
          {entries.map((entry, index) => {
            const isSelected = selected.has(entry.id);
            return (
              <li key={`${entry.id}-${index}`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => toggle(index, event.shiftKey)}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      toggle(index, event.shiftKey);
                    }
                  }}
                  className={cn(
                    "focus-ring flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors duration-150",
                    isSelected ? "bg-accent-soft/50" : "hover:bg-card-hover",
                  )}
                >
                  <Checkbox
                    label={`Select ${entry.title}`}
                    checked={isSelected}
                    onChange={() => toggle(index, false)}
                  />
                  <span className="w-6 shrink-0 text-right text-xs text-ink-faint tabular-nums">
                    {entry.playlistIndex ?? index + 1}
                  </span>
                  <Thumbnail
                    src={entry.thumbnail}
                    alt={entry.title}
                    audioOnly={options.audioOnly}
                    className="aspect-video w-20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink" title={entry.title}>
                      {entry.title}
                    </p>
                    {entry.channel ? (
                      <p className="truncate text-xs text-ink-faint">
                        {entry.channel}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                    {formatDuration(entry.duration)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <motion.div
        layout
        className="glass sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hairline p-3"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {selected.size} item{selected.size === 1 ? "" : "s"} ·{" "}
            {formatTotalDuration(selectedEntries.map((entry) => entry.duration))}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {describeOptions(options, qualityOptions)}
          </p>
        </div>
        <Button
          size="lg"
          variant="primary"
          icon={<Download className="size-4" />}
          loading={busy}
          disabled={noneSelected}
          onClick={() => onDownload(selectedEntries)}
        >
          Download selection
        </Button>
      </motion.div>
    </div>
  );
}
