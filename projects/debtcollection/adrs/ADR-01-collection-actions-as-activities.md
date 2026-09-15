# ADR-DCP-01 — Collection interactions as custom activity entities

**Status:** Accepted (2026-09-14) · **Deciders:** architect, ceo
**Full context, alternatives, and consequences:** `../facts-and-analysis.md` §9 (carried by reference).

## Decision (summary)
Model collection interactions as **custom activity entities** (`IsActivity=true`), split into two types on
**privilege**: `qdb_collectionaction` (call, meeting, supervisor review, field visit, manual note — no outbound
side-effect) and `qdb_communication` (SMS, email, official letter, call log — dispatches + delivery lifecycle).
`regardingobjectid` is **polymorphic** (Contact/Account, `qdb_loanfacility`, `qdb_collectioncase`) so an
interaction **never requires a case** — the fix for manual case creation (D-2). PTP, restructure, legal,
insurance, dispute remain **normal entities** with full lifecycle. Communications are recorded **once**.
Identical schema + logical names deployed to both orgs (R-05 mitigation).

## Binding constraints
1. Plugin blocks Update/Delete once `statecode=Completed` — incl. sysadmin (removing role Delete is not enough).
2. `subject` composed by a plugin. 3. Stop-contact + consent evaluated in the **router** before any
`qdb_communication` is created; a blocked attempt is written as evidence. 4. Outcome codes from config.
5. Field visit is an action type, not the deferred module-11 entity.

## Consequences
Native Timeline aggregates both types for free (within one org); `ActivityPointer` reporting; native queueing.
Costs: irreversible activity flag, no PartyList (multi-recipient needs explicit lookups), activities are
deletable so immutability rests on the plugin, polymorphic lookups cost the frontend (read `_value` +
`lookuplogicalname`, `$expand` the target type).
