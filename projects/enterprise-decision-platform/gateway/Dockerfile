# EDP Decision Gateway — transport-only REST façade (ADR-EDS-02).
#
# Build context is this directory:
#   docker build -t edp-gateway:local projects/enterprise-decision-platform/gateway
#
# No configuration is baked in. Credentials and caller API keys are supplied at run time
# (see README "Configuration") — never with --build-arg, which persists in image history.

# --- build: compile TypeScript with dev dependencies present -------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- production dependencies only ----------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- runtime -------------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# Run unprivileged. The node image ships a `node` user; nothing here needs write access.
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8787

# Liveness only — /health is exempt from rate limiting so a probe cannot be throttled out.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
