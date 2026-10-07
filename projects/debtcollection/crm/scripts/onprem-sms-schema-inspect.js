/*
 * onprem-sms-schema-inspect.js — READ-ONLY. Run in the browser console (F12) on HL CRM test (and on
 * QDB1 test for comparison), as a System Administrator, from a page inside the organisation.
 * Downloads sms-schema-<org>-<date>.json — send it back.
 *
 * The SMS table differs per organisation: HL CRM sends SMS as `letter`, BFD / QDB1 as `fax`. DCP was
 * built on QDB1's fax columns, so this records, for BOTH tables: every custom column, how many of the
 * last 200 rows fill each custom column and the standard columns an SMS could live in (counts only —
 * no message text, no phone numbers), the processes that act on the table, and its custom plugin
 * steps. Plus any other SMS-like table. GET requests only.
 */
(async () => {
  const TABLES = {
    letter: { set: 'letters', standardColumns: ['subject', 'description', 'address', 'category', 'subcategory', 'directioncode'] },
    fax: { set: 'faxes', standardColumns: ['subject', 'description', 'faxnumber', 'category', 'subcategory', 'directioncode'] },
  };
  const DCP_FAX_COLUMNS = ['qdb_message_body', 'qdb_sender', 'qdb_language', 'qdb_whatsapptemplate', 'qdb_otp'];
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
  for (const version of ['v9.1', 'v9.0']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[sms] Web API not reachable'); return; }
  const label = (l) => (l && l.UserLocalizedLabel ? l.UserLocalizedLabel.Label : null);
  const isLookup = (type) => type === 'Lookup' || type === 'Owner' || type === 'Customer';
  const selectName = (column) => (isLookup(column.type) ? '_' + column.name + '_value' : column.name);
  const report = { inspectedAt: new Date().toISOString(), clientUrl, tables: {} };
  report.organisation = (await get('/organizations?$select=name')).value[0].name;

  const customColumnsOf = async (table) => {
    const attributes = (await get("/EntityDefinitions(LogicalName='" + table + "')/Attributes?$select=LogicalName,AttributeType,DisplayName,IsCustomAttribute,AttributeOf")).value;
    // Generated companions (lookup "…name", "…yominame") carry AttributeOf and cannot be selected.
    return attributes.filter(a => a.IsCustomAttribute && !a.AttributeOf && a.AttributeType !== 'Virtual')
      .map(a => ({ name: a.LogicalName, type: a.AttributeType, display: label(a.DisplayName) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const usageOf = async (table, columns) => {
    const select = ['activityid', 'createdon'].concat(columns.map(selectName)).join(',');
    const recent = await tryGet('/' + TABLES[table].set + '?$top=200&$orderby=createdon desc&$select=' + select);
    if (recent.error) return { error: recent.error };
    const rows = recent.value;
    const filled = {};
    for (const column of columns) filled[column.name] = rows.filter(r => { const v = r[selectName(column)]; return v !== null && v !== undefined && v !== ''; }).length;
    return { rowsRead: rows.length, newest: rows[0] ? rows[0].createdon : null, oldest: rows.length ? rows[rows.length - 1].createdon : null, filledCountByColumn: filled };
  };

  const automationOn = async (table) => {
    const processes = await tryGet("/workflows?$select=name,category,primaryentity,statecode,triggeroncreate&$filter=type eq 1 and (primaryentity eq '" + table + "' or contains(xaml,'EntityName=\"" + table + "\"'))");
    const steps = await tryGet('/sdkmessageprocessingsteps?$select=name,stage,mode&$expand=sdkmessagefilterid($select=primaryobjecttypecode),sdkmessageid($select=name),plugintypeid($select=typename)&$filter=statecode eq 0 and customizationlevel eq 1');
    return {
      processes: processes.error ? { error: processes.error } : processes.value.map(w => ({ name: w.name, category: w.category, entity: w.primaryentity, active: w.statecode === 1, onCreate: w.triggeroncreate })),
      customPluginSteps: steps.error ? { error: steps.error } : steps.value
        .filter(s => s.sdkmessagefilterid && s.sdkmessagefilterid.primaryobjecttypecode === table)
        .map(s => ({ name: s.name, message: s.sdkmessageid && s.sdkmessageid.name, type: s.plugintypeid && s.plugintypeid.typename, stage: s.stage, async: s.mode === 1 })),
    };
  };

  for (const table of Object.keys(TABLES)) {
    const customColumns = await customColumnsOf(table);
    const standardColumns = TABLES[table].standardColumns.map(name => ({ name, type: 'standard' }));
    report.tables[table] = {
      customColumns,
      usageOfLast200: await usageOf(table, standardColumns.concat(customColumns)),
      ...(await automationOn(table)),
    };
    console.log('[sms] ' + table + ' read');
  }
  const faxColumns = report.tables.fax.customColumns.map(c => c.name);
  report.dcpFaxColumnsPresent = Object.fromEntries(DCP_FAX_COLUMNS.map(c => [c, faxColumns.indexOf(c) >= 0]));
  const entities = (await get('/EntityDefinitions?$select=LogicalName,DisplayName,IsActivity,IsCustomEntity')).value;
  report.otherSmsLikeCustomTables = entities.filter(e => e.IsCustomEntity && !/^msdyn/i.test(e.LogicalName) && /sms|whatsapp|message|textmsg/i.test(e.LogicalName))
    .map(e => ({ name: e.LogicalName, display: label(e.DisplayName), isActivity: e.IsActivity }));
  console.log('[sms] other tables read');

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  link.download = 'sms-schema-' + report.organisation.replace(/\W+/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[sms] finished — ' + link.download);
})();
