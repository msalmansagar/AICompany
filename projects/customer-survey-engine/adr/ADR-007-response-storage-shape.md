# ADR-007 — Response storage shape

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-09 |
| Decided by | architect |
| Relates to | FR-CSE-053, 056, 057; NFR-CSE-002; OQ-08; §4.5, §4.6 |

## Context

Responses must be viewable in CRM (views, charts, Excel export), restricted to
the Survey Analyst role, and **Power BI-ready** (OQ-08), while keeping full
fidelity of what the customer submitted. A survey submit must **never** write to a
mapped CRM entity (FR-CSE-053) — unlike a standard DFE form, which maps to a
parent/child entity in `submitEngine.ts`. Options: JSON-only (not reportable in
CRM views/charts), relational-only (loses fidelity of complex answers), or both.

## Decision

Store **three things per submission**: one `qdb_survey_response` row per
invitation (with denormalised setup/customer/source/version/language for
filtering), **N `qdb_survey_answer` rows** (one per question, carrying
`qdb_answer_text` and a separate `qdb_answer_numeric` for ratings/numbers so
charts aggregate without parsing), and the **full `qdb_answers_json`** on the
response for fidelity and Power BI. Uniqueness is a **response alternate key on
the invitation** (one response per invitation, NFR-CSE-002).

## Consequences

- CRM views/charts/Excel work off the relational Answer rows (FR-CSE-057); Power
  BI can read either the rows or the JSON (FR-CSE-056).
- A numeric column makes satisfaction scores (NPS/CSAT) cheap later, though they
  stay out of scope (§19.5).
- Some duplication (JSON + rows) — accepted: they serve different consumers, and
  the JSON is the source of truth for replay/fidelity.
- Answer content is role-gated to Survey Analyst (FR-CSE-060); the tables are not
  parented to the customer for cascade, so customer access does not leak answers.
- **No draft/resume** is designed (Skeptic ch. 8): submit is atomic. If partial
  save is wanted, it is a new requirement, not a shape change here.
