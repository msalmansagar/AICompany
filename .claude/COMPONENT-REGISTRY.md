# Component Registry

The catalogue of reusable assets across Maqsad AI projects. Before building
anything shared-shaped — a Dataverse client, a translation resolver, a lookup
service, a file handler — check here first (Constitution Article XVII).

This registry is **honest about status**. Most entries are single-project
assets that *other* projects would benefit from, not code that is currently
duplicated. Only one concern — the Dataverse client — is genuinely duplicated
across project boundaries, and even that splits by runtime. The registry says
so plainly, because a registry that overstates reuse sends agents to copy code
that was never meant to be shared.

Last surveyed: 2026-07-24.

---

## Maturity grades

| Grade | Meaning |
|---|---|
| **Production** | Deployed, live-verified, stable API. Copy and adapt with confidence. |
| **Solid** | Works and is tested, but its API may still move. Reuse, expect to adapt. |
| **Divergent** | The same job is done several ways across projects. Do NOT pick one blindly — read the reconciliation note before reusing. |
| **Single-owner** | Lives in one project, not yet generalised. A reuse *candidate*, not a shared component. Lifting it out is real work. |

---

## "I need to…" quick reference

| I need to… | Look at | Grade |
|---|---|---|
| acquire a Dataverse token in a **Node service** | `dataverse-client` → Node row | Divergent |
| call Dataverse from a **browser / web resource** | `dataverse-client` → Browser row | Divergent |
| resolve multilingual labels (Arabic/English) | `translation-resolution` | Single-owner (DFE) |
| resolve lookup / option-set values | `lookup-resolution` | Single-owner (DFE) |
| upload or download a document to Dataverse | `crm-file-service` | Single-owner (DFE) |
| retry a Dataverse call on 429 | `CrmBaseService` (DFE) | Solid |
| package web resources into a solution ZIP | `packageSolution.js` (DFE) + `GOT-001..004` | Production |
| provision Dataverse schema from a script | `dxp-p1-*/scripts/provision-schema` | Solid |
| share UI/types inside one project | `portal-shell/packages/*` | Production (local) |

---

## Registry

### dataverse-client — **Divergent**, splits by runtime
The single genuine cross-project duplication. The critical fact: **it is two
components, not one, because a browser cannot hold a client secret.** Do not
attempt to unify these into a single client.

**Node / server-side** (holds the secret, acquires a token, calls Web API):

| Project | File | Library | Caching | Notes |
|---|---|---|---|---|
| dynamic-form-engine | `backend/src/services/CrmAuthService.ts` + `CrmBaseService.ts` | `@azure/identity` | yes, 5-min buffer | Best server implementation. Retry + jitter on 429, `CrmApiError`. |
| portal-shell | `apps/api/src/plugins/dataverse.ts` + `packages/dataverse-client` | (see file) | — | Already inside a workspace — consolidate here first. |
| dxp-p1-001/003 | `scripts/provision-schema/src/auth/TokenProvider.ts` | `@azure/msal-node` | none | Provisioning scripts. Different env-var names. |

**Browser / web-resource** (no secret; session or dev-proxy auth):

| Project | File | Auth model |
|---|---|---|
| enterprise-decision-platform | `designer/src/dataverse/client.ts` | `window.Xrm` context, `credentials: 'include'`, `/dataverse` dev proxy |
| crm-workflow-designer | `src/services/DataverseAdapter.ts` (1071 lines; thin auth core, mostly domain logic) | Xrm.WebApi / dev shim |
| dynamic-form-engine | `frontend/src/auth/tokenService.ts` + `webresource/xrm/xrmClient.ts` | MSAL (portal) / Xrm (web resource) |

Reconciliation contract, migration order, and the env-var divergence:
**`.claude/architecture/dataverse-client-reconciliation.md`**. Read it before
reusing or consolidating any of the above.

### translation-resolution — **Single-owner (DFE)**
Multilingual (Arabic/English) label resolution with language fallback. Owned
by DFE, with a **C# mirror** in the plugin that must stay in lockstep.

- TS: `dynamic-form-engine/backend/src/services/TranslationResolutionService.ts`
- C#: `crm-plugins/Qdb.FormEngine/.../DesignPicklistMapper.cs` and the generator's
  translation resolution (mirrors the TS codes 1:1)

Every other QDB project rendering CRM data bilingually re-solves this. A strong
generalisation candidate — but lifting it out means carrying the TS/C# parity
constraint into the shared package. Not started.

### lookup-resolution — **Single-owner (DFE)**
Resolves lookup and option-set values, including language-aware multi-column
lookups and external-API-backed options.
- `backend/src/services/CrmLookupService.ts`, `ApiLookupService.ts`
- Option-set codes are 100000000-based (`GOT-011`) — any reuse must not assume
  0-based ordinals.

### crm-file-service — **Single-owner (DFE)**
Document upload/download against Dataverse annotations.
- `backend/src/services/CrmFileService.ts`, `CrmSubmissionService.ts`
- Depends on `CrmBaseService` for the HTTP + auth core.

### CrmBaseService — **Solid (DFE)**
The shared HTTP core within DFE: bearer injection, OData headers,
`odata.include-annotations`, and 429 retry with exponential backoff + jitter.
This is the natural seam for a shared Node client — the auth service plugs into
it. `backend/src/services/CrmBaseService.ts` (81 lines).

### solution-packaging — **Production (DFE)**
Dynamic solution-manifest generation from build output, with deterministic
md5-derived GUIDs. Encodes `GOT-001` through `GOT-004`.
- `dynamic-form-engine/designer/scripts/packageSolution.js`
- Verify a package with `.claude/scripts/gate-crm-deploy.sh`.

### schema-provisioning — **Solid**
Idempotent Dataverse schema provisioning from a config manifest, with the
`MSCRM.SolutionUniqueName` header (`GOT-025`) and atomic entity+attribute
creation (`GOT-013`).
- `dxp-p1-001/003/scripts/provision-schema/`

### portal-shell/packages — **Production (local only)**
A working internal workspace: `@portal/dataverse-client`, `auth-adapters`,
`types`, `i18n`, `ui`, `widget-registry`, wired with `"*"` workspace deps.
**This is the proof the packages pattern works — scoped to one project.** It is
the model to generalise, and the safest place to consolidate first.

---

## What is NOT reusable (recorded to stop false positives)

- `email-editor-pcf/src/token/*` — an **expression-token** engine (lexer /
  parser / renderer). Nothing to do with auth tokens. A keyword search for
  "token" will surface it; it is not a Dataverse component.
- The ~120 one-off provisioning `.mjs` scripts that each inline a token fetch.
  They run once, manually, and never change. DRY does not apply to throwaway
  scripts — deduping them is pure cost.

---

## Adding to this registry

When you build something a second project could use, add a row: what it is,
its owning project and file, a maturity grade, and any gotcha a reuser must
know. When you reuse something, note it in the consuming project's plan
(Article XVII). When two implementations diverge, change the grade to
**Divergent** and write the reconciliation note — do not silently prefer one.
