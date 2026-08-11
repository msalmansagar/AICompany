# C-11 — The DXP-P1-004 dependency

```
═══════════════════════════════════════════════════
PROGRAMME BRIEFING
Engagement ID:  CMS-ENG-001
Date:           2026-08-11
Satisfies:      CEO condition C-11 (gate: Phase 4 start)
Audience:       Programme manager, then CEO if scope changes
Finding:        THE DEPENDENCY IS NOT REAL AS STATED
═══════════════════════════════════════════════════
```

## What C-11 asked

> *CMS Phase 1 requires DXP-P1-004 (versioning and snapshots) for FR-62 and
> FR-63… the programme manager must confirm that DXP-P1-004 will be delivered in
> time for CMS Phase 1 integration testing. If it will not, the CMS Phase 1 scope
> must be revised to exclude FR-62 and FR-63, or the delivery plan must change.*

The condition offers two paths: **get DXP-P1-004 delivered**, or **cut rollback
and versioning from the CMS**. The second is bad — the CEO says so in the same
paragraph, and R-4 is explicit that a CMS without rollback is not safe to give to
business users.

**There is a third path, and the evidence points to it.**

---

## The finding

**The CMS architecture does not use DXP-P1-004.** It designs its own version
store and never references the platform capability anywhere.

| Evidence | Where |
|---|---|
| The CMS defines `cms_pageversion` — an append-only table with a File column holding the page tree, `cms_versionnumber`, `cms_islatest`, `cms_schemaversion` | `phase-3-arch.md` §3 |
| The string "DXP" and "P1-004" appear **nowhere** in the CMS architecture | verified across the whole document |
| The BRD nonetheless lists DXP-P1-004 as a dependency: *"CMS depends on it for FR-62/63"* | `phase-2-ba.md` §12 |

**The BRD and the architecture disagree, and nobody noticed** — because the BRD
was written first, the architecture was written later, and the dependency table
was never revisited.

> **This is my error to own.** I wrote the §3 schema that made the dependency
> redundant, and I did not reconcile it against the dependency the BRD had
> already asserted. The gap is between two documents I produced.

### The BRD also overstated what exists

The BRD says the three enabling pieces *"were built as platform capability with
no authoring surface on top."* That is true of DXP-P1-001 and DXP-P1-003. **It is
not true of DXP-P1-004** — architecture is complete, build has never started.

The CEO gate caught exactly this, noting the BRD *"understated this by calling it
gated when it isn't started."*

---

## What DXP-P1-004 actually is

Worth stating plainly, because it is much larger than what the CMS needs.

| | |
|---|---|
| Status | **Architecture COMPLETE, 2026-06-22.** No tech phase, no QA, no code. |
| Size | 785-line architecture, **7 ADRs** |
| Storage | Azure Blob, Qatar Central primary with UAE North GRS |
| Infrastructure | Durable queue — Azure Service Bus Standard |
| Scale assumption | ≤ 2,000 snapshots/day; **architecture must change above 10,000/day** |
| Pre-work | Must itself deliver three items DXP-P1-001 never finished (POST-1, POST-3, GGAP-001) |

### Its own gates are unresolved, and six of them need QDB

| Gate | Owner | State |
|---|---|---|
| OQ-001 durable queue technology | QDB IT/DevOps | **ASSUMED** |
| OQ-002 daily snapshot volume | QDB Business/IT | **ASSUMED** |
| OQ-003 reference code format | QDB Compliance | **ASSUMED** |
| OQ-004 Azure Blob data residency | QDB IT/Compliance | **ASSUMED** |
| OQ-005 form submission data hash | QDB Compliance | **ASSUMED** |
| NFR-008 user ID-only posture | QDB Compliance | **ASSUMED** |

Every one is marked **ASSUMED**, not confirmed. So making the CMS depend on
DXP-P1-004 would put the CMS behind **a second client-input gate** — one with six
open questions on top of the CMS's own ten.

That is the strongest argument against the dependency, independent of schedule.

---

## What the CMS actually needs

FR-62 and FR-63 are narrow.

| Requirement | Needs |
|---|---|
| **FR-62** — every save creates a version, none edited in place | An append-only table and a write on save |
| **FR-63** — restore any prior version, copied forward | A read and a write |

`cms_pageversion` does both. Neither needs Azure Blob, a durable queue, a data
residency decision, or a snapshot reference format.

### Half of it already runs in production

portal-shell's existing `CmsService` **already implements revisions** for the
current content model:

- `qdb_cms_revisionses` — a live revision entity
- An initial revision written on create
- **A revision snapshot written before every update**
- `listRevisions()` exposed

So FR-62's behaviour exists today, against `bodyHtml` rather than a block tree.
**`restoreRevision` is the piece that does not exist** — which is FR-63, and it
is a read plus a write.

> This is not a claim that the existing service can be reused as-is. It stores a
> different content model, which the CMS replaces. It is evidence that **the
> capability is small**, because a working version of it was built as a side
> feature of a portal.

---

## Three options, not two

| | Option | Consequence |
|---|---|---|
| **A** | **Drop the dependency.** CMS owns `cms_pageversion` as already designed. | No schedule risk, no second client gate. FR-62/63 ship in Phase A as Must requirements. Two documents need correcting. |
| **B** | Deliver DXP-P1-004 first, CMS consumes it | Adds a 785-line architecture with 7 ADRs, a Service Bus dependency and **six unresolved QDB questions** to the critical path — to obtain an append-only table |
| **C** | Cut FR-62/63 from Phase A | **Rejected.** The CEO and R-4 both say a CMS without rollback is not safe for business users. Listed only because C-11 names it. |

### Recommendation: **A**

The dependency was asserted before the architecture existed and the architecture
did not use it. Removing it is a **correction, not a scope reduction** — the CMS
still delivers FR-62 and FR-63 in full, in Phase A, as Must requirements. Nothing
the business was promised changes.

**DXP-P1-004 remains worth building on its own merits.** Platform-wide snapshots
across forms, submissions and portal state are a genuine capability. It simply is
not a CMS prerequisite, and the two should stop being scheduled as if it were.

---

## What the programme manager is being asked

Not "when will DXP-P1-004 land". That question turns out not to gate the CMS.

1. **Confirm the CMS may own its own version store** rather than wait on the
   platform capability. This is a programme-level call because it means two
   systems will version content differently — deliberately, and for different
   scopes.
2. **Confirm DXP-P1-004 is de-scoped from the CMS critical path**, and re-planned
   on its own timeline against its own six QDB questions.
3. If the answer to (1) is no, **escalate to the CEO** — because the only
   remaining paths are B and C, and C is already rejected.

---

## If option A is taken

| Document | Correction |
|---|---|
| `phase-2-ba.md` §12 | DXP-P1-004 row: not a dependency. Also correct *"were built as platform capability"* — untrue of P1-004. |
| `acceptance-criteria.md` | Remove the FR-62 dependency note. |
| `phase-3-arch.md` | Record that CMS versioning is self-contained and why — so this dependency is not re-asserted later. |
| CEO | C-11 closes on the basis that the dependency does not exist, not on a delivery date. |

**None of these are applied yet.** They wait on the decision above, because
editing them first would present a recommendation as a settled fact.

---

## What would make this wrong

Stated so the conversation can test it rather than accept it.

| If | Then |
|---|---|
| DXP-P1-004 is intended as the **single audited version store for the whole platform**, for compliance reasons | Option A creates a second, unaudited store — a governance problem, and B becomes correct despite the cost |
| PDPPL or QDB retention policy requires content snapshots in **Azure Blob with a defined residency** | `cms_pageversion` in Dataverse may not satisfy it. Overlaps CMS question Q8. |
| Snapshot volume across the platform is genuinely > 10,000/day | DXP-P1-004's own architecture must change, which strengthens the case for keeping the CMS out of it |

The first is the one to test. If someone intended DXP-P1-004 to be the platform's
system of record for versioned content, that intent is **not written down in
either engagement**, and it should be before the CMS proceeds.
