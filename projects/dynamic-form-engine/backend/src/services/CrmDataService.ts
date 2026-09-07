import type { DraftSubmission } from '@qdb/shared';
import { CrmBaseService } from './CrmBaseService.js';
import { EntitySetNameResolver } from './EntitySetNameResolver.js';
import { NotFoundError } from '../utils/errors.js';
import type { CrmAuthService } from './CrmAuthService.js';

interface ODataCollection<T> {
  value: T[];
}

interface RawDraftRecord {
  qdb_form_submission_draft_id: string;
  qdb_form_definition_id: string;
  qdb_form_code: string;
  qdb_user_id: string;
  qdb_user_display_name: string;
  qdb_form_data_json: string;
  qdb_current_tab_index: number;
  qdb_saved_at: string;
  qdb_expires_at: string;
}

export class CrmDataService extends CrmBaseService {
  private readonly entitySetNames: EntitySetNameResolver;

  constructor(authService: CrmAuthService) {
    super(authService);
    this.entitySetNames = new EntitySetNameResolver((path) => this.crmFetch(path));
  }

  async getRecord(
    entityLogicalName: string,
    recordId: string,
    select?: string[],
  ): Promise<Record<string, unknown>> {
    const query = select ? `?$select=${select.join(',')}` : '';
    const record = await this.crmFetch<Record<string, unknown>>(
      `/${await this.entitySetNames.resolve(entityLogicalName)}(${recordId})${query}`,
    );

    if (!record) {
      throw new NotFoundError(`${entityLogicalName}:${recordId}`);
    }

    return record;
  }

  async getDraft(
    formDefinitionId: string,
    userId: string,
  ): Promise<DraftSubmission | null> {
    const now = new Date().toISOString();
    const filter = [
      `qdb_form_definition_id eq '${formDefinitionId}'`,
      `qdb_user_id eq '${userId}'`,
      `statecode eq 0`,
      `qdb_expires_at gt ${now}`, // real-time expiry check
    ].join(' and ');

    const response = await this.crmFetch<ODataCollection<RawDraftRecord>>(
      `/qdb_form_submission_drafts?$filter=${encodeURIComponent(filter)}&$top=1&$orderby=qdb_saved_at desc`,
    );

    const raw = response.value[0];
    if (!raw) return null;

    return this.mapToDraft(raw);
  }

  async saveDraft(draft: DraftSubmission): Promise<DraftSubmission> {
    const payload = {
      qdb_form_definition_id: draft.formDefinitionId,
      qdb_form_code: draft.formCode,
      qdb_user_id: draft.userId,
      qdb_user_display_name: draft.userDisplayName,
      qdb_form_data_json: JSON.stringify(draft.formData),
      qdb_current_tab_index: draft.currentTabIndex,
      qdb_saved_at: new Date().toISOString(),
      qdb_expires_at: draft.expiresAt,
    };

    if (draft.id) {
      await this.crmFetch(`/qdb_form_submission_drafts(${draft.id})`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return { ...draft, savedAt: payload.qdb_saved_at };
    }

    const response = await this.crmFetch<RawDraftRecord>('/qdb_form_submission_drafts', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { Prefer: 'return=representation' },
    });

    return this.mapToDraft(response);
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.crmFetch(`/qdb_form_submission_drafts(${draftId})`, { method: 'DELETE' });
  }

  private mapToDraft(raw: RawDraftRecord): DraftSubmission {
    return {
      id: raw.qdb_form_submission_draft_id,
      formDefinitionId: raw.qdb_form_definition_id,
      formCode: raw.qdb_form_code,
      userId: raw.qdb_user_id,
      userDisplayName: raw.qdb_user_display_name,
      formData: JSON.parse(raw.qdb_form_data_json ?? '{}') as Record<string, unknown>,
      currentTabIndex: raw.qdb_current_tab_index ?? 0,
      savedAt: raw.qdb_saved_at,
      expiresAt: raw.qdb_expires_at,
    };
  }
}
