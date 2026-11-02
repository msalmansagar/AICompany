# ADR-20: The `ContentHash` Canonical Form

**Status:** Accepted (architecture gate 2026-09-28, `ceo-decision-edp-re-enh-001-architecture.md`, APPROVE WITH CONDITIONS; sponsor-ratified). Implemented in source on `feat/edp-re-r1-contract`; **not deployed**.
**Date:** 2026-09-28
**Decided by:** Solution Architect.
**Implements:** EDP-RE-ENH-001 v1.1 §5.4a, FR-B4-03, FR-B4-06, MC-4, IC-3.
**Adoption research:** `dependencies.md` DEP-014 (RFC 8785 JCS reference implementation: **BUILD**), DEP-018 (SHA-256 / NFC are built-ins).

---

## Context

`ContentHash` lets a caller prove *which executable rule content* produced a decision. It is only useful if any party can recompute it and get the same bytes. RFC 8785 (JCS) is the nearest standard, but it formats numbers as IEEE-754 doubles, which loses precision on decimal literals, and it does not normalise Unicode. We keep JCS's structure, sorting and UTF-8, and deviate where the BRD requires exactness.

## Decision

The canonical form is a **byte sequence**, defined here, independent of any serialiser. It is produced by two implementations that must agree byte for byte:
- **C#** in the engine core: `EDP.RuleRuntime.Hashing.ContentHash`;
- **TypeScript** in the JS SDK: `computeContentHash`.

Both are tested against **one shared vector file**, `contract/content-hash-vectors.json`, which gives the canonical text and the hash for each case.

### Algorithm

1. **Parse** the executed PCRM JSON. Each implementation uses a tokenizer that keeps every number's **raw source text**; no number is ever converted to binary floating point. Duplicate object keys, including duplicates that appear only after NFC normalisation, make the input invalid.
2. **Exclude non-executable metadata at the top level:** `schemaVersion`, `ruleId`, `name`, `description`, and every property whose name begins with `x-`. The list lives in `contract/rule-engine-contract.json` (IC-3). Everything else is executable and kept, including `inputContract`, `targetEntity`, every input's `type`, `binding`, `via`, `aggregate`, `required`, `nullable` and `source`, and all of `variables`, `retrievals`, `outputs` and `logic`.
3. **Drop every object property whose value is `null`, at every depth.** `null` array elements are kept. Empty objects and arrays are kept.
4. **Objects:** normalise each key to NFC, then sort keys by **UTF-16 code-unit order** (C# `string.CompareOrdinal`; JavaScript default `sort()`), recursively.
5. **Arrays:** keep their order, which is semantic.
6. **Strings:** NFC. Write `"` as `\"`, `\` as `\\`, and U+0000–U+001F as `\u00xx` (lower-case hex; **no** short escapes). Every other character is written as its UTF-8 bytes.
7. **Numbers:** rewrite the raw literal as its exact decimal value, by string manipulation alone:
   - split it into sign, integer digits, fraction digits and exponent;
   - shift the decimal point by the exponent;
   - remove leading zeros from the integer part (keeping one `0` before a point) and trailing zeros from the fraction;
   - drop the point when the fraction is empty;
   - write zero as `0`, never `-0`;
   - an exponent outside ±1000 makes the input invalid.

   So `1.50` → `1.5`, `2.0` → `2`, `1e3` → `1000`, `-0.0` → `0`, `0.000120` → `0.00012`.
8. **Literals:** `true`, `false`, `null` (the last only as an array element).
9. **Layout:** no whitespace anywhere; `,` between members and elements; `:` between key and value.
10. **Encoding:** UTF-8, no byte-order mark.
11. **Hash:** SHA-256 of those bytes, as 64 lower-case hexadecimal characters.

### Scope
- **Computed at evaluation, from the PCRM that was executed.** That includes ad-hoc `PcrmJson` calls.
- **Not persisted in Release 1** (BRD FR-B4-07). A3 in Release 2 may stamp it on the rule version using this same function.
- Rule key, display name, record ids, version numbers, timestamps and audit data are not part of the PCRM content, so they can never affect the hash. **Two rules with identical logic hash identically**; that is intended, since it detects duplicate logic.
- A strict and a lenient variant of the same logic hash **differently**, because `inputContract` changes how the rule evaluates.

### Test vectors (FR-B4-06)

`contract/content-hash-vectors.json` holds at least:
- (a) a minimal rule;
- (b) a rule exercising every input type;
- (c) (b) with its properties reordered, whitespace changed and metadata changed, which must equal (b);
- (d) the strict variant of (b), which must differ from (b);
- (e) an ad-hoc `PcrmJson` payload with number and Unicode edge cases;
- (f) (e) written with a decomposed Unicode string and non-canonical numbers, which must equal (e).

The C# and TypeScript suites both assert every vector's canonical text and hash. CI runs both suites (runtime-net9, sdk-js).

### Implementation notes (2026-09-28)

- C#: `runtime/src/EDP.RuleRuntime/Hashing/ContentHash.cs` and `CanonicalNumber.cs`. TypeScript: the JS SDK's own tokenizer (raw number text and duplicate keys survive, which `JSON.parse` cannot guarantee).
- Vectors: `contract/content-hash-vectors.json`, 12 vectors: the five FR-B4-06 cases (a–e, with the reordered-equals and strict-vs-lenient-differs relations asserted) plus seven that pin individual rules. Both implementations assert every vector in CI.
- AC-4: the replay asserts every captured live rule version hashes.

## Consequences

**Positive:**
- Exact for decimals.
- Independent of serialiser and language.
- Provable across implementations by shared vectors.
- No new dependency.

**Negative, accepted:**
- Two implementations must be maintained. The shared vectors make any divergence a red CI build, never a silent disagreement.
- A tokenizer is needed in TypeScript because `JSON.parse` turns numbers into doubles.
