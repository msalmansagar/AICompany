import type { CaseManagementReferences } from './CaseManagementReferenceResolver.js';
import type { HlComplaintContext } from './HlComplaintContextReader.js';
import { HL_COMPLAINT_MAPPING } from './hlComplaintMapping.js';

/** Everything the HL complaint record is built from — all of it resolved on the server. */
export interface HlComplaintPayloadInput {
  ownerUserId: string;
  references: CaseManagementReferences;
  context: HlComplaintContext;
  description: string;
  receivedOn: Date;
}

/**
 * The Case Management record for an HL complaint, per the approved mapping.
 *
 * Only the description comes from the officer. The customer is the Non Customer account; the real
 * HL customer's name and mobile travel as values, because HL CRM is a separate organisation and a
 * lookup cannot reach it. "Received Date" (`followupby`) is the moment of creation, which is how
 * QDB's existing complaints use it (37 of the 40 newest match their creation time).
 */
export function buildHlComplaintPayload(input: HlComplaintPayloadInput): Record<string, unknown> {
  const { references, context } = input;
  const bind = (column: keyof CaseManagementReferences['navigation']) => `${references.navigation[column]}@odata.bind`;
  return {
    description: input.description,
    qdb_customer_name: context.customerName,
    qdb_contact_name: context.customerName,
    qdb_customer_mobile_number: context.mobileNumber,
    qdb_case_source: HL_COMPLAINT_MAPPING.isExternalSource,
    qdb_existing_customer: HL_COMPLAINT_MAPPING.isExistingCustomer,
    casetypecode: references.caseTypeValue,
    caseorigincode: references.originValue,
    qdb_businessunit: references.businessUnitValue,
    followupby: input.receivedOn.toISOString(),
    [bind('customerid')]: `/accounts(${references.nonCustomerAccountId})`,
    [bind('ownerid')]: `/systemusers(${input.ownerUserId})`,
    [bind('qdb_department')]: `/businessunits(${references.departmentId})`,
    [bind('qdb_assigned_to_user')]: `/systemusers(${references.assignedUserId})`,
    [bind('qdb_product')]: `/qdb_case_productses(${references.productId})`,
  };
}
