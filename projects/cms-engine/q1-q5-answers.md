# Q1–Q5 — answers received

**Engagement:** CMS-ENG-001 · **Answered:** 2026-08-11 · **Recorded by:** MSS Technologies
**Status:** Four of five answered. Q2 does not fire. **One answer conflicts with documented
product behaviour and is not yet safe to build on.**

These are the five questions that block architecture. With them answered, the architecture can
complete — subject to the conflict in Q4 below.

---

## The answers

| | Question | Answer |
|---|---|---|
| **Q1** | Rich text formatting for authors | **Yes — include it** |
| **Q2** | Accept losing a current capability | **Does not fire** (only asked if Q1 is no) |
| **Q3** | How many approval routes | **Two** — regulated, and everything else |
| **Q4** | On-premise version and capabilities | **9.1, File columns available.** Plus a new requirement: **both on-premise and cloud** |
| **Q5** | Arabic authoring interface | **English for Phase A** |

---

## 🔴 Q4 — the answer conflicts with the documentation, and the conflict is load-bearing

**What we were told:** on-premise 9.1, and File columns are available.

**What Microsoft documents:** the field-type reference for Dynamics 365 Customer Engagement
(on-premises), monikers `op-9-0` and `op-9-1`, gives a complete list of available field data
types. Image is in it. **File is not.**

Both cannot be true as stated. The possibilities, in the order they are worth checking:

1. **A later on-premise update added it.** On-premise receives cumulative updates, and the
   documentation page carries a ten-year update cycle — it is not a live record of what shipped
   in every CU. This is the most likely explanation and it would mean the answer is right and
   the page is stale.
2. **File columns are being confused with something adjacent** — note attachments
   (`annotation`), or the Image data type, which *is* available on 9.1. This is an easy
   conflation and the consequences of acting on it are severe: the version store would be built
   against a column type that does not exist.
3. **The documentation is simply incomplete.**

### Why this is not a detail to wave through

`ADR-CMS-001` put the entire version store in `msst_cmspageversion.msst_contentfile`, a File
column. If it exists, the ADR stands as written. If it does not, the version store moves to
Memo — which has been measured and works comfortably, but is a different design.

Building the wrong one is expensive in both directions. So this is recorded as **claimed, not
confirmed**.

> ✅ **Resolved 2026-08-11 — and not by getting the answer.** The version store moved to Memo on
> both platforms, so the design no longer rests on the claim. The check is still worth doing for
> image storage, but **it can now come back either way without costing anything.** The safest
> resolution to a contradiction you cannot settle is to stop depending on it.

### The check that settles it — two minutes, on their environment

Whoever has access to the on-premise organisation does **one** of these:

- **In the UI:** start creating a new column on any table and open the **Data Type** list. If
  **File** appears alongside Text, Option Set and Image, it exists.
- **By query:** request the metadata for any table and look for an attribute of type
  `FileAttributeMetadata`, or attempt to create one. A build that lacks the type rejects it.

Also worth capturing at the same time: the **four-part build number** — `9.1.0.xxxx`, not "9.1".
That is what identifies whether a CU added the capability, and it is the thing that will make
this reproducible for the next engagement.

**Custom API remains unanswered.** It was not addressed in the answer and stays open; the note
in `q-4-onprem-capability.md` §8 still needs sending for that alone.

---

## 🟡 New requirement discovered in the Q4 answer

> "I want this solution enabled for both on-prem and cloud."

This was **not** in the original question, which only asked which version was in use. It is a
scope statement, and it changes the storage decision from "which environment are we targeting"
to "the design must hold on both".

Consequences to work through:

- **The design must satisfy the lower common denominator, or branch deliberately.** If File
  columns exist on their 9.1 the point is moot and the ADR stands. If they do not, the choice is
  a Memo version store everywhere — simple, one code path, measured — or File on cloud and Memo
  on-premise, which means two storage paths, two plugin code paths, and a portability problem
  for pages moving between environments.
- ✅ **DECIDED 2026-08-11: Memo everywhere.** Recorded in `ADR-CMS-001` under
  *Storage on two platforms*, superseding Decision §2. One column type, one code path, both
  platforms — NFR-08 satisfied by construction rather than by a conditional. Measured at
  0.25–0.82% of the limit on real pages and 10.94% on a deliberately absurd one; the File
  column's 128 MB was headroom, never necessity. **This is what makes the File-column question
  cheap to answer either way.**
- The Report Engine already claims both on-premise and cloud, and has only ever been verified on
  cloud. The same requirement now applies to two products.

---

## What each answer changes

### Q1 — rich text is in scope

- **`ADR-CMS-001` must be re-measured against real prose.** Its own `OQ-1` requires this. Block
  trees compress ~50×; prose compresses 3–4×. Two attempts to synthesise a prose corpus were
  discarded as unrepresentative (recorded in `q-4-onprem-capability.md` §9), so this needs a
  **genuine sample of QDB page content**, not a generator. That is a concrete ask.
- **The security surface grows.** Rich text means HTML, and HTML means sanitisation on the way
  in and on the way out. The Phase 1 review already found one security question where the
  obvious industry-standard tool was not safe for this use.
- **`ADR-CMS-005` is affected.** It plans Tiptap's retirement from the portal shell. Rich text
  staying in scope does not automatically keep Tiptap — the CMS needs *a* rich text editor, not
  necessarily that one — but the ADR's cutover assumptions need re-reading against this answer.
- **`Q2` does not fire.** No capability is lost against today's portal.

### Q3 — two approval routes

- The approval model is a route table, not a single queue: regulated content (legal, terms,
  privacy, compliance obligations) to one approver group, everything else to another.
- Content type must therefore carry a classification that selects the route, and that
  classification has to be set somewhere an author cannot quietly change.
- Approval before publish was already non-negotiable for Phase A. This tells us its shape.

### Q5 — English authoring interface

- The adopted editor's English-only interface is acceptable as-is for Phase A. No translation
  work, no RTL layout work on the authoring screens.
- Arabic **content** is unaffected and already confirmed working — this decision never touches
  what citizens see.
- Revisit if authors ask.

---

## Where this leaves the gate

| Item | State |
|---|---|
| Q1, Q3, Q5 | **Answered — architecture can proceed on these** |
| Q2 | Does not fire |
| Q4 — version | Answered: 9.1 |
| Q4 — File columns | **Claimed, contradicts documentation, needs the two-minute check** |
| Q4 — Custom API | **Still unanswered** |
| Both on-prem and cloud | **New requirement, needs working into the storage decision** |

Architecture cannot fully close until the File column claim is verified, because the version
store design depends on the answer. Everything else in `ADR-CMS-001` can proceed.
