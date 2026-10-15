/**
 * Layout-shift-resilient smooth scrolling for in-page anchors.
 *
 * Native anchor jumps and one-shot `scrollIntoView` compute the destination
 * once at call time. On this dashboard the content ABOVE the anchor keeps
 * growing while the scroll is in flight (the feed streams extra cards via an
 * IntersectionObserver sentinel, fonts/images settle, canvases paint), so the
 * animation regularly lands short — the user stops "in the middle of the feed".
 *
 * `scrollToAnchorSafe` kicks off a smooth scroll toward the element's live
 * position, then keeps watching (rAF) and re-issues a correction whenever the
 * scroll engine has settled but the target's viewport offset still misses its
 * `scroll-margin-top`. It converges, gives up after `maxMs`, and immediately
 * hands control back the moment the user scrolls by themselves.
 */

const DEFAULT_MAX_MS = 4000;

/* ── anchor-flight flag ────────────────────────────────────────────
 * While a programmatic anchor scroll is in flight, layout-growing work
 * below/above the target (e.g. the feed streaming extra card chunks via
 * its IntersectionObserver sentinel) must hold still — otherwise the
 * target keeps running away and the scroll can never land exactly.
 * Counter-based: overlapping flights (rapid re-clicks) stay correct. */
let activeFlights = 0;

export function isAnchorFlightActive(): boolean {
  return activeFlights > 0;
}

export function scrollToAnchorSafe(id: string, opts?: { maxMs?: number }): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;

  const maxMs = opts?.maxMs ?? DEFAULT_MAX_MS;
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

  const marginOf = (node: HTMLElement) =>
    parseFloat(getComputedStyle(node).scrollMarginTop || "0") || 0;

  let raf = 0;
  let lastY = window.scrollY;
  let stillFrames = 0;
  let done = false;
  const t0 = performance.now();

  const finish = () => {
    if (done) return;
    done = true;
    activeFlights = Math.max(0, activeFlights - 1);
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", finish);
    window.removeEventListener("touchstart", finish);
    window.removeEventListener("keydown", finish);
  };

  // user takes over → stop correcting
  window.addEventListener("wheel", finish, { passive: true });
  window.addEventListener("touchstart", finish, { passive: true });
  window.addEventListener("keydown", finish);

  activeFlights += 1;

  // initial kick toward the live position (scroll-margin respected)
  const live = document.getElementById(id) ?? el;
  window.scrollTo({
    top: window.scrollY + live.getBoundingClientRect().top - marginOf(live),
    behavior,
  });

  const step = () => {
    if (done) return;
    const node = document.getElementById(id) ?? el;
    const y = window.scrollY;
    const moving = Math.abs(y - lastY) > 0.5;
    lastY = y;
    stillFrames = moving ? 0 : stillFrames + 1;

    // only correct once the scroll engine has settled for a couple of
    // frames — re-issuing mid-flight would cancel and restart the animation
    const offset = node.getBoundingClientRect().top - marginOf(node);
    if (Math.abs(offset) > 1 && stillFrames >= 2) {
      window.scrollTo({ top: y + offset, behavior });
      stillFrames = 0;
    } else if (Math.abs(offset) <= 1 && stillFrames >= 8) {
      finish(); // converged
      return;
    }
    if (performance.now() - t0 > maxMs) {
      finish();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

/** Smooth-scroll helper that also keeps the URL hash in sync (no jump). */
export function scrollToAnchorWithHash(id: string, opts?: { maxMs?: number }): void {
  scrollToAnchorSafe(id, opts);
  try {
    window.history.replaceState(null, "", `#${id}`);
  } catch {
    /* history unavailable (e.g. sandboxed iframe) — ignore */
  }
}

/**
 * onClick handler for native `<a href="#…">` anchors — upgrades them to the
 * shift-resilient scroll while preserving link semantics (right-click,
 * middle-click, "open in new tab" all keep working via the untouched href).
 */
export function anchorClickHandler(id: string) {
  return (event: { preventDefault(): void }) => {
    event.preventDefault();
    scrollToAnchorWithHash(id);
  };
}
