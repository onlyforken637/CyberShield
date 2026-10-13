"use client";

import { Activity, Braces, Database, GraduationCap, Radio, ShieldCheck, Sparkles } from "lucide-react";
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
 * About / diagnostics modal — mission briefing, the creator card and a
 * live telemetry snapshot of both data pipelines.
 */
export function AboutModal({ open, onOpenChange, diagnostics }: AboutModalProps) {
  const { totalSignals, onlineCount, lastSyncAt, nextSyncAt, metrics } = diagnostics;
  const now = Date.now();
  const remainingMs = nextSyncAt ? Math.max(0, nextSyncAt - now) : null;
  const remainingMin = remainingMs !== null ? Math.floor(remainingMs / 60_000) : null;
  const remainingSec = remainingMs !== null ? Math.floor((remainingMs % 60_000) / 1000) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-sheet max-h-[90vh] overflow-y-auto border-cyber-border p-5 sm:max-w-lg sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base font-bold tracking-[0.14em] text-hi">
            <ShieldCheck className="h-4.5 w-4.5 text-cyber-teal" />
            CYBER<span className="brand-gradient">SHIELD</span> NEWS
          </DialogTitle>
          <DialogDescription className="text-left text-[13px] leading-relaxed text-mid">
            A real-time threat intelligence ecosystem aggregating{" "}
            <span className="font-semibold text-hi">{SOURCES.length} cybersecurity research
            streams</span>{" "}
            and the official CISA Known Exploited Vulnerabilities catalog. Every metric on the
            dashboard is computed from live upstream payloads — no mock data, no API keys.
          </DialogDescription>
        </DialogHeader>

        {/* Creator */}
        <section
          aria-label="About the creator"
          className="relative overflow-hidden rounded-xl border border-cyber-teal/25 bg-gradient-to-br from-cyber-teal/10 via-transparent to-transparent p-4 sm:p-5"
        >
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyber-teal to-cyber-cyan font-display text-xl font-black text-cyber-bg shadow-[0_0_24px_rgba(var(--teal-rgb),0.35)]"
            >
              UJ
            </span>
            <div className="min-w-0">
              <p className="digital text-[9px] font-bold tracking-[0.24em] text-cyber-teal">
                <Sparkles className="mr-1 inline h-3 w-3" />
                CREATED &amp; BUILT BY
              </p>
              <h3 className="mt-1 font-display text-lg font-bold tracking-wide text-hi">
                Umair Jamal
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-mid">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-cyber-teal" /> Tech Enthusiast
                </span>
                <span className="text-low">·</span>
                <span>18 years old</span>
                <span className="text-low">·</span>
                <span className="inline-flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5 text-cyber-teal" /> 12th Grade Student
                </span>
              </p>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-mid">
                CyberShield was designed, engineered and shipped end-to-end by Umair — a young
                builder passionate about making real-time threat intelligence accessible to
                everyone, not just SOC teams.
              </p>
            </div>
          </div>
        </section>

        {/* Pipelines */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <section aria-label="Live diagnostics" className="rounded-xl border border-cyber-border bg-cyber-panel p-4">
          <h3 className="digital mb-3 flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.2em] text-mid">
            <Activity className="h-3.5 w-3.5 text-cyber-teal" /> LIVE DIAGNOSTICS
          </h3>
          <dl className="grid grid-cols-2 gap-2.5 text-[11px]">
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

        <p className="digital flex items-center gap-1.5 text-[9px] leading-relaxed tracking-wider text-low">
          <Braces className="h-3.5 w-3.5 shrink-0" />
          OPEN EVERY CARD → RAW STREAM TELEMETRY TAB SHOWS THE UNTOUCHED JSON PAYLOAD. MIT OPEN
          SOURCE.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PipelineCard({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-panel p-4">
      <h3 className="digital mb-2 flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.2em] text-hi">
        {icon}
        {title}
      </h3>
      <ul className="space-y-1.5 text-[11px] leading-relaxed text-mid">
        {lines.map((line) => (
          <li key={line} className="flex gap-1.5">
            <span className="text-cyber-teal/70">▸</span>
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
    <div className="rounded-lg border border-cyber-border/70 bg-cyber-surface/70 px-2.5 py-2">
      <dt className="text-[8.5px] font-bold tracking-widest text-low">{label}</dt>
      <dd
        className={`mt-1 truncate font-semibold text-hi ${mono ? "digital" : ""} ${highlight ?? ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
