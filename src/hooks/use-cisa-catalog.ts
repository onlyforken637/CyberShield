"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeCisaMetrics,
  fetchCisaCatalog,
  type CisaCatalog,
  type CisaMetrics,
  type CisaVia,
} from "@/lib/cyber/cisa";

export interface CisaSyncOutcome {
  ok: boolean;
  started: boolean;
  total?: number;
  version?: string;
}

/**
 * Live CISA KEV engine.
 *
 * Pulls the official catalog (browser-direct first, relay/mirror fallback)
 * and derives every Live Metric from the real-time `vulnerabilities` array.
 */
export function useCisaCatalog() {
  const [catalog, setCatalog] = useState<CisaCatalog | null>(null);
  const [via, setVia] = useState<CisaVia | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const syncingRef = useRef(false);
  const bootedRef = useRef(false);

  const refresh = useCallback(async (): Promise<CisaSyncOutcome> => {
    if (syncingRef.current) return { ok: true, started: false };
    syncingRef.current = true;
    setSyncing(true);
    try {
      const { catalog: fresh, via: newVia } = await fetchCisaCatalog();
      setCatalog(fresh);
      setVia(newVia);
      setError(null);
      setLastSyncAt(Date.now());
      return {
        ok: true,
        started: true,
        total: fresh.vulnerabilities.length,
        version: fresh.catalogVersion,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "KEV uplink failure");
      return { ok: false, started: true };
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    // defer first sync to a macrotask (avoids synchronous setState in effect)
    const kickoff = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(kickoff);
  }, [refresh]);

  const metrics: CisaMetrics | null = useMemo(
    () => (catalog ? computeCisaMetrics(catalog) : null),
    [catalog],
  );

  return { metrics, via, syncing, error, lastSyncAt, refresh };
}
