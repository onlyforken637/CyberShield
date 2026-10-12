"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FeedItem } from "@/lib/cyber/feeds";
import { stripHtml } from "@/lib/cyber/utils";
import { cn } from "@/lib/utils";

type VerdictState = "loading" | "done" | "error";

interface VerdictResponse {
  brief?: string;
  cached?: boolean;
  degraded?: boolean;
  model?: string;
  generatedAt?: string;
  error?: string;
}

/**
 * AI ANALYST VERDICT — a live GLM-generated SOC brief for the article under
 * investigation, revealed with a typewriter effect. Completed verdicts are
 * archived in SQLite, so repeat investigations resolve instantly (the chip
 * flips from LIVE ANALYSIS to FROM ARCHIVE).
 */
export function AIVerdictPanel({ item }: { item: FeedItem }) {
  const [state, setState] = useState<VerdictState>("loading");
  const [full, setFull] = useState("");
  const [shown, setShown] = useState("");
  const [cached, setCached] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const requestRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const requestId = ++requestRef.current;
      setState("loading");
      setFull("");
      setShown("");
      setError("");
      setDegraded(false);

      try {
        const res = await fetch("/api/brief", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            link: item.link,
            title: item.title,
            sourceName: item.sourceName,
            categoryIds: item.categoryIds,
            cves: item.intel.cves,
            orgs: item.intel.orgs,
            lede: item.intel.lede,
            highlights: item.intel.highlights,
            severity: item.intel.severity,
            excerpt: stripHtml(item.descriptionHtml).slice(0, 1600),
            force,
          }),
        });
        const data = (await res.json()) as VerdictResponse;
        if (!res.ok || !data.brief) throw new Error(data.error ?? "analyst uplink failed");
        if (requestId !== requestRef.current) return;
        setFull(data.brief);
        setCached(Boolean(data.cached));
        setDegraded(Boolean(data.degraded));
        setState("done");
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "analyst uplink failed");
        setState("error");
      }
    },
    [item],
  );

  // kick off the analysis once per mounted article
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    const kickoff = setTimeout(() => void load(false), 80);
    return () => clearTimeout(kickoff);
  }, [load]);

  // typewriter reveal
  useEffect(() => {
    if (state !== "done" || shown.length >= full.length) return;
    const timer = setInterval(() => {
      setShown((prev) => full.slice(0, Math.min(full.length, prev.length + 4)));
    }, 14);
    return () => clearInterval(timer);
  }, [state, shown, full]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success("Analyst verdict copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this context");
    }
  };

  return (
    <section className="space-y-3" aria-label="AI analyst verdict">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md border border-cyber-fuchsia/40 bg-cyber-fuchsia/10 px-2 py-0.5 text-[9px] font-black tracking-widest text-cyber-fuchsia">
          <Sparkles className="h-2.5 w-2.5" /> GLM ANALYST
        </span>
        {state === "done" && (
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[9px] font-bold tracking-widest",
              degraded
                ? "border-cyber-amber/40 bg-cyber-amber/10 text-cyber-amber"
                : cached
                  ? "border-cyber-border bg-cyber-surface text-mid"
                  : "border-cyber-green/40 bg-cyber-green/10 text-cyber-green",
            )}
          >
            {degraded ? "OFFLINE ANALYST" : cached ? "FROM ARCHIVE" : "LIVE ANALYSIS"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={state === "loading"}
            className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-surface px-2.5 py-1.5 text-[9.5px] font-bold tracking-widest text-mid transition-colors hover:border-cyber-fuchsia/50 hover:text-cyber-fuchsia disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", state === "loading" && "animate-spin")} />
            REANALYZE
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={state !== "done" || shown.length < full.length}
            className="flex items-center gap-1 rounded-lg border border-cyber-border bg-cyber-surface px-2.5 py-1.5 text-[9.5px] font-bold tracking-widest text-mid transition-colors hover:border-cyber-teal/50 hover:text-cyber-teal disabled:opacity-50"
          >
            {copied ? <Check className="h-3 w-3 text-cyber-green" /> : <Copy className="h-3 w-3" />}
            {copied ? "COPIED" : "COPY"}
          </button>
        </span>
      </div>

      {state === "loading" && (
        <div className="rounded-lg border border-cyber-border bg-cyber-bg p-4">
          <p className="digital flex items-center gap-2 text-[10px] tracking-widest text-cyber-fuchsia/90">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            RUNNING LIVE THREAT ANALYSIS…
          </p>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-2 w-1/3 animate-pulse rounded bg-cyber-raised" />
            <div className="h-2 w-full animate-pulse rounded bg-cyber-raised/70" />
            <div className="h-2 w-5/6 animate-pulse rounded bg-cyber-raised/50" />
            <div className="h-2 w-2/3 animate-pulse rounded bg-cyber-raised/40" />
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="rounded-md border border-cyber-crimson/40 bg-cyber-crimson/5 p-4">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-cyber-crimson">
            <TriangleAlert className="h-3.5 w-3.5" />
            ANALYST UPLINK FAILED
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-mid">{error}</p>
          <button
            type="button"
            onClick={() => void load(false)}
            className="mt-3.5 rounded-lg border border-cyber-teal/50 bg-cyber-teal/10 px-3.5 py-2 text-[10.5px] font-bold tracking-widest text-cyber-teal transition-colors hover:bg-cyber-teal/20"
          >
            RETRY ANALYSIS
          </button>
        </div>
      )}

      {state === "done" && degraded && (
        <p className="rounded-sm border border-cyber-amber/25 bg-cyber-amber/5 px-2.5 py-1.5 text-[9.5px] leading-relaxed tracking-wide text-cyber-amber/90">
          LIVE GLM UPLINK UNAVAILABLE FROM THIS DEPLOYMENT — SHOWING ON-DEVICE HEURISTIC ASSESSMENT.
          HIT REANALYZE TO RETRY THE LIVE UPLINK.
        </p>
      )}

      {state === "done" && <VerdictText text={shown} typing={shown.length < full.length} />}
    </section>
  );
}

/** Renders the verdict with its structured labels highlighted. */
function VerdictText({ text, typing }: { text: string; typing: boolean }) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return (
    <div className="cyber-grid-bg rounded-lg border border-cyber-fuchsia/25 bg-cyber-bg p-4 shadow-[inset_0_0_30px_rgba(232,121,249,0.04)]">
      <div className="space-y-2.5">
        {lines.map((line, index) => {
          const trimmed = line.trim();

          if (trimmed.startsWith("▸")) {
            return (
              <p key={index} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-mid">
                <span className="mt-[1px] shrink-0 text-[10px] text-cyber-amber" aria-hidden="true">
                  ▸
                </span>
                <span>{trimmed.replace(/^▸\s*/, "")}</span>
              </p>
            );
          }

          const separator = trimmed.indexOf(":");
          if (separator > 0 && separator < 34) {
            const label = trimmed.slice(0, separator + 1);
            const value = trimmed.slice(separator + 1).trim();
            const isSeverity = label.toUpperCase().startsWith("SEVERITY");
            return (
              <p key={index} className="text-[11.5px] leading-relaxed">
                <span
                  className={cn(
                    "digital mr-1.5 text-[9px] font-black tracking-widest",
                    isSeverity ? "text-cyber-crimson" : "text-cyber-fuchsia",
                  )}
                >
                  {label}
                </span>
                <span className="font-semibold text-hi">{value}</span>
              </p>
            );
          }

          return (
            <p key={index} className="text-[12.5px] leading-relaxed text-mid">
              {trimmed}
            </p>
          );
        })}
      </div>
      {typing && (
        <span className="type-caret ml-0.5 inline-block h-3.5 w-2 align-middle" aria-hidden="true" />
      )}
    </div>
  );
}
