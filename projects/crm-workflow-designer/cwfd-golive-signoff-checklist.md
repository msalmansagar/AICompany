# CWFD — Go-Live Sign-Off Checklist

| Field | Value |
|---|---|
| Product | CRM Workflow Designer (web resource, `org5869857f`) |
| Purpose | Record sign-off on the CEO go-live conditions before production release |
| Status | Codeable conditions CLOSED; **5 governance/QA sign-offs outstanding** |
| Date raised | 2026-07-21 |
| Related | CEO Phase-7 verdict (approved with conditions); PRs #33, #34, #36 (merged) |

---

## 1. Conditions already satisfied (no sign-off required)

Verified in code and merged to `main`. Listed for completeness / audit trail.

| ID | Condition | Evidence |
|---|---|---|
| GC-1 (code) | Audit writes on SAVE_DRAFT + PUBLISH | `useWorkflowSave.ts` (`SAVE_DRAFT`), `usePublish.ts` (`PUBLISH`) |
| GC-3 | No hardcoded secrets / prod env fallbacks | No secrets in tracked source; only hardcoded URL is dev-mode-gated |
| GC-6b | `assertGuid` at write boundaries | ~65 call sites across both adapters + save hook |
| GC-6a | OData search sanitisation | PR #36 — `escapeODataLiteral()` on all `$filter` search |
| GC-6c | `console.*` gating | PR #36 — `logError()`, stripped from prod bundle |
| GC-6d | Delete-audit logging | PR #36 — `DELETE` audit record per deleted entity |

---

## 2. Outstanding sign-offs (BLOCKING production go-live)

Each item needs the named owner to confirm and sign. These are environment /
governance / QA actions that cannot be resolved in application code.

### GC-1 (config half) — Native Dataverse audit enabled on `qdb_*` entities
- **Owner:** QDB CRM Platform Team
- **Confirm:** Dataverse table-level auditing is enabled for `qdb_work_item_record_type`, `qdb_work_item_steps`, `qdb_outcome`, `qdb_outcomeworktasks` (and SOP tables if in scope) in the production environment.
- **Evidence to attach:** Screenshot / export of audit settings per table.
- **Signed:** ____________________  **Date:** __________

### GC-2 — Web resource shipped in a managed solution layer (prod)
- **Owner:** ALM / Release Manager
- **Confirm:** The `qdb_form_runtime` / workflow-designer web resource is imported into production as part of a **managed** solution (not unmanaged).
- **Evidence to attach:** Solution export manifest showing managed = true.
- **Signed:** ____________________  **Date:** __________

### GC-4 — Security roles: Write/Append/AppendTo on `qdb_*` restricted to Process Manager
- **Owner:** QDB CRM Platform Team (Security)
- **Confirm:** Only the Process Manager role holds Write / Append / AppendTo on the `qdb_*` workflow entities in production; no broad/org-wide write grants remain.
- **Evidence to attach:** Role privilege export for the `qdb_*` entities.
- **Signed:** ____________________  **Date:** __________

### GC-5 — TC-070 performance test recorded (≥30 FPS @ 50 nodes during drag)
- **Owner:** QA Engineer
- **Confirm:** TC-070 run against a 50-node process; sustained ≥30 FPS while dragging a node.
- **Evidence to attach:** Recorded FPS measurement / profiler capture + pass/fail.
- **Signed:** ____________________  **Date:** __________

### GC-6 — Tech-lead written acceptance of the 30-day remediation plan
- **Owner:** QDB Technical Lead
- **Confirm:** Written acceptance that the remediation items (OData sanitisation, `assertGuid`, console gating, delete-audit logging) are delivered (see PR #36) and any residual items are accepted with an agreed timeline.
- **Evidence to attach:** Signed acceptance note / ticket reference.
- **Signed:** ____________________  **Date:** __________

---

## 3. Final go-live authorisation

Once all five items above are signed, the go-live authority records final approval.

- **All GC-1..6 conditions satisfied:** ☐ Yes
- **Go-live authorised by:** ____________________ (CEO / Release Authority)
- **Date:** __________
