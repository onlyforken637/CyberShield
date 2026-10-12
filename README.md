# CyberShield — Real-Time Cyber Threat Intelligence Dashboard

**Live:** https://cybershield-news.vercel.app/

CyberShield fuses **19 live cybersecurity intelligence streams** into a single
mission-control dashboard: scored, categorized and severity-ranked threat
signals refreshed from the public internet on every cycle — **zero mock data,
zero API keys required to run**.

Created by **Umair Jamal** — tech enthusiast, 18, 12th grade student.

---

## What it does

- **19 live research streams** — The Hacker News, BleepingComputer, Krebs on
  Security, CISA, Malwarebytes, and more, fetched server-side with multi-failover
  relaying.
- **10 threat categories** — Ransomware, Data Breaches, Zero-Days, APT,
  Malware, Phishing, Cloud Security, IoT, Patch Alerts, Policy.
- **0–100 severity scoring** — every signal is scored and ranked
  (CRITICAL / HIGH / ELEVATED / MODERATE) with a live Threat Condition gauge.
- **CISA KEV catalog** — Known Exploited Vulnerabilities feed with cache +
  mirror fallback.
- **AI Analyst Verdict** — three-layer verdict (quick triage → deep analysis →
  recommended action). Uses a GLM uplink when credentials are present and
  falls back to a deterministic on-device analyst that never errors.
- **Auto thumbnails** — 3-layer chain: feed image → hotlink-safe CDN relay →
  generated matrix fallback, so every card renders.
- **Freshness** — in-memory caching with a 12-minute TTL; first sync fills the
  room, afterwards everything is instant.
- **Mission Resources** — the full PDF manual, 13-slide presentation and the
  explainer film are viewable directly inside the app.

## API endpoints

| Route | Purpose |
|---|---|
| `GET /api/news` | Scored + categorized live threat feed |
| `POST /api/brief` | AI analyst verdict for a signal (with graceful offline fallback) |
| `GET /api/cisa` | CISA KEV catalog + aggregate metrics |
| `GET /api/img` | Thumbnail relay / OG-image resolver (`?u=` / `?r=`) |
| `GET /api/rss2json` | RSS→JSON relay for secondary sources |
| `GET /api` | Health probe |

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Prisma (SQLite) · bun

## Run it locally

```bash
bun install
bun run dev        # → http://localhost:3000
```

## Deploy

Full step-by-step hosting guide (Vercel, Docker/VPS, Render) lives in
**[DEPLOY.md](./DEPLOY.md)**. On Vercel: import the repo, accept the detected
Next.js preset, deploy — no environment variables required.

> Note: without LLM credentials the AI verdict automatically runs the
> deterministic Offline Analyst (marked `degraded`) — every other feature is
> fully live. See DEPLOY.md to plug in any OpenAI-compatible provider.

## License

For educational and demonstration purposes.
