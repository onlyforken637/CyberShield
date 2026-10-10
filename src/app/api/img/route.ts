import { NextRequest, NextResponse } from "next/server";

/**
 * CyberShield — /api/img
 *
 * Hotlink-safe image relay. Several upstream CDNs reject cross-site image
 * requests from browsers (403), which previously killed real thumbnails.
 * This proxy fetches the image server-side (with a same-origin Referer,
 * which hotlink allow-lists accept), validates it really is an image and
 * streams it back with caching. Private-network targets are blocked.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel function ceiling for the thumbnail relay.
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 250;

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\.local)$/i;

interface CacheEntry {
  at: number;
  contentType: string;
  body: ArrayBuffer;
}

const cache = new Map<string, CacheEntry>();

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

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("u");
  if (!raw) {
    return NextResponse.json({ error: "missing u parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol) || PRIVATE_HOST.test(target.hostname)) {
    return NextResponse.json({ error: "blocked target" }, { status: 403 });
  }

  const cached = cacheGet(target.href);
  if (cached) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "content-type": cached.contentType,
        "cache-control": "public, max-age=1800",
        "x-cybershield-imgproxy": "hit",
      },
    });
  }

  try {
    const res = await fetch(target.href, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        // same-site Referer satisfies most hotlink allow-lists
        Referer: `${target.origin}/`,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `upstream HTTP ${res.status}` }, { status: 404 });
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

    cacheSet(target.href, { at: Date.now(), contentType, body: buffer });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=1800",
        "x-cybershield-imgproxy": "miss",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `image relay failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }
}
