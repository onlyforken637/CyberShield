"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { gsap, markBooted, prefersReducedMotion, isBooted } from "@/lib/cyber/gsap";
import { SOURCES } from "@/lib/cyber/feeds";
import {
  VOICE_SRC,
  ensureAudioRunning,
  playBlip,
  playBootChime,
  playRevealSweep,
  playVoice,
  isSoundEnabled,
} from "@/lib/cyber/audio";

/**
 * BootOverlay — the cinematic session preloader with automatic JARVIS voice.
 *
 * Deep-black canvas, a THREAT RADAR as the centerpiece: GSAP draws the range
 * rings outward, a conic sweep rotates endlessly, and deterministic "contacts"
 * ping in lock-step with the honest terminal boot log. For a global threat
 * feed a radar is the one image that needs no explanation — and the shield
 * glyph sits in its eye while the giant percentage counter anchors the corner.
 *
 * The moment the counter hits 100 the JARVIS welcome fires automatically —
 * no click required wherever the browser permits it. Browsers physically
 * block audio before any user gesture; if playback is refused the boot still
 * reveals instantly and the voice engages itself on the first click, scroll
 * or keypress (a toast announces the armed uplink). Interacting DURING the
 * boot pre-unlocks the audio channel so the 100% moment plays clean.
 *
 * Plays once per tab session; reduced-motion users skip it entirely.
 */

const BOOT_LINES = [
  `MOUNTING ${SOURCES.length} RESEARCH STREAMS`,
  "CISA KEV CATALOG — LIVE SYNC",
  "ENRICHMENT GRID — SERVER PIPELINE",
  "ANALYST UPLINK — GLM ONLINE",
  "AUDIO CHANNEL — VOICE READY",
  "THREAT RADAR — SWEEP ONLINE",
];

/** Deterministic radar contacts (x/y in % of the disc) — SSR-safe, no RNG. */
const CONTACTS = [
  { x: 68, y: 27, tone: "teal" },
  { x: 31, y: 39, tone: "amber" },
  { x: 73, y: 59, tone: "teal" },
  { x: 45, y: 19, tone: "teal" },
  { x: 23, y: 67, tone: "amber" },
  { x: 57, y: 75, tone: "teal" },
] as const;

const MIN_BOOT_MS = 3000;
const MAX_WAIT_MS = 6000;
const VOICE_ARM_TIMEOUT_MS = 120_000;

export function BootOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const shieldRef = useRef<SVGPathElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const ringRefs = useRef<Array<SVGCircleElement | null>>([]);
  const contactRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const rippleRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const centerRippleRef = useRef<HTMLSpanElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const exitRan = useRef(false);

  useEffect(() => {
    const root = rootRef.current;

    // once-per-session + reduced-motion → skip entirely
    if (isBooted() || prefersReducedMotion()) {
      markBooted();
      if (root) root.style.display = "none";
      return;
    }
    if (!root) return;

    // hold page scroll while booting
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const state = { loaded: document.readyState === "complete" };
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    let enterTimer: ReturnType<typeof setTimeout> | null = null;
    let voiceArmTimer: ReturnType<typeof setTimeout> | null = null;
    let disarmVoice: (() => void) | null = null;

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

    // any interaction during the boot unlocks the audio channel early so the
    // 100% moment plays clean chime + voice without a second event
    const unlock = () => {
      void ensureAudioRunning();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    /** The 100% moment — one lock pulse across the whole radar. */
    const lockRadar = () => {
      if (flashRef.current) {
        gsap.fromTo(
          flashRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.16, yoyo: true, repeat: 1, ease: "power1.inOut" },
        );
      }
      if (centerRippleRef.current) {
        gsap.fromTo(
          centerRippleRef.current,
          { scale: 0.15, opacity: 0.85 },
          { scale: 3.6, opacity: 0, duration: 1.2, ease: "power2.out" },
        );
      }
      if (radarRef.current) {
        gsap.to(radarRef.current, {
          filter: "brightness(1.45)",
          duration: 0.18,
          yoyo: true,
          repeat: 1,
          ease: "power1.inOut",
        });
      }
    };

    /** Curtain lift — the same exit choreography for every entry path. */
    const runExit = () => {
      if (exitRan.current) return;
      exitRan.current = true;
      playRevealSweep();
      const exit = gsap.timeline({
        onComplete: () => {
          document.documentElement.style.overflow = prevOverflow;
          markBooted();
          root.style.display = "none";
        },
      });
      exit
        .to("[data-boot-hud]", { yPercent: 60, opacity: 0, duration: 0.45, ease: "power2.in" }, 0)
        .to(radarRef.current, { scale: 1.14, opacity: 0, duration: 0.55, ease: "power2.in" }, 0)
        .to(brandRef.current, { scale: 1.12, opacity: 0, duration: 0.5, ease: "power2.in" }, 0)
        .to(root, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.85, ease: "expo.inOut" }, 0.18);
    };

    /**
     * Fallback for browser autoplay policy: the voice engages itself on the
     * first interaction of any kind. Disarms after 2 minutes.
     */
    const armVoiceOnFirstInteraction = () => {
      const events = ["pointerdown", "touchstart", "keydown", "wheel"] as const;
      const fire = () => {
        disarmVoice?.();
        void (async () => {
          await ensureAudioRunning();
          playBootChime();
          void playVoice(audioRef.current);
        })();
      };
      disarmVoice = () => {
        events.forEach((event) => window.removeEventListener(event, fire));
        if (voiceArmTimer) {
          clearTimeout(voiceArmTimer);
          voiceArmTimer = null;
        }
        disarmVoice = null;
      };
      events.forEach((event) => window.addEventListener(event, fire, { once: true, passive: true }));
      voiceArmTimer = setTimeout(disarmVoice, VOICE_ARM_TIMEOUT_MS);
      toast("VOICE UPLINK ARMED", {
        description:
          "Browser audio policy allows sound after one interaction — JARVIS engages on your first click, scroll or keypress.",
      });
    };

    /** The boot moment — fully automatic at 100%. */
    const enterSequence = async () => {
      lockRadar();
      if (!isSoundEnabled()) {
        runExit();
        return;
      }
      const started = await playVoice(audioRef.current);
      if (started) {
        playBootChime();
        enterTimer = window.setTimeout(runExit, 240);
      } else {
        // autoplay locked → reveal immediately, voice self-engages later
        armVoiceOnFirstInteraction();
        runExit();
      }
    };

    const ctx = gsap.context(() => {
      const counter = { v: 0 };
      const setPct = () => {
        const value = Math.floor(counter.v);
        if (pctRef.current) pctRef.current.textContent = String(value);
      };

      const tl = gsap.timeline();

      // radar rises into place
      if (radarRef.current) {
        tl.fromTo(
          radarRef.current,
          { scale: 0.82, opacity: 0, rotation: -10 },
          { scale: 1, opacity: 1, rotation: 0, duration: 1, ease: "expo.out" },
          0,
        );
      }

      // range rings draw outward, outer → inner
      ringRefs.current.forEach((ring, index) => {
        if (!ring) return;
        const len = ring.getTotalLength?.() ?? 600;
        gsap.set(ring, { strokeDasharray: `${len}`, strokeDashoffset: len });
        tl.to(ring, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" }, 0.12 + index * 0.14);
      });

      // endless radar sweep — created inside the context so cleanup reverts it
      if (sweepRef.current) {
        gsap.to(sweepRef.current, { rotation: 360, duration: 3.1, ease: "none", repeat: -1 });
      }

      // graticule (ticks + crosshair) fades in under the sweep
      tl.fromTo(
        "[data-radar-grid]",
        { opacity: 0 },
        { opacity: 1, duration: 0.7, ease: "power1.out" },
        0.3,
      );

      // shield glyph draws itself in the eye of the radar, check confirms
      if (shieldRef.current) {
        const len = shieldRef.current.getTotalLength?.() ?? 300;
        gsap.set(shieldRef.current, { strokeDasharray: len, strokeDashoffset: len });
        tl.to(shieldRef.current, { strokeDashoffset: 0, duration: 1, ease: "power2.inOut" }, 0.35);
      }
      if (checkRef.current) {
        tl.fromTo(checkRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power1.out" }, 1.3);
      }

      // brand chars rise
      tl.fromTo(
        "[data-boot-char]",
        { yPercent: 120 },
        { yPercent: 0, duration: 0.7, ease: "expo.out", stagger: 0.045 },
        0.5,
      );

      // boot log ticks in — each line pings a radar contact at the same instant
      BOOT_LINES.forEach((line, index) => {
        const at = 0.55 + index * 0.34;
        const lineEl = lineRefs.current[index];
        if (lineEl) {
          tl.fromTo(
            lineEl,
            { opacity: 0, x: -8 },
            {
              opacity: 1,
              x: 0,
              duration: 0.3,
              ease: "power2.out",
              onStart: () => playBlip(),
            },
            at,
          );
        }
        const contact = contactRefs.current[index];
        const ripple = rippleRefs.current[index];
        if (contact) {
          tl.fromTo(
            contact,
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.28, ease: "back.out(3)" },
            at + 0.05,
          );
        }
        if (ripple) {
          tl.fromTo(
            ripple,
            { scale: 0.2, opacity: 0.75 },
            { scale: 2.8, opacity: 0, duration: 0.85, ease: "power2.out" },
            at + 0.05,
          );
        }
      });

      // percentage counter — 0 → 99 until the document reports loaded
      tl.to(counter, { v: 99, duration: MIN_BOOT_MS / 1000, ease: "power2.inOut", onUpdate: setPct }, 0.1);
      if (barRef.current) {
        tl.fromTo(
          barRef.current,
          { scaleX: 0 },
          { scaleX: 0.99, duration: MIN_BOOT_MS / 1000, ease: "power2.inOut" },
          0.1,
        );
      }

      // hold at 99 until loaded, then finish
      tl.to(counter, { v: 100, duration: 0.28, ease: "power1.out", onUpdate: setPct }, MIN_BOOT_MS / 1000 + 0.12);

      tl.add(
        () => {
          const tryFinish = () => {
            if (!state.loaded) {
              finishTimer = setTimeout(tryFinish, 150);
              return;
            }
            void enterSequence();
          };
          tryFinish();
        },
        MIN_BOOT_MS / 1000 + 0.45,
      );
    }, root);

    return () => {
      window.removeEventListener("load", onLoad);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      disarmVoice?.();
      if (finishTimer) clearTimeout(finishTimer);
      if (enterTimer) clearTimeout(enterTimer);
      if (voiceArmTimer) clearTimeout(voiceArmTimer);
      gsap.killTweensOf([
        sweepRef.current,
        flashRef.current,
        centerRippleRef.current,
        radarRef.current,
      ]);
      document.documentElement.style.overflow = prevOverflow;
      ctx.revert();
    };
  }, []);

  const brand = "CYBER_SHIELD // LIVE_FEED";

  return (
    <>
      {/* welcome voice — lives outside the animated root so playback survives the wipe */}
      <audio ref={audioRef} src={VOICE_SRC} preload="auto" aria-hidden="true" className="hidden" />

      <div
        ref={rootRef}
        role="status"
        aria-label="CyberShield is initializing"
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center overflow-hidden bg-cyber-bg"
        style={{ clipPath: "inset(0% 0% 0% 0%)" }}
      >
        {/* THREAT RADAR — the boot centerpiece */}
        <div
          ref={radarRef}
          aria-hidden="true"
          className="relative z-0 h-[56vmin] w-[56vmin] opacity-0 sm:h-[62vmin] sm:w-[62vmin] lg:h-[540px] lg:w-[540px]"
        >
          {/* rotating sweep wedge + leading edge */}
          <div
            ref={sweepRef}
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(0,229,255,0.02) 295deg, rgba(0,229,255,0.09) 335deg, rgba(0,229,255,0.28) 355deg, rgba(0,229,255,0.6) 359.5deg, transparent 360deg)",
            }}
          >
            <span className="absolute left-1/2 top-[2%] h-[48%] w-[2px] -translate-x-1/2 rounded-full bg-cyber-teal/70 shadow-[0_0_12px_rgba(0,229,255,0.8)]" />
          </div>

          {/* range rings, tick marks and graticule */}
          <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
            <circle
              ref={(node) => {
                ringRefs.current[0] = node;
              }}
              cx="100"
              cy="100"
              r="96"
              stroke="#00e5ff"
              strokeOpacity="0.42"
              strokeWidth="1"
            />
            <circle
              ref={(node) => {
                ringRefs.current[1] = node;
              }}
              cx="100"
              cy="100"
              r="66"
              stroke="#00e5ff"
              strokeOpacity="0.26"
              strokeWidth="0.8"
            />
            <circle
              ref={(node) => {
                ringRefs.current[2] = node;
              }}
              cx="100"
              cy="100"
              r="36"
              stroke="#00e5ff"
              strokeOpacity="0.2"
              strokeWidth="0.8"
            />
            <g data-radar-grid>
              <circle cx="100" cy="100" r="81" stroke="#00e5ff" strokeOpacity="0.2" strokeWidth="5" strokeDasharray="0.9 9.7" />
              <line x1="100" y1="4" x2="100" y2="196" stroke="#00e5ff" strokeOpacity="0.1" strokeWidth="0.6" />
              <line x1="4" y1="100" x2="196" y2="100" stroke="#00e5ff" strokeOpacity="0.1" strokeWidth="0.6" />
              <line x1="32" y1="32" x2="168" y2="168" stroke="#00e5ff" strokeOpacity="0.06" strokeWidth="0.6" />
              <line x1="168" y1="32" x2="32" y2="168" stroke="#00e5ff" strokeOpacity="0.06" strokeWidth="0.6" />
            </g>
          </svg>

          {/* radar contacts — one ping per boot log line */}
          {CONTACTS.map((contact, index) => (
            <span
              key={index}
              className="absolute"
              style={{ left: `${contact.x}%`, top: `${contact.y}%` }}
            >
              <span
                ref={(node) => {
                  contactRefs.current[index] = node;
                }}
                className={`absolute block rounded-full ${
                  contact.tone === "amber"
                    ? "bg-cyber-amber shadow-[0_0_10px_rgba(255,179,0,0.9)]"
                    : "bg-cyber-teal shadow-[0_0_10px_rgba(0,229,255,0.9)]"
                }`}
                style={{ width: 7, height: 7, left: -3.5, top: -3.5 }}
              />
              <span
                ref={(node) => {
                  rippleRefs.current[index] = node;
                }}
                className={`absolute block rounded-full border-2 ${
                  contact.tone === "amber" ? "border-cyber-amber/70" : "border-cyber-teal/70"
                }`}
                style={{ width: 22, height: 22, left: -11, top: -11 }}
              />
            </span>
          ))}

          {/* 100% lock ripple from the center */}
          <span className="absolute left-1/2 top-1/2">
            <span
              ref={centerRippleRef}
              className="absolute block rounded-full border-2 border-cyber-teal/80"
              style={{ width: 40, height: 40, left: -20, top: -20, opacity: 0 }}
            />
          </span>

          {/* shield glyph in the eye of the radar */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="52" height="58" viewBox="0 0 64 72" fill="none" aria-hidden="true" className="boot-glow">
              <path
                ref={shieldRef}
                d="M32 4 L58 14 V38 C58 54 46 64 32 68 C18 64 6 54 6 38 V14 Z"
                stroke="#00e5ff"
                strokeWidth="2.5"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                ref={checkRef}
                d="M22 36 L29 43 L43 27"
                stroke="#ffb300"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          {/* lock flash overlay */}
          <div
            ref={flashRef}
            className="absolute inset-0 rounded-full opacity-0"
            style={{
              background:
                "radial-gradient(circle, rgba(0,229,255,0.28) 0%, rgba(0,229,255,0.05) 45%, transparent 70%)",
            }}
          />
        </div>

        {/* brand wordmark */}
        <div ref={brandRef} className="relative z-10 -mt-[1vmin] flex px-6 text-center">
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
    </>
  );
}
