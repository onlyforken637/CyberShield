/**
 * CyberShield — shared text / time / math utilities.
 * All parsing is dependency-free and SSR-safe (no DOM access).
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  cent: "¢",
  pound: "£",
  yen: "¥",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  sect: "§",
  para: "¶",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  ntilde: "ñ",
};

/** Decode named + numeric HTML entities without touching the DOM. */
export function decodeEntities(input: string): string {
  if (!input) return "";
  return input.replace(
    /&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, code: string) => {
      if (code.charAt(0) === "#") {
        const isHex = code.charAt(1) === "x" || code.charAt(1) === "X";
        const num = parseInt(isHex ? code.slice(2) : code.slice(1), isHex ? 16 : 10);
        if (Number.isFinite(num) && num > 0 && num < 0x10ffff) {
          try {
            return String.fromCodePoint(num);
          } catch {
            return match;
          }
        }
        return match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    },
  );
}

/** Strip scripts/styles/tags and collapse whitespace into clean prose. */
export function stripHtml(html: string): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a concise ~2 sentence excerpt from an RSS HTML payload.
 */
export function buildExcerpt(html: string, maxChars = 240): string {
  const text = stripHtml(html);
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?=\s|$)/g) ?? [text];
  let out = "";
  let count = 0;
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (out && (count >= 2 || out.length + sentence.length > maxChars)) break;
    out = out ? `${out} ${sentence}` : sentence;
    count += 1;
    if (out.length >= maxChars) break;
  }
  if (!out) out = text.slice(0, maxChars);
  if (out.length > maxChars + 60) out = `${out.slice(0, maxChars).trimEnd()}…`;
  return out;
}

/** Split an HTML payload into clean text paragraphs (no raw tags). */
export function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "")
    .split(/<\/(?:p|div|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi)
    .map((segment) => stripHtml(segment))
    .filter((segment) => segment.length > 1);
}

/**
 * rss2json normalizes pubDate to "YYYY-MM-DD HH:MM:SS" (UTC, space separated),
 * which JS Date.parse treats as *local* time. Normalize to UTC explicitly,
 * falling back to native parsing for RFC-822 strings.
 */
export function parseUtcDate(value: string | undefined | null): number {
  if (!value) return 0;
  const normalized = value.trim();
  const isoLike = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(normalized);
  if (isoLike) {
    const ms = Date.parse(`${isoLike[1]}T${isoLike[2]}Z`);
    if (Number.isFinite(ms)) return ms;
  }
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : 0;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format an epoch (ms) as `YYYY-MM-DD HH:MM:SS UTC`. */
export function formatUtc(ms: number, withDate = true): string {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--:--";
  const d = new Date(ms);
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  return withDate
    ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${time} UTC`
    : time;
}

/** "14 mins ago" style relative timestamps. */
export function timeAgo(ts: number, now = Date.now()): string {
  if (!ts) return "unknown";
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 8) return `${days} day${days === 1 ? "" : "s"} ago`;
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Deterministic 32-bit string hash (for canvas placeholder seeds). */
export function hashCode(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG so generated thumbnails are stable per article. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalize an article link for cross-feed deduplication. */
export function normalizeKey(link: string): string {
  if (!link) return "";
  return link
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function clampText(value: string, max: number): string {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
