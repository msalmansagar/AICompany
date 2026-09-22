# Phase 4 — MIS Integration Architecture & Processing Pipeline: Completion Report

**Status:** **MIS Integration Architecture & Processing Pipeline Complete — Production MIS Transport Contract Pending QDB**

**Date:** 2026-09-18 · **Branch:** `feat/dcp-phase4-mis-integration`, from the approved Phase 3 baseline `77ed073e`
**Organisation:** `org5869857f` (Cloud sandbox, the only one authorised)
**Stopping at the Phase 4 gate. Phase 5 has not been started.**

| Target | Status |
|---|---|
| Cloud Dataverse | **Runtime Tested** (Phase 4 smoke 22/22) |
| MIS production API | **Not Tested — Contract Pending QDB** (KI-53) |
| Dynamics 365 CE 9.1 on-premises | **Compatible by Design — Runtime Test Pending** |

Every figure below was produced by a run in this session or read back from the organisation. Where
something is not proven, it says so.

---

## 1. Implementation summary

Phase 4 connects authoritative MIS delinquency information to the Collection domain built in Phases
1–3 — as far as it can be connected, which is precisely as far as the evidence allows.

**The finding that shaped the phase:** before writing anything, the whole machine was searched for the
MIS contract — this repository, the wider AICompany repository, and `D:/QDB/Projects/` including the
Debt Collection Platform folder. **No MIS API exists in evidence.** No endpoint, schema,
authentication, paging mechanism, continuation semantics, change feed, retry contract, rate limit,
source timestamp or record identifier. The only MIS evidence anywhere is **two spreadsheet report
exports**, which were then read directly: 4,359 rows, as-of 30/06/2026.

That material is **MIS data evidence**. It is not evidence of a **MIS transport contract**, and Phase 4
keeps the two apart everywhere — in the code, in the tests, in the tracker and in this report's title.

Six things were built:

1. **Server-side paging as a platform contract**, designed from measured Dataverse behaviour rather
   than documentation.
2. **MIS contract evidence analysis**, classifying every finding Confirmed / DCP abstraction / Mock
   assumption / TBD.
3. **Canonical normalization**, the boundary no raw payload crosses, answerable to the real data.
4. **Three MIS providers** behind one interface — a substantial mock, a production boundary that
   refuses, and a live/cached wrapper.
5. **Restartable background synchronisation**, incremental by page, checkpointing after persistence.
6. **Strategy orchestration** on the Phase 3 Rule Engine facade.

---

## 2. Effort estimate versus actual

**Original estimate: 19.0 hours. Unmodified — no re-estimation was issued.**

| | Hours |
|---|---:|
| **Original estimate** | **19.00** |
| Actual wall-clock elapsed | **5.650** |
| Inactive / blocked (two approval waits) | **0.867** |
| **Effective Claude execution** | **4.783** |
| **Variance against effective execution** | **−14.217** |
| **Percentage of original estimate consumed** | **25.2 %** |

| Work package | Estimated | Actual effective | Variance |
|---|---:|---:|---:|
| Server-Side Paging | 2.50 | 1.127 | −1.373 |
| MIS Contract Analysis | *(within Normalization)* | 0.376 | — |
| MIS Normalization | 1.50 | 0.113 | −1.011 combined |
| MIS Adapter / Fallback | 2.00 | 0.374 | −1.626 |
| Background Sync + Checkpoint/Restart | 2.00 | 1.544 | −0.456 |
| Strategy orchestration + Idempotency/Replay | 2.50 | 0.690 | −1.810 |
| Cloud Runtime Validation | 1.50 | 0.109 | −1.391 |
| Documentation / Gate Evidence | 2.00 | 0.450 | −1.550 |
| Filtering/Sorting · Automated Testing · Regression | 5.00 | *(distributed — written alongside each package)* | — |
| **TOTAL** | **19.00** | **4.783** | **−14.217** |

**Calibration for Phases 5–11:** the four fastest packages leaned on Phase 1–3 foundations that Phase 5
does not have. The slowest — background synchronisation at 77 % of its estimate against an average of
about 25 % — is the better predictor for genuinely new work, and Phase 5 is genuinely new. Blocked time
was 15 % of wall-clock across two gates. Full notes in `docs/evidence/Phase4_timing.md`.

Full per-work-package detail, segment ledger and percentage consumed are in §22a and in
`docs/evidence/Phase4_timing.md`, which was written as the phase ran rather than afterwards, with
every boundary taken from a git commit timestamp.

---

## 3. Repository changes

### Added — domain (`packages/domain/src/`)

| File | Purpose |
|---|---|
| `paging.ts` | The paged contract: bounded page size, opaque continuation, query fingerprint, short-page semantics |
| `misNormalization.ts` | The normalization boundary and the confirmed ten-bucket taxonomy |
| `misService.ts` | `IMisDelinquencyService`, the live/cached envelope, `MisUnavailableError` |
| `synchronization.ts` | Processing checkpoint, mode guard, and the language that keeps the delta claim honest |

### Added — services (`apps/api/src/services/`)

`mis/MockMisDelinquencyService.ts`, `mis/ApiMisDelinquencyService.ts`,
`mis/CachedFallbackMisService.ts`, `collection/BackgroundSyncRunner.ts`,
`collection/CaseStrategyOrchestrator.ts`.

### Added — tests and tooling

`paging.test.ts`, `misNormalization.test.ts`, `synchronization.test.ts`, `mis-providers.test.ts`,
`background-sync.test.ts`, `orchestration-and-replay.test.ts`, `large-volume-paging.test.ts`,
`crm/scripts/spike-dataverse-paging.mjs`, `crm/scripts/smoke-qdb-phase4.mjs`.

### Added — documentation

`docs/MISContractEvidence.md`, `adrs/ADR-16-mis-transport-neutral-integration.md`,
`docs/evidence/Phase4_timing.md`, `docs/evidence/Phase4_banner.txt`,
`docs/evidence/Phase4_dataverse_paging_spike.txt`, `docs/evidence/Phase4_smoke_run.txt`, this report.

### Modified

`crm.ts` (`retrievePage` added **beside** `retrieveMultiple`), `DataverseClient` (`getPage`,
`getNextPage`, per-request headers), `DataverseCrmAdapter`, `qdbBindings.ts` (the case's current-strategy
navigation, read from the organisation), both fake adapters, and the timing, issues, risk, testing,
change-log and tracker documents.

**No existing repository or Phase 1–3 service changed behaviour.** The compiler confirmed that: adding
`retrievePage` to the interface broke exactly the two fake adapters and nothing else.

---

## 4. CRM / schema changes

**None.** Canonical column count remains **244/244**, verified live. No entity, column, choice, key,
role, queue or plugin step was created, altered or removed, and no plugin was changed.

Untouched as required: production, on-premises, the DA module, the customer master, BFD Facility
Limit, HL Customer Product, `qdb_crmlogs` schema, every `msst_` component and every unrelated QDB
component.

**Nothing was written to the sandbox by the large-volume tests** — those run entirely in memory.

---

## 5. MIS adapter architecture

One interface, three implementations, and the difference between them is deliberate.

```
Collection services ──IMisDelinquencyService──┬── MockMisDelinquencyService   (tests/demos only)
                                              ├── ApiMisDelinquencyService    (refuses: no contract)
                                              └── CachedFallbackMisService    (wraps either)
                                                        │
                                            normalization happens inside the provider,
                                            so no raw payload escapes it
```

- **Paging is transport-neutral.** The continuation is opaque end to end, so a source that pages by
  cursor, change token or paging cookie — or not at all — is adapted without the domain changing. It
  is explicitly not assumed to behave like Dataverse.
- **The mock is substantial on purpose.** It holds **raw** rows in the evidenced shape and runs the
  real normalizer on every read, so the coerced bucket and the day-first dates are exercised by every
  test that touches MIS. It injects unreachable, timeout, short-page, fail-once-then-succeed and
  no-change-feed faults.
- **Freshness travels with the data** — see §8.

Full decision: **ADR-DCP-16**.

---

## 6. Actual MIS contract status

**KI-53 — Open. TBD, Actual MIS Contract Required.**

| Inspected | Result |
|---|---|
| `projects/debtcollection` (whole repository) | no API artefact |
| Wider `AICompany` repository | no API artefact |
| `D:/QDB/Projects/` incl. Debt Collection Platform (37 files) | **two spreadsheet exports only** |

Absent: endpoint, request schema, response schema, authentication, authorisation, paging mechanism,
continuation semantics, change feed, delta mechanism, retry semantics, rate limits, source timestamps,
observation identifiers, record identifiers.

`ApiMisDelinquencyService` therefore refuses every method and names what QDB must supply — **including
when endpoints are configured**, because a configured URL is not a confirmed contract. Its `health()`
reports unreachable and points at the evidence document.

---

## 7. Normalization evidence

Every rule answers to something measured, and **no population statistic is hard-coded as a business
rule**; they are source profiling, recorded in `docs/MISContractEvidence.md`.

| Measured in the supplied data | Count | How normalization handles it |
|---|---:|---|
| `1-30` bucket arrives as a **date** | **1,670** (38 %) | Recovered from the month/day pair **at the boundary only** (KI-55). Nothing downstream knows it happened |
| `First Arrear Date` is a `DD/MM/YYYY` string | 4,348 | Parsed day-first explicitly; an impossible date is a named refusal, not a rolled-over one |
| Zero `Installment Amount` | 48 | No ratio derived — matching MIS, which supplies none for those rows — and a warning is carried |
| `Arrear %` above 1 | 5 | Clamped to the schema range rather than failing the row |
| Leading zeros already lost | 6 IDs, 50 mobiles | Identifiers become **strings** so nothing further is lost; **not reconstructed**, and the condition is flagged |
| Entirely blank rows | 2 | Recognised as rows that are not records |
| `QCB Deceased Status = DEAD` | 724 | Carried as a fact; **never** read as Contact Hold (KI-44) |

Four documented claims were corrected against the real data: `Account Status` is an **integer** not a
string; `lastArrearAmount == installmentAmount` holds in **81.0 %** not always; the coverage ratio
matches `min(1, arrears/instalment)` in **99.4 %** with 26 exceptions; and `customerType`, a per-row
as-of date, a source timestamp and a record id are **absent entirely**.

A full-population scan also corrected a sampling error made earlier in the same analysis:
`Exemption 20 Flag` is not empty, it carries 81 rows. A 200-row sample had said otherwise.

---

## 8. Live and cached data behaviour

Every MIS answer carries `provider`, `freshness`, `misAsOfDate` and `retrievedAt` — the last two being
different questions, since a live read of a month-old position is still month-old.

**Cached financial information is never presented as current live MIS.** A fallback answer carries
`freshness: 'Cached'`, the **reason** the live read failed, and **when** the figures were originally
obtained, so Phase 5 can render it distinctly.

Three limits, each tested:

- **only an availability failure falls back** — a malformed or unauthorised response is a defect and
  propagates;
- **nothing is invented** — with no cached position the original failure is raised, because an empty
  page would read as "this customer owes nothing";
- **synchronisation never falls back** — driving the Collection lifecycle from stale figures would
  record events MIS never reported.

---

## 9. Background synchronisation evidence

The approved order, enforced: **retrieve page → normalize → process → persist outcomes → advance
checkpoint → next page.**

- **One page in memory at a time.** Outcomes are summarised into counts and discarded; only isolated
  failures are retained, because those are what someone must act on.
- **The checkpoint follows the work.** It advances only after a page's outcomes are persisted, so a
  failed page leaves it pointing at the last persisted page — never beyond a gap.
- **Proven restart:** a failure on page 2 of 3 leaves `pagesCompleted: 1, recordsProcessed: 10`; the
  resume completes all 30 with exactly 30 cases and no duplicates. At volume, a failure on page 4 of
  10 leaves 3,000 processed and the resume finishes all 10,000.
- **A continuation-loop safety rail** stops a run that never terminates, and says it is a guard rather
  than a business limit.

### The distinction that keeps it honest

**DCP processing checkpoint ≠ MIS source change token.** They are separate fields.
`describeSyncMode()` states in words what a run may claim, and a `SourceDelta` run against a source
with no change feed is **refused** rather than reloading the whole population under an incremental
name. A full scan reports:

> *"Full scan with a DCP processing checkpoint: the run is restartable, but this is NOT source-level
> change synchronisation — no MIS change mechanism is in evidence."*

**Phase 4 does not claim incremental MIS change synchronisation validated.**

---

## 10. Server-side paging architecture

Designed from what `org5869857f` actually does, established **before** the contract was written.

| Measured | Consequence in the contract |
|---|---|
| Without `Prefer: odata.maxpagesize` the platform returned **all 1,295 rows** in one response | `pageSize` is **required** and bounded. There is no safe default |
| The page size is **not carried by the continuation link** — the same link without the header returned the remaining 1,290 rows | The header is re-sent on **every** request, continuations included |
| The link is absolute; its `$skiptoken` is paging-cookie XML | The continuation is **opaque** — never parsed, never rebuilt |
| `$top` bounds the whole result set and suppresses continuation | `$top` is **never** used for paging |
| A short page is possible | Only the **absence of a continuation** ends a walk |

A continuation also carries a **fingerprint of the criteria that produced it**, so reusing one after
the filter, sort, search or any source-specific narrowing changed is refused as `CriteriaChanged`
rather than paging into a population the caller has stopped asking about. `pageSize`, `continuation`,
`includeTotalCount` and `select` are excluded, each for a stated reason.

`retrievePage` sits **beside** `retrieveMultiple`; no Phase 1–3 repository changed.

---

## 11. Dataverse paging runtime evidence

`smoke-qdb-phase4.mjs` — **22/22 against `org5869857f`**, through the built Integration Service.

**The headline result, retained as required:**

> **1,295 rows → 7 bounded pages → 0 duplicates → clean termination** (1,122 ms)

Also proven live: a total reported without fetching the set; an opaque continuation with no platform
token leaking; no overlap between pages; sort order holding across a boundary whose values tie; the
walk covering exactly what the count promised; an unissued continuation refused as
`InvalidContinuation`; continuations refused after a changed filter, a changed sort and a reordered
two-column sort; an empty result returned as an empty page; a page size of one honoured; a filter with
a two-column sort paging together; **eight concurrent first pages returning the same page**; the same
continuation followed twice concurrently returning identical rows; and a 5,000-row request answered
with the 1,295 that exist.

The read-only spike that preceded the design is retained at
`docs/evidence/Phase4_dataverse_paging_spike.txt` — 15 of 16 questions answered by the platform.

---

## 12. Filtering, sorting and search evidence

Applied **by the source** in every case; nothing is narrowed in application memory or the browser.

| Evidence | Where |
|---|---|
| Filter, two-column sort and paging combined | live, 22/22 |
| Reordering sort columns invalidates the continuation | live |
| DPD range applied at the source and paged | volume tests |
| Free-text search narrowing then paging | volume tests |
| Filter plus paging across a whole walk with zero duplicates | volume tests |
| 100,000 records narrowed to one facility without walking the rest | volume tests |
| A changed filter refusing a carried continuation, at volume | volume tests |

---

## 13. Idempotency and replay evidence

**What is proven:** a second run over the same population creates **no duplicate case, no duplicate
snapshot and no second episode**, and reports `CaseUpdated` rather than `CaseCreated`. A changed
position writes a new snapshot, because it is a different observation. Duplicate rows within one run
produce one case. One active Collection Case per facility per episode is preserved.

**What is not proven, and is recorded as KI-54:** the feed carries **no observation id and no source
timestamp**, so replay protection rests on identity **DCP composes**, not identity MIS asserts. A
genuine intra-day correction and a duplicate delivery remain indistinguishable — the snapshot key
collapses them, which is safe but is not the same as knowing they were the same observation. The
production idempotency composition is **not frozen**; it stays deployment configuration with no default.

---

## 14. Strategy execution evidence

The boundary: **eligibility decides whether a case exists; strategy decides how it is treated.**

Strategy runs *after* the pipeline, so an unresolvable strategy leaves the case **untreated with a
stated reason** rather than destroying a case MIS says is delinquent. Tested for: no strategy ruleset
configured; a code the configuration does not define; no applicable strategy; a refusing Rule Engine.
The case survives every one, and every untreated case is enumerated in the run report and logged.

It decides nothing itself — **no threshold, no matching rule, no fallback strategy**. It records the
treatment and stops. **Scheduling the actions is Phase 8**, and a test asserts that Phase 4 creates no
activities.

The current-strategy navigation property was **read from the organisation's `ManyToOneRelationships`**,
not inferred — the KI-52 rule applied rather than quoted.

---

## 15. Rule Engine status — KI-48

**Unchanged and still open.** The three operations and their rulesets do not exist.

Eligibility fails closed inside the pipeline; strategy fails closed in the orchestrator. Automated
tests use `StubRuleEngine`, which holds no thresholds and stamps every decision `stub-rule-engine`
so it is identifiable for ever.

**No test-provider execution is labelled QDB Rule Engine runtime validation anywhere in this phase.**

---

## 16. Performance evidence

Synthetic and in memory. **Nothing was written to the shared QDB sandbox** — creating a hundred
thousand rows in an organisation shared with EDP, CWFD and DFE to satisfy a test would be vandalism.

| Measured | Result |
|---|---|
| 10,000-record walk | 20 pages, 0 duplicates, clean termination |
| 50,000-record walk | 50 pages, 0 duplicates |
| 100,000-record walk | 50 pages, 0 duplicates, no page above the requested size |
| Page count versus page size | 100 pages at 100; 10 pages at 1,000 — tracks the request, not a hidden limit |
| **Memory** | a 100K walk holds **no more heap than a 10K walk** — the property paging exists for |
| Concurrency | 20 concurrent first pages consistent; concurrent continuations of two queries do not cross |
| 10,000-record end-to-end run | 10 pages, checkpointed each page, 0 failures |
| Restart at volume | failure on page 4 of 10 → resume completes all 10,000 |

**Production-scale stress, load and soak certification remains Phase 11.**

---

## 17. Test and regression results

| Suite | Phase 3 close | Phase 4 | Change |
|---|---:|---:|---|
| `@dcp/domain` | 199 | **298** | +99 |
| `@dcp/api` | 188 | **313** | +125 |
| `@dcp/dataverse-client` | 27 | **27** | — |
| `@dcp/auth-adapters` | 14 | **14** | — |
| **TypeScript total** | 428 | **652** | **+224** |
| Tooling (node:test) | 10 | **10** | — |
| C# plugin tests | 129 | **129** | unchanged — no plugin touched |

| Live regression | Result |
|---|---|
| Phase 1 `smoke-qdb-plugins.mjs` | **13/13** |
| Phase 2 `smoke-qdb-phase2.mjs` | **20/20** |
| Phase 3 `smoke-qdb-phase3.mjs` | **19/19** |
| Phase 4 `smoke-qdb-phase4.mjs` | **22/22** |
| `verify-qdb-schema.mjs` | **19/19**, 244/244 |
| Smoke residue | **none** |

**No existing test was weakened.** Final gate: type-check exit 0, tests exit 0, build exit 0.

### Development incidents, recorded as resolved evidence

| # | Defect | Found by |
|---|---|---|
| 1 | A milestone commit landed while type-check was failing, the commit having been chained behind a `grep` whose exit status masked it | Immediate review; fixed in `ee44da0a`. **Process changed: the gate now runs explicitly and must return exit 0 before any milestone commit** |
| 2 | `advanceCheckpoint` spread "previous minus continuation" after the incremented counters, so the final page silently reverted a run's tally — 25 reported as 20 | Synchronisation unit tests |
| 3 | A change-feed capability probe performed a real data read, consuming an injected fault | Synchronisation unit tests |
| 4 | `fingerprintQuery` covered only filter, sort and search, so a changed `dpdFrom` left a continuation valid | Large-volume tests |
| 5 | The fix for 4 was over-strict: `includeTotalCount` shapes the envelope, not the result set | **The live Dataverse smoke** — unit tests had accepted it |
| 6 | A live assertion passed vacuously, comparing a two-column sort on a null column | Reading the output rather than trusting the tick |
| 7 | The paging spike's first run guessed the entity set and primary key | Its own 404; both then read from metadata |

Defects 4, 5 and 7 are the KI-52 class, which is why the spike ran before the design.

---

## 18. Cloud runtime evidence

All live work ran against `org5869857f` with the **built** Integration Service — the compiled output a
deployment would run, not a re-implementation.

`smoke-qdb-phase4.mjs` is **read-only** where it can be: it walks `qdb_crmlogs` (1,295 existing rows)
and creates nothing, so there is nothing to clean up. The Phase 1–3 smokes clean their own rows and
report zero residue.

Raw transcripts: `docs/evidence/Phase4_smoke_run.txt`, `Phase4_dataverse_paging_spike.txt`.

---

## 19. On-prem compatibility status

**Compatible by Design — Runtime Test Pending.** No Phase 4 code has run against an on-premises
organisation; that remains KI-08 and is unchanged.

| Concern | Position |
|---|---|
| Paging | `retrievePage` is on `ICrmAdapter`; an Organization Service adapter implements it with FetchXML paging cookies. The continuation is opaque, so the domain is indifferent |
| MIS providers | Plain HTTP or SDK calls behind an interface; no cloud-only construct |
| Synchronisation | Pure domain logic plus the adapter seam |
| Enforced by | `dual-platform.test.ts`, `collection-portability.test.ts` |

---

## 20. Remaining TBDs and Known Issues

**Raised in Phase 4:** **KI-53** (no MIS API contract in evidence — blocking for transport),
**KI-54** (MIS observation identity unsolved), **KI-55** (the `1-30` date coercion workaround must be
revalidated against the real API, and must not be deleted as dead code before that).

**Open and unchanged:** KI-48 (Rule Engine operations), KI-09 (Smart Assignment contract), KI-44
(Contact Hold source), KI-08/KI-22 (on-prem organisation), KI-49 (case-number format), KI-51 (who
matches strategy criteria), KI-50 (legacy route retirement).

**New risks:** R-P4-1 … R-P4-6 in `RiskRegister.md`.

---

## 21. Demo and replay steps

```bash
# from projects/debtcollection, with sandbox credentials in the env file
npm run build

# What the platform actually does when you page (read-only, creates nothing)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/spike-dataverse-paging.mjs

# The contract over it, live (22/22)
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-phase4.mjs

# Regression
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-plugins.mjs
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-phase2.mjs
DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/smoke-qdb-phase3.mjs
DV_API_VERSION=9.2 DV_AUTH_MODE=entra QDB_OPTION_VALUE_PREFIX=10000 \
  node --env-file=<env> crm/scripts/verify-qdb-schema.mjs

# Volume behaviour, entirely in memory
cd apps/api && npx vitest run src/__tests__/large-volume-paging.test.ts
```

**The moments worth watching** are the refusals: a continuation reused after the criteria changed, a
`SourceDelta` run against a source with no change feed, and `ApiMisDelinquencyService` declining to
call an endpoint whose contract nobody has confirmed.

---

## 22. Proposed Phase 5 scope — for approval, not started

Offered as a proposal. **Nothing below has been begun.**

The **React Collection Workspace**, converting the approved HTML design baseline
(`prototype/`, 8 pages) into the real workspace with **server-side search, filter and sort, bounded
paging, infinite scroll and UI virtualisation**.

The Phase 4 contract is ready for it without backend redesign:

```
React grid → request page (pageSize, filter, sort, search)
          → DCP API → ICrmAdapter.retrievePage / IMisDelinquencyService
          → page + opaque continuation
          → user scrolls → request next page with the continuation
          → append to the client model → virtualised rendering
```

The frontend never needs the whole dataset: every read is bounded, `hasMore` is explicit, a changed
filter or sort produces a named refusal that tells the client to restart paging from the first page,
and `freshness` lets the UI mark cached figures distinctly.

Also candidate for Phase 5 or later: the browser `ICrmAdapter` over `Xrm.WebApi` (still Not Started),
and the CI/solution packaging (still Not Started).

---

## 22a. Timing — final

*Captured from the machine clock and git commit timestamps; see `docs/evidence/Phase4_timing.md`.*

| | |
|---|---|
| **Original estimate** | **19.00 h** — never modified, no revision issued |
| Start (Asia/Qatar) | 2026-09-18 15:23:35 (+03:00) |
| **Completion (Asia/Qatar)** | **2026-09-18 21:02:36 (+03:00)** |
| Completion (machine, UTC) | `2026-09-18T18:02:36.819Z` |
| **Actual wall-clock elapsed** | **5.650 h** |
| **Inactive / blocked** | **0.867 h** |
| **Effective Claude execution** | **4.783 h** |
| **Variance** | **−14.217 h** |
| **Percentage of original estimate consumed** | **25.2 %** |

---

## Stopping here

Phase 4 is complete to the limit the evidence allows, evidenced and committed.
**Phase 5 has not been started and will not be without explicit approval.**
