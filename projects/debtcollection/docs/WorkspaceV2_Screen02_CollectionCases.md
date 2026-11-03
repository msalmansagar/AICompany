# Workspace V2 — Screen 02: Collection Cases

Reference: the supplied Collection Cases screenshot (Split view, bucket dots, KPI cards, command bar,
preview). The reference is authoritative for **information design**; DCP, Dataverse, MIS and the
delivered Phases 1–9 are authoritative for **data and behaviour**. Nothing on the screen is a value
the organisation does not hold.

Branch `feat/dcp-workspace-v2` · base `cf4e7642` · commits `c9fdc447`, and the docs/style commits after
it · V2 only — V1 Collection Cases untouched · not a PR · V2 not default.

## 1. Data-point mapping — the implementation contract

Every value was verified live on `org5869857f` on 2026-09-24/25 by read-only probes.

| Reference data point | DCP equivalent | Source | Grain | Available? | Decision |
|---|---|---|---|---|---|
| Customer name | formatted value of `_qdb_customerid_value` (contact `fullname` / account `name`) | case list read (annotation) | case | REAL | IMPLEMENT — rows, preview, grid; no read per row |
| Case number | `qdb_casenumber` | case | case | REAL | IMPLEMENT |
| Source system / CRM | `qdb_facilitysourcesystem`, `qdb_organizationcode` | case | case | REAL | IMPLEMENT |
| Product / facility context | `qdb_productdescription` (MIS loan-type description), `qdb_facilitynumber` | case | case | REAL (4,363 / 4,363) | IMPLEMENT (list column added, additive) |
| DPD / DPD bucket | `qdb_currentdpd`, `qdb_currentarrearbucket` — the ten MIS buckets | case | case | REAL | IMPLEMENT — ten buckets, never five |
| Current arrears ("Overdue" in the reference) | `qdb_currenttotalarrears` | case | case | REAL | IMPLEMENT, labelled *Current arrears* |
| Outstanding balance | `qdb_currentloanbalance`, labelled *Loan balance* (never "exposure", KI-32) | case | case | REAL | IMPLEMENT (preview fact, grid column) |
| Risk grade | `qdb_risklevel` exists, null on every row; no HL source | — | — | NOT AVAILABLE (KI-144) | OMIT |
| SLA / TAT | needs a TAT start policy; none configured (KI-101) | — | — | NOT AVAILABLE | OMIT — no "26h over" anywhere |
| Segment | no Segment concept in DCP; the nearest authoritative fact is **Customer type** (`qdb_customertype`: Individual 4,360 / SME 3) | case | case | REAL | REPLACE — shown as *Customer type*, never as "Segment" |
| Case status | `statuscode` | case | case | REAL | IMPLEMENT |
| Priority | `qdb_priority`: one option labelled `████`, null everywhere (KI-143) | — | — | NOT AVAILABLE | OMIT |
| Next review | no column | — | — | NOT AVAILABLE | OMIT |
| Assigned to | `_ownerid_value` (`qdb_assignedteamid` is null everywhere) | case | case | REAL — every open case is owned by `# DFE Backend API` | IMPLEMENT as *Owner* |
| Next action | first *current* item of the case's action plan in `qdb_sequence` order — the Case Workspace's own `NextPlannedAction` logic | strategy action + attributed activities | selected case | DERIVED FROM AUTHORITATIVE DATA (5 of 4,363 cases carry a strategy) | IMPLEMENT in the preview: action name + state, otherwise **"No next action determined"**; no prose |
| Next due action | the plan's due date — never determined (KI-101) | — | — | NOT AVAILABLE | shows "Due date not configured", as the Action Plan does |
| Last action | `qdb_lastactivitydate` is null everywhere; derived = latest activity on the case | `qdb_collectionactivity` | selected case | DERIVED | IMPLEMENT: subject · recorded on, else "None recorded" |
| Promise due | latest promise on the case (`qdb_ptpdate`, `qdb_promisedamount`, `qdb_ptpstatus`) | `qdb_collectionactivity` | selected case | DERIVED | IMPLEMENT: amount · promised for · status, else "None recorded" |
| Contact status / rate | nothing authoritative | — | — | PHASE 10 | OMIT |
| Strategy | `_qdb_strategyid_value` formatted | case | case | REAL | IMPLEMENT; null → *Strategy Not Assigned* |
| Facility number | `qdb_facilitynumber` | case | case | REAL | IMPLEMENT |
| Episode / opened / MIS as-of / synced | `qdb_episodenumber`, `qdb_opendate`, `qdb_misasofdate`, `qdb_lastmissyncon` | case | case | REAL | IMPLEMENT (details + freshness line) |

### KPI cards — none

| Reference card | Classification | Reason |
|---|---|---|
| Overdue assigned to me | NOT AVAILABLE | no per-case due state (KI-101); ownership uniform on the sandbox |
| Cases breaching SLA | NOT AVAILABLE | no SLA / TAT start policy (KI-101) |
| Promises due this week | DEFINITION PENDING | "week" and "due" undefined; the factual counts already live on My Day |
| Contact rate, 7 days | PHASE 10 | no contact-rate definition |

### Commands

| Reference | V2 | How |
|---|---|---|
| New action / Log call | **Log action** | existing `ActivityDialog` (the dialog chooses the activity type; there is no "call" preset) |
| Capture PTP | **Capture PTP** | existing `PromiseDialog` |
| Send reminder | **Send message** | the case's own Communications tab |
| — | **Open full record** | the V2 Case Workspace |
| Reassign | omitted | KI-100 — no officer on the organisation can hold work; no assignment capability is delivered |
| Export | deferred | Phase 10 / Report Engine |

### Scopes and search

- *All cases* (every open case CRM security lets the user read, in the header's CRM scope) and
  *My cases* (`_ownerid_value eq <session user>`; honestly **0** on the sandbox). *High risk* omitted
  (KI-144); *Team* omitted (`qdb_assignedteamid` empty).
- Search, one `$filter`, applied by the source: case number · customer business id (on Housing Loan
  this **is** the pseudo-QID, so QID search is real without a separate field) · facility number ·
  customer name through `qdb_customerid_contact/fullname` and `qdb_customerid_account/name`.
  V1 keeps its identifier-only search (`IDENTIFIER_SEARCH_FIELDS`); V2 asks for `WIDE_SEARCH_FIELDS`.

## 2. Architecture

```
CaseQuery  (scope · bucket · status · search+fields · strategy · owner · sort)
   ├─ buildCaseFilter        → $filter / $orderby      → usePagedQuery (50/page, continuation,
   │                                                       stale-sequence suppression) → VirtualizedRows
   │        ├─ Split  : SPLIT_COLUMNS beside CasePreview(caseId)
   │        └─ Grid   : GRID_COLUMNS with header sorting (server-side)
   └─ caseFacetFetchXml      → one FetchXML aggregate grouped by bucket → chip counts
```

- `v2/data/bucketVisual.ts` — **one bucket visual contract**: `rank` = position in
  `ARREAR_BUCKET_CODES` (1–10), `description` for assistive technology. Ten `--v2-bucket-N` tokens,
  each asserted at 4.5:1 on its 12% tint. `BucketDot` + `BucketBadge` consume it; adopted in Cases
  (chips, rows, grid, preview), Portfolio & Strategy (row headers), Case header, Overview, History tab,
  Queue preview, Customer 360.
- `v2/data/caseFacets.ts` — the second rendering of `CaseQuery`, clause for clause, with outer
  `link-entity` joins to contact and account for the name search. Parity is asserted by a fake
  platform with two independent interpreters, and live by `crm/scripts/smoke-cases-facets.mts`
  (65/65). A refusal (`AggregateQueryRecordLimit`) yields *unknown* counts; chips still filter.
- `v2/pages/cases/CasePreview.tsx` — reads the chosen case on demand (`useCaseRecord`), then the
  action plan (only when a strategy is resolved), the last activity and the latest promise; every read
  is cancelled when the selection moves. After a dialog saves, the preview re-reads.
- Preference `dcp.v2.casesLayout` (localStorage, per browser); selection `dcp.v2.cases.selected` and
  the way back `dcp.v2.cases.return` (sessionStorage, ids only). URLs carry filter codes, never names.
- Below 1120 px the split stacks list over preview (existing rule). Live narrow-width evidence remains
  unavailable (KI-141).

## 3. What was verified live (System Administrator, `org5869857f`, read-only)

- Counts: All 4,363 · 1-30 1,672 · 31-60 312 · 61-90 228 · … · >2000 548, plus "1 matching case
  carries no MIS bucket" — the same figures the Screen 01 smoke reconciled.
- Search "1614": 4 rows, chips 1+1+1+1, footer "4 shown — end of results". *My cases*: 0 everywhere.
- Split: row → preview (name, bucket/status/CRM badges, case · facility · product, four facts, details,
  *No next action determined*, last activity, promise, stored-MIS line, three commands) → Open full
  record → Case Workspace → ← Cases → same list, same selection. A fresh load selects nothing.
- Grid: eleven columns; header sort sends `$orderby=qdb_currenttotalarrears desc|asc,…` to the source
  (network trace); the select mirrors it; row → case → ← Cases → Grid retained.
- Portfolio: 61-90 × Strategy Not Assigned → chips, 61-90 chip 227 = "227 shown — end of results",
  All 4,358 = 4,357 unassigned + 1 unbucketed → Grid keeps the URL filters → case → ← Cases → chips
  and layout retained → ← Back to Portfolio & Strategy with the cell marked.
- V1: renders its own Collection Cases (Case / CRM / Customer / Facility / Bucket / DPD / Overdue /
  Status), no V2 dots, profile left on V1.
