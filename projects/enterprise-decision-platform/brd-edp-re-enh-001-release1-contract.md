# Enterprise Decision Platform: Rule Engine 1.1.0 Contract Enhancements

**Engagement ID:** EDP-BRE-001
**Feature ID:** EDP-RE-ENH-001
**Phase:** Business Requirements Document (BRD)
**Module in focus:** Rule Engine runtime contract: inputs, identity, provenance
**Prepared by:** MSS Technologies, Business Analyst
**Date:** 2026-09-27 (v1.0) · 2026-09-28 (v1.1)
**Version:** 1.1: amended per the CEO-function decision (MC-1 to MC-5 folded in; see §0a)
**Status:** **CEO-FUNCTION DECISION RECORDED: APPROVE WITH CONDITIONS** (`ceo-decision-edp-re-enh-001.md`). **AWAITING HUMAN SPONSOR RATIFICATION. Implementation is BLOCKED** until the sponsor ratifies this amended BRD. After ratification, the next steps per `new-feature.md` are github-researcher, then Architecture (ADRs for the `ContentHash` canonical form and the `Outcome` contract), then build.

**Development baseline:** `main` @ **`4bfc1e71`** (Rule Engine Release 1 engineering baseline). It includes F2a #105, F2b #107, ADR-18 accepted (#104), the packaging build (#102), and **A7 release engineering (#168), merged and dry-run-verified but not deployed**.

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

## 0a. What changed in v1.1 (CEO-function decision, 2026-09-28)

The CEO function decided **APPROVE WITH CONDITIONS**. Its "before ratification" conditions are folded in here. The decision takes effect only when the sponsor ratifies **this amended text**.

| Condition | Change in this BRD |
|---|---|
| **MC-1** strict numbers | FR-B2-04 rewritten to **Option A, strict JSON typing**. Quoted numbers are rejected; decimals are read directly to `System.Decimal`; booleans must be JSON `true`/`false` |
| **MC-2** error semantics | FR-B2-06 rewritten: an explicit **`Outcome`** discriminator (`MATCHED` / `NO_MATCH` / `INPUT_REJECTED` / `ENGINE_ERROR`), and the HTTP-400 vs HTTP-200 line drawn |
| **MC-3** InputsDigest | **Removed** from Release 1 (FR-B4-02, FR-B4-04). Correlation is served by the caller's `CorrelationId`. Any future server fingerprint must be HMAC under an ADR, in Release 2 |
| **MC-4** ContentHash | FR-B4-03 replaced by a byte-level canonical form (§5.4a). The test vectors are due **before build** (FR-B4-06) |
| **MC-5** accuracy | Baseline corrected to `4bfc1e71`. A7 is merged, so it is no longer pending engineering (§6). The estimate is restated as net-new work (§12) |
| B1 condition | FR-B1-10: an input is **bound xor declared**. On a name coincidence the declared fact wins, and the target is re-checked at deploy |
| B2 clarification | FR-B2-01: `inputContract` is the **only** determinant. `schemaVersion` "1.0" plus strict is a contradiction and is rejected (EDP065) |
| B3 conditions | FR-B3-13 to FR-B3-16: lower-case enforced; no key reuse; a clone gets a new key; "supported" only once the uniqueness key is Active |
| TC-4 | §11 acceptance criteria updated to match |
| Scope | US-05 / FR-B4-05 (per-member rule-set provenance) **deferred out of the P1 MVP**. US-04 confirmed P2 |

**Three reconciliation notes, recorded rather than silently resolved:**

1. **Code collision.** Decision §7 assigns EDP064 to "extra input ignored", but this BRD already gives EDP064 to the declared-fact notice (FR-B1-05). The extra-input notice is **EDP067**; the behaviour the decision set is unchanged.
2. **Attribution.** Decision §9 locates the unordered name lookup at `RuleServicePlugin.ResolveRuleId` (`:546–547`). The same pattern also exists in `RuleMetadataPlugin` (`:97–98`), which serves `GetPublishedVersion` and the metadata operations. **Both** sites are in scope for FR-B3-08.
3. **Migration order.** Decision §10 and IC-4 order the rule-key migration as backfill → uniqueness key → deploy 1.1.0. The sequence the sponsor proposed deploys first. §9 records both and their trade-off as **HD-9** for the sponsor.

---

## 1. Executive summary

Four gaps stop the Engine from being a stable contract for external consumers:

- A caller cannot author a rule over a fact that is not a Dataverse column, although the runtime already evaluates one.
- A wrong-typed input silently produces a valid-looking answer. `"abc" > 5000` matches (verified locally on the baseline).
- Rules can only be addressed by GUID or by a display name that is not unique. Name lookup picks an arbitrary match, and the sandbox already has duplicates.
- A decision's response does not say exactly which rule and rule content produced it, and a caller cannot tell a rejected input from an engine failure.

This BRD specifies four additive contract changes (B1 to B4) that close these gaps **without changing how any existing rule evaluates.** Separately scheduled release work (Part R) puts already-fixed code into the org and aligns the assembly.

## 2. Problem statement (evidence verified 2026-09-27)

| Gap | Evidence |
|---|---|
| Declared facts not authorable | `PcrmInput.Binding` is nullable and the validator skips unbound inputs (`RuleValidator.cs:61`). A local run evaluates an unbound input correctly. The designer emits a binding on every path (`toPcrm.ts`). The schema API reports `binding = Binding ?? Name`, so bound and unbound look identical. One live Published rule (`Demo — Underwriting Decision (chained)`) already declares an unbound input `tier`, fed by rule-set chaining |
| Silent type coercion | `RuntimeValue.Compare` falls back to ordinal string comparison. `"abc" > 5000` gives HIT with no diagnostic. A missing input is null, so the rule silently fails to match. `PcrmInput.Type` exists and is ignored at runtime |
| No stable identity | `qdb_edp_rulekey` (String 100) exists, is null on all 14 rules, has no alternate key, and nothing writes it. **Name → rule** resolution uses `TopCount=1` with **no ordering** at two sites: `RuleMetadataPlugin.cs:97–98` (`GetPublishedVersion` and the metadata operations) and `RuleServicePlugin.cs:546–547` (`ResolveRuleId`, used by `ResolveEffectiveVersion`). Version selection *after* the rule is found is ordered correctly. Duplicate names exist (5 + 2) |
| No provenance in the response | EvaluateDecision returns `Success, Matched, OutputsJson, ReasonCodesJson, TraceJson, DiagnosticsJson, ElapsedMs`. There is no rule identity, version number or content fingerprint, and **a strict-input refusal would be indistinguishable from an engine failure**. `ExecutionId` is coded, and it is the execution-log record id, empty when the best-effort trace is dropped. Its response property is declared in the registration contract (A7) but not yet registered live |

## 3. Business objectives

1. Any consumer can integrate against a **rule key**, not a GUID or a display name.
2. Any consumer can pass assembled facts and have the Engine **refuse** malformed input explicitly on new rules.
3. Any consumer can record, from the response alone, **exactly what decided** (rule, key, version and content hash) and can tell a business no-match, a rejected input and an engine failure apart. The caller correlates its own inputs through `CorrelationId`.
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
- AC-1: Given `"abc"` **or `"5000"` (a quoted number)** for a Decimal input on a strict rule, then `Outcome=INPUT_REJECTED`, `Success=false`, `Matched=false`, EDP062, with zero matches.
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

### US-05: A rule-set caller gets provenance per member (Priority: P3). DEFERRED OUT OF THE P1 MVP (CEO decision §3)
**Why P3:** useful but not required; FR-B4-05 is *Should*. It is not part of the approved 1.1.0 MVP. It may land in a later increment at the sponsor's discretion.
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
| W0-5 PDPPL / data residency (B-4), human-only | `wave-0-audit-gate.md`; `release.md` "Production" | 1.1.0 persists **no** raw inputs and returns **no input-derived value** (`InputsDigest` removed, MC-3). Blocks any production release on a regulated client |
| ADR-18 packaging | ADR-18 (**Accepted** 2026-09-27) | Discharged as a decision; its source execution (A7) is merged; live execution remains gated (§6) |
| RuleKey immutability residual | CEO decision §15, HD-5 | Server-side key immutability is Release 2. In 1.1.0 a direct API write could still change a key. **Accepted residual, pending sponsor acknowledgement**, with the operational control that direct key writes are restricted |

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
| FR-B1-10 | **Disambiguation (CEO condition):** within Release 1 an input is **either bound (to the record) or declared (caller / upstream), never both**. When a declared fact's name coincides with a real attribute on the target table, the declared fact wins and the column is **never read**. Mixed record-plus-caller overlay is A1b, Release 2. Because the org is shared and rules can be authored before deployment, the target org is **re-checked at deploy time** for any rule relying on the old attribute-name coincidence (R-3, IC-4) | Must |

### 5.2 B2: typed and required inputs (A5)

| ID | Requirement | Priority |
|---|---|---|
| FR-B2-01 | PCRM gains optional `required` (default `false`) and `nullable` (default `true`) per input, and `inputContract: "lenient" \| "strict"` per rule (default `"lenient"`). **`inputContract` is the single determinant of strictness.** When the designer writes a strict rule it also stamps `schemaVersion: "1.1"`. A rule carrying `schemaVersion: "1.0"` (or none) **and** `inputContract: "strict"` is contradictory and is **rejected by the validator with EDP065**: never silently coerced either way. No heuristic detection of any kind | Must |
| FR-B2-02 | **Absence of `inputContract` means lenient.** Every existing rule deserialises as lenient with nothing required, and evaluates exactly as today (D4) | Must |
| FR-B2-03 | The designer creates **new** rules with `inputContract: "strict"`. Moving an existing rule to strict is an explicit author action, recorded in a new version, never automatic (D4) | Must |
| FR-B2-04 | Type vocabulary and acceptance, applied to caller-supplied values (see table below) | Must |
| FR-B2-05 | Diagnostics (see table below) | Must |
| FR-B2-06 | **Outcome contract (MC-2).** `EvaluateDecision` returns an additive, machine-readable **`Outcome`** that consumers branch on (table below). `Success` and `Matched` are retained for compatibility. An input rejection is a **first-class result, not a malformed request**: HTTP 200, `Outcome=INPUT_REJECTED`, `Success=false`, `Matched=false`, empty outputs, diagnostics carrying the EDP06x codes and the input name. The execution log records outcome `rejected`. **HTTP 400 is reserved for a malformed request envelope only**: unparseable `InputsJson`, missing mandatory parameters, or conflicting identifiers (EDP070) | Must |
| FR-B2-07 | **Ordering:** input validation runs **after** input assembly and **before any retrieval executes** (on the `TargetRef` path inside `BuildInputs`, before `AddRetrievedPopulations`), and before evaluation on the `InputsJson` path. A retrieval never runs on unvalidated inputs of a strict rule | Must |
| FR-B2-08 | **Rule sets:** each member is validated against the pipeline context at the moment it runs (caller inputs plus upstream outputs), not only against the caller's inputs at entry | Must |
| FR-B2-09 | In strict mode, validated values are **converted to their declared type** before evaluation, so no comparison under strict falls back to text | Must |
| FR-B2-10 | Retrieval results (F2 collections) and quantifier element fields are not declared inputs and are not type-checked by this mechanism (their shape is governed by EDP050–055) | Must |
| FR-B2-11 | `GetInputSchema` returns `required`, `nullable` and the rule's `inputContract` | Must |
| FR-B2-12 | Designer: `required` / `nullable` per input, a rule-level **Strict inputs** switch, and required facts marked in the scenario tester | Must |

**FR-B2-06, the `Outcome` discriminator:**

| `Outcome` | Meaning | HTTP | `Success` / `Matched` |
|---|---|---|---|
| `MATCHED` | rule evaluated and matched | 200 | true / true |
| `NO_MATCH` | rule evaluated and did not match (a business result) | 200 | true / false |
| `INPUT_REJECTED` | well-formed request; input failed the rule's strict contract (EDP060–063, EDP066) | 200 | false / false |
| `ENGINE_ERROR` | runtime or engine failure (the engine's existing convention) | 200, with a diagnostic | false / false |
| *(none)* | malformed request envelope | **400** | n/a |

**FR-B2-04, type acceptance: Option A, strict JSON typing (MC-1).** A strict rule never parses a value out of a string. The JSON token's own type carries the semantic type, so a strict rule can never evaluate a value under the wrong semantic type.

| Declared type | Accepted (strict) | Converted to | Rejected → code |
|---|---|---|---|
| Text | JSON string | string | anything else → EDP062 |
| Decimal, Currency (money) | JSON **number**, read from the raw token **directly to `System.Decimal`, never via `double`**; must be within `decimal` range | decimal | quoted number (`"5000"`), exponent form outside `decimal`, out of range, non-number → EDP062 |
| WholeNumber (integer) | JSON **number** with no fractional part, within `Int64` | long | fractional (`2.5`) → EDP063; quoted or out of range → EDP062 |
| Boolean | JSON `true` / `false` only | bool | `"true"`, `1`, `0` → EDP062 |
| Choice / OptionSet (code) | JSON **number** with no fractional part, within `Int64` | long | fractional → EDP063; quoted or label → EDP062 |
| Date | JSON string, ISO-8601 calendar date `YYYY-MM-DD` | DateTime (date, UTC midnight) | any other form incl. `31/12/2026` → EDP062 |
| DateTime | JSON string, ISO-8601 date-time **with** offset or `Z` | DateTime (UTC) | missing offset or any other form → EDP062 |
| Lookup / reference | **Not supported as a declared fact in a strict rule in Release 1** (no concrete need stated). The validator rejects such a declaration | — | EDP066 at validation |

**The other cases:**
- Missing required fact → EDP060.
- `null` where `nullable: false` → EDP061. Where `nullable` is true, null is accepted and resolves to null.
- A JSON array for a scalar-typed fact → EDP062.
- An extra, undeclared input → ignored (additive), reported as **EDP067 Info**; it is never an error.
- Retrieval collections and quantifier element fields stay outside this mechanism (FR-B2-10).

A **legacy (lenient) rule** keeps today's behaviour exactly. It gains only EDP062/063 warnings, never a refusal, unless an author has explicitly set `required` or `nullable: false` on it.

**FR-B2-05, diagnostics:**

| Code | Condition | Lenient | Strict |
|---|---|---|---|
| EDP060 | Required input absent | Error | Error |
| EDP061 | Null where `nullable: false` | Error | Error |
| EDP062 | Value's JSON type or form incompatible with the declared type (e.g. `"abc"` or `"5000"` for Decimal, `"31/12/2026"` for Date) | Warning | **Error** |
| EDP063 | Fractional value for WholeNumber or Choice | Warning | **Error** |
| EDP065 | `inputContract: "strict"` on a rule whose `schemaVersion` is not "1.1" (contradictory artifact) | validation error | validation error |
| EDP066 | A declared fact of a type not supported under the strict contract in Release 1 (Lookup / reference) | — | validation error |
| EDP067 | An input was supplied that the rule does not declare; it is ignored | Info | Info |

Errors at evaluation produce `Outcome=INPUT_REJECTED`. Validation errors (EDP065, EDP066) stop the rule from being published.

### 5.3 B3: stable rule key (A2)

| ID | Requirement | Priority |
|---|---|---|
| FR-B3-01 | `qdb_edp_rulekey` is the rule's **integration identity**. Display name (`qdb_edp_rulename`) remains a free, non-unique label (D7) | Must |
| FR-B3-02 | Format: `^[a-z0-9]+([._-][a-z0-9]+)*$`, 3 to 100 characters, lower-case, dot-separated namespace segments recommended (`<domain>.<concept>[.<qualifier>]`). No GUIDs, dates or environment names in keys | Must |
| FR-B3-03 | Uniqueness is enforced by a Dataverse **alternate key** on `qdb_edp_rulekey`. The key is created **only after** every existing rule has a key (§9), so the design does not depend on how Dataverse treats nulls in alternate keys | Must |
| FR-B3-04 | New rules require a key at creation (designer). The designer suggests a slug; the author confirms it | Must |
| FR-B3-05 | **Immutability:** a key may be set once while empty; after that, and in any case once any version of the rule has been Published, it cannot change. 1.1.0 enforces this in the designer. Server-side enforcement is Release 2 (A3). The residual (a direct API write could change a key) is **accepted pending sponsor acknowledgement (HD-5)**, with direct key writes operationally restricted | Must |
| FR-B3-06 | `GetPublishedVersion`, `ResolveEffectiveVersion`, `GetRuleHistory` and `GetRuleMetadata` accept optional `RuleKey`. Identifier precedence: `RuleVersionId` → `RuleId` → `RuleKey` → `RuleName`. If more than one is supplied and they resolve to different rules, the call fails with **EDP070** | Must |
| FR-B3-07 | `ResolveEffectiveVersion` by `RuleKey` is the recommended integration path (effective-dated). `GetPublishedVersion` by `RuleKey` returns the highest Published version, as its name lookup does today | Must |
| FR-B3-08 | `RuleName` lookup remains supported and **uniqueness is not required**. When a name matches more than one rule, the response adds `nameIsAmbiguous: true` and `matchCount`; the selected rule becomes deterministic (earliest `createdon`, then id) instead of arbitrary. Applies at **both** unordered sites (`RuleMetadataPlugin.cs:97–98`, `RuleServicePlugin.cs:546–547`) through the one extracted resolver (IC-1) | Must |
| FR-B3-09 | Responses of the four operations include `ruleKey` | Must |
| FR-B3-10 | SDK: `RuleRef.key` (JS, .NET); gateway `ref.key`; both pass `RuleKey` through. Existing `id` / `name` / `versionId` refs are unchanged | Must |
| FR-B3-11 | Solution import/export carries the alternate key and the key values with the data. Keys are environment-independent, so the same key addresses the same rule in every environment | Must |
| FR-B3-12 | On-prem Process Action manifest gains `RuleKey` on the same four operations (paper parity), generated from the registration contract | Must |
| FR-B3-13 | **Case:** the validator **rejects** any key that is not entirely lower-case at write time; it never normalises silently. A stored key always equals its lookup text exactly, so uniqueness is case-insensitive by construction | Must |
| FR-B3-14 | **No reuse:** the key of a deleted or retired rule **must not be reused**, because an external consumer may still hold it. Stated as policy in Release 1; technically enforced when Release 2 server-side enforcement lands | Must |
| FR-B3-15 | **Cloning:** the designer's clone or copy operation **forces a new key**; it never copies the source's key | Must |
| FR-B3-16 | **Support declaration:** RuleKey lookup is declared supported to consumers **only after** the Dataverse alternate key reports status **Active** (index build complete), verified by a live read, never while it is Pending | Must |

### 5.4 B4: runtime provenance contract (A4-lite; response only)

| ID | Requirement | Priority |
|---|---|---|
| FR-B4-01 | `EvaluateDecision` accepts optional `CorrelationId` (string, 1 to 100 characters, echoed verbatim, never interpreted) | Must |
| FR-B4-02 | `EvaluateDecision` returns, additively: `Outcome` (FR-B2-06), `ExecutionId`, `RuleId`, `RuleKey`, `RuleVersionId`, `VersionNumber`, `ContentHash`, `EvaluatedOnUtc`, `CorrelationId`. Existing `Success`, `Matched`, `OutputsJson`, `ReasonCodesJson`, `TraceJson`, `DiagnosticsJson`, `ElapsedMs` and `ChildResultsJson` keep their current meaning. `ExecutionId` is the execution-log record id and is **empty when the best-effort trace is dropped** (ADR-13). It is therefore not a sole correlation key; `CorrelationId` is | Must |
| FR-B4-03 | `ContentHash` = lower-case hex SHA-256 of the **canonical form** (§5.4a) of the PCRM **that was executed**, computed at evaluation. It is always present, including for ad-hoc `PcrmJson` calls (where `RuleId`, `RuleVersionId`, `VersionNumber` and `RuleKey` are empty). Plain SHA-256 is appropriate here: it hashes rule logic, not personal data | Must |
| FR-B4-04 | **REMOVED from Release 1 (MC-3).** No input-derived digest is returned. A plain SHA-256 of low-entropy, sensitive decision facts (age, bands, status codes, small amounts, flags) is reversible by enumeration, which would make it personal data on a regulated client. Correlation is served by the caller-owned `CorrelationId`. Any future server-computed input fingerprint may return **only** as a keyed HMAC-SHA-256 whose key custody, provisioning and rotation are fixed in an ADR, as a Release 2 decision (HD-4) | n/a |
| FR-B4-05 | `ExecuteRuleSet` returns the same provenance per member result, plus the set's `CorrelationId`. **Deferred out of the P1 MVP** (CEO decision §3) | Should, deferred |
| FR-B4-06 | The canonical form (§5.4a) is published with a **test-vector set, settled before build** and asserted in CI: (a) a minimal rule; (b) a rule exercising every input type; (c) the same rule as (b) with properties reordered and whitespace changed, which **must hash identically** to (b); (d) strict vs lenient variants of one rule, which **must hash differently**; (e) an ad-hoc `PcrmJson` evaluation | Must |
| FR-B4-07 | **Out of scope for 1.1.0:** persisting inputs, outputs, digests, content hashes or correlation ids (on `qdb_edp_ruleexecutionlog` or the rule version), and any retention policy. Release 2 (A3, A4-log; decisions D5/D6) | n/a |
| FR-B4-08 | `ResolveEffectiveVersion` and `GetPublishedVersion` return **identity and resolution metadata only** (`ruleId`, `ruleKey`, `ruleVersionId`, `versionNumber`, and the existing fields). They do not return `ContentHash`, because resolution is not execution. Caller-owned business provenance (case, customer, the meaning of an outcome) stays outside the engine | Must |

### 5.4a `ContentHash` canonical form (MC-4)

Defined as a **byte sequence**, not as the output of any particular serialiser, so any language reproduces it. The single implementation lives in one shared place (IC-3), and it is recorded in an ADR during Architecture.

1. **Start from the PCRM JSON actually executed.** Parse it as a JSON value tree.
2. **Remove non-executable metadata** at the top level: `schemaVersion`, `ruleId`, `name`, `description`, and any property whose name starts with `x-` (designer or layout annotations). **Everything else is executable and included.** That covers `targetEntity`, `inputContract`, `inputs` (each input's `name`, `type`, `binding`, `via`, `aggregate`, `required`, `nullable`, `source`), `variables`, `retrievals`, `outputs`, and `logic` (all conditions, operators, values, rows, hit policy, default row).
   - Rule key, version number, display name, record ids and timestamps are not part of the PCRM content and are therefore excluded by construction.
   - Two rules with identical logic therefore hash identically.
3. **Drop properties whose value is `null`**, at every depth, so absent and null are equivalent. Empty arrays and empty objects are kept.
4. **Objects:** keys sorted by ordinal comparison of their UTF-16 code units (C# `StringComparer.Ordinal`, JavaScript default sort), recursively. Duplicate keys make the rule invalid.
5. **Arrays:** order preserved; order is semantic (row priority, members).
6. **Strings:** Unicode NFC.
   - Escape `"` as `\"` and `\` as `\\`.
   - Escape control characters U+0000–U+001F as `\u00xx`, with lower-case hex.
   - Every other character is emitted literally.
7. **Numbers:** the exact decimal value, written without exponent, without a leading `+`, without leading zeros (except a single `0` before the point) and without trailing fractional zeros. A value with no fractional part has no decimal point; `-0` is written `0`.
   - Examples: `1.50` → `1.5`, `2.0` → `2`, `1e3` → `1000`.
   - A numeric literal that is not exactly representable as a .NET `decimal` makes the rule invalid for hashing and is rejected at validation.
8. **Literals:** `true`, `false`.
9. **Serialisation:** no whitespace anywhere; `:` and `,` only as separators.
10. **Encoding:** UTF-8 without a byte-order mark.
11. **Hash:** SHA-256 of those bytes, rendered as 64 lower-case hex characters.

## 6. Part R: release and bug work (NOT gated by this BRD)

These deliver behaviour already promised. They are listed for completeness and dependency only; **this BRD neither approves nor blocks them.**

| ID | State | Remaining | Gate |
|---|---|---|---|
| **A7** | **Source work MERGED** (#168 → `main` `4bfc1e71`). Done: 1.1.0 versioning; the registration contract declaring `ExecutionId`, `ChildResultsJson` and `ChildCollectionName`; `a7-repoint.mjs` / `a7-metadata.mjs` (dry run by default, metadata before moves, rollback); guarded legacy scripts; generated on-prem manifest (22/22) with CI parity; pinned build tool; package verification. A read-only dry run against the org plans 3 metadata creates and 29 moves with 0 problems | **Live execution only.** By sponsor direction it happens **once, together with B1–B4**, as a single coherent 1.1.0 deployment | `release.md` CEO ship decision + per-step human authorisation |
| **A6** | Fixed in source; permanent regression tests merged (#168), red on the pre-fix commit | Live smoke only, which rides the 1.1.0 deployment | defect record |

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
| R-7 | RuleKey immutability not server-enforced in 1.1.0 | Accepted residual pending sponsor acknowledgement (HD-5); direct key writes operationally restricted; Release 2 enforces it server-side |
| R-8 | `Outcome` added alongside `Success`/`Matched` | Additive; existing callers that branch on `Success`/`Matched` see unchanged values for every existing (lenient) rule |

## 9. Migration (each ✋ step needs explicit, individual human authorisation; none performed)

**Invariants for every step and every order:**
- ID and name lookup keep working throughout.
- RuleKey lookup is additive.
- No published rule depends on having a key.
- So **there is no window in which an existing published rule becomes unusable.**

The column `qdb_edp_rulekey` already exists (String 100, optional; verified live), so no schema column has to be created.

**Gates before the uniqueness key is created (CEO decision §10):**
- **completeness:** every rule has a key;
- **format compliance:** FR-B3-02 and FR-B3-13;
- **case-insensitive uniqueness.**

All three are checked by a read-only verifier, and any failure stops the step.

**Two safe orders. The sponsor chooses (HD-9):**

| Step | Order X: key data first (**as the CEO decision states**, §10, IC-4) | Order Y: capability first (as the sponsor proposed) |
|---|---|---|
| 1 | ✋ Backfill the 14 approved keys (Appendix A) on the **current** runtime, which ignores the column | ✋ Deploy 1.1.0: metadata, package, re-point (A7). The 1.1.0 designer requires a key on **new** rules; existing unkeyed rules keep working |
| 2 | Verify the three gates | ✋ Backfill the 14 approved keys |
| 3 | ✋ Create the uniqueness key; wait for **Active** | Verify the three gates |
| 4 | ✋ Deploy 1.1.0: metadata, package, re-point | ✋ Create the uniqueness key; wait for **Active** |
| 5 | Declare RuleKey supported (FR-B3-16) | Declare RuleKey supported (FR-B3-16) |
| Risk | Between step 3 and step 4, the **old** designer can create a rule with no key. Whether Dataverse treats several empty keys as duplicates is **unverified**; if it does, rule *creation* (not evaluation) fails in that window. **Mitigation:** an authoring freeze from step 1 to step 4. Benefit: 1.1.0 starts with unique, enforced keys, which satisfies IC-4 as written | Between steps 1 and 4, keys are not yet enforced unique; a direct API write could create a duplicate. The step-3 gate catches it before the key is created. IC-4's RuleKey clause is **not** met as written: the runtime is pointed before backfill. The sponsor would have to vary that condition |
| Rollback | Step 1: clear the keys written in this run (no consumer yet). Step 3: remove the uniqueness key. Step 4: A7 rollback (from the snapshot, or everything back to the signed assembly) | Step 1: A7 rollback. Step 2: clear the keys written in this run. Step 4: remove the uniqueness key |

Deterministic legacy name lookup (FR-B3-08) is kept in both orders. Name lookup is **not** prohibited (D7). An opt-in "refuse ambiguous names" mode would be Release 2.

## 10. Out of scope

- A3 (Published-version immutability, lifecycle and effective-date governance): Release 2.
- Persisted provenance and retention: Release 2.
- Mixed `TargetRef` + `InputsJson` overlay (A1b): Release 2.
- Ruleset key and rule-set versioning (A2b): Release 2. Rule sets have no version concept today, so the 1.1.0 contract has no `RulesetVersion`.
- `InputsDigest`, or any server-computed input fingerprint: removed from Release 1 (MC-3). It may return only as HMAC under an ADR (HD-4).
- Per-member rule-set provenance (US-05, FR-B4-05): deferred out of the P1 MVP.
- Strict typing of Lookup/reference declared facts (EDP066): not in Release 1.
- On-prem runtime validation: separate track.

## 11. Acceptance criteria (cloud, 1.1.0)

Evidence for every criterion is a **live-org round trip with pasted output against the 1.1.0 package**, not the stale 1.0.23 assembly. Where security context matters, it is run **as a non-administrator** (TC-1). A green test suite is necessary but never sufficient.

1. A rule with ≥ 3 declared facts is authored **only in the designer**, published and evaluated through `InputsJson`.
2. **Adversarial type safety (TC-2).** A strict rule rejects each of the following with `Outcome=INPUT_REJECTED`, the correct EDP06x code and **zero matches**:
   - `"abc"` and **`"5000"`** (quoted) for Decimal;
   - `"1e3"` (quoted) for Decimal;
   - a number outside `decimal` range;
   - `"31/12/2026"` for Date;
   - a DateTime without an offset;
   - `2.5` for WholeNumber and for Choice;
   - `"true"` and `1` for Boolean;
   - an array for a scalar;
   - a missing required fact;
   - `null` where not nullable.

   Also: an empty input set, or an empty collection, **does not pass vacuously**.
3. A lenient legacy rule given `"abc"` evaluates exactly as before (same `Outcome`, outputs and match), now with an EDP062 warning.
4. A strict rule whose retrieval filter references a missing required fact returns EDP060, `Outcome=INPUT_REJECTED`, and **executes no retrieval** (verified by trace).
5. In a rule set, a downstream strict member's required fact supplied by an upstream output passes; the same fact missing rejects that member only.
6. **`Outcome` distinguishes all three cases:** a rule that does not match gives `NO_MATCH`; malformed input to a strict rule gives `INPUT_REJECTED`; a forced runtime failure gives `ENGINE_ERROR`; an unparseable `InputsJson` gives HTTP 400.
7. `ResolveEffectiveVersion(RuleKey)` returns the same version repeatedly despite duplicate display names. A duplicate key, and a key containing upper case, are both rejected. Cloning a rule produces a new key.
8. Conflicting `RuleId` + `RuleKey` gives EDP070 (HTTP 400).
9. Every `EvaluateDecision` response carries the FR-B4-02 fields and **no `InputsDigest`**. `ContentHash` recomputed independently from the stored PCRM matches, and **all five published test vectors (FR-B4-06) pass in CI**: reordered gives an identical hash, strict vs lenient gives different hashes.
10. **Backward-compatibility replay (TC-3, release-blocking):** every live rule version replayed with recorded inputs gives outputs identical to the pre-upgrade engine, except the documented A6 array-membership cases.
11. A declared fact whose name matches a real attribute on the target reads **no** column (FR-B1-10).
12. CI 8/8 green, including the reverse contract-vs-code check extended to every new parameter (IC-2); `code-reviewer` pass; no consumer-specific artefact exists.

## 12. Estimate: net-new engineering this BRD authorises (MC-5)

**Baseline `4bfc1e71`.**
- A7 release engineering (about 2.5 h actual) and the A6 regression tests are **already merged**. They are not pending Release 1 engineering, and v1.0's "Part R: A7 8.0 h / A6 0.75 h" lines are removed.
- The A7 *live* execution appears below as deployment, because it is one coherent 1.1.0 deployment with B1–B4.

AI-assisted engineering hours only. **Waiting time is excluded throughout:** sponsor ratification, the CEO ship decision, live authorisations, the uniqueness-key index build, and any authoring freeze.

| Item | Hours | Change from the 35.5 h figure given before the CEO review, and why |
|---|---|---|
| Pre-build governance steps (`new-feature.md`): github-researcher (canonical JSON, JSON-type validation) + Architecture ADRs (`ContentHash` canonical form; `Outcome`/error contract) | **2.0** | +2.0: required by the CEO decision's next step; not itemised before |
| B1: declared facts, incl. FR-B1-10 | **8.0** | unchanged |
| B2: strict input contract, Option A, `Outcome` discriminator, EDP065–067 | **8.5** | +0.25: Option A removes string parsing (−0.25); `Outcome` across runtime, plugin, SDK and gateway adds +0.5 |
| B3: RuleKey, incl. FR-B3-13…16, migration tooling (backfill, 3-gate verifier, key creation with Active wait, rollback; dry run by default) | **7.0** | +0.5: case, clone and Active-status handling |
| B4: provenance without `InputsDigest`, plus the canonical form and 5 test vectors | **5.5** | +1.0: `InputsDigest` removed (−0.5); canonical form and vectors were under-scoped (+1.5) |
| IC-1: extract identifier/key resolution out of `RuleServicePlugin` (both unordered sites) | **1.0** | +1.0: new condition |
| IC-2 / IC-3: reverse contract-vs-code CI check; single source for the type vocabulary and canonical form, with a parity check | **0.75** | +0.75: new conditions |
| Cross-cutting regression and review passes | **2.25** | unchanged |
| Release-candidate preparation | **1.0** | unchanged |
| Cloud deployment: metadata, package, re-point, key migration steps | **1.75** | unchanged |
| Cloud acceptance (§11, incl. TC-1 as non-admin, TC-2, TC-3 replay, A6 live) | **3.75** | +0.5: non-admin evidence (TC-1) |
| **Release 1 total (net-new)** | **41.5** | **+6.0 vs 35.5, all attributable to the CEO conditions above** |
| On-prem runtime validation (separate, blocked on an on-prem org and `edp.snk`) | ~4 | not in the total |

## 12a. Requirements Quality Checklist (`.claude/protocols/requirements-quality.md`)

| Dimension | Question | Answer |
|---|---|---|
| Completeness | Does every functional requirement trace to an acceptance criterion in §11 or a user-story AC? | Yes |
| Completeness | Are the edge cases enumerated: missing, null, wrong type, bad date, fractional integer, retrieval dependence, rule-set chaining, duplicate names, conflicting identifiers? | Yes (§5.2, §5.3, §11) |
| Clarity | Does every quantity carry a number (key length 3–100; CorrelationId 1–100; NFR-02 < 1 ms p95 at ≤ 50 inputs)? | Yes |
| Clarity | Is every failure's shape specified and distinguishable (`Outcome` = `MATCHED` / `NO_MATCH` / `INPUT_REJECTED` / `ENGINE_ERROR`; HTTP 400 only for a malformed envelope incl. EDP070)? | Yes (FR-B2-06) |
| Clarity | Is the accepted representation of every strict type stated exactly (Option A, no string parsing)? | Yes (FR-B2-04) |
| Consistency | Is there one term per concept ("declared fact", "rule key", "lenient/strict"), and no requirement contradicts another or D4/D7? | Yes |
| Coverage | Are NFRs present (performance, compatibility, genericity, on-prem labelling)? | Yes (§7) |
| Coverage | Is PDPPL addressed where personal data is involved? | Yes: 1.1.0 stores no raw inputs and returns no input-derived digest (`InputsDigest` removed); W0-5 is carried forward (§4b) |
| Uncertainty | Is every open clarification marker resolved? | Yes (the document contains none) |

## 13. Decisions requested

| # | Decision | Owner | State |
|---|---|---|---|
| CEO-1 | Approve / revise / reject EDP-RE-ENH-001 | CEO function | **Decided 2026-09-28: APPROVE WITH CONDITIONS** (`ceo-decision-edp-re-enh-001.md`) |
| HD-1 | **Ratify the CEO-function decision and this BRD as amended (v1.1).** Nothing is authorised until then | **Human sponsor** | open |
| HD-2 / CEO-2 | Confirm the key format (FR-B3-02) and the **actual Appendix A key strings** (the mapping *principle* is approved) | Sponsor + CEO function | principle approved; strings open |
| HD-3 / S-1 | Authorise, individually and at the time, each §9 step and each A7 live step (`release.md` CEO ship decision + per-step go-ahead) | Sponsor | open |
| HD-4 | Is a server-computed input fingerprint ever needed? (HMAC under an ADR, in Release 2, or never) | Sponsor | open |
| HD-5 | Acknowledge the 1.1.0 residual: RuleKey immutability is not server-enforced (R-7) | Sponsor | open |
| HD-6 | Schedule the non-blocking F2 follow-ups FU-1…FU-4 | Sponsor | open |
| HD-7 | W0-5 PDPPL / data residency: human-only production gate | Sponsor / Auditor | open |
| HD-8 | Authorise the separate on-prem runtime-validation track | Sponsor | open |
| **HD-9** | **Choose the rule-key migration order (§9):** X, keys first (as the CEO decision and IC-4 state, with an authoring freeze), or Y, capability first (as proposed, varying IC-4's RuleKey clause) | **Sponsor** | open |

The CEO decision also asks for its conditions to be recorded as numbered blockers in `projects/state.yml`, which has no Rule Engine entry yet. That is a shared file, so it is proposed for the ratification commit rather than changed in this review.

---

## Appendix A: proposed rule-key mapping for the 14 existing rules (NOT APPLIED)

**Principles (D7):**
- Every rule receives a **distinct** key.
- **No rule is renamed or retired.** Display names stay exactly as they are.
- A key names the rule's **purpose**, never its current state or its current version's content. Keys freeze on first publish (FR-B3-05); state ("unversioned") and content ("payment-authorization") can change in a later version, which would leave a frozen key saying something false. *(Revised 2026-09-27: the first draft keyed three duplicates by state and two by v1 content; that failed the semantic-stability check.)*
- Where display names duplicate and purpose is identical, the only stable distinguisher is **creation order**: ascending `createdon`, then rule id. It is deterministic and never changes.
- The `sample.` / `demo.` / `test.` prefixes describe what the rules are in this sandbox. Keys are proposals: the sponsor confirms the actual strings before backfill (HD-2).

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
