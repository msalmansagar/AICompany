/*
 * onprem-choice-inspect.js — READ-ONLY. Run in the browser console (F12) on HL CRM test and on QDB1
 * test, as a System Administrator, like the earlier scripts. Downloads
 * choice-inspection-<org>-<date>.json — send both back.
 *
 * For the three QDB-wide choices DCP's columns were bound to (approval status, risk level,
 * priority), it records: whether the choice exists, its option values and labels, the solutions it
 * belongs to (managed or not, publisher), and every column that uses it. GET requests only; no
 * customer data.
 */
(async () => {
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
  for (const version of ['v9.1', 'v9.0']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[inspect] Web API not reachable'); return; }
  const label = (l) => (l && l.UserLocalizedLabel ? l.UserLocalizedLabel.Label : null);
  const report = { inspectedAt: new Date().toISOString(), clientUrl, organisation: (await get('/organizations?$select=name')).value[0].name, choices: {} };

  for (const name of ['qdb_approval_status', 'qdb_risk_level', 'qdb_priority']) {
    const entry = {};
    try {
      const choice = await get("/GlobalOptionSetDefinitions(Name='" + name + "')");
      entry.exists = true;
      entry.managed = choice.IsManaged;
      entry.options = (choice.Options || []).map(o => ({ value: o.Value, label: label(o.Label) }));
      const owners = await get('/solutioncomponents?$select=_solutionid_value&$filter=objectid eq ' + choice.MetadataId + ' and componenttype eq 9&$expand=solutionid($select=uniquename,ismanaged;$expand=publisherid($select=uniquename,customizationoptionvalueprefix))');
      entry.solutions = owners.value.map(o => ({ solution: o.solutionid && o.solutionid.uniquename, managed: o.solutionid && o.solutionid.ismanaged, publisher: o.solutionid && o.solutionid.publisherid && o.solutionid.publisherid.uniquename }));
      const dependents = await get('/RetrieveDependentComponents(ObjectId=' + choice.MetadataId + ',ComponentType=9)');
      const columnIds = dependents.value.filter(d => d.dependentcomponenttype === 2).map(d => d.dependentcomponentobjectid);
      entry.columns = [];
      for (const id of columnIds) {
        try {
          const owner = await get('/EntityDefinitions?$select=LogicalName&$expand=Attributes($select=LogicalName;$filter=MetadataId eq ' + id + ')');
          owner.value.forEach(e => (e.Attributes || []).forEach(a => entry.columns.push(e.LogicalName + '.' + a.LogicalName)));
        } catch (error) { entry.columns.push(id + ' (unreadable)'); }
      }
    } catch (error) {
      entry.exists = /^404 /.test(error.message) ? false : 'error: ' + error.message;
    }
    report.choices[name] = entry;
    console.log('[inspect] ' + name + ' done');
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = 'choice-inspection-' + report.organisation.replace(/\W+/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[inspect] finished — ' + link.download);
})();
