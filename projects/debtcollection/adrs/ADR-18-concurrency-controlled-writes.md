# ADR-DCP-18 — Concurrency-controlled writes go through the adapter, not through `Xrm.WebApi`

**Status:** Accepted (Phase 6) · **Date:** 2026-09-19 · **Deciders:** user (Phase 6 authorisation §4), architect
**Relates to:** ADR-DCP-10 (dual-platform single codebase), ADR-DCP-17 (the workspace reads through the CRM session), KI-67.

## Context

Phase 6 is the first phase in which the workspace **writes**. Two collection officers routinely work
the same case — one completing a call while another captures a promise — and §12 of the Phase 6
authorisation requires that neither silently overwrites the other. The user was explicit: *"I want
stale-write detection rather than silent last-write-wins behavior"*, and *"do not weaken the
requirement merely because `Xrm.WebApi.updateRecord` cannot send `If-Match`."*

`Xrm.WebApi.updateRecord(entityLogicalName, id, data)` takes an entity name, an id and a data object.
There is no parameter for a header, and no overload that accepts one. `If-Match` is therefore not
reachable through the client API at all. That is the documented shape of the method, not a defect.

So the question is not whether Dataverse supports optimistic concurrency, but whether the workspace
can reach it — and what it costs to do so on **both** Dataverse and Dynamics 365 CE 9.1 on-premises.

### What the platform actually does

`crm/scripts/spike-concurrency.mjs`, run against `org5869857f` — **16/16**, evidence in
`docs/evidence/Phase6_concurrency_spike.txt`:

| Question | Answer |
|---|---|
| Does a read return a concurrency token? | Yes — `ETag` header **and** `@odata.etag` in the body, and they agree |
| Is it a real version token? | Yes — it changes on every write (`…974` → `…976`) |
| Does a PATCH with the current ETag succeed? | Yes, `204` |
| Does a PATCH with a **stale** ETag fail? | Yes, **`412 Precondition Failed`** |
| Does the refused write partially land? | **No.** The row was unchanged afterwards |
| What does `If-Match: *` mean? | **Existence, not freshness.** It updates an existing row regardless of version — an upsert guard, and dangerous if mistaken for a concurrency guard |
| What happens with no `If-Match`? | `204`. Last-write-wins — which is what every write through `Xrm.WebApi` does today |
| The real race: two officers, same version, both write | First succeeds, **second is refused with 412**, and the first officer's value survives |

The platform's refusal message is *"The version of the existing record doesn't match the RowVersion
property provided."* — worth recording, because the first run of the spike expected the word
"concurrency" and that assertion failed. The test was wrong, not the platform.

## Decision

### 1. Concurrency-controlled writes use the Web API directly, behind the existing adapter

`ICrmAdapter` gains an optimistic-concurrency contract — a read that surfaces the row version, and an
update that carries the caller's expected version and **fails loudly** when the row has moved. The
browser implementation issues a same-origin `fetch` with `If-Match`, because that is the only way to
send the header.

The workspace is served from the organisation's own origin, so the request carries the user's session
and CRM's security applies exactly as it does to `Xrm.WebApi` — the identity and the privileges are
the same; only the mechanism for attaching a header differs.

### 2. React never sees any of it

No component issues a `fetch`, composes a URL, or knows what an ETag is. A view calls the adapter and
handles one of two shapes: the write succeeded, or the row moved underneath it. The user's
instruction was explicit — *"keep that implementation encapsulated rather than spreading
platform-specific HTTP logic throughout React"* — and that is also what keeps ADR-DCP-10 intact.

### 3. Reads stay on `Xrm.WebApi`

There is no reason to move them. `Xrm.WebApi` handles paging, annotations and entity-name translation
correctly, and Phase 5 proved all of it live. Two transports is a cost; **one transport that cannot
do the job** is worse. The split is by *capability*, not by convenience: writes that need a version
guard, and everything else.

### 4. A stale write is a conversation, never a silent merge

A `412` surfaces as a named outcome the UI must handle — *"this record changed while you were
editing"* — with the current values available to compare. The workspace does not merge automatically
and does not retry automatically. Both would be guesses about intent in a system of record for money
owed.

### 5. `If-Match: *` is not a concurrency guard, and is not used as one

The spike settled this. `*` asserts existence, so a write carrying it overwrites whatever version is
there. It is exactly the trap that looks like a safety mechanism and is not one.

## Consequences

**Good.** Stale-write detection is real, enforced by the platform rather than by convention, and
identical on Dataverse and on 9.1 — the Web API has supported `If-Match` since v8.0, so no
platform-specific branch is needed and ADR-DCP-10 holds. The mechanism is the platform's own, so
there is no home-grown version column and no schema change.

**Costs, accepted.** The workspace now has two ways to reach CRM, and the write path does not benefit
from `Xrm.WebApi`'s entity-name translation, so the adapter owns that for writes too. A same-origin
`fetch` depends on the workspace being served from the organisation's origin — true for a web
resource on both platforms, and another reason the raw `/WebResources/` standalone path was rejected
in Phase 5.

**Unproven until the write smoke runs.** The spike used a bearer token from node with full control of
the headers. The browser will use the session cookie. The OData semantics are the same, but the
*authentication* is not, and Phase 5 taught this engagement three times that a harness friendlier
than the platform proves nothing. **KI-67** records that, and the browser write smoke is the gate
that closes it — before any form is built on the assumption.

**Rejected alternatives.**

*Accept last-write-wins.* Refused by the authorisation, and rightly: a collector's completed call
silently erased by a colleague's save is a data-integrity failure in a system of record.

*A home-grown version column compared in a plugin.* Would need a schema change, would duplicate a
mechanism the platform already has, and would still need the client to send the expected value —
which `Xrm.WebApi` cannot do either. It solves nothing and adds a column.

*Re-read before write and compare in React.* Not concurrency control — it is a race with a smaller
window, and it puts the check on the side that cannot be trusted to perform it.

*Route writes through the Integration Service.* Would need a second authentication path on the
on-premises estate, which is still `TBD — Requires QDB Confirmation`, and would put DCP's own service
in front of CRM security. The same reasoning that decided ADR-DCP-17.
