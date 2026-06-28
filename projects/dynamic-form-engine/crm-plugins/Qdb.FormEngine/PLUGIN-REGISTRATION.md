# Qdb.FormEngine — Plugin Registration Guide

How to package and register the publish-time render-cache plugin in **Dataverse cloud**
and **Dynamics CRM 9.1 on-premises**. Same assembly, two registration wrappers.

---

## 0. Prerequisites

- The render-cache schema is deployed (`qdb_form_render_cache`, `qdb_publish_job`,
  the picklists, and the `qdb_form_code + qdb_published_version + qdb_language_code`
  alternate key). Cloud test org already has it; for on-prem import the managed
  solution (see `scripts/RENDER-CACHE-SCHEMA.md`).
- **Plugin Registration Tool (PRT)** — install via `pac tool prt` or the
  `Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool` NuGet package.
- A connection to the target org with **System Customizer / System Administrator**.

> **Target-framework note:** the CRM sandbox runs .NET Framework. Ensure the plugin
> projects target a sandbox-compatible framework (**4.6.2** is the safe maximum for
> CRM 9.1). If you hit "assembly could not be loaded" on registration, re-target to
> 4.6.2 and rebuild.

---

## 1. Build + merge into ONE assembly

CRM loads a **single** plugin DLL into the sandbox, but `Qdb.FormEngine.Plugins.dll`
depends on `Core.dll`, `Data.dll`, and `Newtonsoft.Json.dll`. Merge them:

```powershell
# In Visual Studio: build the solution (Debug or Release).
# Then, from crm-plugins\Qdb.FormEngine:
.\merge-plugin.ps1 -Configuration Release
# Output: dist\Qdb.FormEngine.Plugins.dll   <-- register THIS file
```

`merge-plugin.ps1` ILRepack-merges Core + Data + Newtonsoft into the plugin assembly
with `/internalize` (the merged-in types become internal; the three public plugin
classes stay public). `Microsoft.Xrm.Sdk` is **not** merged — the sandbox provides it.

> ⚠️ **Register `dist\Qdb.FormEngine.Plugins.dll`, NEVER the one in `bin\`.**
> The merged `dist` DLL is **~793 KB** (Newtonsoft baked in and internalized, strong-named).
> The `bin\Release\Qdb.FormEngine.Plugins.dll` is only **~21 KB** and holds an **external**
> reference to `Newtonsoft.Json 13.0.0.0` plus `Qdb.FormEngine.Core/Data`. Registering the
> `bin` DLL throws this at runtime, in the plugin **constructor** (before any business logic):
> ```
> System.IO.FileNotFoundException: Could not load file or assembly 'Newtonsoft.Json,
> Version=13.0.0.0 ...' at Qdb.FormEngine.Plugins.PluginBase.ParseSecureConfig
> ```
> Quick sanity check before registering: the file you pick must be **~793 KB**, and
> `[Reflection.Assembly]::ReflectionOnlyLoadFrom(path).GetReferencedAssemblies()` must show
> **no external Newtonsoft/Qdb references**. Note the `bin` DLL is **unsigned** while `dist` is
> **signed** — so if you previously registered the `bin` DLL, an in-place *Update* may be
> refused for the public-key-token change; unregister and re-register the `dist` DLL, then
> recreate the steps.

---

## 2. Register the assembly (PRT)

1. PRT → **Create New Connection** → sign in to the org.
2. **Register → Register New Assembly**.
3. Select **`dist\Qdb.FormEngine.Plugins.dll`**.
4. Isolation Mode: **Sandbox**. Location: **Database**.
5. Register. You should see the three plugin types:
   - `Qdb.FormEngine.Plugins.PublishFormPlugin`
   - `Qdb.FormEngine.Plugins.GetPublishedFormJsonPlugin`
   - `Qdb.FormEngine.Plugins.TranslationChangePlugin`

**Secure configuration** (paste on each step you register below):
```json
{"generatorVersion":"1.0.0","defaultLanguageCode":"en"}
```

---

## 3a. CLOUD — create the two Custom APIs

Use PRT → **Register New Custom API** (or the maker portal Custom API tables).

### `qdb_PublishForm`  (the publish action)
| Field | Value |
|---|---|
| Unique Name | `qdb_PublishForm` |
| Name / Display Name | Publish Form |
| Binding Type | Global (unbound) |
| Is Function | No (it has side effects) |
| Enabled for Workflow | No |
| Plugin Type | `Qdb.FormEngine.Plugins.PublishFormPlugin` |
| Execute Privilege | (optional) |

**Request Parameters:**
| Unique Name | Type | Optional |
|---|---|---|
| `FormCode` | String | No |
| `TargetVersion` | Integer | Yes |
| `PublishJobId` | String | No |

**Response Properties:** none.

> Register the plugin step **Async** (Stage 40 / PostOperation). The heavy generation
> runs in the async job so the caller isn't blocked.

### `qdb_GetPublishedFormJson`  (the runtime read action)
| Field | Value |
|---|---|
| Unique Name | `qdb_GetPublishedFormJson` |
| Binding Type | Global (unbound) |
| Is Function | No (action; or Yes if you prefer a read-only function) |
| Plugin Type | `Qdb.FormEngine.Plugins.GetPublishedFormJsonPlugin` |

**Request Parameters:**
| Unique Name | Type | Optional |
|---|---|---|
| `FormCode` | String | No |
| `LanguageCode` | String | Yes (default `en`) |
| `Version` | Integer | Yes (0 = latest active) |

**Response Properties:**
| Unique Name | Type |
|---|---|
| `RuntimeJson` | String |

> Register **Sync** (Stage 40 / PostOperation). *Note:* the Node backend reads the
> render-cache table directly via OData by default and does NOT need this Custom API
> on the hot path. Register it only if another consumer (Power Automate, Copilot,
> a Web Resource) needs CRM to own the read.

---

## 3b. ON-PREM 9.1 — process Actions instead of Custom API

The Custom API entity may be unavailable on 9.1 on-prem. Use **Processes (Actions)**:

1. **Settings → Processes → New** → Category **Action**, Entity **None (global)**,
   Name `qdb_PublishForm`.
2. Add **Process Arguments** (Input): `FormCode` (String), `TargetVersion`
   (Whole Number), `PublishJobId` (String). **Activate** the process.
3. Repeat for `qdb_GetPublishedFormJson` with inputs `FormCode`, `LanguageCode`,
   `Version` and one **Output** argument `RuntimeJson` (String).
4. In PRT, register a plugin **step** on each Action's message (the message name is the
   Action's unique name) bound to the matching plugin type, same Stage/Mode as above.

Argument names MUST match the table above — the plugins read them from
`context.InputParameters[...]` / write `OutputParameters["RuntimeJson"]`.

---

## 4. Register the translation-change step (both platforms)

So that editing a translation after publish regenerates just that language's cache:

| Setting | Value |
|---|---|
| Plugin Type | `Qdb.FormEngine.Plugins.TranslationChangePlugin` |
| Message | `Update` |
| Primary Entity | `qdb_translation` |
| Stage | 40 (PostOperation) |
| Mode | **Asynchronous** |
| Filtering Attributes | `qdb_translated_value` |
| **Pre Image** | Alias **`PreImage`**, attributes: `qdb_entity_name`, `qdb_record_id`, `qdb_language_code` |

---

## 5. Wire the designer + backend

- **Designer:** the Publish button already calls `qdb_PublishForm` via
  `Xrm.WebApi.online.execute` (same name works for Custom API and Action).
- **Backend:** set `USE_RENDER_CACHE=true` (and `REDIS_URL` in cloud, optional) so the
  runtime serves from `qdb_form_render_cache`, falling back to live assembly on a miss.

---

## 6. Test the full publish → generate → serve loop

1. In the designer, open a form and click **Publish**.
2. Confirm a **`qdb_publish_job`** row appears and moves to **Completed**.
3. Confirm **`qdb_form_render_cache`** now has one Active record per enabled language
   (check `qdb_runtime_json` is populated, `qdb_is_active = true`, `qdb_status = Active`).
4. With `USE_RENDER_CACHE=true`, open the form in the portal — it now serves the
   pre-generated JSON. (Verify via the backend log "render cache" hit, or temporarily
   edit `qdb_runtime_json` in the table + invalidate to see the change flow through.)
5. After any direct table change, clear the backend hot-cache:
   `POST /api/internal/cache/invalidate {"formCode":"<code>"}` (or wait the 300s TTL).

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| "Assembly could not be loaded" on register | Re-target plugin projects to **4.6.2**, rebuild, re-merge. |
| `TypeLoadException` for `Qdb.FormEngine.Core/Data`, or `FileNotFoundException` for `Newtonsoft.Json 13.0.0.0` at `PluginBase.ParseSecureConfig` | You registered the un-merged **~21 KB** `bin\Release\Plugins.dll`. Register the **~793 KB** `dist\Qdb.FormEngine.Plugins.dll` instead (see the ⚠️ warning in §1). |
| Newtonsoft version conflict in sandbox | The merge uses `/internalize`, which avoids this; ensure you registered the merged dll. |
| `FileNotFoundException` for `Newtonsoft.Json 13.0.0.0` **`---> 6.0.0.0`** at `ParseSecureConfig`, especially under **Isolation = None** | Same root cause as above — you registered the un-merged **~21 KB** DLL, which has an *external* Newtonsoft 13 reference (the merged ~793 KB `dist` has none). The inner `6.0.0.0` is the **CRM on-prem server's own bundled Newtonsoft** that None-isolation tries to bind to. **Switching to None does not help — it makes it worse.** **Fix:** register the **~793 KB** merged `dist` DLL and set **Isolation = Sandbox**. Verify the file first: `[Reflection.Assembly]::ReflectionOnlyLoadFrom(path).GetReferencedAssemblies()` must show **no external Newtonsoft**. |
| `0x80040216` with message **`sourceHash`** on execute (after rebuilding the DLL) | The registered `pluginassembly` has mismatched `content` vs `sourcehash` — the Database-stored assembly fails hash validation. Caused by patching `pluginassembly.content` directly (script/Web API) without updating `sourcehash`, or a half-applied **Update Assembly** (e.g. across the unsigned→signed change). **Fix:** re-register through PRT — **Unregister** the assembly, **Register New Assembly** with the ~793 KB `dist` DLL (writes content + sourcehash + publickeytoken atomically), then recreate the steps. Never patch `content` directly. |
| Publish job stuck at "Generating" | Check the async system job's error; confirm the step is Async PostOperation and the secure config JSON is present. |
| `RuntimeJson` empty / cache-miss | No active cache record for that form+version+language; the backend falls back to live assembly (by design). |
