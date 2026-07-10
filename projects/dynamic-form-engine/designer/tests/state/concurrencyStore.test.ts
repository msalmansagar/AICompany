import { describe, it, expect, beforeEach } from 'vitest';
import { useDesignerStore } from '@/state/designerStore';
import type { ActiveEditor } from '@/services/presence/EditLockService';

function resetStore(): void {
  useDesignerStore.setState({
    recordEtags: {},
    conflictState: null,
    presenceEditors: [],
  });
}

describe('designerStore — concurrency slice', () => {
  beforeEach(() => {
    resetStore();
  });

  it('setRecordEtag_storesEtag_forGivenId', () => {
    const { setRecordEtag } = useDesignerStore.getState();
    setRecordEtag('record-123', 'W/"1"');

    const { recordEtags } = useDesignerStore.getState();
    expect(recordEtags['record-123']).toBe('W/"1"');
  });

  it('clearRecordEtag_removesEtag_forGivenId', () => {
    useDesignerStore.setState({ recordEtags: { 'record-123': 'W/"1"' } });

    const { clearRecordEtag } = useDesignerStore.getState();
    clearRecordEtag('record-123');

    const { recordEtags } = useDesignerStore.getState();
    expect(recordEtags['record-123']).toBeUndefined();
  });

  it('setConflictState_storesConflict_andClearWithNull', () => {
    const { setConflictState } = useDesignerStore.getState();

    const conflict = {
      entityLogicalName: 'qdb_form_definition',
      recordId: 'rec-abc',
      localEtag: 'W/"5"',
      conflictTimestamp: new Date('2026-07-10T10:00:00Z'),
    };

    setConflictState(conflict);
    expect(useDesignerStore.getState().conflictState).toEqual(conflict);

    setConflictState(null);
    expect(useDesignerStore.getState().conflictState).toBeNull();
  });

  it('setPresenceEditors_updatesEditorsList', () => {
    const { setPresenceEditors } = useDesignerStore.getState();

    const editors: ActiveEditor[] = [
      { userId: 'u1', displayName: 'Alice', openedAt: new Date() },
      { userId: 'u2', displayName: 'Bob',   openedAt: new Date() },
    ];

    setPresenceEditors(editors);
    expect(useDesignerStore.getState().presenceEditors).toHaveLength(2);
    expect(useDesignerStore.getState().presenceEditors[0].displayName).toBe('Alice');
  });

  it('setPresenceEditors_replacesExistingList', () => {
    const { setPresenceEditors } = useDesignerStore.getState();

    setPresenceEditors([{ userId: 'u1', displayName: 'Alice', openedAt: new Date() }]);
    setPresenceEditors([]);

    expect(useDesignerStore.getState().presenceEditors).toHaveLength(0);
  });
});
