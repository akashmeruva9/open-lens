# OpenLens web (Next.js standalone) for Cloud Run.
# Build from the repo root:  docker build -f apps/web/Dockerfile --build-arg API_URL=https://... .
# NEXT_PUBLIC_* values are inlined at build time, so the api URL is a build arg.
FROM node:24-bookworm-slim AS build
ARG API_URL
ARG SITE_URL=""
ENV NEXT_PUBLIC_API_URL=$API_URL NEXT_PUBLIC_SITE_URL=$SITE_URL NEXT_PUBLIC_AUTH_MODE=firebase NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci -w @openlens/web -w @openlens/config -w @openlens/schemas -w @openlens/client --include-workspace-root \
 && npm run build -w @openlens/web

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
