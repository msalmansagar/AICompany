# Rule Engine 1.1.0 Contract Enhancements — CEO Decision (Architecture Gate)

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-RE-ENH-001
**Phase:** Architecture Gate (`.claude/workflows/new-feature.md` Phase 2 — "Architecture delta and ADRs … CEO gate if produced")
**Date:** 2026-09-28
**Under review (commit `2b64e442`):** ADR-19 (strict input contract, `Outcome`, provenance), ADR-20 (`ContentHash` canonical form), ADR-21 (RuleKey identity and resolver), and `dependencies.md` addendum DEP-014…018.
**Governing (ratified, not re-openable here):** `brd-edp-re-enh-001-release1-contract.md` v1.1; `ceo-decision-edp-re-enh-001.md`; `sponsor-ratification-edp-re-enh-001.md` (HD-1 ratified; HD-2; HD-5 with Release-1 enforcement on every supported path; HD-9 Option Y deploy-first; IC-4 amended).
**Decision by:** MSS Technologies — CEO function.

> ## ⚠️ SEPARATION-OF-DUTIES CAVEAT — recommendation, not ratification
>
> This gate was rendered by an agent, and the three ADRs were authored by the architect agent. As
> for the BRD gate (EDP-BIND-001, EDP-FACT-001, and the v1.1 ratification), a CEO-function decision
> is a **recommendation**. The sponsor has already ratified the BRD v1.1 and **authorised B1–B4
> source implementation**; this architecture gate is a checkpoint *within* that authorisation, and it
> passes on my authority as the checkpoint owner. What it does **not** do: authorise any live
> deployment, live data change or live schema change — each of those remains a separate, explicit
> human authorisation (HD-3), unchanged. Where a condition below asks the BRD text to be reconciled,
> that is a documentation fold-in the sponsor should be **notified** of, not a fresh re-ratification
> gate — see AC-1 and the §Q1 reasoning for why.

---

## Decision

**APPROVE WITH CONDITIONS.**

The three ADRs are a faithful architectural implementation of the ratified 1.1.0 contract, not a
re-opening of it. ADR-21 is clean and complete. ADR-19 and ADR-20 are sound and resolve two real
constraints the BRD could not see (the on-prem argument-name collision; a total, serializer-
independent hash), but in doing so they add contract surface — one response-envelope shape, one new
declared type, three new diagnostic codes, and one softened canonical-form rule — that must be
reconciled back into the BRD text and, in two cases, surfaced to the sponsor before the affected
work is treated as frozen. None of these require re-ratification; all are folded in during build and
recorded, in the "recorded rather than silently resolved" discipline this engagement already uses.

The `dependencies.md` BUILD decisions (DEP-014…018) are correctly reasoned and consistent with the
standing adopt-over-build rule and the net462 / System.Text.Json-9 sandbox wall this engagement has
already paid to learn.

No live step is authorised by this document. HD-3, HD-7 (PDPPL/residency), and HD-8 (on-prem
runtime validation) are untouched.

---

## Explicit answer to Question 1 — ADR-19 §4 provenance packaging

**Verdict: FAITHFUL IMPLEMENTATION — a representation/transport change. It does NOT need sponsor
re-ratification.** One documentation reconciliation and one sponsor notification are attached
(AC-1), but they are not re-ratification.

Reasoning, in order of weight:

1. **No semantic content is lost.** The sponsor ratified that `EvaluateDecision` *exposes*
   `Outcome`, `ExecutionId`, `RuleId`, `RuleKey`, `RuleVersionId`, `VersionNumber`, `ContentHash`,
   `EvaluatedOnUtc`, `CorrelationId`. Under ADR-19 every one of those nine values is still returned
   and readable: `Outcome` and `ExecutionId` stay top-level, the other seven travel inside one
   `ProvenanceJson` object. Nothing is dropped, renamed in meaning, or made unreachable. What
   changes is packaging — how many wire properties carry the same information.

2. **The literal field-list reading is not merely inconvenient, it is impossible on a ratified
   target.** I verified the load-bearing fact in the authoritative registration contract
   (`deploy/registration/rule-engine-registration.json`): `EvaluateDecision` already declares
   `RuleVersionId` as a **request** input, and `CorrelationId` becomes one under FR-B4-01. On-prem
   Process Actions require argument names unique across inputs and outputs, and the A7 contract
   validator enforces the same. A same-named `RuleVersionId`/`CorrelationId` **response** property
   therefore cannot exist under the equally-ratified invariant "one semantic contract, two
   deployment targets, registration contract authoritative." When a literal reading of a field list
   collides with a ratified structural invariant, honouring the invariant while preserving all the
   semantic content **is** the faithful reading — not a deviation from it. `ExecutionId` stayed
   top-level precisely because it is *not* a request parameter and has no collision (line 162 of the
   contract); that is a consistent, deliberate call.

3. **The transport was expressly delegated to this ADR.** The CEO BRD decision's own "next workflow
   step" named "Architecture (an ADR for the `ContentHash` canonicalisation and the `Outcome`/error
   contract)." The sponsor ratified a list of values to expose, not a wire cardinality. Deciding the
   packaging is the ADR's job, which means treating it as a re-ratification trigger would contradict
   the delegation the sponsor already made.

4. **It reuses an already-ratified idiom, so consumers gain no new burden.** `EvaluateDecision`
   already returns `OutputsJson`, `ReasonCodesJson`, `TraceJson`, `DiagnosticsJson` and
   `ChildResultsJson` as JSON-valued String properties. A consumer already parses JSON out of String
   properties on this exact operation; `ProvenanceJson` is the same pattern, and it collapses eight
   contract registrations into one.

**Why a condition still attaches (AC-1):** a contract frozen for external consumers must be
unambiguous, and the *ratified BRD text* (FR-B4-02) still lists these as returned fields in a way a
reader could picture as separate top-level properties. So the BRD FR-B4-02 text must be updated to
describe the `ProvenanceJson` envelope, and the sponsor must be **notified** of the transport shape
(an FYI/acknowledgement, on the "recorded not silent" principle) — not asked to re-ratify. Holding
it as re-ratification would itself contradict points 3 above.

---

## Per-ADR decision

### ADR-19 — strict input contract, `Outcome`, provenance packaging — **APPROVED WITH CONDITIONS**

Faithful to MC-1 and MC-2. The strict-typing table matches FR-B2-04 row for row (JSON-number
decimals read via exact `TryGetDecimal`, never `double`; integral types reject fractions with
EDP063; booleans JSON-only; ISO-8601 dates/date-times; quoted numbers rejected with EDP062;
Lookup unsupported → EDP066). The `Outcome` factory design — `Outcome` is the source of truth and
`Success`/`Matched` are derived so a contradictory pair cannot be constructed — is exactly the
machine-readable discriminator MC-2 required, and the HTTP-400-only-for-malformed-envelope line is
drawn as ratified. Lenient rules keep today's behaviour (warnings only, no conversion, no refusal),
so backward compatibility (NFR-01, R-1) holds. The "already-typed values accepted as their own
type" rule correctly handles the record and rule-set-chaining paths where values are not JSON, which
is necessary for FR-B2-08 and the record path in FR-B2-07.

Two additive surfaces beyond the enumerated BRD contract require reconciliation (AC-2, AC-3):
- a new declared type **`Collection`** for quantified inputs in strict rules (with EDP066 when a
  quantifier runs over an input not declared `Collection`). This is the right way to honour "a
  collection never silently satisfies a scalar" (ratified) while keeping quantifier rules workable
  under strict mode — but `Collection` is not in the ratified type vocabulary (FR-B2-04) and it will
  surface to consumers through `GetInputSchema` (FR-B2-11) and the content hash (its `type` is
  hashed). It must be documented as an explicit, additive vocabulary member in the single
  type-vocabulary source of truth (IC-3), not smuggled in.
- three new codes **EDP068** (strict numeric literal not an exact decimal → validation), **EDP069**
  (declared-fact marker carrying a binding → breaks bound-xor-declared), **EDP071** (malformed
  supplied RuleKey → HTTP 400). EDP068/069 sit inside the "verified free 060–070" block, but
  **EDP071 sits outside it** — the BRD explicitly stated "all new codes sit in the free 060–070
  block," and EDP070 already consumes the top of that block. EDP071's free-code status was not
  verified. This is the same class of collision the v1.1 reconciliation caught with EDP064.

### ADR-20 — `ContentHash` canonical form — **APPROVED WITH CONDITIONS**

Faithful to MC-4 and §5.4a. The byte-sequence definition is serializer-independent as required;
numbers are made exact by string manipulation over the raw literal (never `double`), which is the
correct and, in fact, superior way to meet "one canonical number form" without a precision loss;
NFC, uniform `\u00xx` escapes, null-property dropping, UTF-16 ordinal key sort, and the
include/exclude boundary (executable content in — including `inputContract` and each input's type
declaration; identity/layout/timestamps out; `RuleKey` excluded so identical logic hashes
identically) all match CEO decision §13 and §5.4a. Two independent implementations (C#, TS) proven
against one shared vector file satisfy IC-3 and the "prove identical hashes across every
implementation" ratification. The six test vectors (a–f) exceed the ratified minimum of five and
add a decomposed-Unicode/non-canonical-number case that genuinely exercises NFC and number
canonicalisation — **the vector set is sufficient in design**; the populated
`contract/content-hash-vectors.json` with computed hashes remains a before-build deliverable
(FR-B4-06), which is correct.

One reconciliation (AC-4): ADR-20 §7 makes hashing a **total** function over well-formed JSON
numbers (only an exponent outside ±1000 is invalid), whereas the ratified BRD §5.4a item 7 still
says a literal "not exactly representable as a .NET decimal makes the rule invalid for hashing and
is rejected at validation." ADR-20's softening is the *right* call and matches the CEO's stated
intent that representability be enforced only at strict authoring (EDP068) "so legacy rules never
break" — but the two ratified/proposed texts now disagree. The §5.4a text must be reconciled to
ADR-20 (hashing total via string manipulation; representability enforced only at strict validation
via EDP068), and TC-3 replay must confirm no live rule's hash newly fails.

### ADR-21 — RuleKey identity and one resolver — **APPROVED**

The cleanest of the three, and complete. One `RuleIdentityResolver` replaces both unordered
`TopCount=1` sites and unifies the two divergent precedence orders into the single ratified
precedence (`RuleVersionId → RuleId → RuleKey → RuleName`), satisfying IC-1 (RuleServicePlugin
shrinks, does not grow) and FR-B3-08 (both sites). EDP070 (conflicting identifiers, 400), EDP071
(malformed key, 400, never normalised), deterministic name lookup with `nameIsAmbiguous`/`matchCount`,
designer-only key writing with a static CI check that no API/SDK/gateway writes the key, set-once-
while-empty for backfill, copy-clears-key, new-version-keeps-key, and reuse prevention via the
append-only delete audit — all match FR-B3-04/05/08/13/14/15/16 and HD-2/HD-5 precisely. The HD-9
Option-Y migration (deploy → backfill dry-run-by-default touching only the 14 named ids with a
"no unexpected records modified" report → three-gate verifier → create key → poll to `Active` →
re-prove uniqueness → only then declare supported) reproduces the ratified sequence and its
invariant faithfully, and is explicitly executed only under HD-3 authorisation.

One minor confirmation (AC-5): FR-B3-11 (the alternate key **and** its values travel with solution
export/import, so the same key addresses the same rule in every environment — the core of the D7
environment-independence promise) is not addressed in the ADR text. Confirm it is designed.

### dependencies.md DEP-014…018 — **APPROVED**

The BUILD decisions are correctly grounded. DEP-014 (RFC 8785 JCS ref impl → BUILD) is justified on
license/star/framework fit and, decisively, JCS's IEEE-754 number formatting conflicting with the
exact-decimal requirement — only the UTF-16 key-sort rule is taken from the RFC, the rest
deliberately built (~120 C# + ~150 TS), which is textbook PAT-004 (adopt point libraries, build the
engine). DEP-015 (JsonSchema.Net → BLOCKED→BUILD) is correctly blocked on the transitive
System.Text.Json 10.x requirement — the same net462 wall already documented for NCalc 6 and
Json.Logic 6 — and every EDP type needs custom keywords anyway. DEP-016 (Newtonsoft.Json.Schema →
REJECT, commercial licence), DEP-017 (ajv → not used; JS numbers are doubles at parse regardless),
and DEP-018 (SHA-256/NFC built-ins) are all sound. The BUILD introduces the two-parallel-
implementations risk this company was burned by before (GOT-019, the DFE dual type files); IC-3's
shared vector file plus parity check is the correct mitigation and is present in ADR-20.

---

## Conditions (numbered; tracked as milestone blockers, not branch blockers)

**AC-\*** below are architecture-gate conditions. They gate the milestone (build acceptance /
release), not the branch, per the house approve-with-conditions pattern (PAT-005). Record them in
`projects/state.yml` — there is still no Rule Engine entry there.

| ID | Condition | Type | Due |
|---|---|---|---|
| **AC-1** | Update BRD **FR-B4-02** to describe the `Outcome` + `ProvenanceJson` (+ top-level `ExecutionId`) response envelope, stating that the seven identity/provenance values travel inside `ProvenanceJson` and why (the on-prem argument-name uniqueness constraint). **Notify the sponsor** of this transport shape as an acknowledgement item (not a re-ratification). | Contract text + sponsor FYI | Before build completion |
| **AC-2** | Document the new declared type **`Collection`** as an explicit, additive member of the strict type vocabulary in the single source of truth (IC-3 / `contract/rule-engine-contract.json`), reconciled into BRD FR-B2-04 and FR-B2-10, and confirm its `type` declaration is covered by the ContentHash include-set and the content-hash test vectors. | Contract | Before build completion |
| **AC-3** | Register **EDP068, EDP069, EDP071** in the diagnostics catalogue and the registration contract (IC-2), and fold them into BRD FR-B2-05. **Verify EDP071 is a free code** — it falls outside the "060–070 block verified free" — and correct the BRD's "all new codes sit in the 060–070 block" statement accordingly. | Contract | Before build |
| **AC-4** | Reconcile **BRD §5.4a item 7** to ADR-20 §7: hashing is a total function via string manipulation (only exponent > ±1000 invalid); decimal-representability is enforced only at strict validation (EDP068), preserving "legacy rules never break." TC-3 replay must confirm no live rule's hash newly fails to compute. | Contract + Test | §5.4a before build; replay before release |
| **AC-5** | Confirm **FR-B3-11** is designed: the Dataverse alternate key and its key values are carried on solution export/import so the same key resolves the same rule in every environment (the D7 environment-independence promise). | Impl | During build |
| **AC-6** | All prior BRD-gate conditions carry forward unchanged and remain in force: **IC-1…IC-5** (extract resolver; reverse contract-vs-code CI check extended to every new B3/B4 param incl. `Outcome`, `ProvenanceJson`, `CorrelationId`, `RuleKey`, EDP071; single source of truth with parity check; publish-with-retry + read-back per **amended IC-4** = backfill/uniqueness AFTER deploy per HD-9; code-reviewer each step) and **TC-1…TC-4** (live-org non-admin round trip against the 1.1.0 package; adversarial type-safety incl. empty/vacuous-truth; release-blocking replay; §11 acceptance criteria). | Impl + Test | As previously scheduled |
| **AC-7** | No live deployment, live data or live schema change during source implementation. Every migration/Part-R live step needs its own explicit human authorisation (**HD-3**). PDPPL/data-residency (**HD-7**) and the on-prem runtime-validation track (**HD-8**) remain human-only gates; no ADR introduces new personal-data egress (InputsDigest stays removed; ContentHash hashes rule logic; CorrelationId is caller-owned). | Hard stop | Always |

---

## What I explicitly checked and accept

- **No ADR re-opens a ratified decision.** Each implements the contract; the additive surfaces
  (AC-1…AC-4) are refinements or forced resolutions, not reversals of anything the sponsor decided.
- **Backward compatibility is preserved** across all three ADRs: lenient rules unchanged, additive
  response properties, deterministic-not-arbitrary name lookup, RuleKey lookup inert until Active.
- **PDPPL posture is intact** (CMP-001, HD-7): 1.1.0 still persists no raw inputs and returns no
  input-derived value; no ADR adds a personal-data surface.
- **The Q1 collision is real**, verified against the authoritative registration contract, not taken
  on faith.

## Gate decision

**ARCHITECTURE GATE PASSED — APPROVE WITH CONDITIONS (recommendation; the sponsor's existing v1.1
ratification already authorises B1–B4 source implementation).**

- ADR-21 and DEP-014…018: approved as written.
- ADR-19 and ADR-20: approved, conditioned on AC-1…AC-4 (contract-text reconciliations folded in
  during build; AC-1 additionally a sponsor notification).
- Next workflow step per `new-feature.md`: Technical build proceeds under the amended conditions,
  each code-producing step followed by `code-reviewer`; then QA (TC-1…TC-4), then Audit, then the
  CEO final decision. No live migration or Part-R step is authorised by this document.
