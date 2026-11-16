# ADR-010 — One-time trigger run model and the 15-minute scheduler

**Project:** CSE-ENG-001 — Customer Survey Engine
**Status:** Proposed
**Date:** 2026-11-16
**Requirements:** FR-CSE-083..088, NFR-CSE-015/016 (BRD Addendum D); CEO answers OQ-D3, OQ-D4
**Amends:** ADR-005 (daily scheduler)

## Context

One-time triggers send once — now from the form, or at a date and time within 15 minutes. An audience can
exceed what one Custom API call can process inside the plugin time limit, and a Send now started from a
browser can be interrupted (form closed, network). ADR-005 runs `qdb_srv_RunDueSurveys` once a day.

## Decision

1. **One service, two callers.** `OneTimeSendService` does the send; `qdb_srv_SendOneTimeTrigger` (form) and a
   new first pass in `qdb_srv_RunDueSurveys` (scheduler) both call it.
2. **Resumable by cursor.** The trigger carries a run record: status (Not sent / Sending / Sent / Failed),
   started/sent times, running totals and `qdb_run_cursor` (paging cookie + page number of the last committed
   page). Each page is processed and then the cursor is committed; the call stops between pages near the
   90-second budget and returns `IsComplete = false`. A Sending trigger left by an interrupted form is
   finished by the next scheduler run.
3. **Exactly once per customer.** Invitations use the dedupe key `{setup}|{customer}|T{triggerId}` and the
   existing alternate key, so overlap between a form loop and a scheduler run cannot duplicate.
4. **Runs once.** Sent or Failed triggers are refused; re-sending means copying the trigger.
5. **Scheduler every 15 minutes.** The Windows Scheduled Task (and the cloud flow) run every 15 minutes. The
   calendar passes (scheduled triggers, postponed release, retention) run on the first call of each UTC day,
   gated by `qdb_survey_settings.qdb_daily_passes_completed_on`, written only after they complete; an explicit
   `RunDate` always runs them.
6. **Same rules as every invitation.** The existing candidate pipeline applies: fatigue (OQ-D4) with the
   trigger's Drop / Postpone, priority, the setup's Digital delivery, version pin, expiry.

## Consequences

- Large audiences complete over several calls without duplicates; progress is visible on the trigger.
- 96 scheduler calls a day instead of one; each is a cheap "anything due?" query unless a send is due.
  QDB IT confirms the load during the on-prem Gate 3 runs.
- ADR-005 stays valid for the caller mechanism; only the cadence and the daily gate change.
