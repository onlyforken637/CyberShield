"use client";

import { useMemo } from "react";
import type { FeedItem } from "@/lib/cyber/feeds";
import { timeAgo } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

interface TickerProps {
  items: FeedItem[];
  onOpenArticle: (item: FeedItem) => void;
}

const MAX_TICKER_ITEMS = 14;

/**
 * High-tech live alerts ticker — the newest signals scroll marquee-style.
 * Hover pauses the track; every alert opens the Threat Brief drawer.
 */
export function Ticker({ items, onOpenArticle }: TickerProps) {
  const alerts = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = items.filter((item) => item.publishedAt >= cutoff);
    const pool = recent.length >= 4 ? recent : items;
    return pool.slice(0, MAX_TICKER_ITEMS);
  }, [items]);

  return (
    <div
      data-intro
      className="w-full overflow-hidden border-b border-cyber-border/80 bg-cyber-panel/70 py-2"
      role="region"
      aria-label="Live alerts ticker"
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center px-3 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-1.5 border-r border-cyber-crimson/40 pr-3 sm:pr-4">
          <span className="blink-soft h-2 w-2 rounded-full bg-cyber-crimson" />
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-cyber-crimson sm:text-[10px]">
            LIVE ALERTS
          </span>
        </div>

        <div className="marquee-container no-scrollbar flex-1 overflow-hidden">
          {alerts.length === 0 ? (
            <p className="digital pl-4 text-[10.5px] tracking-widest text-slate-600">
              AWAITING FIRST ALERTS FROM THE UPSTREAM GRID…
            </p>
          ) : (
            <div className="marquee-track text-xs text-slate-400">
              <TickerTrack alerts={alerts} onOpenArticle={onOpenArticle} />
              <TickerTrack alerts={alerts} onOpenArticle={onOpenArticle} ariaHidden />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TickerTrack({
  alerts,
  onOpenArticle,
  ariaHidden = false,
}: {
  alerts: FeedItem[];
  onOpenArticle: (item: FeedItem) => void;
  ariaHidden?: boolean;
}) {
  return (
    <div className="flex items-center" aria-hidden={ariaHidden || undefined}>
      {alerts.map((item, index) => (
        <span key={`${ariaHidden ? "dup" : "src"}-${item.id}`} className="flex items-center">
          <button
            type="button"
            onClick={() => onOpenArticle(item)}
            className="flex max-w-[420px] items-center gap-2 px-4 py-0.5 text-left transition-colors hover:text-cyber-teal"
            tabIndex={ariaHidden ? -1 : 0}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.accent.dot)} />
            <span className="digital shrink-0 text-[8.5px] font-bold tracking-widest text-slate-500">
              {item.sourceShort}
            </span>
            <span className="truncate font-medium">{item.title}</span>
            <span className="digital shrink-0 text-[8.5px] text-slate-600" suppressHydrationWarning>
              {timeAgo(item.publishedAt)}
            </span>
          </button>
          <span className="text-[8px] text-cyber-crimson/50" aria-hidden="true">
            ◆
          </span>
          {index === alerts.length - 1 && <span className="w-8" aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}
