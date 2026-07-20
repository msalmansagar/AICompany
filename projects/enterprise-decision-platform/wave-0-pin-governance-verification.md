# Wave-0 Verification — Pin Governance & Auditing (W0-3 / W0-4)

**Engagement:** EDP-BRE-001 · **Env:** org5869857f · **Covers:** ADR-14 (amends ADR-12), C-005
**Run when:** immediately after the maker-portal step (entity audit ON + pin columns secured) and
`w0-3-fieldperms.js`. **Owner:** QA · **Sign-off:** Auditor.

## Preconditions
- Entity auditing enabled on `qdb_edp_ruleversion` and `environmentvariablevalue`; org audit ON.
- Column security enabled on `qdb_edp_ispinned`, `qdb_edp_pinjustificationcode`, `qdb_edp_pinjustificationnote`.
- Field Security Profile **EDP - Manage Production Pin** exists; members = runtime SP + ≥1 named pin-manager user.
- Field permissions granted (read/create/update) to the profile on the three pin fields.
- One **non-member** test user (holds an EDP role but NOT the profile) and one **pinned** rule version available.

## Test cases

| # | Check | Steps | Expected | Result |
|---|-------|-------|----------|--------|
| **VP-1** | Pin change is audited | As a profile member, set/clear `qdb_edp_ispinned` + justification on a version | Audit history shows the field change (old→new, actor, timestamp) | ☐ |
| **VP-2** | Prod-designation change is audited | Change the `qdb_edp_IsProductionEnvironment` env-var **value** record | Audit history shows the value change with actor + timestamp | ☐ |
| **VP-3** | Write gated — non-member blocked | As the non-member user, attempt to update a pin field (SDK/Web API) | Update **rejected** (field-security denial); no change persists | ☐ |
| **VP-4** | Write allowed — member | As a profile member, update a pin field | Update **succeeds**; VP-1 audit fires | ☐ |
| **VP-5** | Read-path intact (runtime) | As a **non-privileged** user, call `qdb_edp_EvaluateDecision` on a **pinned** rule (TargetRef) | Resolves to the **pinned** version and returns a decision — resolution NOT broken by securing reads | ☐ |
| **VP-6** | **Justification residual (ADR-14 deferred layer 1)** | As a profile member, set a production pin **without** a justification code/note via SDK | **Succeeds today** — documents the known gap: field security does not enforce justification. **Flag to Auditor.** | ☐ |
| **VP-7** | Designation change is access-limited | As the non-member user, attempt to change the prod-designation env-var value | Rejected / not permitted (privilege-gated) | ☐ |

## Exit criteria
- **VP-1…VP-5, VP-7 PASS** → W0-3 + W0-4 auditing/least-privilege controls are effective.
- **VP-5 FAIL** → add a broad read-only field-security profile granting `canread` on the pin fields to all evaluation users, then re-run VP-3/VP-4/VP-5.
- **VP-6 is expected to "succeed"** — it is not a failure but the documented ADR-14 residual. Auditor records it as an open item; it is closed only by building the pre-operation justification plugin (restores ADR-12 layer 1).

## Sign-off
| Role | Name | Verdict | Date |
|------|------|---------|------|
| QA | | ☐ Pass / ☐ Pass-with-residual / ☐ Fail | |
| Auditor | | ☐ Accept residual (VP-6) / ☐ Block until plugin | |

**Note for the Phase-6 (C-005) pen-test:** VP-6 is the pin-governance gap this amendment
knowingly leaves open. Report it as a tracked residual, not a surprise.
