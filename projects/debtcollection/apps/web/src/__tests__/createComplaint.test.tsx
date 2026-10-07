import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CreateComplaintPane, RaiseComplaintCard } from '../views/CreateComplaintPane.js';
import { CrmSessionProvider } from '../shell/context.js';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { readIntegrationServiceUrl } from '../data/integrationEndpoint.js';

/**
 * "Create complaint" — the officer writes a description; the Integration Service does the rest.
 * The platform configuration and the service are faked at their edges (Web API and fetch), so the
 * whole chain is exercised: flag → address → request → result.
 */
const WAIT = 5000;
const SERVICE = 'https://dcp-integration.qdb.example';
const CASE_ID = '11111111-1111-4111-8111-111111111111';
const RAISED = {
  caseManagementCaseId: 'c0ffee00-0000-5000-8000-000000000001', caseNumber: 'BFD-25600-A1B2', status: 'In Progress',
  createdOn: '2026-09-29T12:00:00Z', assignedTo: 'Housing Loan Manager', owner: 'Collection Officer',
  openUrl: 'https://qdbcrmapp/QDB1/main.aspx?etn=incident&pagetype=entityrecord&id=c0ffee00', isRepeatSubmission: false,
};

function platform(featureFlags: string | null): XrmLike {
  return {
    WebApi: {
      retrieveRecord: async () => ({}),
      retrieveMultipleRecords: async (logicalName: string) =>
        logicalName === 'qdb_platformconfiguration' && featureFlags !== null
          ? { entities: [{ qdb_platformconfigurationid: 'p1', qdb_featureflags: featureFlags, qdb_isactive: true }] }
          : { entities: [] },
    },
  } as unknown as XrmLike;
}

function renderPane(options: { flags?: string | null; token?: boolean } = {}) {
  const adapter = new XrmCrmAdapter(platform(options.flags === undefined ? JSON.stringify({ integrationServiceUrl: SERVICE }) : options.flags));
  const session = { adapter, context: {}, ...(options.token === false ? {} : { integrationServiceToken: async () => 'user-token' }) };
  return render(
    <CrmSessionProvider value={session as never}>
      <CreateComplaintPane caseId={CASE_ID} onClose={() => undefined} />
    </CrmSessionProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function describeAndSubmit(text = 'Customer disputes the late fee.') {
  fireEvent.change(await screen.findByTestId('complaint-description', {}, { timeout: WAIT }), { target: { value: text } });
  fireEvent.click(screen.getByTestId('complaint-submit'));
}

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(201, RAISED));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Create complaint pane', () => {
  it('should_send_only_the_description_and_a_request_id_with_the_users_token', async () => {
    renderPane();
    await describeAndSubmit();

    await screen.findByTestId('complaint-raised', {}, { timeout: WAIT });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SERVICE}/collection-cases/${CASE_ID}/complaints`);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer user-token');
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(['description', 'requestId']);
  });

  it('should_show_the_case_management_record_and_a_link_to_open_it', async () => {
    renderPane();
    await describeAndSubmit();

    const summary = await screen.findByTestId('complaint-summary', {}, { timeout: WAIT });
    expect(summary.textContent).toContain('BFD-25600-A1B2');
    expect(summary.textContent).toContain('Housing Loan Manager');
    expect(screen.getByTestId('complaint-open').getAttribute('href')).toBe(RAISED.openUrl);
  });

  it('should_repeat_the_same_request_id_when_the_officer_retries_after_a_failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { code: 'case_management_configuration', message: 'Business unit "Housing Loan" has no manager' }));
    renderPane();
    await describeAndSubmit();
    await screen.findByTestId('complaint-error', {}, { timeout: WAIT });
    fireEvent.click(screen.getByTestId('complaint-submit'));

    await screen.findByTestId('complaint-raised', {}, { timeout: WAIT });
    const ids = fetchMock.mock.calls.map(call => JSON.parse(String((call[1] as RequestInit).body)).requestId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('should_show_the_services_own_reason_when_it_refuses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { code: 'case_management_configuration', message: 'Business unit "Housing Loan" has no manager' }));
    renderPane();
    await describeAndSubmit();

    expect((await screen.findByTestId('complaint-error', {}, { timeout: WAIT })).textContent).toContain('has no manager');
  });

  it('should_not_submit_an_empty_description', async () => {
    renderPane();

    await screen.findByTestId('complaint-description', {}, { timeout: WAIT });
    expect((screen.getByTestId('complaint-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('should_say_why_when_the_service_address_is_not_configured', async () => {
    renderPane({ flags: '{}' });

    expect((await screen.findByTestId('complaint-unavailable', {}, { timeout: WAIT })).textContent).toContain('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should_say_why_when_sign_in_to_the_service_is_not_set_up', async () => {
    renderPane({ token: false });

    expect((await screen.findByTestId('complaint-unavailable', {}, { timeout: WAIT })).textContent).toContain('Sign-in');
  });

  it('should_say_why_when_there_is_no_platform_configuration', async () => {
    renderPane({ flags: null });

    expect((await screen.findByTestId('complaint-unavailable', {}, { timeout: WAIT })).textContent).toContain('missing or ambiguous');
  });
});

describe('Raise a complaint card', () => {
  const renderCard = (organization: string) => render(
    <CrmSessionProvider value={{ adapter: new XrmCrmAdapter(platform(null)), context: {} } as never}>
      <RaiseComplaintCard caseId={CASE_ID} organization={organization} />
    </CrmSessionProvider>,
  );

  it('should_offer_create_complaint_on_a_housing_loan_case', () => {
    renderCard('HL');

    expect(screen.queryByTestId('create-complaint')).not.toBeNull();
  });

  it('should_not_offer_it_on_a_bfd_case_whose_mapping_is_not_approved', () => {
    renderCard('BFD');

    expect(screen.queryByTestId('create-complaint')).toBeNull();
  });
});

describe('readIntegrationServiceUrl', () => {
  it('readIntegrationServiceUrl_httpsAddress_returnsIt', () => {
    expect(readIntegrationServiceUrl(JSON.stringify({ integrationServiceUrl: SERVICE }))).toBe(SERVICE);
  });

  it('readIntegrationServiceUrl_plainHttp_isRefused', () => {
    expect(readIntegrationServiceUrl(JSON.stringify({ integrationServiceUrl: 'http://insecure.example' }))).toBeUndefined();
  });

  it('readIntegrationServiceUrl_unparseableFlags_returnsNothing', () => {
    expect(readIntegrationServiceUrl('{not json')).toBeUndefined();
  });
});
