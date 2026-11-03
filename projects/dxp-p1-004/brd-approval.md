# CEO BRD Review — DXP-P1-004
**Date:** 2026-06-18
**Reviewer:** Maqsad AI — CEO
**Decision:** APPROVED WITH CONDITIONS

---

## Executive Assessment

DXP-P1-004 is the correct and necessary capstone for the QDB Digital Experience Platform's four foundational phases. The preceding three engagements established what the platform does — it stores components (P1-001), governs who can access what (P1-002), and defines how it looks (P1-003). This engagement answers the question any regulator or auditor will eventually ask: how do we prove, after the fact, what actually happened? For a government development bank handling home finance applications and service requests under QFC/QCB oversight, that question is not theoretical. It is a compliance obligation.

The BA has correctly characterised the problem. The gap is real: Dataverse `modifiedon` timestamps on individual records cannot answer the correlated question — "what was the exact platform state at the moment Citizen 47291 submitted their home finance application?" The snapshot model proposed here closes this gap in the right way: capture the relevant state atomically at the moment of the trigger event, store it immutably, hash it for tamper evidence, and preserve it for the duration mandated by regulation.

The data model is lean and purposeful. The seven trigger event types are well-chosen. The write-once/read-many enforcement is stated at the API and Dataverse security role layer. The hash integrity approach using SHA-256 on canonicalised JSON is industry-standard and implementable. The two-tier retention model (2-year Dataverse active, 5-year Blob archival to meet 7-year total) is proportionate and cost-aware.

Where the BRD is strong, it is genuinely strong. Where gaps exist, they are real and must be addressed before architecture proceeds. Four of the five open questions carry enough architectural consequence to be resolved at the BRD gate, not deferred. One compliance posture question (NFR-008 / OQ-005) requires a formal client answer for a regulated institution of QDB's profile. The prerequisite gate is correctly stated and must be honoured without exception.

The engagement may proceed to architecture once the conditions below are satisfied.

---

## Strengths

- The problem statement is precise and regulatory in character. The BA correctly identifies that existing record-level timestamps do not answer the correlated, point-in-time platform state question that a QFC auditor would ask. This is not a nice-to-have feature — it is a compliance gap closure.
- Write-once/read-many semantics are stated at both the API layer (FR-002, NFR-004) and the Dataverse security role layer. Enforcing immutability at two independent layers is the correct posture for an audit record.
- SHA-256 on canonicalised (alphabetically sorted) JSON is the correct hash algorithm and serialisation strategy. It is deterministic, computationally inexpensive, and verifiable on read without storing the original input separately from the hash.
- The non-fatal async snapshot model (FR-007: triggering operation returns success even on snapshot failure) is the right design. Blocking a citizen's form submission because the audit write failed would be operationally unacceptable. The error logging to `qdb_snapshot_errors` ensures no snapshot failure is silent.
- The deprecation lifecycle design is coherent. FR-013 (HTTP 409 when deprecating the current latest) prevents an unrecoverable state where no active latest version exists. FR-015 (deprecatedOn is immutable once set) makes the deprecation record itself audit-safe.
- The prerequisite gate in Section 11 is complete and correctly traces back to the DXP-P1-001 Phase 7 CEO decision. The distinction between the P1-001 Phase 7 CEO gate (GGAP-001 via Path A specifically — not Path B) is correctly honoured. The BA has read and applied the CEO's published conditions accurately.
- Seven trigger events cover the full lifecycle of consequential platform actions — citizen submissions, admin promotions, deprecations, token publishes, and RBAC changes. The scope is neither too narrow to be useful nor so broad as to generate unmanageable snapshot volume.
- The 15 acceptance criteria are individually specific, testable, and in most cases directly automatable. AC-012 (hash verification on read) and AC-010 (triggering operation success on snapshot failure) are particularly well-constructed.
- `qdb_snapshot_errors` as a dedicated error log entity is correct. It gives the operations team an auditable record of snapshot failures without polluting the immutable snapshot table.
- The out-of-scope list is well-bounded. Snapshot diffing, citizen access to own snapshots, automatic rollback, and document content storage are all correct deferrals. The boundary between DXP-P1-004 (platform state) and DFE (form field values and uploaded files) is clearly drawn.

---

## Issues Found

1. **[BLOCKER] OQ-001 — Durable queue technology is unresolved and it is an architectural fork.**
   NFR-009 requires that queued snapshot events survive an API restart. This is the right requirement for an audit system — losing a snapshot event because the API process died is not acceptable for a compliance record. However, the choice of queue technology (Azure Service Bus, Azure Storage Queue, or an in-process durable queue like BullMQ backed by Redis) is not a detail — it is an architectural fork that determines deployment dependencies, monitoring surface area, dead-letter strategy, and operational runbook. The architect cannot design the async snapshot pipeline without knowing which queue is available in QDB's Azure subscription. This must be answered by QDB IT / DevOps before architecture begins. It directly drives NFR-009 and the integration point listed in Section 7 ("Durable queue (TBD)").

2. **[BLOCKER] OQ-005 — The form submission hash posture requires a formal QDB Compliance decision, not an architecture judgment.**
   The BRD explicitly excludes form field values and uploaded documents from snapshots (Section 8, Out of Scope). OQ-005 asks whether the `form_submission` snapshot should include a SHA-256 hash of the submitted form data — not the data itself — for tamper evidence. This is not a technical question. It is a compliance posture question. A hash of submitted data is not PII (the data cannot be reconstructed from the hash). Including it gives QDB the ability to prove in a future dispute that the form data was not altered between submission and downstream processing. Excluding it means the snapshot records which form version was used but cannot certify the data submitted against it. For a government bank handling home finance applications under QFC oversight, the stronger tamper-evidence posture (include the hash) is almost certainly the correct answer. But the CEO will not make that determination unilaterally — it requires a formal answer from QDB Compliance before the architect designs the snapshot content schema, because including a data hash changes FR-008 and the snapshot record structure.

3. **[BLOCKER] NFR-008 — User ID-only storage posture requires formal QDB Compliance confirmation for a regulated institution.**
   NFR-008 states that snapshots store only user ID and session ID, not name, email, or document content. This is a defensible PII minimisation posture and is generally correct for an audit record in a privacy-regulated jurisdiction. However, for QDB's specific context — a government development bank subject to Qatar's Personal Data Privacy Protection Law (Law No. 13 of 2016) and QFC regulatory standards — the compliance team must formally confirm that a user ID alone is sufficient to satisfy the identification requirement in an audit scenario. In some audit frameworks, a human-readable identifier (name or national ID) must appear on the record to satisfy the audit reviewer's evidentiary standard. A GUID that requires a cross-reference to a separate user store to resolve to a person may be acceptable, or it may not be. If QDB Compliance requires a hashed national ID or masked name in the snapshot, the data model changes. This confirmation must be obtained before the architect finalises FR-008.

4. **[BLOCKER] OQ-002 — Snapshot volume estimate is required before architecture, not after.**
   OQ-002 asks for the expected snapshot volume per day. The BA correctly identifies this as a storage cost and archival schedule driver. However, it is also a Dataverse capacity constraint driver. Dataverse Memo fields up to 1 MB per snapshot record are expensive at scale. If QDB processes 5,000 form submissions per day and each snapshot carries a 1 MB token JSON blob, the daily write volume to Dataverse is 5 GB — a figure that would immediately exceed the standard Dataverse storage allocation and require a paid capacity add-on. The architect cannot propose a storage architecture, design the archival schedule, or size the Azure Blob tier without this input. QDB Business / IT must provide a volume estimate before architecture begins.

5. **[CONDITION] OQ-003 — Reference code format (predictable vs opaque) has security implications the client must decide.**
   FR-004 proposes a human-readable reference code format of `SNAP-{date}-{userId}`. OQ-003 correctly notes that this exposes user IDs in URLs. For auditor usability, predictable codes are preferable. For security, opaque GUIDs are preferable — a predictable code format allows an authenticated admin to enumerate snapshots by guessing reference codes across user IDs. The decision belongs to QDB Compliance (privacy exposure of user IDs in the URL space of an admin-only endpoint). This is not an architectural decision — it is a client policy decision. The architect cannot finalise FR-004 until QDB Compliance provides a formal answer. If QDB chooses opaque codes, the `qdb_ReferenceCode` format changes, and AC-005 must be updated accordingly.

6. **[CONDITION] OQ-004 — Azure Blob Storage data residency confirmation is a prerequisite gate, not an advisory.**
   OQ-004 asks whether Azure Blob Storage is available and approved for archival of QDB platform data under QCB/QFC data residency requirements. The DXP-P1-001 Phase 7 CEO decision formally escalated data residency for the Dataverse org as a platform-level obligation on QDB IT (Section 2.3 of that decision). The same obligation extends to Azure Blob Storage. If QDB's data residency obligations require data to remain within Qatar or GCC boundaries, the Blob Storage account must be provisioned in a compliant Azure region. If the required region does not have the Azure Blob Storage features needed (e.g. lifecycle management policies for the archival tier), the FR-020 archival strategy may need to be redesigned. This confirmation must be in place before the architect specifies FR-020.

7. **[CONDITION] Snapshot failure non-fatality (FR-007, NFR-003) creates an unacknowledged operational risk for compliance events.**
   The BRD correctly makes snapshot creation non-fatal to the triggering operation. This is the right design for operational availability. However, the BRD does not specify a compensating control for the compliance case. If a `form_submission` snapshot fails and is written to `qdb_snapshot_errors`, the citizen's form submission has been accepted and processed — but the audit record does not exist. Under QFC audit standards, a submission with no associated snapshot is an evidentiary gap. The BRD must specify: (a) what the operational response is when a snapshot failure is detected in `qdb_snapshot_errors` — is there a retry mechanism? a manual reconciliation procedure? a regulatory notification obligation? (b) whether there is an SLA on resolving snapshot failures (e.g. must be retried and succeeded within 24 hours for compliance events). The architect must design the dead-letter and reconciliation path explicitly — silence in the BRD on this point will produce an implementation gap. This is a condition the architect must address in Phase 3, with the retry/reconciliation approach confirmed with QDB Compliance before build begins.

8. **[CONDITION] The 30-second async SLA (NFR-001) has no stated measurement methodology.**
   NFR-001 requires the snapshot to be written to Dataverse within 30 seconds of the trigger event. AC-001 verifies this indirectly by checking that the record exists within 30 seconds. However, there is no stated methodology for measuring the end-to-end latency in production — no mention of a queue publish timestamp, a snapshot creation timestamp, or a latency metric being stored on the snapshot record. Without a stored metric, the SLA cannot be monitored or violated alerting cannot be configured. The architect must include a latency measurement mechanism (e.g. a `qdb_QueuedAt` DateTime field stored when the event is enqueued, compared to `qdb_CreatedOn`) to make the 30-second SLA observable in production.

9. **[ADVISORY] The `qdb_ComponentVersionId` Lookup in the snapshot creates a referential dependency that could complicate long-term record management.**
   FR-008 includes a Lookup from `qdb_platform_snapshots` to `qdb_component_versions`. In Dataverse, a Lookup creates a referential constraint. Over a 7-year retention horizon, the target component version record may be deactivated, its solution may be modified, or it may be involved in solution import/export cycles. If the component version record is deactivated or the Lookup relationship is altered, the snapshot record's FK pointer becomes stale. The architect must specify whether the `qdb_ComponentVersionId` Lookup should be a restrict-delete (prevent version deactivation if snapshots reference it) or a no-cascade (allow version deactivation; snapshot retains the GUID but the Lookup is broken). Given that `qdb_ComponentVersionNumber` is already denormalised on the snapshot (FR-008), the Lookup FK serves only referential navigation, not data integrity. The architect should consider whether the Lookup adds risk without proportionate benefit over the 7-year horizon. This is an architectural judgment call — not a blocker — but it must be explicitly addressed in Phase 3.

10. **[ADVISORY] AC-002 verification methodology ("byte-for-byte") requires clarification.**
    AC-002 states that `qdb_TokenSetJson` "matches the output of `GET /api/tokens/resolve` at the moment of the event, byte-for-byte (verified by comparing hashes)." In practice, the snapshot is written asynchronously up to 30 seconds after the trigger event. If the token set changes between the trigger event and the async write, the "moment of the event" token state must be captured synchronously at trigger time and passed to the queue. If the snapshot service re-fetches the token state at write time (up to 30 seconds later), AC-002 cannot be guaranteed. The architect must specify where in the async pipeline the token state is materialised — at enqueue time (correct) or at dequeue/write time (incorrect). The acceptance criterion should be updated to reflect this distinction. The QA agent must be aware of this when designing the test for AC-002.

11. **[ADVISORY] No access control is specified on `qdb_snapshot_errors`.**
    The error log entity `qdb_snapshot_errors` is defined in the data model but has no corresponding RBAC or NFR coverage. For a compliance-adjacent entity, access should be restricted. If an attacker can read `qdb_snapshot_errors`, they can learn which events failed to produce audit records — a potential compliance manipulation surface. The architect must specify the Dataverse security role and API access policy for this entity.

---

## Open Questions Disposition

| ID | Question | Disposition | Rationale |
|----|---------|-------------|-----------|
| OQ-001 | Durable queue technology available in QDB Azure environment | BLOCKER — must answer before architecture | Drives the entire async snapshot pipeline design. See Issue 1. |
| OQ-002 | Expected snapshot volume per day | BLOCKER — must answer before architecture | Required for storage sizing, Dataverse capacity planning, and archival schedule design. See Issue 4. |
| OQ-003 | Predictable vs opaque reference codes | BLOCKER — client policy decision required before architecture | User ID exposure in URL space requires QDB Compliance sign-off. Determines FR-004 and AC-005. See Issue 5. |
| OQ-004 | Azure Blob Storage availability and data residency compliance | BLOCKER — client confirmation required before architecture | Data residency obligation from DXP-P1-001 CEO decision extends to Blob archival tier. See Issue 6. |
| OQ-005 | Form submission data hash for tamper evidence | BLOCKER — QDB Compliance must decide before architecture | Changes FR-008 snapshot schema. Cannot be resolved by the architect. See Issue 2. |

---

## Assessment of the Prerequisite Gate

The five prerequisites listed in Section 11 are correctly stated and correctly traced to their source decisions. The CEO affirms each gate:

1. **GGAP-001 via Path A ($batch implementation):** Correctly required. The DXP-P1-001 Phase 7 CEO decision explicitly stated that Path B (ADR-only) is insufficient for P1-004 because snapshot accuracy depends structurally on the `isLatest` invariant being reliable. This condition is non-negotiable and cannot be accepted via ADR for this engagement.

2. **POST-1 (GET /versions/latest endpoint):** Correctly required. P1-004 uses this endpoint in FR-022 and FR-023. Without it, the snapshot cannot resolve the current active version.

3. **POST-3 (qdb_deprecated_on provisioned and exposed):** Correctly required. The deprecation lifecycle in FR-011 through FR-015 depends entirely on this field existing in Dataverse and the API.

4. **DXP-P1-002 JWT permissions claim structure frozen:** Correctly required. The `qdb_RbacPolicyJson` snapshot content is derived from the RBAC system. If the permissions claim structure is still in flux, the snapshot schema cannot be finalised.

5. **DXP-P1-003 token resolution API stable:** Correctly required. `qdb_TokenSetJson` is derived from the token resolution output. If the API contract is not stable, the snapshot's token capture logic cannot be implemented reliably.

All five gates must be confirmed in writing before architecture begins. No partial gate clearance is acceptable — the snapshot system is only as reliable as the three upstream systems it draws from.

---

## Assessment of Acceptance Criteria

Twelve of the fifteen acceptance criteria are appropriately specific and directly automatable. Three require amendment:

- **AC-002** requires amendment as noted in Issue 10. The "byte-for-byte" and "at the moment of the event" language must specify that the token state is captured at enqueue time, not at dequeue/write time.
- **AC-001** must be qualified to include a measurement timestamp methodology (see Issue 8) so that the 30-second SLA is verifiable, not just spot-checkable.
- **AC-012** is correctly specified and is one of the strongest criteria in the document — SHA-256 hash verification on read is both testable and meaningful.

The BA should update AC-001 and AC-002 in the BRD addendum before architecture begins. This does not require a full BRD revision — an addendum note on each criterion is sufficient.

---

## Conditions

### BRD-gate conditions (client answers required before architecture phase begins)

1. **OQ-001 must be answered by QDB IT / DevOps before architecture begins.** QDB IT must confirm which durable queue technology is available and approved in QDB's Azure subscription: Azure Service Bus (Standard or Premium), Azure Storage Queue, or an alternative. The answer must be documented in a BRD addendum. The architect must not design the async snapshot pipeline until this is confirmed.

2. **OQ-002 (snapshot volume) must be estimated by QDB Business / IT before architecture begins.** QDB must provide an estimate of expected daily snapshot volume across all seven trigger event types. This is the minimum input required for the architect to size Dataverse storage, design the archival schedule, and propose the Azure Blob tier. The estimate need not be exact — an order-of-magnitude figure (e.g. "fewer than 1,000 per day" or "up to 10,000 per day at peak") is sufficient for architecture purposes. The response must be documented in the BRD addendum.

3. **OQ-003 (reference code format) must receive a formal decision from QDB Compliance before architecture begins.** The decision — predictable format (SNAP-{date}-{userId}) or opaque GUID — must be documented in the BRD addendum with the decision-maker's name and date. This determination affects FR-004, the snapshot query API, and AC-005.

4. **OQ-004 (Azure Blob data residency) must be confirmed by QDB IT / Compliance before architecture begins.** QDB must confirm that Azure Blob Storage in the required region satisfies applicable QCB and QFC data localisation requirements. This confirmation extends the data residency obligation formally accepted in the DXP-P1-001 CEO Phase 7 decision. It must be documented in the BRD addendum before the architect specifies the archival architecture (FR-020, FR-021).

5. **OQ-005 (form submission data hash) must receive a formal answer from QDB Compliance before architecture begins.** QDB Compliance must state whether the `form_submission` snapshot should include a SHA-256 hash of the submitted form data payload. If yes, FR-008 must be updated to include a `qdb_FormDataHash` field and the DFE integration contract (Section 7) must be updated to specify that DFE passes the hash (or the raw payload for server-side hashing) with the trigger call. If no, this must be documented with the decision-maker's name and date.

6. **NFR-008 user ID-only storage posture must be confirmed by QDB Compliance before architecture begins.** QDB Compliance must formally confirm that storing only a user ID (GUID) and session ID in the snapshot satisfies the identification standard required for QFC audit evidentiary purposes. If the confirmation requires adding a hashed national ID or masked name, FR-008 must be updated before architecture begins. This confirmation must be documented in the BRD addendum.

7. **All five prerequisite gates in Section 11 must be confirmed as cleared before architecture begins.** The confirmation date and evidence for each gate must appear in the BRD addendum. No partial gate clearance is acceptable.

### Architecture-phase deliverables (owned by the Architect, resolved in Phase 3)

8. The architect must design the dead-letter and reconciliation path for snapshot failures on compliance-triggering events (`form_submission`, `service_request`). The design must address: retry mechanism, maximum retry interval, escalation path when retries are exhausted, and whether unresolvable failures trigger a regulatory notification obligation. This design must be reviewed with QDB Compliance before build begins.

9. The architect must include a latency measurement mechanism on the snapshot record (e.g. `qdb_QueuedAt` DateTime stored at enqueue time) to make the 30-second SLA (NFR-001) observable and alertable in production.

10. The architect must specify the Dataverse security role and API access policy for `qdb_snapshot_errors`. Access must be restricted to operations-scope personnel; read access must not be available to general `portal-admin` role holders.

11. The architect must resolve the `qdb_ComponentVersionId` Lookup cascade behaviour (restrict-delete vs no-cascade) and document the decision, given the 7-year retention horizon and the availability of the denormalised `qdb_ComponentVersionNumber` field.

12. The architect must specify, in the async pipeline design, whether the token state (qdb_TokenSetJson) and RBAC state (qdb_RbacPolicyJson) are materialised at enqueue time or dequeue/write time. The correct answer is enqueue time — this must be explicit in the architecture document and the AC-002 update in the BRD addendum must reflect this decision.

13. The BA must update AC-001 and AC-002 in a BRD addendum to reflect: (a) the latency measurement methodology for the 30-second SLA; and (b) the enqueue-time capture requirement for token and RBAC state. These updates do not require a full BRD revision and do not delay architecture — they must be completed before QA writes the test plan.

---

## Architecture Gate Status

DXP-P1-004 architecture may begin once all of the following are confirmed:

1. All five prerequisite gates in Section 11 confirmed cleared (dates and evidence documented).
2. OQ-001 answered by QDB IT / DevOps (durable queue technology confirmed).
3. OQ-002 answered by QDB Business / IT (daily snapshot volume estimate provided).
4. OQ-003 answered by QDB Compliance (reference code format decision documented).
5. OQ-004 confirmed by QDB IT / Compliance (Azure Blob data residency compliance confirmed).
6. OQ-005 answered by QDB Compliance (form submission data hash posture confirmed).
7. NFR-008 user ID posture confirmed by QDB Compliance.

Architecture-phase deliverables 8 through 13 above are gates for architecture sign-off, not for BRD handoff. The architect owns them and must resolve them within Phase 3.

---

## Decision Rationale

This BRD is approved with conditions because the business case is correct and necessary, the data model is sound and proportionate, the immutability and hash integrity design is technically appropriate, the retention model is reasonable, and the prerequisite gate is correctly stated and traceable to prior CEO decisions. The 15 acceptance criteria are specific and mostly automatable. The scope boundary between DXP-P1-004 (platform state) and DFE (form data content) is cleanly drawn.

The conditions attached to this approval are not deficiencies in the BA's analysis. All five open questions are correctly flagged. However, four of the five open questions are architectural forks — the architect cannot design the async pipeline, the snapshot schema, the reference code format, or the archival architecture without the client answering them. OQ-005 and the NFR-008 posture carry regulatory exposure under Qatar's privacy law and QFC audit standards that a government development bank cannot leave to engineering judgment.

The prerequisite gate is non-negotiable. The DXP-P1-001 CEO Phase 7 decision explicitly gated P1-004 architecture on GGAP-001 being resolved via Path A (not Path B). The snapshot system's correctness is a function of the upstream systems it draws from. An `isLatest` invariant that can be corrupted by concurrent admin promotions produces incorrect snapshots — which is worse than no snapshot, because an incorrect audit record creates false assurance. This gate will not be waived.

Once the seven BRD-gate conditions above are satisfied, this engagement may proceed to Phase 3 (Architecture) without further CEO review.

---

## Approval Record

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | Maqsad AI CEO | APPROVED WITH CONDITIONS | 2026-06-18 |
| QDB IT / DevOps | — | PENDING — OQ-001 durable queue confirmation required | — |
| QDB Business / IT | — | PENDING — OQ-002 snapshot volume estimate required | — |
| QDB Compliance | — | PENDING — OQ-003, OQ-004, OQ-005, NFR-008 decisions required | — |

---

```
═══════════════════════════════════════════════════
END OF DOCUMENT
DXP-P1-004 Versioning & Snapshots — CEO BRD Approval v1.0
CEO, Maqsad AI
2026-06-18
Decision: APPROVED WITH CONDITIONS
BRD-gate blockers requiring client answer: 5 (OQ-001, OQ-002, OQ-003, OQ-004, OQ-005) + NFR-008 posture confirmation
Prerequisite gates that must be cleared: 5 (from DXP-P1-001 Phase 7 CEO decision)
Architecture-phase deliverables: 6
═══════════════════════════════════════════════════
```
