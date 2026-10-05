/*
 * onprem-sms-schema-inspect.js — READ-ONLY. Run in the browser console (F12) on HL CRM test (and on
 * QDB1 test for comparison), as a System Administrator, from a page inside the organisation.
 * Downloads sms-schema-<org>-<date>.json — send it back.
 *
 * DCP reads and writes SMS/WhatsApp as Fax rows using QDB1's columns (qdb_message_body, qdb_sender,
 * qdb_language, qdb_whatsapptemplate, qdb_otp). HL CRM test has no qdb_message_body, so this records
 * how THIS organisation models an SMS: every custom column on fax, any table that looks like an SMS /
 * message / WhatsApp table, how many recent fax rows fill each custom column (counts only — no
 * message text, no phone numbers), and which processes create fax or SMS-like rows. GET requests only.
 */
(async () => {
  const DCP_FAX_COLUMNS = ['qdb_message_body', 'qdb_sender', 'qdb_language', 'qdb_whatsapptemplate', 'qdb_otp'];
  const clientUrl = (() => {
    try { return window.Xrm.Utility.getGlobalContext().getClientUrl(); } catch (_) { /* fall back */ }
    const org = location.pathname.split('/').filter(Boolean)[0];
    return location.origin + (org && org.toLowerCase() !== 'main.aspx' ? '/' + org : '');
  })();
  let apiBase = '';
  const get = async (path) => {
    const response = await fetch(apiBase + path, { credentials: 'same-origin', headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' } });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status + ' ' + body.slice(0, 200));
    return JSON.parse(body);
  };
  const tryGet = async (path) => { try { return await get(path); } catch (error) { return { error: error.message }; } };
  for (const version of ['v9.1', 'v9.0']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[sms] Web API not reachable'); return; }
  const label = (l) => (l && l.UserLocalizedLabel ? l.UserLocalizedLabel.Label : null);
  const report = { inspectedAt: new Date().toISOString(), clientUrl };
  report.organisation = (await get('/organizations?$select=name')).value[0].name;

  const faxAttributes = (await get("/EntityDefinitions(LogicalName='fax')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsCustomAttribute,AttributeOf")).value;
  // Generated companions (lookup "…name", "…yominame") carry AttributeOf and cannot be selected.
  report.faxCustomColumns = faxAttributes.filter(a => a.IsCustomAttribute && !a.AttributeOf)
    .map(a => ({ name: a.LogicalName, type: a.AttributeType, display: label(a.DisplayName) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  report.dcpFaxColumnsPresent = Object.fromEntries(DCP_FAX_COLUMNS.map(c => [c, faxAttributes.some(a => a.LogicalName === c)]));
  console.log('[sms] fax columns read');

  const recent = await tryGet('/faxes?$top=200&$orderby=createdon desc&$select=' + ['activityid', 'createdon', 'subject', 'directioncode'].concat(report.faxCustomColumns.filter(c => !/^(Virtual|Uniqueidentifier)$/.test(c.type)).map(c => c.type === 'Lookup' || c.type === 'Owner' || c.type === 'Customer' ? '_' + c.name + '_value' : c.name)).join(','));
  if (recent.error) report.recentFax = { error: recent.error };
  else {
    const rows = recent.value;
    report.recentFax = { rowsRead: rows.length, newest: rows[0] && rows[0].createdon, oldest: rows.length ? rows[rows.length - 1].createdon : null, filledCountByColumn: {} };
    for (const c of report.faxCustomColumns) {
      const key = c.type === 'Lookup' || c.type === 'Owner' || c.type === 'Customer' ? '_' + c.name + '_value' : c.name;
      report.recentFax.filledCountByColumn[c.name] = rows.filter(r => r[key] !== null && r[key] !== undefined && r[key] !== '').length;
    }
    report.recentFax.subjectsSample = [...new Set(rows.map(r => (r.subject || '').replace(/\d/g, '#').slice(0, 40)))].slice(0, 10);
  }
  console.log('[sms] recent fax usage read');

  const entities = (await get('/EntityDefinitions?$select=LogicalName,DisplayName,IsActivity,IsCustomEntity')).value;
  report.smsLikeTables = entities.filter(e => /sms|whatsapp|message|notification|textmsg/i.test(e.LogicalName))
    .map(e => ({ name: e.LogicalName, display: label(e.DisplayName), isActivity: e.IsActivity, isCustom: e.IsCustomEntity }));
  console.log('[sms] candidate tables read');

  const processes = await tryGet("/workflows?$select=name,category,primaryentity,statecode,triggeroncreate&$filter=type eq 1 and (primaryentity eq 'fax' or contains(xaml,'EntityName=\"fax\"'))");
  report.processesTouchingFax = processes.error ? { error: processes.error } : processes.value.map(w => ({ name: w.name, category: w.category, entity: w.primaryentity, active: w.statecode === 1, onCreate: w.triggeroncreate }));
  const steps = await tryGet('/sdkmessageprocessingsteps?$select=name,statecode,stage,mode&$expand=sdkmessagefilterid($select=primaryobjecttypecode),sdkmessageid($select=name),plugintypeid($select=typename)&$filter=statecode eq 0 and customizationlevel eq 1');
  report.customPluginStepsOnFax = steps.error ? { error: steps.error } : steps.value
    .filter(s => s.sdkmessagefilterid && s.sdkmessagefilterid.primaryobjecttypecode === 'fax')
    .map(s => ({ name: s.name, message: s.sdkmessageid && s.sdkmessageid.name, type: s.plugintypeid && s.plugintypeid.typename, stage: s.stage, async: s.mode === 1 }));
  console.log('[sms] processes and plugin steps read');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = 'sms-schema-' + report.organisation.replace(/\W+/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[sms] finished — ' + link.download);
})();
