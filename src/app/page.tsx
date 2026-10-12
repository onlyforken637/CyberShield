"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AboutModal } from "@/components/cybershield/about-modal";
import { BootOverlay } from "@/components/cybershield/boot-overlay";
import { DashboardHeader } from "@/components/cybershield/header";
import { FeedColumn } from "@/components/cybershield/feed-column";
import { InvestigationDrawer, type DrawerTarget } from "@/components/cybershield/investigation-drawer";
import { MobileBottomBar, MobileCategoriesSheet } from "@/components/cybershield/mobile-nav";
import { ResourcesSection } from "@/components/cybershield/resources-section";
import { Sidebar } from "@/components/cybershield/sidebar";
import { Ticker } from "@/components/cybershield/ticker";
import { TopBar } from "@/components/cybershield/top-bar";
import { useCyberFeeds } from "@/hooks/use-cyber-feeds";
import { useCisaCatalog } from "@/hooks/use-cisa-catalog";
import { gsap, ScrollTrigger, prefersReducedMotion, whenBooted } from "@/lib/cyber/gsap";
import { HIGH_PRIORITY_CATEGORY_IDS, CATEGORY_MAP } from "@/lib/cyber/categories";
import type { FeedItem } from "@/lib/cyber/feeds";
import type { CisaVuln } from "@/lib/cyber/cisa";
import { SOURCES } from "@/lib/cyber/feeds";

/** Auto-refresh TTL — 12 minutes, per the CyberShield sync engine spec. */
const SYNC_TTL_MS = 12 * 60 * 1000;

type SyncMode = "initial" | "auto" | "manual";

const ALL_SOURCE_IDS = SOURCES.map((source) => source.id);

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
  const [activeCategory, setActiveCategory] = useState("all");
  const [enabledSources, setEnabledSources] = useState<string[]>(ALL_SOURCE_IDS);
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [nextSyncAt, setNextSyncAt] = useState<number | null>(null);

  const bootRef = useRef(false);
  const chainRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* ── GSAP exhibition choreography (gated on the boot overlay) ── */
  // intro cascade: utility bar → ticker → feed+analytics → footer
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>("[data-intro]");
      if (targets.length === 0) return;
      gsap.set(targets, { opacity: 0, y: 24 });
      whenBooted(() => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.95,
          ease: "expo.out",
          stagger: 0.09,
          delay: 0.3,
          clearProps: "transform,opacity",
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // scroll reveals for the analytics cards (sidebar + below-fold panels)
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const elements = gsap.utils.toArray<HTMLElement>("[data-reveal]");
    if (elements.length === 0) return;
    let batch: ScrollTrigger[] = [];
    gsap.set(elements, { opacity: 0, y: 30 });
    whenBooted(() => {
      batch = ScrollTrigger.batch(elements, {
        start: "top 94%",
        once: true,
        onEnter: (nodes) =>
          gsap.to(nodes, {
            opacity: 1,
            y: 0,
            duration: 0.9,
            ease: "expo.out",
            stagger: 0.09,
            overwrite: true,
            clearProps: "transform",
          }),
      });
    });
    return () => {
      batch.forEach((trigger) => trigger.kill());
      gsap.set(elements, { clearProps: "all" });
      ScrollTrigger.refresh();
    };
  }, []);

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

  /* ── live telemetry derived from feed states ─────────────────── */
  const onlineCount = useMemo(
    () => Object.values(feedStates).filter((state) => state.status === "online").length,
    [feedStates],
  );

  /* ── category counts (global, from the live stream) ──────────── */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>([["all", items.length]]);
    for (const item of items) {
      for (const categoryId of item.categoryIds) {
        counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
      }
    }
    return [...counts.entries()].map(([id, count]) => ({ id, count }));
  }, [items]);

  const categoryCountMap = useMemo(
    () => Object.fromEntries(categoryCounts.map((c) => [c.id, c.count])),
    [categoryCounts],
  );

  /* ── filter engine: sources ∪ category ∪ topics ∪ search ─────── */
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!enabledSources.includes(item.sourceId)) return false;
      if (activeCategory !== "all" && !item.categoryIds.includes(activeCategory)) return false;
      if (
        activeTopics.length > 0 &&
        !activeTopics.some((topic) => item.searchBlob.includes(topic.toLowerCase()))
      ) {
        return false;
      }
      if (q && !item.searchBlob.includes(q)) return false;
      return true;
    });
  }, [items, enabledSources, activeCategory, activeTopics, query]);

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
    setActiveCategory("all");
    setEnabledSources(ALL_SOURCE_IDS);
  }, []);

  const scrollToFeed = useCallback(() => {
    document.getElementById("main-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ── drawers ─────────────────────────────────────────────────── */
  const openArticle = useCallback((item: FeedItem) => {
    setTarget({ kind: "article", item });
    setDrawerOpen(true);
  }, []);

  const openVuln = useCallback((vuln: CisaVuln) => {
    setTarget({ kind: "vuln", item: vuln });
    setDrawerOpen(true);
  }, []);

  const selectCategoryAndFocus = useCallback(
    (categoryId: string) => {
      setActiveCategory(categoryId);
      scrollToFeed();
    },
    [scrollToFeed],
  );

  const booting = items.length === 0 && feedsSyncing;
  const selectedId = target?.kind === "article" ? target.item.id : null;
  const syncing = feedsSyncing || cisaSyncing;

  return (
    <div
      ref={rootRef}
      className="flex min-h-dvh flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
    >
      {/* cinematic boot preloader (once per session) */}
      <BootOverlay />

      {/* Skip link for keyboard users */}
      <a
        href="#main-feed"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-cyber-teal focus:px-4 focus:py-2 focus:font-semibold focus:text-cyber-bg"
      >
        Skip to content
      </a>

      <TopBar onlineCount={onlineCount} nextSyncAt={nextSyncAt} onOpenAbout={() => setAboutOpen(true)} />

      <DashboardHeader
        query={query}
        onQueryChange={setQuery}
        categoryCounts={categoryCounts}
        activeCategory={activeCategory}
        onSelectCategory={selectCategoryAndFocus}
        onOpenAbout={() => setAboutOpen(true)}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />

      <Ticker items={items} onOpenArticle={openArticle} />

      {/* ── Main layout: feed + sidebar analytics ─────────────────── */}
      <main data-intro className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[1fr_340px] lg:gap-10 xl:grid-cols-[1fr_380px]">
          {/* Feed column */}
          <section id="main-feed" className="w-full min-w-0 scroll-mt-36" aria-label="Threat feed">
            <FeedColumn
              items={filteredItems}
              totalCount={items.length}
              onlineCount={onlineCount}
              totalSources={SOURCES.length}
              lastSyncAt={feedsLastSync}
              syncing={feedsSyncing}
              onManualSync={handleManualSync}
              query={query}
              onQueryChange={setQuery}
              activeTopics={activeTopics}
              onRemoveTopic={(topic) => toggleTopic(topic)}
              activeCategory={activeCategory}
              onSelectCategory={selectCategoryAndFocus}
              enabledSourceCount={enabledSources.length}
              onClearFilters={clearFilters}
              booting={booting}
              selectedId={selectedId}
              onOpenArticle={openArticle}
            />
          </section>

          {/* Sidebar analytics column */}
          <aside className="w-full space-y-6" aria-label="Sidebar analytics">
            <Sidebar
              items={items}
              feedStates={feedStates}
              enabledSources={enabledSources}
              onToggleSource={toggleSource}
              activeTopics={activeTopics}
              onToggleTopic={toggleTopic}
              onClearTopics={() => setActiveTopics([])}
              onOpenVuln={openVuln}
              metrics={metrics}
              via={cisaVia}
              syncing={cisaSyncing}
              error={cisaError}
              lastSyncAt={cisaLastSync}
              onRetry={handleRetryKev}
            />
          </aside>
        </div>
      </main>

      {/* ── Mission resources: docs · deck · film ─────────────────── */}
      <ResourcesSection />

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer data-intro className="mt-auto w-full border-t border-cyber-border/80 bg-cyber-panel/50 pb-8 pt-12 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="mb-10 grid grid-cols-1 gap-10 border-b border-cyber-border/60 pb-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Col 1: brand & status */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="CyberShield logo"
                  className="h-9 w-9 rounded-xl border border-cyber-border object-cover"
                />
                <span className="font-display text-xl font-black tracking-wider text-hi">
                  CYBER<span className="brand-gradient">SHIELD</span>
                </span>
              </div>
              <p className="text-[12.5px] leading-relaxed text-mid">
                Real-time threat intelligence ecosystem parsing {SOURCES.length}+ cybersecurity
                research blogs, vulnerability feeds, and nation-state advisories in real time.
              </p>
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyber-teal/30 bg-cyber-teal/10 px-3 py-1.5 text-[10px] font-bold text-cyber-teal">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyber-teal" />
                  {onlineCount}/{SOURCES.length} STREAMS ONLINE
                </span>
              </div>
            </div>

            {/* Col 2: high priority intel */}
            <div>
              <h3 className="mb-4 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-mid">
                High Priority Intel
              </h3>
              <ul className="space-y-2.5 text-[12.5px] text-mid">
                {HIGH_PRIORITY_CATEGORY_IDS.map((categoryId) => (
                  <li key={categoryId}>
                    <button
                      type="button"
                      onClick={() => selectCategoryAndFocus(categoryId)}
                      className="transition-colors hover:text-cyber-teal"
                    >
                      • {CATEGORY_MAP[categoryId]?.label ?? categoryId}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: intel snapshot */}
            <div>
              <h3 className="mb-4 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-mid">
                Intel Snapshot
              </h3>
              <div className="space-y-2.5 text-[12px] text-mid">
                {[
                  ["Update Frequency:", "12 MIN TTL"],
                  ["Primary Proxy:", "MULTI-FAILOVER"],
                  ["Intel Engine:", "SERVER ENRICHMENT GRID"],
                  ["License:", "MIT OPEN SOURCE"],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`flex justify-between border-b border-cyber-border/40 pb-2 ${index === 3 ? "border-b-0" : ""}`}
                  >
                    <span>{label}</span>
                    <span className={`digital font-bold ${index === 3 ? "text-hi" : "text-cyber-teal"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 4: creator */}
            <div>
              <h3 className="mb-4 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-mid">
                The Creator
              </h3>
              <div className="rounded-xl border border-cyber-teal/25 bg-gradient-to-br from-cyber-teal/10 via-transparent to-transparent p-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyber-teal to-cyber-cyan font-display text-sm font-black text-cyber-bg"
                  >
                    UJ
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-hi">Umair Jamal</p>
                    <p className="text-[11px] text-mid">Tech Enthusiast · 18 · 12th Grade</p>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-mid">
                  Designed &amp; engineered end-to-end to make live threat intelligence accessible
                  to everyone.
                </p>
                <button
                  type="button"
                  onClick={() => setAboutOpen(true)}
                  className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyber-teal/50 bg-cyber-teal/10 px-3 py-2 text-[11px] font-bold text-cyber-teal transition-colors hover:bg-cyber-teal/20"
                >
                  About CyberShield
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-4 pt-2 text-[11px] text-low sm:flex-row sm:text-left">
            <div className="digital text-center text-[9.5px] tracking-wider sm:text-left">
              © {new Date().getFullYear()} CYBERSHIELD NEWS · REAL-TIME SITUATIONAL AWARENESS
              AGGREGATOR · 100% LIVE TELEMETRY
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px]">
                Crafted by <span className="font-semibold text-mid">Umair Jamal</span>
              </span>
              <a
                href="#resources"
                className="transition-colors hover:text-cyber-teal"
              >
                Docs &amp; Media
              </a>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="transition-colors hover:text-cyber-teal"
              >
                Back to Top ↑
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Overlays ──────────────────────────────────────────────── */}
      <MobileBottomBar
        syncing={syncing}
        onScrollTop={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        onOpenCategories={() => setMobileNavOpen(true)}
        onManualSync={handleManualSync}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <MobileCategoriesSheet
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        counts={categoryCountMap}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        onlineCount={onlineCount}
        totalSources={SOURCES.length}
      />

      <AboutModal
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        diagnostics={{
          totalSignals: items.length,
          onlineCount,
          lastSyncAt: feedsLastSync,
          nextSyncAt,
          metrics,
        }}
      />

      <InvestigationDrawer target={target} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
