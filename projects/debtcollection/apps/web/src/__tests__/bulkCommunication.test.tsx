import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { serialiseNonSuccesses } from '@dcp/domain';
import { App } from '../App.js';
import { STATUS_CODES } from '../services/bulkCommunicationService.js';
import { FakePlatform, fakeXrm, type Rows } from './bulkPlatform.js';
import type { XrmLike } from '../platform/crmContext.js';

/**
 * Bulk SMS and Bulk Email, driven the way a Collection Officer drives them.
 *
 * `App` is mounted, so the route table, the router, `createCrmSession()`, the real transport, the
 * communication service and the bulk executor all have to agree. Only the platform is stood in for.
 *
 * The reason this file exists at all is the Phase 7 lesson: the bulk **engine** was proved live and
 * the screen that an officer would use did not exist, so "bulk delivered" was a claim about
 * automation rather than about anybody's work. These tests assert the officer's journey and the
 * invariants underneath it at the same time, because either one alone can be green while the
 * feature is wrong.
 */

const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const ORG_HL = 100000140;

const caseIds = [
  'aaaaaaa1-1111-1111-1111-111111111111',
  'aaaaaaa2-2222-2222-2222-222222222222',
  'aaaaaaa3-3333-3333-3333-333333333333',
];

const contactIds = [
  'ccccccc1-1111-1111-1111-111111111111',
  'ccccccc2-2222-2222-2222-222222222222',
  'ccccccc3-3333-3333-3333-333333333333',
];

const caseRows = caseIds.map((id, index) => ({
  qdb_collectioncaseid: id,
  qdb_casenumber: `COL-HL-00010${index + 1}`,
  qdb_customerbusinessid: `2891234567${index}`,
  qdb_facilitynumber: `HL-9900${index}`,
  qdb_currentdpd: 40 + index,
  qdb_organizationcode: ORG_HL,
  statecode: 0,
  _qdb_customerid_value: contactIds[index],
  [`_qdb_customerid_value${LOOKUP_TABLE}`]: 'contact',
}));

const contactRows = contactIds.map((id, index) => ({
  contactid: id,
  fullname: `Customer ${index + 1}`,
  mobilephone: `+9745550000${index}`,
  emailaddress1: `customer${index + 1}@example.test`,
  statecode: 0,
  donotfax: false,
  donotemail: false,
  donotphone: false,
}));

const smsTemplate = {
  qdb_communicationtemplateid: 't-sms',
  qdb_code: 'P7-SMS-OVERDUE-EN',
  qdb_name: 'Overdue reminder',
  qdb_channel: 100000100,
  qdb_language: 100000441,
  qdb_subject: '',
  qdb_body: 'Your account is overdue. Please call {{branch}}.',
  qdb_placeholders: 'branch',
  qdb_externaltemplateref: '',
  qdb_approvalstatus: 1,
  qdb_approvalrequired: true,
  qdb_freetextallowed: false,
  qdb_editingallowed: false,
  qdb_isactive: true,
  qdb_effectivefrom: null,
  qdb_effectiveto: null,
};

const unapprovedTemplate = {
  ...smsTemplate,
  qdb_communicationtemplateid: 't-unapproved',
  qdb_code: 'P7-SMS-UNAPPROVED-EN',
  qdb_name: 'Never approved',
  qdb_approvalstatus: null,
};

const emailTemplate = {
  ...smsTemplate,
  qdb_communicationtemplateid: 't-email',
  qdb_code: 'P7-EMAIL-OVERDUE-EN',
  qdb_name: 'Overdue notice',
  qdb_channel: 100000102,
  qdb_subject: 'Your account is overdue',
  qdb_body: 'Please contact {{branch}}.',
};

const permissiveConfiguration = {
  qdb_platformconfigurationid: 'cfg-hl',
  qdb_name: 'Sandbox configuration',
  qdb_organizationcode: ORG_HL,
  qdb_isactive: true,
  qdb_contactholdrulesetcode: null,
  qdb_featureflags: JSON.stringify({ contactHoldPolicy: 'allow-when-unverifiable' }),
};

const rows = (templates = [smsTemplate, unapprovedTemplate, emailTemplate]): Rows => ({
  qdb_collectioncase: caseRows,
  contact: contactRows,
  qdb_communicationtemplate: templates,
  qdb_platformconfiguration: [permissiveConfiguration],
  qdb_communicationrun: [],
  fax: [],
  email: [],
  qdb_collectionactivity: [],
});

let platform: FakePlatform;

function openBulk(source: Rows = rows(), organizationName?: string) {
  const xrm = organizationName ? fakeXrm(source, organizationName) : fakeXrm(source);
  (window as unknown as { Xrm?: XrmLike }).Xrm = xrm;
  window.location.hash = '#comms/bulk';
  render(<App />);
  return screen.findByTestId('bulk-communication');
}

/** Composes an approved message so the run is ready to confirm. */
async function compose(channel: 'SMS' | 'Email', templateId: string) {
  await userEvent.selectOptions(screen.getByTestId('bulk-channel'), channel);
  const picker = screen.getByTestId('bulk-template');
  await waitFor(() => expect(picker.textContent).toContain('P7-'));
  await userEvent.selectOptions(picker, templateId);
  await userEvent.type(screen.getByTestId('bulk-placeholder-branch'), 'Doha');
}

/** How many native SMS creates the transport has issued. Counted, so a click cannot pass silently. */
function faxCreates(): number {
  return platform.requests.filter(request =>
    request.method === 'PATCH' && request.url.includes('/faxes(')).length;
}

/** Confirms the run and waits for the detail screen its creation navigates to. */
async function confirmRun() {
  await userEvent.click(screen.getByTestId('bulk-confirm-open'));
  await userEvent.click(await screen.findByTestId('bulk-confirm-create'));
  return screen.findByTestId('bulk-run-detail');
}

beforeEach(() => {
  window.location.hash = '';
  platform = new FakePlatform(rows());
  platform.install();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { Xrm?: XrmLike }).Xrm;
});

// ── Choosing who it goes to ──────────────────────────────────────────────────

describe('the population an officer commits to', () => {
  it('shows how many recipients will be contacted, before anything is confirmed', async () => {
    await openBulk();
    await waitFor(() =>
      expect(screen.getByTestId('bulk-target-count').textContent).toMatch(/\b3\b/));
  });

  it('counts only the cases the officer ticked, when the population is an explicit selection', async () => {
    await openBulk();
    await userEvent.selectOptions(screen.getByTestId('bulk-selection-mode'), 'SelectedRecords');

    await waitFor(() => expect(screen.getByTestId('bulk-selection-hint').textContent).toMatch(/\b0\b/));
    await userEvent.click(await screen.findByText('COL-HL-000101'));

    await waitFor(() => expect(screen.getByTestId('bulk-target-count').textContent).toMatch(/\b1\b/));
  });

  it('narrows the population by case number, and re-counts what it narrowed to', async () => {
    await openBulk();
    await waitFor(() =>
      expect(screen.getByTestId('bulk-target-count').textContent).toMatch(/\b3\b/));

    // The fake honours `contains(qdb_casenumber,…)`, so a search that reached the source changes
    // the count and one that was applied to already-fetched rows would not.
    await userEvent.type(screen.getByTestId('bulk-search'), 'COL-HL-000101');

    await waitFor(() =>
      expect(screen.getByTestId('bulk-target-count').textContent).toMatch(/\b1\b/));
  });

  it('never loads the population into the browser to count it', async () => {
    await openBulk();
    await waitFor(() =>
      expect(screen.getByTestId('bulk-target-count').textContent).toMatch(/\b3\b/));

    // The count is the platform's own `$count`, asked for over the transport with a page size of
    // one — because `Xrm.WebApi` does not return a count at all (KI-96). A screen that counted by
    // fetching the population would look identical here and be catastrophic on the real book, so
    // the assertion is on the row budget of the request that produced the number.
    const counts = platform.requests.filter(request => request.url.includes('$count=true'));
    expect(counts.length, 'nothing asked the platform for a count').toBeGreaterThan(0);
    for (const request of counts) {
      expect(request.url, 'a count asked for more than one row').toContain('$top=1');
    }
  });
});

// ── Choosing what it says ────────────────────────────────────────────────────

describe('the wording a bulk run may carry', () => {
  it('offers approved templates and never an unapproved one', async () => {
    await openBulk();
    const picker = screen.getByTestId('bulk-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE-EN'));
    expect(picker.textContent).not.toContain('P7-SMS-UNAPPROVED-EN');
  });

  it('offers the email template only on the email channel', async () => {
    await openBulk();
    const picker = screen.getByTestId('bulk-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE-EN'));
    expect(picker.textContent).not.toContain('P7-EMAIL-OVERDUE-EN');

    await userEvent.selectOptions(screen.getByTestId('bulk-channel'), 'Email');
    await waitFor(() => expect(screen.getByTestId('bulk-template').textContent)
      .toContain('P7-EMAIL-OVERDUE-EN'));
    expect(screen.getByTestId('bulk-template').textContent).not.toContain('P7-SMS-OVERDUE-EN');
  });

  it('refuses to confirm while the wording is incomplete', async () => {
    await openBulk();
    const picker = screen.getByTestId('bulk-template');
    await waitFor(() => expect(picker.textContent).toContain('P7-SMS-OVERDUE-EN'));
    await userEvent.selectOptions(picker, 't-sms');

    expect(screen.getByTestId('bulk-unresolved').textContent).toMatch(/branch/);
    expect(screen.getByTestId('bulk-confirm-open')).toBeDisabled();
  });

  it('says the same wording reaches every recipient, because it does', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    expect(screen.getByTestId('bulk-preview')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('bulk-communication').textContent)
      .toMatch(/every recipient receives/i));
  });
});

// ── Starting a run ───────────────────────────────────────────────────────────

describe('creating a run freezes it', () => {
  it('writes the population down once and creates no message at confirmation', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();

    expect(platform.runs.size).toBe(1);
    const stored = [...platform.runs.values()][0]!.record;
    expect(stored['qdb_totalrecipients']).toBe(3);
    // The manifest stores ids compactly — the population, not a rendering of it.
    expect(String(stored['qdb_frozenpopulation'])).toContain(caseIds[0]!.replace(/-/g, ''));

    // Confirming agrees a campaign. It does not send one.
    expect(platform.activities.size).toBe(0);
  });

  it('refuses a run rather than starting one when the column capacity cannot be read', async () => {
    platform.metadataReadable = false;
    await openBulk();
    await compose('SMS', 't-sms');

    await userEvent.click(screen.getByTestId('bulk-confirm-open'));
    await userEvent.click(await screen.findByTestId('bulk-confirm-create'));

    await waitFor(() => expect(screen.getByTestId('bulk-refusal').textContent)
      .toMatch(/unavailable/i));
    // Refused, not guessed: a run sized against a capacity nobody established would be truncated
    // silently at the column boundary.
    expect(platform.runs.size).toBe(0);
  });
});

// ── Sending ──────────────────────────────────────────────────────────────────

describe('an officer sends a bulk run', () => {
  it('creates one SMS per recipient, each with its recipient party', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();

    await userEvent.click(screen.getByTestId('bulk-run-start'));

    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });
    // A row without its party is not a communication (KI-86). Reconciliation counts parties, and so
    // does this test.
    expect(platform.completeCommunications()).toBe(3);
  });

  it('creates one email per recipient on the email channel', async () => {
    await openBulk();
    await compose('Email', 't-email');
    await confirmRun();

    await userEvent.click(screen.getByTestId('bulk-run-start'));

    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });
    expect(platform.completeCommunications()).toBe(3);
    expect(platform.requests.some(request => request.url.includes('/emails('))).toBe(true);
  });

  it('shows progress that reconciles with what the platform holds', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));

    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });
    const progress = await screen.findByTestId('bulk-progress');
    await waitFor(() => expect(progress.textContent).toMatch(/Recorded/));
    // Target 3, processed 3, recorded 3 — and the platform holds 3 complete communications.
    expect(platform.completeCommunications()).toBe(3);
    const stored = [...platform.runs.values()][0]!.record;
    expect(stored['qdb_cursor']).toBe(3);
  });

  it('does not walk recipients from the browser — the run header moves per batch, not per recipient', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));
    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });

    const headerWrites = platform.requests.filter(request =>
      request.method === 'PATCH' && request.url.includes('/qdb_communicationruns('));
    // One create, one claim, one checkpoint. Three recipients, and the count does not follow them:
    // the executor takes the batch, the browser takes the batch's result.
    expect(headerWrites).toHaveLength(3);
  });

  it('never tells the officer the message was delivered', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    const detail = await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));
    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });

    // No form of "deliver" anywhere: this screen creates records, and QDB's service is what sends
    // them. A screen that said "delivered" would be claiming an outcome it cannot observe (KI-83).
    expect(detail.textContent).not.toMatch(/deliver(ed|s|y)?\b/i);
    expect(detail.textContent).toMatch(/QDB.s own mechanism sends it/i);
  });
});

// ── Coming back to a run ─────────────────────────────────────────────────────

describe('a run survives the browser', () => {
  it('reopens from the platform with its progress intact', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));
    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });

    const runId = [...platform.runs.keys()][0]!;
    cleanup();

    // A fresh mount at the same URL — which is what a refresh is.
    window.location.hash = `#comms/bulk/${runId}`;
    render(<App />);

    const progress = await screen.findByTestId('bulk-progress');
    await waitFor(() => expect(progress.textContent).toMatch(/Target/));
    // Read back from the run header, not remembered: this render never saw the run being sent.
    expect([...platform.runs.values()][0]!.record['qdb_cursor']).toBe(3);
  });

  it('resumes a run that stopped part-way without re-sending what was done', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));
    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });

    const runId = [...platform.runs.keys()][0]!;
    const stored = platform.runs.get(runId)!;
    // A crash between the last create and the checkpoint: the cursor is behind, and the run is
    // still Running. Winding the cursor back on a *Completed* run would not be that state, and the
    // engine correctly refuses to restart a completed run.
    platform.runs.set(runId, {
      record: { ...stored.record, qdb_cursor: 0, qdb_status: STATUS_CODES.Running },
      version: stored.version + 1,
    });

    cleanup();
    window.location.hash = `#comms/bulk/${runId}`;
    render(<App />);
    await userEvent.click(await screen.findByTestId('bulk-run-start'));

    await waitFor(() => expect(platform.runs.get(runId)!.record['qdb_cursor']).toBe(3), { timeout: 5000 });
    // The deterministic id means the platform refuses each create a second time. Counted as
    // creates the platform ACCEPTED, not as distinct ids — a map cannot grow past three however
    // many duplicates are sent, so counting ids would report safety it never established.
    expect(platform.acceptedActivityCreates).toBe(3);
    expect(platform.completeCommunications()).toBe(3);
  });

  it('retrying the ones that need it never creates a second message for the same recipient', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();
    await userEvent.click(screen.getByTestId('bulk-run-start'));
    await waitFor(() => expect(platform.activities.size).toBe(3), { timeout: 5000 });

    const runId = [...platform.runs.keys()][0]!;
    const stored = platform.runs.get(runId)!;
    // A recorded retryable failure for a recipient whose activity already exists — exactly the
    // half-made communication KI-86 describes. Written with the domain's own serialiser, because a
    // hand-rolled format would test a shape the executor never reads.
    platform.runs.set(runId, {
      record: {
        ...stored.record,
        qdb_status: STATUS_CODES.Paused,
        qdb_failedrecipients: serialiseNonSuccesses([
          { recipientId: caseIds[0]!, outcome: 'failed', detail: 'incomplete communication' },
        ]),
      },
      version: stored.version + 1,
    });

    cleanup();
    window.location.hash = `#comms/bulk/${runId}`;
    render(<App />);
    const before = faxCreates();
    await userEvent.click(await screen.findByTestId('bulk-run-retry'));

    // The retry must actually reach the send path — counting all requests ever made would pass
    // even if the click did nothing, which is the vacuous-guard mistake KI-94 was about.
    await waitFor(() => expect(faxCreates()).toBeGreaterThan(before), { timeout: 5000 });
    // And having reached it, it repairs rather than duplicates: the deterministic id is refused.
    expect(platform.acceptedActivityCreates).toBe(3);
  });
});

// ── What the officer is shown ────────────────────────────────────────────────

describe('the results an officer reads', () => {
  it('names the case rather than an identifier when a recipient needs attention', async () => {
    await openBulk();
    await compose('SMS', 't-sms');
    await confirmRun();

    const runId = [...platform.runs.keys()][0]!;
    const stored = platform.runs.get(runId)!;
    platform.runs.set(runId, {
      record: {
        ...stored.record,
        qdb_failedrecipients: serialiseNonSuccesses([
          { recipientId: caseIds[1]!, outcome: 'refused', detail: 'The customer may not be contacted by SMS.' },
        ]),
      },
      version: stored.version + 1,
    });

    cleanup();
    window.location.hash = `#comms/bulk/${runId}`;
    render(<App />);

    const outcomes = await screen.findByTestId('bulk-outcomes');
    await waitFor(() => expect(outcomes.textContent).toContain('COL-HL-000102'));
    expect(outcomes.textContent).not.toContain(caseIds[1]);
  });
});
