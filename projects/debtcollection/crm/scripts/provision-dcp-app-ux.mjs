/**
 * provision-dcp-app-ux.mjs
 * Forms, views and icons for the 13 DCP tables in the Debt Collection model-driven app.
 *
 * The tables were provisioned with the auto-generated "Information" form (a name field and little
 * else) and the platform's two stock views. This gives each table what the app needs to be usable
 * (user instruction, 2026-09-28):
 *
 *   • the main form carries EVERY field, grouped: the key facts first, then dates, amounts, flags
 *     and notes, with an Administration tab for owner, status and the audit columns;
 *   • every public view shows a curated set of meaningful columns (not every column) — the same
 *     columns on the Active, Inactive, My and All views, each view keeping its own filter;
 *   • every table gets an SVG icon in the Form Engine's style (20×20, #0078d4 strokes), uploaded as
 *     a web resource and set as the table's vector icon — the same mechanism the Form Engine used.
 *
 * Out of scope, deliberately: the four tables the app shares with other QDB solutions (Case,
 * Litigation Request, User, Team). Their forms, views and icons are theirs.
 *
 * Nothing here changes schema: forms, views, web resources and the icon name are solution
 * components in `qdb_debtcollection`. Safety: refuses any organisation but the sandbox.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra node --env-file=<env> crm/scripts/provision-dcp-app-ux.mjs [--dry-run] [--only=qdb_x,qdb_y]
 */

import { randomUUID } from 'node:crypto';
import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = (process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean);

// ── What each table shows first, and in its views ────────────────────────────

/**
 * Per table: the key facts (first form section, in this order) and the view columns. Everything
 * else the table holds is still placed on the form by type; the views stay curated.
 */
const TABLES = {
  qdb_collectioncase: {
    key: ['qdb_casenumber', 'qdb_customerid', 'qdb_facilitynumber', 'qdb_facilitysourcesystem', 'qdb_organizationcode', 'qdb_customertype', 'qdb_producttype', 'qdb_productdescription', 'qdb_strategyid', 'qdb_assignedteamid', 'qdb_priority', 'qdb_risklevel', 'qdb_casestage'],
    view: ['qdb_casenumber', 'qdb_customerid', 'qdb_facilitynumber', 'qdb_organizationcode', 'qdb_currentarrearbucket', 'qdb_currentdpd', 'qdb_currenttotalarrears', 'qdb_currentloanbalance', 'statuscode', 'qdb_strategyid', 'ownerid', 'qdb_lastmissyncon'],
  },
  qdb_collectionactivity: {
    key: ['subject', 'qdb_activitytypeid', 'qdb_collectioncaseid', 'qdb_outcomeid', 'qdb_activitydate', 'qdb_followupdate', 'qdb_origin', 'qdb_strategyactionid', 'qdb_supervisorescalated', 'qdb_requiresapproval', 'qdb_approvalstatus'],
    view: ['subject', 'qdb_activitytypeid', 'qdb_collectioncaseid', 'qdb_activitydate', 'qdb_outcomeid', 'qdb_followupdate', 'qdb_ptpdate', 'qdb_promisedamount', 'qdb_ptpstatus', 'ownerid', 'statuscode'],
    sections: [{ label: 'Promise to pay', fields: ['qdb_ptpdate', 'qdb_promisedamount', 'qdb_promisetype', 'qdb_ptpstatus', 'qdb_amountreceived', 'qdb_paymentreceiveddate', 'qdb_brokendate', 'qdb_brokenreason', 'qdb_previousptpdate', 'qdb_reschedulecount', 'qdb_reminderdate'] }],
  },
  qdb_delinquencysnapshot: {
    key: ['qdb_name', 'qdb_collectioncaseid', 'qdb_snapshotdate', 'qdb_facilitynumber', 'qdb_facilitysourcesystem', 'qdb_producttypecode', 'qdb_dpd', 'qdb_arrearbucket', 'qdb_snapshotkey'],
    view: ['qdb_name', 'qdb_collectioncaseid', 'qdb_snapshotdate', 'qdb_facilitynumber', 'qdb_facilitysourcesystem', 'qdb_dpd', 'qdb_arrearbucket', 'qdb_totalarrears', 'qdb_loanbalance', 'qdb_eligibilityoutcome', 'qdb_receivedon'],
    sections: [{ label: 'Eligibility decision', fields: ['qdb_eligibilityoutcome', 'qdb_eligibilityreason', 'qdb_eligibilityrulesetcode', 'qdb_eligibilityrulesetversion', 'qdb_eligibilityevaluatedon'] }],
  },
  qdb_collectionactivitytype: {
    key: ['qdb_name', 'qdb_namearabic', 'qdb_code', 'qdb_category', 'qdb_sequence', 'qdb_applicablecustomertype', 'qdb_applicableproduct', 'qdb_defaultformcode', 'qdb_processcode', 'qdb_rulecode'],
    view: ['qdb_name', 'qdb_code', 'qdb_category', 'qdb_sequence', 'qdb_requiresfollowup', 'qdb_requiresapproval', 'qdb_slahours', 'qdb_isactive'],
  },
  qdb_activityoutcome: {
    key: ['qdb_name', 'qdb_namearabic', 'qdb_activitytypeid', 'qdb_code', 'qdb_category', 'qdb_sequence'],
    view: ['qdb_name', 'qdb_activitytypeid', 'qdb_code', 'qdb_category', 'qdb_requiresfollowup', 'qdb_followupdays', 'qdb_escalationrequired', 'qdb_closeactivity', 'qdb_isactive'],
  },
  qdb_collectionstrategy: {
    key: ['qdb_name', 'qdb_code', 'qdb_priority', 'qdb_description', 'qdb_customertype', 'qdb_producttype', 'qdb_risklevel', 'qdb_rulecode'],
    view: ['qdb_name', 'qdb_code', 'qdb_priority', 'qdb_dpdfrom', 'qdb_dpdto', 'qdb_arrearsfrom', 'qdb_arrearsto', 'qdb_customertype', 'qdb_producttype', 'qdb_risklevel', 'qdb_effectivefrom', 'qdb_effectiveto', 'qdb_isactive'],
    sections: [{ label: 'Criteria', fields: ['qdb_dpdfrom', 'qdb_dpdto', 'qdb_arrearsfrom', 'qdb_arrearsto', 'qdb_exposurefrom', 'qdb_exposureto', 'qdb_brokenptpcountfrom', 'qdb_legalstatus', 'qdb_restructurestatus', 'qdb_nplflag', 'qdb_noautomatedcontact'] }],
  },
  qdb_strategyaction: {
    key: ['qdb_name', 'qdb_strategyid', 'qdb_sequence', 'qdb_activitytypeid', 'qdb_triggerevent', 'qdb_dayoffset', 'qdb_communicationchannel', 'qdb_communicationtemplateid', 'qdb_assignmentconfigurationid', 'qdb_queuename', 'qdb_processcode', 'qdb_rulecode'],
    view: ['qdb_name', 'qdb_strategyid', 'qdb_sequence', 'qdb_activitytypeid', 'qdb_triggerevent', 'qdb_dayoffset', 'qdb_communicationchannel', 'qdb_ismandatory', 'qdb_requiresapproval', 'qdb_escalationhours', 'qdb_isactive'],
  },
  qdb_assignmentconfiguration: {
    key: ['qdb_name', 'qdb_priority', 'qdb_assignmentmethod', 'qdb_targetteamid', 'qdb_defaultuserid', 'qdb_smartassignmentref', 'qdb_region', 'qdb_slahours'],
    view: ['qdb_name', 'qdb_priority', 'qdb_assignmentmethod', 'qdb_targetteamid', 'qdb_defaultuserid', 'qdb_dpdfrom', 'qdb_dpdto', 'qdb_customertype', 'qdb_producttype', 'qdb_effectivefrom', 'qdb_effectiveto', 'qdb_isactive'],
    sections: [{ label: 'Criteria', fields: ['qdb_dpdfrom', 'qdb_dpdto', 'qdb_arrearsfrom', 'qdb_arrearsto', 'qdb_exposurefrom', 'qdb_exposureto', 'qdb_customertype', 'qdb_producttype', 'qdb_risklevel', 'qdb_legalstatus'] }],
  },
  qdb_communicationtemplate: {
    key: ['qdb_name', 'qdb_code', 'qdb_channel', 'qdb_language', 'qdb_customertype', 'qdb_producttype', 'qdb_activitytypeid', 'qdb_strategyid', 'qdb_version', 'qdb_approvalstatus', 'qdb_externaltemplateref'],
    view: ['qdb_name', 'qdb_code', 'qdb_channel', 'qdb_language', 'qdb_customertype', 'qdb_approvalstatus', 'qdb_version', 'qdb_effectivefrom', 'qdb_effectiveto', 'qdb_isactive'],
    sections: [{ label: 'Content', columns: 1, fields: ['qdb_subject', 'qdb_body', 'qdb_placeholders'] }],
  },
  qdb_communicationrun: {
    key: ['qdb_name', 'qdb_channel', 'qdb_status', 'qdb_templateid', 'qdb_selectionmode', 'qdb_totalrecipients', 'qdb_cursor', 'qdb_startedon', 'qdb_completedon'],
    view: ['qdb_name', 'qdb_channel', 'qdb_status', 'qdb_templateid', 'qdb_selectionmode', 'qdb_totalrecipients', 'qdb_cursor', 'qdb_startedon', 'qdb_completedon', 'createdby'],
    sections: [{ label: 'Message', columns: 1, fields: ['qdb_subject', 'qdb_messagebody'] }, { label: 'Population', columns: 1, fields: ['qdb_filterdefinition', 'qdb_frozenpopulation', 'qdb_failedrecipients'] }],
  },
  qdb_platformconfiguration: {
    key: ['qdb_name', 'qdb_environmentcode', 'qdb_platformtype', 'qdb_organizationcode', 'qdb_customertype', 'qdb_snapshotpolicy', 'qdb_misprovider', 'qdb_misintegrationenabled', 'qdb_documentprovider'],
    view: ['qdb_name', 'qdb_environmentcode', 'qdb_platformtype', 'qdb_organizationcode', 'qdb_customertype', 'qdb_misprovider', 'qdb_misintegrationenabled', 'qdb_eligibilityrulesetcode', 'qdb_strategyrulesetcode', 'qdb_isactive'],
    sections: [
      { label: 'Rulesets', fields: ['qdb_eligibilityrulesetcode', 'qdb_strategyrulesetcode', 'qdb_contactholdrulesetcode'] },
      { label: 'Entity bindings', fields: ['qdb_customerentity', 'qdb_customerbusinessidfield', 'qdb_customerdisplaynamefield', 'qdb_facilityentity', 'qdb_facilitybusinessidfield', 'qdb_collectioncaseentity', 'qdb_collectionactivityentity', 'qdb_smsentity', 'qdb_emailentity', 'qdb_whatsappentity'] },
    ],
  },
  qdb_platformmapping: {
    key: ['qdb_name', 'qdb_platformconfigurationid', 'qdb_businessobject', 'qdb_canonicalfield', 'qdb_crmentitylogicalname', 'qdb_crmfieldlogicalname', 'qdb_datatype', 'qdb_accessmode', 'qdb_source', 'qdb_isrequired'],
    view: ['qdb_name', 'qdb_platformconfigurationid', 'qdb_businessobject', 'qdb_canonicalfield', 'qdb_crmentitylogicalname', 'qdb_crmfieldlogicalname', 'qdb_datatype', 'qdb_accessmode', 'qdb_isrequired', 'qdb_isactive'],
  },
  qdb_identityexception: {
    key: ['qdb_name', 'qdb_exceptionreason', 'qdb_exceptionstatus', 'qdb_source', 'qdb_sourcereference', 'qdb_facilitynumber', 'qdb_receiveddate'],
    view: ['qdb_name', 'qdb_exceptionreason', 'qdb_exceptionstatus', 'qdb_source', 'qdb_facilitynumber', 'qdb_sourcereference', 'qdb_receiveddate', 'qdb_reviewedbyid', 'qdb_reviewdate', 'ownerid'],
    sections: [{ label: 'Resolution', fields: ['qdb_resolvedcustomerid', 'qdb_resolvedfacilitynumber', 'qdb_reviewedbyid', 'qdb_reviewdate', 'qdb_resolution'] }],
  },
};

// ── Icons, in the Form Engine's style: 20×20, #0078d4 strokes, no fill ───────

const STROKE = 'stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">${body}</svg>`;
const ICONS = {
  qdb_collectioncase: svg(`<rect x="2" y="5" width="16" height="12" rx="2" ${STROKE}/><path d="M7 5V3.5A1.5 1.5 0 0 1 8.5 2h3A1.5 1.5 0 0 1 13 3.5V5M2 10h16" ${STROKE}/>`),
  qdb_collectionactivity: svg(`<path d="M4 3.5h3l1.5 3.5-2 1.2a8 8 0 0 0 5.3 5.3l1.2-2 3.5 1.5v3a1.5 1.5 0 0 1-1.7 1.5C8.2 16.9 3.1 11.8 2.5 5.2A1.5 1.5 0 0 1 4 3.5z" ${STROKE}/>`),
  qdb_delinquencysnapshot: svg(`<path d="M3 16l4-5 3 3 3-5 4 3" ${STROKE}/><path d="M3 3v14h14" ${STROKE}/>`),
  qdb_collectionactivitytype: svg(`<path d="M3 3h6l8 8-6 6-8-8V3z" ${STROKE}/><circle cx="7" cy="7" r="1.2" fill="#0078d4"/>`),
  qdb_activityoutcome: svg(`<path d="M4 17V3M4 3h10l-2 3.5 2 3.5H4" ${STROKE}/><path d="M12 15.5l1.7 1.5 3-3.5" ${STROKE}/>`),
  qdb_collectionstrategy: svg(`<circle cx="10" cy="10" r="7" ${STROKE}/><circle cx="10" cy="10" r="3.5" ${STROKE}/><circle cx="10" cy="10" r="1" fill="#0078d4"/>`),
  qdb_strategyaction: svg(`<path d="M3 5h8M3 10h6M3 15h8" ${STROKE}/><path d="M13 8l3 2-3 2" ${STROKE}/>`),
  qdb_assignmentconfiguration: svg(`<circle cx="8" cy="6.5" r="3" ${STROKE}/><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" ${STROKE}/><circle cx="15" cy="13" r="2.2" ${STROKE}/><path d="M15 9.5v1.3M15 15.2v1.3M11.5 13h1.3M17.2 13h1.3" ${STROKE}/>`),
  qdb_communicationtemplate: svg(`<rect x="2" y="4" width="16" height="12" rx="2" ${STROKE}/><path d="M2.5 5.5L10 11l7.5-5.5" ${STROKE}/>`),
  qdb_communicationrun: svg(`<path d="M17 3L3 8.5l6 2 2 6L17 3z" ${STROKE}/><path d="M9 10.5l8-7.5" ${STROKE}/>`),
  qdb_platformconfiguration: svg(`<path d="M4 6h12M4 10h12M4 14h12" ${STROKE}/><circle cx="8" cy="6" r="1.6" fill="#fff" ${STROKE}/><circle cx="13" cy="10" r="1.6" fill="#fff" ${STROKE}/><circle cx="7" cy="14" r="1.6" fill="#fff" ${STROKE}/>`),
  qdb_platformmapping: svg(`<circle cx="5" cy="5" r="2" ${STROKE}/><circle cx="15" cy="5" r="2" ${STROKE}/><circle cx="5" cy="15" r="2" ${STROKE}/><circle cx="15" cy="15" r="2" ${STROKE}/><path d="M7 5h6M5 7v6M15 7v6M7 15h6" ${STROKE}/>`),
  qdb_identityexception: svg(`<rect x="2" y="4" width="16" height="12" rx="2" ${STROKE}/><circle cx="7" cy="9" r="1.8" ${STROKE}/><path d="M4.5 13.5c0-1.4 1.1-2.3 2.5-2.3s2.5.9 2.5 2.3" ${STROKE}/><path d="M13.5 7.5v3M13.5 12.5v.5" ${STROKE}/>`),
};

// ── Form XML ─────────────────────────────────────────────────────────────────

const CLASS = {
  text: '{4273EDBD-AC1D-40D3-9FB2-095C621B552D}',
  memo: '{E0DECE4B-6FC8-4A8F-A065-082708572369}',
  lookup: '{270BD3DB-D9AF-4782-9025-509E298DEC0A}',
  picklist: '{3EF39988-22BB-4F0B-BBBE-64B5A3748AEE}',
  twoOption: '{67FAC785-CD58-4F9F-ABB3-4B7DDC6ED5ED}',
  datetime: '{5B773807-9FB2-42DB-97C3-7A91EFF8ADFF}',
  number: '{C3EFE0C3-0EC6-42BE-8349-CBD9079DFD8E}',
  money: '{533B9E00-756B-4312-95A0-DC888637AC78}',
  multiSelect: '{4AA28AB7-9C13-4F57-A73D-AD894D048B5F}',
};

const TYPE_CLASS = {
  StringType: CLASS.text, MemoType: CLASS.memo, LookupType: CLASS.lookup, OwnerType: CLASS.lookup, CustomerType: CLASS.lookup,
  PicklistType: CLASS.picklist, StateType: CLASS.picklist, StatusType: CLASS.picklist, BooleanType: CLASS.twoOption,
  DateTimeType: CLASS.datetime, IntegerType: CLASS.number, DecimalType: CLASS.number, DoubleType: CLASS.number, BigIntType: CLASS.number,
  MoneyType: CLASS.money, MultiSelectPicklistType: CLASS.multiSelect,
};

/** Native activity columns worth a place on the form; every other native activity column is plumbing. */
const ACTIVITY_NATIVE = ['subject', 'regardingobjectid', 'scheduledstart', 'scheduledend', 'actualstart', 'actualend', 'scheduleddurationminutes', 'actualdurationminutes', 'prioritycode', 'description'];
const ADMIN = ['ownerid', 'statecode', 'statuscode', 'createdby', 'createdon', 'modifiedby', 'modifiedon'];
const ADMIN_READONLY = new Set(['createdby', 'createdon', 'modifiedby', 'modifiedon', 'statecode']);

const guid = () => `{${randomUUID()}}`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cell(attr, disabled = false) {
  const classid = TYPE_CLASS[attr.type];
  if (!classid) return '';
  return `<cell id="${guid()}" locklevel="0"><labels><label description="${esc(attr.label)}" languagecode="1033" /></labels>`
    + `<control id="${attr.name}" classid="${classid}" datafieldname="${attr.name}" disabled="${disabled}" /></cell>`;
}

function section(label, attrs, columns = 2, readonly = new Set()) {
  const cells = attrs.map(a => cell(a, readonly.has(a.name))).filter(Boolean);
  if (cells.length === 0) return '';
  const rows = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(`<row>${cells.slice(i, i + columns).join('')}</row>`);
  return `<section name="${esc(label)}" id="${guid()}" showlabel="true" showbar="false" columns="${columns === 1 ? '1' : '11'}" labelwidth="115" celllabelalignment="Left" celllabelposition="Left">`
    + `<labels><label description="${esc(label)}" languagecode="1033" /></labels><rows>${rows.join('')}</rows></section>`;
}

function tab(label, sections) {
  return `<tab name="${esc(label)}" id="${guid()}" IsUserDefined="1" showlabel="true" expanded="true" verticallayout="true">`
    + `<labels><label description="${esc(label)}" languagecode="1033" /></labels><columns><column width="100%"><sections>${sections.join('')}</sections></column></columns></tab>`;
}

/** Every placeable field, grouped: key facts, the table's own sections, then the rest by kind. */
function buildForm(entity, attrs, spec) {
  const byName = new Map(attrs.map(a => [a.name, a]));
  const placeable = attrs.filter(a => TYPE_CLASS[a.type] && !ADMIN.includes(a.name) && (a.custom || (entity.IsActivity && ACTIVITY_NATIVE.includes(a.name))));
  const used = new Set();
  const take = names => names.map(n => byName.get(n)).filter(a => a && placeable.includes(a) && !used.has(a.name)).map(a => { used.add(a.name); return a; });

  const sections = [section('Key details', take(spec.key))];
  for (const own of spec.sections ?? []) sections.push(section(own.label, take(own.fields), own.columns ?? 2));
  const rest = placeable.filter(a => !used.has(a.name));
  const kind = a => (a.type === 'MemoType' ? 'notes' : a.type === 'BooleanType' ? 'flags' : a.type === 'DateTimeType' ? 'dates' : a.type === 'MoneyType' ? 'amounts' : 'details');
  const groups = { details: [], dates: [], amounts: [], flags: [], notes: [] };
  for (const a of rest) groups[kind(a)].push(a);
  sections.push(section('Details', groups.details), section('Dates', groups.dates), section('Amounts', groups.amounts), section('Flags', groups.flags), section('Notes', groups.notes, 1));

  const admin = section('Ownership and status', take(ADMIN.filter(n => byName.has(n))), 2, ADMIN_READONLY);
  const header = `<header id="${guid()}" celllabelposition="Top" columns="111" labelwidth="115" celllabelalignment="Left"><rows><row>`
    + [byName.get('statuscode'), byName.get('ownerid') ?? byName.get('createdon')].filter(Boolean).map(a => cell(a, true)).join('') + '</row></rows></header>';
  return `<form headerdensity="HighWithControls" shownavigationbar="true" showImage="true">${header}<tabs>${tab('General', sections)}${tab('Administration', [admin])}</tabs></form>`;
}

// ── View XML ─────────────────────────────────────────────────────────────────

const WIDTH = { LookupType: 160, OwnerType: 140, CustomerType: 160, StringType: 160, MemoType: 200, DateTimeType: 130, MoneyType: 120, IntegerType: 90, DecimalType: 100, BooleanType: 90, PicklistType: 130, StatusType: 120, StateType: 100 };

function buildLayout(entity, columns, byName) {
  const cells = columns.map(name => `<cell name="${name}" width="${byName.get(name).name === entity.PrimaryNameAttribute ? 240 : (WIDTH[byName.get(name).type] ?? 130)}" />`).join('');
  return `<grid name="resultset" object="${entity.ObjectTypeCode}" jump="${entity.PrimaryNameAttribute}" select="1" icon="1" preview="1"><row name="result" id="${entity.PrimaryIdAttribute}">${cells}</row></grid>`;
}

/** The view's own filter and order are kept; only which columns it returns changes. */
function rewriteFetch(fetchxml, entity, columns) {
  const attributes = [entity.PrimaryIdAttribute, ...columns].map(n => `<attribute name="${n}" />`).join('');
  const stripped = fetchxml.replace(/<attribute name="[^"]+" \/>/g, '');
  return stripped.replace(/(<entity name="[^"]+">)/, `$1${attributes}`);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/** One retry on a dropped connection: the organisation resets long-lived TLS sessions now and then. */
async function send(cfg, token, method, path, body, extra = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(`${cfg.apiBase}${path}`, { method, headers: buildHeaders(token, SOLUTION_NAME, extra), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (failure) {
    if (attempt >= 3) throw failure;
    await new Promise(r => setTimeout(r, 1500 * attempt));
    return send(cfg, token, method, path, body, extra, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * Columns being retired: never placed on a generated form, because a form is the one dependency that
 * blocks removing a column. The two same-organisation links were replaced by the external process
 * reference (docs/ExternalProcessReference.md).
 */
const RETIRED_COLUMNS = new Set(['qdb_complaintcaseid', 'qdb_legalrequestid']);

async function readEntity(cfg, token, logicalName) {
  const def = await apiGet(cfg, token, null, `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,DisplayName,PrimaryNameAttribute,PrimaryIdAttribute,IsActivity,ObjectTypeCode,IconVectorName`);
  const raw = await apiGet(cfg, token, null, `/EntityDefinitions(LogicalName='${logicalName}')/Attributes?$select=LogicalName,AttributeTypeName,IsCustomAttribute,IsValidForRead,DisplayName,IsLogical,AttributeOf`);
  const attrs = raw.value.filter(a => a.IsValidForRead && !a.IsLogical && !a.AttributeOf && !RETIRED_COLUMNS.has(a.LogicalName))
    .map(a => ({ name: a.LogicalName, type: a.AttributeTypeName?.Value, label: a.DisplayName?.UserLocalizedLabel?.Label ?? a.LogicalName, custom: a.IsCustomAttribute }));
  return { def, attrs };
}

async function upsertIcon(cfg, token, logicalName) {
  const name = `qdb_icon_${logicalName.replace('qdb_', '')}`;
  const existing = await apiGet(cfg, token, null, `/webresourceset?$select=webresourceid&$filter=name eq '${name}'`);
  const payload = { name, displayname: `DCP icon — ${logicalName}`, webresourcetype: 11, content: Buffer.from(ICONS[logicalName]).toString('base64'), description: `Table icon for ${logicalName}` };
  if (existing.value.length) { await send(cfg, token, 'PATCH', `/webresourceset(${existing.value[0].webresourceid})`, payload); return { name, id: existing.value[0].webresourceid }; }
  const created = await send(cfg, token, 'POST', '/webresourceset', payload, { Prefer: 'return=representation' });
  return { name, id: created.webresourceid };
}

/** The Form Engine's way: read the whole definition, set the icon, put it back. */
async function setIcon(cfg, token, logicalName, resourceName) {
  const entity = await apiGet(cfg, token, null, `/EntityDefinitions(LogicalName='${logicalName}')`);
  for (const key of Object.keys(entity)) if (key.startsWith('@')) delete entity[key];
  entity.IconVectorName = resourceName;
  await send(cfg, token, 'PUT', `/EntityDefinitions(LogicalName='${logicalName}')`, entity, { 'MSCRM.MergeLabels': 'true' });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const cfg = loadConfig();
if (!cfg.orgUrl.includes(AUTHORISED_ORG)) { console.error(`Refusing: ${cfg.orgUrl} is not ${AUTHORISED_ORG}`); process.exit(1); }
const token = await acquireToken(cfg);
const targets = Object.keys(TABLES).filter(t => ONLY.length === 0 || ONLY.includes(t));
const touched = { entities: [], webresources: [] };

for (const logicalName of targets) {
  const spec = TABLES[logicalName];
  const { def, attrs } = await readEntity(cfg, token, logicalName);
  const byName = new Map(attrs.map(a => [a.name, a]));
  const missing = [...spec.key, ...spec.view, ...(spec.sections ?? []).flatMap(s => s.fields)].filter(n => !byName.has(n));
  if (missing.length) throw new Error(`${logicalName}: unknown columns ${missing.join(', ')}`);

  const formxml = buildForm(def, attrs, spec);
  const placed = (formxml.match(/datafieldname="/g) ?? []).length;
  const forms = await apiGet(cfg, token, null, `/systemforms?$select=formid,name&$filter=objecttypecode eq '${logicalName}' and type eq 2`);
  const views = await apiGet(cfg, token, null, `/savedqueries?$select=savedqueryid,name,fetchxml&$filter=returnedtypecode eq '${logicalName}' and querytype eq 0`);
  const layout = buildLayout(def, spec.view, byName);
  console.log(`\n${logicalName} — ${placed} fields on the form, ${spec.view.length} view columns, ${forms.value.length} form(s), ${views.value.length} view(s)`);
  if (DRY_RUN) continue;

  for (const form of forms.value) {
    await send(cfg, token, 'PATCH', `/systemforms(${form.formid})`, { formxml });
    console.log(`  form "${form.name}" updated`);
  }
  for (const view of views.value) {
    await send(cfg, token, 'PATCH', `/savedqueries(${view.savedqueryid})`, { fetchxml: rewriteFetch(view.fetchxml, def, spec.view), layoutxml: layout });
    console.log(`  view "${view.name}" updated`);
  }
  const icon = await upsertIcon(cfg, token, logicalName);
  await setIcon(cfg, token, logicalName, icon.name);
  console.log(`  icon ${icon.name} set`);
  touched.entities.push(logicalName); touched.webresources.push(icon.id);
}

if (!DRY_RUN) {
  const xml = `<importexportxml><entities>${touched.entities.map(e => `<entity>${e}</entity>`).join('')}</entities>`
    + `<webresources>${touched.webresources.map(id => `<webresource>${id}</webresource>`).join('')}</webresources></importexportxml>`;
  await send(cfg, token, 'POST', '/PublishXml', { ParameterXml: xml });
  console.log(`\nPublished ${touched.entities.length} tables and ${touched.webresources.length} icons.`);
}
