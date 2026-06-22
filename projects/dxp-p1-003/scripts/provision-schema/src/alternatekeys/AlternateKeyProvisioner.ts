import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const ENTITY_LOGICAL_NAME = 'qdb_token_definitions';
const ALT_KEY_SCHEMA_NAME = 'qdb_TokenDefinitionSlugKey';
const ALT_KEY_DISPLAY_LABEL = 'Token Definition Slug Key';
const KEY_ATTRIBUTE = 'qdb_slug';

interface AlternateKeyRecord {
  readonly MetadataId: string;
  readonly SchemaName: string;
}

interface AlternateKeyCollection {
  readonly value: readonly AlternateKeyRecord[];
}

export class AlternateKeyProvisioner {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async ensureAlternateKeyExists(): Promise<StepResult> {
    console.log('[Phase 8] Provisioning alternate key...');

    const existing = await this.http.get<AlternateKeyCollection>(
      `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Keys`,
      { select: ['MetadataId', 'SchemaName'] },
    );

    const alreadyExists = existing?.value?.some((k) => k.SchemaName === ALT_KEY_SCHEMA_NAME) ?? false;

    if (alreadyExists) {
      console.log(`  [SKIP] Alternate key '${ALT_KEY_SCHEMA_NAME}' already exists`);
      return { name: ALT_KEY_SCHEMA_NAME, status: 'skipped' };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create alternate key '${ALT_KEY_SCHEMA_NAME}' on '${ENTITY_LOGICAL_NAME}'`);
      return { name: ALT_KEY_SCHEMA_NAME, status: 'dry-run' };
    }

    console.log(`  [CREATE] Creating alternate key '${ALT_KEY_SCHEMA_NAME}'...`);

    const response = await this.http.postAdminRaw(
      `EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Keys`,
      {
        SchemaName: ALT_KEY_SCHEMA_NAME,
        DisplayName: {
          LocalizedLabels: [{ Label: ALT_KEY_DISPLAY_LABEL, LanguageCode: 1033 }],
        },
        KeyAttributes: [KEY_ATTRIBUTE],
      },
    );

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const metadataId = match?.[1] ?? entityId;

    console.log(`  [OK] Alternate key created: ${metadataId}`);
    return { name: ALT_KEY_SCHEMA_NAME, status: 'created', id: metadataId };
  }
}
