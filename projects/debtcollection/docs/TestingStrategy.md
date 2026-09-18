# DCP — Testing Strategy (Phase 0)

**Status:** Phase 0 baseline + forward strategy · 2026-09-17 · Master Prompt §78–82, §87; Correction
Prompt §1, §37, §43. Nothing in this document changes code or tests; it records the actual current
state and the protocol every later phase must follow.

---

## 1. Phase 0 test baseline — actual state, not aspiration (MP §87)

Captured 2026-09-16/17 from the consolidated directory `projects/debtcollection/` after the worktree
move (`npm ci` + `dotnet build` from the new location). No test was changed to make the baseline green.

| Suite | Runner | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| `Qdb.DebtCollection.Plugins.Tests` (renamed from `Msst.*` in Phase 1) | xUnit + Moq, net471 | **92** | 0 | 0 | 78 `[Fact]`/`[Theory]` + 16 `[InlineData]` rows; runs in ~1 s |
| `@dcp/api` | Vitest | **19** | 0 | 0 | all network mocked (`vi.mock`) |
| `@dcp/auth-adapters` | Vitest | **14** | 0 | 0 | mock OIDC issuer; **AD FS never proven against a real endpoint** (COND-008) |
| `@dcp/dataverse-client` | Vitest | **12** | 0 | 0 | |
| Live smoke `crm/scripts/smoke-plugins.mjs` — cloud org5869857f | node script | **14** | **1** | — | failure = queue move; `msst_dcpcollectioncase.IsValidForQueue = false` (MP §59) |
| Live smoke — on-prem 9.1 | — | — | — | — | **never run**: no on-prem org for DCP, and the scripts authenticate only against Entra ID |

Known environmental limits recorded, not hidden:

- The API data routes (`GET /customers/:qid`, `GET /identity-exceptions`) need a *user* bearer token
  that cannot be minted headlessly; the HTTP path is unproven end-to-end. The service layer beneath them
  is proven against live Dataverse rows.
- Every "live" result above is **Cloud Runtime Tested**. Nothing is On-Prem runtime tested.
- The smoke script writes into tables the `ImmutabilityGuard` protects and cannot clean up after itself.
  The shared sandbox now holds 13 customers / 15 cases / 10 snapshots / 60 audit rows of `SMOKE`/`DIAG`
  data. **Lesson (binding): a test that cannot undo itself must not target a shared org.** Future smoke
  runs go to a dedicated org or are preceded by a documented, approved cleanup path.

---

## 1A. Phase 1 test result — measured 2026-09-17, after the retarget

The Phase 0 baseline above is kept as written. This is what the same suites report after Phase 1,
alongside the two new live scripts.

| Suite | Runner | Passed | Failed | Change against baseline |
|---|---|---|---|---|
| `Qdb.DebtCollection.Plugins.Tests` | xUnit + Moq, net471 | **105** | 0 | +13. The `msst_` fixtures were migrated to `qdb_`, not deleted; two `ImmutabilityGuard` cases that asserted immutability on the retired `msst_dcpauditlog` were replaced by cases asserting the guard leaves unowned tables alone, and 10 new `ContactHoldSettings` cases plus 3 promise-default cases were added |
| `@dcp/api` | Vitest | **49** | 0 | +30, of which 14 cover `PlatformConfigurationService` |
| `@dcp/domain` | Vitest | **30** | 0 | +13, covering platform-configuration resolution |
| `@dcp/dataverse-client` | Vitest | **27** | 0 | +11, covering `DataverseCrmAdapter` |
| `@dcp/auth-adapters` | Vitest | **14** | 0 | unchanged |
| Tooling (`crm/scripts/lib/*.test.mjs`) | node:test | **10** | 0 | unchanged |
| Live schema verification `crm/scripts/verify-qdb-schema.mjs` — cloud `org5869857f` | node script | **19** | 0 | new |
| Live smoke `crm/scripts/smoke-qdb-plugins.mjs` — cloud `org5869857f` | node script | **13** | 0 | new. The Phase 0 smoke failure (queue move) does not recur: `qdb_collectioncase` was created with `IsValidForQueue = true` |
| Live smoke — on-premises 9.1 | — | — | — | **still never run**: no on-premises organisation for DCP (KI-22) |

### What the live smoke caught that the unit tests could not

`ImmutabilityGuard` had 30 green unit tests and still failed to protect a completed activity on the
organisation: the *step* was registered with `filteringattributes=statecode`, so editing any other
column never invoked the plugin at all. No unit test can see this — the defect is in the
registration, not the logic (KI-40). It is the clearest case yet for the rule below.

**Binding: a control is not proven until it has been exercised through its registration on an
organisation.** A green unit suite says the code is right; only the live script says the platform
will call it.

### Residue, and the rule from Phase 0 applied

The Phase 0 lesson — *a test that cannot undo itself must not target a shared org* — could not be
fully honoured here: proving `ImmutabilityGuard` means creating rows the guard then refuses to let the
test delete. The compromise is explicit rather than silent: `smoke-qdb-plugins.mjs` creates the
minimum, deletes everything the guard permits, and prints what it could not remove. Current residue:
3 cases, 2 snapshots, 2 completed activities, all named `SMOKE-…` (KI-42).

---

## 1B. Phase 2 test result — measured 2026-09-18

| Suite | Runner | Passed | Failed | Change against Phase 1 |
|---|---|---|---|---|
| `@dcp/domain` | Vitest | **164** | 0 | +134: case matrix (with C# parity), activity/PTP matrix (with C# parity), MIS observation and facility identity, customer resolution rules, episode rules, snapshot key composition, activity correlation, Collection settings |
| `@dcp/api` | Vitest | **129** | 0 | +80: the synchronisation pipeline end to end over an in-memory organisation (real repositories, real services), repositories and resolution service, the portability guard, configuration feature flags |
| `@dcp/dataverse-client` | Vitest | **27** | 0 | unchanged |
| `@dcp/auth-adapters` | Vitest | **14** | 0 | unchanged |
| Tooling (`crm/scripts/lib/*.test.mjs`) | node:test | **10** | 0 | unchanged |
| `Qdb.DebtCollection.Plugins.Tests` | xUnit + Moq | **129** | 0 | +24: `ActiveCaseGuard` (7), the Settled universal target (17); one existing test re-pointed from New → Settled to New → Closed because the former is now legal |
| Live verification `verify-qdb-schema.mjs` — cloud `org5869857f` | node script | **19** | 0 | 12/12 steps after the guard registration |
| Live smoke `smoke-qdb-phase2.mjs` — cloud `org5869857f` | node script over `apps/api/dist` | **20** | 0 | new — see below |
| Live smoke `smoke-qdb-plugins.mjs` (Phase 1) | node script | **13** | 0 | still passes |
| Live smoke — on-premises 9.1 | — | — | — | **still never run**: no on-premises organisation for DCP (KI-22) |

Nothing was deleted or weakened. The `msst_`-bound legacy tests (`customers.test.ts`, `identity-exceptions.test.ts`, `AuditLogWriterTests`, `StopContactQueueMoverTests`) are untouched and green.

### What the Phase 2 smoke proves, and how

`smoke-qdb-phase2.mjs` imports the **built Integration Service** (`apps/api/dist`) and runs the real
`DelinquencySyncService`, repositories and `DataverseCrmAdapter` against the organisation — the code
that will run in production, not a re-implementation for the test. Twenty checks, in order: platform
configuration and feature flags read from `qdb_platformconfiguration`; a MIS observation becomes a
case bound to the contact through the Customer lookup, identified by facility number and source
system with no facility record consulted, opened at New by the plugin, with the cached position and a
linked snapshot; a replay updates the case and writes **no** second snapshot (alternate key); a bucket
move writes one; a second active case for the facility is **refused by `ActiveCaseGuard`**; a second
facility for the same customer gets its own case; a promise to pay opens Active, is kept, completed
and then frozen by `ImmutabilityGuard`; a cure moves a New case to Settled (the matrix amendment,
live); closure followed by re-delinquency opens episode 2; an unknown customer and a malformed facility
identity become exception rows and no case; a GraceMonitor decision keeps a snapshot without a case.
Every row is removed afterwards by `clean-qdb-smoke-data.mjs`, the guards are restored and re-verified,
and the run ends with **0 smoke records**. Evidence: `docs/evidence/Phase2_smoke_run.txt`.

### Two rules that earned their keep

- **The in-memory organisation refuses OData it does not understand.** A repository cannot start
  relying on a filter the fake happens to ignore; the test breaks instead.
- **Navigation property names are read from the organisation, not inferred.** The snapshot's case
  lookup is `qdb_collectioncaseid` while the activity's is
  `qdb_collectioncaseid_qdb_collectionactivity` — the platform suffixes only when a second relationship
  targets the same table. The first smoke run caught this; the unit tests could not.

---


## 1C. Phase 3 test result — measured 2026-09-18

| Suite | Files | Tests | Result |
|---|---|---|---|
| `@dcp/domain` | 14 | **199** | pass |
| `@dcp/api` | 12 | **188** | pass |
| `@dcp/dataverse-client` | 3 | **27** | pass |
| `@dcp/auth-adapters` | 2 | **14** | pass |
| Tooling (`crm/scripts/lib/tooling-auth.test.mjs`, node:test) | 1 | **10** | pass |
| **TypeScript total** (excluding tooling) | **31** | **428** | pass — **+94 against the Phase 2 close (334)** |
| C# `Qdb.DebtCollection.Plugins.Tests` | 1 assembly | **129** | pass |
| Type-check + build (turbo) | 13 tasks | — | pass |

| Live suite (sandbox `org5869857f`) | Result |
|---|---|
| `verify-qdb-schema.mjs` | **19/19**, canonical columns **244/244** |
| `smoke-qdb-plugins.mjs` (Phase 1 regression) | **13/13** |
| `smoke-qdb-phase2.mjs` (Phase 2 regression) | **20/20** |
| `smoke-qdb-phase3.mjs` (new) | **19/19** |

Every live suite removes its own rows; all three report *0 smoke record(s) remain*, and the Phase 3
suite re-verifies that the three `ImmutabilityGuard` Delete steps are enabled and unfiltered afterwards.
**No existing test was weakened.** Two existing tests were *corrected* because they had become wrong:

- the Phase 1 transition assertion still encoded the pre-KI-46 matrix, using `New → Settled` as its
  example of a refusal. It now asserts `New → In Progress`, which is still refused, and the Settled path
  is proved by the Phase 2 smoke's cure check;
- the Phase 2 smoke was wired to the eligibility evaluator that Phase 3 replaced with the Rule Engine
  facade.

### What Phase 3 added to the strategy

**A source-level guard for policy thresholds** (`collection-portability.test.ts`). Every file under
`services/collection` and `packages/domain/src` is scanned for a comparison between a collections figure
— DPD, arrears, exposure, bucket, balance, instalment — and a numeric literal. The zero boundary is
allowed and documented, because it is the arithmetic definition of "past due at all", not a policy band.
This is the mechanical half of *"no thresholds in application source"*; the behavioural half is
`strategy.test.ts`'s "carries criteria as data without interpreting them".

### The lesson Phase 3 paid for — KI-52

`StrategyRepository` selected lookups by their storage column (`qdb_strategyid`). Dataverse accepts that
and returns nothing for it, so **every strategy resolved with zero actions**. The unit tests passed
throughout, and they were right to: the in-memory fake answers with whichever column the code asks for,
so the fake and the code shared the same wrong belief.

This is the second instance of the same class — Phase 2 found that a navigation property name cannot be
inferred either. The standing rule is therefore:

> **A column's read name, write name and storage name are read from the organisation, never inferred.**

And the structural mitigation is the one that actually worked: **a live smoke per phase, run against the
real organisation, which no fake can satisfy by agreeing with the code.**


## 1D. Standing requirement — Dataverse query behaviour needs real Dataverse evidence (from KI-52, mandatory Phase 4 onward)

KI-52 is closed as a defect. The finding it produced is not, and it is the reason this section exists.

### What KI-52 actually demonstrated

`StrategyRepository` selected a lookup by its storage column (`qdb_strategyid`). Dataverse accepts
that and returns nothing for it, so every strategy resolved with **zero actions**. Every unit test
passed the whole time — and they were not badly written. The in-memory `FakeCrmAdapter` answered with
whichever column the code asked for, so:

> **An in-memory or fake adapter can validate the same incorrect assumption as the production code.**

A mock encodes the author's belief about the platform. When that belief is wrong, the mock agrees with
the code and the test proves only that the code is self-consistent. No amount of unit testing closes
this gap, because the gap *is* the shared assumption.

This was the second instance. Phase 2 found the same class in navigation property names — a lookup's
navigation name is bare when one relationship targets the table and `_<referencingEntity>`-suffixed
when two do, and it is not inferable either.

### The requirement

From Phase 4 onward, **platform-specific query behaviour must not rely solely on mocked or in-memory
tests.** Where the Cloud sandbox permits it, add real Dataverse integration or smoke evidence for:

| Behaviour | Why a mock cannot settle it |
|---|---|
| lookups and `_<column>_value` | the storage column is accepted and returns nothing — KI-52 |
| navigation properties | bare vs `_<referencingEntity>` suffix depends on how many relationships target the table |
| `$select` | an unselected column is absent, not null; a mis-named one is silently ignored |
| `$expand` | depth, cardinality and the `$select` inside an expand each behave differently from the flat case |
| `$filter` | operator support, type coercion, null semantics and casing are the platform's, not ours |
| `$orderby` | which columns are sortable, and how nulls and formatted values order |
| paging | page size is a request, not a promise |
| `@odata.nextLink` | an opaque continuation token — reconstructing it is the defect this rule exists to prevent |
| alternate keys | the refusal text, the status code and which write paths the key actually governs |
| formatted values | the annotation is only present when asked for, and the raw and formatted values differ |
| FetchXML, where used | paging cookie semantics differ from OData continuation entirely |

### How the two layers divide

**Neither layer replaces the other, and the unit tests are not to be weakened.**

| Layer | Answers | Runs |
|---|---|---|
| Unit / domain (Vitest, in-memory adapter) | *Is the logic right?* — decisions, ordering, refusals, idempotency, error handling | every commit, seconds |
| Targeted Dataverse integration / smoke | *Is our belief about the platform right?* — the table above | per phase against `org5869857f`, and on demand |

A fast unit test suite is what makes the integration suite affordable: the live run only has to cover
the platform's behaviour, not the domain's.

### Rules for the live evidence

- Every live test names the organisation it ran against and refuses to run against any other.
- Every live test cleans up what it creates, and proves it — "0 smoke record(s) remain".
- A live test asserts the platform's *observed* behaviour, including its error text, rather than what
  the documentation says it should be.
- Where the sandbox genuinely cannot exercise something, say so in the phase report rather than
  substituting a mock and calling it runtime evidence.

## 2. Test pyramid per layer (target)

| Layer | Framework | Scope | Isolation rule |
|---|---|---|---|
| C# plugins (`Qdb.DebtCollection.Plugins`) | xUnit + Moq over `IOrganizationService` | status matrix, guards, defaults, composer, queue mover, technical log | pure unit; no org |
| TypeScript services / SDK / adapters | Vitest | Collection services, canonical models, `ICrmAdapter`, `IMisDelinquencyService`, auth adapters, MIS normalisation | mocked transport only at the boundary |
| **MIS contract tests** | Vitest | the same suite executed against `MockMisDelinquencyService` **and** `ApiMisDelinquencyService` (when a QDB endpoint exists) | proves both providers return identical canonical types (CP §23, §37) |
| React workspace | Vitest + Testing Library (unit), Playwright (E2E) | components against `ICrmAdapter` fakes; E2E against a real org via the web resource | no platform branch in tests either |
| Live smoke per org | node scripts (Entra) / PRT + AD-authenticated scripts (on-prem) | schema present, plugins fire, queue move, immutability, audit/log, MIS sync round trip | one script, two auth adapters (CP §2) |
| Regression | all of the above | every accepted feature re-run after each phase from Phase 1 onward (MP §81) | |

Coverage floor stays at 80 % on plugin and service code (NFR-016). Every new API endpoint: happy path +
validation failure + auth failure minimum.

---

## 2A. Collection Eligibility and configuration-driven testing (F1, F2, F6, F9, F10)

A MIS delinquency record is not a Collection Case. The **Collection Eligibility / Grace** stage sits between
identity/facility resolution and case creation, and is a Rule Engine ruleset rather than code
(`APIContracts.md` §3A.2, ADR-DCP-11). It therefore has its own test obligations.

**Outcome contract tests.** The eligibility suite exercises all six `qdb_eligibility_outcome` values —
`EligibleCreateCase`, `ExistingEpisodeUpdate`, `GraceMonitor`, `ExcludedSpecialHandling`,
`IdentityException`, `FacilityException` — and runs **against `MockMisDelinquencyService` and
`ApiMisDelinquencyService` alike**, as part of the MIS contract suite in §2. Both providers must drive the
same decisions from the same canonical input. Each test asserts the decision *and* its audit trail
(`qdb_eligibilityoutcome`, reason, ruleset code, ruleset version, evaluated-on), including the case where no
Collection Case is produced but history is still written per `qdb_snapshotpolicy`.

**Snapshot policy must be measured, not assumed (gate correction 3).** `qdb_snapshotpolicy` has **no
approved production default**. The Mock MIS suite must therefore run the same delinquency feed under
`AllReceived`, `EligibleOnly` and `ChangedOnly` and **compare** them on six axes, producing evidence
rather than an opinion:

| Axis | What is measured |
|---|---|
| Record volume | snapshots persisted per sync and per month, including the technical-delinquency population |
| Auditability | can every eligibility decision — especially `GraceMonitor` — still be explained afterwards? |
| Replay behaviour | re-running a batch produces no duplicates under each policy |
| Storage growth | projected row growth over 12 months at HL volumes |
| Case-creation behaviour | identical under all three (policy must affect history only, never case creation) |
| Change detection | is a genuine bucket/DPD/arrears movement still detected and dated correctly? |

The binding constraint under test: a `GraceMonitor` decision must stay auditable **without forcing every
unchanged MIS record to generate a new snapshot forever**. A policy that re-persists identical unchanged
observations on every sync fails this test even though it "works".

**Replay idempotency must hold under every candidate key composition (gate correction 2).** The physical
`qdb_snapshotkey` composition is `TBD`, so the suite tests the *requirement*, not one formula: for each
candidate composition (facility + financial as-of; + DPD as-of; + source timestamp; + source record
version; with and without batch id) a replayed batch, a duplicate delivery and a post-failure reprocess
must each yield **no second snapshot**. A composition that includes the batch id unconditionally is
expected to *fail* the replay test — that is the point of testing it rather than assuming it.

**No threshold may be an expected constant.** This is a binding rule, not a style preference. A test must
never assert a DPD number, an arrears ratio, a bucket boundary, a segmentation cut-off or a contact-hold
condition as a literal expectation. Thresholds are supplied by **test configuration** (a fixture ruleset),
and the assertion is on the *behaviour given that configuration* — for example "with grace ruleset R1 this
record yields `GraceMonitor`; with R2 the same record yields `EligibleCreateCase`". Consequences:

- a test that fails when the business changes a threshold is a defective test, not a defect;
- changing a threshold in configuration must alter the outcome **with no code change and no test edit**
  beyond the fixture;
- the same rule applies to segmentation boundaries (F1), grace criteria (F2), contact-hold conditions (F6),
  exposure usage (F9) and KPI targets (F10). None is a compiled constant, so none is a test constant.

**HL vs BFD configuration variance.** The build is one; the configuration is not. The suite runs the same
code twice — once with an HL ruleset and once with a **materially different** BFD ruleset (different
criteria, different thresholds, exposure enabled for BFD and disabled for HL, different identifier rules) —
and both must pass. A test that only passes under HL numbers has encoded HL policy and fails review.
Statistical findings from the Housing Loan dataset may seed **HL fixtures and test scenarios only**; they
must never become assertions about BFD behaviour.

**Dual-platform.** The eligibility ruleset is invoked through `IRuleEngine` behind the same operation surface
on both targets (Custom API on cloud, Process Action on-prem). The eligibility suite is therefore part of the
portability set in §4: same artefacts, both targets, configuration and adapter selection the only difference.

---

## 3. Tests coupled to `msst_` names — handling rule (MP §81)

The current TS suites hard-code `msst_dcpcustomers`, `msst_stopcontact` (zod schema) and other
`msst_` names; the C# tests assert `msst_` attribute names in `StatusTransitionMatrix`,
`AuditLogWriter`, `StopContactQueueMover`. When the `qdb_` schema lands they **will fail**. They are
**not deleted**. Each failing test is classified once, in the tracker:

| Classification | Action | Example |
|---|---|---|
| Requirement still valid | fix the implementation / rename constants, keep the assertion | status matrix transitions; immutability; default status |
| Requirement changed | update the test and document why | stop-contact guard now reads `contact.qdb_stopcontact`, not `msst_dcpcustomer.msst_stopcontact` |
| Component retired | retire the test with a traceability note | `AuditLogWriterTests` field-change cases (business audit → native audit); `msst_dcpcommunication` composer/guard cases; `CustomerService.findCustomerByQid` against `msst_dcpcustomer` |

No test is removed "because the architecture changed"; only because its component is retired.

**Applied in Phase 1 (2026-09-17).** Every migrated test landed in the first row of that table —
the requirement held, the names changed. Two cases fell into the third: `ImmutabilityGuard` asserting
immutability on `msst_dcpauditlog`, which the canonical schema retires in favour of native audit. They
were replaced, not dropped, by cases asserting the guard leaves tables it does not own alone, so the
suite count did not fall. `AuditLogWriterTests` (20) and the queue-mover tests were migrated and kept
in full because both components still run in the `msst_` deployment — see KI-43 and KI-44 for the
decisions that would retire them.

The second row's example is now out of date in one detail worth stating plainly: the guard does not
read `contact.qdb_stopcontact`. The canonical schema owns no customer master, so the column is
deployment configuration and the tests configure it explicitly rather than naming a QDB column.


---

## 4. Dual-platform testing protocol (MP §82, CP §1, §43)

Both targets are equal. For every major feature the tracker carries separate columns and the statuses
below are the only permitted values:

| Column | Values |
|---|---|
| Cloud Runtime Test Status | Not Started · In Progress · Cloud Runtime Tested · Failed |
| On-Prem Runtime Test Status | Not Started · In Progress · On-Prem Runtime Tested · Failed |
| On-Prem Compatibility by Design | Yes / No / Unknown — with evidence pointer |
| Cloud Compatibility by Design | Yes / No / Unknown — with evidence pointer |
| Shared Source Confirmed | Yes / No (a `No` requires a Platform-Specific Component row) |
| Portability Status | *Cloud Runtime Tested · On-Prem Compatible by Design — Runtime Test Pending* (today's default) · **Dual-Platform Ready** (only after both runtime tests pass) |

Rules: never mark On-Prem as runtime tested without an actual on-prem run; "compatible by design" needs a
stated reason (e.g. net471 + sandbox-safe + Process Action surface); a component with any `if (cloud)`
in Collection code cannot be marked Shared Source Confirmed.

Portability test itself: the **same build artefacts** are deployed to both targets; the only inputs that
differ are configuration, adapter selection and the deployment package. A functional test passing on one
target with a different source build does not count.

---

## 5. Test categories per phase (MP §78–80)

**Functional** — happy/negative paths; mandatory fields; validation; status transitions; assignment;
approval/reject/return/escalation; PTP and broken PTP; communication; contact hold / stop-contact; deceased
handling; **collection eligibility and grace outcomes**; MIS create/update/closure; duplicate prevention;
HL (Contact) and BFD (Account) paths; facility mapping; strategy; security.

**Technical** — CRM API failure; MIS unavailable; timeout; retry; duplicate messages; idempotency;
missing customer/facility; identity exception; concurrent update; pagination; high volume (≈5,000
accounts); invalid configuration/mapping; React and plugin exceptions; communication failure; queue
failure; integration failure; logging; browser compatibility; performance; deployment; portability.

**Security** — roles (Collection Officer, Manager, Head of Collections, specialist roles, Admin,
Audit/Compliance, unauthorised CRM user) × privileges (read/create/write/delete/assign/append/append-to/
approval) × surfaces (customer, facility, case, activity, communication, direct web-resource URL, API,
record-id manipulation, field security, team and BU access).

**Regression** — from Phase 1 onward, all accepted features re-run before a phase is marked complete.

**Performance** — Customer 360 / case list < 2 s p95 (NFR-001); MIS sync for the full book < 30 min
(NFR-002); dashboard uses `GetArrearBreakdown()` rather than detail rows (CP §34); never load the whole
portfolio into the browser (MP §67).

---

## 6. Demo per phase (MP §77)

A phase is not complete because it compiles or because the suite is green. Each phase produces
`docs/phases/Phase_<N>_Demo.md` with exact steps and expected results, executed against a real org, with
evidence captured. Prototype/mock screens are never demonstrated as implemented functionality (MP §74).

---

## 7. Definition of done for testing (MP §101)

Unit + functional + technical + security (where applicable) + regression passed · critical defects = 0 ·
high defects resolved or formally accepted · On-Prem and Cloud status columns updated · portability status
updated · tracker updated · demo executed and feedback recorded. Only then "Complete".
