# F2 (EDP-FACT-001 F2a/F2b): non-blocking review follow-ups

**Source:** `code-reviewer` merge-readiness review of PR #105 + PR #107, combined diff against `28b36d44`, 2026-09-27. Verdict **MERGE-READY**, no blocking or security findings.
**Merged as:** #105 → `4ee8951c`, #107 → `581d0592` (2026-09-27).
**Status:** recorded, **not fixed**. Deliberately left out of the merge resolution. None is part of Rule Engine 1.1.0 scope unless scheduled.

Each item fails **loudly** today: an exception or a refusal, never a silent wrong decision. That is why none blocked the merge.

| # | Finding | Where | Failure scenario | Classification | Suggested slot |
|---|---|---|---|---|---|
| FU-1 | `GroupSelector.Beats(…, bool preferHigher)` is a boolean flag parameter, which the coding rules ban | `runtime/src/EDP.RuleRuntime/Retrieval/GroupSelector.cs` (~L56) | None at runtime; maintainability only | **Code-quality debt** (Boy Scout) | Next change that touches `GroupSelector` |
| FU-2 | Validator and runtime disagree on an "empty" retrieval filter. `RuleValidator.IsEmpty` counts quantifiers, but `PopulationRetriever` checks only conditions and groups | `Compiler/RuleValidator.cs` (`IsEmpty`); `EDP.RuleRuntime.Crm/Retrieval/PopulationRetriever.cs` (guard) | A retrieval whose filter holds only a quantifier passes author-time validation (no EDP052), then throws "no filter" at runtime | **Existing defect, minor** (author-time signal wrong; runtime refuses safely) | Bug-fix; small. Before the first real retrieval rule is authored |
| FU-3 | No author-time diagnostic for filter operators that cannot be pushed to Dataverse (`IsEmpty`, `IsNotEmpty`, `Contains`, negated groups) | `Compiler/RuleValidator.cs` (retrieval validation); `Retrieval/RetrievalFilterTranslator.cs` (`MapOperator` throws) | An author saves and publishes a retrieval using `Contains`; the first evaluation throws `NotSupportedException` | **Usability gap / should-have** | With the retrieval authoring UI (deferred in FACT-001) |
| FU-4 | A null group-by key throws `ArgumentNullException` | `Retrieval/GroupSelector.cs` (`SelectPerKey`) | A retrieved record has the group-key attribute present but null; the dictionary rejects a null key and the evaluation fails with an unhelpful exception | **Existing defect, minor** (loud failure, poor message) | Bug-fix; decide semantics (skip vs. its own "null" group) with FU-2 |

None of these touches the Release 1 contract (B1 to B4) or the Part R release work. Scheduling them is the sponsor's decision.
