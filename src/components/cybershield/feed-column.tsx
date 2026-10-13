"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, Loader2, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { ArticleCard } from "@/components/cybershield/article-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_MAP } from "@/lib/cyber/categories";
import type { FeedItem } from "@/lib/cyber/feeds";
import { formatUtc } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

interface FeedColumnProps {
  items: FeedItem[];
  totalCount: number;
  onlineCount: number;
  totalSources: number;
  lastSyncAt: number | null;
  syncing: boolean;
  onManualSync: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  activeTopics: string[];
  onRemoveTopic: (topic: string) => void;
  activeCategory: string;
  onSelectCategory: (categoryId: string) => void;
  enabledSourceCount: number;
  onClearFilters: () => void;
  booting: boolean;
  selectedId: string | null;
  onOpenArticle: (item: FeedItem) => void;
}

/**
 * Main feed column — Threat Intelligence masthead, Ranked Threat Board,
 * refresh control, active filter chips and the fluid live news stream.
 * Spacing follows an 8pt grid with deliberate breathing room (HCI).
 *
 * Rendering is incremental: only the first INITIAL_VISIBLE cards mount
 * up front (each card carries GSAP tilt listeners + canvas thumbs, so
 * mounting ~200 at once froze tag/category switches). An
 * IntersectionObserver streams in further chunks as the user scrolls.
 */
const INITIAL_VISIBLE = 24;
const LOAD_CHUNK = 16;

export function FeedColumn({
  items,
  totalCount,
  onlineCount,
  totalSources,
  lastSyncAt,
  syncing,
  onManualSync,
  query,
  onQueryChange,
  activeTopics,
  onRemoveTopic,
  activeCategory,
  onSelectCategory,
  enabledSourceCount,
  onClearFilters,
  booting,
  selectedId,
  onOpenArticle,
}: FeedColumnProps) {
  const feedListRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filtersActive =
    query.trim().length > 0 ||
    activeTopics.length > 0 ||
    activeCategory !== "all" ||
    enabledSourceCount < totalSources;

  /* ── incremental stream window ───────────────────────────────── */
  // The window state carries the items slice it was sized for. When the
  // filter engine emits a new slice, `src !== items` and the visible
  // count derives straight back to INITIAL_VISIBLE — no effects, no
  // flash, and no ref writes during render (linter-safe).
  const [streamWindow, setStreamWindow] = useState<{ src: FeedItem[]; count: number }>({
    src: items,
    count: INITIAL_VISIBLE,
  });
  const visibleCount = streamWindow.src === items ? streamWindow.count : INITIAL_VISIBLE;
  const hasMore = visibleCount < items.length;
  const loadMore = () =>
    setStreamWindow({ src: items, count: Math.min(visibleCount + LOAD_CHUNK, items.length) });

  // stream in the next chunk when the sentinel scrolls into range
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "700px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, items]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  // signals intercepted in the last hour — live stream velocity
  const signalRate = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return items.filter((item) => item.publishedAt >= cutoff).length;
  }, [items]);

  // highest-severity live signals — the exhibition "top board"
  const topThreats = useMemo(
    () =>
      [...items]
        .filter((item) => item.intel.lede)
        .sort((a, b) => b.intel.severity.score - a.intel.severity.score)
        .slice(0, 3),
    [items],
  );

  const meta = booting
    ? "Connecting to streams…"
    : `${items.length} of ${totalCount} signals · ${signalRate}/hr velocity · ${onlineCount}/${totalSources} streams online${
        lastSyncAt ? ` · synced ${formatUtc(lastSyncAt, false)} UTC` : ""
      }`;

  /* Card entrances are pure CSS (`.card-in`, capped stagger on the
     first window, reduced-motion safe). The old GSAP
     ScrollTrigger.batch-per-filter-change choreography was the single
     biggest source of tag/category switch lag — killing it keeps
     switches instant. */

  return (
    <div className="flex min-w-0 flex-col">
      {/* ── Feed masthead ────────────────────────────────────────── */}
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-cyber-border/60 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyber-teal shadow-[0_0_8px_rgba(var(--teal-rgb),0.8)]" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-cyber-teal">
              Live Threat Stream
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-xl font-bold text-hi sm:text-[1.7rem] sm:leading-tight">
            Threat Intelligence
          </h1>
          <p className="digital mt-1.5 truncate text-[11px] tracking-wide text-low" suppressHydrationWarning>
            {syncing && booting ? "CONNECTING TO LIVE STREAMS…" : meta.toUpperCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={onManualSync}
          disabled={syncing}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-cyber-border bg-cyber-surface px-4 text-[13px] font-semibold text-mid transition-colors hover:border-cyber-teal/60 hover:text-cyber-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          <span className="hidden sm:inline">{syncing ? "Syncing…" : "Refresh"}</span>
        </button>
      </div>

      {/* ── Search (mobile) + active filter chips ────────────────── */}
      {(filtersActive || query.length > 0) && (
        <div className="mb-5 flex flex-col gap-3">
          <div className="relative lg:hidden">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-low"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search threats…"
              aria-label="Search live article stream"
              className="h-10 rounded-lg border-cyber-border bg-cyber-surface pl-9 text-[13px] text-hi placeholder:text-low focus-visible:border-cyber-teal focus-visible:ring-cyber-teal/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-low">
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyber-teal" /> FILTERS
            </span>
            {activeCategory !== "all" && (
              <FilterChip
                label={CATEGORY_MAP[activeCategory]?.label ?? activeCategory}
                onRemove={() => onSelectCategory("all")}
              />
            )}
            {query.trim() && (
              <FilterChip label={`"${query.trim()}"`} onRemove={() => onQueryChange("")} />
            )}
            {activeTopics.map((topic) => (
              <FilterChip
                key={topic}
                label={topic.toUpperCase()}
                onRemove={() => onRemoveTopic(topic)}
              />
            ))}
            {enabledSourceCount < totalSources && (
              <FilterChip
                label={`${enabledSourceCount}/${totalSources} SOURCES`}
                onRemove={onClearFilters}
              />
            )}
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-lg border border-cyber-crimson/40 bg-cyber-crimson/10 px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-cyber-crimson transition-colors hover:bg-cyber-crimson/20"
            >
              CLEAR ALL
            </button>
          </div>
        </div>
      )}

      {/* ── Ranked threat board (only on the unfiltered stream) ──── */}
      {!filtersActive && topThreats.length === 3 && (
        <section
          className="card-surface signal-sweep mb-6 p-5"
          aria-label="Ranked threat board"
        >
          <header className="mb-4 flex items-center gap-2.5">
            <Flame className="h-4 w-4 text-cyber-crimson" />
            <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-hi">
              Ranked Threat Board
            </h2>
            <span className="digital ml-auto text-[9.5px] tracking-widest text-low">
              TOP SEVERITY · LIVE
            </span>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {topThreats.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenArticle(item)}
                className="card-in group relative overflow-hidden rounded-xl border border-cyber-border/80 bg-cyber-panel/60 p-4 text-left transition-all hover:border-cyber-teal/50 hover:bg-cyber-panel"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "digital text-[1.7rem] font-black leading-none",
                      index === 0 ? "neon-crimson" : index === 1 ? "neon-amber" : "neon-teal",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "digital text-[9px] font-black tracking-widest",
                        item.intel.severity.label === "CRITICAL"
                          ? "text-cyber-crimson"
                          : item.intel.severity.label === "HIGH"
                            ? "text-cyber-orange"
                            : "text-cyber-amber",
                      )}
                    >
                      {item.intel.severity.label} · {item.intel.severity.score}/100
                    </span>
                    <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-snug text-hi transition-colors group-hover:text-cyber-teal">
                      {item.title}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-mid">
                      {item.intel.lede}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[8.5px] font-bold tracking-widest",
                          item.accent.chip,
                        )}
                      >
                        {item.sourceShort}
                      </span>
                      {item.intel.cves.slice(0, 1).map((cve) => (
                        <span
                          key={cve}
                          className="digital rounded-md border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[8.5px] font-bold text-cyber-crimson"
                        >
                          {cve}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div ref={feedListRef} className="w-full space-y-3" aria-label="Live cybersecurity news feed" role="feed">
        {booting ? (
          <>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex gap-4 rounded-xl border border-cyber-border/70 bg-cyber-surface/60 p-4"
              >
                <Skeleton className="h-[92px] w-[140px] shrink-0 rounded-lg bg-cyber-raised" />
                <div className="flex-1 space-y-2.5 py-1">
                  <Skeleton className="h-2.5 w-24 bg-cyber-raised" />
                  <Skeleton className="h-4 w-full bg-cyber-raised" />
                  <Skeleton className="h-4 w-3/4 bg-cyber-raised" />
                  <Skeleton className="h-2.5 w-5/6 bg-cyber-raised" />
                </div>
              </div>
            ))}
            <p className="digital flex items-center justify-center gap-2 py-3 text-[11px] tracking-widest text-cyber-teal">
              <Loader2 className="h-4 w-4 animate-spin" />
              ACQUIRING {totalSources} LIVE UPLINKS…
            </p>
          </>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-cyber-border bg-cyber-panel/50 px-6 py-16 text-center">
            <Search className="mb-4 h-7 w-7 text-low" />
            <p className="digital text-[12px] font-bold tracking-widest text-mid">
              NO SIGNALS MATCH CURRENT FILTERS
            </p>
            <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-low">
              Adjust the search query, category pill, topic badges, or re-enable disabled sources to
              widen the intercept window.
            </p>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-5 rounded-lg border border-cyber-teal/50 bg-cyber-teal/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyber-teal transition-colors hover:bg-cyber-teal/20"
            >
              RESET FILTERS
            </button>
          </div>
        ) : (
          visibleItems.map((item, index) => (
            <div
              key={item.id}
              className="card-in"
              style={{
                animationDelay:
                  index < INITIAL_VISIBLE ? `${Math.min(index, 11) * 45}ms` : undefined,
              }}
            >
              <ArticleCard
                item={item}
                selected={selectedId === item.id}
                onOpen={onOpenArticle}
              />
            </div>
          ))
        )}

        {/* ── incremental stream sentinel + manual load-more ───────── */}
        {!booting && items.length > INITIAL_VISIBLE && (
          <div ref={sentinelRef} className="flex flex-col items-center gap-3 py-6">
            <span className="digital text-[10px] tracking-widest text-low">
              {hasMore
                ? `SHOWING ${visibleCount} OF ${items.length} SIGNALS · SCROLL FOR MORE`
                : `END OF STREAM · ${items.length} SIGNALS`}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                className="rounded-lg border border-cyber-teal/50 bg-cyber-teal/10 px-4 py-2 text-[11px] font-bold tracking-wider text-cyber-teal transition-colors hover:bg-cyber-teal/20"
              >
                LOAD MORE SIGNALS
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-lg border border-cyber-teal/40 bg-cyber-teal/10 py-1 pl-2.5 pr-1 text-[10px] font-bold tracking-wider text-cyber-teal">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="rounded-md p-1 transition-colors hover:bg-cyber-teal/20"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
