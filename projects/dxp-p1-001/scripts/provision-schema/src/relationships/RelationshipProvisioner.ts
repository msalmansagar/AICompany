import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { DataverseApiError } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type { ODataCollectionResponse, RelationshipRecord, OneToManyRelationshipPayload } from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

const RELATIONSHIP_SCHEMA_NAME = 'qdb_componentdefinition_versions';

const RELATIONSHIP_PAYLOAD: OneToManyRelationshipPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
  SchemaName: RELATIONSHIP_SCHEMA_NAME,
  ReferencedEntity: 'qdb_component_definitions',
  ReferencingEntity: 'qdb_component_versions',
  ReferencedAttribute: 'qdb_component_definitionsid',
  Lookup: {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: 'qdb_DefinitionId',
    LogicalName: 'qdb_definition_id',
    DisplayName: { LocalizedLabels: [{ Label: 'Component Definition', LanguageCode: 1033 }] },
    RequiredLevel: { Value: 'ApplicationRequired' },
  },
  AssociatedMenuConfiguration: {
    Behavior: 'DoNotDisplay',
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

export async function provisionComponentDefinitionRelationship(
  http: DataverseHttpClient,
): Promise<StepResult> {
  console.log(`[PHASE-6] Checking relationship '${RELATIONSHIP_SCHEMA_NAME}'...`);

  const existing = await http.get<ODataCollectionResponse<RelationshipRecord>>(
    'RelationshipDefinitions',
    { filter: `SchemaName eq '${RELATIONSHIP_SCHEMA_NAME}'` },
  );

  const existingRelationships = existing?.value ?? [];

  if (existingRelationships.length > 0) {
    console.log(`[PHASE-6] [SKIP] Relationship '${RELATIONSHIP_SCHEMA_NAME}' already exists.`);
    return { name: RELATIONSHIP_SCHEMA_NAME, status: 'skipped' };
  }

  if (env.DRY_RUN) {
    console.log(`[PHASE-6] [DRY-RUN SKIP] Would create relationship '${RELATIONSHIP_SCHEMA_NAME}'.`);
    return { name: RELATIONSHIP_SCHEMA_NAME, status: 'dry-run' };
  }

  console.log(`[PHASE-6] Creating relationship '${RELATIONSHIP_SCHEMA_NAME}'...`);

  try {
    await http.postWithCustomHeaders(
      'RelationshipDefinitions',
      RELATIONSHIP_PAYLOAD,
      { 'MSCRM.SolutionUniqueName': 'QdbDxpPlatform' },
    );
  } catch (error) {
    if (
      error instanceof DataverseApiError &&
      error.statusCode === 400 &&
      error.dataverseMessage.includes('is not unique')
    ) {
      console.log(`[PHASE-6] [SKIP] Relationship '${RELATIONSHIP_SCHEMA_NAME}' created concurrently — treating as skipped.`);
      return { name: RELATIONSHIP_SCHEMA_NAME, status: 'skipped' };
    }
    throw error;
  }

  console.log(`[PHASE-6] [PASS] Relationship '${RELATIONSHIP_SCHEMA_NAME}' created.`);
  return { name: RELATIONSHIP_SCHEMA_NAME, status: 'created' };
}
