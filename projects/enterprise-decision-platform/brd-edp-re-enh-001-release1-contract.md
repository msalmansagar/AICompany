# Enterprise Decision Platform: Rule Engine 1.1.0 Contract Enhancements

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-RE-ENH-001
**Phase:** Business Requirements Document (BRD)
**Module in focus:** Rule Engine runtime contract: inputs, identity, provenance
**Prepared by:** MSS Technologies, Business Analyst
**Date:** 2026-09-27
**Version:** 1.0, DRAFT
**Status:** **AWAITING CEO APPROVAL. BRD gate OPEN. Implementation is BLOCKED.** Nothing in §5 may be built until a CEO-function decision is recorded in `ceo-decision-edp-re-enh-001.md` **and ratified by the human sponsor**.

**Development baseline:** `main` @ `335a488f` (Rule Engine 1.1.0 development baseline: F2a #105 + F2b #107 merged, ADR-18 accepted via #104). Code is byte-identical to `581d0592`, which passed the full regression (§11).

**References:** ADR-13 (two-tier write path) · ADR-16/17 (collections, per-child verdicts) · ADR-18 (packaging, **Accepted** 2026-09-27) · `brd-edp-fact-001-declarative-fact-assembly.md` (ratified) · `architecture-edp-fact-bind-joint.md` · `change-note-edp-dsn-002.md`

**Origin:** a read-only capability assessment by a prospective consumer found the Engine fit for purpose at runtime but missing four generic contract properties. **This BRD is consumer-neutral.** No requirement here names, serves or is shaped by a single consumer.

**Governance (exactly as the repository establishes it):**
- **Repository gate.** CLAUDE.md, "Default behavior" table, row "Capability that changes what the system promises" → `new-feature.md` → gate "BRD, CEO-approved". `.claude/workflows/new-feature.md`, Phase 1: "CEO approval — hard stop". The "CEO" named there is the repository's `ceo` role (`.claude/agents/ceo.md`, "MSS Technologies — CEO function"), which must run `.claude/scripts/gate-brd.sh` before approving (Article XVIII).
- **Engagement precedent.** EDP-BIND-001 and EDP-FACT-001 treated a CEO-function decision as a recommendation that takes effect only when **ratified by the human sponsor**, because the author and the evidence-gatherer are the same agent. This BRD follows that precedent.
- **Not established by this repository:** any QDB organisational approval authority. None is claimed or implied.

---

## 0. Sponsor design directions already given (2026-09-27)

These bind the requirements below. They are directions, not approval of this BRD.

| # | Direction | Where it lands |
|---|---|---|
| **D4** | Strict typed/required input validation for **new** rules. Existing rules stay lenient until explicitly migrated. No silent change to existing behaviour | §5.2 |
| **D7** | `qdb_edp_rulekey` is the stable integration identity: unique, environment-independent, not a GUID, not dependent on display-name uniqueness, suitable for external consumers. **Do not rename or retire rules because their display names duplicate.** Display name and identity are separate concepts. No live backfill yet | §5.3, Appendix A |
| **D9** | Follow CLAUDE.md governance: this BRD, then CEO approval, then build | this document |
| **D10** | ADR-18 accepted after re-verification on the baseline | done; see ADR-18 |

---

## 1. Executive summary

Four gaps stop the Engine from being a stable contract for external consumers:

- A caller cannot author a rule over a fact that is not a Dataverse column, although the runtime already evaluates one.
- A wrong-typed input silently produces a valid-looking answer. `"abc" > 5000` matches (verified locally on the baseline).
- Rules can only be addressed by GUID or by a display name that is not unique. Name lookup picks an arbitrary match, and the sandbox already has duplicates.
- A decision's response does not say exactly which rule content and which inputs produced it.

This BRD specifies four additive contract changes (B1 to B4) that close these gaps **without changing how any existing rule evaluates.** Separately scheduled release work (Part R) puts already-fixed code into the org and aligns the assembly.

## 2. Problem statement (evidence verified 2026-09-27)

| Gap | Evidence |
|---|---|
| Declared facts not authorable | `PcrmInput.Binding` is nullable and the validator skips unbound inputs (`RuleValidator.cs:61`). A local run evaluates an unbound input correctly. The designer emits a binding on every path (`toPcrm.ts`). The schema API reports `binding = Binding ?? Name`, so bound and unbound look identical. One live Published rule (`Demo — Underwriting Decision (chained)`) already declares an unbound input `tier`, fed by rule-set chaining |
| Silent type coercion | `RuntimeValue.Compare` falls back to ordinal string comparison. `"abc" > 5000` gives HIT with no diagnostic. A missing input is null, so the rule silently fails to match. `PcrmInput.Type` exists and is ignored at runtime |
| No stable identity | `qdb_edp_rulekey` (String 100) exists, is null on all 14 rules, has no alternate key, and nothing writes it. `GetPublishedVersion` / `ResolveEffectiveVersion` resolve `RuleName` with `TopCount=1` and no ordering. Duplicate names exist (5 + 2) |
| No provenance in the response | EvaluateDecision returns `Success, Matched, OutputsJson, ReasonCodesJson, TraceJson, DiagnosticsJson, ElapsedMs`. No rule identity, version number, content fingerprint or input fingerprint. `ExecutionId` is coded but its response property is not registered |

## 3. Business objectives

1. Any consumer can integrate against a **rule key**, not a GUID or a display name.
2. Any consumer can pass assembled facts and have the Engine **refuse** malformed input explicitly on new rules.
3. Any consumer can record, from the response alone, **exactly what decided**: rule, version, content and inputs.
4. Business authors can declare and test such facts **in the designer**, without API seeding.
5. No existing rule, API caller or designer workflow breaks.

## 4. Stakeholders

| Role | Interest |
|---|---|
| CEO | Approves this BRD (gate) |
| Human sponsor | Directions D4, D7, D9, D10; authorises every live step |
| Rule authors (business) | B1, B2 in the designer |
| Integrating consumers (any) | B2, B3, B4 runtime contract |
| Platform operators | Part R deployment |

## 4a. Prioritized user stories

Each story is independently testable against the §5 requirements it names.

### US-01: An integrating system addresses a rule by key and records what decided (Priority: P1)
**Why P1:** without a stable identity and provenance, no consumer can integrate safely.
**Covers:** B3, B4.
**Independent test:** resolve a rule by `RuleKey` through `ResolveEffectiveVersion`, evaluate it, and recompute `ContentHash` from the stored PCRM.
**Acceptance:**
- AC-1: Given two rules with the same display name and different keys, when resolved by key, then the same version is returned every time (§11-6).
- AC-2: Given any evaluation, then the response carries the B4 fields and `ContentHash` matches the published test vector method (§11-8).

### US-02: A strict rule refuses malformed input instead of guessing (Priority: P1)
**Why P1:** a silent wrong decision is worse than a refusal (`"abc" > 5000` matches today).
**Covers:** B2.
**Independent test:** evaluate a strict rule with each malformed input in §11-2.
**Acceptance:**
- AC-1: Given `"abc"` for a Decimal input on a strict rule, then `Success=false`, `Matched=false`, EDP062.
- AC-2: Given a missing required fact that a retrieval filter depends on, then EDP060, and no retrieval executes (§11-4).

### US-03: A business author declares and tests a fact that is not a column (Priority: P1)
**Why P1:** without it, rules over assembled facts can only be seeded through the API.
**Covers:** B1, FR-B2-12.
**Independent test:** author, publish and scenario-test a rule with three declared facts in the designer only (§11-1).
**Acceptance:**
- AC-1: Given a declared fact, then it appears in every editor's column picker and survives an entity-schema refresh.
- AC-2: Given the chained rule already in the org, then it evaluates exactly as before (FR-B1-02).

### US-04: An author moves an existing rule to strict deliberately (Priority: P2)
**Why P2:** existing rules must keep working (D4); migration is opt-in and not needed for the MVP.
**Covers:** FR-B2-03.
**Acceptance:**
- AC-1: Given a lenient rule, when the author switches to strict, then a new version is created and the published version is unchanged.

### US-05: A rule-set caller gets provenance per member (Priority: P3)
**Why P3:** useful but not required; FR-B4-05 is *Should*.
**Covers:** FR-B4-05.
**Acceptance:**
- AC-1: Given an `ExecuteRuleSet` call, then each member result carries its own `RuleKey`, `VersionNumber` and `ContentHash`.

**P1-only approval is viable:** US-01 to US-03 form a complete, shippable 1.1.0 contract.

## 4b. Inherited gates (carried forward per `.claude/workflows/new-feature.md`)

`projects/state.yml` has no Rule Engine entry. The inherited gates come from the engagement's own records:

| Gate | Source | Bearing on 1.1.0 |
|---|---|---|
| W0-2 separation-of-duties live tests (B-3) | `wave-0-audit-gate.md` | Not a blocker for 1.1.0's contract; blocks production |
| W0-4 entity audit toggle (B-2), human-only | `wave-0-audit-gate.md` | Not a blocker for 1.1.0; blocks production |
| W0-5 PDPPL / data residency (B-4), human-only | `wave-0-audit-gate.md`; `release.md` "Production" | 1.1.0 persists **no** raw inputs (B4 returns a hash only). Blocks any production release on a regulated client |
| ADR-18 packaging | ADR-18 (**Accepted** 2026-09-27) | Discharged as a decision; its execution is Part R A7 |

## 5. Functional requirements: ENGINE CONTRACT ENHANCEMENTS (require CEO approval)

### 5.1 B1: declared facts (A1)

| ID | Requirement | Priority |
|---|---|---|
| FR-B1-01 | A rule may declare a **fact**: a named, typed input with no `binding`, `via` or `aggregate`. PCRM shape is unchanged; an optional `"source": "declared"` marker is accepted and emitted by the designer | Must |
| FR-B1-02 | **Existing unbound inputs keep their current behaviour.** An input without a binding authored before 1.1.0 is a declared fact by definition, and evaluates exactly as today (verified: the chained `tier` input) | Must |
| FR-B1-03 | Value sources for a declared fact, in order: (1) caller `InputsJson`; (2) inside a rule set, an upstream member's output of the same name (existing chaining, unchanged); (3) otherwise null. **A declared fact is never read from the target record** | Must |
| FR-B1-04 | On the `TargetRef` path, a declared fact is not looked up as a record attribute. Today `BuildInputs` reads an attribute named after the input (`RuleDecisionService.cs`), a latent wrong-column risk. This is removed. Where an attribute of that name exists, see §8 R-3 | Must |
| FR-B1-05 | The validator emits **EDP064 (Info)** (EDP020–023 are taken by the table-completeness analyzer; all new codes sit in the free 060–070 block) for each declared fact: "supplied by the caller or an upstream rule". Info never blocks publish | Must |
| FR-B1-06 | `GetInputSchema` returns `kind: "bound" \| "declared"` and `binding: null` for declared facts. The field is additive; existing fields are unchanged | Must |
| FR-B1-07 | Designer: a **Facts** panel to add, rename, type and remove declared facts. Declared facts appear in the column picker of the decision-table editor, the condition builder (including inside `for each`) and the GoRules input node (`x-edp-kind: "declared"`). Refreshing the entity schema preserves declared facts | Must |
| FR-B1-08 | Scenario tester: declared facts render as typed, empty inputs. "Fill from record" leaves them untouched and says so | Must |
| FR-B1-09 | A declared fact may be referenced by a retrieval filter (F2). Its value is resolved before retrieval runs (see FR-B2-07) | Must |

### 5.2 B2: typed and required inputs (A5)

| ID | Requirement | Priority |
|---|---|---|
| FR-B2-01 | PCRM gains optional `required` (default `false`) and `nullable` (default `true`) per input, and `inputContract: "lenient" \| "strict"` per rule (default `"lenient"`) | Must |
| FR-B2-02 | **Absence of `inputContract` means lenient.** Every existing rule deserialises as lenient with nothing required, and evaluates exactly as today (D4) | Must |
| FR-B2-03 | The designer creates **new** rules with `inputContract: "strict"`. Moving an existing rule to strict is an explicit author action, recorded in a new version, never automatic (D4) | Must |
| FR-B2-04 | Type vocabulary and acceptance, applied to caller-supplied values (see table below) | Must |
| FR-B2-05 | Diagnostics (see table below) | Must |
| FR-B2-06 | Failure shape: `Success=false`, `Matched=false`, empty outputs, diagnostics carrying the codes. This is the Engine's existing refusal convention; no HTTP error is raised. The execution-log outcome is `rejected` | Must |
| FR-B2-07 | **Ordering:** input validation runs **after** input assembly and **before any retrieval executes** (on the `TargetRef` path inside `BuildInputs`, before `AddRetrievedPopulations`), and before evaluation on the `InputsJson` path. A retrieval never runs on unvalidated inputs of a strict rule | Must |
| FR-B2-08 | **Rule sets:** each member is validated against the pipeline context at the moment it runs (caller inputs plus upstream outputs), not only against the caller's inputs at entry | Must |
| FR-B2-09 | In strict mode, validated values are **converted to their declared type** before evaluation, so no comparison under strict falls back to text | Must |
| FR-B2-10 | Retrieval results (F2 collections) and quantifier element fields are not declared inputs and are not type-checked by this mechanism (their shape is governed by EDP050–055) | Must |
| FR-B2-11 | `GetInputSchema` returns `required`, `nullable` and the rule's `inputContract` | Must |
| FR-B2-12 | Designer: `required` / `nullable` per input, a rule-level **Strict inputs** switch, and required facts marked in the scenario tester | Must |

**FR-B2-04, type vocabulary and acceptance:**

| Declared type (designer / PCRM) | Accepted (strict) | Converted to |
|---|---|---|
| Text | JSON string | string |
| Decimal, Currency | JSON number, or numeric string in invariant culture | decimal |
| WholeNumber (integer) | JSON number or numeric string with no fractional part | long |
| Boolean | JSON `true` / `false` only | bool |
| Date | ISO-8601 `YYYY-MM-DD` | DateTime (date, UTC) |
| DateTime | ISO-8601 with offset or `Z` | DateTime (UTC) |
| Choice / OptionSet (code) | JSON integer, or integral numeric string | long |

**FR-B2-05, diagnostics:**

| Code | Condition | Lenient | Strict |
|---|---|---|---|
| EDP060 | Required input absent | Error | Error |
| EDP061 | Null where `nullable: false` | Error | Error |
| EDP062 | Value incompatible with declared type (e.g. `"abc"` for Decimal, `"31/12/2026"` for Date) | Warning | **Error** |
| EDP063 | Fractional value for WholeNumber or Choice | Warning | **Error** |

Lenient rules only emit EDP060/061 if an author has explicitly set `required` / `nullable:false`. Otherwise they only gain warnings.

### 5.3 B3: stable rule key (A2)

| ID | Requirement | Priority |
|---|---|---|
| FR-B3-01 | `qdb_edp_rulekey` is the rule's **integration identity**. Display name (`qdb_edp_rulename`) remains a free, non-unique label (D7) | Must |
| FR-B3-02 | Format: `^[a-z0-9]+([._-][a-z0-9]+)*$`, 3 to 100 characters, lower-case, dot-separated namespace segments recommended (`<domain>.<concept>[.<qualifier>]`). No GUIDs, dates or environment names in keys | Must |
| FR-B3-03 | Uniqueness is enforced by a Dataverse **alternate key** on `qdb_edp_rulekey`. The key is created **only after** every existing rule has a key (§9), so the design does not depend on how Dataverse treats nulls in alternate keys | Must |
| FR-B3-04 | New rules require a key at creation (designer). The designer suggests a slug; the author confirms it | Must |
| FR-B3-05 | **Immutability:** a key cannot change once any version of the rule has been Published. 1.1.0 enforces this in the designer and in `RuleKey` lookup semantics; server-side enforcement is Release 2 (A3) | Must |
| FR-B3-06 | `GetPublishedVersion`, `ResolveEffectiveVersion`, `GetRuleHistory` and `GetRuleMetadata` accept optional `RuleKey`. Identifier precedence: `RuleVersionId` → `RuleId` → `RuleKey` → `RuleName`. If more than one is supplied and they resolve to different rules, the call fails with **EDP070** | Must |
| FR-B3-07 | `ResolveEffectiveVersion` by `RuleKey` is the recommended integration path (effective-dated). `GetPublishedVersion` by `RuleKey` returns the highest Published version, as its name lookup does today | Must |
| FR-B3-08 | `RuleName` lookup remains supported and **uniqueness is not required**. When a name matches more than one rule, the response adds `nameIsAmbiguous: true` and `matchCount`; the selected rule becomes deterministic (earliest `createdon`, then id) instead of arbitrary | Must |
| FR-B3-09 | Responses of the four operations include `ruleKey` | Must |
| FR-B3-10 | SDK: `RuleRef.key` (JS, .NET); gateway `ref.key`; both pass `RuleKey` through. Existing `id` / `name` / `versionId` refs are unchanged | Must |
| FR-B3-11 | Solution import/export carries the alternate key and the key values with the data. Keys are environment-independent, so the same key addresses the same rule in every environment | Must |
| FR-B3-12 | On-prem Process Action manifest gains `RuleKey` on the same four operations (paper parity; see Part R) | Must |

### 5.4 B4: runtime provenance contract (A4-lite; response only)

| ID | Requirement | Priority |
|---|---|---|
| FR-B4-01 | `EvaluateDecision` accepts optional `CorrelationId` (string, 1 to 100 characters, echoed verbatim, never interpreted) | Must |
| FR-B4-02 | `EvaluateDecision` returns, additively: `ExecutionId` (registration is Part R), `RuleId`, `RuleKey`, `RuleVersionId`, `VersionNumber`, `ContentHash`, `InputsDigest`, `EvaluatedOnUtc`, `CorrelationId`. Existing `Matched` and `ReasonCodesJson` keep their current meaning | Must |
| FR-B4-03 | `ContentHash` = SHA-256 (lower-case hex) of the canonicalised PCRM **that was executed**, computed at evaluation. It is always present, including for ad-hoc `PcrmJson` calls (where `RuleId` / `RuleVersionId` / `VersionNumber` / `RuleKey` are null) | Must |
| FR-B4-04 | `InputsDigest` = SHA-256 of the canonicalised, **post-validation** inputs, using the F2a canonicaliser **without the clock prefix**. F2a's `SnapshotDigest` includes the capture instant, so identical inputs at two times would differ. That is correct for a snapshot and wrong for an input fingerprint | Must |
| FR-B4-05 | `ExecuteRuleSet` returns the same provenance per member result, plus the set's `CorrelationId` | Should |
| FR-B4-06 | The hash algorithm and canonical form are documented and have a published test vector, so a consumer can recompute `ContentHash` from stored PCRM | Must |
| FR-B4-07 | **Out of scope for 1.1.0:** persisting inputs, outputs, digests or correlation ids in `qdb_edp_ruleexecutionlog`, and any retention policy (Release 2, decisions D5/D6) | n/a |

## 6. Part R: release and bug work (NOT gated by this BRD)

These deliver behaviour already promised. They are listed for completeness and dependency only.

| ID | Work | Workflow | Gate |
|---|---|---|---|
| **A7** | Move all 22 Custom APIs and all SDK steps from signed `EDP.RuleRuntime.Crm.Signed` 1.0.23 to the `qdb_EdpRuleRuntime` package (ADR-18, accepted). Write the re-point script (rollback map first, propagation wait, 22-API smoke). Register the `ExecutionId` response property. Version the assembly 1.1.0. Bring the on-prem manifest to parity (+10 missing operations incl. `GetPublishedVersion`, + `ExecutionId`) with a CI parity check. Requires PR #102 (packaging build) merged | release | **Every live step needs explicit user authorisation**; CEO ship decision |
| **A6** | JSON-array `In`/`NotIn` over numeric values: fixed in source (F1 #96, verified on the baseline). Reaches the org only via A7. Add CRM-path regression tests and a live smoke | bug-fix | defect record |

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | No existing rule changes outcome, except where Part R's A6 fix makes a previously silent-false array membership correct |
| NFR-02 | Validation and hashing add < 1 ms at p95 to an evaluation with ≤ 50 inputs (hash of PCRM cached per version id) |
| NFR-03 | All new request parameters optional; all new response properties additive |
| NFR-04 | No consumer-specific entity, API, plugin, decision type or terminology |
| NFR-05 | Cloud and on-prem share one runtime; on-prem is labelled **designed, not runtime-validated** until run on a real on-prem org |
| NFR-06 | Code follows CLAUDE.md clean-code rules; a `code-reviewer` pass follows every code-producing step |

## 8. Backward compatibility and risks

| # | Item | Treatment |
|---|---|---|
| R-1 | Existing rules | Lenient by default (FR-B2-02); declared-fact semantics equal today's for unbound inputs (FR-B1-02) |
| R-2 | Existing API callers | Optional params, additive outputs; `RuleName` retained, and becomes deterministic (FR-B3-08) |
| R-3 | TargetRef + unbound input that happened to match an attribute name | Behaviour changes (reads null instead of the column). The live baseline has **no** such rule (the one unbound input, `tier`, targets `account`, and `account.tier` does not exist; verified by live metadata GET, HTTP 404, 2026-09-27) |
| R-4 | Designer | Existing rules open unchanged; new controls default off for existing rules |
| R-5 | Rollback | Web resource: redeploy previous. Assembly: re-point from the A7 rollback map. Alternate key and key values are inert if unused |
| R-6 | Name lookup determinism | Changes an arbitrary choice to a defined one. Callers relying on arbitrary behaviour had no contract |

## 9. Migration (each step needs explicit user authorisation; none performed)

1. Register the new Custom API request/response parameters (B3, B4).
2. Apply the rule-key mapping (Appendix A) to the 14 existing rules.
3. Create the alternate key on `qdb_edp_rulekey` **after** step 2.
4. Deploy the 1.1.0 package and designer (after Part R A7).

## 10. Out of scope

- A3 (Published-version immutability, lifecycle and effective-date governance): Release 2.
- Persisted provenance and retention: Release 2.
- Mixed `TargetRef` + `InputsJson` overlay (A1b): Release 2.
- Ruleset key (A2b): Release 2.
- On-prem runtime validation: separate track.

## 11. Acceptance criteria (cloud, 1.1.0)

1. A rule with ≥ 3 declared facts is authored **only in the designer**, published and evaluated through `InputsJson`.
2. The same strict rule rejects each of: missing required, null non-nullable, `"abc"` for Decimal, `"31/12/2026"` for Date, `2.5` for WholeNumber. It returns the correct EDP06x code and **zero matches**.
3. A lenient legacy rule given `"abc"` still evaluates as before, now with an EDP062 warning.
4. A strict rule whose retrieval filter references a missing required fact returns EDP060 and **executes no retrieval** (verified by trace).
5. In a rule set, a downstream strict member's required fact supplied by an upstream output passes; the same fact missing fails that member only.
6. `ResolveEffectiveVersion(RuleKey)` returns the same version repeatedly in the presence of duplicate display names; a duplicate key is rejected by Dataverse.
7. Conflicting `RuleId` + `RuleKey` gives EDP070.
8. Every `EvaluateDecision` response carries the B4 fields; `ContentHash` recomputed from stored PCRM with the published vector matches.
9. A replay of every live rule version with recorded inputs gives identical outputs to the pre-upgrade engine, except the documented A6 cases.
10. CI 6/6 green; `code-reviewer` pass; no consumer-specific artefact exists.

## 12. Estimate (AI-assisted hours, re-estimated on the baseline)

| Item | Impl | Tests | Docs | Deploy | Cloud val | Total |
|---|---|---|---|---|---|---|
| B1 / A1 | 5.25 | 2.0 | 0.5 | 0.25 | 1.0 | **9.0** |
| B2 / A5 | 4.5 | 2.75 | 0.5 | 0.25 | 0.75 | **8.75** |
| B3 / A2 | 3.5 | 1.5 | 0.5 | 0.5 | 0.75 | **6.75** |
| B4 / A4-lite | 2.25 | 1.0 | 0.25 | 0.5 | 0.5 | **4.5** |
| **Contract subtotal** | | | | | | **29.0** |
| Part R: A7 | 4.0 | 1.25 | 0.75 | 0.75 | 1.25 | **8.0** |
| Part R: A6 | 0 | 0.5 | 0 | (A7) | 0.25 | **0.75** |
| Cross-cutting (ADR-19, review passes, regression, release notes) | | | | | | **2.25** |
| **Release 1 total** | | | | | | **40.0** |

*Revised 2026-09-27 after the PR #102 review.*
- **A7 +1.5 h:** the live metadata drift is three items, not one (`ChildCollectionName`, `ChildResultsJson`, `ExecutionId`). The existing `bre-register*.js` scripts all target the signed assembly and must be retargeted or guarded. The package-version question (live record 1.0.0 vs nuspec) must be resolved. The floating `Microsoft.PowerApps.MSBuild.Plugin 1.*` must be pinned.
- **A6 −0.25 h:** the packaged-binary proof is done; only the permanent CRM-path tests remain.

## 12a. Requirements Quality Checklist (`.claude/protocols/requirements-quality.md`)

| Dimension | Question | Answer |
|---|---|---|
| Completeness | Does every functional requirement trace to an acceptance criterion in §11 or a user-story AC? | Yes |
| Completeness | Are the edge cases enumerated: missing, null, wrong type, bad date, fractional integer, retrieval dependence, rule-set chaining, duplicate names, conflicting identifiers? | Yes (§5.2, §5.3, §11) |
| Clarity | Does every quantity carry a number (key length 3–100; CorrelationId 1–100; NFR-02 < 1 ms p95 at ≤ 50 inputs)? | Yes |
| Clarity | Is every failure's shape specified (`Success=false` + code; EDP070 for identifier conflict)? | Yes |
| Consistency | Is there one term per concept ("declared fact", "rule key", "lenient/strict"), and no requirement contradicts another or D4/D7? | Yes |
| Coverage | Are NFRs present (performance, compatibility, genericity, on-prem labelling)? | Yes (§7) |
| Coverage | Is PDPPL addressed where personal data is involved? | Yes: 1.1.0 stores no raw inputs; W0-5 is carried forward (§4b) |
| Uncertainty | Is every open clarification marker resolved? | Yes (the document contains none) |

## 13. Decisions requested

| # | Decision | Owner |
|---|---|---|
| CEO-1 | Approve / revise / reject EDP-RE-ENH-001 (B1 to B4 as specified) | **CEO** |
| CEO-2 | Confirm the key format (FR-B3-02) and the Appendix A mapping principle | CEO + sponsor |
| S-1 | Authorise, individually and later, each §9 migration step and each Part R live step | Sponsor |

---

## Appendix A: proposed rule-key mapping for the 14 existing rules (NOT APPLIED)

**Principles (D7):**
- Every rule receives a **distinct** key.
- **No rule is renamed or retired.** Display names stay exactly as they are.
- A key names the rule's **purpose**, never its current state or its current version's content. Keys freeze on first publish (FR-B3-05); state ("unversioned") and content ("payment-authorization") can change in a later version, which would leave a frozen key saying something false. *(Revised 2026-09-27: the first draft keyed three duplicates by state and two by v1 content; that failed the semantic-stability check.)*
- Where display names duplicate and purpose is identical, the only stable distinguisher is **creation order**: ascending `createdon`, then rule id. It is deterministic and never changes.
- The `sample.` / `demo.` / `test.` prefixes describe what the rules are in this sandbox. Keys are proposals for the sponsor to adjust before step 9.2.

**Validated 2026-09-27 (mechanically):**
- All 14 match `^[a-z0-9]+([._-][a-z0-9]+)*$` and are 14–34 characters (limit 100).
- All are unique, also case-insensitively, and no key is a prefix of another.
- None contains an environment name, GUID or date.
- Creation order from live `createdon`, with no ties:
  - All Node Types: 07-04 02:41:14Z < 07-04 14:10:32Z < 07-08 20:49:12Z < 07-14 02:07:03Z < 07-14 02:07:23Z
  - Two-Stage: 07-04 15:39:25Z < 15:45:07Z

| # | Rule id | Display name (unchanged) | Versions (verified 2026-09-27) | Proposed key |
|---|---|---|---|---|
| 1 | `c9f1a5a9-4f77-f111-ab0e-70a8a55bc6a5` | Loan Approval — Sample | v1 Published · loanapplication · table | `sample.loan-approval` |
| 2 | `113121d0-5177-f111-ab0e-000d3abcff60` | All Node Types — Sample | v1 In Review · loanapplication · adjustedAmount, riskRating | `sample.all-node-types.1` |
| 3 | `da1bd318-b277-f111-ab0e-000d3abcff60` | All Node Types — Sample | none (created 2026-07-04) | `sample.all-node-types.2` |
| 4 | `9ac69f74-bb77-f111-ab0e-70a8a55bc6a5` | Governance Test Rule | v1 Published · **no logic** | `test.governance` |
| 5 | `23f45b83-be77-f111-ab0e-000d3abcff60` | Two-Stage Gov Test | v1 Published · **no logic** | `test.two-stage-governance.1` |
| 6 | `82f6944e-bf77-f111-ab0e-000d3abcff60` | Two-Stage Gov Test | v1 Published · **no logic** | `test.two-stage-governance.2` |
| 7 | `20398577-0e7b-f111-ab0e-70a8a55bc6a5` | All Node Types — Sample | v1 (no state) · payment_authorization_ticket | `sample.all-node-types.3` |
| 8 | `cd0591cd-1f7b-f111-ab0e-70a8a55bc6a5` | Credit vs Revenue | v1 Published · account | `sample.credit-vs-revenue` |
| 9 | `ade7ce50-da7d-f111-ab0e-000d3abd8313` | Demo — Underwriting Decision (chained) | v1 Published · account · **declared `tier`** | `demo.underwriting-decision.chained` |
| 10 | `f35c2e51-da7d-f111-ab0e-70a8a55bc6a5` | Demo — Risk Tier (AND/OR) | v1 Published · account · condition set | `demo.risk-tier` |
| 11 | `6b0ab9af-287f-f111-ab0e-70a8a55bc6a5` | All Node Types — Sample | none (created 2026-07-14) | `sample.all-node-types.4` |
| 12 | `16cb42bf-287f-f111-ab0e-70a8a55bc6a5` | All Node Types — Sample | none (created 2026-07-14) | `sample.all-node-types.5` |
| 13 | `4383e6c8-6983-f111-ab0f-000d3abd8313` | Underwriting Decision — Full Engine (demo) | v1 Published · loanapplication · 10 inputs | `demo.underwriting-decision.full` |
| 14 | `965efceb-4885-f111-ab0f-70a8a55bc6a5` | Account Credit Tier | v1 (no state) · account | `sample.account-credit-tier` |

**Observations for the sponsor:**
- These are observations only; no action is proposed in this BRD.
- **Three orphaned versions** exist with no parent rule, left over from the pre-DSN-002 create-id defect. They cannot receive a key because keys live on the rule.
- Rules 4 to 6 are Published with no executable logic.
- Rules 3, 11 and 12 have no versions.
