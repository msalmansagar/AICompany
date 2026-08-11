# Phase 7 — CEO Final Decision · Report Engine (RPT-ENG-001)

Date: 2026-07-30 · Decision on `feat/report-engine-prototype` @ 101 commits ahead of `main`
Inputs: Phase 1 CEO brief, Phase 2 BA, Phase 3 architecture (+ ADR-RPT-011), Phase 4 build,
Phase 5 QA (2026-07-30), Phase 6 code review & audit.

---

## Decision

## APPROVE WITH CONDITIONS — for sandbox UAT only. Production is **not** approved.

Merge to `main` is approved once C-1 and C-2 are met. Production deployment is deferred to a
separate gate that cannot be scheduled until C-6 is met.

---

## Why approve

The commercial thesis holds and is now demonstrated, not asserted:

- **A metadata-driven report runs in CRM with no hosted middle tier.** ADR-RPT-011 removed an entire
  tier from the estate, and with it the two conditions (B1, B6) that a hosted tier would have carried.
  This is verified: reports execute through `qdb_RunReport` inside Dataverse.
- **Reports are configured, not coded.** A report joining two tables, filtered by a prompt answered
  at run time, was built through the wizard by a person clicking, and returned 60 correct rows.
- **The governance story is real, and it is our differentiator.** Execution is logged unsuppressibly
  because the call returning rows is the call writing the log; configuration changes are audited by a
  synchronous plugin that fails closed. Against the competitors assessed for the EDP engagement, we
  out-govern rather than out-feature — and that is the right side to be on for QDB.
- **SSRS replacement is credible.** The shapes, layouts, exports and placement model cover the
  patterns the ~300 SSRS reports use.

## Why not production

I am rejecting production on one finding from Phase 5, and it is not a feature gap.

**Nineteen defects were found in a single session, none of them by a suite of 221 green tests.**
Several had existed for weeks. Two were of the worst kind we ship: a report that returned every row
when it had been filtered, and a `Count` that returned raw rows instead of a total — both looking
like data rather than like errors. One meant **every report using the generated query failed
outright**, masked because earlier testing happened to use the saved-view path.

That pattern says our confidence is coming from the wrong place. A green suite that cannot detect
"the product returns no rows" is not evidence of quality; it is evidence that the tests and the risk
are in different places. Until an automated pass covers the designer and the runtime viewer, every
"it works" is really "no one has walked that path yet". I will not put numbers in front of QDB
credit committees on that basis.

The specific risk is not that a report errors — an error is recoverable and now diagnosable. It is
that a report **quietly reports the wrong figure**. Two defects of exactly that shape were found this
session; assuming they were the last two is not a position I can defend.

---

## Conditions

### Before merge to `main`

**C-1 — Verify the runtime viewer and exports.**
The viewer has not been opened once against this session's changes, and exports have not been
re-tested since the result contract changed. Export is also where masking applies, so this is a
security check, not a cosmetic one. *Owner: engineering. Effort: hours.*

**C-2 — Render one report in Arabic.**
Two languages are configurable and only English has ever been seen. Arabic is not optional for QDB.
*Owner: engineering. Effort: hours.*

### Before a production gate can be scheduled

**C-3 — Automated UI coverage of the wizard and runtime viewer.**
The direct answer to the finding above. Not a full matrix — enough that "a report returns its rows
with the columns configured" fails loudly in CI. *Owner: engineering + QA.*

**C-4 — Re-verify sub-reports, drilldown and dashboards** after the column and result-contract
changes. Verified in earlier sessions, not since. *Owner: QA.*

**C-5 — Paging, or an explicit product decision to cap.**
Above 5,000 rows a report returns a page and flags itself truncated. Honest, but a reporting product
that cannot return a 20,000-row extract will be judged on that. Either implement paging or state the
cap as a product limit and price it accordingly. *Owner: architecture + me.*

**C-6 — Scale and timeout characterisation on realistic volume.**
The test org holds 5 accounts. Nothing measured so far speaks to the 2-minute plugin ceiling, which is
the single assumption ADR-RPT-011 rests on. **If a representative report cannot finish inside it, the
in-CRM architecture is wrong for that report class and we need the async path before production —
not after.** This is the condition I care most about. *Owner: architecture. Blocking.*

### Standing conditions carried forward

**C-7 — PDPPL and data residency review** has not been performed for the Report Engine. Reports move
personal data into exports on user devices. Carried from the DFE engagements, where it is also open.
*Owner: auditor + IT Director.*

**C-8 — The five inert transform types and eight inert source types** are labelled in the UI as
stored-not-applied. That is honest for UAT. Before production, each is either implemented or removed
from the option set — shipping a permanently disabled option is a support burden and an audit finding
waiting to happen. *Owner: me, with BA.*

---

## What I am explicitly accepting

- **Aggregating a view-joined column is refused rather than supported.** Correct call. Refusing is
  better than guessing at a total.
- **Only `canexecute` is enforced server-side.** The reasoning is sound and stated in the code rather
  than implied. Accepted, and it must be stated in user documentation too, not only in a comment.
- **No caching.** `qdb_reportcache` exists unused. Fine at this scale; revisit if C-6 shows read cost
  is the constraint.

---

## Instruction to the team

Do C-1 and C-2, then merge. 101 commits on one branch is itself a risk — a long-lived branch
diverging from `main` is how integration defects accumulate unseen, and this session already showed
we are not good at finding those without walking them.

Then C-6 before anything else. It is the cheapest way to learn whether the architecture we committed
to in ADR-RPT-011 survives contact with real volume. Everything else on this list is work; C-6 is a
question. Answer it first.

I want the Phase 5 QA finding — that 221 green tests did not catch nineteen defects — recorded in
company knowledge and applied to the other engagements. It is very unlikely to be unique to this one.

— CEO
