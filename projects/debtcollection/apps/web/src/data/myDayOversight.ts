import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { scopeThroughCase } from './activityScope.js';
import type { CountRequest } from './counts.js';
import { ENTITY_SETS, PTP_STATUS_LABELS } from './schema.js';
import { codeFor } from './collectionQueries.js';

/**
 * My Day's operational oversight — what an officer needs to know now, as lightweight DCP reads.
 *
 * These are counts the platform answers directly (`$count`) plus one server-side sum; none of them
 * goes through the Report Engine, because an officer's immediate workload must be there whether or
 * not reporting is. Every figure's semantics are stated on the tile: a follow-up is *overdue* when
 * its date is before now, a promise is *due* when its recorded date falls in the stated window and
 * its recorded status is Active. "My" here means the CRM owner; every other count is the portfolio
 * within the chosen CRM scope (KI-09).
 */
export interface MyDayOversightRequest {
  /** The case-level organisation clause, or undefined for both CRMs. */
  scopeFilter?: string | undefined;
  /** The signed-in user, for the work owned by them. */
  userId?: string | undefined;
  now: Date;
  /** How far ahead "due" looks for promises, in days. Stated on the tile; never a policy. */
  promiseHorizonDays: number;
}

export const PROMISE_ACTIVE = codeFor(PTP_STATUS_LABELS, 'Active');

export function myDayCountRequests(request: MyDayOversightRequest): readonly CountRequest[] {
  const onCase = (clause: string) => (request.scopeFilter ? `${request.scopeFilter} and ${clause}` : clause);
  const onActivity = (clause: string) => (request.scopeFilter ? `${scopeThroughCase(request.scopeFilter)} and ${clause}` : clause);
  const now = request.now.toISOString();
  const dayStart = startOfDay(request.now).toISOString();
  const horizon = new Date(startOfDay(request.now).getTime() + request.promiseHorizonDays * 86_400_000).toISOString();
  return [
    { key: 'open', entitySet: ENTITY_SETS.collectionCase, filter: onCase('statecode eq 0') },
    { key: 'followUpsOverdue', entitySet: ENTITY_SETS.collectionActivity, filter: onActivity(`qdb_followupdate ne null and statecode eq 0 and qdb_followupdate lt ${now}`) },
    { key: 'followUpsUpcoming', entitySet: ENTITY_SETS.collectionActivity, filter: onActivity(`qdb_followupdate ne null and statecode eq 0 and qdb_followupdate ge ${now}`) },
    { key: 'promisesDue', entitySet: ENTITY_SETS.collectionActivity, filter: onActivity(`qdb_ptpdate ne null and qdb_ptpstatus eq ${PROMISE_ACTIVE} and qdb_ptpdate ge ${dayStart} and qdb_ptpdate lt ${horizon}`) },
    { key: 'awaitingAssignment', entitySet: ENTITY_SETS.collectionActivity, filter: onActivity('statecode eq 0 and _ownerid_value eq null') },
    ...(request.userId ? [{ key: 'myOpenWork', entitySet: ENTITY_SETS.collectionActivity, filter: onActivity(`statecode eq 0 and _ownerid_value eq ${request.userId}`) }] : []),
    { key: 'identityExceptions', entitySet: ENTITY_SETS.identityException, filter: 'statecode eq 0' },
  ];
}

function startOfDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/** The sum of MIS-reported current arrears over open cases in scope — one aggregate, no rows. */
export function openArrearsFetchXml(scopeFilter: string | undefined): string {
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/>'
    + `<filter><condition attribute="statecode" operator="eq" value="0"/>${scopeCondition(scopeFilter)}</filter>`
    + '</entity></fetch>';
}

/** `qdb_organizationcode eq 100000140`, as the scope hands it over, as one FetchXML condition. */
export function scopeCondition(scopeFilter: string | undefined): string {
  if (!scopeFilter) return '';
  const match = /^qdb_organizationcode eq (\d+)$/.exec(scopeFilter);
  if (!match) throw new Error(`The CRM scope filter is not one an aggregate can render: ${scopeFilter}`);
  return `<condition attribute="qdb_organizationcode" operator="eq" value="${match[1]}"/>`;
}

/** The sum, or `null` when the platform refused — unknown, never zero. */
export async function loadOpenArrears(adapter: XrmCrmAdapter, scopeFilter: string | undefined): Promise<number | null> {
  const rows = await adapter.aggregate(ENTITY_SETS.collectionCase, openArrearsFetchXml(scopeFilter));
  if (rows === null) return null;
  const value = rows[0]?.['arrears'];
  return typeof value === 'number' ? value : 0;
}
