"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AIVerdictPanel } from "@/components/cybershield/ai-verdict";
import { ArticleThumb } from "@/components/cybershield/article-card";
import { SEVERITY_STYLES, severityForDate, type CisaVuln } from "@/lib/cyber/cisa";
import type { FeedItem } from "@/lib/cyber/feeds";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";
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

type TabKey = "summary" | "ai" | "raw";

/**
 * The Investigation Drawer — 500px slide-out panel with backdrop blur.
 * Tab 1: Executive Summary. Tab 2: Raw Stream Telemetry (live JSON payload).
 */
export function InvestigationDrawer({ target, open, onClose }: InvestigationDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);

  // key remounts the body per target, resetting the active tab automatically
  const targetKey =
    target === null
      ? "none"
      : target.kind === "article"
        ? `article:${target.item.id}`
        : `vuln:${target.item.cveID}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* drawer content choreography — header, tabs and body land in sequence */
  useEffect(() => {
    if (!open || prefersReducedMotion()) return;
    const panel = panelRef.current;
    if (!panel) return;
    const nodes = panel.querySelectorAll<HTMLElement>("[data-drawer-stagger]");
    if (nodes.length === 0) return;
    const tl = gsap.timeline({ delay: 0.1 });
    tl.fromTo(
      nodes,
      { opacity: 0, x: 30 },
      { opacity: 1, x: 0, duration: 0.55, ease: "expo.out", stagger: 0.08, clearProps: "all" },
    );
    return () => {
      tl.kill();
    };
  }, [open, targetKey]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div aria-hidden={!open} className={cn(!open && "pointer-events-none")}>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/45 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Investigation drawer"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[500px] max-w-[94vw] flex-col border-l border-cyber-border bg-cyber-panel shadow-[-28px_0_70px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* header */}
        <header data-drawer-stagger className="flex shrink-0 items-center gap-2.5 border-b border-cyber-border bg-cyber-panel/90 px-5 py-4">
          {target?.kind === "vuln" ? (
            <Fingerprint className="h-4 w-4 shrink-0 text-cyber-crimson" />
          ) : (
            <FileSearch className="h-4 w-4 shrink-0 text-cyber-teal" />
          )}
          <h2 className="digital min-w-0 truncate text-[11.5px] font-bold tracking-[0.18em] text-hi">
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
            className="ml-auto rounded-lg border border-cyber-border bg-cyber-surface p-2 text-mid transition-colors hover:border-cyber-crimson/50 hover:text-cyber-crimson"
          >
            <X className="h-4 w-4" />
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
      <div data-drawer-stagger className="flex shrink-0 gap-1 overflow-x-auto border-b border-cyber-border bg-cyber-panel/40 px-3 pt-2.5 no-scrollbar">
        <TabButton
          active={tab === "summary"}
          onClick={() => setTab("summary")}
          icon={<ShieldCheck className="h-3 w-3" />}
          label="EXECUTIVE SUMMARY"
        />
        {target?.kind === "article" && (
          <TabButton
            active={tab === "ai"}
            onClick={() => setTab("ai")}
            icon={<Sparkles className="h-3 w-3" />}
            label="AI ANALYST VERDICT"
          />
        )}
        <TabButton
          active={tab === "raw"}
          onClick={() => setTab("raw")}
          icon={<Braces className="h-3 w-3" />}
          label="RAW TELEMETRY"
        />
      </div>

      <div data-drawer-stagger className="cyber-scroll min-h-0 flex-1 overflow-y-auto p-5">
        {target?.kind === "article" && (
          <ArticleSummary item={target.item} visible={tab === "summary"} />
        )}
        {target?.kind === "article" && tab === "ai" && <AIVerdictPanel item={target.item} />}
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
        "flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1.5 text-[10px] font-bold tracking-widest transition-colors",
        active
          ? "border-cyber-teal text-cyber-teal"
          : "border-transparent text-low hover:text-mid",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Tab 1: article executive summary ───────────────────────────── */

function ArticleSummary({ item, visible }: { item: FeedItem; visible: boolean }) {
  const paragraphs = useMemo(() => {
    const all = htmlToParagraphs(item.descriptionHtml);
    // drop syndication boilerplate tails (e.g. "The post … appeared first on …")
    const meaningful = all.filter(
      (paragraph) => !/appeared first on|^read more\b|all rights reserved/i.test(paragraph),
    );
    return meaningful.length > 0 ? meaningful : all;
  }, [item.descriptionHtml]);

  if (!visible) return null;
  return (
    <article className="space-y-3.5">
      <div className="overflow-hidden rounded-xl border border-cyber-border">
        <ArticleThumb item={item} className="h-48 w-full" glyphScale={1.6} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] tracking-wide">
        <span className={cn("rounded-md border px-1.5 py-0.5 font-bold uppercase", item.accent.chip)}>
          {item.sourceName}
        </span>
        <span className="text-mid">{item.author}</span>
        <span className="digital text-low">{item.pubDate}</span>
      </div>

      <h3 className="text-lg font-bold leading-snug text-hi">{item.title}</h3>

      {(item.intel.tags.length > 0 || item.intel.cves.length > 0 || item.intel.orgs.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.intel.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-cyber-violet/40 bg-cyber-violet/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-cyber-violet"
            >
              {tag}
            </span>
          ))}
          {item.intel.cves.map((cve) => (
            <span
              key={cve}
              className="digital rounded-md border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold text-cyber-crimson"
            >
              {cve}
            </span>
          ))}
          {item.intel.orgs.map((org) => (
            <span
              key={org}
              className="rounded-md border border-cyber-teal/30 bg-cyber-teal/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyber-teal"
            >
              {org}
            </span>
          ))}
          <span className="digital ml-auto text-[9px] tracking-widest text-low">
            {item.intel.readMinutes} MIN READ
          </span>
        </div>
      )}

      {item.intel.lede && (
        <p className="border-l-2 border-cyber-teal/60 pl-3 text-[13px] font-medium leading-relaxed text-hi">
          {item.intel.lede}
        </p>
      )}

      {paragraphs.length > 0 ? (
        <div className="space-y-2.5">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-[13px] leading-relaxed text-mid">
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[13px] italic leading-relaxed text-low">
          The live payload for this article did not include a readable description body.
        </p>
      )}

      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-lg border border-cyber-teal/60 bg-cyber-teal/10 px-4 py-3 text-[11.5px] font-bold tracking-widest text-cyber-teal transition-all hover:bg-cyber-teal/20 hover:shadow-[0_0_18px_rgba(var(--teal-rgb),0.22)]"
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
        <p className="text-[9.5px] tracking-[0.2em] text-low">CISA KEV CATALOG ENTRY</p>
        <h3 className="neon-crimson digital mt-1.5 text-[1.7rem] font-bold">{vuln.cveID}</h3>
        <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-hi">
          {vuln.vulnerabilityName}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-widest",
              SEVERITY_STYLES[severity.tone],
            )}
          >
            {severity.label} · {severity.daysSinceAdd}D SINCE ADD
          </span>
          {ransomware ? (
            <span className="flex items-center gap-1 rounded-md border border-cyber-crimson/50 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-cyber-crimson">
              <Skull className="h-3 w-3" /> CONFIRMED RANSOMWARE USE
            </span>
          ) : (
            <span className="rounded-md border border-cyber-border bg-cyber-surface px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-mid">
              NO KNOWN RANSOMWARE USE
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2.5">
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
        <p className="mt-1.5 text-[13px] leading-relaxed text-mid">{vuln.shortDescription}</p>
      </section>

      <section>
        <SectionTitle>REQUIRED ACTION</SectionTitle>
        <p className="mt-1.5 text-[13px] leading-relaxed text-mid">{vuln.requiredAction}</p>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href={nvdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyber-teal/60 bg-cyber-teal/10 px-4 py-3 text-[11px] font-bold tracking-widest text-cyber-teal transition-all hover:bg-cyber-teal/20 hover:shadow-[0_0_18px_rgba(var(--teal-rgb),0.22)]"
        >
          <ExternalLink className="h-4 w-4" />
          NVD ADVISORY
        </a>
        {typeof vuln.notes === "string" && /^https?:\/\//.test(vuln.notes) && (
          <a
            href={vuln.notes}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyber-border bg-cyber-surface px-4 py-3 text-[11px] font-bold tracking-widest text-mid transition-colors hover:border-cyber-teal/40 hover:text-cyber-teal"
          >
            <Flame className="h-4 w-4" />
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
    <div className="rounded-lg border border-cyber-border/70 bg-cyber-surface/70 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-low">
        {icon}
        {label}
      </dt>
      <dd
        className={cn("mt-1 truncate text-[11.5px] font-semibold text-hi", mono && "digital")}
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
      <span className="inline-block h-2.5 w-0.5 rounded-full bg-cyber-teal/70" />
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
          <span key={key++} className="text-low">
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
        <span key={key++} className="text-low">
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
    <div className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-bg">
      <div className="flex items-center justify-between border-b border-cyber-border bg-cyber-panel/70 px-3.5 py-2.5">
        <span className="digital text-[9.5px] font-bold tracking-widest text-low">
          UPSTREAM PAYLOAD · NORMALIZED TELEMETRY
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 rounded-lg border border-cyber-border bg-cyber-surface px-2.5 py-1.5 text-[9.5px] font-bold tracking-widest text-mid transition-colors hover:border-cyber-teal/50 hover:text-cyber-teal"
        >
          {copied ? <Check className="h-3 w-3 text-cyber-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre className="cyber-scroll max-h-[calc(100dvh-260px)] overflow-auto p-4 text-[11px] leading-relaxed">
        <code>{nodes}</code>
      </pre>
    </div>
  );
}
