"use client";

import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/cyber/gsap";

/**
 * CursorGlow — a soft teal light that trails the cursor (screen blend),
 * the way every award-site scene keeps the pointer "lit". Native cursor
 * stays untouched; hidden on touch devices and under reduced motion.
 */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 0 });
    const xTo = gsap.quickTo(el, "x", { duration: 0.55, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.55, ease: "power3.out" });

    let shown = false;
    const onMove = (event: PointerEvent) => {
      xTo(event.clientX);
      yTo(event.clientY);
      if (!shown) {
        shown = true;
        gsap.to(el, { opacity: 1, duration: 0.6 });
      }
    };
    const onLeave = () => {
      shown = false;
      gsap.to(el, { opacity: 0, duration: 0.4 });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(el);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[70] hidden h-[280px] w-[280px] rounded-full opacity-0 mix-blend-screen md:block"
      style={{
        background:
          "radial-gradient(circle, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0.045) 38%, transparent 68%)",
      }}
    />
  );
}
