# C-6 — Scale and timeout characterisation

**Condition:** Phase 7, *Blocking*. "The test org holds 5 accounts. Nothing measured so far speaks
to the 2-minute plugin ceiling, which is the single assumption ADR-RPT-011 rests on. If a
representative report cannot finish inside it, the in-CRM architecture is wrong for that report
class and we need the async path before production — not after."

**Measured:** 2026-08-12, org5869857f, against real seeded volume.
**Verdict: ADR-RPT-011 holds. The async path is not needed for this report class.**
**But the reason is not the one the condition assumed, and that matters more than the timings.**

---

## Method

Workload is the **Demo — everything at once** report, chosen because it is genuinely
representative rather than synthetic: account joined to contact, grouped by status, with a computed
column, a renamed column, a masked column and row highlighting.

Volume was seeded as contacts under a single marked account (`ZZ-C6-LOADTEST`), in stages, with a
measurement between each stage so a failure at low volume would not waste the seeding above it.
Each measurement is three runs of `qdb_RunReport` (`format: run`) reported as a median.

---

## Results

| rows returned | median | min | max | ms/row | headroom vs 120s |
|---|---|---|---|---|---|
| 61 (baseline org) | ~770ms | — | ~4s | — | — |
| 1,061 | 464ms | 417ms | 624ms | 0.437 | 258× |
| 5,000 | 1,174ms | 1,107ms | 4,094ms | 0.235 | **102×** |

Two things to read out of this:

- **Cost per row falls as volume rises** (0.437 → 0.235 ms/row). The curve is sub-linear — a fixed
  per-execution cost amortising over more rows — not the super-linear growth that would signal the
  join or grouping outgrowing the sandbox. This is the shape the condition was worried about, and
  it is the benign one.
- **The first run of each set is 3–4× the others** (4,094ms vs ~1,150ms). That is cold start, and it
  is the number a user meets after an idle period. It is still 1% of the budget, but it is the
  figure to quote, not the warm median.

---

## The finding that actually matters

**The report engine cannot return more than 5,000 rows, and the 2-minute ceiling therefore cannot
be reached by volume.**

At 5,062 contacts the report returned exactly **5,000 rows flagged truncated**, while the report's
own `qdb_rowlimit` was set to **50,000**. That is not a bug — it is deliberate, and the tests say so:

- `Build_CapsTopAtWhatFetchXmlAccepts_RatherThanFailingTheReport` — "Dataverse rejects a top above
  5000 with *Parameter name: top*, which failed the whole report. The designer default row limit is
  50,000, so every report built from the generated query hit it."
- `Build_ReportsTheLimitItApplied_NotTheOneItWasAsked` — the applied limit is reported as 5,000 so
  that `Truncated` is computed honestly.

The engine issues one FetchXML query capped at `top="5000"` and does not page. So the work a single
execution performs is bounded at 5,000 rows however much data exists.

**Consequence for ADR-RPT-011:** the assumption survives, but not because in-CRM execution is fast
enough at arbitrary volume — it survives because the engine never attempts arbitrary volume. That
distinction must be preserved in the ADR. If paging is ever implemented (see C-5), the ceiling
question is reopened and this measurement no longer covers it.

Extrapolating the measured per-row cost, a paged 20,000-row report would take roughly 4–5 seconds
of engine time across four round trips — still far inside two minutes. On the evidence, the
constraint on returning large extracts is **engineering effort, not the plugin ceiling**.

---

## This makes C-5 the live question, and sharper than written

C-5 asks for "paging, or an explicit product decision to cap". The cap already exists, at 5,000,
and it is applied **silently**:

- The designer's row limit accepts values up to 50,000 and stores them.
- The engine ignores anything above 5,000.
- The user is told "truncated at row limit" — which is true, but the limit named in the designer is
  not the limit applied.

So an author setting 50,000 has been given a control that does not do what it says above 5,000.
Either the designer should refuse values above 5,000 and say why, or paging should be implemented
and the control honoured. Shipping the current combination is the support burden C-8 warns about in
a different form.

---

## Does source-table size matter, separately from output size?

It should be asked, because the join and filter scan the *source*, not only what is returned. It was
isolated by holding the output at 100 rows and comparing two source sizes:

| source contacts | output rows | min | median | max |
|---|---|---|---|---|
| 1,062 | 100 | 381ms | 402ms | 954ms |
| 5,062 | 100 | 408ms | 770ms | 1,015ms |

**A 4.8× larger source moved the fastest run by 7%** (381 → 408ms). The medians differ far more
(402 → 770ms), but run-to-run spread within a single set is itself 408–1,015ms, so at three to four
runs the noise is larger than the effect and the medians should not be read as a trend. The honest
statement is: *no evidence of a large source-size penalty at this scale, and the measurement is too
noisy to put a number on the small one.*

This is consistent with FetchXML applying `top` against an ordered index rather than materialising
the whole join, but that is an explanation offered after the fact, not something measured.

**Residual unknown.** Both source sizes here are small. A 5,000-row result drawn from a 100,000-row
table was not measured and cannot be, without seeding an order of magnitude more data than the
verdict requires. Given 102× headroom it would take roughly a 100× degradation to threaten the
ceiling, so this does not block the verdict — but it should be measured on a table of realistic size
before production, and it is the measurement most likely to overturn anything here.

---

## Teardown

Seeded data is namespaced `ZZ-C6-LOADTEST` under one marker account and is removed by
`scripts` equivalents in the session scratchpad. The Demo report's `qdb_rowlimit` was raised from
**100** to 50,000 for this test and must be restored to 100 — leaving it raised silently changes
what that report returns for every user.
