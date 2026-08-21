import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Gully mark — charcoal field, cream stumps, gold bails. */
export function Logo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/icons/icon-192.png"
      alt="Gully Cricket"
      width={size}
      height={size}
      priority
      className={cn("rounded-[22%]", className)}
      style={{ width: size, height: size }}
    />
  );
}
