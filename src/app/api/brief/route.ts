import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";
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
 *
 * UPLINK RESILIENCE — the published-domain deployment may run where the
 * sandbox credential file is missing or its session token is rejected
 * (401 invalid X-Token). The live analysis therefore walks a fallback
 * chain and can never dead-end on an auth error:
 *
 *   1. SANDBOX CONFIG  — credentials from .z-ai-config (cwd → home → /etc),
 *      called directly on the wire (identical format to the SDK).
 *   2. FORWARDED CREDS — if the gateway/proxy injects fresh per-user auth
 *      headers into the request (x-token / x-chat-id / x-user-id), retry
 *      with those instead of the (possibly stale) file token.
 *   3. OFFLINE ANALYST — deterministic heuristic verdict distilled from the
 *      server-side intel pipeline (lede, highlights, CVEs, orgs, severity).
 *      Returned with `degraded: true` and NOT archived, so a later live
 *      attempt (REANALYZE) can replace it with a GLM verdict.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel function ceiling (Hobby max = 60s) — keeps the 3-layer AI verdict
// chain alive on the free plan.
export const maxDuration = 60;

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

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

const DEFAULT_LLM_BASE = "https://internal-api.z.ai/v1";
const DEFAULT_LLM_KEY = "Z.ai";
const LLM_TIMEOUT_MS = 45_000;

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

/* ── credential resolution (mirrors the SDK's loadConfig order) ───── */

async function readConfigFile(filePath: string): Promise<LlmConfig | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    if (parsed.baseUrl && parsed.apiKey) {
      return {
        baseUrl: parsed.baseUrl,
        apiKey: parsed.apiKey,
        chatId: parsed.chatId,
        userId: parsed.userId,
        token: parsed.token,
      };
    }
  } catch {
    // missing / unreadable / invalid — try the next location
  }
  return null;
}

async function resolveFileConfig(): Promise<LlmConfig | null> {
  const candidates = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];
  for (const candidate of candidates) {
    const config = await readConfigFile(candidate);
    if (config) return config;
  }
  return null;
}

/**
 * Credentials forwarded by the gateway for THIS request, if any. Takes the
 * first token-ish header it finds; chat/user ids enrich the upstream call.
 */
function resolveForwardedConfig(request: NextRequest, fileConfig: LlmConfig | null): LlmConfig | null {
  const headers = request.headers;
  const token =
    headers.get("x-token") ??
    headers.get("x-z-ai-token") ??
    headers.get("x-auth-token") ??
    headers.get("x-access-token");
  if (!token) return null;
  if (fileConfig && token === fileConfig.token) return null; // identical — no point retrying
  const chatId = headers.get("x-chat-id") ?? headers.get("x-session-id") ?? undefined;
  const userId = headers.get("x-user-id") ?? undefined;
  return {
    baseUrl: fileConfig?.baseUrl ?? DEFAULT_LLM_BASE,
    apiKey: fileConfig?.apiKey ?? DEFAULT_LLM_KEY,
    chatId: chatId ?? fileConfig?.chatId,
    userId: userId ?? fileConfig?.userId,
    token,
  };
}

/* ── the wire call (same format the SDK emits, plus a hard timeout) ── */

async function callLlm(config: LlmConfig, userContent: string): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
      "X-Z-AI-From": "Z",
      ...(config.chatId ? { "x-chat-id": config.chatId } : {}),
      ...(config.userId ? { "x-user-id": config.userId } : {}),
      ...(config.token ? { "x-token": config.token } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API request failed with status ${response.status}: ${body.slice(0, 180)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

/* ── tier 3: deterministic offline analyst ────────────────────────── */

const CLASS_BY_CATEGORY: Record<string, string> = {
  ransomware: "Ransomware Operation",
  vulnerabilities: "Vulnerability Exploitation",
  breaches: "Data Breach / Intrusion",
  apt: "APT Activity",
  malware: "Malware Campaign",
  phishing: "Phishing / Social Engineering",
  "ai-security": "AI Security Incident",
  cloud: "Cloud Security Event",
  "mobile-iot": "Mobile / IoT Threat",
};

function heuristicBrief(input: {
  title: string;
  sourceName?: string;
  categoryIds?: string[];
  cves?: string[];
  orgs?: string[];
  lede?: string;
  highlights?: string[];
  severity?: { score?: number; label?: string };
}): string {
  const categoryIds = input.categoryIds ?? [];
  const threatClass =
    categoryIds.map((id) => CLASS_BY_CATEGORY[id]).find(Boolean) ?? "Cybersecurity Development";

  const score = Math.min(100, Math.max(0, Math.round(input.severity?.score ?? 50)));
  const label = (input.severity?.label ?? "ELEVATED").toUpperCase();

  const cves = (input.cves ?? []).slice(0, 3);
  const orgs = (input.orgs ?? []).slice(0, 3);
  const highlights = (input.highlights ?? []).filter(Boolean).slice(0, 2);

  const lede = input.lede?.trim();
  const happened = [lede, ...highlights].filter(Boolean).slice(0, 3).join(" ");
  const happenedText =
    happened.length > 0 ? happened : `${input.title} — full upstream details are still syncing into the pipeline.`;

  const actors = orgs.length ? ` Attributed activity around ${orgs.join(", ")} raises the stakes.` : "";
  const cveNote = cves.length
    ? ` Tracked identifiers ${cves.join(", ")} give defenders a direct patching anchor.`
    : "";

  const whyMatters =
    label === "CRITICAL" || score >= 80
      ? `High-impact exposure with immediate exploitation potential${cveNote} — unpatched estates are the prime target.${actors}`
      : score >= 60
        ? `Material risk for exposed systems${cveNote}; defenders should validate exposure before it is weaponized.${actors}`
        : `Situational awareness matters here${cveNote}; watch for follow-on exploitation as details mature.${actors}`;

  const actions: string[] = [];
  if (cves.length) actions.push(`▸ Prioritize patching / virtual patching for ${cves.join(", ")}`);
  else actions.push("▸ Validate exposure of any systems named in the report against current inventories");
  if (orgs.length) actions.push(`▸ Hunt for indicators tied to ${orgs.join(", ")} in EDR and proxy logs`);
  else actions.push("▸ Sweep telemetry for the TTPs described and alert on matching patterns");
  actions.push(
    label === "CRITICAL" || score >= 80
      ? "▸ Brief incident response on-call and pre-stage containment playbooks"
      : "▸ Add the story to the watchlist and re-assess at the next intel cycle",
  );

  return [
    `THREAT CLASS: ${threatClass}`,
    `SEVERITY RATING: ${label} ${score}/100 — heuristic pipeline score from exploitation signals, exposure and recency`,
    `WHAT HAPPENED: ${happenedText}`,
    `WHY IT MATTERS: ${whyMatters}`,
    "IMMEDIATE ACTIONS:",
    ...actions.slice(0, 3),
  ].join("\n");
}

/* ── handler ──────────────────────────────────────────────────────── */

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

  // ── 2. live GLM analysis (resilient uplink chain) ────────────────
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

  const userContent = intelLines.join("\n");

  const attempts: Array<{ via: string; config: LlmConfig }> = [];
  const fileConfig = await resolveFileConfig();
  if (fileConfig) attempts.push({ via: "sandbox-config", config: fileConfig });
  const forwardedConfig = resolveForwardedConfig(request, fileConfig);
  if (forwardedConfig) attempts.push({ via: "forwarded-credentials", config: forwardedConfig });

  let brief = "";
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const content = await callLlm(attempt.config, userContent);
      if (content) {
        brief = content;
        break;
      }
      lastError = new Error("analyst model returned an empty verdict");
    } catch (error) {
      lastError = error;
    }
  }

  if (brief) {
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
  }

  // ── 4. offline analyst fallback — never dead-end on an auth error ──
  if (lastError instanceof Error && lastError.name === "TimeoutError") {
    // A hanging uplink plus a heuristic answer is still better than a spinner;
    // fall through to the heuristic below.
  }

  const fallback = heuristicBrief({
    title,
    sourceName: body.sourceName,
    categoryIds: categories,
    cves,
    orgs,
    lede: body.lede,
    highlights,
    severity: severity as { score?: number; label?: string },
  });

  return NextResponse.json({
    brief: fallback,
    cached: false,
    degraded: true,
    model: "heuristic",
    generatedAt: new Date().toISOString(),
    detail: lastError instanceof Error ? lastError.message.slice(0, 200) : undefined,
  });
}
