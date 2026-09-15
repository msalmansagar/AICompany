# ADR-DCP-05 — MIS ingest and thin immutable snapshot strategy

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo
**Drives:** FR-016/017/018/024/027/121/126, NFR-002/014/019; §6 of `../phase-3-arch.md`.

## Context
MIS via the Middleware API is the **sole** delinquency and portfolio feed, returning data **pre-classified into
ten DPD buckets** (D-1, Q-06). The platform never computes DPD or arrears. The portfolio is small-data (~4,900
delinquent accounts). An API-only read fails four needs: case referential integrity, evidence of the value at
the moment of decision, CRM-side rule triggers, and history/trending (facts §5).

## Decision
**Store thin, read live.**
1. A **pg-boss** job (transactional enqueue+write in the same PostgreSQL transaction; MIT; no Redis) runs on a
   configurable nightly schedule against the MIS API for **delinquent accounts only**.
2. Per facility: **upsert** `msst_dcpcustomer` / `msst_dcploanfacility` (mutable, current); **append** a
   `msst_dcpdelinquencysnapshot` row **only when the bucket or arrears changed, or it is month-end** — removing
   ~80% of rows while preserving every decision point and the regulatory month-end position.
3. Every snapshot row carries the MIS `batchReference` and `asOf`, is **append-only** (ImmutabilityGuard, never
   the UI), and stores the bucket **verbatim** as one of the ten MIS values. **NPL / Write-off live on a
   separate account-status field**, not the bucket field.
4. Volatile figures (balance, arrears) are **read live** from the MIS API on screen with an explicit "as of"
   stamp, shown alongside the snapshot value. A failed live read returns `mis_unavailable` and the screen shows
   a staleness banner — never a silent stale number.
5. **Fail loud (NFR-014/019):** each run writes a batch-status record; a failed or SLA-overdue run raises the
   workspace ingest-failure alert (FR-027) and shows on the integration health panel (FR-126).
6. Retention configurable (e.g. daily 13 months, monthly thereafter). Ingest completes < 30 min (NFR-002).
7. A **parity test** between the live path and the snapshot path is required in the architecture, not left to
   QA (ARC-M-002).

## Consequences
**Positive:** audit-grade provenance; CRM-side rules can fire; dashboards/history exist; no full-book replication.
**Negative:** two read paths for the same figure (mitigated by the parity test); ingest is batch, which creates
the PTP-latency problem handled in ADR-DCP-06.
**Neutral:** the change+month-end rule trades a little query complexity for ~80% fewer rows.

## Alternatives considered
| Option | Rejected because |
|---|---|
| Read straight from the API, store nothing | Loses referential integrity, moment-of-decision evidence, all CRM-side automation, dashboards, and history; an MIS outage blanks the collections floor |
| Copy all of MIS into CRM daily | Full-book replication for ~4,900 delinquent accounts; wasteful and still stale |
| Snapshot every facility every run | ~1.4m rows/year for no added decision point over change+month-end |
