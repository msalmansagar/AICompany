# ADR-DCP-16 — MIS integration is transport-neutral, and paging is a platform contract

**Status:** Accepted (Phase 4) · **Date:** 2026-09-18 · **Deciders:** user (Phase 4 authorisation), architect
**Relates to:** ADR-DCP-05 (MIS ingest), ADR-DCP-11 (eligibility), KI-52, KI-53.

## Context

Phase 4 had to connect authoritative MIS delinquency information to the Collection domain. Before
writing any of it, the whole machine was searched for the MIS contract: this repository, the wider
AICompany repository, and `D:/QDB/Projects/` including the Debt Collection Platform folder.

**No MIS API exists in evidence.** No endpoint, no request or response schema, no authentication, no
authorisation, no paging mechanism, no continuation semantics, no change feed, no retry contract, no
rate limits, no source timestamps, no observation or record identifiers. The only MIS evidence that
exists anywhere is **two spreadsheet report exports**, and those were read directly: 4,359 rows,
as-of 30/06/2026 (`docs/MISContractEvidence.md`).

So the material available is **MIS data evidence**. It is not evidence of a **MIS transport contract**,
and the distinction decides the shape of everything below.

Separately, the KI-52 lesson from Phase 3 — *an in-memory adapter can validate the same incorrect
assumption as the production code* — made it necessary to establish platform paging behaviour against
the platform before designing anything on top of it.

## Decision

### 1. The source is behind an interface; the transport is nobody's business above it

`IMisDelinquencyService` carries paged detail, a facility position, aggregates and a changed-since
batch. Three implementations exist, and the difference between them is the point:

| Implementation | What it is |
|---|---|
| `MockMisDelinquencyService` | Holds **raw** rows in the evidenced shape and runs the real normalizer on every read, so the awkward cases are exercised everywhere. A test and demonstration provider. **Never live MIS data.** |
| `ApiMisDelinquencyService` | **Refuses every call**, naming what QDB must supply. It refuses even when endpoints are configured, because *a configured URL is not a confirmed contract*. |
| `CachedFallbackMisService` | Live where possible, DCP's own last-known position where not — and never the two confused. |

### 2. Normalization is the boundary, and it is answerable to measured data

No raw MIS payload reaches Collection logic, a repository or React. Every normalization rule exists
because something in the supplied files required it, not because a specification suggested it:

- the `1-30` bucket arrives as a **date** on 1,670 rows (38 % of the population), because the export
  read `1-30` as 30 January. Nothing else in the taxonomy coerces — there is no month 31, 61 or 91 —
  which is exactly why the defect hides: it damages one bucket and that bucket is the largest;
- `First Arrear Date` is a `DD/MM/YYYY` **string** on 4,348 rows;
- 48 rows carry a zero instalment and consequently no ratio;
- leading zeros are already destroyed on 6 identifiers and 50 mobile numbers.

**These are source-profiling evidence, not business rules.** No population statistic is hard-coded as
policy anywhere.

### 3. Server-side paging is a platform contract, designed from measurement

Established against `org5869857f` before the contract was written:

- **a page size is never optional** — asked without `Prefer: odata.maxpagesize`, the platform returned
  all 1,295 rows in one response;
- **the page size is not carried by the continuation link** — following the same link without
  re-sending the header returned the remaining 1,290 rows;
- the link is absolute and its `$skiptoken` is paging-cookie XML, so it is **opaque**;
- `$top` bounds the whole result set and suppresses continuation, so **`$top` is not paging**.

The contract therefore requires `pageSize`, treats the continuation as opaque, re-sends the page size
on every request including continuations, and treats **a short page as not the end** — only the
absence of a continuation ends a walk.

A continuation additionally carries a **fingerprint of the criteria that produced it**, so reusing one
after the filter, sort, search or any source-specific narrowing changed is refused rather than paging
into a population the caller is no longer asking about. `pageSize`, `continuation`, `includeTotalCount`
and `select` are excluded, because none of them changes which rows come back.

### 4. A DCP processing checkpoint is not a MIS source change token

The two are separate fields, and the platform will not claim the second when it only has the first.
Remembering where a full scan got to makes a run **restartable**; only a source-issued change token
would make it **incremental**. A `SourceDelta` run against a source with no change feed is refused
rather than reloading the whole population under a name that says otherwise.

The order is fixed: **retrieve page → normalize → process → persist outcomes → advance checkpoint →
next page.** The checkpoint never advances past work that was not persisted.

### 5. Eligibility gates the case; strategy treats it; neither is decided here

Eligibility runs inside the pipeline on the Phase 3 `IRuleEngine` facade and fails closed.
Strategy runs *after* a case exists, so an unresolvable strategy leaves the case **untreated with a
stated reason** rather than destroying a case MIS says is delinquent. No threshold, matching rule or
fallback strategy exists in either path.

## Consequences

**Positive.** Confirming the MIS contract becomes a provider change, not a domain change. The pipeline,
paging, checkpointing, isolation and orchestration are all real, tested and live-proven today. The
Phase 5 workspace can implement infinite scroll and virtualisation against a contract that already
bounds every read.

**Negative.** Nothing can be claimed about MIS transport, and the gate language must say so:
*MIS Integration Architecture & Processing Pipeline Complete — Production MIS Transport Contract
Pending QDB*. A green Phase 4 is not a green MIS integration, and the report must not let those be
confused.

**Neutral.** The mock is unusually substantial — raw rows, real normalization, fault injection. That is
deliberate: a thin stub would have let the pipeline pass without exercising the data's actual defects.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Implement `ApiMisDelinquencyService` against a plausible REST shape | An invented endpoint is indistinguishable from a real one in code and would quietly become the contract |
| Derive the API contract from the spreadsheet columns | Column structure is data evidence; it says nothing about transport, auth, paging or change semantics |
| Offset/page-number paging everywhere | The platform's own mechanism is an opaque cookie; imposing offsets would misrepresent it and break on any source that cannot offer them |
| Fingerprint nothing, and trust callers to restart paging themselves | The volume tests showed a changed `dpdFrom` silently continuing into the old population |
| Treat the full scan's checkpoint as a delta marker | It would let the platform claim incremental synchronisation it cannot perform |

## Evidence

| Proof | Where |
|---|---|
| Platform paging behaviour, measured before design | `docs/evidence/Phase4_dataverse_paging_spike.txt` (15/16 answered) |
| The contract over it, live | `crm/scripts/smoke-qdb-phase4.mjs` — 22/22 on `org5869857f` |
| MIS contract classification | `docs/MISContractEvidence.md` |
| Volume behaviour, 10K/50K/100K synthetic | `large-volume-paging.test.ts` |
| Restart without reprocessing | `background-sync.test.ts`, `large-volume-paging.test.ts` |
| Replay producing no duplicates | `orchestration-and-replay.test.ts` |
