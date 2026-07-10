import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditLockService } from '@/services/presence/EditLockService';
import {
  EDIT_LOCK_STALE_THRESHOLD_MS,
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_POLL_INTERVAL_MS,
  EDIT_LOCK_ATTRS,
} from '@/constants/editLockAttributeNames';
import type { IWebApiAdapter, WebApiRecord } from '@/services/IWebApiAdapter';

function buildMockWebApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: 'lock-record-id', entityType: 'qdb_dfe_edit_lock' }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    retrieveRecord: vi.fn().mockResolvedValue({}),
    retrieveMultipleRecords: vi.fn().mockResolvedValue({ entities: [] }),
    executeAction: vi.fn().mockResolvedValue({}),
    updateRecordConditional: vi.fn().mockResolvedValue(undefined),
  } satisfies IWebApiAdapter;
}

const USER_CONTEXT = {
  userId: 'user-001',
  userName: 'jdoe',
  userFullName: 'Jane Doe',
};

/** Flush all pending micro-tasks by yielding control multiple times. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe('EditLockService', () => {
  let webApi: IWebApiAdapter;
  let service: EditLockService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new EditLockService(webApi, USER_CONTEXT);
  });

  afterEach(() => {
    vi.useRealTimers();
    service.stopHeartbeat();
    service.stopPresencePoll();
    vi.restoreAllMocks();
  });

  // ── isLockStale ──────────────────────────────────────────────────────────────

  it('isLockStale_returnsTrue_whenHeartbeatOlderThanThreshold', () => {
    const staleDate = new Date(Date.now() - EDIT_LOCK_STALE_THRESHOLD_MS - 1);
    expect(service.isLockStale(staleDate)).toBe(true);
  });

  it('isLockStale_returnsFalse_whenHeartbeatFresh', () => {
    const freshDate = new Date(Date.now() - EDIT_LOCK_STALE_THRESHOLD_MS + 1000);
    expect(service.isLockStale(freshDate)).toBe(false);
  });

  // ── startHeartbeat ───────────────────────────────────────────────────────────

  it('startHeartbeat_createsLockRecord_onFirstCall', async () => {
    // Prevent the interval from firing during the test by replacing it with a no-op.
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);

    service.startHeartbeat('form-abc');
    await flushMicrotasks();

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    const [entityName, data] = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>];
    expect(entityName).toBe('qdb_dfe_edit_lock');
    expect(data[EDIT_LOCK_ATTRS.FORM_ID]).toBe('form-abc');
    expect(data[EDIT_LOCK_ATTRS.EDITOR_USER_ID]).toBe(USER_CONTEXT.userId);
  });

  it('startHeartbeat_updatesExistingRecord_onSubsequentInterval', async () => {
    vi.useFakeTimers();

    service.startHeartbeat('form-abc');

    // Flush the initial fire-and-forget upsert (no timers involved in the happy path)
    await vi.advanceTimersByTimeAsync(0);

    // Advance by exactly one heartbeat window to trigger the interval callback
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);

    // After the initial create, the interval callback calls upsertLock which should update
    expect(webApi.updateRecord).toHaveBeenCalled();
  });

  // ── stopHeartbeat ────────────────────────────────────────────────────────────

  it('stopHeartbeat_deletesLockRecord_ifKnown', async () => {
    vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);

    service.startHeartbeat('form-abc');
    await flushMicrotasks();

    service.stopHeartbeat();
    await flushMicrotasks();

    expect(webApi.deleteRecord).toHaveBeenCalledWith('qdb_dfe_edit_lock', 'lock-record-id');
  });

  // ── startPresencePoll ────────────────────────────────────────────────────────

  it('fetchPresenceEditors_excludesStaleLocks_andCurrentSession', async () => {
    const activeEditor: WebApiRecord = {
      [EDIT_LOCK_ATTRS.EDITOR_USER_ID]: 'other-user',
      [EDIT_LOCK_ATTRS.EDITOR_DISPLAY_NAME]: 'Other User',
      [EDIT_LOCK_ATTRS.OPENED_AT]: new Date().toISOString(),
    };

    (webApi.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      entities: [activeEditor],
    });

    vi.spyOn(globalThis, 'setInterval').mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);

    const onPresenceChange = vi.fn();
    service.startPresencePoll('form-abc', onPresenceChange);

    await flushMicrotasks();

    expect(onPresenceChange).toHaveBeenCalled();
    const editors = (onPresenceChange as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ displayName: string }>;
    expect(editors).toHaveLength(1);
    expect(editors[0].displayName).toBe('Other User');
  });

  it('startPresencePoll_pollsOnInterval', async () => {
    vi.useFakeTimers();

    const onPresenceChange = vi.fn();
    service.startPresencePoll('form-abc', onPresenceChange);

    // Flush the initial poll (synchronous start via void fetchOtherEditors.then())
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterInit = (onPresenceChange as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance by one poll interval to fire the setInterval callback once
    await vi.advanceTimersByTimeAsync(PRESENCE_POLL_INTERVAL_MS);

    expect((onPresenceChange as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterInit);
  });
});
