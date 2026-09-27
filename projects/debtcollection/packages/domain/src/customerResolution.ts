/**
 * Customer identity resolution — from MIS identifiers to the CRM customer master.
 *
 * CRM is the authoritative Customer Master: `contact` for Housing Loan, `account` for BFD. Which
 * table and which column carry the identifier come from platform configuration, never from here.
 * This module holds the decision rules only; a service performs the lookups and hands the matches in.
 *
 * Rules (F4): the national id (QID) is primary; the MIS customer number cross-checks it when both are
 * available; a disagreement is an exception, not a guess. A mobile number can never be an input —
 * `CustomerIdentitySchema` makes that structural.
 */

import { z } from 'zod';
import { type CustomerIdentity, hasUsableCustomerIdentity } from './misObservation.js';

export const CustomerMasterEntitySchema = z.enum(['contact', 'account']);
export type CustomerMasterEntity = z.infer<typeof CustomerMasterEntitySchema>;

/** A customer master record as a resolver sees it: where it lives and what identified it. */
export const ResolvedCustomerSchema = z.object({
  entity: CustomerMasterEntitySchema,
  id: z.string().uuid(),
  /** The business identifier the record was matched on, echoed for the case and snapshot. */
  businessId: z.string().min(1),
  displayName: z.string().optional(),
});
export type ResolvedCustomer = z.infer<typeof ResolvedCustomerSchema>;

/** Why resolution did not produce one customer. Maps onto `qdb_exception_reason`. */
export const CustomerResolutionFailureSchema = z.enum([
  'NoIdentifier',
  'CustomerNotFound',
  'DuplicateCustomer',
  'IdentifierMismatch',
]);
export type CustomerResolutionFailure = z.infer<typeof CustomerResolutionFailureSchema>;

export type CustomerResolution =
  | { kind: 'Resolved'; customer: ResolvedCustomer; matchedOn: 'nationalId' | 'customerNumber' }
  | { kind: 'Failed'; failure: CustomerResolutionFailure; detail: string };

/** What the service looked up, before the rules are applied. */
export interface CustomerLookupResult {
  /** Records whose configured business-id column equals the national id (empty when none supplied). */
  byNationalId: readonly ResolvedCustomer[];
  /** Records whose configured customer-number column equals the MIS customer number, when that column is mapped. */
  byCustomerNumber: readonly ResolvedCustomer[];
  /** False when the deployment has no customer-number mapping, so no cross-check is possible. */
  customerNumberLookupAvailable: boolean;
}

/**
 * Applies the resolution rules to the lookups the service performed.
 *
 * - No identifier at all → `NoIdentifier`.
 * - National id supplied: exactly one match is required; more than one is `DuplicateCustomer`.
 *   If a customer number was also supplied and the deployment can look it up, the two must agree on
 *   the same record; otherwise `IdentifierMismatch`.
 * - No national id: fall back to the customer number with the same one-match rule.
 */
export function decideCustomerResolution(identity: CustomerIdentity, lookup: CustomerLookupResult): CustomerResolution {
  if (!hasUsableCustomerIdentity(identity)) {
    return { kind: 'Failed', failure: 'NoIdentifier', detail: 'neither a national id nor a customer number was supplied' };
  }

  if (identity.nationalId !== undefined) return resolveByNationalId(identity, lookup);
  return resolveByCustomerNumber(lookup);
}

function resolveByNationalId(identity: CustomerIdentity, lookup: CustomerLookupResult): CustomerResolution {
  const primary = lookup.byNationalId;
  if (primary.length === 0) {
    return { kind: 'Failed', failure: 'CustomerNotFound', detail: 'no customer master record carries the supplied national id' };
  }
  if (primary.length > 1) {
    return { kind: 'Failed', failure: 'DuplicateCustomer', detail: `${primary.length} customer master records carry the same national id` };
  }

  const match = primary[0]!;
  const crossCheck = crossCheckCustomerNumber(match, identity, lookup);
  if (crossCheck) return crossCheck;

  return { kind: 'Resolved', customer: match, matchedOn: 'nationalId' };
}

/** Returns a failure when the customer number points somewhere else than the national id did. */
function crossCheckCustomerNumber(match: ResolvedCustomer, identity: CustomerIdentity, lookup: CustomerLookupResult): CustomerResolution | null {
  if (identity.customerNumber === undefined || !lookup.customerNumberLookupAvailable) return null;
  const secondary = lookup.byCustomerNumber;
  if (secondary.length === 0) return null; // no record carries the number: nothing to contradict
  const agrees = secondary.some(c => c.entity === match.entity && c.id === match.id);
  if (agrees) return null;
  return {
    kind: 'Failed',
    failure: 'IdentifierMismatch',
    detail: 'the national id and the customer number resolve to different customer master records',
  };
}

function resolveByCustomerNumber(lookup: CustomerLookupResult): CustomerResolution {
  if (!lookup.customerNumberLookupAvailable) {
    return { kind: 'Failed', failure: 'CustomerNotFound', detail: 'only a customer number was supplied and this deployment has no customer-number mapping' };
  }
  const matches = lookup.byCustomerNumber;
  if (matches.length === 0) {
    return { kind: 'Failed', failure: 'CustomerNotFound', detail: 'no customer master record carries the supplied customer number' };
  }
  if (matches.length > 1) {
    return { kind: 'Failed', failure: 'DuplicateCustomer', detail: `${matches.length} customer master records carry the same customer number` };
  }
  return { kind: 'Resolved', customer: matches[0]!, matchedOn: 'customerNumber' };
}

/** The port a service implements: perform the lookups and apply `decideCustomerResolution`. */
export interface ICustomerResolver {
  resolve(identity: CustomerIdentity, context: { correlationId?: string }): Promise<CustomerResolution>;
}
