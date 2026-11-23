# Run Due Surveys: scheduler wiring (B5, Addendum D)

`qdb_srv_RunDueSurveys` is an unbound Custom API. Since Addendum D it is called **every 15 minutes** (ADR-010).

**On every call** it sends the One-time surveys whose send time has come, and finishes any "Send now" that was left part-way (for example, the administrator closed the form). A dated survey therefore goes out within 15 minutes of its time.

**On the first call of each run date only**, it does the daily work, in this order:

1. Releases Postponed invitations whose customer fatigue window has ended. If they expired first, or their setup was deactivated, it discards them and writes a suppression-log row.
2. Runs every scheduled trigger that is due on the run date, and continues any scheduled survey still unfinished from an earlier day:
   - monthly triggers on the 1st of each month;
   - quarterly triggers on 1 Jan, 1 Apr, 1 Jul and 1 Oct;
   - annual triggers on 1 Jan.
3. Applies response retention, but only once QDB Compliance has set both the period and the mode in Survey Settings.

The date the daily work last completed is kept in Survey Settings → *Daily Passes Completed On*. Clearing it makes the next call run the daily work again.

**Missed days are caught up automatically** (kit 1.2.0.3, DEF-CSE-003). If the scheduler did not run on some days (for example the server was down on 1 January), the next run does the daily work for each missed date, oldest first, so that period's surveys still go out. It goes back at most **28 days**; older missed dates are named in the summary ("NOT caught up …") and an administrator re-runs each one by passing it as `RunDate`. Re-running a date never creates duplicates and never moves *Daily Passes Completed On* backwards.

| Input | Type | Meaning |
|---|---|---|
| `RunDate` | String, optional | The scheduler's **local** date, `yyyy-MM-dd`. If empty, the API uses today's date in UTC. Pass an earlier date to re-run a missed day. |
| `Pass` | String, optional (kit 1.2.0.2) | `OneTime` = only the One-time surveys; `Daily` = only the daily work; empty = both. `RecordFailure` (kit 1.2.0.5) = no survey work, only count one failed `Daily` call. |

**The scheduler calls the two passes separately** (`OneTime`, then `Daily`). Each Custom API call is one database transaction, so if one pass fails it rolls back only its own work, and the other pass still runs (DEF-CSE-002). Before kit 1.2.0.2 both ran in one call, and a failing One-time send stopped the daily work too.

**Large scheduled surveys run across several calls** (kit 1.2.0.5, ADR-011). A scheduled survey is sent 25 customers at a time, one survey at a time in priority order, and its progress is saved on the trigger after each step (the trigger form's *Scheduled run* section shows it). At HL's ~10,000 customers a survey takes about 20 calls, so one scheduler run may end with the survey still going; the log says "continues in the next scheduled run" and that is **not** a failure.

**After a failed `Daily` call the scheduler makes one `RecordFailure` call.** The failed call's own writes were rolled back, so it could not count itself. `RecordFailure` counts it on the scheduled survey it was working on; after *Stuck After Failed Calls* failures in a row (Survey Settings, set to 3) the trigger shows **Stuck** and the survey is set aside so the others go on. It is retried on the first `Daily` call of each later day and continues from where it stopped once the cause is fixed; if the trigger's next period fell due meanwhile, that period starts by itself once the stuck one finishes. Find the cause in this log and in the plugin trace log. If *Stuck After Failed Calls* is empty, `RecordFailure` is refused with a message naming it.

| Output | Type | Meaning |
|---|---|---|
| `Summary` | String | What each pass did. |
| `IsComplete` | Boolean | `false` means the call stopped at its 90-second budget; **call again** until it is `true`. |

**Re-running is safe.** Running it twice on the same day creates no duplicates: each period has one invitation per customer, enforced by the dedupe alternate key.

**The caller must hold the Survey Scheduler role** (or System Administrator, for a manual re-run). That means the on-prem service account, or the user behind the cloud flow's Dataverse connection. Survey Scheduler grants no survey or customer table rights (only Read of the organization row); the run works as SYSTEM (CEO decision 2026-11-14, ADR-005 amendment).

## On-prem (both 9.1 orgs): Windows Scheduled Task

QDB IT runs this once, on a server that can reach CRM:

```powershell
.\Register-RunDueSurveysTask.ps1 -OrgUrl https://<crm-host>/<org> -ServiceAccount <DOMAIN\svc-account> -LogPath D:\Logs\SurveyEngine -At 00:05
Start-ScheduledTask -TaskName 'Survey Engine - Run Due Surveys'   # test run
```

An org that already has the daily task from release 1.1: run the same command again; it replaces the task's trigger.

How the task behaves:
- It runs every 15 minutes from `-At`, indefinitely. A run still going when the next one is due makes the next one skip, never overlap.
- It runs `Invoke-RunDueSurveys.ps1` with Windows integrated authentication, so no password is stored in a file.
- It writes `RunDueSurveys-yyyyMMdd.log` to the log folder.
- It calls `RecordFailure` once after a failed `Daily` call.
- It exits with code 1 on any failure, so the task's *Last Run Result* shows the failure. (Before kit 1.2.0.5 the script exited 0 even after a failure, DEF-CSE-004.) A pass still running after 10 calls is not a failure.

**Point monitoring at that result.** It is the operational alarm for a failed night (architecture challenge 6).

## Cloud (org5869857f): Power Automate scheduled flow

A flow needs a Dataverse connection, which only a signed-in user can create. Build it in the maker portal:

1. **Recurrence:**
   - Interval 15, Frequency Minute.
   - Time zone `(UTC+03:00) Kuwait, Riyadh`.
2. **Apply to each** over the array `["OneTime", "Daily"]`, **sequential** (Concurrency off), so each pass is its own call and a failure in one does not stop the other:
   1. **Initialize / set variable:** `IsComplete`, Boolean, `false`.
   2. **Do until** `IsComplete` is equal to `true`, with Count limit 10 and Timeout PT1H:
      - **Perform an unbound action** (Dataverse):
        - Action name: `qdb_srv_RunDueSurveys`.
        - `RunDate`: `formatDateTime(convertFromUtc(utcNow(), 'Arab Standard Time'), 'yyyy-MM-dd')`.
        - `Pass`: `items('Apply_to_each')`.
      - **Set variable** `IsComplete` = `outputs('Perform_an_unbound_action')?['body/IsComplete']`.
   3. Configure the loop body's **run after** so a failed pass is recorded and the loop moves on to the next pass.
   4. **If the `Daily` pass failed** (run after *has failed*): one more **Perform an unbound action** with `Pass` = `RecordFailure` and the same `RunDate`, so repeated failures mark the scheduled survey Stuck.
3. **Run after failure:** send an email or Teams alert to the CRM admin.

Run the flow once by hand and read `Summary` in the run history.
