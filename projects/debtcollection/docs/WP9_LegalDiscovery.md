# WP9 — The Legal contract, read from the organisation

Read-only discovery against `org5869857f`, 2026-09-21, via `crm/scripts/probe-legal-contract.mts`.
Nothing was created, changed or populated.

WP1 established the shape of `qdb_qdblegal` and QDB answered the two questions the sandbox could
not: **Litigation Requests are raised only in BFD CRM, including for Housing Loan customers**, and
**the Legal process itself runs on-premises**. This document answers what WP9 additionally needs,
and states plainly which of §17's four stop conditions remain open.

---

## 1. What creating a Litigation Request actually requires

Business-required on create: `qdb_casetype`, `qdb_caseagainst`, `qdb_caseinitiatedby`,
`qdb_summaryjustification`. Their real option values — **read from metadata, never assumed**:

| Column | Options |
|---|---|
| `qdb_casetype` | `100000000` Criminal, `100000001` Civil |
| `qdb_caseagainst` | `1` Case Against Customer, `2` Case Against QDB |
| `qdb_caseinitiatedby` | `100000000` Assets Management & Development, `100000001` **Collections Department**, `100000002` Legal (Asset Management), `100000003` **Legal (Collection)**, `100000004` Case Against QDB, `100000005` **Housing Loan**, `100000006` **Collection (BFD Programs)** |

**`qdb_caseinitiatedby` is the strongest evidence in this sweep.** It already distinguishes
*Housing Loan* from *Collection (BFD Programs)* and *Collections Department*. The Legal entity was
built expecting collections work from both books, which corroborates QDB's statement rather than
resting on it. None of these values may be hard-coded: which one a DCP hand-off carries is
configuration.

### The status contract

`statecode` is Active/Inactive; `statuscode` carries **25** reasons, and they describe a real
litigation lifecycle — `1` *Draft (Not Submitted to Legal)* and `751090015` *Pending with Legal
(Creation Phase)* at the start, through court stages, to `751090017` *Closed* and `751090016`
*Cancelled*. **Only `1` (Draft) and `751090013` sit in state 0.** Everything else is state 1.

This is the clearest possible confirmation of §11: the Legal lifecycle is large, owned, and already
modelled. DCP must not reimplement any part of it.

---

## 2. The four stop conditions

### 2.1 🔴 Authoritative HL → BFD Account resolution — **NOT ESTABLISHABLE**

There **is** an authoritative customer identity mechanism, and it is DCP's own:
**`qdb_platformmapping`**, which maps canonical fields to each CRM's real columns.

| Organisation | Canonical `customerBusinessId` maps to |
|---|---|
| DEMO-HL | `contact.governmentid` |
| DEMO-BFD | `account.accountnumber` |

It works, and it is configuration rather than code. **But it carries no cross-CRM link**, and the
two identifiers are different kinds of thing:

- an HL business id is a **government id** — `ARR-2280202472` — and resolves to a **contact**
  (verified: `contact.governmentid eq 'ARR-2280202472'` returns exactly 1 match);
- a BFD business id is an **account number** — `DEMO-70011002233` — and resolves to an **account**.

**Of 482 distinct HL business ids on the organisation, 0 match any account number.** That is not a
data gap that fuller seeding would close — a person's government id is not a company's account
number, and nothing on `account` carries a government id at all (its only identifying columns are
`accountnumber` and `qdb_crnumber`, the latter null on all 6 rows).

`qdb_identityexception` (3 rows) is a related but different mechanism: it records *inbound MIS
records whose customer could not be resolved within one organisation*, with
`qdb_customerbusinessid`, `qdb_exceptionreason` and `qdb_resolvedcustomerid`. It is a review queue
for unresolved identity, not a cross-CRM crosswalk — though it is the closest existing shape to
one, and is where such a mechanism would naturally live.

**Consequence.** A BFD-originated hand-off can resolve its account authoritatively and be proven.
An HL-originated one cannot, and per §4 it must return a controlled
`CustomerResolutionRequired` state, create nothing, and leave the recommendation retryable.
Recorded as **KI-108**.

### 2.2 🟢 Authoritative Legal creation entry point — **ANSWERED, adapter required**

Zero workflows, zero actions and zero non-Microsoft plugin steps name `qdb_qdblegal` here; all 32
registered steps are platform internals. QDB has already stated the real process is on-premises,
so **this emptiness is not evidence of absence** — it is the sandbox.

Direct `Create` is the only mechanism available on Cloud. Per §5 the hand-off is therefore isolated
behind an adapter, and the Cloud proof claims exactly what it establishes and no more:
**Litigation Request Creation Proven — QDB Legal Process Execution Unproven on Cloud.**

### 2.3 🔴 The hand-off qualification trigger — **MECHANISM FOUND, POLICY NOT**

`qdb_collectionactivity` carries `qdb_requiresapproval` and `qdb_approvalstatus`, whose options are
exactly **`0` Return** and **`1` Approve**. `qdb_strategyaction` carries `qdb_requiresapproval`, and
one configured action (`DEMO-Issue formal notice`) sets it true.

So an approval mechanism exists and is discoverable. What is **not** discoverable:

- **0** collection activities have ever carried an approval status;
- **0** have `qdb_requiresapproval` set;
- no strategy action is a Legal Recommendation — the `Legal Recommendation (P6-synthetic)` activity
  type exists in the catalogue but no strategy action references it (and per **KI-106** no strategy
  action names *any* activity type);
- nothing states that an approved recommendation is what qualifies a litigation hand-off, nor who
  approves it.

Per §6 this is recorded, not invented. **KI-109.** The separation §6 demands — *Legal recommended*
is not *Litigation Request created* — holds regardless of which trigger QDB names.

### 2.4 🟡 Schema change — **AVOIDABLE ON THE LEGAL ENTITY**

§7 asks for the minimum relationship, and prefers not to modify `qdb_qdblegal`. The sweep found:

- **16 lookups on the Legal entity; 0 point at any collections table.**
- Its only free-text column that could carry a reference is `qdb_oldlegalreferencename` (100 chars)
  — a documented Legal-side field, so using it would overload it exactly as KI-71 warned.
- **`qdb_collectionactivity.regardingobjectid` can already target `qdb_qdblegal`**, via
  `regardingobjectid_qdb_qdblegal_qdb_collectionactivity`. A genuine existing relationship — but
  `regardingobjectid` is already the documented carrier for the activity's case and for `fax`/
  `email` communication mirroring, so repurposing it would overload a live column.

**Recommendation: `qdb_qdblegal` is not modified at all.** The reference is held on DCP's side, as
a new lookup on `qdb_collectionactivity` → `qdb_qdblegal`. That keeps traceability, gives
idempotency somewhere to anchor, and leaves QDB's established Legal entity untouched.

**This is a live-org schema change and is NOT provisioned.** It is proposed and awaits explicit
go-ahead.

---

## 3. Traceability and idempotency, given the above

The chain §7 requires —
Collection Case → Strategy → Strategy Action → Legal Recommendation Activity → Litigation Request —
is complete except for its last link, because everything to the left already exists: the activity
carries `qdb_collectioncaseid` and, since WP8, `qdb_strategyactionid`.

**The Legal Recommendation Activity is the stable source intent**, exactly as §8 says it should be.
Its id is already deterministic for strategy-generated work — `uuidv5(case | episode | action)` —
so the hand-off's business identity derives from it rather than from a query.

`qdb_qdblegal` has **no alternate key**, so `If-None-Match: *` on a derived primary key is the only
mechanism that makes a retry safe: the second create returns **412**, not a duplicate. This is the
same contract proven in WP4 and WP7. "Query for an existing one, then create" is explicitly not
relied upon, because it cannot survive two concurrent workers.

---

## 4. What WP9 can and cannot claim

| Claim | Status |
|---|---|
| BFD Account resolution | **Establishable and provable** |
| HL → BFD Account resolution | **Not establishable** — KI-108, controlled refusal |
| Litigation Request native creation | **Provable on Cloud** with synthetic DEMO data |
| Legal hand-off idempotency | **Provable** via derived id + `If-None-Match: *` |
| QDB Legal process execution | **Unproven on Cloud** — runs on-premises |
| On-Prem Legal runtime | **Pending** — cannot be tested from here |

These are reported separately and are never merged into "Legal integration validated."
