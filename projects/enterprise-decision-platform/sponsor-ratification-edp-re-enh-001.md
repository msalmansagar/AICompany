# EDP-RE-ENH-001: human sponsor ratification

**Feature ID:** EDP-RE-ENH-001 (Rule Engine 1.1.0 contract enhancements)
**Ratified by:** the human sponsor, in session, 2026-09-28
**Recorded by:** the delivery agent, verbatim in substance. The agent does not ratify; it records.
**Ratifies:** `ceo-decision-edp-re-enh-001.md` (APPROVE WITH CONDITIONS) and `brd-edp-re-enh-001-release1-contract.md` **v1.1**

**Effect:**
- Authorises **B1–B4 source implementation**.
- Does **not** authorise any live deployment, live data change or live schema change. Each of those remains a separate, explicit human authorisation (HD-3).

---

## HD-1: ratification

**RATIFIED:** EDP-RE-ENH-001, BRD v1.1, and the CEO decision (APPROVE WITH CONDITIONS).

**Approved Release 1 scope:**
- **B1 / A1:** declared facts.
- **B2 / A5:** strict typed/required input contract.
- **B3 / A2:** stable RuleKey.
- **B4 / A4-lite:** execution provenance, **excluding** `InputsDigest`.

**Deferred:**
- `InputsDigest`.
- Per-member rule-set provenance (US-05).
- Moving existing legacy rules to strict (US-04), except where needed for tests.
- Persisted `ContentHash`.
- Server-enforced RuleKey immutability.
- The other Release 2 items already identified.

## HD-9: migration order. **Option Y, deploy first**

1. Deploy the complete Rule Engine 1.1.0 capability.
2. Existing ID and name lookup remain fully operational.
3. The RuleKey capability exists but **must not yet be advertised** as a supported consumer integration identity.
4. Backfill the approved RuleKeys into the 14 existing rules.
5. Verify:
   - every applicable rule has a key;
   - every key matches the approved format;
   - uniqueness holds case-insensitively;
   - no unexpected records were modified.
6. Create and activate the Dataverse uniqueness key.
7. Wait until Dataverse reports the key **Active**.
8. Re-read and prove uniqueness.
9. Only then declare RuleKey supported for consumers.

**No authoring freeze** is required for the normal migration.

> **Invariant:** RULEKEY MUST NOT BE EXPOSED AS A SUPPORTED CONSUMER IDENTITY UNTIL BACKFILL IS COMPLETE AND DATAVERSE UNIQUENESS IS ACTIVE.

**IC-4 is amended accordingly** (§ Amended conditions below). None of this sequence is executed during source implementation.

## HD-2: RuleKey strings

**Approved:** the 14-rule mapping recorded in BRD v1.1 Appendix A. The implementation must verify the exact mapping before any future live backfill.

**Requirements that remain:**
- lower-case;
- a stable semantic identity;
- case-insensitively unique;
- no environment name, GUID or date;
- duplicate display names do not require a rename or retirement;
- a copied logical rule receives a new RuleKey;
- a deleted or retired RuleKey is never reused.

The approved strings must not be changed silently. A conflict or ambiguity stops that part and is reported.

## HD-5: Release 1 immutability

**Acknowledged and accepted:** Dataverse does not provide full server-side RuleKey immutability in Release 1.

**Release 1 MUST enforce, through every supported Rule Engine path:**
- once a RuleKey is populated, normal Rule Engine APIs cannot change it;
- the designer cannot change it;
- supported SDK and gateway operations cannot change it;
- copy/clone requires a new key;
- version creation keeps the logical rule's existing key.

Direct administrator modification in Dataverse remains a privileged governance risk in Release 1. Full server-enforced immutability is Release 2.

## Contract confirmations given with the ratification

- **B1:** an input is RECORD-BOUND or a DECLARED FACT, never both. The source order is caller `InputsJson`, then upstream rule output during chaining, then null. A same-named Dataverse column is never read. The legacy `tier` rule stays compatible. Deploy/acceptance verification checks that the target org has not introduced a conflicting assumption.
- **B2:** STRICT only when `schemaVersion = "1.1"` **and** `inputContract = "strict"`. A contradictory combination fails validation (EDP065). No heuristics.
  - Numbers: JSON numbers only. `"5000"` is rejected. Decimal and money never pass through binary floating point. Integral types reject fractions. Overflow is rejected.
  - Booleans: JSON `true`/`false` only.
  - Date and DateTime: the approved ISO-8601 contract.
  - Choice: integral numeric only, no labels.
  - Strict Lookup facts: unsupported (EDP066).
  - A collection never silently satisfies a scalar.
  - Extra input: ignored, with an EDP067 notice.
- **Outcome:** `MATCHED` / `NO_MATCH` / `INPUT_REJECTED` / `ENGINE_ERROR`; HTTP 200 for an executed request. HTTP 400 is reserved for a malformed request or contract invocation, including EDP070. Existing fields are kept, their relationship to `Outcome` is documented, contradictory combinations are impossible, and invariant tests prove it.
- **B3:** lookup precedence is RuleVersionId (where the operation accepts a version), then RuleId, then RuleKey, then Name. Resolution is extracted from `RuleServicePlugin`, and both unordered name-lookup paths use the extracted deterministic resolver. Upper case is rejected; reuse is prohibited; a copy gets a new key; a new version keeps the key.
- **B4:**
  - `EvaluateDecision` exposes `Outcome`, `ExecutionId`, `RuleId`, `RuleKey`, `RuleVersionId`, `VersionNumber`, `ContentHash`, `EvaluatedOnUtc` and `CorrelationId`.
  - No `InputsDigest`, and no US-05.
  - `ResolveEffectiveVersion` returns identity and resolution only. Caller business identifiers remain caller-owned.
- **ContentHash:** before implementing it, define the exact canonical bytes, document them, use one shared definition, publish at least five deterministic test vectors, and prove identical hashes across every implementation that computes or validates it. It covers executable content only, not environment ids, deployment metadata, timestamps or audit metadata. SHA-256. Not persisted in Release 1.
- **Registration contract:** stays authoritative. Every B3/B4 parameter or property is added there first, and it keeps driving cloud metadata, the on-prem manifest, parity and the source-vs-contract CI checks.
- **Cloud / on-prem:** one semantic contract, two deployment targets. The status stays "On-Prem Compatible by Design — Runtime Validation Pending".

## Amended conditions

| ID | Condition as ratified |
|---|---|
| **IC-4 (amended)** | Every live migration step is retried, read back and verified. **RuleKey backfill and uniqueness activation happen AFTER the 1.1.0 deployment** (HD-9, Option Y). RuleKey must not be advertised as supported for consumers until backfill and uniqueness activation are proven complete. *(This supersedes the CEO decision's IC-4 wording "the alternate key created and backfilled before the 1.1.0 runtime is pointed at it".)* |
| IC-1, IC-2, IC-3, IC-5 | Unchanged from the CEO decision |
| TC-1…TC-4 | Unchanged. TC-1 live non-admin validation happens at cloud acceptance, **not** during source implementation. TC-2 minimum list as given. TC-3 is release-blocking, with a deterministic replay harness where practical |

## Estimate baseline

**41.5 h** of net-new engineering (BRD v1.1 §12) is the baseline. It is not re-estimated silently.

## Hard stops (unchanged)

- No live write of any kind during source implementation.
- No Debt Collection changes, consumer-specific APIs or rules, or DCP integration, and no Phase 11.
