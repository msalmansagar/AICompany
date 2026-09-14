# Change note — lookup Max Results raised to 250, and two reports re-validated

Date: 2026-09-14. Branch `feat/dfe-six-point-batch`. Path: enhancement (no contract change —
the field, its meaning and every consumer are unchanged; only the permitted range grows).

## CHG-003 — `qdb_max_results` on `qdb_form_lookup_config` allows 1–250 (was 1–50)

| Where the limit lived | Before | After |
|---|---|---|
| Org metadata, org5869857f (`IntegerAttributeMetadata.MaxValue`) | 50 | **250** — updated by `PUT` on the attribute and published (`PublishXml`, 204). Read back: 250. |
| Portal lookup route `GET /lookups` query `max` (zod) | `.max(50)` | `.max(MAX_LOOKUP_RESULTS)` |
| Portal external-API proxy query `max` (zod) | `.max(50)` | `.max(MAX_LOOKUP_RESULTS)` |
| `ApiLookupService` result clamp | `MAX_RESULTS_HARD_CAP = 50` | `MAX_LOOKUP_RESULTS = 250`, exported and shared with the routes |
| In-CRM runtime lookup (`webresource/xrm/lookupApi.ts`) | no cap — passes the value as `$top` | unchanged |
| C# publisher (`FieldBuilder`) | reads the integer, no cap | unchanged |
| `phase-4-crm.md` constraint | "must not exceed 50" | "must not exceed 250" |

Two tests pin the ceiling. Backend suite for the lookup services and routes: 53 passed.

**Any other org** (on-prem included) still carries `MaxValue = 50` in its own metadata until the
same attribute update is applied there; the code change alone does not raise it.

**Observed, not changed:** the designer's Lookup Configuration screen has no input for Max
Results or Minimum Search Characters. A maker sets `qdb_max_results` on the record itself.

## Re-validation of the two reports marked "still not working"

Both were checked on 2026-09-14 against org5869857f, on `four-point-demo`, the form seeded for
exactly these two shapes (a hidden field on the summary tab; a section on the summary tab hidden
by a lookup value on the first tab).

**Nothing in the org has changed since 2026-09-07.** No form, tab, section, field, rule or
render cache has a `modifiedon` after the deploy that morning. The reports were therefore not
produced by a re-test on this org after the fix.

| Report | Evidence | Result |
|---|---|---|
| 1. Hidden field on the summary tab missing from the JSON | `qdb_GetPublishedFormJson('four-point-demo')`: tab "2 · Summary" → section "Summary details" → `fpd_internal_ref` present with `isHidden: true, isVisible: false`. | **Works.** Published, not drawn. |
| 2. Rule on a summary-tab section does not fire | Rule "Hide the Sponsor block when the sponsor is QDB Enterprise Solutions" is in the JSON on its trigger field `fpd_sponsor` with `action: hideSection`, `targetSectionId` = the Sponsor block. The real render cache was then loaded through the real `FormProvider` + `TabRenderer`: setting the sponsor lookup to that account removed "Sponsor block" from the summary tab (`sectionVisibility` = false); setting another account brought it back. | **Works.** |

The deployed in-CRM runtime bundle (`qdb_form_runtime.html`, modified 2026-09-07 08:43Z) was
built after the last runtime commit; its visibility predicate appears once, as in the fixed
source, where the old code had six sites.

**What would still reproduce the reports:** a different org whose plugin assembly and runtime
web resource were not redeployed; a form that has not been re-published since the deploy (the
render cache is rebuilt only on publish); or, for report 2, a lookup value that is not the exact
display name the rule compares against (matching is case-sensitive, on the id or the display
name).
