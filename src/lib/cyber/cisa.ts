/**
 * CyberShield — LIVE CISA Known Exploited Vulnerabilities (KEV) pipeline.
 *
 * Strategy (100% live data, zero API keys, no mock arrays):
 *   1. DIRECT — the browser fetches the official CISA KEV JSON feed.
 *   2. RELAY  — /api/cisa proxy (server tries CISA itself, then falls back to
 *               the aboutcode-org mirror of the very same official catalog —
 *               an auto-synced 1:1 copy hosted on raw.githubusercontent.com).
 *
 * The `vulnerabilities` array powers the Live Metrics counters and the
 * Active Exploitation Matrix. Severity is derived from `dateAdded` recency.
 */

export interface CisaVuln {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
  cwes?: string[];
  forensicTriage?: string;
  [key: string]: unknown;
}

export interface CisaCatalog {
  title?: string;
  catalogVersion?: string;
  dateReleased?: string;
  count?: number;
  vulnerabilities: CisaVuln[];
}

export type CisaVia = "direct" | "relay" | "mirror";

const OFFICIAL_KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const MIRROR_KEV_URL =
  "https://raw.githubusercontent.com/aboutcode-org/aboutcode-mirror-kev/main/known_exploited_vulnerabilities.json";

const DIRECT_TIMEOUT_MS = 20_000;
const RELAY_TIMEOUT_MS = 25_000;

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isCatalog(value: unknown): value is CisaCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CisaCatalog>;
  return Array.isArray(candidate.vulnerabilities) && candidate.vulnerabilities.length >= 0;
}

/** Fetch the live official catalog: browser → CISA, then our relay chain. */
export async function fetchCisaCatalog(): Promise<{
  catalog: CisaCatalog;
  via: CisaVia;
}> {
  // ── 1. direct browser → cisa.gov (official real-time feed) ─────
  try {
    const official = await fetchJson(OFFICIAL_KEV_URL, DIRECT_TIMEOUT_MS);
    if (isCatalog(official)) return { catalog: official, via: "direct" };
  } catch {
    // blocked (e.g. edge bot-mitigation) — fall through
  }

  // ── 2. server relay (official first, then 1:1 live mirror) ─────
  const res = await fetch("/api/cisa", { cache: "no-store" });
  if (!res.ok) throw new Error(`KEV relay HTTP ${res.status}`);
  const relayed = (await res.json()) as { via?: CisaVia; catalog?: unknown };
  if (isCatalog(relayed.catalog)) {
    return { catalog: relayed.catalog, via: relayed.via === "mirror" ? "mirror" : "relay" };
  }
  throw new Error("KEV relay returned an invalid catalog payload");
}

export type SeverityTone = "critical" | "high" | "watch";

export interface SeverityInfo {
  label: string;
  tone: SeverityTone;
  daysSinceAdd: number;
}

/** Severity badge derived automatically from the KEV `dateAdded` field. */
export function severityForDate(dateAdded: string, now = Date.now()): SeverityInfo {
  const added = Date.parse(`${dateAdded}T00:00:00Z`);
  const daysSinceAdd = Number.isFinite(added)
    ? Math.max(0, Math.floor((now - added) / 86_400_000))
    : Number.POSITIVE_INFINITY;

  if (daysSinceAdd <= 30) return { label: "CRITICAL", tone: "critical", daysSinceAdd };
  if (daysSinceAdd <= 180) return { label: "HIGH", tone: "high", daysSinceAdd };
  return { label: "WATCH", tone: "watch", daysSinceAdd };
}

export const SEVERITY_STYLES: Record<SeverityTone, string> = {
  critical: "border-cyber-crimson/50 bg-cyber-crimson/10 text-cyber-crimson",
  high: "border-cyber-amber/50 bg-cyber-amber/10 text-cyber-amber",
  watch: "border-cyber-teal/50 bg-cyber-teal/10 text-cyber-teal",
};

export interface CisaMetrics {
  total: number;
  addedThisYear: number;
  ransomwareLinked: number;
  addedLast30Days: number;
  ransomwareSharePct: number;
  yearSharePct: number;
  recent: CisaVuln[];
  catalogVersion: string;
  dateReleased: string;
  catalogTitle: string;
}

/** All Live Metrics are computed from the real-time `vulnerabilities` array. */
export function computeCisaMetrics(catalog: CisaCatalog, now = Date.now()): CisaMetrics {
  const vulns = catalog.vulnerabilities ?? [];
  const year = new Date(now).getUTCFullYear();
  const addedThisYear = vulns.filter((v) => String(v.dateAdded ?? "").startsWith(String(year)))
    .length;
  const ransomwareLinked = vulns.filter(
    (v) => String(v.knownRansomwareCampaignUse ?? "").toLowerCase() === "known",
  ).length;
  const addedLast30Days = vulns.filter((v) => {
    const added = Date.parse(`${v.dateAdded}T00:00:00Z`);
    return Number.isFinite(added) && now - added <= 30 * 86_400_000;
  }).length;

  const recent = [...vulns]
    .sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : 0))
    .slice(0, 5);

  return {
    total: vulns.length,
    addedThisYear,
    ransomwareLinked,
    addedLast30Days,
    ransomwareSharePct: vulns.length ? (ransomwareLinked / vulns.length) * 100 : 0,
    yearSharePct: vulns.length ? (addedThisYear / vulns.length) * 100 : 0,
    recent,
    catalogVersion: String(catalog.catalogVersion ?? "unknown"),
    dateReleased: String(catalog.dateReleased ?? ""),
    catalogTitle: String(catalog.title ?? "CISA Catalog of Known Exploited Vulnerabilities"),
  };
}
