import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Music4, SlidersHorizontal, Video } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/cn";
import type { DownloadOptionsValue } from "../lib/downloadOptions";
import { AUDIO_BITRATES, AUDIO_FORMATS, CONTAINERS } from "../lib/quality";
import type { QualityOption } from "../lib/quality";
import type { AudioFormat, Container } from "../lib/api";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Field, Select, TextInput, Toggle } from "./ui/Field";

export function DownloadOptions({
  options,
  onChange,
  qualityOptions,
  /** Suffix for framer-motion layoutIds so several instances can coexist. */
  scope,
  className,
}: {
  options: DownloadOptionsValue;
  onChange: (patch: Partial<DownloadOptionsValue>) => void;
  qualityOptions: QualityOption[];
  scope: string;
  className?: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Type</span>
          <SegmentedControl
            layoutId={`mode-${scope}`}
            value={options.audioOnly ? "audio" : "video"}
            onChange={(value) => onChange({ audioOnly: value === "audio" })}
            segments={[
              { value: "video", label: "Video" },
              { value: "audio", label: "Audio only" },
            ]}
          />
        </div>

        {options.audioOnly ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Format</span>
              <SegmentedControl
                layoutId={`audio-format-${scope}`}
                value={options.audioFormat}
                onChange={(value) => onChange({ audioFormat: value })}
                segments={AUDIO_FORMATS.map((entry) => ({
                  value: entry.value as AudioFormat,
                  label: entry.label,
                  hint: entry.hint,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Bitrate</span>
              <SegmentedControl
                size="sm"
                layoutId={`audio-bitrate-${scope}`}
                value={options.audioBitrate}
                onChange={(value) => onChange({ audioBitrate: value })}
                segments={AUDIO_BITRATES.map((entry) => ({
                  value: entry.value,
                  label: entry.label,
                }))}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Quality</span>
              <SegmentedControl
                layoutId={`quality-${scope}`}
                value={options.qualityKey}
                onChange={(value) => onChange({ qualityKey: value })}
                segments={qualityOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                  hint: option.hint,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Container</span>
              <SegmentedControl
                layoutId={`container-${scope}`}
                value={options.container}
                onChange={(value) => onChange({ container: value })}
                segments={CONTAINERS.map((entry) => ({
                  value: entry.value as Container,
                  label: entry.label,
                }))}
              />
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-hairline">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="focus-ring flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <SlidersHorizontal className="size-3.5" />
          Subtitles &amp; metadata
          <ChevronDown
            className={cn(
              "ml-auto size-4 transition-transform duration-200",
              advancedOpen && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {advancedOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-hairline border-t border-hairline px-3 pb-3">
                <Toggle
                  label="Download subtitle files"
                  description="Saves separate .vtt/.srt files next to the video."
                  checked={options.downloadSubtitles}
                  disabled={options.audioOnly}
                  onChange={(checked) => onChange({ downloadSubtitles: checked })}
                />
                <Toggle
                  label="Embed subtitles"
                  description="Muxes subtitle tracks into the output file."
                  checked={options.embedSubtitles}
                  disabled={options.audioOnly}
                  onChange={(checked) => onChange({ embedSubtitles: checked })}
                />
                {(options.downloadSubtitles || options.embedSubtitles) &&
                !options.audioOnly ? (
                  <div className="py-3">
                    <Field
                      label="Subtitle languages"
                      hint='Comma-separated yt-dlp patterns, e.g. "en.*,ru"'
                    >
                      <TextInput
                        value={options.subtitleLanguages}
                        onChange={(event) =>
                          onChange({ subtitleLanguages: event.target.value })
                        }
                        placeholder="en.*"
                        spellCheck={false}
                      />
                    </Field>
                  </div>
                ) : null}
                <Toggle
                  label="Embed thumbnail"
                  description="Uses the video thumbnail as cover art."
                  checked={options.embedThumbnail}
                  onChange={(checked) => onChange({ embedThumbnail: checked })}
                />
                <Toggle
                  label="Embed metadata"
                  description="Writes title, channel and date into the file tags."
                  checked={options.embedMetadata}
                  onChange={(checked) => onChange({ embedMetadata: checked })}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Compact quality/format picker used by the playlist bulk-options bar. */
export function BulkOptionsBar({
  options,
  onChange,
  qualityOptions,
  scope,
}: {
  options: DownloadOptionsValue;
  onChange: (patch: Partial<DownloadOptionsValue>) => void;
  qualityOptions: QualityOption[];
  scope: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl
        size="sm"
        layoutId={`bulk-mode-${scope}`}
        value={options.audioOnly ? "audio" : "video"}
        onChange={(value) => onChange({ audioOnly: value === "audio" })}
        segments={[
          { value: "video", label: "Video" },
          { value: "audio", label: "Audio" },
        ]}
      />
      {options.audioOnly ? (
        <>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <Music4 className="size-3.5" />
            <Select
              className="h-8 w-24 py-1 text-xs"
              value={options.audioFormat}
              onChange={(event) =>
                onChange({ audioFormat: event.target.value as AudioFormat })
              }
            >
              {AUDIO_FORMATS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </label>
          <Select
            className="h-8 w-24 py-1 text-xs"
            value={options.audioBitrate}
            onChange={(event) => onChange({ audioBitrate: event.target.value })}
          >
            {AUDIO_BITRATES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <Video className="size-3.5" />
            <Select
              className="h-8 w-28 py-1 text-xs"
              value={options.qualityKey}
              onChange={(event) => onChange({ qualityKey: event.target.value })}
            >
              {qualityOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <Select
            className="h-8 w-24 py-1 text-xs"
            value={options.container}
            onChange={(event) =>
              onChange({ container: event.target.value as Container })
            }
          >
            {CONTAINERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </>
      )}
    </div>
  );
}
