import { cn } from "@/lib/utils";

/**
 * Cut text that still reads as the thing it is. `title` keeps the full
 * string for a long-press / hover. Names wrap to two lines before ellipsis.
 */
export function TruncText({
  children,
  lines = 1,
  className,
}: {
  children: string;
  lines?: 1 | 2;
  className?: string;
}) {
  return (
    <span
      title={children}
      className={cn(
        "min-w-0",
        lines === 2
          ? "line-clamp-2 [overflow-wrap:anywhere]"
          : "block truncate",
        className,
      )}
    >
      {children}
    </span>
  );
}
