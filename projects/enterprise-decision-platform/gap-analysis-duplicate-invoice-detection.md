# Gap Analysis — Duplicate Invoice Detection and Unit-Price Threshold Checks

**Reference:** EDP-GAP-001
**Date:** 2026-08-18
**Status:** Analysis only. No implementation authorised, no BRD raised.
**Business review:** 2026-08-18 — blocking defects resolved, see §2.5.
**Subject:** Can the Enterprise Decision Platform, as built today, deliver the
Disbursement Request duplicate-invoice and unit-price validation requirement?

---

## 1. Verdict

**No — not as an EDP rule alone.** The requirement decomposes into a **policy**
layer that EDP is well suited to own and a **data acquisition** layer that EDP
cannot perform and was deliberately designed not to perform.

Of the five checks in the requirement, **two are expressible in the engine
today**, one needs a single small additive change, and two are categorically
outside the engine's scope.

The recommended shape is a **fact-assembly layer** that retrieves and normalises
the data, and calls the EDP runtime in-process to make each decision. EDP keeps
what it is good at — versioned, approved, simulated, audited policy — and does
not acquire a query language or an HTTP client.

**Updated 2026-08-18 — the business has answered.** All four blocking defects and
most open questions were resolved in session (§2.5). Two consequences dominate: the
match criteria must be **configurable**, which strengthens the case for a governed
rule over a plugin constant; and the duplicate lookback is **unbounded**, which makes
the legacy-table migration a requirement rather than an option (§8).

**This document still does not recommend proceeding to build.** It is an input to a
BRD, not a substitute for one.

---

## 2. The requirement

### 2.1 The five checks

Input: one Disbursement Request reference or GUID.

| ID | Check | Grain |
|---|---|---|
| **G1** | Every invoice on the DR carries *some* beneficiary name and bank account number | Disbursement Request |
| **G2** | Each invoice's beneficiary matches the DR's beneficiary | Disbursement Request |
| **G3** | The DR's invoices duplicate a historical invoice | Invoice |
| **G4** | Retrieve MIS purchase history and select the latest purchase per line-item ref by LC issuance date | Line item |
| **G5** | New unit price is within the age-based tolerance band of the last purchased price | Line item |

G1 and G2 are gates: failing either returns *Beneficiary details are consistent = No*
and stops. G3 runs only if both pass.

### 2.2 The duplicate predicate

Derived from the three worked examples supplied by the business:

```
Duplicate(invoice) =
  ∃ historical invoice H in another DR, where
      H.beneficiary = invoice.beneficiary
    AND ( H.invoiceNo = invoice.invoiceNo
        OR ∃ line ℓ in H where ℓ.ref ∈ lineRefs(invoice) )
```

Example 2 is the load-bearing negative control: the same invoice number under a
*different* beneficiary is **not** a duplicate. Beneficiary equality is therefore
a required conjunct, not corroborating evidence.

Example 3 establishes that a line-item-ref match alone is sufficient, **even when
the invoice numbers differ** — a supplier re-issuing the same lines under a new
invoice number.

The verdict is reported at **invoice** grain, not line grain.

**Amended 2026-08-18.** Line-item amount is a **required conjunct today**, and scope
widens to include duplicates *within the submitted DR* as well as against history.
Comparison sources are restricted to **paid or approved DRs only** — a rejected DR was
never disbursed, so matching it is not a duplicate-payment risk.

**Every conjunct in this predicate must be configurable** (§2.5, C-1). The business
expects the mandatory/optional status of each criterion to change without a code
change. This is the most consequential answer received; §7.2 records what it does to
the architecture.

### 2.3 The unit-price tolerance bands

| Age of last purchase | Permitted variance |
|---|---|
| 0–6 months | ±5% |
| 6–12 months | ±7.5% |
| 1–2 years | ±10% |
| ≥ 2 years | **Fail** — routed to review |
| No prior purchase at all | **Fail** — routed to review |

Tolerance percentages must be pre-populated and configurable.

**Resolved 2026-08-18.** Both no-benchmark cases fail rather than pass. Because the
consequence of failure is *route-to-review plus a warning* rather than a hard block
(§2.5, C-8), failing closed is defensible: a dormant supplier or a genuinely new item
gets human judgement rather than a wall. The residual risk moves from blocked payments
to **review-queue volume**, which should be measured against historical data before
go-live.

**Band boundaries — lower bound inclusive, upper exclusive.** Delegated to engineering
and decided on internal consistency: `EffectiveVersionResolver` already uses a half-open
`[from, to)` window for effective dating, and using one convention twice in a product is
worth more than a marginal argument either way. So `[0, 6)` months → ±5%, `[6, 12)` →
±7.5%, `[12, 24)` → ±10%, `[24, ∞)` → Fail.

### 2.4 Four data sources

| # | Source | Shape | Access |
|---|---|---|---|
| 1 | Current DR → invoices → line items | 3-level hierarchy | Dataverse |
| 2 | Legacy history (pre-2025 only) | **Denormalised** — invoice and line item in one table | Dataverse |
| 3 | Current history (2025 onward) | **Normalised** — master + child | Dataverse |
| 4 | MIS purchase history | External | **REST API via middleware** |

### 2.5 Decisions taken by the business — 2026-08-18

Recorded in session. These close all four blocking defects and most open questions.

| ID | Question | Decision |
|---|---|---|
| **C-1** | Is amount part of the duplicate key? | **Mandatory today, but every check must be CONFIGURABLE** — the business expects criteria to become optional later without a code change |
| **C-2** | Line-item ref semantics | **Supplier-issued, OCR-extracted.** The line-ref duplicate signal is real and is the strongest available |
| **C-3** | Unit-price check, last purchase ≥ 2 years ago | **Fail** |
| **C-4** | No prior purchase at all | **Fail** |
| **C-5** | Currency | **Multiple currencies; compare same-currency purchases only** |
| **C-6** | Beneficiary identity for matching | **Account number, IBAN AND name must all match** |
| **C-7** | Duplicate lookback | **All history, no time limit** |
| **C-8** | Consequence of a failed check | **Route to review, and warn with override** — not a hard block |
| **C-9** | Eligible comparison sources | **Paid or approved DRs only** |
| **C-10** | Intra-DR duplicates | **In scope** — check within the submitted DR as well as against history |
| **C-11** | Unit price and unit of measure | **Stored fields, UoM captured** |
| **C-12** | Tolerance band boundaries | Delegated to engineering → **lower inclusive, upper exclusive** |

#### Consequences that follow from combining these

1. **C-3 + C-4 + C-5 compound into a fail-closed price check.** A supplier who
   previously invoiced in USD and now invoices in QAR has no same-currency history,
   which lands in the C-4 bucket and fails. A legitimate currency switch therefore
   fails the check. **C-8 makes this acceptable** — failure means review, not a block —
   but the interaction should be understood rather than discovered in production.
2. **C-6 weakens the control, and was chosen with that stated.** Beneficiary name is
   OCR-extracted; requiring exact name equality alongside account and IBAN means any
   OCR or formatting variant breaks the match and the duplicate goes undetected.
   **Recommended mitigation, not yet accepted:** canonicalise the name before comparing
   — uppercase, trim, collapse whitespace, strip punctuation. This is normalisation, not
   fuzzy matching; it preserves the three-way match exactly while removing the trivial
   variants. `EDP_Upper` and `EDP_Trim` already exist in the formula engine.
3. **C-2 extends the OCR fragility to line refs.** Since refs are supplier-issued and
   OCR-extracted, exact matching on them carries the same false-negative risk as names.
4. **C-7 makes the legacy migration a requirement** rather than an option (§8).
5. **C-9 materially helps performance** — restricting to paid/approved DRs shrinks an
   otherwise unbounded search population.
6. **C-1 is the largest architectural consequence** and is addressed in §7.2.

---

## 3. Evidence base

Every capability claim below was verified by reading the runtime source on
`origin/main` at `c2a09e4f` on 2026-08-18. Claims are cited to file and symbol.
Nothing in this section is drawn from prior engagement notes.

| Finding | Evidence |
|---|---|
| The value system is scalar-only — decimal, DateTime, bool, string | `runtime/src/EDP.RuleRuntime/Operators/RuntimeValue.cs` |
| Collection aggregates are explicitly out of scope and raise an error rather than guess | `runtime/src/EDP.RuleRuntime/Formula/FormulaEngine.cs`, class doc comment |
| Single-hop N:1 navigation exists (`Via`) | `runtime/src/EDP.RuleRuntime/Pcrm/PcrmModels.cs` — `PcrmVia` |
| Single-hop 1:N aggregation exists (`Aggregate`), folding Count/Sum/Avg/Min/Max | `PcrmModels.cs` — `PcrmAggregate` |
| The aggregate filter compares a child field to a **literal only** — there is no `valueField` | `PcrmModels.cs` — `PcrmAggregateFilter` |
| Every child query is anchored to the target: `ConditionExpression(childLookup, Equal, target.Id)`, `TopCount = 5000`, filter applied in memory after retrieval | `runtime/src/EDP.RuleRuntime.Crm/RuleDecisionService.cs` — `ResolveAggregate` |
| Operators include `in` / `notin`, with a comma-separated string fallback | `runtime/src/EDP.RuleRuntime/Operators/OperatorEvaluator.cs` — `InList` |
| Inputs originate only from target attributes, `Via`, `Aggregate`, or `InputsJson`. There is no HTTP client and no outbound integration of any kind | `RuleDecisionService.BuildInputs`, `EvaluateDecisionPlugin` |

---

## 4. Feasibility per check

| Check | Status | Reason |
|---|---|---|
| **G1** | ✅ **Expressible today** | Two aggregate inputs — `Count(invoices)` and `Count(invoices where beneficiaryName NotEquals "")` — compared field-to-field. Both are single-hop 1:N folds, which the engine supports. |
| **G2** | ⚠️ **One small gap** | Requires "count invoices whose beneficiary differs from *this DR's* beneficiary". The comparand is a field, not a constant, and `PcrmAggregateFilter` accepts only a literal. |
| **G3** | ❌ **Out of scope** | Requires cross-record search over a population, two levels of child traversal, and a union of two differently-shaped sources. None of these exist. |
| **G4** | ❌ **Out of scope** | Requires an outbound HTTP call and a group-by-then-argmax. Neither exists. |
| **G5** | ✅ **Fully expressible today** | Given the facts, this is a decision table over an NCalc-computed variance variable. |

### 4.1 G5 in detail — the part EDP is built for

Given `newUnitPrice`, `lastUnitPrice` and `monthsSinceLastPurchase` as inputs, a
PCRM variable computes the variance:

```
variancePercent = EDP_Round((newUnitPrice - lastUnitPrice) / lastUnitPrice * 100, 4)
```

and the bands become an ordinary decision table:

| `monthsSinceLastPurchase` | `variancePercent` | → `thresholdVerdict` |
|---|---|---|
| between 0, 6 | between -5, 5 | Pass |
| between 0, 6 | — | Fail |
| between 6, 12 | between -7.5, 7.5 | Pass |
| between 6, 12 | — | Fail |
| between 12, 24 | between -10, 10 | Pass |
| between 12, 24 | — | Fail |
| > 24 | — | *(pending D-1)* |

This is the strongest argument for EDP owning the policy layer. The tolerance
percentages are exactly the kind of parameter a business tunes over time, and
they carry real financial consequence. Placing them in a versioned rule gives
maker-checker approval, pre-publish simulation against saved scenarios,
effective dating, and an append-only record of who changed ±5% to ±6% and when.
Hard-coding them in a plugin forfeits all of that.

**Guard required:** `lastUnitPrice = 0` divides by zero. The fact-assembly layer
must not emit a zero baseline, or the rule must branch before the variance
variable is evaluated.

---

## 5. Gap register

| ID | Gap | Blocks | Severity |
|---|---|---|---|
| **GAP-01** | No collection type — a rule cannot iterate invoices or line items | G3, G4 | Structural |
| **GAP-02** | Child traversal is single-hop; DR → Invoice → Line Item is two hops | G3 | Structural |
| **GAP-03** | Aggregate filter compares to a literal, not a field (no `valueField`) | G2 | **Small — additive fix** |
| **GAP-04** | All reads anchored to `target.Id`; no cross-record or population search | G3 | Structural |
| **GAP-05** | One verdict per evaluation; no fan-out over child records | G3, G5 | Design constraint |
| **GAP-06** | Folds are numeric only — no `Exists`, no `DistinctCount`, no string-join | G3 | Small — additive |
| **GAP-07** | `TopCount = 5000` with the filter applied in memory; silent truncation, no paging | G1, G2 | Correctness risk |
| **GAP-08** | No invocation surface — EDP-BIND-001 architecture has not started | all | Known, tracked |
| **GAP-09** | **No outbound HTTP.** EDP cannot reach the middleware | G4 | Structural, by design |
| **GAP-10** | No group-by / argmax — "latest per ref by LC issuance date" is not expressible | G4 | Structural |
| **GAP-11** | No multi-source union — reconciling the denormalised legacy table has nowhere to live | G3 | Structural |
| **GAP-12** | Outputs are author-written constants; a rule cannot echo *which* record it matched | G3 | Explainability |

GAP-12 matters more than it appears. Reason codes can emit `DUP_INVOICE_NO`, but
the business needs "duplicates DR10002 invoice 1". That evidence must come from
the fact-assembly layer, because rule outputs cannot carry data.

---

## 6. Market comparison

Verified against vendor documentation on 2026-08-18. Sources listed in §11.

**The market does not divide on rule expressiveness. It divides on data access.**
Nearly every mature engine expresses the duplicate predicate elegantly once the
data is in scope; in DMN's FEEL it is roughly four lines. What separates the
products is whether the engine fetches its own data.

| Capability | North52 | Corticon + EDC | DMN / Drools / ODM | Flow platforms | **EDP today** |
|---|---|---|---|---|---|
| Query Dataverse history | ✅ `FindRecordsFD`, FetchXML with `SetParams()` | ✅ generated SQL | ❌ | ✅ | ❌ |
| Nested iteration | ✅ `ForEachRecord` / `ForEachInline` | ✅ | ✅ | ✅ | ❌ |
| Call the MIS REST API | ✅ `CallRestAPI`, WebFusion | ⚠️ unverified | ❌ | ✅ | ❌ |
| Latest-per-group selection | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tolerance band table | ✅ | ✅ | ✅ | ✅ | ✅ |
| Versioning, maker-checker, simulation, audit | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ |

### 6.1 North52 can do all five checks with no C#

This is a direct competitive finding and should be recorded as such. North52
combines record retrieval (`FindRecordsFD`, `FindRecordsFetchXml`, parameterised
at runtime through `SetParams()`), nested iteration (`ForEachRecord`,
`ForEachInline`, `CurrentRecord()`, `RecordIndex()`) and outbound REST
(`CallRestAPI`, WebFusion). Every part of this requirement is reachable in its
formula language.

The qualification worth making to a customer is honest rather than defensive: a
nested `ForEachRecord` over a fetched collection, calling a REST API, is code in
everything but name — proprietary formula text in a textbox, with no source
control, no unit tests, no debugger, no approval workflow and no simulation. For
a control that governs payment release, that distinction is the argument.

### 6.2 The pure decision engines sit where EDP sits

DMN/FEEL, Drools and IBM ODM all express the logic well — FEEL has list filters,
`some` and `every` quantifiers, `distinct values()`; Drools has `exists`,
`accumulate`, `forall` — but all three operate on facts supplied to them.
Working-memory insertion or ruleset parameters are the pattern; database access
during evaluation is not. **Their architecture is the one recommended in §7.**
EDP's gap versus this tier is narrower than it first appears: it is the missing
collection type (GAP-01), not a missing database.

### 6.3 The reframe — exact matching is the wrong algorithm

The requirement specifies exact matching on invoice number, line-item ref and
beneficiary. The AP-automation industry's consistent published finding is that
exact matching is precisely what fails: ERP-native duplicate controls catch only
exact matches, and a dash, a space or a leading zero admits a near-duplicate as a
new record. Specialist products (AppZen, Xelix, Medius, Oversight) use fuzzy
matching with similarity scoring across vendor, amount and invoice number.

The exposure here is concrete. Beneficiary name is OCR-extracted free text.
Exact equality on "Ahmad" will silently miss "AHMAD", "Ahmad Ltd." and every OCR
variant — producing **false negatives on the control whose entire purpose is
preventing duplicate payment**. Bank account number and IBAN are the only
reliable identity keys in the supplied data.

No rule engine in any tier above provides fuzzy matching out of the box. This is
a matching-algorithm decision, not a rules-engine decision, and it should be
taken explicitly rather than inherited from the specification.

Duplicate invoice detection is also a commodity product category. A buy-versus-build
comparison is warranted before committing to build.

---

## 7. Recommended architecture

**Fact assembly outside, policy inside.**

```
  Disbursement Request
          │
          ▼
  ┌───────────────────────────────────────────────┐
  │  Fact-assembly layer  (plugin / Custom API)   │
  │  · walks DR → invoices → line items           │
  │  · queries history sources 2 and 3            │
  │  · calls MIS through middleware — ONE call    │
  │  · selects latest purchase per ref by LC date │
  │  · normalises currency and unit of measure    │
  └───────────────────────────────────────────────┘
          │  flat scalar facts, per invoice / per line item
          ▼
  ┌───────────────────────────────────────────────┐
  │  EDP runtime — called IN-PROCESS              │
  │  · gate ordering (G1 → G2 → G3)               │
  │  · duplicate predicate                        │
  │  · unit-price tolerance bands (G5)            │
  └───────────────────────────────────────────────┘
          │  verdict + reason codes
          ▼
  Fact-assembly layer attaches matched-record evidence
```

Two constraints follow from measurements already on record:

- **Call the runtime in-process, once per line item — not once per Custom API
  round trip.** `spikes/oq-b1-client-roundtrip-latency.md` established that the
  engine contributes ~0 ms and that 329 ms is the cost of *invoking* a sandboxed
  plugin. A 20-invoice DR evaluated over the Custom API is ~10 s warm and far
  worse cold; the same work in-process is effectively free. ADR-EDS-10 already
  sanctions same-assembly in-process execution.
- **One MIS call per DR, not one per line item.** The specification says "for
  each line item" but describes retrieval by reference, beneficiary and customer
  ref — a single call returning the set, partitioned locally. N middleware calls
  per DR will not perform, and cold-start behaviour (`spikes/oq-b6-cold-start-posture.md`,
  3–14 s) makes the per-item pattern untenable.

### 7.1 Engine improvements worth making regardless

| # | Change | Effect | Size |
|---|---|---|---|
| 1 | Add `valueField` to `PcrmAggregateFilter` | **Closes GAP-03 and G2 outright.** Precedent already exists on `PcrmCondition` and `PcrmCell` | Small |
| 2 | Add `Exists` and `DistinctCount` folds | Closes GAP-06; useful well beyond this rule | Small |
| 3 | Page the aggregate query, or fail loudly on truncation | Closes GAP-07, a silent-correctness risk | Small |

A general "bounded population match" input type would close GAP-04 and is the
natural Wave-2 candidate. It should not be attempted without hard guard rails —
mandatory filter, row ceiling, read-only — or EDP drifts into being a query
language, which contradicts the decision-engine positioning (ADR-EDS-07).

### 7.2 Configurable match criteria change where the configuration lives

C-1 requires that each conjunct of the duplicate predicate can be turned on or off
without a code change. That is straightforward for a decision, and awkward for a
query — and the requirement touches both.

**The tension:** EDP evaluates a rule *after* data has been fetched. If the match key
is configurable inside the rule, the fact-assembly layer cannot know what to query.
Configuration that lives only in the rule arrives too late to shape the query.

**Recommended resolution — broad candidate generation, configurable narrowing.**

1. The fact-assembly layer queries on the conjuncts that are **structurally always
   required**: beneficiary identity (C-6) plus a match on invoice number *or* line-item
   ref, restricted to paid/approved DRs (C-9). This is indexed, selective, and a safe
   superset of any sane configuration.
2. Every candidate pair is then evaluated by the **EDP rule**, in-process, which applies
   the configurable conjuncts — amount, and whatever later becomes optional — and returns
   the verdict with reason codes.

This puts **all** configurable policy inside the governed rule, where changing "amount is
mandatory" to "amount is advisory" becomes a versioned, approved, simulated rule change
with an audit trail, rather than a plugin edit and a redeploy. It is the strongest
argument in this document for EDP owning the decision layer.

**Cost:** N evaluations per invoice rather than one. Per OQ-B1 the engine contributes
~0 ms and the 329 ms is the cost of *invoking* a sandboxed plugin, so in-process
evaluation makes N essentially free. It would be prohibitive over the Custom API.

**Bound required:** with C-7 (unbounded history), a prolific supplier could generate a
large candidate set. The candidate query must be paged and capped, and any truncation
must fail loudly rather than silently return "no duplicate found" — the same defect class
as GAP-07.

---

## 8. The legacy table — time-boxed for the price check, permanent for the duplicate check

Today is 2026-08-18. The unit-price check's longest lookback is two years,
reaching back to **2024-08-18** — before the 2025 boundary. The legacy
denormalised source therefore **cannot be ignored today**.

From **2027-01-01**, a two-year window begins at 2025-01-01 and lies entirely
within the normalised tables. The legacy source stops mattering for G5 in
approximately four and a half months.

**But C-7 settles the larger question the other way: the duplicate lookback is
unbounded.** Pre-2025 invoices remain in scope for G3 permanently, so the legacy
source never ages out of the duplicate check the way it ages out of the price check.

That makes the recommendation stronger, not weaker. The alternative to a migration is
a **permanent** dual-shape read — two mappings, two field-name vocabularies, two sets
of silent-defect risk, maintained indefinitely and exercised on every duplicate check.
**Normalise the legacy table into the current shape once, as a migration.** The cost is
paid once; the dual-read cost is paid forever, and every future change to the duplicate
logic has to be made and tested twice.

⚠️ **Check before designing either way:** does the legacy table carry beneficiary
name, account number and IBAN at all? If it does not, G3 degrades to
invoice-number-only against pre-2025 data — which means the Example 2 negative
control (same invoice number, different beneficiary, *not* a duplicate) **would
produce false positives on every legacy row**.

---

## 9. Specification defects and open questions

### 9.1 Blocking defects — ALL RESOLVED 2026-08-18

| ID | Issue | Resolution |
|---|---|---|
| **D-1** | The >2-year rule was self-contradictory — *"must not apply a threshold check will be fail"* read as both pass and fail | **C-3: Fail** |
| **D-2** | No prior purchase at all was unspecified and distinct from ">2 years ago" | **C-4: Fail** |
| **D-3** | Currency unaddressed — a ±5% band across unconverted currencies fires at random | **C-5: compare same-currency purchases only** |
| **D-4** | Unit of measure unaddressed — price per box vs per unit produces garbage | **C-11: stored fields, UoM captured** |

None of these were designed around. Each was raised, answered by the business, and
recorded in §2.5 with its downstream consequences.

### 9.2 Resolved in the same session

| ID | Question | Resolution |
|---|---|---|
| **Q-1** | Line-item ref semantics — the load-bearing question | **C-2: supplier-issued, OCR-extracted.** The signal is real |
| **Q-2** | Historical scope | **C-7 unbounded; C-9 paid/approved sources only** |
| **Q-3** | Is amount part of the duplicate key? | **C-1: mandatory today, must be configurable** |
| **Q-4** | Beneficiary identity | **C-6: account, IBAN and name must all match** |
| **Q-6** | Band boundaries | **C-12: lower inclusive, upper exclusive** |
| **Q-7** | Intra-DR duplicates | **C-10: in scope** |
| **Q-8** | Consequence of failure | **C-8: route to review, warn with override** |

### 9.3 Still open

| ID | Question |
|---|---|
| **Q-1** | **Line-item ref semantics.** In Examples 1 and 2 the refs appear derived from the invoice number (invoice 1 → 11, 12; invoice 2 → 21; invoice 5 → 51). Example 3 breaks that pattern by giving invoice 4 the refs 11 and 12. If refs are system-generated per invoice, the Example 3 signal is meaningless; if they are supplier-issued and OCR-extracted, it is the strongest signal available. **These lead to opposite designs.** |
| **Q-2** | **Historical scope** — all DRs ever, or a bounded window? Do cancelled or rejected DRs still count as a duplicate source? Does a re-run DR match itself? |
| **Q-3** | **Is amount part of the duplicate key?** It matches in every positive example but is never cited in the stated reasons. It materially changes the false-positive rate. |
| **Q-4** | **Which field constitutes beneficiary identity** — name, account number, IBAN, or all three? See §6.3 on OCR-extracted names. |
| **Q-5** | **Is "supplier" the same party as "beneficiary"?** The reason text says supplier; the columns say beneficiary. Clarification, not a design decision |
| **Q-9** | **Key-set divergence** — G3 matches on beneficiary + invoice no / line ref; G4 matches on reference number + beneficiary + customer ref no. Confirm this is deliberate |
| **Q-10** | **Does a DR match itself** on re-evaluation after being saved? Self-exclusion must be explicit |
| **Q-11** | **Name canonicalisation** — accept the §2.5 mitigation, or compare OCR-extracted names raw? |
| **Q-12** | **Volume.** With C-7 unbounded and C-8 routing failures to review, both the candidate-set size and the review-queue load need real numbers. Run the rule against historical data before go-live |
| **Q-13** | **Does the legacy table carry beneficiary name, account and IBAN?** A data check, not a business decision — see §8 |
| **Q-14** | **MIS API contract** — response shape, field names, paging, and whether it can be filtered server-side. Not yet seen |

---

## 10. Consequences for EDP

1. **This requirement is concrete evidence for the C-004 position** that EDP is
   not a drop-in North52 replacement until EDP-BIND-001 ships. It extends that
   finding: the deficit is not only invocation but **set-based logic and data
   reach**. Appendix B of `phase-3-arch.md` has been updated accordingly.
2. **GAP-01 (no collection type) is the single highest-value engine
   investment** surfaced by this analysis. It is what separates EDP from the
   DMN/Drools/ODM tier, and it is a bounded, well-understood piece of work.
3. **G5 demonstrates the product thesis cleanly** and is worth using as a demo
   case: age-banded tolerance thresholds, business-tunable, governed, simulated
   before publish, audited after. That is the sale.
4. **C-1 — configurable match criteria — is the strongest commercial argument this
   analysis produced.** The business has stated outright that the mandatory/optional
   status of each duplicate criterion will change over time. A plugin constant cannot
   absorb that; a versioned rule with approval, simulation and an audit trail can. This
   is the product thesis stated back to us by a customer requirement, and it is worth
   carrying into sales collateral.
5. **No BRD is raised by this document.** The §9.1 defects are now resolved (§2.5), so
   this is ready to serve as an input to a BRD. Seven questions remain open (§9.3), but
   none of them block starting one — they are clarifications, data checks and a volume
   measurement rather than design forks.

---

## 11. Sources

Vendor documentation consulted 2026-08-18. Competitor rows are documentation-based,
not hands-on; they are labelled as such wherever used.

- North52 `FindRecordsFD` — https://support.north52.com/knowledgebase/article/KA-01665-dynamics-crm-365-FindRecordsFD/en-us
- North52 `ForEachRecord` — https://support.north52.com/knowledgebase/article/KA-01706-dynamics-crm-365-ForEachRecord/en-us
- North52 `CallRestAPI` — https://support.north52.com/knowledgebase/article/KA-01881-dynamics-crm-365-CallRestAPI/en-us
- North52 WebFusion — https://support.north52.com/knowledgebase/article/KA-01970-dynamics-crm-365-Introduction-to-North52s-WebFusion/en-us
- North52 reusable FetchXML — https://support.north52.com/knowledgebase/article/KA-10070-dynamics-crm-365-xRM-Formula-243-Reusable-FetchXML-queries/en-us
- Progress Corticon Enterprise Data Connector — https://www.progress.com/corticon/components/enterprise-data-connector
- DMN list and table basics — https://www.methodandstyle.com/blog/dmn-list-and-table-basics/
- Set operations in DMN — https://www.methodandstyle.com/blog/set-operations-in-dmn/
- Drools rule engine documentation — https://docs.drools.org/latest/drools-docs/drools/rule-engine/index.html
- IBM ODM general rule engine concepts — https://www.ibm.com/docs/en/odm/9.0.0?topic=mode-general-rule-engine-concepts
- Corpay, duplicate payment detection — https://www.corpay.com/resources/blog/duplicate-payment-detection
- Medius, AP duplicate prevention — https://www.medius.com/blog/what-ap-automation-features-help-prevent-duplicate-payments/

---

## VERIFICATION

| Claim | How verified | Result |
|---|---|---|
| EDP capability statements in §3 and §4 | Read runtime source on `origin/main` @ `c2a09e4f` | Verified against source, cited to file and symbol |
| Latency and cold-start figures in §7 | Committed spikes `oq-b1-client-roundtrip-latency.md`, `oq-b6-cold-start-posture.md` | Quoted from committed measurements, not re-measured |
| North52 and Corticon capabilities | Vendor documentation, 2026-08-18 | **Documentation-based, not hands-on.** Labelled as such |
| Flowon capabilities | Not re-verified in this analysis | Deliberately excluded rather than asserted |
| Legacy-table boundary arithmetic in §8 | Computed from the stated pre-2025 boundary and a 2-year lookback | Arithmetic only; the pre-2025 boundary is as stated by the business, unverified against the data |
| Legacy table carries beneficiary fields | **NOT verified** | Raised as a check in §8, not claimed either way |
| MIS API response shape and field names | **NOT verified** — no access to the middleware contract | Not claimed anywhere in this document |
| The requirement itself | **Reviewed with the business 2026-08-18** | Four blocking defects and seven open questions answered and recorded in §2.5; seven remain open in §9.3 |
| Combined effect of C-3, C-4 and C-5 | Reasoned from the answers, not measured | A legitimate currency switch fails the price check. Raised in §2.5; C-8 mitigates it. **Not quantified against real data** |
| Candidate-set and review-queue volumes | **NOT measured** | Q-12. C-7 is unbounded and C-8 routes failures to humans; neither load is known |

**Not done, and deliberately so:** no rule was authored, no schema was touched, no live
org was modified, and no code was written. This document is analysis only.

**One recommendation is outstanding rather than accepted:** name canonicalisation before
comparison (§2.5, consequence 2). It is recorded as advice, not as a decision, and Q-11
tracks it.
