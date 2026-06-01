import React, { useCallback, useContext, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { makeStyles, tokens, Spinner, Text } from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { ComponentToolbox } from '@/designer/toolbox/ComponentToolbox';
import { DesignerCanvas } from '@/designer/canvas/DesignerCanvas';
import { PropertiesPanel } from '@/designer/properties/PropertiesPanel';
import { DesignerCommandBar } from '@/designer/commandbar/DesignerCommandBar';
import { CrmContext } from '@/app/App';
import { FormSaveService } from '@/services/FormSaveService';
import { validateForDraftSave } from '@/validation/draftValidation';
import type { DesignerFieldModel, DesignerSectionModel, DesignerTabModel } from '@/state/models/DesignerFormModel';
import { FIELD_TYPE, FIELD_TYPE_DEFINITIONS } from '@/constants/fieldTypes';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  workArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  toolbox: {
    width: '260px',
    flexShrink: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  canvas: {
    flex: 1,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '24px',
  },
  properties: {
    width: '320px',
    flexShrink: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

function generateTempId(prefix: string): string {
  return `tmp_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function DesignerScreen(): React.ReactElement {
  const styles = useStyles();
  const crmService = useContext(CrmContext);
  const [activeOverlayLabel, setActiveOverlayLabel] = useState<string | null>(null);

  const {
    form,
    tabs,
    sections,
    fields,
    businessRules,
    validationRules,
    tabOrder,
    sectionOrder,
    fieldOrder,
    newIds,
    dirtyIds,
    deletedIds,
    isDirty,
    isSaving,
    activeCanvasTabId,
    deletedEntityTypes,
    addField,
    addSection,
    addTab,
    moveField,
    reorderFields,
    reorderTabs,
    markSaving,
    markSaved,
    navigateTo,
  } = useDesignerStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleSaveDraft = useCallback(async () => {
    if (!form || !crmService || isSaving) return;

    const validation = validateForDraftSave(form);
    if (!validation.isValid) return;

    markSaving();

    try {
      const webApi = crmService.getWebApi();
      const userContext = crmService.getUserContext();
      const saveService = new FormSaveService(webApi, userContext);

      const { resolvedIds } = await saveService.save({
        form,
        tabs,
        sections,
        fields,
        validationRules,
        businessRules,
        tabOrder,
        sectionOrder,
        fieldOrder,
        newIds,
        dirtyIds,
        deletedIds,
        deletedEntityTypes,
      });

      markSaved(resolvedIds);
    } catch (error) {
      console.error('Save draft failed:', error);
      useDesignerStore.setState({ isSaving: false });
    }
  }, [
    form, crmService, isSaving,
    tabs, sections, fields, validationRules, businessRules,
    tabOrder, sectionOrder, fieldOrder,
    newIds, dirtyIds, deletedIds, deletedEntityTypes,
    markSaving, markSaved,
  ]);

  // Fixed: stable dep array so the listener is not re-registered on every render
  useEffect(() => {
    const handler = () => void handleSaveDraft();
    window.addEventListener('formdesigner:autosave', handler);
    return () => window.removeEventListener('formdesigner:autosave', handler);
  }, [handleSaveDraft]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as Record<string, unknown> | undefined;
    const fieldType = String(data?.['fieldType'] ?? '');
    const def = fieldType ? FIELD_TYPE_DEFINITIONS[fieldType as keyof typeof FIELD_TYPE_DEFINITIONS] : undefined;
    setActiveOverlayLabel(def?.label ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveOverlayLabel(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const activeData = active.data.current as Record<string, unknown> | undefined;

      // ── Toolbox drop ──────────────────────────────────────────────────────
      if (activeData?.['source'] === 'toolbox') {
        const fieldType = String(activeData['fieldType'] ?? '');
        const fieldDef = FIELD_TYPE_DEFINITIONS[fieldType as keyof typeof FIELD_TYPE_DEFINITIONS];
        if (!fieldDef) return;

        // Layout: TAB type → add a new tab
        if (fieldType === FIELD_TYPE.TAB) {
          const newTab: DesignerTabModel = {
            id: generateTempId('tab'),
            formId: form?.id ?? '',
            label: `Tab ${tabOrder.length + 1}`,
            iconName: null,
            sortOrder: tabOrder.length,
            isVisible: true,
            requiresPreviousTabComplete: false,
          };
          addTab(newTab);
          return;
        }

        // Layout: SECTION_* types → add section to active tab
        if (fieldDef.isLayout) {
          const targetTabId = activeCanvasTabId ?? tabOrder[0];
          if (!targetTabId) return;

          const columnCount: 1 | 2 | 3 =
            fieldType === FIELD_TYPE.SECTION_1COL ? 1
            : fieldType === FIELD_TYPE.SECTION_3COL ? 3
            : 2; // 2COL, CARD, ACCORDION all default to 2

          const existingSections = sectionOrder[targetTabId] ?? [];
          const newSection: DesignerSectionModel = {
            id: generateTempId('section'),
            tabId: targetTabId,
            label: fieldDef.label,
            description: null,
            columnCount,
            isCollapsible: fieldType === FIELD_TYPE.SECTION_ACCORDION,
            isExpandedByDefault: true,
            isVisible: true,
            sortOrder: existingSections.length,
          };
          addSection(newSection);
          return;
        }

        // Regular field drop — resolve target section
        const overData = over.data.current as Record<string, unknown> | undefined;
        const targetSectionId = String(
          overData?.['sectionId'] ??
          (overId.startsWith('section-drop-') ? overId.replace('section-drop-', '') : overId)
        );
        if (!sections[targetSectionId] && !overId.startsWith('section-drop-')) return;

        const existingFieldIds = fieldOrder[targetSectionId] ?? [];
        const newField: DesignerFieldModel = {
          id: generateTempId('field'),
          sectionId: targetSectionId,
          label: fieldDef.label,
          code: `field_${Date.now()}`,
          fieldType,
          placeholder: '',
          helpText: '',
          isRequired: false,
          isReadOnly: false,
          isHidden: false,
          defaultValue: null,
          currencyCode: null,
          decimalPlaces: null,
          maxRows: null,
          sortOrder: existingFieldIds.length,
          columnSpan: 1,
          options: [],
          lookupConfig: null,
          componentKey: null,
        };
        addField(newField);
        return;
      }

      // ── Tab reorder ───────────────────────────────────────────────────────
      if (activeData?.['type'] === 'tab' && tabs[activeId] && tabs[overId]) {
        const oldIndex = tabOrder.indexOf(activeId);
        const newIndex = tabOrder.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          reorderTabs(arrayMove(tabOrder, oldIndex, newIndex));
        }
        return;
      }

      // ── Field reorder / move ──────────────────────────────────────────────
      if (activeId !== overId && fields[activeId]) {
        const field = fields[activeId];
        const overField = fields[overId];

        if (overField && field.sectionId === overField.sectionId) {
          const currentOrder = fieldOrder[field.sectionId] ?? [];
          const oldIndex = currentOrder.indexOf(activeId);
          const newIndex = currentOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1) {
            reorderFields(field.sectionId, arrayMove(currentOrder, oldIndex, newIndex));
          }
          return;
        }

        if (overField && field.sectionId !== overField.sectionId) {
          const targetOrder = fieldOrder[overField.sectionId] ?? [];
          const targetIndex = targetOrder.indexOf(overId);
          moveField(activeId, overField.sectionId, targetIndex >= 0 ? targetIndex : targetOrder.length);
        }
      }
    },
    [form, tabs, sections, fields, fieldOrder, sectionOrder, tabOrder, activeCanvasTabId,
     addField, addSection, addTab, reorderFields, reorderTabs, moveField]
  );

  const handleDragOver = useCallback((_event: DragOverEvent) => {}, []);

  const handlePublish = useCallback(() => navigateTo('publish-validation'), [navigateTo]);
  const handlePreview = useCallback(() => navigateTo('preview'), [navigateTo]);
  const handleVersionHistory = useCallback(() => navigateTo('version-history'), [navigateTo]);
  const handleBusinessRules = useCallback(() => navigateTo('rule-config'), [navigateTo]);
  const handleSubmissionMapping = useCallback(() => navigateTo('submission-mapping'), [navigateTo]);
  const handleThemeEditor = useCallback(() => navigateTo('theme-editor'), [navigateTo]);

  if (!form) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spinner label="Loading form..." />
      </div>
    );
  }

  const hasNoTabs = tabOrder.length === 0;
  const activeTabId = tabOrder[0] ?? null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className={styles.root}>
        <DesignerCommandBar
          formName={form.name}
          formStatus={form.status}
          isDirty={isDirty}
          isSaving={isSaving}
          onSaveDraft={() => void handleSaveDraft()}
          onPublish={handlePublish}
          onPreview={handlePreview}
          onVersionHistory={handleVersionHistory}
          onBusinessRules={handleBusinessRules}
          onSubmissionMapping={handleSubmissionMapping}
          onThemeEditor={handleThemeEditor}
          onBack={() => useDesignerStore.getState().navigateTo('form-list')}
        />
        <div className={styles.workArea}>
          <div className={styles.toolbox}>
            <ComponentToolbox />
          </div>
          <div className={styles.canvas}>
            {hasNoTabs ? (
              <EmptyCanvasPrompt />
            ) : (
              <DesignerCanvas
                tabs={tabs}
                sections={sections}
                fields={fields}
                tabOrder={tabOrder}
                sectionOrder={sectionOrder}
                fieldOrder={fieldOrder}
                activeTabId={activeTabId}
              />
            )}
          </div>
          <div className={styles.properties}>
            <PropertiesPanel />
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeOverlayLabel ? (
          <div style={{
            padding: '6px 14px',
            backgroundColor: tokens.colorBrandBackground,
            color: tokens.colorNeutralForegroundOnBrand,
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: tokens.shadow8,
            pointerEvents: 'none',
          }}>
            {activeOverlayLabel}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function EmptyCanvasPrompt(): React.ReactElement {
  const addTab = useDesignerStore(state => state.addTab);
  const tabOrder = useDesignerStore(state => state.tabOrder);

  const handleAddFirstTab = useCallback(() => {
    addTab({
      id: `tmp_tab_${Date.now()}`,
      formId: useDesignerStore.getState().form?.id ?? '',
      label: 'Tab 1',
      iconName: null,
      sortOrder: tabOrder.length,
      isVisible: true,
      requiresPreviousTabComplete: false,
    });
  }, [addTab, tabOrder.length]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 16,
      color: tokens.colorNeutralForeground3,
    }}>
      <Text size={400} weight="semibold">Your form canvas is empty</Text>
      <Text>Drag a Tab from the toolbox or click below to start designing</Text>
      <button onClick={handleAddFirstTab} style={{
        padding: '8px 20px',
        backgroundColor: tokens.colorBrandBackground,
        color: tokens.colorNeutralForegroundOnBrand,
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 14,
      }}>
        Add First Tab
      </button>
    </div>
  );
}
