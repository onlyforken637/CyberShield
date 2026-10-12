"use client";

import { useEffect, useMemo, useRef } from "react";
import { Filter, Gauge, Radio, Rss, Tags } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ExploitMatrixCard,
  KevMetricsCard,
  SeverityBreakdownCard,
  type KevPanelProps,
} from "@/components/cybershield/threat-panel";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";
import { SOURCES } from "@/lib/cyber/feeds";
import { KEYWORD_LEXICON } from "@/lib/cyber/keywords";
import type { CisaMetrics, CisaVuln } from "@/lib/cyber/cisa";
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
 * Sidebar analytics column — Threat Condition, Live Metrics, Threat
 * Severity, Exploitation Matrix, Topic Cloud and the Active Sources
 * tracker, spaced on an 8pt grid for comfortable scanning.
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
    <div className="space-y-6">
      <ThreatConditionCard items={items} metrics={metrics} />
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

/* ── Threat Condition gauge ──────────────────────────────────────── */

interface ThreatLevel {
  label: string;
  color: string;
  glow: string;
  bar: string;
}

const THREAT_LEVELS: Array<{ min: number } & ThreatLevel> = [
  { min: 78, label: "CRITICAL", color: "text-cyber-crimson", glow: "neon-crimson", bar: "#ff4d5e" },
  { min: 58, label: "SEVERE", color: "text-cyber-orange", glow: "neon-amber", bar: "#fb923c" },
  { min: 38, label: "ELEVATED", color: "text-cyber-amber", glow: "neon-amber", bar: "#f59e0b" },
  { min: 0, label: "GUARDED", color: "text-cyber-green", glow: "neon-green", bar: "#34d399" },
];

const ARC_LENGTH = Math.PI * 50; // semicircle arc, r = 50

/**
 * Global Threat Condition — computed LIVE from the stream (24h average
 * article severity, critical share) plus the CISA KEV catalog pressure.
 */
function ThreatConditionCard({
  items,
  metrics,
}: {
  items: FeedItem[];
  metrics: CisaMetrics | null;
}) {
  const condition = useMemo(() => {
    // the full live stream currently on screen drives the condition
    const pool = items;

    const avgSeverity =
      pool.length > 0
        ? pool.reduce((sum, item) => sum + item.intel.severity.score, 0) / pool.length
        : 0;
    const criticalShare =
      pool.length > 0
        ? (pool.filter((item) => item.intel.severity.label === "CRITICAL").length / pool.length) * 100
        : 0;
    // the sharpest edge of the current stream matters as much as the average
    const topSeverity =
      pool.length > 0
        ? [...pool]
            .sort((a, b) => b.intel.severity.score - a.intel.severity.score)
            .slice(0, 3)
            .reduce((sum, item) => sum + item.intel.severity.score, 0) / Math.min(3, pool.length)
        : 0;
    const kevPressure = metrics
      ? Math.min(
          100,
          (metrics.severity.critical / Math.max(1, metrics.total)) * 400 + metrics.addedLast30Days * 1.2,
        )
      : 0;

    const score = Math.round(
      Math.min(
        100,
        avgSeverity * 0.3 + topSeverity * 0.3 + criticalShare * 0.2 + kevPressure * 0.2,
      ),
    );
    const level = THREAT_LEVELS.find((entry) => score >= entry.min) ?? THREAT_LEVELS[THREAT_LEVELS.length - 1]!;

    return { score, level, avgSeverity, criticalShare, kevPressure };
  }, [items, metrics]);

  const needleAngle = -90 + (condition.score / 100) * 180;
  const needleRef = useRef<SVGLineElement>(null);

  // GSAP elastic swing whenever the live score moves
  useEffect(() => {
    const needle = needleRef.current;
    if (!needle) return;
    if (prefersReducedMotion()) {
      needle.style.transform = `rotate(${needleAngle}deg)`;
      return;
    }
    const tween = gsap.to(needle, {
      rotation: needleAngle,
      svgOrigin: "60 60",
      duration: 1.7,
      ease: "elastic.out(1, 0.55)",
    });
    return () => {
      tween.kill();
    };
  }, [needleAngle]);

  return (
    <section data-reveal className="card-surface" aria-label="Global threat condition">
      <header className="flex items-center justify-between gap-2 px-5 pt-5">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-hi">
          <Gauge className="h-4 w-4 text-cyber-teal" />
          Threat Condition
        </h2>
        <span className="digital text-[9px] tracking-widest text-low">LIVE COMPUTED</span>
      </header>

      <div className="relative mx-auto mt-2 w-full max-w-[230px] px-5">
        <svg viewBox="0 0 120 68" className="w-full" role="img" aria-label={`Threat condition ${condition.level.label}, score ${condition.score} of 100`}>
          {/* track */}
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            className="stroke-cyber-raised"
            strokeWidth="9"
            strokeLinecap="round"
          />
          {/* progress */}
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke={condition.level.bar}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={ARC_LENGTH * (1 - condition.score / 100)}
            style={{ filter: "drop-shadow(0 0 6px rgba(var(--teal-rgb), 0.35))" }}
          />
          {/* needle */}
          <line
            ref={needleRef}
            x1="60"
            y1="60"
            x2="60"
            y2="22"
            className="stroke-hi"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="60" cy="60" r="4.5" className="fill-hi" />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
          <span className={cn("font-display text-lg font-black tracking-widest", condition.level.glow)}>
            {condition.level.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-cyber-border/60 px-5 py-4">
        <MiniStat label="STREAM SEV" value={`${Math.round(condition.avgSeverity)}`} />
        <MiniStat label="CRIT SHARE" value={`${Math.round(condition.criticalShare)}%`} />
        <MiniStat label="KEV PRESS" value={`${Math.round(condition.kevPressure)}`} />
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="digital text-base font-black text-hi">{value}</div>
      <div className="digital mt-0.5 text-[8.5px] tracking-widest text-low">{label}</div>
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
    <section data-reveal className="card-surface p-5" aria-label="Topic intercept cloud">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-hi">
          <Tags className="h-4 w-4 text-cyber-teal" />
          Topic Cloud
        </h2>
        {activeTopics.length > 0 && (
          <button
            type="button"
            onClick={onClearTopics}
            className="rounded-md px-2 py-1 text-[10px] font-semibold tracking-wider text-low transition-colors hover:bg-cyber-raised hover:text-cyber-teal"
          >
            Clear
          </button>
        )}
      </header>

      {topicCounts.length === 0 ? (
        <p className="py-4 text-center text-[11px] tracking-wider text-low">
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
                  "rounded-md border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all duration-150",
                  selected
                    ? "border-cyber-teal bg-cyber-teal/15 text-cyber-teal shadow-[0_0_12px_rgba(var(--teal-rgb),0.22)]"
                    : "border-cyber-border bg-cyber-raised/50 text-mid hover:border-cyber-teal/50 hover:text-hi",
                )}
              >
                {topic}
                <span
                  className={cn(
                    "digital ml-1.5 text-[9px]",
                    selected ? "text-cyber-teal/80" : "text-low",
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
        <p className="mt-3 flex items-center gap-1.5 border-t border-cyber-border/60 pt-3 text-[10px] tracking-wider text-low">
          <Filter className="h-3.5 w-3.5 text-cyber-teal" />
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
    <section data-reveal className="card-surface p-5" aria-label="Active sources tracker">
      <header className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-hi">
          <Rss className="h-4 w-4 text-cyber-teal" />
          Active Sources
        </h2>
        <span className="digital text-[9.5px] font-bold tracking-widest text-cyber-green">
          {online}/{SOURCES.length} ONLINE
        </span>
      </header>
      <p className="mb-3 text-[10px] tracking-wide text-low">
        UNCHECK A SOURCE TO EXCLUDE IT FROM THE STREAM
      </p>

      <ul className="cyber-scroll max-h-80 space-y-1.5 overflow-y-auto pr-1">
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
                "flex items-center gap-3 rounded-lg border px-2.5 py-2.5 transition-colors",
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
                className="border-low data-[state=checked]:border-cyber-teal data-[state=checked]:bg-cyber-teal data-[state=checked]:text-cyber-bg"
              />
              <label
                htmlFor={`feed-${source.id}`}
                className="min-w-0 flex-1 cursor-pointer select-none"
              >
                <span className="block truncate text-[12px] font-semibold text-hi">
                  {source.name}
                </span>
                <span className="digital block text-[9px] tracking-wider text-low">
                  {state.count} SIGNAL{state.count === 1 ? "" : "S"}
                  {state.via && (
                    <span
                      className={cn(
                        "ml-1.5 font-bold",
                        state.via === "xml" ? "text-cyber-teal" : "text-cyber-amber",
                      )}
                    >
                      · {state.via === "xml" ? "XML" : "CONV"}
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
      ? "bg-cyber-green shadow-[0_0_8px_rgba(52,211,153,0.8)]"
      : state.status === "offline"
        ? "bg-cyber-crimson shadow-[0_0_8px_rgba(255,77,94,0.8)]"
        : state.status === "empty"
          ? "bg-cyber-amber shadow-[0_0_8px_rgba(245,158,11,0.8)]"
          : "bg-cyber-teal blink-soft";

  return (
    <span className="flex items-center gap-1.5" title={`feed status: ${state.status}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", accentDot ?? "bg-low", "opacity-50")} />
      <span
        className={cn("h-2 w-2 rounded-full transition-colors", tone)}
        aria-label={state.status}
      />
    </span>
  );
}
