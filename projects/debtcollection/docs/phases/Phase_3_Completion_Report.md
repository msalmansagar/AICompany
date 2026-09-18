# Phase 3 — Configuration & Strategy Foundation: Completion Report

**Date:** 2026-09-18 · **Branch:** `feat/dcp-phase2-core-model` (worktree `.claude/worktrees/dcp-phase2`)
**Organisation:** `org5869857f` (Cloud sandbox, the only one authorised)
**Status:** complete — **stopping at the Phase 3 gate. Phase 4 has not been started.**

Every figure below was produced by a test run in this session or read back from the organisation.
Where something is not proven, it says so.

---

## 1. Phase 3 implementation summary

Phase 2 established what a Collection Case *is*. Phase 3 establishes **what decides anything about it**,
and the answer is consistently: not this platform.

Six capabilities were built:

1. **Rule Engine integration** — one facade, `IRuleEngine`, carrying eligibility, strategy selection and
   Contact Hold; operations resolved by name from configuration; every response validated before it is
   believed; every failure mode a named refusal written to `qdb_crmlogs`.
2. **Collection eligibility** moved onto that facade. The Phase 2 evaluator hierarchy was deleted rather
   than kept beside it.
3. **Collection Strategy configuration** — read from the organisation, resolved by the code the ruleset
   returns, filtered by activation and effective dates, with a priority tie refused rather than broken.
4. **Strategy Action configuration** — ordered by sequence, deactivated actions omitted, channel read as
   a label, activity type resolved to a code and never a GUID.
5. **Assignment configuration foundation** — configuration modelled and resolved; `IAssignmentEngine`
   defined; **no routing algorithm written**, and Smart Assignment refusing with a citation rather than
   guessing.
6. **Platform configuration and the Collection runtime configuration** — one assembled, cached, validated
   object per organisation, in which the only two fallbacks are conservative readings and everything else
   must be configured or the organisation cannot run Collection.

Plus **QDB auto-number integration** (ADR-DCP-15) and the **Contact Hold configuration contract**
(KI-44), both of which are complete on the DCP side and blocked on QDB confirmation.

Three things were found during the build rather than designed in advance, and all three are recorded:

- **A lookup cannot be `$select`ed by its storage column** (KI-52). `StrategyRepository` did, so every
  strategy resolved with zero actions — while every unit test passed, because the in-memory fake shared
  the code's wrong belief. Found by the live smoke; fixed; audited across every repository.
- **The Phase 1 smoke's transition assertion had become wrong.** It used `New → Settled` as its example
  of a refused transition, which KI-46 legitimately made permitted.
- **The Phase 2 smoke was wired to the evaluator Phase 3 replaced.** Both were corrected, not weakened.

Nothing outside the authorised Phase 3 scope was started: **no MIS API integration, no React Workspace,
no Communications implementation.**

---

## 2. Repository changes

### Added — domain (`packages/domain/src/`)

| File | What it holds |
|---|---|
| `ruleEngine.ts` | `IRuleEngine`, `RuleEngineError`, provenance, the three decision contracts. `ContactHoldInput` deliberately carries **no deceased flag** |
| `strategy.ts` | `CollectionStrategySchema`, `StrategyActionSchema`, `isEffective`, `isUsable`, `resolveApplicableStrategy` (`NotFound` / `NoneApplicable` / `Conflict` / `NotEffective`), `orderedActions` |
| `assignment.ts` | `AssignmentMethodSchema` (exactly the provisioned choice), `resolveAssignmentConfiguration`, `IAssignmentEngine`, `UnavailableSmartAssignment` |
| `caseNumbering.ts` | `CaseNumberSourceKindSchema`, `composeProvisionalCaseNumber`, `caseNumberFor` |

### Added — services (`apps/api/src/services/collection/`)

| File | What it does |
|---|---|
| `RuleEngineClient.ts` | Calls the three configured operations through `ICrmAdapter.execute`; validates every response; logs and rethrows every refusal |
| `StubRuleEngine.ts` | Deterministic engine for tests and controlled demonstrations. Holds no thresholds; stamps every decision `stub-rule-engine` so it is identifiable in the log for ever |
| `StrategyRepository.ts` | Reads strategies and their actions; groups by the lookup's `_value`; resolves activity type codes |
| `StrategyService.ts` | Turns a ruleset selection into one resolved strategy, or a named refusal, and logs both |
| `AssignmentService.ts` | `AssignmentRepository` + `AssignmentService`; selects the configuration and hands off to the engine it names |
| `CollectionConfigurationService.ts` | Assembles and caches the Collection runtime configuration; `requireRulesetCode` |

### Added — tests and tooling

`rule-engine-client.test.ts`, `strategy-and-assignment.test.ts`, `collection-configuration.test.ts`,
`strategy.test.ts`, `assignment.test.ts`, `caseNumbering.test.ts`, and
**`crm/scripts/smoke-qdb-phase3.mjs`** — the live Phase 3 proof, which seeds its own configuration, runs
the built Integration Service against the sandbox, and cleans up after itself.

### Added — documentation

`adrs/ADR-12` … `ADR-15`; `docs/phases/Phase_3_Completion_Report.md` (this file); `docs/evidence/` (four
raw run transcripts).

### Modified

`DelinquencySyncService` (takes `ruleEngine` and `caseNumbering` instead of `eligibility`),
`CollectionCaseRepository`, `DelinquencySnapshotRepository` (KI-47 column), `qdbBindings.ts` (Phase 3
tables, choices, `labelOf`), `PlatformConfigurationService`, `collectionSettings.ts`,
`platformConfiguration.ts`, `collectionCase.ts`, `eligibility.ts`, `misObservation.ts`,
`collection-portability.test.ts` (**new threshold guard**), `qdb-entity-defs.mjs` (KI-47 column),
`clean-qdb-smoke-data.mjs` (Phase 3 tables), `smoke-qdb-plugins.mjs` and `smoke-qdb-phase2.mjs` (the two
corrections above).

### Deleted

`eligibilityEvaluators.ts` (`StaticEligibilityEvaluator`, `RuleEngineEligibilityEvaluator`) — superseded
by the facade. Not kept beside it: two ways to decide eligibility is exactly the ambiguity ADR-DCP-13
exists to remove.

**Diff:** 35 tracked files changed (+865 / −156), plus 25 new files. Roughly 1,500 lines of new
non-test source and scripts. No build artefact, `dist/`, `node_modules/`, `bin/`, `obj/` or `.env` file
is in the change set, and a credential scan of every changed file and every evidence transcript found
nothing.

> **One observation for the gate, not a Phase 3 change.** The tracker's *Phases*, *Test Baseline*,
> *Dual-Platform Check* and *TBD* sheets were kept current at each gate, but the row-level statuses on
> the **Tracker** sheet were never updated at the Phase 1 or Phase 2 close — rows 69–77 still read
> *Not Started* for entities that have been live since 2026-09-18. Phase 3 updated its own rows (78–81,
> 87, 88, 90) and left the earlier rows alone rather than restating another phase's completion. They
> should be corrected, and it is a five-minute job whenever you want it done.

---

## 3. CRM / schema changes

**One.** `qdb_delinquencysnapshot.qdb_facilitysourcesystem`, String, `MaxLength = 50` — the KI-47 column
approved at the Phase 2 gate. Canonical column count **243 → 244**, verified live at **244/244**.

Nothing else was created, altered or removed. Specifically untouched: production, on-premises, the DA
module, the customer master (`contact` / `account`), BFD Facility Limit, HL Customer Product,
`qdb_crmlogs` (12 `qdb_` columns, verified unchanged), `crmi_autonumberingsetup`, `qdb_autonumberconfig`,
every `msst_` component, and every unrelated QDB component.

No entity was created. In particular, and as instructed: **no `qdb_collectioneligibility`**, **no
`qdb_communication` or per-channel communication entity**, no second auto-number table, no second
technical log.

---

## 4. KI-47 implementation evidence

| Checklist item | Evidence |
|---|---|
| Column added | `qdb_facilitysourcesystem`, String(50), provisioned via `qdb-entity-defs.mjs` |
| Not the only source of the source system | The snapshot key composition remains independent configuration; the column is populated from the observation, not parsed back out of the key |
| Entity Dictionary | `EntityDictionary.md` §I; `FieldDictionary-Transaction.md` snapshot table |
| Bindings | `qdbBindings.ts` → `SNAPSHOT.facilitySourceSystem` |
| Snapshot domain model | `packages/domain/src/snapshot.ts` — the canonical type already carried `facility.sourceSystem` |
| Repository | `DelinquencySnapshotRepository` writes and reads it |
| Sync service | Populated on every observation |
| Tests | `collection-repositories.test.ts`, `snapshot.test.ts`, Phase 2 smoke |
| Cloud provisioning / verification | `verify-qdb-schema.mjs` — **244/244** |
| **Cloud runtime validation** | Phase 3 smoke — *"KI-47: qdb_facilitysourcesystem exists on the snapshot, 50 characters — qdb_facilitysourcesystem(50)"* |
| On-prem compatibility | A string attribute with an explicit `MaxLength` is identical on 9.1 and Dataverse; no cloud-only construct used. **Static only — no on-prem runtime validation** (KI-08) |
| Migration implications | None. New rows only; existing rows null. **No historical or sandbox row was back-filled**, per the approval |
| Change Log | `ChangeLog.md`, 2026-09-18 Phase 3 entry, with its own table |
| Phase 1 + Phase 2 regression | 13/13 and 20/20, re-run after the change |

**KI-47 is closed.**

---

## 5. KI-49 — QDB auto-number evidence

What was looked at, live, on 2026-09-18:

| Source | Finding |
|---|---|
| `crmi_autonumberingsetup` (QDB's mechanism, with its live plugin) | **0 rows** |
| `qdb_autonumberconfig` | **0 rows** |
| `AutoNumberFormat` on any `qdb_` attribute | none — null throughout |

So there is no QDB numbering convention to follow and no configured mechanism to defer to. Per the
instruction, **no format was invented**. `qdb_casenumber` has exactly two configured sources
(ADR-DCP-15): `Provisional` — DCP composes `<sourceSystem>-<facilityNumber>-E<episode>` — or
`PlatformConfigured` — DCP omits the column and QDB's mechanism fills it. Switching is a configuration
change.

**Uniqueness is enforced by the platform, not by the composition.** Proved live: a second case with the
same number was refused by the alternate key — *"Entity Key Case Number violated. A record with the same
value for Case Number already exists."*

`verify-qdb-schema.mjs` additionally confirms QDB's mechanism is **present and unextended** and that no
cloud-only `AutoNumberFormat` was introduced.

**KI-49 stays open** on one point only: the business-facing format is `TBD — Requires QDB Confirmation`.

---

## 6. Rule Engine integration architecture

Full decision: **ADR-DCP-13**. Contracts: `APIContracts.md` §6A.

```
Collection service ──IRuleEngine──► RuleEngineClient ──ICrmAdapter.execute──► operation name
                                          │                                    (Custom API on cloud,
                                          │                                     Process Action on-prem)
                                          ├─ validates the response against its schema
                                          ├─ rejects an outcome outside the approved set
                                          ├─ rejects a decision with no RulesetVersion
                                          └─ logs every refusal to qdb_crmlogs, then rethrows
```

Two properties are load-bearing and enforced rather than intended:

- **No threshold crosses the seam.** Facts in, decision out. Enforced behaviourally
  (`strategy.test.ts`) and mechanically (`collection-portability.test.ts` scans every Collection source
  file for a comparison between a collections figure and a numeric literal; the zero boundary is allowed
  and documented because it is the definition of "past due", not a policy band).
- **It fails closed four ways:** operation not configured · ruleset code not configured · operation
  absent or throwing · response outside the contract. None of them yields a value.

Operation names, ruleset codes and the decision-to-operation map are all **configuration**
(`qdb_platformconfiguration` + `qdb_featureflags.ruleEngineOperations`), with no defaults in code.

---

## 7. Eligibility runtime evidence

**Stated plainly: no real eligibility decision has been taken, because the Rule Engine operation does not
exist yet (KI-48).** That is QDB's to create. What *is* proven:

| Proof | Result |
|---|---|
| The client calls the **configured** operation by name | ✅ unit + live |
| An unconfigured operation name is refused **before any call is made** | ✅ live — *"this deployment has not configured a Rule Engine operation…"* |
| An operation the organisation does not expose is refused, not defaulted | ✅ live — a deliberately non-existent Custom API |
| An outcome outside the approved set is refused | ✅ unit |
| A decision with no ruleset version is refused | ✅ unit |
| An empty response is refused rather than defaulted | ✅ unit |
| Missing eligibility configuration stops the organisation | ✅ unit + service |
| Every refusal reaches `qdb_crmlogs` with `rule_engine_unusable` | ✅ unit + live |
| The **full synchronisation pipeline** runs end to end against the organisation on all six outcomes | ✅ live, Phase 2 smoke 20/20, driven by `StubRuleEngine` — which holds no thresholds and labels every decision as its own |

---

## 8. Strategy configuration evidence

Live on `org5869857f`, through the built Integration Service:

| Check | Result |
|---|---|
| Strategy read with its criteria **as data** | `{"customerType":"Individual","dpdFrom":1,"dpdTo":30,"nplFlag":false}` |
| The ruleset selects the code; the service resolves the strategy | ✅ |
| A code with no configuration is refused **by kind** | *"The strategy ruleset selected 'NO-SUCH-CODE', which no Collection Strategy configuration defines"* |
| "No strategy applies" is a refusal, not a default treatment | *"The strategy ruleset returned no applicable strategy for this case"* |
| Both refusals reach the technical log with an actionable code | `strategy_NotFound`, `strategy_NoneApplicable` |

And in tests: deactivated strategy refused · strategy outside its effective window refused · two usable
strategies sharing the top priority refused as `Conflict` · a duplicate code broken by priority where one
clearly wins · the resolution logged with the ruleset version that chose it.

> **Open question (KI-51):** DCP treats the criteria columns as data the *ruleset* reads, not as a matcher
> DCP evaluates. If QDB expects DCP-side matching, the semantics — precedence, overlap, tie-breaking —
> would move into application source, which the authorisation forbids. **No matching logic was written**,
> so either answer remains reachable.

---

## 9. Strategy Action evidence

| Check | Result (live) |
|---|---|
| Actions read and linked to their strategy | 3 actions |
| Active actions returned in sequence order, the retired one omitted | `10:ACTION-FIRST, 20:ACTION-SECOND` |
| Communication channel read as a **label** from the provisioned choice | `SMS / Email` |
| Activity type resolved to its **code**, never a lookup GUID | ✅ (unit) |
| Equal sequence broken by name, so the order is stable rather than arbitrary | ✅ (unit) |

This is where **KI-52** was found: the actions initially came back unparented because the repository
selected the lookup's storage column. Fixed, audited repository-wide, and the dead bare bindings removed.

---

## 10. Assignment / Smart Assignment evidence

**DCP performs no routing, on any method** — ADR-DCP-14.

| Check | Result (live) |
|---|---|
| Assignment configuration read with its method as a label | `SmartAssignment`, ref `SMOKE-…-SAREF` |
| Smart Assignment refuses rather than inventing routing | *"…selects SmartAssignment, but QDB's Smart Assignment contract has not been supplied (KI-09). No routing is performed and none is invented…"* |

In tests: the provisioned method set is exactly the organisation's, not a superset · no active/effective
configuration is a refusal · a priority tie is a `Conflict` · the case is handed to the engine its
configuration names · a configured method with no engine wired is refused.

`IAssignmentEngine` is the only contract a future QDB adapter must satisfy, and it already has tests.
**Nothing has to be un-built when the capability arrives.**

---

## 11. Platform configuration / mapping evidence

| Check | Result (live) |
|---|---|
| `qdb_platformconfiguration` reads for the organisation | `customerEntity=contacts` |
| `qdb_platformmapping` child rows read through the same service | ✅ (Phase 2 + Phase 3 paths) |
| The Collection runtime configuration assembles | `policy=AllReceived key=[sourceSystem,facilityNumber,snapshotDate] numbering=Provisional` |
| A configured strategy ruleset code is returned | ✅ |
| An unconfigured Contact Hold ruleset **fails closed** | *"Organisation HL has no contactHold ruleset code configured (qdb_platformconfiguration.qdb_contactholdrulesetcode)"* |
| Configuration is cached, and `clearCache()` makes a published change take effect | ✅ (tests) |

**No unrelated QDB configuration or mapping entity was repurposed.**

Only two members of the runtime configuration have a fallback, and each is the conservative reading:
episode policy (*a re-delinquency starts a new episode* — the rule the architecture already states) and
case numbering (*DCP composes the interim number* — KI-49). A missing snapshot policy, eligibility
ruleset or key composition **stops the organisation**, naming the setting and the table.

---

## 12. Contact Hold configuration status

**Implementation ready — authoritative Contact Hold source configuration pending QDB confirmation (KI-44, FR-097).**

What exists: `qdb_contactholdrulesetcode` on `qdb_platformconfiguration`; `evaluateContactHold` on the
facade; the client sends **only identity and the channel being attempted**; an unreadable answer is a
**refusal to contact**, never `hold: false`; an unconfigured ruleset fails closed — proved live.

What was **not** done, exactly as instructed: no Contact field invented · no Account field invented · no
customer-master column added · **no deceased flag in the input**, so a hold can never be inferred from
QCB DEAD by accident · no provisional production rule hard-coded.

`StopContactQueueMover` remains configuration-driven via `ContactHoldSettings`; with no configured
attribute the guard is inactive rather than guessing one.

---

## 13. Test results — before and after

| Suite | Before Phase 3 (Phase 2 close) | After Phase 3 | Change |
|---|---|---|---|
| `@dcp/domain` | 164 | **199** | +35 — the Rule Engine contracts, strategy resolution, assignment, case numbering |
| `@dcp/api` | 129 | **188** | +59 — the client, the two services, the runtime configuration, the threshold guard |
| `@dcp/dataverse-client` | 27 | **27** | unchanged |
| `@dcp/auth-adapters` | 14 | **14** | unchanged |
| **TypeScript total** | 334 | **428** | **+94** |
| Tooling (`crm/scripts/lib/*.test.mjs`, node:test) | 10 | **10** | unchanged |
| C# plugin tests | 129 | **129** | unchanged — Phase 3 changed no plugin |
| Type-check + build (turbo) | 13/13 | **13/13** |
| `verify-qdb-schema.mjs` | 19/19 · 243 columns | **19/19 · 244 columns** |
| `smoke-qdb-plugins.mjs` (Phase 1) | 13/13 | **13/13** |
| `smoke-qdb-phase2.mjs` (Phase 2) | 20/20 | **20/20** |
| `smoke-qdb-phase3.mjs` | — | **19/19** |

**No existing test was weakened.** Two were corrected because they had become wrong (§1). One guard was
strengthened: the portability scan now also fails the build on any DPD, arrears, exposure, bucket or
balance threshold in Collection source.

---

## 14. Cloud runtime evidence

All of the following ran against `org5869857f` with the **built** Integration Service (`apps/api/dist`),
not a test double — the same code path a deployment would run:

`smoke-qdb-phase3.mjs` — **19/19**, covering strategy read and resolution, ruleset-driven selection, the
named refusals reaching `qdb_crmlogs`, action ordering and activation, the channel label, assignment
method and the Smart Assignment refusal, both Rule Engine fail-closed paths, platform and runtime
configuration assembly, the Contact Hold refusal, the KI-47 column, case creation with the provisional
number, and duplicate refusal by the alternate key.

Cleanup: every row carries the `SMOKE-` marker; the run reports **"0 smoke record(s) remain"** and
re-verifies that the three `ImmutabilityGuard` Delete steps are **enabled and unfiltered** afterwards.
Only the minimum `qdb_` guard steps were ever disabled, and the legacy `msst_` guard was never touched.

Raw transcripts: `docs/evidence/Phase3_smoke_run.txt`, `Phase3_verify_schema.txt`,
`Phase1_smoke_rerun.txt`, `Phase2_smoke_rerun.txt`.

---

## 15. On-prem compatibility status

**Static only. No Phase 3 code has been executed against an on-premises organisation** — that remains
KI-08 and is unchanged by this phase.

| Concern | Position |
|---|---|
| Rule Engine operations | Invoked by name through `ICrmAdapter.execute`; Custom API on cloud, Process Action on-prem. Nothing in the services knows which |
| KI-47 column | String with explicit `MaxLength` — identical on 9.1 and Dataverse |
| Case numbering | Both sources are platform-neutral; `PlatformConfigured` defers to whatever the organisation has |
| Configuration reads | Ordinary entity reads, no cloud-only OData construct |
| Alternate key | Already provisioned and verified in Phase 1 |
| Enforced by | `dual-platform.test.ts`, `collection-portability.test.ts`, and the `DV_API_VERSION` parameterisation from Phase 1 |

What would settle it is an on-prem organisation to deploy to, which the project does not yet have.

---

## 16. Remaining TBDs

| # | Item | Owner | Blocks |
|---|---|---|---|
| 1 | **The three Rule Engine operations and their rulesets do not exist** (KI-48) | QDB | any real eligibility, strategy or hold decision |
| 2 | **Smart Assignment's contract has not been located** (KI-09) | QDB | all routing |
| 3 | **The authoritative Contact Hold source is unconfirmed** (KI-44) | QDB | FR-097 enforcement |
| 4 | **The business-facing case number format** (KI-49) | QDB | nothing — interim numbering works |
| 5 | **Whether the strategy ruleset or DCP matches the criteria columns** (KI-51) | QDB | nothing today; would change where matching lives |
| 6 | **Snapshot key composition per deployment** — configuration with no default, by design | QDB per deployment | a deployment's first sync run |
| 7 | **On-prem runtime validation** (KI-08) | project | on-prem deployment |

---

## 17. Known Issues and Risks

**Closed in Phase 3:** KI-46 (cure path — ADR-DCP-12), KI-47 (snapshot source system), KI-52 (the lookup
`$select` defect — fixed and audited).

**Open and updated:** KI-48 (DCP side complete; operations are QDB's), KI-49 (DCP side complete; format
TBD), KI-44, KI-09, KI-08, KI-50.

**Raised:** KI-51 (who matches the strategy criteria), KI-52 (closed same phase, rule retained).

**New risks:** R-P3-1 … R-P3-5 in `RiskRegister.md` — the substantive one being that **no Collection
decision can actually be taken until QDB creates the rulesets and operations.** That gap is loud, logged
and visible by design rather than papered over with a default.

---

## 18. Schema deviations

**One deviation from the approved dictionary, and it was the approved one:** the KI-47 column.

No other deviation. Everything else Phase 3 needed already existed from Phase 1 — the strategy, strategy
action, assignment configuration, platform configuration and platform mapping tables, the
`qdb_assignment_method`, `qdb_trigger_event` and `qdb_communication_channel` choices, and the three
ruleset-code columns on `qdb_platformconfiguration`. Nothing had to be added to make Phase 3 work, which
is the first real evidence that the Phase 1 dictionary was right.

---

## 19. Demo / replay steps

```bash
# from projects/debtcollection, with the sandbox credentials in the env file
npm run build

# 1. the schema, including the KI-47 column (19/19, 244/244)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra QDB_OPTION_VALUE_PREFIX=10000 \
  node --env-file=<env> crm/scripts/verify-qdb-schema.mjs

# 2. Phase 1 plugin behaviour, unchanged (13/13)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-plugins.mjs

# 3. Phase 2 core model and the cure path (20/20)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-phase2.mjs

# 4. Phase 3 configuration and decisions (19/19)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-phase3.mjs

# add --keep to step 4 to inspect the seeded configuration before it is removed;
# clean-qdb-smoke-data.mjs --confirm removes it afterwards.
```

Each script refuses to run against any organisation but `org5869857f`, and each cleans up after itself.

**The three moments worth watching** are the refusals, because they are what the phase is about: a
strategy code with no configuration, Smart Assignment declining to route, and the Rule Engine declining
an operation the deployment never configured.

---

## 20. Proposed Phase 4 scope — for approval, not started

Offered as a proposal only. **Nothing below has been begun.**

| Candidate | Why it is next | Depends on |
|---|---|---|
| **MIS API integration** (`IMisDelinquencyService` real provider, batch orchestration, scheduling, retry, run reporting) | Phase 2 built the pipeline and Phase 3 configured it; the only thing still feeding it is a mock | MIS contract confirmation |
| **Collection Workspace (React)** — case list, case view, activity capture, timeline | The first thing an officer actually touches; every underlying model now exists | ADR-DCP-07; Form Engine reuse |
| **Communications execution** — SMS/WhatsApp → Fax, Email → Email, Warning Letter → QDB document capability, and the unified Communication History **read model** | Architecture is settled (KI-45); Phase 3 deliberately built none of it | Contact Hold source (KI-44) |
| **Strategy execution** — turning resolved strategy actions into scheduled Collection activities | The configuration is now readable and ordered; execution is the next layer | Rule Engine operations (KI-48) |
| **PTP lifecycle and evaluation** | Modelled in Phase 2, unexercised | MIS positions |

A reasonable Phase 4 is **MIS integration + strategy execution**, leaving the workspace and
communications to Phase 5 — but that is the gate's call, not mine.

---

## Stopping here

Phase 3 is complete, evidenced and committed. **Phase 4 has not been started and will not be without
explicit approval.**
