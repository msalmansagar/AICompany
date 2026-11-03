# KI-84 — `qdb_communicationrun` schema

> ## APPROVED AND PROVISIONED — this is no longer a proposal
>
> Proposed 2026-09-20, **approved and created the same day** on `org5869857f` by
> `crm/scripts/provision-communication-run.mjs` (commit `03026580`), **5/5 checks passed** — every
> approved column present, nothing beyond the approved set, and `qdb_frozenpopulation` reporting its
> real `MaxLength` so the executor sizes its refusals against the column that exists.
>
> **Operated end to end by an officer on 2026-09-21** (Phase 7 WP12 browser QA): two runs created,
> executed, resumed, retried and reconciled from the Bulk Communication screen, then removed by
> derived id with zero residue.
>
> The text below is kept **as the approved specification**, unchanged from the form it was approved
> in. Read "proposed" in it as "approved and provisioned".

Proposed 2026-09-20, Asia/Qatar (+03:00).

---

## 1. What this entity is for, and what it is not

It represents **the bulk operation**. The individual communications remain native `fax` and `email`
records — one per recipient, which is what QDB's sending mechanism consumes. This entity never holds
a message that is sent to anyone.

Three things are needed that nothing else can carry:

1. **The frozen population** — who this run is for, decided once, at confirmation.
2. **Where execution got to** — so a resume does not restart.
3. **What failed** — so a failure is distinguishable from "not reached yet".

## 2. Why a new entity at all

Every candidate on `org5869857f` was inspected before proposing one:

| Candidate | Why not |
|---|---|
| `qdb_publish_job` | **277 live rows. It is the Dynamic Form Engine's** (`qdb_form_code`, `qdb_form_definition_id`, `qdb_languages_*`). Repurposing another product's live table is exactly the mistake KI-71 documents |
| `qdb_workflowtracker` | 0 rows and closest in shape, but has **no checkpoint, no batch size, no population, no per-recipient result**. Unowned and undocumented — adopting it would mean guessing at another team's intent |
| `qdb_tcs_job_status` | name, status, return code. No population, no cursor |
| `qdb_processstatus`, `qdb_wf_runtime_context` | Empty shells — a name column and nothing else |
| `qdb_crmlogs` | The approved technical log, and DCP is already a co-tenant. But it is documented as **technical/integration diagnostics** and "must not become business audit". A bulk run header is operational business state |
| native `bulkoperation` (Quick Campaign) | Does create one activity per recipient, but is bound to marketing **`list`** members, would require building marketing lists out of collection filters, and exposes no controllable continuation or per-recipient retry |
| native `asyncoperation` | System jobs. Not addressable as an application-owned record |

## 3. Proposed columns

Logical name: **`qdb_communicationrun`** · Display: *Communication Run* · Ownership: **User/Team**
(so CRM's own security governs who may see and resume a run).

| # | Logical name | Dataverse type | Purpose | Why it cannot be derived |
|---|---|---|---|---|
| 1 | `qdb_name` | Single Line of Text (200) | Primary name — *"Bulk SMS · 4,363 cases · 20 Sep"* | Dataverse requires a primary name attribute |
| 2 | `qdb_channel` | Choice — SMS · Email | Which channel the run sends | Not derivable: the frozen population says *who*, not *what* |
| 3 | `qdb_status` | Choice — Draft · Running · Paused · Completed · Cancelled · Failed | Lifecycle, and what a resume is allowed to do | Not derivable. "Paused by the officer" and "stopped because the browser closed" look identical from the data |
| 4 | `qdb_templateid` | Lookup → `qdb_communicationtemplate` | Which template produced the message | Not derivable once a template is edited or deactivated afterwards |
| 5 | `qdb_messagebody` | Multiple Lines of Text (100,000) | The **rendered** body, frozen with the population | **Deliberately not derived.** Re-rendering at resume would send a different message to the second half of the population if the template changed mid-run |
| 6 | `qdb_subject` | Single Line of Text (400) | Email subject | Same freezing argument as the body; unused for SMS |
| 7 | `qdb_selectionmode` | Choice — SelectedRecords · FilterDefinition | How the officer chose the population | Not derivable from the frozen list, and it is what the confirmation summary reported |
| 8 | `qdb_filterdefinition` | Multiple Lines of Text (10,000) | The filter as confirmed — **audit only, never re-run** | Not derivable. Kept so a supervisor can see what was asked for, never to reconstruct the population (§5) |
| 9 | `qdb_frozenpopulation` | Multiple Lines of Text (1,048,576) | The ordered recipient ids, frozen at confirmation | **The whole point.** Not derivable by definition — re-deriving is the defect this prevents |
| 10 | `qdb_totalrecipients` | Whole Number | Population size | Derivable by parsing column 9, but that means reading 140 KB on every progress poll. Also needed for the pre-execution summary, before column 9 is even written |
| 11 | `qdb_cursor` | Whole Number | Next unprocessed index | Derivable by scanning for the first missing record — expensive, and unnecessary because it is only an optimisation (§6) |
| 12 | `qdb_failedrecipients` | Multiple Lines of Text (100,000) | Ids that errored | **Not derivable.** An absent native record means either "failed" or "not reached yet", and those are different |
| 13 | `qdb_startedon` | Date and Time | When execution began | Not derivable — `createdon` is when the run was composed, which may be much earlier |
| 14 | `qdb_completedon` | Date and Time | When it finished | Not derivable |

Plus native `statecode`/`statuscode`/`ownerid`/`createdby`/`createdon`/`modifiedon`.

**Rejected from the proposal:** a progress percentage (derivable from 10 and 11), a "succeeded" count
(derivable as cursor minus failures), a per-recipient status column (that is what column 12 and the
native records already express), and any copy of recipient names or numbers (the customer master
already holds them — §5 of the authorisation).

## 4. No child entity — and the arithmetic that shows it

**`qdb_communicationrunitem` is not required**, and the measurement rather than an opinion:

| | |
|---|---|
| Collection cases on the organisation | **4,363** (all open) |
| Recipient id, 32 hex characters + separator | 33 chars |
| Frozen manifest for the entire book | **140.6 KB** |
| A `Multiple Lines of Text` column holds | 1,048,576 chars ≈ **31,775 ids** |
| Headroom against the whole book | **7.3×** |

A run over *every case QDB has* uses about an eighth of one column. A child entity would add a table,
a relationship, thousands of rows per run and its own cleanup problem, to solve a capacity problem
that is seven times away.

**The ceiling is enforced, not hoped for.** A run whose population exceeds ~31,000 recipients is
**refused at composition** with a message asking the officer to narrow the filter — rather than
silently truncating, which would quietly not-send to the remainder. If QDB ever genuinely needs a
larger single run, that is the moment to add a child entity, with evidence.

## 5. Freezing the population — the requirement you singled out

> DPD > 90 → 5,000 recipients. 2,000 processed, MIS synchronisation changes delinquency data. A
> resume must not silently become a different 4,700 or 5,300-recipient campaign.

**The filter is never re-run.** At the moment the officer confirms, the population is resolved
server-side, page by page, and the resulting **ordered list of recipient ids is written to
`qdb_frozenpopulation`**. From that instant the run's population is a fact, not a query.

Resume reads the list. It does not read the filter. `qdb_filterdefinition` is retained **for audit
only** — so a supervisor can see what was asked for — and is explicitly never used to reconstruct
who gets a message. That is the whole distinction the example turns on.

Three consequences worth stating:

- A case that *becomes* eligible mid-run is **not** added. It was not in the population the officer
  confirmed, and adding it would mean sending to someone nobody approved.
- A case that *stops* being eligible mid-run is still in the frozen list, but the **eligibility gate
  runs per recipient at send time** (§7 of the contract), so it is refused then and recorded as such.
  Freezing decides *who was in scope*; eligibility decides *whether to send now*. Conflating the two
  is what produces both silent omissions and messages to people who should not receive them.
- The **message is frozen too** (columns 5 and 6). A template edited halfway through a run must not
  mean the second half of the customers receive different wording.

The population is resolved **server-side in bounded pages**. React never holds it — it sends a filter
definition or a bounded selected set, and receives a count.

## 6. Checkpoint and resume

```
confirm  → resolve population (bounded pages, server-side)
         → write frozen list + total + rendered message      status = Draft
start    → status = Running, startedon = now
loop     → take BATCH_SIZE ids from cursor
         → per recipient: eligibility gate → create native record at communicationId(...)
         → advance cursor, record any failures
         → repeat until cursor = total                       status = Completed
```

**Correctness does not depend on the cursor.** If the process dies between creating a record and
advancing the cursor, the resume re-processes that recipient — and the deterministic id means the
platform refuses the duplicate and returns `created: false`. The cursor exists only so a resume does
not redo thousands of no-ops. That distinction is the reason this design is safe against a browser
close, a crash, or a double-start, none of which the cursor itself protects against.

`qdb_status` prevents a *second* concurrent execution of the same run: a run already `Running` is not
started again. Even if that guard were bypassed, the ids would still collapse the duplicates — two
independent protections, the structural one underneath.

## 7. Deterministic recipient identity

```
activityId = uuidv5( runId | recipientId | channel , DCP communication namespace )
```

Proven against `org5869857f` by WP3 (17/17): both `fax` and `email` accept a client-chosen primary
key with `If-None-Match: *`, a repeat is refused, and **the refused repeat does not overwrite**.

| Requirement you set | How it is met |
|---|---|
| same run + recipient + channel → same communication | the three inputs *are* the id |
| retry → no duplicate | platform refuses the second create |
| duplicate recipient in source → no duplicate | same id twice, one record |
| different run → different communication | run id is in the id |
| SMS and Email to one recipient → different ids | channel is in the id |

## 8. Partial failure and retry

A recipient that errors is appended to `qdb_failedrecipients` and the cursor still advances — so one
bad number cannot stall a run of thousands. At the end the run reports *n* sent, *m* failed, and the
officer may **retry failures only**: the same run id, the failed subset, the same deterministic ids,
so successes are untouched and failures are attempted exactly once more.

A run that cannot proceed at all — configuration missing, authorisation lost — ends `Failed` with the
cursor where it stopped, and is resumable once the cause is fixed.

## 9. Progress

`qdb_totalrecipients` and `qdb_cursor` give live progress with two integers and no scanning.
`qdb_failedrecipients` gives the failure count. At completion a **reconciliation** query counts the
native records actually created for the run, so the reported number is the platform's, not the
executor's — the same discipline as reading a record back after writing it.

## 10. Cloud and Dynamics 365 CE 9.1 on-premises

Every proposed type exists in CRM 9.1: Single Line of Text, Multiple Lines of Text, Whole Number,
Choice (local option set), Lookup, Date and Time. **No modern-only construct** — no elastic table, no
JSON column, no file column, no multi-select choice (which is 9.0+ but is not needed here). The
1,048,576-character Memo maximum is the same on both.

The executor uses only OData paging and `If-None-Match`, both available on 9.1. Nothing here assumes
Dataverse-only behaviour.

## 11. Impact on the baseline

| | |
|---|---|
| Current baseline | **22.00** effective hours |
| Entity provisioning, verification script, seed/cleanup | **+0.50** |
| **Revised forecast** | **22.50** effective hours |
| Reason | The KI-84 entity was scoped in WP11 as a design, not as provisioning work |
| Recorded | 2026-09-20, Asia/Qatar (+03:00) |

Recorded rather than absorbed silently, per the standing instruction. The executor, freezing, resume
and progress logic were already inside WP11's 2.5 h.

---

## What approval means

On approval I create **one entity, fourteen custom columns, one lookup to
`qdb_communicationtemplate`**, provisioned by script under publisher `qdb` with the standard
`OptionValuePrefix` 10000, verified against live metadata like every other DCP column, and covered by
the existing `SMOKE-`/`P7-` marker discipline.

No other schema changes. No new relationship beyond the template lookup. No child entity.
