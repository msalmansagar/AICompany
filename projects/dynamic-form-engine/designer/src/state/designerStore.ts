import { create } from 'zustand';
import { produce } from 'immer';
import type {
  DesignerFormModel,
  DesignerTabModel,
  DesignerSectionModel,
  DesignerFieldModel,
} from './models/DesignerFormModel';
import type { DesignerValidationRule, DesignerBusinessRule } from './models/DesignerRuleModel';
import type { DesignerStyleModel } from './models/DesignerStyleModel';
import { DEFAULT_STYLE } from './models/DesignerStyleModel';

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
  | 'version-history';

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
  style: DesignerStyleModel;

  // Ordering
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;
  fieldOrder: Record<string, string[]>;

  // Dirty tracking
  dirtyIds: string[];
  newIds: string[];
  deletedIds: string[];

  // Undo/redo — max 50 entries
  undoStack: DesignerStateSnapshot[];
  redoStack: DesignerStateSnapshot[];

  // UI state
  selectedId: string | null;
  selectedType: CanvasItemType | null;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: Date | null;
  previewMode: PreviewBreakpoint | null;

  // Actions
  navigateTo: (screen: DesignerScreen) => void;
  loadForm: (
    form: DesignerFormModel,
    tabs: DesignerTabModel[],
    sections: DesignerSectionModel[],
    fields: DesignerFieldModel[],
    validationRules: DesignerValidationRule[],
    businessRules: DesignerBusinessRule[],
    style: DesignerStyleModel
  ) => void;
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

  // Style mutations
  updateStyle: (patch: Partial<DesignerStyleModel>) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Save state
  markSaving: () => void;
  markSaved: (resolvedIds?: Record<string, string>) => void;
  markPublishing: () => void;
  markPublished: () => void;
  markDirty: (id: string, isNew?: boolean) => void;
  markDeleted: (id: string) => void;

  // Preview
  setPreviewMode: (mode: PreviewBreakpoint | null) => void;
}

const MAX_UNDO_STACK_SIZE = 50;

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
  style: DEFAULT_STYLE,
  tabOrder: [],
  sectionOrder: {},
  fieldOrder: {},
  dirtyIds: [],
  newIds: [],
  deletedIds: [],
  undoStack: [],
  redoStack: [],
  selectedId: null,
  selectedType: null,
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  lastSavedAt: null,
  previewMode: null,

  navigateTo: (screen) => set({ currentScreen: screen }),

  loadForm: (form, tabs, sections, fields, validationRules, businessRules, style) => {
    const tabMap = Object.fromEntries(tabs.map(t => [t.id, t]));
    const sectionMap = Object.fromEntries(sections.map(s => [s.id, s]));
    const fieldMap = Object.fromEntries(fields.map(f => [f.id, f]));
    const validationRuleMap = Object.fromEntries(validationRules.map(r => [r.id, r]));
    const businessRuleMap = Object.fromEntries(businessRules.map(r => [r.id, r]));
    const ordering = buildInitialOrdering(tabs, sections, fields);

    set({
      form,
      tabs: tabMap,
      sections: sectionMap,
      fields: fieldMap,
      validationRules: validationRuleMap,
      businessRules: businessRuleMap,
      style,
      ...ordering,
      dirtyIds: [],
      newIds: [],
      deletedIds: [],
      undoStack: [],
      redoStack: [],
      selectedId: null,
      selectedType: null,
      isDirty: false,
      currentScreen: 'designer',
    });
  },

  resetDesigner: () =>
    set({
      form: null,
      tabs: {},
      sections: {},
      fields: {},
      validationRules: {},
      businessRules: {},
      style: DEFAULT_STYLE,
      tabOrder: [],
      sectionOrder: {},
      fieldOrder: {},
      dirtyIds: [],
      newIds: [],
      deletedIds: [],
      undoStack: [],
      redoStack: [],
      selectedId: null,
      selectedType: null,
      isDirty: false,
      currentScreen: 'form-list',
    }),

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

        // Remove all sections and their fields first
        const sectionIds = state.sectionOrder[id] ?? [];
        for (const sectionId of sectionIds) {
          const fieldIds = state.fieldOrder[sectionId] ?? [];
          for (const fieldId of fieldIds) {
            delete state.fields[fieldId];
            state.deletedIds.push(fieldId);
          }
          delete state.fieldOrder[sectionId];
          delete state.sections[sectionId];
          state.deletedIds.push(sectionId);
        }

        delete state.sectionOrder[id];
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
          delete state.fields[fieldId];
          state.deletedIds.push(fieldId);
        }
        delete state.fieldOrder[id];

        const tabId = section.tabId;
        state.sectionOrder[tabId] = (state.sectionOrder[tabId] ?? []).filter(sid => sid !== id);
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

  updateStyle: (patch) =>
    set(
      produce((state: DesignerState) => {
        Object.assign(state.style, patch);
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

  markSaved: (resolvedIds) =>
    set(
      produce((state: DesignerState) => {
        if (resolvedIds) {
          // Pass 1: rename keys in all maps
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

          // Pass 2: fix temp ID references still embedded in ordering arrays and model FK fields.
          // Pass 1 moves the map keys but leaves old temp IDs inside sectionOrder/fieldOrder value
          // arrays and inside section.tabId / field.sectionId — these must also be replaced.
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

        state.isSaving = false;
        state.isDirty = false;
        state.dirtyIds = [];
        state.newIds = [];
        state.deletedIds = [];
        state.lastSavedAt = new Date();
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
}));

/** Convenience selectors */
export const selectActiveTabSections = (tabId: string) => (state: DesignerState) =>
  (state.sectionOrder[tabId] ?? []).map(id => state.sections[id]).filter(Boolean);

export const selectSectionFields = (sectionId: string) => (state: DesignerState) =>
  (state.fieldOrder[sectionId] ?? []).map(id => state.fields[id]).filter(Boolean);

export const selectCanUndo = (state: DesignerState) => state.undoStack.length > 0;
export const selectCanRedo = (state: DesignerState) => state.redoStack.length > 0;
