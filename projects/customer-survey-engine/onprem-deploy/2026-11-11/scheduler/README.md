# Run Due Surveys: scheduler wiring (B5)

`qdb_srv_RunDueSurveys` is an unbound Custom API. It must be called **once a day**; it does three things, in this order:

1. Releases Postponed invitations whose customer fatigue window has ended. If they expired first, or their setup was deactivated, it discards them and writes a suppression-log row.
2. Runs every scheduled trigger that is due on the run date:
   - monthly triggers on the 1st of each month;
   - quarterly triggers on 1 Jan, 1 Apr, 1 Jul and 1 Oct;
   - annual triggers on 1 Jan.
3. Applies response retention, but only once QDB Compliance has set both the period and the mode in Survey Settings.

| Input | Type | Meaning |
|---|---|---|
| `RunDate` | String, optional | The scheduler's **local** date, `yyyy-MM-dd`. If empty, the API uses today's date in UTC. Pass an earlier date to re-run a missed day. |

| Output | Type | Meaning |
|---|---|---|
| `Summary` | String | What each pass did. |
| `IsComplete` | Boolean | `false` means the call stopped at its 90-second budget; **call again** until it is `true`. |

**Re-running is safe.** Running it twice on the same day creates no duplicates: each period has one invitation per customer, enforced by the dedupe alternate key.

**The caller must hold the Survey Scheduler role** (or System Administrator, for a manual re-run). That means the on-prem service account, or the user behind the cloud flow's Dataverse connection. Survey Scheduler grants no table rights; the run works as SYSTEM (CEO decision 2026-11-14, ADR-005 amendment).

## On-prem (both 9.1 orgs): Windows Scheduled Task

QDB IT runs this once, on a server that can reach CRM:

```powershell
.\Register-RunDueSurveysTask.ps1 -OrgUrl https://<crm-host>/<org> -ServiceAccount <DOMAIN\svc-account> -LogPath D:\Logs\SurveyEngine -At 02:00
Start-ScheduledTask -TaskName 'Survey Engine - Run Due Surveys'   # test run
```

How the task behaves:
- It runs `Invoke-RunDueSurveys.ps1` with Windows integrated authentication, so no password is stored in a file.
- It writes `RunDueSurveys-yyyyMMdd.log` to the log folder.
- It exits with code 1 on any failure, so the task's *Last Run Result* shows the failure.

**Point monitoring at that result.** It is the operational alarm for a failed night (architecture challenge 6).

## Cloud (org5869857f): Power Automate scheduled flow

A flow needs a Dataverse connection, which only a signed-in user can create. Build it in the maker portal:

1. **Recurrence:**
   - Interval 1, Frequency Day.
   - Time zone `(UTC+03:00) Kuwait, Riyadh`.
   - At hour 2, minute 0.
2. **Initialize variable:** `IsComplete`, Boolean, `false`.
3. **Do until** `IsComplete` is equal to `true`, with Count limit 10 and Timeout PT1H:
   - **Perform an unbound action** (Dataverse):
     - Action name: `qdb_srv_RunDueSurveys`.
     - `RunDate`: `formatDateTime(convertFromUtc(utcNow(), 'Arab Standard Time'), 'yyyy-MM-dd')`.
   - **Set variable** `IsComplete` = `outputs('Perform_an_unbound_action')?['body/IsComplete']`.
4. **Run after failure:** send an email or Teams alert to the CRM admin.

Run the flow once by hand and read `Summary` in the run history.
