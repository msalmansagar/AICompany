FROM node:20-alpine AS builder
WORKDIR /app

# Build shared types first
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
RUN cd shared && npm ci && npm run build

# Build backend
COPY backend/package.json backend/tsconfig.json ./backend/
RUN cd backend && npm ci
COPY backend/src ./backend/src
RUN cd backend && npm run build

# ── Production image ──────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json .

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/index.js"]
