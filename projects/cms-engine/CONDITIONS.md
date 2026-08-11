# CMS-ENG-001 — condition tracker

**One place to see gate state.** Updated 2026-08-11 · main `9ad43901`

Written because the closures were spread across five documents and only one of
them was visible in `phase-1-ceo.md`. Anyone asking "where are we?" had to read
eight files and would probably get it wrong.

---

## Score

```
CEO conditions   10 of 13 closed
ADRs             1 of 5 Accepted
Architecture     7 of 9 sections decided
```

**Every gate item waits on somebody outside this repository.** One design
decision does not: the *"both on-premise and cloud"* scope statement that arrived
inside the Q4 answer has not been worked into the storage design. See
**Outstanding, not gated on QDB** below.

---

## Question numbering — read this before using any Q-number

`client-actions-required.md` has been renumbered twice as questions closed, so a
bare "Q4" means different things in different documents. **Q-numbers below are
the current pack numbers.** The map:

| Current pack | Was | Subject |
|---|---|---|
| **Q1** | Q4 / pack Q2 | On-premise: File column, build number, Custom API |
| **Q2** | Q6 / pack Q3 | Existing portal content |
| **Q3** | Q7 / pack Q5 | GE Dinar font licence |
| **Q4** | Q8 / pack Q6 | PDPPL |
| **Q5** | pack Q7 | Arabic page addresses |
| **Q6** | Q10 / pack Q8 | Multi-colour icons |
| *closed* | Q1 | Rich text — decided by us |
| *closed* | Q3 / pack Q1 | Approval routes — **answered 2026-08-11** |
| *closed* | Q5 / pack Q4 | Arabic authoring UI — **answered 2026-08-11** |

`q1-q5-answers.md` uses the **original** numbering throughout; it is a record of
what was asked at the time and is deliberately not renumbered.

---

## The 13 CEO conditions

| # | Condition | Gate | State | Recorded in |
|---|---|---|---|---|
| **C-1** | Rich text scope confirmed | Ph 3 close | ✅ **Closed** — rich text is IN | `phase-1-ceo.md`, PR #79 |
| **C-2** | Approval chain design confirmed | Ph 3 close | ✅ **Closed** — answered: two routes, regulated and standard | `phase-3-arch.md` §5, `q1-q5-answers.md` |
| **C-3** | Arabic authoring UI scope | Ph 3 close | ✅ **Closed** — answered: English UI for Phase A | `q1-q5-answers.md` |
| **C-4** | On-prem CRM version + capabilities | Ph 3 close | ⛔ **Q1 — partly answered** — 9.1 confirmed; **File columns claimed but contradict the documented type list**; Custom API unanswered | `q1-q5-answers.md`, `q-4-onprem-capability.md` |
| **C-5** | PDPPL confirmation | Phase 6 | ⛔ **Q4 — QDB Compliance** | |
| **C-6** | GE Dinar web font licence | Phase 7 | ⛔ **Q3 — QDB Brand** | |
| **C-7** | Puck adapter interface enforced | Ph 3 close | ✅ **Closed** | `adrs/ADR-CMS-003` |
| **C-8** | Tiptap major-version clash | Ph 3 close | ✅ **Closed** — a retirement, not an upgrade | `adrs/ADR-CMS-005` |
| **C-9** | RTL drag-and-drop confirmed | Ph 3 close | ✅ **Closed** — both directions | `adrs/index.md` |
| **C-10** | Next.js vulnerability assessed | Ph 4 start | ✅ **Closed + remediated** | `c-10-nextjs-vulnerability-assessment.md`, PR #72 |
| **C-11** | DXP-P1-004 delivery timeline | Ph 4 start | ✅ **Closed** — dependency dropped, it was never real | `c-11-versioning-dependency.md`, PR #76 |
| **C-12** | Acceptance criteria for Must FRs | Ph 4 start | ✅ **Closed** — 144 criteria | `acceptance-criteria.md` |
| **C-13** | Multi-tenancy decisions | Ph 3 close | ✅ **Closed** — prefix `msst` + product segment | `phase-3-arch.md` §2 |

**Phase 3 cannot close on C-4.** C-2 and C-3 closed with the 2026-08-11 answers.
C-4 is the only Phase-3 condition left, and it is half-answered: the version is
confirmed, the capability claim is not.

---

## Architecture sections

| Section | State |
|---|---|
| §1 Deployment topology | ✅ Decided |
| §2 Multi-tenancy | ✅ Decided |
| §3 Plugin design | ✅ Decided |
| §4 Adapter specification | ✅ Decided |
| §6 Rich text handling | ✅ Decided |
| §9 UI/UX specification | ✅ Decided — separate document |
| §5 Approval workflow | ✅ Decided — two routes, classification-driven |
| §7 On-premise specifics | ⛔ **Q1** |
| §8 Content migration | ⛔ **Q2** |

---

## ADRs

| ADR | State | What would close it |
|---|---|---|
| 001 payload storage | Proposed | **OQ-3 → Q1** (on-prem File column limits). OQ-1 and OQ-2 already closed. **Also needs re-reading against "on-premise *and* cloud"** — see below. |
| 002 icons as geometry | Proposed | The extractor must exist + hostile-SVG corpus (Phase 5). Also **Q6**. Sits behind Delivery Phase C, which the gate rejected. |
| 003 adapter boundary | Proposed | Adapter written; lint rule proven to fail; round-trip test green. **All build-time.** |
| **004 own the runtime renderer** | ✅ **Accepted** | — all five items evidenced |
| 005 Tiptap retirement | Proposed | 2 of 4 verified. Remaining two are **cutover activities** — `RichTextEditor` deleted, coexistence bundle measured. |

> **Proposed does not mean optional.** All five bind the build today; the status
> is a statement about evidence, not about whether the team follows them.

---

## What happens when each answer lands

| Answer | Immediately unblocks |
|---|---|
| ~~approval routes~~ | ✅ Landed 2026-08-11 — Arch §5 · C-2 · the approval schema |
| ~~Arabic authoring UI~~ | ✅ Landed 2026-08-11 — C-3 |
| **Q1** the File-column check | Arch §7 · C-4 · ADR-001 OQ-3 → **ADR-001 can be Accepted** |
| **Q1** Custom API | Arch §7 — Custom API vs Process Action. **Report Engine waits on the same answer.** |
| **Q2** existing content | Arch §8 |
| Q3 font licence · Q4 PDPPL | C-6 (Phase 7) · C-5 (Phase 6) |

**Phase 3 closes when Q1 and Q2 are answered.** Then: CEO architecture gate
→ schema provisioning *(needs explicit go-ahead)* → Build Phase A.

> **Q1's File-column half is only a blocker while the design needs File
> columns.** If the storage decision below lands on Memo everywhere, the version
> store stops depending on the answer and Q1 narrows to Custom API and the
> `CompressionStream` browser baseline.

---

## Outstanding, not gated on QDB

| Item | Owner | When |
|---|---|---|
| ~~Publisher friendly name~~ | — | ✅ **Done 2026-08-11** — "Muhammad Salman Sagar Technologies" → **"MSS Technologies"** on `org5869857f` |
| **Storage design for on-premise *and* cloud** | MSS | **Next.** The Q4 answer carried an unrequested scope statement — *"enabled for both on-prem and cloud"* — that ADR-CMS-001 has never been re-read against. Recommendation on record: Memo everywhere, one code path, measured at 0.25–0.39 % of the limit. Not decided. |
| ADR/prototype schema names still say `qdb_` | MSS | Deferred. §2 records the finding; ADR-CMS-001/005, `phase-1-ceo.md` and the seven prototype pages were never renamed to `msst`. Harmless while nothing is provisioned, wrong the moment a table is created. |
| `msst` verified unused in other target environments | QDB IT | Fold into Q2's conversation in the session |

---

## How to keep this honest

When a condition closes, update **this table** as well as the document carrying
the evidence. The failure this file exists to prevent is the one that produced
it: eight closures, five files, and a gate document that still read as though
almost nothing had been done.
