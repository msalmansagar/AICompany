import type { OrganizationCode } from './platformConfiguration.js';

/**
 * A Collection Activity's reference to a record owned by one of QDB's centralised processes.
 *
 * Case Management (complaints) and Legal exist only in BFD CRM and serve HL and BFD customers alike,
 * so a Collection Activity in either organisation refers to them the same way: by organisation,
 * record type, record id and the number the owning system issued — never by a native lookup, which
 * cannot cross organisations and would make DCP's solution depend on tables HL CRM does not have
 * (docs/ExternalProcessReference.md).
 *
 * The reference is identity only. Status, owner and dates belong to the owning module and are read
 * from it when shown; DCP keeps no second copy.
 */
export type ExternalProcess = 'Complaint' | 'Legal';

/** The table each centralised process keeps its records in. */
export const EXTERNAL_PROCESS_RECORD_TYPES: Readonly<Record<ExternalProcess, string>> = {
  Complaint: 'incident',
  Legal: 'qdb_qdblegal',
};

/** Where each process lives: both are hosted by BFD CRM for both customer populations. */
export const EXTERNAL_PROCESS_HOSTS: Readonly<Record<ExternalProcess, OrganizationCode>> = {
  Complaint: 'BFD',
  Legal: 'BFD',
};

export interface ExternalProcessReference {
  process: ExternalProcess;
  organization: OrganizationCode;
  recordId: string;
  /** The owning system's own number, when it has been recorded. */
  recordNumber?: string;
}

/** The process a stored record type names, or undefined for anything else (fax, email, …). */
export function externalProcessOf(recordType: string | undefined): ExternalProcess | undefined {
  const normalised = recordType?.trim().toLowerCase();
  return (Object.keys(EXTERNAL_PROCESS_RECORD_TYPES) as ExternalProcess[])
    .find(process => EXTERNAL_PROCESS_RECORD_TYPES[process] === normalised);
}

/** The four stored columns, as a Collection Activity carries them. */
export interface StoredRelatedRecord {
  recordType?: string;
  recordId?: string;
  organization?: OrganizationCode;
  recordNumber?: string;
}

/**
 * The reference an activity carries, or undefined when it carries none.
 *
 * A reference needs its process, its organisation and its id; a row with any of the three missing
 * is a hand-off that was requested and has not (yet) produced a record, not a reference.
 */
export function readExternalReference(stored: StoredRelatedRecord): ExternalProcessReference | undefined {
  const process = externalProcessOf(stored.recordType);
  if (!process || !stored.organization || !stored.recordId) return undefined;
  return {
    process,
    organization: stored.organization,
    recordId: stored.recordId,
    ...(stored.recordNumber ? { recordNumber: stored.recordNumber } : {}),
  };
}

/** True when the activity was a hand-off to this process, whether or not the record exists yet. */
export function isHandOffTo(process: ExternalProcess, stored: StoredRelatedRecord): boolean {
  return externalProcessOf(stored.recordType) === process;
}

/**
 * The code suffix of the combined dispute/complaint activity type (KI-118).
 *
 * The **code** is matched, never the display name, and a separator is required so the display name
 * "Complaint / Dispute" cannot match. An activity of this type with a Case Management reference
 * raised a formal Complaint; one without is a Collection Dispute. Shared by the workspace and the
 * Integration Service so both classify the same activity the same way.
 */
const CONCERN_CODE_SUFFIX = 'DISPUTE';

export function isConcernTypeCode(code: string | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return upper === CONCERN_CODE_SUFFIX || upper.endsWith(`-${CONCERN_CODE_SUFFIX}`);
}
