import { NextRequest, NextResponse } from "next/server";

/**
 * CyberShield relay — /api/rss2json
 *
 * Server-side fallback for the public RSS→JSON conversion pipeline.
 * Used automatically by the client when the browser-direct call to
 * api.rss2json.com is unavailable (CORS gateways, rate limits, etc.).
 * A short in-memory TTL shields the public converter from request storms.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://api.rss2json.com/v1/api.json";
const CACHE_TTL_MS = 4 * 60 * 1000;

const cache = new Map<string, { at: number; body: string }>();

function cacheGet(key: string): string | null {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
  if (hit) cache.delete(key);
  return null;
}

export async function GET(request: NextRequest) {
  const rssUrl = request.nextUrl.searchParams.get("rss_url");
  if (!rssUrl || !/^https?:\/\//i.test(rssUrl)) {
    return NextResponse.json(
      { status: "error", message: "missing or invalid rss_url parameter" },
      { status: 400 },
    );
  }

  const cacheKey = rssUrl;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new NextResponse(cached, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  try {
    const upstream = `${UPSTREAM}?rss_url=${encodeURIComponent(rssUrl)}`;
    const res = await fetch(upstream, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 CyberShieldRelay/1.0",
        Accept: "application/json",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: `upstream HTTP ${res.status}` },
        { status: 502 },
      );
    }

    cache.set(cacheKey, { at: Date.now(), body: text });
    if (cache.size > 64) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: `relay fetch failed: ${error instanceof Error ? error.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
