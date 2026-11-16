# Per-org survey configuration — HL CRM and BFD CRM / QDB1

`HL.json` and `BFD.json` hold the configuration rows each org needs after the kit is imported: the
survey **sources**, the org's **Survey Settings** row and its **SMS hand-off** row. They have the same
shape as the cloud seed (`provisioning/seed/org5869857f.json`), and `onprem/__tests__/org-config.test.mjs`
checks every column and choice value against the schema.

A value marked `TO_CONFIRM` is not known yet; each one has an entry in the file's `questions` list,
with who answers it and what it blocks. **A row must not be entered while it still carries a
`TO_CONFIRM` value.** Rows are entered in the Survey Engine app (Configuration area); sources go in
inactive and a System Administrator activates each one with `qdb_srv_ActivateSource`.

## What differs between the two orgs

| | HL CRM | BFD CRM / QDB1 |
|---|---|---|
| Customers | individuals | corporate / SME |
| Survey Settings → Customer Table | **Contact** (100000001) | **Account** (100000000) |
| Source tables | **not known**: HL has its own build; the cloud sandbox mirrors BFD | `qdb_loan_application`, `qdb_payment_authorization_ticket`, `qdb_cheque_clearing` (as on cloud; preflight verifies) |
| SMS table | `letter`: number in `vrp_address`, text in `vrp_description`, SMS vs WhatsApp by `vrp_type` | `fax`: number in `faxnumber`, text in `qdb_message_body`; WhatsApp rows carry `qdb_whatsapptemplate` |
| Customer mobile field | proposed `contact.mobilephone` | `account.qdb_mobile_number` or `telephone1` |

## Status, 2026-11-16

Every question now carries an `answer` in its file (record: `pdppl-decisions.md`, update of 2026-11-16).
Settled: HL-04/05/06/08/09/12 and BFD-01/02/04/05/07/10. **Deferred to deployment configuration**, so QDB
enters them in the Survey Engine app and they don't block MSS: HL-01/02/03/07/10/11 and BFD-03/08/09. HL's
source rows and SMS static columns keep `TO_CONFIRM` until then.

One answer changes the engine: **BFD-06** wants the SMS sent to every filled number among five account
fields. The engine sends to one field, so this goes through BRD Addendum D; until then BFD uses `telephone1`.

## Questions for QDB, by what they block

| Blocks | HL | BFD | Owner |
|---|---|---|---|
| **Entering the source rows** | HL-01 tables and customer fields · HL-02 Digital/Legacy field | — (BFD-01 is a confirmation; the preflight checks it) | CRM administrator |
| **Activating a source** | HL-03 status values that fire each survey | BFD-02 Applications Digital/Legacy field · BFD-03 status values | Business owner + CRM administrator |
| **Entering the settings row** | HL-04 default language · HL-05 language field (empty allowed) | BFD-04 · BFD-05 | Business owner · CRM administrator |
| **Entering the SMS row** | HL-06 mobile field · HL-07 `vrp_type` SMS value and required columns | BFD-06 mobile field | CRM administrator / SMS service owner |
| **Secure-link SMS** | HL-08 does the SMS service need the To party? | BFD-07 does it need anything beyond number + text? | SMS service owner |
| **Secure-link email** | HL-10 sender queue with an approved mailbox | BFD-08 | QDB IT |
| **Switching secure links on** | HL-11 portal link-page URL | BFD-09 | Portal team (after the NFR-CSE-009 security review) |
| **Go-live** | HL-12 retention | BFD-10 | QDB Compliance (OQ-A1) |

Portal-only delivery (invitations listed by `qdb_srv_ListPendingSurveys` in the customer portal) needs
only the source, settings and trigger rows; the SMS, email and secure-link questions can follow.

## One engine limit these questions may expose

The SMS hand-off links the customer through a lookup column (`regardingobjectid`), not the activity's
**To** party. QDB answered HL-08 and BFD-07 on 2026-11-16: the SMS service does not read To, so no
change is needed.
