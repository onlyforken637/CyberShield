"use client";

/**
 * CyberShield — shared GSAP setup.
 *
 * Registers ScrollTrigger exactly once for the browser session and exposes
 * a reduced-motion guard used by every animated component so the exhibition
 * experience degrades gracefully for motion-sensitive users.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ── boot gate ─────────────────────────────────────────────────────── */
// The boot overlay owns the first seconds of the session; every entrance
// animation waits for it so the reveal feels choreographed, not accidental.

export const BOOT_EVENT = "cs:booted";
const BOOT_KEY = "cs-booted";

/** True once the boot sequence has completed this tab session. */
export function isBooted(): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(BOOT_KEY) === "1";
  } catch {
    return true; // storage blocked — behave as if booting is over
  }
}

/** Mark boot complete and notify all waiting animations. */
export function markBooted(): void {
  try {
    sessionStorage.setItem(BOOT_KEY, "1");
  } catch {
    /* private mode — event still fires for this page life */
  }
  window.dispatchEvent(new Event(BOOT_EVENT));
}

/** Run `cb` immediately if boot is done, otherwise on boot completion. */
export function whenBooted(cb: () => void): void {
  if (isBooted()) {
    cb();
    return;
  }
  const handler = () => cb();
  window.addEventListener(BOOT_EVENT, handler, { once: true });
}

export { gsap, ScrollTrigger };
