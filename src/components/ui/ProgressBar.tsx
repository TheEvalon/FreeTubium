import { motion } from "framer-motion";

import { cn } from "../../lib/cn";

export function ProgressBar({
  percent,
  active = false,
  indeterminate = false,
  tone = "accent",
  className,
}: {
  percent: number;
  /** Adds the animated sheen while a download is running. */
  active?: boolean;
  indeterminate?: boolean;
  tone?: "accent" | "muted" | "negative";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-canvas-soft",
        "border border-hairline",
        className,
      )}
    >
      {indeterminate ? (
        <div className="absolute inset-y-0 w-1/3 overflow-hidden">
          <div className="accent-gradient progress-sheen h-full w-full rounded-full opacity-80" />
        </div>
      ) : (
        <motion.div
          initial={false}
          animate={{ width: `${clamped}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 28 }}
          className={cn(
            "relative h-full rounded-full",
            tone === "accent" && "accent-gradient",
            tone === "muted" && "bg-ink-faint",
            tone === "negative" && "bg-negative",
          )}
        >
          {active && clamped > 2 ? (
            <span className="absolute inset-0 overflow-hidden rounded-full">
              <span className="progress-sheen block h-full w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
            </span>
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
