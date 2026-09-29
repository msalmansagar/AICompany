# ADR-21: RuleKey Identity and One Rule-Identity Resolver

**Status:** Accepted (architecture gate 2026-09-28, `ceo-decision-edp-re-enh-001-architecture.md`, APPROVE WITH CONDITIONS; sponsor-ratified). Implemented in source on `feat/edp-re-r1-contract`; **not deployed**.
**Date:** 2026-09-28
**Decided by:** Solution Architect.
**Implements:** EDP-RE-ENH-001 v1.1 FR-B3-01…16; sponsor ratification HD-2, HD-5, HD-9; IC-1.

---

## Context

Rules are addressed today by GUID or by a display name that is not unique. Name-to-rule resolution is implemented **twice**, and both copies use `TopCount = 1` with no ordering:
- `RuleMetadataPlugin.ResolveRuleIdByName`;
- `RuleServicePlugin.ResolveRuleId`.

The two copies also apply **different identifier precedence**: metadata checks version → rule → name, while the service plugin checks rule → version → name. `RuleServicePlugin.cs` is already 635 lines, and the BRD forbids growing it (IC-1).

## Decision

### One resolver
`EDP.RuleRuntime.Crm.Identity.RuleIdentityResolver` becomes the only code that turns identifiers into a rule. Both plugins call it; the two private copies are deleted.

**Precedence (ratified):**
1. `RuleVersionId`, where the operation accepts a version;
2. `RuleId`;
3. `RuleKey`;
4. `RuleName`.

**Conflicts:** when more than one identifier is supplied, each is resolved, and if they name different rules the call fails with **EDP070** (HTTP 400). Agreeing identifiers are fine.

**RuleKey lookup:**
- `qdb_edp_rulekey eq <key>` exactly.
- A key that breaks the format (`^[a-z0-9]+([._-][a-z0-9]+)*$`, 3–100 characters, lower case only; from `contract/rule-engine-contract.json`) is refused with **EDP071** (HTTP 400). It is never normalised.
- No match: the same "no matching rule" error the name path gives today.

**Name lookup (FR-B3-08):**
- Every rule with that exact name, ordered by `createdon` ascending, then by rule id.
- The first is selected, deterministically.
- The result carries `nameIsAmbiguous` and `matchCount`, which `ResolveEffectiveVersion`, `GetPublishedVersion` and `GetRuleMetadata` add to their `ResultJson`.

**Contract:** `RuleKey` is an optional String request parameter on `GetPublishedVersion`, `ResolveEffectiveVersion`, `GetRuleHistory` and `GetRuleMetadata`. It is declared in `deploy/registration/rule-engine-registration.json`, from which the on-prem manifest is regenerated. Their `ResultJson` reports `ruleKey`.

### Writing keys (HD-5: Release 1 enforcement on every supported path)
- **No Rule Engine API, SDK or gateway operation writes `qdb_edp_rulekey`.** This is enforced by a static CI check.
- **The designer** is the only supported writer:
  - a key is required when a rule is **created**;
  - on an existing rule the key field is **read-only once populated**; it may be set once while empty, for the backfill;
  - "Save as new rule" / copy **clears the key and requires a new one**;
  - creating a **new version** never touches the rule record, so the key is kept automatically.
- **No reuse after deletion:**
  - `DeleteAuditPlugin` records the deleted rule's key in its append-only audit details.
  - The designer refuses a key that is in use on a live rule or appears in the deletion audit.
  - A retired rule keeps its record, and therefore its key.
- **Residual (HD-5, accepted):** a privileged user writing the column directly in Dataverse is not blocked in Release 1. Server-side immutability is Release 2.

### Migration (HD-9, Option Y), executed only with explicit live authorisation
1. Deploy 1.1.0.
2. `deploy/a7-rulekey.mjs` backfills the 14 approved keys:
   - dry run by default;
   - it refuses when a rule already has a different key, a rule is missing, or a key would collide;
   - it touches **only** the 14 named rule ids and reports "no unexpected records modified".
3. The verifier checks completeness, format and case-insensitive uniqueness.
4. The script creates the alternate key.
5. It polls until the key's `EntityKeyIndexStatus` is **Active**.
6. It re-reads everything and proves uniqueness.
7. Only then is RuleKey declared supported.

**Invariant:** RuleKey is **not advertised** as a supported consumer identity until steps 2–6 are proven.

### Implementation notes (2026-09-28)

- **Resolution rule.** The highest-precedence identifier resolves the rule; every other identifier supplied must describe that same rule (RuleId equal, RuleKey equal ordinally, RuleName equal case-insensitively, as Dataverse compares names), or the call fails with EDP070.
- **Orphaned versions.** Three live versions have no parent rule. They remain addressable by `RuleVersionId` alone, exactly as before 1.1.0; any other identifier with them is EDP070, and rule-level operations (history, documentation, effective version, scenarios) refuse them.
- **A key held by two rules** before the uniqueness key exists is refused rather than guessed ("keys are not yet unique"); it is also a gate failure in the migration.
- **FR-B3-11 (AC-5).** `deploy/a7-rulekey.mjs` creates the key with `MSCRM.SolutionUniqueName: BusinessRuleEngine` (the unmanaged solution that owns `qdb_edp_rule`, verified read-only), so the key definition travels with solution export and import. Key values are rule data: they travel with the rule records (data migration), and because they are environment-independent the same key resolves the same rule everywhere.
- **Retired keys (FR-B3-14).** `DeleteAuditPlugin` records `ruleKey=<key>` in the append-only delete audit; the designer's reuse check refuses such keys. Server-side enforcement remains Release 2.
- **HD-5.** Only the designer's create / set-once path and the approved migration tool write `qdb_edp_rulekey`; `deploy/test/rulekey-write-guard.test.mjs` fails the build otherwise.

## Consequences

**Positive:**
- One place for identity, with the same precedence and determinism everywhere.
- `RuleServicePlugin` shrinks instead of growing.
- Duplicate display names stop being a correctness problem.

**Negative, accepted:**
- An extra query when several identifiers are supplied, which is rare.
- Reuse prevention depends on the audit trail, which is append-only (ADR-13), until Release 2 adds server enforcement.
