# CMS-ENG-001 — condition tracker

**One place to see gate state.** Updated 2026-08-11 · main `9ad43901`

Written because the closures were spread across five documents and only one of
them was visible in `phase-1-ceo.md`. Anyone asking "where are we?" had to read
eight files and would probably get it wrong.

---

## Score

```
CEO conditions   11 of 13 closed
ADRs             1 of 5 Accepted
Architecture     9 of 9 sections decided   ← complete
Phase 3 gate     PASSED — approve with conditions (5)
Schema           PROVISIONED + VERIFIED on org5869857f
```

**Phase 4 (Build, Delivery Phase A) is authorised and the schema is live.**
10 entities, 33 columns, solution `MssCmsEngine`. See `phase-3-gate.md` for the
gate decision and `provisioning-record.md` for what was created and verified.

**Architecture is complete.** §7 closed on the Custom API answer (cloud: Custom
API; on-premise: Action + plugin, same message names). §8 closed **without** a
client answer — the question had already been answered twice inside this
repository and should never have reached QDB.

**Two small items remain outstanding, neither blocking Phase 3:** the File-column
check, which now affects **media binaries only**, and confirming the `msst` prefix
is unused in QDB's environments — which must be settled **before provisioning**,
because a prefix cannot be changed once records exist.

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

**`q1-q5-answers.md` and `phase-3-arch.md` use the original numbering
throughout** — deliberately. One is a record of what was asked at the time, the
other cites the answers that unblocked each section; renumbering either would
falsify the record. Only the outward-facing documents — `client-actions-required.md`
and `session-invite.md` — carry the current pack numbers, because QDB answers
against those. This table is the bridge.

---

## The 13 CEO conditions

| # | Condition | Gate | State | Recorded in |
|---|---|---|---|---|
| **C-1** | Rich text scope confirmed | Ph 3 close | ✅ **Closed** — rich text is IN | `phase-1-ceo.md`, PR #79 |
| **C-2** | Approval chain design confirmed | Ph 3 close | ✅ **Closed** — answered: two routes, regulated and standard | `phase-3-arch.md` §5, `q1-q5-answers.md` |
| **C-3** | Arabic authoring UI scope | Ph 3 close | ✅ **Closed** — answered: English UI for Phase A | `q1-q5-answers.md` |
| **C-4** | On-prem CRM version + capabilities | Ph 3 close | ✅ **Closed** — 9.1; **Custom API on cloud, Action + plugin on-premise**, same message names. File columns now affect media only and no longer gate anything | `phase-3-arch.md` §7 |
| **C-5** | PDPPL confirmation | Phase 6 | ⛔ **Q4 — QDB Compliance** | |
| **C-6** | GE Dinar web font licence | Phase 7 | ⛔ **Q3 — QDB Brand** | |
| **C-7** | Puck adapter interface enforced | Ph 3 close | ✅ **Closed** | `adrs/ADR-CMS-003` |
| **C-8** | Tiptap major-version clash | Ph 3 close | ✅ **Closed** — a retirement, not an upgrade | `adrs/ADR-CMS-005` |
| **C-9** | RTL drag-and-drop confirmed | Ph 3 close | ✅ **Closed** — both directions | `adrs/index.md` |
| **C-10** | Next.js vulnerability assessed | Ph 4 start | ✅ **Closed + remediated** | `c-10-nextjs-vulnerability-assessment.md`, PR #72 |
| **C-11** | DXP-P1-004 delivery timeline | Ph 4 start | ✅ **Closed** — dependency dropped, it was never real | `c-11-versioning-dependency.md`, PR #76 |
| **C-12** | Acceptance criteria for Must FRs | Ph 4 start | ✅ **Closed** — 144 criteria | `acceptance-criteria.md` |
| **C-13** | Multi-tenancy decisions | Ph 3 close | ✅ **Closed** — prefix `msst` + product segment | `phase-3-arch.md` §2 |

**Every Phase-3 condition is now closed.** C-2, C-3 and C-4 all closed on
2026-08-11. The two conditions still open — C-5 (PDPPL) and C-6 (font licence) —
are Phase 6 and Phase 7 gates and do not block the architecture gate.

**Phase 3 is ready to close. The next event is the CEO architecture gate.**

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
| §7 On-premise specifics | ✅ Decided — Custom API / Action, same message names |
| §8 Content migration | ✅ Decided — nothing to migrate |

---

## ADRs

| ADR | State | What would close it |
|---|---|---|
| 001 payload storage | Proposed | **OQ-1, OQ-2, OQ-3 all closed.** OQ-3 stopped gating it when the File column left the design — the version store is now Memo on both platforms. One item left: **OQ-4**, confirm the on-premise Memo maximum. That is a limit to read off, not a capability to establish. |
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
| ~~Custom API~~ | ✅ Landed 2026-08-11 — Arch §7 · C-4. **Report Engine can reuse this answer.** |
| ~~existing content~~ | ✅ Closed 2026-08-11 — Arch §8, answered internally |
| **File columns** | Media binary storage in §7 only. Fallback is note attachments. **Not blocking.** |
| **`msst` prefix unused?** | ⚠️ **Must be settled before provisioning** — it cannot be changed after records exist |
| Font licence · PDPPL | C-6 (Phase 7) · C-5 (Phase 6) |

**Phase 3 is closed.** Next: CEO architecture gate → schema provisioning
*(needs explicit go-ahead, and the prefix check first)* → Build Phase A.

> **On-premise gets Actions, not Custom APIs — and no caller notices.** Both
> surface as the same OData action, so naming the on-premise Action
> `msst_CmsPublishPage` makes every caller identical across platforms. The
> divergence is in solution authoring, not in code. **The read path avoids the
> message entirely** (the portal reads the render cache directly and decompresses
> in Node), so a Custom Action's workflow overhead never touches NFR-01.

---

## Outstanding, not gated on QDB

| Item | Owner | When |
|---|---|---|
| ~~Publisher friendly name~~ | — | ✅ **Done 2026-08-11** — "Muhammad Salman Sagar Technologies" → **"MSS Technologies"** on `org5869857f` |
| ~~Storage design for on-premise *and* cloud~~ | — | ✅ **Done 2026-08-11** — **Memo everywhere.** One column type, one code path, both platforms; NFR-08 satisfied by construction. ADR-CMS-001 *Storage on two platforms*. Two implementation traps recorded there: the Memo column must be provisioned at `MaxLength` 1,048,576 (**the default is 2,000**), and version-list queries must name their columns or they drag every payload back. |
| **Confirm Dataverse capacity pricing** | MSS | Before Phase A. The decision moves the version store from file storage to database storage — ≈ 210 MB for a realistic 500-page site. The direction is certain, the cost is not. |
| **`msst` prefix unused — per environment** | QDB IT | ✅ **Verified clean on `org5869857f`** (publisher `MSST` present, 0 `msst_*` entities). ⚠️ **On-premise and production unverified** — repeat before provisioning into each. Gate condition **G-2**. |
| **File columns on-premise** | QDB IT | Gate condition **G-1** — before FR-20 is built. Decides `msst_cmsmediaasset`'s binary column, which was deliberately left uncreated. Fallback is note attachments. |
| **Check before escalating a question to the client** | MSS | §8 was blocked on QDB for weeks and was answerable from two documents in this repository. Ask *"can we answer this ourselves?"* before it reaches a client pack. |
| ADR/prototype schema names still say `qdb_` | MSS | Deferred. §2 records the finding; ADR-CMS-001/005, `phase-1-ceo.md` and the seven prototype pages were never renamed to `msst`. Harmless while nothing is provisioned, wrong the moment a table is created. |
| `msst` verified unused in other target environments | QDB IT | Fold into Q2's conversation in the session |

---

## How to keep this honest

When a condition closes, update **this table** as well as the document carrying
the evidence. The failure this file exists to prevent is the one that produced
it: eight closures, five files, and a gate document that still read as though
almost nothing had been done.
