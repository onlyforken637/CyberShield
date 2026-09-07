/**
 * CyberShield — server-side intelligence pipeline (Node runtime).
 *
 * Aggregation chain per stream (100% live data, zero API keys, no mocks):
 *   1. XML    — fetch the publisher's RSS/Atom feed directly and parse it
 *               with fast-xml-parser (media:content, content:encoded,
 *               dc:creator … all preserved).
 *   2. CONVERTER — public rss2json fallback for hosts that bot-block
 *               datacenter IPs.
 *
 * Enrichment performed for every article while it flows through:
 *   • best-possible thumbnail (media tags → enclosure → content <img> →
 *     OpenGraph og:image scraped from the article page itself)
 *   • structured analyst brief: punchy lede sentence, 1–3 highlight
 *     bullets, CVE IDs, named orgs / threat actors, auto tags, heuristic
 *     severity score, read time.
 *
 * The aggregated result is memory-cached (4 min fresh / 30 min stale
 * grace) so the dashboard polls a single fast endpoint.
 */
import { XMLParser } from "fast-xml-parser";
import { CATEGORY_MAP, matchCategories } from "@/lib/cyber/categories";
import {
  SOURCES,
  type ArticleIntel,
  type FeedItem,
  type FeedVia,
  type IntelSeverityLabel,
  type RawRss2JsonItem,
  type SourceConfig,
} from "@/lib/cyber/feeds";
import {
  buildExcerpt,
  clampText,
  decodeEntities,
  normalizeKey,
  parseUtcDate,
  stripHtml,
} from "@/lib/cyber/utils";

/* ── tunables ─────────────────────────────────────────────────────── */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 CyberShieldIntelGrid/2.0";

const DIRECT_TIMEOUT_MS = 9_000;
const CONVERTER_TIMEOUT_MS = 15_000;
const OG_TIMEOUT_MS = 4_500;
const OG_MAX_PER_CYCLE = 60;
const OG_POOL = 12;
const OG_TTL_MS = 6 * 60 * 60 * 1000;

/** Newest N items kept per stream — bounds payload + enrichment cost. */
const PER_SOURCE_CAP = 12;

/** Shipped body HTML cap per item — drawer needs the lede paragraphs only. */
const BODY_CAP = 5_000;

/** Search-blob text cap — filter matching works on the meaningful head. */
const BLOB_CAP = 3_500;

const CACHE_TTL_MS = 4 * 60 * 1000;
const CACHE_STALE_MS = 30 * 60 * 1000;

const CONVERTER_ENDPOINT = "https://api.rss2json.com/v1/api.json";

/* ── generic helpers ──────────────────────────────────────────────── */

async function fetchText(url: string, timeoutMs: number, accept: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA, Accept: accept },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } finally {
    clearTimeout(timer);
  }
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["#text"] === "string") return record["#text"];
  }
  return "";
}

function attrOf(value: unknown, attr: string): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const raw = record[`@_${attr}`];
    if (typeof raw === "string") return raw;
  }
  return "";
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ── normalized entry (shared shape for XML + converter items) ────── */

interface MediaCandidate {
  url: string;
  width?: number;
}

interface NormalizedEntry {
  sourceId: string;
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  author: string;
  categories: string[];
  contentHtml: string;
  descriptionHtml: string;
  mediaCandidates: MediaCandidate[];
  enclosureUrl: string | null;
  imageUrl: string | null;
  raw: RawRss2JsonItem;
}

/* ── direct XML parsing ───────────────────────────────────────────── */

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
});

function collectCategories(value: unknown): string[] {
  return asArray(value)
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const term = attrOf(entry, "term");
      return term || textOf(entry);
    })
    .map((entry) => decodeEntities(entry).trim())
    .filter(Boolean);
}

function collectMedia(value: unknown): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  for (const node of asArray(value)) {
    const url = attrOf(node, "url");
    if (!url) continue;
    const widthRaw = parseInt(attrOf(node, "width"), 10);
    out.push({
      url,
      width: Number.isFinite(widthRaw) ? widthRaw : undefined,
    });
  }
  return out;
}

function extractHtmlImages(html: string): MediaCandidate[] {
  if (!html) return [];
  const out: MediaCandidate[] = [];
  const tagRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[0];
    const src =
      attrSource(tag, "src") ||
      attrSource(tag, "data-src") ||
      attrSource(tag, "data-lazy-src") ||
      attrSource(tag, "data-original");
    if (!src) continue;
    const widthRaw = parseInt(attrSource(tag, "width") ?? "", 10);
    out.push({
      url: decodeEntities(src).trim(),
      width: Number.isFinite(widthRaw) ? widthRaw : undefined,
    });
  }
  return out;
}

/** Attribute getter that tolerates the attr appearing before/after others. */
function attrSource(tag: string, name: string): string | null {
  const regex = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const match = regex.exec(tag);
  return match ? match[1] : null;
}

function pickAtomLink(value: unknown): string {
  const links = asArray(value);
  for (const link of links) {
    const rel = attrOf(link, "rel");
    const href = attrOf(link, "href");
    if (!href) continue;
    if (!rel || rel === "alternate") return href;
  }
  return attrOf(links[0], "href");
}

interface ParsedEntry {
  guid: string;
  title: string;
  link: string;
  pubDate: string;
  author: string;
  categories: string[];
  contentHtml: string;
  descriptionHtml: string;
  media: MediaCandidate[];
  enclosureUrl: string | null;
}

function parseFeedXml(xml: string): ParsedEntry[] {
  const doc = xmlParser.parse(xml) as Record<string, any>;

  const channel = doc?.rss?.channel;
  const rdfItems = doc?.["rdf:RDF"]?.item;
  const atomEntries = doc?.feed?.entry;

  const rawItems: any[] = Array.isArray(channel?.item)
    ? channel.item
    : channel?.item
      ? [channel.item]
      : Array.isArray(rdfItems)
        ? rdfItems
        : rdfItems
          ? [rdfItems]
          : Array.isArray(atomEntries)
            ? atomEntries
            : atomEntries
              ? [atomEntries]
              : [];

  if (rawItems.length === 0) {
    throw new Error("unrecognized feed payload (no items)");
  }

  return rawItems.map((item) => {
    const contentHtml = textOf(item["content:encoded"]) || textOf(item.content);
    const descriptionHtml = textOf(item.description) || textOf(item.summary);
    const enclosureUrl = attrOf(item.enclosure, "url") || null;
    return {
      guid: textOf(item.guid) || textOf(item.id),
      title: textOf(item.title),
      link: textOf(item.link) || pickAtomLink(item.link) || textOf(item.guid) || textOf(item.id),
      pubDate: textOf(item.pubDate) || textOf(item["dc:date"]) || textOf(item.published) || textOf(item.updated),
      author:
        textOf(item["dc:creator"]) ||
        textOf(item.author) ||
        textOf((item.author as any)?.name),
      categories: collectCategories(item.category),
      contentHtml,
      descriptionHtml,
      media: [...collectMedia(item["media:content"]), ...collectMedia(item["media:thumbnail"])],
      enclosureUrl,
    };
  });
}

async function fetchDirectXml(rssUrl: string): Promise<ParsedEntry[]> {
  const xml = await fetchText(rssUrl, DIRECT_TIMEOUT_MS, "application/rss+xml, application/xml, text/xml, */*");
  return parseFeedXml(xml);
}

/* ── converter fallback (public rss2json, called server-side) ─────── */

async function fetchViaConverter(rssUrl: string): Promise<RawRss2JsonItem[]> {
  const target = `${CONVERTER_ENDPOINT}?rss_url=${encodeURIComponent(rssUrl)}`;
  const body = await fetchText(target, CONVERTER_TIMEOUT_MS, "application/json");
  const json = JSON.parse(body) as RawRss2JsonResponse;
  if (json.status !== "ok" || !Array.isArray(json.items)) {
    throw new Error(json.message || "converter rejected feed");
  }
  return json.items;
}

/* ── image selection ──────────────────────────────────────────────── */

/** Tracking pixels, icons, avatars and other junk we refuse to show. */
const BAD_IMG_RE =
  /1x1|pixel|transparent|spacer|blank\.(?:gif|png)|feedburner|feedsportal|feedproxy|avatar|gravatar|badge|rating|sprite|emoji|smiley|\/icon(?:s)?\/|logo|wp-content\/themes|donate|newsletter|captcha|counter|share(?:d)?[-_]/i;

const GOOD_IMG_RE =
  /\.(?:jpe?g|png|webp)(?:[?#]|$)|\/(?:wp-content\/uploads|wp-json|images?|media|img)\//i;

function scoreImageCandidate(candidate: MediaCandidate): number {
  const url = candidate.url;
  if (!url || url.startsWith("data:") || !/^https?:\/\//i.test(url)) return -100;
  let score = 0;
  if (BAD_IMG_RE.test(url)) score -= 100;
  if (/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url)) score += 3;
  if (GOOD_IMG_RE.test(url)) score += 3;
  if (url.startsWith("https://")) score += 1;
  if (candidate.width !== undefined) {
    if (candidate.width >= 300) score += 5;
    else if (candidate.width >= 200) score += 3;
    else if (candidate.width > 0 && candidate.width <= 80) score -= 40;
  }
  return score;
}

function pickImageFromEntry(entry: {
  mediaCandidates: MediaCandidate[];
  enclosureUrl: string | null;
  contentHtml: string;
  descriptionHtml: string;
}): string | null {
  const pools: MediaCandidate[][] = [
    entry.mediaCandidates,
    entry.enclosureUrl ? [{ url: entry.enclosureUrl }] : [],
    extractHtmlImages(entry.contentHtml),
    extractHtmlImages(entry.descriptionHtml),
  ];

  for (const pool of pools) {
    let best: { url: string; score: number } | null = null;
    for (const candidate of pool) {
      const score = scoreImageCandidate(candidate);
      if (score > -50 && (!best || score > best.score)) {
        best = { url: candidate.url, score };
      }
    }
    if (best) {
      let url = best.url.trim();
      if (url.startsWith("//")) url = `https:${url}`;
      if (/^https?:\/\//i.test(url)) return url;
    }
  }
  return null;
}

/* ── og:image enrichment (for items the feed gave no image) ───────── */

const ogCache = new Map<string, { at: number; image: string | null }>();

const OG_META_PATTERNS: RegExp[] = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
];

async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const html = await fetchText(articleUrl, OG_TIMEOUT_MS, "text/html,application/xhtml+xml,*/*");
    for (const pattern of OG_META_PATTERNS) {
      const match = pattern.exec(html);
      if (!match) continue;
      const url = decodeEntities(match[1] ?? "").trim();
      if (/^https?:\/\//i.test(url)) return url;
    }
  } catch {
    // article page unreachable — leave without og image
  }
  return null;
}

async function ogFor(articleUrl: string): Promise<string | null> {
  const cached = ogCache.get(articleUrl);
  if (cached && Date.now() - cached.at < OG_TTL_MS) return cached.image;
  const image = await fetchOgImage(articleUrl);
  ogCache.set(articleUrl, { at: Date.now(), image });
  if (ogCache.size > 800) {
    const oldest = ogCache.keys().next().value;
    if (oldest) ogCache.delete(oldest);
  }
  return image;
}

/** Fill in missing thumbnails by scraping og:image off the article pages. */
async function enrichWithOg(entries: NormalizedEntry[]): Promise<number> {
  const targets = entries.filter((entry) => !entry.imageUrl && /^https?:\/\//i.test(entry.link));
  const selected = targets.slice(0, OG_MAX_PER_CYCLE);
  if (selected.length === 0) return 0;

  let enriched = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(OG_POOL, selected.length) }, async () => {
    while (cursor < selected.length) {
      const entry = selected[cursor++]!;
      const image = await ogFor(entry.link);
      if (image) {
        entry.imageUrl = image;
        enriched += 1;
      }
    }
  });
  await Promise.all(workers);
  return enriched;
}

/* ── analyst brief builder ────────────────────────────────────────── */

const WEIGHTED_TERMS: ReadonlyArray<readonly [RegExp, number]> = [
  [/actively exploited|exploited in the wild|in the wild/, 28],
  [/zero[- ]day|0[- ]day/, 24],
  [/ransomware|file-encrypting|extortion/, 20],
  [/critical (?:vulnerability|flaw|severity|bug|security)/, 20],
  [/cvss\s*(?:10|9\.\d)/i, 22],
  [/known exploited|\bkev\b/, 16],
  [/patch now|emergency (?:patch|update|security)|patch immediately/, 16],
  [/backdoor|implant|rootkit|web shell/, 14],
  [/data (?:breach|leak)|exposed (?:data|records|server|database)|compromised/, 14],
  [/million (?:records|users|customers|accounts|devices)|billion/, 10],
  [/apt\s?\d|nation[- ]state|espionage|lazarus|typhoon|fancy bear|cozy bear/, 12],
  [/infostealer|stealer|spyware|trojan|botnet|malware/, 8],
  [/phishing|smishing|social engineering|scam/, 7],
  [/supply[- ]chain/, 10],
  [/threat (?:actors?|groups?)/, 6],
  [/\bcisa\b|\bfbi\b|\bnsa\b|\bncsc\b|europol/, 5],
  [/dark ?web|cryptocurrency|bitcoin wallet/, 4],
];

const BOILERPLATE_RE =
  /appeared first on|read (?:more|the rest)|continue reading|click (?:here|to)|share (?:this|on)|subscribe|sign up|follow us|advertisement|leave a (?:comment|reply)|all rights reserved|©|related (?:article|post|reading)|see also|editor'?s note|courtesy of|photo (?:by|credit)|newsletter|comments \(?\d*\)?$/i;

const ORG_LEXICON = [
  "Microsoft", "Google", "Apple", "Amazon", "AWS", "Azure", "CISA", "FBI", "NSA", "GCHQ",
  "Europol", "Interpol", "Fortinet", "Ivanti", "Cisco", "Palo Alto", "Citrix", "VMware",
  "Broadcom", "Oracle", "SAP", "Samsung", "Android", "iOS", "Windows", "Chrome", "Exchange",
  "SharePoint", "Outlook", "LockBit", "BlackCat", "ALPHV", "Cl0p", "Akira", "Lazarus",
  "APT28", "APT29", "APT41", "Salt Typhoon", "Volt Typhoon", "Fancy Bear", "Cozy Bear",
  "TeamViewer", "SolarWinds", "MOVEit", "Zimbra", "GitLab", "GitHub", "Docker", "Kubernetes",
  "Apache", "OpenSSL", "WhatsApp", "Signal", "Telegram", "OpenAI", "ChatGPT", "North Korea",
  "Russia", "China", "Iran", "Ukraine", "Linux",
] as const;

const ORG_MATCHERS = ORG_LEXICON.map((name) => ({
  name,
  regex: new RegExp(`\\b${escapeRegExp(name)}\\b`, "i"),
}));

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?=\s|$)/g) ?? [text])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function scoreSentence(sentence: string, index: number): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const [pattern, weight] of WEIGHTED_TERMS) {
    if (pattern.test(lower)) score += weight;
  }
  if (/cve-\d{4}/i.test(lower)) score += 7;
  if (/\d+(?:\.\d+)?\s*(?:%|percent)/.test(lower) || /million|billion|thousand/.test(lower)) {
    score += 4;
  }
  if (lower.length >= 70 && lower.length <= 240) score += 4;
  else if (lower.length < 45) score -= 4;
  if (index < 3) score += 3 - index;
  return score;
}

function extractCves(text: string): string[] {
  const seen = new Set<string>();
  const matches = text.match(/CVE-\d{4}-\d{4,7}/gi) ?? [];
  for (const match of matches) seen.add(match.toUpperCase());
  return [...seen].slice(0, 4);
}

function extractOrgs(text: string): string[] {
  const hits: Array<{ name: string; index: number }> = [];
  for (const { name, regex } of ORG_MATCHERS) {
    const match = regex.exec(text);
    if (match) hits.push({ name, index: match.index });
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hit of hits) {
    const key = hit.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit.name);
    if (out.length >= 4) break;
  }
  return out;
}

function severityFor(text: string, title: string): { score: number; label: IntelSeverityLabel } {
  // title counts double — headline words are strong signals
  const blob = `${title} ${title} ${text}`.toLowerCase();
  let score = 16;
  for (const [pattern, weight] of WEIGHTED_TERMS) {
    if (pattern.test(blob)) score += weight;
  }
  const cveCount = (blob.match(/cve-\d{4}-\d+/g) ?? []).length;
  score += Math.min(10, cveCount * 2);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label: IntelSeverityLabel =
    clamped >= 72 ? "CRITICAL" : clamped >= 52 ? "HIGH" : clamped >= 32 ? "ELEVATED" : "MODERATE";
  return { score: clamped, label };
}

function buildIntel(
  title: string,
  html: string,
  categoryIds: string[],
): ArticleIntel {
  const text = stripHtml(html);
  const words = text ? text.split(/\s+/).length : 0;

  // ranked, de-boilerplated sentences
  const sentences = splitSentences(text)
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 340)
    .filter((sentence) => !BOILERPLATE_RE.test(sentence))
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index) }))
    .sort((a, b) => b.score - a.score);

  const ledeRaw = sentences[0]?.sentence ?? (text ? clampText(text, 200) : "");
  const lede = ledeRaw ? clampText(ledeRaw, 220) : "";

  const highlights: string[] = [];
  for (const candidate of sentences.slice(1)) {
    const line = clampText(candidate.sentence, 170);
    const duplicate = highlights.some(
      (existing) =>
        existing.slice(0, 50).toLowerCase() === line.slice(0, 50).toLowerCase(),
    );
    if (!duplicate) highlights.push(line);
    if (highlights.length >= 2) break;
  }

  const cves = extractCves(text);
  const orgs = extractOrgs(`${title}. ${text}`);

  const tags: string[] = [];
  for (const categoryId of categoryIds.slice(0, 2)) {
    const short = CATEGORY_MAP[categoryId]?.short;
    if (short) tags.push(short);
  }
  if (/zero[- ]day|0[- ]day/i.test(text) && !tags.includes("CVE")) tags.push("ZERO-DAY");
  if (/actively exploited|in the wild|known exploited/i.test(text)) tags.push("EXPLOITED");
  if (cves.length > 0 && !tags.includes("CVE")) tags.push("CVE");

  const severity = severityFor(text, title);

  return {
    lede,
    highlights,
    cves,
    orgs,
    tags: tags.slice(0, 4),
    severity,
    readMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/* ── unified mapping ──────────────────────────────────────────────── */

function entryFromXml(sourceId: string, parsed: ParsedEntry): NormalizedEntry {
  const html = parsed.contentHtml || parsed.descriptionHtml;
  const raw: RawRss2JsonItem = {
    title: parsed.title,
    link: parsed.link,
    guid: parsed.guid,
    pubDate: parsed.pubDate,
    author: parsed.author,
    categories: parsed.categories,
    enclosure: parsed.enclosureUrl ? { link: parsed.enclosureUrl } : null,
    content: html ? clampText(html, 700) : undefined,
    description: parsed.descriptionHtml ? clampText(parsed.descriptionHtml, 400) : undefined,
  };
  return {
    sourceId,
    guid: parsed.guid,
    title: parsed.title,
    link: parsed.link,
    pubDate: parsed.pubDate,
    author: parsed.author,
    categories: parsed.categories,
    contentHtml: parsed.contentHtml,
    descriptionHtml: parsed.descriptionHtml,
    mediaCandidates: parsed.media,
    enclosureUrl: parsed.enclosureUrl,
    imageUrl: null,
    raw,
  };
}

function entryFromConverter(sourceId: string, item: RawRss2JsonItem): NormalizedEntry {
  const contentHtml = String(item.content ?? "");
  const descriptionHtml = String(item.description ?? "");
  const media: MediaCandidate[] = [];
  if (typeof item.thumbnail === "string" && item.thumbnail) {
    media.push({ url: item.thumbnail });
  }
  if (item.enclosure?.link) {
    media.push({ url: item.enclosure.link });
  }
  return {
    sourceId,
    guid: String(item.guid ?? item.link ?? ""),
    title: String(item.title ?? ""),
    link: String(item.link ?? item.guid ?? ""),
    pubDate: String(item.pubDate ?? ""),
    author: String(item.author ?? ""),
    categories: Array.isArray(item.categories)
      ? item.categories.map((category) => decodeEntities(String(category)).trim()).filter(Boolean)
      : [],
    contentHtml,
    descriptionHtml,
    mediaCandidates: media,
    enclosureUrl: item.enclosure?.link ?? null,
    imageUrl: null,
    raw: item,
  };
}

function mapItem(entry: NormalizedEntry, source: SourceConfig): FeedItem {
  const title = decodeEntities(entry.title).replace(/\s+/g, " ").trim();
  const link = entry.link.trim();
  const html = entry.contentHtml || entry.descriptionHtml;
  const summary = buildExcerpt(html);
  const categories = entry.categories.slice(0, 8);
  const searchBlob = [title, summary, clampText(html, BLOB_CAP), source.name, entry.author, categories.join(" ")]
    .join(" ")
    .toLowerCase();
  const categoryIds = matchCategories(searchBlob);

  return {
    id: entry.guid || link || `${source.id}:${title}`,
    title,
    pubDate: entry.pubDate,
    publishedAt: parseUtcDate(entry.pubDate),
    link,
    author: decodeEntities(entry.author).trim() || source.name,
    sourceId: source.id,
    sourceName: source.name,
    sourceShort: source.short,
    accent: source.accent,
    summary,
    descriptionHtml: clampText(html, BODY_CAP),
    imageUrl: pickImageFromEntry(entry),
    categories,
    categoryIds,
    searchBlob,
    intel: buildIntel(title, html, categoryIds),
    raw: entry.raw,
  };
}

/* ── aggregation ──────────────────────────────────────────────────── */

export interface SourceOutcome {
  id: string;
  name: string;
  status: "online" | "offline" | "empty";
  via: FeedVia;
  count: number;
  error?: string;
}

export interface AggregatedNews {
  generatedAt: number;
  items: FeedItem[];
  sources: SourceOutcome[];
  ogEnriched: number;
}

interface StreamResult {
  source: SourceConfig;
  entries: NormalizedEntry[];
  via: FeedVia;
  error: string | null;
}

async function fetchStream(source: SourceConfig): Promise<StreamResult> {
  // 1) direct publisher XML — richest payload (media tags, full content)
  try {
    const parsed = await fetchDirectXml(source.rss);
    if (parsed.length > 0) {
      const entries = parsed
        .map((entry) => entryFromXml(source.id, entry))
        .sort((a, b) => parseUtcDate(b.pubDate) - parseUtcDate(a.pubDate))
        .slice(0, PER_SOURCE_CAP);
      return { source, entries, via: "xml", error: null };
    }
  } catch {
    // fall through to the public converter
  }

  // 2) public rss2json converter (server-side)
  try {
    const rawItems = await fetchViaConverter(source.rss);
    const entries = rawItems
      .map((item) => entryFromConverter(source.id, item))
      .sort((a, b) => parseUtcDate(b.pubDate) - parseUtcDate(a.pubDate))
      .slice(0, PER_SOURCE_CAP);
    return { source, entries, via: "converter", error: null };
  } catch (error) {
    return {
      source,
      entries: [],
      via: "converter",
      error: error instanceof Error ? error.message : "uplink failure",
    };
  }
}

export async function aggregateNews(): Promise<AggregatedNews> {
  const results = await Promise.all(SOURCES.map(fetchStream));

  // cross-source dedupe (newest-first ordering decided below)
  const seen = new Set<string>();
  const entries: NormalizedEntry[] = [];
  for (const result of results) {
    for (const entry of result.entries) {
      if (!entry.title.trim() || !/^https?:\/\//i.test(entry.link.trim())) continue;
      const key = normalizeKey(entry.link);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      entries.push(entry);
    }
  }

  entries.sort((a, b) => parseUtcDate(b.pubDate) - parseUtcDate(a.pubDate));

  // scrape og:image for articles whose feed shipped no usable media
  const ogEnriched = await enrichWithOg(entries);

  const sourceMap = Object.fromEntries(SOURCES.map((source) => [source.id, source]));
  const items = entries
    .map((entry) => {
      const source = sourceMap[entry.sourceId];
      return source ? mapItem(entry, source) : null;
    })
    .filter((item): item is FeedItem => item !== null);

  const sources: SourceOutcome[] = results.map((result) => ({
    id: result.source.id,
    name: result.source.name,
    status: result.error ? "offline" : result.entries.length > 0 ? "online" : "empty",
    via: result.via,
    count: result.entries.length,
    error: result.error ?? undefined,
  }));

  return { generatedAt: Date.now(), items, sources, ogEnriched };
}

/* ── module cache: fresh 4 min, stale-grace 30 min ────────────────── */

let cache: { at: number; payload: AggregatedNews } | null = null;
let inflight: Promise<AggregatedNews> | null = null;

export interface NewsSnapshot {
  payload: AggregatedNews;
  ageMs: number;
  fresh: boolean;
}

export async function getNewsSnapshot(): Promise<NewsSnapshot> {
  const now = Date.now();

  if (cache && now - cache.at < CACHE_TTL_MS) {
    return { payload: cache.payload, ageMs: now - cache.at, fresh: true };
  }

  if (cache && now - cache.at < CACHE_STALE_MS) {
    // serve stale instantly, refresh in the background
    if (!inflight) {
      inflight = aggregateNews()
        .then((payload) => {
          cache = { at: Date.now(), payload };
          inflight = null;
        })
        .catch(() => {
          inflight = null;
        });
    }
    return { payload: cache.payload, ageMs: now - cache.at, fresh: false };
  }

  if (!inflight) {
    inflight = aggregateNews()
      .then((payload) => {
        cache = { at: Date.now(), payload };
        inflight = null;
        return payload;
      })
      .catch((error) => {
        inflight = null;
        throw error;
      });
  }

  const payload = await inflight;
  return { payload, ageMs: 0, fresh: true };
}
