FROM node:20-alpine AS builder
WORKDIR /app

# Build shared types first
COPY shared/package.json shared/tsconfig.json ./shared/
COPY shared/src ./shared/src
RUN cd shared && npm ci && npm run build

# Build frontend
COPY frontend/package.json frontend/vite.config.ts frontend/tsconfig.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/src ./frontend/src
COPY frontend/index.html ./frontend/
COPY frontend/.env.production ./frontend/.env

ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_TENANT_ID
ARG VITE_API_SCOPE
ARG VITE_API_BASE_URL

RUN cd frontend && npm run build

# ── Nginx production image ────────────────────────────────────
FROM nginx:1.25-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost/api/health || exit 1
