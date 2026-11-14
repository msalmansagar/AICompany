# Customer Survey Engine — Approach Decision

| | |
|---|---|
| Decided | 2026-11-09, by the user |
| Replaces | Option E (separate renamed copy of the Form Engine), chosen 2026-11-08 pending review |
| Baseline | Form Engine tag `dfe-baseline-2026-11-08` (PR #172, `773f32be`) |

## Decision: hybrid on the Form Engine core

| Piece | Where it lives |
|---|---|
| Designer and renderer | The existing Form Engine, with a new Form Type = Survey on the form definition |
| Survey questions, rules, translations, versions | The existing Form Engine tables |
| Published JSON | The existing render cache (`qdb_form_render_cache.qdb_runtime_json`) |
| Survey sources, triggers, invitations, responses, answers, suppression log | New survey tables in a separate `SurveyEngine` solution |

## Why

- No rename of ~40 tables, the plugin assembly, the Custom APIs or the web resources (saves ~15–25 dev-days).
- Defects are fixed once for both products.
- Administrators learn one designer.
- Survey data is isolated: removing the survey solution never touches form data.
- The render cache is already keyed by form code + version + language, which is how a survey pins one version (AC16).

## Conditions the design must meet

1. **Additive only.** Form Engine changes only add, and survey behaviour switches on only when Form Type = Survey.
2. **Regression gate.** Before every Form Engine deploy, re-publish all existing forms and compare the render-cache output.
3. **Separate Submit path.** A survey form's Submit writes to the survey response tables, not to a mapped CRM entity.
4. **Distinct form codes.** Survey form codes carry a reserved prefix (e.g. `SRV-`), because the cache is keyed by form code.
5. **Shared release train.** Survey work that touches the Form Engine core ships in a Form Engine release.
6. **Inherited defect to fix first.** The designer's Save drops `radioRenderStyle`, `fileCaptureMode`, `componentKey` and `numberDisplayStyle` (`FormSaveService.ts`), so Rating questions lose their display style. Fix this before survey work relies on it.
