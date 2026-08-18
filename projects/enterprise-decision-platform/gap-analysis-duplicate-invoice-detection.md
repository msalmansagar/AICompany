# Gap Analysis — Duplicate Invoice Detection and Unit-Price Threshold Checks

**Reference:** EDP-GAP-001
**Date:** 2026-08-18
**Status:** Analysis only. No implementation authorised, no BRD raised.
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

**This document does not recommend proceeding to build.** Four defects in the
requirement specification change the design depending on how they are answered
(§9.1) and should be resolved with the business first.

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

### 2.3 The unit-price tolerance bands

| Age of last purchase | Permitted variance |
|---|---|
| 0–6 months | ±5% |
| 6–12 months | ±7.5% |
| 1–2 years | ±10% |
| > 2 years | *specification is contradictory — see §9.1 D-1* |

Tolerance percentages must be pre-populated and configurable.

### 2.4 Four data sources

| # | Source | Shape | Access |
|---|---|---|---|
| 1 | Current DR → invoices → line items | 3-level hierarchy | Dataverse |
| 2 | Legacy history (pre-2025 only) | **Denormalised** — invoice and line item in one table | Dataverse |
| 3 | Current history (2025 onward) | **Normalised** — master + child | Dataverse |
| 4 | MIS purchase history | External | **REST API via middleware** |

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

---

## 8. The legacy table is a time-boxed problem

Today is 2026-08-18. The unit-price check's longest lookback is two years,
reaching back to **2024-08-18** — before the 2025 boundary. The legacy
denormalised source therefore **cannot be ignored today**.

From **2027-01-01**, a two-year window begins at 2025-01-01 and lies entirely
within the normalised tables. The legacy source stops mattering for G5 in
approximately four and a half months.

This inverts the usual build decision. Rather than engineering a permanent
dual-source read — two mappings, two field-name vocabularies, two sets of silent
defect risk — **normalise the legacy table into the current shape once, as a
migration**. If the duplicate check's lookback also proves bounded (open question
Q-2), the legacy integration disappears from the runtime entirely.

⚠️ **Check before designing either way:** does the legacy table carry beneficiary
name, account number and IBAN at all? If it does not, G3 degrades to
invoice-number-only against pre-2025 data — which means the Example 2 negative
control (same invoice number, different beneficiary, *not* a duplicate) **would
produce false positives on every legacy row**.

---

## 9. Specification defects and open questions

### 9.1 Blocking — the answer changes the design

| ID | Issue |
|---|---|
| **D-1** | **The >2-year rule is self-contradictory.** *"the system must not apply a threshold check will be fail"* reads simultaneously as "no threshold applies" (pass) and "fail". These are opposite outcomes for what is likely a common case. |
| **D-2** | **No prior purchase at all** (a genuinely new item) is unspecified and is distinct from ">2 years ago". This is a common case and needs its own defined outcome. |
| **D-3** | **Currency is unaddressed.** Comparing a unit price against one up to two years old, in a cross-border trade-finance book, is meaningless without FX normalisation. A ±5% band applied across unconverted currencies will fire essentially at random. |
| **D-4** | **Unit of measure is unaddressed.** Is unit price stored, or derived from amount ÷ quantity? A price per box compared against a price per unit produces garbage that will present as a data problem rather than a rule problem. |

### 9.2 Important

| ID | Question |
|---|---|
| **Q-1** | **Line-item ref semantics.** In Examples 1 and 2 the refs appear derived from the invoice number (invoice 1 → 11, 12; invoice 2 → 21; invoice 5 → 51). Example 3 breaks that pattern by giving invoice 4 the refs 11 and 12. If refs are system-generated per invoice, the Example 3 signal is meaningless; if they are supplier-issued and OCR-extracted, it is the strongest signal available. **These lead to opposite designs.** |
| **Q-2** | **Historical scope** — all DRs ever, or a bounded window? Do cancelled or rejected DRs still count as a duplicate source? Does a re-run DR match itself? |
| **Q-3** | **Is amount part of the duplicate key?** It matches in every positive example but is never cited in the stated reasons. It materially changes the false-positive rate. |
| **Q-4** | **Which field constitutes beneficiary identity** — name, account number, IBAN, or all three? See §6.3 on OCR-extracted names. |
| **Q-5** | **Is "supplier" the same party as "beneficiary"?** The reason text says supplier; the columns say beneficiary. |
| **Q-6** | **Band boundaries** — is exactly 6 months in band 1 or band 2? Is 12 months in band 2 or band 3? Inclusive/exclusive must be specified. |
| **Q-7** | **Intra-DR duplicates** — checked, or history only? |
| **Q-8** | **Consequence** — does a duplicate block submission, warn, or route to review? |
| **Q-9** | **Key-set divergence** — G3 matches on beneficiary + invoice no / line ref; G4 matches on reference number + beneficiary + customer ref no. Confirm this is deliberate. |

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
4. **No BRD is raised by this document.** If the business wishes to proceed, the
   §9.1 defects must be resolved first, then this becomes an input to a BRD.

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
| The requirement itself | Not validated with the business | §9.1 records four defects that must be resolved before design |

**Not done, and deliberately so:** no rule was authored, no schema was touched,
no live org was modified, and no code was written. This document is analysis only.
