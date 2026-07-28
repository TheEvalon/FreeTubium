import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint ? <span className="text-[0.7rem] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

const CONTROL_BASE =
  "focus-ring w-full rounded-xl border border-hairline bg-canvas-soft/70 px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors duration-150 hover:border-hairline-strong focus:border-violet/60 disabled:opacity-50";

export function TextInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_BASE, className)} {...rest} />;
}

export function NumberInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      className={cn(CONTROL_BASE, "tabular-nums", className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL_BASE, "cursor-pointer appearance-none pr-8", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239c9bb8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "1rem",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2.5",
        disabled && "opacity-50",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "focus-ring relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200",
          checked
            ? "accent-gradient border-transparent"
            : "border-hairline-strong bg-canvas-soft",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[var(--ease-out-soft)]",
            checked ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-ring flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-150",
        checked || indeterminate
          ? "accent-gradient border-transparent text-white"
          : "border-hairline-strong bg-canvas-soft/80 hover:border-violet/60",
        className,
      )}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2.5 rounded-full bg-white" />
      ) : checked ? (
        <svg
          viewBox="0 0 24 24"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : null}
    </button>
  );
}
