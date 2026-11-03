import type { CrmCallContext, CrmRecord, ICrmAdapter, MisDelinquencyRecord } from '@dcp/domain';
import { ENTITY_SETS, EXCEPTION_REASON_VALUES, EXCEPTION_STATUS_VALUES, IDENTITY_EXCEPTION, type ExceptionReason } from './qdbBindings.js';

/** What an exception records about the observation it could not process. */
export interface IdentityExceptionInput {
  reason: ExceptionReason;
  detail: string;
  record: MisDelinquencyRecord;
  receivedOn: string;
}

/**
 * Records observations that could not be resolved — an unknown customer, an ambiguous identifier, a
 * malformed MIS facility identity. No case and no master record is created; the exception carries
 * the source identifiers so the observation can be reprocessed once the data is corrected.
 */
export class IdentityExceptionRepository {
  constructor(private readonly crm: ICrmAdapter) {}

  async create(input: IdentityExceptionInput, context: CrmCallContext = {}): Promise<string> {
    const { record } = input;
    const customerBusinessId = record.customer.nationalId ?? record.customer.customerNumber ?? '';
    const values: CrmRecord = {
      [IDENTITY_EXCEPTION.name]: `${input.reason}: ${record.sourceSystem}/${record.facilityNumber || '(no facility)'}`.slice(0, 100),
      [IDENTITY_EXCEPTION.customerBusinessId]: customerBusinessId,
      [IDENTITY_EXCEPTION.facilityNumber]: record.facilityNumber,
      [IDENTITY_EXCEPTION.source]: record.sourceSystem,
      [IDENTITY_EXCEPTION.exceptionReason]: EXCEPTION_REASON_VALUES[input.reason],
      [IDENTITY_EXCEPTION.exceptionStatus]: EXCEPTION_STATUS_VALUES.Open,
      [IDENTITY_EXCEPTION.sourceReference]: input.detail.slice(0, 200),
      [IDENTITY_EXCEPTION.integrationBatchId]: record.integrationBatchId,
      [IDENTITY_EXCEPTION.receivedDate]: input.receivedOn,
      // The payload is what is needed to reprocess — identifiers and observation identity — not the
      // whole row: a contact point such as a mobile number has no business in an exception record.
      [IDENTITY_EXCEPTION.payload]: JSON.stringify({
        customer: record.customer,
        facilityNumber: record.facilityNumber,
        sourceSystem: record.sourceSystem,
        misAsOfDate: record.misAsOfDate,
        ...(record.sourceTimestamp ? { sourceTimestamp: record.sourceTimestamp } : {}),
        integrationBatchId: record.integrationBatchId,
      }),
      ...(record.correlationId ? { [IDENTITY_EXCEPTION.correlationId]: record.correlationId } : {}),
    };
    return this.crm.create(ENTITY_SETS.identityException, values, context);
  }
}
