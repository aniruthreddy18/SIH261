# Pravah AI — production image (used by Railway; works on any Docker host).
# One long-running Node server. The SQLite database and uploaded documents live on a persistent
# volume mounted at /data, so they survive redeploys.
FROM node:22-bookworm-slim

# openssl: Prisma engines. curl: optional AI model download. fonts: server-side page previews.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first, for layer caching. Dev dependencies stay installed: the start script uses
# the Prisma CLI (migrations) and tsx (first-run demo seed).
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# Optional local AI extraction fallback (~119 MB, checksum-verified). A failed download does not
# fail the build: the app runs without the AI fallback and System Settings shows it as unavailable.
ARG INSTALL_AI_MODEL=true
RUN if [ "$INSTALL_AI_MODEL" = "true" ]; then npm run ai:setup || echo "WARNING: local AI model not installed; AI fallback disabled."; fi

# The build never connects to the database; a throwaway URL keeps Prisma's env check satisfied.
RUN npx prisma generate && DATABASE_URL="file:/tmp/build.db" npm run build

ENV NODE_ENV=production \
    DATABASE_URL="file:/data/pravah.db" \
    STORAGE_DIR="/data/storage" \
    DEMO_MODE="true" \
    COOKIE_SECURE="true"

EXPOSE 3000
CMD ["sh", "scripts/docker-start.sh"]
