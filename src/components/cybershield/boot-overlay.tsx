"use client";

import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { gsap, markBooted, prefersReducedMotion, isBooted } from "@/lib/cyber/gsap";
import { SOURCES } from "@/lib/cyber/feeds";
import { BootScene } from "@/components/cybershield/boot-scene";
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
 * Deep-black v3 canvas, a Three.js particle vortex converging around the
 * shield glyph as progress climbs, the brand wordmark, an honest terminal
 * boot log (each line acknowledged with a synthesized blip once the audio
 * channel is unlocked) and the giant percentage counter.
 *
 * The moment the counter hits 100 the JARVIS welcome fires automatically —
 * no click required wherever the browser permits it. Browsers physically
 * block audio before any user gesture, so if playback is refused the boot
 * still reveals instantly and the voice engages itself on the first click,
 * scroll or keypress (a toast announces the armed uplink). Clicking anything
 * DURING the boot also unlocks the channel so 100% plays clean audio.
 *
 * Plays once per tab session; reduced-motion users skip it entirely.
 */

const BOOT_LINES = [
  `MOUNTING ${SOURCES.length} RESEARCH STREAMS`,
  "CISA KEV CATALOG — LIVE SYNC",
  "ENRICHMENT GRID — SERVER PIPELINE",
  "ANALYST UPLINK — GLM ONLINE",
  "AUDIO CHANNEL — VOICE READY",
  "RENDERING GLOBAL SIGNAL FIELD",
];

const MIN_BOOT_MS = 3000;
const MAX_WAIT_MS = 6000;
const VOICE_ARM_TIMEOUT_MS = 120_000;

export function BootOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const shieldRef = useRef<SVGPathElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const exitRan = useRef(false);
  // shared boot progress (0–100) — read by the Three.js scene every frame
  const bootProgress = useMemo(() => ({ v: 0 }), []);

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
        description: "Browser audio policy allows sound after one interaction — JARVIS engages on your first click, scroll or keypress.",
      });
    };

    /** The boot moment — fully automatic at 100%. */
    const enterSequence = async () => {
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
        bootProgress.v = value;
      };

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

      // boot log lines tick in — one synthesized blip per line (audible once
      // the audio channel has been unlocked by a gesture)
      lineRefs.current
        .filter((line): line is HTMLLIElement => Boolean(line))
        .forEach((line, index) => {
          tl.fromTo(
            line,
            { opacity: 0, x: -8 },
            {
              opacity: 1,
              x: 0,
              duration: 0.3,
              ease: "power2.out",
              onStart: () => playBlip(),
            },
            0.55 + index * 0.34,
          );
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
      document.documentElement.style.overflow = prevOverflow;
      ctx.revert();
    };
  }, [bootProgress]);

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
        {/* Three.js particle vortex converging around the shield */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <BootScene
            progress={bootProgress}
            className="h-[82vmin] w-[82vmin] -translate-y-[7vmin] opacity-90"
          />
        </div>

        {/* shield glyph + brand */}
        <div ref={brandRef} className="relative z-10 flex flex-col items-center gap-5 px-6 text-center">
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
    </>
  );
}
