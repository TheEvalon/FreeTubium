import { motion } from "framer-motion";

import { cn } from "../../lib/cn";

export interface Segment<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: Array<Segment<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Unique per control instance so the sliding pill animates independently. */
  layoutId: string;
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  layoutId,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-canvas-soft/60 p-1",
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={segment.hint}
            onClick={() => onChange(segment.value)}
            className={cn(
              "focus-ring relative cursor-pointer rounded-lg font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              selected ? "text-white" : "text-ink-muted hover:text-ink",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="accent-gradient absolute inset-0 rounded-lg shadow-glow"
              />
            ) : null}
            <span className="relative z-10 whitespace-nowrap">{segment.label}</span>
          </button>
        );
      })}
    </div>
  );
}
