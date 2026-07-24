# DP-2 — Phase 6 Security / Compliance / Governance Audit

| Field | Value |
|---|---|
| Engagement | DP-2 — SLA / Escalation configuration |
| Verdict | **CONDITIONAL PASS** |
| Date | 2026-07-22 |

## Security summary (clean)

- **No injection surface added.** SLA fields are option-set ints, whole numbers, booleans,
  and Dataverse-picker GUIDs — none flow as free text into an OData `$filter`. Search still
  uses `escapeODataLiteral`. OWASP A03: mitigated.
- **No secrets in source.** `crm-api-client.js` validates all identity from env, fails fast.
- **Append-only audit** preserved (`logAuditEntry` uses createRecord only). Enterprise/
  multi-tenant rules PASS (no hardcoded GUIDs/thresholds; option codes are named constants).
- **PDPPL / data residency: cleared for DP-2.** Escalation lookups store only reference GUIDs
  (systemuser/team/qdb_role) within the same Dataverse tenant; no new external/cross-border
  data flow.

## Fixed in this branch (code)

- **GA-3 [HIGH] — option-set code drift.** Codes were declared independently in the
  provisioning script and `WorkflowTypes.ts`. Extracted to a single source
  `scripts/sla-option-codes.js` (consumed by `add-sla-fields.js`) + a cross-check test
  (`slaOptionCodes.test.ts`, 4 assertions) that fails if the TS maps ever drift. 86 tests green.
- **GA-7 [LOW] — provisioning i18n.** `LANG` now reads `process.env.DATAVERSE_LANG ?? 1033`.

## Governance actions — MUST close before production go-live (human/org, not code)

These fold into the standing CWFD go-live conditions where noted.

- **GA-1 [CRITICAL] — Package DP-2 schema in a managed solution (= GC-2).** The 11 fields +
  4 option sets + 3 relationships were provisioned **unmanaged** directly on `org5869857f`. A
  future managed CWFD solution import could overwrite/conflict with them. Export as a managed
  solution, add to source control under `deploy/`, import before any future CWFD upgrade.
  Owner: DevOps. ~2–4h.
- **GA-2 [HIGH] — Enable native Dataverse field auditing on `qdb_work_item_steps` (ties GC-1).**
  Field-level SLA change history is otherwise absent (app audit logs the operation, not the
  field diffs). Best codified as `IsAuditEnabled=true` in the GA-1 managed solution. Owner:
  Dataverse admin. ~1h.
- **GA-4 [MEDIUM] — Document + scope-limit the provisioning service principal (ties GC-4).**
  The SP needs only System Customizer for schema writes; confirm it is not System Administrator,
  document it, and revoke its schema-write access post-provisioning. Owner: Azure AD/DevOps.

## Deferrable follow-ups (not blocking)

- **GA-5** — extend AuditService with an SLA field-level before/after diff (covered at platform
  level once GA-2 native audit is on).
- **GA-6** — `AuditService.reportAuditFailure` uses `window.dispatchEvent(ErrorEvent)`; route
  through `logError` instead. Pre-existing (not DP-2 code); next sprint.
- **A04 / EG-2** — `validateSlaConfig` accepts `PreviousStepCompleted` (hidden in UI). Add a
  validator guard before CWFD-005 ships, or confirm runtime support.

## Status: ready for Phase 7 (CEO-final), with GA-1/GA-2/GA-4 carried as go-live conditions.
