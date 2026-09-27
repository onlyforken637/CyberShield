"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Clock3, ImageOff, Zap } from "lucide-react";
import { MatrixThumb } from "@/components/cybershield/matrix-thumb";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";
import type { ArticleIntel, FeedItem, IntelSeverityLabel } from "@/lib/cyber/feeds";
import { timeAgo } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

/**
 * Live article thumbnail — routed through our own /api/img relay so
 * hotlink-protected CDNs can't blank it. Degrades silently to the
 * generated matrix-code placeholder when the upstream has no media.
 */
export function ArticleThumb({
  item,
  className,
  glyphScale = 1,
}: {
  item: FeedItem;
  className?: string;
  glyphScale?: number;
}) {
  const [failed, setFailed] = useState(false);
  const proxied = item.imageUrl
    ? `/api/img?u=${encodeURIComponent(item.imageUrl)}`
    : null;

  if (!proxied || failed) {
    return (
      <div className={cn("relative", className)}>
        <MatrixThumb seed={item.id} className={cn("h-full w-full", className)} glyphScale={glyphScale} />
        <span
          className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-sm bg-cyber-bg/80 px-1 py-0.5 text-[7.5px] font-bold tracking-widest text-slate-500"
          title="No media in feed payload — generated matrix placeholder"
        >
          <ImageOff className="h-2 w-2" /> SYNTH
        </span>
      </div>
    );
  }

  return (
    <img
      src={proxied}
      alt={`Thumbnail for: ${item.title}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
      draggable={false}
    />
  );
}

/* ── severity visual language ─────────────────────────────────────── */

const SEVERITY_TONE: Record<
  IntelSeverityLabel,
  { edge: string; dot: string; bar: string; text: string; chip: string }
> = {
  CRITICAL: {
    edge: "border-l-cyber-crimson",
    dot: "bg-cyber-crimson shadow-[0_0_8px_rgba(255,59,48,0.9)]",
    bar: "bg-cyber-crimson",
    text: "text-cyber-crimson",
    chip: "border-cyber-crimson/50 bg-cyber-crimson/10 text-cyber-crimson",
  },
  HIGH: {
    edge: "border-l-cyber-orange",
    dot: "bg-cyber-orange shadow-[0_0_8px_rgba(255,138,61,0.9)]",
    bar: "bg-cyber-orange",
    text: "text-cyber-orange",
    chip: "border-cyber-orange/50 bg-cyber-orange/10 text-cyber-orange",
  },
  ELEVATED: {
    edge: "border-l-cyber-amber",
    dot: "bg-cyber-amber shadow-[0_0_8px_rgba(255,179,0,0.9)]",
    bar: "bg-cyber-amber",
    text: "text-cyber-amber",
    chip: "border-cyber-amber/50 bg-cyber-amber/10 text-cyber-amber",
  },
  MODERATE: {
    edge: "border-l-cyber-teal/60",
    dot: "bg-cyber-teal shadow-[0_0_8px_rgba(0,229,255,0.9)]",
    bar: "bg-cyber-teal",
    text: "text-cyber-teal",
    chip: "border-cyber-teal/40 bg-cyber-teal/10 text-cyber-teal",
  },
};

function severityTone(intel: ArticleIntel) {
  return SEVERITY_TONE[intel.severity.label];
}

/* ── card ─────────────────────────────────────────────────────────── */

interface ArticleCardProps {
  item: FeedItem;
  selected: boolean;
  onOpen: (item: FeedItem) => void;
  /** staggered entrance delay in ms (list position) */
  entranceDelay?: number;
}

/**
 * Column B news card — proxied thumbnail, severity edge, source badge,
 * tag chips, interactive headline and a structured analyst brief
 * (punchy lede, intel highlights, CVE / org chips, read time, severity
 * meter) instead of a flat gray excerpt.
 */
export function ArticleCard({ item, selected, onOpen, entranceDelay = 0 }: ArticleCardProps) {
  const intel = item.intel;
  const tone = severityTone(intel);
  const hot = intel.severity.label === "CRITICAL" || intel.severity.label === "HIGH";
  const cardRef = useRef<HTMLElement>(null);

  /* exhibition-grade hover: cursor-tracked spotlight + subtle GSAP 3D tilt */
  useEffect(() => {
    const el = cardRef.current;
    if (!el || prefersReducedMotion()) return;
    gsap.set(el, { transformPerspective: 950 });
    const rx = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power3.out" });
    const ry = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power3.out" });
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      ry((px - 0.5) * 3.6);
      rx((0.5 - py) * 2.8);
    };
    const onLeave = () => {
      rx(0);
      ry(0);
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
    };
  }, []);

  return (
    <article
      ref={cardRef}
      style={entranceDelay > 0 ? { animationDelay: `${entranceDelay}ms` } : undefined}
      className={cn(
        "signal-sweep card-in spotlight-card group relative rounded-md border border-l-2 bg-cyber-surface/75 transition-[border-color,box-shadow,background-color] duration-200",
        tone.edge,
        selected
          ? "border-cyber-teal/70 shadow-[0_0_18px_rgba(0,229,255,0.12)]"
          : "border-cyber-border/80 hover:border-cyber-teal/45 hover:bg-cyber-surface",
      )}
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="relative h-[74px] w-[112px] shrink-0 overflow-hidden rounded-sm border border-cyber-border/70 sm:h-[92px] sm:w-[148px]"
          aria-label={`Open investigation: ${item.title}`}
          tabIndex={-1}
        >
          <ArticleThumb
            item={item}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {hot && (
            <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-sm bg-black/65 px-1 py-0.5 text-[7px] font-black tracking-widest text-cyber-crimson backdrop-blur-sm">
              <Zap className="h-2 w-2" /> {intel.severity.label}
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] tracking-wider">
            <span
              className={cn("rounded-sm border px-1.5 py-0.5 text-[8.5px] font-bold uppercase", item.accent.chip)}
            >
              {item.sourceName}
            </span>
            {intel.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-cyber-violet/40 bg-cyber-violet/10 px-1 py-0.5 text-[8px] font-bold tracking-widest text-cyber-violet"
              >
                {tag}
              </span>
            ))}
            <span className="max-w-[130px] truncate text-slate-500" title={item.author}>
              {item.author}
            </span>
            <span className="digital flex items-center gap-1 text-slate-500">
              <Clock3 className="h-2.5 w-2.5" />
              <span suppressHydrationWarning>{timeAgo(item.publishedAt)}</span>
            </span>
          </div>

          <h3 className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(item)}
              title={item.title}
              className="block w-full text-left text-[12.5px] font-bold leading-snug text-slate-100 transition-colors group-hover:text-cyber-teal line-clamp-2"
            >
              {item.title}
            </button>
          </h3>

          {/* analyst lede — the punch line of the story */}
          {intel.lede && (
            <p className="mt-1.5 border-l-2 border-cyber-teal/60 pl-2 text-[11px] font-medium leading-relaxed text-slate-300 line-clamp-2">
              {intel.lede}
            </p>
          )}

          {/* distilled intel highlights */}
          {intel.highlights.length > 0 && (
            <ul className="mt-1.5 hidden space-y-0.5 sm:block">
              {intel.highlights.slice(0, 2).map((highlight, index) => (
                <li
                  key={index}
                  className="flex items-start gap-1.5 text-[10px] leading-snug text-slate-500"
                >
                  <span className="mt-[3px] shrink-0 text-[8px] text-cyber-amber" aria-hidden="true">
                    ▸
                  </span>
                  <span className="line-clamp-1">{highlight}</span>
                </li>
              ))}
            </ul>
          )}

          {/* entity chips + severity meter */}
          <div className="mt-auto hidden flex-wrap items-center gap-1.5 pt-1.5 sm:flex">
            {intel.cves.slice(0, 2).map((cve) => (
              <span
                key={cve}
                className="digital rounded-sm border border-cyber-crimson/40 bg-cyber-crimson/10 px-1 py-0.5 text-[8px] font-bold text-cyber-crimson/90"
              >
                {cve}
              </span>
            ))}
            {intel.orgs.slice(0, 2).map((org) => (
              <span
                key={org}
                className="rounded-sm border border-cyber-violet/30 bg-cyber-violet/5 px-1 py-0.5 text-[8px] font-semibold text-cyber-violet/90"
              >
                {org}
              </span>
            ))}

            <span className="ml-auto flex items-center gap-1.5">
              <span className="digital text-[8px] tracking-wider text-slate-600">
                {intel.readMinutes} MIN READ
              </span>
              <span className={cn("digital text-[8px] font-black tracking-widest", tone.text)}>
                {intel.severity.label}
              </span>
              <span className="h-1 w-10 overflow-hidden rounded-full bg-cyber-border" aria-hidden="true">
                <span
                  className={cn("block h-full rounded-full", tone.bar)}
                  style={{ width: `${Math.max(8, intel.severity.score)}%` }}
                />
              </span>
            </span>

            <span className="flex items-center gap-0.5 text-[8.5px] font-bold tracking-widest text-cyber-teal/0 transition-colors group-hover:text-cyber-teal/90">
              OPEN INVESTIGATION <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
