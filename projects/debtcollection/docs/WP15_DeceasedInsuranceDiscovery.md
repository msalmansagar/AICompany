# WP15 — Deceased Handling & Insurance Claims: discovery report

Read-only discovery against `org5869857f` and the repository, 2026-09-22, via
`crm/scripts/probe-deceased-insurance.mts`. **Nothing was created, changed, provisioned, seeded or
automated.** No schema, no entity, no configuration, no communication change, no lifecycle change.

Every finding below is classified as one of:

| | |
|---|---|
| **A** | Proven QDB architecture/process |
| **B** | Present in the Cloud development organisation |
| **C** | Not present/proven in Cloud — **On-Prem confirmation required** |

Legal, Restructuring and Complaint each looked absent here and were not. Nothing in this report
converts *not found in Cloud* into *QDB does not have it*.

---

## A. Deceased Handling — Housing Loan

### What exists

| Finding | Class |
|---|---|
| `qdb_delinquencysnapshot.qdb_isdeceasedperqcb` — **724 of 4,373 snapshots** carry it | **B** |
| The marker is **QCB-sourced** — *"deceased per QCB"*, the Qatar Central Bank, not a QDB verification | **B** |
| `qdb_collectioncase.statuscode` includes **`100000612 = Deceased/Insurance Review`** — **0 cases in it** | **B** (DCP's own) |
| Activity type **`Deceased / Insurance`**, code `P6-DECEASED`, `qdb_category` **null** | **B** (DCP's own) |
| Global option sets carry **`msst_dcpproducttype 463270046 = Deceased`** and **`qdb_resolution_type 100000345 = Deceased`** | **B** |
| Document taxonomies already name **`Heirs Certificate Determination`**, `Beneficiary certificate`, `Letter of Indemnity` | **B** |

### What does **not** exist in Cloud

- **No deceased entity.** The 3,144-entity sweep returned no table for deceased handling, death
  notification, estate or heirs.
- **No CRM customer marker.** `contact.qdb_isdeceasedperqcb` **does not exist** — the column is on
  the DCP snapshot only. A deceased customer is not marked on the customer record at all.
- **No verification process.** 0 workflows, 0 Custom APIs, 0 non-internal plugin steps and 0
  Process Engine routes match any deceased term.
- **No exemption data.** `qdb_exemptionpercentage` and `qdb_exemptionamount` are provisioned and
  **null on all 724 deceased snapshots** — and on every other snapshot too.

### What is happening to these customers today

Deceased-flagged facilities sit in **open, actively collected cases** with live delinquency:
`ARR-HL-00012` carries **3,668 DPD and QAR 374,703 arrears**; `ARR-HL-00002`, 959 DPD. All 4,363
collection cases are open. **No special handling of any kind is applied today.** That is the
current state, not a recommendation.

---

## B. Deceased Handling — BFD

**Nothing distinct was found.** The deceased marker exists only on the DCP snapshot, which is fed
from the Housing Loan MIS extract; the 724 rows are HL facilities (`ARR-HL-*`). No BFD deceased
process, entity, column or route appears anywhere. **Class C** — the BFD position requires QDB
confirmation and must not be inferred from the HL finding.

---

## C. Insurance Claims — Housing Loan

**No credit-life, death-benefit or mortgage-protection insurance capability was found.** This is
the most consequential finding in the report, and it is a *negative* worth stating precisely:
nothing in the organisation connects an insurance policy to a deceased borrower, and nothing would
settle a deceased borrower's balance.

The repository's own MIS analysis (`HousingLoanDataAnalysis.md`, F6) suggests an **exemption**
mechanism instead — *"Deceased QDB — exemption applied at 50 % (385 accounts); Deceased not applied
(81); No Exemption despite QCB DEAD (246)"*, with an Exemption Amount that is **always negative
(a credit)** and whose magnitude is ≈ the whole loan balance although the percentage says 50 %.
**That definition is unknown**, and the data is not in Cloud. **Class C.**

Whether the HL deceased relief is an insurance claim, a QDB write-off programme, a QCB-mandated
exemption, or something else, **is not established by any evidence available here**.

---

## D. Insurance Claims — BFD

A substantial insurance and claims capability exists — and **none of it is about death**.

| Entity | What it actually is | Rows |
|---|---|---|
| `qdb_aldhameenclaims` — Al Dhameen Claims | A **partial credit guarantee** claim. Requires `qdb_guaranteenumber`, `qdb_amountclaimed`, `qdb_outstandingguaranteeamount`, and the **partner bank's** RM name/number/email | 0 |
| `qdb_aldhameenpreviousclaims` | Claim history against the above | 0 |
| `qdb_aldhameen_claims_task` | The task/worklist shell for it, 183 attributes | 0 |
| `qdb_nrgpclaims` | NRGP programme claims, via `qdb_partnerbank` | 0 |
| `ibs_creditinsuranceapplication`, `qdb_credit_ins_app_cancel` | **Export** credit insurance | 0 |
| `qdb_policy_extension`, `qdb_policydischarge` | Trade/export policy lifecycle | 0 |
| `qdb_collateralcoverage` (+ facility, task, ratios) | **Collateral** coverage for lending | 0 |

The `account` entity carries ~60 insurance columns — building, furniture, machinery, raw materials,
rent and salaries coverage, insurer names, policy numbers, expiry dates. Every one is **asset and
trade insurance for SME credit**, not life cover.

Option sets corroborate: `qdb_type_of_request` = *Credit Insurance | Takaful | Takaful Claims*;
`qdb_request_for` = *Pre/Post Shipment Credit Insurance | Export Credit Policy | Takaful | WTO
Takaful*. **Takaful here is trade insurance, not family/life takaful.**

All of it holds **0 rows**, and all of it is **Class B** (present, unexercised). Whether an
equivalent death-claim process exists On-Prem is **Class C**.

---

## E. The MIS deceased indicator — what is actually proven

**Proven:** the column is `qdb_isdeceasedperqcb`; it is boolean; it is set on exactly **724** of
4,373 snapshots; it is sourced from the **QCB** feed inside the HL MIS extract; it is carried as a
*snapshot fact*, alongside `qdb_exemptionpercentage` and `qdb_exemptionamount` (both null).

**Not proven, and not inferred:**

- whether *QCB DEAD* means **verified deceased**, **reported deceased**, an **operational flag**, an
  **insurance status**, or a **historical marker**;
- who, if anyone, at QDB verifies it;
- what evidence (death certificate, heirs certificate) is required and by whom;
- whether it should ever reach the CRM customer record;
- what relationship it has to the exemption programme.

The repository already records the same reservation: *"Whether **QCB DEAD alone** establishes that
hold is TBD — Requires QDB Confirmation"*, and *"Deceased is a population, not a flag"*.

**KI-124.**

---

## F. Reusable QDB capabilities

| Capability | Reusable for | Status |
|---|---|---|
| `qdb_collectionactivity` type **`Deceased / Insurance`** | Collection-side action and history — the same role it plays for Legal and Complaint | Exists; `qdb_category` null, so the KI-112 semantic gap applies again |
| `qdb_collectioncase.statuscode 100000612 Deceased/Insurance Review` | A Collection-side **special-handling** state, distinct from financial delinquency | Exists, unused |
| Document taxonomy — `Heirs Certificate Determination`, `Insurance certificate`, `Beneficiary certificate`, `Letter of Indemnity` | Naming the evidence a deceased case needs | Exists as option values |
| `qdb_edms_documents`, `qdb_centralizeddocuments`, `qdb_document_type`, `annotation` (120 rows) | Document control | Exists. **SharePoint is NOT configured here** — `sharepointdocumentlocation` and `sharepointsite` both hold **0 rows** |
| The Legal/Complaint integration pattern | The shape any downstream hand-off should take | Proven twice |

---

## G. Gaps and open questions

Recorded as **KI-124 … KI-128**. Against the eighteen questions §16 asked:

| # | Question | Answer |
|---|---|---|
| 1 | Authoritative proof a customer is deceased | **Unknown** — KI-124 |
| 2 | What the MIS deceased flag means | **Unknown** — KI-124 |
| 3 | HL deceased workflow | **None in Cloud**; On-Prem unconfirmed — KI-124 |
| 4 | BFD deceased workflow | **None found at all** — KI-124 |
| 5 | HL insurance / credit-life / takaful | **None found** — KI-125 |
| 6 | BFD insurance relevant to collections | Guarantee and trade claims only, **not death** — KI-125 |
| 7 | Object representing an Insurance Claim | `qdb_aldhameenclaims` etc. exist but are **guarantee** claims — KI-125 |
| 8 | Event authorising claim initiation | **Unknown** — KI-125 |
| 9 | Who owns/approves a claim | Partner-bank RM fields suggest a partner-bank process — **unconfirmed** |
| 10 | What identifies the insured facility | `qdb_guaranteenumber` for Al Dhameen; **no link to MIS facility identity** — KI-126 |
| 11 | Collection while death is being verified | **No policy** — KI-127 |
| 12 | Collection while a claim is pending | **No policy** — KI-127 |
| 13 | After approval/rejection/settlement | **No policy** — KI-127 |
| 14 | Communication restrictions | **No policy** — KI-127, and KI-79 remains open |
| 15 | Legal interaction | HL analysis records **72 deceased accounts already in Legal (QAR 14.2 M)** — so deceased and Legal demonstrably coexist. No rule connects them |
| 16 | Authoritative documents | Taxonomy exists; **no process binds any as required** — KI-128 |
| 17 | Security privileges required | **No DCP/collection role holds any** matching privilege — KI-128 |
| 18 | How DCP should trace downstream | **Undeterminable** until a downstream object is identified — KI-125 |

---

## H. Recommended architecture

Separated as §15 requires.

### Proven fact

1. DCP holds a QCB-sourced deceased marker on 724 snapshots and **nothing else about death**.
2. No deceased process, entity, workflow or verification exists in the Cloud organisation.
3. No credit-life or death-benefit insurance capability exists. The claims capability that exists
   is guarantee and trade insurance for BFD.
4. DCP already owns two unused Collection-side mechanisms: a `Deceased / Insurance` activity type
   and a `Deceased/Insurance Review` case status.
5. Deceased customers are today collected exactly like everyone else.

### Reasonable architectural consequence

1. **Deceased handling and insurance claims must be modelled as two capabilities**, and on this
   evidence only the *first* has anywhere to live in DCP. The second has no downstream object to
   integrate with.
2. The **smallest defensible architecture** is Collection-side only, and it is the shape already
   proven twice:

   > Collection Case → Collection Activity (`Deceased / Insurance`) → *[downstream, unidentified]*

   with the case's **special-handling state** (`Deceased/Insurance Review`) kept explicitly
   distinct from the financial delinquency lifecycle, which MIS continues to own.
3. **A deceased indication is a prompt to verify, not a verified death.** The smallest model is
   therefore *indicated → verification requested → verified / not verified*, where only QDB can
   supply what verification consists of. DCP records the indication and the outcome; it does not
   decide either.
4. No claim entity should be created. If QDB names a death-claim process, it is integrated the way
   Legal and Complaint were — a DCP-side lookup, a deterministic identity, and the downstream
   lifecycle left alone.

### Unresolved QDB decision

Everything that would make this operational: what QCB DEAD means, who verifies it, what the
exemption programme is, whether credit-life cover exists, what happens to collection and to
communications while verification or a claim is pending, and whether Collection Officers may see
any of it.

**No part of the recommendation above is implemented.** This is a discovery gate, and it stops here
for architecture review.
