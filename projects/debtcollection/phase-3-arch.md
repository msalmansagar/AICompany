# DCP-001 — Phase 3: Solution Architecture

**Project:** Debt Collection Platform (DCP-001)
**Date:** 2026-09-14
**Author:** Architect — MSS Technologies
**Status:** DRAFT — for the CEO Phase-3 → Phase-4 gate (Constitution Article VIII, checkpoint 2)
**Baseline:** BRD `phase-2-ba.md` v1.0 + priority re-cut `phase-2-ba-priority-recut.md` (73 P1 / 59 P2 / 4 P3, CEO signed 2026-09-14)
**Binding inputs:** `facts-and-analysis.md` §5–§11, `dependencies.md`, `brief.md`, `phase-1-ceo.md`
**Scope of this document:** Phase 1 = Housing Loan only, BFD behind a feature flag. Every P1 FR is
referenced here or in `phase-3-arch-appendix.md` (FR → component map). P2/P3 items are named only where
a P1 boundary depends on them.

> Companion files: `phase-3-arch-appendix.md` (entity field lists, endpoint catalogue, statuscode
> matrices, FR → component map) and `adrs/` (ADR-DCP-01..06 full text + `adrs/index.md`).

---

## 1. Context and Boundaries

The platform is a **standalone Next.js workspace** over a **separate Fastify CRM Context Router**, which
is the single component that talks to the Dynamics 365 CE org(s). The two CRMs remain the system of record
for their own cases; the router owns identity mapping, fan-out/merge, stop-contact/consent enforcement, and
audit correlation. Delinquency arrives only from the MIS Middleware API; nothing computes DPD or arrears.

### 1.1 C4 Level 1 — System Context

```
        ┌───────────────┐        ┌──────────────────────────────┐        ┌─────────────────────┐
        │ Collection    │  HTTPS │  DEBT COLLECTION PLATFORM     │  OData │ Housing Loan CRM    │
        │ Officer / RM /  ├───────►│  (Next.js portal +           ├───────►│ D365 CE 9.x on-prem │
        │ Senior Manager │        │   Fastify CRM Context Router) │        │ (system of record)  │
        └───────────────┘        └──┬────────┬────────┬─────────┘        └─────────────────────┘
                                    │        │        │                   ┌─────────────────────┐
        ┌───────────────┐          │        │        │  OData (flagged)  │ BFD CRM  [Phase 2]  │
        │ Legal /        │ native   │        │        └──────────────────►│ D365 CE 9.x on-prem │
        │ Insurance User ├─CRM──────┘        │                            └─────────────────────┘
        └───────────────┘  (no portal UI)    │
                                             ├──► MIS Middleware API  (delinquency, live balance, portfolio)
                                             ├──► SMS gateway (ISmsGateway) · Email (SMTP/nodemailer)
                                             └──► AD FS 2019 now / Azure AD later  (pluggable auth adapter)
```

External systems **out of Phase 1 build**: Payments event stream (P2, FR-062/123), QCB file (P3, FR-124),
DWH portfolio extract (P2, FR-125/128). WhatsApp is procurement-gated (FR-136 fail-closed only).

### 1.2 C4 Level 2 — Containers

```
  apps/web  (Next.js, next-auth, next-intl, Fluent, TanStack Query, recharts)
     │  client-component fetch only — NO PII in SSR (NFR-006)
     ▼
  apps/api  = CRM CONTEXT ROUTER (Fastify, pino, zod, CASL, openid-client)
     │   capabilities: identity-map · org-routing · fan-out/merge · stop-contact+consent gate ·
     │   PII masking · audit correlation-id · MIS live-balance proxy · notification dispatch
     ├──► packages/dataverse-client (Node)  ──OData v4──►  HL CRM  ┐  plugins: audit, transition,
     ├──► ISmsGateway / nodemailer (INotificationService)          │  immutability (Moq-tested)
     ├──► MIS Middleware API (live balance + ingest source)        │
     └──► pg-boss on PostgreSQL (ingest scheduler, DLQ)            ┘
  ingest-worker (pg-boss job, same apps/api image)  ──►  MIS API → upsert customer/facility → append snapshot
```

**Boundary rules (non-negotiable, from R-01/R-03/R-04):** (a) the browser never calls a CRM directly and
never holds a secret; (b) stop-contact + consent + audit are enforced server-side where F12 cannot reach;
(c) audit is written by a CRM plugin, never by the router or portal; (d) BFD is reachable by config only.

---

## 2. Data Residency, Tenant Type, and PDPPL Applicability

Raised at architecture time as a named gate with an owner, not deferred to audit (learned pattern
ARC-P-003; compliance CMP-001). This is a hard release gate (NFR-008/009).

| Concern | Phase 1 (now) | After migration (~Q1 2028) | Owner |
|---|---|---|---|
| Tenant type | Both CRMs **on-premise D365 CE 9.x**; no cloud tenant | Dataverse cloud tenant, Qatar/UAE data boundary | Client / Technical Lead |
| CRM data residency | On client infrastructure in Qatar | Dataverse region = Qatar North (or tenant-designated boundary) — **West Europe default is not acceptable** | Client + Auditor |
| Router + PostgreSQL residency | Containerised on client infrastructure **beside the CRMs** | Same image redeployed to Azure in the designated boundary | DevOps |
| Auth | AD FS 2019 / OIDC | Azure AD / Entra ID (same OIDC contract, ADR-DCP-04) | DevOps |
| PDPPL (Law No. 13/2016) | Applies to all customer contact data, communication logs, consent, stored PII. **Data-protection assessment is a go-live gate.** No production PII lands on any environment before sign-off (NFR-008) | unchanged | Auditor / Compliance |
| PDPPL surface reduction | No customer PII in SSR HTML (NFR-006); PII masked at the router for roles without `View Sensitive PII` (FR-014/114); consent fail-closed before any send (FR-134) | unchanged | Security-engineer |

**Migration is OUT of DCP-001 scope** but is a binding non-functional constraint (NFR-020): only components
present on **both** platforms may be used (see §4.6), and the managed solution must import into Dataverse
unchanged. This constraint is the reason for ADR-DCP-04.

---

## 3. Monorepo Layout

One monorepo, **forked in shape from `projects/portal-shell`** (all 7 phases complete, on `main`), which
already ships the two expensive parts — the audited Dataverse client and the auth-adapter contract. Turborepo
+ npm workspaces, matching the CLAUDE.md defaults, so no stack ADR is needed (ADR-DCP-02 records only the
hosting reversal and router placement).

```
debtcollection/                      (monorepo root — package.json, turbo.json, tsconfig.base.json)
├── apps/
│   ├── web/          @dcp/web    Next.js App Router portal — next-auth, next-intl (AR/EN+RTL),
│   │                             Fluent UI, TanStack Query, recharts. Client-component fetch only.
│   └── api/          @dcp/api    CRM CONTEXT ROUTER — Fastify, pino, zod, CASL, openid-client,
│                                 nodemailer, liquidjs, puppeteer, pg-boss. Also hosts the ingest worker.
└── packages/
    ├── types/         @dcp/types           Shared TS types + zod schemas (org contracts, DTOs). ONE representation.
    ├── dataverse-client/ @dcp/dataverse-client  KEEP-EXISTING — forked from portal-shell Node client (bearer
    │                                       injection, CrmApiError, 429 retry+jitter). Node runtime only.
    ├── auth-adapters/ @dcp/auth-adapters   IAuthAdapter + AdfsAdapter / AzureAdAdapter (openid-client). ADR-DCP-04.
    ├── i18n/          @dcp/i18n            AR/EN resource bundles + RTL helpers (NFR-013).
    └── ui/            @dcp/ui              Shared Fluent components + the DCP theme (Power Platform blue default).
```

**Reuse decisions (Article XVII / XX — COMPONENT-REGISTRY).**

| Shared-shaped need | Registry entry | Decision |
|---|---|---|
| Node Dataverse client (holds secret, calls Web API) | `dataverse-client` → Node row (Divergent) | **Reuse** portal-shell client; carry forward into `packages/dataverse-client`. Browser never gets a client — portal calls the router (ADR-DCP-02). |
| Auth adapter contract | `portal-shell/packages/auth-adapters` (Production, local) | **Reuse** the `IAuthAdapter` shape; add `AdfsAdapter` via openid-client (ADR-DCP-04). |
| Monorepo packages pattern | `portal-shell/packages` (Production, local) | **Reuse** the shape; new project scaffolds its own copy. |
| Solution packaging (manifest from build, md5 GUIDs) | `solution-packaging` (Production, DFE) | **Reuse** `packageSolution.js` approach (NFR-017; GOT-001..004). |
| `INotificationService` + `ISmsGateway` | none yet | **Build** new (dependencies.md §4); add a registry row once built. |

**No physical cross-project extraction, no monorepo conversion** (Article XVII). Each MSS project builds and
deploys independently; the registry captures the *decision* to reuse, and the fork copies the shape.

---

## 4. CRM Solution Design

One **managed solution** (`MsstDebtCollection`, publisher `MSST`, prefix `msst`, product segment `dcp` on entities per `global/PUBLISHER-AND-PREFIX.md`) imported identically into HL and BFD
from a single package — the schema-level mitigation for role/schema drift (R-05). Field-level attribute lists
are in the appendix; this section is the inventory, the statuscode model, the plugins, and the roles.

**Naming amendment 2026-09-15.** The draft named everything `qdb_*`. That violates `global/PUBLISHER-AND-PREFIX.md` (one publisher `MSST`, prefix `msst`, product segment on entities and Custom APIs, none on columns; the client is the first customer, never the namespace owner) and a prefix is permanent once components exist. All names below are therefore `msst_dcp<entity>` for entities and `msst_<column>` for columns; the BRD's `qdb_*` names are read as logical placeholders for these. Web resources, if any, are `msst_dcp_*`.

### 4.1 Entities — Phase 1 only

| Logical name | Kind | Purpose | P1 FRs |
|---|---|---|---|
| `msst_dcpcustomer` | entity (or Contact ext.) | Customer master; QID key, `stopContact`, deceased flag, preferred language, consent link | FR-007, 095 |
| `msst_dcploanfacility` | entity | Facility: product type, balance, arrears, DPD, NPL/account-status axis | FR-002, 020 |
| `msst_dcpdelinquencysnapshot` | entity (**append-only**) | Immutable per-facility per-run snapshot; MIS `batchReference`, `asOf`, DPD, arrears, balance, 10-bucket | FR-016, 017, 018, 024 |
| `msst_dcpcollectioncase` | entity | Manually-created case; product type, reason, statuscode | FR-019, 020, 022, 025 |
| `msst_dcpcollectionaction` | **custom activity** | Call, meeting, supervisor review, field-visit, manual note. No outbound side-effect | FR-045, 046, 047, 048, 052, 053 |
| `msst_dcpcommunication` | **custom activity** | SMS, email, official letter, call log. Dispatches + delivery lifecycle | FR-065, 066, 073, 075 |
| `msst_dcpptprecord` | entity | Promise-to-pay commitment; monitored after close | FR-055, 057, 059, 061 |
| `msst_dcpconsent` | entity | PDPPL consent per customer per channel; fail-closed source | FR-133, 134, 135 |
| `msst_dcpstrategyconfig` | entity (config) | DPD-bucket → action rule; "no automated contact" | FR-031, 032, 033, 035 |
| `msst_dcpauditlog` | entity (**append-only**) | Plugin-written audit; blocked to sysadmin | FR-108, 109, 110, 111 |
| `msst_dcpidentityexception` | entity | Unresolved-identity queue (missing/duplicate QID) | FR-007 |

P2/P3 entities named by ADR-DCP-01 §5 but **not built in Phase 1**: `msst_dcprestructurecase`, `msst_dcplegalcase`,
`msst_dcpinsuranceclaim`, `msst_dcpdispute`, `msst_dcpapprovalrequest`. Legal/Insurance personas use native CRM (ADR-DCP-03).

### 4.2 Custom activities (ADR-DCP-01)

`msst_dcpcollectionaction` and `msst_dcpcommunication` are `IsActivity = true` — **split on privilege, not tidiness**:
"may log a call" ≠ "may send an SMS" is a native RBAC boundary (RFP §4 segregation of duties). `regardingobjectid`
is **polymorphic** (Contact/Account, `msst_dcploanfacility`, `msst_dcpcollectioncase`) so an interaction **never requires
a case** — the direct fix for manual case creation (D-2) over the 41% top-of-funnel population. The native
Timeline aggregates both, satisfying FR-004/012 with no custom control (cross-org timeline is deferred with BFD).
`subject` is composed by a plugin. Frontend cost: read `_regardingobjectid_value` + `lookuplogicalname`
annotation, `$expand` names the target type (appendix §A note; GOT-009).

### 4.3 Statuscode model

`msst_dcpcollectioncase` carries the 17-value lifecycle of FR-022; transitions are validated by a plugin against an
allowed-transition matrix (FR-023). `msst_dcpptprecord` carries Open/Kept/PartiallyKept/Broken/Rescheduled/Cancelled
(FR-059). Custom activities use the native Open/Completed/Canceled statecode; **immutability keys on
`statecode = Completed`** (FR-047/075). **Full transition matrices are in appendix §B.**

### 4.4 Plugins — one generic engine, three responsibilities (Moq-tested, dependencies.md §8)

| Plugin | Fires on | Responsibility | P1 FRs |
|---|---|---|---|
| `AuditLogWriter` | post-op Create/Update on every tracked entity | Write append-only `msst_dcpauditlog` row (actor+role, old/new, source path, correlation id) | FR-036, 061, 076, 108, 109, 118 |
| `StatusTransitionValidator` | pre-op Update of `statuscode` on case/PTP | Reject transitions outside the matrix with an explanatory error | FR-023 |
| `ImmutabilityGuard` | pre-op Update/Delete | Block change once `statecode=Completed` (activities) or on snapshot/audit rows — **including for sysadmin** | FR-017, 025, 047, 075, 110 |

`subject`-composition and `stopContact`→queue-move (FR-097) are small pre/post-op steps registered alongside.
All target **.NET Framework 4.7.1**, merged+signed (TSD-002; GOT-005/006). No Custom APIs (on-prem/cloud parity).

### 4.5 Security roles (single matrix — FR-112/113)

One role matrix authored once and deployed to both orgs; a deployment step compares both orgs and reports drift
(R-05; the cross-org **drift report is P3/BFD**, the single-matrix authoring is P1). Twelve roles (FR-113).
`View Sensitive PII`, `Send Free-Text Message`, and per-channel send privileges are **privileges**, not code
checks. **No role holds Delete** on case/snapshot/audit/completed-activity — necessary but not sufficient, so
`ImmutabilityGuard` also blocks sysadmin (FR-025/047/075/110). Full matrix in appendix §C.

### 4.6 Config-table vs code (Article V; NFR-018)

**Config (edited on CRM native forms in Phase 1 — no portal admin screen, T3):** strategy rules incl. "no
automated contact" (`msst_dcpstrategyconfig`, FR-031/032/033/035), action-outcome codes (FR-052), SLA thresholds
per queue (FR-040), PTP reschedule limit and broken-PTP escalation count (FR-058/060), templates AR/EN
(seeded pre-approved by Compliance offline, FR-070). **Code:** transition matrix shape, the router capabilities,
plugin logic. **Never in config:** record GUIDs — resolve by code/name/alternate-key at runtime (ARC-M-001,
GOT-023, ANTI-001). Cloud-only surfaces (Custom APIs, elastic tables, Power Automate as a hard dependency)
are **not used** — features must exist on both on-prem 9.x and Dataverse (NFR-020).

---

## 5. CRM Context Router Design (`apps/api`)

The router is a **shared Fastify service**, not Next.js route handlers (ADR-DCP-02 decision 3): CRM plugins,
the MIS callback, pg-boss, and any later mobile client call it, and R-03/R-04 enforcement must be unbypassable.
Every request enters through zod validation at the boundary (Article III), passes through the auth + correlation
+ masking pipeline, and only then reaches a capability handler. Full endpoint catalogue is in appendix §D.

### 5.1 Endpoints grouped by capability

| Capability | Representative routes | P1 FRs |
|---|---|---|
| Identity & Customer 360 | `GET /customers/:qid`, `GET /customers/:qid/facilities`, `GET /identity-exceptions` | FR-001, 002, 007 |
| Case | `POST /cases`, `PATCH /cases/:id/status`, `GET /cases` | FR-019, 020, 022, 023 |
| Actions & Timeline | `POST /actions`, `GET /customers/:qid/timeline`, `GET /actions/overdue` | FR-045, 046, 048, 052 |
| PTP | `POST /ptp`, `GET /ptp/:id`, `POST /ptp/:id/mark-kept` | FR-055, 057, 059, 061 |
| Communication (gated) | `POST /communications` (channel in body), `GET /communications` | FR-065, 066, 067, 068, 073 |
| Consent | `GET /consent/:qid`, `PUT /consent/:qid/:channel` (record/withdraw) | FR-133, 134, 135 |
| Strategy & Queues | `GET /strategy`, `GET /queues`, `PATCH /cases/:id/queue` | FR-031, 037, 038, 040, 043 |
| MIS live & health | `GET /mis/balance/:facility` (live "as of"), `GET /health`, `GET /integrations/health` | FR-002, 027, 126 |
| Evidence pack | `POST /cases/:id/evidence-pack` (puppeteer PDF) | FR-111 |
| Dashboards | `GET /dashboards/operational`, `GET /dashboards/ptp` | FR-127, 129 |

`GET /health` returns `{ status, version, timestamp }` (Article XIV). Masking (FR-014/114) is applied in a
response interceptor keyed on the caller's role claim, so no handler can accidentally leak PII.

### 5.2 Auth adapter (ADR-DCP-04, pluggable — NFR-005/020)

`IAuthAdapter` in `packages/auth-adapters` with two implementations over **openid-client** (dependencies.md §1):
`AdfsAdapter` (AD FS 2019 OIDC discovery) now, `AzureAdAdapter` (Entra ID) after migration. Selected by
environment variable at Fastify startup; **no business logic is aware of the flavour**. Every route requires a
valid token or returns HTTP 401 (NFR-005). The Node→CRM leg uses the forked `dataverse-client`; on-prem uses an
S2S/OAuth service principal, cloud uses MSAL client-credentials — behind the same client interface.

### 5.3 Org routing + identity map

An org is a runtime attribute of a **record**, never of a page (brief §2). `resolveOrg(request)` decides HL vs
BFD by, in order: explicit `org` param → facility product type → record-id prefix (FR-119). Phase 1 always
resolves HL; BFD is a config-gated branch (`FEATURE_BFD`, NFR-012/SC-06) proven against an empty BFD target.
The **QID identity map** (`msst_dcpcustomer.msst_qid` alternate key in each org) lets the router fan out on QID and
merge for cross-org 360 — **built but flag-off in Phase 1** (FR-009 is P3). Records with no QID land in
`msst_dcpidentityexception` and are never merged (FR-007). No record GUID is ever carried across orgs (ARC-M-001).

### 5.4 Stop-contact + consent gate placement (R-04; the SC-03 control)

The gate lives in a single Fastify pre-handler on **every** outbound-communication path, **before any channel
adapter and before the `msst_dcpcommunication` create** (ADR-DCP-01 constraint 3):

```
POST /communications
  → validate(zod) → auth → correlationId
  → GATE:  stopContact(customer)?  OR  consent(customer, channel) ∈ {missing, withdrawn}?
             ├─ blocked → write msst_dcpcommunication{ status: Blocked, reason, channel, ts }  (evidence)
             │            → return Result.err('stop_contact' | 'consent_not_established' | 'consent_withdrawn')
             └─ allowed → channel adapter (ISmsGateway / nodemailer) → msst_dcpcommunication{ Completed, deliveryStatus }
```

Consent is **fail-closed**: absence of a record = no consent (FR-134). WhatsApp inherits the SMS gate (FR-136,
no build). Withdrawal is honoured on the next attempt with no grace period (FR-135). A blocked attempt is still
written as evidence — the block itself is the audit artifact SC-03 exports.

### 5.5 Correlation id + error model

Every request is stamped with a `correlationId` (Article XIV) that flows React → router → CRM; the router passes
it to the plugin via a custom header so the `msst_dcpauditlog` row records the **full source path** (FR-109). All
handlers return a **`Result<T, DomainError>`** — never `null`, never a bare throw across the boundary (common.md;
ARC preferred approach). `DomainError` carries a stable code (`stop_contact`, `consent_withdrawn`,
`invalid_transition`, `identity_unresolved`, `mis_unavailable`) mapped to an HTTP status by one boundary handler.
**A CRM refusal arrives as HTTP 200 with an `errorCode` body, not a 4xx** — the client checks the body, not just
the status (memory: Report Engine gotcha). Alternate-key collisions surface as 412, not 409 (GOT-024).

---

## 6. MIS Ingest Pipeline and Snapshot Strategy (ADR-DCP-05)

MIS via the Middleware API is the **sole** delinquency and portfolio feed, returning data **pre-classified into
the ten DPD buckets** (FR-121; D-1). The platform never computes DPD or arrears. **Store thin, read live**
(facts §5): persist an immutable audit snapshot on change + month-end; show volatile figures live with an
"as of" stamp.

```
pg-boss schedule (configurable, nightly)  ──►  MIS Middleware API  (delinquent accounts only, NOT the full book)
   │  one job, transactional: enqueue + write in the SAME PostgreSQL transaction (no split-brain, dependencies §3)
   ▼
for each facility in batch:
   upsert  msst_dcpcustomer / msst_dcploanfacility        (mutable, current — by QID/facility alternate key)
   append  msst_dcpdelinquencysnapshot  IF  bucket or arrears CHANGED, OR it is month-end   (else skip)
                                     carrying MIS batchReference + asOf (immutable, plugin-guarded)
```

**Snapshot rules (FR-016/017/018):** append-only (ImmutabilityGuard, never the UI, R-03); every row is
attributable to a `batchReference` and `asOf` moment (the "value at the moment of decision" audit need); the
change-plus-month-end rule removes ~80% of rows while preserving every decision point and the regulatory
month-end position; retention configurable (daily 13 months, monthly thereafter). Buckets stored verbatim as the
ten MIS values; **NPL / Write-off live on a separate account-status field**, not the bucket field (FR-018; §3
of facts). Volume is small-data (~4,900 accounts) — no caching/sharding (NFR-011). Ingest completes < 30 min
(NFR-002).

**Failure surfacing (NFR-014/019 — a hard go-live requirement).** A silent MIS outage that leaves stale figures
on screen with no warning is worse than an error. Each run writes a batch-status record (last run, records
processed, failures, latency); a failed or SLA-overdue run raises the workspace **ingest-failure alert**
(FR-027) and shows on the **integration health panel** (FR-126). Live-balance reads that fail return
`Result.err('mis_unavailable')` so the screen shows an explicit staleness banner, never a silent stale number.
The live path and the snapshot path serve the same figures — a **parity check between them is required in the
architecture, not left to QA** (ARC-M-002).

---

## 7. PTP Kept / Broken Evaluation (ADR-DCP-06)

There is **no Payments feed in Phase 1** (that is P2, FR-062/123). "Kept" is therefore detected from the MIS
snapshot or a manual mark — the CEO note and T3 decision:

- **Broken (FR-057/058, the SC-02 path):** a PTP whose promised date has passed and whose **latest snapshot**
  does not show arrears reduced by ≥ the promised amount is set to `Broken`, and a broken-PTP
  `msst_dcpcollectionaction` is written; after a configurable count of broken PTPs the case escalates to the
  supervisor queue. Evaluation runs as a pg-boss job after each ingest (so it always reads the newest snapshot).
- **Kept:** the next MIS ingest shows arrears reduced by ≥ the promised amount ⇒ `Kept` (or `Partially Kept` if
  reduced by less); OR an officer marks it Kept with a reason (`POST /ptp/:id/mark-kept`), which is the
  **correction path**.

**Batch-latency note (CEO note 2; ADR-DCP-06 core risk).** MIS ingest is batch: a payment made near the promised
date may not reduce arrears until the next ingest, risking a **false Broken flag and a false escalation**.
Mitigations, all required: (a) always evaluate Broken against the **latest** snapshot, never a stale one;
(b) never auto-escalate on the first ingest after the promised date if that ingest post-dates the promise by less
than one ingest cycle — give the payment one cycle to land; (c) the manual **Kept** mark instantly reverses a
false Broken and is itself audited (FR-061). Since SC-02 governs the broken path and does not mandate a
payment-event source, the MIS arrears-drop is a valid "matched payment" signal (CEO §7c).

---

## 8. Communication Pipeline (Module 7)

```
officer/PTP-reminder request
  → router POST /communications { qid, channel, templateId, params }
  → template resolve (liquidjs, AR/EN by preferred language, default AR)        FR-070
  → APPROVED-TEMPLATE check (no free-text without privilege)                    FR-069
  → STOP-CONTACT + CONSENT GATE (§5.4, fail-closed)                             FR-067/068/134
      blocked → msst_dcpcommunication{ Blocked, reason }  (evidence, SC-03)          FR-067
  → INotificationService → ISmsGateway | nodemailer(SMTP)                       FR-065/122
  → create msst_dcpcommunication{ Completed, channel, templateRef }                 FR-066
  → gateway delivery-status webhook → PATCH deliveryStatus                      FR-122 (P2: Delivered/Opened)
```

**One authoritative record** per send in `msst_dcpcommunication` only — the prototype's duplicate action row is
removed (ADR-DCP-01 §6, FR-066). Channels in Phase 1: **SMS, Email, Official Letter, Call log** (FR-065); call
logging needs no telephony integration (FR-073). Templates are LiquidJS (sandboxed, no code-eval — the FR-069
control; handlebars rejected for 2026 RCE/XSS advisories, dependencies §5), seeded pre-approved by Compliance
offline in Phase 1 (in-system approval workflow is P2, FR-071). Completed communications are immutable (FR-075).
The PTP reminder (FR-056) is the first automated send and the first real exercise of the gate. Official-letter
dispatch sub-states depend on Q-11 (open). Bilingual content is a P1 NFR (NFR-013); portal RTL layout is P2.

---

## 9. Portal Information Architecture (`apps/web`)

Mapped to the prototype's seven pages (`prototype/index.html`). Only **P1 screens** are built; the rest of each
page is deferred but its route reserved. Personas: Collection Officer, RM, Senior Manager work in the portal;
Legal and Insurance work in native CRM (ADR-DCP-03) — **no portal UI for them in Phase 1** (FR-091/102).

| Prototype page | P1 screens built | Deferred (P2/P3) | Key P1 FRs |
|---|---|---|---|
| 01 Workspace | My Day, Work Queues (3: Early Collection, High Risk, Deceased & Insurance), Case list + ingest-failure alert | Federated cross-org list | FR-027, 037, 040, 041, 048 |
| 02 Case & Customer 360 | Case detail + status transition, HL Customer & Loan 360 (live "as of" balance), native Timeline, manual case create, snapshot value | Cross-org merged 360 (P3), snapshot history grid (P2) | FR-001, 002, 004, 012, 019, 020, 022, 045, 046, 055 |
| 03 Segmentation & Strategy | (read-only) strategy view driving queue assignment | Rule editor + simulation (admin, P2) | FR-031, 038 |
| 04 Engagement | PTP capture + monitor, Communication console (SMS/Email/Call), template pick | Bulk campaigns (P2), template editor (P2) | FR-055, 056, 057, 064, 065, 066, 067, 069, 070, 073 |
| 05 Workout & Exit | Legal referral **submit** form + read-only status echo, deceased flag (sets stopContact) | Restructuring, disputes, insurance UI (P2) | FR-091, 095, 096, 097, 102 |
| 06 Oversight | Operational Dashboard, PTP Dashboard, evidence-pack export, supervisor view | Portfolio/Management/Legal dashboards (P2), approvals (P2) | FR-041, 111, 127, 129 |
| 07 Administration | Integration health panel (read) | Rules/queues/RBAC/router admin screens (P2 — edited on CRM native forms) | FR-126 |

Forms are plain **react-hook-form + zod** (ADR-DCP-03 decision 4; no descriptor layer at n=4, YAGNI). Officers
deep-link back into native CRM records where the lifecycle lives (legal/insurance). No customer PII is
server-rendered (NFR-006): 360, arrears, contact data are fetched in client components via the router.

---

## 10. Cross-Cutting Concerns

| Concern | Design | Article / FR |
|---|---|---|
| Logging | **pino** structured logs in the router; every entry carries `correlationId`, `timestamp`, `service_name`, `operation`. CRM plugins use `ITracingService`. No `console.log` in committed code | XIV; common.md |
| Correlation ids | Minted at the portal edge, propagated React → router → CRM header → `msst_dcpauditlog.sourcePath` | XIV; FR-109 |
| Config | All thresholds/rules/templates from `msst_dcpstrategyconfig` and CRM config forms at runtime; **no hard-coded GUIDs, rates, or rules** — resolve identifiers by code/name/alternate key | V; NFR-018; FR-035; ARC-M-001 |
| Secrets | `.env` only, never in code/logs/transcripts; the previously-committed Azure secret (SEC-01) is a rotation gate. Reference variable names only (ANTI-005) | VII |
| i18n | next-intl in the portal, `@dcp/i18n` bundles, AR/EN + RTL for Arabic mode; communications AR/EN mandatory (NFR-013). Templates resolve language with fallback | XX; NFR-013; FR-070 |
| Observability | `GET /health` per service; integration health panel (FR-126/NFR-019); metrics (request count, error rate, p95) defined before deploy; alert thresholds tested pre-go-live | XIV |
| Audit | append-only, plugin-written only, 7-year retention (NFR-010); portal/router never write audit (FR-108) | VI; R-03 |

---

## 11. ADR Register

All six are **Accepted** at this Phase-3 gate. ADR-DCP-01/02/03 are promoted from the "Proposed" drafts in
`facts-and-analysis.md`; ADR-DCP-04/05/06 are new and required by this design. Full text and `index.md` in
`projects/debtcollection/adrs/`.

| ADR | Title | Status | Date | Decided by | Full text |
|-----|-------|--------|------|------------|-----------|
| ADR-DCP-01 | Collection interactions as custom activity entities (`msst_dcpcollectionaction` + `msst_dcpcommunication`, polymorphic regarding, immutability after Completed) | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-01-collection-actions-as-activities.md` (draft: facts §9) |
| ADR-DCP-02 | Standalone Next.js portal + separate Fastify router, one monorepo forked from portal-shell; no SSR of PII; router is a shared service | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-02-nextjs-portal-and-fastify-router.md` (draft: facts §10) |
| ADR-DCP-03 | Portal owns submission; Legal/Insurance lifecycles in native CRM; react-hook-form + zod, no descriptor layer at n=4 | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-03-portal-forms-crm-lifecycle.md` (draft: facts §11) |
| ADR-DCP-04 | Platform portability + pluggable auth adapter (`IAuthAdapter` over openid-client: AD FS now, Azure AD later); both-platform feature set; containerised router | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-04-platform-portability-auth-adapter.md` |
| ADR-DCP-05 | MIS ingest + thin immutable snapshot (change + month-end), live-alongside with "as of", fail-loud outage surfacing | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-05-mis-ingest-snapshot.md` |
| ADR-DCP-06 | PTP Kept/Broken evaluated against the latest MIS snapshot; manual Kept mark is the correction path; one-cycle grace before escalation | Accepted | 2026-09-14 | architect, ceo | `adrs/ADR-06-ptp-kept-broken-evaluation.md` |

The stack itself matches the CLAUDE.md defaults, so **no ADR is required for the stack** (Article II) — the
deviations recorded are hosting/placement (02), portability (04), and the two data-behaviour decisions (05, 06).

---

## 12. Test Strategy Hooks for QA (Phase 5)

Two harnesses, because the runtime is split (Article IV; PAT-002 — live-org evidence is necessary, test-green
never sufficient for CRM work).

| Layer | Tooling | What it proves |
|---|---|---|
| Unit (router) | **Vitest**, ≥80% coverage | Result/error model, org routing, masking, gate logic, PTP kept/broken math, snapshot change-detection |
| Unit (CRM plugins) | **Moq** mocking `IOrganizationService` + `CrmPluginTestBase<T>` (no FakeXrmEasy — licence, dependencies §8) | Transition matrix, immutability incl. sysadmin, audit-row composition, subject composition |
| Integration | **Supertest** against the running router with a real PostgreSQL (pg-boss) | Every endpoint: happy path + validation failure + auth failure (common.md); ingest job; consent fail-closed |
| Parity | dedicated test | Live-balance path vs snapshot path return the same figure for the same facility (ARC-M-002) |
| E2E | **Playwright** | SC-01..SC-06 flows through the portal |
| Live-org round trip | manual + scripted | Write a record, read it back through the runtime path, paste output (PAT-002; verification protocol). CRM plugin caches the old AppDomain on first call after deploy — re-run once (GOT-007/ANTI-004) |

QA must map each SC-01..SC-06 to a named E2E test and each P1 control (R-03/R-04/consent) to a failing-first
test. Cross-artifact rule (Article XIX): no P1 FR ships without at least one test hook.

---

## 13. Build Order — the Ten-Step Critical Path

From the re-cut §3; each step is usable on its own and carries a proving test. This is the Phase-4 sequence.

| # | Step | Delivers | Proving test |
|---|---|---|---|
| 1 | **Foundation** | QID key, generic audit plugin, roles, masking (FR-007, 028, 108–110, 112–114, 118) | Plugin test: audit row written + immutable to sysadmin; masking hides PII for a role without the privilege |
| 2 | **Ingest** | MIS API → upsert → snapshot → alert + health panel (FR-016–018, 027, 121, 126) | Integration: a run appends snapshots, a forced failure raises the alert (NFR-014) |
| 3 | **Case** | Manual case, statuscodes, transition plugin, no-delete (FR-019, 020, 022, 023, 025) | Plugin test: invalid transition rejected; Delete blocked |
| 4 | **Router + stop-contact + consent** | The R-04 control, testable before any channel (FR-119, 120, 067, 068, 095–097, 043, 133–136) | Supertest: send to `stopContact`/no-consent customer → blocked + logged (**SC-03**) |
| 5 | **Workspace** | Customer 360, timeline, action logging (FR-001, 002, 004, 012, 045–048, 052, 053) | E2E: open facility, log action, capture PTP from one screen (**SC-01**) |
| 6 | **PTP** | create, monitor, break, escalate (FR-055, 057–059, 061, 064) | Job test: overdue PTP with no arrears drop → Broken + escalation (**SC-02**, reminder needs step 7) |
| 7 | **Communication** | gateway, templates AR/EN, reminder (FR-122, 065, 066, 069, 070, 073, 075, 076, 056) | E2E: PTP reminder sent through the gate |
| 8 | **Strategy + queues** | config table drives queue assignment + SLA (FR-031–038, 040) | Integration: bucket rule assigns queue; "no automated contact" suppresses send |
| 9 | **Supervision + evidence** | supervisor view, evidence pack, two dashboards (FR-041, 111, 127, 129) | E2E: export a case evidence pack (**SC-04**); dashboard shows SLA/broken PTPs (**SC-05**) |
| 10 | **BFD flag** | NFR-012 on top of FR-119 | Flip `FEATURE_BFD` against an empty BFD target, no code change (**SC-06**) |

---

## 14. Architectural Risks and Open Items Handed to Build

| # | Risk / item | Rank | Mitigation / owner |
|---|---|---|---|
| AR-01 | On-prem auth (AD FS S2S) and cloud MSAL diverge; the adapter is unproven on real AD FS 2019 | High | ADR-DCP-04 adapter; **prove `AdfsAdapter` against a real AD FS endpoint in step 1** before building on it |
| AR-02 | Batch MIS latency causes a false Broken/escalation (§7) | High | ADR-DCP-06: latest-snapshot evaluation + one-cycle grace + manual Kept correction; QA must test the near-date payment case |
| AR-03 | Silent MIS outage leaves stale figures (NFR-014) | High | Fail-loud: batch-status record, workspace alert (FR-027), health panel (FR-126), `mis_unavailable` staleness banner |
| AR-04 | Immutability defeated by a sysadmin | High | `ImmutabilityGuard` blocks sysadmin, not just role Delete (FR-025/047/075/110); plugin test asserts the sysadmin path |
| AR-05 | Consent record absent ⇒ accidental send | High | Fail-closed default (FR-134); gate before channel adapter and before the create (§5.4) |
| AR-06 | Schema/role drift between HL and BFD (R-05) | Medium | One managed solution, identical logical names (ADR-DCP-01 §7); deployment drift report (P3 for the compare, P1 for single-matrix authoring) |
| AR-07 | Cross-org 360 built but never exercised until BFD; the merge path could rot | Medium | Keep `resolveOrg`/identity-map unit-tested with a mocked BFD; parity test on merge; BFD flag flip in step 10 |
| AR-08 | Portal is a new user-facing app needing AAD registration, hosting, bank security review — the slowest path to prod | Medium | Named delivery prerequisite (BRD assumption 10); start the security-review request early, parallel to build |
| AR-09 | Polymorphic `regardingobjectid` complicates the frontend and `$expand` | Low | Documented read pattern (appendix §A; GOT-009); encapsulate in the router, not the portal |
| AR-10 | Puppeteer/Chromium (~170 MB) inflates the container | Low | Size into the router image (dependencies §6); one HTML template serves both preview and PDF |

**Open questions carried into build** (from BRD §7, unresolved by architecture): **Q-11** official-letter
dispatch sub-states (affects `msst_dcpcommunication` state model); **Q-12** WhatsApp separate vs shared SMS consent
(FR-136 stays fail-closed, no build); **Q-13** multi-recipient contact (PartyList limitation — deferred P2).
**SEC-01** the previously-committed Azure secret must be rotated before any cloud credential is used.

### 14.1 Cross-artifact consistency (Article XIX) — architect's semantic pass

Run before this document reaches the CEO gate. `.claude/scripts/gate-analyze.sh debtcollection` currently
reports **SKIP — "no BRD found"** (the gate expects a `brd.md`/`*-brd.md` filename; the BRD is `phase-2-ba.md`).
That is a **gate-tooling filename mismatch, not a coverage failure** — handed to DevOps to teach the gate the
`phase-2-ba.md` convention; it does not block the semantic pass below.

- **Coverage:** every P1 FR maps to a component here or in appendix §E (FR → component map); no P1 FR is
  orphaned. No architecture element exists without a requirement (no scope creep found).
- **Terminology:** one name per concept across BRD/arch — "CRM Context Router", "delinquency snapshot",
  "stop-contact", "consent gate", the ten-bucket taxonomy. No drift found. (QA plan does not yet exist; the
  BRD↔arch pair is consistent, and §12 seeds the QA plan so the third leg agrees on vocabulary.)
- **Constitution MUSTs:** no conflict found — audit plugin-written (VI), no hard-coded GUIDs/rules (V), PII
  masked + PDPPL gate (VII), append-only audit (VI), 4.7.1 plugins (X), single managed solution declared
  individually (XI/NFR-017). **No CRITICAL finding** → the gate is not blocked.

---

## Skeptic Review

Switching roles. No new artifacts — only challenges to the design above.

> CHALLENGE 1 — Auth adapter: We assume AD FS 2019 exposes clean OIDC discovery and that `openid-client` speaks
> to it as uniformly as to Entra ID. If AD FS is configured WS-Fed only, or S2S needs a certificate flow the
> adapter does not model, step 1 stalls and everything downstream waits. Have we actually hit the real AD FS
> metadata endpoint, or is portability a slide?

> CHALLENGE 2 — MIS ingest at 3am: The whole platform's data freshness rests on one nightly pg-boss job hitting
> one external API. When MIS returns 200 with a truncated or malformed batch (not a clean failure), do we detect
> it, or do we cheerfully upsert garbage and append "authoritative" snapshots from it? "Fail loud" only covers
> the failures we can see. What is the row-count / schema sanity check on the batch itself?

> CHALLENGE 3 — PTP false-Broken: The one-cycle grace is a guess. If a customer pays on the promised day and MIS
> runs 26 hours later on a bucket that already rolled, the arrears-drop signal is noisy. We are escalating real
> customers to a supervisor and possibly to legal on a batch artifact. At 4,900 accounts a 2% false rate is ~100
> wrong escalations a cycle. Is manual correction really enough, or does the officer drown in reversals?

> CHALLENGE 4 — Stop-contact gate as the only wall: Every send is supposed to pass one Fastify pre-handler. What
> about the PTP reminder job, bulk paths later, and the plugin-triggered sends? If any future caller reaches a
> channel adapter without going through `/communications`, R-04 is silently defeated. Is the gate enforced by
> the type system (no adapter export outside the gated module), or by everyone remembering to call it?

> CHALLENGE 5 — Two-person team, ten steps, six ADRs, a new portal needing a bank security review: Is this
> genuinely a Phase-1 minimum, or have we designed the elegant version? The single riskiest simplification we did
> NOT take: could Phase 1 have shipped as a CRM web resource (no new app, no AAD registration, no security
> review) and deferred the standalone portal? ADR-DCP-02 says no because of the router — but the router exists
> either way. We should be able to defend that the portal, not just the router, earns its Phase-1 cost.

> CHALLENGE 6 — Immutability we do not control: `msst_dcpcommunication` and `msst_dcpcollectionaction` "feel immutable and
> are not" (ADR-DCP-01) — activities are deletable, and our guard is a plugin. A plugin can be disabled by an
> admin in the same breath that deletes the row. For a regulator, is a plugin-enforced audit trail actually
> tamper-evident, or only tamper-inconvenient? Do we need a periodic external attestation of the audit table?

> CHALLENGE 7 — Config on native CRM forms: We deferred the admin screen (T3) and put strategy rules, SLA
> thresholds and templates on native CRM forms. Those forms have no simulation, weak validation, and a different
> audit path than the portal. When a bad "no automated contact" rule silences the wrong bucket, who notices, and
> how fast? We saved build time by moving the highest-leverage config to the least-guarded surface.

These challenges must be addressed before Phase 4 begins.

---

## CEO Architecture Gate

**Decision: APPROVED WITH CONDITIONS.** Architect: proceed to Phase 4 on the ten-step build order. COND-DCP-008..015 gate the named milestones, not the branch (PAT-005). The design is coherent, every one of the 73 P1 FRs maps to a component (appendix §E), and no scope creep was found.

**Verified against the mandate:**
- (a) §2 states residency, tenant type and PDPPL explicitly and consistently with on-prem-now / Dataverse-cloud-in-~18-months (Q1 2028): both CRMs on-prem D365 CE 9.x now → Qatar North boundary later (West Europe rejected); PDPPL a go-live gate, no prod PII before sign-off. Matches ADR-04.
- (b) ADR-04 makes migration survivable: pluggable `IAuthAdapter` (AdfsAdapter now / AzureAdAdapter later over openid-client), both-platform features only (no Custom APIs / elastic tables / Power Automate hard-dep; 4.7.1 plugins), containerised router, solution imports to Dataverse unchanged.
- (c) Stop-contact + consent is a Fastify pre-handler before any channel adapter and before the comm create (§5.4, fail-closed); audit is plugin-written, append-only, sysadmin-immutable (§4.4 ImmutabilityGuard).
- (d) ADR-06 answers the batch-latency false-Broken risk: evaluate against the latest snapshot, one-cycle grace before escalation, manual Kept as the audited correction path.
- (e) Ten-step build order proves SC-01(step 5), SC-02(6), SC-03(4), SC-04/05(9), SC-06(10) from P1 only.
- (f) ~55 real build items sized for two via portal-shell reuse (dataverse-client + auth shape) and adopted libraries; feasible but tight — COND-DCP-008/015 protect the two riskiest paths.
- (g) The Skeptic Review is honest and surfaces real gaps; none require a redesign — each is an addition or a milestone gate, captured below.

**Conditions (each owner-assigned; gates a milestone, none blocks the branch):**

| # | Condition | Owner | Gates |
|---|---|---|---|
| COND-DCP-008 | Prove AdfsAdapter against a real AD FS 2019 endpoint before anything depends on it; if WS-Fed-only / cert-S2S, stop and escalate to CEO (CH1/AR-01) | DevOps + backend | Step 1 Foundation |
| COND-DCP-009 | Add MIS batch-integrity validation (row-count range, schema/field sanity); a 200 with a truncated or malformed batch must not upsert or append snapshots (CH2) | architect + backend | Step 2 Ingest |
| COND-DCP-010 | Enforce the stop-contact/consent gate structurally — no channel adapter reachable outside the gated module; QA proves no send path bypasses it (CH4/R-04) | architect + QA | Step 4 Router |
| COND-DCP-011 | Tamper-evidence beyond the plugin: periodic external attestation / integrity check of the audit and snapshot tables so disable-then-delete is detectable (CH6/SO-02) | security-engineer + auditor | Go-live |
| COND-DCP-012 | Guard the highest-leverage native-form config: validation on "no automated contact" + SLA rules and a change-review alert on strategy edits (CH7; ties COND-DCP-004) | Compliance + backend | Step 8 Strategy |
| COND-DCP-013 | QA test the near-promised-date payment case; instrument the false-Broken rate; revisit the one-cycle grace if it exceeds the agreed threshold before scaling (CH3/AR-02) | QA + Product Owner | Step 6 PTP + early ops |
| COND-DCP-014 | Fix `gate-analyze.sh` to accept the `phase-2-ba.md` filename so the semantic gate runs (tooling defect — not a pass/fail on this architecture) | DevOps | Next gate run |
| COND-DCP-015 | Start the portal security review / AAD registration / hosting request early, parallel to build, not at the end (CH5/AR-08) | DevOps + Client | Go-live |

**Not blockers:** Q-11 (Official Letter is P2), Q-12 (WhatsApp fail-closed, no build), Q-13 (multi-recipient P2). SEC-01 (Azure secret rotation) bites only at migration since Phase 1 is on-prem — rotate before any cloud credential is used.

| Sign-off | Authority | Date |
|---|---|---|
| Phase-3 Architecture gate — APPROVED WITH CONDITIONS | CEO — MSS Technologies | 2026-09-14 |
