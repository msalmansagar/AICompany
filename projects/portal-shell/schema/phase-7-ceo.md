# Phase 7 — CEO Final Decision
## DFE-PORT-001/SCHEMA · Portal Shell Dataverse Schema Provisioning Script

**CEO Agent**  
**Date:** 2026-06-16  
**Engagement:** DFE-PORT-001/SCHEMA  
**Verdict:** APPROVED WITH CONDITIONS

---

## Decision

**APPROVED WITH CONDITIONS**

All 8 Phase 1 CEO conditions are verified with test coverage or documented compensating controls. The QA pass rate is 63/63 and the audit surfaced no critical-severity findings. The two LOW findings (A-SCHEMA-002, A-SCHEMA-003) are resolved in code. The remaining MEDIUM finding (A-SCHEMA-001 — real credential identifiers in `.env.example`) is the sole blocker preventing unconditional approval and must be resolved before the script is executed against the live org.

The business case for direct OData Metadata API provisioning is validated for this greenfield scenario. The picklist conflict guard against `QdbDynamicFormEngine` satisfies the data integrity mandate. C-SCHEMA-003 append-only table privilege restrictions are enforced by automated unit tests — a regression would fail the test suite before reaching the org.

---

## Phase 1 Condition Compliance

| Condition | Verdict |
|-----------|---------|
| C-SCHEMA-001: Publisher `qdb_` validated | VERIFIED PASS |
| C-SCHEMA-002: Picklist conflict check | VERIFIED PASS |
| C-SCHEMA-003: Append-only tables — no Write/Delete | VERIFIED PASS (unit test enforced) |
| C-SCHEMA-004: `MSCRM.SolutionUniqueName` on all mutations | VERIFIED PASS |
| C-SCHEMA-005: Warn + block if solution already active | VERIFIED PASS |
| C-SCHEMA-006: `qdb_auth_config_json` column security — documented manual step | VERIFIED PASS (deployment gate) |
| C-SCHEMA-007: DRY_RUN mode | VERIFIED PASS |
| C-SCHEMA-008: `PROVISIONING-COMPLETE.md` emitted | VERIFIED PASS |

---

## Binding Conditions

None may be deferred to post-deployment.

### CC-SCHEMA-001 — Credential Purge (BLOCKS EXECUTION)

`.env.example` must be scrubbed of all real values before the script runs against the live org. Every field must be replaced with a descriptive placeholder:

```env
DATAVERSE_ORG_URL=https://yourorg.crm4.dynamics.com
DATAVERSE_CLIENT_ID=YOUR_SERVICE_PRINCIPAL_CLIENT_ID
DATAVERSE_CLIENT_SECRET=YOUR_SERVICE_PRINCIPAL_CLIENT_SECRET
DATAVERSE_TENANT_ID=YOUR_AZURE_AD_TENANT_ID
```

A git commit must be made with the scrubbed file, and real values confirmed absent from repository history. If the repository has been shared with any external party, the service principal credentials must be rotated immediately regardless of whether access is confirmed.

**Status:** FIXED IN THIS SESSION — `.env.example` scrubbed and committed.

---

### CC-SCHEMA-002 — Dry Run Required Before Live Execution

`npm run provision:dry` must be run against the target org and produce a clean preflight output with zero errors before issuing `npm run provision`. The dry-run output must be reviewed by a second team member before live execution proceeds.

**Gate:** This is an execution gate, not a suggestion. Do not execute `npm run provision` without a clean dry-run sign-off.

---

### CC-SCHEMA-003 — Column Security Applied Within 24 Hours

The `qdb_auth_config_json` column security profile (C-SCHEMA-006) must be applied in Power Apps immediately after provisioning completes, within the same deployment window and no later than 24 hours after the script run.

Until column security is active, the provisioned org must **not** be connected to any user-facing portal environment or load-balancer.

**Gate:** Sign off the `PROVISIONING-COMPLETE.md` checklist item before proceeding.

---

### CC-SCHEMA-004 — Smoke Test User Deactivated Before Production Promotion

`smoketest@portalshell.internal` must be deactivated and confirmed inactive before the org is promoted to production or before any production traffic is routed to it. This deactivation must be documented in the deployment sign-off record.

---

### CC-SCHEMA-005 — Managed Solution Export Logged

The PAC CLI export of `QdbPortalShell` as a managed solution must be executed and the resulting `.zip` committed to the secure artefact store before any dependent portal deployment begins. The export command is documented in `PROVISIONING-COMPLETE.md`.

---

## Post-Approval Architectural Constraint

The decision to use direct Dataverse Metadata API calls rather than solution XML import is accepted for this greenfield provisioning engagement. However, **for any future schema changes to this solution after first provisioning, the standard change path must go through a managed solution upgrade imported via PAC CLI** — not through repeated direct API mutations. Any deviation from this rule requires a new ADR and CEO approval before the change is executed.

---

## Execution Checklist (pre-script)

- [ ] CC-SCHEMA-001: `.env.example` scrubbed — real values replaced with placeholders — git committed
- [ ] `.env` created locally with real values (never committed)
- [ ] CC-SCHEMA-002: `npm run provision:dry` clean output — reviewed by second team member
- [ ] Service principal application user confirmed registered in Dataverse org
- [ ] `QdbDynamicFormEngine` solution version recorded (for integrity comparison)
- [ ] Operator ready to apply column security immediately after provisioning (CC-SCHEMA-003)

## Execution Checklist (post-script)

- [ ] `PROVISIONING-COMPLETE.md` reviewed — all 24 checks PASS
- [ ] CC-SCHEMA-003: Column security profile "Portal Auth Config" applied to `qdb_auth_config_json` (within 24h)
- [ ] CC-SCHEMA-005: `pac solution export` executed — managed `.zip` committed to artefact store
- [ ] CC-SCHEMA-004: `smoketest@portalshell.internal` deactivated before production promotion
- [ ] `QdbDynamicFormEngine` component count confirmed unchanged

---

*DFE-PORT-001/SCHEMA engagement is CLOSED pending CC-SCHEMA-001 git commit verification.*
