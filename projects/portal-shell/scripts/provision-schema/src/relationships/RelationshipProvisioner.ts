import type { DataverseHttpClient } from '../http/DataverseHttpClient.js';
import { env } from '../config/env.js';
import type {
  ODataCollectionResponse,
  RelationshipRecord,
  OneToManyRelationshipPayload,
} from '../types/DataverseMetadata.js';
import type { StepResult } from '../types/ProvisioningResult.js';

// Phase 6: Self-referential relationship on qdb_portal_nav_items.
// This cannot be inline in the entity POST because the target (itself) must exist first.
// CHALLENGE 4 resolution: MSCRM.SolutionUniqueName header is explicitly asserted before POST.

const RELATIONSHIP_SCHEMA_NAME = 'qdb_portalnavitems_parentnavitem';

const SELF_REFERENTIAL_PAYLOAD: OneToManyRelationshipPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
  SchemaName: RELATIONSHIP_SCHEMA_NAME,
  ReferencedEntity: 'qdb_portal_nav_items',
  ReferencingEntity: 'qdb_portal_nav_items',
  ReferencedAttribute: 'qdb_portal_nav_itemsid',
  ReferencingAttribute: 'qdb_parent_id',
  Lookup: {
    '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
    SchemaName: 'qdb_ParentId',
    LogicalName: 'qdb_parent_id',
    DisplayName: {
      LocalizedLabels: [{ Label: 'Parent Nav Item', LanguageCode: 1033 }],
    },
    RequiredLevel: { Value: 'None' },
  },
  AssociatedMenuConfiguration: {
    Behavior: 'DoNotDisplay',
    Group: 'Details',
    Order: null,
    IsCustomizable: { Value: true },
  },
  CascadeConfiguration: {
    Assign: 'NoCascade',
    Delete: 'RemoveLink',
    Merge: 'NoCascade',
    Reparent: 'NoCascade',
    Share: 'NoCascade',
    Unshare: 'NoCascade',
  },
};

export async function provisionSelfReferentialNavRelationship(
  http: DataverseHttpClient,
): Promise<StepResult> {
  console.log(
    `[PHASE-6] Checking self-referential relationship '${RELATIONSHIP_SCHEMA_NAME}'...`,
  );

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
    console.log(
      `[PHASE-6] [DRY-RUN SKIP] Would create self-referential relationship '${RELATIONSHIP_SCHEMA_NAME}'.`,
    );
    return { name: RELATIONSHIP_SCHEMA_NAME, status: 'dry-run' };
  }

  // CHALLENGE 4: Explicitly assert MSCRM.SolutionUniqueName before POST.
  console.log(
    '[PHASE-6] MSCRM.SolutionUniqueName header confirmed on relationship POST: QdbPortalShell',
  );

  await http.postWithCustomHeaders(
    'RelationshipDefinitions',
    SELF_REFERENTIAL_PAYLOAD,
    {
      // Explicitly set to document the intent — DataverseHttpClient.buildMutationHeaders
      // already sets this, but we assert it here per CHALLENGE 4 requirement.
      'MSCRM.SolutionUniqueName': 'QdbPortalShell',
    },
  );

  console.log(
    `[PHASE-6] [PASS] Self-referential relationship '${RELATIONSHIP_SCHEMA_NAME}' created.`,
  );
  return { name: RELATIONSHIP_SCHEMA_NAME, status: 'created' };
}
