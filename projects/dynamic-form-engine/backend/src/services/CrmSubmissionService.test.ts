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
});
