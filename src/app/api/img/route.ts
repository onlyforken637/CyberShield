import { NextRequest, NextResponse } from "next/server";

/**
 * CyberShield — /api/img
 *
 * Hotlink-safe image relay with two modes:
 *
 *  1. `?u=<image-url>`  — direct proxy. Several upstream CDNs reject
 *     cross-site image requests from browsers (403), which previously
 *     killed real thumbnails. This proxy fetches the image server-side
 *     (with a same-origin Referer, which hotlink allow-lists accept),
 *     validates it really is an image and streams it back with caching.
 *
 *  2. `?r=<article-url>` — lazy resolver. For items whose feed shipped
 *     no image AND whose og:image scrape was missed by the sync cycle,
 *     the client asks this endpoint to fetch the article HTML, extract
 *     its og:image / twitter:image and then relay that image. Results
 *     are memory-cached so each article is resolved at most once.
 *
 * Private-network targets are blocked in both modes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel function ceiling for the thumbnail relay.
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;
const RESOLVE_TIMEOUT_MS = 7_000;
const RESOLVE_CACHE_MAX = 600;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\.local)$/i;

interface CacheEntry {
  at: number;
  contentType: string;
  body: ArrayBuffer;
}

interface ResolveEntry {
  at: number;
  image: string | null;
}

const cache = new Map<string, CacheEntry>();
const resolveCache = new Map<string, ResolveEntry>();

function cacheGet(key: string): CacheEntry | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  if (hit) cache.delete(key);
  return null;
}

function cacheSet(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function resolveCacheGet(key: string): string | null | undefined {
  const hit = resolveCache.get(key);
  if (!hit) return undefined;
  const ttl = hit.image ? 6 * 60 * 60 * 1000 : CACHE_TTL_MS;
  if (Date.now() - hit.at < ttl) return hit.image;
  resolveCache.delete(key);
  return undefined;
}

function resolveCacheSet(key: string, image: string | null): void {
  resolveCache.set(key, { at: Date.now(), image });
  if (resolveCache.size > RESOLVE_CACHE_MAX) {
    const oldest = resolveCache.keys().next().value;
    if (oldest) resolveCache.delete(oldest);
  }
}

/* ── og:image extraction (article HTML → best image URL) ─────────── */

const OG_META_PATTERNS: RegExp[] = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
  /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i,
];

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function resolveOgImage(articleUrl: string): Promise<string | null> {
  const cached = resolveCacheGet(articleUrl);
  if (cached !== undefined) return cached;

  let image: string | null = null;
  try {
    const res = await fetch(articleUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });
    if (res.ok) {
      // og:image lives in <head>; cap the decode to keep large pages cheap
      const buffer = await res.arrayBuffer();
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer.slice(0, 400_000));
      for (const pattern of OG_META_PATTERNS) {
        const match = pattern.exec(html);
        if (!match) continue;
        const candidate = decodeEntities(match[1] ?? "").trim();
        if (!/^https?:\/\//i.test(candidate)) continue;
        image = candidate;
        break;
      }
    }
  } catch {
    // article page unreachable — fall through with null
  }

  resolveCacheSet(articleUrl, image);
  return image;
}

/* ── shared image relay ───────────────────────────────────────────── */

/**
 * Fetch an upstream image. Direct server-side fetch first (with a
 * same-site Referer for hotlink allow-lists); if the CDN blocks us
 * (Cloudflare 403s on datacenter IPs are common), retry through the
 * public wsrv.nl image CDN, whose egress IPs are typically allow-listed.
 * The wsrv retry also downsizes to a 640px-wide JPEG — plenty for a
 * 152px card thumbnail and much cheaper to cache.
 */
async function relayFetch(imageUrl: string, refererOrigin: string): Promise<Response | null> {
  try {
    const res = await fetch(imageUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: `${refererOrigin}/`,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (res.ok) return res;
  } catch {
    // fall through to the CDN retry
  }
  try {
    const res = await fetch(
      `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&w=640&output=jpg&q=72`,
      {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": BROWSER_UA, Accept: "image/*,*/*;q=0.8" },
      },
    );
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function serveImage(imageUrl: string, refererOrigin: string, viaHeader: string): Promise<NextResponse> {
  const cached = cacheGet(imageUrl);
  if (cached) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "content-type": cached.contentType,
        "cache-control": "public, max-age=1800",
        "x-cybershield-imgproxy": `hit:${viaHeader}`,
      },
    });
  }

  const res = await relayFetch(imageUrl, refererOrigin);
  if (!res) {
    return NextResponse.json({ error: "upstream unreachable" }, { status: 404 });
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "not an image" }, { status: 415 });
  }

  const lengthHeader = Number(res.headers.get("content-length") ?? "0");
  if (lengthHeader > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  cacheSet(imageUrl, { at: Date.now(), contentType, body: buffer });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=1800",
      "x-cybershield-imgproxy": `miss:${viaHeader}`,
    },
  });
}

function parseTarget(raw: string): URL | null {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) return null;
  return target;
}

export async function GET(request: NextRequest) {
  const direct = request.nextUrl.searchParams.get("u");
  const resolve = request.nextUrl.searchParams.get("r");

  if (!direct && !resolve) {
    return NextResponse.json({ error: "missing u or r parameter" }, { status: 400 });
  }

  // mode 2 — lazy og:image resolution for feed items without media
  if (resolve) {
    const article = parseTarget(resolve);
    if (!article) {
      return NextResponse.json({ error: "blocked target" }, { status: 403 });
    }
    const image = await resolveOgImage(article.href);
    if (!image) {
      return NextResponse.json({ error: "no og:image found" }, { status: 404 });
    }
    const imageUrl = parseTarget(image);
    if (!imageUrl) {
      return NextResponse.json({ error: "resolved image blocked" }, { status: 403 });
    }
    // referer = article origin — satisfies CDNs that allow their own site
    return serveImage(imageUrl.href, imageUrl.origin, "resolve");
  }

  // mode 1 — direct hotlink-safe proxy
  const target = parseTarget(direct!);
  if (!target) {
    return NextResponse.json({ error: "blocked target" }, { status: 403 });
  }
  return serveImage(target.href, target.origin, "direct");
}
