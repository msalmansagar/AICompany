# Dynamic Form Engine — Technical Documentation

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Dataverse Schema](#3-dataverse-schema)
4. [Authentication & Authorisation](#4-authentication--authorisation)
5. [Backend API Reference](#5-backend-api-reference)
6. [Service Layer](#6-service-layer)
7. [Frontend](#7-frontend)
8. [Local Development Setup](#8-local-development-setup)
9. [Configuration Reference](#9-configuration-reference)
10. [Provisioning Scripts](#10-provisioning-scripts)
11. [Caching Strategy](#11-caching-strategy)
12. [Error Handling](#12-error-handling)

---

## 1. System Overview

Dynamic Form Engine (DFE) is a metadata-driven form rendering platform backed by Microsoft Dataverse. Form structure, field definitions, validation rules, and business logic are stored as records in Dataverse. The frontend fetches metadata at runtime and renders the form without any hardcoded field knowledge. Submissions are written back to Dataverse.

**Live environment**

| Component | Value |
|-----------|-------|
| Dataverse org | `org5869857f.crm4.dynamics.com` |
| Azure AD tenant | `d79e793c-f6de-4204-8508-7980a63df957` |
| Backend app registration (client ID) | `08e80e93-0bab-45ef-8372-2e554fa9af9b` |
| Seed form | Loan Application (`loan-application`) |
| Seed form ID | `9d29976a-5b4f-f111-bec7-7ced8d8fec2d` |

---

## 2. Architecture

```
Browser (React + Vite, :3000)
        │
        │  /api/*  (Vite proxy in dev)
        ▼
Express API (:4000)
        │
        ├── Auth middleware  (validates Azure AD JWT)
        ├── Input sanitiser
        │
        ├── GET  /api/forms/:code/metadata   ──► CrmMetadataService
        ├── POST /api/forms/:code/draft      ──► CrmDataService
        ├── POST /api/forms/:code/submit     ──► CrmSubmissionService
        ├── GET  /api/lookups/:entity        ──► CrmLookupService
        └── GET  /api/health
                │
                ▼
        CrmBaseService (shared fetch, retry, token inject)
                │
                ▼
        CrmAuthService (ClientSecretCredential, token cache)
                │
                ▼
        Dataverse Web API v9.2
```

**Request flow for form load**

1. Browser calls `GET /api/forms/loan-application/metadata`.
2. Auth middleware validates the bearer JWT.
3. `CrmMetadataService.getFormDefinition('loan-application')` checks the LRU cache.
4. On cache miss: queries Dataverse `qdb_form_definitions`, then fans out parallel queries for tabs, sections, fields, options, validation rules, lookup configs, and business rules.
5. Returns fully assembled `FormDefinition` JSON.
6. Frontend renders tabs, sections, and fields; the rule engine evaluates business rules on every field change.

---

## 3. Dataverse Schema

All tables use the publisher prefix `qdb_`. Custom picklist codes are in the `100000000+` range.

### Entity overview

| Entity logical name | Entity set | Purpose |
|---------------------|------------|---------|
| `qdb_form_definition` | `qdb_form_definitions` | Root form record |
| `qdb_form_tab` | `qdb_form_tabs` | Ordered tabs within a form |
| `qdb_form_section` | `qdb_form_sections` | Sections within a tab |
| `qdb_form_field` | `qdb_form_fields` | Fields within a section |
| `qdb_form_option_value` | `qdb_form_option_values` | Dropdown / radio / multiselect options |
| `qdb_form_validation_rule` | `qdb_form_validation_rules` | Per-field validation rules |
| `qdb_form_lookup_config` | `qdb_form_lookup_configs` | Dataverse entity search config for lookup fields |
| `qdb_form_business_rule` | `qdb_form_business_rules` | Conditional show/hide/require rules |
| `qdb_form_submission_mapping` | `qdb_form_submission_mappings` | Field → Dataverse attribute write mapping |
| `qdb_form_submission_draft` | `qdb_form_submission_drafts` | In-progress user drafts |
| `qdb_form_version` | `qdb_form_versions` | Version history |
| `qdb_form_audit_log` | `qdb_form_audit_logs` | Append-only submission audit trail |

### Primary key naming

Dataverse auto-names PKs as `{entityLogicalName}id` (no underscore before `id`).

| Table | PK attribute |
|-------|-------------|
| `qdb_form_definition` | `qdb_form_definitionid` |
| `qdb_form_tab` | `qdb_form_tabid` |
| `qdb_form_section` | `qdb_form_sectionid` |
| `qdb_form_field` | `qdb_form_fieldid` |

Lookup expanded values follow OData convention: `_{attributeName}_value`.  
Example: the `qdb_form_tab_id` lookup on `qdb_form_section` expands as `_qdb_form_tab_id_value`.

### Picklist codes

#### Field type (`qdb_field_type`)

| Code | Value |
|------|-------|
| 100000001 | `text` |
| 100000002 | `textarea` |
| 100000003 | `number` |
| 100000004 | `date` |
| 100000005 | `datetime` |
| 100000006 | `dropdown` |
| 100000007 | `multiselect` |
| 100000008 | `lookup` |
| 100000009 | `checkbox` |
| 100000010 | `radio` |
| 100000011 | `currency` |
| 100000012 | `decimal` |
| 100000013 | `email` |
| 100000014 | `phone` |
| 100000015 | `file` |
| 100000016 | `repeatingGrid` |
| 100000017 | `richText` |

#### Form status (`qdb_status`)

| Code | Value |
|------|-------|
| 100000000 | `draft` |
| 100000001 | `active` |
| 100000002 | `inactive` |
| 100000003 | `archived` |

#### Validation rule type (`qdb_rule_type`)

| Code | Value |
|------|-------|
| 100000001 | `required` |
| 100000002 | `minLength` |
| 100000003 | `maxLength` |
| 100000004 | `minValue` |
| 100000005 | `maxValue` |
| 100000006 | `regex` |
| 100000007 | `email` |
| 100000008 | `phone` |
| 100000009 | `dateBefore` |
| 100000010 | `dateAfter` |
| 100000011 | `crossField` |

#### Business rule action (`qdb_action`)

| Code | Value |
|------|-------|
| 100000001 | `showField` |
| 100000002 | `hideField` |
| 100000003 | `showSection` |
| 100000004 | `hideSection` |
| 100000005 | `showTab` |
| 100000006 | `hideTab` |
| 100000007 | `makeRequired` |
| 100000008 | `makeOptional` |
| 100000009 | `makeReadonly` |
| 100000010 | `makeEditable` |
| 100000011 | `setValue` |
| 100000012 | `clearValue` |
| 100000013 | `calculateValue` |
| 100000014 | `filterOptions` |
| 100000015 | `filterLookup` |

#### Columns / column span

Both `qdb_columns` (section layout) and `qdb_column_span` (field width) use the same code map:

| Code | Value |
|------|-------|
| 100000001 | `1` |
| 100000002 | `2` |
| 100000003 | `3` |
| 100000004 | `4` |

#### Conditions logic (`qdb_conditions_logic`)

| Code | Value |
|------|-------|
| 100000000 | `AND` |
| 100000001 | `OR` |

### Business rule conditions storage

Conditions are stored as a JSON string in `qdb_conditions_json` rather than a separate child entity. Each element in the array is:

```json
[
  {
    "fieldId": "<qdb_form_field record GUID>",
    "operator": "equals",
    "value": "Corporate",
    "logicalOperator": "AND"
  }
]
```

The trigger field is derived from `conditions[0].fieldId`. The backend resolves field GUIDs to schema names using a `Map<guid, schemaName>` built during the field fetch pass.

---

## 4. Authentication & Authorisation

### Backend → Dataverse (service principal)

`CrmAuthService` uses `@azure/identity` `ClientSecretCredential` with the following flow:

1. Acquires a token for scope `https://org5869857f.crm4.dynamics.com/.default`.
2. Caches the token in memory; refreshes 5 minutes before the `expiresOnTimestamp`.
3. All `CrmBaseService` subclasses call `authService.getAccessToken()` before every Dataverse request.

The Azure AD app (`08e80e93-...`) must be registered as an **Application User** in the Power Platform admin center and granted the **System Administrator** security role.

### Frontend → Backend (user JWT)

The frontend acquires an Azure AD access token for the backend audience (`api://08e80e93-...`) via MSAL. This token is attached as `Authorization: Bearer <token>` on every API call.

The backend `authMiddleware` validates the JWT: checks signature, issuer, audience, and expiry. The decoded claims (`oid`, `name`, `preferred_username`, `roles`) are attached to `req.user`.

**Local dev bypass:** set `SKIP_AUTH=true` in `.env` and `VITE_SKIP_AUTH=true` in the frontend `.env`. Both bypass all JWT checks and inject a synthetic user identity.

---

## 5. Backend API Reference

Base URL: `http://localhost:4000/api` (development).

All authenticated endpoints require `Authorization: Bearer <token>`.  
All responses follow `{ success: boolean, data: T }` or `{ success: false, error: string }`.

### Health

```
GET /api/health
```
No auth required. Returns `200 OK` with service status.

### Forms

#### Get form metadata

```
GET /api/forms/:formCode/metadata
```

Returns the full `FormDefinition` tree: tabs → sections → fields → options, validation rules, business rules, lookup configs.

**Path params:** `formCode` — alphanumeric + `_-`, max 100 chars.

#### Get record data

```
GET /api/forms/:formCode/data/:recordId
```

Fetches a previously submitted Dataverse record. Enforces IDOR check: `qdb_user_id` on the record must match the requesting user's `oid`.

#### Save draft

```
POST /api/forms/:formCode/draft
Content-Type: application/json

{
  "formDefinitionId": "<uuid>",
  "formCode": "loan-application",
  "formData": { "<schemaName>": <value>, ... },
  "currentTabIndex": 0
}
```

Returns `201` on creation, `200` on update. One draft per user per form — existing draft is updated in place.

#### Submit form

```
POST /api/forms/:formCode/submit
Content-Type: application/json

{
  "formData": { "<schemaName>": <value>, ... }
}
```

Writes parent + child Dataverse records via submission mappings. Deletes the draft on success. Atomically rolls back all created records on any failure. Returns `{ parentRecordId, parentEntityLogicalName, referenceNumber }`.

#### Server-side validate

```
POST /api/forms/:formCode/validate
Content-Type: application/json

{ "formData": { ... } }
```

Runs required-field checks server-side. Returns `{ valid: boolean, errors: { [fieldId]: string[] } }`.

#### Get versions

```
GET /api/forms/:formCode/versions
```

Returns the version history list for the form, newest first.

### Lookups

```
GET /api/lookups/:entityName?search=<term>&displayAttribute=<attr>&valueAttribute=<attr>&filter=<odata>&max=<n>
```

Searches any Dataverse entity by display attribute using OData `contains()`. Returns `{ id, displayName, entityLogicalName }[]`. The entity set is constructed as `{entityName}s`.

**Query params:**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `search` | yes | — | Min 1 char; single-quotes escaped as `''` |
| `displayAttribute` | yes | — | Attribute to search and display |
| `valueAttribute` | no | `id` | Attribute to use as the option value |
| `filter` | no | — | Additional OData filter expression |
| `max` | no | `10` | Max 50 |

### Files

```
POST /api/files/upload
GET  /api/files/:fileId
DELETE /api/files/:fileId
```

Backed by Azure Blob Storage. File metadata is stored in Dataverse.

### Options

```
GET /api/options/:formCode
```

Returns all option sets for a form (dropdown, radio, multiselect options).

---

## 6. Service Layer

### CrmBaseService

Base class for all CRM services. Provides:

- `crmFetch<T>(path, options, attempt)` — attaches auth header, OData headers (`OData-MaxVersion: 4.0`, `Prefer: odata.include-annotations="*"`), handles 429 throttle with exponential back-off (max 3 retries, jitter).
- Query builder helpers: `buildSelect`, `buildFilter`, `buildOrderBy`, `buildTop`.

### CrmAuthService

- Uses `ClientSecretCredential` from `@azure/identity`.
- Caches the token in memory; refreshes 5 minutes before `expiresOnTimestamp`.
- Thread-safe for concurrent requests (single-process Node.js).

### CrmMetadataService

Assembles the `FormDefinition` tree from Dataverse. Uses an LRU cache keyed by `formCode`.

**Fetch graph (parallel where possible):**

```
getFormDefinition(formCode)
  └── fetchAndAssembleForm
        ├── qdb_form_definitions (filter by formCode + statecode=0)
        └── [parallel]
              ├── fetchTabsWithChildren
              │     └── qdb_form_tabs
              │           └── fetchSectionsWithChildren
              │                 └── qdb_form_sections
              │                       └── fetchFieldsWithMetadata
              │                             └── qdb_form_fields
              │                                   └── [parallel]
              │                                         ├── fetchOptions
              │                                         ├── fetchValidationRules
              │                                         ├── fetchLookupConfigs
              │                                         └── fetchBusinessRules
              └── fetchSubmissionMappings
```

**Business rule resolution:**

Business rules are fetched at form level (`_qdb_form_definition_id_value eq '{formId}'`). Conditions are stored as JSON in `qdb_conditions_json`. The trigger field GUID is extracted from `conditions[0].fieldId` and resolved to a schema name via `fieldGuidToSchema: Map<guid, schemaName>` built during the field fetch pass.

**Picklist mapping:**

Dataverse returns integer option set codes. `CrmMetadataService` maps every picklist attribute to its TypeScript union type using explicit `Record<number, T>` maps (see Section 3 for code tables).

### CrmLookupService

```typescript
searchLookup({ entityLogicalName, displayAttribute, valueAttribute, searchTerm, filterExpression, maxResults })
```

Builds an OData query against `/{entityLogicalName}s`. Escapes single-quotes in `searchTerm`. Extracts the record ID using `record[valueAttribute] ?? record['{entityLogicalName}id']` to handle both custom value attributes and the Dataverse default PK.

### CrmDataService

Manages `qdb_form_submission_draft` records:

- `getDraft(formDefinitionId, userId)` — filters by form + user + `statecode=0` + `qdb_expires_at gt {now}`. Returns the newest non-expired draft.
- `saveDraft(draft)` — `PATCH` if `draft.id` exists, `POST` with `Prefer: return=representation` otherwise.
- `deleteDraft(draftId)` — `DELETE`.
- `getRecord(entityName, recordId, select?)` — generic record fetch for pre-population.

### CrmSubmissionService

Submit flow:

1. Resolve parent entity from submission mappings.
2. Build payload from `submissionMappings` (field ID → schema name → form data value → attribute).
3. `POST` parent record with `qdb_submission_status: 'pending'`.
4. `POST` child records, each linked to parent via navigation property `@odata.bind`.
5. `PATCH` parent to `qdb_submission_status: 'submitted'`.
6. Fire-and-forget: trigger Power Automate workflow if `powerAutomateFlowId` is set.
7. Write audit log entry.
8. Fetch reference number from `confirmationRecordRefAttribute`.

On any error: reverse-order delete of all created records (best-effort rollback), write failure audit entry, re-throw.

**Transform expressions** (applied to field values before writing):

| Expression | Effect |
|------------|--------|
| `uppercase` | `String(value).toUpperCase()` |
| `lowercase` | `String(value).toLowerCase()` |
| `trim` | `String(value).trim()` |
| `toString` | `String(value)` |

### CrmAuditService

Writes append-only records to `qdb_form_audit_logs`. Called by `CrmSubmissionService` on success and failure.

### CrmFileService

Handles file uploads to Azure Blob Storage. Requires `STORAGE_ACCOUNT_NAME`, `STORAGE_ACCOUNT_KEY`, `STORAGE_CONTAINER_NAME` environment variables.

---

## 7. Frontend

- **Framework:** React + TypeScript + Vite
- **Port:** 3000 (development)
- **API base:** `/api` (relative path — Vite proxies to `http://localhost:4000`)

### Vite proxy (dev only)

`vite.config.ts` proxies all `/api` requests to the backend:

```typescript
server: {
  proxy: {
    '/api': 'http://localhost:4000'
  }
}
```

In production, the proxy is replaced by a reverse proxy (nginx / Azure Front Door).

### Auth

MSAL is used to acquire a JWT for audience `api://08e80e93-...`. Set `VITE_SKIP_AUTH=true` to bypass in local dev.

### Form rendering

The frontend calls `/api/forms/{formCode}/metadata` on mount, then renders:

- One tab per `TabDefinition`
- One section per `SectionDefinition` within each tab
- One field component per `FieldDefinition` based on `fieldType`

### Rule engine

On every field value change, the rule engine evaluates all `BusinessRule` entries attached to the changed field and applies actions (show/hide/require/setValue etc.) to target fields, sections, and tabs.

### Cache invalidation for field/section changes

The `FormDefinition` is fetched once per page load. Changes made in Dataverse (new fields, visibility changes) require a **browser refresh** to take effect. The backend cache TTL (`METADATA_CACHE_TTL_SECONDS`) determines how long the backend holds a cached copy — set to `0` in dev to always hit Dataverse.

---

## 8. Local Development Setup

### Prerequisites

- Node.js 20+
- Access to the Azure AD tenant and Dataverse org (or `MOCK_CRM=true`)

### Backend

```powershell
cd projects/dynamic-form-engine/backend
npm install
# Copy .env.example to .env and fill in values (see Section 9)
npx tsx watch src/index.ts
```

Backend starts at `http://localhost:4000`.

### Frontend

```powershell
cd projects/dynamic-form-engine/frontend
npm install
# Create .env.local with VITE_SKIP_AUTH=true for local dev
npm run dev
```

Frontend starts at `http://localhost:3000`.

### Mock mode (no Dataverse required)

Set `MOCK_CRM=true` and `SKIP_AUTH=true` in backend `.env`.  
Set `VITE_SKIP_AUTH=true` in frontend `.env.local`.  
In-memory mock services serve a hardcoded form — no Azure AD or Dataverse connection needed.

### Switching to real Dataverse

Set in backend `.env`:

```env
MOCK_CRM=false
SKIP_AUTH=true        # keep true until Azure AD front-channel auth is configured
```

The backend process must be restarted after `.env` changes (tsx watch restarts automatically on TypeScript file changes but not on `.env` changes).

---

## 9. Configuration Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | no | `4000` | HTTP port |
| `NODE_ENV` | no | `development` | `development` / `production` / `test` |
| `DATAVERSE_URL` | yes | — | Org root URL, e.g. `https://org5869857f.crm4.dynamics.com` |
| `AZURE_TENANT_ID` | yes | — | Azure AD tenant GUID |
| `AZURE_CLIENT_ID` | yes | — | App registration client ID |
| `AZURE_CLIENT_SECRET` | yes | — | App registration client secret (value, not secret ID) |
| `AZURE_AD_AUDIENCE` | yes | — | JWT audience, e.g. `api://08e80e93-...` |
| `METADATA_CACHE_TTL_SECONDS` | no | `300` | `0` = no caching (every request hits Dataverse) |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Allowed CORS origin |
| `MOCK_CRM` | no | `false` | `true` = use in-memory mock services |
| `SKIP_AUTH` | no | `false` | `true` = skip JWT validation (dev only) |
| `STORAGE_ACCOUNT_NAME` | no | — | Azure Storage for file uploads |
| `STORAGE_ACCOUNT_KEY` | no | — | Azure Storage key |
| `STORAGE_CONTAINER_NAME` | no | `form-uploads` | Blob container name |
| `LOG_LEVEL` | no | `info` | `trace` / `debug` / `info` / `warn` / `error` |

> **Note:** `METADATA_CACHE_TTL_SECONDS=0` is treated as no-cache. The LRU cache is initialised with `{ max: 1, ttl: 1 }` (1 ms effective TTL) when TTL=0, rather than the `ttl: 0` default which lru-cache treats as "never expire".

---

## 10. Provisioning Scripts

Located at `scripts/provision/`. Run with Node.js — all use device code flow for interactive authentication (no service principal required for provisioning).

### `create-tables.js`

Creates all 12 Dataverse custom entities and their attributes using the Web API metadata endpoint. Run once per environment.

```powershell
node scripts/provision/create-tables.js
```

### `seed-data.js`

Seeds the Loan Application form into a freshly provisioned environment. Creates:

- 1 form definition
- 5 tabs, 5 sections, 16 fields
- 9 option values
- 17 validation rules
- 1 lookup config (Account entity)
- 3 business rules (conditions as JSON)
- 3 submission mappings

```powershell
node scripts/provision/seed-data.js
```

### `register-app-user.js`

Registers the backend Azure AD app as a Dataverse Application User and assigns System Administrator role. Run once per environment after the app registration is created in Azure AD.

```powershell
node scripts/provision/register-app-user.js
```

> **Alternatively:** do this manually in [Power Platform Admin Center](https://admin.powerplatform.microsoft.com) → Environments → [env] → Settings → Users → Application Users → New app user.

---

## 11. Caching Strategy

Form metadata is expensive to assemble — it requires 6–8 sequential and parallel Dataverse queries. An LRU cache in front of `CrmMetadataService` avoids redundant Dataverse round-trips.

| Environment | Recommended TTL | Behaviour |
|-------------|-----------------|-----------|
| Local dev | `0` (no cache) | Every browser refresh hits Dataverse — changes visible immediately after refresh |
| Staging | `60` | 1-minute cache — balances freshness with Dataverse call volume |
| Production | `300` (default) | 5-minute cache — form metadata changes rarely in production |

`CrmMetadataService.invalidateCache(formCode)` can be called programmatically (e.g., from a webhook or admin endpoint) to force a cache eviction without waiting for TTL.

**Frontend cache:** the frontend does not cache metadata locally. Every page load (or browser refresh) fetches fresh metadata from the backend. If the backend cache has not expired, the backend responds from cache without calling Dataverse.

---

## 12. Error Handling

### Error types (`backend/src/utils/errors.ts`)

| Class | HTTP status | When thrown |
|-------|-------------|-------------|
| `FormNotFoundError` | 404 | `formCode` not found in `qdb_form_definitions` |
| `FormInactiveError` | 400 | Form found but `qdb_status` ≠ `100000001` (active) |
| `ValidationError` | 422 | Invalid form code pattern or Zod parse failure |
| `NotFoundError` | 404 | Generic record not found |
| `ForbiddenError` | 403 | IDOR check failed (record owner ≠ requesting user) |
| `CrmApiError` | 502 | Dataverse returned a non-2xx response |

### Dataverse throttling (429)

`CrmBaseService.crmFetch` retries up to 3 times on HTTP 429 with exponential back-off:

```
delay = max(Retry-After * 1000, 200ms * 2^(attempt-1)) + random(0-200ms jitter)
```

### Submission rollback

`CrmSubmissionService.submitForm` keeps a `createdRecords` list. On any error, it iterates the list in reverse and deletes each record. Rollback failures are logged but do not mask the original error.
