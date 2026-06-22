import { env } from '../config/env.js';
import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import type {
  ODataCollectionResponse,
  RelationshipRecord,
  OneToManyRelationshipPayload,
} from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const RELATIONSHIP_SCHEMA_NAME = 'qdb_tokendefinition_values';
const REFERENCED_ENTITY = 'qdb_token_definitions';
const REFERENCING_ENTITY = 'qdb_token_values';
const REFERENCED_ATTRIBUTE = 'qdb_token_definitionsid';
const LOOKUP_SCHEMA_NAME = 'qdb_TokenDefinitionId';

function buildRelationshipPayload(): OneToManyRelationshipPayload {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: RELATIONSHIP_SCHEMA_NAME,
    ReferencedEntity: REFERENCED_ENTITY,
    ReferencingEntity: REFERENCING_ENTITY,
    ReferencedAttribute: REFERENCED_ATTRIBUTE,
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: LOOKUP_SCHEMA_NAME,
      LogicalName: 'qdb_tokendefinitionid',
      DisplayName: {
        LocalizedLabels: [{ Label: 'Token Definition', LanguageCode: 1033 }],
      },
      RequiredLevel: { Value: 'None' },
    },
    AssociatedMenuConfiguration: {
      Behavior: 'UseCollectionName',
      Group: 'Details',
      Order: null,
    },
    CascadeConfiguration: {
      Assign: 'NoCascade',
      Delete: 'Restrict',
      Merge: 'NoCascade',
      Reparent: 'NoCascade',
      Share: 'NoCascade',
      Unshare: 'NoCascade',
    },
  };
}

export class RelationshipProvisioner {
  private readonly http: DataverseHttpClient;

  constructor(http: DataverseHttpClient) {
    this.http = http;
  }

  async ensureRelationshipExists(): Promise<StepResult> {
    console.log('[Phase 7] Provisioning relationship...');

    const existing = await this.http.get<ODataCollectionResponse<RelationshipRecord>>(
      'RelationshipDefinitions',
      {
        filter: `SchemaName eq '${RELATIONSHIP_SCHEMA_NAME}'`,
        select: ['MetadataId', 'SchemaName'],
        top: 1,
      },
    );

    if (existing?.value?.length) {
      const rel = existing.value[0]!;
      console.log(`  [SKIP] Relationship '${RELATIONSHIP_SCHEMA_NAME}' already exists`);
      return { name: RELATIONSHIP_SCHEMA_NAME, status: 'skipped', id: rel.MetadataId };
    }

    if (env.DRY_RUN) {
      console.log(`  [DRY-RUN] Would create relationship '${RELATIONSHIP_SCHEMA_NAME}'`);
      return { name: RELATIONSHIP_SCHEMA_NAME, status: 'dry-run' };
    }

    console.log(`  [CREATE] Creating relationship '${RELATIONSHIP_SCHEMA_NAME}'...`);

    const response = await this.http.postAdminRaw(
      'RelationshipDefinitions',
      buildRelationshipPayload(),
    );

    const entityId = response.headers.get('OData-EntityId') ?? '';
    const match = entityId.match(/\(([^)]+)\)$/);
    const metadataId = match?.[1] ?? entityId;

    console.log(`  [OK] Relationship created: ${metadataId}`);
    return { name: RELATIONSHIP_SCHEMA_NAME, status: 'created', id: metadataId };
  }
}
