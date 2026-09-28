# Rule Engine 1.1.0 Contract Enhancements — CEO Decision (BRD Approval Gate)

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-RE-ENH-001
**Phase:** BRD Approval Gate
**Date:** 2026-09-28
**BRD Reviewed:** `brd-edp-re-enh-001-release1-contract.md` **v1.0 DRAFT** (2026-09-27)
**Review baseline:** `docs/edp-re-enh-001-brd` @ `40c8c48d`, which merges `main` @ `4bfc1e71` (PR #168, A7 release engineering)
**Decision by:** MSS Technologies — CEO function

> ## ⚠️ SEPARATION-OF-DUTIES CAVEAT — this decision is a recommendation, not a ratification
>
> This decision was rendered by an agent, and the BRD under review was authored by the same agent
> that gathered its evidence — the author-approves-own-work pattern this very product forbids for
> rule versions (segregation of duties). It is recorded openly, exactly as it was for EDP-BIND-001
> and EDP-FACT-001.
>
> **This decision takes effect only when the human sponsor ratifies it.** No implementation, no
> live migration step, and no contract registration is authorised by this document alone. I do not
> claim ratification. Several conditions below (MC-1 to MC-4) change *Must* requirements in the
> BRD; the sponsor is therefore ratifying **the BRD as amended by those conditions**, not the draft
> as written.

---

## Decision

**APPROVE WITH CONDITIONS.**

The business case for the four contract properties (B1 declared facts, B2 typed/required inputs,
B3 stable RuleKey, B4 runtime provenance) is accepted. The **P1 scope — user stories US-01, US-02,
US-03** — is approved in principle as a coherent, shippable 1.1.0 contract, conditioned on the
mandatory changes in §4. **US-04 (P2) and US-05 (P3, per-member rule-set provenance) are deferred
out of the P1 slice.** `InputsDigest` is **removed from Release 1** (§12). No build, no live step,
and no contract registration is authorised until the sponsor ratifies this decision as amended.

This is not a rubber stamp. Four requirements defined as *Must* in the BRD are changed here, one is
removed, and the estimate and baseline statements must be corrected. The feature is right; the
contract it draws needs tightening before it is frozen for external consumers.

---

## Gate result (Article XVIII — run before approval)

```
$ bash .claude/scripts/gate-brd.sh projects/enterprise-decision-platform/brd-edp-re-enh-001-release1-contract.md
  [PASS] no unresolved clarification markers
  [PASS] prioritized user stories present
  [PASS] requirement IDs present
  [PASS] acceptance criteria present
  [PASS] requirements quality checklist section present
  [PASS] few vague quantifiers (0)
        → PASS (0 warn)
  BRDs with a hard block (unresolved clarifications): 0
  EXIT: 0
```

**The mechanical gate passes cleanly with zero warnings.** That raises the floor; it does not
substitute for judgment. The gate cannot detect a requirement that is *confidently wrong* rather
than *visibly uncertain* — and the numeric-representation clause (FR-B2-04), the failure contract
(FR-B2-06) and `InputsDigest` (FR-B4-04) are exactly that: fluent prose hiding an unresolved
decision. Those are what §4 addresses.

---

## 1. Rationale

The case is accepted, and it is stronger than a normal enhancement because two of the four gaps are
**correctness defects wearing the costume of missing features**, independently verified in code at
the review baseline:

- `"abc" > 5000` evaluates to a **HIT with no diagnostic** (`RuntimeValue.cs:137-138`: a decimal
  parse of `"abc"` fails, so the comparison falls back to ordinal string compare; `'a'` > `'5'` →
  positive → true). A rule engine that silently returns the wrong decision under a type confusion
  is not a stable contract at all. B2 fixes this.
- Rule lookup by display name uses `TopCount=1` with **no ordering** (`RuleServicePlugin.cs:541-549`,
  `ResolveRuleId`), and the sandbox already holds duplicate display names (5× "All Node Types —
  Sample", 2× "Two-Stage Gov Test"). A consumer that addresses a rule by name today gets an
  arbitrary match. B3 fixes this.

The other two close the same class of gap EDP-BIND-001 and EDP-FACT-001 closed: the platform's
whole differentiator is a **governed, replayable, explainable decision**. A caller who cannot
author over an assembled fact (B1), or cannot record from the response exactly which rule content
and which inputs produced a decision (B4), holds a decision they cannot prove or reproduce — the
governed trail has a hole in it precisely where an external integration needs it most.

Consumer-neutrality — the premise of the entire assessment — is **verified clean in code**. A
full-tree search for `dcp`, `debt`, `collection-agency`, `loan`, `credit`, `insurance`,
`mortgage`, `qdb_dcp` found no product coupling anywhere in `runtime/src`, `sdk`, or `gateway`.
The only domain-flavoured tokens are two `e.g. "qdb_collateral"` / `"qdb_loanapplicationid"`
illustration strings inside XML doc comments (cosmetic; IC-5). No requirement in the BRD names,
serves, or is shaped by a single consumer. The assessment being *triggered* by a prospective
debt-collection consumer has not contaminated the contract.

**What holds this back from an unconditional approval:** the contract this BRD freezes for external
consumers still carries three under-specified decisions and one unsafe one. A contract is the one
artifact you cannot cheaply change after consumers integrate against it. Getting the numeric
semantics, the failure discriminator, the digest, and the content-hash canonicalisation exactly
right *before* they are published is worth a bounded revision now.

## 2. Approved scope (conditioned on §4)

| Item | Approved as | Note |
|---|---|---|
| **B1 — declared facts** (FR-B1-01..09) | **Approved** | §5 decision. Live `tier` rule stays compatible (verified). |
| **B2 — typed/required inputs** (FR-B2-01..12) | **Approved, amended** | §6, §7, §8 decisions change FR-B2-04, FR-B2-06. |
| **B3 — stable RuleKey** (FR-B3-01..12) | **Approved, amended** | §9, §10 decisions add clone/reuse/Active-key rules. |
| **B4 — runtime provenance** (FR-B4-01..03, 06) | **Approved, reduced** | §11 decision. `CorrelationId`, `ContentHash`, identity fields, `EvaluatedOnUtc`, `ExecutionId` retained. |
| **P1 MVP = US-01 + US-02 + US-03** | **Approved as the shippable slice** | Independently testable; delivers the whole 1.1.0 contract. |

## 3. Rejected / deferred scope

| Item | Disposition |
|---|---|
| **`InputsDigest`** (FR-B4-04, and its entry in FR-B4-02) | **Removed from Release 1.** See §12. Reintroducible only as a keyed HMAC under an ADR if a concrete need is later stated. |
| **US-05 / FR-B4-05** — per-member rule-set provenance | **Deferred out of the P1 slice.** *Should*/P3 already; not required for a safe generic contract. May land in a later R1 increment or R2 at the sponsor's discretion — not in the approved MVP. |
| **US-04 / FR-B2-03** — moving an existing rule to strict | Confirmed **P2**, not part of the P1 MVP; the capability may build with B2, but is not gated as MVP. |
| A3 published-version immutability; persisted provenance + retention; mixed `TargetRef`+`InputsJson` (A1b); ruleset key/versioning (A2b); on-prem runtime validation | **Confirmed Release 2 / separate track**, as BRD §10. Boundary accepted (§15). |
| **Part R (A7, A6)** | **Not gated by this BRD.** A7 is already merged (see §14) and is governed by `release.md` + per-step human authorisation. This decision neither approves nor blocks it. |

## 4. Mandatory conditions

Tracked as numbered blockers per the house pattern (record in `projects/state.yml` — there is no
Rule Engine entry there today). **MC-\*** change the BRD contract and must be folded into the BRD
text and re-confirmed at ratification. **IC-\*** and **TC-\*** gate the milestone, not the branch.

| ID | Condition | Type | Due |
|---|---|---|---|
| **MC-1** | Rewrite FR-B2-04 to **Option A (strict JSON typing)** per §7. Numeric facts must be JSON numbers, not quoted strings; decimals parsed directly to `System.Decimal` (never via `double`); booleans JSON `true`/`false` only; Date/DateTime the specified ISO-8601 strings. | Contract | Before ratification |
| **MC-2** | Rewrite FR-B2-06 to add an explicit machine-readable **`Outcome`** discriminator on the response per §8, distinguishing `NO_MATCH` vs `INPUT_REJECTED` vs `ENGINE_ERROR` (matched → `MATCHED`), and draw the HTTP-400 vs HTTP-200 line explicitly. | Contract | Before ratification |
| **MC-3** | **Remove `InputsDigest`** from FR-B4-02/FR-B4-04 for Release 1 per §12. State that caller-supplied `CorrelationId` serves correlation, and that any future server-computed input fingerprint is HMAC-only under an ADR. | Contract | Before ratification |
| **MC-4** | Replace the one-line FR-B4-03 with a **precise, serializer-independent canonicalisation specification** for `ContentHash` and a **published multi-case test-vector set** per §13, both settled before build. | Contract | Before ratification (spec); before build (vectors) |
| **MC-5** | Correct the BRD's stale **baseline** (`335a488f`) and **estimate** (§14, §16). State that A7 (§12 Part R, 8.0 h) is already merged and dry-run-verified, so it is not pending Release-1 engineering; present the net-new engineering this BRD authorises. | Accuracy | Before ratification |
| **IC-1** | Do not enlarge `RuleServicePlugin.cs` (already exactly 635 lines, single class, ten-operation switch, embedded `ResolveRuleId`/`PublishedCandidates`/`ParseMembers`). **Extract identifier/key resolution** into a dedicated resolver; the RuleKey branch lands there, not in the plugin. | Impl | During build |
| **IC-2** | The registration contract (`rule-engine-registration.json`) stays the single authoritative source. **Extend the reverse contract-vs-code CI check** (the one that would have caught `ExecutionId`) to every new B3/B4 parameter (`RuleKey`, `CorrelationId`, `ContentHash`, `EvaluatedOnUtc`, `Outcome`, identity fields). | Impl | During build |
| **IC-3** | The type vocabulary and the `ContentHash` canonicalisation each have **one source of truth** shared across runtime/designer/SDK, with a parity check (cf. the DFE shared-type-sync lesson). No duplicated schema definitions. | Impl | During build |
| **IC-4** | Every live metadata/publish step uses **publish-with-retry** and is verified by reading back the registration — never by a piped `grep` (a failed publish exits 0). Any target org (incl. on-prem) must have the B3/B4 metadata registered, and for RuleKey the alternate key created **and** backfilled, **before** the 1.1.0 runtime is pointed at it. | Impl | Each live step |
| **IC-5** | `code-reviewer` after every code-producing step (NFR-06). Cosmetic: clean up the two `e.g. "qdb_..."` example strings in `PcrmModels.cs` comments and the "seven Custom API messages" doc-drift in `RuleServicePlugin.cs` (handles ten). | Impl | During build |
| **TC-1** | Acceptance evidence is a **live-org round trip with pasted output**, proven **against the 1.1.0 package** (not the stale 1.0.23 signed assembly — the org is mixed and the designer's Test path can serve the old build), and as a **non-administrator** where security context matters. Test-suite green is necessary, never sufficient. | Test | Before completion |
| **TC-2** | Adversarial type-safety suite proving a strict rule **never** falls back to text compare (FR-B2-09): feed `"abc"`, `"5000"` (string), `"1e3"`, decimal-overflow, `"31/12/2026"`, `2.5` for WholeNumber, and empty/null — each must reject with the correct EDP06x and **zero matches**. Include the empty-collection / empty-input vacuous-truth edge (a strict rule must not pass vacuously). | Test | Before release |
| **TC-3** | Backward-compat replay (§11-9): every live rule version replayed with recorded inputs yields identical outputs to the pre-upgrade engine, except the documented A6 array-membership cases. Release-blocking. | Test | Before release |
| **TC-4** | Update BRD §11 acceptance criteria to match this decision: Option-A rejection of quoted numbers; assert the `Outcome` discriminator; remove `InputsDigest` from AC-8; expand the `ContentHash` vector assertions per MC-4. | Test | Before build |

## 5. B1 decision — declared facts

**Approved.** The model is sound and the compatibility claim is verified: `PcrmInput.Binding` is
nullable (`PcrmModels.cs:35`) and the validator already skips unbound inputs
(`RuleValidator.cs:64`), so an unbound input *is* a declared fact by construction, and the live
chained `tier` rule keeps evaluating exactly as today (FR-B1-02).

The value-source precedence is approved as stated: **(1) caller `InputsJson`; (2) upstream
rule-set member output of the same name; (3) otherwise null. A declared fact is never read from the
target record.**

On the ambiguity the review flagged — record-bound vs caller-supplied — the decisive point is
verified real: `BuildInputs` currently falls back to the input's *name* as a target attribute name
(`RuleDecisionService.cs:229-232`), so an unbound input silently binds to whatever attribute
happens to share its name. FR-B1-04 removes that latent wrong-column behaviour, which is correct.
**Condition on B1:**

- The BRD must state the disambiguation rule explicitly: **within Release 1 an input is either
  bound (record) or declared (caller/upstream), never both.** Where a declared fact's name
  coincides with a real attribute on the target, the declared fact wins and the column is never
  read. (Mixed overlay is A1b, Release 2.)
- The FR-B1-04 behaviour change (reads null instead of the coincidentally-named column) is accepted
  because the live baseline has no such rule (`account.tier` 404, verified). Because the org is
  shared and rules can be authored before deploy, **re-verify at deploy time** that no rule in the
  target org relies on the old attribute-name coincidence (folds into IC-4).

## 6. B2 decision — deterministic legacy/strict compatibility

**Approved with one clarification.** The LEGACY/STRICT split is deterministic and heuristic-free,
which is exactly right. To close a latent ambiguity between the BRD's `inputContract` field and the
review's `schemaVersion` framing, I rule:

- **Strictness is determined solely by an explicit `inputContract: "strict"` on the rule.** Absent
  or `"lenient"` → lenient. This is the single determinant; there are not two independent flags that
  can disagree.
- The designer, when it writes a new strict rule, **also stamps `schemaVersion "1.1"`** so the two
  travel together. A rule carrying `schemaVersion "1.0"` **and** `inputContract "strict"` is a
  contradictory artifact and must be rejected with a diagnostic — it must never be silently coerced
  either way.
- All 14 live rules are `schemaVersion "1.0"` with no `inputContract` → lenient, evaluate exactly as
  today (D4, verified). Confirmed.

## 7. Strict numeric representation decision — **OPTION A (strict JSON typing)**

This is the crux of the whole feature, and the central requirement decides it: *a strict rule must
never silently evaluate a value under the wrong semantic type.*

**Ruling: Option A. The BRD's Option-B hybrid (FR-B2-04, "numeric string in invariant culture")
is rejected and must be rewritten (MC-1).**

Reasoning: every accepted string syntax is a surface on which two independent systems can disagree,
and the BRD's "invariant-culture numeric string" is itself under-specified — it says nothing about
leading/trailing whitespace, sign, thousands separators, exponent notation (`1e3`), overflow, or
decimal precision/rounding. That is precisely the confidently-worded ambiguity the mechanical gate
cannot catch. A **new, opt-in** strict contract has no backward-compatibility reason to accept
quoted numbers; the caller controls `InputsJson` entirely and can emit `{"amount": 5000}` as
easily as `{"amount": "5000"}`. Option A carries the type in JSON itself, so no parsing judgement
is ever made.

Required specification for MC-1:

| Declared type | Accepted (strict) | Rejected → code |
|---|---|---|
| Text | JSON string | non-string → EDP062 |
| Decimal, Currency | JSON **number**, read directly to `System.Decimal` via the raw token (**never** through `double`); reject out-of-`decimal`-range | quoted string, non-number, overflow → EDP062 |
| WholeNumber | JSON **number** with no fractional part, fits `Int64` | fractional → EDP063; quoted/overflow → EDP062 |
| Boolean | JSON `true` / `false` only | `"true"`, `1`, `0` → EDP062 |
| Choice / OptionSet | JSON **integer** (no fractional part), fits `Int64` | quoted / fractional → EDP063/EDP062 |
| Date | ISO-8601 `YYYY-MM-DD` (string; JSON has no date type) | any other form incl. `31/12/2026` → EDP062 |
| DateTime | ISO-8601 with offset or `Z` (string) | otherwise → EDP062 |
| Lookup / reference | Out of scope for strict typing in R1 unless the BRD names a concrete need; if kept, specify the exact accepted shape (GUID string) | — |

Missing required → EDP060; null where `nullable:false` → EDP061; extra unexpected input → tolerated
(additive, ignored) but should be reported as EDP064 Info; arrays where a scalar type is declared →
EDP062. Retrieval collections and quantifier element fields remain outside this mechanism
(FR-B2-10), governed by EDP050-055. In strict mode, validated values are converted to their
declared type before evaluation (FR-B2-09), so no strict comparison can reach the ordinal-string
fallback.

## 8. Error-semantics decision — explicit `Outcome` discriminator (do not ship the ambiguous shape)

**The BRD's FR-B2-06 failure shape is rejected as ambiguous and must be rewritten (MC-2).** As
drafted, a strict input rejection returns `Success=false, Matched=false, empty outputs +
diagnostics` — **byte-identical to an engine/runtime failure**. A consumer cannot tell "your input
was bad, fix it and retry" (caller's fault) from "the engine broke" (our fault) from "the rule ran
and simply did not match" (business result). That is an unbuildable retry/routing contract.

**Ruling:** add an explicit, machine-readable **`Outcome`** field to the `EvaluateDecision`
response, additive (NFR-03 preserved), as the authoritative discriminator:

| Outcome | Meaning | Transport |
|---|---|---|
| `MATCHED` | rule evaluated, matched | HTTP 200 |
| `NO_MATCH` | rule evaluated, did not match (today's `Success=true`/`Matched=false`) | HTTP 200 |
| `INPUT_REJECTED` | well-formed request; input failed the rule's strict contract (EDP060-063) | **HTTP 200** |
| `ENGINE_ERROR` | runtime/engine failure | HTTP 200 with diagnostic (engine's existing convention) |

The existing `Success`/`Matched` booleans are retained for compatibility, but `Outcome` is the
field consumers branch on. A strict input rejection is a **first-class business result, not a
malformed request**, so it stays HTTP 200 with `Outcome=INPUT_REJECTED` (consistent with the house
rule "a refusal is HTTP 200 with an errorCode") — and it surfaces the same `rejected` outcome the
BRD already writes to the execution log, in the **response**, not only the log. Reserve **HTTP 400
for a malformed request envelope only** (unparseable `InputsJson`, missing mandatory API
parameters). MC-2 must draw this line explicitly.

## 9. B3 decision — stable RuleKey

**Approved**, with additions. Format `^[a-z0-9]+([._-][a-z0-9]+)*$`, 3-100 chars, lower-case,
dot-namespaced; no GUIDs/dates/environment names. Precedence `RuleVersionId → RuleId → RuleKey →
RuleName`, conflict → EDP070. Name lookup stays supported and becomes **deterministic** (earliest
`createdon`, then id) with `nameIsAmbiguous`/`matchCount` — the fix lands at `ResolveRuleId`
(`RuleServicePlugin.cs:541-549`), the verified unordered `TopCount=1` site (note: the
`EffectiveVersionResolver` already orders correctly; the BRD §2 should attribute the defect to
`ResolveRuleId` specifically). The EDP060-070 code block is verified free (highest in use EDP055).

**Conditions the BRD must add:**

- **Case:** the validator **rejects** any non-lower-case key at write time (never silently
  normalises), so a stored key always matches its lookup exactly. Uniqueness is therefore
  case-insensitive by construction.
- **Reuse after deletion/retirement:** a deleted rule's key **must not be reused** — an external
  consumer may still hold it, and reuse would silently redirect them to a different rule. State this
  as policy in R1 (enforced technically when Release-2 server-side enforcement lands).
- **Cloning:** the designer's clone/copy operation **must force a new key** (never copy the
  source's), or the save fails on the alternate key. The BRD is silent on clone; it must not be.

## 10. RuleKey format / migration decision

**Approved.** Format as §9. Migration sequence (BRD §9): register params → backfill the 14 approved
keys → create the alternate key **after** backfill → deploy. This correctly sidesteps how Dataverse
treats nulls in alternate keys, and there is **no window where a published rule becomes unusable**:
ID and name lookup work throughout, RuleKey lookup is additive, and the alternate key is inert until
values exist. Rollback at each step is clean (key + values inert if unused; R-5).

**Conditions:**

- Before creating the alternate key, verify **completeness** (all rules keyed), **format
  compliance**, and **case-insensitive uniqueness** on every rule — all three as explicit gates
  (§11-6 covers uniqueness; add the other two).
- **Declare RuleKey lookup supported only after the alternate key's status is `Active`** (the
  index-build system job has completed), verified by a live GET. Do not announce the capability
  while the key is still `Pending`.
- **Appendix A:** the mapping *principle* is approved — distinct keys, no rename/retire of any rule
  (D7), purpose-based keys, duplicates distinguished by deterministic creation order. The actual key
  **strings** are the sponsor's to confirm before backfill (CEO-2 / S-1). The three orphaned
  versions legitimately cannot receive keys (no parent rule). Server-side key immutability is
  Release 2; in R1 the alternate key prevents collisions but a direct API write could still change a
  key — recorded as an **accepted residual risk** (§15) the sponsor must acknowledge, with an
  operational control that direct key writes are restricted.

## 11. B4 decision — runtime provenance

**Approved, reduced.** `EvaluateDecision` returns, additively: `ExecutionId`, `RuleId`, `RuleKey`,
`RuleVersionId`, `VersionNumber`, `ContentHash`, `EvaluatedOnUtc`, `CorrelationId`; accepts optional
`CorrelationId` (echoed verbatim). Rule-set per-member provenance (FR-B4-05) is **deferred out of
P1** (§3). `ResolveEffectiveVersion` returns identity/resolution metadata only. Caller-owned
business provenance stays outside the engine. This is genuinely valuable for audit and integration
and is approved.

Two verified caveats the BRD must reflect:

- `ExecutionId` is the **execution-log record id**, and it is **empty when the best-effort trace is
  dropped** (`EvaluateDecisionPlugin.cs:68`). It is therefore not a reliable sole correlation key —
  another reason the caller-supplied `CorrelationId` (FR-B4-01) matters and is retained.
- `InputsDigest` is **removed** (§12) — see MC-3.

## 12. `InputsDigest` security decision — **omit from Release 1**

**Determine the purpose first — and the BRD has not actually stated one.** FR-B4-04 calls it an
"input fingerprint" but never says what it is *for* (correlation? integrity? audit identity?). That
unstated purpose is itself the defect.

**The plain-SHA-256 proposal is rejected as unsafe.** Decision facts are low-entropy and sensitive:
age, risk band, salary band, status code, small amounts, flags, categories. An attacker holding the
digest can **brute-force the preimage** by enumerating the small cross-product of possible inputs
and hashing each — plain SHA-256 offers *zero* protection for low-entropy data. On a PDPPL-regulated
banking client, a trivially-reversible digest of personal/financial attributes is a data-protection
liability, not a safeguard; it is arguably personal data itself, which would quietly undermine the
BRD's own "1.1.0 stores no raw inputs" claim (W0-5). (Independently, reusing `SnapshotDigest` would
also bake in its `clock=` prefix, `SnapshotDigest.cs:35`, so it would not even be input-deterministic
— the BRD knows this, but it is the secondary problem.)

**Specific recommendation:**

1. **Drop `InputsDigest` from the Release 1 response contract** (MC-3). The approved P1 stories do
   not depend on it; no acceptance criterion needs it once AC-8 is corrected to `ContentHash` only.
2. The **correlation/dedup** purpose is already served by the caller-supplied, engine-echoed
   **`CorrelationId`**, which puts the sensitivity and idempotency decision where it belongs — with
   the caller who owns the data and knows its sensitivity.
3. **Do not introduce secret management** for this. An HMAC-SHA-256 with an environment-managed
   secret would defeat brute-force, but it adds key custody/rotation (against a backdrop of an
   already-unrotated secret, SEC-01, and a month-long SNK-rotation blocker), and a per-environment
   key breaks the cross-environment correlation the digest was meant to give. The value does not
   justify the burden today. **If** the sponsor later states a concrete need for a server-computed
   input fingerprint (e.g. tamper-evidence over the input set, analogous to FACT-001 FR-F34's
   permanent result-set digest), it may return **only** as a keyed **HMAC-SHA-256** whose custody,
   provisioning and rotation are specified in an ADR under the W0-5 / SEC-01 regime — a **Release 2**
   decision, never a Release 1 default.

## 13. `ContentHash` decision (incl. canonicalisation + test vectors)

**Approved** — and here plain SHA-256 is appropriate, because `ContentHash` hashes **rule logic**
(the executed PCRM), not personal data: the concern is integrity/identity, not confidentiality, so
the low-entropy reversibility problem does not apply. Persisting it on the rule version stays
Release 2 (BRD §10); in R1 it is computed at evaluation and returned, always present including for
ad-hoc `PcrmJson` calls.

But its entire value is that a consumer can **independently recompute** it and get the same hash.
FR-B4-03 as drafted is one sentence and specifies nothing, so a consumer's recompute would diverge —
worse than useless, it would false-signal tampering. **MC-4 requires a precise, serializer-independent
canonicalisation spec settled before build:**

- Property ordering: recursively sorted by key, ordinal.
- Whitespace: none (compact). Encoding: UTF-8, no BOM. Defined as a **byte sequence**, not "whatever
  `System.Text.Json` emits", so any language reproduces it.
- Numbers: one canonical form (e.g. shortest round-trip decimal; define trailing-zero and
  exponent handling). Strings: Unicode NFC.
- **Include** executable semantics: conditions, operators, values, outputs, input declarations
  **with** their `type`/`required`/`nullable` and the rule's `inputContract`, and rule-set membership
  semantics. **Exclude** non-executable metadata: display name, GUIDs, `RuleKey`, `VersionNumber`,
  `schemaVersion`, created/modified stamps, comments, designer layout/coordinates.
  - Rationale for two boundary calls: `inputContract`/type declarations **are** included because
    they change how the rule evaluates; `RuleKey` is **excluded** so two rules with identical logic
    hash identically (duplicate-logic detection is a feature, not a bug).
- **Published test vectors** (required): at minimum (a) a minimal rule; (b) a rule exercising every
  input type; (c) the same rule with reordered properties, which must hash **identically** to (b);
  (d) a strict vs lenient variant, which must hash **differently**; (e) an ad-hoc `PcrmJson` call.
  These ship with the algorithm doc and are asserted in CI (TC-4).

## 14. Cloud / On-Prem decision

**Approved: one semantic contract, two deployment targets.** Cloud = plug-in package (ADR-18,
accepted). On-prem = ILRepack signed assembly + the manifest generated from the authoritative
contract. **No on-prem runtime claim may be made** — the manifest is generated and paper-parity
only; status stays "Compatible by Design — Runtime Validation Pending" until run on a real on-prem
org (a separate, ~4 h, blocked track). The B1-B4 contract must not be described as "delivered
on-prem" in any release note or status until then.

Per company knowledge (CMP-001, and the Report Engine `qdb_compositionmode` lesson), **any target
org — including on-prem — must have the B3/B4 metadata registered, and for RuleKey the alternate key
created and backfilled, before the 1.1.0 runtime is pointed at it**, or every affected report/run
breaks (IC-4).

Note (MC-5): **A7 is already merged into `main` (`4bfc1e71`, PR #168)** and dry-run-verified
read-only; the authoritative contract already declares `ExecutionId`/`ChildResultsJson`/
`ChildCollectionName`, and `Microsoft.PowerApps.MSBuild.Plugin` is now pinned (1.52.1). The BRD's
stated baseline `335a488f` predates this. A7's remaining work is **live execution, gated by
`release.md` + per-step human authorisation** — not Release-1 engineering.

## 15. Release 1 vs Release 2 boundary

The boundary is well-drawn, and I have **tightened R1**, not expanded it: `InputsDigest` removed
(§12), US-05 deferred (§3). Everything remaining in B1-B4 is necessary for a safe, business-
maintainable generic contract — no further scope creep found. The R2 line (A3 immutability,
persisted provenance + retention, A1b mixed inputs, A2b ruleset key/versioning, on-prem validation)
is confirmed as BRD §10.

**One accepted residual risk on the boundary:** server-side RuleKey immutability is R2, so in R1 a
direct API write could change a key that the alternate key does not itself freeze. Accepted for R1
with the operational control in §9; the sponsor should note it. If pulling server-side immutability
forward into B3 is cheap, prefer that — otherwise the residual is accepted.

## 16. Implementation conditions

IC-1 (extract identifier/key resolution — do not grow the 635-line `RuleServicePlugin`), IC-2
(reverse contract-vs-code CI check extended to all new params), IC-3 (single source of truth for the
type vocabulary and canonicalisation, with a parity check), IC-4 (publish-with-retry, read-back
verification, per-org provisioning before re-point), IC-5 (`code-reviewer` each step; cosmetic
comment/doc cleanup). See §4 table.

## 17. Testing / acceptance conditions

TC-1 (live-org round trip against the 1.1.0 package, non-admin where security matters — test-green
is never sufficient), TC-2 (adversarial type-safety incl. the empty/vacuous-truth edge), TC-3
(backward-compat replay, release-blocking), TC-4 (§11 acceptance criteria updated to this decision).
See §4 table.

## 18. Remaining human decisions

| # | Decision | Owner |
|---|---|---|
| HD-1 | **Ratify this decision** (SoD — a human, not the authoring agent). It takes effect only on ratification; nothing is authorised until then. The sponsor ratifies the **BRD as amended by MC-1..MC-5**. | Human sponsor |
| HD-2 | Confirm the RuleKey format (FR-B3-02) and the **actual Appendix A key strings** before backfill (CEO-2). | Sponsor + CEO |
| HD-3 | Authorise, individually and at the time, **each §9 migration step and each Part R / A7 live step** (S-1; `release.md` CEO ship decision + per-step go-ahead). | Sponsor |
| HD-4 | Decide whether a server-computed input fingerprint is ever needed → HMAC-under-ADR in R2, or never (§12). | Sponsor |
| HD-5 | Acknowledge the R1 residual: **RuleKey immutability is not server-enforced in R1** (§15). | Sponsor |
| HD-6 | Whether/when to schedule the non-blocking F2 review follow-ups FU-1..FU-4 (out of this scope). | Sponsor |
| HD-7 | **W0-5 PDPPL / data residency** remains a human-only production gate (1.1.0 persists no raw inputs, which keeps it out of the way for this contract, but it still blocks any production release on the regulated client). | Sponsor / Auditor |
| HD-8 | Authorise the separate on-prem runtime-validation track (§14). | Sponsor |

---

## Gate decision

**BRD APPROVED WITH CONDITIONS — recommendation pending human ratification.**

- **P1 scope (US-01, US-02, US-03 → B1, B2, B3, B4-minus-InputsDigest)** is approved in principle.
- **MC-1..MC-5 must be folded into the BRD, and the sponsor ratifies the amended BRD**, before any
  build begins.
- Next workflow step per `.claude/workflows/new-feature.md`, on ratification: `github-researcher`
  (adopt-over-build — canonical JSON / hashing and JSON-type validation are well-trodden ground)
  before any implementation, then Architecture (an ADR for the `ContentHash` canonicalisation and
  the `Outcome`/error contract), returning for review.
- **No implementation, no contract registration, and no live migration or Part R step is authorised
  by this document.**
