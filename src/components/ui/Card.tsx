import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a hover lift; use for interactive cards. */
  interactive?: boolean;
  padded?: boolean;
}

export function Card({
  interactive = false,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "glass rounded-card border border-hairline shadow-panel",
        padded && "p-4",
        interactive &&
          "transition-[border-color,background-color,transform] duration-200 hover:border-hairline-strong hover:bg-card-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
