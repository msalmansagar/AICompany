# DebtCollection — Facts Analysis and Recommendations

**Project code:** DCP-001
**Date:** 2026-08-04
**Input:** `D:\QDB\Projects\Debt Collection Platform\Debt Collection Final Requirements.docx` (2026-08-03)
**Cross-read:** `Debt Collection Platform.docx` (skeleton, 2026-08-03),
`Debt Collection Platform - SOW.docx` (RFP), `DCP_Technical_Implementation_CRM_v2.0.docx` (2026-05-03)
**Status:** Pre-BRD. This document is the analysis the user asked for before the BA phase starts.

---

## 1. What the new document changes

Eight material deltas against `brief.md`, the prototype, and the May technical specification.

| # | Change | Was | Now | Impact |
|---|---|---|---|---|
| D-1 | Delinquency source | Nightly Core Banking batch ingestion | **MIS system, already classified with arrear buckets, via Middleware API** | DPD and arrears are no longer computed by the platform. `QDB.DCP.DelinquencyPlugin` (nightly CBS batch) is superseded |
| D-2 | Case creation | Automatic on overdue detection | **Officer creates the case manually** | Reverses an RFP acceptance criterion and a Phase-1 tech deliverable |
| D-3 | Case categorisation | Auto by product type | **Officer selects product type manually** | Removes product-derivation logic |
| D-4 | DPD trigger logic | Hard-coded strategy engine | **Configuration table in CRM: user defines bucket → action** | Much smaller than the 16-criterion segmentation engine. Right shape for Phase 1 |
| D-5 | Bucket taxonomy | 6–8 buckets (`Current/1-30/31-60/61-90/91-180/180+/NPL/Write-Off`) | **10 MIS buckets**, up to `>2000` | Direct conflict — see §3 |
| D-6 | Phase 1 scope | 11 deliverables (tech doc) | **"2 features": Communication Management + Case Management** — but four further modules are then specified | Boundary is ambiguous — see §4 |
| D-7 | WhatsApp | "if approved" / "if supported" | **Listed unconditionally** as a Phase-1 channel | Becomes a procurement + consent workstream, not a sprint task |
| D-8 | Field Visit module | Included (skeleton module K) | **Removed** — the "Assign field visit" action is deleted from the Action Plan feature list | Deliberate de-scope. Resolves the module-11 mystery |

### D-8 detail — the missing module 11 is now identified

`brief.md` §5 flagged that the source scope list jumps 10 → 12. The skeleton document's
closing list has **17** modules. Comparing it line by line against the brief's 15, exactly one
master module is absent:

> **Module 11 = Field Visit Management.**

The Final Requirements document independently confirms the de-scope: its Collection Action Plan
feature list is the skeleton's list minus *"Standard action plan templates"* and minus
*"Assign field visit"*. The gap was not a typo — the module was dropped.
**This open question is closed.** Field Visit moves to a later phase.

---

## 2. The portfolio data — what it actually says

The Housing Loan sample table is **internally consistent**: all three columns tie to their stated
sums (balance differs by QAR 0.01 through rounding). It can be trusted as a basis for design.

### 2.1 The buckets are days, not amounts

The column is labelled "Arrear Buckets" with values like `1-30` and `>2000`, which could read as
QAR bands. They are **days past due**. Proof: if `1-30` were a QAR band, 1,594 customers could hold
at most QAR 47,820 of arrears; they actually hold QAR 2,440,630. Under a DPD reading, average
arrears per customer divided by the bucket midpoint is near-constant across all ten buckets:

| Bucket (days) | Customers | Avg arrears/customer | ≈ QAR per delinquent day |
|---|---:|---:|---:|
| 1–30 | 1,594 | 1,531 | 102 |
| 31–60 | 290 | 6,090 | 135 |
| 61–90 | 211 | 9,079 | 121 |
| 91–180 | 288 | 13,932 | 103 |
| 181–270 | 178 | 20,478 | 91 |
| 271–360 | 113 | 30,080 | 96 |
| 361–500 | 133 | 39,984 | 93 |
| 501–1000 | 335 | 64,715 | 86 |
| 1001–2000 | 357 | 122,537 | 82 |
| >2000 | 406 | 308,166 | ~123 |

A near-constant accrual rate across three orders of magnitude of time confirms the reading and
implies an **average monthly instalment of roughly QAR 2,500–4,000**.

*Observation to verify with the business:* the rate stays flat out to 2,000+ days, which is what you
would see if arrears keep accruing at the full instalment and **nothing is being recovered** in the
deep buckets. If partial recovery were happening the ratio would decay. Worth confirming — it
determines whether the deep book is a collections problem or a write-off problem.

### 2.2 Arrears are extremely concentrated; cases are not

| Slice | Customers | % of cases | Arrears (QAR) | % of arrears |
|---|---:|---:|---:|---:|
| >2000 DPD | 406 | 10.4% | 125,115,361 | **58.7%** |
| ≥501 DPD (worst 3 buckets) | 1,098 | 28.1% | 190,540,956 | **89.4%** |
| ≤90 DPD | 2,095 | 53.6% | 6,122,317 | 2.9% |
| 1–30 DPD alone | 1,594 | **40.8%** | 2,440,631 | **1.1%** |

**Consequences for the design:**

1. **Auto-creating one case per delinquent customer produces 3,905 cases, 41% of which carry about
   QAR 1,500 each.** That floods the officers with work that cannot repay its own handling cost.
   The manual-creation decision (D-2) is defensible on this evidence — but the better long-term
   control is a *configurable* creation threshold, so the switch to automatic is a config change,
   not a redesign.
2. **The 406 customers above 2,000 DPD are not a collections book.** At 5.5+ years past due they
   are legal, NPL, write-off, or deceased. Running SMS/Email/Letter automation at them is both
   pointless and a **conduct risk** — dunning a six-year-old defaulted account is exactly the kind of
   finding the RFP's governance section exists to prevent. The bucket → action configuration table
   must be able to express *"no automated contact"*, and the Phase-1 workspace must segregate this
   population visually.
3. **Management will optimise the wrong thing unless both views exist.** Operational leverage
   (cure, roll-rate) is at the top of the funnel where 41% of the cases sit; the money (89%) is at
   the bottom. A single dashboard cannot serve both.

### 2.3 Exposure carries no signal in this portfolio

Average outstanding balance per customer is almost identical in every bucket — QAR 795k to 920k,
a spread of under 16% across a range of arrears that spans 200×:

> 1–30 DPD: QAR 880,972 avg balance · >2000 DPD: QAR 920,115 avg balance

**Loan size does not predict delinquency depth here.** The RFP asks for segmentation by *exposure*;
on this data exposure is nearly a constant and would produce a meaningless ranking. **Arrears amount
and DPD are the only discriminators that carry information.** This should shape the Phase-1
prioritisation rules and is worth stating explicitly, because "segment by exposure" is otherwise an
obvious-sounding requirement that would quietly do nothing.

### 2.4 Scale

3,905 delinquent Housing Loan customers, QAR 3.42bn outstanding, QAR 213.0m arrears — and Housing
Loan is stated as 80–90% of the collection portfolio, so the full book is roughly
**4,300–4,900 delinquent customers**. This is a *small-data* problem. Every performance argument for
"read live from the API rather than store" is weak at this volume (see §5).

---

## 3. Bucket taxonomy conflict (D-5) — must be resolved before build

| Source | Buckets |
|---|---|
| **MIS API (new, authoritative)** | 1-30 · 31-60 · 61-90 · 91-180 · 181-270 · 271-360 · 361-500 · 501-1000 · 1001-2000 · >2000 |
| Final Requirements, trigger list | 1-30 · 31-60 · 61-90 · 91-180 · 180+ · NPL · Write-off |
| `qdb_delinquencysnapshot.qdb_dpdbucket` option set | Current · 1-30 · 31-60 · 61-90 · 91-180 · 180+ · NPL · Write-Off |
| Prototype segmentation matrix | 1-30 · 31-60 · 61-90 · 91-180 · 180+ |

Under the new architecture the bucket is **given by MIS, not derived by us**. Storing it in an
option set that cannot represent five of the ten incoming values means:

- 89.4% of the arrears (everything ≥501 DPD) collapses into a single `180+` value;
- the configuration table (D-4) physically cannot express a rule for `1001-2000`;
- `NPL` and `Write-off` are *statuses*, not DPD ranges — they are a different axis and must not sit
  in the same option set.

**Recommendation:** adopt the MIS taxonomy verbatim as the stored bucket, keep `NPL` / `Write-off`
as a separate account-status field, and treat any coarser grouping as a display/reporting rollup
defined in configuration.

---

## 4. Phase-1 boundary is ambiguous (D-6)

The document states Phase 1 = **two** features (Communication Management, Case Management), then
specifies four further modules in full: Collection Action Plan, Legal Escalation, Deceased &
Insurance Claims, Dispute & Complaint Management.

Two readings:

- **Narrow (literal):** Phase 1 = Communication + Case Management. The other four are forward
  context.
- **Broad (structural):** Phase 1 = six modules — the four extra sections were included precisely
  because they are in scope, and were edited (field visit removed) rather than pasted unchanged.

The editing evidence favours the **broad** reading. But the difference is roughly a 3× delivery
estimate, so it is the single most important thing to confirm before the BRD is written.
This is BA question **Q-01**.

---

## 5. Answer to Question 1 — store MIS data in CRM, or read straight from the API?

**Store it. But store a thin, immutable snapshot, not a copy of MIS — and read the volatile figures
live alongside it.**

### What must be persisted in CRM, and why

| Requirement | Why an API-only read fails |
|---|---|
| **Case anchor** | A case, action, PTP, communication, or legal referral must point at a customer and facility that *exist as Dataverse rows*. You cannot make a CRM lookup to a JSON row returned from someone else's API. Without persistence every downstream entity loses referential integrity |
| **Evidence of the value at the moment of decision** | Audit, legal and the regulator need *"arrears were QAR X and DPD was Y **when** the officer issued the notice"*. A live API is a moving target — re-open the case next month and the screen shows different numbers, and the evidence pack is worthless. This is the strongest single reason, and it is why `qdb_delinquencysnapshot` was specified as immutable |
| **Anything a CRM-side rule fires on** | The bucket → action trigger table, SLA escalation, queue routing, broken-PTP detection all execute **inside** CRM. A classic workflow or plugin cannot trigger on a field that lives in an external API |
| **Anything reported or trended** | Roll rate, cure rate, NPL movement and aging all need history. A live API returns today only |

### What should stay live and not be copied

- **The figures displayed on an open screen** — balance, arrears, DPD. Show these live so an officer
  never quotes a stale number to a customer on the phone. Render the live value next to the snapshot
  value with an explicit "as of" timestamp; when they differ, that difference is itself information.
- **The non-delinquent portfolio.** Do not replicate every customer into CRM to collect from ~4,500.

### Recommended shape

```
MIS  ──►  Middleware API  ──►  upsert  ──►  qdb_customer / qdb_loanfacility   (mutable, current)
                            └─►  append  ──►  qdb_delinquencysnapshot          (immutable, audit)

React workspace ──► CRM Web API      (cases, actions, PTP, comms, config, audit)
                └─► Middleware API   (live "as of now" balance panel only)
```

Rules that make this safe:

1. Every snapshot row carries the MIS **`batchReference`** and **`asOf`** timestamp, so every number
   on screen is attributable to a source and a moment.
2. Snapshots are **append-only**, enforced by a plugin, never by the UI (brief risk R-03).
3. Ingest **delinquent accounts only** — not the whole book.
4. **Volume:** 3,905 rows/day is 1.4m rows/year, which Dataverse handles comfortably. If you want it
   leaner, write a snapshot only when the bucket or arrears amount *changes*, plus a mandatory
   month-end row — that removes roughly 80% of rows while preserving every decision point and the
   regulatory month-end position. Define retention up front (e.g. daily for 13 months, monthly
   thereafter).
5. Ingestion failures must be visible. A silent MIS outage that leaves yesterday's figures on screen
   with no warning is worse than an error — surface batch status in the workspace.

**The anti-pattern:** "show it directly from the API to React" and store nothing. It looks cheaper,
and it costs you audit evidence, all CRM-side automation, all dashboards and history, all lookups,
and it makes an MIS outage blank the entire collections floor.

---

## 6. Answer to Question 2 — one React portal, or a web resource in each CRM cross-fetching the other?

The question bundles three separate decisions. Separated, the answers are clear.

### 6.1 How many codebases? — **One. Never two.**

Two web resources with mirrored logic is risk **R-05** (silent drift) reproduced in the UI layer:
every rule change becomes two deployments, and they *will* diverge. One bundle, deployed twice.

### 6.2 Where is it hosted? — **As a web resource in both orgs, written so hosting is swappable**

| Option | For | Against |
|---|---|---|
| **(a) Standalone React portal** (IIS / App Service + MSAL) | Best UX, single URL, natural home for a merged two-org view, no iframe constraints | Separate hosting, separate auth, separate deployment and its own security approval — the slowest path to production inside a bank. Users leave CRM to work |
| **(b) Same bundle as a web resource in HL *and* BFD** ✅ | Inherits CRM authentication and session — no MSAL, no hosting request, no new attack surface to approve. Users stay where they already work. **This pattern is already proven twice in this repo** (Dynamic Form Engine, Report Engine designer) | Sandboxed iframe and navigation constraints; the same artifact must be imported into two solutions |

**Recommendation: (b) for Phase 1.** Housing Loan is 80–90% of the portfolio, so the HL org is where
the work happens; adding BFD costs one extra solution import, not a second build. Keep every
Dataverse call behind a thin data-access layer so that moving to (a) later is a host swap rather
than a rewrite.

> ⚠️ **Superseded.** This recommendation was reversed in the same session after the frontend stack
> was decided: choosing Next.js *is* choosing option (a), the standalone portal. See §10,
> **ADR-DCP-02**. §6.1 (one codebase) and §6.3 (router only) stand unchanged.

### 6.3 How does it reach the other org's data? — **Never by a web resource calling the other CRM**

The specific idea of *"fetch BFD data inside the HL web resource"* fails for five concrete reasons:

1. **Authentication.** A web resource running in HL holds an HL session. It has no token for BFD.
   Getting one means a second interactive AAD sign-in per user per session, or an on-behalf-of token
   exchange — which is a **server-side** operation and cannot be done from a page.
2. **CORS.** The Dataverse Web API will not accept arbitrary cross-organisation browser calls from a
   CRM-hosted page without a registered AAD application and correct CORS handling. On-premise CRM
   2019 is worse still.
3. **Identity — this is risk R-01 and it is unchanged.** There is no join key between the two orgs.
   Merging a customer's HL facilities with their BFD facilities needs a **QID identity map**, plus
   fan-out, merge, and an unresolved-identity queue. That is stateful server work; it cannot live in
   a page.
4. **Security drift.** Two orgs mean two role definitions. A browser-side cross-call enforces
   whichever org's roles happen to apply, unpredictably.
5. **Enforceability.** Stop-contact (R-04) and audit writing (R-03) must sit where they cannot be
   bypassed. Anything enforced in a page is bypassable with F12.

**Therefore the CRM Context Router stays, and it is the only component that talks to both orgs.**
Both web resources call the router; the router owns the identity map, the fan-out and merge,
stop-contact enforcement, and the audit write.

**Phase-1 reduction worth taking:** cross-org Customer 360 is the expensive part and serves only the
10–20% of the portfolio that is BFD. Ship Phase 1 with the router serving **Housing Loan only**, BFD
behind a feature flag. Get the collections floor working on the 80–90% first. State this as a
deliberate phasing decision in the BRD rather than discovering it in month three.

---

## 7. Contradictions that must be resolved before the BRD is written

| # | Question | Sources in conflict |
|---|---|---|
| Q-01 | Is Phase 1 two modules or six? | Final Requirements, internally |
| Q-02 | Automatic or manual case creation? | RFP acceptance criteria + tech doc Phase 1 (auto) vs Final Requirements (manual) |
| Q-03 | Ten MIS buckets or the 6–8 option set? | MIS API vs `qdb_delinquencysnapshot` vs prototype |
| Q-04 | Internal UI: CRM UCI forms, or the React workspace, or both? | Tech doc v2.0 (UCI for staff, portal for external) vs brief + prototype (React workspace for staff) |
| Q-05 | One CRM organisation or two? | Tech doc v2.0 is **entirely single-org** — zero mentions of BFD or of two organisations — vs the brief's dual-org router architecture |
| Q-06 | Delinquency source: nightly CBS batch or MIS middleware API? | Tech doc vs Final Requirements |
| Q-07 | **Buy or build?** `Debt Collection Platform - SOW.docx` is an **RFP to procure a vendor platform**, with vendor deliverables, licensing and a commercial pricing template. The in-house CRM build is a different track | RFP vs tech doc vs this project |
| Q-08 | Is WhatsApp actually in Phase 1? It needs a Business Solution Provider, Meta template pre-approval, 24-hour session-window rules and recorded opt-in consent | Final Requirements (unconditional) vs everything else ("if approved") |
| Q-09 | What treatment applies to the 406 customers above 2,000 DPD, and is automated contact permitted at all? | Not addressed anywhere |
| Q-10 | Field Visit (module 11) — confirmed out of Phase 1? | Inferred from the edit, not stated |

**Q-05 and Q-07 are the two that change everything downstream.** A single-org build with UCI forms
and a vendor procurement running in parallel is a fundamentally different engagement from a
dual-org React workspace over a context router. The BRD must state which one it is.

---

## 8. Recommended position going into the BRD

1. **Adopt the MIS API as the sole delinquency source**; retire the nightly CBS ingestion design.
2. **Persist a thin immutable snapshot; read volatile figures live.** (§5)
3. **Adopt the ten MIS buckets verbatim**; move NPL and Write-off to a separate status axis. (§3)
4. **Keep manual case creation for Phase 1**, but make the creation threshold configurable so
   automation is a config change later. The data supports the decision. (§2.2)
5. **Prioritise by arrears and DPD, not exposure** — exposure carries no signal in this portfolio. (§2.3)
6. **One codebase, delivered as a standalone Next.js portal with a separate Fastify router**,
   forked from the `portal-shell` monorepo shape. *(Revised — §6.2's web-resource recommendation
   was reversed by §10, ADR-DCP-02.)*
7. **Keep the CRM Context Router**; no browser-side cross-org calls, ever. (§6.3)
8. **Phase 1 serves Housing Loan only**; BFD and cross-org 360 behind a feature flag. (§6.3)
9. **Segregate the >2000 DPD population** and allow the configuration table to express
   "no automated contact". (§2.2)
10. **Treat WhatsApp as a procurement and consent workstream**, not a development task. (§1 D-7)
11. **Record collection interactions as custom activity entities**, split into action and
    communication. (§9, ADR-DCP-01)
12. **The portal owns request submission; CRM owns the downstream lifecycle.** Legal User and
    Insurance Officer work in native CRM — no Phase-1 portal UI for them. (§11, ADR-DCP-03)

---

## 9. Proposed ADR-DCP-01 — Collection interactions as custom activity entities

**Date:** 2026-08-04
**Status:** **Proposed** — to be ratified in the BA / architecture phase and extracted to
`projects/debtcollection/adrs/ADR-01-collection-actions-as-activities.md`
**Deciders:** architect, ceo
**Supersedes:** partially supersedes the `qdb_caseaction` and `qdb_communicationlog` designs in
`DCP_Technical_Implementation_CRM_v2.0.docx` §3

### Context

1. The May specification models `qdb_caseaction` as a normal custom entity with a **required lookup
   to `qdb_collectioncase`**, and `qdb_communicationlog` as a second, separate normal entity.
2. **Delta D-2 breaks that design.** Cases are now created *manually* by an officer. Collection
   contact therefore happens *before* any case exists — and the population it happens to is the
   1,594 customers in the 1–30 DPD bucket (**40.8% of all cases**, §2.2), which is precisely where
   top-of-funnel cure work happens. A mandatory case lookup makes those interactions
   **unrecordable**. Manual case creation and a required case lookup are incompatible.
3. RFP §3.4 requires a *"full customer timeline: calls, SMS/email/letters/WhatsApp, visits,
   notices, approvals, documents"*.
4. Skeleton §E requires a mandatory next-action date, a mandatory outcome, and **no deletion** of
   historical actions.
5. The prototype currently **double-records** the same event: `A-9002` (SMS logged as an action)
   and `CM-701` (the same SMS logged as a communication) are one message stored twice. The model
   must declare which record is authoritative.

### Decision

1. **Collection interactions are custom activity entities** — created with *Define as an activity
   entity* = true — not normal custom entities.
2. **Two activity types, not one:**

   | Entity | Records | Distinguishing property |
   |---|---|---|
   | `qdb_collectionaction` | Call, meeting, field visit, supervisor review, manual note | No outbound side effect |
   | `qdb_communication` | SMS, email, official letter, WhatsApp | **Dispatches to an external gateway and carries a delivery lifecycle** |

   They are split on **privilege**, not on schema tidiness. *"Who may send a WhatsApp to a customer"*
   is a different permission from *"who may log a call"*, and a single entity cannot express that in
   CRM RBAC — it would have to be enforced in plugin code, which is weaker than a native privilege
   and harder to evidence against the RFP §4 segregation-of-duties requirement. The native Timeline
   aggregates both regardless, so merging them would buy nothing.
3. **`regardingobjectid` is the anchor, and it is polymorphic.** Permitted targets: Contact /
   Account (customer), `qdb_loanfacility`, `qdb_collectioncase`. **An interaction never requires a
   case.**
4. **The dividing line is normative and binding on later design work:**

   > An **activity** records something that *happened at a point in time*.
   > An **entity** records something with a *life of its own* — its own status progression, its own
   > approval, a due date that other people chase, and its own KPIs.

5. Consequently these remain **entities**: `qdb_ptprecord`, `qdb_approvalrequest`,
   `qdb_restructurecase`, `qdb_legalcase`, `qdb_insuranceclaim`, `qdb_dispute`. A promise-to-pay is
   monitored *after* it closes (kept / partially kept / broken / rescheduled, reschedule limits,
   approval after N changes, kept-rate by officer) — it is a commitment, not an event.
   Each of these **writes a `qdb_collectionaction` on creation and on decision**, so the timeline
   remains complete without duplicating the record of truth.
6. **Communications are recorded once**, in `qdb_communication` only. The duplicate action row seen
   in the prototype is removed from the model.
7. **Identical schema and identical logical names** are deployed to Housing Loan and BFD from a
   single managed solution — the schema-level mitigation for risk R-05.

### Consequences

**Positive**

- Interactions can be logged with no case in existence — the direct fix for the D-2 conflict.
- The **native Timeline control** renders calls, messages, letters and visits in one chronological
  stream on the customer, facility and case, satisfying most of RFP §3.4 with no custom component.
- **Open activity + `scheduledend` *is* the mandatory-next-action control.** "Overdue actions"
  reduces to `statecode = Open AND scheduledend < today` — no custom field and no batch job — which
  satisfies the skeleton §17 control *"missing case follow-up → mandatory next action date"*.
- Activities are **natively queueable**, giving Work Allocation a head start.
- A single `ActivityPointer` query answers *time to first contact*, *actions completed per officer*
  and *contact success rate* across every interaction type at once.
- One more state than a plain custom entity (Open / Completed / Canceled versus Active / Inactive).

**Negative**

- **The choice is irreversible.** The activity flag is fixed at creation and cannot be changed in
  either direction; reversing it means a rebuild plus data migration.
- **No PartyList.** Custom activities do not receive From/To/Cc, and PartyList is not an available
  column type. Multi-recipient contact (customer + guarantor + heirs) must be modelled with explicit
  lookups or child rows.
- **An activity cannot be the Regarding of another activity**, so supervisor approval of an action
  cannot be an activity hanging off that action. (Approval is an entity under §5 regardless.)
- **Polymorphic lookups cost the frontend.** React must read `_regardingobjectid_value` together
  with the `lookuplogicalname` annotation, and `$expand` must name the target type
  (`$expand=regardingobjectid_qdb_collectioncase`).
- **Activities are deletable.** They feel immutable and are not.

**Neutral**

- `subject` is the primary name field and must be composed by a plugin.
- The free unified timeline is free **only within one organisation**. Cross-org Customer 360 still
  requires the router to fan out, merge and sort (R-01) — a custom React component, not the native
  control. Deferred with BFD behind a feature flag.

### Alternatives considered

| Option | Reason not chosen |
|---|---|
| **Normal custom entity with a required case lookup** (the v2.0 design) | Cannot record any interaction before a case exists, which manual case creation guarantees will be common across 41% of the portfolio. Also forfeits the Timeline, queue routing and `ActivityPointer` reporting |
| **One merged activity for actions *and* communications** | Cannot express "may log a call" and "may send a WhatsApp" as distinct CRM privileges. The Timeline aggregates activity types anyway, so merging buys no timeline benefit while costing a native RBAC boundary the RFP §4 explicitly requires |
| **Everything as activities**, including PTP, restructure, legal, claims | These have multi-stage lifecycles, approvals and post-closure monitoring that Open/Completed/Canceled cannot represent, and a PTP is monitored *after* it closes. They would immediately need shadow status fields, defeating the purpose |
| **Standard `Task` / `PhoneCall` / `Email` activities**, no custom types | No place for collection-specific fields (outcome codes, template reference, delivery status, consent check, stop-contact evidence) without polluting shared system entities used elsewhere in both organisations |

### Implementation constraints — binding if this ADR is adopted

1. Register a plugin that **blocks Update and Delete once `statecode = Completed`**. Removing the
   Delete privilege from every security role is necessary but *not* sufficient — a system
   administrator bypasses role privileges, and skeleton §E requires that no history is deleted.
2. Compose `subject` in a plugin (e.g. `"Call — Reached, promise given — 2026-08-04"`) or every
   system view is unreadable.
3. **Stop-contact (R-04) and consent are evaluated in the router before any `qdb_communication` is
   created** — never on the form, never in the client. A blocked attempt is still written, with the
   block reason, as evidence.
4. Outcome codes come from the configuration table (D-4), not a hard-coded option set.
5. Field visit is carried as an **action type** on `qdb_collectionaction`, not as the deferred
   module 11 entity (§1 D-8).

### Open questions for the BA phase

| # | Question |
|---|---|
| Q-11 | Do official letters need a physical dispatch and return-receipt lifecycle beyond Completed / Canceled (the prototype already records `"Delivered — signed"`)? If so, `qdb_communication` needs a dispatch sub-state model |
| Q-12 | Is WhatsApp handled by `qdb_communication` under the same consent gate as SMS? Assumed yes, but it stays procurement-gated (D-7) |
| Q-13 | Multi-recipient contact — is contacting a guarantor or an heir in Phase 1 scope? This determines whether the PartyList limitation needs a design answer now or later |

---

## 10. Proposed ADR-DCP-02 — Standalone Next.js portal with a separate Fastify router, in one monorepo

**Date:** 2026-08-11
**Status:** **Proposed** — agreed in session 2026-08-11, to be ratified in the BA / architecture
phase and extracted to `projects/debtcollection/adrs/ADR-02-nextjs-portal-and-fastify-router.md`
**Deciders:** architect, ceo
**Supersedes:** the §6.2 recommendation of this document (web resource in both orgs). §6.1 (one
codebase) and §6.3 (the router is the only component that talks to both orgs) are unchanged and
carried forward as constraints.

### Context

1. §6.2 recommended shipping the workspace as **one bundle deployed as a web resource in both
   orgs**, on the strength of inherited CRM authentication and the two in-repo precedents (Dynamic
   Form Engine, Report Engine designer).
2. The frontend stack was then decided: **Next.js + TypeScript is the CLAUDE.md default** for
   frontend web, and `projects/portal-shell` (all 7 phases complete, on `main`) already provides an
   audited monorepo of exactly this shape — including the two genuinely expensive parts, **MSAL
   auth and the Dataverse client**.
3. Those two facts are in tension, because **choosing Next.js *is* choosing the standalone
   portal**: a web resource is a static file served by CRM, while Next.js route handlers, server
   actions and middleware need a Node server. The stack decision and the hosting decision are one
   decision, not two.
4. The CRM Context Router (§6.3) needs a home either way, and it has callers beyond the web app:
   CRM plugins, Power Automate flows, the MIS middleware callback, and any later mobile client.

### Decision

1. **Fork the shape of `projects/portal-shell` into one monorepo:**

   | Workspace | Contents |
   |---|---|
   | `apps/web` | Next.js, next-auth, next-intl, Fluent UI, TanStack Query |
   | `apps/api` | The CRM Context Router: Fastify, msal-node, pino, zod, CASL |
   | `packages/` | `dataverse-client`, `auth-adapters`, `i18n`, `types`, `ui` |

   The stack itself matches the CLAUDE.md technology defaults, so **no ADR is needed for the
   stack** — this ADR records the *hosting reversal* and the *router placement*.
2. **The workspace is a standalone Next.js portal**, not a CRM web resource. This reverses §6.2
   recommendation (b) and accepts its stated costs: AAD authentication (MSAL), hosting, a security
   review for a new user-facing application, and PDPPL exposure on anything server-rendered.
3. **The router is a separate Fastify service (`apps/api`), NOT Next.js route handlers.**
   Route handlers are a BFF — they exist only on the web app's path. The router is a **shared
   service**: plugins, Power Automate, the MIS callback and mobile all call it, and stop-contact
   (R-04) and audit (R-03) must be **unbypassable**, which they are not if they live only behind
   the web front end.
4. **Do not SSR customer PII.** Contact data, arrears and balances are fetched in client
   components via the router, keeping the PDPPL surface where the web-resource model had it —
   in the browser session of an authenticated officer, not in server-rendered HTML.
5. **Phase 1 serves Housing Loan only; BFD sits behind a feature flag** (§6.3 carried forward).

### Consequences

**Positive**

- The expensive components — MSAL and the audited Dataverse client — are **forked, not rebuilt**.
- One codebase (§6.1) with none of the web-resource sandbox, iframe or navigation constraints.
- A single URL and a natural home for the merged two-org Customer 360 when BFD arrives.
- The router has a first-class home with its own deployment lifecycle, callable by every consumer.

**Negative**

- **A new user-facing application must be approved**: AAD app registration, hosting, and a bank
  security review — the slowest path to production identified in §6.2, now accepted knowingly.
- Officers leave CRM to work; deep links back into CRM records must be designed.
- Node hosting must exist for `apps/api` regardless — **Q-14** (on-premise CRM 2019 vs Dataverse
  cloud) decides how hard that is.

**Neutral**

- The DFE / Report Engine single-file-bundle precedent stops applying; this project follows the
  `portal-shell` precedent instead.

### Alternatives considered

| Option | Reason not chosen |
|---|---|
| **Web resource in both orgs** (§6.2's original recommendation) | Incompatible with Next.js, the house default. Would also leave the router homeless: R-03/R-04 enforcement still needs a server, so the "no hosting request" advantage was partly illusory |
| **Next.js `output: 'export'` packaged as a web resource** | Kills route handlers, server actions and middleware — the parts of Next.js worth choosing. Next's content-hashed `_next/` chunk names also fight the packaging rule that **every web resource must be declared individually in `solution.xml` RootComponents**; DFE and the Report Engine ship single-file bundles precisely for this reason |
| **Router as Next.js route handlers inside `apps/web`** | A BFF is bypassed by definition by every non-browser caller. Stop-contact and audit enforcement would exist only on the web path — exactly the F12-class weakness §6.3 rejects |
| **Two separate repos (web + router)** | Shared `types` and `dataverse-client` packages would drift — R-05 reproduced at the contract layer. The monorepo keeps one representation of each contract |

### Open questions for the BA phase

| # | Question |
|---|---|
| Q-14 | **Is the CRM on-premise 2019 or Dataverse cloud?** The tech doc hedges. This decides where Node can be hosted (App Service vs on-prem IIS/containers), the MSAL flavour, and how heavy the security review is |

---

## 11. Proposed ADR-DCP-03 — Request forms: the portal owns submission, CRM owns the downstream lifecycle

**Date:** 2026-08-11
**Status:** **Proposed** — agreed in session 2026-08-11, to be ratified in the BA / architecture
phase and extracted to `projects/debtcollection/adrs/ADR-03-portal-forms-crm-lifecycle.md`
**Deciders:** architect, ceo
**Depends on:** ADR-DCP-02 (standalone portal). Under the web-resource plan, embedding CRM forms
was nearly free; the reversal makes it cross-origin and changes this answer.

### Context

1. The workflows include request forms — PTP, restructure request, legal referral, insurance
   claim, dispute — whose downstream lifecycles (approval, court stages, claim settlement) are
   modelled as CRM entities under ADR-DCP-01 §5.
2. With the workspace now a standalone portal (ADR-DCP-02), reusing CRM model-driven forms means
   **embedding a cross-origin iframe**, which is a different proposition from a same-origin web
   resource.
3. The tech doc **§6.1 already specifies native CRM forms for Legal User and Insurance Officer** —
   low-volume personas whose work is lifecycle management, not high-frequency capture.

### Decision

1. ❌ **Do not iframe CRM model-driven forms into the portal.** It breaks on: **third-party
   cookies** (actively being deprecated by browsers), **`frame-ancestors`** (Dataverse blocks
   embedding by default; allowing it needs admin CSP configuration that any admin can silently
   revert), **double sign-in** (a CRM login page rendered inside the portal's iframe), **no
   "saved, close me" contract** between the frame and the host, a visible visual seam, and poor
   behaviour on mobile.
2. **Segment by persona instead of by form technology:**

   | Persona | Works in |
   |---|---|
   | Collection Officer, Relationship Manager, Supervisor | **The portal** |
   | Legal User, Insurance Officer | **Native CRM directly** (their forms are already specified in tech doc §6.1) |

   ⇒ **No Legal or Insurance UI is built in Phase 1 at all.**
3. **The handoff is an event/lifecycle split**, the same dividing line as ADR-DCP-01: the officer
   submits the *legal referral checklist* in the portal (the event); Legal tracks
   notice → filed → court → judgment in CRM (the lifecycle).
4. **Phase-1 portal forms are built plainly with `react-hook-form` + `zod`** — the house stack in
   both `portal-shell` and DFE. **No descriptor/metadata layer for four forms** (YAGNI);
   revisit a metadata-driven approach on the **third** field-change request, per the
   three-strikes rule in `common.md`.
5. ❌ **Do not adopt the DFE form engine for Phase 1.** It is not a consumable package — it lives
   inside the `@qdb/portal` app, so reuse means extraction work — and it sits on
   `feat/dfe-enh-phase1-consolidated`, ~40 commits ahead of `main` and unmerged, which would
   couple this project's schedule to that branch's merge.
6. **The contract is enforced server-side regardless of where a form is drawn** — in the router
   and in CRM plugins. A React form validating alone is F12-bypassable, exactly like R-03/R-04.
   This also defuses the strongest argument *for* CRM forms: native forms never let you skip
   server-side rules anyway, so nothing is lost by not using them.

### Consequences

**Positive**

- Phase-1 scope shrinks: two whole personas' UI is deleted from the build, not deferred —
  their tooling already exists in CRM.
- No cross-origin iframe machinery, no CSP negotiation with CRM admins, no double sign-in UX.
- Four plain `react-hook-form` + `zod` forms are days of work, not weeks, and match the house stack.

**Negative**

- Legal and Insurance users get no unified workspace in Phase 1 — they work in CRM and the
  officers work in the portal. Acceptable at their volumes; revisit if their volumes grow.
- The referral handoff needs a clear status echo in the portal (officer sees "referred → filed →
  judgment" read-only) so officers are not blind after submission.

**Neutral**

- If a future phase does want CRM forms surfaced in the portal, the supported path is Power Pages
  or a purpose-built read model via the router — not an iframe.

### Alternatives considered

| Option | Reason not chosen |
|---|---|
| **Iframe CRM model-driven forms into the portal** | Fails on third-party cookies, `frame-ancestors` CSP, double sign-in, no close-me contract, seam, mobile — see Decision 1. Each failure is external and can regress independently of this project |
| **Build Legal + Insurance portal UI in Phase 1** | Low-volume personas whose CRM forms are already specified (tech doc §6.1). Building duplicates working tooling and widens Phase 1 |
| **Adopt the DFE form engine** | Not consumable without extraction; couples the schedule to an unmerged branch ~40 commits ahead of `main`. Wrong trade for four forms |
| **A metadata/descriptor layer over the forms** | YAGNI at n=4. The three-strikes rule sets the revisit trigger |
