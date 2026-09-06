"use client";

import { useEffect, useState } from "react";
import { ShieldHalf } from "lucide-react";
import { cn } from "@/lib/utils";
import { hashCode, mulberry32 } from "@/lib/cyber/utils";

/**
 * Dynamically generated fallback article thumbnail.
 * Renders a deterministic matrix-code rain with a glowing security
 * shield sigil on an offscreen canvas and serves it as a data URL.
 */
export function MatrixThumb({
  seed,
  className,
  glyphScale = 1,
}: {
  seed: string;
  className?: string;
  glyphScale?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const canvas = document.createElement("canvas");
      const width = 480;
      const height = Math.round(300 * glyphScale);
      canvas.width = width;
      canvas.height = height;
      drawMatrix(canvas, seed);
      const dataUrl = canvas.toDataURL("image/png");
      timer = setTimeout(() => {
        if (!cancelled) setUrl(dataUrl);
      }, 0);
    } catch {
      timer = setTimeout(() => {
        if (!cancelled) setUrl(null);
      }, 0);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [seed, glyphScale]);

  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border-cyber-border bg-cyber-raised",
          className,
        )}
        aria-hidden="true"
      >
        <ShieldHalf className="h-5 w-5 text-cyber-teal/40" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={cn("object-cover", className)}
      draggable={false}
    />
  );
}

function drawMatrix(canvas: HTMLCanvasElement, seed: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const rand = mulberry32(hashCode(seed) || 1);

  ctx.fillStyle = "#0B0F19";
  ctx.fillRect(0, 0, w, h);

  // faint grid
  ctx.strokeStyle = "rgba(34, 47, 71, 0.35)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // matrix glyph rain
  const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789<>/\\|=+*#".split("");
  ctx.font = "13px ui-monospace, Menlo, monospace";
  ctx.textBaseline = "top";
  const colWidth = 15;
  for (let x = 6; x < w; x += colWidth) {
    const trail = 5 + Math.floor(rand() * 12);
    const head = Math.floor(rand() * (h / 17));
    for (let i = 0; i < trail; i++) {
      const row = head - i;
      if (row < 0) continue;
      const y = row * 17;
      if (y > h - 16) continue;
      const alpha = i === 0 ? 0.95 : Math.max(0.05, 0.5 * (1 - i / trail));
      ctx.shadowBlur = i === 0 ? 8 : 0;
      ctx.shadowColor = "#00E5FF";
      ctx.fillStyle = i === 0 ? "#7CF4FF" : `rgba(0, 229, 255, ${alpha.toFixed(3)})`;
      ctx.fillText(glyphs[Math.floor(rand() * glyphs.length)], x, y);
    }
  }
  ctx.shadowBlur = 0;

  // central shield sigil
  const cx = w / 2;
  const cy = h / 2 - 4;
  const sw = Math.min(88, w * 0.22);
  const sh = sw * 1.24;

  ctx.strokeStyle = "rgba(0, 229, 255, 0.92)";
  ctx.lineWidth = 3.2;
  ctx.lineJoin = "round";
  ctx.shadowColor = "#00E5FF";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(cx, cy - sh / 2);
  ctx.lineTo(cx + sw / 2, cy - sh / 2 + sh * 0.14);
  ctx.lineTo(cx + sw / 2, cy + sh * 0.12);
  ctx.quadraticCurveTo(cx + sw / 2, cy + sh / 2 - sh * 0.1, cx, cy + sh / 2);
  ctx.quadraticCurveTo(cx - sw / 2, cy + sh / 2 - sh * 0.1, cx - sw / 2, cy + sh * 0.12);
  ctx.lineTo(cx - sw / 2, cy - sh / 2 + sh * 0.14);
  ctx.closePath();
  ctx.stroke();

  // verification check inside the shield
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - sw * 0.24, cy - sh * 0.02);
  ctx.lineTo(cx - sw * 0.07, cy + sh * 0.16);
  ctx.lineTo(cx + sw * 0.28, cy - sh * 0.2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}
