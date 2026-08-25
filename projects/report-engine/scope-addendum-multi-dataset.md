# BA Scope Addendum — Multi-Dataset Reports (CRM + External, per-dataset composition)
# RPT-ENG-001 · Metadata-Driven Report Engine

| | |
|---|---|
| **Engagement ID** | RPT-ENG-001 |
| **Parent document** | `phase-2-ba.md` (BRD v1.0, approved 2026-07-07) |
| **Addendum ID** | ADD-002 |
| **Document** | BA Scope Addendum — Multi-Dataset Reports |
| **Version** | 1.0 |
| **Date** | 2026-08-25 |
| **Author** | BA (MSS Technologies) |
| **Status** | ✅ **APPROVED by CEO 2026-08-25 — both Phase A and Phase B.** Phase A is authorised for architecture and build. **Phase B is approved in scope but its BUILD remains held behind the four pre-conditions in §8**, which the CEO retained on approval. |
| **Trigger** | User requirement: a single report must be able to define **several CRM datasets and several external data sources**, with the author choosing per dataset whether it joins the root or stands alone. |

---

## 1. Context and Trigger

The engine today renders **one report, one table**. The requirement is that one report may declare
several datasets — some from CRM, some from external systems — and that the **author decides per
dataset** whether it is joined into the root result set or rendered as its own standalone block.

This is a capability change, not a refinement: it changes what the system promises. Under the
company workflow rules it is therefore a `new-feature`, and this BRD is the entry gate.

It also **reopens a decision the CEO has already taken**. `c8-inert-options.md` §"The three groups"
classifies all eight inert source types — External REST API, Middleware API, Core Banking API, MIS
API, QueryExpression, Dataverse Web API, Custom API / Plugin, SQL — as *group 3: not transforms at
all, they are the outbound-execution story*, and records that they are **"gated by ADR-RPT-011 and by
the CEO's V2/V3 scope, not by this condition."** Half of this request cannot proceed until that gate
is reopened deliberately.

---

## 2. Verified baseline — what already exists

Established by reading the code, not from the backlog. This materially reduces the estimate, and it
also relocates the work away from where it looks like it should be.

**Already built:**

| Capability | Where | State |
|---|---|---|
| A report may store **many** data sources | `ReportDefinition.DataSources` | ✅ Model is already a collection |
| Each source may map **many** entities | `ReportDataSource.EntityMappings` | ✅ |
| Multi-entity queries across all sources | `ReportQueryBuilder.JoinedMappings` | ✅ Flattens **every** source's mappings into one FetchXML: one root plus a `link-entity` per mapping carrying a valid join expression, ordered by `Depth` |
| Per-mapping join semantics | `JoinExpressionJson` (`from`/`to`), `JoinType` | ✅ Inner/outer honoured; a mapping without a usable join is **skipped rather than guessed at** |
| Authoring surface for sources | `prototype/report-designer.html` | ✅ Multiple sources can be declared |

**⇒ "Multiple CRM datasets, joined" is substantially already delivered.** What is missing there is
authoring clarity and validation, not an engine.

**Not built — the three genuine stops:**

1. **The result contract is singular.** `ReportResultJson` emits exactly one
   `{columns, rows, truncated}`. Every downstream consumer reads that shape: all layout renderers,
   all four exports (CSV/XLSX/PDF/PNG), `DrilldownPlanner`, and the dashboard widgets.
2. **Only the primary source's query is honoured.** `SdkReportEngine:91` calls
   `ReportSourcePlan.Primary()`. A second source typed CRM View, FetchXML or Static Dataset has its
   payload **silently ignored** — the report renders and says nothing.
3. **All four external source types are inert by decision**, with one sample already configured and
   doing nothing (*Sample — Overdue Facilities* → `GET /balances`, per C-8).

---

## 3. Requirements

### 3.1 Dataset declaration and composition (MDS-FR-001 … MDS-FR-010)

| ID | Requirement | Priority |
|---|---|---|
| MDS-FR-001 | A report may declare **two or more datasets**, each with its own source type, query and column set. | Must |
| MDS-FR-002 | Each dataset declares a **composition mode**: `joined` (merged into the root result set on a key) or `standalone` (its own result set). | Must |
| MDS-FR-003 | A `joined` dataset must declare a **join key on both sides**; a dataset without one is rejected at save, not at run. | Must |
| MDS-FR-004 | A `standalone` dataset renders as its own block, with its own columns, ordering and row limit. | Must |
| MDS-FR-005 | Exactly one dataset is the **root**; it defines the report's primary entity and drives drilldown. | Must |
| MDS-FR-006 | Dataset **execution order** is deterministic and author-visible: root first, then joined, then standalone. | Should |
| MDS-FR-007 | A dataset may be **disabled** without deleting it, so an author can isolate a slow source. | Should |
| MDS-FR-008 | Each dataset carries its **own row limit**, and the limit reported is the limit applied (see C-5). | Must |
| MDS-FR-009 | The designer must **prevent** the current silent-ignore behaviour: any declared source that the engine will not execute is refused at save with the reason. | Must |
| MDS-FR-010 | A single-dataset report continues to behave **exactly** as today, including its result shape. | Must |

### 3.2 External sources (MDS-FR-011 … MDS-FR-020) — gated, see §6

| ID | Requirement | Priority |
|---|---|---|
| MDS-FR-011 | An external dataset may be sourced from a registered **REST endpoint**. | Must |
| MDS-FR-012 | Endpoints are **registered configuration**, never free-text URLs in a report definition. | Must |
| MDS-FR-013 | Credentials are held in **secure configuration / Key Vault**, never in a report record or source. | Must |
| MDS-FR-014 | An external response is **mapped to columns** by a declared mapping; unmapped fields are dropped, not guessed. | Must |
| MDS-FR-015 | An external call has a **per-call timeout** and a total budget for the report (see §6.2). | Must |
| MDS-FR-016 | An external dataset that fails renders as a **visible, named failure block** — never as a silently empty table. | Must |
| MDS-FR-017 | A `joined` external dataset is joined **in memory** on its declared key, since FetchXML cannot reach outside Dataverse. | Must |
| MDS-FR-018 | Every external call is **audited**: endpoint, duration, row count, outcome. | Must |
| MDS-FR-019 | External responses are **not cached** across users unless the endpoint is declared user-independent. | Should |
| MDS-FR-020 | 🔴 External rows carry **no CRM security**. Each external dataset must declare who may see it, and that declaration is enforced before the rows reach the result. | Must |

### 3.3 Rendering, export and security (MDS-FR-021 … MDS-FR-028)

| ID | Requirement | Priority |
|---|---|---|
| MDS-FR-021 | A layout may place **each dataset block** independently. | Must |
| MDS-FR-022 | All four export formats emit **every** dataset — XLSX as one sheet per standalone dataset. | Must |
| MDS-FR-023 | CSV, being single-table by nature, exports the root dataset and **names the datasets it omitted**. | Must |
| MDS-FR-024 | Column masking applies **per dataset**, external included. | Must |
| MDS-FR-025 | Drilldown remains defined on the root dataset; standalone datasets state that they are not drillable. | Should |
| MDS-FR-026 | Arabic/RTL behaviour holds for every dataset block in all four formats. | Must |
| MDS-FR-027 | Per-dataset **timing** is surfaced in the result, so a slow source is identifiable without a trace. | Should |
| MDS-FR-028 | The result reports **partial success** — which datasets returned, which failed — rather than one overall status. | Must |

---

## 4. Scope

### In scope
- Multi-dataset result contract, and the renderer/export changes it forces.
- Per-dataset `joined` | `standalone` composition, with save-time validation.
- Execution of non-primary CRM datasets (CRM View, FetchXML, Static Dataset).
- External REST datasets, **conditional on the §6 gate being reopened**.
- In-memory join for external `joined` datasets.

### Out of scope
- Middleware, Core Banking and MIS source types — same execution path as REST, but each is a separate
  integration contract with its own owner. REST first proves the path.
- SQL source type: unreachable from the plugin sandbox (`ReportSourcePlan` documents this).
- QueryExpression and Dataverse Web API: per C-8, other routes to data the engine already reaches —
  honouring them would change nothing.
- Cross-dataset **calculated columns** and cross-dataset aggregation.
- Paging. Explicitly out — see §6.2.

---

## 5. Schema impact

| Table | Change |
|---|---|
| `qdb_reportdatasource` | **New**: composition mode (`joined`/`standalone`), join key both sides, execution order, enabled flag, per-dataset row limit |
| `qdb_reportdatasource` | **Fix first**: six of eleven rows have `qdb_sourcetype = null` (C-8). Multi-dataset execution must not begin on a column that is null in over half the live rows |
| **New** endpoint registry | Registered external endpoints: base URL, auth mode, timeout, owner. Not a column on the report |
| `qdb_reportauditlog` | Per-dataset execution rows (MDS-FR-018) |

---

## 6. Architecture impact — the two decisions that dominate

### 6.1 🔴 This reopens the CEO's V2/V3 external-source gate

Not a BA judgement — C-8 records the gate explicitly. Approving §3.2 **is** the decision to reopen
it. It should be taken as such rather than absorbed into a feature approval, because it brings in
outbound calls from a sandboxed plugin, credential custody, and third-party availability inside a
report run.

### 6.2 🔴 This reopens C-6, and C-6 is the load-bearing one

`c6-scale-characterisation.md` concluded **ADR-RPT-011 holds, no async path needed** — with 102×
headroom at 5,000 rows. That conclusion rests on a specific fact, quoted from the document:

> *"the engine issues one FetchXML query capped at `top="5000"` and does not page, so one execution
> is bounded at 5,000 rows however much data exists. The assumption survives because the engine never
> attempts arbitrary volume — not because it is fast at arbitrary volume."*

Multi-dataset breaks both halves of that sentence:

- **N queries, not one.** The bound becomes N × 5,000.
- **External calls add latency the plugin does not control.** A third-party API having a slow day is
  now inside a **2-minute sandbox ceiling** that terminates the whole report.

The measured headroom **does not transfer**, and no measurement in this repo covers the new shape.
⇒ **C-6 must be re-characterised against a multi-dataset report before build, not after.** A total
external time budget (MDS-FR-015) is the mitigation, but the budget has to be derived from a
measurement, not chosen.

### 6.3 The breaking change is the result contract

`{columns, rows, truncated}` must become a dataset collection. Every consumer changes: layouts, four
exports, drilldown, dashboard widgets, and `test-result-contract.mjs`. Recommended:
**keep the existing single-dataset shape emitted verbatim when a report has one dataset** (MDS-FR-010),
so nothing already deployed has to change on the day this ships.

### 6.4 ADR required

An ADR is needed for the external execution path: outbound HTTP from the sandbox, credential custody
(cloud secure config vs on-prem), on-prem **outbound allowlist**, timeout and failure semantics.
On-prem is the sharper constraint and has **never been tested** — the two Custom Actions are not yet
registered there at all.

---

## 7. Risks and open questions

| ID | Risk / question | Owner |
|---|---|---|
| MDS-R-01 | 🔴 External rows bypass CRM row-level security entirely. A standalone external dataset can surface data the viewer could never see in CRM. MDS-FR-020 is the control; it needs the auditor's sign-off, not just an implementation | Auditor |
| MDS-R-02 | 🔴 C-6 invalid for the new shape (§6.2) | Architect |
| MDS-R-03 | 🔴 PDPPL: CRM data leaving the tenant in an outbound call is a data-residency question, and a hard production gate on this programme | Auditor |
| MDS-R-04 | Result-contract change reaches every renderer and export (§6.3) | Architect |
| MDS-R-05 | On-prem outbound allowlist may make external sources **cloud-only**, splitting the feature across platforms | Architect |
| MDS-OQ-01 | Is REST-first acceptable, with Middleware/Core Banking/MIS deferred? | CEO |
| MDS-OQ-02 | If an external source is down, does the report **fail** or render with a named failure block? BA recommends the latter (MDS-FR-016) | CEO |
| MDS-OQ-03 | Does this ship cloud-first if on-prem cannot make outbound calls? | CEO |
| MDS-OQ-04 | Publisher prefix stays `qdb_` for new tables, against the `msst` convention? Cannot be changed once records exist | CEO |

---

## 8. BA recommendation

**Split the approval in two.** The two halves have different risk, different gates and different
owners, and bundling them buys nothing.

**Phase A — Multi-dataset, CRM only.** No new gate. The query builder already spans entities; the
work is the result contract, per-dataset composition, execution of non-primary CRM sources, renderer
and export changes, and closing the silent-ignore hole (MDS-FR-009), which is a live authoring defect
today regardless of this feature. Deliverable on its own: an author can build a report with a joined
block and a standalone block, entirely from CRM data.

**Phase B — External datasets.** Requires the §6.1 gate reopened, an ADR, the auditor on MDS-R-01 and
MDS-R-03, and C-6 re-characterised. Scoped to **REST only**.

Phase A also de-risks Phase B: it lands the contract change while every dataset still comes from a
source the platform secures, so when external rows arrive the only new problem is the external call.

**Recommended pre-conditions for CEO approval of Phase B build:**
1. C-6 re-characterised against a multi-dataset report (§6.2)
2. Auditor sign-off on MDS-R-01 and MDS-R-03
3. ADR for the external execution path, on-prem included
4. MDS-OQ-01 … MDS-OQ-03 answered

---

## 9. Approval

| Decision | |
|---|---|
| Phase A — Multi-dataset, CRM only | ☑ **Approved** — authorised for architecture and build |
| Phase B — External datasets (reopens the V2/V3 gate) | ☑ **Approved with conditions** — scope approved, **build held** behind §8 pre-conditions |
| CEO | Approved 2026-08-25 |

### What this approval decides

The CEO has **deliberately reopened the V2/V3 external-source gate** recorded in `c8-inert-options.md`.
External REST datasets are now in scope for RPT-ENG-001 rather than deferred to a later version.
The other three external types (Middleware, Core Banking, MIS) remain out of scope per §4.

### Conditions retained on Phase B build

Phase B is approved in **scope**, not yet released for build. All four must be met first:

1. **C-6 re-characterised** against a multi-dataset workload (§6.2) — the existing 102× headroom does
   not cover N queries plus uncontrolled external latency inside the 2-minute ceiling
2. **Auditor sign-off** on MDS-R-01 (external rows carry no CRM security) and MDS-R-03 (PDPPL)
3. **ADR** for the external execution path, on-premise included
4. **MDS-OQ-01 … MDS-OQ-03** answered

Phase A carries none of these conditions and proceeds now.
