# Rule Engine 1.1.0: cloud deployment record (org5869857f)

**Authority:** sponsor go-ahead in session (2026-09-29) for a controlled cloud deployment; CEO-function ship decision `ceo-ship-decision-edp-re-1.1.0-cloud.md` = APPROVED WITH CONDITIONS (deployment steps only; hard stop before TC-1).
**Target:** cloud sandbox `https://org5869857f.crm4.dynamics.com`, solution `BusinessRuleEngine` (unmanaged), prefix `qdb_edp_`.
**Source:** PR #169 head `fe4df34c` (CI 8/8, **not merged**; merging is a separate human gate).
**Status:** **Cloud Deployed — Validation In Progress.** Stopped at the TC-1 gate.

## 1. Timing (Asia/Qatar, 2026-09-29)

| Stage | Time |
|---|---|
| Start (pre-deployment review) | 10:49:46 |
| First live write (package) | 11:29:18 |
| Metadata + re-point | 11:31:44 |
| Designer | 11:37:11 |
| Cloud validation | 11:38:49 → ~11:50 |
| Stopped at TC-1 gate | ~11:55 |
| Elapsed | ≈ 1.1 h active; no waiting |

## 2. Pre-deployment review (read-only)

- PR #169 open at `fe4df34c` = reviewed SHA; CI 8/8; `main` unchanged at `a4c04fd2`; tracked tree clean.
- Package rebuilt from a clean detached checkout of `fe4df34c`: `qdb_EdpRuleRuntime.1.0.0.nupkg`, SHA-256 `730fad8c9e886ca8616fed6bc551faaab5052a237e1a6db09110a3cf26b88a23`; `verify-package.ps1` PASS (release 1.1.0, record 1.0.0, 9 IPlugin types, unsigned); both assemblies 1.1.0.0; contract resource embedded.
- **No drift:** 14 rules / 14 versions byte-identical to the TC-3 capture (last modified 2026-07-21); 0 rule keys; no entity keys; package record unchanged since 2026-08-19 (content `c0fddf94…`, assembly 1.0.24.0).
- Dry runs: 30 registrations, 10 metadata creates, 0 incompatibilities, 29 moves, 0 problems; RuleKey plan 14 writes / 0 problems; declared-fact coincidences 0.
- Baseline validation on the old runtime: 8/37 (replay 600/0; B1–B4 absent; old engine **reads** the same-named column for a declared fact).

## 3. Rollback material (kept outside the repository)

Package content before the update (`c0fddf94…`), the registration snapshot and change log (`deploy/.a7-runs/2026-09-29T08-31-45-491Z/`), all 72 pre-deployment designer web resources, rules and rule versions as JSON. Signed 1.0.23 remains registered.

## 4. What was written

| Step | Write | Result |
|---|---|---|
| 1 | `PATCH pluginpackages(5a200f1a-…)` content → `730fad8c…` (`deploy/a7-package.mjs`) | stored content verified; assembly `EDP.RuleRuntime.Crm` 1.0.24.0 → **1.1.0.0**, same id; 9 plug-in types intact |
| 2 | 10 Custom API arguments created in `BusinessRuleEngine` | ChildCollectionName, CorrelationId (requests) and ChildResultsJson, ExecutionId, Outcome, ProvenanceJson (responses) on EvaluateDecision; RuleKey on GetPublishedVersion, GetRuleHistory, GetRuleMetadata, ResolveEffectiveVersion |
| 3 | 29 re-binds (21 Custom APIs + 8 entity steps) to the 1.1.0 package | `VERIFIED: every item is bound as planned`; re-run: 30 in place, 0 to do |
| 5 | Designer: 9 web resources updated/created and published | deployed content = build, byte for byte. `.ttf` and `.wasm` skipped by the deploy script, as in the previous deployment (pre-existing) |
| — | Execution-log rows from validation calls | append-only by design |

**Deleted: nothing.** No security, role, schema or rule change.

## 5. Validation of the deployed runtime

`node deploy/verify-release1.mjs` → **37/37 PASS**:
- legacy replay through the deployed runtime (TestRule, no writes): **600 cases, 0 differences**;
- B1: a declared fact is not read from a same-named record column (`column-not-read`); caller-supplied fact; the live chained rule set feeds `tier` downstream;
- B2: MATCHED, NO_MATCH, EDP060, EDP061, EDP062 (quoted number, overflow, boolean string, non-ISO date, array), EDP063, EDP067 notice, lenient warning; unparseable InputsJson → HTTP 400;
- Outcome: all four values, including ENGINE_ERROR; Success/Matched derived;
- B3: duplicate name → earliest rule with `nameIsAmbiguous`/`matchCount 5`; RuleVersionId and RuleId resolution; EDP070 and EDP071 → HTTP 400; orphaned version still addressable;
- B4: Outcome, ExecutionId and every provenance field; identity of the stored version; ContentHash equals the independently computed hash; CorrelationId echoed, 100 accepted, 101 → HTTP 400; strict vs lenient hashes differ and equal the shared vectors; no InputsDigest; analytics `rejected` count increments.

ContentHash sweep: **8/8** Published live versions hash in the deployed runtime exactly as computed beforehand (`deploy/test/live-content-hashes.json`).

Registration smoke (`a7-repoint --smoke`): 3/3, including ValidateRule EDP041.

Designer in CRM (`main.aspx?pagetype=webresource&webresourceName=qdb_edp_designer/index.html`, signed-in session): loads; the legacy chained rule opens **Lenient (legacy)**, its `tier` shows as **"tier (fact)"** in the picker and in the Facts panel, and the published version is read-only with the contract switch disabled. The browser extension then disconnected; new-rule and RuleKey UI behaviours were not exercised live (covered by 156 unit tests).

## 6. Stopped at TC-1

No enabled identity other than System Administrator holds any EDP security role, and there is no non-admin application user. A non-admin test therefore needs a security change, which the sponsor made a stop-and-report condition and the ship decision excludes.

- **Required:** one authorised non-administrator identity (a named test user or application user) holding the consumer role **EDP Business User** (and, for the designer path, **EDP Rule Author**).
- **Why:** EvaluateDecision and the metadata functions require `prvReadqdb_edp_rule`; the execution log needs create on `qdb_edp_ruleexecutionlog`.
- **Current model:** six EDP roles exist (Rule Author, Business User, Rule Administrator, Rule Reviewer, Rule Publisher, Read-Only) with no members.
- **Recommendation:** the sponsor names or approves the identity and the role assignment; TC-1 then runs through `verify-release1.mjs` under that identity.

Not done, by design: RuleKey backfill, uniqueness key, RuleKey SUPPORTED, removal of signed 1.0.23, merging PR #169.
