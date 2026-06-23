import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmSubmissionService } from './CrmSubmissionService.js';

// ── Shared mocks ──────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;

const mockWriteAuditEntry = vi.fn().mockResolvedValue(undefined);
const mockAuditService = { writeAuditEntry: mockWriteAuditEntry } as never;

const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────

function makeField(id: string, schemaName: string) {
  return { id, schemaName, childFields: [] };
}

function makeFormDefinition(overrides = {}) {
  return {
    id: 'form-001',
    formCode: 'test-form',
    title: 'Test Form',
    powerAutomateFlowId: undefined,
    confirmationRecordRefAttribute: undefined,
    submissionMappings: [
      {
        id: 'sm-001',
        formDefinitionId: 'form-001',
        fieldId: 'fld-name',
        targetEntityLogicalName: 'contact',
        targetAttributeLogicalName: 'fullname',
        isMappedToChildEntity: false,
        isActive: true,
      },
    ],
    tabs: [
      {
        id: 'tab-001',
        sections: [
          {
            id: 'sec-001',
            fields: [makeField('fld-name', 'qdb_full_name')],
          },
        ],
      },
    ],
    ...overrides,
  } as never;
}

function mockCrmPost(recordId: string, entityName = 'contact') {
  return Promise.resolve({
    ok: true,
    status: 201,
    json: () => Promise.resolve({ [`${entityName}id`]: recordId }),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

function mockCrmPatch() {
  return Promise.resolve({
    ok: true,
    status: 204,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

function mockCrmDelete() {
  return Promise.resolve({
    ok: true,
    status: 204,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

function mockCrmGetTemplates(templates: Array<{ documenttemplateid: string }>) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ value: templates }),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

function makeFormDefinitionWithFileField(
  uploadDocumentSetting: unknown,
  downloadDocumentSetting?: unknown,
) {
  const uploadJson =
    typeof uploadDocumentSetting === 'string'
      ? uploadDocumentSetting
      : JSON.stringify(uploadDocumentSetting);
  const downloadJson =
    downloadDocumentSetting === undefined
      ? undefined
      : typeof downloadDocumentSetting === 'string'
        ? downloadDocumentSetting
        : JSON.stringify(downloadDocumentSetting);

  return makeFormDefinition({
    tabs: [
      {
        id: 'tab-001',
        sections: [
          {
            id: 'sec-001',
            fields: [
              makeField('fld-name', 'qdb_full_name'),
              {
                id: 'fld-file',
                schemaName: 'demo_bank_statement',
                uploadDocumentSetting: uploadJson,
                downloadDocumentSetting: downloadJson,
                childFields: [],
              },
            ],
          },
        ],
      },
    ],
  });
}

// ── Tests ─────────────────────────────────────────────────────

describe('CrmSubmissionService', () => {
  let service: CrmSubmissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmSubmissionService(mockAuthService, mockAuditService);
  });

  describe('submitForm', () => {
    it('submitForm_withValidMappings_createsParentRecordAndReturnsId', async () => {
      // Arrange — fieldValues keyed by schemaName, not fieldId
      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPatch());

      const form = makeFormDefinition();
      const fieldValues = { qdb_full_name: 'Ali Hassan' };

      // Act
      const result = await service.submitForm(form, fieldValues, 'user-001', 'Ali Hassan');

      // Assert
      expect(result.parentRecordId).toBe('contact-abc');
      expect(result.parentEntityLogicalName).toBe('contact');
      expect(result.referenceNumber).toBe('CONTACT-');  // first 8 chars of 'contact-abc' uppercased
    });

    it('submitForm_withValidMappings_mapsFieldValuesBySchemaName', async () => {
      // Arrange — verify payload uses schema name lookup
      let capturedPayload: Record<string, unknown> | null = null;

      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        if (options?.method === 'POST') {
          capturedPayload = JSON.parse(options.body as string) as Record<string, unknown>;
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve({ contactid: 'contact-xyz' }),
            text: () => Promise.resolve(''),
            headers: { get: () => null },
          });
        }
        return Promise.resolve({ ok: true, status: 204, json: () => null, text: () => '', headers: { get: () => null } });
      });

      const form = makeFormDefinition();
      const fieldValues = { qdb_full_name: 'Fatima Khan' };

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test User');

      // Assert — mapped field appears in CRM payload
      expect(capturedPayload).toMatchObject({ fullname: 'Fatima Khan' });
    });

    it('submitForm_whenNoParentMapping_throwsBeforeAnyFetch', async () => {
      // Arrange
      const form = makeFormDefinition({ submissionMappings: [] });

      // Act & Assert
      await expect(
        service.submitForm(form, {}, 'user-001', 'Test User'),
      ).rejects.toThrow('No parent entity mapping configured');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('submitForm_whenChildCreationFails_rollsBackParentRecord', async () => {
      // Arrange
      const formWithChild = makeFormDefinition({
        submissionMappings: [
          {
            id: 'sm-001',
            formDefinitionId: 'form-001',
            fieldId: 'fld-name',
            targetEntityLogicalName: 'contact',
            targetAttributeLogicalName: 'fullname',
            isMappedToChildEntity: false,
            isActive: true,
          },
          {
            id: 'sm-002',
            formDefinitionId: 'form-001',
            fieldId: 'fld-amount',
            targetEntityLogicalName: 'opportunity',
            targetAttributeLogicalName: 'budgetamount',
            isMappedToChildEntity: true,
            childEntityRelationshipName: 'opportunity_contact_link',
            isActive: true,
          },
        ],
        tabs: [
          {
            id: 'tab-001',
            sections: [
              {
                id: 'sec-001',
                fields: [
                  makeField('fld-name', 'qdb_full_name'),
                  makeField('fld-amount', 'qdb_amount'),
                ],
              },
            ],
          },
        ],
      });

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('CRM error'),
          headers: { get: () => null },
        })
        .mockResolvedValueOnce(mockCrmDelete());

      // Act & Assert
      await expect(
        service.submitForm(formWithChild, {}, 'user-001', 'Test User'),
      ).rejects.toThrow();

      const deleteCalls = (mockFetch.mock.calls as [string, RequestInit | undefined][]).filter(
        (call) => call[1]?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(1);
    });

    it('submitForm_whenWorkflowTriggerFails_submissionStillSucceeds', async () => {
      // Arrange — BR-012: fire-and-forget, workflow failure must not fail submission
      const formWithFlow = makeFormDefinition({
        powerAutomateFlowId: 'flow-abc',
      });

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPatch())
        .mockRejectedValueOnce(new Error('Flow timeout'));

      // Act
      const result = await service.submitForm(formWithFlow, {}, 'user-001', 'Test User');

      // Assert — submission succeeds despite workflow failure
      expect(result.parentRecordId).toBe('contact-abc');
    });

    it('submitForm_onSuccess_writesAuditLogEntry', async () => {
      // Arrange
      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act
      await service.submitForm(makeFormDefinition(), {}, 'user-001', 'Ali Hassan');

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'formSubmitted',
          recordId: 'contact-abc',
          userId: 'user-001',
        }),
      );
    });

    it('submitForm_onFailure_writesFailureAuditLogEntry', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve(''),
        headers: { get: () => null },
      });

      // Act
      await expect(service.submitForm(makeFormDefinition(), {}, 'user-001', 'Test')).rejects.toThrow();

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'formSubmissionFailed' }),
      );
    });
  });

  describe('processFileUploadSettings', () => {
    it('processFileUploadSettings_withFileFieldAndUploadSetting_createsEdmsRecord', async () => {
      // Arrange
      const uploadSetting = {
        entityName: 'qdb_edms',
        attributeConfig: [
          { attributeName: 'qdb_annotationid@odata.bind', attributeValue: '/annotations({annotationId})', type: 'lookup' },
        ],
      };
      const form = makeFormDefinitionWithFileField(uploadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPost('edms-001', 'qdb_edms'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act
      const result = await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert
      expect(result.parentRecordId).toBe('contact-abc');
      const postCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, opts]) => opts?.method === 'POST',
      );
      expect(postCalls).toHaveLength(2);
    });

    it('processFileUploadSettings_withNoFileSubmitted_skipsEdmsCreation', async () => {
      // Arrange
      const uploadSetting = { entityName: 'qdb_edms', attributeConfig: [] };
      const form = makeFormDefinitionWithFileField(uploadSetting);
      const fieldValues = {}; // no file submitted

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — only parent POST, no EDMS POST
      const postCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, opts]) => opts?.method === 'POST',
      );
      expect(postCalls).toHaveLength(1);
    });

    it('processFileUploadSettings_withMultipleFiles_createsOneEdmsRecordPerFile', async () => {
      // Arrange
      const uploadSetting = {
        entityName: 'qdb_edms',
        attributeConfig: [
          { attributeName: 'qdb_annotationid@odata.bind', attributeValue: '/annotations({annotationId})', type: 'lookup' },
        ],
      };
      const form = makeFormDefinitionWithFileField(uploadSetting);
      const fieldValues = {
        demo_bank_statement: [{ fileId: 'ann-001' }, { fileId: 'ann-002' }],
      };

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPost('edms-001', 'qdb_edms'))
        .mockResolvedValueOnce(mockCrmPost('edms-002', 'qdb_edms'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — one EDMS per uploaded file
      const postCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, opts]) => opts?.method === 'POST',
      );
      expect(postCalls).toHaveLength(3); // parent + 2 EDMS
    });

    it('processFileUploadSettings_whenChildCreationFailsAfterEdms_rollsBackEdmsAndParent', async () => {
      // Arrange — form has a file field + child mapping so child creation can fail after EDMS is created
      const uploadSetting = { entityName: 'qdb_edms', attributeConfig: [] };
      const form = makeFormDefinition({
        submissionMappings: [
          {
            id: 'sm-001',
            formDefinitionId: 'form-001',
            fieldId: 'fld-name',
            targetEntityLogicalName: 'contact',
            targetAttributeLogicalName: 'fullname',
            isMappedToChildEntity: false,
            isActive: true,
          },
          {
            id: 'sm-002',
            formDefinitionId: 'form-001',
            fieldId: 'fld-amount',
            targetEntityLogicalName: 'opportunity',
            targetAttributeLogicalName: 'budgetamount',
            isMappedToChildEntity: true,
            childEntityRelationshipName: 'opportunity_contact_link',
            isActive: true,
          },
        ],
        tabs: [
          {
            id: 'tab-001',
            sections: [
              {
                id: 'sec-001',
                fields: [
                  makeField('fld-name', 'qdb_full_name'),
                  makeField('fld-amount', 'qdb_amount'),
                  { id: 'fld-file', schemaName: 'demo_bank_statement', uploadDocumentSetting: JSON.stringify(uploadSetting), childFields: [] },
                ],
              },
            ],
          },
        ],
      });
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))        // parent
        .mockResolvedValueOnce(mockCrmPost('edms-001', 'qdb_edms'))  // EDMS
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error', text: () => Promise.resolve('CRM error'), headers: { get: () => null } })  // child fails
        .mockResolvedValueOnce(mockCrmDelete())                   // rollback EDMS
        .mockResolvedValueOnce(mockCrmDelete());                  // rollback parent

      // Act & Assert
      await expect(
        service.submitForm(form, fieldValues, 'user-001', 'Test'),
      ).rejects.toThrow();

      const deleteCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, opts]) => opts?.method === 'DELETE',
      );
      expect(deleteCalls).toHaveLength(2); // EDMS + parent both rolled back
    });
  });

  describe('buildEdmsPayload', () => {
    it('buildEdmsPayload_substitutesAllTemplateVariables', async () => {
      // Arrange
      const uploadSetting = {
        entityName: 'qdb_edms',
        attributeConfig: [
          { attributeName: 'qdb_submissionid@odata.bind', attributeValue: '/qdb_form_submission_logs({submissionId})', type: 'lookup' },
          { attributeName: 'qdb_annotationid@odata.bind', attributeValue: '/annotations({annotationId})', type: 'lookup' },
          { attributeName: 'qdb_parent_entity', attributeValue: '{parentEntityName}', type: 'string' },
        ],
      };
      const form = makeFormDefinitionWithFileField(uploadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-xyz' }] };

      let edmsPayload: Record<string, unknown> | null = null;

      mockFetch.mockImplementation((url: string, options: RequestInit) => {
        const urlStr = url as string;
        if (options?.method === 'POST' && urlStr.includes('qdb_edms')) {
          edmsPayload = JSON.parse(options.body as string) as Record<string, unknown>;
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ qdb_edmsid: 'edms-001' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ contactid: 'contact-abc' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        return Promise.resolve({ ok: true, status: 204, json: () => null, text: () => '', headers: { get: () => null } });
      });

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — all three template variables substituted
      expect(edmsPayload).toMatchObject({
        'qdb_submissionid@odata.bind': '/qdb_form_submission_logs(contact-abc)',
        'qdb_annotationid@odata.bind': '/annotations(ann-xyz)',
        'qdb_parent_entity': 'contact',
      });
    });
  });

  describe('parseUploadSetting', () => {
    it('parseUploadSetting_withInvalidJson_throwsValidationError', async () => {
      // Arrange — invalid JSON string in uploadDocumentSetting
      const form = makeFormDefinitionWithFileField('not-valid-json');
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch.mockResolvedValueOnce(mockCrmPost('contact-abc'));

      // Act & Assert
      await expect(
        service.submitForm(form, fieldValues, 'user-001', 'Test'),
      ).rejects.toThrow('invalid JSON');
    });

    it('parseUploadSetting_withMissingEntityName_throwsValidationError', async () => {
      // Arrange — valid JSON but missing required entityName
      const form = makeFormDefinitionWithFileField(JSON.stringify({ attributeConfig: [] }));
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch.mockResolvedValueOnce(mockCrmPost('contact-abc'));

      // Act & Assert
      await expect(
        service.submitForm(form, fieldValues, 'user-001', 'Test'),
      ).rejects.toThrow('entityName');
    });

    it('parseUploadSetting_withMissingAttributeConfig_throwsValidationError', async () => {
      // Arrange — valid JSON but missing required attributeConfig array
      const form = makeFormDefinitionWithFileField(JSON.stringify({ entityName: 'qdb_edms' }));
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch.mockResolvedValueOnce(mockCrmPost('contact-abc'));

      // Act & Assert
      await expect(
        service.submitForm(form, fieldValues, 'user-001', 'Test'),
      ).rejects.toThrow('attributeConfig');
    });
  });

  describe('resolveTemplateGuid', () => {
    it('resolveTemplateGuid_whenTemplateExists_injectsGuidIntoEdmsPayload', async () => {
      // Arrange
      const uploadSetting = {
        entityName: 'qdb_edms',
        attributeConfig: [
          { attributeName: 'qdb_annotationid@odata.bind', attributeValue: '/annotations({annotationId})', type: 'lookup' },
        ],
      };
      const downloadSetting = {
        downloadSetting: {
          attributeConfig: [{ attributeName: 'documentName', attributeValue: 'Invoice', type: 'string' }],
        },
      };
      const form = makeFormDefinitionWithFileField(uploadSetting, downloadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      let edmsPayload: Record<string, unknown> | null = null;

      mockFetch.mockImplementation((url: string, options: RequestInit) => {
        const urlStr = url as string;
        if (urlStr.includes('documenttemplates')) {
          return mockCrmGetTemplates([{ documenttemplateid: 'tmpl-abc' }]);
        }
        if (options?.method === 'POST' && urlStr.includes('qdb_edms')) {
          edmsPayload = JSON.parse(options.body as string) as Record<string, unknown>;
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ qdb_edmsid: 'edms-001' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ contactid: 'contact-abc' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        return Promise.resolve({ ok: true, status: 204, json: () => null, text: () => '', headers: { get: () => null } });
      });

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — resolved GUID injected into EDMS payload
      expect(edmsPayload).toMatchObject({
        'qdb_templateguid@odata.bind': '/documenttemplates(tmpl-abc)',
      });
    });

    it('resolveTemplateGuid_whenTemplateNotFound_createsEdmsWithoutTemplateLink', async () => {
      // Arrange — Dataverse returns an empty value array (template name not found)
      const uploadSetting = { entityName: 'qdb_edms', attributeConfig: [] };
      const downloadSetting = {
        downloadSetting: {
          attributeConfig: [{ attributeName: 'documentName', attributeValue: 'NonExistent', type: 'string' }],
        },
      };
      const form = makeFormDefinitionWithFileField(uploadSetting, downloadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      let edmsPayload: Record<string, unknown> | null = null;

      mockFetch.mockImplementation((url: string, options: RequestInit) => {
        const urlStr = url as string;
        if (urlStr.includes('documenttemplates')) {
          return mockCrmGetTemplates([]); // not found
        }
        if (options?.method === 'POST' && urlStr.includes('qdb_edms')) {
          edmsPayload = JSON.parse(options.body as string) as Record<string, unknown>;
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ qdb_edmsid: 'edms-001' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ contactid: 'contact-abc' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        return Promise.resolve({ ok: true, status: 204, json: () => null, text: () => '', headers: { get: () => null } });
      });

      // Act — must succeed despite template not found (non-fatal)
      const result = await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — EDMS created but no template link
      expect(result.parentRecordId).toBe('contact-abc');
      expect(edmsPayload?.['qdb_templateguid@odata.bind']).toBeUndefined();
    });

    it('resolveTemplateGuid_whenFetchThrows_createsEdmsWithoutTemplateLink', async () => {
      // Arrange — Dataverse call fails entirely (network error)
      const uploadSetting = { entityName: 'qdb_edms', attributeConfig: [] };
      const downloadSetting = {
        downloadSetting: {
          attributeConfig: [{ attributeName: 'documentName', attributeValue: 'Invoice', type: 'string' }],
        },
      };
      const form = makeFormDefinitionWithFileField(uploadSetting, downloadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      let edmsPayload: Record<string, unknown> | null = null;

      mockFetch.mockImplementation((url: string, options: RequestInit) => {
        const urlStr = url as string;
        if (urlStr.includes('documenttemplates')) {
          return Promise.reject(new Error('Network timeout'));
        }
        if (options?.method === 'POST' && urlStr.includes('qdb_edms')) {
          edmsPayload = JSON.parse(options.body as string) as Record<string, unknown>;
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ qdb_edmsid: 'edms-001' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        if (options?.method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ contactid: 'contact-abc' }), text: () => Promise.resolve(''), headers: { get: () => null } });
        }
        return Promise.resolve({ ok: true, status: 204, json: () => null, text: () => '', headers: { get: () => null } });
      });

      // Act — must succeed despite fetch error (non-fatal)
      const result = await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — EDMS still created, no template link
      expect(result.parentRecordId).toBe('contact-abc');
      expect(edmsPayload?.['qdb_templateguid@odata.bind']).toBeUndefined();
    });

    it('resolveTemplateGuid_whenUploadAlreadyHasTemplateGuid_skipsDocumentTemplateQuery', async () => {
      // Arrange — upload setting already contains qdb_templateguid@odata.bind
      const uploadSetting = {
        entityName: 'qdb_edms',
        attributeConfig: [
          { attributeName: 'qdb_templateguid@odata.bind', attributeValue: '/documenttemplates(hardcoded-guid)', type: 'lookup' },
        ],
      };
      const downloadSetting = {
        downloadSetting: {
          attributeConfig: [{ attributeName: 'documentName', attributeValue: 'Invoice', type: 'string' }],
        },
      };
      const form = makeFormDefinitionWithFileField(uploadSetting, downloadSetting);
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPost('edms-001', 'qdb_edms'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act
      await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert — no call to documenttemplates (GUID already present in payload)
      const templateCalls = (mockFetch.mock.calls as [string][]).filter(([url]) =>
        url.includes('documenttemplates'),
      );
      expect(templateCalls).toHaveLength(0);
    });

    it('resolveTemplateGuid_withInvalidDownloadDocumentSetting_createsEdmsWithoutTemplateLink', async () => {
      // Arrange — download setting is invalid JSON; resolution is non-fatal so EDMS still created
      const uploadSetting = { entityName: 'qdb_edms', attributeConfig: [] };
      const form = makeFormDefinitionWithFileField(uploadSetting, 'not-valid-json');
      const fieldValues = { demo_bank_statement: [{ fileId: 'ann-001' }] };

      mockFetch
        .mockResolvedValueOnce(mockCrmPost('contact-abc'))
        .mockResolvedValueOnce(mockCrmPost('edms-001', 'qdb_edms'))
        .mockResolvedValueOnce(mockCrmPatch());

      // Act — must succeed despite unparseable download setting
      const result = await service.submitForm(form, fieldValues, 'user-001', 'Test');

      // Assert
      expect(result.parentRecordId).toBe('contact-abc');
      const postCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        ([, opts]) => opts?.method === 'POST',
      );
      expect(postCalls).toHaveLength(2); // parent + EDMS
    });
  });
});
