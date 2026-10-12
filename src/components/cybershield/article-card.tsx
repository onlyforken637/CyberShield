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
 * hotlink-protected CDNs can't blank it. Resolution chain:
 *   1. feed-provided image, proxied (`?u=`)
 *   2. lazy og:image scraped off the article page (`?r=`) — covers items
 *      whose feed shipped no media and missed the sync-cycle enrichment
 *   3. generated matrix-code placeholder — always something on screen
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
  const [proxyFailed, setProxyFailed] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

  const proxySrc = item.imageUrl
    ? `/api/img?u=${encodeURIComponent(item.imageUrl)}`
    : null;
  const resolveSrc = /^https?:\/\//i.test(item.link)
    ? `/api/img?r=${encodeURIComponent(item.link)}`
    : null;

  const showProxy = Boolean(proxySrc) && !proxyFailed;
  const showResolve = !showProxy && Boolean(resolveSrc) && !resolveFailed;

  if (!showProxy && !showResolve) {
    return (
      <div className={cn("relative", className)}>
        <MatrixThumb seed={item.id} className={cn("h-full w-full", className)} glyphScale={glyphScale} />
        <span
          className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-cyber-bg/80 px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-mid"
          title="No media available — generated matrix placeholder"
        >
          <ImageOff className="h-2.5 w-2.5" /> SYNTH
        </span>
      </div>
    );
  }

  if (showProxy) {
    return (
      <img
        src={proxySrc!}
        alt={`Thumbnail for: ${item.title}`}
        loading="lazy"
        decoding="async"
        onError={() => setProxyFailed(true)}
        className={cn("object-cover", className)}
        draggable={false}
      />
    );
  }

  return (
    <img
      src={resolveSrc!}
      alt={`Thumbnail for: ${item.title}`}
      loading="lazy"
      decoding="async"
      onError={() => setResolveFailed(true)}
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
    dot: "bg-cyber-crimson shadow-[0_0_8px_rgba(255,77,94,0.9)]",
    bar: "bg-cyber-crimson",
    text: "text-cyber-crimson",
    chip: "border-cyber-crimson/50 bg-cyber-crimson/10 text-cyber-crimson",
  },
  HIGH: {
    edge: "border-l-cyber-orange",
    dot: "bg-cyber-orange shadow-[0_0_8px_rgba(251,146,60,0.9)]",
    bar: "bg-cyber-orange",
    text: "text-cyber-orange",
    chip: "border-cyber-orange/50 bg-cyber-orange/10 text-cyber-orange",
  },
  ELEVATED: {
    edge: "border-l-cyber-amber",
    dot: "bg-cyber-amber shadow-[0_0_8px_rgba(245,158,11,0.9)]",
    bar: "bg-cyber-amber",
    text: "text-cyber-amber",
    chip: "border-cyber-amber/50 bg-cyber-amber/10 text-cyber-amber",
  },
  MODERATE: {
    edge: "border-l-cyber-teal/60 light:border-l-cyber-border-strong",
    dot: "bg-cyber-teal shadow-[0_0_8px_rgba(var(--teal-rgb),0.9)] light:bg-cyber-border-strong light:shadow-none",
    bar: "bg-cyber-teal light:bg-cyber-border-strong",
    text: "text-cyber-teal light:text-mid",
    chip: "border-cyber-teal/40 bg-cyber-teal/10 text-cyber-teal light:border-cyber-border-strong light:bg-cyber-raised light:text-mid",
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
}

/**
 * Live news card — proxied thumbnail, severity edge, source badge,
 * headline, one-line analyst lede and a severity meter. Meta noise
 * (author, tag chips, highlight bullets) lives in the Investigation
 * Drawer instead — the card carries only what scanning eyes need
 * (recognition over recall, reduced cognitive load).
 */
export function ArticleCard({ item, selected, onOpen }: ArticleCardProps) {
  const intel = item.intel;
  const tone = severityTone(intel);
  const hot = intel.severity.label === "CRITICAL" || intel.severity.label === "HIGH";
  const cardRef = useRef<HTMLElement>(null);

  /* exhibition-grade hover: subtle GSAP 3D tilt */
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
      ry((px - 0.5) * 2.6);
      rx((0.5 - py) * 2.0);
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
      data-card-reveal
      className={cn(
        "signal-sweep group relative rounded-xl border border-l-2 bg-cyber-surface shadow-[var(--card-shadow)] transition-[border-color,box-shadow,background-color] duration-200",
        tone.edge,
        selected
          ? "border-cyber-teal/70 shadow-[0_0_20px_rgba(var(--teal-rgb),0.14)]"
          : "border-cyber-border/80 hover:border-cyber-teal/45",
      )}
    >
      <div className="flex gap-4 p-4">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="relative h-[86px] w-[124px] shrink-0 overflow-hidden rounded-lg border border-cyber-border/70 sm:h-[100px] sm:w-[152px]"
          aria-label={`Open investigation: ${item.title}`}
          tabIndex={-1}
        >
          <ArticleThumb
            item={item}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {hot && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-cyber-bg/85 px-1.5 py-0.5 text-[8px] font-black tracking-widest text-cyber-crimson backdrop-blur-sm">
              <Zap className="h-2.5 w-2.5" /> {intel.severity.label}
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] tracking-wide">
            <span
              className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase", item.accent.chip)}
            >
              {item.sourceName}
            </span>
            <span className="digital flex items-center gap-1 text-low">
              <Clock3 className="h-3 w-3" />
              <span suppressHydrationWarning>{timeAgo(item.publishedAt)}</span>
            </span>
            <span className="hidden max-w-[160px] truncate text-low sm:inline" title={item.author}>
              {item.author}
            </span>
          </div>

          <h3 className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(item)}
              title={item.title}
              className="block w-full text-left text-[13.5px] font-bold leading-snug text-hi transition-colors group-hover:text-cyber-teal line-clamp-2 sm:text-[14.5px]"
            >
              {item.title}
            </button>
          </h3>

          {/* analyst lede — the punch line of the story */}
          {intel.lede && (
            <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-mid">
              {intel.lede}
            </p>
          )}

          {/* CVE chips + severity meter */}
          <div className="mt-auto hidden flex-wrap items-center gap-2 pt-2 sm:flex">
            {intel.cves.slice(0, 2).map((cve) => (
              <span
                key={cve}
                className="digital rounded-md border border-cyber-crimson/40 bg-cyber-crimson/10 px-1.5 py-0.5 text-[9px] font-bold text-cyber-crimson"
              >
                {cve}
              </span>
            ))}
            {intel.orgs.slice(0, 1).map((org) => (
              <span
                key={org}
                className="max-w-[150px] truncate rounded-md border border-cyber-violet/30 bg-cyber-violet/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyber-violet"
                title={org}
              >
                {org}
              </span>
            ))}

            <span className="ml-auto flex items-center gap-2">
              <span className="digital text-[9px] tracking-wider text-low">
                {intel.readMinutes} MIN READ
              </span>
              <span className={cn("digital text-[9px] font-black tracking-widest", tone.text)}>
                {intel.severity.label}
              </span>
              <span className="h-1 w-12 overflow-hidden rounded-full bg-cyber-raised" aria-hidden="true">
                <span
                  className={cn("block h-full rounded-full", tone.bar)}
                  style={{ width: `${Math.max(8, intel.severity.score)}%` }}
                />
              </span>
            </span>

            <span className="flex items-center gap-0.5 text-[9px] font-bold tracking-widest text-cyber-teal/0 transition-colors group-hover:text-cyber-teal">
              INVESTIGATE <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
