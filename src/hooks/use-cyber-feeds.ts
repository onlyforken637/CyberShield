"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SOURCES, type FeedItem, type FeedVia } from "@/lib/cyber/feeds";

export type FeedRuntimeStatus = "idle" | "syncing" | "online" | "offline" | "empty";

export interface FeedRuntimeState {
  status: FeedRuntimeStatus;
  via: FeedVia | null;
  count: number;
  lastSync: number | null;
  error?: string;
}

export interface FeedSyncOutcome {
  ok: boolean;
  started: boolean;
  total: number;
  online: number;
}

interface NewsApiResponse {
  generatedAt?: number;
  items?: FeedItem[];
  sources?: Array<{
    id: string;
    status: "online" | "offline" | "empty";
    via: FeedVia;
    count: number;
    error?: string;
  }>;
  error?: string;
}

function initialFeedStates(): Record<string, FeedRuntimeState> {
  return Object.fromEntries(
    SOURCES.map((source) => [
      source.id,
      { status: "idle", via: null, count: 0, lastSync: null } satisfies FeedRuntimeState,
    ]),
  );
}

/**
 * Live cybersecurity news engine (client side).
 *
 * One call to our own /api/news returns the fully aggregated, deduped and
 * enriched stream for all 19 research streams — the server does the heavy
 * lifting (direct XML → converter failover, thumbnail extraction, analyst
 * briefs), the browser just renders it. Exposes per-feed runtime telemetry
 * so the sidebar tracker can toggle sources in and out of the stream.
 */
export function useCyberFeeds() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [feedStates, setFeedStates] = useState<Record<string, FeedRuntimeState>>(initialFeedStates);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const syncingRef = useRef(false);
  const bootedRef = useRef(false);

  const sync = useCallback(async (): Promise<FeedSyncOutcome> => {
    if (syncingRef.current) {
      return { ok: true, started: false, total: 0, online: 0 };
    }
    syncingRef.current = true;
    setSyncing(true);
    setFeedStates((prev) => {
      const next: Record<string, FeedRuntimeState> = {};
      for (const [id, state] of Object.entries(prev)) {
        next[id] = { ...state, status: "syncing", error: undefined };
      }
      return next;
    });

    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      if (!res.ok) throw new Error(`/api/news uplink HTTP ${res.status}`);
      const data = (await res.json()) as NewsApiResponse;
      if (!Array.isArray(data.items)) throw new Error(data.error ?? "invalid news payload");

      const nextStates: Record<string, FeedRuntimeState> = { ...initialFeedStates() };
      let online = 0;
      for (const source of data.sources ?? []) {
        nextStates[source.id] = {
          status: source.status,
          via: source.via ?? null,
          count: source.count,
          lastSync: data.generatedAt ?? Date.now(),
          error: source.error,
        };
        if (source.status === "online") online += 1;
      }

      setItems(data.items);
      setFeedStates(nextStates);
      setLastSyncAt(data.generatedAt ?? Date.now());
      return { ok: online > 0, started: true, total: data.items.length, online };
    } catch (error) {
      setFeedStates((prev) => {
        const next: Record<string, FeedRuntimeState> = {};
        for (const [id, state] of Object.entries(prev)) {
          next[id] = {
            ...state,
            status: "offline",
            error: error instanceof Error ? error.message : "uplink failure",
          };
        }
        return next;
      });
      return { ok: false, started: true, total: 0, online: 0 };
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    // defer first sync to a macrotask (avoids synchronous setState in effect)
    const kickoff = setTimeout(() => void sync(), 0);
    return () => clearTimeout(kickoff);
  }, [sync]);

  return { items, feedStates, syncing, lastSyncAt, sync };
}
