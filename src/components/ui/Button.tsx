import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "accent-gradient text-white shadow-glow hover:brightness-110 disabled:shadow-none",
  secondary:
    "glass border border-hairline text-ink hover:border-hairline-strong hover:bg-card-hover",
  ghost: "text-ink-muted hover:text-ink hover:bg-accent-soft",
  danger:
    "border border-negative/35 bg-negative/12 text-negative hover:bg-negative/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-xs",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2.5 rounded-2xl px-6 text-[0.95rem]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      icon,
      trailingIcon,
      loading = false,
      block = false,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          "focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center font-medium",
          "transition-[transform,background-color,border-color,filter,opacity] duration-150",
          "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
          VARIANTS[variant],
          SIZES[size],
          block && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner className="size-4" /> : icon}
        {children}
        {trailingIcon}
      </button>
    );
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
  children: ReactNode;
}

export function IconButton({
  label,
  variant = "ghost",
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={cn(
        "focus-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-xl",
        "transition-[transform,background-color,border-color,opacity] duration-150",
        "active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
