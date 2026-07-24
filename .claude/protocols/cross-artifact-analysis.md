# Cross-Artifact Analysis

Adopted from GitHub Spec-Kit's `/speckit.analyze`. A non-destructive
consistency check across an engagement's artifacts — BRD, architecture, and
QA/tests — run **before the architecture→build CEO gate**. It catches the
drift that each phase's own review misses: a requirement the architecture
never addresses, a design entity no requirement asked for, a term that means
two things in two documents.

Traceability (Article XV) checks that IDs flow to code. This checks something
earlier and semantic: that the *documents agree with each other* before anyone
builds from them.

---

## Artifact mapping (MSS Technologies ⟷ Spec-Kit)

| Spec-Kit | MSS Technologies |
|---|---|
| `spec.md` | `brd*.md` — functional/non-functional requirements, user stories |
| `plan.md` | `phase-*-arch*.md`, `phase-*-tech*.md` — architecture, ADRs, data model, stack |
| `tasks.md` | `phase-*-qa*.md` + the test files — test cases, coverage |
| `constitution.md` | `.claude/constitution.md` — non-negotiable |

Match by keyword (`arch`, `tech`, `qa`), not phase number — engagements
number phases inconsistently (`phase-2-arch` vs `phase-3-arch`).

---

## When it runs

Once, after architecture is drafted and before the CEO's Phase-3→Phase-4
approval (Constitution Article VIII checkpoint 2). It is a **gate input**, not
a phase of its own. The orchestrator runs it and hands the report to the CEO
alongside the architecture.

Re-run it if the BRD or architecture changes after the first pass.

---

## The six detection passes

Read-only. Produce a report; change nothing.

**A. Duplication** — near-duplicate requirements; two requirements saying the
same thing in different words. Recommend consolidation.

**B. Ambiguity** — vague attributes with no measurable criterion (`fast`,
`scalable`, `secure`, `intuitive`, `robust`); unresolved placeholders (`TODO`,
`TBD`, `???`, `[NEEDS CLARIFICATION]`, `<placeholder>`).

**C. Underspecification** — a requirement with a verb but no object or
measurable outcome; a user story with no acceptance criteria; an architecture
element referencing a component no requirement defines.

**D. Constitution alignment** — any requirement or design element conflicting
with a MUST article. **Automatically CRITICAL.** The fix is to change the
spec, plan, or tasks — never to reinterpret or quietly ignore the article. If
the article itself is wrong, that is a separate, explicit constitution change.

**E. Coverage gaps** — the highest-value pass:
- a requirement (FR/NFR) with no architecture element addressing it → *design gap*
- a requirement with no QA test → *test gap*
- an architecture element or task tied to no requirement → *orphan / scope creep*

**F. Inconsistency** — terminology drift (one concept, two names across
documents); a data entity in the architecture absent from the BRD (or vice
versa); a stack choice in one document contradicting another (BRD says one
thing, an ADR another).

---

## Severity

| Level | Meaning |
|---|---|
| **CRITICAL** | Violates a constitution MUST; a core requirement with zero coverage that blocks baseline function; a missing core artifact. |
| **HIGH** | Duplicate or conflicting requirement; an ambiguous security/performance attribute; an untestable acceptance criterion. |
| **MEDIUM** | Terminology drift; missing non-functional coverage; an underspecified edge case. |
| **LOW** | Wording, minor redundancy, ordering nits that don't affect correctness. |

Severity reflects impact on *this* engagement, not a generic scale.

---

## Report format

```
## Cross-Artifact Analysis — <project>

| ID | Category | Severity | Location(s) | Finding | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| E1 | Coverage | CRITICAL | brd FR-014; arch (none) | No component addresses account lockout | Add to architecture or defer FR-014 explicitly |
| F1 | Inconsistency | MEDIUM | brd "applicant"; arch "borrower" | Same actor, two names | Pick one term repo-wide |

Coverage summary:
  requirements: N   addressed in architecture: N   with a QA test: N
  orphan design elements: N

Verdict: <CLEAR | PROCEED WITH FIXES | BLOCK>
```

Cap at 50 findings; summarize any overflow. Aggregate, don't drown the CEO.

---

## The mechanical helper

`.claude/scripts/gate-analyze.sh <project>` does the greppable subset of pass E
and B: it cross-references FR/NFR IDs across BRD → architecture → QA and reports
requirements with no design or test mention, IDs that appear downstream but not
in the BRD (orphans), and unresolved placeholders. It is a starting point for
the report, not the whole analysis — duplication, terminology drift, and
constitution conflicts (passes A, D, F) need the agent's reading, not grep.

Run the script, then read the artifacts and complete the semantic passes.

---

## Verdict and the gate

- **CLEAR** — no CRITICAL/HIGH findings. Architecture proceeds to the CEO gate.
- **PROCEED WITH FIXES** — HIGH findings the architect resolves before the CEO
  gate; re-run to confirm.
- **BLOCK** — any CRITICAL. Does not reach the CEO until resolved. A
  constitution conflict or a zero-coverage core requirement is not a judgment
  call.

This is `.claude/protocols/verification-before-completion.md` applied to
documents: prove the artifacts agree before building, as we prove the build
works before claiming done.
