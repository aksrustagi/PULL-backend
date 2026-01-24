# ==============================================================================
# PULL Temporal Worker Dockerfile
# ==============================================================================
# Multi-stage build for optimized Temporal worker container
# ==============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY apps/workers/package.json ./apps/workers/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules

# Copy source files
COPY . .

# Build packages
RUN pnpm turbo build --filter=@pull/workers...

# Stage 3: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Security: Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 temporal

# Set environment
ENV NODE_ENV=production
ENV TEMPORAL_WORKER_GRACEFUL_SHUTDOWN_TIMEOUT=30000

# Install production dependencies only
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy package files
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-lock.yaml ./
COPY --from=deps /app/pnpm-workspace.yaml ./

# Copy built packages
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/db/convex ./packages/db/convex
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=builder /app/apps/workers/package.json ./apps/workers/

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile

# Set ownership
RUN chown -R temporal:nodejs /app

USER temporal

# Health check endpoint port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Start worker
CMD ["node", "apps/workers/dist/index.js"]
