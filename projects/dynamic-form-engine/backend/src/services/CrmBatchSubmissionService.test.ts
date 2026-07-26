import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmBatchSubmissionService } from './CrmBatchSubmissionService.js';

// ── Mocks ──────────────────────────────────────────────────────

const mockGetAccessToken = vi.fn().mockResolvedValue('mock-token');
const mockAuthService = { getAccessToken: mockGetAccessToken } as never;
const mockWriteAuditEntry = vi.fn().mockResolvedValue(undefined);
const mockAuditService = { writeAuditEntry: mockWriteAuditEntry } as never;
const mockFetch = vi.fn();
// The engine resolves entity-set names from metadata (opportunity -> opportunities, and
// 290 custom tables in this org). Those calls are answered here rather than from the mock
// queue, so tests keep asserting on the CRM calls they care about.
function metadataResponse(url: string) {
  const match = /LogicalName='([^']+)'/.exec(url);
  const logicalName = match ? match[1] : 'unknown';
  return Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(''), headers: { get: () => null },
    json: () => Promise.resolve({ EntitySetName: `${logicalName}s` }),
  });
}
global.fetch = ((url, options) =>
  String(url).includes('EntityDefinitions') ? metadataResponse(String(url)) : mockFetch(url, options)) as never;

// ── Helpers ────────────────────────────────────────────────────

function makeFormDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'form-001',
    formCode: 'test-form',
    title: 'Test Form',
    powerAutomateFlowId: undefined,
    confirmationRecordRefAttribute: undefined,
    submissionMappings: [
      {
        id: 'sm-001',
        fieldId: 'fld-name',
        targetEntityLogicalName: 'contact',
        targetAttributeLogicalName: 'fullname',
        isMappedToChildEntity: false,
        isActive: true,
      },
    ],
    tabs: [
      {
        sections: [
          {
            fields: [{ id: 'fld-name', schemaName: 'qdb_full_name' }],
          },
        ],
      },
    ],
    ...overrides,
  } as never;
}

function buildSuccessBatchResponse(): string {
  // Format matches what parseBatchResponse (BatchChangesetBuilder) expects.
  const part = `
Content-ID: 1

HTTP/1.1 201 Created
Content-Type: application/json

{"contactid":"contact-abc","@odata.entityId":"https://org.crm4.dynamics.com/api/data/v9.2/contacts(contact-abc)"}

`;
  return `--changeset_dfe_boundary\r\n${part}--changeset_dfe_boundary--`;
}

function buildFailureBatchResponse(failingContentId: number): string {
  const part = `
Content-ID: ${failingContentId}

HTTP/1.1 400 Bad Request
Content-Type: application/json

{"error":{"message":"Validation failed"}}

`;
  return `--changeset_dfe_boundary\r\n${part}--changeset_dfe_boundary--`;
}

function mockBatchPost(responseBody: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(responseBody),
    json: () => Promise.resolve({}),
    headers: { get: () => null },
  });
}

function mockRecordFetch(recordId: string, entity: string) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ [`${entity}id`]: recordId }),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

// ── Tests ──────────────────────────────────────────────────────

describe('CrmBatchSubmissionService', () => {
  let service: CrmBatchSubmissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmBatchSubmissionService(mockAuthService, mockAuditService);
  });

  describe('submitFormWithBatch', () => {
    it('submitFormWithBatch_withValidForm_sendsSingleBatchRequest', async () => {
      // Arrange
      mockFetch
        .mockResolvedValueOnce(mockBatchPost(buildSuccessBatchResponse()));
      // confirmationRecordRefAttribute is undefined so no reference number fetch.

      const form = makeFormDefinition();
      const fieldValues = { qdb_full_name: 'Ali Hassan' };

      // Act
      const result = await service.submitFormWithBatch(
        form, fieldValues, 'user-001', 'Ali Hassan',
        { correlationId: 'corr-001' },
      );

      // Assert — only ONE network call for the batch (not sequential per record)
      const postCalls = (mockFetch.mock.calls as [string, RequestInit][]).filter(
        (call) => call[1]?.method === 'POST',
      );
      expect(postCalls).toHaveLength(1);
      expect(result.parentEntityLogicalName).toBe('contact');
    });

    it('submitFormWithBatch_withLookupTarget_writesANavigationBindingNotTheRawGuid', async () => {
      // Arrange — a mapping whose target column is a lookup. Assigning the GUID to the
      // column returns "CRM do not support direct update of Entity Reference properties".
      const customerId = '11111111-1111-1111-1111-111111111111';
      const form = makeFormDefinition({
        submissionMappings: [{
          id: 'sm-lookup',
          fieldId: 'fld-customer',
          targetEntityLogicalName: 'contact',
          targetAttributeLogicalName: 'qdb_customerid',
          isMappedToChildEntity: false,
          isActive: true,
        }],
        tabs: [{
          sections: [{
            fields: [{
              id: 'fld-customer',
              schemaName: 'qdb_customer',
              fieldType: 'lookup',
              lookupConfig: { entityLogicalName: 'account' },
            }],
          }],
        }],
      });

      mockFetch
        // navigation property metadata
        .mockResolvedValueOnce(Promise.resolve({
          ok: true, status: 200, headers: { get: () => null }, text: () => Promise.resolve(''),
          json: () => Promise.resolve({ value: [{
            ReferencingAttribute: 'qdb_customerid',
            ReferencingEntityNavigationPropertyName: 'qdb_CustomerId',
            ReferencedEntity: 'account',
          }] }),
        }))
        // entity-set metadata is served by the interceptor above
        .mockResolvedValueOnce(mockBatchPost(buildSuccessBatchResponse()));

      // Act
      await service.submitFormWithBatch(
        form, { qdb_customer: customerId }, 'user-001', 'Ali Hassan',
        { correlationId: 'corr-lookup' },
      );

      // Assert — the batch body binds, and never assigns the column directly
      const batchCall = (mockFetch.mock.calls as [string, RequestInit][])
        .find((call) => String(call[0]).endsWith('/$batch'));
      const body = String(batchCall?.[1]?.body);

      expect(body).toContain(`"qdb_CustomerId@odata.bind":"/accounts(${customerId})"`);
      expect(body).not.toContain(`"qdb_customerid":"${customerId}"`);
    });

    it('submitFormWithBatch_withMultiLookupSelection_writesDelimitedRecordIds', async () => {
      // The batch path previously wrote the raw array of { id, displayName } onto the
      // column, which Dataverse rejects. It now matches CrmSubmissionService.
      const first = '11111111-1111-1111-1111-111111111111';
      const second = '22222222-2222-2222-2222-222222222222';

      mockFetch.mockResolvedValueOnce(mockBatchPost(buildSuccessBatchResponse()));

      const form = makeFormDefinition({
        submissionMappings: [{
          id: 'sm-multi',
          fieldId: 'fld-name',
          targetEntityLogicalName: 'contact',
          targetAttributeLogicalName: 'qdb_related_accounts',
          isMappedToChildEntity: false,
          isActive: true,
        }],
      });

      await service.submitFormWithBatch(
        form,
        { qdb_full_name: [{ id: first, displayName: 'One' }, { id: second, displayName: 'Two' }] },
        'user-001', 'Ali Hassan', { correlationId: 'corr-multi' },
      );

      const batchCall = (mockFetch.mock.calls as [string, RequestInit][])
        .find((call) => String(call[0]).endsWith('/$batch'));
      const body = String(batchCall?.[1]?.body);

      expect(body).toContain(`"qdb_related_accounts":"${first};${second}"`);
    });

    it('submitFormWithBatch_whenNoParentMapping_throwsBeforeBatch', async () => {
      // Arrange
      const form = makeFormDefinition({ submissionMappings: [] });

      // Act & Assert
      await expect(
        service.submitFormWithBatch(form, {}, 'user-001', 'Test',
          { correlationId: 'corr-001' }),
      ).rejects.toThrow('No parent entity mapping');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('submitFormWithBatch_whenBatchExceedsMaxOperations_throwsValidationError', async () => {
      // Arrange — create a form that would generate too many operations by injecting
      // grid rows that exceed the default 500 limit
      process.env.MAX_BATCH_OPERATIONS = '3';
      const serviceWithLowLimit = new CrmBatchSubmissionService(mockAuthService, mockAuditService);

      const gridFields = [
        {
          fieldKey: 'grid1',
          targetEntity: 'qdb_item',
          relationshipAttribute: 'qdb_contact_id',
          rows: Array.from({ length: 4 }, (_, i) => ({ value: `row${i}` })),
        },
      ];

      // Act & Assert — 1 parent + 4 grid rows = 5 > limit 3
      await expect(
        serviceWithLowLimit.submitFormWithBatch(
          makeFormDefinition(), {}, 'user-001', 'Test',
          { correlationId: 'corr-001', gridFields },
        ),
      ).rejects.toThrow('Submission exceeds maximum operation count');

      // Cleanup
      delete process.env.MAX_BATCH_OPERATIONS;
    });

    it('submitFormWithBatch_withGridRows_includesRowsInBatch', async () => {
      // Arrange — capture the batch body while returning success.
      // No reference-number fetch needed — confirmationRecordRefAttribute is undefined.
      let capturedBatchBody = '';
      mockFetch
        .mockImplementationOnce((_url: string, options: RequestInit) => {
          capturedBatchBody = options.body as string;
          return mockBatchPost(buildSuccessBatchResponse());
        });

      const gridFields = [
        {
          fieldKey: 'qdb_loan_items',
          targetEntity: 'qdb_loan_item',
          relationshipAttribute: 'qdb_contact_id',
          rows: [{ qdb_amount: 1000 }, { qdb_amount: 2000 }],
        },
      ];

      // Act
      await service.submitFormWithBatch(
        makeFormDefinition(), {}, 'user-001', 'Test',
        { correlationId: 'corr-001', gridFields },
      );

      // Assert — batch body contains grid row entries
      expect(capturedBatchBody).toContain('qdb_amount');
    });

    it('submitFormWithBatch_onBatchFailureAtParent_writesFailureAuditEntry', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce(mockBatchPost(buildFailureBatchResponse(1)));

      // Act & Assert
      await expect(
        service.submitFormWithBatch(
          makeFormDefinition(), {}, 'user-001', 'Test',
          { correlationId: 'corr-001' },
        ),
      ).rejects.toThrow();

      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'formSubmissionFailed' }),
      );
    });

    it('submitFormWithBatch_onSuccess_writesSuccessAuditEntry', async () => {
      // Arrange
      mockFetch.mockResolvedValueOnce(mockBatchPost(buildSuccessBatchResponse()));

      // Act
      await service.submitFormWithBatch(
        makeFormDefinition(), {}, 'user-001', 'Test',
        { correlationId: 'corr-001' },
      );

      // Assert
      expect(mockWriteAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'formSubmitted' }),
      );
    });
  });
});
