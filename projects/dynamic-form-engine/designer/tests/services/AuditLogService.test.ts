import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogService } from '@/services/AuditLogService';
import { FORM_AUDIT_LOG_ATTRS } from '@/constants/attributeNames';
import type { CrmUserContext } from '@/services/CrmContextService';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
  } as unknown as IWebApiAdapter;
}

const TEST_USER_CONTEXT: CrmUserContext = {
  userId: 'user-123',
  userName: 'testuser',
  userFullName: 'Test User',
};

describe('AuditLogService', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: AuditLogService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new AuditLogService(webApi, TEST_USER_CONTEXT);
    vi.mocked(webApi.createRecord).mockResolvedValue({
      id: 'audit-id-1',
      entityType: 'qdb_form_audit_log',
    });
  });

  it('logAction_createsRecord_withCorrectPayload', async () => {
    const formId = 'form-abc';
    const payload = { fieldCount: 5, versionNumber: '1.0' };

    await service.logAction(formId, 'PUBLISH', payload);

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    const [entityName, data] = vi.mocked(webApi.createRecord).mock.calls[0];

    expect(entityName).toBe('qdb_form_audit_log');
    expect(data[FORM_AUDIT_LOG_ATTRS.FORM_ID]).toBe(formId);
    expect(data[FORM_AUDIT_LOG_ATTRS.ACTION]).toBe('PUBLISH');
    expect(data[FORM_AUDIT_LOG_ATTRS.ACTOR_ID]).toBe(TEST_USER_CONTEXT.userId);
    expect(data[FORM_AUDIT_LOG_ATTRS.ACTOR_NAME]).toBe(TEST_USER_CONTEXT.userFullName);
    expect(JSON.parse(String(data[FORM_AUDIT_LOG_ATTRS.PAYLOAD_JSON]))).toEqual(payload);
  });

  it('logAction_neverCallsUpdateRecord', async () => {
    await service.logAction('form-abc', 'OPEN_FORM');

    expect(webApi.updateRecord).not.toHaveBeenCalled();
  });

  it('logAction_neverCallsDeleteRecord', async () => {
    await service.logAction('form-abc', 'SAVE_DRAFT');

    expect(webApi.deleteRecord).not.toHaveBeenCalled();
  });
});
