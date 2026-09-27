# ADR-DCP-13 — Every configurable Collection decision goes through the Rule Engine facade, and fails closed

**Status:** Accepted (Phase 3) · **Date:** 2026-09-18 · **Deciders:** user (Phase 3 authorisation), architect
**Extends:** ADR-DCP-11 (eligibility) to strategy selection and Contact Hold. **Relates to:** KI-44, KI-48.

## Context

ADR-DCP-11 established that eligibility is decided by the QDB Rule Engine and never by a threshold in
application source. Phase 3 adds two more decisions of exactly the same kind:

- **which strategy treats this case** — driven by DPD bands, arrears bands, exposure, product, risk,
  NPL flag, legal and restructure status; and
- **may we contact this customer** — the FR-097 Contact Hold, whose authoritative source QDB has not yet
  named (KI-44).

Either could plausibly have been implemented as "a small amount of matching logic in the service". Either
would then have become the platform's real policy, invisible to the people who own it.

## Decision

One facade, `IRuleEngine`, carries all three decisions: `evaluateEligibility`, `selectStrategy`,
`evaluateContactHold`.

1. **No threshold crosses the seam.** The facade takes facts in and gets a decision out. A DPD boundary,
   an arrears floor, an exposure band or a grace period lives in the ruleset. `ContactHoldInput`
   deliberately carries no deceased flag, so Contact Hold cannot be inferred from QCB DEAD by accident.
2. **The ruleset is named by configuration**, per organisation, on `qdb_platformconfiguration`:
   `qdb_eligibilityrulesetcode`, `qdb_strategyrulesetcode`, `qdb_contactholdrulesetcode`.
3. **The operation is named by configuration too**, in `qdb_featureflags.ruleEngineOperations`, and has
   no default. On cloud each operation is a Custom API; on-premises the same name is a Process Action.
   Both are invoked through `ICrmAdapter.execute`, so nothing in the Collection services knows which
   platform it is running on.
4. **It fails closed, in four distinct ways**, each a named refusal rather than a value:
   - no operation configured for the decision → refused, naming `qdb_featureflags.ruleEngineOperations`;
   - no ruleset code configured → refused, naming the column to set;
   - the operation does not exist or throws → refused, carrying the platform's error;
   - the response does not match the contract — an outcome outside the approved set, or a missing
     `RulesetVersion` → refused. **An unattributable decision about a customer's debt is not a
     decision.** In particular an unreadable Contact Hold answer is a refusal to contact, never
     `hold: false`.
5. **Every refusal is written to `qdb_crmlogs`** with `errorCode = rule_engine_unusable` and the ruleset
   code, then rethrown. Never swallowed, never defaulted.
6. **`StubRuleEngine` exists for tests and controlled demonstrations only.** It holds no thresholds — the
   caller supplies the answer — and it stamps every decision `rulesetVersion = stub-rule-engine`, so a
   decision it made is identifiable in the technical log and on the snapshot long afterwards. A decision
   it was not given an answer for is refused, the same failure mode as the real client.

## Consequences

**Positive.** There is one place to look for "what decides this", and it is configuration. Adding a
fourth decision is an interface method plus a ruleset code, not a new engine. The dual-platform seam is
paid for once.

**Negative.** Nothing decides anything until the rulesets and the operations exist (KI-48): the sandbox
can demonstrate the refusals but not a real eligibility or strategy answer. That is the intended trade —
the alternative is a build that quietly works with invented policy.

**Neutral.** Strategy selection returns a **code**, not a record. The strategy's own definition — its
actions, priority and effective dates — is configuration data that `StrategyService` resolves afterwards.
This keeps the ruleset out of the schema and the schema out of the decision.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Match strategy criteria in the service, reading the bands from `qdb_collectionstrategy` | The bands would be data, but the *matching semantics* — precedence, overlap, tie-breaking — would be code, and that is the policy people argue about |
| Let the ruleset return the full strategy record | The Rule Engine would have to know the DCP schema, and every schema change would become a ruleset change |
| Default `hold: false` when the hold ruleset is unreachable | A failure to read a suppression flag would become permission to contact a customer who must not be contacted |
| One operation with a `decisionType` parameter | Collapses three contracts into one loosely-typed one; a strategy response could then satisfy an eligibility call |

## Evidence

| Proof | Where |
|---|---|
| Facade and fail-closed contract | `packages/domain/src/ruleEngine.ts` |
| Client, response validation, technical logging | `apps/api/src/services/collection/RuleEngineClient.ts` |
| Live: unconfigured operation name refused before any call | Phase 3 smoke |
| Live: operation the organisation does not expose refused, not defaulted | Phase 3 smoke |
| Live: unconfigured Contact Hold ruleset fails closed | Phase 3 smoke |
| Tests | `rule-engine-client.test.ts`, `collection-configuration.test.ts`, `strategy-and-assignment.test.ts` |
