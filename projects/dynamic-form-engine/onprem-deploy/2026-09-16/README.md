# Form Engine — on-prem update kit, 2026-09-16

Built to fix the **Reyada-IPC** report: a business rule that targets a section under a
summary tab never reaches the published JSON, so the runtime cannot hide or show that
section. The cause is on the on-prem org, not in the rule.

**Root cause.** Until 2026-07-28 the plugin attached every business rule to the field the
rule *acts on*. A rule that targets a section or a tab has no target field, so it was never
published — exactly "the business rule is not appearing in JSON". The assembly in this kit
attaches a rule to the field that **triggers** it, which is the only field that can make it
re-evaluate. The same shape was seeded, published and driven through the runtime on the
cloud org to confirm it works on this build.

---

## What is in this kit

| File | What it is | How it is deployed |
|---|---|---|
| `Qdb.FormEngine.Plugins.dll` | Merged plugin assembly, built 2026-09-06. Carries `qdb_PublishForm`, `qdb_GetPublishedFormJson`, the translation step and the publish workflow activity. | Plugin Registration Tool → **Update** the existing assembly |
| `FormDesignerWebResource_1.2.0.zip` | Unmanaged solution with **11 designer web resources + the in-CRM runtime** `qdb_form_runtime.html`, plus the sitemap entry and the Form Designer role. | Settings → Solutions → Import |

The two are independent: the DLL fixes publishing, the solution fixes rendering. **Both are
needed.** The DLL decides what reaches the render cache; the runtime decides what the user
sees. A rule that a fixed plugin publishes is still misdrawn by an old runtime.

---

## Order

1. **Update the plugin assembly** in the Plugin Registration Tool. Select the existing
   `Qdb.FormEngine.Plugins` assembly and choose **Update**, so the registered steps and the
   Custom API bindings survive. Registering it as a new assembly orphans them.
2. **Import `FormDesignerWebResource_1.2.0.zip`** as unmanaged, choosing **Maintain
   customizations** if prompted.
3. **Publish All Customizations.**
4. **Re-publish Reyada-IPC.** The render cache is only rebuilt when a form is published, so
   until this step the old JSON is still being served.
5. Hard-refresh the runtime. A full publish alone still serves a stale web resource; add a
   cache-busting parameter to the inner iframe source, never to `main.aspx` itself, which
   rejects unknown query parameters.

---

## Then check the rule record itself

If the section still does not hide after step 4, the rule record is the next thing to read.
Three settings decide whether it can ever fire, and the designer does not enforce any of
them on a rule authored directly on the section's Form Business Rules tab.

- **Form Definition must point at Reyada-IPC.** The plugin only reads rules whose
  `qdb_form_definition_id` equals the form being published. A blank lookup publishes
  nothing. Twelve rules on the cloud org are in that state today.
- **Conditions Logic must be OR.** The reported rule has two `equals` conditions on one
  field. Under AND they can never both be true, so the rule publishes and never fires.
- **Condition values must equal the option's stored value, not its label.** The runtime
  compares the value the dropdown stores, case-sensitively. If the option values are codes
  and the rule names labels, nothing matches.

---

## Schema: ten changes since the July kit

`FORM_ENGINE_unmanaged.zip` in the parent folder was exported on 2026-07-06. Ten schema
changes have landed since. The web resources in this kit read and write these columns, so a
column that is absent shows up as a designer save failing with a 400, or as a feature that
silently does nothing.

| Column | Entity |
|---|---|
| `qdb_show_document_view`, `qdb_show_document_download` | `qdb_form_field` |
| `qdb_bar_source`, `qdb_bar_source_entity`, `qdb_bar_min_value`, `qdb_bar_max_value`, `qdb_bar_min_attribute`, `qdb_bar_value_field_schema`, `qdb_bar_max_field_schema` | `qdb_form_field` |
| `qdb_is_child_entity`, `qdb_child_entity_relationship_name`, `qdb_grid_column_attribute`, `qdb_target_entity_logical_name`, `qdb_target_attribute_logical_name` | `qdb_form_submission_mapping` |
| `qdb_target_entity_set_name`, `qdb_target_navigation_property` | `qdb_form_submission_mapping` |
| `qdb_require_submit_confirmation`, `qdb_submit_confirmation_label`, `qdb_submit_confirmation_message` | `qdb_form_tab` |
| `qdb_reveal_sections_one_at_a_time` | `qdb_form_tab` |
| `qdb_header_text`, `qdb_header_image_url`, `qdb_footer_text`, `qdb_footer_image_url` | `qdb_form_definition` |
| `qdb_icon_name`, `qdb_image_url` | `qdb_form_definition` |
| `qdb_entity_logical_name` | `qdb_form_definition` |
| `qdb_is_required`, `qdb_max_length`, `qdb_validation_format`, `qdb_validation_pattern`, `qdb_validation_message` | `qdb_grid_column_config` |

**None of these is required for the section-rule fix.** Steps 1 to 5 stand on their own.
The list matters when a maker opens the designer and touches one of those features.

Also on the cloud org and not yet on-prem: `qdb_max_results` on `qdb_form_lookup_config` now
allows **1 to 250** rather than 1 to 50. That is an attribute range change, not a new column,
and it has to be applied to each org separately.

The provisioning scripts under `scripts/` authenticate with client credentials against
`login.microsoftonline.com`, so they **do not run against on-prem**. These columns have to
be added through a solution or by hand.

---

## Known on-prem risks

- **Package version.** `solution.xml` declares `SolutionPackageVersion="9.0"`, which 9.0 and
  9.1 accept. The July kit was exported at 9.2 and may be refused by an older on-prem build.
- **Web resource size.** `qdb_form_runtime.html` is a single 1.9 MB file. The on-prem default
  limit is 5 MB; if your org lowered it, raise it before importing.
- **Re-import updates, it does not duplicate.** Every web resource carries a GUID derived
  from its name, so a re-import updates the same record.
- **The designer chunk names carry content hashes.** A later build emits different file
  names, so old chunks stay behind as orphans after an update. They are unreferenced and
  harmless, and can be deleted once the new build is confirmed working.
