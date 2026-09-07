"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOURCES,
  fetchRss2Json,
  mapFeedItem,
  type FeedItem,
  type FeedVia,
  type RawRss2JsonItem,
  type SourceConfig,
} from "@/lib/cyber/feeds";
import { normalizeKey } from "@/lib/cyber/utils";

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

type SettledResult = {
  source: SourceConfig;
  via: FeedVia | null;
  items: FeedItem[];
  error: string | null;
};

function initialFeedStates(): Record<string, FeedRuntimeState> {
  return Object.fromEntries(
    SOURCES.map((source) => [
      source.id,
      { status: "idle", via: null, count: 0, lastSync: null } satisfies FeedRuntimeState,
    ]),
  );
}

/**
 * Live cybersecurity news engine.
 *
 * Re-fetches every integrated RSS source through the public RSS→JSON
 * converter (browser-direct first, server relay fallback), dedupes
 * cross-source stories, and exposes per-feed runtime telemetry so the
 * sidebar tracker can toggle sources in and out of the stream.
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

    const settled: SettledResult[] = await Promise.all(
      SOURCES.map(async (source): Promise<SettledResult> => {
        try {
          const { via, items: rawItems } = await fetchRss2Json(source.rss);
          const mapped = rawItems
            .map((raw: RawRss2JsonItem) => mapFeedItem(raw, source))
            .filter((item: FeedItem) => item.title && item.link);
          return { source, via, items: mapped, error: null };
        } catch (error) {
          return {
            source,
            via: null,
            items: [],
            error: error instanceof Error ? error.message : "uplink failure",
          };
        }
      }),
    );

    const seen = new Set<string>();
    const merged: FeedItem[] = [];
    let online = 0;
    for (const result of settled) {
      if (!result.error && result.items.length > 0) online += 1;
      for (const item of result.items) {
        const key = normalizeKey(item.link);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        merged.push(item);
      }
    }
    merged.sort((a, b) => b.publishedAt - a.publishedAt);

    const nextStates: Record<string, FeedRuntimeState> = {};
    for (const result of settled) {
      nextStates[result.source.id] = {
        status: result.error ? "offline" : result.items.length > 0 ? "online" : "empty",
        via: result.via,
        count: result.items.length,
        lastSync: Date.now(),
        error: result.error ?? undefined,
      };
    }

    setItems(merged);
    setFeedStates(nextStates);
    setLastSyncAt(Date.now());
    setSyncing(false);
    syncingRef.current = false;

    return { ok: online > 0, started: true, total: merged.length, online };
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
