import { vi } from 'vitest';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * A stand-in platform for the bulk path, behaving the way the real one was **proved** to behave.
 *
 * The bulk executor barely touches `Xrm.WebApi`: its run header, its native activities and its
 * recipient parties all go through the same-origin transport, because concurrency control needs a
 * header `Xrm.WebApi` cannot send (ADR-DCP-18). So a test that stubs only `Xrm` would exercise none
 * of it.
 *
 * Every rule below is one the live organisation taught Phase 7, and each is here so a test cannot
 * pass over the defect it produced:
 *
 *   • `If-None-Match: *` on an id that exists answers **412**, not a second record. This is what
 *     makes a repeated Send, a resumed run and a retry safe, and a fake that happily created twice
 *     would let a duplicate-sending UI pass (KI-91).
 *   • `If-Match` with a stale version answers **412**. Two workers cannot both advance one run.
 *   • A PATCH answers with a **new ETag**; without one the adapter refuses to continue (KI-70).
 *   • An activity and its recipient party are **separate** writes, and the party is a POST to the
 *     activity's own collection. A row without a party is not a communication (KI-85, KI-86).
 */

const ETAG = (version: number) => `W/"${version}"`;

export interface StoredRecord {
  record: Record<string, unknown>;
  version: number;
}

export interface PartyRow {
  activityId: string;
  partyId: string;
  mask: number;
}

/** What the fake platform holds, so a test can assert on it rather than on the screen alone. */
export class FakePlatform {
  readonly runs = new Map<string, StoredRecord>();
  readonly activities = new Map<string, Record<string, unknown>>();
  readonly parties: PartyRow[] = [];
  /**
   * How many native activity creates the platform actually **accepted**.
   *
   * Distinct from `activities.size` on purpose. A map keyed by id cannot grow when the same id is
   * created twice, so `size` would stay correct even if every duplicate protection were removed —
   * a guard that reports safety it has not established (KI-94). This counter can.
   */
  acceptedActivityCreates = 0;
  /** Every request the production transport actually made, in order. */
  readonly requests: { method: string; url: string; body?: unknown }[] = [];
  /** Set to refuse metadata, which must make bulk unavailable rather than guessed. */
  metadataReadable = true;
  frozenPopulationCapacity = 100000;

  /**
   * The rows a `$count` is answered from.
   *
   * Counting goes through the transport, not `Xrm.WebApi`, because the client API does not return
   * `@odata.count` at all (KI-96). A fake that answered counts through `Xrm` would be answering a
   * question the real platform ignores — which is exactly how the target count reached the live
   * organisation reading zero over a grid full of cases.
   */
  constructor(private readonly rows: Rows = {}) {}

  install(): void {
    vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => this.route(url, init));
  }

  /** How many native activities exist that also carry a recipient party. */
  completeCommunications(): number {
    const withParty = new Set(this.parties.filter(p => p.mask === 2).map(p => p.activityId));
    return [...this.activities.keys()].filter(id => withParty.has(id)).length;
  }

  private route(url: string, init: RequestInit): Promise<Response> {
    const method = String(init.method ?? 'GET');
    const body = typeof init.body === 'string'
      ? JSON.parse(init.body) as Record<string, unknown>
      : undefined;
    this.requests.push({ method, url, ...(body !== undefined ? { body } : {}) });

    const headers = new Headers(init.headers as HeadersInit | undefined);
    const path = url.slice(url.indexOf('/api/data/') + '/api/data/'.length).replace(/^v[\d.]+/, '');

    if (path.startsWith('/EntityDefinitions')) return this.metadata();
    if (path.includes('_activity_parties')) return this.partyRoute(method, path, body);
    if (path.startsWith('/qdb_communicationruns(')) return this.runRoute(method, path, body, headers);
    if (path.startsWith('/faxes(') || path.startsWith('/emails(')) {
      return Promise.resolve(this.activityRoute(path, headers));
    }
    if (method === 'GET' && path.includes('$count=true')) return this.countRoute(path);
    return Promise.resolve(new Response(null, { status: 404 }));
  }

  /**
   * Answers `$count=true` the way the platform does — in the body, over a same-origin fetch.
   *
   * The entity **set** in the URL is mapped back to its logical name so the fixture rows can be
   * found, and the filter is honoured, so a count that ignored its filter cannot pass as one that
   * applied it.
   */
  private countRoute(path: string): Promise<Response> {
    const entitySet = /^\/([a-z_]+)\?/.exec(path)?.[1] ?? '';
    const logicalName = LOGICAL_NAME_OF[entitySet] ?? entitySet.replace(/e?s$/, '');
    const options = decodeURIComponent(path);
    const matching = applyFilter(this.rows[logicalName] ?? [], options);
    return Promise.resolve(json({ '@odata.count': matching.length, value: matching.slice(0, 1) }));
  }

  private metadata(): Promise<Response> {
    if (!this.metadataReadable) return Promise.resolve(new Response(null, { status: 403 }));
    return Promise.resolve(json({ MaxLength: this.frozenPopulationCapacity }));
  }

  // ── The run header ─────────────────────────────────────────────────────────

  private runRoute(
    method: string, path: string, body: Record<string, unknown> | undefined, headers: Headers,
  ): Promise<Response> {
    const id = idIn(path);
    if (method === 'GET') {
      const stored = this.runs.get(id);
      if (!stored) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(json(stored.record, { ETag: ETAG(stored.version) }));
    }
    if (method !== 'PATCH') return Promise.resolve(new Response(null, { status: 405 }));

    if (headers.get('If-None-Match') === '*') return Promise.resolve(this.createRun(id, body));
    return Promise.resolve(this.updateRun(id, body, headers.get('If-Match')));
  }

  private createRun(id: string, body: Record<string, unknown> | undefined): Response {
    if (this.runs.has(id)) return new Response(null, { status: 412 });
    this.runs.set(id, {
      record: { qdb_communicationrunid: id, ...body },
      version: 1,
    });
    return new Response(null, { status: 204, headers: { ETag: ETAG(1) } });
  }

  private updateRun(
    id: string, body: Record<string, unknown> | undefined, ifMatch: string | null,
  ): Response {
    const stored = this.runs.get(id);
    if (!stored) return new Response(null, { status: 404 });
    // A stale version is refused, which is the whole of claim-before-work: the loser stops having
    // created nothing.
    if (ifMatch !== null && ifMatch !== ETAG(stored.version)) return new Response(null, { status: 412 });

    const version = stored.version + 1;
    this.runs.set(id, { record: { ...stored.record, ...body }, version });
    return new Response(null, { status: 204, headers: { ETag: ETAG(version) } });
  }

  // ── Native activities and their parties ────────────────────────────────────

  private activityRoute(path: string, headers: Headers): Response {
    const id = idIn(path);
    if (headers.get('If-None-Match') !== '*') return new Response(null, { status: 405 });
    if (this.activities.has(id)) return new Response(null, { status: 412 });
    this.activities.set(id, { activityid: id });
    this.acceptedActivityCreates += 1;
    return new Response(null, { status: 204, headers: { ETag: ETAG(1) } });
  }

  private partyRoute(
    method: string, path: string, body: Record<string, unknown> | undefined,
  ): Promise<Response> {
    const activityId = idIn(path);
    if (method === 'GET') {
      const rows = this.parties
        .filter(party => party.activityId === activityId)
        .map(party => ({
          activitypartyid: `${party.activityId}-party`,
          participationtypemask: party.mask,
          _partyid_value: party.partyId,
        }));
      return Promise.resolve(json({ value: rows }));
    }
    const bind = String(Object.entries(body ?? {}).find(([key]) => key.includes('@odata.bind'))?.[1] ?? '');
    this.parties.push({
      activityId,
      partyId: idIn(bind),
      mask: Number(body?.['participationtypemask'] ?? 0),
    });
    return Promise.resolve(new Response(null, { status: 204 }));
  }
}

/** Entity set → logical name, for the sets these fixtures answer counts for. */
const LOGICAL_NAME_OF: Readonly<Record<string, string>> = {
  qdb_collectioncases: 'qdb_collectioncase',
  qdb_communicationruns: 'qdb_communicationrun',
};

function idIn(path: string): string {
  return /\(([^)]+)\)/.exec(path)?.[1]?.toLowerCase() ?? '';
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ── The read side ────────────────────────────────────────────────────────────

export interface Rows { [logicalName: string]: Record<string, unknown>[] }

/**
 * The `Xrm.WebApi` half: reads only.
 *
 * `$filter` is honoured rather than ignored. A fake that returned every row whatever was asked would
 * let a query that forgot its key pass — which is exactly how a Contact Hold decision recorded for
 * one organisation could have permitted sending on the other's cases (KI-88).
 */
export function fakeXrm(rows: Rows, organizationName = 'org5869857f'): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: {
          userId: '{61086FE4-0000-0000-0000-000000000001}',
          userName: 'Tester', languageId: 1033,
          securityRoles: ['{AAAA0000-0000-0000-0000-000000000001}'],
        },
        organizationSettings: { uniqueName: organizationName },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string) {
        const all = rows[logicalName] ?? [];
        const row = all.find(candidate => Object.values(candidate).includes(id)) ?? all[0];
        if (!row) throw { status: 404 };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        const all = rows[logicalName] ?? [];
        const entities = applyFilter(all, String(options));
        // **No `@odata.count`, whatever the query asks for.** That is what the real client API does
        // on `org5869857f`: the response carries `entities` and `nextLink` and nothing else. The
        // previous fake returned a count here, so every count-reading screen passed its tests and
        // rendered nothing on the organisation (KI-96).
        return { entities };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  };
}

/** The narrow subset of `$filter` these tests depend on, honoured rather than waved through. */
function applyFilter(all: Record<string, unknown>[], options: string): Record<string, unknown>[] {
  const organization = /qdb_organizationcode eq (\d+)/.exec(options)?.[1];
  const status = /qdb_status eq (\d+)/.exec(options)?.[1];
  const ids = [...options.matchAll(/qdb_collectioncaseid eq ([0-9a-f-]+)/gi)].map(match => match[1]);
  const search = /contains\(qdb_casenumber,'([^']*)'\)/.exec(options)?.[1];

  return all.filter(row => {
    if (organization !== undefined
      && Number(row['qdb_organizationcode']) !== Number(organization)) return false;
    if (status !== undefined && Number(row['qdb_status']) !== Number(status)) return false;
    if (ids.length > 0
      && !ids.includes(String(row['qdb_collectioncaseid']))) return false;
    // Honoured so a search that never left the browser cannot pass as one that narrowed.
    if (search !== undefined
      && !String(row['qdb_casenumber'] ?? '').includes(search)
      && !String(row['qdb_customerbusinessid'] ?? '').includes(search)) return false;
    return true;
  });
}
