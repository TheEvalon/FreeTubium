import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  History,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";

import { cn } from "../lib/cn";
import type { Route } from "../lib/routes";
import { useDownloads } from "../state/downloads";
import { useSettings } from "../state/settings";

const NAV: Array<{ route: Route; label: string; icon: typeof Plus }> = [
  { route: "home", label: "New download", icon: Plus },
  { route: "queue", label: "Downloads", icon: ArrowDownToLine },
  { route: "history", label: "History", icon: History },
  { route: "settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
}) {
  const { activeCount } = useDownloads();
  const { settings, toggleTheme } = useSettings();
  const isDark = settings.theme === "dark";

  return (
    <nav className="glass relative z-10 flex w-[4.75rem] shrink-0 flex-col items-center gap-2 border-r border-hairline py-4">
      <div
        className="accent-gradient mb-3 flex size-10 items-center justify-center rounded-xl text-base font-bold text-white shadow-glow select-none"
        title="FreeTubium"
      >
        FT
      </div>

      {NAV.map(({ route: target, label, icon: Icon }) => {
        const selected = route === target;
        const badge = target === "queue" && activeCount > 0 ? activeCount : null;
        return (
          <button
            key={target}
            type="button"
            title={label}
            aria-label={label}
            aria-current={selected ? "page" : undefined}
            onClick={() => onNavigate(target)}
            className={cn(
              "focus-ring group relative flex size-12 cursor-pointer items-center justify-center rounded-xl",
              "transition-colors duration-150",
              selected ? "text-ink" : "text-ink-faint hover:text-ink",
            )}
          >
            {selected ? (
              <motion.span
                layoutId="sidebar-active"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-xl border border-violet/40 bg-accent-soft"
              />
            ) : null}
            <Icon className="relative z-10 size-5" strokeWidth={selected ? 2.4 : 2} />
            {badge != null ? (
              <span className="accent-gradient absolute top-1.5 right-1.5 z-10 min-w-4 rounded-full px-1 text-[0.6rem] leading-4 font-semibold text-white tabular-nums">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="focus-ring flex size-10 cursor-pointer items-center justify-center rounded-xl text-ink-faint transition-colors duration-150 hover:bg-accent-soft hover:text-ink"
        >
          {isDark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
        </button>
      </div>
    </nav>
  );
}
