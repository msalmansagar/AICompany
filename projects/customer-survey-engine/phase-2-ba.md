# Business Requirements Document — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Version | 1.1 |
| Date | 2026-11-09 |
| Status | **APPROVED by the CEO (user), 2026-11-09.** See `phase-2-ceo-brd-decision.md` |
| Inputs | `requirements-source.md` (client AC1–AC17), `trigger-decisions.md`, `approach-decision.md`, `brd-answers.md` (user answers, 2026-11-09) |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-09 | First draft from the client ACs and the trigger decisions. 63 requirements, 14 open questions. |
| 1.1 | 2026-11-09 | Applied all user answers (`brd-answers.md`). See the list below. |
| 1.2 | 2026-11-11 | Addendum A, weighted scoring (`phase-2-ba-addendum-weighted-scoring.md`): FR-CSE-061 to 070, NFR-CSE-010. |
| 1.3 | 2026-11-13 | Addendum B, Survey mode in the designer (`phase-2-ba-addendum-survey-designer-mode.md`): FR-CSE-020 amended, FR-CSE-071 to 075. |

**What changed in 1.1:**
- **General survey model.** Themes are removed; questions are built in pages and sections in the Form Engine designer.
- **Survey Category dropped.** Triggers define the timing.
- **Generic sources and triggers.** Sources are generic, and every event is "statuscode enters a configured value set". The real table names are recorded.
- **Scope additions:**
  - Arabic and English;
  - delivery per channel (Portal / Secure link / None);
  - SMS and email hand-off;
  - Power BI-ready storage;
  - the Survey Admin and Survey Analyst roles;
  - integration APIs for QDB's portal, backend and mobile teams.
- **Real volumes** replace the estimates.
- **Corrections:** residency wording (NFR) and the regression comparison.
- **12 open questions closed.** Two remain, plus confirmations for architecture.

---

## 1. Executive summary

QDB has no structured way to capture customer feedback at the moments that matter: when a request is submitted, decided or completed, and at regular intervals. As a result, it cannot connect the quality of the experience to the process, or spot dissatisfaction early.

The Customer Survey Engine is a **general, configuration-driven survey engine** for identified QDB customers.
- **Survey content.** Administrators build surveys in the existing Dynamic Form Engine designer, as pages and sections in Arabic and English.
- **Triggers.** Administrators attach triggers to each survey: CRM status changes on any configured request type, calendar schedules, or every N completed disbursements.
- **Generation and delivery.** The engine generates invitations, applies fatigue and duplicate rules, and notifies the customer by portal, SMS or email.
- **Responses** are stored in CRM, ready for reporting.

**Who builds what.** The delivery model is the same as the Form Engine's:
- MSS delivers the CRM engine, the survey renderer, the integration APIs and the documentation.
- QDB's own frontend, backend and mobile teams build the experience in the customer portal and the mobile app: the pending-survey popup or notification area, and the secure-link page.

## 2. Business objectives

| ID | Objective |
|---|---|
| BO-01 | Collect feedback automatically at configurable business moments (status changes) and calendar intervals. |
| BO-02 | Let administrators build any survey, in any structure (pages, sections, all Form Engine question types), in Arabic and English, without development. |
| BO-03 | Protect customers from survey overload through fatigue, priority and duplicate rules, with every suppression logged. |
| BO-04 | Let administrators run the full survey lifecycle (activate, deactivate, dates, expiry) with no deployment. |
| BO-05 | Extend surveys to new CRM request types by configuration alone. |
| BO-06 | Keep response data inside QDB's CRM, restricted to authorised roles, and compliant with PDPPL. |
| BO-07 | Give QDB's portal, backend and mobile teams a renderer and APIs they can integrate, as they did with the Form Engine. |

## 3. Scope and constraints

### 3.1 Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| Survey Administrators | Primary user | Build surveys, configure triggers and delivery |
| Survey Analysts | Consumer of results | Read responses and reports |
| QDB customers | Respondents | Receive and answer surveys in the portal, the mobile app or through a link |
| Customer-service team | Creates Legacy requests | Requests they create on a customer's behalf can be surveyed |
| QDB frontend, backend and mobile teams | Integrators | Build the portal and app experience on the MSS renderer and APIs |
| QDB Compliance / Legal | Governance | PDPPL classification, retention period |
| QDB IT | Operations | Scheduled task, SMS service, Email Router, portal hosting |
| MSS Technologies | Delivery | Build the CRM engine, renderer and APIs |

### 3.2 In scope

**Configuration:**
- survey sources: any CRM table, configured, with unlimited sources;
- survey setups, built on Form Engine survey forms;
- event, scheduled and milestone triggers;
- fatigue, priority and duplicate rules, with a suppression log.

**Generation and delivery:**
- invitation generation with a pinned version and language;
- delivery per channel (Portal / Secure link / None);
- hand-off to the existing QDB SMS service and to CRM email.

**Integration package for QDB teams:**
- the renderer;
- the APIs: list pending surveys, get survey, submit response, validate token;
- the integration documentation.

**Responses and data:**
- response storage (Power BI-ready);
- CRM views, charts and Excel export;
- a retention setting;
- the Survey Admin and Survey Analyst roles.

**Form Engine changes:**
- the additive Form Type = Survey;
- the fix for the inherited designer Save defect.

**Content and targets:**
- Arabic and English;
- two on-prem Dynamics CRM 9.1 orgs and one Dataverse cloud org.

### 3.3 Constraints

| # | Constraint |
|---|---|
| C-1 | **Targets.** The solution must deploy to two on-prem CRM 9.1 orgs and one Dataverse cloud org. **Amended 2026-11-12 (CEO): release 1 targets the two on-prem orgs only;** the cloud org stays the build-and-test org, and a Qatar-resident cloud org (C-4) may be added in a later release. |
| C-2 | **No native recurrence on-prem.** The daily "Run Due Surveys" Custom API is called by a Windows Scheduled Task on-prem and by Power Automate on cloud. |
| C-3 | **Identified customers only.** There is no anonymous access. The secure link carries a token that identifies one customer and one invitation; it is not anonymous. |
| C-4 | **PDPPL is a hard release gate.** Response data stays in QDB's CRM. Residency means QDB's on-prem CRM, or a Qatar-resident cloud tenancy for the cloud org. |
| C-5 | **Architecture: hybrid** (`approach-decision.md`). Survey forms use the existing Form Engine designer, renderer and render cache. Survey setup, triggers, invitations and responses live in a separate SurveyEngine solution, and removing it never affects the Form Engine. |
| C-6 | **Form Engine changes are additive only.** Survey behaviour switches on only when Form Type = Survey. Survey changes that touch the Form Engine ship in Form Engine releases. |
| C-7 | **Plugins must finish inside the CRM 2-minute limit,** and trigger plugins run asynchronously so they never block a request save. |

### 3.4 Survey sources at go-live (OQ-05)

| | Applications | Disbursements | Fund Transfer |
|---|---|---|---|
| Table | `qdb_loan_application` | `qdb_payment_authorization_ticket` | `qdb_cheque_clearing` |
| Customer | `qdb_customerid` (Account) | `qdb_Customer_Name` (lookup) | `qdb_CIF_No` (lookup) |
| Type | `qdb_LoanAppl_Type` | `qdb_disbursement_type_1` (option set; WBS, LC) | `qdb_Type` |
| Events | `statuscode` | `statuscode` | `statuscode` |
| Submitted flag | none | none | none |
| Counts toward milestones | No | Yes | No |

- **No table has a submitted flag.** "Submitted", "approved", "completed", "created" and any other event are each a set of `statuscode` values chosen by the administrator.
- **Names are as given by the user.** The mixed case is the schema name; plugins use the lower-case logical name. Names are confirmed at architecture (OQ-A2).

## 4. Functional requirements

Each row is traced to a source: **AC** = client acceptance criterion, **TD** = `trigger-decisions.md`, **AD** = `approach-decision.md`, **UA** = user answer, 2026-11-09 (`brd-answers.md`).

### 4.1 Group A — Survey sources

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-001 | Survey sources shall be configuration rows. Each row defines: CRM table; customer lookup field; type field (optional); status field; channel-origin field (Digital / Legacy); whether it counts toward milestones; active flag. | Given a source row, when a trigger on that source is evaluated, every table and field name is read from the row. None is in code. | TD 1, UA OQ-05 |
| FR-CSE-002 | The number of sources shall be unlimited. Adding a source shall need no code change and no solution deployment. | A new source row for a fourth CRM table can be created, activated and triggered without importing a solution. | TD 1, UA |
| FR-CSE-003 | Activating a source shall register the trigger plugin steps on its table automatically (Create, and Update filtered to the status field). Deactivating it shall remove them. Only a System Administrator may activate or deactivate a source. | When source X is activated, its steps appear in plugin registration. When deactivated, they are gone. When a non-administrator tries to activate it, the request is refused. | TD 1, UA |
| FR-CSE-004 | Type and status values shall be read from the source table's own option-set metadata. They shall never be a fixed list in the survey engine. | When a new option is added to `qdb_LoanAppl_Type` in CRM, it becomes selectable in survey trigger filters with no change to the survey engine. | TD 1, UA |
| FR-CSE-005 | The solution shall ship three initial source rows: Applications, Disbursements and Fund Transfer, using the tables and fields in section 3.4. | After import, the three rows exist with the section 3.4 names. | UA OQ-05 |
| FR-CSE-006 | Source rows shall be configurable per org, so field names or status values may differ between the two on-prem orgs and the cloud org. | Org 1 and Org 2 can hold different status values for "Completed" on the same source without a code change. | UA, A-06 |

### 4.2 Group B — Survey setup

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-007 | A Survey Administrator shall be able to create, edit and deactivate a Survey setup. | A setup is saved, edited and deactivated, and each change persists. | AC1, AC5 |
| FR-CSE-008 | A Survey setup shall reference exactly one survey form (Form Type = Survey) built in the Form Engine designer. | A setup cannot be saved without a survey form, or with a form whose type is not Survey. | UA (general survey) |
| FR-CSE-009 | A Survey setup shall have one or more triggers of any kind: event, scheduled or milestone. There is no Survey Category field. Timing is defined by the triggers. | A setup with an event trigger and a milestone trigger fires on either. No Category field exists. | UA (Category dropped), AC1.1 superseded |
| FR-CSE-010 | Delivery shall be configurable per channel. For each channel (Digital = request created in the customer portal; Legacy = request created by the customer-service team in CRM), the administrator chooses Portal, Secure link or None. Defaults: Digital = Portal, Legacy = Portal. | With Legacy = None, a trigger on a Legacy request creates no invitation, and this is logged. With Legacy = Secure link, the invitation is sent as a link. | AC1.2, UA OQ-06 |
| FR-CSE-011 | The channel of a source request shall be read from the source's configured channel-origin field. | A request whose origin field = Legacy follows the setup's Legacy delivery setting. | UA OQ-06 |
| FR-CSE-012 | Each setup shall have a notification title in Arabic and English. | A setup without a title in both languages cannot be activated. Invitations carry the title in the customer's language. | AC11, UA (Arabic) |
| FR-CSE-013 | Each setup shall have a notification message in Arabic and English. | As FR-CSE-012, for the message. | AC12, UA (Arabic) |
| FR-CSE-014 | Each setup shall have an active-from and active-to date. Triggers outside that window create no invitation. | A trigger the day after active-to creates no invitation. | AC13 |
| FR-CSE-015 | Each setup shall have an expiry period in days from generation. An expired invitation cannot be opened or submitted. | With expiry = 7, an invitation 8 days old is refused by the get-survey and submit-response APIs. | AC14 |
| FR-CSE-016 | Invitations created by a quarterly scheduled trigger shall stay open until one month into the following calendar quarter, if not submitted. | A Q1 quarterly invitation is still open on 30 April and closed on 1 May. | AC14.1 |
| FR-CSE-017 | A Survey Administrator shall be able to activate and deactivate a setup. A deactivated setup generates no invitations. | When a setup is deactivated and its trigger condition occurs, no invitation is created. | AC5 |
| FR-CSE-018 | Activation shall need no approval step in release 1. | A Survey Administrator activates a setup directly. | UA OQ-10 |

### 4.3 Group C — Survey content (Form Engine)

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-019 | The Form Engine shall support Form Type = Survey. Survey behaviour (the survey submit path, invitation context) shall apply only to forms of that type. | An existing non-survey form behaves identically before and after the survey release (see FR-CSE-025). | AD |
| FR-CSE-020 | Survey questions shall be built in the Form Engine designer, organised in pages (wizard steps) and sections, using the survey question types (FR-CSE-072; amended 2026-11-13 by Addendum B, was "any question type the designer supports"). There are no themes and no separate question bank. | A survey with 3 pages, several sections, and choice, text and rating questions can be built and published. | UA OQ-14, AC2 superseded |
| FR-CSE-021 | Questions shall be shown in the order defined in the designer (page → section → field order). | Reordering two questions in the designer and republishing changes their order for new invitations. | AC3 |
| FR-CSE-022 | Survey content shall support Arabic and English, including right-to-left layout. The customer shall see their preferred language. | A customer whose preference is Arabic sees Arabic text, right to left. | UA (Arabic) |
| FR-CSE-023 | Survey form codes shall start with the reserved prefix `SRV-`. Saving a survey form without it shall be refused. | Code "CUST-001" with Form Type = Survey is refused. "SRV-001" is saved. | AD |
| FR-CSE-024 | Before survey work relies on it, the designer's Save shall keep `radioRenderStyle`, `fileCaptureMode`, `componentKey` and `numberDisplayStyle`. | A form with all four values set keeps them after save and reload. | AD (inherited defect) |
| FR-CSE-025 | Before every Form Engine deploy that includes survey changes, all existing forms shall be re-published, and their published content compared with the pre-deploy baseline. Volatile stamps (timestamps, version ids) are ignored. | A content difference in any existing form blocks the release. | AD (regression gate), UA correction |

### 4.4 Group D — Event triggers

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-026 | An event trigger shall be defined as: a source; a set of status values chosen from that source's status options; and optionally a set of type values. Every event (submitted, approved / decision such as Facility Creation, completed, or any other) is configured this way. | A trigger "Disbursements, status in {Completed}, type in {WBS}" fires for a WBS disbursement that becomes Completed, and not for an LC one. | AC6–AC9, AC7.1, TD 2, UA OQ-05 |
| FR-CSE-027 | An event trigger shall fire only when the status moves from a value **outside** its set to a value **inside** it. | A move from Draft to Submitted (Submitted in the set) fires. | TD 2, UA |
| FR-CSE-028 | Saving a record without such a transition, or moving between two values both inside the set, shall not fire again. | A move from Submitted to Under Review, with both in the set, creates no invitation. | TD 2, UA |
| FR-CSE-029 | A "record created" event trigger shall be available. It fires on record creation, optionally limited to initial status values. It is not configured by default. | When configured, creating a record fires it. With no configuration, nothing fires on creation. | UA OQ-04 |
| FR-CSE-030 | Trigger evaluation shall run asynchronously and shall never block or fail the save of the source record. | A failure in the survey engine leaves the request saved, and the error is logged. | TD 2, C-7 |

### 4.5 Group E — Scheduled triggers

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-031 | Scheduled triggers shall support Monthly (1st of the month), Quarterly (1 Jan, 1 Apr, 1 Jul, 1 Oct) and Annually (1 Jan), on calendar dates. | A quarterly trigger generates its invitations on 1 April, not on an anniversary date. | AC10, TD 2, UA OQ-03 |
| FR-CSE-032 | The population of a scheduled trigger shall be configurable per trigger: either all active customers, or customers with at least one record of a chosen source (optionally in chosen statuses) during the period. | "Active in period, Disbursements" invites only customers with a disbursement in the quarter. | UA OQ-02 |
| FR-CSE-033 | Scheduled triggers and postponed invitations shall be processed by a daily "Run Due Surveys" Custom API, called by a Windows Scheduled Task on-prem and by Power Automate on cloud. Running it twice on the same day shall create no duplicates. | Running the API twice on 1 April creates each invitation once. | TD 2, C-2 |

### 4.6 Group F — Milestone triggers

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-034 | A milestone trigger shall fire every N qualifying records per customer. N is configurable, with a default of 5. | With N = 5, invitations fire at the customer's 5th and 10th qualifying disbursement. | AC17, TD 3 |
| FR-CSE-035 | Qualifying records shall be those of a source marked as counting toward milestones (default Disbursements), with a type in a configurable set (default WBS, LC) and a status in a configurable set (default Completed). Records are counted per customer across all facilities. Fund Transfers never count. | 3 completed WBS + 2 completed LC across two facilities = 5, which fires. Completed fund transfers do not count. | TD 3 |
| FR-CSE-036 | Counting shall optionally start from a configurable date. An empty date means all history. | With start = go-live date, earlier disbursements are excluded. | TD 3 |
| FR-CSE-037 | At activation, milestones already reached shall be skipped by default (the next one fires). The alternative setting sends them immediately. The baseline is floor(qualifying records before activation / N). | With N = 5 and 7 completed at activation, nothing fires until the 10th. | TD 3 |
| FR-CSE-038 | Each milestone index shall fire at most once per customer. | Re-evaluating a customer at count 5 does not create a second milestone-1 invitation. | TD 3 |
| FR-CSE-039 | Counting shall use a live query (fire when floor(count / N) > last milestone fired), not a stored running tally. Configuration changes therefore take effect immediately, and reversals correct themselves. | After N is changed from 5 to 10, the next evaluation uses 10. A record moved out of Completed drops out of the count. | TD 3 |

### 4.7 Group G — Fatigue, priority and duplicates

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-040 | A global setting shall define the minimum number of days between invitations per customer. The default is 30; 0 turns the limit off. | A customer surveyed 20 days ago gets no new invitation. At day 31, they can. | TD 4 |
| FR-CSE-041 | Each trigger shall have a setting for when the limit blocks it: Drop or Postpone. Defaults: event triggers = Drop; milestone and scheduled triggers = Postpone. | A blocked event trigger creates no invitation and is logged. A blocked milestone trigger is queued. | TD 4 |
| FR-CSE-042 | Postponed invitations shall be released by the daily job when the customer's window ends. If they expire first, they shall be discarded and logged. | A postponed invitation that expires before the window ends is never sent, and a log row exists. | TD 4 |
| FR-CSE-043 | When several triggers fire for the same customer at the same moment, a configurable priority number per trigger shall decide which one wins. Milestone triggers rank first by default. The losers follow their Drop / Postpone setting. | A disbursement that is both "completed" and the 5th sends the milestone survey. The completion trigger is dropped and logged. | TD 4 |
| FR-CSE-044 | There shall be at most one invitation per setup + customer + source record. For scheduled triggers, it is per setup + customer + calendar period. | A second firing for the same record creates no second invitation. | TD 5 |

### 4.8 Group H — Generation and delivery

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-045 | An invitation shall be generated automatically when an active setup's trigger fires and no rule blocks it. It shall be linked to the customer, the setup and the source record (if any). | Submitting an application with a matching trigger creates one linked invitation. | AC15 |
| FR-CSE-046 | Each invitation shall pin the published survey form version at generation. Later changes affect only new invitations. | An invitation generated on V1 still renders V1 after V2 is published. | AC16 |
| FR-CSE-047 | For Portal delivery, the invitation shall be exposed through the pending-surveys API (FR-CSE-051). The QDB portal and app show it as a popup or notification-area item. | A portal customer with an open invitation is returned by the API. | UA OQ-06, OQ-13 |
| FR-CSE-048 | SMS notifications shall be handed to the existing QDB SMS service. The SMS table and fields used for the hand-off shall be configurable per org. | Org A and Org B can use different SMS tables without a code change. | UA OQ-07 |
| FR-CSE-049 | Email notifications shall be sent as CRM email activities, delivered by the Email Router (on-prem) or server-side sync (cloud). | An email-delivered invitation creates an email activity addressed to the customer. | UA OQ-07 |
| FR-CSE-050 | For Secure-link delivery, the invitation shall carry a single-use, expiring, unguessable token tied to that one invitation and customer. The link opens a page in the existing customer portal. The token stops working on submit or at expiry. | A token used once, or after expiry, is refused. A guessed token is refused. | UA OQ-06, OQ-13 |

### 4.9 Group I — Integration package for QDB teams

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-051 | API: **list pending surveys** for a customer. It returns open invitations with their title and message in the requested language. | A customer with two open invitations gets both. Expired or submitted invitations are not returned. | UA OQ-13 |
| FR-CSE-052 | API: **get survey** for an invitation. It returns the published survey JSON for the invitation's pinned version and the requested language. | Version and language match the invitation. A request for another customer's invitation is refused. | UA OQ-13, AC16 |
| FR-CSE-053 | API: **submit response**. It validates the invitation (open, not expired, belongs to the caller), then writes the response (FR-CSE-056). It never writes to a mapped CRM entity. | An expired invitation is refused. A valid submission creates the Response and Answer rows and closes the invitation. | AD, UA |
| FR-CSE-054 | API: **validate link token**. It returns the invitation it unlocks, or a refusal. | A valid token returns its invitation. Used, expired or unknown tokens are refused. | UA OQ-13 |
| FR-CSE-055 | MSS shall deliver the survey renderer (the Form Engine runtime with Form Type = Survey) and integration documentation, so the QDB frontend, backend and mobile teams can build the portal and app experience. | QDB teams can render and submit a survey in a test portal page using only the package and the documentation. | UA OQ-13 |

### 4.10 Group J — Responses, reporting and retention

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-056 | Each submission shall store one Response row per invitation, one Answer row per question, and the full answers as JSON. | A 10-question submission creates 1 Response and 10 Answer rows, with JSON matching them. | UA OQ-08 |
| FR-CSE-057 | CRM shall provide views and charts of responses per setup, per customer and per source record, with Excel export. Storage shall be suitable for Power BI; Power BI reports are not built. | An analyst can filter responses for one setup and export them to Excel. | UA OQ-08 |
| FR-CSE-058 | A retention setting (period, set once QDB Compliance decides) shall delete or anonymise responses older than the period automatically. | With the period set to 1 year in test, older responses are removed or anonymised by the daily job. | UA OQ-11 |

### 4.11 Group K — Security roles

| ID | Requirement | Testable criteria | Source |
|---|---|---|---|
| FR-CSE-059 | A **Survey Admin** role shall manage sources (activation needs System Administrator; see FR-CSE-003), setups, triggers and settings. It shall have no read access to answer content. | A Survey Admin can create a setup but cannot open Answer rows. | UA OQ-11 |
| FR-CSE-060 | A **Survey Analyst** role shall be the only role able to read Response and Answer content. Other users with access to the customer cannot see it. | A user with full customer access but no Analyst role cannot read answers. An Analyst can. | UA OQ-11 |

## 5. Non-functional requirements

| ID | Category | Requirement | Measurable criterion |
|---|---|---|---|
| NFR-CSE-001 | Auditability | Every suppressed, dropped, postponed-then-expired, duplicate-blocked or channel-None trigger is written to a Suppression Log, with: customer, trigger, source record, reason and time. Nothing is dropped silently. | Zero suppressed triggers without a log row after a full test cycle. |
| NFR-CSE-002 | Integrity | At most one invitation per setup + customer + source record (or period). | A duplicate query returns 0 rows. |
| NFR-CSE-003 | Integrity | An invitation always renders its pinned version and language. | Version check passes after a republish. |
| NFR-CSE-004 | Isolation | The SurveyEngine solution can be removed without affecting the Form Engine. | After removal, all Form Engine forms still publish and render. |
| NFR-CSE-005 | Maintainability | A new source needs configuration only (FR-CSE-002). | A fourth source works without a solution import. |
| NFR-CSE-006 | Performance | Trigger evaluation finishes well inside the 2-minute plugin limit at the expected volume (section 9.2). The daily job handles the full customer base in one run. | Async trigger p95 < 10 s. A daily run for 450 customers completes in one execution. |
| NFR-CSE-007 | Quality | Every public method has a unit test, with ≥ 80% branch coverage on survey code. | CI coverage report. |
| NFR-CSE-008 | Compliance | PDPPL sign-off by QDB Compliance and the retention value are hard release gates. Response data stays in QDB's on-prem CRM, or in a Qatar-resident cloud tenancy for the cloud org. | Written Compliance sign-off is on the release checklist. |
| NFR-CSE-009 | Security | Before the Secure-link channel is enabled in any org, a threat model and security review of the token path (generation, entropy, expiry, single use, rate of guessing) is completed. | Security-engineer sign-off is recorded. The link channel is disabled until then. |

## 6. Open questions

### 6.1 Still open

| ID | Question | Owner | Impact |
|---|---|---|---|
| OQ-A1 | What is the response retention period, and the PDPPL classification? | QDB Compliance | Release gate (NFR-CSE-008). The build proceeds with a configurable setting (FR-CSE-058). |
| OQ-A2 | Confirmations needed at architecture: <br>(a) the target entity of `qdb_Customer_Name` and `qdb_CIF_No` (assumed Account); <br>(b) the `statuscode` values per source per org; <br>(c) the CRM field holding the customer's preferred language; <br>(d) the field identifying Digital vs Legacy origin on each source; <br>(e) the hand-off contract of the QDB SMS service; <br>(f) which customer portal it is (technology, authentication) and how it hosts the token page. | Architect with QDB IT / CRM admin | Needed to finish the architecture. They do not change requirements. |
| OQ-A3 | The client should confirm two readings at sign-off: AC4 is a numbering slip (user's view), and AC2.2 appears twice. Both are superseded by the general survey model. | Client | Sign-off completeness only. |

### 6.2 Closed in v1.1

| ID | Closed by | Outcome |
|---|---|---|
| OQ-01 | UA | AC4 assumed a numbering slip (confirmation in OQ-A3) |
| OQ-02 | UA | Population configurable per trigger (FR-CSE-032) |
| OQ-03 | UA | Calendar dates (FR-CSE-031) |
| OQ-04 | UA | "Record created" available, off by default (FR-CSE-029) |
| OQ-05 | UA | Real tables and fields (section 3.4); remaining details in OQ-A2 |
| OQ-06 | UA | Digital = portal, Legacy = CS-created; delivery per channel (FR-CSE-010/011) |
| OQ-07 | UA | QDB SMS service + Email Router (FR-CSE-048/049) |
| OQ-08 | UA | CRM views and Excel export; Power BI-ready storage (FR-CSE-056/057) |
| OQ-09 | UA | A setup references one survey form (FR-CSE-008) |
| OQ-10 | UA | No approval in release 1 (FR-CSE-018) |
| OQ-11 | UA | Compliance decides retention (OQ-A1); Survey Analyst role (FR-CSE-060) |
| OQ-12 | UA | Real volumes (section 9.2) |
| OQ-13 | UA | The existing customer portal hosts the link page and the pending-survey popup |
| OQ-14 | UA | Themes dropped; general survey (FR-CSE-020) |

## 7. Assumptions

| ID | Assumption |
|---|---|
| A-01 | Customers are identified CRM records: **accounts** on the cloud org and BFD CRM / QDB1, **contacts** on HL CRM, chosen per org by Survey Settings → Customer Table (amended 2026-11-12, CEO; was "accounts" only). The secure link identifies one customer through its token. |
| A-02 | The Form Engine baseline `dfe-baseline-2026-11-08` (PR #172, `773f32be`) is deployed on all three orgs before the survey release. |
| A-03 | The inherited designer Save defect (FR-CSE-024) is fixed in this engagement, before survey testing. |
| A-04 | A Windows Scheduled Task can be set up on-prem to call the daily API. If it can't, an alternative scheduler is designed at architecture. |
| A-05 | The existing customer portal is internet-facing, and QDB's teams can add the popup, notification area and token page to it. |
| A-06 | Status values and field names may differ between orgs. FR-CSE-006 handles this through per-org source rows. |
| A-07 | A service account with rights to register plugin steps exists in each org. Activating a source (FR-CSE-003) runs as a System Administrator. |

## 8. Out of scope

Each item needs a separate BRD and CEO approval.

- Anonymous survey access (no token, no login).
- Building the portal and mobile-app UI. This is QDB teams' work; MSS supplies the renderer, APIs and documentation (FR-CSE-055).
- Power BI reports and in-product dashboards. Storage is Power BI-ready.
- Computed satisfaction scores (NPS, CSAT, CES aggregates).
- SMS gateway or email infrastructure. Both exist; only the hand-off is in scope.
- A survey activation approval workflow (a candidate for a later release).
- Mobile push notifications.

## 9. Notes

### 9.1 Client AC corrections and supersessions

| AC | Treatment |
|---|---|
| AC1.1 Survey type category | **Superseded.** There is no Category; triggers define the timing (FR-CSE-009). |
| AC1.2 Channel | Kept and clarified: Digital = portal, Legacy = CS-created. Delivery is set per channel (FR-CSE-010). |
| AC1.3 / AC1.4 / AC1.5 Mode and types | **Generalised.** The mode is a Survey Source. Fund Transfer is its own source, not a transaction type. Type values come from CRM metadata (FR-CSE-001–005). |
| AC2, AC2.1–2.4 Themes and question bank | **Superseded** by the general survey model (FR-CSE-020). |
| AC3 Order | Designer order (FR-CSE-021). |
| AC4 | Absent; assumed a numbering slip (OQ-A3). |
| AC6–AC9 Event triggers | Generic status-set triggers (FR-CSE-026–028). AC7.1 Facility Creation is configured as a status set. |
| AC10 Quarterly | Scheduled triggers on calendar dates (FR-CSE-031). |
| AC11–AC14.1 | Kept; the notification is bilingual (FR-CSE-012–016). |
| AC15–AC16 | Kept (FR-CSE-045–046). |
| AC17 Milestone counter | Kept and detailed (FR-CSE-034–039). |

### 9.2 Volumes (user estimate, OQ-12)

| Item | Volume |
|---|---|
| Active customers | ~450 |
| Disbursements | ~500 / month |
| Applications | ~200 / month |
| Fund transfers | ~200 / month |
| Source events | ~900 / month |
| Largest scheduled run | ~450 invitations |
| Maximum invitations (30-day rule) | ~450 / month; expected well below |

- **Fatigue consequence.** With about 2 requests per customer per month, the 30-day rule will suppress most event triggers. The Suppression Log will be busy by design, and administrators should expect this.
- **Milestone frequency.** At about 1.1 disbursements per customer per month, a milestone survey (N = 5) reaches each customer about every 4–5 months.

### 9.3 Data summary

| Entity | Volume | Retention | Sensitivity |
|---|---|---|---|
| Survey Source | < 20 rows | Permanent | Internal |
| Survey Setup / Trigger | Tens | Permanent | Internal |
| Invitation | ≤ ~450 / month | OQ-A1 | Confidential |
| Response | ≤ ~450 / month | OQ-A1 | Confidential |
| Answer | ≤ ~450 × questions / month | OQ-A1 | Confidential |
| Suppression Log | Hundreds / month | Minimum 1 year | Internal |

### 9.4 Integration dependencies

| System | Integration | Direction |
|---|---|---|
| Source tables (3 initial, unlimited) | Async plugin steps on Create / Update of status | CRM → SurveyEngine |
| Dynamic Form Engine | Shared designer, renderer and render cache; Form Type = Survey | Shared |
| Windows Scheduled Task / Power Automate | Calls the daily "Run Due Surveys" API | Scheduler → SurveyEngine |
| QDB SMS service | Hand-off through a per-org configured table | SurveyEngine → SMS |
| Email Router / server-side sync | CRM email activity | SurveyEngine → Email |
| QDB customer portal and mobile app (QDB teams) | Integration APIs + renderer | Portal / App ↔ SurveyEngine |

## 10. Quality checklist

| Check | Result |
|---|---|
| Every FR is testable, with one interpretation | Yes |
| Every FR is traced to an AC, TD, AD or user answer | Yes (60 / 60) |
| Every FR maps to a business objective | Yes: A, L → BO-05; B, D, E, F → BO-01 / BO-04; C → BO-02; G → BO-03; H, I → BO-07; J, K → BO-06 |
| Every client AC is accounted for (kept, generalised or superseded) | Yes (section 9.1) |
| Every user answer from 2026-11-09 is applied | Yes (section 6.2) |
| PDPPL is a hard gate | Yes (NFR-CSE-008, OQ-A1) |
| The Secure-link security review is gated | Yes (NFR-CSE-009) |
| No requirement depends on out-of-scope work | Yes |

## Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | The user | APPROVED | 2026-11-09 |
| Requestor | Pending | PENDING | |

Requirement count: 60 functional (FR-CSE-001 to FR-CSE-060) + 9 non-functional (NFR-CSE-001 to NFR-CSE-009) = **69 total**.
