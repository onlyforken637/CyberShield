"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, BookOpenText, Info, Plus, Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import { scrollToAnchorSafe } from "@/lib/cyber/scroll";

/**
 * Theme-aware floating action button — a quick-navigation speed dial.
 *
 * Dark mode: turquoise→aqua gradient core with the neon HUD glow language.
 * Light mode: red→deep-red gradient with a soft crimson elevation shadow.
 * Both looks derive from the shared cyber tokens, so they flip automatically
 * with the `.dark` / `.light` class on <html>.
 *
 * Dial actions: Threat Feed · Resources · About · Back to Top.
 */

interface FabAction {
  label: string;
  icon: ReactNode;
  run: () => void;
}

export function FloatingNav({ onOpenAbout }: { onOpenAbout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLButtonElement>(null);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const scrollToAnchor = useCallback((id: string) => {
    // shift-resilient: the feed streams extra cards while the scroll is in
    // flight — a one-shot scrollIntoView would land short of the target
    scrollToAnchorSafe(id);
  }, []);

  const actions: FabAction[] = [
    { label: "Threat Feed", icon: <Rss className="h-4 w-4" />, run: () => scrollToAnchor("main-feed") },
    { label: "Resources", icon: <BookOpenText className="h-4 w-4" />, run: () => scrollToAnchor("resources") },
    { label: "About", icon: <Info className="h-4 w-4" />, run: onOpenAbout },
    { label: "Back to Top", icon: <ArrowUp className="h-4 w-4" />, run: scrollToTop },
  ];

  /* dismiss on outside pointer press or Escape (focus returns to the FAB) */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        mainRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-40 flex flex-col items-end gap-3 sm:right-6 md:bottom-6 print:hidden"
    >
      {/* speed-dial items — stagger outward from the FAB core */}
      {open && (
        <div aria-label="Quick navigation" className="flex flex-col items-end gap-2.5">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.run();
              }}
              className={cn(
                "fab-item-in group flex items-center gap-2.5 rounded-full border border-cyber-border bg-cyber-surface/95 py-1.5 pr-1.5 pl-4 text-[11px] font-bold uppercase tracking-wider text-mid backdrop-blur-md",
                "shadow-[0_6px_18px_-8px_rgba(24,24,27,0.22)] transition-colors hover:border-cyber-teal/60 hover:text-cyber-teal",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-cyber-bg focus-visible:outline-none",
                "dark:border-cyber-border-strong/70 dark:bg-cyber-surface/90 dark:shadow-[0_8px_22px_-8px_rgba(0,0,0,0.55)]",
              )}
              style={{ animationDelay: `${(actions.length - 1 - index) * 45}ms` }}
            >
              {action.label}
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyber-teal/10 text-cyber-teal transition-colors group-hover:bg-cyber-teal/20">
                {action.icon}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* FAB core */}
      <button
        ref={mainRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Quick navigation menu"
        title="Quick navigation"
        className={cn(
          "btn-accent relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full",
          "shadow-[0_10px_30px_-10px_rgba(var(--teal-rgb),0.5)]",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-cyber-bg focus-visible:outline-none",
          "dark:shadow-[var(--glow-teal),0_14px_34px_-12px_rgba(0,0,0,0.85)]",
        )}
      >
        <Plus
          className={cn(
            "h-6 w-6 transition-transform duration-300 motion-reduce:transition-none",
            open && "rotate-45",
          )}
        />
        {!open && (
          <span
            aria-hidden="true"
            className="cyber-ping pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-3 w-3 text-cyber-bg"
          >
            <span className="relative inline-flex h-3 w-3 rounded-full bg-cyber-bg" />
          </span>
        )}
      </button>
    </div>
  );
}
