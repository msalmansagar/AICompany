# ADR-003 — No third-party libraries in the plugin

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect; recorded in `dependencies.md` |
| Relates to | Article X; §6, §7, §8; PAT-004 |

## Context

CRM plugins run in the sandbox on .NET Framework 4.6.2 (built at 4.7.1,
GOT-005), deployed as one merged+signed assembly, with no file system, outbound
HTTP only, and reflection-heavy code discouraged. The company rule is
adopt-over-build, so candidates were considered: Quartz.NET/Hangfire
(scheduling), Cronos/NCrontab (calendar), JWT libraries/Hashids (tokens),
json-rules-engine/NRules (trigger evaluation), Twilio/SendGrid/MailKit (dispatch).

## Decision

Build the survey orchestration with **the .NET base library and the CRM SDK
only**; adopt no third-party library on the plugin side. Specifically:
scheduling is fixed calendar dates (a few lines of date math, ADR-005);
triggers are "status enters a configured set" + counts (no rules engine needed,
ADR-006); tokens use `System.Security.Cryptography.RandomNumberGenerator`
(ADR-004); SMS/email are CRM-record hand-offs, not SDK integrations.

This is the inverse of PAT-004 ("adopt point libraries, build the engine"):
here the sub-problems are small enough that the engine is the only part, and the
sandbox makes most libraries impractical or unsafe.

## Consequences

- Smallest possible attack/licence surface; nothing to ILMerge or vet.
- No licence traps (the EPPlus/iText class of problem) on the plugin side.
- Slightly more hand-written date/token/count code — all unit-tested (§14).
- **Review trigger:** if the architecture later adds a component *outside* CRM
  (a host process, gateway, or reporting layer), re-run GitHub research — these
  constraints do not apply there (`dependencies.md`).
