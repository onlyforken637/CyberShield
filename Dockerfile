# CyberShield v3 — self-contained production image (bun build → standalone run)
FROM oven/bun:1 AS build
WORKDIR /app

# install deps first (cached layer); prisma schema present so postinstall generate works
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# full source
COPY . .

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/db/custom.db
RUN bunx prisma generate && bun run build

# ── runtime ────────────────────────────────────────────────────────
FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/db/custom.db

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/db ./db

EXPOSE 3000
CMD ["bun", "server.js"]
