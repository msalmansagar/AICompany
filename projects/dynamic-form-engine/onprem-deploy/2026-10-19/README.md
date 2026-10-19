# Form Engine — on-prem update kit, 2026-10-19

Supersedes `../2026-09-17/` for the two web resources. **No plugin assembly in this kit** —
keep the DLL the org already runs.

This kit fixes one on-prem defect:

**Web API calls fail with HTTP 500 on Dynamics 9.1 on-premise** (reported on
`mcdynccatdev01`). The designer and the in-CRM runtime called `/api/data/v9.2/...`
directly, and a 9.1 server does not serve v9.2.

---

## What is in this kit

| File | What it is | How it is deployed |
|---|---|---|
| `FormDesignerWebResource_1.4.0.zip` | Unmanaged solution with the single-file designer (`qdb_/form-designer/index.html`) and the in-CRM runtime (`qdb_form_runtime.html`), plus the sitemap entry and the Form Designer role. | Settings → Solutions → Import |

Both web resources are byte-identical to what runs on the cloud org since 2026-10-19
(designer sha256 `37cbd42b2db3e705…`, runtime `c8db1b42f6aebf3f…`).

---

## The defect

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

## Why the plugin DLL is not included

The current plugin publishes a grid column's **Is Editable** setting (DEF-002). Entry-grid
columns saved on-prem under the designer's old default (**No**) would become **locked** the
moment that DLL ships. Before it can go in, list every `qdb_grid_column_config` row on
entry grids with `qdb_is_editable = No` and confirm which are meant to be locked. Until then
keep the assembly the org already runs; this kit does not need it.

---

## Order

1. **Import `FormDesignerWebResource_1.4.0.zip`** as unmanaged, choosing **Maintain
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
