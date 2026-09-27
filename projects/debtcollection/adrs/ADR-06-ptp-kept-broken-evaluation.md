# ADR-DCP-06 — PTP Kept/Broken evaluation against the latest MIS snapshot

**Status:** Superseded (2026-09-17) — PTP is a `qdb_collectionactivity` type; evaluation logic retained as a rule · originally Accepted 2026-09-14 · **Deciders:** architect, ceo
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
   writes a broken-PTP `msst_dcpcollectionaction` and, after a configurable count of broken PTPs, escalates the case
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

## Superseded (2026-09-17, Phase 0)
Original text retained above. Superseded because **Master Prompt §26** makes PTP a `qdb_collectionactivity`
with Activity Type = Promise-to-Pay (physical PTP core fields: date, promised amount, status, amount received,
broken date/reason, reschedule count; descriptive fields via Form Engine) — no dedicated `msst_dcpptprecord`
entity, no PTP-specific REST route.

**What survives:** the Kept / Partially Kept / Broken evaluation itself — arrears drop ≥ promised amount on
the latest MIS position, the one-cycle latency grace, the audited manual Kept correction, the reminder under
the stop-contact/consent gate — is retained as a **Rule Engine / background-sync rule** executed after each
MIS synchronisation (see `docs/MISIntegration.md` §6 and ADR-DCP-10). It no longer depends on the retired
PTP entity or on a Fastify endpoint; the manual correction becomes an activity outcome.
