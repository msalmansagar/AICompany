import type { DataverseClient } from '@dcp/dataverse-client';
import { ComplaintAccessError } from './ComplaintErrors.js';

interface SystemUserRow {
  systemuserid: string;
}

/** Quotes a value for an OData string literal. */
export function odataLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Finds the signed-in person's user record in one CRM organisation.
 *
 * HL CRM and Case Management (QDB1) are separate organisations with separate user records, so the
 * same person has a different `systemuserid` in each. Both are found by the primary email the
 * identity provider vouches for, and both must be unique and enabled — a person who is not an
 * enabled user of an organisation cannot act in it, and the complaint is refused rather than
 * raised under someone else.
 */
export async function resolveCrmUserId(
  client: DataverseClient,
  email: string | undefined,
  organisationLabel: string,
): Promise<string> {
  if (!email) throw new ComplaintAccessError('The sign-in carries no email address to identify the CRM user');
  const result = await client.getList<SystemUserRow>('systemusers', {
    select: ['systemuserid'],
    filter: `internalemailaddress eq ${odataLiteral(email)} and isdisabled eq false`,
    top: 2,
  });
  if (result.value.length !== 1) {
    throw new ComplaintAccessError(
      `${organisationLabel} has ${result.value.length === 0 ? 'no enabled user' : 'more than one enabled user'} for the signed-in account`,
    );
  }
  return result.value[0]!.systemuserid;
}
