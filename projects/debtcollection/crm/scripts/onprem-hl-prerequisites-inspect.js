/*
 * onprem-hl-prerequisites-inspect.js — READ-ONLY check of the HL CRM **test** organisation before
 * the first on-prem import of the Debt Collection Platform.
 *
 * HOW TO RUN (same as the Case Management scripts)
 *   1. Open the HL CRM TEST organisation as a System Administrator (any main.aspx page).
 *   2. F12 → Console. (Chrome may ask you to type "allow pasting" first.)
 *   3. Paste this whole file, press Enter. Under a minute.
 *   4. hl-prerequisites-inspection-<date>.json downloads — send it back.
 *
 * WHAT IT ANSWERS
 *   - the CRM build and the web-resource size limit;
 *   - whether a "qdb" publisher exists, and with which option-value prefix (a mismatch with the
 *     cloud publisher, prefix qdb / option prefix 10000, would make the import fail or collide);
 *   - which DCP tables, choice sets, roles, web resource and plugin assembly already exist
 *     (a partial earlier install changes how the kit must be imported);
 *   - whether the tables DCP links to but does not own exist here (Case, QDB Legal);
 *   - where Housing Loan data lives (contacts, loan tables) — counts only.
 * GET requests only, under your own session. No customer data is exported.
 */
(async () => {
  const clientUrl = (() => {
    try { return window.Xrm.Utility.getGlobalContext().getClientUrl(); } catch (_) { /* fall back */ }
    const org = location.pathname.split('/').filter(Boolean)[0];
    return location.origin + (org && org.toLowerCase() !== 'main.aspx' ? '/' + org : '');
  })();
  const report = { inspectedAt: new Date().toISOString(), clientUrl, sections: {} };
  let apiBase = '';

  async function get(path) {
    const response = await fetch(apiBase + path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status + ' ' + body.slice(0, 200));
    return JSON.parse(body);
  }
  async function exists(path) {
    try { await get(path); return true; } catch (error) { if (/^404 /.test(error.message)) return false; throw error; }
  }
  async function section(name, work) {
    try { report.sections[name] = await work(); } catch (error) { report.sections[name] = { error: String(error && error.message || error) }; }
    console.log('[inspect] ' + name + ' done');
  }
  for (const version of ['v9.1', 'v9.0', 'v8.2']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); report.apiVersion = version; break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[inspect] Web API not reachable from ' + clientUrl); return; }

  const DCP_TABLES = ['qdb_activityoutcome', 'qdb_assignmentconfiguration', 'qdb_collectionactivity', 'qdb_collectionactivitytype',
    'qdb_collectioncase', 'qdb_collectionstrategy', 'qdb_communicationrun', 'qdb_communicationtemplate', 'qdb_delinquencysnapshot',
    'qdb_identityexception', 'qdb_platformconfiguration', 'qdb_platformmapping', 'qdb_strategyaction'];
  const LINKED_TABLES = ['incident', 'qdb_qdblegal', 'qdb_qdblegalpartners', 'qdb_legalligitation', 'qdb_department', 'qdb_customer_term_sheet',
    'qdb_applicationtask', 'qdb_owner', 'qdb_qdblegalcaseprogress', 'qdb_work_item_history', 'qdb_crmlogs'];
  const DCP_CHOICES = ['qdb_activity_category', 'qdb_activity_status', 'qdb_assignment_method', 'qdb_business_object', 'qdb_case_stage',
    'qdb_communication_channel', 'qdb_consent_status', 'qdb_customer_type', 'qdb_document_provider', 'qdb_dpd_bucket',
    'qdb_eligibility_outcome', 'qdb_exception_reason', 'qdb_exception_status', 'qdb_language', 'qdb_lawful_basis', 'qdb_mapping_access',
    'qdb_mapping_source', 'qdb_mis_provider', 'qdb_organization_code', 'qdb_outcome_category', 'qdb_platform_type', 'qdb_product_type',
    'qdb_promise_type', 'qdb_ptp_status', 'qdb_resolution_type', 'qdb_snapshot_policy', 'qdb_trigger_event'];
  const LINKED_CHOICES = ['qdb_approval_status', 'qdb_priority', 'qdb_qdblegalapproval', 'qdb_qdblegalcasetype', 'qdb_qdblegalprojectname', 'qdb_risk_level'];

  await section('organisation', async () => {
    const version = await get('/RetrieveVersion()');
    const org = await get('/organizations?$select=name,maxuploadfilesize,languagecode');
    return { crmVersion: version.Version, name: org.value[0].name, maxUploadFileSizeBytes: org.value[0].maxuploadfilesize, baseLanguage: org.value[0].languagecode };
  });

  await section('publishers', async () => {
    const rows = await get("/publishers?$select=uniquename,friendlyname,customizationprefix,customizationoptionvalueprefix&$filter=customizationprefix eq 'qdb' or customizationprefix eq 'msst' or uniquename eq 'qdb'");
    return { expectedFromCloud: { uniquename: 'qdb', prefix: 'qdb', optionValuePrefix: 10000 }, found: rows.value.map(p => ({ uniquename: p.uniquename, name: p.friendlyname, prefix: p.customizationprefix, optionValuePrefix: p.customizationoptionvalueprefix })) };
  });

  await section('qdbSolutions', async () => {
    const rows = await get("/solutions?$select=uniquename,friendlyname,version,ismanaged,installedon&$filter=isvisible eq true&$expand=publisherid($select=customizationprefix)&$orderby=installedon desc");
    return rows.value.filter(s => s.publisherid && ['qdb', 'msst'].includes(s.publisherid.customizationprefix))
      .map(s => ({ uniquename: s.uniquename, name: s.friendlyname, version: s.version, managed: s.ismanaged, installedOn: s.installedon }));
  });

  const tableCheck = async (names) => {
    const result = {};
    for (const name of names) result[name] = await exists("/EntityDefinitions(LogicalName='" + name + "')?$select=LogicalName");
    return result;
  };
  await section('dcpTablesAlreadyPresent', () => tableCheck(DCP_TABLES));
  await section('linkedTablesPresent', () => tableCheck(LINKED_TABLES));

  const choiceCheck = async (names) => {
    const result = {};
    for (const name of names) result[name] = await exists("/GlobalOptionSetDefinitions(Name='" + name + "')");
    return result;
  };
  await section('dcpChoicesAlreadyPresent', () => choiceCheck(DCP_CHOICES));
  await section('linkedChoicesPresent', () => choiceCheck(LINKED_CHOICES));

  await section('dcpRolesWebResourcePlugin', async () => {
    const roles = await get("/roles?$select=name&$filter=contains(name,'DCP')");
    const webResource = await get("/webresourceset?$select=name&$filter=name eq 'qdb_dcp_workspace.html'");
    const assembly = await get("/pluginassemblies?$select=name,version,isolationmode&$filter=name eq 'Qdb.DebtCollection.Plugins'");
    return {
      dcpRoles: Array.from(new Set(roles.value.map(r => r.name))).sort(),
      workspaceWebResource: webResource.value.length > 0,
      pluginAssembly: assembly.value.map(a => ({ version: a.version, isolation: a['isolationmode@OData.Community.Display.V1.FormattedValue'] })),
    };
  });

  await section('housingLoanData', async () => {
    const tables = await get('/EntityDefinitions?$select=LogicalName,EntitySetName,IsCustomEntity');
    const loanTables = tables.value.filter(t => t.IsCustomEntity && /^(qdb|new|msst)_.*(hous|loan|facilit|mortgage|arrear|delinq|mis)/i.test(t.LogicalName));
    const counts = {};
    for (const table of loanTables.slice(0, 25)) {
      try { counts[table.LogicalName] = (await get('/' + table.EntitySetName + '?$select=createdon&$top=1&$count=true'))['@odata.count']; }
      catch (_) { counts[table.LogicalName] = 'unreadable'; }
    }
    const contacts = await get('/contacts?$select=contactid&$top=1&$count=true');
    const accounts = await get('/accounts?$select=accountid&$top=1&$count=true');
    return { contactCount: contacts['@odata.count'], accountCount: accounts['@odata.count'], loanLikeTables: counts };
  });

  await section('platformCapabilities', async () => ({
    customApiTable: await exists("/EntityDefinitions(LogicalName='customapi')?$select=LogicalName"),
  }));

  const json = JSON.stringify(report, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = 'hl-prerequisites-inspection-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[inspect] finished — ' + link.download + ' downloaded. Sections:', Object.keys(report.sections));
})();
