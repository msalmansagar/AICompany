/**
 * A fake of the two CRM organisations an HL complaint touches: HL CRM (the Collection Case and its
 * contact) and BFD Case Management (users, reference records, metadata, incidents). It answers the
 * Web API URLs the service calls and records every request, so tests can assert what was written
 * and where. Each scenario overrides only what it changes.
 */
export const HL_URL = 'https://hl-crm.example.com';
export const BFD_URL = 'https://bfd-crm.example.com';
export const COLLECTION_CASE_ID = '11111111-1111-4111-8111-111111111111';
export const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
export const NON_CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
export const HL_USER_ID = '44444444-4444-4444-8444-444444444444';
export const BFD_USER_ID = '55555555-5555-4555-8555-555555555555';
export const DEPARTMENT_ID = '66666666-6666-4666-8666-666666666666';
export const MANAGER_ID = '77777777-7777-4777-8777-777777777777';
export const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
export const HL_ORGANIZATION_CODE = 100000140;
export const MISSING_RECORD_ID = 'dead0000-0000-4000-8000-000000000404';
export const FORBIDDEN_RECORD_ID = 'dead0000-0000-4000-8000-000000000403';
export const CONCERN_TYPE_ID = '99990000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

export interface FakeCrmState {
  collectionCase: Row | 'notFound' | 'forbidden';
  contact: Row;
  hlUsers: Row[];
  bfdUsers: Row[];
  nonCustomer: Row | 'notFound';
  departments: Row[];
  products: Row[];
  options: Record<string, Array<{ Value: number; label: string }>>;
  createOutcome: 'created' | 'duplicate' | 'forbidden' | 'serverError';
  activityTypes: Row[];
  /** The originating activity, when a previous attempt already created it: its statecode. */
  existingActivityState: number | null;
  createdIncident: Row;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Row;
}

export function defaultCrmState(): FakeCrmState {
  return {
    collectionCase: {
      qdb_casenumber: 'COL-000123', qdb_facilitynumber: 'HL-001245', qdb_organizationcode: HL_ORGANIZATION_CODE,
      _qdb_customerid_value: CONTACT_ID, '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
    },
    contact: { fullname: 'Mariam Al-Thani', mobilephone: '+974 5500 1234' },
    hlUsers: [{ systemuserid: HL_USER_ID }],
    bfdUsers: [{ systemuserid: BFD_USER_ID }],
    nonCustomer: { name: 'Non Customer', statecode: 0 },
    departments: [{ businessunitid: DEPARTMENT_ID, _qdb_manager_value: MANAGER_ID }],
    products: [{ qdb_case_productsid: PRODUCT_ID }],
    options: {
      casetypecode: [{ Value: 1, label: 'Inquiry' }, { Value: 2, label: 'Complaint' }],
      caseorigincode: [{ Value: 1, label: 'Phone' }, { Value: 2, label: 'Email' }],
      qdb_businessunit: [{ Value: 100000000, label: 'Housing Loan' }, { Value: 100000001, label: 'Financing' }],
    },
    createOutcome: 'created',
    activityTypes: [{ qdb_collectionactivitytypeid: CONCERN_TYPE_ID, qdb_code: 'P6-DISPUTE' }, { qdb_collectionactivitytypeid: 'call-type', qdb_code: 'P6-CALL' }],
    existingActivityState: null,
    createdIncident: {
      ticketnumber: 'BFD-25600-A1B2', createdon: '2026-09-29T12:00:00Z',
      'statuscode@OData.Community.Display.V1.FormattedValue': 'In Progress',
      '_ownerid_value@OData.Community.Display.V1.FormattedValue': 'Collection Officer',
      '_qdb_assigned_to_user_value@OData.Community.Display.V1.FormattedValue': 'Housing Loan Manager',
    },
  };
}

const RELATIONSHIPS = [
  ['customerid', 'account', 'customerid_account'], ['customerid', 'contact', 'customerid_contact'],
  ['ownerid', 'systemuser', 'ownerid'], ['qdb_department', 'businessunit', 'qdb_Department'],
  ['qdb_assigned_to_user', 'systemuser', 'qdb_Assigned_to_User'], ['qdb_product', 'qdb_case_products', 'qdb_Product'],
].map(([ReferencingAttribute, ReferencedEntity, ReferencingEntityNavigationPropertyName]) => ({
  ReferencingAttribute, ReferencedEntity, ReferencingEntityNavigationPropertyName,
}));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refusal = (status: number, code: string) => json(status, { error: { code, message: `refused ${code}` } });

/** Builds a `fetch` replacement over the state, recording every request into `requests`. */
export function fakeCrmFetch(state: FakeCrmState, requests: RecordedRequest[]): typeof fetch {
  return async (input, init) => {
    const url = decodeURIComponent(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Row) : undefined;
    requests.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string>, ...(body ? { body } : {}) });
    return url.startsWith(HL_URL) ? answerHl(state, url, method, init) : answerBfd(state, url, method);
  };
}

function answerHl(state: FakeCrmState, url: string, method: string, init?: RequestInit): Response {
  if (url.includes('/qdb_collectionactivitytypes')) return json(200, { value: state.activityTypes });
  if (url.includes('/qdb_collectionactivities(')) return answerActivity(state, method, init);
  if (url.includes('/systemusers')) return json(200, { value: state.hlUsers });
  if (url.includes(`/contacts(${CONTACT_ID})`)) return json(200, state.contact);
  if (url.includes(`/qdb_collectioncases(`)) {
    if (state.collectionCase === 'notFound') return refusal(404, '0x80040217');
    if (state.collectionCase === 'forbidden') return refusal(403, '0x80040220');
    return json(200, state.collectionCase);
  }
  return refusal(404, 'unexpected_hl_url');
}

function answerBfd(state: FakeCrmState, url: string, method: string): Response {
  if (method === 'PATCH' && url.includes('/incidents(')) return answerCreate(state);
  if (url.includes(MISSING_RECORD_ID)) return refusal(404, '0x80040217');
  if (url.includes(FORBIDDEN_RECORD_ID)) return refusal(403, '0x80040220');
  if (url.includes('/incidents(')) return json(200, state.createdIncident);
  if (url.includes('/qdb_qdblegals(')) return json(200, { qdb_name: 'LEG-0007', 'statecode@OData.Community.Display.V1.FormattedValue': 'Active', 'statuscode@OData.Community.Display.V1.FormattedValue': 'Under Review' });
  if (url.includes('/systemusers')) return json(200, { value: state.bfdUsers });
  if (url.includes('/accounts(')) return state.nonCustomer === 'notFound' ? refusal(404, '0x80040217') : json(200, state.nonCustomer);
  if (url.includes('/businessunits')) return json(200, { value: state.departments });
  if (url.includes('/qdb_case_productses')) return json(200, { value: state.products });
  if (url.includes('/ManyToOneRelationships')) return json(200, { value: RELATIONSHIPS });
  const option = /Attributes\(LogicalName='(\w+)'\)/.exec(url);
  if (option) return json(200, { OptionSet: { Options: (state.options[option[1]!] ?? []).map(o => ({ Value: o.Value, Label: { UserLocalizedLabel: { Label: o.label } } })) } });
  return refusal(404, 'unexpected_bfd_url');
}

function answerActivity(state: FakeCrmState, method: string, init?: RequestInit): Response {
  const isCreateOnly = (init?.headers as Record<string, string> | undefined)?.['If-None-Match'] === '*';
  if (method === 'PATCH' && isCreateOnly) return state.existingActivityState === null ? new Response(null, { status: 204 }) : refusal(412, '0x80060882');
  if (method === 'PATCH') return new Response(null, { status: 204 });
  return json(200, { statecode: state.existingActivityState ?? 0 });
}

function answerCreate(state: FakeCrmState): Response {
  if (state.createOutcome === 'duplicate') return refusal(412, '0x80060882');
  if (state.createOutcome === 'forbidden') return refusal(403, '0x80040220');
  if (state.createOutcome === 'serverError') return refusal(500, '0x80040216');
  return new Response(null, { status: 204 });
}
