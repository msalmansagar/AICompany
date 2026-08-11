# CMS-ENG-001 — condition tracker

**One place to see gate state.** Updated 2026-08-11 · main `7852df97`

Written because the closures were spread across five documents and only one of
them was visible in `phase-1-ceo.md`. Anyone asking "where are we?" had to read
eight files and would probably get it wrong.

---

## Score

```
CEO conditions   8 of 13 closed
ADRs             1 of 5 Accepted
Architecture     6 of 9 sections decided
```

**Every open item waits on somebody outside this repository.** No engineering
work is available.

---

## The 13 CEO conditions

| # | Condition | Gate | State | Recorded in |
|---|---|---|---|---|
| **C-1** | Rich text scope confirmed | Ph 3 close | ✅ **Closed** — rich text is IN | `phase-1-ceo.md`, PR #79 |
| **C-2** | Approval chain design confirmed | Ph 3 close | ⛔ **Q3 — QDB** | blocks arch §5 |
| **C-3** | Arabic authoring UI scope | Ph 3 close | ⛔ **Q5 — QDB** | recommendation: English UI for Phase A |
| **C-4** | On-prem CRM version + capabilities | Ph 3 close | ⛔ **Q4 — QDB IT** | blocks arch §7, ADR-001 OQ-3 |
| **C-5** | PDPPL confirmation | Phase 6 | ⛔ **Q8 — QDB Compliance** | |
| **C-6** | GE Dinar web font licence | Phase 7 | ⛔ **Q7 — QDB Brand** | |
| **C-7** | Puck adapter interface enforced | Ph 3 close | ✅ **Closed** | `adrs/ADR-CMS-003` |
| **C-8** | Tiptap major-version clash | Ph 3 close | ✅ **Closed** — a retirement, not an upgrade | `adrs/ADR-CMS-005` |
| **C-9** | RTL drag-and-drop confirmed | Ph 3 close | ✅ **Closed** — both directions | `adrs/index.md` |
| **C-10** | Next.js vulnerability assessed | Ph 4 start | ✅ **Closed + remediated** | `c-10-nextjs-vulnerability-assessment.md`, PR #72 |
| **C-11** | DXP-P1-004 delivery timeline | Ph 4 start | ✅ **Closed** — dependency dropped, it was never real | `c-11-versioning-dependency.md`, PR #76 |
| **C-12** | Acceptance criteria for Must FRs | Ph 4 start | ✅ **Closed** — 144 criteria | `acceptance-criteria.md` |
| **C-13** | Multi-tenancy decisions | Ph 3 close | ✅ **Closed** — prefix `msst` + product segment | `phase-3-arch.md` §2 |

**Phase 3 cannot close on C-2, C-3, C-4.** All three are QDB questions.

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
| §5 Approval workflow | ⛔ **Q3** |
| §7 On-premise specifics | ⛔ **Q4** |
| §8 Content migration | ⛔ **Q6** |

---

## ADRs

| ADR | State | What would close it |
|---|---|---|
| 001 payload storage | Proposed | **OQ-3 → Q4** (on-prem File column limits). OQ-1 and OQ-2 already closed. |
| 002 icons as geometry | Proposed | The extractor must exist + hostile-SVG corpus (Phase 5). Also **Q10**. Sits behind Delivery Phase C, which the gate rejected. |
| 003 adapter boundary | Proposed | Adapter written; lint rule proven to fail; round-trip test green. **All build-time.** |
| **004 own the runtime renderer** | ✅ **Accepted** | — all five items evidenced |
| 005 Tiptap retirement | Proposed | 2 of 4 verified. Remaining two are **cutover activities** — `RichTextEditor` deleted, coexistence bundle measured. |

> **Proposed does not mean optional.** All five bind the build today; the status
> is a statement about evidence, not about whether the team follows them.

---

## What happens when each answer lands

| Answer | Immediately unblocks |
|---|---|
| **Q3** approval routes | Arch §5 · C-2 · the approval schema |
| **Q4** on-prem version | Arch §7 · C-4 · ADR-001 OQ-3 → **ADR-001 can be Accepted** |
| **Q6** existing content | Arch §8 |
| **Q5** Arabic authoring UI | C-3 |
| Q7 font licence · Q8 PDPPL | C-6 (Phase 7) · C-5 (Phase 6) |

**Phase 3 closes when Q3, Q4 and Q6 are answered.** Then: CEO architecture gate
→ schema provisioning *(needs explicit go-ahead)* → Build Phase A.

---

## Outstanding, not gated on QDB

| Item | Owner | When |
|---|---|---|
| ~~Publisher friendly name~~ | — | ✅ **Done 2026-08-11** — "Muhammad Salman Sagar Technologies" → **"MSS Technologies"** on `org5869857f` |
| `msst` verified unused in other target environments | QDB IT | Fold into Q2's conversation in the session |

---

## How to keep this honest

When a condition closes, update **this table** as well as the document carrying
the evidence. The failure this file exists to prevent is the one that produced
it: eight closures, five files, and a gate document that still read as though
almost nothing had been done.
