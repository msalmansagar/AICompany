# DCP — Dual-Platform Portability Register (CloudMigrationReadiness)

**Status:** Phase 0 · 2026-09-17 · Master Prompt §57, §82 · Correction Prompt §1–2, §43.

**Framing (CP §1).** Dynamics 365 CE 9.1 On-Premises and Dataverse Cloud are **two equal deployment
targets** of one source codebase. Every DCP component has so far been runtime-tested only against the
cloud sandbox `org5869857f` because that is the environment reachable from the development laptop.
That is a **development/test-environment access constraint, not an architecture decision**. Nothing in
this register treats cloud as primary or on-prem as a later "migration".

Status vocabulary (used exactly): **Cloud Runtime Tested** · **On-Prem Compatible by Design — Runtime
Test Pending** · **Not Started** · **Violation — fix in Phase 1**.

---

## 1. Portability register

| Component | Shared Source Confirmed | Platform-Specific Component | Platform-Specific Reason | Configuration / Adapter Used | On-Prem Compatibility (by design) | Cloud Compatibility (by design) | Cloud Runtime Test Status | On-Prem Runtime Test Status | Portability Status |
|---|---|---|---|---|---|---|---|---|---|
| `qdb_` schema (target: 12 entities + choices, `ERD.md`) | Yes — one solution definition | none | — | Solution package; org-specific facility lookup step (see §2.4) | Yes — standard metadata only, no elastic tables | Yes | Not Started (msst_ predecessor: Cloud Runtime Tested) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `qdb_collectioncase.qdb_customerid` Customer lookup (contact + account) | Yes | none | — | `CreateCustomerRelationshipsRequest` / `CreateCustomerRelationships` action | Yes — message present in `Microsoft.Xrm.Sdk.dll` 9.0.2.51 (on-prem 9.x SDK) | Yes — action present in `org5869857f` `$metadata`; `incident.customerid` is the OOB reference | Not Started | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `qdb_collectioncase.qdb_facilityid` lookup to the org's facility entity | Business key `qdb_facilitynumber` shared; lookup is a packaging step | Org-specific deployment step | A lookup's target entity is fixed metadata; HL and BFD facility entities may differ (`TBD — Requires QDB Confirmation`) | Org package (not platform package) | Yes | Yes | Not Started | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `StatusTransitionValidator` + `StatusTransitionMatrix` plugin | Yes | none | — | — | Yes — net471, sandbox-safe, no IO/registry/SQL/HTTP | Yes | Cloud Runtime Tested (smoke, 30 steps live) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `ImmutabilityGuard` plugin | Yes | none | — | — | Yes | Yes | Cloud Runtime Tested | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `DefaultStatusAssigner` plugin | Yes | none | — | — | Yes | Yes | Cloud Runtime Tested | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `ActivitySubjectComposer` plugin | Yes | none | — | — | Yes | Yes | Cloud Runtime Tested | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `StopContactQueueMover` plugin | Yes | none | Only `AddToQueueRequest` (SDK, both platforms) | — | Yes | Yes | Cloud Runtime Tested (queue move fails: `IsValidForQueue=false`, MP §59) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `AuditLogWriter` plugin (REASSESS → native audit + existing `qdb_crmlogs`) | Yes | none | — | Native audit exists on both platforms | Yes | Yes | Cloud Runtime Tested | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| Plugin operation surface (DCP-owned operations, Phase 1+) | Yes — one plugin class dispatching on `MessageName` | Custom API (cloud) vs Process Action (on-prem) | Custom API availability on QDB's 9.1 build is `TBD — Requires QDB Confirmation` (EDP `deploy/onprem/ONPREM.md`; DFE `PLUGIN-REGISTRATION.md` §3b) | Deployment package; caller uses `Xrm.WebApi.online.execute` with the same name on both | Yes | Yes | Not Started | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `packages/dataverse-client` (`DataverseClient`, `buildODataUrl`, retry, errors) | Yes | none — but see next row | — | `apiVersion` parameter already exists | Yes (OData v4 is on 9.1) | Yes | Cloud Runtime Tested (live reads) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| Web API version constant | **No** | `apiVersion: '9.2'` in `apps/api/src/app.ts` ×2, `apps/api/src/plugins/org-router.ts` ×2; literal `/api/data/v9.2/$metadata` in `apps/api/src/routes/health.ts` | On-prem 9.1 exposes **v9.1**; v9.2 is online-only | Move to `DV_API_VERSION` (per org) in the service and `getGlobalContext().getVersion()` in the browser | No — fails today | Yes | Cloud Runtime Tested | Not Started | **Violation — fix in Phase 1** |
| `packages/auth-adapters` (`IAuthAdapter`, `AdfsAdapter`, `AzureAdAdapter`) | Yes | Two adapters behind one interface | AD FS 2019 vs Entra ID token endpoints | `AUTH_PROVIDER` env | Yes — `AdfsAdapter` written, unproven (COND-008) | Yes | Cloud Runtime Tested (`AzureAdAdapter`) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| Browser → Integration Service auth (planned) | Yes — `IAuthContext` in the React SDK | AD FS bearer or Windows-integrated vs Entra/MSAL | Identity providers differ; which on-prem mode QDB uses is `TBD — Requires QDB Confirmation` | Platform configuration selects adapter | Yes | Yes | Not Started | Not Started | Not Started |
| Integration Service (`apps/api`, Fastify) — MIS live/background, cross-org 360, system comms | Yes — one container image | none in application code | — | env vars only | Yes | Yes | Cloud Runtime Tested (`/health`, data layer) | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `org-router` plugin (HL/BFD selection) | Yes | none | — | `FEATURE_BFD`, per-org URLs | Yes | Yes | Cloud Runtime Tested | Not Started | On-Prem Compatible by Design — Runtime Test Pending |
| `IMisDelinquencyService` — `MockMisDelinquencyService` / `ApiMisDelinquencyService` (planned) | Yes | none | — | `MIS_PROVIDER` env / `qdb_platformconfiguration.qdb_misprovider` | Yes | Yes | Not Started | Not Started | Not Started |
| `crm/scripts/provision-schema.mjs`, `register-plugins.mjs`, `smoke-plugins.mjs`, `verify-schema.mjs` | Tooling — allowed to differ (MP §6, §83) | `crm/scripts/lib/crm-client.mjs` hard-codes `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | Entra-only client-credentials flow; no AD FS / PRT path exists | Needs a tooling auth adapter (Entra · AD FS · or PRT + solution import for on-prem) | No — cannot run on-prem | Yes | Cloud Runtime Tested | Not Started | **Violation — fix in Phase 1** (§83: must produce artifacts for both targets) |
| Solution packaging (`solution.xml`, managed/unmanaged zip, RootComponents) | — | none exists | Schema is created by script only | — | No package | No package | Not Started | Not Started | **Violation — fix in Phase 1** |
| CI/CD producing on-prem + cloud packages from one build | — | none exists | — | — | — | — | Not Started | Not Started | Not Started |
| React Collection Workspace (`qdb_dcp_workspace.html`, planned) | Yes — one bundle | none in components; adapters only | — | Runtime context + `qdb_platformconfiguration` | Yes — single-file web resource (house pattern: DFE, Report Engine) | Yes | Not Started | Not Started | Not Started |
| `ICrmAdapter` over `Xrm.WebApi` (planned) | Yes | none | `Xrm.WebApi` is on 9.1 and cloud | API version from runtime context | Yes | Yes | Not Started | Not Started | Not Started |
| Engine facades `IFormEngine` / `IProcessEngine` / `IRuleEngine` / `IAssignmentEngine` / `IReportingService` (planned) | Yes | Adapter per engine only where the engine's own surface differs (Custom API vs Process Action) | See `EngineReuseAssessment.md` | Configuration codes on activity type / strategy action | Yes (EDP, DFE document on-prem paths); Process Engine and Smart Assignment `TBD` | Yes | Not Started | Not Started | Not Started |
| Communication Service (planned) — SMS/WhatsApp → `fax`, Email → `email` | Yes | none | Existing QDB fax trigger mechanism `TBD — Requires QDB Confirmation` | Platform configuration (channel → entity) | Yes (fax/email exist on both) | Yes | Not Started | Not Started | Not Started |
| Prototype (`prototype/`, 22 mock screens) | n/a — reference only | none | zero network calls, zero `Xrm`, zero iframe assumptions | — | n/a | n/a | n/a | n/a | n/a (Mock) |
| C# / TS automated tests (92 + 45) | Yes | none | — | — | Yes | Yes | Cloud Runtime Tested (unit) | n/a | Coupled to `msst_` names — refactor in Phase 1 (MP §81) |

---

## 2. Findings in detail

### 2.1 Web API version — Violation
`apiVersion: '9.2'` is a constant in application source at four sites plus one literal URL in
`routes/health.ts`. `buildODataUrl` already takes the version as a parameter, so the abstraction is right
and only the constant is misplaced. Fix: `DV_API_VERSION` (and `DV_BFD_API_VERSION`) in `config.ts`;
health check builds its URL from the same value; browser side reads `Xrm.Utility.getGlobalContext().getVersion()`.
No business code should mention a version.

### 2.2 Tooling authentication — Violation
`crm-client.mjs` `acquireToken()` is Entra-only. Provisioning, plugin registration and smoke tests
therefore cannot run against on-prem at all. Fix: `ToolingAuthAdapter` with Entra client-credentials
(cloud) and AD FS client-credentials / certificate (on-prem, `TBD — Requires QDB Confirmation` on the
grant type QDB's AD FS allows), **or** ship on-prem provisioning as a solution import + PRT runbook (the
path EDP and DFE already document). Tooling may differ per target; it must exist for both.

### 2.3 Operation surface — pattern adopted
Cloud exposes plugin operations as **Custom API** (OData functions/actions); on-prem 9.1 exposes the
same plugin classes as **Process Actions** registered as SDK message steps. The plugin C# is identical
(dispatch on `context.MessageName`, same Input/OutputParameters). Callers use
`Xrm.WebApi.online.execute` with the same request name on both. Source: EDP `deploy/onprem/ONPREM.md`;
DFE `crm-plugins/Qdb.FormEngine/PLUGIN-REGISTRATION.md` §3b. Whether QDB's specific 9.1 build has the
Custom API entity is `TBD — Requires QDB Confirmation`; the design does not depend on it.

### 2.4 Customer and facility lookups — verified / packaged
- Single `qdb_customerid` of type Customer (targets contact + account): provisionable on both platforms
  (SDK message present in the 9.0 assembly; action present on the cloud org). Approved design.
- `qdb_facilityid`: target entity fixed per org; the lookup is created by the **org-specific deployment
  step** while `qdb_facilitynumber` (business key) lives in the shared core. If HL and BFD share one
  facility entity name, the lookup moves into the core. `TBD — Requires QDB Confirmation`.

### 2.5 Browser authentication to the Integration Service — isolated adapter
Inside CRM the React app has the CRM session and needs no login for CRM data. Calls to the Integration
Service need a bearer: Entra/MSAL (cloud) vs AD FS OIDC or Windows-integrated (on-prem). Implemented once
behind `IAuthContext`; selected by platform configuration. `TBD — Requires QDB Confirmation` on the
on-prem mode.

### 2.6 Plugins — pass
All six plugin types pass the MP §57 scan: `net471`, `Microsoft.CrmSdk.CoreAssemblies 9.0.2.51`, strong-
named, no `System.IO`/registry/SQL/`HttpClient`/`Environment`/`Thread.Sleep`/assembly loading/hard-coded
URLs; only `AddToQueueRequest`. Namespace rename to `Qdb.DebtCollection.Plugins` is Phase 1.

---

## 3. Remaining dual-platform blockers (must close before any "DUAL-PLATFORM READY" claim)

| # | Blocker | Owner | Closes when |
|---|---|---|---|
| B1 | **No on-prem 9.1 environment has ever hosted DCP.** | QDB / user | An on-prem org is named and reachable (`TBD — Requires QDB Confirmation`) |
| B2 | Web API version constant (§2.1) | Phase 1 | Config-driven, both versions tested |
| B3 | Tooling auth Entra-only (§2.2) | Phase 1 | On-prem provisioning path executed once |
| B4 | No solution package / CI producing two artefacts | Phase 1 | Both packages built from one commit |
| B5 | `AdfsAdapter` never proven against real AD FS 2019 (COND-008) | Phase 1 + QDB access | Live AD FS token acquisition succeeds |
| B6 | Custom API availability on QDB's 9.1 build unknown | QDB | Confirmed either way; Process Action path is the fallback |
| B7 | HL/BFD facility entity names unknown | QDB | Names confirmed; lookup packaging decided |
| B8 | Browser auth mode on-prem unknown (§2.5) | QDB | Mode confirmed |
| B9 | Smart Assignment artefact not found; Process Engine on-prem status unknown | QDB | `EngineReuseAssessment.md` rows closed |

---

## 4. Portability quality gate — checklist for every new component (MP §8)

Before marking any component complete, answer in writing:

1. If this repository were deployed to the *other* platform tomorrow, would any Collection
   business/application/UI source change? (Required answer: **No.**)
2. Does the component mention a Web API version, org URL, hostname, tenant, domain, IIS path, local file
   path, or authentication endpoint? (Required: **No** — configuration or runtime context only.)
3. Does it use Custom API, elastic tables, Power Automate, Dataverse-only messages or cloud-only
   connectors as a hard dependency? (Required: **No**, or an on-prem adapter exists with tests.)
4. Does any plugin touch `System.IO`, registry, SQL, `HttpClient` to local hosts, full-trust-only APIs?
   (Required: **No.**)
5. Are HL/BFD differences resolved through `qdb_platformconfiguration` / `qdb_platformmapping`, not
   `if (org === 'HL')`? (Required: **Yes.**)
6. Is the platform-specific part (if unavoidable) isolated behind an interface, documented here with a
   reason, and covered by tests for **both** implementations? (Required: **Yes.**)
7. Tracker columns filled: Shared Source Confirmed · Platform-Specific Component/Reason ·
   Configuration/Adapter Used · Cloud Runtime Test Status · On-Prem Runtime Test Status ·
   Portability Status — with **On-Prem Runtime Tested** only after an actual on-prem run.
