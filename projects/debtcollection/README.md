# DCP-001 Debt Collection Platform — Phase 4 Foundation

Node.js + TypeScript monorepo. Fastify API that routes operator requests to two
Dynamics 365 organisations (HL and BFD) via an org-addressed Dataverse client.

---

## Layout

```
projects/debtcollection/
├── apps/
│   └── api/           @dcp/api          Fastify HTTP server
└── packages/
    ├── types/         @dcp/types         Zod schemas, domain types, constants
    ├── dataverse-client/ @dcp/dataverse-client  OData v4 Dataverse client + retry
    └── auth-adapters/ @dcp/auth-adapters  IAuthAdapter — AdfsAdapter / AzureAdAdapter
```

Step 5 packages (`apps/web`, `packages/ui`, `packages/i18n`) are intentionally
absent from this phase.

---

## Run commands

```bash
# from projects/debtcollection/
npm install          # install all workspaces
npm run build        # turbo build (tsc)
npm test             # turbo test (vitest)
npm run typecheck    # tsc --noEmit across all packages
```

Individual packages:

```bash
cd packages/types          && npm test
cd packages/dataverse-client && npm test
cd packages/auth-adapters  && npm test
cd apps/api                && npm test
```

---

## Environment variables (names only — no values)

### HL org (required)

| Variable             | Purpose                            |
|----------------------|------------------------------------|
| `DV_DATAVERSE_URL`   | Web API base URL for HL org        |
| `DV_TENANT_ID`       | Azure AD / ADFS tenant or realm    |
| `DV_CLIENT_ID`       | Service-account client ID          |
| `DV_CLIENT_SECRET`   | Service-account client secret      |
| `DV_SCOPE`           | OAuth scope (default `.default`)   |
| `AUTH_ISSUER_URL`    | OIDC/ADFS discovery base URL       |
| `AUTH_PROVIDER`      | `adfs` (default) or `azure-ad`     |

### BFD org (required when FEATURE_BFD=true)

| Variable               | Purpose                          |
|------------------------|----------------------------------|
| `DV_BFD_DATAVERSE_URL` | Web API base URL for BFD org     |
| `DV_BFD_CLIENT_ID`     | BFD service-account client ID    |
| `DV_BFD_CLIENT_SECRET` | BFD service-account client secret|
| `DV_BFD_SCOPE`         | BFD OAuth scope                  |

### Feature flags

| Variable       | Default | Purpose                  |
|----------------|---------|--------------------------|
| `FEATURE_BFD`  | `false` | Enable BFD org routing   |

### Server

| Variable    | Default       | Purpose             |
|-------------|---------------|---------------------|
| `PORT`      | `3000`        | HTTP listen port    |
| `LOG_LEVEL` | `info`        | Pino log level      |
| `NODE_ENV`  | `development` | Runtime environment |

---

## What is deliberately absent

- **`apps/web`** — portal frontend; Phase 4 Step 5.
- **`packages/ui`** — shared React components; Phase 4 Step 5.
- **`packages/i18n`** — Arabic/English translations; Phase 4 Step 5.
- **BFD production credentials** — `FEATURE_BFD` is `false`; BFD routes return
  403 until the flag is enabled in a subsequent phase.
- **Database / Prisma** — all state lives in Dataverse; no local DB.
- **Migration scripts** — Dataverse entity provisioning is handled by the CRM
  on-premise agent (see `projects/debtcollection/crm/`).
- **Production ADFS proof** — see `packages/auth-adapters/README.md` §COND-DCP-008.
- **PII data in any environment** — Qatar PDPPL (Law 13/2016) gates production
  data ingestion; `msst_mobile`, `msst_email`, `msst_address` are masked for
  callers without the `View Sensitive PII` role claim (FR-014/114).
