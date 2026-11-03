import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeAuthAdapter, makeUserClaims } from './test-app.js';
import {
  BFD_URL, BFD_USER_ID, COLLECTION_CASE_ID, CONCERN_TYPE_ID, DEPARTMENT_ID, HL_URL, HL_USER_ID, MANAGER_ID, NON_CUSTOMER_ID, PRODUCT_ID,
  defaultCrmState, fakeCrmFetch, type FakeCrmState, type RecordedRequest,
} from './helpers/fakeCaseManagementCrm.js';

const REQUEST_ID = '99999999-9999-4999-8999-999999999999';
const ROUTE = `/collection-cases/${COLLECTION_CASE_ID}/complaints`;
const CONFIGURED = { FEATURE_BFD: true, DV_BFD_DATAVERSE_URL: BFD_URL, DV_DATAVERSE_URL: HL_URL, CASE_MANAGEMENT_NON_CUSTOMER_ACCOUNT_ID: NON_CUSTOMER_ID };

let state: FakeCrmState;
let requests: RecordedRequest[];

function submit(app: FastifyInstance, body: Record<string, unknown> = { requestId: REQUEST_ID, description: 'Customer disputes the late fee.' }) {
  return app.inject({ method: 'POST', url: ROUTE, headers: { authorization: 'Bearer user-token' }, payload: body });
}
const createRequest = () => requests.find(r => r.method === 'PATCH' && r.url.includes('/incidents('));
const createdId = () => /incidents\(([^)]+)\)/.exec(createRequest()?.url ?? '')?.[1];
const hlWrites = () => requests.filter(r => r.url.startsWith(HL_URL) && r.method !== 'GET');
const activityCreate = () => requests.find(r => r.method === 'PATCH' && r.url.includes('/qdb_collectionactivities(') && r.headers['If-None-Match'] === '*');
const activityUpdates = () => requests.filter(r => r.method === 'PATCH' && r.url.includes('/qdb_collectionactivities(') && r.headers['If-None-Match'] !== '*');
const activityId = () => /qdb_collectionactivities\(([^)]+)\)/.exec(activityCreate()?.url ?? '')?.[1];

describe('POST /collection-cases/:id/complaints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp(makeAuthAdapter(makeUserClaims({ email: 'officer@qdb.qa' })), CONFIGURED);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    state = defaultCrmState();
    requests = [];
    vi.stubGlobal('fetch', fakeCrmFetch(state, requests));
  });

  describe('HL mapping', () => {
    it('should_create_the_case_management_complaint_with_the_approved_hl_mapping', async () => {
      const response = await submit(app);

      expect(response.statusCode).toBe(201);
      expect(createRequest()?.body).toMatchObject({
        'customerid_account@odata.bind': `/accounts(${NON_CUSTOMER_ID})`,
        qdb_contact_name: 'Mariam Al-Thani',
        qdb_customer_name: 'Mariam Al-Thani',
        qdb_customer_mobile_number: '+974 5500 1234',
        qdb_businessunit: 100000000,
        'qdb_Department@odata.bind': `/businessunits(${DEPARTMENT_ID})`,
        qdb_case_source: false,
        casetypecode: 2,
        qdb_existing_customer: false,
        caseorigincode: 1,
        'ownerid@odata.bind': `/systemusers(${BFD_USER_ID})`,
        'qdb_Assigned_to_User@odata.bind': `/systemusers(${MANAGER_ID})`,
        'qdb_Product@odata.bind': `/qdb_case_productses(${PRODUCT_ID})`,
        description: 'Customer disputes the late fee.',
      });
    });

    it('should_set_received_date_to_the_moment_of_creation', async () => {
      const before = Date.now();
      await submit(app);

      const receivedOn = Date.parse(String(createRequest()?.body?.['followupby']));
      expect(receivedOn).toBeGreaterThanOrEqual(before - 1000);
      expect(receivedOn).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('should_not_map_a_cr_number_or_the_hl_contact_into_the_case', async () => {
      await submit(app);

      const body = createRequest()?.body ?? {};
      expect(Object.keys(body).some(key => /crnumber|customerid_contact|qdb_contact@|qdb_qid/i.test(key))).toBe(false);
    });

    it('should_return_the_case_management_record_as_case_management_reports_it', async () => {
      const response = await submit(app);

      expect(response.json()).toMatchObject({
        caseNumber: 'BFD-25600-A1B2', status: 'In Progress', createdOn: '2026-09-29T12:00:00Z',
        assignedTo: 'Housing Loan Manager', owner: 'Collection Officer', isRepeatSubmission: false,
      });
      expect(response.json().openUrl).toMatch(new RegExp(`^${BFD_URL}/main\\.aspx\\?etn=incident&pagetype=entityrecord&id=`));
    });
  });

  describe('security', () => {
    it('should_read_the_collection_case_as_the_signed_in_hl_user', async () => {
      await submit(app);

      const caseRead = requests.find(r => r.url.includes('/qdb_collectioncases('));
      expect(caseRead?.headers['MSCRMCallerID']).toBe(HL_USER_ID);
    });

    it('should_create_the_complaint_as_the_signed_in_case_management_user', async () => {
      await submit(app);

      expect(createRequest()?.headers['MSCRMCallerID']).toBe(BFD_USER_ID);
    });

    it('should_return_401_without_a_token', async () => {
      const response = await app.inject({ method: 'POST', url: ROUTE, payload: { requestId: REQUEST_ID, description: 'x' } });

      expect(response.statusCode).toBe(401);
    });

    it('should_return_403_when_hl_crm_refuses_the_collection_case', async () => {
      state.collectionCase = 'forbidden';

      const response = await submit(app);

      expect(response.statusCode).toBe(403);
      expect(createRequest()).toBeUndefined();
    });

    it('should_return_403_when_case_management_refuses_the_create', async () => {
      state.createOutcome = 'forbidden';

      const response = await submit(app);

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('complaint_access_denied');
    });

    it('should_return_403_when_the_user_is_not_an_enabled_case_management_user', async () => {
      state.bfdUsers = [];

      const response = await submit(app);

      expect(response.statusCode).toBe(403);
      expect(createRequest()).toBeUndefined();
    });

    it('should_reject_client_supplied_owner_customer_or_mapping_values', async () => {
      const response = await submit(app, { requestId: REQUEST_ID, description: 'x', ownerid: BFD_USER_ID, casetypecode: 3 });

      expect(response.statusCode).toBe(422);
      expect(requests).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('should_create_only_so_the_platform_refuses_a_second_record_under_the_same_id', async () => {
      await submit(app);

      expect(createRequest()?.headers['If-None-Match']).toBe('*');
    });

    it('should_derive_the_same_record_id_for_a_retried_submission', async () => {
      await submit(app);
      const firstId = createdId();
      requests.length = 0;
      await submit(app);

      expect(createdId()).toBe(firstId);
    });

    it('should_report_the_existing_complaint_when_the_submission_was_already_created', async () => {
      state.createOutcome = 'duplicate';

      const response = await submit(app);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ isRepeatSubmission: true, caseNumber: 'BFD-25600-A1B2' });
    });

    it('should_derive_a_different_record_for_a_new_submission_on_the_same_collection_case', async () => {
      await submit(app);
      const firstId = createdId();
      requests.length = 0;
      await submit(app, { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', description: 'A second complaint.' });

      expect(createdId()).not.toBe(firstId);
    });
  });

  describe('configuration', () => {
    it('should_return_503_when_the_non_customer_account_does_not_exist', async () => {
      state.nonCustomer = 'notFound';

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
      expect(createRequest()).toBeUndefined();
    });

    it('should_return_503_when_the_configured_account_is_not_the_non_customer_account', async () => {
      state.nonCustomer = { name: 'Some Customer', statecode: 0 };

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
    });

    it('should_return_503_when_the_housing_loan_business_unit_is_ambiguous', async () => {
      state.departments = [...state.departments, { businessunitid: 'other', _qdb_manager_value: MANAGER_ID }];

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
    });

    it('should_return_503_when_the_business_unit_has_no_manager', async () => {
      state.departments = [{ businessunitid: DEPARTMENT_ID, _qdb_manager_value: null }];

      const response = await submit(app);

      expect(response.json()).toMatchObject({ code: 'case_management_configuration' });
      expect(createRequest()).toBeUndefined();
    });

    it('should_return_503_when_the_housing_loan_product_is_missing', async () => {
      state.products = [];

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
    });

    it('should_return_503_when_the_complaint_case_type_is_missing', async () => {
      state.options['casetypecode'] = [{ Value: 1, label: 'Inquiry' }];

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
    });

    it('should_return_503_when_case_management_is_not_configured', async () => {
      const unconfigured = await buildTestApp(makeAuthAdapter(), { DV_DATAVERSE_URL: HL_URL });

      const response = await submit(unconfigured);
      await unconfigured.close();

      expect(response.statusCode).toBe(503);
      expect(requests).toHaveLength(0);
    });
  });

  describe('collection context', () => {
    it('should_return_422_for_a_bfd_collection_case', async () => {
      state.collectionCase = { ...(state.collectionCase as Record<string, unknown>), qdb_organizationcode: 100000141 };

      const response = await submit(app);

      expect(response.statusCode).toBe(422);
    });

    it('should_return_422_when_the_hl_customer_has_no_mobile_number', async () => {
      state.contact = { fullname: 'Mariam Al-Thani', mobilephone: null };

      const response = await submit(app);

      expect(response.statusCode).toBe(422);
      expect(createRequest()).toBeUndefined();
    });

    it('should_return_404_when_the_collection_case_does_not_exist', async () => {
      state.collectionCase = 'notFound';

      const response = await submit(app);

      expect(response.statusCode).toBe(404);
    });

    it('should_return_422_for_an_empty_description', async () => {
      const response = await submit(app, { requestId: REQUEST_ID, description: '   ' });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('originating collection activity', () => {
    it('should_record_the_request_on_the_collection_case_before_creating_the_case', async () => {
      await submit(app);

      const order = requests.filter(r => r.method === 'PATCH').map(r => (r.url.includes('/incidents(') ? 'case' : 'activity'));
      expect(order.slice(0, 2)).toEqual(['activity', 'case']);
    });

    it('should_open_the_activity_as_a_complaint_hand_off_to_bfd_in_progress', async () => {
      await submit(app);

      expect(activityCreate()?.body).toMatchObject({
        qdb_relatedrecordtype: 'incident', qdb_relatedrecordorganization: 100000141, statuscode: 100000641,
        'qdb_activitytypeid_qdb_collectionactivity@odata.bind': `/qdb_collectionactivitytypes(${CONCERN_TYPE_ID})`,
        'qdb_collectioncaseid_qdb_collectionactivity@odata.bind': `/qdb_collectioncases(${COLLECTION_CASE_ID})`,
      });
    });

    it('should_complete_the_activity_with_the_case_id_and_number', async () => {
      await submit(app);

      expect(activityUpdates()[0]?.body).toMatchObject({
        qdb_relatedrecordid: createdId(), qdb_relatedrecordnumber: 'BFD-25600-A1B2', statecode: 1, statuscode: 100000644,
      });
    });

    it('should_write_the_activity_as_the_signed_in_hl_user', async () => {
      await submit(app);

      expect(activityCreate()?.headers['MSCRMCallerID']).toBe(HL_USER_ID);
    });

    it('should_never_change_the_collection_case_itself', async () => {
      await submit(app);

      expect(hlWrites().every(r => r.url.includes('/qdb_collectionactivities('))).toBe(true);
    });

    it('should_cancel_the_request_when_case_management_refuses_it', async () => {
      state.createOutcome = 'forbidden';

      await submit(app);

      expect(activityUpdates()[0]?.body).toMatchObject({ statecode: 2, statuscode: 100000645 });
    });

    it('should_leave_the_request_open_for_a_retry_when_the_outcome_is_uncertain', async () => {
      state.createOutcome = 'serverError';

      const response = await submit(app);

      expect(response.statusCode).toBe(500);
      expect(activityUpdates()).toHaveLength(0);
    });

    it('should_finish_on_retry_when_recording_the_case_failed_after_it_was_created', async () => {
      state.activityUpdateFails = true;
      const first = await submit(app);
      state.activityUpdateFails = false;
      state.existingActivityState = 0;
      state.createOutcome = 'duplicate';
      requests.length = 0;

      const retry = await submit(app);

      expect(first.statusCode).toBe(500);
      expect(retry.json()).toMatchObject({ isRepeatSubmission: true });
      expect(activityUpdates()[0]?.body).toMatchObject({ qdb_relatedrecordnumber: 'BFD-25600-A1B2', statecode: 1 });
    });

    it('should_report_an_already_completed_request_without_creating_again', async () => {
      state.existingActivityState = 1;

      const response = await submit(app);

      expect(response.json()).toMatchObject({ isRepeatSubmission: true });
      expect(createRequest()).toBeUndefined();
    });

    it('should_refuse_a_request_that_was_closed_after_a_refusal', async () => {
      state.existingActivityState = 2;

      const response = await submit(app);

      expect(response.statusCode).toBe(409);
      expect(createRequest()).toBeUndefined();
    });

    it('should_refuse_when_no_single_concern_activity_type_is_configured', async () => {
      state.activityTypes = [{ qdb_collectionactivitytypeid: 'call-type', qdb_code: 'P6-CALL' }];

      const response = await submit(app);

      expect(response.statusCode).toBe(503);
      expect(hlWrites()).toHaveLength(0);
    });

    it('should_return_the_target_organization_and_the_activity_id', async () => {
      const response = await submit(app);

      expect(response.json()).toMatchObject({ targetOrganization: 'BFD', collectionActivityId: activityId() });
    });
  });
});
