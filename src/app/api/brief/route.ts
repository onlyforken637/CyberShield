import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { hashCode, normalizeKey } from "@/lib/cyber/utils";

/**
 * CyberShield — /api/brief
 *
 * AI Analyst Verdict generator. Given a live article's metadata, the GLM
 * model distills a SOC-grade threat brief (threat class, severity rating,
 * what happened, why it matters, immediate actions). Completed verdicts
 * are cached in SQLite (IntelBrief) keyed by normalized article URL so
 * repeat investigations are instant; `force` bypasses the archive.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BriefRequest {
  link?: string;
  title?: string;
  sourceName?: string;
  categoryIds?: string[];
  cves?: string[];
  orgs?: string[];
  lede?: string;
  highlights?: string[];
  excerpt?: string;
  severity?: { score?: number; label?: string };
  force?: boolean;
}

const SYSTEM_PROMPT = `You are CyberShield Analyst, an automated senior threat-intelligence officer briefing a Security Operations Center.
Given raw intel about one cybersecurity news article, produce a tight, high-signal verdict.
Respond in EXACTLY this plain-text format (no markdown headers, no bullets other than the arrows shown, max ~120 words):

THREAT CLASS: <2-4 word classification, e.g. "Ransomware Campaign", "Zero-Day Exploitation">
SEVERITY RATING: <CRITICAL|HIGH|ELEVATED|MODERATE> <score/100> — <5-12 word justification>
WHAT HAPPENED: <2-3 punchy sentences, concrete facts from the intel only>
WHY IT MATTERS: <1-2 sentences on defender impact>
IMMEDIATE ACTIONS: <3 lines, each starting with "▸ ", concrete and specific>

Rules: only use facts present in the intel; never invent CVE IDs, numbers or organizations; be direct, no hedging, no disclaimers.`;

function clamp(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

export async function POST(request: NextRequest) {
  let body: BriefRequest;
  try {
    body = (await request.json()) as BriefRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const title = clamp(body.title, 300);
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const urlKey = body.link ? normalizeKey(body.link) || `t:${hashCode(title)}` : `t:${hashCode(title)}`;

  // ── 1. archive lookup (instant repeat investigations) ────────────
  if (!body.force) {
    try {
      const cached = await db.intelBrief.findUnique({ where: { urlKey } });
      if (cached) {
        return NextResponse.json({
          brief: cached.brief,
          cached: true,
          generatedAt: cached.updatedAt.toISOString(),
          model: cached.model,
        });
      }
    } catch {
      // archive unavailable — fall through to live analysis
    }
  }

  // ── 2. live GLM analysis ─────────────────────────────────────────
  const cves = Array.isArray(body.cves) ? body.cves.slice(0, 4) : [];
  const orgs = Array.isArray(body.orgs) ? body.orgs.slice(0, 4) : [];
  const categories = Array.isArray(body.categoryIds) ? body.categoryIds.slice(0, 4) : [];
  const highlights = Array.isArray(body.highlights) ? body.highlights.slice(0, 3) : [];
  const severity = body.severity ?? {};

  const intelLines = [
    `TITLE: ${title}`,
    body.sourceName ? `SOURCE: ${body.sourceName}` : "",
    categories.length ? `THREAT DOMAINS: ${categories.join(", ")}` : "",
    cves.length ? `REFERENCED CVES: ${cves.join(", ")}` : "",
    orgs.length ? `NAMED ENTITIES: ${orgs.join(", ")}` : "",
    severity.label ? `PIPELINE SEVERITY ESTIMATE: ${severity.label} (${severity.score ?? "?"}/100)` : "",
    body.lede ? `LEDE: ${clamp(body.lede, 400)}` : "",
    highlights.length ? `HIGHLIGHTS:\n${highlights.map((h) => `- ${clamp(h, 300)}`).join("\n")}` : "",
    body.excerpt ? `RAW EXCERPT:\n${clamp(body.excerpt, 1600)}` : "",
  ].filter(Boolean);

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: intelLines.join("\n") },
      ],
      thinking: { type: "disabled" },
    });

    const brief = (completion.choices[0]?.message?.content ?? "").trim();
    if (!brief) {
      return NextResponse.json({ error: "analyst model returned an empty verdict" }, { status: 502 });
    }

    // ── 3. persist to the archive ─────────────────────────────────
    try {
      await db.intelBrief.upsert({
        where: { urlKey },
        update: { brief, title, sourceId: clamp(body.sourceName, 80), model: "glm" },
        create: {
          urlKey,
          url: clamp(body.link, 900) || `title:${title}`,
          title,
          sourceId: clamp(body.sourceName, 80),
          brief,
          model: "glm",
        },
      });
    } catch {
      // archive write failed — the verdict is still delivered live
    }

    return NextResponse.json({ brief, cached: false, generatedAt: new Date().toISOString(), model: "glm" });
  } catch (error) {
    return NextResponse.json(
      { error: `analyst uplink failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 502 },
    );
  }
}
