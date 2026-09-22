import {
  PlatformConfigurationError,
  decideCustomerResolution,
  resolveField,
  type CrmCallContext,
  type CrmRecord,
  type CustomerIdentity,
  type CustomerLookupResult,
  type CustomerMasterEntity,
  type CustomerResolution,
  type ICrmAdapter,
  type ICustomerResolver,
  type PlatformConfiguration,
  type ResolvedCustomer,
} from '@dcp/domain';

/** Primary key and display-name columns of the two customer masters. Platform-native, not DCP schema. */
const MASTER_COLUMNS: Readonly<Record<CustomerMasterEntity, { entitySet: string; id: string; name: string }>> = {
  contact: { entitySet: 'contacts', id: 'contactid', name: 'fullname' },
  account: { entitySet: 'accounts', id: 'accountid', name: 'name' },
};

/**
 * Resolves MIS customer identifiers to the CRM customer master the deployment configured —
 * `contact` for Housing Loan, `account` for BFD — through the columns the configuration names.
 * The decision rules live in the domain; this class only performs the lookups.
 */
export class CustomerResolutionService implements ICustomerResolver {
  private readonly master: CustomerMasterEntity;
  private readonly customerNumberField: string | undefined;

  constructor(private readonly crm: ICrmAdapter, private readonly configuration: PlatformConfiguration) {
    this.master = masterEntityOf(configuration.customerEntity);
    this.customerNumberField = mappedCustomerNumberField(configuration);
  }

  async resolve(identity: CustomerIdentity, context: CrmCallContext = {}): Promise<CustomerResolution> {
    const lookup: CustomerLookupResult = {
      byNationalId: identity.nationalId !== undefined
        ? await this.findBy(this.configuration.customerBusinessIdField, identity.nationalId, context)
        : [],
      byCustomerNumber: identity.customerNumber !== undefined && this.customerNumberField !== undefined
        ? await this.findBy(this.customerNumberField, identity.customerNumber, context)
        : [],
      customerNumberLookupAvailable: this.customerNumberField !== undefined,
    };
    return decideCustomerResolution(identity, lookup);
  }

  private async findBy(field: string, value: string, context: CrmCallContext): Promise<ResolvedCustomer[]> {
    const columns = MASTER_COLUMNS[this.master];
    const rows = await this.crm.retrieveMultiple(columns.entitySet, {
      select: [columns.id, columns.name, field],
      filter: `${field} eq '${value.replace(/'/g, "''")}'`,
      top: 3,
    }, context);
    return rows.map(row => toResolved(row, this.master, field));
  }
}

function masterEntityOf(customerEntity: string): CustomerMasterEntity {
  const normalised = customerEntity.trim().toLowerCase();
  if (normalised === 'contact' || normalised === 'contacts') return 'contact';
  if (normalised === 'account' || normalised === 'accounts') return 'account';
  throw new PlatformConfigurationError(
    `Customer master '${customerEntity}' is not a Dynamics customer entity. The Customer lookup supports contact and account only.`,
  );
}

/** The column holding the MIS customer number, when the deployment has mapped one. */
function mappedCustomerNumberField(configuration: PlatformConfiguration): string | undefined {
  try {
    return resolveField(configuration, 'Customer', 'customerNumber').field;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) return undefined;
    throw error;
  }
}

function toResolved(row: CrmRecord, entity: CustomerMasterEntity, matchedField: string): ResolvedCustomer {
  const columns = MASTER_COLUMNS[entity];
  const displayName = row[columns.name];
  return {
    entity,
    id: String(row[columns.id]),
    businessId: String(row[matchedField]),
    ...(typeof displayName === 'string' ? { displayName } : {}),
  };
}
