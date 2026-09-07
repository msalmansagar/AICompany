// Resolves how a lookup column must be written through the Web API.
//
// A lookup is never writable as a plain attribute value — Dataverse answers
// "CRM do not support direct update of Entity Reference properties, Use Navigation
// properties instead." It has to be written as `"<navigationProperty>@odata.bind":
// "/<entitySetName>(<guid>)"`, and neither of those two names can be derived from the
// column name by string manipulation:
//
//   · the navigation property is often the SchemaName casing (qdb_EditFormCurrentTabId),
//     and for a polymorphic lookup there is one per target (parentcustomerid_account);
//   · the entity set is not the logical name plus "s" for every table.
//
// Both come from metadata, which changes only on a schema edit, so results are cached for
// the life of the process.
import { logger } from '../utils/logger.js';

export interface LookupBinding {
  navigationProperty: string;
  entitySetName: string;
}

interface RelationshipRow {
  ReferencingAttribute: string;
  ReferencingEntityNavigationPropertyName: string;
  ReferencedEntity: string;
}

type MetadataFetch = <T>(path: string) => Promise<T>;

export class LookupBindingResolver {
  private readonly entitySetNames = new Map<string, string>();
  private readonly navigationProperties = new Map<string, string | null>();

  constructor(private readonly fetchMetadata: MetadataFetch) {}

  /**
   * Returns how to bind `targetAttribute` on `targetEntity` to a record of
   * `referencedEntity`, or null when the attribute is not a lookup to that table — in
   * which case the caller writes the value as a plain attribute, as before.
   */
  async resolve(
    targetEntity: string,
    targetAttribute: string,
    referencedEntity: string,
  ): Promise<LookupBinding | null> {
    const navigationProperty = await this.resolveNavigationProperty(
      targetEntity, targetAttribute, referencedEntity,
    );
    if (!navigationProperty) return null;

    const entitySetName = await this.resolveEntitySetName(referencedEntity);
    if (!entitySetName) return null;

    return { navigationProperty, entitySetName };
  }

  private async resolveNavigationProperty(
    targetEntity: string,
    targetAttribute: string,
    referencedEntity: string,
  ): Promise<string | null> {
    const cacheKey = `${targetEntity}.${targetAttribute}.${referencedEntity}`;
    const cached = this.navigationProperties.get(cacheKey);
    if (cached !== undefined) return cached;

    const path = '/RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
      + '?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity'
      + `&$filter=ReferencingEntity eq '${targetEntity}' and ReferencingAttribute eq '${targetAttribute}'`;

    let navigationProperty: string | null = null;
    try {
      const response = await this.fetchMetadata<{ value?: RelationshipRow[] }>(path);
      const relationships = response.value ?? [];
      // A polymorphic lookup returns one relationship per target; pick the one the form
      // field actually points at, and fall back to the only candidate when unambiguous.
      const match = relationships.find((r) => r.ReferencedEntity === referencedEntity)
        ?? (relationships.length === 1 ? relationships[0] : undefined);
      navigationProperty = match?.ReferencingEntityNavigationPropertyName ?? null;
    } catch (error) {
      logger.warn(
        { targetEntity, targetAttribute, referencedEntity, error },
        'Lookup binding metadata lookup failed — the value will be written unbound',
      );
    }

    this.navigationProperties.set(cacheKey, navigationProperty);
    return navigationProperty;
  }

  private async resolveEntitySetName(entityLogicalName: string): Promise<string | null> {
    const cached = this.entitySetNames.get(entityLogicalName);
    if (cached !== undefined) return cached;

    try {
      const response = await this.fetchMetadata<{ EntitySetName?: string }>(
        `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=EntitySetName`,
      );
      if (!response.EntitySetName) return null;

      this.entitySetNames.set(entityLogicalName, response.EntitySetName);
      return response.EntitySetName;
    } catch (error) {
      logger.warn({ entityLogicalName, error }, 'Entity set name could not be resolved');
      return null;
    }
  }
}

/** Formats a resolved binding as the payload key/value pair Dataverse expects. */
export function toBindingEntry(binding: LookupBinding, recordId: string): [string, string] {
  const guid = recordId.replace(/[{}]/g, '');
  return [`${binding.navigationProperty}@odata.bind`, `/${binding.entitySetName}(${guid})`];
}
