# Dataverse Client — Reconciliation Spec

The Dataverse client is the one component genuinely duplicated across MSS Technologies
AI project boundaries. This document maps the divergence, defines the contract
a shared client would share, and states the migration order — so that if
extraction is ever scheduled (Phase 2 of the component-reuse plan), the design
work is already done and the decision is informed.

**Status: analysis only. No code has moved. This is the input to a decision,
not a commitment to make it.**

---

## The finding that shapes everything: two runtimes, not one

There is no single Dataverse client to extract, because the callers live in
two runtimes with incompatible auth models:

| | Node / server-side | Browser / web-resource |
|---|---|---|
| Holds a client secret? | **Yes** — it is the confidential client | **No** — a browser cannot keep a secret |
| Auth | client-credentials → bearer token | `window.Xrm` session, or a dev proxy that injects the token server-side |
| Callers | DFE backend, portal-shell api, dxp provisioning scripts | EDP designer, CWFD, DFE frontend + web resource |
| Base URL | `${DATAVERSE_URL}/api/data/v9.2` | `Xrm.Utility.getGlobalContext().getClientUrl()` or `/dataverse` proxy |

A shared client is therefore **two packages** — call them
`@qdb/dataverse-node` and `@qdb/dataverse-browser` — or it is nothing.
Attempting to unify them puts a client secret one refactor away from a browser
bundle. That is the first line of the design, and it is non-negotiable.

---

## Node / server-side divergence

| Aspect | DFE `CrmAuthService` + `CrmBaseService` | dxp `TokenProvider` | portal-shell `dataverse` plugin |
|---|---|---|---|
| Token library | `@azure/identity` `ClientSecretCredential` | `@azure/msal-node` `ConfidentialClientApplication` | (see file) |
| Token caching | yes — 5-min expiry buffer | none | — |
| 429 handling | retry, exponential backoff, jitter | none | — |
| Error type | `CrmApiError` (typed) | plain `Error` | — |
| OData headers | centralised, `include-annotations="*"` | per-call | — |
| Env vars | `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `DATAVERSE_URL` | `DATAVERSE_TENANT_ID` / `DATAVERSE_CLIENT_ID` / `DATAVERSE_CLIENT_SECRET` / `DATAVERSE_ORG_URL` | mixed |

**The best server implementation is DFE's** `CrmAuthService` + `CrmBaseService`:
it caches, it retries with jitter, it types its errors, and it centralises the
OData headers. It is the natural basis for `@qdb/dataverse-node`.

## Browser / web-resource divergence

All three already avoid holding a secret; they differ in how they discover the
base URL and obtain a session:

- **EDP** — `apiBase()` probes `window.Xrm` context, falls back to a
  same-origin `.dynamics.com` path, then to a `/dataverse` dev proxy.
- **CWFD** — Xrm.WebApi with a dev shim (`DevXrmWebApiShim.ts`).
- **DFE** — MSAL in the portal build, Xrm in the web-resource build, swapped at
  build time.

EDP's `apiBase()` triple-fallback is the most complete base-URL resolver and is
the basis for `@qdb/dataverse-browser`.

---

## The env-var tax

The same three secrets and one URL are named four ways across the codebase:

| Concept | Names in use (occurrence count) |
|---|---|
| Org URL | `DATAVERSE_URL` (50), `DATAVERSE_ORG_URL` (21), `CRM_ORG_URL` (6) |
| Client id | `AZURE_CLIENT_ID` (36), `DATAVERSE_CLIENT_ID` (22) |
| Tenant id | `AZURE_TENANT_ID` (31), `DATAVERSE_TENANT_ID` (12) |
| Secret | `AZURE_CLIENT_SECRET` (27), `DATAVERSE_CLIENT_SECRET` (12) |

A shared client must fix one canonical set. Whichever is chosen, **every
non-conforming project's `.env` and deployment configuration changes at the
same time** — this is the single largest source of risk in extraction, and the
reason it must be done one project at a time with a live-org reverify each.

Proposed canonical names (superset, `DATAVERSE_` prefix, since that is the
domain): `DATAVERSE_URL`, `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`,
`DATAVERSE_CLIENT_SECRET`. A thin adapter can read the legacy `AZURE_*` names
during migration so a project keeps working until its config is cut over.

---

## Canonical contract (both packages)

```
interface DataverseClient {
  get<T>(path: string, options?): Promise<T>;
  post<T>(path: string, body: unknown, options?): Promise<T>;
  patch<T>(path: string, body: unknown, options?): Promise<T>;
  delete(path: string, options?): Promise<void>;
  // batch/changeset for transactional multi-entity writes — see BE-M-005
  batch(operations): Promise<BatchResult>;
}
```

Shared behaviour both implementations must carry:

- OData v9.2 headers centralised, `Prefer: odata.include-annotations="*"`.
- 429 retry with exponential backoff + jitter (from DFE's `CrmBaseService`).
- A typed error carrying status, the CRM error code, and the operation — so a
  412 alternate-key collision (`GOT-024`) and a 404-on-write from a bad
  impersonation caller (`GOT-017`) are distinguishable by callers.
- Option-set values treated as 100000000-based (`GOT-011`).
- On writes, the `MSCRM.SolutionUniqueName` header where metadata is created
  (`GOT-025`).

The Node package additionally owns token acquisition + caching. The browser
package additionally owns base-URL discovery + session/proxy auth.

---

## Migration order (Phase 2, if scheduled)

One project per engagement, each with its own live-org reverify and its own
approve-with-conditions gate. Ordered least-risk first:

1. **portal-shell** (internal) — already a workspace with `@portal/dataverse-client`.
   Consolidate its own `apps/api` duplication into that package. No
   cross-boundary blast radius. **This is Phase 1 and proves the design.**
2. **dxp provisioning scripts** — not deployed as a live service; a broken
   script fails loudly at run time, not silently in production. Safe next step.
3. **DFE backend** — the source of the canonical Node design; migrating it onto
   the extracted package is mostly mechanical, but it is deployed, so reverify.
4. **EDP designer / CWFD / DFE web-resource** — browser package. Highest care:
   these run inside CRM, and a base-URL or bundling regression reproduces the
   `@qdb/shared` alias class of failure (`GOT-018`). Hard-refresh and live-org
   verify are mandatory (`GOT-016`, `PAT-002`).

---

## The honest recommendation

After reading this, the reasonable decision may be **not to extract at all**,
or to extract only the Node package. There are four server callers, one of
which (dxp scripts) barely changes, and three browser callers whose auth models
already differ for good reasons. The registry alone — so the *next* project
adopts the canonical DFE design instead of forking a fifth implementation — may
capture most of the value at none of the cross-project coupling cost.

Extraction is justified only if a concrete driver appears: a shared bug that
must be fixed in four places, a new project that would fork a fifth client, or
a security change (the SEC-01 secret rotation) that is easier to land once. Absent
one of those, the registry and this spec are the deliverable, and Phase 2 stays
unscheduled.
