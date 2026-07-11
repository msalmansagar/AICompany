import { describe, it, expect, beforeEach } from 'vitest';
import { useConcurrencyStore } from '@/state/concurrencyStore';
import { usePresenceStore } from '@/state/presenceStore';
import { useDesignerStore } from '@/state/designerStore';
import type { ActiveEditor } from '@/services/presence/EditLockService';
import type { ConcurrencyConflictState } from '@/state/concurrencyStore';

function makeConflict(overrides: Partial<ConcurrencyConflictState> = {}): ConcurrencyConflictState {
  return {
    entityLogicalName: 'qdb_form_definition',
    recordId: 'rec-abc',
    localEtag: 'W/"5"',
    conflictTimestamp: new Date('2026-07-10T10:00:00Z'),
    ...overrides,
  };
}

function resetStores(): void {
  useConcurrencyStore.setState({ recordEtags: {}, conflictState: null });
  usePresenceStore.setState({ presenceEditors: [] });
}

describe('useConcurrencyStore', () => {
  beforeEach(() => {
    resetStores();
  });

  it('setRecordEtag_storesEtag_forGivenId', () => {
    useConcurrencyStore.getState().setRecordEtag('record-123', 'W/"1"');
    expect(useConcurrencyStore.getState().recordEtags['record-123']).toBe('W/"1"');
  });

  it('clearRecordEtag_removesEtag_forGivenId', () => {
    useConcurrencyStore.setState({ recordEtags: { 'record-123': 'W/"1"' } });
    useConcurrencyStore.getState().clearRecordEtag('record-123');
    expect(useConcurrencyStore.getState().recordEtags['record-123']).toBeUndefined();
  });

  it('setConflictState_storesConflict_andClearWithNull', () => {
    const conflict = makeConflict();
    useConcurrencyStore.getState().setConflictState(conflict);
    expect(useConcurrencyStore.getState().conflictState).toEqual(conflict);

    useConcurrencyStore.getState().setConflictState(null);
    expect(useConcurrencyStore.getState().conflictState).toBeNull();
  });

  it('resetConcurrencyState_clearsEtagsAndConflict', () => {
    useConcurrencyStore.setState({
      recordEtags: { 'rec-1': 'W/"1"' },
      conflictState: makeConflict(),
    });

    useConcurrencyStore.getState().resetConcurrencyState();

    expect(useConcurrencyStore.getState().recordEtags).toEqual({});
    expect(useConcurrencyStore.getState().conflictState).toBeNull();
  });
});

describe('usePresenceStore', () => {
  beforeEach(() => {
    resetStores();
  });

  it('setPresenceEditors_updatesEditorsList', () => {
    const editors: ActiveEditor[] = [
      { userId: 'u1', displayName: 'Alice', openedAt: new Date() },
      { userId: 'u2', displayName: 'Bob',   openedAt: new Date() },
    ];

    usePresenceStore.getState().setPresenceEditors(editors);
    expect(usePresenceStore.getState().presenceEditors).toHaveLength(2);
    expect(usePresenceStore.getState().presenceEditors[0].displayName).toBe('Alice');
  });

  it('setPresenceEditors_replacesExistingList', () => {
    usePresenceStore.getState().setPresenceEditors([
      { userId: 'u1', displayName: 'Alice', openedAt: new Date() },
    ]);
    usePresenceStore.getState().setPresenceEditors([]);
    expect(usePresenceStore.getState().presenceEditors).toHaveLength(0);
  });
});

describe('designerStore — concurrency + presence state reset', () => {
  beforeEach(() => {
    resetStores();
  });

  it('resetDesigner_clearsConflictState', () => {
    useConcurrencyStore.setState({ conflictState: makeConflict() });

    useDesignerStore.getState().resetDesigner();

    expect(useConcurrencyStore.getState().conflictState).toBeNull();
    expect(useConcurrencyStore.getState().recordEtags).toEqual({});
    expect(usePresenceStore.getState().presenceEditors).toHaveLength(0);
  });

  it('loadForm_clearsConflictState', () => {
    useConcurrencyStore.setState({ conflictState: makeConflict() });
    usePresenceStore.setState({
      presenceEditors: [{ userId: 'u1', displayName: 'Alice', openedAt: new Date() }],
    });

    useDesignerStore.getState().loadForm({
      form: {
        id: 'form-1', name: 'Test', code: 'T', description: '', entityLogicalName: '',
        status: 'draft', currentVersion: '1', themeId: null, allowSaveDraft: true,
        draftExpiryDays: null, showSummaryStep: false, summaryMode: null,
        showProgressBar: false, powerAutomateFlowId: null, confirmationMessage: null,
        confirmationRecordRefAttribute: null, accessGroupId: null,
        createdBy: '', createdOn: new Date(), modifiedBy: '', modifiedOn: new Date(),
      },
      tabs: [],
      sections: [],
      fields: [],
      validationRules: [],
      businessRules: [],
      designPayload: useDesignerStore.getState().designPayload,
    });

    expect(useConcurrencyStore.getState().conflictState).toBeNull();
    expect(useConcurrencyStore.getState().recordEtags).toEqual({});
    expect(usePresenceStore.getState().presenceEditors).toHaveLength(0);
  });
});
