# ADR-DCP-01 — Collection interactions as custom activity entities

**Status:** Accepted — Amended 2026-09-17 (see ADR-DCP-08) · **Deciders:** architect, ceo
**Full context, alternatives, and consequences:** `../facts-and-analysis.md` §9 (carried by reference).

## Decision (summary)
Model collection interactions as **custom activity entities** (`IsActivity=true`), split into two types on
**privilege**: `msst_dcpcollectionaction` (call, meeting, supervisor review, field visit, manual note — no outbound
side-effect) and `msst_dcpcommunication` (SMS, email, official letter, call log — dispatches + delivery lifecycle).
`regardingobjectid` is **polymorphic** (Contact/Account, `msst_dcploanfacility`, `msst_dcpcollectioncase`) so an
interaction **never requires a case** — the fix for manual case creation (D-2). PTP, restructure, legal,
insurance, dispute remain **normal entities** with full lifecycle. Communications are recorded **once**.
Identical schema + logical names deployed to both orgs (R-05 mitigation).

## Binding constraints
1. Plugin blocks Update/Delete once `statecode=Completed` — incl. sysadmin (removing role Delete is not enough).
2. `subject` composed by a plugin. 3. Stop-contact + consent evaluated in the **router** before any
`msst_dcpcommunication` is created; a blocked attempt is written as evidence. 4. Outcome codes from config.
5. Field visit is an action type, not the deferred module-11 entity.

## Consequences
Native Timeline aggregates both types for free (within one org); `ActivityPointer` reporting; native queueing.
Costs: irreversible activity flag, no PartyList (multi-recipient needs explicit lookups), activities are
deletable so immutability rests on the plugin, polymorphic lookups cost the frontend (read `_value` +
`lookuplogicalname`, `$expand` the target type).

## Amendment (2026-09-17, Phase 0 — Master Prompt §23, §32; Correction Prompt §40)
- **Confirmed:** the first half — collection interactions as a **custom activity entity** (`IsActivity=true`),
  polymorphic regarding, subject composed by plugin, immutability after Completed, outcome codes from
  configuration, field visit as an activity type. Target name: `qdb_collectionactivity` (was
  `msst_dcpcollectionaction`); type and outcome become lookups to `qdb_collectionactivitytype` /
  `qdb_activityoutcome`.
- **Superseded:** the second half — `msst_dcpcommunication` as a second custom activity type split on
  privilege. Communications are the **existing `fax` (SMS/WhatsApp) and `email` entities**, sent through one
  Communication Service — see **ADR-DCP-08**. The "records communications once" rule survives: the fax/email
  row is the record; no duplicate activity per send unless a business rule requires it.
- Consequence for constraint 3: stop-contact + consent are evaluated in the **Communication Service and the
  plugin guard**, not the router (ADR-DCP-09).
