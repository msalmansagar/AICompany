import { createHash } from 'node:crypto';

/**
 * Fixed namespace for complaint ids. Changing it would let a retry after a deployment create a
 * second complaint, so it never changes.
 */
const COMPLAINT_ID_NAMESPACE = '5d0b6c1e-8a4f-4c2b-9e1d-3f7a2b6c9d40';

/** What makes one complaint submission the same submission when it is retried. */
export interface ComplaintSubmissionKey {
  collectionCaseId: string;
  requestId: string;
  userId: string;
}

/**
 * The Case Management record id for a submission, derived on the server (RFC 4122 version 5).
 *
 * The client sends a request id once per "Create Complaint" dialog and repeats it on every retry.
 * The server turns it into the `incidentid`, scoped to the Collection Case and the user, so a
 * double-click, a timeout or a network retry names the same record and the platform refuses the
 * second insert. No schema field is needed, and a client cannot aim at someone else's complaint.
 */
export function complaintIdFor(key: ComplaintSubmissionKey): string {
  const name = `${key.collectionCaseId.toLowerCase()}|${key.userId}|${key.requestId.toLowerCase()}`;
  const namespaceBytes = Buffer.from(COMPLAINT_ID_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
