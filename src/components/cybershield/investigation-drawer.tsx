"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Braces,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileSearch,
  Flame,
  Fingerprint,
  ShieldCheck,
  Skull,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ArticleThumb } from "@/components/cybershield/article-card";
import { SEVERITY_STYLES, severityForDate, type CisaVuln } from "@/lib/cyber/cisa";
import type { FeedItem } from "@/lib/cyber/feeds";
import { htmlToParagraphs } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

export type DrawerTarget =
  | { kind: "article"; item: FeedItem }
  | { kind: "vuln"; item: CisaVuln };

interface InvestigationDrawerProps {
  target: DrawerTarget | null;
  open: boolean;
  onClose: () => void;
}

type TabKey = "summary" | "raw";

/**
 * The Investigation Drawer — 500px slide-out panel with backdrop blur.
 * Tab 1: Executive Summary. Tab 2: Raw Stream Telemetry (live JSON payload).
 */
export function InvestigationDrawer({ target, open, onClose }: InvestigationDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // key remounts the body per target, resetting the active tab automatically
  const targetKey =
    target === null
      ? "none"
      : target.kind === "article"
        ? `article:${target.item.id}`
        : `vuln:${target.item.cveID}`;

  return (
    <div aria-hidden={!open} className={cn(!open && "pointer-events-none")}>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Investigation drawer"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[500px] max-w-[94vw] flex-col border-l border-cyber-teal/30 bg-[#0E1422] shadow-[-28px_0_70px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* header */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-cyber-border bg-cyber-panel/80 px-4 py-3">
          {target?.kind === "vuln" ? (
            <Fingerprint className="h-4 w-4 shrink-0 text-cyber-crimson" />
          ) : (
            <FileSearch className="h-4 w-4 shrink-0 text-cyber-teal" />
          )}
          <h2 className="digital min-w-0 truncate text-[11px] font-bold tracking-[0.18em] text-slate-200">
            {target === null
              ? "INVESTIGATION"
              : target.kind === "article"
                ? `ARTICLE INVESTIGATION ${target.item.sourceShort}`
                : "EXPLOIT DOSSIER CISA KEV"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close investigation drawer"
            className="ml-auto rounded-sm border border-cyber-border bg-cyber-surface p-1.5 text-slate-400 transition-colors hover:border-cyber-crimson/50 hover:text-cyber-crimson"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* tabs + body — remounted per target so the active tab resets */}
        <DrawerBody key={targetKey} target={target} />
      </aside>
    </div>
  );
}

function DrawerBody({ target }: { target: DrawerTarget | null }) {
  const [tab, setTab] = useState<TabKey>("summary");

  const rawPayload = useMemo(() => {
    if (!target) return null;
    return target.kind === "article" ? target.item.raw : target.item;
  }, [target]);

  return (
    <>
      <div className="flex shrink-0 gap-1 border-b border-cyber-border bg-cyber-panel/40 px-3 pt-2.5">
        <TabButton
          active={tab === "summary"}
          onClick={() => setTab("summary")}
          icon={<ShieldCheck className="h-3 w-3" />}
          label="EXECUTIVE SUMMARY"
        />
        <TabButton
          active={tab === "raw"}
          onClick={() => setTab("raw")}
          icon={<Braces className="h-3 w-3" />}
          label="RAW STREAM TELEMETRY"
        />
      </div>

      <div className="cyber-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {target?.kind === "article" && (
          <ArticleSummary item={target.item} visible={tab === "summary"} />
        )}
        {target?.kind === "vuln" && <VulnSummary vuln={target.item} visible={tab === "summary"} />}
        {tab === "raw" && rawPayload !== null && <JsonBlock data={rawPayload} />}
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex items-center gap-1.5 rounded-t-sm border-b-2 px-2.5 pb-2 pt-1 text-[9.5px] font-bold tracking-widest transition-colors",
        active
          ? "border-cyber-teal text-cyber-teal"
          : "border-transparent text-slate-500 hover:text-slate-300",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Tab 1: article executive summary ───────────────────────────── */

function ArticleSummary({ item, visible }: { item: FeedItem; visible: boolean }) {
  const paragraphs = useMemo(() => htmlToParagraphs(item.descriptionHtml), [item.descriptionHtml]);

  if (!visible) return null;
  return (
    <article className="space-y-3.5">
      <div className="overflow-hidden rounded-md border border-cyber-border">
        <ArticleThumb item={item} className="h-48 w-full" glyphScale={1.6} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[9px] tracking-wider">
        <span className={cn("rounded-sm border px-1.5 py-0.5 font-bold uppercase", item.accent.chip)}>
          {item.sourceName}
        </span>
        <span className="text-slate-500">{item.author}</span>
        <span className="digital text-slate-600">{item.pubDate}</span>
      </div>

      <h3 className="text-base font-bold leading-snug text-slate-100">{item.title}</h3>

      {paragraphs.length > 0 ? (
        <div className="space-y-2.5">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-[12px] leading-relaxed text-slate-300">
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[12px] italic leading-relaxed text-slate-500">
          The live payload for this article did not include a readable description body.
        </p>
      )}

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-sm border border-cyber-teal/60 bg-cyber-teal/10 px-4 py-2.5 text-[11px] font-bold tracking-widest text-cyber-teal transition-all hover:bg-cyber-teal/20 hover:shadow-[0_0_18px_rgba(0,229,255,0.25)]"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        NAVIGATE TO ORIGINAL SOURCE INTELLIGENCE
      </a>
    </article>
  );
}

/* ── Tab 1: KEV exploit dossier ─────────────────────────────────── */

function VulnSummary({ vuln, visible }: { vuln: CisaVuln; visible: boolean }) {
  if (!visible) return null;
  const severity = severityForDate(vuln.dateAdded);
  const ransomware = String(vuln.knownRansomwareCampaignUse ?? "").toLowerCase() === "known";
  const nvdUrl = `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`;

  return (
    <article className="space-y-4">
      <div>
        <p className="text-[9px] tracking-[0.2em] text-slate-500">CISA KEV CATALOG ENTRY</p>
        <h3 className="neon-crimson digital mt-1 text-2xl font-bold">{vuln.cveID}</h3>
        <p className="mt-1 text-[12.5px] font-semibold leading-snug text-slate-200">
          {vuln.vulnerabilityName}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 text-[8.5px] font-bold tracking-widest",
              SEVERITY_STYLES[severity.tone],
            )}
          >
            {severity.label} · {severity.daysSinceAdd}D SINCE ADD
          </span>
          {ransomware ? (
            <span className="flex items-center gap-1 rounded-sm border border-cyber-crimson/50 bg-cyber-crimson/10 px-1.5 py-0.5 text-[8.5px] font-bold tracking-widest text-cyber-crimson">
              <Skull className="h-3 w-3" /> CONFIRMED RANSOMWARE USE
            </span>
          ) : (
            <span className="rounded-sm border border-cyber-border bg-cyber-surface px-1.5 py-0.5 text-[8.5px] font-bold tracking-widest text-slate-500">
              NO KNOWN RANSOMWARE USE
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <DossierField label="VENDOR / PROJECT" value={vuln.vendorProject} />
        <DossierField label="PRODUCT" value={vuln.product} />
        <DossierField label="DATE ADDED" value={vuln.dateAdded} mono />
        <DossierField
          label="DUE DATE"
          value={vuln.dueDate ?? "—"}
          mono
          icon={<CalendarClock className="h-2.5 w-2.5" />}
        />
      </dl>

      <section>
        <SectionTitle>SHORT DESCRIPTION</SectionTitle>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{vuln.shortDescription}</p>
      </section>

      <section>
        <SectionTitle>REQUIRED ACTION</SectionTitle>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{vuln.requiredAction}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href={nvdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-cyber-teal/60 bg-cyber-teal/10 px-4 py-2.5 text-[10.5px] font-bold tracking-widest text-cyber-teal transition-all hover:bg-cyber-teal/20 hover:shadow-[0_0_18px_rgba(0,229,255,0.25)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          NVD ADVISORY
        </a>
        {typeof vuln.notes === "string" && /^https?:\/\//.test(vuln.notes) && (
          <a
            href={vuln.notes}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-sm border border-cyber-border bg-cyber-surface px-4 py-2.5 text-[10.5px] font-bold tracking-widest text-slate-300 transition-colors hover:border-cyber-teal/40 hover:text-cyber-teal"
          >
            <Flame className="h-3.5 w-3.5" />
            CISA REFERENCE
          </a>
        )}
      </div>
    </article>
  );
}

function DossierField({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-sm border border-cyber-border/70 bg-cyber-surface/70 px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[8px] font-bold tracking-widest text-slate-500">
        {icon}
        {label}
      </dt>
      <dd
        className={cn("mt-0.5 truncate text-[11px] font-semibold text-slate-200", mono && "digital")}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.2em] text-cyber-teal/80">
      <span className="inline-block h-2 w-0.5 bg-cyber-teal/70" />
      {children}
    </h4>
  );
}

/* ── Tab 2: raw JSON telemetry ──────────────────────────────────── */

/** Styled syntax-highlighted JSON viewer (no dangerouslySetInnerHTML). */
function JsonBlock({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const nodes = useMemo<ReactNode[]>(() => {
    let text: string;
    try {
      text = JSON.stringify(data, null, 2) ?? String(data);
    } catch {
      text = String(data);
    }
    // local regex instance — avoids shared module-level mutation
    const tokenRe =
      /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    const out: ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(text)) !== null) {
      if (match.index > lastIndex) {
        out.push(
          <span key={key++} className="text-slate-500">
            {text.slice(lastIndex, match.index)}
          </span>,
        );
      }
      if (match[1] !== undefined) {
        // object key (followed by a colon)
        out.push(
          <span key={key++} className="text-cyber-teal">
            {match[1]}
          </span>,
        );
      } else if (match[2] !== undefined) {
        out.push(
          <span key={key++} className="text-cyber-amber/90">
            {match[2]}
          </span>,
        );
      } else if (match[3] !== undefined) {
        out.push(
          <span key={key++} className="text-cyber-violet">
            {match[3]}
          </span>,
        );
      } else if (match[4] !== undefined) {
        out.push(
          <span key={key++} className="text-cyber-crimson/90">
            {match[4]}
          </span>,
        );
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      out.push(
        <span key={key++} className="text-slate-500">
          {text.slice(lastIndex)}
        </span>,
      );
    }
    return out;
  }, [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      toast.success("Raw telemetry payload copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this context");
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-cyber-border bg-[#0A0F1B]">
      <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-panel/70 px-3 py-2">
        <span className="digital text-[9px] font-bold tracking-widest text-slate-500">
          LIVE JSON PAYLOAD · AS RECEIVED
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded-sm border border-cyber-border bg-cyber-surface px-2 py-1 text-[9px] font-bold tracking-widest text-slate-400 transition-colors hover:border-cyber-teal/50 hover:text-cyber-teal"
        >
          {copied ? <Check className="h-3 w-3 text-cyber-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre className="cyber-scroll max-h-[calc(100dvh-260px)] overflow-auto p-3 text-[10.5px] leading-relaxed">
        <code>{nodes}</code>
      </pre>
    </div>
  );
}
