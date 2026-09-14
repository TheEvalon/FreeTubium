import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  ClipboardCheck,
  Cpu,
  Download,
  FolderOpen,
  Gauge,
  Info,
  MonitorPlay,
  Moon,
  Package,
  RefreshCw,
  Sun,
  Terminal,
  Type,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { YouTubeAccount } from "../components/settings/YouTubeAccount";
import { Button, IconButton } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  Field,
  NumberInput,
  Select,
  TextInput,
  Toggle,
} from "../components/ui/Field";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import {
  getYtdlpVersion,
  openFolder,
  updateYtdlp,
  type AudioFormat,
  type Container,
  type Quality,
} from "../lib/api";
import { shortErrorMessage } from "../lib/errors";
import { AUDIO_FORMATS, CONTAINERS, defaultQualityOptions } from "../lib/quality";
import { useSettings } from "../state/settings";
import { useToast } from "../state/toast";

const TEMPLATE_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Title", value: "%(title)s.%(ext)s" },
  { label: "Channel — Title", value: "%(uploader)s - %(title)s.%(ext)s" },
  { label: "Date — Title", value: "%(upload_date)s - %(title)s.%(ext)s" },
  {
    label: "Playlist index — Title",
    value: "%(playlist_index)s - %(title)s.%(ext)s",
  },
];

const SPEED_PRESETS = ["1M", "2M", "5M", "10M"];

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-hairline bg-accent-soft text-violet">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-hairline pt-3">
        {children}
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const { settings, update, saving, toggleTheme } = useSettings();
  const { push } = useToast();
  const [version, setVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadVersion = useCallback(async () => {
    try {
      const value = await getYtdlpVersion();
      setVersion(value.trim());
      setVersionError(null);
    } catch (error) {
      setVersion(null);
      setVersionError(shortErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadVersion();
  }, [loadVersion]);

  const pickFolder = async () => {
    try {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose download folder",
        defaultPath: settings.outputDir || undefined,
      });
      if (typeof picked === "string" && picked) update({ outputDir: picked });
    } catch (error) {
      push({
        tone: "error",
        title: "Could not open the folder picker",
        description: shortErrorMessage(error),
      });
    }
  };

  const runUpdate = async () => {
    setUpdating(true);
    try {
      const output = await updateYtdlp();
      push({
        tone: "success",
        title: "yt-dlp update finished",
        description: output.trim().split("\n").slice(-1)[0] || undefined,
      });
      await loadVersion();
    } catch (error) {
      push({
        tone: "error",
        title: "yt-dlp update failed",
        description: shortErrorMessage(error),
      });
    } finally {
      setUpdating(false);
    }
  };

  const speedLimited = settings.speedLimit != null && settings.speedLimit !== "";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Changes are saved automatically.
          </p>
        </div>
        {saving ? (
          <span className="text-xs text-ink-faint">Saving…</span>
        ) : null}
      </header>

      <SettingsSection
        icon={<FolderOpen className="size-4" />}
        title="Output"
        description="Where files land and how they are named."
      >
        <Field label="Download folder">
          <div className="flex gap-2">
            <TextInput
              value={settings.outputDir}
              placeholder="Defaults to your Downloads folder"
              spellCheck={false}
              onChange={(event) => update({ outputDir: event.target.value })}
            />
            <Button variant="secondary" onClick={pickFolder}>
              Browse…
            </Button>
            <IconButton
              label="Open folder"
              variant="secondary"
              disabled={!settings.outputDir}
              onClick={() => {
                openFolder(settings.outputDir).catch((error) =>
                  push({
                    tone: "error",
                    title: "Could not open the folder",
                    description: shortErrorMessage(error),
                  }),
                );
              }}
            >
              <FolderOpen className="size-4" />
            </IconButton>
          </div>
        </Field>

        <Field
          label="Filename template"
          hint="yt-dlp output template — see the yt-dlp docs for all fields."
        >
          <TextInput
            value={settings.filenameTemplate}
            spellCheck={false}
            onChange={(event) => update({ filenameTemplate: event.target.value })}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Type className="size-3.5 text-ink-faint" />
          {TEMPLATE_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              size="sm"
              variant={
                settings.filenameTemplate === preset.value ? "primary" : "secondary"
              }
              onClick={() => update({ filenameTemplate: preset.value })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Download className="size-4" />}
        title="Download defaults"
        description="Pre-selected options for every new link you analyze."
      >
        <Field label="Quality">
          <div>
            <SegmentedControl
              layoutId="settings-quality"
              value={settings.defaultQuality}
              onChange={(value) => update({ defaultQuality: value as Quality })}
              segments={defaultQualityOptions().map((option) => ({
                value: (option.quality ?? "best") as Quality,
                label: option.label,
                hint: option.hint,
              }))}
            />
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Container">
            <Select
              value={settings.defaultContainer}
              onChange={(event) =>
                update({ defaultContainer: event.target.value as Container })
              }
            >
              {CONTAINERS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Audio-only format">
            <Select
              value={settings.defaultAudioFormat}
              onChange={(event) =>
                update({ defaultAudioFormat: event.target.value as AudioFormat })
              }
            >
              {AUDIO_FORMATS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label} — {entry.hint}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<Type className="size-4" />}
        title="Subtitles &amp; metadata"
        description="Defaults applied to new downloads; each download can override them."
      >
        <div className="divide-y divide-hairline">
          <Toggle
            label="Download subtitle files"
            description="Writes separate subtitle files next to the video."
            checked={settings.downloadSubtitles}
            onChange={(checked) => update({ downloadSubtitles: checked })}
          />
          <Toggle
            label="Embed subtitles"
            description="Muxes subtitle tracks into the output file."
            checked={settings.embedSubtitles}
            onChange={(checked) => update({ embedSubtitles: checked })}
          />
          <Toggle
            label="Embed thumbnail"
            description="Uses the video thumbnail as cover art."
            checked={settings.embedThumbnail}
            onChange={(checked) => update({ embedThumbnail: checked })}
          />
          <Toggle
            label="Embed metadata"
            description="Writes title, channel and date into the file tags."
            checked={settings.embedMetadata}
            onChange={(checked) => update({ embedMetadata: checked })}
          />
        </div>
        <Field
          label="Subtitle languages"
          hint='Comma-separated yt-dlp patterns, e.g. "en.*,ru" or "all"'
        >
          <TextInput
            value={settings.subtitleLanguages}
            spellCheck={false}
            onChange={(event) => update({ subtitleLanguages: event.target.value })}
          />
        </Field>
      </SettingsSection>

      <SettingsSection
        icon={<Gauge className="size-4" />}
        title="Performance"
        description="How many downloads run at once and how much bandwidth they may use."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Concurrent downloads"
            hint="1–10. Extra items wait in the queue."
          >
            <NumberInput
              min={1}
              max={10}
              value={settings.maxConcurrentDownloads}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) {
                  update({
                    maxConcurrentDownloads: Math.min(10, Math.max(1, Math.round(parsed))),
                  });
                }
              }}
            />
          </Field>
          <Field
            label="Speed limit"
            hint='Per download, e.g. "500K" or "5M". Empty means unlimited.'
          >
            <TextInput
              value={settings.speedLimit ?? ""}
              placeholder="Unlimited"
              spellCheck={false}
              onChange={(event) =>
                update({ speedLimit: event.target.value.trim() || null })
              }
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Cpu className="size-3.5 text-ink-faint" />
          <Button
            size="sm"
            variant={speedLimited ? "secondary" : "primary"}
            onClick={() => update({ speedLimit: null })}
          >
            Unlimited
          </Button>
          {SPEED_PRESETS.map((preset) => (
            <Button
              key={preset}
              size="sm"
              variant={settings.speedLimit === preset ? "primary" : "secondary"}
              onClick={() => update({ speedLimit: preset })}
            >
              {preset}B/s
            </Button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<ClipboardCheck className="size-4" />}
        title="Appearance &amp; behaviour"
      >
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-medium text-ink">Theme</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Dark by default; light mode keeps the same accents.
            </p>
          </div>
          <SegmentedControl
            size="sm"
            layoutId="settings-theme"
            value={settings.theme}
            onChange={(value) => {
              if (value !== settings.theme) toggleTheme();
            }}
            segments={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 text-ink-faint">
          {settings.theme === "dark" ? (
            <Moon className="size-3.5" />
          ) : (
            <Sun className="size-3.5" />
          )}
          <span className="text-xs">
            Current: {settings.theme === "dark" ? "dark" : "light"} mode
          </span>
        </div>
        <div className="border-t border-hairline pt-1">
          <Toggle
            label="Watch the clipboard"
            description="Offers to analyze links you copy while FreeTubium is focused."
            checked={settings.clipboardWatcher}
            onChange={(checked) => update({ clipboardWatcher: checked })}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<MonitorPlay className="size-4" />}
        title="Watch"
        description="In-app playback. Videos YouTube's player refuses fall back to a local player that extracts them with yt-dlp."
      >
        <Field
          label="Local player quality"
          hint="Only applies to the local player; YouTube's own player picks its own quality. Higher settings take longer to prepare."
        >
          <div>
            <SegmentedControl
              layoutId="settings-watch-quality"
              value={settings.watchQuality}
              onChange={(value) => update({ watchQuality: value as Quality })}
              segments={defaultQualityOptions().map((option) => ({
                value: (option.quality ?? "best") as Quality,
                label: option.label,
                hint: option.hint,
              }))}
            />
          </div>
        </Field>
        <div className="flex items-start gap-2 rounded-xl border border-hairline bg-canvas-soft/60 p-3">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
          <p className="text-xs leading-relaxed text-ink-muted">
            YouTube no longer offers formats with video and audio in one stream,
            so the local player combines them with the bundled ffmpeg before
            playback starts. That means a wait up front, and the whole video is
            seekable once it begins.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={<UserRound className="size-4" />}
        title="YouTube account"
        description="Optional. Signing in lets yt-dlp reach age-restricted, members-only and private videos, for downloads as well as the Watch page."
      >
        <YouTubeAccount />
      </SettingsSection>

      <SettingsSection
        icon={<Package className="size-4" />}
        title="Download engine"
        description="FreeTubium bundles yt-dlp and ffmpeg as sidecars."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-ink-faint" />
            <div>
              <p className="text-sm text-ink">
                yt-dlp{" "}
                <span className="font-mono text-xs text-ink-muted">
                  {version ?? (versionError ? "unavailable" : "checking…")}
                </span>
              </p>
              {versionError ? (
                <p className="mt-0.5 text-xs text-negative">{versionError}</p>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="size-3.5" />}
              onClick={() => void loadVersion()}
            >
              Re-check
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={updating}
              icon={<Download className="size-3.5" />}
              onClick={() => void runUpdate()}
            >
              Update yt-dlp
            </Button>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-hairline bg-canvas-soft/60 p-3">
          <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
          <p className="text-xs leading-relaxed text-ink-muted">
            Only download content you have the rights to. Updating yt-dlp usually
            fixes extraction errors after a site change.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}
