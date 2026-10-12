"use client";

import { Home, Info, Menu, RefreshCw } from "lucide-react";
import { CATEGORIES } from "@/lib/cyber/categories";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* ── Mobile bottom navigation bar ─────────────────────────────────── */

interface MobileBottomBarProps {
  syncing: boolean;
  onScrollTop: () => void;
  onOpenCategories: () => void;
  onManualSync: () => void;
  onOpenAbout: () => void;
}

/** App-style bottom navigation (Feed / Categories / Sync / About). */
export function MobileBottomBar({
  syncing,
  onScrollTop,
  onOpenCategories,
  onManualSync,
  onOpenAbout,
}: MobileBottomBarProps) {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-cyber-border bg-cyber-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <BottomButton icon={<Home className="h-5 w-5" />} label="Feed" onClick={onScrollTop} />
      <BottomButton
        icon={<Menu className="h-5 w-5" />}
        label="Categories"
        onClick={onOpenCategories}
      />
      <BottomButton
        icon={<RefreshCw className={cn("h-5 w-5", syncing && "animate-spin")} />}
        label={syncing ? "Syncing" : "Sync"}
        onClick={onManualSync}
        disabled={syncing}
      />
      <BottomButton icon={<Info className="h-5 w-5" />} label="About" onClick={onOpenAbout} />
    </nav>
  );
}

function BottomButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[48px] flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold uppercase tracking-wider text-low transition-colors hover:text-cyber-teal disabled:opacity-60 aria-pressed:text-cyber-teal"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ── Mobile category drawer (left sheet) ──────────────────────────── */

interface MobileCategoriesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: Record<string, number>;
  activeCategory: string;
  onSelectCategory: (categoryId: string) => void;
  onlineCount: number;
  totalSources: number;
}

export function MobileCategoriesSheet({
  open,
  onOpenChange,
  counts,
  activeCategory,
  onSelectCategory,
  onlineCount,
  totalSources,
}: MobileCategoriesSheetProps) {
  const pills = [
    { id: "all", label: "All Signals", count: counts["all"] ?? 0 },
    ...CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      count: counts[category.id] ?? 0,
    })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[85vw] max-w-[320px] border-cyber-border bg-cyber-surface p-5"
      >
        <SheetHeader className="border-b border-cyber-border p-0 pb-3 text-left">
          <SheetTitle className="font-display text-xs font-bold uppercase tracking-wider text-cyber-teal">
            Threat Categories
          </SheetTitle>
          <SheetDescription className="digital text-[10px] tracking-widest text-mid">
            {onlineCount}/{totalSources} STREAMS ONLINE · TAP TO SLICE THE FEED
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-2 overflow-y-auto pb-4">
          {pills.map((pill) => {
            const selected = activeCategory === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  onSelectCategory(pill.id);
                  onOpenChange(false);
                }}
                aria-pressed={selected}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3.5 py-3 text-[11.5px] font-bold uppercase tracking-wider transition-colors",
                  selected
                    ? "border-cyber-teal bg-cyber-teal/15 text-cyber-teal"
                    : "border-cyber-border bg-cyber-panel text-mid hover:border-cyber-teal/50 hover:text-hi",
                )}
              >
                {pill.label}
                <span
                  className={cn(
                    "digital rounded-md px-2 py-1 text-[9.5px]",
                    selected ? "bg-cyber-teal/20 text-cyber-teal" : "bg-cyber-raised text-low",
                  )}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
