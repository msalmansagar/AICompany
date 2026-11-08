# Form Engine — on-prem update kit, 2026-10-19

Supersedes `../2026-09-17/` for the two web resources. **No plugin assembly in this kit** —
keep the DLL the org already runs.

This kit fixes two defects:

1. **Web API calls fail with HTTP 500 on Dynamics 9.1 on-premise** (reported on
   `mcdynccatdev01`). The designer and the in-CRM runtime called `/api/data/v9.2/...`
   directly, and a 9.1 server does not serve v9.2.
2. **A dropdown with a CRM option source shows its static rows, or nothing.** A field with
   `qdb_option_source_entity` + `qdb_option_source_attribute` should list the live choices of
   that CRM attribute; it showed the hand-copied `qdb_form_option_value` rows instead.

---

## What is in this kit

| File | What it is | How it is deployed |
|---|---|---|
| `FormDesignerWebResource_1.4.1.zip` | Unmanaged solution with the single-file designer (`qdb_/form-designer/index.html`) and the in-CRM runtime (`qdb_form_runtime.html`), plus the sitemap entry and the Form Designer role. | Settings → Solutions → Import |

Both web resources are byte-identical to what runs on the cloud org since 2026-10-19
(designer sha256 `37cbd42b2db3e705…`, runtime `a9f15fd8d4d41b3c…`).

---

## Defect 1 — the v9.2 Web API path

**Root cause.** Most calls go through `Xrm.WebApi`, which picks the right version itself.
A few cannot, and those fetched `/api/data/v9.2/` with the version hard-coded:

| Where | What failed on 9.1 |
|---|---|
| Designer — metadata pickers | Target entity, attribute and child-relationship dropdowns |
| Designer — Publish | The Publish button (calls `qdb_PublishForm`) |
| Designer — form-level save | Title, description and confirmation text did not save |
| Runtime | Choice options from metadata, lookup binding, view-based lookups and grids |

**Fix.** Both now read the server's version from
`Xrm.Utility.getGlobalContext().getVersion()` and build the path from it — `v9.1` on this
server, `v9.2` on the cloud. If the version cannot be read, they use `v9.0`, which every 9.x
server serves.

**Not ours.** The URL in the report
(`EntityDefinitions?$select=LogicalName,DisplayName,LogicalCollectionName,IconSmallName,…`)
is not issued by the Form Engine — no build or kit contains that query. It is most likely
CRM's own UI.

---

## Defect 2 — the option source

**Root cause — three faults, any one enough to break it.**

1. The plugin publishes a field's `qdb_form_option_value` rows even when the field has a CRM
   source, and the dropdown used those rows whenever there were any — so the live list was
   never asked for. That is why it "only worked when the options were duplicated".
2. The live list was read by casting the attribute to `PicklistAttributeMetadata`. Dataverse
   answers that with 404 for a **multi-select** choice (and for Status/State), and the 404
   became an empty dropdown with no message.
3. On this server the request also went to `/api/data/v9.2/` — defect 1.

**Fix.** When both source columns are set, the dropdown now ignores the static rows and shows
the attribute's live choices, in CRM's order, labels in the user's language. The attribute's
type is read first and the matching cast is used (Choice, Choices, Status, State). If the
source cannot be read, the browser console says so (`[DFE-options] …`) instead of failing
silently. Fields without a source keep using `qdb_form_option_value`, ordered by
`qdb_display_order`. No plugin change is needed.

**Scope.** This fix is for the **Dropdown** field type, as reported. Multi-select, radio and
checkbox-group fields still use only the static rows.

---

## Why the plugin DLL is not included

The current plugin publishes a grid column's **Is Editable** setting (DEF-002). Entry-grid
columns saved on-prem under the designer's old default (**No**) would become **locked** the
moment that DLL ships. Before it can go in, list every `qdb_grid_column_config` row on
entry grids with `qdb_is_editable = No` and confirm which are meant to be locked. Until then
keep the assembly the org already runs; this kit does not need it.

---

## Order

1. **Import `FormDesignerWebResource_1.4.1.zip`** as unmanaged, choosing **Maintain
   customizations** if prompted.
2. **Publish All Customizations.**
3. Open the designer **only** through
   `<org url>/main.aspx?pagetype=webresource&webresourceName=qdb_%2Fform-designer%2Findex.html`
   — never the raw `/WebResources/` path, which has no `parent.Xrm`.
4. Hard-refresh. If the old version is still served, add a cache-busting parameter to the
   inner iframe source, never to `main.aspx` itself.

## How to confirm the fix

With the browser's developer tools open on the **Network** tab:

1. In the designer, open **Submission Mapping** and pick a target entity — the list fills,
   and the requests go to `/api/data/v9.1/EntityDefinitions…` with status 200.
2. Change a form's title, **Save**, reopen the form — the new title is still there.
3. **Publish** the form — it completes, and the request goes to `/api/data/v9.1/qdb_PublishForm`.
4. Open the published form in the runtime — choice fields and lookups fill, with
   `/api/data/v9.1/` requests only.

No request to `/api/data/v9.2/` should appear from the designer or the runtime.

5. Open a form with a dropdown whose `qdb_option_source_entity` / `qdb_option_source_attribute`
   are set (for example `qdb_servicerequest` / `qdb_keychallengesinoperationstoday`). The
   dropdown lists exactly the choices defined on that CRM attribute — not the rows in
   `qdb_form_option_value` — and the Network tab shows two `/api/data/v9.1/EntityDefinitions…`
   requests for it. No form needs re-publishing for this; it is read live on every open.
