import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmSubmissionService } from './CrmSubmissionService.js';

// One entry-grid row = one child record. Before this, a child mapping created exactly ONE
// child per (entity + relationship) group however many rows the grid held, and the only way
// to persist rows at all was a JSON blob in a text column.

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('token') } as never;
const mockAuditService = { writeAuditEntry: vi.fn().mockResolvedValue(undefined) } as never;
const mockFetch = vi.fn();

function metadataResponse(url: string) {
  const match = /LogicalName='([^']+)'/.exec(url);
  return Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(''), headers: { get: () => null },
    json: () => Promise.resolve({ EntitySetName: `${match ? match[1] : 'x'}s` }),
  });
}
global.fetch = ((url: unknown, options: unknown) =>
  String(url).includes('EntityDefinitions') || String(url).includes('RelationshipDefinitions')
    ? metadataResponse(String(url))
    : mockFetch(url, options)) as never;

// createRecord reads the new id from the returned representation, keyed by `<entity>id`,
// so the mock answers every such key at once.
function created(id: string) {
  return Promise.resolve({
    ok: true, status: 201, text: () => Promise.resolve(''),
    headers: { get: () => null },
    json: () => Promise.resolve({
      qdb_applicationid: id, qdb_loan_itemid: id, id,
    }),
  });
}

function makeForm(mappings: unknown[], gridSchemaName = 'items') {
  return {
    id: 'form-1',
    title: 'Grid child demo',
    submissionMappings: mappings,
    tabs: [{
      sections: [{
        fields: [
          { id: 'fld-name', schemaName: 'applicant' },
          { id: 'fld-grid', schemaName: gridSchemaName, fieldType: 'repeatingGrid' },
        ],
      }],
    }],
  } as never;
}

const PARENT_MAPPING = {
  id: 'm-parent', fieldId: 'fld-name',
  targetEntityLogicalName: 'qdb_application', targetAttributeLogicalName: 'qdb_name',
  isMappedToChildEntity: false, isActive: true,
};

function gridMapping(gridColumn: string, targetAttribute: string, extra = {}) {
  return {
    id: `m-${gridColumn}`, fieldId: 'fld-grid',
    targetEntityLogicalName: 'qdb_loan_item', targetAttributeLogicalName: targetAttribute,
    isMappedToChildEntity: true, childEntityRelationshipName: 'qdb_ApplicationId',
    gridColumnAttribute: gridColumn, isActive: true, ...extra,
  };
}

function createCalls() {
  return (mockFetch.mock.calls as [string, RequestInit][])
    .filter((call) => call[1]?.method === 'POST')
    .map((call) => ({ url: String(call[0]), body: JSON.parse(String(call[1].body)) }));
}

describe('grid rows as child records', () => {
  let service: CrmSubmissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmSubmissionService(mockAuthService, mockAuditService);
  });

  it('createsOneChildRecordPerRow', async () => {
    mockFetch
      .mockReturnValueOnce(created('parent-1'))
      .mockReturnValueOnce(created('child-1'))
      .mockReturnValueOnce(created('child-2'))
      .mockReturnValue(created('other'));

    await service.submitForm(
      makeForm([PARENT_MAPPING, gridMapping('amount', 'qdb_amount'), gridMapping('purpose', 'qdb_purpose')]),
      { applicant: 'Ali', items: [{ amount: 1000, purpose: 'Stock' }, { amount: 2500, purpose: 'Fitout' }] },
      'user-1', 'Ali',
    );

    const children = createCalls().filter((call) => call.url.includes('qdb_loan_items'));
    expect(children).toHaveLength(2);
    expect(children[0].body).toMatchObject({ qdb_amount: 1000, qdb_purpose: 'Stock' });
    expect(children[1].body).toMatchObject({ qdb_amount: 2500, qdb_purpose: 'Fitout' });
  });

  it('bindsEveryRowToTheParent', async () => {
    mockFetch.mockReturnValue(created('rec'));

    await service.submitForm(
      makeForm([PARENT_MAPPING, gridMapping('amount', 'qdb_amount')]),
      { applicant: 'Ali', items: [{ amount: 1 }, { amount: 2 }] },
      'user-1', 'Ali',
    );

    for (const child of createCalls().filter((c) => c.url.includes('qdb_loan_items'))) {
      expect(child.body['qdb_ApplicationId@odata.bind']).toMatch(/^\/qdb_applications\(/);
    }
  });

  it('leavesAMappingWithNoGridColumnOnTheOneChildPerGroupPath', async () => {
    // The pre-existing behaviour must not change for forms that never used a grid.
    mockFetch.mockReturnValue(created('rec'));

    await service.submitForm(
      makeForm([
        PARENT_MAPPING,
        { ...gridMapping('amount', 'qdb_amount'), gridColumnAttribute: undefined, fieldId: 'fld-name' },
      ]),
      { applicant: 'Ali', items: [{ amount: 1 }, { amount: 2 }] },
      'user-1', 'Ali',
    );

    expect(createCalls().filter((c) => c.url.includes('qdb_loan_items'))).toHaveLength(1);
  });

  it('writesNothingWhenTheGridIsEmpty', async () => {
    mockFetch.mockReturnValue(created('rec'));

    await service.submitForm(
      makeForm([PARENT_MAPPING, gridMapping('amount', 'qdb_amount')]),
      { applicant: 'Ali', items: [] },
      'user-1', 'Ali',
    );

    expect(createCalls().filter((c) => c.url.includes('qdb_loan_items'))).toHaveLength(0);
  });

  it('skipsARowThatMapsToNothing_ratherThanCreatingABlankChild', async () => {
    mockFetch.mockReturnValue(created('rec'));

    await service.submitForm(
      makeForm([PARENT_MAPPING, gridMapping('amount', 'qdb_amount')]),
      { applicant: 'Ali', items: [{ amount: 1000 }, { unrelated: 'x' }] },
      'user-1', 'Ali',
    );

    expect(createCalls().filter((c) => c.url.includes('qdb_loan_items'))).toHaveLength(1);
  });

  it('bindsAGridColumnThatPointsAtAnotherTable_usingTheMappingOverride', async () => {
    mockFetch.mockReturnValue(created('rec'));
    const supplierId = '11111111-1111-1111-1111-111111111111';

    await service.submitForm(
      makeForm([PARENT_MAPPING, gridMapping('supplier', 'qdb_supplierid', {
        targetNavigationProperty: 'qdb_SupplierId',
        targetEntitySetName: 'qdb_suppliers',
      })]),
      { applicant: 'Ali', items: [{ supplier: { id: supplierId, displayName: 'Acme' } }] },
      'user-1', 'Ali',
    );

    const child = createCalls().find((c) => c.url.includes('qdb_loan_items'));
    expect(child?.body['qdb_SupplierId@odata.bind']).toBe(`/qdb_suppliers(${supplierId})`);
    expect(child?.body['qdb_supplierid']).toBeUndefined();
  });

  it('failsLoudlyWhenALookupColumnHasNoBinding_ratherThanWritingAnObject', async () => {
    mockFetch.mockReturnValue(created('rec'));

    await expect(
      service.submitForm(
        makeForm([PARENT_MAPPING, gridMapping('supplier', 'qdb_supplierid')]),
        { applicant: 'Ali', items: [{ supplier: { id: 'abc', displayName: 'Acme' } }] },
        'user-1', 'Ali',
      ),
    ).rejects.toThrow(/Target Navigation Property/);
  });

  it('rejectsARowCountAboveTheLimit_beforeWritingAnyChild', async () => {
    mockFetch.mockReturnValue(created('rec'));
    const rows = Array.from({ length: 251 }, (_, index) => ({ amount: index }));

    await expect(
      service.submitForm(
        makeForm([PARENT_MAPPING, gridMapping('amount', 'qdb_amount')]),
        { applicant: 'Ali', items: rows },
        'user-1', 'Ali',
      ),
    ).rejects.toThrow(/exceeding the limit/);
  });
});
