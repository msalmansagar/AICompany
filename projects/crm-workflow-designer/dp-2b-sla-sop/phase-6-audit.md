# DP-2b — Phase 6 Security / Compliance / Governance Audit
# SLA / Escalation Configuration on SOP Template Steps

| Field | Value |
|---|---|
| Engagement | DP-2b — SLA / Escalation on SOP template steps |
| Verdict | **CONDITIONAL PASS** |
| Date | 2026-07-22 |
| Auditor | Maqsad AI — Auditor |
| Predecessor audit | DP-2 phase-6-audit.md (CONDITIONAL PASS) |
| Test baseline | 94 vitest tests green; tsc clean; production build green; 11/11 E2E on org5869857f |

---

## Scope

Diff: `git diff origin/main...HEAD -- projects/crm-workflow-designer/src projects/crm-workflow-designer/scripts`

Files substantively changed by DP-2b:

| File | Change |
|---|---|
| `src/types/WorkflowTypes.ts` | New `SlaFields` interface; `WorkflowStep extends SlaFields` |
| `src/types/SopTypes.ts` | `SopStep extends SlaFields`; `CreateSopStepRequest extends SlaFields`; `UpdateSopStepRequest = Partial<SlaFields> & {...}` |
| `src/services/slaStepFields.ts` | New `copySlaFields(source: SlaFields)` function; `SlaStepFields` Pick-alias retained |
| `src/services/deriveProcessFromSop.ts` | Line 45: `...copySlaFields(sopStep)` spread in `createStep` call |
| `src/hooks/useSopSave.ts` | Lines 87, 99: `...copySlaFields(step)` in createSopStep + updateSopStep |
| `src/services/DataverseAdapter.ts` | `getSopSteps` $select + `mapSopStep`; `createSopStep` + `updateSopStep` SLA wiring |
| `src/services/ODataAdapter.ts` | Same three SOP step methods |
| `src/validators/sopValidator.ts` | `checkInvalidSlaConfig` (VS-07) added to `validateSopForPublish` |
| `src/services/deriveProcessFromSop.test.ts` | New: 3 tests for SLA inheritance (C-1 from Phase 5) |
| `src/validators/sopValidator.test.ts` | New: 3 tests for VS-07 (C-2 from Phase 5) |
| `scripts/sla-schema-lib.js` | New: single-source schema library; both entity scripts delegate here |
| `scripts/add-sla-sopstep-fields.js` | New: thin caller that provisions `qdb_sopstep` via sla-schema-lib.js |
| `scripts/add-sla-fields.js` | Refactored: now delegates to sla-schema-lib.js instead of duplicating logic |

**What is NOT in scope and NOT re-raised:** DP-2's GA-3 (option code drift — fixed by `sla-option-codes.js`), GA-7 (LANG env var). Both remain clean in DP-2b.

---

## 7-Pass Code Audit

### Pass 1 — Wiring

All entry points have handlers; all handlers produce output.

| Check | File:Line | Result |
|---|---|---|
| `copySlaFields` is called in derivation path | `deriveProcessFromSop.ts:45` | PASS — spread into `createStep` body; confirmed by TC-DERIVE-01/02/03 |
| `copySlaFields` is called in SOP canvas save | `useSopSave.ts:87, 99` | PASS — spread into `createSopStep` and `updateSopStep` bodies |
| `getSopSteps` $select includes SLA columns | `DataverseAdapter.ts:719`, `ODataAdapter.ts:546` | PASS — `SLA_SELECT_COLUMNS` appended to both |
| `mapSopStep` spreads `mapSlaFields(raw)` | `DataverseAdapter.ts:1047`, `ODataAdapter.ts` equivalent | PASS — `...mapSlaFields(raw)` at end of both `mapSopStep` functions |
| `createSopStep` wires `buildSlaBody` + escalation binds | `DataverseAdapter.ts:739–740`, `ODataAdapter.ts:566–567` | PASS — both adapters, entity arg = `'qdb_sopstep'` or `LOGICAL.sopStep` |
| `updateSopStep` wires `buildSlaBody` + escalation binds | `DataverseAdapter.ts:757–758`, `ODataAdapter.ts:585–586` | PASS — same pattern; null-clear when `slaEnabled=false` |
| `checkInvalidSlaConfig` is called in `validateSopForPublish` | `sopValidator.ts:15` | PASS — explicit `results.push(...checkInvalidSlaConfig(state))` |
| `SopValidationResult.code` is typed as `string` | `sopStore.ts:11` | PASS — `code: string` accepts `'VS-07'` without type change |
| `SlaFields` interface covers all 14 SLA fields | `WorkflowTypes.ts:30–45` | PASS — 14 fields match `slaStepFields.ts` SlaStepFields Pick exactly |
| `SopStep extends SlaFields` | `SopTypes.ts:93` | PASS |
| `CreateSopStepRequest extends SlaFields` | `SopTypes.ts:147` | PASS |
| `UpdateSopStepRequest = Partial<SlaFields> & {...}` | `SopTypes.ts:158` | PASS |
| `deriveProcessFromSop.test.ts` 3 tests exercise derivation path | `deriveProcessFromSop.test.ts:87–135` | PASS — TC-DERIVE-01/02/03 cover full SLA copy, disabled SLA, mixed SOP |
| `sopValidator.test.ts` 3 tests exercise VS-07 gate | `sopValidator.test.ts:36–61` | PASS — block, pass, and skip-if-disabled cases covered |

**Wiring: CLEAN — no orphaned handlers, no unconnected producers.**

---

### Pass 2 — Error Handling

| Check | File:Line | Result |
|---|---|---|
| `useSopSave.saveSopCanvas` try/finally | `useSopSave.ts:29–37` | PASS — `setIsSaving(false)` always runs in `finally`; errors propagate to caller |
| `deriveProcessFromSop` error propagation | `deriveProcessFromSop.ts:9–105` | PASS — no swallowed exceptions; per NFR-010, any `createStep` failure propagates to the wizard |
| `sla-schema-lib.js` field/option-set creators | `sla-schema-lib.js:124–131` | PASS — `post()` throws on non-2xx; errors propagate to orchestrating functions |
| `sla-schema-lib.js` existence checks | `sla-schema-lib.js:108–121` | PASS — non-OK (not 404) throws; 404 is correctly treated as "not exists" |
| `add-sla-sopstep-fields.js` top-level catch | `add-sla-sopstep-fields.js:43–45` | PASS — `run().catch(...)` with `process.exit(1)` |
| `copySlaFields` — no async, no error paths | `slaStepFields.ts:66–83` | PASS — pure synchronous field copy; no error path possible |
| `buildEscalationBindPatches` propagates `resolveNavProp` errors | `slaStepFields.ts:164–185` | PASS — awaits resolveNavProp in loop; errors propagate to caller (adapter) |

**Error handling: CLEAN — no empty catch blocks, no swallowed exceptions in DP-2b code paths.**

---

### Pass 3 — Completeness

| Check | File:Line | Result |
|---|---|---|
| VS-07 only surfaces FIRST error per step | `sopValidator.ts:30` | INFO — `Object.values(errors)[0]` reports one error message per step. A step with three SLA errors (missing duration, unit, and basis) surfaces only one. This is the same design as the process-side SLA gate in DP-2; consistent but noted. Not a defect — single-error reporting is a deliberate UX choice. |
| FR-013 canvas SLA badge | `sopSelectors.ts` / `SopStepNode.tsx` | DEFERRED — C-3, confirmed "Should Have" per Phase 5. SLA config is inert until CWFD-005; discoverability gap tracked for next SOP-canvas engagement. |
| `SlaEscalationSection disabled` prop not wired in `SopStepPanel` | `SopStepPanel.tsx` | KNOWN INTENTIONAL — Phase 5 confirmed this as a deliberate consistency decision. Full-panel lock on published SOP is a future engagement concern. |
| Phase 5 C-1 (`deriveProcessFromSop.test.ts`) | `deriveProcessFromSop.test.ts` | RESOLVED — 3 tests present and cover all three scenarios |
| Phase 5 C-2 (VS-07 SOP publish gate) | `sopValidator.ts:25–41` | RESOLVED — `checkInvalidSlaConfig` correctly calls `validateSlaConfig(step)` per step |

**Completeness: CLEAN for DP-2b scope. Two known gaps (C-3 badge, published-SOP lock) are accepted and tracked, not defects.**

---

### Pass 4 — Dead Code

| Check | File:Line | Finding |
|---|---|---|
| `SlaStepFields` type alias vs `SlaFields` interface | `slaStepFields.ts:23–39` vs `WorkflowTypes.ts:30–45` | INFO — `SlaStepFields` (a `Pick<WorkflowStep, ...>`) and `SlaFields` (a standalone interface) are structurally identical. Both are used: `SlaStepFields` as the return type of `emptySlaFields`, `copySlaFields`, `mapSlaFields`; `SlaFields` as the extends-base for `WorkflowStep` and `SopStep`. They are structurally compatible. This is a type-layer redundancy introduced by the DP-2b generalization; the eventual cleanup is to unify them to `SlaFields` only, but this is a non-breaking cosmetic change and not a defect. Confidence: 88% |

No unused imports, unreachable branches, or orphaned test utilities found in DP-2b code.

**Dead code: No defects. One type-alias redundancy flagged for future cleanup.**

---

### Pass 5 — Bloat

| File | Lines | Assessment |
|---|---|---|
| `slaStepFields.ts` | 242 | Within limit; functions are well-separated by responsibility |
| `sopValidator.ts` | 170 | Within limit; `checkInvalidSlaConfig` is appropriately small (17 lines) |
| `useSopSave.ts` | 141 | Within limit; four private phase functions each do one thing |
| `deriveProcessFromSop.ts` | 113 | Within limit; single public function, one private resolver |
| `sla-schema-lib.js` | 262 | Within limit; each function is ≤25 lines |
| `add-sla-sopstep-fields.js` | 45 | Well within limit; properly thin caller |

**Bloat: CLEAN — no file exceeds 400 lines; no function does more than one thing.**

---

### Pass 6 — Hardcoding

| Check | File:Line | Result |
|---|---|---|
| SLA option-set codes in application source | `WorkflowTypes.ts:146–170` | PASS — codes are named-constant declarations, not inline magic numbers; cross-checked by `slaOptionCodes.test.ts` |
| SLA option-set codes in provisioning scripts | `sla-schema-lib.js:41–72` | PASS — all codes read from `sla-option-codes.js` via `CODES.SLA_DURATION_UNIT.*` etc. |
| Provisioning language code | `sla-schema-lib.js:22` | PASS — `Number(process.env.DATAVERSE_LANG ?? 1033)`; DP-2's GA-7 fix is preserved in the shared lib |
| Dataverse URL in scripts | `add-sla-sopstep-fields.js` | PASS — URL loaded via `loadCrmConfig()` from env |
| GUIDs in source | All DP-2b files | PASS — no hardcoded GUIDs; `assertGuid` validates IDs at adapter boundaries |
| Entity-set names and logical names | `DataverseAdapter.ts` / `ODataAdapter.ts` | PASS — pre-existing constants (`LOGICAL`, `SET`, `ENTITY_SETS`); DP-2b adds no new hardcoded strings outside these constant maps |
| SOP_STATUS codes | `SopTypes.ts:49–53` | INFO — pre-existing (`DRAFT: 100000000`, `PUBLISHED: 100000001`, `RETIRED: 100000002`). Not introduced by DP-2b; tracked as pre-existing. Const object is the correct pattern for a closed option set. |

**Hardcoding: CLEAN for DP-2b scope — no new magic numbers or inline GUIDs introduced.**

---

### Pass 7 — Security

| Check | File:Line | Result |
|---|---|---|
| No string concatenation into OData filter (injection) | `DataverseAdapter.ts:719` | PASS — `sopId` passes `assertGuid(sopId, 'sopId')` before the `$filter` string is built; same for `ODataAdapter.ts:544` |
| Escalation lookup IDs in `@odata.bind` URL | `slaStepFields.ts:181–183` | PASS — `active.id` comes from Dataverse picker components returning validated GUIDs; no user-typed free text. Same risk surface as DP-2's process-step escalation (pre-existing, cleared in DP-2 audit). The `buildEscalationBindPatches` short-circuits when `slaEnabled === undefined`, blocking accidental writes. |
| No `eval()` or `Function()` with dynamic strings | All DP-2b files | PASS — confirmed by code inspection; `sla-schema-lib.js` uses `JSON.stringify(body)` which is safe |
| No secrets / credentials in source | All DP-2b files | PASS — provisioning scripts read identity exclusively from env (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `DATAVERSE_URL`). No credentials in source. |
| No `console.log` with sensitive data | `sla-schema-lib.js:219–230` | PASS — `console.log` in provisioning scripts is intentional (one-shot operator tooling, confirmed in design intent). Logged output is field logical names and HTTP status only; no tokens, no PII, no record content. Provisioning scripts are explicitly excluded from the "no console.log in committed code" rule in this project's standards. |
| No `any` types in DP-2b TypeScript paths | `slaStepFields.ts`, `deriveProcessFromSop.ts`, `sopValidator.ts`, `useSopSave.ts` | PASS — all typed correctly. `useSopSave.ts:12` has a pre-existing `as unknown as SopStore` cast for a Zustand typing workaround — not introduced by DP-2b. |
| No unsafe type assertions on SLA field values | `slaStepFields.ts:88–102` | PASS — `mapSlaFields` uses safe `as T | null` casts with `?? null` fallback; `fromCode` returns `T | null`, never throws on unknown codes |
| SQL / OData injection in scalar SLA fields | `buildSlaBody` | PASS — SLA fields are booleans, integers, and option-set codes (looked up from named-constant maps). No free-text SLA field flows into an OData expression. |

**Security Pass 7: CLEAN — no new injection surfaces, no secrets, no unsafe casts in DP-2b scope.**

---

## Security Risk Register

Scope: risks introduced or materially changed by DP-2b only. DP-2 risks not re-raised here unless scope has changed.

### SEC-01 (Carried — Scope Widened)
**Description:** Option-set code drift between TypeScript maps and Dataverse provisioning. GA-3 from DP-2 resolved this by extracting `sla-option-codes.js` as the single source of truth. DP-2b reuses this same file in `sla-schema-lib.js` and the `slaOptionCodes.test.ts` cross-check applies to both `qdb_work_item_steps` and `qdb_sopstep` fields because they share the same four global option sets.

**Likelihood:** Low (mitigation applied in DP-2)
**Impact:** High (code/data corruption if it occurred)
**Mitigation:** `scripts/sla-option-codes.js` is the single source; `slaOptionCodes.test.ts` fails CI if TS maps diverge. DP-2b extends no new option sets, so the cross-check surface is unchanged.
**Residual risk:** Very Low

Confidence: 95%

### SEC-02 (Carried — Scope Widened)
**Description:** `qdb_sopstep` SLA fields provisioned unmanaged. A future managed CWFD solution import could conflict with unmanaged SLA fields on `qdb_sopstep`, exactly as flagged for `qdb_work_item_steps` in GA-1.

**Likelihood:** Low (only triggers on managed solution import)
**Impact:** High (could corrupt or shadow active configuration)
**Mitigation:** GA-1 go-live condition (managed solution packaging) from DP-2 must now cover `qdb_sopstep` SLA fields + 3 new relationships. Same remediation, wider scope.
**Residual risk:** Low (resolved when GA-1 is addressed)

Confidence: 92%

### SEC-03 (New — Low)
**Description:** `copySlaFields` copies `escalationUserName`, `escalationTeamName`, `escalationRoleName` display names from the SOP step to the derived process step. These are read from Dataverse `FormattedValue` annotations at query time. If the referenced user or team is renamed between SOP save and process derivation, the copied display name in the derived process step will be stale until the process is next loaded (which will refresh from the live `getSteps` call). This is a stale display label, not a data integrity or security issue.

**Likelihood:** Low (cosmetic; refresh clears it on next load)
**Impact:** Low (display label only; `escalationUserId` GUID is always authoritative)
**Mitigation:** None required for V1. ADR-2b-002 (copy-not-link) acknowledges the stale-display-name trade-off. The architecture's Skeptic Challenge 3 reviewed this and the verdict is acceptable.
**Residual risk:** Low — by design

Confidence: 85%

---

## OWASP Top 10 Assessment

| # | Category | Applicable? | How mitigated | Gap |
|---|---|---|---|---|
| A01 Broken Access Control | Partially | CWFD is a Dataverse web resource; access enforced by Dataverse security roles at the org level. DP-2b adds no new API endpoints. | None new introduced by DP-2b. GA-2 (native audit) is the platform-level access-change log. |
| A02 Cryptographic Failures | No | No new cryptographic operations. Identity tokens handled by `crm-api-client.js` (pre-existing, not changed). | None. |
| A03 Injection | Yes | `assertGuid(sopId)` gates the only user-supplied ID that enters a `$filter` string (`getSopSteps`). All scalar SLA field values are option-set integer codes or booleans — no free text in OData expressions. | None introduced by DP-2b. Posture unchanged from DP-2. |
| A04 Insecure Design | Partially | Config-only design; SLA is inert until CWFD-005 ships. ADR-2b-002 (snapshot not link) prevents unintended post-derivation SLA propagation. `validateSopForPublish` VS-07 gate blocks incomplete SLA config from being published into the inheritance path. | C-3 (canvas badge) deferred — minor discoverability gap, not a design flaw. |
| A05 Security Misconfiguration | Yes | No secrets in source. Provisioning identity from env exclusively. `sla-schema-lib.js` idempotent checks prevent accidental duplicate field creation. GA-4 (SP scoping) applies to the provisioning identity. | GA-4 open (human/org condition). |
| A06 Vulnerable and Outdated Components | No | NFR-008: no new npm dependencies in DP-2b. Zero new libraries to assess. | None. |
| A07 Authentication Failures | No | Authentication is Dataverse / Azure AD. CWFD runs as a web resource under the authenticated Dynamics user. No new auth paths in DP-2b. | None. |
| A08 Software and Data Integrity | Yes | SLA inheritance is a deterministic field-to-field copy (`copySlaFields`). No deserialization of untrusted JSON in the new code paths. `buildSlaBody` reads from typed `Partial<SlaFields>`, not raw input. | None. |
| A09 Security Logging and Monitoring | Partially | `AuditService` (append-only, pre-existing) is not changed by DP-2b. `qdb_sopstep` SLA field changes rely on Dataverse native field auditing (GA-2 condition). | GA-2 open: must enable native field audit on `qdb_sopstep` SLA fields before production. |
| A10 SSRF | No | No server-side code in DP-2b. Provisioning scripts are operator-run Node.js tools that call Dataverse API. They do not accept user-controlled URLs. | None. |

---

## Compliance Assessment

### Framework: Pakistan Personal Data Protection Act (PDPPL)

| Requirement | How DP-2b meets it | Gap |
|---|---|---|
| Data residency — personal data must reside within Pakistan or approved jurisdiction | DP-2b stores only reference GUIDs (`systemuser`, `team`, `qdb_role` IDs) in `qdb_sopstep` escalation lookup fields. These GUIDs already exist within the Dataverse tenant (org5869857f). No new personal data is created. No data leaves the tenant. The `escalationUserName` display name is a cached label derived from the existing CRM user record; it is already present in the tenant. | None for DP-2b. Same posture as DP-2, already cleared in DP-2 Phase 6. The 3 new relationships (`qdb_escalationuser_sopstep`, `qdb_escalationteam_sopstep`, `qdb_escalationrole_sopstep`) reference existing within-tenant records only. |
| Sensitive personal data — special controls required | No sensitive personal data is introduced. The SLA configuration fields are configuration intent (duration, option codes), not PII. | None. |
| Data minimisation | Only the GUID reference and display name are stored (matching the DP-2 process-step pattern). No personal attributes beyond what is already in the systemuser/team/role records. | None. |
| Production hard gate — AUTH-C-2/C-6 QDB sign-off | Carried from DP-2. DP-2b's data residency posture is equivalent; the same sign-off applies without a new track. | GA-1 (managed solution) is the packaging precondition for the production deployment that requires PDPPL sign-off. |

### Framework: Maqsad AI Governance Constitution / Code Standards

| Requirement | How DP-2b meets it | Gap |
|---|---|---|
| No hardcoded GUIDs, thresholds, or rates | All SLA option codes centralized in `sla-option-codes.js`; cross-checked by test. No GUIDs in source. | None. |
| Every entity: `created_by`, `created_on`, `modified_by`, `modified_on` | Dataverse system fields (`createdon`, `createdby`, `modifiedon`, `modifiedby`) are automatically maintained by the platform on `qdb_sopstep`; DP-2b adds only SLA fields. | None. |
| Audit log tables: append-only | `AuditService` unchanged; append-only. SOP step SLA changes are audit-captured at Dataverse native level (GA-2 condition). | GA-2 open. |
| No abbreviations in names | `SlaFields`, `copySlaFields`, `buildSlaBody`, `mapSlaFields` — all intention-revealing. | None. |
| Functions are one responsibility, max 20 lines | `checkInvalidSlaConfig` (17 lines), `copySlaFields` (18 lines), `clearedSlaBody` (11 lines) — all compliant. | None. |
| No `any` types | Confirmed by tsc clean + code inspection. | None. |
| TDD — test before implementation | C-1 (deriveProcessFromSop.test.ts) was a Phase 5 conditional gate, resolved before Phase 6. | G-4 (`useSopSave` test) and G-5 (SopStepPanel component test) remain unwritten — medium and low priority respectively. Neither is a Phase 6 blocker (confirmed in Phase 5). |

---

## Data Residency Review

**Where does data physically reside?**

All data written by DP-2b resides in Dataverse org `org5869857f` (Azure-hosted, tenant-bound). The 11 new SLA fields on `qdb_sopstep` store:
- Booleans (`sla_enabled`, `escalation_enabled`) — no personal data
- Integers (`sla_duration`, `sla_warning_pct`) — no personal data
- Option-set codes (4 global option sets) — no personal data
- Lookup GUIDs (escalation user / team / role) — reference GUIDs only; the referenced records already exist in the same tenant

**Cross-border transfer risks:** None introduced by DP-2b. The `copySlaFields` derivation path copies GUID values from `qdb_sopstep` to `qdb_work_item_steps` — both within the same Dataverse org. No external API calls are added.

**PDPPL equivalence to DP-2:** CONFIRMED. DP-2 Phase 6 cleared this posture for escalation lookup fields on `qdb_work_item_steps`. DP-2b's `qdb_sopstep` lookup fields are structurally identical (same referenced entities: `systemuser`, `team`, `qdb_role`; same within-tenant residency; no new external data flows). The DP-2 PDPPL clearance extends to DP-2b without modification.

Confidence: 95%

---

## Audit Trail Validation

**Can every state transition be reconstructed from the audit log?**

DP-2b does not change `AuditService.ts`. The audit trail posture for `qdb_sopstep` SLA fields is identical to the posture established for `qdb_work_item_steps` SLA fields in DP-2:

- Application-level audit log (`logAuditEntry` → append-only `AuditService`) records process-level operations (create/update/publish workflow and process). It does NOT record individual SLA field diffs.
- **Field-level change history** for the 11 new `qdb_sopstep` SLA fields depends on Dataverse native field auditing (GA-2 condition, carried from DP-2). Until GA-2 is resolved, individual SLA config changes on SOP steps are not reconstructable from any audit log.
- `deriveProcessFromSop` operations: the derivation creates `qdb_work_item_steps` records (with SLA values copied in). Those creation events are visible in Dataverse audit history (if entity-level audit is enabled) and in the CRM OData timeline. The SLA field values are part of the creation record.

**Is the audit log tamper-proof?** `AuditService` uses append-only `createRecord` (confirmed in DP-2 audit; unchanged by DP-2b). Dataverse native audit log is platform-managed and tamper-evident. PASS.

**Gap:** GA-2 (native Dataverse field auditing) from DP-2 must now be applied to `qdb_sopstep` SLA fields as well, not just `qdb_work_item_steps`. Same condition, wider scope. A regulatory examiner reviewing SLA changes on SOP steps cannot reconstruct field-level diffs until GA-2 is enabled on `qdb_sopstep`.

---

## Service Account Review

| Account | Used for | Scope needed | Current scope | Assessment |
|---|---|---|---|---|
| Provisioning SP (AZURE_CLIENT_ID from env) | Running `add-sla-sopstep-fields.js` | System Customizer (schema write: create fields + relationships, publish entity) | Unknown — documented as GA-4 condition to verify | Carries DP-2 GA-4 condition. SP must be confirmed as System Customizer (not System Administrator). Post-provisioning, schema-write access should be removed or the SP deactivated. The DP-2b provisioning script is functionally identical in its access requirements to the DP-2 script. No new elevated permissions are needed. |

**CWFD web resource runtime**: Runs under the logged-in Dynamics user's security context. No service principal is involved at runtime. DP-2b adds no new runtime calls requiring elevated privilege.

---

## Governance Gaps — Ranked by Severity

The following conditions are inherited from DP-2 with widened scope. DP-2b introduces NO new standalone governance conditions.

### GG-1 [CRITICAL — Carried from GA-1]
**Gap:** 11 new SLA fields and 3 new relationships on `qdb_sopstep` are provisioned UNMANAGED on the live org (org5869857f), exactly as DP-2's `qdb_work_item_steps` schema was. A future managed CWFD solution import that includes any of the `qdb_sopstep` entity definition could conflict with or shadow the unmanaged DP-2b SLA fields.

**Risk if unaddressed:** Schema conflict on CWFD upgrade; SLA field data on SOP steps could be orphaned or inaccessible after a managed solution import overrides the entity definition.

**Remediation:** The existing GA-1 remediation track must extend to DP-2b's new fields. Specifically: the managed CWFD solution package (to be created per GA-1) must include the `qdb_sopstep` entity with all 11 SLA fields and the 3 OTM relationships (`qdb_escalationuser_sopstep`, `qdb_escalationteam_sopstep`, `qdb_escalationrole_sopstep`). No separate track needed — add to the GA-1 work item.

**Owner:** DevOps / Dataverse Admin. Estimated effort: ~1h additional on top of GA-1 (already in progress).

---

### GG-2 [HIGH — Carried from GA-2]
**Gap:** Native Dataverse field auditing is not confirmed enabled on the 11 new `qdb_sopstep` SLA fields. Without it, there is no field-level history of SLA configuration changes on SOP template steps. A regulatory examiner or incident investigator cannot reconstruct who changed `qdb_sla_duration` from 2 to 5 on a SOP step and when.

**Risk if unaddressed:** Audit trail for SOP-level SLA configuration changes is absent. For engagements subject to change-management or process-governance audit, this is a compliance gap.

**Remediation:** When GA-2 is addressed for `qdb_work_item_steps` (enable `IsAuditEnabled=true` on the entity + SLA fields), extend the same enablement to `qdb_sopstep` and its 11 new SLA fields. Best codified as part of the GA-1 managed solution (the solution can specify audit configuration). No separate track needed.

**Owner:** Dataverse Admin. Estimated effort: ~30 min additional on top of GA-2.

---

### GG-3 [MEDIUM — Carried from GA-4]
**Gap:** The provisioning service principal used to run `add-sla-sopstep-fields.js` is the same SP used for `add-sla-fields.js`. Its actual Dataverse security role has not been confirmed as System Customizer (minimum required). If it holds System Administrator, it violates the least-privilege principle.

**Risk if unaddressed:** Over-privileged SP can write to any entity or configuration in the org; compromise of the SP credentials grants broad administrative access.

**Remediation:** DP-2's GA-4 remediation must document that this SP's scope covers both provisioning scripts. Confirm the role is System Customizer (not System Administrator). After provisioning is complete, revoke schema-write permissions or deactivate the SP application registration. Document this in the CWFD DevOps runbook.

**Owner:** Azure AD / DevOps. Estimated effort: ~1h.

---

### GG-4 [LOW — Deferred, Tracked]
**Gap:** FR-013 SOP canvas SLA badge (`US-04 — Should Have`) is not implemented. SLA-configured SOP step node cards do not display the summary badge visible on process step cards.

**Risk if unaddressed:** Business Analysts reviewing SOP template SLA commitments must open each step panel individually rather than scanning the canvas. Audit use case (US-04) is degraded.

**Remediation:** Add `slaEnabled`, `slaDuration`, `slaDurationUnit`, `escalationEnabled`, `escalationAction` to `SopStepNodeData` + `buildStepNode` (`sopSelectors.ts`), then render badge in `SopStepNode.tsx` using existing `slaSummaryText` helper. This is a ~3h isolated change. Track for next SOP canvas engagement (C-3).

**Owner:** Frontend engineer. Does not block Phase 7.

---

### GG-5 [LOW — Redundancy, Not a Defect]
**Gap:** `SlaStepFields` type alias in `slaStepFields.ts:23–39` (a `Pick<WorkflowStep, ...>`) is structurally identical to the `SlaFields` interface in `WorkflowTypes.ts:30–45`. Two separate names for the same concept creates minor type-layer confusion.

**Risk if unaddressed:** Future developers may use either type interchangeably, leading to inconsistent annotation in pull requests and slight confusion about which is canonical.

**Remediation:** In a future sprint (not this engagement), update `emptySlaFields()`, `copySlaFields()`, and `mapSlaFields()` return types from `SlaStepFields` to `SlaFields`, then remove the `SlaStepFields` alias. This is a non-breaking structural change (types are compatible). No functional behavior changes.

**Owner:** Frontend engineer. Deferred — not a Phase 7 gate.

---

## Go-Live Clearance

**Verdict: CONDITIONAL PASS**

DP-2b's implementation is secure, correctly wired, and free of code-fix-required defects. All Phase 5 conditions (C-1, C-2) were resolved before this audit. The security posture mirrors DP-2's already-audited baseline; no new injection surfaces, secrets, unsafe casts, or injection paths were introduced. The data residency posture is equivalent to and covered by DP-2's PDPPL clearance.

**Cleared for Phase 7 (CEO final) with the following conditions:**

### Production go-live conditions (human/org — not code-fix-required)

These are the DP-2 conditions with explicitly widened scope. They are NOT new gates invented for DP-2b; they are the same gates, now covering additional schema surface.

| Condition | Description | Carries from |
|---|---|---|
| GL-01 (= GA-1 widened) | Managed CWFD solution package must include `qdb_sopstep` 11 SLA fields + 3 OTM relationships alongside the DP-2 schema. No separate solution for DP-2b. | DP-2 GA-1 [CRITICAL] |
| GL-02 (= GA-2 widened) | Native Dataverse field auditing must be enabled on `qdb_sopstep` SLA fields as well as `qdb_work_item_steps` fields. | DP-2 GA-2 [HIGH] |
| GL-03 (= GA-4 unchanged) | Provisioning SP scope confirmed as System Customizer; post-provisioning access revoked or SP deactivated. | DP-2 GA-4 [MEDIUM] |
| GL-04 (= PDPPL gate, unchanged) | QDB IT Director sign-off (AUTH-C-2/C-6) covers DP-2b by extension. No separate sign-off required unless `qdb_sopstep` is deployed to a jurisdiction different from `qdb_work_item_steps`. | DP-2 PDPPL gate |

**What is explicitly NOT a condition (do not block Phase 7 on these):**
- GG-4 (canvas SLA badge, C-3) — Should Have, deferred, tracked
- GG-5 (SlaStepFields redundancy) — Cosmetic type cleanup, no impact on correctness

**Statement for CEO-final:** DP-2b is clean, thin, and correctly mirrors the DP-2 audited pattern. It introduces no new security risks, no new compliance surface, and no new governance conditions beyond widening the scope of DP-2's three existing go-live conditions to include `qdb_sopstep`. Those three conditions (managed solution packaging, native field audit, SP scoping) remain open human/org actions — DP-2b does not create new ones. The engagement is ready for Phase 7 CEO review.
