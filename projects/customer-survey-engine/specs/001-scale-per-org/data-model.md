# Data Model: Scheduled Surveys at HL Scale (001-scale-per-org)

All changes are additive on existing SurveyEngine tables. Applying them on the cloud org (provisioning) needs
the CEO's explicit go-ahead; on-prem they arrive in the next kit.

## Scheduled run progress — on `qdb_survey_trigger` (existing table)

One run per trigger and period, stored on the trigger row. **Reused** columns come from the one-time feature
(Addendum D); **new** columns are marked.

| Column | Type | Reused / new | Meaning for a scheduled trigger |
|---|---|---|---|
| `qdb_run_status` | choice | reused + **new option** | Not sent (100000000) · Sending = running (100000001) · Sent = completed (100000002) · Failed (100000003, one-time only) · **Stuck (100000004, new)** |
| `qdb_run_period_key` | text (50) | **new** | The period the run belongs to, e.g. `2026-Q4`, `2026-12`, `2026` (the same key as the invitations' dedupe key) |
| `qdb_run_started_on` | date-time | reused | When the run for this period started |
| `qdb_run_cursor` | memo (4000) | reused | Saved position: page number and paging cookie (or page number only for "active in a source") |
| `qdb_run_evaluated_count` | whole number | **new** | Customers evaluated so far in this period's run (invited + postponed + suppressed + already had it) |
| `qdb_invited_count` | whole number | reused | Invited so far |
| `qdb_postponed_count` | whole number | reused | Postponed so far |
| `qdb_suppressed_count` | whole number | reused | Suppressed (logged) so far |
| `qdb_run_failed_calls` | whole number | **new** | Consecutive failed scheduler calls at the current position; reset to 0 by a successful page |
| `qdb_run_progress_on` | date-time | **new** | When the run last moved (the form's "last updated") |
| `qdb_run_message` | memo (2000) | reused | Progress text or, when Stuck, the reason |

**Shown read-only on the trigger form** for a scheduled trigger (FR-005): run status, period, started on,
customers evaluated, invited, postponed, suppressed, last updated, message. Writes come only from the engine
(SYSTEM); the trigger validation step (Addendum D) already lets run-record writes through.

### State transitions (per trigger and period)

```text
Not sent ──(due date, first page)──▶ Sending ──(last page)──▶ Sent (completed)
               Sending ──(RecordFailure, failed calls ≥ threshold)──▶ Stuck
               Not sent ──(RecordFailure, failed calls ≥ threshold; first page kept failing)──▶ Stuck
               Stuck ──(first Daily call whose run date is later than the date of qdb_run_progress_on,
                        page succeeds)──▶ Sending
Sent for period P ──(next period's due date)──▶ Sending for period P+1
```

### Validation rules

- Only the engine writes run columns. A run for period P is never restarted for P (the dedupe check would make
  it a no-op anyway).
- `qdb_run_failed_calls` ≥ 0; set to 0 on every successful page.
- `qdb_run_message` is cut to 2,000 characters before it is written (a Stuck reason may come from a long error).
- `qdb_run_cursor` for "active in a source" holds the last customer id read (resume by key, research R3);
  for "all active customers" the paging cookie and page number, as for one-time triggers.
- `qdb_run_progress_on`'s date decides when a Stuck run is next retried (research R5).
- New columns are audit-enabled like the rest of `qdb_survey_trigger` (Article VI).
- Progress writes are conditional on the row version read at the start of the page (two overlapping calls:
  one advances, the other stops without writing).

## Survey Settings — on `qdb_survey_settings` (existing table)

| Column | Type | New | Meaning |
|---|---|---|---|
| `qdb_stuck_after_failed_calls` | whole number (1–10), **required**; code has no fallback (empty → refused). Dataverse whole-number columns carry no default, and the seed never changes an existing row, so 3 is set by the seed on new orgs and by the deploy step on existing ones (cloud: go-ahead PATCH; on-prem: RUNBOOK) | **new** | How many failed calls in a row at one position mark a scheduled run Stuck (FR-011; Article V: a threshold lives in configuration) |

## Unchanged entities

- **Invitation**: one per setup, customer and period; dedupe key `{setup}|{customer}|{period}` and its
  alternate key are unchanged.
- **Suppression log**: unchanged reasons. The only difference is R2's Drop case (Fatigue instead of
  PriorityLost).
