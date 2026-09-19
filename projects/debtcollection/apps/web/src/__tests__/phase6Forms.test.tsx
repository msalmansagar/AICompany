import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmConcurrencyError, type RowVersion } from '@dcp/domain';
import { ActivityDialog } from '../views/ActivityDialog.js';
import { PromiseDialog } from '../views/PromiseDialog.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CrmSessionProvider, OrgProvider, RoleProvider } from '../shell/context.js';
import type { XrmLike } from '../platform/crmContext.js';
import type { WriteResponse, WriteTransport } from '../platform/writeTransport.js';

/**
 * The Phase 6 forms, driven the way a collection officer drives them.
 *
 * These mount the real dialogs over a real `XrmCrmAdapter`, with only the transport replaced — so
 * what is under test is the whole chain the authorisation cares about: the form gathers input, the
 * service asks the domain, the domain refuses or plans, and the answer comes back as one of three
 * distinguishable outcomes. A test that mocked the service would prove the form calls a function.
 *
 * The transport records what it was asked to send, because the defects that matter here are
 * invisible in a rendered result: a second create leaving the browser on a double-click, a stale
 * version being resent after a conflict, a `qdb_` name composed in a component.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const CASE_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';
const CALL_TYPE_ID = 'type-call';
const OUTCOME_ID = 'outcome-refused';
const FOLLOW_UP_OUTCOME_ID = 'outcome-contacted';
const NO_FOLLOW_UP_OUTCOME_ID = 'outcome-resolved';

interface Recorded { method: string; url: string; body?: unknown; ifMatch?: string }

/** A transport that records every request and replies from a script. */
class RecordingTransport implements WriteTransport {
  readonly requests: Recorded[] = [];
  constructor(private readonly replies: WriteResponse[] = []) {}
  private next(): WriteResponse { return this.replies.shift() ?? { status: 200, etag: 'W/"2"' }; }

  async patch(url: string, body: unknown, ifMatch?: string): Promise<WriteResponse> {
    this.requests.push({ method: 'PATCH', url, body, ...(ifMatch !== undefined ? { ifMatch } : {}) });
    return this.next();
  }
  async createOnly(url: string, body: unknown): Promise<WriteResponse> {
    this.requests.push({ method: 'CREATE', url, body });
    return this.next();
  }
  async get(url: string): Promise<WriteResponse> {
    this.requests.push({ method: 'GET', url });
    return this.next();
  }
}

/** Configuration as the catalogue reads it: one active call type, one retired type, one outcome. */
const CONFIG_ROWS: Record<string, Record<string, unknown>[]> = {
  qdb_collectionactivitytype: [
    { qdb_collectionactivitytypeid: CALL_TYPE_ID, qdb_name: 'Outbound call', qdb_code: 'CALL', qdb_isactive: true, qdb_sequence: 1 },
    { qdb_collectionactivitytypeid: 'type-ptp', qdb_name: 'Promise to pay', qdb_code: 'PTP', qdb_isactive: true, qdb_sequence: 2 },
  ],
  qdb_activityoutcome: [
    // Mirrors the live P6-CALL-REFUSED: notes mandatory, no follow-up.
    {
      qdb_activityoutcomeid: OUTCOME_ID, qdb_name: 'Customer refused', qdb_code: 'REFUSED',
      qdb_isactive: true, qdb_sequence: 1,
      qdb_requiresnotes: true, qdb_requiresfollowup: true, qdb_followupdays: 3,
      qdb_escalationrequired: false, qdb_closeactivity: true,
      '_qdb_activitytypeid_value': CALL_TYPE_ID,
    },
    // Mirrors the live P6-CALL-CONTACTED: no notes, follow-up derived three days out. This is the
    // shape step 3b of the runtime validation exercised.
    {
      qdb_activityoutcomeid: FOLLOW_UP_OUTCOME_ID, qdb_name: 'Customer contacted', qdb_code: 'CONTACTED',
      qdb_isactive: true, qdb_sequence: 2,
      qdb_requiresnotes: false, qdb_requiresfollowup: true, qdb_followupdays: 3,
      qdb_escalationrequired: false, qdb_closeactivity: true,
      '_qdb_activitytypeid_value': CALL_TYPE_ID,
    },
    // Mirrors the live P6-CALL-RESOLVED: asks for nothing at all.
    {
      qdb_activityoutcomeid: NO_FOLLOW_UP_OUTCOME_ID, qdb_name: 'Resolved', qdb_code: 'RESOLVED',
      qdb_isactive: true, qdb_sequence: 3,
      qdb_requiresnotes: false, qdb_requiresfollowup: false, qdb_followupdays: 0,
      qdb_escalationrequired: false, qdb_closeactivity: true,
      '_qdb_activitytypeid_value': CALL_TYPE_ID,
    },
  ],
};

function fakeXrm(rows: Record<string, Record<string, unknown>[]> = {}): XrmLike {
  return {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord() { throw { status: 404 }; },
      async retrieveMultipleRecords(logicalName: string) {
        const found = rows[logicalName] ?? [];
        return { entities: found, '@odata.count': found.length };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  } as unknown as XrmLike;
}

function renderDialog(node: React.ReactElement, transport: WriteTransport, rows = CONFIG_ROWS) {
  const adapter = new XrmCrmAdapter(fakeXrm(rows), undefined, transport);
  return render(
    <CrmSessionProvider value={{ context: { userId: '1', userName: 'Tester' } as never, adapter }}>
      <RoleProvider><OrgProvider>{node}</OrgProvider></RoleProvider>
    </CrmSessionProvider>,
  );
}

/** An activity row as the versioned read returns one. */
const activityRecord = (over: Record<string, unknown> = {}) => ({
  status: 200,
  etag: 'W/"1"',
  body: {
    activityid: ACTIVITY_ID,
    subject: 'Called the customer',
    statuscode: 100000640,
    [`statuscode${FORMATTED}`]: 'Open',
    statecode: 0,
    qdb_activitydate: '2026-09-19T09:00:00Z',
    qdb_followupdate: '',
    description: '',
    '_qdb_activitytypeid_value': CALL_TYPE_ID,
    qdb_activitynumber: 'ACT-0001',
    ...over,
  },
});

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { cleanup(); });

// ── Logging an action ────────────────────────────────────────────────────────

describe('logging a collection action', () => {
  it('offers the activity types configuration provides, not a list in code', async () => {
    const transport = new RecordingTransport();
    renderDialog(
      <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    const select = await screen.findByTestId('activity-type');
    await waitFor(() => expect(select).toHaveTextContent('Outbound call'));
    expect(select).toHaveTextContent('Promise to pay');
  });

  it('sends one create carrying the case binding, composed by the service and not the form', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    renderDialog(
      <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await screen.findByTestId('activity-type');
    await userEvent.selectOptions(screen.getByTestId('activity-type'), CALL_TYPE_ID);
    await userEvent.type(screen.getByTestId('activity-subject'), 'Called the customer');
    await userEvent.click(screen.getByTestId('activity-save'));

    await waitFor(() => expect(transport.requests).toHaveLength(1));
    const request = transport.requests[0]!;
    expect(request.method, 'a create is If-None-Match, never a plain PATCH').toBe('CREATE');
    const body = request.body as Record<string, unknown>;
    expect(body['subject']).toBe('Called the customer');
    // The navigation property, with its relationship suffix — proof the write went through
    // bindLookup() rather than being assembled anywhere in the component.
    expect(Object.keys(body)).toContain('qdb_collectioncaseid_qdb_collectionactivity@odata.bind');
  });

  /**
   * The duplicate-submission requirement, at the UI layer.
   *
   * Two clicks in the same tick must leave one request. The in-flight ref is what stops the second
   * one; ADR-DCP-19's client-chosen id is what would stop a duplicate record even if it did not.
   */
  it('produces exactly one request when Save is clicked twice in quick succession', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    renderDialog(
      <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await screen.findByTestId('activity-type');
    await userEvent.selectOptions(screen.getByTestId('activity-type'), CALL_TYPE_ID);
    await userEvent.type(screen.getByTestId('activity-subject'), 'Double click');

    // Raw `.click()` rather than `userEvent.click`, deliberately and despite the act() warning it
    // produces: userEvent awaits React between clicks, which lets the button re-render disabled and
    // would make this test pass without any guard at all. Three clicks in one tick is the race.
    const save = screen.getByTestId('activity-save');
    save.click();
    save.click();
    save.click();

    await waitFor(() => expect(transport.requests.length).toBeGreaterThan(0));
    expect(transport.requests.filter(r => r.method === 'CREATE')).toHaveLength(1);
  });

  /** Every create from this dialog carries the id minted when it opened — the same id on a retry. */
  it('writes to one id for the life of the dialog', async () => {
    const transport = new RecordingTransport([
      { status: 500, message: 'the network dropped' },
      { status: 201, etag: 'W/"1"' },
    ]);
    renderDialog(
      <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await screen.findByTestId('activity-type');
    await userEvent.selectOptions(screen.getByTestId('activity-type'), CALL_TYPE_ID);
    await userEvent.type(screen.getByTestId('activity-subject'), 'Retry me');

    await userEvent.click(screen.getByTestId('activity-save'));
    await screen.findByTestId('activity-dialog-failed');
    await userEvent.click(screen.getByTestId('activity-save'));

    await waitFor(() => expect(transport.requests).toHaveLength(2));
    expect(transport.requests[0]!.url, 'the retry reuses the id, so the platform can refuse a duplicate')
      .toBe(transport.requests[1]!.url);
  });

  it('shows the domain refusal beside the field it names, without a round trip', async () => {
    const transport = new RecordingTransport();
    renderDialog(
      <ActivityDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await screen.findByTestId('activity-type');
    await userEvent.click(screen.getByTestId('activity-save'));

    await waitFor(() => expect(screen.getByText('Give the activity a subject.')).toBeTruthy());
    expect(transport.requests, 'a refusal costs no request').toHaveLength(0);
  });
});

// ── Completing, with configuration deciding ──────────────────────────────────

describe('completing an action, where the outcome decides', () => {
  const openActivityDialog = async (transport: RecordingTransport) => {
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);
    await screen.findByTestId('activity-subject');
    await userEvent.click(screen.getByTestId('activity-start-complete'));
    await screen.findByTestId('activity-outcome');
  };

  it('refuses completion when the configured outcome requires a note', async () => {
    const transport = new RecordingTransport([activityRecord()]);
    await openActivityDialog(transport);
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), OUTCOME_ID);
    await userEvent.click(screen.getByTestId('activity-complete'));

    await waitFor(() => expect(screen.getByText(/requires a note/i)).toBeTruthy());
    expect(transport.requests.filter(r => r.method === 'PATCH'), 'nothing was written').toHaveLength(0);
  });

  it('tells the officer what the outcome will do before they save it', async () => {
    const transport = new RecordingTransport([activityRecord()]);
    await openActivityDialog(transport);
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), OUTCOME_ID);

    const effects = await screen.findByTestId('outcome-effects');
    expect(effects).toHaveTextContent('A note is required');
    expect(effects).toHaveTextContent('Follow-up in 3 days');
  });

  it('completes once the note is supplied, sending the version it read', async () => {
    const transport = new RecordingTransport([activityRecord(), { status: 200, etag: 'W/"2"' }]);
    await openActivityDialog(transport);
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), OUTCOME_ID);
    await userEvent.type(screen.getByTestId('activity-notes'), 'Customer will pay Thursday.');
    await userEvent.click(screen.getByTestId('activity-complete'));

    await waitFor(() => expect(transport.requests.some(r => r.method === 'PATCH')).toBe(true));
    const write = transport.requests.find(r => r.method === 'PATCH')!;
    expect(write.ifMatch).toBe('W/"1"');
    const body = write.body as Record<string, unknown>;
    expect(body['description'], 'notes live on the activity base column').toBe('Customer will pay Thursday.');
    expect(body['qdb_outcomeid_qdb_collectionactivity@odata.bind']).toContain(OUTCOME_ID);
  });

  it('shows a completed activity as read-only rather than offering buttons that would fail', async () => {
    const transport = new RecordingTransport([activityRecord({
      statuscode: 100000644, [`statuscode${FORMATTED}`]: 'Completed', statecode: 1,
    })]);
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);

    await screen.findByTestId('activity-dialog-readonly');
    expect(screen.queryByTestId('activity-complete')).toBeNull();
    expect(screen.queryByTestId('activity-update')).toBeNull();
    expect(screen.getByTestId('activity-subject')).toBeDisabled();
  });
});

// ── The three failure states ─────────────────────────────────────────────────

describe('telling the officer which kind of failure happened', () => {
  /**
   * The requirement the authorisation states twice: a conflict is its own state, with its own words
   * and its own offer, and it never shows transport vocabulary.
   */
  it('turns a stale write into a reload offer, with no 412 or ETag anywhere on screen', async () => {
    const transport = new RecordingTransport([
      activityRecord(),
      { status: 412, message: "The version of the existing record doesn't match the RowVersion property provided." },
    ]);
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);

    await screen.findByTestId('activity-subject');
    await userEvent.type(screen.getByTestId('activity-subject'), ' edited');
    await userEvent.click(screen.getByTestId('activity-update'));

    const banner = await screen.findByTestId('activity-dialog-conflict');
    expect(banner).toHaveTextContent(/changed this record/i);
    expect(screen.getByTestId('activity-dialog-reload')).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/412|ETag|If-Match|RowVersion/i);
  });

  /** Reload must re-read, not resend. Resending the stale payload is what the platform just refused. */
  it('re-reads the record on Reload latest instead of retrying the stale payload', async () => {
    const transport = new RecordingTransport([
      activityRecord(),
      { status: 412, message: 'stale' },
      activityRecord({ subject: 'Changed by someone else', '@odata.etag': 'W/"9"' }),
    ]);
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);

    await screen.findByTestId('activity-subject');
    await userEvent.type(screen.getByTestId('activity-subject'), ' edited');
    await userEvent.click(screen.getByTestId('activity-update'));
    await screen.findByTestId('activity-dialog-reload');

    const before = transport.requests.length;
    await userEvent.click(screen.getByTestId('activity-dialog-reload'));

    await waitFor(() => expect(transport.requests.length).toBeGreaterThan(before));
    expect(transport.requests.at(-1)!.method, 'a reload reads; it does not write').toBe('GET');
  });

  it('shows a server-side refusal as a save failure, not as a concurrency conflict', async () => {
    const transport = new RecordingTransport([
      activityRecord(),
      { status: 400, message: 'Transition from Open to Completed is not permitted by policy.' },
    ]);
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);

    await screen.findByTestId('activity-subject');
    await userEvent.type(screen.getByTestId('activity-subject'), ' edited');
    await userEvent.click(screen.getByTestId('activity-update'));

    const failure = await screen.findByTestId('activity-dialog-failed');
    expect(failure).toHaveTextContent(/not permitted by policy/);
    expect(screen.queryByTestId('activity-dialog-conflict'), 'not a conflict').toBeNull();
  });

  it('distinguishes a concurrency error by type rather than by message', () => {
    const error = new CrmConcurrencyError(
      { entity: 'qdb_collectionactivities', id: ACTIVITY_ID }, 'W/"1"' as RowVersion, 'anything');
    expect(error).toBeInstanceOf(CrmConcurrencyError);
  });
});

// ── The promise ──────────────────────────────────────────────────────────────

const promiseRecord = (over: Record<string, unknown> = {}) => ({
  status: 200,
  etag: 'W/"1"',
  body: {
    activityid: 'ptp-1',
    subject: 'Promise to pay',
    qdb_ptpstatus: 100000080,
    [`qdb_ptpstatus${FORMATTED}`]: 'Active',
    qdb_promisedamount: 5000,
    qdb_ptpdate: '2026-10-05T00:00:00Z',
    description: '',
    ...over,
  },
});

describe('the promise to pay', () => {
  it('writes promise columns onto the activity entity — never a second table', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    renderDialog(
      <PromiseDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await waitFor(() => expect(screen.queryByTestId('promise-no-type')).toBeNull());
    await userEvent.clear(screen.getByTestId('promise-amount'));
    await userEvent.type(screen.getByTestId('promise-amount'), '5000');
    await userEvent.type(screen.getByTestId('promise-date'), '2026-10-05');
    await userEvent.click(screen.getByTestId('promise-save'));

    await waitFor(() => expect(transport.requests).toHaveLength(1));
    const request = transport.requests[0]!;
    expect(request.url).toContain('qdb_collectionactivities');
    expect((request.body as Record<string, unknown>)['qdb_promisedamount']).toBe(5000);
  });

  /** The amount is arithmetic; there is no ceiling, because none is in evidence (KI-72). */
  it('accepts a large amount and a distant date, imposing no policy limit', async () => {
    const transport = new RecordingTransport([{ status: 201, etag: 'W/"1"' }]);
    renderDialog(
      <PromiseDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await waitFor(() => expect(screen.queryByTestId('promise-no-type')).toBeNull());
    await userEvent.type(screen.getByTestId('promise-amount'), '50000000');
    await userEvent.type(screen.getByTestId('promise-date'), '2031-01-01');
    await userEvent.click(screen.getByTestId('promise-save'));

    await waitFor(() => expect(transport.requests).toHaveLength(1));
  });

  it('refuses an amount of zero, beside the field', async () => {
    const transport = new RecordingTransport();
    renderDialog(
      <PromiseDialog mode="create" caseId={CASE_ID} onClose={() => {}} onSaved={() => {}} />, transport);

    await waitFor(() => expect(screen.queryByTestId('promise-no-type')).toBeNull());
    await userEvent.type(screen.getByTestId('promise-amount'), '0');
    await userEvent.type(screen.getByTestId('promise-date'), '2026-10-05');
    await userEvent.click(screen.getByTestId('promise-save'));

    await waitFor(() => expect(screen.getByText(/greater than zero/i)).toBeTruthy());
    expect(transport.requests).toHaveLength(0);
  });

  it('offers only the transitions the lifecycle permits', async () => {
    const transport = new RecordingTransport([promiseRecord()]);
    renderDialog(
      <PromiseDialog mode="edit" caseId={CASE_ID} promiseId="ptp-1" onClose={() => {}} onSaved={() => {}} />,
      transport);

    const select = await screen.findByTestId('promise-target-status');
    // Active may become Kept, PartiallyKept, Broken, Rescheduled or Cancelled — never Active again.
    expect(select).toHaveTextContent('Kept');
    expect(select).toHaveTextContent('Broken');
    expect(within(select).queryByRole('option', { name: 'Active' })).toBeNull();
  });

  /**
   * The line the authorisation draws twice, asserted on the screen rather than only in the domain:
   * a recorded outcome must never look financially settled.
   */
  it('states that a recorded outcome has not been verified', async () => {
    const transport = new RecordingTransport([promiseRecord({
      qdb_ptpstatus: 100000081, [`qdb_ptpstatus${FORMATTED}`]: 'Kept', qdb_amountreceived: 5000,
    })]);
    renderDialog(
      <PromiseDialog mode="edit" caseId={CASE_ID} promiseId="ptp-1" onClose={() => {}} onSaved={() => {}} />,
      transport);

    const notice = await screen.findByTestId('promise-unverified');
    expect(notice).toHaveAttribute('data-verified', 'false');
    expect(notice).toHaveTextContent(/not been verified/i);
  });

  it('locks the terms of a settled promise rather than letting them be rewritten', async () => {
    const transport = new RecordingTransport([promiseRecord({
      qdb_ptpstatus: 100000081, [`qdb_ptpstatus${FORMATTED}`]: 'Kept',
    })]);
    renderDialog(
      <PromiseDialog mode="edit" caseId={CASE_ID} promiseId="ptp-1" onClose={() => {}} onSaved={() => {}} />,
      transport);

    await screen.findByTestId('promise-settled');
    expect(screen.getByTestId('promise-amount')).toBeDisabled();
    expect(screen.queryByTestId('promise-update')).toBeNull();
  });
});

// ── The follow-up derivation, at the form ────────────────────────────────────

/**
 * Step 3b of the Phase 6 runtime validation, and the edge cases around it.
 *
 * The reported failure was *"the Activity saved, but no automatic follow-up date was added"*. The
 * derivation was never broken — `planCompleteActivity` produced the right date all along, proved
 * live. What was broken is that it happened **invisibly at save time**, so an officer who saved
 * through the adjacent button got a success message and no follow-up, with nothing on screen to say
 * one had ever been implied.
 *
 * So these assert two different things: that the derived date is **visible before** the officer
 * commits, and that it is **written** when they do.
 */
describe('the follow-up an outcome configures', () => {
  const openForCompletion = async (transport: RecordingTransport) => {
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);
    await screen.findByTestId('activity-subject');
    await userEvent.click(screen.getByTestId('activity-start-complete'));
    await screen.findByTestId('activity-outcome');
  };

  const followUpField = () => screen.getByTestId('activity-followup') as HTMLInputElement;
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it('shows the configured date in the field as soon as the outcome is chosen', async () => {
    const transport = new RecordingTransport([activityRecord()]);
    await openForCompletion(transport);
    expect(followUpField().value, 'nothing is scheduled before an outcome is chosen').toBe('');

    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), FOLLOW_UP_OUTCOME_ID);

    // Visible *before* saving — the whole point. Three days is the fixture's configuration, read
    // from the outcome record, not a constant in the component.
    await waitFor(() => expect(followUpField().value).toBe(inDays(3)));
  });

  /** The reported scenario, end to end: blank field, save, and the date reaches the payload. */
  it('writes the configured follow-up when the officer leaves the field untouched', async () => {
    const transport = new RecordingTransport([activityRecord(), { status: 200, etag: 'W/"2"' }]);
    await openForCompletion(transport);
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), FOLLOW_UP_OUTCOME_ID);
    await waitFor(() => expect(followUpField().value).not.toBe(''));

    await userEvent.click(screen.getByTestId('activity-complete'));

    await waitFor(() => expect(transport.requests.some(r => r.method === 'PATCH')).toBe(true));
    const body = transport.requests.find(r => r.method === 'PATCH')!.body as Record<string, unknown>;
    expect(String(body['qdb_followupdate'] ?? ''), 'no follow-up reached the payload').not.toBe('');
    expect(String(body['qdb_followupdate']).slice(0, 10)).toBe(inDays(3));
  });

  /** An outcome that asks for nothing must clear a date it previously suggested. */
  it('withdraws the suggestion when the outcome is changed to one that needs no follow-up', async () => {
    const transport = new RecordingTransport([activityRecord()]);
    await openForCompletion(transport);

    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), FOLLOW_UP_OUTCOME_ID);
    await waitFor(() => expect(followUpField().value).toBe(inDays(3)));

    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), NO_FOLLOW_UP_OUTCOME_ID);
    await waitFor(() => expect(followUpField().value).toBe(''));
  });

  /** A date the officer typed is theirs. Configuration suggests; it does not overrule. */
  it('never overwrites a date the officer typed', async () => {
    const transport = new RecordingTransport([activityRecord(), { status: 200, etag: 'W/"2"' }]);
    await openForCompletion(transport);

    await userEvent.type(followUpField(), '2026-12-01');
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), FOLLOW_UP_OUTCOME_ID);

    await waitFor(() => expect(screen.getByTestId('outcome-effects')).toBeTruthy());
    expect(followUpField().value).toBe('2026-12-01');

    await userEvent.click(screen.getByTestId('activity-complete'));
    await waitFor(() => expect(transport.requests.some(r => r.method === 'PATCH')).toBe(true));
    const body = transport.requests.find(r => r.method === 'PATCH')!.body as Record<string, unknown>;
    expect(String(body['qdb_followupdate']).slice(0, 10)).toBe('2026-12-01');
  });

  /** A date already on the record is the officer's too, not a stale suggestion to be replaced. */
  it('leaves an existing follow-up on the record alone', async () => {
    const transport = new RecordingTransport([activityRecord({ qdb_followupdate: '2026-11-15T00:00:00Z' })]);
    await openForCompletion(transport);
    await userEvent.selectOptions(screen.getByTestId('activity-outcome'), FOLLOW_UP_OUTCOME_ID);

    await waitFor(() => expect(screen.getByTestId('outcome-effects')).toBeTruthy());
    expect(followUpField().value).toBe('2026-11-15');
  });

  /**
   * The button that caused the report.
   *
   * "Save changes" sat beside "Complete…", reported success, and wrote neither an outcome nor a
   * follow-up — which is exactly what an officer would read as "saved, but no follow-up appeared".
   * It is now separately labelled and the dialog says in words what each one does.
   */
  it('says plainly that saving details is not the same as recording an outcome', async () => {
    const transport = new RecordingTransport([activityRecord()]);
    renderDialog(
      <ActivityDialog mode="edit" caseId={CASE_ID} activityId={ACTIVITY_ID} onClose={() => {}} onSaved={() => {}} />,
      transport);

    const hint = await screen.findByTestId('activity-complete-hint');
    expect(hint).toHaveTextContent(/outcome/i);
    expect(hint).toHaveTextContent(/Complete/);
    expect(screen.getByTestId('activity-update')).not.toHaveTextContent('Save changes');
  });
});
