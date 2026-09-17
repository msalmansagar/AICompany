# Field Dictionary — Part 4: Existing system entities (extensions and reuse)

Legend and conventions: `FieldDictionary.md`. Entity = table heading. Nothing here is a new entity;
these are `qdb_` columns proposed on **existing** QDB entities, plus the existing columns DCP reads.
Before any column is added, the existing QDB customisations on `contact` / `account` must be inspected
for overlap — `TBD — Requires QDB Confirmation` (the 3C Merging workbook lists 560+ `qdb_` account
columns already).

## `contact` (HL customer master) — proposed `qdb_` extensions (CP §7)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stop Contact | qdb_stopcontact | bool | — | O | false | U | Y | FS | Suppresses all Collection communication; triggers `StopContactQueueMover` | Y | N | CbD | CbD | — | msst_dcpcustomer.msst_stopcontact | Persists across episodes ⇒ customer level |
| Stop Contact Reason | qdb_stopcontactreason | string | 500 | O | — | U | Y | — | Mandatory when flag set (form rule) | Y | N | CbD | CbD | — | new | |
| Stop Contact Date | qdb_stopcontactdate | datetime | — | O | — | P | RO | — | Set when flag flips true | Y | N | CbD | CbD | — | new | |
| Deceased | qdb_deceasedflag | bool | — | O | false | U/M | Y | FS | | Y | N | CbD | CbD | deceasedFlag / qcbDeceasedStatus | msst_deceasedflag | MIS may set via sync (configurable) |
| Date of Death | qdb_dateofdeath | datetime | — | O | — | U | Y | — | | Y | N | CbD | CbD | — | msst_dateofdeath | |
| Deceased Source | qdb_deceasedsource | string | 200 | O | — | U/M | Y | — | QCB · Family · Court · Other | Y | N | CbD | CbD | qcbDeceasedStatus | msst_deathsource | |
| Vulnerability | qdb_vulnerabilityflag | bool | — | O | false | U | Y | FS | Special-care indicator | Y | N | CbD | CbD | — | msst_vulnerabilityflag | |
| Special Handling | qdb_specialhandling | string | 500 | O | — | U | Y | FS | Handling instructions | Y | N | CbD | CbD | — | new | |
| Collection Language | qdb_collectionlanguage | choice `qdb_language` | — | O | — | U | Y | — | Preferred language for Collection communications | Y | N | CbD | CbD | — | msst_preferredlanguage | Reuse an existing preferred-language column if one exists — `TBD — Requires QDB Confirmation` |
| Communication Preference | qdb_communicationpreference | choice `qdb_communication_channel` | — | O | — | U | Y | — | Preferred channel | Y | N | CbD | CbD | — | new | Reuse OOB `preferredcontactmethodcode` if sufficient — `TBD` |

## `account` (BFD customer master) — proposed `qdb_` extensions

Identical set to `contact` (same logical names, types, defaults, security), applicability HL = N,
BFD = Y. Listed once to avoid duplication; the one-source rule (MP §5) means both are provisioned from
the same definition in the deployment package.

| Logical | Type | Notes |
|---|---|---|
| qdb_stopcontact · qdb_stopcontactreason · qdb_stopcontactdate | bool · string(500) · datetime | `StopContactQueueMover` registered on `account.qdb_stopcontact` in BFD |
| qdb_deceasedflag · qdb_dateofdeath · qdb_deceasedsource | bool · datetime · string(200) | Deceased for a corporate account = key person / owner; semantics `TBD — Requires QDB Confirmation` |
| qdb_vulnerabilityflag · qdb_specialhandling | bool · string(500) | |
| qdb_collectionlanguage · qdb_communicationpreference | choice · choice | |

## Existing columns DCP reads through Platform Mapping (no change)

| Canonical field | `contact` (HL) | `account` (BFD) | Sec | Notes |
|---|---|---|---|---|
| CustomerId | contactid | accountid | — | |
| DisplayName | fullname | name | — | |
| BusinessId (QID / CR) | `TBD — Requires QDB Confirmation` | `TBD — Requires QDB Confirmation` | PII | Existing QDB field for QID on contact and CR number on account not verified in this repository |
| Mobile | mobilephone | telephone1 | PII / FS | Field-security profile moves here from `msst_dcpcustomer` |
| Email | emailaddress1 | emailaddress1 | PII / FS | |
| Address | address1_composite | address1_composite | PII / FS | |
| Nationality | `TBD — Requires QDB Confirmation` | n/a | — | msst_nationality has no verified target |
| Employer | `TBD — Requires QDB Confirmation` | n/a | — | msst_employer has no verified target |
| Salary Transfer | `TBD — Requires QDB Confirmation` | n/a | — | msst_salarytransfer; may be a facility-level fact |
| Primary Contact (BFD) | n/a | primarycontactid | — | For recipient selection |

## `fax` (SMS / WhatsApp transaction) — optional `qdb_` columns, only if QDB's existing mechanism lacks them (`TBD — Requires QDB Confirmation`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Collection Channel | qdb_channel | choice `qdb_communication_channel` | — | O | — | P | RO | — | Distinguish SMS from WhatsApp on the same entity | Y | Y | CbD | CbD | — | msst_dcpcommunication.msst_channel | |
| Template Code | qdb_templatecode | string | 50 | O | — | P | RO | — | Template used | Y | Y | CbD | CbD | — | msst_templateref | |
| Delivery Status | qdb_deliverystatus | choice (Sent · Delivered · Failed · Opened · Blocked) | — | O | — | I | RO | — | From gateway where available | Y | Y | CbD | CbD | — | msst_deliverystatus | |
| Block Reason | qdb_blockreason | string | 500 | O | — | P | RO | — | Why the Communication Service refused the send | Y | Y | CbD | CbD | — | msst_blockreason | A blocked send still leaves a record (FR-064) |
| Correlation ID | qdb_correlationid | string | 100 | O | — | P/I | RO | — | Ties to activity / sync / log | Y | Y | CbD | CbD | — | new | |
| Collection Case | regardingobjectid | lookup (polymorphic) | — | O | — | P | Y | — | Existing column; set to the case | Y | Y | CbD | CbD | — | — | No new column |
| Direction | (existing) direction | bool | — | S | — | S | Y | — | Outgoing = true | Y | Y | CbD | CbD | — | msst_commdirection | Reuse |

## `email` (Email transaction) — optional `qdb_` columns (same condition as `fax`)

| Display | Logical | Type | Len | Req | Default | Src | Edit | Sec | Description | HL | BFD | OP | CL | IntMap | MigSrc | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Template Code | qdb_templatecode | string | 50 | O | — | P | RO | — | | Y | Y | CbD | CbD | — | msst_templateref | |
| Delivery Status | qdb_deliverystatus | choice (Sent · Delivered · Failed · Opened · Blocked) | — | O | — | I | RO | — | OOB `statuscode` covers Sent/Failed; Opened/Blocked need this | Y | Y | CbD | CbD | — | msst_deliverystatus | May be redundant with OOB tracking — `TBD` |
| Block Reason | qdb_blockreason | string | 500 | O | — | P | RO | — | | Y | Y | CbD | CbD | — | msst_blockreason | |
| Correlation ID | qdb_correlationid | string | 100 | O | — | P/I | RO | — | | Y | Y | CbD | CbD | — | new | |
| Collection Case | regardingobjectid | lookup (polymorphic) | — | O | — | P | Y | — | Existing | Y | Y | CbD | CbD | — | — | |
| Recipient / Sender | to · from (partylist) | partylist | — | S | — | U/P | Y | PII | Existing | Y | Y | CbD | CbD | — | — | Multi-recipient (guarantor/heir) supported natively — answers Q-13 for email |

## `queue`, `team`, `systemuser`, `businessunit` — no columns added

Queues are resolved by `name` (Early Collection · High Risk · Deceased & Insurance · plus FR-037
list); teams and users are referenced by lookup from configuration entities.
