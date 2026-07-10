# BusinessRuleEngine — Dataverse Schema Manifest

**Engagement:** EDP-BRE-001 — Enterprise Decision Platform / Business Rules Engine
**Solution:** `BusinessRuleEngine` (unmanaged, v1.0.0.0)
**Org:** `https://org5869857f.crm4.dynamics.com`
**Publisher:** `qdb` (prefix `qdb`), logical namespace `qdb_edp_`
**Deployed:** 2026-07-04 (direct Dataverse Web API, service-principal auth)

## Naming convention
All EDP objects use the **`qdb_edp_`** logical namespace. The publisher prefix is `qdb` (shared with the existing QDB CRM); the `edp_` segment isolates this product from the ~700 pre-existing `qdb_` objects (DFE and QDB line-of-business schema) in this shared org. Do not create bare `qdb_<name>` EDP objects.

## Entities (22)
| Logical name | Purpose | Notable columns |
|---|---|---|
| `qdb_edp_rule` | Rule (top-level asset) | name, rulekey, description, **authoringstyle** (optset) |
| `qdb_edp_ruleversion` | Immutable rule version | versionnumber, **pcrmjson** (memo), **jdmsourcejson** (memo), **lifecyclestate** (optset), ispinned, **pinjustificationcode** (optset), pinjustificationnote |
| `qdb_edp_ruleapproval` | Approval record | **approvalstatus** (optset), comments, actor, decidedon; lookup → ruleversion |
| `qdb_edp_ruleaudit` | Append-only audit | action, actor, auditedon, details; lookup → ruleversion |
| `qdb_edp_ruleexecutionlog` | Per-evaluation log | resolvedversion, wouldresolveversion, pinned, **pinjustificationcode** (optset), actor, executedon, outcome, durationms; lookup → ruleversion |
| `qdb_edp_ruletest` | Test definition | testcasesjson (memo), lastresult; lookup → rule |
| `qdb_edp_rulesimulationrun` | Simulation run | inputjson, outputjson, ranon; lookup → ruleversion |
| `qdb_edp_ruleanalytics` | Analytics rollup | metricsjson, periodstart/end; lookup → rule |
| `qdb_edp_rulefunction` | Function catalog | signature, semantics, isbuiltin |
| `qdb_edp_rulecategory` | Category | description |
| `qdb_edp_rulefolder` | Folder | path |
| `qdb_edp_rulepackage` | Package | contentjson, packageversion; (rule → package lookup) |
| `qdb_edp_ruletemplate` | Template | templatejson, parametersjson, industry |
| `qdb_edp_ruletag` | Tag | color |
| `qdb_edp_ruledocumentation` | Documentation | content (memo); lookup → rule |
| `qdb_edp_ruledependency` | Dependency edge | fromref, toref, **dependencytype** (optset) |
| `qdb_edp_ruleconfiguration` | Config KV | value, valuejson, **environmenttier** (optset) |
| `qdb_edp_featureflag` | Feature flag | isenabled, description |
| `qdb_edp_metadataentitydef` | Cached CRM entity metadata | displayname, metadatajson, versiontoken |
| `qdb_edp_metadataattributedef` | Cached CRM attribute metadata | displayname, attributetype, metadatajson; lookup → metadataentitydef |
| `qdb_edp_metadataoptionsetdef` | Cached CRM option-set metadata | optionsjson |
| `qdb_edp_ruleimportrecord` | Import audit | sourceformat, importstatus, log, importedon |

JSON-in-entity components from the Phase 3 data-model (Decision Table + rows/columns, Expression, Formula, Variable, Binding, Test Case, Trace Detail, Complexity Profile, Function Parameter, Package/Template content) are stored as **memo (JSON) columns** on their parent entities — not as separate tables, per phase-3-arch.md §5.

## Global option sets (6)
`qdb_edp_lifecyclestate`, `qdb_edp_pinjustificationcode`, `qdb_edp_approvalstatus`, `qdb_edp_dependencytype`, `qdb_edp_environmenttier`, `qdb_edp_authoringstyle`.

## Custom lookups / relationships (12)
rule→ruleversion, ruleversion→ruleapproval, ruleversion→ruleexecutionlog, ruleversion→ruleaudit, ruleversion→rulesimulationrun, rule→ruletest, rule→ruleanalytics, rule→ruledocumentation, rulecategory→rule, rulefolder→rule, rulepackage→rule, metadataentitydef→metadataattributedef.
(Plus 154 Dataverse system relationships auto-created, 7 per entity.)

## Environment variables (2)
- `qdb_edp_EnvironmentSettings` — type JSON (100000003), default `{}`.
- `qdb_edp_IsProductionEnvironment` — type Boolean (100000002), default `no`. This is the ADR-12 production designation (deployment-controlled).

## Verification (2026-07-04)
22 entities, 12 custom lookups, 6 option sets, 2 env vars — all confirmed present in the org and in the `BusinessRuleEngine` solution. Publish succeeded (204).

## Remaining refinements (NOT yet applied — tracked for follow-up)
1. **ADR-12 column auditing** — enable column-level auditing on `qdb_edp_ruleversion` pin fields (ispinned, pinjustificationcode, pinjustificationnote) and on `qdb_edp_IsProductionEnvironment`.
2. **Append-only enforcement** — security roles + plugin to prevent update/delete on `qdb_edp_ruleaudit` and `qdb_edp_ruleexecutionlog` (Phase 4 / audited in Phase 6 per C-005).
3. **Security roles** — EDP Rule Author / Approver / Administrator / Auditor / Executor (designer spec §21.2) not yet created.
4. **`Manage Production Pin` privilege** (ADR-12) — not yet created.
5. Attribute sets are a pragmatic core per entity; enrich as Phase 4 build reveals needs (all new attributes must be optional + defaulted per ALM invariant C9).

## Deploy scripts
Deployment scripts live in the session scratchpad (`bre-deploy.js`, `bre-envvars.js`, `bre-verify.js`). Idempotent — safe to re-run; existing objects are skipped. To reproduce, they require the service-principal creds in `dynamic-form-engine/backend/.env` and network access to the org.
