import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

type Tone = "neutral" | "accent" | "positive" | "warning" | "negative";

const TONES: Record<Tone, string> = {
  neutral: "border-hairline bg-canvas-soft/70 text-ink-muted",
  accent: "border-violet/40 bg-accent-soft text-violet",
  positive: "border-positive/35 bg-positive/12 text-positive",
  warning: "border-warning/35 bg-warning/12 text-warning",
  negative: "border-negative/35 bg-negative/12 text-negative",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
