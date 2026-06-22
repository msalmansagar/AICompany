import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { ODataCollectionResponse, GlobalOptionSetRecord, GlobalOptionSetPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

interface GlobalOptionSetDefinition {
  readonly name: string;
  readonly displayLabel: string;
  readonly description: string;
  readonly options: ReadonlyArray<{ readonly value: number; readonly label: string }>;
}

const TOKEN_TYPE_OPTIONS = [
  { value: 860005001, label: 'Color' },
  { value: 860005002, label: 'Typography Family' },
  { value: 860005003, label: 'Typography Size' },
  { value: 860005004, label: 'Typography Weight' },
  { value: 860005005, label: 'Spacing' },
  { value: 860005006, label: 'Border Radius' },
  { value: 860005007, label: 'Shadow' },
  { value: 860005008, label: 'Direction' },
] as const;

const TOKEN_LEVEL_OPTIONS = [
  { value: 860005011, label: 'Global' },
  { value: 860005012, label: 'Render Target' },
  { value: 860005013, label: 'Category' },
  { value: 860005014, label: 'Component' },
  { value: 860005015, label: 'Service' },
] as const;

const TOKEN_CATEGORY_OPTIONS = [
  { value: 860005021, label: 'Widget' },
  { value: 860005022, label: 'Form' },
  { value: 860005023, label: 'Nav Component' },
  { value: 860005024, label: 'Layout' },
  { value: 860005025, label: 'Data Display' },
] as const;

const OPTION_SET_DEFINITIONS: readonly GlobalOptionSetDefinition[] = [
  {
    name: 'qdb_token_type',
    displayLabel: 'Token Type',
    description: 'CSS property category for a design token',
    options: TOKEN_TYPE_OPTIONS,
  },
  {
    name: 'qdb_token_level',
    displayLabel: 'Token Level',
    description: 'Hierarchical resolution level in the 5-level token cascade',
    options: TOKEN_LEVEL_OPTIONS,
  },
  {
    name: 'qdb_token_category',
    displayLabel: 'Token Category',
    description: 'UI component category this token applies to',
    options: TOKEN_CATEGORY_OPTIONS,
  },
];

function buildPayload(definition: GlobalOptionSetDefinition): GlobalOptionSetPayload {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
    Name: definition.name,
    DisplayName: {
      LocalizedLabels: [{ Label: definition.displayLabel, LanguageCode: 1033 }],
    },
    Description: {
      LocalizedLabels: [{ Label: definition.description, LanguageCode: 1033 }],
    },
    IsGlobal: true,
    OptionSetType: 'Picklist',
    Options: definition.options.map((opt) => ({
      Value: opt.value,
      Label: { LocalizedLabels: [{ Label: opt.label, LanguageCode: 1033 }] },
    })),
  };
}

export class GlobalOptionSetProvisioner {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async provisionAll(alreadyExistingNames: readonly string[]): Promise<readonly StepResult[]> {
    console.log('[Phase 5] Provisioning global option sets...');

    const existingSet = new Set(alreadyExistingNames);
    const results: StepResult[] = [];

    for (const definition of OPTION_SET_DEFINITIONS) {
      const result = await this.provisionOptionSet(definition, existingSet.has(definition.name));
      results.push(result);
    }

    return results;
  }

  private async provisionOptionSet(
    definition: GlobalOptionSetDefinition,
    alreadyExists: boolean,
  ): Promise<StepResult> {
    if (alreadyExists) {
      console.log(`  [SKIP] Option set '${definition.name}' already exists`);
      return { name: definition.name, status: 'skipped' };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create option set '${definition.name}' (${definition.options.length} options)`);
      return { name: definition.name, status: 'dry-run' };
    }

    console.log(`  [CREATE] Creating option set '${definition.name}'...`);

    const response = await this.http.postAdminRaw(
      'GlobalOptionSetDefinitions',
      buildPayload(definition),
    );

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const metadataId = match?.[1] ?? entityId;

    console.log(`  [OK] Option set '${definition.name}' created: ${metadataId}`);
    return { name: definition.name, status: 'created', id: metadataId };
  }

  async fetchExistingIds(): Promise<ReadonlyMap<string, string>> {
    const result = await this.http.get<ODataCollectionResponse<GlobalOptionSetRecord>>(
      'GlobalOptionSetDefinitions',
      { select: ['MetadataId', 'Name'] },
    );

    return new Map(
      (result?.value ?? [])
        .filter((os) => OPTION_SET_DEFINITIONS.some((d) => d.name === os.Name))
        .map((os) => [os.Name, os.MetadataId]),
    );
  }
}
