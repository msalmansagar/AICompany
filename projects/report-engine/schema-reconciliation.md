# Report Engine — Schema Reconciliation (Draft Spec → As-Built)

| | |
|---|---|
| **Engagement** | RPT-ENG-001 (report-engine) |
| **Purpose** | Reconcile the `phase-3-schema.md` draft against the schema actually deployed to `org5869857f`, and record it as the canonical source of truth. |
| **Org** | `https://org5869857f.crm4.dynamics.com` (OrganizationId `8e28c4d8-8f8f-4c42-aa0a-31a680cc02df`) |
| **Solution** | **`qdb_reportengine`** ("QDB Report Engine", unmanaged, prefix `qdb_`) — *not* `QdbReportEngine` as the draft stated |
| **Verified** | 18/18 tables present · 0 rows · direct `MetadataId` lookups confirmed |
| **Machine-readable** | `schema-manifest.json` (as-built field/type/lookup dump) |
| **Decision** | **Keep the deployed schema; align docs + code to it.** No teardown. |

## Why the deployed schema is canonical

The draft `phase-3-schema.md` was a design proposal. The deployed schema is the refined
implementation and is, in several places, **more correct**:

- **Deeper normalization.** The draft hung `qdb_reportcolumn` directly off the report.
  As-built layers it properly: `reportdefinition → reportdatasource → reportentitymapping → reportcolumn`.
- **Idiomatic lookup naming.** Parent lookups are `qdb_reportdefinitionid` (named after the
  target table, the Dataverse convention), not the draft's `qdb_reportid`.
- **JSON consolidation over column sprawl.** Layout flags (`showheader`, `pageorientation`, …)
  live in `qdb_layoutjson` / `qdb_pagesettingsjson`; column width/alignment in layout JSON;
  masking centralized in `qdb_reportsecurity.qdb_maskingpolicyjson`.
- **Richer lifecycle fields.** `qdb_reportcode`, `qdb_effectivefrom/to`, `qdb_publishstate`,
  `qdb_checksum`, `qdb_contractversion`, `qdb_requestcontractjson`, `qdb_retrypolicyjson`, etc.

Picklists are backed by real option sets (each has its `*name` virtual mirror). All 13 child
tables link to the hub via `qdb_reportdefinitionid`; `reportentitymapping → reportdatasource`,
`reportcolumn → reportentitymapping`, and `reportdatasource → externalconnector`.

## Naming rules (draft → as-built)

| Draft convention | As-built convention |
|---|---|
| parent lookup `qdb_reportid` | `qdb_reportdefinitionid` (Lookup → `qdb_reportdefinition`) |
| `qdb_reportownerid`, `qdb_changedbyid`, `qdb_runbyid`, `qdb_publishedbyid` | standard platform `ownerid` / `createdby` / `modifiedby` |
| `*seconds` timeouts | `qdb_timeoutms` on definition; `qdb_timeoutseconds` on datasource/connector |
| many boolean layout flags | consolidated into `*json` Memo columns |

## Per-table field map

Legend: **✓** direct equivalent · **≈** covered by a differently-named/modeled field ·
**std** covered by a standard platform column · **JSON** folded into a `*json` blob ·
**GAP** genuinely absent (see gap list).

### qdb_reportdefinition
| Draft field | As-built |
|---|---|
| qdb_name / qdb_description / qdb_category / qdb_status / qdb_mainentitylogicalname / qdb_executionmode | ✓ same |
| qdb_module (String) | qdb_module (**Picklist** — improved) |
| qdb_reportownerid | std `ownerid` |
| qdb_approverid | ≈ `qdb_reportsecurity.qdb_canapprove` + `qdb_reportversion.qdb_approvedon` |
| qdb_currentversionid (Lookup) | ≈ qdb_currentversionnumber (Integer) |
| qdb_timeoutseconds | qdb_timeoutms |
| qdb_isgoverned | **GAP** (optional) |
| qdb_defaultlayoutid | **GAP** (optional; layouts are 1:N) |
| qdb_rowlimit | **GAP** (optional; result-cap safety) |
| — | +as-built: qdb_reportcode, qdb_ispublished, qdb_effectivefrom/to, qdb_requestcontractjson, qdb_responsecontractjson, qdb_retrypolicyjson, qdb_runtimeprovider |

### qdb_reportversion
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_versionnumber | ✓ |
| qdb_snapshotjson | qdb_definitionjson **+** qdb_layoutjson (split — improved) |
| qdb_publishedon | qdb_approvedon |
| qdb_publishedbyid | std `modifiedby` |
| qdb_changenote | ≈ qdb_versionlabel |
| qdb_iscurrent | **GAP** (optional; derivable from qdb_publishstate + max version) |
| — | +as-built: qdb_checksum, qdb_contractversion, qdb_publishstate |

### qdb_reportdatasource
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_sourcetype / qdb_isprimary | ✓ |
| qdb_connectorid | qdb_externalconnectorid |
| qdb_querytext / qdb_staticdatasetjson | qdb_querypayload |
| qdb_sequence | qdb_executionorder |
| qdb_targetentitylogicalname | ≈ `qdb_reportentitymapping.qdb_entitylogicalname` |
| qdb_joinkeyleft / qdb_joinkeyright | ≈ qdb_mergekey + `reportentitymapping.qdb_joinexpressionjson` |
| — | +as-built: qdb_sourcealias, qdb_timeoutseconds |

### qdb_reportentitymapping
| Draft | As-built |
|---|---|
| qdb_reportid | via qdb_reportdatasourceid → datasource → definition |
| qdb_entitylogicalname | ✓ |
| qdb_role | ≈ qdb_relationshiptype / qdb_jointype |
| qdb_parentmappingid | ≈ qdb_depth + qdb_joinexpressionjson |
| qdb_relationshipschemaname | JSON `qdb_joinexpressionjson` |
| — | +as-built: qdb_entityalias, qdb_depth |

### qdb_reportcolumn
| Draft | As-built |
|---|---|
| qdb_reportid | via qdb_reportentitymappingid → mapping chain |
| qdb_entitymappingid | qdb_reportentitymappingid |
| qdb_sourceattribute | qdb_columnlogicalname |
| qdb_datatype / qdb_isvisible | ✓ |
| qdb_format | qdb_formatstring |
| qdb_aggregation | qdb_aggregatefunction |
| qdb_sequence | qdb_sortorder (+ qdb_grouporder) |
| qdb_width / qdb_alignment | JSON (layout) |
| qdb_ismasked | ≈ `qdb_reportsecurity.qdb_maskingpolicyjson` (centralized) |
| — | +as-built: qdb_outputalias |

### qdb_reportfilter
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_operator / qdb_value / qdb_sequence | ✓ |
| qdb_attribute / qdb_entitymappingid | ≈ qdb_fieldalias |
| qdb_parameterid / qdb_contexttoken | ≈ qdb_valuetype (Static/Parameter/Context) |
| qdb_logicalgroup | qdb_groupid |
| qdb_andor | qdb_groupoperator |
| — | +as-built: qdb_isruntimeprompt |

### qdb_reportparameter
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_isrequired / qdb_defaultvalue / qdb_lookuptargetentity | ✓ |
| qdb_prompt | qdb_label |
| qdb_parametertype | qdb_paramtype |
| qdb_contexttoken | qdb_defaultsource |
| qdb_sequence | qdb_displayorder |
| qdb_optionsetname | ≈ qdb_validationregex / lookuptargetentity |
| — | +as-built: qdb_parametername |

### qdb_reportrelationship
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_relationshiptype / qdb_parentkey / qdb_childkey | ✓ |
| qdb_parententitylogicalname / qdb_childentitylogicalname | qdb_parentalias / qdb_childalias |
| qdb_drilllevel | qdb_depth |
| qdb_opensrecord (Boolean) | qdb_opentype (**Picklist** — improved) |
| qdb_relationshipschemaname / qdb_connectorid / qdb_subreportid | JSON `qdb_externaljoinjson` |

### qdb_reporttransformation
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_configjson | ✓ |
| qdb_transformationtype | qdb_transformtype |
| qdb_sequence | qdb_steporder |
| qdb_targetcolumn | JSON (configjson) |
| — | +as-built: qdb_enabled |

### qdb_reportformula
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_expression | ✓ |
| qdb_resulttype | qdb_resultdatatype |
| qdb_targetcolumn | qdb_formulaalias |
| qdb_sequence | qdb_evaluationorder |
| — | +as-built: qdb_isconditional |

### qdb_reportlayout
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_layouttype | ✓ |
| qdb_showheader/footer/logo/pagenumber/generateddate/generatedby | JSON `qdb_headerjson`/`qdb_footerjson`/`qdb_pagesettingsjson` |
| qdb_pageorientation / qdb_pagesize | JSON `qdb_pagesettingsjson` |
| qdb_layoutconfigjson | qdb_layoutjson |
| qdb_watermarktext | ≈ `qdb_reportexportsetting.qdb_watermarktext` |
| — | +as-built: qdb_themecolor |

### qdb_reportexportsetting
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_format | ✓ |
| qdb_isenabled | qdb_enabled |
| qdb_optionsjson | qdb_exportconfigjson |
| qdb_filenametemplate | JSON (exportconfigjson) |
| — | +as-built: qdb_requiresapproval, qdb_watermarktext |

### qdb_reportribbonplacement
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_location | qdb_placementtype |
| qdb_targetentitylogicalname | qdb_entitylogicalname |
| qdb_targetformid | qdb_formidtext |
| qdb_scoperolename | qdb_securityroleidtext |
| qdb_scopebuid | qdb_businessunitidtext |
| qdb_passrecordid / qdb_passselectedrows / qdb_passuserbu | ≈ qdb_commandid config |
| — | +as-built: qdb_isenabled |

### qdb_reportsecurity
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_principaltype / qdb_canexport / qdb_canedit / qdb_canapprove | ✓ |
| qdb_principalref | qdb_principalidtext |
| qdb_canrun | qdb_canexecute |
| qdb_canview | ≈ qdb_canexecute |
| qdb_sequence | (n/a) |
| — | +as-built: qdb_maskingpolicyjson |

### qdb_reportexecutionlog
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_rowcount / qdb_durationms | ✓ |
| qdb_versionid | ≈ qdb_versionnumber |
| qdb_runbyid | std `createdby` |
| qdb_runon | qdb_startedon |
| qdb_parametersjson | qdb_requestpayload |
| qdb_outcome | qdb_status |
| qdb_error | qdb_errordetail (+ qdb_errorcode) |
| qdb_sources / qdb_exportformat | ≈ qdb_resultsummary / requestpayload |
| — | +as-built: qdb_cachehit, qdb_completedon, qdb_correlationid, qdb_executionstage, qdb_requestid |

### qdb_reportauditlog
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_changedon | ✓ |
| qdb_action | qdb_actiontype |
| qdb_oldvaluejson / qdb_newvaluejson | qdb_beforejson / qdb_afterjson |
| qdb_changedbyid | std `modifiedby` |
| qdb_entityaffected / qdb_recordref / qdb_correlationid | (audit is on the report itself; correlation lives on execution log) |
| — | +as-built: qdb_comment |

### qdb_externalconnector
| Draft | As-built |
|---|---|
| qdb_name / qdb_connectortype / qdb_timeoutseconds / qdb_isactive | ✓ |
| qdb_baseurl | qdb_endpointurl |
| qdb_authtype | qdb_authmode |
| qdb_secretreference | qdb_credentialreference |
| **qdb_residencyregion** | **GAP — data-residency region (recommend adding; PDPPL hard gate)** |
| — | +as-built: qdb_headersjson, qdb_retrycount |

### qdb_reportcache
| Draft | As-built |
|---|---|
| qdb_reportid | qdb_reportdefinitionid |
| qdb_hitcount | ✓ |
| qdb_payload | qdb_datasetjson |
| qdb_createdon2 / qdb_expireson | qdb_createdonutc / qdb_expiresonutc |
| qdb_identityhash | qdb_rolehash (+ qdb_cachehash, qdb_cachekey) |
| qdb_versionid / qdb_blobreference / qdb_sizebytes | (n/a — cache keyed by hash, inline dataset) |

## Genuine gaps — CLOSED (2026-07-21)

All 4 approved and created additively in solution `qdb_reportengine`, verified via direct
metadata read. Added to `schema-manifest.json`.

| # | Table | Field | Type | Status | Rationale |
|---|---|---|---|---|---|
| 1 | qdb_externalconnector | qdb_residencyregion | String(100) | ✅ ADDED | Data-residency region per connector; supports the PDPPL / QDB residency hard gate (AUTH-C-2). |
| 2 | qdb_reportdefinition | qdb_rowlimit | Integer | ✅ ADDED | Per-report result-row safety cap enforced at execution time. |
| 3 | qdb_reportdefinition | qdb_isgoverned | Boolean | ✅ ADDED | Explicit governance toggle (vs. inferring from security rows). |
| 4 | qdb_reportversion | qdb_iscurrent | Boolean | ✅ ADDED | Marks the active/current published version. |

All other draft fields are covered by a renamed/remodeled field, a standard platform column,
or a `*json` blob — **no other creation required.** The 18-table schema is now fully reconciled.
