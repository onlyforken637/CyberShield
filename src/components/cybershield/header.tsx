"use client";

import { RefreshCw, ShieldHalf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClock } from "@/hooks/use-clock";
import { formatUtc, pad2 } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps {
  syncing: boolean;
  lastSyncAt: number | null;
  nextSyncAt: number | null;
  onManualSync: () => void;
}

/**
 * Brand masthead with live uplink telemetry and manual sync trigger.
 */
export function DashboardHeader({
  syncing,
  lastSyncAt,
  nextSyncAt,
  onManualSync,
}: DashboardHeaderProps) {
  const now = useClock(1000);
  const remainingMs = nextSyncAt && now ? Math.max(0, nextSyncAt - now.getTime()) : null;
  const remainingMin = remainingMs !== null ? Math.floor(remainingMs / 60_000) : null;
  const remainingSec = remainingMs !== null ? Math.floor((remainingMs % 60_000) / 1000) : null;

  return (
    <header className="relative z-20 shrink-0 border-b border-cyber-border bg-cyber-panel/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center gap-3 px-3 sm:px-4">
        <ShieldHalf className="h-5 w-5 shrink-0 text-cyber-teal drop-shadow-[0_0_8px_rgba(0,229,255,0.55)]" />
        <h1 className="crt-flicker truncate text-[13px] font-bold tracking-[0.28em] text-slate-100 sm:text-sm">
          CYBER<span className="text-cyber-teal">_</span>SHIELD
          <span className="mx-1.5 text-cyber-teal">{"//"}</span>
          <span className="text-cyber-teal">LIVE_FEED</span>
        </h1>

        <span className="hidden rounded-sm border border-cyber-border bg-cyber-surface px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-slate-400 lg:inline-block">
          SOC-GRID v2.4.1
        </span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-cyber-green">
            <span className="relative inline-flex h-2 w-2 text-cyber-green cyber-ping">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyber-green" />
            </span>
            LIVE
          </span>

          {remainingMin !== null && remainingSec !== null && (
            <span
              className="digital hidden text-[10px] text-slate-500 md:inline"
              title="Time until next automatic stream sync"
            >
              AUTO-SYNC T-{pad2(remainingMin)}:{pad2(remainingSec)}
            </span>
          )}

          <span className="digital hidden text-[10px] text-slate-500 xl:inline">
            LAST SYNC {lastSyncAt ? formatUtc(lastSyncAt, false) : "--:--:--"}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={onManualSync}
            disabled={syncing}
            className="h-7 gap-1.5 border-cyber-border bg-cyber-surface px-2.5 text-[10px] font-semibold tracking-widest text-slate-300 hover:border-cyber-teal/60 hover:bg-cyber-raised hover:text-cyber-teal"
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? "SYNCING" : "SYNC"}
          </Button>
        </div>
      </div>

      {/* indeterminate sync scanline */}
      <div
        className={cn(
          "relative h-px w-full overflow-hidden bg-cyber-border/50 transition-opacity",
          syncing ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      >
        {syncing && <div className="scanline" />}
      </div>
    </header>
  );
}
