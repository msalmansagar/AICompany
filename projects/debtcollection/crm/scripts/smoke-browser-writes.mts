/**
 * smoke-browser-writes.mts
 * The Phase 6 early gate: can the workspace's own write path actually write?
 *
 * Phase 5 proved the read path and found three defects doing it — `Buffer`, an absolute `nextLink`,
 * an empty `$select` — every one invisible to a green unit suite because the harness was friendlier
 * than the platform. `create`, `update` and `retrieveByKey` have never made a real call, and Phase 6
 * is about to build every form on top of them. So they run first, against `org5869857f`, before a
 * single form exists.
 *
 * It drives the **production classes**: `XrmCrmAdapter` and the transport's own `readResponse`. Only
 * the credential differs — node has no session cookie, so a bearer token is attached instead. That
 * boundary is KI-67 and is stated rather than glossed: the OData semantics are identical, the
 * authentication is not.
 *
 * The shims are deliberately **stricter** than convenient:
 *   • `Xrm.WebApi` refuses an options string that does not begin with `?`, as the real one does;
 *   • the write transport is the real `readResponse`, so a response parsed differently here than in
 *     production would prove nothing.
 *
 * Cleanup runs in a `finally` and is verified, so a failure part-way through still leaves nothing.
 * It removes `SMOKE-` rows only — `DEMO-`, `P6-` and the Housing Loan `ARR-` dataset are untouched.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/smoke-browser-writes.mts
 */

import { loadConfig, acquireToken, buildHeaders, apiGet } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { cleanSmokeData, SMOKE_MARKER } from './clean-qdb-smoke-data.mjs';
import { XrmCrmAdapter } from '../../apps/web/src/platform/XrmCrmAdapter.js';
import { readResponse, READ_PREFER, WRITE_PREFER, type WriteResponse, type WriteTransport } from '../../apps/web/src/platform/writeTransport.js';
import type { XrmLike } from '../../apps/web/src/platform/crmContext.js';
import { isConcurrencyConflict } from '@dcp/domain';
import { NAVIGATION_PROPERTIES, bindLookup } from '../../apps/web/src/data/schema.js';

const AUTHORISED_ORG = 'org5869857f';

const STATUS = { Open: 100000640, InProgress: 100000641, Completed: 100000644 };
const STATE = { Open: 0, Completed: 1 };
const PTP = { Active: 100000080, Kept: 100000081, Broken: 100000083 };
const PROMISE_TYPE = { Full: 100000580, Partial: 100000581 };

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Entity set for a logical name, so the shim can build the URL the client API hides. */
const SET_FOR_LOGICAL: Record<string, string> = {
  qdb_collectionactivity: 'qdb_collectionactivities',
  qdb_collectionactivitytype: 'qdb_collectionactivitytypes',
  qdb_collectioncase: 'qdb_collectioncases',
  qdb_activityoutcome: 'qdb_activityoutcomes',
  contact: 'contacts',
  account: 'accounts',
};
const setFor = (logicalName: string) => SET_FOR_LOGICAL[logicalName] ?? `${logicalName}s`;

function buildHarness(apiBase: string, token: string) {
  const state = { reads: 0, writes: 0 };
  const authHeaders = () => buildHeaders(token, SOLUTION_NAME) as Record<string, string>;

  const xrm = {
    Utility: { getGlobalContext: () => { throw new Error('not available outside a CRM session'); } },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string, options = '') {
        if (options && !options.startsWith('?')) {
          throw new Error('UciError: Option Parameter should begin with "?"');
        }
        state.reads++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}(${id})${options}`, {
          headers: { ...authHeaders(), Prefer: 'odata.include-annotations="*"' },
        });
        if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
        return res.json() as Promise<Record<string, unknown>>;
      },
      async retrieveMultipleRecords(logicalName: string, options = '', maxPageSize?: number) {
        if (options && !options.startsWith('?')) {
          throw new Error('UciError: Option Parameter should begin with "?"');
        }
        state.reads++;
        const prefer = ['odata.include-annotations="*"'];
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
        state.writes++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? '' };
      },
      async updateRecord(logicalName: string, id: string, values: Record<string, unknown>) {
        state.writes++;
        const res = await fetch(`${apiBase}/${setFor(logicalName)}(${id})`, {
          method: 'PATCH', headers: authHeaders(), body: JSON.stringify(values),
        });
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
        return { id };
      },
    },
  } as unknown as XrmLike;

  /** The production transport's parsing, over node's credential. */
  const transport: WriteTransport = {
    async get(url: string): Promise<WriteResponse> {
      state.reads++;
      const res = await fetch(`${apiBase}${url}`, {
        headers: { ...authHeaders(), Prefer: READ_PREFER },
      });
      return readResponse(res);
    },
    async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
      state.writes++;
      const headers = { ...authHeaders() };
      headers['Prefer'] = WRITE_PREFER;
      if (ifMatch !== undefined) headers['If-Match'] = ifMatch;
      const res = await fetch(`${apiBase}${url}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
      return readResponse(res);
    },
  };

  return { adapter: new XrmCrmAdapter(xrm, undefined, transport), state, transport };
}

async function main() {
  console.log('=== Phase 6 early gate — the workspace write path against the real platform ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);

  const token = await acquireToken(cfg);
  const { adapter, state, transport } = buildHarness(cfg.apiBase, token);

  try {
    // ── Reference data the writes bind to ─────────────────────────────────────
    const callType = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_code eq 'P6-CALL'"))?.value?.[0];
    const ptpType = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$filter=qdb_code eq 'P6-PTP'"))?.value?.[0];
    const outcome = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_activityoutcomes?$select=qdb_activityoutcomeid,qdb_requiresfollowup,qdb_followupdays&$filter=qdb_code eq 'P6-CONTACTED'"))?.value?.[0];
    check('Phase 6 reference data is present to bind to',
      Boolean(callType && ptpType && outcome),
      callType && ptpType && outcome ? 'call type, PTP type and an outcome' : 'MISSING — run seed-phase6-configuration.mjs');
    if (!callType || !ptpType || !outcome) throw new Error('Phase 6 configuration missing.');

    const caseRow = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectioncases?$select=qdb_collectioncaseid,qdb_casenumber&$top=1&$filter=startswith(qdb_facilitynumber,'DEMO-')"))?.value?.[0];
    check('A real case exists to hang activities on', Boolean(caseRow), caseRow?.qdb_casenumber ?? 'MISSING');

    // ── 1. Normal activity: create → read → versioned update → complete ───────
    console.log('\n─── 1. A normal activity, end to end ───');
    const activityId = await adapter.create('qdb_collectionactivities', {
      subject: `${SMOKE_MARKER}P6 write path`,
      qdb_activitynumber: `${SMOKE_MARKER}P6-WRITE`,
      qdb_activitydate: new Date().toISOString(),
      // An activity's lookups carry a relationship suffix, because regardingobjectid also targets
      // the case (KI-57). The bare attribute name is rejected outright.
      ...bindLookup(NAVIGATION_PROPERTIES.activityToType, 'qdb_collectionactivitytypes', callType.qdb_collectionactivitytypeid),
      ...(caseRow ? bindLookup(NAVIGATION_PROPERTIES.activityToCase, 'qdb_collectioncases', caseRow.qdb_collectioncaseid as string) : {}),
    });
    check('create returns an id', /^[0-9a-f-]{36}$/i.test(activityId), activityId);

    const afterCreate = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: activityId },
      ['activityid', 'subject', 'statuscode', 'statecode', '_qdb_activitytypeid_value', '_qdb_collectioncaseid_value']);
    check('read-back finds it through Xrm.WebApi', afterCreate !== null, String(afterCreate?.['subject']));
    check('the activity type lookup bound correctly',
      afterCreate?.['_qdb_activitytypeid_value'] === callType.qdb_collectionactivitytypeid,
      String(afterCreate?.['_qdb_activitytypeid_value']));
    check('the case lookup bound correctly',
      !caseRow || afterCreate?.['_qdb_collectioncaseid_value'] === caseRow.qdb_collectioncaseid,
      String(afterCreate?.['_qdb_collectioncaseid_value']));
    check('DefaultStatusAssigner set the opening status server-side',
      afterCreate?.['statuscode'] === STATUS.Open, `statuscode=${afterCreate?.['statuscode']}`);

    const annotation = '@OData.Community.Display.V1.FormattedValue';
    check('formatted values and lookup names come back on the read',
      typeof afterCreate?.[`_qdb_activitytypeid_value${annotation}`] === 'string',
      String(afterCreate?.[`_qdb_activitytypeid_value${annotation}`]));

    // ── 2. Versioned read and write ───────────────────────────────────────────
    console.log('\n─── 2. The concurrency-controlled write path ───');
    const versioned = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: activityId }, ['activityid', 'subject', 'statuscode']);
    check('retrieveVersioned returns a record AND a version', Boolean(versioned?.version),
      versioned?.version ?? 'MISSING');

    const v2 = await adapter.updateVersioned(
      { entity: 'qdb_collectionactivities', id: activityId },
      { subject: `${SMOKE_MARKER}P6 write path (edited)`, statuscode: STATUS.InProgress },
      versioned!.version);
    check('updateVersioned with the current version succeeds and returns a NEW version',
      Boolean(v2) && v2 !== versioned!.version, `${String(versioned!.version).slice(-10)} -> ${String(v2).slice(-10)}`);

    const afterUpdate = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: activityId },
      ['subject', 'statuscode']);
    check('the values actually changed in Dataverse, not merely HTTP 204',
      afterUpdate?.['subject'] === `${SMOKE_MARKER}P6 write path (edited)`
      && afterUpdate?.['statuscode'] === STATUS.InProgress,
      `${String(afterUpdate?.['subject']).slice(-10)}, statuscode=${afterUpdate?.['statuscode']}`);

    // ── 3. The stale write ────────────────────────────────────────────────────
    console.log('\n─── 3. Two officers: the stale write must fail, not win ───');
    const officerA = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: activityId }, ['activityid', 'subject']);
    // The competing officer saves first, through the same path.
    await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: activityId },
      { subject: `${SMOKE_MARKER}P6 competing save` }, officerA!.version);

    let conflict: unknown = null;
    try {
      await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: activityId },
        { subject: `${SMOKE_MARKER}P6 stale overwrite` }, officerA!.version);
    } catch (error) { conflict = error; }

    check('the stale write is refused', conflict !== null, conflict ? 'threw' : 'SUCCEEDED — last-write-wins');
    check('and it is recognisable as a CONFLICT, not a generic failure',
      isConcurrencyConflict(conflict), (conflict as Error)?.name ?? 'none');
    check('the message tells a user what to do about it',
      /changed since it was read|reload/i.test((conflict as Error)?.message ?? ''),
      ((conflict as Error)?.message ?? '').slice(0, 90));

    const afterConflict = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: activityId }, ['subject']);
    check('the competing officer\'s value survived — the stale payload did NOT land',
      afterConflict?.['subject'] === `${SMOKE_MARKER}P6 competing save`,
      String(afterConflict?.['subject']));

    // ── 4. Clearing a field, and completing ───────────────────────────────────
    console.log('\n─── 4. Clearing a field, then completing ───');
    const beforeClear = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: activityId }, ['activityid', 'qdb_followupdate']);
    await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: activityId },
      { qdb_followupdate: null }, beforeClear!.version);
    const cleared = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: activityId }, ['qdb_followupdate']);
    check('null clears a field rather than being ignored',
      cleared?.['qdb_followupdate'] === null || cleared?.['qdb_followupdate'] === undefined,
      String(cleared?.['qdb_followupdate']));

    const beforeComplete = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: activityId }, ['activityid', 'statuscode']);
    await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: activityId },
      { statuscode: STATUS.Completed, statecode: STATE.Completed,
        ...bindLookup(NAVIGATION_PROPERTIES.activityToOutcome, 'qdb_activityoutcomes', outcome.qdb_activityoutcomeid) },
      beforeComplete!.version);
    const completed = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: activityId },
      ['statuscode', 'statecode', '_qdb_outcomeid_value']);
    check('completing writes status, state and the outcome lookup together',
      completed?.['statuscode'] === STATUS.Completed && completed?.['statecode'] === STATE.Completed
      && completed?.['_qdb_outcomeid_value'] === outcome.qdb_activityoutcomeid,
      `statuscode=${completed?.['statuscode']} statecode=${completed?.['statecode']}`);

    // ── 5. Server-side refusals reach the caller ──────────────────────────────
    console.log('\n─── 5. The server\'s refusals reach the write path ───');
    const completedVersion = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: activityId }, ['activityid']);
    let immutability: unknown = null;
    try {
      await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: activityId },
        { subject: `${SMOKE_MARKER}P6 should not happen` }, completedVersion!.version);
    } catch (error) { immutability = error; }
    check('ImmutabilityGuard refuses an edit to a completed activity',
      immutability !== null, (immutability as Error)?.message?.slice(0, 80) ?? 'NOT REFUSED');
    check('and that refusal is NOT mistaken for a concurrency conflict',
      immutability !== null && !isConcurrencyConflict(immutability),
      isConcurrencyConflict(immutability) ? 'misclassified' : 'classified as a save failure');

    // ── 6. The promise ────────────────────────────────────────────────────────
    console.log('\n─── 6. A promise to pay, which is an activity and not a second entity ───');
    const promiseId = await adapter.create('qdb_collectionactivities', {
      subject: `${SMOKE_MARKER}P6 promise`,
      qdb_activitynumber: `${SMOKE_MARKER}P6-PTP`,
      qdb_activitydate: new Date().toISOString(),
      qdb_ptpdate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      qdb_promisedamount: 5000,
      qdb_promisetype: PROMISE_TYPE.Partial,
      qdb_ptpstatus: PTP.Active,
      ...bindLookup(NAVIGATION_PROPERTIES.activityToType, 'qdb_collectionactivitytypes', ptpType.qdb_collectionactivitytypeid),
      ...(caseRow ? bindLookup(NAVIGATION_PROPERTIES.activityToCase, 'qdb_collectioncases', caseRow.qdb_collectioncaseid as string) : {}),
    });
    const promise = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: promiseId },
      ['activityid', 'qdb_ptpstatus', 'qdb_promisedamount', 'qdb_promisetype', '_qdb_activitytypeid_value']);
    check('a promise is a qdb_collectionactivity row, not a parallel entity',
      promise !== null && promise['activityid'] === promiseId, promiseId);
    check('its activity type is the PTP type',
      promise?.['_qdb_activitytypeid_value'] === ptpType.qdb_collectionactivitytypeid, 'bound');
    check('promised amount and type round-trip',
      promise?.['qdb_promisedamount'] === 5000 && promise?.['qdb_promisetype'] === PROMISE_TYPE.Partial,
      `amount=${promise?.['qdb_promisedamount']}`);

    const promiseVersion = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: promiseId }, ['activityid', 'qdb_ptpstatus']);
    await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: promiseId },
      { qdb_ptpstatus: PTP.Kept }, promiseVersion!.version);
    const kept = await adapter.retrieve({ entity: 'qdb_collectionactivities', id: promiseId }, ['qdb_ptpstatus']);
    check('a permitted PTP transition Active -> Kept lands', kept?.['qdb_ptpstatus'] === PTP.Kept,
      `qdb_ptpstatus=${kept?.['qdb_ptpstatus']}`);

    const keptVersion = await adapter.retrieveVersioned(
      { entity: 'qdb_collectionactivities', id: promiseId }, ['activityid']);
    let ptpRefusal: unknown = null;
    try {
      await adapter.updateVersioned({ entity: 'qdb_collectionactivities', id: promiseId },
        { qdb_ptpstatus: PTP.Broken }, keptVersion!.version);
    } catch (error) { ptpRefusal = error; }
    check('an illegal PTP transition Kept -> Broken is refused server-side',
      ptpRefusal !== null, (ptpRefusal as Error)?.message?.slice(0, 80) ?? 'NOT REFUSED');
    check('and it too is a save failure, not a conflict',
      ptpRefusal !== null && !isConcurrencyConflict(ptpRefusal), 'classified correctly');

    console.log(`\n  HTTP: ${state.reads} reads, ${state.writes} writes through the production classes.`);
    void transport;
  } finally {
    console.log('\n─── Cleanup (failure-safe) ───');
    await cleanSmokeData({ cfg, token, confirmed: true });
    const residue = (await apiGet(cfg, token, SOLUTION_NAME,
      `/qdb_collectionactivities?$select=activityid&$filter=startswith(qdb_activitynumber,'${SMOKE_MARKER}')`))?.value ?? [];
    check('SMOKE- residue is zero', residue.length === 0, `${residue.length} row(s)`);

    // The other marked datasets must be exactly where they were.
    const demo = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectioncases?$select=qdb_collectioncaseid&$top=1&$count=true&$filter=startswith(qdb_facilitynumber,'DEMO-')"))?.['@odata.count'];
    const arr = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectioncases?$select=qdb_collectioncaseid&$top=1&$count=true&$filter=startswith(qdb_facilitynumber,'ARR-')"))?.['@odata.count'];
    const p6 = (await apiGet(cfg, token, SOLUTION_NAME,
      "/qdb_collectionactivitytypes?$select=qdb_collectionactivitytypeid&$top=1&$count=true&$filter=startswith(qdb_code,'P6-')"))?.['@odata.count'];
    check('cleanup left DEMO-, ARR- and P6- untouched',
      demo === 5 && arr === 4358 && p6 === 11, `DEMO ${demo} cases, ARR ${arr} cases, P6 ${p6} types`);
  }

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  console.log('\nProven: the production adapter and transport create, read, update with a version,');
  console.log('clear a field, complete, and are refused by the server\'s own guards — and a stale');
  console.log('write loses to the competing save rather than overwriting it.');
  console.log('\nNOT proven: that a SESSION COOKIE authenticates the same calls. This ran with a bearer');
  console.log('token from node. The OData semantics are identical; the credential is not (KI-67).');
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
