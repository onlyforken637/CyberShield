/**
 * CyberShield — LIVE news fetch pipeline (Column A/B).
 *
 * Strategy (100% live data, zero API keys, no mock arrays):
 *   1. DIRECT  — the browser calls the public rss2json converter itself
 *                (api.rss2json.com responds with Access-Control-Allow-Origin: *).
 *   2. RELAY   — if the direct call is blocked (network policy / rate limit),
 *                the client falls back to our own /api/rss2json proxy which
 *                performs the same conversion server-side.
 *
 * Sources are open RSS feeds passed through rss2json exactly as specified.
 */
import {
  buildExcerpt,
  decodeEntities,
  normalizeKey,
  parseUtcDate,
} from "@/lib/cyber/utils";

export type FeedVia = "direct" | "relay";

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

export const SOURCES: readonly SourceConfig[] = [
  {
    id: "bleepingcomputer",
    name: "BleepingComputer",
    short: "BPC",
    host: "bleepingcomputer.com",
    rss: "https://www.bleepingcomputer.com/feed/",
    accent: {
      chip: "border-cyber-teal/40 bg-cyber-teal/10 text-cyber-teal",
      dot: "bg-cyber-teal",
      text: "text-cyber-teal",
    },
  },
  {
    id: "thehackernews",
    name: "The Hacker News",
    short: "THN",
    host: "thehackernews.com",
    rss: "https://feeds.feedburner.com/TheHackersNews",
    accent: {
      chip: "border-cyber-amber/40 bg-cyber-amber/10 text-cyber-amber",
      dot: "bg-cyber-amber",
      text: "text-cyber-amber",
    },
  },
  {
    id: "threatpost",
    name: "Threatpost",
    short: "TPOST",
    host: "threatpost.com",
    rss: "https://threatpost.com/feed/",
    accent: {
      chip: "border-cyber-violet/40 bg-cyber-violet/10 text-cyber-violet",
      dot: "bg-cyber-violet",
      text: "text-cyber-violet",
    },
  },
] as const;

export const SOURCE_MAP: Record<string, SourceConfig> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
);

/** Raw item exactly as delivered by the rss2json converter. */
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
  /** pre-lowered blob powering search + topic filters */
  searchBlob: string;
  /** untouched converter payload — rendered in the Raw Stream Telemetry tab */
  raw: RawRss2JsonItem;
}

const RSS2JSON_ENDPOINT = "https://api.rss2json.com/v1/api.json";
const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch one source through the public RSS→JSON converter.
 * Tries the browser-direct call first, then our server relay.
 */
export async function fetchRss2Json(
  rssUrl: string,
): Promise<{ via: FeedVia; items: RawRss2JsonItem[] }> {
  const target = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(rssUrl)}`;

  // ── 1. direct browser → rss2json ────────────────────────────────
  try {
    const res = await fetchWithTimeout(target);
    if (res.ok) {
      const json = (await res.json()) as RawRss2JsonResponse;
      if (json.status === "ok" && Array.isArray(json.items)) {
        return { via: "direct", items: json.items };
      }
      throw new Error(json.message || "converter rejected feed");
    }
    throw new Error(`HTTP ${res.status}`);
  } catch {
    // fall through to relay
  }

  // ── 2. relay via our own server-side proxy ──────────────────────
  const res = await fetchWithTimeout(`/api/rss2json?rss_url=${encodeURIComponent(rssUrl)}`);
  if (!res.ok) throw new Error(`relay HTTP ${res.status}`);
  const json = (await res.json()) as RawRss2JsonResponse;
  if (json.status !== "ok" || !Array.isArray(json.items)) {
    throw new Error(json.message || "relay converter error");
  }
  return { via: "relay", items: json.items };
}

/** Pull the best available article image out of the raw payload. */
export function extractImageUrl(raw: RawRss2JsonItem): string | null {
  const candidates: Array<string | undefined> = [
    typeof raw.thumbnail === "string" ? raw.thumbnail : undefined,
    raw.enclosure?.link,
  ];

  const html = `${raw.content ?? ""} ${raw.description ?? ""}`;
  const match = /<img[^>]+\bsrc=["']([^"']+)["']/i.exec(html);
  if (match) candidates.push(match[1]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    let url = candidate.trim();
    if (!url || url.startsWith("data:")) continue;
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//i.test(url)) continue;
    return decodeEntities(url);
  }
  return null;
}

/** Map a raw converter item into the UI FeedItem shape. */
export function mapFeedItem(raw: RawRss2JsonItem, source: SourceConfig): FeedItem {
  const title = decodeEntities(String(raw.title ?? "")).trim();
  const link = String(raw.link ?? raw.guid ?? "").trim();
  const descriptionHtml = String(raw.content || raw.description || "");
  const author = decodeEntities(String(raw.author ?? "")).trim();
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((c) => decodeEntities(String(c)).trim()).filter(Boolean)
    : [];
  const summary = buildExcerpt(descriptionHtml);
  const publishedAt = parseUtcDate(raw.pubDate);

  return {
    id: String(raw.guid ?? link ?? `${source.id}:${title}`).trim() || `${source.id}:${title}`,
    title,
    pubDate: String(raw.pubDate ?? ""),
    publishedAt,
    link,
    author: author || source.name,
    sourceId: source.id,
    sourceName: source.name,
    sourceShort: source.short,
    accent: source.accent,
    summary,
    descriptionHtml,
    imageUrl: extractImageUrl(raw),
    categories,
    searchBlob: [title, summary, descriptionHtml, source.name, author, categories.join(" ")]
      .join(" ")
      .toLowerCase(),
    raw,
  };
}

export { normalizeKey };
