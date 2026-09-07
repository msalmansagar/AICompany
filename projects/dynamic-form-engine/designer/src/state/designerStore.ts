import { create } from 'zustand';
import { produce, enablePatches } from 'immer';
import type {
  DesignerFormModel,
  DesignerTabModel,
  DesignerSectionModel,
  DesignerFieldModel,
} from './models/DesignerFormModel';
import type { DesignerValidationRule, DesignerBusinessRule } from './models/DesignerRuleModel';
import type {
  DesignPayload, ThemeDefinition, FormDesign, SectionDesign,
  FieldDesign, ButtonDesign, ButtonType, LayoutGrid,
} from '@qdb/shared';
import { useConcurrencyStore } from './concurrencyStore';
import { usePresenceStore } from './presenceStore';
import type { RuleCreationTarget } from '@/screens/ruleDefaults';

// Enable immer patch tracking once at module init so produceWithPatches() is
// available for E4 audit-capture at the save boundary (DFE-ENH-001 ENT-005).
enablePatches();

export type DesignerScreen =
  | 'form-list'
  | 'new-form-wizard'
  | 'designer'
  | 'theme-editor'
  | 'rule-config'
  | 'option-set-editor'
  | 'lookup-config'
  | 'preview'
  | 'publish-validation'
  | 'version-history'
  // Sprint 3+4
  | 'rule-template-editor'
  | 'field-label-editor'
  | 'access-policy-editor'
  | 'submission-mapping';

export type CanvasItemType = 'form' | 'tab' | 'section' | 'field';
export type PreviewBreakpoint = 'desktop' | 'tablet' | 'mobile';

/** Snapshot used for undo/redo — captures the mutable parts of the state */
interface DesignerStateSnapshot {
  tabs: Record<string, DesignerTabModel>;
  sections: Record<string, DesignerSectionModel>;
  fields: Record<string, DesignerFieldModel>;
  validationRules: Record<string, DesignerValidationRule>;
  businessRules: Record<string, DesignerBusinessRule>;
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;
  fieldOrder: Record<string, string[]>;
}

/**
 * The subset of form state that is audited at the field-level.
 * ENT-005: AuditPatchMapper receives patches over this shape, so the path roots
 * ('fields', 'validationRules', 'businessRules') must match the mapper's
 * PATH_ROOT_TO_EVENT_TYPE constant.
 */
export interface FormAuditableSnapshot {
  fields: Record<string, DesignerFieldModel>;
  validationRules: Record<string, DesignerValidationRule>;
  businessRules: Record<string, DesignerBusinessRule>;
}

export const DEFAULT_DESIGN_PAYLOAD: DesignPayload = {
  theme: {
    id: '',
    themeCode: 'DEFAULT',
    themeName: 'Default',
    primaryColor: '#0078d4',
    isDarkMode: false,
    isActive: true,
    _brand: 'ThemeDefinition',
  },
  formDesign: {
    id: '',
    layoutType: 'SingleColumn',
    labelPosition: 'Top',
    sectionStyle: 'Card',
    tabStyle: 'Tabs',
    buttonStyle: 'Primary',
    animationEnabled: false,
    alignment: 'Left',
    stickyActionBar: false,
    skeletonLoaderEnabled: false,
    isActive: true,
  },
  sectionDesigns: {},
  fieldDesigns: {},
  buttonDesigns: { Submit: undefined, SaveDraft: undefined, Cancel: undefined },
  layoutGrid: [],
};

/** Parameter object for loadForm — keeps the action within the 3-parameter limit. */
export interface LoadFormParams {
  form: DesignerFormModel;
  tabs: DesignerTabModel[];
  sections: DesignerSectionModel[];
  fields: DesignerFieldModel[];
  validationRules: DesignerValidationRule[];
  businessRules: DesignerBusinessRule[];
  designPayload: DesignPayload;
}

export interface DesignerState {
  // Navigation
  currentScreen: DesignerScreen;

  // Form model
  form: DesignerFormModel | null;
  tabs: Record<string, DesignerTabModel>;
  sections: Record<string, DesignerSectionModel>;
  fields: Record<string, DesignerFieldModel>;
  validationRules: Record<string, DesignerValidationRule>;
  businessRules: Record<string, DesignerBusinessRule>;
  designPayload: DesignPayload;

  // Ordering
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;
  fieldOrder: Record<string, string[]>;

  // Dirty tracking
  dirtyIds: string[];
  newIds: string[];
  deletedIds: string[];
  // Maps deleted record ID → entity type so FormSaveService can issue the correct delete call
  // even after the record is removed from the tabs/sections/fields maps.
  deletedEntityTypes: Record<string, 'tab' | 'section' | 'field'>;

  // Undo/redo — max 50 entries
  undoStack: DesignerStateSnapshot[];
  redoStack: DesignerStateSnapshot[];

  // UI state
  selectedId: string | null;
  selectedType: CanvasItemType | null;
  /**
   * The element a maker asked for a business rule from, handed to the rule editor and
   * consumed once. A rule can target a tab as well as a field, and the editor cannot infer
   * which element the maker meant.
   */
  pendingRuleCreationTarget: RuleCreationTarget | null;
  activeCanvasTabId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: Date | null;
  /**
   * Snapshot of the auditable form state at the last successful save.
   * Captured by loadForm (treating load as the initial "saved" baseline) and
   * updated by markSaved after each successful PATCH.
   * Used by the E4 audit pipeline: produceWithPatches(lastSavedAuditSnapshot, …)
   * computes the delta that AuditPatchMapper converts into audit rows.
   */
  lastSavedAuditSnapshot: FormAuditableSnapshot | null;
  previewMode: PreviewBreakpoint | null;

  // Actions
  navigateTo: (screen: DesignerScreen) => void;
  requestRuleForTab: (tabId: string) => void;
  clearPendingRuleCreationTarget: () => void;
  loadForm: (params: LoadFormParams) => void;
  resetDesigner: () => void;
  selectItem: (id: string, type: CanvasItemType) => void;
  clearSelection: () => void;

  // Form mutations
  updateForm: (patch: Partial<DesignerFormModel>) => void;

  // Tab mutations
  addTab: (tab: DesignerTabModel) => void;
  updateTab: (id: string, patch: Partial<DesignerTabModel>) => void;
  deleteTab: (id: string) => void;
  reorderTabs: (newOrder: string[]) => void;

  // Section mutations
  addSection: (section: DesignerSectionModel) => void;
  updateSection: (id: string, patch: Partial<DesignerSectionModel>) => void;
  deleteSection: (id: string) => void;
  reorderSections: (tabId: string, newOrder: string[]) => void;

  // Field mutations
  addField: (field: DesignerFieldModel) => void;
  updateField: (id: string, patch: Partial<DesignerFieldModel>) => void;
  deleteField: (id: string) => void;
  reorderFields: (sectionId: string, newOrder: string[]) => void;
  moveField: (fieldId: string, targetSectionId: string, targetIndex: number) => void;

  // Design payload mutations (replaces legacy updateStyle)
  updateTheme: (update: Partial<ThemeDefinition>) => void;
  updateFormDesign: (update: Partial<FormDesign>) => void;
  updateSectionDesign: (sectionId: string, update: Partial<SectionDesign>) => void;
  updateFieldDesign: (fieldId: string, update: Partial<FieldDesign>) => void;
  updateButtonDesign: (buttonType: ButtonType, update: Partial<ButtonDesign>) => void;
  updateLayoutGrid: (fieldId: string, update: Partial<LayoutGrid>) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Save state
  markSaving: () => void;
  markSaved: (resolvedIds?: Record<string, string>, resolvedThemeId?: string | null) => void;
  markResolved: (resolvedIds: Record<string, string>) => void;
  markPublishing: () => void;
  markPublished: () => void;
  markDirty: (id: string, isNew?: boolean) => void;
  markDeleted: (id: string) => void;

  // Preview
  setPreviewMode: (mode: PreviewBreakpoint | null) => void;

  // Canvas tab tracking
  setActiveCanvasTab: (tabId: string) => void;
}

const MAX_UNDO_STACK_SIZE = 50;

// Pass 1: rename temp keys to server-assigned ids in the record maps and their order maps.
function renameRecordKeys(state: DesignerState, resolvedIds: Record<string, string>): void {
  for (const [tempId, realId] of Object.entries(resolvedIds)) {
    if (state.tabs[tempId]) {
      state.tabs[realId] = { ...state.tabs[tempId], id: realId };
      delete state.tabs[tempId];
      state.tabOrder = state.tabOrder.map(id => (id === tempId ? realId : id));
      if (state.sectionOrder[tempId]) {
        state.sectionOrder[realId] = state.sectionOrder[tempId];
        delete state.sectionOrder[tempId];
      }
    }
    if (state.sections[tempId]) {
      state.sections[realId] = { ...state.sections[tempId], id: realId };
      delete state.sections[tempId];
      if (state.fieldOrder[tempId]) {
        state.fieldOrder[realId] = state.fieldOrder[tempId];
        delete state.fieldOrder[tempId];
      }
    }
    if (state.fields[tempId]) {
      state.fields[realId] = { ...state.fields[tempId], id: realId };
      delete state.fields[tempId];
    }
  }
}

// Pass 2: repoint cross-references (order arrays + parent ids) from temp ids to real ids.
function updateCrossReferences(state: DesignerState, resolvedIds: Record<string, string>): void {
  for (const [tempId, realId] of Object.entries(resolvedIds)) {
    for (const tabId of Object.keys(state.sectionOrder)) {
      state.sectionOrder[tabId] = state.sectionOrder[tabId].map(id => (id === tempId ? realId : id));
    }
    for (const sectionId of Object.keys(state.fieldOrder)) {
      state.fieldOrder[sectionId] = state.fieldOrder[sectionId].map(id => (id === tempId ? realId : id));
    }
    for (const section of Object.values(state.sections)) {
      if (section.tabId === tempId) section.tabId = realId;
    }
    for (const field of Object.values(state.fields)) {
      if (field.sectionId === tempId) field.sectionId = realId;
    }
  }
}

function applyResolvedIds(state: DesignerState, resolvedIds: Record<string, string>): void {
  renameRecordKeys(state, resolvedIds);
  updateCrossReferences(state, resolvedIds);
  applyResolvedGridColumnIds(state, resolvedIds);
}

/**
 * Swaps a saved grid column's temporary id for the real one.
 *
 * Grid columns are nested inside their field rather than held in a record map of their own,
 * so the rename above does not reach them. Left carrying a tmp_ id, the next save does not
 * recognise the row it wrote a moment ago and deletes it before creating another.
 */
function applyResolvedGridColumnIds(
  state: DesignerState,
  resolvedIds: Record<string, string>,
): void {
  for (const [fieldId, field] of Object.entries(state.fields)) {
    if (!field.gridColumns?.length) continue;
    if (!field.gridColumns.some(column => resolvedIds[column.id])) continue;

    state.fields[fieldId] = {
      ...field,
      gridColumns: field.gridColumns.map(column => (
        resolvedIds[column.id] ? { ...column, id: resolvedIds[column.id] } : column
      )),
    };
  }
}

function captureSnapshot(state: DesignerState): DesignerStateSnapshot {
  return {
    tabs: { ...state.tabs },
    sections: { ...state.sections },
    fields: { ...state.fields },
    validationRules: { ...state.validationRules },
    businessRules: { ...state.businessRules },
    tabOrder: [...state.tabOrder],
    sectionOrder: Object.fromEntries(
      Object.entries(state.sectionOrder).map(([k, v]) => [k, [...v]])
    ),
    fieldOrder: Object.fromEntries(
      Object.entries(state.fieldOrder).map(([k, v]) => [k, [...v]])
    ),
  };
}

/** Captures the auditable subset of state for E4 change-delta computation. */
function captureAuditSnapshot(state: DesignerState): FormAuditableSnapshot {
  return {
    fields: { ...state.fields },
    validationRules: { ...state.validationRules },
    businessRules: { ...state.businessRules },
  };
}

function buildInitialOrdering(
  tabs: DesignerTabModel[],
  sections: DesignerSectionModel[],
  fields: DesignerFieldModel[]
): Pick<DesignerState, 'tabOrder' | 'sectionOrder' | 'fieldOrder'> {
  const tabOrder = [...tabs].sort((a, b) => a.sortOrder - b.sortOrder).map(t => t.id);

  const sectionOrder: Record<string, string[]> = {};
  for (const tab of tabs) {
    sectionOrder[tab.id] = sections
      .filter(s => s.tabId === tab.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(s => s.id);
  }

  const fieldOrder: Record<string, string[]> = {};
  for (const section of sections) {
    fieldOrder[section.id] = fields
      .filter(f => f.sectionId === section.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(f => f.id);
  }

  return { tabOrder, sectionOrder, fieldOrder };
}

export const useDesignerStore = create<DesignerState>((set, _get) => ({
  currentScreen: 'form-list',
  form: null,
  tabs: {},
  sections: {},
  fields: {},
  validationRules: {},
  businessRules: {},
  designPayload: DEFAULT_DESIGN_PAYLOAD,
  tabOrder: [],
  sectionOrder: {},
  fieldOrder: {},
  dirtyIds: [],
  newIds: [],
  deletedIds: [],
  deletedEntityTypes: {},
  undoStack: [],
  redoStack: [],
  selectedId: null,
  selectedType: null,
  pendingRuleCreationTarget: null,
  activeCanvasTabId: null,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null,
  lastSavedAuditSnapshot: null,
  previewMode: null,

  navigateTo: (screen) => set({ currentScreen: screen }),

  requestRuleForTab: (tabId) =>
    set({ pendingRuleCreationTarget: { type: 'tab', id: tabId }, currentScreen: 'rule-config' }),

  clearPendingRuleCreationTarget: () => set({ pendingRuleCreationTarget: null }),

  loadForm: ({ form, tabs, sections, fields, validationRules, businessRules, designPayload }) => {
    // Reset concurrency and presence state whenever a new form is loaded so
    // stale conflict dialogs and ghost editor indicators cannot leak across forms.
    useConcurrencyStore.getState().resetConcurrencyState();
    usePresenceStore.getState().resetPresenceState();

    const tabMap = Object.fromEntries(tabs.map(t => [t.id, t]));
    const sectionMap = Object.fromEntries(sections.map(s => [s.id, s]));
    const fieldMap = Object.fromEntries(fields.map(f => [f.id, f]));
    const validationRuleMap = Object.fromEntries(validationRules.map(r => [r.id, r]));
    const businessRuleMap = Object.fromEntries(businessRules.map(r => [r.id, r]));
    const ordering = buildInitialOrdering(tabs, sections, fields);

    // The loaded state is the initial audit baseline — treat it as "last saved".
    const initialAuditSnapshot: FormAuditableSnapshot = {
      fields: fieldMap,
      validationRules: validationRuleMap,
      businessRules: businessRuleMap,
    };

    set({
      form,
      tabs: tabMap,
      sections: sectionMap,
      fields: fieldMap,
      validationRules: validationRuleMap,
      businessRules: businessRuleMap,
      designPayload,
      ...ordering,
      dirtyIds: [],
      newIds: [],
      deletedIds: [],
      deletedEntityTypes: {},
      undoStack: [],
      redoStack: [],
      selectedId: null,
      selectedType: null,
      isDirty: false,
      lastSavedAuditSnapshot: initialAuditSnapshot,
      currentScreen: 'designer',
    });
  },

  resetDesigner: () => {
    // Clear concurrency and presence alongside the designer form state.
    useConcurrencyStore.getState().resetConcurrencyState();
    usePresenceStore.getState().resetPresenceState();

    set({
      form: null,
      tabs: {},
      sections: {},
      fields: {},
      validationRules: {},
      businessRules: {},
      designPayload: DEFAULT_DESIGN_PAYLOAD,
      tabOrder: [],
      sectionOrder: {},
      fieldOrder: {},
      dirtyIds: [],
      newIds: [],
      deletedIds: [],
      deletedEntityTypes: {},
      undoStack: [],
      redoStack: [],
      selectedId: null,
      selectedType: null,
      isDirty: false,
      currentScreen: 'form-list',
    });
  },

  selectItem: (id, type) => set({ selectedId: id, selectedType: type }),
  clearSelection: () => set({ selectedId: null, selectedType: null }),

  updateForm: (patch) =>
    set(
      produce((state: DesignerState) => {
        if (!state.form) return;
        Object.assign(state.form, patch);
        state.isDirty = true;
        if (state.form.id && !state.dirtyIds.includes(state.form.id)) {
          state.dirtyIds.push(state.form.id);
        }
      })
    ),

  addTab: (tab) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.tabs[tab.id] = tab;
        state.tabOrder.push(tab.id);
        state.sectionOrder[tab.id] = [];
        state.newIds.push(tab.id);
        state.dirtyIds.push(tab.id);
        state.isDirty = true;
      })
    ),

  updateTab: (id, patch) =>
    set(
      produce((state: DesignerState) => {
        if (!state.tabs[id]) return;
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        Object.assign(state.tabs[id], patch);
        if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
        state.isDirty = true;
      })
    ),

  deleteTab: (id) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        // Remove all sections and their fields first — record entity types before deletion
        const sectionIds = state.sectionOrder[id] ?? [];
        for (const sectionId of sectionIds) {
          const fieldIds = state.fieldOrder[sectionId] ?? [];
          for (const fieldId of fieldIds) {
            if (!fieldId.startsWith('tmp_')) state.deletedEntityTypes[fieldId] = 'field';
            delete state.fields[fieldId];
            state.deletedIds.push(fieldId);
          }
          delete state.fieldOrder[sectionId];
          if (!sectionId.startsWith('tmp_')) state.deletedEntityTypes[sectionId] = 'section';
          delete state.sections[sectionId];
          state.deletedIds.push(sectionId);
        }

        delete state.sectionOrder[id];
        if (!id.startsWith('tmp_')) state.deletedEntityTypes[id] = 'tab';
        delete state.tabs[id];
        state.tabOrder = state.tabOrder.filter(tid => tid !== id);
        state.deletedIds.push(id);
        state.isDirty = true;
      })
    ),

  reorderTabs: (newOrder) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.tabOrder = newOrder;
        newOrder.forEach((id, index) => {
          if (state.tabs[id]) {
            state.tabs[id].sortOrder = index;
            if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
          }
        });
        state.isDirty = true;
      })
    ),

  addSection: (section) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.sections[section.id] = section;
        if (!state.sectionOrder[section.tabId]) state.sectionOrder[section.tabId] = [];
        state.sectionOrder[section.tabId].push(section.id);
        state.fieldOrder[section.id] = [];
        state.newIds.push(section.id);
        state.dirtyIds.push(section.id);
        state.isDirty = true;
      })
    ),

  updateSection: (id, patch) =>
    set(
      produce((state: DesignerState) => {
        if (!state.sections[id]) return;
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        Object.assign(state.sections[id], patch);
        if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
        state.isDirty = true;
      })
    ),

  deleteSection: (id) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        const section = state.sections[id];
        if (!section) return;

        const fieldIds = state.fieldOrder[id] ?? [];
        for (const fieldId of fieldIds) {
          if (!fieldId.startsWith('tmp_')) state.deletedEntityTypes[fieldId] = 'field';
          delete state.fields[fieldId];
          state.deletedIds.push(fieldId);
        }
        delete state.fieldOrder[id];

        const tabId = section.tabId;
        state.sectionOrder[tabId] = (state.sectionOrder[tabId] ?? []).filter(sid => sid !== id);
        if (!id.startsWith('tmp_')) state.deletedEntityTypes[id] = 'section';
        delete state.sections[id];
        state.deletedIds.push(id);
        state.isDirty = true;
      })
    ),

  reorderSections: (tabId, newOrder) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.sectionOrder[tabId] = newOrder;
        newOrder.forEach((id, index) => {
          if (state.sections[id]) {
            state.sections[id].sortOrder = index;
            if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
          }
        });
        state.isDirty = true;
      })
    ),

  addField: (field) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.fields[field.id] = field;
        if (!state.fieldOrder[field.sectionId]) state.fieldOrder[field.sectionId] = [];
        state.fieldOrder[field.sectionId].push(field.id);
        state.newIds.push(field.id);
        state.dirtyIds.push(field.id);
        state.isDirty = true;
      })
    ),

  updateField: (id, patch) =>
    set(
      produce((state: DesignerState) => {
        if (!state.fields[id]) return;
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        Object.assign(state.fields[id], patch);
        if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
        state.isDirty = true;
      })
    ),

  deleteField: (id) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        const field = state.fields[id];
        if (!field) return;

        state.fieldOrder[field.sectionId] = (state.fieldOrder[field.sectionId] ?? []).filter(fid => fid !== id);
        if (!id.startsWith('tmp_')) state.deletedEntityTypes[id] = 'field';
        delete state.fields[id];
        state.deletedIds.push(id);
        state.isDirty = true;
      })
    ),

  reorderFields: (sectionId, newOrder) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        state.fieldOrder[sectionId] = newOrder;
        newOrder.forEach((id, index) => {
          if (state.fields[id]) {
            state.fields[id].sortOrder = index;
            if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
          }
        });
        state.isDirty = true;
      })
    ),

  moveField: (fieldId, targetSectionId, targetIndex) =>
    set(
      produce((state: DesignerState) => {
        const snapshot = captureSnapshot(state);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
        state.redoStack = [];

        const field = state.fields[fieldId];
        if (!field) return;

        // Remove from source section
        const sourceSectionId = field.sectionId;
        state.fieldOrder[sourceSectionId] = (state.fieldOrder[sourceSectionId] ?? []).filter(id => id !== fieldId);

        // Update field's sectionId
        field.sectionId = targetSectionId;

        // Insert at target index
        if (!state.fieldOrder[targetSectionId]) state.fieldOrder[targetSectionId] = [];
        state.fieldOrder[targetSectionId].splice(targetIndex, 0, fieldId);

        // Update sort orders
        state.fieldOrder[targetSectionId].forEach((id, index) => {
          if (state.fields[id]) {
            state.fields[id].sortOrder = index;
            if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
          }
        });

        if (!state.dirtyIds.includes(fieldId)) state.dirtyIds.push(fieldId);
        state.isDirty = true;
      })
    ),

  // ─── Design payload mutations ─────────────────────────────────────────────

  updateTheme: (update) =>
    set(
      produce((state: DesignerState) => {
        Object.assign(state.designPayload.theme, update);
        state.isDirty = true;
      })
    ),

  updateFormDesign: (update) =>
    set(
      produce((state: DesignerState) => {
        Object.assign(state.designPayload.formDesign, update);
        state.isDirty = true;
      })
    ),

  updateSectionDesign: (sectionId, update) =>
    set(
      produce((state: DesignerState) => {
        if (!state.designPayload.sectionDesigns[sectionId]) {
          state.designPayload.sectionDesigns[sectionId] = {
            id: '', sectionId, columnLayout: 1, cardStyle: 'Flat',
            collapsibleStyle: 'None', visibilityAnimation: 'None', isActive: true,
          };
        }
        Object.assign(state.designPayload.sectionDesigns[sectionId], update);
        state.isDirty = true;
      })
    ),

  updateFieldDesign: (fieldId, update) =>
    set(
      produce((state: DesignerState) => {
        if (!state.designPayload.fieldDesigns[fieldId]) {
          state.designPayload.fieldDesigns[fieldId] = {
            id: '', fieldId, inputStyle: 'Outlined', width: 'Full', isActive: true,
          };
        }
        Object.assign(state.designPayload.fieldDesigns[fieldId], update);
        state.isDirty = true;
      })
    ),

  updateButtonDesign: (buttonType, update) =>
    set(
      produce((state: DesignerState) => {
        const existing = state.designPayload.buttonDesigns[buttonType];
        if (existing) {
          Object.assign(existing, update);
        } else {
          state.designPayload.buttonDesigns[buttonType] = {
            id: '', formDefinitionId: state.form?.id ?? '',
            buttonType, size: 'Medium', alignment: 'Right',
            hoverEffect: 'None', loadingStyle: 'Spinner', isActive: true,
            ...update,
          } as ButtonDesign;
        }
        state.isDirty = true;
      })
    ),

  updateLayoutGrid: (fieldId, update) =>
    set(
      produce((state: DesignerState) => {
        const existing = state.designPayload.layoutGrid.find(g => g.fieldId === fieldId);
        if (existing) {
          Object.assign(existing, update);
        } else {
          state.designPayload.layoutGrid.push({
            id: '', formDesignId: state.designPayload.formDesign.id,
            fieldId, columnsTotal: 12, spanMobile: 12, spanTablet: 6, spanDesktop: 4,
            ...update,
          } as LayoutGrid);
        }
        state.isDirty = true;
      })
    ),

  undo: () =>
    set(
      produce((state: DesignerState) => {
        const snapshot = state.undoStack.pop();
        if (!snapshot) return;

        const currentSnapshot = captureSnapshot(state);
        state.redoStack.push(currentSnapshot);

        state.tabs = snapshot.tabs;
        state.sections = snapshot.sections;
        state.fields = snapshot.fields;
        state.validationRules = snapshot.validationRules;
        state.businessRules = snapshot.businessRules;
        state.tabOrder = snapshot.tabOrder;
        state.sectionOrder = snapshot.sectionOrder;
        state.fieldOrder = snapshot.fieldOrder;
        state.isDirty = true;
      })
    ),

  redo: () =>
    set(
      produce((state: DesignerState) => {
        const snapshot = state.redoStack.pop();
        if (!snapshot) return;

        const currentSnapshot = captureSnapshot(state);
        state.undoStack.push(currentSnapshot);

        state.tabs = snapshot.tabs;
        state.sections = snapshot.sections;
        state.fields = snapshot.fields;
        state.validationRules = snapshot.validationRules;
        state.businessRules = snapshot.businessRules;
        state.tabOrder = snapshot.tabOrder;
        state.sectionOrder = snapshot.sectionOrder;
        state.fieldOrder = snapshot.fieldOrder;
        state.isDirty = true;
      })
    ),

  markSaving: () => set({ isSaving: true }),

  // Applies partial ID resolutions after a failed mid-save, removing already-created
  // records from newIds so a retry doesn't re-create them (duplication prevention).
  markResolved: (resolvedIds) =>
    set(
      produce((state: DesignerState) => {
        applyResolvedIds(state, resolvedIds);
        state.newIds = state.newIds.filter(id => !(id in resolvedIds));
        // Keep isDirty=true and dirtyIds intact — the save hasn't finished
      })
    ),

  markSaved: (resolvedIds, resolvedThemeId) =>
    set(
      produce((state: DesignerState) => {
        if (resolvedIds) applyResolvedIds(state, resolvedIds);
        if (resolvedThemeId !== undefined && resolvedThemeId !== null) {
          state.designPayload.theme.id = resolvedThemeId;
        }
        state.isSaving = false;
        state.isDirty = false;
        state.dirtyIds = [];
        state.newIds = [];
        state.deletedIds = [];
        state.deletedEntityTypes = {};
        state.lastSavedAt = new Date();
        // Advance the E4 audit baseline to reflect the now-saved state.
        state.lastSavedAuditSnapshot = captureAuditSnapshot(state);
      })
    ),

  markPublishing: () => set({ isPublishing: true }),

  markPublished: () =>
    set(
      produce((state: DesignerState) => {
        state.isPublishing = false;
        state.isDirty = false;
        state.dirtyIds = [];
        state.newIds = [];
        state.deletedIds = [];
        state.deletedEntityTypes = {};
        state.lastSavedAt = new Date();
        if (state.form) state.form.status = 'published';
      })
    ),

  markDirty: (id, isNew = false) =>
    set(
      produce((state: DesignerState) => {
        if (!state.dirtyIds.includes(id)) state.dirtyIds.push(id);
        if (isNew && !state.newIds.includes(id)) state.newIds.push(id);
        state.isDirty = true;
      })
    ),

  markDeleted: (id) =>
    set(
      produce((state: DesignerState) => {
        if (!state.deletedIds.includes(id)) state.deletedIds.push(id);
        state.isDirty = true;
      })
    ),

  setPreviewMode: (mode) => set({ previewMode: mode }),
  setActiveCanvasTab: (tabId) => set({ activeCanvasTabId: tabId }),
}));

/** Convenience selectors */
export const selectActiveTabSections = (tabId: string) => (state: DesignerState) =>
  (state.sectionOrder[tabId] ?? []).map(id => state.sections[id]).filter(Boolean);

export const selectSectionFields = (sectionId: string) => (state: DesignerState) =>
  (state.fieldOrder[sectionId] ?? []).map(id => state.fields[id]).filter(Boolean);

export const selectCanUndo = (state: DesignerState) => state.undoStack.length > 0;
export const selectCanRedo = (state: DesignerState) => state.redoStack.length > 0;
