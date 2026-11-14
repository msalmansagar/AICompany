# Customer Survey Engine — Survey Trigger Decisions

| | |
|---|---|
| Agreed | 2026-11-09, in discussion with the user |
| Status | Input for the BA phase. Not a BRD; not approved. |
| Related | `requirements-source.md` (AC1–AC17) |

## 1. Record types (Survey Sources)

Record types are configuration, not code. Each is one row in a Survey Source table. **There is no fixed limit on the
number of sources.** The three below are the initial set at go-live. An admin can add any other CRM table later
without a code change or a deployment.

| Initial source | Type filter | Counts toward milestones |
|---|---|---|
| Applications | New STF, New LTF, Renewal, Rescheduling, Limit increase, Renewal cum limit increase, Extension of drawdown (AC1.4) | No |
| Disbursements | WBS, LC | Yes |
| Fund Transfer | — (separate request type) | No |

Each source row records:
- the CRM table;
- the customer lookup field;
- the type field;
- the submitted-flag field;
- the status field and its values.

**Correction to the ACs:** AC1.5 lists Fund Transfer as a transaction type. It is a separate record type. The modes in AC1.3 become Applications / Disbursements / Fund Transfer.

**Adding a source needs no deployment.**
- **Plugin registration.** CRM only runs a plugin on tables where it is registered (a "plugin step"). Activating a source registers the step automatically; deactivating it removes the step. Only a System Administrator can activate a source.
- **Type values.** Type values (the application types, WBS and LC, and so on) are read from the source table's own option-set metadata. They are never a fixed list in the survey engine.
- **Every field is selectable.** The customer field, type field, submitted flag and status field are all chosen per source from the table's metadata.

## 2. Trigger families

| Family | Triggers | Mechanism |
|---|---|---|
| Event | Record created; submitted flag becomes True; status becomes Approved; status becomes Completed | One generic async plugin driven by configuration |
| Schedule | Monthly, Quarterly, Annually | A daily "Run due surveys" Custom API, called by a Windows scheduled task on-prem and Power Automate recurrence on cloud |
| Milestone | Every N completed disbursements | The same plugin, on a disbursement status change |

Event triggers fire on the **transition**, comparing the record before and after the change. They never fire on the current state, so a later edit to a submitted record does not fire again.

## 3. Milestone counter (AC17)

| Setting | Default | Configurable |
|---|---|---|
| Source | Disbursements | Yes |
| Types | WBS, LC | Yes |
| Counted statuses | Completed | Yes |
| Every N | 5 | Yes |
| Scope | Per customer, across all facilities | — |
| Count from | A date (e.g. go-live); empty = all history | Yes |
| Milestones already reached at activation | Skip, wait for the next one | Yes (alternative: send now) |

- **Counting is done by query, not by a running tally.** A milestone fires when floor(count / N) is greater than the last milestone fired. Configuration changes therefore take effect immediately, and reversals correct themselves.
- **A milestone is never fired twice.**
- **The starting point for Skip** is floor(completed before activation / N). It is computed from dates, so no go-live batch job is needed.

## 4. Survey fatigue

| Setting | Default | Configurable |
|---|---|---|
| Minimum days between surveys per customer | 30 (0 = no limit) | Yes |
| When blocked: event triggers | Drop | Yes, per trigger |
| When blocked: milestone and scheduled triggers | Postpone | Yes, per trigger |
| Priority when several fire at once | Milestone ranked first | Yes, per trigger (priority number) |

- **Every blocked or lost trigger is logged.** The log records the customer, the trigger, the source record and the reason. Nothing is dropped silently.
- **Postponed triggers** are released by the daily "Run due surveys" job when the window ends. They are discarded, and logged, if they expire first.

## 5. Rules common to every trigger

- **No duplicates.** One invitation at most per survey, customer and source record (or period, for scheduled surveys).
- **Version snapshot (AC16).** An invitation fixes the published survey version at generation.
- **Activation and expiry (AC13, AC14).** Each invitation has its own start and end. A quarterly survey stays open until one month into the next quarter (AC14.1).

## 6. Still open for the BA

- **Scheduled surveys:** who receives them (all active customers, or only customers active in the period), and whether they run on calendar dates or on each customer's anniversary.
- **"Record created" trigger:** it is not in the ACs. Confirm it is wanted.
- **Real CRM table and field names** for the three sources.
