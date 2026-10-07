/**
 * The address that opens a record in its own organisation's CRM.
 *
 * Built at request time from the organisation's configured base URL, never stored: the reference on
 * the Collection Activity holds only organisation, type and id, so the same reference opens the
 * right record in DEV, TEST, UAT and PROD, cloud or on-prem.
 */
export function externalRecordUrl(organisationBaseUrl: string, recordType: string, recordId: string): string {
  const base = organisationBaseUrl.replace(/\/$/, '');
  return `${base}/main.aspx?etn=${encodeURIComponent(recordType)}&pagetype=entityrecord&id=${encodeURIComponent(recordId)}`;
}
