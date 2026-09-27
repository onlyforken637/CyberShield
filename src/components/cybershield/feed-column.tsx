"use client";

import { useEffect, useMemo, useRef } from "react";
import { Flame, Loader2, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { ArticleCard } from "@/components/cybershield/article-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_MAP } from "@/lib/cyber/categories";
import { gsap, ScrollTrigger, prefersReducedMotion, whenBooted } from "@/lib/cyber/gsap";
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
 */
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
  const filtersActive =
    query.trim().length > 0 ||
    activeTopics.length > 0 ||
    activeCategory !== "all" ||
    enabledSourceCount < totalSources;

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
    : `${items.length} of ${totalCount} signals · ${signalRate} SIG/HR · ${onlineCount}/${totalSources} streams online${
        lastSyncAt ? ` · synced ${formatUtc(lastSyncAt, false)} UTC` : ""
      }`;

  /* GSAP card choreography — the feed assembles after boot, then new
     batches reveal on scroll. Re-runs on filter changes so every slice
     of the stream lands with the same staggered entrance. */
  useEffect(() => {
    const root = feedListRef.current;
    if (!root || prefersReducedMotion()) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card-reveal]"));
    if (cards.length === 0) return;

    let batch: ScrollTrigger[] = [];
    let cancelled = false;
    whenBooted(() => {
      if (cancelled) return;
      gsap.set(cards, { opacity: 0, y: 26 });
      batch = ScrollTrigger.batch(cards, {
        start: "top 97%",
        once: true,
        onEnter: (nodes) =>
          gsap.to(nodes, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "expo.out",
            stagger: 0.07,
            overwrite: true,
            clearProps: "transform",
          }),
      });
    });

    return () => {
      cancelled = true;
      batch.forEach((trigger) => trigger.kill());
      gsap.set(cards, { clearProps: "all" });
    };
  }, [items, booting]);

  return (
    <div className="flex min-w-0 flex-col">
      {/* ── Feed masthead ────────────────────────────────────────── */}
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-cyber-border/60 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyber-teal" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-cyber-teal">
              {"// LIVE THREAT STREAM"}
            </span>
          </div>
          <h1 className="mt-0.5 font-display text-lg font-bold text-slate-100 sm:text-2xl">
            Threat Intelligence
          </h1>
          <p className="digital mt-0.5 truncate text-[10px] tracking-wide text-slate-500" suppressHydrationWarning>
            {syncing && booting ? "CONNECTING TO LIVE STREAMS…" : meta.toUpperCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={onManualSync}
          disabled={syncing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyber-border bg-cyber-surface px-3.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:border-cyber-teal hover:text-cyber-teal disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          <span className="hidden sm:inline">{syncing ? "Syncing…" : "Refresh Stream"}</span>
        </button>
      </div>

      {/* ── Search (mobile) + active filter chips ────────────────── */}
      {(filtersActive || query.length > 0) && (
        <div className="mb-4 flex flex-col gap-2.5">
          <div className="relative lg:hidden">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search threats…"
              aria-label="Search live article stream"
              className="h-9 border-cyber-border bg-cyber-surface pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:border-cyber-teal focus-visible:ring-cyber-teal/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-slate-500">
              <SlidersHorizontal className="h-3 w-3 text-cyber-teal" /> FILTER VECTOR:
            </span>
            {activeCategory !== "all" && (
              <FilterChip
                label={CATEGORY_MAP[activeCategory]?.label ?? activeCategory}
                onRemove={() => onSelectCategory("all")}
              />
            )}
            {query.trim() && (
              <FilterChip label={`QUERY: "${query.trim()}"`} onRemove={() => onQueryChange("")} />
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
              className="ml-1 rounded-sm border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-cyber-crimson transition-colors hover:bg-cyber-crimson/20"
            >
              CLEAR ALL
            </button>
          </div>
        </div>
      )}

      {/* ── Ranked threat board (only on the unfiltered stream) ──── */}
      {!filtersActive && topThreats.length === 3 && (
        <section
          className="mb-5 rounded-xl border border-cyber-border bg-cyber-surface p-4 shadow-lg"
          aria-label="Ranked threat board"
        >
          <header className="mb-3 flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-cyber-crimson" />
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">
              Ranked Threat Board
            </h2>
            <span className="digital ml-auto text-[8.5px] tracking-widest text-slate-600">
              TOP SEVERITY · LIVE COMPUTED
            </span>
          </header>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {topThreats.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenArticle(item)}
                className="card-in group relative overflow-hidden rounded-md border border-cyber-border/80 bg-cyber-surface/80 p-3 text-left transition-all hover:border-cyber-teal/50 hover:bg-cyber-surface"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "digital text-2xl font-black leading-none",
                      index === 0
                        ? "neon-crimson"
                        : index === 1
                          ? "neon-amber"
                          : "neon-teal",
                    )}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "digital text-[8px] font-black tracking-widest",
                        item.intel.severity.label === "CRITICAL"
                          ? "text-cyber-crimson"
                          : item.intel.severity.label === "HIGH"
                            ? "text-cyber-orange"
                            : "text-cyber-amber",
                      )}
                    >
                      {item.intel.severity.label} · {item.intel.severity.score}/100
                    </span>
                    <p className="mt-1 line-clamp-2 text-[11.5px] font-bold leading-snug text-slate-100 transition-colors group-hover:text-cyber-teal">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-[9.5px] leading-relaxed text-slate-500">
                      {item.intel.lede}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span
                        className={cn(
                          "rounded-sm border px-1 py-0.5 text-[7.5px] font-bold tracking-widest",
                          item.accent.chip,
                        )}
                      >
                        {item.sourceShort}
                      </span>
                      {item.intel.cves.slice(0, 1).map((cve) => (
                        <span
                          key={cve}
                          className="digital rounded-sm border border-cyber-crimson/40 bg-cyber-crimson/10 px-1 py-0.5 text-[7.5px] font-bold text-cyber-crimson/90"
                        >
                          {cve}
                        </span>
                      ))}
                      {item.intel.orgs.slice(0, 1).map((org) => (
                        <span
                          key={org}
                          className="rounded-sm border border-cyber-violet/30 bg-cyber-violet/5 px-1 py-0.5 text-[7.5px] font-semibold text-cyber-violet/90"
                        >
                          {org}
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

      <div ref={feedListRef} className="w-full space-y-2.5" aria-label="Live cybersecurity news feed" role="feed">
        {booting ? (
          <>
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-md border border-cyber-border/70 bg-cyber-surface/50 p-3"
              >
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
              ACQUIRING {totalSources} LIVE UPLINKS…
            </p>
          </>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-cyber-border/80 bg-cyber-panel/50 px-6 py-14 text-center">
            <Search className="mb-3 h-6 w-6 text-slate-600" />
            <p className="digital text-[11px] font-bold tracking-widest text-slate-400">
              NO SIGNALS MATCH CURRENT FILTER VECTOR
            </p>
            <p className="mt-1.5 max-w-sm text-[10px] leading-relaxed tracking-wide text-slate-600">
              Adjust the search query, category pill, topic badges, or re-enable disabled sources to
              widen the intercept window.
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
