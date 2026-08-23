"use client";

import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }
>(function Input({ className, label, hint, id, ...props }, ref) {
  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="block text-[13px] font-medium text-muted">{label}</span>
      ) : null}
      <input
        ref={ref}
        id={id}
        className={cn(
          "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15",
          className,
        )}
        {...props}
      />
      {hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </label>
  );
});
