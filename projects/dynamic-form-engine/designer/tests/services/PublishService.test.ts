import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublishService, PUBLISH_ACTION_NAME, PublishTimeoutError } from '@/services/PublishService';
import {
  PUBLISH_JOB_ATTRS,
  PUBLISH_JOB_STATUS,
  PUBLISH_JOB_TRIGGER_REASON,
} from '@/constants/attributeNames';
import { ENTITY_NAMES } from '@/constants/entityNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

const TEST_FORM_DEFINITION_ID = 'form-def-001';
const TEST_FORM_CODE = 'APP_FORM';
const TEST_TARGET_VERSION = '2.0';
const TEST_JOB_ID = 'job-abc-123';

describe('PublishService', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: PublishService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new PublishService(webApi);

    vi.mocked(webApi.createRecord).mockResolvedValue({
      id: TEST_JOB_ID,
      entityType: ENTITY_NAMES.PUBLISH_JOB,
    });
    vi.mocked(webApi.executeAction).mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── publish() ────────────────────────────────────────────────────────────

  it('publish_createsJobRecord_withCorrectAttributes', async () => {
    await service.publish({
      formDefinitionId: TEST_FORM_DEFINITION_ID,
      formCode: TEST_FORM_CODE,
      targetVersion: TEST_TARGET_VERSION,
    });

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    const [entityName, data] = vi.mocked(webApi.createRecord).mock.calls[0];

    expect(entityName).toBe(ENTITY_NAMES.PUBLISH_JOB);
    expect(data[`${PUBLISH_JOB_ATTRS.FORM_DEFINITION_ID}@odata.bind`]).toBe(
      `/qdb_form_definitions(${TEST_FORM_DEFINITION_ID})`
    );
    expect(data[PUBLISH_JOB_ATTRS.FORM_CODE]).toBe(TEST_FORM_CODE);
    expect(data[PUBLISH_JOB_ATTRS.TARGET_VERSION]).toBe(TEST_TARGET_VERSION);
    expect(data[PUBLISH_JOB_ATTRS.STATUS]).toBe(PUBLISH_JOB_STATUS.QUEUED);
    expect(data[PUBLISH_JOB_ATTRS.TRIGGER_REASON]).toBe(PUBLISH_JOB_TRIGGER_REASON.PUBLISH);
  });

  it('publish_executesPublishAction_withJobIdAndFormDetails', async () => {
    await service.publish({
      formDefinitionId: TEST_FORM_DEFINITION_ID,
      formCode: TEST_FORM_CODE,
      targetVersion: TEST_TARGET_VERSION,
    });

    expect(webApi.executeAction).toHaveBeenCalledOnce();
    const [actionName, parameters] = vi.mocked(webApi.executeAction).mock.calls[0];

    expect(actionName).toBe(PUBLISH_ACTION_NAME);
    expect(parameters['FormDefinitionId']).toBe(TEST_FORM_DEFINITION_ID);
    expect(parameters['FormCode']).toBe(TEST_FORM_CODE);
    expect(parameters['TargetVersion']).toBe(TEST_TARGET_VERSION);
    expect(parameters['PublishJobId']).toBe(TEST_JOB_ID);
    expect(parameters['TriggerReason']).toBe(PUBLISH_JOB_TRIGGER_REASON.PUBLISH);
  });

  it('publish_returnsJobId_fromCreateRecord', async () => {
    const jobId = await service.publish({
      formDefinitionId: TEST_FORM_DEFINITION_ID,
      formCode: TEST_FORM_CODE,
      targetVersion: TEST_TARGET_VERSION,
    });

    expect(jobId).toBe(TEST_JOB_ID);
  });

  // ─── getJobStatus() ───────────────────────────────────────────────────────

  it('getJobStatus_retrievesRecord_withSelectClause', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValue({
      [PUBLISH_JOB_ATTRS.ID]: TEST_JOB_ID,
      [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.RUNNING,
      [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
      [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
      [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
    });

    await service.getJobStatus(TEST_JOB_ID);

    expect(webApi.retrieveRecord).toHaveBeenCalledOnce();
    const [entityName, id, options] = vi.mocked(webApi.retrieveRecord).mock.calls[0];

    expect(entityName).toBe(ENTITY_NAMES.PUBLISH_JOB);
    expect(id).toBe(TEST_JOB_ID);
    expect(options).toContain('$select=');
    expect(options).toContain(PUBLISH_JOB_ATTRS.STATUS);
  });

  it('getJobStatus_mapsStatusField_toPublishJobStatus', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValue({
      [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.COMPLETED,
      [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
      [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
      [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
    });

    const result = await service.getJobStatus(TEST_JOB_ID);

    expect(result.status).toBe(PUBLISH_JOB_STATUS.COMPLETED);
    expect(result.jobId).toBe(TEST_JOB_ID);
  });

  it('getJobStatus_returnsErrorDetails_whenPresent', async () => {
    const errorMessage = 'Template rendering failed: missing locale en-US';
    vi.mocked(webApi.retrieveRecord).mockResolvedValue({
      [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.FAILED,
      [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
      [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: 'en-US,ar-SA',
      [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: errorMessage,
    });

    const result = await service.getJobStatus(TEST_JOB_ID);

    expect(result.errorDetails).toBe(errorMessage);
    expect(result.languagesFailed).toBe('en-US,ar-SA');
    expect(result.languagesSucceeded).toBeNull();
  });

  // ─── pollUntilComplete() ──────────────────────────────────────────────────

  it('pollUntilComplete_returnsImmediately_whenJobAlreadyCompleted', async () => {
    vi.mocked(webApi.retrieveRecord).mockResolvedValue({
      [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.COMPLETED,
      [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: 'en-US',
      [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
      [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
    });

    const result = await service.pollUntilComplete(TEST_JOB_ID);

    expect(result.status).toBe(PUBLISH_JOB_STATUS.COMPLETED);
    expect(webApi.retrieveRecord).toHaveBeenCalledOnce();
  });

  it('pollUntilComplete_pollsMultipleTimes_untilTerminal', async () => {
    vi.useFakeTimers();

    vi.mocked(webApi.retrieveRecord)
      .mockResolvedValueOnce({
        [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.RUNNING,
        [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
        [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
        [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
      })
      .mockResolvedValueOnce({
        [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.RUNNING,
        [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
        [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
        [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
      })
      .mockResolvedValueOnce({
        [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.COMPLETED,
        [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: 'en-US,ar-SA',
        [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
        [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
      });

    const pollPromise = service.pollUntilComplete(TEST_JOB_ID);

    // Advance timers to allow two POLL_INTERVAL_MS gaps
    await vi.runAllTimersAsync();

    const result = await pollPromise;

    expect(result.status).toBe(PUBLISH_JOB_STATUS.COMPLETED);
    expect(result.languagesSucceeded).toBe('en-US,ar-SA');
    expect(webApi.retrieveRecord).toHaveBeenCalledTimes(3);
  });

  it('pollUntilComplete_throwsPublishTimeoutError_whenDeadlineExceeded', async () => {
    vi.useFakeTimers();

    // Always return RUNNING so the loop never terminates naturally
    vi.mocked(webApi.retrieveRecord).mockResolvedValue({
      [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.RUNNING,
      [PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]: null,
      [PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]: null,
      [PUBLISH_JOB_ATTRS.ERROR_DETAILS]: null,
    });

    // Attach rejection handler immediately to prevent unhandled rejection warning
    const assertionPromise = expect(service.pollUntilComplete(TEST_JOB_ID)).rejects.toSatisfy(
      (err: unknown) => err instanceof PublishTimeoutError && err.message.includes(TEST_JOB_ID)
    );

    // Advance past the 120s timeout to trigger the error
    await vi.advanceTimersByTimeAsync(130_000);

    await assertionPromise;
  });
});
