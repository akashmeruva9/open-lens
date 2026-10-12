# OpenLens api: REST/SSE + agent pipeline + media rendering (Cloud Run).
# Build from the repo root:  docker build -f services/api/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci -w @openlens/api -w @openlens/agents -w @openlens/media-worker -w @openlens/schemas -w @openlens/config --include-workspace-root \
 && (npm ci -w @openlens/publisher --no-save 2>/dev/null || true) \
 && npm run build -w @openlens/schemas -w @openlens/config -w @openlens/agents -w @openlens/media-worker \
 && (npm run build -w @openlens/publisher 2>/dev/null || true) \
 && npm run build -w @openlens/api

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/tmp/openlens WORK_DIR=/tmp/openlens/work PORT=8080 SOURCES_ROOT=/app
COPY --from=build /app /app
COPY data/sources /app/data/sources
WORKDIR /app/services/api
EXPOSE 8080
CMD ["node", "dist/server.js"]
