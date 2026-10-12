"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  FileText,
  Presentation,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ── resource registry ────────────────────────────────────────────── */

const RESOURCES_PDF = "/cybershield-documentation.pdf";
const RESOURCES_PPTX = "/CyberShield-Presentation.pptx";
const RESOURCES_VIDEO = "/cybershield-explainer.mp4";
const SLIDE_COUNT = 13;

type ResourceKind = "docs" | "slides" | "video";

/* ── scaled 1280×720 slide frame (responsive letterbox-free) ──────── */

function SlideFrame({ slide }: { slide: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 1280);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-cyber-border bg-cyber-bg"
    >
      {scale > 0 && (
        <iframe
          key={slide}
          src={`/slides/slide_${String(slide).padStart(2, "0")}.html`}
          title={`CyberShield presentation — slide ${slide} of ${SLIDE_COUNT}`}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: 1280, height: 720, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}

/* ── section ──────────────────────────────────────────────────────── */

/**
 * Mission Resources — the project's own documentation deck and film,
 * served straight from this site: a 9-page PDF manual, the 13-slide
 * product presentation (viewable slide-by-slide or as .pptx download)
 * and the narrated explainer video.
 */
export function ResourcesSection() {
  const [openKind, setOpenKind] = useState<ResourceKind | null>(null);
  const [slide, setSlide] = useState(1);

  const openSlides = () => {
    setSlide(1);
    setOpenKind("slides");
  };

  return (
    <section
      id="resources"
      data-intro
      aria-label="Mission resources"
      className="mx-auto w-full max-w-[1600px] scroll-mt-32 px-3 pb-4 sm:px-6 lg:px-8"
    >
      {/* section header */}
      <div className="mb-6 flex flex-col gap-1.5">
        <p className="digital text-[10px] font-bold tracking-[0.28em] text-cyber-teal">
          MISSION RESOURCES
        </p>
        <h2 className="font-display text-xl font-black tracking-wide text-hi sm:text-2xl">
          Docs, Deck &amp; Film — <span className="brand-gradient">Built In</span>
        </h2>
        <p className="max-w-2xl text-[13px] leading-relaxed text-mid">
          Everything about CyberShield, served from the site itself — the full documentation
          manual, the product presentation and the narrated explainer.
        </p>
      </div>

      {/* resource cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Documentation */}
        <article className="card-surface signal-sweep flex flex-col p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cyber-teal/25 bg-cyber-teal/10">
            <FileText className="h-5 w-5 text-cyber-teal" aria-hidden="true" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-wide text-hi">
            Documentation
          </h3>
          <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-mid">
            The complete 9-page manual — what CyberShield is, how the pipelines work, the API
            surface and deployment.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="digital text-[9.5px] tracking-widest text-low">PDF · 9 PAGES</span>
            <button
              type="button"
              onClick={() => setOpenKind("docs")}
              className="btn-accent rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
            >
              Open Manual
            </button>
          </div>
        </article>

        {/* Presentation */}
        <article className="card-surface signal-sweep flex flex-col p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cyber-teal/25 bg-cyber-teal/10">
            <Presentation className="h-5 w-5 text-cyber-teal" aria-hidden="true" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-wide text-hi">
            Presentation
          </h3>
          <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-mid">
            The 13-slide product deck — features, use cases and deployment, viewable right here
            slide by slide.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="digital text-[9.5px] tracking-widest text-low">PPTX · 13 SLIDES</span>
            <div className="flex items-center gap-2">
              <a
                href={RESOURCES_PPTX}
                download
                aria-label="Download presentation as PowerPoint file"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyber-border text-mid transition-colors hover:border-cyber-teal hover:text-cyber-teal"
                title="Download .pptx"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={openSlides}
                className="btn-accent rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
              >
                View Slides
              </button>
            </div>
          </div>
        </article>

        {/* Explainer video */}
        <article className="card-surface signal-sweep flex flex-col p-6">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cyber-teal/25 bg-cyber-teal/10">
            <Clapperboard className="h-5 w-5 text-cyber-teal" aria-hidden="true" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-wide text-hi">
            Explainer Film
          </h3>
          <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-mid">
            A narrated product film — what CyberShield does, how a signal flows from source to
            screen, and how to use it.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="digital text-[9.5px] tracking-widest text-low">MP4 · 1:55</span>
            <button
              type="button"
              onClick={() => setOpenKind("video")}
              className="btn-accent rounded-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wider"
            >
              Watch Film
            </button>
          </div>
        </article>
      </div>

      {/* ── Documentation dialog ──────────────────────────────────── */}
      <Dialog open={openKind === "docs"} onOpenChange={(open) => !open && setOpenKind(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden border-cyber-border bg-cyber-surface p-4 sm:max-w-4xl sm:p-5">
          <DialogHeader>
            <DialogTitle className="font-display text-sm font-bold tracking-[0.14em] text-hi">
              CyberShield — Documentation
            </DialogTitle>
            <DialogDescription className="text-[12px] text-mid">
              The 9-page product manual.{" "}
              <a
                href={RESOURCES_PDF}
                download
                className="font-semibold text-cyber-teal underline-offset-2 hover:underline"
              >
                Download the PDF
              </a>{" "}
              for offline reading.
            </DialogDescription>
          </DialogHeader>
          <iframe
            src={`${RESOURCES_PDF}#view=FitH`}
            title="CyberShield documentation PDF"
            className="h-[72vh] w-full rounded-lg border border-cyber-border bg-cyber-panel"
          />
        </DialogContent>
      </Dialog>

      {/* ── Presentation dialog ───────────────────────────────────── */}
      <Dialog open={openKind === "slides"} onOpenChange={(open) => !open && setOpenKind(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden border-cyber-border bg-cyber-surface p-4 sm:max-w-4xl sm:p-5">
          <DialogHeader>
            <DialogTitle className="font-display text-sm font-bold tracking-[0.14em] text-hi">
              CyberShield — Product Presentation
            </DialogTitle>
            <DialogDescription className="text-[12px] text-mid">
              13 slides · use the arrows to navigate ·{" "}
              <a
                href={RESOURCES_PPTX}
                download
                className="font-semibold text-cyber-teal underline-offset-2 hover:underline"
              >
                download the .pptx
              </a>
            </DialogDescription>
          </DialogHeader>

          <SlideFrame slide={slide} />

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSlide((s) => Math.max(1, s - 1))}
              disabled={slide === 1}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cyber-border px-3.5 text-[11px] font-bold uppercase tracking-wider text-mid transition-colors hover:border-cyber-teal hover:text-cyber-teal disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <div className="flex items-center gap-1.5" role="group" aria-label="Slide navigation">
              {Array.from({ length: SLIDE_COUNT }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setSlide(number)}
                  aria-label={`Go to slide ${number}`}
                  aria-current={slide === number}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    slide === number
                      ? "w-6 bg-cyber-teal"
                      : "w-2 bg-cyber-border-strong hover:bg-cyber-teal/50",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlide((s) => Math.min(SLIDE_COUNT, s + 1))}
              disabled={slide === SLIDE_COUNT}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cyber-border px-3.5 text-[11px] font-bold uppercase tracking-wider text-mid transition-colors hover:border-cyber-teal hover:text-cyber-teal disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Explainer video dialog ────────────────────────────────── */}
      <Dialog open={openKind === "video"} onOpenChange={(open) => !open && setOpenKind(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden border-cyber-border bg-cyber-surface p-4 sm:max-w-3xl sm:p-5">
          <DialogHeader>
            <DialogTitle className="font-display text-sm font-bold tracking-[0.14em] text-hi">
              CyberShield — Explainer Film
            </DialogTitle>
            <DialogDescription className="text-[12px] text-mid">
              Narrated walkthrough · 1 min 55 s ·{" "}
              <a
                href={RESOURCES_VIDEO}
                download
                className="font-semibold text-cyber-teal underline-offset-2 hover:underline"
              >
                download the MP4
              </a>
            </DialogDescription>
          </DialogHeader>
          <video
            src={RESOURCES_VIDEO}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-lg border border-cyber-border bg-black"
          >
            Your browser does not support embedded video.
          </video>
        </DialogContent>
      </Dialog>
    </section>
  );
}
