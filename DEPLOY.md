# CyberShield v3 — Free Hosting Guide (Your Own Domain)

This is the **v3** build of CyberShield: a Next.js 16 (App Router) dashboard with
server-side API routes. It needs **no external database and no paid services** —
all caching is in-memory plus one optional SQLite file, and every feed is fetched
from the public internet at request time.

---

## What works where (honest feature matrix)

| Feature | On your host | Notes |
|---|---|---|
| 19 live research streams | ✅ Full | Fetched server-side, multi-failover relay |
| Thumbnails (hotlink relay) | ✅ Full | `/api/img` in-memory cache |
| CISA KEV catalog + gauge | ✅ Full | Public JSON + mirror fallback |
| Ranked threat board / filters | ✅ Full | Pure client + live data |
| AI Analyst Verdict | ⚠️ Offline Analyst | No sandbox credentials on your host → deterministic heuristic verdict (marked `degraded`), **never errors**. See “Restore live AI verdicts” to re-enable |
| Verdict archive (instant re-open) | ✅ Docker/VPS · skipped on Vercel | SQLite cache; safe to skip |

---

## PATH A — Vercel (recommended · free · ~10 minutes)

Vercel free (Hobby) supports custom domains, automatic HTTPS and zero config for Next.js.

### 1. Extract & push to GitHub

```bash
tar -xzf cybershield-v3.tar.gz -C cybershield && cd cybershield
git init && git add -A && git commit -m "CyberShield v3"
# create an empty PRIVATE repo on github.com first, then:
git remote add origin https://github.com/<you>/cybershield.git
git push -u origin main
```

### 2. Import on Vercel

1. Go to **vercel.com** → sign in with GitHub → **Add New… → Project**.
2. Import the repo. Framework preset auto-detects **Next.js** — change nothing.
   - No environment variables are required.
   - (`postinstall` already runs `prisma generate`; if the first build ever complains
     about Prisma, set the Build Command to: `bunx prisma generate && bun run build`)
3. Click **Deploy**. First build takes ~2 minutes.

### 3. Attach your domain

1. In the project: **Settings → Domains → Add** → enter `yourdomain.com` (and `www`).
2. At your registrar's DNS page, add exactly what Vercel shows (current defaults):

| Record | Name | Value |
|---|---|---|
| A | `@` (apex) | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

3. Wait for DNS to propagate (minutes to a few hours). HTTPS certificates are
   issued automatically. Done — `https://yourdomain.com` is live.

> No `vercel.json` is needed: API time limits are baked into the routes
> themselves (`export const maxDuration = 60` inside `src/app/api/*/route.ts`),
> so the initial 19-source sync is never cut off on the free plan.
>
> ⚠️ If you add your own `vercel.json`, do NOT put a `functions` block with
> `src/app/api/...` paths in it — Vercel only accepts `functions` patterns for
> the legacy `api/` directory and fails the build with: `The pattern ...
> doesn't match any Serverless Functions inside the `api` directory`.

---

## PATH B — Docker (any VPS, Render, Fly.io — full features incl. verdict archive)

A `Dockerfile` is included. The container is self-contained: SQLite verdict cache
works inside it (writable filesystem).

```bash
tar -xzf cybershield-v3.tar.gz -C cybershield && cd cybershield
docker build -t cybershield-v3 .
docker run -d --name cybershield -p 3000:3000 --restart unless-stopped cybershield-v3
# → http://<server-ip>:3000  (put Caddy/Nginx in front for HTTPS, or use path 2b)
```

### 2b. Render.com free tier (no server to manage)

1. **render.com** → **New → Web Service** → connect your GitHub repo (from Path A step 1).
2. Runtime: **Docker** (it finds the Dockerfile) → Plan: **Free** → **Create**.
3. Custom domain: **Settings → Custom Domains** → add your domain → add the shown
   `CNAME` record at your registrar. HTTPS is automatic.
4. Free instances sleep after ~15 min idle; the first visit afterwards takes
   ~40s to wake (the dashboard shows its boot screen while syncing — that's normal).

> Free tiers with 512 MB RAM can OOM during `next build`. If Render's build dies,
> build the image locally (or with a free GitHub Actions runner), push it to
> Docker Hub, and use Render's **Deploy from image registry** instead.

---

## Restore live AI verdicts (optional)

The uplink reads a `.z-ai-config` JSON (`{"baseUrl": "...", "apiKey": "..."}`)
and speaks the **OpenAI-compatible** `/chat/completions` format — so any
OpenAI-compatible provider works (Groq, OpenRouter, a local llama/vLLM server, …).

Docker/VPS:

```bash
echo '{"baseUrl":"https://api.groq.com/openai/v1","apiKey":"gsk_..."}' > /opt/cs/z-ai-config.json
docker rm -f cybershield
docker run -d --name cybershield -p 3000:3000 \
  -v /opt/cs/z-ai-config.json:/app/.z-ai-config:ro \
  --restart unless-stopped cybershield-v3
```

On Vercel there is no persistent filesystem — keep the Offline Analyst (it is
fully functional) or proxy the LLM call through your own service.

---

## Local sanity check before deploying

```bash
bun install          # or: npm install
bun run build        # or: npm run build
bun .next/standalone/server.js   # or: node .next/standalone/server.js
# → open http://localhost:3000
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| First load takes seconds, "SYNCING" chips | Normal — 19 feeds are being fetched; the 12-min TTL cache takes over afterwards |
| Vercel build fails on Prisma | Build Command → `bunx prisma generate && bun run build` |
| Vercel build fails with `The pattern "src/app/api/..." defined in functions doesn't match any Serverless Functions` | A `functions` block for App Router routes in `vercel.json` is not supported by Vercel — delete `vercel.json` (or remove its `functions` key) and redeploy. Time limits are already handled inside the route files |
| DNS not resolving yet | New records can take up to a few hours; check with `dig yourdomain.com` |
| AI verdict says nothing live | Expected without credentials — add a provider config (see above) or enjoy the Offline Analyst |
| Render build killed | 512 MB build OOM — build the image elsewhere and deploy from a registry |
