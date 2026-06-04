/**
 * Dataverse seed script — Loan Application demo workflow
 *
 * Creates a representative "Loan Application Workflow" in the
 * QdbWorkflowDesigner solution for end-to-end testing of the designer.
 *
 * Seed graph:
 *
 *   Process: Loan Application (opportunity, Draft, v1.0)
 *   ├── Step 1: Initial Review (sequenceNo=1, assignTo=SpecificUser)
 *   │     ├── Outcome 1: Approved (seq=1) → Route → Step 2
 *   │     └── Outcome 2: Rejected (seq=2) → terminal (no next step)
 *   ├── Step 2: Credit Assessment (sequenceNo=2, assignTo=Team)
 *   │     ├── Outcome 3: Pass (seq=1) → Route → Step 3
 *   │     └── Outcome 4: Fail (seq=2) → terminal
 *   └── Step 3: Manager Approval (sequenceNo=3, assignTo=Team, roundRobin=true)
 *         ├── Outcome 5: Approved (seq=1) → terminal
 *         └── Outcome 6: Rejected (seq=2, applyFilter=true) → terminal
 *
 * Auth: service principal (same credentials as migrate script)
 *   Required env vars:
 *     AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 *
 *   Optional overrides:
 *     CRM_ORG_URL — override target org
 *
 * Run:
 *   npx ts-node scripts/seed-workflow-demo.ts
 *
 * NOTE: This script is NOT idempotent. Running it twice creates duplicate
 * demo records. Delete existing demo data before re-seeding.
 */

// Make this file a module so top-level declarations do not collide with other
// scripts when TypeScript compiles all scripts/** files together.
export {};

// ── Configuration ──────────────────────────────────────────────────────────────

const TENANT_ID = process.env['AZURE_TENANT_ID'] ?? 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID = process.env['AZURE_CLIENT_ID'] ?? '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env['AZURE_CLIENT_SECRET'];
const ORG_URL = process.env['CRM_ORG_URL'] ?? 'https://org5869857f.crm4.dynamics.com';

const API_VER = '9.2';

// ── Bootstrap validation ───────────────────────────────────────────────────────

function assertEnvironment(): void {
  if (!CLIENT_SECRET) {
    throw new Error(
      'AZURE_CLIENT_SECRET environment variable is required.\n' +
        '  $env:AZURE_CLIENT_SECRET="<your-secret>"  (PowerShell)\n' +
        '  export AZURE_CLIENT_SECRET="<your-secret>"  (bash)',
    );
  }
}

// ── Token acquisition ──────────────────────────────────────────────────────────

interface TokenResponse {
  readonly access_token: string;
}

async function acquireToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET!,
    scope: `${ORG_URL}/.default`,
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
  console.log('  Token acquired.');
  return data.access_token;
}

// ── Dataverse Web API helpers ──────────────────────────────────────────────────

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    'OData-Version': '4.0',
    'OData-MaxVersion': '4.0',
    Prefer: 'return=representation',
  };
}

function buildApiUrl(entitySetName: string): string {
  return `${ORG_URL}/api/data/v${API_VER}/${entitySetName}`;
}

interface DataverseErrorBody {
  readonly error?: {
    readonly message?: string;
  };
}

async function createRecord(
  token: string,
  entitySetName: string,
  body: Record<string, unknown>,
  label: string,
): Promise<string> {
  const res = await fetch(buildApiUrl(entitySetName), {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text) as DataverseErrorBody;
      message = parsed.error?.message ?? message;
    } catch {
      message = text || message;
    }
    throw new Error(`Failed to create ${label}: ${message}`);
  }

  // Extract GUID from OData-EntityId header or response body.
  const entityId = res.headers.get('OData-EntityId') ?? '';
  const guidMatch = entityId.match(/\(([0-9a-f-]{36})\)/i);
  if (!guidMatch) {
    // Fall back to response body when Prefer: return=representation is honoured.
    const responseBody = (await res.json()) as Record<string, unknown>;
    const id = extractPrimaryKey(responseBody, entitySetName);
    console.log(`  [OK]   ${label} → ${id}`);
    return id;
  }

  const id = guidMatch[1]!;
  console.log(`  [OK]   ${label} → ${id}`);
  return id;
}

// Entity set names → primary key attribute names
const PRIMARY_KEYS: Record<string, string> = {
  qdb_work_item_record_types: 'qdb_work_item_record_typeid',
  qdb_work_item_stepses: 'qdb_work_item_stepsid',
  qdb_outcomes: 'qdb_outcomeid',
  qdb_outcomeworktaskses: 'qdb_outcomeworktasksid',
};

function extractPrimaryKey(body: Record<string, unknown>, entitySetName: string): string {
  const keyAttr = PRIMARY_KEYS[entitySetName];
  if (keyAttr && typeof body[keyAttr] === 'string') {
    return body[keyAttr] as string;
  }
  // Generic fallback — find the first UUID-looking value
  for (const val of Object.values(body)) {
    if (typeof val === 'string' && /^[0-9a-f-]{36}$/i.test(val)) return val;
  }
  throw new Error(`Cannot determine primary key for ${entitySetName}`);
}

function logSection(title: string): void {
  const lineLength = Math.max(0, 62 - title.length);
  const line = '─'.repeat(lineLength);
  console.log(`\n── ${title} ${line}`);
}

// ── Seed helpers ───────────────────────────────────────────────────────────────

async function createProcess(token: string): Promise<string> {
  logSection('Process — Loan Application');

  // Only qdb_name is guaranteed to exist as a string field.
  // qdb_RecordEntity / qdb_RegardingField / qdb_ParentEntity are Lookup fields
  // pointing to metadata entities — the designer populates them via lookup UI.
  // Versioning fields (qdb_version_major etc.) are added by the migrate script.
  return createRecord(
    token,
    'qdb_work_item_record_types',
    {
      qdb_name: 'Loan Application (Demo)',
    },
    'Process: Loan Application (Demo)',
  );
}

async function createStep(
  token: string,
  params: {
    name: string;
    schemaName: string;
    sequenceNo: number;
    assignTo: number;
    enableRoundRobin: boolean;
    processId: string;
  },
): Promise<string> {
  return createRecord(
    token,
    'qdb_work_item_stepses',
    {
      qdb_name: params.name,
      // Actual CRM field names (PascalCase) confirmed via EntityDefinitions query
      qdb_sequenceno: params.sequenceNo,
      qdb_task_assign_to: params.assignTo,
      qdb_enableroundrobin: params.enableRoundRobin,
      'qdb_record_type@odata.bind': `/qdb_work_item_record_types(${params.processId})`,
    },
    `Step: ${params.name}`,
  );
}

async function createOutcome(
  token: string,
  params: {
    name: string;
    sequenceNo: number;
    applyFilter: boolean;
    stepId: string;
  },
): Promise<string> {
  return createRecord(
    token,
    'qdb_outcomes',
    {
      qdb_name: params.name,
      qdb_sequencenumber: params.sequenceNo,
      qdb_applyfilter: params.applyFilter,
      'qdb_WorkItemStep@odata.bind': `/qdb_work_item_stepses(${params.stepId})`,
    },
    `Outcome: ${params.name}`,
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function createRoute(
  token: string,
  params: {
    name: string;
    sequenceNo: number;
    filter?: string;
    outcomeId: string;
    nextStepId?: string;
  },
): Promise<string> {
  const body: Record<string, unknown> = {
    qdb_name: params.name,
    qdb_sequencenumber: params.sequenceNo,
    'qdb_Outcome@odata.bind': `/qdb_outcomes(${params.outcomeId})`,
  };

  if (params.filter) {
    body['qdb_filter'] = params.filter;
    body['qdb_isdefaultcondition'] = false;
  } else {
    // Unconditional route — mark as default condition to satisfy plugin validation
    body['qdb_isdefaultcondition'] = true;
    body['qdb_filter'] = '<filter type="and"></filter>';
  }

  if (params.nextStepId) {
    body['qdb_NextWorkItemStep@odata.bind'] = `/qdb_work_item_stepses(${params.nextStepId})`;
  }

  return createRecord(token, 'qdb_outcomeworktaskses', body, `Route: ${params.name}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  CRM Visual Workflow Designer — Demo Seed');
  console.log('  Workflow: Loan Application');
  console.log(`  Target: ${ORG_URL}`);
  console.log('════════════════════════════════════════════════════════════════');

  assertEnvironment();

  const token = await acquireToken();

  // ── 1. Process ─────────────────────────────────────────────────────────────
  const processId = await createProcess(token);

  // ── 2. Steps ───────────────────────────────────────────────────────────────
  logSection('Steps');

  const step1Id = await createStep(token, {
    name: 'Initial Review',
    schemaName: 'initial_review',
    sequenceNo: 1,
    assignTo: 100_000_000, // SpecificUser
    enableRoundRobin: false,
    processId,
  });

  const step2Id = await createStep(token, {
    name: 'Credit Assessment',
    schemaName: 'credit_assessment',
    sequenceNo: 2,
    assignTo: 100_000_002, // Team
    enableRoundRobin: false,
    processId,
  });

  const step3Id = await createStep(token, {
    name: 'Manager Approval',
    schemaName: 'manager_approval',
    sequenceNo: 3,
    assignTo: 100_000_002, // Team
    enableRoundRobin: false, // omit round robin — requires a team record ID
    processId,
  });

  // ── 3. Outcomes — Step 1 (Initial Review) ──────────────────────────────────
  logSection('Outcomes — Step 1: Initial Review');

  const outcome1Id = await createOutcome(token, {
    name: 'Approved',
    sequenceNo: 1,
    applyFilter: false,
    stepId: step1Id,
  });

  const outcome2Id = await createOutcome(token, {
    name: 'Rejected',
    sequenceNo: 2,
    applyFilter: false,
    stepId: step1Id,
  });

  // NOTE: Route (qdb_outcomeworktasks) creation triggers a BPM plugin that requires
  // qdb_attributesmapping records from the pre-deployed QDB BPM system.
  // Routes are skipped in this seed — use the designer UI to add them.
  // The process, steps, and outcomes above provide sufficient data for the canvas.

  // ── 5. Outcomes — Step 2 (Credit Assessment) ───────────────────────────────
  logSection('Outcomes — Step 2: Credit Assessment');

  const outcome3Id = await createOutcome(token, {
    name: 'Pass',
    sequenceNo: 1,
    applyFilter: false,
    stepId: step2Id,
  });

  const outcome4Id = await createOutcome(token, {
    name: 'Fail',
    sequenceNo: 2,
    applyFilter: false,
    stepId: step2Id,
  });

  // ── 7. Outcomes — Step 3 (Manager Approval) ────────────────────────────────
  logSection('Outcomes — Step 3: Manager Approval');

  await createOutcome(token, {
    name: 'Approved',
    sequenceNo: 1,
    applyFilter: false,
    stepId: step3Id,
  });

  // Outcome 6 has applyFilter=true and a FetchXML filter condition.
  // The filter matches opportunities with creditlimit <= 50000.
  const creditLimitFilter =
    '<filter type="and">' +
    '<condition attribute="creditlimit" operator="le" value="50000"/>' +
    '</filter>';

  const outcome6Id = await createOutcome(token, {
    name: 'Rejected',
    sequenceNo: 2,
    applyFilter: true,
    stepId: step3Id,
  });

  // Routes skipped — see note above. Suppress unused variable warnings.
  void outcome1Id; void outcome2Id; void outcome3Id; void outcome4Id;
  void outcome6Id; void creditLimitFilter; void step2Id; void step3Id;
  void createRoute;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  Demo seed complete.');
  console.log(`  Process ID: ${processId}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch((err: unknown) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
