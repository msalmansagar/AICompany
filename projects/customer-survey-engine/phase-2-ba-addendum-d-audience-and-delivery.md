# BRD Addendum D — General Surveys, Send Now, Date-and-Time Schedules, Audience Filter and Multi-Number SMS (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Amends | `phase-2-ba.md` v1.4 (v1.1 + Addenda A, B and C) → becomes v1.5 when this addendum is approved |
| Date | 2026-11-16 |
| Status | **APPROVED by the CEO 2026-11-16** (BRD v1.5) |
| Trigger | The CEO answered the per-org configuration questions on 2026-11-16 (PR #185, `pdppl-decisions.md`). Two answers change what the engine promises: BFD-06 (SMS to every filled number) and a new requirement to send **general surveys** that no application, disbursement or transfer triggers, either immediately or at a chosen date and time, to all customers or to an audience chosen with an Advanced Find filter. |

---

## 1. Why this addendum exists

The approved BRD (v1.4) sends a survey only when a trigger fires:

- **event** — a request's status enters a configured value (BRD Group D);
- **milestone** — every N completed disbursements (FR-CSE-034..039);
- **scheduled** — Monthly / Quarterly / Annually on calendar dates, to all active customers or to customers active in a source during the period (FR-CSE-031..033).

On 2026-11-16 the CEO asked for four things the engine does not do, and one change to SMS delivery:

| # | Requirement (CEO, 2026-11-16) | What the engine does today |
|---|---|---|
| 1 | **Send now to all active customers** — a one-time send of a general survey, not on a calendar | Not possible. A general survey reaches all active customers only on the next 1st of the month / quarter / year. |
| 2 | **Send now to a chosen audience** | Not possible. There is no manual send at all. |
| 3 | **Schedule a send at a specific date and time** (one-time, e.g. 1 Dec 2026 10:00) | Not possible. Scheduled triggers fire on fixed calendar dates only, and the scheduler runs once a day. |
| 4 | **Choose the audience with an Advanced Find filter** | Not possible. Scheduled populations are "all active customers" or "active in a source during the period". |
| 5 | **BFD-06: send the SMS to every filled number** among `telephone1`, `qdb_mobile_number_2`, `qdb_mobilenumber3`, `address1_telephone2`, `address1_telephone1` | One SMS to one configured field (`qdb_survey_sms_config.qdb_customer_phone_field`). |

**Current state these requirements are stated against:**

- `qdb_srv_RunDueSurveys` processes postponed invitations, scheduled triggers and retention. It is called once a day by a Windows Scheduled Task on-prem (`scheduler/*.ps1`). It is idempotent per setup + customer + calendar period (FR-CSE-044).
- Scheduled populations are computed in `ScheduledTriggerRepository` from either all active (statecode 0) customers of the org's customer table, or the distinct customers of a chosen source in the period.
- A source with no origin field treats every request as Digital (`TriggerRules.Resolve`), so a survey with no source record uses the setup's **Digital** delivery channel.
- `InvitationDispatchPlugin` creates **one** hand-off activity (letter on HL, fax on BFD) per SMS invitation, reading the number from one field, and logs suppression reason 9 "Not delivered" on failure.
- Volumes (BRD §9.2): ~450 customers, ~900 requests a month; the largest scheduled run is ~450 invitations (A3: daily run of 450 = 24.4 s).

---

## 2. What changes

| Area | Change |
|---|---|
| Section 3.2 In scope | Add: general (sourceless) one-time sends — now or at a date and time; audience by Advanced Find saved view; multi-number SMS. |
| Section 4, Group E | FR-CSE-031..033 unchanged. Add a fourth trigger kind, **One-time**, beside event, scheduled and milestone (FR-CSE-009 amended: "event, scheduled, milestone or one-time"). |
| Section 4 | Add Group P (FR-CSE-083..088): one-time general sends. |
| Section 4 | Add Group Q (FR-CSE-089..091): audience filter. |
| Section 4 | Add Group R (FR-CSE-092..094): multi-number SMS. |
| Section 5 NFRs | Add NFR-CSE-015..018. |
| Constraint C-2 | The Windows Scheduled Task runs every 15 minutes instead of once a day (see OQ-D3). |

---

## 3. Scope

### 3.1 In scope

- A **One-time** trigger on a survey setup, with a send moment of **Now** or a **date and time**.
- An audience per one-time trigger: **All active customers** or **a FetchXML filter stored on the trigger**, built with an Advanced Find-style web resource on the trigger form (reused from the Process Engine).
- A **Send now** command on the trigger form (Survey Admin), with a preview of how many customers will receive it before it sends.
- The scheduler checking for due one-time triggers every 15 minutes.
- A configurable **list** of phone fields on the SMS hand-off row; one SMS per distinct filled number.
- The same rules as every other invitation: version pinning (FR-CSE-046), fatigue (FR-CSE-040..042), priority (FR-CSE-043), delivery channel, suppression logging.
- Provisioning, plugin, UI (forms, ribbon command), on-prem kit, runbook and console checks updated; both orgs (account and contact).

### 3.2 Out of scope

- Recurring schedules at a time of day (e.g. every Monday 09:00). Recurring stays Monthly / Quarterly / Annually on calendar dates.
- A new filter builder written from scratch. The Process Engine's existing component is reused (OQ-D2).
- Audiences from tables other than the org's customer table (e.g. "customers whose loan is overdue" expressed on the loan table). Advanced Find on account/contact can filter on related records, which covers most cases; anything else is a later request.
- Marketing lists.
- Sending to anyone who is not a customer record of the org.
- WhatsApp. Survey hand-off rows are SMS only (unchanged).

---

## 4. Functional requirements

### Group P — One-time general sends

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-083 | A survey setup may have a trigger of kind **One-time**. A one-time trigger has no source table and no record behind it. It carries: a send moment (`Now` or a date and time), an audience (FR-CSE-089), and the existing Drop / Postpone and priority settings. | An administrator creates a setup with only a One-time trigger and no source; it saves and activates without a source. |
| FR-CSE-084 | **Send now:** a Survey Admin can send a one-time trigger immediately from its form. Before sending, the form shows how many customers the audience contains and asks for confirmation. Sending creates the invitations at once; it does not wait for the scheduler. | With an audience of 37 customers, the form shows "37 customers", and after confirmation 37 invitations exist (less any blocked by fatigue, which are logged). |
| FR-CSE-085 | **Date and time:** a one-time trigger with a send date and time is processed by the first scheduler run at or after that moment. The date and time are entered in the user's time zone and stored in UTC. | A trigger set for 2026-12-01 10:00 Qatar time creates its invitations in the first run between 10:00 and 10:15. Nothing is created at 09:59. |
| FR-CSE-086 | A one-time trigger runs **once**. After it runs (now or scheduled) it is marked Sent with the run time and the number of invitations created and suppressed, and it cannot run again. To send again, the administrator copies it. | Pressing Send now a second time, or a scheduler run after it was sent, creates nothing. The trigger shows "Sent 2026-12-01 10:04, 412 invited, 38 suppressed". |
| FR-CSE-087 | Invitations from a one-time trigger follow the same rules as any invitation: one per setup + customer + trigger (dedupe), pinned form version, fatigue limit with the trigger's Drop / Postpone setting, priority, and the setup's **Digital** delivery channel (there is no request to mark Legacy). Each blocked customer gets a suppression-log row with its reason. | A customer surveyed 10 days ago (limit 30) gets no invitation: Drop → a Fatigue log row; Postpone → a Postponed invitation released when the window ends. |
| FR-CSE-088 | Invitations from a one-time trigger expire after the setup's normal expiry period from the moment they were created. | With a 14-day expiry, an invitation created 1 Dec is closed on 15 Dec if not submitted. |

### Group Q — Audience filter

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-089 | The audience of a one-time trigger is either **All active customers** (statecode 0 on the org's customer table) or **a filter** stored on the trigger itself as FetchXML in a multi-line text column (`qdb_audience_fetchxml`). | On BFD the filter is on account; on HL, on contact. A trigger with an empty filter and audience "Filter" cannot be activated. |
| FR-CSE-090 | The trigger form hosts a **filter builder web resource** that opens an Advanced Find-style editor on the org's customer table (any condition Advanced Find supports, including related records), and writes the resulting FetchXML into `qdb_audience_fetchxml`. Re-opening it loads the saved filter for editing. The component is reused from the Process Engine, where the same pattern already exists. The engine runs the filter **at send time**, so the audience is whoever matches **when the survey is sent**. | An admin builds "Accounts in Doha with an active facility" (52 matches today) and saves the trigger; the column holds the FetchXML; re-opening the builder shows the same conditions; a send next week uses next week's matches. |
| FR-CSE-091 | Only the filter's **conditions** are used. The engine forces the entity to the org's customer table, reads only the customer id, and ignores columns, sort order and row limits. FetchXML that does not parse, targets another table, or fails to run stops the send with a clear message on the trigger; nothing is created. The preview count (FR-CSE-084) runs the same filter. | FetchXML with `top="10"` or extra attributes still sends to every match. FetchXML on `incident` is refused at save and at send. |

### Group R — Multi-number SMS

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-CSE-092 | The SMS hand-off row holds a **list** of customer phone fields (in order) instead of one field. A row with one field behaves exactly as today. | BFD lists five fields; HL lists `mobilephone` only and is unchanged. |
| FR-CSE-093 | For an SMS invitation the engine reads every listed field, ignores empty values, removes duplicates (comparing digits only, so "+974 5555 1234" and "97455551234" are one number), and creates **one hand-off activity per distinct number**. All of them carry the same message and the same secure link. | A customer with `telephone1` = "+974 5555 1234", `qdb_mobile_number_2` = "97455551234" and `address1_telephone1` = "+974 6666 0000" gets two SMS activities. |
| FR-CSE-094 | If no listed field has a value, the invitation is logged "Not delivered" (reason 9) as today. If some activities fail and others succeed, the invitation counts as delivered, and each failure is logged with the field it came from. | A customer with no numbers gets one reason-9 row. A customer with two numbers, one rejected, has one activity and one reason-9 row naming the failing field. |

---

## 5. Non-functional requirements

| ID | Category | Requirement | Measurable criterion |
|---|---|---|---|
| NFR-CSE-015 | Performance — send now | Send now for all active customers at BRD volumes completes without hitting the 2-minute plugin limit. Larger audiences are processed in budgeted batches that resume until complete, like `RunDueSurveys`, and the form shows progress. | 450 customers send in one budgeted call; a 2,000-customer test audience completes across several calls with no duplicate invitation. |
| NFR-CSE-016 | Timeliness — scheduled | A dated one-time trigger is processed within 15 minutes of its send time while the scheduler is running. | Measured on the test org: 3 triggers at different times all sent within 15 minutes of their time. |
| NFR-CSE-017 | Safety — mass send | No mass send happens without a preview count and a confirmation (send now), or an explicit date and time set by a Survey Admin (scheduled). Only Survey Admin and System Administrator can send or schedule. | A Survey Analyst cannot see the Send now command; calling the API as Analyst is refused. |
| NFR-CSE-018 | Compatibility | Works on both orgs (account / contact customer tables) and CRM 9.1 on-prem with the same assembly and the same filter builder web resource. | The same build passes the E2E on cloud with Account and Contact settings; the filter builder opens, saves and reloads a filter on 9.1 (test org). |

---

## 6. Business rules

**BR-AUD-01 — The audience is evaluated at send time.** The stored filter is a living query. The people who receive the survey are the matches at the moment it is sent. The trigger records the count it sent to; it does not keep a list of who matched.

**BR-AUD-02 — Fatigue applies to general surveys.** A general survey is not exempt from the minimum-days rule (FR-CSE-040). Otherwise a mass send could reach someone surveyed yesterday. See OQ-D4.

**BR-AUD-03 — One SMS invitation, several messages.** Multi-number SMS creates several hand-off activities for one invitation. The customer still answers once; the secure link is the same in each message, and the first submission closes it.

---

## 7. Dependencies

| Dependency | Detail | Owner |
|---|---|---|
| Scheduler frequency | The Windows Scheduled Task changes from daily to every 15 minutes (runbook stage 8). `RunDueSurveys` already tolerates repeated calls; its calendar-date work still runs once per day. | MSS (scripts, runbook) + QDB IT (task) |
| Kit rebuild | New columns, trigger kind, ribbon command, plugin assembly, solution version → new kit for both orgs. | MSS |
| Process Engine filter builder | The Advanced Find-style web resource from the Process Engine is reused on the survey trigger form; architecture confirms how it is shared (copied under the survey's own name, or referenced) and that it runs on 9.1. | MSS |
| BFD SMS config | After the build, BFD's SMS row lists the five fields from BFD-06. | QDB (configuration) |

---

## 8. Risks

| Risk | Impact | Owner | Mitigation |
|---|---|---|---|
| A wrong filter sends a survey to far too many customers | High: customer annoyance, cannot be unsent | QDB / MSS | Preview count + confirmation (NFR-CSE-017); fatigue limit still applies; Admin-only. |
| A filter on many related records is slow on 9.1 | Medium: send runs in several batches | MSS | Budgeted batches (NFR-CSE-015); preview shows the count before anything is sent. |
| Scheduler stops running; dated sends are late | Medium | QDB IT | Existing Survey health view shows failed jobs; the run sends late rather than never (FR-CSE-085: "first run at or after"). |
| Multi-number sends several SMS to the same handset under different formats | Low | MSS | Digit-only duplicate check (FR-CSE-093). |

---

## 9. Open questions for the CEO

**All five answered by the CEO on 2026-11-16** (OQ-D1 one SMS; OQ-D2 filter stored on the trigger via the Process Engine filter builder; OQ-D3 every 15 minutes; OQ-D4 fatigue applies; OQ-D5 filter only).

**OQ-D1 — Multi-number duplicates. ANSWERED by the CEO 2026-11-16: one SMS** per distinct number, compared on digits only (FR-CSE-093).

**OQ-D2 — How the audience is chosen. ANSWERED by the CEO 2026-11-16:** Advanced Find-style filter, **stored on the trigger** as FetchXML in a multi-line text column, edited through a filter builder web resource on the trigger form, reusing the Process Engine's existing component (FR-CSE-089..091). Not a saved-view lookup.

**OQ-D3 — Time precision for dated sends. ANSWERED by the CEO 2026-11-16: (A) every 15 minutes** — a dated send goes out within 15 minutes of its time (FR-CSE-085, NFR-CSE-016).

**OQ-D4 — Fatigue for general surveys. ANSWERED by the CEO 2026-11-16: (A) the minimum-days rule applies** — blocked customers are dropped or postponed per the trigger and logged (FR-CSE-087, BR-AUD-02).

**OQ-D5 — "Chosen list" meaning. ANSWERED by the CEO 2026-11-16: filter only.** Specific customers are chosen in the filter builder ("Customer equals … / is one of …"); no ribbon button on the core Account / Contact grids.

---

## 10. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | CEO | **APPROVED** (OQ-D1..D5 as recorded in §9) | 2026-11-16 |

This addendum must be CEO-approved before architecture or code begins. It becomes v1.5 of the BRD on approval.
