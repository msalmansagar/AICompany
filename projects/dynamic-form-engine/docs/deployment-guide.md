# Deployment Guide — Dynamic Form Engine Portal

## Environments

| Environment | Backend URL | Frontend URL | CRM | Purpose |
|-------------|-------------|--------------|-----|---------|
| Local | http://localhost:4000 | http://localhost:5173 | Mock or real | Development |
| Dev | https://dfe-api-dev.azurewebsites.net | https://dfe-dev.azurestaticapps.net | Dataverse sandbox | Integration testing |
| UAT | https://dfe-api-uat.azurewebsites.net | https://dfe-uat.azurestaticapps.net | Dataverse UAT | User acceptance |
| Production | https://dfe-api.azurewebsites.net | https://dfe.qdb.qa | Dataverse prod | Live |

---

## Docker

### Backend Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY backend/ ./backend/
RUN cd shared && npm ci && npm run build
RUN cd backend && npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json .
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Frontend (served as static files)
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY shared/ ./shared/
COPY frontend/ ./frontend/
RUN cd shared && npm ci && npm run build
RUN cd frontend && npm ci && npm run build

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## GitHub Actions CI/CD

The pipeline (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. **Build shared** — `npm ci && npm run build`
2. **Test backend** — `npm ci && npm test`
3. **Test frontend** — `npm ci && npm test`
4. **Build Docker images** — backend + frontend
5. **Push to ACR** — Azure Container Registry
6. **Deploy backend** — Azure App Service (or AKS)
7. **Deploy frontend** — Azure Static Web Apps

### Required GitHub Secrets

```
AZURE_CREDENTIALS          Service principal for Azure deployments
ACR_LOGIN_SERVER           Container registry URL
ACR_USERNAME               Registry username
ACR_PASSWORD               Registry password
BACKEND_AZURE_APP_NAME     App Service name (backend)
FRONTEND_AZURE_APP_NAME    Static Web App name
```

---

## Azure App Service Configuration

Set these Application Settings on the backend App Service:

```
DATAVERSE_URL               = https://org5869857f.crm4.dynamics.com
AZURE_TENANT_ID             = <from Key Vault>
AZURE_CLIENT_ID             = <from Key Vault>
AZURE_CLIENT_SECRET         = @Microsoft.KeyVault(SecretUri=...)
AZURE_AD_AUDIENCE           = api://your-backend-app-client-id
METADATA_CACHE_TTL_SECONDS  = 300
NODE_ENV                    = production
LOG_LEVEL                   = info
```

---

## Azure Static Web Apps (Frontend)

Set environment variables in Static Web App configuration:

```
VITE_AZURE_CLIENT_ID  = your-spa-client-id
VITE_AZURE_TENANT_ID  = your-tenant-id
VITE_API_SCOPE        = api://your-backend-client-id/access_as_user
VITE_API_BASE_URL     = https://dfe-api.azurewebsites.net
```

Configure routes in `staticwebapp.config.json` to route all paths to `index.html`
(React SPA routing).

---

## Dataverse Setup

1. Import the `QdbDynamicFormEngine` solution into your Dataverse environment
2. Run the seed script to create the Loan Application form:
   ```bash
   cd scripts
   DATAVERSE_URL=https://org5869857f.crm4.dynamics.com \
   AZURE_TENANT_ID=xxx AZURE_CLIENT_ID=xxx AZURE_CLIENT_SECRET=xxx \
   npx ts-node seed-crm-metadata.ts
   ```
3. Verify the form appears in the portal at `/form/loan-application`

---

## Health Check

`GET /api/health` returns:
```json
{ "status": "ok", "timestamp": "2026-05-08T10:00:00Z", "version": "1.0.0" }
```

Configure Azure App Service health check probe to hit this endpoint.
