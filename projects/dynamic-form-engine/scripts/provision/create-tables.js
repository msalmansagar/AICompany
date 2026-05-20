'use strict';

const msal = require('@azure/msal-node');
const fetch = require('node-fetch');

const TENANT_ID   = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID   = '51f81489-12ee-4a9e-aaae-a2591f45987d'; // public CRM client
const DATAVERSE   = 'https://org5869857f.crm4.dynamics.com';
const API         = `${DATAVERSE}/api/data/v9.2`;
const LANG        = 1033;

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getToken() {
  const pca = new msal.PublicClientApplication({
    auth: { clientId: CLIENT_ID, authority: `https://login.microsoftonline.com/${TENANT_ID}` }
  });
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [`${DATAVERSE}/.default`],
    deviceCodeCallback: (r) => console.log('\n' + r.message + '\n')
  });
  return result.accessToken;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Metadata helpers ─────────────────────────────────────────────────────────

const lbl = (text) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG }]
});

const req = (level) => ({ Value: level, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' });

function str(schemaName, display, maxLen, required, isPrimary = false) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    MaxLength: maxLen, Format: 'Text', IsPrimaryName: isPrimary
  };
}

function memo(schemaName, display, maxLen) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('None'),
    Format: 'TextArea', MaxLength: maxLen || 1048576
  };
}

function int(schemaName, display, required, min = -2147483648, max = 2147483647) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    Format: 'None', MinValue: min, MaxValue: max
  };
}

function bool(schemaName, display, defaultVal, trueLabel = 'Yes', falseLabel = 'No') {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('ApplicationRequired'),
    DefaultValue: defaultVal,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
      TrueOption: { Value: 1, Label: lbl(trueLabel) },
      FalseOption: { Value: 0, Label: lbl(falseLabel) }
    }
  };
}

function picklist(schemaName, display, options, defaultValue, required = true) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    DefaultFormValue: defaultValue,
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false, OptionSetType: 'Picklist',
      Options: options.map(([v, l]) => ({ Value: v, Label: lbl(l) }))
    }
  };
}

function dt(schemaName, display, required = true) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req(required ? 'ApplicationRequired' : 'None'),
    Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' }
  };
}

function decimal(schemaName, display, precision = 2) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
    SchemaName: schemaName, LogicalName: schemaName.toLowerCase(),
    DisplayName: lbl(display), RequiredLevel: req('None'),
    Precision: precision, MinValue: -100000000000, MaxValue: 100000000000
  };
}

// ─── Entity builders ──────────────────────────────────────────────────────────

function entity(schemaName, displayName, pluralName, primaryAttr, attributes) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: schemaName,
    DisplayName: lbl(displayName),
    DisplayCollectionName: lbl(pluralName),
    OwnershipType: 'OrganizationOwned',
    IsActivity: false, HasNotes: false, HasActivities: false,
    PrimaryNameAttribute: primaryAttr.toLowerCase(),
    Attributes: attributes
  };
}

const ENTITIES = [
  entity('qdb_form_definition', 'Form Definition', 'Form Definitions', 'qdb_form_code', [
    str('qdb_form_code',                         'Form Code',                       100,  true,  true),
    str('qdb_title',                             'Title',                           250,  true),
    memo('qdb_description',                      'Description',                     2000),
    picklist('qdb_status', 'Status', [
      [100000000, 'Draft'], [100000001, 'Active'], [100000002, 'Inactive'], [100000003, 'Archived']
    ], 100000000),
    int('qdb_version',                           'Version',                         true,  1, 9999),
    bool('qdb_allow_save_draft',                 'Allow Save Draft',                true),
    int('qdb_draft_expiry_days',                 'Draft Expiry Days',               false, 1, 3650),
    str('qdb_power_automate_flow_id',            'Power Automate Flow ID',          250,  false),
    memo('qdb_confirmation_message',             'Confirmation Message',            2000),
    str('qdb_confirmation_record_ref_attribute', 'Confirmation Record Ref Attr',    100,  false),
    str('qdb_access_group_id',                   'Access Group ID',                 250,  false)
  ]),

  entity('qdb_form_tab', 'Form Tab', 'Form Tabs', 'qdb_label', [
    str('qdb_label',                            'Label',                            250,  true,  true),
    str('qdb_icon_name',                        'Icon Name',                        100,  false),
    int('qdb_display_order',                    'Display Order',                    true,  0, 9999),
    bool('qdb_is_visible',                      'Is Visible',                       true),
    bool('qdb_requires_previous_tab_complete',  'Requires Previous Tab Complete',   false)
  ]),

  entity('qdb_form_section', 'Form Section', 'Form Sections', 'qdb_label', [
    str('qdb_label',                    'Label',                250,  true,  true),
    str('qdb_description',              'Description',          500,  false),
    int('qdb_display_order',            'Display Order',        true,  0, 9999),
    picklist('qdb_columns', 'Columns', [
      [100000001, '1 Column'], [100000002, '2 Columns'], [100000003, '3 Columns'], [100000004, '4 Columns']
    ], 100000002),
    bool('qdb_is_collapsible',          'Is Collapsible',       false),
    bool('qdb_is_collapsed_by_default', 'Collapsed by Default', false),
    bool('qdb_is_visible',              'Is Visible',           true)
  ]),

  entity('qdb_form_field', 'Form Field', 'Form Fields', 'qdb_schema_name', [
    str('qdb_schema_name',    'Schema Name',   100, true, true),
    picklist('qdb_field_type', 'Field Type', [
      [100000001, 'text'],        [100000002, 'textarea'],     [100000003, 'number'],
      [100000004, 'date'],        [100000005, 'datetime'],     [100000006, 'dropdown'],
      [100000007, 'multiselect'], [100000008, 'lookup'],       [100000009, 'checkbox'],
      [100000010, 'radio'],       [100000011, 'currency'],     [100000012, 'decimal'],
      [100000013, 'email'],       [100000014, 'phone'],        [100000015, 'file'],
      [100000016, 'repeatingGrid'], [100000017, 'richText']
    ], 100000001),
    str('qdb_label',          'Label',         250, true),
    str('qdb_placeholder',    'Placeholder',   250, false),
    str('qdb_tooltip',        'Tooltip',       500, false),
    str('qdb_default_value',  'Default Value', 1000, false),
    int('qdb_display_order',  'Display Order', true, 0, 9999),
    picklist('qdb_column_span', 'Column Span', [
      [100000001, '1'], [100000002, '2'], [100000003, '3'], [100000004, '4']
    ], 100000001),
    bool('qdb_is_required',   'Is Required',   false),
    bool('qdb_is_readonly',   'Is Readonly',   false),
    bool('qdb_is_hidden',     'Is Hidden',     false),
    str('qdb_currency_code',  'Currency Code', 10,   false),
    int('qdb_decimal_places', 'Decimal Places',false, 0, 10),
    int('qdb_max_rows',       'Max Rows',      false, 1, 9999)
  ]),

  entity('qdb_form_validation_rule', 'Form Validation Rule', 'Form Validation Rules', 'qdb_error_message', [
    str('qdb_error_message',      'Error Message',      500, true,  true),
    picklist('qdb_rule_type', 'Rule Type', [
      [100000001, 'required'],   [100000002, 'minLength'], [100000003, 'maxLength'],
      [100000004, 'minValue'],   [100000005, 'maxValue'],  [100000006, 'regex'],
      [100000007, 'email'],      [100000008, 'phone'],     [100000009, 'dateBefore'],
      [100000010, 'dateAfter'],  [100000011, 'crossField']
    ], 100000001),
    int('qdb_min_length',         'Min Length',          false, 0, 9999),
    int('qdb_max_length',         'Max Length',          false, 0, 9999),
    decimal('qdb_min_value',      'Min Value'),
    decimal('qdb_max_value',      'Max Value'),
    str('qdb_regex_pattern',      'Regex Pattern',       500, false),
    str('qdb_compare_to_value',   'Compare To Value',    250, false),
    int('qdb_priority',           'Priority',            true, 1, 99999),
    bool('qdb_is_active',         'Is Active',           true)
  ]),

  entity('qdb_form_business_rule', 'Form Business Rule', 'Form Business Rules', 'qdb_name', [
    str('qdb_name',             'Name',              250, true, true),
    str('qdb_description',      'Description',       500, false),
    memo('qdb_conditions_json', 'Conditions JSON',   null),
    picklist('qdb_conditions_logic', 'Conditions Logic', [
      [100000000, 'AND'], [100000001, 'OR']
    ], 100000000),
    picklist('qdb_action', 'Action', [
      [100000001, 'showField'],     [100000002, 'hideField'],
      [100000003, 'showSection'],   [100000004, 'hideSection'],
      [100000005, 'showTab'],       [100000006, 'hideTab'],
      [100000007, 'makeRequired'],  [100000008, 'makeOptional'],
      [100000009, 'makeReadonly'],  [100000010, 'makeEditable'],
      [100000011, 'setValue'],      [100000012, 'clearValue'],
      [100000013, 'calculateValue'],[100000014, 'filterOptions'],
      [100000015, 'filterLookup']
    ], 100000001),
    str('qdb_action_value', 'Action Value', 500, false),
    int('qdb_priority',     'Priority',     true, 1, 99999),
    bool('qdb_is_active',   'Is Active',    true)
  ]),

  entity('qdb_form_option_value', 'Form Option Value', 'Form Option Values', 'qdb_label', [
    str('qdb_label',               'Label',               250, true, true),
    str('qdb_value',               'Value',               250, true),
    int('qdb_display_order',       'Display Order',       true, 0, 9999),
    bool('qdb_is_default',         'Is Default',          false),
    str('qdb_parent_option_value', 'Parent Option Value', 250, false),
    bool('qdb_is_active',          'Is Active',           true)
  ]),

  entity('qdb_form_lookup_config', 'Form Lookup Config', 'Form Lookup Configs', 'qdb_entity_logical_name', [
    str('qdb_entity_logical_name',         'Entity Logical Name',          100,  true, true),
    str('qdb_display_attribute',           'Display Attribute',            100,  true),
    str('qdb_value_attribute',             'Value Attribute',              100,  true),
    str('qdb_filter_expression',           'Filter Expression',            1000, false),
    int('qdb_search_min_chars',            'Search Min Chars',             true,  1, 10),
    int('qdb_max_results',                 'Max Results',                  true,  1, 50),
    str('qdb_depends_on_filter_template',  'Depends On Filter Template',   1000, false)
  ]),

  entity('qdb_form_submission_mapping', 'Form Submission Mapping', 'Form Submission Mappings', 'qdb_target_attribute_logical_name', [
    str('qdb_target_attribute_logical_name', 'Target Attribute Logical Name', 100,  true, true),
    str('qdb_target_entity_logical_name',    'Target Entity Logical Name',    100,  true),
    bool('qdb_is_child_entity',              'Is Child Entity',               false),
    str('qdb_child_entity_relationship_name','Child Entity Relationship Name',100,  false),
    str('qdb_transform_expression',          'Transform Expression',          500,  false),
    bool('qdb_is_active',                    'Is Active',                     true)
  ]),

  entity('qdb_form_version', 'Form Version', 'Form Versions', 'qdb_published_by', [
    str('qdb_published_by',            'Published By',            250,  true, true),
    int('qdb_version_number',          'Version Number',          true,  1, 9999),
    dt('qdb_published_at',             'Published At'),
    memo('qdb_change_notes',           'Change Notes',            1000),
    bool('qdb_is_current_version',     'Is Current Version',      false),
    memo('qdb_metadata_snapshot_json', 'Metadata Snapshot JSON',  null)
  ]),

  entity('qdb_form_submission_log', 'Form Submission Log', 'Form Submission Logs', 'qdb_form_code', [
    str('qdb_form_code',                   'Form Code',                   100,  true, true),
    str('qdb_user_id',                     'User ID',                     250,  true),
    str('qdb_user_display_name',           'User Display Name',           250,  true),
    dt('qdb_submitted_at',                 'Submitted At'),
    str('qdb_parent_record_id',            'Parent Record ID',            250,  false),
    str('qdb_parent_entity_logical_name',  'Parent Entity Logical Name',  100,  false),
    picklist('qdb_status', 'Status', [
      [100000000, 'Success'], [100000001, 'Failed'], [100000002, 'Partial']
    ], 100000000),
    memo('qdb_error_details', 'Error Details', 4000)
  ]),

  entity('qdb_form_audit_log', 'Form Audit Log', 'Form Audit Logs', 'qdb_event_type', [
    str('qdb_event_type',           'Event Type',           100, true,  true),
    str('qdb_form_definition_name', 'Form Definition Name', 250, false),
    str('qdb_user_id',              'User ID',              250, true),
    str('qdb_user_display_name',    'User Display Name',    250, true),
    dt('qdb_timestamp_utc',         'Timestamp UTC'),
    str('qdb_record_id',            'Record ID',            250, false),
    memo('qdb_changed_data_json',   'Changed Data JSON',    null)
  ])
];

// ─── Relationship builders ────────────────────────────────────────────────────

function cascade(deleteType = 'Cascade') {
  // NoCascade is invalid for Delete on OrganizationOwned entities — use RemoveLink instead
  const del = deleteType === 'NoCascade' ? 'RemoveLink' : deleteType;
  return { Assign: 'NoCascade', Delete: del, Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade' };
}

function rel(schemaName, parent, child, lookupSchema, lookupDisplay, deleteType = 'Cascade', required = true, referencingNavProp = null, referencedNavProp = null) {
  const r = {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName,
    ReferencedEntity: parent,
    ReferencingEntity: child,
    CascadeConfiguration: cascade(deleteType),
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: lookupSchema,
      DisplayName: lbl(lookupDisplay),
      RequiredLevel: req(required ? 'ApplicationRequired' : 'None')
    }
  };
  if (referencingNavProp) r.ReferencingEntityNavigationPropertyName = referencingNavProp;
  if (referencedNavProp)  r.ReferencedEntityNavigationPropertyName  = referencedNavProp;
  return r;
}

const RELATIONSHIPS = [
  rel('qdb_formdef_tab',            'qdb_form_definition', 'qdb_form_tab',               'qdb_form_definition_id', 'Form Definition'),
  rel('qdb_formtab_section',        'qdb_form_tab',        'qdb_form_section',            'qdb_form_tab_id',        'Form Tab'),
  rel('qdb_formsection_field',      'qdb_form_section',    'qdb_form_field',              'qdb_form_section_id',    'Form Section'),
  rel('qdb_formfield_self',         'qdb_form_field',      'qdb_form_field',              'qdb_parent_field_id',    'Parent Field',   'NoCascade', false, 'qdb_parent_field_id', 'qdb_form_field_children'),
  rel('qdb_formfield_valrule',      'qdb_form_field',      'qdb_form_validation_rule',    'qdb_form_field_id',      'Form Field'),
  rel('qdb_formfield_cmpvalrule',   'qdb_form_field',      'qdb_form_validation_rule',    'qdb_compare_to_field_id','Compare To Field','NoCascade', false, 'qdb_compare_to_field_id'),
  rel('qdb_formfield_optionval',    'qdb_form_field',      'qdb_form_option_value',       'qdb_form_field_id',      'Form Field'),
  rel('qdb_formfield_lookupconf',   'qdb_form_field',      'qdb_form_lookup_config',      'qdb_form_field_id',      'Form Field'),
  rel('qdb_formfield_depsonfield',  'qdb_form_field',      'qdb_form_lookup_config',      'qdb_depends_on_field_id','Depends On Field','NoCascade', false, 'qdb_depends_on_field_id'),
  rel('qdb_formdef_bizrule',        'qdb_form_definition', 'qdb_form_business_rule',      'qdb_form_definition_id', 'Form Definition','NoCascade'),
  rel('qdb_formfield_tgtbizrule',   'qdb_form_field',      'qdb_form_business_rule',      'qdb_target_field_id',    'Target Field',   'NoCascade', false),
  rel('qdb_formsection_tgtbizrule', 'qdb_form_section',    'qdb_form_business_rule',      'qdb_target_section_id',  'Target Section', 'NoCascade', false),
  rel('qdb_formtab_tgtbizrule',     'qdb_form_tab',        'qdb_form_business_rule',      'qdb_target_tab_id',      'Target Tab',     'NoCascade', false),
  rel('qdb_formdef_submap',         'qdb_form_definition', 'qdb_form_submission_mapping', 'qdb_form_definition_id', 'Form Definition'),
  rel('qdb_formfield_submap',       'qdb_form_field',      'qdb_form_submission_mapping', 'qdb_form_field_id',      'Form Field',     'NoCascade', false),
  rel('qdb_formdef_version',        'qdb_form_definition', 'qdb_form_version',            'qdb_form_definition_id', 'Form Definition','NoCascade'),
  rel('qdb_formdef_sublog',         'qdb_form_definition', 'qdb_form_submission_log',     'qdb_form_definition_id', 'Form Definition','NoCascade', false),
  rel('qdb_formdef_auditlog',       'qdb_form_definition', 'qdb_form_audit_log',          'qdb_form_definition_id', 'Form Definition','NoCascade', false)
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function entityExists(token, schemaName) {
  try {
    const r = await api(token, 'GET', `/EntityDefinitions?$filter=SchemaName eq '${schemaName}'&$select=SchemaName`);
    return r.value && r.value.length > 0;
  } catch { return false; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  QDB Dynamic Form Engine — Dataverse Table Provisioner');
  console.log('═══════════════════════════════════════════════════════\n');

  const token = await getToken();
  console.log('✓ Authenticated\n');

  // ── Step 1: Create entities ──
  console.log('─── Step 1: Creating Tables ───────────────────────────');
  let entityPass = 0, entityFail = 0;

  for (const def of ENTITIES) {
    const name = def.SchemaName;
    process.stdout.write(`  ${name}... `);
    try {
      if (await entityExists(token, name)) {
        console.log('already exists — skipped');
      } else {
        await api(token, 'POST', '/EntityDefinitions', def);
        console.log('✓ created');
        entityPass++;
        await sleep(500); // brief pause to let Dataverse settle
      }
    } catch (e) {
      console.log(`✗ FAILED\n    ${e.message.slice(0, 300)}`);
      entityFail++;
    }
  }

  // ── Step 2: Pause for Dataverse to publish all entities ──
  process.stdout.write('\nWaiting 60 s for Dataverse to finish publishing entities...');
  await sleep(60000);
  console.log(' done\n');

  // ── Step 3: Create relationships (with retry) ──
  console.log('─── Step 2: Creating Relationships ────────────────────');
  let relPass = 0, relFail = 0;

  for (const r of RELATIONSHIPS) {
    process.stdout.write(`  ${r.SchemaName}... `);
    let succeeded = false;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await api(token, 'POST', '/RelationshipDefinitions', r);
        console.log('✓');
        relPass++;
        succeeded = true;
        await sleep(2000);
        break;
      } catch (e) {
        const msg = e.message;
        if (msg.includes('already exists') || msg.includes('0x80048404') ||
            msg.includes('duplicate') || msg.includes('0x80072551') ||
            msg.includes('not unique')) {
          console.log('already exists — skipped');
          succeeded = true;
          break;
        }
        const isTransient = msg.includes('ENOTFOUND') || msg.includes('ECONNRESET') ||
                            msg.includes('0x80044151') || msg.includes('0x80071151') ||
                            msg.includes('timeout') || msg.includes('429');
        if (isTransient && attempt < 4) {
          const delay = attempt * 15000;
          process.stdout.write(`retrying in ${delay / 1000}s... `);
          await sleep(delay);
        } else {
          console.log(`✗ FAILED (attempt ${attempt})\n    ${msg.slice(0, 300)}`);
          relFail++;
        }
      }  // end catch
    }    // end attempt loop
  }      // end relationship loop

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log(`  Tables     : ${entityPass} created, ${entityFail} failed`);
  console.log(`  Relationships: ${relPass} created, ${relFail} failed`);
  if (entityFail === 0 && relFail === 0) {
    console.log('\n  All done. Publish the customizations in Dataverse to activate the tables.');
    console.log('  Settings → Customizations → Publish All Customizations');
  } else {
    console.log('\n  Some steps failed. Review errors above and re-run — the script is idempotent.');
  }
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
