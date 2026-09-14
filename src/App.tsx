import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCheck, X } from "lucide-react";
import { useState } from "react";

import { Sidebar } from "./components/Sidebar";
import { ToastViewport } from "./components/ToastViewport";
import { Button } from "./components/ui/Button";
import { useClipboardWatcher } from "./hooks/useClipboardWatcher";
import { ROUTE_TITLES, type Route } from "./lib/routes";
import { HistoryScreen } from "./screens/HistoryScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { QueueScreen } from "./screens/QueueScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { WatchScreen } from "./screens/WatchScreen";
import { AnalyzerProvider, useAnalyzer } from "./state/analyzer";
import { DownloadsProvider } from "./state/downloads";
import { SettingsProvider, useSettings } from "./state/settings";
import { ToastProvider } from "./state/toast";
import { WatchProvider } from "./state/watch";

function ClipboardBanner({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: string | null;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {suggestion ? (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="glass mx-auto flex w-full max-w-3xl items-center gap-3 rounded-card border border-violet/35 p-3 shadow-glow"
        >
          <ClipboardCheck className="size-4 shrink-0 text-violet" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">Link copied</p>
            <p className="truncate text-xs text-ink-muted" title={suggestion}>
              {suggestion}
            </p>
          </div>
          <Button size="sm" variant="primary" onClick={onAccept}>
            Analyze
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onDismiss}
            className="focus-ring size-7 shrink-0 cursor-pointer rounded-lg text-ink-faint transition-colors hover:text-ink"
          >
            <X className="mx-auto size-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>("home");
  const { settings } = useSettings();
  const { url, analyzedUrl, analyze } = useAnalyzer();

  const { suggestion, dismiss, consume } = useClipboardWatcher({
    enabled: settings.clipboardWatcher,
    ignore: [url, analyzedUrl ?? ""].filter(Boolean),
  });

  const acceptSuggestion = () => {
    if (!suggestion) return;
    const target = suggestion;
    consume();
    setRoute("home");
    void analyze(target);
  };

  return (
    <div className="relative flex h-full">
      <Sidebar route={route} onNavigate={setRoute} />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-6">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
            {ROUTE_TITLES[route]}
          </h2>
          <span className="ml-auto text-xs text-ink-faint">FreeTubium</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-10">
          <div className="mb-4">
            <ClipboardBanner
              suggestion={suggestion}
              onAccept={acceptSuggestion}
              onDismiss={dismiss}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {route === "home" ? (
                <HomeScreen onQueued={() => setRoute("queue")} />
              ) : route === "watch" ? (
                <WatchScreen />
              ) : route === "queue" ? (
                <QueueScreen onAddMore={() => setRoute("home")} />
              ) : route === "history" ? (
                <HistoryScreen onQueued={() => setRoute("queue")} />
              ) : (
                <SettingsScreen />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <DownloadsProvider>
          <AnalyzerProvider>
            <WatchProvider>
              <Shell />
              <ToastViewport />
            </WatchProvider>
          </AnalyzerProvider>
        </DownloadsProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
