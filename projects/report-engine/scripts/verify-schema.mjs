// Verifies the QdbReportEngine 18-table schema in the org against phase-3-schema.md.
// Read-only. Reports missing tables, missing fields, and type mismatches.
// Usage: node verify-schema.mjs <path-to-.env>   (see scripts/lib/dataverse.mjs for DV_AUTH_MODE)
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const S = 'String', M = 'Memo', P = 'Picklist', B = 'Boolean', I = 'Integer', D = 'DateTime', L = 'Lookup';

// Expected custom (qdb_) fields per table, from phase-3-schema.md. Platform columns omitted.
const EXPECTED = {
  qdb_reportdefinition: { qdb_name:S, qdb_description:M, qdb_category:P, qdb_module:S, qdb_reportownerid:L, qdb_approverid:L, qdb_status:P, qdb_isgoverned:B, qdb_mainentitylogicalname:S, qdb_currentversionid:L, qdb_defaultlayoutid:L, qdb_rowlimit:I, qdb_timeoutseconds:I, qdb_executionmode:P },
  qdb_reportversion: { qdb_name:S, qdb_reportid:L, qdb_versionnumber:I, qdb_snapshotjson:M, qdb_publishedbyid:L, qdb_publishedon:D, qdb_iscurrent:B, qdb_changenote:M },
  qdb_reportdatasource: { qdb_name:S, qdb_reportid:L, qdb_sourcetype:P, qdb_connectorid:L, qdb_querytext:M, qdb_targetentitylogicalname:S, qdb_sequence:I, qdb_isprimary:B, qdb_joinkeyleft:S, qdb_joinkeyright:S, qdb_staticdatasetjson:M },
  qdb_reportentitymapping: { qdb_name:S, qdb_reportid:L, qdb_entitylogicalname:S, qdb_role:P, qdb_parentmappingid:L, qdb_relationshipschemaname:S },
  qdb_reportcolumn: { qdb_name:S, qdb_reportid:L, qdb_entitymappingid:L, qdb_sourceattribute:S, qdb_datatype:P, qdb_format:S, qdb_width:I, qdb_alignment:P, qdb_aggregation:P, qdb_sequence:I, qdb_ismasked:B, qdb_isvisible:B },
  qdb_reportfilter: { qdb_name:S, qdb_reportid:L, qdb_entitymappingid:L, qdb_attribute:S, qdb_operator:P, qdb_value:M, qdb_parameterid:L, qdb_contexttoken:P, qdb_logicalgroup:I, qdb_andor:P, qdb_sequence:I },
  qdb_reportparameter: { qdb_name:S, qdb_reportid:L, qdb_prompt:S, qdb_parametertype:P, qdb_isrequired:B, qdb_defaultvalue:M, qdb_contexttoken:P, qdb_lookuptargetentity:S, qdb_optionsetname:S, qdb_sequence:I },
  qdb_reportrelationship: { qdb_name:S, qdb_reportid:L, qdb_parententitylogicalname:S, qdb_childentitylogicalname:S, qdb_relationshiptype:P, qdb_relationshipschemaname:S, qdb_parentkey:S, qdb_childkey:S, qdb_connectorid:L, qdb_drilllevel:I, qdb_subreportid:L, qdb_opensrecord:B },
  qdb_reporttransformation: { qdb_name:S, qdb_reportid:L, qdb_transformationtype:P, qdb_targetcolumn:S, qdb_configjson:M, qdb_sequence:I },
  qdb_reportformula: { qdb_name:S, qdb_reportid:L, qdb_expression:M, qdb_resulttype:P, qdb_targetcolumn:S, qdb_sequence:I },
  qdb_reportlayout: { qdb_name:S, qdb_reportid:L, qdb_layouttype:P, qdb_showheader:B, qdb_showfooter:B, qdb_showlogo:B, qdb_showpagenumber:B, qdb_showgenerateddate:B, qdb_showgeneratedby:B, qdb_watermarktext:S, qdb_pageorientation:P, qdb_pagesize:P, qdb_layoutconfigjson:M },
  qdb_reportexportsetting: { qdb_name:S, qdb_reportid:L, qdb_format:P, qdb_isenabled:B, qdb_filenametemplate:S, qdb_optionsjson:M },
  qdb_reportribbonplacement: { qdb_name:S, qdb_reportid:L, qdb_location:P, qdb_targetentitylogicalname:S, qdb_targetformid:S, qdb_scoperolename:S, qdb_scopebuid:L, qdb_passrecordid:B, qdb_passselectedrows:B, qdb_passuserbu:B },
  qdb_reportsecurity: { qdb_name:S, qdb_reportid:L, qdb_principaltype:P, qdb_principalref:S, qdb_canview:B, qdb_canrun:B, qdb_canexport:B, qdb_canedit:B, qdb_canapprove:B, qdb_sequence:I },
  qdb_reportexecutionlog: { qdb_name:S, qdb_reportid:L, qdb_versionid:L, qdb_runbyid:L, qdb_runon:D, qdb_parametersjson:M, qdb_sources:S, qdb_rowcount:I, qdb_durationms:I, qdb_outcome:P, qdb_exportformat:P, qdb_error:M },
  qdb_reportauditlog: { qdb_name:S, qdb_reportid:L, qdb_entityaffected:S, qdb_recordref:S, qdb_action:P, qdb_oldvaluejson:M, qdb_newvaluejson:M, qdb_changedbyid:L, qdb_changedon:D, qdb_correlationid:S },
  qdb_externalconnector: { qdb_name:S, qdb_connectortype:P, qdb_baseurl:S, qdb_authtype:P, qdb_secretreference:S, qdb_timeoutseconds:I, qdb_isactive:B, qdb_residencyregion:S },
  qdb_reportcache: { qdb_name:S, qdb_reportid:L, qdb_versionid:L, qdb_payload:M, qdb_blobreference:S, qdb_createdon2:D, qdb_expireson:D, qdb_sizebytes:I, qdb_hitcount:I, qdb_identityhash:S }
};

async function fetchTable(logical) {
  const q = `${baseUrl}/${API_PATH}/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName&$expand=Attributes($select=LogicalName,AttributeType)`;
  const res = await dv.request(q, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${logical} ${res.status}: ${await res.text()}`);
  return await res.json();
}

console.log(`Connected: ${baseUrl}\n`);

let missingTables = 0, missingFields = 0, typeMismatch = 0, okTables = 0;
const report = [];
for (const [table, fields] of Object.entries(EXPECTED)) {
  const meta = await fetchTable(table);
  if (!meta) { missingTables++; report.push({ table, status: 'MISSING TABLE' }); continue; }
  okTables++;
  const actual = new Map((meta.Attributes || []).map(a => [a.LogicalName, a.AttributeType]));
  const miss = [], mism = [];
  for (const [f, t] of Object.entries(fields)) {
    if (!actual.has(f)) { miss.push(f); missingFields++; }
    else if (actual.get(f) !== t) { mism.push(`${f}: expected ${t}, got ${actual.get(f)}`); typeMismatch++; }
  }
  report.push({ table, status: miss.length || mism.length ? 'PARTIAL' : 'OK', missing: miss, mismatch: mism });
}

console.log('=== TABLE VERIFICATION ===');
for (const r of report) {
  console.log(`\n${r.status === 'OK' ? '✅' : r.status === 'MISSING TABLE' ? '❌' : '⚠️ '} ${r.table} — ${r.status}`);
  if (r.missing?.length) console.log(`   missing fields (${r.missing.length}): ${r.missing.join(', ')}`);
  if (r.mismatch?.length) console.log(`   type mismatch: ${r.mismatch.join(' | ')}`);
}
console.log(`\n=== SUMMARY ===\nTables present: ${okTables}/18 · missing tables: ${missingTables} · missing fields: ${missingFields} · type mismatches: ${typeMismatch}`);
