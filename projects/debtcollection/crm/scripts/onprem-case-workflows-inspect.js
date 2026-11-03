/*
 * onprem-case-workflows-inspect.js — READ-ONLY, second pass of the on-prem Case Management
 * inspection for the HL complaint integration. Run exactly like onprem-case-management-inspect.js
 * (F12 console on any on-prem CRM page, as System Administrator). Downloads
 * case-workflows-inspection-<date>.json.
 *
 * It answers what the first pass could not:
 *   - what each Case on-create workflow and relevant business rule actually does (its definition),
 *     in particular whether "SMS Alert to Customer" / "Email Alert to Customer" would contact the
 *     customer, and what "Assign Case to Owner if Case Created From Middleware" expects;
 *   - which CRM organisations this server hosts (is HL CRM a separate organisation?);
 *   - whether this organisation holds Housing Loan data of its own.
 * GET requests only. No customer data is read.
 */
(async () => {
  const clientUrl = (() => {
    try { return window.Xrm.Utility.getGlobalContext().getClientUrl(); } catch (_) { /* fall back */ }
    const org = location.pathname.split('/').filter(Boolean)[0];
    return location.origin + (org && org.toLowerCase() !== 'main.aspx' ? '/' + org : '');
  })();
  const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
  const report = { inspectedAt: new Date().toISOString(), clientUrl, sections: {} };
  let apiBase = '';

  async function get(url) {
    const response = await fetch(url.startsWith('http') ? url : apiBase + url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status + ' ' + body.slice(0, 300));
    return JSON.parse(body);
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

  const WANTED = /SMS Alert|Email Alert|Middleware|Set Paramters|Set Parameters|Expected Closure|Assign Case|Case Assign|Extract HTML|Updating Non Customer|Case Submit|Case : Submit$|Update Customer Details|Phone to Case/i;

  await section('caseProcessDefinitions', async () => {
    const rows = await get("/workflows?$select=workflowid,name,category,mode,triggeroncreate,triggeronupdateattributelist,xaml,clientdata,description&$filter=primaryentity eq 'incident' and type eq 1 and statecode eq 1");
    return rows.value.filter(w => WANTED.test(w.name)).map(w => ({
      name: w.name, category: w['category' + FORMATTED], mode: w['mode' + FORMATTED],
      onCreate: w.triggeroncreate, onUpdate: w.triggeronupdateattributelist, description: w.description,
      definition: w.xaml || w.clientdata || null,
    }));
  });

  await section('organisationsOnThisServer', async () => {
    const candidates = [location.origin + '/api/discovery/v9.1/Instances', location.origin + '/api/discovery/v9.0/Instances'];
    for (const url of candidates) {
      try {
        const instances = await get(url);
        return instances.value.map(i => ({ name: i.FriendlyName, uniqueName: i.UniqueName, url: i.ApiUrl || i.Url, version: i.Version }));
      } catch (_) { /* try the next discovery version */ }
    }
    return { note: 'discovery service not reachable from the browser' };
  });

  await section('housingLoanDataHere', async () => {
    const tables = await get("/EntityDefinitions?$select=LogicalName,EntitySetName&$filter=IsCustomEntity eq true");
    const loanTables = tables.value.filter(t => /hous|loan|facility|mortgage/i.test(t.LogicalName));
    const counts = {};
    for (const table of loanTables.slice(0, 15)) {
      try { counts[table.LogicalName] = (await get('/' + table.EntitySetName + '?$select=createdon&$top=1&$count=true'))['@odata.count']; }
      catch (error) { counts[table.LogicalName] = 'unreadable'; }
    }
    const contacts = await get('/contacts?$select=contactid&$top=1&$count=true');
    return { loanLikeTables: counts, contactCount: contacts['@odata.count'] };
  });

  await section('caseContextColumns', async () => {
    const result = {};
    for (const column of ['qdb_contact', 'qdb_qid', 'qdb_crnumber']) {
      try {
        const attribute = await get("/EntityDefinitions(LogicalName='incident')/Attributes(LogicalName='" + column + "')?$select=AttributeType,RequiredLevel");
        const filled = await get('/incidents?$select=incidentid&$top=1&$count=true&$filter=' + (attribute.AttributeType === 'Lookup' ? '_' + column + '_value' : column) + ' ne null');
        result[column] = { type: attribute.AttributeType, required: attribute.RequiredLevel.Value, casesWithValue: filled['@odata.count'] };
      } catch (error) { result[column] = { error: String(error.message) }; }
    }
    return result;
  });

  const json = JSON.stringify(report, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = 'case-workflows-inspection-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[inspect] finished — ' + link.download + ' downloaded. Sections:', Object.keys(report.sections));
})();
