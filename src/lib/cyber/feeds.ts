/**
 * CyberShield — shared stream configuration & UI contracts.
 *
 * The 20 research streams are aggregated SERVER-SIDE by /api/news
 * (see src/lib/cyber/intel.ts): direct RSS/Atom XML parsing first, public
 * RSS→JSON converter fallback — so the browser only ever talks to our own
 * origin while every byte still comes from the live upstream publishers.
 */
export interface SourceAccent {
  chip: string;
  dot: string;
  text: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  short: string;
  host: string;
  rss: string;
  accent: SourceAccent;
}

/* Accent presets — static class strings so Tailwind can compile them. */
const ACCENTS: readonly SourceAccent[] = [
  { chip: "border-cyber-teal/40 bg-cyber-teal/10 text-cyber-teal", dot: "bg-cyber-teal", text: "text-cyber-teal" },
  { chip: "border-cyber-green/40 bg-cyber-green/10 text-cyber-green", dot: "bg-cyber-green", text: "text-cyber-green" },
  { chip: "border-cyber-amber/40 bg-cyber-amber/10 text-cyber-amber", dot: "bg-cyber-amber", text: "text-cyber-amber" },
  { chip: "border-cyber-orange/40 bg-cyber-orange/10 text-cyber-orange", dot: "bg-cyber-orange", text: "text-cyber-orange" },
  { chip: "border-cyber-crimson/40 bg-cyber-crimson/10 text-cyber-crimson", dot: "bg-cyber-crimson", text: "text-cyber-crimson" },
  { chip: "border-cyber-rose/40 bg-cyber-rose/10 text-cyber-rose", dot: "bg-cyber-rose", text: "text-cyber-rose" },
  { chip: "border-cyber-violet/40 bg-cyber-violet/10 text-cyber-violet", dot: "bg-cyber-violet", text: "text-cyber-violet" },
  { chip: "border-cyber-fuchsia/40 bg-cyber-fuchsia/10 text-cyber-fuchsia", dot: "bg-cyber-fuchsia", text: "text-cyber-fuchsia" },
  { chip: "border-cyber-lime/40 bg-cyber-lime/10 text-cyber-lime", dot: "bg-cyber-lime", text: "text-cyber-lime" },
] as const;

function accentFor(index: number): SourceAccent {
  return ACCENTS[index % ACCENTS.length]!;
}

interface SourceSeed {
  id: string;
  name: string;
  short: string;
  host: string;
  rss: string;
}

/* ── The 20 integrated research streams (open RSS, no keys) ───────── */
const SOURCE_SEEDS: readonly SourceSeed[] = [
  { id: "bleepingcomputer", name: "BleepingComputer", short: "BPC", host: "bleepingcomputer.com", rss: "https://www.bleepingcomputer.com/feed/" },
  { id: "thehackernews", name: "The Hacker News", short: "THN", host: "thehackernews.com", rss: "https://feeds.feedburner.com/TheHackersNews" },
  { id: "threatpost", name: "Threatpost", short: "TPOST", host: "threatpost.com", rss: "https://threatpost.com/feed/" },
  { id: "krebsonsecurity", name: "Krebs on Security", short: "KREBS", host: "krebsonsecurity.com", rss: "https://krebsonsecurity.com/feed/" },
  { id: "darkreading", name: "Dark Reading", short: "DR", host: "darkreading.com", rss: "https://www.darkreading.com/rss.xml" },
  { id: "securityweek", name: "SecurityWeek", short: "SECWK", host: "securityweek.com", rss: "https://www.securityweek.com/feed/" },
  { id: "helpnetsecurity", name: "Help Net Security", short: "HNS", host: "helpnetsecurity.com", rss: "https://www.helpnetsecurity.com/feed/" },
  { id: "infosecurity", name: "Infosecurity Magazine", short: "INFOMAG", host: "infosecurity-magazine.com", rss: "https://www.infosecurity-magazine.com/rss/news/" },
  { id: "cyberscoop", name: "CyberScoop", short: "SCOOP", host: "cyberscoop.com", rss: "https://cyberscoop.com/feed/" },
  { id: "therecord", name: "The Record", short: "RECORD", host: "therecord.media", rss: "https://therecord.media/feed" },
  { id: "grahamcluley", name: "Graham Cluley", short: "CLULEY", host: "grahamcluley.com", rss: "https://grahamcluley.com/feed/" },
  { id: "malwarebytes", name: "Malwarebytes Labs", short: "MBLabs", host: "malwarebytes.com", rss: "https://www.malwarebytes.com/blog/feed/index.xml" },
  { id: "securelist", name: "Securelist", short: "SECLST", host: "securelist.com", rss: "https://securelist.com/feed/" },
  { id: "unit42", name: "Unit 42", short: "U42", host: "unit42.paloaltonetworks.com", rss: "https://unit42.paloaltonetworks.com/feed/" },
  { id: "msrc-blog", name: "Microsoft Security", short: "MSFT", host: "microsoft.com", rss: "https://www.microsoft.com/en-us/security/blog/feed/" },
  { id: "sentinelone", name: "SentinelOne Labs", short: "S1", host: "sentinelone.com", rss: "https://www.sentinelone.com/labs/feed/" },
  { id: "schneier", name: "Schneier on Security", short: "SCHNEIER", host: "schneier.com", rss: "https://www.schneier.com/feed/" },
  { id: "arstechnica", name: "Ars Technica Security", short: "ARS", host: "arstechnica.com", rss: "https://arstechnica.com/security/feed/" },
  { id: "zdi", name: "Zero Day Initiative", short: "ZDI", host: "zerodayinitiative.com", rss: "https://www.zerodayinitiative.com/blog?format=RSS" },
  { id: "cisa-advisories", name: "CISA Advisories", short: "CISA", host: "cisa.gov", rss: "https://www.cisa.gov/cybersecurity-advisories/all.xml" },
] as const;

export const SOURCES: readonly SourceConfig[] = SOURCE_SEEDS.map((seed, index) => ({
  ...seed,
  accent: accentFor(index),
}));

export const SOURCE_MAP: Record<string, SourceConfig> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
);

/** How an individual stream was actually pulled this cycle. */
export type FeedVia = "xml" | "converter";

/** Raw item exactly as delivered by the public rss2json converter. */
export interface RawRss2JsonItem {
  title?: string;
  pubDate?: string;
  link?: string;
  guid?: string;
  author?: string;
  thumbnail?: string;
  description?: string;
  content?: string;
  enclosure?: { link?: string; type?: string; length?: number } | null;
  categories?: string[];
  [key: string]: unknown;
}

export interface RawRss2JsonResponse {
  status?: string;
  message?: string;
  feed?: { title?: string; link?: string };
  items?: RawRss2JsonItem[];
}

/** Heuristic article severity derived from the live text payload. */
export type IntelSeverityLabel = "CRITICAL" | "HIGH" | "ELEVATED" | "MODERATE";

/**
 * Structured analyst intel — extracted server-side from the live feed
 * payload for every article. Powers the news card briefs, the Ranked
 * Threat Board and the Threat Condition gauge.
 */
export interface ArticleIntel {
  /** The punchiest single sentence — the "lede" line. */
  lede: string;
  /** 1–3 distilled intel highlight bullets. */
  highlights: string[];
  /** CVE IDs referenced by the article (deduped, ≤4). */
  cves: string[];
  /** Named orgs / vendors / threat-actor groups found in the text. */
  orgs: string[];
  /** Auto threat-domain tags (category shorts + hot keywords). */
  tags: string[];
  /** Heuristic severity 0–100 + label. */
  severity: { score: number; label: IntelSeverityLabel };
  /** Estimated read time in minutes. */
  readMinutes: number;
}

/** Mapped live article used across the dashboard UI. */
export interface FeedItem {
  id: string;
  title: string;
  pubDate: string;
  publishedAt: number;
  link: string;
  author: string;
  sourceId: string;
  sourceName: string;
  sourceShort: string;
  accent: SourceAccent;
  summary: string;
  descriptionHtml: string;
  imageUrl: string | null;
  categories: string[];
  /** threat-domain classification computed from the live payload */
  categoryIds: string[];
  /** pre-lowered blob powering search + topic filters */
  searchBlob: string;
  /** structured analyst brief extracted server-side */
  intel: ArticleIntel;
  /** untouched upstream payload — rendered in the Raw Stream Telemetry tab */
  raw: RawRss2JsonItem;
}
