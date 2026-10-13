"use client";

import { LayoutGrid, type LucideIcon } from "lucide-react";
import {
  Biohazard,
  Bot,
  Bug,
  Cloud,
  DatabaseZap,
  Fish,
  LockKeyhole,
  Smartphone,
  Skull,
} from "lucide-react";
import { CATEGORIES } from "@/lib/cyber/categories";
import { cn } from "@/lib/utils";

export interface CategoryCount {
  id: string;
  count: number;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  ransomware: LockKeyhole,
  vulnerabilities: Bug,
  breaches: DatabaseZap,
  apt: Skull,
  malware: Biohazard,
  phishing: Fish,
  "ai-security": Bot,
  cloud: Cloud,
  "mobile-iot": Smartphone,
};

interface CategoryBarProps {
  counts: CategoryCount[];
  active: string;
  onSelect: (categoryId: string) => void;
  onOpenAbout: () => void;
}

/**
 * Horizontal pill strip — threat categories derived live from the
 * incoming stream. Scrolls horizontally on small screens; comfortable
 * 36px+ touch targets per Fitts's law.
 */
export function CategoryBar({ counts, active, onSelect }: CategoryBarProps) {
  const countMap = new Map(counts.map((c) => [c.id, c.count]));

  const pills = [
    { id: "all", label: "All Signals", count: countMap.get("all") ?? 0 },
    ...CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      count: countMap.get(category.id) ?? 0,
    })),
  ];

  return (
    <div className="glass-bar no-scrollbar w-full overflow-x-auto border-t border-cyber-border/50 py-2">
      <nav
        className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-1 sm:px-6 lg:px-8"
        aria-label="Threat categories"
      >
        {pills.map((pill) => {
          const Icon = CATEGORY_ICONS[pill.id] ?? LayoutGrid;
          const selected = active === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              data-category={pill.id}
              onClick={() => onSelect(pill.id)}
              aria-pressed={selected}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider transition-all duration-150",
                selected
                  ? "border-cyber-teal/70 bg-cyber-teal/15 text-cyber-teal shadow-[0_0_14px_rgba(var(--teal-rgb),0.18)]"
                  : "border-cyber-border bg-cyber-surface text-mid hover:border-cyber-teal/50 hover:text-hi",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", selected ? "text-cyber-teal" : "text-low")} />
              {pill.label}
              <span
                className={cn(
                  "digital rounded-md px-1.5 py-px text-[9px]",
                  selected ? "bg-cyber-teal/20 text-cyber-teal" : "bg-cyber-raised text-low",
                )}
              >
                {pill.count}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
