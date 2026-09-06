import { NextResponse } from "next/server";

/**
 * CyberShield relay — /api/cisa
 *
 * Server-side fallback for the official CISA Known Exploited Vulnerabilities
 * catalog. Tries cisa.gov first; if the serving edge rejects datacenter
 * traffic, falls back to the aboutcode-org mirror — an auto-synced 1:1 copy
 * of the very same official catalog JSON. Responses are memory-cached to
 * keep the 1.7 MB catalog download off the hot path.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFICIAL_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const MIRROR_URL =
  "https://raw.githubusercontent.com/aboutcode-org/aboutcode-mirror-kev/main/known_exploited_vulnerabilities.json";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  via: "relay" | "mirror";
  catalog: unknown;
}

let cache: CacheEntry | null = null;

async function tryFetch(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 CyberShieldRelay/1.0",
      Accept: "application/json, */*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { vulnerabilities?: unknown };
  if (!Array.isArray(json.vulnerabilities)) throw new Error("payload is not a KEV catalog");
  return json;
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { via: cache.via, catalog: cache.catalog, cached: true, fetchedAt: cache.at },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ── official CISA feed ───────────────────────────────────────────
  try {
    const catalog = await tryFetch(OFFICIAL_URL, 20_000);
    cache = { at: Date.now(), via: "relay", catalog };
    return NextResponse.json(
      { via: "relay", catalog, cached: false, fetchedAt: cache.at },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // continue to mirror
  }

  // ── auto-synced mirror of the same official catalog ─────────────
  try {
    const catalog = await tryFetch(MIRROR_URL, 30_000);
    cache = { at: Date.now(), via: "mirror", catalog };
    return NextResponse.json(
      { via: "mirror", catalog, cached: false, fetchedAt: cache.at },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: `KEV relay failed: ${error instanceof Error ? error.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
