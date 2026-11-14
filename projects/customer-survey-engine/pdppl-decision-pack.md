# PDPPL Decision Pack — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| **Date** | 2026-11-14 |
| **Prepared by** | MSS Technologies |
| **To** | QDB Compliance and Legal |
| **Status** | For decision — four go-live checklist items require QDB Compliance sign-off before Release 1 ships |

---

## 1. Why this pack

Qatar's Personal Data Privacy Protection Law (PDPPL) requires that personal data be classified, retained only as long as necessary, and erased on request. The Customer Survey Engine handles QDB customer identifiers and survey responses; it cannot go live until QDB Compliance has formally decided how that data is classified and when it is cleaned up. This is recorded in the go-live checklist as items **B1** (data classification and retention settings), **B2** (written PDPPL sign-off), **B3** (anonymisation scope), and **B7** (invitation, suppression-log and hand-off-activity retention, plus a per-customer erasure procedure).

This pack gives QDB Compliance every fact needed to make those four decisions in a single sitting. Each decision is numbered D1 through D9. Where MSS has a recommendation, one is stated with a one-line reason. All technical claims in this document are drawn directly from the delivered code and configuration; the evidence references in the Appendix let QDB's technical reviewers verify every statement.

---

## 2. What the engine does with customer data

- **Identifies which customer to survey.** When a CRM event fires (a loan reaches a configured status, a schedule runs, or a milestone count is reached), the engine looks up the customer linked to that event and decides whether to send a survey.
- **Applies fatigue and duplicate rules.** Before creating an invitation, the engine checks whether the customer was surveyed too recently (the fatigue window) or has already received this exact survey for this event. These checks read from previously stored invitation records.
- **Creates an invitation record** in CRM, linking it to the customer and to the source transaction (the loan, fund transfer, or other record that triggered the survey). The invitation holds a one-way hash of a single-use access token for the portal; it does not hold the customer's name or contact details.
- **Hands the invitation to the portal.** QDB's portal reads pending invitations via two read-only integration APIs. The portal presents the survey to the logged-in customer and submits their answers back through a third API.
- **Stores responses and answers** in CRM under the Survey Analyst role, linked to the invitation and to the customer. Free-text and numeric answers are stored. The Survey Admin role cannot read this data.
- **Records why a survey was not sent** in a suppression log (for example: customer surveyed too recently, no customer found, survey inactive). This log is append-only.

The SMS and secure-link delivery channels are built but **disabled at Release 1**. No phone numbers or email addresses are written to the survey tables at release; that data would appear in native CRM activity records (letter or fax rows on HL; email rows on BFD/QDB1) only after QDB Compliance enables those channels following a separate security review.

---

## 3. Where the data lives

**Release 1 is on-premise only.** All QDB customer data written by this engine lives on:
- **HL CRM** (on-premise, Qatar) — customers are contacts
- **BFD CRM / QDB1** (on-premise, Qatar) — customers are accounts

No customer data from either production org is sent to any cloud system. MSS uses a separate cloud test environment (Microsoft's EMEA region) for development and testing; it holds only synthetic data with no real QDB customer records. That environment is not part of Release 1 and is not reachable by QDB customers.

---

## 4. Data inventory

The following table covers every kind of record the engine creates or updates. "Who can read" refers to the survey roles delivered by MSS; System Administrator access is assumed throughout.

| Record type (table name) | Personal data it holds | Data category | Who can read | How long kept today |
|---|---|---|---|---|
| **Survey invitation** (`qdb_survey_invitation`) | Direct link to customer (account or contact lookup); link to the source transaction; a customer-GUID embedded in a text field used for duplicate checking; a one-way hash of the access token; customer's language preference | Identifier; access token hash | Survey Admin (read), Survey Analyst (read), Survey Integration (read) | Indefinitely — no retention job targets invitations. **B7 open.** |
| **Survey response** (`qdb_survey_response`) | Direct link to customer (until anonymised); link to source transaction; link to invitation; full submitted answers as JSON (until anonymised); numeric scores (kept after anonymise) | Identifier; customer opinion / feedback | Survey Analyst (read), Survey Integration | Indefinitely today — the daily retention job is dormant until Compliance sets the period and mode. **B1 open.** |
| **Survey answer** (`qdb_survey_answer`) | Free-text answer (until anonymised); numeric rating; per-question scores (kept after anonymise) | Customer opinion / feedback | Survey Analyst (read), Survey Integration | Same as response — cascaded delete or text nulled on anonymise |
| **Suppression log** (`qdb_survey_suppression_log`) | Direct link to customer (when present); link to source transaction; a text field that embeds the invitation identifier on delivery failures | Identifier (operational audit) | Survey Admin (read only), Survey Integration (create / read) | Indefinitely — append-only, no retention job. **B7 open.** |
| **Survey settings** (`qdb_survey_settings`) | None — holds configuration values only | Operational / configuration | Survey Admin, Survey Integration (read) | Permanent |
| **Survey source, setup, trigger, SMS config** (four configuration tables) | None | Operational / configuration | Survey Admin, Survey Analyst (read), Survey Integration (read) | Permanent |
| **SMS hand-off activities** (native CRM `letter` rows on HL; `fax` rows on BFD/QDB1) | Customer's mobile phone number; full SMS message body including plaintext access token and link; direct link to customer | Contact details; access token (plaintext) | Native CRM activity permissions — not survey-role gated. Any CRM user with read on the letter or fax entity can see this data. | **Dormant at Release 1.** When enabled: QDB's existing CRM activity retention. **B7 open once channels are enabled.** |
| **Email activity rows** (native CRM `email` entity) | Customer reference; full HTML email body including plaintext access token as a hyperlink | Identifier; access token (plaintext) | Native CRM email permissions — not survey-role gated | **Dormant at Release 1.** When enabled: QDB's existing CRM email retention. |
| **Platform change history** (audit rows on 7 tables) | For invitation and suppression-log tables: customer identifier, CRM display name of the customer, source transaction pointer — captured at every create or update | Identifier | System Administrator; users granted the platform audit-read privilege (not granted to any survey role) | Governed by QDB IT's org-level CRM audit retention settings — not controlled by the engine |
| **Plugin trace logs and async job records** | Customer GUID embedded in a trace line written when an invitation is created (the duplicate-check key contains the GUID) | Identifier (GUID, not name or contact detail) | System Administrator only | Governed by QDB IT's CRM plug-in trace log lifetime setting |

---

## 5. How someone could still be identified after the current clean-up

The engine's daily retention job cleans **responses and answers only**. It has two modes:

**Delete mode** removes the response and cascades to its answer rows. After deletion, the following records still identify the customer:

1. The **invitation row** (never touched by retention) carries a direct customer lookup and the source transaction pointer.
2. The **duplicate-check key** on the invitation row embeds the customer's CRM identifier in plain text in every variant (event, milestone, and schedule keys — none are hashed under normal conditions).
3. The **suppression log** (append-only, never cleaned) carries the customer lookup, the source transaction pointer, and in delivery-failure rows, the invitation identifier.
4. The **platform change history** on invitation and suppression-log rows captures the customer identifier on every create and update. Deleting the live row does not delete its change history.
5. Any **Excel exports** already taken by analysts or admins, database backups, and any data already seen by QDB's SMS gateway or email system, are outside the engine's reach entirely.

**Anonymise mode** additionally replaces the response name with the text "Anonymised response", clears the customer lookup on the response, clears the submitted-answer text, and clears per-answer free text. It does not touch any of items 1–5 above. It also leaves two re-identifiers on the response row itself:

- The **link from the response to its invitation** is never cleared. The invitation still names the customer. An analyst can re-identify any "anonymised" response in one step by following this link — this is a confirmed gap recorded as CMP-02 in the audit findings.
- The **source transaction pointer** (`qdb_source_table` and `qdb_source_record_id`) is not cleared. Following the pointer leads back to the customer's loan or request record, which carries the customer lookup.

In plain terms: the current anonymise mode removes submitted text but does not make a response anonymous. It is reporting-preserving, not identity-removing.

---

## 6. What a per-customer erasure request would have to cover

**What must be found and acted on** for a single customer across this engine:

- All **invitation rows** for that customer — by customer lookup, by source transaction (where the source record belongs to that customer), and by invitation rows whose duplicate-check key embeds the customer's GUID.
- All **response rows** and their **answer rows**, reachable via the customer lookup and via the invitation link.
- All **suppression-log rows** for that customer — by customer lookup and by source transaction pointer.
- If the SMS or email channels are ever enabled: all **letter, fax, or email activity rows** created for that customer's invitations (recipient field, body, customer link).
- **Platform change history rows** for invitation and suppression-log tables that captured the customer's data — but see the limitation immediately below.

**What the engine does not support today:**

There is no per-customer erasure capability. The retention job is age-based and acts only on responses. Deleting the customer record in CRM does not cascade to survey tables (this is by design — the survey tables store RemoveLink relationships to customer records, so the customer lookup is cleared but the survey rows survive). No Custom API or administrative script for customer-scoped erasure exists in the delivered solution.

**Limitations outside MSS-delivered scope:**

- **Platform change history** cannot be purged per customer or per record on Dynamics CRM 9.1. It is deleted by date range across all records in a partition. Purging one customer's audit entries without removing everyone else's for that period is not possible on the platform. This is QDB IT's responsibility.
- **Database backups** taken before a deletion or anonymisation are outside the engine's reach. These are QDB's own DR/backup regime.
- **Excel exports** already taken are outside the engine. The Survey Analyst and Survey Admin roles hold the export privilege.
- **QDB's SMS gateway and Email Router** may retain message content (including the plaintext token and recipient number) in their own logs. This is outside MSS scope.
- **QDB's customer portal** may hold cached invitation or answer data. This is built by QDB's own teams.

---

## 7. Decisions needed

---

### D1 — Data classification of each kind of record

**Checklist item: B1**

**Question:** What is QDB's formal PDPPL data classification for each category of data the survey engine holds?

| Data | Proposed classification | Notes |
|---|---|---|
| Invitation rows (customer lookup + source transaction + duplicate-check key with customer GUID) | Confidential | Directly identifies a customer and a specific transaction |
| Response and answer rows (customer identity + submitted answers) | Restricted | Most sensitive; free-text answers may disclose financial or personal circumstances |
| Suppression log rows (customer lookup + source pointer) | Confidential | Operational audit; identifies customers by omission |
| Configuration tables (source, setup, trigger, settings, SMS config) | Internal | No personal data |
| Change history rows on invitation and suppression-log tables | Confidential | Contains the same identifiers as the live rows |

**Options:**
- **Option A — Adopt the proposed classification above.** Consequences: response/answer data receives the highest access controls and shortest permitted retention; invitation and suppression-log data are treated as confidential with proportionate controls.
- **Option B — Treat all survey personal data as a single Restricted class.** Consequence: invitations and suppression logs are managed with the same controls as response content, which may be operationally burdensome (e.g., suppression logs exist to protect customers from over-survey — restricting access to them may impede that check).
- **Option C — Treat invitations as Internal.** Consequence: understates the re-identification risk (the invitation holds the customer lookup and source pointer and survives all current clean-up paths).

**MSS recommendation: Option A.** The graduated classification reflects the actual sensitivity gradient and the access controls already built into the roles.

---

### D2 — Retention period and mode for responses and answers

**Checklist item: B1**

**Question:** How long should survey responses and answers be kept, and should expired ones be deleted or anonymised?

**Options:**
- **Option A — Delete after N months.** The response row and all its answer rows are removed permanently. Historical response counts, NPS trends, and per-survey scores for the deleted period are lost. Fatigue and duplicate checks are unaffected (those read invitations, not responses).
  - *Side effect:* Cleanest from a PDPPL perspective once the period passes.
- **Option B — Anonymise after N months (requires D7 to be decided first).** The customer link and free-text answers are cleared; numeric scores and counts are kept. Historical aggregate reporting survives. The response remains re-identifiable via its invitation link and source pointer **until D7 is also implemented**.
  - *Side effect:* Anonymise is only genuinely anonymous after the CMP-02 fix (clear invitation link and source pointer from the response). Using Anonymise mode before that fix is confirmed by QDB Compliance as acceptable, or the fix is built, produces rows that look anonymised but are not.
- **Option C — Keep indefinitely.** Full fidelity; fails PDPPL storage-limitation expectation.

**What period?** The BRD records no minimum for responses. The business value (trend reporting, complaint follow-up) is highest in the first 12 months. PDPPL storage-limitation principle points toward the shortest period that meets the reporting need.

**MSS recommendation: Option A — Delete at 24 months** if D7 cannot be resolved before go-live; **Option B — Anonymise at 24 months** once the CMP-02 fix is built and confirmed. Reason: 24 months covers two annual survey cycles and regulatory complaint-window expectations; Delete is the safe default until the anonymise re-identifiers are cleared.

---

### D3 — Retention period for invitations

**Checklist item: B7**

**Question:** Should invitation rows be deleted after a set period?

**Important constraint:** Invitations drive two engine behaviours:

1. **Fatigue check** — the engine refuses to survey a customer who received any survey within the fatigue window (default 30 days). If invitations younger than the fatigue window are deleted, a customer can be re-surveyed immediately.
2. **Milestone duplicate check** — the engine tracks "how many milestones has this customer been surveyed at?" by counting their invitation rows. If those rows are deleted, the milestone counter resets to zero and the engine may re-send a survey the customer already completed. This is not a cosmetic problem; it is a material risk of duplicate contact.

**Options:**
- **Option A — Keep invitations for the same period as responses (D2 decision), and no shorter than 13 months.** 13 months covers the longest schedule period (annual) plus a fatigue buffer. Consequences: invitation PII persists for the same period as response PII; milestone dedupe is reliable for the full retention window.
- **Option B — Delete invitations after a shorter period, with MSS building a milestone high-water-mark store.** A separate record would hold the highest milestone index reached per customer per survey, independent of the invitation table. This would allow shorter invitation retention without the re-survey risk. Consequence: additional MSS build work required.
- **Option C — Keep invitations indefinitely.** Consequence: customer lookup and source pointer persist without expiry; not proportionate under PDPPL.

**MSS recommendation: Option A.** Reason: avoids milestone re-fire without additional build work; aligns invitation and response lifetimes so clean-up is a single operation.

---

### D4 — Retention period for suppression logs

**Checklist item: B7**

**Question:** Should suppression-log rows be deleted after a set period?

**Context:** The suppression log is append-only by role design. Rows record why a customer was not surveyed. Each row holds the customer lookup (when a customer was identified) and the source transaction pointer. The data has operational value for auditing over-survey complaints. The BRD records a minimum retention floor of one year (phase-2-ba.md, section 10).

**Options:**
- **Option A — Delete after 13–24 months.** Aligns with the BRD floor; operational value decays after one survey cycle.
- **Option B — Keep indefinitely.** Full audit trail; PII accumulates without limit.

**Side effect in both options:** The append-only design means in-place anonymisation is not possible without changing the architecture. Deletion is the only clean-up path.

**MSS recommendation: Option A — Delete at 24 months.** Reason: meets the BRD minimum; proportionate to the operational purpose; aligns with the response and invitation lifetime chosen in D2 and D3.

---

### D5 — Retention for SMS and email hand-off activities (when channels are enabled)

**Checklist item: B7 (applies when the secure-link channel is enabled — dormant at Release 1)**

**Question:** When the SMS and email channels are later enabled, how long should the native CRM activity rows (letter, fax, email) created for survey delivery be kept?

**Context:** Each row holds the customer's mobile phone number or email address, the full message body with the plaintext access token and link, and a direct link to the customer. The token becomes useless once the invitation expires or the survey is submitted, but the row persists. These rows are on native CRM activity tables and are not gated by the survey roles — any CRM user with read access to the letter, fax, or email entity can read them.

**Options:**
- **Option A — Delete each activity row once its linked invitation is used or expired.** The engine could be extended to do this. Consequence: requires additional MSS build work; cleanest from a data-minimisation perspective (the token is the only reason to retain the row).
- **Option B — Apply QDB's existing CRM activity bulk-delete / retention policy.** No additional build required; the row persists for whatever period QDB's standard email and letter/fax activity retention specifies.

**MSS recommendation: Option B at Release 1 (channels are off, so no rows exist); Option A when channels are enabled.** Reason: the token and phone number in the message body are the most sensitive combination in the entire engine; active retention matching the invitation lifetime is proportionate and reduces the access-control gap noted in audit finding CMP-06.

---

### D6 — Retention of platform change history (audit log)

**Checklist item: B7**

**Question:** How long should the platform audit log retain change history for the seven survey tables?

**Context:** Change history is on for the invitation table, the suppression-log table, and five configuration tables. The invitation and suppression-log change history captures the customer identifier at every create and update. This history cannot be purged per customer or per record — it is deleted by date range across all records. It is not affected by the engine's response-retention job. The retention period is set by QDB IT at the CRM organisation level and is unknown at this time.

**Decision needed:** QDB IT must set an audit-log retention period on both HL CRM and QDB1. That period should be at least as long as the response/invitation retention period chosen in D2 and D3 (to ensure change history does not expire before the records it tracks), or in line with QDB's banking-audit policy (which may be longer). QDB Compliance and QDB IT must agree which takes precedence.

**A residual to record:** Even with an agreed audit retention period, change-history rows that captured a customer's invitation data before it was deleted or anonymised will survive until the audit partition ages out. This should be noted on any DSAR response as a time-limited residual.

**MSS recommendation:** Set audit-log retention to no less than 24 months on both orgs, aligned with D2 and D3 decisions. QDB IT configures this — it is not part of the delivered solution.

---

### D7 — Anonymise scope: which re-identifiers must be cleared

**Checklist item: B3**

**Question:** If Anonymise mode is chosen in D2, which additional fields must be cleared from the response row to make anonymisation genuine?

**Current state:** The existing anonymise operation clears the customer lookup on the response, clears submitted-answer text, and replaces the response name with "Anonymised response". It does **not** clear:

- The **link from the response to its invitation** (`qdb_survey_invitation_id`). The invitation names the customer. Following this link re-identifies the response in one step. This is audit finding CMP-02.
- The **source transaction pointer** (`qdb_source_table`, `qdb_source_record_id`). Following this pointer leads to the customer's loan or request record.
- **Numeric scores and answer ratings.** These are kept for aggregate reporting. In a small-population survey (e.g., one fund-transfer type with few customers), a numeric score combined with timing may still identify an individual. This is a quasi-identifier risk QDB Compliance must assess.

**Options:**
- **Option A — Extend Anonymise to also clear the invitation link and source pointer.** The response becomes a bare score/count row with no path back to any person. Aggregate reporting on numeric answers and scores survives. MSS builds this change before go-live.
  - *Side effect on reporting:* The invitation link is used by some reporting queries to relate a response to its survey configuration; these queries must be updated to use `qdb_survey_setup_id` or `qdb_form_code` instead (both are kept on the response).
- **Option B — Accept the current anonymise scope.** The source pointer and invitation link survive. QDB Compliance formally accepts that "anonymised" responses remain re-identifiable and relies on role access controls (Survey Analyst only) as the compensating control.
- **Option C — Use Delete mode only (from D2).** Avoids the question entirely; no anonymised rows exist.

**MSS recommendation: Option A.** Reason: without clearing the invitation link, anonymise mode does not meet the PDPPL anonymisation standard; the compensating-control argument of Option B is fragile (the Survey Analyst role can join the invitation in one query).

---

### D8 — Per-customer erasure procedure

**Checklist item: B7**

**Question:** When a customer submits an erasure (DSAR) request, what procedure must QDB follow to erase their survey data?

**Current state:** No automated erasure capability exists. The engine has no Custom API or script for customer-scoped deletion or anonymisation. This is audit finding CMP-03.

**Options:**
- **Option A — MSS builds a dedicated erasure Custom API** (`qdb_srv_EraseCustomerSurveyData`) that takes the customer identifier, a mode (Delete or Anonymise), and a dry-run flag. It deletes or anonymises all survey rows for that customer and returns per-table counts for the DSAR record. QDB Compliance triggers this as a privileged operation.
- **Option B — QDB IT performs manual deletion** using CRM's Advanced Find to locate and delete invitation, response, and suppression-log rows for the customer. No MSS build required; relies on a CRM administrator following a written procedure.

**Side effects of erasure (both options):**
- Deleting an invitation used for milestone tracking resets the milestone counter to zero. That customer may receive a milestone survey again (see D3).
- Deleting an invitation younger than the fatigue window means the customer could be surveyed sooner than the fatigue rule intended.
- Platform change history is not affected by either option (see D6).
- Excel exports and backups already taken are not affected.

**MSS recommendation: Option A.** Reason: manual deletion by CRM Admin is error-prone and leaves no automated audit trail; a Custom API can produce a count-and-timestamp record for the DSAR register and enforce consistent logic across both orgs.

---

### D9 — Written sign-off statement required for B2

**Checklist item: B2**

**Question:** What must the written PDPPL sign-off state?

**The sign-off must confirm, at minimum:**

1. The data classification chosen in D1.
2. The retention period and mode for responses chosen in D2.
3. The retention period for invitations (D3), suppression logs (D4), and hand-off activities (D5).
4. The audit-log retention period to be configured by QDB IT (D6).
5. That anonymise scope (D7) either meets the PDPPL anonymisation standard (Option A) or that QDB Compliance formally accepts the residual re-identifiers (Option B).
6. That a per-customer erasure procedure exists (D8) or that the gap is accepted with a named remediation date.
7. That QDB acknowledges the residuals outside MSS scope: database backups, Excel exports, the SMS gateway, the email system, and the portal.

**MSS recommendation:** Use the sign-off block at the end of this document. Options A from D7 and Option A from D8 must be completed by MSS before the sign-off is issued; if the go-live date requires an earlier sign-off, QDB Compliance should issue a conditional approval naming CMP-02 and CMP-03 as post-go-live remediation items with a fixed date.

---

## 8. Proposed per-customer erasure procedure (pending D-decisions)

This procedure is a proposal. It becomes effective once D8 Option A is built and D-decisions are confirmed.

1. **Intake and verify** (QDB Compliance). Receive the erasure request. Verify the customer's identity using QDB's standard DSAR verification process. Record the request in QDB's DSAR register (maintained outside the survey tables — response and answer rows have no change history by design).
2. **Identify the customer record** (QDB CRM Administrator). Find the customer's CRM identifier (account GUID on BFD/QDB1; contact GUID on HL) and confirm which orgs hold records for them.
3. **Run the erasure API in dry-run mode** (QDB CRM Administrator or Compliance). Call `qdb_srv_EraseCustomerSurveyData` with DryRun = true. Review the row counts: invitations, responses, answers, suppression-log rows. Confirm the counts are plausible before proceeding.
4. **Execute the erasure** (QDB CRM Administrator, acting as the system account). Call the API in live mode on each org where records exist. The API returns per-table row counts.
5. **Erase native hand-off activities** (QDB IT). If the SMS or email channels have been enabled, locate and delete any letter, fax, or email activity rows linked to that customer's invitations. This step is outside the survey solution.
6. **Record the outcome** (QDB Compliance). Log counts, timestamps, and the name of the executing user in the DSAR register.
7. **Note the residuals** (QDB Compliance). Confirm in the DSAR register: (a) platform change history for invitation and suppression-log rows will persist until QDB IT's audit-log retention period expires; (b) any database backups taken before the erasure date may still contain the customer's data; (c) any Excel exports already taken are outside the engine's scope; (d) QDB's SMS gateway and email system logs are outside MSS scope.

**Roles:** QDB Compliance (intake, record); QDB CRM Administrator (dry-run + execute + hand-off activities); QDB IT (audit log, backups).

---

## 9. What MSS will build, and what is QDB's responsibility

**MSS will build (once decisions are confirmed):**

| Item | Triggered by | Notes |
|---|---|---|
| Fix CMP-02: extend Anonymise to clear the invitation link and source pointer from response rows | D7 Option A | Small code change in `ResponseRetentionStore.cs`; reporting queries must be updated to use `qdb_form_code` / `qdb_survey_setup_id` |
| Build CMP-03: `qdb_srv_EraseCustomerSurveyData` Custom API | D8 Option A | Dry-run + live mode; per-table counts returned; least-privilege role, runs as SYSTEM |
| Activate the retention job: Compliance sets Retention Days and Retention Mode in Survey Settings | D2 | No code change required; settings are already built; the job is dormant until values are set |
| Add invitation retention to the daily pass | D3 | A retention period for invitations is not yet implemented; requires a small addition to `RetentionPass.cs` |
| Add suppression-log deletion to the daily pass | D4 | Same scope as invitation retention |

**QDB's responsibility:**

| Item | Owner |
|---|---|
| Set the data classification on CRM tables and fields per D1 | QDB IT / Compliance |
| Set Retention Days and Retention Mode in Survey Settings on each org | QDB Compliance (action via Survey Admin) |
| Set the platform audit-log retention period on HL CRM and QDB1 | QDB IT |
| Maintain the DSAR register (outside the survey tables) | QDB Compliance |
| Clean up native email, letter, and fax activity rows for hand-off deliveries (when channels enabled) | QDB IT |
| Manage database backups that pre-date any erasure | QDB IT / DR team |
| Manage any Excel exports already taken from the survey tables | QDB Compliance |
| Confirm the SMS gateway's own retention and logging policy | QDB IT / SMS provider |
| Confirm the email system's (Email Router) own retention and logging policy | QDB IT |
| Confirm the portal's own caching and retention of survey data | QDB portal development team |
| Confirm the mobile phone field name used for HL contacts (proposed: `mobilephone`, unconfirmed) | QDB HL CRM Administrator |

---

## 10. Sign-off block

| | |
|---|---|
| **Prepared by** | MSS Technologies |
| **Document version** | 1.0 |
| **Date** | 2026-11-14 |

| Role | Name | Decision on each D-item | Date | Signature |
|---|---|---|---|---|
| QDB Head of Compliance | | D1: &nbsp;&nbsp; D2: &nbsp;&nbsp; D3: &nbsp;&nbsp; D4: &nbsp;&nbsp; D5: &nbsp;&nbsp; D6: &nbsp;&nbsp; D7: &nbsp;&nbsp; D8: &nbsp;&nbsp; D9: | | |
| QDB Legal | | Concurs / objects: | | |
| QDB IT (audit log + backups) | | D6 confirmed: audit log will be set to __ months on HL and QDB1 | | |
| MSS Technologies Project Lead | | Noted | | |

---

## Appendix: evidence references

The following file and section references support each section of this document. QDB's technical reviewers can verify every claim against the delivered code and design documents in the project repository.

| Section | Claim | Evidence |
|---|---|---|
| §2 — What the engine does | Fatigue check reads invitation rows | `SurveyWriters.cs:35-44`; `SurveyConfig.cs:104` (FatigueMinDays default 30) |
| §2 | Duplicate check reads invitation by dedupe key | `SurveyWriters.cs:27-32` |
| §2 | Portal reads via ListPendingSurveys and GetSurvey Custom APIs | `PendingSurveyLister.cs:29-44`; `phase-2-ba.md` FR-CSE-050, FR-CSE-051 |
| §2 | Portal submit via SubmitResponse Custom API | `phase-2-ba.md` FR-CSE-052 |
| §2 | Secure-link channels disabled at Release 1 | `manifest.mjs:188` (`qdb_securelink_enabled` default false); `InvitationDispatchService.cs:55` (dispatch blocked when false) |
| §3 — Where the data lives | Release 1 is on-premise only | `phase-2-ba.md` §4.1; `go-live-checklist.md` line 7 (cloud org is build/test only); `phase-6-audit.md` CMP-07 |
| §4 — Inventory, invitation | Customer lookup and source pointer | `SurveyWriters.cs:75,78-79`; `manifest.mjs:218-220` (relationships) |
| §4 | Dedupe key embeds customer GUID — plaintext in all variants, no hashing | `TriggerRules.cs:135-150` (ForRecord, ForMilestone, ForSchedule — only ForRecord has a length guard, never triggered under normal GUID lengths); `SurveyWriters.cs:87` |
| §4 | Token hash only (SHA-256, not plaintext) | `LinkToken.cs:9-11,25-35`; `ADR-004` |
| §4 | No retention job targets invitations | `RetentionPass.cs:32-37` (responses only); no other pass |
| §4 — Inventory, response/answer | Customer lookup cleared by Anonymise | `ResponseRetentionStore.cs:46` |
| §4 | Answers cleared by Anonymise; numeric scores kept | `ResponseRetentionStore.cs:40-50` |
| §4 | Survey Admin cannot read responses or answers | `manifest.mjs:258-271` (Admin role — no response or answer listed) |
| §4 | Retention job dormant until values are set | `RetentionPass.cs:32-37` (guard on retention_days > 0 and mode set) |
| §4 — Inventory, suppression log | Append-only by role; customer lookup present when customer found | `SurveyWriters.cs:111-124`; `manifest.mjs:245-256` (no Delete right on suppression log for any survey role) |
| §4 | NoCustomer rows still carry source pointer | `CandidatePreparer.cs:28`; `SurveyWriters.cs:116-118` |
| §4 — Change history | 7 tables have change history on | `manifest.mjs:69,84,101,120,170,180,194` (isAuditEnabled:true) |
| §4 | Response and answer change history is off | `manifest.mjs` — isAuditEnabled absent at lines 138-168; `phase-3-ceo-arch-decision.md:34` (CEO decision 2026-11-14) |
| §4 — SMS/email activities | Phone number read at dispatch from customer record; not stored in survey tables | `InvitationDispatchService.cs:77`; `DispatchStore.cs:45,51-55` |
| §4 | Email field is hard-coded as `emailaddress1`; mobile field is configurable | `DispatchStore.cs:45` (emailaddress1); `manifest.mjs:198` (qdb_customer_phone_field) |
| §4 | Plaintext token only appears in SMS/email message body — survey tables hold hash only | `SmsHandOff.cs:36`; `EmailSender.cs:46`; `SurveyMessageComposer.cs:30,40-42`; `LinkToken.cs:35` (survey table stores lowercase hex SHA-256) |
| §4 | SMS/email activity rows not gated by survey roles | `phase-6-audit.md:88,98` (CMP-06) |
| §5 — Re-identification | Invitation never touched by retention | `RetentionPass.cs:32-37` |
| §5 | Anonymise sets response name to "Anonymised response", does not null it | `ResponseRetentionStore.cs:14` (const AnonymisedName); `:46` (assigned) |
| §5 | Anonymise does not clear invitation link or source pointer (CMP-02) | `ResponseRetentionStore.cs:40-50`; `phase-6-audit.md:119` |
| §5 | Analyst can re-identify an anonymised response via invitation link | `manifest.mjs:272-287` (Analyst has Read on invitation and response); `PendingSurveyLister.cs` (portal API does not expose the source pointer — this is an internal analyst path only) |
| §6 — Erasure | No erasure Custom API exists | Grep of seven Custom APIs: GetSurvey, ListPendingSurveys, SubmitResponse, ValidateLinkToken, RunDueSurveys, ActivateSource, DeactivateSource — none for erasure |
| §6 | Customer delete does not cascade to survey rows (RemoveLink) | `manifest.mjs:218-228` (all three customer lookups are RemoveLink); `ADR-007:38` |
| §6 | Audit log cannot be purged per customer on CRM 9.1 | CRM platform behaviour; `phase-6-audit.md` §7 (AUD-01, line 146) — QDB IT controls |
| §7 D3 | Milestone high-water-mark read from invitation rows | `SurveyWriters.cs:47-56`; `TriggerRules.cs:43-56`; `MilestoneCounter.cs:34-46` |
| §7 D7 | CMP-02 — invitation link and source pointer survive Anonymise | `ResponseRetentionStore.cs:40-50`; `ResponseWriter.cs:47,50-51`; `go-live-checklist.md` B3 |
| §7 D8 | CMP-03 — no per-customer erasure | `phase-6-audit.md:120`; `manifest.mjs:218-228` |

---

*End of PDPPL Decision Pack — CSE-ENG-001 — 2026-11-14*
