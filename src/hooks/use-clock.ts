"use client";

import { useEffect, useState } from "react";

/**
 * Ticking clock. Returns `null` until mounted so SSR and the first
 * client render agree (no hydration mismatches on time-dependent UI).
 */
export function useClock(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const kickoff = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
