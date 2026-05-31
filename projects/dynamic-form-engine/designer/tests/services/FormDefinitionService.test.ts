import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormDefinitionService } from '@/services/FormDefinitionService';
import { FORM_DEFINITION_ATTRS, FORM_STATUS_VALUE } from '@/constants/attributeNames';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
  } as unknown as typeof Xrm.WebApi;
}

describe('FormDefinitionService', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: FormDefinitionService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new FormDefinitionService(webApi);
  });

  it('createForm_createsRecord_andReturnsId', async () => {
    const expectedId = 'aaa-bbb-ccc';
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: expectedId });

    const id = await service.createForm({
      name: 'Test Form',
      code: 'TEST_FORM',
      description: 'A test form',
      entityLogicalName: 'contact',
      themeId: null,
    });

    expect(id).toBe(expectedId);
    expect(webApi.createRecord).toHaveBeenCalledOnce();
    expect(webApi.createRecord).toHaveBeenCalledWith(
      'qdb_form_definition',
      expect.objectContaining({
        [FORM_DEFINITION_ATTRS.NAME]: 'Test Form',
        [FORM_DEFINITION_ATTRS.CODE]: 'TEST_FORM',
        [FORM_DEFINITION_ATTRS.STATUS]: FORM_STATUS_VALUE.DRAFT,
      })
    );
  });

  it('listForms_withStatusFilter_appliesFilter', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [
        {
          [FORM_DEFINITION_ATTRS.ID]: 'form-1',
          [FORM_DEFINITION_ATTRS.NAME]: 'Published Form',
          [FORM_DEFINITION_ATTRS.CODE]: 'PUB',
          [FORM_DEFINITION_ATTRS.STATUS]: FORM_STATUS_VALUE.ACTIVE,
          [FORM_DEFINITION_ATTRS.CURRENT_VERSION]: '1.0',
          [FORM_DEFINITION_ATTRS.MODIFIED_BY]: 'user-1',
          [FORM_DEFINITION_ATTRS.MODIFIED_ON]: '2026-01-01T00:00:00Z',
        },
      ],
      nextLink: undefined,
    });

    const forms = await service.listForms({ status: 'published' });

    expect(forms).toHaveLength(1);
    expect(forms[0].status).toBe('published');

    const [, query] = vi.mocked(webApi.retrieveMultipleRecords).mock.calls[0];
    expect(query).toContain(`qdb_status eq ${FORM_STATUS_VALUE.ACTIVE}`);
  });

  it('deleteForm_callsDeleteRecord_withCorrectId', async () => {
    const formId = 'form-to-delete';
    vi.mocked(webApi.deleteRecord).mockResolvedValue({ id: formId });

    await service.deleteForm(formId);

    expect(webApi.deleteRecord).toHaveBeenCalledOnce();
    expect(webApi.deleteRecord).toHaveBeenCalledWith('qdb_form_definition', formId);
  });
});
