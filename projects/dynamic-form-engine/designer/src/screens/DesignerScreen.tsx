import React, { useCallback, useContext, useEffect } from 'react';
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
import { makeStyles, tokens, Spinner, Text } from '@fluentui/react-components';
import { useDesignerStore } from '@/state/designerStore';
import { ComponentToolbox } from '@/designer/toolbox/ComponentToolbox';
import { DesignerCanvas } from '@/designer/canvas/DesignerCanvas';
import { PropertiesPanel } from '@/designer/properties/PropertiesPanel';
import { DesignerCommandBar } from '@/designer/commandbar/DesignerCommandBar';
import { CrmContext } from '@/app/App';
import { FormSaveService } from '@/services/FormSaveService';
import { validateForDraftSave } from '@/validation/draftValidation';
import type { DesignerFieldModel } from '@/state/models/DesignerFormModel';
import { FIELD_TYPE_DEFINITIONS } from '@/constants/fieldTypes';

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

  const {
    form,
    tabs,
    sections,
    fields,
    validationRules,
    tabOrder,
    sectionOrder,
    fieldOrder,
    newIds,
    dirtyIds,
    deletedIds,
    isDirty,
    isSaving,
    addField,
    moveField,
    reorderFields,
    markSaving,
    markSaved,
    navigateTo,
  } = useDesignerStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    const handleAutoSave = () => void handleSaveDraft();
    window.addEventListener('formdesigner:autosave', handleAutoSave);
    return () => window.removeEventListener('formdesigner:autosave', handleAutoSave);
  });

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
        tabOrder,
        sectionOrder,
        fieldOrder,
        newIds,
        dirtyIds,
        deletedIds,
      });

      markSaved(resolvedIds);
    } catch (error) {
      console.error('Save draft failed:', error);
      useDesignerStore.setState({ isSaving: false });
    }
  }, [
    form, crmService, isSaving,
    tabs, sections, fields, validationRules,
    tabOrder, sectionOrder, fieldOrder,
    newIds, dirtyIds, deletedIds,
    markSaving, markSaved,
  ]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const activeData = active.data.current as Record<string, unknown> | undefined;

      if (activeData?.['source'] === 'toolbox') {
        const fieldType = String(activeData['fieldType'] ?? '');
        const overData = over.data.current as Record<string, unknown> | undefined;
        const targetSectionId = String(
          overData?.['sectionId'] ??
          (String(overId).startsWith('section-drop-') ? String(overId).replace('section-drop-', '') : overId)
        );
        const fieldDef = FIELD_TYPE_DEFINITIONS[fieldType as keyof typeof FIELD_TYPE_DEFINITIONS];
        if (!fieldDef || fieldDef.isLayout) return;

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

      if (activeId !== overId && fields[activeId]) {
        const field = fields[activeId];
        const overField = fields[overId];

        if (overField && field.sectionId === overField.sectionId) {
          const currentOrder = fieldOrder[field.sectionId] ?? [];
          const oldIndex = currentOrder.indexOf(activeId);
          const newIndex = currentOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = [...currentOrder];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            reorderFields(field.sectionId, newOrder);
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
    [fields, fieldOrder, addField, reorderFields, moveField]
  );

  const handleDragOver = useCallback((_event: DragOverEvent) => {}, []);
  const handleDragStart = useCallback((_event: DragStartEvent) => {}, []);

  const handlePublish = useCallback(() => navigateTo('publish-validation'), [navigateTo]);
  const handlePreview = useCallback(() => navigateTo('preview'), [navigateTo]);
  const handleVersionHistory = useCallback(() => navigateTo('version-history'), [navigateTo]);

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
      <DragOverlay />
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
