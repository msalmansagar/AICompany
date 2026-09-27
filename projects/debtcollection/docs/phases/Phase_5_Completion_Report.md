# Phase 5 — React Collection Workspace: Completion Report

**Status:** **React Collection Workspace Built and Deployed — Runtime Validation Inside Dynamics Pending an Authenticated Session**

**Date:** 2026-09-19 (started 2026-09-18) · **Branch:** `feat/dcp-phase5-react-workspace`, from the approved Phase 4 baseline `1fc87bfb`
**Organisation:** `org5869857f` (Cloud sandbox, the only one authorised)
**Stopping at the interactive-authentication boundary. Phase 6 has not been started.**

| Target | Status |
|---|---|
| The workspace as code | **Built — 191 tests, type-check clean, build clean** |
| Its reads against Cloud Dataverse | **Runtime Tested** (query smoke 45/45, column verifier 11/11) |
| The artefact as a web resource | **Deployed and published** (10/10, byte for byte) |
| **The workspace running inside Dynamics** | **NOT TESTED — needs an authenticated interactive CRM session** (KI-56) |
| Dynamics 365 CE 9.1 on-premises | **Compatible by Design — Runtime Test Pending** (KI-22: no on-premises organisation exists for DCP) |

Every figure below was produced by a run in this session or read back from the organisation. Where
something is not proven, it says so.

---

## 1. Implementation summary

Phase 5 converted the approved `prototype/` baseline into a production React workspace, deployed as a
single full-page Dynamics web resource. **This was a conversion, not a redesign**: 143 design tokens,
`components.css`, `uci.css` and 63 icons were ported verbatim, and all 21 views keep their group,
order, label, icon, role gate and place.

Seven things were built:

1. **`apps/web`** — Vite + React + TypeScript in the monorepo, producing **one self-contained
   344 KB file** with no external script, no external stylesheet and no absolute asset path.
2. **`XrmCrmAdapter`** — the browser half of the *existing* `ICrmAdapter`, over `Xrm.WebApi`, proven
   against the real platform **before** the views were built.
3. **One large-data engine** — server-side paging on the Phase 4 contract, virtualization, infinite
   scroll, stale-response suppression and duplicate protection, used by every list.
4. **One route table** driving the nav rail, the router and role gating, so a view cannot exist in
   one and be missing from another.
5. **One column registry** — every `qdb_` name the browser knows, checked against live metadata.
6. **Thirteen functional views** and **eight preserved** with their owning phase stated.
7. **A live query smoke** that runs the views' own query modules against the organisation.

**The finding that shaped the phase** was Phase 3's KI-52: *an in-memory adapter can validate the
same incorrect assumption as the production code.* A frontend built on mocked tests alone would
reproduce that class of defect at twenty-one times the surface area. So the platform spike ran first,
and the query smoke runs the real modules against real rows — and between them they found three
defects that every unit test had passed over.

---

## 2. Effort estimate versus actual

| | |
|---|---|
| Start (Asia/Qatar) | 2026-09-18 21:02:36 (+03:00) |
| Position captured | 2026-09-19 00:20:14 (+03:00) |
| **Original estimate** | **32.50 h** — never modified, no revision issued |
| Wall-clock elapsed | **3.294 h** |
| Inactive / blocked | **0.028 h** (the baseline decision) |
| **Effective Claude execution** | **3.266 h** |
| **Consumed** | **10.0 %** |
| Packages complete | **18 of 19** |
| Remaining | Work package 16, Cloud runtime validation (1.50 h estimated) — blocked on authentication |

Full ledger, per-package actuals and twelve recorded development incidents:
`docs/evidence/Phase5_timing.md`.

The calibration note worth keeping: the phase's largest single risk — the large-data engine at
3.00 h — landed in **0.17 h**, because the Phase 4 paging contract was already the shape the frontend
needed. Estimating frontend work by the number of views is a poor predictor when every view shares
one engine; the honest predictor is how much of the contract already exists.

---

## 3. What was built, view by view

**21 of 21 approved views are present and navigable.** Thirteen are functional; eight are preserved
with their owning phase stated and **no data shown, because none would be real**.

| Functional now (13) | What it reads |
|---|---|
| My Day | Open cases, plus three counts the platform answers |
| Work Queues | Open cases across both organisations |
| Collection Cases | Cases narrowed by bucket, status, free text and organisation scope — the engine's proving ground |
| Customer & Loan 360 | One customer's cases, their CRM record, their facilities and their MIS snapshots |
| Case Detail | One case across seven tabs: Summary, Actions, PTP, Communications, Documents, Workout & Legal, Audit |
| Delinquency Intake | Snapshots and identity exceptions, with three counts |
| Segmentation Matrix | Collection strategy criteria, as configuration |
| Strategy Rules | Strategies and their actions; the rule builder preserved and **disabled** |
| Action Plan | Active strategy actions |
| Promise to Pay | PTP-typed activities, with four counts |
| Dashboards | Six bounded counts, scoped by organisation |
| Audit Trail | `qdb_crmlogs` — the largest table in the organisation, never loaded whole |
| Configuration | Platform configurations, field mappings, the resolved session; four commands **disabled** |

| Preserved (8) | Owning phase |
|---|---|
| Communication, Template Library | Phase 7 — nothing sends, and no send is simulated |
| Disputes, Restructuring, Legal Hand-off, Deceased & Claims | Phase 9 — no entity exists for any of them |
| Portfolio MIS | Phase 10 — blocked by KI-53, no MIS transport contract |
| Approvals | Phase 10 — no entity exists |

---

## 4. The rules the workspace keeps

These are decisions, not gaps, and each is enforced by something other than good intentions.

| Rule | How it is kept |
|---|---|
| **No business logic in React** | Five patterns are run over the whole of `apps/web/src` as tests, and each is proved to catch the thing it forbids. No file compares a DPD against a threshold, derives a bucket, decides eligibility or resolves a strategy |
| **Nothing is fetched then reduced** | No prop loads everything; no client-side filter; no client-side sort. Every narrowing is a `$filter`, `$orderby` or the source's own search |
| **A KPI is a platform count or an em dash** | `$count` with `maxPageSize` 1. A figure the Web API cannot compute shows `—` and names the phase that will supply it. Dataverse's 5,000 cap reports as `5,000+` |
| **Stored is never shown as live** | Case and snapshot figures carry "Stored MIS position — not a live MIS read", with as-of and recorded-at |
| **An unsourced column is preserved, not dropped** | Customer 360 keeps Collateral, Guarantor and Insurance, marked *not yet sourced*. Adding columns would be a schema change (Phase 9) |
| **Role gating authorises nothing** | `viewsForRole` hides nav entries; every read runs as the signed-in user and CRM's security permits or refuses it. A user reaching a hidden view by URL sees whatever CRM allows — the correct outcome |
| **Engines stay server-side** | `XrmCrmAdapter.execute` refuses by name. Decisions go through the Integration Service (ADR-DCP-13, ADR-DCP-17) |
| **No schema change** | 244/244 canonical columns, verified live. One web resource created — a file, not schema |

---

## 5. Defects found, and what found them

| Found by | Defect |
|---|---|
| The platform spike | **A Phase 4 defect.** `Prefer: odata.maxpagesize` *replaced* `odata.include-annotations="*"` instead of joining it, so every paged read silently lost formatted values and lookup annotations. Headers now merge; 5 regression tests; Phase 4 smoke still 22/22 |
| The live query smoke, first run | An activity's lookups need the **suffixed** navigation property on write — `qdb_collectioncaseid_qdb_collectionactivity` — because `regardingobjectid` also targets the case (KI-57) |
| The live query smoke, first run | **An empty `$select` is rejected by Dataverse.** Every KPI count would have failed at runtime (KI-58) |
| The live query smoke, first run | The smoke's own request counter reported 0 however many requests it made — `Object.assign` copies a getter's *value*. An instrumentation defect that would have made the evidence meaningless |
| My own review | Two spike assertions were vacuous: one against a table empty between smoke runs, one containing a literal `\|\| true`. The standing test-quality audit came out of this |
| My own review | `maxWindowSize` returned a mid-scroll window rather than an upper bound |
| My own review | The UI matrix claimed 10 functional views and 55 icons; the truth is 13 and 63. A test now asserts the matrix and the route table agree |
| A redeploy | The organisation refused the publish — another engagement was importing a solution, and Dataverse will not publish concurrently. The deploy script now retries that one condition; anything else still fails immediately, because retrying a genuine error turns a clear failure into a slow one |
| My own review | The project tracker's Phases sheet was one row out of alignment, showing unauthorised Phase 6 as In Progress (KI-60) |

**Three of these were invisible to unit tests.** That is the whole argument for the live smoke, and
it is now the third time in this engagement — after KI-52 and the Phase 4 `Prefer` header — that only
a real read caught a real defect.

---

## 6. Evidence

All against `org5869857f`, the only authorised organisation.

| Run | Result | What it proves — and what it does not |
|---|---|---|
| `spike-browser-adapter.mts` | **16/16** | The OData the browser adapter emits, its lookup handling and its continuation handling, against the real platform. Run **before** the views were built. Read-only |
| `smoke-qdb-phase5.mts` | **45/45** | The views' own query modules return, from the organisation, the values those views render. 14 seeded rows, all marked, all removed; **0 residue**. Authenticates as the service principal, **not** as a signed-in officer |
| `verify-view-columns.mts` | **11/11** | 173 column names exist on the organisation. Existence is necessary, not sufficient — KI-52 was a column that existed and still returned nothing |
| `deploy-workspace-webresource.mjs` | **10/10** | The artefact uploads, publishes, reads back byte for byte, and its tokens and host element survive. **Not** that it runs inside Dynamics |
| Frontend volume | **10/10** | At 100,000 rows, page size 50: **50 rows fetched, 16 rendered** — 0.05 % and 0.016 %. Synthetic and in memory; nothing was written to the sandbox |
| `smoke-qdb-plugins.mjs` (Phase 1) | 13/13 | Regression |
| `smoke-qdb-phase2.mjs` | 20/20 | Regression |
| `smoke-qdb-phase3.mjs` | 19/19 | Regression |
| `smoke-qdb-phase4.mjs` | 22/22 | Regression — including after the `Prefer` fix |
| `verify-qdb-schema.mjs` | 19/19 | **244/244** canonical columns; no schema change |
| Automated suites | **848 TS + 129 C#** | Type-check 0, build 0 |

Evidence files: `docs/evidence/Phase5_browser_adapter_spike.txt`, `Phase5_query_smoke.txt`,
`Phase5_view_columns.txt`, `Phase5_webresource_deploy.txt`, `Phase5_volume_evidence.txt`,
`Phase5_test_quality_audit.txt`, `Phase5_timing.md`.

---

## 7. Phase 5 gate — 26 items

| # | Item | Status | Evidence |
|---:|---|---|---|
| 1 | The approved baseline was converted, not redesigned | ✅ | 143 tokens, `components.css`, `uci.css`, 63 icons ported verbatim; `UIRequirementsMatrix.md` §H records every deviation with its reason |
| 2 | A UI Requirements Matrix maps every element | ✅ | `docs/UIRequirementsMatrix.md` — 21/21 views, 31 components, 22 mock collections, **0 elements dropped** |
| 3 | All 21 views present in the navigation | ✅ | `routes.ts`; `views.test.tsx` walks every one through the real bootstrap |
| 4 | Later-phase views preserved, marked, and showing no data | ✅ | 8 views carry `data-owning-phase`; a test asserts each |
| 5 | No future-phase functionality is pretended | ✅ | Rule builder disabled, configuration commands disabled, no send simulated, no invented KPI |
| 6 | No iframe embedding of the existing application | ✅ | One React tree; `prototype/` unchanged and unreferenced at runtime |
| 7 | A browser `ICrmAdapter` over `Xrm.WebApi` | ✅ | `XrmCrmAdapter implements ICrmAdapter`; spike 16/16 live |
| 8 | The early platform spike ran **before** the views were built | ✅ | `ac62634f` — spike committed with the scaffold, before the design system and the engine |
| 9 | CRM context read, never assumed | ✅ | `getClientUrl`, `getVersion` → `9.1`/`9.2`; `findXrm` checks `parent` first |
| 10 | Dual-platform from one source | ✅ | One artefact; nothing branches on organisation or platform. On-premises runtime remains untested and is **not claimed** |
| 11 | One workspace, two CRMs; system of record visible | ✅ | `OrgContext` + `OrgBadge`; HL→contact and BFD→account read from each case's lookup annotation |
| 12 | No frontend customer or facility master | ✅ | Customer 360 aggregates; `customerAggregate.ts` persists nothing |
| 13 | No business logic duplicated in React | ✅ | Two grep tests over `apps/web`; `execute` refuses |
| 14 | Server-side paging, filtering and sorting | ✅ | Every query composes `$filter`/`$orderby`; query smoke 45/45 proves the source applied them |
| 15 | Infinite scroll without loading everything first | ✅ | 100,000-row population: **50 rows requested** |
| 16 | Virtualization bounds the DOM, and it is measured | ✅ | **16 rows rendered**, independent of population *and* page size |
| 17 | No duplicate rows; identity is never an array index | ✅ | `rowKey` throughout; 0 duplicates at every population |
| 18 | Stale responses and overlapping requests handled | ✅ | Sequence-number suppression and an in-flight guard; 30 scroll events ⇒ ≤ 1 extra request |
| 19 | A criteria change resets paging cleanly | ✅ | Fingerprint-driven reset; the source refuses a carried continuation (`CriteriaChanged`) |
| 20 | MIS freshness visible; cached never shown as live | ✅ | `FreshnessIndicator` and `StoredPositionNotice`, both with as-of and retrieved-at |
| 21 | RBAC in React is UX only | ✅ | `viewsForRole` documented and tested as presentation; CRM security is authoritative |
| 22 | Web-resource packaging validated | ✅ | One self-contained 344 KB file; deployed, published, byte-for-byte verified (10/10) |
| 23 | No CRM schema change | ✅ | 244/244 verified live; one web resource created — a file, not schema |
| 24 | Phase 1–4 regression green | ✅ | 13/13 · 20/20 · 19/19 · 22/22 |
| 25 | New tests audited for vacuous assertions | ✅ | `audit-test-quality.mjs`: **0 findings** in the new Phase 5 test files; three generated-test loops given population assertions |
| 26 | **The workspace runs inside Dynamics** | ⛔ **NOT TESTED** | Needs an authenticated interactive CRM session. KI-56, R-P5-1. **Not claimed as passed** |

**25 of 26 pass. Item 26 is the reason this phase stops here rather than closing.**

---

## 8. Pending validation — exactly what remains

Seven checks. Only the first is proven.

| # | Check | Status |
|---:|---|---|
| 1 | Web resource deployed successfully | ✅ **Proven** — uploaded, published, read back byte for byte (10/10) |
| 2 | The application loads inside Dynamics | ⛔ Not tested |
| 3 | `getGlobalContext` is available | ⛔ Not tested |
| 4 | The CRM context resolves correctly (client URL, API version, user, roles) | ⛔ Not tested |
| 5 | Assets load correctly from `/WebResources/` | ⛔ Not tested — mitigated by design: the artefact is one file with no external reference and no absolute path |
| 6 | Authenticated browser Web API calls work from the deployed workspace | ⛔ Not tested — the query modules are proven from node **as the service principal**, which is a different identity with different privileges |
| 7 | Navigation and runtime behaviour work inside the Dynamics host | ⛔ Not tested |

### What is required from you

Open the workspace in a browser where you are signed in to Dynamics:

```
https://org5869857f.crm4.dynamics.com/main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html
```

Then tell me what you see. What matters most, in order:

1. **Does the shell render at all**, or does it show the "open it from CRM" panel? The panel means
   `Xrm` was not found — the Form Engine lost an on-premises release to exactly this.
2. **Does the Configuration view show a client URL, an API version and your user name?** That is
   `getGlobalContext` answering.
3. **Does Collection Cases list rows, or show an error?** That is an authenticated Web API read as
   you, under your security roles.
4. **Does the Audit Trail scroll past the first page?** That is paging and virtualization in the real
   host rather than in jsdom.
5. **Does the left navigation move between views, and does refresh keep you on the view you were on?**
   That is hash routing under `main.aspx`.

A screenshot of the shell plus any browser console output is enough for all five.

**Not done, and not to be done:** authentication is not bypassed, no password is stored or requested,
no security control is weakened, and no untested item above has been recorded as Passed.

---

## 9. Known issues raised

| ID | Severity | Summary |
|---|---|---|
| KI-56 | 🟠 | The workspace has never been run inside Dynamics — **open**, awaiting an interactive session |
| KI-57 | 🟡 | An activity's lookups carry a relationship suffix on write — **closed** |
| KI-58 | 🟡 | An empty `$select` is rejected by Dataverse — **closed** |
| KI-59 | 🟡 | `qdb_crmlogs` has no correlation column, so a case's trail is a `contains` over a memo — **open, accepted** |
| KI-60 | 🟡 | The tracker's Phases sheet was one row out of alignment — **closed** |

Carried and unchanged: KI-09 (Smart Assignment contract), KI-22 (no on-premises organisation),
KI-44 (Contact Hold source), KI-48 (Rule Engine operations), KI-50 (legacy `msst_` routes),
KI-53 (no MIS transport contract), KI-54, KI-55.

Risks R-P5-1 … R-P5-6 are recorded in `docs/RiskRegister.md`.

---

## 10. Not started, deliberately

Phase 6 (collection activities and PTP capture), Phase 7 (Communication Centre), Phase 8 (strategy
automation and assignment), Phase 9 (advanced collection processes), Phase 10 (reporting and
oversight) and Phase 11 (hardening, including the on-premises deployment test) have **not** been
started and require explicit approval.

Inside Phase 5, three things were deliberately left undone rather than faked: portfolio aggregation
that the Web API cannot compute, SLA state that has no model until Phase 8, and every Playwright E2E
scenario — which needs the same authenticated session item 26 is waiting on.
