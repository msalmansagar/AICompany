# ADR-DCP-15 — A Collection Case number has exactly two sources, and DCP invents no format

**Status:** Accepted (Phase 3) · **Date:** 2026-09-18 · **Deciders:** user (Phase 3 authorisation), architect
**Relates to:** KI-39, KI-49.

## Context

The Phase 3 authorisation required DCP to use QDB's existing auto-number capability, not to create
another auto-number engine, and **not to invent a final business-facing numbering format if QDB
configuration or business convention does not establish one**.

Investigation of the sandbox on 2026-09-18 found:

- `crmi_autonumberingsetup` — QDB's auto-numbering configuration table, with a live plugin that creates
  and maintains the numbered attribute — **holds 0 rows**;
- `qdb_autonumberconfig` — **holds 0 rows**;
- no `qdb_` table carries a cloud-native `AutoNumberFormat`, so no format is observable from metadata
  either.

There is therefore no QDB numbering convention to follow, and no mechanism configured to defer to. A
case still needs a human-readable identifier from the moment it is created.

## Decision

`qdb_casenumber` has exactly two possible sources, selected by deployment configuration
(`qdb_platformconfiguration.qdb_featureflags.caseNumbering`), with no third and no hidden default
beyond the conservative one:

| Source | Behaviour |
|---|---|
| `Provisional` (fallback) | DCP composes `<sourceSystem>-<facilityNumber>-E<episode>`. Unique per facility and episode **by construction**, readable, and obviously interim. |
| `PlatformConfigured` | DCP writes **no** number at all and omits the column; the configured QDB mechanism populates it. |

1. **`Provisional` is the fallback, and it is a conservative reading rather than a guess.** Deferring to
   a mechanism that holds no configuration would produce cases with no number; composing one from
   business identity produces a number that is correct, unique and plainly temporary.
2. **No new numbering engine, no sequence table, no counter.** The interim number needs no state: it is
   derived from identity the case already carries.
3. **Uniqueness is enforced by the platform, not by the composition.** The `qdb_casenumber_uk` alternate
   key is what actually refuses a duplicate — proved live, not assumed.
4. **The final business-facing format stays `TBD — Requires QDB Confirmation`.** When QDB configures
   `crmi_autonumberingsetup` for `qdb_collectioncase`, the switch is a configuration change: set
   `caseNumbering: 'PlatformConfigured'`. No code changes.
5. **The repository takes the number as an input.** Neither the repository nor the sync service knows
   how a number is made.

## Consequences

**Positive.** Cases are identifiable today, by something a person can read and correlate to a facility,
without committing QDB to a format it has not chosen. Switching to the real mechanism costs a
configuration row.

**Negative.** Existing cases created under `Provisional` will carry interim numbers after the switch.
Whether those are renumbered is a QDB decision, not DCP's; nothing in the platform depends on the
number's shape, so either answer is workable.

**Neutral.** The composition embeds the source system, which makes numbers longer than a sequence would
be, and makes them sort by facility rather than by age. Both are acceptable for an interim identifier
and neither is worth a counter.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Invent a format such as `CC-2026-000123` | Exactly what the authorisation forbade; it would look final and would be adopted |
| Add a counter table and a sequence plugin | A second auto-number engine, forbidden by the Master Prompt and by the Phase 3 instruction |
| Leave `qdb_casenumber` empty until QDB configures the mechanism | Blanks collide on the alternate key, and officers get cases with no identifier |
| Use the record GUID as the number | Not readable, not correlatable to a facility, and a GUID in a business field is what Article V forbids |

## Evidence

| Proof | Where |
|---|---|
| Two sources, composition, and the omit rule | `packages/domain/src/caseNumbering.ts` |
| Live: a case is created with the provisional number | Phase 3 smoke |
| Live: a duplicate case number is refused by the alternate key — "Entity Key Case Number violated" | Phase 3 smoke |
| Live: QDB's mechanism is present and unextended, no cloud-only `AutoNumberFormat` introduced | `verify-qdb-schema.mjs` auto-number checks |
| Tests | `packages/domain/src/caseNumbering.test.ts`, `collection-configuration.test.ts` |
