# Phase 7 — Communications: Single Send, Bulk, and the Unified History

**Status: READY FOR CLOSURE. Phase 7 is _not_ formally closed.** This report is submitted for QDB
acceptance. Phase 8 has not been branched, planned or started.

**Organisation:** `org5869857f` (Cloud development sandbox) — the only organisation touched.
**Branch:** `feat/dcp-phase7-communications` @ **`b7477a1b`**, pushed, working tree clean.
**Runtime gates 0–9:** accepted by QDB on the reported browser evidence and the subsequent fixes and
redeployment.

Nothing in this report claims a runtime result the build awarded itself.

---

## 1. Scope delivered

### Single-customer communication — delivered

| Channel | Native record | Fields written |
|---|---|---|
| **SMS** | `fax` | `faxnumber`, `qdb_message_body`, `qdb_sender` — **and no others** |
| **WhatsApp** | `fax` | the three SMS fields **plus** `qdb_language`, `qdb_whatsapptemplate`, `qdb_otp` |
| **Email** | `email` | standard Dynamics `subject`, `description`, ActivityParty `from`/`to` |

In every case `regardingobjectid` binds the activity to the collection case, and the recipient is a
`to` ActivityParty. The three WhatsApp-only fields are the discriminator between an SMS row and a
WhatsApp row — confirmed by QDB, not inferred from the schema.

### Bulk communication — delivered, with one package short of its screen

| Channel | State |
|---|---|
| **Bulk SMS** | Domain, service, executor, population resolver, reconciliation — **delivered and live-proven** |
| **Bulk Email** | Same executor, same guarantees — **delivered and live-proven** |

**Stated plainly: the bulk operator screen (WP12 — progress, results, resume, cancel) was not built
in this slice.** The bulk path is exercised end-to-end by automation and by the live two-worker race
against `org5869857f`, through the production service composition. It is not exercised by a
Collection Officer through a UI, because that UI does not exist. Bulk is therefore
**engine-complete and screen-incomplete**, and must not be described as an officer-usable feature.

### Explicitly out of scope

| Excluded | Basis |
|---|---|
| **Bulk WhatsApp** | Out of scope by QDB decision. Not built, not stubbed, not partially present |
| **Warning Letters** | Deferred / out of scope by QDB decision, 2026-09-20. No Report Engine configuration, no letter templates, no UI, no SSRS integration, no document generation, no entities or fields, and no further investigation time. Recorded as a scope decision, not an unresolved blocker (KI-81) |

DCP builds **no dispatcher, no provider integration, and no replacement for QDB's Custom Workflow
Activity.** Its last step is the correct native record.

---

## 2. Architecture delivered

```
Collection Workspace  (React, inside main.aspx)
  → Communication domain            canonical request, one shape for three channels
  → Communication Service           eligibility gate, native record, recipient party
  → Dynamics Fax / Email activity   DCP's last step
  → existing QDB Custom Workflow Activity / email mechanism
  → SMS · WhatsApp · Email provider
```

**Native Fax for SMS and WhatsApp; native Email for email.** No `qdb_communication` row is created
and none is repurposed — that entity exists on the organisation and belongs to another module.

**ActivityParty handling.** An activity's recipient cannot be set in the create, nor in a following
PATCH — only by POST to the activity's own party collection, and that POST must not ask for a
representation (KI-85). `attachRecipient` reads the collection-valued navigation property name from
metadata (`fax_activity_parties`, `email_activity_parties`) rather than deriving it. A send returns
`sent` only when the row **and** its party exist; where the structure cannot be completed it returns
`incomplete`, recorded as a retryable failure and **never as sent** (KI-86).

**Unified Communication History.** A read model over the native `fax` and `email` records — one
timeline, newest first, channel named on each row, and the platform's own status word rather than an
invented one. Nothing is copied into a second table for display convenience.

**Configuration-driven templates.** `qdb_communicationtemplate` is the configuration entity for all
three channels, filtered by channel, language, active and **approved**. No production message text is
hard-coded in React. `qdb_externaltemplateref` carries the provider-registered WhatsApp template name
that `fax.qdb_whatsapptemplate` expects.

**`qdb_communicationrun`.** Approved and **provisioned** on `org5869857f`, 5/5 verified
(`03026580`). It carries what nothing else could: the frozen population, the execution cursor, and
the per-recipient non-successes. It never holds a message sent to anybody.

**Frozen bulk population and content.** The population is decided once, at confirmation, and held as
a manifest — or, for a filter-defined run, as the **filter definition**, resolved server-side page by
page at execution. A bulk run over the whole book never transfers the book to the browser.

**Deterministic idempotency — structural, not procedural.** Each recipient's activity id is
`uuidv5(bulkRunId + recipientId)`, created with `If-None-Match: *`. Double-click, retry after an
uncertain response, resume after interruption, the same customer appearing twice in a population, and
partial batch failure are all safe as a consequence, not as separate handling. For single send,
`singleSendId()` derives the id from the message itself — case, recipient, channel, subject, body —
so a second press reaches the same record and an edited resend is correctly a new one. Disabling a
button is a courtesy on top, never the mechanism (ADR-DCP-19).

**Claim-before-work concurrency.** A worker claims the run with a version-checked write before it
does anything, and every subsequent write carries the version the **claim** returned rather than the
one first read. A second worker is told the run was taken over. Retry-of-failures takes the same
claim, so a repair cannot run underneath a forward batch.

**Crash, resume and reconciliation.** A checkpoint is written after a page's outcomes are persisted,
never before. Reconciliation counts `activityparty` rows with `participationtypemask eq 2` — not
activity rows — so the platform's own count is of *complete* communications. A run whose cursor has
reached the end but still holds retryable failures is **Paused, not Completed**.

**Contact Hold and channel restrictions.** One gate, identical for single and bulk, so a bulk
operation cannot bypass a restriction that applies to one send. Native `donotfax` (SMS/WhatsApp) and
`donotemail` (Email) are honoured as a **necessary** condition and are never presented as QDB's
Collection hold policy. Where the authoritative hold cannot be evaluated the gate **refuses**. The
gate is pluggable, so the authoritative rule drops in without the call sites changing.

**Server-side paging, filtering and sorting.** The history and the population resolver both use the
Phase 4/5 contract — server-side filter/sort/page, opaque continuation, bounded virtualization,
continuation reset and stale-response suppression on any query change.

**The Communication Centre.** Case-scoped, split into *New message* and *Communication history*. It
states on screen that QDB's own mechanism delivers the message, names the fields a template still
needs, and confirms a send as **recorded and handed to the bank's messaging service** — never
"delivered".

---

## 3. QA evidence

### Automated — 1,210 tests

| Suite | Tests |
|---|---|
| `@dcp/domain` | **454** |
| `@dcp/web` | **397** |
| `@dcp/api` | **313** |
| `@dcp/dataverse-client` | **32** |
| `@dcp/auth-adapters` | **14** |
| **Total** | **1,210** |

Plus **10** tooling tests (`crm/scripts/lib`) and the C# plugin suite, unchanged from Phase 6 at
**147** — Phase 7 registered no new plugin step. TypeScript type-check clean across the workspace.

### Browser runtime validation

Approximately **40 browser journeys** across the deployed workspace, run through
`main.aspx?pagetype=webresource&webresourceName=qdb_dcp_workspace.html` on `org5869857f`.

| Gate | Subject | Result |
|---|---|---|
| 0 | Deployment reached the organisation; navigation is not a Phase placeholder | **PASS** |
| 1 | Case communications open; composer and history both present | **PASS** |
| 2 | Templates offered by channel, language, active and approved — the unapproved template never offered | **PASS** |
| 3 | An unfinished message cannot be sent; the missing fields are named | **PASS** |
| 4 | Contact Hold, under the recorded sandbox exception | **PASS** |
| 5 | Send; the confirmation wording; a second press creating nothing | **PASS** |
| 6 | A customer who must not be contacted is refused, in plain words | **PASS** |
| 7 | One timeline, both channels, no duplication on *Show more* | **PASS** |
| 8 | Nothing technical leaks to a Collection Officer | **PASS** (accepted after the KI-93/KI-94 fixes and rerun) |
| 9 | Post-fix regression across the routed views | **PASS** |

### Live checks against `org5869857f`

| Check | Result |
|---|---|
| `verify-view-columns` — every selected column and entity-set name read back from `EntityDefinitions` | **46/46** |
| Two-worker race on a live bulk run (claim, checkpoint, reconciliation, cleanup) | **23/23** |
| `verify-configuration-determinism` — one active configuration per `qdb_organizationcode` | **4/4** |
| `P7-` template seed | **6/6** |
| Synthetic mobile provisioning | **5/5** |
| Paging seed and cleanup | **3/3** |
| Workspace deployment and publish, stored content matched byte for byte | **11/11** |

### Data hygiene

**Zero QA communication residue**, verified by owned ids rather than by a cleanup routine reporting
success — the KI-73 lesson applied. `SMOKE-P7RACE` residue confirmed zero across `faxes`,
`qdb_communicationruns`, `qdb_collectioncases` and `contacts`. Preserved untouched: **4,358** `ARR-`
cases and **5** `DEMO-` cases. The three `qdb_` Delete guards were disabled and re-enabled around the
guarded cleanup, and their restored registration was verified rather than assumed.

---

## 4. Defects found by browser and runtime validation

**Six defects, KI-89 to KI-94, were found by running the deployed software — with 1,149 automated
tests green at the time.** This is the most important evidence Phase 7 produced, and it is recorded
as evidence rather than as noise.

| # | Defect | Why the automated suite missed it | Regression guard added |
|---|---|---|---|
| **KI-89** 🔴 | The history read named three columns that do not exist. `qdb_collectionactivity` is an **activity** — its key is `activityid` and its subject is `subject`, not `qdb_collectionactivityid`/`qdb_subject`. The whole timeline rendered nothing but an error | The column list was typed **inline in the query module**. `verify-view-columns.mts` checks `READ_REGISTRY` against live metadata, so a list that never reaches `READ_REGISTRY` is a list nothing verifies | A query module **may no longer name a column at all** — it takes a registered set from `schema.ts`. `communicationHistoryQueries.test.ts` asserts every selected column is registered for its entity set |
| **KI-90** 🟠 | `String(error)` rendered `[object Object]` to a Collection Officer, in **ten** places. `Xrm.WebApi` rejects with a plain object, not an `Error`, so every browser CRM failure took the fallback branch | Every test threw a real `Error`, which takes the other branch. The shape the platform actually rejects with was never exercised | `platform/errors.ts` supplies `describeFailure`/`toError`, used at all ten sites and **total** — `[object Object]` is unreachable. 20 tests over every rejection shape, including ones that throw on `toString` |
| **KI-91** 🔴 | Pressing Send twice created two messages. The composer minted a fresh id with `crypto.randomUUID()` inside the Send handler. Demonstrated live: two Email activities, 23 seconds apart, from two clicks. The code comment beside the line claimed the opposite | The journey test **pressed Send once**. The bulk path had layered duplicate protection; the single-send UI had none | `singleSendId()` derives the id from the message, so a second press reaches the same record. A test presses Send twice and asserts one record; another asserts an edited message produces a different id |
| **KI-92** 🟡 | The confirmation said the message would appear in the history, and the history did not re-read until a page reload. Compounded with KI-91: an officer who did not see the message would press Send again | No test asserted that the promise the screen makes is kept | A successful send bumps a reload token and the history re-reads **from the platform**. The guard counts reads on the client API, not on `fetch` — counting fetches passed with no refresh at all, because the send's own party read raised the count |
| **KI-93** 🟠 | The raw organisation unique name `unq8e28c4d88f8f4c42aa0a31a680cc0` was rendered to every user, in the app header and the Configuration session card. Officer-facing KI numbers and raw platform error text were found in the same sweep | Inherited from Phase 5 and never reviewed. No guard swept rendered output for internal identifiers | Both surfaces omit it. `officerLeakage.test.tsx` sweeps **every routed view, on both the happy and the failing path**, for 13 leak classes — 30 tests |
| **KI-94** 🔴 | **The leakage guard itself was vacuous, twice over.** It swept role-gated views without proving the route was taken (`#admin` fell back to another screen and it read that instead), and its organisation-name pattern began with a word boundary, which can never match because `textContent` concatenates adjacent field values, so the character before `unq` is a digit | Found only because the browser showed the leak while the guard reported clean. A guard that reads the wrong page, or whose pattern cannot fire, reports safety it has not established | `openView` asserts `data-view` equals the requested id and `assertClean` requires real rendered content. The pattern lost its leading word boundary. **Both faults were confirmed by reintroducing the leak and watching the guard fail** |

Two further defects were found the same way earlier in the phase and are closed: **KI-87** (a second
copy of the entity-set map drifted and failed mid-run, after writing rows) and **KI-88** (the
browser's Contact Hold resolver read *all* active configurations instead of resolving by
`qdb_organizationcode`, so a decision recorded for HL could have permitted sending on a BFD case).

**The standing rule this phase establishes:** a guard is not believed until the defect it exists to
catch has been reintroduced and the guard has been watched to fail. Two of the guards written in this
phase were themselves vacuous. Browser-level production-composition testing remains **mandatory**,
green suites notwithstanding.

---

## 5. Data and configuration deliberately retained on `org5869857f`

Four things were left in place. Each is recorded here so nothing about the sandbox's state is a
surprise later.

| Retained | What it is | Why it is safe |
|---|---|---|
| **Synthetic mobile** — `Aisha Al-Mansouri (DEMO)` → `+97400000000` | Added so SMS composition could be exercised against a recipient | Accepted as controlled sandbox test data. The number is **non-assignable** and clearly synthetic, on a `DEMO-` record. Contact restrictions were restored to `false` after the refusal test. **No external SMS delivery is claimed from this record or any other** |
| **Five `P7-` templates** | `P7-SMS-OVERDUE-EN`, `P7-SMS-FOLLOWUP-EN`, the Arabic SMS template, `P7-EMAIL-OVERDUE-EN`, and **`P7-SMS-UNAPPROVED-EN` deliberately left unapproved** | All coded `P7-` and named "P7 synthetic". None is QDB wording and none is production text. The unapproved row exists so that "never offered" can be **demonstrated** rather than asserted |
| **Two active platform configurations** | `DEMO-BFD Cloud configuration` and `DEMO-HL Cloud configuration`, both active | **Two active rows is the designed shape**, not a defect — HL and BFD share one Dataverse and each owns one row keyed by `qdb_organizationcode`. Resolution is by that key, with zero rows and more than one both failing closed (KI-88) |
| **Sandbox Contact Hold exception** | Both configurations carry `{"contactHoldPolicy":"allow-when-unverifiable"}` in their feature flags | Recorded at QDB's instruction, reversible with `crm/scripts/record-contact-hold-exception.mts --revoke`, and scoped to `org5869857f` |

> ### KI-79 remains OPEN
>
> **The Cloud sandbox Contact Hold exception is not QDB production Contact Hold policy.**
> Production and default behaviour remain **fail-closed** wherever the authoritative policy cannot be
> evaluated — including when the flag is absent, unreadable, or present on an inactive configuration
> row. `qdb_contactholdrulesetcode` is null on both rows and no Rule Engine ruleset is nominated.
> The exception records a decision about the absence of a policy source; it does not create one.
> Once QDB names an authoritative source the exception should be withdrawn, and the script says so.

---

## 6. Known limitations and open items

### Open, and specific to Phase 7

| Ref | What is unresolved | Blocks production? | Blocks Phase 8? |
|---|---|---|---|
| **KI-79** 🔴 | **No authoritative QDB Collection Contact Hold source or ruleset exists.** `CommunicationArchitecture.md` §3.1 assumed `qdb_stopcontact`, `qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource` and `qdb_specialhandling` on contact/account — **none exists**. `qdb_contactholdrulesetcode` is null on both configuration rows. What exists is the native Dynamics set (`donotemail`, `donotfax`, `donotphone`, `donotpostalmail`, `creditonhold`) plus deceased facts on the **snapshot** (`qdb_isdeceasedperqcb`), not on the customer | **YES — production sends fail closed until QDB nominates the source.** This is the correct behaviour, not a bug: defaulting to *allow* because the source is missing would be the most damaging possible failure mode, and it would look like working software | No |
| **KI-83** 🔴 | **QDB's SMS/WhatsApp dispatcher exists on-prem but is absent from the Cloud development organisation.** The `fax` schema is fully present (31 `qdb_` columns), but there are 0 fax rows, 0 workflows with `fax` as primary entity, and a sweep of 400 workflows and 200 plugin assemblies found every SMS-related item to belong to Microsoft. No longer an architectural unknown — the approved architecture is confirmed | **External delivery is unproven in Cloud** and is an on-prem deployment test. Record creation, binding and read-back are proven | No |
| **KI-80** 🟡 | **The Arabic/English template model is not established.** `qdb_communicationtemplate.qdb_language` is a picklist; `fax.qdb_language` is a free-text **String**. Whether a bilingual template is one row per language or one row carrying both bodies, and what value `fax.qdb_language` expects, is not in evidence. **Current impact:** the synthetic `P7-` set carries one language per row — the simpler and reversible option — and per-language approval works because approval is a property of the row. **Non-blocking because** the choice is reversible either way and no production template content exists to migrate | Not for the mechanism; QDB must confirm before authoring production templates | No |
| **KI-82** 🟡 | **Whether `qdb_privsendsms` is the intended authorisation control point is unconfirmed.** It exists with 0 rows alongside a family of `qdb_priv_*` marker entities; QDB's established convention is a privilege-marker table granted through security roles, which makes it the organisation's existing "may this user send an SMS" control — but nothing states it is the one DCP should check. **Current impact:** the design checks `qdb_privsendsms` rather than inventing a DCP-specific privilege. **Non-blocking because** CRM native RBAC on `fax` and `email` remains authoritative regardless, so no send escapes authorisation while this is open | No — native RBAC governs regardless | No |

### Carried forward from earlier phases, still applicable

| Ref | What is unresolved | Blocks production? | Blocks Phase 8? |
|---|---|---|---|
| **KI-71** 🟠 | **No schema mechanism links an activity to the strategy action that produced it.** `qdb_collectionactivity` carries no lookup to `qdb_strategyaction` and has no alternate keys; its generic reference columns `qdb_relatedrecordtype`/`qdb_relatedrecordid` are documented as holding `fax`/`email` when an activity mirrors a send, are read-only and process-populated, and were **not** repurposed. The Action Plan correlates on activity **type id** and states the limitation on screen | No | **YES — resolve before Phase 8 implementation begins.** See §9 |
| **KI-53** 🔴 | **No QDB MIS API contract exists in evidence** — no endpoint, schema, authentication, paging, continuation, change feed, retry contract, rate limit, source timestamp or record id. The only MIS evidence anywhere is two spreadsheet exports. `ApiMisDelinquencyService` fails closed on every method and refuses even when endpoints are configured, because a configured URL is not a confirmed contract | **YES for production MIS ingestion.** Phase 4 status remains "MIS Integration Architecture & Processing Pipeline Complete — Production MIS Transport Contract Pending QDB" | Phase 8 strategy execution consumes MIS-derived state; a production run needs this |
| **KI-66** 🟠 | **No activity outcome catalogue exists.** `qdb_activityoutcome` holds zero production rows, and it is not a table of labels — the outcome record drives follow-up scheduling, mandatory notes and escalation. Seven synthetic `P6-` outcomes exist, reversible and marked, shaped only to exercise the four behaviours. **They are not QDB policy** | **YES** — outcome-driven behaviour cannot be configured for production until QDB supplies the catalogue | Phase 8 materialises planned actions whose outcomes come from this catalogue |
| **KI-65** 🟡 | **Ordering inside the activity Open-state group is not in evidence.** No appendix gives an activity transition matrix. The matrix is deliberately permissive inside the Open group and strict at the boundary; tightening later removes transitions, which is the safer direction | No | No |
| **KI-72** 🟡 | **No PTP policy limits are in evidence** — no maximum amount, horizon, count, tolerance, grace period or automatic broken threshold. None is enforced, and the absences are asserted by tests that say why they are absent | No | No |
| **KI-76** 🟡 | **Whether a collector may override a configured follow-up window is not defined.** Inherited from Phase 6. The typed date is preserved, because that loses no information, and the form shows the configured date as soon as an outcome is chosen so an override is a visible act | No | Affects Phase 8 escalation semantics; not a prerequisite |

### New, recorded at QDB's instruction

| Ref | Item |
|---|---|
| **KI-95** 🟡 | **"CUSTOMER TABLE" is unnecessarily technical officer-facing terminology.** Contact and Account are intentional DCP domain concepts — HL customer master is **Contact**, BFD customer master is **Account** — so their presence is not a technical-information-leak blocker for Gate 8. The label itself reads as a database term to a Collection Officer. Recorded as a **minor UX improvement / technical-debt item, not a Phase 7 closure blocker.** A future UI may use *Customer Type* or *Customer Source*. **No functional change is being made now** — renaming it would require a regression cycle this phase has already completed |

### Not silently dropped

**KI-84** (durable bulk run header) is **closed by provisioning**: `qdb_communicationrun` was approved
and created on `org5869857f`, 5/5 verified, commit `03026580`. The register row and
`Phase7_CommunicationRun_SchemaProposal.md` still carry their pre-approval wording and should be
restated at closure. **KI-85, KI-86, KI-87, KI-88, KI-89, KI-90, KI-91, KI-92, KI-93 and KI-94** are
all closed, each with live or reintroduced-defect evidence recorded in `KnownIssues.md`.

**KI-81** (Warning Letters mechanism) is closed as a **scope decision**, not as a resolved question.

---

## 7. Deployment status

| | |
|---|---|
| Branch | `feat/dcp-phase7-communications` |
| Final commit | **`b7477a1b`** — *fix(dcp-p7): officer-facing leakage, and the guard that was hiding it* |
| Commits in the phase | 16 |
| Remote | Pushed; `origin/feat/dcp-phase7-communications` at the same commit. Working tree clean |
| Artefact | `qdb_dcp_workspace.html`, deployed and published, **11/11**, stored content matching the built artefact byte for byte |
| Schema changed | **`qdb_communicationrun` only**, provisioned under the approved proposal. No other entity, column, relationship or choice was created, modified or deleted |

**Cloud runtime status — preserve this wording:**
**Cloud SMS/WhatsApp: Native Record Creation Proven — External Delivery Unproven.**

**On-premises runtime status — preserve this wording:**
**Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 7 Runtime Validation Pending.**

Nothing in Phase 7 touched an on-premises organisation. **No claim is made that the on-prem
dispatcher, or any part of the Phase 7 communication flow, has been runtime validated
on-premises.**

Boundaries respected: only `org5869857f` was touched. Production, On-Prem, the DA module, customer
master schema, Facility Limit, Customer Product, the `qdb_crmlogs` schema, the legacy `msst_`
retirement and unrelated QDB solutions were not.

---

## 8. Timing

| | |
|---|---|
| Baseline estimate | **22.50** effective execution hours |
| Elapsed | **11h 25m** |
| Blocked | **≈ 4h 10m** |
| Effective execution | **≈ 7h 15m** |
| Variance | **−15.25 h** against the baseline |

**This variance represents estimation calibration error, not a productivity claim.** The same
observation was recorded at Phase 6 close and it has now repeated, which makes it a pattern in the
estimating method rather than a property of any one phase. The baseline was set before the QDB
contract confirmation removed the inference risk from the channel adapters and before the
upsert-by-id spike (WP3) settled the phase's highest-risk assumption in under an hour. Neither
reduction was padding being recovered.

The blocked figure is bounded by the gaps between stopping for validation and the next commit. It is
an estimate from timestamps, not instrumented measurement, and is stated as approximate for that
reason.

The baseline is not revised retrospectively; it stands and the variance is reported against it.
**It should not be used to set the Phase 8 baseline without adjustment.**

---

## 9. Phase 8 prerequisites

Phase 8 automates strategy execution, assignment and escalation. Four things must be resolved before
implementation begins, and one of them is structural.

### Must be resolved before implementation

**1. KI-71 — activity → strategy-action provenance.** *This is the blocking one.*
Phase 8 materialises planned actions automatically. Today, manual work and strategy-generated work
are **not distinguishable**: `qdb_collectionactivity` has no lookup to `qdb_strategyaction`, no
alternate key, and its only generic reference columns are documented as holding `fax`/`email` and are
read-only and process-populated. The Action Plan correlates by activity **type id** and says so on
screen; it never infers provenance. Phase 8 cannot report what a strategy did, cannot avoid
re-materialising an action already actioned, and cannot be audited, without this link.
**It is a schema change and needs QDB approval before Phase 8 design, not during it.**

**2. KI-66 — the activity outcome catalogue.** Phase 8 acts on outcomes. The seven `P6-` outcomes are
synthetic, marked and reversible, and must never be read as agreed policy. QDB must supply the real
catalogue, including which outcomes require notes, which schedule a follow-up and at what interval,
and which require escalation.

**3. Escalation policy.** Phase 6 recorded and displayed `qdb_escalationrequired` and deliberately did
not act on it. Phase 8 owns acting on it, and what escalation *means* — to whom, within what window,
with what authority — is not in evidence anywhere in the repository.

### Must be resolved before a production Phase 8 run

**4. KI-53 — the production MIS transport contract.** Phase 8 strategy execution consumes
MIS-derived delinquency state. The pipeline is complete and the transport is not, and
`ApiMisDelinquencyService` will continue to fail closed until QDB supplies an actual contract.

### Recommended, not blocking

- **KI-79** — an authoritative Contact Hold source, so that Phase 8's automated sends are governed by
  QDB policy rather than by a fail-closed refusal.
- **KI-76** — whether a collector may override a configured follow-up, which changes what Phase 8
  should do when an automated follow-up and a manual one disagree.

---

## Proposal

# Phase 7 — Ready for Closure

Submitted for QDB acceptance. Phase 7 is **not** marked closed by this report. No Phase 8 branch has
been created and no Phase 8 discovery or implementation has begun; both await explicit acceptance.
