# Phase 1 — Pre-Provisioning Safety Check (sandbox `org5869857f`)

**Status:** **CLEARED — all 10 checks pass.** Check 3 was answered by QDB on 2026-09-17: publisher `qdb`, OptionValuePrefix `10000`. Provisioning ran on that confirmation and completed with 0 failures; see `Phase_1_Completion_Report.md` for the results. 2026-09-17.
**The check itself was strictly read-only**: no write was performed by any step recorded in this document. Provisioning came afterwards, on the confirmation in check 3.
Scripts: session scratchpad `preflight.mjs`, `publisher-evidence.mjs`.

---

## Result of the 10-point check

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Connected organisation is exactly `org5869857f` | **PASS** | host segment `org5869857f` from `https://org5869857f.crm4.dynamics.com` |
| 2 | Environment is the intended Cloud sandbox | **PASS** | Dataverse host `org5869857f.crm4.dynamics.com` |
| 3 | QDB publisher metadata and OptionValuePrefix confirmed | **PASS — confirmed by QDB** | Four publishers carry prefix `qdb` (§2); QDB confirmed **`qdb` / OptionValuePrefix 10000**. `getQdbPublisherId` re-verifies uniquename, prefix and option-value prefix on every run and refuses to proceed on a mismatch. |
| 4 | Target `qdb_` logical names do not collide | **PASS** | all 13 target names free (org holds 3,131 entities) |
| 5 | Existing `msst_` components untouched | **PASS** | 11 `msst_dcp*` entities present, unchanged |
| 6 | Legacy DA components untouched | **PASS** | 8/8 DA entities present; `qdb_da_case` = 0 rows, `qdb_collection_reason` = 7 rows (baseline captured) |
| 7 | Existing `qdb_crmlogs` untouched | **PASS** | 1,295 rows, 12 `qdb_` columns (baseline captured; no extension authorised) |
| 8 | Provisioning scripts idempotent / re-runnable | **PASS** | `qdb-*` definition files are declarative; the provisioning entry point uses the existing ensure/skip pattern (`[SKIP]` on existing components) |
| 9 | Rollback plan documented for new Phase 1 components | **PASS** | §4 below; all new components are unmanaged additions, removable without touching `msst_`, DA or `qdb_crmlogs` |
| 10 | Baseline tests green before provisioning | **PASS** | C# **92/92** · TS **83** · tooling **10** · type-check clean (9 packages) |

**Also confirmed:** `qdb_autonumberconfig` exists, so case/activity numbering uses the existing QDB
mechanism rather than a cloud-only `AutoNumberFormat` dependency.

---

## 2. Check 3 — the ambiguity, with evidence

Four publishers share customisation prefix `qdb`:

| Publisher (unique name) | Friendly name | OptionValuePrefix | Visible solutions owned |
|---|---|---|---|
| **`qdb`** | Qatar Development Bank | **10000** | **24** — incl. `QDBAllEntites`, `QDBEntities`, `QDBRuleEngine`, `BusinessRuleEngine`, `QdbDynamicFormEngine`, `qdb_reportengine`, `QDBReportEngineOnPrem`, `QdbPortalShell`, `QdbDxpPlatform`, `MasterEntities` |
| `qatardevelopmentbank` | Qatar Development Bank | 75109 | 1 — `LoanApplicationEntityCloudMigration` |
| `DefaultPublisherQDB` | Default Publisher for QDB | 75109 | 1 — `DisbursementFormsJS` (this is the organisation's auto-created default publisher) |
| `maqsadai` | Maqsad AI | 10000 | 1 — `FormDesignerWebResource` (MSS-owned, not QDB) |

Existing `qdb_` global option sets (709 of them) are split across **both** prefixes — a 40-set sample
found 121 option values under `75109`, 72 under `10000`, and 27 legacy raw values (0–3). So the live data
does not settle it either; the org has genuinely been customised under more than one `qdb` publisher.

For contrast, the components DCP created under the MSS publisher are internally consistent:
`msst_dcpdpdbucket` = 463270001–463270010, matching publisher `MSST` OptionValuePrefix `46327`.

### Why this cannot simply be inferred and moved on from

An option set's integer values are assigned from the owning publisher's OptionValuePrefix **at creation**
and **cannot be rebased in place afterwards** — correcting a wrong choice means deleting and recreating
every affected choice column and remapping any data written against it. It is one of the few Phase 1
decisions that is expensive to reverse, which is why the Phase 1 authorisation says to stop rather than
guess.

### Note on the earlier "range collision" signal

An initial check counted existing option values inside each candidate range (163 under `10000`, 337 under
`75109`) and flagged both. **That signal was over-cautious and is not a blocker:** option values must be
unique *within* an option set, not globally across the organisation, so existing values in the same
numeric band are normal and harmless. Recorded here so the check is not misread later.

### Recommendation

**Publisher `qdb` (OptionValuePrefix `10000`)** — it owns 24 visible solutions including every QDB engine
DCP must integrate with (Rule, Form, Report, Portal, DXP), whereas the other three are the organisation's
default publisher, a single one-off migration solution, and the MSS-owned publisher. The Master Prompt §2
requires QDB-owned components under the `qdb` prefix, and this is the publisher that actually carries QDB's
estate.

**Confirmed by QDB on 2026-09-17 and acted on.** Provisioning used publisher `qdb`, OptionValuePrefix `10000`; every canonical choice landed in the 100000000–100000581 band, read back from the organisation.

---

## 3. What will be provisioned once check 3 passes

Solution `qdb_debtcollection` under the confirmed publisher, containing: 12 entities + 1 conditional
(`qdb_consent`), 249 attributes, 30 global choices (139 options), 17 case statuscodes + 6 activity
statuscodes, 12 `QDB DCP …` security roles, 3 alternate keys, the `qdb_customerid` **Customer** lookup
(`contact` + `account`), `IsValidForQueue = true` on `qdb_collectioncase`, and registration of
`Qdb.DebtCollection.Plugins` with its Phase 1 steps.

**Explicitly not provisioned:** no facility lookup in the shared schema (optional per-deployment
extension only) · no integration-log entity (`qdb_crmlogs` is reused unchanged) · no customer or facility
master.

---

## 4. Rollback plan for newly created Phase 1 components

Every Phase 1 component is an **unmanaged addition**. Nothing existing is modified, so rollback never
touches `msst_`, the DA module, `qdb_crmlogs`, QDB masters or shared configuration entities.

| Component | Rollback |
|---|---|
| Entities, attributes, relationships, alternate keys | delete the `qdb_` components (no data at risk — nothing writes to them until validation) |
| Global choices | delete the `qdb_` option sets |
| Statuscodes | remove the inserted status values |
| Security roles | delete the 12 `QDB DCP …` roles |
| Customer lookup | delete the relationship created by `CreateCustomerRelationships` |
| Plugin assembly + steps | unregister `Qdb.DebtCollection.Plugins` and its steps — the old `Msst.DebtCollection.Plugins` remains registered and functional throughout, so the running system is never without its controls |
| Solution | delete `qdb_debtcollection` (unmanaged) |

Order is the reverse of creation. The pre-provisioning baselines in checks 5–7 are the verification that
rollback restored the prior state.

---

## 5. The blocking question, and its answer

**ANSWERED 2026-09-17: publisher `qdb`, OptionValuePrefix 10000.**

> Four publishers on `org5869857f` carry the customisation prefix `qdb`, with two different
> OptionValuePrefixes (`10000` and `75109`). Which publisher should own the DCP solution
> `qdb_debtcollection`? Evidence points to publisher **`qdb`**, OptionValuePrefix **`10000`**.

Until answered, `qdb-option-set-defs.mjs` deliberately refuses to run (`resolveQdbOptionValueBase()`
throws unless `QDB_OPTION_VALUE_PREFIX` is set), so the ambiguity cannot be provisioned past by accident.
