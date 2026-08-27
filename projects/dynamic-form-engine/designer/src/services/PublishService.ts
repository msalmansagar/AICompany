import type { IWebApiAdapter } from './IWebApiAdapter';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  PUBLISH_JOB_ATTRS,
  PUBLISH_JOB_STATUS,
  PUBLISH_JOB_TRIGGER_REASON,
  type PublishJobStatusValue,
} from '@/constants/attributeNames';
import { withRetry } from './crmRetry';

export const PUBLISH_ACTION_NAME = 'qdb_PublishForm';

/**
 * The exact input set qdb_PublishForm declares.
 *
 * Dataverse rejects the whole request with HTTP 400 when it carries a parameter the Custom
 * API does not declare, so nothing may be added here that has not also been declared on the
 * API. The form definition id and the trigger reason are deliberately absent: the plugin
 * resolves the form from FormCode, and both values are already recorded on the job row.
 */
/**
 * The major version as the whole number qdb_target_version holds.
 *
 * Versions are carried around the designer as "2.0" strings, but the column is an Integer
 * and Dataverse rejects the entire create when handed "2.0" — it will coerce "2", not a
 * decimal. This is the boundary where the string vocabulary meets the column's type.
 */
function toTargetVersionNumber(version: string): number {
  const major = parseInt(version, 10);
  if (Number.isNaN(major)) {
    throw new Error(`Cannot publish: '${version}' is not a version number.`);
  }
  return major;
}

function buildPublishActionParameters(
  formCode: string,
  targetVersion: number,
  publishJobId: string,
): Record<string, string | number> {
  return { FormCode: formCode, TargetVersion: targetVersion, PublishJobId: publishJobId };
}

// Terminal statuses indicate the job has reached a final state — done or failed.
const TERMINAL_STATUSES: ReadonlySet<PublishJobStatusValue> = new Set([
  PUBLISH_JOB_STATUS.COMPLETED,
  PUBLISH_JOB_STATUS.PARTIALLY_COMPLETED,
  PUBLISH_JOB_STATUS.FAILED,
]);

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

export interface PublishJobStatus {
  jobId: string;
  status: PublishJobStatusValue;
  languagesSucceeded: string | null;
  languagesFailed: string | null;
  errorDetails: string | null;
}

export interface PublishParams {
  formDefinitionId: string;
  formCode: string;
  targetVersion: string;
}

export class PublishTimeoutError extends Error {
  constructor(jobId: string) {
    super(`Publish job ${jobId} did not complete within ${POLL_TIMEOUT_MS / 1000}s`);
    this.name = 'PublishTimeoutError';
  }
}

export class PublishService {
  constructor(private readonly webApi: IWebApiAdapter) {}

  /**
   * Creates a qdb_publish_job record and fires the qdb_PublishForm CRM action.
   * Returns the new job ID immediately — caller polls getJobStatus() for progress.
   */
  async publish(params: PublishParams): Promise<string> {
    const { formDefinitionId, formCode, targetVersion } = params;

    const jobResult = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.PUBLISH_JOB, {
          [`${PUBLISH_JOB_ATTRS.FORM_DEFINITION_ID_NAV}@odata.bind`]: `/qdb_form_definitions(${formDefinitionId})`,
          [PUBLISH_JOB_ATTRS.FORM_CODE]: formCode,
          [PUBLISH_JOB_ATTRS.TARGET_VERSION]: toTargetVersionNumber(targetVersion),
          [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.QUEUED,
          [PUBLISH_JOB_ATTRS.TRIGGER_REASON]: PUBLISH_JOB_TRIGGER_REASON.PUBLISH,
        }),
      'createPublishJob'
    );

    const jobId = jobResult.id;

    await withRetry(
      () =>
        this.webApi.executeAction(
          PUBLISH_ACTION_NAME,
          buildPublishActionParameters(formCode, toTargetVersionNumber(targetVersion), jobId),
        ),
      'executePublishAction'
    );

    return jobId;
  }

  /**
   * Triggers an async cache regeneration job for a style change (SC-03).
   * Creates a qdb_publish_job with STYLE_CHANGE trigger reason and fires the action.
   * Returns the job ID — the 30s cache lag target is a backend concern; caller does not poll.
   */
  async triggerStyleChangeCache(params: PublishParams): Promise<string> {
    const { formDefinitionId, formCode, targetVersion } = params;

    const jobResult = await withRetry(
      () =>
        this.webApi.createRecord(ENTITY_NAMES.PUBLISH_JOB, {
          [`${PUBLISH_JOB_ATTRS.FORM_DEFINITION_ID_NAV}@odata.bind`]: `/qdb_form_definitions(${formDefinitionId})`,
          [PUBLISH_JOB_ATTRS.FORM_CODE]: formCode,
          [PUBLISH_JOB_ATTRS.TARGET_VERSION]: toTargetVersionNumber(targetVersion),
          [PUBLISH_JOB_ATTRS.STATUS]: PUBLISH_JOB_STATUS.QUEUED,
          [PUBLISH_JOB_ATTRS.TRIGGER_REASON]: PUBLISH_JOB_TRIGGER_REASON.STYLE_CHANGE,
        }),
      'createStyleChangeCacheJob',
    );

    const jobId = jobResult.id;

    await withRetry(
      () =>
        this.webApi.executeAction(
          PUBLISH_ACTION_NAME,
          buildPublishActionParameters(formCode, toTargetVersionNumber(targetVersion), jobId),
        ),
      'executeStyleChangeCacheAction',
    );

    return jobId;
  }

  async getJobStatus(jobId: string): Promise<PublishJobStatus> {
    const select = [
      PUBLISH_JOB_ATTRS.ID,
      PUBLISH_JOB_ATTRS.STATUS,
      PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED,
      PUBLISH_JOB_ATTRS.LANGUAGES_FAILED,
      PUBLISH_JOB_ATTRS.ERROR_DETAILS,
    ].join(',');

    const record = await withRetry(
      () =>
        this.webApi.retrieveRecord(
          ENTITY_NAMES.PUBLISH_JOB,
          jobId,
          `?$select=${select}`
        ),
      'getPublishJobStatus'
    );

    return {
      jobId,
      status: (record[PUBLISH_JOB_ATTRS.STATUS] as PublishJobStatusValue) ?? PUBLISH_JOB_STATUS.QUEUED,
      languagesSucceeded: record[PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED]
        ? String(record[PUBLISH_JOB_ATTRS.LANGUAGES_SUCCEEDED])
        : null,
      languagesFailed: record[PUBLISH_JOB_ATTRS.LANGUAGES_FAILED]
        ? String(record[PUBLISH_JOB_ATTRS.LANGUAGES_FAILED])
        : null,
      errorDetails: record[PUBLISH_JOB_ATTRS.ERROR_DETAILS]
        ? String(record[PUBLISH_JOB_ATTRS.ERROR_DETAILS])
        : null,
    };
  }

  /**
   * Polls getJobStatus every POLL_INTERVAL_MS until the job reaches a terminal state
   * or POLL_TIMEOUT_MS elapses. Caller awaits the returned Promise and receives the
   * final status.
   */
  async pollUntilComplete(jobId: string): Promise<PublishJobStatus> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const status = await this.getJobStatus(jobId);
      if (TERMINAL_STATUSES.has(status.status)) {
        return status;
      }
      await this.waitMs(POLL_INTERVAL_MS);
    }

    throw new PublishTimeoutError(jobId);
  }

  private waitMs(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
