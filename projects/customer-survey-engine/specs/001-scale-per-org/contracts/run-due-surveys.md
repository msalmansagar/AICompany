# Contract: `qdb_srv_RunDueSurveys` (changes for 001-scale-per-org)

Callers: the Windows Scheduled Task script (`scheduler/Invoke-RunDueSurveys.ps1`) on-prem, the cloud flow,
administrators. Access unchanged: System Administrator or Survey Scheduler (`SchedulerAccessCheck`).

## Inputs

| Input | Type | Change | Values |
|---|---|---|---|
| `RunDate` | string, optional | unchanged | `yyyy-MM-dd`; empty = today (UTC) |
| `Pass` | string, optional | **new accepted value** | `OneTime` · `Daily` · **`RecordFailure`** · empty = OneTime + Daily (unchanged) |

`Pass = RecordFailure` does no survey work. It adds 1 to the failed-call count of the scheduled trigger whose
run is in progress (status Sending) and, at the threshold in Survey Settings, marks it Stuck. With no run in
progress it does nothing and says so. It is called only after a failed `Pass = Daily` call.

## Outputs (unchanged shape)

| Output | Type | Change |
|---|---|---|
| `Summary` | string | Scheduled part reports the trigger in progress, e.g. `Scheduled: "HL quarterly" 2026-Q4 running, 4,200 evaluated (4,100 invited, 80 postponed, 20 suppressed); 2 more due today.` or `… completed …`, and `… is Stuck: <reason>` |
| `IsComplete` | boolean | `false` while any scheduled run for the day is still running (unchanged meaning: call again) |

An unknown `Pass` value is refused with the existing message naming the allowed values (now including
`RecordFailure`).

## Scheduler script behaviour

```text
OneTime pass loop (unchanged)
Daily pass loop:
  call Pass=Daily until IsComplete
  on a failed call: call Pass=RecordFailure (its own error is logged, not fatal), log, stop the Daily loop
exit 1 if either pass failed (unchanged)
```

## Trigger form (UI contract)

For a trigger of kind Scheduled, a read-only **Run** section shows: Run Status, Period, Run Started On,
Customers Evaluated, Invited, Postponed, Suppressed, Last Updated, Run Message. Hidden for event and milestone
triggers; the one-time section is unchanged.
