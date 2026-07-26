// DFE-BARSRC-001: reads the numbers behind a utilization bar from a CRM record.
//
// The client sends only a field id and a record id. The entity and the three attributes come
// from the field's own bar config, so a caller cannot use this to read arbitrary columns from
// arbitrary tables — the configuration is the allow-list.
import { CrmBaseService } from './CrmBaseService.js';
import { EntitySetNameResolver } from './EntitySetNameResolver.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CrmAuthService } from './CrmAuthService.js';
import type { BarSourceConfig } from '@qdb/shared';

export interface BarSourceValues {
  /** Absent minAttribute means the bar starts at zero, matching the field-based behaviour. */
  min: number;
  max: number;
  value: number;
}

const GUID_PATTERN = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

export class BarSourceService extends CrmBaseService {
  private readonly entitySetNames: EntitySetNameResolver;

  constructor(authService: CrmAuthService) {
    super(authService);
    this.entitySetNames = new EntitySetNameResolver((path) => this.crmFetch(path));
  }

  /**
   * Reads min, max and value for one record. Throws when the record cannot be read so the
   * caller can surface it — a bar silently showing zero would look like real data.
   */
  async readValues(config: BarSourceConfig, recordId: string): Promise<BarSourceValues> {
    const cleanId = recordId.replace(/[{}]/g, '');
    if (!GUID_PATTERN.test(cleanId)) {
      throw new ValidationError(`'${recordId}' is not a valid record id.`);
    }

    const attributes = [config.maxAttribute, config.valueAttribute];
    if (config.minAttribute) attributes.push(config.minAttribute);

    const entitySet = await this.entitySetNames.resolve(config.entityLogicalName);
    const select = [...new Set(attributes)].join(',');

    let record: Record<string, unknown>;
    try {
      record = await this.crmFetch<Record<string, unknown>>(
        `/${entitySet}(${cleanId})?$select=${select}`,
      );
    } catch (error) {
      logger.warn(
        { error, entity: config.entityLogicalName, recordId: cleanId },
        'Bar source record could not be read',
      );
      throw new NotFoundError(`Bar source record ${cleanId} could not be read.`);
    }

    return {
      min: config.minAttribute ? toNumber(record[config.minAttribute]) : 0,
      max: toNumber(record[config.maxAttribute]),
      value: toNumber(record[config.valueAttribute]),
    };
  }
}

/** A null column reads as zero — the bar renders empty rather than breaking. */
function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
