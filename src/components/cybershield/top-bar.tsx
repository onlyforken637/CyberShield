"use client";

import { Activity, BookOpen, Info } from "lucide-react";
import { SystemClock } from "@/components/cybershield/clock";
import { SoundToggle } from "@/components/cybershield/sound-toggle";
import { ThemeToggle } from "@/components/cybershield/theme-toggle";
import { useClock } from "@/hooks/use-clock";
import { SOURCES } from "@/lib/cyber/feeds";
import { pad2 } from "@/lib/cyber/utils";

interface TopBarProps {
  onlineCount: number;
  nextSyncAt: number | null;
  onOpenAbout: () => void;
}

/**
 * Top utility bar — LIVE FEED badge, real-time UTC clock, live source
 * count, the auto-sync countdown and the appearance / audio controls.
 */
export function TopBar({ onlineCount, nextSyncAt, onOpenAbout }: TopBarProps) {
  const now = useClock(1000);
  const remainingMs = nextSyncAt && now ? Math.max(0, nextSyncAt - now.getTime()) : null;
  const remainingMin = remainingMs !== null ? Math.floor(remainingMs / 60_000) : null;
  const remainingSec = remainingMs !== null ? Math.floor((remainingMs % 60_000) / 1000) : null;

  return (
    <div
      data-intro
      className="glass-bar w-full border-b border-cyber-border/60 py-2 text-[11px] text-mid"
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="digital shrink-0 font-bold text-cyber-teal">LIVE FEED</span>
          <span className="hidden h-3 w-px bg-cyber-border sm:block" aria-hidden="true" />
          <SystemClock className="hidden text-[10px] text-mid sm:flex" />
          <span className="hidden h-3 w-px bg-cyber-border sm:block" aria-hidden="true" />
          <span
            className="hidden shrink-0 items-center gap-1.5 truncate font-semibold text-cyber-green sm:flex"
            title="Research streams confirmed online this cycle"
          >
            <span className="cyber-ping relative inline-flex h-1.5 w-1.5 text-cyber-green">
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyber-green" />
            </span>
            {onlineCount}/{SOURCES.length} SOURCES ACTIVE
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="digital hidden text-[10px] text-low md:inline">
            {SOURCES.length}+ CYBERSECURITY RESEARCH STREAMS
          </span>
          {remainingMin !== null && remainingSec !== null && (
            <span
              className="digital hidden items-center gap-1.5 text-[10px] text-low lg:flex"
              title="Time until the next automatic stream sync"
            >
              <Activity className="h-3 w-3 text-cyber-teal/80" />
              AUTO-SYNC T-{pad2(remainingMin)}:{pad2(remainingSec)}
            </span>
          )}
          <ThemeToggle />
          <SoundToggle />
          <a
            href="#resources"
            aria-label="Resources — documentation, presentation and video"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-[10px] font-semibold uppercase tracking-wider text-cyber-teal transition-colors hover:border-cyber-teal/40 hover:bg-cyber-teal/10"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Resources</span>
          </a>
          <button
            type="button"
            onClick={onOpenAbout}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-[10px] font-semibold uppercase tracking-wider text-cyber-teal transition-colors hover:border-cyber-teal/40 hover:bg-cyber-teal/10"
          >
            <Info className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">About</span>
          </button>
        </div>
      </div>
    </div>
  );
}
