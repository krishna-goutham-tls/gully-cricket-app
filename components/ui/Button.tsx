"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-ink text-bg shadow-card hover:bg-ink/90 active:scale-[0.98]",
  secondary:
    "bg-surface text-ink border border-line hover:bg-bg active:scale-[0.98]",
  ghost: "bg-transparent text-muted hover:bg-ink/[0.04] active:scale-[0.98]",
  danger: "bg-danger-soft text-danger border border-danger/20 hover:bg-danger/10",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    fullWidth?: boolean;
  }
>(function Button(
  { className, variant = "primary", fullWidth, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        styles[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
