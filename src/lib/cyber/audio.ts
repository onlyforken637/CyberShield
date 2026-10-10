"use client";

/**
 * CyberShield — audio subsystem.
 *
 * Owns every sound the dashboard makes:
 *  - the JARVIS-style welcome voice (pre-rendered TTS asset, comms-treated)
 *  - synthesized UI tones (boot chime, confirm blips, reveal sweep) via WebAudio
 *
 * Browsers only allow audio after a user gesture, so the boot sequence ends
 * in an explicit "ENGAGE VOICE UPLINK" gate when playback is blocked — see
 * boot-overlay.tsx. All synth tones silently no-op while the AudioContext is
 * still locked, so they are safe to call from anywhere.
 */

const SOUND_KEY = "cs-sound";
export const VOICE_SRC = "/audio/jarvis-welcome.mp3";

/** Fired whenever the sound preference changes (for useSyncExternalStore). */
export const SOUND_EVENT = "cs-sound-change";

/* ── persistence (external store) ──────────────────────────────────── */

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true; // storage blocked — default to audible
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private mode — toggle still works for this page life */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SOUND_EVENT));
}

export function subscribeSound(onChange: () => void): () => void {
  window.addEventListener(SOUND_EVENT, onChange);
  window.addEventListener("storage", onChange); // keep multi-tab sessions in sync
  return () => {
    window.removeEventListener(SOUND_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** useSyncExternalStore snapshot — booleans compare by value, safe to re-read. */
export function getSoundSnapshot(): boolean {
  return isSoundEnabled();
}

/* ── AudioContext (lazily created, gesture-resumed) ────────────────── */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Resume the shared context from a user gesture. Returns a running ctx or null. */
export async function ensureAudioRunning(): Promise<AudioContext | null> {
  const ctx = getCtx();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

interface ToneOptions {
  freq: number;
  endFreq?: number;
  /** start offset from `at` (context time), seconds */
  delay?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  at?: number;
}

function scheduleTone(ctx: AudioContext, options: ToneOptions): void {
  const { freq, endFreq, delay = 0, duration = 0.08, type = "sine", gain = 0.05, at = 0 } = options;
  const t0 = at + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function withCtx(play: (ctx: AudioContext, now: number) => void): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx || ctx.state !== "running") return; // still gesture-locked — stay silent
  try {
    play(ctx, ctx.currentTime);
  } catch {
    /* audio should never break the UI */
  }
}

/* ── synthesized UI tones ──────────────────────────────────────────── */

/** Tiny terminal tick for boot log lines. */
export function playBlip(): void {
  withCtx((ctx, now) => scheduleTone(ctx, { freq: 1180, duration: 0.045, gain: 0.028, at: now }));
}

/** Short two-note acknowledgement (button presses). */
export function playConfirm(): void {
  withCtx((ctx, now) => {
    scheduleTone(ctx, { freq: 660, duration: 0.07, gain: 0.045, at: now });
    scheduleTone(ctx, { freq: 990, duration: 0.09, gain: 0.045, delay: 0.085, at: now });
  });
}

/** JARVIS-style triple chirp + low sub-swell — fires when the voice uplink engages. */
export function playBootChime(): void {
  withCtx((ctx, now) => {
    scheduleTone(ctx, { freq: 740, duration: 0.1, gain: 0.055, at: now });
    scheduleTone(ctx, { freq: 988, duration: 0.1, gain: 0.055, delay: 0.12, at: now });
    scheduleTone(ctx, { freq: 1480, duration: 0.18, gain: 0.05, delay: 0.24, at: now });
    scheduleTone(ctx, { freq: 180, endFreq: 90, duration: 0.5, gain: 0.05, type: "triangle", at: now });
  });
}

/** Rising sweep under the curtain reveal (boot exit). */
export function playRevealSweep(): void {
  withCtx((ctx, now) => {
    const t0 = now;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(760, t0 + 1.05);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t0);
    filter.frequency.exponentialRampToValueAtTime(3400, t0 + 1.05);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.045, t0 + 0.18);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
    osc.connect(filter).connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 1.2);
  });
}

/* ── JARVIS voice ──────────────────────────────────────────────────── */

/**
 * Attempt to play the pre-rendered welcome voice.
 * Resolves true when playback actually starts (autoplay permitted or the
 * caller is inside a user gesture), false when the browser blocks it.
 */
export async function playVoice(audio: HTMLAudioElement | null): Promise<boolean> {
  if (!audio || !isSoundEnabled()) return false;
  try {
    audio.currentTime = 0;
    audio.volume = 0.9;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
