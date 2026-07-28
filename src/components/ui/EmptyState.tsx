import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xcard border border-dashed border-hairline px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-hairline bg-accent-soft text-violet">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
