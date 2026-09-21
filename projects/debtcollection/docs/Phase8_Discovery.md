# Phase 8 — WP1 Discovery: what the organisation already does

**Read-only probe of `org5869857f`, 2026-09-21.** Re-runnable:
`crm/scripts/probe-phase8-discovery.mts`. It creates, updates and deletes nothing.

This document exists because of an expensive precedent on this estate: a sibling engagement
scoped four phases of work on "the process engine has no runtime", which was false the whole
time. The github-researcher gate asks whether a *library* already does it. Nothing asked whether
the *organisation* already does. So this asks first.

---

## 0. The three gates

Nothing below is called "live" unless it passes all three:

1. does code **read** the column or entity?
2. is that code **registered and active**?
3. does the branch actually **do** something?

And the **kind decides the test**:

| Plugin type name | What it is | Evidence of life |
|---|---|---|
| `…​.Plugins.X` | a plugin | a registered, active `sdkmessageprocessingstep` |
| `…​.Workflows.X` / `…​.Workflow.X` | a custom workflow **activity** | a reference inside a workflow definition — **having no step is normal** |
| neither | unclassifiable | apply both, and say it could not be classified |

Applying the plugin test to an activity gives a confident false negative; applying the activity
test to a plugin gives a confident false positive. Both have already happened on this estate.

---

## 1. KI-71 — provenance. Confirmed, and the shape of the gap is exact

Metadata of `qdb_collectionactivity`:

| Question | Answer |
|---|---|
| Lookups to `qdb_strategyaction` | **0** |
| Alternate keys | **none** |
| Lookup to the case | `qdb_collectioncaseid` → `qdb_collectioncase` (nav `qdb_collectioncaseid_qdb_collectionactivity`) |
| Lookup to the type | `qdb_activitytypeid` → `qdb_collectionactivitytype` |
| Total M:1 relationships | 496 — almost all the polymorphic `regardingobjectid`, because this is an activity entity |
| Native SLA | `slaid` → `sla` exists (inherited from `activitypointer`) |

**KI-71 is confirmed by metadata, not by inference.** There is no way today to answer "which
strategy action produced this activity", and Activity Type cannot answer it — one strategy may
hold two actions of the same type, and two strategies may use the same type.

Configuration present to automate against: **2** strategies, **4** strategy actions, **12**
activity types, **30** outcomes.

This is a **technical** gap with no QDB business-policy content, so it is mine to resolve. Design
in §7 below.

---

## 2. Legal — `qdb_qdblegal` exists; its automation lives on-premises, not here

| | |
|---|---|
| Display name | **Litigation Request** |
| Logical name | `qdb_qdblegal`, set `qdb_qdblegals`, key `qdb_qdblegalid`, name `qdb_name` |
| Ownership | **OrganizationOwned** — there is no `ownerid`, so it cannot be assigned to an officer |
| Audit | **enabled** |
| Attributes | 158 |
| Alternate keys | **none** |
| Custom plugin steps | **0.** All 32 registered steps are Microsoft's own platform internals — `ObjectModel Implementation` (Create/Update/Delete/Retrieve/…) and the Archive/Retain external plug-ins that every entity carries |
| Workflows / BPF / actions with it as primary entity | **0** |

Business-required on create: `qdb_casetype`, `qdb_caseagainst`, `qdb_caseinitiatedby` (all
picklists) and `qdb_summaryjustification` (memo). The rest of the required list is system
(`statecode`, yomi names, `organizationid`).

Its 16 lookups include `qdb_customer` → **account**, `qdb_cif` → **account**,
`qdb_department`, `qdb_fjnnumber` → `qdb_fjnmaster`, `qdb_termsheet`, `qdb_oldlegalreference`,
`qdb_qdblegalrelationshipid` → `qdb_applicationtask`, `qdb_newlegalprocessowner` → `systemuser`.

### ✅ Resolved by QDB, 2026-09-21 — and it corrects two readings below

QDB has supplied the facts the organisation could not:

1. **Litigation Requests are only ever created in the BFD CRM — including for Housing Loan
   customers.** The `account`-only customer lookup is therefore *correct by design*, not a gap:
   in BFD CRM the customer master **is** `account`. An HL-originated recommendation resolves to
   the customer's **BFD account** before the request is raised.
2. **The established Legal process — its workflows and plugins — exists on-premises, not on
   Cloud.** So the emptiness recorded below is an artefact of this Cloud sandbox, **not** evidence
   that QDB's Legal process lacks automation. It does have one; it is simply not deployed here.

**Decision: DCP creates `qdb_qdblegal` directly, in the BFD organisation, for qualified
recommendations from either organisation.** Fact (b) below is withdrawn as a blocker.

**Status language for Phase 8, and it must not be softened** — this is Phase 7's KI-83 shape
exactly: **Litigation Request Creation Proven — QDB Legal Process Execution Unproven on Cloud.**
Creating the row here will not run the on-premises process, so no claim is made that it did.

Two consequences carried into WP9:

- an HL case needs its **BFD account resolved** from the customer business id before hand-off, and
  where no BFD account exists the hand-off must **refuse rather than invent one**;
- the three required picklists (`qdb_casetype`, `qdb_caseagainst`, `qdb_caseinitiatedby`) are
  **configuration**, never constants in code — a hand-off with nothing configured refuses.

### What the sandbox showed, and how to read it now

**(a) There is no existing business entry point to call on this organisation.** §13 asks whether
DCP should create `qdb_qdblegal` directly or call an existing supported Action/Workflow. On
`org5869857f` the second option **does not exist** — zero workflows, zero actions, zero custom
plugins. Direct `Create` is the only mechanism available here.

**(b) Its customer lookups target `account` only.** DCP is dual-customer by design: Housing Loan
customers are **contacts**, BFD customers are **accounts**. A Litigation Request raised from an
HL case therefore has **no column to put its customer in**.

**(c) It has no alternate key and no link back to collections.** Nothing on `qdb_qdblegal` points
at a collection case or activity, so "has Legal already been handed off for this recommendation?"
cannot be answered from the Legal side, and duplicate prevention cannot lean on an alternate key.

**This organisation is a design/config environment, and QDB has confirmed it.** (a) is true of the
sandbox only — the real entry point exists on-premises. (b) is withdrawn: the hand-off always
resolves to a BFD account. (c) stands and shapes WP10: duplicate prevention must be DCP-side,
because there is no alternate key and nothing on the Legal record points back at collections.

---

## 3. Restructuring — superseded by WP11

> **⚠️ This section was CORRECTED on 2026-09-21 by WP11.** The conclusion below was drawn from a
> name sweep of eight terms and is **too narrow**. QDB does not call the process "restructuring":
> it is modelled as **Facility Amendment** (`qdb_loan_amendment`), with **Rescheduling**,
> **Restructuring** and both *"due to financial difficulty"* variants as request types inside it.
> See `docs/WP11_RestructuringDiscovery.md`. The HL half of the statement still stands.

### The original WP1 finding, kept for the record

Swept all **3,144** entities and all **1,622** workflows for
`restructur|workout|reschedul|settlement|writeoff|waiver|deferral|moratorium`:

| Entity | Display name | Rows |
|---|---|---|
| `qdb_customer_restructure_history` | Customer_Restructure_History | **0** |
| `qdb_macapplicationrescheduling` | MAC Application Rescheduling | **0** |
| `qdb_nrgpwriteoff` | WCF | **0** |
| `qdb_tawarruqaccountrescheduling` | Tawarruq Account Rescheduling | **0** |

**Workflows matching: 0 of 1,622.**

**Stated precisely, because Legal has already shown why the looser statement would be wrong:**

> No authoritative Restructuring/Workout process has yet been identified **in the Cloud development
> organisation**. The existing On-Premises implementation status **requires QDB confirmation**.

This is deliberately not "QDB has no restructuring process". The Legal finding in §2 was exactly
this shape — an empty Cloud sandbox that turned out to reflect an environment difference, not an
absent process. Concluding absence from Cloud metadata alone would repeat the error one section
later.

---

## 4. Assignment — the live round-robin is bound to the Process Engine, not to collections

Assembly `QDB.RoundRobin` v1.0.0.0:

| Type | Kind | Verdict |
|---|---|---|
| `Plugins.RoundRobin` | plugin | **ACTIVE — Create of `qdb_task`, stage 10, sync.** The only live assignment path |
| `Plugins.MapWorkTaskFields` | plugin | ACTIVE on `qdb_roundrobinmasterdata` (Create/Update/Delete) |
| `Plugins.ValidateRoundRobinConfiguration` | plugin | ACTIVE on `qdb_work_item_steps` (Create/Update) |
| `Plugins.UserDeligation` | plugin | **no registered step — never executes** |
| `Plugins.ApplicationRoundRobin` | plugin | **no registered step — never executes** |
| `Workflow.ApplyRoundRobin` | activity | **referenced by 0 of 1,523 activated workflows** |
| `Workflow.ApplyDelegation` | activity | **referenced by 0 of 1,523 activated workflows** |
| `QDB.RoundRobin.AssignApplication` | unclassifiable | no step, and referenced by 0 workflows — dead by both tests |

Its configuration table, `qdb_roundrobinmasterdata` ("Round Robin User", **2 rows**), is keyed to
a **work item step**: `qdb_workitemstep`, `qdb_user`, `qdb_roundrobinteam`, `qdb_serial`,
`qdb_activeuser`, plus `qdb_regardingschemaname` / `qdb_userfieldschemaname`.

**Conclusion.** QDB's assignment capability on this organisation assigns **Process Engine tasks**,
configured per work item step. It is not a general service DCP can call for a
`qdb_collectioncase` or a `qdb_collectionactivity`, and the one activity that might have
generalised it (`ApplyRoundRobin`) is invoked by nothing.

§8 of the authorisation anticipates this: *"If the Smart Assignment authoritative integration
contract is unavailable, isolate the adapter and record the dependency rather than inventing
production behavior."* That is what WP6 will do. **This is not a stop condition** — it is an
instruction already given. KI-09 stands.

---

## 5. Escalation and TAT — wired, and dormant

| | |
|---|---|
| `qdb_escalationconiguration` ("Escalation Configuration", platform's misspelling) | exists · **0 rows** |
| `qdb_escalation` ("Escalation") | exists, an **activity** entity · **0 rows** |
| `Workflows.CreateEscalationRecord` | referenced by **0 of 1,523** activated workflows |

The machinery exists and has **no configuration records and no instances**. There is nothing live
to reuse and nothing live to disturb.

DCP's own schema already carries the configuration escalation needs:
`qdb_strategyaction.qdb_escalateifnotcompleted`, `qdb_strategyaction.qdb_escalationhours`,
`qdb_strategyaction.qdb_dayoffset`, `qdb_collectionactivitytype.qdb_slahours`, plus the Phase 6
follow-up columns. **No TAT threshold needs to be invented or hard-coded.**

---

## 6. Process Engine — config-rich, execution-zero

| Entity | Display | Rows |
|---|---|---|
| `qdb_work_item_steps` | Work Item Steps | **119** |
| `qdb_outcome` | Decision | **166** |
| `qdb_request` | Request | **0** |
| `qdb_task` | QDB Task (an **activity**) | **0** |

`org5869857f` is a **design/configuration environment**: the engine is registered and configured
and has never run here. `Workflows.ApplyProcess` is referenced by **0 of 1,523** activated
workflows, matching what was recorded on this estate previously.

**Consequence for Phase 8.** Routing DCP work through the Process Engine would mean commissioning
the first-ever process execution on this organisation — a far larger change than Phase 8's
objective, and one that would put DCP's collection lifecycle inside another product's runtime.
Phase 8 therefore keeps collection work in `qdb_collectionactivity`, which Phases 6 and 7 already
prove end to end, and treats the Process Engine as a **downstream destination** where QDB later
says a hand-off belongs.

---

## 7. KI-71 design — the smallest correct change

**Two columns on `qdb_collectionactivity`, both optional, both additive.**

| # | Logical name | Type | Required | Purpose |
|---|---|---|---|---|
| 1 | `qdb_strategyactionid` | Lookup → `qdb_strategyaction` | Optional | **Which strategy action requested this work.** The strategy itself is reachable through the action, so no second lookup is needed |
| 2 | `qdb_origin` | Choice — `Manual` / `Strategy generated` | Optional | **How the activity came to exist**, stated rather than inferred |

Why both. The lookup alone cannot answer §7's requirement: an officer who *accepts* a planned
action produces an activity that legitimately carries a strategy action, and a manually raised
Legal Recommendation must remain distinguishable from a strategy-generated one. Inferring origin
from "is the lookup set" would collapse that distinction — the same mistake as inferring
provenance from Activity Type, one level up.

**Idempotency is not a column.** Following ADR-DCP-20, strategy-generated work takes a
deterministic id:

```
activityId = uuidv5( caseId | episodeNumber | strategyActionId | evaluationContext )
```

created with `If-None-Match: *`. Re-evaluation with unchanged facts reaches the same id and the
platform refuses the create; a new episode or a new action yields a new id and therefore new work.
No counter, no flag, no "already generated" bookkeeping that a crash can invalidate.

**Against the 13 scenarios in §3 of the authorisation:**

| Scenario | Answered by |
|---|---|
| 1. One strategy, two actions of the same Activity Type | the lookup — each activity names its own action |
| 2. Different strategies using the same Activity Type | the lookup — actions belong to strategies |
| 3. Manual activity matching a generated Activity Type | `qdb_origin` |
| 4. Re-evaluation after DPD/bucket change | deterministic id — unchanged facts regenerate nothing |
| 5. Strategy changes while a case is active | new action id ⇒ new id ⇒ new work; prior work keeps its own provenance |
| 6. Strategy version/configuration change | `evaluationContext` carries the ruleset provenance already modelled in `RulesetProvenance` |
| 7. Completed activity then re-evaluation | same id ⇒ refused ⇒ nothing regenerated; history survives |
| 8. Cancelled activity then re-evaluation | same — a cancelled activity is not re-created behind the officer's back |
| 9. Retry after partial failure | same id ⇒ only the missing activities are created |
| 10. Action creating follow-up work | the follow-up is a date on the activity (Phase 6), which carries the provenance |
| 11. Legal Recommendation | the lookup plus §8's decision |
| 12. Restructuring Recommendation | the lookup plus §8's decision |
| 13. "Why does this activity exist?" | activity → action → strategy, plus `qdb_origin` |

**Compatibility.** A plain optional M:1 lookup and a local option set: supported identically on
Dataverse and Dynamics 365 CE 9.1. No Cloud-only construct.

**Backfill.** Existing Phase 6/7 activities keep `qdb_strategyactionid` null. `qdb_origin` is left
**null rather than defaulted to Manual** — null means "created before provenance was recorded",
and asserting those were manual would be inventing history. The Action Plan will say so.

**Impact on existing behaviour.** None. Both columns are optional and nothing reads them until
WP3. The Phase 6 Action Plan keeps working on type correlation until WP8 replaces it.

This changes no QDB business semantics — it records where work came from — so under §3 it is
provisioned and verified live rather than escalated.

---

## 8. Two decisions I cannot take from evidence

Both meet the STOP conditions in §34. Everything else in Phase 8 proceeds meanwhile.

### 8.1 Legal — ✅ ANSWERED by QDB, 2026-09-21

*Asked:* the entity has no workflow, action or custom plugin here, so §13's preferred option B
does not exist; and an HL-originated request has no customer column that accepts a contact.

*Answered:* **Litigation Requests are only ever created in the BFD CRM, including for HL
customers — an established process — and its workflows and plugins live on-premises, not on
Cloud.** DCP creates `qdb_qdblegal` directly, resolving an HL case to its BFD account first.

WP9 and WP10 are **unblocked**. Detail and consequences in §2 above.

### 8.2 Restructuring — which of the four is authoritative, if any?

Four candidate entities, all empty, no workflows.

**PENDING QDB CONFIRMATION — not concluded.** No authoritative Restructuring/Workout process has
yet been identified in the Cloud development organisation; the On-Premises position is unknown and
is QDB's to confirm. It is **not** recorded as absent, and **not** moved permanently to Phase 9.

Phase 8 therefore builds only *Strategy → Restructuring Recommendation → Assignment →
TAT/Escalation*, and **no new Restructuring lifecycle**. The downstream hand-off sits behind the
same boundary Legal uses, so if QDB confirms an On-Premises process WP11 integrates with it
**without redesigning strategy automation**. Nothing built now has to be unbuilt.

---

## 9. Existing open KIs, classified

| KI | Classification for Phase 8 |
|---|---|
| **KI-71** provenance | **Blocker — resolved in WP2** (design in §7) |
| **KI-09** Smart Assignment contract | **Dependency.** No live general capability exists; WP6 isolates an adapter and records the dependency, per §8 |
| **KI-66** activity outcome catalogue | **Dependency.** Automation acts on outcomes; the 30 `P6-` rows are synthetic and must not be read as policy. Mechanism proceeds; production configuration is QDB's |
| **KI-76** follow-up override | **Dependency, surfaced not resolved.** WP7 computes due dates from configuration; whether an officer may override remains QDB's question and must not be settled silently |
| **KI-53** MIS transport | **Non-blocking for build, blocking for a production run.** Re-evaluation triggers on snapshot arrival; the pipeline exists, the production transport does not |
| **KI-65** Open-state ordering | **Non-blocking.** The matrix stays permissive inside the Open group |
| **KI-72** PTP policy limits | **Non-blocking.** No limits invented |
| **KI-79** Contact Hold | **Non-blocking for Phase 8**, and unchanged: automated communication actions still pass the Phase 7 gate, which fails closed |
| **KI-83** Cloud external delivery | **Non-blocking.** Unchanged status |
| **KI-95** "CUSTOMER TABLE" wording | **Non-blocking** UX debt |
| **KI-96** count semantics | **Dependency — a standing rule.** Every Phase 8 queue count obeys it: unknown is `null`, never `0` |
| **KI-97** reload/routing debt | **Non-blocking** UX debt |

None is closed by this document.

---

## 10. Work packages and estimate

Summed from the rows, not judged — Phase 7's arithmetic lesson.

| # | Package | Hours | Depends on | State |
|---|---|---:|---|---|
| 1 | Discovery, metadata and prerequisite validation | 2.00 | — | **complete** |
| 2 | KI-71 provenance model — schema, provisioning, live verification | 2.00 | 1 | ready |
| 3 | Strategy automation domain model — applicability, plan generation, ordering | 2.50 | 2 | ready |
| 4 | Strategy execution and deterministic idempotency, with concurrency and crash-window tests | 3.00 | 3 | ready |
| 5 | Controlled re-evaluation — triggers, and what happens to pending/completed/cancelled/manual work | 3.00 | 4 | ready |
| 6 | Assignment adapter — isolated, evidence-based, dependency recorded | 2.50 | 3 | ready |
| 7 | TAT, due dates and escalation — server-side, configuration-driven | 3.00 | 4 | ready |
| 8 | Action Plan upgraded to authoritative provenance | 1.50 | 2, 4 | ready |
| 9 | Legal hand-off to `qdb_qdblegal` — BFD organisation, HL resolved to its BFD account | 2.50 | 4, §8.1 answered | ready |
| 10 | Legal visibility, traceability and duplicate prevention | 2.00 | 9 | ready |
| 11 | Restructuring — recommendation only, full process recorded as Phase 9 (§17 fallback) | 1.00 | 4 | ready |
| 12 | Operational queues and UI — assigned work, team queue, overdue/escalated | 3.00 | 6, 7, 8 | ready |
| 13 | Real Dataverse runtime validation | 2.00 | all | ready |
| 14 | Chrome QA journeys A–T | 3.00 | 12 | ready |
| 15 | Regression and hardening | 2.00 | all | ready |
| 16 | Documentation, ADRs, closure | 1.50 | all | ready |
| | **Total** | **36.50** | | |

**Expected completion = start + 36.50 effective execution hours.** Deliberately not a wall-clock
date: Phase 6 and Phase 7 both showed that a recorded start contains idle that is not execution
time, and quoting a calendar date from one misreports both the estimate and the variance.

**Calibration, stated rather than buried.** Phase 7's WP12 was estimated at 2.00 h and took
≈11h27m, because the package covered a screen while the work also absorbed a population resolver,
deployment, browser QA, cleanup tooling, documentation and an undiscovered platform defect.
WP12–WP15 here carry the same shape. The per-package figures above assume the deploy → live
validation → browser QA loop is charged to WP13 and WP14, which are sized as their own packages
for that reason. If that proves optimistic again, the revision will be recorded with the original
figure, the reason and a timestamp — never silently.

**Risks**

| Risk | Handling |
|---|---|
| QDB later names an authoritative restructuring process | WP11 builds only the recommendation, so a hand-off is added later exactly as Legal's was — nothing built has to be unbuilt |
| The Process Engine is later named as the destination for collection work | Kept as a downstream destination, not a dependency; no DCP work is modelled as `qdb_task` |
| `qdb_origin` duplicates a distinction QDB models differently | Two values only, optional, additive — cheap to retire |
| Re-evaluation destroys history | Explicitly forbidden: completed and manual work is never deleted (§6, §7 of the authorisation) |
| Assignment adapter becomes a de-facto engine | Refuses rather than routes where no capability is configured, as `UnavailableSmartAssignment` already does |
