# ADR-005 — Scheduler: daily Custom API via Windows Task / Power Automate

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect |
| Relates to | FR-CSE-031, 032, 033, 042, 058; C-2; A-04; §7 |

## Context

Scheduled triggers (monthly/quarterly/annual), postponed-invitation release and
retention all need a recurring daily run. Dynamics **on-prem 9.1 has no native
recurrence** (C-2), and the solution must run identically on two on-prem orgs and
one cloud org from one codebase. Options: a self-hosting scheduler
(Quartz/Hangfire — needs a host process + storage, rejected in ADR-003);
cloud-only Power Automate (fails on-prem); or an external caller invoking a
self-contained CRM operation.

## Decision

Put all recurring logic in **one unbound Custom API, `qdb_srv_RunDueSurveys`**,
and drive it from an **external daily caller**: a **Windows Scheduled Task** on
each on-prem org and a **Power Automate scheduled recurrence** on cloud. The API
is **idempotent** — every create goes through the invitation dedupe alternate key
and every status flip is conditional — so running it twice on the same day
creates no duplicates (FR-CSE-033).

## Consequences

- One code path for all three orgs; the scheduler choice never affects logic.
- Observable and owned by QDB IT (a Scheduled Task is visible and logged).
- Idempotency is load-bearing: correctness survives overlapping or re-fired runs.
- **Dependency (A-04):** a Windows Scheduled Task can be created on-prem. If not,
  the fallback is an on-prem recurring workflow / custom action calling the same
  API; a CRM bulk-deletion-recurrence hack is explicitly rejected.
- The API may run longer than a sandboxed plugin, so the ~450-invitation daily
  run fits comfortably (§7.3, NFR-CSE-006).

## Amendment 2026-11-14 — who may call it

The API was System Administrator only, so the unattended scheduler account had to
hold System Administrator on each banking org (Phase 6 audit, SEC-01). The CEO decided
that the API also accepts a dedicated **Survey Scheduler** role, held directly or
through a team, and that the scheduler account holds only that role. The role grants
no table rights: the run's work already happens as SYSTEM, so the role only admits the
caller. System Administrator still works, so an administrator can re-run a missed day.
Recorded in `phase-3-ceo-arch-decision.md` (Amendments).
