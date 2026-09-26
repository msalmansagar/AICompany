# DCP reporting definitions

DCP's reports and dashboards are **QDB Report Engine definitions** — configuration records in the
Engine's own tables — versioned here and provisioned idempotently by
`crm/scripts/provision-reporting-definitions.mts`. DCP consumes them through `qdb_RunReport` as the
signed-in user (`apps/web/src/reporting/`). No Engine code changes; no schema changes.

- `definitions/DCP-RPT-nnn.json` — one report definition each. `code` is the identity (`qdb_reportcode`);
  the record's GUID is stable across runs and resolved by DCP at run time. `version` is written to
  `qdb_currentversionnumber` and appended to the description; bump it whenever the file changes.
- Catalogue (grain, audience, measures, drill-down, security) lives in
  `packages/domain/src/reporting/reportingCatalogue.ts`; the two must name the same codes.
- Scope parameters are the `ReportingScope` dimensions as the Engine's runtime-prompt filters —
  `SourceSystem`, `Bucket`, `Strategy`, `CaseStatus`, `Owner`, `ActivityType`,
  `ActivityState`, `DateFrom`, `DateTo` — sent as **codes** (organisation code, option value, id). An
  absent parameter drops its filter, which is what makes every dimension optional.
- `mode: generated` lets the Engine build the FetchXML from the declared columns (a column with an
  aggregate makes the query an aggregate; the others become group-by). `mode: fetchxml` runs the
  authored query as written — needed for `countcolumn distinct` and `dategrouping` — with the
  declared column aliases matching the fetch aliases.
- Security: `security[]` rows become `qdb_reportsecurity` (`canexecute` by principal **name**). None
  means unrestricted by the Engine; CRM security still scopes every row. Production grants are a QDB
  decision, never made by this script.

Deploy order dependency: the Engine's multi-dataset and filter-binding columns (`qdb_compositionmode`,
`qdb_isenabled`, `qdb_rowlimit`, filter → datasource) must exist on the target org before the plugin
runs; `org5869857f` carries them. Cloud proven; On-Prem: the Engine ships Custom APIs, which 9.1
cannot import — a Process Action wrapper exists in the Engine repository but has not been run on-prem.

Engine behaviour learned live (2026-09-26): a runtime-prompt filter with the **IsNull** operator is
applied whether or not its parameter is supplied, so "no strategy" cannot be an optional Engine filter.
"Strategy Not Assigned" is a null group in *cases by strategy* and a DCP drill-down narrowing only.
