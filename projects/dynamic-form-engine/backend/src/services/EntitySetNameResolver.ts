// The Web API addresses records by entity-set name, which is NOT the logical name plus "s".
// Dataverse pluralises (qdb_activity -> qdb_activities, qdb_agreementdetails ->
// qdb_agreementdetailses) and appends set/collection for some tables; in this org 743 of
// 3069 entities break the naive rule, 638 of them custom. opportunity -> opportunities is
// already an active submission target, so guessing produces /opportunitys and a 404.
//
// The name comes from metadata and changes only when a table is created, so it is cached
// for the life of the process.
import { logger } from '../utils/logger.js';

type MetadataFetch = <T>(path: string) => Promise<T>;

export class EntitySetNameResolver {
  private readonly entitySetNames = new Map<string, string>();

  constructor(private readonly fetchMetadata: MetadataFetch) {}

  /**
   * The entity-set name for a logical name. Falls back to the naive plural when metadata
   * cannot be read — that keeps a metadata outage behaving as the code did before rather
   * than failing every write, and the fallback is logged so it is visible.
   */
  async resolve(entityLogicalName: string): Promise<string> {
    const cached = this.entitySetNames.get(entityLogicalName);
    if (cached) return cached;

    try {
      const metadata = await this.fetchMetadata<{ EntitySetName?: string }>(
        `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=EntitySetName`,
      );
      if (metadata.EntitySetName) {
        this.entitySetNames.set(entityLogicalName, metadata.EntitySetName);
        return metadata.EntitySetName;
      }
      logger.warn({ entityLogicalName }, 'EntitySetName missing from metadata — falling back to the naive plural');
    } catch (error) {
      logger.warn({ entityLogicalName, error }, 'Entity set name could not be resolved — falling back to the naive plural');
    }

    return `${entityLogicalName}s`;
  }

  /** Pre-populates the cache, e.g. from an override configured on a submission mapping. */
  seed(entityLogicalName: string, entitySetName: string): void {
    this.entitySetNames.set(entityLogicalName, entitySetName);
  }
}
