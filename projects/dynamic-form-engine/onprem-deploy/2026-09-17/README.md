# Form Engine — on-prem update kit, 2026-09-17

Supersedes `../2026-09-16/`. Same plugin assembly, **new single-file designer**.

This kit fixes two separate on-prem defects:

1. **A business rule targeting a section under a summary tab never reaches the published
   JSON** (reported on **Reyada-IPC**), so the runtime cannot hide or show that section.
2. **The designer loads as a blank page** when opened from the sitemap or through
   `main.aspx?pagetype=webresource&webresourceName=qdb_%2Fform-designer%2Findex.html`.

The two are unrelated. Defect 1 is fixed by the DLL, defect 2 by the solution ZIP.

---

## What is in this kit

| File | What it is | How it is deployed |
|---|---|---|
| `Qdb.FormEngine.Plugins.dll` | Merged plugin assembly, built 2026-09-06. Byte-identical to the 2026-09-16 kit — **if you already applied that one, skip step 1.** Carries `qdb_PublishForm`, `qdb_GetPublishedFormJson`, the translation step and the publish workflow activity. | Plugin Registration Tool → **Update** the existing assembly |
| `FormDesignerWebResource_1.3.0.zip` | Unmanaged solution with **two** web resources — the designer as one self-contained `index.html`, and the in-CRM runtime `qdb_form_runtime.html` — plus the sitemap entry and the Form Designer role. | Settings → Solutions → Import |

---

## Defect 1 — the section rule

**Root cause.** Until 2026-07-28 the plugin attached every business rule to the field the
rule *acts on*. A rule that targets a section or a tab has no target field, so it was never
published — exactly "the business rule is not appearing in JSON". The assembly in this kit
attaches a rule to the field that **triggers** it, which is the only field that can make it
re-evaluate. The same shape was seeded, published and driven through the runtime on the
cloud org to confirm it works on this build.

---

## Defect 2 — the blank designer

**Root cause.** The designer was built as an HTML shell plus ten separately-served asset
files, referenced relatively (`./assets/index-<hash>.js`). That resolves correctly only when
the browser's document base is the web resource folder. It is not: the designer is opened
through `main.aspx`, which is the only URL that exposes `parent.Xrm` and therefore the only
one the designer can run under. On that URL `./assets/...` resolves against the org root, so
every asset returns 404 — the shell loads, the app never boots, and the page is blank.

This matched the reported symptom exactly: the five **directly referenced** assets 404, while
the lazily-loaded chunks (`exceljs`, `AdvancedComponentsPanel`) were never requested at all,
because the entry bundle that would have requested them never ran.

**Fix.** The designer is now built as a single self-contained `index.html` with every script
and stylesheet inlined — the same pattern the in-CRM runtime (`qdb_form_runtime.html`) has
always used and which already works on this org. There are no external references left, so
there is no base to resolve and no second request to lose. It also removes the whole class
of partial-import failures, since the solution now carries one designer web resource
instead of ten.

The web resource name is unchanged (`qdb_/form-designer/index.html`), so the existing
sitemap entry and any bookmarked `main.aspx` URL keep working.

**Trade-off.** The bundle is 2.2 MB and is re-fetched whole on every publish rather than
reusing cached vendor chunks. This costs little in practice: CRM keys its web resource cache
on a path token that changes on every *Publish All Customizations*, so the vendor chunks were
rarely reused across publishes anyway.

---

## Order

1. **Update the plugin assembly** in the Plugin Registration Tool. Select the existing
   `Qdb.FormEngine.Plugins` assembly and choose **Update**, so the registered steps and the
   Custom API bindings survive. Registering it as a new assembly orphans them.
   *Skip this step if the 2026-09-16 kit was already applied — the DLL is unchanged.*
2. **Import `FormDesignerWebResource_1.3.0.zip`** as unmanaged, choosing **Maintain
   customizations** if prompted.
3. **Publish All Customizations.**
4. **Re-publish Reyada-IPC.** The render cache is only rebuilt when a form is published, so
   until this step the old JSON is still being served.
5. Hard-refresh. A full publish alone still serves a stale web resource; add a cache-busting
   parameter to the inner iframe source, never to `main.aspx` itself, which rejects unknown
   query parameters.

### Verifying the designer

Open it the way a user does — from the sitemap, or:

```
https://<crm-server>/<org>/main.aspx?pagetype=webresource&webresourceName=qdb_%2Fform-designer%2Findex.html
```

The form list should load. Do **not** verify at the raw
`/<org>/WebResources/qdb_/form-designer/index.html` path: `parent.Xrm` is absent there, and
that path is also what masked this defect previously — the old chunked build worked there
while failing everywhere a user would actually open it.

### Cleaning up afterwards

The ten old asset web resources (`qdb_/form-designer/assets/*`) are no longer referenced by
anything once this kit is imported. They are harmless, and can be deleted once the new
designer is confirmed working.

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
  compares the value the dropdown stores, case-sensitively. Check for an **en dash** where a
  hyphen was expected.
- **An auto-set lookup that writes only the record GUID will not match a label-based
  condition.** A lookup cell registers both the id and the display name, and `equals` matches
  either — but only if both were written. Write both halves, or write the condition against
  the id.

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

**None of these is required for either fix.** Steps 1 to 5 stand on their own. The list
matters when a maker opens the designer and touches one of those features.

Also on the cloud org and not yet on-prem: `qdb_max_results` on `qdb_form_lookup_config` now
allows **1 to 250** rather than 1 to 50. That is an attribute range change, not a new column,
and it has to be applied to each org separately.

The provisioning scripts under `scripts/` authenticate with client credentials against
`login.microsoftonline.com`, so they **do not run against on-prem**. These columns have to
be added through a solution or by hand.

---

## Known on-prem risks

- **Web resource size.** The designer is now a single 2.2 MB file and the runtime a single
  1.9 MB file. The on-prem default limit is 5 MB; if your org lowered it, raise it before
  importing. This is the main thing to check before step 2.
- **Package version.** `solution.xml` declares `SolutionPackageVersion="9.0"`, which 9.0 and
  9.1 accept. The July kit was exported at 9.2 and may be refused by an older on-prem build.
- **Re-import updates, it does not duplicate.** Every web resource carries a GUID derived
  from its name, so a re-import updates the same record. `qdb_/form-designer/index.html`
  keeps the same GUID it had as the chunked shell, so this kit replaces it in place.
- **ZIP entry separators.** Solution ZIPs are written through `System.IO.Compression` with
  explicit forward-slash entry names. Do not rebuild one with PowerShell `Compress-Archive`:
  it writes backslashes, which CRM cannot resolve to the declared `FileName`, and the import
  fails on a file it can plainly see in the archive.

---

## How this kit was built

```
cd projects/dynamic-form-engine/designer
npm run build:singlefile
node scripts/packageSolution.js --version 1.3.0 --runtime ../frontend/dist-webresource/index.html
```

`npm run package:singlefile` does both in one step, at the version in `package.json`.
The default `npm run build` / `npm run package` still produce the chunked build, which is
unchanged and verified byte-for-byte identical to the 1.2.0 output.
