import { CrmApiError, type DataverseClient } from '@dcp/dataverse-client';
import { CASE, ORGANIZATION_CODE_VALUES } from '../collection/qdbBindings.js';
import { CollectionCaseNotFoundError, ComplaintAccessError, ComplaintContextError } from './ComplaintErrors.js';

/** What an HL complaint carries from the Collection Case into Case Management. */
export interface HlComplaintContext {
  collectionCaseId: string;
  collectionCaseNumber: string;
  loanAccountNumber: string;
  customerName: string;
  mobileNumber: string;
}

const CUSTOMER_VALUE = CASE.customerLookupValue;

type Row = Record<string, unknown>;

/**
 * Reads the Collection Case and its HL customer **as the signed-in user** (`MSCRMCallerID`), so HL
 * CRM's own security decides whether this person may see the case — DCP does not re-implement it.
 * The customer's name and mobile come from the HL contact, never from the client.
 */
export async function readHlComplaintContext(
  hlClient: DataverseClient,
  collectionCaseId: string,
  hlUserId: string,
): Promise<HlComplaintContext> {
  const collectionCase = await readAsUser(hlClient, 'qdb_collectioncases', collectionCaseId, hlUserId, [
    CASE.caseNumber, CASE.facilityNumber, CASE.organizationCode, CUSTOMER_VALUE,
  ]);
  assertHlContactCase(collectionCase);
  const contact = await readAsUser(hlClient, 'contacts', String(collectionCase[CUSTOMER_VALUE]), hlUserId, ['fullname', 'mobilephone']);
  return {
    collectionCaseId,
    collectionCaseNumber: requiredText(collectionCase, CASE.caseNumber, 'Collection Case number'),
    loanAccountNumber: requiredText(collectionCase, CASE.facilityNumber, 'HL Loan Account number'),
    customerName: requiredText(contact, 'fullname', "customer's name"),
    mobileNumber: requiredText(contact, 'mobilephone', "customer's mobile number"),
  };
}

function assertHlContactCase(collectionCase: Row): void {
  if (collectionCase[CASE.organizationCode] !== ORGANIZATION_CODE_VALUES.HL) {
    throw new ComplaintContextError('Only Housing Loan Collection Cases can raise a complaint through this mapping');
  }
  if (collectionCase[CASE.customerLookupEntity] !== 'contact' || !collectionCase[CUSTOMER_VALUE]) {
    throw new ComplaintContextError('The Collection Case has no HL contact as its customer');
  }
}

function requiredText(row: Row, column: string, meaning: string): string {
  const value = row[column];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ComplaintContextError(`The ${meaning} is missing; Case Management requires it`);
  }
  return value.trim();
}

async function readAsUser(client: DataverseClient, entitySet: string, id: string, userId: string, select: string[]): Promise<Row> {
  try {
    return await client.getById<Row>(entitySet, id, { select }, { callerId: userId });
  } catch (error) {
    if (error instanceof CrmApiError && error.httpStatus === 404) throw new CollectionCaseNotFoundError(id);
    if (error instanceof CrmApiError && error.httpStatus === 403) {
      throw new ComplaintAccessError('HL CRM does not allow this user to read the Collection Case or its customer');
    }
    throw error;
  }
}
