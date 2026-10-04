/*
 * onprem-package-preflight.js — READ-ONLY. Run in the browser console (F12) on HL CRM test and on
 * QDB1 test, as a System Administrator, BEFORE importing qdb_debtcollection_1_0_0_0_onprem_unmanaged.zip.
 * Downloads package-preflight-<org>-<date>.json — send both back.
 *
 * An UNMANAGED import merges into any existing component with the same name. This lists, for every
 * component the DCP package would create, whether the target organisation already has one — a
 * same-named QDB choice or table would be silently changed by the import. It also reads the platform
 * prerequisites (version, publisher, languages, upload limit, sandbox plugins, required standard tables).
 * GET requests only. No customer data.
 */
(async () => {
  const PACKAGE = {
    tables: ['qdb_activityoutcome', 'qdb_assignmentconfiguration', 'qdb_collectionactivity', 'qdb_collectionactivitytype', 'qdb_collectioncase', 'qdb_collectionstrategy', 'qdb_communicationrun', 'qdb_communicationtemplate', 'qdb_delinquencysnapshot', 'qdb_identityexception', 'qdb_platformconfiguration', 'qdb_platformmapping', 'qdb_strategyaction'],
    choices: ['qdb_activity_category', 'qdb_activity_status', 'qdb_assignment_method', 'qdb_business_object', 'qdb_case_stage', 'qdb_communication_channel', 'qdb_consent_status', 'qdb_customer_type', 'qdb_dcp_approval_status', 'qdb_document_provider', 'qdb_dpd_bucket', 'qdb_eligibility_outcome', 'qdb_exception_reason', 'qdb_exception_status', 'qdb_language', 'qdb_lawful_basis', 'qdb_mapping_access', 'qdb_mapping_source', 'qdb_mis_provider', 'qdb_organization_code', 'qdb_outcome_category', 'qdb_platform_type', 'qdb_product_type', 'qdb_promise_type', 'qdb_ptp_status', 'qdb_resolution_type', 'qdb_snapshot_policy', 'qdb_trigger_event'],
    roles: ['QDB DCP Admin User', 'QDB DCP Audit Compliance', 'QDB DCP Collection Officer', 'QDB DCP Finance User', 'QDB DCP Head of Collections', 'QDB DCP Insurance Officer', 'QDB DCP Legal User', 'QDB DCP Management', 'QDB DCP Relationship Manager', 'QDB DCP Restructuring Officer', 'QDB DCP Risk Credit User', 'QDB DCP Senior Manager'],
    webResources: ['qdb_dcp_app_icon.svg', 'qdb_dcp_workspace.html', 'qdb_icon_activityoutcome', 'qdb_icon_assignmentconfiguration', 'qdb_icon_collectionactivity', 'qdb_icon_collectionactivitytype', 'qdb_icon_collectioncase', 'qdb_icon_collectionstrategy', 'qdb_icon_communicationrun', 'qdb_icon_communicationtemplate', 'qdb_icon_delinquencysnapshot', 'qdb_icon_identityexception', 'qdb_icon_platformconfiguration', 'qdb_icon_platformmapping', 'qdb_icon_strategyaction'],
    appModule: 'qdb_CollectionWorkspace',
    siteMaps: ['qdb_DebtCollection', 'qdb_debtcollection_sitemap'],
    pluginAssembly: 'Qdb.DebtCollection.Plugins',
    solution: 'qdb_debtcollection',
    standardTables: ['account', 'activitypointer', 'bookableresourcebooking', 'bookableresourcebookingheader', 'bulkoperation', 'businessunit', 'campaign', 'campaignactivity', 'contact', 'contract', 'entitlement', 'entitlementtemplate', 'incident', 'interactionforemail', 'invoice', 'knowledgearticle', 'knowledgebaserecord', 'lead', 'mailbox', 'opportunity', 'organization', 'quote', 'sla', 'salesorder', 'service', 'site', 'systemuser', 'team', 'transactioncurrency'],
    largestWebResourceBytes: 762339,
  };

  const clientUrl = (() => {
    try { return window.Xrm.Utility.getGlobalContext().getClientUrl(); } catch (_) { /* fall back */ }
    const org = location.pathname.split('/').filter(Boolean)[0];
    return location.origin + (org && org.toLowerCase() !== 'main.aspx' ? '/' + org : '');
  })();
  let apiBase = '';
  const get = async (path) => {
    const response = await fetch(apiBase + path, { credentials: 'same-origin', headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' } });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status + ' ' + body.slice(0, 200));
    return JSON.parse(body);
  };
  const tryGet = async (path) => { try { return await get(path); } catch (error) { return { error: error.message }; } };
  const isAbsent = (result) => Boolean(result.error) && /^404 /.test(result.error);
  for (const version of ['v9.1', 'v9.0']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[preflight] Web API not reachable'); return; }

  const solutionsOf = async (objectId, componentType) => {
    const rows = await tryGet('/solutioncomponents?$select=objectid&$filter=objectid eq ' + objectId + ' and componenttype eq ' + componentType + '&$expand=solutionid($select=uniquename,ismanaged)');
    return (rows.value || []).map(r => r.solutionid && (r.solutionid.uniquename + (r.solutionid.ismanaged ? ' (managed)' : '')));
  };

  const report = { inspectedAt: new Date().toISOString(), clientUrl, apiBase, platform: {}, collisions: {}, standardTablesMissing: [], verdict: {} };
  const organisation = (await get('/organizations?$select=name,languagecode,maxuploadfilesize,blockedattachments')).value[0];
  report.organisation = organisation.name;
  report.platform.version = (await tryGet('/RetrieveVersion()')).Version || 'unreadable';
  report.platform.baseLanguage = organisation.languagecode;
  report.platform.maxUploadFileSizeBytes = organisation.maxuploadfilesize;
  report.platform.webResourceFits = organisation.maxuploadfilesize >= PACKAGE.largestWebResourceBytes;
  report.platform.provisionedLanguages = (await tryGet('/RetrieveProvisionedLanguages()')).RetrieveProvisionedLanguages || 'unreadable';
  const publisher = (await get("/publishers?$select=uniquename,customizationprefix,customizationoptionvalueprefix&$filter=uniquename eq 'qdb'")).value[0];
  report.platform.publisherQdb = publisher ? { prefix: publisher.customizationprefix, optionValuePrefix: publisher.customizationoptionvalueprefix } : 'absent — the import creates it';
  report.platform.sandboxAssembliesInUse = ((await tryGet('/pluginassemblies?$select=name&$filter=isolationmode eq 2&$top=5')).value || []).map(a => a.name);
  console.log('[preflight] platform read');

  report.collisions.solution = ((await get("/solutions?$select=uniquename,version,ismanaged&$filter=uniquename eq '" + PACKAGE.solution + "'")).value)[0] || null;
  report.collisions.tables = [];
  for (const name of PACKAGE.tables) {
    const table = await tryGet("/EntityDefinitions(LogicalName='" + name + "')?$select=LogicalName,MetadataId,IsManaged");
    if (!isAbsent(table)) report.collisions.tables.push({ name, found: table.error ? 'error: ' + table.error : true, solutions: table.MetadataId ? await solutionsOf(table.MetadataId, 1) : [] });
  }
  report.collisions.choices = [];
  for (const name of PACKAGE.choices) {
    const choice = await tryGet("/GlobalOptionSetDefinitions(Name='" + name + "')");
    if (isAbsent(choice)) continue;
    report.collisions.choices.push({ name, found: choice.error ? 'error: ' + choice.error : true, managed: choice.IsManaged,
      options: (choice.Options || []).map(o => o.Value + '=' + (o.Label && o.Label.UserLocalizedLabel ? o.Label.UserLocalizedLabel.Label : '')),
      solutions: choice.MetadataId ? await solutionsOf(choice.MetadataId, 9) : [] });
  }
  console.log('[preflight] tables and choices read');
  report.collisions.roles = (await get('/roles?$select=name,_businessunitid_value&$filter=' + PACKAGE.roles.map(r => "name eq '" + r + "'").join(' or '))).value.map(r => r.name);
  report.collisions.webResources = (await get('/webresourceset?$select=name&$filter=' + PACKAGE.webResources.map(w => "name eq '" + w + "'").join(' or '))).value.map(w => w.name);
  report.collisions.appModule = (await tryGet("/appmodules?$select=uniquename&$filter=uniquename eq '" + PACKAGE.appModule + "'")).value || [];
  report.collisions.siteMaps = (await tryGet('/sitemaps?$select=sitemapnameunique&$filter=' + PACKAGE.siteMaps.map(s => "sitemapnameunique eq '" + s + "'").join(' or '))).value || [];
  report.collisions.pluginAssembly = ((await get("/pluginassemblies?$select=name,version,publickeytoken,isolationmode&$filter=name eq '" + PACKAGE.pluginAssembly + "'")).value);
  for (const name of PACKAGE.standardTables) {
    if (isAbsent(await tryGet("/EntityDefinitions(LogicalName='" + name + "')?$select=LogicalName"))) report.standardTablesMissing.push(name);
  }
  console.log('[preflight] roles, web resources, app, assembly and standard tables read');

  const c = report.collisions;
  report.verdict = {
    noExistingDcpSolution: !c.solution,
    noTableCollision: c.tables.length === 0,
    noChoiceCollision: c.choices.length === 0,
    noRoleNameCollision: c.roles.length === 0,
    noWebResourceCollision: c.webResources.length === 0,
    noAppOrSiteMapCollision: c.appModule.length === 0 && c.siteMaps.length === 0,
    noAssemblyCollision: c.pluginAssembly.length === 0,
    allStandardTablesPresent: report.standardTablesMissing.length === 0,
    publisherCompatible: typeof report.platform.publisherQdb === 'string' || (report.platform.publisherQdb.prefix === 'qdb' && report.platform.publisherQdb.optionValuePrefix === 10000),
    webResourceFits: report.platform.webResourceFits,
  };
  report.verdict.readyForImport = Object.values(report.verdict).every(Boolean);

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = 'package-preflight-' + report.organisation.replace(/\W+/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[preflight] finished — ' + link.download + ' — readyForImport=' + report.verdict.readyForImport);
})();
