"use client";

import { Activity, Braces, Database, Radio, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SOURCES } from "@/lib/cyber/feeds";
import type { CisaMetrics } from "@/lib/cyber/cisa";
import { formatUtc, pad2 } from "@/lib/cyber/utils";

export interface AboutDiagnostics {
  totalSignals: number;
  onlineCount: number;
  lastSyncAt: number | null;
  nextSyncAt: number | null;
  metrics: CisaMetrics | null;
}

interface AboutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnostics: AboutDiagnostics;
}

/**
 * About / diagnostics modal — mission briefing plus a live telemetry
 * snapshot of both data pipelines.
 */
export function AboutModal({ open, onOpenChange, diagnostics }: AboutModalProps) {
  const { totalSignals, onlineCount, lastSyncAt, nextSyncAt, metrics } = diagnostics;
  const now = Date.now();
  const remainingMs = nextSyncAt ? Math.max(0, nextSyncAt - now) : null;
  const remainingMin = remainingMs !== null ? Math.floor(remainingMs / 60_000) : null;
  const remainingSec = remainingMs !== null ? Math.floor((remainingMs % 60_000) / 1000) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-cyber-border bg-cyber-surface p-5 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base font-bold tracking-[0.14em] text-slate-100">
            <ShieldCheck className="h-4 w-4 text-cyber-teal" />
            CYBER<span className="text-cyber-teal">SHIELD</span> NEWS
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-slate-400">
            A real-time threat intelligence ecosystem aggregating{" "}
            <span className="font-semibold text-slate-200">{SOURCES.length} cybersecurity research
            streams</span>{" "}
            and the official CISA Known Exploited Vulnerabilities catalog. Every metric on the
            dashboard is computed from live upstream payloads — no mock data, no API keys.
          </DialogDescription>
        </DialogHeader>

        {/* Pipelines */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <PipelineCard
            icon={<Radio className="h-3.5 w-3.5 text-cyber-teal" />}
            title="NEWS PIPELINE"
            lines={[
              `${SOURCES.length} open RSS research streams`,
              "Converter: public RSS→JSON gateway",
              "Failover: browser-direct → server relay",
            ]}
          />
          <PipelineCard
            icon={<Database className="h-3.5 w-3.5 text-cyber-crimson" />}
            title="VULN PIPELINE"
            lines={[
              "CISA KEV official JSON catalog",
              "Failover: direct → relay → live mirror",
              "Severity auto-derived from DATE ADDED",
            ]}
          />
        </div>

        {/* Live diagnostics */}
        <section aria-label="Live diagnostics" className="rounded-lg border border-cyber-border bg-cyber-panel p-3.5">
          <h3 className="digital mb-2.5 flex items-center gap-1.5 text-[9px] font-bold tracking-[0.2em] text-slate-400">
            <Activity className="h-3 w-3 text-cyber-teal" /> LIVE DIAGNOSTICS
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-[10.5px]">
            <DiagRow label="SIGNALS BUFFERED" value={totalSignals.toLocaleString("en-US")} />
            <DiagRow
              label="STREAMS ONLINE"
              value={`${onlineCount}/${SOURCES.length}`}
              highlight={onlineCount > 0 ? "text-cyber-green" : "text-cyber-crimson"}
            />
            <DiagRow
              label="KEV CATALOG"
              value={metrics ? `v${metrics.catalogVersion} · ${metrics.total.toLocaleString("en-US")}` : "SYNCING…"}
            />
            <DiagRow
              label="LAST SYNC"
              value={lastSyncAt ? formatUtc(lastSyncAt, false) : "—"}
            />
            <DiagRow
              label="NEXT AUTO-SYNC"
              value={remainingMin !== null && remainingSec !== null ? `T-${pad2(remainingMin)}:${pad2(remainingSec)}` : "12:00"}
              mono
            />
            <DiagRow label="SYNC TTL" value="12 MIN" mono />
          </dl>
        </section>

        <p className="digital flex items-center gap-1.5 text-[8.5px] leading-relaxed tracking-wider text-slate-600">
          <Braces className="h-3 w-3 shrink-0" />
          OPEN EVERY CARD → RAW STREAM TELEMETRY TAB SHOWS THE UNTOUCHED JSON PAYLOAD. MIT OPEN
          SOURCE.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PipelineCard({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-cyber-border bg-cyber-panel p-3">
      <h3 className="digital mb-1.5 flex items-center gap-1.5 text-[9px] font-bold tracking-[0.2em] text-slate-300">
        {icon}
        {title}
      </h3>
      <ul className="space-y-1 text-[10px] leading-relaxed text-slate-500">
        {lines.map((line) => (
          <li key={line} className="flex gap-1.5">
            <span className="text-cyber-teal/60">▸</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiagRow({
  label,
  value,
  mono = false,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: string;
}) {
  return (
    <div className="rounded-sm border border-cyber-border/70 bg-cyber-surface/70 px-2 py-1.5">
      <dt className="text-[8px] font-bold tracking-widest text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 truncate font-semibold text-slate-200 ${mono ? "digital" : ""} ${highlight ?? ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
