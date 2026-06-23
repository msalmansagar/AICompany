═══════════════════════════════════════════════════════════════════════
GOVERNANCE AND SECURITY AUDIT — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       phase-5-audit.md
Prepared by:    Auditor — Maqsad AI
Date:           2026-06-12
Version:        1.0
Review Scope:   brd.md, phase-2-arch.md, phase-3-tech.md, code-review.md
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — SECURITY FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
SEC-AUD-001 — Cross-SOP StepId Injection (CRITICAL — CONFIRMED)
─────────────────────────────────────────────────────────────────────

Severity: HIGH
Status: Identified by Code Review (SECURITY-NOTE-01); confirmed by Audit.

Finding: The CreateProcessFromSopPlugin accepts a StepAssignments JSON
parameter containing sopStepIds. The current implementation validates
GUID format but does not validate that each sopStepId belongs to the
SOP identified by the SopId input parameter.

An authenticated Dataverse user with BA privileges could craft a POST
to the Custom API with sopStepIds from a different SOP. The plugin
would create qdb_work_item_steps referencing the correct new process but
with assignment data intended for a different SOP's steps — constituting
a data integrity violation and potentially a privilege escalation vector
if the target SOP belongs to a different business unit.

Remediation: After loading sopSteps for the requested SOP (Step 5 of
the plugin algorithm), build a HashSet<Guid> of valid sopStepIds.
For each assignment in StepAssignments, validate the sopStepId is in
this set. If not, throw InvalidPluginExecutionException with message
"One or more StepAssignment sopStepIds do not belong to the requested SOP."

This is DEFECT-SOP-001 in the QA register. Must be fixed before UAT.

─────────────────────────────────────────────────────────────────────
SEC-AUD-002 — Plugin Runs as Calling User (PASS)
─────────────────────────────────────────────────────────────────────

Severity: N/A — PASS
The plugin uses context.UserId for IOrganizationService creation.
No elevated service account. Dataverse security role enforcement applies
to all plugin operations. Confirmed in architecture (Section 6).

─────────────────────────────────────────────────────────────────────
SEC-AUD-003 — StepAssignments JSON Deserialisation (PASS WITH NOTE)
─────────────────────────────────────────────────────────────────────

Severity: LOW
Status: Mitigated; note for completeness.

The plugin uses System.Text.Json.JsonSerializer (not Newtonsoft.Json).
System.Text.Json does not execute arbitrary code during deserialisation
and does not support polymorphic type loading by default.
The target type (List<StepAssignment>) is a concrete sealed class with
primitive properties — no injection vector via type confusion.

Note: Validate that StepAssignment.cs does not use [JsonDerivedType]
or JsonSerializerOptions.IncludeFields = true in the production build.
No such patterns are present in the reviewed code.

─────────────────────────────────────────────────────────────────────
SEC-AUD-004 — SOP Canvas: postMessage Origin Check (PASS)
─────────────────────────────────────────────────────────────────────

The SOP canvas does not use the CRM Advanced Filter Page (FetchXML
builder) — SOP steps do not have FetchXML conditions. No postMessage
listener is added for the SOP canvas. The existing postMessage security
architecture (origin validation — CWFD-001 Section 15) is unchanged.

─────────────────────────────────────────────────────────────────────
SEC-AUD-005 — OWASP Top 10 Check (SOP Feature Scope)
─────────────────────────────────────────────────────────────────────

| OWASP Category | Status | Notes |
|----------------|--------|-------|
| A01 Broken Access Control | PASS | Dataverse security roles enforced at platform + RoleDeletionGuardPlugin |
| A02 Cryptographic Failures | N/A | No new cryptographic operations; inherits CRM session |
| A03 Injection | PASS (with SEC-AUD-001 fix required) | JSON validated; no SQL; no eval() |
| A04 Insecure Design | PASS | Architecture is additive; no new attack surface beyond the Custom API endpoint |
| A05 Security Misconfiguration | NOTE | GATE-BUILD-03: entity deployment must be to managed solution, not Active layer — this must be verified at deployment time |
| A06 Vulnerable Components | PASS | No new external npm packages |
| A07 Auth Failures | PASS | CRM session inherited; no new auth mechanism |
| A08 Software and Data Integrity | PASS (with SEC-AUD-001 fix) | Plugin transaction enforces integrity |
| A09 Logging Failures | NOTE (see SEC-AUD-006) | |
| A10 SSRF | N/A | No new server-side HTTP calls |

─────────────────────────────────────────────────────────────────────
SEC-AUD-006 — Plugin Logging (ADVISORY)
─────────────────────────────────────────────────────────────────────

Severity: LOW — ADVISORY
The reviewed plugin code does not include structured logging (ITracingService).
The Dataverse ITracingService is the standard mechanism for plugin
diagnostics. Without it, failed plugin executions in production emit
only the exception message to the Dataverse trace log — no operation
context (userId, sopId, processName, step count).

Recommendation: Inject ITracingService and log at entry (sopId, processName,
step count) and at each major phase boundary. This is standard practice
per Constitution Article XIV (Observability Standards). Not a release
blocker but must be added in the implementation sprint.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — GOVERNANCE FINDINGS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

─────────────────────────────────────────────────────────────────────
GOV-AUD-001 — Audit Trail Coverage (ADVISORY)
─────────────────────────────────────────────────────────────────────

Severity: MEDIUM — ADVISORY

The BRD and architecture specify that SOPs govern organisational
operational procedures. Ops Excellence publishing, retiring, and
modifying SOPs are governance events. Dataverse provides automatic
audit logging if entity-level auditing is enabled (Organisation Settings
→ Auditing → Entity-level auditing for qdb_sop, qdb_sopstep,
qdb_sopoutcome, qdb_role).

Finding: The solution delivery does not include an instruction to
enable entity-level auditing on the new entities. If auditing is not
enabled at deployment time, SOP publication and retirement events will
not be captured in the Dataverse audit log.

Recommendation: The deployment runbook (Section 10 of architecture
document) should include a step: "Enable audit logging on qdb_sop,
qdb_sopstep, qdb_sopoutcome, and qdb_role entities via Organisation
Settings." This is a one-time configuration item for the system
administrator, not a code change.

─────────────────────────────────────────────────────────────────────
GOV-AUD-002 — SOP Published-to-Retired Transition Gap (ADVISORY)
─────────────────────────────────────────────────────────────────────

Severity: LOW — ADVISORY

The BRD does not define whether a SOP can be re-published (Retired →
Published). The architecture does not define this transition. If Ops
Excellence retires a SOP and later realises it was an error, there is
no defined recovery path (they would need to create a new SOP).

Recommendation: Clarify the status machine in a future BRD revision.
For v1, the implementation should prevent Retired → Published transitions
in the SOP canvas command bar (hide the Publish button for Retired SOPs).
The adapter.updateSop() call should include a client-side guard. The
Dataverse security role does not prevent this status change at the
platform level — a plugin guard would be needed for enforcement.
Flag as a post-v1 refinement.

─────────────────────────────────────────────────────────────────────
GOV-AUD-003 — Data Residency (CONFIRMED PASS)
─────────────────────────────────────────────────────────────────────

The feature operates entirely within the existing Dataverse org
(org5869857f.crm4.dynamics.com — West Europe region). No new data
flows outside this org. No new external API calls. No telemetry. The
data residency findings from the DFE engagement (West Europe → Qatar
North migration concern) do not apply to this project — qdb_ entities
are within the CRM org's own schema and the client has accepted the
West Europe data centre for this engagement.

─────────────────────────────────────────────────────────────────────
GOV-AUD-004 — Managed Solution Constraint (CONFIRMED PASS)
─────────────────────────────────────────────────────────────────────

The architecture explicitly states: "Never import into the Default
Solution (Active layer) — constitution Article XI." The deployment
sequence imports the solution as a managed solution. This is confirmed
as the correct pattern. The new entities (qdb_role, qdb_sop, etc.) will
have the qdb_ publisher prefix enforced by the managed solution.

─────────────────────────────────────────────────────────────────────
GOV-AUD-005 — License Compliance (CONFIRMED PASS)
─────────────────────────────────────────────────────────────────────

No new npm packages are introduced. The existing NOTICES.md (required
for EPL-2.0 elkjs attribution from CWFD-001) is unchanged. The C#
plugin assembly uses only Microsoft.CrmSdk (already present) and
System.Text.Json (included in .NET runtime). No new license obligations.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — FINDINGS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| ID | Category | Severity | Status | Blocking? |
|----|----------|----------|--------|-----------|
| SEC-AUD-001 | Security — Injection | HIGH | Must fix before UAT | YES |
| SEC-AUD-002 | Access Control | PASS | — | No |
| SEC-AUD-003 | Deserialisation | LOW (note) | No action required | No |
| SEC-AUD-004 | postMessage | PASS | — | No |
| SEC-AUD-005 | OWASP Top 10 | NOTE on A05 | Deployment checklist item | No |
| SEC-AUD-006 | Observability | ADVISORY | Implement in sprint | No |
| GOV-AUD-001 | Audit Trail | ADVISORY | Deployment checklist item | No |
| GOV-AUD-002 | Status Machine gap | ADVISORY | Post-v1 refinement | No |
| GOV-AUD-003 | Data Residency | PASS | — | No |
| GOV-AUD-004 | Managed Solution | PASS | — | No |
| GOV-AUD-005 | License Compliance | PASS | — | No |


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT: APPROVED WITH CONDITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The feature is approved for delivery subject to:

1. SEC-AUD-001 fix (DEFECT-SOP-001): Cross-SOP StepId validation must
   be implemented in CreateProcessFromSopPlugin before UAT.

2. SEC-AUD-006 advisory: ITracingService logging added to the plugin
   in the implementation sprint.

3. GOV-AUD-001 advisory: Entity-level auditing for all four new qdb_
   entities added to the deployment runbook.

4. GATE-BUILD-03 (from CEO arch approval): Client written confirmation
   that new entities can be deployed to org5869857f before Sprint 1 begins.

═══════════════════════════════════════════════════════════════════════
END OF AUDIT — CWFD-002
Auditor — Maqsad AI | 2026-06-12
═══════════════════════════════════════════════════════════════════════
