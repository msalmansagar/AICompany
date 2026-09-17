import {
  PlatformConfigurationError,
  PlatformConfigurationSchema,
  type AccessMode,
  type BusinessObject,
  type FieldMapping,
  type ICrmAdapter,
  type IPlatformConfigurationService,
  type OrganizationCode,
  type PlatformConfiguration,
  type PlatformType,
  type CrmRecord,
} from '@dcp/domain';

/** Entity set names for the two QDB configuration tables. */
const CONFIGURATION_ENTITY_SET = 'qdb_platformconfigurations';
const MAPPING_ENTITY_SET = 'qdb_platformmappings';

/** Columns read from qdb_platformconfiguration. */
const CONFIGURATION_COLUMNS = [
  'qdb_name',
  'qdb_platformtype',
  'qdb_organizationcode',
  'qdb_environmentcode',
  'qdb_customerentity',
  'qdb_customerbusinessidfield',
  'qdb_facilityentity',
  'qdb_facilitybusinessidfield',
  'qdb_eligibilityrulesetcode',
  'qdb_contactholdrulesetcode',
  'qdb_snapshotpolicy',
  'qdb_isactive',
];

/** Columns read from qdb_platformmapping. */
const MAPPING_COLUMNS = [
  'qdb_businessobject',
  'qdb_canonicalfield',
  'qdb_crmentitylogicalname',
  'qdb_crmfieldlogicalname',
  'qdb_isrequired',
  'qdb_accessmode',
  'qdb_isactive',
];

/**
 * Choice values as provisioned under the QDB publisher. They are a translation table between the
 * organisation's integers and the canonical vocabulary, deliberately kept in one place so no other
 * module needs to know an option-set number.
 */
const BUSINESS_OBJECT_BY_VALUE: Record<number, BusinessObject> = {
  100000380: 'Customer',
  100000381: 'Facility',
  100000382: 'Case',
  100000383: 'Activity',
  100000384: 'Communication',
  100000385: 'Document',
};

const ACCESS_MODE_BY_VALUE: Record<number, AccessMode> = {
  100000400: 'Read',
  100000401: 'Write',
  100000402: 'ReadWrite',
};

const ORGANIZATION_CODE_VALUE: Record<OrganizationCode, number> = {
  HL: 100000140,
  BFD: 100000141,
};

const PLATFORM_TYPE_BY_VALUE: Record<number, PlatformType> = {
  100000120: 'OnPrem',
  100000121: 'Cloud',
};

const SNAPSHOT_POLICY_BY_VALUE: Record<number, 'AllReceived' | 'EligibleOnly' | 'ChangedOnly'> = {
  100000280: 'AllReceived',
  100000281: 'EligibleOnly',
  100000282: 'ChangedOnly',
};

/**
 * Reads the deployment's shape from the two QDB configuration tables.
 *
 * This is the only place that knows a Housing Loan organisation keeps customers on `contact` while
 * BFD keeps them on `account` — and it knows it by reading a row, not by carrying a constant.
 * Collection services ask for a resolved configuration and work from that.
 *
 * Configuration changes rarely and is read on nearly every request, so it is cached per organisation
 * for a bounded time. The cache can be cleared when an administrator publishes a change.
 */
export class PlatformConfigurationService implements IPlatformConfigurationService {
  private readonly cache = new Map<string, { value: PlatformConfiguration; expiresAt: number }>();

  /**
   * @param crm adapter used to read the configuration tables
   * @param options cache lifetime and the API version this target speaks
   */
  constructor(
    private readonly crm: ICrmAdapter,
    private readonly options: { apiVersion: string; cacheTtlMs: number },
  ) {}

  /** @inheritdoc */
  async getConfiguration(organizationCode: OrganizationCode): Promise<PlatformConfiguration> {
    const cached = this.cache.get(organizationCode);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.loadConfiguration(organizationCode);
    this.cache.set(organizationCode, { value, expiresAt: Date.now() + this.options.cacheTtlMs });
    return value;
  }

  /** Drops cached configuration so the next read reflects a published change. */
  clearCache(): void {
    this.cache.clear();
  }

  private async loadConfiguration(organizationCode: OrganizationCode): Promise<PlatformConfiguration> {
    const row = await this.readConfigurationRow(organizationCode);
    const mappings = await this.readMappings();
    const platformType = PLATFORM_TYPE_BY_VALUE[row['qdb_platformtype'] as number];
    if (!platformType) {
      throw new PlatformConfigurationError(
        `Organisation ${organizationCode} has no platform type set on its qdb_platformconfiguration row. ` +
        'On-premises and cloud differ in Web API version and hosting, so the target cannot be inferred.',
      );
    }

    return PlatformConfigurationSchema.parse({
      organizationCode,
      platformType,
      apiVersion: this.options.apiVersion,
      customerEntity: row['qdb_customerentity'],
      customerBusinessIdField: row['qdb_customerbusinessidfield'],
      ...optional('facilityEntity', row['qdb_facilityentity']),
      ...optional('facilityBusinessIdField', row['qdb_facilitybusinessidfield']),
      ...optional('eligibilityRulesetCode', row['qdb_eligibilityrulesetcode']),
      ...optional('contactHoldRulesetCode', row['qdb_contactholdrulesetcode']),
      ...optional('snapshotPolicy', SNAPSHOT_POLICY_BY_VALUE[row['qdb_snapshotpolicy'] as number]),
      mappings,
    });
  }

  private async readConfigurationRow(organizationCode: OrganizationCode): Promise<CrmRecord> {
    const rows = await this.crm.retrieveMultiple(CONFIGURATION_ENTITY_SET, {
      select: CONFIGURATION_COLUMNS,
      filter: `qdb_organizationcode eq ${ORGANIZATION_CODE_VALUE[organizationCode]} and qdb_isactive eq true`,
      top: 2,
    });

    if (rows.length === 0) {
      throw new PlatformConfigurationError(
        `No active qdb_platformconfiguration row for organisation ${organizationCode}. ` +
        'The deployment must be configured before Collection services can run against it.',
      );
    }
    if (rows.length > 1) {
      throw new PlatformConfigurationError(
        `More than one active qdb_platformconfiguration row for organisation ${organizationCode}. ` +
        'Exactly one must be active, or the shape of the deployment is ambiguous.',
      );
    }
    return rows[0] as CrmRecord;
  }

  private async readMappings(): Promise<FieldMapping[]> {
    const rows = await this.crm.retrieveMultiple(MAPPING_ENTITY_SET, {
      select: MAPPING_COLUMNS,
      filter: 'qdb_isactive eq true',
    });
    return rows.map(toFieldMapping).filter((mapping): mapping is FieldMapping => mapping !== null);
  }
}

/**
 * Converts one mapping row, or returns `null` when its choice values are outside the canonical
 * vocabulary — a row describing a business object this version does not model is skipped rather than
 * failing the whole configuration load.
 */
function toFieldMapping(row: CrmRecord): FieldMapping | null {
  const businessObject = BUSINESS_OBJECT_BY_VALUE[row['qdb_businessobject'] as number];
  const accessMode = ACCESS_MODE_BY_VALUE[row['qdb_accessmode'] as number];
  if (!businessObject || !accessMode) return null;

  return {
    businessObject,
    accessMode,
    canonicalField: String(row['qdb_canonicalfield'] ?? ''),
    entity: String(row['qdb_crmentitylogicalname'] ?? ''),
    field: String(row['qdb_crmfieldlogicalname'] ?? ''),
    isRequired: row['qdb_isrequired'] === true,
  };
}

/** Includes a key only when the organisation actually supplied a value. */
function optional(key: string, value: unknown): Record<string, unknown> {
  return value === null || value === undefined || value === '' ? {} : { [key]: value };
}

