# DCP-001 — CRM schema provisioning record

**Org:** `org5869857f` (shared Dataverse sandbox, approved by the user for this step on 2026-09-15)
**Solution:** `msst_debtcollection` (unmanaged; Dataverse requires the lowercase publisher prefix at the
start of a solution unique name, so the architecture's `MsstDebtCollection` becomes this)
**Publisher:** `MSST`, prefix `msst`, option-value base `46327` — per `global/PUBLISHER-AND-PREFIX.md`
**Provisioned:** 2026-09-15, eight idempotent runs of `scripts/provision-schema.mjs`
**Verified:** 2026-09-15 by `scripts/verify-schema.mjs`, an independent read-back (output below)

## Run

```
cd projects/debtcollection/crm/scripts
node --env-file="<path>/.env" provision-schema.mjs     # DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET, DV_DATAVERSE_URL
node --env-file="<path>/.env" verify-schema.mjs        # read-back; run after every provisioning run
```

The script is idempotent: every component is checked before it is created, labels of existing global
option sets are reconciled with `UpdateOptionValue`, roles get their full privilege list through
`ReplacePrivilegesRole`, `PublishAllXml` is retried three times, and the run ends by reading the entity
list back. It uses only Web API metadata operations that exist on both on-premise 9.x and Dataverse.

## What exists on the org

| Component | Count | Detail |
|---|---:|---|
| Tables | 11 | `msst_dcpcustomer`, `msst_dcploanfacility`, `msst_dcpdelinquencysnapshot`, `msst_dcpcollectioncase`, `msst_dcpptprecord`, `msst_dcpconsent`, `msst_dcpstrategyconfig`, `msst_dcpauditlog`, `msst_dcpidentityexception`, and the custom activities `msst_dcpcollectionaction`, `msst_dcpcommunication` |
| Custom columns | 133 | customer 20, facility 23, snapshot 12, case 10, PTP 12, consent 12, strategy config 11, audit log 11 (incl. `msst_correlationid`), identity exception 7, collection action 5, communication 8 |
| Global option sets | 15 | `msst_dcpdpdbucket` (the ten MIS buckets of FR-018), channel, preferred language, product type, account status, consent status, lawful basis, action type, delivery status, communication direction, org instance, exception reason, exception status, strategy action type, segment |
| Case status codes | 17 | `463270200` New … `463270216` Reopened; Closed and Written Off are inactive-state |
| PTP status codes | 6 | `463270220` Open, `463270221` Kept (inactive), `463270222` Partially Kept, `463270223` Broken, `463270224` Rescheduled, `463270225` Cancelled (inactive) |
| Relationships | 3 | customer→facility, facility→snapshot, case→PTP; activity "regarding" is polymorphic and needs none |
| Alternate key | 1 | `msst_dcpcustomer_qid_alternatekey` on `msst_qid`, status Active (FR-007) |
| Security roles | 12 | `Msst DCP Admin User`, `Audit Compliance`, `Collection Officer`, `Finance User`, `Head of Collections`, `Insurance Officer`, `IT Administrator`, `Legal User`, `Relationship Manager`, `Restructuring Officer`, `Senior Manager`, `System Integration`; no role holds Delete on case, snapshot, audit or activities |
| Queues | 3 | `Early Collection`, `High Risk`, `Deceased & Insurance` — data records resolved by name (FR-037) |
| Field security | 1 profile, 3 permissions | `Msst DCP View Sensitive PII` on customer mobile, email, address (FR-014/114) |

Ownership: customer, facility, case, PTP, identity exception and both activities are user-owned;
strategy config, snapshot, consent and audit log are organisation-owned, so their privileges are Global.
Customer, facility and case have `HasActivities = true` so both activities can regard them.

## Option-set values the plugins depend on

| Set | Values |
|---|---|
| Action type | `463270081` Call, `463270082` Meeting, `463270083` Supervisor Review, `463270084` Field Visit, `463270085` Manual Note |
| Channel | `463270021` SMS, `463270022` Email, `463270023` Official Letter, `463270024` Call |
| DPD bucket | `463270001` 1-30 … `463270010` >2000 days, in the MIS order |

The plugin constants in `Domain/StatusTransitionMatrix.cs` and `Plugins/ActivitySubjectComposer.cs`
were re-pointed at these values on 2026-09-15 after the read-back. They travel with the solution, so the
same values apply on the client's organisations once the solution is imported there.

## What could not be done through the Web API

- A state's default status code: `UpdateStateValue` has no such parameter and a metadata PUT is
  accepted but ignored, so a record created without a status gets the platform default `1`. The
  `DefaultStatusAssigner` plugin sets New (case) or Open (PTP) on Create instead, on both platforms.

- `Send Free-Text Message` is not a standalone CRM privilege; it is enforced in the router from a
  role claim (see the role matrix in `phase-3-arch-appendix.md` §C).
- Plugin steps are registered separately (`plugins/REGISTRATION.md`); this script creates schema only.

## Platform lessons recorded during provisioning

- A custom activity created through the Web API needs, in one payload, `IsActivity`, an explicit
  `Subject` primary attribute, `IsAvailableOffline = true` and `HasNotes = true`; each omission fails
  with a different message, one per attempt.
- Creating a table with all its columns in one payload fails with the opaque `0x80040216`; the script
  creates the table with its primary column and adds every other column individually, which also
  makes the failing column visible.
- `EntityDefinitions` does not accept `startswith` in `$filter`; the verification fetches names and
  filters client-side.
- A 429 immediately after a metadata create is the customization lock, not throttling; the client
  retries it. Organisation-owned tables reject any privilege depth other than Global.

## Live proving test

`scripts/smoke-plugins.mjs` creates a smoke customer and case and proves on the org: invalid
transition refused, valid transition accepted, stop-contact guard and its carve-out, case Delete
blocked, audit row written and immutable, snapshot immutable. Run it after every registration.

## Sandbox history

The first partial run left eight tables and the option sets; runs two to seven added the customer
table, both activities and their columns; run eight corrected the DPD bucket labels and added the PTP
status codes. The picklist `msst_dcpptprecord.msst_ptpstatus` and the global set `msst_dcpptpstatus`
were created by the first draft and deleted on 2026-09-15 by `scripts/cleanup-ptp-picklist.mjs`
because the PTP lifecycle lives in `statuscode` (architecture §4.3).
