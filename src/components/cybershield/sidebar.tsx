"use client";

import { useMemo } from "react";
import { Filter, Radio, Rss, Tags, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { KEYWORD_LEXICON } from "@/lib/cyber/keywords";
import type { FeedItem } from "@/lib/cyber/feeds";
import type { FeedRuntimeState } from "@/hooks/use-cyber-feeds";
import { cn } from "@/lib/utils";

interface SidebarProps {
  items: FeedItem[];
  feedStates: Record<string, FeedRuntimeState>;
  enabledSources: string[];
  onToggleSource: (sourceId: string) => void;
  activeTopics: string[];
  onToggleTopic: (topic: string) => void;
  onResetFilters: () => void;
}

interface TopicCount {
  topic: string;
  count: number;
}

const MAX_TOPICS = 16;

/**
 * Column A — Live Streams & Filter Context.
 * Status node, dynamic topic cloud, and the active feeds tracker.
 */
export function Sidebar({
  items,
  feedStates,
  enabledSources,
  onToggleSource,
  activeTopics,
  onToggleTopic,
  onResetFilters,
}: SidebarProps) {
  const topicCounts: TopicCount[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!enabledSources.includes(item.sourceId)) continue;
      for (const keyword of KEYWORD_LEXICON) {
        if (item.searchBlob.includes(keyword.toLowerCase())) {
          counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TOPICS);
  }, [items, enabledSources]);

  const filtersActive = activeTopics.length > 0 || enabledSources.length < 3;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Uplink status node ─────────────────────────────────── */}
      <section
        className="signal-sweep rounded-md border border-cyber-border bg-cyber-panel p-3.5"
        aria-label="Research stream status"
      >
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 text-cyber-green cyber-ping">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyber-green shadow-[0_0_10px_rgba(43,255,158,0.9)]" />
          </span>
          <p className="neon-green digital text-[11px] font-bold leading-tight">
            20/20 RESEARCH STREAMS ONLINE
          </p>
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed tracking-wider text-slate-500">
          UPLINK GRID STABLE · TTL SYNC 12:00
          <br />
          RSS→JSON PIPELINE · CISA KEV PIPELINE
        </p>
      </section>

      {/* ── Topic intercept cloud ──────────────────────────────── */}
      <section
        className="rounded-md border border-cyber-border bg-cyber-panel p-3.5"
        aria-label="Topic intercept cloud"
      >
        <header className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-slate-300">
            <Tags className="h-3.5 w-3.5 text-cyber-teal" />
            TOPIC INTERCEPT CLOUD
          </h2>
          {filtersActive && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1 rounded-sm border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-cyber-crimson transition-colors hover:bg-cyber-crimson/20"
            >
              <X className="h-2.5 w-2.5" /> RESET
            </button>
          )}
        </header>

        {topicCounts.length === 0 ? (
          <p className="py-3 text-center text-[10px] tracking-wider text-slate-600">
            <Radio className="mx-auto mb-2 h-4 w-4 opacity-40" />
            LISTENING FOR INCOMING SIGNALS…
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {topicCounts.map(({ topic, count }) => {
              const selected = activeTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => onToggleTopic(topic)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-sm border px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-wider transition-all duration-150",
                    selected
                      ? "border-cyber-teal bg-cyber-teal/15 text-cyber-teal shadow-[0_0_10px_rgba(0,229,255,0.25)]"
                      : "border-cyber-border bg-cyber-surface text-slate-400 hover:border-cyber-teal/50 hover:text-slate-200",
                  )}
                >
                  {topic}
                  <span
                    className={cn(
                      "digital ml-1 text-[8.5px]",
                      selected ? "text-cyber-teal/80" : "text-slate-600",
                    )}
                  >
                    ×{count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeTopics.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 border-t border-cyber-border/60 pt-2 text-[9px] tracking-wider text-slate-500">
            <Filter className="h-3 w-3 text-cyber-teal" />
            SLICING STREAM ON {activeTopics.length} TOPIC
            {activeTopics.length === 1 ? "" : "S"}
          </p>
        )}
      </section>

      {/* ── Active feeds tracker ───────────────────────────────── */}
      <section
        className="rounded-md border border-cyber-border bg-cyber-panel p-3.5"
        aria-label="Active feeds tracker"
      >
        <h2 className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-slate-300">
          <Rss className="h-3.5 w-3.5 text-cyber-teal" />
          ACTIVE FEEDS TRACKER
        </h2>
        <p className="mb-2.5 text-[9px] tracking-wider text-slate-600">
          UNCHECK A SOURCE TO EXCLUDE IT FROM THE STREAM
        </p>

        <ul className="flex flex-col gap-1">
          {Object.entries(feedStates).map(([sourceId, state]) => {
            const item = items.find((i) => i.sourceId === sourceId);
            const accent = item?.accent;
            const name =
              sourceId === "bleepingcomputer"
                ? "BleepingComputer"
                : sourceId === "thehackernews"
                  ? "The Hacker News"
                  : "Threatpost";
            const enabled = enabledSources.includes(sourceId);

            return (
              <li
                key={sourceId}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm border px-2 py-2 transition-colors",
                  enabled
                    ? "border-cyber-border/70 bg-cyber-surface/70"
                    : "border-cyber-border/40 bg-cyber-surface/20 opacity-55",
                )}
              >
                <Checkbox
                  id={`feed-${sourceId}`}
                  checked={enabled}
                  onCheckedChange={() => onToggleSource(sourceId)}
                  aria-label={`Toggle ${name} feed`}
                  className="border-slate-600 data-[state=checked]:border-cyber-teal data-[state=checked]:bg-cyber-teal/90 data-[state=checked]:text-cyber-bg"
                />
                <label
                  htmlFor={`feed-${sourceId}`}
                  className="min-w-0 flex-1 cursor-pointer select-none"
                >
                  <span className="block truncate text-[11px] font-semibold text-slate-200">
                    {name}
                  </span>
                  <span className="digital block text-[8.5px] tracking-wider text-slate-500">
                    {state.count} SIGNAL{state.count === 1 ? "" : "S"}
                    {state.via && (
                      <span
                        className={cn(
                          "ml-1.5",
                          state.via === "direct" ? "text-cyber-teal/70" : "text-cyber-amber/70",
                        )}
                      >
                        · {state.via === "direct" ? "DIRECT" : "RELAY"}
                      </span>
                    )}
                  </span>
                </label>
                <FeedStatusDot state={state} accentDot={accent?.dot} />
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Filter context legend ──────────────────────────────── */}
      <section className="rounded-md border border-cyber-border/60 bg-cyber-panel/60 p-3">
        <h2 className="mb-1.5 text-[9px] font-bold tracking-[0.2em] text-slate-500">
          FILTER CONTEXT
        </h2>
        <ul className="space-y-1 text-[9px] leading-relaxed tracking-wider text-slate-600">
          <li>▸ TOPIC BADGES SLICE THE CENTER FEED INSTANTLY</li>
          <li>▸ FEED CHECKBOXES EXCLUDE ENTIRE SOURCES</li>
          <li>▸ SEARCH MATCHES TITLE · SUMMARY · SOURCE</li>
        </ul>
      </section>
    </div>
  );
}

function FeedStatusDot({ state, accentDot }: { state: FeedRuntimeState; accentDot?: string }) {
  const tone =
    state.status === "online"
      ? "bg-cyber-green shadow-[0_0_8px_rgba(43,255,158,0.8)]"
      : state.status === "offline"
        ? "bg-cyber-crimson shadow-[0_0_8px_rgba(255,59,48,0.8)]"
        : state.status === "empty"
          ? "bg-cyber-amber shadow-[0_0_8px_rgba(255,179,0,0.8)]"
          : "bg-cyber-teal blink-soft";

  return (
    <span className="flex items-center gap-1.5" title={`feed status: ${state.status}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", accentDot ?? "bg-slate-500", "opacity-50")} />
      <span
        className={cn("h-2 w-2 rounded-full transition-colors", tone)}
        aria-label={state.status}
      />
    </span>
  );
}
