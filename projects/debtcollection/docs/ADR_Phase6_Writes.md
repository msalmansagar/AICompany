# ADR-DCP-18 and ADR-DCP-19 — Safe writes from the Collection Workspace

Both decisions were taken in Phase 6, before any write screen existed, and both were settled by
running the behaviour against `org5869857f` rather than by reading documentation. The evidence files
are named in each section and the spike scripts are in `crm/scripts/`.

---

## ADR-DCP-18 — A concurrency-controlled write bypasses `Xrm.WebApi` for a same-origin `fetch`

**Status:** Accepted (Phase 6, approved by the client 2026-09-19)
**Supersedes:** nothing. **Related:** KI-67, KI-68, KI-70

### Context

Two collectors can open the same activity. Dataverse offers optimistic concurrency for exactly this:
every row carries a version, a write may send `If-Match: <version>`, and the platform refuses with
**412** if the stored version has moved. Nothing is partially written.

The obstacle is the client API. `Xrm.WebApi.updateRecord` takes an entity name, an id and a data
object. **There is no parameter for a request header**, so `If-Match` cannot be sent through it and
the mechanism is unreachable. The alternatives were: accept last-write-wins, re-read before every
write and compare fields ourselves, or send the request by a route that can carry a header.

### Decision

Concurrency-controlled reads and writes go through a `WriteTransport` — a same-origin `fetch` to the
organisation's own Web API — and **only** through it. Everything else continues to use `Xrm.WebApi`.

The transport is confined to `apps/web/src/platform/writeTransport.ts`. `XrmCrmAdapter` implements
`IConcurrencyControlledWrites` on top of it, and the service layer above calls the adapter. React
never composes a URL, never handles an ETag and never calls `fetch`.

An adapter constructed without a transport **refuses** the versioned operations rather than falling
back to an unguarded write. A silent downgrade to last-write-wins is the failure this exists to
prevent, and a fallback would reintroduce it invisibly.

### Why this is not a security change

A web resource is served from the organisation's own host. A same-origin request carries the user's
session, and CRM applies exactly the security it applies to `Xrm.WebApi`: the same identity, the same
roles, the same row-level rules. Only the mechanism for attaching a header differs. No credential is
stored, no token is handled by the workspace, and no authorisation decision moves into the browser.

### Consequences

- The workspace has one file that speaks HTTP, rather than transport detail spread through
  components. Retargeting on-premise is a change to that file.
- `credentials: 'same-origin'` is stated explicitly. The default would usually do the right thing,
  but a write that silently lost its credentials would fail as an authorisation error and look like
  a permissions problem.
- **`If-Match: *` is never used.** It asserts that the record *exists*, not that it is unchanged, so
  a write carrying it overwrites whatever version is there. It reads like a safety mechanism and is
  not one (KI-68, `spike-concurrency.mjs` check 4).
- Every write sends `Prefer: return=representation,odata.include-annotations="*"`. A plain PATCH
  answers `204 No Content` **with no ETag**, leaving the caller holding the version it read — already
  stale — so its next legitimate save fails looking exactly like a conflict (KI-70). The two
  directives are **joined, never substituted**: `Prefer` is a list, and replacing it is the Phase 4
  defect that silently dropped annotations from every paged read.

### Evidence

`spike-concurrency.mjs` 16/16; `smoke-browser-writes.mts` 27/27 against the organisation, including
a deliberately stale write that returned 412 **and left the stored values untouched**.

---

## ADR-DCP-19 — Duplicate submission is prevented by a client-chosen primary key, not by the UI

**Status:** Accepted (Phase 6)
**Related:** ADR-DCP-18, KI-71

### Context

A collector double-clicks Save. Or the network drops after the request reached the server but before
the response came back, and the client — correctly believing nothing was saved — retries. The second
case is the dangerous one, and it is the one a disabled button does nothing about: the button is
disabled on a client that has no idea the write already succeeded.

`Xrm.WebApi.createRecord` generates the id server-side, so every call is a new record by
construction. There is no request the client can repeat safely.

### Decision

A record is created at an id **the caller chooses**, with `If-None-Match: *`, which turns the
platform's upsert-by-id into create-only.

- The form generates the id **when it opens**, not when Save is pressed. This is the whole mechanism:
  an id minted per click would be fresh every time and would guard nothing.
- A repeat returns **412**, which `createIdempotent` reports as `{ created: false }` — **not an
  error**. The record the user asked for exists, which is what they wanted; raising an error over a
  correct outcome would be the wrong conversation.
- A stale `If-Match` write and a duplicate `If-None-Match` create both fail with 412, and the adapter
  tells them apart **by which request it made**, never by parsing the platform's message. Message
  text is not a contract.

### What this does not cover

- **It is per-id, not per-content.** Two genuinely different submissions carrying two different ids
  both succeed, as they should. Nothing here detects that a collector logged the same call twice from
  two screens — that would be a business duplicate rule, and none is in evidence.
- **It does not survive a page reload.** A reloaded form mints a new id, so a retry after a refresh
  creates a second record. Persisting the id across a reload would need somewhere to persist it, and
  the case for that has not been made.
- **It is not a transaction.** It makes one create idempotent. A multi-record operation that fails
  halfway is not rolled back by this mechanism.
- It applies to **create** only. An update is protected by ADR-DCP-18's version check instead, which
  answers a different question: not "have I sent this already" but "has someone else moved it".

### Verified rather than assumed

The concern with an upsert-shaped create is that the platform might treat it as an update and skip
the Create-stage pipeline. `spike-idempotent-create.mjs` (10/10) proved otherwise on the
organisation: **`DefaultStatusAssigner` and `ActivitySubjectComposer` both fired**, so the row lands
in the state the rest of the system expects. The same spike confirmed that without the
`If-None-Match` guard a second row **is** created — the guard was tested by removing it.

---

## What the layering buys

```
React form          →  no column names, no bindings, no ETags, no HTTP
ActivityService     →  canonical field → qdb_ column; bind → navigation property
@dcp/domain         →  decides whether and what, with no platform at all
XrmCrmAdapter       →  versioned reads/writes, 412 → CrmConcurrencyError
WriteTransport      →  the only file that calls fetch
```

A save has **three** outcomes, and they stay distinct all the way up:

| Outcome | What it means | What the form offers |
|---|---|---|
| refused | The domain declined — a missing field, a transition the matrix forbids | The reason, next to the field |
| conflict | Someone else changed the record between the read and the write | Reload, then try again |
| thrown | Anything else — a server-side lifecycle refusal, an authorisation failure, a dropped connection | Itself, unchanged |

Collapsing conflict into "save failed" produces a retry button that cannot succeed. Collapsing a
lifecycle refusal into "conflict" tells a user to reload when reloading will not help. The message a
conflict carries is deliberately free of HTTP and ETag vocabulary, because it reaches a collector.

The client-side transition check is a **duplicate** of the server matrix, never a substitute:
`StatusTransitionValidator` refuses the same moves in the plugin, proved live for `Cancelled → Open`
and covered by `StatusTransitionValidatorActivityTests`. React button visibility is UX.
