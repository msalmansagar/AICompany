# Qdb.FormEngine — CRM Plugin Solution

Dynamics CRM on-premise 9.1 and Dataverse cloud plugin suite that generates, caches and serves
rendered form JSON for the Dynamic Form Engine portal. A single codebase targets both environments.

---

## 1. Project Layout

```
Qdb.FormEngine\
  Qdb.FormEngine.sln
  Qdb.FormEngine.Core\              # Pure domain — no CRM message routing
    Abstractions\
      FormRawData.cs                # POCO carrying all raw Entity collections
      IMetadataReader.cs
      IRenderCacheRepository.cs
      IPublishJobRepository.cs
      RenderCacheWriteRequest.cs
    Generation\
      IFormJsonGenerator.cs
      FormJsonGenerator.cs          # Maps raw entities → FormDefinitionModel
      ITranslationResolver.cs
      TranslationResolver.cs
      ISecurityStripper.cs
      SecurityStripper.cs
    Hashing\
      HashService.cs                # SHA-256 hex
    Models\
      FormDefinitionModel.cs        # All DTOs with [JsonProperty] attributes
      PicklistMapper.cs             # Picklist int → string conversions
      TranslationMap.cs
    Serialization\
      IJsonSerializer.cs
      NewtonsoftJsonSerializer.cs   # CamelCase, NullIgnore, ISO dates
      GzipCompressor.cs
  Qdb.FormEngine.Data\              # CRM I/O — QueryExpression, Memo column read/write
    CrmMetadataReader.cs
    RenderCacheRepository.cs
    PublishJobRepository.cs
  Qdb.FormEngine.Plugins\           # IPlugin implementations
    PluginBase.cs
    PublishOrchestrator.cs          # Shared publish pipeline logic
    PublishFormPlugin.cs            # Stage 40, Async
    GetPublishedFormJsonPlugin.cs   # Stage 40, Sync
    TranslationChangePlugin.cs      # qdb_translation Update, Stage 40, Async
  Qdb.FormEngine.Workflows\         # CodeActivity for on-prem Process Actions
    PublishFormActivity.cs
  Qdb.FormEngine.Tests\             # xUnit + Moq
    FormJsonGeneratorTests.cs
    TranslationResolverTests.cs
    SecurityStripperTests.cs
    HashServiceTests.cs
    GzipCompressorTests.cs
```

---

## 2. Prerequisites

- Visual Studio 2022 (any edition)
- .NET Framework 4.6.2 Developer Pack
- NuGet CLI (`nuget.exe` on PATH) or NuGet Package Manager in Visual Studio
- Microsoft CRM SDK 9.0.2.49 (`Microsoft.CrmSdk.CoreAssemblies`)
- ILRepack (for merging assemblies before plugin registration)

---

## 3. Build Steps

### Restore NuGet packages

```bat
nuget restore Qdb.FormEngine.sln
```

### Build Release

```bat
msbuild Qdb.FormEngine.sln /p:Configuration=Release /p:Platform="Any CPU"
```

### Merge assemblies for plugin registration

The plugin sandbox cannot load assemblies from disk. Merge all dependencies into a single DLL
using ILRepack before registering in Plugin Registration Tool or PAC CLI:

```bat
ILRepack /out:Qdb.FormEngine.Plugins.merged.dll ^
  Qdb.FormEngine.Plugins\bin\Release\Qdb.FormEngine.Plugins.dll ^
  Qdb.FormEngine.Plugins\bin\Release\Newtonsoft.Json.dll ^
  Qdb.FormEngine.Plugins\bin\Release\Qdb.FormEngine.Core.dll ^
  Qdb.FormEngine.Plugins\bin\Release\Qdb.FormEngine.Data.dll
```

Register `Qdb.FormEngine.Plugins.merged.dll` (not the unmerged DLL).

For the Workflow assembly, merge similarly:

```bat
ILRepack /out:Qdb.FormEngine.Workflows.merged.dll ^
  Qdb.FormEngine.Workflows\bin\Release\Qdb.FormEngine.Workflows.dll ^
  Qdb.FormEngine.Workflows\bin\Release\Newtonsoft.Json.dll ^
  Qdb.FormEngine.Workflows\bin\Release\Qdb.FormEngine.Core.dll ^
  Qdb.FormEngine.Workflows\bin\Release\Qdb.FormEngine.Data.dll ^
  Qdb.FormEngine.Workflows\bin\Release\Qdb.FormEngine.Plugins.dll
```

---

## 4. Plugin Registration — Cloud (Custom API + Dataverse)

### 4a. Create Custom APIs

Create two Custom APIs in your Dataverse solution via PAC CLI or Plugin Registration Tool:

**qdb_PublishForm**
- Unique Name: `qdb_PublishForm`
- Binding Type: Global (none entity)
- Is Function: No (Action)
- Is Private: No
- Is Customizable: Yes
- Input Parameters: `FormCode` (String), `TargetVersion` (Integer), `PublishJobId` (String)

**qdb_GetPublishedFormJson**
- Unique Name: `qdb_GetPublishedFormJson`
- Binding Type: Global (none entity)
- Is Function: Yes
- Is Private: No
- Input Parameters: `FormCode` (String), `LanguageCode` (String), `Version` (Integer)
- Output Parameters: `RuntimeJson` (String)

### 4b. Register plugin steps

Using Plugin Registration Tool or PAC CLI:

| Plugin Class | Message | Entity | Stage | Mode | Filtering Attributes |
|---|---|---|---|---|---|
| `Qdb.FormEngine.Plugins.PublishFormPlugin` | `qdb_PublishForm` | none | PostOperation (40) | Async | — |
| `Qdb.FormEngine.Plugins.GetPublishedFormJsonPlugin` | `qdb_GetPublishedFormJson` | none | PostOperation (40) | Sync | — |
| `Qdb.FormEngine.Plugins.TranslationChangePlugin` | `Update` | `qdb_translation` | PostOperation (40) | Async | `qdb_translated_value` |

Set Secure Config on each step:
```json
{"generatorVersion":"1.0.0","defaultLanguageCode":"en"}
```

---

## 5. Plugin Registration — On-Premise (Process Action + Workflow Activity)

### 5a. Register assemblies

Open Plugin Registration Tool connected to your on-prem CRM 9.1 organisation:

1. Register New Assembly → browse to `Qdb.FormEngine.Plugins.merged.dll`
2. Register New Assembly → browse to `Qdb.FormEngine.Workflows.merged.dll`

For `Qdb.FormEngine.Workflows.merged.dll`, set **Isolation Mode = Sandbox** and
**Location = Database**.

### 5b. Register plugin steps

Register the same steps as in Section 4b using Plugin Registration Tool.

For `PublishFormPlugin` and `GetPublishedFormJsonPlugin`, you need to create the
`qdb_PublishForm` and `qdb_GetPublishedFormJson` custom messages first. Do this via
the CRM SDK's `CreateMessageRequest` or by importing a solution that defines the
Process Actions:

```csharp
// Example: registering custom message via SDK (run once during solution deployment)
var request = new OrganizationRequest("CreateSdkMessage");
request["Name"] = "qdb_PublishForm";
service.Execute(request);
```

Alternatively, create Process Actions in CRM (Settings > Processes > New > Action),
give them the exact names `qdb_PublishForm` and `qdb_GetPublishedFormJson`, and add
the correct input/output parameters. The plugin step binds to the process action message.

### 5c. Register PublishFormActivity as Workflow Activity

In Plugin Registration Tool:
1. Select the registered `Qdb.FormEngine.Workflows.merged.dll` assembly
2. Register New Step is not used for workflow activities — the activity is discovered automatically
3. Invoke from a CRM Process Action: create a Process (Action type), add a step of type
   "Perform Action", select the custom workflow activity `PublishFormActivity`
4. Map the three input arguments: `FormCode`, `TargetVersion`, `PublishJobId`

---

## 6. Single Codebase Cloud + On-Premise Strategy

The solution is designed to compile once and deploy to both Dynamics CRM 9.1 on-premise
and Dataverse cloud without code changes. All CRM I/O uses `IOrganizationService` from the
`Microsoft.CrmSdk.CoreAssemblies` package, which is the same interface whether the plugin
runs in an on-prem sandbox or a Dataverse cloud step.

### JSON storage — Memo column (Base64 + gzip)

`qdb_form_render_cache.qdb_runtime_json` is a **Memo (Multiline Text) column on both platforms**.
The compressed JSON is stored as `Base64(gzip(utf8-json))`:

- **Write** (`RenderCacheRepository.WriteCache`): `entity["qdb_runtime_json"] = Convert.ToBase64String(gzipBytes)`
- **Read** (`GetPublishedFormJsonPlugin`): `Convert.FromBase64String(base64)` → `GzipCompressor.Decompress` → `Encoding.UTF8.GetString`

**Why not a File column?** Dataverse File columns work reliably on cloud, but the
`InitializeFileBlocksUpload` / `UploadBlock` / `CommitFileBlocksUpload` SDK message sequence
is unreliable on CRM 9.1 on-premise (availability depends on exact server patch level).
The Memo column approach is universally supported across both platforms and requires no
special SDK messages.

**Practical size cap**: Dataverse Memo columns allow up to 1 048 576 characters. A form
definition of ~300 KB uncompressed JSON will compress to roughly 50–80 KB gzip, producing
a Base64 string of ~70–110 KB — well within the limit. Forms approaching 700 KB uncompressed
(Base64 overhead included) should be reviewed for schema bloat before publishing.

Custom API registration is a Dataverse cloud concept. On-premise CRM 9.1 uses Process Actions
(custom messages registered via the SDK or CRM Processes UI) to achieve the same result.
The `PublishFormPlugin` and `GetPublishedFormJsonPlugin` bind to the process action message
on-prem and to the Custom API message on cloud — the plugin code is identical in both cases.

`PublishFormActivity` exists only for on-prem Process Action invocation. On Dataverse cloud,
the async `PublishFormPlugin` handles the same workload. The `PublishOrchestrator` class
holds all shared logic between the two entry points, ensuring both paths produce identical output.

NuGet package restore and ILRepack merging must be performed before registering on either
platform. The merged single-DLL approach avoids NuGet dependency resolution in the plugin
sandbox, which does not support loading additional assemblies from the file system.

---

## 7. TranslationChangePlugin Pre-Image Registration

The `TranslationChangePlugin` requires a registered pre-image named exactly `"PreImage"`.
Without the pre-image, the plugin cannot determine which form was affected by the
translation change and will trace a warning and exit gracefully.

Register the pre-image in Plugin Registration Tool:
- Step: `TranslationChangePlugin` on `qdb_translation` Update
- Image Type: Pre-Image
- Name: `PreImage`
- Alias: `PreImage`
- Attributes: `qdb_entity_name`, `qdb_record_id`, `qdb_language_code`

Omitting any of these three attributes from the pre-image will cause the plugin to skip
the re-publish job creation silently. Ensure all three are checked when registering.

---

## 8. Running Tests

Tests use xUnit 2.7 and Moq 4.20. Run from Visual Studio Test Explorer or via:

```bat
dotnet test Qdb.FormEngine.Tests\Qdb.FormEngine.Tests.csproj
```

Note: FakeXrmEasy.9 is declared in packages.config for future integration test expansion
but the current test suite uses Moq for CRM service mocking to keep tests fast and isolated.
