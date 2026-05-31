/**
 * Dataverse schema migration — Sprint 3 + Sprint 4
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  NEW TABLES                                                     │
 * │    TABLE 13  qdb_rule_template       — reusable rule templates  │
 * │    TABLE 14  qdb_fieldlabel          — per-locale label overrides│
 * │    TABLE 15  qdb_form_access_policy  — role-based RBAC per form │
 * │                                                                 │
 * │  NEW COLUMNS ON EXISTING TABLES                                 │
 * │    qdb_form_field.qdb_component_key                             │
 * │    qdb_form_validation_rule.qdb_custom_expression               │
 * │                                                                 │
 * │  NEW OPTION VALUES ON EXISTING OPTION SETS                      │
 * │    qdb_form_field.qdb_field_type        += custom (100000018)   │
 * │    qdb_form_validation_rule.qdb_rule_type += customExpression   │
 * │                                              (100000012)        │
 * │                                                                 │
 * │  NEW RELATIONSHIPS (create lookup attributes automatically)     │
 * │    qdb_rule_template  1:N  qdb_form_validation_rule             │
 * │    qdb_form_field     1:N  qdb_fieldlabel                       │
 * │    qdb_form_definition 1:N qdb_form_access_policy               │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * IDEMPOTENT — re-running skips steps that already exist.
 *
 * Prerequisites:
 *   - main seed script (seed-crm-metadata.ts) already run
 *   - solution QdbDynamicFormEngine exists in the target environment
 *
 * Required env vars:
 *   DATAVERSE_URL   — https://your-org.crm4.dynamics.com
 *   DATAVERSE_TOKEN — Bearer token from:
 *                     az account get-access-token \
 *                       --resource "https://your-org.crm4.dynamics.com/" \
 *                       --query accessToken -o tsv
 *
 * Run:
 *   npx ts-node scripts/migrate-sprint3-sprint4.ts
 */

// ── Bootstrap ──────────────────────────────────────────────────────────────

const DATAVERSE_URL = process.env['DATAVERSE_URL'];
const DATAVERSE_TOKEN = process.env['DATAVERSE_TOKEN'];
const SOLUTION = 'QdbDynamicFormEngine';
const API_VER = '9.2';
const LANG = 1033; // en-US

function assertEnv(): void {
  if (!DATAVERSE_URL) throw new Error('DATAVERSE_URL is required');
  if (!DATAVERSE_TOKEN) throw new Error('DATAVERSE_TOKEN is required');
}

// ── Metadata type helpers ──────────────────────────────────────────────────

interface DvLocalizedLabel {
  '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel';
  Label: string;
  LanguageCode: number;
}

interface DvLabel {
  '@odata.type': 'Microsoft.Dynamics.CRM.Label';
  LocalizedLabels: DvLocalizedLabel[];
}

interface DvRequiredLevel {
  '@odata.type': 'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty';
  Value: 'None' | 'ApplicationRequired' | 'SystemRequired' | 'Recommended';
}

function lbl(text: string): DvLabel {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [
      { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: LANG },
    ],
  };
}

function req(level: DvRequiredLevel['Value']): DvRequiredLevel {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty',
    Value: level,
  };
}

function opt(value: number, label: string) {
  return { Value: value, Label: lbl(label) };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${DATAVERSE_TOKEN}`,
    'Content-Type': 'application/json; charset=utf-8',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    'MSCRM.SolutionUniqueName': SOLUTION,
  };
}

const ALREADY_EXISTS_CODES = [
  '0x80044010', // DuplicateAttributeSchemaName
  '0x80048403', // EntityAlreadyExists
  '0x80048418', // RelationshipAlreadyExists
  'already exists',
  'AlreadyExists',
  'DuplicateAttribute',
];

function isAlreadyExists(text: string): boolean {
  return ALREADY_EXISTS_CODES.some((code) => text.includes(code));
}

async function postMetadata(path: string, body: unknown, label: string, attempt = 1): Promise<void> {
  const url = `${DATAVERSE_URL}/api/data/v${API_VER}/${path}`;
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (isAlreadyExists(text)) {
      console.log(`  [SKIP] ${label} — already exists`);
      return;
    }
    if (res.status === 503 && attempt < 4) {
      const delay = attempt * 8000;
      console.log(`  [WAIT] ${label} — 503 timeout, retrying in ${delay / 1000}s (attempt ${attempt}/3)…`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return postMetadata(path, body, label, attempt + 1);
    }
    throw new Error(`POST /${path} failed (HTTP ${res.status}): ${text}`);
  }

  console.log(`  [OK]   ${label}`);
}

async function insertOptionValue(
  entityLogicalName: string,
  attributeLogicalName: string,
  value: number,
  labelText: string,
  attempt = 1,
): Promise<void> {
  const url = `${DATAVERSE_URL}/api/data/v${API_VER}/InsertOptionValue`;
  const body = {
    AttributeLogicalName: attributeLogicalName,
    EntityLogicalName: entityLogicalName,
    Label: lbl(labelText),
    Value: value,
    SolutionUniqueName: SOLUTION,
  };

  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (isAlreadyExists(text)) {
      console.log(`  [SKIP] option ${value} (${labelText}) on ${entityLogicalName}.${attributeLogicalName} — already exists`);
      return;
    }
    if (res.status === 503 && attempt < 4) {
      const delay = attempt * 8000;
      console.log(`  [WAIT] option ${value} — 503 timeout, retrying in ${delay / 1000}s (attempt ${attempt}/3)…`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return insertOptionValue(entityLogicalName, attributeLogicalName, value, labelText, attempt + 1);
    }
    throw new Error(`InsertOptionValue ${entityLogicalName}.${attributeLogicalName}=${value} failed (HTTP ${res.status}): ${text}`);
  }

  console.log(`  [OK]   option ${value} (${labelText}) → ${entityLogicalName}.${attributeLogicalName}`);
}

async function publishAll(): Promise<void> {
  const url = `${DATAVERSE_URL}/api/data/v${API_VER}/PublishAllXml`;
  const res = await fetch(url, { method: 'POST', headers: headers(), body: '{}' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PublishAllXml failed (HTTP ${res.status}): ${text}`);
  }
  console.log('  [OK]   PublishAllXml — all customisations published');
}

function logSection(title: string): void {
  const line = '─'.repeat(Math.max(0, 62 - title.length));
  console.log(`\n── ${title} ${line}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 13 — qdb_rule_template
// ══════════════════════════════════════════════════════════════════════════════

async function createRuleTemplateEntity(): Promise<void> {
  logSection('TABLE 13  qdb_rule_template');

  await postMetadata(
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_rule_template',
      DisplayName: lbl('Rule Template'),
      DisplayCollectionName: lbl('Rule Templates'),
      Description: lbl('Reusable validation rule template — values are merged with individual field rules at runtime'),
      OwnershipType: 'OrganizationOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 250,
          DisplayName: lbl('Name'),
          Description: lbl('Unique human-readable name for this template (e.g. "Max 100 chars for address")'),
        },
        // ── Rule type ──────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
          SchemaName: 'qdb_rule_type',
          RequiredLevel: req('ApplicationRequired'),
          DisplayName: lbl('Rule Type'),
          Description: lbl('Validation logic this template provides. Must match the rule_type used on form fields.'),
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
            IsGlobal: false,
            OptionSetType: 'Picklist',
            Options: [
              opt(100000001, 'Required'),
              opt(100000002, 'Min Length'),
              opt(100000003, 'Max Length'),
              opt(100000004, 'Min Value'),
              opt(100000005, 'Max Value'),
              opt(100000006, 'Regex'),
              opt(100000007, 'Email'),
              opt(100000008, 'Phone'),
              opt(100000009, 'Date Before'),
              opt(100000010, 'Date After'),
              opt(100000011, 'Cross Field'),
              opt(100000012, 'Custom Expression'),
            ],
          },
        },
        // ── Error message ──────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_error_message',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 500,
          DisplayName: lbl('Error Message'),
          Description: lbl('Default user-facing message shown when this rule fails. Can be overridden on the individual field rule.'),
        },
        // ── Min / Max Length ───────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_min_length',
          RequiredLevel: req('None'),
          MinValue: 0,
          MaxValue: 100000,
          DisplayName: lbl('Min Length'),
          Description: lbl('Used when Rule Type = Min Length'),
        },
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_max_length',
          RequiredLevel: req('None'),
          MinValue: 0,
          MaxValue: 100000,
          DisplayName: lbl('Max Length'),
          Description: lbl('Used when Rule Type = Max Length'),
        },
        // ── Min / Max Value ────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
          SchemaName: 'qdb_min_value',
          RequiredLevel: req('None'),
          MinValue: -1000000000,
          MaxValue: 1000000000,
          Precision: 10,
          DisplayName: lbl('Min Value'),
          Description: lbl('Used when Rule Type = Min Value'),
        },
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
          SchemaName: 'qdb_max_value',
          RequiredLevel: req('None'),
          MinValue: -1000000000,
          MaxValue: 1000000000,
          Precision: 10,
          DisplayName: lbl('Max Value'),
          Description: lbl('Used when Rule Type = Max Value'),
        },
        // ── Regex pattern ──────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_regex_pattern',
          RequiredLevel: req('None'),
          MaxLength: 1000,
          DisplayName: lbl('Regex Pattern'),
          Description: lbl('ECMAScript-compatible regex without slashes. Used when Rule Type = Regex.'),
        },
        // ── Custom expression ──────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
          SchemaName: 'qdb_custom_expression',
          RequiredLevel: req('None'),
          MaxLength: 4000,
          DisplayName: lbl('Custom Expression'),
          Description: lbl('DSL expression evaluated by ExpressionEngine. Reference field values as {fieldSchemaName}. Used when Rule Type = Custom Expression.'),
        },
      ],
    },
    'qdb_rule_template entity',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 14 — qdb_fieldlabel
// ══════════════════════════════════════════════════════════════════════════════

async function createFieldLabelEntity(): Promise<void> {
  logSection('TABLE 14  qdb_fieldlabel');

  await postMetadata(
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_fieldlabel',
      DisplayName: lbl('Field Label'),
      DisplayCollectionName: lbl('Field Labels'),
      Description: lbl('Per-locale label override for a form field. When the API is called with Accept-Language, these values replace the default label/placeholder/tooltip.'),
      OwnershipType: 'OrganizationOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 350,
          DisplayName: lbl('Name'),
          Description: lbl('Reference name — convention: "{fieldSchemaName} ({locale})" e.g. "fullName (ar)"'),
        },
        // ── Locale ─────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_locale',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 20,
          DisplayName: lbl('Locale'),
          Description: lbl('BCP 47 locale tag. Examples: ar, ar-SA, fr, fr-FR. Matched against Accept-Language header primary tag.'),
        },
        // ── Translated label ───────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_label',
          RequiredLevel: req('None'),
          MaxLength: 250,
          DisplayName: lbl('Label'),
          Description: lbl('Translated field label. Replaces qdb_form_field.qdb_label for this locale.'),
        },
        // ── Translated placeholder ─────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_placeholder',
          RequiredLevel: req('None'),
          MaxLength: 250,
          DisplayName: lbl('Placeholder'),
          Description: lbl('Translated placeholder text. Replaces qdb_form_field.qdb_placeholder for this locale.'),
        },
        // ── Translated tooltip ─────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_tooltip',
          RequiredLevel: req('None'),
          MaxLength: 500,
          DisplayName: lbl('Tooltip'),
          Description: lbl('Translated tooltip / help text. Replaces qdb_form_field.qdb_tooltip for this locale.'),
        },
      ],
    },
    'qdb_fieldlabel entity',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 15 — qdb_form_access_policy
// ══════════════════════════════════════════════════════════════════════════════

async function createAccessPolicyEntity(): Promise<void> {
  logSection('TABLE 15  qdb_form_access_policy');

  await postMetadata(
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_form_access_policy',
      DisplayName: lbl('Form Access Policy'),
      DisplayCollectionName: lbl('Form Access Policies'),
      Description: lbl('Grants an Azure AD app role the right to view, draft, or submit a specific form. Empty policy list = open access.'),
      OwnershipType: 'OrganizationOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 350,
          DisplayName: lbl('Name'),
          Description: lbl('Reference name — convention: "{formCode} — {roleId} — {accessType}" e.g. "loan-application — LoanOfficer — submit"'),
        },
        // ── Role ID ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_role_id',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 250,
          DisplayName: lbl('Role ID'),
          Description: lbl('Azure AD app role name (from the roles[] JWT claim) that this policy grants access to. Example: "LoanOfficer", "BranchManager".'),
        },
        // ── Access type ────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
          SchemaName: 'qdb_access_type',
          RequiredLevel: req('ApplicationRequired'),
          DisplayName: lbl('Access Type'),
          Description: lbl('The operation this policy permits. view = metadata + read data, submit = POST submit, draft = POST draft.'),
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
            IsGlobal: false,
            OptionSetType: 'Picklist',
            Options: [
              opt(100000001, 'View'),
              opt(100000002, 'Submit'),
              opt(100000003, 'Draft'),
            ],
          },
        },
      ],
    },
    'qdb_form_access_policy entity',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW COLUMNS ON EXISTING TABLES
// ══════════════════════════════════════════════════════════════════════════════

async function addComponentKeyToFormField(): Promise<void> {
  logSection('New column  qdb_form_field.qdb_component_key');

  await postMetadata(
    `EntityDefinitions(LogicalName='qdb_form_field')/Attributes`,
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_component_key',
      RequiredLevel: req('None'),
      MaxLength: 250,
      DisplayName: lbl('Component Key'),
      Description: lbl('ComponentRegistry key used when qdb_field_type = custom. The frontend resolves this key to a registered React component at runtime.'),
    },
    'qdb_form_field.qdb_component_key (String 250)',
  );
}

async function addCustomExpressionToValidationRule(): Promise<void> {
  logSection('New column  qdb_form_validation_rule.qdb_custom_expression');

  await postMetadata(
    `EntityDefinitions(LogicalName='qdb_form_validation_rule')/Attributes`,
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_custom_expression',
      RequiredLevel: req('None'),
      MaxLength: 4000,
      DisplayName: lbl('Custom Expression'),
      Description: lbl('DSL expression evaluated by ExpressionEngine. Reference field values as {fieldSchemaName}. Used when qdb_rule_type = customExpression (100000012). Rule-level value overrides qdb_rule_template.qdb_custom_expression.'),
    },
    'qdb_form_validation_rule.qdb_custom_expression (Memo)',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW OPTION VALUES ON EXISTING OPTION SETS
// ══════════════════════════════════════════════════════════════════════════════

async function addCustomFieldTypeOption(): Promise<void> {
  logSection('New option  qdb_form_field.qdb_field_type = custom (100000018)');
  await insertOptionValue('qdb_form_field', 'qdb_field_type', 100000018, 'Custom');
}

async function addCustomExpressionRuleTypeOption(): Promise<void> {
  logSection('New option  qdb_form_validation_rule.qdb_rule_type = customExpression (100000012)');
  await insertOptionValue('qdb_form_validation_rule', 'qdb_rule_type', 100000012, 'Custom Expression');
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIPS (create lookup attributes automatically)
// ══════════════════════════════════════════════════════════════════════════════

async function createRuleTemplateLookupOnValidationRule(): Promise<void> {
  logSection('Relationship  qdb_rule_template 1:N qdb_form_validation_rule');

  // Cascade = RemoveLink: deleting a template nulls out the lookup on the rule,
  // it does NOT delete the validation rule itself.
  await postMetadata(
    'RelationshipDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: 'qdb_rule_template_form_validation_rule',
      ReferencedEntity: 'qdb_rule_template',
      ReferencingEntity: 'qdb_form_validation_rule',
      ReferencedAttribute: 'qdb_rule_templateid',
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: 'qdb_rule_template_id',
        RequiredLevel: req('None'),
        DisplayName: lbl('Rule Template'),
        Description: lbl('Optional reference to a reusable rule template. Template values are used as defaults; rule-level values take precedence.'),
      },
      AssociatedMenuConfiguration: {
        Behavior: 'DoNotDisplay',
        Group: 'Details',
        Order: null,
        IsCustomizable: true,
      },
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: 'RemoveLink',
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade',
      },
    },
    'qdb_rule_template → qdb_form_validation_rule (lookup qdb_rule_template_id, RemoveLink)',
  );
}

async function createFieldLabelLookupOnFieldLabel(): Promise<void> {
  logSection('Relationship  qdb_form_field 1:N qdb_fieldlabel');

  // Cascade = Cascade: deleting a field deletes all its translations.
  await postMetadata(
    'RelationshipDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: 'qdb_form_field_fieldlabel',
      ReferencedEntity: 'qdb_form_field',
      ReferencingEntity: 'qdb_fieldlabel',
      ReferencedAttribute: 'qdb_form_fieldid',
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: 'qdb_form_field_id',
        RequiredLevel: req('ApplicationRequired'),
        DisplayName: lbl('Form Field'),
        Description: lbl('The field whose label this record overrides for a specific locale.'),
      },
      AssociatedMenuConfiguration: {
        Behavior: 'DoNotDisplay',
        Group: 'Details',
        Order: null,
        IsCustomizable: true,
      },
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: 'Cascade',
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade',
      },
    },
    'qdb_form_field → qdb_fieldlabel (lookup qdb_form_field_id, Cascade delete)',
  );
}

async function createAccessPolicyLookupOnAccessPolicy(): Promise<void> {
  logSection('Relationship  qdb_form_definition 1:N qdb_form_access_policy');

  // Cascade = Cascade: deleting a form definition deletes all its access policies.
  await postMetadata(
    'RelationshipDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: 'qdb_form_definition_form_access_policy',
      ReferencedEntity: 'qdb_form_definition',
      ReferencingEntity: 'qdb_form_access_policy',
      ReferencedAttribute: 'qdb_form_definitionid',
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        SchemaName: 'qdb_form_definition_id',
        RequiredLevel: req('ApplicationRequired'),
        DisplayName: lbl('Form Definition'),
        Description: lbl('The form this access policy applies to.'),
      },
      AssociatedMenuConfiguration: {
        Behavior: 'DoNotDisplay',
        Group: 'Details',
        Order: null,
        IsCustomizable: true,
      },
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: 'Cascade',
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade',
      },
    },
    'qdb_form_definition → qdb_form_access_policy (lookup qdb_form_definition_id, Cascade delete)',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  assertEnv();

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  QDB Dynamic Form Engine — Sprint 3 + Sprint 4 Migration     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`  Environment : ${DATAVERSE_URL}`);
  console.log(`  Solution    : ${SOLUTION}`);

  // ── Step 1: Create new entities ──────────────────────────────────
  await createRuleTemplateEntity();
  await createFieldLabelEntity();
  await createAccessPolicyEntity();

  // ── Step 2: Add new columns to existing entities ─────────────────
  await addComponentKeyToFormField();
  await addCustomExpressionToValidationRule();

  // ── Step 3: Add new option values to existing option sets ─────────
  // These run AFTER entity creation so the entities exist in the solution.
  await addCustomFieldTypeOption();
  await addCustomExpressionRuleTypeOption();

  // ── Step 4: Create relationships (creates lookup attributes) ──────
  // Order matters: qdb_rule_template must exist before its relationship.
  await createRuleTemplateLookupOnValidationRule();
  await createFieldLabelLookupOnFieldLabel();
  await createAccessPolicyLookupOnAccessPolicy();

  // ── Step 5: Publish ───────────────────────────────────────────────
  logSection('Publish all customisations');
  await publishAll();

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Migration complete.                                          ║');
  console.log('║                                                               ║');
  console.log('║  Next steps:                                                  ║');
  console.log('║  1. Re-run seed-crm-metadata.ts to seed test data            ║');
  console.log('║  2. Seed at least one qdb_rule_template record for Sprint 3  ║');
  console.log('║  3. Seed at least one qdb_fieldlabel (ar) record for Sprint 4║');
  console.log('║  4. Seed at least one qdb_form_access_policy for Sprint 4    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

main().catch((err: unknown) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
