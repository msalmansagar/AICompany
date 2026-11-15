# BRD Addendum C — PDPPL Retention, Anonymise Fix and Erasure API (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Amends | `phase-2-ba.md` v1.3 (v1.1 + Addenda A and B) → becomes v1.4 when this addendum is approved |
| Date | 2026-11-15 |
| Status | **APPROVED by the CEO 2026-11-15** (BRD v1.4) |
| Trigger | CEO answered the PDPPL Decision Pack (`pdppl-decisions.md`) on 2026-11-15, confirming D3, D4, D7 and D8. Those four decisions change what the engine promises, so they require a BRD addendum and CEO approval before any build. |

---

## 1. Why this addendum exists

The approved BRD (v1.3) provides a configurable retention job that covers responses and answers only. It defers the retention period and mode to QDB Compliance (OQ-A1 / B1). On 2026-11-15, the CEO closed all nine PDPPL decisions on QDB's behalf. Four of them change engine behaviour:

| Decision | What was decided |
|---|---|
| D3 | Delete invitation rows at 24 months (never before 13 months — the fatigue and milestone floors). |
| D4 | Delete suppression-log rows at 24 months. |
| D7 | Extend the anonymise operation to also clear `qdb_survey_invitation_id`, `qdb_source_table` and `qdb_source_record_id` from the response row. Reports must use `qdb_survey_setup_id` or `qdb_form_code` to relate responses to their survey. |
| D8 | Build `qdb_srv_EraseCustomerSurveyData`: customer identifier, mode (Delete or Anonymise), dry-run flag; returns per-table row counts; privileged, runs as SYSTEM; works on both orgs regardless of customer table (account / contact). |

**Current state against which these requirements are stated:**

- `RetentionPass` / `ResponseRetentionStore` deletes or anonymises only `qdb_survey_response` and `qdb_survey_answer` rows. Invitation and suppression-log rows are never touched by retention. (`RetentionPass.cs`, `ResponseRetentionStore.cs:37–50`).
- The `Anonymise` operation clears `qdb_name`, the customer lookup column, `qdb_answers_json` and each answer's `qdb_answer_text`. It does not clear `qdb_survey_invitation_id`, `qdb_source_table` or `qdb_source_record_id` on the response row (`ResponseRetentionStore.cs:40–49`). An anonymised response can be re-identified in one join via its invitation link (audit finding CMP-02).
- No per-customer erasure Custom API or script exists (audit finding CMP-03).
- Decision D5 (delete hand-off activities once their link is used or expires) applies only when the SMS / secure-link channels are enabled. Those channels are off at Release 1 and no rows exist. D5 is deferred to the release that enables those channels.

---

## 2. What changes

| Area | Change |
|---|---|
| Section 3.2 In scope | Add: 24-month deletion of invitations and suppression logs; anonymise fix (D7); per-customer erasure API (D8). |
| Section 4, Group J | FR-CSE-058 is unaffected; the retention setting and mode it describes now also govern invitations and suppression logs (D3 / D4), subject to the floors in FR-CSE-078. |
| Section 4 | Add Group M (FR-CSE-076 to FR-CSE-078): invitation and suppression-log retention. |
| Section 4 | Add Group N (FR-CSE-079 to FR-CSE-080): anonymise fix and reporting path. |
| Section 4 | Add Group O (FR-CSE-081 to FR-CSE-082): erasure API and its privilege gate. |
| Section 5 NFRs | Add NFR-CSE-011 to NFR-CSE-014. |
| Section 8 Out of scope | Add: D5 hand-off-activity retention (explicitly deferred). |
| Section 9.3 Data summary | Update Invitation and Suppression Log retention to "24 months (delete), minimum 13 months / 12 months respectively". |

---

## 3. Source decisions

| ID | Decision | Checklist gate | Note |
|---|---|---|---|
| D3 | Delete invitations at 24 months; never before 13 months | B7 | The 13-month floor preserves the fatigue and milestone checks (see §7, BR-PDR-01). |
| D4 | Delete suppression logs at 24 months | B7 | Append-only design means only deletion is possible (no in-place anonymise). |
| D7 | Anonymise must also clear `qdb_survey_invitation_id`, `qdb_source_table`, `qdb_source_record_id` | B3 | Reports that relate responses to surveys must switch to `qdb_survey_setup_id` or `qdb_form_code`. |
| D8 | Build `qdb_srv_EraseCustomerSurveyData` | B7 | Per-table row counts returned; dry-run mode; privileged; both orgs. |
| D9 | QDB Compliance issues one unconditional written sign-off after D7 and D8 are built and verified | B2 | Go-live waits for this sign-off; it is unchanged from the existing B2 gate. |

**D5 (hand-off activities) is deferred.** The channels are off at Release 1; no letter, fax or email activity rows exist. MSS will build the deletion step (delete each activity row once its linked invitation is used or expires) in the release that enables those channels. D5 is explicitly out of scope here.

---

## 4. Scope

### 4.1 In scope

- Extending `RetentionPass` to delete invitation rows older than the retention period.
- Extending `RetentionPass` to delete suppression-log rows older than the retention period.
- Enforcing a minimum retention floor (13 months for invitations, 12 months for suppression logs) regardless of the configured `qdb_retention_days`.
- Fixing `ResponseRetentionStore.Anonymise` to also clear `qdb_survey_invitation_id`, `qdb_source_table` and `qdb_source_record_id`.
- Updating any CRM view or Custom API query that joins responses to invitations via `qdb_survey_invitation_id`, to use `qdb_survey_setup_id` or `qdb_form_code` instead.
- Building `qdb_srv_EraseCustomerSurveyData` with the input / output contract in FR-CSE-081.
- A `Survey Data Officer` security role that may call the erasure API (FR-CSE-082; see OQ-PDR-02).
- Updating the on-prem kit and the runbook with the new erasure procedure.
- Covering both HL CRM (contacts) and BFD CRM / QDB1 (accounts) through the existing `CustomerLink` pattern.

### 4.2 Out of scope

- **D5 hand-off activities.** Explicitly deferred. No build in this addendum.
- **D6 audit-log retention.** QDB IT configures this directly on each org. No MSS build required.
- Anonymising invitation or suppression-log rows in place. These tables can only be deleted (see §7, BR-PDR-02).
- Platform change history (audit rows). Dynamics CRM 9.1 provides no per-customer or per-record purge; this residual is acknowledged in the DSAR procedure and outside MSS scope.
- Excel exports, database backups, SMS gateway and email system logs. Outside MSS scope; noted in the sign-off checklist (D9).
- The cloud org. Release 1 targets HL CRM and BFD CRM / QDB1 on-prem only (C-1).

---

## 5. Functional requirements

### Group M — Invitation and suppression-log retention (D3, D4)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-076 | The daily retention pass shall delete invitation rows whose `qdb_generated_on` is older than `qdb_retention_days` days ago (UTC). The pass runs after the response-retention pass in the daily job and is budget-aware and re-runnable like the existing pass. If an invitation is deleted and its response row still exists (edge case: response not yet reached by the response pass), the cascade relationship deletes the response and its answers. | Given retention days = 365 and an invitation whose `qdb_generated_on` is 366 days ago, the daily pass deletes it. An invitation 364 days old is not touched. Running twice on the same day creates no additional deletions. |
| FR-CSE-077 | The daily retention pass shall delete suppression-log rows whose `createdon` is older than `qdb_retention_days` days ago (UTC), after the invitation-deletion step. The pass is budget-aware and re-runnable. | Given retention days = 365 and a suppression-log row 366 days old, the daily pass deletes it. An entry 364 days old is untouched. |
| FR-CSE-078 | The invitation-deletion pass shall not delete any invitation row younger than 395 days (approximately 13 months), regardless of the configured `qdb_retention_days`. The suppression-log pass shall not delete any row younger than 365 days (12 months), regardless of the configured period. These floors are enforced at runtime, not only as configuration advice. | With `qdb_retention_days` = 100, the invitation pass skips every invitation younger than 395 days. With `qdb_retention_days` = 700, the pass uses 700 (above the floor), so the floor has no effect. |

### Group N — Anonymise fix (D7)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-079 | When the retention mode is Anonymise, the anonymise operation shall clear these additional fields on the response row: `qdb_survey_invitation_id`, `qdb_source_table`, `qdb_source_record_id`. After anonymisation, the response row shall hold no field that points to a record identifying the customer. `qdb_survey_setup_id` and `qdb_form_code` are retained, as they carry no personal data and are needed for reporting. | Given a response with `qdb_survey_invitation_id` = {guid-X}, `qdb_source_table` = `qdb_loan_application`, `qdb_source_record_id` = {guid-Y}, when anonymised: all three fields are null; `qdb_survey_setup_id` and `qdb_form_code` are still set. Following every nullable lookup on the anonymised row cannot reach a customer identifier in one step. |
| FR-CSE-080 | Any CRM view, chart or Custom API query that currently uses `qdb_survey_invitation_id` to relate a response to its survey configuration shall be updated to join via `qdb_survey_setup_id` or `qdb_form_code` instead. Views that relied on the invitation link shall return anonymised responses with the same setup-level aggregates as identified responses. | An analyst view filtered to one setup returns both identified and anonymised responses in the same count. The row count matches the total invitation count for that setup. No response is silently excluded because its invitation link is null. |

### Group O — Erasure API (D8)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-081 | A new Custom API `qdb_srv_EraseCustomerSurveyData` shall accept: `CustomerGuid` (Guid, required); `Mode` (option: 100000000 = Delete, 100000001 = Anonymise, required); `DryRun` (bool, required). It shall determine the customer table (account or contact) from the org's Survey Settings. It shall find all invitation rows, response rows, answer rows and suppression-log rows linked to that customer. In live mode: Delete removes all found rows (invitation cascade also removes responses and answers); Anonymise applies FR-CSE-079 to each response and deletes its invitation and suppression-log rows (which cannot be anonymised in place, see §7, BR-PDR-02). In dry-run mode: no rows are changed. The API shall return: `InvitationCount` (int), `ResponseCount` (int), `AnswerCount` (int), `SuppressionLogCount` (int), `AreActual` (bool: true in live mode, false in dry-run). It runs as SYSTEM. | (1) Dry-run with a customer who has 3 invitations, 2 responses, 10 answers, 5 suppression logs: returns those exact counts, `AreActual` = false, no rows changed. (2) Live Delete: same counts returned, all rows gone. (3) Live Anonymise: invitations and suppression logs deleted; responses anonymised per FR-CSE-079; answer texts nulled. (4) Unknown `CustomerGuid`: returns all-zero counts, `AreActual` matches mode. (5) Wrong org's customer type (e.g., passing a contact GUID on an account org): returns zero counts, no error. |
| FR-CSE-082 | Only a System Administrator or a user holding the `Survey Data Officer` role may invoke `qdb_srv_EraseCustomerSurveyData`. Any other caller shall receive an `InvalidPluginExecutionException`. The Survey Integration service account shall not hold this role. The `Survey Data Officer` role shall have no survey-table privileges beyond the right to invoke the API; it holds no Read or Write on response, answer, invitation, suppression-log or any customer table (the API runs as SYSTEM). | (1) A user with no survey role calls the API: exception thrown, no rows touched. (2) A Survey Analyst calls it: exception thrown. (3) A user holding Survey Data Officer calls it: succeeds. (4) A System Administrator calls it: succeeds. (5) The Survey Integration credential has no Survey Data Officer role: verified in the provisioning manifest. |

---

## 6. Non-functional requirements

| ID | Category | Requirement | Measurable criterion |
|---|---|---|---|
| NFR-CSE-011 | Performance — daily pass | The extended `RetentionPass` (responses + invitations + suppression logs) shall complete within the 90-second work allowance at the volumes in BRD §9.2 on the first run after go-live (backlog from go-live date only; no historical backlog). The budget mechanism already in `RetentionPass` shall apply to the new passes, so a large backlog is processed over multiple daily runs without exceeding the plugin limit. | A test run processing 450 invitations and 1,000 suppression-log rows completes without exhausting the 90-second budget on a single call. If the budget is exhausted, `IsComplete` = false and the next call resumes correctly. |
| NFR-CSE-012 | Performance — erasure API | The erasure API in live mode on a single customer shall complete within the 2-minute plugin limit at the highest anticipated row count per customer across the 24-month window (~24 invitations/year × 2 years = ~48 invitations; suppression logs may be significantly higher given the fatigue suppression rate). | A test erasure for a customer with 300 invitation rows, 100 response rows, and 2,000 suppression-log rows completes within 120 seconds. If a customer's row count could exceed this budget, a budget-and-rerun pattern (like the daily pass) is added during design. |
| NFR-CSE-013 | Auditability | Every execution of `qdb_srv_EraseCustomerSurveyData` (dry-run and live) shall emit a CRM plugin trace entry containing: caller user ID, `CustomerGuid`, `Mode`, `DryRun`, `InvitationCount`, `ResponseCount`, `AnswerCount`, `SuppressionLogCount`, UTC timestamp. QDB Compliance must be able to cite this entry as evidence in the DSAR register. | A trace entry exists in the plugin trace log for each API call. The entry contains all required fields and is written before the API returns. |
| NFR-CSE-014 | Compatibility — both orgs | All changes in this addendum (retention extension, anonymise fix, erasure API) shall work on both HL CRM (contacts) and BFD CRM / QDB1 (accounts) through the existing `CustomerLink` / Survey Settings customer-table configuration, with no code change between orgs. | Integration tests covering each FR above pass using both `CustomerLink` variants. The same compiled plugin assembly deploys to both orgs unchanged. |

---

## 7. Business rules and side effects

### BR-PDR-01: Erasure resets the milestone counter

Deleting a customer's invitation rows removes the records the milestone duplicate-check reads (`FR-CSE-038`, `FR-CSE-039`). After an erasure, the customer's milestone counter resets to zero and the engine may send them a milestone survey they already received.

**How this is handled:** Accepted. A data subject's right to erasure takes precedence over milestone-tracking fidelity. QDB Compliance should note this in the DSAR record for any customer whose erasure covers milestone-linked invitations. No technical mitigation is built.

### BR-PDR-02: Fatigue window bypass after erasure

If erasure deletes invitation rows that are younger than the fatigue window, the customer could be surveyed again immediately (the fatigue check would find no recent invitations). In practice, erasure requests are processed days or weeks after the last survey.

**How this is handled:** Accepted. The fatigue rule is a customer-experience protection, not a PDPPL obligation. After an erasure the engine treats the customer as new from a fatigue perspective. QDB operators should be aware.

### BR-PDR-03: Invitations and suppression logs cannot be anonymised in place

The suppression log is append-only by design; in-place modification is not permitted. Invitation rows hold a dedupe key embedding the customer GUID in plain text (`pdppl-decision-pack.md §4`); nulling only the customer lookup would leave that GUID in the dedupe key, defeating anonymisation. Therefore: in both Delete and Anonymise mode, the erasure API (FR-CSE-081) deletes invitation and suppression-log rows outright. Only response rows are anonymised in Anonymise mode.

**Open question:** OQ-PDR-03 below asks the CEO to confirm this.

### BR-PDR-04: Invitation deletion may cascade to responses not yet reached by the response pass

The response-to-invitation relationship is Cascade delete. Invitation retention (FR-CSE-076) runs after response retention in the daily job, so most responses are already gone before their invitation is deleted. In the edge case where a response submitted close to the retention boundary has not yet been processed, deleting its invitation cascades the response and answers. The response is thus deleted a few days early (the gap between `qdb_generated_on` and `qdb_submitted_on` for that invitation).

**How this is handled:** Accepted as a de minimis rounding effect. For a 24-month retention period, a few days' difference is not material. The cascade is documented here so QA can account for it in test design.

---

## 8. Security and role requirements

The erasure API is permanently destructive and must not be reachable from internet-facing or operational roles.

| Requirement | Detail |
|---|---|
| Survey Integration must not call the erasure API | The portal service account holds only Create, Read, Write, Append and AppendTo on survey runtime tables. It shall not hold the Survey Data Officer role. Verified in `provisioning/manifest.mjs`. |
| Survey Admin and Survey Analyst must not call the erasure API | Neither role holds a right that would pass the FR-CSE-082 access check. No change needed to their existing grants. |
| Survey Data Officer role | A new minimal role: holds only the execute privilege on `qdb_srv_EraseCustomerSurveyData` and nothing else (see OQ-PDR-02). The role name must match the string the access-check plugin reads, as `SCHEDULER_ROLE_NAME` does for `Survey Scheduler`. |
| Dry-run mode is not a bypass | Dry-run callers must pass the same FR-CSE-082 check as live-mode callers. A caller who cannot perform a live erasure also cannot perform a dry-run. |
| The erasure API runs as SYSTEM | Like `qdb_srv_RunDueSurveys`, the API creates its org service as SYSTEM and gates only the invoking user. The Survey Data Officer role therefore grants no table access; all data operations occur under SYSTEM. |

---

## 9. Dependencies

| Dependency | Detail | Owner |
|---|---|---|
| On-prem kit rebuild | The C# plugin assembly and provisioning manifest must be rebuilt and re-imported on both HL CRM and BFD CRM / QDB1. The retention changes, anonymise fix and new Custom API all require a new solution version. | MSS |
| Retention values set in Survey Settings | QDB Compliance must set `qdb_retention_days` = 730 and `qdb_retention_mode` = Delete (D2 / D3 / D4) in Survey Settings on each org after import. The retention passes are dormant until these values are set (unchanged from current behaviour). | QDB Compliance via Survey Admin |
| Runbook update | Stages must be added for: (a) verifying that `qdb_retention_days` and `qdb_retention_mode` are set before go-live; (b) the DSAR erasure procedure (dry-run → review counts → live execute → record in DSAR register), following `pdppl-decision-pack.md §8`. | MSS (runbook) + QDB Compliance (procedure) |
| Reporting query audit | Before anonymise mode is activated on any org, every view and Custom API query that joins responses to invitations (FR-CSE-080) must be updated. Activating anonymise before this silently drops anonymised rows from analyst views. | MSS (identify and fix queries), QDB Compliance (approve before activating) |
| D9 written sign-off | QDB Compliance issues one unconditional PDPPL sign-off after D7 and D8 are built and verified on the test orgs. Go-live on each production org waits for this sign-off (B2 gate, unchanged). | QDB Compliance |
| Survey Scheduler role (existing SEC-01 fix) | The existing audit condition SEC-01 (replace System Administrator gate on `RunDueSurveys` with the scoped `Survey Scheduler` role) is already provisioned in `manifest.mjs`. The new erasure API follows the same pattern and must not regress the scheduler role gate. | MSS |

---

## 10. Risks

| Risk | Impact | Owner | Note |
|---|---|---|---|
| Reporting views silently lose anonymised rows if not updated before anonymise mode is activated | High — incorrect analyst aggregates | MSS | Mitigated by FR-CSE-080 and the runbook gate in §9. If the view audit is missed, row counts will be under-reported with no error. |
| Erasure API called unintentionally or with the wrong CustomerGuid | High — permanent, irreversible data loss | QDB | Mitigated by FR-CSE-081 dry-run mode (required step in the DSAR procedure), FR-CSE-082 privilege gate and NFR-CSE-013 audit trail. |
| A customer with an unusually large suppression-log backlog (thousands of rows) causes the erasure API to exceed the 2-minute plugin limit | Medium — erasure fails; must be retried | MSS | NFR-CSE-012 covers this. If the test shows it is possible, a budget-and-rerun mechanism is added during design, like the daily retention pass. |
| Invitation cascade (BR-PDR-04) deletes a response a few days before its configured retention cutoff | Low — de minimis rounding | MSS | Accepted. Documented in BR-PDR-04. QA must account for it in retention-boundary test cases. |
| QDB Compliance delays D9 sign-off; retention passes are live but anonymise mode has not been confirmed | Medium — anonymise mode activated before D7 is verified | QDB Compliance | Mitigated by B2 gate (existing). D7 and D8 must be verified before sign-off; the sign-off is a hard go-live gate. |
| The 13-month invitation floor (FR-CSE-078) is not enforced before retention is set to a short period (e.g., test configuration) | Medium — milestone and fatigue data deleted prematurely | MSS | The floor is a runtime guard (not just configuration advice). Covered by FR-CSE-078 acceptance criteria. |

---

## 11. Open questions for the CEO

Each question requires a CEO answer before design begins. All three are consequential for the architecture.

**Answered by the CEO on 2026-11-15, each as recommended:** OQ-PDR-01 **Option A** (one `qdb_retention_days`
for all three tables); OQ-PDR-02 **Option B** (new Survey Data Officer role; System Administrators may also call
the API); OQ-PDR-03 **Option A** (invitations and suppression logs deleted in both modes; only responses anonymised).

---

**OQ-PDR-01: Should invitations and suppression logs share the same `qdb_retention_days` setting as responses, or have their own fields?**

Background: `qdb_retention_days` currently governs responses. D3 and D4 chose 24 months (730 days) for all three tables — the same as responses. If the periods ever diverge in a future decision, separate settings would be needed.

| Option | Detail |
|---|---|
| A — One setting for all three tables | Reuse `qdb_retention_days`. Simpler. All tables age out together. Future divergence requires a schema change. |
| B — Add `qdb_invitation_retention_days` and `qdb_suppression_retention_days` to Survey Settings | More flexible; more fields per org to configure; more code paths to test. |

Recommendation: **Option A.** The CEO chose 730 days for all three tables. Building separate fields for a divergence that has not been requested adds complexity without present benefit.

---

**OQ-PDR-02: Should a new "Survey Data Officer" role be created for the erasure API, or should only System Administrators be able to call it?**

Background: The erasure API is a DSAR operation that QDB Compliance must be able to execute. Requiring full System Administrator access to process DSAR requests grants excessive privilege.

| Option | Detail |
|---|---|
| A — System Administrator only | No new role. DSAR executions require a full CRM administrator. Simplest; suitable if QDB Compliance always works through QDB IT. |
| B — New Survey Data Officer role | Grants QDB Compliance staff the ability to run erasures without CRM administrative rights. Follows the least-privilege pattern already used for `Survey Scheduler`. |

Recommendation: **Option B.** Separating DSAR execution from full administration is consistent with PDPPL's principle that data-protection processing should be traceable to a named Compliance function, not an IT admin account.

---

**OQ-PDR-03: In Anonymise mode, should invitation and suppression-log rows be deleted, or should the API attempt in-place anonymisation of them?**

Background: FR-CSE-081 and BR-PDR-02 propose that invitations and suppression logs are deleted in both modes, and only responses are anonymised in Anonymise mode. The alternative is to attempt to null the customer lookup on invitation and suppression-log rows without deleting the rows.

| Option | Detail |
|---|---|
| A — Delete invitations and suppression logs in both modes; anonymise only responses | Practical. The dedupe key on the invitation embeds the customer GUID in plain text (`pdppl-decision-pack.md §4`); a true anonymise would have to clear it too, destroying its deduplication value. Suppression logs are append-only and cannot be updated. |
| B — In Anonymise mode, null the customer lookup on invitations and attempt to clear the customer lookup on suppression logs (requires removing the append-only constraint for this operation) | Preserves invitation and suppression-log rows for operational history (minus the customer link). Complex: requires clearing the dedupe key (losing deduplication), removing the append-only protection for the erasure path only, and careful handling of the suppression log's audit guarantee. |

Recommendation: **Option A.** The append-only constraint on the suppression log is a NFR-CSE-001 audit guarantee; weakening it only for erasure creates a loophole. Deleting in both modes is cleaner and consistent with how the daily retention pass handles these tables.

---

## 12. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | CEO | **APPROVED** (OQ-PDR-01 A, 02 B, 03 A) | 2026-11-15 |
| Requestor | Pending | PENDING | |

This addendum must be CEO-approved before design or code begins. It becomes v1.4 of the BRD on approval.
