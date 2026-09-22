# Collection Officer security role — deployment-readiness review

**As of 2026-09-22.** Consolidates KI-100, KI-111, KI-116, KI-120 and KI-128, each of which remains
open under its own number in `KnownIssues.md` and in the Phase 8 KI register. This review adds one
place to read them together; it removes nothing.

**No security role was modified, created or granted in the making of this document.** Everything
below was read from `org5869857f`.

---

## The finding, stated once

Five capabilities were built in Phase 8. Each was validated under **System Administrator**
(Mohammad Salman) or the application user. **None has been validated as a Collection Officer**, and
in four of the five cases the privilege evidence says it would fail.

This is one finding that appeared five separate times, each time discovered by a different work
package and each time recorded independently. The shape never varied: *the entity exists, the
process exists, the code works, and no DCP or Collection role holds the privilege*.

> **Administrator success is not officer validation.** It is stated this way in every runtime
> statement in this phase, and it is restated here because a security review is exactly where the
> two are most likely to be quietly merged.

The organisation carries **24 DCP/Collection roles**. The count of them holding the privileges
below is, in four of five cases, **zero**.

---

## By capability

| # | Capability | Table | Privilege | Operation | Observed DCP/Collection role state | Admin tested? | Officer runtime validated? | Minimum decision QDB Security must make |
|---|---|---|---|---|---|---|---|---|
| **KI-100** | Assignment / ownership of collection work | `qdb_collectionactivity`, `qdb_collectioncase` | `prvReadActivity` and the collection entity privileges **on the assignee** | Read + Assign | **None.** An ordinary user is refused **403** *"Principal user … is missing prvReadActivity"*; an owner team is refused **400** with `privilegeCount=0` | Yes — application user only | **No** | Which role, and which owner team, may **hold** collection work. Dataverse checks the *assignee's* privileges, not the caller's, so granting the caller nothing changes |
| **KI-111** | Seeing QDB's Legal process | `qdb_qdblegal` | `prvReadqdb_qdblegal` | **Read only** | **None of 24.** Held by exactly 4 roles: System Administrator, System Customizer, Service Writer, Service Reader | Yes | **No** | Whether a Collection Officer may *see* a Litigation Request raised from their own case. Read is sufficient — DCP never writes to the Legal entity |
| **KI-120** | Raising and following a Customer Complaint | `incident` | `prvReadIncident`, `prvCreateIncident`, `prvWriteIncident` | Read + Create (+ Write, only if officers may update) | **None of 24.** Held by 33 / 14 / 15 roles respectively — none of them a DCP or Collection role | Yes | **No** | Whether an officer may raise a complaint themselves, or only record the dispute while the complaints team raises the Case. **Read is the minimum**; Create only if officers raise them |
| **KI-128** | Deceased review and its evidence | deceased/insurance privilege set (37 matching); `sharepointdocumentlocation`, `sharepointsite` | none granted | Read | **None of 37 granted** to a DCP or Collection role. Document control is **not configured at all** — both SharePoint tables hold 0 rows | Yes | **No** | Which role may record a deceased review, and where a death certificate is stored. Verification needs evidence and there is currently nowhere to put it |
| **KI-116** | Restructuring — **PARKED** | `qdb_loan_amendment` | `prvCreateqdb_loan_amendment` (4 holders), `prvReadqdb_loan_amendment` (7 holders) | Read + Create | **None of 24** | Not applicable — nothing is written | **No** | Deferred with the capability. Recorded so that resuming restructuring does not rediscover it |

---

## What this review does not recommend

**Not System Administrator. Not System Customizer.** Four of the five privileges above are today
held mainly by those two roles, and the quickest way to make every screen work would be to put
officers in them. That would grant the entire organisation's data and its customisation surface to
resolve a read permission on one table.

The least-privilege reading of the five rows is narrower than it first appears:

- **Three of the five need `Read` only.** Legal (KI-111) and the deceased set (KI-128) are read-only
  in DCP by design, and Complaint (KI-120) is read-only *unless* QDB decides officers raise
  complaints themselves.
- **One is not about granting the officer anything.** KI-100 is a privilege on the **assignee**.
  The decision is which role or team may *own* collection work, which is an ownership-model
  question rather than an access one.
- **One is deferred entirely.** KI-116 travels with the parked restructuring capability.

A **separate, additive Collection role** carrying those reads — rather than widening an existing
administrative role — keeps the grant auditable and reversible. That is a recommendation about
shape, not about scope: the scope is QDB Security's to set.

---

## One consequence worth stating plainly

Until these are resolved, **every browser result in this phase is administrator evidence**. The
screens work; whether they work for the people who will use them is untested, and four of the five
privilege readings above predict that they would not.

That is not a defect in the software, and it is not fixed by changing the software. It is recorded
here, unresolved, rather than worked around — using a privileged backend identity to make officer
screens appear to work would have concealed exactly this.

---

## Related, not consolidated here

**KI-35** (consolidating actions, communications and PTP onto one `qdb_collectionactivity` removes
the ability to separate *may log a call* from *may send an SMS*) is an access-granularity
consequence of an approved architectural decision, not a missing grant. It belongs to the same
conversation and is tracked separately so that neither hides the other.
