# ADR-DCP-06 — PTP Kept/Broken evaluation against the latest MIS snapshot

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo
**Drives:** FR-055/057/058/061/064, SC-02; §7 of `../phase-3-arch.md`. **Depends on:** ADR-DCP-05.

## Context
There is **no Payments feed in Phase 1** (P2: FR-062/123). SC-02 requires a PTP past its promised date "with no
matched payment" to be flagged Broken and escalated. MIS ingest is **batch**, so a payment made near the promised
date may not reduce arrears until the next ingest — risking a **false Broken flag and a false escalation**
(CEO note 2).

## Decision
1. **Kept** = the next MIS ingest shows arrears reduced by **≥ the promised amount** (Partially Kept if reduced
   by less), **or** an officer marks it Kept with a reason (`POST /ptp/:id/mark-kept`) — the **correction path**.
2. **Broken** = promised date passed **and** the **latest** snapshot does not show the required arrears drop.
   Evaluation runs as a pg-boss job **after each ingest**, so it always reads the newest snapshot. A broken PTP
   writes a broken-PTP `qdb_collectionaction` and, after a configurable count of broken PTPs, escalates the case
   to the supervisor queue.
3. **Batch-latency mitigations (all required):** (a) always evaluate against the latest snapshot, never a stale
   one; (b) do not auto-escalate on the first ingest after the promised date if that ingest post-dates the
   promise by less than one ingest cycle — give the payment one cycle to land; (c) the manual Kept mark instantly
   reverses a false Broken and is itself audited (FR-061).
4. The PTP reminder (FR-056) is sent one day before the due date subject to the stop-contact + consent gate; a
   `stopContact` customer receives no reminder and the block is logged (FR-064).

## Consequences
**Positive:** SC-02 is satisfied with no payment-event source; the MIS arrears-drop is a valid "matched payment"
signal (CEO §7c); false Broken is reversible and audited.
**Negative:** residual false-escalation risk on noisy batch timing (Skeptic challenge 3) — QA must test the
near-promised-date payment case; when the Payments feed arrives (P2) it becomes the authoritative Kept signal and
this rule becomes the fallback.
**Neutral:** evaluation is a scheduled job, not real-time — acceptable at this volume.
