import type { IWebApiAdapter } from '../IWebApiAdapter';
import type { CrmUserContext } from '../CrmContextService';
import { ENTITY_NAMES } from '@/constants/entityNames';
import {
  EDIT_LOCK_ATTRS,
  EDIT_LOCK_STALE_THRESHOLD_MS,
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_POLL_INTERVAL_MS,
} from '@/constants/editLockAttributeNames';
import { withRetry } from '../crmRetry';

export interface ActiveEditor {
  userId: string;
  displayName: string;
  openedAt: Date;
}

/**
 * Manages qdb_dfe_edit_lock records for the current CRM session.
 *
 * Nightly cleanup (Power Automate — NOT this service):
 *   A scheduled cloud flow runs daily at 02:00 UTC and deletes all
 *   qdb_dfe_edit_lock records where qdb_last_heartbeat is older than 24 hours.
 *   This handles orphaned locks left by browser crashes or session timeouts.
 *   The flow uses the Dataverse "List rows" + "Delete a row" action pattern.
 *   Do NOT handle this cleanup here — it is an operational concern, not app code.
 */
export class EditLockService {
  private readonly sessionId: string;
  private lockRecordId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly webApi: IWebApiAdapter,
    private readonly userContext: CrmUserContext,
  ) {
    this.sessionId = crypto.randomUUID();
  }

  isLockStale(lastHeartbeat: Date): boolean {
    return Date.now() - lastHeartbeat.getTime() > EDIT_LOCK_STALE_THRESHOLD_MS;
  }

  startHeartbeat(formId: string): void {
    void this.upsertLock(formId);
    this.heartbeatTimer = setInterval(
      () => void this.upsertLock(formId),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.lockRecordId !== null) {
      const id = this.lockRecordId;
      this.lockRecordId = null;
      void withRetry(
        () => this.webApi.deleteRecord(ENTITY_NAMES.EDIT_LOCK, id),
        'deleteEditLock',
      ).catch(() => {
        // Best-effort — stale locks are cleaned up by the nightly Power Automate flow.
      });
    }
  }

  startPresencePoll(
    formId: string,
    onPresenceChange: (editors: ActiveEditor[]) => void,
  ): void {
    const poll = (): void => void this.fetchOtherEditors(formId).then(onPresenceChange);
    poll();
    this.pollTimer = setInterval(poll, PRESENCE_POLL_INTERVAL_MS);
  }

  stopPresencePoll(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async upsertLock(formId: string): Promise<void> {
    const now = new Date().toISOString();
    const data: Record<string, unknown> = {
      [EDIT_LOCK_ATTRS.FORM_ID]:             formId,
      [EDIT_LOCK_ATTRS.EDITOR_USER_ID]:      this.userContext.userId,
      [EDIT_LOCK_ATTRS.EDITOR_DISPLAY_NAME]: this.userContext.userFullName,
      [EDIT_LOCK_ATTRS.SESSION_ID]:          this.sessionId,
      [EDIT_LOCK_ATTRS.LAST_HEARTBEAT]:      now,
    };

    if (this.lockRecordId !== null) {
      await withRetry(
        () => this.webApi.updateRecord(ENTITY_NAMES.EDIT_LOCK, this.lockRecordId!, data),
        'updateEditLock',
      );
    } else {
      data[EDIT_LOCK_ATTRS.OPENED_AT] = now;
      const existing = await this.findExistingLock(formId);
      if (existing !== null) {
        this.lockRecordId = existing;
        await withRetry(
          () => this.webApi.updateRecord(ENTITY_NAMES.EDIT_LOCK, existing, data),
          'updateEditLock',
        );
      } else {
        const result = await withRetry(
          () => this.webApi.createRecord(ENTITY_NAMES.EDIT_LOCK, data),
          'createEditLock',
        );
        this.lockRecordId = result.id;
      }
    }
  }

  private async findExistingLock(formId: string): Promise<string | null> {
    const filter = `$filter=${EDIT_LOCK_ATTRS.SESSION_ID} eq '${this.sessionId}' and ${EDIT_LOCK_ATTRS.FORM_ID} eq '${formId}'`;
    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(ENTITY_NAMES.EDIT_LOCK, `?$select=${EDIT_LOCK_ATTRS.ID}&${filter}`),
      'findEditLock',
    );
    const first = result.entities[0];
    return first ? String(first[EDIT_LOCK_ATTRS.ID] ?? '') : null;
  }

  private async fetchOtherEditors(formId: string): Promise<ActiveEditor[]> {
    const staleCutoff = new Date(Date.now() - EDIT_LOCK_STALE_THRESHOLD_MS).toISOString();
    const filter = [
      `${EDIT_LOCK_ATTRS.FORM_ID} eq '${formId}'`,
      `${EDIT_LOCK_ATTRS.SESSION_ID} ne '${this.sessionId}'`,
      `${EDIT_LOCK_ATTRS.LAST_HEARTBEAT} ge ${staleCutoff}`,
    ].join(' and ');

    const result = await withRetry(
      () => this.webApi.retrieveMultipleRecords(
        ENTITY_NAMES.EDIT_LOCK,
        `?$select=${EDIT_LOCK_ATTRS.EDITOR_USER_ID},${EDIT_LOCK_ATTRS.EDITOR_DISPLAY_NAME},${EDIT_LOCK_ATTRS.OPENED_AT}&$filter=${filter}`,
      ),
      'fetchPresenceEditors',
    );

    return result.entities.map(record => ({
      userId:      String(record[EDIT_LOCK_ATTRS.EDITOR_USER_ID] ?? ''),
      displayName: String(record[EDIT_LOCK_ATTRS.EDITOR_DISPLAY_NAME] ?? 'Unknown'),
      openedAt:    new Date(String(record[EDIT_LOCK_ATTRS.OPENED_AT] ?? '')),
    }));
  }
}
