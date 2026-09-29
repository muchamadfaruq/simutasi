# ============================================================
#  SIMUTASI - image produksi
#  Multi-stage: dependensi dibangun terpisah agar image akhir kecil.
# ============================================================

# ---------- 1. Tahap dependensi ----------
FROM node:20-bookworm-slim AS deps

# Alat build disiapkan bila better-sqlite3 perlu dikompilasi
# (biasanya pakai binary siap pakai, jadi tahap ini cepat).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ---------- 2. Tahap runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY views ./views
COPY public ./public

RUN mkdir -p /data/files && chown -R node:node /data /app

USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
