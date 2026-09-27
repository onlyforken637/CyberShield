"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";

/**
 * useMagnetic — award-site magnetic hover for buttons.
 *
 * The element leans toward the cursor while hovered (quickTo, no re-render)
 * and snaps back with an elastic ease on leave. Attach the returned ref to
 * any button/CTA. No-op under reduced motion or on touch devices.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.32) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    gsap.set(el, { transformPerspective: 600 });
    const xTo = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      xTo(dx * strength);
      yTo(dy * strength);
    };
    const onLeave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.45)" });
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
    };
  }, [strength]);

  return ref;
}
