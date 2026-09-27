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

export { gsap, ScrollTrigger };
