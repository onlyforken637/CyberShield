"use client";

import { useClock } from "@/hooks/use-clock";
import { formatUtc } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

/**
 * Live UTC system clock — `YYYY-MM-DD HH:MM:SS UTC`.
 */
export function SystemClock({ className }: { className?: string }) {
  const now = useClock(1000);

  return (
    <div
      className={cn(
        "digital flex items-center gap-1.5 text-[11px] leading-none text-cyber-teal",
        className,
      )}
      aria-label="Coordinated Universal Time"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyber-teal blink-soft" />
      <span suppressHydrationWarning>{now ? formatUtc(now.getTime()) : "----.--.-- --:--:-- UTC"}</span>
    </div>
  );
}
