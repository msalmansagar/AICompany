# ADR-DCP-20 — A bulk communication is made safe by its ids, not by its procedure

**Status: Accepted (Phase 7).** This record **describes the implementation that exists** and was
proven against `org5869857f`. It decides nothing new. It was written at Phase 7 closure because the
decision had been made, implemented, tested and live-verified while living only inside
`Phase7_CommunicationContract.md` §6.3 and the executor's own comments — which is not where an
architecture decision belongs.

Context: `ADR-DCP-18` (concurrency-controlled writes) and `ADR-DCP-19` (duplicate submission
prevented by a client-chosen primary key) are its parents. This applies the same reasoning to an
operation that touches thousands of customers instead of one.

---

## Context

A bulk run sends one message to each of many customers. Every failure mode it has is a message a
real person does or does not receive:

- a double-click on **Start** must not send everything twice;
- a retry after an uncertain response must not send again;
- a run interrupted half-way — a closed browser, a lost network, a reloaded page — must resume
  without re-sending what was already sent;
- the same customer appearing twice in a population must receive one message;
- a partial failure must be repairable **without** touching the recipients that succeeded;
- two operators, or two tabs, must not both advance the same run.

The obvious design — a counter, a "sent" flag per recipient, a disabled button — fails all six the
moment a process dies between doing the work and recording it. That window cannot be closed by
being careful inside it, because it is the process ending that opens it.

## Decision

**Safety is a property of the identifiers, not of the sequence of steps.**

### 1. Deterministic communication identity

Each recipient's native activity is created at

```
activityId = uuidv5(runId | recipientId | channel)
```

with `If-None-Match: *`, which turns Dataverse's upsert-by-id into create-only. The same run and the
same recipient always name the same record, so a second attempt is refused by the platform rather
than prevented by the caller. Single send uses the same rule with the message itself as the seed
(`singleSendId`), so an edited resend is correctly a different message.

Proven first, before any send path was built (WP3, 17/17), because a duplicate SMS reaches a
customer twice and the assumption was the phase's highest risk.

### 2. Guarded native creation

A create returning `412` is **success** — the record the caller asked for exists. It is not an
error, and it is not "already sent" either (see §6).

### 3. Claim before work

A worker claims the run by writing its status with `If-Match` on the run's row version **before it
creates anything**. Exactly one worker proceeds; the loser stops having created nothing at all.

Without this, two workers reading the same version would both do the work and only collide at the
checkpoint — each having "independently processed" the run. It also makes the derived counters
trustworthy, because `successful` derives from the persisted cursor, and a racing cursor would put
the race straight into the numbers.

### 4. Frozen population and frozen content

At confirmation the population is resolved server-side, page by page, and written down **once** as a
manifest on the run; the message body and subject are written beside it. Execution reads the frozen
list and never re-runs the filter.

A filter re-evaluated at execution time is a different campaign wearing the same name: cases cured,
closed or newly delinquent since confirmation would silently change who is contacted. The filter
definition is still recorded, for audit only.

A population that will not fit the column it is stored in is **refused, never truncated** — and the
capacity is read from platform metadata rather than assumed, so the refusal is sized against the
column that exists.

### 5. Checkpoint semantics, and crash/resume

The cursor advances only **after** a batch's outcomes are persisted, under the version the claim
returned. A run is therefore always resumable from its own record:

| What happened | What resume does |
|---|---|
| Browser closed mid-run | Reads the cursor and continues from it |
| Process died after creating a record, before the checkpoint | Re-attempts that recipient; the platform refuses the create; recorded as already sent |
| Batch failed part-way | Only the recipients without a record are created |

Counters are **derived** from the cursor and the recorded non-successes, never incremented, so
re-processing a batch cannot inflate them.

### 6. `created: false` does not mean "sent"

This is the rule the live organisation forced (KI-85/KI-86), and the one that makes the rest honest.

A Fax or Email can be created perfectly while its recipient ActivityParty fails — the party cannot
travel in the create, nor in a following PATCH; it is a separate POST to the activity's own party
collection. That leaves a row **nobody can receive**. On the next attempt the id already exists, the
platform refuses, and an executor reading `created: false` as "already sent" would report a customer
contacted who never was.

So a send returns `sent` only when the row **and** its recipient party exist. It reads the party
collection before writing, adds the party when missing, and returns `incomplete` — recorded as a
**retryable failure, never as sent** — when the structure cannot be completed.

### 7. Structure-aware reconciliation

Completion is checked against the platform, and it counts `activityparty` rows with
`participationtypemask eq 2` — not activity rows. Counting rows would have reported six sent messages
that nobody could receive; that is not a hypothetical, it is what the live run produced before the
party contract was understood.

### 8. A run holding retryable work is Paused, not Completed

Reaching the end of the population is not finishing the campaign. Marking such a run Completed would
close the only door through which a half-made communication could be repaired, leaving a customer
uncontacted behind a green "done". `retryFailures` repairs through the same deterministic ids and
never creates a second activity. Refusals do not hold a run open — the eligibility gate is terminal.

## Why a cursor alone is not idempotency

A cursor answers "how far did we get?". It does not answer "did recipient 47 receive a message?".
The two come apart exactly when it matters: the process dies between the create and the checkpoint,
and the cursor says 46 while 47 already has a record. Resuming on the cursor alone re-sends to 47.

The deterministic id answers the second question without any bookkeeping, because the answer is
held by the platform in the form of whether that id exists. The cursor is then free to be what it
is good at — avoiding pointless re-work — rather than being trusted as a record of delivery.

## Consequences

**Accepted.** Execution is browser-initiated: the officer's screen asks for the next bounded batch
and the executor performs it, ending each batch with a durable checkpoint. There is no server-hosted
job. Closing the browser therefore stops progress — it does not lose work, and Resume continues from
the checkpoint. A server-side scheduler would remove the need to press Resume and is not required
for safety; it is a later phase's decision, not this one's.

**Accepted.** One frozen body per run means bulk cannot personalise per recipient. Placeholders are
filled once by the officer and the preview is exactly what every recipient receives, which the
screen states.

**Gained.** Every one of the six failure modes above is closed by construction rather than by
discipline, and each is closed in a way a test can demonstrate on the real platform.

## Evidence

| Claim | Where it was proven |
|---|---|
| Native `fax`/`email` accept upsert-by-id | WP3 spike against `org5869857f`, 17/17 |
| Party cannot ride in the create or a later PATCH | Four shapes tried live; KI-85 |
| Two workers cannot both advance one run | Live two-worker race, 23/23 |
| A repeat create is refused, not duplicated | Live: two presses → one record, one party |
| Reconciliation counts complete communications | `reconcileRun` over `activityparty`, live |
| An officer can drive all of it | Phase 7 WP12 browser QA, `org5869857f`, 2026-09-21 |

## Related

`ADR-DCP-18` · `ADR-DCP-19` · `Phase7_CommunicationContract.md` §6.3 · KI-84, KI-85, KI-86
