import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * The Communication Centre, driven through the real application.
 *
 * `App` is mounted, so the route table, the router, `createCrmSession()`, the real
 * `SameOriginWriteTransport` and the service all have to agree for a test to pass. Only `fetch` and
 * `Xrm.WebApi` are stood in for — the network and the platform, which is the correct boundary.
 *
 * Phase 6 is the reason. Three of its six defects had every automated test passing while the feature
 * did not work, and two of those were found by the user rather than the suite: the adapter was built
 * with no write transport at all, and the configuration the form read was seeded unusable. Both
 * would have been caught by a test that assembled the application the way production does, so these
 * do.
 *
 * The send path therefore asserts what actually **left the browser**: a Fax row, and then its
 * recipient party. A row without its party is not a communication (KI-86), and a test that only
 * checked the row would pass over precisely the defect the live organisation produced.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';

const CASE_ID = '11111111-1111-1111-1111-111111111111';
const CONTACT_ID = '22222222-2222-2222-2222-222222222222';

const caseRow = {
  qdb_collectioncaseid: CASE_ID,
  qdb_casenumber: 'COL-HL-000123',
  qdb_customerbusinessid: '28912345678',
  qdb_facilitynumber: 'HL-99001',
  qdb_currentdpd: 45,
  // The organisation is the key configuration is resolved by. A case without one cannot be
  // resolved at all, and the screen fails closed — which is a state worth having a test for.
  qdb_organizationcode: 100000140,
  statecode: 0,
  _qdb_customerid_value: CONTACT_ID,
  [`_qdb_customerid_value${LOOKUP_TABLE}`]: 'contact',
};

const contactRow = (overrides: Record<string, unknown> = {}) => ({
  contactid: CONTACT_ID,
  fullname: 'Ahmed Al-Thani',
  mobilephone: '+97455500000',
  emailaddress1: 'ahmed@example.test',
  statecode: 0,
  donotfax: false,
  donotemail: false,
  donotphone: false,
  ...overrides,
});

/** An approved, active SMS template with one placeholder. */
const approvedTemplate = {
  qdb_communicationtemplateid: 't-approved',
  qdb_code: 'P7-SMS-OVERDUE',
  qdb_name: 'Overdue reminder',
  qdb_channel: 100000100,
  qdb_language: 100000441,
  qdb_subject: '',
  qdb_body: 'Dear {{customerName}}, your account is overdue.',
  qdb_placeholders: 'customerName',
  qdb_externaltemplateref: '',
  qdb_approvalstatus: 1,
  qdb_approvalrequired: true,
  qdb_freetextallowed: false,
  qdb_editingallowed: false,
  qdb_isactive: true,
  qdb_effectivefrom: null,
  qdb_effectiveto: null,
};

/** Same shape, never approved — the state a new template is really in. */
const unapprovedTemplate = {
  ...approvedTemplate,
  qdb_communicationtemplateid: 't-unapproved',
  qdb_code: 'P7-SMS-DRAFT',
  qdb_name: 'Draft wording',
  qdb_approvalstatus: null,
};

const inactiveTemplate = {
  ...approvedTemplate,
  qdb_communicationtemplateid: 't-inactive',
  qdb_code: 'P7-SMS-OFF',
  qdb_name: 'Retired wording',
  qdb_isactive: false,
};

const faxRow = {
  activityid: 'fax-1',
  subject: 'SMS to Ahmed',
  createdon: '2026-09-19T10:00:00Z',
  statuscode: 1,
  [`statuscode${FORMATTED}`]: 'Open',
  directioncode: true,
};

const emailRow = {
  activityid: 'email-1',
  subject: 'Overdue notice',
  createdon: '2026-09-20T10:00:00Z',
  statuscode: 1,
  [`statuscode${FORMATTED}`]: 'Draft',
  directioncode: true,
};

/**
 * A platform configuration that has **written down** its decision about an unverifiable hold.
 *
 * This organisation has no Contact Hold ruleset (verified: `qdb_contactholdrulesetcode` is null on
 * both rows), so sending is refused unless the deployment has explicitly recorded that it may
 * proceed without one. That recorded choice is what these fixtures supply — and the fact that a
 * test must supply it is the safeguard working.
 */
const permissiveConfiguration = {
  qdb_platformconfigurationid: 'cfg-1',
  qdb_name: 'Sandbox configuration',
  qdb_organizationcode: 100000140,
  qdb_isactive: true,
  qdb_contactholdrulesetcode: null,
  qdb_featureflags: JSON.stringify({ contactHoldPolicy: 'allow-when-unverifiable' }),
};

interface Rows { [logicalName: string]: Record<string, unknown>[] }

const queried: string[] = [];

function fakeXrm(rows: Rows): XrmLike {
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
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string) {
        const row = rows[logicalName]?.[0];
        if (!row) throw { status: 404 };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string, options = '') {
        queried.push(logicalName);
        const all = rows[logicalName] ?? [];
        // Honoured, not ignored: configuration is resolved BY organisation code, and a fake that
        // returned every row regardless would let a keyless resolver pass.
        const key = /qdb_organizationcode eq (\d+)/.exec(String(options))?.[1];
        const entities = key === undefined
          ? all
          : all.filter(row => Number(row['qdb_organizationcode']) === Number(key));
        return { entities, '@odata.count': entities.length };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  };
}

/** Every request the production transport actually made. */
interface SentRequest { method: string; url: string; body: unknown }

function captureWrites(): SentRequest[] {
  const sent: SentRequest[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    sent.push({
      method: String(init.method ?? 'GET'),
      url: String(url),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    // A party append answers 204; an upsert create answers 201 with a version.
    return new Response(null, { status: 204, headers: { ETag: 'W/"1"' } });
  });
  return sent;
}

function open(rows: Rows) {
  (window as unknown as { Xrm?: XrmLike }).Xrm = fakeXrm(rows);
  window.location.hash = `#comms/${CASE_ID}`;
  render(<App />);
  return screen.findByTestId('view-comms');
}

const baseRows = (templates: Record<string, unknown>[] = [approvedTemplate]): Rows => ({
  qdb_collectioncase: [caseRow],
  contact: [contactRow()],
  qdb_communicationtemplate: templates,
  fax: [faxRow],
  email: [emailRow],
  qdb_collectionactivity: [],
  qdb_platformconfiguration: [permissiveConfiguration],
});

beforeEach(() => { window.location.hash = ''; queried.length = 0; });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

describe('choosing what to send', () => {
  it('offers an approved, active template', async () => {
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
  });

  it('never offers a template that has not been approved', async () => {
    await open(baseRows([approvedTemplate, unapprovedTemplate]));
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    // The column has no Draft value, so an untouched template carries null. Reading that as
    // anything but "unapproved" would put unreviewed wording in front of a customer.
    expect(picker.textContent).not.toContain('P7-SMS-DRAFT');
  });

  it('never offers an inactive template', async () => {
    await open(baseRows([approvedTemplate, inactiveTemplate]));
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    expect(picker.textContent).not.toContain('P7-SMS-OFF');
  });

  it('says so plainly when no template is available, rather than showing an empty list', async () => {
    await open(baseRows([inactiveTemplate]));
    await waitFor(() => expect(screen.getByTestId('view-comms').textContent)
      .toMatch(/No template is available/i));
  });
});

describe('an incomplete message cannot be sent', () => {
  it('refuses to enable Send while a placeholder is unresolved', async () => {
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));

    await userEvent.selectOptions(picker, 't-approved');

    expect(screen.getByTestId('composer-unresolved').textContent).toMatch(/customerName/);
    expect(screen.getByTestId('composer-send')).toBeDisabled();
  });

  it('enables Send once every placeholder has a value', async () => {
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');

    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');

    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());
    expect(screen.queryByTestId('composer-unresolved')).toBeNull();
  });
});

describe('sending, through the production composition path', () => {
  async function sendOne() {
    const sent = captureWrites();
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());
    await userEvent.click(screen.getByTestId('composer-send'));
    await screen.findByTestId('send-result');
    return sent;
  }

  it('creates the native record AND its recipient party', async () => {
    const sent = await sendOne();

    const create = sent.find(r => r.url.includes('/faxes(') && r.method === 'PATCH');
    expect(create, 'an SMS is a Fax row — created by the service, never named by React').toBeTruthy();

    const party = sent.find(r => r.url.includes('/fax_activity_parties') && r.method === 'POST');
    expect(party, 'a row without its recipient is not a communication (KI-86)').toBeTruthy();
  });

  it('writes only the fields QDB\'s confirmed SMS contract names', async () => {
    const sent = await sendOne();
    const create = sent.find(r => r.url.includes('/faxes(') && r.method === 'PATCH');
    const body = create?.body as Record<string, unknown>;

    expect(body['qdb_message_body']).toContain('Dear Ahmed');
    expect(body['faxnumber']).toBe('+97455500000');
    // WhatsApp-only fields must be absent — their absence is the SMS discriminator.
    expect(body['qdb_whatsapptemplate']).toBeUndefined();
    expect(body['qdb_language']).toBeUndefined();
    expect(body['qdb_otp']).toBeUndefined();
  });

  it('attaches the recipient as a To party, not a sender', async () => {
    const sent = await sendOne();
    // The POST specifically. The service reads the collection first to stay idempotent, so a
    // looser finder matches that GET — which carries no body and would fail for the wrong reason.
    const party = sent.find(r => r.url.includes('/fax_activity_parties') && r.method === 'POST');
    const body = party?.body as Record<string, unknown>;

    expect(body['participationtypemask']).toBe(2);
    expect(body['partyid_contact@odata.bind']).toContain(CONTACT_ID);
  });

  it('presses Send twice and creates ONE record, not two', async () => {
    // The defect this pins reached the deployed organisation: the composer called
    // crypto.randomUUID() inside its Send handler, so every press minted a fresh id and every
    // press created a record. Two Email activities, 23 seconds apart, from two clicks.
    //
    // The original journey test pressed Send once and asserted a create happened — which is why
    // it passed over the defect. Pressing twice is the whole test.
    const sent = captureWrites();
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());

    await userEvent.click(screen.getByTestId('composer-send'));
    await screen.findByTestId('send-result');
    await userEvent.click(screen.getByTestId('composer-send'));
    await waitFor(() => expect(sent.filter(r => r.url.includes('/faxes(')).length).toBeGreaterThan(1));

    // Both presses wrote to the SAME id. The platform refuses the second create; the officer's
    // second press is a no-op rather than a second message.
    const creates = sent.filter(r => r.url.includes('/faxes(') && r.method === 'PATCH');
    const ids = new Set(creates.map(r => /\/faxes\(([^)]+)\)/.exec(r.url)?.[1]));
    expect(creates.length, 'two attempts were made').toBeGreaterThan(1);
    expect(ids.size, 'at one id, so the platform can refuse the duplicate').toBe(1);
  });

  it('derives a different id when the message changes, so an edited resend is a new message', async () => {
    const sent = captureWrites();
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');

    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());
    await userEvent.click(screen.getByTestId('composer-send'));
    await screen.findByTestId('send-result');

    await userEvent.clear(screen.getByTestId('placeholder-customerName'));
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Fatima');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());
    await userEvent.click(screen.getByTestId('composer-send'));
    await waitFor(() => expect(sent.filter(r => r.url.includes('/faxes(')).length).toBeGreaterThan(1));

    const ids = new Set(sent
      .filter(r => r.url.includes('/faxes(') && r.method === 'PATCH')
      .map(r => /\/faxes\(([^)]+)\)/.exec(r.url)?.[1]));
    expect(ids.size, 'a different message is a different record').toBe(2);
  });

  it('re-reads the history after a send, because the confirmation says it will appear there', async () => {
    const sent = captureWrites();
    await open(baseRows());
    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());

    // Counted on the CLIENT API, not on fetch. The history reads go through Xrm.WebApi, so a
    // fetch counter rises from the send's own party read and would pass with no refresh at all —
    // a test agreeing with itself rather than checking anything.
    const historyReadsBefore = queried.filter(name => name === 'email' || name === 'fax').length;
    await userEvent.click(screen.getByTestId('composer-send'));
    const result = await screen.findByTestId('send-result');

    // The confirmation promises the message appears below. A screen that promises that and does
    // not re-read is telling the officer something untrue.
    expect(result.textContent).toMatch(/appear in the history/i);
    await waitFor(() => expect(
      queried.filter(name => name === 'email' || name === 'fax').length,
    ).toBeGreaterThan(historyReadsBefore));
    void sent;
  });

  it('says the message was handed over, never that it was delivered', async () => {
    await sendOne();
    const result = screen.getByTestId('send-result').textContent ?? '';

    expect(result).toMatch(/handed to the bank/i);
    // DCP does not send and cannot know. The dispatcher is not even installed here (KI-83).
    expect(result).not.toMatch(/\bdelivered\b/i);
  });

  it('uses no transport terminology an officer would not recognise', async () => {
    await sendOne();
    const screenText = screen.getByTestId('view-comms').textContent ?? '';
    for (const term of ['412', 'ETag', 'If-Match', 'OData', 'HTTP', 'fax_activity_parties']) {
      expect(screenText, `${term} must never reach a Collection Officer`).not.toContain(term);
    }
  });
});

describe('Contact Hold, which this organisation cannot establish', () => {
  it('blocks sending when no deployment decision has been recorded', async () => {
    const rows = baseRows();
    // A configuration exists for this organisation, but records no decision about an unverifiable
    // hold. That is the ordinary state of a deployment nobody has thought about yet.
    rows['qdb_platformconfiguration'] = [{ ...permissiveConfiguration, qdb_featureflags: null }];
    await open(rows);

    const notice = await screen.findByTestId('hold-blocked');
    expect(notice.textContent).toMatch(/Contact Hold cannot be checked/i);

    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');

    // Complete message, and still not sendable. Failing closed is the requirement, and the officer
    // is told before composing rather than after pressing Send.
    expect(screen.getByTestId('composer-send')).toBeDisabled();
  });

  it('blocks sending when the organisation has no configuration at all', async () => {
    const rows = baseRows();
    rows['qdb_platformconfiguration'] = [];
    await open(rows);

    const notice = await screen.findByTestId('hold-blocked');
    // A different situation from "configured but undecided", and it says so — the fix is different.
    expect(notice.textContent).toMatch(/no active configuration/i);
  });

  it('blocks sending when the case belongs to an organisation with no configuration', async () => {
    const rows = baseRows();
    // The configuration is BFD's; the case is HL's. A decision recorded for one organisation must
    // not permit sending on the other's cases.
    rows['qdb_platformconfiguration'] = [{ ...permissiveConfiguration, qdb_organizationcode: 100000141 }];
    await open(rows);

    await screen.findByTestId('hold-blocked');
  });

  it('blocks sending when the recorded flag is unreadable, rather than treating it as permission', async () => {
    const rows = baseRows();
    rows['qdb_platformconfiguration'] = [{ ...permissiveConfiguration, qdb_featureflags: 'not json' }];
    await open(rows);

    await screen.findByTestId('hold-blocked');
  });

  it('permits sending only where the deployment recorded that choice', async () => {
    await open(baseRows());
    await screen.findByTestId('composer-template');
    expect(screen.queryByTestId('hold-blocked')).toBeNull();
  });
});

describe('a customer who must not be contacted', () => {
  it('refuses the send and says why, in the customer\'s own terms', async () => {
    const sent = captureWrites();
    const rows = baseRows();
    rows['contact'] = [contactRow({ donotfax: true })];

    (window as unknown as { Xrm?: XrmLike }).Xrm = fakeXrm(rows);
    window.location.hash = `#comms/${CASE_ID}`;
    render(<App />);
    await screen.findByTestId('view-comms');

    const picker = await screen.findByTestId('composer-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE'));
    await userEvent.selectOptions(picker, 't-approved');
    await userEvent.type(screen.getByTestId('placeholder-customerName'), 'Ahmed');
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled());
    await userEvent.click(screen.getByTestId('composer-send'));

    const result = await screen.findByTestId('send-result');
    expect(result.textContent).toMatch(/not sent/i);
    // Refused before anything was written. A refusal that still created a row would be the worst
    // of both outcomes.
    expect(sent.some(r => r.url.includes('/faxes('))).toBe(false);
  });
});

describe('the unified history', () => {
  it('shows communications from more than one native table in one timeline', async () => {
    await open(baseRows());
    await screen.findByTestId('history-table');

    const rows = screen.getAllByTestId('history-row');
    const sources = rows.map(row => row.getAttribute('data-source'));
    expect(new Set(sources).size).toBeGreaterThan(1);
  });

  it('orders newest first across tables', async () => {
    await open(baseRows());
    await screen.findByTestId('history-table');

    const first = screen.getAllByTestId('history-row')[0];
    expect(first?.getAttribute('data-source'), 'the email is the newer of the two').toBe('email');
  });

  it('shows the platform\'s own status rather than a word this screen invented', async () => {
    await open(baseRows());
    await screen.findByTestId('history-table');
    const text = screen.getByTestId('history-table').textContent ?? '';

    expect(text).toContain('Open');
    expect(text).toContain('Draft');
    expect(text, 'DCP never claims delivery').not.toMatch(/\bDelivered\b/);
  });

  it('shows an empty state rather than a spinner when there is nothing', async () => {
    const rows = baseRows();
    rows['fax'] = [];
    rows['email'] = [];
    await open(rows);

    await waitFor(() => expect(screen.getByTestId('view-comms').textContent)
      .toMatch(/Nothing has been sent or logged/i));
  });
});

describe('reaching the centre without a case', () => {
  it('asks for a case rather than showing an empty composer', async () => {
    (window as unknown as { Xrm?: XrmLike }).Xrm = fakeXrm(baseRows());
    window.location.hash = '#comms';
    render(<App />);

    const view = await screen.findByTestId('view-comms');
    expect(view.textContent).toMatch(/Choose a case|Communications belong to a case/i);
    expect(screen.queryByTestId('composer')).toBeNull();
  });
});
