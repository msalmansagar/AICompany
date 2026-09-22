# DCP — React Collection Workspace Architecture

**Status:** **Part I — as built in Phase 5** (2026-09-18) · **Part II — the Phase 0 proposal**
(2026-09-17), kept because it records why each decision was taken. Where the two differ, Part I is
what exists, and §0.9 lists every deviation with its reason.

Implements Master Prompt §10–12, §63–65, §67 and Correction Prompt §5, §13–19, §30, §33. Canonical
names come from `EntityDictionary.md` / `FieldDictionary.md`; MIS behaviour from `MISIntegration.md`.

> The Phase 0 text below said "nothing in this document exists yet". That is no longer true, and
> Part I replaces it rather than leaving a reader to work out which half is real.

---

# Part I — As built

## 0.1 What exists

`apps/web` is a Vite + React + TypeScript workspace in the monorepo, built by `turbo` alongside
`apps/api` and the four packages. It produces **one self-contained file** — no external script, no
external stylesheet, no absolute asset path — deployed as the web resource
`qdb_dcp_workspace.html` on `org5869857f` and published.

| | |
|---|---|
| Source | `apps/web/src` — 27 modules, 4,682 lines, plus 1,763 lines of tests |
| Artefact | `apps/web/dist/index.html`, **344 KB** (96 KB gzipped), against a 5 MB on-premises limit |
| Web resource | `qdb_dcp_workspace.html`, id `0bd4fee5-97b3-f111-aaac-000d3abd8313` |
| Opened at | `main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html` |
| Tests | 191 in `@dcp/web`; 45 live checks in `smoke-qdb-phase5.mts`; 16 in the platform spike |

## 0.2 The layers, and what each is forbidden to do

```
 App                       resolves the CRM session once, refuses clearly if there is not one
  └ AppShell               UCI chrome, nav rail from ONE route table, role switcher, org scope
     └ views/*             layout and wording only — no threshold, no derivation, no decision
        └ DataGrid         the single large-data engine: paging, virtualization, states
           └ usePagedQuery request-state machine, stale suppression, duplicate protection
        └ data/*Queries    shaping and narrowing; every $filter composed here and sent to the source
           └ data/schema   EVERY qdb_ name the browser knows, in one registry
              └ XrmCrmAdapter   transport only, over Xrm.WebApi
```

Two prohibitions hold the whole design together, and both are tested rather than asserted:

* **No business rule lives in React.** No file under `apps/web/src` compares a DPD against a
  threshold, derives a bucket from a DPD, decides eligibility or resolves a strategy.
  `noBusinessLogic.test.ts` runs five patterns over every source file — a DPD compared against a
  threshold, a money figure compared against one, a bucket derived from a DPD, an `isEligible`-shaped
  outcome, an SLA threshold — and **each pattern is itself proved to catch the thing it forbids**, so
  the check cannot quietly become five ways of matching nothing. `platform.test.ts` additionally
  asserts that the adapter's own method names contain no decision verb.
* **Nothing is fetched and then reduced.** There is no prop that loads everything, no client-side
  filter and no client-side sort. A narrowing that is not in the query does not happen.

## 0.3 Startup, as implemented

`findXrm` checks `parent`, then `window`, then `top`. The order is not cosmetic: a full-page web
resource runs in an iframe whose **parent** carries `Xrm`, and the opposite order is exactly the trap
that produced a blank Form Engine designer — a page that works at the raw `/WebResources/` path and
fails at `main.aspx`, which is the only URL a user ever opens.

`readCrmContext` then reads `getClientUrl()`, `getVersion()` (`9.1.x` → `9.1`, `9.2.x` → `9.2`),
`userSettings` and `organizationSettings`. **No URL and no API version is a constant.** When there is
no `Xrm`, the workspace renders a panel naming the problem instead of an empty shell.

The platform configuration row (`qdb_platformconfiguration`) remains the authority on what differs
between deployments — customer table, ruleset codes, snapshot policy — and the Configuration view
displays it. The workspace deliberately does **not** infer on-premises versus cloud from the API
version: an inference in the UI could disagree with the row every adapter reads, and be believed.

## 0.4 The large-data engine

One component, used by every list that can grow with the book.

| Property | How it is achieved | Measured |
|---|---|---|
| Server-side paging | `Xrm.WebApi` `maxPageSize` + the returned `nextLink`, wrapped in the Phase 4 opaque `ContinuationToken` | 100,000-row population: **50 rows fetched** |
| Virtualization | spacer-based windowing; rendered rows bounded by `ceil(height/rowHeight) + 2×overscan` | **16 DOM rows**, independent of population *and* page size |
| Infinite scroll | scroll-position end trigger, `inFlight` guard | 30 rapid scroll events ⇒ **at most one** extra request |
| Stale suppression | monotonic sequence number; a late response for an old query is discarded | tested |
| Duplicate protection | append by stable row identity, never by array index | **0 duplicates** at every population |
| Criteria change | query fingerprint drives reset: cancel, discard the continuation, re-request page one | tested; the continuation is refused server-side too |

A page size is never optional. The Phase 4 spike established that a Dataverse read without a bound
returns the entire table, and the browser adapter therefore always sends one.

## 0.5 One workspace, two CRMs

`OrgContext` carries `all` (the default), `HL` or `BFD`, and turns that into a `$filter` fragment the
**source** applies. Every case, promise and audit row shows an `OrgBadge` naming its system of record.

Which table holds a customer is read from the case's own polymorphic lookup annotation —
`_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname` — so contact-for-HL and
account-for-BFD is observed, never hard-coded. An unknown third table is refused with a named error
rather than read as though it were a contact.

## 0.6 Honesty rules the views implement

These are design decisions, not gaps:

| Rule | Implementation |
|---|---|
| A KPI is a platform count or an em dash | `useCounts` issues `$count` with `pageSize` 1; a figure that cannot be counted shows `—` plus the phase that will supply it. Dataverse's 5,000 cap is reported as `5,000+`, never as an exact total |
| A cached or stored figure is never shown as live MIS | `StoredPositionNotice` labels case and snapshot figures "Stored MIS position — not a live MIS read", with as-of and recorded-at |
| A later-phase screen keeps its place and says so | `PendingView` / `PendingPhasePanel` carry `data-owning-phase`; no data is rendered, because none would be real |
| An unsourced column is preserved, not dropped | Customer 360 keeps Collateral, Guarantor and Insurance and marks them *not yet sourced* — no canonical field exists, and adding one would be a schema change (Phase 9) |
| Authoring that belongs elsewhere is visible and disabled | the strategy rule builder and the four configuration commands render disabled with their owning phase |
| Role gating is presentation only | `viewsForRole` hides nav entries; every read still runs as the signed-in user, and CRM's security is what permits or refuses it |

## 0.7 The column registry, and why it exists

`apps/web/src/data/schema.ts` holds every `qdb_` entity set, column and proven choice table the
browser knows. Queries import from it; views never see a `qdb_` name.

It exists because KI-52 was a column that *looked* right, passed every unit test and returned nothing
from the real platform. `crm/scripts/verify-view-columns.mts` reads the same constant the queries use
and asks the organisation whether each attribute exists — **173 names, 11/11** — and
`smoke-qdb-phase5.mts` goes further, running the query modules themselves against seeded rows to
prove the values arrive in the shape the screens render.

Choice labels appear in the registry **only** where the option values are already proven by the
service layer and its live smokes. Elsewhere the renderer uses the platform's own formatted value and
falls back to an em dash. No option value is guessed, because a wrong label is a confident lie rather
than a visible gap.

## 0.8 Deployment

`crm/scripts/deploy-workspace-webresource.mjs` uploads the single artefact, publishes only that
component, reads it back and compares it byte for byte. It states plainly what it does **not** prove:
that the workspace loads inside Dynamics, that `getGlobalContext` answers, or that it can read as the
signed-in user. Those need an authenticated browser session.

## 0.9 Deviations from the Phase 0 proposal

| Proposed | Built | Why |
|---|---|---|
| `apps/workspace` | `apps/web` | Matches `apps/api`; no other significance |
| Fluent UI v9 components | the prototype's own CSS and 63 ported icons | Phase 5 was a conversion, not a redesign. The approved baseline is a hand-built UCI-styled design system; replacing it with Fluent would have changed the approved appearance |
| A `packages/sdk` Collection SDK with repositories | `apps/web/src/data/*Queries.ts` over the existing `ICrmAdapter` | The repositories exist already, in `apps/api`. A second set in the browser would be the duplication the architecture forbids |
| `IFormEngine` / `IProcessEngine` / `IRuleEngine` / `IAssignmentEngine` facades in the browser | not built | Those engines are reached through server-side operations, and `XrmCrmAdapter.execute` refuses by design — `Xrm.WebApi.execute` needs per-parameter metadata this seam does not carry. Keeping the decision server-side is the point |
| Platform profile loaded at startup and cached per session | the Configuration view reads it; adapters do not branch on it yet | Nothing in Phase 5 needs to branch: the customer table comes from the lookup annotation on each case, which is stronger than a cached profile because it is observed per record |
| Playwright E2E | not run | It needs an authenticated interactive CRM session, which is the boundary this phase stops at. Not claimed as passed |

---

# Part II — The Phase 0 proposal

*Retained as written on 2026-09-17. Read it for the reasoning; read Part I for what exists.*

---

## 1. Delivery shape — one bundle, one web resource, two platforms, two organisations

| Decision | Value |
|---|---|
| Codebase | **One** React + TypeScript source tree: `apps/workspace` (proposed) |
| Artefact | **One** single-file web resource `qdb_dcp_workspace.html` (JS + CSS inlined, assets as data URIs) — the same pattern Form Engine (`qdb_form_runtime.html`, 1.9 MB) and Report Engine already ship |
| Hosting | Full-page CRM web resource opened from the **sitemap** (`main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html`) and from a **direct authorised URL** of the same shape. Never a form-embedded iframe; never the raw `/WebResources/` path (no `Xrm` there) |
| Deployments | HL on-prem · BFD on-prem · HL cloud · BFD cloud — **same file**. What differs is the row in `qdb_platformconfiguration` and the deployment package |
| Forbidden | a second React app per org or per platform; `output: 'export'` of a server framework; content-hashed multi-file `_next/`-style output (every web resource must be declared individually — NFR-017) |

Supersedes ADR-DCP-02 (standalone Next.js portal) — see ADR-DCP-07.

---

## 2. Startup sequence (Correction Prompt §13, Master Prompt "Platform Detection")

```
 CRM navigation / direct URL
        │
        ▼
 1. Bootstrap ── window.parent.Xrm ?? window.Xrm   (page must be opened via main.aspx so Xrm exists)
        │
        ▼
 2. Runtime Context Resolver
        GlobalContext.getClientUrl()      → org URL          (never hard-coded)
        GlobalContext.getVersion()        → "9.1.x" | "9.2.x" → Web API path segment
        GlobalContext.userSettings        → user id, roles, language (LCID 1025 / 1033)
        GlobalContext.getCurrentAppUrl()  → app context
        isOnPremises = GlobalContext.isOnPremises()  → PlatformType hint only; the row below is authoritative
        │
        ▼
 3. Platform Configuration Loader
        Xrm.WebApi.retrieveMultipleRecords('qdb_platformconfiguration', active row for this org)
        + child qdb_platformmapping rows → in-memory PlatformProfile (cached per session)
        │
        ▼
 4. Adapter initialisation (from PlatformProfile — no if(cloud)/if(onPrem) below this line)
        ICrmAdapter        ← Xrm.WebApi (same on both platforms; version comes from step 2)
        ICustomerAdapter   ← mapping: contact | account
        IFacilityAdapter   ← mapping: resolution source + business-id field; exposes the canonical
                             facilityNumber + sourceSystem, and an OPTIONAL facilityRef only where a
                             per-deployment facility lookup extension exists (never branched on)
        ICommunicationAdapter ← mapping: fax | email entities
        IMisDelinquencyService ← Integration Service base URL + browser auth adapter
        IFormEngine / IProcessEngine / IRuleEngine / IAssignmentEngine / IReportingService facades
        │
        ▼
 5. Same Collection application starts (role-aware shell, My Work as default landing)
```

Failure modes: missing `Xrm` → "open from CRM" panel; no active configuration row → blocking
"platform not configured" panel; mapping incomplete → the affected module is hidden and an admin
banner is shown. All three are surfaced, never silently degraded.

---

## 3. Layering (Master Prompt §7, §12)

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  UI components (Fluent UI v9)   — presentation only, no platform code │
 ├──────────────────────────────────────────────────────────────────────┤
 │  Collection Services            — use cases: CaseService, ActivityService, PtpService,          │
 │                                   StrategyService, CommunicationService, TimelineService,       │
 │                                   DashboardService, Customer360Service, WorkQueueService        │
 ├──────────────────────────────────────────────────────────────────────┤
 │  Collection SDK (packages/sdk)  — canonical models + repositories:                              │
 │                                   Customer, Facility, CollectionCase, CollectionActivity,       │
 │                                   Communication, ArrearDetail/Breakdown, PlatformProfile        │
 ├──────────────────────────────────────────────────────────────────────┤
 │  Adapters                       — ICrmAdapter · ICustomerAdapter · IFacilityAdapter ·           │
 │                                   ICommunicationAdapter · IMisDelinquencyService ·              │
 │                                   IAuthContext · engine facades                                 │
 ├──────────────────────────────────────────────────────────────────────┤
 │  Platform                       — Xrm.WebApi · GlobalContext · Integration Service HTTP client  │
 └──────────────────────────────────────────────────────────────────────┘
```

Rules: a component never imports an adapter; a service never reads `Xrm` directly; the SDK never knows
whether the customer is a contact or an account. `ICrmAdapter` exposes
`retrieve / retrieveMultiple / create / update / delete / associate / disassociate / execute /
getCurrentUser / getUserRoles / getMetadata` and is implemented **once** — `Xrm.WebApi` behaves the
same on both platforms; only the version segment differs, and it is a runtime value.

### 3.1 Canonical Customer and Facility (Correction Prompt §5, §8)

```ts
interface CollectionCustomer {
  customerId: string;          // CRM GUID of contact | account
  customerType: 'Individual' | 'SME' | 'Corporate';
  businessId: string;          // QID (HL) | CR number (BFD)
  displayName: string;
  mobile?: string; email?: string; address?: string;   // masked by role
  flags: { stopContact: boolean; deceased: boolean; vulnerability: boolean; specialHandling?: string };
  preferredLanguage?: 'ar' | 'en';
}
```

`ICustomerAdapter.getCustomer(id)` / `searchCustomers(term)` / `getCustomerFacilities(id)` resolve
entity and field names from `qdb_platformmapping`. There is no `ContactCustomer` / `AccountCustomer`
class pair; there is no `if (org === 'HL')` anywhere in `apps/workspace`. The same holds for
`IFacilityAdapter.getFacility(facilityNumber)`.

---

## 4. Module and navigation map (Master Prompt §63) — role-aware

| Area | Modules | Visible to (Layer 3 only — CRM privileges still decide) |
|---|---|---|
| Workspace | My Day · My Work · Work Queues · Collection Cases | all Collection roles |
| Customer | Customer 360 · Facility/Loan 360 · Case Detail · Delinquency History | all |
| Activities | Collection Activities · Follow-ups · Promise-to-Pay · Field Visits | Officer, RM, Senior Manager, Head |
| Engagement | Communication Center · **unified Communication History** (§5.1a — SMS/WhatsApp, Email and Warning Letters in one stream) | Officer, RM (send needs privilege), Senior Manager |
| Strategy | Collection Strategies · Strategy Actions · Assignment | Senior Manager, Head, Admin |
| Workout & Exit | Restructuring · Legal · Deceased & Insurance · Disputes/Complaints | Officer (raise) · specialist roles (act) |
| Oversight | Dashboards · Portfolio MIS · Approvals · Audit/History · SLA/Escalation | Senior Manager, Head, Management, Audit Compliance |
| Administration | Platform Configuration · Platform Mapping · Activity Types · Outcomes · Strategies · Assignment · Templates · Engine links | Admin User |

Navigation is computed from `getUserRoles()` + a role→module table held in configuration, not in code.
Hiding a module never hides data the user is entitled to elsewhere, and never grants anything.

---

## 5. Screen behaviours that carry architecture rules

### 5.1 Customer 360 (Master Prompt §64) — aggregation, not an entity
Composes: canonical customer (contact/account) · facilities (facility master) · **live MIS position
per facility** · cases · activities · PTPs · communications (fax/email) · legal/restructure/complaint
activities · documents. HL and BFD render the **same** component tree; only the adapters differ. The
cross-org panel ("other organisation") is fed by the Integration Service fan-out, never by a second
CRM session in the browser.

### 5.1a Communications tab — one stream over three mechanisms (KI-45 confirmed)

A **Communications** tab appears on the Collection Case view, in Customer 360 and on the
facility/account view. It shows one chronological list:

```
  ●  SMS            12 Sep 14:02   Reminder — instalment overdue      Delivered      automated
  ●  WhatsApp       12 Sep 14:02   Reminder — instalment overdue      Delivered      automated
  ●  Email          09 Sep 09:11   Repayment options                  Delivered      A. Officer
  ●  Warning Letter 01 Sep 00:00   First warning letter               Issued         automated
```

Each row carries a channel icon and label, the date/time, subject or title, delivery status where the
source reports it, and whether it was manual or automated. Selecting a row opens the detail, including
a preview where policy and privilege allow and a link to the underlying record.

Filters across the top: channel · date range · status · and, in Customer 360, facility and case.

Three rules this component must not break:

1. **It renders a DTO, not entities.** The component receives `CommunicationItem[]`
   (`APIContracts.md` §4.1) and knows nothing about `fax`, `email` or the letter store. If it starts
   branching on `source.entity` for anything but a deep link, the aggregation has leaked into the UI.
2. **Filtering and paging are server-side.** The tab never fetches a customer's whole history to
   filter it locally — that would pull rows the user may not be entitled to see (SecurityModel §5b).
3. **Absent is absent.** A missing delivery status renders as "unknown", never as "delivered". The
   officer is told what the source does not know.

Because the history is assembled per request, an officer may see fewer entries than a colleague with
wider rights. That is CRM security, and the empty state says so rather than implying nothing was sent.

### 5.2 Work queues (§65)
My Cases · My Activities · Due Today · Overdue · Broken PTP · Early Collection · High Risk · 90+ DPD ·
Legal Review · Restructuring · Deceased & Insurance · Complaints · Field Visits · Team Queue.
All lists use **server-side** `$filter` / `$orderby` / `$top` + paging cookies via `ICrmAdapter`;
never client-side filtering of a full pull; CRM security decides what returns. Queue names above are the
BRD's working set — **membership criteria (including any DPD threshold) come from configuration**, never
from a constant in React (§5.3.3).

### 5.3 Live MIS presentation (Correction Prompt §13–19, §30, §33)

| Rule | Implementation |
|---|---|
| Workspace / dashboard / bucket / case opens → latest MIS position | `IMisDelinquencyService` calls through the Integration Service; results held in TanStack Query with a short `staleTime` |
| Freshness badge on every financial figure | `Live · MIS as of {misAsOfDate}` — timestamp **from MIS**, never `Date.now()` |
| MIS failure | fall back to `qdb_collectioncase` cached position / last snapshot; badge `MIS unavailable — showing last synchronised position from {qdb_misasofdate}`; visual style differs from Live |
| Manual Refresh | re-query only; **no** snapshot, **no** CRM write |
| Viewing never writes | no `create`/`update` calls originate from a read path; enforced by a lint rule on the MIS module |
| Dashboard | two architecturally distinct KPI families, visibly separated and separately sourced — §5.3.2. No aggregate is computed in the browser from thousands of detail rows |
| Drill-down | bucket click → `GetArrearDetails(bucket, page)` server-paged |
| Critical-action revalidation | requested through the Rule Engine facade per activity type; the UI shows the fresh position before confirming |

### 5.3.1 Metric naming — a bare "Customers" is prohibited (F5 decision, 2026-09-17)

Because the delinquency unit is the facility/account and one customer may hold several, three different
counts are all legitimately "customers" and they do **not** reconcile. The dashboard model therefore carries
three named metrics, and never presents any of them under the unqualified label *Customers*:

| Metric | Definition | Source | Used for |
|---|---|---|---|
| **Distinct Customers** | unique customer business identities (contact/account) holding ≥ 1 delinquent facility | CRM / MIS detail, de-duplicated | portfolio headcount, officer workload |
| **Delinquent Facilities / Accounts** | delinquent facility or loan-account records — the unit a Collection Case is opened against | MIS detail | case volume, strategy sizing, queue depth |
| **Customer-Bucket Count** | a customer counted once **per DPD bucket** they appear in | MIS `GetArrearBreakdown` | **only** where a figure must reconcile with the existing MIS Breakdown report |

Every aggregate rendered in the workspace carries its definition explicitly — in the tile label, the column
header and the tooltip — so a reader can always tell which of the three they are seeing. A bucket table that
totals Customer-Bucket Count must state that the total exceeds Distinct Customers.

For the supplied Housing Loan extract these were **3,778 · 4,357 · 3,905** respectively. Those are **report
observations from one extract, not application constants**: neither the workspace, the SDK nor the tests may
embed them as expected values except inside a fixture that names the extract it came from.

### 5.3.2 Two architecturally distinct KPI families (F10 decision, 2026-09-17)

The dashboard presents both families side by side, but their **sources stay distinct in the UI and in the
code** — separate services, separate query keys, separate freshness semantics (MIS figures carry the
`Live · MIS as of …` / fallback badge of §5.3; CRM figures are as-of-now under the user's security).
Neither family is derived from the other in the browser.

| Family | Source | KPIs |
|---|---|---|
| **MIS financial / delinquency** | `IMisDelinquencyService` → Integration Service → MIS | roll rate by bucket · cure rate · 1–30 cure rate · collection yield by bucket · tail movement / growth · delinquent balance movement · arrears movement |
| **CRM operational Collection** | `ICrmAdapter` aggregate queries under the user's session | cases by status · by strategy · by owner/team · activities due / overdue · contact outcomes · PTP created / kept / broken / effectiveness · SLA–TAT · escalations · legal progression · restructuring progression · deceased & insurance progression · officer & team workload · strategy effectiveness · communication outcomes |

This is the **candidate set, not a fixed specification**: final KPI definitions, formulas and targets are
configurable and remain subject to business confirmation before Phase 10. A KPI whose definition is not yet
confirmed is rendered with its definition visible rather than silently omitted.

### 5.3.3 Portfolio segmentation is configured, never coded (F1 decision, 2026-09-17)

Views, filters, tiles and queue groupings that distinguish an "operational" from a "recovery" population are
driven by the **configured strategy segmentation** resolved through `IRuleEngine` / `qdb_collectionstrategy`.
The workspace contains **no hard-coded DPD boundary** — no `dpd > 2000`, no `bucket === '>2000'` branch — and
no built-in two-book assumption. Segment names, their criteria and their permitted treatment come from
configuration and may differ between HL and BFD. The data-supported operational/recovery split is a
**recommendation for QDB confirmation** (`HousingLoanDataAnalysis.md`), not an architectural constant.

### 5.3.4 No branching on physical facility entity names (gate correction 4, 2026-09-17)

The workspace consumes the **canonical Facility contract** — `facilityNumber`, `sourceSystem` and the
resolved Facility domain information — and nothing else. There is **no** `if (entity === 'qdb_account')`,
no HL/BFD facility-entity switch, and no component that requires a CRM facility GUID to render.

`IFacilityAdapter` may return an optional `facilityRef` where a deployment has installed a physical
facility lookup extension; React uses it **only** to offer native record navigation, and every screen
must render correctly when it is absent. Two differently-targeted `qdb_facilityid` relationships are two
different physical relationships, not one portable schema, so no UI behaviour may depend on one existing.

### 5.4 Communication Center (Master Prompt §33–34)
A composer inside the workspace (channel · recipient · language · template · subject · body · attachments
· preview · send) calling `CommunicationService.send(...)`. The UI never knows that SMS/WhatsApp become a
`fax` row; templates come from `qdb_communicationtemplate` (or the reused engine — `TBD — Requires QDB
Confirmation`); message text is never hard-coded in React. Validation results (contact hold, consent,
free-text privilege, approval) are displayed from the service response, **never re-implemented or
re-decided in the UI** — the server refuses regardless of what the composer shows.

### 5.5 Activity forms via Form Engine (Master Prompt §45)
Each `qdb_collectionactivitytype` carries a Form Engine form code. The workspace hosts the Form Engine
runtime for that code inside the activity panel; PTP core fields (date, amount, status) are bound to
physical columns, descriptive fields to the engine's payload. No hand-coded React form exists where a
form code is configured. Fallback when no code is configured: a minimal generic activity form.

### 5.6 Unified timeline (Master Prompt §40)
`TimelineService.getTimeline(caseId)` merges `qdb_collectionactivity`, `fax`, `email` (via
`regardingobjectid`), Process Engine events and bucket movements from snapshots into one sorted stream.
No duplicate activity rows are created to represent sends.

---

## 6. Cross-cutting

| Concern | Approach |
|---|---|
| State / data | TanStack Query for server state (keys per entity + org), minimal local UI state; no global store of CRM data |
| UI kit | Fluent UI v9 (house stack, Report Engine design language); theme tokens from the prototype (`tokens.css`, 4 themes) |
| i18n | EN/AR resources, RTL layout switch from `userSettings.languageId`; templates and activity types carry EN/AR names |
| Dev feedback | `agentation` as devDependency, mounted only behind `import.meta.env.DEV`; never in the bundle (CLAUDE.md) |
| Errors | one error boundary at the shell; typed `DomainError` from services; correlation id shown for support |
| PII | masked client-side **only after** CRM field security has already withheld the value; masking is presentation, never authorisation |
| Feature flags | from `qdb_platformconfiguration.qdb_featureflags`; read once at startup |

---

## 7. Performance rules (Master Prompt §67)

Server-side paging and filtering everywhere · lazy-loaded modules (route-level code splitting inside the
single file) · timeline fetched in pages · dashboard aggregates from MIS/CRM aggregate queries · platform
profile cached per session · FetchXML for aggregates and joins where OData is awkward · `$batch` for
multi-record saves · never retrieve the whole portfolio into the browser.

---

## 8. Build and packaging

| Constraint | Handling |
|---|---|
| Single file | Vite + `vite-plugin-singlefile` (as Form Engine); output `qdb_dcp_workspace.html` |
| Size | on-prem web-resource default limit 5 MB; target < 3 MB; report size in CI |
| Declaration | the web resource (and any icon resources) declared **individually** in `solution.xml` RootComponents (NFR-017) |
| Cache | CRM serves stale web resources after publish; a version query on the sitemap URL / inner `src` is the cache-buster (never on `main.aspx` itself) |
| Environment | zero build-time environment values; everything from runtime context + configuration |
| Solution version | `SolutionPackageVersion` acceptable to 9.0/9.1 for the on-prem package |

---

## 9. Testing

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | services, SDK mappers, adapters against a fake `Xrm.WebApi`, platform-profile resolution for HL-onprem / HL-cloud / BFD-onprem / BFD-cloud profiles |
| Contract | Vitest | `IMisDelinquencyService` mock vs API providers return identical canonical types |
| E2E | Playwright | against a dev org: sitemap open, direct URL open, role-aware navigation, Customer 360 (contact and account profiles), live/fallback badges, Refresh causes no snapshot, Communication Center send → fax/email row, unauthorised user |
| Portability | same E2E suite executed per target; results recorded separately (Cloud Runtime Tested · On-Prem Compatible by Design — Runtime Test Pending) |

---

## 10. What the existing prototype contributes

| Contributes | Does not contribute |
|---|---|
| Design language and tokens (`shared/tokens.css`, `components.css`, `uci.css`), 4 themes, model-driven shell look | any wiring — zero network calls, zero `Xrm`, zero auth |
| Screen inventory (22 screens / 7 pages) as the starting backlog for §63 modules | production components (plain JS/HTML, not React) |
| `shared/mock-data.js` as the **shape** of UI fixtures | data — invented customers, never to be loaded into an org |
| Demo hooks worth keeping: cross-org customer, router-refused send, RBAC drift finding | the "router refuses the send" mechanism (now the Communication Service + plugin guard) |

Prototype screens are **Mock** in the tracker, never "implemented".

---

## 11. Open items — `TBD — Requires QDB Confirmation`

Browser → Integration Service authentication on the on-prem estate (Windows-integrated vs AD FS bearer) ·
whether the EmailEditor engine supplies SMS/WhatsApp templates · Smart Assignment client contract ·
**HL Facility Entity = `TBD — Requires QDB Confirmation`** and **BFD Collection Facility/Account Target =
likely `qdb_account`, `TBD — Requires QDB Confirmation`** for `IFacilityAdapter` *resolution* (React never
branches on either name — it consumes the canonical `facilityNumber` + `sourceSystem`) ·
existing QDB contact/account `qdb_` fields that
already cover any Collection flag · **final KPI definitions, formulas and targets** (§5.3.2 — business
confirmation before Phase 10) · **segment names and criteria** for the configured operational/recovery
split (§5.3.3).
