# Render Cache Schema — Design Reference & On-Prem Packaging Note

## Entities Provisioned (org5869857f.crm4.dynamics.com)

Both entities are in solution `QdbDynamicFormEngine`, publisher prefix `qdb_`,
ownership type `OrganizationOwned`, no notes, no activities.

---

### qdb_publish_job

Tracks the lifecycle of a publish or regeneration job.
EntitySet: `qdb_publish_jobs`

| Logical Name              | Type      | Notes                                                     |
|---------------------------|-----------|-----------------------------------------------------------|
| qdb_publish_jobid         | GUID      | Primary key (auto)                                        |
| qdb_name                  | String    | Primary name, required                                    |
| qdb_form_code             | String    | Max 100                                                   |
| qdb_target_version        | Integer   |                                                           |
| qdb_trigger_reason        | Picklist  | Local: Publish=1, TranslationChange=2, ThemeChange=3, ComponentChange=4, ManualRegenerate=5 |
| qdb_status                | Picklist  | Local: Queued=1, Running=2, Completed=3, PartiallyCompleted=4, Failed=5 |
| qdb_languages_requested   | Memo      | Max 4000                                                  |
| qdb_languages_succeeded   | Memo      | Max 4000                                                  |
| qdb_languages_failed      | Memo      | Max 4000                                                  |
| qdb_requested_on          | DateTime  | UserLocal                                                 |
| qdb_started_on            | DateTime  | UserLocal                                                 |
| qdb_completed_on          | DateTime  | UserLocal                                                 |
| qdb_error_details         | Memo      | Max 100000                                                |
| qdb_form_definition_id    | Lookup    | → qdb_form_definition (rel: qdb_form_definition_qdb_publish_job) |

---

### qdb_form_render_cache

Holds one pre-rendered gzipped JSON blob per form+version+language combination.
EntitySet: `qdb_form_render_caches`

| Logical Name              | Type      | Notes                                                     |
|---------------------------|-----------|-----------------------------------------------------------|
| qdb_form_render_cacheid   | GUID      | Primary key (auto)                                        |
| qdb_name                  | String    | Primary name, required                                    |
| qdb_form_code             | String    | Max 100; part of alternate key                            |
| qdb_published_version     | Integer   | Part of alternate key                                     |
| qdb_language_code         | String    | Max 10; part of alternate key                             |
| qdb_lcid                  | Integer   |                                                           |
| qdb_runtime_json          | Memo      | MaxLength 1048576; holds Base64(gzip(render JSON))        |
| qdb_json_hash             | String    | Max 64; SHA-256 of rendered content                       |
| qdb_json_size_bytes       | Integer   | Uncompressed byte count                                   |
| qdb_is_compressed         | Boolean   | Default true                                              |
| qdb_is_active             | Boolean   | Default false                                             |
| qdb_status                | Picklist  | Local: Generating=1, Active=2, Superseded=3, Failed=4    |
| qdb_published_on          | DateTime  | UserLocal                                                 |
| qdb_generation_duration_ms | Integer  | Milliseconds to generate                                  |
| qdb_last_generated_on     | DateTime  | UserLocal                                                 |
| qdb_generator_version     | String    | Max 20                                                    |
| qdb_form_definition_id    | Lookup    | → qdb_form_definition (rel: qdb_form_definition_qdb_form_render_cache) |
| qdb_publish_job_id        | Lookup    | → qdb_publish_job (rel: qdb_publish_job_qdb_form_render_cache) |
| qdb_published_by          | Lookup    | → systemuser (rel: qdb_systemuser_form_render_cache_published_by) |

**Alternate key** `qdb_render_cache_key`: (qdb_form_code, qdb_published_version, qdb_language_code)
Status on provisioning: Active

---

## On-Prem Packaging Note

When packaging these two entities into a Dynamics CRM **on-premise managed solution**,
follow the mandatory RootComponents rule:

**Every component must be listed individually in `solution.xml`.
Folder wildcards are not supported and will cause import failure.**

### solution.xml RootComponents — required entries

```xml
<!-- qdb_publish_job entity and its components -->
<RootComponent type="1" id="{<qdb_publish_job ObjectTypeCode GUID>}" behavior="0" />

<!-- All custom attributes on qdb_publish_job — one entry per attribute -->
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_form_code>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_target_version>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_trigger_reason>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_status>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_languages_requested>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_languages_succeeded>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_languages_failed>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_requested_on>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_started_on>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_completed_on>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_publish_job.qdb_error_details>}" behavior="0" />
<!-- Lookup attribute created by relationship — include relationship component, not the attribute directly -->
<RootComponent type="10" id="{<MetadataId of qdb_form_definition_qdb_publish_job>}" behavior="0" />

<!-- qdb_form_render_cache entity and its components -->
<RootComponent type="1" id="{<qdb_form_render_cache ObjectTypeCode GUID>}" behavior="0" />

<!-- All custom attributes on qdb_form_render_cache -->
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_form_code>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_published_version>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_language_code>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_lcid>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_runtime_json>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_json_hash>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_json_size_bytes>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_is_compressed>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_is_active>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_status>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_published_on>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_generation_duration_ms>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_last_generated_on>}" behavior="0" />
<RootComponent type="2" id="{<MetadataId of qdb_form_render_cache.qdb_generator_version>}" behavior="0" />

<!-- Relationships — type 10 = OneToManyRelationship -->
<RootComponent type="10" id="{<MetadataId of qdb_form_definition_qdb_form_render_cache>}" behavior="0" />
<RootComponent type="10" id="{<MetadataId of qdb_publish_job_qdb_form_render_cache>}" behavior="0" />
<RootComponent type="10" id="{<MetadataId of qdb_systemuser_form_render_cache_published_by>}" behavior="0" />
```

### Component type codes

| Type | Meaning                      |
|------|------------------------------|
| 1    | Entity (table)               |
| 2    | Attribute (column)           |
| 10   | Relationship (1:N)           |
| 14   | OptionSet (global only)      |

Local (non-global) OptionSets are exported as part of their owning attribute
and do NOT need a separate RootComponent entry.
Memo columns (including `qdb_runtime_json`) are standard type 2 attribute entries.

### How to obtain MetadataIds for on-prem

Export the unmanaged solution from the cloud test org via the maker portal,
extract the zip, and read `customizations.xml`. Every component carries its
`MetadataId` as an XML attribute. Copy those GUIDs into the on-prem
`solution.xml` RootComponents block. Do not guess GUIDs.

Alternatively use the Web API on any environment:
```
GET /api/data/v9.2/EntityDefinitions(LogicalName='qdb_publish_job')?$select=MetadataId
GET /api/data/v9.2/EntityDefinitions(LogicalName='qdb_form_render_cache')?$select=MetadataId
GET /api/data/v9.2/EntityDefinitions(LogicalName='qdb_publish_job')/Attributes?$select=LogicalName,MetadataId
GET /api/data/v9.2/EntityDefinitions(LogicalName='qdb_form_render_cache')/Attributes?$select=LogicalName,MetadataId
GET /api/data/v9.2/RelationshipDefinitions(SchemaName='qdb_form_definition_qdb_publish_job')?$select=MetadataId
```

### On-prem constraints

- `qdb_runtime_json` is a **Memo column on both cloud and on-prem** — there is no File column
  in this schema. The single portable design stores Base64(gzip(render JSON)) as a multiline
  text string (MaxLength 1,048,576). No divergence between environments; no service layer changes
  required when moving between cloud and on-prem 9.1.
- The alternate key `qdb_render_cache_key` uses SQL index creation under the hood —
  ensure the three key columns (qdb_form_code, qdb_published_version, qdb_language_code)
  are present before importing the alternate key component.
- Publisher prefix must match the on-prem publisher (`qdb_`). If the on-prem org
  uses a different publisher prefix, all schema names must be recreated — they cannot be renamed.
