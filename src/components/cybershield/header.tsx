"use client";

import { Search, Menu } from "lucide-react";
import { CategoryBar, type CategoryCount } from "@/components/cybershield/category-bar";
import { Input } from "@/components/ui/input";

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
  return (
    <header className="sticky top-0 z-40 w-full border-b border-cyber-border/80 bg-cyber-bg/90 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[1600px] px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          {/* Brand */}
          <a
            href="#main-feed"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="CyberShield News home"
          >
            <span className="relative flex h-3.5 w-3.5">
              <span className="cyber-ping absolute inline-flex h-3.5 w-3.5 text-cyber-teal opacity-75">
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-cyber-teal" />
              </span>
            </span>
            <span className="whitespace-nowrap font-display text-lg font-black tracking-[0.18em] text-slate-100 sm:text-2xl">
              CYBER<span className="neon-teal">SHIELD</span>
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
