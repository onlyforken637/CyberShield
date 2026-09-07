import { NextResponse } from "next/server";
import { getNewsSnapshot } from "@/lib/cyber/intel";

/**
 * CyberShield — /api/news
 *
 * Single aggregated live-news endpoint. The server pulls all 20 research
 * streams (direct XML first, public converter fallback), extracts the best
 * thumbnails, distills analyst briefs, dedupes and caches the result.
 * Responses stay fresh for 4 minutes; stale data is served instantly for
 * up to 30 minutes while a background refresh runs.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { payload, ageMs, fresh } = await getNewsSnapshot();
    return NextResponse.json(
      {
        ...payload,
        cache: { ageMs, fresh },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: `news aggregation failed: ${error instanceof Error ? error.message : "unknown"}`,
      },
      { status: 502 },
    );
  }
}
