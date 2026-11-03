import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import { ComplaintConfigurationError } from './ComplaintErrors.js';
import { odataLiteral } from './CrmUserDirectory.js';
import { HL_COMPLAINT_MAPPING } from './hlComplaintMapping.js';

/** Everything in Case Management an HL complaint points at, resolved for one request. */
export interface CaseManagementReferences {
  nonCustomerAccountId: string;
  departmentId: string;
  assignedUserId: string;
  productId: string;
  caseTypeValue: number;
  originValue: number;
  businessUnitValue: number;
  navigation: Readonly<Record<LookupColumn, string>>;
}

export type LookupColumn = 'customerid' | 'ownerid' | 'qdb_department' | 'qdb_assigned_to_user' | 'qdb_product';

type Row = Record<string, unknown>;
const INCIDENT = "EntityDefinitions(LogicalName='incident')";
const LOOKUP_TARGETS: Readonly<Record<LookupColumn, string>> = {
  customerid: 'account', ownerid: 'systemuser', qdb_department: 'businessunit',
  qdb_assigned_to_user: 'systemuser', qdb_product: 'qdb_case_products',
};

/**
 * Resolves the approved HL mapping against the Case Management organisation, with its service
 * identity. Records are found by exact name, option values by exact label, and lookup navigation
 * names from metadata — so nothing depends on a GUID or number that differs between QDB1 and a
 * test organisation. Anything missing, disabled or ambiguous refuses the complaint.
 */
export async function resolveCaseManagementReferences(
  bfdClient: DataverseClient,
  nonCustomerAccountId: string,
): Promise<CaseManagementReferences> {
  const department = await resolveDepartment(bfdClient);
  return {
    nonCustomerAccountId: await verifyNonCustomerAccount(bfdClient, nonCustomerAccountId),
    departmentId: department.id,
    assignedUserId: department.managerId,
    productId: await resolveProduct(bfdClient),
    caseTypeValue: await resolveOptionValue(bfdClient, 'casetypecode', HL_COMPLAINT_MAPPING.caseTypeLabel),
    originValue: await resolveOptionValue(bfdClient, 'caseorigincode', HL_COMPLAINT_MAPPING.originLabel),
    businessUnitValue: await resolveOptionValue(bfdClient, 'qdb_businessunit', HL_COMPLAINT_MAPPING.businessUnitLabel),
    navigation: await resolveNavigationNames(bfdClient),
  };
}

/**
 * The configured Non Customer account, checked rather than trusted: it must exist, be active and
 * carry the approved name. A wrong id in configuration refuses complaints instead of filing them
 * against some other customer.
 */
async function verifyNonCustomerAccount(client: DataverseClient, accountId: string): Promise<string> {
  const account = await readConfigured(client, 'accounts', accountId, ['name', 'statecode']);
  if (account['statecode'] !== 0 || account['name'] !== HL_COMPLAINT_MAPPING.nonCustomerAccountName) {
    throw new ComplaintConfigurationError(
      `The configured Non Customer account is not an active account named "${HL_COMPLAINT_MAPPING.nonCustomerAccountName}"`,
    );
  }
  return accountId;
}

async function readConfigured(client: DataverseClient, entitySet: string, id: string, select: string[]): Promise<Row> {
  try {
    return await client.getById<Row>(entitySet, id, { select });
  } catch (error) {
    if (error instanceof CrmApiError && error.httpStatus === 404) {
      throw new ComplaintConfigurationError(`The configured ${entitySet} record ${id} does not exist in Case Management`);
    }
    throw error;
  }
}

/** The Housing Loan business unit and its manager, who becomes Assigned To. */
async function resolveDepartment(client: DataverseClient): Promise<{ id: string; managerId: string }> {
  const unit = await exactlyOne(client, 'businessunits', {
    select: ['businessunitid', '_qdb_manager_value'],
    filter: `name eq ${odataLiteral(HL_COMPLAINT_MAPPING.departmentName)} and isdisabled eq false`,
  }, `business unit "${HL_COMPLAINT_MAPPING.departmentName}"`);
  const managerId = unit['_qdb_manager_value'];
  if (typeof managerId !== 'string' || managerId === '') {
    throw new ComplaintConfigurationError(`Business unit "${HL_COMPLAINT_MAPPING.departmentName}" has no manager to assign the complaint to`);
  }
  return { id: String(unit['businessunitid']), managerId };
}

async function resolveProduct(client: DataverseClient): Promise<string> {
  const product = await exactlyOne(client, 'qdb_case_productses', {
    select: ['qdb_case_productsid'],
    filter: `qdb_name eq ${odataLiteral(HL_COMPLAINT_MAPPING.productName)} and statecode eq 0`,
  }, `product "${HL_COMPLAINT_MAPPING.productName}"`);
  return String(product['qdb_case_productsid']);
}

async function exactlyOne(client: DataverseClient, entitySet: string, query: { select: string[]; filter: string }, meaning: string): Promise<Row> {
  const result = await client.getList<Row>(entitySet, { ...query, top: 2 });
  if (result.value.length !== 1) {
    const problem = result.value.length === 0 ? 'was not found' : 'is ambiguous (more than one active record)';
    throw new ComplaintConfigurationError(`Case Management ${meaning} ${problem}`);
  }
  return result.value[0]!;
}

interface OptionMetadata { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } } }

/** An option's value, found by its label — QDB has redefined these lists in place before (KI-123). */
async function resolveOptionValue(client: DataverseClient, column: string, label: string): Promise<number> {
  const options = await readOptions(client, column);
  const matches = options.filter(option => option.Label?.UserLocalizedLabel?.Label === label);
  if (matches.length !== 1) {
    const count = matches.length === 0 ? 'no' : 'more than one';
    throw new ComplaintConfigurationError(`Case Management field ${column} has ${count} option labelled "${label}"`);
  }
  return matches[0]!.Value;
}

/** A single metadata object, not a list: the Web API answers this path with the attribute itself. */
async function readOptions(client: DataverseClient, column: string): Promise<OptionMetadata[]> {
  try {
    const attribute = await client.getSingle<{ OptionSet?: { Options?: OptionMetadata[] } }>(
      `${INCIDENT}/Attributes(LogicalName='${column}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata`,
      { select: ['LogicalName'], expand: ['OptionSet'] },
    );
    return attribute.OptionSet?.Options ?? [];
  } catch (error) {
    if (error instanceof CrmApiError && error.httpStatus === 404) {
      throw new ComplaintConfigurationError(`Case Management has no choice field ${column}`);
    }
    throw error;
  }
}

interface RelationshipMetadata { ReferencingAttribute: string; ReferencedEntity: string; ReferencingEntityNavigationPropertyName: string }

/** The `@odata.bind` names for each lookup, read from metadata rather than guessed from casing. */
async function resolveNavigationNames(client: DataverseClient): Promise<Readonly<Record<LookupColumn, string>>> {
  const relationships = await client.getList<RelationshipMetadata>(`${INCIDENT}/ManyToOneRelationships`, {
    select: ['ReferencingAttribute', 'ReferencedEntity', 'ReferencingEntityNavigationPropertyName'],
  });
  const entries = (Object.keys(LOOKUP_TARGETS) as LookupColumn[]).map(column => {
    const match = relationships.value.find(r => r.ReferencingAttribute === column && r.ReferencedEntity === LOOKUP_TARGETS[column]);
    if (!match) throw new ComplaintConfigurationError(`Case Management has no ${column} → ${LOOKUP_TARGETS[column]} relationship`);
    return [column, match.ReferencingEntityNavigationPropertyName] as const;
  });
  return Object.fromEntries(entries) as Record<LookupColumn, string>;
}
