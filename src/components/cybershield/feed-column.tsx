"use client";

import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { ArticleCard } from "@/components/cybershield/article-card";
import { SystemClock } from "@/components/cybershield/clock";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedItem } from "@/lib/cyber/feeds";
import { cn } from "@/lib/utils";

interface FeedColumnProps {
  items: FeedItem[];
  totalCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  activeTopics: string[];
  onRemoveTopic: (topic: string) => void;
  enabledSourceCount: number;
  onClearFilters: () => void;
  booting: boolean;
  selectedId: string | null;
  onOpenArticle: (item: FeedItem) => void;
}

/**
 * Column B — Main content area: control bar (clock + live search)
 * and the fluid, filtered news feed.
 */
export function FeedColumn({
  items,
  totalCount,
  query,
  onQueryChange,
  activeTopics,
  onRemoveTopic,
  enabledSourceCount,
  onClearFilters,
  booting,
  selectedId,
  onOpenArticle,
}: FeedColumnProps) {
  const filtersActive = query.trim().length > 0 || activeTopics.length > 0 || enabledSourceCount < 3;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Top control bar ────────────────────────────────────── */}
      <section
        className="shrink-0 rounded-md border border-cyber-border bg-cyber-panel p-2.5"
        aria-label="Feed controls"
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="flex items-center justify-between gap-3 lg:justify-start">
            <SystemClock />
            <span className="digital shrink-0 rounded-sm border border-cyber-border bg-cyber-surface px-2 py-1 text-[9.5px] font-bold tracking-widest text-slate-400 lg:ml-1">
              SIGNALS {items.length}/{totalCount}
            </span>
          </div>

          <div className="relative flex-1 lg:ml-2">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search live streams… :: title, summary, source"
              aria-label="Search live article stream"
              className="h-8 border-cyber-border bg-cyber-surface pl-8 text-[11px] text-slate-200 placeholder:text-slate-600 focus-visible:ring-cyber-teal/50"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-500 hover:text-cyber-teal"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* active filter chips */}
        {filtersActive && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-cyber-border/60 pt-2.5">
            <span className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-slate-500">
              <SlidersHorizontal className="h-3 w-3 text-cyber-teal" /> FILTER VECTOR:
            </span>
            {query.trim() && (
              <FilterChip label={`QUERY: "${query.trim()}"`} onRemove={() => onQueryChange("")} />
            )}
            {activeTopics.map((topic) => (
              <FilterChip key={topic} label={topic.toUpperCase()} onRemove={() => onRemoveTopic(topic)} />
            ))}
            {enabledSourceCount < 3 && (
              <FilterChip
                label={`${enabledSourceCount}/3 SOURCES ACTIVE`}
                onRemove={onClearFilters}
              />
            )}
            <button
              type="button"
              onClick={onClearFilters}
              className="ml-1 rounded-sm border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-cyber-crimson transition-colors hover:bg-cyber-crimson/20"
            >
              CLEAR ALL
            </button>
          </div>
        )}
      </section>

      {/* ── Live feed stack ────────────────────────────────────── */}
      <div
        className="cyber-scroll min-h-0 flex-1 space-y-2.5 lg:overflow-y-auto lg:pr-1.5"
        aria-label="Live cybersecurity news feed"
        role="feed"
      >
        {booting ? (
          <>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-3 rounded-md border border-cyber-border/70 bg-cyber-surface/50 p-3">
                <Skeleton className="h-[84px] w-[132px] shrink-0 rounded-sm bg-cyber-raised" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-2.5 w-24 bg-cyber-raised" />
                  <Skeleton className="h-3.5 w-full bg-cyber-raised" />
                  <Skeleton className="h-3.5 w-3/4 bg-cyber-raised" />
                  <Skeleton className="h-2.5 w-5/6 bg-cyber-raised" />
                </div>
              </div>
            ))}
            <p className="digital flex items-center justify-center gap-2 py-2 text-[10px] tracking-widest text-cyber-teal/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ACQUIRING LIVE UPLINKS…
            </p>
          </>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-cyber-border/80 bg-cyber-panel/50 px-6 py-14 text-center">
            <Search className="mb-3 h-6 w-6 text-slate-600" />
            <p className="digital text-[11px] font-bold tracking-widest text-slate-400">
              NO SIGNALS MATCH CURRENT FILTER VECTOR
            </p>
            <p className="mt-1.5 max-w-sm text-[10px] leading-relaxed tracking-wide text-slate-600">
              Adjust the search query, topic badges, or re-enable disabled sources to widen the
              intercept window.
            </p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-4 rounded-sm border border-cyber-teal/50 bg-cyber-teal/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyber-teal transition-colors hover:bg-cyber-teal/20"
            >
              RESET FILTER VECTOR
            </button>
          </div>
        ) : (
          items.map((item) => (
            <ArticleCard
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onOpen={onOpenArticle}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-sm border border-cyber-teal/40 bg-cyber-teal/10 py-0.5 pl-1.5 pr-0.5 text-[9px] font-bold tracking-wider text-cyber-teal">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-sm p-0.5 transition-colors hover:bg-cyber-teal/20"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
