"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const styles: Record<Variant, string> = {
  primary: "bg-ink text-bg shadow-card active:scale-[0.98] active:bg-ink/90",
  secondary:
    "bg-surface text-ink border border-line active:scale-[0.98] active:bg-bg",
  ghost: "bg-transparent text-muted active:scale-[0.98] active:bg-ink/[0.04]",
  danger:
    "bg-danger-soft text-danger border border-danger/20 active:scale-[0.98] active:bg-danger/10",
};

const sizes: Record<Size, string> = {
  md: "min-h-12",
  lg: "min-h-14",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    fullWidth?: boolean;
    href?: string;
  }
>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    fullWidth,
    disabled,
    children,
    href,
    ...props
  },
  ref,
) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-40",
    sizes[size],
    styles[variant],
    fullWidth && "w-full",
    className,
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button ref={ref} disabled={disabled} className={cls} {...props}>
      {children}
    </button>
  );
});
