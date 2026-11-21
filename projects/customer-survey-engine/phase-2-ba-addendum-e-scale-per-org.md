# BRD Addendum E — Scale per Org: HL CRM at ~10,000 Active Customers (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Amends | `phase-2-ba.md` v1.5 (v1.1 + Addenda A–D) → becomes **v1.6** when this addendum is approved |
| Date | 2026-11-21 |
| Status | **DRAFT — awaiting CEO approval.** Nothing may be built from it until approved. |
| Trigger | The CEO stated on 2026-11-21 that **HL CRM has about 44,000 customers, of which about 10,000 are active**, and that **all active HL contacts are customers** who may be surveyed. The BRD assumed about 450 active customers (section 9.2). The independent review of 2026-11-19 (item 5) found that the scheduled pass is not built for that size. |

---

## 1. Why this addendum exists

The approved BRD sizes the engine for one customer base: **~450 active customers, ~900 requests a month** (section
9.2), and NFR-CSE-006 requires "a daily run for 450 customers completes in one execution". The engine meets that.
HL CRM is about **22 times larger**.

| Feature | At ~450 (BRD) | At ~10,000 active (HL) |
|---|---|---|
| Event surveys (a request's status changes) | One customer per event | **Unchanged**: one customer per event |
| One-time send to "all active customers" (Addendum D) | One call, about 1 minute | **Works, slower**: pages of 25 that resume across calls (NFR-CSE-015, DEF-CSE-002); about 400 pages and about 27 minutes of work, never inviting anyone twice |
| **Scheduled survey to "all active customers"** (monthly, quarterly, annual) | One call, about 25 s (A3 measured 450 in 24.4 s) | **Fails.** The scheduled pass builds the whole population in one call and checks the time budget only between triggers. 10,000 customers is far beyond the 2-minute plugin limit, so the call rolls back every time and **that survey is never sent** |

Measured basis: about **165 ms per customer** (QA-D2, 2026-11-19: 1,000 customers in 164 s of server time).

**Current state these requirements are stated against:** kit 1.2.0.4 (main `d0079a84`). The one-time send pages
its audience (25 per page) with a saved cursor and resumes on the next call; the scheduled pass
(`ScheduledTriggerPass`, `ScheduledCandidateBuilder`) does not. Since DEF-CSE-002 the scheduler calls the
One-time pass and the daily passes separately; since DEF-CSE-003 a daily run that does not finish is resumed by
the next call.

---

## 2. What changes

| Area | Change |
|---|---|
| Section 9.2 Volumes | Stated **per org** (section 5 below). |
| NFR-CSE-006 | Amended: "at the expected volume **of each org**"; the daily job handles the full customer base **in budgeted calls that resume until complete**, instead of "in one run". |
| NFR-CSE-015 | Acceptance restated for HL's volume (NFR-CSE-019). |
| Section 4, Group E | Add **FR-CSE-098**: scheduled triggers process their population in budgeted, resumable pages. |
| Section 5 NFRs | Add **NFR-CSE-019** (scale per org) and **NFR-CSE-020** (scale evidence). |

---

## 3. Scope

### 3.1 In scope

- The **scheduled pass** processes "all active customers" (and "active in a source during the period") in pages,
  saves where it stopped, and resumes on the next scheduler call, without inviting any customer twice.
- The volume figures and performance requirements restated per org.
- Live evidence at HL scale (NFR-CSE-020).

### 3.2 Out of scope

- A "customer base" filter: the CEO confirmed all active HL contacts are customers (2026-11-21).
- Making the one-time send faster. It already completes at HL scale (section 1); speed is OQ-E2.
- Event and milestone triggers: one customer per event, unaffected by the size of the customer base.
- Any change for BFD/QDB1 (~450): it keeps today's behaviour.

---

## 4. Functional requirements

| ID | Requirement | Acceptance criteria | Source |
|---|---|---|---|
| FR-CSE-098 | A **scheduled** trigger (Monthly, Quarterly, Annually; population All active customers or Active in a source during the period) shall process its population **in pages within the time budget**, save its position after each page, and **resume** on the next call until the whole population has been evaluated. Every customer passes through the same rules as today (fatigue with Drop or Postpone, priority, version pin, fixed expiry, Digital delivery), and **no customer receives the period's invitation twice**, however many calls the run takes or if a call fails. | (a) A quarterly trigger over 10,000 active test customers ends with exactly one invitation per customer for the period. (b) No single call exceeds the 2-minute plugin limit. (c) Killing the run part-way and calling again produces no duplicates and no gaps. (d) The run summary shows progress (customers evaluated so far, still running). (e) At ~450 customers the result is identical to today's. | CEO 2026-11-21; review item 5 |

---

## 5. Non-functional requirements

### 5.1 Volumes per org (replaces the single figure in section 9.2)

| | HL CRM (customers = contacts) | BFD CRM / QDB1 (customers = accounts) |
|---|---|---|
| Customers in total | ~44,000 | ~450 (BRD) |
| **Active customers** | **~10,000** | **~450** |
| Largest scheduled or one-time run | ~10,000 invitations | ~450 invitations |
| Invitations a month (30-day fatigue rule) | up to ~10,000 | up to ~450 |
| Requests a month | not stated — **OQ-E3** | ~900 (BRD) |

### 5.2 Requirements

| ID | Category | Requirement | Acceptance |
|---|---|---|---|
| NFR-CSE-006 (amended) | Performance | Trigger evaluation finishes well inside the 2-minute plugin limit at the expected volume of each org (5.1). The daily job handles the full customer base in budgeted calls that resume until complete. | Async trigger p95 < 10 s. A scheduled run over the org's active customers completes, with no call over the limit. |
| NFR-CSE-019 | Performance — scale | At HL's volume, a scheduled or one-time survey to all ~10,000 active customers completes within **one hour** of starting, through the 15-minute scheduler, with no call over the plugin limit. | Measured (NFR-CSE-020). At 165 ms per customer, 10,000 customers is about 28 minutes of work. |
| NFR-CSE-020 | Evidence | The scale is proven live, not only by unit tests. | A scheduled and a one-time run at the size chosen in **OQ-E1**, on the cloud org with test customers, timed; and the HL test org timing recorded by QDB IT during its Gate 3 runs. |

---

## 6. Business rules

- **BR-E1** — Paging never changes who is surveyed: the population, the rules and the dedupe key per setup,
  customer and period are exactly as today.
- **BR-E2** — A scheduled run in progress is finished before that trigger's next period is considered. A period's
  run that is still going at the next 1st of a period continues; the new period starts after it.
- **BR-E3** — A run that cannot finish (for example the scheduler stopped) is caught up by the missed-day rule
  (DEF-CSE-003, up to 28 days) and resumes from its saved position.

---

## 7. Dependencies

| Dependency | Owner | Needed for |
|---|---|---|
| Measured rate per customer on the HL test org (9.1, slower hardware than cloud is possible) | QDB IT, during Gate 3 | NFR-CSE-020 |
| HL request volume per month (OQ-E3) | QDB HL business owner | event-trigger load check |
| Postponed release and retention passes at ~10,000: check they are budgeted the same way | MSS architecture | FR-CSE-098, NFR-CSE-006 |

---

## 8. Risks

| Risk | Impact | Owner | Mitigation |
|---|---|---|---|
| HL's 9.1 servers are slower than cloud | A 10,000-customer run takes longer than one hour | MSS / QDB IT | Paging keeps every call inside the limit whatever the speed; NFR-CSE-020 measures it on the HL test org. |
| A monthly "all active" survey at HL sends ~10,000 invitations a month | Load on the portal and on customers | QDB business | Configuration choice, not an engine limit: QDB decides which surveys go to all active customers. Fatigue (30 days) still applies. |
| Generating ~10,000 test customers on the cloud org | Load and clean-up on a shared test org | MSS | Same script as QA-D2 with clean-up and a leftovers count; size per OQ-E1. |

---

## 9. Open questions for the CEO

| ID | Question | Options | MSS recommendation |
|---|---|---|---|
| OQ-E1 | How big should the live proof on the cloud org be? | (a) the full **10,000** test customers; (b) **2,500** on cloud plus the HL test org timing by QDB IT, and extrapolate | **(b)**: 2,500 already needs about 100 pages and many resumed calls, which is what has to be proven; 10,000 test accounts load the shared org for little extra evidence. |
| OQ-E2 | Is about 27 minutes acceptable for a one-time "Send now" to all ~10,000 HL customers? The admin's form keeps calling until done, or the 15-minute scheduler finishes it. | (a) accept; (b) make it faster (more work per call, separate change) | **(a)**: it is a rare, deliberate action, it finishes without anyone waiting, and nobody is invited twice. |
| OQ-E3 | How many requests a month does HL expect (applications, disbursements, transfers)? | a number | Needed only to confirm event-trigger load; one customer per event is not a scale risk. |

---

## 10. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | | ☐ Approve ☐ Approve with conditions ☐ Revise | |

When approved: BRD v1.6. Next steps (new-feature workflow, Spec Kit inside it): specify and clarify in
`specs/NNN-scale-per-org/`, plan with architecture (paging design for the scheduled pass; check postponed release
and retention at scale), tasks, build, code review, QA (FR-CSE-098, NFR-CSE-019/020), audit, CEO final decision,
kit rebuild.
