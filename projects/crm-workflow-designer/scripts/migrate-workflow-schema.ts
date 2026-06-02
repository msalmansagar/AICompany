/**
 * Dataverse schema migration — CRM Visual Workflow Designer
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TABLES CREATED                                                 │
 * │    TABLE 1  qdb_work_item_record_type  — workflow process       │
 * │    TABLE 2  qdb_work_item_steps        — workflow steps         │
 * │    TABLE 3  qdb_outcome                — step outcomes          │
 * │    TABLE 4  qdb_outcomeworktasks       — outcome routes         │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * IDEMPOTENT — re-running skips any component that already exists.
 *
 * Auth: service principal (client credentials flow)
 *   Required env vars:
 *     AZURE_TENANT_ID     — d79e793c-f6de-4204-8508-7980a63df957
 *     AZURE_CLIENT_ID     — 08e80e93-0bab-45ef-8372-2e554fa9af9b
 *     AZURE_CLIENT_SECRET — <secret value — never hardcode>
 *
 *   Optional overrides:
 *     CRM_ORG_URL   — override target org (default: https://org5869857f.crm4.dynamics.com)
 *
 * Run:
 *   npx ts-node scripts/migrate-workflow-schema.ts
 */

// Make this file a module so top-level declarations do not collide with other
// scripts when TypeScript compiles all scripts/** files together.
export {};

// ── Environment ────────────────────────────────────────────────────────────────

const TENANT_ID = process.env['AZURE_TENANT_ID'] ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = process.env['AZURE_CLIENT_ID'] ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env['AZURE_CLIENT_SECRET'];
const ORG_URL = process.env['CRM_ORG_URL'] ?? 'https://org5869857f.crm4.dynamics.com';

const SOLUTION = 'QdbWorkflowDesigner';
const API_VER = '9.2';
const LANG = 1033; // en-US

// ── Bootstrap ──────────────────────────────────────────────────────────────────

function assertEnvironment(): void {
  if (!CLIENT_SECRET) {
    throw new Error(
      'AZURE_CLIENT_SECRET environment variable is required.\n' +
        'Set it before running:\n' +
        '  $env:AZURE_CLIENT_SECRET="<your-secret>"  (PowerShell)\n' +
        '  export AZURE_CLIENT_SECRET="<your-secret>"  (bash)',
    );
  }
}

// ── Token acquisition ──────────────────────────────────────────────────────────

interface TokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
}

async function acquireServicePrincipalToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const scope = `${ORG_URL}/.default`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET!,
    scope,
  });

  console.log('  Acquiring service principal token…');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token acquisition failed (HTTP ${res.status}): ${text}`);
  }

  const data = (await res.json()) as TokenResponse;
  console.log('  Token acquired successfully.');
  return data.access_token;
}

// ── Metadata type helpers ──────────────────────────────────────────────────────

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
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
        Label: text,
        LanguageCode: LANG,
      },
    ],
  };
}

function req(level: DvRequiredLevel['Value']): DvRequiredLevel {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty',
    Value: level,
  };
}

function opt(value: number, label: string): { Value: number; Label: DvLabel } {
  return { Value: value, Label: lbl(label) };
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    'MSCRM.SolutionUniqueName': SOLUTION,
  };
}

// Codes that signal the component already exists — safe to skip.
const ALREADY_EXISTS_CODES = [
  '0x80044010', // DuplicateAttributeSchemaName
  '0x80048403', // EntityAlreadyExists
  '0x80048418', // RelationshipAlreadyExists
  'already exists',
  'AlreadyExists',
  'DuplicateAttribute',
];

function isAlreadyExistsError(responseText: string): boolean {
  return ALREADY_EXISTS_CODES.some((code) => responseText.includes(code));
}

async function postMetadata(
  token: string,
  path: string,
  body: unknown,
  label: string,
  attempt = 1,
): Promise<void> {
  const url = `${ORG_URL}/api/data/v${API_VER}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');

    if (isAlreadyExistsError(text)) {
      console.log(`  [SKIP] ${label} — already exists`);
      return;
    }

    if (res.status === 503 && attempt < 4) {
      const delayMs = attempt * 8_000;
      console.log(
        `  [WAIT] ${label} — 503 Service Unavailable, retrying in ${delayMs / 1_000}s` +
          ` (attempt ${attempt}/3)…`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return postMetadata(token, path, body, label, attempt + 1);
    }

    throw new Error(`POST /${path} failed (HTTP ${res.status}): ${text}`);
  }

  console.log(`  [OK]   ${label}`);
}

async function entityExists(token: string, logicalName: string): Promise<boolean> {
  const url =
    `${ORG_URL}/api/data/v${API_VER}/EntityDefinitions` +
    `?$filter=LogicalName eq '${logicalName}'&$select=LogicalName`;

  const res = await fetch(url, { headers: buildHeaders(token) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EntityDefinitions check failed (HTTP ${res.status}): ${text}`);
  }

  const data = (await res.json()) as { value: unknown[] };
  return data.value.length > 0;
}

async function publishAll(token: string): Promise<void> {
  const url = `${ORG_URL}/api/data/v${API_VER}/PublishAllXml`;
  const res = await fetch(url, { method: 'POST', headers: buildHeaders(token), body: '{}' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PublishAllXml failed (HTTP ${res.status}): ${text}`);
  }

  console.log('  [OK]   PublishAllXml — all customisations published');
}

function logSection(title: string): void {
  const lineLength = Math.max(0, 62 - title.length);
  const line = '─'.repeat(lineLength);
  console.log(`\n── ${title} ${line}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 1 — qdb_work_item_record_type  (Process / Workflow definition)
// ══════════════════════════════════════════════════════════════════════════════

async function createWorkItemRecordTypeEntity(token: string): Promise<void> {
  logSection('TABLE 1  qdb_work_item_record_type');

  const exists = await entityExists(token, 'qdb_work_item_record_type');
  if (exists) {
    console.log('  [SKIP] Entity qdb_work_item_record_type — already exists');
    return;
  }

  await postMetadata(
    token,
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_work_item_record_type',
      DisplayName: lbl('Process'),
      DisplayCollectionName: lbl('Processes'),
      Description: lbl(
        'Workflow process definition — top-level container for a CRM workflow design.' +
          ' Holds version, publication state, and snapshot of the full workflow graph.',
      ),
      OwnershipType: 'UserOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 200,
          DisplayName: lbl('Name'),
          Description: lbl('Human-readable name of the workflow process.'),
        },
        // ── Target entity logical name ─────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_recordentity',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Record Entity'),
          Description: lbl('Logical name of the primary CRM entity this workflow operates on (e.g. opportunity, account).'),
        },
        // ── Regarding field ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_regardingfield',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Regarding Field'),
          Description: lbl('Schema name of the attribute on the record entity that links to the parent entity.'),
        },
        // ── Parent entity ──────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_parententity',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Parent Entity'),
          Description: lbl('Logical name of the parent entity in a hierarchical workflow structure.'),
        },
        // ── Version major ──────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_version_major',
          RequiredLevel: req('None'),
          DefaultValue: 1,
          MinValue: 0,
          MaxValue: 2_147_483_647,
          DisplayName: lbl('Version Major'),
          Description: lbl('Major version number. Incremented on breaking changes to the workflow structure.'),
        },
        // ── Version minor ──────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_version_minor',
          RequiredLevel: req('None'),
          DefaultValue: 0,
          MinValue: 0,
          MaxValue: 2_147_483_647,
          DisplayName: lbl('Version Minor'),
          Description: lbl('Minor version number. Incremented on backward-compatible changes.'),
        },
        // ── Workflow state (picklist) ───────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
          SchemaName: 'qdb_workflow_state',
          RequiredLevel: req('None'),
          DisplayName: lbl('Workflow State'),
          Description: lbl('Publication lifecycle state: Draft (editing), Published (active), Archived (retired).'),
          DefaultFormValue: 100_000_000,
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
            IsGlobal: false,
            OptionSetType: 'Picklist',
            Options: [
              opt(100_000_000, 'Draft'),
              opt(100_000_001, 'Published'),
              opt(100_000_002, 'Archived'),
            ],
          },
        },
        // ── Workflow snapshot (JSON/XML blob) ──────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
          SchemaName: 'qdb_workflow_snapshot',
          RequiredLevel: req('None'),
          MaxLength: 1_048_576,
          DisplayName: lbl('Workflow Snapshot'),
          Description: lbl('JSON snapshot of the complete workflow graph at the time of publication. Used for rollback and audit.'),
        },
      ],
    },
    'qdb_work_item_record_type entity',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 2 — qdb_work_item_steps  (Steps within a workflow)
// ══════════════════════════════════════════════════════════════════════════════

async function createWorkItemStepsEntity(token: string): Promise<void> {
  logSection('TABLE 2  qdb_work_item_steps');

  const exists = await entityExists(token, 'qdb_work_item_steps');
  if (exists) {
    console.log('  [SKIP] Entity qdb_work_item_steps — already exists');
    return;
  }

  await postMetadata(
    token,
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_work_item_steps',
      DisplayName: lbl('Step'),
      DisplayCollectionName: lbl('Steps'),
      Description: lbl('A single step in a CRM workflow. Defines task subject, assignment rules, and position in the sequence.'),
      OwnershipType: 'UserOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 200,
          DisplayName: lbl('Name'),
          Description: lbl('Display name of this workflow step.'),
        },
        // ── Schema name (unique step identifier) ───────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_schemaname',
          RequiredLevel: req('None'),
          MaxLength: 100,
          DisplayName: lbl('Schema Name'),
          Description: lbl('Unique machine-readable identifier for this step. Used in FetchXML conditions and API references.'),
        },
        // ── Sequence number ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_sequenceno',
          RequiredLevel: req('None'),
          DefaultValue: 0,
          MinValue: 0,
          MaxValue: 2_147_483_647,
          DisplayName: lbl('Sequence No'),
          Description: lbl('Display order of this step within the workflow. Lower values appear first.'),
        },
        // ── Task subject ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_tasksubject',
          RequiredLevel: req('None'),
          MaxLength: 500,
          DisplayName: lbl('Task Subject'),
          Description: lbl('Subject of the CRM task record created when this step becomes active.'),
        },
        // ── Task description ───────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
          SchemaName: 'qdb_taskdescription',
          RequiredLevel: req('None'),
          MaxLength: 4_000,
          DisplayName: lbl('Task Description'),
          Description: lbl('Body/description of the CRM task record created when this step becomes active.'),
        },
        // ── Record entity ──────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_recordentity',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Record Entity'),
          Description: lbl('Logical name of the CRM entity this step acts on. Overrides the process-level setting when set.'),
        },
        // ── Regarding field ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_regardingfield',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Regarding Field'),
          Description: lbl('Schema name of the attribute linking this step\'s record to the parent entity.'),
        },
        // ── Parent entity ──────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_parententity',
          RequiredLevel: req('None'),
          MaxLength: 200,
          DisplayName: lbl('Parent Entity'),
          Description: lbl('Logical name of the parent entity for this step. Overrides the process-level setting when set.'),
        },
        // ── Task assign-to (picklist) ──────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
          SchemaName: 'qdb_task_assign_to',
          RequiredLevel: req('None'),
          DisplayName: lbl('Assign To'),
          Description: lbl('How the task generated by this step is assigned: to a specific user, or to a team.'),
          DefaultFormValue: 100_000_000,
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
            IsGlobal: false,
            OptionSetType: 'Picklist',
            Options: [
              opt(100_000_000, 'Specific User'),
              opt(100_000_002, 'Team'),
            ],
          },
        },
        // ── Enable round-robin ─────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
          SchemaName: 'qdb_enableroundrobin',
          RequiredLevel: req('None'),
          DisplayName: lbl('Enable Round Robin'),
          Description: lbl('When true, tasks are distributed sequentially across members of the round-robin team.'),
          DefaultValue: false,
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
            TrueOption: { Value: 1, Label: lbl('Yes') },
            FalseOption: { Value: 0, Label: lbl('No') },
          },
        },
      ],
    },
    'qdb_work_item_steps entity',
  );
}

// ── Attributes added as separate POST calls (lookup columns require the
//    referenced entity to exist first, so they cannot be inlined in EntityDefinitions).

async function addStepLookupAttributes(token: string): Promise<void> {
  logSection('TABLE 2 — lookup attributes');

  // qdb_assigned_user → systemuser
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_work_item_steps')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_assigned_user',
      RequiredLevel: req('None'),
      DisplayName: lbl('Assigned User'),
      Description: lbl('Specific user to assign the task to when Assign To = Specific User.'),
      Targets: ['systemuser'],
    },
    'qdb_work_item_steps.qdb_assigned_user (→ systemuser)',
  );

  // qdb_team → team
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_work_item_steps')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_team',
      RequiredLevel: req('None'),
      DisplayName: lbl('Team'),
      Description: lbl('Team to assign the task to when Assign To = Team.'),
      Targets: ['team'],
    },
    'qdb_work_item_steps.qdb_team (→ team)',
  );

  // qdb_roundrobinteam → team
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_work_item_steps')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_roundrobinteam',
      RequiredLevel: req('None'),
      DisplayName: lbl('Round Robin Team'),
      Description: lbl('Team whose members receive tasks in round-robin order when Enable Round Robin = Yes.'),
      Targets: ['team'],
    },
    'qdb_work_item_steps.qdb_roundrobinteam (→ team)',
  );

  // qdb_record_type → qdb_work_item_record_type
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_work_item_steps')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_record_type',
      RequiredLevel: req('None'),
      DisplayName: lbl('Process'),
      Description: lbl('The workflow process this step belongs to.'),
      Targets: ['qdb_work_item_record_type'],
    },
    'qdb_work_item_steps.qdb_record_type (→ qdb_work_item_record_type)',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 3 — qdb_outcome  (Outcomes on a step)
// ══════════════════════════════════════════════════════════════════════════════

async function createOutcomeEntity(token: string): Promise<void> {
  logSection('TABLE 3  qdb_outcome');

  const exists = await entityExists(token, 'qdb_outcome');
  if (exists) {
    console.log('  [SKIP] Entity qdb_outcome — already exists');
    return;
  }

  await postMetadata(
    token,
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_outcome',
      DisplayName: lbl('Outcome'),
      DisplayCollectionName: lbl('Outcomes'),
      Description: lbl('A possible result of completing a workflow step. Routes connect outcomes to subsequent steps.'),
      OwnershipType: 'UserOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 200,
          DisplayName: lbl('Name'),
          Description: lbl('Display name of this outcome (e.g. "Approved", "Rejected", "Needs Review").'),
        },
        // ── Sequence number ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_sequencenumber',
          RequiredLevel: req('None'),
          DefaultValue: 0,
          MinValue: 0,
          MaxValue: 2_147_483_647,
          DisplayName: lbl('Sequence Number'),
          Description: lbl('Display order of this outcome within the step. Lower values appear first.'),
        },
        // ── Apply filter ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
          SchemaName: 'qdb_applyfilter',
          RequiredLevel: req('None'),
          DisplayName: lbl('Apply Filter'),
          Description: lbl('When true, the route condition FetchXML filter must be satisfied for this outcome to apply.'),
          DefaultValue: false,
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
            TrueOption: { Value: 1, Label: lbl('Yes') },
            FalseOption: { Value: 0, Label: lbl('No') },
          },
        },
      ],
    },
    'qdb_outcome entity',
  );
}

async function addOutcomeLookupAttributes(token: string): Promise<void> {
  logSection('TABLE 3 — lookup attributes');

  // qdb_workitemstep → qdb_work_item_steps
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_outcome')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_workitemstep',
      RequiredLevel: req('None'),
      DisplayName: lbl('Work Item Step'),
      Description: lbl('The step this outcome belongs to.'),
      Targets: ['qdb_work_item_steps'],
    },
    'qdb_outcome.qdb_workitemstep (→ qdb_work_item_steps)',
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TABLE 4 — qdb_outcomeworktasks  (Routes between outcomes and next steps)
// ══════════════════════════════════════════════════════════════════════════════

async function createOutcomeWorkTasksEntity(token: string): Promise<void> {
  logSection('TABLE 4  qdb_outcomeworktasks');

  const exists = await entityExists(token, 'qdb_outcomeworktasks');
  if (exists) {
    console.log('  [SKIP] Entity qdb_outcomeworktasks — already exists');
    return;
  }

  await postMetadata(
    token,
    'EntityDefinitions',
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: 'qdb_outcomeworktasks',
      DisplayName: lbl('Route'),
      DisplayCollectionName: lbl('Routes'),
      Description: lbl('Connects an outcome to the next workflow step. Stores the optional FetchXML filter condition.'),
      OwnershipType: 'UserOwned',
      IsActivity: false,
      HasActivities: false,
      HasNotes: false,
      Attributes: [
        // ── Primary name ───────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          IsPrimaryName: true,
          SchemaName: 'qdb_name',
          RequiredLevel: req('ApplicationRequired'),
          MaxLength: 200,
          DisplayName: lbl('Name'),
          Description: lbl('Display name of this route (e.g. "Approved → Credit Assessment").'),
        },
        // ── Subject ────────────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          SchemaName: 'qdb_subject',
          RequiredLevel: req('None'),
          MaxLength: 500,
          DisplayName: lbl('Subject'),
          Description: lbl('Optional descriptive subject for the route, shown in the designer canvas label.'),
        },
        // ── Sequence number ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          SchemaName: 'qdb_sequencenumber',
          RequiredLevel: req('None'),
          DefaultValue: 0,
          MinValue: 0,
          MaxValue: 2_147_483_647,
          DisplayName: lbl('Sequence Number'),
          Description: lbl('Evaluation order when multiple routes exist for an outcome. Lower values evaluated first.'),
        },
        // ── FetchXML filter ────────────────────────────────────────────────
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
          SchemaName: 'qdb_filter',
          RequiredLevel: req('None'),
          MaxLength: 1_048_576,
          DisplayName: lbl('Filter'),
          Description: lbl('FetchXML <filter> fragment evaluated against the workflow record. Route is taken only when the filter matches (or when no filter is set).'),
        },
      ],
    },
    'qdb_outcomeworktasks entity',
  );
}

async function addRouteForLookupAttributes(token: string): Promise<void> {
  logSection('TABLE 4 — lookup attributes');

  // qdb_outcome → qdb_outcome
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_outcomeworktasks')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_outcome',
      RequiredLevel: req('None'),
      DisplayName: lbl('Outcome'),
      Description: lbl('The outcome that triggers this route.'),
      Targets: ['qdb_outcome'],
    },
    'qdb_outcomeworktasks.qdb_outcome (→ qdb_outcome)',
  );

  // qdb_nextworkitemstep → qdb_work_item_steps
  await postMetadata(
    token,
    "EntityDefinitions(LogicalName='qdb_outcomeworktasks')/Attributes",
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: 'qdb_nextworkitemstep',
      RequiredLevel: req('None'),
      DisplayName: lbl('Next Step'),
      Description: lbl('The step the workflow transitions to when this route is taken. Null = terminal route (workflow ends).'),
      Targets: ['qdb_work_item_steps'],
    },
    'qdb_outcomeworktasks.qdb_nextworkitemstep (→ qdb_work_item_steps)',
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  CRM Visual Workflow Designer — Schema Migration');
  console.log(`  Target: ${ORG_URL}`);
  console.log(`  Solution: ${SOLUTION}`);
  console.log('════════════════════════════════════════════════════════════════');

  assertEnvironment();

  const token = await acquireServicePrincipalToken();

  // Phase 1 — create base entities (no cross-entity lookups yet)
  await createWorkItemRecordTypeEntity(token);
  await createWorkItemStepsEntity(token);
  await createOutcomeEntity(token);
  await createOutcomeWorkTasksEntity(token);

  // Phase 2 — add lookup attributes (cross-entity references now safe)
  await addStepLookupAttributes(token);
  await addOutcomeLookupAttributes(token);
  await addRouteForLookupAttributes(token);

  // Phase 3 — publish
  logSection('Publishing all customisations');
  await publishAll(token);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  Migration complete.');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch((err: unknown) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
