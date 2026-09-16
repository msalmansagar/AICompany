import type { DataverseClient } from '@dcp/dataverse-client';
import { CrmNotFoundError } from '@dcp/dataverse-client';
import type { Customer } from '@dcp/types';
import { ENTITY_SETS, PII_FIELDS, ok, err } from '@dcp/types';
import type { Result, DomainError } from '@dcp/types';
import { makeDomainError } from '@dcp/types';

/**
 * Reads a customer record by QID alternate key (FR-001 / FR-014).
 * Masking is applied here — the router never returns unmasked PII to a
 * caller without the View Sensitive PII claim.
 */
export async function findCustomerByQid(
  client: DataverseClient,
  qid: string,
  correlationId: string,
): Promise<Result<Customer, DomainError>> {
  try {
    const record = await client.getByAlternateKey<Customer>(
      ENTITY_SETS.CUSTOMER,
      'msst_qid',
      qid,
      {},
      { correlationId },
    );
    return ok(record);
  } catch (error) {
    if (error instanceof CrmNotFoundError) {
      return err(makeDomainError('customer_not_found', `Customer with QID '${qid}' not found`, correlationId));
    }
    throw error;
  }
}

/**
 * Masks PII fields on a customer record for callers without View Sensitive PII.
 * Returns a new object — never mutates the original (immutability rule).
 */
export function maskCustomerPii(customer: Customer, hasViewSensitivePii: boolean): Customer {
  if (hasViewSensitivePii) return customer;
  const masked: Customer = { ...customer };
  for (const field of PII_FIELDS) {
    delete (masked as Record<string, unknown>)[field];
  }
  return masked;
}
