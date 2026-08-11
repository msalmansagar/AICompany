# CMS-ENG-001 — CEO architecture gate

```
═══════════════════════════════════════════════════
ARCHITECTURE GATE DECISION
Engagement ID:  CMS-ENG-001
Date:           2026-08-11
Gate:           Phase 3 exit → Phase 4 (Build, Delivery Phase A)
Decision:       APPROVE WITH CONDITIONS
═══════════════════════════════════════════════════
```

## Decision

**APPROVE WITH CONDITIONS.** Phase A build is authorised to begin, and schema may
be provisioned on `org5869857f`.

Five conditions attach, listed in §6. **None of them blocks the start of the
build.** Three bind before specific work items inside Phase A; two are pricing and
ratification housekeeping that must not be allowed to drift.

**What is *not* approved:** Delivery Phases B and C, unchanged from the Phase 1
gate. The component builder and icon upload remain the highest-risk capability in
the engagement and stay behind proof of Phase A's guardrails in production.

---

## 1. Is the architecture actually complete?

Yes — and the claim is checkable rather than asserted.

| Section | State |
|---|---|
| §1 Deployment topology | Decided — bundles built and measured, not estimated |
| §2 Multi-tenancy | Decided — forced a company-wide prefix convention |
| §3 Plugin design | Decided |
| §4 Adapter specification | Decided |
| §5 Approval workflow | Decided — two routes, classification-driven |
| §6 Rich text | Decided — re-measured against real prose |
| §7 On-premise specifics | Decided — Custom API / Action, same message names |
| §8 Content migration | Decided — nothing to migrate |
| §9 UI/UX | Decided — separate document |

**9 of 9.** The two that closed last did so on the same day, one from a client
answer and one from a client *challenge*.

### What earns confidence, specifically

The gate does not reward completeness. It rewards evidence, and this architecture
produced four things that were measured rather than argued:

- **Bundle split proven.** Editor 331 KB, visitor 53 KB, both built. The visitor
  path contains zero Puck code, confirmed by scanning built output.
- **The parity gate was verified to fail.** A slot wrapper `div`→`span` was
  injected and every corpus entry failed with the divergence located. A gate never
  seen failing is not known to be a gate.
- **Storage measured twice, and the second measurement overturned the first
  argument.** "Prose compresses at 3–4×" was asserted and drove a whole open
  question; measured, it is 10–35×.
- **A discarded benchmark was reported rather than buried.** The first prose
  corpus used `.repeat()`, flattering compression to 150×, and was thrown away.

### What the gate treats as a warning sign

**Three of this engagement's findings were errors in its own documents**, not in
the client's environment: a dependency on DXP-P1-004 that was never real, a
requirement count of "72" that was the highest requirement ID, and a blocking
client question answerable from two internal documents. All three were found
late, by re-reading rather than by process.

This does not change the decision. It sets condition **G-5**.

---

## 2. Is the plan buildable by the team that wrote it?

**Yes, with one genuine hole.** §7 deliberately left the storage mechanism for
media binaries undecided, pending whether File columns exist on-premise.

That is a defensible deferral — FR-14 puts an asset **key** in the page payload,
so the binary store sits behind an indirection and can change without touching
page content. But **FR-20 and FR-21 are Phase A Must requirements**, so Phase A
cannot *finish* without deciding it. It can start. Condition **G-1**.

---

## 3. Does it satisfy what the business case bought?

| Problem from the BRD | Addressed by |
|---|---|
| P-1 Content changes need a developer | §1, §3 — authoring surface + publish plugin |
| P-2 Arabic drifts | §6, §9 — paired bilingual fields, stale detection |
| P-3 No governed design system | §2, token selection; no free-form colour |
| P-4 No content-level audit | §3, §5 — audit written in the same operation as publish |
| P-5 No rollback without deployment | ADR-CMS-001 — unbounded version retention |
| P-6 New page types need engineering | Delivery Phase C — **not approved yet** |

**P-6 remains unaddressed and that is correct.** It is the capability the business
case wanted most and the one that is unsafe first.

---

## 4. The decisions this gate ratifies

| # | Decision | Where |
|---|---|---|
| A-1 | Company prefix `msst` with a product segment on entities and APIs, none on columns | §2 |
| A-2 | The runtime renderer is ours; Puck never reaches a citizen | ADR-CMS-004 |
| A-3 | **One storage mechanism — Memo, gzip + Base64, both platforms** | ADR-CMS-001 |
| A-4 | On-premise gets Actions with identical message names; no `isOnPremise` branch in code | §7 |
| A-5 | Two approval routes, classification-driven, enforced in the plugin | §5 |
| A-6 | Approval, versioning, rollback and audit all ship in Phase A | Phase 1 gate, unchanged |

**A-3 and A-4 share a principle worth naming**, because it will be tested during
the build: *a divergence in packaging is a build concern; a divergence in code is
a permanent tax.* Both decisions accept some cost to keep one code path. A future
pull request proposing `if (isOnPremise)` is reversing a gate decision, not making
an implementation choice.

---

## 5. Risks carried into Phase 4

| Risk | Severity | Carried how |
|---|---|---|
| Memo column provisioned at the 2,000-character default | **High** | AC-08.1. This is the single most likely way to get A-3 wrong, and it breaks NFR-09 silently. |
| Version-list queries return every payload | Medium | AC-08.2 |
| Media storage undecided | Medium | G-1 |
| `msst` unverified in QDB's *other* environments | Medium | G-2 — verified clean on `org5869857f`, unverified elsewhere |
| Database capacity cost of the version store | Low | G-3 |
| Four ADRs still Proposed | Low | G-4 — their evidence is build-time by design |

---

## 6. Conditions

**G-1 — Media binary storage decided before FR-20 implementation begins.**
Either File columns are confirmed on-premise, or note attachments are accepted as
the mechanism on both platforms. The decision must state what happens to FR-21's
reference counting, which is the part that differs between the two.

**G-2 — `msst` confirmed unused in every target environment before provisioning
into it.** Verified clean on `org5869857f` on 2026-08-11: the `MSST` publisher
exists with prefix `msst`, and **zero** `msst_*` entities exist. QDB's on-premise
and production environments are unverified. A prefix cannot be changed after
records exist, so this is checked per environment, not once.

**G-3 — Dataverse capacity pricing confirmed before Phase A completes.** A-3 moves
the version store from file storage to database storage — roughly 210 MB for a
realistic 500-page site. The direction is certain, the cost is not.

**G-4 — ADRs 001, 003 and 005 ratified at the Phase 4 exit gate.** Their
verification is build-time by design. ADR-002 stays with Delivery Phase C.
ADR-001 needs only OQ-4, which is a number to read off an on-premise environment.

**G-5 — Every claim about the environment is verified against the environment
before it enters a gate document.** Three of this engagement's findings were
errors in its own documents. §8's conclusion was checked this way and held:
`qdb_cms_contents` exists on `org5869857f` and contains **0 rows**, confirmed by
query rather than inferred from deployment status.

---

## 7. What happens next

1. **Provision schema on `org5869857f`** — authorised, G-2 satisfied for this
   environment. Media binary column excluded pending G-1.
2. Phase A build — approximately three to four months.
3. Phase 5 QA against the 147 acceptance criteria.
4. Phase 6 security and compliance audit — C-5 (PDPPL) closes here or blocks.
5. Phase 7 final go-live decision — C-6 (font licence) closes here or blocks.

**C-5 and C-6 remain open and are correctly placed.** Neither blocks a build; both
block a citizen seeing a page.
