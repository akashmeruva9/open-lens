# OpenLens api: REST/SSE + agent pipeline + media rendering (Cloud Run).
# Build from the repo root:  docker build -f services/api/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
# One npm ci for every workspace the api needs (a second npm ci would wipe node_modules).
RUN npm ci -w @openlens/api -w @openlens/agents -w @openlens/media-worker -w @openlens/publisher \
      -w @openlens/schemas -w @openlens/config --include-workspace-root \
 && npm run build -w @openlens/schemas -w @openlens/config -w @openlens/agents -w @openlens/media-worker -w @openlens/publisher \
 && npm run build -w @openlens/api

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/tmp/openlens WORK_DIR=/tmp/openlens/work PORT=8080 SOURCES_ROOT=/app REQUIRE_PRESENTER=1
COPY --from=build /app /app
COPY data/sources /app/data/sources
# Presenter portraits + idle clips: media.ts reads /app/data/presenters; without them the render has no avatar.
COPY data/presenters /app/data/presenters
# Country outlines for locator-map beats (Natural Earth, public domain).
COPY data/geo /app/data/geo
WORKDIR /app/services/api
EXPOSE 8080
CMD ["node", "dist/server.js"]
