import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeAuthAdapter, makeUserClaims } from './test-app.js';
import {
  BFD_URL, BFD_USER_ID, FORBIDDEN_RECORD_ID, HL_URL, MISSING_RECORD_ID, NON_CUSTOMER_ID,
  defaultCrmState, fakeCrmFetch, type RecordedRequest,
} from './helpers/fakeCaseManagementCrm.js';

const CASE_ID = 'c0ffee00-0000-4000-8000-000000000001';
const LEGAL_ID = 'c0ffee00-0000-4000-8000-000000000002';
const CONFIGURED = { FEATURE_BFD: true, DV_BFD_DATAVERSE_URL: BFD_URL, DV_DATAVERSE_URL: HL_URL, CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID: NON_CUSTOMER_ID };

let requests: RecordedRequest[];

function summarise(app: FastifyInstance, references: unknown) {
  return app.inject({ method: 'POST', url: '/external-references/summaries', headers: { authorization: 'Bearer user-token' }, payload: { references } });
}
const complaint = (recordId: string) => ({ process: 'Complaint', organization: 'BFD', recordId });

describe('POST /external-references/summaries', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp(makeAuthAdapter(makeUserClaims({ email: 'officer@qdb.qa' })), CONFIGURED);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    requests = [];
    vi.stubGlobal('fetch', fakeCrmFetch(defaultCrmState(), requests));
  });

  it('should_return_the_owning_modules_current_complaint_summary', async () => {
    const response = await summarise(app, [complaint(CASE_ID)]);

    expect(response.json().summaries[0]).toMatchObject({
      availability: 'found', recordNumber: 'BFD-25600-A1B2', statusReason: 'In Progress', assignedTo: 'Housing Loan Manager',
    });
  });

  it('should_read_the_record_as_the_signed_in_user_of_the_target_organisation', async () => {
    await summarise(app, [complaint(CASE_ID)]);

    expect(requests.find(r => r.url.includes(`/incidents(${CASE_ID})`))?.headers['MSCRMCallerID']).toBe(BFD_USER_ID);
  });

  it('should_build_the_open_link_from_configuration', async () => {
    const response = await summarise(app, [complaint(CASE_ID)]);

    expect(response.json().summaries[0].openUrl).toBe(`${BFD_URL}/main.aspx?etn=incident&pagetype=entityrecord&id=${CASE_ID}`);
  });

  it('should_summarise_a_legal_reference_by_the_legal_records_own_name', async () => {
    const response = await summarise(app, [{ process: 'Legal', organization: 'BFD', recordId: LEGAL_ID }]);

    expect(response.json().summaries[0]).toMatchObject({ availability: 'found', recordNumber: 'LEG-0007', statusReason: 'Under Review' });
  });

  it('should_report_a_deleted_record_as_not_found_without_failing_the_page', async () => {
    const response = await summarise(app, [complaint(MISSING_RECORD_ID), complaint(CASE_ID)]);

    expect(response.json().summaries.map((s: { availability: string }) => s.availability)).toEqual(['notFound', 'found']);
  });

  it('should_report_a_refused_read_as_forbidden', async () => {
    const response = await summarise(app, [complaint(FORBIDDEN_RECORD_ID)]);

    expect(response.json().summaries[0].availability).toBe('forbidden');
  });

  it('should_refuse_more_than_one_page_of_references', async () => {
    const response = await summarise(app, Array.from({ length: 51 }, () => complaint(CASE_ID)));

    expect(response.statusCode).toBe(422);
  });

  it('should_refuse_an_unknown_process', async () => {
    const response = await summarise(app, [{ process: 'Restructuring', organization: 'BFD', recordId: CASE_ID }]);

    expect(response.statusCode).toBe(422);
  });

  it('should_return_401_without_a_token', async () => {
    const response = await app.inject({ method: 'POST', url: '/external-references/summaries', payload: { references: [complaint(CASE_ID)] } });

    expect(response.statusCode).toBe(401);
  });

  it('should_return_503_when_the_target_organisation_is_not_configured', async () => {
    const hlOnly = await buildTestApp(makeAuthAdapter(), { DV_DATAVERSE_URL: HL_URL });

    const response = await summarise(hlOnly, [complaint(CASE_ID)]);
    await hlOnly.close();

    expect(response.statusCode).toBe(503);
  });
});
