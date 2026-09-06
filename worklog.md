# CyberShield — Worklog

---
Task ID: 1
Agent: Z.ai Code (main orchestrator, executed centrally)
Task: Build "CyberShield" — a live-fetching Cybernews & Threat Intelligence SOC dashboard (Next.js 16 + TS + Tailwind 4 + shadcn/ui), 100% live public data, no mock arrays.

Work Log:
- Inspected scaffold (package.json, ui components incl. sonner, globals.css, layout, page) and created todo plan.
- Probed live endpoints with curl + bun fetch:
  - `api.rss2json.com` works from sandbox AND sends `Access-Control-Allow-Origin: *`; `count` param requires API key (dropped it; default 10 items/feed). pubDate arrives as UTC "YYYY-MM-DD HH:MM:SS" (needs custom UTC parsing).
  - `cisa.gov` KEV JSON → Akamai 403 for datacenter IPs (curl, bun fetch, allorigins/codetabs/r.jina.ai/cors.workers.dev/archive.org all fail from sandbox egress). Classic KEV URL still canonical (verified via web search).
  - Found auto-synced 1:1 mirror of the official catalog: `raw.githubusercontent.com/aboutcode-org/aboutcode-mirror-kev/main/known_exploited_vulnerabilities.json` (fresh: v2026.09.04, 1695 entries) — reachable from sandbox.
  - `bleepingcomputer.com/feed` → Cloudflare "Just a moment" to bots; rss2json itself cannot convert it ("Feed could not be converted") — must be surfaced honestly as OFFLINE.
  - `threatpost.com/feed` is alive (200, valid RSS); THN feedburner works via rss2json.
- Theme foundation: rewrote `globals.css` with CyberShield palette (#0B0F19 bg, #141B2D surface, #222F47 border, #00E5FF teal, #FFB300 amber, #FF3B30 crimson), neon text glows, cyber scrollbars, scanline/ping/blink/CRT-flicker keyframes, grid backdrop; dark-only `layout.tsx` (Geist Mono, metadata, sonner Toaster).
- Core libs: `src/lib/cyber/utils.ts` (entity decoding, stripHtml, 2-sentence excerpt builder, UTC date parser, timeAgo, seeded PRNG, link dedupe keys), `keywords.ts` (31-term threat lexicon), `feeds.ts` (SOURCES config, rss2json direct→relay fetcher, item mapper incl. thumbnail/enclosure/img extraction, searchBlob), `cisa.ts` (direct→relay fetcher, dateAdded-recency severity model, metrics computation).
- Relay APIs (memory-cached): `src/app/api/rss2json/route.ts` (4-min TTL), `src/app/api/cisa/route.ts` (10-min TTL; official → mirror chain).
- Hooks: `use-clock` (SSR-safe ticking), `use-cyber-feeds` (parallel per-source sync, dedupe, per-feed runtime status/via/counts), `use-cisa-catalog` (metrics memo, retry).
- Components: header (brand, LIVE node, auto-sync countdown, scanline, SYNC btn), sidebar (20/20 status node, dynamic topic cloud, feeds tracker with via chips), article-card + matrix-thumb (canvas matrix-rain + shield fallback generator), feed-column (UTC clock, live search, filter chips, skeletons, empty state), threat-panel (animated neon counters, ransomware share bar, 5-row exploitation matrix w/ severity badges), investigation-drawer (500px slide-out, backdrop blur, Executive Summary + Raw Stream Telemetry w/ syntax-highlighted JSON + copy).
- `page.tsx`: 3-column responsive grid (280px/fluid/380px, stacks on mobile), filter engine (topics ∪ search ∪ sources), 12-min self-chaining TTL sync with success/degradation toasts, sticky footer (mt-auto, safe-area).
- Lint fixes (Next 16 react-hooks strict rules): deferred macrotask state updates in effects, keyed DrawerBody instead of setState-in-effect, local JSON tokenizer regex, `{"//"}` JSX escape, removed stale disables. `bun run lint` → clean.
- Agent-browser E2E verification (desktop 1600×900 + mobile 390×844): live render (20 signals THN+Threatpost DIRECT; KEV 1,695 via MIRROR chip), article drawer both tabs, CVE dossier (CRITICAL · 2D SINCE ADD), search ("magento" → 1/20), topic slicing (BACKDOOR → 1/20), feed toggle (Threatpost off → 10), SYNC toast captured verbatim ("CyberShield Stream Synced Successfully — 20 live signals re-synced · CISA KEV v2026.09.04 updated"), mobile stacking + sticky footer, zero console/page errors.
- Fixed during verification: manual sync mode now also toasts (parity with auto cycle).

Stage Summary:
- Shipped: full dashboard on `/` only; 15 new files (4 lib, 3 hooks, 8 components incl. page/layout edits, 2 relay routes). No DB, no auth needed.
- Data is 100% live: rss2json browser-direct (primary) → /api/rss2json relay (fallback); CISA browser-direct (primary) → /api/cisa (official → mirror fallback). Uplink mode surfaced in UI (DIRECT/RELAY/MIRROR).
- Known live-truth: BleepingComputer feed is bot-blocked upstream of rss2json → tracker shows it OFFLINE (red, 0 signals) by design; auto-recovers if upstream unblocks. In end-user browsers with residential IPs, CISA direct usually succeeds → chip flips to DIRECT.
- Artifacts: verification screenshots in /tmp (cs-desktop-initial, cs-drawer-summary, cs-drawer-raw, cs-drawer-vuln, cs-search, cs-topic2, cs-toggle, cs-mobile-*, cs-toast-caught).
