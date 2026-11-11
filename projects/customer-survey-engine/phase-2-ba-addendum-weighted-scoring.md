# BRD Addendum A — Weighted Scoring (CSE-ENG-001)

| | |
|---|---|
| Prepared by | MSS Technologies, Business Analyst |
| Amends | `phase-2-ba.md` v1.1 (approved 2026-11-09) → becomes v1.2 when this addendum is approved |
| Date | 2026-11-11 |
| Status | **APPROVED by the CEO (user), 2026-11-11.** BRD becomes v1.2. |
| Trigger | CEO request, 2026-11-11: "It should be configurable: either I can create a normal Survey or a weighted score Survey based on configuration." |

## 1. Why this addendum exists

The approved BRD lists "Computed satisfaction scores (NPS, CSAT, CES aggregates)" as out of scope (section 8). That item came from the BA draft and was approved only as part of the whole document. It was never decided on its own. The CEO now wants scoring in release 1. Scoring changes what the system promises, so it needs this addendum and CEO approval before any build.

Today a survey only collects answers. A rating answer is stored with its number, for example "Excellent" = 5, and the Average Score by Question chart averages those numbers. Every question counts equally, choice questions cannot carry points, and no response has an overall score.

## 2. What changes

| Area | Change |
|---|---|
| Section 3.2 In scope | **Add:** weighted scoring of survey responses, switched on per survey. |
| Section 8 Out of scope | **Replace** "Computed satisfaction scores (NPS, CSAT, CES aggregates)" with "Standard NPS, CSAT and CES formulas, and score bands (OQ-S3, OQ-S4)". |
| Section 4 | **Add** Group L below: FR-CSE-061 to FR-CSE-070. |

## 3. How it works (summary)

1. Every survey form has a **Scoring** setting: **None** (a normal survey, today's behaviour and the default) or **Weighted**.
2. On a weighted survey, the designer shows two extra boxes:
   - **Points** on each answer option, for example Yes = 10, Maybe = 5, No = 0;
   - **Weight** on each question, for example Overall satisfaction ×3, Ease ×1.
3. When the customer submits, the engine works out the response's **score**, its **maximum possible score** and the **percentage**, and stores them with the response.
4. Analysts see scores in views, charts and Excel exports, per survey, per customer and per source record.

Normal surveys and every standard Form Engine form behave exactly as they do today.

### Worked example

| Question | Weight | Options and points | Customer's answer | Points | Weighted |
|---|---|---|---|---|---|
| Overall satisfaction (stars) | 3 | 1–5 stars = 1–5 points | 4 stars | 4 | 12 of 15 |
| Ease of request (stars) | 1 | 1–5 stars = 1–5 points | 5 stars | 5 | 5 of 5 |
| Would you recommend QDB? | 2 | Yes 10 · Maybe 5 · No 0 | Maybe | 5 | 10 of 20 |
| What did we do well? (text) | — | not scored | "Fast" | — | — |
| **Response** | | | | | **27 of 40 = 67.5%** |

## 4. Functional requirements — Group L: Weighted scoring

| ID | Requirement | Acceptance criteria | Priority |
|---|---|---|---|
| FR-CSE-061 | Each survey form shall have a **Scoring** setting, **None** or **Weighted**, set in the Form Engine designer's form properties. None is the default and keeps today's behaviour. | A new survey form shows Scoring = None. A survey with Scoring = None stores no score on its responses. A standard (non-survey) form does not show the setting. | Must |
| FR-CSE-062 | On a Weighted survey, each answer option of a choice, rating or multi-choice question shall carry a **Points** value (a number, 0 allowed). Rating questions default to the option's own number (1–5 stars = 1–5 points). | A Yes/Maybe/No question can be given 10/5/0. A 5-star question needs no entry: its options score 1–5. | Must |
| FR-CSE-063 | On a Weighted survey, each scorable question shall carry a **Weight** (a number ≥ 0, default 1). A weight of 0 excludes the question from the score. Text, date, file and lookup questions are never scored. | A question with weight 3 counts three times as much as one with weight 1. A text question has no Weight box. | Must |
| FR-CSE-064 | A number question on a Weighted survey may be scored with a configured minimum and maximum, so its value is turned into points on the same scale as the rest of the survey. | A 0–10 question with min 0 and max 10 contributes its value; a value outside the range is capped. | Should |
| FR-CSE-065 | A multi-choice question shall score the **sum** of the selected options' points. Its maximum is the sum of all positive points. | Selecting two options worth 3 and 2 gives 5 points. | Must |
| FR-CSE-066 | On submit, the engine shall compute and store on the Response: **Score** (Σ weight × points), **Maximum score** and **Percentage** (score ÷ maximum × 100). The calculation uses the weights and points of the **pinned form version**, so later edits never change past scores. | The worked example stores 27, 40 and 67.5. After the weights are changed and republished, the old response still shows 67.5. | Must |
| FR-CSE-067 | Each Answer row shall also store its **Points** and **Weighted points**, so question-level analysis needs no recalculation. | The "Would you recommend" answer stores 5 and 10. | Must |
| FR-CSE-068 | An optional question the customer left unanswered shall not count towards the maximum (see OQ-S2). | A survey with one skipped optional question computes its percentage only over the answered questions. | Must |
| FR-CSE-069 | Views, charts and the Excel export shall show response scores: an average percentage per survey setup, a score per customer, and a response list sortable and filterable by score. | An analyst filters to one setup, sorts by percentage and exports the result to Excel. | Must |
| FR-CSE-070 | Publishing a Weighted survey shall be refused unless at least one question has a weight above 0 and every option of each scored question has a Points value. | Publishing a weighted survey whose only scored question has no points shows a clear error and does not publish. | Must |

## 5. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-CSE-010 | Compatibility | Weighted scoring adds columns only. Every existing survey and every standard Form Engine form keeps its current behaviour and published output; standard forms stay byte-identical (the Form Engine regression gate, FR-CSE-025, must pass). |

## 6. Questions for the CEO (all closed 2026-11-11)

| ID | Question | BA recommendation |
|---|---|---|
| OQ-S1 | Where is the normal / weighted switch set: on the **survey form** in the designer, or on the **Survey Setup**? | **CLOSED 2026-11-11 (CEO): on the form**, as FR-CSE-061 states. Points and weights are versioned and pinned with the form, so one form is always scored the same way whichever setup sends it. |
| OQ-S2 | When an optional question is skipped, should it be left out of the maximum (fairer) or count as zero points (stricter)? | **CLOSED 2026-11-11 (CEO): left out**, as FR-CSE-068 states. |
| OQ-S3 | Should a weighted survey also show a **score band**, for example ≥ 80% Satisfied, 50–79% Neutral, < 50% Dissatisfied, with the bands set per survey? | **CLOSED 2026-11-11 (CEO): no bands in release 1.** Analysts use the percentage. Bands can be added later without rework. |
| OQ-S4 | Are the standard **NPS** (0–10, promoters minus detractors), **CSAT** or **CES** formulas needed, or is the weighted percentage enough for release 1? | **CLOSED 2026-11-11 (CEO): weighted percentage only.** NPS, CSAT and CES stay out of scope and can follow as their own addendum. |

## 7. Impact and estimate (for the CEO decision)

| Area | Change |
|---|---|
| Form Engine schema | New columns: Scoring mode on `qdb_form_definition`, Weight (and number min/max) on `qdb_form_field`, Points on `qdb_form_option_value`. Additive. |
| Form Engine designer | Scoring setting in form properties; Weight on question panels and Points in the option editor, shown only on Weighted surveys; the publish check (FR-CSE-070). |
| Form Engine publisher (C#) | Emits scoring mode, weights and points into the published JSON, only when set, so standard forms stay byte-identical. This means a Form Engine plugin deploy. |
| Survey Engine | New columns on Response (score, maximum, percentage) and Answer (points, weighted points); the scoring calculation in the submit API; views, charts and Excel columns. |
| Orgs | Cloud first. Both on-prem 9.1 orgs get it through the B9 kits. |
| Estimate | **4–6 dev-days**, including tests, the regression gate and a live end-to-end test. Fits before B9. |

## 8. Approval

| Role | Name | Decision | Date |
|---|---|---|---|
| CEO | The user | **APPROVED**: "Approved, start building weighted scoring" | 2026-11-11 |
