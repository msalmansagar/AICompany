# Phase 7 — Communications: Single Send, Bulk, and the Unified History

**Status: CLOSED. Formally accepted by QDB on 2026-09-21.**
Phase 8 has not been branched, planned or started, and is not authorised.

**Organisation:** `org5869857f` (Cloud development sandbox) — the only organisation touched.
**Branch:** `feat/dcp-phase7-communications`.
**Runtime gates 0–9** (single send, history, eligibility, leakage) accepted by QDB on the reported
browser evidence and the subsequent fixes and redeployment.
**Bulk gates 1–14** exercised by an officer on the deployed workspace, 2026-09-21, and accepted.

Nothing in this report claims a runtime result the build awarded itself.

**Closure does not resolve anything listed as open in §6.** The open items remain governed by their
existing status, in particular KI-79, KI-83, KI-76, KI-95 and KI-97.

> **This supersedes the 2026-09-20 draft**, which reported bulk as engine-complete and
> screen-incomplete. WP12 — the officer-facing Bulk Communication screen — has since been built,
> deployed and validated in the browser, and the scope statement below is no longer qualified.
>
> **The 1,210-test figure in that draft is superseded and must not be used as the closure baseline.**
> It contained a cached `@dcp/api` count. The accepted baseline is the one in §3: **1,261**
> TypeScript, **10** tooling, **147** C#, 0 failed, 0 skipped, all executed at closure.

---

## 1. Scope delivered

### Single-customer communication — officer usable and runtime validated

| Channel | Native record | Fields written |
|---|---|---|
| **SMS** | `fax` | `faxnumber`, `qdb_message_body`, `qdb_sender` — **and no others** |
| **WhatsApp** | `fax` | the three SMS fields **plus** `qdb_language`, `qdb_whatsapptemplate`, `qdb_otp` |
| **Email** | `email` | standard Dynamics `subject`, `description`, ActivityParty `from`/`to` |

`regardingobjectid` binds every activity to its collection case, and the recipient is a `to`
ActivityParty. The three WhatsApp-only fields are the discriminator, confirmed by QDB rather than
inferred from the schema; an SMS row carries none of them, verified on the organisation.

### Bulk communication — officer usable and runtime validated

| Channel | State |
|---|---|
| **Bulk SMS** | Delivered. Created, executed, resumed, retried and reconciled from the screen |
| **Bulk Email** | Delivered. Same executor, same guarantees, same screen |

The officer chooses the population — everyone matching a filter, or only the cases they tick — sees
the target count **before** committing, agrees approved wording, and confirms. The population and
the body freeze at that moment. From the run screen they start it, watch target / processed /
recorded / refused / needs-retry, reopen it later, resume it, retry what failed, or stop it.

### Explicitly out of scope

| Excluded | Basis |
|---|---|
| **Bulk WhatsApp** | Out of scope by QDB decision. Not built, not stubbed, not offered in the channel list |
| **Warning Letters** | Deferred / out of scope by QDB decision, 2026-09-20. No Report Engine configuration, no letter templates, no UI, no SSRS integration, no document generation, no entities or fields, and no further investigation time. A scope decision, not an unresolved blocker (KI-81) |

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

**ActivityParty handling.** A recipient cannot be set in the create, nor in a following PATCH — only
by POST to the activity's own party collection, and that POST must not ask for a representation
(KI-85). The collection-valued navigation property name is read from metadata rather than derived. A
send returns `sent` only when the row **and** its party exist; where the structure cannot be
completed it returns `incomplete`, recorded as a retryable failure and **never as sent** (KI-86).

**Unified Communication History.** A read model over the native `fax` and `email` records — one
timeline, newest first, channel named on each row, the platform's own status word rather than an
invented one. Nothing is copied into a second table for display.

**Configuration-driven templates.** `qdb_communicationtemplate` serves all three channels, filtered
by channel, language, active and **approved**. No production message text is hard-coded in React.
`qdb_externaltemplateref` carries the provider-registered WhatsApp template name.

**`qdb_communicationrun`.** Approved, **provisioned** (5/5 verified, commit `03026580`) and now
**operated end to end**. It carries the frozen population, the execution cursor and the per-recipient
non-successes. It never holds a message sent to anybody. **KI-84 is closed.**

**Frozen bulk population and content.** The population is resolved server-side, page by page, at
confirmation and written down once; the rendered body and subject are frozen beside it. A filter
re-evaluated at execution would be a different campaign wearing the same name. The filter definition
is retained for audit only. A population too large for the column it is stored in is **refused, never
truncated** — and the capacity is read from platform metadata, so the refusal is sized against the
column that exists.

**Deterministic idempotency — structural, not procedural.** Each recipient's activity id is
`uuidv5(runId | recipientId | channel)`, created with `If-None-Match: *`. Double-click, retry after
an uncertain response, resume after interruption, a customer appearing twice, and partial failure are
safe as a consequence rather than as handling. Single send derives its id from the message itself, so
a second press reaches the same record and an edited resend is correctly a new one.

**Claim-before-work concurrency.** A worker claims the run with a version-checked write before it
creates anything; every subsequent write carries the version the **claim** returned. A second worker
is told the run was taken over, having created nothing.

**Crash, resume and reconciliation.** The checkpoint is written after a page's outcomes are
persisted, never before. Reconciliation counts `activityparty` rows with `participationtypemask eq 2`
— not activity rows — so the platform's own count is of *complete* communications. A run whose cursor
has reached the end but still holds retryable failures is **Paused, not Completed**.

All of the above is now recorded as **ADR-DCP-20** (`ADR_Phase7_BulkIdempotency.md`), which describes
the implementation that exists and decides nothing new.

**Contact Hold and channel restrictions.** One gate, identical for single and bulk, re-evaluated per
recipient **at send time** — the population was frozen and the world was not. Native `donotfax` and
`donotemail` are honoured as a necessary condition and never presented as QDB's Collection hold
policy. Where the authoritative hold cannot be evaluated, the gate refuses.

**Server-side paging, filtering and sorting.** The history, the run list and the population chooser
all use the Phase 4/5 contract — server-side filter/sort/page, opaque continuation, bounded
virtualization, continuation reset and stale-response suppression on any query change. The run list
selects a **narrow column set on purpose**: the frozen population is a memo column holding one line
per recipient, and a grid that selected it would pull every population on the page into the browser.

**The Communication Centre.** Two tabs — *One customer* and *Bulk SMS & Email* — in one view, because
they are the same act at two scales and carry the same invariants. The tab and the run id are part of
the URL.

---

## 3. QA evidence

### Automated — 1,261 TypeScript tests, all executed at closure

| Suite | Tests |
|---|---|
| `@dcp/domain` | **454** |
| `@dcp/web` | **436** |
| `@dcp/api` | **325** |
| `@dcp/dataverse-client` | **32** |
| `@dcp/auth-adapters` | **14** |
| **Total** | **1,261** |

Plus **10** tooling tests (`crm/scripts/lib`) and the **C# plugin suite, re-run at closure rather
than carried forward: 147 passed, 0 failed, 0 skipped.** TypeScript type-check clean across the
workspace, tests included.

> **Correction to the earlier baseline.** The figure of **1,210** in the 2026-09-20 draft included a
> **cached** `@dcp/api` count of 313; the suite actually reports **325**. Every number above comes
> from an uncached run performed for this report. WP12 itself added 39 web tests (397 → 436).

### Browser runtime validation — single send and history (gates 0–9)

Accepted by QDB on the reported evidence and the subsequent KI-93/KI-94 fixes and redeployment:
deployment reached the organisation; templates offered by channel, language, active and approved with
the unapproved template never offered; an unfinished message cannot be sent; Contact Hold under the
recorded sandbox exception; send, confirmation wording, and a second press creating nothing; a
customer who must not be contacted refused in plain words; one timeline across channels; nothing
technical leaking; and a post-fix regression across the routed views.

### Browser runtime validation — bulk (gates 1–14), 2026-09-21

Driven through the deployed workspace as **Mohammad Salman**, Collection Officer role, against a
controlled population of the two `DEMO-HL` cases. Full transcript in
`docs/evidence/Phase7_WP12_browser_qa.md`.

| # | Gate | Result |
|---|---|---|
| 1 | Officer can initiate Bulk SMS | **PASS** |
| 2 | Officer can initiate Bulk Email | **PASS** |
| 3 | Target count correct before confirmation | **PASS** — 4,363 unfiltered and 2 narrowed, both matching an independent server-side count |
| 4 | Approved templates only | **PASS** — `P7-SMS-UNAPPROVED-EN` never offered; channel switch withdraws the other channel's templates |
| 5 | Browser does not process recipient-by-recipient | **PASS** — three recipients produce three run-header writes (create, claim, checkpoint), not one per recipient |
| 6 | Run starts, progress visible | **PASS** |
| 7 | Counts reconcile | **PASS** — screen says 2 recorded; platform holds 2 activities each with exactly one recipient party |
| 8 | Refresh / reopen preserves run state | **PASS, with a stated limitation** — see below |
| 9 | Paused run resumes safely | **PASS** |
| 10 | Retry does not duplicate native activities | **PASS** — same single fax, same id, before and after |
| 11 | Recipient parties complete | **PASS** — one `participationtypemask eq 2` party per activity |
| 12 | Communication History reflects the result | **PASS** — both appear with the platform's own status |
| 13 | No technical internals leak | **PASS** — live sweep of both bulk screens, 13 leak classes |
| 14 | Cloud SMS wording does not claim delivery | **PASS** — no form of "deliver" on the run screen |

**Gate 8's limitation, stated rather than smoothed over.** A Dynamics web resource owns only its own
URL fragment, and the host restores the iframe at its original `src` when the top-level page reloads.
Pressing F5 on `main.aspx` therefore returns the workspace to its default view — for a bulk run
exactly as for a case. **No run state is lost**: the population, cursor and recorded failures live on
the run record, and the officer reopens the run from the Bulk runs list with everything intact. What
is lost is the navigation position, and that is inherited from the Phase 5 routing model, not
introduced by the bulk screen.

**Accepted at closure as UX/routing debt and tracked as KI-97.** It is not specific to bulk and is
not a closure blocker.

### Live checks against `org5869857f`

| Check | Result |
|---|---|
| `verify-view-columns` — every selected column and entity-set name read back from `EntityDefinitions` | **46/46** |
| Two-worker race on a live bulk run | **23/23** |
| `verify-configuration-determinism` — one active configuration per `qdb_organizationcode` | **4/4** |
| `P7-` template seed | **6/6** |
| Synthetic mobile provisioning | **5/5** |
| Paging seed and cleanup | **3/3** |
| `qdb_communicationrun` provisioning | **5/5** |
| Workspace deployment and publish, content matched byte for byte | **11/11** |
| WP12 QA cleanup, by derived id, re-read to prove removal | **8/8** |

### Data hygiene

**Zero transient QA residue**, verified by owned ids rather than by a cleanup routine reporting
success. `crm/scripts/qa-clean-bulk-run.mts` recomputes every activity id a run could have created,
deletes them with the run, and then **re-reads each id** and fails if any still resolves.

Afterwards, across the whole organisation: **0** communication runs, **0** fax rows, **0** email
rows. Preserved untouched: **4,358** `ARR-` cases, **5** `DEMO-` cases, **5** `P7-` templates, and
the synthetic mobile and restrictions on `Aisha Al-Mansouri (DEMO)`.

---

## 4. Defects found by browser and runtime validation

**Seven defects were found by running the deployed software**, six of them with the automated suite
fully green at the time. This is the most important evidence Phase 7 produced.

| # | Defect | Why the automated suite missed it | Regression guard added |
|---|---|---|---|
| **KI-89** 🔴 | The history read named three columns that do not exist; `qdb_collectionactivity` is an activity, so its key is `activityid`. The whole timeline rendered an error | The column list was typed **inline in the query module**, and `verify-view-columns.mts` checks `READ_REGISTRY` — a list that never reaches the registry is a list nothing verifies | A query module **may no longer name a column at all**. `communicationHistoryQueries.test.ts`, and now `communicationRunQueries.test.ts`, assert every selected column is registered |
| **KI-90** 🟠 | `String(error)` rendered `[object Object]` in **ten** places; `Xrm.WebApi` rejects with a plain object, not an `Error` | Every test threw a real `Error`, which takes the other branch | `describeFailure`/`toError`, total over every input. 20 tests including inputs that throw on `toString` |
| **KI-91** 🔴 | Pressing Send twice created two messages — a fresh id minted inside the handler. Demonstrated live: two Email activities 23 seconds apart | The journey test **pressed Send once** | `singleSendId()` derives the id from the message. A test presses twice and asserts one record |
| **KI-92** 🟡 | The confirmation promised the message would appear in the history; the history did not re-read | No test asserted that the promise the screen makes is kept | A send bumps a reload token and the history re-reads **from the platform**; the guard counts reads on the client API, not fetches |
| **KI-93** 🟠 | The raw organisation unique name was rendered on every screen, and in the Configuration session card | Inherited from Phase 5 and never reviewed | `officerLeakage.test.tsx` sweeps **every routed view on both the happy and failing paths** for 13 leak classes |
| **KI-94** 🔴 | **The leakage guard was itself vacuous, twice over** — it swept role-gated views without proving the route was taken, and its pattern began with a word boundary that could never match | Found only because the browser showed the leak while the guard reported clean | `openView` asserts `data-view`; `assertClean` requires real content. **Both faults confirmed by reintroducing the leak and watching the guard fail** |
| **KI-96** 🔴 *(cross-phase)* | **`Xrm.WebApi` does not return `@odata.count` at all**, so every count in the workspace was silently unknown. The bulk screen rendered **"0 recipients will be contacted"** above a grid listing cases; the My Day and Dashboard KPI tiles have shown an em dash since Phase 5, reading as "a later phase owns this" rather than as a defect | **436 tests passed over it.** The fake `Xrm` returned a count the real one never sends — a fake answering a question the platform ignores | Counting goes through the transport, which does return it. A count that cannot be read is **`null` — "not known", deliberately not zero**. The fakes no longer answer counts through `Xrm`, so a regression to that path fails |

Also closed earlier in the phase and found the same way: **KI-87** (a second copy of the entity-set
map drifted and failed mid-run, after writing rows) and **KI-88** (the Contact Hold resolver read all
active configurations instead of resolving by `qdb_organizationcode`, so a decision recorded for HL
could have permitted sending on a BFD case).

### The standing rule, reinforced by WP12

**A guard is not believed until the defect it exists to catch has been reintroduced and the guard has
been watched to fail.** Two of WP12's own new guards were vacuous when first written:

- the duplicate-send assertion counted **distinct ids**, and a map keyed by id cannot grow past its
  keys however many duplicates the platform accepts — it was rewritten to count creates the platform
  *accepted*, and then proven by removing the `412` and watching it report `expected 6 to be 3`;
- the bulk leakage sweep asserted **before the screen had rendered**, and passed with a run id
  plainly on screen — KI-94 reproduced in a new place by the same shortcut. It now waits for the
  screen's own marker, and was proven by re-rendering the leak.

A third guard was found to cry wolf rather than sleep: the HTTP-status leak pattern matched the
arrears bucket label `361-500`. A guard that fires on business data gets ignored, so it was tightened.

**KI-96 carries forward as cross-phase technical debt**, because it originated before Phase 7 and
its correction is a standing rule rather than a Phase 7 fix: **an unknown count is `null`, never
`0`** — where the transport cannot supply a trustworthy count, the surface says "not known" rather
than displaying a zero it has no evidence for. The real-transport regression coverage is preserved
deliberately, so that a fake `Xrm` can never again claim a capability production `Xrm.WebApi` does
not provide.

---

## 5. Data and configuration deliberately retained on `org5869857f`

| Retained | What it is | Why it is safe |
|---|---|---|
| **Synthetic mobile** — `Aisha Al-Mansouri (DEMO)` → `+97400000000` | So SMS composition and sending can be exercised against a recipient | Controlled sandbox test data: **non-assignable**, clearly synthetic, on a `DEMO-` record, restrictions restored to `false`. **No external SMS delivery is claimed from it** |
| **Five `P7-` templates** | Four approved, and **`P7-SMS-UNAPPROVED-EN` deliberately left unapproved** | All coded `P7-` and named "P7 synthetic". None is QDB wording. The unapproved row exists so "never offered" can be **demonstrated** rather than asserted — and it was, again, in the bulk composer |
| **Two active platform configurations** | `DEMO-BFD Cloud configuration` and `DEMO-HL Cloud configuration` | **Two active rows is the designed shape** — HL and BFD share one Dataverse and each owns one row keyed by `qdb_organizationcode`. Zero rows and more than one both fail closed (KI-88) |
| **Sandbox Contact Hold exception** | Both configurations carry `{"contactHoldPolicy":"allow-when-unverifiable"}` | Recorded at QDB's instruction, reversible with `record-contact-hold-exception.mts --revoke`, scoped to `org5869857f` only |

> ### KI-79 remains OPEN
>
> **The Cloud sandbox Contact Hold exception is not QDB production Contact Hold policy.**
> Production and default behaviour remain **fail-closed** wherever the authoritative policy cannot be
> evaluated — including when the flag is absent, unreadable, or on an inactive configuration row.
> `qdb_contactholdrulesetcode` is null on both rows and no Rule Engine ruleset is nominated. The
> exception records a decision about the absence of a policy source; it does not create one. Once QDB
> names an authoritative source the exception should be withdrawn, and the script says so.

---

## 6. Known limitations and open items

### Open, and specific to Phase 7

| Ref | What is unresolved | Blocks production? | Blocks Phase 8? |
|---|---|---|---|
| **KI-79** 🔴 | **No authoritative QDB Collection Contact Hold source or ruleset exists.** The columns `CommunicationArchitecture.md` §3.1 assumed — `qdb_stopcontact`, `qdb_deceasedflag`, `qdb_dateofdeath`, `qdb_deceasedsource`, `qdb_specialhandling` — **do not exist**. What exists is the native Dynamics set plus deceased facts on the **snapshot**, not on the customer | **YES — production sends fail closed until QDB nominates the source.** That is correct behaviour, not a bug: defaulting to *allow* because the source is missing would be the most damaging possible failure, and it would look like working software | No |
| **KI-83** 🔴 | **QDB's SMS/WhatsApp dispatcher exists on-prem but is absent from the Cloud development organisation.** The `fax` schema is fully present; a sweep of 400 workflows and 200 plugin assemblies found every SMS-related item to belong to Microsoft. The architecture is confirmed, not unknown | **External delivery is unproven in Cloud**; it is an on-prem deployment test. Record creation, binding and read-back are proven | No |
| **KI-80** 🟡 | **The Arabic/English template model is not established.** `qdb_communicationtemplate.qdb_language` is a picklist; `fax.qdb_language` is free-text. Whether a bilingual template is one row per language or one row carrying both, and what `fax.qdb_language` expects, is not in evidence. **Impact:** the `P7-` set carries one language per row, the simpler reversible option, and per-language approval works because approval is a property of the row. **Non-blocking** because the choice is reversible and no production template content exists to migrate | Not for the mechanism; QDB must confirm before authoring production templates | No |
| **KI-82** 🟡 | **Whether `qdb_privsendsms` is the intended authorisation control point is unconfirmed.** It exists with 0 rows beside a family of `qdb_priv_*` marker entities, which is QDB's established convention — but nothing states it is the one DCP should check. **Impact:** the design checks it rather than inventing a DCP privilege. **Non-blocking** because CRM native RBAC on `fax` and `email` remains authoritative regardless, so no send escapes authorisation | No — native RBAC governs regardless | No |
| **KI-97** 🟡 | **A top-level browser reload returns the workspace to its default view**, because a web resource owns only its own URL fragment and the host restores the iframe at its original `src`. Present since Phase 5; made visible by WP12, where a run is something an officer returns to. **No state is lost** — it lives on the run record, and the officer reopens the run from the list. **Accepted as UX/routing debt at closure** | No | No |
| **KI-95** 🟡 | **"CUSTOMER TABLE" is unnecessarily technical officer-facing terminology.** Contact and Account are intentional DCP domain concepts — HL's customer master is Contact, BFD's is Account — so their presence is not an information leak, and Gate 8 was accepted on that basis. The label is the issue, not the concept. **UX debt, not a closure blocker**; a future UI may use *Customer Type* or *Customer Source*. Not renamed now, at QDB's instruction, because it would require a regression cycle already completed | No | No |

### Carried forward from earlier phases, still applicable

| Ref | What is unresolved | Blocks production? | Blocks Phase 8? |
|---|---|---|---|
| **KI-71** 🟠 | **No schema mechanism links an activity to the strategy action that produced it.** No lookup to `qdb_strategyaction`, no alternate keys, and the generic reference columns are documented as holding `fax`/`email` and are read-only and process-populated — so they were **not** repurposed. The Action Plan correlates on activity **type id** and says so on screen | No | **YES — resolve before Phase 8 implementation begins.** See §9 |
| **KI-53** 🔴 | **No QDB MIS API contract exists in evidence** — no endpoint, schema, authentication, paging, continuation, change feed, retry contract, rate limit, source timestamp or record id. The only MIS evidence anywhere is two spreadsheet exports. `ApiMisDelinquencyService` fails closed on every method and refuses even when endpoints are configured | **YES for production MIS ingestion.** Phase 4 status stands: "MIS Integration Architecture & Processing Pipeline Complete — Production MIS Transport Contract Pending QDB" | Phase 8 strategy execution consumes MIS-derived state |
| **KI-66** 🟠 | **No activity outcome catalogue exists.** `qdb_activityoutcome` holds zero production rows, and it is not a table of labels — the outcome record drives follow-up scheduling, mandatory notes and escalation. The seven `P6-` outcomes are synthetic, marked and reversible, and **are not QDB policy** | **YES** — outcome-driven behaviour cannot be configured for production until QDB supplies the catalogue | Phase 8 materialises planned actions whose outcomes come from this catalogue |
| **KI-65** 🟡 | **Ordering inside the activity Open-state group is not in evidence.** The matrix is deliberately permissive inside the Open group and strict at the boundary; tightening later removes transitions, which is the safer direction | No | No |
| **KI-72** 🟡 | **No PTP policy limits are in evidence** — no maximum amount, horizon, count, tolerance, grace period or automatic broken threshold. None is enforced, and the absences are asserted by tests that say why | No | No |
| **KI-76** 🟡 | **Whether a collector may override a configured follow-up window is not defined.** Inherited from Phase 6. The typed date is preserved because that loses no information, and the configured date is shown as soon as an outcome is chosen, so an override is a visible act | No | Affects Phase 8 escalation semantics; not a prerequisite |

### Closed during this phase, recorded so they are not read as open

**KI-84** — `qdb_communicationrun` approved, provisioned 5/5, and now operated end to end by an
officer. The register row and the schema proposal have both been restated.
**KI-85, KI-86, KI-87, KI-88, KI-89, KI-90, KI-91, KI-92, KI-93, KI-94, KI-96** — all closed, each
with live or reintroduced-defect evidence in `KnownIssues.md`.
**KI-81** — Warning Letters closed as a **scope decision**, not as a resolved question.

---

## 7. Deployment status

| | |
|---|---|
| Branch | `feat/dcp-phase7-communications` |
| Commits in the phase | 20 |
| Artefact | `qdb_dcp_workspace.html`, deployed and published, **11/11**, stored content matching the built artefact byte for byte |
| Schema changed | **`qdb_communicationrun` only**, under the approved proposal. No other entity, column, relationship or choice was created, modified or deleted |

**Cloud runtime status — preserved wording:**
**Cloud SMS/WhatsApp: Native Record Creation Proven — External Delivery Unproven.**

**On-premises runtime status — preserved wording:**
**Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 7 Runtime Validation Pending.**

Nothing in Phase 7 touched an on-premises organisation. **No claim is made that the on-prem
dispatcher, or any part of the Phase 7 communication flow, has been runtime validated on-premises.**

### The three kinds of validation, kept apart

| | What was proven | Where |
|---|---|---|
| **Engine validation** | Deterministic ids, claim-before-work, checkpointing, structure-aware reconciliation, two-worker exclusion | Automated suites and live smokes against `org5869857f` — including a 23/23 two-worker race |
| **Browser / officer UI validation** | That a Collection Officer can choose a population, agree wording, confirm, start, watch, reopen, resume, retry and stop — and that what the screen says matches what the platform holds | Deployed workspace inside Dynamics, 2026-09-21, gates 1–14 |
| **Cloud external-delivery limitation** | **Not proven, and not claimed.** QDB's dispatcher is absent from this organisation, so every record created is inert | KI-83 — an on-prem deployment test |

Boundaries respected: only `org5869857f` was touched. Production, On-Prem, the DA module, customer
master schema, Facility Limit, Customer Product, the `qdb_crmlogs` schema, the legacy `msst_`
retirement and unrelated QDB solutions were not.

---

## 8. Timing

The original baseline is **not revised**. It stands, and the variance is reported against it.

| | |
|---|---|
| Baseline estimate | **22.50** effective execution hours |

### Phase 7 as reported on 2026-09-20 (WP12 omitted)

| | |
|---|---|
| Elapsed | **11h 25m** |
| Blocked | **≈ 4h 10m** |
| Effective execution | **≈ 7h 15m** |

### WP12 — completing the omitted work package

| | |
|---|---|
| Package estimate (Phase 7 plan, WP12) | **2.00 h** |
| Start | **2026-09-20 21:13** (+03:00) |
| End | **2026-09-21 08:41** (+03:00) |
| Elapsed | **≈ 11h 27m** |
| Blocked | **0** — no client validation hand-off occurred |
| Effective execution | **≈ 11h 27m** |

### Phase 7 total

| | |
|---|---|
| Effective execution | **≈ 18h 42m** |
| Variance against the 22.50 h baseline | **≈ −3.80 h** |

**What the figures actually say.** The −15.25 h variance reported on 2026-09-20 was never a
productivity result; it was an estimating error **and** an omission, and completing the omitted
package consumed most of the apparent saving. The phase now sits about 3.8 hours under a 22.50 hour
baseline, which is an ordinary outcome rather than a remarkable one.

WP12 ran well past its 2.00 h package estimate, and that estimate was not wrong so much as narrow: it
covered "bulk progress, results, resume and cancel UI" and what was actually missing was that screen
**plus** the population resolver and confirmation flow, the metadata-sized capacity refusal,
deployment, browser QA, the cleanup tooling, and the documentation. It also absorbed KI-96, a
platform behaviour nobody had established, and two rounds of proving its own guards could fail.

Elapsed figures are wall clock from timestamps, not instrumented measurement, and are stated as
approximate for that reason. **None of this should be used to set the Phase 8 baseline without
adjustment.**

---

## 9. Phase 8 prerequisites

Phase 8 automates strategy execution, assignment and escalation. Four things must be resolved before
implementation begins, and one of them is structural.

### Must be resolved before implementation

**1. KI-71 — activity → strategy-action provenance.** *This is the blocking one.*
Phase 8 materialises planned actions automatically. Today manual work and strategy-generated work are
**not distinguishable**: `qdb_collectionactivity` has no lookup to `qdb_strategyaction`, no alternate
key, and its only generic reference columns are documented as holding `fax`/`email` and are read-only
and process-populated. Phase 8 cannot report what a strategy did, cannot avoid re-materialising an
action already actioned, and cannot be audited, without this link. **It is a schema change and needs
QDB approval before Phase 8 design, not during it.**

**2. KI-66 — the activity outcome catalogue.** Phase 8 acts on outcomes. The seven `P6-` outcomes are
synthetic, marked and reversible, and must never be read as agreed policy. QDB must supply the real
catalogue, including which outcomes require notes, which schedule a follow-up and at what interval,
and which require escalation.

**3. Escalation policy.** Phase 6 recorded and displayed `qdb_escalationrequired` and deliberately did
not act on it. Phase 8 owns acting on it, and what escalation *means* — to whom, within what window,
with what authority — is not in evidence anywhere in the repository.

### Must be resolved before a production Phase 8 run

**4. KI-53 — the production MIS transport contract.** Phase 8 strategy execution consumes MIS-derived
delinquency state. The pipeline is complete and the transport is not, and `ApiMisDelinquencyService`
will continue to fail closed until QDB supplies an actual contract.

### Recommended, not blocking

- **KI-79** — an authoritative Contact Hold source, so Phase 8's automated sends are governed by QDB
  policy rather than by a fail-closed refusal.
- **KI-76** — whether a collector may override a configured follow-up, which changes what Phase 8
  should do when an automated follow-up and a manual one disagree.
- **A server-side scheduler for bulk**, if QDB wants a run to continue with no browser open. It is
  not needed for safety — the run is durable and resumable — only to remove the need to press Resume.
  ADR-DCP-20 records this as a later decision, deliberately not taken here.

---

## Closure

# Phase 7 — CLOSED

**Formally accepted by QDB on 2026-09-21**, on the delivery scope, WP12 evidence, regression
baseline, documentation and timing recorded above.

Accepted with these statements preserved and **not to be upgraded without corresponding runtime
evidence**:

- **Cloud SMS/WhatsApp: Native Record Creation Proven — External Delivery Unproven.**
- **Dynamics 365 CE 9.1 On-Prem — Compatible by Design; Phase 7 Runtime Validation Pending.**

Closure resolves nothing that §6 records as open. KI-79, KI-83, KI-76, KI-95, KI-97 and every other
previously open item remain governed by their existing status.

**Phase 8 is not authorised.** No branch, no discovery, no implementation. The Phase 8 prerequisites
in §9 — **KI-71 above all**, the missing Collection Activity → Strategy Action provenance
relationship — are to be reviewed separately before Phase 8 discovery may begin.
