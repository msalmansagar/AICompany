/*
 * onprem-post-import-verify.js — READ-ONLY. Run in the browser console (F12) on an on-prem org AFTER
 * importing qdb_debtcollection_1_0_0_0_onprem_unmanaged.zip, as a System Administrator, from a page
 * inside the org (e.g. the Debt Collection app). Downloads post-import-<org>-<date>.json — send it back.
 *
 * Proves what the import created instead of trusting the import dialog: the solution and its
 * components, the DCP Approval Status choice and the two columns bound to it, the four retired columns
 * absent, the 14 plugin steps enabled on the right messages, the assembly in Sandbox, roles, web
 * resources, app and site maps — and records the state of QDB's own three shared choices so it can be
 * compared with the pre-import inspection. GET requests only.
 */
(async () => {
  const EXPECTED = {
    solution: 'qdb_debtcollection',
    tables: ['qdb_activityoutcome', 'qdb_assignmentconfiguration', 'qdb_collectionactivity', 'qdb_collectionactivitytype', 'qdb_collectioncase', 'qdb_collectionstrategy', 'qdb_communicationrun', 'qdb_communicationtemplate', 'qdb_delinquencysnapshot', 'qdb_identityexception', 'qdb_platformconfiguration', 'qdb_platformmapping', 'qdb_strategyaction'],
    choiceCount: 28,
    roleCount: 12,
    webResourceCount: 15,
    stepCount: 14,
    rebound: [['qdb_collectionactivity', 'None'], ['qdb_communicationtemplate', 'ApplicationRequired']],
    retired: [['qdb_collectioncase', 'qdb_risklevel'], ['qdb_collectioncase', 'qdb_priority'], ['qdb_collectionstrategy', 'qdb_risklevel'], ['qdb_assignmentconfiguration', 'qdb_risklevel']],
    numericPriority: ['qdb_collectionstrategy', 'qdb_assignmentconfiguration'],
    qdbSharedChoices: ['qdb_approval_status', 'qdb_risk_level', 'qdb_priority'],
    siteMaps: ['qdb_DebtCollection', 'qdb_debtcollection_sitemap'],
    appModule: 'qdb_CollectionWorkspace',
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
  if (!apiBase) { console.error('[verify] Web API not reachable'); return; }

  const checks = [];
  const record = (name, passed, detail) => { checks.push({ name, passed, detail }); console.log((passed ? 'PASS ' : 'FAIL ') + name); };
  const report = { inspectedAt: new Date().toISOString(), clientUrl, apiBase, checks };
  report.organisation = (await get('/organizations?$select=name')).value[0].name;

  const solution = (await get("/solutions?$select=solutionid,uniquename,version,ismanaged&$filter=uniquename eq '" + EXPECTED.solution + "'&$expand=publisherid($select=uniquename,customizationprefix,customizationoptionvalueprefix)")).value[0];
  record('solution qdb_debtcollection present, unmanaged, publisher qdb', Boolean(solution) && !solution.ismanaged && solution.publisherid.uniquename === 'qdb', solution && { version: solution.version, publisher: solution.publisherid });
  if (!solution) { finish(); return; }
  const components = (await get('/solutioncomponents?$select=componenttype,objectid&$filter=_solutionid_value eq ' + solution.solutionid)).value;
  const countOf = (type) => components.filter(c => c.componenttype === type).length;
  report.componentCounts = { tables: countOf(1), choices: countOf(9), roles: countOf(20), webResources: countOf(61), siteMaps: countOf(62), apps: countOf(80), assemblies: countOf(91), steps: countOf(92) };
  const c = report.componentCounts;
  record('component counts (13 tables, 28 choices, 12 roles, 15 web resources, 1 assembly, 14 steps)', c.tables === 13 && c.choices === EXPECTED.choiceCount && c.roles === EXPECTED.roleCount && c.webResources === EXPECTED.webResourceCount && c.assemblies === 1 && c.steps === EXPECTED.stepCount, c);

  const missingTables = [];
  for (const table of EXPECTED.tables) if (isAbsent(await tryGet("/EntityDefinitions(LogicalName='" + table + "')?$select=LogicalName"))) missingTables.push(table);
  record('all 13 DCP tables exist', missingTables.length === 0, missingTables);

  const choice = await tryGet("/GlobalOptionSetDefinitions(Name='qdb_dcp_approval_status')");
  const options = (choice.Options || []).map(o => [o.Value, o.Label && o.Label.UserLocalizedLabel ? o.Label.UserLocalizedLabel.Label : null]);
  record('qdb_dcp_approval_status = exactly 0 Return / 1 Approve', JSON.stringify(options) === '[[0,"Return"],[1,"Approve"]]', options);

  for (const [table, requiredLevel] of EXPECTED.rebound) {
    const column = await tryGet("/EntityDefinitions(LogicalName='" + table + "')/Attributes(LogicalName='qdb_approvalstatus')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=SchemaName,RequiredLevel&$expand=GlobalOptionSet($select=Name)");
    const detail = { choice: column.GlobalOptionSet && column.GlobalOptionSet.Name, required: column.RequiredLevel && column.RequiredLevel.Value, error: column.error };
    record(table + '.qdb_approvalstatus bound to qdb_dcp_approval_status', detail.choice === 'qdb_dcp_approval_status' && detail.required === requiredLevel, detail);
  }
  for (const [table, column] of EXPECTED.retired) {
    record(table + '.' + column + ' absent (retired)', isAbsent(await tryGet("/EntityDefinitions(LogicalName='" + table + "')/Attributes(LogicalName='" + column + "')?$select=LogicalName")));
  }
  for (const table of EXPECTED.numericPriority) {
    const column = await tryGet("/EntityDefinitions(LogicalName='" + table + "')/Attributes(LogicalName='qdb_priority')?$select=AttributeType");
    record(table + '.qdb_priority is a whole number', column.AttributeType === 'Integer', column.AttributeType || column.error);
  }
  console.log('[verify] schema read');

  const assembly = (await get("/pluginassemblies?$select=pluginassemblyid,name,version,isolationmode,publickeytoken&$filter=name eq 'Qdb.DebtCollection.Plugins'")).value[0];
  record('plugin assembly present in Sandbox', Boolean(assembly) && assembly.isolationmode === 2, assembly && { version: assembly.version, isolationmode: assembly.isolationmode });
  const stepIds = components.filter(x => x.componenttype === 92).map(x => x.objectid);
  const steps = [];
  for (const id of stepIds) {
    const step = await tryGet('/sdkmessageprocessingsteps(' + id + ')?$select=name,statecode,stage,mode,filteringattributes&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)');
    steps.push({ name: step.name, enabled: step.statecode === 0, message: step.sdkmessageid && step.sdkmessageid.name, table: step.sdkmessagefilterid && step.sdkmessagefilterid.primaryobjecttypecode, stage: step.stage, error: step.error });
  }
  report.steps = steps;
  record('14 plugin steps, all enabled, all on DCP tables', steps.length === EXPECTED.stepCount && steps.every(s => s.enabled && EXPECTED.tables.indexOf(s.table) >= 0), steps.filter(s => !s.enabled || EXPECTED.tables.indexOf(s.table) < 0));

  const app = (await tryGet("/appmodules?$select=appmoduleid,name,statecode&$filter=uniquename eq '" + EXPECTED.appModule + "'")).value || [];
  report.appId = app[0] && app[0].appmoduleid;
  record('Debt Collection app present (appid recorded for direct links)', app.length === 1, app[0] && { name: app[0].name, appmoduleid: app[0].appmoduleid, statecode: app[0].statecode });
  const siteMaps = [];
  for (const id of components.filter(x => x.componenttype === 62).map(x => x.objectid)) {
    const siteMap = await tryGet('/sitemaps(' + id + ')?$select=sitemapnameunique,sitemapname');
    siteMaps.push({ unique: siteMap.sitemapnameunique, name: siteMap.sitemapname, error: siteMap.error });
  }
  record('both site maps present', siteMaps.length === EXPECTED.siteMaps.length && siteMaps.every(s => !s.error), siteMaps);
  console.log('[verify] plugins, app and site maps read');

  report.qdbSharedChoices = {};
  for (const name of EXPECTED.qdbSharedChoices) {
    const shared = await tryGet("/GlobalOptionSetDefinitions(Name='" + name + "')");
    report.qdbSharedChoices[name] = isAbsent(shared) ? 'absent' : { options: (shared.Options || []).map(o => o.Value + '=' + (o.Label && o.Label.UserLocalizedLabel ? o.Label.UserLocalizedLabel.Label : '')) };
  }
  finish();

  function finish() {
    report.passed = checks.filter(x => x.passed).length;
    report.failed = checks.filter(x => !x.passed).length;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    link.download = 'post-import-' + String(report.organisation).replace(/\W+/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    console.log('[verify] finished — ' + link.download + ' — ' + report.passed + ' passed, ' + report.failed + ' failed');
  }
})();
