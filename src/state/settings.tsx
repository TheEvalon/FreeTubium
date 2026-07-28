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

import { getSettings, saveSettings, type Settings } from "../lib/api";
import { shortErrorMessage } from "../lib/errors";
import { useToast } from "./toast";

export const DEFAULT_SETTINGS: Settings = {
  outputDir: "",
  filenameTemplate: "%(title)s.%(ext)s",
  maxConcurrentDownloads: 3,
  speedLimit: null,
  defaultQuality: "best",
  defaultContainer: "mp4",
  defaultAudioFormat: "mp3",
  downloadSubtitles: false,
  embedSubtitles: false,
  subtitleLanguages: "en.*",
  embedThumbnail: false,
  embedMetadata: true,
  clipboardWatcher: false,
  theme: "dark",
};

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  saving: boolean;
  /** Optimistically applies a patch and persists it (debounced). */
  update: (patch: Partial<Settings>) => void;
  toggleTheme: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 350;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {
        // Keep defaults; the settings screen still works and will persist later.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", settings.theme === "light");
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme]);

  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    setSaving(true);
    try {
      await saveSettings(next);
    } catch (error) {
      push({
        tone: "error",
        title: "Could not save settings",
        description: shortErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }, [push]);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        pending.current = next;
        if (saveTimer.current != null) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null;
          void flush();
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [flush],
  );

  const toggleTheme = useCallback(() => {
    update({ theme: settings.theme === "dark" ? "light" : "dark" });
  }, [settings.theme, update]);

  const value = useMemo(
    () => ({ settings, loading, saving, update, toggleTheme }),
    [settings, loading, saving, update, toggleTheme],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context)
    throw new Error("useSettings must be used inside a SettingsProvider");
  return context;
}
