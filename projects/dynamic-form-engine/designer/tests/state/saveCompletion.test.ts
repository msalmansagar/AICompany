/**
 * DFE-AUTOSAVE-001 — settling a finished save without losing edits made while it ran.
 */

import { describe, it, expect } from 'vitest';
import {
  auditSnapshotOfSave,
  findChangesMadeDuringSave,
  resolvePendingIds,
} from '@/state/saveCompletion';
import type { SavedSnapshot } from '@/state/saveCompletion';
import { useDesignerStore, DEFAULT_DESIGN_PAYLOAD } from '@/state/designerStore';
import type { DesignerState } from '@/state/designerStore';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';

function makeField(id: string, overrides: Partial<DesignerFieldModel> = {}): DesignerFieldModel {
  return { id, sectionId: 'tmp_section_1', label: 'Question', ...overrides } as DesignerFieldModel;
}

function makeSaved(overrides: Partial<SavedSnapshot> = {}): SavedSnapshot {
  return {
    form: null,
    tabs: {},
    sections: {},
    fields: {},
    validationRules: {},
    businessRules: {},
    designPayload: DEFAULT_DESIGN_PAYLOAD,
    newIds: [],
    dirtyIds: [],
    deletedIds: [],
    ...overrides,
  };
}

function makeCurrent(saved: SavedSnapshot, overrides: Partial<SavedSnapshot> = {}): DesignerState {
  return { ...useDesignerStore.getState(), ...saved, ...overrides };
}

describe('findChangesMadeDuringSave', () => {
  it('findChangesMadeDuringSave_deletionMadeDuringSave_staysPending', () => {
    const saved = makeSaved({ deletedIds: ['field-saved'] });

    const pending = findChangesMadeDuringSave(makeCurrent(saved, { deletedIds: ['field-saved', 'field-late'] }), saved);

    expect(pending.deletedIds).toEqual(['field-late']);
  });

  it('findChangesMadeDuringSave_unchangedDirtyRecord_isSettled', () => {
    const field = makeField('field-1');
    const saved = makeSaved({ fields: { 'field-1': field }, dirtyIds: ['field-1'] });

    const pending = findChangesMadeDuringSave(makeCurrent(saved), saved);

    expect(pending.dirtyIds).toEqual([]);
  });
});

describe('resolvePendingIds', () => {
  it('resolvePendingIds_tempAndRealIds_swapsOnlyTheTempOnes', () => {
    expect(resolvePendingIds(['tmp_field_1', 'field-2'], { tmp_field_1: 'real-1' })).toEqual(['real-1', 'field-2']);
  });
});

describe('auditSnapshotOfSave', () => {
  it('auditSnapshotOfSave_newFieldInNewSection_usesRealIds', () => {
    const saved = makeSaved({ fields: { tmp_field_1: makeField('tmp_field_1') } });

    const snapshot = auditSnapshotOfSave(saved, { tmp_field_1: 'real-field', tmp_section_1: 'real-section' });

    expect(snapshot.fields['real-field']).toMatchObject({ id: 'real-field', sectionId: 'real-section' });
  });
});
