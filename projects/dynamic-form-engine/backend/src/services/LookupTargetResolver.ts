// The table a lookup column points at, so a grid filter can search it by display text.
//
// Searching a lookup by text is a join to the related table, and a join needs that table's
// logical name and primary key — neither of which is derivable from the column name. The
// grid's own column config already carries the target for columns the maker configured as
// lookup filters; anything else comes from metadata.
//
// Targets change only on a schema edit, so results are cached for the life of the process.
import { logger } from '../utils/logger.js';
import type { LookupJoinTarget } from '@qdb/shared';

type MetadataFetch = <T>(path: string) => Promise<T>;

interface LookupAttributeMetadata {
  Targets?: string[];
}

export class LookupTargetResolver {
  private readonly targets = new Map<string, LookupJoinTarget | null>();

  constructor(private readonly fetchMetadata: MetadataFetch) {}

  /**
   * Resolves the join target for each lookup attribute, skipping any that cannot be
   * resolved — the emitter drops those conditions and reports them.
   *
   * `known` short-circuits the metadata call for attributes whose target the caller
   * already holds (the grid column config).
   */
  async resolveAll(
    entityLogicalName: string,
    attributes: string[],
    known: Record<string, string | undefined> = {},
  ): Promise<Record<string, LookupJoinTarget>> {
    const resolved: Record<string, LookupJoinTarget> = {};

    for (const attribute of attributes) {
      const knownTarget = known[attribute];
      if (knownTarget) {
        resolved[attribute] = { entityLogicalName: knownTarget };
        continue;
      }

      const target = await this.resolve(entityLogicalName, attribute);
      if (target) resolved[attribute] = target;
    }

    return resolved;
  }

  /** The table `attribute` points at, or null when it is not a lookup or cannot be read. */
  async resolve(entityLogicalName: string, attribute: string): Promise<LookupJoinTarget | null> {
    const cacheKey = `${entityLogicalName}.${attribute}`;
    const cached = this.targets.get(cacheKey);
    if (cached !== undefined) return cached;

    let target: LookupJoinTarget | null = null;
    try {
      const metadata = await this.fetchMetadata<LookupAttributeMetadata>(
        `/EntityDefinitions(LogicalName='${entityLogicalName}')`
        + `/Attributes(LogicalName='${attribute}')`
        + '/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=Targets',
      );
      // A polymorphic lookup lists several targets; a join can only address one, so the
      // first is used. Makers who need another must filter on that column directly.
      const [firstTarget] = metadata.Targets ?? [];
      if (firstTarget) target = { entityLogicalName: firstTarget };
      else logger.warn({ entityLogicalName, attribute }, 'Lookup attribute has no target table');
    } catch (error) {
      logger.warn(
        { entityLogicalName, attribute, error },
        'Lookup target could not be resolved — the filter condition will be dropped',
      );
    }

    this.targets.set(cacheKey, target);
    return target;
  }
}
