# CEO Architecture Decision — Customer Survey Engine (CSE-ENG-001)

| | |
|---|---|
| Decision | **APPROVED** |
| Decided by | The user, acting as CEO, in chat on 2026-11-09 |
| Architecture | `phase-3-arch.md` + `adr/ADR-001..007` |
| Estimate | 46–61 dev-days (B0–B9) |
| Next phase | Phase 4, technical build, starting with B0 (DFE prerequisites) |

## Approved with the Skeptic resolutions

All 8 Skeptic challenges are resolved. See the table at the end of `phase-3-arch.md`. The resolutions that change the plan:

- **Regression gate:** the baseline is captured before the B0 Save-defect fix, and the gate runs after it.
- **Plugin steps:** the steps for the 3 known sources ship pre-registered; dynamic registration applies only to sources added later.
- **Scope addition:** a "Survey health" view, built in B8.
- **Integration requirement:** QDB's portal team rate-limits the token page.
- **Digital/Legacy:** a flag exists on every request table. Only its field name per source is still to be confirmed.

## Gates still open (not blocking build)

- **OQ-A1:** retention value and PDPPL sign-off. Blocks release.
- **OQ-A2 (b, c, e, f):** status values, language field, SMS contract, portal tech. Blocks activation per org.
- **NFR-CSE-009:** the secure-link security review. Blocks enabling the link channel.
