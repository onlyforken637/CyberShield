"use client";

import { useEffect, useRef } from "react";
import { gsap, markBooted, prefersReducedMotion, isBooted } from "@/lib/cyber/gsap";

/**
 * BootOverlay — the cinematic session preloader.
 *
 * Deep black, a stroke-drawn shield glyph, the brand wordmark, an honest
 * terminal boot log, and the Lusion-grade giant percentage counter in the
 * corner. The counter tracks real document readiness (holds at 99 until
 * window load, capped), then the whole overlay wipes upward like a curtain
 * and every entrance animation on the page fires via the boot gate.
 *
 * Plays once per tab session; reduced-motion users skip it entirely.
 */

const BOOT_LINES = [
  "MOUNTING 19 RESEARCH STREAMS",
  "CISA KEV CATALOG — LIVE SYNC",
  "ENRICHMENT GRID — SERVER PIPELINE",
  "RENDERING GLOBAL SIGNAL FIELD",
];

const MIN_BOOT_MS = 2300;
const MAX_WAIT_MS = 6000;

export function BootOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const shieldRef = useRef<SVGPathElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const exitRan = useRef(false);

  useEffect(() => {
    const root = rootRef.current;

    // once-per-session + reduced-motion → skip entirely, release the gate
    if (isBooted() || prefersReducedMotion()) {
      markBooted();
      if (root) root.style.display = "none";
      return;
    }
    if (!root) return;

    // hold page scroll while booting
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const ctx = gsap.context(() => {
      const counter = { v: 0 };
      const state = { loaded: document.readyState === "complete" };
      let finishTimer: ReturnType<typeof setTimeout> | null = null;

      const onLoad = () => {
        state.loaded = true;
      };
      window.addEventListener("load", onLoad);
      if (!state.loaded) {
        // hard cap: never hold the user hostage on a slow connection
        finishTimer = setTimeout(() => {
          state.loaded = true;
        }, MAX_WAIT_MS);
      }

      const tl = gsap.timeline();

      // shield glyph draws itself
      if (shieldRef.current) {
        const len = shieldRef.current.getTotalLength?.() ?? 300;
        gsap.set(shieldRef.current, { strokeDasharray: len, strokeDashoffset: len });
        tl.to(shieldRef.current, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, 0);
      }

      // brand chars rise
      tl.fromTo(
        "[data-boot-char]",
        { yPercent: 120 },
        { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.045 },
        0.35,
      );

      // boot log lines tick in
      tl.fromTo(
        lineRefs.current.filter(Boolean),
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.3, ease: "power2.out", stagger: 0.42 },
        0.55,
      );

      // percentage counter — 0 → 99 until the document reports loaded
      tl.to(
        counter,
        {
          v: 99,
          duration: MIN_BOOT_MS / 1000,
          ease: "power2.inOut",
          onUpdate: () => {
            if (pctRef.current) {
              pctRef.current.textContent = String(Math.floor(counter.v));
            }
          },
        },
        0.1,
      );
      if (barRef.current) {
        tl.fromTo(
          barRef.current,
          { scaleX: 0 },
          { scaleX: 0.99, duration: MIN_BOOT_MS / 1000, ease: "power2.inOut" },
          0.1,
        );
      }

      // hold at 99 until loaded, then finish
      tl.to(
        counter,
        {
          v: 100,
          duration: 0.28,
          ease: "power1.out",
          onUpdate: () => {
            if (pctRef.current) {
              pctRef.current.textContent = String(Math.floor(counter.v));
            }
          },
        },
        MIN_BOOT_MS / 1000 + 0.12,
      );

      tl.add(() => {
        const tryFinish = () => {
          if (!state.loaded) {
            finishTimer = setTimeout(tryFinish, 150);
            return;
          }
          exitTimeline();
        };
        tryFinish();
      }, MIN_BOOT_MS / 1000 + 0.45);

      // exit: counter drops, brand fades, curtain wipes up
      const exitTimeline = () => {
        if (exitRan.current) return;
        exitRan.current = true;
        const exit = gsap.timeline({
          onComplete: () => {
            document.documentElement.style.overflow = prevOverflow;
            markBooted();
            root.style.display = "none";
          },
        });
        exit
          .to("[data-boot-hud]", { yPercent: 60, opacity: 0, duration: 0.45, ease: "power2.in" }, 0)
          .to(brandRef.current, { scale: 1.12, opacity: 0, duration: 0.5, ease: "power2.in" }, 0)
          .to(root, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.85, ease: "expo.inOut" }, 0.18);
      };
    }, root);

    return () => {
      window.removeEventListener("load", onLoad);
      if (finishTimer) clearTimeout(finishTimer);
      document.documentElement.style.overflow = prevOverflow;
      ctx.revert();
    };
  }, []);

  const brand = "CYBER_SHIELD // LIVE_FEED";

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label="CyberShield is initializing"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#05070d]"
      style={{ clipPath: "inset(0% 0% 0% 0%)" }}
    >
      {/* shield glyph + brand */}
      <div ref={brandRef} className="flex flex-col items-center gap-5">
        <svg width="64" height="72" viewBox="0 0 64 72" fill="none" aria-hidden="true" className="boot-glow">
          <path
            ref={shieldRef}
            d="M32 4 L58 14 V38 C58 54 46 64 32 68 C18 64 6 54 6 38 V14 Z"
            stroke="#00e5ff"
            strokeWidth="2.5"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M22 36 L29 43 L43 27" stroke="#ffb300" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <div className="flex overflow-hidden">
          {brand.split("").map((char, index) => (
            <span
              key={index}
              data-boot-char
              className="font-display text-[13px] font-black tracking-[0.34em] text-slate-200 sm:text-base"
            >
              {char === " " ? "\u00A0" : char}
            </span>
          ))}
        </div>
      </div>

      {/* giant percentage — Lusion-style, bottom-left */}
      <div data-boot-hud className="pointer-events-none absolute bottom-2 left-4 sm:bottom-4 sm:left-8">
        <span
          ref={pctRef}
          className="font-display text-[26vw] font-black leading-[0.85] tracking-tighter text-slate-100/95 tabular-nums sm:text-[11rem] lg:text-[13rem]"
        >
          0
        </span>
      </div>

      {/* terminal boot log — bottom-right */}
      <ul
        data-boot-hud
        className="pointer-events-none absolute bottom-6 right-4 space-y-1.5 text-right sm:bottom-9 sm:right-9"
        aria-hidden="true"
      >
        {BOOT_LINES.map((line, index) => (
          <li
            key={line}
            ref={(node) => {
              lineRefs.current[index] = node;
            }}
            className="digital text-[9px] tracking-[0.2em] text-slate-500 opacity-0 sm:text-[10.5px]"
          >
            {line} <span className="font-bold text-cyber-green">… OK</span>
          </li>
        ))}
      </ul>

      {/* thin progress hairline across the very bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-cyber-border/40">
        <div
          ref={barRef}
          data-boot-hud
          className="h-full w-full origin-left bg-gradient-to-r from-cyber-teal via-cyber-teal to-cyber-amber"
        />
      </div>
    </div>
  );
}
