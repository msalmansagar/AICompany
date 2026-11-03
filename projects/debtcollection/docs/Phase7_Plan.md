# Phase 7 — revised work packages and estimate

**Baseline for implementation, 2026-09-20.** Supersedes the 13.00 h discovery estimate, which is
retained in the tracker for traceability.

## The arithmetic correction

The discovery-stage package list totalled **16.00 h**, not the 13.00 h stated beneath it — the total
was written as a judgement rather than summed from the rows. The client caught it. Every total below
is summed from its own column.

## Scope change since discovery

| Change | Effect |
|---|---|
| SMS contract confirmed by QDB | Removes inference risk; narrows WP4 to three fields |
| WhatsApp contract confirmed | Closes KI-78; WhatsApp is unblocked |
| Email boundary confirmed | No dispatcher work at all |
| Warning Letters **removed** | −0.5 h and one blocked package deleted |
| Bulk SMS **added** | +new packages |
| Bulk Email **added** | shares the same executor |
| Bulk resumability, idempotency, progress | The largest single addition |

## Packages

| # | Package | Hours | Depends on | State |
|---|---|---:|---|---|
| 1 | Canonical communication domain model — request, channel, recipient, refusal codes | 1.0 | — | ready |
| 2 | Eligibility gate — native channel restrictions, pluggable for the future QDB rule | 1.5 | 1 | ready |
| 3 | **Native-activity idempotency spike** — does `fax`/`email` accept upsert-by-id? | 1.0 | — | **first** |
| 4 | Fax adapter — SMS (`faxnumber`, `qdb_message_body`, `qdb_sender`) | 1.5 | 1, 3 | ready |
| 5 | Fax adapter — WhatsApp (+ `qdb_language`, `qdb_whatsapptemplate`, `qdb_otp`) | 1.0 | 4 | ready |
| 6 | Email adapter — ActivityParty sender/recipient, regarding | 1.5 | 1, 3 | ready |
| 7 | Template model, rendering, synthetic `P7-` set | 1.5 | 1 | ready |
| 8 | Unified communication history read model, server-paged | 1.5 | — | ready |
| 9 | Single-send Communication Center (React) | 2.0 | 2, 4, 5, 6, 7 | ready |
| 10 | Bulk population resolver — selected set **and** filter definition, server-side | 1.5 | 1, 8 | ready |
| 11 | Bulk bounded-batch executor — deterministic ids, checkpoint, per-recipient results | 2.5 | 3, 10 | partial¹ |
| 12 | Bulk progress, results, resume and cancel UI | 2.0 | 11 | partial¹ |
| 13 | Production-composition tests — real session factory, real configuration | 1.0 | all | ready |
| 14 | Live Cloud smokes, `SMOKE-` isolation and guaranteed cleanup | 1.5 | all | ready |
| 15 | Docs, ADR-DCP-20 (bulk idempotency), Phase 7 closure | 1.0 | all | ready |
| | **Total** | **22.00** | | |

¹ **Partial**: in-session batching, deterministic idempotency and per-recipient results need no new
schema and proceed now. **Resumption after a browser close** needs the durable run header proposed in
KI-84, and is held until that schema is approved.

## Expected completion

**Start + 22.00 effective execution hours.** Deliberately not a wall-clock date: the Phase 6 close
showed a recorded start can contain long idle gaps, and quoting a calendar date from one misreports
both the estimate and the eventual variance.

Calibration: Phase 6 delivered comparable breadth in ~6h20m effective against a 36.50 h estimate.
This is ~3.5× that actual, which reflects real additional work — two native-activity adapters with a
party-list model, an unproven idempotency assumption, and a bulk executor with checkpointing — rather
than restored padding.

## Dependencies and risks

| Risk | Impact | Handling |
|---|---|---|
| **`fax`/`email` may not accept upsert-by-id** | Bulk idempotency design collapses; a retry sends twice | WP3 spikes it **first**, before any send path exists. Phase 6's approach is not assumed to carry over |
| KI-84 run header unapproved | No cross-session resume | Structural safety does not depend on it; only resumption is held |
| KI-79 — no authoritative Contact Hold | Gate cannot express QDB policy | Native restrictions honoured, never mislabelled; gate stays pluggable |
| KI-83 — dispatcher absent in Cloud | Delivery unprovable here | Status language fixed: **Record Creation Proven — Delivery Unproven** |
| Bulk touching real customers | Unacceptable | No dispatcher installed in the sandbox, plus `SMOKE-`-only recipients and verified cleanup |

## Testing strategy

Through the **production composition path**, from the start rather than at closure:

```
main.aspx → deployed workspace → createCrmSession() → real configuration
         → Communication Service → native Fax/Email → Dataverse read-back
         → Unified Communication History
```

Phase 6's lesson is now a standing rule: **tests must exercise production assembly, not construct
correct dependencies themselves.** The `session.test.ts` pattern — drive the real factory, assert a
request actually leaves — is extended to every Phase 7 service.
