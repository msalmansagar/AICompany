// How a lookup column must be addressed through the Web API, resolved from metadata.
//
// Two names are involved and neither can be derived from the column by string work:
//
//   · the navigation property used to write it — often the SchemaName casing
//     (qdb_CustomerId for qdb_customerid), and one per target for a polymorphic lookup
//     (parentcustomerid_account vs parentcustomerid_contact);
//   · the entity set of the record being pointed at, which is not the logical name plus
//     "s" for every table.
//
// Mirrors backend/src/services/LookupBindingResolver.ts so both runtimes write a lookup
// the same way. Metadata changes only on a schema edit, so results are cached for the
// life of the page.
import { webApiBaseUrl } from './xrmClient';

export interface LookupBinding {
  navigationProperty: string;
  entitySetName: string;
}

const entitySetNames = new Map<string, string>();
const navigationProperties = new Map<string, string | null>();

async function fetchMetadata<T>(path: string): Promise<T> {
  const response = await fetch(`${webApiBaseUrl()}${path}`, {
    headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(`metadata request failed with status ${response.status}`);
  return response.json() as Promise<T>;
}

/** The Web API addresses records by entity-set name; ask metadata rather than pluralising. */
export async function resolveEntitySetName(entityLogicalName: string): Promise<string | null> {
  const cached = entitySetNames.get(entityLogicalName);
  if (cached !== undefined) return cached;

  try {
    const metadata = await fetchMetadata<{ EntitySetName?: string }>(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=EntitySetName`,
    );
    if (!metadata.EntitySetName) return null;

    entitySetNames.set(entityLogicalName, metadata.EntitySetName);
    return metadata.EntitySetName;
  } catch {
    return null;
  }
}

/**
 * The single-valued navigation property behind a lookup attribute, or null when the
 * attribute is not a lookup to that table.
 */
export async function resolveLookupNavigationProperty(
  entityLogicalName: string,
  attribute: string,
  targetEntity: string,
): Promise<string | null> {
  const cacheKey = `${entityLogicalName}.${attribute}.${targetEntity}`;
  const cached = navigationProperties.get(cacheKey);
  if (cached !== undefined) return cached;

  const path = '/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    + '?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName'
    + `&$filter=ReferencingEntity eq '${entityLogicalName}' and ReferencingAttribute eq '${attribute}'`;

  let navigationProperty: string | null = null;
  try {
    const metadata = await fetchMetadata<{
      value?: Array<{ ReferencedEntity?: string; ReferencingEntityNavigationPropertyName?: string }>;
    }>(path);
    const relationships = metadata.value ?? [];
    // A polymorphic lookup returns one relationship per target; pick the one the form field
    // points at, and fall back to the only candidate when there is no ambiguity.
    const match = relationships.find((r) => r.ReferencedEntity === targetEntity)
      ?? (relationships.length === 1 ? relationships[0] : undefined);
    navigationProperty = match?.ReferencingEntityNavigationPropertyName ?? null;
  } catch {
    navigationProperty = null;
  }

  navigationProperties.set(cacheKey, navigationProperty);
  return navigationProperty;
}

/** Everything needed to bind `targetAttribute` to a record of `referencedEntity`. */
export async function resolveLookupBinding(
  targetEntity: string,
  targetAttribute: string,
  referencedEntity: string,
): Promise<LookupBinding | null> {
  const navigationProperty = await resolveLookupNavigationProperty(
    targetEntity, targetAttribute, referencedEntity,
  );
  if (!navigationProperty) return null;

  const entitySetName = await resolveEntitySetName(referencedEntity);
  if (!entitySetName) return null;

  return { navigationProperty, entitySetName };
}

/**
 * The record id a lookup field holds. The renderer stores a selection as
 * { id, displayName }; a bare GUID is also accepted. Returns null for anything else, so
 * the caller falls back to a plain assignment.
 */
export function readLookupRecordId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}

/** Formats a resolved binding as the payload key/value pair Dataverse expects. */
export function toBindingEntry(binding: LookupBinding, recordId: string): [string, string] {
  const guid = recordId.replace(/[{}]/g, '').toLowerCase();
  return [`${binding.navigationProperty}@odata.bind`, `/${binding.entitySetName}(${guid})`];
}
