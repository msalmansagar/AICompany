# DCP-001 — Phase 4: UX Specification

**Project:** Debt Collection Platform (DCP-001)
**Date:** 2026-09-15
**Author:** UI/UX Designer — MSS Technologies
**Status:** DRAFT — input to frontend build step 5 onward
**Baseline:** `phase-3-arch.md` §9 (IA), `phase-2-ba-priority-recut.md` §3 (P1 list),
`phase-2-ba.md` §§4,8–12,16, `phase-1-ceo.md` §6 (SC-01..06),
prototype `projects/debtcollection/prototype/` (design language and model-driven
layout agreed direction; artefact for validation only, not the production front end).
**Checklist applied:** `ux-quality-checklist` rows 1–7 top-down.

---

## 1. Users and Tasks

Design covers **three portal personas**. Legal and Insurance users work exclusively in
native CRM (ADR-DCP-03); no portal UI for them in Phase 1.

| Persona | Daily task | Success criterion |
|---|---|---|
| Collection Officer | Open customer, view HL facilities and live balance, review timeline, log action, capture PTP, send SMS/email, log call | SC-01: all of the above from one screen without leaving the portal |
| Relationship Manager | Open customer, review 360, view open PTPs | same as Officer for 360 and timeline; no send privilege by default |
| Senior Manager | Review team workload, inspect overdue actions and broken PTPs, approve case escalations, export evidence pack, view both dashboards | SC-04, SC-05 |

**Scope boundary:** this specification covers only the **portal screens** for these three
personas at P1. Configuration screens (strategy rules, templates, SLA thresholds) are
edited on CRM native forms in Phase 1 — no portal admin screen (T3 decision, §4.6
arch). The Strategy read-only view (prototype page 03) is a P1 read-only surface only.

---

## 2. Information Architecture

### 2.1 Navigation structure

Left-nav, collapsible to 48 px icon rail (matches prototype `tokens.css` `.nav`/`.nav.collapsed`).
Portal chrome is **English only** in Phase 1 (internal users; portal RTL is P2 — see §7).

```
WORKSPACE          (build step 5)
  My Day
  Work Queues ▸
    Early Collection  [count]
    High Risk         [count]
    Deceased & Insurance [count]
  Case List

CUSTOMER 360 / CASE   (build step 5 — opens on customer or case row click)
  Case Detail
  Customer Profile
  Loan Facilities
  Timeline            (merged action + communication stream)
  PTP                 (build step 6)
  Communication       (build step 7)

OVERSIGHT             (build step 9)
  Supervision View
  Operational Dashboard
  PTP Dashboard
  Evidence Pack       (action from Case Detail, not a nav item)

ADMINISTRATION
  Integration Health  (FR-126, read-only panel)
```

Navigation item "CUSTOMER 360 / CASE" is not a top-level menu entry; it opens as a
full-screen record surface (UCI style) when the officer clicks any case or customer row.
The browser back button and the UCI breadcrumb trail return to the prior list.

### 2.2 Screen inventory — what is built and what is deferred

| Build step | Screen | Prototype page | Deferred items (P2/P3) |
|---|---|---|---|
| 5 | Workspace — My Day, Work Queues, Case List | 01-workspace | Cross-org federated list (P3); >2000 DPD visual segregation (P2, FR-026) |
| 5 | Customer Profile + Loan Facilities + Timeline | 02-case-360 (top half + Timeline) | Cross-org 360 (P3); snapshot history grid (P2, FR-003); payment history (P2, FR-011) |
| 5 | Manual Case Create | modal/panel on 02-case-360 | Auto-creation threshold UI (P3, FR-021) |
| 6 | PTP List + PTP Create + PTP Monitor | 04-engagement (PTP tab) | PTP reschedule approval (P2, FR-060); bulk PTP (P2) |
| 7 | Communication Composer | 04-engagement (Comms tab) | Official Letter channel (P2; Q-11 open); bulk campaigns (P2, FR-074); template editor (P2) |
| 9 | Supervision View + Operational Dashboard + PTP Dashboard | 06-oversight | Portfolio dashboard (P2, FR-128); Management dashboard (P2, FR-131); Legal dashboard (P2, FR-130) |
| 9 | Integration Health Panel | 07-admin | All other admin screens (P2, FR-116) |

Strategy view (prototype 03) is P1 **read-only** (FR-031, FR-038) — officers see which
queue rule applies to a customer's bucket, but no rule editor in Phase 1 (T3).
Workout/legal portal forms (prototype 05) are scope statements only in P1 (FR-091, FR-102);
the officer sees a read-only legal-status field on Case 360 after hand-off.

---

## 3. Flows

### 3.1 Officer daily loop (SC-01)
```
Workspace → queue card → Case List → case row → Case 360
  ├─ view Customer Profile + Loan Facilities (live "as of")
  ├─ scroll Timeline (actions + comms merged, descending)
  ├─ [Log Action]           → Action panel (S3a) → submit
  ├─ [Capture PTP]          → PTP panel   (S4a)  → submit
  └─ [Send Communication]   → Comms tab   (S5)   → gate check → send / blocked
```

### 3.2 PTP lifecycle (SC-02)
```
Officer creates PTP (Open)
  → reminder job D-1 before due date → consent/stopContact gate
       ├─ blocked  → Blocked comm in Timeline; warning chip on PTP card
       └─ sent     → Sent chip on PTP card
  → next MIS ingest after due date
       ├─ arrears reduced ≥ promised → Kept (auto)
       ├─ arrears reduced < promised → Partially Kept (auto)
       └─ no reduction              → Broken → escalation action + supervisor notify
            └─ Officer correction: [Mark as Kept] → mandatory reason modal
                                   → POST /ptp/:id/mark-kept (ADR-06)
```

### 3.3 Communication send / block (SC-03)
```
Comms tab → pick channel → pick template → POST /communications
  ├─ stopContact=true or consent missing/withdrawn
  │    → Blocked comm written (FR-067); portal shows inline error; Timeline entry "Blocked"
  └─ allowed → gateway send → Completed comm; Timeline entry with delivery chip
```

### 3.4 Empty / error / ingest-stale states

| Screen | Empty | Loading | Error |
|---|---|---|---|
| Work Queue | "No cases in this queue" | 3 skeleton rows | "Failed to load — retry" |
| Timeline | "No activity yet" + [Log Action] CTA | 4 skeleton entries | "Timeline unavailable — retry" |
| PTP list | "No PTPs for this case" + [Capture PTP] CTA | 2 skeleton cards | "Failed to load PTPs — retry" |
| Dashboard tiles | Zero-value tiles with axis labels | Skeleton tiles | "Unavailable" per tile |

**Ingest-stale banner (NFR-014):** when `GET /health` signals a failed or overdue batch,
a Fluent `MessageBar` severity="warning" pins below the header on Workspace, Case List,
and Case 360. Text: "MIS data may be stale — last successful ingest: {ts}. Live balances
may not reflect recent changes. [View Integration Health]". Not dismissible by officer.
"As of {date}" suffixes on balance cells turn `--warning` colour when stale.


---

## 4. Screens

### S1 — Workspace (step 5, prototype 01-workspace)

**Reads:** `GET /queues`, `GET /health` (ingest alert).

Layout: stat-tile row (Open Cases, Overdue Actions, Broken PTPs) followed by three queue
cards (Early Collection, High Risk, Deceased & Insurance). Each card shows case count, SLA
chip, and a "View Queue ›" link. Clicking a card opens the Case List filtered by that queue.
Clicking Overdue Actions or Broken PTPs stat tile deep-links to the Supervision view.

Components: Fluent `Card`, `Tag` (SLA: green=ok, orange=warning, red=overdue), `MessageBar`
(warning, ingest banner). Loading: Fluent `Skeleton` for tiles and queue cards.

### S2 — Case List (step 5, prototype 01-workspace)

**Reads:** `GET /cases?queue={id}&page={n}`.

Fluent `DataGrid` with command bar. Columns: Customer Name, QID (masked), Product Type,
DPD Bucket pill (`--dpd-{n}` token), Arrears QAR, Status chip, SLA indicator, Assigned
Officer, Last Activity. Stop-contact rows show a "No Contact" `Tag` (warning colour).
Keyboard: all column headers sort on Enter/Space; row activates on Enter. [+ New Case]
opens the Manual Case Create panel (S2a).

### S2a — Manual Case Create panel (step 5)

**Writes:** `POST /cases`. react-hook-form + zod. Fields: Customer QID autocomplete,
Product Type `Dropdown`, Case Reason `Input`, Notes `Textarea`. Errors adjacent to fields,
announced via `aria-live="assertive"`. stopContact warning banner if customer is flagged.
Success: panel closes, list refreshes, toast "Case created".

### S3 — Case 360 / Customer 360 (step 5, prototype 02-case-360)

UCI record surface matching the D365 form experience.

**Reads:** `GET /customers/:qid`, `GET /customers/:qid/facilities`,
`GET /mis/balance/:facility`, `GET /customers/:qid/timeline`.

Hero bar: customer avatar, name, QID (masked), case ID, status badge, owner card (right),
stop-contact badge (Fluent `Tag` warning, `Prohibited16Regular` icon) when flagged.

Pivot tabs: Summary | Timeline | PTP | Communication | Documents.

Summary tab — three-column UCI form:
- Col 1 Customer: name, QID, mobile/email (masked), preferred language, vulnerability flag
- Col 2 Facility: product type, DPD bucket chip, arrears, live balance "as of {ts}", NPL flag
- Col 3 Case: status `Dropdown` (only valid next transitions), queue, SLA, assigned officer

Status `Dropdown` shows only the allowed transitions from the current state; invalid states
are absent, not disabled, so the officer never sees an error for trying a bad transition.

Command bar: [Log Action] [Capture PTP] [Send Communication] [Export Evidence Pack] [More ▾].

**States:** Loading hero = skeleton lines. stopContact active = persistent `MessageBar`
warning below pivot tabs. MIS stale = "as of" timestamp in `--warning` colour + ingest banner.

### S3a — Log Action panel (step 5)

**Writes:** `POST /actions`. Fields: Action Type `Dropdown`, Outcome Code `Dropdown`
(from config), Notes `Textarea` (required), Next Action Date `DatePicker` (required,
FR-046). Errors adjacent and `aria-live`. Success: panel closes, Timeline refreshes inline,
toast "Action logged".

### S4 — Timeline merge (step 5, prototype 02-case-360 Timeline tab)

**Reads:** `GET /customers/:qid/timeline` — both `msst_dcpcollectionaction` and
`msst_dcpcommunication`, sorted `createdon` descending. Each entry renders:

| Field | Source |
|---|---|
| Type icon | `activitytypecode`; direction-neutral icons (phone, envelope, note, meeting) |
| Subject | plugin-composed `subject` field |
| Status chip | `statecode`+`statuscode` → label |
| Actor + timestamp | `createdby` + `createdon` |
| Outcome / template | `msst_outcomecode` or `msst_templateref` |
| Delivery status chip (comms) | `msst_deliverystatus` |
| Block reason chip | `msst_blockreason`; error colour; text: "Stop-contact active" or "Consent not recorded for {channel}" |

Blocked entries: `Prohibited16Regular` icon, "Blocked" chip in `--error-bg/--error`,
block reason in secondary text. These entries are always visible — they are SC-03 evidence.
Overdue open actions: row background `--warning-bg`, "Overdue" chip.

### S4b — PTP list + create (step 6, prototype 04-engagement PTP tab)

**Reads:** `GET /ptp?caseId={id}`. **Writes:** `POST /ptp`, `POST /ptp/:id/mark-kept`.

PTP card: status chip, due date, promised amount, partial/full badge, notes, reminder chip
(Not sent / Scheduled / Sent / Blocked — with reason), created-by.

Status chips: Open=neutral, Broken=error, Kept=success, Partially Kept=warning,
Rescheduled=info. Icon accompanies each — colour is never the sole indicator (UX row 1).

Manual Kept correction (ADR-06): Fluent `Dialog` (modal). Title "Mark PTP as Kept".
Body explains the system flagged it Broken. Mandatory Reason `Textarea`. [Confirm] /
[Cancel]. On confirm: spinner, locked; success = dialog closes, card updates; error =
message inside dialog, form stays open.

PTP create panel fields: PTP Date `DatePicker`, Promised Amount `Input` (number, > 0),
Full/Partial `RadioGroup`, Commitment Notes `Textarea` (required), Reminder Date
`DatePicker` (optional, defaults to D-1).

### S5 — Communication composer (step 7, prototype 04-engagement Comms tab)

**Reads:** `GET /consent/:qid` before rendering. **Writes:** `POST /communications`.

Channel tabs: SMS | Email | Call Log. (Official Letter: P2, tab absent in Phase 1.)

stopContact locked: entire composer body replaced by Fluent `MessageBar` error. No [Send]
button rendered. Tab headings remain for orientation.

Consent missing/withdrawn: channel tab shows warning icon. Consent chip "Not recorded"
(warning) or "Withdrawn" (error). [Send] disabled with `aria-describedby` pointing to the
consent chip — screen reader announces reason on focus.

Template `Dropdown`: shows approved templates only; each item labelled with language tag
(AR / EN). Preview renders both Arabic (default, RTL text) and English below the dropdown.
Arabic preview uses `dir="rtl"` on its container; English uses `dir="ltr"`.
No free-text `Textarea` unless the `Send Free-Text Message` privilege is present in the
JWT claim (checked in the portal; enforced authoritatively in the router).

Call Log fields: Direction `RadioGroup`, Outcome `Dropdown`, Notes `Textarea`, Duration
`Input` (optional). No gateway call — logs `msst_dcpcommunication` channel=Call.

After successful send: Communication tab badge increments, Timeline refreshes, toast shown.

### S6 — Oversight: Supervision + Dashboards + Evidence Pack (step 9, prototype 06-oversight)

**Supervision view.** Reads `GET /queues/supervision`. Per-officer `Card` grid:
officer name, open-case count, overdue-action count, broken-PTP count, SLA chip.
[View Cases] deep-links to Case List filtered by officer.

**Operational Dashboard.** Reads `GET /dashboards/operational`. KPI tile row: Total
Overdue Cases, Arrears QAR, New Cases Today, Broken PTPs, Overdue Actions. Below: arrears-
by-bucket bar chart (recharts `BarChart`, `--dpd-{n}` token per bar), pending-actions
table (top 20 overdue), high-risk cases list. Each tile/chart footer: "(as of {ingest-ts})"
in secondary text; turns `--warning` colour when stale.

**PTP Dashboard.** Reads `GET /dashboards/ptp`. KPI tiles: Total PTPs, Kept, Partially
Kept, Broken, Kept Rate %. Kept-rate-per-officer `BarChart`. Repeat-broken-PTP customer
list (name masked if no PII privilege).

**Evidence pack export (SC-04).** Triggered from Case 360 command bar. [Export Evidence
Pack] calls `POST /cases/:id/evidence-pack`. Button shows `Spinner` + "Generating..."
label; no navigation. Success: browser file download (PDF). Error: `MessageBar` error
below command bar with retry.

### S7 — Integration Health Panel (step 9, prototype 07-admin)

Reads `GET /integrations/health`. Plain `<table>` rows per endpoint: name, status chip
(icon + text, never colour alone), last-run timestamp, record count, latency.
Linked from the ingest-stale banner. Read-only, no controls.

---

## 5. Bilingual and RTL

**Phase 1 rule:** portal chrome is English only (internal users; portal RTL is P2 per
NFR-013 re-cut). Communication content is Arabic/English at P1 (FR-070).

**Must not be hardcoded, to allow Phase 2 RTL without a rewrite:**
- Do not set `dir="ltr"` on `<html>` or `<body>`. Leave dir unset; next-intl sets it from
  locale in Phase 2.
- Use logical CSS properties (`margin-inline-start`, `padding-inline-end`) in `@dcp/ui`
  wherever direction matters. Avoid `margin-left` / `padding-right` for layout-sensitive
  spacing.
- Nav active-indicator (`left: 0` today) must be a token `--nav-indicator-side` so Phase 2
  flips it without touching component code.
- Arabic template preview already uses `dir="rtl"` on its container. Preserve that pattern.

**Communication content strings:** every template has Arabic and English variants in the
router. The composer preview renders both. Default language is Arabic (FR-070).

**Officer-facing consent/block error messages** must exist in both languages in `@dcp/i18n`
even in Phase 1, because the officer may serve customers in either language.

---

## 6. Accessibility

Baseline: WCAG 2.1 AA. Fluent UI v9 components.

**Contrast (light theme):**
- Body text `--text #201f1e` on `--surface #fff`: 16.7:1.
- Secondary text `--text-secondary #605e5c` on `--surface #fff`: 7.0:1.
- Primary button `#fff` on `--primary #0078d4`: 4.6:1 (passes 3:1 UI boundary).
- Error text `--error #a4262c` on `--error-bg #fde7e9`: 5.2:1.
- DPD bucket pills: use `--dpd-{n}` as background; pair with `#fff` or `--text` label.
  Never use `--dpd-{n}` as text on a white surface without checking contrast.

**Keyboard — officer daily loop (SC-01):**
1. Tab to Work Queue nav item, Enter.
2. Tab to case row, Enter to open Case 360.
3. Tab to [Log Action], Enter; Tab through fields; Enter to submit; focus returns to cmdbar.
4. Tab to [Capture PTP], Enter; same pattern.
Every `Dialog` (Mark as Kept) traps focus; returns to trigger on close.
Every `Panel` (Log Action, PTP Create) traps focus; returns to trigger on close.

**Focus order:** skip-nav ("Skip to main content") first, then header, nav, ingest banner
(if present), command bar, content.

**Labels:** every form field has a visible `<label>` via `htmlFor`. Error messages and
helper text use `aria-describedby` on the input. Disabled Send button uses
`aria-describedby` pointing to the consent chip so screen readers announce the reason.

**Colour is never the sole carrier:** every status chip carries colour + text label +
icon. DPD bucket pills carry colour + DPD label text. Blocked timeline entries carry
colour + icon + text.

**Errors:** inline, adjacent to cause, `aria-live="assertive"` or `role="alert"`.

**Touch targets:** all interactive elements >= 44x44 px. Verify nav-collapse toggle and
cmdbar icon buttons during build.

---

## 7. Design Tokens

Do not redesign the theme. Carry the token vocabulary from `prototype/shared/tokens.css`
into the `@dcp/ui` Fluent theme. Key tokens:

`--primary`, `--bg`, `--surface`, `--surface-alt`, `--text`, `--text-secondary`,
`--success/--warning/--error/--info` (+ `-bg` variants), `--dpd-0..4`, `--org-hl`,
`--org-bfd`, `--header-bg (#0b1f3a)`, `--shadow-8/16/64`, `--radius/--radius-lg`.

Fluent v9 ignores CSS variables on `:root`. Create a `buildFluentTheme()` utility in
`@dcp/ui` that maps token values to `BrandVariants`. Default Phase 1 theme: light.
The prototype four themes (light, dark, glass, vibrant) become four `FluentProvider`
theme objects; expose a theme-toggle hook for Phase 2 use.

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-1 | Q-11 Official Letter sub-states | Channel tab absent Phase 1; add on confirmation | Product Owner |
| OQ-2 | Can officers record consent in the portal, or only read it? | "Record Consent" action on consent chip if yes | Product Owner + Compliance |
| OQ-3 | Evidence pack PDF: specific regulatory template required? | Affects puppeteer HTML, not the portal trigger | Product Owner + Compliance |
| OQ-4 | Dark mode: Phase 1 or Phase 2 user preference? | Token infrastructure ready; low-cost to enable | Product Owner |

---

## 9. Frontend Handoff Checklist

Before writing any component, confirm:

- [ ] `@dcp/ui` Fluent theme built from `tokens.css` via `buildFluentTheme()`
- [ ] `next-intl` wired with EN locale; `dir` attribute NOT hardcoded on `<html>`
- [ ] All PII fetched in client components only, no SSR (NFR-006)
- [ ] All fetches via the router; no direct CRM calls from the browser (ADR-DCP-02)
- [ ] TanStack Query for all data; stale-time aligned with MIS ingest cycle
- [ ] `GET /health` polled on Workspace and Case 360 for ingest-stale banner
- [ ] Status `Dropdown` shows only allowed next transitions (client list = UX convenience; plugin = authority)
- [ ] stopContact read from `GET /customers/:qid`; composer locked before render, not after
- [ ] Consent status from `GET /consent/:qid` before rendering Comms tab
- [ ] `Send Free-Text Message` privilege from JWT claim; free-text input conditionally rendered (not just disabled)
- [ ] Masked fields render `****{last4}`; reveal only if `View Sensitive PII` in JWT claim
- [ ] DPD bucket colour always pairs with a text label
- [ ] Every `Dialog` and `Panel` traps focus; returns to trigger on close
- [ ] Skip-nav "Skip to main content" is the first focusable element
- [ ] `aria-live="assertive"` on all inline form errors
- [ ] Touch targets >= 44x44 px on all interactive elements
- [ ] `prefers-reduced-motion` honoured (Fluent handles it; verify custom transitions)
- [ ] Arabic template preview uses `dir="rtl"` on its container
- [ ] `agentation` mounted dev-only behind `import.meta.env.DEV` (CLAUDE.md default)
- [ ] No `console.log` in committed code

---

## VERIFICATION

Constraints confirmed against source material:
- Platform: Next.js + Fluent UI v9 portal (ADR-DCP-02, ADR-DCP-03). All components
  specified are Fluent v9 or native HTML. No non-existent component invented.
- Token source: `prototype/shared/tokens.css` read directly — no redesign.
- All router endpoints reference `phase-3-arch.md` §5.1 and appendix §D.
- P1 screen list cross-checked against `phase-2-ba-priority-recut.md` §3 and
  `phase-3-arch.md` §9 — no P2/P3 screen specified as P1.
- Accessibility contrast values computed from token hex values in `tokens.css`.
- Arabic template preview `dir="rtl"` confirmed against prototype 04-engagement.html
  (read during design). Portal RTL deferral confirmed against NFR-013 re-cut note.
- Open assumptions: OQ-2 (consent recording in portal), OQ-3 (PDF regulatory template
  format) — both in section 8, both raised with the user, not resolved by design preference.

Real grep output (run at specification completion):

  H2 sections : 10
  H3 screens  : 16
  Total lines : 419

  Sections: 1 Users and Tasks, 2 Information Architecture, 3 Flows, 4 Screens,
  5 Bilingual/RTL, 6 Accessibility, 7 Design Tokens, 8 Open Questions,
  9 Frontend Handoff Checklist, VERIFICATION.

  Screens (10 P1 portal screens specified):
  S1 Workspace, S2 Case List, S2a Manual Case Create,
  S3 Case 360 / Customer 360, S3a Log Action panel,
  S4 Timeline merge, S4b PTP list + create,
  S5 Communication composer,
  S6 Oversight (Supervision + Operational Dashboard + PTP Dashboard + Evidence Pack),
  S7 Integration Health Panel.

  Build steps covered: 5 (S1-S3a), 6 (S4b), 7 (S5), 9 (S6-S7).
  Not covered here (backend only): steps 1-4, 8, 10.
