"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/cybershield/header";
import { Sidebar } from "@/components/cybershield/sidebar";
import { FeedColumn } from "@/components/cybershield/feed-column";
import { ThreatPanel } from "@/components/cybershield/threat-panel";
import {
  InvestigationDrawer,
  type DrawerTarget,
} from "@/components/cybershield/investigation-drawer";
import { useCyberFeeds } from "@/hooks/use-cyber-feeds";
import { useCisaCatalog } from "@/hooks/use-cisa-catalog";
import type { FeedItem } from "@/lib/cyber/feeds";
import type { CisaVuln } from "@/lib/cyber/cisa";
import { formatUtc } from "@/lib/cyber/utils";

/** Auto-refresh TTL — 12 minutes, per the CyberShield sync engine spec. */
const SYNC_TTL_MS = 12 * 60 * 1000;

type SyncMode = "initial" | "auto" | "manual";

export default function CyberShieldPage() {
  const { items, feedStates, syncing: feedsSyncing, lastSyncAt: feedsLastSync, sync } = useCyberFeeds();
  const {
    metrics,
    via: cisaVia,
    syncing: cisaSyncing,
    error: cisaError,
    lastSyncAt: cisaLastSync,
    refresh: refreshCisa,
  } = useCisaCatalog();

  const [query, setQuery] = useState("");
  const [activeTopics, setActiveTopics] = useState<string[]>([]);
  const [enabledSources, setEnabledSources] = useState<string[]>(["bleepingcomputer", "thehackernews", "threatpost"]);
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nextSyncAt, setNextSyncAt] = useState<number | null>(null);

  const bootRef = useRef(false);
  const chainRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── sync orchestration ──────────────────────────────────────── */
  const syncAll = useCallback(
    async (mode: SyncMode) => {
      const [feedOutcome, cisaOutcome] = await Promise.all([sync(), refreshCisa()]);

      if (mode !== "initial") {
        if (feedOutcome.ok && cisaOutcome.ok) {
          toast.success("CyberShield Stream Synced Successfully", {
            description: `${feedOutcome.total} live signals re-synced · CISA KEV v${cisaOutcome.version ?? "?"} updated`,
          });
        } else if (!feedOutcome.ok && !cisaOutcome.ok) {
          toast.error("Stream sync degraded", {
            description: "News and KEV uplinks unreachable — retrying next cycle.",
          });
        } else if (!feedOutcome.ok) {
          toast.warning("News uplinks degraded", {
            description: "KEV catalog synced; RSS converters unreachable.",
          });
        } else {
          toast.warning("KEV uplink blocked", {
            description: "News streams synced; CISA catalog unreachable from this network.",
          });
        }
      }
      return { feedOutcome, cisaOutcome };
    },
    [sync, refreshCisa],
  );

  // boot + self-chaining 12-minute TTL loop
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    const scheduleNext = () => {
      chainRef.current = setTimeout(async () => {
        await syncAll("auto");
        setNextSyncAt(Date.now() + SYNC_TTL_MS);
        scheduleNext();
      }, SYNC_TTL_MS);
    };

    void (async () => {
      await syncAll("initial");
      setNextSyncAt(Date.now() + SYNC_TTL_MS);
      scheduleNext();
    })();

    return () => {
      if (chainRef.current) clearTimeout(chainRef.current);
    };
  }, [syncAll]);

  const handleManualSync = useCallback(() => {
    void (async () => {
      await syncAll("manual");
      setNextSyncAt(Date.now() + SYNC_TTL_MS);
    })();
  }, [syncAll]);

  const handleRetryKev = useCallback(() => {
    void (async () => {
      const outcome = await refreshCisa();
      if (outcome.ok) {
        toast.success("CISA KEV uplink restored", {
          description: `Catalog v${outcome.version ?? "?"} synced — ${outcome.total ?? 0} entries live.`,
        });
      } else {
        toast.error("KEV uplink still blocked", { description: "Will retry on next sync cycle." });
      }
    })();
  }, [refreshCisa]);

  /* ── filter context (Column A → Column B) ────────────────────── */
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!enabledSources.includes(item.sourceId)) return false;
      if (
        activeTopics.length > 0 &&
        !activeTopics.some((topic) => item.searchBlob.includes(topic.toLowerCase()))
      ) {
        return false;
      }
      if (q && !item.searchBlob.includes(q)) return false;
      return true;
    });
  }, [items, enabledSources, activeTopics, query]);

  const toggleSource = useCallback((sourceId: string) => {
    setEnabledSources((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId],
    );
  }, []);

  const toggleTopic = useCallback((topic: string) => {
    setActiveTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }, []);

  const clearFilters = useCallback(() => {
    setQuery("");
    setActiveTopics([]);
    setEnabledSources(["bleepingcomputer", "thehackernews", "threatpost"]);
  }, []);

  /* ── investigation drawer ────────────────────────────────────── */
  const openArticle = useCallback((item: FeedItem) => {
    setTarget({ kind: "article", item });
    setDrawerOpen(true);
  }, []);

  const openVuln = useCallback((vuln: CisaVuln) => {
    setTarget({ kind: "vuln", item: vuln });
    setDrawerOpen(true);
  }, []);

  const booting = items.length === 0 && feedsSyncing;
  const selectedId = target?.kind === "article" ? target.item.id : null;

  return (
    <div className="flex min-h-dvh flex-col bg-cyber-bg lg:h-dvh lg:overflow-hidden">
      <DashboardHeader
        syncing={feedsSyncing || cisaSyncing}
        lastSyncAt={feedsLastSync}
        nextSyncAt={nextSyncAt}
        onManualSync={handleManualSync}
      />

      <main className="mx-auto w-full max-w-[1920px] flex-1 lg:min-h-0">
        <div className="grid grid-cols-1 gap-3 p-3 lg:h-full lg:grid-cols-[280px_minmax(0,1fr)_380px]">
          {/* Column A */}
          <aside aria-label="Filter context sidebar" className="order-2 lg:order-1 lg:min-h-0 lg:overflow-y-auto cyber-scroll lg:pr-1">
            <Sidebar
              items={items}
              feedStates={feedStates}
              enabledSources={enabledSources}
              onToggleSource={toggleSource}
              activeTopics={activeTopics}
              onToggleTopic={toggleTopic}
              onResetFilters={clearFilters}
            />
          </aside>

          {/* Column B */}
          <section aria-label="Live news stream" className="order-1 flex min-h-0 flex-col lg:order-2">
            <FeedColumn
              items={filteredItems}
              totalCount={items.length}
              query={query}
              onQueryChange={setQuery}
              activeTopics={activeTopics}
              onRemoveTopic={(topic) => toggleTopic(topic)}
              enabledSourceCount={enabledSources.length}
              onClearFilters={clearFilters}
              booting={booting}
              selectedId={selectedId}
              onOpenArticle={openArticle}
            />
          </section>

          {/* Column C */}
          <aside aria-label="Threat intelligence panel" className="order-3 lg:min-h-0 lg:overflow-y-auto cyber-scroll lg:pr-1">
            <ThreatPanel
              metrics={metrics}
              via={cisaVia}
              syncing={cisaSyncing}
              error={cisaError}
              lastSyncAt={cisaLastSync}
              onRetry={handleRetryKev}
              onOpenVuln={openVuln}
            />
          </aside>
        </div>
      </main>

      {/* sticky footer — mt-auto keeps it pinned on short pages */}
      <footer className="mt-auto shrink-0 border-t border-cyber-border bg-cyber-panel/70 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="digital text-[8.5px] tracking-[0.2em] text-slate-600">
            CYBER_SHIELD v2.4.1 // SOC-GRID BUILD 8842 // SECOPS MONITOR
          </span>
          <span className="digital text-[8.5px] tracking-[0.2em] text-slate-700">
            UPLINKS: RSS2JSON · CISA KEV // 100% LIVE TELEMETRY // NO MOCK DATA · LAST BOOT SYNC{" "}
            {feedsLastSync ? formatUtc(feedsLastSync) : "—"}
          </span>
        </div>
      </footer>

      <InvestigationDrawer target={target} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
