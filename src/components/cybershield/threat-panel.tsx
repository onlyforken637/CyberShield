"use client";

import { useEffect, useRef } from "react";
import {
  Activity,
  Bug,
  Crosshair,
  Database,
  Flame,
  Skull,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import {
  SEVERITY_STYLES,
  severityForDate,
  type CisaMetrics,
  type CisaVuln,
  type CisaVia,
} from "@/lib/cyber/cisa";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";
import { cn } from "@/lib/utils";

/** Animated digital readout — GSAP tweens the count to the live value. */
export function NeonNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (v: number) => {
      current.current = v;
      el.textContent = Math.round(v).toLocaleString("en-US");
    };
    if (prefersReducedMotion()) {
      write(value);
      return;
    }
    const proxy = { v: current.current };
    const tween = gsap.to(proxy, {
      v: value,
      duration: 1.15,
      ease: "power3.out",
      onUpdate: () => write(proxy.v),
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return <span ref={ref} className={cn("digital tabular-nums", className)}>0</span>;
}

export interface KevPanelProps {
  metrics: CisaMetrics | null;
  via: CisaVia | null;
  syncing: boolean;
  error: string | null;
  lastSyncAt: number | null;
  onRetry: () => void;
}

function ViaChip({ via }: { via: CisaVia | null }) {
  if (!via) return null;
  const map: Record<CisaVia, { label: string; cls: string }> = {
    direct: { label: "DIRECT · CISA.GOV", cls: "border-cyber-teal/40 bg-cyber-teal/10 text-cyber-teal" },
    relay: { label: "RELAY · CISA.GOV", cls: "border-cyber-amber/40 bg-cyber-amber/10 text-cyber-amber" },
    mirror: { label: "MIRROR · OFFICIAL SYNC", cls: "border-cyber-violet/40 bg-cyber-violet/10 text-cyber-violet" },
  };
  const chip = map[via];
  return (
    <span className={cn("rounded-sm border px-1.5 py-0.5 text-[8px] font-bold tracking-widest", chip.cls)}>
      {chip.label}
    </span>
  );
}

export function KevUnavailable({
  error,
  syncing,
  lastSyncAt,
  onRetry,
  compact = false,
}: Omit<KevPanelProps, "metrics" | "via"> & { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-10")}>
      {syncing ? (
        <>
          <Activity className="mb-2 h-5 w-5 animate-pulse text-cyber-teal" />
          <p className="digital text-[10px] tracking-widest text-cyber-teal/80">
            ACQUIRING KEV CATALOG…
          </p>
        </>
      ) : (
        <>
          <WifiOff className="mb-2 h-5 w-5 text-cyber-crimson" />
          <p className="digital text-[10px] font-bold tracking-widest text-cyber-crimson">
            KEV UPLINK BLOCKED
          </p>
          <p className="mt-1 max-w-[280px] text-[9px] leading-relaxed tracking-wide text-slate-600">
            {error ?? "The official CISA catalog is unreachable from this network."} The dashboard
            will retry on the next sync cycle.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-sm border border-cyber-amber/50 bg-cyber-amber/10 px-3 py-1.5 text-[9.5px] font-bold tracking-widest text-cyber-amber transition-colors hover:bg-cyber-amber/20"
          >
            RETRY UPLINK
          </button>
          {lastSyncAt && (
            <p className="digital mt-2 text-[8px] text-slate-700">LAST ATTEMPT OK: SEE HEADER LOG</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Live Metrics card — every counter is computed from the real-time
 * CISA KEV `vulnerabilities` array.
 */
export function KevMetricsCard({ metrics, via, syncing, error, lastSyncAt, onRetry }: KevPanelProps) {
  return (
    <section
      data-reveal
      className="signal-sweep rounded-2xl border border-cyber-border bg-cyber-panel/85 p-4 shadow-lg backdrop-blur-md"
      aria-label="Live CISA KEV metrics"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <Database className="h-3.5 w-3.5 text-cyber-teal" />
          Live Metrics
        </h2>
        <span className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-cyber-teal">
          <span className="cyber-ping relative inline-flex h-1.5 w-1.5 text-cyber-teal">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyber-teal" />
          </span>
          STREAM ACTIVE
        </span>
      </header>

      {metrics ? (
        <>
          <p className="text-[9px] tracking-[0.2em] text-slate-500">
            CATALOGED KNOWN EXPLOITED VULNERABILITIES
          </p>
          <NeonNumber
            value={metrics.total}
            className="neon-teal mt-1 block text-[42px] font-bold leading-none"
          />

          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <MetricTile
              icon={<Activity className="h-3 w-3" />}
              label={`ADDED ${new Date().getUTCFullYear()}`}
              value={metrics.addedThisYear}
              valueClass="neon-amber"
            />
            <MetricTile
              icon={<Flame className="h-3 w-3" />}
              label="RANSOM-LINKED"
              value={metrics.ransomwareLinked}
              valueClass="neon-crimson"
            />
            <MetricTile
              icon={<TriangleAlert className="h-3 w-3" />}
              label="LAST 30 DAYS"
              value={metrics.addedLast30Days}
              valueClass="neon-teal"
            />
            <MetricTile
              icon={<Skull className="h-3 w-3" />}
              label="CRITICAL ≤30D"
              value={metrics.severity.critical}
              valueClass="neon-crimson"
            />
          </div>

          {/* ransomware share bar */}
          <div className="mt-3">
            <div className="digital mb-1 flex items-center justify-between text-[8.5px] tracking-widest text-slate-500">
              <span>RANSOMWARE-CAMPAIGN SHARE</span>
              <span className="text-cyber-crimson/90">
                {metrics.ransomwareSharePct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyber-border/60">
              <div
                className="h-full rounded-full bg-cyber-crimson/80 shadow-[0_0_10px_rgba(255,59,48,0.6)] transition-all duration-700"
                style={{ width: `${Math.min(100, metrics.ransomwareSharePct)}%` }}
              />
            </div>
          </div>

          <p className="digital mt-3 border-t border-cyber-border/60 pt-2 text-[8.5px] tracking-wider text-slate-600">
            CATALOG v{metrics.catalogVersion}
            {metrics.dateReleased ? ` · RELEASED ${metrics.dateReleased.slice(0, 10)}` : ""}
          </p>
        </>
      ) : (
        <KevUnavailable error={error} syncing={syncing} lastSyncAt={lastSyncAt} onRetry={onRetry} />
      )}
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="rounded-sm border border-cyber-border/70 bg-cyber-surface/80 px-2 py-2">
      <p className="flex items-center gap-1 text-[8px] font-bold tracking-wider text-slate-500">
        {icon}
        {label}
      </p>
      <NeonNumber value={value} className={cn("mt-0.5 block text-lg font-bold leading-tight", valueClass)} />
    </div>
  );
}

/**
 * Threat Severity card — recency-bucketed breakdown of the whole live
 * KEV catalog (CRITICAL ≤30d / HIGH ≤180d / WATCH >180d).
 */
export function SeverityBreakdownCard({ metrics, syncing }: { metrics: CisaMetrics | null; syncing: boolean }) {
  const buckets = metrics
    ? [
        {
          label: "CRITICAL",
          hint: "ADDED ≤30 DAYS",
          count: metrics.severity.critical,
          bar: "bg-cyber-crimson shadow-[0_0_10px_rgba(255,59,48,0.55)]",
          text: "text-cyber-crimson",
        },
        {
          label: "HIGH",
          hint: "ADDED ≤180 DAYS",
          count: metrics.severity.high,
          bar: "bg-cyber-amber shadow-[0_0_10px_rgba(255,179,0,0.55)]",
          text: "text-cyber-amber",
        },
        {
          label: "WATCH",
          hint: "OLDER ENTRIES",
          count: metrics.severity.watch,
          bar: "bg-cyber-teal shadow-[0_0_10px_rgba(0,229,255,0.55)]",
          text: "text-cyber-teal",
        },
      ]
    : [];

  return (
    <section
      data-reveal
      className="rounded-2xl border border-cyber-border bg-cyber-panel/85 p-4 shadow-lg backdrop-blur-md"
      aria-label="Threat severity breakdown"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          Threat Severity
        </h2>
        {metrics && (
          <span className="digital text-[8.5px] tracking-widest text-slate-500">
            {metrics.total.toLocaleString("en-US")} TOTAL ENTRIES
          </span>
        )}
      </header>

      {metrics ? (
        <div className="space-y-3">
          {buckets.map((bucket) => {
            const share = metrics.total > 0 ? (bucket.count / metrics.total) * 100 : 0;
            return (
              <div key={bucket.label}>
                <div className="mb-1 flex items-center justify-between text-[9.5px]">
                  <span className={cn("font-bold tracking-widest", bucket.text)}>{bucket.label}</span>
                  <span className="digital text-slate-400">
                    {bucket.count.toLocaleString("en-US")} · {share.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyber-border/60">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700", bucket.bar)}
                    style={{ width: `${Math.max(1.5, share)}%` }}
                  />
                </div>
                <p className="digital mt-0.5 text-[7.5px] tracking-widest text-slate-600">{bucket.hint}</p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="digital flex items-center gap-2 py-6 text-center text-[9.5px] tracking-widest text-slate-600">
          {syncing ? "BUCKETING LIVE CATALOG…" : "SEVERITY GRID OFFLINE — RETRYING NEXT CYCLE"}
        </p>
      )}
    </section>
  );
}

/** Active Exploitation Matrix — latest KEV entries with auto severity badges. */
export function ExploitMatrixCard({
  metrics,
  syncing,
  error,
  lastSyncAt,
  onRetry,
  onOpenVuln,
}: KevPanelProps & {
  onOpenVuln: (vuln: CisaVuln) => void;
}) {
  return (
    <section
      data-reveal
      className="rounded-2xl border border-cyber-border bg-cyber-panel/85 p-4 shadow-lg backdrop-blur-md"
      aria-label="Active exploitation matrix"
    >
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
          <Crosshair className="h-3.5 w-3.5 text-cyber-crimson" />
          Exploitation Matrix
        </h2>
        <span className="digital rounded-sm border border-cyber-border bg-cyber-surface px-1.5 py-0.5 text-[8.5px] tracking-widest text-slate-500">
          LATEST 5
        </span>
      </header>

      {metrics ? (
        <div className="cyber-scroll max-h-96 overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-cyber-border text-[8.5px] tracking-widest text-slate-500">
                <th className="py-1.5 pr-1.5 font-bold">CVE ID</th>
                <th className="py-1.5 pr-1.5 font-bold">VENDOR</th>
                <th className="hidden py-1.5 pr-1.5 font-bold xl:table-cell">VULNERABILITY</th>
                <th className="py-1.5 text-right font-bold">SEVERITY</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recent.map((vuln) => {
                const severity = severityForDate(vuln.dateAdded);
                return (
                  <tr
                    key={vuln.cveID}
                    onClick={() => onOpenVuln(vuln)}
                    className="group cursor-pointer border-b border-cyber-border/40 transition-colors last:border-0 hover:bg-cyber-raised/70"
                    title={`Open exploit dossier: ${vuln.cveID}`}
                  >
                    <td className="py-2 pr-1.5 align-top">
                      <span className="digital text-[10px] font-bold text-cyber-teal group-hover:underline">
                        {vuln.cveID}
                      </span>
                      <span className="digital block text-[8px] text-slate-600">
                        {vuln.dateAdded}
                      </span>
                    </td>
                    <td className="py-2 pr-1.5 align-top">
                      <span className="block max-w-[110px] truncate text-[10px] font-semibold text-slate-200" title={vuln.vendorProject}>
                        {vuln.vendorProject}
                      </span>
                      <span className="block max-w-[110px] truncate text-[8.5px] text-slate-500" title={vuln.product}>
                        {vuln.product}
                      </span>
                    </td>
                    <td className="hidden max-w-[130px] py-2 pr-1.5 align-top xl:table-cell">
                      <span className="block text-[9.5px] leading-snug text-slate-400 line-clamp-2" title={vuln.vulnerabilityName}>
                        {vuln.vulnerabilityName}
                      </span>
                    </td>
                    <td className="py-2 text-right align-top">
                      <span
                        className={cn(
                          "inline-block rounded-sm border px-1.5 py-0.5 text-[8px] font-bold tracking-widest",
                          SEVERITY_STYLES[severity.tone],
                        )}
                      >
                        {severity.label}
                      </span>
                      {vuln.knownRansomwareCampaignUse?.toLowerCase() === "known" && (
                        <Skull
                          className="ml-1 inline h-3 w-3 text-cyber-crimson"
                          aria-label="Known ransomware campaign use"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 flex items-center gap-1 text-[8.5px] tracking-wider text-slate-600">
            <Bug className="h-3 w-3" />
            SEVERITY AUTO-DERIVED FROM `DATE ADDED` RECENCY · CLICK ROW FOR DOSSIER
          </p>
        </div>
      ) : (
        <KevUnavailable error={error} syncing={syncing} lastSyncAt={lastSyncAt} onRetry={onRetry} compact />
      )}
    </section>
  );
}
