/*
 * onprem-case-management-inspect.js — READ-ONLY inspection of QDB's Case Management (`incident`)
 * on the on-premise Dynamics 365 CE 9.1 organisation, for the HL complaint integration.
 *
 * HOW TO RUN
 *   1. Open the on-prem CRM in the browser as a System Administrator (any main.aspx page).
 *   2. Press F12, open the Console tab. (Chrome may ask you to type "allow pasting" first.)
 *   3. Paste this whole file and press Enter. It takes under a minute.
 *   4. A file named case-management-inspection-<date>.json downloads. Send that file back.
 *
 * WHAT IT DOES
 *   GET requests only, against the org's own Web API, under your own session. It creates,
 *   updates and deletes nothing, and sends nothing anywhere else.
 *   Customer personal data is NOT exported: for existing Cases it records only whether the
 *   name/mobile fields are filled, never their values, and never a Contact's name.
 */
(async () => {
  const clientUrl = (() => {
    try { return window.Xrm.Utility.getGlobalContext().getClientUrl(); } catch (_) { /* fall back */ }
    const org = location.pathname.split('/').filter(Boolean)[0];
    return location.origin + (org && org.toLowerCase() !== 'main.aspx' ? '/' + org : '');
  })();
  const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
  const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
  let apiBase = '';
  const report = { inspectedAt: new Date().toISOString(), clientUrl, sections: {} };

  async function get(path) {
    const response = await fetch(apiBase + path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*",odata.maxpagesize=200' },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status + ' ' + body.slice(0, 300));
    return JSON.parse(body);
  }
  async function section(name, work) {
    try { report.sections[name] = await work(); } catch (error) { report.sections[name] = { error: String(error && error.message || error) }; }
    console.log('[inspect] ' + name + ' done');
  }
  const label = (option) => option && option.Label && option.Label.UserLocalizedLabel ? option.Label.UserLocalizedLabel.Label : null;
  const displayName = (attribute) => attribute.DisplayName && attribute.DisplayName.UserLocalizedLabel ? attribute.DisplayName.UserLocalizedLabel.Label : null;
  const attributePath = (entity, attribute) => "/EntityDefinitions(LogicalName='" + entity + "')/Attributes(LogicalName='" + attribute + "')";

  for (const version of ['v9.1', 'v9.0', 'v8.2']) {
    apiBase = clientUrl + '/api/data/' + version;
    try { await get('/WhoAmI'); report.apiVersion = version; break; } catch (_) { apiBase = ''; }
  }
  if (!apiBase) { console.error('[inspect] Web API not reachable from ' + clientUrl); return; }

  await section('organisation', async () => {
    const version = await get('/RetrieveVersion()');
    const dcp = await get("/EntityDefinitions?$select=LogicalName&$filter=LogicalName eq 'qdb_collectioncase'");
    return { crmVersion: version.Version, dcpInstalled: dcp.value.length > 0 };
  });

  const FIELDS = ['qdb_assigned_to_user', 'qdb_businessunit', 'qdb_department', 'qdb_case_source', 'casetypecode',
    'qdb_contact_name', 'customerid', 'qdb_customer_mobile_number', 'qdb_customer_name', 'description',
    'qdb_existing_customer', 'caseorigincode', 'ownerid', 'qdb_product', 'followupby', 'ticketnumber', 'title',
    'qdb_case_category', 'qdb_category', 'qdb_subject', 'qdb_requesttype', 'prioritycode', 'statuscode'];

  await section('incidentFields', async () => {
    const result = {};
    for (const field of FIELDS) {
      try {
        const attribute = await get(attributePath('incident', field) + '?$select=AttributeType,RequiredLevel,DisplayName,IsValidForCreate');
        const entry = { type: attribute.AttributeType, required: attribute.RequiredLevel && attribute.RequiredLevel.Value, display: displayName(attribute), validForCreate: attribute.IsValidForCreate };
        if (['Lookup', 'Customer', 'Owner'].includes(attribute.AttributeType)) {
          entry.targets = (await get(attributePath('incident', field) + '/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets')).Targets;
        }
        if (['Picklist', 'Status'].includes(attribute.AttributeType)) {
          const cast = attribute.AttributeType === 'Status' ? 'StatusAttributeMetadata' : 'PicklistAttributeMetadata';
          const options = await get(attributePath('incident', field) + '/Microsoft.Dynamics.CRM.' + cast + '?$select=LogicalName&$expand=OptionSet($select=Options)');
          entry.options = (options.OptionSet.Options || []).map(option => ({ value: option.Value, label: label(option), state: option.State }));
        }
        if (attribute.AttributeType === 'Boolean') {
          const options = await get(attributePath('incident', field) + '/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=TrueOption,FalseOption)');
          entry.trueLabel = label(options.OptionSet.TrueOption);
          entry.falseLabel = label(options.OptionSet.FalseOption);
        }
        result[field] = entry;
      } catch (error) { result[field] = { error: String(error.message) }; }
    }
    return result;
  });

  await section('incidentRequiredOnCreate', async () => {
    const attributes = await get("/EntityDefinitions(LogicalName='incident')/Attributes?$select=LogicalName,RequiredLevel,IsValidForCreate");
    return attributes.value.filter(a => a.IsValidForCreate && ['SystemRequired', 'ApplicationRequired'].includes(a.RequiredLevel.Value)).map(a => a.LogicalName + ':' + a.RequiredLevel.Value);
  });

  await section('incidentCustomColumns', async () => {
    const attributes = await get("/EntityDefinitions(LogicalName='incident')/Attributes?$select=LogicalName,AttributeType,DisplayName&$filter=IsCustomAttribute eq true");
    return attributes.value.filter(a => !/name$|yominame$/.test(a.LogicalName) || a.AttributeType !== 'String').map(a => a.LogicalName + ':' + a.AttributeType + ':' + (displayName(a) || ''));
  });

  await section('nonCustomerAccounts', async () => {
    const accounts = await get("/accounts?$select=accountid,name,accountnumber,statecode,createdon,_ownerid_value&$filter=contains(name,'Non Customer') or contains(name,'Non-Customer') or contains(name,'NonCustomer')");
    return accounts.value.map(a => ({ accountid: a.accountid, name: a.name, accountnumber: a.accountnumber, state: a['statecode' + FORMATTED], createdon: a.createdon }));
  });

  await section('caseProducts', async () => {
    const target = report.sections.incidentFields.qdb_product && report.sections.incidentFields.qdb_product.targets;
    const table = (target && target[0]) || 'qdb_case_products';
    const definition = await get("/EntityDefinitions(LogicalName='" + table + "')?$select=EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute");
    const rows = await get('/' + definition.EntitySetName + '?$select=' + definition.PrimaryNameAttribute + ',' + definition.PrimaryIdAttribute + ',statecode');
    return { table, rows: rows.value.map(r => ({ id: r[definition.PrimaryIdAttribute], name: r[definition.PrimaryNameAttribute], state: r['statecode' + FORMATTED] })) };
  });

  await section('businessUnits', async () => {
    const attributes = await get("/EntityDefinitions(LogicalName='businessunit')/Attributes?$select=LogicalName,AttributeType&$filter=IsCustomAttribute eq true");
    const lookups = attributes.value.filter(a => a.AttributeType === 'Lookup').map(a => a.LogicalName);
    const select = ['businessunitid', 'name', 'isdisabled', '_parentbusinessunitid_value'].concat(lookups.map(n => '_' + n + '_value'));
    const units = await get('/businessunits?$select=' + select.join(',') + '&$orderby=name');
    return {
      customLookupColumns: lookups,
      units: units.value.map(u => {
        const row = { id: u.businessunitid, name: u.name, disabled: u.isdisabled, parent: u['_parentbusinessunitid_value' + FORMATTED] || null };
        for (const lookup of lookups) row[lookup] = u['_' + lookup + '_value' + FORMATTED] || null;
        return row;
      }),
    };
  });

  await section('businessUnitLookupTarget', async () => {
    const field = report.sections.incidentFields.qdb_businessunit;
    if (!field || field.type !== 'Lookup') return { note: 'qdb_businessunit is ' + (field && field.type) + ', not a lookup' };
    const result = {};
    for (const table of field.targets) {
      const definition = await get("/EntityDefinitions(LogicalName='" + table + "')?$select=EntitySetName,PrimaryNameAttribute,PrimaryIdAttribute");
      const attributes = await get("/EntityDefinitions(LogicalName='" + table + "')/Attributes?$select=LogicalName,AttributeType&$filter=AttributeType eq Microsoft.Dynamics.CRM.AttributeTypeCode'Lookup'");
      const lookups = attributes.value.map(a => a.LogicalName).filter(n => /manager|head|user/i.test(n));
      const rows = await get('/' + definition.EntitySetName + '?$select=' + [definition.PrimaryNameAttribute, definition.PrimaryIdAttribute].concat(lookups.map(n => '_' + n + '_value')).join(','));
      result[table] = rows.value.map(r => Object.assign({ id: r[definition.PrimaryIdAttribute], name: r[definition.PrimaryNameAttribute] }, Object.fromEntries(lookups.map(n => [n, r['_' + n + '_value' + FORMATTED] || null]))));
    }
    return result;
  });

  await section('existingComplaintCases', async () => {
    const complaint = (report.sections.incidentFields.casetypecode.options || []).find(o => /^complaint$/i.test(o.label || ''));
    const filter = complaint ? '&$filter=casetypecode eq ' + complaint.value : '';
    const columns = 'ticketnumber,createdon,followupby,casetypecode,caseorigincode,qdb_case_source,qdb_existing_customer,qdb_businessunit,qdb_contact_name,qdb_customer_name,qdb_customer_mobile_number,statuscode,_customerid_value,_qdb_department_value,_qdb_product_value,_qdb_assigned_to_user_value,_ownerid_value';
    const count = await get('/incidents?$select=incidentid&$top=1&$count=true' + filter);
    const cases = await get('/incidents?$select=' + columns + filter + '&$orderby=createdon desc&$top=40');
    return {
      complaintOption: complaint || null,
      complaintCount: count['@odata.count'],
      newest: cases.value.map(c => ({
        ticketnumber: c.ticketnumber, createdon: c.createdon, followupby: c.followupby,
        followupMinusCreatedHours: c.followupby ? Math.round((new Date(c.followupby) - new Date(c.createdon)) / 36e5) : null,
        origin: c['caseorigincode' + FORMATTED], source: c['qdb_case_source' + FORMATTED], existingCustomer: c['qdb_existing_customer' + FORMATTED],
        businessUnit: c['qdb_businessunit' + FORMATTED] || c['_qdb_businessunit_value' + FORMATTED] || null,
        department: c['_qdb_department_value' + FORMATTED] || null, product: c['_qdb_product_value' + FORMATTED] || null,
        assignedTo: c['_qdb_assigned_to_user_value' + FORMATTED] || null, owner: c['_ownerid_value' + FORMATTED] || null,
        status: c['statuscode' + FORMATTED],
        customerTable: c['_customerid_value' + LOOKUP_TABLE] || null,
        customerAccountName: c['_customerid_value' + LOOKUP_TABLE] === 'account' ? c['_customerid_value' + FORMATTED] : '(contact — name not exported)',
        hasContactName: Boolean(c.qdb_contact_name), hasCustomerName: Boolean(c.qdb_customer_name), hasMobile: Boolean(c.qdb_customer_mobile_number),
      })),
    };
  });

  await section('automation', async () => {
    const steps = await get("/sdkmessageprocessingsteps?$select=name,stage,mode,statecode,filteringattributes&$filter=statecode eq 0&$expand=sdkmessagefilterid($select=primaryobjecttypecode),sdkmessageid($select=name),plugintypeid($select=typename,assemblyname)");
    const workflows = await get("/workflows?$select=name,category,type,statecode,mode,triggeroncreate,triggeronupdateattributelist,scope&$filter=primaryentity eq 'incident' and type eq 1 and statecode eq 1");
    const slas = await get('/slas?$select=name,objecttypecode,statecode,isdefault,applicablefrom');
    const apis = await get("/customapis?$select=uniquename,boundentitylogicalname,isfunction").catch(() => ({ value: null }));
    return {
      pluginSteps: steps.value.filter(s => s.sdkmessagefilterid && s.sdkmessagefilterid.primaryobjecttypecode === 'incident')
        .filter(s => !/^Microsoft\./.test((s.plugintypeid && s.plugintypeid.assemblyname) || ''))
        .map(s => ({ message: s.sdkmessageid && s.sdkmessageid.name, stage: s.stage, mode: s.mode, type: s.plugintypeid && s.plugintypeid.typename, filter: s.filteringattributes })),
      processes: workflows.value.map(w => ({ name: w.name, category: w['category' + FORMATTED], mode: w['mode' + FORMATTED], onCreate: w.triggeroncreate, onUpdate: w.triggeronupdateattributelist })),
      slas: slas.value.map(s => ({ name: s.name, table: s.objecttypecode, state: s['statecode' + FORMATTED], isDefault: s.isdefault, applicableFrom: s.applicablefrom })),
      customApis: apis.value === null ? 'customapi table not present on this version' : apis.value.filter(a => /case|complaint|incident/i.test(a.uniquename + ' ' + (a.boundentitylogicalname || ''))).map(a => a.uniquename),
    };
  });

  await section('rolesWithCasePrivileges', async () => {
    const result = {};
    for (const privilege of ['prvReadIncident', 'prvCreateIncident', 'prvWriteIncident']) {
      const rows = await get("/privileges?$select=name&$filter=name eq '" + privilege + "'&$expand=roleprivileges_association($select=name)");
      const roles = rows.value[0] ? rows.value[0].roleprivileges_association.map(r => r.name) : [];
      result[privilege] = Array.from(new Set(roles)).sort();
    }
    return result;
  });

  const json = JSON.stringify(report, null, 2);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  link.download = 'case-management-inspection-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  console.log('[inspect] finished — ' + link.download + ' downloaded. Sections:', Object.keys(report.sections));
})();
