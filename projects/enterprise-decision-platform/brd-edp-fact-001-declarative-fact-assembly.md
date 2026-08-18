# Enterprise Decision Platform — Declarative Fact Assembly and Set-Based Rule Logic

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-FACT-001
**Phase:** Business Requirements Document (BRD)
**Module in Focus:** Business Rules Engine (BRE) — the input surface and the value system
**Prepared by:** MSS Technologies — Business Analyst
**Date:** 2026-08-18
**Version:** 1.1 — sponsor decisions recorded 2026-08-18
**Status:** **ALL FIVE BRD EXIT CRITERIA MET. Pending the sponsor's formal ratification to exit the gate.**

**References:** `gap-analysis-duplicate-invoice-detection.md` (EDP-GAP-001, primary evidence) · `brd-edp-bind-001-entity-binding.md` v1.1 · `phase-3-arch.md` Appendix B · ADR-05, ADR-06, ADR-11, ADR-13, ADR-EDS-07, ADR-EDS-10 · `spikes/oq-b1-client-roundtrip-latency.md` · `spikes/oq-b6-cold-start-posture.md`

**Authority note:** This BRD proposes changing a position that was deliberately taken, not one that was overlooked. §5 states the tension openly rather than assuming the reversal is free.

**Separation-of-duties note:** This document was authored by the same agent that produced its evidence base. **It must be decided by a human sponsor, not by an agent.** The same caveat applied to EDP-BIND-001 v1.1 and was discharged only when the human sponsor ratified it. **Partially discharged 2026-08-18** — every content decision in §0 was taken by the human sponsor. Ratification of the document as a whole remains outstanding.

---

## 0. What changed in v1.1

The sponsor answered all seven open questions and the release-gate criterion in session on
2026-08-18. v1.0 asked them; v1.1 records the answers and their consequences.

| # | Decision | Effect on this BRD |
|---|---|---|
| **OQ-F1** | **Option B** — pure evaluator plus a declarative fact-assembly surface | ADR-EDS-07 and ADR-06 preserved, not superseded. Fact snapshotting becomes load-bearing |
| **OQ-F2** | **Two hops, hard ceiling**, raised only on evidence | FR-F3 bounded to two hops. This is a structural R-1 defence, not a tuning value |
| **OQ-F3** | **Tier snapshot retention by outcome**; permanent tamper-evident digest | FR-F34 rewritten. Follows ADR-13's two-tier precedent |
| **OQ-F4** | **Normalisation now**; fuzzy matching decided on measured evidence | §6.2 amended — fuzzy is deferred pending measurement, not rejected |
| **OQ-F5** | **External REST stays in this BRD** as phase F3 | Scope unchanged. F1 and F2 remain ungated by Legal |
| **OQ-F6** | **Joint architecture phase** with EDP-BIND-001, then sequence builds | §12 amended. The per-child-verdict / directive-vocabulary seam is designed once |
| **OQ-F7** | **Closed primitive set, extended only by ADR** — retrieval finds records, it never relates them | New boundary B-6. The stated ceiling R-1 required |
| **Exit 5** | **FR-F31 is a release gate from F2 onward** | R-2 becomes structurally impossible rather than discouraged |

**Decisions were taken by the human sponsor, discharging the separation-of-duties caveat
below.** What remains is ratification of the document itself, not of its content.

---

## 1. Executive Summary

A customer requirement arrived — duplicate invoice detection with unit-price threshold
checks over a Disbursement Request — and was analysed against the built engine. EDP can
express **two of its five checks**. The business then clarified that this requirement is
**a specimen, not the job**: requirements of this shape will keep arriving and the engine
is expected to absorb them.

That clarification is what makes this a BRD rather than a backlog entry. A hand-written
data-preparation layer per requirement is economical once and untenable as a pattern — it
reinstates the developer in the loop that EDP exists to remove, one layer above where
EDP-BIND-001 removes them.

Analysis of the specimen yielded **eleven capability primitives** that requirements of
this class need. **One is built.** Five of the remaining ten share a single root cause:
the runtime has no collection type.

This BRD requests approval to close that class of gap. The sponsor chose **Option B** on
2026-08-18 (§0, §5.3) and answered every open question; all five exit criteria are met
(§13). The recommendation was **Option B — keep the
evaluator pure and make fact assembly a second declarative, governed surface** — because
it removes the developer from the loop without forfeiting the properties that make EDP
sellable to a regulated buyer.

**§5 is the load-bearing section.** Data reach threatens rule purity, and rule purity is
what makes simulation, scenario regression, replay and grounded explanation possible.
Those are the moat. This BRD proposes a specific mechanism — **fact snapshotting** — that
keeps the moat intact while granting the reach.

---

## 2. Problem Statement

### 2.1 The pain

A business author can today express a decision **only over values handed to them**. Any
requirement that must look at more than one record, walk more than one relationship level,
consult a system of record we do not own, or produce a verdict per line item, cannot be
authored at all. It must be engineered.

The customer's requirement class is ordinary enterprise validation work — "has this
invoice been paid before", "is this price consistent with what we last paid", "does every
line carry a beneficiary". None of it is exotic. All of it is currently out of reach.

### 2.2 Evidence (verified 2026-08-18, EDP-GAP-001 §3)

Every claim below was verified by reading the runtime on `origin/main` at `c2a09e4f`.

| Finding | Consequence |
|---|---|
| The value system normalises to decimal, DateTime, bool, string. There is no collection type | A rule cannot iterate anything |
| `FormulaEngine` raises an error on collection aggregates by design | The limit is deliberate and documented, not an oversight |
| `PcrmInput.Via` and `PcrmInput.Aggregate` provide **single-hop** N:1 and 1:N access | Parent to child works; parent to child to grandchild does not |
| `ResolveAggregate` queries `childLookup == target.Id`, `TopCount = 5000`, filter applied in memory | Every read is anchored to one record. There is no population search, and truncation is silent |
| `PcrmAggregateFilter` compares to a literal — there is no `valueField` | A child cannot be compared to a field on its own parent |
| Inputs originate only from target attributes, `Via`, `Aggregate` or `InputsJson`. No HTTP client exists | No external system of record is reachable |

**Competitive position** (`phase-3-arch.md` Appendix B.8, refreshed 2026-08-18): North52
delivers all five checks of the specimen with no C# at all, combining record retrieval
(`FindRecordsFD` with runtime parameters), nested iteration (`ForEachInline`) and outbound
REST (`CallRestAPI`). EDP delivers two. The deficit recorded in B.6 as *invocation* is
wider than stated: it is **data reach**.

### 2.3 Cost of inaction

| | |
|---|---|
| **Commercial** | EDP cannot be sold into the validation and reconciliation use cases that make up much of enterprise rule work. The C-004 position — "not a drop-in North52 replacement until EDP-BIND-001 ships" — becomes untrue even after EDP-BIND-001 ships, because binding solves *when* a rule runs, not *what it can see* |
| **Delivery** | Every requirement of this class becomes a bespoke development engagement, priced and scheduled as such |
| **Product** | The authoring surface stays credible only for single-record decisions, which is a narrower market than the platform was scoped for |

---

## 3. Business Objectives

| # | Objective | Measure |
|---|---|---|
| BO-1 | A business author can express a decision that spans more than one record without a developer | The specimen's G3 is authored in the designer, not coded |
| BO-2 | A rule can produce a verdict per child record | G5 returns a per-line-item result from one invocation |
| BO-3 | A rule can consult an external system of record | G4 reaches the MIS API without a bespoke plugin |
| BO-4 | Governance properties survive the change intact | Simulation, scenario regression, replay and explanation still work on a data-reaching rule |
| BO-5 | The change does not reopen a ratified architectural commitment without saying so | ADR position stated explicitly, superseded formally or preserved |

---

## 4. Stakeholders

| Stakeholder | Interest |
|---|---|
| Human sponsor | Owns the §5.3 strategic decision. Cannot be delegated to an agent |
| Business rule authors | The intended beneficiaries — they gain the ability to author this class |
| Solution architects | Own the purity/reach tension and the ADR consequences |
| Security and audit | A rule that can query becomes a data-access surface (R-3) |
| Sales | Appendix B rows move on delivery |

---

## 5. Purity is the moat, and data reach threatens it

### 5.1 The tension, stated plainly

EDP's governance story rests on rules being **pure functions of their inputs**. That single
property is what makes simulation possible before publish, what makes saved scenarios a
meaningful regression gate, what makes a decision replayable, and what makes an explanation
grounded rather than reconstructed.

A rule that queries live data is no longer pure. Re-running it tomorrow reads a different
population and may reach a different verdict — correctly, and unhelpfully. Under a naive
implementation of data reach:

- **Simulation** becomes approximate, because the simulated run reads today's data.
- **Saved scenarios** become flaky, because the population moves underneath them.
- **Replay** stops reproducing the original decision.
- **Explanation** can cite a rule path but not the facts that drove it.

Those four are precisely what neither North52 nor Flowon offers (Appendix B.3). Trading
them for capability the competitors already have more of would be a poor exchange.

### 5.2 The mechanism that resolves it — fact snapshotting

**Every fact set a rule retrieves must be captured with the execution.** The evaluator
continues to be a pure function; what changes is that its inputs may now be *assembled*
rather than *supplied*, and the assembled input set is recorded as part of the decision
record.

This yields:

| Property | How it survives |
|---|---|
| Replay | Re-evaluate against the snapshot, not against live data. Reproduces the original verdict exactly |
| Simulation | Runs against a snapshot or a fixture, never against a moving population |
| Scenario regression | A scenario stores its fact set, so the gate stays deterministic |
| Explanation | The snapshot *is* the evidence — this closes GAP-12 and lets a decision say "duplicates DR10002 invoice 1" |
| Audit | The decision record answers not only what was decided but what was seen |

**This is a requirement, not an implementation note.** Without it, Option B delivers
capability and destroys the differentiator. FR-F30 to FR-F33 make it binding.

### 5.3 The strategic choice — the sponsor must pick one

| Option | Description | Assessment |
|---|---|---|
| **A** | Grow set logic and data reach into the evaluator itself | Fastest conceptual route. Contradicts ADR-EDS-07's deliberately side-effect-free runtime and the ratified "decision engine, not logic platform" positioning. Reads are not side effects, so it is defensible — but it is a reversal and would require formally superseding the ADR |
| **B** | **Keep the evaluator pure. Add a second declarative, governed surface for fact assembly, feeding the evaluator a snapshotted fact set** | **Recommended.** Removes the developer from the loop without reversing a ratified commitment. Preserves ADR-06's single evaluator and every §5.2 property. Larger build than it first appears |
| **C** | Accept that EDP is the wrong tool for this requirement class and position accordingly | Cheapest to build, most expensive commercially, given the sponsor has stated these requirements will keep arriving |

**Recommendation: Option B.** Held with moderate rather than high confidence — it is a
design question larger than one feasibility analysis, and the architecture phase may find
that A and B converge in implementation. What must not happen is arriving at A by
accretion without anyone deciding.

> ### ✅ DECIDED 2026-08-18 — **Option B**
> The evaluator stays a pure function. Fact assembly becomes a second declarative, governed
> authoring surface feeding it a snapshotted fact set.
>
> **ADR-EDS-07 and ADR-06 are PRESERVED, not superseded.** No ratified architectural
> commitment is reversed by this BRD.
>
> **Consequence:** fact snapshotting (§5.2) is no longer one design option among several —
> it is the mechanism the whole choice depends on. FR-F31 is a release gate from F2 (§12).

---

## 6. Scope

### 6.1 In scope

- A **collection type** in the runtime value system, and iteration over it.
- **Multi-level traversal** — parent to child to grandchild, bounded.
- **Population query** — retrieval beyond the anchor record, with runtime-parameterised filters.
- **Group-by and argmax** — latest, first, highest per key.
- **Existence and set-membership** predicates over a retrieved population.
- **External data source** — a governed, declarative REST source definition.
- **Multi-source union and canonicalisation** — reconciling differing shapes into one vocabulary.
- **Per-child fan-out** — one invocation, a verdict per child record.
- **Author-configurable criteria** — which conjuncts are mandatory is authored, not compiled.
- **Normalised comparison** — canonical text comparison for OCR-extracted and human-entered keys.
- **Fact snapshotting** (§5.2) — binding on all of the above.

### 6.2 Out of scope

- **Writing data.** This BRD grants read reach only. ADR-EDS-07 stands for effects.
- **Orchestration** — loops that act, scheduling, pub/sub, multi-step flows. That is the Flowon envelope and remains explicitly rejected.
- **Probabilistic fuzzy matching — DEFERRED, not rejected (OQ-F4).** §6.1 grants text *normalisation* only. Whether similarity scoring is added is to be decided on **measured evidence**: how many known duplicates exact-plus-normalised matching still misses against real historical data. Deciding it on industry anecdote was explicitly declined.
- **The duplicate-invoice requirement itself.** This BRD funds the capability; the specimen is evidence, not a deliverable.
- **Any change to the client-side surface.** EDP-BIND-001 owns that.

### 6.3 Boundaries that cannot be reopened

| # | Boundary | Source |
|---|---|---|
| B-1 | **One evaluator.** No second engine, in the browser or anywhere else | ADR-06 |
| B-2 | **The evaluator stays deterministic** — InvariantCulture, UTC, no ambient clock | ADR-11, EDP-H1 grammar |
| B-3 | **No arbitrary code execution.** Retrieval is declarative; it never becomes a scripting host | ADR-01 |
| B-4 | **Rules do not mutate data** under this BRD | ADR-EDS-07 |
| B-5 | **A decision must remain replayable** | ADR-13, and §5.2 |
| B-6 | **Retrieval FINDS records; it never RELATES them.** The retrieval primitive set is CLOSED — filter, sort, top-N, group-by with argmax, union of same-shape sources. Adding any primitive requires a written ADR and a decision, never a backlog ticket | **OQ-F7, decided 2026-08-18.** This is the stated ceiling that R-1 requires |
| B-7 | **Traversal is bounded at two hops from the anchor.** Raised only on evidence of a real requirement, never on speculation | **OQ-F2, decided 2026-08-18** |

---

## 7. Functional Requirements

### 7.1 Value system and traversal

| ID | Requirement | Priority |
|---|---|---|
| FR-F1 | The runtime value system supports an ordered collection of records | Must |
| FR-F2 | A rule may iterate a collection and evaluate a predicate per element | Must |
| FR-F3 | Collection inputs may be produced by traversing parent to child to grandchild — **bounded at two hops from the anchor record** (B-7). A third hop is rejected at author time | Must |
| FR-F4 | Existing scalar behaviour is unchanged; every rule authored before this change evaluates identically | Must |
| FR-F5 | Aggregate filters may compare a child field to a field on the anchor record (`valueField`) | Must |
| FR-F6 | Folds include `Exists` and `DistinctCount` alongside the existing numeric functions | Should |

### 7.2 Population retrieval

| ID | Requirement | Priority |
|---|---|---|
| FR-F10 | A rule may declare a retrieval over records not anchored to the target, filtered by runtime values | Must |
| FR-F11 | Every retrieval declares a mandatory filter. An unfiltered population read is rejected at author time | Must |
| FR-F12 | Retrievals are paged, and truncation raises a diagnostic — never a silent short result | Must |
| FR-F13 | A retrieval declares a row ceiling; exceeding it fails the evaluation rather than returning partial data | Must |
| FR-F14 | Group-by with argmax selection (latest, first, highest per key) is expressible | Must |
| FR-F15 | Retrievals execute in the **calling user's security context**, honouring record and field-level security | Must |
| FR-F16 | Two or more sources of differing shape may be unioned into one declared vocabulary | Should |

### 7.3 External sources

| ID | Requirement | Priority |
|---|---|---|
| FR-F20 | A REST source may be declared as a governed, reusable definition — endpoint, auth, response mapping | Must |
| FR-F21 | Source definitions are versioned and approved on the same lifecycle as rules | Must |
| FR-F22 | Credentials are never held in a rule or a source definition body | Must |
| FR-F23 | Every external call carries a timeout and a declared failure posture (fail-closed or fail-open), authored not defaulted | Must |
| FR-F24 | An external source is read-only. No verb that mutates the remote system is permitted | Must |

### 7.4 Purity, snapshotting and explainability

| ID | Requirement | Priority |
|---|---|---|
| FR-F30 | Every retrieved fact set is captured with the execution record | Must |
| FR-F31 | A decision can be re-evaluated against its snapshot and reproduces the original verdict exactly | **Must — RELEASE GATE from F2 onward** |
| FR-F32 | Simulation and saved scenarios evaluate against a snapshot or fixture, never a live population | Must |
| FR-F33 | An explanation may cite the retrieved records that drove the verdict, not only the rule path | Must |
| FR-F34 | Snapshot retention is **tiered by outcome** (OQ-F3): a full snapshot on every decision for a bounded window; a materially longer window for decisions that failed or routed to review, since those are the ones challenged; and a small **tamper-evident digest retained permanently** — what was queried, row count, hash of the result set — so a decision can be proven unaltered after the full snapshot is purged. Follows ADR-13's two-tier precedent | Must |

### 7.5 Authoring and configurability

| ID | Requirement | Priority |
|---|---|---|
| FR-F40 | Which criteria are mandatory versus advisory is authored in the rule, not compiled into code | Must |
| FR-F41 | Changing a criterion's mandatory status is a versioned, approved rule change with an audit entry | Must |
| FR-F42 | Text comparison offers a declared canonical form — case, whitespace, punctuation | Should |
| FR-F43 | One invocation may return a verdict per child record, each with its own reason codes | Must |
| FR-F44 | The designer surfaces retrieval cost to the author before publish | Should |

---

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-F1 | Per-child evaluation runs **in-process**. Per OQ-B1 the engine contributes ~0 ms and 329 ms is the cost of invoking a sandboxed plugin, so N evaluations must never mean N platform invocations |
| NFR-F2 | A rule with retrieval completes inside the CRM sandbox's two-minute ceiling, or fails with a clear diagnostic |
| NFR-F3 | Cold-start behaviour is unchanged by this feature. Per OQ-B6 the range is 3–14 s and no keep-warm cadence is reliable; nothing here may be specified against a warm-path assumption |
| NFR-F4 | Retrieval volume is observable — row counts and durations recorded per execution |
| NFR-F5 | Snapshot storage growth is bounded and monitored |

---

## 9. Assumptions, Dependencies, Constraints

| # | Item | Type |
|---|---|---|
| A-1 | Requirements of this class will continue to arrive — stated by the business 2026-08-18, and the premise of this BRD | Assumption |
| A-2 | Read reach satisfies the class. If write-back proves necessary, that is EDP-BIND-001 Phase 2, not this BRD | Assumption |
| D-1 | **W0-1 (SNK rotation) gates deployment of anything in the assembly.** Four merged changes already queue behind it; this would add more | Dependency |
| D-2 | EDP-BIND-001 architecture is not started. Binding and fact assembly interact and should be sequenced deliberately | Dependency |
| C-1 | Sandbox constraints: no arbitrary code, two-minute ceiling, netstandard2.0 and net462 | Constraint |
| C-2 | ADR-06 single evaluator; ADR-01 no code execution | Constraint |

---

## 10. Risks

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| R-1 | **Scope creep into a query language.** Declarative retrieval becomes an ad-hoc DSL with joins and subqueries | Product identity lost; unbounded build | Guard rails in FR-F11 and FR-F13; bounded traversal depth; architecture phase sets a hard expressiveness ceiling |
| R-2 | **Purity lost in implementation** — snapshotting descoped as an optimisation | The governance moat, and the whole differentiator, is destroyed | FR-F30 to FR-F33 are Must. Recommend promoting FR-F31 to a **release gate** |
| R-3 | **A rule becomes a data-access surface.** An author who can query can exfiltrate | Security and privacy exposure | FR-F15 caller security context; auditor review in Phase 6; treat as a PDPPL-relevant change |
| R-4 | **Unbounded retrieval breaches the sandbox ceiling** under real data volumes | Runtime failures in production | FR-F12, FR-F13, NFR-F2; volume measured before go-live |
| R-5 | **Snapshot storage growth** becomes a Dataverse capacity problem | Cost and throttling | FR-F34; tiering along ADR-13 lines |
| R-6 | **Option A arrived at by accretion** — reach added incrementally until the ADR is contradicted without anyone deciding | Ratified architecture silently reversed | §5.3 decision recorded before build; ADR superseded formally if A is chosen |
| R-7 | **Specimen-driven design** — the capability is shaped to one requirement and fits the next one badly | Rework | EDP-GAP-001 §10.1 generalises away from invoices deliberately; validate against a second, unrelated requirement before build |

---

## 11. Open Questions — ALL RESOLVED 2026-08-18

| ID | Question | Resolution |
|---|---|---|
| OQ-F1 | Option A, B or C? | **B** — pure evaluator plus declarative fact assembly |
| OQ-F2 | Traversal depth | **Two hops, hard ceiling.** Raised on evidence only → B-7 |
| OQ-F3 | Snapshot retention | **Tiered by outcome; permanent tamper-evident digest** → FR-F34 |
| OQ-F4 | Fuzzy matching in or out | **Normalisation now; fuzzy decided on measured miss rate** → §6.2 |
| OQ-F5 | External retrieval here or a separate BRD | **Here, as phase F3.** F1 and F2 stay ungated by Legal |
| OQ-F6 | Sequencing against EDP-BIND-001 | **Joint architecture phase**, then sequence builds → §12 |
| OQ-F7 | The expressiveness ceiling | **Closed primitive set, extended only by ADR** → B-6 |

### 11.1 Carried forward — measurements owed, not decisions owed

These do not block the gate. They are evidence to be gathered during architecture and before go-live.

| # | Item | Owner |
|---|---|---|
| M-1 | Duplicate miss rate under exact-plus-normalised matching, against real historical data — the input to the deferred OQ-F4 decision | Architecture / data |
| M-2 | Candidate-set sizes under C-7's unbounded lookback, and the review-queue load implied by C-8 | Architecture / data |
| M-3 | Whether the legacy pre-2025 table carries beneficiary name, account and IBAN | Data check |
| M-4 | The MIS API contract — response shape, paging, server-side filtering | Middleware team |

---

## 12. Recommended phasing

| Phase | Content | Rationale |
|---|---|---|
| **F1** | Collection type, iteration, multi-level traversal, `valueField`, `Exists` and `DistinctCount`, per-child fan-out | The dense cluster. Five of ten open primitives share the collection-type root cause. Delivers value with **no new data-access surface**, so R-3 does not yet apply |
| **F2** | Population retrieval with guard rails, group-by and argmax, and **fact snapshotting** | The reach step. Snapshotting ships *with* it, never after |
| **F3** | External REST sources, multi-source union, canonical text comparison | Distinct security profile; benefits from F2's guard rails being proven |

**F1 is a genuine standalone increment.** It closes GAP-01, GAP-02, GAP-03, GAP-05 and
GAP-06, needs no new security review, and would let a rule reason over a document's own
line items — a material capability gain on its own.

**Confirmed 2026-08-18:**
- **Phasing stands as written**, with F3 retained inside this BRD (OQ-F5).
- **FR-F31 is a release gate from F2 onward.** F1 carries no retrieval, so it has no fact
  set to snapshot and gating it there would be theatre.
- **Architecture is a JOINT phase with EDP-BIND-001** (OQ-F6), then builds sequence. The two
  interact at a specific seam: BIND Phase 1 returns a complete presentation directive set per
  form event, and FR-F43 lets one invocation return a verdict **per child record**, so the
  directive vocabulary must carry per-line results. Designing them apart would design that
  seam twice. C-B9's render-first model is settled in the same phase.

---

## 13. Acceptance criteria for BRD exit — ALL MET

| # | Criterion | Status |
|---|---|---|
| 1 | Sponsor has chosen A, B or C, recorded by a **human** | ✅ **Option B**, 2026-08-18 |
| 2 | If A chosen, ADR-EDS-07 formally amended first | ✅ **N/A** — B preserves it. No ADR is superseded |
| 3 | Expressiveness ceiling stated as a principle | ✅ **B-6** — retrieval finds, never relates; closed primitive set |
| 4 | Phasing confirmed or amended | ✅ **Confirmed**, F3 retained (§12) |
| 5 | FR-F31 confirmed as a release gate, or R-2 residual accepted | ✅ **Release gate from F2** |

**All five criteria are met.** What remains is the sponsor's ratification of the document
itself — a formality relative to the content, but a distinct act, and one an agent must not
perform on its own authored work.

---

## 14. Success metrics

| # | Metric | Target |
|---|---|---|
| SM-1 | Specimen checks authorable without code | 5 of 5 after F3; 2 of 5 today |
| SM-2 | Developer effort per new requirement of this class | Zero engineering days after F3 |
| SM-3 | Replay fidelity on a data-reaching rule | 100% verdict reproduction from snapshot |
| SM-4 | Appendix B rows moving from NONE to LIVE | 4 of the 5 B.8 rows |
| SM-5 | Governance properties retained | Simulation, scenarios, replay and explanation all pass on a data-reaching rule |

---

## 15. Traceability

| Source | Feeds |
|---|---|
| EDP-GAP-001 §10.1 capability table | §6.1 scope, §7 functional requirements |
| EDP-GAP-001 §10.2 strategic fork | §5.3, OQ-F1 |
| EDP-GAP-001 C-1 (business: criteria must be configurable) | FR-F40, FR-F41 |
| EDP-GAP-001 §6.3 (OCR matching evidence) | FR-F42, OQ-F4 |
| `phase-3-arch.md` Appendix B.8 | §2.2 competitive position, SM-4 |
| OQ-B1 latency spike | NFR-F1 |
| OQ-B6 cold-start spike | NFR-F3 |
| ADR-EDS-07, ADR-06, ADR-13 | §6.3 boundaries, §5.2 |

---

## Approval

**All content decisions have been taken by the human sponsor (§0). Ratification of the
document is outstanding.**

The separation-of-duties caveat is **partially discharged**: the strategic choice and all
seven open questions were decided by a human, not by the agent that authored the evidence.
What has not happened is a human signing off the document as a whole to open the
architecture phase.

| Role | Name | Decision | Date |
|---|---|---|---|
| Human sponsor — content decisions | Human sponsor | **Option B + OQ-F2..F7 + FR-F31 gate** | 2026-08-18 |
| Human sponsor — BRD ratification | *pending* | | |
| Architect | *pending, after ratification* | | |

**Next step on ratification:** `github-researcher` first, per the standing
adopt-over-build rule — collection and query semantics in decision engines are well-trodden
ground, and DMN FEEL's list functions and Drools' `accumulate` and `exists` are directly
relevant prior art — then the architecture phase, jointly sequenced with EDP-BIND-001 per
OQ-F6.
