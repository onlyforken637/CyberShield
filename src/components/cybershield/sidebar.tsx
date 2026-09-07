"use client";

import { useMemo } from "react";
import { Filter, Radio, Rss, Tags } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExploitMatrixCard,
  KevMetricsCard,
  SeverityBreakdownCard,
  type KevPanelProps,
} from "@/components/cybershield/threat-panel";
import { SOURCES } from "@/lib/cyber/feeds";
import { KEYWORD_LEXICON } from "@/lib/cyber/keywords";
import type { CisaVuln } from "@/lib/cyber/cisa";
import type { FeedItem } from "@/lib/cyber/feeds";
import type { FeedRuntimeState } from "@/hooks/use-cyber-feeds";
import { cn } from "@/lib/utils";

interface SidebarProps extends KevPanelProps {
  items: FeedItem[];
  feedStates: Record<string, FeedRuntimeState>;
  enabledSources: string[];
  onToggleSource: (sourceId: string) => void;
  activeTopics: string[];
  onToggleTopic: (topic: string) => void;
  onClearTopics: () => void;
  onOpenVuln: (vuln: CisaVuln) => void;
}

interface TopicCount {
  topic: string;
  count: number;
}

const MAX_TOPICS = 16;

/**
 * Sidebar analytics column — Live Metrics, Threat Severity, Exploitation
 * Matrix, Topic Cloud and the Active Sources tracker, exactly as laid out
 * in the CyberShield News design.
 */
export function Sidebar({
  items,
  feedStates,
  enabledSources,
  onToggleSource,
  activeTopics,
  onToggleTopic,
  onClearTopics,
  onOpenVuln,
  metrics,
  via,
  syncing,
  error,
  lastSyncAt,
  onRetry,
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

  const kevPanel = { metrics, via, syncing, error, lastSyncAt, onRetry };

  return (
    <div className="space-y-5">
      <KevMetricsCard {...kevPanel} />
      <SeverityBreakdownCard metrics={metrics} syncing={syncing} />
      <ExploitMatrixCard {...kevPanel} onOpenVuln={onOpenVuln} />
      <TopicCloud
        topicCounts={topicCounts}
        activeTopics={activeTopics}
        onToggleTopic={onToggleTopic}
        onClearTopics={onClearTopics}
      />
      <SourcesTracker
        feedStates={feedStates}
        enabledSources={enabledSources}
        onToggleSource={onToggleSource}
      />
    </div>
  );
}

/* ── Topic Cloud ─────────────────────────────────────────────────── */

function TopicCloud({
  topicCounts,
  activeTopics,
  onToggleTopic,
  onClearTopics,
}: {
  topicCounts: TopicCount[];
  activeTopics: string[];
  onToggleTopic: (topic: string) => void;
  onClearTopics: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-cyber-border bg-cyber-panel p-4 shadow-lg"
      aria-label="Topic intercept cloud"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <Tags className="h-3.5 w-3.5 text-cyber-teal" />
          Topic Cloud
        </h2>
        {activeTopics.length > 0 && (
          <button
            type="button"
            onClick={onClearTopics}
            className="text-[10px] font-semibold tracking-wider text-slate-500 transition-colors hover:text-cyber-teal"
          >
            Clear
          </button>
        )}
      </header>

      {topicCounts.length === 0 ? (
        <p className="py-3 text-center text-[10px] tracking-wider text-slate-600">
          <Radio className="mx-auto mb-2 h-4 w-4 opacity-40" />
          LISTENING FOR INCOMING SIGNALS…
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
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
  );
}

/* ── Active Sources tracker ──────────────────────────────────────── */

function SourcesTracker({
  feedStates,
  enabledSources,
  onToggleSource,
}: {
  feedStates: Record<string, FeedRuntimeState>;
  enabledSources: string[];
  onToggleSource: (sourceId: string) => void;
}) {
  const online = Object.values(feedStates).filter((s) => s.status === "online").length;

  return (
    <section
      className="rounded-2xl border border-cyber-border bg-cyber-panel p-4 shadow-lg"
      aria-label="Active sources tracker"
    >
      <header className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <Rss className="h-3.5 w-3.5 text-cyber-teal" />
          Active Sources
        </h2>
        <span className="digital text-[9px] font-bold tracking-widest text-cyber-green">
          {online}/{SOURCES.length} ONLINE
        </span>
      </header>
      <p className="mb-2.5 text-[9px] tracking-wider text-slate-600">
        UNCHECK A SOURCE TO EXCLUDE IT FROM THE STREAM
      </p>

      <ul className="cyber-scroll max-h-80 space-y-1 overflow-y-auto pr-1">
        {SOURCES.map((source) => {
          const state = feedStates[source.id] ?? {
            status: "idle" as const,
            via: null,
            count: 0,
            lastSync: null,
          };
          const enabled = enabledSources.includes(source.id);

          return (
            <li
              key={source.id}
              className={cn(
                "flex items-center gap-2.5 rounded-sm border px-2 py-2 transition-colors",
                enabled
                  ? "border-cyber-border/70 bg-cyber-surface/70"
                  : "border-cyber-border/40 bg-cyber-surface/20 opacity-55",
              )}
            >
              <Checkbox
                id={`feed-${source.id}`}
                checked={enabled}
                onCheckedChange={() => onToggleSource(source.id)}
                aria-label={`Toggle ${source.name} feed`}
                className="border-slate-600 data-[state=checked]:border-cyber-teal data-[state=checked]:bg-cyber-teal/90 data-[state=checked]:text-cyber-bg"
              />
              <label
                htmlFor={`feed-${source.id}`}
                className="min-w-0 flex-1 cursor-pointer select-none"
              >
                <span className="block truncate text-[11px] font-semibold text-slate-200">
                  {source.name}
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
              <FeedStatusDot state={state} accentDot={source.accent.dot} />
            </li>
          );
        })}
      </ul>
    </section>
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
