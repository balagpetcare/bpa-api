# ─── Stage 1: Install all dependencies (including devDeps for build) ────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: Build TypeScript ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: Production dependencies only ───────────────────────────────────────
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 4: Runtime image ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

# Non-root user for security
RUN addgroup --system --gid 1001 bpa && \
    adduser --system --uid 1001 --ingroup bpa bpa

# Copy compiled output
COPY --from=builder  --chown=bpa:bpa /app/dist          ./dist
# Copy project assets used at runtime, including embedded PDF fonts.
COPY --from=builder  --chown=bpa:bpa /app/assets        ./assets
# Copy Prisma schema and generated client so migrate deploy works at runtime
COPY --from=builder  --chown=bpa:bpa /app/prisma        ./prisma
COPY --from=builder  --chown=bpa:bpa /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prod-deps --chown=bpa:bpa /app/node_modules  ./node_modules
COPY --from=builder  --chown=bpa:bpa /app/package.json  ./package.json
COPY --chown=bpa:bpa docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/uploads && chown bpa:bpa /app/uploads

USER bpa

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/v1/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
