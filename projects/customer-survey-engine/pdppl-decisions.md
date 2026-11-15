# PDPPL decisions — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Date | 2026-11-15 |
| Decided by | CEO, answering the decision pack (`pdppl-decision-pack.md`) on QDB's behalf |
| Still required | **QDB Compliance's written sign-off (B2)**, which confirms these decisions. It is issued after MSS builds D7 and D8 (see D9) |

Every decision below is the MSS recommendation in the decision pack.

| # | Decision | Answer | Checklist |
|---|---|---|---|
| D1 | Data classification | **Graduated**: responses and answers Restricted; invitations, suppression logs and their change history Confidential; configuration tables Internal | B1 |
| D2 | Responses and answers | **Delete at 24 months** (Survey Settings: Retention Days 730, Mode Delete) | B1 |
| D3 | Invitations | **Kept as long as responses: 24 months** (never under 13 months, so the fatigue and milestone checks stay reliable) | B7 |
| D4 | Suppression logs | **Delete at 24 months** | B7 |
| D5 | SMS and email hand-off activities | **QDB's existing activity policy at release 1** (channels are off, so no rows exist); **MSS builds deletion of each row once its link is used or expires when the channels are enabled** | B7 |
| D6 | CRM change history (audit log) | **At least 24 months** on HL CRM and QDB1, set by QDB IT | B7 |
| D7 | Anonymise scope | **MSS extends anonymise** to also clear the response's invitation link and source pointer (`qdb_survey_invitation_id`, `qdb_source_table`, `qdb_source_record_id`); reports use the setup or form code instead | B3 |
| D8 | Per-customer erasure | **MSS builds `qdb_srv_EraseCustomerSurveyData`**: customer, Delete or Anonymise, dry run; returns per-table counts for the erasure-request record | B7 |
| D9 | Written sign-off | **Issued after MSS builds and verifies D7 and D8**, as one unconditional sign-off. Go-live waits for that build | B2 |

## What this creates for MSS

1. The 24-month retention for invitations and suppression logs (D3, D4): the daily run deletes them, as it already does responses.
2. The anonymise fix (D7).
3. The erasure API (D8).
4. When the secure-link channels are enabled: deletion of used or expired hand-off activities (D5).

Items 1–3 change what the engine promises, so they go through the new-feature workflow (BRD addendum, CEO approval)
before any build.

## Per-org configuration answers (same session)

The questions in `onprem-deploy/2026-11-11/config/` (`HL.json`, `BFD.json`, README).

| ID | Answer |
|---|---|
| HL-04, BFD-04 | **Default survey language: Arabic (`ar`) on both orgs.** Written into both config files |
| HL-05, BFD-05 | **Left with QDB's CRM administrators.** The language field is a setting on each org's Survey Settings row (`qdb_language_field`), changeable without code; until it is set, every customer gets Arabic |
| HL-06, BFD-06 | **Left with QDB's CRM administrators.** The mobile field is a setting on each org's SMS row (`qdb_customer_phone_field`), changeable without code |
| HL-01, HL-02, HL-03 | **Left with the HL CRM administrator** (HL-02 and HL-03 depend on the tables HL-01 names) |
| BFD-02, BFD-03 | **Left with QDB** (business owner and QDB1 CRM administrator) |
| HL-07..HL-11, BFD-07..BFD-09, E1, B4, B5 | **Left with QDB** (SMS service owner, QDB IT, portal team). Secure links are off at release 1; these are answered before switching them on |

## What this leaves with QDB

- QDB Compliance's written sign-off (D9), after items 2 and 3 are built.
- QDB IT sets the audit-log retention (D6) on both orgs.
- Residuals outside MSS scope, to be acknowledged in the sign-off: database backups, Excel exports, the SMS gateway,
  the email system and the portal.
