/**
 * The workspace's own classes, driven from node against a real organisation.
 *
 * Every Phase 5 and Phase 6 live smoke needs the same thing: `XrmCrmAdapter` and the write transport
 * running **unmodified**, with the one unavoidable difference that node has no session cookie and
 * attaches a bearer token instead. That boundary is KI-67, and it is the only difference.
 *
 * It lives here because it had been copied once already, and a copy is how a harness drifts from the
 * production path it is supposed to be proving. The `createOnly` method is the case in point: added
 * to `WriteTransport` for idempotent create, it would have had to be added to each copy separately,
 * and a smoke missing it would silently stop exercising the guard.
 *
 * The shims are deliberately **stricter** than convenient. `Xrm.WebApi` here refuses an options
 * string that does not begin with `?`, exactly as the real client API does — that defect reached a
 * user in Phase 5 because the then-shim was more forgiving than the platform, and a harness friendlier
 * than the platform proves nothing.
 */

import { buildHeaders } from './crm-client.mjs';
import { SOLUTION_NAME } from './qdb-plugin-steps.mjs';
import { XrmCrmAdapter } from '../../../apps/web/src/platform/XrmCrmAdapter.js';
import {
  readResponse, READ_PREFER, WRITE_PREFER,
  type WriteResponse, type WriteTransport,
} from '../../../apps/web/src/platform/writeTransport.js';
import type { XrmLike } from '../../../apps/web/src/platform/crmContext.js';

/**
 * Entity set for a logical name, so the shim can build the URL the client API hides.
 *
 * Listed rather than pluralised, because the platform's own names do not follow the rule: the
 * activity type's set is `qdb_collectionactivitytypes` and the log's is `qdb_crmlogses`. The `+ s`
 * fallback covers the ordinary cases and is wrong often enough to be worth the explicit table.
 */
const SET_FOR_LOGICAL: Record<string, string> = {
  qdb_collectionactivity: 'qdb_collectionactivities',
  qdb_collectionactivitytype: 'qdb_collectionactivitytypes',
  qdb_collectioncase: 'qdb_collectioncases',
  qdb_activityoutcome: 'qdb_activityoutcomes',
  qdb_collectionstrategy: 'qdb_collectionstrategies',
  qdb_strategyaction: 'qdb_strategyactions',
  qdb_delinquencysnapshot: 'qdb_delinquencysnapshots',
  qdb_identityexception: 'qdb_identityexceptions',
  qdb_platformconfiguration: 'qdb_platformconfigurations',
  qdb_platformmapping: 'qdb_platformmappings',
  qdb_crmlogs: 'qdb_crmlogses',
  contact: 'contacts',
  account: 'accounts',
};

export const setFor = (logicalName: string): string => SET_FOR_LOGICAL[logicalName] ?? `${logicalName}s`;

/** How many round trips the harness has made — bounded-paging claims need a measured number. */
export interface HarnessCounters {
  reads: number;
  writes: number;
}

export interface NodeHarness {
  adapter: XrmCrmAdapter;
  transport: WriteTransport;
  counters: HarnessCounters;
}

const OPTIONS_MUST_BEGIN_WITH_QUESTION_MARK = 'UciError: Option Parameter should begin with "?"';

/** Builds the adapter, its transport and the counters, all sharing one credential. */
export function buildNodeHarness(apiBase: string, token: string): NodeHarness {
  const counters: HarnessCounters = { reads: 0, writes: 0 };
  const authHeaders = () => buildHeaders(token, SOLUTION_NAME) as Record<string, string>;

  const requireLeadingQuestionMark = (options: string): void => {
    if (options && !options.startsWith('?')) throw new Error(OPTIONS_MUST_BEGIN_WITH_QUESTION_MARK);
  };

  const xrm = {
    Utility: { getGlobalContext: () => { throw new Error('not available outside a CRM session'); } },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string, options = '') {
        requireLeadingQuestionMark(options);
        counters.reads++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}(${id})${options}`, {
          headers: { ...authHeaders(), Prefer: READ_PREFER },
        });
        if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
        return res.json() as Promise<Record<string, unknown>>;
      },

      async retrieveMultipleRecords(logicalName: string, options = '', maxPageSize?: number) {
        requireLeadingQuestionMark(options);
        counters.reads++;
        // `Prefer` is a list. Joining is the whole point — replacing it is the Phase 4 defect that
        // silently dropped annotations from every paged read.
        const prefer = [READ_PREFER];
        if (maxPageSize !== undefined) prefer.push(`odata.maxpagesize=${maxPageSize}`);
        const res = await fetch(`${apiBase}/${setFor(logicalName)}${options}`, {
          headers: { ...authHeaders(), Prefer: prefer.join(',') },
        });
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
        const body = await res.json() as Record<string, unknown>;
        return {
          entities: (body['value'] ?? []) as Record<string, unknown>[],
          ...(body['@odata.nextLink'] ? { nextLink: String(body['@odata.nextLink']) } : {}),
          ...(body['@odata.count'] !== undefined ? { '@odata.count': body['@odata.count'] } : {}),
        };
      },

      async createRecord(logicalName: string, values: Record<string, unknown>) {
        counters.writes++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
        // A Dataverse POST answers 204 with an empty body; the id is only in `OData-EntityId`.
        return { id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? '' };
      },

      async updateRecord(logicalName: string, id: string, values: Record<string, unknown>) {
        counters.writes++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}(${id})`, {
          method: 'PATCH', headers: authHeaders(), body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { id };
      },
    },
  } as unknown as XrmLike;

  /** The production transport's own parsing, over node's credential. */
  const transport: WriteTransport = {
    async get(url: string): Promise<WriteResponse> {
      counters.reads++;
      return readResponse(await fetch(`${apiBase}${url}`, {
        headers: { ...authHeaders(), Prefer: READ_PREFER },
      }));
    },

    async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
      counters.writes++;
      const headers: Record<string, string> = { ...authHeaders(), Prefer: WRITE_PREFER };
      if (ifMatch !== undefined) headers['If-Match'] = ifMatch;
      return readResponse(await fetch(`${apiBase}${url}`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
      }));
    },

    async createOnly(url: string, body: unknown): Promise<WriteResponse> {
      counters.writes++;
      // `If-None-Match: *` means "the record must not exist" — the exact opposite of `If-Match: *`,
      // which means "any version, so long as it does" (KI-68).
      const headers = { ...authHeaders(), Prefer: WRITE_PREFER, 'If-None-Match': '*' };
      return readResponse(await fetch(`${apiBase}${url}`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
      }));
    },
  };

  return { adapter: new XrmCrmAdapter(xrm, undefined, transport), transport, counters };
}
