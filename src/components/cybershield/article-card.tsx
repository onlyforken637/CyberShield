"use client";

import { useState } from "react";
import { ChevronRight, Clock3, ImageOff } from "lucide-react";
import { MatrixThumb } from "@/components/cybershield/matrix-thumb";
import type { FeedItem } from "@/lib/cyber/feeds";
import { timeAgo } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

/**
 * Live article thumbnail: uses the feed-provided image when present and
 * silently degrades to the generated matrix-code placeholder on error.
 */
export function ArticleThumb({
  item,
  className,
  glyphScale = 1,
}: {
  item: FeedItem;
  className?: string;
  glyphScale?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!item.imageUrl || failed) {
    return (
      <div className={cn("relative", className)}>
        <MatrixThumb seed={item.id} className={cn("h-full w-full", className)} glyphScale={glyphScale} />
        <span
          className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-sm bg-cyber-bg/80 px-1 py-0.5 text-[7.5px] font-bold tracking-widest text-slate-500"
          title="No media in feed payload — generated matrix placeholder"
        >
          <ImageOff className="h-2 w-2" /> SYNTH
        </span>
      </div>
    );
  }

  return (
    <img
      src={item.imageUrl}
      alt={`Thumbnail for: ${item.title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
      draggable={false}
    />
  );
}

interface ArticleCardProps {
  item: FeedItem;
  selected: boolean;
  onOpen: (item: FeedItem) => void;
}

/**
 * Column B news card — thumbnail, source badge, author, relative time,
 * interactive headline, and a clean 2-sentence summary excerpt.
 */
export function ArticleCard({ item, selected, onOpen }: ArticleCardProps) {
  return (
    <article
      className={cn(
        "signal-sweep group relative rounded-md border bg-cyber-surface/70 transition-all duration-200",
        selected
          ? "border-cyber-teal/70 shadow-[0_0_18px_rgba(0,229,255,0.12)]"
          : "border-cyber-border/80 hover:border-cyber-teal/45 hover:bg-cyber-surface",
      )}
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="relative h-[74px] w-[112px] shrink-0 overflow-hidden rounded-sm border border-cyber-border/70 sm:h-[84px] sm:w-[132px]"
          aria-label={`Open investigation: ${item.title}`}
          tabIndex={-1}
        >
          <ArticleThumb
            item={item}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]"
          />
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] tracking-wider">
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 text-[8.5px] font-bold uppercase",
                item.accent.chip,
              )}
            >
              {item.sourceName}
            </span>
            <span className="max-w-[140px] truncate text-slate-500" title={item.author}>
              {item.author}
            </span>
            <span className="digital flex items-center gap-1 text-slate-500">
              <Clock3 className="h-2.5 w-2.5" />
              <span suppressHydrationWarning>{timeAgo(item.publishedAt)}</span>
            </span>
          </div>

          <h3 className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(item)}
              title={item.title}
              className="block w-full text-left text-[12.5px] font-bold leading-snug text-slate-100 transition-colors group-hover:text-cyber-teal line-clamp-2"
            >
              {item.title}
            </button>
          </h3>

          <p className="mt-1 hidden text-[10.5px] leading-relaxed text-slate-400 line-clamp-2 sm:block">
            {item.summary || "No summary excerpt available in the live payload."}
          </p>

          <div className="mt-auto hidden items-center justify-between pt-1.5 sm:flex">
            <span className="digital truncate text-[8.5px] tracking-wider text-slate-600">
              {item.categories.slice(0, 2).join(" · ") || item.sourceShort}
            </span>
            <span className="flex items-center gap-0.5 text-[8.5px] font-bold tracking-widest text-cyber-teal/0 transition-colors group-hover:text-cyber-teal/90">
              OPEN INVESTIGATION <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
