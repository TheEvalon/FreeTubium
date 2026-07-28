import { cn } from "../../lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current",
        className,
      )}
    />
  );
}
