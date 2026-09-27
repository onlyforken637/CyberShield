"use client";

import { useEffect, useRef } from "react";
import { Search, Menu } from "lucide-react";
import { CategoryBar, type CategoryCount } from "@/components/cybershield/category-bar";
import { Input } from "@/components/ui/input";
import { gsap, prefersReducedMotion, whenBooted } from "@/lib/cyber/gsap";

interface DashboardHeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
  categoryCounts: CategoryCount[];
  activeCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onOpenAbout: () => void;
  onOpenMobileNav: () => void;
}

/**
 * Sticky masthead — Orbitron brand lockup, instant search and the sleek
 * horizontal category pill strip.
 */
export function DashboardHeader({
  query,
  onQueryChange,
  categoryCounts,
  activeCategory,
  onSelectCategory,
  onOpenAbout,
  onOpenMobileNav,
}: DashboardHeaderProps) {
  const brandRef = useRef<HTMLAnchorElement>(null);

  /* kinetic brand: masked char rise after boot + hover wave */
  useEffect(() => {
    const brand = brandRef.current;
    if (!brand || prefersReducedMotion()) return;
    const segs = brand.querySelectorAll<HTMLElement>("[data-kinetic]");
    whenBooted(() => {
      gsap.fromTo(
        segs,
        { yPercent: 118 },
        { yPercent: 0, duration: 0.85, ease: "expo.out", stagger: 0.08, delay: 0.2 },
      );
    });
    const wave = () => {
      gsap.to(segs, {
        yPercent: -16,
        duration: 0.22,
        ease: "power2.out",
        stagger: 0.05,
        yoyo: true,
        repeat: 1,
        overwrite: true,
      });
    };
    brand.addEventListener("pointerenter", wave);
    return () => {
      brand.removeEventListener("pointerenter", wave);
      gsap.killTweensOf(segs);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-cyber-border/80 bg-cyber-bg/90 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <a
            ref={brandRef}
            href="#main-feed"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="CyberShield News home"
          >
            <span className="relative flex h-3.5 w-3.5">
              <span className="cyber-ping absolute inline-flex h-3.5 w-3.5 text-cyber-teal opacity-75">
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-cyber-teal" />
              </span>
            </span>
            <span className="shine-sweep whitespace-nowrap font-display text-lg font-black tracking-[0.18em] text-slate-100 sm:text-2xl">
              <span className="inline-block overflow-hidden align-bottom">
                <span data-kinetic className="inline-block will-change-transform">CYBER</span>
              </span>
              <span className="inline-block overflow-hidden align-bottom">
                <span data-kinetic className="text-gradient-cyber inline-block will-change-transform">SHIELD</span>
              </span>
            </span>
            <span className="ml-1 hidden border-l border-cyber-border pl-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 md:inline-block">
              NEWS
            </span>
          </a>

          {/* Right action cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search threats…"
                aria-label="Search live article stream"
                className="h-9 w-36 border-cyber-border bg-cyber-surface pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:border-cyber-teal focus-visible:ring-cyber-teal/40 sm:w-52 md:w-72"
              />
            </div>

            <button
              type="button"
              onClick={onOpenMobileNav}
              aria-label="Open categories menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyber-border bg-cyber-surface text-slate-400 transition-colors hover:border-cyber-teal hover:text-cyber-teal lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated category bar */}
      <CategoryBar
        counts={categoryCounts}
        active={activeCategory}
        onSelect={onSelectCategory}
        onOpenAbout={onOpenAbout}
      />
    </header>
  );
}
