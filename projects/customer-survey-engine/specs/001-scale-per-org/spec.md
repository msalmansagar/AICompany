# Feature Specification: Scheduled Surveys at HL Scale (Scale per Org)

**Feature Branch**: `docs/survey-brd-addendum-e` (company git rules; Spec Kit creates no branch)

**Created**: 2026-11-21

**Status**: Draft (derived from the CEO-approved BRD Addendum E, BRD v1.6)

**Input**: BRD Addendum E (`phase-2-ba-addendum-e-scale-per-org.md`), approved by the CEO 2026-11-21 with
OQ-E1 = (b) and OQ-E2 = (a). Scheduled surveys must reach HL CRM's ~10,000 active customers without any run
step exceeding the platform time limit and without duplicates; BFD/QDB1 (~450) keeps today's behaviour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A quarterly survey reaches every HL customer (Priority: P1)

A survey administrator at HL has set up a quarterly satisfaction survey for **all active customers**
(about 10,000). On the first day of the quarter the survey goes out to every one of them, once, exactly as
it does today for a small customer base, without the administrator doing anything.

**Why this priority**: Today this survey would never be sent at HL's size. This is the whole reason for the
addendum (BRD FR-CSE-098, review item 5).

**Independent Test**: Give a test org a scheduled trigger over a large active customer base (2,500 test
customers per OQ-E1), let the scheduler run, and count invitations: exactly one per customer for the period.

**Acceptance Scenarios**:

1. **Given** a quarterly trigger for all active customers and 2,500 active test customers, **When** the
   scheduler runs on the first day of the quarter, **Then** every customer ends with exactly one invitation
   for that quarter, and no single run step goes over the platform time limit.
2. **Given** the same trigger, **When** the run needs many scheduler calls to finish, **Then** each call
   continues where the last one stopped and the run summary shows how many customers have been evaluated
   so far and that the run is still going.
3. **Given** ~450 active customers (BFD/QDB1), **When** the same trigger runs, **Then** the invitations,
   suppressions and summary are the same as before this change.

---

### User Story 2 - An interrupted run finishes without duplicates or gaps (Priority: P1)

The scheduler server restarts, or one call fails, half-way through a 10,000-customer run. When the scheduler
runs again, the survey carries on from where it stopped. Nobody receives the period's survey twice and
nobody is skipped.

**Why this priority**: At HL's size a run spans many calls, so interruptions are normal, not exceptional.
Correctness here is as important as finishing at all (BRD FR-CSE-098 (c), BR-E3).

**Independent Test**: Stop a large run part-way (end a call early or make one fail), run again, and check
one invitation per customer, none missing.

**Acceptance Scenarios**:

1. **Given** a scheduled run stopped after some customers were invited, **When** the scheduler runs again,
   **Then** the remaining customers are invited and the earlier ones are not invited again.
2. **Given** a call that failed and lost its own work, **When** the next call runs, **Then** it redoes only
   that lost work and the final result is still one invitation per customer.
3. **Given** a run that could not finish because the scheduler was down for some days, **When** the
   scheduler comes back within 28 days, **Then** the run resumes from its saved position (missed-day rule).

---

### User Story 3 - Each org's expected size is written down and proven (Priority: P2)

MSS, QDB IT and QDB's business owners can see the size each org is built and tested for (HL ~10,000 active
of ~44,000; BFD/QDB1 ~450) and the evidence that HL's size works: a live timing on the cloud org and the HL
test org's own timing.

**Why this priority**: The previous single figure (~450) hid HL's size until the independent review. The
evidence is what lets QDB accept HL go-live (BRD NFR-CSE-006 amended, NFR-CSE-019, NFR-CSE-020).

**Independent Test**: Read the volumes and the evidence in the project records; re-run the volume test.

**Acceptance Scenarios**:

1. **Given** the project's requirement records, **When** a reader looks up the volumes, **Then** they are
   stated per org.
2. **Given** the live test on the cloud org with 2,500 test customers, **When** it completes, **Then** the
   timing, the number of calls and the one-invitation-per-customer count are recorded, and from them the
   expected time for 10,000.
3. **Given** QDB IT's Gate 3 runs on the HL test org, **When** they report, **Then** the HL timing is
   recorded beside the cloud one.

---

### Edge Cases

- A scheduled run for a period is still going when the next period of the same trigger becomes due: the
  first run finishes first; the next period starts after it (BR-E2).
- The customer base changes during a run (a customer becomes active or inactive between calls): every
  customer is evaluated at most once for the period; a customer who becomes inactive before being reached
  is not invited. (Assumption; see Assumptions.)
- Two scheduler calls overlap: only one of them advances the run; the other changes nothing.
- A survey administrator deactivates the setup or trigger during a run: the run stops at the next step and
  sends nothing more; already-created invitations stay.
- Several scheduled triggers are due on the same day: each progresses within the time budget; none is
  starved forever.
- Fatigue (30 days) blocks many customers at once: each is dropped or postponed as configured, and logged,
  page by page, as today.
- At ~450 customers the whole run fits in one call, exactly as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (BRD FR-CSE-098): A scheduled trigger (Monthly, Quarterly, Annually; population All active
  customers or Active in a source during the period) MUST process its population in steps that each finish
  well inside the platform time limit, and continue in later scheduler calls until every customer in the
  population has been evaluated.
- **FR-002** (BRD FR-CSE-098, BR-E1): Each customer MUST go through exactly the same rules as today:
  fatigue with Drop or Postpone, trigger priority, published-version pin, fixed expiry for the period, and
  the setup's Digital delivery channel.
- **FR-003** (BRD FR-CSE-098): No customer MUST receive the same period's invitation from the same setup
  twice, however many calls the run takes, and whatever call fails or is interrupted.
- **FR-004** (BRD FR-CSE-098, BR-E3): A run MUST save its position as it goes, so an interrupted run resumes
  from where it stopped, including after missed scheduler days caught up by the existing 28-day rule.
- **FR-005** (BRD FR-CSE-098 (d)): The run summary MUST show, for a scheduled trigger still in progress, how
  many customers have been evaluated and that the run continues; and when it completes, the final counts.
- **FR-006** (BRD BR-E2): A trigger's run for one period MUST complete before that trigger's next period
  is started.
- **FR-007** (BRD FR-CSE-098 (e), section 3.2): For an org of ~450 active customers the outcome (who is
  invited, suppressed or postponed, and the summary counts) MUST be the same as before this change.
- **FR-008** (BRD NFR-CSE-006 amended): The other once-a-day passes (postponed release, retention) MUST also
  complete at HL's volume in steps inside the time limit; where they do not today, they MUST be made to.
- **FR-009** (BRD section 5.1): The volumes MUST be recorded per org: HL ~44,000 customers, ~10,000 active;
  BFD/QDB1 ~450 active.

### Key Entities

- **Scheduled run progress**: where a scheduled trigger's run for a period has reached: the trigger, the
  period, the position in the population, customers evaluated so far, and whether the run is complete.
  One per trigger and period while it runs.
- **Scheduled trigger** (existing): the setup's calendar trigger and its population choice.
- **Invitation** (existing): one per setup, customer and period; its unique dedupe key is what makes a
  repeated step harmless.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (NFR-CSE-019): A scheduled survey to all ~10,000 active HL customers is fully sent within
  **one hour** of the scheduler starting it, through the normal 15-minute scheduler.
- **SC-002** (NFR-CSE-020, OQ-E1): On the cloud org, a scheduled run over **2,500** test customers ends with
  exactly **2,500** invitations for 2,500 different customers, and no run step goes over the time limit.
- **SC-003** (FR-CSE-098 (c)): After a run is interrupted at least once, the final invitation count equals
  the population, with **zero** duplicates and **zero** customers missing.
- **SC-004** (FR-CSE-098 (e)): On a ~450-customer org, every existing scheduled-survey test result is
  unchanged.
- **SC-005** (NFR-CSE-020): The HL test org's own timing is recorded by QDB IT during its Gate 3 runs.

## Assumptions

- All ~10,000 active HL contacts are customers who may be surveyed (CEO, 2026-11-21); no customer-base
  filter is needed.
- The measured rate on the cloud org is about 165 ms per customer (QA-D2, 2026-11-19); HL's 9.1 servers may
  be slower, which paging tolerates (each step stays inside the limit whatever the speed).
- The one-time "Send now" already completes at HL's size in about 27 minutes and stays as it is (OQ-E2 = a).
- A customer who becomes inactive between scheduler calls, before being reached, is not invited; one who
  becomes active after the run passed their position is not added to that period's run.
- The 15-minute scheduler, the separate One-time and Daily calls (DEF-CSE-002) and the missed-day catch-up
  (DEF-CSE-003) are in place (kit 1.2.0.4).
- HL's monthly request volume (OQ-E3) is still open; it does not affect this feature, because event surveys
  handle one customer per event.
- Event, milestone and one-time triggers, the customer-base filter and a faster one-time send are out of scope.
