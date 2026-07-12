FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
RUN npm ci

# ── build web ─────────────────────────────────────────────────────────────────
FROM deps AS build-web
COPY apps/web ./apps/web
RUN npm run build -w apps/web

# ── build server ──────────────────────────────────────────────────────────────
FROM deps AS build-server
COPY apps/server ./apps/server
RUN npm run build -w apps/server

# ── production image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev

COPY --from=build-server /app/apps/server/dist ./apps/server/dist
COPY --from=build-web    /app/apps/web/dist    ./apps/web/dist

ENV NODE_ENV=production
ENV PORT=3001
ENV SERVE_WEB=1

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
