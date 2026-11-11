# CEO BRD Decision — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Decision | **APPROVED** |
| Decided by | The user, acting as CEO, in chat on 2026-11-09 |
| BRD | `phase-2-ba.md` v1.1: 60 FR + 9 NFR = 69 requirements |
| Next phase | GitHub research, then architecture |

The user approved the BRD directly. The CEO-agent review that had been started was stopped before it wrote any
output, so no agent conditions were added.

## Gates carried forward from the BRD (not new conditions)

These are already requirements in v1.1. They are listed here so later phases cannot lose them.

1. **OQ-A1 and NFR-CSE-008.** QDB Compliance must set the retention period and give PDPPL sign-off before release.
2. **OQ-A2.** The architecture confirmations (lookup targets, status values per org, language field, Digital/Legacy field, SMS hand-off contract, portal technology) must be resolved in the architecture phase.
3. **NFR-CSE-009.** The secure-link channel stays disabled until its security review is signed off.
4. **FR-CSE-024 and FR-CSE-025.** The Form Engine Save defect is fixed before survey work relies on it. The content regression gate runs before every Form Engine deploy that carries survey changes.
5. **OQ-A3.** The client confirms the AC4 and AC2.2 readings at sign-off.

## Addendum A — Weighted scoring (2026-11-11)

| | |
|---|---|
| Decision | **APPROVED** by the user: "Approved, start building weighted scoring" |
| Document | `phase-2-ba-addendum-weighted-scoring.md`: FR-CSE-061 to 070 + NFR-CSE-010; OQ-S1 to S4 closed (switch on the form, skipped questions left out of the maximum, no score bands, no NPS/CSAT/CES) |
| BRD | v1.2 = v1.1 + Addendum A: 70 FR + 10 NFR = 80 requirements |
| Carried gate | FR-CSE-025: the Form Engine regression gate must pass before the Form Engine deploy that carries scoring (NFR-CSE-010). |
