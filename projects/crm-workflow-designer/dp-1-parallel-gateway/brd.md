═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Project:        DP-1 — Parallel (AND) Gateway: split and join
Engagement:     DP-1 (CWFD-007 backlog, §5.B — P1 enterprise parity)
Parent system:  CRM Workflow Designer (CWFD)
Prepared by:    MSS Technologies — Business Analyst
Date:           2026-07-26
Version:        1.0
Status:         DRAFT — Pending CEO Approval
═══════════════════════════════════════════════════

---

## 1. EXECUTIVE SUMMARY

CWFD models processes as Steps, each carrying Outcomes, each Outcome leading to one
next Step (optionally via conditional Routes carrying FetchXML filters). Every enterprise
BPM comparison run in CWFD-007 landed on the same headline gap: **CWFD can only express
exclusive choice.** A step finishes, exactly one outcome is taken, exactly one step
follows. Real QDB processes routinely need concurrency — a credit assessment, a legal
review and a compliance check that all start when an application is submitted, and a
decision step that must not start until all three are back.

DP-1 introduces the parallel (AND) gateway: an **AND-split**, where completing one step
activates several successor steps at once, and an **AND-join**, where a step waits for
every inbound parallel branch to complete before it starts.

A pre-analysis of the source tree produced one decisive finding that shapes this entire
document. **The current model has no gateway concept at all, and no explicit control-flow
semantics — the semantics are implied.** A step with three outcomes and a step that
should fan out to three concurrent branches are, today, byte-for-byte identical in
Dataverse. Nothing in `qdb_work_item_steps`, `qdb_outcome` or `qdb_outcomeworktasks`
records "these successors are alternatives" versus "these successors are concurrent".
Meaning is carried only by convention.

This has two consequences that the CEO must weigh:

1. **DP-1 is not additive in the way DP-2 was.** DP-2 added new fields nothing else read;
   it was inert by construction. DP-1 changes what an existing graph shape *means*. The
   parallel marker must therefore be explicit, persisted, and default to today's exclusive
   behaviour, so that every process already on the org keeps its current meaning exactly.

2. **The execution layer is outside CWFD and outside this engagement's knowledge.** The
   CWFD-007 scope boundary records that execution happens in a separate CRM layer of
   plugins and flows that CWFD does not own. If that layer walks `qdb_outcome` and takes
   the first satisfied outcome, a process a Process Manager draws as parallel would execute
   as a single branch — silently, with three of four branches never running. That is a
   production-correctness risk, not a cosmetic one, and it is raised as **OQ-1, the one
   genuinely blocking question in this BRD.**

Recommendation, developed in §16: proceed, scoped to design-time modelling of AND-split
and AND-join on process steps only, with an explicit publish-time guard whose strength the
CEO chooses, and with OQ-1 answered by the QDB platform team before the build phase begins.

---

## 2. BUSINESS OBJECTIVES

1. Enable **Process Managers** to model concurrent work — several steps that run at the
   same time from one predecessor — so that processes with genuinely parallel activities
   can be represented truthfully instead of being flattened into a false sequence.

2. Enable **Process Managers** to model a synchronisation point, so that a step which
   depends on several concurrent branches is expressed as waiting for all of them rather
   than being wired to whichever branch happens to be drawn last.

3. Enable **Business Analysts** to read concurrency off the canvas at a glance, through
   notation distinct from exclusive branching, so that a reviewer can tell "one of these"
   from "all of these" without opening a properties panel.

4. Enable the **QDB Platform Team** to consume an explicit, machine-readable control-flow
   semantic from Dataverse, so that the future CWFD-005 runtime — and any existing
   execution layer — can distinguish exclusive from parallel without inferring intent from
   graph shape.

5. Preserve, without exception, the behaviour and meaning of every process already
   modelled and published on `org5869857f`.

---

## 3. STAKEHOLDERS

| Stakeholder | Role | Interest in DP-1 |
|---|---|---|
| Process Manager | Primary maker — designs processes | Wants to model concurrent branches and a wait-for-all step without workarounds |
| Business Analyst | Reviews and documents processes | Needs concurrency visible and unambiguous on the canvas and in exports |
| QDB Platform Team | Owns CWFD and the surrounding CRM execution layer | Must confirm how the existing execution layer treats multi-successor steps (OQ-1) |
| CWFD-005 Runtime Team (future) | Will execute processes | Inherits the split/join contract this engagement defines; token/branch tracking is theirs |
| IT System Administrator | Provisions Dataverse schema | Must provision the new field(s) on `qdb_work_item_steps` before build completes |
| Process Owner / Approver | Publishes processes | Needs to know whether a parallel process is executable in the current platform |
| MSS Delivery Team | Builder | Needs the control-flow model decided before architecture, not during build |

---

## 4. SCOPE

### 4.1 In Scope

- **S-01** An explicit, persisted split semantic on a process step: exclusive (today's
  behaviour, the default) or parallel.
- **S-02** An explicit, persisted join semantic on a process step: none (today's
  behaviour, the default) or AND-join (wait for all inbound parallel branches).
- **S-03** Canvas notation distinguishing a parallel split and an AND-join from exclusive
  branching, in the edit canvas and the view canvas.
- **S-04** Editor interaction to set and clear both semantics from the step properties
  panel, including whatever guard rails validation requires.
- **S-05** Persistence and round-trip of both semantics through both adapters
  (`DataverseAdapter`, `ODataAdapter`) and the dev shim.
- **S-06** Dataverse schema provisioning script for the new field(s), following the
  established `sla-schema-lib.js` pattern, run only on explicit user authorisation.
- **S-07** Structural validation of parallel regions: unmatched split or join, deadlock
  by unreachable join, branch-count limits, and interaction with existing loop and
  dead-loop detection.
- **S-08** Simulation behaviour defined for parallel regions — at minimum, honest
  representation rather than silently walking one branch (approach per OQ-5).
- **S-09** Layout behaviour so a parallel region renders legibly under Dagre LR.
- **S-10** Publish-time treatment of processes containing a parallel region (per OQ-2).
- **S-11** Unit tests for every new pure function, extending the existing vitest suite.

### 4.2 Out of Scope

- **X-01** Runtime execution, branch tokens, instance state — CWFD-005 / RT-1.
- **X-02** Inclusive (OR) gateway and quorum / N-of-M joins. Deliberate YAGNI; the
  schema should not preclude them, but V1 does not build them.
- **X-03** Event-based gateways, timer/message/signal events — separate backlog items.
- **X-04** Multi-instance ("for each") steps — DP-7.
- **X-05** Sub-processes — DP-4.
- **X-06** Parallel gateways on SOP template steps and their inheritance through
  `deriveProcessFromSop`. Recommended as a follow-on engagement, DP-1b, exactly as DP-2
  scoped process steps first and DP-2b followed. See OQ-6.
- **X-07** BPMN 2.0 notation compliance or import/export — DP-8.
- **X-08** Changes to the existing CRM execution layer (plugins / flows). DP-1 defines the
  contract; implementing it in that layer is the platform team's work.
- **X-09** Migration or reinterpretation of existing processes. Every existing step keeps
  exclusive/none semantics.

---

## 5. FUNCTIONAL REQUIREMENTS

### 5.1 Control-flow model

- **FR-001** A process step SHALL carry an explicit **split type** with values
  `Exclusive` and `Parallel`. `Exclusive` SHALL be the default and SHALL be the effective
  value for every step that predates DP-1.
- **FR-002** When a step's split type is `Exclusive`, its outcomes SHALL retain today's
  meaning: the successors are alternatives, one is taken.
- **FR-003** When a step's split type is `Parallel`, all of that step's outcomes SHALL be
  understood to activate concurrently on step completion.
- **FR-004** A process step SHALL carry an explicit **join type** with values `None` and
  `AndJoin`. `None` SHALL be the default and the effective value for every pre-DP-1 step.
- **FR-005** When a step's join type is `AndJoin`, the step SHALL be understood to start
  only after every inbound parallel branch has reached it.
- **FR-006** Both semantics SHALL be stored on the step record, not inferred from graph
  shape, so that any consumer can read the intent directly.
- **FR-007** Split type `Parallel` SHALL be settable only on a step with two or more
  outcomes; the UI SHALL explain rather than silently ignore the constraint.
- **FR-008** A parallel split SHALL NOT be combined with conditional (filtered) routes on
  the same step in V1 — a branch either always runs or the split is not parallel. This
  keeps V1 an AND gateway and defers inclusive semantics to X-02.

### 5.2 Dataverse schema

- **FR-010** The schema change SHALL be additive: new column(s) on
  `qdb_work_item_steps`, no change to `qdb_outcome` or `qdb_outcomeworktasks`, no change
  to existing FK chains.
- **FR-011** Option-set codes SHALL follow the established `100000000`-based convention
  and SHALL be declared in exactly one place, reusing the `sla-option-codes.js` /
  `sla-schema-lib.js` single-source-of-truth pattern established in DP-2/DP-2b.
- **FR-012** The provisioning script SHALL be idempotent and re-runnable, and SHALL be
  executed against a live org only on explicit user authorisation, per the standing rule.
- **FR-013** A null or absent value SHALL read back as `Exclusive` / `None`, so
  unprovisioned and pre-existing rows behave identically to today.

### 5.3 Type and service layer

- **FR-020** `WorkflowStep` SHALL gain the two semantics as typed unions with code maps,
  following the `SlaFields` precedent.
- **FR-021** Both adapters SHALL persist and read back both semantics, sharing one mapping
  module — no per-adapter duplication, which is the drift risk DP-2's `slaStepFields.ts`
  was created to kill.
- **FR-022** Every existing step constructor and template builder SHALL be updated to emit
  the defaults explicitly.
- **FR-023** `deriveProcessFromSop` SHALL emit the defaults on derived steps (SOP-side
  configuration is X-06).

### 5.4 Canvas and notation

- **FR-030** A step configured as a parallel split SHALL be visually distinguishable from
  an exclusive step on both the edit canvas and the view canvas.
- **FR-031** A step configured as an AND-join SHALL be visually distinguishable, and the
  distinction SHALL be readable without selecting the node.
- **FR-032** Edges leaving a parallel split SHALL be visually distinguishable from
  exclusive alternatives.
- **FR-033** Notation SHALL degrade safely: a viewer on an org without the new field(s)
  SHALL see today's rendering, not an error.
- **FR-034** Dagre LR layout SHALL place concurrent branches so they read as siblings, and
  the join step SHALL sit downstream of all of them. Existing back-edge handling SHALL be
  unaffected.
- **FR-035** PNG/PDF export SHALL carry the notation.

### 5.5 Editor interactions

- **FR-040** The step properties panel SHALL expose both semantics with plain-language
  labels — the maker's vocabulary is "run these at the same time" and "wait for all
  branches", not "AND-split" and "AND-join".
- **FR-041** Changing a semantic SHALL participate in the existing undo/redo (temporal
  store) and dirty-state tracking.
- **FR-042** Turning a parallel split back to exclusive SHALL NOT delete outcomes or
  routes; it changes meaning only.
- **FR-043** Validation feedback SHALL be live, consistent with the existing debounced
  validation and node error badges.

### 5.6 Validation

New `ViolationCode` values, following the existing `ValidationService` structure:

- **FR-050 `PARALLEL_SPLIT_SINGLE_BRANCH`** — a step marked parallel with fewer than two
  outcomes. Error.
- **FR-051 `UNMATCHED_PARALLEL_SPLIT`** — branches from a parallel split neither converge
  on an AND-join nor all terminate. Severity per OQ-3.
- **FR-052 `ORPHAN_AND_JOIN`** — a step marked AND-join whose inbound edges do not
  originate from a parallel split. Error.
- **FR-053 `PARALLEL_JOIN_DEADLOCK`** — an AND-join reachable on some but not all of the
  branches it waits for, or reachable via an exclusive branch that can starve it. Error.
  This is the check that prevents modelling a process that can never complete.
- **FR-054 `PARALLEL_BRANCH_LIMIT`** — branch count above the agreed cap (OQ-7). Warning,
  consistent with the existing `TOO_MANY_OUTCOMES` treatment.
- **FR-055** Existing `DEAD_LOOP`, `ORPHAN_STEP`, `NO_TERMINAL_OUTCOME` and
  `MISSING_FALLBACK_ROUTE` checks SHALL remain correct in the presence of parallel regions
  — a step reachable only through a parallel branch is not an orphan.
- **FR-056** Publish SHALL be blocked by any error-severity parallel violation, exactly as
  `INVALID_SLA` and `INVALID_ASSIGNMENT` block it today.

### 5.7 Simulation

- **FR-060** Simulation SHALL NOT silently walk one branch of a parallel region and
  present it as the path. Whatever representation is chosen (OQ-5), concurrency SHALL be
  visible to the person running the simulation.
- **FR-061** Path enumeration SHALL remain bounded — a parallel region must not produce a
  combinatorial explosion of interleavings.

### 5.8 Lifecycle

- **FR-070** Version snapshots SHALL capture both semantics, so a snapshot restores the
  same control flow.
- **FR-071** Audit records SHALL capture changes to both semantics.
- **FR-072** Publishing a process containing a parallel region SHALL be treated per the
  CEO's decision on OQ-2.

---

## 6. NON-FUNCTIONAL REQUIREMENTS

- **NFR-001** Zero behaviour change for any process with no parallel configuration —
  same canvas, same validation results, same saved payload.
- **NFR-002** Bundle growth ≤ 25 KB, consistent with the ≤ 20 KB target DP-2 met for a
  smaller surface.
- **NFR-003** Canvas interaction ≥ 30 FPS at 50 nodes, per the standing TC-070 benchmark.
- **NFR-004** Validation of a parallel region SHALL be linear or near-linear in graph size;
  reachability analysis must not become quadratic on large processes.
- **NFR-005** Strict TypeScript, no `any`, no type assertions, per the constitution.
- **NFR-006** Every new pure function unit-tested; the suite stays green (94 tests today).
- **NFR-007** No new injection surface. Option-set codes and GUIDs only; `assertGuid` at
  every write boundary.
- **NFR-008** No PII introduced. Both semantics are option-set integers.
- **NFR-009** Accessibility: notation SHALL NOT rely on colour alone.

---

## 7. BUSINESS RULES

- **BR-001** Exclusive is the default. Silence means today's behaviour, always.
- **BR-002** A parallel split needs at least two branches.
- **BR-003** In V1 a parallel branch is unconditional — no filtered routes on a parallel
  split.
- **BR-004** An AND-join waits for all of its inbound parallel branches.
- **BR-005** A process that can deadlock SHALL NOT be publishable.
- **BR-006** A process containing a parallel region SHALL NOT be presented to a maker as
  executable while the platform cannot execute it (see OQ-1 / OQ-2).
- **BR-007** Existing processes are not migrated, reinterpreted, or rewritten.

---

## 8. USER STORIES

**US-01 — Model concurrent work** *(Must have)*
As a Process Manager, I want to mark a step so that its successor steps run at the same
time, so that I can model an application that goes to credit, legal and compliance
simultaneously.
*Accepted when:* the step can be marked parallel; the canvas shows concurrency; the
setting survives save and reload; an exclusive step is unaffected.

**US-02 — Model a wait-for-all step** *(Must have)*
As a Process Manager, I want to mark a step as waiting for all inbound branches, so that
the final decision does not start on the first review to come back.
*Accepted when:* the step can be marked as an AND-join; the canvas shows it; it round-trips.

**US-03 — Be stopped from modelling a deadlock** *(Must have)*
As a Process Manager, I want the designer to tell me when a wait-for-all step can never be
reached on all its branches, so that I do not publish a process that hangs forever.
*Accepted when:* the deadlock validation fires with a node badge and blocks Publish.

**US-04 — Read concurrency off the canvas** *(Must have)*
As a Business Analyst, I want parallel branches to look different from alternatives, so
that I can review a process without opening every panel.
*Accepted when:* notation is distinct, works in view mode, and survives PNG/PDF export.

**US-05 — Know whether it will actually run** *(Must have)*
As a Process Owner, I want to know before publishing whether the platform can execute a
parallel process, so that I do not sign off something that will silently run one branch.
*Accepted when:* the OQ-2 mechanism (block, or explicit acknowledgement) is in place.

**US-06 — Honest simulation** *(Should have)*
As a Business Analyst, I want simulation to show concurrency rather than pick a branch, so
that the simulated path is not misleading.
*Accepted when:* per FR-060.

**US-07 — Undo a mistake** *(Should have)*
As a Process Manager, I want to undo turning a step parallel, so that experimenting is
safe.
*Accepted when:* the change participates in undo/redo and does not destroy outcomes.

---

## 9. DATA REQUIREMENTS

| Item | Detail |
|---|---|
| Entity touched | `qdb_work_item_steps` only |
| New columns | Split type and join type (option sets; final naming at architecture) |
| Option-set style | Global, `100000000`-based, single-source-of-truth code map |
| Defaults | Null → `Exclusive` / `None` |
| Migration | None. No backfill, no reinterpretation |
| Retention / PII | None. Integers only |
| Volume | Two integers per step row |

---

## 10. INTEGRATION DEPENDENCIES

| Dependency | Nature | Status |
|---|---|---|
| Existing CRM execution layer (plugins / flows) | Reads process config; behaviour on multi-successor steps unknown to CWFD | **OQ-1 — must be answered before build** |
| CWFD-005 runtime | Will consume the split/join contract | Not built; DP-1 is config-only until it exists |
| Dataverse schema provisioning | New columns on `qdb_work_item_steps` | Gated on explicit user authorisation, every time |
| `sla-schema-lib.js` pattern | Reused for the new script | Available on main |
| Managed-solution packaging (GL-01) | New columns inherit the same unresolved go-live condition | Open, with QDB stakeholders |

---

## 11. ASSUMPTIONS

- **A-01** `qdb_work_item_steps` can take additional option-set columns without disturbing
  the existing execution layer — consistent with DP-2, which added 11 columns to the same
  entity with no reported side effects.
- **A-02** The designer, not the runtime, is the source of truth for control-flow intent.
- **A-03** Process Managers understand concurrency conceptually and need vocabulary, not
  BPMN training.
- **A-04** Dagre LR already lays out fan-out and fan-in acceptably; the work is notation
  and validation, not a layout engine change.
- **A-05** DP-2's provisioning experience transfers — including that live provisioning is
  where schema-shape bugs surface, so the provisioning gate is a real test, not a formality.

---

## 12. CONSTRAINTS

- **C-01** CWFD is design-time only. DP-1 cannot make anything execute.
- **C-02** Client-side TypeScript only. No C# plugin workstream (`qdb_CreateProcessFromSop`
  precedent: the registered-plugin path does not exist).
- **C-03** Both adapters plus the dev shim must stay in lockstep.
- **C-04** Existing published processes on `org5869857f` must be untouched in meaning.
- **C-05** Production go-live remains gated on GL-01/02/03, unchanged and unresolved.
- **C-06** Live-org provisioning requires explicit user go-ahead each time.
- **C-07** Work proceeds in an isolated worktree off `origin/main`; PR merge is confirmed
  with the user.

---

## 13. RISKS AND OPEN QUESTIONS

### Risks

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-01 | Existing execution layer silently runs one branch of a parallel split | **Critical** — wrong execution, invisible | Unknown until OQ-1 | Answer OQ-1 before build; publish guard per OQ-2 |
| R-02 | Parallel semantics leak into the 31 files that consume `nextStepId`, breaking exclusive behaviour | High | Medium | Default-preserving design; regression tests on existing processes |
| R-03 | Deadlock validation is subtly wrong and either blocks valid models or passes broken ones | High | Medium | Pure, unit-tested reachability function with adversarial cases |
| R-04 | Simulation path explosion on nested parallel regions | Medium | Medium | Bound enumeration per FR-061 |
| R-05 | Notation confuses makers used to today's fan-out meaning | Medium | Medium | Distinct notation plus panel wording; UX review |
| R-06 | Provisioning surfaces a schema-shape bug late, as it did twice in DP-2 | Medium | Medium | Treat the provisioning gate as a test; idempotent script |
| R-07 | Scope creep into inclusive gateways, sub-processes or runtime | Medium | Medium | Hard scope locks X-01..X-09 |

### Open questions

- **OQ-1 [BLOCKING]** — What does the existing CRM execution layer do today when a step has
  several outcomes, and what would it do with a step marked parallel? Owner: QDB Platform
  Team. **This BRD recommends that build does not start until this is answered**, because
  the answer decides whether DP-1 is inert-and-safe like DP-2 or actively dangerous at
  publish time.
- **OQ-2** — Should Publish be blocked for processes containing a parallel region until a
  runtime can execute them, or allowed with a recorded acknowledgement? BA recommends:
  allow Save Draft, and require an explicit acknowledgement on Publish, with a hard block
  if OQ-1 shows the existing layer would mis-execute. CEO decision.
- **OQ-3** — Must every parallel branch reach the AND-join (strict structural join), or may
  a branch terminate at End? Strict is safer and simpler to validate; permissive is more
  expressive. BA recommends strict in V1.
- **OQ-4** — Are loops permitted across a parallel region boundary in V1? BA recommends no,
  with a validation error, deferring the semantics until a runtime exists.
- **OQ-5** — How should simulation represent concurrency? BA recommends collapsing a
  parallel region into a single "these run together" node in the path rather than
  enumerating interleavings.
- **OQ-6** — Do SOP templates need the same capability now? BA recommends no — mirror the
  DP-2 → DP-2b sequencing and raise DP-1b later.
- **OQ-7** — Maximum branches per split? BA recommends reusing the existing
  `MAX_OUTCOMES_PER_STEP = 5` as a warning threshold rather than inventing a second limit.

---

## 14. GLOSSARY

| Term | Meaning |
|---|---|
| AND-split | One step completes; all its successor branches activate concurrently |
| AND-join | A step that starts only when every inbound parallel branch has arrived |
| Exclusive (XOR) branching | Today's behaviour: successors are alternatives; one is taken |
| Inclusive (OR) gateway | Some-but-not-all branches activate by condition. Out of scope |
| Parallel region | The subgraph between a parallel split and its matching join |
| Deadlock | An AND-join that can never receive all the branches it waits for |
| Design-time | Modelling and configuration. CWFD's entire remit |

---

## 15. REQUIREMENTS TRACEABILITY MATRIX

| Objective | Requirements | Stories |
|---|---|---|
| 1. Model concurrency | FR-001..003, 007, 008, 010..013, 020..023, 030, 032, 040..042 | US-01 |
| 2. Model synchronisation | FR-004..006, 031, 034, 040 | US-02 |
| 3. Readable notation | FR-030..035, NFR-009 | US-04 |
| 4. Explicit machine-readable contract | FR-006, 010..013, 020, 021, 070 | US-05 |
| 5. Preserve existing behaviour | FR-013, 022, 042, 055, NFR-001, BR-001, BR-007 | all |
| Correctness / trust | FR-050..056, 060, 061, 071, 072 | US-03, US-05, US-06 |

---

## 16. RECOMMENDATION TO THE CEO

### Recommended approach: proceed, design-time only, process steps only, OQ-1 answered first

DP-1 is the right next parity item. It is the single largest control-flow gap, it is
self-contained, and it is the one gap that cannot be worked around: an SLA can be tracked
in a spreadsheet, a template can be copied by hand, but a process that genuinely has three
concurrent reviews cannot be modelled honestly in CWFD today, and makers are currently
forced to draw a false sequence.

Three qualifications the CEO should lock at the gate.

**First, this is not DP-2's risk profile.** DP-2 added fields nothing read; it was inert by
construction and the worst case was wasted effort. DP-1 changes what an existing shape
*means*, and the meaning is consumed by a layer we do not own. The mitigation is a design
where silence equals today's behaviour, plus OQ-1 answered before build. Recommend making
OQ-1 a gate condition rather than a delegated question.

**Second, the honest value statement.** Like DP-2, DP-1 ships configuration that nothing
enforces until CWFD-005 exists. Unlike DP-2, it also ships something immediately useful
with no runtime at all: a truthful diagram. Processes get documented correctly, reviewers
see real concurrency, and the schema becomes the contract CWFD-005 builds against. That
is worth doing on its own, but it should be approved with eyes open, not on an implied
promise of execution.

**Third, the modelling choice.** Three shapes were considered:

- **A first-class gateway entity** (`qdb_gateway` between steps, BPMN-style). Cleanest
  notation, worst cost — a new entity, rewired foreign keys, and a break in the
  step→outcome→route chain the existing execution layer walks. Rejected for V1.
- **A flag on the outcome** (this outcome fans out to all its routes at once). Reuses the
  routes table as the branch list, but splits the semantic across two tables and still
  needs a step-level join field. Rejected as a half-model.
- **Two option-sets on the step** — split type and join type. Recommended. No new entity,
  no FK changes, no migration, defaults preserve today exactly, and the semantic sits on
  the record every consumer already reads. It also leaves room for inclusive gateways
  later as additional option-set values rather than a redesign.

Architecture owns the final call, but the BA recommendation is the step-level option-set
model, and the BRD is written against it.

**Recommended scope locks:** AND only (no inclusive/OR), process steps only (SOP deferred
to DP-1b), design-time only, no C# workstream, no migration of existing processes.

**Recommended gate conditions:** OQ-1 answered by the QDB platform team before build
starts; OQ-2 (publish treatment) decided by the CEO at this gate; OQ-3, OQ-4, OQ-5, OQ-7
delegated to architecture; OQ-6 answered no.

**Alternative if OQ-1 cannot be answered quickly:** proceed anyway with a hard publish
block on parallel processes — the modelling and documentation value lands, and nothing can
reach the execution layer until the answer arrives. This is the safe path and adds little
cost, but it does mean the first release ships a capability that cannot be published.

---

## 17. APPROVAL

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO (Phase 1 gate) | — | Pending | — |
| QDB Platform Team (OQ-1) | — | Pending | — |

**Status: DRAFT — pending CEO Phase-1 decision.**
